// 器材模型的统一入口：优先用 Blender 导出的 glb，缺失/失败时回退到程序化模型。
//
// 为什么不「await 到底」：一套实验里只要有一件器材还没建模，整个实验页就白屏。
// 回退保证「没建模的器材照样能跑」，建模进度和实验可用性解耦。
import * as THREE from 'three';
import { loadApparatus } from '@/engine/loader';

export interface LoadedApparatus {
  root: THREE.Group;
  /** partId → Mesh（仅 glb 模型有；回退模型为空表） */
  parts: Map<string, THREE.Mesh>;
  /** true = 用的 glb；false = 回退到程序化模型 */
  glb: boolean;
}

export async function loadOrFallback(
  id: string,
  fallback: () => THREE.Group,
): Promise<LoadedApparatus> {
  try {
    const m = await loadApparatus(id);
    return { root: m.root, parts: m.parts, glb: true };
  } catch (err) {
    console.warn(`[apparatus] ${id}.glb 加载失败，回退到程序化模型`, err);
    return { root: fallback(), parts: new Map(), glb: false };
  }
}

/** 按 partId 取部件（glb 走部件表，回退模型按名字递归找） */
export function partOf(m: LoadedApparatus, name: string): THREE.Object3D | undefined {
  const hit = m.parts.get(name);
  if (hit) return hit;
  let found: THREE.Object3D | undefined;
  m.root.traverse((o) => {
    if (found) return;
    const pid = String((o.userData?.partId as string | undefined) ?? o.name);
    if (pid === name) found = o;
  });
  return found;
}

/** 隐藏 glb 里用不到的部件（如打点计时器自带的固定长度纸带） */
export function hideParts(m: LoadedApparatus, prefix: string): void {
  m.root.traverse((o) => {
    const pid = String((o.userData?.partId as string | undefined) ?? o.name);
    if (pid.startsWith(prefix)) o.visible = false;
  });
}
