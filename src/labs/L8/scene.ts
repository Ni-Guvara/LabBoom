// L8 场景：RC 电路板 + 电容器 + 单刀双掷开关 + 电流表（P4 时间操控 / P6 虚拟仪表 / P10 可逆模式）
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';

export type RcMode = 'charge' | 'discharge';

export interface L8State {
  mode: RcMode;   // 单刀双掷开关位置
  E: number;      // 电源电动势 V
  R: number;      // 电阻 kΩ
  C: number;      // 电容 µF
  t: number;      // 已模拟时间 s
  running: boolean;
}

// 时间常数 τ = R·C（R 用 kΩ、C 用 µF 时 τ 正好是秒的千分之一）
export function tau(s: L8State): number {
  return (s.R * s.C) / 1000;
}

// 电容器电压 u_C(t)
export function rcVoltage(s: L8State, t: number): number {
  const T = tau(s);
  if (T <= 0) return s.mode === 'charge' ? s.E : 0;
  return s.mode === 'charge' ? s.E * (1 - Math.exp(-t / T)) : s.E * Math.exp(-t / T);
}

// 回路电流 i(t)，充电为正、放电为负（A）
export function rcCurrent(s: L8State, t: number): number {
  const T = tau(s);
  const i0 = s.E / (s.R * 1000);
  if (T <= 0) return s.mode === 'charge' ? i0 : -i0;
  return s.mode === 'charge' ? i0 * Math.exp(-t / T) : -i0 * Math.exp(-t / T);
}

// 环形导线路径（矩形回路），按 0~1 参数取点
const LOOP: [number, number][] = [
  [-1.7, -0.75], [1.7, -0.75], [1.7, 0.75], [-1.7, 0.75], [-1.7, -0.75],
];
const SEG_LEN = LOOP.slice(0, -1).map((p, i) => {
  const q = LOOP[i + 1];
  return Math.hypot(q[0] - p[0], q[1] - p[1]);
});
const TOTAL_LEN = SEG_LEN.reduce((a, b) => a + b, 0);

function loopPoint(p: number): THREE.Vector3 {
  let d = ((p % 1) + 1) % 1 * TOTAL_LEN;
  for (let i = 0; i < SEG_LEN.length; i++) {
    if (d <= SEG_LEN[i]) {
      const a = LOOP[i], b = LOOP[i + 1];
      const k = SEG_LEN[i] === 0 ? 0 : d / SEG_LEN[i];
      return new THREE.Vector3(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, 0);
    }
    d -= SEG_LEN[i];
  }
  return new THREE.Vector3(LOOP[0][0], LOOP[0][1], 0);
}

export function buildL8Scene(api: SceneApi, getState: () => L8State): () => void {
  const { scene, camera, addAnchor, onTick } = api;
  camera.position.set(0, 2.2, 6.4);
  camera.lookAt(0, 0.2, 0);

  // 实验板
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 2.4, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x14243c, metalness: 0.3, roughness: 0.8 })
  );
  board.position.set(0, 0, -0.12);
  scene.add(board);
  addAnchor(board, '实验电路板');

  // 电源
  const battery = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.42, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x2a3650, metalness: 0.5, roughness: 0.4 })
  );
  battery.position.set(-1.0, -0.75, 0);
  scene.add(battery);
  addAnchor(battery, '电源 · 6 V');

  // 电容器（两平行板）
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xc0d4ff, metalness: 0.7, roughness: 0.25, emissive: 0x000000 });
  const plateTop = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.5), plateMat);
  plateTop.position.set(0.35, 1.12, 0);
  scene.add(plateTop);
  const plateBottom = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.5), plateMat.clone());
  plateBottom.position.set(0.35, 0.56, 0);
  scene.add(plateBottom);
  addAnchor(plateTop, '电容器 · 平行板');

  // 电荷（板间来回的发光小球）
  const chargeGroup = new THREE.Group();
  scene.add(chargeGroup);
  const chargeMat = new THREE.MeshStandardMaterial({ color: 0x5eead4, emissive: 0x2a8a76, emissiveIntensity: 1 });
  for (let i = 0; i < 8; i++) {
    const q = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), chargeMat);
    chargeGroup.add(q);
  }
  addAnchor(chargeGroup, '板间电场 · 电荷积累');

  // 电阻
  const resistor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.65, 16),
    new THREE.MeshStandardMaterial({ color: 0xd8b070, roughness: 0.6 })
  );
  resistor.rotation.z = Math.PI / 2;
  resistor.position.set(1.7, 0.2, 0);
  scene.add(resistor);
  addAnchor(resistor, '定值电阻 R');

  // 电流表
  const meter = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.45, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x1b2b45, metalness: 0.4, roughness: 0.5 })
  );
  meter.position.set(-1.7, 0.2, 0);
  scene.add(meter);
  addAnchor(meter, '电流表 G');

  // 单刀双掷开关（拨杆随充放电翻转）
  const swBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.16, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x394a66, metalness: 0.5, roughness: 0.4 })
  );
  swBase.position.set(0.35, -0.75, 0);
  scene.add(swBase);
  const lever = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.4, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x5eead4, metalness: 0.6, roughness: 0.3 })
  );
  lever.position.set(0.35, -0.55, 0);
  scene.add(lever);
  addAnchor(swBase, '单刀双掷开关 · 充电/放电');

  // 导线上的电子流
  const electrons = new THREE.Group();
  scene.add(electrons);
  const eMat = new THREE.MeshStandardMaterial({ color: 0x4da6ff, emissive: 0x1a4a8a, emissiveIntensity: 0.9 });
  const N = 18;
  for (let i = 0; i < N; i++) {
    electrons.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eMat));
  }

  let phase = 0;
  onTick((dt) => {
    const s = getState();
    const u = rcVoltage(s, s.t);
    const i = rcCurrent(s, s.t);
    const frac = Math.max(0, Math.min(1, u / s.E));

    // 拨杆位置
    lever.rotation.z = s.mode === 'charge' ? -0.5 : 0.5;

    // 极板发光强度 ∝ 电量
    (plateTop.material as THREE.MeshStandardMaterial).emissiveIntensity = frac * 1.4;
    (plateTop.material as THREE.MeshStandardMaterial).emissive.setHex(0x2a5a8a);
    (plateBottom.material as THREE.MeshStandardMaterial).emissiveIntensity = frac * 1.4;
    (plateBottom.material as THREE.MeshStandardMaterial).emissive.setHex(0x8a2a3a);

    // 板间电荷随电量增减
    chargeGroup.children.forEach((q, k) => {
      const vis = k < Math.ceil(frac * chargeGroup.children.length);
      q.visible = vis;
      const off = (k / chargeGroup.children.length) * 1.15;
      q.position.set(-0.28 + off, 0.84 + Math.sin(phase * 2 + k) * 0.02, (k % 2 === 0 ? 0.16 : -0.16));
    });

    // 电子流：速度 ∝ |i|，方向随电流符号
    if (s.running) phase += dt * (0.06 + Math.abs(i) * 60) * Math.sign(i || 1);
    electrons.children.forEach((el, k) => {
      const p = loopPoint(k / N + phase);
      el.position.copy(p);
      el.position.z = 0.06;
    });
  });

  return () => { /* three.js 资源随场景释放 */ };
}
