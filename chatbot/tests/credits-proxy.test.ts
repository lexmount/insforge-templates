import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/chat-request', () => ({ resolveChatOwnerContext: vi.fn() }));
import { resolveChatOwnerContext } from '../lib/chat-request';
import { proxyCredits } from '../lib/credits-proxy';
const auth = vi.mocked(resolveChatOwnerContext);
const request = (body: unknown, key = 'retry-key-123') => new Request('https://app.test/api/credits/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, Origin: 'https://app.test' }, body: JSON.stringify(body) });
beforeEach(() => { vi.restoreAllMocks(); process.env.NEXT_PUBLIC_INSFORGE_URL = 'https://runtime.test'; auth.mockResolvedValue({ owner: { userId: 'verified' }, accessToken: 'token' }); });
describe('user credits proxy', () => {
  it('rejects anonymous access without contacting runtime', async () => {
    auth.mockResolvedValue(null);
    const fetcher = vi.spyOn(globalThis, 'fetch');
    expect((await proxyCredits(request({ code: 'gift' }), 'redeem')).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not forward spoofed identity or application values', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ balance: '100' }));
    const result = await proxyCredits(request({ code: ' gift ', userId: 'victim', applicationId: 'other' }), 'redeem');
    expect(result.status).toBe(200);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ body: '{"code":"gift"}', headers: { Authorization: 'Bearer token', 'Idempotency-Key': 'retry-key-123' } });
  });
  it('requires valid key and code without calling backend', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    expect((await proxyCredits(request({ code: 'gift' }, 'short'), 'redeem')).status).toBe(400);
    expect((await proxyCredits(request({ code: '' }), 'redeem')).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('only forwards allowed ledger filters', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ items: [], nextCursor: null }));
    await proxyCredits(new Request('https://app.test/api/credits/ledger?userId=victim&limit=20&cursor=abc'), 'ledger');
    expect(String(fetcher.mock.calls[0][0])).toBe('https://runtime.test/api/credits/ledger?limit=20&cursor=abc');
  });
  it('accepts same-host origin when Next normalizes the internal URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ balance: '100' }));
    const incoming = request({ code: 'gift' }); incoming.headers.set('host', 'public.example.test'); incoming.headers.set('origin', 'https://public.example.test');
    expect((await proxyCredits(incoming, 'redeem')).status).toBe(200);
  });
  it('rejects foreign-origin redemption', async () => {
    const incoming = request({ code: 'gift' }); incoming.headers.set('Origin', 'https://attacker.test');
    expect((await proxyCredits(incoming, 'redeem')).status).toBe(403);
  });
});

it('preserves non-JSON upstream content types', async () => {
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('gateway unavailable',{status:502,headers:{'Content-Type':'text/plain'}}));
 const response=await proxyCredits(new Request('https://app.test/api/credits/wallet'),'wallet');
 expect(response.status).toBe(502);
 expect(response.headers.get('x-content-type-options')).toBe('nosniff');
 expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
});
