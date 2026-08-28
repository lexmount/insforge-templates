/// <reference lib="deno.ns" />

import configHandler, { encryptApiKey } from '../functions/insight-flow-config.ts';
import chatHandler, { decryptApiKey } from '../functions/insight-flow-chat.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function withEncryptionKey(run: () => Promise<void>) {
  const previous = Deno.env.get('INSIGHT_FLOW_CONFIG_ENCRYPTION_KEY');
  const key = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of key) binary += String.fromCharCode(byte);
  Deno.env.set('INSIGHT_FLOW_CONFIG_ENCRYPTION_KEY', btoa(binary));
  try {
    await run();
  } finally {
    if (previous) Deno.env.set('INSIGHT_FLOW_CONFIG_ENCRYPTION_KEY', previous);
    else Deno.env.delete('INSIGHT_FLOW_CONFIG_ENCRYPTION_KEY');
  }
}

Deno.test('AES-GCM stored value round-trips without containing the API key', async () => {
  await withEncryptionKey(async () => {
    const apiKey = 'goclaw_super_secret_value';
    const encrypted = await encryptApiKey(apiKey);
    assert(!encrypted.encryptedApiKey.includes(apiKey), 'ciphertext contains plaintext API key');
    assert(encrypted.apiKeyIv.length > 0, 'IV was not generated');
    const decrypted = await decryptApiKey({
      base_url: 'https://flow.example.com',
      target_mode: 'model',
      target: 'research-agent',
      disable_tools: false,
      encrypted_api_key: encrypted.encryptedApiKey,
      api_key_iv: encrypted.apiKeyIv,
    });
    assert(decrypted === apiKey, 'decrypted API key does not match original');
  });
});

Deno.test('config endpoint requires a signed-in user token', async () => {
  const response = await configHandler(new Request('https://app.example.com/functions/insight-flow-config'));
  assert(response.status === 401, `expected 401, received ${response.status}`);
});

Deno.test('chat endpoint requires a signed-in user token', async () => {
  const response = await chatHandler(new Request('https://app.example.com/functions/insight-flow-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hello' }),
  }));
  assert(response.status === 401, `expected 401, received ${response.status}`);
});

Deno.test('authenticated chat decrypts server config and streams without exposing the key', async () => {
  await withEncryptionKey(async () => {
    const apiKey = 'not-a-real-api-key-value';
    const encrypted = await encryptApiKey(apiKey);
    const stored = {
      base_url: 'https://flow.example.com',
      target_mode: 'model',
      target: 'research-agent',
      disable_tools: true,
      encrypted_api_key: encrypted.encryptedApiKey,
      api_key_iv: encrypted.apiKeyIv,
      api_key_last_four: apiKey.slice(-4),
      updated_at: '2026-08-28T05:00:00.000Z',
    };
    const originalFetch = globalThis.fetch;
    let upstreamAuthorization = '';
    const upstreamCapture: { body: Record<string, unknown> | null } = { body: null };
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (url.pathname === '/api/auth/sessions/current') {
        return Promise.resolve(new Response(JSON.stringify({ user: { id: 'user-1', email: 'user@example.com' } }), {
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      if (url.pathname.startsWith('/api/database/records/insight_flow_agent_configs')) {
        return Promise.resolve(new Response(JSON.stringify([stored]), {
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      if (url.hostname === 'flow.example.com') {
        upstreamAuthorization = request.headers.get('Authorization') ?? '';
        return request.json().then((body) => {
          upstreamCapture.body = body as Record<string, unknown>;
          return new Response('data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n', {
            headers: { 'Content-Type': 'text/event-stream', 'X-GoClaw-Session-Key': 'session-2' },
          });
        });
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    }) as typeof fetch;

    Deno.env.set('INSFORGE_BASE_URL', 'https://insforge.example.com');
    try {
      const configResponse = await configHandler(new Request('https://app.example.com/functions/insight-flow-config', {
        headers: { Authorization: 'Bearer user-jwt' },
      }));
      const publicConfig = await configResponse.json();
      assert(configResponse.status === 200, `config request returned ${configResponse.status}`);
      assert(publicConfig.apiKeyHint === `••••${apiKey.slice(-4)}`, 'key hint was not returned');
      assert(!JSON.stringify(publicConfig).includes(apiKey), 'plaintext API key leaked from config endpoint');
      assert(!('encrypted_api_key' in publicConfig), 'ciphertext leaked from config endpoint');

      const chatResponse = await chatHandler(new Request('https://app.example.com/functions/insight-flow-chat', {
        method: 'POST',
        headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hello', sessionKey: 'session-1' }),
      }));
      assert(chatResponse.status === 200, `chat request returned ${chatResponse.status}`);
      assert(upstreamAuthorization === `Bearer ${apiKey}`, 'decrypted key was not used upstream');
      assert(upstreamCapture.body?.model === 'goclaw:research-agent', 'stored model was not applied');
      assert(upstreamCapture.body?.session_key === 'session-1', 'session key was not forwarded');
      assert(upstreamCapture.body?.tool_choice === 'none', 'stored tool setting was not applied');
      assert(chatResponse.headers.get('X-InsightFlow-Session-Key') === 'session-2', 'session header was not mapped');
      assert((await chatResponse.text()).includes('data: [DONE]'), 'SSE body was not passed through');
    } finally {
      globalThis.fetch = originalFetch;
      Deno.env.delete('INSFORGE_BASE_URL');
    }
  });
});
