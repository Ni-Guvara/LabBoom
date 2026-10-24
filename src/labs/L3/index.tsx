// L3 实验：探究互成角度的力的合成。验证平行四边形定则
import { useMemo, useRef, useState } from 'react';
import { SceneHost } from '@/engine/SceneHost';
import { buildL3Scene, resultant, type L3State } from './scene';
import { LabFrame } from '@/labs/_template/LabFrame';
import { Slider, Panel, DataTable } from '@/primitives/Primitives';
import { useProgressStore } from '@/store/progress';

interface Row { F1: number; F2: number; theta: number; F合: number; F直测: number; 误差: number }

export default function L3Lab() {
  const [F1, setF1] = useState(3);
  const [F2, setF2] = useState(4);
  const [theta, setTheta] = useState(60);
  const [rows, setRows] = useState<Row[]>([]);
  const [step, setStep] = useState(0);

  const stateRef = useRef<L3State>({ F1, F2, theta });
  stateRef.current = { F1, F2, theta };

  const markStep = useProgressStore((s) => s.markStep);
  const recordLab = useProgressStore((s) => s.recordLab);
  const completeLab = useProgressStore((s) => s.completeLab);
  const passQuiz = useProgressStore((s) => s.passQuiz);

  const setup = (api: any) => buildL3Scene(api, () => stateRef.current);
  const F合 = resultant(stateRef.current);
  const F直测 = useMemo(() => +(F合 + (Math.sin(F1 * F2 * theta) * 0.04)).toFixed(2), [F合, F1, F2, theta]);

  const record = () => setRows((r) => [...r, { F1, F2, theta, F合: +F合.toFixed(2), F直测, 误差: +(Math.abs(F直测 - F合) / F合 * 100).toFixed(1) }]);
  const onStep = (i: number) => { setStep(i); markStep('L3', ['装配', '测量', '结论'][i]); };
  const submit = (ok: boolean) => { if (ok) { recordLab({ labId: 'L3', timestamp: Date.now(), variables: { F1, F2, theta }, dataRows: { F合: rows.map((r) => r.F合), F直测: rows.map((r) => r.F直测) }, conclusionCorrect: true }); completeLab('L3', true); passQuiz('M3'); } };

  return (
    <LabFrame
      labId="L3" step={step} onStep={onStep}
      stage={<SceneHost setup={setup} />}
      panel={
        <Panel title="参数面板 · 分力与夹角" right={<span className="en" style={{ color: 'var(--c-text-faint)', fontSize: 13 }}>F = √(F1²+F2²+2F1F2cosθ)</span>}>
          <Slider label="分力 F1" value={F1} min={1} max={6} step={0.5} unit=" N" onChange={setF1} />
          <Slider label="分力 F2" value={F2} min={1} max={6} step={0.5} unit=" N" onChange={setF2} />
          <Slider label="夹角 θ" value={theta} min={0} max={180} step={5} unit="°" onChange={setTheta} />
          <div style={{ fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            平行四边形计算合力 F合 = <b style={{ color: 'var(--c-accent)' }}>{F合.toFixed(2)}</b> N<br />
            弹簧测力计直接测 F直测 = <b style={{ color: 'var(--c-accent-2)' }}>{F直测}</b> N
          </div>
          <button className="pill" style={{ alignSelf: 'flex-start', padding: '8px 18px', fontSize: 13 }} onClick={() => { record(); if (step < 1) onStep(1); }}>记录此组数据 →</button>
        </Panel>
      }
      dataArea={
        <Panel title="数据表 · 合力对比">
          <DataTable columns={['F1/N', 'F2/N', 'θ/°', 'F合/N', 'F直测/N', '误差/%']} rows={rows.map((r) => [r.F1, r.F2, r.theta, r.F合, r.F直测, r.误差])} />
        </Panel>
      }
      conclusion={
        <Panel title="结论校验 · 力的合成">
          <div style={{ fontSize: 14, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            对比多组数据：平行四边形计算的合力与直接测得合力是否一致（误差范围内）？
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13 }} onClick={() => submit(true)}>一致，验证平行四边形定则</button>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13 }} onClick={() => submit(false)}>不一致</button>
          </div>
        </Panel>
      }
    />
  );
}
