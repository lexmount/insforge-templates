/// <reference lib="deno.ns" />

import handler from '../functions/insight-flow-chat.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('rejects a private upstream address before fetch', async () => {
  const response = await handler(
    new Request('https://app.example.com/functions/insight-flow-chat', {
      method: 'POST',
      headers: { Authorization: 'Bearer public-anon', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        insightFlowBaseUrl: 'https://127.0.0.1',
        insightFlowApiKey: 'goclaw_example_key',
        targetMode: 'model',
        target: 'research-agent',
        message: 'hello',
      }),
    }),
  );

  assert(response.status === 422, `expected 422, received ${response.status}`);
});

Deno.test('proxies the SSE body and maps model and session fields', async () => {
  const originalFetch = globalThis.fetch;
  let forwardedRequest: Request | null = null;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    forwardedRequest = new Request(input, init);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n',
          ),
        );
        controller.close();
      },
    });
    return Promise.resolve(
      new Response(body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'X-GoClaw-Session-Key': 'session-2',
        },
      }),
    );
  }) as typeof fetch;

  try {
    const response = await handler(
      new Request('https://app.example.com/functions/insight-flow-chat', {
        method: 'POST',
        headers: { Authorization: 'Bearer public-anon', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          insightFlowBaseUrl: 'https://flow.example.com/',
          insightFlowApiKey: 'goclaw_example_key',
          targetMode: 'model',
          target: 'research-agent',
          sessionKey: 'session-1',
          disableTools: true,
          message: 'hello',
        }),
      }),
    );

    assert(response.status === 200, `expected 200, received ${response.status}`);
    assert(response.headers.get('X-InsForge-Streaming') === 'true', 'missing streaming marker');
    assert(
      response.headers.get('X-InsightFlow-Session-Key') === 'session-2',
      'session header was not mapped',
    );
    assert(forwardedRequest !== null, 'upstream request was not made');
    const request = forwardedRequest as Request;
    assert(
      request.url === 'https://flow.example.com/v1/chat/completions',
      `unexpected upstream URL: ${request.url}`,
    );
    assert(
      request.headers.get('Authorization') === 'Bearer goclaw_example_key',
      'API key was not forwarded as bearer auth',
    );
    const payload = await request.json();
    assert(payload.model === 'goclaw:research-agent', 'model prefix was not normalized');
    assert(payload.session_key === 'session-1', 'session key was not forwarded');
    assert(payload.tool_choice === 'none', 'tool choice was not forwarded');
    assert((await response.text()).includes('data: [DONE]'), 'SSE body was not passed through');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
