// 实验入口守卫：无 token / token 无效 / 未开通该实验时，把人送回收款站。
// VITE_PAY_BASE 未配置时整层透明（开发、离线包、演示构建都不受影响）。
import { useEffect } from 'react';
import { PAY_ENABLED, payUrl, priceLabel } from './config';
import { usePayStore } from './store';

export function PayGate({ labId, children }: { labId: string; children: React.ReactNode }) {
  const status = usePayStore((s) => s.status);
  const sku = usePayStore((s) => s.sku);
  const canOpen = usePayStore((s) => s.canOpen);
  const init = usePayStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (!PAY_ENABLED) return <>{children}</>;
  if (status === 'ok' && canOpen(labId)) return <>{children}</>;
  if (status === 'idle' || status === 'checking') return <Screen title="正在校验开通状态" desc="连接收款服务，确认这个实验是否已开通…" />;
  if (status === 'offline') return <Offline />;

  // 已开通全站但没买这个实验 → 选实验；年卡到期 → 续费；其余（无 token/无效 token）→ 落地页
  const target =
    status === 'ok' ? payUrl('/buy/single') : status === 'expired' ? payUrl('/buy/year') : payUrl('/');

  const desc =
    status === 'ok'
      ? `当前开通的是「${sku === 'year' ? '年卡' : sku}」，这个实验不在权益范围内，正在前往开通页…`
      : status === 'expired'
        ? `年卡已到期（续费 ${priceLabel('year')}），正在前往续费…`
        : '没有检测到开通凭证，正在前往开通页…';

  return <RedirectScreen target={target} desc={desc} />;
}

function RedirectScreen({ target, desc }: { target: string; desc: string }) {
  useEffect(() => {
    // 用 replace：返回键不应该把人卡在校验页里反复弹回
    location.replace(target);
  }, [target]);

  return <Screen title="即将跳转" desc={desc} action={{ href: target, label: '手动打开开通页 →' }} />;
}

function Offline() {
  const recheck = usePayStore((s) => s.recheck);
  return (
    <Screen
      title="校验失败"
      desc="连不上收款服务，暂时无法确认开通状态。检查网络后重试；已经付过款不会因为这次失败丢失权益。"
      action={{ label: '重试', onClick: () => void recheck() }}
      secondary={{ href: payUrl('/'), label: '去开通页' }}
    />
  );
}

function Screen({
  title,
  desc,
  action,
  secondary,
}: {
  title: string;
  desc: string;
  action?: { href?: string; label: string; onClick?: () => void };
  secondary?: { href: string; label: string };
}) {
  return (
    <div style={wrap} data-pay-screen>
      <div className="glass" style={card}>
        <div className="en-up" style={{ color: 'var(--c-accent)', fontSize: 11, letterSpacing: 2 }}>
          LABBOOM · ACCESS
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>{title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--c-text-dim)', marginTop: 10 }}>{desc}</div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
          {action?.href && (
            <a className="pill" href={action.href} style={pillStyle}>
              {action.label}
            </a>
          )}
          {action?.onClick && (
            <button className="pill" onClick={action.onClick} style={pillStyle}>
              {action.label}
            </button>
          )}
          {secondary && (
            <a href={secondary.href} style={{ ...pillStyle, background: 'transparent', color: 'var(--c-text-dim)' }}>
              {secondary.label}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  minHeight: 'calc(100dvh - 58px)',
  padding: 24,
  position: 'relative',
  zIndex: 1,
};
const card: React.CSSProperties = {
  maxWidth: 460,
  padding: '34px 30px',
  borderRadius: 18,
  textAlign: 'center',
};
const pillStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '9px 18px',
  borderRadius: 999,
  fontSize: 13,
  border: '1px solid var(--glass-border)',
  color: 'var(--c-text)',
  textDecoration: 'none',
};
