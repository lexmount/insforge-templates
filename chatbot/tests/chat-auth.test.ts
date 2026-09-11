import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/auth-cookies', () => ({ getAccessToken: vi.fn(), getRefreshToken: vi.fn(), setAuthCookies: vi.fn() }));
vi.mock('@/lib/insforge', () => ({ createInsforgeServerClient: vi.fn() }));
import { getAccessToken, getRefreshToken, setAuthCookies } from '../lib/auth-cookies';
import { createInsforgeServerClient } from '../lib/insforge';
import { resolveChatOwnerContext } from '../lib/chat-request';
const currentUser = vi.fn(); const refresh = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAccessToken).mockResolvedValue('session'); vi.mocked(getRefreshToken).mockResolvedValue(null);
  vi.mocked(createInsforgeServerClient).mockReturnValue({ auth: { getCurrentUser: currentUser, refreshSession: refresh } } as never);
  currentUser.mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null });
});
it('derives identity from verified session and rejects a forged owner', async () => {
  expect(await resolveChatOwnerContext()).toEqual({ owner: { userId: 'verified-user' }, accessToken: 'session' });
  expect(await resolveChatOwnerContext({ userId: 'someone-else' })).toBeNull();
});
it('rejects a supplied user ID without session', async () => {
  vi.mocked(getAccessToken).mockResolvedValue(null);
  expect(await resolveChatOwnerContext({ userId: 'verified-user' })).toBeNull();
  expect(currentUser).not.toHaveBeenCalled();
});
it('refreshes an expired access token and verifies replacement identity', async () => {
  vi.mocked(getRefreshToken).mockResolvedValue('refresh');
  currentUser.mockResolvedValueOnce({ data: null, error: { message: 'Expired' } });
  refresh.mockResolvedValue({ data: { accessToken: 'new-session', refreshToken: 'new-refresh' }, error: null });
  expect(await resolveChatOwnerContext()).toEqual({ owner: { userId: 'verified-user' }, accessToken: 'new-session' });
  expect(setAuthCookies).toHaveBeenCalledWith('new-session', 'new-refresh');
});
