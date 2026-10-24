// Hero 区：深色页顶部的特大标题 + 副标 + CTA + 轮播圆点
interface HeroProps {
  title: string;          // 特大标题 ≤12 字
  subtitle?: string;      // 一句副标
  cta?: { label: string; to?: string; onClick?: () => void; disabled?: boolean };
  keywords?: string[];    // 关键词组（拾光：直观/沉浸/精准/联动）
}

export function Hero({ title, subtitle, cta, keywords }: HeroProps) {
  return (
    <section className="hero grow" style={wrap}>
      <div style={inner}>
        <h1 style={titleStyle}>{title}</h1>
        {subtitle && <p style={subStyle}>{subtitle}</p>}
        {keywords && keywords.length > 0 && (
          <div style={kwWrap}>
            {keywords.map((k) => (
              <span key={k} className="glass" style={kwChip}>
                {k}
              </span>
            ))}
          </div>
        )}
        {cta && (
          <button
            className="pill"
            style={{ marginTop: 22 }}
            onClick={cta.onClick}
            disabled={cta.disabled}
          >
            {cta.label}
          </button>
        )}
      </div>
    </section>
  );
}

const wrap: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '64px 28px 40px', textAlign: 'center', position: 'relative', zIndex: 1,
};
const inner: React.CSSProperties = { maxWidth: 760 };
const titleStyle: React.CSSProperties = {
  fontSize: 'clamp(34px, 6vw, 60px)', fontWeight: 800, lineHeight: 1.15,
  letterSpacing: '0.02em', textShadow: '0 6px 40px rgba(77,166,255,0.35)',
};
const subStyle: React.CSSProperties = {
  marginTop: 18, color: 'var(--c-text-dim)', fontSize: 17, lineHeight: 1.7, maxWidth: 620, margin: '18px auto 0',
};
const kwWrap: React.CSSProperties = { display: 'flex', gap: 12, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' };
const kwChip: React.CSSProperties = { padding: '6px 16px', borderRadius: 999, fontSize: 14, color: 'var(--c-text)' };
