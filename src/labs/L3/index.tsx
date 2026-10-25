// L3 实验：探究两个互成角度的力的合成规律（等效替代法）
import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { SceneHost, type SceneApi } from '@/engine/SceneHost';
import { buildL3Scene, measured, resultant, type L3Params, type L3State } from './scene';
import { LabFrame } from '@/labs/_template/LabFrame';
import { Slider, Panel } from '@/primitives/Primitives';
import { downloadCSV } from '@/utils/fit';
import { useProgressStore } from '@/store/progress';

type Stage = 'setup' | 'run' | 'analyze';
const STAGES: Stage[] = ['setup', 'run', 'analyze'];
const STAGE_LABEL: Record<Stage, string> = { setup: '布置', run: '测量', analyze: '分析' };

interface Rec { id: number; f1: number; f2: number; deg: number; fr: number; fm: number; err: number }

export default function L3Lab() {
  const [stage, setStage] = useState<Stage>('setup');
  const [f1, setF1] = useState(3);
  const [f2, setF2] = useState(4);
  const [deg, setDeg] = useState(90);
  const [runId, setRunId] = useState(0);
  const [recs, setRecs] = useState<Rec[]>([]);

  const params: L3Params = { f1, f2, deg };

  const markStep = useProgressStore((s) => s.markStep);
  const recordLab = useProgressStore((s) => s.recordLab);
  const completeLab = useProgressStore((s) => s.completeLab);
  const passQuiz = useProgressStore((s) => s.passQuiz);

  const bar = useRef<HTMLDivElement>(null);
  const stateRef = useRef<L3State | null>(null);
  const commitRef = useRef<() => void>(() => {});

  stateRef.current = {
    ...params, stage, progress: 0, runId,
    onProgress: (p) => { if (bar.current) bar.current.style.width = `${(p * 100).toFixed(0)}%`; },
    onFinish: () => commitRef.current(),
  };

  commitRef.current = () => {
    const fr = resultant(params);
    const fm = measured(params);
    setRecs((r) => [...r, { id: r.length + 1, f1, f2, deg, fr, fm, err: Math.abs(fm - fr) / fr }]);
    setStage('analyze');
  };

  useEffect(() => { markStep('L3', STAGE_LABEL[stage]); }, [stage, markStep]);

  const start = () => {
    setRunId((r) => r + 1);
    setStage('run');
    if (bar.current) bar.current.style.width = '0%';
  };

  const setup = (api: SceneApi) => buildL3Scene(api, () => stateRef.current!);

  const chartEl = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const cur = recs.length ? recs[recs.length - 1] : null;

  useEffect(() => {
    const el = chartEl.current;
    if (!el) return;
    const chart = chartRef.current ?? echarts.init(el);
    chartRef.current = chart;
    const data = recs.map((r) => [+r.fr.toFixed(2), +r.fm.toFixed(2)]);
    // 轴上限取整：浮点上限（如 3.3000000000000003）会让 ECharts 顶端刻度文字糊成一串
    const max = Math.ceil(Math.max(3, ...data.flat()) * 1.1);
    const axis = { axisLabel: { color: '#8ca0b8', fontSize: 11 }, axisLine: { lineStyle: { color: '#5a6b82' } }, nameTextStyle: { color: '#8ca0b8', fontSize: 11 } };
    chart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 46, right: 16, top: 26, bottom: 34 },
      xAxis: { type: 'value', name: 'F 理论/N', min: 0, max, ...axis },
      yAxis: { type: 'value', name: '实测 F/N', nameLocation: 'middle', nameGap: 38, min: 0, max, ...axis, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } } },
      series: [
        { type: 'line', data: [[0, 0], [max, max]], showSymbol: false, lineStyle: { color: '#4da6ff', width: 1.5, type: 'dashed' }, name: '理想 y=x' },
        { type: 'scatter', data, symbolSize: 10, itemStyle: { color: '#5eead4' }, name: '各组' },
      ],
    }, true);
  }, [recs]);

  useEffect(() => () => { chartRef.current?.dispose(); chartRef.current = null; }, []);

  const pass = !!cur && cur.err < 0.05 && recs.length >= 3;

  const submit = () => {
    if (!pass || !cur) return;
    recordLab({
      labId: 'L3', timestamp: Date.now(), variables: { f1, f2, deg },
      dataRows: { fr: recs.map((r) => r.fr), fm: recs.map((r) => r.fm) }, conclusionCorrect: true,
    });
    completeLab('L3', true);
    passQuiz('M3');
  };

  const exportCSV = () => {
    const rows = recs.map((r) => [r.id, r.f1, r.f2, r.deg, +r.fr.toFixed(3), +r.fm.toFixed(3), +(r.err * 100).toFixed(2)]);
    downloadCSV('L3-力的合成.csv', ['组次', 'F1/N', 'F2/N', '夹角/°', 'F合理论/N', 'F合实测/N', '误差/%'], rows);
  };

  const stepIdx = STAGES.indexOf(stage);

  return (
    <LabFrame
      labId="L3"
      step={stepIdx}
      onStep={(i) => { if (i <= stepIdx) setStage(STAGES[i]); }}
      toolbar={<span className="glass" style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12 }}>当前：{STAGE_LABEL[stage]}</span>}
      stage={<SceneHost setup={setup} />}
      panel={
        stage === 'setup' ? (
          <Panel title="布置 · 三力平衡" right={<span className="en" style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>F=√(F₁²+F₂²+2F₁F₂cosθ)</span>}>
            <Slider label="F₁" value={f1} min={1} max={6} step={0.5} unit=" N" onChange={setF1} />
            <Slider label="F₂" value={f2} min={1} max={6} step={0.5} unit=" N" onChange={setF2} />
            <Slider label="两力夹角 θ" value={deg} min={30} max={150} step={5} unit="°" onChange={setDeg} />
            <div style={{ fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.9 }}>
              平行四边形定则：F合 = <b style={{ color: 'var(--c-accent-2)' }}>{resultant(params).toFixed(3)}</b> N<br />
              用第三只测力计沿反方向把结点拉到同一点（等效替代），读数即合力实测值。
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>至少做 3 组不同夹角的数据，才能看出规律。</div>
            <button className="pill" style={{ alignSelf: 'flex-start', padding: '9px 20px', fontSize: 13 }} onClick={start}>开始测量 →</button>
          </Panel>
        ) : stage === 'run' ? (
          <Panel title="测量 · 读数稳定中">
            <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div ref={bar} style={{ height: '100%', width: '0%', background: 'var(--c-accent)' }} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.9, marginTop: 8 }}>
              把结点拉到同一位置后读取第三只测力计示数；指针抖动约 ±0.8%，取稳定值。
            </div>
          </Panel>
        ) : (
          <Panel title={`分析 · 第 ${cur?.id ?? 1} 组`}>
            <div style={{ fontSize: 13.5, color: 'var(--c-text-dim)', lineHeight: 2 }}>
              θ = {cur?.deg}°，F₁ = {cur?.f1} N，F₂ = {cur?.f2} N<br />
              F合 理论 = <b style={{ color: 'var(--c-accent-2)' }}>{cur?.fr.toFixed(3)}</b> N<br />
              F合 实测 = <b style={{ color: 'var(--c-accent)' }}>{cur?.fm.toFixed(3)}</b> N · 误差 {(cur ? cur.err * 100 : 0).toFixed(2)}%
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="pill" style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={() => setStage('setup')}>再测一组</button>
              <button className="pill" style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={exportCSV}>导出 CSV</button>
            </div>
          </Panel>
        )
      }
      dataArea={
        <Panel title="数据 · 合力对比" right={<span style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>{recs.length} 组</span>}>
          <div style={{ maxHeight: 170, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: 'var(--c-text-faint)', textAlign: 'left' }}>
                  <th style={th}>组</th><th style={th}>F₁/N</th><th style={th}>F₂/N</th><th style={th}>θ/°</th><th style={th}>F合理论</th><th style={th}>F合实测</th><th style={th}>误差</th>
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => (
                  <tr key={r.id} style={{ background: cur && cur.id === r.id ? 'rgba(77,166,255,0.16)' : undefined }}>
                    <td style={td}>{r.id}</td><td style={td}>{r.f1}</td><td style={td}>{r.f2}</td><td style={td}>{r.deg}</td>
                    <td style={{ ...td, color: 'var(--c-accent-2)' }}>{r.fr.toFixed(3)}</td>
                    <td style={{ ...td, color: 'var(--c-accent)' }}>{r.fm.toFixed(3)}</td>
                    <td style={td}>{(r.err * 100).toFixed(2)}%</td>
                  </tr>
                ))}
                {recs.length === 0 && <tr><td colSpan={7} style={{ ...td, color: 'var(--c-text-faint)' }}>尚无数据</td></tr>}
              </tbody>
            </table>
          </div>
          <div ref={chartEl} style={{ width: '100%', height: 190 }} />
          <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>实测点应落在 y = x 上，偏离即测量系统误差。</div>
        </Panel>
      }
      conclusion={
        <Panel title="结论校验 · 平行四边形定则">
          <div style={{ fontSize: 13.5, color: 'var(--c-text-dim)', lineHeight: 1.9 }}>
            两个互成角度的共点力，其合力大小与方向可用平行四边形定则求出；等效替代法读数应与之吻合。
          </div>
          <div style={{ fontSize: 13, color: pass ? 'var(--c-accent-2)' : 'var(--c-warn)' }}>
            {cur ? `当前判定：${pass ? '通过' : recs.length < 3 ? '需至少 3 组' : '误差偏大'}` : '尚未采集数据'}
          </div>
          <button className="pill" disabled={!pass} style={{ padding: '8px 18px', fontSize: 13, opacity: pass ? 1 : 0.5 }} onClick={submit}>验证：力的合成</button>
        </Panel>
      }
    />
  );
}

const th: React.CSSProperties = { padding: '4px 6px', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.08)' };
const td: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontVariantNumeric: 'tabular-nums' };
