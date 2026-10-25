// PBR 材质分区（§4.2 器材可信度）：金属 / 工程塑料 / 玻璃 / 橡胶 / 纸 / 木材
// 关键：不同材质必须有可区分的粗糙度与金属度区间，否则所有器材看起来像同一块塑料。
// 质感升级：金属/塑料/木材/纸带各自挂程序化微观粗糙度贴图 + 分档 envMapIntensity，
// 让环境反射出现真实的高光带（而不是一片平灰）。
import * as THREE from 'three';
import { metalNormal, metalRoughness, paperFiber, plasticRoughness, woodGrain } from './textures';

export type MatKind =
  | 'aluminum'
  /** 哑光阳极氧化铝：转盘/大平面，粗糙度高，不会反射成一整片白 */
  | 'aluminumMatte'
  | 'steel'
  | 'brass'
  | 'copper'
  | 'plasticRed'
  | 'plasticGray'
  | 'plasticBlack'
  | 'glass'
  | 'rubber'
  | 'wood'
  | 'paper'
  | 'paintWhite'
  /** 实验台面：深灰环氧树脂板（比木色台面更能衬出器材） */
  | 'bench';

type Micro = 'metal' | 'plastic' | 'wood' | 'paper' | 'none';

interface Spec {
  color: number;
  metalness: number;
  roughness: number;
  /** 环境反射强度：金属吃反射，橡胶/纸几乎不吃 */
  env: number;
  micro: Micro;
  /** 清漆层（工程塑料/喷漆件的第二层高光） */
  clearcoat?: number;
}

const SPECS: Record<MatKind, Spec> = {
  // 阳极氧化铝导轨：金属但偏哑光（Ra3.2 工作面）
  // 粗糙度 0.48 时，导轨远端的掠射角上 Fresnel 冲到 1，整段气孔面会烧成纯白；
  // 0.56 把反射摊开，掠射处仍亮但能留住气孔的点阵细节。
  aluminum: { color: 0xa9a9a7, metalness: 0.9, roughness: 0.56, env: 1.15, micro: 'metal' },
  // 大平面铝件（转盘/端板）：把粗糙度拉到 0.62，反射被打散成柔和亮带而不是镜面白片
  aluminumMatte: { color: 0x8e8e8c, metalness: 0.85, roughness: 0.62, env: 0.85, micro: 'metal' },
  // 钢：配重、螺栓、支杆
  // 粗糙度 0.32 时，φ12 立柱只能反射到环境的一小段，看起来是纯黑剪影；
  // 0.42 会把反射摊开，接住更多穹顶灰底，杆件才有金属的圆润过渡
  steel: { color: 0x9b9b99, metalness: 0.96, roughness: 0.42, env: 1.3, micro: 'metal' },
  brass: { color: 0xc9a227, metalness: 0.92, roughness: 0.3, env: 1.4, micro: 'metal' },
  copper: { color: 0xb87333, metalness: 0.92, roughness: 0.33, env: 1.4, micro: 'metal' },
  // 工程塑料（POM/ABS）：无金属感、半哑光 + 清漆层
  plasticRed: { color: 0xd8412f, metalness: 0.04, roughness: 0.46, env: 0.85, micro: 'plastic', clearcoat: 0.4 },
  plasticGray: { color: 0x8b95a1, metalness: 0.04, roughness: 0.52, env: 0.8, micro: 'plastic', clearcoat: 0.3 },
  // 清漆 0.45 时，黑色计时器底座在掠射角上会整片反成白色（Fresnel 冲到 1），
  // 144 mm 的底座直接糊成一块白板。压到 0.15 后只保留边缘一层薄反光。
  plasticBlack: { color: 0x2b3038, metalness: 0.06, roughness: 0.5, env: 0.55, micro: 'plastic', clearcoat: 0.15 },
  glass: { color: 0xdfeefc, metalness: 0.0, roughness: 0.04, env: 1.6, micro: 'none', clearcoat: 1 },
  rubber: { color: 0x1f2328, metalness: 0.0, roughness: 0.92, env: 0.25, micro: 'plastic' },
  // 0x8a6134 正对主光时偏"红油漆"，压到深棕才有实验木板（上过清漆的硬木）的分量
  wood: { color: 0x6b4a26, metalness: 0.0, roughness: 0.82, env: 0.26, micro: 'wood' },
  // 纸：底色再压一档，否则在 2.15 主光下直接顶到 255，纸纤维和方格线全被吃掉
  paper: { color: 0xc6bba0, metalness: 0.0, roughness: 0.95, env: 0.15, micro: 'paper' },
  // 白塑料件（计时器外壳/光电门）：env 从 0.7 降到 0.4，避免和纸一起糊成一块白斑
  paintWhite: { color: 0xd9dde1, metalness: 0.0, roughness: 0.58, env: 0.4, micro: 'plastic', clearcoat: 0.25 },
  // 台面：稍微降低粗糙度，让它映出一条柔光带 —— 大片空旷台面才不会变成一块死黑
  bench: { color: 0x23272c, metalness: 0.0, roughness: 0.72, env: 0.34, micro: 'plastic' },
};

const mapCache = new Map<Micro, THREE.Texture | null>();

function microMap(kind: Micro): THREE.Texture | null {
  if (mapCache.has(kind)) return mapCache.get(kind)!;
  let tex: THREE.Texture | null = null;
  if (kind === 'metal') tex = metalRoughness();
  else if (kind === 'plastic') tex = plasticRoughness();
  else if (kind === 'paper') tex = paperFiber();
  else if (kind === 'wood') tex = woodGrain();
  mapCache.set(kind, tex);
  return tex;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

export function mat(
  kind: MatKind,
  override?: Partial<Pick<Spec, 'color' | 'metalness' | 'roughness'>> & {
    transparent?: boolean;
    opacity?: number;
    emissive?: number;
  },
): THREE.MeshStandardMaterial {
  const key = kind + (override ? JSON.stringify(override) : '');
  const hit = cache.get(key);
  if (hit) return hit;

  const spec = { ...SPECS[kind], ...override };
  // 木纹走颜色通道（与 override.color 相乘），其余材质走微观粗糙度
  const isWood = spec.micro === 'wood';
  const map = isWood || override?.roughness !== undefined ? null : microMap(spec.micro);

  const m = new THREE.MeshPhysicalMaterial({
    color: spec.color,
    metalness: spec.metalness,
    roughness: spec.roughness,
    roughnessMap: map,
    normalMap: spec.micro === 'metal' && override?.roughness === undefined ? metalNormal() : null,
    normalScale: new THREE.Vector2(0.42, 0.42),
    map: isWood ? woodGrain() : null,
    transparent: override?.transparent ?? false,
    opacity: override?.opacity ?? 1,
    emissive: override?.emissive ?? 0x000000,
    envMapIntensity: spec.env,
    clearcoat: spec.clearcoat ?? 0,
    clearcoatRoughness: 0.5,
  });
  cache.set(key, m);
  return m;
}

/** 统一开启投影/接影，避免"浮在台面上" */
export function applyShadows(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
}

let shadowTex: THREE.Texture | null = null;

function radialTexture(): THREE.Texture {
  if (shadowTex) return shadowTex;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  shadowTex = tex;
  return tex;
}

/** 接触阴影（软阴影贴片）：无阴影时物件必然"漂浮"，这是性价比最高的高级感来源 */
export function contactShadow(radius: number, opacity = 0.5): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: radialTexture(),
      transparent: true,
      opacity,
      depthWrite: false,
      color: 0x000000,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  m.renderOrder = 1;
  return m;
}
