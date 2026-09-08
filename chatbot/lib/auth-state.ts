import 'server-only';
import { redirect } from 'next/navigation';

import type { UserSchema } from '@insforge/sdk';
import { getAccessToken, getRefreshToken } from '@/lib/auth-cookies';
import { createInsforgeServerClient } from '@/lib/insforge';
import type { AuthViewer } from '@/lib/types';

const UNAUTHENTICATED_VIEWER: AuthViewer = {
  isAuthenticated: false,
  id: null,
  email: null,
  name: null,
  avatarUrl: null,
};

function mapUserToViewer(user: UserSchema | null | undefined): AuthViewer {
  if (!user) return UNAUTHENTICATED_VIEWER;

  return {
    isAuthenticated: true,
    id: user.id,
    email: user.email,
    name: user.profile?.name?.trim() || null,
    avatarUrl: user.profile?.avatar_url?.trim() || null,
  };
}

export async function getCurrentViewer(returnTo: '/' | '/credits' = '/'): Promise<AuthViewer> {
  const accessToken = await getAccessToken();
  const refreshToken = await getRefreshToken();

  if (accessToken) {
    const insforge = createInsforgeServerClient({ accessToken });
    const { data, error } = await insforge.auth.getCurrentUser();

    if (!error && data.user) {
      return mapUserToViewer(data.user);
    }
  }

  if (refreshToken) {
    // Server Components cannot persist rotated cookies. Refresh in a Route Handler.
    redirect(`/auth/refresh?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return UNAUTHENTICATED_VIEWER;
}
