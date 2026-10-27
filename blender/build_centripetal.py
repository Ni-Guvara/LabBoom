"""
build_centripetal.py —— 手摇式向心力演示器（Blender 4.5）

用法：blender.exe -b -P blender/build_centripetal.py -- --out public/models/centripetal.glb

真机构造（按 docs/ref-mechanics/07-向心力演示仪.png 复刻）：
  蓝漆铸铁「箱式」底座（顶盖出檐 + 四周裙板 + 四条方腿 + 橡胶地脚），前端面板嵌
  数显窗 → 顶面坐两只**五级阶梯塔轮**（左大右小，直径比 1.15:1，红圆皮带绕第三级
  联动，切线走向贴合轮缘）→ 塔轮中心各立一根黑立柱（柱脚一段螺旋弹簧、柱身光管、
  顶端钢螺母）→ 立柱 ARM_Y 处套黑色抱箍（横臂由 scene.ts 程序化生成并随轴转动）→
  底座空腔里装手轮，曲柄摇把从右侧探出。

坐标：根节点 = 底座底面中心（z=0 贴台面），+X 长轴、+Z 向上、+Y 朝**后**（前端是 -Y）。
前端（src/labs/L6/scene.ts）必须与这里对齐，构建结束会打印一份 JSON 供核对：
  BASE_TOP / COL_X / ARM_Y / PULLEY_TOP / BELT_Z / PANEL_Y / PANEL_Z / COL_TOP
"""

import bpy
import os
import sys
import math
import json
import argparse

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from lab_common import (  # noqa: E402
    reset_scene, make_root, attach, export_glb, scene_bounds, tri_count,
    box, cyl, hexnut, torus, rod_between, mat_pbr,
    mat_plastic_black, mat_steel, mat_rubber, mat_paint_blue, mat_paint_yellow,
)

# ---------- 底座：箱式铸件 ----------
BASE_L, BASE_W = 0.360, 0.200
FOOT_H = 0.008
LEG_H = 0.105                      # 方腿：从地脚到顶盖下沿
SLAB_H = 0.027                     # 顶盖（出檐 4 mm）
BASE_TOP = round(FOOT_H + LEG_H + SLAB_H, 4)   # = 0.108 → 塔轮安装面
SKIRT_H = 0.030
SKIRT_INSET = 0.011           # 侧裙内收，四角方腿才会凸出来
SKIRT_T = 0.010
LEG_S = 0.050                      # 方腿截面
LEG_X = BASE_L / 2 - LEG_S / 2 - 0.004
LEG_Y = BASE_W / 2 - LEG_S / 2 - 0.004

# ---------- 塔轮：五级阶梯，左大右小 ----------
COL_X = 0.151
# (直径, 该级高)
# 每级 7.2 mm 高、环宽 7 mm：层高与台阶环宽接近正方，才是车削塔轮的比例。
# 每级 12 mm 时台阶环被拉成"盘沿"，整只塔轮会读成一摞盘子。
# 直径按参考照片实测：左塔轮 Ø137、右塔轮 Ø116，底座宽 360 —— 塔轮直径约为
# 底座的 38%，而且左右各探出底座边缘约 40 mm（参考件就是这样悬出去的）。
# 早前做到 Ø176（半个底座宽）时两只塔轮几乎顶到立柱两头，整机变成了"矮胖"。
PULLEY_L = [(0.137, 0.0075), (0.123, 0.0075), (0.109, 0.0075), (0.095, 0.0075), (0.081, 0.0075)]
PULLEY_R = [(0.116, 0.0075), (0.104, 0.0075), (0.092, 0.0075), (0.080, 0.0075), (0.068, 0.0075)]
PULLEY_STEPS = len(PULLEY_L)
PULLEY_STACK_H = sum(h for _, h in PULLEY_L)
PULLEY_TOP = round(BASE_TOP + PULLEY_STACK_H, 4)   # = 0.1655

BELT_STEP = 0                      # 皮带挂在最下一级（最大轮）：参考件就是挂在底盘的轮槽里
BELT_Z = round(BASE_TOP + sum(h for _, h in PULLEY_L[:BELT_STEP]) + PULLEY_L[BELT_STEP][1] / 2, 4)
BELT_R_L = PULLEY_L[BELT_STEP][0] / 2 + 0.0012
BELT_R_R = PULLEY_R[BELT_STEP][0] / 2 + 0.0012

# ---------- 立柱 + 横臂抱箍 ----------
COL_R = 0.010
COL_TOP = 0.314
SPRING_Z0 = round(PULLEY_TOP + 0.004, 4)
ARM_Y = 0.209                      # 横臂（= 抱箍）中心高度：塔轮顶 0.178 + 弹簧 23 mm
CLAMP_H = 0.012
SPRING_Z1 = round(ARM_Y - CLAMP_H / 2 - 0.004, 4)

# ---------- 手轮 / 摇把 ----------
HAND_X, HAND_Y, HAND_Z = 0.152, 0.004, 0.060
HAND_R = 0.032
GRIP_X = 0.206

# ---------- 前面板数显窗 ----------
PANEL_W, PANEL_H = 0.112, 0.030
PANEL_Y = round(-BASE_W / 2 - 0.0012, 5)
PANEL_Z = 0.074

RED = lambda: mat_pbr("beltRed", 0x8C1A1C, 0.0, 0.78)
YELLOW = lambda: mat_pbr("paintYellow", 0xD9A81C, 0.0, 0.55, 0.05)
WHITE = lambda: mat_pbr("paintWhite", 0xD9DDE1, 0.0, 0.58, 0.25)


def cone(name, r0, r1, depth, center, mat, verts=64, rz=0.0):
    """截锥：车削件每级带 1.5 mm 拔模，才不会看成一摞平盘。
    verts=4 + rz=45° 就是一根下大上小的方锥腿 —— 参考件的铸腿正是这个形状。"""
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r0, radius2=r1, depth=depth,
                                    location=center, rotation=(0, 0, rz))
    o = bpy.context.active_object
    # 全平面着色：台阶是硬边，而 Blender 的平滑组会把「平滑侧壁 + 平面顶盖」
    # 共边处的顶点法线一起平均，边缘被卷出一道圆角，整只塔轮就读成"一摞甜甜圈"。
    # 96 段下平面着色看不出棱，只留下清晰的车削台阶。
    for p in o.data.polygons:
        p.use_smooth = False
    return _finish_cone(o, name, mat)


def _finish_cone(obj, name, mat):
    obj.name = name
    obj.data.name = name
    obj.data.materials.append(mat)
    return obj


def join_into(name, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    o["partId"] = name
    return o


def spring_sleeve(name, x, z0, z1, mat, major=0.0195, minor=0.0024, pitch=0.0044):
    """柱脚螺旋弹簧：一叠圆环套在立柱外，近看有螺距感。"""
    objs = [cyl(f"{name}_core", COL_R - 0.0008, z1 - z0 + 0.004, (x, 0, (z0 + z1) / 2), mat, verts=24)]
    n = max(3, int((z1 - z0) / pitch))
    for i in range(n + 1):
        objs.append(torus(f"{name}_c{i}", major, minor, (x, 0, z0 + i * pitch), mat, seg=22))
    return join_into(name, objs)


def stepped_pulley(name, x, steps):
    """五级塔轮：每级一个盘 + 盘沿凸缘，层层收小；中心黑轴套 + 钢顶盖。"""
    parts = []
    z = BASE_TOP
    for i, (d, h) in enumerate(steps):
        r = d / 2
        # 每级带 1.5 mm 拔模（下大上小）：这是车削件的特征，纯圆柱会看成一摞平盘
        parts.append(cone(f"{name}_step{i + 1}", r, r - 0.0015, h, (x, 0, z + h / 2), YELLOW(), verts=96))
        z += h
    # 中心黑轴套：直径必须远小于塔轮顶盘（顶盘 Ø72，轴套 Ø42），
    # 早前做到 Ø76 —— 比顶盘还大，正面看就是塔轮上扣了一只黑锅盖。
    parts.append(cyl(f"{name}_boss", 0.024, 0.020, (x, 0, BASE_TOP + 0.010), mat_plastic_black(), verts=32))
    parts.append(cyl(f"{name}_boss2", 0.021, 0.010, (x, 0, PULLEY_TOP + 0.004), mat_plastic_black(), verts=32))
    parts.append(cyl(f"{name}_cap", 0.0125, 0.005, (x, 0, PULLEY_TOP + 0.0115), mat_steel(), verts=24))
    return join_into(name, parts)


def column(name, x):
    """黑立柱：弹簧套 + 光管 + 顶端六角螺母/钢帽 + 柱身定位螺钉。"""
    parts = [spring_sleeve(f"{name}_spring", x, SPRING_Z0, SPRING_Z1, mat_plastic_black())]
    parts.append(cyl(f"{name}_tube", COL_R, COL_TOP - SPRING_Z0, (x, 0, (SPRING_Z0 + COL_TOP) / 2),
                     mat_plastic_black(), verts=32))
    parts.append(cyl(f"{name}_collar", 0.0175, 0.006, (x, 0, SPRING_Z1 + 0.002), mat_steel(), verts=28))
    # 柱头：参考件是「平顶黑帽 + 帽心露出一小段银色螺杆」，不是圆头。
    parts.append(cyl(f"{name}_head", COL_R + 0.0026, 0.014, (x, 0, COL_TOP + 0.007),
                     mat_plastic_black(), verts=32))
    parts.append(cyl(f"{name}_head_cap", COL_R + 0.0034, 0.003, (x, 0, COL_TOP + 0.0155),
                     mat_plastic_black(), verts=32))
    parts.append(cyl(f"{name}_stud", 0.0046, 0.020, (x, 0, COL_TOP + 0.0265),
                     mat_steel(), verts=16))
    parts.append(cyl(f"{name}_stud_top", 0.0032, 0.004, (x, 0, COL_TOP + 0.0385),
                     mat_steel(), verts=12))
    parts.append(cyl(f"{name}_screw", 0.0028, 0.004, (x, COL_R - 0.001, 0.250), mat_steel(), axis="Y", verts=12))
    return parts


def belt_tangent(x1, r1, x2, r2, sign):
    """两不等径圆的外公切线切点（sign=+1 上侧 / -1 下侧）。"""
    d = abs(x2 - x1)
    cos_t = (r1 - r2) / d
    theta = math.acos(max(-1.0, min(1.0, cos_t)))
    p1 = (x1 + r1 * math.cos(theta), sign * r1 * math.sin(theta))
    p2 = (x2 + r2 * math.cos(theta), sign * r2 * math.sin(theta))
    return p1, p2


def main():
    argv = sys.argv
    rest = argv[argv.index("--") + 1:] if "--" in argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public/models/centripetal.glb")
    args = ap.parse_args(rest)

    reset_scene()
    root = make_root("centripetal")
    blue, black, steel, rubber, red = (mat_paint_blue(), mat_plastic_black(),
                                      mat_steel(), mat_rubber(), RED())
    parts = []

    # ---------- 1 箱式底座：地脚 → 方腿 → 裙板 → 顶盖 ----------
    slab_z = FOOT_H + LEG_H + SLAB_H / 2
    parts.append(box("base_slab", (BASE_L, BASE_W, SLAB_H), (0, 0, slab_z), blue, bevel=0.005, segments=3))
    # 顶盖下沿的一圈倒角裙（出檐 4 mm，视觉上才像铸件而不是铁皮）
    parts.append(box("base_eave", (BASE_L - 0.006, BASE_W - 0.006, 0.008),
                     (0, 0, FOOT_H + LEG_H - 0.003), blue, bevel=0.003))
    skirt_z = FOOT_H + LEG_H - 0.006 - SKIRT_H / 2
    parts.append(box("skirt_front", (BASE_L - 2 * SKIRT_INSET, SKIRT_T, SKIRT_H),
                     (0, -BASE_W / 2 + SKIRT_T / 2 + SKIRT_INSET * 0.4, skirt_z), blue, bevel=0.003))
    parts.append(box("skirt_back", (BASE_L - 2 * SKIRT_INSET, SKIRT_T, SKIRT_H),
                     (0, BASE_W / 2 - SKIRT_T / 2 - SKIRT_INSET * 0.4, skirt_z), blue, bevel=0.003))
    for sx, tag in ((-1, "l"), (1, "r")):
        parts.append(box(f"skirt_{tag}", (SKIRT_T, BASE_W - 2 * SKIRT_INSET, SKIRT_H),
                         (sx * (BASE_L / 2 - SKIRT_T / 2 - SKIRT_INSET), 0, skirt_z), blue, bevel=0.003))
    for sx in (-1, 1):
        for sy in (-1, 1):
            tag = f"{'l' if sx < 0 else 'r'}{'b' if sy > 0 else 'f'}"
            lx, ly = sx * LEG_X, sy * LEG_Y
            # 方锥腿：下大上小，正面看是外撇的铸腿，比等截面方块更像砂型铸造
            parts.append(cone(f"leg_{tag}", LEG_S * 0.72, LEG_S * 0.55, LEG_H,
                              (lx, ly, FOOT_H + LEG_H / 2), blue, verts=4, rz=math.radians(45)))
            parts.append(box(f"foot_{tag}", (LEG_S - 0.010, LEG_S - 0.010, FOOT_H),
                             (lx, ly, FOOT_H / 2), rubber, bevel=0.002))
    # 顶面四颗内六角螺钉（参考图顶面四颗黑点）
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(cyl(f"slab_screw_{sx}{sy}", 0.0050, 0.003, (sx * 0.126, sy * 0.052, BASE_TOP),
                             rubber, verts=16))

    # 前面板：黑色数显窗 + 白漆铭牌（文字由前端 textPlate 贴上去）
    # 控制盒：从底座前脸伸出来的小方盒，数显嵌在它的正面
    box_front = -BASE_W / 2 - 0.018
    parts.append(box("panel_box", (0.150, 0.018, 0.046), (0, box_front, PANEL_Z), blue, bevel=0.004, segments=3))
    parts.append(box("panel_bezel", (PANEL_W + 0.016, 0.004, PANEL_H + 0.010),
                     (0, box_front - 0.010, PANEL_Z), black, bevel=0.002))
    parts.append(box("panel_glass", (PANEL_W, 0.0034, PANEL_H),
                     (0, box_front - 0.0118, PANEL_Z), rubber, bevel=0.001))
    parts.append(box("nameplate", (0.064, 0.0022, 0.010), (0, -BASE_W / 2 - 0.0008, 0.086),
                     mat_pbr("plateSilver", 0xAEB4BA, 0.55, 0.42), bevel=0.001))

    # ---------- 2 两只五级塔轮 ----------
    parts.append(stepped_pulley("pulley_l", -COL_X, PULLEY_L))
    parts.append(stepped_pulley("pulley_r", COL_X, PULLEY_R))

    # ---------- 3 红色圆皮带：绕第 3 级，外公切线走向 ----------
    parts.append(torus("belt_ring_l", BELT_R_L, 0.0022, (-COL_X, 0, BELT_Z), red, seg=72))
    parts.append(torus("belt_ring_r", BELT_R_R, 0.0022, (COL_X, 0, BELT_Z), red, seg=72))
    for sign, tag in ((1, "b"), (-1, "f")):
        p1, p2 = belt_tangent(-COL_X, BELT_R_L, COL_X, BELT_R_R, sign)
        parts.append(rod_between(f"belt_run_{tag}", (p1[0], p1[1], BELT_Z), (p2[0], p2[1], BELT_Z),
                                 0.0022, red, verts=10))

    # ---------- 4 两根立柱 ----------
    for sx, tag in ((-1, "l"), (1, "r")):
        parts += column(f"column_{tag}", sx * COL_X)

    # ---------- 6 手轮 + 曲柄摇把（底座空腔右侧，轮轴沿 X，摇把朝右伸出）----------
    # 参考件的手轮是「轮面朝右、摇把从轮缘沿轴向朝外伸」：从右前方看，曲柄
    # 先在轮面内伸到轮缘，再折 90° 向右穿出底座右沿，末端一个黑色握球。
    # 早前写成轮面朝前、握把朝观察者，从正面只能看见一根横杆贴在机身前面。
    parts.append(torus("hand_rim", HAND_R, 0.0046, (HAND_X, HAND_Y, HAND_Z), black, axis="X", seg=48))
    for i in range(6):
        a = math.radians(i * 60 + 15)
        parts.append(rod_between(f"hand_spoke{i + 1}", (HAND_X, HAND_Y, HAND_Z),
                                 (HAND_X, HAND_Y + math.cos(a) * (HAND_R - 0.004),
                                  HAND_Z + math.sin(a) * (HAND_R - 0.004)), 0.0032, black))
    parts.append(cyl("hand_hub", 0.0098, 0.017, (HAND_X, HAND_Y, HAND_Z), steel, axis="X", verts=20))
    parts.append(cyl("hand_axle", 0.0046, 0.060, (HAND_X - 0.024, HAND_Y, HAND_Z), steel, axis="X", verts=14))
    # 曲柄：轮面内径向伸到轮缘，再沿轴向折出
    crank_y = HAND_Y + HAND_R - 0.002
    parts.append(rod_between("hand_crank", (HAND_X, HAND_Y, HAND_Z), (HAND_X, crank_y, HAND_Z), 0.0060, black))
    parts.append(rod_between("hand_crank_bend", (HAND_X - 0.004, crank_y, HAND_Z),
                             (HAND_X + 0.012, crank_y, HAND_Z), 0.0060, black))
    parts.append(cyl("hand_grip", 0.0072, 0.048, (HAND_X + 0.034, crank_y, HAND_Z), rubber, axis="X", verts=18))
    parts.append(cyl("hand_grip_cap", 0.0090, 0.008, (HAND_X + 0.061, crank_y, HAND_Z), black, axis="X", verts=18))

    attach(root, parts)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    export_glb(args.out, root)
    print("BUILD RESULT " + json.dumps({
        "file": args.out,
        "bounds": scene_bounds(root),
        "tris": tri_count(root),
        "parts": len(root.children_recursive),
        "base_top": BASE_TOP,
        "col_x": COL_X,
        "col_top": COL_TOP,
        "arm_y": ARM_Y,
        "pulley_top": PULLEY_TOP,
        "belt_z": BELT_Z,
        "belt_r": [round(BELT_R_L, 4), round(BELT_R_R, 4)],
        "panel": [round(box_front - 0.0132, 5), PANEL_Z],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
