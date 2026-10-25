// L6 场景：探究向心力大小与质量、半径、角速度的关系（向心力演示器）
// 转盘带动小球做圆周运动，弹簧测力计读取向心力 F = mω²r
import * as THREE from 'three';
import type { SceneApi } from '@/engine/SceneHost';
import { mat, contactShadow } from '@/engine/materials';
import { tableTop, textPlate } from '@/labs/_shared/instruments';
import { fitCamera, boxOfSubject } from '@/labs/_shared/framing';

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

/** 弹簧测力计读数（含 −2% 系统差，指针抖动已取平均） */
export function measuredForce(p: L6Params): number {
  return theoryForce(p) * (1 - 0.02);
}

export function buildL6Scene(api: SceneApi, getState: () => L6State): () => void {
  const { scene, camera, addAnchor, setAnchorText, draggable, onTick, setTarget } = api;
  // 取景在文件末尾统一按器材包围盒计算（fitCamera）

  const table = tableTop(2.4, 2.4);
  scene.add(table);

  // 底座 + 立轴 + 转盘
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.18), mat('plasticBlack'));
  base.position.y = 0.015;
  scene.add(base);
  // 主光在右前上方，转盘的影子落到背后被自己挡住 → 补一块接触阴影，否则整台仪器像浮在台面上
  const ao = contactShadow(0.15, 0.5);
  ao.position.set(0, 0.002, 0.01);
  scene.add(ao);

  const PLATE_Y = 0.046; // 盘面高度
  const DISC_R = 0.16;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(DISC_R, DISC_R, 0.008, 64), mat('aluminumMatte'));
  disc.position.y = PLATE_Y;
  disc.castShadow = true;
  scene.add(disc);
  const discAnchor = addAnchor(disc, '转盘 r_max = 160 mm', undefined, new THREE.Vector3(0, 0.062, 0));

  // 外缘滚花环（真实转盘边缘是翻边 + 滚花）
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(DISC_R - 0.0015, 0.0018, 8, 96), mat('steel', { color: 0x9aa4ad }));
  rimRing.rotation.x = Math.PI / 2;
  rimRing.position.y = PLATE_Y + 0.004;
  scene.add(rimRing);

  // 随盘旋转：径向滑槽 + 毫米刻度 + 配重 + 游标
  const rotor = new THREE.Group();
  scene.add(rotor);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(DISC_R - 0.028, 0.0025, 0.011), mat('plasticBlack', { roughness: 0.8 }));
  slot.position.set(0.014 + (DISC_R - 0.028) / 2, PLATE_Y + 0.0045, 0);
  rotor.add(slot);
  const tickMatR = new THREE.MeshBasicMaterial({ color: 0x33404d });
  for (let i = 3; i <= 15; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.0008, 0.0005, i % 5 === 0 ? 0.009 : 0.005), tickMatR);
    t.position.set(i * 0.01, PLATE_Y + 0.0062, 0.011);
    rotor.add(t);
  }
  const counterweight = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 20), mat('brass'));
  counterweight.position.set(-0.06, PLATE_Y + 0.010, 0);
  counterweight.castShadow = true;
  rotor.add(counterweight);
  const cursor = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.0016, 0.02), mat('plasticRed', { emissive: 0x330000 }));
  cursor.position.set(0.08, PLATE_Y + 0.0075, 0);
  rotor.add(cursor);

  // 中心轴座 + 锁紧螺钉
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.024, 0.014, 28), mat('aluminum'));
  hub.position.y = PLATE_Y + 0.007;
  hub.castShadow = true;
  scene.add(hub);
  const setScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.007, 12), mat('steel', { color: 0x8b949e }));
  setScrew.rotation.z = Math.PI / 2;
  setScrew.position.set(0.024, PLATE_Y + 0.008, 0);
  scene.add(setScrew);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 14), mat('steel'));
  shaft.position.y = 0.02;
  scene.add(shaft);

  // 中心数显：实时显示径向拉力 F = mω²r（器材面板读数，不走 2 s 悬停）
  const dialPost = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.036, 10), mat('steel', { color: 0x9aa4ad }));
  dialPost.position.set(0, PLATE_Y + 0.03, 0.012);
  scene.add(dialPost);
  const dialBox = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.022, 0.008), mat('plasticBlack'));
  dialBox.position.set(0, PLATE_Y + 0.052, 0.012);
  dialBox.castShadow = true;
  scene.add(dialBox);
  const forcePlate = textPlate(0.049, 0.017, 'F = -- N', { fontSize: 92 });
  forcePlate.mesh.position.set(0, PLATE_Y + 0.052, 0.0165);
  scene.add(forcePlate.mesh);
  const dialAnchor = addAnchor(dialBox, '径向测力计 F = mω²r', undefined, new THREE.Vector3(0, 0.014, 0.01));

  // 手柄：摇臂伸出转盘外，握柄竖直
  const crank = new THREE.Group();
  const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.008, 0.014), mat('steel', { color: 0x9aa4ad }));
  crankArm.position.set(-0.08, 0, 0);
  crank.add(crankArm);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 12), mat('plasticRed'));
  knob.position.set(-0.155, 0.015, 0);
  crank.add(knob);
  crank.position.set(0, 0.052, 0);
  scene.add(crank);
  draggable(crank);

  // ---------- 小球 + 螺旋弹簧 ----------
  const BALL_R = 0.012;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 18), mat('steel', { roughness: 0.22 }));
  ball.castShadow = true;
  scene.add(ball);
  const ballAnchor = addAnchor(ball, '小球 m = 100 g');

  // 原来这里是一根 φ6 的实心"钢棍"，看着不像器材；真实向心力演示器是
  // 滑槽里的一根拉伸弹簧，所以改成 26 圈螺旋弹簧，只沿轴向伸缩。
  const COILS = 18;
  const spring = new THREE.Group();
  // 深色发黑弹簧：盘面是浅铝色，亮银弹簧会和盘面糊成一片看不见
  const coilMat = mat('steel', { color: 0x6f7a86, roughness: 0.34 });
  const ringGeo = new THREE.TorusGeometry(0.004, 0.0006, 6, 16);
  for (let i = 0; i < COILS; i++) {
    const ring = new THREE.Mesh(ringGeo, coilMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = i / (COILS - 1);
    ring.castShadow = true;
    spring.add(ring);
  }
  scene.add(spring);

  const UP = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  let angle = 0;
  let lastRun = -1;
  let prog = 0;
  let done = false;

  const layout = () => {
    const st = getState();
    const r = Math.max(0.03, st.radius);
    const y = PLATE_Y + 0.006 + BALL_R; // 球心：盘面 + 槽深 + 球半径
    dir.set(Math.cos(angle), 0, Math.sin(angle));
    ball.position.set(dir.x * r, y, dir.z * r);
    rotor.rotation.y = -angle;
    counterweight.position.set(-r * 0.82, PLATE_Y + 0.010, 0);
    cursor.position.set(r, PLATE_Y + 0.0075, 0);

    // 弹簧从轴座外缘拉到球面：长度随半径变，圈距随之变化
    const startR = 0.024;
    const sLen = Math.max(0.012, r - BALL_R - startR);
    spring.position.set(dir.x * startR, y, dir.z * startR);
    spring.quaternion.setFromUnitVectors(UP, dir);
    spring.scale.set(1, sLen, 1);

    // 布置参数变化 → 器材标签与读数同步
    setAnchorText(discAnchor, `转盘 r_max = 160 mm · ω = ${st.omega.toFixed(1)} rad/s`);
    setAnchorText(ballAnchor, `小球 m = ${(st.mass * 1000).toFixed(0)} g · r = ${(r * 1000).toFixed(0)} mm`);
    setAnchorText(dialAnchor, `径向测力计 F = mω²r = ${measuredForce(st).toFixed(2)} N`);
    forcePlate.setText(st.stage === 'setup' ? 'F = -- N' : `F = ${measuredForce(st).toFixed(2)} N`);
  };

  onTick((dt) => {
    const st = getState();
    if (st.runId !== lastRun) {
      lastRun = st.runId;
      prog = 0;
      done = false;
      angle = 0;
      layout();
    }
    if (st.stage === 'run' && !done) {
      angle += st.omega * dt;
      prog = Math.min(1, prog + dt * 1.2);
      st.onProgress(prog);
      if (prog >= 1) { done = true; st.onFinish(); }
    }
    layout();
  });

  layout();
  // 小器材（φ320 转盘）需要俯一点才看得见盘面，偏航让立轴和游标表都露出侧面
  setTarget(fitCamera(camera, boxOfSubject(scene), { pitch: 30, yaw: 0.34, fill: 0.86, margin: 0.02 }));
  return () => {};
}
