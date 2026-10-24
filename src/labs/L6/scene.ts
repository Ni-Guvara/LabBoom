// L6 场景：向心力演示器（竖直转轴 + 水平双臂 + 两球）
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';

export interface L6State {
  m: number;
  omega: number;
  r: number;
}
export function centripetal(s: L6State): number { return s.m * s.omega * s.omega * s.r; }

export function buildL6Scene(api: SceneApi, getState: () => L6State): () => void {
  const { scene, camera, addAnchor, onTick } = api;
  camera.position.set(3, 2.5, 5);
  camera.lookAt(0, 0.5, 0);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.2, 24), new THREE.MeshStandardMaterial({ color: 0x2a3650 }));
  base.position.y = -0.1; scene.add(base);
  const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 12), new THREE.MeshStandardMaterial({ color: 0x6a7a96, metalness: 0.5 }));
  axis.position.y = 1; scene.add(axis); addAnchor(axis, '转轴');
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 0.06), new THREE.MeshStandardMaterial({ color: 0x4da6ff }));
  arm.position.y = 1.6; scene.add(arm);
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xff5a5a, metalness: 0.3 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), ballMat);
  ball.position.set(1.2, 1.6, 0); scene.add(ball); addAnchor(ball, '小球 m');
  const counter = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), new THREE.MeshStandardMaterial({ color: 0x8ca0b8 }));
  counter.position.set(-1.2, 1.6, 0); scene.add(counter);

  let arrow: THREE.ArrowHelper | null = null;
  let ang = 0;
  onTick((dt) => {
    const s = getState();
    ang += s.omega * dt;
    const px = Math.cos(ang) * s.r;
    const pz = Math.sin(ang) * s.r;
    ball.position.set(px, 1.6, pz);
    counter.position.set(-px, 1.6, -pz);
    if (arrow) { arrow.dispose(); scene.remove(arrow); }
    const F = centripetal(s);
    const dir = new THREE.Vector3(-Math.cos(ang), 0, -Math.sin(ang));
    arrow = new THREE.ArrowHelper(dir, ball.position.clone(), Math.min(1.2, 0.2 + F * 0.15), 0xff5a5a, 0.2, 0.1);
    scene.add(arrow);
  });
  return () => { arrow?.dispose(); };
}
