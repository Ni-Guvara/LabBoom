// L7 场景：验证机械能守恒（铁架台 + 电磁释放夹 + 重锤 + 双光电门）
// 重锤自由下落，两门测 v1、v2；ΔEp = mgΔh 与 ΔEk = ½m(v2²−v1²) 对比，含少量空气阻力
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';
import { mat } from '@/engine/materials';
import { retortStand, plumb, releaseClamp, tableTop, textPlate } from '@/labs/_shared/instruments';
import { fitCamera, boxOfSubject } from '@/labs/_shared/framing';
import { simulate, sampleAt, gateReadings, type MotionModel, type Sample } from '@/engine/physics/kinematics';

export const G = 9.8;
export const RELEASE_Y = 0.82; // 释放点高度
export const GATE1_Y = 0.55;
export const GATE2_Y_DEFAULT = 0.25;
/** 空气阻力系数：F = c·v²（N） */
const DRAG_C = 0.0022;
const ROD_X = -0.25; // 铁架台立杆位置（retortStand 局部 rodX=-0.05，整体 x=-0.2）

export interface L7Params {
  mass: number;
  gate2Y: number;
  shadeWidth: number;
}

export interface L7State extends L7Params {
  stage: 'setup' | 'run' | 'analyze';
  speed: number;
  paused: boolean;
  stepToken: number;
  runId: number;
  samples: Sample[];
  onProgress: (t: number) => void;
  onFinish: () => void;
}

export const x1 = RELEASE_Y - GATE1_Y;
export function x2Of(p: L7Params): number {
  return RELEASE_Y - p.gate2Y;
}
export function deltaH(p: L7Params): number {
  return GATE1_Y - p.gate2Y;
}

export function labModel(p: L7Params): MotionModel {
  return { accel: (s) => G - (DRAG_C / p.mass) * s.v * s.v };
}

export function buildSamples(p: L7Params): Sample[] {
  const end = x2Of(p) + 0.02;
  return simulate(labModel(p), { tEnd: 1.2, dt: 0.0002, stop: (s) => s.x >= end });
}

export interface L7Gates {
  v1: number;
  v2: number;
  dt1: number;
  dt2: number;
  t1: number;
  t2: number;
}

export function measure(p: L7Params, samples: Sample[]): L7Gates | null {
  const gs = gateReadings(samples, [
    { id: 'G1', x: x1, flagWidth: p.shadeWidth },
    { id: 'G2', x: x2Of(p), flagWidth: p.shadeWidth },
  ]);
  if (gs.length < 2) return null;
  return { v1: gs[0].v, v2: gs[1].v, dt1: gs[0].blockTime, dt2: gs[1].blockTime, t1: gs[0].tIn, t2: gs[1].tIn };
}

/**
 * 光电门（局部坐标：光束高度 = y 0，整组用 position.y 调高度）
 * U 形叉头 + 红外发射/接收窗 + 数显窗 + 指示灯 + 手轮，
 * 再用横臂 + 十字夹夹在铁架台立杆上——原来横臂悬在半空，看着和支架没连接。
 */
function gateUnit(gap = 0.05): THREE.Group {
  const g = new THREE.Group();
  const armX = gap / 2 + 0.007;

  // 顶梁 + 左右两爪（爪沿 x 分开、光束沿 x 穿过）：从正面能看见重锤从两爪之间落下，
  // 若改成前后两片，正面看就把重锤整个挡住了。
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(gap + 0.03, 0.012, 0.034), mat('plasticBlack'));
  bridge.position.set(0, 0.042, 0);
  bridge.castShadow = true;
  g.add(bridge);

  for (const sx of [-1, 1]) {
    // 中灰工程塑料：纯黑在背光侧会糊成一团黑影，看不出叉头结构
    const prong = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.062, 0.034), mat('plasticGray', { color: 0x555e68 }));
    prong.position.set(sx * armX, 0.006, 0);
    prong.castShadow = true;
    g.add(prong);
    // 红外发射/接收窗（正对重锤下落路径）
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0034, 0.0034, 0.004, 14),
      mat('plasticRed', { emissive: sx < 0 ? 0x772211 : 0x220000 }),
    );
    lens.rotation.z = Math.PI / 2;
    lens.position.set(sx * (gap / 2 - 0.002), 0, 0);
    g.add(lens);
  }

  // 数显窗：挡光时间 / 速度直接做在器材面板上（常显，不走 2 s 悬停）
  const plate = textPlate(0.044, 0.016, '--', { fontSize: 78 });
  plate.mesh.position.set(0, 0.042, 0.0175);
  g.add(plate.mesh);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 10, 8), mat('plasticRed', { emissive: 0x772211 }));
  led.position.set(0.023, 0.048, 0.0175);
  g.add(led);

  // 叉头锁紧手轮
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 14), mat('plasticBlack'));
  knob.position.set(-0.01, 0.051, 0);
  g.add(knob);

  // 横臂：从顶梁左端伸到立杆
  const barLen = -ROD_X - (gap / 2 + 0.014);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(barLen, 0.009, 0.011), mat('steel', { color: 0x9aa4ad }));
  bar.position.set(ROD_X + barLen / 2, 0.042, 0);
  bar.castShadow = true;
  g.add(bar);

  // 立杆上的十字夹 + 压紧手轮
  const clampBox = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.026, 0.024), mat('steel', { color: 0x9aa4ad }));
  clampBox.position.set(ROD_X, 0.042, 0);
  g.add(clampBox);
  const clampKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.008, 14), mat('plasticBlack'));
  clampKnob.rotation.x = Math.PI / 2;
  clampKnob.position.set(ROD_X, 0.042, 0.018);
  g.add(clampKnob);

  g.userData.setReadout = (t: string) => plate.setText(t);
  g.userData.spec = { name: '光电门', size: [0.04, 0.07, gap + 0.04] };
  return g;
}

export function buildL7Scene(api: SceneApi, getState: () => L7State): () => void {
  const { scene, camera, addAnchor, setAnchorText, onTick, draggable, setTarget } = api;
  // 取景在文件末尾统一按器材包围盒计算（fitCamera）

  const table = tableTop(2.4, 2.4);
  scene.add(table);

  // 整套器材放进一个 rig：布置阶段可以整体挪位置，运行阶段锁定
  const rig = new THREE.Group();
  rig.name = 'rig';
  scene.add(rig);
  // 铁架台 + 重锤 + 两个光电门整体可摆（运行态锁定：重锤已按轨迹下落，位置不能再变）
  draggable(rig, { plane: 'floor', canDrag: () => getState().stage === 'setup' });

  // 铁架台 + 横臂 + 释放夹（夹口正对重锤吊环，锤体悬在夹口下方）
  const stand = retortStand(0.95);
  stand.position.set(-0.2, 0, 0);
  rig.add(stand);
  addAnchor(stand, '铁架台 0.95 m');

  const clamp = releaseClamp();
  clamp.position.set(0, RELEASE_Y + 0.05, 0);
  rig.add(clamp);
  addAnchor(clamp, '电磁释放夹');

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.01, 0.012), mat('steel', { color: 0x9aa4ad }));
  arm.position.set(-0.13, RELEASE_Y + 0.065, 0);
  rig.add(arm);

  const hammerLabel = (st: L7State) =>
    `重锤 m = ${(st.mass * 1000).toFixed(0)} g · 遮光片 d = ${(st.shadeWidth * 1000).toFixed(1)} mm`;
  const gateLabel = (st: L7State, h: number, which: 1 | 2) =>
    `光电门 ${which} · h = ${h.toFixed(2)} m · 挡光 d = ${(st.shadeWidth * 1000).toFixed(1)} mm`;

  const init = getState();
  let hammer = plumb(init.mass, init.shadeWidth);
  hammer.position.set(0, RELEASE_Y, 0);
  rig.add(hammer);
  let hammerAnchor = addAnchor(hammer, hammerLabel(init));

  // 光电门：整组只建一次，改高度就是 position.y —— 拖动滑块立刻能看到门在动
  const gate1 = gateUnit();
  gate1.position.y = GATE1_Y;
  rig.add(gate1);
  const gate1Anchor = addAnchor(gate1, gateLabel(init, GATE1_Y, 1), undefined, new THREE.Vector3(0, 0.1, 0));

  const gate2 = gateUnit();
  gate2.position.y = init.gate2Y;
  rig.add(gate2);
  const gate2Anchor = addAnchor(gate2, gateLabel(init, init.gate2Y, 2), undefined, new THREE.Vector3(0, 0.1, 0));

  const setReadout = (g: THREE.Group, text: string) => (g.userData.setReadout as (t: string) => void)(text);

  let simT = 0;
  let lastRun = -1;
  let lastStep = 0;
  let finished = false;
  let measKey = '';
  let meas: L7Gates | null = null;

  onTick((dt) => {
    const st = getState();
    if (st.runId !== lastRun) {
      lastRun = st.runId;
      lastStep = st.stepToken;
      simT = 0;
      finished = false;
    }

    // 布置参数一变，器材立刻跟着变（原来只在点"释放"后才生效，看起来像"没反应"）
    gate2.position.y = st.gate2Y;
    if ((hammer.userData.mass as number) !== st.mass || Math.abs((hammer.userData.shadeWidth as number) - st.shadeWidth) > 1e-9) {
      rig.remove(hammer);
      hammer = plumb(st.mass, st.shadeWidth);
      hammer.position.set(0, RELEASE_Y, 0);
      rig.add(hammer);
      hammerAnchor = addAnchor(hammer, hammerLabel(st));
    }

    const end = st.samples.length ? st.samples[st.samples.length - 1].t : 0;
    if (st.stage === 'run' && !st.paused) {
      simT = Math.min(end, simT + dt * st.speed);
      st.onProgress(simT);
    }
    if (st.stepToken !== lastStep) {
      lastStep = st.stepToken;
      simT = Math.min(end, simT + 0.01);
      st.onProgress(simT);
    }
    if (st.stage === 'run' && simT >= end && end > 0 && !finished) {
      finished = true;
      st.onFinish();
    }
    const s = sampleAt(st.samples, simT);
    hammer.position.set(0, RELEASE_Y - s.x, 0);

    setAnchorText(hammerAnchor, hammerLabel(st));
    setAnchorText(gate2Anchor, gateLabel(st, st.gate2Y, 2));

    // 读数窗：布置阶段显示 --，跑过之后显示该门测到的速度
    if (st.stage === 'setup') {
      meas = null;
      measKey = '';
      setReadout(gate1, '--');
      setReadout(gate2, '--');
      setAnchorText(gate1Anchor, gateLabel(st, GATE1_Y, 1));
    } else {
      const key = `${st.mass}|${st.gate2Y}|${st.shadeWidth}`;
      if (key !== measKey) {
        measKey = key;
        meas = measure(st, st.samples);
      }
      if (meas) {
        setReadout(gate1, meas.v1.toFixed(2));
        setReadout(gate2, meas.v2.toFixed(2));
        setAnchorText(gate1Anchor, `光电门 1 · v₁ = ${meas.v1.toFixed(2)} m/s · h = ${GATE1_Y.toFixed(2)} m`);
        setAnchorText(gate2Anchor, `光电门 2 · v₂ = ${meas.v2.toFixed(2)} m/s · h = ${st.gate2Y.toFixed(2)} m`);
      }
    }
  });
  // 支架高、摆锤落差大：俯角压到 12°，否则摆长和光电门间距会被压缩看不出来
  setTarget(fitCamera(camera, boxOfSubject(scene), { pitch: 16, yaw: 0.3, fill: 0.95, margin: 0.015 }));
  return () => {};
}
