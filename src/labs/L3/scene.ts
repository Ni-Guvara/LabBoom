// L3 场景：两滑轮 + 结点 + 三根绳 + 力矢量箭头（平行四边形定则）
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';
import { makeArrow } from '@/engine/SceneHost';

export interface L3State {
  F1: number; F2: number; theta: number;
}
export function resultant(s: L3State): number {
  const t = (s.theta * Math.PI) / 180;
  return Math.sqrt(s.F1 ** 2 + s.F2 ** 2 + 2 * s.F1 * s.F2 * Math.cos(t));
}

export function buildL3Scene(api: SceneApi, getState: () => L3State): () => void {
  const { scene, camera, addAnchor, onTick } = api;
  camera.position.set(0, 2, 6);
  camera.lookAt(0, 0, 0);

  const beam = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x6a7a96, metalness: 0.5, roughness: 0.4 }));
  beam.position.set(0, 2.5, -1.5); scene.add(beam);
  const pulleyMat = new THREE.MeshStandardMaterial({ color: 0x4da6ff, metalness: 0.6, roughness: 0.3 });
  const p1 = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.04, 12, 32), pulleyMat);
  p1.position.set(-2, 2.3, -1.5); p1.rotation.y = Math.PI / 2; scene.add(p1); addAnchor(p1, '滑轮 1');
  const p2 = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.04, 12, 32), pulleyMat);
  p2.position.set(2, 2.3, -1.5); p2.rotation.y = Math.PI / 2; scene.add(p2); addAnchor(p2, '滑轮 2');
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0x551111, emissiveIntensity: 0.4 }));
  knot.position.set(0, 0, -1.5); scene.add(knot); addAnchor(knot, '结点 O');
  const wMat = new THREE.MeshStandardMaterial({ color: 0xffb14d });
  const w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 16), wMat);
  w1.position.set(-2, 1.4, -1.5); scene.add(w1);
  const w2 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 16), wMat);
  w2.position.set(2, 1.4, -1.5); scene.add(w2);

  let a1: THREE.ArrowHelper | null = null, a2: THREE.ArrowHelper | null = null, ar: THREE.ArrowHelper | null = null;
  onTick(() => {
    const s = getState();
    const t = (s.theta * Math.PI) / 180;
    const ang1 = Math.PI / 2 + t / 2, ang2 = Math.PI / 2 - t / 2;
    const v1 = new THREE.Vector3(Math.cos(ang1), Math.sin(ang1), 0).multiplyScalar(s.F1 * 0.3);
    const v2 = new THREE.Vector3(Math.cos(ang2), Math.sin(ang2), 0).multiplyScalar(s.F2 * 0.3);
    const sum = v1.clone().add(v2);
    a1?.dispose(); a2?.dispose(); ar?.dispose();
    if (a1) scene.remove(a1); if (a2) scene.remove(a2); if (ar) scene.remove(ar);
    a1 = makeArrow(knot.position.clone(), v1, 'force'); scene.add(a1);
    a2 = makeArrow(knot.position.clone(), v2, 'force'); scene.add(a2);
    ar = makeArrow(knot.position.clone(), sum, 'accel'); scene.add(ar);
  });
  return () => { a1?.dispose(); a2?.dispose(); ar?.dispose(); };
}
