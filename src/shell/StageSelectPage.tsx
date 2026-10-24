// L2 学段选择页（§7.2）：衬线英文大标 + 两张学段玻璃卡
import { useNavigate, useParams } from 'react-router-dom';
import { curriculum } from '@/content/curriculum';

export function StageSelectPage() {
  const { subject = 'physics' } = useParams();
  const nav = useNavigate();

  return (
    <div style={page}>
      <section className="grow" style={heroWrap}>
        <div className="en-up" style={{ color: 'var(--c-accent)', marginBottom: 10 }}>ACADEMIC FRAMEWORK</div>
        <h1 className="en" style={{ fontSize: 'clamp(36px, 6vw, 56px)', fontWeight: 700 }}>
          {subject === 'physics' ? 'Physics Curriculum.' : 'Curriculum.'}
        </h1>
        <p style={{ marginTop: 16, color: 'var(--c-text-dim)', maxWidth: 640, lineHeight: 1.7 }}>
          连接实证逻辑与理论之美。覆盖从宏观经典力学到微观量子边界的全尺度物理图景，按次第动手实验，数据沉淀成知识系统。
        </p>
      </section>

      <div style={cardsRow}>
        {curriculum.stages.map((st) => {
          const active = st.status === 'active';
          return (
            <div key={st.id} className="glass" style={{ ...stageCard, opacity: active ? 1 : 0.55 }}>
              <div className="en-up" style={{ color: 'var(--c-text-faint)' }}>{st.module}</div>
              <div className="en-up" style={{ color: 'var(--c-accent-2)', fontSize: 13 }}>{st.subtitle}</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>{st.title}</div>
              <div className="en" style={{ color: 'var(--c-text-dim)' }}>{st.titleEn}</div>
              <p style={{ marginTop: 14, color: 'var(--c-text-dim)', fontSize: 14, lineHeight: 1.7 }}>{st.desc}</p>
              <button
                className="pill"
                style={{ marginTop: 22 }}
                disabled={!active}
                onClick={() => active && nav(`/modules/${subject}/${st.id}`)}
              >
                {active ? '开启探究 →' : '敬请期待'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const page: React.CSSProperties = { position: 'relative', zIndex: 1, paddingBottom: 80 };
const heroWrap: React.CSSProperties = { textAlign: 'center', padding: '56px 28px 32px' };
const cardsRow: React.CSSProperties = { display: 'flex', gap: 24, justifyContent: 'center', padding: '0 28px', flexWrap: 'wrap' };
const stageCard: React.CSSProperties = {
  width: 340, padding: 28, display: 'flex', flexDirection: 'column',
  borderRadius: 20,
};
