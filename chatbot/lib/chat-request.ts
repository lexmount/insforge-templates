import { getAccessToken, getRefreshToken, setAuthCookies } from '@/lib/auth-cookies';
import { createInsforgeServerClient } from '@/lib/insforge';
import type { ChatOwner } from '@/lib/types';

export const CHAT_OWNER_REQUIRED_ERROR = 'Authentication required.';

async function resolveAccessToken(): Promise<string | null> {
  const accessToken = await getAccessToken();
  if (accessToken) return accessToken;

  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  const insforge = createInsforgeServerClient();
  const { data, error } = await insforge.auth.refreshSession({ refreshToken });

  if (error || !data?.accessToken || !data.refreshToken) {
    return null;
  }

  await setAuthCookies(data.accessToken, data.refreshToken);
  return data.accessToken;
}

export async function resolveChatOwnerContext(input: {
  userId?: string | null;
} = {}): Promise<{ owner: ChatOwner; accessToken: string } | null> {
  let accessToken = await resolveAccessToken();
  if (!accessToken) return null;
  let result = await createInsforgeServerClient({ accessToken }).auth.getCurrentUser();
  if (result.error) {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;
    const refreshed = await createInsforgeServerClient().auth.refreshSession({ refreshToken });
    if (refreshed.error || !refreshed.data?.accessToken || !refreshed.data.refreshToken) return null;
    accessToken = refreshed.data.accessToken;
    await setAuthCookies(accessToken, refreshed.data.refreshToken);
    result = await createInsforgeServerClient({ accessToken }).auth.getCurrentUser();
  }
  const user = result.data?.user;
  if (result.error || !user || (input.userId && input.userId !== user.id)) return null;
  return { owner: { userId: user.id }, accessToken };
}
