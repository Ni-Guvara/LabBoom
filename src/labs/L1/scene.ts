// L1 场景：气垫导轨 + 小车 + 打点计时器 + 纸带点迹（P5 频闪留痕）
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';

export interface L1State {
  a: number;
  v0: number;
  t: number;
  running: boolean;
  points: { t: number; x: number; v: number }[];
}

export function l1Position(s: L1State): number { return s.v0 * s.t + 0.5 * s.a * s.t * s.t; }
export function l1Velocity(s: L1State, t: number): number { return s.v0 + s.a * t; }

const RAIL_LEN = 4;
const SCALE = 0.5;

export function buildL1Scene(api: SceneApi, getState: () => L1State): () => void {
  const { scene, camera, addAnchor, onTick } = api;
  camera.position.set(3, 2.5, 5);
  camera.lookAt(0, 0.5, 0);

  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(RAIL_LEN * SCALE * 2, 0.1, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x2a3650, metalness: 0.4, roughness: 0.5 })
  );
  scene.add(rail);
  addAnchor(rail, '气垫导轨 · 已通气垫');

  for (let i = -4; i <= 4; i++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.02), new THREE.MeshStandardMaterial({ color: 0xffd966 }));
    tick.position.set(i * SCALE, 0.1, 0.27);
    scene.add(tick);
  }

  const timer = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.4, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x4da6ff, emissive: 0x1a3a66, emissiveIntensity: 0.4 })
  );
  timer.position.set(RAIL_LEN * SCALE - 0.2, 0.3, 0);
  scene.add(timer);
  addAnchor(timer, '打点计时器 · Δt=0.1s');

  const cart = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.25, 0.35),
    new THREE.MeshStandardMaterial({ color: 0xff5a5a, metalness: 0.3, roughness: 0.4 })
  );
  cart.position.set(-1.5, 0.23, 0);
  scene.add(cart);
  addAnchor(cart, '小车');

  const tape = new THREE.Mesh(
    new THREE.BoxGeometry(RAIL_LEN * SCALE * 2, 0.005, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xf5f7fa })
  );
  tape.position.set(0, 0.058, 0);
  scene.add(tape);

  const dotGroup = new THREE.Group();
  scene.add(dotGroup);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  let lastN = -1;
  const rebuildDots = (pts: { x: number }[]) => {
    if (pts.length === lastN) return;
    lastN = pts.length;
    while (dotGroup.children.length) dotGroup.remove(dotGroup.children[0]);
    pts.forEach((p) => {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), dotMat);
      d.position.set(p.x * SCALE, 0.065, 0);
      dotGroup.add(d);
    });
  };

  onTick(() => {
    const s = getState();
    cart.position.x = l1Position(s) * SCALE - 1.5;
    rebuildDots(s.points);
  });

  return () => {};
}
