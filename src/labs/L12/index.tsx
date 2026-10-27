// L12 实验：测量电池电动势和内阻。多组 U、I → U-I 图线，纵轴截距 = E，斜率绝对值 = r
import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { SceneHost } from '@/engine/SceneHost';
import { buildL12Scene, circuit, EMF_TRUE, R_TRUE, type L12State } from './scene';
import { LabFrame } from '@/labs/_template/LabFrame';
import { Slider, Panel, DataTable } from '@/primitives/Primitives';
import { AnalogMeter } from '@/primitives/Meter';
import { linearFit, downloadCSV } from '@/utils/fit';
import { useProgressStore } from '@/store/progress';

interface Row { R: number; I: number; U: number }

export default function L12Lab() {
  const [R, setR] = useState(8);
  const [rows, setRows] = useState<Row[]>([]);
  const [step, setStep] = useState(0);
  const [conclusion, setConclusion] = useState<boolean | null>(null);

  const { I, U } = circuit(R);
  const state: L12State = { R, I, U };
  const stateRef = useRef<L12State>(state);
  stateRef.current = state;

  const markStep = useProgressStore((s) => s.markStep);
  const recordLab = useProgressStore((s) => s.recordLab);
  const completeLab = useProgressStore((s) => s.completeLab);
  const passQuiz = useProgressStore((s) => s.passQuiz);

  const setup = (api: any) => buildL12Scene(api, () => stateRef.current);

  const fit = useMemo(() => linearFit(rows.map((r) => ({ x: r.I, y: r.U }))), [rows]);
  const Efit = fit ? fit.b : null;
  const rFit = fit ? -fit.a : null;

  const record = () => {
    setRows((r) => (r.some((x) => Math.abs(x.R - R) < 1e-6) ? r : [...r, { R, I: +I.toFixed(4), U: +U.toFixed(3) }]));
    if (step < 1) onStep(1);
  };

  const chartRef = useRef<HTMLDivElement>(null);
  const option = useMemo(() => {
    const pts = rows.slice().sort((a, b) => a.I - b.I).map((r) => [r.I, r.U]);
    const line = fit ? pts.map((p) => [p[0], +(fit.a * p[0] + fit.b).toFixed(3)]) : [];
    return {
      backgroundColor: 'transparent',
      grid: { left: 54, right: 18, top: 22, bottom: 38 },
      xAxis: { type: 'value', name: 'I/A', min: 0, nameTextStyle: { color: '#8ca0b8' }, axisLabel: { color: '#8ca0b8' }, axisLine: { lineStyle: { color: '#5a6b82' } }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
      yAxis: { type: 'value', name: 'U/V', min: 0, max: 1.6, nameTextStyle: { color: '#8ca0b8' }, axisLabel: { color: '#8ca0b8' }, axisLine: { lineStyle: { color: '#5a6b82' } }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
      series: [
        { type: 'scatter', data: pts, symbolSize: 9, itemStyle: { color: '#5eead4' } },
        { type: 'line', data: line, showSymbol: false, lineStyle: { color: '#4da6ff', width: 2 } },
      ],
    };
  }, [rows, fit]);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    chart.setOption(option);
    return () => chart.dispose();
  }, [option]);

  const onStep = (i: number) => { setStep(i); markStep('L12', ['装配', '测量', '结论'][i]); };

  const submit = (ok: boolean) => {
    setConclusion(ok);
    if (!ok) return;
    recordLab({
      labId: 'L12', timestamp: Date.now(),
      variables: { E: Efit ?? 0, r: rFit ?? 0 },
      dataRows: { I: rows.map((r) => r.I), U: rows.map((r) => r.U), R: rows.map((r) => r.R) },
      conclusionCorrect: true,
    });
    completeLab('L12', true);
    passQuiz('M12');
  };

  return (
    <LabFrame
      labId="L12" step={step} onStep={onStep}
      stage={<SceneHost setup={setup} />}
      panel={
        <Panel title="参数面板 · 改变外电阻" right={<span className="en" style={{ color: 'var(--c-text-faint)', fontSize: 13 }}>U = E − Ir</span>}>
          <Slider label="滑动变阻器 R" value={R} min={1} max={20} step={0.5} unit=" Ω" onChange={setR} />
          <div style={{ fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            电流 I = <b style={{ color: 'var(--c-accent)' }}>{I.toFixed(3)}</b> A<br />
            路端电压 U = <b style={{ color: 'var(--c-accent-2)' }}>{U.toFixed(3)}</b> V<br />
            <span style={{ color: 'var(--c-text-faint)' }}>R 越小 → I 越大 → U 越小（内阻分压增大）</span>
          </div>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
            <AnalogMeter label="电流表 A" value={I} max={1.5} unit="A" decimals={3} size={140} />
            <AnalogMeter label="电压表 V" value={U} max={1.6} unit="V" decimals={2} size={140} />
          </div>
          <button className="pill" style={{ alignSelf: 'flex-start', padding: '8px 18px', fontSize: 13 }} onClick={record}>记录此组数据 →</button>
        </Panel>
      }
      dataArea={
        <Panel
          title="实时数据 · U-I 图线"
          right={<button onClick={() => downloadCSV('L12_ui.csv', ['R/Ω', 'I/A', 'U/V'], rows.map((r) => [r.R, r.I, r.U]))} style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: '#8ca0b8', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>导出 CSV</button>}
        >
          <DataTable columns={['R/Ω', 'I/A', 'U/V']} rows={rows.map((r) => [r.R, r.I, r.U])} />
        </Panel>
      }
      chart={
        <Panel title="数据绘图 · U-I 图线">
          <div ref={chartRef} style={{ width: '100%', height: 280 }} />
          {fit && Efit !== null && rFit !== null && (
            <div style={{ fontSize: 12.5, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
              当 I→0（外电路断开）U = 纵轴截距 = <b style={{ color: 'var(--c-accent)' }}>E ≈ {Efit.toFixed(3)} V</b>；
              斜率绝对值 = 内阻 <b style={{ color: 'var(--c-accent-2)' }}>r ≈ {rFit.toFixed(3)} Ω</b>（R²≈{fit.r2.toFixed(3)}）
              <br /><span style={{ color: 'var(--c-text-faint)' }}>真值 E = {EMF_TRUE} V、r = {R_TRUE} Ω；实测略小是电压表分流造成的系统误差。</span>
            </div>
          )}
        </Panel>
      }
      conclusion={
        <Panel title="结论校验 · U-I 图线的物理意义">
          <div style={{ fontSize: 14, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            根据拟合结果，U-I 图线与纵轴的交点、图线的倾斜程度分别代表什么？
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13, borderColor: conclusion === true ? 'var(--c-success)' : 'var(--glass-border)' }} onClick={() => submit(true)}>
              纵轴截距等于电动势 E，斜率绝对值等于内阻 r
            </button>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13, borderColor: conclusion === false ? 'var(--c-error)' : 'var(--glass-border)' }} onClick={() => submit(false)}>
              纵轴截距等于内阻 r，斜率等于电动势 E
            </button>
          </div>
          {conclusion === true && <div style={{ color: 'var(--c-success)', fontSize: 13 }}>✓ 正确。数据已沉淀，M12 章星系点亮。</div>}
          {conclusion === false && <div style={{ color: 'var(--c-warn)', fontSize: 13 }}>× 由 U = E − Ir：I=0 时 U=E（截距），I 增大 U 线性下降，下降快慢即内阻。</div>}
        </Panel>
      }
    />
  );
}
