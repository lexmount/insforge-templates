import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: [
      'slug', 'name', 'description', 'category', 'framework',
      'features', 'tags', 'cover', 'author', 'added_at',
    ],
    properties: {
      slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,99}$' },
      name: { type: 'string', minLength: 1, maxLength: 200 },
      description: { type: 'string', minLength: 1 },
      category: { type: 'string', minLength: 1 },
      framework: { type: 'string', minLength: 1 },
      buildProfile: { enum: ['vite-npm-v1', 'vite-pnpm-v1', 'next-static-npm-v1', 'next-static-pnpm-v1'] },
      publishingCompatibility: { enum: ['native', 'conversion-required', 'requires-node-runtime', 'reference-only', 'unsupported'] },
      publishingBlockers: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } },
      features: { type: 'array', items: { type: 'string' } },
      tags: { type: 'array', items: { type: 'string' } },
      requiredCapabilities: {
        type: 'array',
        uniqueItems: true,
        items: {
          enum: [
            'ai.chat',
            'ai.streaming',
            'ai.tools',
            'ai.embeddings',
            'ai.image-generation',
            'ai.openrouter-plugins',
            'ai.thinking-suffix',
            'storage',
          ],
        },
      },
      cover: { type: 'string', minLength: 1 },
      demo_url: { type: ['string', 'null'], format: 'uri' },
      author: { type: 'string', minLength: 1, maxLength: 200 },
      added_at: { type: 'string', format: 'date' },
    },
  },
};

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(SCHEMA);

// Patterns that strongly indicate a real secret was committed.
// Surgical list — false positives block legit PRs.
const SECRET_PATTERNS = [
  /\bsk_live_[A-Za-z0-9]{16,}\b/,
  /\bphc_[A-Za-z0-9]{40,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bxox[abp]-[A-Za-z0-9-]{10,}\b/,
];

const PLATFORM_AI_SOURCE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json', '.vue', '.svelte',
  '.py', '.go', '.java', '.kt', '.swift', '.rb', '.php', '.sh', '.yaml', '.yml',
]);
const PLATFORM_AI_IGNORED_DIRECTORIES = new Set([
  '.git', '.next', 'build', 'coverage', 'dist', 'node_modules',
]);
const PLATFORM_AI_FORBIDDEN_BINDINGS = [
  { pattern: /https?:\/\/openrouter\.ai\b/i, label: 'direct OpenRouter endpoint' },
  { pattern: /https?:\/\/api\.deepseek\.com\b/i, label: 'direct DeepSeek endpoint' },
  { pattern: /https?:\/\/api\.openai\.com\b/i, label: 'direct OpenAI endpoint' },
  { pattern: /https?:\/\/api\.anthropic\.com\b/i, label: 'direct Anthropic endpoint' },
  { pattern: /https?:\/\/[^\s"']*litellm[^\s"']*/i, label: 'direct LiteLLM endpoint' },
  {
    pattern: /\b(?:OPENROUTER|DEEPSEEK|OPENAI|ANTHROPIC|GEMINI|DASHSCOPE|AI)_API_KEY\b/,
    label: 'provider API key environment variable',
  },
];

function platformAISourceFiles(root) {
  const files = [];
  const visit = (dir) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.isDirectory()) {
        if (!PLATFORM_AI_IGNORED_DIRECTORIES.has(item.name)) visit(join(dir, item.name));
        continue;
      }
      if (!item.isFile()) continue;
      const extension = item.name.slice(item.name.lastIndexOf('.'));
      if (
        (PLATFORM_AI_SOURCE_EXTENSIONS.has(extension) && item.name !== 'package-lock.json')
        || item.name.startsWith('.env')
      ) {
        files.push(join(dir, item.name));
      }
    }
  };
  visit(root);
  return files;
}

function validatePlatformManagedAI(entry, subdir) {
  if (!entry.requiredCapabilities?.some((capability) => capability.startsWith('ai.'))) {
    return [];
  }
  const errors = [];
  for (const file of platformAISourceFiles(subdir)) {
    const text = readFileSync(file, 'utf8');
    for (const binding of PLATFORM_AI_FORBIDDEN_BINDINGS) {
      if (binding.pattern.test(text)) {
        errors.push(
          `${entry.slug}/${file.slice(subdir.length + 1)}: ${binding.label} is forbidden; `
          + 'templates declaring ai.* must call the platform-managed InsForge Model Gateway',
        );
      }
    }
  }
  return errors;
}

export function validateSchema(registry) {
  const errors = [];
  if (!validate(registry)) {
    for (const e of validate.errors ?? []) {
      errors.push(`${e.instancePath || '(root)'} ${e.message}`);
    }
  }
  if (Array.isArray(registry)) {
    const seen = new Set();
    for (const entry of registry) {
      if (entry && typeof entry.slug === 'string') {
        if (seen.has(entry.slug)) {
          errors.push(`duplicate slug: ${entry.slug}`);
        }
        seen.add(entry.slug);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export async function validateTemplate(entry, repoRoot) {
  const errors = [];
  const subdir = join(repoRoot, entry.slug);
  if (!existsSync(subdir) || !statSync(subdir).isDirectory()) {
    errors.push(`${entry.slug}: subdirectory not found`);
    return { ok: false, errors };
  }
  const pkgPath = join(subdir, 'package.json');
	let pkg;
  if (!existsSync(pkgPath)) {
    errors.push(`${entry.slug}/package.json: missing`);
  } else {
    try {
			pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    } catch (e) {
      errors.push(`${entry.slug}/package.json: invalid JSON (${e.message})`);
    }
  }
	if (!entry.publishingCompatibility) {
		errors.push(`${entry.slug}: publishingCompatibility is required`);
	} else if (entry.publishingCompatibility === 'native') {
		if (!entry.buildProfile) errors.push(`${entry.slug}: native templates require a controlled buildProfile`);
		const pnpm = entry.buildProfile?.includes('-pnpm-');
		const lockfile = pnpm ? 'pnpm-lock.yaml' : 'package-lock.json';
		if (!existsSync(join(subdir, lockfile))) errors.push(`${entry.slug}/${lockfile}: required by ${entry.buildProfile}`);
		if (pnpm && !pkg?.packageManager?.startsWith('pnpm@')) errors.push(`${entry.slug}: packageManager must pin pnpm for a pnpm build profile`);
		const allowedBuildScripts = entry.buildProfile?.startsWith('vite-')
			? ['vite build', 'tsc -b && vite build', 'vue-tsc -b && vite build']
			: ['next build'];
		if (!allowedBuildScripts.includes(pkg?.scripts?.build)) errors.push(`${entry.slug}: build script is not allowed by ${entry.buildProfile}`);
	} else if ((entry.publishingCompatibility === 'requires-node-runtime' || entry.publishingCompatibility === 'conversion-required') && !entry.publishingBlockers?.length) {
		errors.push(`${entry.slug}: non-native templates must explain their publishing blockers`);
	}
  if (!existsSync(join(subdir, 'LICENSE'))) {
    errors.push(`${entry.slug}/LICENSE: missing`);
  }
  if (!existsSync(join(subdir, 'README.md'))) {
    errors.push(`${entry.slug}/README.md: missing`);
  }
  const envPath = join(subdir, '.env.example');
  if (!existsSync(envPath)) {
    errors.push(`${entry.slug}/.env.example: missing`);
  } else {
    const text = readFileSync(envPath, 'utf8');
    for (const re of SECRET_PATTERNS) {
      if (re.test(text)) {
        errors.push(`${entry.slug}/.env.example: looks like a real secret matched ${re}`);
        break;
      }
    }
  }
  if (entry.cover) {
    // Reject absolute paths or any `..` segment so a hostile registry entry
    // can't point cover at `/etc/passwd` or `../../some-secret/file.png`.
    // Cover must be a relative path inside the repo.
    if (
      entry.cover.startsWith('/') ||
      entry.cover.split(/[\\/]/).includes('..')
    ) {
      errors.push(
        `${entry.slug}: cover path ${entry.cover} must be a relative path inside the repo (no leading / or .. segments)`,
      );
    } else if (!existsSync(join(repoRoot, entry.cover))) {
      errors.push(`${entry.slug}: cover file ${entry.cover} not found`);
    }
  }
  errors.push(...validatePlatformManagedAI(entry, subdir));
  // SQL parse check
  const migrationsDir = join(subdir, 'migrations');
  if (existsSync(migrationsDir) && statSync(migrationsDir).isDirectory()) {
    const { default: PgQuery } = await import('pg-query-emscripten');
    const pg = await PgQuery();
    for (const file of readdirSync(migrationsDir)) {
      if (!file.endsWith('.sql')) continue;
      const text = readFileSync(join(migrationsDir, file), 'utf8');
      const result = pg.parse(text);
      if (result.error) {
        errors.push(
          `${entry.slug}/migrations/${file}: SQL parse error: ${result.error.message}`,
        );
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

// CLI: node validate-registry.mjs [registry-path] [repo-root]
if (import.meta.url === `file://${process.argv[1]}`) {
  // fileURLToPath handles Windows drive letters + URL-decoding correctly;
  // `new URL(...).pathname` mangles paths on Windows (leading slash, %xx escapes).
  const registryPath =
    process.argv[2] ?? fileURLToPath(new URL('../registry.json', import.meta.url));
  const repoRoot = process.argv[3] ?? fileURLToPath(new URL('../', import.meta.url));
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));

  const schemaResult = validateSchema(registry);
  const allErrors = [...schemaResult.errors];

  if (schemaResult.ok) {
    for (const entry of registry) {
      const r = await validateTemplate(entry, repoRoot);
      allErrors.push(...r.errors);
    }
  }

  if (allErrors.length > 0) {
    console.error('Registry validation FAILED:');
    for (const e of allErrors) console.error(`  - ${e}`);
    process.exit(1);
  } else {
    console.log(`Registry OK (${registry.length} templates).`);
  }
}
