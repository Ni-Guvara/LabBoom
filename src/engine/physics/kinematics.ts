// 通用一维运动求解器（P2-a 物理自洽地基 / P5 符号模块复用同一内核）
// 原则：位置、速度、纸带点距、光电门读数全部由同一条轨迹派生，杜绝三套数据。
// 单位统一：m, s, m/s, m/s²（场景 1 unit = 1 m）

export interface Sample {
  t: number;
  x: number; // 位移 m
  v: number; // m/s
  a: number; // m/s²
}

export interface MotionModel {
  /** 返回该时刻的加速度（由受力决定，而非关键帧） */
  accel(s: { t: number; x: number; v: number }): number;
}

export interface SimOptions {
  tEnd: number;
  dt?: number;
  x0?: number;
  v0?: number;
  stop?: (s: Sample) => boolean;
}

/** 半隐式欧拉积分：对匀变速运动精确，且不会像显式欧拉那样发散 */
export function simulate(model: MotionModel, opts: SimOptions): Sample[] {
  const dt = opts.dt ?? 0.0005;
  const out: Sample[] = [];
  let t = 0;
  let x = opts.x0 ?? 0;
  let v = opts.v0 ?? 0;
  let a = model.accel({ t, x, v });
  out.push({ t, x, v, a });

  const steps = Math.max(1, Math.ceil(opts.tEnd / dt));
  for (let i = 0; i < steps; i++) {
    v += a * dt;
    x += v * dt;
    t += dt;
    a = model.accel({ t, x, v });
    const s = { t: +t.toFixed(6), x, v, a };
    out.push(s);
    if (opts.stop?.(s)) break;
  }
  return out;
}

export function duration(samples: Sample[]): number {
  return samples.length ? samples[samples.length - 1].t : 0;
}

/** 任意时刻采样（线性插值）：动画、纸带、传感器共用一个入口 */
export function sampleAt(samples: Sample[], t: number): Sample {
  if (!samples.length) return { t, x: 0, v: 0, a: 0 };
  const end = samples[samples.length - 1];
  if (t <= 0) return samples[0];
  if (t >= end.t) return end;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const k = (t - a.t) / (b.t - a.t || 1);
  return { t, x: a.x + (b.x - a.x) * k, v: a.v + (b.v - a.v) * k, a: a.a + (b.a - a.a) * k };
}

/** 纸带点：电磁打点计时器 50 Hz → 每 0.02 s 一点，点数由同一条轨迹决定 */
export function tapePoints(samples: Sample[], interval = 0.02): Sample[] {
  const end = duration(samples);
  const pts: Sample[] = [];
  for (let i = 0; i * interval <= end + 1e-9; i++) pts.push(sampleAt(samples, i * interval));
  return pts;
}

/** 计数点：每 5 个打点间隔取 1 个（0.1 s），用于逐差/描点作图 */
export function countingPoints(samples: Sample[], every = 5, interval = 0.02): Sample[] {
  return tapePoints(samples, interval).filter((_, i) => i % every === 0);
}

/** 中间时刻瞬时速度：v_n = (x_{n+1} − x_{n−1}) / 2Δt（真实实验里学生就是这么算的） */
export function tapeVelocities(points: Sample[], interval: number): number[] {
  const n = points.length;
  return points.map((_, i) => {
    if (i === 0) return n > 1 ? (points[1].x - points[0].x) / interval : 0;
    if (i === n - 1) return (points[n - 1].x - points[n - 2].x) / interval;
    return (points[i + 1].x - points[i - 1].x) / (2 * interval);
  });
}

export interface Gate {
  id: string;
  /** 挡光起点（挡光片前沿到达光电门的位置） */
  x: number;
  /** 挡光片沿运动方向的宽度 m */
  flagWidth: number;
}

export interface GateReading {
  id: string;
  tIn: number;
  tOut: number;
  /** 挡光时间 Δt，单位 s */
  blockTime: number;
  /** 光电门读数 v = d/Δt */
  v: number;
}

function crossTime(samples: Sample[], target: number): number | null {
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (a.x <= target && b.x >= target && b.x > a.x) {
      const k = (target - a.x) / (b.x - a.x);
      return a.t + (b.t - a.t) * k;
    }
  }
  return null;
}

/** 光电门读数：由轨迹推出挡光时间，而不是另算一套速度 */
export function gateReadings(samples: Sample[], gates: Gate[]): GateReading[] {
  const out: GateReading[] = [];
  for (const g of gates) {
    const tIn = crossTime(samples, g.x);
    const tOut = crossTime(samples, g.x + g.flagWidth);
    if (tIn == null || tOut == null || tOut - tIn <= 0) continue;
    out.push({ id: g.id, tIn, tOut, blockTime: tOut - tIn, v: g.flagWidth / (tOut - tIn) });
  }
  return out;
}
