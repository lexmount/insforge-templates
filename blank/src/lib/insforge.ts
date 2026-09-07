import { createClient } from '@insforge/sdk'

type RuntimeConfig = { apiBaseURL?: string; anonKey?: string }

let client: ReturnType<typeof createClient> | undefined

export function getInsforgeConfig() {
  const runtime = (window as Window & { __INSFORGE_RUNTIME_CONFIG__?: RuntimeConfig }).__INSFORGE_RUNTIME_CONFIG__
  const baseUrl = (runtime?.apiBaseURL ?? import.meta.env.VITE_INSFORGE_BASE_URL)?.trim() ?? ''
  const anonKey = (runtime?.anonKey ?? import.meta.env.VITE_INSFORGE_ANON_KEY)?.trim() ?? ''
  return { baseUrl, anonKey, isConfigured: Boolean(baseUrl && anonKey) }
}

export function getInsforgeClient() {
  if (client) return client
  const { baseUrl, anonKey } = getInsforgeConfig()
  if (!baseUrl || !anonKey) throw new Error('InsForge runtime is not configured')
  client = createClient({ baseUrl, anonKey })
  return client
}
