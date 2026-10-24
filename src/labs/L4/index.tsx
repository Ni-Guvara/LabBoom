// L4 实验：探究加速度与力、质量的关系（控制变量法 a-F / a-1/M 双图）
import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { SceneHost } from '@/engine/SceneHost';
import { buildL4Scene, accel, type L4State } from './scene';
import { LabFrame } from '@/labs/_template/LabFrame';
import { Slider, ModeToggle, Panel, DataTable } from '@/primitives/Primitives';
import { linearFit } from '@/utils/fit';
import { useProgressStore } from '@/store/progress';

export default function L4Lab() {
  const [mode, setMode] = useState<'aF' | 'aM'>('aF');
  const [m0, setM0] = useState(0.05);
  const [M, setM] = useState(0.4);
  const [friction, setFriction] = useState(true);
  const [rowsF, setRowsF] = useState<{ F: number; a: number }[]>([]);
  const [rowsM, setRowsM] = useState<{ invM: number; a: number }[]>([]);
  const [step, setStep] = useState(0);

  const stateRef = useRef<L4State>({ m0, M, friction });
  stateRef.current = { m0, M, friction };

  const markStep = useProgressStore((s) => s.markStep);
  const recordLab = useProgressStore((s) => s.recordLab);
  const completeLab = useProgressStore((s) => s.completeLab);
  const passQuiz = useProgressStore((s) => s.passQuiz);

  const setup = (api: any) => buildL4Scene(api, () => stateRef.current);
  const a = accel(stateRef.current);
  const F = m0 * 9.8;

  const record = () => {
    if (mode === 'aF') setRowsF((r) => [...r.filter((x) => Math.abs(x.F - +F.toFixed(3)) > 0.001), { F: +F.toFixed(3), a: +a.toFixed(3) }]);
    else setRowsM((r) => [...r.filter((x) => Math.abs(x.invM - +(1 / M).toFixed(3)) > 0.001), { invM: +(1 / M).toFixed(3), a: +a.toFixed(3) }]);
  };

  const fitF = useMemo(() => linearFit(rowsF.map((r) => ({ x: r.F, y: r.a }))), [rowsF]);
  const fitM = useMemo(() => linearFit(rowsM.map((r) => ({ x: r.invM, y: r.a }))), [rowsM]);

  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    const pts = mode === 'aF' ? rowsF.map((r) => [r.F, r.a]) : rowsM.map((r) => [r.invM, r.a]);
    const fit = mode === 'aF' ? fitF : fitM;
    const line = fit ? pts.map((p) => [p[0], +(fit.a * p[0] + fit.b).toFixed(3)]) : [];
    chart.setOption({
      backgroundColor: 'transparent', grid: { left: 50, right: 16, top: 20, bottom: 40 },
      xAxis: { name: mode === 'aF' ? 'F/N' : '1/M /kg⁻¹', nameTextStyle: { color: '#8ca0b8' }, axisLabel: { color: '#8ca0b8' }, axisLine: { lineStyle: { color: '#5a6b82' } } },
      yAxis: { name: 'a/(m/s²)', nameTextStyle: { color: '#8ca0b8' }, axisLabel: { color: '#8ca0b8' }, axisLine: { lineStyle: { color: '#5a6b82' } }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
      series: [
        { type: 'scatter', data: pts, symbolSize: 9, itemStyle: { color: '#5eead4' } },
        { type: 'line', data: line, showSymbol: false, lineStyle: { color: '#4da6ff', width: 2 } },
      ],
    });
    return () => chart.dispose();
  }, [mode, rowsF, rowsM, fitF, fitM]);

  const onStep = (i: number) => { setStep(i); markStep('L4', ['装配', '测量', '结论'][i]); };
  const submit = (ok: boolean) => { if (ok) { recordLab({ labId: 'L4', timestamp: Date.now(), variables: { m0, M, friction }, dataRows: { F: rowsF.map((r) => r.F), a: rowsF.map((r) => r.a) }, conclusionCorrect: true }); completeLab('L4', true); passQuiz('M4'); } };

  const curFit = mode === 'aF' ? fitF : fitM;
  return (
    <LabFrame
      labId="L4" step={step} onStep={onStep}
      toolbar={<><ModeToggle label="控制M改F(a-F)" value={mode === 'aF'} onChange={(v) => setMode(v ? 'aF' : 'aM')} /></>}
      stage={<SceneHost setup={setup} />}
      panel={
        <Panel title="参数面板 · 控制变量" right={<span className="en" style={{ color: 'var(--c-text-faint)', fontSize: 13 }}>a = F/M</span>}>
          {mode === 'aF'
            ? <Slider label="沙桶质量 m0（M 定=0.4kg）" value={m0} min={0.02} max={0.2} step={0.01} unit=" kg" onChange={setM0} />
            : <Slider label="小车质量 M（F 定=m0·g）" value={M} min={0.2} max={1.0} step={0.05} unit=" kg" onChange={setM} />}
          <ModeToggle label="摩擦补偿" value={friction} onChange={setFriction} />
          <div style={{ fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            拉力 F = m0·g = <b style={{ color: 'var(--c-accent)' }}>{F.toFixed(3)}</b> N<br />
            加速度 a = F/M = <b style={{ color: 'var(--c-accent-2)' }}>{a.toFixed(3)}</b> m/s²
          </div>
          <button className="pill" style={{ alignSelf: 'flex-start', padding: '8px 18px', fontSize: 13 }} onClick={() => { record(); if (step < 1) onStep(1); }}>记录此组数据 →</button>
        </Panel>
      }
      dataArea={
        <Panel title={`实时数据 · ${mode === 'aF' ? 'a-F 图' : 'a-1/M 图'}`}>
          <DataTable columns={mode === 'aF' ? ['F/N', 'a/(m/s²)'] : ['1/M', 'a/(m/s²)']} rows={mode === 'aF' ? rowsF.map((r) => [r.F, r.a]) : rowsM.map((r) => [r.invM, r.a])} />
          <div ref={chartRef} style={{ width: '100%', height: 200 }} />
          {curFit && (
            <div style={{ fontSize: 12.5, color: 'var(--c-text-dim)' }}>
              拟合斜率 = <b style={{ color: 'var(--c-accent)' }}>{curFit.a.toFixed(2)}</b>，截距 = {curFit.b.toFixed(3)}
              {!friction && <span style={{ color: 'var(--c-warn)' }}> · 未补偿摩擦 → 截距不为 0</span>}
            </div>
          )}
        </Panel>
      }
      conclusion={
        <Panel title="结论校验 · 牛顿第二定律">
          <div style={{ fontSize: 14, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            a-F 图过原点（M 定）且 a-1/M 图过原点（F 定），即 a∝F 且 a∝1/M → a = F/M。
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13 }} onClick={() => submit(true)}>验证牛顿第二定律</button>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13 }} onClick={() => submit(false)}>未验证</button>
          </div>
        </Panel>
      }
    />
  );
}
