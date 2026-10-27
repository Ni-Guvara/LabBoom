"""
build_spring_set.py —— L2 弹簧 + 砝码盘 + 片状砝码（三个 GLB）

用法：blender.exe -b -P blender/build_spring_set.py -- --outdir public/models

1) spring.glb        拉伸弹簧：外径 Ø18、线径 Ø0.9、自由长 120 mm（上钩环中心到下钩环中心）、
                     22 圈有效圈，两端各一个闭合吊环（内径 Ø6），环面竖直（轴沿 three Z）。
                     根节点 = **上钩环中心**，螺旋向下到 y=-0.120。
                     前端按胡克定律把长度改成 L0+Δx，钩环位置要跟着走。
2) weight_tray.glb   砝码盘：Ø64 铝盘 + 上翻盘沿 + 三根 Ø0.6 吊丝 + Ø16 水平顶环
                     + 指向米尺的红色指针。根节点 = 盘底面中心，顶环中心 y=+0.040。
3) weight_plate.glb  片状砝码：Ø32×8 镀铬钢片 + Ø10 滚花提钮，50 g。
                     根节点 = 底面中心，提钮顶 y=+0.0145；可原地叠放，步进 8 mm。
"""

import bpy  # noqa: F401
import bmesh
import os
import sys
import json
import math

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from lab_common import (  # noqa: E402
    reset_scene, make_root, attach, export_glb, scene_bounds, tri_count,
    box, cyl, torus, rod_between, mat_pbr,
    mat_steel, mat_aluminum, mat_plastic_red,
)

SPRING_R = 0.00840          # 螺旋中心线半径（外径 18 - 线径 1.2）
SPRING_WIRE = 0.00060       # 线径 1.2 的半径
SPRING_LEN = 0.120          # 自由长：上钩环中心 → 下钩环中心
COIL_TURNS = 22
COIL_TOP, COIL_LEN = -0.010, 0.100

# 顶环高度 = 吊丝长。必须高过「满载荷砝码摞」：片码 Ø32×8 叠 6 片座面到提钮顶
# = 2 + 5×8 + 12 = 54 mm，再加上钩环外径 7.2 mm 的让位，40 mm 会被整摞穿过去。
TRAY_RING_Y = 0.062
PLATE_H = 0.008


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


def rod(name, a, b, radius, mat):
    return rod_between(name, T(a), T(b), radius, mat)


def helix(name, R, wire, length, turns, z0, mat, per_turn=16, radial=9):
    """沿 -Z 的真螺旋管（Blender 坐标），回家给 attach 用。"""
    n = int(turns * per_turn)
    rings = n + 1
    dtheta_R = 2 * math.pi * turns * R
    verts, faces = [], []
    for i in range(rings):
        t = i / n
        th = 2 * math.pi * turns * t
        c, s = math.cos(th), math.sin(th)
        p = (R * c, R * s, z0 - length * t)
        # 切向（未归一化）与径向 r 构成截面基
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


def build_spring(path):
    reset_scene()
    root = make_root("spring")
    steel = mat_steel()
    P = []
    # 两端闭合吊环：主线半径 3.45、线 0.45 → 内径 Ø6、外径 Ø7.8，环面竖直（轴沿 three Z）
    P.append(tn("hook_top", 0.00360, SPRING_WIRE, (0, 0, 0), steel, axis="Z", seg=28))
    P.append(tn("hook_bottom", 0.00360, SPRING_WIRE, (0, -SPRING_LEN, 0), steel, axis="Z", seg=28))
    # 吊环与有效圈之间的过渡直丝
    P.append(rod("lead_top", (0, 0, -0.0042), (SPRING_R, 0, COIL_TOP), SPRING_WIRE, steel))
    P.append(rod("lead_bottom", (SPRING_R, 0, COIL_TOP - COIL_LEN),
                 (0, 0, -SPRING_LEN + 0.0042), SPRING_WIRE, steel))
    P.append(helix("coil", SPRING_R, SPRING_WIRE, COIL_LEN, COIL_TURNS, COIL_TOP, steel))
    attach(root, P)
    export_glb(path, root)
    return root


def build_tray(path):
    reset_scene()
    root = make_root("weight_tray")
    alu = mat_aluminum()
    steel = mat_steel()
    red = mat_plastic_red()
    P = []
    P.append(cy("tray_plate", 0.032, 0.002, (0, 0.001, 0), alu, verts=40))
    P.append(tn("tray_rim", 0.0312, 0.0025, (0, 0.006, 0), alu, seg=40))
    # 中心吊杆：真实的钩码盘就是「浅盘 + 中心杆 + 顶端吊环」，片码中心孔套在杆上。
    # 早先用三根吊丝从盘沿汇到中心，无论顶环多高都必然穿过整摞片码——几何上无解。
    post_h = TRAY_RING_Y - 0.001
    P.append(cy("tray_post", 0.002, post_h, (0, 0.001 + post_h / 2, 0), steel, verts=16))
    P.append(tn("tray_ring", 0.008, 0.0012, (0, TRAY_RING_Y, 0), steel, axis="Y", seg=28))
    # 红色指针：从盘沿向 -X 伸到米尺刻度区正前方（尺面在 z=-0.0392，指针让开 4.7 mm 不碰尺）
    P.append(bx("pointer", (0.020, 0.0012, 0.004), (-0.049, 0.008, 0.0055), red, bevel=0.0003))
    attach(root, P)
    export_glb(path, root)
    return root


def annulus(name, r_out, r_in, y0, y1, mat, seg=40, smooth=True):
    """空心圆片（外壁 + 内壁 + 顶环 + 底环），用于砝码底部凹槽。Blender 坐标。"""
    verts, faces = [], []
    for y in (y0, y1):
        for r in (r_out, r_in):
            for j in range(seg):
                a = 2 * math.pi * j / seg
                verts.append((r * math.cos(a), r * math.sin(a), y))
    # 顶点索引：0=外底 1=内底 2=外顶 3=内顶，各 seg 个
    ob_idx = 0
    ib_idx = seg
    ot_idx = 2 * seg
    it_idx = 3 * seg
    for j in range(seg):
        k = (j + 1) % seg
        faces.append((ob_idx + j, ob_idx + k, ot_idx + k, ot_idx + j))      # 外壁
        faces.append((ib_idx + k, ib_idx + j, it_idx + j, it_idx + k))      # 内壁
        faces.append((ot_idx + j, ot_idx + k, it_idx + k, it_idx + j))      # 顶环
        faces.append((ib_idx + j, ib_idx + k, ob_idx + k, ob_idx + j))      # 底环
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate(clean_customdata=False)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for poly in me.polygons:
            poly.use_smooth = True
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def build_plate(path):
    reset_scene()
    root = make_root("weight_plate")
    chrome = mat_pbr("chrome", 0xC9CDD2, 0.98, 0.18, coat=0.4)
    P = []
    # 片体：Ø32×8，中心 Ø6 通孔（套在盘的中心吊杆 Ø4 上叠放，与真片码一致）
    P.append(annulus("plate", 0.016, 0.003, 0.0, PLATE_H, chrome, seg=40))
    attach(root, P)
    export_glb(path, root)
    return root


def main():
    argv = sys.argv
    outdir = "public/models"
    if "--" in argv:
        rest = argv[argv.index("--") + 1:]
        if "--outdir" in rest:
            outdir = rest[rest.index("--outdir") + 1]
    outdir = os.path.abspath(outdir)
    os.makedirs(outdir, exist_ok=True)
    report = []
    for name, fn in (("spring", build_spring), ("weight_tray", build_tray), ("weight_plate", build_plate)):
        path = os.path.join(outdir, f"{name}.glb")
        root = fn(path)
        report.append({
            "file": path,
            "size_kb": round(os.path.getsize(path) / 1024, 1),
            "parts": len([o for o in root.children_recursive if o.type == "MESH"]),
            "tris": tri_count(root),
            "bounds": scene_bounds(root),
        })
    print("=== BUILD RESULT ===")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
