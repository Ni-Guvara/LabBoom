// L2 场景：弹簧 + 标尺 + 砝码架（3D 交互）
// 含锚定标注（弹簧/砝码/标尺）、矢量箭头（弹力向上、重力向下）、宏观/微观双视图
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';
import { makeArrow } from '@/engine/SceneHost';

export interface SpringState {
  hooks: number;
  k: number;
  massPerHook: number;
  g: number;
}

export function springExtension(s: SpringState): number {
  return (s.hooks * s.massPerHook * s.g) / s.k;
}

export function buildSpringScene(
  api: SceneApi,
  getState: () => SpringState,
  getView: () => 'macro' | 'micro'
): () => void {
  const { scene, camera, addAnchor, onTick } = api;
  camera.position.set(4.5, 3.5, 7);
  camera.lookAt(0, 1.5, 0);

  const stage = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.4, 0.2, 48),
    new THREE.MeshStandardMaterial({ color: 0x2a3650, metalness: 0.3, roughness: 0.6 })
  );
  stage.position.y = -0.1;
  scene.add(stage);

  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 4, 24),
    new THREE.MeshStandardMaterial({ color: 0x6a7a96, metalness: 0.5, roughness: 0.4 })
  );
  pillar.position.set(0, 2, -1.4);
  scene.add(pillar);

  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.14, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x6a7a96, metalness: 0.5, roughness: 0.4 })
  );
  arm.position.set(0, 3.9, -1.4);
  scene.add(arm);

  const ruler = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 3.4, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xffd966, emissive: 0x553300, emissiveIntensity: 0.2 })
  );
  ruler.position.set(0.9, 2, -1.2);
  scene.add(ruler);
  for (let i = 0; i <= 10; i++) {
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.02, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xffd966 })
    );
    tick.position.set(0.9, 0.5 + i * 0.3, -1.1);
    scene.add(tick);
  }
  addAnchor(ruler, '标尺 · 刻度 0~3m');

  const springGroup = new THREE.Group();
  const springMat = new THREE.MeshStandardMaterial({ color: 0xc0d4ff, metalness: 0.6, roughness: 0.3 });
  const coils = 16;
  for (let i = 0; i < coils; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 24), springMat);
    ring.position.set(0, 3.6 - i * 0.16, -1.4);
    ring.rotation.x = Math.PI / 2;
    springGroup.add(ring);
  }
  scene.add(springGroup);
  addAnchor(springGroup, '弹簧 · 劲度系数 k');

  const tray = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.2, 0.12, 24),
    new THREE.MeshStandardMaterial({ color: 0x9a6a4a, metalness: 0.3, roughness: 0.5 })
  );
  tray.position.set(0, 1.0, -1.4);
  scene.add(tray);

  const weightsGroup = new THREE.Group();
  scene.add(weightsGroup);
  const weightMat = new THREE.MeshStandardMaterial({ color: 0x4da6ff, metalness: 0.5, roughness: 0.4, emissive: 0x1a3a66, emissiveIntensity: 0.3 });
  const rebuildWeights = (n: number) => {
    while (weightsGroup.children.length) weightsGroup.remove(weightsGroup.children[0]);
    for (let i = 0; i < n; i++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.18, 24), weightMat);
      w.position.set(0, 0.78 + i * 0.2, -1.4);
      weightsGroup.add(w);
    }
  };
  rebuildWeights(0);
  addAnchor(tray, '砝码 · 每个已知质量');

  let forceArrow: THREE.ArrowHelper | null = null;
  let gravityArrow: THREE.ArrowHelper | null = null;

  const microGroup = new THREE.Group();
  microGroup.visible = false;
  const microMat = new THREE.MeshStandardMaterial({ color: 0x5eead4, emissive: 0x2a6a5a, emissiveIntensity: 0.6 });
  for (let i = 0; i < 30; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), microMat);
    p.position.set((Math.random() - 0.5) * 1.6, Math.random() * 3, (Math.random() - 0.5) * 1.6 - 1.4);
    microGroup.add(p);
  }
  scene.add(microGroup);

  let lastN = -1;
  onTick(() => {
    const s = getState();
    const view = getView();
    const n = Math.round(s.hooks);
    if (n !== lastN) {
      rebuildWeights(n);
      lastN = n;
    }
    const x = springExtension(s);
    // 弹簧拉伸：托盘+砝码下移 x（米→3D 单位 1:1）
    const drop = Math.min(x, 2.5);
    tray.position.y = 1.0 - drop;
    weightsGroup.position.y = -drop;
    // 弹簧整体拉长：简单缩放 group 高度
    const baseLen = 2.6;
    springGroup.scale.y = (baseLen + drop) / baseLen;
    springGroup.position.y = -drop / 2;

    // 矢量箭头
    if (n > 0) {
      const F = n * s.massPerHook * s.g; // N
      const aLen = Math.min(1.5, 0.15 + F * 0.12);
      if (forceArrow) { scene.remove(forceArrow); forceArrow.dispose(); }
      if (gravityArrow) { scene.remove(gravityArrow); gravityArrow.dispose(); }
      forceArrow = makeArrow(
        new THREE.Vector3(0, tray.position.y + 0.3, -1.4),
        new THREE.Vector3(0, aLen, 0), 'force'
      );
      gravityArrow = makeArrow(
        new THREE.Vector3(0, tray.position.y - 0.1, -1.4),
        new THREE.Vector3(0, -aLen, 0), 'force'
      );
      scene.add(forceArrow);
      scene.add(gravityArrow);
    } else {
      if (forceArrow) { scene.remove(forceArrow); forceArrow.dispose(); forceArrow = null; }
      if (gravityArrow) { scene.remove(gravityArrow); gravityArrow.dispose(); gravityArrow = null; }
    }

    microGroup.visible = view === 'micro';
    springGroup.visible = view === 'macro';
    tray.visible = view === 'macro';
    weightsGroup.visible = view === 'macro';
  });

  return () => {
    forceArrow?.dispose();
    gravityArrow?.dispose();
  };
}
