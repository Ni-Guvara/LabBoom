"""
build_l4_kit.py —— L4「验证牛顿第二定律」三件主器材（LabBoom）

一件脚本出三个 glb：
  public/models/wood_board.glb     长木板 1000 mm（硬木 + 侧面刻度条 + 右端定滑轮支架）
  public/models/trolley.glb        J2183 小车 121 mm（钢漆车身 + 4 橡胶轮 + 挡光片 + 纸带夹）
  public/models/sand_bucket.glb    砂桶（白桶 + 四绳 + 沙堆）

尺寸对齐 src/labs/L4/scene.ts：
  BOARD_LEN = 1.000 m   BOARD_W = 0.110 m   BOARD_T = 0.020 m
  木板原点 = 板底中心（scene 里 y = 垫块高度 0.106，板面 = 0.126）
  小车原点 = 车轮接触平面；挡光片部件名必须是 flag，中心高度 78 mm（= 光电门光轴 0.204 − 板面 0.126）
  滑轮顶切线 = 板面 + 33 mm（= 小车挂钩高度，绳才水平）
  砂桶原点 = 挂绳环中心（scene 里按绳端定位，桶身全在负 Z）

用法：
  blender -b -P blender/build_l4_kit.py -- --outdir public/models
"""

import bpy
import sys
import os
import math

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import lab_common as C
from lab_common import (
    box, cyl, torus, rod_between, box_array, hexnut,
    mat_steel, mat_paint_white, mat_plastic_black, mat_plastic_gray, mat_rubber,
    mat_plastic_red, mat_pbr, make_root, attach, scene_bounds, tri_count, export_glb,
)

# ---------------------------------------------------------------- 关键尺寸（米）
BOARD_LEN = 1.000
BOARD_W = 0.110
BOARD_T = 0.020

# 定滑轮：轮心超出板端，顶切线 = 板底 + 55 mm（= scene.ts 的 ROPE_Y，绳必须水平）
WHEEL_R = 0.025
WHEEL_X = 0.526
WHEEL_Z = 0.055 - WHEEL_R                # = 0.030，轮顶 0.055
WHEEL_W = 0.012

# 小车原点 = 车轮接触平面（摆在板面上，世界 0.02）。
# ROPE_Y 是绝对高度 0.055 → 车头挂环只能到局部 0.035，否则绳子会从挂环上方 2 cm 处飞过去。
CART_LEN = 0.121
CART_W = 0.050
CART_BODY = 0.030
WHEEL_CART_R = 0.009
HOOK_Y = 0.055 - BOARD_T                  # = 0.035
FLAG_Z = 0.078                            # 挡光片中心（相对板面 = 光轴 − 板面）
# 纸带平面必须等于打点计时器 glb 的纸带出口高度（build_ticker_timer.py 的 Z_TAPE = 19.5 mm），
# 否则纸带会从计时器孔口斜着往上爬 26 mm 挂到车尾，露馅。
# 19.9 mm = 19.5（出口平面）+ 0.4（纸带半厚）；scene.ts 的 TAPE_Y = 板面 20 + 19.9 mm。
TAPE_Y = 0.0399 - BOARD_T


def mat_wood():
    """硬木（上过清漆）：与 materials.ts 的 wood 同色，改了要同步"""
    return mat_pbr("wood", 0x6B4A26, 0.0, 0.82)


def mat_sand():
    return mat_pbr("sand", 0xC8A97E, 0.0, 0.95)


def frustum(name, r1, r2, depth, center, mat, verts=40):
    """圆台（砂桶桶身）。radius1 = 底部，radius2 = 顶部。"""
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts, radius1=r1, radius2=r2, depth=depth, location=center,
    )
    o = bpy.context.active_object
    return C._finish(o, name, mat, smooth=True)


# ---------------------------------------------------------------- 长木板
def build_board():
    P = []
    half = BOARD_LEN / 2

    # 板体：四角微倒，别做成刀片
    P.append(box("board", (BOARD_LEN, BOARD_W, BOARD_T), (0, 0, BOARD_T / 2),
                 mat_wood(), bevel=0.0018))

    # 两端铝包边（真实木板两头都包了角铝，防止小车冲出撞裂板端）
    for sx, tag in ((-1, "l"), (1, "r")):
        P.append(box(f"edge_{tag}", (0.012, BOARD_W + 0.002, BOARD_T + 0.001),
                     (sx * (half - 0.005), 0, BOARD_T / 2), mat_steel(), bevel=0.0015))

    # 前缘刻度条：白纸带 + 毫米刻线（10 cm 长刻、5 cm 中刻、1 cm 短刻）
    strip_y = BOARD_W / 2 - 0.008
    P.append(box("scale_strip", (0.960, 0.014, 0.0012), (0, strip_y, BOARD_T + 0.0006),
                 mat_paint_white()))
    ticks = []
    for i in range(97):                       # 0 ~ 96 cm
        x = -0.480 + i * 0.010
        ln = 0.0105 if i % 10 == 0 else (0.0075 if i % 5 == 0 else 0.0045)
        ticks.append(((0.0008, ln, 0.0006), (x, strip_y, BOARD_T + 0.0014)))
    P.append(box_array("scale_ticks", ticks, mat_plastic_black()))

    # 右端定滑轮支架：白漆折弯件 + 两根悬臂 + 轴
    P.append(box("bracket_base", (0.040, 0.048, 0.005), (half - 0.024, 0, BOARD_T + 0.0025),
                 mat_paint_white(), bevel=0.0012))
    for sy, tag in ((-1, "n"), (1, "f")):
        P.append(box(f"bracket_arm_{tag}", (0.052, 0.004, 0.006), (half + 0.008, sy * 0.020, BOARD_T + 0.004),
                     mat_paint_white(), bevel=0.001))
        P.append(box(f"bracket_ear_{tag}", (0.008, 0.004, 0.046), (WHEEL_X, sy * 0.020, WHEEL_Z),
                     mat_paint_white(), bevel=0.001))
    P.append(cyl("axle", 0.0022, 0.048, (WHEEL_X, 0, WHEEL_Z), mat_steel(), axis="Y", verts=16))

    # 滑轮（白色尼龙盘 + 两侧挡边）：L4 运行时按绳速转这个部件
    P.append(cyl("wheel", WHEEL_R, WHEEL_W, (WHEEL_X, 0, WHEEL_Z), mat_paint_white(), axis="Y", verts=40))
    for sy in (-1, 1):
        P.append(cyl(f"wheel_flange_{'n' if sy < 0 else 'f'}", WHEEL_R + 0.0015, 0.0012,
                     (WHEEL_X, sy * (WHEEL_W / 2 - 0.0006), WHEEL_Z), mat_paint_white(), axis="Y", verts=40))

    return P


# ---------------------------------------------------------------- J2183 小车
def build_cart():
    P = []
    half_len = CART_LEN / 2

    # 车身：灰漆钢盒，底面离地 14 mm（四个轮子露在下面）
    body_z0 = WHEEL_CART_R + 0.005
    P.append(box("body", (CART_LEN, CART_W, CART_BODY), (0, 0, body_z0 + CART_BODY / 2),
                 mat_plastic_gray(), bevel=0.0022))
    body_top = body_z0 + CART_BODY

    # 四个橡胶轮（轴距 84 mm、轨距 50 mm）
    for sx, nx in ((-1, "r"), (1, "f")):
        for sy, ny in ((-1, "l"), (1, "r")):
            P.append(cyl(f"wheel_{nx}{ny}", WHEEL_CART_R, 0.006,
                         (sx * 0.042, sy * 0.025, WHEEL_CART_R), mat_rubber(), axis="Y", verts=20))

    # 顶部两片配重（真实件上的 2×φ30 配重片，供"改变小车质量"演示）
    for sx in (-1, 1):
        P.append(cyl("top_plate", 0.015, 0.009, (sx * 0.030, 0, body_top + 0.0045),
                     mat_steel(), axis="Z", verts=24))
        P.append(hexnut("top_plate_nut", 0.0045, 0.004, (sx * 0.030, 0, body_top + 0.011), mat_steel()))

    # 前后挂钩（绳/纸带都挂在这两个环上）：环心 x = 0.0665，与 scene.ts 的 HOOK_X 对齐
    for sx, tag in ((-1, "rear"), (1, "front")):
        P.append(box(f"hook_boss_{tag}", (0.006, 0.014, 0.012), (sx * (half_len + 0.002), 0, HOOK_Y),
                     mat_steel(), bevel=0.001))
        P.append(torus(f"hook_{tag}", 0.0055, 0.0012, (sx * (half_len + 0.006), 0, HOOK_Y),
                       mat_steel(), axis="X", seg=16))

    # 尾部纸带夹（弹簧压片）：纸带面压在夹片上表面（= TAPE_Y），纸带从这被拖进打点计时器
    P.append(box("tape_clip", (0.020, 0.030, 0.0018), (-0.048, 0, TAPE_Y - 0.0009),
                 mat_steel(), bevel=0.0006))

    # 挡光片：立柱 + 竖片（竖片沿运动方向宽 50 mm，运行时按面板参数横向缩放）
    P.append(box("flag_post", (0.006, 0.006, 0.016), (0.020, 0, body_top + 0.008),
                 mat_plastic_black(), bevel=0.0008))
    P.append(box("flag", (0.050, 0.003, 0.038), (0.020, 0, FLAG_Z),
                 mat_plastic_black(), bevel=0.001))

    return P


# ---------------------------------------------------------------- 砂桶
def build_bucket():
    P = []
    rim_z = -0.030                 # 桶口（离挂环 30 mm）
    depth = 0.070
    r_top = 0.045
    r_bot = 0.038

    # 挂绳环 + 四根吊绳（真实砂桶是四绳吊环，不是一根线）
    P.append(torus("hang_ring", 0.009, 0.0016, (0, 0, 0), mat_steel(), axis="Z", seg=18))
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.append(rod_between(
                f"string_{'l' if sx < 0 else 'r'}{'n' if sy < 0 else 'f'}",
                (sx * 0.004, sy * 0.004, -0.002),
                (sx * r_top * 0.82, sy * r_top * 0.82, rim_z),
                0.0007, mat_steel(), verts=6,
            ))

    # 桶身（白 PP 锥台）+ 口沿 + 底盖
    P.append(frustum("bucket", r_bot, r_top, depth, (0, 0, rim_z - depth / 2), mat_paint_white()))
    P.append(torus("bucket_rim", r_top, 0.0026, (0, 0, rim_z), mat_paint_white(), axis="Z", seg=36))
    P.append(cyl("bucket_bottom", r_bot, 0.003, (0, 0, rim_z - depth), mat_plastic_gray(), axis="Z", verts=36))

    # 沙子：堆在桶口上方的小锥（半桶沙，和面板"砂桶+砝码总质量"对应）
    P.append(frustum("sand", 0.040, 0.010, 0.026, (0, 0, rim_z + 0.010), mat_sand(), verts=32))

    return P


# ---------------------------------------------------------------- 主流程
def emit(name, builder, out_dir):
    C.reset_scene()
    root = make_root(name)
    parts = builder()
    attach(root, parts)
    b = scene_bounds(root)
    tris = tri_count(root)
    path = os.path.join(out_dir, f"{name}.glb")
    export_glb(path, root)
    print(f"\n=== BUILD {name} ===")
    print(f"parts      {len(parts)}")
    print(f"tris       {tris}")
    print(f"bounds_mm  {b['size_mm']}")
    print(f"min_z      {b['min'][2]:.4f}")
    print(f"size_kb    {os.path.getsize(path) / 1024:.1f}")
    print(f"out        {path}")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = "public/models"
    if "--outdir" in argv:
        out_dir = argv[argv.index("--outdir") + 1]
    os.makedirs(out_dir, exist_ok=True)

    emit("wood_board", build_board, out_dir)
    emit("trolley", build_cart, out_dir)
    emit("sand_bucket", build_bucket, out_dir)
    print("\nDONE")


if __name__ == "__main__":
    main()
