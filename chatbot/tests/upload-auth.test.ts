import { expect, it, vi } from 'vitest';
vi.mock('@/lib/chat-request', () => ({ resolveChatOwnerContext: vi.fn() }));
vi.mock('@/lib/insforge', () => ({ createInsforgeServerClient: vi.fn() }));
import { resolveChatOwnerContext } from '../lib/chat-request';
import { createInsforgeServerClient } from '../lib/insforge';
import { POST } from '../app/api/upload/route';
it('rejects anonymous uploads before parsing files', async () => {
  vi.mocked(resolveChatOwnerContext).mockResolvedValue(null);
  expect((await POST(new Request('https://app.test/api/upload', { method: 'POST' }))).status).toBe(401);
  expect(createInsforgeServerClient).not.toHaveBeenCalled();
});
it('uploads with the verified session so runtime storage policies apply', async () => {
  vi.mocked(resolveChatOwnerContext).mockResolvedValue({ owner: { userId: 'verified' }, accessToken: 'verified-token' });
  const uploadAuto = vi.fn().mockResolvedValue({ data: { key: 'test-key', url: 'https://storage.test/test' }, error: null });
  vi.mocked(createInsforgeServerClient).mockReturnValue({ storage: { from: () => ({ uploadAuto }) } } as never);
  const body = new FormData(); body.set('file', new File(['hello'], 'test.txt', { type: 'text/plain' }));
  expect((await POST(new Request('https://app.test/api/upload', { method: 'POST', body }))).status).toBe(200);
  expect(createInsforgeServerClient).toHaveBeenCalledWith({ accessToken: 'verified-token' });
});
