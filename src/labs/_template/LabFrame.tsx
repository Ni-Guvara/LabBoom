// 实验台五区框架（§4.1）：所有实验复用
// 布局：学科徽章 + ① 3D 主舞台(宏观-微观切换) + ③ 参数面板/实时数据区 + ② 步骤条 + ④ 结论区
import type { ReactNode } from 'react';
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
  toolbar?: ReactNode;
}

export function LabFrame({ labId, step, onStep, stage, panel, dataArea, conclusion, toolbar }: LabFrameProps) {
  const nav = useNavigate();
  const lab = labById(labId);
  const ch = lab ? chapterById(lab.chapter) : undefined;
  const cat = ch ? curriculum.categories.find((c) => c.id === ch.category) : undefined;
  const steps = lab?.steps ?? ['装配', '测量', '结论'];
  const done: Record<string, boolean> = {};
  steps.forEach((s, i) => { if (i < step) done[s] = true; });

  return (
    <div style={page}>
      <div style={topBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="glass" style={badge}>
            <span className="en-up" style={{ color: 'var(--c-accent-2)' }}>高中物理 · 必修</span>
            {cat && <span style={{ color: 'var(--c-text-dim)' }}> · {cat.label}</span>}
          </span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{lab?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>
              {ch?.id} {ch?.title} · 公式 <span className="en">{lab?.formula}</span>
            </div>
          </div>
        </div>
        <button className="pill" style={{ padding: '8px 18px', fontSize: 13 }} onClick={() => nav('/modules/physics/senior')}>← 返回模块</button>
      </div>

      <div className="lab-mainrow" style={mainRow}>
        <div style={stageWrap}>
          {toolbar && <div style={toolbarStyle}>{toolbar}</div>}
          {stage}
          {/* 标注默认不显示：把光标停在某个器材上满 2 s 才亮出它的名称/读数 */}
          <div className="en-up" style={hoverHint}>悬停器材 2 s 显示标注</div>
        </div>
        <div style={sideCol}>{panel}{dataArea}</div>
      </div>

      <StepBar steps={steps} current={step} done={done} onJump={onStep} />
      <div>{conclusion}</div>
    </div>
  );
}

const page: React.CSSProperties = { position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 20px 40px' };
const topBar: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 };
const badge: React.CSSProperties = { padding: '6px 12px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 };
const mainRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12, minHeight: 460 };
const stageWrap: React.CSSProperties = { position: 'relative', minHeight: 460, borderRadius: 16, overflow: 'hidden' };
const toolbarStyle: React.CSSProperties = { position: 'absolute', top: 10, left: 10, zIndex: 5, display: 'flex', gap: 8 };
const hoverHint: React.CSSProperties = { position: 'absolute', right: 12, bottom: 10, zIndex: 4, fontSize: 10.5, letterSpacing: 1, color: 'var(--c-text-faint)', opacity: 0.6, pointerEvents: 'none' };
const sideCol: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
