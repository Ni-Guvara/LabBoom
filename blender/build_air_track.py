"""
build_air_track.py —— 气垫导轨 + 滑行器（LabBoom L1/L4 主器材）

一件脚本出两个 glb：
  public/models/air_track.glb   气垫导轨 1200 mm（三角型材 + 斜面气浮孔 + 侧面刻度 + 可调地脚）
  public/models/sled.glb        滑行器 155 mm（倒 V 槽无轮，骑在导轨尖顶上）

尺寸对齐 src/labs/_shared/instruments.ts：
  RAIL_LENGTH = 1.20 m     顶面（气浮面）高度 110 mm     顶角 2×40.6°
  滑行器挡光片部件名必须是 flag —— L1/scene.ts 按这个名字取挡光时刻，改名即断。

用法：
  blender -b -P blender/build_air_track.py -- --outdir public/models
"""

import bpy
import sys
import os
import math

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import lab_common as C
from lab_common import (
    box, cyl, hexnut, torus, prism, box_array, disc_array,
    mat_steel, mat_brass, mat_aluminum, mat_glass, mat_paper_dark, mat_plastic_black,
    mat_plastic_gray, mat_rubber, make_root, attach, scene_bounds, tri_count, export_glb,
)

# ---------------------------------------------------------------- 关键尺寸（米）
RAIL_LEN = 1.20
TOP_Z = 0.110          # 气浮面（滑行器骑在这条线上）
HALF_TOP = 0.003       # 顶面小平条半宽
HALF_W = 0.045         # 斜面底端半宽
SLOPE_BOT_Z = 0.074    # 斜面下端高度
SIDE_BOT_Z = 0.054     # 侧面竖直段下端
BODY_BOT_Z = 0.046     # 型材底面
KICK_X = 0.038         # 底部内收
FOOT_X = 0.30          # 地脚间距（与 L1 的垫片位置一致，别改）
SLOPE_ANG = math.atan2(TOP_Z - SLOPE_BOT_Z, HALF_W - HALF_TOP)  # 40.6°

SLED_LEN = 0.155
SLED_HALF = 0.031     # 本体半宽 62 mm —— V 槽只包导轨上部，别一直伸到斜面底端
SLED_TRAY_BOT = 0.026
SLED_TRAY_TOP = 0.062


def fresh():
    """清场景 + 清材质缓存。材质对象随场景被删，字典不清会指向失效引用。"""
    C.reset_scene()
    C._MATS.clear()


# ---------------------------------------------------------------- 导轨
def build_rail():
    P = []
    half = RAIL_LEN / 2

    # --- 型材主体：三角尖顶 + 竖直侧壁 + 内收底边（一次挤出成型）---
    profile = [
        (-HALF_TOP, TOP_Z),
        (HALF_TOP, TOP_Z),
        (HALF_W, SLOPE_BOT_Z),
        (HALF_W, SIDE_BOT_Z),
        (KICK_X, BODY_BOT_Z),
        (-KICK_X, BODY_BOT_Z),
        (-HALF_W, SIDE_BOT_Z),
        (-HALF_W, SLOPE_BOT_Z),
    ]
    P.append(prism("rail_body", profile, RAIL_LEN, 0.0, mat_aluminum(), bevel=0.0008))

    # --- 气浮孔：两排，沿斜面中线，φ1 mm / 孔距 25 mm ---
    span = RAIL_LEN - 0.10
    n_hole = int(span / 0.025) + 1
    t = 0.45  # 孔在斜面上的位置参数（0=顶尖，1=斜面底端）
    hy = HALF_TOP + (HALF_W - HALF_TOP) * t
    hz = TOP_Z - (TOP_Z - SLOPE_BOT_Z) * t
    # 斜面外法线（单位向量）
    ny, nz = math.sin(SLOPE_ANG), math.cos(SLOPE_ANG)
    for sgn in (1, -1):
        centers = []
        for i in range(n_hole):
            x = -span / 2 + i * 0.025
            centers.append((x, sgn * (hy + ny * 0.0004), hz + nz * 0.0004))
        P.append(disc_array(f"air_holes_{'r' if sgn > 0 else 'l'}", centers,
                            (0.0, sgn * ny, nz), 0.0005, mat_paper_dark(), seg=8))

    # --- 侧面刻度：0.01 m 短刻 / 0.05 m 中刻 / 0.10 m 长刻 ---
    side_y = HALF_W + 0.0002
    tick_specs = []
    n_tick = int(RAIL_LEN / 0.01)
    for i in range(n_tick + 1):
        x = -half + 0.01 + i * 0.01
        if i % 10 == 0:
            h, w = 0.014, 0.0008
        elif i % 5 == 0:
            h, w = 0.010, 0.0007
        else:
            h, w = 0.006, 0.0005
        tick_specs.append(((w, 0.0004, h), (x, side_y, SIDE_BOT_Z + 0.004 + h / 2)))
    P.append(box_array("scale_ticks", tick_specs, mat_paper_dark()))
    # 刻线底衬（浅色标尺带，否则黑刻线在银白型材上看不清）
    P.append(box("scale_strip", (RAIL_LEN - 0.04, 0.0003, 0.019),
                 (0, side_y - 0.0002, SIDE_BOT_Z + 0.0135), mat_plastic_gray()))

    # --- 两端缓冲：挡板 + 圈簧 + 挂钩 ---
    for sx, tag in ((-1, "l"), (1, "r")):
        x_end = sx * (half - 0.006)
        P.append(box(f"bumper_{tag}", (0.012, 0.070, 0.042), (x_end, 0, 0.086),
                     mat_plastic_black(), bevel=0.002))
        # 圈簧：3 圈，压在挡板内侧
        for k in range(3):
            P.append(torus(f"spring_{tag}_{k}", 0.0085, 0.0011,
                           (x_end - sx * (0.008 + k * 0.0055), 0, 0.086),
                           mat_steel(), axis="X", seg=16))
        P.append(torus(f"hook_{tag}", 0.005, 0.0012, (sx * (half + 0.004), 0, 0.078),
                       mat_steel(), axis="Y", seg=14))

    # --- 可调地脚 ×2：橡胶底盘 + 螺杆 + 锁紧螺母 + 安装座 ---
    for sx, tag in ((-1, "l"), (1, "r")):
        x = sx * FOOT_X
        P.append(cyl(f"foot_pad_{tag}", 0.016, 0.006, (x, 0, 0.003), mat_rubber(), verts=24))
        P.append(cyl(f"foot_screw_{tag}", 0.005, 0.038, (x, 0, 0.025), mat_steel(), verts=14))
        P.append(hexnut(f"foot_nut_{tag}", 0.0095, 0.006, (x, 0, 0.042), mat_steel()))
        P.append(box(f"foot_mount_{tag}", (0.030, 0.034, 0.012), (x, 0, 0.044),
                     mat_plastic_black(), bevel=0.0015))

    # --- 进气嘴（左端面正中）：黄铜快接 + 一段软管 ---
    port_x = -half - 0.010
    P.append(cyl("air_port", 0.0075, 0.020, (port_x, 0, 0.080), mat_brass(), axis="X", verts=18))
    P.append(cyl("air_port_ring", 0.010, 0.006, (-half - 0.003, 0, 0.080), mat_brass(),
                 axis="X", verts=18))
    P.append(cyl("air_hose", 0.0058, 0.046, (-half - 0.043, 0, 0.080), mat_rubber(),
                 axis="X", verts=18))
    P.append(cyl("air_hose_clamp", 0.0072, 0.005, (-half - 0.021, 0, 0.080), mat_steel(),
                 axis="X", verts=14))

    return P


# ---------------------------------------------------------------- 滑行器
def build_sled():
    P = []
    half = SLED_LEN / 2

    # --- 倒 V 槽薄壁：内壁与导轨斜面平行（40.6°），壁厚 2.5 mm（实测，原 3 mm 偏厚）---
    WALL = 0.0025
    slope = math.tan(SLOPE_ANG)                          # dz/dy
    in_tip_z = 0.0   # 原点必须严格落在 V 尖（= 与导轨的接触点），气膜间隙在装配时给
    in_end_z = SLED_HALF * slope + in_tip_z              # 内壁在 ±31 mm 处的高度
    out_tip_z = in_tip_z + WALL / math.cos(SLOPE_ANG)    # 尖端沿竖直方向量 2.5 mm
    out_end_y = SLED_HALF - WALL * math.sin(SLOPE_ANG)
    out_end_z = in_end_z + WALL * math.cos(SLOPE_ANG)

    profile = [
        (0.0, in_tip_z),
        (SLED_HALF, in_end_z),
        (out_end_y, out_end_z),
        (0.0, out_tip_z),
        (-out_end_y, out_end_z),
        (-SLED_HALF, in_end_z),
    ]
    # 不做倒角：V 尖是最低点，一倒角就被削掉 0.2 mm，底面回不到 y=0
    P.append(prism("body_v", profile, SLED_LEN, 0.0, mat_aluminum(), bevel=0.0))

    # --- 上部配重槽（U 形，开口朝上）---
    # 口沿 1 mm 倒角：两侧外沿各切一刀，去掉「方盒感」（原模型没倒角，槽口是硬直角）
    CH = 0.001
    box_profile = [
        (-SLED_HALF, SLED_TRAY_BOT),
        (SLED_HALF, SLED_TRAY_BOT),
        (SLED_HALF, SLED_TRAY_TOP - CH),
        (SLED_HALF - CH, SLED_TRAY_TOP),               # ← 右侧口沿倒角
        (SLED_HALF - WALL, SLED_TRAY_TOP),
        (SLED_HALF - WALL, SLED_TRAY_BOT + WALL),
        (-(SLED_HALF - WALL), SLED_TRAY_BOT + WALL),
        (-(SLED_HALF - WALL), SLED_TRAY_TOP),
        (- (SLED_HALF - CH), SLED_TRAY_TOP),           # ← 左侧口沿倒角
        (-SLED_HALF, SLED_TRAY_TOP - CH),
    ]
    # 配重槽与 V 槽同色同料：真实滑行器是整体铝合金挤压件，不是黑塑料盒
    P.append(prism("body_tray", box_profile, SLED_LEN - 0.006, 0.0,
                   mat_aluminum(), bevel=0.0015))

    # --- 配重片（50 g，落在槽底）---
    P.append(box("weight", (0.040, 0.030, 0.005), (0, 0, 0.0315), mat_steel(), bevel=0.0008))

    # --- 挡光片支架 + 挡光片（部件名必须是 flag）---
    P.append(box("flag_post", (0.007, 0.007, 0.020), (0.020, 0, 0.056),
                 mat_plastic_black(), bevel=0.0008))
    P.append(box("flag", (0.020, 0.004, 0.038), (0.020, 0, 0.078),
                 mat_plastic_black(), bevel=0.0012))

    # --- 两端缓冲头 + 挂钩 ---
    for sx, tag in ((-1, "l"), (1, "r")):
        # 端部缓冲头圆角提到 R4：原 R2 让整机看着像方盒（规格书要求箱体四角 R5 的观感）
        P.append(box(f"bumper_{tag}", (0.010, 0.052, 0.036), (sx * (half - 0.005), 0, 0.044),
                     mat_plastic_black(), bevel=0.004))
        P.append(torus(f"hook_{tag}", 0.0045, 0.0011, (sx * (half + 0.003), 0, 0.040),
                       mat_steel(), axis="Y", seg=14))

    # --- 顶部水准泡（滑行器调平指示，真实件上有）---
    P.append(cyl("level_bubble", 0.006, 0.004, (-0.045, 0, 0.064), mat_glass(), verts=18))

    return P


# ---------------------------------------------------------------- 主流程
def emit(name, builder, out_dir):
    fresh()
    root = make_root(name)
    parts = builder()
    attach(root, parts)
    b = scene_bounds(root)
    tris = tri_count(root)
    path = os.path.join(out_dir, f"{name}.glb")
    export_glb(path, root)
    size_kb = os.path.getsize(path) / 1024
    print(f"\n=== BUILD {name} ===")
    print(f"parts      {len(parts)}")
    print(f"tris       {tris}")
    print(f"bounds_mm  {b['size_mm']}")
    print(f"min_z      {b['min'][2]:.4f}   (Blender Z-up；导出转 Y-up 后即 glTF 的 Y)")
    print(f"size_kb    {size_kb:.1f}")
    print(f"out        {path}")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = "public/models"
    if "--outdir" in argv:
        out_dir = argv[argv.index("--outdir") + 1]
    os.makedirs(out_dir, exist_ok=True)

    emit("air_track", build_rail, out_dir)
    emit("sled", build_sled, out_dir)
    print("\nDONE")


if __name__ == "__main__":
    main()
