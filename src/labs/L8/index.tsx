// L8 实验：观察电容器充放电。单刀双掷开关切换充/放电，i-t、u-t 双曲线，τ=RC 读取
import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { SceneHost } from '@/engine/SceneHost';
import { buildL8Scene, rcCurrent, rcVoltage, tau, type L8State, type RcMode } from './scene';
import { LabFrame } from '@/labs/_template/LabFrame';
import { Slider, Panel, DataTable } from '@/primitives/Primitives';
import { AnalogMeter } from '@/primitives/Meter';
import { downloadCSV } from '@/utils/fit';
import { useProgressStore } from '@/store/progress';

const E = 6; // 电源电动势 V

interface Pt { t: number; u: number; i: number }

export default function L8Lab() {
  const [mode, setMode] = useState<RcMode>('charge');
  const [R, setR] = useState(2);    // kΩ
  const [C, setC] = useState(500);  // µF
  const [speed, setSpeed] = useState(1);
  const [t, setT] = useState(0);
  const [running, setRunning] = useState(false);
  const [points, setPoints] = useState<Pt[]>([]);
  const [step, setStep] = useState(0);
  const [conclusion, setConclusion] = useState<boolean | null>(null);

  const state: L8State = { mode, E, R, C, t, running };
  const stateRef = useRef<L8State>(state);
  stateRef.current = state;

  const markStep = useProgressStore((s) => s.markStep);
  const recordLab = useProgressStore((s) => s.recordLab);
  const completeLab = useProgressStore((s) => s.completeLab);
  const passQuiz = useProgressStore((s) => s.passQuiz);

  const T = tau(state);
  const u = rcVoltage(state, t);
  const i = rcCurrent(state, t);
  const iMax = (E / (R * 1000)) * 1000; // mA

  const setup = (api: any) => buildL8Scene(api, () => stateRef.current);

  // 时间操控（P4）：按 τ 采样，5τ 停止
  useEffect(() => {
    if (!running) return;
    const stepT = T / 25;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = ((now - last) / 1000) * speed;
      last = now;
      setT((prev) => {
        const nt = prev + dt;
        const idxPrev = Math.floor(prev / stepT);
        const idxNext = Math.floor(nt / stepT);
        if (idxNext > idxPrev) {
          const adds: Pt[] = [];
          for (let k = idxPrev + 1; k <= idxNext; k++) {
            const tk = k * stepT;
            const st = { ...stateRef.current, t: tk };
            adds.push({ t: +tk.toFixed(3), u: +rcVoltage(st, tk).toFixed(3), i: +(rcCurrent(st, tk) * 1000).toFixed(3) });
          }
          setPoints((ps) => [...ps, ...adds]);
        }
        if (nt >= 5 * T) {
          setRunning(false);
          return 5 * T;
        }
        return nt;
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, T, speed]);

  const reset = (m: RcMode = mode) => { setMode(m); setT(0); setPoints([]); setRunning(false); };

  const chartRef = useRef<HTMLDivElement>(null);
  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 48, right: 52, top: 24, bottom: 36 },
    tooltip: { trigger: 'axis' },
    legend: { data: ['u_C/V', 'i/mA'], textStyle: { color: '#8ca0b8', fontSize: 11 }, top: 0 },
    xAxis: { type: 'value', name: 't/s', nameTextStyle: { color: '#8ca0b8' }, axisLabel: { color: '#8ca0b8' }, axisLine: { lineStyle: { color: '#5a6b82' } }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
    yAxis: [
      { type: 'value', name: 'U/V', min: 0, max: E, nameTextStyle: { color: '#8ca0b8' }, axisLabel: { color: '#8ca0b8' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
      { type: 'value', name: 'i/mA', min: -Math.ceil(iMax), max: Math.ceil(iMax), nameTextStyle: { color: '#8ca0b8' }, axisLabel: { color: '#8ca0b8' }, splitLine: { show: false } },
    ],
    series: [
      { name: 'u_C/V', type: 'line', showSymbol: false, data: points.map((p) => [p.t, p.u]), lineStyle: { color: '#4da6ff', width: 2 } },
      { name: 'i/mA', type: 'line', showSymbol: false, yAxisIndex: 1, data: points.map((p) => [p.t, p.i]), lineStyle: { color: '#5eead4', width: 2 } },
    ],
  }), [points, iMax]);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    chart.setOption(option);
    return () => chart.dispose();
  }, [option]);

  const onStep = (idx: number) => { setStep(idx); markStep('L8', ['装配', '测量', '结论'][idx]); };

  const submit = (ok: boolean) => {
    setConclusion(ok);
    if (!ok) return;
    recordLab({
      labId: 'L8', timestamp: Date.now(),
      variables: { E, R, C, tau: +T.toFixed(4), mode },
      dataRows: { t: points.map((p) => p.t), u: points.map((p) => p.u), i: points.map((p) => p.i) },
      conclusionCorrect: true,
    });
    completeLab('L8', true);
    passQuiz('M10');
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
      labId="L8" step={step} onStep={onStep}
      toolbar={
        <>
          {btn(running ? '⏸ 暂停' : '▶ 播放', running, () => { setRunning((r) => !r); if (step < 1) onStep(1); })}
          {btn('↺ 重置', false, () => reset())}
          {btn('0.5×', speed === 0.5, () => setSpeed(0.5))}
          {btn('1×', speed === 1, () => setSpeed(1))}
          {btn('2×', speed === 2, () => setSpeed(2))}
        </>
      }
      stage={<SceneHost setup={setup} />}
      panel={
        <Panel title="参数面板 · RC 回路" right={<span className="en" style={{ color: 'var(--c-text-faint)', fontSize: 13 }}>τ = RC</span>}>
          <div style={{ display: 'flex', gap: 8 }}>
            {btn('① 充电（接电源）', mode === 'charge', () => { reset('charge'); if (step < 1) onStep(1); })}
            {btn('② 放电（短接）', mode === 'discharge', () => { reset('discharge'); if (step < 1) onStep(1); })}
          </div>
          <Slider label="电阻 R" value={R} min={1} max={10} step={0.5} unit=" kΩ" onChange={(v) => { setR(v); setT(0); setPoints([]); setRunning(false); }} />
          <Slider label="电容 C" value={C} min={100} max={1000} step={50} unit=" µF" onChange={(v) => { setC(v); setT(0); setPoints([]); setRunning(false); }} />
          <div style={{ fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            电动势 E = {E} V（给定）<br />
            时间常数 τ = R·C = <b style={{ color: 'var(--c-accent)' }}>{T.toFixed(2)}</b> s<br />
            当前 t = {t.toFixed(2)} s · u_C = <b style={{ color: 'var(--c-accent-2)' }}>{u.toFixed(2)}</b> V · i = <b style={{ color: 'var(--c-accent-2)' }}>{(i * 1000).toFixed(2)}</b> mA
          </div>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            <AnalogMeter label="电压表 V" value={u} max={E} unit="V" decimals={2} size={150} />
            <AnalogMeter label="电流表 mA" value={Math.abs(i) * 1000} max={iMax} unit="mA" decimals={2} size={150} />
          </div>
        </Panel>
      }
      dataArea={
        <Panel
          title="实时数据 · i-t / u-t"
          right={<button onClick={() => downloadCSV('L8_rc.csv', ['t/s', 'u/V', 'i/mA'], points.map((p) => [p.t, p.u, p.i]))} style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--c-text-dim)', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>导出 CSV</button>}
        >
          <DataTable columns={['t/s', 'u/V', 'i/mA']} rows={points.map((p) => [p.t, p.u, p.i])} />
        </Panel>
      }
      chart={
        <Panel title="数据绘图 · i-t / u-t">
          <div ref={chartRef} style={{ width: '100%', height: 280 }} />
        </Panel>
      }
      conclusion={
        <Panel title="结论校验 · 电容器的充放电">
          <div style={{ fontSize: 14, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            对比两条 i-t 曲线：充电时电流由 <b style={{ color: 'var(--c-text)' }}>{iMax.toFixed(2)} mA</b> 逐渐减小到 0，
            电容器电压升到 E；放电时电流反向、电压按指数降到 0。请判断：
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13, borderColor: conclusion === true ? 'var(--c-success)' : 'var(--glass-border)' }} onClick={() => submit(true)}>
              充电电流逐渐减小至零，放电电流反向，均按指数规律变化
            </button>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13, borderColor: conclusion === false ? 'var(--c-error)' : 'var(--glass-border)' }} onClick={() => submit(false)}>
              充放电电流都是恒定不变的
            </button>
          </div>
          {conclusion === true && <div style={{ color: 'var(--c-success)', fontSize: 13 }}>✓ 结论正确。τ=RC 决定快慢：τ 越大曲线越平缓。数据已沉淀，M10 章星系点亮。</div>}
          {conclusion === false && <div style={{ color: 'var(--c-warn)', fontSize: 13 }}>× 再看 i-t 图：电流在 t=0 最大，随后衰减——说明电流不是恒定的。</div>}
        </Panel>
      }
    />
  );
}
