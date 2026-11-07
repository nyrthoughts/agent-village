"""Agent Village v2 art: scripted Blender scene.

Everything is built from code: no downloaded model, texture or HDRI.
Units are metres. 1 floor tile = 1 m = 64 x 32 px at 1x.
World axes: +Y runs screen right-down, +X runs screen left-down,
origin is the back corner of the floor. Exterior walls sit on x=0 and y=0.
"""
import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

HERE = Path(__file__).resolve().parent
PX_PER_M = 45.2548  # 64 px tile diagonal / sqrt(2), at 1x
CAM_ROT = (math.radians(60), 0.0, math.radians(135))

STATE_HEX = {
    "working": "#00BA7C",
    "idle": "#8B98A5",
    "approval": "#FFAD1F",
    "input": "#1D9BF0",
    "error": "#F4212E",
}
TINT = {  # muted project tints: felt, binders, bins. Never saturated.
    "atlas": "#8A84A6",
    "privacy": "#7A978A",
    "connector": "#748AA6",
    "warehouse": "#A6926C",
    "launch": "#A68294",
}

# --------------------------------------------------------------------------- utils


def lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c) + (1.0,)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _M.clear()
    for c in ("env", "bots", "lights", "fx"):
        col = bpy.data.collections.new(c)
        bpy.context.scene.collection.children.link(col)


def coll(name):
    return bpy.data.collections[name]


# --------------------------------------------------------------------------- materials

_M = {}


def _bsdf(m):
    m.use_nodes = True
    nt = m.node_tree
    return nt, nt.nodes["Principled BSDF"]


def pbr(name, hexcol, rough=0.6, metal=0.0, var=0.06, nscale=6.0, bump=0.0, coat=0.0, sheen=0.0):
    """Principled material with low-frequency colour and roughness variation."""
    if name in _M:
        return _M[name]
    m = bpy.data.materials.new(name)
    nt, b = _bsdf(m)
    N = nt.nodes
    L = nt.links
    b.inputs["Metallic"].default_value = metal
    if coat:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = 0.15
    if sheen:
        b.inputs["Sheen Weight"].default_value = sheen
    tc = N.new("ShaderNodeTexCoord")
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = nscale
    nz.inputs["Detail"].default_value = 6
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    ramp = N.new("ShaderNodeValToRGB")
    base = lin(hexcol)
    lo = tuple(max(0, c * (1 - var * 2)) for c in base[:3]) + (1,)
    hi = tuple(min(1, c * (1 + var * 2)) for c in base[:3]) + (1,)
    ramp.color_ramp.elements[0].color = lo
    ramp.color_ramp.elements[1].color = hi
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[1].position = 0.65
    L.new(nz.outputs["Fac"], ramp.inputs["Fac"])
    L.new(ramp.outputs["Color"], b.inputs["Base Color"])
    rr = N.new("ShaderNodeMapRange")
    rr.inputs["To Min"].default_value = rough * 0.85
    rr.inputs["To Max"].default_value = min(1, rough * 1.15)
    L.new(nz.outputs["Fac"], rr.inputs["Value"])
    L.new(rr.outputs["Result"], b.inputs["Roughness"])
    if bump:
        bn = N.new("ShaderNodeBump")
        bn.inputs["Strength"].default_value = bump
        nz2 = N.new("ShaderNodeTexNoise")
        nz2.inputs["Scale"].default_value = nscale * 12
        L.new(tc.outputs["Object"], nz2.inputs["Vector"])
        L.new(nz2.outputs["Fac"], bn.inputs["Height"])
        L.new(bn.outputs["Normal"], b.inputs["Normal"])
    _M[name] = m
    return m


def wood(name, hexa, hexb, scale=3.0, rough=0.5, coat=0.15):
    if name in _M:
        return _M[name]
    m = bpy.data.materials.new(name)
    nt, b = _bsdf(m)
    N, L = nt.nodes, nt.links
    tc = N.new("ShaderNodeTexCoord")
    mp = N.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (scale, scale * 0.15, scale)
    L.new(tc.outputs["Object"], mp.inputs["Vector"])
    wv = N.new("ShaderNodeTexWave")
    wv.wave_type = "RINGS"
    wv.inputs["Scale"].default_value = 2.0
    wv.inputs["Distortion"].default_value = 6.0
    wv.inputs["Detail"].default_value = 3.0
    L.new(mp.outputs["Vector"], wv.inputs["Vector"])
    ramp = N.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = lin(hexa)
    ramp.color_ramp.elements[1].color = lin(hexb)
    L.new(wv.outputs["Fac"], ramp.inputs["Fac"])
    L.new(ramp.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = 0.25
    _M[name] = m
    return m


def emit(name, hexcol, strength=4.0):
    key = f"{name}"
    if key in _M:
        return _M[key]
    m = bpy.data.materials.new(key)
    nt, b = _bsdf(m)
    b.inputs["Base Color"].default_value = (0.02, 0.02, 0.02, 1)
    b.inputs["Emission Color"].default_value = lin(hexcol)
    b.inputs["Emission Strength"].default_value = strength
    b.inputs["Roughness"].default_value = 0.3
    _M[key] = m
    return m


def glass(name="glass", hexcol="#DDE6EA", rough=0.04):
    if name in _M:
        return _M[name]
    m = bpy.data.materials.new(name)
    nt, b = _bsdf(m)
    b.inputs["Base Color"].default_value = lin(hexcol)
    b.inputs["Transmission Weight"].default_value = 1.0
    b.inputs["Roughness"].default_value = rough
    b.inputs["IOR"].default_value = 1.45
    _M[name] = m
    return m


def screen_mat(state, strength=6.0):
    key = f"screen-{state}"
    if key in _M:
        return _M[key]
    m = bpy.data.materials.new(key)
    nt, b = _bsdf(m)
    N, L = nt.nodes, nt.links
    img = bpy.data.images.load(str(Path(SCREEN_DIR) / f"screen-{state}.png"))
    tx = N.new("ShaderNodeTexImage")
    tx.image = img
    b.inputs["Base Color"].default_value = (0.005, 0.005, 0.006, 1)
    b.inputs["Roughness"].default_value = 0.12
    L.new(tx.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 0.0 if state == "offline" else strength
    _M[key] = m
    return m


SCREEN_DIR = "."


def mats():
    """The material library. Saturated colour is reserved for state."""
    return dict(
        concrete=pbr("concrete", "#8E8A82", 0.62, var=0.08, nscale=1.5, bump=0.04),
        plaster=pbr("plaster", "#B3ADA2", 0.92, var=0.03, nscale=2),
        poche=pbr("poche", "#17171A", 0.8, var=0.0),
        plinth=pbr("plinth", "#0F1012", 0.55, var=0.02),
        slab=pbr("slab", "#5E5B56", 0.85, var=0.05, nscale=3, bump=0.1),
        oak=wood("oak", "#9C6E45", "#C4945F"),
        birch=wood("birch", "#C9A87C", "#E2C9A2", scale=2.0, rough=0.55, coat=0.05),
        walnut=wood("walnut", "#4A3020", "#6E4A31"),
        steel=pbr("steel", "#1B1C1F", 0.42, metal=0.7, var=0.04),
        galv=pbr("galv", "#9AA0A6", 0.38, metal=1.0, var=0.1, nscale=20),
        alu=pbr("alu", "#B9BDC2", 0.3, metal=1.0, var=0.03),
        laminate=pbr("laminate", "#E4E2DC", 0.38, var=0.02),
        mdf=pbr("mdf", "#85857F", 0.8, var=0.05),
        cardboard=pbr("cardboard", "#A27C54", 0.9, var=0.1, nscale=12),
        rubber=pbr("rubber", "#141414", 0.85, var=0.03),
        plastic_dk=pbr("plastic_dk", "#26282C", 0.45, var=0.02),
        plastic_gy=pbr("plastic_gy", "#6E7277", 0.5, var=0.03),
        fabric=pbr("fabric", "#464C53", 0.95, var=0.05, nscale=40, bump=0.15, sheen=0.4),
        cover=pbr("cover", "#7A7B7A", 0.95, var=0.07, nscale=6, bump=0.25, sheen=0.5),
        felt_dk=pbr("felt_dk", "#34373B", 0.98, var=0.04, nscale=60, bump=0.1, sheen=0.3),
        leaf=pbr("leaf", "#2E4A2B", 0.45, var=0.15, nscale=4),
        soil=pbr("soil", "#2A2019", 0.95),
        ceramic=pbr("ceramic", "#D6D0C4", 0.3, var=0.02, coat=0.3),
        clay=pbr("clay", "#8F5E45", 0.8, var=0.08),
        cork=pbr("cork", "#A88259", 0.95, var=0.12, nscale=50, bump=0.2),
        paper=pbr("paper", "#ECE8DE", 0.9, var=0.02),
        paper2=pbr("paper2", "#E3DCC8", 0.9, var=0.02),
        whiteboard=pbr("whiteboard", "#EEF0EE", 0.15, var=0.01, coat=0.4),
        ink=pbr("ink", "#2C3440", 0.6),
        screen_off=pbr("screen_off", "#050506", 0.12, var=0.0, coat=0.6),
        glass=glass(),
        night=emit("night", "#1A2638", 0.9),
        bulb=emit("bulb", "#FFD9A8", 18.0),
        led_w=emit("led_w", "#CFE4FF", 6.0),
        led_dim=emit("led_dim", "#7F8A99", 1.5),
        cli=pbr("cli", "#A85E44", 0.42, var=0.03, coat=0.15),
        codex=pbr("codex", "#97A8BC", 0.38, var=0.03, coat=0.2),
        app=pbr("app", "#D3CBBA", 0.4, var=0.02, coat=0.2),
        bot_dark=pbr("bot_dark", "#202226", 0.35, metal=0.3),
        bot_glass=pbr("bot_glass", "#0A0B0D", 0.08, coat=0.8),
        warn_red=pbr("warn_red", "#C8222C", 0.45),
        warn_white=pbr("warn_white", "#E8E6E0", 0.45),
        **{f"tint_{k}": pbr(f"tint_{k}", v, 0.9, var=0.05, nscale=30, sheen=0.3) for k, v in TINT.items()},
    )


M = {}

# --------------------------------------------------------------------------- geometry


def _mesh_box(sx, sy, sz):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z = (v.co.z + 0.5) * sz
    me = bpy.data.meshes.new("box")
    bm.to_mesh(me)
    bm.free()
    return me


def _mesh_cyl(r1, r2, h, seg):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h)
    for v in bm.verts:
        v.co.z += h / 2
    me = bpy.data.meshes.new("cyl")
    bm.to_mesh(me)
    bm.free()
    return me


def _mesh_sphere(r, seg=16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r)
    me = bpy.data.meshes.new("sph")
    bm.to_mesh(me)
    bm.free()
    return me


class G:
    """A transform group. Children are placed in local metres, rotations in degrees."""

    def __init__(self, name, loc=(0, 0, 0), rot=0.0, parent=None, col="env"):
        self.col = col
        self.e = bpy.data.objects.new(name, None)
        coll(col).objects.link(self.e)
        if parent is not None:
            self.e.parent = parent.e
        self.e.location = loc
        self.e.rotation_euler = (0, 0, math.radians(rot)) if not isinstance(rot, tuple) else tuple(math.radians(a) for a in rot)
        self.name = name

    def _obj(self, name, me, mat, loc, rot, bevel, seg=2, smooth=False):
        o = bpy.data.objects.new(f"{self.name}.{name}", me)
        coll(self.col).objects.link(o)
        o.parent = self.e
        o.location = loc
        o.rotation_euler = tuple(math.radians(a) for a in rot)
        if mat is not None:
            o.data.materials.append(mat)
        if bevel:
            b = o.modifiers.new("bevel", "BEVEL")
            b.width = bevel
            b.segments = seg
            b.limit_method = "ANGLE"
        if smooth:
            for p in o.data.polygons:
                p.use_smooth = True
        return o

    def box(self, name, size, loc, mat, bevel=0.006, rot=(0, 0, 0), seg=2):
        return self._obj(name, _mesh_box(*size), mat, loc, rot, bevel, seg)

    def cyl(self, name, r, h, loc, mat, seg=24, rot=(0, 0, 0), r2=None, bevel=0.0, smooth=True):
        return self._obj(name, _mesh_cyl(r, r if r2 is None else r2, h, seg), mat, loc, rot, bevel, smooth=smooth)

    def sph(self, name, r, loc, mat, scale=(1, 1, 1), rot=(0, 0, 0), seg=16):
        o = self._obj(name, _mesh_sphere(r, seg), mat, loc, rot, 0, smooth=True)
        o.scale = scale
        return o

    def bar(self, name, a, b, r, mat, seg=8):
        """A round bar between two local points."""
        a, b = Vector(a), Vector(b)
        d = b - a
        o = self._obj(name, _mesh_cyl(r, r, d.length, seg), mat, a, (0, 0, 0), 0, smooth=True)
        o.rotation_mode = "QUATERNION"
        o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
        return o

    def sub(self, name, loc=(0, 0, 0), rot=0.0):
        return G(f"{self.name}.{name}", loc, rot, parent=self, col=self.col)

    def light(self, name, kind, loc, energy, hexcol="#FFD2A0", size=0.05, rot=(0, 0, 0)):
        ld = bpy.data.lights.new(f"{self.name}.{name}", kind)
        ld.energy = energy
        ld.color = lin(hexcol)[:3]
        if kind in ("POINT", "SPOT"):
            ld.shadow_soft_size = size
        if kind == "AREA":
            ld.size = size
        o = bpy.data.objects.new(f"{self.name}.{name}", ld)
        coll("lights").objects.link(o)
        o.parent = self.e
        o.location = loc
        o.rotation_euler = tuple(math.radians(a) for a in rot)
        return o


# --------------------------------------------------------------------------- props
# Convention: a prop's local +Y is its front (the side a user or bot stands on).


def desk(p, name, loc=(0, 0, 0), rot=0, w=1.6, d=0.8, top="oak", screen=True, extras=True, seed=0):
    rnd = random.Random(seed)
    g = p.sub(name, loc, rot)
    h = 0.74
    g.box("top", (w, d, 0.028), (0, 0, h - 0.028), M[top], 0.004)
    for sx in (-1, 1):  # sled-base steel frame
        x = sx * (w / 2 - 0.06)
        g.box(f"leg{sx}", (0.04, 0.04, h - 0.03), (x, 0, 0), M["steel"], 0.004)
        g.box(f"foot{sx}", (0.05, d - 0.06, 0.03), (x, 0, 0), M["steel"], 0.004)
        g.box(f"rail{sx}", (0.04, d - 0.1, 0.04), (x, 0, h - 0.07), M["steel"], 0.004)
    g.box("beam", (w - 0.16, 0.04, 0.05), (0, -d / 2 + 0.12, h - 0.08), M["steel"], 0.004)
    g.box("tray", (w * 0.6, 0.14, 0.06), (0, -d / 2 + 0.12, h - 0.2), M["steel"], 0.003)
    if screen:
        mx = rnd.uniform(-0.12, 0.12)
        m = g.sub("monitor", (mx, -d / 2 + 0.18, h))
        m.box("foot", (0.24, 0.18, 0.012), (0, 0, 0), M["plastic_dk"], 0.004)
        m.box("neck", (0.05, 0.03, 0.34), (0, -0.04, 0.01), M["alu"], 0.006)
        m.box("body", (0.62, 0.035, 0.37), (0, -0.01, 0.18), M["plastic_dk"], 0.01)
        scr = m.box("screen", (0.6, 0.004, 0.35), (0, 0.009, 0.19), M["screen_off"], 0)
        scr["is_screen"] = True
        g.box("keyboard", (0.42, 0.13, 0.016), (mx - 0.05, 0.08, h), M["plastic_gy"], 0.004)
        g.box("pad", (0.07, 0.1, 0.012), (mx + 0.28, 0.1, h), M["plastic_gy"], 0.004)
    if extras:
        if rnd.random() < 0.8:
            g.cyl("mug", 0.04, 0.095, (w / 2 - 0.2, 0.05 + rnd.uniform(0, 0.15), h), M["ceramic"], 20)
        for i in range(rnd.randint(1, 3)):
            g.box(f"paper{i}", (0.21, 0.297, 0.004), (-w / 2 + 0.25 + i * 0.03, 0.05, h + i * 0.004), M["paper"], 0,
                  rot=(0, 0, rnd.uniform(-12, 12)))
        if rnd.random() < 0.5:
            g.box("notebook", (0.15, 0.21, 0.02), (w / 2 - 0.35, -0.15, h), M["ink"], 0.004, rot=(0, 0, rnd.uniform(-20, 20)))
    return g


def task_lamp(p, name, loc, rot=0, on=True):
    g = p.sub(name, loc, rot)
    g.cyl("base", 0.07, 0.02, (0, 0, 0), M["steel"], 24)
    g.bar("arm1", (0, 0, 0.02), (0, 0.1, 0.36), 0.008, M["steel"])
    g.bar("arm2", (0, 0.1, 0.36), (0, 0.32, 0.4), 0.008, M["steel"])
    g.cyl("shade", 0.075, 0.12, (0, 0.34, 0.3), M["steel"], 24, r2=0.03)
    if on:
        g.sph("bulb", 0.025, (0, 0.34, 0.33), M["bulb"])
        g.light("l", "POINT", (0, 0.34, 0.31), 16, "#FFC98F", 0.03)
    return g


def floor_lamp(p, name, loc):
    g = p.sub(name, loc)
    g.cyl("base", 0.16, 0.025, (0, 0, 0), M["steel"], 32)
    g.cyl("pole", 0.012, 1.45, (0, 0, 0.02), M["steel"], 12)
    g.cyl("shade", 0.2, 0.28, (0, 0, 1.38), M["paper2"], 32, r2=0.16)
    g.light("l", "POINT", (0, 0, 1.48), 70, "#FFCF9C", 0.1)
    return g


def plant(p, name, loc, h=1.4, seed=1, pot="ceramic"):
    rnd = random.Random(seed)
    g = p.sub(name, loc, rnd.uniform(0, 360))
    pr = 0.17 if h > 1 else 0.08
    g.cyl("pot", pr, pr * 2.1, (0, 0, 0), M[pot], 28, r2=pr * 0.82, bevel=0.004)
    g.cyl("soil", pr * 0.92, 0.01, (0, 0, pr * 2.0), M["soil"], 28)
    stems = 3 if h > 1 else 1
    for s in range(stems):
        ang = s * 2.1 + rnd.uniform(-0.3, 0.3)
        top = Vector((math.cos(ang) * 0.06, math.sin(ang) * 0.06, h * rnd.uniform(0.7, 1.0)))
        g.bar(f"stem{s}", (0, 0, pr * 2), top, 0.008 if h > 1 else 0.004, M["walnut"])
        n = int(10 * h) if h > 1 else 7
        for i in range(n):
            t = 0.35 + 0.65 * i / n
            c = Vector((0, 0, pr * 2)).lerp(top, t)
            a = rnd.uniform(0, 360)
            L = (0.13 if h > 1 else 0.06) * rnd.uniform(0.8, 1.2)
            off = Vector((math.cos(math.radians(a)), math.sin(math.radians(a)), 0)) * L * 0.6
            g.sph(f"leaf{s}_{i}", L, tuple(c + off), M["leaf"], scale=(1.0, 0.55, 0.12),
                  rot=(rnd.uniform(-35, 15), rnd.uniform(-20, 20), a), seg=10)
    return g


def shelving(p, name, loc, rot, w=1.8, d=0.45, h=2.1, levels=5, fill="archive", seed=0, tint="atlas"):
    """Galvanised boltless shelving, filled with real-looking stock."""
    rnd = random.Random(seed)
    g = p.sub(name, loc, rot)
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.box(f"post{sx}{sy}", (0.035, 0.035, h), (sx * (w / 2 - 0.02), sy * (d / 2 - 0.02), 0), M["galv"], 0.003)
    for i in range(levels):
        z = 0.08 + i * (h - 0.15) / (levels - 1)
        g.box(f"shelf{i}", (w, d, 0.02), (0, 0, z), M["galv"], 0.003)
        if i == levels - 1:
            continue
        x = -w / 2 + 0.06
        gap = (h - 0.15) / (levels - 1) - 0.05
        while x < w / 2 - 0.12:
            kind = rnd.random()
            if fill == "archive" and kind < 0.55:  # run of binders
                n = rnd.randint(4, 9)
                col = rnd.choice(["ink", "mdf", f"tint_{tint}", "plastic_gy", "paper2"])
                for k in range(n):
                    if x > w / 2 - 0.1:
                        break
                    bh = gap * rnd.uniform(0.8, 0.92)
                    g.box(f"b{i}_{x:.2f}", (0.055, 0.3, bh), (x + 0.028, 0.02, z + 0.02), M[col], 0.004,
                          rot=(0, rnd.uniform(-2, 2) if k else 0, 0))
                    x += 0.058
                x += 0.04
            elif kind < 0.8:  # archive box / carton
                bw = rnd.uniform(0.28, 0.4)
                bh = min(gap * 0.9, rnd.uniform(0.22, 0.32))
                g.box(f"c{i}_{x:.2f}", (bw, min(0.38, d - 0.05), bh), (x + bw / 2, 0, z + 0.02),
                      M["cardboard" if fill != "bins" else f"tint_{tint}"], 0.006)
                x += bw + rnd.uniform(0.02, 0.06)
            else:
                x += rnd.uniform(0.1, 0.25)  # gap: real shelves are never full
    return g


def pinboard(p, name, loc, rot, w=2.0, h=1.0, seed=3):
    rnd = random.Random(seed)
    g = p.sub(name, loc, rot)
    g.box("frame", (w, 0.03, h), (0, 0, 0), M["oak"], 0.006)
    g.box("cork", (w - 0.06, 0.012, h - 0.06), (0, 0.016, 0.03), M["cork"], 0)
    pins = []
    for i in range(14):
        cw, ch = rnd.choice([(0.15, 0.1), (0.1, 0.15), (0.21, 0.15)])
        x = rnd.uniform(-w / 2 + 0.15, w / 2 - 0.15)
        z = rnd.uniform(0.12, h - 0.2)
        g.box(f"card{i}", (cw, 0.003, ch), (x, 0.024, z), M[rnd.choice(["paper", "paper2", "paper"])], 0, rot=(0, rnd.uniform(-6, 6), 0))
        g.sph(f"pin{i}", 0.008, (x, 0.03, z + ch - 0.02), M["ink"])
        pins.append((x, 0.032, z + ch - 0.02))
    for i in range(7):
        a, b = rnd.sample(pins, 2)
        g.bar(f"thread{i}", a, b, 0.0016, M["ink"], 4)
    return g


def lockers(p, name, loc, rot, n=4):
    g = p.sub(name, loc, rot)
    w = 0.4
    for i in range(n):
        x = (i - (n - 1) / 2) * w
        g.box(f"body{i}", (w - 0.006, 0.5, 1.85), (x, 0, 0.08), M["galv"] if i % 2 else M["mdf"], 0.004)
        for k in range(2):
            z = 0.12 + k * 0.92
            g.box(f"door{i}{k}", (w - 0.04, 0.012, 0.86), (x, 0.252, z), M["plastic_gy"], 0.003)
            for v in range(4):
                g.box(f"vent{i}{k}{v}", (0.18, 0.006, 0.012), (x, 0.26, z + 0.7 - v * 0.03), M["steel"], 0)
            g.box(f"handle{i}{k}", (0.02, 0.02, 0.1), (x + w / 2 - 0.06, 0.262, z + 0.4), M["steel"], 0.003)
    g.box("plinth", (w * n, 0.48, 0.08), (0, 0, 0), M["steel"], 0.003)
    return g


def filing(p, name, loc, rot, drawers=4):
    g = p.sub(name, loc, rot)
    g.box("body", (0.47, 0.62, 0.32 * drawers + 0.04), (0, 0, 0), M["plastic_gy"], 0.006)
    for i in range(drawers):
        z = 0.04 + i * 0.32
        g.box(f"d{i}", (0.43, 0.012, 0.29), (0, 0.312, z), M["mdf"], 0.003)
        g.box(f"h{i}", (0.14, 0.025, 0.02), (0, 0.32, z + 0.22), M["alu"], 0.003)
        g.box(f"l{i}", (0.07, 0.004, 0.035), (0, 0.32, z + 0.17), M["paper"], 0)
    return g


def safe(p, name, loc, rot):
    g = p.sub(name, loc, rot)
    g.box("body", (0.62, 0.6, 0.9), (0, 0, 0.04), M["steel"], 0.02, seg=3)
    g.box("door", (0.54, 0.02, 0.8), (0, 0.3, 0.09), M["plastic_dk"], 0.008)
    g.cyl("dial", 0.05, 0.03, (0.12, 0.31, 0.6), M["alu"], 32, rot=(-90, 0, 0))
    g.bar("bolt", (-0.15, 0.33, 0.48), (-0.15, 0.33, 0.66), 0.015, M["alu"])
    g.box("feet", (0.6, 0.58, 0.04), (0, 0, 0), M["rubber"], 0.004)
    return g


def shredder(p, name, loc, rot):
    g = p.sub(name, loc, rot)
    g.box("bin", (0.38, 0.28, 0.55), (0, 0, 0), M["plastic_dk"], 0.01)
    g.box("head", (0.4, 0.3, 0.12), (0, 0, 0.55), M["plastic_gy"], 0.012)
    g.box("slot", (0.24, 0.01, 0.004), (0, 0, 0.67), M["rubber"], 0)
    return g


def workbench(p, name, loc, rot, w=2.4, seed=5):
    rnd = random.Random(seed)
    g = p.sub(name, loc, rot)
    d, h = 0.75, 0.9
    g.box("top", (w, d, 0.04), (0, 0, h - 0.04), M["birch"], 0.004)
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.box(f"leg{sx}{sy}", (0.05, 0.05, h - 0.04), (sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), 0), M["steel"], 0.003)
    g.box("shelf", (w - 0.1, d - 0.1, 0.02), (0, 0, 0.15), M["mdf"], 0.003)
    for i in range(4):
        g.box(f"bin{i}", (0.35, 0.5, 0.18), (-w / 2 + 0.3 + i * 0.45, 0, 0.17), M["plastic_gy" if i % 2 else "tint_connector"], 0.01)
    # back pegboard with tools, mounted on the bench
    g.box("peg", (w, 0.02, 0.9), (0, -d / 2 + 0.01, h + 0.15), M["mdf"], 0.003)
    for i in range(16):
        x = rnd.uniform(-w / 2 + 0.15, w / 2 - 0.15)
        z = h + rnd.uniform(0.3, 0.9)
        kind = rnd.random()
        if kind < 0.4:
            g.box(f"tool{i}", (0.02, 0.012, rnd.uniform(0.15, 0.28)), (x, -d / 2 + 0.03, z - 0.15), M["steel"], 0.002, rot=(0, rnd.uniform(-8, 8), 0))
        elif kind < 0.7:
            g.cyl(f"coil{i}", rnd.uniform(0.05, 0.08), 0.03, (x, -d / 2 + 0.035, z), M["rubber" if kind < 0.55 else "plastic_gy"], 24, rot=(90, 0, 0))
        else:
            g.box(f"cad{i}", (0.12, 0.06, 0.06), (x, -d / 2 + 0.05, z - 0.06), M["plastic_dk"], 0.004)
    g.box("vise", (0.16, 0.2, 0.1), (w / 2 - 0.2, 0.1, h), M["steel"], 0.01)
    g.box("scope", (0.32, 0.25, 0.17), (-w / 2 + 0.3, -0.12, h), M["plastic_gy"], 0.01)
    g.box("scope_scr", (0.13, 0.003, 0.09), (-w / 2 + 0.24, 0.006, h + 0.05), M["led_dim"], 0)
    g.cyl("spoolA", 0.07, 0.06, (0.2, 0.15, h), M["plastic_dk"], 24)
    return g


def spool(p, name, loc, r=0.35, rot=0):
    g = p.sub(name, loc, rot)
    for y in (-0.18, 0.18):
        g.cyl(f"flange{y}", r, 0.04, (0, y, r), M["oak"], 32, rot=(90, 0, 0))
    g.cyl("core", r * 0.75, 0.32, (0, 0.16, r), M["rubber"], 32, rot=(90, 0, 0))
    return g


def rack(p, name, loc, rot, seed=7):
    """42U server rack, perforated front door, a few neutral LEDs."""
    rnd = random.Random(seed)
    g = p.sub(name, loc, rot)
    w, d, h = 0.6, 1.0, 2.0
    g.box("body", (w, d, h), (0, 0, 0.05), M["steel"], 0.008)
    g.box("door", (w - 0.04, 0.02, h - 0.1), (0, d / 2, 0.1), M["plastic_dk"], 0.004)
    for u in range(18):
        z = 0.2 + u * 0.095
        g.box(f"u{u}", (w - 0.12, 0.004, 0.06), (0, d / 2 + 0.011, z), M["bot_dark"], 0)
        if rnd.random() < 0.7:
            g.box(f"led{u}", (0.012, 0.004, 0.008), (-w / 2 + 0.1 + rnd.uniform(0, 0.05), d / 2 + 0.014, z + 0.03),
                  M["led_w" if rnd.random() < 0.6 else "led_dim"], 0)
    g.box("handle", (0.015, 0.03, 0.3), (w / 2 - 0.06, d / 2 + 0.02, 0.9), M["alu"], 0.003)
    g.box("casters", (w - 0.04, d - 0.04, 0.05), (0, 0, 0), M["rubber"], 0.004)
    return g


def pallet_rack(p, name, loc, rot, seed=9):
    rnd = random.Random(seed)
    g = p.sub(name, loc, rot)
    w, d, h = 2.0, 0.9, 2.3
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.box(f"up{sx}{sy}", (0.06, 0.06, h), (sx * (w / 2 - 0.03), sy * (d / 2 - 0.03), 0), M["mdf"], 0.003)
    for i, z in enumerate((0.1, 1.15)):
        for sy in (-1, 1):
            g.box(f"beam{i}{sy}", (w, 0.05, 0.1), (0, sy * (d / 2 - 0.03), z), M["steel"], 0.003)
        g.box(f"deck{i}", (w - 0.1, d - 0.08, 0.02), (0, 0, z + 0.1), M["galv"], 0.002)
        x = -w / 2 + 0.15
        while x < w / 2 - 0.3:
            bw = rnd.uniform(0.35, 0.55)
            stack = rnd.randint(1, 2)
            zz = z + 0.12
            for s in range(stack):
                bh = rnd.uniform(0.25, 0.4)
                g.box(f"crt{i}_{x:.2f}_{s}", (bw, rnd.uniform(0.5, 0.7), bh), (x + bw / 2, 0, zz), M["cardboard"], 0.008,
                      rot=(0, 0, rnd.uniform(-3, 3)))
                zz += bh
            x += bw + rnd.uniform(0.04, 0.12)
    return g


def whiteboard(p, name, loc, rot, seed=11):
    rnd = random.Random(seed)
    g = p.sub(name, loc, rot)
    w = 1.6
    for sx in (-1, 1):
        g.box(f"leg{sx}", (0.04, 0.04, 1.9), (sx * (w / 2 + 0.03), 0, 0.06), M["alu"], 0.004)
        g.box(f"foot{sx}", (0.05, 0.55, 0.04), (sx * (w / 2 + 0.03), 0, 0.03), M["alu"], 0.004)
        for sy in (-1, 1):
            g.cyl(f"wheel{sx}{sy}", 0.03, 0.025, (sx * (w / 2 + 0.03), sy * 0.25, 0.03), M["rubber"], 16, rot=(0, 90, 0))
    g.box("board", (w, 0.025, 1.0), (0, 0, 0.85), M["whiteboard"], 0.008)
    g.box("tray", (w * 0.8, 0.07, 0.02), (0, 0.04, 0.84), M["alu"], 0.003)
    for i in range(18):  # sticky notes, pale, in a loose grid
        col, row = i % 6, i // 6
        if rnd.random() < 0.2:
            continue
        x = -w / 2 + 0.18 + col * 0.25 + rnd.uniform(-0.02, 0.02)
        z = 1.55 - row * 0.2 + rnd.uniform(-0.02, 0.02)
        g.box(f"note{i}", (0.08, 0.003, 0.08), (x, 0.015, z), M[rnd.choice(["paper", "paper2", "tint_launch"])], 0, rot=(0, rnd.uniform(-5, 5), 0))
    for i in range(3):  # marker lines
        g.box(f"line{i}", (rnd.uniform(0.3, 0.6), 0.002, 0.006), (rnd.uniform(-0.3, 0.3), 0.014, 0.95 + i * 0.05), M["ink"], 0)
    return g


def sofa(p, name, loc, rot):
    g = p.sub(name, loc, rot)
    w, d = 2.0, 0.9
    g.box("base", (w, d, 0.22), (0, 0, 0.08), M["fabric"], 0.04, seg=3)
    for i, x in enumerate((-w / 4, w / 4)):
        g.box(f"seat{i}", (w / 2 - 0.12, d - 0.25, 0.14), (x, 0.08, 0.3), M["fabric"], 0.05, seg=4)
        g.box(f"back{i}", (w / 2 - 0.12, 0.2, 0.42), (x, -d / 2 + 0.14, 0.3), M["fabric"], 0.06, seg=4, rot=(-8, 0, 0))
    for sx in (-1, 1):
        g.box(f"arm{sx}", (0.14, d, 0.42), (sx * (w / 2 - 0.07), 0, 0.22), M["fabric"], 0.05, seg=4)
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.box(f"leg{sx}{sy}", (0.04, 0.04, 0.08), (sx * (w / 2 - 0.1), sy * (d / 2 - 0.1), 0), M["walnut"], 0.004)
    g.box("cushion", (0.4, 0.14, 0.36), (w / 2 - 0.4, -d / 2 + 0.3, 0.42), M["tint_launch"], 0.06, seg=4, rot=(-12, 0, 18))
    return g


def coffee_table(p, name, loc, rot):
    g = p.sub(name, loc, rot)
    g.box("top", (1.1, 0.6, 0.03), (0, 0, 0.4), M["walnut"], 0.006)
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.bar(f"leg{sx}{sy}", (sx * 0.48, sy * 0.24, 0), (sx * 0.45, sy * 0.22, 0.4), 0.015, M["steel"])
    g.box("book", (0.22, 0.3, 0.03), (-0.2, 0, 0.43), M["ink"], 0.004, rot=(0, 0, 10))
    g.box("book2", (0.2, 0.27, 0.025), (-0.2, 0, 0.46), M["paper2"], 0.004, rot=(0, 0, -4))
    g.cyl("cup", 0.04, 0.09, (0.25, 0.1, 0.43), M["ceramic"], 20)
    return g


def rug(p, name, loc, size, rot=0, mat="felt_dk"):
    g = p.sub(name, loc, rot)
    g.box("rug", (size[0], size[1], 0.012), (0, 0, 0), M[mat], 0.004)
    g.box("border", (size[0] - 0.16, size[1] - 0.16, 0.013), (0, 0, 0), M["fabric"], 0.002)
    return g


def reading_table(p, name, loc, rot):
    g = p.sub(name, loc, rot)
    g.box("top", (1.8, 0.9, 0.04), (0, 0, 0.72), M["walnut"], 0.006)
    for sx in (-1, 1):
        g.box(f"pan{sx}", (0.05, 0.75, 0.72), (sx * 0.8, 0, 0), M["walnut"], 0.004)
    g.box("box1", (0.32, 0.25, 0.22), (-0.4, -0.1, 0.76), M["cardboard"], 0.006)
    g.box("lid1", (0.33, 0.26, 0.03), (-0.4, 0.25, 0.76), M["cardboard"], 0.004, rot=(0, 0, 14))
    for i in range(4):
        g.box(f"f{i}", (0.23, 0.31, 0.012), (0.2 + i * 0.06, 0.05, 0.76 + i * 0.012), M["paper2" if i % 2 else "paper"], 0, rot=(0, 0, -8 + i * 6))
    return g


def warn_triangle(p, name, loc, rot=0):
    """Fold-out warning triangle: placed next to a bot in the error state."""
    g = p.sub(name, loc, rot)
    s = 0.3
    pts = [(-s / 2, 0, 0.05), (s / 2, 0, 0.05), (0, 0, 0.05 + s * 0.866)]
    for i in range(3):
        g.bar(f"edge{i}", pts[i], pts[(i + 1) % 3], 0.018, M["warn_red"], 6)
    g.bar("foot", (0, 0.02, 0.0), (0, 0.12, 0.0), 0.01, M["steel"])
    g.box("base", (0.3, 0.03, 0.02), (0, 0, 0.02), M["steel"], 0.003)
    g.box("fill", (0.1, 0.004, 0.1), (0, 0, 0.1), M["warn_white"], 0)
    return g


# --------------------------------------------------------------------------- bots
# Faceless machines. Local +Y = the way the bot faces (toward its desk).
# State = pose + status light + desk monitor. Never a face.

POSE = {
    #            arm_pitch, head_pitch, head_yaw, head_roll, body_yaw, ext
    "working": (12, -34, 0, 0, 0, 0.22),
    "idle": (74, 0, 0, 0, 24, 0.12),
    "approval": (62, 8, 165, 0, 0, 0.6),
    "input": (40, 4, 82, 16, 0, 0.48),
    "error": (-48, -62, 18, -14, -8, 0.0),
    "offline": (74, 0, 0, 0, 0, 0.0),
}
# Four frames per state: small deltas on top of POSE (degrees / metres).
FRAMES = {
    "working": [(0, 0, 0, 0, 0), (2, -4, 0, 0, 0.01), (0, 0, 3, 0, 0), (-2, 3, 0, 0, -0.01)],
    "idle": [(0, 0, 0, 0, 0), (1, 2, 0, 0, 0.005), (0, 0, -6, 0, 0), (-1, -1, 0, 0, 0)],
    "approval": [(0, 0, 0, 0, 0), (5, 4, 0, 0, 0.04), (8, 6, -4, 0, 0.06), (3, 2, 2, 0, 0.02)],
    "input": [(0, 0, 0, 0, 0), (0, 0, 4, 6, 0), (0, 2, 8, 10, 0.01), (0, 0, 2, 3, 0)],
    "error": [(0, 0, 0, 0, 0), (0, 0, 6, 4, 0), (0, 0, -6, -4, 0), (0, 0, 0, 0, 0)],
    "offline": [(0, 0, 0, 0, 0)] * 4,
}


def _status_mat(state):
    if state == "offline":
        return M["bot_dark"]
    strength = {"idle": 1.2, "working": 5.0}.get(state, 7.0)
    return emit(f"status-{state}", STATE_HEX[state], strength)


def _head_abs(g, pivot, pitch, yaw, roll):
    """Orient the head pivot absolutely in the bot's root frame."""
    want = (Matrix.Rotation(math.radians(yaw), 4, "Z") @ Matrix.Rotation(math.radians(pitch), 4, "X")
            @ Matrix.Rotation(math.radians(roll), 4, "Y"))
    par = Matrix.Identity(4)
    o = pivot.e.parent
    while o is not None and o != g.e:
        par = o.matrix_basis @ par
        o = o.parent
    local = par.inverted() @ want
    pivot.e.rotation_mode = "QUATERNION"
    pivot.e.rotation_quaternion = local.to_quaternion()


def bot_cli(p, name, loc, yaw, state, frame=0):
    """Claude Code CLI: a low cart on casters with one arm carrying a sensor head."""
    ap, hp, hy, hr, by, _ = POSE[state]
    da, dh, dy, dr, _ = FRAMES[state][frame]
    root = G(name, loc, yaw + by, parent=p, col="bots")
    root.e["bot"] = name
    root.e.scale = (BOT_SCALE,) * 3
    if state == "offline":
        _cover(root, (0.62, 0.52), 1.05)
        return root
    st = _status_mat(state)
    c = M["cli"]
    root.box("chassis", (0.5, 0.42, 0.4), (0, 0, 0.1), c, 0.04, seg=3)
    root.box("bumper", (0.54, 0.46, 0.05), (0, 0, 0.08), M["rubber"], 0.015)
    root.box("seamL", (0.004, 0.36, 0.3), (-0.251, 0, 0.15), M["bot_dark"], 0)
    root.box("seamR", (0.004, 0.36, 0.3), (0.251, 0, 0.15), M["bot_dark"], 0)
    root.box("rear", (0.4, 0.004, 0.26), (0, -0.211, 0.16), M["bot_dark"], 0)
    root.box("plate", (0.12, 0.004, 0.05), (0.13, -0.213, 0.2), M["alu"], 0)
    for sx in (-1, 1):
        root.box(f"vent{sx}", (0.006, 0.2, 0.1), (sx * 0.253, -0.04, 0.24), M["bot_dark"], 0)
    root.box("strip", (0.3, 0.008, 0.022), (0, -0.215, 0.38), st, 0)  # status strip, seen from behind
    root.box("strip_f", (0.3, 0.008, 0.022), (0, 0.215, 0.38), st, 0)
    root.box("handle", (0.3, 0.03, 0.03), (0, -0.23, 0.46), M["bot_dark"], 0.008)
    for sx in (-1, 1):
        for sy in (-1, 1):
            root.cyl(f"caster{sx}{sy}", 0.04, 0.03, (sx * 0.19, sy * 0.15, 0.04), M["rubber"], 16, rot=(0, 90, 0))
            root.box(f"fork{sx}{sy}", (0.05, 0.03, 0.05), (sx * 0.19, sy * 0.15, 0.06), M["bot_dark"], 0.004)
    root.cyl("mast", 0.032, 0.36, (0, -0.08, 0.5), M["bot_dark"], 20)
    root.cyl("collar", 0.05, 0.04, (0, -0.08, 0.5), c, 24)
    sh = root.sub("shoulder", (0, -0.08, 0.88))
    sh.e.rotation_euler = (math.radians(ap + da), 0, 0)
    sh.cyl("joint", 0.045, 0.1, (-0.05, 0, 0), M["bot_dark"], 20, rot=(0, 90, 0))
    sh.box("arm", (0.055, 0.42, 0.055), (0, 0.21, -0.0275), c, 0.012)
    sh.bar("piston", (0, 0.05, -0.05), (0, 0.32, -0.035), 0.009, M["alu"])
    hd = sh.sub("head", (0, 0.42, 0))
    _head_abs(root, hd, hp + dh, hy + dy, hr + dr)
    hd.cyl("wrist", 0.035, 0.08, (-0.04, 0, 0), M["bot_dark"], 16, rot=(0, 90, 0))
    hd.box("housing", (0.36, 0.1, 0.22), (0, 0.04, -0.09), c, 0.02, seg=3)
    hd.box("glass", (0.3, 0.006, 0.15), (0, 0.091, -0.055), M["bot_glass"], 0.004)
    hd.cyl("lens", 0.022, 0.012, (0.11, 0.096, 0.07), M["bot_glass"], 20, rot=(-90, 0, 0))
    hd.box("hstrip", (0.2, 0.006, 0.014), (0, 0.093, 0.105), st, 0)
    hd.box("hstrip_b", (0.2, 0.006, 0.014), (0, -0.012, 0.03), st, 0)
    hd.box("fin", (0.012, 0.06, 0.05), (-0.15, 0.04, 0.13), M["bot_dark"], 0.003)
    return root


def bot_codex(p, name, loc, yaw, state, frame=0):
    """Codex: a weighted column with a telescoping mast and a scanner bar."""
    ap, hp, hy, hr, by, ext = POSE[state]
    _, dh, dy, dr, de = FRAMES[state][frame]
    root = G(name, loc, yaw + by, parent=p, col="bots")
    root.e["bot"] = name
    root.e.scale = (BOT_SCALE,) * 3
    if state == "offline":
        _cover(root, (0.5, 0.5), 1.15, round_=True)
        return root
    st = _status_mat(state)
    c = M["codex"]
    root.cyl("foot", 0.27, 0.035, (0, 0, 0), M["rubber"], 40, bevel=0.01)
    root.cyl("base", 0.25, 0.07, (0, 0, 0.03), c, 40, bevel=0.015)
    root.cyl("lower", 0.085, 0.56, (0, 0, 0.1), c, 28, bevel=0.006)
    root.cyl("ring", 0.092, 0.03, (0, 0, 0.66), st, 28)
    up = 0.2 + ext + de
    root.cyl("upper", 0.06, up, (0, 0, 0.69), M["alu"], 24)
    root.cyl("cap", 0.07, 0.03, (0, 0, 0.69 + up), M["bot_dark"], 24)
    for i in range(3):
        root.box(f"rib{i}", (0.006, 0.02, 0.4), (math.cos(i * 2.09) * 0.085, math.sin(i * 2.09) * 0.085, 0.18), M["bot_dark"], 0,
                 rot=(0, 0, math.degrees(i * 2.09)))
    hd = root.sub("head", (0, 0, 0.74 + up))
    _head_abs(root, hd, hp + dh, hy + dy, hr + dr)
    hd.box("yoke", (0.26, 0.05, 0.04), (0, 0, -0.02), M["bot_dark"], 0.008)
    hd.box("bar", (0.46, 0.13, 0.13), (0, 0.01, 0.0), c, 0.05, seg=4)
    hd.box("glass", (0.36, 0.006, 0.05), (0, 0.077, 0.04), M["bot_glass"], 0.003)
    hd.box("hstrip", (0.36, 0.006, 0.012), (0, 0.078, 0.0), st, 0)
    hd.box("hstrip_b", (0.3, 0.006, 0.012), (0, -0.057, 0.05), st, 0)
    for sx in (-1, 1):
        hd.cyl(f"end{sx}", 0.06, 0.02, (sx * 0.235, 0.01, 0.065), M["bot_dark"], 24, rot=(0, 90, 0))
    return root


def bot_app(p, name, loc, yaw, state="offline", frame=0):
    """App Claude: a dock. Shown covered until a verified source exists."""
    root = G(name, loc, yaw, parent=p, col="bots")
    root.e["bot"] = name
    root.box("stand", (0.5, 0.4, 0.06), (0, 0, 0), M["rubber"], 0.01)
    root.box("dock", (0.46, 0.36, 0.32), (0, 0, 0.06), M["app"], 0.05, seg=3)
    root.box("cover", (0.52, 0.42, 0.24), (0, 0, 0.2), M["cover"], 0.06, seg=4)
    root.box("drape", (0.54, 0.44, 0.1), (0, 0, 0.12), M["cover"], 0.02, seg=2)
    return root


def _cover(root, size, h, round_=False):
    """Dust cover over a parked bot: the offline pose."""
    if round_:
        root.cyl("cover", size[0] / 2, h, (0, 0, 0.0), M["cover"], 32, r2=size[0] / 2 * 0.55, bevel=0.06)
        root.sph("top", size[0] / 2 * 0.55, (0, 0, h), M["cover"], scale=(1, 1, 0.45))
    else:
        root.box("cover", (size[0], size[1], h), (0, 0, 0.0), M["cover"], 0.1, seg=5)
        root.box("hem", (size[0] + 0.02, size[1] + 0.02, 0.06), (0, 0, 0.0), M["cover"], 0.02)
    o = root.e.children[-1]
    for ch in root.e.children:
        if ch.type == "MESH":
            sd = ch.modifiers.new("sub", "SUBSURF")
            sd.levels = 1
            sd.render_levels = 2
            tx = bpy.data.textures.new("wr", "CLOUDS")
            tx.noise_scale = 0.12
            dp = ch.modifiers.new("wr", "DISPLACE")
            dp.texture = tx
            dp.strength = 0.015
    return o


BOT_SCALE = 1.2
BOT_FN = {"cli": bot_cli, "codex": bot_codex, "app": bot_app}

# --------------------------------------------------------------------------- building

FLOOR = (12.0, 18.0)  # X, Y in metres
WALL_H = 3.0
CUT_H = 0.95  # partitions cut like an architectural model
EDGE_H = 0.45

ROOMS = {  # x0, x1, y0, y1
    "atlas": (0.0, 5.0, 0.0, 6.0),
    "privacy": (0.0, 5.0, 6.0, 12.0),
    "connector": (0.0, 5.0, 12.0, 18.0),
    "warehouse": (6.4, 12.0, 0.0, 7.5),
    "launch": (6.4, 12.0, 7.5, 18.0),
}


def wall_run(p, name, axis, fixed, a, b, h, t=0.2, windows=(), mat="plaster", cap=True):
    """Straight wall along `axis` ('x' or 'y') from a to b, with window openings.

    windows: list of (centre, width). Sill 0.9 m, head 2.45 m.
    """
    segs = []
    cur = a
    for c, w in sorted(windows):
        segs.append((cur, c - w / 2, 0, h))
        segs.append((c - w / 2, c + w / 2, 0, 0.9))
        segs.append((c - w / 2, c + w / 2, 2.45, h))
        cur = c + w / 2
    segs.append((cur, b, 0, h))
    g = p.sub(name)
    for i, (s0, s1, z0, z1) in enumerate(segs):
        L = s1 - s0
        if L <= 0.001:
            continue
        mid = (s0 + s1) / 2
        if axis == "y":
            size, loc = (t, L, z1 - z0), (fixed - t / 2, mid, z0)
        else:
            size, loc = (L, t, z1 - z0), (mid, fixed - t / 2, z0)
        g.box(f"s{i}", size, loc, M[mat], 0.004)
        if cap and z1 == h:
            csize = (size[0] + 0.002, size[1] + 0.002, 0.012)
            g.box(f"cap{i}", csize, (loc[0], loc[1], z1 - 0.006), M["poche"], 0)
    for j, (c, w) in enumerate(windows):  # glazing, mullions, the night outside
        if axis == "y":
            g.box(f"glass{j}", (0.02, w, 1.55), (fixed - t / 2, c, 0.9), M["glass"], 0)
            g.box(f"night{j}", (0.01, w + 0.1, 1.7), (fixed - t - 0.25, c, 0.85), M["night"], 0)
            for k in (-1, 0, 1):
                g.box(f"mul{j}{k}", (0.05, 0.04, 1.55), (fixed - t / 2, c + k * w / 2, 0.9), M["steel"], 0.003)
            g.box(f"sill{j}", (0.28, w + 0.06, 0.03), (fixed - t / 2 + 0.06, c, 0.88), M["laminate"], 0.004)
            g.box(f"rad{j}", (0.08, w * 0.7, 0.5), (fixed + 0.06, c, 0.25), M["laminate"], 0.006)
        else:
            g.box(f"glass{j}", (w, 0.02, 1.55), (c, fixed - t / 2, 0.9), M["glass"], 0)
            g.box(f"night{j}", (w + 0.1, 0.01, 1.7), (c, fixed - t - 0.25, 0.85), M["night"], 0)
            for k in (-1, 0, 1):
                g.box(f"mul{j}{k}", (0.04, 0.05, 1.55), (c + k * w / 2, fixed - t / 2, 0.9), M["steel"], 0.003)
            g.box(f"sill{j}", (w + 0.06, 0.28, 0.03), (c, fixed - t / 2 + 0.06, 0.88), M["laminate"], 0.004)
            g.box(f"rad{j}", (w * 0.7, 0.08, 0.5), (c, fixed + 0.06, 0.25), M["laminate"], 0.006)
    return g


def building(world):
    X, Y = FLOOR
    g = world.sub("building")
    # plinth and slab: the model sits on a dark base
    g.box("plinth", (X + 2.4, Y + 2.4, 0.5), (X / 2, Y / 2, -0.83), M["plinth"], 0.03, seg=3)
    g.box("slab", (X + 0.4, Y + 0.4, 0.31), (X / 2, Y / 2, -0.322), M["slab"], 0.01)
    g.box("floor", (X, Y, 0.01), (X / 2, Y / 2, -0.01), M["concrete"], 0)
    # exterior walls, full height at the back, cut low at the front
    wall_run(g, "wallX0", "y", 0.0, -0.2, Y, WALL_H, windows=[(2.0, 1.6), (8.4, 1.8), (14.6, 1.8)])
    wall_run(g, "wallY0", "x", 0.0, 0.0, X, WALL_H, windows=[(2.4, 1.6), (9.4, 1.4)])
    g.box("edgeX", (0.2, Y + 0.2, EDGE_H), (X + 0.1, Y / 2 + 0.1 - 0.1, 0), M["plaster"], 0.004)
    g.box("edgeXc", (0.202, Y + 0.202, 0.012), (X + 0.1, Y / 2, EDGE_H - 0.006), M["poche"], 0)
    g.box("edgeY", (X + 0.2, 0.2, EDGE_H), (X / 2, Y + 0.1, 0), M["plaster"], 0.004)
    g.box("edgeYc", (X + 0.202, 0.202, 0.012), (X / 2, Y + 0.1, EDGE_H - 0.006), M["poche"], 0)
    # partitions between rooms, cut at CUT_H, with door gaps
    parts = [
        ("p1", "x", 6.0, 0.0, 5.0, [(4.2, 1.0)]),
        ("p2", "x", 12.0, 0.0, 5.0, [(4.2, 1.0)]),
        ("p3", "y", 5.0, 0.0, 18.0, [(3.0, 1.0), (9.0, 1.0), (15.0, 1.0)]),
        ("p4", "y", 6.4 + 0.1, 0.0, 18.0, [(4.0, 1.2), (12.0, 1.2)]),
        ("p5", "x", 7.5 + 0.1, 6.5, 12.0, [(7.5, 1.0)]),
    ]
    for nm, ax, fx, a, b, doors in parts:
        cur = a
        k = 0
        for c, w in sorted(doors) + [(b + 10, 0)]:
            e = min(c - w / 2, b)
            if e - cur > 0.05:
                L = e - cur
                mid = (cur + e) / 2
                if ax == "y":
                    sz, lc = (0.1, L, CUT_H), (fx - 0.05, mid, 0)
                else:
                    sz, lc = (L, 0.1, CUT_H), (mid, fx - 0.05, 0)
                g.box(f"{nm}_{k}", sz, lc, M["plaster"], 0.003)
                g.box(f"{nm}_{k}c", (sz[0] + 0.002, sz[1] + 0.002, 0.01), (lc[0], lc[1], CUT_H - 0.005), M["poche"], 0)
                k += 1
            cur = c + w / 2
    # aisle: white floor tape and cable covers
    for x in (5.15, 6.25):
        g.box(f"tape{x}", (0.05, Y - 0.4, 0.002), (x, Y / 2, 0), M["paper"], 0)
    for y in (2.0, 9.0, 15.5):
        g.box(f"cover{y}", (1.3, 0.12, 0.012), (5.7, y, 0), M["rubber"], 0.004)
    # overhead light: no ceiling in a model, so the key is a large soft area light
    world.light("key", "AREA", (X / 2 - 3, Y / 2 - 4, 9.0), 2200, "#DCE6FF", size=14.0, rot=(-15, 12, 0))
    world.light("fill", "AREA", (X + 6, Y + 6, 6.0), 350, "#FFE2C2", size=10.0, rot=(-55, 0, 135))
    for k, (x0, x1, y0, y1) in ROOMS.items():  # one ceiling panel per room, hidden from camera
        o = world.light(f"ceil_{k}", "AREA", ((x0 + x1) / 2, (y0 + y1) / 2, 3.1), 700, "#FFE2BF", size=2.6)
        o.data.shape = "RECTANGLE"
        o.data.size, o.data.size_y = (x1 - x0) * 0.6, (y1 - y0) * 0.6
    for o in coll("lights").objects:
        o.visible_camera = False
        o.visible_glossy = False
    return g


def furnish(world, stations):
    """Rooms, props, desks. `stations` collects desk positions keyed by bot id."""
    R = {k: world.sub(k, (v[0], v[2], 0)) for k, v in ROOMS.items()}

    # Atlas: knowledge graph, an archive room
    a = R["atlas"]
    shelving(a, "shelfA", (1.6, 0.3, 0), 0, w=2.0, seed=1, tint="atlas")
    shelving(a, "shelfB", (3.75, 0.3, 0), 0, w=2.0, seed=2, tint="atlas")
    pinboard(a, "pins", (0.06, 2.55, 1.25), -90, w=2.6, h=1.05)
    stations["graph-map"] = (desk(a, "deskA", (0.42, 1.75, 0), -90, seed=1), (0.42, 1.75), -90)
    stations["entity-audit"] = (desk(a, "deskB", (0.42, 3.55, 0), -90, seed=2), (0.42, 3.55), -90)
    task_lamp(a, "lampA", (0.25, 2.3, 0.74), 60)
    reading_table(a, "table", (3.2, 3.2, 0), 0)
    rug(a, "rug", (3.2, 3.4, 0), (2.6, 1.9))
    stations["roadmap-chat"] = (None, (4.2, 5.2), 200)
    plant(a, "plant", (0.45, 5.45, 0), 1.5, seed=4)

    # Privacy Desk: compliance, lockers, a safe, a shredder
    pr = R["privacy"]
    lockers(pr, "lockers", (0.3, 4.6, 0), -90, n=4)
    safe(pr, "safe", (0.45, 0.6, 0), -90)
    stations["privacy-guard"] = (desk(pr, "deskA", (0.42, 1.9, 0), -90, seed=3), (0.42, 1.9), -90)
    stations["redaction-check"] = (desk(pr, "deskB", (0.42, 3.4, 0), -90, seed=4), (0.42, 3.4), -90)
    filing(pr, "fileA", (2.6, 0.38, 0), 0)
    filing(pr, "fileB", (3.1, 0.38, 0), 0, drawers=3)
    shredder(pr, "shred", (3.7, 0.3, 0), 0)
    task_lamp(pr, "lampA", (0.25, 2.6, 0.74), 70)
    plant(pr, "plant", (4.5, 5.5, 0), 1.2, seed=7, pot="clay")

    # Connector Lab: integrations, a workbench with tools, cable spools
    c = R["connector"]
    workbench(c, "bench", (0.45, 2.0, 0), -90, w=3.0)
    stations["partner-connector"] = (None, (0.45, 1.25), -90)
    stations["tool-schema"] = (None, (0.45, 2.75), -90)
    for i, y in enumerate((1.25, 2.75)):  # monitors on arms over the bench
        m = c.sub(f"mon{i}", (0.3, y, 0.9), -90)
        m.box("foot", (0.2, 0.16, 0.012), (0, 0, 0), M["plastic_dk"], 0.004)
        m.box("pole", (0.04, 0.04, 0.32), (0, -0.02, 0), M["steel"], 0.004)
        m.box("body", (0.6, 0.035, 0.36), (0, 0.01, 0.28), M["plastic_dk"], 0.01)
        scr = m.box("screen", (0.58, 0.004, 0.34), (0, 0.029, 0.29), M["screen_off"], 0)
        scr["is_screen"] = True
        stations["partner-connector" if i == 0 else "tool-schema"] = (m, (0.45, y), -90)
    filing(c, "parts", (0.38, 4.6, 0), -90, drawers=4)
    filing(c, "parts2", (0.38, 5.1, 0), -90, drawers=4)
    spool(c, "spoolA", (3.9, 5.0, 0), 0.32, rot=30)
    spool(c, "spoolB", (3.2, 5.4, 0), 0.24, rot=-10)
    shelving(c, "shelf", (3.0, 0.3, 0), 0, w=1.8, levels=4, h=1.6, fill="bins", seed=5, tint="connector")
    task_lamp(c, "lampA", (0.3, 3.4, 0.9), 70)

    # Warehouse: data models, server racks and pallet racking
    w = R["warehouse"]
    for i in range(3):
        rack(w, f"rack{i}", (0.55 + i * 0.64, 0.6, 0), 0, seed=20 + i)
    pallet_rack(w, "pallet", (3.6, 0.55, 0), 0)
    stations["model-refresh"] = (desk(w, "deskA", (1.6, 3.0, 0), 0, seed=5), (1.6, 3.0), 0)
    stations["segment-models"] = (desk(w, "deskB", (3.4, 3.0, 0), 0, seed=6), (3.4, 3.0), 0)
    stations["warehouse-qa"] = (desk(w, "deskC", (0.48, 5.6, 0), -90, seed=8), (0.48, 5.6), -90)
    task_lamp(w, "lampA", (2.25, 2.75, 0.74), 200)
    plant(w, "plant", (5.2, 6.9, 0), 1.3, seed=9)
    filing(w, "fileW", (5.25, 0.38, 0), 0, drawers=3)

    # Launch Studio: go-to-market, whiteboards, a lounge corner
    l = R["launch"]
    whiteboard(l, "wbA", (1.5, 0.35, 0), 0, seed=11)
    whiteboard(l, "wbB", (3.45, 0.45, 0), 6, seed=12)
    stations["landing-review"] = (desk(l, "deskA", (1.4, 2.4, 0), 0, seed=10), (1.4, 2.4), 0)
    stations["outreach-copy"] = (desk(l, "deskB", (3.4, 2.4, 0), 0, seed=11), (3.4, 2.4), 0)
    stations["storyboard"] = (None, (4.9, 3.6), 210)
    rug(l, "rug", (3.4, 6.9, 0), (2.8, 2.2), rot=0, mat="tint_launch")
    sofa(l, "sofa", (3.4, 5.9, 0), 0)
    coffee_table(l, "ctable", (3.4, 7.2, 0), 0)
    floor_lamp(l, "flamp", (4.9, 5.7, 0))
    plant(l, "plantA", (5.1, 9.9, 0), 1.6, seed=12)
    plant(l, "plantB", (0.5, 9.8, 0), 1.1, seed=13, pot="clay")
    shelving(l, "shelf", (0.35, 6.4, 0), -90, w=1.6, levels=4, h=1.5, fill="mixed", seed=14, tint="launch")
    return R


BOTS = [  # id, project, source, state. DEMO DATA ONLY.
    ("graph-map", "atlas", "cli", "working"),
    ("entity-audit", "atlas", "codex", "approval"),
    ("roadmap-chat", "atlas", "app", "offline"),
    ("privacy-guard", "privacy", "cli", "input"),
    ("redaction-check", "privacy", "codex", "working"),
    ("partner-connector", "connector", "cli", "working"),
    ("tool-schema", "connector", "cli", "error"),
    ("model-refresh", "warehouse", "cli", "approval"),
    ("segment-models", "warehouse", "codex", "working"),
    ("warehouse-qa", "warehouse", "cli", "idle"),
    ("landing-review", "launch", "cli", "working"),
    ("outreach-copy", "launch", "codex", "input"),
    ("storyboard", "launch", "app", "offline"),
]
WALKER = ("release-notes", "connector", "codex", "idle", (5.7, 10.4), 0)  # in the aisle, world coords


def place_bots(world, R, stations, overrides=None, walker=True):
    """Put each bot 0.82 m in front of its desk, facing it."""
    placed = {}
    for bid, proj, src, state in BOTS:
        if overrides and bid in overrides:
            state = overrides[bid]
        _, (dx, dy), rot = stations[bid]
        if src == "app":
            yaw, bx, by = rot, dx, dy
        else:
            fwd = Vector((-math.sin(math.radians(rot)), math.cos(math.radians(rot)), 0))
            bx, by = dx + fwd.x * 0.82, dy + fwd.y * 0.82
            yaw = rot + 180
        b = BOT_FN[src](R[proj], bid, (bx, by, 0), yaw, state)
        b.e["state"] = state
        placed[bid] = (b, proj, src, state, stations[bid][0])
        if state == "error":
            warn_triangle(b, "warn", (0.5, -0.1, 0), 140)
    if walker:
        bid, proj, src, state, (x, y), yaw = WALKER
        b = BOT_FN[src](world, bid, (x, y, 0), yaw, state)
        placed[bid] = (b, proj, src, state, None)
    return placed


def set_screen(station_group, state):
    if station_group is None:
        return []
    out = []
    for o in station_group.e.children_recursive:
        if o.get("is_screen"):
            o.data.materials.clear()
            o.data.materials.append(screen_mat(state))
            out.append(o)
    return out


# --------------------------------------------------------------------------- camera / render


def setup_render(res, samples=160, exposure=0.0):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.015
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.max_bounces = 6
    sc.cycles.transmission_bounces = 4
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.view_settings.exposure = exposure - 0.25
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = lin("#0B1220")
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35


def camera(center, res_1x):
    """Orthographic 2:1 camera. center = world point at frame centre; res_1x = frame size at 1x."""
    sc = bpy.context.scene
    cd = bpy.data.cameras.new("cam")
    cd.type = "ORTHO"
    cd.ortho_scale = max(res_1x) / PX_PER_M
    cd.clip_start = 0.1
    cd.clip_end = 200
    co = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(co)
    co.rotation_euler = CAM_ROT
    fwd = co.rotation_euler.to_matrix() @ Vector((0, 0, -1))
    co.location = Vector(center) - fwd * 60
    sc.camera = co
    bpy.context.view_layer.update()
    return co


def project(pt):
    """World point -> pixel in the current render frame (origin top-left)."""
    from bpy_extras.object_utils import world_to_camera_view
    sc = bpy.context.scene
    v = world_to_camera_view(sc, sc.camera, Vector(pt))
    W = sc.render.resolution_x * sc.render.resolution_percentage / 100
    H = sc.render.resolution_y * sc.render.resolution_percentage / 100
    return [round(v.x * W, 1), round((1 - v.y) * H, 1)]


def bbox_px(objs, pad=6):
    xs, ys = [], []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if o.type != "MESH":
            continue
        oe = o.evaluated_get(dg)
        for c in oe.bound_box:
            x, y = project(oe.matrix_world @ Vector(c))
            xs.append(x)
            ys.append(y)
    return [min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad]


def render_to(path, border=None):
    sc = bpy.context.scene
    r = sc.render
    if border:
        W, H = r.resolution_x * r.resolution_percentage / 100, r.resolution_y * r.resolution_percentage / 100
        x0, y0, x1, y1 = border
        x0, y0 = max(0, int(x0)), max(0, int(y0))
        x1, y1 = min(W, int(x1) + 1), min(H, int(y1) + 1)
        if x1 - x0 < 8 or y1 - y0 < 8:
            return None  # outside the frame
        r.use_border = True
        r.use_crop_to_border = True
        r.border_min_x, r.border_max_x = x0 / W, x1 / W
        r.border_min_y, r.border_max_y = 1 - y1 / H, 1 - y0 / H
    else:
        r.use_border = False
    r.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    r.use_border = False
    if border:
        return [x0, y0, x1 - x0, y1 - y0]
    return None
