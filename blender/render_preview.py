"""
render_preview.py —— 离屏渲染器材预览图（不开界面，CI 里也能跑）

用法：
  blender.exe -b -P blender/render_preview.py -- --glb public/models/ticker_timer.glb --out blender/preview/ticker_timer.png

用途：模型改完先看一眼几何对不对，再往场景里塞。光近似项目里的影棚三点光，
但渲染结果只作为"造型检查"，不是最终观感（最终观感由 three 的 studioEnvironment 决定）。
"""

import bpy
import sys
import os
import math
from mathutils import Vector


def arg(name, default=None):
    if "--" in sys.argv:
        rest = sys.argv[sys.argv.index("--") + 1:]
        if name in rest:
            return rest[rest.index(name) + 1]
    return default


def main():
    glb = os.path.abspath(arg("--glb", "public/models/ticker_timer.glb"))
    out = os.path.abspath(arg("--out", "blender/preview/preview.png"))
    view = arg("--view", "iso")          # iso 整体透视 / section 端面正交（看截面）
    ortho = float(arg("--ortho", "0.26"))
    hide = arg("--hide", "")             # 逗号分隔的部件名前缀，端面视角挡住截面时用
    os.makedirs(os.path.dirname(out), exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)

    # 额外导入的器材（验证装配关系：滑行器骑上导轨这类，必须合起来看才知道配合对不对）
    # 语法：--add "path.glb@x,y,z" ，多个用 | 分隔
    for spec in (arg("--add", "") or "").split("|"):
        spec = spec.strip()
        if not spec:
            continue
        path, _, loc = spec.rpartition("@")
        before = {o.name for o in bpy.context.scene.objects}
        bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
        added = [o for o in bpy.context.scene.objects if o.name not in before]
        roots = [o for o in added if o.parent is None]
        for o in roots:
            o.location = tuple(float(v) for v in loc.split(","))
        print(f"ADD {path} -> {[(o.name, tuple(round(v, 3) for v in o.location)) for o in roots]}")

    # 求包围盒，自动取景
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    center = (lo + hi) / 2
    size = (hi - lo).length

    # 台面（接住阴影）
    bpy.ops.mesh.primitive_plane_add(size=size * 4, location=(0, 0, lo.z - 0.0005))
    bench = bpy.context.active_object
    m = bpy.data.materials.new("bench")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.035, 0.04, 0.048, 1)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.72
    bench.data.materials.append(m)

    # 相机：整体透视用左前方俯视；section 用正交侧视（专看型材截面，
    # 判断三角导轨、倒 V 槽这类结构，俯视角根本看不出来）
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    if view == "section":
        # 沿 -X 方向看端面：这是唯一能看出型材截面的视角。
        # 侧视只会把截面压成一条高度带，看不出三角/倒 V。
        cam_data.type = "ORTHO"
        cam_data.ortho_scale = ortho
        cam.location = Vector((hi.x + 1.0, center.y, center.z))
        cam.rotation_euler = Vector((-1, 0, 0)).to_track_quat("-Z", "Y").to_euler()
        d = ortho * 1.4
    else:
        cam_data.lens = 60
        d = size * 0.95
        cam.location = center + Vector((d * 0.55, -d * 0.85, d * 0.62))
        cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam

    # 隐藏挡住截面的部件（缓冲挡板、进气嘴之类）
    if hide:
        prefixes = tuple(s.strip() for s in hide.split(",") if s.strip())
        for o in bpy.context.scene.objects:
            if o.type == "MESH" and o.name.startswith(prefixes):
                o.hide_render = True

    # 三点光（功率按包围盒对角线折算：面积光的辐射随距离平方衰减，
    # 固定瓦数在 0.15 m 的小件上会直接过曝成白片）
    def area(name, loc, energy, size_, color=(1, 1, 1)):
        l = bpy.data.lights.new(name, "AREA")
        l.energy = energy
        l.size = size_
        l.color = color
        o = bpy.data.objects.new(name, l)
        o.location = loc
        bpy.context.scene.collection.objects.link(o)
        o.rotation_euler = (center - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        return o

    area("key", center + Vector((d * 0.9, -d * 0.7, d * 1.1)), 70 * size, size * 0.9)
    area("fill", center + Vector((-d * 1.0, -d * 0.5, d * 0.5)), 20 * size, size * 1.2, (0.85, 0.9, 1.0))
    area("rim", center + Vector((-d * 0.3, d * 1.0, d * 0.7)), 32 * size, size * 0.7, (0.8, 0.9, 1.0))

    # 背景
    world = bpy.data.worlds.new("w")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.025, 0.032, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.35

    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x = 1000
    sc.render.resolution_y = 750
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Punchy"
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print("=== RENDER OK ===", out)


if __name__ == "__main__":
    main()
