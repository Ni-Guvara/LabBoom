// L9 场景：游标卡尺（主尺 + 游标 + 量爪）与螺旋测微器（U 形尺架 + 测微螺杆 + 微分筒）
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';

export type Tool = 'vernier' | 'micrometer';

export interface L9State {
  tool: Tool;
  opening: number; // 量爪/测杆张口宽度 mm
}

// 分度值：50 分度游标 0.02 mm；螺旋测微器 0.01 mm
export const DIVISION: Record<Tool, number> = { vernier: 0.02, micrometer: 0.01 };
export const TOOL_NAME: Record<Tool, string> = { vernier: '游标卡尺（50 分度）', micrometer: '螺旋测微器' };
export const MAX_OPENING: Record<Tool, number> = { vernier: 25, micrometer: 8 };

export function buildL9Scene(api: SceneApi, getState: () => L9State): () => void {
  const { scene, camera, addAnchor, onTick } = api;
  camera.position.set(0.5, 1.8, 5.2);
  camera.lookAt(0, 0.1, 0);

  // ---------- 游标卡尺 ----------
  const caliper = new THREE.Group();
  scene.add(caliper);

  const beamMat = new THREE.MeshStandardMaterial({ color: 0xb9c6d8, metalness: 0.8, roughness: 0.25 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.16, 0.3), beamMat);
  beam.position.set(0, 0, 0);
  caliper.add(beam);
  addAnchor(beam, '主尺 · 每格 1 mm');

  // 固定量爪
  const fixedJaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.3), beamMat);
  fixedJaw.position.set(-2.4, -0.55, 0);
  caliper.add(fixedJaw);

  // 游标（可滑动）
  const slider = new THREE.Group();
  const sliderBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.34, 0.34), new THREE.MeshStandardMaterial({ color: 0x2a3650, metalness: 0.6, roughness: 0.4 }));
  sliderBody.position.set(0, 0.06, 0);
  slider.add(sliderBody);
  const moveJaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.3), beamMat);
  moveJaw.position.set(-0.35, -0.55, 0);
  slider.add(moveJaw);
  caliper.add(slider);
  addAnchor(slider, '游标 · 0.02 mm');

  // 被测工件
  const pieceMat = new THREE.MeshStandardMaterial({ color: 0xffb14d, metalness: 0.4, roughness: 0.5 });
  const piece = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.2), pieceMat);
  caliper.add(piece);
  addAnchor(piece, '被测工件');

  // ---------- 螺旋测微器 ----------
  const micro = new THREE.Group();
  micro.visible = false;
  scene.add(micro);

  const frame = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.14, 16, 40, Math.PI), beamMat);
  frame.rotation.z = Math.PI;
  frame.position.set(-0.6, 0.2, 0);
  micro.add(frame);
  const anvil = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 16), beamMat);
  anvil.rotation.z = Math.PI / 2;
  anvil.position.set(-0.3, 0.2, 0);
  micro.add(anvil);
  addAnchor(anvil, '测砧');

  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 16), beamMat);
  spindle.rotation.z = Math.PI / 2;
  spindle.position.set(1.0, 0.2, 0);
  micro.add(spindle);
  addAnchor(spindle, '测微螺杆');

  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.2, 24), new THREE.MeshStandardMaterial({ color: 0x2a3650, metalness: 0.7, roughness: 0.3 }));
  sleeve.rotation.z = Math.PI / 2;
  sleeve.position.set(1.55, 0.2, 0);
  micro.add(sleeve);

  const thimble = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 32), new THREE.MeshStandardMaterial({ color: 0x4da6ff, metalness: 0.6, roughness: 0.3, emissive: 0x102a4a, emissiveIntensity: 0.4 }));
  thimble.rotation.z = Math.PI / 2;
  thimble.position.set(2.3, 0.2, 0);
  micro.add(thimble);
  addAnchor(thimble, '微分筒 · 0.01 mm');

  const microPiece = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 12), pieceMat);
  microPiece.rotation.z = Math.PI / 2;
  microPiece.position.set(0.1, 0.2, 0);
  micro.add(microPiece);

  onTick(() => {
    const s = getState();
    const isV = s.tool === 'vernier';
    caliper.visible = isV;
    micro.visible = !isV;

    if (isV) {
      // 尺身 5.4 单位 ≈ 25 mm，量爪随张口平移
      const k = s.opening / MAX_OPENING.vernier;
      const x = -2.4 + k * 4.4;
      slider.position.x = x - 0.2;
      piece.position.x = -2.25 + (k * 4.4) / 2;
      piece.scale.x = Math.max(0.05, k * 4.4);
    } else {
      const k = s.opening / MAX_OPENING.micrometer;
      // 测杆伸出量 & 微分筒旋转角（0.5 mm/圈）
      spindle.position.x = 1.0 - k * 1.2;
      thimble.rotation.x = (s.opening / 0.5) * Math.PI * 2;
      thimble.position.x = 2.3 - k * 1.2;
      microPiece.position.x = 0.1 - k * 0.5;
      microPiece.scale.x = 1;
    }
  });

  return () => { /* 资源随场景释放 */ };
}

// 读数拆分：主尺整数部分 + 游标/微分筒格数
export function splitReading(tool: Tool, v: number): { main: number; index: number; text: string } {
  if (tool === 'vernier') {
    const main = Math.floor(v);
    const index = Math.round((v - main) / DIVISION.vernier);
    return { main, index: Math.min(index, 49), text: `${main} + 0.02 × ${Math.min(index, 49)}` };
  }
  const main = Math.floor(v / 0.5) * 0.5;
  const index = Math.round((v - main) / DIVISION.micrometer);
  return { main, index: Math.min(index, 49), text: `${main.toFixed(1)} + 0.01 × ${Math.min(index, 49)}` };
}
