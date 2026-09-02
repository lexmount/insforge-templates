import { createClient } from '@insforge/sdk';

let browserClient: ReturnType<typeof createClient> | null = null;

export function getInsforgeConfig() {
  const runtime = (window as Window & { __INSFORGE_RUNTIME_CONFIG__?: { apiBaseURL?: string; anonKey?: string } }).__INSFORGE_RUNTIME_CONFIG__;
  const baseUrl = (runtime?.apiBaseURL ?? import.meta.env.VITE_INSFORGE_BASE_URL)?.trim();
  const anonKey = (runtime?.anonKey ?? import.meta.env.VITE_INSFORGE_ANON_KEY)?.trim();

  return {
    baseUrl: baseUrl ?? '',
    anonKey: anonKey ?? '',
    isConfigured: Boolean(baseUrl),
  };
}

export function createInsforgeClient() {
  const { baseUrl, anonKey } = getInsforgeConfig();

  if (!baseUrl || !anonKey) {
    throw new Error(
      'Missing InsForge configuration. Set VITE_INSFORGE_BASE_URL and VITE_INSFORGE_ANON_KEY.',
    );
  }

  return createClient({ baseUrl, anonKey });
}

export function getInsforgeClient() {
  if (!browserClient) {
    browserClient = createInsforgeClient();
  }

  return browserClient;
}
