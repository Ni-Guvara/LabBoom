// L5 实验：研究平抛运动（斜槽 + 频闪描迹）
// 三态：布置（释放高度）→ 运行（频闪留痕）→ 分析（x=v0t 与 y=½gt² 两条线性化）
import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { SceneHost, type SceneApi } from '@/engine/SceneHost';
import { G, Y0, flightTime, strobeDots, v0Of, buildL5Scene, type L5Params, type L5State, type Dot } from './scene';
import { LabFrame } from '@/labs/_template/LabFrame';
import { Slider, Panel } from '@/primitives/Primitives';
import { linearFit, downloadCSV } from '@/utils/fit';
import { useProgressStore } from '@/store/progress';

type Stage = 'setup' | 'run' | 'analyze';
const STAGES: Stage[] = ['setup', 'run', 'analyze'];
const STAGE_LABEL: Record<Stage, string> = { setup: '布置', run: '运行', analyze: '分析' };

interface Rec {
  id: number; releaseH: number; v0: number; v0Fit: number; gFit: number;
  dots: Dot[]; dx: number[]; dy2: number[];
}

function buildRecord(p: L5Params, id: number): Rec {
  const dots = strobeDots(p);
  const v0 = v0Of(p);
  const v0Fit = linearFit(dots.map((d) => ({ x: d.t, y: d.x })))?.a ?? 0;
  const fitY = linearFit(dots.map((d) => ({ x: d.t * d.t, y: d.y })));
  const gFit = fitY ? -2 * fitY.a : 0;
  const dx = dots.slice(1).map((d, i) => d.x - dots[i].x);
  const dy2 = dots.slice(2).map((_, i) => (dots[i + 2].y - dots[i + 1].y) - (dots[i + 1].y - dots[i].y));
  return { id, releaseH: p.releaseH, v0, v0Fit, gFit, dots, dx, dy2 };
}

export default function L5Lab() {
  const [stage, setStage] = useState<Stage>('setup');
  const [releaseH, setReleaseH] = useState(0.18);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [stepToken, setStepToken] = useState(0);
  const [runId, setRunId] = useState(0);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [mode, setMode] = useState<'xt' | 'yt2'>('xt');

  const params: L5Params = { releaseH };
  const tf = useMemo(() => flightTime(), []);
  const dots = useMemo(() => strobeDots(params), [releaseH]); // eslint-disable-line react-hooks/exhaustive-deps

  const markStep = useProgressStore((s) => s.markStep);
  const recordLab = useProgressStore((s) => s.recordLab);
  const completeLab = useProgressStore((s) => s.completeLab);
  const passQuiz = useProgressStore((s) => s.passQuiz);

  const readout = useRef<HTMLSpanElement>(null);
  const stateRef = useRef<L5State | null>(null);
  const commitRef = useRef<() => void>(() => {});

  stateRef.current = {
    ...params, stage, speed, paused, stepToken, runId,
    onProgress: (t) => { if (readout.current) readout.current.textContent = `${(t * 1000).toFixed(0)} ms`; },
    onFinish: () => commitRef.current(),
  };

  commitRef.current = () => {
    setRecs((r) => [...r, buildRecord(params, r.length + 1)]);
    setStage('analyze');
  };

  useEffect(() => { markStep('L5', STAGE_LABEL[stage]); }, [stage, markStep]);

  const start = () => {
    setPaused(false); setStepToken(0); setRunId((r) => r + 1); setStage('run');
    if (readout.current) readout.current.textContent = '0 ms';
  };

  const setup = (api: SceneApi) => buildL5Scene(api, () => stateRef.current!);

  const chartEl = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const cur = recs.length ? recs[recs.length - 1] : null;

  useEffect(() => {
    const el = chartEl.current;
    if (!el) return;
    const chart = chartRef.current ?? echarts.init(el);
    chartRef.current = chart;
    if (!cur) { chart.clear(); return; }
    const axis = { axisLabel: { color: '#8ca0b8', fontSize: 11 }, axisLine: { lineStyle: { color: '#5a6b82' } }, nameTextStyle: { color: '#8ca0b8', fontSize: 11 } };
    if (mode === 'xt') {
      const fit = linearFit(cur.dots.map((d) => ({ x: d.t, y: d.x })));
      const line = fit ? [[0, 0], [tf, +(fit.a * tf).toFixed(3)]] : [];
      chart.setOption({
        backgroundColor: 'transparent',
        grid: { left: 46, right: 14, top: 26, bottom: 34 },
        xAxis: { type: 'value', name: 't/s', min: 0, ...axis },
        yAxis: { type: 'value', name: 'x/m', nameLocation: 'middle', nameGap: 38, splitNumber: 4, min: 0, ...axis, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } } },
        series: [
          { type: 'line', data: line, showSymbol: false, lineStyle: { color: '#4da6ff', width: 1.5, type: 'dashed' }, name: 'x=v₀t' },
          { type: 'scatter', data: cur.dots.map((d) => [d.t, +d.x.toFixed(3)]), symbolSize: 8, itemStyle: { color: '#5eead4' }, name: '频闪点' },
        ],
      }, true);
    } else {
      const fit = linearFit(cur.dots.map((d) => ({ x: d.t * d.t, y: d.y })));
      const t2max = tf * tf;
      const line = fit ? [[0, Y0], [t2max, +(fit.a * t2max + fit.b).toFixed(3)]] : [];
      chart.setOption({
        backgroundColor: 'transparent',
        grid: { left: 48, right: 14, top: 26, bottom: 34 },
        xAxis: { type: 'value', name: 't²/s²', min: 0, ...axis },
        yAxis: { type: 'value', name: 'y/m', nameLocation: 'middle', nameGap: 38, splitNumber: 4, min: 0, ...axis, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } } },
        series: [
          { type: 'line', data: line, showSymbol: false, lineStyle: { color: '#4da6ff', width: 1.5, type: 'dashed' }, name: 'y=Y₀−½gt²' },
          { type: 'scatter', data: cur.dots.map((d) => [+(d.t * d.t).toFixed(4), +d.y.toFixed(3)]), symbolSize: 8, itemStyle: { color: '#ffb14d' }, name: '频闪点' },
        ],
      }, true);
    }
  }, [cur, mode, tf]);

  useEffect(() => () => { chartRef.current?.dispose(); chartRef.current = null; }, []);

  const gErr = cur ? Math.abs(cur.gFit - G) / G : 1;
  const v0Err = cur ? Math.abs(cur.v0Fit - cur.v0) / Math.max(1e-6, cur.v0) : 1;
  const dxSpread = cur ? Math.max(...cur.dx) - Math.min(...cur.dx) : 1;
  const dySpread = cur ? Math.max(...cur.dy2.map(Math.abs)) : 1;
  const pass = !!cur && gErr < 0.05 && v0Err < 0.05 && dxSpread < 0.002 && dySpread < 0.002;

  const submit = () => {
    if (!pass || !cur) return;
    recordLab({
      labId: 'L5', timestamp: Date.now(), variables: { releaseH },
      dataRows: { t: cur.dots.map((d) => d.t), x: cur.dots.map((d) => d.x) }, conclusionCorrect: true,
    });
    completeLab('L5', true);
    passQuiz('M4');
  };

  const exportCSV = () => {
    if (!cur) return;
    const rows = cur.dots.map((d, i) => [cur.id, i, +d.t.toFixed(3), +d.x.toFixed(4), +d.y.toFixed(4)]);
    downloadCSV(`L5-第${cur.id}组.csv`, ['组次', '点号', 't/s', 'x/m', 'y/m'], rows);
  };

  const stepIdx = STAGES.indexOf(stage);

  return (
    <LabFrame
      labId="L5"
      step={stepIdx}
      onStep={(i) => { if (i <= stepIdx) setStage(STAGES[i]); }}
      toolbar={
        <>
          <span className="glass" style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12 }}>当前：{STAGE_LABEL[stage]}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0.1, 1].map((v) => (
              <button key={v} className="pill" onClick={() => setSpeed(v)} style={{ padding: '6px 12px', fontSize: 12, opacity: speed === v ? 1 : 0.55 }}>{v}×</button>
            ))}
            {stage === 'run' && (
              <>
                <button className="pill" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setPaused((p) => !p)}>{paused ? '继续' : '暂停'}</button>
                <button className="pill" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setStepToken((t) => t + 1)}>单步 0.05s</button>
              </>
            )}
          </div>
        </>
      }
      stage={<SceneHost setup={setup} />}
      panel={
        stage === 'setup' ? (
          <Panel title="布置 · 斜槽与描迹板" right={<span className="en" style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>x=v₀t, y=½gt²</span>}>
            <Slider label="斜槽上释放高度 H" value={releaseH} min={0.06} max={0.3} step={0.02} unit=" m" onChange={setReleaseH} />
            <div style={{ fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.9 }}>
              抛出口速度 v₀ = √(2gH·η) = <b style={{ color: 'var(--c-accent)' }}>{v0Of(params).toFixed(3)}</b> m/s<br />
              抛出点高度 {Y0.toFixed(2)} m · 飞行时间 {tf.toFixed(3)} s<br />
              频闪间隔 0.05 s，可留 {dots.length} 个点（5 cm 方格靶板）
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-text-faint)', lineHeight: 1.7 }}>
              分析时先验证水平方向 Δx 恒定（匀速），再验证竖直方向 Δy 的差值恒定（匀加速）。
            </div>
            <button className="pill" style={{ alignSelf: 'flex-start', padding: '9px 20px', fontSize: 13 }} onClick={start}>释放钢球 →</button>
          </Panel>
        ) : stage === 'run' ? (
          <Panel title="运行 · 频闪拍摄中">
            <div style={{ fontSize: 14, color: 'var(--c-text-dim)', lineHeight: 2 }}>
              曝光时间：<span ref={readout} style={{ color: 'var(--c-accent)' }}>0 ms</span><br />
              总飞行 {tf.toFixed(3)} s（每 0.05 s 一次闪光）
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--c-warn)' }}>运行态器材锁定；靶板上的红点为频闪像。</div>
          </Panel>
        ) : (
          <Panel title={`分析 · 第 ${cur?.id ?? 1} 组`}>
            <div style={{ fontSize: 13.5, color: 'var(--c-text-dim)', lineHeight: 2 }}>
              v₀ 拟合 = <b style={{ color: 'var(--c-accent)' }}>{cur?.v0Fit.toFixed(3)}</b> m/s（理论 {cur?.v0.toFixed(3)}）<br />
              g 拟合 = <b style={{ color: 'var(--c-accent-2)' }}>{cur?.gFit.toFixed(2)}</b> m/s²（误差 {(gErr * 100).toFixed(2)}%）<br />
              Δx 极差 {(dxSpread * 1000).toFixed(2)} mm（水平匀速）<br />
              二阶差分 |Δ²y| 最大 {(dySpread * 1000).toFixed(2)} mm（竖直匀加速）
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="pill" style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={() => setStage('setup')}>再测一组</button>
              <button className="pill" style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={() => setMode((m) => (m === 'xt' ? 'yt2' : 'xt'))}>
                切换 {mode === 'xt' ? 'y-t² 图' : 'x-t 图'}
              </button>
              <button className="pill" style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={exportCSV}>导出 CSV</button>
            </div>
          </Panel>
        )
      }
      dataArea={
        <Panel title={mode === 'xt' ? '数据 · 频闪点（x-t）' : '数据 · 频闪点（y-t²）'} right={<span style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>{cur?.dots.length ?? 0} 点</span>}>
          {cur ? (
            <div style={{ maxHeight: 170, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ color: 'var(--c-text-faint)', textAlign: 'left' }}>
                    <th style={th}>点</th><th style={th}>t/s</th><th style={th}>x/m</th><th style={th}>y/m</th><th style={th}>Δx/m</th><th style={th}>Δ²y/m</th>
                  </tr>
                </thead>
                <tbody>
                  {cur.dots.map((d, i) => (
                    <tr key={i}>
                      <td style={td}>{i}</td>
                      <td style={td}>{d.t.toFixed(2)}</td>
                      <td style={td}>{d.x.toFixed(3)}</td>
                      <td style={td}>{d.y.toFixed(3)}</td>
                      <td style={{ ...td, color: 'var(--c-accent)' }}>{i > 0 ? cur.dx[i - 1].toFixed(4) : '—'}</td>
                      <td style={{ ...td, color: 'var(--c-accent-2)' }}>{i > 1 ? cur.dy2[i - 2].toFixed(4) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div style={{ fontSize: 12.5, color: 'var(--c-text-faint)' }}>尚无数据：先在布置页释放钢球。</div>}
          <div ref={chartEl} style={{ width: '100%', height: 200 }} />
          <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>Δx 恒定 → 水平匀速；Δ²y 恒定 → 竖直匀加速（gT²）。</div>
        </Panel>
      }
      conclusion={
        <Panel title="结论校验 · 平抛运动">
          <div style={{ fontSize: 13.5, color: 'var(--c-text-dim)', lineHeight: 1.9 }}>
            水平方向做匀速直线运动、竖直方向做自由落体运动；由 y-t² 斜率得 g/2。
          </div>
          <div style={{ fontSize: 13, color: pass ? 'var(--c-accent-2)' : 'var(--c-warn)' }}>
            {cur ? `当前判定：${pass ? '通过' : '未通过（检查 Δx、Δ²y 是否恒定）'}` : '尚未采集数据'}
          </div>
          <button className="pill" disabled={!pass} style={{ padding: '8px 18px', fontSize: 13, opacity: pass ? 1 : 0.5 }} onClick={submit}>验证：平抛运动规律</button>
        </Panel>
      }
    />
  );
}

const th: React.CSSProperties = { padding: '4px 6px', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.08)' };
const td: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontVariantNumeric: 'tabular-nums' };
