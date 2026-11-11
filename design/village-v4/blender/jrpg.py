"""Agent Village, JRPG direction: a bright village built from code, toon-shaded with ink outlines.

Genre-level inspiration (classic Japanese RPG towns): chibi villagers, gabled cottages, a plaza
with a well, emote bubbles. No character, monster, logo, map or asset from any existing game.
Same camera and tile convention as av.py: 1 m = 1 tile = 64 x 32 px at 1x.
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

import av
from av import G, lin

STATE_HEX = av.STATE_HEX

# --------------------------------------------------------------------------- materials

_T = {}


def toon(name, hexcol, soft=0.55, spec=0.0):
    """Two-band toon diffuse blended with a little soft diffuse so forms still read."""
    if name in _T:
        return _T[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    N, L = m.node_tree.nodes, m.node_tree.links
    for n in list(N):
        N.remove(n)
    out = N.new("ShaderNodeOutputMaterial")
    t = N.new("ShaderNodeBsdfToon")
    t.inputs["Color"].default_value = lin(hexcol)
    t.inputs["Size"].default_value = 0.62
    t.inputs["Smooth"].default_value = 0.04
    d = N.new("ShaderNodeBsdfDiffuse")
    d.inputs["Color"].default_value = lin(hexcol)
    mx = N.new("ShaderNodeMixShader")
    mx.inputs[0].default_value = soft
    L.new(t.outputs[0], mx.inputs[1])
    L.new(d.outputs[0], mx.inputs[2])
    sh = mx
    if spec:
        g = N.new("ShaderNodeBsdfToon")
        g.component = "GLOSSY"
        g.inputs["Size"].default_value = 0.15
        g.inputs["Smooth"].default_value = 0.0
        add = N.new("ShaderNodeAddShader")
        mul = N.new("ShaderNodeMixShader")
        mul.inputs[0].default_value = spec
        L.new(mx.outputs[0], mul.inputs[1])
        L.new(g.outputs[0], mul.inputs[2])
        sh = mul
    L.new(sh.outputs[0], out.inputs[0])
    _T[name] = m
    return m


def toon_tex(name, hexa, hexb, kind="checker", scale=1.0):
    """Toon material whose colour alternates between two tones (tiles, planks, shingles)."""
    if name in _T:
        return _T[name]
    m = toon(name + "_base", hexa)
    m.name = name
    N, L = m.node_tree.nodes, m.node_tree.links
    tc = N.new("ShaderNodeTexCoord")
    mp = N.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (scale, scale, scale)
    L.new(tc.outputs["Object"], mp.inputs["Vector"])
    if kind == "checker":
        tx = N.new("ShaderNodeTexChecker")
        tx.inputs["Color1"].default_value = lin(hexa)
        tx.inputs["Color2"].default_value = lin(hexb)
        tx.inputs["Scale"].default_value = 1.0
        L.new(mp.outputs[0], tx.inputs["Vector"])
        col = tx.outputs["Color"]
    elif kind == "noise":
        tx = N.new("ShaderNodeTexNoise")
        tx.inputs["Scale"].default_value = 3.0
        L.new(mp.outputs[0], tx.inputs["Vector"])
        rp = N.new("ShaderNodeValToRGB")
        rp.color_ramp.interpolation = "CONSTANT"
        rp.color_ramp.elements[0].color = lin(hexa)
        rp.color_ramp.elements[1].color = lin(hexb)
        rp.color_ramp.elements[1].position = 0.52
        L.new(tx.outputs["Fac"], rp.inputs["Fac"])
        col = rp.outputs["Color"]
    else:  # stripes along z (shingles) or x (planks)
        tx = N.new("ShaderNodeTexWave")
        tx.wave_type = "BANDS"
        tx.bands_direction = "Z" if kind == "zstripes" else "X"
        tx.inputs["Scale"].default_value = 1.0
        tx.inputs["Distortion"].default_value = 0.0
        L.new(mp.outputs[0], tx.inputs["Vector"])
        rp = N.new("ShaderNodeValToRGB")
        rp.color_ramp.interpolation = "CONSTANT"
        rp.color_ramp.elements[0].color = lin(hexa)
        rp.color_ramp.elements[1].color = lin(hexb)
        rp.color_ramp.elements[1].position = 0.8
        L.new(tx.outputs["Fac"], rp.inputs["Fac"])
        col = rp.outputs["Color"]
    for n in N:
        if n.type in ("BSDF_TOON", "BSDF_DIFFUSE"):
            L.new(col, n.inputs["Color"])
    _T[name] = m
    return m


def glow(name, hexcol, strength=6.0):
    if name in _T:
        return _T[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    N, L = m.node_tree.nodes, m.node_tree.links
    for n in list(N):
        N.remove(n)
    out = N.new("ShaderNodeOutputMaterial")
    e = N.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = lin(hexcol)
    e.inputs["Strength"].default_value = strength
    L.new(e.outputs[0], out.inputs[0])
    _T[name] = m
    return m


def ink():
    """Outline material for the inverted hull: ink on back faces, nothing on front faces."""
    if "ink" in _T:
        return _T["ink"]
    m = bpy.data.materials.new("ink")
    m.use_nodes = True
    N, L = m.node_tree.nodes, m.node_tree.links
    for n in list(N):
        N.remove(n)
    out = N.new("ShaderNodeOutputMaterial")
    geo = N.new("ShaderNodeNewGeometry")
    tr = N.new("ShaderNodeBsdfTransparent")
    em = N.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = lin("#1E1A24")
    em.inputs["Strength"].default_value = 1.0
    mx = N.new("ShaderNodeMixShader")
    lp = N.new("ShaderNodeLightPath")
    inv = N.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    L.new(lp.outputs["Is Camera Ray"], inv.inputs[1])
    mxm = N.new("ShaderNodeMath")
    mxm.operation = "MAXIMUM"
    L.new(geo.outputs["Backfacing"], mxm.inputs[0])
    L.new(inv.outputs[0], mxm.inputs[1])
    L.new(mxm.outputs[0], mx.inputs[0])  # the shell exists for camera rays only: it never casts shadow
    # flipped shell: faces nearest the camera are back-facing (hide them), the far rim faces the camera (ink)
    L.new(em.outputs[0], mx.inputs[1])
    L.new(tr.outputs[0], mx.inputs[2])
    L.new(mx.outputs[0], out.inputs[0])
    _T["ink"] = m
    return m


def outline_all(collections=("env", "bots"), thick=0.03):
    """Add an inverted-hull ink outline to every mesh. Thin parts get a thinner line."""
    k = ink()
    for cname in collections:
        for o in av.coll(cname).objects:
            if o.type != "MESH" or o.get("no_ink") or o.modifiers.get("ink"):
                continue
            dims = o.dimensions
            t = min(thick, max(0.004, min(d for d in dims if d > 0) * 0.18)) if any(dims) else thick
            o.data.materials.append(k)
            sol = o.modifiers.new("ink", "SOLIDIFY")
            sol.thickness = t
            sol.offset = 1.0
            sol.use_flip_normals = True
            sol.use_rim = False
            sol.material_offset = len(o.data.materials) - 1


PAL = {}


def palette():
    """Bright, saturated village palette. State colours stay reserved for state."""
    P = dict(
        grass=toon_tex("grass", "#62973F", "#5C8F3A", "checker", 1.0),
        grass_dk=toon("grass_dk", "#4E9A3A"),
        path=toon_tex("path", "#D9B77E", "#CFAB72", "noise", 1.6),
        cobble=toon_tex("cobble", "#B8B2A6", "#A49E92", "checker", 2.0),
        earth=toon("earth", "#8A5A3B"),
        water=toon("water", "#3F8EC9"),
        water_dk=toon("water_dk", "#3C8BC0"),
        wall_plaster=toon("wall_plaster", "#F3E9D2"),
        wall_stone=toon_tex("wall_stone", "#C9C2B4", "#B9B1A2", "checker", 3.0),
        wall_wood=toon_tex("wall_wood", "#B9764A", "#A9683F", "xstripes", 5.0),
        timber=toon("timber", "#6B4228"),
        roof_blue=toon_tex("roof_blue", "#4C7BD6", "#3F6BC2", "zstripes", 6.0),
        roof_red=toon_tex("roof_red", "#D4553E", "#C04833", "zstripes", 6.0),
        roof_green=toon_tex("roof_green", "#3E9A6B", "#348A5E", "zstripes", 6.0),
        roof_purple=toon_tex("roof_purple", "#8A62C9", "#7A54B6", "zstripes", 6.0),
        roof_orange=toon_tex("roof_orange", "#E58C3A", "#D27C2E", "zstripes", 6.0),
        door=toon("door", "#7A4A2A"),
        window=toon("window", "#FFE6A3"),
        window_dk=toon("window_dk", "#33405C"),
        iron=toon("iron", "#4A4D57"),
        gold=toon("gold", "#F2C14E", spec=0.3),
        wood=toon("wood", "#A86F44"),
        wood_lt=toon("wood_lt", "#D3A06A"),
        cloth_red=toon("cloth_red", "#C9473F"),
        cloth_blue=toon("cloth_blue", "#3F6FC9"),
        cloth_cream=toon("cloth_cream", "#F4EBD6"),
        cloth_green=toon("cloth_green", "#4FA05C"),
        leaf=toon("leaf", "#3E9D3F"),
        leaf_lt=toon("leaf_lt", "#5AAE48"),
        trunk=toon("trunk", "#7B5132"),
        rock=toon("rock", "#9A968E"),
        hay=toon("hay", "#E8C964"),
        paper=toon("paper", "#FBF6E8"),
        skin=toon("skin", "#F6D2B0"),
        eye=toon("eye", "#2A2230"),
        cli_body=toon("cli_body", "#D0673F"),
        cli_dark=toon("cli_dark", "#8E3F25"),
        codex_body=toon("codex_body", "#4F7FD8"),
        codex_dark=toon("codex_dark", "#2E4E9A"),
        app_body=toon("app_body", "#EFE3C8"),
        pants=toon("pants", "#5B4636"),
        boot=toon("boot", "#4A3326"),
        hair=toon("hair", "#5A3B2A"),
        crystal_off=toon("crystal_off", "#8E97A8", spec=0.5),
        flower_r=toon("flower_r", "#E5534B"),
        flower_y=toon("flower_y", "#F4D35E"),
        flower_w=toon("flower_w", "#F7F3EA"),
    )
    PAL.update(P)
    return P


def crystal(state):
    if state == "offline":
        return PAL["crystal_off"]
    return glow(f"crystal-{state}", STATE_HEX[state], 1.8 if state == "idle" else 5.0)


# --------------------------------------------------------------------------- geometry helpers


def _mesh(verts, faces, name="m"):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    return me


def prism_roof(g, name, w, d, h, loc, mat, over=0.25, thick=0.12):
    """Gable roof: ridge along local X. w along X, d along Y."""
    W, D = w / 2 + over, d / 2 + over
    v = [(-W, -D, 0), (W, -D, 0), (W, D, 0), (-W, D, 0), (-W, 0, h), (W, 0, h)]
    v2 = [(x, y, z + thick) for x, y, z in v]
    verts = v + v2
    faces = [(0, 1, 5, 4), (3, 4, 5, 2), (6, 7, 11, 10), (9, 10, 11, 8), (0, 4, 10, 6), (1, 7, 11, 5), (3, 9, 10, 4), (2, 5, 11, 8),
             (0, 6, 7, 1), (3, 2, 8, 9)]
    o = bpy.data.objects.new(f"{g.name}.{name}", _mesh(verts, faces))
    av.coll(g.col).objects.link(o)
    o.parent = g.e
    o.location = loc
    o.data.materials.append(mat)
    return o


def gable(g, name, w, d, h, loc, mat):
    """Triangular gable walls closing the roof ends (planes x = +-w/2, ridge along X)."""
    objs = []
    for s in (-1, 1):
        x0, x1 = s * w / 2, s * (w / 2 - 0.08)
        verts = [(x0, -d / 2, 0), (x0, d / 2, 0), (x0, 0, h), (x1, -d / 2, 0), (x1, d / 2, 0), (x1, 0, h)]
        faces = [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
        o = bpy.data.objects.new(f"{g.name}.{name}{s}", _mesh(verts, faces))
        av.coll(g.col).objects.link(o)
        o.parent = g.e
        o.location = loc
        o.data.materials.append(mat)
        objs.append(o)
    return objs


# --------------------------------------------------------------------------- buildings
# Local frame: front door faces +Y (toward the viewer's right-down) unless rotated.


def cottage(p, name, loc, rot, w=3.6, d=3.0, wall="wall_plaster", roof="roof_red", floors=1, chimney=True, timbered=True, seed=0):
    rnd = random.Random(seed)
    g = p.sub(name, loc, rot)
    h = 2.1 * floors
    g.box("base", (w + 0.2, d + 0.2, 0.25), (0, 0, 0), PAL["rock"], 0.03)
    g.box("walls", (w, d, h), (0, 0, 0.25), PAL[wall], 0.02)
    if timbered:
        for sx in (-1, 1):
            for sy in (-1, 1):
                g.box(f"post{sx}{sy}", (0.16, 0.16, h), (sx * (w / 2 - 0.04), sy * (d / 2 - 0.04), 0.25), PAL["timber"], 0.01)
        for f in range(floors + 1):
            z = 0.25 + f * 2.1 - (0.08 if f == floors else 0)
            g.box(f"beamY{f}", (w + 0.04, 0.14, 0.12), (0, d / 2 + 0.01, z), PAL["timber"], 0.01)
            g.box(f"beamX{f}", (0.14, d + 0.04, 0.12), (w / 2 + 0.01, 0, z), PAL["timber"], 0.01)
    # door on the front (+Y), windows on front and right side (+X)
    dx = rnd.uniform(-0.6, 0.6)
    g.box("door", (0.8, 0.1, 1.35), (dx, d / 2 + 0.03, 0.25), PAL["door"], 0.03)
    g.box("doorframe", (1.0, 0.08, 1.5), (dx, d / 2 + 0.01, 0.25), PAL["timber"], 0.02)
    g.sph("knob", 0.04, (dx + 0.25, d / 2 + 0.1, 0.95), PAL["gold"])
    for f in range(floors):
        z = 0.25 + f * 2.1 + 0.95
        for i, x in enumerate((-w / 2 + 0.7, w / 2 - 0.7)):
            if f == 0 and abs(x - dx) < 0.9:
                continue
            g.box(f"winF{f}{i}", (0.7, 0.08, 0.65), (x, d / 2 + 0.03, z), PAL["window"], 0.02)
            g.box(f"winFf{f}{i}", (0.84, 0.06, 0.78), (x, d / 2 + 0.01, z - 0.06), PAL["timber"], 0.02)
            g.box(f"winFm{f}{i}", (0.05, 0.1, 0.65), (x, d / 2 + 0.05, z), PAL["timber"], 0)
            g.box(f"sill{f}{i}", (0.9, 0.18, 0.06), (x, d / 2 + 0.08, z - 0.06), PAL["timber"], 0.01)
        for i, y in enumerate((-d / 4, d / 4)):
            g.box(f"winS{f}{i}", (0.08, 0.6, 0.65), (w / 2 + 0.03, y, z), PAL["window"], 0.02)
            g.box(f"winSf{f}{i}", (0.06, 0.74, 0.78), (w / 2 + 0.01, y, z - 0.06), PAL["timber"], 0.02)
    # roof: ridge along X
    rh = min(w, d) * 0.5 + 0.3
    gable(g, "gable", w, d, rh, (0, 0, 0.25 + h), PAL[wall])
    prism_roof(g, "roof", w, d, rh, (0, 0, 0.25 + h), PAL[roof])
    g.box("ridge", (w + 0.5, 0.2, 0.14), (0, 0, 0.25 + h + rh + 0.06), PAL["timber"], 0.03)
    if chimney:
        cx = w / 2 - 0.7
        g.box("chimney", (0.5, 0.5, rh + 0.9), (cx, -d / 4, 0.25 + h), PAL["rock"], 0.03)
        g.box("chimcap", (0.62, 0.62, 0.12), (cx, -d / 4, 0.25 + h + rh + 0.9), PAL["iron"], 0.02)
    return g


def sign(p, name, loc, rot, mat_icon="gold", icon="book"):
    """Hanging sign with a pictogram (no text): book, key, gear, sack, flag."""
    g = p.sub(name, loc, rot)
    g.box("pole", (0.08, 0.08, 0.1), (0, 0, 0), PAL["timber"], 0.01)
    g.box("arm", (0.06, 0.6, 0.06), (0, 0.3, 0.05), PAL["timber"], 0.01)
    g.box("board", (0.05, 0.5, 0.42), (0, 0.42, -0.45), PAL["wood_lt"], 0.02)
    ic = PAL[mat_icon]
    if icon == "book":
        g.box("i1", (0.06, 0.16, 0.2), (0.0, 0.34, -0.36), PAL["cloth_blue"], 0.01)
        g.box("i2", (0.06, 0.16, 0.2), (0.0, 0.5, -0.36), PAL["cloth_blue"], 0.01)
    elif icon == "key":
        g.cyl("i1", 0.07, 0.06, (0.0, 0.42, -0.2), ic, 16, rot=(0, 90, 0))
        g.box("i2", (0.06, 0.04, 0.22), (0.0, 0.42, -0.42), ic, 0)
    elif icon == "gear":
        g.cyl("i1", 0.12, 0.06, (0.0, 0.42, -0.25), PAL["iron"], 8, rot=(0, 90, 0))
        g.cyl("i2", 0.05, 0.07, (0.0, 0.42, -0.25), PAL["wood_lt"], 12, rot=(0, 90, 0))
    elif icon == "sack":
        g.sph("i1", 0.12, (0.0, 0.42, -0.3), PAL["hay"], scale=(0.6, 1, 1.1))
    elif icon == "flag":
        g.box("i1", (0.06, 0.24, 0.16), (0.0, 0.44, -0.24), PAL["cloth_red"], 0)
        g.box("i2", (0.06, 0.03, 0.3), (0.0, 0.3, -0.3), PAL["timber"], 0)
    return g


def tree(p, name, loc, s=1.0, seed=0, kind="round"):
    rnd = random.Random(seed)
    g = p.sub(name, loc, rnd.uniform(0, 360))
    g.cyl("trunk", 0.14 * s, 1.0 * s, (0, 0, 0), PAL["trunk"], 10)
    if kind == "pine":
        for i in range(3):
            g.cyl(f"c{i}", (0.85 - i * 0.22) * s, 0.8 * s, (0, 0, (0.8 + i * 0.55) * s), PAL["leaf"], 9, r2=0.05)
    else:
        for i in range(4):
            a = rnd.uniform(0, 6.28)
            r = 0.22 * s
            g.sph(f"c{i}", rnd.uniform(0.45, 0.62) * s, (math.cos(a) * r, math.sin(a) * r, (1.35 + rnd.uniform(-0.15, 0.35)) * s),
                  PAL["leaf" if i % 2 else "leaf_lt"], seg=10)
    return g


def bush(p, name, loc, s=1.0, seed=0, flowers=None):
    rnd = random.Random(seed)
    g = p.sub(name, loc)
    for i in range(3):
        g.sph(f"b{i}", (0.3 + rnd.uniform(0, 0.12)) * s, (rnd.uniform(-0.2, 0.2) * s, rnd.uniform(-0.2, 0.2) * s, 0.2 * s), PAL["leaf_lt" if i else "leaf"], seg=10)
    if flowers:
        for i in range(5):
            g.sph(f"f{i}", 0.05, (rnd.uniform(-0.3, 0.3) * s, rnd.uniform(-0.3, 0.3) * s, rnd.uniform(0.35, 0.5) * s), PAL[flowers], seg=8)
    return g


def fence(p, name, a, b, h=0.55):
    a, b = Vector(a), Vector(b)
    g = p.sub(name)
    n = max(2, int((b - a).length / 0.9) + 1)
    for i in range(n):
        c = a.lerp(b, i / (n - 1))
        g.box(f"post{i}", (0.1, 0.1, h), (c.x, c.y, 0), PAL["wood"], 0.015)
    for z in (h * 0.4, h * 0.8):
        g.bar(f"rail{z:.2f}", (a.x, a.y, z), (b.x, b.y, z), 0.035, PAL["wood_lt"], 6)
    return g


def well(p, name, loc):
    g = p.sub(name, loc)
    g.cyl("ring", 0.75, 0.7, (0, 0, 0), PAL["wall_stone"], 16, bevel=0.03, smooth=False)
    g.cyl("water", 0.6, 0.02, (0, 0, 0.55), PAL["water"], 16)
    for sx in (-1, 1):
        g.box(f"post{sx}", (0.12, 0.12, 1.5), (sx * 0.62, 0, 0.6), PAL["timber"], 0.015)
    g.bar("axle", (-0.65, 0, 1.75), (0.65, 0, 1.75), 0.05, PAL["wood"], 8)
    prism_roof(g, "roof", 1.4, 1.0, 0.45, (0, 0, 2.0), PAL["roof_red"], over=0.12, thick=0.08)
    g.box("bucket", (0.22, 0.22, 0.22), (0.1, 0, 1.2), PAL["wood"], 0.02)
    return g


def crate(p, name, loc, s=0.55, rot=0):
    g = p.sub(name, loc, rot)
    g.box("c", (s, s, s), (0, 0, 0), PAL["wood_lt"], 0.02)
    g.box("x", (s + 0.02, s * 0.12, s + 0.02), (0, 0, 0), PAL["wood"], 0.01)
    g.box("y", (s * 0.12, s + 0.02, s + 0.02), (0, 0, 0), PAL["wood"], 0.01)
    return g


def barrel(p, name, loc):
    g = p.sub(name, loc)
    g.cyl("b", 0.3, 0.8, (0, 0, 0), PAL["wood"], 16, r2=0.3)
    g.cyl("mid", 0.33, 0.24, (0, 0, 0.28), PAL["wood"], 16)
    for z in (0.1, 0.62):
        g.cyl(f"hoop{z}", 0.32, 0.06, (0, 0, z), PAL["iron"], 16)
    return g


def sack(p, name, loc, rot=0):
    g = p.sub(name, loc, rot)
    g.sph("s", 0.28, (0, 0, 0.25), PAL["cloth_cream"], scale=(1, 0.8, 1.0), seg=12)
    g.cyl("tie", 0.08, 0.12, (0, 0, 0.5), PAL["cloth_cream"], 10)
    return g


def lantern_post(p, name, loc):
    g = p.sub(name, loc)
    g.cyl("pole", 0.06, 2.0, (0, 0, 0), PAL["iron"], 10)
    g.box("lamp", (0.26, 0.26, 0.32), (0, 0, 2.0), PAL["window"], 0.03)
    g.box("cap", (0.36, 0.36, 0.08), (0, 0, 2.32), PAL["iron"], 0.02)
    return g


def bench(p, name, loc, rot=0):
    g = p.sub(name, loc, rot)
    g.box("seat", (1.3, 0.4, 0.08), (0, 0, 0.42), PAL["wood_lt"], 0.02)
    for sx in (-1, 1):
        g.box(f"leg{sx}", (0.1, 0.36, 0.42), (sx * 0.5, 0, 0), PAL["wood"], 0.01)
    return g


def station(p, name, loc, rot, kind="desk", state="working"):
    """Where an agent works, with a crystal that glows in the state colour (the status light)."""
    g = p.sub(name, loc, rot)
    if kind == "anvil":
        g.box("stump", (0.5, 0.5, 0.45), (0, 0, 0), PAL["trunk"], 0.03)
        g.box("anvil", (0.6, 0.26, 0.2), (0, 0, 0.45), PAL["iron"], 0.03)
        g.box("horn", (0.2, 0.16, 0.12), (0.38, 0, 0.53), PAL["iron"], 0.03)
    elif kind == "lectern":
        g.box("post", (0.16, 0.16, 0.85), (0, 0, 0), PAL["wood"], 0.02)
        g.box("top", (0.6, 0.45, 0.06), (0, 0, 0.85), PAL["wood_lt"], 0.02, rot=(-18, 0, 0))
        g.box("book", (0.46, 0.32, 0.05), (0, 0.0, 0.92), PAL["paper"], 0.01, rot=(-18, 0, 0))
    else:  # desk / counter
        g.box("top", (1.2, 0.6, 0.08), (0, 0, 0.7), PAL["wood_lt"], 0.02)
        for sx in (-1, 1):
            g.box(f"leg{sx}", (0.1, 0.5, 0.7), (sx * 0.5, 0, 0), PAL["wood"], 0.01)
        g.box("scroll", (0.4, 0.3, 0.02), (-0.2, 0.05, 0.78), PAL["paper"], 0.005, rot=(0, 0, 10))
        g.cyl("ink", 0.05, 0.08, (0.3, 0.1, 0.78), PAL["iron"], 10)
    # crystal on a small stand: the in-world status light
    off = (0.42, -0.15, 0.78) if kind == "desk" else (0.42, -0.2, 0.0)
    if kind != "desk":
        g.cyl("stand", 0.06, 0.8, off, PAL["wood"], 8)
        off = (off[0], off[1], 0.8)
    c = g.sph("crystal", 0.11, (off[0], off[1], off[2] + 0.12), crystal(state), scale=(0.8, 0.8, 1.35), seg=6)
    c["crystal"] = True
    c["no_ink"] = False
    return g


# --------------------------------------------------------------------------- characters
# Chibi villagers. Local +Y = facing direction. Height ~1.05 m before BOT_SCALE.

POSE = {
    #            armL, armR, head_pitch, head_yaw, head_roll, body_lean, sit
    "working": (20, -70, -18, 0, 0, 8, 0),
    "idle": (8, 8, 0, 25, 0, 0, 0),
    "approval": (10, 165, 10, 160, 0, -4, 0),
    "input": (10, 120, 6, 70, 18, 0, 0),
    "error": (-10, -10, -30, 0, -20, 14, 1),
    "offline": (5, 5, -35, 0, 10, 10, 1),
}
FRAMES = {
    "working": [(0, 0, 0, 0, 0), (0, -40, 4, 0, 0), (0, -70, 8, 0, 0), (0, -30, 2, 0, 0)],
    "idle": [(0, 0, 0, 0, 0), (2, -2, 0, 6, 0), (0, 0, 0, 12, 0), (-2, 2, 0, 4, 0)],
    "approval": [(0, 0, 0, 0, 0), (0, 10, 4, 0, 0), (0, 0, 0, 0, 0), (0, -10, -2, 0, 0)],
    "input": [(0, 0, 0, 0, 0), (0, 6, 0, 6, 4), (0, 10, 0, 10, 8), (0, 4, 0, 4, 3)],
    "error": [(0, 0, 0, 0, 0), (0, 0, 0, 8, 6), (0, 0, 0, -8, -6), (0, 0, 0, 0, 0)],
    "offline": [(0, 0, 0, 0, 0)] * 4,
}
BOT_SCALE = 1.45


def _arm(root, side, angle, mat, hand=None):
    """Arm pivot at the shoulder; angle 0 = hanging down, 90 = forward, 180 = straight up."""
    sh = root.sub(f"arm{side}", (side * 0.2, 0, 0.62))
    sh.e.rotation_euler = (math.radians(angle), 0, math.radians(side * 8))
    sh.cyl("a", 0.06, 0.26, (0, 0, -0.26), mat, 10)
    sh.sph("h", 0.065, (0, 0, -0.28), PAL["skin"], seg=10)
    if hand == "hammer":
        sh.bar("handle", (0, 0, -0.3), (0, 0.32, -0.32), 0.022, PAL["wood"], 6)
        sh.box("head", (0.1, 0.1, 0.18), (0, 0.34, -0.41), PAL["iron"], 0.02)
    elif hand == "staff":
        sh.bar("staff", (0, -0.1, -0.05), (0, 0.15, -0.95), 0.025, PAL["wood"], 6)
        sh.sph("orb", 0.08, (0, -0.12, 0.02), PAL["gold"], seg=10)
    return sh


def villager(p, name, loc, yaw, state, src, frame=0):
    aL, aR, hp, hy, hr, lean, sit = POSE[state]
    dL, dR, dp, dy, dr = FRAMES[state][frame]
    root = G(name, loc, yaw, parent=p, col="bots")
    root.e["bot"] = name
    root.e.scale = (BOT_SCALE,) * 3
    body_mat = PAL["cli_body" if src == "cli" else "codex_body"]
    dark = PAL["cli_dark" if src == "cli" else "codex_dark"]
    lying = state == "offline"
    if lying:  # asleep on its back: a silhouette no other state has
        sit = 0
        b = root.sub("body", (0, -0.35, 0.2))
        b.e.rotation_euler = (math.radians(-86), 0, 0)
    else:
        b = root.sub("body", (0, 0, -0.28 if sit else 0))
        b.e.rotation_euler = (math.radians(lean), 0, 0)
    if sit:  # legs forward, on the ground
        for s in (-1, 1):
            b.bar(f"leg{s}", (s * 0.08, 0, 0.32), (s * 0.1, 0.3, 0.3), 0.06, PAL["pants"], 8)
            b.sph(f"boot{s}", 0.07, (s * 0.1, 0.33, 0.3), PAL["boot"], seg=8)
    else:
        for s in (-1, 1):
            b.cyl(f"leg{s}", 0.06, 0.22, (s * 0.08, 0, 0.06), PAL["pants"], 8)
            b.box(f"boot{s}", (0.11, 0.16, 0.07), (s * 0.08, 0.02, 0.0), PAL["boot"], 0.025)
    if src == "codex":  # robe: a cone
        b.cyl("robe", 0.2, 0.42, (0, 0, 0.24), body_mat, 16, r2=0.13)
        b.cyl("hem", 0.215, 0.05, (0, 0, 0.24), dark, 16)
        b.cyl("belt", 0.15, 0.04, (0, 0, 0.5), PAL["gold"], 16)
    else:  # tunic
        b.cyl("tunic", 0.17, 0.4, (0, 0, 0.26), body_mat, 14, r2=0.14)
        b.cyl("belt", 0.165, 0.05, (0, 0, 0.36), PAL["boot"], 14)
        b.box("buckle", (0.06, 0.02, 0.05), (0, 0.165, 0.36), PAL["gold"], 0)
        b.box("apron", (0.2, 0.02, 0.2), (0, 0.17, 0.2), PAL["cloth_cream"], 0.01)
    _arm(b, -1, aL + dL, body_mat)
    _arm(b, 1, aR + dR, body_mat, hand="hammer" if src == "cli" else "staff")
    hd = b.sub("head", (0, 0, 0.68))
    hd.e.rotation_mode = "ZXY"
    hd.e.rotation_euler = (math.radians(hp + dp), math.radians(hr + dr), math.radians(hy + dy))
    hd.sph("skull", 0.2, (0, 0, 0.18), PAL["skin"], seg=16)
    for s in (-1, 1):
        hd.sph(f"eye{s}", 0.028, (s * 0.07, 0.18, 0.18), PAL["eye"], scale=(1, 0.6, 1.5), seg=8)
    if src == "codex":  # tall soft hat with a bent tip
        hd.cyl("brim", 0.27, 0.04, (0, 0, 0.3), dark, 20)
        hd.cyl("cone", 0.17, 0.32, (0, 0, 0.32), body_mat, 16, r2=0.06)
        hd.cyl("tip", 0.06, 0.16, (0, -0.05, 0.62), body_mat, 10, r2=0.02, rot=(-35, 0, 0))
    else:  # cap and hair tuft
        hd.sph("hair", 0.205, (0, -0.02, 0.22), PAL["hair"], scale=(1, 1, 0.7), seg=14)
        hd.cyl("cap", 0.18, 0.1, (0, -0.01, 0.33), dark, 14)
        hd.box("visor", (0.2, 0.12, 0.03), (0, 0.15, 0.34), dark, 0.01)
    if state == "error":  # dazed: three small stars circle the head
        for i in range(3):
            a = i * 2.09 + frame * 0.5
            hd.sph(f"star{i}", 0.045, (math.cos(a) * 0.26, math.sin(a) * 0.26, 0.48), PAL["gold"], scale=(1, 1, 0.5), seg=6)
    if lying:
        for s in (-1, 1):  # eyes closed: flat lines instead of dots
            hd.box(f"lid{s}", (0.07, 0.02, 0.012), (s * 0.07, 0.19, 0.18), PAL["eye"], 0)
        for o in list(hd.e.children):
            if ".eye" in o.name:
                bpy.data.objects.remove(o)
    return root


def courier_stall(p, name, loc, yaw=0):
    """Claude app: a market stall with its shutters closed. Covered until a source exists."""
    g = G(name, loc, yaw, parent=p, col="bots")
    g.e["bot"] = name
    g.box("counter", (1.4, 0.7, 0.9), (0, 0, 0), PAL["wood"], 0.03)
    g.box("shutter", (1.3, 0.06, 0.8), (0, 0.36, 0.05), PAL["wood_lt"], 0.02)
    for i in range(4):
        g.box(f"slat{i}", (1.28, 0.065, 0.03), (0, 0.37, 0.15 + i * 0.18), PAL["wood"], 0)
    for sx in (-1, 1):
        g.box(f"post{sx}", (0.1, 0.1, 1.9), (sx * 0.65, 0.25, 0), PAL["timber"], 0.01)
    awn = prism_roof(g, "awning", 1.5, 0.9, 0.35, (0, 0.05, 1.9), PAL["app_body"], over=0.1, thick=0.06)
    g.box("cloth", (1.42, 0.72, 0.18), (0, 0, 0.9), PAL["cloth_cream"], 0.06, seg=3)
    g.box("bar", (1.4, 0.08, 0.08), (0, 0.42, 0.55), PAL["iron"], 0.01)
    return g


BOT_FN = {"cli": lambda p, n, l, y, s, f=0: villager(p, n, l, y, s, "cli", f),
          "codex": lambda p, n, l, y, s, f=0: villager(p, n, l, y, s, "codex", f),
          "app": lambda p, n, l, y, s="offline", f=0: courier_stall(p, n, l, y)}

# --------------------------------------------------------------------------- the village

AREA = (23.0, 22.0)  # X, Y in metres (tiles)

# Projects: building + its outdoor workstations. DEMO DATA.
PROJECTS = {
    # Buildings stand in a horseshoe along the back so the plaza and the front meadow stay visible.
    "atlas": dict(at=(4.0, 4.2), rot=0, w=4.2, d=3.4, floors=2, wall="wall_stone", roof="roof_blue", icon="book"),
    "privacy": dict(at=(3.8, 11.2), rot=-90, w=3.6, d=3.2, floors=1, wall="wall_stone", roof="roof_green", icon="key"),
    "connector": dict(at=(4.2, 17.0), rot=-90, w=3.8, d=3.2, floors=1, wall="wall_plaster", roof="roof_orange", icon="gear"),
    "warehouse": dict(at=(11.2, 3.8), rot=0, w=4.6, d=3.6, floors=1, wall="wall_wood", roof="roof_red", icon="sack"),
    "launch": dict(at=(18.2, 4.2), rot=0, w=4.0, d=3.4, floors=2, wall="wall_plaster", roof="roof_purple", icon="flag"),
}
PLAZA = (11.5, 11.5)

# Stations: (project, local x, local y in building frame (door side = +y), kind)
STATIONS = {
    "graph-map": ("atlas", -1.0, 3.0, "lectern"),
    "entity-audit": ("atlas", 1.2, 3.1, "desk"),
    "privacy-guard": ("privacy", -0.8, 2.9, "desk"),
    "redaction-check": ("privacy", 1.3, 3.0, "lectern"),
    "partner-connector": ("connector", -1.0, 2.9, "anvil"),
    "tool-schema": ("connector", 1.2, 3.0, "anvil"),
    "model-refresh": ("warehouse", -1.3, 3.0, "desk"),
    "segment-models": ("warehouse", 0.6, 3.2, "lectern"),
    "warehouse-qa": ("warehouse", 2.0, 2.6, "desk"),
    "landing-review": ("launch", -1.1, 2.9, "desk"),
    "outreach-copy": ("launch", 1.0, 3.0, "lectern"),
}
BOTS = av.BOTS  # same demo agents and states as v2
WALKER = ("release-notes", "connector", "codex", "idle", (9.2, 14.6), 120)
APP_STALL = ("claude-app", None, "app", "offline", (14.6, 9.0), -90)


def ground(world):
    X, Y = AREA
    g = world.sub("ground")
    margin = 26.0
    g.box("grass_out", (X + 2 * margin, Y + 2 * margin, 0.2), (X / 2, Y / 2, -0.2), PAL["grass"], 0)
    px, py = PLAZA
    g.box("plaza", (4.6, 4.6, 0.04), (px, py, -0.01), PAL["cobble"], 0, rot=(0, 0, 45))
    doors = []
    for k, v in PROJECTS.items():
        x, y = v["at"]
        r = math.radians(v["rot"])
        fx, fy = -math.sin(r), math.cos(r)
        doors.append((x + fx * (v["d"] / 2 + 2.6), y + fy * (v["d"] / 2 + 2.6)))
    ends = doors + [(px, Y + 6), (X + 6, py)]
    for i, (ex, ey) in enumerate(ends):
        c, b = Vector((px, py, 0)), Vector((ex, ey, 0))
        a = c + (b - c).normalized() * 3.35  # start beyond the plaza: no overlapping surfaces
        d = b - a
        o = g.box(f"path{i}", (1.5, d.length, 0.02), (0, 0, -0.008), PAL["path"], 0)  # no bevel: thin slabs bevel into broken faces
        o.location = ((a + b) / 2 + Vector((0, 0, -0.01 + i * 0.0004))).to_tuple()  # Keep overlapping paths at distinct heights.
        o.rotation_euler = (0, 0, math.atan2(d.y, d.x) - math.pi / 2)
    for i, (k, v) in enumerate(PROJECTS.items()):  # a dirt yard in front of each door, where the stations stand
        x, y = v["at"]
        r = math.radians(v["rot"])
        fx, fy = -math.sin(r), math.cos(r)
        o = g.box(f"yard{k}", (v["w"] + 1.4, 3.2, 0.025), (0, 0, -0.009), PAL["path"], 0)
        o.location = (x + fx * (v["d"] / 2 + 1.5), y + fy * (v["d"] / 2 + 1.5), -0.009 + i * 0.0004)
        o.rotation_euler = (0, 0, r)
    # river across the front with a bridge, and a crop field
    g.box("river", (X + 2 * margin, 2.2, 0.05), (X / 2, Y + 1.6, -0.035), PAL["water"], 0)  # top 1.5 cm above the grass
    for sy in (-1, 1):
        g.box(f"bank{sy}", (X + 2 * margin, 0.25, 0.1), (X / 2, Y + 1.6 + sy * 1.2, -0.05), PAL["earth"], 0.02)
    br = g.sub("bridge", (px, Y + 1.6, 0))
    br.box("deck", (1.8, 3.2, 0.12), (0, 0, 0.05), PAL["wood_lt"], 0.02)
    for sx in (-1, 1):
        br.box(f"rail{sx}", (0.1, 3.2, 0.1), (sx * 0.85, 0, 0.55), PAL["wood"], 0.01)
        for i in range(4):
            br.box(f"post{sx}{i}", (0.1, 0.1, 0.5), (sx * 0.85, -1.4 + i * 0.93, 0.1), PAL["wood"], 0.01)
    for o in g.e.children_recursive:  # flat ground pieces carry no ink line
        if o.type == "MESH" and not o.name.startswith("world.ground.bridge"):
            o["no_ink"] = True
    fld = g.sub("field", (17.5, 17.0, 0))
    fld.box("soil", (5.0, 3.6, 0.06), (0, 0, -0.03), PAL["earth"], 0.03)["no_ink"] = True
    for i in range(6):
        for j in range(5):
            fld.sph(f"crop{i}{j}", 0.22, (-2.0 + j * 1.0, -1.4 + i * 0.56, 0.12), PAL["leaf_lt" if (i + j) % 2 else "leaf"], scale=(1, 0.8, 0.7), seg=8)
    return g


def build_village(world, stations_out):
    rnd = random.Random(42)
    ground(world)
    R = {}
    for k, v in PROJECTS.items():
        R[k] = world.sub(k, (*v["at"], 0), v["rot"])
        cottage(R[k], "house", (0, 0, 0), 0, w=v["w"], d=v["d"], wall=v["wall"], roof=v["roof"], floors=v["floors"], seed=len(k))
        sign(R[k], "sign", (v["w"] / 2 + 0.1, v["d"] / 2 - 0.2, 1.9), 0, icon=v["icon"])
    for bid, (proj, lx, ly, kind) in STATIONS.items():
        stations_out[bid] = (proj, lx, ly, kind)
    # signature props by project
    a, pr, c, w, l = (R[k] for k in ("atlas", "privacy", "connector", "warehouse", "launch"))
    for i in range(3):
        crate(a, f"bookcrate{i}", (-2.6, 1.0 + i * 0.6, 0), 0.45, rot=i * 9)
    bench(a, "bench", (2.9, 0.6, 0), 90)
    pr.box("iron_door", (0.9, 0.1, 1.4), (0, 1.66, 0.25), PAL["iron"], 0.02)
    for i in range(2):
        barrel(pr, f"barrel{i}", (-2.4, -0.6 + i * 0.7, 0))
    station(c, "forge", (-2.6, 0.5, 0), 90, "anvil", "idle")
    for i in range(3):
        c.cyl(f"coil{i}", 0.28, 0.22, (2.6, -0.6 + i * 0.6, 0.28), PAL["cloth_red" if i == 1 else "wood"], 16, rot=(0, 90, 0))
    for i in range(6):
        crate(w, f"crate{i}", (-3.0 + (i % 2) * 0.6, -1.0 + (i // 2) * 0.6, (i % 3 == 2) * 0.55), 0.55, rot=rnd.uniform(-8, 8))
    for i in range(3):
        sack(w, f"sack{i}", (3.0, -0.8 + i * 0.55, 0), rnd.uniform(0, 90))
    for i in range(3):
        barrel(w, f"barrel{i}", (2.9, 1.2 + i * 0.0, 0)) if i == 0 else None
    w.box("hay", (0.9, 0.7, 0.55), (-2.8, 2.0, 0), PAL["hay"], 0.08)
    # launch: notice board and banners
    nb = l.sub("noticeboard", (-2.8, 1.6, 0), 90)
    for sx in (-1, 1):
        nb.box(f"post{sx}", (0.1, 0.1, 1.8), (sx * 0.7, 0, 0), PAL["timber"], 0.01)
    nb.box("board", (1.6, 0.08, 0.9), (0, 0, 0.8), PAL["wood_lt"], 0.02)
    for i in range(5):
        nb.box(f"poster{i}", (0.3, 0.02, 0.36), (-0.55 + i * 0.27, 0.05, 0.95 + (i % 2) * 0.12), PAL["paper"], 0, rot=(0, (i - 2) * 4, 0))
    prism_roof(nb, "roof", 1.8, 0.4, 0.25, (0, 0, 1.8), PAL["roof_purple"], over=0.08, thick=0.06)
    for i, sx in enumerate((-1.2, 1.2)):
        l.box(f"banner{i}", (0.06, 0.5, 0.9), (2.06, sx, 1.4), PAL["cloth_red" if i else "cloth_blue"], 0.01)
    # plaza: well, lanterns, bench, flowers
    px, py = PLAZA
    well(world, "well", (px, py, 0))
    for i, (dx, dy) in enumerate(((-2.4, -2.4), (2.4, 2.4), (-2.4, 2.4), (2.4, -2.4))):
        lantern_post(world, f"lamp{i}", (px + dx, py + dy, 0))
    bench(world, "benchP", (px + 1.6, py - 2.6, 0), 0)
    bench(world, "benchQ", (px - 2.7, py + 1.4, 0), 90)
    # border: trees behind the buildings, a light scatter in front so nothing hides the meadow
    X, Y = AREA
    k = 0
    for x in [i * 1.7 - 2 for i in range(16)]:
        tree(world, f"tb{k}", (x + rnd.uniform(-0.3, 0.3), -2.2 + rnd.uniform(-0.6, 0.6), 0), rnd.uniform(1.0, 1.35), k, "pine" if k % 3 == 0 else "round")
        k += 1
    for y in [i * 1.7 - 1 for i in range(14)]:
        tree(world, f"tr{k}", (-2.2 + rnd.uniform(-0.6, 0.6), y, 0), rnd.uniform(1.0, 1.35), k, "pine" if k % 2 else "round")
        k += 1
    for i, (x, y) in enumerate(((8.0, 1.0), (14.6, 1.6), (21.6, 8.0), (21.8, 12.6), (1.0, 7.6), (0.8, 14.4), (7.6, 19.4), (22.4, 19.0))):
        tree(world, f"ti{i}", (x, y, 0), 1.05, 100 + i, "pine" if i % 3 == 0 else "round")
    for i, (x, y) in enumerate(((8.4, 8.0), (15.0, 14.6), (7.4, 7.0), (15.6, 7.2), (7.6, 15.6), (20.6, 14.0), (13.8, 6.6), (6.8, 12.4))):
        bush(world, f"bu{i}", (x, y, 0), 1.0, i, ["flower_r", "flower_y", "flower_w", None][i % 4])
    fence(world, "fenceF", (15.0, 15.0), (20.2, 15.0))
    fence(world, "fenceG", (20.2, 15.0), (20.2, 19.0))
    return R


def world_pos(R, proj, lx, ly):
    """Local station position in a project's frame -> world (x, y), and the facing yaw toward the building."""
    e = R[proj].e
    m = e.matrix_world
    p = m @ Vector((lx, ly, 0))
    rot = math.degrees(e.rotation_euler.z)
    return p.x, p.y, rot


def place(world, R, stations, overrides=None, walker=True):
    """Station (with crystal) and villager for each agent. The villager stands at the station, facing the building."""
    bpy.context.view_layer.update()  # project frames must be current before mapping local to world
    placed = {}
    for bid, proj, src, state in BOTS:
        if overrides and bid in overrides:
            state = overrides[bid]
        _, lx, ly, kind = stations[bid]
        st = station(R[proj], f"st-{bid}", (lx, ly - 0.5, 0), 0, kind, state)
        st.e["station_of"] = bid
        x, y, rot = world_pos(R, proj, lx, ly + 0.25)
        v = villager(world, bid, (x, y, 0), rot + 180, state, src)
        placed[bid] = (v, proj, src, state, st)
    bid, proj, src, state, (x, y), yaw = APP_STALL
    placed[bid] = (courier_stall(world, bid, (x, y, 0), yaw), proj, src, state, None)
    if walker:
        bid, proj, src, state, (x, y), yaw = WALKER
        placed[bid] = (villager(world, bid, (x, y, 0), yaw, state, src), proj, src, state, None)
    return placed


def lights(world):
    X, Y = AREA
    for o in [o for o in bpy.data.objects if o.name.startswith("sun")]:  # idempotent: one sun only
        bpy.data.objects.remove(o)
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 5.6
    sun.angle = math.radians(3)
    sun.color = lin("#FFF4DE")[:3]
    o = bpy.data.objects.new("sun", sun)
    av.coll("lights").objects.link(o)
    o.rotation_euler = (math.radians(42), math.radians(-18), math.radians(-60))
    sc = bpy.context.scene
    w = bpy.data.worlds.new("sky")
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = lin("#C9D8EC")
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.65


def setup(res, samples=48):
    av.setup_render(res, samples)
    sc = bpy.context.scene
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0.0
    sc.cycles.max_bounces = 3
    sc.cycles.adaptive_threshold = 0.03
