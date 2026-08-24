# Threadline — Web Research Agent

A source-first research workspace built for InsForge and a Moli-compatible browser provider. Users frame a question, collect up to five public pages, receive a grounded synthesis, and retain every claim beside its supporting source.

## What is included

- Responsive React + Vite interface with a local showcase mode.
- InsForge email/password authentication.
- RLS-protected projects, sources, and claims.
- `research-run` Edge Function with URL validation, bounded fetches, AI synthesis, and explicit fetch-mode provenance.
- Required Lexmount/Moli browser provider for connected research runs.

## Browser provider contract

Set `LEXMOUNT_BROWSER_API_URL` and optionally `LEXMOUNT_BROWSER_API_KEY` on the Edge Function. The adapter sends:

```json
POST /v1/fetch
{"url":"https://example.com","output":"markdown","waitUntil":"done","maxBytes":250000}
```

Expected response:

```json
{"title":"Example","finalUrl":"https://example.com/","markdown":"# Example…"}
```

This small boundary keeps the application independent from a particular deployment topology. The provider must enforce DNS/IP policy, redirects, response limits, and timeouts. Do not expose CDP directly to the browser. When the provider is absent, connected research runs fail closed; local showcase mode remains available.

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

Without environment values, the UI opens with representative showcase data. With `VITE_INSFORGE_URL` and `VITE_INSFORGE_ANON_KEY`, it uses the installed schema and function.
