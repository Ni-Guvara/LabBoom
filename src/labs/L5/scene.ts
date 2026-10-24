// L5 场景：平抛演示仪 + 小球 + 频闪残影（P5）+ 网格
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';

export interface L5State {
  v0: number;
  t: number;
  running: boolean;
  trails: { t: number; x: number; y: number }[];
}
const G = 9.8;
export function posX(s: L5State, t: number) { return s.v0 * t; }
export function posY(_s: L5State, t: number) { return -0.5 * G * t * t; }

export function buildL5Scene(api: SceneApi, getState: () => L5State): () => void {
  const { scene, camera, addAnchor, onTick } = api;
  camera.position.set(2, 1, 6);
  camera.lookAt(0, -0.5, 0);

  const table = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.8), new THREE.MeshStandardMaterial({ color: 0x6a4a2a }));
  table.position.set(-0.75, 0.5, 0); scene.add(table); addAnchor(table, '桌面·抛出点');
  const grid = new THREE.GridHelper(8, 16, 0x4da6ff, 0x1b2c4a);
  grid.position.y = -2.5; scene.add(grid);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0x551111, emissiveIntensity: 0.4 }));
  ball.position.set(0, 0.5, 0); scene.add(ball); addAnchor(ball, '小球');
  const trailGroup = new THREE.Group(); scene.add(trailGroup);
  const trailMat = new THREE.MeshBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.6 });
  let lastN = -1;
  const rebuild = (pts: { x: number; y: number }[]) => {
    if (pts.length === lastN) return; lastN = pts.length;
    while (trailGroup.children.length) trailGroup.remove(trailGroup.children[0]);
    pts.forEach((p) => {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), trailMat);
      d.position.set(p.x, 0.5 + p.y, 0);
      trailGroup.add(d);
    });
  };

  onTick(() => {
    const s = getState();
    ball.position.set(posX(s, s.t), 0.5 + posY(s, s.t), 0);
    rebuild(s.trails);
  });
  return () => {};
}
