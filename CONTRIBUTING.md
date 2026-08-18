# Contributing a template to the InsForge marketplace

Templates listed on https://insforge.dev/templates live in this repo. Adding one is a single PR.

## Quick start

1. Fork this repo and create a branch.
2. Add your template as a top-level subdirectory: `<your-slug>/`. The slug must match the `slug` you'll add to `registry.json` and must be `[a-z0-9-]+` (lowercase, digits, hyphens).
3. Inside `<your-slug>/`, include at minimum:
   - `package.json` (must parse and `npm install` cleanly)
   - `README.md` (describe what the template does + how to run it)
   - `LICENSE` (any open-source license; file required but contents not enforced)
   - `.env.example` (no real secrets — CI checks for common shapes)
   - Optional: `migrations/*.sql` (parse-checked by CI), `functions/<name>/index.ts` (`tsc --noEmit` checked)
4. Add a cover image at `assets/covers/<your-slug>.png` — 1280×800 recommended, ≤ 1 MB.
5. Add an entry to `registry.json`:

   ```json
   {
     "slug": "my-template",
     "name": "My Template",
     "description": "A one-line pitch.",
     "category": "ai",
     "framework": "nextjs",
     "features": ["auth", "ai"],
     "tags": ["my-tag"],
     "requiredCapabilities": ["ai.chat", "ai.streaming", "storage"],
     "cover": "assets/covers/my-template.png",
     "demo_url": "https://my-demo.us-east.insforge.app",
     "author": "Your Name",
     "added_at": "YYYY-MM-DD"
   }
   ```

   `requiredCapabilities` is optional. Declare only capabilities the template actually uses;
   Insight Flow rejects creation before provisioning when the active runtime cannot satisfy them.

6. Open the PR. CI (`Validate Registry`) must be green. A maintainer will review and merge.

## CI checks

- Registry schema (ajv, slug pattern, no duplicates)
- `package.json` parses as valid JSON (CI does **not** run `npm install` — we trust your local test + your committed `package-lock.json`)
- Migration SQL parses (via `pg-query-emscripten`)
- Edge function `index.ts` passes `tsc --noEmit`
- `LICENSE`, `README.md`, `.env.example`, and cover image all exist
- `.env.example` does not contain real-secret patterns
- Cover image ≤ 1 MB (PNG/SVG); 1280 × 800 recommended

## How updates ship

Merging to `main` triggers `.github/workflows/sync.yml`, which POSTs to cloud-backend's
`/admin/v1/templates/sync` endpoint. The marketplace UI shows the new template within ~10 seconds.

## Maintainer note

The sync workflow uses `TEMPLATE_SYNC_TOKEN` (repo secret). Set it in
**Settings → Secrets → Actions** before merging anything that should be
picked up by the marketplace.

## Local validation

```bash
cd scripts && npm install
node validate-registry.mjs ../registry.json ..
```
