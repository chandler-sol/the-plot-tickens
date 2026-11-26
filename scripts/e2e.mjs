/**
 * Browser checks + screenshots against the production build.
 *
 *   npm run build && npm run test:e2e
 *
 * Uses playwright-core with a locally installed Chrome/Chromium
 * (set CHROME_PATH, or install one with `npx playwright install chromium`).
 * Screenshots are written to docs/screenshots/.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;
const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));

// ---- pick interesting quotations from the built database
const meta = JSON.parse(readFileSync('dist/data/meta.json', 'utf8'));
let shortest = null;
let longest = null;
for (const f of meta.shardFiles) {
  const shard = JSON.parse(readFileSync(join('dist/data', f), 'utf8'));
  for (const [m, rows] of Object.entries(shard.minutes)) {
    for (const r of rows) {
      if (!shortest || r[1].length < shortest.len) shortest = { len: r[1].length, id: r[0], minute: Number(m), phrase: r[1].slice(r[2], r[3]) };
      if (!longest || r[1].length > longest.len) longest = { len: r[1].length, id: r[0], minute: Number(m), phrase: r[1].slice(r[2], r[3]) };
    }
  }
}
const missingMinute = meta.counts.findIndex((c) => c === 0);
const near = (target) => {
  for (let d = 0; d < 1440; d++) for (const m of [target + d, target - d]) if (meta.counts[(m + 1440) % 1440] >= 3) return (m + 1440) % 1440;
  return target;
};
const TYPICAL = near(15 * 60 + 2);
const EVENING = near(21 * 60 + 30);
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const VIEWPORTS = [
  { name: 'iphone-portrait', width: 390, height: 844, scale: 3, mobile: true },
  { name: 'iphone-landscape', width: 844, height: 390, scale: 3, mobile: true },
  { name: 'iphone-se', width: 375, height: 667, scale: 2, mobile: true },
  { name: 'ipad-portrait', width: 820, height: 1180, scale: 2, mobile: true },
  { name: 'ipad-landscape', width: 1180, height: 820, scale: 2, mobile: true },
  { name: 'desktop', width: 1440, height: 900, scale: 1, mobile: false },
];
const CASES = [
  { name: 'typical', query: `?at=${hhmm(TYPICAL)}` },
  { name: 'shortest', query: `?at=${hhmm(shortest.minute)}&quote=${encodeURIComponent(shortest.id)}`, id: shortest.id },
  { name: 'longest', query: `?at=${hhmm(longest.minute)}&quote=${encodeURIComponent(longest.id)}`, id: longest.id },
];

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview server did not start')), 30000);
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && (clearTimeout(t), resolve()));
});

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
  console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
};

const browser = await chromium.launch({ executablePath, args: ['--font-render-hinting=none'] });
try {
  for (const vp of VIEWPORTS) {
    for (const c of CASES) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.scale, isMobile: vp.mobile, hasTouch: vp.mobile });
      const page = await ctx.newPage();
      await page.goto(BASE + c.query);
      await page.waitForSelector('.quote__text, .fallback', { timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const stage = document.querySelector('.clock__stage');
        const text = document.querySelector('.quote__text');
        const fit = document.querySelector('.fitbox');
        const mark = document.querySelector('mark.tp');
        const se = document.scrollingElement;
        return {
          stageOverflow: stage ? stage.scrollHeight - stage.clientHeight : 0,
          fitOverflow: fit ? fit.scrollHeight - fit.clientHeight : 0,
          pageOverflow: se.scrollHeight - window.innerHeight,
          hOverflow: se.scrollWidth - window.innerWidth,
          fontSize: text ? parseFloat(getComputedStyle(text).fontSize) : 0,
          mark: mark ? mark.textContent : null,
          markWeight: mark ? getComputedStyle(mark).fontWeight : null,
          attr: document.querySelector('.quote__attr')?.textContent ?? null,
        };
      });
      const tag = `${vp.name}/${c.name}`;
      check(r.fontSize >= 11, `${tag}: quote font ${r.fontSize.toFixed(1)}px ≥ 11px`);
      check(r.stageOverflow <= 1 && r.fitOverflow <= 1, `${tag}: no clipped quotation (overflow ${r.fitOverflow}px)`);
      check(r.pageOverflow <= 1 && r.hOverflow <= 1, `${tag}: no page scrolling`);
      check(!!r.mark && Number(r.markWeight) >= 600, `${tag}: time phrase highlighted (“${r.mark}”)`);
      check(!!r.attr, `${tag}: attribution shown`);
      if (c.name === 'shortest') check(r.mark === shortest.phrase, `${tag}: requested quotation displayed`);
      await page.screenshot({ path: `${OUT}/${vp.name}-${c.name}.png` });
      await ctx.close();
    }
  }

  // Controls overlay, themes, library, settings (iPhone portrait)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE}?at=${hhmm(EVENING)}`);
    await page.waitForSelector('.quote__text');
    await page.locator('main.clock').click({ position: { x: 195, y: 420 } });
    await page.waitForTimeout(450);
    check(await page.locator('.controls[data-visible="true"]').count() === 1, 'tap reveals controls');
    // Regression: cycling quotations must re-fit each one to the screen, not to the previous quotation.
    const fill = () => page.evaluate(() => {
      const box = document.querySelector('.fitbox');
      const content = box.firstElementChild;
      const size = parseFloat(getComputedStyle(document.querySelector('.quote__text')).fontSize);
      return { ratio: content.scrollHeight / box.clientHeight, widthRatio: content.scrollWidth / box.clientWidth, size };
    });
    for (let i = 0; i < 6; i++) {
      await page.getByRole('button', { name: 'Next quotation' }).click();
      await page.waitForTimeout(250);
      const f = await fill();
      check(f.ratio > 0.45 || f.size >= 40, `next quotation ${i + 1} fills the screen (height ${(f.ratio * 100).toFixed(0)}%, ${f.size.toFixed(1)}px)`);
    }
    await page.screenshot({ path: `${OUT}/iphone-controls.png` });
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.waitForSelector('#settings-title');
    await page.screenshot({ path: `${OUT}/iphone-settings.png` });
    await page.getByRole('button', { name: /Midnight/ }).click();
    await page.getByRole('button', { name: 'Back to the clock' }).click();
    await page.waitForTimeout(800);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check(bg === 'rgb(15, 22, 38)', `theme change applied (${bg})`);
    await page.screenshot({ path: `${OUT}/iphone-midnight.png` });
    await page.reload();
    await page.waitForSelector('.quote__text');
    const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check(bg2 === 'rgb(15, 22, 38)', 'theme persists across reload');
    await page.goto(`${BASE}?at=${hhmm(EVENING)}#/library`);
    await page.getByRole('tab', { name: 'By time' }).click();
    await page.waitForSelector('.minute-grid');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/iphone-library-times.png` });
    await page.getByRole('tab', { name: 'Search' }).click();
    await page.getByLabel('Search the quotation library').fill('clock struck');
    await page.waitForTimeout(300);
    check((await page.locator('.qitem').count()) > 0, 'library search returns results');
    await page.screenshot({ path: `${OUT}/iphone-library-search.png` });
    await ctx.close();
  }

  // Bedside & OLED in landscape
  {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => localStorage.setItem('plot-tickens:settings', JSON.stringify({ displayMode: 'bedside', theme: 'oled' })));
    const page = await ctx.newPage();
    await page.goto(`${BASE}?at=02:15`);
    await page.waitForSelector('.quote__text, .fallback');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/iphone-landscape-bedside.png` });
    await ctx.close();
  }

  // Honest fallback for a minute without quotations
  if (missingMinute >= 0) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE}?at=${hhmm(missingMinute)}`);
    await page.waitForSelector('.fallback');
    check(true, `missing minute ${hhmm(missingMinute)} shows fallback`);
    await page.screenshot({ path: `${OUT}/iphone-fallback.png` });
    await ctx.close();
  }

  // Offline: after the service worker installs, reload with the network off.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}?at=08:45`);
    await page.waitForSelector('.quote__text, .fallback');
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
      return reg.active?.state;
    });
    // wait until the data shards are cached
    await page.waitForFunction(async () => {
      const keys = await caches.keys();
      const data = keys.find((k) => k.startsWith('data-'));
      return data ? (await (await caches.open(data)).keys()).length >= 24 : false;
    }, null, { timeout: 30000 });
    await ctx.setOffline(true);
    await page.goto(`${BASE}?at=23:10`);
    await page.waitForSelector('.quote__text, .fallback', { timeout: 10000 });
    check((await page.locator('.quote__text').count()) + (await page.locator('.fallback').count()) === 1, 'clock renders offline (different hour, served from cache)');
    await page.goto(`${BASE}#/library`);
    await page.getByRole('tab', { name: 'Search' }).click();
    await page.getByLabel('Search the quotation library').fill('midnight');
    await page.waitForTimeout(500);
    check((await page.locator('.qitem').count()) > 0, 'library search works offline');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${failures.length ? `${failures.length} check(s) failed` : 'all browser checks passed'}; screenshots in ${OUT}/ (${readdirSync(OUT).length} files)`);
process.exit(failures.length ? 1 : 0);
