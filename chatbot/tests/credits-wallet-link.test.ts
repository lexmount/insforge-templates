// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ wallet: vi.fn(), ledger: vi.fn() }));
vi.mock('../lib/credits-client', async importOriginal => ({ ...await importOriginal<typeof import('../lib/credits-client')>(), createCreditsClient: () => state }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement('a',props,children) }));
import { CreditsPanel, WalletLink } from '../components/credits-panel';
import { CreditsError } from '../lib/credits-client';
let node: HTMLDivElement; let root: Root;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); state.wallet.mockReset(); node=document.createElement('div');document.body.append(node);root=createRoot(node); });
afterEach(async () => {await act(async () => root.unmount());node.remove();vi.unstubAllGlobals();});
it('hides an unavailable integration and does not repeat wallet reads on refresh events', async () => {
 state.wallet.mockRejectedValue(new CreditsError('CREDITS_NOT_CONFIGURED','off',503));
 await act(async () => root.render(React.createElement(WalletLink)));
 expect(node.querySelector('a')).toBeNull();
 await act(async () => {window.dispatchEvent(new Event('credits:refresh'));});
 expect(state.wallet).toHaveBeenCalledTimes(1);
});
it('keeps malformed balances from crashing the chat header', async () => {
 state.wallet.mockResolvedValue({mode:'enforced',available:null});
 await act(async () => root.render(React.createElement(WalletLink)));
 expect(node.textContent).toContain('— credits');
});

it('retries transient 404 on focus and keeps an established link after a network error', async () => {
 state.wallet.mockRejectedValueOnce(new CreditsError('REQUEST_FAILED','gateway',404)).mockResolvedValueOnce({mode:'enforced',available:'1000000'}).mockRejectedValue(new Error('network'));
 await act(async () => root.render(React.createElement(WalletLink)));
 expect(node.querySelector('a')).toBeNull();
 await act(async () => window.dispatchEvent(new Event('focus')));
 expect(node.textContent).toContain('1 credits');
 await act(async () => window.dispatchEvent(new Event('credits:refresh')));
 expect(node.querySelector('a')).not.toBeNull();
});
it('shows the explicit unavailable panel for an unconfigured application', async () => {
 state.wallet.mockRejectedValue(new CreditsError('CREDITS_NOT_CONFIGURED','off',503));
 state.ledger.mockResolvedValue({items:[],nextCursor:null});
 await act(async () => root.render(React.createElement(CreditsPanel)));
 expect(node.querySelector('[role="status"]')?.textContent).toContain('Credits are not available');
 expect(node.querySelector('a')?.textContent).toBe('Back to chat');
});
it('keeps a valid balance when only history fails', async () => {
 state.wallet.mockResolvedValue({mode:'enforced',available:'2000000',held:'0'});
 state.ledger.mockRejectedValue(new CreditsError('REQUEST_FAILED','history',404));
 await act(async () => root.render(React.createElement(CreditsPanel)));
 expect(node.textContent).toContain('Available credits'); expect(node.querySelector('dd')?.textContent).toBe('2');
 expect(node.querySelector('[role="alert"]')).not.toBeNull();
});
