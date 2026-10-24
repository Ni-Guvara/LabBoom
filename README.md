# LabBoom · 高中物理三维交互实验系统

网页端三维交互实验系统，学生像进实验室一样按次第动手做实验，数据自动沉淀，最终拼出完整的必修物理知识体系。

- **内容底座**：人教版《普通高中教科书·物理》必修 第一册、第二册、第三册（2019 新课标）
- **技术栈**：Vite + React + TypeScript + three.js + zustand + ECharts + KaTeX
- **设计依据**：`douyin_analysis/高中物理三维交互实验系统-设计说明.md`（v1.2）
- **视觉基准**：`douyin_analysis/image/shiguang_*`（拾光视界深空玻璃壳层语言，见设计说明 §4.5）

## 开发

```bash
npm install
npm run dev      # 本地开发
npm run build    # 纯静态构建到 dist/（离线可双击 index.html）
npm run preview  # 预览构建产物
```

## P0 已实现

- `content/curriculum.json`：13 章 + 12 分组实验 + 依赖图 + 七类分类
- 壳层三页（学科→学段→模块）落地 §4.5 深空玻璃语言
- 实验台五区框架（§4.1）+ 交互原语 P1/P2/P3/P12（§4.2）
- L2「探究弹簧弹力与形变量的关系」完整闭环：装配→测量→结论 + F-x 拟合 + 章测验点亮
- 知识地图（13 章星系 + 解锁 + 跨章桥）+ 进度 localStorage 持久化
