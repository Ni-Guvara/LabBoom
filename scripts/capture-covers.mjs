// 生成模块列表卡片封面：把每个实验的 3D 台面按影棚构图截一张图。
//
// 为什么不在列表页里直接挂 12 个 WebGL 画布：浏览器同时开 12 个上下文会掉帧甚至
// 丢失上下文，列表页又只需要一张静态图。这里用一次性的 headless 截图把「真实的
// 三维台面」固化成静态资源，列表页只负责 <img>，构建产物仍是纯静态。
//
// 用法：
//   npm run dev            # 另开一个终端
//   node scripts/capture-covers.mjs
// 环境变量 COVER_BASE 可覆盖地址（默认 http://localhost:5173）。
import { chromium } from 'playwright';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.COVER_BASE ?? 'http://localhost:5173';
// COVER_LABS=L2,L4 可只重拍指定关卡
const LABS = process.env.COVER_LABS
  ? process.env.COVER_LABS.split(',').map((s) => s.trim()).filter(Boolean)
  : Array.from({ length: 12 }, (_, i) => `L${i + 1}`);
const CANVAS = 'canvas[data-engine]';
const OUT = resolve('public/covers');
mkdirSync(OUT, { recursive: true });

// 本机 playwrigt 包与浏览器版本可能不同步：优先用已安装的 Chromium，
// 找不到再回退到包默认路径（需 npx playwright install chromium）。
const LOCAL_CHROME = `${process.env.LOCALAPPDATA ?? ''}\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe`;
const browser = await chromium.launch(
  existsSync(LOCAL_CHROME) ? { executablePath: LOCAL_CHROME } : {},
);
const pageErrors = [];
const ok = [];

try {
  for (const id of LABS) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1.5,
    });
    page.on('pageerror', (e) => pageErrors.push(`${id}: ${e.message}`));

    await page.goto(`${BASE}/#/lab/${id}`, { waitUntil: 'domcontentloaded' });
    // 页面里还有 ECharts 的 canvas，用 data-engine 精确锁定 three.js 画布
    await page.waitForSelector(CANVAS, { timeout: 30000 });
    // 等环境贴图（PMREM）、阴影、bloom 第一帧稳定
    await page.waitForTimeout(1600);

    // 只留画布：隐藏舞台工具条（绝对定位浮层）与 CSS2D 标注层，
    // 封面缩小到 150px 高时标注文字只会糊成一团。
    await page.evaluate((sel) => {
      const canvas = document.querySelector(sel);
      if (!canvas) return;
      const mount = canvas.parentElement;
      for (const sib of Array.from(mount.parentElement.children)) {
        if (sib !== mount) sib.style.display = 'none';
      }
      for (const sib of Array.from(mount.children)) {
        if (sib !== canvas) sib.style.display = 'none';
      }
    }, CANVAS);
    await page.waitForTimeout(300);

    const box = await page.locator(CANVAS).boundingBox();
    if (!box || box.width < 200 || box.height < 150) {
      console.warn(`[skip] ${id} 画布尺寸异常 ${box ? `${box.width}x${box.height}` : 'null'}`);
      await page.close();
      continue;
    }

    await page.screenshot({
      path: `${OUT}/${id}.jpg`,
      type: 'jpeg',
      quality: 88,
      clip: box,
    });
    const kb = Math.round(statSync(`${OUT}/${id}.jpg`).size / 1024);
    console.log(`[ok] ${id} ${Math.round(box.width)}x${Math.round(box.height)} ${kb} KB`);
    ok.push(id);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`\n生成 ${ok.length}/${LABS.length} 张封面 → public/covers`);
if (pageErrors.length) console.log(`页面错误：\n${pageErrors.join('\n')}`);
