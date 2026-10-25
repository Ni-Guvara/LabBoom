// L3 场景：探究两个互成角度的力的合成规律（方木板 + 白纸 + 三只弹簧测力计）
// 木板平放桌面，结点在纸面上受两个拉力；第三只测力计沿合力方向把结点拉到同一点（等效替代）
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';
import { mat } from '@/engine/materials';
import { tableTop, rope, stretchRope, dynamometer } from '@/labs/_shared/instruments';
import { fitCamera, boxOfSubject } from '@/labs/_shared/framing';

export interface L3Params {
  f1: number; // N
  f2: number; // N
  deg: number; // 夹角 °
}

export interface L3State extends L3Params {
  stage: 'setup' | 'run' | 'analyze';
  progress: number; // 0..1 读数稳定进度
  runId: number;
  onProgress: (t: number) => void;
  onFinish: () => void;
}

/** 理论合力（平行四边形定则） */
export function resultant(p: L3Params): number {
  const t = (p.deg * Math.PI) / 180;
  return Math.sqrt(p.f1 * p.f1 + p.f2 * p.f2 + 2 * p.f1 * p.f2 * Math.cos(t));
}

/** 单只测力计直接测合力（含 ±0.8% 读数系统差） */
export function measured(p: L3Params): number {
  return resultant(p) * (1 - 0.008);
}

const SCALE_LEN = 0.16;
const HOOK_OFF = SCALE_LEN / 2 + 0.005; // 挂钩到圆筒中心的距离
const LAYER_Y = 0.036; // 测力计轴线离纸面高度
const FIG_K = 0.045; // 作图比例 m/N

export function buildL3Scene(api: SceneApi, getState: () => L3State): () => void {
  const { scene, camera, addAnchor, setAnchorText, draggable, onTick, setTarget } = api;
  // 取景在文件末尾统一按器材包围盒计算（fitCamera）

  // ---------- 实验桌 + 方木板 + 白纸 ----------
  scene.add(tableTop(2.4, 2.4));

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.5), mat('wood', { color: 0x8a6a44 }));
  plate.position.y = 0.01;
  plate.receiveShadow = true;
  scene.add(plate);
  addAnchor(plate, '方木板（图钉固定白纸）');

  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.002, 0.44), mat('paper', { color: 0xf3efe6 }));
  paper.position.y = 0.021;
  scene.add(paper);

  // ---------- 结点 + 图钉 + 橡皮条 ----------
  const NAIL = new THREE.Vector3(-0.27, 0.03, 0);
  const KNOT = new THREE.Vector3(0, 0.03, -0.02);

  const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.016, 12), mat('steel'));
  nail.position.copy(NAIL);
  scene.add(nail);
  addAnchor(nail, '图钉（橡皮条固定端）');

  const band = rope(0.0016);
  band.material = mat('rubber', { color: 0xd9d2c2 });
  scene.add(band);
  stretchRope(band as THREE.Mesh, NAIL.clone().setY(0.028), KNOT.clone().setY(0.028));

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.002, 8, 20), mat('steel'));
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(KNOT);
  scene.add(ring);
  addAnchor(ring, '圆环结点');

  // ---------- 三只测力计 + 细绳 ----------
  // 表盘读数做在器材顶面（Canvas 贴图），不是悬停标注：读数必须一眼能读
  const scales = [0, 1, 2].map(() => {
    const s = dynamometer(5, SCALE_LEN);
    s.traverse((o) => { o.castShadow = true; });
    scene.add(s);
    draggable(s);
    return s;
  });
  const scaleAnchors = [
    addAnchor(scales[0], '弹簧测力计 F₁'),
    addAnchor(scales[1], '弹簧测力计 F₂'),
    addAnchor(scales[2], '测力计（测合力 · 等效替代）'),
  ];

  const ropes = [0, 1, 2].map(() => {
    const m = rope(0.0012);
    scene.add(m);
    return m as THREE.Mesh;
  });

  // 作图辅助线（虚线平行四边形 + 合力对角线）
  const dashMat = new THREE.LineDashedMaterial({ color: 0x9fb4cc, dashSize: 0.012, gapSize: 0.008, transparent: true, opacity: 0.85 });
  const diagMat = new THREE.LineBasicMaterial({ color: 0x4da6ff, transparent: true, opacity: 0.9 });
  const fig = new THREE.Group();
  scene.add(fig);

  const makeLine = (pts: THREE.Vector3[], m: THREE.LineBasicMaterial | THREE.LineDashedMaterial) => {
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(g, m);
    line.computeLineDistances();
    return line;
  };

  const place = (s: THREE.Object3D, ang: number, dist: number, z = 0) => {
    s.position.set(Math.cos(ang) * dist, LAYER_Y, Math.sin(ang) * dist + z);
    s.rotation.set(0, -ang, 0);
  };

  const layout = () => {
    const st = getState();
    const half = (st.deg * Math.PI) / 360;
    const a1 = half;
    const a2 = -half;

    // F₁ / F₂：沿夹角两边拉开，绳长随示数增大
    place(scales[0], a1, 0.11 + st.f1 * 0.022);
    place(scales[1], a2, 0.11 + st.f2 * 0.022);

    // 第三只测力计：沿合力方向、换一条车道摆放，避免与 F₁/F₂ 重叠
    const fr = resultant(st);
    place(scales[2], 0, Math.min(0.27, 0.1 + fr * 0.018), 0.17);

    // 三只表盘同步显示当前读数（改 F₁/F₂/夹角时立刻变）
    const forces = [st.f1, st.f2, fr];
    const names = ['F₁', 'F₂', 'F合'];
    forces.forEach((f, i) => {
      (scales[i].userData.setReading as (v: number) => void)(f);
      setAnchorText(scaleAnchors[i], `弹簧测力计 ${names[i]} = ${f.toFixed(2)} N`);
    });

    const F1 = new THREE.Vector3(Math.cos(a1), 0, Math.sin(a1)).multiplyScalar(st.f1 * FIG_K).add(new THREE.Vector3(0, 0.026, 0));
    const F2 = new THREE.Vector3(Math.cos(a2), 0, Math.sin(a2)).multiplyScalar(st.f2 * FIG_K).add(new THREE.Vector3(0, 0.026, 0));
    const O = new THREE.Vector3(0, 0.026, -0.02);
    const tip = F1.clone().add(F2).sub(new THREE.Vector3(0, 0.052, 0)).add(O);

    // 绳：结点 → 各测力计挂钩
    const knot = new THREE.Vector3(KNOT.x, LAYER_Y, KNOT.z);
    [0, 1, 2].forEach((i) => {
      const ang = i === 2 ? 0 : i === 0 ? a1 : a2;
      const s = scales[i];
      const hook = new THREE.Vector3(
        s.position.x - Math.cos(ang) * HOOK_OFF,
        LAYER_Y,
        s.position.z - Math.sin(ang) * HOOK_OFF,
      );
      stretchRope(ropes[i], knot, hook);
    });

    fig.clear();
    fig.add(makeLine([O, F1], dashMat));
    fig.add(makeLine([F1, tip], dashMat));
    fig.add(makeLine([O, F2], dashMat));
    fig.add(makeLine([F2, tip], dashMat));
    fig.add(makeLine([O, tip], diagMat));
  };

  let lastRun = -1;
  let prog = 0;
  let done = false;
  let lastKey = '';

  onTick((dt) => {
    const st = getState();
    const key = `${st.f1}|${st.f2}|${st.deg}`;
    if (st.runId !== lastRun) {
      lastRun = st.runId;
      prog = 0;
      done = false;
      layout();
    } else if (key !== lastKey) {
      layout();
    }
    lastKey = key;

    if (st.stage === 'run' && !done) {
      prog = Math.min(1, prog + dt * 2.5);
      st.onProgress(prog);
      if (prog >= 1) { done = true; st.onFinish(); }
    }
  });

  layout();
  // 共点力合成：三个力都画在白纸上，必须俯视才看得懂图 —— 俯角给到 46°
  setTarget(fitCamera(camera, boxOfSubject(scene), { pitch: 46, yaw: 0.1, fill: 0.9, margin: 0.015 }));
  return () => { fig.clear(); };
}
