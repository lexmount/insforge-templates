import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { BUILT_IN_PUBLISHING_CONTRACTS, validateSchema, validateTemplate } from '../validate-registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'));
const repoRoot = resolve(here, 'fixtures', 'repo');
const realRepoRoot = resolve(here, '../..');

function publishingFixture(packageJSON, extraFiles = {}) {
  const root = mkdtempSync(join(tmpdir(), 'insforge-template-validation-'));
  const subdir = join(root, 'native-template');
  mkdirSync(subdir, { recursive: true });
  writeFileSync(join(subdir, 'package.json'), JSON.stringify(packageJSON));
  writeFileSync(join(subdir, 'package-lock.json'), '{"lockfileVersion":3}');
  for (const [name, body] of Object.entries(extraFiles)) {
    const target = join(subdir, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
  }
  return root;
}

function entry(slug, overrides = {}) {
  return {
    slug,
    name: 'X',
    description: 'd',
    category: 'ai',
    framework: 'nextjs',
    publishingCompatibility: 'unsupported',
    publishingBlockers: ['No controlled publishing path'],
    features: [],
    tags: [],
    cover: `assets/covers/${slug}.png`,
    demo_url: null,
    author: 'X',
    added_at: '2026-01-01',
    ...overrides,
  };
}

describe('validateSchema', () => {
  it('accepts a valid entry', () => {
    expect(validateSchema(load('valid.json'))).toEqual({ ok: true, errors: [] });
  });

  it('rejects a missing required field', () => {
    const r = validateSchema(load('missing-name.json'));
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/name/i);
  });

  it('rejects duplicate slugs', () => {
    const r = validateSchema(load('duplicate-slug.json'));
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/duplicate/i);
  });

  it('rejects slugs with spaces or special chars', () => {
    const r = validateSchema(load('bad-slug.json'));
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/slug/i);
  });

  it('accepts supported capability declarations', () => {
    const r = validateSchema([
      entry('good-slug', {
        requiredCapabilities: ['ai.chat', 'ai.streaming', 'storage'],
      }),
    ]);
    expect(r).toEqual({ ok: true, errors: [] });
  });

  it('rejects unsupported or duplicate capability declarations', () => {
    for (const requiredCapabilities of [
      ['ai.chat', 'ai.chat'],
      ['ai.chat', 'cos.direct'],
    ]) {
      const r = validateSchema([
        entry('good-slug', { requiredCapabilities }),
      ]);
      expect(r.ok).toBe(false);
      expect(r.errors.join(' ')).toMatch(/requiredCapabilities/i);
    }
  });
});

describe('validateTemplate — filesystem', () => {
  it('accepts a well-formed template', async () => {
    expect(await validateTemplate(entry('good-slug'), repoRoot)).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('rejects when LICENSE is missing', async () => {
    const r = await validateTemplate(entry('missing-license-slug'), repoRoot);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/LICENSE/i);
  });

  it('rejects when .env.example contains a real-secret pattern', async () => {
    const r = await validateTemplate(entry('secret-leaker-slug'), repoRoot);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/secret/i);
  });

  it('rejects when subdir does not exist', async () => {
    const r = await validateTemplate(entry('phantom'), repoRoot);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/not found|exist/i);
  });

  it('rejects when cover file is missing', async () => {
    const r = await validateTemplate(
      entry('good-slug', { cover: 'assets/covers/missing.png' }),
      repoRoot,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/cover/i);
  });

  it('rejects cover paths that escape the repo via .. or absolute path', async () => {
    for (const bad of ['../../etc/passwd.png', '/etc/passwd.png', 'foo/../../etc']) {
      const r = await validateTemplate(entry('good-slug', { cover: bad }), repoRoot);
      expect(r.ok).toBe(false);
      expect(r.errors.join(' ')).toMatch(/must be a relative path inside the repo/i);
    }
  });

  it('accepts platform-managed AI source without provider bindings', async () => {
    const r = await validateTemplate(
      entry('good-slug', { requiredCapabilities: ['ai.chat'] }),
      repoRoot,
    );
    expect(r).toEqual({ ok: true, errors: [] });
  });

  it('rejects provider endpoints and keys in templates declaring AI capabilities', async () => {
    const r = await validateTemplate(
      entry('provider-bypass-slug', {
        cover: 'assets/covers/good-slug.png',
        requiredCapabilities: ['ai.chat'],
      }),
      repoRoot,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/direct OpenRouter endpoint/i);
    expect(r.errors.join(' ')).toMatch(/provider API key environment variable/i);
    expect(r.errors.join(' ')).toMatch(/InsForge Model Gateway/i);
  });

  it('does not impose the managed-AI contract on templates without ai capabilities', async () => {
    const r = await validateTemplate(
      entry('provider-bypass-slug', { cover: 'assets/covers/good-slug.png' }),
      repoRoot,
    );
    expect(r).toEqual({ ok: true, errors: [] });
  });

  it('rejects non-native templates without an actionable blocker', async () => {
    const r = await validateTemplate(
      entry('good-slug', { publishingBlockers: [] }),
      repoRoot,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/explain their publishing blockers/i);
  });

  it('rejects a native build profile that contradicts the framework or source', async () => {
		const root = publishingFixture({
			scripts: { build: 'vite build' },
			dependencies: { react: '1', vite: '1' },
		});
    const r = await validateTemplate(
			entry('native-template', {
        framework: 'nextjs',
        publishingCompatibility: 'native',
        publishingBlockers: [],
        buildProfile: 'vite-npm-v1',
				cover: '',
      }),
			root,
			{ publishingOnly: true },
    );
    expect(r.ok).toBe(false);
		expect(r.errors).toContain('native-template: vite-npm-v1 is incompatible with framework nextjs');
  });

	it('rejects conflicting lockfiles, package managers, lifecycle scripts, and workspaces', async () => {
		const root = publishingFixture({
			packageManager: 'yarn@1.22.0',
			workspaces: ['packages/*'],
			scripts: { build: 'vite build', prepare: 'husky' },
			dependencies: { react: '1', vite: '1' },
		}, { 'pnpm-lock.yaml': "lockfileVersion: '9.0'" });
		const r = await validateTemplate(entry('native-template', {
			framework: 'react', publishingCompatibility: 'native', publishingBlockers: [],
			buildProfile: 'vite-npm-v1', cover: '',
		}), root, { publishingOnly: true });
		expect(r.errors.join('\n')).toMatch(/pnpm-lock.yaml: conflicts/);
		expect(r.errors.join('\n')).toMatch(/packageManager must match/);
		expect(r.errors.join('\n')).toMatch(/workspaces are not supported/);
		expect(r.errors.join('\n')).toMatch(/lifecycle script prepare/);
	});

	it('rejects Next.js static profiles with runtime-only source', async () => {
		const root = publishingFixture({
			scripts: { build: 'next build' },
			dependencies: { next: '1', react: '1' },
		}, {
			'next.config.ts': "export default { output: 'export' }",
			'app/api/chat/route.ts': 'export async function POST() {}',
		});
		const r = await validateTemplate(entry('native-template', {
			framework: 'nextjs', publishingCompatibility: 'native', publishingBlockers: [],
			buildProfile: 'next-static-npm-v1', cover: '',
		}), root, { publishingOnly: true });
		expect(r.errors.join('\n')).toMatch(/requires a Node runtime/);
	});

	it('rejects Next.js static profiles without output export', async () => {
		const root = publishingFixture({
			scripts: { build: 'next build' },
			dependencies: { next: '1', react: '1' },
		}, { 'next.config.ts': 'export default {}' });
		const r = await validateTemplate(entry('native-template', {
			framework: 'nextjs', publishingCompatibility: 'native', publishingBlockers: [],
			buildProfile: 'next-static-npm-v1', cover: '',
		}), root, { publishingOnly: true });
		expect(r.errors.join('\n')).toMatch(/requires output: export/);
	});

	it('validates publishing contracts for platform-provided starter entries', async () => {
		expect(BUILT_IN_PUBLISHING_CONTRACTS).toEqual(expect.arrayContaining([
			expect.objectContaining({
				slug: 'todo', framework: 'nextjs',
				buildProfile: 'next-static-npm-v1', publishingCompatibility: 'native',
			}),
		]));
		for (const contract of BUILT_IN_PUBLISHING_CONTRACTS) {
			const r = await validateTemplate(contract, realRepoRoot, { publishingOnly: true });
			expect(r.errors, contract.slug).toEqual([]);
		}
	});
});

describe('validateTemplate — SQL', () => {
  it('accepts well-formed migration SQL', async () => {
    expect(await validateTemplate(entry('good-slug'), repoRoot)).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('rejects malformed migration SQL', async () => {
    const r = await validateTemplate(entry('bad-sql-slug'), repoRoot);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/sql|migration/i);
  });
});
