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

export interface Curriculum {
  version: string;
  brand: string;
  title: string;
  subjects: Record<string, Subject>;
  stages: Stage[];
  categories: Category[];
  chapters: Chapter[];
  labs: Lab[];
  demoLabs: DemoLab[];
}

export const curriculum = curriculumJson as Curriculum;

export const labById = (id: string): Lab | undefined =>
  curriculum.labs.find((l) => l.id === id);

export const chapterById = (id: string): Chapter | undefined =>
  curriculum.chapters.find((c) => c.id === id);

export const labsOfChapter = (chId: string): Lab[] =>
  curriculum.labs.filter((l) => l.chapter === chId);
