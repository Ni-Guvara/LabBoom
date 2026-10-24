// 知识地图（§3.1/§3.3）：银河图式地图，13 章星系 + 解锁 + 跨章桥
import { curriculum } from '@/content/curriculum';
import { useProgressStore, BRIDGES } from '@/store/progress';
import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';

// 用极坐标布局 13 个星系
function galaxyPos(i: number, total: number): { x: number; y: number } {
  const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
  const r = 32 + (i % 2) * 8;
  return { x: 50 + Math.cos(angle) * r, y: 50 + Math.sin(angle) * r };
}

export function KnowledgeMapPage() {
  const nav = useNavigate();
  const isUnlocked = useProgressStore((s) => s.isChapterUnlocked);
  const isLit = useProgressStore((s) => s.isChapterLit);
  const passed = useProgressStore((s) => s.chapterQuizPassed);
  const completed = useProgressStore((s) => s.labCompleted);

  const nodes = useMemo(
    () =>
      curriculum.chapters.map((c, i) => ({
        id: c.id,
        title: c.title,
        pos: galaxyPos(i, curriculum.chapters.length),
        unlocked: isUnlocked(c.id),
        lit: isLit(c.id),
        quiz: !!passed[c.id],
        labsDone: c.labs.filter((l) => completed[l]).length,
        labsTotal: c.labs.length,
      })),
    [isUnlocked, isLit, passed, completed]
  );

  const nodeById = (id: string) => nodes.find((n) => n.id === id);

  return (
    <div style={page}>
      <section style={{ textAlign: 'center', padding: '40px 28px 20px', position: 'relative', zIndex: 1 }}>
        <div className="en-up" style={{ color: 'var(--c-accent)' }}>KNOWLEDGE MAP</div>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginTop: 8 }}>知识地图 · 物理星图</h1>
        <p style={{ color: 'var(--c-text-dim)', marginTop: 10, maxWidth: 620, margin: '10px auto 0' }}>
          完成实验与章测验点亮星系，跨章连接线随之浮现。力学主线与电学主线在 M13 汇合。
        </p>
      </section>

      <div className="glass" style={mapWrap}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', position: 'absolute' }}>
          {BRIDGES.map(([a, b, label]) => {
            const na = nodeById(a), nb = nodeById(b);
            if (!na || !nb) return null;
            const bothLit = na.lit && nb.lit;
            return (
              <g key={`${a}-${b}`}>
                <line x1={na.pos.x} y1={na.pos.y} x2={nb.pos.x} y2={nb.pos.y}
                  stroke={bothLit ? 'rgba(94,234,212,0.6)' : 'rgba(140,160,184,0.18)'}
                  strokeWidth={0.4} strokeDasharray="1 1" />
                {bothLit && (
                  <text x={(na.pos.x + nb.pos.x) / 2} y={(na.pos.y + nb.pos.y) / 2}
                    fill="rgba(94,234,212,0.85)" fontSize="1.6" textAnchor="middle">{label}</text>
                )}
              </g>
            );
          })}
          {nodes.map((n) => (
            <g key={n.id} style={{ cursor: n.unlocked ? 'pointer' : 'not-allowed' }}
              onClick={() => n.unlocked && nav('/modules/physics/senior')}>
              <circle cx={n.pos.x} cy={n.pos.y} r={n.lit ? 2.6 : 2}
                fill={n.lit ? 'var(--c-accent-2)' : n.unlocked ? 'var(--c-accent)' : '#3a4a64'}
                opacity={n.unlocked ? 1 : 0.4}
                style={{ filter: n.lit ? 'drop-shadow(0 0 3px #5eead4)' : 'none' }} />
              <text x={n.pos.x} y={n.pos.y - 3.2} fill={n.unlocked ? '#f5f7fa' : '#8ca0b8'}
                fontSize="2.2" textAnchor="middle" fontWeight="700">{n.id}</text>
              <text x={n.pos.x} y={n.pos.y + 4} fill="#8ca0b8" fontSize="1.6" textAnchor="middle">
                {n.labsDone}/{n.labsTotal}{n.quiz ? ' ✓' : ''}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div style={legendRow}>
        <span style={dot('#5eead4')}>已点亮</span>
        <span style={dot('#4da6ff')}>已解锁</span>
        <span style={dot('#3a4a64')}>未解锁</span>
      </div>
    </div>
  );
}

const page: React.CSSProperties = { position: 'relative', zIndex: 1, paddingBottom: 80 };
const mapWrap: React.CSSProperties = {
  position: 'relative', width: 'min(680px, 92vw)', margin: '0 auto', aspectRatio: '1',
  borderRadius: 24,
};
const legendRow: React.CSSProperties = { display: 'flex', gap: 22, justifyContent: 'center', marginTop: 18, color: 'var(--c-text-dim)', fontSize: 13 };
const dot = (c: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, position: 'relative', color: c });
