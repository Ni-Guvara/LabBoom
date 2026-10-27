"""
build_drop_gate.py —— 自由落体实验用光电门（竖直叉口 + 横杆夹持座，Blender 4.5）

用法：blender.exe -b -P blender/build_drop_gate.py -- --out public/models/drop_gate.glb

和 L1/L4 的 `photogate.glb` 是两种东西，别混：
  · 导轨款：U 形叉口**开口朝上**，挡光片水平穿过，门头靠立杆+横臂悬在导轨上方；
  · 落体款（本件）：两片叉板**左右分开、上下完全敞开**，重锤竖直穿过 46 mm 缝，
    所以结构必须是「后方数显盒 + 左右两片竖向叉板」，落体线（x=0, z=0）上不能有任何实体。

坐标约定（与 src/labs/L7/scene.ts 的 gateUnit() 一致）：
  根节点原点 = **光轴与落体线的交点**（不是底面！），因为前端是把整组
  `position.y = 门高` 直接摆上去的，门在落体过程中不动，原点必须落在被测点上。
  +X 向右、+Y 向上、+Z 朝观察者；横臂朝 −X 伸到立杆（立杆在 x = −0.250）。

关键净空（改这几处必须同步改 scene.ts 的 fallbackGate / DISPLAY）：
  叉板内表面 ±0.023    → 净空 46 mm（容 40 mm 遮光片）
  数显盒前表面 −0.030  → 重锤后缘 −0.015，留 15 mm 余量
  数显窗中心 (0, −0.038, −0.0295)，尺寸 40×14 mm  ← 读数由前端 textPlate 贴，不烘进 glb
  门头上沿 +0.034      → 横臂 y=0.030 从这里绕出去接立杆
"""

import bpy
import os
import sys
import json

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from lab_common import (  # noqa: E402
    reset_scene, make_root, attach, export_glb, scene_bounds, tri_count,
    box, cyl, torus, rod_between, mat_pbr,
    mat_plastic_black, mat_steel, mat_glass, mat_plastic_red, mat_rubber,
)

# ---------- 与 scene.ts 对齐的常量 ----------
# 门头做「紧凑型」：真机门头就是一坨 50 mm 上下的夹口，早先按 100 mm 通高做，
# 在场景里读起来像两片刀片立在一块板前，不像光电门。
X_PRONG = 0.029            # 叉板中心：内表面 ±23 mm → 净空 46 mm（容 40 mm 遮光片）
PRONG_W, PRONG_H, PRONG_D = 0.012, 0.048, 0.030
PRONG_Y, PRONG_Z = 0.002, -0.010
PRONG_CAP_H = 0.008
BACK_Z = -0.035            # 数显盒中心；前表面 −0.030，重锤后缘 −0.015 仍留 15 mm
BACK_W, BACK_H, BACK_D = 0.044, 0.084, 0.010
BACK_Y = -0.008
ROD_X = -0.250             # 立杆（retortStand 局部 rodX=-0.05，整体 x=-0.2）
BAR_Y = 0.030              # 横臂高度：从数显盒上沿绕到立杆
DISPLAY = (0.0, -0.038, -0.0295)   # 读数面中心（40×14 mm，贴 canvas）
DISPLAY_W, DISPLAY_H = 0.040, 0.014


def T(p):
    """three (x,y,z) → blender (x,-z,y)"""
    return (p[0], -p[2], p[1])


def S(s):
    return (s[0], s[2], s[1])


def bx(name, size, center, m, bevel=0.0, seg=3):
    return box(name, S(size), T(center), m, bevel=bevel, segments=seg)


def cy(name, radius, depth, center, m, axis="Z", verts=24):
    return cyl(name, radius, depth, T(center), m,
               axis={"Y": "Z", "X": "X", "Z": "Y"}[axis], verts=verts)


def tn(name, major, minor, center, m, axis="Z"):
    return torus(name, major, minor, T(center), m,
                 axis={"Y": "Z", "X": "X", "Z": "Y"}[axis], seg=24)


def build():
    reset_scene()
    root = make_root("drop_gate")
    P = []

    black = mat_plastic_black()
    steel = mat_steel()
    glass = mat_glass()
    red = mat_plastic_red()
    rubber = mat_rubber()
    # 这两色 scene.ts 里是给通用塑料色做 override 的，这里单独建，不改 lab_common 的公共表
    gray = mat_pbr("gateGray", 0x555E68, 0.06, 0.46, 0.22)
    bar_steel = mat_pbr("gateSteel", 0x9AA4AD, 0.90, 0.38)

    # ---------------- 数显盒（整块退到落体线后方）----------------
    P.append(bx("back_box", (BACK_W, BACK_H, BACK_D), (0, BACK_Y, BACK_Z), gray, bevel=0.0022))
    # 后盖：比盒体大一圈的深色板，从背面看不会是一块光秃秃的灰塑料
    P.append(bx("back_cover", (BACK_W + 0.006, BACK_H + 0.006, 0.003),
                (0, BACK_Y, BACK_Z - BACK_D / 2 - 0.0015), black, bevel=0.0012))
    # 四角螺钉
    for sx in (-1, 1):
        for sy in (-1, 1):
            nm = f"{'lr'[sx > 0]}{'tb'[sy > 0]}"
            P.append(cy(f"back_screw_{nm}", 0.0022, 0.0016,
                        (sx * 0.0170, BACK_Y + sy * 0.0350, BACK_Z + BACK_D / 2 + 0.0004),
                        steel, verts=14))

    # ---------------- 两片竖向叉板 ----------------
    for sx in (-1, 1):
        nm = "lr"[sx > 0]
        P.append(bx(f"prong_{nm}", (PRONG_W, PRONG_H, PRONG_D),
                    (sx * X_PRONG, PRONG_Y, PRONG_Z), black, bevel=0.0016))
        # 上下端盖：叉板是注塑件，端头有加强帽，也顺手把端面直角包掉
        for sy in (-1, 1):
            P.append(bx(f"prong_cap_{nm}{'tb'[sy > 0]}", (PRONG_W + 0.004, PRONG_CAP_H, PRONG_D + 0.004),
                        (sx * X_PRONG, PRONG_Y + sy * (PRONG_H / 2 + PRONG_CAP_H / 2 - 0.001), PRONG_Z),
                        gray, bevel=0.0014, seg=2))
        # 红外窗：嵌在**内侧**、正对 46 mm 的缝；发射端（左）亮红，接收端（右）暗
        inner = sx * (X_PRONG - PRONG_W / 2)
        P.append(cy(f"ir_ring_{nm}", 0.0046, 0.0022,
                    (inner - sx * 0.0011, PRONG_Y, PRONG_Z), black, axis="X", verts=18))
        P.append(cy(f"ir_lens_{nm}", 0.0034, 0.0012,
                    (inner - sx * 0.0002, PRONG_Y, PRONG_Z), red if sx < 0 else glass, axis="X", verts=16))

    # ---------------- 数显窗 + 指示灯 ----------------
    # 读数面底板：前表面 −0.0305，前端贴的 40×14 读数面在 −0.0295（凸 1 mm 防 z-fighting）
    P.append(bx("display_bezel", (DISPLAY_W + 0.006, DISPLAY_H + 0.006, 0.004),
                (DISPLAY[0], DISPLAY[1], -0.0325), gray, bevel=0.0012))
    P.append(cy("led", 0.0022, 0.0018, (-0.016, 0.020, -0.0296), red, axis="Z", verts=14))

    # ---------------- 右侧锁紧手轮 ----------------
    P.append(cy("head_knob", 0.0055, 0.006, (BACK_W / 2 + 0.008, BACK_Y, BACK_Z), black, axis="X", verts=20))
    P.append(tn("head_knob_knurl", 0.0056, 0.0011, (BACK_W / 2 + 0.0115, BACK_Y, BACK_Z), steel, axis="X"))

    # ---------------- 横臂 → 立杆上的十字夹 ----------------
    bar_len = -ROD_X - 0.021
    P.append(bx("arm_bar", (bar_len, 0.009, 0.011),
                (ROD_X + bar_len / 2, BAR_Y, BACK_Z), bar_steel, bevel=0.0012))
    P.append(bx("arm_collar", (0.016, 0.020, 0.024), (ROD_X + 0.020, BAR_Y, BACK_Z), black, bevel=0.0016, seg=2))
    P.append(bx("rod_clamp", (0.030, 0.028, 0.045), (ROD_X, BAR_Y, -0.020), bar_steel, bevel=0.0022))
    P.append(cy("clamp_knob", 0.006, 0.008, (ROD_X, BAR_Y, 0.004), black, axis="Z", verts=20))
    P.append(tn("clamp_knob_knurl", 0.0062, 0.0012, (ROD_X, BAR_Y, 0.0068), steel, axis="Z"))
    P.append(cy("clamp_screw", 0.0022, 0.026, (ROD_X - 0.018, BAR_Y, -0.020), steel, axis="Y", verts=12))

    # ---------------- 传感器引线：从数显盒背面走到立杆，贴着横臂走 ----------------
    P.append(rod_between("cable", T((0.012, BAR_Y + 0.008, BACK_Z - 0.006)),
                         T((ROD_X + 0.010, BAR_Y - 0.002, -0.042)), 0.0016, rubber, verts=8))

    attach(root, P)
    return root


def main():
    argv = sys.argv
    rest = argv[argv.index("--") + 1:] if "--" in argv else []

    def arg(name, default):
        return rest[rest.index(name) + 1] if name in rest else default

    out = os.path.abspath(arg("--out", "public/models/drop_gate.glb"))
    os.makedirs(os.path.dirname(out), exist_ok=True)

    root = build()
    export_glb(out, root)
    print("=== BUILD RESULT ===")
    print(json.dumps({
        "file": out,
        "size_kb": round(os.path.getsize(out) / 1024, 1),
        "parts": len([o for o in root.children_recursive if o.type == "MESH"]),
        "tris": tri_count(root),
        "bounds": scene_bounds(root),
        "display_center": DISPLAY,
        "gap_mm": round((X_PRONG - PRONG_W / 2) * 2000, 1),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
