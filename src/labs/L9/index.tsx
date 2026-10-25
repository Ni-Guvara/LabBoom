// L9 实验：长度的测量及测量工具选用。游标卡尺（0.02 mm）与螺旋测微器（0.01 mm）读数比对
import { useMemo, useRef, useState } from 'react';
import { SceneHost } from '@/engine/SceneHost';
import { buildL9Scene, DIVISION, MAX_OPENING, TOOL_NAME, splitReading, type L9State, type Tool } from './scene';
import { LabFrame } from '@/labs/_template/LabFrame';
import { Slider, Panel, DataTable } from '@/primitives/Primitives';
import { useProgressStore } from '@/store/progress';

// 工件尺寸随机（游标卡尺 5~20 mm，螺旋测微器 1~5 mm）
const randTarget = (tool: Tool) => {
  const d = DIVISION[tool];
  const lo = tool === 'vernier' ? 5 : 1;
  const hi = tool === 'vernier' ? 20 : 5;
  const n = Math.floor((lo + Math.random() * (hi - lo)) / d);
  return +(n * d).toFixed(2);
};

interface Row { no: number; tool: string; div: number; reading: number; guess: number; dev: number }

export default function L9Lab() {
  const [tool, setTool] = useState<Tool>('vernier');
  const [target, setTarget] = useState(() => randTarget('vernier'));
  const [opening, setOpening] = useState(0);
  const [guess, setGuess] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [step, setStep] = useState(0);
  const [conclusion, setConclusion] = useState<boolean | null>(null);

  const stateRef = useRef<L9State>({ tool, opening });
  stateRef.current = { tool, opening };

  const markStep = useProgressStore((s) => s.markStep);
  const recordLab = useProgressStore((s) => s.recordLab);
  const completeLab = useProgressStore((s) => s.completeLab);
  const passQuiz = useProgressStore((s) => s.passQuiz);

  const setup = (api: any) => buildL9Scene(api, () => stateRef.current);

  const div = DIVISION[tool];
  const tol = tool === 'vernier' ? 0.011 : 0.0055;
  const clamped = Math.abs(opening - target) <= tol;
  const split = splitReading(tool, opening);

  const switchTool = (t: Tool) => {
    setTool(t);
    setTarget(randTarget(t));
    setOpening(0);
    setGuess('');
  };

  const doRecord = () => {
    const g = parseFloat(guess);
    if (!Number.isFinite(g)) return;
    const reading = +(split.main + split.index * div).toFixed(2);
    setRows((r) => [...r, { no: r.length + 1, tool: TOOL_NAME[tool], div, reading, guess: g, dev: +(g - reading).toFixed(2) }]);
    if (step < 1) onStep(1);
  };

  const onStep = (i: number) => { setStep(i); markStep('L9', ['装配', '测量', '结论'][i]); };

  const submit = (ok: boolean) => {
    setConclusion(ok);
    if (!ok) return;
    recordLab({
      labId: 'L9', timestamp: Date.now(),
      variables: { tool, division: div },
      dataRows: { tool: rows.map((r) => r.tool), reading: rows.map((r) => r.reading), guess: rows.map((r) => r.guess) },
      conclusionCorrect: true,
    });
    completeLab('L9', true);
    passQuiz('M11');
  };

  const btn = (label: string, active: boolean, onClick: () => void) => (
    <button className="pill" onClick={onClick} style={{
      padding: '7px 16px', fontSize: 13,
      borderColor: active ? 'var(--c-accent)' : 'var(--glass-border)',
      background: active ? 'linear-gradient(180deg, rgba(77,166,255,0.28), rgba(77,166,255,0.1))' : 'transparent',
    }}>{label}</button>
  );

  return (
    <LabFrame
      labId="L9" step={step} onStep={onStep}
      toolbar={<>{btn('游标卡尺 0.02 mm', tool === 'vernier', () => switchTool('vernier'))}{btn('螺旋测微器 0.01 mm', tool === 'micrometer', () => switchTool('micrometer'))}</>}
      stage={<SceneHost setup={setup} />}
      panel={
        <Panel title="参数面板 · 夹紧工件" right={<span className="en" style={{ color: 'var(--c-text-faint)', fontSize: 13 }}>读数 = 主尺 + 分度值 × n</span>}>
          <Slider
            label={tool === 'vernier' ? '移动游标（合拢量爪）' : '旋转微分筒（合拢测杆）'}
            value={opening} min={0} max={MAX_OPENING[tool]} step={div} unit=" mm"
            onChange={(v) => { setOpening(v); if (step < 1) onStep(1); }}
          />
          <div style={{ fontSize: 13, lineHeight: 1.9, color: 'var(--c-text-dim)' }}>
            工具：<b style={{ color: 'var(--c-text)' }}>{TOOL_NAME[tool]}</b>（分度值 {div} mm，量程 {MAX_OPENING[tool]} mm）<br />
            张口宽度：<b style={{ color: 'var(--c-accent)' }}>{opening.toFixed(2)}</b> mm{' '}
            <span style={{ color: clamped ? 'var(--c-success)' : 'var(--c-warn)' }}>{clamped ? '· 已夹紧工件 ✓' : '· 未夹紧'}</span><br />
            刻度拆分：{split.text} mm
          </div>
          <ScaleView tool={tool} opening={opening} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={guess} onChange={(e) => setGuess(e.target.value)} placeholder={`读数（mm，保留 ${div === 0.02 ? 2 : 2} 位）`}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.25)', color: 'var(--c-text)', fontSize: 13 }}
            />
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13 }} onClick={doRecord}>记录 →</button>
          </div>
        </Panel>
      }
      dataArea={
        <Panel title="数据表 · 读数记录与偏差">
          <DataTable columns={['#', '工具', '分度值/mm', '读数/mm', '我的读数/mm', '偏差/mm']} rows={rows.map((r) => [r.no, r.tool, r.div, r.reading, r.guess, r.dev])} />
          {rows.length > 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--c-text-dim)' }}>
              平均偏差 {Math.abs(rows.reduce((s, r) => s + r.dev, 0) / rows.length).toFixed(3)} mm
              <br /><span style={{ color: 'var(--c-text-faint)' }}>读数必须估读到分度值的下一位：0.02 mm 卡尺读到 0.02，千分尺读到 0.01。</span>
            </div>
          )}
        </Panel>
      }
      conclusion={
        <Panel title="结论校验 · 测量工具的选用">
          <div style={{ fontSize: 14, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            同一工件的尺寸，用两种工具测得的末位不同。请判断：
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13, borderColor: conclusion === true ? 'var(--c-success)' : 'var(--glass-border)' }} onClick={() => submit(true)}>
              螺旋测微器分度值更小（0.01 mm），测细金属丝直径应优先选它
            </button>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13, borderColor: conclusion === false ? 'var(--c-error)' : 'var(--glass-border)' }} onClick={() => submit(false)}>
              两者分度值相同，测什么都可以互换
            </button>
          </div>
          {conclusion === true && <div style={{ color: 'var(--c-success)', fontSize: 13 }}>✓ 正确。选用原则：量程够用前提下取分度值更小者。数据已沉淀，M11 章星系点亮。</div>}
          {conclusion === false && <div style={{ color: 'var(--c-warn)', fontSize: 13 }}>× 对比 0.02 与 0.01：分度值越小，读数末位越细，精度越高。</div>}
        </Panel>
      }
    />
  );
}

// 刻度放大镜（P11 点击即解释的静态版本）：主尺 + 游标/微分筒对齐刻度
function ScaleView({ tool, opening }: { tool: Tool; opening: number }) {
  const ticks = useMemo(() => {
    if (tool === 'vernier') {
      const base = Math.floor(opening);
      const n = Math.round((opening - base) / DIVISION.vernier);
      const main = Array.from({ length: 13 }, (_, i) => base - 2 + i);
      const vern = Array.from({ length: 50 }, (_, i) => i);
      return { base, n, main, vern };
    }
    const base = Math.floor(opening / 0.5) * 0.5;
    const n = Math.round((opening - base) / DIVISION.micrometer);
    return { base, n, main: [] as number[], vern: Array.from({ length: 50 }, (_, i) => i) };
  }, [tool, opening]);

  if (tool === 'vernier') {
    return (
      <svg viewBox="0 0 420 116" style={{ width: '100%', height: 'auto' }}>
        <rect x={8} y={26} width={404} height={30} rx={4} fill="rgba(185,198,216,0.14)" stroke="var(--glass-border)" />
        {ticks.main.map((mm) => {
          const x = 22 + (mm - ticks.base + 2) * 30;
          const long = mm % 5 === 0;
          return (
            <g key={mm}>
              <line x1={x} y1={26} x2={x} y2={long ? 46 : 38} stroke="rgba(255,255,255,0.6)" strokeWidth={long ? 1.4 : 0.8} />
              {long && <text x={x} y={22} textAnchor="middle" fontSize={9} fill="#8ca0b8">{mm}</text>}
            </g>
          );
        })}
        <rect x={8} y={64} width={404} height={26} rx={4} fill="rgba(77,166,255,0.12)" stroke="rgba(77,166,255,0.4)" />
        {ticks.vern.map((i) => {
          const x = 22 + (ticks.base - ticks.base + 2) * 30 + (i * 49 / 50) * 30;
          const on = i === ticks.n;
          return (
            <g key={i}>
              <line x1={x} y1={on ? 60 : 64} x2={x} y2={on ? 94 : 88} stroke={on ? '#5eead4' : 'rgba(255,255,255,0.45)'} strokeWidth={on ? 2 : 0.8} />
              {i % 10 === 0 && <text x={x} y={110} textAnchor="middle" fontSize={9} fill={on ? '#5eead4' : '#8ca0b8'}>{i}</text>}
            </g>
          );
        })}
        <text x={22} y={12} fontSize={10} fill="#8ca0b8">主尺 / mm（窗口 ±2 mm）</text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 420 116" style={{ width: '100%', height: 'auto' }}>
      <rect x={8} y={22} width={404} height={28} rx={4} fill="rgba(185,198,216,0.14)" stroke="var(--glass-border)" />
      {Array.from({ length: 17 }, (_, i) => {
        const mm = ticks.base - 4 + i * 0.5;
        const x = 22 + (mm - (ticks.base - 4)) * 24;
        const long = Math.abs(mm - Math.round(mm)) < 1e-6;
        return (
          <g key={mm}>
            <line x1={x} y1={22} x2={x} y2={long ? 44 : 33} stroke="rgba(255,255,255,0.6)" strokeWidth={long ? 1.4 : 0.8} />
            {long && <text x={x} y={18} textAnchor="middle" fontSize={9} fill="#8ca0b8">{mm.toFixed(0)}</text>}
          </g>
        );
      })}
      <text x={22} y={62} fontSize={10} fill="#8ca0b8">微分筒刻度（0.01 mm/格，对齐格 n = {ticks.n}）</text>
      {ticks.vern.map((i) => {
        const x = 22 + i * 7.6;
        const on = i === ticks.n;
        return (
          <g key={i}>
            <line x1={x} y1={on ? 66 : 70} x2={x} y2={on ? 100 : 92} stroke={on ? '#5eead4' : 'rgba(255,255,255,0.45)'} strokeWidth={on ? 2 : 0.8} />
            {i % 10 === 0 && <text x={x} y={112} textAnchor="middle" fontSize={9} fill={on ? '#5eead4' : '#8ca0b8'}>{i}</text>}
          </g>
        );
      })}
    </svg>
  );
}
