"""
lab_common.py —— LabBoom 器材建模公共库（Blender 4.5 / Python）

约定（与 src/labs/_shared/instruments.ts 一致，务必别改）：
  1 单位 = 1 米；X = 器材长轴，Y = 进深，Z = 向上
  原点必须落在「底面接触中心」——导出的 glb 直接 y=0 就能贴台面
  每件器材一个 Empty 作根，部件是它的子网格，部件名即 partId（供 P11 点击拾取）

材质色值取自 src/engine/materials.ts，改色请同步改那边，否则进场景会有色差。
"""

import bpy
import math
from mathutils import Vector

# ---------- 基础 ----------


def reset_scene() -> None:
    """清空出厂场景（background 模式默认带 Cube/Camera/Light）。"""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def srgb_to_linear(c: float) -> float:
    """Blender 的 Base Color 是线性空间，颜色必须从 sRGB 转过去，否则整体偏亮。"""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(h: int):
    r = ((h >> 16) & 0xFF) / 255.0
    g = ((h >> 8) & 0xFF) / 255.0
    b = (h & 0xFF) / 255.0
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


_MATS = {}


def mat_pbr(name: str, hex_color: int, metallic: float, roughness: float, coat: float = 0.0):
    """建/复用 PBR 材质。同名材质只建一次——glb 里材质数要控住，否则 draw call 爆炸。"""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hex_to_linear(hex_color)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if coat > 0:
        # 工程塑料的清漆层：没有它，黑底座在掠射角会反成一块白板
        if "Coat Weight" in bsdf.inputs:
            bsdf.inputs["Coat Weight"].default_value = coat
        if "Coat Roughness" in bsdf.inputs:
            bsdf.inputs["Coat Roughness"].default_value = 0.25
    _MATS[name] = m
    return m


# 与 materials.ts 逐项对应
def mat_plastic_black():
    return mat_pbr("plasticBlack", 0x2B3038, 0.06, 0.50, 0.15)


def mat_paint_white():
    return mat_pbr("paintWhite", 0xD9DDE1, 0.0, 0.58, 0.25)


def mat_steel():
    return mat_pbr("steel", 0x9B9B99, 0.96, 0.42)


def mat_brass():
    return mat_pbr("brass", 0xC9A227, 0.92, 0.30)


def mat_copper():
    return mat_pbr("copper", 0xB87333, 0.92, 0.33)


def mat_paper():
    return mat_pbr("paper", 0xC6BBA0, 0.0, 0.95)


def mat_rubber():
    return mat_pbr("rubber", 0x1F2328, 0.0, 0.92)


def mat_plastic_red():
    return mat_pbr("plasticRed", 0xD8412F, 0.04, 0.46, 0.40)


def mat_plastic_green():
    return mat_pbr("plasticGreen", 0x1F7A4D, 0.04, 0.46, 0.40)


def mat_plastic_gray():
    return mat_pbr("plasticGray", 0x8B95A1, 0.04, 0.52, 0.30)


def mat_paper_dark():
    # 复写纸：深藏青、几乎不反光（比纯黑更像真货）
    return mat_pbr("copyPaper", 0x1B2430, 0.0, 0.86)


def mat_aluminum():
    # 阳极氧化铝型材（导轨、滑轮盘）
    return mat_pbr("aluminum", 0xA9A9A7, 0.90, 0.56)


def mat_glass():
    return mat_pbr("glass", 0xDFEEFC, 0.0, 0.08)


# ---------- 几何 ----------


def _finish(obj, name: str, mat, smooth: bool):
    obj.name = name
    obj.data.name = name
    obj.data.materials.append(mat)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def _apply_scale(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)


def box(name: str, size, center, mat, bevel: float = 0.0, segments: int = 3):
    """圆角/直角盒体。size=(x,y,z) 全尺寸，center=(x,y,z) 几何中心。"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    o = bpy.context.active_object
    o.scale = size
    _apply_scale(o)
    if bevel > 0:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width = min(bevel, min(size) / 2.5)
        m.segments = segments
        m.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=m.name)
    return _finish(o, name, mat, smooth=False)


def cyl(name: str, radius: float, depth: float, center, mat, axis: str = "Z", verts: int = 32):
    """圆柱。axis 决定轴向：Z 竖直 / X 沿长轴 / Y 沿进深。"""
    rot = (0, 0, 0)
    if axis == "X":
        rot = (0, math.radians(90), 0)
    elif axis == "Y":
        rot = (math.radians(90), 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=center, rotation=rot)
    o = bpy.context.active_object
    _apply_scale(o)
    return _finish(o, name, mat, smooth=True)


def prism(name: str, profile, length: float, x_center: float, mat, bevel: float = 0.0, smooth: bool = False):
    """沿 X 轴挤出闭合截面 —— 铝型材/钢折弯件只能用这个建。

    profile = [(y, z), ...] 闭合多边形（y 为横向、z 为竖直），按逆时针给点。
    与 box 不同，这里不做 scale 变换：截面直接写真实尺寸，避免斜边被子物体继承缩放。
    """
    n = len(profile)
    x0, x1 = x_center - length / 2, x_center + length / 2
    verts = [(x0, y, z) for (y, z) in profile] + [(x1, y, z) for (y, z) in profile]
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=False)
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(o)

    # from_pydata 不保证法线朝外，统一重算一遍，否则 glb 里会看到黑面
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    o.select_set(False)

    if bevel > 0:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = 2
        m.limit_method = "ANGLE"
        m.angle_limit = math.radians(35)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=m.name)
    return _finish(o, name, mat, smooth=smooth)


def box_array(name: str, specs, mat, smooth: bool = False):
    """一组盒体合并成单个网格（刻度线、栅格）。specs = [(size, center), ...]

    90 多个盒体如果各自成部件，partId 索引会被垃圾部件淹没，面数也白白翻倍。
    """
    verts, faces = [], []
    corners = [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
               (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]
    quad = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    for (size, center) in specs:
        hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
        b = len(verts)
        for (ux, uy, uz) in corners:
            verts.append((center[0] + ux * hx, center[1] + uy * hy, center[2] + uz * hz))
        faces.extend(tuple(b + i for i in q) for q in quad)

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=False)
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(o)
    return _finish(o, name, mat, smooth=smooth)


def disc_array(name: str, centers, normal, radius: float, mat, seg: int = 8):
    """一组共面小圆片合并成单个网格 —— 气浮孔在 1.2 m 上有一百来个，必须合并。

    normal 为圆片朝向（朝外）；顶点按 u→v 绕行，保证法线正好等于 normal。
    """
    n = Vector(normal).normalized()
    ref = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))
    u = n.cross(ref).normalized()
    v = n.cross(u).normalized()

    verts, faces = [], []
    for c in centers:
        c = Vector(c)
        base = len(verts)
        verts.append(tuple(c))
        for i in range(seg):
            a = 2 * math.pi * i / seg
            verts.append(tuple(c + u * (radius * math.cos(a)) + v * (radius * math.sin(a))))
        for i in range(seg):
            faces.append((base, base + 1 + i, base + 1 + (i + 1) % seg))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=False)
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(o)
    return _finish(o, name, mat, smooth=False)


def hexnut(name: str, radius: float, depth: float, center, mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=radius, depth=depth, location=center)
    o = bpy.context.active_object
    _apply_scale(o)
    return _finish(o, name, mat, smooth=False)


def torus(name: str, major: float, minor: float, center, mat, axis: str = "Z", seg: int = 40):
    rot = (0, 0, 0)
    if axis == "X":
        rot = (0, math.radians(90), 0)
    elif axis == "Y":
        rot = (math.radians(90), 0, 0)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor, major_segments=seg, minor_segments=10,
        location=center, rotation=rot,
    )
    o = bpy.context.active_object
    return _finish(o, name, mat, smooth=True)


def rod_between(name: str, a, b, radius: float, mat, verts: int = 12):
    """两点之间的圆杆（导线、支杆）。"""
    a, b = Vector(a), Vector(b)
    d = b - a
    length = d.length
    mid = (a + b) / 2
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=length, location=mid)
    o = bpy.context.active_object
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = d.to_track_quat("Z", "Y")
    _apply_scale(o)
    return _finish(o, name, mat, smooth=True)


# ---------- 组装与导出 ----------


def make_root(name: str):
    """器材根节点：Empty，位于世界原点（= 底面接触中心）。"""
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.02
    return root


def attach(root, parts):
    """把部件挂到根节点下，并写 partId 自定义属性（导出时会进 glTF extras）。"""
    for p in parts:
        p.parent = root
        p.matrix_parent_inverse = root.matrix_world.inverted()
        p["partId"] = p.name
        p["pickable"] = True
    return root


def scene_bounds(root) -> dict:
    """统计整机包围盒（米），用于验收：尺寸必须与 instruments.ts 的规格对得上。"""
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in root.children_recursive:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    return {"min": tuple(round(v, 4) for v in lo), "max": tuple(round(v, 4) for v in hi),
            "size_mm": tuple(round((hi[i] - lo[i]) * 1000, 1) for i in range(3))}


def tri_count(root) -> int:
    n = 0
    for o in root.children_recursive:
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            n += len(o.data.loop_triangles)
    return n


def export_glb(path: str, root) -> None:
    """导出 GLB：+Y up（three 的坐标系），应用修改器，带 extras。"""
    for o in bpy.context.scene.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        use_selection=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=True,
    )
