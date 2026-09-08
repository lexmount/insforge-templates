import { expect, it, vi } from 'vitest';
vi.mock('@/lib/insforge', () => ({ DEFAULT_SYSTEM_PROMPT: 'test', getConfiguredModel: () => undefined, getInsforgeServerClient: vi.fn(), createInsforgeServerClient: vi.fn() }));
vi.mock('@/lib/ai', () => ({ createAIProvider: vi.fn() }));
import { createInsforgeServerClient } from '../lib/insforge';
import { createAIProvider } from '../lib/ai';
import { streamMessage } from '../lib/chat-service';
it('continues consuming and persisting completed output when the downstream reader cancels', async () => {
  const chat = { id: 'chat-1', user_id: 'user-1', title: 'Test', created_at: '2026-09-08T00:00:00Z', last_message_at: '2026-09-08T00:00:00Z' };
  const saved = vi.fn();
  const client = { database: { from: (table: string) => {
    let inserted: Array<Record<string, unknown>> | null = null;
    const query = {
      select: () => inserted ? Promise.resolve({ data: inserted.map((row, index) => ({ ...row, id: `message-${index}` })), error: null }) : query,
      eq: () => query,
      maybeSingle: () => Promise.resolve({ data: chat, error: null }),
      order: () => Promise.resolve({ data: [], error: null }),
      insert: (rows: Array<Record<string, unknown>>) => { expect(table).toBe('chat_messages'); inserted = rows; saved(rows); return query; },
    };
    return query;
  } } };
  vi.mocked(createInsforgeServerClient).mockReturnValue(client as never);
  let complete!: () => void;
  const gate = new Promise<void>(resolve => { complete = resolve; });
  vi.mocked(createAIProvider).mockResolvedValue({ streamCompletion: async () => ({ async *[Symbol.asyncIterator]() { await gate; yield 'Completed answer'; } }) });
  const reader = (await streamMessage({ owner: { userId: 'user-1' }, chatId: 'chat-1', text: 'Hi', accessToken: 'session' })).getReader();
  await reader.read();
  await reader.cancel();
  complete();
  await vi.waitFor(() => expect(saved).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ content: 'Completed answer', role: 'assistant' })])));
});
