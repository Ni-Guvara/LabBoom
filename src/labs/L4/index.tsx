// L4（P3 标杆）：探究加速度与力、质量的关系
// 三态：布置 → 运行（器材锁定）→ 分析（事件表 / v-t 拟合 / 误差 / 导出）
// 数据粒度=物理事件：纸带计数点（0.1 s）+ 光电门一次读数，单次 ≤15 行
import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { SceneHost, type SceneApi } from '@/engine/SceneHost';
import {
  buildL4Scene, buildSamples, theoryAccel, gateTravel, GATE_OFFSET, GATE_MIN, GATE_MAX,
  type L4State, type L4Params,
} from './scene';
import { LabFrame } from '@/labs/_template/LabFrame';
import { Slider, ModeToggle, Panel } from '@/primitives/Primitives';
import { linearFit, downloadCSV } from '@/utils/fit';
import { countingPoints, tapeVelocities, gateReadings, duration, type Sample } from '@/engine/physics/kinematics';
import { useProgressStore } from '@/store/progress';

type Stage = 'setup' | 'run' | 'analyze';
const STAGES: Stage[] = ['setup', 'run', 'analyze'];
const STAGE_LABEL: Record<Stage, string> = { setup: '布置', run: '运行', analyze: '分析' };

interface Row { key: string; n: string; t: number; x: number; v: number; src: string }
interface Rec {
  id: number; M: number; m0: number; compensated: boolean;
  aFit: number; aTheory: number; r2: number;
  rows: Row[]; pts: [number, number][]; gateV: number | null; blockTime: number | null;
}

function buildRecord(p: L4Params, samples: Sample[], id: number): Rec {
  // 数据粒度=物理事件且总量受控：只取前 1.4 s 的计数点（≤13 行）+ 1 行光电门 ≤ 15 行
  //
  // 端点必须让掉：tapeVelocities 的中间差分 v_n=(x_{n+1}−x_{n−1})/2T 对应 t_n，
  // 但首尾点没有邻点、只能退化成单侧差商 (x_{n+1}−x_n)/T，它对应的是 t_n+T/2。
  // 两个端点各错半个节拍，v-t 拟合的斜率会被拉低约 8%（1.089 → 0.998），
  // 「验证牛顿第二定律」就会误判为不通过。所以拟合/表格都只用有邻点的点。
  const all = countingPoints(samples, 5, 0.02);
  const allV = tapeVelocities(all, 0.1);
  const keep: number[] = [];
  all.forEach((s, i) => {
    if (i > 0 && i < all.length - 1 && s.t > 0.08 && s.t <= 1.4) keep.push(i);
  });
  const cps = keep.map((i) => all[i]);
  const vs = keep.map((i) => allV[i]);
  // 光电门读的是挡光片前沿到达光轴时的位移，必须减掉前置量（见 scene.gateTravel）
  const gx = gateTravel(p.gateOffset, p.flagWidth);
  const gates = gateReadings(samples, [{ id: 'G1', x: gx, flagWidth: p.flagWidth }]);
  const rows: Row[] = cps.map((s, i) => ({ key: `c${i}`, n: String(i + 1), t: s.t, x: s.x, v: vs[i], src: '纸带·中间时刻' }));
  if (gates[0]) rows.push({ key: 'gate', n: '门', t: gates[0].tIn, x: gx, v: gates[0].v, src: '光电门 v = d/Δt' });
  const fit = linearFit(cps.map((s, i) => ({ x: s.t, y: vs[i] })));
  return {
    id, M: p.M, m0: p.m0, compensated: p.compensated,
    aFit: fit?.a ?? 0, r2: fit?.r2 ?? 0, aTheory: theoryAccel(p),
    rows, pts: cps.map((s, i) => [s.t, vs[i]] as [number, number]),
    gateV: gates[0]?.v ?? null, blockTime: gates[0]?.blockTime ?? null,
  };
}

export default function L4Lab() {
  const [stage, setStage] = useState<Stage>('setup');
  const [M, setM] = useState(0.4);
  const [m0, setM0] = useState(0.05);
  const [compensated, setComp] = useState(true);
  const [flagWidth, setFlag] = useState(0.05);
  // 光电门位置是布置参数（拖光电门 = 改这个值），不是纯视觉的摆设
  const [gateOffset, setGateOffset] = useState(GATE_OFFSET);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [stepToken, setStepToken] = useState(0);
  const [runId, setRunId] = useState(0);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<'vt' | 'aF'>('vt');

  const params: L4Params = { M, m0, compensated, flagWidth, gateOffset };
  const sim = useMemo(
    () => buildSamples({ M, m0, compensated, flagWidth, gateOffset }),
    [M, m0, compensated, flagWidth, gateOffset],
  );
  const tEnd = duration(sim);

  const markStep = useProgressStore((s) => s.markStep);
  const recordLab = useProgressStore((s) => s.recordLab);
  const completeLab = useProgressStore((s) => s.completeLab);
  const passQuiz = useProgressStore((s) => s.passQuiz);

  const readout = useRef<HTMLSpanElement>(null);
  const stateRef = useRef<L4State | null>(null);
  const commitRef = useRef<() => void>(() => {});

  stateRef.current = {
    ...params, stage, speed, paused, stepToken, runId, samples: sim,
    onGateChange: setGateOffset,
    onProgress: (t) => { if (readout.current) readout.current.textContent = `${t.toFixed(2)} s`; },
    onFinish: () => commitRef.current(),
  };

  commitRef.current = () => {
    setRecs((r) => [...r, buildRecord(params, sim, r.length + 1)]);
    setSel('c1');
    setStage('analyze');
  };

  useEffect(() => { markStep('L4', STAGE_LABEL[stage]); }, [stage, markStep]);

  const start = () => {
    setPaused(false);
    setStepToken(0);
    setRunId((r) => r + 1);
    setSel(null);
    setStage('run');
    if (readout.current) readout.current.textContent = '0.00 s';
  };

  const setup = (api: SceneApi) => buildL4Scene(api, () => stateRef.current!);

  const chartEl = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const cur = recs.length ? recs[recs.length - 1] : null;

  useEffect(() => {
    const el = chartEl.current;
    if (!el) return;
    const chart = chartRef.current ?? echarts.init(el);
    chartRef.current = chart;
    const axis = {
      axisLabel: { color: '#8ca0b8', fontSize: 11 },
      axisLine: { lineStyle: { color: '#5a6b82' } },
      nameTextStyle: { color: '#8ca0b8', fontSize: 11 },
    };
    const base = { backgroundColor: 'transparent', grid: { left: 46, right: 14, top: 26, bottom: 34 } };
    if (chartMode === 'vt') {
      if (!cur) { chart.clear(); return; }
      const fit = linearFit(cur.pts.map(([t, v]) => ({ x: t, y: v })));
      const line = fit ? cur.pts.map(([t]) => [t, +(fit.a * t + fit.b).toFixed(4)]) : [];
      chart.setOption({
        ...base,
        xAxis: { type: 'value', name: 't/s', min: 0, ...axis },
        yAxis: { type: 'value', name: 'v/(m·s⁻¹)', nameLocation: 'middle', nameGap: 38, splitNumber: 4, min: 0, ...axis, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } } },
        series: [
          { type: 'scatter', data: cur.pts, symbolSize: 8, itemStyle: { color: '#5eead4' }, name: '纸带测速' },
          { type: 'line', data: line, showSymbol: false, lineStyle: { color: '#4da6ff', width: 2 }, name: 'v-t 拟合' },
        ],
      }, true);
      chart.off('click');
      chart.on('click', (p: { dataIndex?: number }) => {
        if (typeof p.dataIndex === 'number') setSel(`c${p.dataIndex}`);
      });
    } else {
      const data = recs.map((r) => [+(r.m0 * 9.8).toFixed(3), +r.aFit.toFixed(3)]);
      const fit = linearFit(data.map(([x, y]) => ({ x, y })));
      const line = fit ? data.map(([x]) => [x, +(fit.a * x + fit.b).toFixed(3)]) : [];
      chart.setOption({
        ...base,
        xAxis: { type: 'value', name: 'F/N', min: 0, ...axis },
        yAxis: { type: 'value', name: 'a/(m·s⁻²)', nameLocation: 'middle', nameGap: 38, splitNumber: 4, min: 0, ...axis, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } } },
        series: [
          { type: 'scatter', data, symbolSize: 9, itemStyle: { color: '#ffb14d' }, name: '各组实测' },
          { type: 'line', data: line, showSymbol: false, lineStyle: { color: '#4da6ff', width: 2 }, name: 'a-F 拟合' },
        ],
      }, true);
    }
  }, [chartMode, recs, cur]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chartMode !== 'vt' || !cur || !sel) return;
    const idx = cur.rows.findIndex((r) => r.key === sel);
    if (idx >= 0 && idx < cur.pts.length) chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: idx });
  }, [sel, cur, chartMode]);

  useEffect(() => () => { chartRef.current?.dispose(); chartRef.current = null; }, []);

  const relErr = cur ? Math.abs(cur.aFit - cur.aTheory) / Math.max(1e-6, cur.aTheory) : 1;
  const pass = !!cur && compensated && relErr < 0.05;

  const submit = () => {
    if (!pass || !cur) return;
    recordLab({
      labId: 'L4', timestamp: Date.now(), variables: { M, m0, compensated, flagWidth },
      dataRows: { t: cur.pts.map((p) => p[0]), v: cur.pts.map((p) => p[1]) }, conclusionCorrect: true,
    });
    completeLab('L4', true);
    passQuiz('M4');
  };

  const exportCSV = () => {
    if (!cur) return;
    const meta: (number | string)[][] = [
      ['实验名', '探究加速度与力、质量的关系'],
      ['器材', 'J2183 轨道小车 / J0203 打点计时器 / 光电门 / 定滑轮 / 砂桶'],
      ['M/kg', cur.M, 'm0/kg', cur.m0, '光电门位置/m', gateOffset, '摩擦补偿', cur.compensated ? '是' : '否'],
      ['a拟合', +cur.aFit.toFixed(4), 'a理论', +cur.aTheory.toFixed(4), 'R2', +cur.r2.toFixed(4)],
      [],
    ];
    const rows = cur.rows.map((r) => [cur.id, r.n, +r.t.toFixed(3), +r.x.toFixed(4), +r.v.toFixed(4), r.src]);
    downloadCSV(`L4-第${cur.id}组.csv`, ['组次', '事件', 't/s', 'x/m', 'v/(m·s⁻¹)', '来源'], [...meta, ...rows]);
  };

  const stepIdx = STAGES.indexOf(stage);

  return (
    <LabFrame
      labId="L4"
      step={stepIdx}
      onStep={(i) => { if (i <= stepIdx) setStage(STAGES[i]); }}
      toolbar={
        <>
          <span className="glass" style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12 }}>当前：{STAGE_LABEL[stage]}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0.25, 1, 4].map((v) => (
              <button key={v} className="pill" onClick={() => setSpeed(v)}
                style={{ padding: '6px 12px', fontSize: 12, opacity: speed === v ? 1 : 0.55 }}>{v}×</button>
            ))}
            {stage === 'run' && (
              <>
                <button className="pill" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setPaused((p) => !p)}>
                  {paused ? '继续' : '暂停'}
                </button>
                <button className="pill" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setStepToken((t) => t + 1)}>
                  单步 0.02s
                </button>
              </>
            )}
          </div>
        </>
      }
      stage={<SceneHost setup={setup} />}
      panel={
        stage === 'setup' ? (
          <Panel title="布置 · 器材与参数" right={<span className="en" style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>a=(m0g−f)/(M+m0)</span>}>
            <Slider label="小车质量 M" value={M} min={0.2} max={0.8} step={0.05} unit=" kg" onChange={setM} />
            <Slider label="砂桶质量 m0" value={m0} min={0.02} max={0.2} step={0.01} unit=" kg" onChange={setM0} />
            <Slider label="挡光片宽度 d" value={flagWidth} min={0.01} max={0.05} step={0.01} unit=" m" onChange={setFlag} />
            <Slider label="光电门位置" value={gateOffset} min={GATE_MIN} max={GATE_MAX} step={0.01} unit=" m" onChange={setGateOffset} />
            <ModeToggle label="摩擦补偿（垫高木板）" value={compensated} onChange={setComp} />
            <div style={{ fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.9 }}>
              F = m0·g = <b style={{ color: 'var(--c-accent)' }}>{(m0 * 9.8).toFixed(3)}</b> N<br />
              理论 a = <b style={{ color: 'var(--c-accent-2)' }}>{theoryAccel(params).toFixed(3)}</b> m/s²
              {!compensated && <><br /><span style={{ color: 'var(--c-warn)' }}>未补偿摩擦 f = 0.20 N → 截距不为 0</span></>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-text-faint)', lineHeight: 1.7 }}>
              光电门可在木板上直接拖动，位置会回写到上面的滑杆；双击聚焦、1/3/7 切换前/右/顶视、滚轮朝光标缩放。
            </div>
            <button className="pill" style={{ alignSelf: 'flex-start', padding: '9px 20px', fontSize: 13 }} onClick={start}>
              释放小车，开始记录 →
            </button>
          </Panel>
        ) : stage === 'run' ? (
          <Panel title="运行 · 器材已锁定">
            <div style={{ fontSize: 14, color: 'var(--c-text-dim)', lineHeight: 2 }}>
              模拟时间：<span ref={readout} style={{ color: 'var(--c-accent)' }}>0.00 s</span><br />
              总时长 {tEnd.toFixed(2)} s · 行程 0.42 m
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--c-warn)' }}>运行态器材已锁定，请勿触碰相机以外的操作。</div>
            <div style={{ fontSize: 12.5, color: 'var(--c-text-faint)', lineHeight: 1.8 }}>
              纸带 0.02 s 一点，每 5 点取一个计数点（0.1 s）；光电门 Δt = d/v。
            </div>
          </Panel>
        ) : (
          <Panel title={`分析 · 第 ${cur?.id ?? 1} 组`}>
            <div style={{ fontSize: 13.5, color: 'var(--c-text-dim)', lineHeight: 2 }}>
              拟合 a = <b style={{ color: 'var(--c-accent)' }}>{cur?.aFit.toFixed(3)}</b> m/s²（R²={cur?.r2.toFixed(4)}）<br />
              理论 a = <b style={{ color: 'var(--c-accent-2)' }}>{cur?.aTheory.toFixed(3)}</b> m/s² · 相对误差 {(relErr * 100).toFixed(2)}%<br />
              光电门 v = {cur?.gateV?.toFixed(3) ?? '—'} m/s，Δt = {cur?.blockTime ? (cur.blockTime * 1000).toFixed(2) : '—'} ms
            </div>
            {!compensated && <div style={{ fontSize: 12.5, color: 'var(--c-warn)' }}>摩擦未补偿 → a-F 图不过原点（系统误差）。</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="pill" style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={() => setStage('setup')}>再测一组</button>
              <button className="pill" style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={exportCSV}>导出 CSV</button>
              <button className="pill" style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={() => setChartMode((m) => (m === 'vt' ? 'aF' : 'vt'))}>
                切换 {chartMode === 'vt' ? 'a-F 图' : 'v-t 图'}
              </button>
            </div>
          </Panel>
        )
      }
      dataArea={
        <Panel
          title={chartMode === 'vt' ? '数据 · 本组事件记录' : '数据 · 跨组 a-F'}
          right={<span style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>有效记录 {cur?.rows.length ?? 0} 行</span>}
        >
          {/* 表头 24.5 + 7 行×25 ≈ 200：高度对准整行，避免出现半截行 */}
          {chartMode === 'vt' && cur ? (
            <div style={{ maxHeight: 200, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ color: 'var(--c-text-faint)', textAlign: 'left' }}>
                    <th style={th}>#</th><th style={th}>t/s</th><th style={th}>x/m</th><th style={th}>v/(m·s⁻¹)</th><th style={th}>来源</th>
                  </tr>
                </thead>
                <tbody>
                  {cur.rows.map((r) => (
                    <tr key={r.key} onClick={() => setSel(r.key)}
                      style={{ cursor: 'pointer', background: sel === r.key ? 'rgba(77,166,255,0.16)' : undefined }}>
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
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--c-text-dim)', maxHeight: 120, overflow: 'auto' }}>
              {recs.length < 2 ? '至少测 2 组（改 m0 或 M 后再释放一次）才能看 a-F 关系。' : recs.map((r) => (
                <div key={r.id} style={{ display: 'flex', gap: 10, padding: '2px 0' }}>
                  <span>第 {r.id} 组</span><span>M={r.M.toFixed(2)}kg</span>
                  <span>F={(r.m0 * 9.8).toFixed(3)}N</span>
                  <span style={{ color: 'var(--c-accent)' }}>a={r.aFit.toFixed(3)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      }
      chart={
        <Panel title={chartMode === 'vt' ? '数据绘图 · v-t' : '数据绘图 · a-F'}>
          <div ref={chartEl} style={{ width: '100%', height: 280 }} />
          <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>点表格行可在曲线上高亮对应点，反之亦然。</div>
        </Panel>
      }
      conclusion={
        <Panel title="结论校验 · 牛顿第二定律">
          <div style={{ fontSize: 13.5, color: 'var(--c-text-dim)', lineHeight: 1.9 }}>
            v-t 图斜率即加速度 a。若 a 与 (m0g − f)/(M+m0) 一致（相对误差 &lt; 5%），且补偿摩擦后 a-F 图过原点，即验证 a = F/M。
          </div>
          <div style={{ fontSize: 13, color: pass ? 'var(--c-accent-2)' : 'var(--c-warn)' }}>
            {cur ? `当前判定：${pass ? '通过' : '未通过（检查摩擦补偿或数据点）'}` : '尚未采集数据'}
          </div>
          <button className="pill" disabled={!pass} style={{ alignSelf: 'flex-start', padding: '8px 18px', fontSize: 13, opacity: pass ? 1 : 0.5 }} onClick={submit}>
            验证牛顿第二定律
          </button>
        </Panel>
      }
    />
  );
}

const th: React.CSSProperties = { padding: '4px 6px', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.08)' };
const td: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontVariantNumeric: 'tabular-nums' };
