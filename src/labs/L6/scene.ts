// L6 场景：探究向心力大小与质量、半径、角速度的关系（手摇式向心力演示器）
// 机身（箱式蓝漆底座 / 五级阶梯塔轮 / 红圆皮带 / 黑立柱 + 柱脚弹簧 / 手轮摇把）
// 来自 centripetal.glb；两根横臂 + 球座 + 钢球 + 测力套筒是程序化的：
// 它们要随轴转动、随半径参数滑动、随读数移动指针。
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';
import { mat, contactShadow } from '@/engine/materials';
import { tableTop, textPlate } from '@/labs/_shared/instruments';
import { fitCamera, boxOfSubject } from '@/labs/_shared/framing';
import { loadOrFallback } from '@/labs/_shared/models';

export interface L6Params {
  mass: number; // kg
  radius: number; // m
  omega: number; // rad/s
}

export interface L6State extends L6Params {
  stage: 'setup' | 'run' | 'analyze';
  runId: number;
  onProgress: (p: number) => void;
  onFinish: () => void;
}

export function theoryForce(p: L6Params): number {
  return p.mass * p.omega * p.omega * p.radius;
}

/** 测力读数（含 −2% 系统差，指针抖动已取平均） */
export function measuredForce(p: L6Params): number {
  return theoryForce(p) * (1 - 0.02);
}

// ---------- 机身尺寸：与 blender/build_centripetal.py 的常量一一对应（单位 m）----------
// 底座顶面 BASE_TOP = 0.108（箱式铸件：22 mm 顶盖 + 78 mm 方腿 + 8 mm 地脚），
// 塔轮顶 PULLEY_TOP = 0.1655，皮带 BELT_Z = 0.1383 —— 本文件只需要横臂以上的尺寸。
// 底座顶面 BASE_TOP = 0.108（箱式铸件：22 mm 顶盖 + 78 mm 方腿 + 8 mm 地脚），
// 塔轮顶 PULLEY_TOP = 0.1655，皮带 BELT_Z = 0.1383 —— 本文件只需要横臂以上的尺寸。
const COL_X = 0.13; // 两立柱轴线（x = ±COL_X）
const ARM_Y = 0.176; // 横臂中心高度 = glb 抱箍高度（塔轮顶 0.144 + 柱脚弹簧 23 mm）
// 横臂横跨立柱：**内侧段长 0.110**（球座沿它滑到 r = 80 mm，臂端离中线只剩 20 mm），
// 外侧只留 0.050 的短尾装斜撑和配平。
// 参考件正是这样：两颗球都落在两柱之间的中缝附近，而不是各挂在两端。
// 两臂反向转动且始终关于中面对称，内侧端永远相距 40 mm，不会打架。
const ARM_IN = 0.110; // 内侧（朝中线）长段
const ARM_OUT = 0.050; // 外侧短尾
const ARM_H = 0.016; // 臂厚
const ARM_W = 0.040; // 臂宽（进深）—— 必须 < 抱箍 Ø43，臂才能从箍里穿出
const HUB_R = 0.0215; // 转轴座半径（包住 Ø26 立柱）
const LINE_X0 = 0.024; // 拉线起点：轴座外壁
const R_MIN = 0.040; // 球座最近：球内缘 0.025，越过轴座 0.0215
const R_MAX = 0.080; // 球座最远：滑块外沿 0.106 < 臂端 0.110
const BALL_R0 = 0.017; // m = 100 g 时的钢球半径（Ø34）

/** 一条横臂：臂身横跨立柱 + 顶面/侧面 mm 刻度 + 斜撑 + 球座（局部 +x 朝外） */
function buildArm() {
  const g = new THREE.Group();
  // 臂身单独一份哑光黑：plasticBlack 的镜面偏亮，臂顶面朝主光会整条泛白，
  // 远看像在横臂上贴了一条白胶带。
  const black = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.66, metalness: 0.22 });
  const steel = mat('steel', { roughness: 0.24 });
  const tickMat = new THREE.MeshBasicMaterial({ color: 0xd7dee6 });
  const inkMat = new THREE.MeshBasicMaterial({ color: 0x2b3038 });
  const redMat = mat('plasticRed', { emissive: 0x330000 });

  // 臂身横跨立柱：外侧长段给球座走行程，内侧留一小段带刻度和斜撑。
  // 参考件正是这个比例——刻度画在靠柱的一段，球在臂上滑动读半径。
  const arm = new THREE.Mesh(new THREE.BoxGeometry(ARM_IN + ARM_OUT, ARM_H, ARM_W), black);
  arm.position.set((ARM_OUT - ARM_IN) / 2, ARM_Y, 0);
  arm.castShadow = true;
  arm.receiveShadow = true;
  g.add(arm);

  // 斜撑：参考件里横臂与立柱之间那块三角形铁板，直角贴柱、斜边朝臂端。
  // 放在外侧短尾上——放内侧会挡球座的行程（r 调到 40 mm 时滑块正压在那里）。
  const gusShape = new THREE.Shape();
  gusShape.moveTo(0.010, 0);
  gusShape.lineTo(ARM_OUT - 0.004, 0);
  gusShape.lineTo(0.010, 0.046);
  gusShape.lineTo(0.010, 0);
  const gus = new THREE.Mesh(
    new THREE.ExtrudeGeometry(gusShape, { depth: 0.010, bevelEnabled: true, bevelSize: 0.0010, bevelThickness: 0.0010, bevelSegments: 1 }),
    black,
  );
  gus.position.set(0, ARM_Y + ARM_H / 2, -0.005);
  gus.castShadow = true;
  g.add(gus);

  // 臂侧毫米刻度：跨立柱两侧 -50…+120 mm，每 10 mm 一条，整十加长（读的就是 r）
  for (const sz of [-1, 1]) {
    for (let i = -5; i <= 12; i++) {
      const major = i % 5 === 0;
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.0012, major ? 0.014 : 0.009, 0.0006), tickMat);
      t.position.set(-i * 0.01, ARM_Y + (major ? 0.001 : 0), sz * (ARM_W / 2 + 0.0004));
      g.add(t);
    }
  }

  // 转轴座：竖直圆筒套在立柱上，横臂从筒壁穿出（这一段随臂一起转）
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(HUB_R, HUB_R, 0.026, 32), black);
  hub.position.set(0, ARM_Y, 0);
  hub.castShadow = true;
  g.add(hub);
  const lockScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.0030, 0.0030, 0.008, 12), steel);
  lockScrew.rotation.x = Math.PI / 2;
  lockScrew.position.set(0, ARM_Y + 0.006, -(HUB_R + 0.002));
  g.add(lockScrew);

  // ---------- 球座：骑在臂上的滑块 + 外侧立板 + 顶部鞍形挡块 ----------
  // 参考件的关键特征：钢球贴在立板的**立柱侧**，立板顶部那块「两翼上翘、中间
  // 下凹」的鞍形件从上方兜住球，侧面两颗银色压紧螺柱。早前做成"小塔 + 圆托环"，
  // 读出来是一颗球放在烛台上，完全没有测力环压头的意思。
  const slider = new THREE.Group();
  // 球座整体沿 x 镜像：立板要落在球的**远离立柱**一侧（参考件就是这样把球夹在
  // 立板与拉线之间）。立板、鞍片、螺柱都是 x 向偏置的，直接置 scale.x = -1 最省事，
  // 球本身是球体，镜像对它没有影响。
  slider.scale.x = -1;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.005, ARM_W + 0.006), black);
  plate.position.set(0.008, ARM_H / 2 + 0.0025, 0);
  plate.castShadow = true;
  slider.add(plate);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.030, ARM_W), black);
  post.position.set(0.0185, ARM_H / 2 + 0.005 + 0.015, 0);
  post.castShadow = true;
  slider.add(post);

  // 鞍形挡块：底面平、顶面中间下凹两侧上翘 —— 从侧面看就是一个「马鞍」
  const sadShape = new THREE.Shape();
  sadShape.moveTo(-0.015, 0);
  sadShape.lineTo(0.023, 0);
  sadShape.lineTo(0.023, 0.018);
  sadShape.quadraticCurveTo(0.004, 0.006, -0.015, 0.018);
  sadShape.lineTo(-0.015, 0);
  const saddle = new THREE.Mesh(
    new THREE.ExtrudeGeometry(sadShape, { depth: ARM_W, bevelEnabled: true, bevelSize: 0.0009, bevelThickness: 0.0009, bevelSegments: 1 }),
    black,
  );
  saddle.position.set(0, ARM_H / 2 + 0.005 + 0.030, -ARM_W / 2);
  saddle.castShadow = true;
  slider.add(saddle);

  // 立板正面两颗压紧螺柱（参考件上银色螺杆朝观察者支出来，并排一左一右）
  for (const dx of [0.0130, 0.0240]) {
    const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.026, 12), steel);
    stud.rotation.x = Math.PI / 2;
    stud.position.set(dx, ARM_H / 2 + 0.024, ARM_W / 2 - 0.002);
    slider.add(stud);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.0040, 0.0040, 0.005, 12), steel);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(dx, ARM_H / 2 + 0.024, ARM_W / 2 + 0.012);
    slider.add(knob);
  }

  // 球座侧面的红色游标线：对着臂侧刻度，读出的就是 r
  for (const sz of [-1, 1]) {
    const mk = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.012, 0.0007), redMat);
    mk.position.set(0, ARM_H / 2 + 0.006, sz * (ARM_W / 2 + 0.0026));
    slider.add(mk);
  }

  // 钢球：球心就在滑块原点，所以 slider.position.x = r 时 r 即真实半径；
  // 球底压在臂面上（y = ARM_H/2 + ballR，随质量变化由 layout() 每帧更新）
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R0, 28, 20), steel);
  ball.position.set(0, ARM_H / 2 + BALL_R0, 0);
  ball.castShadow = true;
  slider.add(ball);
  g.add(slider);

  // 拉线：套筒外端 → 球座内沿（沿臂侧走，长度随 r 变化）
  const line = new THREE.Mesh(new THREE.BoxGeometry(1, 0.0016, 0.0016), inkMat);
  line.position.set(-0.05, ARM_Y - 0.0075, -ARM_W / 2 - 0.0018);
  g.add(line);

  return { g, slider, ball, line };
}

export async function buildL6Scene(api: SceneApi, getState: () => L6State): Promise<() => void> {
  const { scene, camera, addAnchor, setAnchorText, draggable, onTick, setTarget } = api;

  scene.add(tableTop(2.4, 2.4));

  // 整机放进 rig：布置阶段可以整体挪，运行阶段锁定
  const rig = new THREE.Group();
  rig.name = 'rig';
  scene.add(rig);
  draggable(rig, { plane: 'floor', canDrag: () => getState().stage === 'setup' });

  // glb 拿不到时至少要有底座和两根立柱：否则两根横臂会凭空悬在半空
  const fallbackRig = () => {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.096, 0.20), mat('paintBlue'));
    slab.position.y = 0.048;
    g.add(slab);
    for (const sx of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.30, 20), mat('plasticBlack'));
      col.position.set(sx * COL_X, 0.15, 0);
      g.add(col);
    }
    return g;
  };
  const model = await loadOrFallback('centripetal', fallbackRig);
  rig.add(model.root);

  const ao = contactShadow(0.24, 0.55);
  ao.position.set(0, 0.002, 0);
  rig.add(ao);

  // ---------- 两条横臂（朝外，随各自转轴同步旋转）----------
  const armL = buildArm();
  const armR = buildArm();
  armL.g.position.set(-COL_X, 0, 0);
  armR.g.position.set(COL_X, 0, 0);
  rig.add(armL.g, armR.g);
  const arms = [armL, armR];

  const ballAnchor = addAnchor(armL.ball, '钢球 m = 100 g');

  // ---------- 数显：嵌在底座前面板的力读数 ----------
  // 注意坐标系：glb 里的 (x, y, z) 经 Y-up 转换后是 three 的 (x, z, -y)。
  // 机身正面在 Blender 是 -Y，到 three 里就是 **+Z**；贴片保持默认朝向即可，
  // 一旦按 Blender 坐标把 y 写成负数，贴片会躺平朝下、被背面剔除掉（读数直接消失）。
  const forcePlate = textPlate(0.100, 0.021, 'F = 0.00 N', { fontSize: 72 });
  // 控制盒从底座前脸伸出 18 mm，盒前玻璃面在 Blender y=-0.1315 → three z=+0.1315
  forcePlate.mesh.position.set(0, 0.056, 0.1318);
  rig.add(forcePlate.mesh);
  const dialMark = new THREE.Object3D();
  dialMark.position.set(0, 0.056, 0.1318);
  rig.add(dialMark);
  const dialAnchor = addAnchor(dialMark, '向心力读数 F = mω²r', undefined, new THREE.Vector3(0, 0.030, 0));

  let angle = 0;
  let lastRun = -1;
  let prog = 0;
  let done = false;

  const layout = () => {
    const st = getState();
    const r = THREE.MathUtils.clamp(st.radius, R_MIN, R_MAX);

    // 两臂左右镜像摆动（交叉皮带驱动的两轴就是反向转）：
    // 写成同向会变成"一根长杆穿过两柱"，两颗球在中线会合，看着像横臂断了。
    armL.g.rotation.y = Math.PI - angle;
    armR.g.rotation.y = angle;

    // 球半径随质量变：同种钢材，m ∝ R³
    const ballR = BALL_R0 * Math.cbrt(Math.max(0.2, st.mass / 0.1));
    const ramp = st.stage === 'setup' ? 0 : Math.min(1, prog / 0.25);
    const F = ramp * measuredForce(st);

    for (const a of arms) {
      // 球座朝内滑：x = -r（臂的内侧段在 -x 方向），r 就是球到立柱轴的距离
      a.slider.position.set(-r, ARM_Y, 0);
      a.ball.scale.setScalar(ballR / BALL_R0);
      // 球心就在滑块原点，球底压在臂面上：换质量时只是球变大，球心高度随之上抬
      a.ball.position.y = ARM_H / 2 + ballR;
      // 拉线：从套筒外端拉到球座内沿，长度随 r 变化（r 最小时几乎看不见）
      const x0 = -LINE_X0;
      const x1 = -r + 0.010; // 滑块底板朝轴那侧的外沿（底板 36 宽、中心偏 8）
      const len = Math.max(0.0008, x1 - x0);
      a.line.scale.x = len;
      a.line.position.x = x0 + len / 2;
    }

    forcePlate.setText(`F = ${F.toFixed(2)} N`);
    setAnchorText(dialAnchor, st.stage === 'setup' ? '向心力读数 F = 0.00 N（未转动）' : `向心力读数 F = ${F.toFixed(2)} N`);
    setAnchorText(
      ballAnchor,
      `钢球 m = ${(st.mass * 1000).toFixed(0)} g · r = ${(r * 1000).toFixed(0)} mm · ω = ${st.omega.toFixed(1)} rad/s`,
    );
  };

  onTick((dt) => {
    const st = getState();
    if (st.runId !== lastRun) {
      lastRun = st.runId;
      prog = 0;
      done = false;
      angle = 0;
    }
    if (st.stage === 'run' && !done) {
      angle += st.omega * dt;
      prog = Math.min(1, prog + dt * 1.2);
      st.onProgress(prog);
      if (prog >= 1) {
        done = true;
        st.onFinish();
      }
    }
    layout();
  });

  layout();
  // 整机 428×240×311 mm：俯 17° 才能同时看到塔轮阶梯、臂侧刻度和底座前面板
  setTarget(fitCamera(camera, boxOfSubject(scene), { pitch: 13, yaw: 0.42, fill: 0.9, margin: 0.02 }));
  return () => {};
}
