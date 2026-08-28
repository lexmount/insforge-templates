import { describe, expect, it } from 'vitest';
import { consumeInsightFlowSSE } from '../src/lib/stream';

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
});
