// L10 场景：米尺 + 待测金属丝 + 电池 + 滑动变阻器 + 电流表/电压表（内接/外接可切换）
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';

export type Connection = 'outer' | 'inner';

export interface L10State {
  d: number;          // 金属丝直径 mm
  L: number;          // 接入长度 m
  Rs: number;         // 滑动变阻器阻值 Ω
  connection: Connection;
  I: number;          // 电流表示数 A
  U: number;          // 电压表示数 V
}

export const EMF = 6;        // 电源电动势 V
export const R_INTERNAL = 0.5; // 电源内阻 Ω
export const R_AMMETER = 0.5;  // 电流表内阻 Ω
export const R_VOLTMETER = 3000; // 电压表内阻 Ω
export const RHO_TRUE = 1.1e-6; // 镍铬合金电阻率 Ω·m

export function wireResistance(s: Pick<L10State, 'd' | 'L'>): number {
  const d = s.d / 1000;
  return (RHO_TRUE * 4 * s.L) / (Math.PI * d * d);
}

// 按接法折算回路电流与两表示数：外接=电压表并接在金属丝两端，内接=电流表串在金属丝回路
export function readMeters(s: L10State): { I: number; U: number } {
  const Rw = wireResistance(s);
  if (s.connection === 'outer') {
    const Rp = (Rw * R_VOLTMETER) / (Rw + R_VOLTMETER); // 电压表分流
    const I = EMF / (R_INTERNAL + s.Rs + Rp);
    return { I, U: I * Rp };
  }
  const I = EMF / (R_INTERNAL + s.Rs + Rw + R_AMMETER);
  return { I, U: I * (Rw + R_AMMETER) };
}

export function buildL10Scene(api: SceneApi, getState: () => L10State): () => void {
  const { scene, camera, addAnchor, onTick } = api;
  camera.position.set(0, 2.6, 6.4);
  camera.lookAt(0, 0.2, 0);

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(5, 2.6, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x14243c, metalness: 0.3, roughness: 0.8 })
  );
  board.position.set(0, 0, -0.14);
  scene.add(board);

  // 米尺
  const ruler = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.2, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xffd966, roughness: 0.6 })
  );
  ruler.position.set(0, -0.95, 0);
  scene.add(ruler);
  for (let i = 0; i <= 10; i++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.02), new THREE.MeshStandardMaterial({ color: 0x5a4a20 }));
    tick.position.set(-2 + i * 0.4, -0.95, 0.05);
    scene.add(tick);
  }
  addAnchor(ruler, '米尺 · 测接入长度 L');

  // 待测金属丝（细圆柱，长度随 L 变化）
  const wireMat = new THREE.MeshStandardMaterial({ color: 0xc07a4a, metalness: 0.9, roughness: 0.35, emissive: 0x2a1206, emissiveIntensity: 0.4 });
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.4, 16), wireMat);
  wire.rotation.z = Math.PI / 2;
  wire.position.set(0, -0.35, 0);
  scene.add(wire);
  addAnchor(wire, '待测金属丝 · 直径 d');

  // 电池
  const battery = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 0.3), new THREE.MeshStandardMaterial({ color: 0x2a3650, metalness: 0.5, roughness: 0.4 }));
  battery.position.set(-1.95, 0.85, 0);
  scene.add(battery);
  addAnchor(battery, '电池组 · 6 V');

  // 滑动变阻器
  const rheoBase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.3), new THREE.MeshStandardMaterial({ color: 0x394a66, metalness: 0.4 }));
  rheoBase.position.set(1.4, 0.85, 0);
  scene.add(rheoBase);
  const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.3, 16), new THREE.MeshStandardMaterial({ color: 0xb07a4a, metalness: 0.6, roughness: 0.5 }));
  coil.rotation.z = Math.PI / 2;
  coil.position.set(1.4, 1.0, 0);
  scene.add(coil);
  const sliderKnob = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.34), new THREE.MeshStandardMaterial({ color: 0x5eead4, metalness: 0.6 }));
  sliderKnob.position.set(0.9, 1.0, 0);
  scene.add(sliderKnob);
  addAnchor(coil, '滑动变阻器 · 改变电流');

  // 电流表 / 电压表
  const mkMeter = (x: number, y: number, label: string, color: number) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.3), new THREE.MeshStandardMaterial({ color: 0x1b2b45, metalness: 0.4, roughness: 0.5 }));
    box.position.set(x, y, 0);
    scene.add(box);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
    face.position.set(x, y, 0.16);
    scene.add(face);
    addAnchor(box, label);
    return face;
  };
  const ammeterFace = mkMeter(-0.1, 0.9, '电流表 A', 0x5eead4);
  const voltmeterFace = mkMeter(0.75, 0.9, '电压表 V', 0x4da6ff);

  // 电流示意（沿导线流动的小球）
  const flow = new THREE.Group();
  scene.add(flow);
  const dotMat = new THREE.MeshStandardMaterial({ color: 0x4da6ff, emissive: 0x1a4a8a, emissiveIntensity: 1 });
  for (let i = 0; i < 12; i++) flow.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), dotMat));

  let phase = 0;
  onTick((dt) => {
    const s = getState();
    const m = readMeters(s);
    const k = Math.min(1, Math.max(0, s.Rs / 20));
    sliderKnob.position.x = -0.05 + k * 1.9;
    wire.scale.y = Math.max(0.2, s.L);
    wire.position.x = -1.6 + s.L * 1.6;

    // 表盘亮度 ∝ 示数
    (ammeterFace.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + Math.min(1.2, m.I * 3);
    (voltmeterFace.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + Math.min(1.2, m.U / 6);

    phase += dt * (0.15 + m.I * 0.6);
    flow.children.forEach((el, i) => {
      const x = -2.3 + ((i / flow.children.length + phase) % 1) * 4.6;
      el.position.set(x, -0.35 + Math.sin((i + phase) * 3) * 0.02, 0.12);
    });
  });

  return () => { /* 资源随场景释放 */ };
}
