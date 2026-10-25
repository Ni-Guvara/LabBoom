// 力学实验器具库（1 unit = 1 m，按厂商实测规格建模）
// 尺寸来源：气垫导轨工作面 1200 mm / 脚距 600 mm / 进气口 φ30 mm / 滑行器 121 mm 155 g；
// 轨道小车 J2183：轨长 900 mm、轨距 50 mm、小车 200±10 g、配块 10 g/50 g；
// 电磁打点计时器 J0203：打点周期 0.02 s（50 Hz）、AC 6 V、外形 144×70×60 mm、配重阻力 ≤3 g。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mat } from '@/engine/materials';

export const G = 9.8;
export const RAIL_LENGTH = 1.2; // 气垫导轨工作面
export const BOARD_LENGTH = 1.0; // 长木板
export const CART_MASS = 0.2; // J2183 小车 200 g
export const TAPE_INTERVAL = 0.02; // 打点计时器周期

export interface PartSpec {
  name: string;
  /** 外形尺寸 x/y/z，单位 m（供锚点与验收断言使用） */
  size: [number, number, number];
  mass?: number;
}

function rb(w: number, h: number, d: number, r = 0.003): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 3));
}

function solid(geo: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

/**
 * 仪表面板（数码/刻度读数）：canvas 贴图 + MeshBasicMaterial。
 * 器材上的读数必须"看得到"，所以它不受影棚光照影响、也不算标注（不走悬停逻辑）。
 */
export interface Plate {
  mesh: THREE.Mesh;
  setText: (text: string) => void;
}
export function textPlate(w: number, h: number, text: string, opts?: { bg?: string; fg?: string; fontSize?: number }): Plate {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = Math.round((256 * h) / w);
  const ctx = canvas.getContext('2d')!;
  const bg = opts?.bg ?? '#10161d';
  const fg = opts?.fg ?? '#8ff0c0';
  const fontSize = opts?.fontSize ?? 96;
  const draw = (s: string) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(140,160,180,0.55)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 数字等宽：读数变化时文字不左右跳
    ctx.font = `600 ${fontSize}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.fillText(s, canvas.width / 2, canvas.height / 2 + 4);
  };
  draw(text);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
  );
  return {
    mesh,
    setText: (s: string) => { draw(s); tex.needsUpdate = true; },
  };
}

/** 几何刻度（不用贴图，放大 4 倍不糊）：短刻线 5 mm、长刻线 10 mm */
function addTicks(
  parent: THREE.Object3D,
  opts: { length: number; y: number; z: number; minor: number; major: number; color?: number },
): void {
  const { length, y, z, minor, major } = opts;
  const material = new THREE.MeshBasicMaterial({ color: opts.color ?? 0x2b3038 });
  const minorGeo = new THREE.BoxGeometry(0.0007, 0.0008, 0.0025);
  const majorGeo = new THREE.BoxGeometry(0.0012, 0.0008, 0.005);
  const nMinor = Math.floor(length / minor);
  const minors: number[] = [];
  for (let i = 0; i <= nMinor; i++) {
    const x = -length / 2 + i * minor;
    if (Math.abs(x / major - Math.round(x / major)) < 1e-6) continue;
    minors.push(x);
  }
  const nMajor = Math.floor(length / major);

  const im1 = new THREE.InstancedMesh(minorGeo, material, minors.length);
  const im2 = new THREE.InstancedMesh(majorGeo, material, nMajor + 1);
  const dummy = new THREE.Object3D();
  minors.forEach((x, i) => {
    dummy.position.set(x, y, z);
    dummy.updateMatrix();
    im1.setMatrixAt(i, dummy.matrix);
  });
  for (let i = 0; i <= nMajor; i++) {
    dummy.position.set(-length / 2 + i * major, y, z);
    dummy.updateMatrix();
    im2.setMatrixAt(i, dummy.matrix);
  }
  im1.instanceMatrix.needsUpdate = true;
  im2.instanceMatrix.needsUpdate = true;
  parent.add(im1, im2);
}

/** 实验桌台面（所有器具的接触阴影落在这里） */
export function tableTop(w = 2.6, d = 1.2, y = 0): THREE.Group {
  const g = new THREE.Group();
  const top = solid(rb(w, 0.04, d, 0.004), mat('bench'));
  top.position.y = y - 0.02;
  top.receiveShadow = true;
  g.add(top);
  g.userData.spec = { name: '实验桌', size: [w, 0.04, d] } as PartSpec;
  // 取景时跳过台面：台面比器材大一个量级，算进来构图就变成「拍台子」
  g.userData.noFrame = true;
  return g;
}

/** 气垫导轨：1200 mm 工作面 + 600 mm 脚距 + φ30 mm 进气口 + 几何刻度 */
export function airTrack(length = RAIL_LENGTH): THREE.Group {
  const g = new THREE.Group();
  const h = 0.11; // 工作面高度
  // 工作面（三角形导轨用三层盒体逼近真实型材截面）
  const top = solid(rb(length, 0.014, 0.09, 0.003), mat('aluminum'));
  top.position.y = h;
  const mid = solid(rb(length, 0.03, 0.072, 0.004), mat('aluminum'));
  mid.position.y = h - 0.022;
  const bottom = solid(rb(length, 0.012, 0.05, 0.003), mat('aluminum'));
  bottom.position.y = h - 0.043;
  g.add(top, mid, bottom);

  // 气孔（两列，25 mm 间距）：InstancedMesh 控制开销
  const holeGeo = new THREE.CylinderGeometry(0.0018, 0.0018, 0.002, 6);
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x1a1f26 });
  const n = Math.floor(length / 0.025) + 1;
  const holes = new THREE.InstancedMesh(holeGeo, holeMat, n * 2);
  const dummy = new THREE.Object3D();
  let k = 0;
  for (let i = 0; i < n; i++) {
    for (const z of [-0.018, 0.018]) {
      dummy.position.set(-length / 2 + i * 0.025, h + 0.0072, z);
      dummy.updateMatrix();
      holes.setMatrixAt(k++, dummy.matrix);
    }
  }
  holes.instanceMatrix.needsUpdate = true;
  g.add(holes);

  // 支脚：与导轨脚距 600 mm 对应
  for (const x of [-0.3, 0.3]) {
    const foot = solid(new THREE.CylinderGeometry(0.012, 0.016, h - 0.05, 12), mat('steel'));
    foot.position.set(x, (h - 0.05) / 2, 0);
    g.add(foot);
  }
  // 进气口 φ30 mm
  const port = solid(new THREE.CylinderGeometry(0.015, 0.015, 0.03, 16), mat('copper'));
  port.rotation.z = Math.PI / 2;
  port.position.set(-length / 2 - 0.012, h - 0.03, 0);
  g.add(port);

  addTicks(g, { length: length - 0.06, y: h - 0.0075, z: 0.0452, minor: 0.005, major: 0.05 });

  g.userData.spec = { name: '气垫导轨', size: [length, h + 0.008, 0.09] } as PartSpec;
  return g;
}

/** 长木板（L4 用）：1000×120×20 mm，带刻度与挡块 */
export function board(length = BOARD_LENGTH): THREE.Group {
  const g = new THREE.Group();
  const plank = solid(rb(length, 0.02, 0.12, 0.003), mat('wood'));
  plank.position.y = 0.01;
  g.add(plank);
  // 左端挡块（打点计时器安装位）
  const stop = solid(rb(0.012, 0.028, 0.1, 0.002), mat('plasticBlack'));
  stop.position.set(-length / 2 + 0.008, 0.034, 0);
  g.add(stop);
  addTicks(g, { length: length - 0.04, y: 0.0205, z: 0.0605, minor: 0.005, major: 0.05 });
  g.userData.spec = { name: '长木板', size: [length, 0.02, 0.12] } as PartSpec;
  return g;
}

/** 小车（J2183 轨道小车）：121×50×30 mm，200 g，带挡光片与挂钩 */
export function cart(opts?: { mass?: number; flagWidth?: number }): THREE.Group {
  const length = 0.121;
  const g = new THREE.Group();
  const body = solid(rb(length, 0.03, 0.05, 0.006), mat('plasticRed'));
  body.position.y = 0.019;
  g.add(body);
  // 顶部配重板
  const plate = solid(rb(length * 0.72, 0.004, 0.042, 0.002), mat('aluminum'));
  plate.position.y = 0.036;
  g.add(plate);
  // 挡光片（沿运动方向的宽度决定挡光时间）
  const flagWidth = opts?.flagWidth ?? 0.05;
  const post = solid(rb(0.004, 0.03, 0.004, 0.001), mat('steel'));
  post.position.set(0.02, 0.052, 0);
  const flag = solid(rb(flagWidth, 0.028, 0.038, 0.0015), mat('plasticBlack'));
  flag.position.set(0.02, 0.078, 0);
  flag.name = 'flag';
  g.add(post, flag);
  // 四只轮子（φ18 mm 胶轮 + 轮毂 + 车轴）：轮轴沿 z，车轮压着轨道/木板面滚动
  const WHEEL_R = 0.009;
  const wheels: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.Group();
      const tire = solid(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.004, 18), mat('plasticBlack', { roughness: 0.85 }));
      tire.rotation.x = Math.PI / 2;
      const hub = solid(new THREE.CylinderGeometry(0.0032, 0.0032, 0.0046, 12), mat('steel'));
      hub.rotation.x = Math.PI / 2;
      w.add(tire, hub);
      w.position.set(sx * (length / 2 - 0.02), WHEEL_R, sz * 0.027);
      g.add(w);
      wheels.push(w);
    }
  }
  // 车轴
  for (const sx of [-1, 1]) {
    const axle = solid(new THREE.CylinderGeometry(0.0011, 0.0011, 0.058, 8), mat('steel'));
    axle.rotation.x = Math.PI / 2;
    axle.position.set(sx * (length / 2 - 0.02), WHEEL_R, 0);
    g.add(axle);
  }
  g.userData.wheels = wheels;
  // 挂钩（后钩）
  const hook = solid(new THREE.TorusGeometry(0.006, 0.0012, 8, 14), mat('steel'));
  hook.rotation.y = Math.PI / 2;
  hook.position.set(-length / 2 - 0.006, 0.02, 0);
  g.add(hook);

  const mass = opts?.mass ?? CART_MASS;
  g.userData.spec = { name: '小车', size: [length, 0.09, 0.05], mass } as PartSpec;
  g.userData.flagWidth = flagWidth;
  g.userData.mass = mass;
  return g;
}

/** 电磁打点计时器 J0203：144×70×60 mm，0.02 s 一点，带纸带与复写纸盘 */
export function tickerTimer(): THREE.Group {
  const g = new THREE.Group();
  const base = solid(rb(0.144, 0.008, 0.07, 0.003), mat('plasticBlack'));
  base.position.y = 0.004;
  g.add(base);
  // 线圈（φ24 mm 铜线包）
  const coil = solid(new THREE.CylinderGeometry(0.012, 0.012, 0.026, 18), mat('copper'));
  coil.rotation.x = Math.PI / 2;
  coil.position.set(-0.02, 0.03, 0);
  g.add(coil);
  // 振动片 + 打点针
  const reed = solid(rb(0.07, 0.0012, 0.012, 0.0006), mat('steel'));
  reed.position.set(-0.005, 0.048, 0);
  reed.rotation.z = 0.03;
  g.add(reed);
  const needle = solid(new THREE.CylinderGeometry(0.0006, 0.0008, 0.012, 6), mat('steel'));
  needle.position.set(0.03, 0.044, 0);
  g.add(needle);
  // 复写纸圆盘 φ30 mm
  const paperDisk = solid(new THREE.CylinderGeometry(0.015, 0.015, 0.0022, 20), mat('plasticBlack'));
  paperDisk.position.set(0.03, 0.038, 0);
  g.add(paperDisk);
  // 立柱（安装到木板/导轨端）
  for (const x of [-0.05, 0.05]) {
    const col = solid(new THREE.CylinderGeometry(0.003, 0.003, 0.028, 10), mat('steel'));
    col.position.set(x, 0.022, 0);
    g.add(col);
  }
  // 纸带（17 mm 宽）
  const tape = solid(rb(0.34, 0.0007, 0.017, 0.0002), mat('paper'));
  tape.position.set(0.2, 0.0455, 0);
  tape.name = 'tape';
  g.add(tape);
  // 接线柱
  for (const z of [-0.024, 0.024]) {
    const post = solid(new THREE.CylinderGeometry(0.0022, 0.0022, 0.014, 10), mat('brass'));
    post.position.set(-0.06, 0.014, z);
    g.add(post);
  }
  g.userData.spec = { name: '电磁打点计时器', size: [0.144, 0.06, 0.07] } as PartSpec;
  g.userData.tape = tape;
  return g;
}

/** 光电门：U 形槽 50 mm、立杆可调（教学导轨上多用短立杆）、带红外窗口 */
export function photogate(gap = 0.05, postHeight = 0.3): THREE.Group {
  const g = new THREE.Group();
  const base = solid(new THREE.CylinderGeometry(0.032, 0.036, 0.008, 20), mat('steel'));
  base.position.y = 0.004;
  const post = solid(new THREE.CylinderGeometry(0.006, 0.006, postHeight, 12), mat('steel'));
  post.position.y = postHeight / 2 + 0.008;
  g.add(base, post);

  const head = new THREE.Group();
  head.position.y = postHeight + 0.008;
  const yoke = solid(rb(0.014, 0.05, gap + 0.024, 0.003), mat('plasticGray'));
  yoke.position.y = 0.025;
  head.add(yoke);
  // 两臂（减去中间的槽，用两块板表达）
  for (const sz of [-1, 1]) {
    const arm = solid(rb(0.016, 0.014, 0.012, 0.002), mat('plasticGray'));
    arm.position.set(0, 0.006, sz * (gap / 2 + 0.006));
    head.add(arm);
    const eye = solid(new THREE.SphereGeometry(0.0022, 10, 8), mat('plasticRed', { emissive: 0x551100 }));
    eye.position.set(0.008, 0.006, sz * (gap / 2 + 0.004));
    head.add(eye);
  }
  // 数显窗 + 指示灯：读数直接做在器材面板上（不走悬停标注）
  const plate = textPlate(0.03, 0.011, '--', { fontSize: 88 });
  plate.mesh.position.set(0, 0.030, gap / 2 + 0.0122);
  head.add(plate.mesh);
  const led = solid(new THREE.SphereGeometry(0.0021, 10, 8), mat('plasticRed', { emissive: 0x772211 }));
  led.position.set(0, 0.043, gap / 2 + 0.0122);
  head.add(led);
  g.add(head);
  // 立柱锁紧手轮 + 内侧高度刻度（光电门高度可调是实验的关键变量）
  const knob = solid(new THREE.CylinderGeometry(0.0055, 0.0055, 0.005, 14), mat('plasticBlack'));
  knob.rotation.z = Math.PI / 2;
  knob.position.set(0.011, postHeight + 0.004, 0);
  g.add(knob);
  const tickMat2 = new THREE.MeshBasicMaterial({ color: 0x2b3038 });
  for (let i = 0; i < Math.floor(postHeight / 0.02); i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.0006, 0.0007, i % 5 === 0 ? 0.005 : 0.0028), tickMat2);
    t.position.set(0.0065, 0.012 + i * 0.02, 0);
    g.add(t);
  }
  g.userData.spec = { name: '光电门', size: [0.02, 0.36, gap + 0.03] } as PartSpec;
  g.userData.gap = gap;
  g.userData.setReadout = (text: string) => plate.setText(text);
  return g;
}

/** 定滑轮（φ50 mm）+ 台边夹持座 */
export function pulley(): THREE.Group {
  const g = new THREE.Group();
  const wheel = new THREE.Group();
  // 轮盘必须落在 XY 平面（轴沿 z）：绳子从水平段绕到竖直段，轮槽要正对细线
  const disk = solid(new THREE.CylinderGeometry(0.025, 0.025, 0.008, 28), mat('aluminum'));
  disk.rotation.x = Math.PI / 2;
  const groove = solid(new THREE.TorusGeometry(0.024, 0.0018, 8, 32), mat('plasticBlack'));
  wheel.add(disk, groove);
  wheel.position.set(0, 0.03, 0);
  g.add(wheel);
  // 支架
  for (const z of [-0.006, 0.006]) {
    const arm = solid(rb(0.006, 0.05, 0.004, 0.001), mat('steel'));
    arm.position.set(0, 0.026, z + 0.016);
    g.add(arm);
  }
  const axle = solid(new THREE.CylinderGeometry(0.0025, 0.0025, 0.05, 10), mat('steel'));
  axle.rotation.x = Math.PI / 2;
  axle.position.set(0, 0.03, 0);
  g.add(axle);
  // 台边夹
  const clamp = solid(rb(0.05, 0.012, 0.04, 0.002), mat('plasticBlack'));
  clamp.position.set(0, 0.006, 0.014);
  g.add(clamp);
  g.userData.spec = { name: '定滑轮', size: [0.05, 0.06, 0.05] } as PartSpec;
  g.userData.wheel = wheel;
  g.userData.radius = 0.025;
  return g;
}

/** 绕在滑轮上的 90° 绳段（顶 → 右）：定滑轮处细线不能出现折角断点 */
export function pulleyArc(radius = 0.025, thickness = 0.0009): THREE.Mesh {
  const arc = new THREE.Mesh(
    new THREE.TorusGeometry(radius, thickness, 6, 16, Math.PI / 2),
    mat('paper', { color: 0xe8e4d8 }),
  );
  arc.userData.rope = true;
  return arc;
}

/**
 * 弹簧测力计（条形，量程 5 N / 分度 0.1 N）：圆筒 + 透明刻度窗 + 指针 + 挂钩。
 * 前端挂钩挂在绳上，指针位置由 userData.setReading(N) 更新，面板上直接显示读数。
 */
export function dynamometer(maxForce = 5, len = 0.09): THREE.Group {
  const g = new THREE.Group();
  const LEN = len;
  const HOOK_X = -LEN / 2 - 0.005;
  const body = solid(rb(LEN, 0.014, 0.012, 0.004), mat('aluminumMatte'));
  g.add(body);
  // 刻度窗（顶面），底色深、读数发光绿
  const plate = textPlate(LEN * 0.78, 0.009, '0.00 N', { fontSize: 96 });
  plate.mesh.rotation.x = -Math.PI / 2;
  plate.mesh.position.set(LEN * 0.04, 0.0072, 0);
  g.add(plate.mesh);
  // 指针（红色游标，沿 +x 滑动：力越大越靠外）
  const pointer = solid(new THREE.BoxGeometry(0.0012, 0.0016, 0.009), mat('plasticRed'));
  const x0 = -LEN / 2 + 0.01;
  pointer.position.set(x0, 0.0075, 0);
  g.add(pointer);
  // 挂钩（-x 端，挂绳）与吊环（+x 端，手拉/固定）
  const hook = solid(new THREE.TorusGeometry(0.005, 0.0011, 8, 14), mat('steel'));
  hook.rotation.y = Math.PI / 2;
  hook.position.set(HOOK_X, 0, 0);
  g.add(hook);
  const ring = solid(new THREE.TorusGeometry(0.004, 0.001, 8, 14), mat('steel'));
  ring.rotation.y = Math.PI / 2;
  ring.position.set(LEN / 2 + 0.004, 0, 0);
  g.add(ring);
  const cap = solid(new THREE.CylinderGeometry(0.0072, 0.0072, 0.004, 16), mat('plasticBlack'));
  cap.rotation.z = Math.PI / 2;
  cap.position.set(-LEN / 2, 0, 0);
  g.add(cap);

  g.userData.spec = { name: '弹簧测力计', size: [LEN + 0.02, 0.016, 0.014] } as PartSpec;
  g.userData.maxForce = maxForce;
  g.userData.hookOffset = Math.abs(HOOK_X);
  g.userData.setReading = (f: number) => {
    const k = Math.max(0, Math.min(1, f / maxForce));
    pointer.position.x = x0 + k * (LEN - 0.024);
    plate.setText(`${f.toFixed(2)} N`);
  };
  return g;
}

/** 砝码盘 + 砝码组（10 g / 20 g / 50 g，钢质圆柱） */
export function weightStack(masses: number[] = [0.05]): THREE.Group {
  const g = new THREE.Group();
  const dish = solid(new THREE.CylinderGeometry(0.045, 0.04, 0.004, 24), mat('aluminum'));
  g.add(dish);
  const rim = solid(new THREE.TorusGeometry(0.044, 0.0018, 8, 28), mat('steel'));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.003;
  g.add(rim);
  // 三根吊丝 + 顶环：盘面、砝码与吊环之间必须有"连接件"，
  // 否则上方细线直接落在盘沿上，看起来像断了一截。
  const WIRE_TOP = 0.03;
  const wireMat = mat('steel', { color: 0xd7dde3 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const p0 = new THREE.Vector3(Math.cos(a) * 0.034, 0.002, Math.sin(a) * 0.034);
    const p1 = new THREE.Vector3(0, WIRE_TOP, 0);
    const d = new THREE.Vector3().subVectors(p1, p0);
    const wire = solid(new THREE.CylinderGeometry(0.0006, 0.0006, 1, 6), wireMat);
    wire.position.copy(p0).addScaledVector(d, 0.5);
    wire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    wire.scale.set(1, d.length(), 1);
    g.add(wire);
  }
  const hanger = solid(new THREE.TorusGeometry(0.008, 0.0015, 8, 16), mat('steel'));
  hanger.position.y = WIRE_TOP;
  g.add(hanger);
  let y = 0.003;
  for (const m of masses) {
    const volume = m / 7800; // 钢 7.8 g/cm³
    const r = 0.016;
    const h = Math.max(0.003, volume / (Math.PI * r * r));
    const w = solid(new THREE.CylinderGeometry(r, r, h, 24), mat('steel', { roughness: 0.35 }));
    y += h / 2;
    w.position.y = y;
    y += h / 2 + 0.0004;
    g.add(w);
  }
  g.userData.spec = { name: '砝码盘', size: [0.09, WIRE_TOP, 0.09] } as PartSpec;
  g.userData.totalMass = masses.reduce((a, b) => a + b, 0);
  /** 顶环高度：外部细线要接到这里，接在盘沿上就会"断" */
  g.userData.hangerY = WIRE_TOP;
  return g;
}

/** 细线：两点之间拉直（每帧可更新） */
export function rope(radius = 0.0009): THREE.Mesh {
  const m = solid(new THREE.CylinderGeometry(radius, radius, 1, 6), mat('paper', { color: 0xe8e4d8 }));
  m.castShadow = false;
  m.userData.rope = true;
  return m;
}

const UP = new THREE.Vector3(0, 1, 0);

export function stretchRope(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 1e-5) return;
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  mesh.scale.set(1, len, 1);
}

/** 铁架台：铸铁底板 160×120 mm + φ12 mm 立杆 + 十字夹（L7 用） */
export function retortStand(height = 0.9): THREE.Group {
  const g = new THREE.Group();
  const base = solid(rb(0.16, 0.018, 0.12, 0.002), mat('plasticBlack'));
  base.position.y = 0.009;
  g.add(base);
  const rod = solid(new THREE.CylinderGeometry(0.006, 0.006, height, 14), mat('steel'));
  rod.position.set(-0.05, height / 2 + 0.018, 0);
  g.add(rod);
  // 十字夹
  const clamp = solid(rb(0.03, 0.022, 0.02, 0.002), mat('steel', { color: 0x9aa4ad }));
  clamp.position.set(-0.032, height * 0.62, 0);
  g.add(clamp);
  g.userData.spec = { name: '铁架台', size: [0.16, height, 0.12] } as PartSpec;
  g.userData.rodX = -0.05;
  return g;
}

/** 重锤（含遮光片）：φ30×60 mm，钢质，质量按体积反推 */
export function plumb(mass = 0.2, shadeWidth = 0.02): THREE.Group {
  const g = new THREE.Group();
  const r = 0.015;
  const vol = mass / 7800;
  const h = Math.max(0.02, vol / (Math.PI * r * r));
  const body = solid(new THREE.CylinderGeometry(r, r, h, 20), mat('steel', { roughness: 0.42 }));
  body.position.y = h / 2;
  g.add(body);
  const hook = solid(new THREE.TorusGeometry(0.005, 0.0012, 8, 12), mat('steel'));
  hook.position.y = h + 0.004;
  g.add(hook);
  // 遮光片（贴在锤体上沿，随重锤下落切开红外光束）
  const shade = solid(rb(shadeWidth, 0.016, 0.008, 0.0006), mat('paper', { color: 0x2a2f36 }));
  shade.position.set(0, h - 0.008, 0);
  shade.name = 'shade';
  g.add(shade);
  g.userData.spec = { name: '重锤', size: [r * 2, h, r * 2], mass } as PartSpec;
  g.userData.mass = mass;
  g.userData.shadeWidth = shadeWidth;
  g.userData.height = h;
  return g;
}

/** 电磁释放夹（通电吸住重锤，断电自由下落） */
export function releaseClamp(): THREE.Group {
  const g = new THREE.Group();
  const box = solid(rb(0.05, 0.03, 0.04, 0.003), mat('plasticBlack'));
  box.position.y = 0.015;
  g.add(box);
  const core = solid(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 14), mat('copper'));
  core.position.set(0, -0.004, 0);
  g.add(core);
  const led = solid(new THREE.SphereGeometry(0.003, 10, 8), mat('plasticRed', { emissive: 0x662222 }));
  led.position.set(0.016, 0.026, 0.018);
  g.add(led);
  g.userData.spec = { name: '电磁释放夹', size: [0.05, 0.045, 0.04] } as PartSpec;
  return g;
}
