// 器材三维模型加载器（Blender → glTF → three）
// 建模约定见 blender/lab_common.py：1 单位 = 1 米，原点在底面接触中心，部件名 = partId
// 关键：模型只带 PBR 材质、不带光照，光影全部交给 studioEnvironment()（否则和现有器材打架）
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface ApparatusModel {
  /** 器材根节点（原点即底面接触中心，position.y = 0 就贴台面） */
  root: THREE.Group;
  /** partId → Mesh，供 §4.2 P11「点击即解释」 */
  parts: Map<string, THREE.Mesh>;
  /** 世界包围盒（米） */
  size: THREE.Vector3;
  /** 从场景摘除（几何/材质是模板共享的，不销毁） */
  detach: () => void;
}

const BASE = `${import.meta.env.BASE_URL}models/`;

/** 模板缓存：同一个器材在多个实验里出现时只下载/解析一次 */
const templates = new Map<string, Promise<THREE.Group>>();

function loadTemplate(id: string): Promise<THREE.Group> {
  const hit = templates.get(id);
  if (hit) return hit;
  const task = new GLTFLoader()
    .loadAsync(`${BASE}${id}.glb`)
    .then((gltf) => {
      const root = gltf.scene;
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // 材质微调：Blender 导出的 envMapIntensity 默认 1，
        // 与现有材质的 0.85~1.4 分档对齐一档，避免"一块死亮的塑料"
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          const std = m as THREE.MeshStandardMaterial;
          if (std && 'envMapIntensity' in std) std.envMapIntensity = 1.05;
        }
      });
      return root;
    });
  templates.set(id, task);
  return task;
}

export async function loadApparatus(id: string): Promise<ApparatusModel> {
  const tmpl = await loadTemplate(id);
  // clone(true)：实例之间共享几何与材质（draw call 友好），只复制节点树
  const root = tmpl.clone(true) as THREE.Group;
  root.name = id;

  const parts = new Map<string, THREE.Mesh>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    // GLTFLoader 会把 glTF extras 塞进 userData，partId 就在里面。
    // 多材质网格（如"纸带"= 纸 + 点迹两种材质）在 glTF 里是两个 primitive，
    // three 会拆成 Group + tape_1 / tape_2 两个子网格 —— partId 在父节点上，
    // 所以要回退到父级，否则 parts 里只剩 tape_1，按 'tape' 取不到。
    const pid =
      (o.userData?.partId as string | undefined) ??
      (o.parent?.userData?.partId as string | undefined) ??
      o.name;
    if (pid) parts.set(pid, mesh);
  });

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());

  return {
    root,
    parts,
    size,
    detach: () => root.removeFromParent(),
  };
}

/** 预热（登录页/切关卡时提前拉模型，进场景不掉帧） */
export function preloadApparatus(ids: string[]): void {
  for (const id of ids) void loadTemplate(id);
}
