import { resolveChatOwnerContext } from '@/lib/chat-request';

export async function proxyCredits(request: Request, operation: 'wallet' | 'ledger' | 'redeem') {
  const context = await resolveChatOwnerContext();
  if (!context) return Response.json({ error: 'AUTHENTICATION_REQUIRED', message: 'Please sign in again.' }, { status: 401 });
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
  if (!baseUrl) return Response.json({ error: 'UNAVAILABLE', message: 'Credits are unavailable. Contact your administrator.' }, { status: 503 });
  const url = new URL(`/api/credits/${operation}`, baseUrl);
  const headers: Record<string, string> = { Authorization: `Bearer ${context.accessToken}` };
  let body: string | undefined;
  if (operation === 'ledger') {
    const query = new URL(request.url).searchParams;
    for (const key of ['limit', 'cursor']) if (query.has(key)) url.searchParams.set(key, query.get(key)!);
  }
  if (operation === 'redeem') {
    const origin = request.headers.get('origin');
    const requestHost = request.headers.get('host') ?? new URL(request.url).host;
    if (origin && (() => { try { return new URL(origin).host !== requestHost; } catch { return true; } })()) {
      return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
    }
    const input = await request.json().catch(() => null);
    if (typeof input?.code !== 'string' || !input.code.trim() || input.code.length > 256) return Response.json({ error: 'INVALID_CODE', message: 'Enter a valid redemption code.' }, { status: 400 });
    const key = request.headers.get('Idempotency-Key');
    if (!key || !/^[\x20-\x7e]{8,128}$/.test(key)) return Response.json({ error: 'INVALID_IDEMPOTENCY_KEY' }, { status: 400 });
    headers['Content-Type'] = 'application/json';
    headers['Idempotency-Key'] = key;
    body = JSON.stringify({ code: input.code.trim() });
  }
  try {
    const upstream = await fetch(url, { method: operation === 'redeem' ? 'POST' : 'GET', headers, body, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    return new Response(await upstream.text(), { status: upstream.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'UNAVAILABLE', message: 'Unable to reach credits. Try again with the same code.' }, { status: 503 });
  }
}
