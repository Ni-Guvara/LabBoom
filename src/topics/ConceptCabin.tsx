// 概念舱（§3.2 层1）：每章入口 3D 概念演示 + P13 公式符号动力学 + 2 检查点小题
import { useRef, useState } from 'react';
import { SceneHost, type SceneApi } from '@/engine/SceneHost';
import { useProgressStore } from '@/store/progress';
import { chapterById, type Chapter } from '@/content/curriculum';
import * as THREE from 'three';

interface CheckQ { q: string; options: string[]; answer: number }

export function ConceptCabin({ chapterId }: { chapterId: string }) {
  const ch = chapterById(chapterId) as Chapter;
  const passQuiz = useProgressStore((s) => s.passQuiz);
  const [picked, setPicked] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [done, setDone] = useState(false);

  const symbolBank = symbolBankFor(chapterId);
  const formula = formulaFor(chapterId);
  const correctSet = symbolBank;
  const checks = checksFor(chapterId);

  const pickedRef = useRef<string[]>([]);
  pickedRef.current = picked;
  const setup = (api: SceneApi) => buildCabinScene(api, chapterId, () => pickedRef.current);

  const togglePick = (sym: string) => {
    setPicked((p) => (p.includes(sym) ? p.filter((s) => s !== sym) : [...p, sym]));
  };
  const isComplete = correctSet.every((s) => picked.includes(s));
  const allCorrect = checks.every((c, i) => answers[i] === c.answer);

  const finish = () => {
    setDone(true);
    if (allCorrect) passQuiz(chapterId);
  };

  return (
    <div style={page}>
      <div style={header}>
        <span className="en-up" style={{ color: 'var(--c-accent)' }}>CONCEPT CABIN</span>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>{ch.id} · {ch.title}</h1>
        <p style={{ color: 'var(--c-text-dim)', marginTop: 6 }}>拖入符号组装公式，公式名自动标注；完成 2 道检查点后放行实验。</p>
      </div>

      <div style={row}>
        <div style={stageWrap}><SceneHost setup={setup} /></div>
        <div style={sideCol}>
          <div className="glass" style={panel}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>符号抽屉（P13）</div>
            <div style={symGrid}>
              {symbolBank.map((s) => (
                <button key={s} className="glass" style={{ ...symChip, borderColor: picked.includes(s) ? 'var(--c-accent)' : 'var(--glass-border)' }} onClick={() => togglePick(s)}>
                  <span className="en" style={{ fontSize: 20 }}>{s}</span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--c-text-dim)' }}>
              已选：<b className="en" style={{ color: isComplete ? 'var(--c-accent-2)' : 'var(--c-warn)' }}>{picked.join(' ')}</b>
              <div className="en" style={{ marginTop: 4, color: 'var(--c-text)' }}>{formula}</div>
              {isComplete && <div style={{ color: 'var(--c-success)' }}>✓ 公式组装完整，符号按规律运动</div>}
              {!isComplete && picked.length > 0 && <div style={{ color: 'var(--c-warn)' }}>× 缺少符号，运动失常</div>}
            </div>
          </div>

          <div className="glass" style={panel}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>概念检查点</div>
            {checks.map((c, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 14, color: 'var(--c-text-dim)', marginBottom: 6 }}>{i + 1}. {c.q}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {c.options.map((o, j) => (
                    <button key={j} onClick={() => setAnswers((a) => ({ ...a, [i]: j }))} style={{
                      textAlign: 'left', padding: '8px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                      border: `1px solid ${answers[i] === j ? (j === c.answer ? 'var(--c-success)' : 'var(--c-error)') : 'var(--glass-border)'}`,
                      background: answers[i] === j ? 'rgba(77,166,255,0.1)' : 'transparent', color: 'var(--c-text)',
                    }}>{o}</button>
                  ))}
                </div>
              </div>
            ))}
            <button className="pill" style={{ marginTop: 4, padding: '8px 18px', fontSize: 13 }} disabled={!allCorrect || done} onClick={finish}>
              {done && allCorrect ? '✓ 已放行实验' : '完成检查点 →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 概念舱 3D 场景：符号作为发光球在椭圆轨道运动，缺符号则停转（P13）
function buildCabinScene(api: SceneApi, chId: string, getPicked: () => string[]): () => void {
  const { scene, camera, addAnchor, onTick } = api;
  camera.position.set(0, 3, 7);
  camera.lookAt(0, 1, 0);

  const orbit = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.015, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0x4da6ff, transparent: true, opacity: 0.35 })
  );
  orbit.rotation.x = Math.PI / 2;
  orbit.position.y = 1;
  scene.add(orbit);

  const symbols = symbolBankFor(chId);
  const balls: THREE.Mesh[] = [];
  symbols.forEach((s) => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0x5eead4, emissive: 0x2a6a5a, emissiveIntensity: 0.6 })
    );
    scene.add(m);
    balls.push(m);
    addAnchor(m, s);
  });

  let t = 0;
  onTick((dt) => {
    const picked = getPicked();
    const complete = symbols.every((s) => picked.includes(s));
    if (complete) t += dt;
    balls.forEach((b, i) => {
      const ang = complete ? t * 0.6 + (i / balls.length) * Math.PI * 2 : (i / balls.length) * Math.PI * 2;
      b.position.set(Math.cos(ang) * 2.2, 1, Math.sin(ang) * 2.2);
      (b.material as THREE.MeshStandardMaterial).color.set(complete ? 0x5eead4 : 0x553322);
    });
  });

  return () => {};
}

// 章数据（力学线 M1~M8 概念舱填充）
function symbolBankFor(chId: string): string[] {
  const bank: Record<string, string[]> = {
    M1: ['v', 'Δx', 'Δt'], M2: ['v', 'v0', 'a', 't'], M3: ['F', 'k', 'x'],
    M4: ['F', 'm', 'a'], M5: ['v0', 'g', 't', 'x'], M6: ['F', 'm', 'ω', 'r'],
    M7: ['G', 'M', 'm', 'r'], M8: ['½', 'm', 'v²', 'g', 'h'],
  };
  return bank[chId] || ['x', 'y', 'F', 'm'];
}
function formulaFor(chId: string): string {
  const f: Record<string, string> = {
    M1: 'v = Δx/Δt', M2: 'v = v0 + at', M3: 'F = kx', M4: 'F = ma',
    M5: 'x = v0t + ½gt²', M6: 'F = mω²r', M7: 'F = GMm/r²', M8: '½mv² = mgh',
  };
  return f[chId] || 'y = kx';
}
function checksFor(chId: string): CheckQ[] {
  const bank: Record<string, CheckQ[]> = {
    M1: [
      { q: '瞬时速度的定义是？', options: ['v = Δx/Δt', 'v = x·t', 'v = x+t'], answer: 0 },
      { q: '当 Δt→0 时得到的是？', options: ['瞬时速度', '平均速度', '位移'], answer: 0 },
    ],
    M2: [
      { q: '匀变速直线运动速度与时间关系？', options: ['v = v0 + at', 'v = v0·t', 'v = a/t'], answer: 0 },
      { q: '自由落体加速度 g 约为？', options: ['9.8 m/s²', '1 m/s²', '0'], answer: 0 },
    ],
    M3: [
      { q: '胡克定律表达式？', options: ['F = kx', 'F = k/x', 'F = x/k'], answer: 0 },
      { q: '弹力方向与形变方向？', options: ['相反（恢复形变）', '相同', '垂直'], answer: 0 },
    ],
    M4: [
      { q: '牛顿第二定律表达式？', options: ['F = ma', 'F = m/a', 'a = Fm'], answer: 0 },
      { q: '质量不变时加速度与外力成？', options: ['正比', '反比', '无关'], answer: 0 },
    ],
    M5: [
      { q: '平抛可分解为？', options: ['水平匀速+竖直匀加速', '两方向都匀速', '两方向都匀加速'], answer: 0 },
      { q: '竖直分运动是？', options: ['自由落体 g=9.8', '匀速上升', '静止'], answer: 0 },
    ],
    M6: [
      { q: '向心力公式？', options: ['F = mω²r', 'F = mr', 'F = ω/r'], answer: 0 },
      { q: 'm、r 不变时向心力与 ω² 成？', options: ['正比', '反比', '无关'], answer: 0 },
    ],
    M7: [
      { q: '万有引力定律？', options: ['F = GMm/r²', 'F = GMr', 'F = G/r'], answer: 0 },
      { q: '引力随距离增大而？', options: ['减小', '增大', '不变'], answer: 0 },
    ],
    M8: [
      { q: '机械能守恒条件？', options: ['只有重力/弹力做功', '有力做功', '始终守恒'], answer: 0 },
      { q: '自由落体下落 h，速度 v = ?', options: ['√(2gh)', 'gh', '2gh'], answer: 0 },
    ],
  };
  return bank[chId] || [
    { q: '该章核心公式？', options: [formulaFor(chId), 'y=kx', '其它'], answer: 0 },
    { q: '检查点 2', options: ['A', 'B', 'C'], answer: 0 },
  ];
}

const page: React.CSSProperties = { position: 'relative', zIndex: 1, padding: '14px 20px 40px' };
const header: React.CSSProperties = { textAlign: 'center', marginBottom: 18 };
const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12 };
const stageWrap: React.CSSProperties = { height: 420, borderRadius: 16, overflow: 'hidden' };
const sideCol: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const panel: React.CSSProperties = { borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 };
const symGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(54px,1fr))', gap: 8 };
const symChip: React.CSSProperties = { padding: '10px 0', textAlign: 'center', borderRadius: 10, cursor: 'pointer' };
