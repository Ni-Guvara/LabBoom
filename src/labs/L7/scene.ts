// L7 场景：验证机械能守恒（铁架台 + 电磁释放夹 + 重锤 + 双光电门）
// 重锤自由下落，两门测 v1、v2；ΔEp = mgΔh 与 ΔEk = ½m(v2²−v1²) 对比，含少量空气阻力
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';
import { mat } from '@/engine/materials';
import { retortStand, plumb, releaseClamp, tableTop, textPlate } from '@/labs/_shared/instruments';
import { fitCamera, boxOfSubject } from '@/labs/_shared/framing';
import { loadOrFallback } from '@/labs/_shared/models';
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
  // 落点：锤底落到桌面附近就停（锤体高约 36 mm），不要停在下门里——
  // 原来只多跑 20 mm，重锤正好卡在下门的叉板中间，看着像被门卡住了。
  const end = Math.max(x2Of(p) + 0.02, RELEASE_Y - 0.045);
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
 * 自由落体光电门的程序化兜底（仅在 drop_gate.glb 加载失败时使用）
 *
 * 门头结构是这套器材最容易做错的地方：落体是竖直穿过门的，所以两片叉板必须
 * 左右分开、上下完全敞开（净空 46 mm），重锤从两片之间竖直落下去，光束沿 x
 * 横穿这片空隙。之前做成"开口朝下的 U 形"——两爪之间确实有 50 mm，但顶上还压着
 * 一根 80 mm 宽的顶梁，正好横在落体线正上方，重锤一下落就撞梁。
 * 数显盒、指示灯全部退到落体线后方（z < −30 mm），横臂也从后方绕到立杆，
 * 保证下落路径上没有任何实体。
 *
 * 尺寸与 blender/build_drop_gate.py 逐项对齐：叉板中心 ±29、净空 46、数显盒 −35、
 * 横臂高 30、横臂末端到立杆 x = −0.25。改这里必须同步改 Blender 脚本。
 */
function fallbackGate(): THREE.Group {
  const g = new THREE.Group();
  const X_PRONG = 0.029; // 叉板中心：内表面 ±23 mm → 净空 46 mm，容得下 40 mm 遮光片
  const BACK_Z = -0.035; // 数显盒中心（前表面 -30 mm，重锤后缘 -15 mm 仍留 15 mm 余量）
  const BAR_Y = 0.030;

  // 数显盒：读数窗、指示灯、锁紧手轮都装在这块上，整块躲在落体线后面
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.084, 0.010), mat('plasticGray', { color: 0x555e68 }));
  back.position.set(0, -0.008, BACK_Z);
  back.castShadow = true;
  g.add(back);

  for (const sx of [-1, 1]) {
    // 竖直叉板：48 mm 高的一小段，上下敞开、顶上不加横梁
    const prong = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.048, 0.030), mat('plasticBlack'));
    prong.position.set(sx * X_PRONG, 0.002, -0.010);
    prong.castShadow = true;
    g.add(prong);
    // 红外发射/接收窗：嵌在两片内侧，正对 46 mm 的缝
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0034, 0.0034, 0.004, 14),
      mat('plasticRed', { emissive: sx < 0 ? 0x772211 : 0x220000 }),
    );
    lens.rotation.z = Math.PI / 2;
    lens.position.set(sx * (X_PRONG - 0.007), 0.002, -0.010);
    g.add(lens);
  }

  // 数显窗底板由 glb/兜底各自做，读数面统一由 makeGate() 贴（见下）
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 10, 8), mat('plasticRed', { emissive: 0x772211 }));
  led.position.set(-0.016, 0.020, BACK_Z + 0.0058);
  g.add(led);

  // 数显盒右侧的锁紧手轮
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 14), mat('plasticBlack'));
  knob.rotation.z = Math.PI / 2;
  knob.position.set(0.030, -0.008, BACK_Z);
  g.add(knob);

  // 横臂：从数显盒上沿（落体线后方）伸到立杆
  const barLen = -ROD_X - 0.021;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(barLen, 0.009, 0.011), mat('steel', { color: 0x9aa4ad }));
  bar.position.set(ROD_X + barLen / 2, BAR_Y, BACK_Z);
  bar.castShadow = true;
  g.add(bar);

  // 立杆上的十字夹 + 压紧手轮
  const clampBox = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.028, 0.045), mat('steel', { color: 0x9aa4ad }));
  clampBox.position.set(ROD_X, BAR_Y, -0.020);
  g.add(clampBox);
  const clampKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.008, 14), mat('plasticBlack'));
  clampKnob.rotation.x = Math.PI / 2;
  clampKnob.position.set(ROD_X, BAR_Y, 0.004);
  g.add(clampKnob);

  return g;
}

/** 数显窗中心（glb 只建了 display_bezel 底板，读数面留白给 canvas 贴图） */
const DISPLAY = new THREE.Vector3(0, -0.038, -0.0295);
const DISPLAY_SIZE = { w: 0.040, h: 0.014 };

/**
 * 取一台光电门：优先 drop_gate.glb，失败回退程序化。
 * 读数面两种来源都要贴，所以放在这里而不是各自 `Gate()` 里——否则 glb 版会没有读数。
 */
async function makeGate(): Promise<THREE.Group> {
  const m = await loadOrFallback('drop_gate', fallbackGate);
  const g = m.root;
  const plate = textPlate(DISPLAY_SIZE.w, DISPLAY_SIZE.h, '0.00', { fontSize: 78 });
  plate.mesh.position.copy(DISPLAY);
  g.add(plate.mesh);
  g.userData.setReadout = (t: string) => plate.setText(t);
  g.userData.spec = { name: '光电门', size: [0.06, 0.12, 0.06] };
  return g;
}

export async function buildL7Scene(api: SceneApi, getState: () => L7State): Promise<() => void> {
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
  // 两次 makeGate 共用同一份 glb 模板（loader 有缓存），不会重复下载
  const gate1 = await makeGate();
  gate1.position.y = GATE1_Y;
  rig.add(gate1);
  const gate1Anchor = addAnchor(gate1, gateLabel(init, GATE1_Y, 1), undefined, new THREE.Vector3(0, 0.1, 0));

  const gate2 = await makeGate();
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

    // 读数窗：布置阶段一律 0.00；重锤真正挡光结束之后，该门才定格显示自己的速度。
    // （原来一进 run 就把两门的最终读数整组算好写上，等于"还没落下来数字就已经有了"）
    if (st.stage === 'setup') {
      meas = null;
      measKey = '';
      setReadout(gate1, '0.00');
      setReadout(gate2, '0.00');
      setAnchorText(gate1Anchor, gateLabel(st, GATE1_Y, 1));
    } else {
      const key = `${st.mass}|${st.gate2Y}|${st.shadeWidth}`;
      if (key !== measKey) {
        measKey = key;
        meas = measure(st, st.samples);
      }
      const passed1 = !!meas && simT >= meas.t1 + meas.dt1;
      const passed2 = !!meas && simT >= meas.t2 + meas.dt2;
      setReadout(gate1, passed1 ? meas!.v1.toFixed(2) : '0.00');
      setReadout(gate2, passed2 ? meas!.v2.toFixed(2) : '0.00');
      setAnchorText(
        gate1Anchor,
        passed1 ? `光电门 1 · v₁ = ${meas!.v1.toFixed(2)} m/s · h = ${GATE1_Y.toFixed(2)} m` : gateLabel(st, GATE1_Y, 1),
      );
      setAnchorText(
        gate2Anchor,
        passed2 ? `光电门 2 · v₂ = ${meas!.v2.toFixed(2)} m/s · h = ${st.gate2Y.toFixed(2)} m` : gateLabel(st, st.gate2Y, 2),
      );
    }
  });
  // 铁架台 0.97 m 高而横向只有 0.35 m：这是一根"细长条"，取景最容易翻车。
  // fill 给到 0.95 时包围盒直接顶到画幅四边（透视 + 偏航还会溢出），立杆顶端与重锤落点被切；
  // 满屏舞台下 0.88 + 0.04 边距正好：整根立杆、三个门头、底座全在画内且占满竖向。
  setTarget(fitCamera(camera, boxOfSubject(scene), { pitch: 14, yaw: 0.28, fill: 0.88, margin: 0.04 }));
  return () => {};
}
