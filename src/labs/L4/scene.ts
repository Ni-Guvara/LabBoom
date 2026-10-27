// L4 场景（P3 标杆实验）：长木板 + 小车 + 电磁打点计时器 + 光电门 + 定滑轮 + 砂桶
// 位置/纸带点距/光电门读数全部由 kinematics 求解器的一条轨迹派生（1 unit = 1 m）
//
// 装配关系（改尺寸前先读这一段，L1 的光电门就是漏了这几条才一直显示 0）：
//   1) 板面 y = BOARD_TOP；挡光片中心在板面上方 78 mm（cart() 的 flag 立在 +20 mm）
//      → 光轴必须 = BOARD_TOP + 0.078；而 photogate 的 AXIS_Y = postTop − 0.068
//   2) 光电门叉口中心在模型局部 z = +0.085 → 整机必须后移 85 mm，光口才对准木板中线 z = 0
//   3) 绳高 = 滑轮顶切线 = 轮心 0.03 + r 0.025 = 0.055 → 车头挂钩必须也抬到 0.055
//   4) 砂桶原点 = 吊环中心，竖直段细线接到这里（不是桶沿，否则看着像线断了）
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';
import { mat } from '@/engine/materials';
import {
  board, cart, tickerTimer, photogate, pulley, pulleyArc, sandBucket, rope, stretchRope, tableTop,
  TAPE_INTERVAL, CART_MASS,
} from '@/labs/_shared/instruments';
import { hideParts, loadOrFallback, partOf } from '@/labs/_shared/models';
import {
  PHOTOGATE_BENCH, GATE_HEAD_Z, attachGateReadout, gateAxisY,
} from '@/labs/_shared/photogate';
import { fitCamera, boxOfSubject } from '@/labs/_shared/framing';
import { simulate, sampleAt, gateReadings, type MotionModel, type Sample } from '@/engine/physics/kinematics';

export const G = 9.8;
export const START_X = -0.2; // 小车初始位置（木板中点右侧为正）
export const TRAVEL = 0.42; // 小车行程
export const FRICTION_FORCE = 0.2; // 未补偿时的摩擦阻力（N）
export const BOARD_TOP = 0.02;
/** 挡光片中心相对板面：cart() 把 flag 顶在板面上方 78 mm */
export const FLAG_Y = 0.078;
/** 光轴高度：直接取台式光电门的派生值（postTop 166 − 68 = 98 mm = 板面 20 + 挡光片 78） */
export const GATE_AXIS = gateAxisY(PHOTOGATE_BENCH);

/** 挡光片中心相对车身中心：cart() 把 flag 立在小车 +20 mm 处 */
export const FLAG_CENTER = 0.02;
/** 光电门默认位置（相对小车起点） */
export const GATE_OFFSET = 0.2;
/** 光电门可调范围：两端都要留够距离，挡光片才能完整穿过光口 */
export const GATE_MIN = 0.1;
export const GATE_MAX = 0.38;

/** 挡光片前沿相对车身中心 */
export function flagLead(flagWidth: number): number {
  return FLAG_CENTER + flagWidth / 2;
}

/**
 * 光电门读数用的位移：挡光片前沿到达光轴时车身走过的距离。
 * 光电门位置是「相对起点的位移」，车身的 x 也是相对起点 → 必须减掉挡光片前沿的前置量，
 * 否则读数会提前 flagLead 到达，Δt 偏小、v 偏大（约 2~5%）。
 * 面板要用的就是这两个导出函数，别再在组件里手写偏移。
 */
export function gateTravel(gateOffset: number, flagWidth: number): number {
  return gateOffset - flagLead(flagWidth);
}

export interface L4Params {
  M: number;
  m0: number;
  compensated: boolean;
  flagWidth: number;
  gateOffset: number;
}

export interface L4State extends L4Params {
  stage: 'setup' | 'run' | 'analyze';
  speed: number;
  paused: boolean;
  /** 单步：每次 +1 让模拟时间前进 0.02 s */
  stepToken: number;
  runId: number;
  samples: Sample[];
  onGateChange: (offset: number) => void;
  onProgress: (t: number) => void;
  onFinish: () => void;
}

/** a = (m0·g − f) / (M + m0)：受力决定加速度，不用关键帧 */
export function labModel(p: L4Params): MotionModel {
  const f = p.compensated ? 0 : FRICTION_FORCE;
  return { accel: () => Math.max(0, (p.m0 * G - f) / (p.M + p.m0)) };
}

export function theoryAccel(p: L4Params): number {
  return labModel(p).accel({ t: 0, x: 0, v: 0 });
}

export function buildSamples(p: L4Params): Sample[] {
  return simulate(labModel(p), { tEnd: 2.5, dt: 0.0005, stop: (s) => s.x >= TRAVEL });
}

export async function buildL4Scene(api: SceneApi, getState: () => L4State): Promise<() => void> {
  const { scene, camera, addAnchor, setAnchorText, onTick, draggable, setTarget, enableDrag } = api;
  /** 只有布置阶段允许挪器材：跑起来以后光电门位置参与读数了 */
  const setupOnly = () => getState().stage === 'setup';

  // 主器材并行加载：glb 是 Blender 建的写实模型（blender/build_l4_kit.py、
  // blender/build_photogate.py），哪件还没导出就回退到 instruments 里的程序化模型，
  // 实验页不会白屏。
  const [boardModel, cartModel, bucketModel, gateModel, timerModel] = await Promise.all([
    loadOrFallback('wood_board', () => board(1.0)),
    loadOrFallback('trolley', () => cart({ mass: CART_MASS })),
    loadOrFallback('sand_bucket', () => sandBucket()),
    // 台式短杆款：立杆 166 mm，光轴正好落在挡光片中心，叉口 135 mm 夹住 120 mm 宽的木板
    loadOrFallback(PHOTOGATE_BENCH.model, () => photogate(PHOTOGATE_BENCH.gap, PHOTOGATE_BENCH.postTop)),
    // 和 L1 同一件 j0203 glb：磁极片/振片/复写纸盘/门形限位孔都在，程序化版只有几块板子
    loadOrFallback('ticker_timer', () => tickerTimer()),
  ]);

  // 台面：右边缘落在 x=0.51（木板末端），定滑轮夹在台边、砂桶悬在台外下落。
  // 进深只留 0.55 m 且以木板所在 z=0 居中 —— 太深时器材被推到台面最里侧，
  // 画面前半屏全是空桌面；太浅又会挡住下落的砂桶（射线在 y=0 处落点 z≈0.58）。
  const table = tableTop(1.5, 1.2);
  table.position.set(-0.24, 0, 0);
  scene.add(table);

  // 木板：glb 原点 = 板底中心（板面 20 mm），直接坐在台面上
  const plank = boardModel.root;
  plank.name = 'plank';
  scene.add(plank);
  addAnchor(plank, '长木板 1.00 m', undefined, new THREE.Vector3(0.3, 0.045, 0.05));

  // ---------- 打点计时器（左端） ----------
  // glb 与 L1 同款（J0203 电磁打点计时器），尺寸 144×70×60 mm
  const timer = timerModel.root;
  timer.name = 'ticker';
  timer.position.set(-0.44, BOARD_TOP, 0);
  scene.add(timer);
  // glb 自带的定长纸带是静态装饰，会和随车拉出的动态纸带打架 → 关掉；
  // 两根悬空电源线在木板上无处落点，也一起藏掉（L1 同款处理）
  hideParts(timerModel, 'tape');
  hideParts(timerModel, 'wire_');
  const timerAnchor = addAnchor(timer, '电磁打点计时器 50 Hz · 纸带 0.02 s/点');

  // 打点针的 x 位置（timer 在 -0.44，glb 里针尖在局部 +0.033）
  const NEEDLE_X = -0.407;
  // 纸带平面 = glb 计时器纸带出口（局部 19.5 mm）+ 纸带半厚，与小车纸带夹同高
  const TAPE_Y = BOARD_TOP + 0.0199;

  const tapeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.0008, 0.017), mat('paper'));
  tapeMesh.castShadow = true;
  tapeMesh.receiveShadow = false;
  // 取景在 build 末尾按包围盒算：单位长度的纸带/细线还没拉伸，会虚增 1 m 包围盒
  tapeMesh.userData.noFrame = true;
  scene.add(tapeMesh);

  // 纸带点（打点计时器 0.02 s 一点，位置由轨迹派生）
  // 纸带点直径 3.2 mm（真实打点孔约 1 mm，但 1 mm 在 0.5 m 视野里不到 1 px，看不见）
  const dotGeo = new THREE.SphereGeometry(0.0016, 8, 6);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x14181e });
  const dots: { mesh: THREE.Mesh; sAt: number }[] = [];
  const MAX_DOTS = 64;

  // ---------- 小车 ----------
  // glb 原点 = 车轮接触平面 → 与程序化 cart() 一样直接摆在板面上
  const car = cartModel.root;
  car.name = 'car';
  car.position.set(START_X, BOARD_TOP, 0);
  scene.add(car);
  const carAnchor = addAnchor(car, `小车 M = ${(CART_MASS * 1000).toFixed(0)} g`);
  const flagMesh = partOf(cartModel, 'flag');

  const ROPE_Y = 0.055; // 滑轮顶切线高度
  const HOOK_X = 0.0665; // 车头挂环中心（glb 与程序化模型同值）
  if (!cartModel.glb) {
    // 程序化车的挂钩在 33 mm、没有纸带夹 → 补一段托架把绳/纸带抬到真实高度
    const frontHook = new THREE.Group();
    const hookBracket = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.020, 0.01), mat('steel'));
    hookBracket.position.set(0.058, 0.025, 0);
    const hookRing = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0012, 8, 14), mat('steel'));
    hookRing.rotation.y = Math.PI / 2;
    hookRing.position.set(HOOK_X, ROPE_Y - BOARD_TOP, 0);
    frontHook.add(hookBracket, hookRing);
    car.add(frontHook);

    const tapeClip = new THREE.Group();
    const clipPost = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.014, 0.012), mat('steel'));
    clipPost.position.set(-0.057, 0.040, 0);
    const clipJaw = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.0022, 0.020), mat('steel'));
    clipJaw.position.set(-0.052, TAPE_Y - BOARD_TOP - 0.001, 0);
    tapeClip.add(clipPost, clipJaw);
    car.add(tapeClip);
  }

  // ---------- 光电门 ----------
  // 光轴 = 板面 20 + 挡光片中心 78 = 98 mm，正是台式短杆款 glb 的派生光轴
  const GATE_GAP = PHOTOGATE_BENCH.gap; // 叉口净宽 135 mm：把 120 mm 宽的木板夹在两条垂臂之间
  const gate = gateModel.root;
  gate.name = 'gate';
  // 整机后移 85 mm：叉口中心才落在木板中线 z = 0，底座落在木板后侧的台面上
  gate.position.set(START_X + GATE_OFFSET, 0, -GATE_HEAD_Z);
  scene.add(gate);
  const gateAnchor = addAnchor(gate, '光电门', undefined, new THREE.Vector3(0.06, 0.06, 0));

  // 红外光束：挡住时变暗，学生一眼能看出"什么时候在计时"
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xff4433, transparent: true, opacity: 0.55, depthWrite: false });
  const beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0011, GATE_GAP, 6), beamMat);
  beamMesh.rotation.x = Math.PI / 2;
  beamMesh.position.set(0, GATE_AXIS, GATE_HEAD_Z);
  gate.add(beamMesh);

  // 数显贴片：glb 不烘文字（程序化回退版自带，helper 内部判重）
  const setReadout = attachGateReadout(gate, PHOTOGATE_BENCH);

  // ---------- 定滑轮 + 砂桶 ----------
  // glb 木板把滑轮支架一起建模了（轮心 0.526、轮顶 0.055）→ 只有回退模型才单独加滑轮
  const PULLEY_X = boardModel.glb ? 0.526 : 0.52;
  const pul = boardModel.glb ? null : pulley();
  if (pul) {
    pul.name = 'pulley';
    pul.position.set(PULLEY_X, 0, 0);
    scene.add(pul);
    addAnchor(pul, '定滑轮', undefined, new THREE.Vector3(0, 0.11, 0));
  }

  const bucket = bucketModel.root;
  bucket.name = 'bucket';
  // 桶口（吊环下 30 mm）必须从台面板底下开始：台面板厚 40 mm，
  // 吊环低于台面 55 mm → 桶身完全在台面以下，下落不会穿模。
  const BUCKET_Y0 = -0.055;
  const BUCKET_X = PULLEY_X + 0.025;
  bucket.position.set(BUCKET_X, BUCKET_Y0, 0);
  scene.add(bucket);
  const bucketAnchor = addAnchor(bucket, '砂桶 m₀', undefined, new THREE.Vector3(0.03, 0.02, 0.03));

  // glb 的沙堆是半桶沙的固定锥体 → 按质量横向缩放（0.35~1.0），底面保持在桶口
  const sandPart = bucketModel.glb ? partOf(bucketModel, 'sand') : undefined;
  const SAND_BASE_Y = -0.033; // glb 沙锥底面（桶口内侧）
  const SAND_HALF_H = 0.013; // 沙锥半高
  const setSandMass = (m: number) => {
    if (!sandPart) return;
    const k = 0.35 + 0.65 * Math.min(1, Math.max(0, (m - 0.02) / 0.18));
    sandPart.scale.set(k, k, k);
    sandPart.position.y = SAND_BASE_Y + SAND_HALF_H * k;
  };

  // 细线加粗到 φ3.2 mm：0.9 mm 在 0.5 m 视野里不到 1 px，远看就是"线断了"
  const ropeH = rope(0.0016);
  const ropeV = rope(0.0016);
  scene.add(ropeH, ropeV);
  ropeH.userData.noFrame = true;
  ropeV.userData.noFrame = true;
  // 绕在轮缘上的 90° 过渡段（顶 → 右），补掉折角处的缺口
  const ropeArc = pulleyArc(0.025, 0.0016);
  ropeArc.position.set(PULLEY_X, 0.03, 0);
  ropeArc.userData.noFrame = true;
  scene.add(ropeArc);

  const a1 = new THREE.Vector3();
  const a2 = new THREE.Vector3();

  // ---------- 光电门读数（Δt 定格，不跟着车走） ----------
  let gateIn = Infinity;
  let gateOut = Infinity;
  let gateDt = 0;
  let gateV = 0;
  let lastSamples: Sample[] | null = null;
  let lastGate = Number.NaN;
  let lastFlag = Number.NaN;

  function solveGate() {
    const st = getState();
    const rd = gateReadings(st.samples, [
      { id: 'G1', x: gateTravel(st.gateOffset, st.flagWidth), flagWidth: st.flagWidth },
    ])[0];
    gateIn = rd ? rd.tIn : Infinity;
    gateOut = rd ? rd.tOut : Infinity;
    gateDt = rd ? rd.blockTime : 0;
    gateV = rd ? rd.v : 0;
    lastSamples = st.samples;
    lastGate = st.gateOffset;
    lastFlag = st.flagWidth;
  }
  solveGate();

  const clearDots = () => {
    dots.forEach((d) => scene.remove(d.mesh));
    dots.length = 0;
  };

  let simT = 0;
  let lastRun = -1;
  let lastStep = 0;
  let finished = false;
  let dotIndex = 0;

  enableDrag();

  onTick((dt) => {
    const st = getState();
    // 轨迹或光电门位置变了（M / m0 / 摩擦补偿 / 挡光片宽度 / 拖动光电门）→ 重解挡光时刻
    if (st.samples !== lastSamples || st.gateOffset !== lastGate || st.flagWidth !== lastFlag) solveGate();

    if (st.runId !== lastRun) {
      lastRun = st.runId;
      lastStep = st.stepToken;
      simT = 0;
      finished = false;
      dotIndex = 0;
      clearDots();
    }
    const end = st.samples.length ? st.samples[st.samples.length - 1].t : 0;
    if (st.stage === 'run' && !st.paused) {
      simT = Math.min(end, simT + dt * st.speed);
      st.onProgress(simT);
    }
    if (st.stepToken !== lastStep) {
      lastStep = st.stepToken;
      simT = Math.min(end, simT + TAPE_INTERVAL);
      st.onProgress(simT);
    }
    if (st.stage === 'run' && simT >= end && end > 0 && !finished) {
      finished = true;
      st.onFinish();
    }
    const s = sampleAt(st.samples, simT);

    // 小车位置 = 起点 + 位移（与纸带、光电门同源）
    car.position.x = START_X + s.x;
    const cartX = car.position.x;
    const cartRear = cartX - 0.06;
    const cartFront = cartX + HOOK_X;

    // 挡光片宽度随面板变化（cart() 的默认片宽是 50 mm）
    if (flagMesh) flagMesh.scale.x = st.flagWidth / 0.05;

    // 光电门位置随面板/拖动同步
    gate.position.x = START_X + st.gateOffset;

    // 纸带：从打点针到车尾夹（水平段就在限位孔高度上）
    const tapeLen = Math.max(0.02, cartRear - NEEDLE_X);
    tapeMesh.scale.x = tapeLen;
    tapeMesh.position.set(NEEDLE_X + tapeLen / 2, TAPE_Y, 0);

    // 逐点打印（按 0.02 s 节拍）
    while (dotIndex * TAPE_INTERVAL <= simT && dotIndex < 300) {
      const tp = sampleAt(st.samples, dotIndex * TAPE_INTERVAL);
      if (dots.length < MAX_DOTS) {
        const m = new THREE.Mesh(dotGeo, dotMat);
        m.position.set(NEEDLE_X, TAPE_Y + 0.0006, 0);
        scene.add(m);
        dots.push({ mesh: m, sAt: tp.x });
      }
      dotIndex++;
    }
    // 已打印的点随纸带一起移动
    for (const d of dots) {
      const x = NEEDLE_X + (s.x - d.sAt);
      d.mesh.position.x = x;
      d.mesh.visible = x < cartRear - 0.004;
    }
    setAnchorText(timerAnchor, `电磁打点计时器 50 Hz · 0.02 s/点 · 已打 ${Math.min(dotIndex, MAX_DOTS)} 点`);

    // 细线：水平段（车钩 → 轮顶切点）+ 轮缘弧段 + 竖直段（右切点 → 桶环）
    a1.set(cartFront, ROPE_Y, 0);
    a2.set(PULLEY_X, ROPE_Y, 0);
    stretchRope(ropeH, a1, a2);
    a1.set(BUCKET_X, 0.03, 0);
    a2.set(BUCKET_X, BUCKET_Y0 - s.x, 0);
    stretchRope(ropeV, a1, a2);

    // 砂桶随位移下降（吊环挂点跟着走）
    bucket.position.y = BUCKET_Y0 - s.x;
    (bucket.userData.setMass as ((m: number) => void) | undefined)?.(st.m0);
    setSandMass(st.m0);
    // 轮槽是 XY 平面（轴沿 z）→ 只能绕 z 转，绕 x 会把轮盘翻过来
    if (pul) pul.userData.wheel.rotation.z = -s.x / 0.025;

    // 器材数值随布置参数同步
    setAnchorText(carAnchor, `小车 M = ${(st.M * 1000).toFixed(0)} g${st.compensated ? ' · 已平衡摩擦' : ''}`);
    setAnchorText(bucketAnchor, `砂桶 m₀ = ${(st.m0 * 1000).toFixed(0)} g`);

    // 光电门：进光口计时（ms），后沿离开定格 —— 不能每帧刷瞬时速度，否则数字永远在跳
    const blocking = simT >= gateIn && simT < gateOut;
    beamMat.opacity = blocking ? 0.08 : 0.45;
    if (!Number.isFinite(gateIn)) {
      setReadout('0.0');
      setAnchorText(gateAnchor, `光电门 · 无读数（挡光片不经过光口，d = ${(st.flagWidth * 1000).toFixed(0)} mm）`);
    } else if (simT < gateIn) {
      // 布置/未过门一律 0.0：读数必须由挡光片自己"打"出来，不能提前预设
      setReadout('0.0');
      setAnchorText(gateAnchor, `光电门 · 待机 0.0（距起点 ${(st.gateOffset * 100).toFixed(0)} cm，d = ${(st.flagWidth * 1000).toFixed(0)} mm）`);
    } else if (blocking) {
      setReadout(((simT - gateIn) * 1000).toFixed(1));
      setAnchorText(gateAnchor, '光电门 · 计时中（挡光片正在遮光）');
    } else {
      setReadout((gateDt * 1000).toFixed(1));
      setAnchorText(gateAnchor, `光电门 Δt = ${(gateDt * 1000).toFixed(2)} ms → v = d/Δt = ${gateV.toFixed(3)} m/s`);
    }
  });

  // 木板横铺 + 砂桶下落 0.42 m：取景必须把"砂桶落到最低点"也算进去，
  // 否则一开始砂桶在画面里，跑起来就掉出画外，学生看不到是谁在拉小车。
  //
  // 例外是封面构图（?cover=1，scripts/capture-covers.mjs 使用）：卡片封面是
  // 327×149（约 2.2:1）居中裁切，只见画布中间一条横带。预留整段落行程会把器材
  // 顶到画面上三分之一，横带里正好切掉光电门；于是封面模式只留少量行程，
  // 并把画面拉远到「光电门顶端 + 砂桶底部」都落在中间横带内。
  const forCover = new URLSearchParams(window.location.search).has('cover');
  const frame = boxOfSubject(scene);
  frame.min.y = Math.min(frame.min.y, forCover ? BUCKET_Y0 - 0.17 : BUCKET_Y0 - TRAVEL - 0.10);
  frame.max.x = Math.max(frame.max.x, BUCKET_X + 0.06);
  frame.max.z = Math.max(frame.max.z, 0.16);
  frame.min.z = Math.min(frame.min.z, -0.16);
  // 满屏舞台后画布接近 4:3：填满度给到 0.92，再把观察中心抬 30 mm。
  // 包围盒下沿是砂桶最低点（负高度），居中会让整条导轨浮到画面上三分之一、下半屏空着；
  // 抬这一点点，导轨回中部，砂桶到底时仍然在画内（fill 有余量）。
  const view = fitCamera(camera, frame, {
    pitch: 26,
    yaw: 0.24,
    fill: forCover ? 0.90 : 0.92,
    margin: 0.01,
  });
  if (!forCover) view.y += 0.03;
  setTarget(view);

  // 光电门单轴拖动：只有布置阶段能拖，松手把位移回写给面板（按 1 cm 取整，避免浮点尾巴）
  draggable(gate, {
    axis: 'x',
    min: START_X + GATE_MIN,
    max: START_X + GATE_MAX,
    canDrag: setupOnly,
    onMove: (pos) => getState().onGateChange(Math.round((pos.x - START_X) * 100) / 100),
  });

  return () => {
    clearDots();
  };
}
