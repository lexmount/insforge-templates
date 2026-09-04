import posthog from 'posthog-js'

export type AnalyticsValue = string | number | boolean | null | undefined
export type AnalyticsProperties = Record<string, AnalyticsValue>

const PII_KEY = /(^|_)(email|e_mail|name|first_name|last_name|phone|mobile|address|password|token|secret|authorization|cookie|message|prompt|content|query)(_|$)/i
const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_KEYS = ['$current_url', '$referrer', '$initial_current_url', '$initial_referrer']

type RuntimeConfig = {
  posthogHost?: string
  posthogProjectToken?: string
  applicationId?: string
  environmentId?: string
  templateVersionId?: string
  releaseId?: string
}

declare global {
  interface Window {
    __INSFORGE_RUNTIME_CONFIG__?: RuntimeConfig
  }
}

function safeProperties(properties: AnalyticsProperties = {}): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => {
      if (value === undefined || PII_KEY.test(key)) return false
      return typeof value !== 'string' || !EMAIL_VALUE.test(value)
    }),
  ) as Record<string, string | number | boolean | null>
}

function sanitizePostHogProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...properties }
  for (const key of Object.keys(sanitized)) {
    if (!key.startsWith('$') && PII_KEY.test(key)) delete sanitized[key]
  }
  for (const key of URL_KEYS) {
    const value = sanitized[key]
    if (typeof value !== 'string') continue
    try {
      const url = new URL(value)
      url.search = ''
      url.hash = ''
      sanitized[key] = url.toString()
    } catch {
      delete sanitized[key]
    }
  }
  return sanitized
}

export function initializeAnalytics(): void {
  const runtime = window.__INSFORGE_RUNTIME_CONFIG__
  const token = runtime?.posthogProjectToken || import.meta.env.VITE_POSTHOG_PROJECT_TOKEN
  if (!import.meta.env.PROD || !token || posthog.__loaded) return

  const configuredRate = Number(import.meta.env.VITE_POSTHOG_REPLAY_SAMPLE_RATE ?? '0.1')
  const replaySampleRate = Number.isFinite(configuredRate) ? Math.min(1, Math.max(0, configuredRate)) : 0.1

  posthog.init(token, {
    api_host: runtime?.posthogHost || import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    autocapture: false,
    capture_pageview: 'history_change',
    capture_pageleave: true,
    capture_performance: true,
    person_profiles: 'identified_only',
    mask_personal_data_properties: true,
    sanitize_properties: sanitizePostHogProperties,
    session_recording: {
      sampleRate: replaySampleRate,
      maskAllInputs: true,
      maskTextSelector: '[data-private]',
      blockSelector: '[data-private]',
    },
    loaded(client) {
      client.register(
        safeProperties({
          application_id: runtime?.applicationId || import.meta.env.VITE_INSFORGE_APP_ID,
          environment_id: runtime?.environmentId || import.meta.env.VITE_INSFORGE_ENVIRONMENT_ID,
          template_id: import.meta.env.VITE_INSFORGE_TEMPLATE_ID,
          template_version_id: runtime?.templateVersionId || import.meta.env.VITE_INSFORGE_TEMPLATE_VERSION_ID,
          release_id: runtime?.releaseId || import.meta.env.VITE_INSFORGE_RELEASE_ID,
          environment: 'production',
        }),
      )
    },
  })
}

export function track(event: string, properties?: AnalyticsProperties): void {
  if (posthog.__loaded) posthog.capture(event, safeProperties(properties))
}

/** Identify only with an opaque application user ID; never pass email or profile properties. */
export function identify(userId: string): void {
  if (posthog.__loaded && userId && !EMAIL_VALUE.test(userId)) posthog.identify(userId)
}

export function resetAnalytics(): void {
  if (posthog.__loaded) posthog.reset()
}

export const analytics = {
  track,
  identify,
  reset: resetAnalytics,
  ctaClicked: (ctaId: string, location: string) => track('cta_clicked', { cta_id: ctaId, location }),
  formStarted: (formId: string) => track('form_started', { form_id: formId }),
  formSubmitted: (formId: string) => track('form_submitted', { form_id: formId }),
  signUpCompleted: () => track('sign_up_completed'),
  loginCompleted: () => track('login_completed'),
  purchaseCompleted: (transactionId: string, value?: number, currency?: string) =>
    track('purchase_completed', { transaction_id: transactionId, value, currency }),
}
