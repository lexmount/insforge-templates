'use client';

export type AnalyticsValue = string | number | boolean | null | undefined;
export type AnalyticsProperties = Record<string, AnalyticsValue>;

const PII_KEY = /(^|_)(email|e_mail|name|first_name|last_name|phone|mobile|address|password|token|secret|authorization|cookie|message|prompt|content|query)(_|$)/i;
const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EVENT_ALIASES: Record<string, string> = {
  cta_clicked: 'cta_click',
  form_started: 'form_start',
  form_submitted: 'generate_lead',
  sign_up_completed: 'sign_up',
  login_completed: 'login',
  purchase_completed: 'purchase',
};

type RuntimeConfig = {
  gaMeasurementId?: string;
  applicationId?: string;
  environmentId?: string;
  templateVersionId?: string;
  releaseId?: string;
};

declare global {
  interface Window {
    __INSFORGE_RUNTIME_CONFIG__?: RuntimeConfig;
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __INSFORGE_GA4_NAVIGATION_TRACKING__?: boolean;
  }
}

let measurementId: string | undefined;
let lastPagePath: string | undefined;
let analyticsContext: Record<string, string | number | boolean> = {};

function safeProperties(properties: AnalyticsProperties = {}): Record<string, string | number | boolean> {
  const sanitized: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined || value === null || PII_KEY.test(key)) continue;
    if (typeof value !== 'string') {
      sanitized[key] = value;
      continue;
    }
    if (EMAIL_VALUE.test(value)) continue;
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        sanitized[key] = `${url.origin}${url.pathname}`;
        continue;
      } catch {
        continue;
      }
    }
    sanitized[key] = value.startsWith('/') ? value.split(/[?#]/, 1)[0] || '/' : value;
  }
  return sanitized;
}

function commonProperties(runtime: RuntimeConfig | undefined): AnalyticsProperties {
  return {
    application_id: runtime?.applicationId || process.env.NEXT_PUBLIC_INSFORGE_APP_ID,
    environment_id: runtime?.environmentId || process.env.NEXT_PUBLIC_INSFORGE_ENVIRONMENT_ID,
    template_id: process.env.NEXT_PUBLIC_INSFORGE_TEMPLATE_ID,
    template_version_id: runtime?.templateVersionId || process.env.NEXT_PUBLIC_INSFORGE_TEMPLATE_VERSION_ID,
    release_id: runtime?.releaseId || process.env.NEXT_PUBLIC_INSFORGE_RELEASE_ID,
    environment: 'production',
  };
}

function pagePath(): string {
  return window.location.pathname || '/';
}

function trackPageView(): void {
  if (!measurementId || !window.gtag) return;
  const path = pagePath();
  if (path === lastPagePath) return;
  lastPagePath = path;
  window.gtag('event', 'page_view', {
    ...analyticsContext,
    page_location: `${window.location.origin}${path}`,
    page_path: path,
    page_title: document.title,
  });
}

function installNavigationTracking(): void {
  if (window.__INSFORGE_GA4_NAVIGATION_TRACKING__) return;
  window.__INSFORGE_GA4_NAVIGATION_TRACKING__ = true;
  const notify = () => queueMicrotask(trackPageView);
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    history[method] = function (this: History, ...args: Parameters<History[typeof method]>) {
      const result = original.apply(this, args);
      notify();
      return result;
    } as History[typeof method];
  }
  window.addEventListener('popstate', notify);
}

export function initializeAnalytics(): void {
  const runtime = typeof window === 'undefined' ? undefined : window.__INSFORGE_RUNTIME_CONFIG__;
  const configuredId = runtime?.gaMeasurementId || process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (process.env.NODE_ENV !== 'production' || !configuredId || measurementId) return;

  measurementId = configuredId;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || ((...args: unknown[]) => window.dataLayer?.push(args));
  window.gtag('js', new Date());
  analyticsContext = safeProperties(commonProperties(runtime));
  window.gtag('set', analyticsContext);
  window.gtag('config', measurementId, { send_page_view: false });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(configuredId)}`;
  script.dataset.insforgeAnalytics = 'ga4';
  document.head.appendChild(script);

  installNavigationTracking();
  trackPageView();
}

export function track(event: string, properties?: AnalyticsProperties): void {
  if (!measurementId || !window.gtag) return;
  window.gtag('event', EVENT_ALIASES[event] || event, {
    ...safeProperties(properties),
    ...analyticsContext,
  });
}

/** Identify only with an opaque application user ID; never pass email or profile properties. */
export function identify(userId: string): void {
  if (!measurementId || !window.gtag || !userId || EMAIL_VALUE.test(userId)) return;
  window.gtag('config', measurementId, { user_id: userId, send_page_view: false });
}

export function resetAnalytics(): void {
  if (measurementId && window.gtag) {
    window.gtag('config', measurementId, { user_id: null, send_page_view: false });
  }
}

export const analytics = {
  track,
  identify,
  reset: resetAnalytics,
  ctaClicked: (ctaId: string, location: string) => track('cta_click', { cta_id: ctaId, location }),
  formStarted: (formId: string) => track('form_start', { form_id: formId }),
  formSubmitted: (formId: string) => track('generate_lead', { form_id: formId }),
  signUpCompleted: () => track('sign_up'),
  loginCompleted: () => track('login'),
  purchaseCompleted: (transactionId: string, value?: number, currency?: string) =>
    track('purchase', { transaction_id: transactionId, value, currency }),
};
