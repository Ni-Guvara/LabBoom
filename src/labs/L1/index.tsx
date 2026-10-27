// L1 实验：研究匀变速直线运动（气垫导轨 + 纸带 + 光电门）
// 三态：布置（垫片高度）→ 运行（纸带动画）→ 分析（逐差法 / v-t 拟合 / 误差）
import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { SceneHost, type SceneApi } from '@/engine/SceneHost';
import {
  buildL1Scene, buildSamples, theoryAccel, gateOffset,
  GATE_U, GATE_MIN_U, GATE_MAX_U, RAIL_LEN, START_U, TRAVEL,
  type L1Params, type L1State,
} from './scene';
import { LabFrame } from '@/labs/_template/LabFrame';
import { Slider, Panel } from '@/primitives/Primitives';
import { linearFit, downloadCSV } from '@/utils/fit';
import { countingPoints, tapeVelocities, gateReadings, sampleAt, duration, type Sample } from '@/engine/physics/kinematics';
import { useProgressStore } from '@/store/progress';

type Stage = 'setup' | 'run' | 'analyze';
const STAGES: Stage[] = ['setup', 'run', 'analyze'];
const STAGE_LABEL: Record<Stage, string> = { setup: '布置', run: '运行', analyze: '分析' };
const T = 0.1; // 计数点间隔（5 × 0.02 s）

interface Row { key: string; n: string; t: number; x: number; v: number; src: string }
interface Rec {
  id: number; h: number; flagWidth: number;
  aFit: number; aDiff: number; aTheory: number; r2: number;
  rows: Row[]; pts: [number, number][]; gateV: number | null; blockTime: number | null;
  travel: number;
}

/**
 * 逐差法：( (Δ4+Δ5+Δ6) − (Δ1+Δ2+Δ3) ) / 9T²
 *
 * 注意 Δ 是「相邻计数点之间的位移」。原来直接把 6 个计数点的**位置**相加，
 * 等于把 s1..s6 当作位移用，结果恒为真实值的 3.5 倍（实测 0.858 vs 0.245，
 * 相对误差 250%）。位置与位移的差别只在 s0 那一项，漏掉就整体错位。
 */
function diffMethod(samples: Sample[]): number {
  const s = [0, 1, 2, 3, 4, 5, 6].map((k) => sampleAt(samples, k * T).x);
  const d = [1, 2, 3, 4, 5, 6].map((k) => s[k] - s[k - 1]);
  return (d[3] + d[4] + d[5] - (d[0] + d[1] + d[2])) / (9 * T * T);
}

function buildRecord(p: L1Params, samples: Sample[], gateU: number, id: number): Rec {
  const cps = countingPoints(samples, 5, 0.02).filter((s) => s.t > 0.05 && s.t <= 1.4);
  const vs = tapeVelocities(cps, T);
  const offset = gateOffset(p.flagWidth, gateU);
  const gates = gateReadings(samples, [{ id: 'G1', x: offset, flagWidth: p.flagWidth }]);
  const rows: Row[] = cps.map((s, i) => ({ key: `c${i}`, n: String(i + 1), t: s.t, x: s.x, v: vs[i], src: '纸带·中间时刻' }));
  if (gates[0]) rows.push({ key: 'gate', n: '门', t: gates[0].tIn, x: offset, v: gates[0].v, src: '光电门 v = d/Δt' });
  const fit = linearFit(cps.map((s, i) => ({ x: s.t, y: vs[i] })));
  return {
    id, h: p.h, flagWidth: p.flagWidth,
    aFit: fit?.a ?? 0, r2: fit?.r2 ?? 0, aDiff: diffMethod(samples), aTheory: theoryAccel(p),
    rows, pts: cps.map((s, i) => [s.t, vs[i]] as [number, number]),
    gateV: gates[0]?.v ?? null, blockTime: gates[0]?.blockTime ?? null,
    travel: TRAVEL,
  };
}

export default function L1Lab() {
  const [stage, setStage] = useState<Stage>('setup');
  const [h, setH] = useState(0.03);
  const [flagWidth, setFlag] = useState(0.02);
  const [gateU, setGateU] = useState(GATE_U);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [stepToken, setStepToken] = useState(0);
  const [runId, setRunId] = useState(0);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [sel, setSel] = useState<string | null>(null);

  const params: L1Params = { h, flagWidth };
  const sim = useMemo(() => buildSamples({ h, flagWidth }), [h, flagWidth]);
  const tEnd = duration(sim);

  const markStep = useProgressStore((s) => s.markStep);
  const recordLab = useProgressStore((s) => s.recordLab);
  const completeLab = useProgressStore((s) => s.completeLab);
  const passQuiz = useProgressStore((s) => s.passQuiz);

  const readout = useRef<HTMLSpanElement>(null);
  const stateRef = useRef<L1State | null>(null);
  const commitRef = useRef<() => void>(() => {});

  stateRef.current = {
    ...params, stage, speed, paused, stepToken, runId, samples: sim, gateU,
    // 拖动回写的是连续浮点，落到面板上按 1 cm 取整：滑杆步长 0.01，
    // 不取整面板会显示 0.8926273035857537 这种尾巴
    onGateChange: (u) => setGateU(Math.round(u * 100) / 100),
    onProgress: (t) => { if (readout.current) readout.current.textContent = `${t.toFixed(2)} s`; },
    onFinish: () => commitRef.current(),
  };

  commitRef.current = () => {
    setRecs((r) => [...r, buildRecord(params, sim, gateU, r.length + 1)]);
    setSel('c1');
    setStage('analyze');
  };

  useEffect(() => { markStep('L1', STAGE_LABEL[stage]); }, [stage, markStep]);

  const start = () => {
    setPaused(false); setStepToken(0); setRunId((r) => r + 1); setSel(null); setStage('run');
    if (readout.current) readout.current.textContent = '0.00 s';
  };

  const setup = (api: SceneApi) => buildL1Scene(api, () => stateRef.current!);

  const chartEl = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const cur = recs.length ? recs[recs.length - 1] : null;

  useEffect(() => {
    const el = chartEl.current;
    if (!el) return;
    const chart = chartRef.current ?? echarts.init(el);
    chartRef.current = chart;
    if (!cur) { chart.clear(); return; }
    const fit = linearFit(cur.pts.map(([t, v]) => ({ x: t, y: v })));
    const line = fit ? cur.pts.map(([t]) => [t, +(fit.a * t + fit.b).toFixed(4)]) : [];
    const axis = { axisLabel: { color: '#8ca0b8', fontSize: 11 }, axisLine: { lineStyle: { color: '#5a6b82' } }, nameTextStyle: { color: '#8ca0b8', fontSize: 11 } };
    chart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 46, right: 14, top: 26, bottom: 34 },
      xAxis: { type: 'value', name: 't/s', min: 0, ...axis },
      yAxis: { type: 'value', name: 'v/(m·s⁻¹)', nameLocation: 'middle', nameGap: 38, splitNumber: 4, min: 0, ...axis, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } } },
      series: [
        { type: 'scatter', data: cur.pts, symbolSize: 8, itemStyle: { color: '#5eead4' }, name: '纸带测速' },
        { type: 'line', data: line, showSymbol: false, lineStyle: { color: '#4da6ff', width: 2 }, name: 'v-t 拟合' },
      ],
    }, true);
  }, [cur]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !cur || !sel) return;
    const idx = cur.rows.findIndex((r) => r.key === sel);
    if (idx >= 0 && idx < cur.pts.length) chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: idx });
  }, [sel, cur]);

  useEffect(() => () => { chartRef.current?.dispose(); chartRef.current = null; }, []);

  const relErr = cur ? Math.abs(cur.aFit - cur.aTheory) / Math.max(1e-6, cur.aTheory) : 1;
  const diffErr = cur ? Math.abs(cur.aDiff - cur.aTheory) / Math.max(1e-6, cur.aTheory) : 1;
  const pass = !!cur && relErr < 0.05 && diffErr < 0.05;

  const submit = () => {
    if (!pass || !cur) return;
    recordLab({
      labId: 'L1', timestamp: Date.now(), variables: { h, flagWidth },
      dataRows: { t: cur.pts.map((p) => p[0]), v: cur.pts.map((p) => p[1]) }, conclusionCorrect: true,
    });
    completeLab('L1', true);
    passQuiz('M2');
  };

  const exportCSV = () => {
    if (!cur) return;
    const meta: (number | string)[][] = [
      ['实验名', '研究匀变速直线运动'],
      ['器材', '气垫导轨 1.20 m / 滑行器 155 g / J0203 打点计时器 0.02 s / 光电门'],
      ['垫片高度 h/m', cur.h, '挡光片 d/m', cur.flagWidth, '导轨长 L/m', RAIL_LEN],
      ['a 拟合', +cur.aFit.toFixed(4), 'a 逐差法', +cur.aDiff.toFixed(4), 'a 理论', +cur.aTheory.toFixed(4)],
      [],
    ];
    const rows = cur.rows.map((r) => [cur.id, r.n, +r.t.toFixed(3), +r.x.toFixed(4), +r.v.toFixed(4), r.src]);
    downloadCSV(`L1-第${cur.id}组.csv`, ['组次', '事件', 't/s', 'x/m', 'v/(m·s⁻¹)', '来源'], [...meta, ...rows]);
  };

  const stepIdx = STAGES.indexOf(stage);

  return (
    <LabFrame
      labId="L1"
      step={stepIdx}
      onStep={(i) => { if (i <= stepIdx) setStage(STAGES[i]); }}
      toolbar={
        <>
          <span className="glass" style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12 }}>当前：{STAGE_LABEL[stage]}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0.25, 1, 4].map((v) => (
              <button key={v} className="pill" onClick={() => setSpeed(v)} style={{ padding: '6px 12px', fontSize: 12, opacity: speed === v ? 1 : 0.55 }}>{v}×</button>
            ))}
            {stage === 'run' && (
              <>
                <button className="pill" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setPaused((p) => !p)}>{paused ? '继续' : '暂停'}</button>
                <button className="pill" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setStepToken((t) => t + 1)}>单步 0.02s</button>
              </>
            )}
          </div>
        </>
      }
      stage={<SceneHost setup={setup} />}
      panel={
        stage === 'setup' ? (
          <Panel title="布置 · 垫片与纸带" right={<span className="en" style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>a = g·h/L</span>}>
            <Slider label="垫片高度 h（抬高左端）" value={h} min={0.01} max={0.06} step={0.005} unit=" m" onChange={setH} />
            <Slider label="挡光片宽度 d" value={flagWidth} min={0.01} max={0.05} step={0.01} unit=" m" onChange={setFlag} />
            <Slider label="光电门位置 u（导轨坐标）" value={gateU} min={GATE_MIN_U} max={GATE_MAX_U} step={0.01} unit=" m" onChange={setGateU} />
            <div style={{ fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.9 }}>
              倾角 sinθ = h/L = <b>{(h / RAIL_LEN).toFixed(4)}</b><br />
              理论加速度 a = <b style={{ color: 'var(--c-accent-2)' }}>{theoryAccel(params).toFixed(3)}</b> m/s²<br />
              行程 {TRAVEL.toFixed(2)} m · 计时器 0.02 s 一点（5 点取 1 个计数点）
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-text-faint)', lineHeight: 1.7 }}>
              纸带从计时器后限位孔穿入、经复写纸盘下方从前孔引出，末端用压片压在滑行器尾部；
              振针每 0.02 s 在带上打一点，点距就是该段的位移。光电门默认立在导轨中段，
              可以直接在台面上拖动它，也可以用滑杆微调位置。
            </div>
            <button className="pill" style={{ alignSelf: 'flex-start', padding: '9px 20px', fontSize: 13 }} onClick={start}>释放滑行器 →</button>
          </Panel>
        ) : stage === 'run' ? (
          <Panel title="运行 · 器材已锁定">
            <div style={{ fontSize: 14, color: 'var(--c-text-dim)', lineHeight: 2 }}>
              模拟时间：<span ref={readout} style={{ color: 'var(--c-accent)' }}>0.00 s</span><br />
              预计到时 {tEnd.toFixed(2)} s · 起点 x₀ = {START_U.toFixed(2)} m
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--c-warn)' }}>
              运行态器材已锁定。挡光片进光口时数显开始计时，后沿离开即定格为该次 Δt ——
              1× 下只有 0.04 s，用左上角慢放或单步才看得清跳动。
            </div>
          </Panel>
        ) : (
          <Panel title={`分析 · 第 ${cur?.id ?? 1} 组`}>
            <div style={{ fontSize: 13.5, color: 'var(--c-text-dim)', lineHeight: 2 }}>
              v-t 拟合 a = <b style={{ color: 'var(--c-accent)' }}>{cur?.aFit.toFixed(3)}</b> m/s²（R²={cur?.r2.toFixed(4)}）<br />
              逐差法 a = <b style={{ color: 'var(--c-accent)' }}>{cur?.aDiff.toFixed(3)}</b> m/s² · 相对误差 {(diffErr * 100).toFixed(2)}%<br />
              理论 a = <b style={{ color: 'var(--c-accent-2)' }}>{cur?.aTheory.toFixed(3)}</b> m/s²<br />
              光电门 v = {cur?.gateV?.toFixed(3) ?? '—'} m/s，Δt = {cur?.blockTime ? (cur.blockTime * 1000).toFixed(2) : '—'} ms
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="pill" style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={() => setStage('setup')}>再测一组</button>
              <button className="pill" style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={exportCSV}>导出 CSV</button>
            </div>
          </Panel>
        )
      }
      dataArea={
        <Panel title="数据 · 纸带事件记录" right={<span style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>共 {cur?.rows.length ?? 0} 行</span>}>
          {cur ? (
            <div style={{ maxHeight: 190, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ color: 'var(--c-text-faint)', textAlign: 'left' }}>
                    <th style={th}>#</th><th style={th}>t/s</th><th style={th}>x/m</th><th style={th}>v/(m·s⁻¹)</th><th style={th}>来源</th>
                  </tr>
                </thead>
                <tbody>
                  {cur.rows.map((r) => (
                    <tr key={r.key} onClick={() => setSel(r.key)} style={{ cursor: 'pointer', background: sel === r.key ? 'rgba(77,166,255,0.16)' : undefined }}>
                      <td style={td}>{r.n}</td>
                      <td style={td}>{r.t.toFixed(2)}</td>
                      <td style={td}>{r.x.toFixed(3)}</td>
                      <td style={{ ...td, color: r.src.startsWith('光电门') ? 'var(--c-accent-2)' : 'var(--c-accent)' }}>{r.v.toFixed(3)}</td>
                      <td style={{ ...td, color: 'var(--c-text-faint)', fontSize: 11.5 }}>{r.src}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div style={{ fontSize: 12.5, color: 'var(--c-text-faint)' }}>尚无数据：先在布置页释放滑行器。</div>}
        </Panel>
      }
      chart={
        <Panel title="数据绘图 · v-t 图">
          <div ref={chartEl} style={{ width: '100%', height: 260 }} />
          <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>点「数据记录」里的行，可在图上高亮对应点。</div>
        </Panel>
      }
      conclusion={
        <Panel title="结论校验 · 匀变速直线运动">
          <div style={{ fontSize: 13.5, color: 'var(--c-text-dim)', lineHeight: 1.9 }}>
            v-t 图应为直线，斜率即加速度；且逐差法 a 与 g·h/L 一致（误差 &lt; 5%）。
          </div>
          <div style={{ fontSize: 13, color: pass ? 'var(--c-accent-2)' : 'var(--c-warn)' }}>
            {cur ? `当前判定：${pass ? '通过' : '未通过（检查垫片高度或数据点）'}` : '尚未采集数据'}
          </div>
          <button className="pill" disabled={!pass} style={{ padding: '8px 18px', fontSize: 13, opacity: pass ? 1 : 0.5 }} onClick={submit}>验证：匀变速直线运动</button>
        </Panel>
      }
    />
  );
}

const th: React.CSSProperties = { padding: '4px 6px', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.08)' };
const td: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontVariantNumeric: 'tabular-nums' };
