// L5 实验：探究平抛运动的特点。频闪留痕，验证水平匀速+竖直匀加速
import { useEffect, useRef, useState } from 'react';
import { SceneHost } from '@/engine/SceneHost';
import { buildL5Scene, posX, posY, type L5State } from './scene';
import { LabFrame } from '@/labs/_template/LabFrame';
import { Slider, Panel, DataTable } from '@/primitives/Primitives';
import { useProgressStore } from '@/store/progress';

const DT = 0.1; const G = 9.8;

export default function L5Lab() {
  const [v0, setV0] = useState(1.5);
  const [t, setT] = useState(0);
  const [running, setRunning] = useState(false);
  const [trails, setTrails] = useState<{ t: number; x: number; y: number }[]>([]);
  const [step, setStep] = useState(0);

  const stateRef = useRef<L5State>({ v0, t, running, trails });
  stateRef.current = { v0, t, running, trails };

  const markStep = useProgressStore((s) => s.markStep);
  const recordLab = useProgressStore((s) => s.recordLab);
  const completeLab = useProgressStore((s) => s.completeLab);
  const passQuiz = useProgressStore((s) => s.passQuiz);

  const setup = (api: any) => buildL5Scene(api, () => stateRef.current);

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
        if (idx > prevIdx && 0.5 + posY(stateRef.current, nt) > -2.5) {
          setTrails((tr) => [...tr, { t: +(idx * DT).toFixed(2), x: +posX(stateRef.current, idx * DT).toFixed(3), y: +posY(stateRef.current, idx * DT).toFixed(3) }]);
        }
        if (0.5 + posY(stateRef.current, nt) <= -2.5) { setRunning(false); return prev; }
        return nt;
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const reset = () => { setT(0); setTrails([]); setRunning(false); };
  const onStep = (i: number) => { setStep(i); markStep('L5', ['装配', '测量', '结论'][i]); };
  const submit = (ok: boolean) => { if (ok) { recordLab({ labId: 'L5', timestamp: Date.now(), variables: { v0 }, dataRows: { t: trails.map((p) => p.t), x: trails.map((p) => p.x), y: trails.map((p) => p.y) }, conclusionCorrect: true }); completeLab('L5', true); passQuiz('M5'); } };

  const dx = trails.length >= 2 ? (trails[1].x - trails[0].x) : 0;
  const horizUniform = trails.length >= 2 && trails.every((p, i) => i === 0 || Math.abs((p.x - trails[0].x) - dx * i) < 0.01);

  return (
    <LabFrame
      labId="L5" step={step} onStep={onStep}
      toolbar={<button className="pill" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => { setRunning((r) => !r); if (step < 1) onStep(1); }}>{running ? '⏸ 暂停' : '▶ 播放'}</button>}
      stage={<SceneHost setup={setup} />}
      panel={
        <Panel title="参数面板 · 时间操控" right={<span className="en" style={{ color: 'var(--c-text-faint)', fontSize: 13 }}>x = v0t, y = ½gt²</span>}>
          <Slider label="初速度 v0" value={v0} min={0.5} max={3} step={0.1} unit=" m/s" onChange={(v) => { setV0(v); reset(); }} />
          <div style={{ fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            时间 t = <b style={{ color: 'var(--c-accent)' }}>{t.toFixed(2)}</b> s<br />
            水平 x = <b style={{ color: 'var(--c-accent-2)' }}>{posX(stateRef.current, t).toFixed(2)}</b> m<br />
            竖直 y = <b style={{ color: 'var(--c-accent-2)' }}>{posY(stateRef.current, t).toFixed(2)}</b> m<br />
            vx = {v0} m/s（恒定）· vy = {(G * t).toFixed(2)} m/s
          </div>
          <button className="pill" style={{ alignSelf: 'flex-start', padding: '8px 18px', fontSize: 13 }} onClick={reset}>↺ 重置</button>
        </Panel>
      }
      dataArea={
        <Panel title="频闪数据 · 验证分运动">
          <DataTable columns={['t/s', 'x/m', 'y/m']} rows={trails.map((p) => [p.t, p.x, p.y])} />
          {trails.length >= 2 && (
            <div style={{ fontSize: 12.5, color: 'var(--c-text-dim)' }}>
              水平相邻 Δx = <b style={{ color: horizUniform ? 'var(--c-success)' : 'var(--c-warn)' }}>{dx.toFixed(3)} m</b>（{horizUniform ? '相等 → 匀速' : '不等'}）<br />
              竖直相邻 Δy 递增 → 匀加速（自由落体 g=9.8）
            </div>
          )}
        </Panel>
      }
      conclusion={
        <Panel title="结论校验 · 平抛运动的分运动">
          <div style={{ fontSize: 14, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            平抛可分解为：水平匀速直线运动 + 竖直自由落体运动，两分运动相互独立。
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13 }} onClick={() => submit(true)}>验证分运动独立</button>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13 }} onClick={() => submit(false)}>未验证</button>
          </div>
        </Panel>
      }
    />
  );
}
