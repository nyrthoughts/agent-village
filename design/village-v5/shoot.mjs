// Render the boards to PNG. Usage: node shoot.mjs [name ...]
// Serves design/village-v3 over http (fetch needs it), screenshots at deviceScaleFactor 2.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
}).listen(8765);

const shots = {
  '01-desktop-scene': ['prototype/app.html?view=scene', 1440, 900],
  '02-desktop-project-drawer': ['prototype/app.html?view=project&col=project', 1440, 900],
  '02b-desktop-drawer-bottom': ['prototype/app.html?view=project&col=project&scroll=520', 1440, 900],
  '03-states-motion': ['prototype/states.html', 1800, 0],
  '04-mobile': ['prototype/mobile.html', 1800, 0],
  '05-asset-sheet': ['prototype/assets.html', 1800, 0],
  '06-desktop-reduced-motion': ['prototype/app.html?view=scene&motion=reduced', 1440, 900],
  '07-villager-generator': ['prototype/characters.html', 1800, 0],
};
const want = process.argv.slice(2);
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
const browser = await chromium.launch({ proxy });
for (const [name, [url, w, h]] of Object.entries(shots)) {
  if (want.length && !want.includes(name)) continue;
  const page = await browser.newPage({ viewport: { width: w, height: h || 900 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
  await page.goto(`http://localhost:8765/${url}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(root, 'visuals', `${name}.png`), fullPage: !h });
  console.log('shot', name);
  await page.close();
}
await browser.close();
srv.close();
