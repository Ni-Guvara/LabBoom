// 光电门的共用规格与数显贴片。
// 模型侧唯一自由参数是立杆顶高度（blender/build_photogate.py 的 --post），
// 其余尺寸全部派生，两边的派生式必须一致：
//   CLAMP_Y = postTop - 0.024   （立杆露出十字夹 24 mm）
//   AXIS_Y  = CLAMP_Y - 0.044   （横臂底面到光轴）
//   DISP_Y  = CLAMP_Y + 0.010   （横臂顶面 = 数显窗玻璃面中心）
import * as THREE from 'three';
import { textPlate } from './instruments';

export interface GateSpec {
  /** glb 资源名（loadOrFallback） */
  model: string;
  /** 立杆顶端高度（m） */
  postTop: number;
  /** 叉口净宽（m） */
  gap: number;
}

/** 气垫导轨款（L1）：光轴 204 mm = 轨面 110 + 挡光片中心 94；叉口 115 mm 夹住 90 mm 导轨 */
export const PHOTOGATE_TALL: GateSpec = { model: 'photogate', postTop: 0.272, gap: 0.115 };
/**
 * 桌面短杆款（L4 长木板）：光轴 98 mm = 板面 20 + 挡光片中心 78。
 * 叉口必须做到 135 mm 把 120 mm 宽的木板夹在两条垂臂之间 —— 按车宽只做 60 mm 时
 * 垂臂会插进木板里。挡光片只有 3 mm 厚，从叉口正中穿过，不受净宽影响。
 */
export const PHOTOGATE_BENCH: GateSpec = { model: 'photogate_bench', postTop: 0.166, gap: 0.135 };

/** 光轴高度（m） */
export const gateAxisY = (s: GateSpec) => s.postTop - 0.068;
/** 数显窗玻璃面中心高度（m） */
export const gateDisplayY = (s: GateSpec) => s.postTop - 0.014;
/** 门头中心相对整机原点的 z 偏移：整机摆到 z = -GATE_HEAD_Z 时叉口落在 z = 0 */
export const GATE_HEAD_Z = 0.085;
/** 横梁顶面斜置数显窗的倾角（rad） */
export const GATE_TILT = 0.3;

/**
 * 给光电门贴一块动态数显，返回 setText。
 * glb 不烘文字，必须运行时贴；程序化回退版自带贴片（userData.setReadout），
 * 再贴一张会双层重影，所以这里先查内建贴片。
 */
export function attachGateReadout(
  gate: THREE.Object3D,
  spec: GateSpec,
): (text: string) => void {
  const builtIn = gate.userData.setReadout as ((t: string) => void) | undefined;
  if (builtIn) return builtIn;

  const readout = textPlate(0.036, 0.012, '--', { fontSize: 92 });
  readout.mesh.rotation.x = -Math.PI / 2 + GATE_TILT;
  // 窗面法线 n = (0, cos17°, sin17°)；玻璃面中心 = 横臂顶，贴片再沿法线抬 0.9~4.5 mm
  const nY = Math.cos(GATE_TILT);
  const nZ = Math.sin(GATE_TILT);
  readout.mesh.position.set(
    0,
    gateDisplayY(spec) + nY * 0.0045,
    GATE_HEAD_Z + 0.004 + nZ * 0.0045,
  );
  gate.add(readout.mesh);
  return (text: string) => readout.setText(text);
}
