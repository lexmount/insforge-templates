# Platform-managed analytics contract

Every official template ships with Google Analytics 4 (GA4) enabled for production builds.
InsForge creates one GA4 property and web data stream per application, then injects its public
measurement ID at runtime. Template users do not need to create a Google Analytics account, and
templates must never contain Google service-account credentials or a Measurement Protocol API
secret.

## Runtime configuration

The platform serves `/.well-known/insforge-runtime-config.js`; every template loads it synchronously
before the application bundle so it can inject `window.__INSFORGE_RUNTIME_CONFIG__`:

```ts
{
  gaMeasurementId: 'G-XXXXXXXXXX',
  applicationId: '...',
  environmentId: '...',
  templateVersionId: '...',
  releaseId: '...'
}
```

The analytics helper prefers this object and falls back to `NEXT_PUBLIC_GA_MEASUREMENT_ID` or
`VITE_GA_MEASUREMENT_ID` for standalone deployments. Missing configuration and non-production
builds are safe no-ops. A measurement ID is public; Google credentials remain platform-only.

## Event rules

Import `analytics` from the template's `lib/analytics` module. Use its semantic helpers when they
fit, or `analytics.track('domain_event', { safe_property: value })`. Conversion events must fire
only after the operation succeeds; payments must include their stable transaction ID.

Every template sends an initial `page_view` and another privacy-safe page view when a Next.js or
Vite SPA route changes. Page locations contain only origin and pathname; query strings and URL
fragments are never sent. The semantic helpers emit GA4-compatible events: `cta_click`,
`form_start`, `generate_lead`, `sign_up`, `login`, and `purchase`. Legacy event names passed to
`track` are mapped to these names so existing template calls remain compatible. Every event also
receives application, environment, template-version, and release context through the shared GA4
event context.

Never send names, emails, phone numbers, addresses, credentials, access tokens, form bodies,
prompts, message text, filenames, or raw URLs containing query parameters. `identify` accepts only
the application's opaque user ID and no user properties. The helper drops common PII property keys
and email-shaped values as a final guard, but this does not replace careful event design.

GA4 does not provide session replay, and official templates do not load a replay SDK or capture DOM
content. Run `node scripts/check-analytics.mjs` before publishing a template.
