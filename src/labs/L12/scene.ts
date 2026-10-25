// L12 场景：干电池 + 滑动变阻器 + 电流表/电压表，测多组 U、I 后作 U-I 图线求 E、r
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';

export interface L12State {
  R: number;    // 滑动变阻器接入阻值 Ω
  I: number;    // 电流 A
  U: number;    // 路端电压 V
}

export const EMF_TRUE = 1.5;  // 电池电动势真值（判分用）
export const R_TRUE = 0.5;    // 电池内阻真值

// 闭合电路欧姆定律：I = E/(R+r)，路端电压 U = I·R
export function circuit(R: number): { I: number; U: number } {
  const I = EMF_TRUE / (R + R_TRUE);
  return { I, U: I * R };
}

export function buildL12Scene(api: SceneApi, getState: () => L12State): () => void {
  const { scene, camera, addAnchor, onTick } = api;
  camera.position.set(0, 2.4, 6);
  camera.lookAt(0, 0.2, 0);

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(5, 2.4, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x14243c, metalness: 0.3, roughness: 0.8 })
  );
  board.position.set(0, 0, -0.14);
  scene.add(board);

  // 电池（含内阻示意）
  const battery = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.1, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x2a3650, metalness: 0.5, roughness: 0.4 })
  );
  battery.position.set(-2, -0.1, 0);
  scene.add(battery);
  addAnchor(battery, '干电池 · E 与内阻 r');

  // 滑动变阻器
  const coil = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 1.8, 20),
    new THREE.MeshStandardMaterial({ color: 0xb07a4a, metalness: 0.6, roughness: 0.5 })
  );
  coil.rotation.z = Math.PI / 2;
  coil.position.set(1.2, 0.1, 0);
  scene.add(coil);
  const slider = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.34, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x5eead4, metalness: 0.6, roughness: 0.3 })
  );
  slider.position.set(0.5, 0.15, 0);
  scene.add(slider);
  addAnchor(coil, '滑动变阻器 R · 改变外电阻');

  // 电流表（串在回路）
  const ammeter = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.44, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1b2b45, metalness: 0.4, roughness: 0.5 })
  );
  ammeter.position.set(0, 0.85, 0);
  scene.add(ammeter);
  const aFace = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), new THREE.MeshStandardMaterial({ color: 0x5eead4, emissive: 0x1a6a5a, emissiveIntensity: 0.5 }));
  aFace.position.set(0, 0.85, 0.16);
  scene.add(aFace);
  addAnchor(ammeter, '电流表 A · 串联');

  // 电压表（并接在路端）
  const voltmeter = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.44, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1b2b45, metalness: 0.4, roughness: 0.5 })
  );
  voltmeter.position.set(2.1, 0.85, 0);
  scene.add(voltmeter);
  const vFace = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), new THREE.MeshStandardMaterial({ color: 0x4da6ff, emissive: 0x1a3a66, emissiveIntensity: 0.5 }));
  vFace.position.set(2.1, 0.85, 0.16);
  scene.add(vFace);
  addAnchor(voltmeter, '电压表 V · 并接路端');

  // 导线回路
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x8a97ab, metalness: 0.7, roughness: 0.35 });
  const wires: [number, number, number, number][] = [
    [-2, -0.65, 1.2, 0.06], [2.0, 0.06, 2.1, 0.06],
  ];
  wires.forEach(([x, y, w, h]) => {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(w, h, h), wireMat);
    seg.position.set(x + w / 2 - 0.6, y, 0);
    scene.add(seg);
  });

  onTick(() => {
    const s = getState();
    const k = Math.max(0, Math.min(1, s.R / 10));
    slider.position.x = -0.6 + k * 3.4;
    (aFace.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + Math.min(1.4, s.I * 1.6);
    (vFace.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + Math.min(1.4, s.U / 1.5);
  });

  return () => { /* 资源随场景释放 */ };
}
