import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCreditsClient, CreditsError, creditsErrorMessage, creditsUnavailable, formatCredits, redemptionKey, refreshCreditHistory, responseError, type CreditEntry } from '../lib/credits-client';
import { chatFailure } from '../lib/chat-error';
afterEach(() => vi.unstubAllGlobals());
describe('review regressions', () => {
  it.each([null, undefined, '', '1.5', '1e6'])('shows unknown rather than crashing or inventing zero for %s', value => {
    expect(formatCredits(value as string)).toBe('—');
  });
  it.each([502, 504, 404])('handles non-JSON upstream HTTP %s', async status => {
    const error = await responseError(new Response('<html>gateway</html>', { status }));
    expect(error.message).toContain(`HTTP ${status}`);
    expect(creditsErrorMessage(error)).not.toContain('REQUEST_FAILED');
    expect(creditsUnavailable(error)).toBe(false);
  });
  it('only directs billing errors to the credits page and gives an explicit attachment recovery', () => {
    expect(chatFailure('INSUFFICIENT_CREDITS','x').action).toBe('credits');
    expect(chatFailure('UPSTREAM_ERROR','network').action).toBeNull();
    const media = chatFailure('UNSUPPORTED_BILLING_MODALITY','x');
    expect(media.action).toBe('new-chat');
    expect(media.message).toContain('earlier conversation');
    expect(media.message).toContain('preserved');
  });
  it('reports insecure redemption support with an actionable message', () => {
    vi.stubGlobal('crypto', {});
    expect(() => redemptionKey()).toThrow('HTTPS');
  });
  it('preserves expanded ledger history after a new redemption entry', async () => {
    const entry = (id: string) => ({ id } as CreditEntry);
    const ledger = vi.fn().mockResolvedValueOnce({ items: [entry('new'),entry('3')], nextCursor: 'c1' }).mockResolvedValueOnce({items:[entry('2'),entry('1')],nextCursor:'c2'});
    const page = await refreshCreditHistory({ ledger }, [entry('3'),entry('2'),entry('1')]);
    expect(page.items.map(v => v.id)).toEqual(['new','3','2','1']);
    expect(page.nextCursor).toBe('c2');
    expect(ledger).toHaveBeenCalledTimes(2);
  });
});

it.each([401, 400, 500])('preserves string chat errors for HTTP %s', async status => {
 const error = await responseError(Response.json({error:'Actual chat failure'}, {status}));
 expect(error.message).toBe('Actual chat failure');
});
it('reports malformed successful JSON responses and maps authentication/server failures', async () => {
 const client = createCreditsClient('/credits', vi.fn().mockResolvedValue(new Response('invalid')));
 await expect(client.wallet()).rejects.toMatchObject({code:'INVALID_RESPONSE',status:502});
 expect(creditsErrorMessage(new CreditsError('AUTH_REQUIRED','x',401))).toContain('Sign in again');
 expect(creditsErrorMessage(new CreditsError('UNAVAILABLE','x',503))).toContain('temporarily');
 expect(chatFailure(undefined,'').message).toContain('failed');
});
it('bounds and deduplicates history refresh when the old row cannot be found', async () => {
 let n=0;
 const ledger=vi.fn(async () => ({items:[{id:'duplicate'} as CreditEntry],nextCursor:`page-${++n}`}));
 const page=await refreshCreditHistory({ledger},[{id:'missing'} as CreditEntry]);
 expect(ledger).toHaveBeenCalledTimes(20); expect(page.items).toHaveLength(1); expect(page.nextCursor).toBe('page-20');
});

it('deduplicates repeated IDs inside the first history page',async()=>{
 const entry={id:'one'} as CreditEntry;
 const ledger=vi.fn().mockResolvedValue({items:[entry,entry],nextCursor:null});
 const result=await refreshCreditHistory({ledger},[]);
 expect(result.items).toEqual([entry]);expect(ledger).toHaveBeenCalledOnce();
});
