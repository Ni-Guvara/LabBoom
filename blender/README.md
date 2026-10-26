# 器材三维建模流程（Blender → glb → three）

本目录是 LabBoom 器材模型的**唯一产出地**。模型不是手搓的 `.blend` 文件，而是**脚本生成**的——
改尺寸、改结构都改脚本、重新导出，保证十几件器材的坐标约定绝对一致。

## 一条命令跑通

```bash
# 1 生成/更新模型（不需要打开 Blender 界面）
#    打点计时器：单件脚本，直接给输出路径
"C:/Users/niguv/.workbuddy/binaries/blender/blender-4.5.9-windows-x64/blender.exe" \
  -b -P blender/build_ticker_timer.py -- --out public/models/ticker_timer.glb
#    气垫导轨 + 滑行器：一个脚本出两个 glb，只给目录
"C:/Users/niguv/.workbuddy/binaries/blender/blender-4.5.9-windows-x64/blender.exe" \
  -b -P blender/build_air_track.py -- --outdir public/models

# 2 校验产物（命名/原点/材质/面数，不通过会非零退出）
python blender/inspect_glb.py public/models/ticker_timer.glb

# 3 离屏渲一张看造型（不用进浏览器）
#    --view section 是端面正交：三角型材、倒 V 槽这类截面，俯视角根本看不出来
"C:/Users/niguv/.workbuddy/binaries/blender/blender-4.5.9-windows-x64/blender.exe" \
  -b -P blender/render_preview.py -- --glb public/models/ticker_timer.glb --out blender/preview/ticker_timer.png

# 3b 配合关系必须合起来看：滑行器骑上导轨，只有端面视角能看出 V 槽是否贴合
"C:/Users/niguv/.workbuddy/binaries/blender/blender-4.5.9-windows-x64/blender.exe" \
  -b -P blender/render_preview.py -- --glb public/models/air_track.glb \
  --add "public/models/sled.glb@0,0,0.11" --view section --ortho 0.26 \
  --hide bumper,spring,hook,air_hose,air_port --out blender/preview/assembly.png

# 4 构建后看它在真实场景里的样子（含点击拾取自检）
npm run build && npm run preview
node scripts/capture-model.mjs ticker_timer
node scripts/probe-pick.mjs ticker_timer
```

## 硬约定（改错一条后面全返工）

| 项 | 约定 | 为什么 |
|---|---|---|
| 单位 | 1 单位 = 1 米，按真实尺寸建 | 与 `src/labs/_shared/instruments.ts` 同一把尺，模型才能替换程序化器材 |
| 坐标 | X 长轴 / Y 进深 / Z 向上，导出勾 `+Y Up` | three 是 Y-up，勾了这个就不用再转 |
| 原点 | **底面接触中心** | `root.position.y = 0` 就贴台面，不用手调 |
| 部件 | 每个部件一个网格，名字 = `partId` | P11「点击即解释」按这个名字取文案 |
| 材质 | 只出 baseColor / metallic / roughness / **coat**，不烘焙光照 | 光照由 `studioEnvironment()` 统一给，烘进贴图会和现有器材打架 |
| 材质复用 | 同名材质只建一次 | 控制 draw call；单件器材 ≤ 12 份 |
| 面数 | 单件 2k~8k 三角面 | 12 个实验全上也不超 15 万面 |
| 文字 | 不把任何文字烘进模型 | 读数走 canvas 贴图（`textPlate`），标注走 CSS2D |

## 踩过的坑（写进规范，别重复）

1. **多材质网格会被拆开**：一条纸带如果既有"纸"材质又有"点迹"材质，glTF 里就是两个 primitive，
   three 加载后变成 `Group(tape) + tape_1 + tape_2`，按 `tape` 取不到。
   `src/engine/loader.ts` 已做父级回退，新器材照这个逻辑走。
2. **高亮框会吃掉拾取**：`BoxHelper` 是 `LineSegments`，而 Line 的射线阈值默认 1 个世界单位，
   挂在场景里会挡在所有器材前面。加进场景后必须 `helper.raycast = () => {}`。
3. **面积光按固定瓦数会过曝**：0.15 m 的小件在 0.4 m 距离上，20 W 就够了。
   `render_preview.py` 里按包围盒对角线折算。
4. **不要把光照烘进模型**：见上表。
5. **底面不落 0 会浮空**：`inspect_glb.py` 会拦住，别绕过它。

## 几何原语：什么形状用什么

| 原语 | 用途 | 要点 |
|---|---|---|
| `box` | 方块、板、支架 | size 是全尺寸，center 是几何中心 |
| `cyl` | 轴、柱、盘 | `axis` 选 X/Y/Z 决定轴向 |
| `torus` | 圈簧、挂钩、轮槽 | `axis` 同上 |
| `rod_between` | 两点间的杆（导线、支杆） | 自动算朝向与长度 |
| `hexnut` | 六角螺母 | 6 边圆柱，不加倒角 |
| **`prism`** | **沿 X 挤出的任意闭合截面** | 铝型材、折弯件只能用它。`profile=[(y,z),...]` 直接写真实尺寸 |
| **`box_array`** | **一组盒体合并成一个网格** | 刻度线这类上百个小件，不合并会把 partId 索引淹掉 |
| **`disc_array`** | **一组共面小圆片合并成一个网格** | 气浮孔、指示点。法线按 `u×v=n` 构造，朝外不会反 |

`prism` / `box_array` / `disc_array` 生成的对象**原点留在 (0,0,0)**（顶点直接是世界坐标）。
后果：自检脚本不能用 `getWorldPosition()` 定位这些部件，必须用 `Box3.setFromObject(mesh).getCenter()`——
否则投影落到地面，测出来永远是"没命中"。`scripts/probe-pick.mjs` 已按这个写。

## 截面类器材的建模要点（气垫导轨为例）

- **顶角必须和滑行器内腔同角**：导轨斜面 40.6°，滑行器 V 壁就得 40.6°，差 1° 就会一侧顶住一侧漏气。
  两处都从同一个 `SLOPE_ANG` 常量算，别各写各的。
- **气浮孔沿斜面法线方向排**，不是竖直打；两排对称，否则气膜会把滑行器顶偏。
- **滑行器的 V 槽宽要小于本体宽**（62 mm 本体 / 62 mm 槽口），一开始按导轨斜面底端 90 mm 建，
  滑行器就比本体宽出一圈，像个盖不住的大壳。
- **配重槽与 V 槽同料**：真实滑行器是整体铝挤压件，做成黑色塑料盒会立刻显假。

## 新增一件器材的步骤

1. 复制 `build_ticker_timer.py` → `build_<apparatusId>.py`
2. 按真实尺寸摆零件（改 `L, W, H` 与各处坐标），**每个部件起语义化英文名**
3. `attach(root, P)` 之前确认没有部件悬空、没有穿模
4. 跑上面 1~4 步；第 2 步校验必须全绿
5. 在 `src/content/apparatusParts.ts` 里补 `parts` 文案（name + desc）
6. 想替换某个实验里的程序化器材时：用 `loadOrFallback(id, fallback)`（见下节），
   别直接 `loadApparatus` —— 那会把「还没建模的器材」变成白屏

## 接进实验页：`src/labs/_shared/models.ts`

```ts
const [rail, sled, timer] = await Promise.all([
  loadOrFallback('air_track',   () => airTrack(RAIL_LEN)),   // glb 失败就用程序化模型
  loadOrFallback('sled',        () => cart({ ... })),
  loadOrFallback('ticker_timer', () => tickerTimer()),
]);
pivot.add(rail.root);
const flag = partOf(sled, 'flag') as THREE.Mesh;   // glb 走部件表，回退模型按名字递归找
hideParts(timer, 'tape');                           // 隐藏模型里用不上的部件
```

`buildL1Scene` 因此变成 **async**（SceneHost 的 `setup` 本来就接受 Promise）。

### 接场景时踩过的四个坑

1. **原点约定必须对齐**：导轨/滑行器原点在「底面接触中心」，所以
   `position.y = 0` 贴台面、`position.y = SURFACE_Y(0.11)` 坐到导轨尖顶上；
   程序化模型也是同一套约定，换成 glb 不用改摆放代码。
2. **模型里的定长纸带会穿模**：打点计时器自带的纸带是 260 mm 的一段，滑行器一进来就穿过去。
   L1 里隐藏它，改画一条「出带口 → 滑行器尾端」的动态纸带，长度随位移变 —— 这才是真实行为。
3. **长条器材的机位**：俯角 16° 太平，三角型材被压成一条平板、V 槽完全看不见；26° 才读得出来。
4. **器材自带的「配套件」要自己补**：导轨是尖脊，打点计时器没法直接坐上去 ——
   端头得加一块 C 形夹板（横板 + 窄立筋 + 压紧螺钉）；光电门的立柱也不能穿型材，
   要改成「立柱落在台面、横臂把镜头臂送到轨道上方」。

## 目录

```
blender/
  lab_common.py          公共库：材质（对齐 materials.ts 色值）、盒/柱/螺母/杆/prism/阵列、导出
  build_ticker_timer.py  电磁打点计时器（J0203）
  build_air_track.py     气垫导轨 + 滑行器（一个脚本出两个 glb）
  inspect_glb.py         产物校验（无三方依赖，直接解 glb）
  render_preview.py      离屏渲染预览图（--view iso|section、--add 装配、--hide 遮挡件）
  preview/               预览图（不入库）
src/labs/_shared/models.ts      loadOrFallback / partOf / hideParts（实验页统一入口）
scripts/
  capture-model.mjs      截模型试验台页面
  probe-pick.mjs         逐部件投影点击，验证拾取链路
  shot-lab.mjs           截实验页（node scripts/shot-lab.mjs L1 out.png）
src/engine/loader.ts     glb 加载 + 部件索引 + 模板缓存
src/labs/_dev/ModelStudio.tsx   器材试验台页面（/#/model/<id>）
src/content/apparatusParts.ts   部件文案（apparatus.json 雏形）
```
