// L10 实验：金属丝电阻率的测量。伏安法测 R，再用 ρ = πd²R/(4L) 求电阻率；内接/外接系统误差对比
import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { SceneHost } from '@/engine/SceneHost';
import { buildL10Scene, readMeters, wireResistance, RHO_TRUE, R_AMMETER, type Connection, type L10State } from './scene';
import { LabFrame } from '@/labs/_template/LabFrame';
import { Slider, ModeToggle, Panel, DataTable } from '@/primitives/Primitives';
import { AnalogMeter } from '@/primitives/Meter';
import { linearFit, downloadCSV } from '@/utils/fit';
import { useProgressStore } from '@/store/progress';

interface Row { Rs: number; I: number; U: number; R: number }

export default function L10Lab() {
  const [d, setD] = useState(0.5);      // mm
  const [L, setL] = useState(0.8);      // m
  const [Rs, setRs] = useState(5);      // Ω
  const [connection, setConnection] = useState<Connection>('outer');
  const [rows, setRows] = useState<Row[]>([]);
  const [step, setStep] = useState(0);
  const [conclusion, setConclusion] = useState<boolean | null>(null);

  const state: L10State = { d, L, Rs, connection, I: 0, U: 0 };
  const stateRef = useRef<L10State>(state);
  stateRef.current = state;

  const markStep = useProgressStore((s) => s.markStep);
  const recordLab = useProgressStore((s) => s.recordLab);
  const completeLab = useProgressStore((s) => s.completeLab);
  const passQuiz = useProgressStore((s) => s.passQuiz);

  const setup = (api: any) => buildL10Scene(api, () => stateRef.current);

  const Rw = wireResistance({ d, L });
  const { I, U } = readMeters(state);
  const fit = useMemo(() => linearFit(rows.map((r) => ({ x: r.I, y: r.U }))), [rows]);
  const Rmeas = fit ? fit.a : rows.length ? U / I : 0;
  const rho = (Math.PI * (d / 1000) ** 2 * Rmeas) / (4 * L);

  const record = () => {
    setRows((r) => [...r, { Rs, I: +I.toFixed(4), U: +U.toFixed(3), R: +(U / I).toFixed(3) }]);
    if (step < 1) onStep(1);
  };

  const chartRef = useRef<HTMLDivElement>(null);
  const option = useMemo(() => {
    const pts = rows.map((r) => [r.I, r.U]);
    const line = fit ? pts.map((p) => [p[0], +(fit.a * p[0] + fit.b).toFixed(3)]) : [];
    return {
      backgroundColor: 'transparent',
      grid: { left: 52, right: 16, top: 22, bottom: 38 },
      xAxis: { type: 'value', name: 'I/A', nameTextStyle: { color: '#8ca0b8' }, axisLabel: { color: '#8ca0b8' }, axisLine: { lineStyle: { color: '#5a6b82' } }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
      yAxis: { type: 'value', name: 'U/V', nameTextStyle: { color: '#8ca0b8' }, axisLabel: { color: '#8ca0b8' }, axisLine: { lineStyle: { color: '#5a6b82' } }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
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

  const onStep = (i: number) => { setStep(i); markStep('L10', ['装配', '测量', '结论'][i]); };

  const submit = (ok: boolean) => {
    setConclusion(ok);
    if (!ok) return;
    recordLab({
      labId: 'L10', timestamp: Date.now(),
      variables: { d, L, connection },
      dataRows: { I: rows.map((r) => r.I), U: rows.map((r) => r.U), R: rows.map((r) => r.R) },
      conclusionCorrect: true,
    });
    completeLab('L10', true);
    passQuiz('M11');
  };

  const btn = (label: string, active: boolean, onClick: () => void) => (
    <button className="pill" onClick={onClick} style={{
      padding: '7px 16px', fontSize: 13,
      borderColor: active ? 'var(--c-accent)' : 'var(--glass-border)',
      background: active ? 'linear-gradient(180deg, rgba(77,166,255,0.28), rgba(77,166,255,0.1))' : 'transparent',
    }}>{label}</button>
  );

  const rhoErr = ((rho - RHO_TRUE) / RHO_TRUE) * 100;

  return (
    <LabFrame
      labId="L10" step={step} onStep={onStep}
      toolbar={<>{btn('电流表外接', connection === 'outer', () => { setConnection('outer'); setRows([]); })}{btn('电流表内接', connection === 'inner', () => { setConnection('inner'); setRows([]); })}</>}
      stage={<SceneHost setup={setup} />}
      panel={
        <Panel title="参数面板 · 伏安法测电阻" right={<span className="en" style={{ color: 'var(--c-text-faint)', fontSize: 13 }}>ρ = πd²U / 4IL</span>}>
          <Slider label="金属丝直径 d" value={d} min={0.2} max={1} step={0.01} unit=" mm" onChange={(v) => { setD(v); setRows([]); }} />
          <Slider label="接入长度 L" value={L} min={0.2} max={1} step={0.05} unit=" m" onChange={(v) => { setL(v); setRows([]); }} />
          <Slider label="滑动变阻器 R" value={Rs} min={0} max={20} step={0.5} unit=" Ω" onChange={setRs} />
          <ModeToggle label="电压表并接（外接法）" value={connection === 'outer'} onChange={(v) => { setConnection(v ? 'outer' : 'inner'); setRows([]); }} />
          <div style={{ fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            金属丝真实电阻 R = ρ·4L/(πd²) = <b style={{ color: 'var(--c-text)' }}>{Rw.toFixed(2)}</b> Ω<br />
            电流表 I = <b style={{ color: 'var(--c-accent)' }}>{I.toFixed(4)}</b> A · 电压表 U = <b style={{ color: 'var(--c-accent-2)' }}>{U.toFixed(3)}</b> V
          </div>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
            <AnalogMeter label="电流表 A" value={I} max={1.2} unit="A" decimals={3} size={140} />
            <AnalogMeter label="电压表 V" value={U} max={6} unit="V" decimals={2} size={140} />
          </div>
          <button className="pill" style={{ alignSelf: 'flex-start', padding: '8px 18px', fontSize: 13 }} onClick={record}>记录此组数据 →</button>
        </Panel>
      }
      dataArea={
        <Panel
          title="实时数据 · U-I 图线"
          right={<button onClick={() => downloadCSV('L10_ui.csv', ['I/A', 'U/V', 'R/Ω'], rows.map((r) => [r.I, r.U, r.R]))} style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--c-text-dim)', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>导出 CSV</button>}
        >
          <DataTable columns={['R滑/Ω', 'I/A', 'U/V', 'U/I /Ω']} rows={rows.map((r) => [r.Rs, r.I, r.U, r.R])} />
        </Panel>
      }
      chart={
        <Panel title="数据绘图 · U-I 图线">
          <div ref={chartRef} style={{ width: '100%', height: 280 }} />
          {fit && (
            <div style={{ fontSize: 12.5, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
              斜率即 R测 = <b style={{ color: 'var(--c-accent)' }}>{fit.a.toFixed(3)}</b> Ω（R²≈{fit.r2.toFixed(3)}）<br />
              ρ测 = πd²R/(4L) = <b style={{ color: 'var(--c-accent-2)' }}>{rho.toExponential(3)}</b> Ω·m，
              相对真实值 {rhoErr >= 0 ? '+' : ''}{rhoErr.toFixed(1)}%
              <br /><span style={{ color: 'var(--c-text-faint)' }}>{connection === 'inner' ? `内接法把电流表内阻（${R_AMMETER} Ω）算进了 R → 系统偏大` : '外接法电压表分流 → 系统略偏小'}</span>
            </div>
          )}
        </Panel>
      }
      conclusion={
        <Panel title="结论校验 · 接法与系统误差">
          <div style={{ fontSize: 14, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            金属丝电阻较小（几欧姆），与电流表内阻可比。请判断该选哪种接法更准？
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13, borderColor: conclusion === true ? 'var(--c-success)' : 'var(--glass-border)' }} onClick={() => submit(true)}>
              选电流表外接：被测电阻远小于电压表内阻，分流误差可忽略
            </button>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13, borderColor: conclusion === false ? 'var(--c-error)' : 'var(--glass-border)' }} onClick={() => submit(false)}>
              选电流表内接：电流表内阻很小，可以忽略
            </button>
          </div>
          {conclusion === true && <div style={{ color: 'var(--c-success)', fontSize: 13 }}>✓ 正确。小电阻用外接、大电阻用内接。数据已沉淀，M11 章星系点亮。</div>}
          {conclusion === false && <div style={{ color: 'var(--c-warn)', fontSize: 13 }}>× 电流表内阻 0.5 Ω 与几欧的金属丝同量级，内接会把 R 明显偏大。</div>}
        </Panel>
      }
    />
  );
}
