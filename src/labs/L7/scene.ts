// L7 场景：重物 + 光电门 + 标尺（自由落体验证机械能守恒）
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';

export interface L7State {
  m: number;
  h: number;
  running: boolean;
  t: number;
}
const G = 9.8;
export function vel(h: number): number { return Math.sqrt(2 * G * Math.max(h, 0)); }

export function buildL7Scene(api: SceneApi, getState: () => L7State): () => void {
  const { scene, camera, addAnchor, onTick } = api;
  camera.position.set(2.5, 1.5, 5);
  camera.lookAt(0, 0, 0);

  for (let i = 0; i <= 10; i++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), new THREE.MeshStandardMaterial({ color: 0xffd966 }));
    tick.position.set(0.6, 1.5 - i * 0.3, 0); scene.add(tick);
  }
  const ruler = new THREE.Mesh(new THREE.BoxGeometry(0.04, 3.2, 0.04), new THREE.MeshStandardMaterial({ color: 0xffd966 }));
  ruler.position.set(0.62, 0, 0); scene.add(ruler); addAnchor(ruler, '标尺');
  const gate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.2), new THREE.MeshStandardMaterial({ color: 0x4da6ff, emissive: 0x1a3a66, emissiveIntensity: 0.5 }));
  gate.position.set(0, 0, 0); scene.add(gate); addAnchor(gate, '光电门 · 测速');
  const weight = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 16), new THREE.MeshStandardMaterial({ color: 0xff5a5a, metalness: 0.3 }));
  weight.position.set(0, 1.5, 0); scene.add(weight); addAnchor(weight, '重物 m');

  onTick(() => {
    const s = getState();
    weight.position.y = 1.5 - Math.min(0.5 * G * s.t * s.t, s.h) * 0.3;
  });
  return () => {};
}
