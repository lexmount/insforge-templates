import { createClient } from "@insforge/sdk";

const runtime = typeof window === "undefined" ? undefined :
  (window as Window & { __INSFORGE_RUNTIME_CONFIG__?: { apiBaseURL?: string; anonKey?: string } }).__INSFORGE_RUNTIME_CONFIG__;

export const insforge = createClient({
  baseUrl: runtime?.apiBaseURL ?? process.env.NEXT_PUBLIC_INSFORGE_URL ?? "https://placeholder.invalid",
  anonKey: runtime?.anonKey ?? process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ?? "anon_placeholder",
});
