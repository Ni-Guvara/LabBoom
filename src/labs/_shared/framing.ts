import * as THREE from 'three';

export interface FitOptions {
  /** 相机俯角（度）：0 = 平视，90 = 正俯视。产品图常用 18~32 */
  pitch?: number;
  /** 绕 Y 轴偏航（弧度）：正值表示从右前方看。0 = 正视 */
  yaw?: number;
  /** 主体横向占画幅的比例（0.7~0.88 比较像产品图） */
  fill?: number;
  /** 额外留白（米），给锚点标签腾地方 */
  margin?: number;
}

/**
 * 按器材包围盒自动框选相机，返回需要交给 setTarget 的观察中心。
 *
 * 为什么不用手写 camera.position：六个实验的器材尺寸差 5 倍（0.3 m 转盘 vs
 * 1.2 m 导轨），一旦器材尺寸或锚点位置变动，手写的数字就会漂成「器材偏左下、
 * 台面占半屏」。这里把构图拆成两个可复现的美术参数（俯角、占比），
 * 由包围盒反解相机距离，构图就变成可预测的。
 *
 * 必须在 scene 建立后调用一次；相机 fov / aspect 由 SceneHost 负责。
 */
export function fitCamera(
  camera: THREE.PerspectiveCamera,
  box: THREE.Box3,
  opts: FitOptions = {},
): THREE.Vector3 {
  const { pitch = 26, yaw = 0, fill = 0.82, margin = 0 } = opts;
  const p = THREE.MathUtils.degToRad(pitch);

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const cw = Math.abs(Math.cos(yaw));
  const sw = Math.abs(Math.sin(yaw));

  // 水平方向：偏航后 x/z 都往视线横向贡献投影
  const width = size.x * cw + size.z * sw + margin * 2;
  // 竖直方向：俯角下「高度」按 cos 收缩，「进深」按 sin 展开
  const depth = size.x * sw + size.z * cw;
  const height = size.y * Math.cos(p) + depth * Math.sin(p) + margin * 2;

  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const distW = width / 2 / (tanV * camera.aspect);
  const distH = height / 2 / tanV;
  const dist = Math.max(distW, distH) / Math.max(0.2, fill);

  const dir = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(p),
    Math.sin(p),
    Math.cos(yaw) * Math.cos(p),
  );
  camera.position.copy(center).addScaledVector(dir, dist);
  camera.lookAt(center);
  return center;
}

/** 收集一组对象的世界包围盒 */
export function boxOf(...objs: THREE.Object3D[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const o of objs) {
    o.updateWorldMatrix(true, true);
    box.expandByObject(o);
  }
  return box;
}

/**
 * 收集整个场景的器材包围盒（自动跳过台面与灯光）。
 *
 * 台面比器材大一个量级，算进来构图就变成"拍台子"；而台面尺寸又随俯角变，
 * 于是每个实验都要单独调深度。给台面打 noFrame 标记后，取景只认器材本身。
 */
export function boxOfSubject(scene: THREE.Scene): THREE.Box3 {
  const box = new THREE.Box3();
  for (const child of scene.children) {
    if (child.userData?.noFrame) continue;
    if ((child as unknown as { isLight?: boolean }).isLight) continue;
    box.expandByObject(child);
  }
  return box;
}
