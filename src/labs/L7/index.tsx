// L7 实验：验证机械能守恒定律。自由落体，½mv² = mgh
import { useEffect, useRef, useState } from 'react';
import { SceneHost } from '@/engine/SceneHost';
import { buildL7Scene, vel, type L7State } from './scene';
import { LabFrame } from '@/labs/_template/LabFrame';
import { Slider, Panel, DataTable } from '@/primitives/Primitives';
import { useProgressStore } from '@/store/progress';

const G = 9.8;

export default function L7Lab() {
  const [m, setM] = useState(0.2);
  const [h, setH] = useState(1.0);
  const [t, setT] = useState(0);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<{ h: number; v: number; Ek: number; Ep: number }[]>([]);
  const [step, setStep] = useState(0);

  const stateRef = useRef<L7State>({ m, h, running, t });
  stateRef.current = { m, h, running, t };

  const markStep = useProgressStore((s) => s.markStep);
  const recordLab = useProgressStore((s) => s.recordLab);
  const completeLab = useProgressStore((s) => s.completeLab);
  const passQuiz = useProgressStore((s) => s.passQuiz);

  const setup = (api: any) => buildL7Scene(api, () => stateRef.current);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = (now - last) / 1000;
      last = now;
      setT((prev) => {
        const nt = prev + dt;
        if (0.5 * G * nt * nt >= h) {
          setRunning(false);
          return prev;
        }
        return nt;
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, h]);

  const v = vel(h);
  const Ek = 0.5 * m * v * v;
  const Ep = m * G * h;
  const relErr = Math.abs(Ek - Ep) / Math.max(Ep, 1e-6);

  const drop = () => {
    setT(0);
    setRunning(true);
  };
  const record = () => setRows((r) => [...r, { h: +h.toFixed(2), v: +v.toFixed(3), Ek: +Ek.toFixed(3), Ep: +Ep.toFixed(3) }]);
  const onStep = (i: number) => {
    setStep(i);
    markStep('L7', ['装配', '测量', '结论'][i]);
  };
  const submit = (ok: boolean) => {
    if (ok) {
      recordLab({
        labId: 'L7',
        timestamp: Date.now(),
        variables: { m, h },
        dataRows: { h: rows.map((r) => r.h), Ek: rows.map((r) => r.Ek), Ep: rows.map((r) => r.Ep) },
        conclusionCorrect: true,
      });
      completeLab('L7', true);
      passQuiz('M8');
    }
  };

  return (
    <LabFrame
      labId="L7"
      step={step}
      onStep={onStep}
      toolbar={
        <button
          className="pill"
          style={{ padding: '6px 14px', fontSize: 12 }}
          onClick={() => {
            drop();
            if (step < 1) onStep(1);
          }}
          disabled={running}
        >
          {running ? '⏳ 下落中' : '▶ 释放'}
        </button>
      }
      stage={<SceneHost setup={setup} />}
      panel={
        <Panel title="参数面板 · 能量" right={<span className="en" style={{ color: 'var(--c-text-faint)', fontSize: 13 }}>½mv² = mgh</span>}>
          <Slider label="质量 m" value={m} min={0.05} max={0.5} step={0.05} unit=" kg" onChange={setM} />
          <Slider
            label="下落高度 h"
            value={h}
            min={0.2}
            max={2.5}
            step={0.1}
            unit=" m"
            onChange={(nv) => {
              setH(nv);
              setT(0);
            }}
          />
          <div style={{ fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            落地速度 v = √(2gh) = <b style={{ color: 'var(--c-accent)' }}>{v.toFixed(2)}</b> m/s<br />
            动能 Ek = ½mv² = <b style={{ color: 'var(--c-accent-2)' }}>{Ek.toFixed(3)}</b> J<br />
            势能 Ep = mgh = <b style={{ color: 'var(--c-accent-2)' }}>{Ep.toFixed(3)}</b> J<br />
            |Ek - Ep| / Ep ={' '}
            <b style={{ color: relErr < 0.01 ? 'var(--c-success)' : 'var(--c-warn)' }}>{(relErr * 100).toFixed(2)}%</b>
          </div>
          <button className="pill" style={{ alignSelf: 'flex-start', padding: '8px 18px', fontSize: 13 }} onClick={record}>
            记录此组数据 →
          </button>
        </Panel>
      }
      dataArea={
        <Panel title="数据表 · 能量对比">
          <DataTable
            columns={['h/m', 'v/(m/s)', 'Ek/J', 'Ep/J']}
            rows={rows.map((r) => [r.h, r.v, r.Ek, r.Ep])}
          />
        </Panel>
      }
      conclusion={
        <Panel title="结论校验 · 机械能守恒">
          <div style={{ fontSize: 14, color: 'var(--c-text-dim)', lineHeight: 1.8 }}>
            自由落体下落过程中，重力势能减少量等于动能增加量（不计阻力），机械能守恒。
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13 }} onClick={() => submit(true)}>
              验证 ½mv² = mgh，机械能守恒
            </button>
            <button className="pill" style={{ padding: '8px 18px', fontSize: 13 }} onClick={() => submit(false)}>
              未验证
            </button>
          </div>
        </Panel>
      }
    />
  );
}
