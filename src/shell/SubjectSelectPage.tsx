// L1 学科选择页（§7.2）：左 hero + 右磨砂玻璃「选择学科」卡
import { useNavigate } from 'react-router-dom';
import { curriculum } from '@/content/curriculum';
import { Hero } from './Hero';

export function SubjectSelectPage() {
  const nav = useNavigate();
  const subjectEntries = Object.entries(curriculum.subjects);

  return (
    <div style={page}>
      <Hero
        title="学科可视化交互系统"
        subtitle="一套网页端三维交互实验系统，学生像进实验室一样按次第动手做实验，数据自动沉淀，最终拼出完整的必修知识体系。"
        keywords={['直观', '沉浸', '精准', '联动']}
      />
      <div style={cardsWrap}>
        <div className="glass" style={selectCard}>
          <div style={cardHeader}>
            <span className="en-up">SELECT SUBJECT</span>
            <span style={{ fontSize: 18, fontWeight: 700 }}>选择学科</span>
            <span style={{ color: 'var(--c-text-dim)', fontSize: 13 }}>请选择您要进入的学习领域</span>
          </div>
          <div style={grid}>
            {subjectEntries.map(([key, s]) => {
              const active = s.status === 'active';
              return (
                <button
                  key={key}
                  className="glass"
                  style={{ ...subjCard, opacity: active ? 1 : 0.55, cursor: active ? 'pointer' : 'not-allowed' }}
                  onClick={() => active && nav(`/stage/${key}`)}
                  disabled={!active}
                >
                  <div className="en-up" style={{ color: 'var(--c-accent-2)' }}>{s.labelEn}</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{s.label}</div>
                  <div style={{ fontSize: 12, color: active ? 'var(--c-text-dim)' : 'var(--c-warn)' }}>
                    {active ? '可用 →' : '敬请期待'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const page: React.CSSProperties = { position: 'relative', zIndex: 1, paddingBottom: 80 };
const cardsWrap: React.CSSProperties = { display: 'flex', justifyContent: 'center', padding: '0 28px' };
const selectCard: React.CSSProperties = { width: '100%', maxWidth: 720, padding: 28 };
const cardHeader: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 22 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 };
const subjCard: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start',
  padding: 18, textAlign: 'left', borderRadius: 14,
};
