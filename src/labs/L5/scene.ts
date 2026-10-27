// L5 场景：研究平抛运动（平抛实验器 —— 斜槽 + 双标尺白板 + 全宽接球槽）
//
// 器材是 blender/build_throw.py 出的 thrower.glb，本文件只负责三件事：
//   ① 把 canvas 画的两条刻度尺（顶部横尺 / 左侧竖尺）贴到 glb 的白漆标尺底板上；
//   ② 沿 glb 斜槽的几何把钢球摆到释放点、滚到出口；
//   ③ 离槽后按 x=v₀t、y=Y₀−½gt² 飞，落到接球槽台面上停住，沿途留频闪点。
//
// 坐标对齐（three 里 +Z 朝观察者，glb 的 Blender −Y 前面 = three +Z）：
//   槽底高 0.247、槽中线 z = −0.050、出口 x = −0.090、槽宽 30 mm → 配 Ø16 球。
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';
import { mat } from '@/engine/materials';
import { tableTop } from '@/labs/_shared/instruments';
import { fitCamera, boxOf } from '@/labs/_shared/framing';
import { loadOrFallback } from '@/labs/_shared/models';

export const G = 9.8;
export const STROBE = 0.05;
export const BALL_R = 0.008; // 槽宽 30 mm，球用 Ø16，两侧各留 7 mm 余量
export const Y0 = 0.255; // 抛出口（球心）高度 = 槽底 0.247 + 球半径
export const LAND_Y = 0.082; // 接球槽台面 0.074 + 球半径
export const EXIT_X = -0.09; // 斜槽水平段出口
export const FLIGHT_Z = -0.05; // 球飞行的竖直平面（glb 斜槽中线）

/** 斜槽几何：折弯点 → 顶端，与 build_throw.py 的 CHUTE_X1 / RAMP_TOP 同源 */
const KNEE = { x: -0.205, y: 0.255 };
const TOP = { x: -0.32, y: 0.402 };
// 注意方向：x 朝负方向变远，EXIT_X(−0.09) 在 KNEE.x(−0.205) 的右边，
// 所以长度必须写 EXIT_X − KNEE.x（= +0.115）。写成 KNEE.x − EXIT_X 会得到负数，
// 滚落行程被算成 −0.0008 m，球就只在释放点附近抖一下再瞬移到出口。
const LEVEL_LEN = EXIT_X - KNEE.x; // 0.115 水平导出段
const RAMP_DX = KNEE.x - TOP.x;
const RAMP_DY = TOP.y - KNEE.y;
const RAMP_SIN = RAMP_DY / Math.hypot(RAMP_DX, RAMP_DY); // ≈0.787，52°

/**
 * 滚落段的运动学常数。
 *
 * 不能再用"固定过场时间 + 位置按 t² 硬凑"的写法：那样斜槽和水平导出段共用同一条
 * 加速曲线，水平段也会一路加速，到出口时速度最大，接着平抛又按 v₀ 重新起步——
 * 观感就是"在斜面上慢慢爬、进平轨猛冲、出槽时一顿"，和物理对不上。
 *
 * 真实情况是两段：
 *   斜槽上  s = ½at²，a = η·g·sinθ，末速 v = a·t₁ = √(2ηgh)（与 v0Of 同式，
 *           所以出槽速度与平抛初速天然相等，视觉连续）；
 *   水平段  无水平外力 → 匀速 v，耗时 LEVEL_LEN / v。
 * 两段耗时都随释放高度变（h 大则滚得久），加起来才是这段过场的真实时长。
 */
const ROLL_ETA = 0.8; // 与 v0Of 共用同一个损耗系数，保证末速恰好等于 v₀
const RAMP_A = ROLL_ETA * G * RAMP_SIN; // 沿斜槽的加速度 ≈ 6.2 m/s²

export interface RollTiming {
  v: number; // 出槽速度（= 平抛初速）
  l1: number; // 斜槽上走过的路径长
  t1: number; // 斜槽段耗时
  t2: number; // 水平导出段耗时
  total: number; // 滚落总耗时
}

/** 由释放高度算出滚落两段的路程与时间（纯运动学，与帧率无关） */
export function rollTiming(h: number, v0 = v0Of({ releaseH: h })): RollTiming {
  const l1 = Math.max(0.02, h) / RAMP_SIN;
  const t1 = v0 / RAMP_A; // 0 → v 的匀加速耗时，等价于 √(2l1/a)
  const t2 = LEVEL_LEN / v0; // 水平段匀速
  return { v: v0, l1, t1, t2, total: t1 + t2 };
}

/** 滚落段某一时刻的球心位置（斜槽匀加速 → 水平段匀速） */
export function rollPose(clock: number, h: number, v0 = v0Of({ releaseH: h })) {
  const roll = rollTiming(h, v0);
  const t = Math.min(Math.max(0, clock), roll.total);
  const rel = releasePoint(h);
  if (t <= roll.t1) {
    const s = 0.5 * RAMP_A * t * t; // 沿斜面已走路程
    const k = roll.l1 > 1e-6 ? Math.min(1, s / roll.l1) : 1;
    return { x: rel.x + (KNEE.x - rel.x) * k, y: rel.y + (KNEE.y - rel.y) * k, onRamp: true };
  }
  return { x: KNEE.x + Math.min(LEVEL_LEN, roll.v * (t - roll.t1)), y: Y0, onRamp: false };
}

export interface L5Params {
  releaseH: number; // 斜槽上释放高度
}

export interface L5State extends L5Params {
  stage: 'setup' | 'run' | 'analyze';
  speed: number;
  paused: boolean;
  stepToken: number;
  runId: number;
  onProgress: (t: number) => void;
  onFinish: () => void;
}

/** 离槽速度：v₀ = √(2gH·η)，η 为滚阻/转动惯量损耗 */
export function v0Of(p: L5Params): number {
  return Math.sqrt(2 * G * Math.max(0.02, p.releaseH) * 0.8);
}

/** 球心从出口落到接球槽台面的时间 */
export function flightTime(): number {
  return Math.sqrt((2 * (Y0 - LAND_Y)) / G);
}

export interface Dot { t: number; x: number; y: number }

/** 频闪点：x = v₀t（离槽后的水平位移），y = Y₀ − ½gt² */
export function strobeDots(p: L5Params): Dot[] {
  const v0 = v0Of(p);
  const tf = flightTime();
  const out: Dot[] = [];
  for (let k = 0; k * STROBE <= tf + 1e-9; k++) {
    const t = k * STROBE;
    out.push({ t, x: v0 * t, y: Y0 - 0.5 * G * t * t });
  }
  return out;
}

/** 释放点：斜槽上比出口高 h 的那一点（h 越大越靠顶端） */
function releasePoint(h: number) {
  const t = THREE.MathUtils.clamp((RAMP_DY - h) / RAMP_DY, 0, 1);
  return { x: TOP.x + t * RAMP_DX, y: TOP.y - t * RAMP_DY };
}

/**
 * 刻度尺贴片：白漆底板上只压一层墨线，底板本身由 glb 出。
 * 横向尺从顶边垂刻度、数字在刻度下方；竖向尺从左边伸刻度、数字竖排在右侧。
 */
function rulerMesh(w: number, h: number, vertical: boolean, cmCount = 28): THREE.Mesh {
  const long = 2560;
  const short = 340;
  const canvas = document.createElement('canvas');
  canvas.width = vertical ? short : long;
  canvas.height = vertical ? long : short;
  const ctx = canvas.getContext('2d')!;

  const len = vertical ? canvas.height : canvas.width; // 刻度方向
  const thick = vertical ? canvas.width : canvas.height; // 尺宽方向
  const pad = len * 0.035;
  const span = len - pad * 2;
  const ink = '#23292f';

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'butt';
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;

  // 刻度长度按尺宽定：主刻度 0.38、半厘米 0.24、毫米 0.13，剩下 0.6 留给数字
  for (let i = 0; i <= cmCount * 10; i++) {
    const p = pad + (i / (cmCount * 10)) * span;
    const major = i % 10 === 0;
    const mid = i % 5 === 0;
    const t = major ? thick * 0.38 : mid ? thick * 0.24 : thick * 0.13;
    ctx.lineWidth = major ? 4 : mid ? 3 : 2;
    ctx.beginPath();
    if (vertical) {
      const y = canvas.height - p; // 0 在下：canvas y 轴朝下
      ctx.moveTo(0, y);
      ctx.lineTo(t, y);
    } else {
      ctx.moveTo(p, 0);
      ctx.lineTo(p, t);
    }
    ctx.stroke();
  }

  // 字高必须小于刻度间距（横尺 1 cm 只有 ~12.5 mm，28 个数字挤在一排）
  const fs = Math.round(thick * 0.17);
  ctx.font = `600 ${fs}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let c = 0; c <= cmCount; c++) {
    const p = pad + (c / cmCount) * span;
    const label = String(c);
    if (vertical) {
      const y = canvas.height - p;
      ctx.save();
      ctx.translate(thick * 0.5, y);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(label, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(label, p, thick * 0.38 + thick * 0.21);
    }
  }
  // 单位标记
  ctx.textAlign = vertical ? 'left' : 'right';
  ctx.font = `600 ${Math.round(fs * 0.95)}px "JetBrains Mono", ui-monospace, monospace`;
  if (vertical) ctx.fillText('cm', thick * 0.52, thick * 0.42);
  else ctx.fillText('cm', canvas.width - pad * 0.3, thick * 0.38 + thick * 0.21);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  mesh.renderOrder = 2;
  return mesh;
}

/** glb 加载失败时的程序化替身：底板 + 白板 + 一段斜槽，保证实验照样能跑 */
function fallbackRig(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'thrower-fallback';
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.3), mat('steel', { color: 0xdfe3e6, roughness: 0.5 }));
  base.position.y = 0.015;
  base.castShadow = true;
  g.add(base);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.34, 0.012), mat('steel', { color: 0xe4e7e9, roughness: 0.5 }));
  board.position.set(0, 0.2, -0.089);
  board.castShadow = true;
  g.add(board);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.008, 0.13), mat('steel', { color: 0xe4e7e9, roughness: 0.5 }));
  tray.position.set(0, 0.07, -0.01);
  g.add(tray);
  const lv = new THREE.Mesh(new THREE.BoxGeometry(LEVEL_LEN, 0.01, 0.03), mat('aluminum'));
  lv.position.set((EXIT_X + KNEE.x) / 2, 0.2495, FLIGHT_Z);
  g.add(lv);
  return g;
}

export async function buildL5Scene(api: SceneApi, getState: () => L5State): Promise<() => void> {
  const { scene, camera, addAnchor, setAnchorText, onTick, draggable, setTarget } = api;

  scene.add(tableTop(2.4, 2.4));

  const rig = new THREE.Group();
  rig.name = 'rig';
  scene.add(rig);
  // 整套器材作为一个整体：布置阶段可以挪桌子上的位置，运行阶段锁定
  draggable(rig, { plane: 'floor', canDrag: () => getState().stage === 'setup' });

  const model = await loadOrFallback('thrower', fallbackRig);
  rig.add(model.root);

  // ---------- 两条刻度尺（glb 只做了白漆底板，刻度与数字在这里画）----------
  const rulerTop = rulerMesh(0.352, 0.042, false);
  rulerTop.position.set(0, 0.335, -0.0862);
  rig.add(rulerTop);
  const rulerSide = rulerMesh(0.028, 0.3, true);
  rulerSide.position.set(-0.16, 0.21, -0.0862);
  rig.add(rulerSide);

  // ---------- 钢球 ----------
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 26, 20), mat('steel', { roughness: 0.2 }));
  ball.castShadow = true;
  rig.add(ball);
  const ballAnchor = addAnchor(ball, '钢球 φ16 mm');

  // 斜槽读数挂在斜槽中段上方的空锚点上（不挡器材本体）
  const chuteAnchorObj = new THREE.Object3D();
  chuteAnchorObj.position.set(-0.2, 0.31, FLIGHT_Z);
  rig.add(chuteAnchorObj);
  const chuteAnchor = addAnchor(chuteAnchorObj, '斜槽');

  // ---------- 频闪留痕 ----------
  // 用蓝色小点：白板上本来就有 4 个红/绿按扣，频闪点原先也是红的，
  // 混在一起分不清哪个是器材、哪个是轨迹留痕。蓝色 + 略发光 = 明确是"电子标记"。
  const dotGeo = new THREE.SphereGeometry(0.0038, 10, 8);
  const dotMat = new THREE.MeshStandardMaterial({ color: 0x2ba6ff, roughness: 0.5, emissive: 0x0b3f66 });
  let dots: THREE.Mesh[] = [];
  const clearDots = () => {
    for (const d of dots) rig.remove(d);
    dots = [];
  };

  let clock = 0; // 运行总时钟（含滚落过场）
  let lastRun = -1;
  let lastStep = 0;
  let finished = false;
  let shot = 0;

  onTick((dt) => {
    const st = getState();
    if (st.runId !== lastRun) {
      lastRun = st.runId;
      lastStep = st.stepToken;
      clock = 0;
      finished = false;
      shot = 0;
      clearDots();
    }

    const tf = flightTime();
    const h = st.releaseH;
    const v0 = v0Of(st);
    const rel = releasePoint(h);
    const roll = rollTiming(h, v0);
    const tRoll = roll.total;

    if (st.stage === 'setup') {
      // 布置态：球停在释放点，读数清零
      ball.position.set(rel.x, rel.y, FLIGHT_Z);
      setAnchorText(chuteAnchor, `斜槽释放高度 h = ${(h * 1000).toFixed(0)} mm · v₀ = ${v0.toFixed(2)} m/s`);
      setAnchorText(ballAnchor, `钢球 φ16 mm · 待释放`);
      return;
    }

    if (!st.paused) clock = Math.min(tRoll + tf, clock + dt * st.speed);
    if (st.stepToken !== lastStep) {
      lastStep = st.stepToken;
      clock = Math.min(tRoll + tf, clock + STROBE);
    }

    // 滚落段：斜槽匀加速 → 水平导出段匀速（不产生频闪点，只做视觉过场）
    const pose = rollPose(Math.min(clock, tRoll), h, v0);
    let bx = pose.x;
    let by = pose.y;

    const t = Math.max(0, clock - tRoll); // 离槽后的飞行时间
    if (clock > tRoll) {
      bx = EXIT_X + v0 * t;
      by = Math.max(LAND_Y, Y0 - 0.5 * G * t * t); // 落到接球槽后停住
    }
    ball.position.set(bx, by, FLIGHT_Z);

    if (st.stage === 'run') st.onProgress(Math.min(t, tf));

    setAnchorText(chuteAnchor, `斜槽释放高度 h = ${(h * 1000).toFixed(0)} mm · v₀ = ${v0.toFixed(2)} m/s`);
    setAnchorText(
      ballAnchor,
      `钢球 φ16 mm · x = ${((bx - EXIT_X) * 1000).toFixed(0)} mm · y = ${(by * 1000).toFixed(0)} mm`,
    );

    // 频闪点：只在离槽之后留，x 从出口起算
    if (clock > tRoll) {
      while (shot * STROBE <= t + 1e-9 && shot < 20) {
        const tt = shot * STROBE;
        const d = new THREE.Mesh(dotGeo, dotMat);
        d.position.set(EXIT_X + v0 * tt, Math.max(LAND_Y, Y0 - 0.5 * G * tt * tt), FLIGHT_Z);
        rig.add(d);
        dots.push(d);
        shot++;
      }
    }

    if (st.stage === 'run' && clock >= tRoll + tf - 1e-9 && !finished) {
      finished = true;
      st.onFinish();
    }
  });

  // 取景：整机 539×300×432 mm，俯 19° 才看得进斜槽槽口，几乎正对板面（偏航只留 0.10）
  setTarget(fitCamera(camera, boxOf(rig), { pitch: 19, yaw: 0.1, fill: 0.88, margin: 0.02 }));

  ball.position.set(releasePoint(getState().releaseH).x, releasePoint(getState().releaseH).y, FLIGHT_Z);
  return () => { clearDots(); };
}
