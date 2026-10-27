"""
build_retort_stand.py —— 铁架台（含横杆、十字夹、米尺挂夹、400 mm 钢米尺）
用法：blender.exe -b -P blender/build_retort_stand.py -- --out public/models/retort_stand.glb

真机构造（1:1）：铸铁底座（四角橡胶脚 + 立柱座凸台 + M8 顶丝）→ Ø12×900 镀锌立柱
→ 下十字夹（两个滚花旋钮）夹 Ø10×300 横杆 → 横杆末端焊接水平吊环（挂弹簧）
→ 横杆上挂米尺夹，夹住 400 mm 钢米尺（0 在下端，1 cm 分度、5 cm 加长）。

坐标（three，+Y 上，+Z 朝观察者）：根节点 = 底座底面中心，立柱轴线 x=0、z=-0.040。
横杆轴线 y=0.875，伸向 +X 到 x=0.300，末端吊环下缘 y=0.8485；
弹簧上钩环中心 = 0.843（前端 SPRING_TOP_Y 必须一致）。
米尺尺面 z=-0.0392（朝 +Z），x 中心 0.240，刻度底 0.465。
"""

import bpy  # noqa: F401
import os
import sys
import json
import math

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from lab_common import (  # noqa: E402
    reset_scene, make_root, attach, export_glb, scene_bounds, tri_count,
    box, cyl, torus, box_array, mat_pbr,
    mat_plastic_black, mat_plastic_gray, mat_steel, mat_rubber,
    mat_paint_white,
)

BASE_W, BASE_D, BASE_H = 0.200, 0.130, 0.016
ROD_R, ROD_TOP, ROD_Z = 0.006, 0.900, -0.040
ARM_Y, ARM_LEN, ARM_R = 0.875, 0.300, 0.005
RING_Z = -0.040
RULER_X, RULER_W, RULER_T, RULER_TOP, RULER_LEN = 0.240, 0.025, 0.0016, 0.865, 0.400


def T(p):
    """three (x,y,z) → blender (x,-z,y)"""
    return (p[0], -p[2], p[1])


def S(s):
    return (s[0], s[2], s[1])


def bx(name, size, center, mat, bevel=0.0):
    return box(name, S(size), T(center), mat, bevel=bevel)


def cy(name, radius, depth, center, mat, axis="Y", verts=32):
    return cyl(name, radius, depth, T(center), mat,
               axis={"Y": "Z", "X": "X", "Z": "Y"}[axis], verts=verts)


def tn(name, major, minor, center, mat, axis="Y", seg=32):
    return torus(name, major, minor, T(center), mat,
                 axis={"Y": "Z", "X": "X", "Z": "Y"}[axis], seg=seg)


def build():
    reset_scene()
    root = make_root("retort_stand")
    P = []
    black = mat_plastic_black()
    gray = mat_plastic_gray()
    steel = mat_steel()
    rubber = mat_rubber()
    iron = mat_pbr("castIron", 0x22262B, 0.35, 0.62)
    ruler_mat = mat_paint_white()
    tick_mat = mat_plastic_black()

    # ---------------- 底座 ----------------
    for sx in (-1, 1):
        for sz in (-1, 1):
            P.append(cy(f"foot_{'lr'[sx > 0]}{'bf'[sz > 0]}", 0.010, 0.004,
                        (sx * 0.085, 0.002, -0.020 + sz * 0.044), rubber, verts=18))
    P.append(bx("base_plate", (BASE_W, BASE_H, BASE_D), (0, 0.004 + BASE_H / 2, -0.020),
                iron, bevel=0.006))
    # 立柱座凸台
    P.append(cy("post_seat", 0.014, 0.008, (0, BASE_H + 0.004, ROD_Z), iron, verts=26))
    P.append(cy("post_seat_nut", 0.0115, 0.006, (0, BASE_H + 0.009, ROD_Z), steel, verts=6))
    # M8 顶丝（锁立柱）+ 滚花
    P.append(cy("seat_screw", 0.004, 0.014, (0.016, BASE_H + 0.006, ROD_Z),
                steel, axis="X", verts=14))
    P.append(tn("seat_screw_knurl", 0.0052, 0.0012, (0.0235, BASE_H + 0.006, ROD_Z),
                steel, axis="X", seg=20))

    # ---------------- 立柱 ----------------
    rod_h = ROD_TOP - (BASE_H + 0.008)
    P.append(cy("rod", ROD_R, rod_h, (0, BASE_H + 0.008 + rod_h / 2, ROD_Z), steel, verts=28))
    P.append(cy("rod_collar", 0.009, 0.024, (0, BASE_H + 0.020, ROD_Z), steel, verts=22))
    P.append(cy("rod_cap", 0.0068, 0.007, (0, ROD_TOP + 0.0035, ROD_Z), black, verts=20))

    # ---------------- 下十字夹 + 横杆 ----------------
    P.append(bx("clamp_body", (0.030, 0.034, 0.030), (0, ARM_Y, ROD_Z), black, bevel=0.003))
    P.append(cy("clamp_knob_post", 0.0075, 0.010, (-0.020, ARM_Y, ROD_Z),
                steel, axis="X", verts=18))
    P.append(tn("clamp_knurl_post", 0.0078, 0.0012, (-0.0265, ARM_Y, ROD_Z),
                steel, axis="X", seg=22))
    P.append(cy("clamp_knob_arm", 0.0065, 0.010, (0, ARM_Y + 0.022, ROD_Z),
                steel, axis="Y", verts=18))
    P.append(tn("clamp_knurl_arm", 0.0068, 0.0011, (0, ARM_Y + 0.0285, ROD_Z),
                steel, axis="Y", seg=22))
    P.append(cy("arm", ARM_R, ARM_LEN, (ARM_LEN / 2, ARM_Y, ROD_Z), steel, axis="X", verts=20))
    # 横杆末端焊接水平吊环（轴竖直，弹簧钩从下方穿过）
    P.append(tn("arm_ring", 0.0085, 0.0015, (ARM_LEN, ARM_Y - 0.013, ROD_Z), steel, axis="Y"))

    # ---------------- 米尺挂夹 + 米尺 ----------------
    P.append(bx("ruler_clamp", (0.026, 0.020, 0.020), (RULER_X, ARM_Y - 0.003, ROD_Z),
                gray, bevel=0.002))
    P.append(cy("ruler_clamp_knob", 0.0055, 0.012, (RULER_X, ARM_Y + 0.014, ROD_Z),
                steel, axis="Y", verts=16))
    P.append(bx("ruler", (RULER_W, RULER_LEN, RULER_T),
                (RULER_X, RULER_TOP - RULER_LEN / 2, ROD_Z), ruler_mat, bevel=0.0004))
    # 刻度：0 在**顶端**、向下每 1 cm 一格，5 cm 加长（长 16 / 短 9 mm，从尺左缘往右排）。
    # 0 在顶端是因为砝码盘越重指针越低：这样指针下垂时读数变大，Δx = 末读数 − 初读数，
    # 和"伸长量"同向；反过来刻，学生每次都要提醒自己相减的顺序。
    # 线宽 0.8 mm：真尺刻度 0.3~0.5 mm，但默认机位下 1 px ≈ 0.5 mm，再细就采不到样、整条尺发白。
    # 三个分量都是 three 绝对坐标：漏掉 RULER_X / ROD_Z 会让整排刻度落到原点（立柱旁）去。
    specs = []
    for i in range(41):
        long_tick = i % 5 == 0
        specs.append(((0.016 if long_tick else 0.009, 0.0008, 0.0004),
                      (RULER_X - RULER_W / 2 + (0.008 if long_tick else 0.0045),
                       RULER_TOP - i * 0.010,
                       ROD_Z + RULER_T / 2 + 0.0002)))
    P.append(box_array("ruler_scale", [(S(s), T(c)) for s, c in specs], tick_mat))
    # 尺端挂孔
    P.append(cy("ruler_hole_ring", 0.0028, 0.0006, (RULER_X, RULER_TOP - 0.006, ROD_Z + 0.001),
                steel, axis="Z", verts=14))

    return root, P


def main():
    argv = sys.argv
    out = "public/models/retort_stand.glb"
    if "--" in argv:
        rest = argv[argv.index("--") + 1:]
        if "--out" in rest:
            out = rest[rest.index("--out") + 1]
    out = os.path.abspath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    root, P = build()
    attach(root, P)
    export_glb(out, root)
    print("=== BUILD RESULT ===")
    print(json.dumps({
        "file": out,
        "size_kb": round(os.path.getsize(out) / 1024, 1),
        "parts": len([o for o in root.children_recursive if o.type == "MESH"]),
        "tris": tri_count(root),
        "bounds": scene_bounds(root),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
