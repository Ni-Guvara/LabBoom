// 截图器材模型试验台（开发验证用）
// 用法：node scripts/capture-model.mjs [apparatusId] [out.png]
// 前提：页面已可访问（vite dev 或 vite preview）
// 环境变量 BASE 可覆盖地址（默认 http://localhost:4173）
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const id = process.argv[2] ?? 'ticker_timer';
const out = resolve(process.argv[3] ?? `blender/preview/app-${id}.png`);
const BASE = process.env.BASE ?? 'http://localhost:4173';
mkdirSync(dirname(out), { recursive: true });

// 本机不一定装了 playwright 自带的 Chromium：依次尝试 Edge / Chrome 通道
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = await import('playwright-core'));
}

let browser;
for (const opts of [{}, { channel: 'msedge' }, { channel: 'chrome' }]) {
  try {
    browser = await chromium.launch({ ...opts, args: ['--enable-unsafe-swiftshader'] });
    break;
  } catch (e) {
    if (opts === undefined) break;
  }
}
if (!browser) {
  console.error('没有可用的浏览器内核，先跑 npx playwright install chromium');
  process.exit(1);
}

const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(`${BASE}/#/model/${id}`, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(3500); // 等模型加载 + 相机聚焦动画
await page.screenshot({ path: out, fullPage: false });
console.log('saved', out);
await browser.close();
