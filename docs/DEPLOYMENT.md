# Deploying to Cloudflare Pages

The app is fully static: `npm run build` writes everything to `dist/`, including the quotation database, the web manifest and the generated service worker.

## Option A: Git integration (recommended)

1. Push the repository to GitHub.
2. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Connect to Git** and choose the repository.
3. Build settings:
   * Framework preset: **None** (or Vite)
   * Build command: `npm run build`
   * Build output directory: `dist`
   * Environment variable: `NODE_VERSION` = `20` (or newer)
4. Save and deploy. Every push to the production branch redeploys, and pull requests get preview URLs.

The quotation database is committed under `public/data/`, so Cloudflare does **not** need to run the data pipeline.

## Option B: direct upload with Wrangler

```bash
npm ci
npm run build
npx wrangler login                       # one time
npx wrangler pages project create the-plot-tickens --production-branch main   # one time
npx wrangler pages deploy dist --project-name the-plot-tickens
```

`npm run deploy` runs the last two steps.

## Headers and caching

`public/_headers` is copied into `dist/` and applied by Pages:

* `sw.js`, `index.html`, `data/meta.json` and the manifest are `no-cache`, so new editions are picked up promptly.
* `assets/*` (hashed JS, CSS and fonts) and `data/q/*` (content-hashed shards) are `immutable` for one year.
* A strict Content-Security-Policy allows only same-origin resources, so the app makes no third-party requests.

## Custom domain

Add the domain under the Pages project's **Custom domains** tab. The app uses relative URLs (`base: './'`), so it also works from a sub-path.

## Updating the quotation database

```bash
npm run data:fetch     # once: sparse-clones Standard Ebooks repos, downloads Gutenberg texts into .corpus/
npm run data:import    # re-extract candidates (after changing the parser or importers)
npm run data:build     # merge → public/data/ + docs/coverage-report.md
npm test               # includes database integrity checks
git commit -am "Refresh quotation database" && git push
```

Installed copies download the new edition in the background and offer a **Reload** prompt. Unchanged shards are reused from the device cache.
