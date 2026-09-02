import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const slug = process.argv[2];
const root = process.cwd();
const registry = JSON.parse(readFileSync(join(root, 'registry.json'), 'utf8'));
const builtInProfiles = { react: 'vite-npm-v1', todo: 'next-static-npm-v1' };
const entry = registry.find((item) => item.slug === slug)
  ?? (builtInProfiles[slug] ? { slug, publishingCompatibility: 'native', buildProfile: builtInProfiles[slug] } : null);
if (!entry || entry.publishingCompatibility !== 'native') throw new Error(`${slug}: not a native template`);
const output = entry.buildProfile.startsWith('vite-') ? 'dist' : 'out';
const outputRoot = join(root, slug, output);
if (!existsSync(join(outputRoot, 'index.html'))) throw new Error(`${slug}: ${output}/index.html missing`);
const html = readFileSync(join(outputRoot, 'index.html'), 'utf8');
if (!html.includes('/.well-known/insforge-runtime-config.js')) throw new Error(`${slug}: runtime config script missing from production HTML`);
const isSPA = entry.buildProfile.startsWith('vite-');
if (!isSPA && !existsSync(join(outputRoot, '404.html'))) throw new Error(`${slug}: static export must provide 404.html for non-SPA deep links`);

const secretPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\b/,
  /\b(?:sk_live_|xox[abp]-)[A-Za-z0-9-]{16,}\b/,
  /\bik_[A-Za-z0-9_-]{24,}\b/,
];
let files = 0;
const visit = (directory) => {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, item.name);
    if (item.isSymbolicLink()) throw new Error(`${slug}: production output contains symlink: ${file}`);
    if (item.isDirectory()) visit(file);
    else if (item.isFile()) {
      files += 1;
      const body = readFileSync(file);
      if (body.length > 20 * 1024 * 1024) throw new Error(`${slug}: output file exceeds 20 MiB: ${file}`);
      const text = body.toString('utf8');
      if (secretPatterns.some((pattern) => pattern.test(text))) throw new Error(`${slug}: production output contains credential material: ${file}`);
    }
  }
};
visit(outputRoot);
if (!files || statSync(outputRoot).isSymbolicLink()) throw new Error(`${slug}: invalid production output`);
const deepLinkResult = isSPA ? 'index.html (SPA fallback)' : '404.html (ordinary static routing)';
console.log(`${slug}: ${entry.buildProfile} admission passed (${files} files in ${output}; / => index.html; /admission-deep-link => ${deepLinkResult})`);
