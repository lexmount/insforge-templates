import { createClient } from '@insforge/sdk';

const baseUrl = import.meta.env.VITE_INSFORGE_URL?.trim().replace(/\/$/, '');
const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY?.trim();

export const connected = Boolean(baseUrl && anonKey);
export const insforgeBaseUrl = baseUrl ?? '';
export const insforge = connected ? createClient({ baseUrl, anonKey }) : null;
