import { describe, expect, it, vi } from 'vitest';
import { createCreditsClient, formatCredits, responseError } from '../lib/credits-client';
import { createInsforgeAIProvider } from '../lib/ai/providers/insforge';

describe('credit SDK', () => {
  it('formats integer microcredits without float precision loss', () => {
    expect(formatCredits('9007199254740993123456')).toBe('9007199254740993.123456');
    expect(formatCredits('-1')).toBe('-0.000001');
    expect(formatCredits('1200000')).toBe('1.2');
  });
  it('only sends a code and stable retry key; escapes ledger cursor', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ items: [], nextCursor: null })));
    const client = createCreditsClient('/api/credits', fetcher);
    await client.redeem('welcome', 'stable-retry-key');
    await client.redeem('welcome', 'stable-retry-key');
    expect(fetcher.mock.calls[0]).toEqual(fetcher.mock.calls[1]);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ code: 'welcome' });
    await client.ledger('opaque?userId=other');
    expect(fetcher.mock.calls[2][0]).toContain('cursor=opaque%3FuserId%3Dother');
  });
  it('understands runtime and platform errors', async () => {
    expect(await responseError(Response.json({ error: 'INSUFFICIENT_CREDITS', message: 'Not enough credits' }, { status: 402 }))).toMatchObject({ code: 'INSUFFICIENT_CREDITS', status: 402, message: 'Not enough credits' });
    expect(await responseError(Response.json({ error: { code: 'EXPIRED', message: 'Expired code' } }, { status: 400 }))).toMatchObject({ code: 'EXPIRED' });
  });
});
async function consume(events: string[]) {
  const encoder = new TextEncoder();
  const fetcher = vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) { for (const event of events) controller.enqueue(encoder.encode(event)); controller.close(); } })));
  const provider = createInsforgeAIProvider({ baseUrl: 'https://runtime.test', accessToken: 'verified-session' }, fetcher);
  const stream = await provider.streamCompletion({ messages: [{ role: 'user', content: 'hello' }] });
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { chunks, fetcher };
}
describe('managed AI stream', () => {
  it('handles chunk boundaries and requires successful done', async () => {
    const { chunks, fetcher } = await consume(['data: {"chu', 'nk":"Hello"}\n\ndata: {"done":true}\n\n']);
    expect(chunks).toEqual(['Hello']);
    expect(fetcher.mock.calls[0][0]).toBe('https://runtime.test/api/ai/chat/completion');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer verified-session');
  });
  it('does not treat partial output followed by SSE failure as success', async () => {
    await expect(consume(['data: {"chunk":"Partial"}\n', 'data: {"error":true,"code":"UPSTREAM_ERROR","message":"Failed"}\n'])).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });
  it('rejects truncated streams instead of persisting them as complete', async () => {
    await expect(consume(['data: {"chunk":"Partial"}\n'])).rejects.toThrow('before completion');
  });
  it('preserves insufficient balance before stream begins', async () => {
    const provider = createInsforgeAIProvider({ baseUrl: 'https://runtime.test', accessToken: 'session' }, vi.fn().mockResolvedValue(Response.json({ error: 'INSUFFICIENT_CREDITS', message: 'Redeem credits' }, { status: 402 })));
    await expect(provider.streamCompletion({ messages: [] })).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS', status: 402 });
  });
});
