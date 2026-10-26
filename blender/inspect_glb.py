"""
inspect_glb.py —— 不依赖任何三方库，直接解析 .glb 校验产物是否合规

用法：python blender/inspect_glb.py public/models/ticker_timer.glb

检查项：
  1 节点命名与层级（部件名 = partId，加载后用于点击拾取）
  2 材质数量与名称（必须复用，不能每个部件一份）
  3 三角面总数与单件上限
  4 包围盒 / 底面是否落在 y=0（three 的 Y-up 下就是 glTF 的 y）
  5 extras 是否带 partId
"""

import json
import struct
import sys

LIMIT_TRIS = 8000


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, version, length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67, "不是合法 glb"
    off = 12
    js, bin_chunk = None, None
    while off < length:
        clen, ctype = struct.unpack_from("<II", data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode("utf-8"))
        elif ctype == 0x004E4942:
            bin_chunk = chunk
        off += 8 + clen + (-clen % 4)
    return js, bin_chunk, len(data)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "public/models/ticker_timer.glb"
    g, blob, total = read_glb(path)
    nodes = g.get("nodes", [])
    meshes = g.get("meshes", [])
    mats = g.get("materials", [])
    accs = g.get("accessors", [])

    # ---- 三角面统计 ----
    tris = 0
    per_mesh = {}
    for mi, m in enumerate(meshes):
        t = 0
        for p in m.get("primitives", []):
            if "indices" in p:
                t += accs[p["indices"]]["count"] // 3
        per_mesh[m.get("name", f"mesh{mi}")] = t
        tris += t

    # ---- 节点树 ----
    children_of = {i: n.get("children", []) for i, n in enumerate(nodes)}
    has_parent = {c for cs in children_of.values() for c in cs}
    roots = [i for i in range(len(nodes)) if i not in has_parent]

    def walk(i, depth):
        n = nodes[i]
        ex = n.get("extras", {})
        mark = " ←part" if ex.get("partId") else ""
        mesh = f"  [{per_mesh.get(meshes[n['mesh']]['name'], 0)} tris]" if "mesh" in n else ""
        print("  " * depth + f"- {n.get('name','?')}{mesh}{mark}")
        for c in children_of[i]:
            walk(c, depth + 1)

    print(f"文件 {path}  {total/1024:.1f} KB")
    print(f"节点 {len(nodes)} / 网格 {len(meshes)} / 材质 {len(mats)} / 三角面 {tris}")
    print("节点树：")
    for r in roots:
        walk(r, 1)

    # ---- 世界包围盒：必须把节点变换乘进去，否则每个部件都在自己的局部原点附近 ----
    lo = [1e9] * 3
    hi = [-1e9] * 3

    def node_matrix(n):
        if "matrix" in n:
            m = n["matrix"]  # glTF 列主序
            return [[m[0], m[4], m[8], m[12]],
                    [m[1], m[5], m[9], m[13]],
                    [m[2], m[6], m[10], m[14]],
                    [m[3], m[7], m[11], m[15]]]
        t = n.get("translation", [0, 0, 0])
        r = n.get("rotation", [0, 0, 0, 1])
        s = n.get("scale", [1, 1, 1])
        x, y, z, w = r
        rm = [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0],
            [0, 0, 0, 1],
        ]
        for i in range(3):
            for j in range(3):
                rm[i][j] *= s[j]
            rm[i][3] = t[i]
        return rm

    def mmul(a, b):
        return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]

    def apply(m, v):
        return [sum(m[i][k] * (v[k] if k < 3 else 1.0) for k in range(4)) for i in range(3)]

    def walk_bounds(i, parent_m):
        n = nodes[i]
        m = mmul(parent_m, node_matrix(n))
        if "mesh" in n:
            for p in meshes[n["mesh"]].get("primitives", []):
                a = accs[p["attributes"]["POSITION"]]
                amn, amx = a["min"], a["max"]
                for cx in (amn[0], amx[0]):
                    for cy in (amn[1], amx[1]):
                        for cz in (amn[2], amx[2]):
                            w = apply(m, [cx, cy, cz])
                            for k in range(3):
                                lo[k] = min(lo[k], w[k])
                                hi[k] = max(hi[k], w[k])
        for c in children_of[i]:
            walk_bounds(c, m)

    ident = [[1 if i == j else 0 for j in range(4)] for i in range(4)]
    for r in roots:
        walk_bounds(r, ident)

    print(f"世界包围盒 min={[round(v,4) for v in lo]} max={[round(v,4) for v in hi]}")
    print(f"尺寸(mm) {[round((hi[i]-lo[i])*1000,1) for i in range(3)]}")

    # ---- 断言 ----
    problems = []
    if not (abs(lo[1]) < 1e-4):
        problems.append(f"底面没落在 y=0，实际 y_min={lo[1]:.4f}（拖到台面会浮空或陷进去）")
    if len(mats) > 12:
        problems.append(f"材质 {len(mats)} 份，超过 12 —— 说明没复用，draw call 会偏高")
    if tris > LIMIT_TRIS:
        problems.append(f"三角面 {tris} 超预算 {LIMIT_TRIS}")
    unnamed = [n.get("name") for n in nodes if n.get("name", "").startswith(("Cube", "Cylinder", "Torus", "Bevel"))]
    if unnamed:
        problems.append(f"存在未命名的默认物体：{unnamed}")
    no_extra = [n.get("name") for n in nodes if "mesh" in n and not n.get("extras", {}).get("partId")]
    if no_extra:
        problems.append(f"这些部件缺 partId extras：{no_extra}")

    print("\n=== 校验结果 ===")
    if problems:
        for p in problems:
            print("  ✗", p)
        sys.exit(1)
    print("  ✓ 全部通过：命名齐全、底面 y=0、材质复用、面数在预算内")


if __name__ == "__main__":
    main()
