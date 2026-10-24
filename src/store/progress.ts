// 进度系统（§3.2/§3.3）：章解锁(依赖图)、实验三步完成度、章测验、数据记录、localStorage 持久化
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { curriculum, chapterById } from '@/content/curriculum';

export interface LabRecord {
  labId: string;
  timestamp: number;
  variables: Record<string, number | string | boolean>;
  dataRows: Record<string, (number | string)[]>;
  conclusionCorrect: boolean | null;
}

export interface ProgressState {
  // 章测验通过状态
  chapterQuizPassed: Record<string, boolean>;
  // 实验三步完成度 0~1（每步独立）
  labStepDone: Record<string, Record<string, boolean>>; // labId -> stepName -> done
  // 实验整体完成（三步全 + 结论正确）
  labCompleted: Record<string, boolean>;
  // 实验数据记录
  records: LabRecord[];
  // 主题偏好
  theme: 'light' | 'dark';
  // 演示模式：一键放开全部章解锁（不破坏依赖图数据，仅便于体验）
  devUnlockAll: boolean;

  // 派生：章是否解锁（前置章全部 quizPassed；演示模式直接 true）
  isChapterUnlocked: (chId: string) => boolean;
  // 派生：章是否点亮（测验通过 + 其实验全部完成）
  isChapterLit: (chId: string) => boolean;

  markStep: (labId: string, step: string) => void;
  recordLab: (r: LabRecord) => void;
  passQuiz: (chId: string) => void;
  completeLab: (labId: string, ok: boolean) => void;
  setTheme: (t: 'light' | 'dark') => void;
  setDevUnlockAll: (v: boolean) => void;
  reset: () => void;
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      chapterQuizPassed: {},
      labStepDone: {},
      labCompleted: {},
      records: [],
      theme: 'dark',
      devUnlockAll: true,

      isChapterUnlocked: (chId) => {
        if (get().devUnlockAll) return true;
        const ch = chapterById(chId);
        if (!ch) return false;
        if (ch.prereq.length === 0) return true;
        return ch.prereq.every((p) => get().chapterQuizPassed[p] === true);
      },
      isChapterLit: (chId) => {
        const ch = chapterById(chId);
        if (!ch) return false;
        const quiz = get().chapterQuizPassed[chId] === true;
        const labsOk = ch.labs.every((lid) => get().labCompleted[lid] === true);
        return quiz && labsOk;
      },

      markStep: (labId, step) =>
        set((s) => ({
          labStepDone: {
            ...s.labStepDone,
            [labId]: { ...(s.labStepDone[labId] || {}), [step]: true },
          },
        })),

      recordLab: (r) => set((s) => ({ records: [...s.records, r] })),

      passQuiz: (chId) =>
        set((s) => ({ chapterQuizPassed: { ...s.chapterQuizPassed, [chId]: true } })),

      completeLab: (labId, ok) =>
        set((s) => ({ labCompleted: { ...s.labCompleted, [labId]: ok } })),

      setTheme: (t) => set({ theme: t }),

      setDevUnlockAll: (v) => set({ devUnlockAll: v }),

      reset: () =>
        set({ chapterQuizPassed: {}, labStepDone: {}, labCompleted: {}, records: [] }),
    }),
    {
      name: 'labboom-progress-v1',
      // 仅持久化数据，不持久化函数
      partialize: (s) => ({
        chapterQuizPassed: s.chapterQuizPassed,
        labStepDone: s.labStepDone,
        labCompleted: s.labCompleted,
        records: s.records,
        theme: s.theme,
      }),
    }
  )
);

// 依赖图跨章桥（§3.1）：已完成的章对之间的知识连接线
export const BRIDGES: [string, string, string][] = [
  ['M4', 'M7', 'F·s = ΔEk'],
  ['M4', 'L7', '动能定理'],
  ['M6', 'M7', '圆周 ↔ 引力'],
  ['M10', 'M13', '电场 ↔ 电磁感应'],
  ['M12', 'M13', '能量守恒'],
];

export { curriculum };
