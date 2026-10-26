// L2 场景：弹簧 + 米尺 + 砝码盘（真实尺寸，1 单位 = 1 m）
// 支架高 0.9 m、弹簧自由长 0.16 m：每挂 50 g 伸长 Δx = 0.05g/k ≈ 12 mm，肉眼可见。
// 原先整套器材做到 4 m 高、弹簧 2.6 m 长，同样 12 mm 的伸长在画面上不到 1 px，
// 所以「挂砝码看不到弹簧拉长」。
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';
import { makeArrow } from '@/engine/SceneHost';
import { mat, applyShadows } from '@/engine/materials';
import { tableTop } from '@/labs/_shared/instruments';
import { fitCamera, boxOfSubject } from '@/labs/_shared/framing';

export interface SpringState {
  hooks: number;
  k: number;
  massPerHook: number;
  g: number;
}

export function springExtension(s: SpringState): number {
  return (s.hooks * s.massPerHook * s.g) / s.k;
}

/** 弹簧自由长度（m） */
const L0 = 0.16;
const COIL_R = 0.012;
const ROD_H = 0.9;
const ROD_X = 0;
const SPRING_X = 0.14;
/** 弹簧上端（挂在横臂下沿） */
const TOP_Y = ROD_H - 0.045;

export function buildSpringScene(
  api: SceneApi,
  getState: () => SpringState,
  getView: () => 'macro' | 'micro'
): () => void {
  const { scene, camera, addAnchor, setAnchorText, onTick, draggable, setTarget } = api;

  const bench = tableTop(1.6, 1.2);
  scene.add(bench);

  // 整套器材放进一个 rig：布置阶段可以整体挪位置，运行阶段锁定
  const rig = new THREE.Group();
  rig.name = 'rig';
  scene.add(rig);
  // 铁架台 + 弹簧 + 砝码盘是一个整体：拖它挪位置，弹簧和盘一起走，装配关系不散
  draggable(rig, { plane: 'floor' });

  // ---------- 铁架台 ----------
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.012, 0.12), mat('steel'));
  base.position.set(ROD_X, 0.006, -0.05);
  rig.add(base);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, ROD_H, 20), mat('steel'));
  rod.position.set(ROD_X, ROD_H / 2, -0.05);
  rig.add(rod);
  // 横臂 + 十字夹
  const armClamp = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.03, 0.03), mat('plasticBlack'));
  armClamp.position.set(ROD_X, TOP_Y + 0.03, -0.05);
  rig.add(armClamp);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(SPRING_X + 0.06, 0.012, 0.014), mat('steel'));
  arm.position.set(SPRING_X / 2, TOP_Y + 0.045, -0.05);
  rig.add(arm);
  // 横臂端头的挂钩
  const armHook = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0014, 8, 16), mat('steel'));
  armHook.position.set(SPRING_X, TOP_Y + 0.03, -0.05);
  rig.add(armHook);
  addAnchor(rod, '铁架台 · 立杆 900 mm', undefined, 0.5);

  // ---------- 弹簧（圈数固定，靠 group 的 y 缩放表现伸长） ----------
  const COILS = 16;
  const spring = new THREE.Group();
  spring.position.set(SPRING_X, TOP_Y, -0.05);
  const coilMat = mat('steel');
  for (let i = 0; i < COILS; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(COIL_R, 0.0008, 6, 20), coilMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -(i * L0) / COILS;
    spring.add(ring);
  }
  rig.add(spring);
  const springAnchor = addAnchor(spring, '弹簧 k = 40 N/m', undefined, -0.03);

  // ---------- 托盘 + 挂钩 ----------
  const tray = new THREE.Group();
  rig.add(tray);
  const trayPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.0022, 24), mat('aluminumMatte'));
  tray.add(trayPlate);
  const trayHook = new THREE.Mesh(new THREE.TorusGeometry(0.005, 0.001, 8, 14), mat('steel'));
  trayHook.position.y = 0.014;
  tray.add(trayHook);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.0005, 0.0005, 0.032, 5), mat('steel'));
    wire.position.set(Math.cos(a) * 0.016, 0.014, Math.sin(a) * 0.016);
    wire.rotation.z = Math.cos(a) * 0.45;
    wire.rotation.x = -Math.sin(a) * 0.45;
    tray.add(wire);
  }
  const trayAnchor = addAnchor(tray, '砝码盘', undefined, 0.03);

  // ---------- 砝码（φ30 mm 圆片，逐片叠在盘上） ----------
  const weightsGroup = new THREE.Group();
  rig.add(weightsGroup);
  const weightMat = mat('brass');
  const rebuildWeights = (n: number) => {
    while (weightsGroup.children.length) weightsGroup.remove(weightsGroup.children[0]);
    for (let i = 0; i < n; i++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.009, 22), weightMat);
      w.position.y = 0.0011 + 0.0045 + i * 0.0095;
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.004, 8), mat('steel'));
      knob.position.y = 0.0045 + i * 0.0095 + 0.006;
      const g = new THREE.Group();
      g.add(w, knob);
      weightsGroup.add(g);
    }
  };

  // ---------- 米尺（贴在弹簧旁，读伸长量） ----------
  const ruler = new THREE.Group();
  ruler.position.set(SPRING_X + 0.055, 0, -0.045);
  const rulerPlate = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.32, 0.003), mat('paintWhite'));
  rulerPlate.position.y = 0.60;
  ruler.add(rulerPlate);
  const tickMat = mat('plasticBlack');
  // 刻度只覆盖指针真正会经过的区间（0.46~0.74 m），挂满 6 个砝码也读得到
  for (let i = 0; i <= 28; i++) {
    const long = i % 5 === 0;
    const t = new THREE.Mesh(new THREE.BoxGeometry(long ? 0.014 : 0.008, 0.0006, 0.0006), tickMat);
    t.position.set(-0.0225 + (long ? 0.007 : 0.004), 0.46 + i * 0.01, 0.0018);
    ruler.add(t);
  }
  rig.add(ruler);
  addAnchor(ruler, '米尺 · 0~40 cm（读伸长量）', undefined, 0.2);

  // ---------- 指针（红标，跟着盘口走，直接对刻度） ----------
  const pointer = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.0016, 0.004), mat('plasticRed'));
  rig.add(pointer);

  let forceArrow: THREE.ArrowHelper | null = null;
  let gravityArrow: THREE.ArrowHelper | null = null;

  // ---------- 微观视图：晶格振动 ----------
  const microGroup = new THREE.Group();
  microGroup.visible = false;
  const microMat = new THREE.MeshStandardMaterial({ color: 0x5eead4, emissive: 0x2a6a5a, emissiveIntensity: 0.6 });
  for (let i = 0; i < 36; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 10), microMat);
    p.position.set(
      SPRING_X + (Math.random() - 0.5) * 0.06,
      0.55 + Math.random() * 0.2,
      -0.05 + (Math.random() - 0.5) * 0.06,
    );
    microGroup.add(p);
  }
  rig.add(microGroup);

  let lastN = -1;
  onTick(() => {
    const s = getState();
    const view = getView();
    const n = Math.round(s.hooks);
    if (n !== lastN) {
      rebuildWeights(n);
      lastN = n;
    }

    // 伸长量（米，1:1）= n·m₀·g / k，直接体现在弹簧长度与托盘高度上
    const dx = Math.min(springExtension(s), 0.16);
    const len = L0 + dx;

    spring.scale.y = len / L0;
    // 托盘挂在弹簧下端
    const trayY = TOP_Y - len - 0.004;
    tray.position.set(SPRING_X, trayY, -0.05);
    weightsGroup.position.set(SPRING_X, trayY + 0.0011, -0.05);
    pointer.position.set(SPRING_X + 0.033, trayY, -0.048);

    const F = n * s.massPerHook * s.g; // N
    setAnchorText(springAnchor, `弹簧 k = ${s.k} N/m · Δx = ${(dx * 1000).toFixed(1)} mm`);
    setAnchorText(trayAnchor, `砝码盘 + ${n} 片砝码 · F = ${F.toFixed(2)} N`);

    if (n > 0) {
      const aLen = Math.min(0.12, 0.03 + F * 0.012);
      if (forceArrow) { rig.remove(forceArrow); forceArrow.dispose(); }
      if (gravityArrow) { rig.remove(gravityArrow); gravityArrow.dispose(); }
      forceArrow = makeArrow(new THREE.Vector3(SPRING_X, trayY + 0.02, -0.05), new THREE.Vector3(0, aLen, 0), 'force');
      gravityArrow = makeArrow(new THREE.Vector3(SPRING_X + 0.02, trayY - 0.005, -0.05), new THREE.Vector3(0, -aLen, 0), 'force');
      rig.add(forceArrow, gravityArrow);
    } else if (forceArrow) {
      rig.remove(forceArrow); forceArrow.dispose(); forceArrow = null;
      if (gravityArrow) { rig.remove(gravityArrow); gravityArrow.dispose(); gravityArrow = null; }
    }

    microGroup.visible = view === 'micro';
    spring.visible = tray.visible = weightsGroup.visible = pointer.visible = view === 'macro';
    ruler.visible = view === 'macro';
  });

  [base, rod, armClamp, arm, spring, tray, weightsGroup, ruler].forEach(applyShadows);

  // 竖向器材：俯角小一点才看得清弹簧圈间距与刻度
  setTarget(fitCamera(camera, boxOfSubject(scene), { pitch: 12, yaw: 0.3, fill: 0.86, margin: 0.03 }));

  return () => {
    forceArrow?.dispose();
    gravityArrow?.dispose();
  };
}
