// 顶部玻璃导航：左品牌位 + 学科徽章，右全局项
import { Link, useLocation } from 'react-router-dom';
import { curriculum } from '@/content/curriculum';

const NAV: { to: string; label: string; labelEn: string }[] = [
  { to: '/subject', label: '学科', labelEn: 'SUBJECT' },
  { to: '/stage/physics', label: '学段', labelEn: 'STAGE' },
  { to: '/modules/physics/senior', label: '模块', labelEn: 'MODULES' },
  { to: '/map', label: '知识地图', labelEn: 'MAP' },
];

export function TopNav() {
  const { pathname } = useLocation();
  return (
    <nav className="top-nav glass" style={topStyle}>
      <Link to="/subject" style={brandStyle}>
        <span style={{ color: 'var(--c-accent)', fontWeight: 800 }}>◉</span>
        <span style={{ fontWeight: 700 }}>{curriculum.brand}</span>
        <span className="en-up" style={{ color: 'var(--c-text-faint)' }}>
          · 高中物理 · v0.1
        </span>
      </Link>
      <div style={rightStyle}>
        {NAV.map((n) => {
          const active = pathname.startsWith(n.to);
          return (
            <Link key={n.to} to={n.to} style={{ ...navItem, color: active ? 'var(--c-accent)' : 'var(--c-text-dim)' }}>
              <span style={{ fontSize: 13 }}>{n.label}</span>
              <span className="en-up" style={{ color: 'inherit', opacity: 0.7 }}>{n.labelEn}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

const topStyle: React.CSSProperties = {
  position: 'sticky', top: 0, zIndex: 50,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  // 高度锁死 58：实验台用 calc(100dvh - 58px) 铺满视口，导航一改高度就会溢出滚动条
  height: 58, boxSizing: 'border-box',
  padding: '0 28px', borderRadius: 0, borderBottom: '1px solid var(--glass-border)',
  background: 'rgba(11,18,32,0.55)',
};
const brandStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, fontSize: 16 };
const rightStyle: React.CSSProperties = { display: 'flex', gap: 24 };
const navItem: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 };
