"""
build_throw.py —— 平抛运动实验器（Blender 4.5）

用法：blender.exe -b -P blender/build_throw.py -- --out public/models/thrower.glb

真机构造（按 docs/ref-mechanics/05-平抛演示仪.png 复刻）：
  白漆厚底板（四角黑胶脚）→ 后部立白漆演示板（铝型材包边、边框一排钢螺钉、
  左边缘一排定位齿口）→ 板面贴两条标尺底板（顶部横向 0–28 cm、左侧纵向
  0–28 cm，刻度与数字由前端 rulerStrip 画）→ 板中部四颗红/绿按扣 → 板顶前方
  一根 Ø6 钢杆（右端球头、杆上滑动夹挂重锤线）→ 板前左侧挂铝型材斜槽（水平
  段 + 上斜段，顶端电磁铁释放器，L 形支架夹在板边框上）→ 板前下部横跨全宽的
  白色 L 形接球槽 → 底板前沿透明亚克力挡条 + 黑色滚花旋钮 → 黄铜重锤。

坐标：根节点 = 底板底面中心，+X 向右、+Z 向上、+Y 朝后（远离观察者）。
导出 yup 后 three 里 +Z 才是朝观察者，所以「板的正前方」在 Blender 里是 −Y。

前端（src/labs/L5/scene.ts）对齐常量：
  BASE_TOP=0.030  BOARD_FRONT=0.089  BOARD_TOP=0.370
  CHUTE_Z=0.245   CHUTE_Y=0.050      CHUTE_EXIT_X=-0.090   CATCH_Z=0.074
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
    box, cyl, torus, rod_between, mat_pbr,
    mat_plastic_black, mat_steel, mat_rubber, mat_acrylic,
)

# ---------- 主尺寸（m）----------
BASE_L, BASE_D, BASE_H = 0.400, 0.300, 0.030
BASE_TOP = BASE_H
FOOT_R, FOOT_H = 0.013, 0.006

BOARD_W, BOARD_H, BOARD_T = 0.380, 0.340, 0.012
BOARD_Y = 0.095                       # 板厚中心（靠后）
BOARD_TOP = BASE_TOP + BOARD_H        # 0.370
BOARD_FACE = BOARD_Y - BOARD_T / 2    # 0.089 板正面（朝观察者一侧）
FRAME_W, FRAME_T = 0.014, 0.016

ROD_Z = BOARD_TOP + 0.004
ROD_Y = BOARD_FACE - 0.017

RULER_TOP_Z = BOARD_TOP - 0.014
RULER_H = 0.042
RULER_HALF_X = 0.176
SIDE_RULER_X = -BOARD_W / 2 + 0.030
SIDE_RULER_H = 0.300

SNAP_Z = 0.212
SNAP_XS = [-0.150, -0.050, 0.050, 0.150]

CHUTE_Z = 0.245                       # 水平段槽底高度
CHUTE_Y = 0.050                       # 槽中线（在板面前方 39 mm）
CHUTE_X0, CHUTE_X1 = -0.090, -0.205   # 出口端 / 折弯处（沿 −x 上斜）
RAMP_TOP = (-0.320, 0.392)
CHUTE_W, CHUTE_RIM, CHUTE_T = 0.026, 0.006, 0.004

CATCH_Z = 0.074
CATCH_Y0, CATCH_Y1 = -0.055, 0.075    # 前沿 / 贴板侧
ACRY_Y = -0.118

PLUMB_X = 0.104
PLUMB_BOTTOM = 0.150

WHITE = lambda: mat_pbr("paintWhite", 0xE4E7E9, 0.0, 0.50, 0.20)
ALU = lambda: mat_pbr("aluSatin", 0xBFC5C9, 0.9, 0.30)
BRASS = lambda: mat_pbr("brass", 0xB08432, 0.95, 0.26)


def chute(name, origin, length, angle, alu):
    """一段铝型材 U 槽：槽底 + 两侧边；局部沿 +x 铺，绕 +Y 转 angle（正角=向下俯）。"""
    objs = [box(f"{name}_floor", (length, CHUTE_W, CHUTE_T), (0, 0, 0), alu, bevel=0.0012)]
    for sy in (-1, 1):
        objs.append(box(f"{name}_rim{sy}", (length, 0.004, CHUTE_RIM),
                        (0, sy * (CHUTE_W / 2 - 0.002), CHUTE_RIM / 2 - 0.002), alu, bevel=0.0012))
    for o in objs:
        lx, ly, lz = o.location
        o.rotation_euler = (0, angle, 0)
        o.location = (origin[0] + (lx + length / 2) * math.cos(angle),
                      origin[1] + ly,
                      origin[2] - (lx + length / 2) * math.sin(angle) + lz)
    return objs


def main():
    argv = sys.argv
    rest = argv[argv.index("--") + 1:] if "--" in argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public/models/thrower.glb")
    args = ap.parse_args(rest)

    reset_scene()
    root = make_root("thrower")
    white, black, steel, rubber, alu, brass = (WHITE(), mat_plastic_black(),
                                               mat_steel(), mat_rubber(), ALU(), BRASS())
    acryl = mat_acrylic()
    parts = []

    # ---------- 底板 + 脚垫 ----------
    parts.append(box("base", (BASE_L, BASE_D, BASE_H), (0, 0, BASE_H / 2), white, bevel=0.008, segments=3))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(cyl(f"foot_{sx}{sy}", FOOT_R, FOOT_H,
                             (sx * (BASE_L / 2 - 0.030), sy * (BASE_D / 2 - 0.030), FOOT_H / 2),
                             rubber, verts=18))

    # ---------- 演示板：面板 + 四边铝型材边框 ----------
    parts.append(box("board", (BOARD_W, BOARD_T, BOARD_H), (0, BOARD_Y, BASE_TOP + BOARD_H / 2),
                     white, bevel=0.002))
    fy, by = BOARD_FACE - 0.002, BOARD_Y + BOARD_T / 2 + 0.002
    for sx in (-1, 1):
        for y, tag in ((fy, "f"), (by, "b")):
            parts.append(box(f"frame_v{sx}{tag}", (FRAME_W, 0.004, BOARD_H),
                             (sx * (BOARD_W / 2 - FRAME_W / 2), y, BASE_TOP + BOARD_H / 2),
                             white, bevel=0.0015))
            # 上下横框整条，前后各一条：名字里不带 sx 会撞成 .001
            if sx < 0:
                parts.append(box(f"frame_h0{tag}", (BOARD_W, 0.004, FRAME_W),
                                 (0, y, BASE_TOP + FRAME_W / 2), white, bevel=0.0015))
                parts.append(box(f"frame_h1{tag}", (BOARD_W, 0.004, FRAME_W),
                                 (0, y, BOARD_TOP - FRAME_W / 2), white, bevel=0.0015))
    # 右边框上一排钢螺钉
    for i in range(8):
        parts.append(cyl(f"frame_screw{i}", 0.0032, 0.004,
                         (BOARD_W / 2 - FRAME_W / 2, BOARD_FACE - 0.005, BASE_TOP + 0.030 + i * 0.038),
                         steel, verts=12))
    # 板左边缘的定位齿口（斜槽支架可换高度）
    for i in range(7):
        parts.append(box(f"notch{i}", (0.010, 0.016, 0.008),
                         (-BOARD_W / 2 - 0.004, BOARD_FACE + 0.004, BASE_TOP + 0.180 + i * 0.024),
                         white, bevel=0.0012))

    # ---------- 板面标尺底板（刻度与数字由前端 canvas 画）----------
    parts.append(box("ruler_top", (RULER_HALF_X * 2, 0.0016, RULER_H),
                     (0, BOARD_FACE - 0.0008, RULER_TOP_Z - RULER_H / 2), white, bevel=0.0008))
    parts.append(box("ruler_side", (0.028, 0.0016, SIDE_RULER_H),
                     (SIDE_RULER_X, BOARD_FACE - 0.0008, BASE_TOP + 0.030 + SIDE_RULER_H / 2),
                     white, bevel=0.0008))

    # ---------- 四颗红/绿按扣 ----------
    for i, sx in enumerate(SNAP_XS):
        col = mat_pbr("snapRed" if i % 2 == 0 else "snapGreen",
                      0xB32127 if i % 2 == 0 else 0x1E7A45, 0.0, 0.38)
        parts.append(cyl(f"snap_base{i}", 0.010, 0.003, (sx, BOARD_FACE - 0.0015, SNAP_Z), steel,
                         verts=18))
        # Ø18 按扣在画面里只有十几个像素，32×16 的球纯粹浪费面数
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.009, segments=18, ring_count=10,
                                             location=(sx, BOARD_FACE - 0.008, SNAP_Z))
        knob = bpy.context.active_object
        knob.name = f"snap{i}"
        knob.data.name = f"snap{i}"
        knob.scale = (1.0, 0.8, 1.0)
        knob.data.materials.append(col)
        for p in knob.data.polygons:
            p.use_smooth = True
        parts.append(knob)

    # ---------- 板顶钢杆 + 滑动夹 + 球头 ----------
    parts.append(cyl("rod", 0.0032, BOARD_W + 0.020, (0, ROD_Y, ROD_Z), steel, axis="X", verts=20))
    for sx in (-1, 1):
        # 立杆座：从板面横向探出 16 mm 夹住钢杆
        parts.append(cyl(f"rod_stand{sx}", 0.0050, 0.016,
                         (sx * (BOARD_W / 2 - 0.014), (ROD_Y + BOARD_FACE) / 2, ROD_Z), steel,
                         axis="Y", verts=14))
    parts.append(cyl("rod_ball", 0.0070, 0.008, (BOARD_W / 2 + 0.012, ROD_Y, ROD_Z), steel,
                     axis="X", verts=18))
    # 滑动夹：套在杆上的银圆柱 + 朝上的黑滚花旋钮（挂重锤线）
    parts.append(cyl("plumb_clamp", 0.0095, 0.026, (PLUMB_X, ROD_Y, ROD_Z), steel, axis="X", verts=20))
    parts.append(cyl("plumb_knob", 0.0075, 0.014, (PLUMB_X, ROD_Y, ROD_Z + 0.012), black, verts=18))
    parts.append(cyl("plumb_knob_cap", 0.0090, 0.004, (PLUMB_X, ROD_Y, ROD_Z + 0.021), black, verts=18))
    parts.append(cyl("plumb_line", 0.0008, ROD_Z - PLUMB_BOTTOM,
                     (PLUMB_X, ROD_Y, (ROD_Z + PLUMB_BOTTOM) / 2), black, verts=8))
    # 黄铜重锤：上细下粗的锥体 + 顶端小环
    parts.append(torus("plumb_ring", 0.0026, 0.0009, (PLUMB_X, ROD_Y, PLUMB_BOTTOM + 0.014), brass, seg=14))
    bpy.ops.mesh.primitive_cone_add(radius1=0.0085, radius2=0.0022, depth=0.026,
                                    location=(PLUMB_X, ROD_Y, PLUMB_BOTTOM))
    hammer = bpy.context.active_object
    hammer.name = "plumb_hammer"
    hammer.data.name = "plumb_hammer"
    hammer.data.materials.append(brass)
    for p in hammer.data.polygons:
        p.use_smooth = True
    parts.append(hammer)

    # ---------- 斜槽：水平导出段 + 上斜蓄能段 + 电磁铁 ----------
    level_len = CHUTE_X1 - CHUTE_X0
    parts += chute("chute_level", (CHUTE_X0, CHUTE_Y, CHUTE_Z), level_len, 0.0, alu)
    ramp_dx = CHUTE_X1 - RAMP_TOP[0]
    ramp_dz = RAMP_TOP[1] - CHUTE_Z
    ramp_len = math.hypot(ramp_dx, ramp_dz)
    ramp_ang = math.atan2(ramp_dz, ramp_dx)
    parts += chute("chute_ramp", (RAMP_TOP[0], CHUTE_Y, RAMP_TOP[1]), ramp_len, ramp_ang, alu)
    # 折弯处的过渡块
    parts.append(box("chute_knee", (0.028, CHUTE_W + 0.004, CHUTE_RIM + 0.004),
                     (CHUTE_X1 + 0.006, CHUTE_Y, CHUTE_Z + 0.002), alu, bevel=0.002))
    # 出口端只有一道 4 mm 的唇口，球必须能滚出去
    parts.append(box("chute_exit_lip", (0.006, CHUTE_W + 0.004, 0.004),
                     (CHUTE_X0 - 0.002, CHUTE_Y, CHUTE_Z - 0.002), alu, bevel=0.001))
    # 斜槽与板边框的连接支架（L 形，夹在板的左边缘）
    parts.append(box("chute_arm", (0.066, 0.008, 0.014),
                     (CHUTE_X1 + 0.040, CHUTE_Y + CHUTE_W / 2 + 0.006, CHUTE_Z + 0.002), alu, bevel=0.002))
    parts.append(box("chute_arm2", (0.008, 0.068, 0.014),
                     (CHUTE_X1 + 0.070, (CHUTE_Y + CHUTE_W / 2 + BOARD_FACE) / 2 + 0.010, CHUTE_Z + 0.002),
                     alu, bevel=0.002))
    parts.append(box("chute_clamp", (0.030, 0.026, 0.032),
                     (-BOARD_W / 2 - 0.006, BOARD_FACE + 0.002, CHUTE_Z), white, bevel=0.003))
    parts.append(cyl("chute_clamp_screw", 0.0036, 0.016,
                     (-BOARD_W / 2 - 0.006, BOARD_FACE - 0.014, CHUTE_Z + 0.014), steel, verts=12))
    # 顶端电磁铁释放器：银圆柱 + 黑色吸盘面 + 铝支架
    em_pos = (RAMP_TOP[0] + 0.002, CHUTE_Y, RAMP_TOP[1] + 0.019)
    parts.append(cyl("magnet_body", 0.0145, 0.032, em_pos, steel, verts=24))
    parts.append(cyl("magnet_face", 0.0138, 0.006, (em_pos[0], em_pos[1], em_pos[2] + 0.018), black, verts=24))
    parts.append(rod_between("magnet_bracket", (em_pos[0] - 0.004, CHUTE_Y, em_pos[2] - 0.016),
                             (RAMP_TOP[0] + 0.030, CHUTE_Y, RAMP_TOP[1] + 0.006), 0.0042, alu))

    # ---------- 接球槽：横跨全宽的白色 L 形板 ----------
    parts.append(box("catch_floor", (BOARD_W, CATCH_Y1 - CATCH_Y0, 0.008),
                     (0, (CATCH_Y0 + CATCH_Y1) / 2, CATCH_Z - 0.004), white, bevel=0.0015))
    parts.append(box("catch_lip", (BOARD_W, 0.006, 0.016),
                     (0, CATCH_Y0 + 0.003, CATCH_Z + 0.006), white, bevel=0.0015))
    for sx in (-1, 1):
        parts.append(box(f"catch_bracket{sx}", (0.010, 0.032, 0.032),
                         (sx * (BOARD_W / 2 - 0.012), BOARD_FACE - 0.018, CATCH_Z - 0.022),
                         white, bevel=0.002))

    # ---------- 前沿透明亚克力挡条 + 滚花旋钮 ----------
    parts.append(box("acrylic", (BOARD_W - 0.030, 0.008, 0.046), (0, ACRY_Y, BASE_TOP + 0.023),
                     acryl, bevel=0.0012))
    for sx in (-1, 1):
        parts.append(box(f"acrylic_clip{sx}", (0.024, 0.014, 0.012),
                         (sx * 0.140, ACRY_Y, BASE_TOP + 0.047), steel, bevel=0.002))
        # 旋钮穿过亚克力拧在底板上的横向锁紧螺钉
        parts.append(cyl(f"knob_stem{sx}", 0.0038, 0.026,
                         (sx * 0.140, ACRY_Y - 0.009, BASE_TOP + 0.014), steel, axis="Y", verts=12))
        parts.append(cyl(f"knob_cap{sx}", 0.0105, 0.012,
                         (sx * 0.140, ACRY_Y - 0.022, BASE_TOP + 0.014), black, axis="Y", verts=20))

    attach(root, parts)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    export_glb(args.out, root)
    print("BUILD RESULT " + json.dumps({
        "file": args.out,
        "bounds": scene_bounds(root),
        "tris": tri_count(root),
        "parts": len(root.children_recursive),
        "base_top": round(BASE_TOP, 4),
        "board_face": round(BOARD_FACE, 4),
        "board_top": round(BOARD_TOP, 4),
        "chute": [CHUTE_X0, CHUTE_X1, round(CHUTE_Z, 4), round(CHUTE_Y, 4)],
        "ramp_top": [RAMP_TOP[0], RAMP_TOP[1]],
        "catch_z": CATCH_Z,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
