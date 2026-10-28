// 实验台路由：按 labId 懒加载，未实现的实验给占位（设计说明 §6.3 分阶段）
// 进门前先过付费守卫：未开通的人被送回收款站，不会看到场景。
import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { labById, isComingSoon } from '@/content/curriculum';
import { PayGate } from '@/pay/PayGate';

const L1 = lazy(() => import('@/labs/L1'));
const L2 = lazy(() => import('@/labs/L2'));
const L3 = lazy(() => import('@/labs/L3'));
const L4 = lazy(() => import('@/labs/L4'));
const L5 = lazy(() => import('@/labs/L5'));
const L6 = lazy(() => import('@/labs/L6'));
const L7 = lazy(() => import('@/labs/L7'));
const L8 = lazy(() => import('@/labs/L8'));
const L9 = lazy(() => import('@/labs/L9'));
const L10 = lazy(() => import('@/labs/L10'));
const L11 = lazy(() => import('@/labs/L11'));
const L12 = lazy(() => import('@/labs/L12'));

export function LabRoute() {
  const { labId = '' } = useParams();
  const lab = labById(labId);

  if (!lab) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--c-text-dim)' }}>实验不存在</div>;

  // 未开放的实验直接挡在门外：既不给未付费的人，也不给已付费的人（避免卖半成品）
  if (isComingSoon(labId)) return <ComingSoon lab={lab} />;

  const impl: Record<string, React.LazyExoticComponent<() => JSX.Element>> = {
    L1: L1 as any,
    L2: L2 as any,
    L3: L3 as any,
    L4: L4 as any,
    L5: L5 as any,
    L6: L6 as any,
    L7: L7 as any,
    L8: L8 as any,
    L9: L9 as any,
    L10: L10 as any,
    L11: L11 as any,
    L12: L12 as any,
  };
  const Comp = impl[labId];

  return (
    <PayGate labId={labId}>
      <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--c-text-dim)' }}>加载 3D 场景…</div>}>
        {Comp ? <Comp /> : <Placeholder lab={lab} />}
      </Suspense>
    </PayGate>
  );
}

function Placeholder({ lab }: { lab: NonNullable<ReturnType<typeof labById>> }) {
  return (
    <div style={{ padding: '60px 28px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
      <div className="en-up" style={{ color: 'var(--c-accent)' }}>COMING SOON</div>
      <h1 style={{ fontSize: 30, fontWeight: 800, marginTop: 10 }}>{lab.name}</h1>
      <p style={{ color: 'var(--c-text-dim)', marginTop: 12, maxWidth: 560, margin: '12px auto 0' }}>{lab.goal}</p>
      <div className="glass" style={{ display: 'inline-block', marginTop: 28, padding: '14px 22px', borderRadius: 14 }}>
        <span className="en" style={{ color: 'var(--c-text)' }}>{lab.formula}</span>
        <span style={{ color: 'var(--c-text-faint)', marginLeft: 12 }}>· 该实验将在 P1/P2 阶段实现</span>
      </div>
    </div>
  );
}

/** 未开放（commerce.comingSoon）：不给入口，也不参与售卖 */
function ComingSoon({ lab }: { lab: NonNullable<ReturnType<typeof labById>> }) {
  return (
    <div style={{ padding: '60px 28px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
      <div className="en-up" style={{ color: 'var(--c-text-faint)' }}>UNDER CONSTRUCTION</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 10 }}>{lab.name}</h1>
      <p style={{ color: 'var(--c-text-dim)', marginTop: 12, maxWidth: 520, margin: '12px auto 0', lineHeight: 1.7 }}>
        这个实验还在制作中，暂未开放。已经在做，做完会直接出现在模块列表里。
      </p>
      <div className="glass" style={{ display: 'inline-block', marginTop: 26, padding: '12px 20px', borderRadius: 14 }}>
        <span className="en" style={{ color: 'var(--c-text)' }}>{lab.formula}</span>
        <span style={{ color: 'var(--c-text-faint)', marginLeft: 12 }}>· COMING SOON</span>
      </div>
    </div>
  );
}
