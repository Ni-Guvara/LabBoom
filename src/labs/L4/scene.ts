// L4 场景（P3 标杆实验）：长木板 + 小车 + 电磁打点计时器 + 光电门 + 定滑轮 + 砝码盘
// 关键改动：位置/纸带点距/光电门读数全部由 kinematics 求解器的一条轨迹派生（1 unit = 1 m）
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';
import { mat } from '@/engine/materials';
import {
  board, cart, tickerTimer, photogate, pulley, pulleyArc, weightStack, rope, stretchRope, tableTop,
  TAPE_INTERVAL, CART_MASS,
} from '@/labs/_shared/instruments';
import { fitCamera, boxOfSubject } from '@/labs/_shared/framing';
import { simulate, sampleAt, type MotionModel, type Sample } from '@/engine/physics/kinematics';

export const G = 9.8;
export const START_X = -0.2; // 小车初始位置（木板中点右侧为正）
export const GATE_OFFSET = 0.2; // 光电门相对起点的位移
export const TRAVEL = 0.42; // 小车行程
export const FRICTION_FORCE = 0.2; // 未补偿时的摩擦阻力（N）
export const BOARD_TOP = 0.02;

export interface L4Params {
  M: number;
  m0: number;
  compensated: boolean;
  flagWidth: number;
}

export interface L4State extends L4Params {
  stage: 'setup' | 'run' | 'analyze';
  speed: number;
  paused: boolean;
  /** 单步：每次 +1 让模拟时间前进 0.02 s */
  stepToken: number;
  runId: number;
  samples: Sample[];
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

export function buildL4Scene(api: SceneApi, getState: () => L4State): () => void {
  const { scene, camera, addAnchor, setAnchorText, onTick, draggable, setTarget } = api;
  // 取景在文件末尾统一按器材包围盒计算（fitCamera）

  // ---------- 台面与木板 ----------
  // 台面右边缘正好落在 x=0.5（木板末端）：滑轮夹在台边、砝码盘悬在台外下落，
  // 这样轮盘不会"悬空"，砝码也不会穿过台面。
  // 台面往前加长到一起把台边"顶"出画面，避免画面底部出现一条黑色断层
  // 右边缘必须留在 x≈0.51（木板末端）：砝码盘悬在台外下落。
  // 所以不加宽右边界，而是把整块台面往左挪、加宽加长，把画面左侧和底部一起盖住。
  const table = tableTop(1.5, 1.2);
  table.position.set(-0.24, 0, 0.05);
  scene.add(table);

  const plank = board(1.0);
  scene.add(plank);
  // 木板标注挪到板面前部靠右，避免和光电门/定滑轮的标注叠在一起
  addAnchor(plank, '长木板 1.00 m', undefined, new THREE.Vector3(0.3, 0.045, 0.05));

  // ---------- 打点计时器（左端） ----------
  const timer = tickerTimer();
  timer.position.set(-0.44, BOARD_TOP, 0);
  scene.add(timer);
  draggable(timer);
  const timerAnchor = addAnchor(timer, '电磁打点计时器 50 Hz · 纸带 0.02 s/点');

  const needleX = -0.41;

  // 纸带（随小车拉出，长度每帧更新）
  const tapeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.0008, 0.017), mat('paper'));
  tapeMesh.castShadow = true;
  tapeMesh.receiveShadow = false;
  scene.add(tapeMesh);

  // 纸带点（打点计时器 0.02 s 一点，位置由轨迹派生）
  const dotGeo = new THREE.SphereGeometry(0.0011, 6, 5);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x14181e });
  const dots: { mesh: THREE.Mesh; sAt: number }[] = [];
  const MAX_DOTS = 64;

  // ---------- 小车 ----------
  const car = cart({ mass: CART_MASS });
  car.position.set(START_X, BOARD_TOP, 0);
  scene.add(car);
  const carAnchor = addAnchor(car, `小车 M = ${(CART_MASS * 1000).toFixed(0)} g`);

  // 前端挂钩（细线拉向定滑轮）：钩心抬到轮顶切点高度，线才会平直
  const frontHook = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0012, 8, 14), mat('steel'));
  frontHook.rotation.y = Math.PI / 2;
  frontHook.position.set(0.066, 0.033, 0);
  car.add(frontHook);

  // ---------- 光电门 ----------
  const gate = photogate(0.05, 0.085);
  gate.position.set(START_X + GATE_OFFSET, BOARD_TOP, 0);
  scene.add(gate);
  draggable(gate);
  addAnchor(gate, '光电门');

  // ---------- 定滑轮 + 砝码 ----------
  // 滑轮直接夹在台面板边上（y=0），砝码盘悬在台外下落
  const PULLEY_X = 0.52;
  const pul = pulley();
  pul.position.set(PULLEY_X, 0, 0);
  scene.add(pul);
  draggable(pul);
  addAnchor(pul, '定滑轮', undefined, new THREE.Vector3(0, 0.11, 0));
  // 砝码盘标注放在盘下方一点，和定滑轮错开一行
  const weights = weightStack([0.05]);
  // 盘面比台面低 50 mm：竖直细线才有可见长度，否则盘沿贴着台面像"摆"在桌上
  const DISH_Y0 = -0.05;
  // 盘心正对轮缘右侧切点，竖直段细线自然垂到盘上，不会斜成一条"断线"
  weights.position.set(PULLEY_X + 0.025, DISH_Y0, 0);
  scene.add(weights);
  draggable(weights);
  const weightsAnchor = addAnchor(weights, '砝码盘 m0', undefined, new THREE.Vector3(0.01, 0.03, 0.03));

  // 细线加粗到 φ3.2 mm：原来 0.9 mm 在 0.5 m 视野里不到 1 px，远看就是"线断了"
  const ropeH = rope(0.0016);
  const ropeV = rope(0.0016);
  scene.add(ropeH, ropeV);
  // 绕在轮缘上的 90° 过渡段（顶 → 右），补掉折角处的缺口
  const ropeArc = pulleyArc(0.025, 0.0016);
  ropeArc.position.set(PULLEY_X, 0.03, 0);
  scene.add(ropeArc);

  const a1 = new THREE.Vector3();
  const a2 = new THREE.Vector3();

  const clearDots = () => {
    dots.forEach((d) => scene.remove(d.mesh));
    dots.length = 0;
  };

  let simT = 0;
  let lastRun = -1;
  let lastStep = 0;
  let finished = false;
  let dotIndex = 0;

  onTick((dt) => {
    const st = getState();
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
    const cartFront = cartX + 0.06;

    // 纸带：从打点针到车尾
    const tapeLen = Math.max(0.02, cartRear - needleX);
    tapeMesh.scale.x = tapeLen;
    tapeMesh.position.set(needleX + tapeLen / 2, BOARD_TOP + 0.0045, 0);

    // 逐点打印（按 0.02 s 节拍）
    while (dotIndex * TAPE_INTERVAL <= simT && dotIndex < 300) {
      const tp = sampleAt(st.samples, dotIndex * TAPE_INTERVAL);
      if (dots.length < MAX_DOTS) {
        const m = new THREE.Mesh(dotGeo, dotMat);
        m.position.set(needleX, BOARD_TOP + 0.0054, 0);
        scene.add(m);
        dots.push({ mesh: m, sAt: tp.x });
      }
      dotIndex++;
    }
    // 已打印的点随纸带一起移动
    for (const d of dots) {
      const x = needleX + (s.x - d.sAt);
      d.mesh.position.x = x;
      d.mesh.visible = x < cartRear - 0.004;
    }

    // 细线：水平段（车钩 → 轮顶切点）+ 轮缘弧段 + 竖直段（右切点 → 盘）
    a1.set(cartFront, 0.055, 0);
    a2.set(PULLEY_X, 0.055, 0);
    stretchRope(ropeH, a1, a2);
    a1.set(PULLEY_X + 0.025, 0.03, 0);
    // 接到砝码盘顶环（而不是盘沿），否则看着像线断了一截
    a2.set(PULLEY_X + 0.025, DISH_Y0 - s.x + 0.03, 0);
    stretchRope(ropeV, a1, a2);

    // 器材数值随布置参数同步
    setAnchorText(carAnchor, `小车 M = ${(st.M * 1000).toFixed(0)} g${st.compensated ? ' · 已平衡摩擦' : ''}`);
    setAnchorText(weightsAnchor, `砝码盘 m₀ = ${(st.m0 * 1000).toFixed(0)} g`);
    setAnchorText(timerAnchor, `电磁打点计时器 50 Hz · 纸带 0.02 s/点 · v = ${s.v.toFixed(2)} m/s`);
    (gate.userData.setReadout as ((t: string) => void) | undefined)?.(s.v.toFixed(2));

    // 砝码盘随位移下降
    weights.position.y = DISH_Y0 - s.x;
    pul.userData.wheel.rotation.x = -s.x / 0.025;
  });

  // 木板横铺 + 定滑轮 + 砝码盘下垂：整套器材左右宽、上下也高，用 24° 折中
  setTarget(fitCamera(camera, boxOfSubject(scene), { pitch: 26, yaw: 0.08, fill: 0.87, margin: 0.02 }));

  return () => {
    clearDots();
  };
}
