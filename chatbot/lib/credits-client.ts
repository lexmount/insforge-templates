/** Portable, user-scoped client. No wallet identity or pricing is accepted from callers. */
export interface CreditWallet { mode?: 'disabled' | 'shadow' | 'enforced'; userId: string; environmentId: string; balance: string; held: string; available: string }
export interface CreditEntry { id: string; kind: string; amount: string; balanceAfter: string; reason: string; requestId: string | null; createdAt: string }
export interface CreditPage { items: CreditEntry[]; nextCursor: string | null }
export class CreditsError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}
export async function responseError(response: Response): Promise<CreditsError> {
  const parsed = await response.json().catch(() => null);
  const body = parsed && typeof parsed === 'object' ? parsed : {};
  const code = body.error?.code ?? body.code ?? (typeof body.error === 'string' ? body.error : 'REQUEST_FAILED');
  return new CreditsError(code, body.error?.message ?? body.message ?? body.detail ?? `Request failed (HTTP ${response.status}). Please try again.`, response.status);
}
/** Whole credits have no decimal suffix; preserve fractional legacy values without rounding. */
export function formatCredits(value: string): string {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) return '—';
  const number = BigInt(value);
  const absolute = number < 0n ? -number : number;
  const fraction = String(absolute % 1000000n).padStart(6, '0').replace(/0+$/, '');
  return `${number < 0n ? '-' : ''}${absolute / 1000000n}${fraction ? `.${fraction}` : ''}`;
}
export function createCreditsClient(baseUrl = '/api/credits', fetcher: typeof fetch = fetch) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetcher(`${baseUrl}${path}`, { ...init, cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw await responseError(response);
    return response.json().catch(() => { throw new CreditsError('INVALID_RESPONSE', 'Credits returned an invalid response. Please try again later.', 502); }) as Promise<T>;
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

export function creditsUnavailable(error: unknown) {
  return error instanceof CreditsError && (error.code === 'CREDITS_NOT_CONFIGURED' || error.status === 404);
}
export function creditsErrorMessage(error: unknown) {
  if (creditsUnavailable(error)) return 'Credits are not available for this application. You can return to chat.';
  if (error instanceof CreditsError && error.status === 401) return 'Your session expired. Sign in again to view your credits.';
  if (error instanceof CreditsError && error.status >= 500) return 'Credits are temporarily unavailable. Please try again later.';
  return error instanceof Error ? error.message : 'Unable to load credits. Please try again.';
}
/** Refresh through the oldest visible row so redemption does not collapse expanded history. */
export async function refreshCreditHistory(client: Pick<ReturnType<typeof createCreditsClient>, 'ledger'>, previous: CreditEntry[]) {
  const oldest = previous.at(-1)?.id;
  let page = await client.ledger();
  const items = [...page.items];
  const seen = new Set<string>();
  while (oldest && !items.some(item => item.id === oldest) && page.nextCursor && !seen.has(page.nextCursor)) {
    seen.add(page.nextCursor);
    page = await client.ledger(page.nextCursor);
    items.push(...page.items);
  }
  return { items, nextCursor: page.nextCursor };
}
export function redemptionKey() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') throw new Error('Code redemption requires a secure HTTPS connection. Open the secure application URL and try again.');
  return globalThis.crypto.randomUUID();
}
