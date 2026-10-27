// L3 场景：探究两个互成角度的力的合成规律（等效替代法）
// 方木板平放，白纸用图钉压住；橡皮条一端钉在纸上，另一端是小圆环结点，
// 结点上系两根绳套，两只测力计互成角度拉开；第三只沿合力方向把结点拉到同一点。
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { SceneApi } from '@/engine/SceneHost';
import { mat } from '@/engine/materials';
import { tableTop } from '@/labs/_shared/instruments';
import { fitCamera } from '@/labs/_shared/framing';
import { loadOrFallback } from '@/labs/_shared/models';

export interface L3Params {
  f1: number;
  f2: number;
  deg: number;
}

export interface L3State extends L3Params {
  stage: 'setup' | 'run' | 'analyze';
  /** 两只分力表各自的方向角（度，绕 +Y，正角偏向 +Z）。对称摆放时 a1 = θ/2、a2 = −θ/2 */
  a1: number;
  a2: number;
  progress: number;
  runId: number;
  onProgress: (t: number) => void;
  onFinish: () => void;
  /** 拖动第 i 只表时回写它的方向角（度） */
  onScaleDrag: (i: 0 | 1, deg: number) => void;
}

/** 理论合力（平行四边形定则） */
export function resultant(p: L3Params): number {
  const t = (p.deg * Math.PI) / 180;
  return Math.sqrt(p.f1 * p.f1 + p.f2 * p.f2 + 2 * p.f1 * p.f2 * Math.cos(t));
}

/** 单只测力计直接测合力（读数系统差 −0.8%，按分度值 0.2 N 取整） */
export function measured(p: L3Params): number {
  const raw = resultant(p) * (1 - 0.008);
  return Math.round(raw * 5) / 5;
}

// ---------- 图板（与 build_force_board.py 一致） ----------
const PAPER_Y = 0.018; // 纸面
const A_X = -0.14; // 橡皮条固定钉
const RUB_L0 = 0.12; // 橡皮条自由长 120 mm
const RUB_K = 200; // 橡皮条劲度 200 N/m（6×1.6 mm 教学橡皮条实测区间）
// 4 mm 宽的条在整幅机位下只有 2 px，和纸面同一色调时等于没画，所以做到 6 mm 并压深颜色
const RUB_W = 0.006;
const RUB_T = 0.0016;

// ---------- 测力计（与 build_force_board.py 一致） ----------
const SCALE_Y = PAPER_Y + 0.0075; // 外壳半高 7.5 mm，坐在纸面上
const FACE_ZERO_X = 0.06; // 0 N 刻线在外壳局部坐标的 x
const FACE_SPAN = 0.12; // 0 → 10 N
// 量程 0~10 N、分度值 0.2 N：两只 5 N 的力在 30° 夹角下合成 9.66 N，
// 用 0~5 N 的表就会顶出刻度——教学中这类"大量程"表本来就是 0~10 N
const FACE_MAX = 10;
const HOOK_DX = -0.094; // 挂钩环中心（外壳局部 x）

/**
 * 刻度板贴图：0 在提环端、10 N 在挂钩端，0.5 N 一格，每 1 N 标数字。
 *
 * 分辨率要按"屏幕上多少像素"倒推：0.132 m 的刻度板在整幅机位下约 190 px，
 * 1024 px 的贴图被缩到 1/5.4，3 px 宽的刻线只剩 0.55 px，mipmap 一平均就糊成灰雾。
 * 所以线宽加到 6 px（≈1.1 屏幕像素），格距从 0.2 N 放宽到 0.5 N（≈9 屏幕像素）。
 */
function scaleFaceTexture(): { tex: THREE.CanvasTexture } {
  const W = 1024;
  // 1024/128 = 8，刻度板几何比例 0.132/0.014 ≈ 9.4：数字在纵向被压 15%，
  // 换来 60 px 的字号（整幅机位下约 11 屏幕像素）—— 挤一点比读不出来强
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fbfaf6';
  g.fillRect(0, 0, W, H);
  // 刻度板宽 132 mm：0 N 在板内 +60 mm、10 N 在 −60 mm，换算成 canvas 像素后正好对齐指针行程
  const x0 = 46;
  const x1 = 977;
  const pxPerN = (x1 - x0) / FACE_MAX;
  const step = 0.5;
  const steps = Math.round(FACE_MAX / step);
  for (let i = 0; i <= steps; i++) {
    const n = i * step;
    const x = x1 - n * pxPerN; // 0 在右（提环侧），10 在左（挂钩侧）
    const whole = Math.abs(n - Math.round(n)) < 1e-6;
    g.strokeStyle = whole ? '#141920' : '#39424d';
    g.lineWidth = whole ? 7 : 4;
    g.beginPath();
    g.moveTo(x, 4);
    g.lineTo(x, 4 + (whole ? 38 : 24));
    g.stroke();
    // 只标 0 / 5 / 10：10 N 量程标满 11 个数，数字只能缩到 40 px，
    // 缩到屏幕上就是一片灰噪点；三个大数够定刻度，精确值看读数牌
    if (whole && Math.round(n) % 5 === 0) {
      g.fillStyle = '#141920';
      g.font = '700 60px ui-monospace, monospace';
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText(String(Math.round(n)), x, 46);
    }
  }
  // 板框：没有这道边框，白面板和白壳糊成一条白带，看不出刻度板在哪
  g.strokeStyle = '#20262e';
  g.lineWidth = 3;
  g.strokeRect(2, 2, W - 4, H - 4);
  g.fillStyle = '#39424d';
  g.font = '600 24px ui-monospace, monospace';
  g.textAlign = 'right';
  g.textBaseline = 'bottom';
  g.fillText('N', W - 8, H - 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex };
}

/** 没有 glb 时的兜底：白壳 + 顶面刻度，保证实验照常可做 */
function fallbackScale(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.015, 0.024), mat('paintWhite'));
  body.castShadow = true;
  g.add(body);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.132, 0.0016, 0.014), mat('paintWhite'));
  plate.position.y = 0.0083;
  g.add(plate);
  const ptr = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.0014, 0.0105), mat('plasticRed'));
  ptr.name = 'pointer';
  ptr.position.set(FACE_ZERO_X, 0.0094, 0);
  g.add(ptr);
  return g;
}

interface Scale {
  root: THREE.Group;
  setReading: (n: number) => void;
}

interface Tag {
  node: CSS2DObject;
  set: (n: number) => void;
}

/**
 * 读数牌：整幅机位下 132 mm 的刻度板只投影约 190 px，0.5 N 一格 9 px，
 * 而真实实验里学生是把表凑到眼前读的。这里用 CSS2D 标签（屏幕字号恒定 12 px），
 * 不管相机拉到哪里都读得清，同时和右侧数据表里的数字互相对照。
 * 3D sprite 试过：牌面宽度一旦跟着取景缩放，字就掉到 6 px，读不出来。
 */
function makeTag(): Tag {
  const el = document.createElement('div');
  el.style.cssText =
    'padding:1px 7px;border-radius:7px;background:rgba(11,18,32,0.84);' +
    'border:1px solid rgba(120,190,255,0.6);color:#eaf2ff;' +
    'font:600 12px/1.6 ui-monospace,SFMono-Regular,monospace;white-space:nowrap;' +
    'pointer-events:none;letter-spacing:0.02em;';
  const node = new CSS2DObject(el);
  let last = Number.NaN;
  return {
    node,
    set: (n: number) => {
      const v = Math.round(n * 10) / 10;
      if (v === last) return;
      last = v;
      el.textContent = `${v.toFixed(1)} N`;
    },
  };
}

/**
 * 把一只 glb 测力计装成可读数的仪表：
 * 刻度板贴图盖在外壳顶面，红色游标按 12 mm/N 滑动。
 * 指针必须能在克隆件里各自找到——三只表共用一个 glb，clone 后 userData 是复制的，
 * 但位置是独立的，所以每只表分别改自己的 pointer。
 */
function installScale(root: THREE.Group, faceTex: THREE.Texture): Scale {
  const w = 0.132;
  // 刻度窗面在 9.1 mm（0.0083 + 半厚 0.0008），面板贴到 9.6 mm 才不会和窗面 z-fighting；
  // 指针原本在 9.4 mm，会被面板盖住，跟着抬到 9.9 mm，仍是"压在刻度板上"的样子
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(w, 0.014),
    new THREE.MeshBasicMaterial({ map: faceTex, toneMapped: false }),
  );
  face.rotation.x = -Math.PI / 2;
  face.position.set(0, 0.0096, 0);
  root.add(face);

  let ptr: THREE.Object3D | null = null;
  root.traverse((o) => {
    const pid = String((o.userData?.partId as string | undefined) ?? o.name);
    if (pid === 'pointer') ptr = o;
  });
  if (ptr) (ptr as THREE.Object3D).position.y = 0.0099;
  return {
    root,
    setReading: (n: number) => {
      if (ptr) (ptr as THREE.Object3D).position.x = FACE_ZERO_X - (n / FACE_MAX) * FACE_SPAN;
    },
  };
}

/** 作图比例：1 N 画 13 mm。合力量程到 9.7 N 时箭头 126 mm，仍落在纸内 */
const FIG_K = 0.013;
/** 绳从结点到挂钩的长度：越用力拉，绳越长（手越远） */
const hookDist = (f: number) => Math.min(0.19, 0.04 + f * 0.014);

const UP = new THREE.Vector3(0, 1, 0);

export default function buildL3Scene(api: SceneApi, getState: () => L3State): () => void {
  const { scene, camera, onTick, draggable, setTarget } = api;

  const bench = tableTop(1.9, 1.3);
  scene.add(bench);

  // 整套器材挂在 rig 下。三只表要能拖——但拖的是「方向」不是「位置」：
  // 器材位置由两分力的大小和方向唯一决定，拖动只把指针的纸面落点反解成角度回写面板。
  api.enableDrag();
  const rig = new THREE.Group();
  scene.add(rig);

  // ---------- 橡皮条：矩形条，长度随拉力变化 ----------
  // 教学橡皮条是米黄色半透材质：0xbd9a5c 既和 0xc6bba0 的纸分得开，
  // 又比绳套（0x93805e）浅——"粗浅条 = 橡皮、细深线 = 棉线"一眼能分辨
  const rubber = new THREE.Mesh(
    new THREE.BoxGeometry(1, RUB_T, RUB_W),
    mat('rubber', { color: 0xbd9a5c, roughness: 0.9 }),
  );
  rubber.castShadow = true;
  rubber.position.y = PAPER_Y + RUB_T / 2;
  rig.add(rubber);

  // ---------- 绳套（结点 → 挂钩）----------
  // Ø1.8 mm 的浅米色棉线在纸面上完全看不见，改成 Ø2.4 mm 并加深（棉线本色就是土黄）
  const ropeGeo = new THREE.CylinderGeometry(0.0012, 0.0012, 1, 8);
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x93805e, roughness: 0.95 });
  const placeBetween = (m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) => {
    const d = b.clone().sub(a);
    const len = Math.max(1e-4, d.length());
    m.position.copy(a).addScaledVector(d, 0.5);
    m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
  };

  // ---------- 钢筋结点环 ----------
  const knot = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0018, 10, 36), mat('steel'));
  knot.rotation.x = -Math.PI / 2;
  rig.add(knot);

  const rope1 = new THREE.Mesh(ropeGeo, ropeMat);
  const rope2 = new THREE.Mesh(ropeGeo, ropeMat);
  const rope3 = new THREE.Mesh(ropeGeo, ropeMat);
  rig.add(rope1, rope2, rope3);

  // ---------- 作图线（学生画在纸上的铅笔线）----------
  const inkY = PAPER_Y + 0.0012;
  const figGroup = new THREE.Group();
  // 分力线的方向必然和绳套重合，而绳是 Ø2.4 mm 的实体、线只有 1 px 宽，
  // 原样画会被绳整根盖掉。整组往 −z 偏 7 mm：仍在结点环（Ø22 mm）内，
  // 看上去还是从 O 点画出，却足够从绳边露出来
  figGroup.position.z = -0.007;
  rig.add(figGroup);

  const mkLine = (color: number, dashed: boolean) => {
    const m = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 0.005, gapSize: 0.0032 })
      : new THREE.LineBasicMaterial({ color });
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, 0.001),
    ]);
    const line = new THREE.Line(g, m);
    line.computeLineDistances();
    return line;
  };
  // 深灰 = 两分力，赭红 = 合力（在白纸上必须够深，浅蓝在浅色纸面上等于没画）
  const lineF1 = mkLine(0x1b232c, false);
  const lineF2 = mkLine(0x1b232c, false);
  const lineS1 = mkLine(0x4a5560, true);
  const lineS2 = mkLine(0x4a5560, true);
  const lineDiag = mkLine(0xb3400e, true);
  figGroup.add(lineF1, lineF2, lineS1, lineS2, lineDiag);

  const setLine = (line: THREE.Line, a: THREE.Vector3, b: THREE.Vector3) => {
    line.geometry.setFromPoints([a, b]);
    line.computeLineDistances();
  };

  // ---------- 矢量箭头（平贴在纸上的小三角）----------
  // 一条光秃秃的线只是"半径"，加了箭头才读得出"这是力"
  const mkArrow = (color: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, -0.0042, 0, 0, 0.0042, 0.017, 0, 0], 3),
    );
    const mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
    );
    figGroup.add(mesh);
    return mesh;
  };
  const arrowF1 = mkArrow(0x1b232c);
  const arrowF2 = mkArrow(0x1b232c);
  const arrowF = mkArrow(0xb3400e);

  const setArrow = (mesh: THREE.Mesh, tip: THREE.Vector3, dx: number, dz: number) => {
    mesh.position.set(tip.x, tip.y, tip.z);
    mesh.rotation.y = -Math.atan2(dz, dx);
  };

  // ---------- 三只测力计 ----------
  const scales: Scale[] = [];
  const tags: Tag[] = [];
  // 读数牌不挂在 rig 下：它比表体大一圈，算进包围盒会把取景拉远，器材在画面里就缩了
  const tagLayer = new THREE.Group();
  scene.add(tagLayer);
  let lastSig = '';

  const face = scaleFaceTexture();
  let protoReady = false;
  const buildScales = (proto: THREE.Group) => {
    if (protoReady) return; // async 只会跑一次，但别让重复调用叠出六只表
    protoReady = true;
    // 壳原本 0.34 的透明度会把内部 8 圈拉簧透出来，缩略图尺度下像表面的白划痕；
    // 提到 0.72 只剩"半透塑料"的朦胧感，真实 J2104 的壳也基本看不清弹簧
    proto.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!m) return;
      const pid = String((o.userData?.partId as string | undefined) ?? o.name);
      if (m.transparent && pid.startsWith('shell')) m.opacity = 0.72;
      // 内部拉簧在 Blender 里给的是 steel（亮银），透过 0.72 的壳还是一串白圈，
      // 缩略图尺度下像表面的划痕；真实 J2104 的弹簧是发黑的钢丝，直接压深
      if (pid.includes('inner_spring')) {
        m.color.setHex(0x2f353d);
        m.metalness = 0.25;
        m.roughness = 0.65;
      }
    });
    // 先克隆再装刻度板：先装的话原型上会多一块面板，后面的克隆件就会带两块
    const roots = [proto, proto.clone(true) as THREE.Group, proto.clone(true) as THREE.Group];
    roots.forEach((root, i) => {
      root.name = `scale-${i}`; // 自检脚本按名字取第 i 只表的屏幕位置
      root.position.y = SCALE_Y;
      rig.add(root);
      scales.push(installScale(root, face.tex));
      const tg = makeTag();
      tg.set(0);
      tagLayer.add(tg.node);
      tags.push(tg);
    });
  };

  // ---------- 取景：斜俯视，模拟学生站在实验台前看纸面 ----------
  const FOCUS = new THREE.Box3(
    new THREE.Vector3(-0.25, 0.0, -0.21),
    new THREE.Vector3(0.31, 0.06, 0.21),
  );
  const applyView = () => {
    setTarget(fitCamera(camera, FOCUS, { pitch: 48, yaw: 0, fill: 0.88, margin: 0.012 }));
  };
  applyView();
  let needsFit = false;

  // ---------- 异步装载 glb ----------
  void (async () => {
    const [board, proto] = await Promise.all([
      loadOrFallback('force_board', () => new THREE.Group()),
      loadOrFallback('spring_scale', fallbackScale),
    ]);
    rig.add(board.root);
    buildScales(proto.root);
    bindDrag();
    // 表此刻还都摞在原点，包围盒比真实布局小一半：等下一帧布局把它们摆开再按实际范围取景，
    // 否则相机按"三只表叠在一起"的距离站定，器材在画面里只有六成
    needsFit = true;
    lastSig = '';
  })();

  // ---------- 每帧布局 ----------
  const v = {
    knot: new THREE.Vector3(),
    dir1: new THREE.Vector3(),
    dir2: new THREE.Vector3(),
    dirR: new THREE.Vector3(),
    hook: new THREE.Vector3(),
    tip1: new THREE.Vector3(),
    tip2: new THREE.Vector3(),
    diag: new THREE.Vector3(),
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
  };

  // ---------- 拖动测力计改角度 ----------
  // 参考点取「按下那一刻的结点」，整段拖动都用它算角度：若每帧都用最新结点，
  // 结点会随角度移动、角度又反过来影响结点，形成「拖一寸、表往回缩一寸」的负反馈。
  // 用函数声明（而不是 const）是为了能提升到 async 分支里调用 —— 那里 scale 刚建好
  function bindDrag() {
    let origin: THREE.Vector3 | null = null;
    let lastAt = 0;
    for (let i = 0; i < 2; i++) {
      const root = scales[i]?.root;
      if (!root) continue;
      draggable(root, {
        canDrag: () => getState().stage === 'setup',
        onMove: (pos) => {
          const now = performance.now();
          if (!origin || now - lastAt > 260) origin = v.knot.clone();
          lastAt = now;
          const dx = pos.x - origin.x;
          const dz = pos.z - origin.z;
          if (Math.hypot(dx, dz) < 0.03) return; // 贴着结点时方向解不稳定，先不动
          getState().onScaleDrag(i as 0 | 1, (Math.atan2(dz, dx) * 180) / Math.PI);
          // 拖动逻辑会把器材位置改成指针位置，这不是我们要的；清签名让下一帧布局摆回去
          lastSig = '';
        },
      });
    }
  };

  /** 返回 true 表示这一帧真的重排了（参数或阶段变了），调用方据此决定要不要复检取景 */
  const layout = (s: L3State): boolean => {
    const sig = `${s.f1}|${s.f2}|${s.a1}|${s.a2}|${s.stage}|${s.progress.toFixed(2)}`;
    if (sig === lastSig) return false;
    lastSig = sig;

    const a1 = (s.a1 * Math.PI) / 180;
    const a2 = (s.a2 * Math.PI) / 180;
    const T = resultant(s);
    // 矢量合成：两只表各自有方向，合力 = 两分力的矢量和。
    // 对称摆放（a1 = θ/2、a2 = −θ/2）时退化成 (F₁+F₂)cosθ/2、(F₁−F₂)sinθ/2，
    // 和教材图示一致；不对称时合力方向会自己偏，平行四边形就"歪"了 —— 这正是拖动要看的东西。
    const rx = s.f1 * Math.cos(a1) + s.f2 * Math.cos(a2);
    const rz = s.f1 * Math.sin(a1) + s.f2 * Math.sin(a2);
    // 结点平衡：橡皮条沿合力反向拉，所以橡皮条方向 = 合力方向，
    // 长度由它自己的劲度决定 —— 拉力变大橡皮条变长，结点沿合力方向外移。
    const phi = Math.atan2(rz, rx);
    const L = RUB_L0 + T / RUB_K;
    v.knot.set(A_X + L * Math.cos(phi), PAPER_Y + RUB_T / 2, L * Math.sin(phi));

    v.dir1.set(Math.cos(a1), 0, Math.sin(a1));
    v.dir2.set(Math.cos(a2), 0, Math.sin(a2));
    v.dirR.set(Math.cos(phi), 0, Math.sin(phi));

    // 橡皮条：固定钉 → 结点（拉伸时只改长度，截面不变——橡皮条本身就有泊松收缩，
    // 但 12% 的缩量在 6 mm 宽的条上不到半个像素，不值得为它加一条缩放轴）
    rubber.position.set((A_X + v.knot.x) / 2, PAPER_Y + RUB_T / 2, v.knot.z / 2);
    rubber.scale.x = Math.max(1e-3, Math.hypot(v.knot.x - A_X, v.knot.z));
    rubber.rotation.y = -Math.atan2(v.knot.z, v.knot.x - A_X);

    knot.position.set(v.knot.x, PAPER_Y + 0.0022, v.knot.z);

    const fs = [s.f1, s.f2, T];
    const dirs = [v.dir1, v.dir2, v.dirR];
    const angs = [a1, a2, phi];
    for (let i = 0; i < 3; i++) {
      const sc = scales[i];
      if (!sc) continue;
      const dist = hookDist(fs[i]);
      v.hook.copy(v.knot).addScaledVector(dirs[i], dist);
      sc.root.position.set(v.hook.x - HOOK_DX * dirs[i].x, SCALE_Y, v.hook.z - HOOK_DX * dirs[i].z);
      sc.root.rotation.y = -angs[i];
      // 读数按分度 0.2 N 量化，和右侧表格里的"实测值"用同一套规则：
      // 不量化的话拉力 9.659 N 的牌上会写 9.7，表格里却是 9.6，两个数字对不上
      const raw = s.stage === 'run' ? fs[i] * s.progress : fs[i];
      const reading = Math.min(FACE_MAX, Math.round(raw * 5) / 5);
      sc.setReading(reading);
      const tg = tags[i];
      if (tg) {
        // 牌子挂在表尾提环（+88 mm）外侧 20 mm：标签是 DOM 层，永远压在最上面，
        // 所以只要几何上让开表尾就不会挡住刻度窗
        tg.node.position.set(
          sc.root.position.x + dirs[i].x * 0.108,
          SCALE_Y + 0.030,
          sc.root.position.z + dirs[i].z * 0.108,
        );
        tg.set(reading);
      }
      const rp = [rope1, rope2, rope3][i];
      v.a.set(v.knot.x, PAPER_Y + 0.004, v.knot.z);
      v.b.set(v.hook.x, PAPER_Y + 0.004, v.hook.z);
      placeBetween(rp, v.a, v.b);
    }

    // 作图：分力矢量 + 平行四边形虚线 + 对角线
    v.tip1.copy(v.knot).addScaledVector(v.dir1, s.f1 * FIG_K).setY(inkY);
    v.tip2.copy(v.knot).addScaledVector(v.dir2, s.f2 * FIG_K).setY(inkY);
    const k = new THREE.Vector3(v.knot.x, inkY, v.knot.z);
    v.diag.copy(v.tip1).add(v.tip2).sub(k);
    setLine(lineF1, k, v.tip1);
    setLine(lineF2, k, v.tip2);
    setLine(lineS1, v.tip1, v.diag);
    setLine(lineS2, v.tip2, v.diag);
    setLine(lineDiag, k, v.diag);
    setArrow(arrowF1, v.tip1, v.dir1.x, v.dir1.z);
    setArrow(arrowF2, v.tip2, v.dir2.x, v.dir2.z);
    setArrow(arrowF, v.diag, v.diag.x - k.x, v.diag.z - k.z);
    return true;
  };

  // SceneHost 只有一条 tick 回调，布局和取景必须挂在同一个 fn 里，
  // 分两次 onTick 注册的话后一条会把前一条覆盖掉，器材就再也不动了
  const frameBox = new THREE.Box3();
  const measure = () => {
    frameBox.setFromObject(rig);
    // 读数牌是 CSS2D，没有几何、不参与 setFromObject，但它们占着画面的最外圈：
    // 不把名牌中心点算进来，最外侧那只表的名牌就会正好卡在画框外被裁掉
    for (const tg of tags) frameBox.expandByPoint(tg.node.position);
    return frameBox;
  };
  onTick(() => {
    const moved = layout(getState());
    if (!scales.length) return;
    if (needsFit) {
      needsFit = false;
      FOCUS.copy(measure());
      applyView();
      return;
    }
    // 夹角变小/力变大时三只表会向外张开：新包围盒一旦顶出当前取景框就整体拉远。
    // 只扩不缩——参数来回拖时镜头不会一抽一抽地跳
    if (moved) {
      const b = measure();
      if (!FOCUS.containsBox(b)) {
        FOCUS.union(b);
        applyView();
      }
    }
  });

  return () => {
    scene.remove(bench);
    scene.remove(rig);
    scene.remove(tagLayer);
  };
}
