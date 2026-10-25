// L11 场景：多用电表（3D 旋钮 + 指针表盘）+ 表笔 + 待测元件
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';

export interface Gear {
  label: string;
  kind: 'V' | 'A' | 'R';
  max: number;   // 满量程（电压 V / 电流 mA / 电阻 Ω）
}

// 挡位盘（顺时针排列，与 3D 旋钮刻度一一对应）
export const GEARS: Gear[] = [
  { label: 'V2.5', kind: 'V', max: 2.5 },
  { label: 'V10', kind: 'V', max: 10 },
  { label: 'mA10', kind: 'A', max: 10 },
  { label: 'mA100', kind: 'A', max: 100 },
  { label: 'Ω×1', kind: 'R', max: 200 },
  { label: 'Ω×10', kind: 'R', max: 2000 },
  { label: 'Ω×100', kind: 'R', max: 20000 },
];

export interface Component {
  kind: 'R' | 'V' | 'I';
  value: number;   // Ω / V / A
  label: string;
}

export const COMPONENTS: Component[] = [
  { kind: 'R', value: 220, label: '待测电阻 220 Ω' },
  { kind: 'R', value: 1500, label: '待测电阻 1.5 kΩ' },
  { kind: 'V', value: 1.5, label: '干电池 1.5 V' },
  { kind: 'V', value: 6, label: '电池组 6 V' },
  { kind: 'I', value: 0.006, label: '小灯泡电流约 6 mA' },
];

export interface MeterReading {
  valid: boolean;
  frac: number;    // 指针偏转比例 0~1
  reading: number; // 表盘示数（单位随挡位）
  unit: string;
  note: string;
}

// 按挡位 + 待测元件推算指针偏转与读数（含错挡/打表判断）
export function measure(g: Gear, comp: Component): MeterReading {
  if (g.kind === 'V') {
    if (comp.kind !== 'V') return { valid: false, frac: 0, reading: 0, unit: 'V', note: '挡位与待测量不符：电压挡只能测电压' };
    const over = comp.value > g.max;
    return { valid: !over, frac: Math.min(1, comp.value / g.max), reading: comp.value, unit: 'V', note: over ? `超量程（${comp.value} V > ${g.max} V）打表` : '' };
  }
  if (g.kind === 'A') {
    if (comp.kind !== 'I') return { valid: false, frac: 0, reading: 0, unit: 'mA', note: '挡位与待测量不符：电流挡只能串联测电流' };
    const mA = comp.value * 1000;
    const over = mA > g.max;
    return { valid: !over, frac: Math.min(1, mA / g.max), reading: mA, unit: 'mA', note: over ? `超量程（${mA} mA > ${g.max} mA）打表` : '' };
  }
  if (comp.kind !== 'R') return { valid: false, frac: 0, reading: 0, unit: 'Ω', note: '禁止用欧姆挡测带电体（会损坏表头）' };
  const mult = g.max / 200; // ×1/×10/×100
  const frac = Math.min(1, comp.value / g.max);
  const note = frac < 0.25 ? '指针偏转太小，读数不准 → 换小倍率挡' : frac > 0.9 ? '指针偏转太大 → 换大倍率挡' : '';
  return {
    valid: frac >= 0.25 && frac <= 0.9,
    frac, reading: comp.value, unit: 'Ω', note: note || `欧姆挡 ×${mult}（换挡需重新调零）`,
  };
}

export interface L11State {
  gear: number;   // 挡位序号
  frac: number;   // 指针偏转
}

export function buildL11Scene(api: SceneApi, getState: () => L11State): () => void {
  const { scene, camera, addAnchor, onTick } = api;
  camera.position.set(0.6, 2.0, 5.4);
  camera.lookAt(0, 0.2, 0);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1b2b45, metalness: 0.4, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.9, 0.4), bodyMat);
  body.position.set(-0.6, 0.2, 0);
  scene.add(body);
  addAnchor(body, '多用电表');

  // 表盘
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 40),
    new THREE.MeshStandardMaterial({ color: 0xf2f5fa, emissive: 0x223344, emissiveIntensity: 0.25 })
  );
  face.position.set(-0.95, 0.55, 0.22);
  scene.add(face);
  addAnchor(face, '表盘 · 指针读数');

  // 指针（绕表盘中心旋转：-60° → +60°）
  const needlePivot = new THREE.Group();
  needlePivot.position.set(-0.95, 0.05, 0.26);
  scene.add(needlePivot);
  const needle = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.62, 0.01),
    new THREE.MeshStandardMaterial({ color: 0xd93b3b, emissive: 0x551010, emissiveIntensity: 0.5 })
  );
  needle.position.set(0, 0.31, 0);
  needlePivot.add(needle);

  // 挡位旋钮
  const knobBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 0.16, 32),
    new THREE.MeshStandardMaterial({ color: 0x2a3650, metalness: 0.6, roughness: 0.35 })
  );
  knobBase.rotation.x = Math.PI / 2;
  knobBase.position.set(0.3, -0.35, 0.22);
  scene.add(knobBase);
  const knobPointer = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.24, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x5eead4, emissive: 0x1a6a5a, emissiveIntensity: 0.6 })
  );
  const knobPivot = new THREE.Group();
  knobPivot.position.set(0.3, -0.35, 0.32);
  knobPivot.add(knobPointer);
  knobPointer.position.set(0, 0.12, 0);
  scene.add(knobPivot);
  addAnchor(knobBase, '挡位旋钮 · 拖转换挡');

  // 表笔 + 待测元件
  const leadMat = new THREE.MeshStandardMaterial({ color: 0xd93b3b });
  const lead = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 8), leadMat);
  lead.rotation.z = Math.PI / 2.6;
  lead.position.set(1.1, -0.3, 0.1);
  scene.add(lead);

  const compGroup = new THREE.Group();
  scene.add(compGroup);
  const resBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.5, 16),
    new THREE.MeshStandardMaterial({ color: 0xd8b070, roughness: 0.6 })
  );
  resBody.rotation.z = Math.PI / 2;
  resBody.position.set(1.55, 0.35, 0.1);
  compGroup.add(resBody);
  const battBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.55, 16),
    new THREE.MeshStandardMaterial({ color: 0x2a3650, metalness: 0.6, roughness: 0.4 })
  );
  battBody.rotation.z = Math.PI / 2;
  battBody.position.set(1.55, 0.35, 0.1);
  compGroup.add(battBody);
  const lampBody = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xffd966, emissive: 0xffaa33, emissiveIntensity: 0.8 })
  );
  lampBody.position.set(1.55, 0.35, 0.1);
  compGroup.add(lampBody);
  addAnchor(compGroup, '待测元件 · 由面板决定');

  onTick(() => {
    const s = getState();
    const deg = -60 + 120 * Math.max(0, Math.min(1, s.frac));
    needlePivot.rotation.z = -((deg * Math.PI) / 180);
    knobPivot.rotation.z = -(((-135 + 45 * s.gear) * Math.PI) / 180);
  });

  return () => { /* 资源随场景释放 */ };
}
