# Blank Web App

A minimal Vite + React starter for InsForge.

- `src/lib/insforge.ts` reads the public endpoint and anon key injected by the platform.
- Analytics is automatic in published releases and has a GA4 fallback for standalone hosting.
- `src/lib/ai.ts` is opt-in: call it only when the application's existing AI switch is enabled.
- `functions/ai-chat.ts` keeps provider credentials server-side and requires an authenticated user.

Run `npm install && npm run dev` for local development. Copy `.env.example` to `.env.local` when
working outside the managed InsForge workspace.
