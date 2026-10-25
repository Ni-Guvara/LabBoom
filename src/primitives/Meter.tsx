// 虚拟仪表原语（设计说明 §4.2）：P6 虚拟仪表（模拟表盘指针 + 超量程打表）、P2 可旋转挡位旋钮
// 电学线 L8/L10/L11/L12 共用：指针按真实量程偏转，超量程视为打表（可撤销）
import { useCallback, useRef, useState } from 'react';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// 极坐标取点：0° 指向右侧，逆时针为正（SVG 的 y 轴向下，故取负）
const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const t = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(t), cy - r * Math.sin(t)];
};

export interface AnalogMeterProps {
  label: string;
  value: number;          // 当前读数（真实物理量，单位由 unit 指定）
  max: number;            // 满量程
  unit?: string;
  decimals?: number;
  majorTicks?: number;    // 主刻度数量
  warn?: number;          // 进入红区的比例（默认 0.85）
  damaged?: boolean;      // 超量程打表
  size?: number;
}

// 表盘：210° → 330° 的开口向上圆弧（270° 为正上方）
export function AnalogMeter({
  label, value, max, unit = '', decimals = 2, majorTicks = 5, warn = 0.85, damaged = false, size = 200,
}: AnalogMeterProps) {
  const cx = 100, cy = 104, r = 76;
  const frac = clamp(max > 0 ? value / max : 0, 0, 1);
  const sweepOf = (f: number) => 210 + 120 * clamp(f, 0, 1);
  const [nx, ny] = polar(cx, cy, r * 0.84, sweepOf(frac));

  const arcPoints = (from: number, to: number) => {
    const pts: string[] = [];
    for (let d = from; d <= to + 1e-6; d += 3) {
      const [x, y] = polar(cx, cy, r, d);
      pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return pts.join(' ');
  };

  const ticks = Array.from({ length: majorTicks + 1 }, (_, i) => {
    const f = i / majorTicks;
    const d = sweepOf(f);
    const [x1, y1] = polar(cx, cy, r * 0.9, d);
    const [x2, y2] = polar(cx, cy, r, d);
    const [lx, ly] = polar(cx, cy, r * 0.72, d);
    return { f, d, x1, y1, x2, y2, lx, ly };
  });

  const over = damaged || frac >= 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg width={size} height={size * 0.66} viewBox="0 0 200 132">
        <polyline points={arcPoints(210, 330)} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1.4} />
        <polyline points={arcPoints(sweepOf(warn), 330)} fill="none" stroke="rgba(255,90,90,0.75)" strokeWidth={2.4} />
        {ticks.map((t) => (
          <g key={t.f}>
            <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="rgba(255,255,255,0.55)" strokeWidth={1} />
            <text x={t.lx} y={t.ly + 3} textAnchor="middle" fontSize={9} fill="#8ca0b8">
              {+(max * t.f).toFixed(2)}
            </text>
          </g>
        ))}
        <circle cx={cx} cy={cy} r={3} fill="#cfe0f5" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={over ? '#ff5a5a' : '#5eead4'} strokeWidth={2.2} strokeLinecap="round" />
        <text x={cx} y={cy - 26} textAnchor="middle" fontSize={10} fill="#8ca0b8">{label}</text>
      </svg>
      <div className="en" style={{ fontSize: 13, color: over ? 'var(--c-error)' : 'var(--c-text)' }}>
        {damaged ? '打表！' : `${value.toFixed(decimals)} ${unit}`}
      </div>
    </div>
  );
}

export interface KnobProps {
  label: string;
  options: string[];
  index: number;
  onChange: (i: number) => void;
  size?: number;
}

// 挡位旋钮：鼠标/手指绕旋钮拖动即换挡（P2 原语），松开后吸附到最近挡位
export function Knob({ label, options, index, onChange, size = 132 }: KnobProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const n = options.length;
  const SWEEP = 270;
  const angleOf = (i: number) => -135 + (n <= 1 ? 0 : (SWEEP * i) / (n - 1));

  const update = useCallback((clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    let deg = (Math.atan2(-dy, dx) * 180) / Math.PI + 90; // 正上方为 0°
    if (deg > 180) deg -= 360;
    const t = clamp((deg + 135) / SWEEP, 0, 1);
    onChange(Math.round(t * (n - 1)));
  }, [n, onChange]);

  const cx = 66, cy = 66, r = 52;
  const [px, py] = polar(cx, cy, r * 0.62, angleOf(index));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 132 132"
        style={{ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        onPointerDown={(e) => { setDragging(true); (e.target as Element).setPointerCapture?.(e.pointerId); update(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (dragging) update(e.clientX, e.clientY); }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <circle cx={cx} cy={cy} r={r} fill="rgba(18,28,46,0.9)" stroke="var(--glass-border)" />
        <circle cx={cx} cy={cy} r={r * 0.78} fill="rgba(11,18,32,0.9)" stroke="rgba(77,166,255,0.3)" />
        {options.map((o, i) => {
          const d = angleOf(i);
          const [x1, y1] = polar(cx, cy, r * 0.82, d);
          const [x2, y2] = polar(cx, cy, r * 0.95, d);
          const [lx, ly] = polar(cx, cy, r * 1.12, d);
          return (
            <g key={o}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={i === index ? '#5eead4' : 'rgba(255,255,255,0.3)'} strokeWidth={i === index ? 2 : 1} />
              <text x={lx} y={ly + 3} textAnchor="middle" fontSize={8.5} fill={i === index ? '#5eead4' : '#8ca0b8'}>{o}</text>
            </g>
          );
        })}
        <line x1={cx} y1={cy} x2={px} y2={py} stroke="var(--c-accent)" strokeWidth={2.6} strokeLinecap="round" />
      </svg>
      <span style={{ fontSize: 12, color: 'var(--c-text-dim)' }}>{label}：<b style={{ color: 'var(--c-accent-2)' }}>{options[index]}</b></span>
    </div>
  );
}
