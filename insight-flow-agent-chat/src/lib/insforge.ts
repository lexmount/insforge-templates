import { createClient } from '@insforge/sdk';

const runtime = (window as Window & { __INSFORGE_RUNTIME_CONFIG__?: { apiBaseURL?: string; anonKey?: string } }).__INSFORGE_RUNTIME_CONFIG__;
const baseUrl = (runtime?.apiBaseURL ?? import.meta.env.VITE_INSFORGE_URL)?.trim().replace(/\/$/, '');
const anonKey = (runtime?.anonKey ?? import.meta.env.VITE_INSFORGE_ANON_KEY)?.trim();

export const connected = Boolean(baseUrl && anonKey);
export const insforgeBaseUrl = baseUrl ?? '';
export const insforge = connected ? createClient({ baseUrl, anonKey }) : null;
