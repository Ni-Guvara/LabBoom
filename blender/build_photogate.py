"""
build_photogate.py —— 气垫导轨用光电门（U 形叉口，Blender 4.5）

用法：blender.exe -b -P blender/build_photogate.py -- --out public/models/photogate.glb

真机构造（1:1）：铸铁底座+橡胶脚垫+调平螺钉 → 螺纹套+锁紧螺母 → Ø10 立杆（带刻度）
→ 十字夹（滚花旋钮）夹 Ø16×20 方管横臂 → 横臂横跨导轨，末端挂 U 形叉口
（横梁+两条垂臂+臂端管座）→ 两臂内侧红外窗 + 前臂指示灯 + 横梁顶面斜置数显窗。

坐标：根节点 = 底座底面中心（y=0 贴台面），立杆轴线 x=z=0，
**门头中心在 z=+0.085**（three 坐标，+z 朝观察者）。所以整机摆到 z=-0.085 时，
叉口中心正好落在导轨中线 z=0。

两套规格由 --post / --gap 控制（立杆顶高度是唯一自由参数，其余派生）：
  长杆款（默认，L1 气垫导轨）：post 272 mm、gap 115 mm、光轴 204 mm
    blender -b -P blender/build_photogate.py -- --out public/models/photogate.glb
  台式短杆款（L4 长木板）：post 166 mm、gap 135 mm（夹住 120 mm 木板）、光轴 98 mm
    blender -b -P blender/build_photogate.py -- --post 0.166 --gap 0.135 --base-d 0.040 \
        --out public/models/photogate_bench.glb
"""

import bpy
import os
import sys
import json
import math

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from lab_common import (  # noqa: E402
    reset_scene, make_root, attach, export_glb, scene_bounds, tri_count,
    box, cyl, hexnut, torus, box_array,
    mat_plastic_black, mat_plastic_gray, mat_steel, mat_rubber,
    mat_plastic_red, mat_glass,
)

BASE_W, BASE_D, BASE_H, FOOT_H = 0.090, 0.056, 0.014, 0.004
POST_R = 0.005
BEAM_W, BEAM_H = 0.016, 0.020
HEAD_Z = 0.085
ARM_T, ARM_W = 0.014, 0.012
BEAM_LEN = 0.1445

# 两套规格，同一套代码：立杆顶 POST_TOP 是唯一自由参数，其余全部派生。
#   CLAMP_Y = POST_TOP - 0.024（立杆露出十字夹 24 mm）
#   AXIS_Y  = CLAMP_Y - 0.044（横臂底面到光轴）
#   ARM_BOT = max(20 mm, AXIS_Y - 119 mm)（垂臂下沿降到轨道/木板两侧，但不扎进底座）
# 叉口净宽 GAP 必须大于被测支承件宽度，否则垂臂会插进导轨/木板：
#   气垫导轨 90 → 115；长木板 120 → 135（挡光片从叉口正中穿过，不受净宽影响）
# 前端 src/labs/_shared/photogate.ts 用同样的派生式，改这里必须同步改那边。
TALL = dict(post_top=0.272, gap=0.115, base_d=BASE_D)    # 气垫导轨款（L1）：光轴 204 mm
BENCH = dict(post_top=0.166, gap=0.135, base_d=0.040)    # 桌面款（L4 木板）：光轴 98 mm，底座进深收窄免得压到木板


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


def tn(name, major, minor, center, mat, axis="Y"):
    return torus(name, major, minor, T(center), mat,
                 axis={"Y": "Z", "X": "X", "Z": "Y"}[axis], seg=28)


def build(post_top=TALL["post_top"], gap=TALL["gap"], base_d=BASE_D):
    # 派生尺寸（局部变量，覆盖模块级默认值）
    CLAMP_Y = post_top - 0.024
    AXIS_Y = CLAMP_Y - 0.044
    ARM_BOT = max(0.020, AXIS_Y - 0.119)
    ARM_Z = (HEAD_Z - gap / 2 - ARM_T / 2, HEAD_Z + gap / 2 + ARM_T / 2)

    reset_scene()
    root = make_root("photogate")
    P = []
    black, gray, steel, rubber = (mat_plastic_black(), mat_plastic_gray(),
                                  mat_steel(), mat_rubber())

    # ---------------- 底座 ----------------
    for sx in (-1, 1):
        for sz in (-1, 1):
            P.append(cy(f"foot_{'lr'[sx > 0]}{'bf'[sz > 0]}", 0.006, FOOT_H,
                        (sx * 0.030, FOOT_H / 2, sz * (base_d / 2 - 0.010)), rubber, verts=16))
    P.append(bx("base_plate", (BASE_W, BASE_H, base_d),
                (0, FOOT_H + BASE_H / 2, 0), black, bevel=0.0025))
    P.append(bx("base_lip", (BASE_W - 0.006, 0.005, 0.010),
                (0, FOOT_H + 0.0025, base_d / 2 - 0.005), black, bevel=0.0015))
    for sx in (-1, 1):
        nm = 'lr'[sx > 0]
        P.append(cy(f"level_screw_{nm}", 0.0045, 0.012,
                    (sx * 0.030, FOOT_H + BASE_H + 0.004, base_d / 2 - 0.006), steel, verts=14))
        P.append(tn(f"level_knurl_{nm}", 0.0048, 0.0011,
                    (sx * 0.030, FOOT_H + BASE_H + 0.0095, base_d / 2 - 0.006), steel))

    # ---------------- 立杆 ----------------
    y0 = FOOT_H + BASE_H
    P.append(cy("collar", 0.0098, 0.016, (0, y0 + 0.008, 0), steel, verts=24))
    P.append(hexnut("locknut", 0.0086, 0.005, T((0, y0 + 0.0185, 0)), steel))
    P.append(cy("post", POST_R, post_top - (y0 - 0.006), (0, (post_top + y0 - 0.006) / 2, 0),
                steel, verts=20))
    P.append(cy("post_cap", 0.0062, 0.004, (0, post_top + 0.002, 0), steel, verts=18))
    ticks = []
    # 刻线从 50 mm 起每 10 mm 一道，道数随立杆高度自适应（短杆版不能多出悬空刻线）
    tick_n = int((post_top - 0.050) / 0.010)
    for i in range(tick_n + 1):
        long_tick = (i % 5 == 0)
        ticks.append(((0.009 if long_tick else 0.005, 0.0008, 0.0006),
                      (0, 0.050 + i * 0.010, POST_R + 0.0004)))
    scale_len = post_top - 0.050
    ticks.append(((0.0008, scale_len, 0.0006),
                  (POST_R + 0.0004, 0.050 + scale_len / 2, 0)))
    P.append(box_array("post_scale", [(S(s), T(c)) for s, c in ticks], mat_plastic_gray()))

    # ---------------- 十字夹 + 横臂 ----------------
    P.append(bx("cross_clamp", (0.026, 0.026, 0.030), (0, CLAMP_Y, 0), gray, bevel=0.002))
    P.append(cy("cross_knob", 0.008, 0.009, (0.017, CLAMP_Y, 0), steel, axis="X", verts=20))
    P.append(tn("cross_knob_knurl", 0.0082, 0.0013, (0.0195, CLAMP_Y, 0), steel, axis="X"))
    P.append(bx("beam", (0.016, 0.020, BEAM_LEN), (0, CLAMP_Y, HEAD_Z), black, bevel=0.0018))
    # 横臂上的滑动夹块：松开旋钮可沿横臂平移门头对光轴（真机就是这么调的）
    P.append(bx("head_clamp", (0.028, 0.028, 0.024), (0, CLAMP_Y, 0.030), gray, bevel=0.002))
    P.append(cy("head_clamp_screw", 0.0032, 0.030, (0, CLAMP_Y - 0.019, 0.030), steel, verts=12))
    P.append(hexnut("head_clamp_nut", 0.0048, 0.004, T((0, CLAMP_Y - 0.036, 0.030)), steel))

    # ---------------- 门头：两条垂臂 + 臂端管座 ----------------
    arm_h = CLAMP_Y - BEAM_H / 2 - ARM_BOT
    arm_y = ARM_BOT + arm_h / 2
    for i, az in enumerate(ARM_Z):
        nm = 'fb'[i == 1]
        P.append(bx(f"arm_{nm}", (ARM_W, arm_h, ARM_T), (0, arm_y, az), black, bevel=0.0015))
        P.append(bx(f"arm_cap_{nm}", (0.013, 0.006, 0.015), (0, ARM_BOT - 0.001, az), gray,
                    bevel=0.0012))
        # 红外窗：臂**内侧**深色玻璃 + 遮光筒（两条垂臂的窗必须相对，朝叉口内）
        # 远端臂在 z 小侧，内侧朝 +z；近端臂反之 —— 早先符号写反，窗装到了臂外侧。
        inner = az + ARM_T / 2 if i == 0 else az - ARM_T / 2
        sgn = 1 if i == 0 else -1
        P.append(cy(f"ir_tube_{nm}", 0.0042, 0.006, (0, AXIS_Y, inner + sgn * 0.003),
                    black, axis="Z", verts=16))
        P.append(cy(f"ir_window_{nm}", 0.0034, 0.0008, (0, AXIS_Y, inner + sgn * 0.0002),
                    mat_glass(), axis="Z", verts=16))

    # ---------------- 指示灯 + 数显窗 ----------------
    P.append(cy("led", 0.0021, 0.0016, (0, AXIS_Y - 0.014, ARM_Z[1] + ARM_T / 2 + 0.0004),
                mat_plastic_red(), axis="Z", verts=14))
    # 数显窗：斜置 17°，**凸出横臂顶面**——原先窗口中心比横臂顶面还低 3 mm，
    # 整个斜台埋在方管里，只露出一条细边，前端贴的读数就看不见了。
    tilt = 0.30
    n_y, n_z = math.cos(tilt), math.sin(tilt)      # 窗面法线 (0, cos, sin)
    disp_y, disp_z = CLAMP_Y + BEAM_H / 2 + 0.000, HEAD_Z + 0.004   # 0.2250 / 0.0890
    plate = bx("display_bezel", (0.042, 0.006, 0.016), (0, disp_y, disp_z),
               mat_plastic_gray(), bevel=0.0012)
    plate.rotation_mode = "XYZ"
    plate.rotation_euler = (tilt, 0, 0)          # 绕 three 的 X 轴 = blender 的 X
    P.append(plate)
    # 数显面（深色玻璃，读数由前端 textPlate 贴上去，模型里不烘文字）
    face = bx("display_face", (0.036, 0.0012, 0.013),
              (0, disp_y + n_y * 0.0036, disp_z + n_z * 0.0036), black, bevel=0.0004)
    face.rotation_mode = "XYZ"
    face.rotation_euler = (tilt, 0, 0)
    P.append(face)

    return root, P


def main():
    argv = sys.argv
    rest = argv[argv.index("--") + 1:] if "--" in argv else []

    def arg(name, default):
        return rest[rest.index(name) + 1] if name in rest else default

    post_top = float(arg("--post", TALL["post_top"]))
    gap = float(arg("--gap", TALL["gap"]))
    base_d = float(arg("--base-d", TALL["base_d"]))
    out = arg("--out", "public/models/photogate.glb")
    out = os.path.abspath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)

    root, P = build(post_top, gap, base_d)
    attach(root, P)
    export_glb(out, root)
    print("=== BUILD RESULT ===")
    print(json.dumps({
        "file": out,
        "post_top": post_top,
        "gap": gap,
        "axis_y": round(post_top - 0.024 - 0.044, 4),
        "size_kb": round(os.path.getsize(out) / 1024, 1),
        "parts": len([o for o in root.children_recursive if o.type == "MESH"]),
        "tris": tri_count(root),
        "bounds": scene_bounds(root),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
