# Driftwatch — Website Change Monitor

A calm monitoring desk for product pages, documentation, pricing, dependencies, and competitors. Driftwatch creates normalized page snapshots, records meaningful changes, and uses InsForge AI to summarize what moved.

## What is included

- Responsive React + Vite interface with representative showcase data.
- InsForge email/password authentication.
- RLS-protected targets, snapshots, and change records.
- `monitor-check` Edge Function with public-URL validation, bounded retrieval, deterministic hashes, and optional AI change classification.
- Manual “Check now” flow ready to be called by an authenticated scheduler or trusted job runner.

## Browser provider

The function uses the same server-side contract as the Web Research Agent:

```json
POST /v1/fetch
{"url":"https://example.com","output":"markdown","waitUntil":"done","maxBytes":250000}
```

Configure `LEXMOUNT_BROWSER_API_URL` and `LEXMOUNT_BROWSER_API_KEY`. Without a provider, connected checks fail closed; local showcase mode remains available. The provider owns DNS/IP policy, redirect validation, response limits, and timeouts.

Do not expose a raw CDP endpoint to the frontend. Scheduled execution should call the function through a trusted user/service context and preserve the target owner.

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

Without environment values, the UI starts in showcase mode. With InsForge values, it loads the installed schema and invokes the real Edge Function.
