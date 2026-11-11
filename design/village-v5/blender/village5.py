"""Agent Village, detailed RPG village. Patches the v4 village (jrpg.py) with:

- stylized PBR materials with procedural detail (brick, stone, wood grain, roof tiles);
- detailed houses: stone footings, timber frames with braces, multi-pane windows with
  shutters and flower boxes, plank doors with iron hinges, tile rows on the roof;
- a living ground: tens of thousands of instanced grass tufts and flowers (geometry nodes)
  that keep off paths, yards and buildings;
- fuller trees;
- one generated villager per agent (characters.py).
Import this module before using jrpg: it rewires jrpg's functions in place.
"""
import math
import random

import bpy
from mathutils import Vector

import av
import characters as C
import jrpg as J
from av import G, lin

# --------------------------------------------------------------------------- materials


def _principled(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree.nodes, m.node_tree.links, m.node_tree.nodes["Principled BSDF"]


def brick(name, c1, c2, mortar, scale=4.0, bump=0.35, rough=0.85, row=0.5, width=0.5, floor=False):
    """Stone or brick wall: per-brick colour variation, recessed mortar."""
    if name in J._T:
        return J._T[name]
    m, N, L, b = _principled(name)
    tc = N.new("ShaderNodeTexCoord")
    mp = N.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (scale, scale, scale)
    L.new(tc.outputs["Object"], mp.inputs["Vector"])
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(mp.outputs[0], sep.inputs[0])
    add = N.new("ShaderNodeMath")
    add.operation = "ADD"
    L.new(sep.outputs["X"], add.inputs[0])
    L.new(sep.outputs["Y"], add.inputs[1])
    cmb = N.new("ShaderNodeCombineXYZ")  # wrap the pattern round corners: u = x + y, v = z
    L.new(add.outputs[0], cmb.inputs["X"])
    L.new(sep.outputs["Z"], cmb.inputs["Y"])
    bk = N.new("ShaderNodeTexBrick")
    bk.inputs["Color1"].default_value = lin(c1)
    bk.inputs["Color2"].default_value = lin(c2)
    bk.inputs["Mortar"].default_value = lin(mortar)
    bk.inputs["Scale"].default_value = 1.0
    bk.inputs["Mortar Size"].default_value = 0.025
    bk.inputs["Brick Width"].default_value = width
    bk.inputs["Row Height"].default_value = row
    bk.offset = 0.5
    L.new(mp.outputs[0] if floor else cmb.outputs[0], bk.inputs["Vector"])  # floors use x, y; walls wrap x + y round corners
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 30.0
    L.new(mp.outputs[0], nz.inputs["Vector"])
    mix = N.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 0.25
    L.new(bk.outputs["Color"], mix.inputs["A"])
    L.new(nz.outputs["Color"], mix.inputs["B"])
    L.new(mix.outputs["Result"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    bm = N.new("ShaderNodeBump")
    bm.inputs["Strength"].default_value = bump
    inv = N.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    L.new(bk.outputs["Fac"], inv.inputs[1])
    L.new(inv.outputs[0], bm.inputs["Height"])
    L.new(bm.outputs["Normal"], b.inputs["Normal"])
    J._T[name] = m
    return m


def painted(name, hexcol, rough=0.8, var=0.06, nscale=6.0, bump=0.05):
    if name in J._T:
        return J._T[name]
    m = av.pbr(name, hexcol, rough, var=var, nscale=nscale, bump=bump)
    J._T[name] = m
    return m


def woodgrain(name, a, b, rough=0.7):
    if name in J._T:
        return J._T[name]
    m = av.wood(name, a, b, scale=4.0, rough=rough, coat=0.0)
    J._T[name] = m
    return m


def glass_pane(name="pane"):
    if name in J._T:
        return J._T[name]
    m, N, L, b = _principled(name)
    b.inputs["Base Color"].default_value = lin("#2B3A55")
    b.inputs["Roughness"].default_value = 0.05
    b.inputs["Coat Weight"].default_value = 0.8
    b.inputs["Emission Color"].default_value = lin("#FFD9A0")
    b.inputs["Emission Strength"].default_value = 0.35
    J._T[name] = m
    return m


def grass_ground(name="meadow5"):
    """Meadow: large soft patches of three greens plus a hint of dry grass."""
    if name in J._T:
        return J._T[name]
    m, N, L, b = _principled(name)
    tc = N.new("ShaderNodeTexCoord")
    n1 = N.new("ShaderNodeTexNoise")
    n1.inputs["Scale"].default_value = 0.35
    n1.inputs["Detail"].default_value = 8
    L.new(tc.outputs["Object"], n1.inputs["Vector"])
    rp = N.new("ShaderNodeValToRGB")
    els = rp.color_ramp.elements
    els[0].color = lin("#4F8A35")
    els[0].position = 0.35
    els[1].color = lin("#7FAF4A")
    els[1].position = 0.62
    e = els.new(0.8)
    e.color = lin("#A3A65A")
    L.new(n1.outputs["Fac"], rp.inputs["Fac"])
    L.new(rp.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.9
    J._T[name] = m
    return m


def blade_mat(name="blade"):
    if name in J._T:
        return J._T[name]
    m, N, L, b = _principled(name)
    tc = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(tc.outputs["Generated"], sep.inputs[0])
    rp = N.new("ShaderNodeValToRGB")
    rp.color_ramp.elements[0].color = lin("#3E7A2C")
    rp.color_ramp.elements[1].color = lin("#9CCB5A")
    L.new(sep.outputs["Z"], rp.inputs["Fac"])
    rv = N.new("ShaderNodeObjectInfo")
    hue = N.new("ShaderNodeHueSaturation")
    L.new(rp.outputs["Color"], hue.inputs["Color"])
    mth = N.new("ShaderNodeMapRange")
    mth.inputs["To Min"].default_value = 0.47
    mth.inputs["To Max"].default_value = 0.53
    L.new(rv.outputs["Random"], mth.inputs["Value"])
    L.new(mth.outputs["Result"], hue.inputs["Hue"])
    L.new(hue.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.6
    b.inputs["Subsurface Weight"].default_value = 0.15
    J._T[name] = m
    return m


def palette():
    """Detailed palette. Keeps jrpg's names so the layout code is unchanged."""
    P = _BASE_PALETTE()  # base toon materials (kept for signs and small props)
    P.update(dict(
        grass=grass_ground(),
        path=painted("path5", "#C9A673", 0.95, var=0.12, nscale=4.0, bump=0.15),
        cobble=brick("cobble5", "#BDB6A8", "#A69F91", "#6E685E", scale=3.2, bump=0.5, row=0.3, width=0.36, floor=True),
        earth=painted("earth5", "#7A4E33", 0.95, var=0.1, nscale=10, bump=0.2),
        water=J.toon("water5", "#3F8EC9", spec=0.0),
        wall_plaster=painted("plaster5", "#EFE3C8", 0.92, var=0.05, nscale=3.0, bump=0.08),
        wall_stone=brick("stone5", "#C3BBAA", "#AFA693", "#7F786C", scale=3.0, bump=0.45, row=0.38, width=0.6),
        wall_wood=woodgrain("planks5", "#9C5C34", "#B5713F"),
        timber=woodgrain("timber5", "#5E3A22", "#73472A"),
        rock=brick("footing5", "#8F8A80", "#7C776D", "#55514A", scale=2.6, bump=0.6, row=0.45, width=0.7),
        door=woodgrain("door5", "#6E4024", "#83502E"),
        wood=woodgrain("wood5", "#94603A", "#A8714A"),
        wood_lt=woodgrain("woodlt5", "#C69660", "#D6A874"),
        trunk=woodgrain("trunk5", "#6A4529", "#7C5232"),
        iron=painted("iron5", "#3C3F46", 0.45, var=0.04, nscale=40),
        window=glass_pane(),
        leaf=painted("leaf5", "#3E8A3A", 0.7, var=0.12, nscale=8, bump=0.3),
        leaf_lt=painted("leaflt5", "#5DA548", 0.7, var=0.12, nscale=8, bump=0.3),
        leaf_dk=painted("leafdk5", "#2F6E30", 0.7, var=0.12, nscale=8, bump=0.3),
    ))
    for k, hexcol in (("roof_blue", "#4A72C4"), ("roof_red", "#C2513A"), ("roof_green", "#3C8C63"), ("roof_purple", "#7D5CB8"), ("roof_orange", "#D6823A")):
        P[k] = painted(k + "5", hexcol, 0.7, var=0.07, nscale=12, bump=0.12)
        P[k + "_b"] = painted(k + "5b", _shade(hexcol, 0.88), 0.7, var=0.07, nscale=12, bump=0.12)
    J.PAL.update(P)
    return P


def _shade(hexcol, k):
    h = hexcol.lstrip("#")
    c = [min(255, int(int(h[i:i + 2], 16) * k)) for i in (0, 2, 4)]
    return "#%02X%02X%02X" % tuple(c)


# --------------------------------------------------------------------------- detailed house


def window(g, name, loc, rot, w=0.7, h=0.8, box=True, seed=0):
    rnd = random.Random(seed)
    P = J.PAL
    win = g.sub(name, loc, rot)
    win.box("glass", (w, 0.04, h), (0, 0, 0), P["window"], 0)
    for x in (-w / 2, w / 2):
        win.box(f"jamb{x:.2f}", (0.07, 0.1, h + 0.1), (x, 0.02, -0.05), P["timber"], 0.01)
    win.box("head", (w + 0.2, 0.12, 0.1), (0, 0.03, h), P["timber"], 0.015)
    win.box("sill", (w + 0.24, 0.2, 0.06), (0, 0.07, -0.06), P["timber"], 0.015)
    win.box("mull", (0.035, 0.06, h), (0, 0.03, 0), P["timber"], 0)
    win.box("tran", (w, 0.06, 0.035), (0, 0.03, h * 0.5), P["timber"], 0)
    for s in (-1, 1):  # shutters, slightly open
        sh = win.sub(f"shutter{s}", (s * (w / 2 + 0.04), 0.06, 0), s * -18)
        for i in range(3):
            sh.box(f"board{i}", (w / 2 / 3 - 0.008, 0.04, h), (s * (w / 12 + i * w / 6), 0, 0), P["wood"], 0.008)
        sh.box("brace", (w / 2, 0.045, 0.05), (s * w / 4, 0.002, h * 0.5), P["wood"], 0.006)
    if box:
        win.box("planter", (w + 0.1, 0.22, 0.16), (0, 0.17, -0.24), P["wood"], 0.015)
        for i in range(7):
            col = P[rnd.choice(["flower_r", "flower_y", "flower_w", "flower_r"])]
            win.sph(f"leafb{i}", 0.06, (-w / 2 + 0.05 + i * w / 6.5, 0.18, -0.06), P["leaf_lt"], seg=8)
            win.sph(f"fl{i}", 0.035, (-w / 2 + 0.08 + i * w / 6.5, 0.2 + rnd.uniform(-0.03, 0.03), -0.02), col, seg=6)
    return win


def door(g, name, loc, rot):
    P = J.PAL
    d = g.sub(name, loc, rot)
    for i in range(5):
        d.box(f"plank{i}", (0.165, 0.08, 1.45), (-0.33 + i * 0.165, 0, 0), P["door"], 0.008)
    for z in (0.25, 1.15):
        d.box(f"hinge{z}", (0.62, 0.09, 0.05), (-0.04, 0.008, z), P["iron"], 0.006)
    d.cyl("ring", 0.045, 0.012, (0.26, 0.05, 0.75), P["iron"], 14, rot=(90, 0, 0))
    d.box("frame", (0.98, 0.06, 1.58), (0, -0.015, -0.02), P["timber"], 0.015)
    d.box("step", (1.2, 0.5, 0.14), (0, 0.25, -0.24), P["rock"], 0.03)
    lamp = d.sub("lamp", (0.62, 0.12, 1.25))
    lamp.box("arm", (0.04, 0.16, 0.04), (0, 0.06, 0.2), P["iron"], 0)
    lamp.box("body", (0.14, 0.14, 0.2), (0, 0.15, 0.0), P["iron"], 0.01)
    lamp.box("glow", (0.11, 0.11, 0.15), (0, 0.15, 0.02), av.emit("lamp5", "#FFD38A", 2.5), 0)
    return d


def tiled_roof(g, w, d, rh, z0, roof, over=0.3, rows=9):
    """Two slopes of overlapping tile courses, alternating shade, with a ridge cap."""
    P = J.PAL
    L = math.hypot(d / 2 + over, rh)
    ang = math.atan2(rh, d / 2 + over)
    for s in (-1, 1):
        for i in range(rows):
            t = (i + 0.5) / rows
            yy = s * (d / 2 + over) * (1 - t)
            zz = z0 + rh * t
            mat = P[roof if i % 2 else roof + "_b"]
            o = g.box(f"tiles{s}_{i}", (w + 2 * over, L / rows * 1.25, 0.07), (0, yy, zz), mat, 0.02)
            o.rotation_euler = (-s * ang, 0, 0)  # tangent to the slope: it falls away from the ridge
    g.box("ridge", (w + 2 * over + 0.06, 0.24, 0.16), (0, 0, z0 + rh - 0.02), P["timber"], 0.04)
    for x in (-(w / 2 + over), w / 2 + over):  # barge boards
        for s in (-1, 1):
            o = g.box(f"barge{x:.1f}{s}", (0.08, L + 0.05, 0.12), (x, s * (d / 2 + over) / 2, z0 + rh / 2), P["timber"], 0.01)
            o.rotation_euler = (-s * ang, 0, 0)


def cottage(p, name, loc, rot, w=3.6, d=3.0, wall="wall_plaster", roof="roof_red", floors=1, chimney=True, timbered=True, seed=0):
    rnd = random.Random(seed)
    P = J.PAL
    g = p.sub(name, loc, rot)
    h = 2.1 * floors
    g.box("footing", (w + 0.26, d + 0.26, 0.38), (0, 0, 0), P["rock"], 0.04)
    g.box("walls", (w, d, h), (0, 0, 0.38), P[wall], 0.02)
    z0 = 0.38
    if timbered:
        for sx in (-1, 1):
            for sy in (-1, 1):
                g.box(f"post{sx}{sy}", (0.17, 0.17, h), (sx * (w / 2 - 0.03), sy * (d / 2 - 0.03), z0), P["timber"], 0.015)
        for f in range(floors + 1):
            z = z0 + f * 2.1 - (0.1 if f == floors else 0)
            g.box(f"beamY{f}", (w + 0.06, 0.15, 0.13), (0, d / 2 + 0.015, z), P["timber"], 0.015)
            g.box(f"beamX{f}", (0.15, d + 0.06, 0.13), (w / 2 + 0.015, 0, z), P["timber"], 0.015)
        if wall == "wall_plaster":  # diagonal braces on the plaster panels
            for f in range(floors):
                zb = z0 + f * 2.1
                for sx in (-1, 1):
                    g.bar(f"braceF{f}{sx}", (sx * (w / 2 - 0.08), d / 2 + 0.03, zb + 0.1), (sx * (w / 2 - 0.75), d / 2 + 0.03, zb + 1.0), 0.045, P["timber"], 6)
                    g.bar(f"braceS{f}{sx}", (w / 2 + 0.03, sx * (d / 2 - 0.08), zb + 0.1), (w / 2 + 0.03, sx * (d / 2 - 0.7), zb + 1.0), 0.045, P["timber"], 6)
    dx = rnd.uniform(-0.5, 0.5)
    door(g, "door", (dx, d / 2 + 0.05, z0), 0)
    for f in range(floors):
        z = z0 + f * 2.1 + 0.85
        for i, x in enumerate((-w / 2 + 0.75, w / 2 - 0.75)):
            if f == 0 and abs(x - dx) < 1.0:
                continue
            window(g, f"winF{f}{i}", (x, d / 2 + 0.02, z), 0, seed=seed * 10 + f * 3 + i, box=(f == 0))
        for i, y in enumerate((-d / 4, d / 4)):
            window(g, f"winS{f}{i}", (w / 2 + 0.02, y, z), -90, w=0.62, seed=seed * 20 + f * 3 + i, box=(f == 0 and i == 1))
    rh = min(w, d) * 0.5 + 0.35
    J.gable(g, "gable", w, d, rh, (0, 0, z0 + h), P[wall])
    tiled_roof(g, w, d, rh, z0 + h, roof)
    if chimney:
        cx = w / 2 - 0.75
        g.box("chimney", (0.55, 0.55, rh + 1.0), (cx, -d / 4, z0 + h), P["rock"], 0.03)
        g.box("chimcap", (0.68, 0.68, 0.1), (cx, -d / 4, z0 + h + rh + 1.0), P["iron"], 0.02)
        g.cyl("pot", 0.09, 0.22, (cx + 0.1, -d / 4, z0 + h + rh + 1.1), painted("pot5", "#B0603E", 0.8), 10)
    if wall == "wall_stone":  # ivy creeping up one corner
        for i in range(26):
            a = rnd.uniform(0, 1)
            g.sph(f"ivy{i}", rnd.uniform(0.09, 0.15), (w / 2 + 0.05, -d / 2 + 0.15 + rnd.uniform(0, 0.7), z0 + a * h * 0.9),
                  P[rnd.choice(["leaf", "leaf_dk", "leaf_lt"])], scale=(0.5, 1, 1), seg=8)
    return g


# --------------------------------------------------------------------------- trees


def tree(p, name, loc, s=1.0, seed=0, kind="round"):
    rnd = random.Random(seed)
    P = J.PAL
    g = p.sub(name, loc, rnd.uniform(0, 360))
    g.cyl("trunk", 0.16 * s, 1.1 * s, (0, 0, 0), P["trunk"], 12, r2=0.1 * s)
    for i in range(4):  # root flare
        a = i * 1.57 + rnd.uniform(-0.3, 0.3)
        g.cyl(f"root{i}", 0.07 * s, 0.35 * s, (math.cos(a) * 0.12 * s, math.sin(a) * 0.12 * s, 0), P["trunk"], 8, r2=0.02,
              rot=(math.degrees(math.sin(a)) * 0.9 + 60 * math.sin(a), -60 * math.cos(a), 0))
    if kind == "pine":
        for i in range(5):
            g.cyl(f"tier{i}", (0.95 - i * 0.17) * s, 0.75 * s, (0, 0, (0.7 + i * 0.42) * s), P["leaf_dk" if i % 2 else "leaf"], 12, r2=0.06 * s)
    else:
        for i in range(14):
            a, b = rnd.uniform(0, 6.28), rnd.uniform(0.1, 1.0)
            r = 0.45 * s * b
            c = g.sph(f"c{i}", rnd.uniform(0.32, 0.5) * s, (math.cos(a) * r, math.sin(a) * r, (1.35 + rnd.uniform(-0.2, 0.55)) * s),
                      P[rnd.choice(["leaf", "leaf_lt", "leaf_dk", "leaf"])], seg=12)
            C._smooth(c)
    return g


# --------------------------------------------------------------------------- ground: grass and flowers


def _tuft_object(name, blades=7, seed=0, h=(0.12, 0.24)):
    rnd = random.Random(seed)
    verts, faces = [], []
    for i in range(blades):
        a = rnd.uniform(0, 6.28)
        r = rnd.uniform(0, 0.05)
        bx, by = math.cos(a) * r, math.sin(a) * r
        lean = rnd.uniform(0.02, 0.07)
        la = rnd.uniform(0, 6.28)
        hh = rnd.uniform(*h)
        wdt = rnd.uniform(0.012, 0.02)
        px, py = -math.sin(a) * wdt, math.cos(a) * wdt
        k = len(verts)
        verts += [(bx - px, by - py, 0), (bx + px, by + py, 0), (bx + math.cos(la) * lean, by + math.sin(la) * lean, hh)]
        faces.append((k, k + 1, k + 2))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    o = bpy.data.objects.new(name, me)
    av.coll("fx").objects.link(o)
    o.data.materials.append(blade_mat())
    o.location = (0, 0, -60)
    o["no_ink"] = True
    return o


def _flower_object(name, mat):
    g = G(name, (0, 0, -60), 0, col="fx")
    g.bar("stem", (0, 0, 0), (0, 0, 0.18), 0.006, blade_mat(), 5)
    for i in range(5):
        a = i * 1.256
        g.sph(f"p{i}", 0.022, (math.cos(a) * 0.022, math.sin(a) * 0.022, 0.19), mat, scale=(1, 1, 0.4), seg=6)
    g.sph("heart", 0.014, (0, 0, 0.195), J.PAL["flower_y"], seg=6)
    me = [o for o in g.e.children if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in me:
        o.select_set(True)
        o["no_ink"] = True
    bpy.context.view_layer.objects.active = me[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.parent = None
    o.location = (0, 0, -60)
    o.name = name
    return o


def _scatter(target, inst, density, avoid, gap, seed, scale=(0.8, 1.3)):
    """Geometry nodes: scatter `inst` over `target`, keeping `gap` metres off the `avoid` collection."""
    ng = bpy.data.node_groups.new(f"scatter-{inst.name}", "GeometryNodeTree")
    ng.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N, L = ng.nodes, ng.links
    gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")
    dist = N.new("GeometryNodeDistributePointsOnFaces")
    dist.inputs["Density"].default_value = density
    dist.inputs["Seed"].default_value = seed
    L.new(gi.outputs[0], dist.inputs["Mesh"])
    ci = N.new("GeometryNodeCollectionInfo")
    ci.transform_space = "RELATIVE"
    ci.inputs["Collection"].default_value = avoid
    real = N.new("GeometryNodeRealizeInstances")
    L.new(ci.outputs[0], real.inputs[0])
    prox = N.new("GeometryNodeProximity")
    L.new(real.outputs[0], prox.inputs[0])
    cmp = N.new("FunctionNodeCompare")
    cmp.data_type = "FLOAT"
    cmp.operation = "GREATER_THAN"
    cmp.inputs[1].default_value = gap
    L.new(prox.outputs["Distance"], cmp.inputs[0])
    oi = N.new("GeometryNodeObjectInfo")
    oi.inputs["Object"].default_value = inst
    iop = N.new("GeometryNodeInstanceOnPoints")
    L.new(dist.outputs["Points"], iop.inputs["Points"])
    L.new(oi.outputs["Geometry"], iop.inputs["Instance"])
    L.new(cmp.outputs[0], iop.inputs["Selection"])
    rr = N.new("FunctionNodeRandomValue")
    rr.data_type = "FLOAT_VECTOR"
    vv = [i for i in rr.inputs if i.bl_idname == "NodeSocketVector" and i.name in ("Min", "Max")]
    vv[0].default_value, vv[1].default_value = (0, 0, 0), (0.15, 0.15, 6.28)
    L.new([o for o in rr.outputs if o.bl_idname == "NodeSocketVector"][0], iop.inputs["Rotation"])
    rs = N.new("FunctionNodeRandomValue")
    rs.data_type = "FLOAT"
    fl = [i for i in rs.inputs if i.bl_idname == "NodeSocketFloat" and i.name in ("Min", "Max")]
    fl[0].default_value, fl[1].default_value = scale
    out = [o for o in rs.outputs if o.bl_idname == "NodeSocketFloat"][0]
    L.new(out, iop.inputs["Scale"])
    L.new(iop.outputs[0], go.inputs[0])  # instances only: the carrier plane itself never renders
    mod = target.modifiers.new(f"scatter-{inst.name}", "NODES")
    mod.node_group = ng
    return mod


def _pebble_object():
    g = G("pebble", (0, 0, -60), 0, col="fx")
    o = g.sph("p", 0.035, (0, 0, 0.012), painted("pebble5", "#9C968B", 0.8, var=0.15, nscale=20), scale=(1.3, 1.0, 0.5), seg=8)
    o.parent = None
    o.location = (0, 0, -60)
    o["no_ink"] = True
    return o


def _scatter_keep(target, inst, density, seed):
    """Scatter small instances over the top of `target` and keep the target itself."""
    ng = bpy.data.node_groups.new(f"pebbles-{target.name}", "GeometryNodeTree")
    ng.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N, L = ng.nodes, ng.links
    gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")
    nrm = N.new("GeometryNodeInputNormal")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(nrm.outputs[0], sep.inputs[0])
    up = N.new("FunctionNodeCompare")
    up.data_type = "FLOAT"
    up.operation = "GREATER_THAN"
    up.inputs[1].default_value = 0.9
    L.new(sep.outputs["Z"], up.inputs[0])
    dist = N.new("GeometryNodeDistributePointsOnFaces")
    dist.inputs["Density"].default_value = density
    dist.inputs["Seed"].default_value = seed
    L.new(gi.outputs[0], dist.inputs["Mesh"])
    L.new(up.outputs[0], dist.inputs["Selection"])
    oi = N.new("GeometryNodeObjectInfo")
    oi.inputs["Object"].default_value = inst
    iop = N.new("GeometryNodeInstanceOnPoints")
    L.new(dist.outputs["Points"], iop.inputs["Points"])
    L.new(oi.outputs["Geometry"], iop.inputs["Instance"])
    rr = N.new("FunctionNodeRandomValue")
    rr.data_type = "FLOAT_VECTOR"
    vv = [i for i in rr.inputs if i.bl_idname == "NodeSocketVector" and i.name in ("Min", "Max")]
    vv[0].default_value, vv[1].default_value = (0, 0, 0), (0.2, 0.2, 6.28)
    L.new([o for o in rr.outputs if o.bl_idname == "NodeSocketVector"][0], iop.inputs["Rotation"])
    j = N.new("GeometryNodeJoinGeometry")
    L.new(gi.outputs[0], j.inputs[0])
    L.new(iop.outputs[0], j.inputs[0])
    L.new(j.outputs[0], go.inputs[0])
    mod = target.modifiers.new("pebbles", "NODES")
    mod.node_group = ng
    return mod


def meadow(world, avoid_names=("path", "yard", "plaza", "river", "bank", "soil", "bridge")):
    """Grass tufts and flowers over a plane around the village, off paths, yards and houses."""
    X, Y = J.AREA
    avoid = bpy.data.collections.new("nograss")
    bpy.context.scene.collection.children.link(avoid)
    avoid.hide_render = True
    for o in list(bpy.data.objects):
        if o.type != "MESH":
            continue
        n = o.name
        is_ground = n.startswith("world.ground.") and any(k in n for k in avoid_names)
        is_house = any(n.startswith(f"world.{k}.") for k in J.PROJECTS) or n.startswith("world.well") or n.startswith("world.st-")
        if is_ground or is_house:
            avoid.objects.link(o)
    S, n, o0 = 75, 150, -26  # wider than the camera frame: no visible edge to the meadow
    verts = [(o0 + i * S / n, o0 + j * S / n, 0.005) for j in range(n + 1) for i in range(n + 1)]
    faces = [(j * (n + 1) + i, j * (n + 1) + i + 1, (j + 1) * (n + 1) + i + 1, (j + 1) * (n + 1) + i) for j in range(n) for i in range(n)]

    def carrier(tag):
        me = bpy.data.meshes.new(f"meadow-{tag}")
        me.from_pydata(verts, [], faces)
        o = bpy.data.objects.new(f"world.meadow.{tag}", me)
        av.coll("env").objects.link(o)
        o.data.materials.append(blade_mat())
        o["no_ink"] = True
        return o
    tufts = [_tuft_object(f"tuft{i}", seed=i) for i in range(3)]
    plane = None
    for i, t in enumerate(tufts):
        plane = carrier(f"grass{i}")
        _scatter(plane, t, 9.0, avoid, 0.45, seed=i)
    pebble = _pebble_object()
    for o in [o for o in avoid.objects if o.name.startswith("world.ground.path") or o.name.startswith("world.ground.yard")]:
        _scatter_keep(o, pebble, 5.0, seed=sum(o.name.encode()) % 1000)
    for i, c in enumerate(("flower_r", "flower_w", "flower_y", "flower_w")):
        _scatter(carrier(f"flowers{i}"), _flower_object(f"flower{i}", J.PAL[c]), 0.18, avoid, 0.6, seed=10 + i, scale=(0.8, 1.2))
    return plane


# --------------------------------------------------------------------------- villagers


def villager(p, name, loc, yaw, state, src, frame=0):
    return C.villager(p, name, loc, yaw, state, C.persona(name, src), frame)


_BASE_PALETTE = J.palette


def install():
    """Rewire jrpg in place so its layout code builds the detailed village."""
    J.palette = palette
    J.cottage = cottage
    J.tree = tree
    J.villager = villager
    base_ground = J.ground

    def ground(world):
        g = base_ground(world)
        return g
    J.ground = ground
    orig_build = J.build_village

    def build_village(world, stations_out):
        R = orig_build(world, stations_out)
        meadow(world)
        return R
    J.build_village = build_village
    J.BOT_SCALE = C.SCALE


install()
