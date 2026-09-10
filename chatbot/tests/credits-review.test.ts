import { afterEach, describe, expect, it, vi } from 'vitest';
import { creditsErrorMessage, creditsUnavailable, formatCredits, redemptionKey, refreshCreditHistory, responseError, type CreditEntry } from '../lib/credits-client';
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
    expect(creditsUnavailable(error)).toBe(status === 404);
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
