// L1 场景：研究匀变速直线运动（气垫导轨 1.20 m + 滑行器 + 电磁打点计时器 0.02 s + 光电门）
// 垫片把一端抬高 h → 沿轨加速度 a = g·h/L，全部读数由 kinematics 一条轨迹派生
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';
import { mat } from '@/engine/materials';
import { airTrack, cart, tickerTimer, photogate, tableTop, TAPE_INTERVAL } from '@/labs/_shared/instruments';
import { fitCamera, boxOfSubject } from '@/labs/_shared/framing';
import { simulate, sampleAt, type MotionModel, type Sample } from '@/engine/physics/kinematics';

export const G = 9.8;
export const RAIL_LEN = 1.2;
export const SURFACE_Y = 0.11;
export const START_U = -0.42; // 滑行器起点（导轨局部坐标）
export const TRAVEL = 0.84;
export const GATE_U = 0.06;
export const GATE_OFFSET = GATE_U - START_U;
export const CART_MASS = 0.155;
/** 导轨内部把 u∈[-0.6,0.6] 映射到以右端为原点的组坐标 */
const U0 = RAIL_LEN / 2;

export interface L1Params {
  h: number; // 垫片高度 m
  flagWidth: number;
}

export interface L1State extends L1Params {
  stage: 'setup' | 'run' | 'analyze';
  speed: number;
  paused: boolean;
  stepToken: number;
  runId: number;
  samples: Sample[];
  onProgress: (t: number) => void;
  onFinish: () => void;
}

/** a = g·sinθ = g·h/L（气垫近似无摩擦） */
export function theoryAccel(p: L1Params): number {
  return (G * p.h) / RAIL_LEN;
}

export function labModel(p: L1Params): MotionModel {
  return { accel: () => theoryAccel(p) };
}

export function buildSamples(p: L1Params): Sample[] {
  return simulate(labModel(p), { tEnd: 4, dt: 0.0005, stop: (s) => s.x >= TRAVEL });
}

export interface TapeDot {
  x: number; // 纸带展开后的横坐标（m，相对纸带起点）
  t: number;
}

export function buildL1Scene(api: SceneApi, getState: () => L1State): () => void {
  const { scene, camera, addAnchor, setAnchorText, onTick, draggable, setTarget } = api;
  // 取景在文件末尾统一按器材包围盒计算（fitCamera）

  // ---------- 台面 ----------
  const table = tableTop(2.4, 2.4);
  table.position.set(0, 0, 0.15);
  scene.add(table);

  // ---------- 可绕右端抬升的导轨组 ----------
  const pivot = new THREE.Group();
  pivot.position.set(U0, 0, 0);
  scene.add(pivot);

  const rail = airTrack(RAIL_LEN);
  rail.position.x = -U0;
  pivot.add(rail);
  addAnchor(rail, '气垫导轨 1.20 m');

  // 垫片（垫在左脚下方，高度随 h 变化）
  const shim = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1, 0.08), mat('wood', { color: 0x8a6a44 }));
  // 放在左脚下方：原来贴在导轨端头，离支脚 27 cm，看起来像台面上凭空一块木块
  shim.position.set(-0.3, 0, 0);
  shim.scale.y = 0.02;
  shim.position.y = 0.01;
  scene.add(shim);
  const shimAnchor = addAnchor(shim, '垫片 h = 30 mm');

  // ---------- 滑行器 + 挡光片 ----------
  let sled = cart({ mass: CART_MASS, flagWidth: 0.02 });
  pivot.add(sled);
  const sledAnchor = addAnchor(sled, '滑行器 155 g · 挡光片 20 mm');

  // ---------- 打点计时器（左端，纸带由此拉出） ----------
  const timer = tickerTimer();
  const TIMER_U = -0.5;
  timer.position.set(TIMER_U - U0, SURFACE_Y - 0.004, 0);
  pivot.add(timer);
  draggable(timer);
  addAnchor(timer, '电磁打点计时器 0.02 s', undefined, 0.16);

  // ---------- 光电门（导轨中段，测挡光时间） ----------
  const gate = photogate(0.05, 0.16);
  gate.position.set(GATE_U - U0, SURFACE_Y - 0.02, 0);
  pivot.add(gate);
  const gateAnchor = addAnchor(gate, '光电门 v = d/Δt');
  const gateReadout = gate.userData.setReadout as ((t: string) => void) | undefined;

  // ---------- 纸带（展开在导轨前方，间距即真实点距） ----------
  const tape = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.002, 0.036), mat('paper'));
  tape.position.set(-U0 + 0.52, 0.002, 0.1);
  tape.castShadow = true; // 落一点影，纸带才不会像贴纸浮在台面上
  scene.add(tape);
  addAnchor(tape, '纸带（展开）');

  const dotGeo = new THREE.CircleGeometry(0.0035, 10);
  const dotMat = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.9, metalness: 0 });
  const dotRoot = new THREE.Group();
  dotRoot.position.set(-U0 + 0.02, 0.0035, 0.16);
  dotRoot.rotation.x = -Math.PI / 2;
  scene.add(dotRoot);

  let dots: THREE.Mesh[] = [];
  const clearDots = () => {
    for (const d of dots) { dotRoot.remove(d); }
    dots = [];
  };

  let simT = 0;
  let lastRun = -1;
  let lastStep = 0;
  let finished = false;
  let printed = 0;

  // 挡光片独立材质，挡光瞬间点亮（不污染共享材质）
  let flagMesh: THREE.Mesh | null = null;
  const bindFlag = () => {
    const f = sled.children.find((c) => c.name === 'flag') as THREE.Mesh | undefined;
    if (f) {
      f.material = (f.material as THREE.MeshStandardMaterial).clone();
      flagMesh = f;
    }
  };

  let lastH = -1;
  let lastFlag = -1;

  const resetMotion = () => {
    simT = 0;
    finished = false;
    printed = 0;
    clearDots();
  };

  const rebuild = () => {
    const st = getState();
    lastH = st.h;
    lastFlag = st.flagWidth;

    // 轨枕绕右端（支点）抬起：左脚在支点左侧 0.9 m，抬高量 = 0.9·sinθ ≈ 0.75 h
    const angle = Math.asin(Math.min(0.2, st.h / RAIL_LEN));
    pivot.rotation.z = -angle;
    const footRise = Math.max(0.004, 0.9 * Math.sin(angle));
    shim.scale.y = footRise;
    shim.position.y = footRise / 2;

    // 挡光片宽度直接缩放挡光片本体（重建整车会丢掉已绑定的材质与标注）
    const flag = sled.children.find((c) => c.name === 'flag');
    if (flag) flag.scale.x = st.flagWidth / 0.02;

    setAnchorText(shimAnchor, `垫片 h = ${(st.h * 1000).toFixed(0)} mm`);
    setAnchorText(sledAnchor, `滑行器 155 g · 挡光片 ${(st.flagWidth * 1000).toFixed(0)} mm`);
  };

  onTick((dt) => {
    const st = getState();
    if (st.runId !== lastRun) {
      lastRun = st.runId;
      lastStep = st.stepToken;
      resetMotion();
      rebuild();
    } else if (st.h !== lastH || st.flagWidth !== lastFlag) {
      // 布置参数一改就立刻重算倾角/垫片并归零：否则旧 simT 会套到新轨迹上，
      // 表现为「调垫片高度，小车反而跳了位置」
      rebuild();
      resetMotion();
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

    // 滑行器：位移直接取自求解器轨迹
    const cur = sampleAt(st.samples, simT);
    sled.position.set(START_U + cur.x - U0, SURFACE_Y, 0);

    // 纸带：每 0.02 s 打一点，点落在展开纸带上材料坐标 x(t_i) 处
    while (printed * TAPE_INTERVAL <= simT + 1e-9) {
      if (dots.length < 240) {
        const ti = printed * TAPE_INTERVAL;
        const d = new THREE.Mesh(dotGeo, dotMat);
        d.position.set(0.02 + sampleAt(st.samples, ti).x, 0, 0);
        dotRoot.add(d);
        dots.push(d);
      }
      printed++;
    }

    // 挡光片进入光电门 → 高亮
    const inGate = Math.abs(START_U + cur.x - GATE_U) < 0.025;
    if (flagMesh) {
      (flagMesh.material as THREE.MeshStandardMaterial).emissive.setHex(inGate ? 0x551111 : 0x000000);
    }
    // 光电门数显跟着小车实时速度走，布置参数一改就同步刷新
    gateReadout?.(cur.v.toFixed(2));
    setAnchorText(gateAnchor, `光电门 v = d/Δt = ${cur.v.toFixed(2)} m/s`);
  });

  // 导轨是 1.2 m 长条，靠俯角/占比两个参数定构图：俯角小才能看清导轨侧面的金属高光
  setTarget(fitCamera(camera, boxOfSubject(scene), { pitch: 16, yaw: 0.06, fill: 0.9, margin: 0.02 }));

  bindFlag();
  rebuild();
  clearDots();
  return () => { clearDots(); };
}
