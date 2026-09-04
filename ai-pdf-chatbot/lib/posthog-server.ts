import { PostHog } from 'posthog-node';

const PII_KEY = /(^|_)(email|e_mail|name|first_name|last_name|phone|mobile|address|password|token|secret|authorization|cookie|message|prompt|content|query|file_name)(_|$)/i;

export function getPostHogClient(): PostHog {
  const token = process.env.POSTHOG_PROJECT_TOKEN || process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || '';
  return new PostHog(token, {
    host: process.env.POSTHOG_HOST || process.env.NEXT_PUBLIC_POSTHOG_HOST,
    disabled: process.env.NODE_ENV !== 'production' || !token,
    flushAt: 1,
    flushInterval: 0,
    before_send(event) {
      if (!event) return null;
      const properties = Object.fromEntries(
        Object.entries(event.properties ?? {}).filter(([key]) => !PII_KEY.test(key)),
      );
      return {
        ...event,
        properties: {
          ...properties,
          application_id: process.env.INSFORGE_APPLICATION_ID,
          environment_id: process.env.INSFORGE_ENVIRONMENT_ID,
          template_version_id: process.env.INSFORGE_TEMPLATE_VERSION_ID,
          release_id: process.env.INSFORGE_RELEASE_ID,
        },
      };
    },
  });
}
