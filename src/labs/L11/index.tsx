// L11 实验：练习使用多用电表。旋钮换挡 → 看指针 → 读数；含错挡打表、欧姆挡倍率选择与调零
import { useMemo, useRef, useState } from 'react';
import { SceneHost } from '@/engine/SceneHost';
import { buildL11Scene, COMPONENTS, GEARS, measure, type Component, type L11State } from './scene';
import { LabFrame } from '@/labs/_template/LabFrame';
import { Panel, DataTable } from '@/primitives/Primitives';
import { AnalogMeter, Knob } from '@/primitives/Meter';
import { useProgressStore } from '@/store/progress';

interface Row { gear: string; reading: string; guess: number; verdict: string }

export default function L11Lab() {
  const [gearIdx, setGearIdx] = useState(1);
  const [compIdx, setCompIdx] = useState(() => Math.floor(Math.random() * COMPONENTS.length));
  const [guess, setGuess] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [step, setStep] = useState(0);
  const [conclusion, setConclusion] = useState<boolean | null>(null);
  const [zeroed, setZeroed] = useState(false);

  const comp: Component = COMPONENTS[compIdx];
  const gear = GEARS[gearIdx];
  const m = measure(gear, comp);

  const stateRef = useRef<L11State>({ gear: gearIdx, frac: m.frac });
  stateRef.current = { gear: gearIdx, frac: m.frac };

  const markStep = useProgressStore((s) => s.markStep);
  const recordLab = useProgressStore((s) => s.recordLab);
  const completeLab = useProgressStore((s) => s.completeLab);
  const passQuiz = useProgressStore((s) => s.passQuiz);

  const setup = (api: any) => buildL11Scene(api, () => stateRef.current);

  const switchGear = (i: number) => { setGearIdx(i); setZeroed(false); if (step < 1) onStep(1); };

  const nextComponent = () => {
    setCompIdx((i) => (i + 1 + Math.floor(Math.random() * (COMPONENTS.length - 1))) % COMPONENTS.length);
    setRows([]);
    setGuess('');
    setZeroed(false);
  };

  const doRecord = () => {
    const g = parseFloat(guess);
    if (!Number.isFinite(g)) return;
    const tol = Math.max(m.reading * 0.03, gear.max / 100);
    const ok = m.valid && Math.abs(g - m.reading) <= tol;
    setRows((r) => [...r, {
      gear: gear.label,
      reading: m.valid ? `${m.reading.toFixed(2)} ${m.unit}` : '—',
      guess: g,
      verdict: ok ? '✓ 正确' : m.valid ? `× 偏差 ${(g - m.reading).toFixed(2)}` : '× 挡位不合适',
    }]);
  };

  const onStep = (i: number) => { setStep(i); markStep('L11', ['装配', '测量', '结论'][i]); };

  const submit = (ok: boolean) => {
    setConclusion(ok);
    if (!ok) return;
    recordLab({
      labId: 'L11', timestamp: Date.now(),
      variables: { component: comp.label, gear: gear.label },
      dataRows: { gear: rows.map((r) => r.gear), guess: rows.map((r) => r.guess) },
      conclusionCorrect: true,
    });
    completeLab('L11', true);
    passQuiz('M11');
  };

  const btn = (label: string, active: boolean, onClick: () => void) => (
    <button className="pill" onClick={onClick} style={{
      padding: '7px 16px', fontSize: 13,
      borderColor: active ? 'var(--c-accent)' : 'var(--glass-border)',
      background: active ? 'linear-gradient(180deg, rgba(77,166,255,0.28), rgba(77,166,255,0.1))' : 'transparent',
    }}>{label}</button>
  );

  const ohmGear = gear.kind === 'R';
  const damaged = !m.valid && m.note.includes('打表');
  const meterValue = useMemo(() => (m.valid ? m.reading : gear.max), [m, gear.max]);

  return (
    <LabFrame
      labId="L11" step={step} onStep={onStep}
      toolbar={<>{btn('换一个待测元件', false, nextComponent)}{ohmGear && btn('欧姆挡调零', zeroed, () => { setZeroed(true); if (step < 1) onStep(1); })}</>}
      stage={<SceneHost setup={setup} />}
      panel={
        <Panel title="参数面板 · 挡位选择" right={<span className="en" style={{ color: 'var(--c-text-faint)', fontSize: 13 }}>R = U/I</span>}>
          <div style={{ fontSize: 13, color: 'var(--c-text-dim)' }}>
            待测元件：<b style={{ color: 'var(--c-accent-2)' }}>{comp.label}</b>
            <span style={{ color: 'var(--c-text-faint)' }}>（真值仅用于判分，读数请看表盘）</span>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
            <Knob label="挡位" options={GEARS.map((g) => g.label)} index={gearIdx} onChange={switchGear} size={150} />
            <AnalogMeter
              label={`表盘 · ${gear.label}`} value={meterValue}
              max={gear.max} unit={m.unit} decimals={ohmGear ? 0 : 2}
              damaged={damaged} size={165}
            />
          </div>
          {m.note && (
            <div style={{ fontSize: 12.5, color: m.valid ? 'var(--c-text-dim)' : 'var(--c-warn)' }}>
              {m.note}{ohmGear && !zeroed ? '（提示：先短接表笔调零）' : ''}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={guess} onChange={(e) => setGuess(e.target.value)} placeholder={`读数（${m.unit}）`}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.25)', color: 'var(--c-text)', fontSize: 13 }}
            />
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13 }} onClick={doRecord}>记录 →</button>
          </div>
        </Panel>
      }
      dataArea={
        <Panel title="数据表 · 挡位与读数">
          <DataTable columns={['挡位', '表盘示数', '我的读数', '判定']} rows={rows.map((r) => [r.gear, r.reading, r.guess, r.verdict])} />
          <div style={{ fontSize: 12.5, color: 'var(--c-text-faint)', lineHeight: 1.8 }}>
            读数规则：指针应落在满刻度的 1/3 以上；欧姆挡刻度不均匀，越靠右越密、精度越低。
          </div>
        </Panel>
      }
      conclusion={
        <Panel title="结论校验 · 多用电表的使用">
          <div style={{ fontSize: 14, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            刚才换挡时的现象说明了什么？请选择正确说法：
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13, borderColor: conclusion === true ? 'var(--c-success)' : 'var(--glass-border)' }} onClick={() => submit(true)}>
              选挡要使指针偏转尽可能大（落在 1/3 刻度以上）；欧姆挡换挡必须重新调零，且不能测带电体
            </button>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13, borderColor: conclusion === false ? 'var(--c-error)' : 'var(--glass-border)' }} onClick={() => submit(false)}>
              任何挡位都能测任意元件，读数都一样
            </button>
          </div>
          {conclusion === true && <div style={{ color: 'var(--c-success)', fontSize: 13 }}>✓ 正确。数据已沉淀，M11 章星系点亮。</div>}
          {conclusion === false && <div style={{ color: 'var(--c-warn)', fontSize: 13 }}>× 试试点电压挡测电阻——指针根本不动；点欧姆挡测电池还会打表。</div>}
        </Panel>
      }
    />
  );
}
