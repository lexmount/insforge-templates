# Credits acceptance

## Local automated checks

Run from `chatbot`: `npm ci`, `npm test`, `npm run typecheck`, `npm run build`.
Run from `scripts`: `npm ci`, `npm test`, `npm run validate`.
Run from the repository: `node scripts/check-analytics.mjs`.

Automated coverage includes exact microcredit formatting, stable redemption retry keys, cursor escaping, structured gateway errors, segmented SSE input, mandatory completion, partial-output failure, pre-stream insufficient balance, anonymous rejection, user/application spoof filtering, foreign-origin rejection, same-host deployment origin handling, verified owner resolution and expired-session refresh. The CI chatbot job runs the new tests and typecheck.

## Browser fixture check (2026-09-08)

A disposable local HTTP fixture supplied a test session, wallet and ledger to the actual Next.js application. Browser actions exercised the existing sign-in form and its httpOnly cookies, the chat header wallet link, available/reserved amounts, successful redemption (12 to 22 available credits), invalid code (balance unchanged), and the second history page. At a 375 × 812 viewport, `document.documentElement.scrollWidth` was 375: no horizontal overflow. Desktop layout was visually inspected. The origin regression discovered by this check is covered by an automated test.

This validates application UI and cookie proxy integration, not a real model or platform ledger.

## Cross-repository local integration (2026-09-08)

The actual template ran against the updated runtime on localhost:25441 and central PostgreSQL-backed credits service on localhost:25440. The runtime fixture issued a signed JWT through the existing sign-in form; subsequent profile and credits requests used the real JWT middleware. The wallet displayed 99.99809 available and 0.001232 reserved credits from runtime settlement tests. A platform-created redemption code added exactly 5 credits (104.99809 available) and a matching ledger entry. A new-key second redemption was rejected with no balance change.

Authentication fixture profile/sign-in data and the upstream model response are controlled local test data. Wallet, redemption, ledger, JWT checks and accounting are the real implementations. The complete runtime check below covers real authentication and persisted chat; commercial-model credentials remain unavailable.

## Complete runtime and persisted chat (2026-09-08)

The template then connected to the actual runtime server on localhost:25445, with all runtime migrations, PostgreSQL and PostgREST (localhost:25444). A real verified UUID user signed in through the normal template form. The unmodified chatbot migration was applied to this isolated database.

- Verified-registration grant appeared exactly once as +10 credits.
- A browser chat request returned the controlled gateway response `CREDITS_OK`. Available credits changed from 10 to 9.999887; the ledger recorded −0.000113 and held credits returned to zero.
- Reloading the conversation restored both messages from the database (chat `fb88e1c0-4a5d-41e2-aa5c-b79270450c8f`).
- Temporarily reducing that test user's available balance to zero caused the next chat request to show the explicit insufficient-credit guidance and history link, retain its input and produce no new answer. The balance was restored to 9.999887 immediately afterward.
- An HTTP session-refresh check supplied only a real runtime refresh cookie to `/auth/refresh`: it returned 303 to `/credits`, persisted new httpOnly access/refresh cookies, and those cookies successfully authenticated the wallet request.

All authentication, database persistence and credit accounting in this check used real implementations. The model provider was a controlled local LiteLLM-compatible endpoint, not a commercial model. A successful commercial model call remains pending credentials and must not be represented as completed by these results.

## Required live integration

Use a disposable application/environment on the updated runtime and platform services. Never connect test redemption/adjustment operations to production.

- Create and verify a new user: configured registration credits appear once.
- Redeem a code; retry with the same key; retry a new key: no duplicate grant.
- Send a real model request through the chatbot: completion is persisted and the wallet/history reflect actual usage.
- Use an insufficient wallet: no model output, a clear error and credit-history link appear.
- Disconnect a stream and inspect eventual server settlement; do not infer zero cost from disconnection.
- Check a second user, application and environment cannot access the first wallet.
- Verify disabled/shadow mode reports that requests do not deduct credits.
- Validate an unconfigured runtime reports that credits are not enabled, and an unavailable configured service reports a temporary failure.

Record actual runtime and platform acceptance in the coordinating PR before release. No paid top-up, referral or automatic renewal path is included.
