# Platform-managed analytics contract

Every official template ships with PostHog analytics enabled for production builds. InsForge creates
one PostHog project per application and injects the public project token at runtime. Template users
do not create a PostHog account and templates must never contain a `phx_` personal API key.

## Runtime configuration

The platform serves `/.well-known/insforge-runtime-config.js`; every template loads it synchronously
before the application bundle so it can inject `window.__INSFORGE_RUNTIME_CONFIG__`:

```ts
{
  posthogHost: 'https://us.i.posthog.com',
  posthogProjectToken: 'phc_...',
  applicationId: '...',
  environmentId: '...',
  templateVersionId: '...',
  releaseId: '...'
}
```

The analytics helper prefers this object and falls back to the documented `NEXT_PUBLIC_*` or
`VITE_*` variables for standalone deployments. Missing configuration and non-production builds are
safe no-ops.

## Event rules

Import `analytics` from the template's `lib/analytics` module. Use its semantic helpers when they
fit, or `analytics.track('domain_event', { safe_property: value })`. Conversion events must fire
only after the operation succeeds; payments must include their stable transaction ID.

The shared baseline is `cta_clicked`, `form_started`, `form_submitted`, `sign_up_completed`,
`login_completed`, and `purchase_completed`. PostHog supplies page views, page leaves, and web
performance measurements. Every event is registered with application, environment,
template-version, and release context.

Never send names, emails, phone numbers, addresses, credentials, access tokens, form bodies,
prompts, message text, filenames, or raw URLs containing query parameters. `identify` accepts only
the application's opaque user ID and no person properties. The helper drops common PII property
keys and email-shaped values as a final guard, but this does not replace careful event design.

Session replay defaults to a 10% client sample, masks all inputs, and masks/blocks elements marked
`data-private`. Add `data-private` to any region that renders customer content. Autocapture is off,
so product events remain stable when markup or copy changes.

Run `node scripts/check-analytics.mjs` before publishing a template.
