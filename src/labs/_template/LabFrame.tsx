// 实验台框架 v2：3D 舞台铺满视口，参数/数据/绘图/结论收为右侧悬浮按钮 + 抽屉。
//
// 不再左右分栏：三维台面是主角，分栏会把舞台压扁、器材一放大就被裁。
// 抽屉用 transform 滑出而非条件渲染：ECharts 在抽屉里，卸载重挂会让实例
// 指向已脱离文档的 div（图变空白），保持挂载则容器尺寸恒定。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { StepBar } from '@/primitives/Primitives';
import { curriculum, labById, chapterById } from '@/content/curriculum';

export interface LabFrameProps {
  labId: string;
  step: number;
  onStep: (i: number) => void;
  stage: ReactNode;
  panel: ReactNode;
  dataArea: ReactNode;
  conclusion: ReactNode;
  /** 独立绘图区：给了才出现「绘图」按钮（未拆分的实验由 dataArea 兼作） */
  chart?: ReactNode;
  toolbar?: ReactNode;
}

type Tab = 'ops' | 'data' | 'chart' | 'conclusion';

export function LabFrame({
  labId, step, onStep, stage, panel, dataArea, conclusion, chart, toolbar,
}: LabFrameProps) {
  const nav = useNavigate();
  const lab = labById(labId);
  const ch = lab ? chapterById(lab.chapter) : undefined;
  const cat = ch ? curriculum.categories.find((c) => c.id === ch.category) : undefined;
  const steps = lab?.steps ?? ['装配', '测量', '结论'];
  const done: Record<string, boolean> = {};
  steps.forEach((s, i) => { if (i < step) done[s] = true; });

  // 手风琴：开一个就收别的，再点当前这个则全收（把台面让出来）
  // 默认全收：一进来先看完整器材，参数/数据按需展开
  const [tab, setTab] = useState<Tab | null>(null);
  const toggle = (t: Tab) => setTab((cur) => (cur === t ? null : t));

  const wrapRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrapRef.current?.requestFullscreen();
    } catch { /* 无用户手势或被 iframe 策略拒绝时保持原状 */ }
  };

  // 抽屉占宽同步给 3D 引擎：让取景中心落在没被挡住的区域（见 SceneHost 的 applyInset）
  useEffect(() => {
    const w = window.innerWidth <= 880 ? 0 : 410;
    window.dispatchEvent(new CustomEvent('labboom:inset', { detail: { width: tab ? w : 0 } }));
    return () => {
      window.dispatchEvent(new CustomEvent('labboom:inset', { detail: { width: 0 } }));
    };
  }, [tab]);

  const items: { id: Tab; label: string; en: string; node: ReactNode }[] = [
    { id: 'ops', label: '实验操作', en: 'CONTROL', node: panel },
    { id: 'data', label: '数据记录', en: 'DATA', node: dataArea },
    ...(chart ? [{ id: 'chart' as Tab, label: '数据绘图', en: 'PLOT', node: chart }] : []),
    { id: 'conclusion', label: '结论校验', en: 'RESULT', node: conclusion },
  ];

  return (
    <div style={shell}>
      <div style={topBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span className="glass" style={badge}>
            <span className="en-up" style={{ color: 'var(--c-accent-2)' }}>高中物理 · 必修</span>
            {cat && <span style={{ color: 'var(--c-text-dim)' }}> · {cat.label}</span>}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={titleStyle}>{lab?.name}</div>
            <div style={subTitleStyle}>
              {ch?.id} {ch?.title} · 公式 <span className="en">{lab?.formula}</span>
            </div>
          </div>
        </div>
        <button className="pill" style={backBtn} onClick={() => nav('/modules/physics/senior')}>← 返回模块</button>
      </div>

      <div ref={wrapRef} style={full ? stageWrapFull : stageWrap}>
        {toolbar && <div style={toolbarStyle}>{toolbar}</div>}
        {stage}

        <div style={dock}>
          {items.map((it) => (
            <button key={it.id} style={dockBtn(tab === it.id)} onClick={() => toggle(it.id)} title={it.en}>
              {it.label}
            </button>
          ))}
          <button style={dockBtn(false)} onClick={toggleFull} title={full ? '退出全屏（Esc）' : '全屏展示'}>
            {full ? '退出全屏' : '全屏'}
          </button>
        </div>

        {items.map((it) => (
          <aside key={it.id} style={drawer(tab === it.id)} aria-hidden={tab !== it.id}>
            {it.node}
          </aside>
        ))}

        <div style={stepDock}>
          <StepBar steps={steps} current={step} done={done} onJump={onStep} />
        </div>
        <div className="en-up" style={hoverHint}>左键拖动旋转 · 滚轮缩放 · 右键平移</div>
      </div>
    </div>
  );
}

const NAV_H = 58;

const shell: React.CSSProperties = {
  position: 'relative', zIndex: 1,
  height: `calc(100dvh - ${NAV_H}px)`, minHeight: 460,
  display: 'flex', flexDirection: 'column', gap: 8,
  padding: '10px 14px 12px',
};
const topBar: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 };
const badge: React.CSSProperties = { padding: '5px 11px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, whiteSpace: 'nowrap' };
const titleStyle: React.CSSProperties = { fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const subTitleStyle: React.CSSProperties = { fontSize: 11.5, color: 'var(--c-text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const backBtn: React.CSSProperties = { padding: '7px 16px', fontSize: 12.5, whiteSpace: 'nowrap', flexShrink: 0 };

const stageWrap: React.CSSProperties = {
  position: 'relative', flex: 1, minHeight: 0,
  borderRadius: 16, overflow: 'hidden',
  // 画布内拖拽不触发页面滚动 / 选中文本 / 触控板横扫返回
  touchAction: 'none', userSelect: 'none', overscrollBehavior: 'contain',
};
const stageWrapFull: React.CSSProperties = { ...stageWrap, borderRadius: 0, background: '#05070c' };
const toolbarStyle: React.CSSProperties = {
  position: 'absolute', top: 10, left: 10, zIndex: 6,
  display: 'flex', gap: 8, flexWrap: 'wrap', maxWidth: 'calc(100% - 260px)',
};
const dock: React.CSSProperties = {
  position: 'absolute', top: 10, right: 10, zIndex: 10,
  display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 420,
};
const stepDock: React.CSSProperties = {
  position: 'absolute', left: '50%', bottom: 10, transform: 'translateX(-50%)',
  zIndex: 7, maxWidth: 'calc(100% - 120px)',
  background: 'rgba(11,18,32,0.62)', backdropFilter: 'blur(14px)',
  border: '1px solid var(--glass-border)', borderRadius: 14,
};
const hoverHint: React.CSSProperties = {
  position: 'absolute', left: 12, bottom: 10, zIndex: 4,
  fontSize: 10.5, letterSpacing: 1, color: 'var(--c-text-faint)', opacity: 0.7, pointerEvents: 'none',
};
const drawer = (on: boolean): React.CSSProperties => ({
  position: 'absolute', top: 56, right: 10, width: 400, maxWidth: 'calc(100% - 24px)',
  maxHeight: 'calc(100% - 116px)', overflowY: 'auto', overflowX: 'hidden',
  zIndex: 9, transform: on ? 'translateX(0)' : 'translateX(calc(100% + 30px))',
  opacity: on ? 1 : 0, pointerEvents: on ? 'auto' : 'none',
  visibility: on ? 'visible' : 'hidden',
  transition: 'transform .28s cubic-bezier(.22,.68,0,1), opacity .2s ease, visibility .28s',
  // 台面是深色画布，抽屉只靠 Panel 自身的半透明玻璃会"糊"进背景，补一层实底
  background: 'rgba(8,13,22,0.82)', backdropFilter: 'blur(18px)',
  border: '1px solid var(--glass-border)', borderRadius: 16,
  boxShadow: '0 24px 60px rgba(0,0,0,0.5)', padding: 8,
});
const dockBtn = (on: boolean): React.CSSProperties => ({
  padding: '7px 11px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  borderRadius: 999, whiteSpace: 'nowrap',
  border: `1px solid ${on ? 'var(--c-accent)' : 'var(--glass-border)'}`,
  color: on ? '#fff' : 'var(--c-text-dim)',
  background: on
    ? 'linear-gradient(180deg, rgba(77,166,255,0.55), rgba(77,166,255,0.22))'
    : 'rgba(11,18,32,0.66)',
  backdropFilter: 'blur(12px)',
  boxShadow: on ? '0 6px 22px rgba(77,166,255,0.28)' : 'none',
  transition: 'background .2s ease, border-color .2s ease, color .2s ease',
});
