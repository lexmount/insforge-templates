import { expect, it, vi } from 'vitest';
vi.mock('@/lib/chat-request', () => ({ resolveChatOwnerContext: vi.fn() }));
vi.mock('@/lib/auth-cookies', () => ({ clearAuthCookies: vi.fn() }));
import { resolveChatOwnerContext } from '../lib/chat-request';
import { clearAuthCookies } from '../lib/auth-cookies';
import { GET } from '../app/auth/refresh/route';
it('returns to credits after persisting a refreshed session', async () => {
  vi.mocked(resolveChatOwnerContext).mockResolvedValue({ owner: { userId: 'user' }, accessToken: 'new-token' });
  const response = await GET(new Request('https://app.test/auth/refresh?returnTo=%2Fcredits'));
  expect(response.headers.get('location')).toBe('/credits');
});
it('does not allow an external return target', async () => {
  vi.mocked(resolveChatOwnerContext).mockResolvedValue({ owner: { userId: 'user' }, accessToken: 'token' });
  const response = await GET(new Request('https://app.test/auth/refresh?returnTo=https://attacker.test'));
  expect(response.headers.get('location')).toBe('/');
});
it('clears a failed session instead of creating a refresh redirect loop', async () => {
  vi.mocked(resolveChatOwnerContext).mockResolvedValue(null);
  const response = await GET(new Request('https://app.test/auth/refresh?returnTo=%2Fcredits'));
  expect(response.headers.get('location')).toBe('/auth/sign-in');
  expect(clearAuthCookies).toHaveBeenCalled();
});
