// L1 实验：装配→测量→结论。气垫导轨匀加速，纸带点迹算瞬时速度，v-t 拟合斜率= a
import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { SceneHost } from '@/engine/SceneHost';
import { buildL1Scene, l1Position, l1Velocity, type L1State } from './scene';
import { LabFrame } from '@/labs/_template/LabFrame';
import { Slider, Panel, DataTable } from '@/primitives/Primitives';
import { linearFit, downloadCSV } from '@/utils/fit';
import { useProgressStore } from '@/store/progress';

const DT = 0.1;

export default function L1Lab() {
  const [a, setA] = useState(0.5);
  const [v0, setV0] = useState(0.2);
  const [t, setT] = useState(0);
  const [running, setRunning] = useState(false);
  const [points, setPoints] = useState<{ t: number; x: number; v: number }[]>([]);
  const [step, setStep] = useState(0);

  const stateRef = useRef<L1State>({ a, v0, t, running, points });
  stateRef.current = { a, v0, t, running, points };

  const markStep = useProgressStore((s) => s.markStep);
  const recordLab = useProgressStore((s) => s.recordLab);
  const completeLab = useProgressStore((s) => s.completeLab);
  const passQuiz = useProgressStore((s) => s.passQuiz);

  useEffect(() => {
    if (!running) return;
    let raf = 0; let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = (now - last) / 1000; last = now;
      setT((prev) => {
        const nt = prev + dt;
        const idx = Math.floor(nt / DT);
        const prevIdx = Math.floor(prev / DT);
        if (idx > prevIdx && nt < 8) {
          const vx = l1Velocity(stateRef.current, idx * DT);
          const x = l1Position({ ...stateRef.current, t: idx * DT });
          setPoints((ps) => [...ps, { t: +(idx * DT).toFixed(2), x: +x.toFixed(3), v: +vx.toFixed(3) }]);
        }
        if (nt >= 8) { setRunning(false); return prev; }
        return nt;
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const setup = (api: any) => buildL1Scene(api, () => stateRef.current);

  const fit = useMemo(() => linearFit(points.map((p) => ({ x: p.t, y: p.v }))), [points]);

  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    const line = fit ? points.map((p) => [p.t, +(fit.a * p.t + fit.b).toFixed(3)]) : [];
    chart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 48, right: 16, top: 20, bottom: 36 },
      xAxis: { name: 't/s', nameTextStyle: { color: '#8ca0b8' }, axisLabel: { color: '#8ca0b8' }, axisLine: { lineStyle: { color: '#5a6b82' } }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
      yAxis: { name: 'v/(m/s)', nameTextStyle: { color: '#8ca0b8' }, axisLabel: { color: '#8ca0b8' }, axisLine: { lineStyle: { color: '#5a6b82' } }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
      series: [
        { type: 'scatter', data: points.map((p) => [p.t, p.v]), symbolSize: 9, itemStyle: { color: '#5eead4' } },
        { type: 'line', data: line, showSymbol: false, lineStyle: { color: '#4da6ff', width: 2 } },
      ],
    });
    return () => chart.dispose();
  }, [points, fit]);

  const reset = () => { setT(0); setPoints([]); setRunning(false); };
  const onStep = (i: number) => { setStep(i); markStep('L1', ['装配', '测量', '结论'][i]); };
  const submit = (ok: boolean) => {
    if (ok) {
      recordLab({ labId: 'L1', timestamp: Date.now(), variables: { a, v0 }, dataRows: { t: points.map((p) => p.t), v: points.map((p) => p.v) }, conclusionCorrect: true });
      completeLab('L1', true);
      passQuiz('M2');
    }
  };

  return (
    <LabFrame
      labId="L1" step={step} onStep={onStep}
      toolbar={<button className="pill" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => { setRunning((r) => !r); if (step < 1) onStep(1); }}>{running ? '⏸ 暂停' : '▶ 播放'}</button>}
      stage={<SceneHost setup={setup} />}
      panel={
        <Panel title="参数面板 · 时间操控" right={<span className="en" style={{ color: 'var(--c-text-faint)', fontSize: 13 }}>v = v0 + at</span>}>
          <Slider label="加速度 a" value={a} min={0} max={2} step={0.05} unit=" m/s²" onChange={(v) => { setA(v); reset(); }} />
          <Slider label="初速度 v0" value={v0} min={0} max={1} step={0.05} unit=" m/s" onChange={(v) => { setV0(v); reset(); }} />
          <div style={{ fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            当前时间 t = <b style={{ color: 'var(--c-accent)' }}>{t.toFixed(2)}</b> s<br />
            小车位置 x = <b style={{ color: 'var(--c-accent-2)' }}>{l1Position(stateRef.current).toFixed(2)}</b> m<br />
            瞬时速度 v = <b style={{ color: 'var(--c-accent-2)' }}>{l1Velocity(stateRef.current, t).toFixed(2)}</b> m/s
          </div>
          <button className="pill" style={{ alignSelf: 'flex-start', padding: '8px 18px', fontSize: 13 }} onClick={reset}>↺ 重置</button>
        </Panel>
      }
      dataArea={
        <Panel title="实时数据 · v-t 图像" right={<button onClick={() => downloadCSV('L1_vt.csv', ['t/s', 'v/(m/s)'], points.map((p) => [p.t, p.v]))} style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--c-text-dim)', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>导出 CSV</button>}>
          <DataTable columns={['t/s', 'x/m', 'v/(m/s)']} rows={points.map((p) => [p.t, p.x, p.v])} />
          <div ref={chartRef} style={{ width: '100%', height: 200 }} />
          {fit && (
            <div style={{ fontSize: 12.5, color: 'var(--c-text-dim)' }}>
              一键拟合：斜率 a ≈ <b style={{ color: 'var(--c-accent)' }}>{fit.a.toFixed(2)}</b> m/s²，截距 v0 ≈ {fit.b.toFixed(2)} m/s，R² ≈ {fit.r2.toFixed(3)}
            </div>
          )}
        </Panel>
      }
      conclusion={
        <Panel title="结论校验 · 速度与时间的关系">
          <div style={{ fontSize: 14, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            v-t 图拟合得 <span className="en">v = {fit ? fit.a.toFixed(2) : '?'}·t + {fit ? fit.b.toFixed(2) : '?'}</span>。匀变速直线运动速度与时间成什么关系？
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13 }} onClick={() => submit(true)}>线性关系 v = v0 + at</button>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13 }} onClick={() => submit(false)}>非线性</button>
          </div>
        </Panel>
      }
    />
  );
}
