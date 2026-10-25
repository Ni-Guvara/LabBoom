// 影棚级渲染：渐变背景 + 柔光箱环境反射（PMREM）+ 三点布光
// 目标观感：器材产品图——金属有长条高光带、塑料有清漆层、投影柔和且方向统一
import * as THREE from 'three';
import { mat } from './materials';

/**
 * 后景墙：台面之后的实心背板。
 *
 * 没有它时，台面后边缘之外直接是黑色渐变背景，画面里会出现一条从纯黑到台面的
 * 硬断层（俯角低于 22.5° 时台面后边缘一定在画幅内，各实验都能看到）。
 * 换成一面受光的实心墙后，边界变成"台面→墙脚→墙面渐变"，才是产品棚拍的样子。
 */
export function studioBackwall(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(12, 6);
  const mesh = new THREE.Mesh(geo, mat('bench', { color: 0x232930, roughness: 0.78 }));
  mesh.position.set(0, 2.8, -1.7);
  mesh.receiveShadow = true;
  mesh.userData.noFrame = true;
  return mesh;
}

/** 深色影棚背景：上方柔光、四周压暗（比纯色更像产品棚拍） */
export function studioBackdrop(dark = true): THREE.Texture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  if (dark) {
    const grad = g.createRadialGradient(S * 0.5, S * 0.3, S * 0.04, S * 0.5, S * 0.52, S * 0.82);
    grad.addColorStop(0, '#28323c');
    grad.addColorStop(0.42, '#161c23');
    grad.addColorStop(0.78, '#0a0e13');
    grad.addColorStop(1, '#05070a');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
  } else {
    const grad = g.createRadialGradient(S * 0.5, S * 0.3, S * 0.05, S * 0.5, S * 0.55, S * 0.8);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#e8eef6');
    grad.addColorStop(1, '#c9d4e2');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 影棚环境：三块柔光板 > 1 的 HDR 亮度，让金属反射出现有形状的高光带。
 * 比 RoomEnvironment 更"有方向"，这是器材看起来像产品摄影的关键。
 */
export function studioEnvironment(renderer: THREE.WebGLRenderer, dark = true): { texture: THREE.Texture; dispose: () => void } {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];

  // 环境底：竖直渐变穹顶（上亮下暗）。
  // 用穹顶而不是盒子：盒子的棱边会在金属平面反射里留下一条硬边（看起来像穿帮）。
  const sky = document.createElement('canvas');
  sky.width = 8;
  sky.height = 256;
  {
    const sg = sky.getContext('2d')!;
    const lg = sg.createLinearGradient(0, 0, 0, 256);
    if (dark) {
      // 中性灰（不带蓝）：金属才不会整片泛青，器材才有"铝"的观感。
      // 中段（0.45~0.7）不能压到近黑：细杆件朝相机的面反射方向近似水平，
      // 命中的正是这一段，压太黑整根立柱就成了剪影。
      lg.addColorStop(0, '#a3a8ad');
      lg.addColorStop(0.34, '#4e5459');
      lg.addColorStop(0.6, '#2e343a');
      lg.addColorStop(0.78, '#15181c');
      lg.addColorStop(1, '#050607');
    } else {
      lg.addColorStop(0, '#ffffff');
      lg.addColorStop(0.5, '#dfe7f0');
      lg.addColorStop(1, '#8d9cab');
    }
    sg.fillStyle = lg;
    sg.fillRect(0, 0, 8, 256);
  }
  const skyTex = new THREE.CanvasTexture(sky);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const domeGeo = new THREE.SphereGeometry(10, 32, 24);
  const domeMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide });
  env.add(new THREE.Mesh(domeGeo, domeMat));
  disposables.push(domeGeo, domeMat);

  // 柔光箱自带中心亮、边缘暗的衰减：金属反射才会是"一条渐变亮带"而不是整面死白
  const grad = document.createElement('canvas');
  grad.width = grad.height = 256;
  const gg = grad.getContext('2d')!;
  const rg = gg.createRadialGradient(128, 128, 8, 128, 128, 128);
  rg.addColorStop(0, '#ffffff');
  rg.addColorStop(0.45, '#cfcfcf');
  rg.addColorStop(0.8, '#4a4a4a');
  rg.addColorStop(1, '#101010');
  gg.fillStyle = rg;
  gg.fillRect(0, 0, 256, 256);
  const gradTex = new THREE.CanvasTexture(grad);

  const panel = (
    w: number, h: number, pos: [number, number, number], rot: [number, number, number], color: number, power: number,
  ) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, map: gradTex });
    m.color.setHex(color).multiplyScalar(power);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    env.add(mesh);
    disposables.push(geo, m);
  };

  // 关键：水平金属面（转盘/导轨顶面）是镜面，反射方向几乎一致。
  // 头顶若是一整块大柔光板 → 整个面反射同一个亮度 = 一片死白。
  // 产品摄影的做法是"细长灯条"：平面上只出现一条带，其余反射暗背景，才有材质感。
  // ① 天花板柔光：既要压住暗部，又不能成形。细杆件（铁架台立柱 φ10）侧面
  //    几乎照不到任何面板，只剩这条大面积柔光在起作用 —— 给太少就整根发黑成剪影。
  panel(12.0, 12.0, [0, 5.7, 0], [Math.PI / 2, 0, 0], 0xc6cbd0, dark ? 0.2 : 0.9);
  // ② 主灯条：横跨的长条柔光箱 → 平面上的主高光带
  panel(5.4, 0.62, [0.2, 5.0, -1.0], [Math.PI / 2, 0, 0], 0xf6f4ef, dark ? 2.6 : 1.9);
  // ③ 副灯条：错开纵深，给出第二条更弱的边缘高光
  panel(3.6, 0.4, [1.2, 5.0, 0.9], [Math.PI / 2, 0, 0], 0xffffff, dark ? 1.5 : 1.2);
  // ④ 小面积硬光"芯"：只在近镜面处点一下，制造锐利的高光点
  panel(0.9, 0.9, [0.5, 4.2, 1.3], [Math.PI / 2, 0, 0], 0xfff6ea, dark ? 6.5 : 3.6);
  // 右侧长条灯：竖直金属件（支杆/测力计）上那条竖向高光带
  panel(1.1, 4.4, [4.6, 1.9, 0.8], [0, -Math.PI / 2, 0], 0xdfe5ea, dark ? 3.6 : 2.2);
  // 左侧冷补光
  panel(2.4, 2.4, [-4.6, 1.4, 1.6], [0, Math.PI / 2, 0], 0xa8b8cc, dark ? 1.3 : 1.1);
  // 背后轮廓光：勾出器材边缘（唯一保留明显冷色，作为画面点缀）
  panel(2.6, 1.3, [0.2, 2.0, -4.8], [0, 0, 0], 0x9fdcf2, dark ? 2.0 : 1.4);
  // 正面柔光（略偏左）：朝相机的立面也要有反射，否则金属正面发死
  panel(4.0, 2.8, [-1.2, 1.8, 5.0], [0, Math.PI, 0], 0xf0f2f4, dark ? 1.6 : 1.2);

  const rt = pmrem.fromScene(env, 0.02);
  pmrem.dispose();
  disposables.forEach((d) => d.dispose());
  skyTex.dispose();
  gradTex.dispose();

  return {
    texture: rt.texture,
    dispose: () => {
      rt.texture.dispose();
      rt.dispose();
    },
  };
}

/** 三点布光 + 半球环境光；返回主光以便按实验调整强度 */
export function studioLights(scene: THREE.Scene, dark = true): THREE.DirectionalLight {
  // 半球光的"地面色"不能是纯黑：台面正面/器材立面的法线朝外，全靠它兜底，
  // 否则台面侧边会变成一条纯黑缝隙（看起来像台子被挖穿了）。
  scene.add(new THREE.AmbientLight(0x9ea8b4, dark ? 0.2 : 0.42));
  scene.add(new THREE.HemisphereLight(0xa8b4c2, 0x262b31, dark ? 0.5 : 0.55));

  // 主光用平行光：台面没有"聚光灯圆斑"，投影方向统一（产品图的标准做法）
  const key = new THREE.DirectionalLight(0xfff2e0, dark ? 2.15 : 2.0);
  key.position.set(2.4, 4.2, 2.6);
  key.target.position.set(0, 0.1, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.near = 0.2;
  key.shadow.camera.far = 14;
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.0012;
  // VSM 用 radius 做真正的模糊：数值越大半影越宽，硬边黑块才会消失
  key.shadow.radius = 7;
  key.shadow.blurSamples = 16;
  scene.add(key);
  scene.add(key.target);

  const fill = new THREE.DirectionalLight(0xb6c4d2, dark ? 0.5 : 0.85);
  fill.position.set(-2.6, 1.9, 1.6);
  scene.add(fill);

  // 轮廓光必须"低角度掠射"：一旦抬高到器材上方，平顶面会被它的镜面反射糊成一片
  // 冷白高光（转盘整面泛青就是这么来的）。放低到接近台面，只勾背面边缘。
  const rim = new THREE.SpotLight(0xbfe4f5, dark ? 7 : 4, 6, Math.PI / 3.4, 0.9, 1.4);
  rim.position.set(-1.5, 0.62, -2.4);
  rim.target.position.set(0, 0.12, 0);
  scene.add(rim);
  scene.add(rim.target);

  return key;
}
