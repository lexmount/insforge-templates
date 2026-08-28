import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rawFetch: vi.fn() }));

vi.mock('../src/lib/insforge', () => ({
  insforgeBaseUrl: 'https://app.example.com',
  insforge: { getHttpClient: () => ({ rawFetch: mocks.rawFetch }) },
}));

import { consumeInsightFlowSSE, streamAgentReply } from '../src/lib/stream';

function chunkedStream(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('consumeInsightFlowSSE', () => {
  it('reassembles split OpenAI-compatible chunks and stops at DONE', async () => {
    const output: string[] = [];
    await consumeInsightFlowSSE(
      chunkedStream([
        'data: {"choices":[{"delta":{"content":"你',
        '好"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"，Agent"}}]}\r\n\r\n',
        'data: [DONE]\n\n',
        'data: {"choices":[{"delta":{"content":"ignored"}}]}\n\n',
      ]),
      (text) => output.push(text),
    );
    expect(output.join('')).toBe('你好，Agent');
  });

  it('supports structured text parts', async () => {
    const output: string[] = [];
    await consumeInsightFlowSSE(
      chunkedStream([
        'data: {"choices":[{"delta":{"content":[{"text":"A"},{"text":"B"}]}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
      (text) => output.push(text),
    );
    expect(output).toEqual(['AB']);
  });

  it('surfaces stream error payloads', async () => {
    await expect(
      consumeInsightFlowSSE(
        chunkedStream(['data: {"error":{"message":"agent denied"}}\n\n']),
        () => undefined,
      ),
    ).rejects.toThrow('agent denied');
  });

  it('rejects a truncated stream that never sends DONE', async () => {
    await expect(
      consumeInsightFlowSSE(
        chunkedStream(['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n']),
        () => undefined,
      ),
    ).rejects.toThrow('流式响应提前结束');
  });

  it('publishes the response session key before an aborted stream rejects', async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller.signal.addEventListener('abort', () => {
          streamController.error(new DOMException('Aborted', 'AbortError'));
        });
        streamController.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'));
      },
    });
    mocks.rawFetch.mockResolvedValueOnce(new Response(body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'X-InsightFlow-Session-Key': 'sess-42',
      },
    }));
    const sessions: Array<string | null> = [];
    const reply = streamAgentReply(
      { message: 'hello' },
      controller.signal,
      () => controller.abort(),
      (sessionKey) => sessions.push(sessionKey),
    );
    await expect(reply).rejects.toThrow();
    expect(sessions).toEqual(['sess-42']);
  });
});
