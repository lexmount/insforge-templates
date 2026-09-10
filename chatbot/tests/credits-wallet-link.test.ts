// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ wallet: vi.fn() }));
vi.mock('../lib/credits-client', async importOriginal => ({ ...await importOriginal<typeof import('../lib/credits-client')>(), createCreditsClient: () => state }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement('a',props,children) }));
import { WalletLink } from '../components/credits-panel';
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
