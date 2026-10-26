// L5 场景：研究平抛运动（斜槽 + 钢球 + 5 cm 方格描迹板）
// 斜槽末端水平，小球离槽后 x=v0·t、y=Y0-½gt²；频闪点落在竖直描迹板上留痕
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';
import { mat } from '@/engine/materials';
import { tableTop } from '@/labs/_shared/instruments';
import { fitCamera, boxOf } from '@/labs/_shared/framing';

export const G = 9.8;
export const STROBE = 0.05;
export const Y0 = 0.34; // 抛出点高度（球心）
export const BALL_R = 0.008;

const RAMP_ANG = (35 * Math.PI) / 180;
const RAMP_LEN = 0.46;

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

/** 斜槽末端速度：由能量关系 v0 = √(2gH·η)，η 为滚阻/转动损耗 */
export function v0Of(p: L5Params): number {
  return Math.sqrt(2 * G * Math.max(0.02, p.releaseH) * 0.8);
}

/**
 * 落地时刻：球心落到离桌面一个半径时即触地（原来按 y=0 判定，
 * 球心到 0 意味着半个球已经沉进桌面，看起来就是"穿模到地里"）。
 */
export function flightTime(): number {
  return Math.sqrt((2 * (Y0 - BALL_R)) / G);
}

export interface Dot { t: number; x: number; y: number }

/** 频闪点：x = v0·t，y = Y0 − ½gt² */
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

export function buildL5Scene(api: SceneApi, getState: () => L5State): () => void {
  const { scene, camera, addAnchor, setAnchorText, onTick, draggable, setTarget } = api;

  const table = tableTop(2.4, 2.4);
  scene.add(table);

  // 整套器材放进一个 rig：布置阶段可以整体挪位置，运行阶段锁定
  const rig = new THREE.Group();
  rig.name = 'rig';
  scene.add(rig);
  // 斜槽 + 钢球 + 描迹板是一套：布置阶段整体可摆，抛出点与落点一起挪，轨迹才是自洽的
  draggable(rig, { plane: 'floor', canDrag: () => getState().stage === 'setup' });

  // ---------- 斜槽：倾斜段 + 末端水平导出段 ----------
  // 平抛的前提是"离槽速度水平"。原来末端就是 35° 斜坡，球出槽是斜向下飞的，
  // 不构成平抛；这里在出口补 160 mm 水平直段，球在该段走完时速度已完全水平。
  const EXIT = 0.16;
  const ramp = new THREE.Group();
  // 槽底面 = 球心高度 − 球半径：球在水平段滚动时球心正好在 Y0，离槽后 y(t)=Y0−½gt²
  const RAIL_Y = Y0 - BALL_R - 0.003;

  // 水平导出段：x ∈ [-EXIT, 0]
  const exitTrough = new THREE.Mesh(new THREE.BoxGeometry(EXIT, 0.006, 0.046), mat('aluminum'));
  exitTrough.position.set(-EXIT / 2, RAIL_Y, 0);
  exitTrough.castShadow = true;
  ramp.add(exitTrough);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(EXIT, 0.016, 0.004), mat('aluminum'));
    wall.position.set(-EXIT / 2, RAIL_Y + 0.011, side * 0.025);
    ramp.add(wall);
  }
  // 出口端唇口（略微外翻，避免球在端头被台阶磕一下）
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.046), mat('aluminum'));
  lip.position.set(0.002, RAIL_Y - 0.001, 0);
  ramp.add(lip);

  // 倾斜段：从水平段左端 (-EXIT, RAIL_Y) 向斜上方
  const cx = -EXIT - Math.cos(RAMP_ANG) * (RAMP_LEN / 2);
  const cy = RAIL_Y + Math.sin(RAMP_ANG) * (RAMP_LEN / 2);
  const trough = new THREE.Mesh(new THREE.BoxGeometry(RAMP_LEN, 0.006, 0.046), mat('aluminum'));
  trough.position.set(cx, cy, 0);
  trough.rotation.z = -RAMP_ANG;
  trough.castShadow = true;
  ramp.add(trough);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(RAMP_LEN, 0.018, 0.004), mat('aluminum'));
    wall.position.set(cx, cy + 0.003, side * 0.025);
    wall.rotation.z = -RAMP_ANG;
    ramp.add(wall);
  }
  // 斜面顶端小挡板（限位，保证每次同一位置释放）
  const stopper = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.05), mat('plasticRed'));
  stopper.position.set(cx - Math.cos(RAMP_ANG) * (RAMP_LEN / 2) + 0.004, cy + Math.sin(RAMP_ANG) * (RAMP_LEN / 2) + 0.004, 0);
  ramp.add(stopper);

  // 支腿：竖直撑到桌面；水平段下方也要有支腿，否则出口是悬空的
  const topAt = (x: number) => (x >= -EXIT ? RAIL_Y : RAIL_Y + (-x - EXIT) * Math.tan(RAMP_ANG));
  const legAt = (x: number) => {
    const h = topAt(x) - 0.008;
    if (h <= 0.02) return;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, h, 12), mat('steel'));
    leg.position.set(x, h / 2, 0);
    ramp.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.006, 16), mat('steel'));
    foot.position.set(x, 0.003, 0);
    ramp.add(foot);
  };
  legAt(-0.05);
  legAt(-EXIT - 0.16);
  legAt(-EXIT - 0.34);
  rig.add(ramp);
  const rampAnchor = addAnchor(ramp, '斜槽（末端水平段 160 mm）');

  // ---------- 钢球 ----------
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 18), mat('steel', { roughness: 0.22 }));
  ball.castShadow = true;
  rig.add(ball);
  const ballAnchor = addAnchor(ball, '钢球 φ16 mm');

  // ---------- 竖直描迹板（球后侧，5 cm 方格） ----------
  const boardGrp = new THREE.Group();
  const BOARD_X0 = -0.02;
  const BOARD_W = 0.66;
  const BOARD_H = 0.42;
  // 描图纸不是纯白：0xf1ede4 在 2.15 的主光下会直接顶到 255 成一整块白板，
  // 方格线和纸纤维全部消失。压到米黄色后才有纸的层次。
  const panel = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W, BOARD_H, 0.008), mat('paper', { color: 0xd8d1bd }));
  panel.position.set(BOARD_X0 + BOARD_W / 2, BOARD_H / 2, -0.05);
  panel.receiveShadow = true;
  boardGrp.add(panel);

  const base = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W, 0.02, 0.07), mat('wood', { color: 0x6f4b2c }));
  base.position.set(BOARD_X0 + BOARD_W / 2, 0.01, -0.05);
  boardGrp.add(base);

  // 线必须离开纸面 3 mm：只差 1 mm 时和板面前表面 z-fighting，方格线会被纸"吃掉"
  const lineMat = new THREE.LineBasicMaterial({ color: 0x5d6874, transparent: true, opacity: 0.8 });
  const pts: THREE.Vector3[] = [];
  const zLine = -0.043;
  for (let i = 0; i <= 18; i++) {
    const x = BOARD_X0 + i * 0.05;
    if (x > BOARD_X0 + BOARD_W + 1e-6) break;
    pts.push(new THREE.Vector3(x, 0.02, zLine), new THREE.Vector3(x, BOARD_H, zLine));
  }
  for (let j = 0; j <= 8; j++) {
    const y = j * 0.05;
    pts.push(new THREE.Vector3(BOARD_X0, y, zLine), new THREE.Vector3(BOARD_X0 + BOARD_W, y, zLine));
  }
  boardGrp.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  rig.add(boardGrp);
  addAnchor(panel, '描迹板（5 cm 方格）');

  // 取景：斜槽 + 描迹板一起入画。俯角放小一点（描迹板是竖直的，太俯就看不见方格）
  setTarget(fitCamera(camera, boxOf(ramp, ball, boardGrp), { pitch: 21, yaw: 0.3, fill: 0.86, margin: 0.02 }));

  // ---------- 频闪留痕 ----------
  const dotGeo = new THREE.SphereGeometry(0.005, 10, 8);
  const dotMat = new THREE.MeshStandardMaterial({ color: 0xd93b3b, roughness: 0.7 });
  let dots: THREE.Mesh[] = [];
  const clearDots = () => { for (const d of dots) rig.remove(d); dots = []; };

  let simT = 0;
  let lastRun = -1;
  let lastStep = 0;
  let finished = false;
  let shot = 0;

  onTick((dt) => {
    const st = getState();
    if (st.runId !== lastRun) {
      lastRun = st.runId;
      lastStep = st.stepToken;
      simT = 0;
      finished = false;
      shot = 0;
      clearDots();
    }
    const tf = flightTime();
    if (st.stage === 'run' && !st.paused) {
      simT = Math.min(tf, simT + dt * st.speed);
      st.onProgress(simT);
    }
    if (st.stepToken !== lastStep) {
      lastStep = st.stepToken;
      simT = Math.min(tf, simT + STROBE);
      st.onProgress(simT);
    }
    if (st.stage === 'run' && simT >= tf - 1e-9 && !finished) {
      finished = true;
      st.onFinish();
    }

    const v0 = v0Of(st);
    const t = simT;
    // 触地后停在桌面上，不再继续往下沉
    const yBall = Math.max(BALL_R, Y0 - 0.5 * G * t * t);
    ball.position.set(v0 * t, yBall, 0);

    // 布置参数变化 → 器材数值同步
    setAnchorText(rampAnchor, `斜槽 h = ${(st.releaseH * 1000).toFixed(0)} mm · v₀ = ${v0.toFixed(2)} m/s`);
    setAnchorText(
      ballAnchor,
      `钢球 φ16 mm · y = ${(yBall * 1000).toFixed(0)} mm · v = ${Math.hypot(v0, G * t).toFixed(2)} m/s`,
    );

    while (shot * STROBE <= simT + 1e-9 && shot < 20) {
      const tt = shot * STROBE;
      const d = new THREE.Mesh(dotGeo, dotMat);
      d.position.set(v0 * tt, Math.max(BALL_R, Y0 - 0.5 * G * tt * tt), 0.004);
      rig.add(d);
      dots.push(d);
      shot++;
    }
  });

  clearDots();
  return () => { clearDots(); };
}
