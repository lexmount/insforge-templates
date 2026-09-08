import { NextResponse } from 'next/server';
import { resolveChatOwnerContext } from '@/lib/chat-request';
import { clearAuthCookies } from '@/lib/auth-cookies';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const context = await resolveChatOwnerContext();
  const url = new URL(request.url);
  const returnTo = url.searchParams.get('returnTo') === '/credits' ? '/credits' : '/';
  if (!context) {
    await clearAuthCookies();
    return new NextResponse(null, { status: 303, headers: { Location: '/auth/sign-in', 'Cache-Control': 'no-store' } });
  }
  return new NextResponse(null, { status: 303, headers: { Location: returnTo, 'Cache-Control': 'no-store' } });
}
