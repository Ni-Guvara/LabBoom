// UI 层交互原语（§4.2）：参数滑杆 P2 / 宏观-微观切换 P9 / 模式切换 P10 / 锚定开关 P12 / 步骤条 / 数据表 / 面板
import type { ReactNode } from 'react';

export function Slider({
  label, value, min, max, step = 1, unit = '', onChange, disabled,
}: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: disabled ? 0.5 : 1 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--c-text-dim)' }}>
        {label}
        <span style={{ color: 'var(--c-accent)', fontFamily: 'Georgia, serif' }}>{value}{unit}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--c-accent)' }} />
    </label>
  );
}

export function ViewToggle({ value, onChange }: { value: 'macro' | 'micro'; onChange: (v: 'macro' | 'micro') => void }) {
  return (
    <div style={{ display: 'inline-flex', gap: 4, background: 'rgba(0,0,0,0.25)', borderRadius: 999, padding: 3 }}>
      {(['macro', 'micro'] as const).map((v) => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding: '6px 16px', borderRadius: 999, fontSize: 13, cursor: 'pointer', border: 'none',
          background: value === v ? 'linear-gradient(180deg, rgba(77,166,255,0.3), rgba(77,166,255,0.12))' : 'transparent',
          color: value === v ? 'var(--c-text)' : 'var(--c-text-dim)',
        }}>
          {v === 'macro' ? '宏观视图' : '微观视图'}
        </button>
      ))}
    </div>
  );
}

export function ModeToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--c-text-dim)' }}>
      {label}
      <button onClick={() => onChange(!value)} style={{
        width: 44, height: 24, borderRadius: 999, border: '1px solid var(--glass-border)',
        background: value ? 'rgba(94,234,212,0.4)' : 'rgba(255,255,255,0.08)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
      }}>
        <span style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 18, height: 18, borderRadius: '50%', background: value ? 'var(--c-accent-2)' : '#8ca0b8', transition: 'left 0.2s' }} />
      </button>
    </label>
  );
}

export function AnchorToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--c-text-dim)' }}>
      全部标注
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: 'var(--c-accent)' }} />
    </label>
  );
}

export function StepBar({ steps, current, done, onJump }: {
  steps: string[]; current: number; done: Record<string, boolean>; onJump: (i: number) => void;
}) {
  const progress = Math.round((steps.filter((s) => done[s]).length / steps.length) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '12px 18px', borderTop: '1px solid var(--glass-border)' }}>
      {steps.map((s, i) => {
        const isCurrent = i === current;
        const isDone = done[s];
        const reachable = i <= current || done[s];
        return (
          <button key={s} onClick={() => reachable && onJump(i)} disabled={!reachable} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, fontSize: 13, cursor: reachable ? 'pointer' : 'not-allowed',
            background: isCurrent ? 'linear-gradient(180deg, rgba(77,166,255,0.3), rgba(77,166,255,0.1))' : 'transparent',
            border: `1px solid ${isCurrent ? 'var(--c-accent)' : isDone ? 'rgba(94,234,212,0.4)' : 'var(--glass-border)'}`,
            opacity: reachable ? 1 : 0.4,
          }}>
            <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>{i + 1}</span>{s}
            {isDone && <span style={{ color: 'var(--c-accent-2)' }}>✓</span>}
          </button>
        );
      })}
      <span style={{ marginLeft: 'auto', color: 'var(--c-accent)', fontSize: 13, fontFamily: 'Georgia, serif' }}>{progress}%</span>
    </div>
  );
}

export function DataTable({ columns, rows }: { columns: string[]; rows: (number | string)[][] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr>{columns.map((c) => (
          <th key={c} style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--c-text-dim)', borderBottom: '1px solid var(--glass-border)' }}>{c}</th>
        ))}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((v, j) => (
              <td key={j} style={{ padding: '5px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{v}</td>
            ))}</tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} style={{ padding: 14, color: 'var(--c-text-faint)', textAlign: 'center' }}>暂无数据，调节参数后点「记录」</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}
