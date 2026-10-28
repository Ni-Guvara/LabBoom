// 课程数据类型与加载器（content/curriculum.json 1:1）
import curriculumJson from '../../content/curriculum.json';

export type SubjectStatus = 'active' | 'reserved';

export interface Subject {
  status: SubjectStatus;
  label: string;
  labelEn: string;
}

export interface Stage {
  id: string;
  title: string;
  titleEn: string;
  module: string;
  subtitle: string;
  desc: string;
  status: SubjectStatus;
}

export interface Category {
  id: string;
  label: string;
  labelEn: string;
}

export interface Chapter {
  id: string;            // M1..M13
  title: string;
  stage: string;         // junior | senior
  category: string;      // mechanics | electromagnetism | ...
  prereq: string[];      // 前置章 id
  sections: string[];
  labs: string[];        // 实验关卡 id
  demoLabs: string[];   // 演示剧场 id
}

export interface Lab {
  id: string;            // L1..L12
  name: string;
  chapter: string;
  type: 'group';
  category: string;
  steps: string[];
  variables: string[];
  formula: string;
  goal: string;
  examPoints: string[];
}

export interface DemoLab {
  id: string;
  name: string;
  chapter: string;
  category: string;
}

/** 商业配置：哪些实验在卖、哪些还没做完（未开放的不进付费守卫，也不出现在选实验页） */
export interface Commerce {
  onSale: string[];
  comingSoon: string[];
}

export interface Curriculum {
  version: string;
  brand: string;
  title: string;
  subjects: Record<string, Subject>;
  stages: Stage[];
  categories: Category[];
  chapters: Chapter[];
  labs: Lab[];
  commerce?: Commerce;
  demoLabs: DemoLab[];
}

export const curriculum = curriculumJson as Curriculum;

export const labById = (id: string): Lab | undefined =>
  curriculum.labs.find((l) => l.id === id);

/** 未配置 commerce 时视为全部在售（兼容旧数据） */
export const isComingSoon = (id: string): boolean =>
  curriculum.commerce?.comingSoon.includes(id) ?? false;

export const isOnSale = (id: string): boolean =>
  curriculum.commerce ? curriculum.commerce.onSale.includes(id) : true;

export const chapterById = (id: string): Chapter | undefined =>
  curriculum.chapters.find((c) => c.id === id);

export const labsOfChapter = (chId: string): Lab[] =>
  curriculum.labs.filter((l) => l.chapter === chId);
