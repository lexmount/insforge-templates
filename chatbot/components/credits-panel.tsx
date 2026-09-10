'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { createCreditsClient, creditsUnavailable, creditsErrorMessage, refreshCreditHistory, redemptionKey, formatCredits, type CreditEntry, type CreditWallet } from '@/lib/credits-client';

const client = createCreditsClient();
const inputClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50';
export function WalletLink() {
  const [wallet, setWallet] = useState<CreditWallet | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    let revision = 0;
    let notConfigured = false;
    const refresh = () => {
      if (notConfigured) return;
      const current = ++revision;
      void client.wallet().then(value => { if (active && current === revision) setWallet(value); }).catch(failure => { if (active && current === revision) { setWallet(null); notConfigured = creditsUnavailable(failure); setUnavailable(notConfigured); } });
    };
    refresh();
    window.addEventListener('credits:refresh', refresh);
    return () => { active = false; window.removeEventListener('credits:refresh', refresh); };
  }, []);
  if (unavailable || !wallet) return null;
  return <Link href="/credits" className="max-w-48 truncate rounded-md px-2 py-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">{wallet && wallet.mode !== 'disabled' && wallet.mode !== 'shadow' ? `${formatCredits(wallet.available)} credits` : 'Credits'}</Link>;
}
export function CreditsPanel() {
  const [wallet, setWallet] = useState<CreditWallet | null>(null);
  const [entries, setEntries] = useState<CreditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [code, setCode] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const visibleEntries = useRef<CreditEntry[]>([]);
  visibleEntries.current = entries;
  const redemption = useRef<{ code: string; key: string } | null>(null);
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const balance = await client.wallet();
      setUnavailable(false);
      const page = await refreshCreditHistory(client, visibleEntries.current);
      setWallet(balance); setEntries(page.items); setCursor(page.nextCursor);
    } catch (failure) { setUnavailable(creditsUnavailable(failure)); setError(creditsErrorMessage(failure)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  async function redeem(event: FormEvent) {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || redeeming || loading || !wallet) return;
    setRedeeming(true); setError(''); setNotice('');
    try {
      if (redemption.current?.code !== trimmed) redemption.current = { code: trimmed, key: redemptionKey() };
      await client.redeem(trimmed, redemption.current.key); setCode(''); redemption.current = null;
      setNotice('Code redeemed. Your credits are available.');
      await reload();
    } catch (failure) { setError(creditsErrorMessage(failure)); }
    finally { setRedeeming(false); }
  }
  async function loadMore() {
    if (!cursor || paging) return;
    setPaging(true); setError('');
    try {
      const page = await client.ledger(cursor);
      setEntries(previous => [...previous, ...page.items.filter(item => !previous.some(existing => existing.id === item.id))]);
      setCursor(page.nextCursor);
    } catch (failure) { setError(creditsErrorMessage(failure)); }
    finally { setPaging(false); }
  }
  if (unavailable) return <p role="status">Credits are not available for this application. <Link href="/" className="underline">Back to chat</Link></p>;
  return <div className="space-y-8" data-private>
    {error ? <div role="alert" className="space-y-2 rounded-md border border-border p-4 text-sm"><p>{error}</p><div className="flex gap-4"><button type="button" onClick={() => void reload()} className="underline">Refresh balance</button>{error.includes('Your session expired') ? <Link href="/auth/sign-in" className="underline">Sign in</Link> : null}</div></div> : null}
    <section aria-labelledby="balance-heading" aria-busy={loading}>
      <h2 id="balance-heading" className="mb-3 text-lg font-semibold">Your balance</h2>
      {wallet ? <dl className="flex flex-wrap gap-x-10 gap-y-4">
        <div><dt className="text-sm text-muted-foreground">Available credits</dt><dd className="break-all text-2xl tabular-nums">{formatCredits(wallet.available)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Reserved for requests</dt><dd className="break-all text-2xl tabular-nums">{formatCredits(wallet.held)}</dd></div>
      </dl> : loading ? <p className="text-sm text-muted-foreground">Loading balance…</p> : <p className="text-sm">Balance unavailable.</p>}
      {wallet?.mode === 'disabled' || wallet?.mode === 'shadow' ? <p className="mt-3 text-sm">AI requests currently do not deduct your credits.</p> : null}
      <p className="mt-3 text-sm text-muted-foreground">Billable AI requests are rounded up to whole credits, with a minimum of 1 credit per request. Historical fractional balances remain exact.</p>
      <p className="mt-3 text-sm text-muted-foreground">Credits belong to this application and environment. Reserved credits settle after a request completes.</p>
    </section>
    <section aria-labelledby="redeem-heading" className="border-t border-border pt-6">
      <h2 id="redeem-heading" className="mb-2 text-lg font-semibold">Redeem a code</h2>
      <p className="mb-4 text-sm text-muted-foreground">Need more credits? Redeem a code or contact your application administrator.</p>
      <form onSubmit={redeem} className="max-w-lg space-y-2">
        <label htmlFor="credit-code" className="text-sm font-medium">Redemption code</label>
        <div className="flex flex-wrap gap-2"><input id="credit-code" className={`${inputClass} min-w-0 flex-1 basis-48`} value={code} onChange={event => setCode(event.target.value)} maxLength={256} autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={redeeming} required /><Button type="submit" disabled={loading || redeeming || !wallet || !code.trim()}>{redeeming ? 'Redeeming…' : 'Redeem code'}</Button></div>
      </form>
      <p role="status" className="mt-2 text-sm">{notice}</p>
    </section>
    <section aria-labelledby="ledger-heading" className="border-t border-border pt-6">
      <h2 id="ledger-heading" className="mb-4 text-lg font-semibold">Credit history</h2>
      {!loading && entries.length === 0 ? <p className="text-sm text-muted-foreground">No transactions yet. Grants, redemptions and AI usage will appear here.</p> : null}
      <ul className="divide-y divide-border">{entries.map(entry => <li key={entry.id} className="flex items-start justify-between gap-4 py-3">
        <div className="min-w-0"><p className="break-words text-sm font-medium">{entry.kind === 'redemption' ? 'Code redeemed' : entry.reason || entry.kind}</p><p className="text-xs text-muted-foreground"><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time> · {entry.kind}</p></div>
        <div className="max-w-[45%] break-all text-right text-sm tabular-nums"><p>{typeof entry.amount === 'string' && /^\d+$/.test(entry.amount) && BigInt(entry.amount) > 0n ? '+' : ''}{formatCredits(entry.amount)}</p><p className="text-xs text-muted-foreground">Balance {formatCredits(entry.balanceAfter)}</p></div>
      </li>)}</ul>
      {cursor ? <Button type="button" variant="outline" onClick={() => void loadMore()} disabled={paging || loading}>{paging ? 'Loading…' : 'Load older transactions'}</Button> : null}
    </section>
  </div>;
}
