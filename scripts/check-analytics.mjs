import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const ignored = new Set(['scripts', 'node_modules']);
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

  assert(pkg.dependencies?.['posthog-js'], `${name}: posthog-js must be a production dependency`);
  assert(existsSync(helper), `${name}: missing analytics helper`);
  assert(existsSync(bootstrap), `${name}: missing analytics bootstrap`);
  assert(existsSync(document), `${name}: missing root HTML document`);

  const helperSource = readFileSync(helper, 'utf8');
  const bootstrapSource = readFileSync(bootstrap, 'utf8');
  const documentSource = readFileSync(document, 'utf8');
  assert(helperSource.includes('__INSFORGE_RUNTIME_CONFIG__'), `${name}: runtime config is not preferred`);
  assert(helperSource.includes('autocapture: false'), `${name}: unsafe autocapture must stay disabled`);
  assert(helperSource.includes('maskAllInputs: true'), `${name}: replay inputs must be masked`);
  assert(helperSource.includes('mask_personal_data_properties: true'), `${name}: PostHog person properties must be masked`);
  assert(helperSource.includes('sampleRate: replaySampleRate'), `${name}: replay sampling must remain stable per session`);
  assert(helperSource.includes('capture_performance: true'), `${name}: performance capture must be enabled`);
  assert(helperSource.includes('sanitize_properties'), `${name}: URLs and PII must be sanitized`);
  assert(helperSource.includes("process.env.NODE_ENV !== 'production'") || helperSource.includes('import.meta.env.PROD'), `${name}: analytics must be production-only`);
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
    assert(bootstrapSource.includes('DOMContentLoaded'), `${name}: Next analytics must retry after the synchronous runtime config loads`);
  } else {
    const moduleEntryIndex = documentSource.indexOf('<script type="module"');
    assert(moduleEntryIndex >= 0 && runtimeConfigIndex < moduleEntryIndex,
      `${name}: runtime config must load before the Vite module entry`);
    assert(/\bvite-ignore\b/.test(runtimeConfigAttributes),
      `${name}: runtime config script must opt out of Vite processing`);
  }
  assert(envExample.includes('POSTHOG_PROJECT_TOKEN'), `${name}: missing PostHog env documentation`);
  assert(!pkg.dependencies?.['@vercel/analytics'], `${name}: do not mix Vercel and PostHog analytics`);
}

const chatbotSources = [
  'components/sign-in-form.tsx',
  'components/sign-up-form.tsx',
  'app/api/documents/upload/route.ts',
  'app/api/workspaces/route.ts',
].map((path) => readFileSync(join(root, 'ai-pdf-chatbot', path), 'utf8')).join('\n');

assert(!/posthog\.(?:capture|identify)[\s\S]{0,300}\b(?:email|name|file_name|workspace_name)\b/i.test(chatbotSources),
  'ai-pdf-chatbot: analytics payload contains a direct PII field');

for (const [template, path] of [
  ['chatbot', 'components/chat-shell.tsx'],
  ['insight-flow-agent-chat', 'src/components/ChatPage.tsx'],
  ['ai-pdf-chatbot', 'app/chat/page.tsx'],
  ['ai-pdf-chatbot', 'app/chat/[chatId]/page.tsx'],
]) {
  assert(readFileSync(join(root, template, path), 'utf8').includes('data-private'),
    `${template}: conversation content must be excluded from session replay text capture`);
}

console.log(`Analytics contract validated for ${templates.length} templates.`);
