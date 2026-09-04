import { initializeAnalytics } from './lib/analytics';

initializeAnalytics();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAnalytics, { once: true });
}
