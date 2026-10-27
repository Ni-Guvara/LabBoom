// L6 实验：探究向心力大小与质量、半径、角速度的关系（控制变量法）
import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { SceneHost, type SceneApi } from '@/engine/SceneHost';
import { buildL6Scene, measuredForce, theoryForce, type L6Params, type L6State } from './scene';
import { LabFrame } from '@/labs/_template/LabFrame';
import { Slider, Panel } from '@/primitives/Primitives';
import { downloadCSV } from '@/utils/fit';
import { useProgressStore } from '@/store/progress';

type Stage = 'setup' | 'run' | 'analyze';
const STAGES: Stage[] = ['setup', 'run', 'analyze'];
const STAGE_LABEL: Record<Stage, string> = { setup: '布置', run: '运转', analyze: '分析' };

interface Rec { id: number; mass: number; radius: number; omega: number; ft: number; fm: number; mw2r: number }

export default function L6Lab() {
  const [stage, setStage] = useState<Stage>('setup');
  const [mass, setMass] = useState(0.1);
  const [radius, setRadius] = useState(0.06);
  const [omega, setOmega] = useState(4);
  const [runId, setRunId] = useState(0);
  const [recs, setRecs] = useState<Rec[]>([]);

  const params: L6Params = { mass, radius, omega };

  const markStep = useProgressStore((s) => s.markStep);
  const recordLab = useProgressStore((s) => s.recordLab);
  const completeLab = useProgressStore((s) => s.completeLab);
  const passQuiz = useProgressStore((s) => s.passQuiz);

  const bar = useRef<HTMLDivElement>(null);
  const stateRef = useRef<L6State | null>(null);
  const commitRef = useRef<() => void>(() => {});

  stateRef.current = {
    ...params, stage, runId,
    onProgress: (p) => { if (bar.current) bar.current.style.width = `${(p * 100).toFixed(0)}%`; },
    onFinish: () => commitRef.current(),
  };

  commitRef.current = () => {
    const ft = theoryForce(params);
    const fm = measuredForce(params);
    setRecs((r) => [...r, { id: r.length + 1, mass, radius, omega, ft, fm, mw2r: mass * omega * omega * radius }]);
    setStage('analyze');
  };

  useEffect(() => { markStep('L6', STAGE_LABEL[stage]); }, [stage, markStep]);

  const start = () => {
    setRunId((r) => r + 1);
    setStage('run');
    if (bar.current) bar.current.style.width = '0%';
  };

  const setup = (api: SceneApi) => buildL6Scene(api, () => stateRef.current!);

  const chartEl = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const cur = recs.length ? recs[recs.length - 1] : null;

  useEffect(() => {
    const el = chartEl.current;
    if (!el) return;
    const chart = chartRef.current ?? echarts.init(el);
    chartRef.current = chart;
    const data = recs.map((r) => [+r.mw2r.toFixed(3), +r.fm.toFixed(3)]);
    // 轴上限保留一位小数，避免浮点残差让顶端刻度文字糊成一串
    const max = Math.ceil(Math.max(0.5, ...data.flat()) * 1.15 * 10) / 10;
    const axis = { axisLabel: { color: '#8ca0b8', fontSize: 11 }, axisLine: { lineStyle: { color: '#5a6b82' } }, nameTextStyle: { color: '#8ca0b8', fontSize: 11 } };
    chart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 48, right: 16, top: 26, bottom: 34 },
      xAxis: { type: 'value', name: 'mω²r/N', min: 0, max, ...axis },
      yAxis: { type: 'value', name: 'F 实测/N', nameLocation: 'middle', nameGap: 38, splitNumber: 4, min: 0, max, ...axis, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } } },
      series: [
        { type: 'line', data: [[0, 0], [max, max]], showSymbol: false, lineStyle: { color: '#4da6ff', width: 1.5, type: 'dashed' }, name: '理想 y=x' },
        { type: 'scatter', data, symbolSize: 10, itemStyle: { color: '#5eead4' }, name: '各组' },
      ],
    }, true);
  }, [recs]);

  useEffect(() => () => { chartRef.current?.dispose(); chartRef.current = null; }, []);

  const err = cur ? Math.abs(cur.fm - cur.ft) / Math.max(1e-6, cur.ft) : 1;
  const pass = !!cur && err < 0.05 && recs.length >= 3;

  const submit = () => {
    if (!pass || !cur) return;
    recordLab({
      labId: 'L6', timestamp: Date.now(), variables: { mass, radius, omega },
      dataRows: { mw2r: recs.map((r) => r.mw2r), f: recs.map((r) => r.fm) }, conclusionCorrect: true,
    });
    completeLab('L6', true);
    passQuiz('M5');
  };

  const exportCSV = () => {
    const rows = recs.map((r) => [r.id, r.mass, r.radius, r.omega, +r.mw2r.toFixed(4), +r.fm.toFixed(4)]);
    downloadCSV('L6-向心力.csv', ['组次', 'm/kg', 'r/m', 'ω/(rad/s)', 'mω²r/N', 'F实测/N'], rows);
  };

  const stepIdx = STAGES.indexOf(stage);

  return (
    <LabFrame
      labId="L6"
      step={stepIdx}
      onStep={(i) => { if (i <= stepIdx) setStage(STAGES[i]); }}
      toolbar={<span className="glass" style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12 }}>当前：{STAGE_LABEL[stage]}</span>}
      stage={<SceneHost setup={setup} />}
      panel={
        stage === 'setup' ? (
          <Panel title="布置 · 控制变量" right={<span className="en" style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>F = mω²r</span>}>
            <Slider label="小球质量 m" value={mass} min={0.05} max={0.2} step={0.01} unit=" kg" onChange={setMass} />
            <Slider label="转动半径 r" value={radius} min={0.04} max={0.08} step={0.01} unit=" m" onChange={setRadius} />
            <Slider label="角速度 ω" value={omega} min={2} max={8} step={0.5} unit=" rad/s" onChange={setOmega} />
            <div style={{ fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.9 }}>
              理论向心力 F = <b style={{ color: 'var(--c-accent-2)' }}>{theoryForce(params).toFixed(3)}</b> N<br />
              线速度 v = ωr = {(omega * radius).toFixed(3)} m/s · 周期 T = {(2 * Math.PI / omega).toFixed(2)} s
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-text-faint)', lineHeight: 1.7 }}>
              控制变量：固定两个量、只改一个量，至少做 3 组；弹簧测力计读数比理论值小约 2%（系统差）。
            </div>
            <button className="pill" style={{ alignSelf: 'flex-start', padding: '9px 20px', fontSize: 13 }} onClick={start}>转动手柄 →</button>
          </Panel>
        ) : stage === 'run' ? (
          <Panel title="运转 · 读数稳定中">
            <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div ref={bar} style={{ height: '100%', width: '0%', background: 'var(--c-accent)' }} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.9, marginTop: 8 }}>
              稳定转动后读取弹簧测力计示数；ω = {(omega).toFixed(1)} rad/s，r = {radius.toFixed(2)} m。
            </div>
          </Panel>
        ) : (
          <Panel title={`分析 · 第 ${cur?.id ?? 1} 组`}>
            <div style={{ fontSize: 13.5, color: 'var(--c-text-dim)', lineHeight: 2 }}>
              m = {cur?.mass} kg，r = {cur?.radius} m，ω = {cur?.omega} rad/s<br />
              F 理论 = <b style={{ color: 'var(--c-accent-2)' }}>{cur?.ft.toFixed(3)}</b> N · F 实测 = <b style={{ color: 'var(--c-accent)' }}>{cur?.fm.toFixed(3)}</b> N<br />
              相对误差 {(err * 100).toFixed(2)}%
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="pill" style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={() => setStage('setup')}>再测一组</button>
              <button className="pill" style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={exportCSV}>导出 CSV</button>
            </div>
          </Panel>
        )
      }
      dataArea={
        <Panel title="数据 · F 与 mω²r" right={<span style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>{recs.length} 组</span>}>
          <div style={{ maxHeight: 160, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: 'var(--c-text-faint)', textAlign: 'left' }}>
                  <th style={th}>组</th><th style={th}>m/kg</th><th style={th}>r/m</th><th style={th}>ω</th><th style={th}>mω²r/N</th><th style={th}>F实测/N</th>
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => (
                  <tr key={r.id} style={{ background: cur && cur.id === r.id ? 'rgba(77,166,255,0.16)' : undefined }}>
                    <td style={td}>{r.id}</td><td style={td}>{r.mass}</td><td style={td}>{r.radius}</td><td style={td}>{r.omega}</td>
                    <td style={{ ...td, color: 'var(--c-accent-2)' }}>{r.mw2r.toFixed(3)}</td>
                    <td style={{ ...td, color: 'var(--c-accent)' }}>{r.fm.toFixed(3)}</td>
                  </tr>
                ))}
                {recs.length === 0 && <tr><td colSpan={6} style={{ ...td, color: 'var(--c-text-faint)' }}>尚无数据</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      }
      chart={
        <Panel title="数据绘图 · F 与 mω²r">
          <div ref={chartEl} style={{ width: '100%', height: 280 }} />
          <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>F 与 mω²r 成正比，各点应落在 y = x 上。</div>
        </Panel>
      }
      conclusion={
        <Panel title="结论校验 · 向心力公式">
          <div style={{ fontSize: 13.5, color: 'var(--c-text-dim)', lineHeight: 1.9 }}>
            在质量和半径不变时 F ∝ ω²；角速度与半径不变时 F ∝ m；质量与角速度不变时 F ∝ r，合起来即 F = mω²r。
          </div>
          <div style={{ fontSize: 13, color: pass ? 'var(--c-accent-2)' : 'var(--c-warn)' }}>
            {cur ? `当前判定：${pass ? '通过' : recs.length < 3 ? '需至少 3 组' : '误差偏大'}` : '尚未采集数据'}
          </div>
          <button className="pill" disabled={!pass} style={{ padding: '8px 18px', fontSize: 13, opacity: pass ? 1 : 0.5 }} onClick={submit}>验证：向心力公式</button>
        </Panel>
      }
    />
  );
}

const th: React.CSSProperties = { padding: '4px 6px', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.08)' };
const td: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontVariantNumeric: 'tabular-nums' };
