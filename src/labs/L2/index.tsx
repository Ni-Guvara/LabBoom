// L2 实验主组件：装配→测量→结论 全流程闭环
import { useMemo, useState, useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { SceneHost } from '@/engine/SceneHost';
import { buildSpringScene, springExtension, type SpringState } from './scene';
import { LabFrame } from '@/labs/_template/LabFrame';
import { Slider, ViewToggle, Panel, DataTable } from '@/primitives/Primitives';
import { useProgressStore } from '@/store/progress';

interface Row { n: number; F: number; x: number }

export default function L2Lab() {
  const [hooks, setHooks] = useState(0);
  const k = 40;
  const massPerHook = 0.1;
  const g = 9.8;
  const [view, setView] = useState<'macro' | 'micro'>('macro');
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [conclusion, setConclusion] = useState<boolean | null>(null);

  const state: SpringState = { hooks, k, massPerHook, g };
  const stateRef = useRef(state); stateRef.current = state;
  const viewRef = useRef(view); viewRef.current = view;

  const markStep = useProgressStore((s) => s.markStep);
  const recordLab = useProgressStore((s) => s.recordLab);
  const completeLab = useProgressStore((s) => s.completeLab);
  const passQuiz = useProgressStore((s) => s.passQuiz);

  const setup = (api: any) => buildSpringScene(api, () => stateRef.current, () => viewRef.current);

  const F = hooks * massPerHook * g;
  const x = springExtension(state);

  const record = () => {
    if (hooks === 0) return;
    setRows((rs) => [...rs.filter((r) => r.n !== hooks), { n: hooks, F: +F.toFixed(3), x: +x.toFixed(3) }]);
  };

  const fit = useMemo(() => {
    if (rows.length < 2) return null;
    const n = rows.length;
    const sx = rows.reduce((s, r) => s + r.x, 0);
    const sy = rows.reduce((s, r) => s + r.F, 0);
    const sxx = rows.reduce((s, r) => s + r.x * r.x, 0);
    const sxy = rows.reduce((s, r) => s + r.x * r.F, 0);
    const denom = n * sxx - sx * sx;
    if (Math.abs(denom) < 1e-9) return null;
    const a = (n * sxy - sx * sy) / denom;
    const b = (sy - a * sx) / n;
    return { a, b };
  }, [rows]);

  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    const series = rows.map((r) => [r.x, r.F]);
    const line = fit ? rows.map((r) => [r.x, +(fit.a * r.x + fit.b).toFixed(3)]) : [];
    chart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 48, right: 16, top: 20, bottom: 36 },
      xAxis: { name: 'x/m', nameTextStyle: { color: '#8ca0b8' }, axisLine: { lineStyle: { color: '#5a6b82' } }, axisLabel: { color: '#8ca0b8' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
      yAxis: { name: 'F/N', nameTextStyle: { color: '#8ca0b8' }, axisLine: { lineStyle: { color: '#5a6b82' } }, axisLabel: { color: '#8ca0b8' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
      series: [
        { type: 'scatter', data: series, symbolSize: 10, itemStyle: { color: '#5eead4' } },
        { type: 'line', data: line, showSymbol: false, lineStyle: { color: '#4da6ff', width: 2 } },
      ],
    });
    return () => chart.dispose();
  }, [rows, fit]);

  const onFinishStep = (i: number) => {
    setStep(i);
    const steps = ['装配', '测量', '结论'];
    markStep('L2', steps[i]);
  };

  const submitConclusion = (ok: boolean) => {
    setConclusion(ok);
    if (ok) {
      recordLab({ labId: 'L2', timestamp: Date.now(), variables: { hooks, k, massPerHook, g }, dataRows: { F: rows.map((r) => r.F), x: rows.map((r) => r.x) }, conclusionCorrect: true });
      completeLab('L2', true);
      passQuiz('M3');
    }
  };

  return (
    <LabFrame
      labId="L2"
      step={step}
      onStep={onFinishStep}
      toolbar={<ViewToggle value={view} onChange={setView} />}
      stage={<SceneHost setup={setup} />}
      panel={
        <Panel title="参数面板 · 探究变量" right={<span className="en" style={{ color: 'var(--c-text-faint)', fontSize: 13 }}>F = kx</span>}>
          <Slider label="挂钩码数 n" value={hooks} min={0} max={6} step={1} unit=" 个" onChange={(v) => { setHooks(v); if (step < 1) onFinishStep(1); }} />
          <div style={{ fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            每砝码 m = {massPerHook} kg · g = {g} m/s²<br />
            劲度系数 k = {k} N/m（实验给定）<br />
            弹力 F = n·m·g = <b style={{ color: 'var(--c-accent)' }}>{F.toFixed(2)}</b> N<br />
            伸长量 x = F/k = <b style={{ color: 'var(--c-accent-2)' }}>{x.toFixed(3)}</b> m
          </div>
          <button className="pill" style={{ alignSelf: 'flex-start', padding: '8px 18px', fontSize: 13 }} onClick={record} disabled={hooks === 0}>记录此组数据 →</button>
        </Panel>
      }
      dataArea={
        <Panel title="实时数据 · F-x 图像" right={<span className="en-up" style={{ color: 'var(--c-accent-2)' }}>FIT</span>}>
          <DataTable columns={['n', 'F/N', 'x/m']} rows={rows.map((r) => [r.n, r.F, r.x])} />
          <div ref={chartRef} style={{ width: '100%', height: 200 }} />
          {fit && (
            <div style={{ fontSize: 12.5, color: 'var(--c-text-dim)' }}>
              一键拟合：斜率 k ≈ <b style={{ color: 'var(--c-accent)' }}>{fit.a.toFixed(2)}</b> N/m，截距 ≈ {fit.b.toFixed(3)} N
              <br /><span style={{ color: 'var(--c-text-faint)' }}>理想截距应为 0；偏差来自读数误差。</span>
            </div>
          )}
        </Panel>
      }
      conclusion={
        <Panel title="结论校验 · 探究弹力与形变量的关系">
          <div style={{ fontSize: 14, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            根据拟合结果，弹力 F 与伸长量 x 的关系为
            <span className="en" style={{ color: 'var(--c-text)' }}> F ≈ {fit ? fit.a.toFixed(1) : '?'}·x</span>。
            请判断：在弹性限度内，弹力与形变量是否成正比？
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13, borderColor: conclusion === true ? 'var(--c-success)' : 'var(--glass-border)' }} onClick={() => submitConclusion(true)}>是，成正比（胡克定律）</button>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13, borderColor: conclusion === false ? 'var(--c-error)' : 'var(--glass-border)' }} onClick={() => submitConclusion(false)}>否</button>
          </div>
          {conclusion === true && (
            <div style={{ color: 'var(--c-success)', fontSize: 13 }}>✓ 结论正确。数据已沉淀，M3 章星系点亮。</div>
          )}
          {conclusion === false && (
            <div style={{ color: 'var(--c-warn)', fontSize: 13 }}>× 再检查：多组数据是否过原点？拟合截距接近 0 即为正比关系。</div>
          )}
        </Panel>
      }
    />
  );
}
