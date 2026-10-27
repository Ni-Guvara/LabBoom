// L2 场景：铁架台 + 拉伸弹簧 + 砝码盘 + 片状砝码 + 钢米尺（1 单位 = 1 m，全部 1:1）
//
// 装配链（必须首尾相接，任何一环断开都是穿模/悬空）：
//   铁架台横杆末端水平吊环（内径 Ø14）→ 弹簧上钩环（内径 Ø6，环面竖直穿过吊环）
//   → 弹簧下钩环 → 砝码盘 Ø16 顶环 → 三根 Ø0.6 吊丝 → Ø64 铝盘
//   → 盘沿红色指针 → 米尺刻度面（让开 4.7 mm，不碰尺）
//
// 弹簧是「真螺旋」：22 圈、外径 Ø18、线径 Ø0.9，长度按 L0 + Δx 重算螺旋点数，
// 圈距随载荷变化而线径不变 —— 不能用 scale.y 拉伸（那样线径也会被拉粗）。
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';
import { makeArrow } from '@/engine/SceneHost';
import { mat, applyShadows } from '@/engine/materials';
import { tableTop } from '@/labs/_shared/instruments';
import { loadOrFallback, partOf } from '@/labs/_shared/models';
import { fitCamera } from '@/labs/_shared/framing';

export interface SpringState {
  hooks: number;
  k: number;
  massPerHook: number;
  g: number;
}

export function springExtension(s: SpringState): number {
  return (s.hooks * s.massPerHook * s.g) / s.k;
}

/** 弹簧自由长（上钩环中心 → 下钩环中心） */
const L0 = 0.12;
/**
 * 弹簧上钩环中心高度 = 横杆末端吊环中心（build_retort_stand.py 的 ARM_Y - 0.013 = 0.862）。
 *
 * 不能取 0.843：那是按「吊环下缘 0.8485 再让 5.5 mm」算的，钩环顶只到 0.8472，
 * 离吊环内孔下沿 0.855 还差 7.8 mm，整根弹簧就那样悬空挂在半空。
 * 钩环真正受力处就是吊环中心，让钩环穿进去才是真实装配。
 */
const SPRING_TOP_Y = 0.862;
/** 横杆末端 x（与 build_retort_stand.py 的 ARM_LEN 一致） */
const SPRING_X = 0.3;
/** 铁架台立柱中线 z（与 build_retort_stand.py 的 ROD_Z 一致） */
const ROD_Z = -0.04;
/** 砝码盘顶环中心相对盘底的高度（与 build_spring_set.py 一致；须高过 6 片砝码摞的 54 mm） */
const TRAY_RING_Y = 0.062;
/** 盘内底面上第一片砝码的落座高度 */
const TRAY_FLOOR_Y = 0.002;
/** 片状砝码厚度（叠放步进） */
const PLATE_STEP = 0.008;
/**
 * 取景框：从立柱（x≈0）到砝码盘外沿，竖直段框住「横杆吊环 → 米尺 → 满载荷托盘」。
 *
 * 不框整机 900 mm：那样弹簧只占画面 1/8，圈距和刻度全采不到样。
 * 但下沿必须落到 0.34（米尺 0.42 到 0 cm 的那截 + 托盘最低位）：
 * 原来的 0.46 正好切在米尺中段，满屏舞台下看着像"器材被截断"。
 * 底座仍在画面外——立柱贯穿画面上下，学生一眼就知道吊在铁架台上，滚轮拉远可看全貌。
 */
const FOCUS = new THREE.Box3(
  new THREE.Vector3(-0.06, 0.34, -0.085),
  new THREE.Vector3(0.37, 0.93, 0.02)
);
const COIL_R = 0.0084;
const WIRE_R = 0.0006;
const TURNS = 22;
const HOOK_R = 0.0036;

export function buildSpringScene(
  api: SceneApi,
  getState: () => SpringState,
  getView: () => 'macro' | 'micro'
): () => void {
  const { scene, camera, addAnchor, setAnchorText, onTick, setTarget } = api;

  const bench = tableTop(1.6, 1.2);
  scene.add(bench);

  // 整套器材一个 rig：力学模块不允许拖动，rig 只是个分组（不注册 draggable）
  const rig = new THREE.Group();
  rig.name = 'rig';
  scene.add(rig);

  // ---------- 弹簧（程序化真螺旋，长度随载荷重算） ----------
  const steelMat = mat('steel');
  const springGroup = new THREE.Group();
  springGroup.position.set(SPRING_X, SPRING_TOP_Y, ROD_Z);
  rig.add(springGroup);
  const hookTop = new THREE.Mesh(new THREE.TorusGeometry(HOOK_R, WIRE_R, 8, 24), steelMat);
  const hookBottom = new THREE.Mesh(new THREE.TorusGeometry(HOOK_R, WIRE_R, 8, 24), steelMat);
  hookBottom.position.y = -L0;
  hookTop.castShadow = hookBottom.castShadow = true;
  springGroup.add(hookTop, hookBottom);

  let coil: THREE.Mesh | null = null;
  let coilLen = -1;
  const rebuildCoil = (len: number) => {
    // 螺旋从 -0.004 铺到 -(len-0.004)，两端钩环正好接上，没有缺口
    const y0 = -0.004;
    const y1 = -(len - 0.004);
    const N = TURNS * 14;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const th = t * TURNS * Math.PI * 2;
      pts.push(new THREE.Vector3(COIL_R * Math.cos(th), y0 + (y1 - y0) * t, COIL_R * Math.sin(th)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, N, WIRE_R, 6, false);
    if (coil) {
      coil.geometry.dispose();
      coil.geometry = geo;
    } else {
      coil = new THREE.Mesh(geo, steelMat);
      coil.castShadow = true;
      springGroup.add(coil);
    }
    hookBottom.position.y = -len;
  };

  // ---------- 托盘 / 砝码 / 铁架台：用 Blender 模型，失败回退程序化 ----------
  const weightsGroup = new THREE.Group();
  rig.add(weightsGroup);
  let trayRoot: THREE.Object3D | null = null;
  let standRoot: THREE.Object3D | null = null;
  let plateTemplate: THREE.Object3D | null = null;
  let lastN = -1;
  let lastView = '';

  const rebuildWeights = (n: number) => {
    while (weightsGroup.children.length) weightsGroup.remove(weightsGroup.children[0]);
    if (!plateTemplate || n <= 0) return;
    for (let i = 0; i < n; i++) {
      const w = plateTemplate.clone(true);
      w.position.y = TRAY_FLOOR_Y + i * PLATE_STEP;
      weightsGroup.add(w);
    }
  };

  let springAnchor: ReturnType<typeof addAnchor> | null = null;
  let trayAnchor: ReturnType<typeof addAnchor> | null = null;

  void (async () => {
    const [stand, trayM, plateM] = await Promise.all([
      loadOrFallback('retort_stand', fallbackStand),
      loadOrFallback('weight_tray', fallbackTray),
      loadOrFallback('weight_plate', fallbackPlate),
    ]);
    rig.add(stand.root);
    standRoot = stand.root;
    trayRoot = trayM.root;
    rig.add(trayRoot);
    plateTemplate = plateM.root;
    lastN = -1; // 让下一帧按当前砝码数重建

    springAnchor = addAnchor(springGroup, '弹簧 k = 40 N/m', undefined, -0.03);
    trayAnchor = addAnchor(trayRoot, '砝码盘', undefined, 0.03);
    addAnchor(partOf(stand, 'rod') ?? stand.root, '铁架台 · 立杆 900 mm', undefined, 0.5);
    addAnchor(partOf(stand, 'ruler') ?? stand.root, '米尺 · 0~40 cm', undefined, 0.2);
    [stand.root, trayRoot].forEach(applyShadows);
    // 器材到位后重新取景：异步加载前包围盒里只有弹簧，会把镜头拉得太近。
    // 先等字体就绪再取景：WOFF 到货会改变右栏高度 → stage 宽高比跟着变 → fitCamera
    // 算出的距离也变，早一步取景就会留下一个明显偏远的画面（同一状态两次打开大小不一）。
    await document.fonts.ready;
    // 首帧 onTick 已经把 lastView 置成 macro，所以这里不能用 lastView === '' 判断；
    // 只要学生还没切到微观视图，就无条件用稳定后的宽高比重取景
    if (lastView !== 'micro') {
      setTarget(fitCamera(camera, FOCUS, { pitch: 12, yaw: 0.16, fill: 0.9, margin: 0.02 }));
    }
  })();

  // ---------- 微观视图：弹簧钢丝的晶格被拉长 ----------
  // 只画"一块钢丝"的局部晶格：3×7×3 体心式点阵 + 纵向键。
  // 随机散点看不出任何物理，必须让"原子间距随载荷变大、但每个键只伸长一点点"这个
  // 宏观-微观对应关系看得见，否则微观视图就是个装饰。
  const microGroup = new THREE.Group();
  microGroup.visible = false;
  rig.add(microGroup);

  const MICRO_CENTER = new THREE.Vector3(SPRING_X, 0.60, ROD_Z);
  const MICRO_A = 0.010; // 点阵常数 10 mm（示意值，真实是 1e-10 m 量级）
  const NX = 3;
  const NY = 7;
  const NZ = 3;
  const microMat = new THREE.MeshStandardMaterial({
    color: 0x5eead4,
    emissive: 0x2a6a5a,
    emissiveIntensity: 0.6,
  });
  const ballGeo = new THREE.SphereGeometry(0.0024, 12, 12);
  const ballMeshes: THREE.Mesh[] = [];
  for (let ix = 0; ix < NX; ix++)
    for (let iy = 0; iy < NY; iy++)
      for (let iz = 0; iz < NZ; iz++) {
        const m = new THREE.Mesh(ballGeo, microMat);
        m.userData = { ix, iy, iz };
        ballMeshes.push(m);
        microGroup.add(m);
      }

  // 纵向键：高 1 的细柱，靠 scale.y 拉到相邻两球的间距（纯示意，允许缩放）
  const bondGeo = new THREE.CylinderGeometry(0.0006, 0.0006, 1, 6);
  const bondMeshes: THREE.Mesh[] = [];
  for (let ix = 0; ix < NX; ix++)
    for (let iy = 0; iy < NY - 1; iy++)
      for (let iz = 0; iz < NZ; iz++) {
        const b = new THREE.Mesh(bondGeo, microMat);
        b.userData = { ix, iy, iz };
        bondMeshes.push(b);
        microGroup.add(b);
      }

  const layoutLattice = (strain: number) => {
    // 原子位移放大 4 倍才看得见：真应变 1% 时原子只挪 1e-12 m，屏幕上等于没动
    const gapY = MICRO_A * (1 + strain * 4);
    const y0 = MICRO_CENTER.y - ((NY - 1) * gapY) / 2;
    const x0 = MICRO_CENTER.x - ((NX - 1) * MICRO_A) / 2;
    const z0 = MICRO_CENTER.z - ((NZ - 1) * MICRO_A) / 2;
    for (const m of ballMeshes) {
      const { ix, iy, iz } = m.userData as { ix: number; iy: number; iz: number };
      m.position.set(x0 + ix * MICRO_A, y0 + iy * gapY, z0 + iz * MICRO_A);
    }
    for (const b of bondMeshes) {
      const { ix, iy, iz } = b.userData as { ix: number; iy: number; iz: number };
      b.position.set(x0 + ix * MICRO_A, y0 + (iy + 0.5) * gapY, z0 + iz * MICRO_A);
      b.scale.y = gapY * 0.66; // 两端给球留位，键不穿进球里
    }
  };
  layoutLattice(0);

  /** 微观取景：只框那块晶格，否则 70 mm 的晶体在 500 mm 视场里是一撮灰点 */
  const MICRO_BOX = new THREE.Box3(
    new THREE.Vector3(SPRING_X - 0.055, 0.47, ROD_Z - 0.045),
    new THREE.Vector3(SPRING_X + 0.055, 0.73, ROD_Z + 0.045)
  );

  let forceArrow: THREE.ArrowHelper | null = null;
  let gravityArrow: THREE.ArrowHelper | null = null;

  onTick(() => {
    const s = getState();
    const view = getView();
    const n = Math.round(s.hooks);

    const dx = Math.min(springExtension(s), 0.16);
    const len = L0 + dx;

    if (Math.abs(len - coilLen) > 1e-4) {
      rebuildCoil(len);
      coilLen = len;
    }
    if (n !== lastN) {
      rebuildWeights(n);
      lastN = n;
    }

    // 盘顶环中心 = 弹簧下钩环中心；盘底 = 顶环 - TRAY_RING_Y
    const trayTopY = SPRING_TOP_Y - len;
    const trayY = trayTopY - TRAY_RING_Y;
    trayRoot?.position.set(SPRING_X, trayY, ROD_Z);
    weightsGroup.position.set(SPRING_X, trayY, ROD_Z);

    const F = n * s.massPerHook * s.g; // N
    if (springAnchor) {
      setAnchorText(springAnchor, `弹簧 k = ${s.k} N/m · Δx = ${(dx * 1000).toFixed(1)} mm`);
    }
    if (trayAnchor) {
      setAnchorText(trayAnchor, `砝码盘 + ${n} 片砝码 · F = ${F.toFixed(2)} N`);
    }

    if (n > 0) {
      const aLen = Math.min(0.12, 0.03 + F * 0.012);
      if (forceArrow) { rig.remove(forceArrow); forceArrow.dispose(); }
      if (gravityArrow) { rig.remove(gravityArrow); gravityArrow.dispose(); }
      // 双箭头画在盘外沿右侧：从左（米尺侧）起会被盘沿和砝码挡住，
      // 从轴线起又会穿过弹簧——只有盘沿外侧那一小片是空的
      const ax = SPRING_X + 0.046;
      forceArrow = makeArrow(new THREE.Vector3(ax, trayY, ROD_Z), new THREE.Vector3(0, aLen, 0), 'force');
      gravityArrow = makeArrow(new THREE.Vector3(ax, trayY, ROD_Z), new THREE.Vector3(0, -aLen, 0), 'force');
      rig.add(forceArrow, gravityArrow);
    } else if (forceArrow) {
      rig.remove(forceArrow); forceArrow.dispose(); forceArrow = null;
      if (gravityArrow) { rig.remove(gravityArrow); gravityArrow.dispose(); gravityArrow = null; }
    }

    // 微观视图跟着载荷一起变：宏观每伸长 1%，晶格间距就大一点，
    // 但每个"键"的变化肉眼几乎看不出——这正是"宏观形变大、微观形变小"的落点
    const macro = view === 'macro';
    if (view !== lastView) {
      lastView = view;
      const box = macro ? FOCUS : MICRO_BOX;
      setTarget(fitCamera(camera, box, { pitch: 12, yaw: 0.16, fill: 0.9, margin: 0.02 }));
    }
    microGroup.visible = !macro;
    springGroup.visible = macro;
    weightsGroup.visible = macro;
    if (trayRoot) trayRoot.visible = macro;
    if (standRoot) standRoot.visible = macro;
    if (forceArrow) forceArrow.visible = macro;
    if (gravityArrow) gravityArrow.visible = macro;
    if (!macro) layoutLattice(dx / L0);
  });

  applyShadows(bench);

  // 竖向器材：俯角小一点才看得清弹簧圈间距与刻度
  setTarget(fitCamera(camera, FOCUS, { pitch: 12, yaw: 0.16, fill: 0.9, margin: 0.02 }));

  return () => {
    forceArrow?.dispose();
    gravityArrow?.dispose();
    coil?.geometry.dispose();
  };
}

// ---------------- 程序化回退（glb 缺失时仍可上课） ----------------

function fallbackStand(): THREE.Group {
  const g = new THREE.Group();
  const steel = mat('steel');
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.016, 0.13), mat('plasticBlack'));
  base.position.set(0, 0.008, -0.02);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.9, 20), steel);
  rod.position.set(0, 0.45, ROD_Z);
  rod.name = 'rod';
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.3, 16), steel);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.15, 0.875, ROD_Z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0085, 0.0015, 8, 20), steel);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(SPRING_X, 0.862, ROD_Z);
  const ruler = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.4, 0.0016), mat('paintWhite'));
  ruler.position.set(0.24, 0.665, ROD_Z);
  ruler.name = 'ruler';
  g.add(base, rod, arm, ring, ruler);
  return g;
}

function fallbackTray(): THREE.Group {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.002, 28), mat('aluminumMatte'));
  plate.position.y = 0.001;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0012, 8, 20), mat('steel'));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = TRAY_RING_Y;
  const ptr = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.0012, 0.004), mat('plasticRed'));
  ptr.position.set(-0.049, 0.008, 0.0055);
  g.add(plate, ring, ptr);
  return g;
}

function fallbackPlate(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.008, 28), mat('steel'));
  body.position.y = 0.004;
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.004, 14), mat('steel'));
  knob.position.y = 0.01;
  g.add(body, knob);
  return g;
}
