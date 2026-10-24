// L6 实验：探究向心力与半径等的关系。F = mω²r
import { useRef, useState } from 'react';
import { SceneHost } from '@/engine/SceneHost';
import { buildL6Scene, centripetal, type L6State } from './scene';
import { LabFrame } from '@/labs/_template/LabFrame';
import { Slider, Panel, DataTable } from '@/primitives/Primitives';
import { useProgressStore } from '@/store/progress';

interface Row { m: number; omega: number; r: number; F: number }

export default function L6Lab() {
  const [m, setM] = useState(0.2);
  const [omega, setOmega] = useState(4);
  const [r, setR] = useState(0.3);
  const [rows, setRows] = useState<Row[]>([]);
  const [step, setStep] = useState(0);

  const stateRef = useRef<L6State>({ m, omega, r });
  stateRef.current = { m, omega, r };

  const markStep = useProgressStore((s) => s.markStep);
  const recordLab = useProgressStore((s) => s.recordLab);
  const completeLab = useProgressStore((s) => s.completeLab);
  const passQuiz = useProgressStore((s) => s.passQuiz);

  const setup = (api: any) => buildL6Scene(api, () => stateRef.current);
  const F = centripetal(stateRef.current);

  const record = () => setRows((r2) => [...r2, { m, omega, r, F: +F.toFixed(3) }]);
  const onStep = (i: number) => { setStep(i); markStep('L6', ['装配', '测量', '结论'][i]); };
  const submit = (ok: boolean) => { if (ok) { recordLab({ labId: 'L6', timestamp: Date.now(), variables: { m, omega, r }, dataRows: { F: rows.map((r2) => r2.F) }, conclusionCorrect: true }); completeLab('L6', true); passQuiz('M6'); } };

  return (
    <LabFrame
      labId="L6" step={step} onStep={onStep}
      stage={<SceneHost setup={setup} />}
      panel={
        <Panel title="参数面板 · 向心力" right={<span className="en" style={{ color: 'var(--c-text-faint)', fontSize: 13 }}>F = mω²r</span>}>
          <Slider label="质量 m" value={m} min={0.05} max={0.5} step={0.05} unit=" kg" onChange={setM} />
          <Slider label="角速度 ω" value={omega} min={1} max={10} step={0.5} unit=" rad/s" onChange={setOmega} />
          <Slider label="半径 r" value={r} min={0.1} max={0.6} step={0.05} unit=" m" onChange={setR} />
          <div style={{ fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            向心力 F = mω²r = <b style={{ color: 'var(--c-accent)' }}>{F.toFixed(3)}</b> N
          </div>
          <button className="pill" style={{ alignSelf: 'flex-start', padding: '8px 18px', fontSize: 13 }} onClick={() => { record(); if (step < 1) onStep(1); }}>记录此组数据 →</button>
        </Panel>
      }
      dataArea={
        <Panel title="数据表 · 控制变量">
          <DataTable columns={['m/kg', 'ω/(rad/s)', 'r/m', 'F/N']} rows={rows.map((r2) => [r2.m, r2.omega, r2.r, r2.F])} />
        </Panel>
      }
      conclusion={
        <Panel title="结论校验 · 向心力公式">
          <div style={{ fontSize: 14, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            分别控制变量：F 与 m、ω²、r 均成正比 → F = mω²r。
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13 }} onClick={() => submit(true)}>验证 F = mω²r</button>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13 }} onClick={() => submit(false)}>未验证</button>
          </div>
        </Panel>
      }
    />
  );
}
