"""
build_ticker_timer.py —— 电磁打点计时器 J0203（Blender 4.5）

用法（命令行，不弹界面）：
  blender.exe -b -P blender/build_ticker_timer.py -- --out public/models/ticker_timer.glb

造型依据：教材结构图 —— 黑色长方形底座 / 中部卧置白色圆柱线圈壳 /
红绿两接线柱 / 上下磁极片夹住振动片 / 振针穿复写纸圆盘 / 前后两个门形限位孔 /
纸带沿长轴穿过。整机 144×70×60 mm，与 instruments.ts 的 tickerTimer() 规格一致。
"""

import bpy
import os
import sys
import json
import math

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from lab_common import (  # noqa: E402
    reset_scene, make_root, attach, export_glb, scene_bounds, tri_count,
    box, cyl, hexnut, torus, rod_between,
    mat_plastic_black, mat_paint_white, mat_steel, mat_brass, mat_copper,
    mat_paper, mat_rubber, mat_plastic_red, mat_plastic_green,
    mat_plastic_gray, mat_paper_dark,
)

# ---------------------------------------------------------------- 关键尺寸（米）
L, W, H = 0.144, 0.070, 0.060     # 整机
BASE_TOP = 0.018                  # 底座上表面高度
Y_TAPE = 0.006                    # 纸带中线（略偏前，与实物一致）
Z_TAPE = 0.0195                   # 纸带平面


def build():
    reset_scene()
    root = make_root("ticker_timer")
    P = []

    # ---------------- 底座 ----------------
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.append(cyl(f"foot_{'lr'[sx > 0]}{'fb'[sy > 0]}", 0.0045, 0.002,
                         (sx * 0.055, sy * 0.022, 0.001), mat_rubber(), verts=16))
    P.append(box("base", (L, W, 0.016), (0, 0, 0.010), mat_plastic_black(), bevel=0.0025))
    # 前端缺口两侧的凸台（实物用 F 夹固定在桌沿）
    for sy in (-1, 1):
        P.append(box(f"base_rib_{'fb'[sy > 0]}", (0.030, 0.006, 0.003),
                     (0, sy * 0.030, BASE_TOP + 0.0015), mat_plastic_black(), bevel=0.0008))

    # ---------------- 线圈（卧置白壳） ----------------
    coil_x, coil_z = -0.020, 0.0305
    P.append(cyl("coil", 0.0125, 0.030, (coil_x, 0, coil_z), mat_paint_white(), axis="X"))
    for i, dx in enumerate((-0.0145, 0.0145)):
        P.append(cyl(f"coil_cap_{i}", 0.0128, 0.0015, (coil_x + dx, 0, coil_z),
                     mat_plastic_gray(), axis="X"))
    P.append(torus("coil_seam", 0.0126, 0.0006, (coil_x, 0, coil_z), mat_plastic_gray(), axis="X"))
    # 铭牌（不带文字：图上文字一律不烘进模型）
    P.append(box("coil_label", (0.012, 0.0008, 0.009), (coil_x, -0.0124, coil_z + 0.001),
                 mat_paint_white(), bevel=0.0004))
    # 线圈安装支架
    P.append(box("coil_bracket", (0.026, 0.020, 0.006), (coil_x, 0.008, BASE_TOP + 0.003),
                 mat_steel(), bevel=0.0008))

    # ---------------- 磁极 + 振动片 + 振针 ----------------
    # 上下磁极片之间必须留出可见的缝（真实件 5~6 mm），振片从缝里穿出并向前伸出，
    # 否则渲染出来会糊成一整块"银砖"，看不出这是振动结构。
    reed_x, reed_z = 0.010, 0.0272
    P.append(box("magnet_lower", (0.022, 0.020, 0.004), (0.004, Y_TAPE, 0.0218), mat_steel(), bevel=0.0005))
    P.append(box("magnet_upper", (0.022, 0.020, 0.004), (0.004, Y_TAPE, 0.0326), mat_steel(), bevel=0.0005))
    P.append(box("reed", (0.064, 0.010, 0.0016), (reed_x, Y_TAPE, reed_z), mat_steel(), bevel=0.0003))
    P.append(box("reed_clamp", (0.007, 0.016, 0.011), (-0.024, Y_TAPE, reed_z), mat_steel(), bevel=0.0008))
    # 振针：螺丝 + 上下两枚螺母（针尖朝下，压到纸带上）
    P.append(cyl("needle", 0.0007, 0.0082, (0.033, Y_TAPE, 0.0226), mat_steel(), verts=12))
    P.append(hexnut("needle_nut_top", 0.0022, 0.0016, (0.033, Y_TAPE, 0.0286), mat_steel()))
    P.append(hexnut("needle_nut_bot", 0.0022, 0.0016, (0.033, Y_TAPE, 0.0254), mat_steel()))

    # ---------------- 复写纸盘 + 立轴 ----------------
    P.append(cyl("paper_disc", 0.016, 0.0016, (0.030, 0.016, 0.0208), mat_paper_dark(), verts=40))
    P.append(cyl("paper_boss", 0.0022, 0.0022, (0.030, 0.016, 0.0208), mat_brass(), verts=14))
    P.append(cyl("spindle", 0.0012, 0.018, (0.030, 0.0305, 0.027), mat_steel(), verts=12))
    P.append(box("spindle_arm", (0.004, 0.014, 0.0015), (0.030, 0.024, 0.0358), mat_steel(), bevel=0.0004))
    # 立轴拨柄（让复写纸盘能拨进/拨出压纸位置）
    P.append(cyl("spindle_knob", 0.0022, 0.0035, (0.030, 0.0305, 0.0375), mat_plastic_black(), verts=14))

    # ---------------- 门形限位孔（前后各一，纸带从中穿过） ----------------
    for i, x in enumerate((0.014, 0.052)):
        P.append(box(f"limit_{i}_top", (0.0022, 0.026, 0.0012), (x, Y_TAPE, 0.0272), mat_steel(), bevel=0.0003))
        for sy in (-1, 1):
            P.append(box(f"limit_{i}_leg_{'fb'[sy > 0]}", (0.0022, 0.0012, 0.0092),
                         (x, Y_TAPE + sy * 0.0124, 0.0226), mat_steel(), bevel=0.0002))

    # ---------------- 纸带 + 点迹 ----------------
    tape = box("tape", (0.26, 0.017, 0.0005), (0.038, Y_TAPE, Z_TAPE), mat_paper(), bevel=0.0)
    dots = []
    for i in range(9):
        d = box(f"_dot{i}", (0.0011, 0.0011, 0.0002),
                (0.030 + i * 0.0125, Y_TAPE, Z_TAPE + 0.00032), mat_paper_dark(), bevel=0.0)
        dots.append(d)
    bpy.context.view_layer.objects.active = tape
    for d in dots:
        d.select_set(True)
    tape.select_set(True)
    bpy.ops.object.join()
    P.append(tape)

    # ---------------- 接线柱（红/绿）+ 导线 ----------------
    post_x = (0.050, 0.064)
    P.append(cyl("post_brass_a", 0.0022, 0.014, (post_x[0], -0.024, 0.025), mat_brass(), verts=16))
    P.append(cyl("post_brass_b", 0.0022, 0.014, (post_x[1], -0.024, 0.025), mat_brass(), verts=16))
    P.append(cyl("post_cap_red", 0.0032, 0.005, (post_x[0], -0.024, 0.0345), mat_plastic_red(), verts=18))
    P.append(cyl("post_cap_green", 0.0032, 0.005, (post_x[1], -0.024, 0.0345), mat_plastic_green(), verts=18))
    # 红色导线：红柱 → 线圈（两段折线，避免直线穿模）
    P.append(rod_between("wire_red_a", (post_x[0], -0.024, 0.0375), (0.010, -0.030, 0.040), 0.0009, mat_plastic_red()))
    P.append(rod_between("wire_red_b", (0.010, -0.030, 0.040), (-0.020, -0.0125, 0.036), 0.0009, mat_plastic_red()))
    P.append(rod_between("wire_black", (post_x[1], -0.024, 0.0375), (-0.004, -0.018, 0.0335), 0.0009,
                         mat_plastic_black()))

    attach(root, P)
    return root


def main():
    argv = sys.argv
    out = "public/models/ticker_timer.glb"
    if "--" in argv:
        rest = argv[argv.index("--") + 1:]
        if "--out" in rest:
            out = rest[rest.index("--out") + 1]
    out = os.path.abspath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)

    root = build()
    export_glb(out, root)

    info = {
        "file": out,
        "size_kb": round(os.path.getsize(out) / 1024, 1),
        "parts": len([o for o in root.children_recursive if o.type == "MESH"]),
        "tris": tri_count(root),
        "bounds": scene_bounds(root),
        "materials": sorted({m.name for m in bpy.data.materials}),
    }
    print("=== BUILD RESULT ===")
    print(json.dumps(info, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
