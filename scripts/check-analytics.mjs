import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const ignored = new Set(['scripts', 'node_modules']);
const legacySdkPrefix = ['post', 'hog'].join('');
const templates = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !ignored.has(entry.name))
  .map((entry) => entry.name)
  .filter((name) => existsSync(join(root, name, 'package.json')))
  .sort();

for (const name of templates) {
  const directory = join(root, name);
  const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const isNext = Boolean(pkg.dependencies?.next);
  const sourceRoot = existsSync(join(directory, 'src')) ? join(directory, 'src') : directory;
  const helper = isNext ? join(sourceRoot, 'lib/analytics.ts') : join(directory, 'src/lib/analytics.ts');
  const bootstrap = isNext ? join(sourceRoot, 'instrumentation-client.ts') : join(directory, 'src/main.tsx');
  const document = isNext ? join(sourceRoot, 'app/layout.tsx') : join(directory, 'index.html');
  const envExample = readFileSync(join(directory, '.env.example'), 'utf8');

  assert(existsSync(helper), `${name}: missing analytics helper`);
  assert(existsSync(bootstrap), `${name}: missing analytics bootstrap`);
  assert(existsSync(document), `${name}: missing root HTML document`);
  assert(!Object.keys(pkg.dependencies ?? {}).some((dependency) => dependency.startsWith(legacySdkPrefix)),
    `${name}: legacy analytics SDK must be removed`);

  const helperSource = readFileSync(helper, 'utf8');
  const bootstrapSource = readFileSync(bootstrap, 'utf8');
  const documentSource = readFileSync(document, 'utf8');
  assert(helperSource.includes('__INSFORGE_RUNTIME_CONFIG__'), `${name}: runtime config is not preferred`);
  assert(helperSource.includes('gaMeasurementId'), `${name}: runtime GA4 measurement ID is missing`);
  assert(helperSource.includes('googletagmanager.com/gtag/js'), `${name}: Google tag is not loaded`);
  assert(helperSource.includes('send_page_view: false'), `${name}: automatic and manual page views may be duplicated`);
  assert(helperSource.includes("'page_view'"), `${name}: page views are not captured`);
  assert(helperSource.includes('window.location.pathname'), `${name}: page paths are not sanitized`);
  assert(helperSource.includes('url.origin') && helperSource.includes('url.pathname'),
    `${name}: URL-valued event properties are not stripped of query strings`);
  assert(!helperSource.includes('window.location.href'), `${name}: raw URLs must not be reported`);
  assert(helperSource.includes("['pushState', 'replaceState']"), `${name}: SPA navigation is not captured`);
  assert(helperSource.includes("addEventListener('popstate'"), `${name}: browser back/forward is not captured`);
  assert(helperSource.includes('PII_KEY') && helperSource.includes('EMAIL_VALUE'), `${name}: PII guards are missing`);
  assert(helperSource.includes("window.gtag('set', analyticsContext)"), `${name}: application context is not registered`);
  assert(helperSource.includes("track('sign_up')"), `${name}: recommended sign_up event is missing`);
  assert(helperSource.includes("track('login')"), `${name}: recommended login event is missing`);
  assert(helperSource.includes("track('purchase'"), `${name}: recommended purchase event is missing`);
  assert(helperSource.includes("track('generate_lead'"), `${name}: recommended generate_lead event is missing`);
  assert(helperSource.includes("process.env.NODE_ENV !== 'production'") || helperSource.includes('import.meta.env.PROD'),
    `${name}: analytics must be production-only`);
  assert(bootstrapSource.includes('initializeAnalytics'), `${name}: analytics is not initialized`);

  const runtimeConfigMatch = documentSource.match(
    /<script\b([^>]*)src="\/\.well-known\/insforge-runtime-config\.js"([^>]*)>/,
  );
  assert(runtimeConfigMatch?.index !== undefined, `${name}: runtime config script is not loaded`);
  const runtimeConfigAttributes = `${runtimeConfigMatch[1]} ${runtimeConfigMatch[2]}`;
  assert(!/\b(?:async|defer)\b|type\s*=\s*["']module["']/.test(runtimeConfigAttributes),
    `${name}: runtime config script must be synchronous`);
  const runtimeConfigIndex = runtimeConfigMatch.index;
  if (isNext) {
    assert(runtimeConfigIndex < documentSource.indexOf('<body'), `${name}: runtime config must load in head before hydration`);
    assert(bootstrapSource.includes('DOMContentLoaded'), `${name}: Next analytics must retry after runtime config loads`);
    assert(envExample.includes('NEXT_PUBLIC_GA_MEASUREMENT_ID'), `${name}: missing Next.js GA4 env documentation`);
  } else {
    const moduleEntryIndex = documentSource.indexOf('<script type="module"');
    assert(moduleEntryIndex >= 0 && runtimeConfigIndex < moduleEntryIndex,
      `${name}: runtime config must load before the Vite module entry`);
    assert(/\bvite-ignore\b/.test(runtimeConfigAttributes),
      `${name}: runtime config script must opt out of Vite processing`);
    assert(envExample.includes('VITE_GA_MEASUREMENT_ID'), `${name}: missing Vite GA4 env documentation`);
  }
  assert(!pkg.dependencies?.['@vercel/analytics'], `${name}: do not mix analytics providers`);
}

const pdfClientSources = [
  'components/sign-in-form.tsx',
  'components/sign-up-form.tsx',
  'components/flashcards-modal.tsx',
  'components/share-chat-button.tsx',
].map((path) => readFileSync(join(root, 'ai-pdf-chatbot', path), 'utf8')).join('\n');

for (const call of pdfClientSources.matchAll(/analytics\.track\([^;]*\)/gs)) {
  assert(!/\b(?:email|name|file_name|workspace_name)\s*:/i.test(call[0]),
    'ai-pdf-chatbot: analytics payload contains a direct PII field');
}

console.log(`GA4 analytics contract validated for ${templates.length} templates.`);
