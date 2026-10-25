// 程序化贴图：不引入外部素材，运行时用 canvas 生成金属拉丝 / 塑料微颗粒 / 木纹 / 纸纤维
// 用途：把"纯色 PBR"升级成"有微观起伏的 PBR"，环境反射才会出现真实的高光带
import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, repeat = 1, srgb = false): THREE.Texture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 拉丝金属粗糙度：纵向细密划痕 + 低频斑驳（作为 roughnessMap，越亮越粗糙） */
export function metalRoughness(): THREE.Texture {
  const hit = cache.get('metalR');
  if (hit) return hit;
  const S = 512;
  const [c, g] = makeCanvas(S);
  // 基准值偏高：roughnessMap 与材质 roughness 相乘，基准太暗会让金属变镜面
  g.fillStyle = '#d2d2d2';
  g.fillRect(0, 0, S, S);
  // 低频斑驳：让反射高光沿表面有浓淡变化
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 24 + Math.random() * 90;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const v = Math.random() > 0.5 ? 255 : 0;
    grad.addColorStop(0, `rgba(${v},${v},${v},0.05)`);
    grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 纵向拉丝：Ra 值沿加工方向连续，横向随机
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const len = 30 + Math.random() * 180;
    const a = 0.03 + Math.random() * 0.09;
    g.strokeStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    g.lineWidth = Math.random() < 0.15 ? 2 : 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, y + len);
    g.stroke();
  }
  const tex = finish(c, 2);
  cache.set('metalR', tex);
  return tex;
}

/**
 * 拉丝金属法线：纵向沟槽让平面反射出现细密条纹（否则大平面反射是一块死白）。
 * 沟槽数量必须和屏幕像素匹配：256 条 / repeat 1 在 320 mm 的盘面上约 1.2 mm 一条，
 * 再密就落到像素以下，反射高光会出现摩尔纹（看起来像唱片纹）。
 */
export function metalNormal(): THREE.Texture {
  const hit = cache.get('metalN');
  if (hit) return hit;
  const S = 512;
  const [c, g] = makeCanvas(S);
  g.fillStyle = 'rgb(128,128,255)';
  g.fillRect(0, 0, S, S);
  const N = 256;
  for (let i = 0; i < N; i++) {
    const x = (i / N) * S + (Math.random() - 0.5) * 1.4;
    const v = 128 + (Math.random() - 0.5) * 34;
    g.strokeStyle = `rgba(${Math.round(v)},128,255,${0.3 + Math.random() * 0.4})`;
    g.lineWidth = Math.random() < 0.18 ? 3 : 2;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, S);
    g.stroke();
  }
  const tex = finish(c, 1);
  tex.colorSpace = THREE.NoColorSpace;
  cache.set('metalN', tex);
  return tex;
}

/** 塑料/喷漆微颗粒粗糙度：细密喷砂感，避免大面积镜面反光 */
export function plasticRoughness(): THREE.Texture {
  const hit = cache.get('plastR');
  if (hit) return hit;
  const S = 256;
  const [c, g] = makeCanvas(S);
  g.fillStyle = '#d8d8d8';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 14000; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const v = 190 + Math.random() * 60;
    g.fillStyle = `rgba(${v},${v},${v},0.35)`;
    g.fillRect(x, y, 1, 1);
  }
  const tex = finish(c, 3);
  cache.set('plastR', tex);
  return tex;
}

/** 木纹（合并成一张近灰度图，作为 color 的细节扰动 + roughnessMap 共用） */
export function woodGrain(): THREE.Texture {
  const hit = cache.get('wood');
  if (hit) return hit;
  const S = 512;
  const [c, g] = makeCanvas(S);
  g.fillStyle = '#b99a76';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * S;
    const amp = 2 + Math.random() * 5;
    const w = 0.4 + Math.random() * 1.2;
    g.strokeStyle = `rgba(${90 + Math.random() * 60},${60 + Math.random() * 40},${30 + Math.random() * 30},${0.12 + Math.random() * 0.25})`;
    g.lineWidth = w;
    g.beginPath();
    for (let x = 0; x <= S; x += 8) {
      const yy = y + Math.sin((x / S) * Math.PI * (2 + amp / 6)) * amp;
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }
  // 细纹理
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    g.fillStyle = `rgba(60,40,20,${0.03 + Math.random() * 0.05})`;
    g.fillRect(x, y, 2 + Math.random() * 3, 1);
  }
  const tex = finish(c, 5, true);
  cache.set('wood', tex);
  return tex;
}

/** 纸纤维：纸带/白纸的细微起伏 */
export function paperFiber(): THREE.Texture {
  const hit = cache.get('paper');
  if (hit) return hit;
  const S = 256;
  const [c, g] = makeCanvas(S);
  g.fillStyle = '#b4b4b4';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const a = 0.04 + Math.random() * 0.1;
    g.strokeStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 2 + Math.random() * 6, y + (Math.random() - 0.5) * 2);
    g.stroke();
  }
  const tex = finish(c, 2);
  cache.set('paper', tex);
  return tex;
}
