// L4 场景：长木板 + 小车 + 定滑轮 + 沙桶（控制变量法）
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';

export interface L4State {
  m0: number;  // 沙桶质量 kg
  M: number;   // 小车质量 kg
  friction: boolean; // 摩擦补偿开关
}
export const G = 9.8;
export function accel(s: L4State): number {
  const F = s.m0 * G;
  const a = F / s.M;
  return s.friction ? a : Math.max(0, a - 0.3); // 未补偿时减去摩擦（产生截距）
}

export function buildL4Scene(api: SceneApi, getState: () => L4State): () => void {
  const { scene, camera, addAnchor, onTick } = api;
  camera.position.set(3, 2.2, 5);
  camera.lookAt(0, 0.3, 0);

  const board = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.12, 0.6), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.7 }));
  board.position.set(0, 0, 0); scene.add(board); addAnchor(board, '长木板');
  // 定滑轮（右端）
  const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 10, 24), new THREE.MeshStandardMaterial({ color: 0x4da6ff, metalness: 0.6 }));
  pulley.position.set(2.3, 0.45, 0); pulley.rotation.y = Math.PI / 2; scene.add(pulley); addAnchor(pulley, '定滑轮');
  // 小车
  const cart = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.4), new THREE.MeshStandardMaterial({ color: 0xff5a5a, metalness: 0.3 }));
  cart.position.set(-0.5, 0.26, 0); scene.add(cart); addAnchor(cart, '小车 M');
  // 绳
  const rope = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.01, 0.01), new THREE.MeshBasicMaterial({ color: 0xf5f7fa }));
  rope.position.set(1, 0.4, 0); scene.add(rope);
  // 沙桶
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.3, 16), new THREE.MeshStandardMaterial({ color: 0xffb14d }));
  bucket.position.set(2.3, -0.5, 0); scene.add(bucket); addAnchor(bucket, '沙桶 m0');

  onTick(() => {
    const s = getState();
    // 沙桶随 m0 缩放，小车随 a 轻微位移示意
    bucket.scale.y = 0.5 + s.m0 * 2;
  });
  return () => {};
}
