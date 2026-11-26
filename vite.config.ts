import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { BRAND } from './src/config/brand';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

function manifest() {
  return {
    name: BRAND.name,
    short_name: BRAND.shortName,
    description: BRAND.description,
    id: './',
    start_url: './',
    scope: './',
    display: 'standalone',
    display_override: ['standalone', 'fullscreen'],
    orientation: 'any',
    background_color: BRAND.backgroundColor,
    theme_color: BRAND.themeColor,
    categories: ['books', 'lifestyle', 'utilities'],
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: 'icons/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Branding placeholders, web manifest and a precaching service worker generated from the final build output. */
function pwa(): Plugin {
  let outDir = 'dist';
  return {
    name: 'plot-tickens-pwa',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    transformIndexHtml(html) {
      return html
        .replace(/%BRAND_NAME%/g, BRAND.name)
        .replace(/%BRAND_SHORT%/g, BRAND.shortName)
        .replace(/%BRAND_DESCRIPTION%/g, BRAND.description)
        .replace(/%BRAND_THEME%/g, BRAND.themeColor);
    },
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.end(JSON.stringify(manifest(), null, 2));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(manifest(), null, 2) });
    },
    closeBundle() {
      const files = walk(outDir)
        .map((p) => relative(outDir, p).split(sep).join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !f.startsWith('screenshots/') && f !== '_headers' && f !== '_redirects')
        .filter((f) => !/\.woff$/.test(f)); // woff2 is universally supported by target browsers
      const hash = createHash('sha256');
      for (const f of files.sort()) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = `${pkg.version}-${hash.digest('hex').slice(0, 10)}`;
      const shell = files.filter((f) => !f.startsWith('data/q/'));
      const data = files.filter((f) => f.startsWith('data/q/'));
      const template = readFileSync('src/sw/sw-template.js', 'utf8');
      const sw = template
        .replace('__VERSION__', version)
        .replace('__SHELL__', JSON.stringify(['./', ...shell.filter((f) => f !== 'index.html')]))
        .replace('__DATA__', JSON.stringify(data));
      writeFileSync(join(outDir, 'sw.js'), sw);
      console.log(`[pwa] sw.js: version ${version}, ${shell.length} shell + ${data.length} data files precached`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), pwa()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: ['es2021', 'safari15'],
    assetsInlineLimit: 0,
    reportCompressedSize: false,
  },
});
