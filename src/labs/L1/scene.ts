// L1 场景：研究匀变速直线运动（气垫导轨 1.20 m + 滑行器 + 电磁打点计时器 0.02 s + 光电门）
// 垫片把一端抬高 h → 沿轨加速度 a = g·h/L，全部读数由 kinematics 一条轨迹派生
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';
import { mat } from '@/engine/materials';
import {
  airTrack, cart, tickerTimer, photogate, tableTop, TAPE_INTERVAL,
} from '@/labs/_shared/instruments';
import { fitCamera, boxOfSubject } from '@/labs/_shared/framing';
import {
  PHOTOGATE_TALL, GATE_HEAD_Z, attachGateReadout, gateAxisY,
} from '@/labs/_shared/photogate';
import { loadOrFallback, partOf, hideParts } from '@/labs/_shared/models';
import { simulate, sampleAt, gateReadings, type MotionModel, type Sample } from '@/engine/physics/kinematics';

export const G = 9.8;
export const RAIL_LEN = 1.2;
export const SURFACE_Y = 0.11;
export const START_U = -0.42; // 滑行器起点（导轨局部坐标）
export const TRAVEL = 0.84;
/**
 * 光电门默认停在导轨中段。
 * 注意 u 是「导轨坐标」：0 = 导轨左端、RAIL_LEN = 右端，中部就是 RAIL_LEN/2。
 * 场景里光电门挂在 scene 上（不跟导轨抬头），世界 x = u − U0。
 */
export const GATE_U = 0.6;
/** 光电门可调的行程：两端各留 0.15 m，正好覆盖滑行器 0.84 m 的整个行程 */
export const GATE_MIN_U = 0.18;
export const GATE_MAX_U = 1.02;
export const CART_MASS = 0.155;
/** 挡光片中心相对滑行器中心（build_air_track.py 里 flag 立在 x = +20 mm） */
export const FLAG_CENTER = 0.020;
/** 导轨内部把 u∈[-0.6,0.6] 映射到以右端为原点的组坐标 */
const U0 = RAIL_LEN / 2;
/** 滑行器半长（SLED_LEN 155 mm） */
const SLED_HALF = 0.0775;

/** 挡光片前沿相对滑行器中心 */
export function flagLead(flagWidth: number): number {
  return FLAG_CENTER + flagWidth / 2;
}

/**
 * 光电门读数用的「前沿位移」：挡光片**前沿**到达光轴时滑行器走过的距离。
 * 原来直接拿光轴位置减起点，等于假设挡光片前沿就在滑行器中心 —— 差 30 mm，
 * 测速点整体往后挪了一截。
 */
export function gateOffset(flagWidth: number, gateU = GATE_U): number {
  // gateU 是导轨坐标（0 = 左端），START_U 是世界 x；先减 U0 统一到世界坐标再作差。
  // 少了这一步，光轴会被算到滑行器起点左侧 0.6 m 之外，读数永远是 0。
  return gateU - U0 - START_U - flagLead(flagWidth);
}

export interface L1Params {
  h: number; // 垫片高度 m
  flagWidth: number;
}

export interface L1State extends L1Params {
  stage: 'setup' | 'run' | 'analyze';
  speed: number;
  paused: boolean;
  stepToken: number;
  runId: number;
  samples: Sample[];
  /** 光电门在导轨上的位置（可拖动，读数随之改变） */
  gateU: number;
  onGateChange: (u: number) => void;
  onProgress: (t: number) => void;
  onFinish: () => void;
}

/** a = g·sinθ = g·h/L（气垫近似无摩擦） */
export function theoryAccel(p: L1Params): number {
  return (G * p.h) / RAIL_LEN;
}

export function labModel(p: L1Params): MotionModel {
  return { accel: () => theoryAccel(p) };
}

export function buildSamples(p: L1Params): Sample[] {
  return simulate(labModel(p), { tEnd: 4, dt: 0.0005, stop: (s) => s.x >= TRAVEL });
}

// ---------------------------------------------------------------- 纸带尺寸（模型坐标）
const TAPE_W = 0.017;          // 纸带宽 17 mm
const TAPE_Z = -0.006;         // 纸带在机身内的进深（模型 Y_TAPE = 6 mm）
const TAPE_Y_IN_TIMER = 0.0195; // 计时器内纸带平面高度（模型 Z_TAPE）
const HOLE_FRONT_X = 0.014;    // 前门形限位孔
const NEEDLE_X = 0.033;        // 振针针尖
const BENCH_TAPE_Y = 0.0013;   // 纸带铺在台面上的高度
const TAPE_SEG = 72;           // 纸带网格分段数

export async function buildL1Scene(api: SceneApi, getState: () => L1State): Promise<() => void> {
  const { scene, camera, addAnchor, setAnchorText, onTick, draggable, setTarget } = api;

  // 四件器材并行加载：glb 是 Blender 建的写实模型；哪件还没建模就回退到程序化模型
  const [railModel, sledModel, timerModel, gateModel] = await Promise.all([
    loadOrFallback('air_track', () => airTrack(RAIL_LEN)),
    loadOrFallback('sled', () => cart({ mass: CART_MASS, flagWidth: 0.02 })),
    loadOrFallback('ticker_timer', () => tickerTimer()),
    loadOrFallback('photogate', () => photogate()),
  ]);

  // ---------- 台面 ----------
  const table = tableTop(2.4, 2.4);
  table.position.set(0, 0, 0.15);
  scene.add(table);

  // ---------- 可绕右端抬升的导轨组 ----------
  const pivot = new THREE.Group();
  pivot.position.set(U0, 0, 0);
  scene.add(pivot);

  const rail = railModel.root;
  rail.position.x = -U0; // 导轨几何以自身中心为原点，右端正好落在支点上
  pivot.add(rail);
  addAnchor(rail, '气垫导轨 1.20 m', undefined, 0.145);

  // 垫片（垫在左脚下方，高度随 h 变化）
  const shim = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1, 0.08), mat('wood', { color: 0x8a6a44 }));
  shim.position.set(-0.3, 0.01, 0);
  shim.scale.y = 0.02;
  scene.add(shim);
  const shimAnchor = addAnchor(shim, '垫片 h = 30 mm');

  // ---------- 滑行器 + 挡光片 ----------
  // 模型原点在 V 尖（= 与导轨的接触点），所以 position.y = SURFACE_Y 就是「坐在尖顶上」
  const sled = sledModel.root;
  sled.name = 'sled';
  sled.position.set(START_U - U0, SURFACE_Y, 0);
  pivot.add(sled);
  const sledAnchor = addAnchor(sled, '滑行器 155 g · 挡光片 20 mm', undefined, 0.125);

  // 纸带在车尾的压片：纸带要"拴"在滑行器上，不能悬在半空
  const clip = new THREE.Group();
  const clipBar = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.011, 0.026), mat('steel'));
  clipBar.castShadow = true;
  const clipScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.013, 10), mat('brass'));
  clipScrew.rotation.x = Math.PI / 2;
  clipScrew.position.set(0.004, 0, 0);
  clip.add(clipBar, clipScrew);
  clip.position.set(-SLED_HALF + 0.001, TAPE_Y_IN_TIMER, 0);
  sled.add(clip);

  // ---------- 打点计时器（左端，纸带由此拉出） ----------
  const timer = timerModel.root;
  timer.name = 'ticker';
  let timerU = -0.585; // 再往左就压到起点位置的滑行器尾钩了
  hideParts(timerModel, 'tape'); // 模型自带的纸带是定长的一段，会横穿滑行器
  // 模型自带的两根电源线是笔直的短段，末端悬在台面上方、谁也不接，
  // 近看像插进桌面的红绿棍子。没有电源箱可接，索性不显示（接线柱仍在）。
  hideParts(timerModel, 'wire_');
  const bracket = new THREE.Group();
  // C 形夹板：横板托住机身 + 一条窄立筋卡在导轨端面。立筋别做宽 —— 100 mm 宽的
  // 板在侧视角下就是一块大黑板，器材看着像挂在墙上。
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.007, 0.092), mat('aluminumMatte'));
  plate.position.set(0, -0.0035, 0);
  plate.castShadow = plate.receiveShadow = true;
  const web = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.104, 0.058), mat('aluminumMatte'));
  web.position.set(-0.068, -0.056, 0);
  web.castShadow = true;
  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.012, 14), mat('plasticBlack'));
  screw.rotation.z = Math.PI / 2;
  screw.position.set(-0.074, -0.062, 0.016);
  bracket.add(plate, web, screw);
  timer.add(bracket);
  timer.position.set(timerU - U0, SURFACE_Y, 0);
  pivot.add(timer);
  // 计时器能沿导轨挪（真机是夹在端头、可以松开挪位）：只放开 x 一个自由度
  draggable(timer, {
    axis: 'x',
    min: -0.66 - U0,
    max: -0.55 - U0,
    canDrag: () => getState().stage === 'setup',
    onMove: (pos) => { timerU = pos.x + U0; },
  });
  addAnchor(timer, '电磁打点计时器 0.02 s', undefined, 0.085);

  // ---------- 纸带：一条连续的带子 ----------
  // 真实走法：一端用压片压紧在滑行器尾端 → 穿过后门形限位孔 → 从复写纸盘下方经过
  // （振针在 33 mm 处打点）→ 出前门形限位孔 → 从计时器左侧拖出、垂落到台面被拉走。
  //
  // 原来是两条互不相干的纸带：一条桥接盒子在导轨上方，另一条"展开纸带"平铺在台面，
  // 而点又打在离纸带 9 cm 的桌面上 —— 于是看上去「打在桌上、点距还均匀」。
  const tapeGeo = new THREE.BufferGeometry();
  const tPos = new Float32Array((TAPE_SEG + 1) * 2 * 3);
  const tNrm = new Float32Array((TAPE_SEG + 1) * 2 * 3);
  for (let i = 0; i <= TAPE_SEG; i++) {
    tNrm[i * 6 + 1] = 1;
    tNrm[i * 6 + 4] = 1;
  }
  const tIdx: number[] = [];
  for (let i = 0; i < TAPE_SEG; i++) {
    const a = i * 2;
    // 绕序必须让法线朝上：原来写成 (a, a+2, a+1)，法线算出来朝 -y，
    // 纸带整条变成"背光面"，白纸渲染成一条黑带子。
    tIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  // 没有 UV 的几何体吃不到纸纤维贴图，白纸会渲成一块死平的色块
  const tUv = new Float32Array((TAPE_SEG + 1) * 2 * 2);
  for (let i = 0; i <= TAPE_SEG; i++) {
    const u = (i / TAPE_SEG) * 24;
    tUv[i * 4] = u; tUv[i * 4 + 1] = 0;
    tUv[i * 4 + 2] = u; tUv[i * 4 + 3] = 1;
  }
  tapeGeo.setIndex(tIdx);
  tapeGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
  tapeGeo.setAttribute('normal', new THREE.BufferAttribute(tNrm, 3));
  tapeGeo.setAttribute('uv', new THREE.BufferAttribute(tUv, 2));

  // 纸带要比导轨的铝面更白，才不会在 26° 俯角下和导轨顶面糊成一条灰带
  const tapeMat = mat('paper', { color: 0xf4eee0 }).clone();
  tapeMat.side = THREE.DoubleSide;
  const tapeMesh = new THREE.Mesh(tapeGeo, tapeMat);
  tapeMesh.name = 'tape-ribbon';
  // 不参与取景：台面上那段垂落纸带会把包围盒往左拽 0.2 m，整条导轨就被推远了
  tapeMesh.userData.noFrame = true;
  tapeMesh.castShadow = true;
  tapeMesh.frustumCulled = false; // 顶点逐帧重算，包围球不作数
  scene.add(tapeMesh);

  // 两条边线：1:1 尺度下 17 mm 宽的纸带在整条 1.2 m 导轨里只有几像素，
  // 不加边线就会和导轨的铝高光糊成一片，学生根本看不到纸带在哪。
  const edgePos = new Float32Array((TAPE_SEG + 1) * 3 * 2);
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePos, 3));
  const edge = new THREE.LineSegments(
    edgeGeo,
    new THREE.LineBasicMaterial({ color: 0x6b6152, transparent: true, opacity: 0.55 }),
  );
  edge.frustumCulled = false;
  edge.userData.noFrame = true;
  scene.add(edge);

  addAnchor(tapeMesh, '纸带（穿过计时器、末端压在滑行器上）', undefined, -0.05);

  // 纸带路径采样点（世界坐标；pivot 只绕 z 轴转，进深恒定，于是用二维足够）
  const pathPts: THREE.Vector2[] = Array.from({ length: TAPE_SEG + 1 }, () => new THREE.Vector2());
  // 本帧纸带的关键位置，供打点取样
  const frame = { needleX: 0, needleY: 0, frontX: 0, frontY: 0, tailX: 0, tailY: 0 };

  const buildTape = (x: number) => {
    const rz = pivot.rotation.z;
    const cs = Math.cos(rz);
    const sn = Math.sin(rz);
    // pivot 局部 (lx, ly) → 世界 (x, y)
    const wx = (lx: number, ly: number) => U0 + lx * cs - ly * sn;
    const wy = (lx: number, ly: number) => lx * sn + ly * cs;

    const tl = timerU - U0; // 计时器中心（pivot 局部）
    const tapeY = SURFACE_Y + TAPE_Y_IN_TIMER;
    frame.needleX = wx(tl + NEEDLE_X, tapeY);
    frame.needleY = wy(tl + NEEDLE_X, tapeY);
    frame.frontX = wx(tl + HOLE_FRONT_X, tapeY);
    frame.frontY = wy(tl + HOLE_FRONT_X, tapeY);
    frame.tailX = wx(sled.position.x - SLED_HALF, tapeY);
    frame.tailY = wy(sled.position.x - SLED_HALF, tapeY);

    // 垂落段：从孔口水平伸出后向下弯，落到台面上再向左侧铺开
    const cx = frame.frontX - 0.058;
    const dy = Math.max(0.02, frame.frontY - BENCH_TAPE_Y);
    // 拖出段随行程缩短：纸带被小车一段段拉走，尾巴越来越短
    const tailLen = Math.max(0.02, 0.18 - x * 0.20);
    const freeX = cx - tailLen;

    let o = 0;
    const N1 = 10; // 台面平铺
    const N2 = 24; // 垂落弯
    const N3 = TAPE_SEG - N1 - N2; // 孔内 + 到车尾
    for (let i = 0; i <= N1; i++) {
      pathPts[o++].set(freeX + (cx - freeX) * (i / N1), BENCH_TAPE_Y);
    }
    const bez = new THREE.CubicBezierCurve(
      new THREE.Vector2(cx, BENCH_TAPE_Y),
      new THREE.Vector2(cx, BENCH_TAPE_Y + dy * 0.62),
      new THREE.Vector2(frame.frontX - 0.05, frame.frontY),
      new THREE.Vector2(frame.frontX, frame.frontY),
    );
    for (let i = 1; i <= N2; i++) {
      const p = bez.getPoint(i / N2);
      pathPts[o++].set(p.x, p.y);
    }
    for (let i = 1; i <= N3; i++) {
      const k = i / N3;
      pathPts[o++].set(
        frame.frontX + (frame.tailX - frame.frontX) * k,
        frame.frontY + (frame.tailY - frame.frontY) * k,
      );
    }

    for (let i = 0; i <= TAPE_SEG; i++) {
      const p = pathPts[i];
      const b = i * 6;
      tPos[b] = p.x; tPos[b + 1] = p.y; tPos[b + 2] = TAPE_Z - TAPE_W / 2;
      tPos[b + 3] = p.x; tPos[b + 4] = p.y; tPos[b + 5] = TAPE_Z + TAPE_W / 2;
    }
    tapeGeo.attributes.position.needsUpdate = true;
    tapeGeo.computeBoundingSphere();
    for (let i = 0; i <= TAPE_SEG; i++) {
      const p = pathPts[i];
      const b = i * 6;
      edgePos[b] = p.x; edgePos[b + 1] = p.y + 0.0004; edgePos[b + 2] = TAPE_Z - TAPE_W / 2;
      edgePos[b + 3] = p.x; edgePos[b + 4] = p.y + 0.0004; edgePos[b + 5] = TAPE_Z + TAPE_W / 2;
    }
    edgeGeo.attributes.position.needsUpdate = true;
    edgeGeo.computeBoundingSphere();
  };

  // ---------- 光电门（导轨中段，测挡光时间） ----------
  // 真机：整机立在台面上，方管横臂横跨导轨，U 形叉口从两侧夹住导轨
  // （叉口净宽 115 mm > 导轨 90 mm），光轴 193 mm 正好落在挡光片中心。
  // 底座在导轨后侧 z=-0.085，门头中心在模型局部 z=+0.085 → 叉口正落在导轨中线 z=0。
  let gateU = getState().gateU ?? GATE_U;
  const gate = gateModel.root;
  gate.name = 'gate';
  gate.position.set(gateU - U0, 0, -0.085);
  // 注意：光电门是**立在台面上**的独立器材，不属于会抬头的导轨组，
  // 所以挂在 scene 上而不是 pivot 上，垫片抬高时它不会跟着倾斜。
  scene.add(gate);
  const gateAnchor = addAnchor(gate, '光电门 v = d/Δt');
  // 光电门沿导轨挪位：只放开 x 一个自由度，范围与右侧滑杆一致。
  // 松开手后 onGateChange 把新位置回写到面板参数，读数（挡光时刻）随之重解。
  api.enableDrag();
  draggable(gate, {
    axis: 'x',
    min: GATE_MIN_U - U0,
    max: GATE_MAX_U - U0,
    canDrag: () => getState().stage === 'setup',
    onMove: (pos) => { getState().onGateChange(pos.x + U0); },
  });
  // 读数贴片与光轴高度都来自共用规格（src/labs/_shared/photogate.ts）：
  // glb 不烘文字，运行时贴一块动态数显；程序化回退版自带贴片，helper 内部会判重。
  const gateReadout = attachGateReadout(gate, PHOTOGATE_TALL);
  const GATE_AXIS_Y = gateAxisY(PHOTOGATE_TALL);

  // 红外光束：两臂之间横穿光口。挡光片进来才熄灭，学生一眼能看出「什么时候在测」
  const GATE_GAP = PHOTOGATE_TALL.gap; // 叉口净宽（导轨 90 mm 两侧各留 12.5 mm）
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xff4033, transparent: true, opacity: 0.55, depthWrite: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, GATE_GAP, 6), beamMat);
  beam.rotation.x = Math.PI / 2;
  beam.position.set(0.004, GATE_AXIS_Y, GATE_HEAD_Z);
  gate.add(beam);

  // ---------- 纸带上的点迹 ----------
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x14181d });
  const countMat = new THREE.MeshBasicMaterial({ color: 0x1d3557 });
  const dotGeo = new THREE.CircleGeometry(0.0016, 8);   // 真实打点 φ≈1 mm，屏幕上要看得见需放大到 3.2 mm
  const countGeo = new THREE.CircleGeometry(0.0040, 12); // 每 5 个（0.1 s）标一个计数点
  const dots: { mesh: THREE.Mesh; x0: number }[] = [];
  const clearDots = () => {
    for (const d of dots) scene.remove(d.mesh);
    dots.length = 0;
  };

  let simT = 0;
  let lastRun = -1;
  let lastStep = 0;
  let finished = false;
  let printed = 0;

  // 挡光片独立材质，挡光瞬间点亮（不污染共享材质）
  const flagPart = partOf(sledModel, 'flag') as THREE.Mesh | undefined;
  let flagMesh: THREE.Mesh | null = null;
  const bindFlag = () => {
    if (!flagPart) return;
    flagPart.material = (flagPart.material as THREE.MeshStandardMaterial).clone();
    flagMesh = flagPart;
  };

  // 光电门读数：由同一条轨迹解出「前沿进光口 → 后沿出光口」
  let gateIn = Infinity;
  let gateOut = Infinity;
  let gateV = 0;
  let gateDt = 0;
  function solveGate() {
    const st = getState();
    const x = gateOffset(st.flagWidth, gateU);
    const rd = gateReadings(st.samples, [{ id: 'G1', x, flagWidth: st.flagWidth }])[0];
    gateIn = rd?.tIn ?? Infinity;
    gateOut = rd?.tOut ?? Infinity;
    gateV = rd?.v ?? 0;
    gateDt = rd?.blockTime ?? 0;
  }

  /**
   * 台面在某处导轨坐标下的 pivot 局部 y。
   * pivot 绕右端抬起后，挂在 pivot 下的器材会跟着整体升高：计时器的 C 形支架、
   * 光电门的立柱本来是「站在台面上」的，不补偿就会悬空 1~3 cm。
   */
  const benchYAt = (lx: number) => -lx * Math.tan(pivot.rotation.z);

  let lastH = -1;
  let lastFlag = -1;

  const resetMotion = () => {
    simT = 0;
    finished = false;
    printed = 0;
    clearDots();
  };

  const rebuild = () => {
    const st = getState();
    lastH = st.h;
    lastFlag = st.flagWidth;
    gateU = st.gateU ?? gateU;

    // 轨枕绕右端（支点）抬起：左脚在支点左侧 0.9 m，抬高量 = 0.9·sinθ ≈ 0.75 h
    const angle = Math.asin(Math.min(0.2, st.h / RAIL_LEN));
    pivot.rotation.z = -angle;
    const footRise = Math.max(0.004, 0.9 * Math.sin(angle));
    shim.scale.y = footRise;
    shim.position.y = footRise / 2;

    // 挡光片宽度直接缩放挡光片本体（重建整车会丢掉已绑定的材质与标注）
    if (flagPart) flagPart.scale.x = st.flagWidth / 0.02;

    solveGate();

    setAnchorText(shimAnchor, `垫片 h = ${(st.h * 1000).toFixed(0)} mm`);
    setAnchorText(sledAnchor, `滑行器 155 g · 挡光片 ${(st.flagWidth * 1000).toFixed(0)} mm`);
  };

  onTick((dt) => {
    const st = getState();
    if (st.runId !== lastRun) {
      lastRun = st.runId;
      lastStep = st.stepToken;
      resetMotion();
      rebuild();
    } else if (st.h !== lastH || st.flagWidth !== lastFlag) {
      // 布置参数一改就立刻重算倾角/垫片并归零：否则旧 simT 会套到新轨迹上，
      // 表现为「调垫片高度，小车反而跳了位置」
      rebuild();
      resetMotion();
    } else if (Math.abs((st.gateU ?? gateU) - gateU) > 1e-5) {
      // 光电门被滑块挪了位：只重解挡光时刻，不动已经跑出来的轨迹
      gateU = st.gateU;
      solveGate();
    }
    const end = st.samples.length ? st.samples[st.samples.length - 1].t : 0;
    if (st.stage === 'run' && !st.paused) {
      simT = Math.min(end, simT + dt * st.speed);
      st.onProgress(simT);
    }
    if (st.stepToken !== lastStep) {
      lastStep = st.stepToken;
      simT = Math.min(end, simT + TAPE_INTERVAL);
      st.onProgress(simT);
    }
    if (st.stage === 'run' && simT >= end && end > 0 && !finished) {
      finished = true;
      st.onFinish();
    }

    // 滑行器：位移直接取自求解器轨迹
    const cur = sampleAt(st.samples, simT);
    sled.position.set(START_U + cur.x - U0, SURFACE_Y, 0);
    gate.position.x = gateU - U0;
    timer.position.x = timerU - U0;
    // 光电门立在台面上、不属于导轨组，底座高度恒为 0，不随垫片变化
    gate.position.y = 0;
    web.position.y = benchYAt(timerU - U0) - SURFACE_Y + 0.052;
    buildTape(cur.x);

    // 打点：每 0.02 s 一针。点打下去之后就固定在纸带的「材料点」上，
    // 随纸带一起被拉向滑行器 —— 所以点的世界位置 = 针口 + 该点至今的位移。
    while (printed * TAPE_INTERVAL <= simT + 1e-9) {
      if (dots.length < 240) {
        const ti = printed * TAPE_INTERVAL;
        const count = printed % 5 === 0;
        const m = new THREE.Mesh(count ? countGeo : dotGeo, count ? countMat : dotMat);
        m.name = count ? 'tape-count' : 'tape-dot';
        m.rotation.x = -Math.PI / 2;
        scene.add(m);
        dots.push({ mesh: m, x0: sampleAt(st.samples, ti).x });
      }
      printed++;
    }
    const span = frame.tailX - frame.frontX;
    for (const d of dots) {
      const wx = frame.needleX + (cur.x - d.x0);
      // 针口到车尾是直线，按 x 线性插值高度即可贴合纸带
      const k = span > 1e-6 ? (wx - frame.frontX) / span : 0;
      d.mesh.position.set(wx, frame.frontY + (frame.tailY - frame.frontY) * k + 0.0008, TAPE_Z);
    }

    // ---------- 光电门：只在挡光片穿过光口的那一段计时 ----------
    const blocking = simT >= gateIn && simT < gateOut;
    if (Number.isFinite(gateIn)) {
      if (simT < gateIn) {
        gateReadout?.('0.0');
        setAnchorText(gateAnchor, `光电门 · 待机 0.0（挡光片未进入 · d = ${(st.flagWidth * 1000).toFixed(0)} mm）`);
      } else if (blocking) {
        gateReadout?.(((simT - gateIn) * 1000).toFixed(0));
        setAnchorText(gateAnchor, `光电门 · 计时中 Δt = ${((simT - gateIn) * 1000).toFixed(1)} ms`);
      } else {
        // 挡光结束：数显定格在挡光时间 Δt（这才是光电门真正测的量），
        // 换算出来的速度写在悬停标注里 —— 别把 v 直接当读数，学生就看不出原理了。
        gateReadout?.((gateDt * 1000).toFixed(1));
        setAnchorText(gateAnchor, `光电门 Δt = ${(gateDt * 1000).toFixed(2)} ms → v = d/Δt = ${(st.flagWidth * 1000).toFixed(0)} mm / ${(gateDt * 1000).toFixed(2)} ms = ${gateV.toFixed(3)} m/s`);
      }
    } else {
      gateReadout?.('----');
      setAnchorText(gateAnchor, '光电门 · 无读数（挡光片不经过光口）');
    }
    beamMat.opacity = blocking ? 0.08 : 0.55;
    if (flagMesh) {
      (flagMesh.material as THREE.MeshStandardMaterial).emissive.setHex(blocking ? 0x551111 : 0x000000);
    }
  });

  // 导轨是 1.2 m 长条，靠俯角/占比两个参数定构图：俯角小才能看清导轨侧面的金属高光
  // 俯角 16° 太平：三角型材被压成一条平板、滑行器的 V 槽完全看不见。
  // 26° 是「看得清截面 + 不失长条器材透视感」的折中。
  //
  // 封面构图（?cover=1，scripts/capture-covers.mjs）：卡片 327×149 约 2.2:1，
  // 只取画布中间一条横带。按整幅画幅留白时，横带上方会剩一大片空背景、
  // 导轨压在横带下沿。于是封面模式抬高俯角（多露台面、少露黑背景）、
  // 填满度拉满，再把观察中心下压，让导轨落到横带正中。
  const forCover = new URLSearchParams(window.location.search).has('cover');
  const target = fitCamera(camera, boxOfSubject(scene), {
    pitch: forCover ? 33 : 26,
    yaw: forCover ? 0.14 : 0.06,
    fill: forCover ? 0.98 : 0.94,
    margin: forCover ? 0.005 : 0.02,
  });
  if (forCover) target.y -= 0.045;
  setTarget(target);

  bindFlag();
  rebuild();
  clearDots();
  return () => {
    clearDots();
    tapeGeo.dispose();
    tapeMat.dispose();
    edgeGeo.dispose();
  };
}
