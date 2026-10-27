"""
build_force_board.py —— L3 力的合成：方木板 + 白纸 + 图钉、弹簧测力计（两个 GLB）

用法：blender.exe -b -P blender/build_force_board.py -- --outdir public/models

1) force_board.glb  实验图板：480×400×18 三合板 + 330×240 白纸 + 5 枚图钉
                    （4 枚压纸角，1 枚压橡皮条固定端 x=-140 mm）。
                    根节点 = 木板底面中心，板顶 y=+18 mm，纸面顶 y=+18.6 mm。
2) spring_scale.glb 教学弹簧测力计（J2104 型 0~5 N、分度值 0.1 N）：
                    半透明外壳 + 内部拉伸弹簧 + Ø3.2 拉杆 + 红色游标指针
                    + 顶端 Ø18 提环 + 底端 Ø16 挂钩环。根节点 = 外壳几何中心，长轴沿 X。
                    **挂钩在 -X 端、提环在 +X 端**，与场景"绳接挂钩"的约定一致。

刻度板不在这里画：0.1 N 的刻线与数字由前端 canvas 贴图生成（scene.ts），
因为几何刻线在默认机位下只有 1~2 px、且读数必须随示数变化。
但刻度的**基准**在这里定死：0 刻在 x=+60 mm（提环侧），5 N 在 x=-60 mm，每牛 24 mm。
前端按同一组常量对齐指针。
"""

import bpy
import bmesh
import os
import sys
import json
import math

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from lab_common import (  # noqa: E402
    reset_scene, make_root, attach, export_glb, scene_bounds, tri_count,
    box, cyl, torus, mat_pbr,
    mat_steel, mat_paper, mat_paint_white, mat_plastic_red,
    mat_plastic_gray, mat_plastic_black,
)

BOARD_W, BOARD_D, BOARD_T = 0.480, 0.400, 0.018
PAPER_W, PAPER_D = 0.330, 0.240
PAPER_TOP = BOARD_T + 0.0006
RUBBER_PIN_X = -0.140

SCALE_L, SCALE_W, SCALE_H = 0.160, 0.024, 0.015
FACE_ZERO_X = 0.060
FACE_SPAN = 0.120
RING_X = 0.088
HOOK_X = -0.094


def T(p):
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


def helix(name, R, wire, length, turns, z0, mat, per_turn=16, radial=9):
    """沿 -Z 的真螺旋管（Blender 坐标）。弹簧不能用 scale 拉伸——会把线径拉粗。"""
    n = int(turns * per_turn)
    rings = n + 1
    dtheta_R = 2 * math.pi * turns * R
    verts, faces = [], []
    for i in range(rings):
        t = i / n
        th = 2 * math.pi * turns * t
        c, s = math.cos(th), math.sin(th)
        p = (R * c, R * s, z0 - length * t)
        tv = (-s * dtheta_R, c * dtheta_R, -length)
        ux, uy, uz = (s * length, -c * length, dtheta_R)
        ul = math.sqrt(ux * ux + uy * uy + uz * uz)
        ux, uy, uz = ux / ul, uy / ul, uz / ul
        for j in range(radial):
            phi = 2 * math.pi * j / radial
            cp, sp = math.cos(phi), math.sin(phi)
            verts.append((
                p[0] + wire * (cp * c + sp * ux),
                p[1] + wire * (cp * s + sp * uy),
                p[2] + wire * (cp * 0.0 + sp * uz),
            ))
    for i in range(rings - 1):
        for j in range(radial):
            a = i * radial + j
            b = i * radial + (j + 1) % radial
            faces.append((a, b, b + radial, a + radial))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate(clean_customdata=False)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def pin(name, x, z, head_mat, steel):
    """图钉：Ø1.6 针脚扎进木板，Ø9 塑料圆头压在纸面上"""
    parts = [
        cy(f"{name}_needle", 0.0008, 0.007, (x, PAPER_TOP - 0.0035, z), steel, verts=8),
        cy(f"{name}_head", 0.0045, 0.0024, (x, PAPER_TOP + 0.0012, z), head_mat, verts=22),
        cy(f"{name}_cap", 0.0031, 0.0014, (x, PAPER_TOP + 0.0031, z), head_mat, verts=18),
    ]
    return parts


def build_board(outdir):
    reset_scene()
    root = make_root("force_board")
    wood = mat_pbr("plywood", 0xC2A573, 0.0, 0.72)
    steel = mat_steel()
    paper = mat_paper()
    red = mat_plastic_red()
    gray = mat_plastic_gray()

    parts = []
    # 三合板：圆角 3 mm，顶面 +18 mm
    parts.append(bx("board", (BOARD_W, BOARD_T, BOARD_D), (0, BOARD_T / 2, 0), wood, bevel=0.003))
    # 白纸：贴板面，厚 0.6 mm
    parts.append(bx("paper", (PAPER_W, 0.0006, PAPER_D), (0, BOARD_T + 0.0003, 0), paper))
    # 四角压钉（红灰各两支，真图钉就是一盒混色）
    corners = [(-0.155, 0.111), (0.155, 0.111), (-0.155, -0.111), (0.155, -0.111)]
    for i, (x, z) in enumerate(corners):
        parts += pin(f"pin_corner_{i}", x, z, red if i % 2 == 0 else gray, steel)
    # 橡皮条固定钉：压在纸上，橡皮条从这里出发
    parts += pin("pin_anchor", RUBBER_PIN_X, 0.0, red, steel)

    attach(root, parts)
    export_glb(os.path.join(outdir, "force_board.glb"), root)
    print("board tris", tri_count(root))


def build_scale(outdir):
    reset_scene()
    root = make_root("spring_scale")
    steel = mat_steel()
    white = mat_paint_white()
    red = mat_plastic_red()
    gray = mat_plastic_gray()
    black = mat_plastic_black()
    # 半透明外壳：真实 J2104 能看到壳内的拉杆和弹簧，不透明壳会变成一根白条
    shell = mat_pbr("scaleShell", 0xE9EEF2, 0.0, 0.22, 0.35)
    shell.blend_method = 'BLEND'
    shell.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.34

    parts = []
    # 外壳与两端盖
    parts.append(bx("shell", (SCALE_L, SCALE_H, SCALE_W), (0, 0, 0), shell, bevel=0.002))
    parts.append(bx("cap_left", (0.005, SCALE_H, SCALE_W), (-0.0795, 0, 0), gray, bevel=0.0012))
    parts.append(bx("cap_right", (0.005, SCALE_H, SCALE_W), (0.0795, 0, 0), gray, bevel=0.0012))
    # 刻度窗：凸起在外壳顶面，白色底（刻线与数字由前端贴图盖在这块面上）
    parts.append(bx("face", (0.132, 0.0016, 0.014), (0, 0.0083, 0), white))
    # 拉杆：一端接挂钩、另一端顶住内部弹簧
    parts.append(cy("rod", 0.0016, 0.150, (-0.020, 0, 0), steel, axis="X", verts=14))
    # 内部拉簧：8 圈，Ø8，从 +28 mm 下到 -28 mm
    parts.append(helix("inner_spring", 0.0038, 0.00046, 0.056, 8.0, 0.028, steel))
    # 红色游标指针：夹在拉杆上，0 N 时停在 x=+60 mm，满量程滑到 -60 mm
    parts.append(bx("pointer", (0.0016, 0.0014, 0.0105), (FACE_ZERO_X, 0.0094, 0), red))
    # 顶部提环
    parts.append(tn("top_ring", 0.009, 0.0013, (RING_X, 0, 0), steel))
    parts.append(bx("ring_neck", (0.010, 0.004, 0.005), (0.0805, 0, 0), gray, bevel=0.0008))
    # 底部挂钩环（绳套挂在这里）
    parts.append(tn("hook_ring", 0.008, 0.0013, (HOOK_X, 0, 0), steel))
    parts.append(bx("hook_neck", (0.010, 0.004, 0.005), (-0.0805, 0, 0), gray, bevel=0.0008))
    # 量程标识条（黑），压在刻度窗靠挂钩一端——装机后不看也能认出这是测力计
    parts.append(bx("face_mark", (0.006, 0.0004, 0.014), (-0.0685, 0.0092, 0), black))

    attach(root, parts)
    export_glb(os.path.join(outdir, "spring_scale.glb"), root)
    print("scale tris", tri_count(root))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    outdir = "public/models"
    for i, a in enumerate(argv):
        if a == "--outdir" and i + 1 < len(argv):
            outdir = argv[i + 1]
    os.makedirs(outdir, exist_ok=True)
    build_board(outdir)
    build_scale(outdir)


if __name__ == "__main__":
    main()
