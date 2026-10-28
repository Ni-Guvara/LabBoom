// L3 模块列表页（§7.2 / §4.5-4/5）：
// Hero slogan + 中英双语分类 Tab + 模块卡网格（封面=3D 场景缩略图占位 + 信息条 + 查看实验）
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { curriculum, labById, isComingSoon, type Chapter, type Lab } from '@/content/curriculum';
import { useProgressStore } from '@/store/progress';
import { PAY_ENABLED, payUrl } from '@/pay/config';
import { usePayStore } from '@/pay/store';
import { Hero } from './Hero';

export function ModuleListPage() {
  const { stage = 'senior' } = useParams();
  const nav = useNavigate();
  const isUnlocked = useProgressStore((s) => s.isChapterUnlocked);
  const devUnlockAll = useProgressStore((s) => s.devUnlockAll);
  const setDevUnlockAll = useProgressStore((s) => s.setDevUnlockAll);
  const payStatus = usePayStore((s) => s.status);
  const paySku = usePayStore((s) => s.sku);
  const canOpen = usePayStore((s) => s.canOpen);
  const [cat, setCat] = useState('all');

  const chapters = curriculum.chapters.filter((c) => c.stage === stage);
  const labs: { lab: Lab; ch: Chapter }[] = [];
  chapters.forEach((ch) => ch.labs.forEach((lid) => {
    const l = labById(lid);
    if (l) labs.push({ lab: l, ch });
  }));
  const visible = labs.filter(({ lab, ch }) =>
    cat === 'all' ? true : lab.category === cat || ch.category === cat
  );

  return (
    <div style={page}>
      <Hero
        title="公式，从此有了形状"
        subtitle="不止于计算，亲眼见证物理的底层逻辑。选择一个实验关卡，进入三维实验台动手测量。"
      />

      {/* 解锁工具条：次第解锁 / 演示全解锁 */}
      <div style={unlockBar}>
        <span style={{ fontSize: 13, color: 'var(--c-text-dim)' }}>
          {devUnlockAll ? '演示模式：全部实验已解锁' : '学习次第：完成前置章「概念舱」检查点即自动解锁'}
        </span>
        {PAY_ENABLED && (
          <span style={payBadge(payStatus === 'ok')}>
            {payStatus === 'checking' || payStatus === 'idle'
              ? '开通状态：校验中…'
              : payStatus === 'ok'
                ? `已开通：${paySku === 'year' ? '全站年卡' : paySku}`
                : payStatus === 'expired'
                  ? '年卡已到期'
                  : payStatus === 'offline'
                    ? '开通状态：校验失败'
                    : '未开通'}
          </span>
        )}
        <button
          className="pill"
          style={{ padding: '6px 14px', fontSize: 12 }}
          onClick={() => setDevUnlockAll(!devUnlockAll)}
        >
          {devUnlockAll ? '↺ 恢复次第解锁' : '🔓 全部解锁（演示）'}
        </button>
      </div>

      {/* 分类 Tab（中英双语） */}
      <div style={tabBar}>
        {curriculum.categories.map((c) => {
          const active = cat === c.id;
          return (
            <button key={c.id} onClick={() => setCat(c.id)} style={{ ...tab, borderBottomColor: active ? 'var(--c-accent)' : 'transparent', color: active ? 'var(--c-text)' : 'var(--c-text-dim)' }}>
              <span className="en-up">{c.labelEn}</span>
              <span style={{ fontSize: 13 }}>／{c.label}</span>
            </button>
          );
        })}
      </div>

      <div style={grid}>
        {visible.map(({ lab, ch }) => {
          const unlocked = isUnlocked(ch.id);
          // 两把锁：未开放（还没做完，不卖）/ 未开通（没买这一课）；学习次第的锁保持原样
          const coming = isComingSoon(lab.id);
          const payOk = !PAY_ENABLED || canOpen(lab.id);
          const go = () => {
            if (coming) return;
            if (!payOk) {
              location.href = payUrl('/buy/single');
              return;
            }
            nav(unlocked ? `/lab/${lab.id}` : `/cabin/${ch.id}`);
          };
          return (
            <button
              key={lab.id}
              className="glass"
              title={coming ? '该实验还在制作中，暂未开放' : undefined}
              style={{ ...moduleCard, opacity: coming ? 0.45 : !payOk ? 0.7 : unlocked ? 1 : 0.65, cursor: coming ? 'not-allowed' : 'pointer' }}
              onClick={go}
            >
              {/* 封面：该实验 three.js 场景的真实截图（scripts/capture-covers.mjs 生成），
                  还没有影棚渲染的关卡回退到线稿风格占位，不拿半成品截图充数 */}
              <div style={cover(lab.category)}>
                <LabCover id={lab.id} category={lab.category} formula={lab.formula} />
              </div>
              <div style={infoBar}>
                <div className="en-up" style={{ color: 'var(--c-accent-2)' }}>
                  {curriculum.categories.find((c) => c.id === lab.category)?.labelEn}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{lab.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--c-text-dim)', marginTop: 4, lineHeight: 1.5 }}>{lab.goal}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <span className="en" style={{ color: 'var(--c-text-faint)', fontSize: 13 }}>{lab.formula}</span>
                  <span style={{ fontSize: 12, color: coming ? 'var(--c-text-faint)' : payOk && unlocked ? 'var(--c-accent)' : 'var(--c-warn)' }}>
                    {coming
                      ? '未开放 · COMING SOON'
                      : !payOk
                        ? '🔒 未开通 · 去开通 →'
                        : unlocked
                          ? '查看实验 →'
                          : `🔒 去概念舱解锁（先过 ${ch.prereq.join('·')}）→`}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 已生成影棚截图的关卡（scripts/capture-covers.mjs 产出物，新增后在此登记） */
const HAS_COVER = new Set(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']);

function LabCover({ id, category, formula }: { id: string; category: string; formula: string }) {
  if (!HAS_COVER.has(id)) return <CoverGlyph category={category} formula={formula} />;
  return (
    <img
      src={`${import.meta.env.BASE_URL}covers/${id}.jpg`}
      alt=""
      loading="lazy"
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );
}

// 无截图关卡的回退封面：按分类配色的坐标纸线稿，视觉上明确是"示意图"而非成品渲染
function CoverGlyph({ category, formula }: { category: string; formula: string }) {
  const hue = category === 'mechanics' ? '#4da6ff' : category === 'electromagnetism' ? '#b98bff' : '#5eead4';
  return (
    <div
      style={{
        position: 'relative', width: '100%', height: '100%', display: 'grid', placeItems: 'center',
        backgroundImage: `linear-gradient(${hue}1f 1px, transparent 1px), linear-gradient(90deg, ${hue}1f 1px, transparent 1px)`,
        backgroundSize: '22px 22px',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div className="en" style={{ fontSize: 15, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.7)' }}>{formula}</div>
        <div className="en-up" style={{ fontSize: 9.5, letterSpacing: 1.6, color: 'var(--c-text-faint)', marginTop: 10 }}>
          schematic · 影棚渲染待补
        </div>
      </div>
    </div>
  );
}

const cover = (_cat: string): React.CSSProperties => ({
  height: 150, borderRadius: '14px 14px 0 0', overflow: 'hidden',
  background: 'radial-gradient(120% 80% at 50% 20%, rgba(77,166,255,0.16), rgba(11,18,32,0.6))',
  borderBottom: '1px solid var(--glass-border)',
});

const payBadge = (ok: boolean): React.CSSProperties => ({
  fontSize: 12, padding: '4px 12px', borderRadius: 999,
  border: `1px solid ${ok ? 'rgba(94,234,212,0.45)' : 'var(--glass-border)'}`,
  color: ok ? 'var(--c-accent-2, #5eead4)' : 'var(--c-text-faint)',
  background: ok ? 'rgba(94,234,212,0.10)' : 'transparent',
});
const page: React.CSSProperties = { position: 'relative', zIndex: 1, paddingBottom: 80 };
const unlockBar: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap', padding: '0 28px 20px', position: 'relative', zIndex: 1 };
const tabBar: React.CSSProperties = { display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', padding: '0 28px 24px', position: 'relative', zIndex: 1 };
const tab: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 18px', background: 'transparent', border: 'none', borderBottom: '2px solid', cursor: 'pointer' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 22, padding: '0 28px', position: 'relative', zIndex: 1 };
const moduleCard: React.CSSProperties = { display: 'flex', flexDirection: 'column', textAlign: 'left', borderRadius: 16, overflow: 'hidden', padding: 0 };
const infoBar: React.CSSProperties = { padding: 16, display: 'flex', flexDirection: 'column' };
