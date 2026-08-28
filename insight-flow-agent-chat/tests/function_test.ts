/// <reference lib="deno.ns" />

import configHandler from '../functions/insight-flow-config.ts';
import chatHandler from '../functions/insight-flow-chat.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('config endpoint requires a signed-in user token', async () => {
  const response = await configHandler(
    new Request('https://app.example.com/functions/insight-flow-config'),
  );
  assert(response.status === 401, `expected 401, received ${response.status}`);
});

Deno.test('chat endpoint requires a signed-in user token', async () => {
  const response = await chatHandler(
    new Request('https://app.example.com/functions/insight-flow-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    }),
  );
  assert(response.status === 401, `expected 401, received ${response.status}`);
});

Deno.test('authenticated config masks by default, reveals on request, and chat streams with the stored key', async () => {
  const apiKey = 'not-a-real-api-key-value';
  const stored = {
    base_url: 'https://flow.example.com',
    target_mode: 'model',
    target: 'research-agent',
    disable_tools: true,
    api_key: apiKey,
    updated_at: '2026-08-28T05:00:00.000Z',
  };
  const originalFetch = globalThis.fetch;
  let upstreamAuthorization = '';
  const upstreamCapture: { body: Record<string, unknown> | null } = {
    body: null,
  };
  const databaseCapture: { body: Record<string, unknown> | null } = {
    body: null,
  };
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname === '/api/auth/sessions/current') {
      return Promise.resolve(
        new Response(
          JSON.stringify({ user: { id: 'user-1', email: 'user@example.com' } }),
          {
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    }
    if (
      url.pathname.startsWith(
        '/api/database/records/insight_flow_agent_configs',
      )
    ) {
      if (request.method === 'PATCH') {
        return request.json().then((body) => {
          databaseCapture.body = body as Record<string, unknown>;
          return new Response(JSON.stringify([stored]), {
            headers: { 'Content-Type': 'application/json' },
          });
        });
      }
      return Promise.resolve(
        new Response(JSON.stringify([stored]), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (url.hostname === 'flow.example.com') {
      upstreamAuthorization = request.headers.get('Authorization') ?? '';
      return request.json().then((body) => {
        upstreamCapture.body = body as Record<string, unknown>;
        return new Response(
          'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n',
          {
            headers: {
              'Content-Type': 'text/event-stream',
              'X-GoClaw-Session-Key': 'session-2',
            },
          },
        );
      });
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  }) as typeof fetch;

  Deno.env.set('INSFORGE_BASE_URL', 'https://insforge.example.com');
  try {
    const configResponse = await configHandler(
      new Request('https://app.example.com/functions/insight-flow-config', {
        headers: { Authorization: 'Bearer user-jwt' },
      }),
    );
    const publicConfig = await configResponse.json();
    assert(
      configResponse.status === 200,
      `config request returned ${configResponse.status}`,
    );
    assert(
      publicConfig.apiKeyHint === '••••••••••••',
      'masked key hint was not returned',
    );
    assert(
      !JSON.stringify(publicConfig).includes(apiKey),
      'plaintext API key leaked from config endpoint',
    );
    assert(
      !('apiKey' in publicConfig),
      'full API key was returned by the default config endpoint',
    );

    const revealResponse = await configHandler(
      new Request('https://app.example.com/functions/insight-flow-config', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer user-jwt',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'reveal' }),
      }),
    );
    const revealed = await revealResponse.json();
    assert(
      revealResponse.status === 200,
      `reveal request returned ${revealResponse.status}`,
    );
    assert(
      revealed.apiKey === apiKey,
      'explicit reveal did not return the stored API key',
    );

    const chatResponse = await chatHandler(
      new Request('https://app.example.com/functions/insight-flow-chat', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer user-jwt',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: 'hello', sessionKey: 'session-1' }),
      }),
    );
    assert(
      chatResponse.status === 200,
      `chat request returned ${chatResponse.status}`,
    );
    assert(
      upstreamAuthorization === `Bearer ${apiKey}`,
      'stored key was not used upstream',
    );
    assert(
      upstreamCapture.body?.model === 'goclaw:research-agent',
      'stored model was not applied',
    );
    assert(
      upstreamCapture.body?.session_key === 'session-1',
      'session key was not forwarded',
    );
    assert(
      upstreamCapture.body?.tool_choice === 'none',
      'stored tool setting was not applied',
    );
    assert(
      chatResponse.headers.get('X-InsightFlow-Session-Key') === 'session-2',
      'session header was not mapped',
    );
    assert(
      (await chatResponse.text()).includes('data: [DONE]'),
      'SSE body was not passed through',
    );

    const replacementKey = 'replacement-api-key';
    const saveResponse = await configHandler(
      new Request('https://app.example.com/functions/insight-flow-config', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer user-jwt',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          insightFlowBaseUrl: 'https://flow.example.com',
          insightFlowApiKey: replacementKey,
          targetMode: 'model',
          target: 'research-agent',
          disableTools: false,
        }),
      }),
    );
    assert(
      saveResponse.status === 200,
      `save request returned ${saveResponse.status}`,
    );
    assert(
      databaseCapture.body?.api_key === replacementKey,
      'config save did not write the plaintext API key',
    );
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete('INSFORGE_BASE_URL');
  }
});
