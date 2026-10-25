// L7 实验：验证机械能守恒定律（重锤自由下落 + 双光电门）
// 三态：布置（门位/质量）→ 运行（释放）→ 分析（ΔEp vs ΔEk 与系统误差）
import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { SceneHost, type SceneApi } from '@/engine/SceneHost';
import { G, buildL7Scene, buildSamples, measure, deltaH, GATE1_Y, RELEASE_Y, type L7Params, type L7State } from './scene';
import { LabFrame } from '@/labs/_template/LabFrame';
import { Slider, Panel } from '@/primitives/Primitives';
import { downloadCSV } from '@/utils/fit';
import { duration } from '@/engine/physics/kinematics';
import { useProgressStore } from '@/store/progress';

type Stage = 'setup' | 'run' | 'analyze';
const STAGES: Stage[] = ['setup', 'run', 'analyze'];
const STAGE_LABEL: Record<Stage, string> = { setup: '布置', run: '运行', analyze: '分析' };

interface Rec {
  id: number; mass: number; gate2Y: number; shadeWidth: number;
  dh: number; v1: number; v2: number; dt1: number; dt2: number;
  ep: number; ek: number; err: number;
}

export default function L7Lab() {
  const [stage, setStage] = useState<Stage>('setup');
  const [mass, setMass] = useState(0.2);
  const [gate2Y, setGate2] = useState(0.25);
  const [shadeWidth, setShade] = useState(0.02);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [stepToken, setStepToken] = useState(0);
  const [runId, setRunId] = useState(0);
  const [recs, setRecs] = useState<Rec[]>([]);

  const params: L7Params = { mass, gate2Y, shadeWidth };
  const sim = useMemo(() => buildSamples({ mass, gate2Y, shadeWidth }), [mass, gate2Y, shadeWidth]);
  const tEnd = duration(sim);

  const markStep = useProgressStore((s) => s.markStep);
  const recordLab = useProgressStore((s) => s.recordLab);
  const completeLab = useProgressStore((s) => s.completeLab);
  const passQuiz = useProgressStore((s) => s.passQuiz);

  const readout = useRef<HTMLSpanElement>(null);
  const stateRef = useRef<L7State | null>(null);
  const commitRef = useRef<() => void>(() => {});

  stateRef.current = {
    ...params, stage, speed, paused, stepToken, runId, samples: sim,
    onProgress: (t) => { if (readout.current) readout.current.textContent = `${t.toFixed(3)} s`; },
    onFinish: () => commitRef.current(),
  };

  commitRef.current = () => {
    const g = measure(params, sim);
    if (!g) { setStage('setup'); return; }
    const dh = deltaH(params);
    const ep = params.mass * G * dh;
    const ek = 0.5 * params.mass * (g.v2 * g.v2 - g.v1 * g.v1);
    setRecs((r) => [...r, {
      id: r.length + 1, mass: params.mass, gate2Y: params.gate2Y, shadeWidth: params.shadeWidth,
      dh, v1: g.v1, v2: g.v2, dt1: g.dt1, dt2: g.dt2, ep, ek, err: Math.abs(ek - ep) / ep,
    }]);
    setStage('analyze');
  };

  useEffect(() => { markStep('L7', STAGE_LABEL[stage]); }, [stage, markStep]);

  const start = () => {
    setPaused(false); setStepToken(0); setRunId((r) => r + 1); setStage('run');
    if (readout.current) readout.current.textContent = '0.000 s';
  };

  const setup = (api: SceneApi) => buildL7Scene(api, () => stateRef.current!);

  const chartEl = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const cur = recs.length ? recs[recs.length - 1] : null;

  useEffect(() => {
    const el = chartEl.current;
    if (!el) return;
    const chart = chartRef.current ?? echarts.init(el);
    chartRef.current = chart;
    const data = recs.map((r) => [+r.ep.toFixed(3), +r.ek.toFixed(3)]);
    // 轴上限保留一位小数，避免浮点残差让顶端刻度文字糊成一串
    const max = Math.ceil(Math.max(0.3, ...data.flat()) * 10) / 10;
    const axis = { axisLabel: { color: '#8ca0b8', fontSize: 11 }, axisLine: { lineStyle: { color: '#5a6b82' } }, nameTextStyle: { color: '#8ca0b8', fontSize: 11 } };
    chart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 48, right: 16, top: 26, bottom: 34 },
      xAxis: { type: 'value', name: 'ΔEp/J', min: 0, max, ...axis },
      yAxis: { type: 'value', name: 'ΔEk/J', nameLocation: 'middle', nameGap: 38, splitNumber: 4, min: 0, max, ...axis, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } } },
      series: [
        { type: 'line', data: [[0, 0], [max, max]], showSymbol: false, lineStyle: { color: '#4da6ff', width: 1.5, type: 'dashed' }, name: '理想 y=x' },
        { type: 'scatter', data, symbolSize: 10, itemStyle: { color: '#5eead4' }, name: '测量组' },
      ],
    }, true);
  }, [recs]);

  useEffect(() => () => { chartRef.current?.dispose(); chartRef.current = null; }, []);

  const pass = !!cur && cur.err < 0.03 && recs.length >= 2;

  const submit = () => {
    if (!pass || !cur) return;
    recordLab({
      labId: 'L7', timestamp: Date.now(), variables: { mass, gate2Y, shadeWidth },
      dataRows: { ep: recs.map((r) => r.ep), ek: recs.map((r) => r.ek) }, conclusionCorrect: true,
    });
    completeLab('L7', true);
    passQuiz('M8');
  };

  const exportCSV = () => {
    const rows = recs.map((r) => [r.id, +r.dh.toFixed(3), +r.v1.toFixed(3), +r.v2.toFixed(3), +r.ep.toFixed(4), +r.ek.toFixed(4), +(r.err * 100).toFixed(2)]);
    downloadCSV('L7-机械能守恒.csv', ['组次', 'Δh/m', 'v1/(m/s)', 'v2/(m/s)', 'ΔEp/J', 'ΔEk/J', '误差/%'], rows);
  };

  const stepIdx = STAGES.indexOf(stage);

  return (
    <LabFrame
      labId="L7"
      step={stepIdx}
      onStep={(i) => { if (i <= stepIdx) setStage(STAGES[i]); }}
      toolbar={
        <>
          <span className="glass" style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12 }}>当前：{STAGE_LABEL[stage]}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0.1, 1, 2].map((v) => (
              <button key={v} className="pill" onClick={() => setSpeed(v)} style={{ padding: '6px 12px', fontSize: 12, opacity: speed === v ? 1 : 0.55 }}>{v}×</button>
            ))}
            {stage === 'run' && (
              <>
                <button className="pill" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setPaused((p) => !p)}>{paused ? '继续' : '暂停'}</button>
                <button className="pill" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setStepToken((t) => t + 1)}>单步 0.01s</button>
              </>
            )}
          </div>
        </>
      }
      stage={<SceneHost setup={setup} />}
      panel={
        stage === 'setup' ? (
          <Panel title="布置 · 门位与重锤" right={<span className="en" style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>ΔEp ≟ ΔEk</span>}>
            <Slider label="重锤质量 m" value={mass} min={0.1} max={0.5} step={0.05} unit=" kg" onChange={setMass} />
            <Slider label="下光电门高度" value={gate2Y} min={0.1} max={0.4} step={0.01} unit=" m" onChange={setGate2} />
            <Slider label="遮光片宽度 d" value={shadeWidth} min={0.01} max={0.04} step={0.005} unit=" m" onChange={setShade} />
            <div style={{ fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.9 }}>
              释放点 {RELEASE_Y.toFixed(2)} m · 上门 {GATE1_Y.toFixed(2)} m · 下门 {gate2Y.toFixed(2)} m<br />
              两门间距 Δh = <b style={{ color: 'var(--c-accent)' }}>{deltaH(params).toFixed(3)}</b> m<br />
              理论上 ΔEp = mgΔh = {(mass * G * deltaH(params)).toFixed(3)} J
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-text-faint)', lineHeight: 1.7 }}>
              重锤由电磁夹吸住，断电后自由下落；两门记录挡光时间 Δt，v = d/Δt。空气阻力已计入（很小）。
            </div>
            <button className="pill" style={{ alignSelf: 'flex-start', padding: '9px 20px', fontSize: 13 }} onClick={start}>断电，释放重锤 →</button>
          </Panel>
        ) : stage === 'run' ? (
          <Panel title="运行 · 器材已锁定">
            <div style={{ fontSize: 14, color: 'var(--c-text-dim)', lineHeight: 2 }}>
              模拟时间：<span ref={readout} style={{ color: 'var(--c-accent)' }}>0.000 s</span><br />
              预计落地 {tEnd.toFixed(3)} s
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--c-warn)' }}>下落过程中不要遮挡光电门（模拟中已锁定）。</div>
          </Panel>
        ) : (
          <Panel title={`分析 · 第 ${cur?.id ?? 1} 组`}>
            <div style={{ fontSize: 13.5, color: 'var(--c-text-dim)', lineHeight: 2 }}>
              上门 v₁ = <b style={{ color: 'var(--c-accent)' }}>{cur?.v1.toFixed(3)}</b> m/s（Δt={(cur ? cur.dt1 * 1000 : 0).toFixed(2)} ms）<br />
              下门 v₂ = <b style={{ color: 'var(--c-accent)' }}>{cur?.v2.toFixed(3)}</b> m/s（Δt={(cur ? cur.dt2 * 1000 : 0).toFixed(2)} ms）<br />
              ΔEp = <b style={{ color: 'var(--c-accent-2)' }}>{cur?.ep.toFixed(4)}</b> J · ΔEk = <b style={{ color: 'var(--c-accent-2)' }}>{cur?.ek.toFixed(4)}</b> J<br />
              相对误差 {(cur ? cur.err * 100 : 0).toFixed(2)}%（ΔEk 略小：空气阻力做负功）
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="pill" style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={() => setStage('setup')}>再测一组</button>
              <button className="pill" style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={exportCSV}>导出 CSV</button>
            </div>
          </Panel>
        )
      }
      dataArea={
        <Panel title="数据 · 各组能量对比" right={<span style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>{recs.length} 组</span>}>
          <div style={{ maxHeight: 170, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: 'var(--c-text-faint)', textAlign: 'left' }}>
                  <th style={th}>组</th><th style={th}>Δh/m</th><th style={th}>v₁</th><th style={th}>v₂</th><th style={th}>ΔEp/J</th><th style={th}>ΔEk/J</th><th style={th}>误差</th>
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => (
                  <tr key={r.id} style={{ background: cur && cur.id === r.id ? 'rgba(77,166,255,0.16)' : undefined }}>
                    <td style={td}>{r.id}</td><td style={td}>{r.dh.toFixed(3)}</td>
                    <td style={td}>{r.v1.toFixed(3)}</td><td style={td}>{r.v2.toFixed(3)}</td>
                    <td style={{ ...td, color: 'var(--c-accent-2)' }}>{r.ep.toFixed(4)}</td>
                    <td style={{ ...td, color: 'var(--c-accent)' }}>{r.ek.toFixed(4)}</td>
                    <td style={td}>{(r.err * 100).toFixed(2)}%</td>
                  </tr>
                ))}
                {recs.length === 0 && <tr><td colSpan={7} style={{ ...td, color: 'var(--c-text-faint)' }}>尚无数据</td></tr>}
              </tbody>
            </table>
          </div>
          <div ref={chartEl} style={{ width: '100%', height: 200 }} />
          <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>所有点应落在 y = x 上（虚线）；偏离即系统误差。</div>
        </Panel>
      }
      conclusion={
        <Panel title="结论校验 · 机械能守恒">
          <div style={{ fontSize: 13.5, color: 'var(--c-text-dim)', lineHeight: 1.9 }}>
            只有重力做功时，减少的重力势能等于增加的动能。至少测 2 组（改变下门高度）才能看出规律。
          </div>
          <div style={{ fontSize: 13, color: pass ? 'var(--c-accent-2)' : 'var(--c-warn)' }}>
            {cur ? `当前判定：${pass ? '通过' : recs.length < 2 ? '需再测一组' : '误差偏大'}` : '尚未采集数据'}
          </div>
          <button className="pill" disabled={!pass} style={{ padding: '8px 18px', fontSize: 13, opacity: pass ? 1 : 0.5 }} onClick={submit}>验证：机械能守恒</button>
        </Panel>
      }
    />
  );
}

const th: React.CSSProperties = { padding: '4px 6px', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.08)' };
const td: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontVariantNumeric: 'tabular-nums' };
