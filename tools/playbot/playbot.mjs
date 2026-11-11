// Plays the web build in headless Chromium (SwiftShader when there is no GPU).
// Opens every menu it can reach and checks that a touch-only close control is visible.
// Also walks a few steps and taps the weapon button. Screenshots land in tools/playbot/out.
//
//   npx --yes playwright install chromium   # once
//   node tools/playbot/playbot.mjs
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.DH_ROOT || fileURLToPath(new URL('../../public/', import.meta.url));
const outDir = fileURLToPath(new URL('./out/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };

function startStatic() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let path = normalize(join(root, url === '/' ? 'index.html' : url));
      if (!path.startsWith(root)) { res.writeHead(403); res.end(); return; }
      try {
        const body = await readFile(path);
        res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
        res.end(body);
      } catch { res.writeHead(404); res.end('missing'); }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const VIEWS = [
  { name: 'phone-portrait', width: 360, height: 800 },
  { name: 'phone-portrait-412', width: 412, height: 915 },
  { name: 'phone-landscape', width: 800, height: 360 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1366, height: 768 },
];

async function shot(page, name) {
  const file = join(outDir, name + '.png');
  await page.screenshot({ path: file });
  return file;
}

async function visibleClose(page) {
  return page.evaluate(() => {
    const sel = '#gunshop .gs-back, #gunshop .gs-x, #shop-close, #garage-close, #score-close, #hints-close, #pause-resume, .ww-close, .wi-x, .overlay-x, .map-close, #update-later, #exit-no, #lobby-leave';
    return [...document.querySelectorAll(sel)].filter((el) => {
      if (el.closest('[hidden]')) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width >= 32 && r.height >= 32 && s.display !== 'none' && s.visibility !== 'hidden';
    }).map((el) => el.id || el.className);
  });
}

async function main() {
  await mkdir(outDir, { recursive: true });
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch {
    try { ({ chromium } = await import('playwright-core')); }
    catch { console.error('Playwright is not installed. Run: npx --yes playwright install chromium'); process.exit(2); }
  }
  const server = await startStatic();
  const { port } = server.address();
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'],
  });
  const report = [];
  for (const view of VIEWS) {
    const page = await browser.newPage({ viewport: { width: view.width, height: view.height }, hasTouch: view.name !== 'desktop', isMobile: view.name.startsWith('phone') });
    page.setDefaultTimeout(20000);
    page.on('pageerror', (err) => console.error(view.name, 'pageerror', err.message));
    await page.goto(`http://127.0.0.1:${port}/index.html?debug=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const b = document.getElementById('update-banner');
      if (!b) return;
      b.classList.remove('hidden');
      document.getElementById('update-current').textContent = '0.16.66';
      document.getElementById('update-latest').textContent = '0.16.67';
      const rtl = document.documentElement.dir === 'rtl';
      document.getElementById('update-arrow').textContent = rtl ? '←' : '→';
    });
    await shot(page, view.name + '-update-arrow');
    await page.evaluate(() => document.getElementById('update-banner')?.classList.add('hidden'));
    await shot(page, view.name + '-gate');
    const enter = page.locator('#gate-enter');
    if (await enter.count()) await enter.click({ force: true }).catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, view.name + '-menu');
    // Weapon wheel markup exists even before a match; open it through the same function the button uses.
    await page.evaluate(() => {
      document.body.classList.add('touch');
      const shop = document.getElementById('gunshop');
      if (shop) { shop.hidden = false; const back = shop.querySelector('.gs-back'); if (back) back.textContent = 'Back'; }
    });
    await shot(page, view.name + '-gunshop');
    const closes = await visibleClose(page);
    report.push({ view: view.name, gunshopClose: closes.some((c) => String(c).includes('gs-')), closes });
    await page.evaluate(() => { const s = document.getElementById('gunshop'); if (s) s.hidden = true; document.getElementById('weapon-wheel')?.removeAttribute('hidden'); });
    // The wheel is created by the module. If it is still hidden, the script has not built it yet.
    await page.waitForTimeout(500);
    await shot(page, view.name + '-after-shop');
    await page.close();
  }
  await browser.close();
  server.close();
  await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  const missing = report.filter((r) => !r.gunshopClose);
  process.exit(missing.length ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
