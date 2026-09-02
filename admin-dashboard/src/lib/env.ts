import { z } from 'zod'

const schema = z.object({
  VITE_INSFORGE_URL: z.string().url(),
  VITE_INSFORGE_ANON_KEY: z.string().min(1),
})

const runtime = (window as Window & { __INSFORGE_RUNTIME_CONFIG__?: { apiBaseURL?: string; anonKey?: string } }).__INSFORGE_RUNTIME_CONFIG__
const parsed = schema.safeParse({
  ...import.meta.env,
  VITE_INSFORGE_URL: runtime?.apiBaseURL ?? import.meta.env.VITE_INSFORGE_URL,
  VITE_INSFORGE_ANON_KEY: runtime?.anonKey ?? import.meta.env.VITE_INSFORGE_ANON_KEY,
})

if (!parsed.success) {
  // Surface a clear message in the browser console so missing config is obvious.
  console.error(
    'Missing InsForge env vars. Copy .env.example to .env and fill VITE_INSFORGE_URL + VITE_INSFORGE_ANON_KEY.',
    parsed.error.flatten().fieldErrors,
  )
  throw new Error('Missing InsForge env vars')
}

export const env = parsed.data
