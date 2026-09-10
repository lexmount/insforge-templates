/** Portable, user-scoped client. No wallet identity or pricing is accepted from callers. */
export interface CreditWallet { mode?: 'disabled' | 'shadow' | 'enforced'; userId: string; environmentId: string; balance: string; held: string; available: string }
export interface CreditEntry { id: string; kind: string; amount: string; balanceAfter: string; reason: string; requestId: string | null; createdAt: string }
export interface CreditPage { items: CreditEntry[]; nextCursor: string | null }
export class CreditsError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}
export async function responseError(response: Response): Promise<CreditsError> {
  const body = await response.json().catch(() => ({}));
  const code = body.error?.code ?? body.code ?? (typeof body.error === 'string' ? body.error : 'REQUEST_FAILED');
  return new CreditsError(code, body.error?.message ?? body.message ?? body.detail ?? code, response.status);
}
/** Whole credits have no decimal suffix; preserve fractional legacy values without rounding. */
export function formatCredits(value: string): string {
  const number = BigInt(value);
  const absolute = number < 0n ? -number : number;
  const fraction = String(absolute % 1000000n).padStart(6, '0').replace(/0+$/, '');
  return `${number < 0n ? '-' : ''}${absolute / 1000000n}${fraction ? `.${fraction}` : ''}`;
}
export function createCreditsClient(baseUrl = '/api/credits', fetcher: typeof fetch = fetch) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetcher(`${baseUrl}${path}`, { ...init, cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw await responseError(response);
    return response.json() as Promise<T>;
  }
  return {
    wallet: () => request<CreditWallet>('/wallet'),
    ledger: (cursor?: string) => request<CreditPage>(`/ledger?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
    // Retain this key until success or a definitive failure; reuse on network retries.
    redeem: (code: string, idempotencyKey: string) => request<CreditWallet>('/redeem', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ code }),
    }),
  };
}
