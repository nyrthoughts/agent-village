"""Villager generator: one stable, detailed character per agent id.

Same id -> same villager, every render. Variety comes from a seeded draw over
families (humans, elves, dwarves, halflings, beastfolk), skin or fur tones,
hair styles and colours, facial hair, eyes, accessories and guild outfits.

The guild encodes the source and must stay readable:
  Artisans (Claude Code CLI): warm colours, shirt and vest, apron, tool belt, hammer/wrench/tongs.
  Scholars (Codex): cool robes with trim, mantle, sash, staff or book.
Family, face and hair are decoration only: they never encode data.
All designs are original.
"""
import hashlib
import math
import random

import bpy
from mathutils import Matrix, Vector

import av
from av import G, lin

# --------------------------------------------------------------------------- materials (stylized PBR)

_C = {}


def cmat(name, hexcol, rough=0.75, metal=0.0, sheen=0.0, sss=0.0, coat=0.0, var=0.04, nscale=40.0, bump=0.0):
    key = f"{name}:{hexcol}"
    if key in _C:
        return _C[key]
    m = av.pbr(key, hexcol, rough, metal=metal, var=var, nscale=nscale, bump=bump, coat=coat, sheen=sheen)
    if sss:
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Subsurface Weight"].default_value = sss
        b.inputs["Subsurface Radius"].default_value = (0.4, 0.15, 0.08)
        b.inputs["Subsurface Scale"].default_value = 0.03
    _C[key] = m
    return m


def cloth(hexcol):
    return cmat("cloth", hexcol, 0.88, sheen=0.35, var=0.02, nscale=200, bump=0.06)


def leather(hexcol):
    return cmat("leather", hexcol, 0.55, var=0.04, nscale=60, bump=0.05, coat=0.1)


def metal(hexcol):
    return cmat("metal", hexcol, 0.32, metal=0.85, var=0.04, nscale=60)


def skin(hexcol):
    return cmat("skin", hexcol, 0.5, sss=0.25, var=0.02, nscale=8)


def hairm(hexcol):
    return cmat("hair", hexcol, 0.42, var=0.025, nscale=300, bump=0.08, coat=0.15)


def gloss(hexcol):
    return cmat("gloss", hexcol, 0.08, coat=0.6, var=0.0)


def wood(hexcol="#8A5A36"):
    return cmat("wood", hexcol, 0.6, var=0.12, nscale=14, bump=0.1)


# --------------------------------------------------------------------------- palettes

SKIN = ["#F6D7BE", "#EDC1A0", "#E0A985", "#C98B65", "#A86F4E", "#8A5639", "#6B3F2A", "#F1D0B5"]
FUR = ["#C98A4B", "#9C8F86", "#E3C79C", "#6E5A4C", "#D8D2C8", "#B5652E"]
HAIR = ["#1F1A17", "#3B2A20", "#5A3A24", "#7E4E2C", "#A6672F", "#C99A55", "#E3C788", "#B9B4AE", "#EDE8E0", "#8E3B2A"]
HAIR_ELF = ["#E9E2C9", "#C9D6E8", "#B7A5D6", "#9FC7A6", "#D9B98A"]
EYES = ["#4B3621", "#2F5D8A", "#3F7A4A", "#8A6A2A", "#5A4A8A", "#2E2E2E"]
ARTISAN_COAT = ["#B5532E", "#C26B2A", "#9C4A2B", "#C8892E", "#8E5A3A", "#A7452F"]
ARTISAN_SHIRT = ["#EFE6D2", "#E2D6BC", "#D9CBB0", "#F3EEE2", "#CBBFA5"]
ARTISAN_PANTS = ["#5B4636", "#4A4F3A", "#6B5644", "#3E3A33"]
APRON = ["#7A5233", "#8D6A45", "#5E4A3A", "#B8A786"]
SCHOLAR_ROBE = ["#2F55A8", "#3A3F8F", "#24707A", "#4A5878", "#1F3E73", "#5B4FA3"]
TRIM = ["#E2BC5A", "#D5D9DE", "#C9A44A", "#E8DDBF"]
MANTLE = ["#E9E2D0", "#2A2F4A", "#6E2E3E", "#3E5F4F"]

FAMILIES = ["human", "human", "elf", "dwarf", "halfling", "beastfolk"]
FAMILY_SHAPE = {  # height, width, head
    "human": (1.0, 1.0, 1.0),
    "elf": (1.1, 0.9, 0.96),
    "dwarf": (0.84, 1.28, 1.04),
    "halfling": (0.8, 1.02, 1.06),
    "beastfolk": (1.0, 0.98, 1.0),
}


def persona(agent_id, source):
    """Deterministic character sheet for an agent."""
    rnd = random.Random(int(hashlib.sha256(f"{source}:{agent_id}".encode()).hexdigest()[:12], 16))
    fam = rnd.choice(FAMILIES)
    p = {"id": agent_id, "source": source, "family": fam}
    p["skin"] = rnd.choice(FUR if fam == "beastfolk" else SKIN)
    p["hair_color"] = rnd.choice(HAIR_ELF + HAIR if fam == "elf" else HAIR)
    p["eyes"] = rnd.choice(EYES + (["#7A4FB0", "#2F8A8A"] if fam == "elf" else []))
    styles = ["short", "bob", "ponytail", "bun", "spiky", "long", "braid", "bald"]
    if fam == "dwarf":
        styles = ["short", "braid", "bald", "bun", "spiky"]
    p["hair"] = rnd.choice(styles)
    beard_p = {"dwarf": 1.0, "human": 0.3, "halfling": 0.12, "elf": 0.0, "beastfolk": 0.0}[fam]
    p["beard"] = rnd.choice(["long", "braided"] if fam == "dwarf" else ["moustache", "short", "goatee"]) if rnd.random() < beard_p else None
    p["ears"] = rnd.choice(["cat", "fox", "round"]) if fam == "beastfolk" else None
    p["tail"] = fam == "beastfolk"
    p["freckles"] = rnd.random() < 0.3 and fam != "beastfolk"
    p["glasses"] = rnd.random() < (0.35 if source == "codex" else 0.18)
    p["scarf"] = rnd.random() < 0.3
    p["satchel"] = rnd.random() < 0.4
    p["earring"] = rnd.random() < 0.25
    if source == "cli":
        p["coat"] = rnd.choice(ARTISAN_COAT)
        p["shirt"] = rnd.choice(ARTISAN_SHIRT)
        p["pants"] = rnd.choice(ARTISAN_PANTS)
        p["apron"] = rnd.choice(APRON)
        p["hat"] = rnd.choice(["cap", "bandana", "goggles", "none", "cap"])
        p["tool"] = rnd.choice(["hammer", "wrench", "tongs", "hammer"])
    else:
        p["coat"] = rnd.choice(SCHOLAR_ROBE)
        p["trim"] = rnd.choice(TRIM)
        p["mantle"] = rnd.choice(MANTLE)
        p["hat"] = rnd.choice(["pointed", "hood", "beret", "circlet", "pointed", "none"])
        p["tool"] = rnd.choice(["staff-orb", "staff-crystal", "book", "staff-crook"])
    p["scarf_color"] = rnd.choice(["#C9473F", "#3F6FC9", "#E2BC5A", "#4FA05C", "#8A62C9"])
    p["height"] = rnd.uniform(0.95, 1.05)
    return p


# --------------------------------------------------------------------------- poses

POSE = {
    #           shoulderL, elbowL, shoulderR, elbowR, head_pitch, head_yaw, head_roll, lean, mode
    "working": (25, 40, 75, 55, -20, 0, 0, 8, "stand"),
    "idle": (6, 10, 8, 12, 0, 25, 0, 0, "stand"),
    "approval": (10, 15, 165, 10, 8, 160, 0, -3, "stand"),
    "input": (12, 20, 110, 95, 6, 70, 16, 0, "stand"),
    "error": (-5, 30, -5, 30, -28, 0, -18, 12, "sit"),
    "offline": (5, 5, 5, 5, 0, 0, 0, 0, "lie"),
}
FRAMES = {
    "working": [(0, 0, 0, 0, 0, 0, 0), (0, 0, -35, 25, 4, 0, 0), (0, 0, -60, 40, 8, 0, 0), (0, 0, -25, 15, 2, 0, 0)],
    "idle": [(0, 0, 0, 0, 0, 0, 0), (2, 0, -2, 0, 0, 6, 0), (0, 0, 0, 0, 0, 12, 0), (-2, 0, 2, 0, 0, 4, 0)],
    "approval": [(0, 0, 0, 0, 0, 0, 0), (0, 0, 8, 0, 4, 0, 0), (0, 0, 0, 0, 0, 0, 0), (0, 0, -8, 0, -2, 0, 0)],
    "input": [(0, 0, 0, 0, 0, 0, 0), (0, 0, 4, 5, 0, 6, 4), (0, 0, 8, 10, 0, 10, 8), (0, 0, 3, 4, 0, 4, 3)],
    "error": [(0, 0, 0, 0, 0, 0, 0), (0, 0, 0, 0, 0, 8, 6), (0, 0, 0, 0, 0, -8, -6), (0, 0, 0, 0, 0, 0, 0)],
    "offline": [(0, 0, 0, 0, 0, 0, 0)] * 4,
}
SCALE = 1.3


def _smooth(o, levels=1):
    m = o.modifiers.new("sub", "SUBSURF")
    m.levels = 0
    m.render_levels = levels
    for poly in o.data.polygons:
        poly.use_smooth = True
    return o


# --------------------------------------------------------------------------- body parts


def _limb(parent, name, length, r0, r1, mat, rot_x=0.0, loc=(0, 0, 0)):
    """A limb segment hanging down from a pivot (rotation about X: +forward)."""
    g = parent.sub(name, loc)
    g.e.rotation_euler = (math.radians(rot_x), 0, 0)
    _smooth(g.cyl("seg", r0, length, (0, 0, -length), mat, 14, r2=r1))
    g.sph("joint", r1 * 1.05, (0, 0, -length), mat, seg=12)
    return g


def _hand(g, z, mat, side):
    h = g.sub("hand", (0, 0, z))
    _smooth(h.sph("palm", 0.042, (0, 0.0, -0.035), mat, scale=(0.9, 0.75, 1.15), seg=12))
    _smooth(h.sph("thumb", 0.017, (-side * 0.03, 0.022, -0.025), mat, scale=(1, 1, 1.6), seg=8))
    return h


def _tool(h, p):
    t = p["tool"]
    if t == "hammer":
        h.bar("handle", (0, 0, -0.04), (0, 0.3, -0.06), 0.014, wood("#7A4E2E"), 8)
        h.box("head", (0.07, 0.07, 0.16), (0, 0.31, -0.14), metal("#5A5E66"), 0.012)
    elif t == "wrench":
        h.bar("shaft", (0, 0, -0.04), (0, 0.28, -0.05), 0.012, metal("#9AA0A8"), 8)
        h.cyl("jaw", 0.04, 0.03, (0, 0.3, -0.05), metal("#9AA0A8"), 10, rot=(0, 90, 0))
    elif t == "tongs":
        for s in (-1, 1):
            h.bar(f"arm{s}", (s * 0.01, 0, -0.04), (s * 0.03, 0.3, -0.05), 0.008, metal("#3C3F45"), 6)
    elif t == "book":
        h.box("book", (0.16, 0.05, 0.21), (0, 0.06, -0.1), leather(p["trim"]), 0.008)
        h.box("pages", (0.15, 0.052, 0.19), (0, 0.065, -0.095), cmat("paper", "#F3EBD6", 0.9), 0.004)
    else:  # staffs
        h.bar("staff", (0, -0.08, 0.05), (0, 0.1, -1.05), 0.016, wood("#6E4A2C"), 8)
        top = Vector((0, -0.09, 0.09))
        if t == "staff-orb":
            h.sph("orb", 0.055, tuple(top), gloss("#7FD3F2"), seg=14)
            h.cyl("cup", 0.04, 0.04, (0, -0.085, 0.03), metal(p["trim"]), 10)
        elif t == "staff-crystal":
            h.sph("crystal", 0.05, tuple(top), gloss("#B7A2F2"), scale=(0.7, 0.7, 1.6), seg=6)
        else:
            h.bar("crook", tuple(top - Vector((0, 0, 0.04))), (0, -0.0, 0.16), 0.014, wood("#6E4A2C"), 8)
            h.bar("crook2", (0, -0.0, 0.16), (0, 0.06, 0.1), 0.014, wood("#6E4A2C"), 8)


def _head(b, p, z, hp, hy, hr, closed=False):
    fam = p["family"]
    _, _, hs = FAMILY_SHAPE[fam]
    hd = b.sub("head", (0, 0, z))
    hd.e.rotation_mode = "ZXY"
    hd.e.rotation_euler = (math.radians(hp), math.radians(hr), math.radians(hy))
    sk = skin(p["skin"])
    r = 0.165 * hs
    _smooth(hd.sph("skull", r, (0, 0, r), sk, scale=(0.95 if fam == "elf" else 1.0, 0.98, 1.0), seg=20), 2)
    _smooth(hd.sph("jaw", r * 0.78, (0, 0.03, r * 0.62), sk, scale=(0.92, 0.9, 0.8), seg=16), 2)
    nose = 0.03 if fam == "dwarf" else 0.022
    _smooth(hd.sph("nose", nose, (0, r * 0.98, r * 0.86), sk, scale=(0.9, 1.0, 1.1), seg=10))
    # eyes: sclera, iris, pupil, catchlight
    for s in (-1, 1):
        ex, ez = s * r * 0.4, r * 1.07
        if closed:
            hd.box(f"lid{s}", (r * 0.32, 0.012, 0.012), (ex, r * 0.9, ez), cmat("ink", "#2A2028", 0.6), 0, rot=(0, 0, 0))
            continue
        hd.sph(f"sclera{s}", r * 0.2, (ex, r * 0.83, ez), gloss("#F8F5EE"), scale=(1, 0.5, 1.15), seg=12)
        hd.sph(f"iris{s}", r * 0.13, (ex, r * 0.92, ez - 0.003), gloss(p["eyes"]), scale=(1, 0.45, 1.15), seg=10)
        hd.sph(f"pupil{s}", r * 0.07, (ex, r * 0.955, ez - 0.003), gloss("#141014"), scale=(1, 0.4, 1.15), seg=8)
        hd.sph(f"glint{s}", r * 0.03, (ex + 0.01, r * 0.975, ez + 0.012), av.emit("glint", "#FFFFFF", 2.0), seg=6)
        hd.box(f"brow{s}", (r * 0.36, 0.02, 0.016), (ex, r * 0.92, ez + r * 0.3), hairm(p["hair_color"]), 0.005,
               rot=(0, s * -8, 0))
    hd.box("mouth", (r * 0.28, 0.01, 0.01), (0, r * 0.93, r * 0.52), cmat("lip", "#9C4B45", 0.5), 0.004)
    if p["freckles"]:
        for i in range(6):
            s = -1 if i < 3 else 1
            hd.sph(f"fr{i}", 0.005, (s * (r * 0.35 + (i % 3) * 0.012), r * 0.96, r * 0.78 + (i % 2) * 0.01), cmat("fr", "#B6704E", 0.7), seg=6)
    # ears
    if fam == "elf":
        for s in (-1, 1):
            _smooth(hd.cyl(f"ear{s}", 0.035, 0.16, (s * r * 0.95, 0.0, r * 0.95), sk, 10, r2=0.004, rot=(0, s * 70, 0)))
    elif p["ears"] in ("cat", "fox"):
        for s in (-1, 1):
            hd.cyl(f"ear{s}", 0.07 if p["ears"] == "fox" else 0.06, 0.15, (s * r * 0.55, 0, r * 1.75), sk, 4, r2=0.01, rot=(0, s * 18, 45))
            hd.cyl(f"earin{s}", 0.04, 0.1, (s * r * 0.55, 0.012, r * 1.78), cmat("inner", "#F1C6C2", 0.7), 4, r2=0.006, rot=(0, s * 18, 45))
    else:
        for s in (-1, 1):
            _smooth(hd.sph(f"ear{s}", 0.035, (s * r * 0.98, 0.0, r * 0.95), sk, scale=(0.5, 0.8, 1.1), seg=10))
    if p["earring"] and fam != "beastfolk":
        hd.cyl("earring", 0.012, 0.004, (r * 1.0, 0.0, r * 0.75), metal("#E2BC5A"), 12, rot=(0, 90, 0))
    _hair(hd, p, r)
    _hat(hd, p, r)
    if p["glasses"]:
        for s in (-1, 1):
            hd.cyl(f"lens{s}", r * 0.22, 0.008, (s * r * 0.4, r * 1.0, r * 1.07), gloss("#DDE8F0"), 16, rot=(90, 0, 0))
            hd.cyl(f"rim{s}", r * 0.24, 0.006, (s * r * 0.4, r * 0.995, r * 1.07), metal("#8A6A3A"), 16, rot=(90, 0, 0))
        hd.bar("bridge", (-r * 0.17, r * 1.0, r * 1.09), (r * 0.17, r * 1.0, r * 1.09), 0.006, metal("#8A6A3A"), 6)
    if p["beard"]:
        hc = hairm(p["hair_color"] if p["hair"] != "bald" else "#7E6A58")
        if p["beard"] in ("long", "braided"):
            _smooth(hd.sph("beard", r * 0.7, (0, r * 0.62, r * 0.35), hc, scale=(1.0, 0.7, 1.5), seg=14))
            if p["beard"] == "braided":
                for i in range(3):
                    hd.sph(f"bb{i}", r * 0.16, (0, r * 0.7, -r * 0.2 - i * r * 0.22), hc, seg=10)
                hd.cyl("bead", r * 0.12, r * 0.12, (0, r * 0.7, -r * 0.82), metal("#E2BC5A"), 12)
            hd.box("mous", (r * 0.6, 0.05, 0.045), (0, r * 0.95, r * 0.62), hc, 0.02)
        elif p["beard"] == "moustache":
            hd.box("mous", (r * 0.62, 0.05, 0.04), (0, r * 0.95, r * 0.62), hc, 0.02)
        elif p["beard"] == "goatee":
            _smooth(hd.sph("goatee", r * 0.2, (0, r * 0.88, r * 0.32), hc, scale=(0.8, 0.7, 1.3), seg=10))
        else:
            _smooth(hd.sph("beard", r * 0.82, (0, r * 0.34, r * 0.5), hc, scale=(1.0, 0.85, 0.85), seg=14))
    return hd


def _hair(hd, p, r):
    st = p["hair"]
    if st == "bald" or p["hat"] in ("hood",):
        return
    hc = hairm(p["hair_color"])
    _smooth(hd.sph("cap", r * 1.04, (0, -r * 0.08, r * 1.12), hc, scale=(1.02, 1.0, 0.82), seg=18), 2)
    _smooth(hd.sph("fringe", r * 0.55, (0, r * 0.55, r * 1.55), hc, scale=(1.4, 0.55, 0.55), seg=12))
    if st == "bob":
        for s in (-1, 1):
            _smooth(hd.sph(f"side{s}", r * 0.5, (s * r * 0.82, -r * 0.05, r * 0.85), hc, scale=(0.5, 1.0, 1.25), seg=12))
    elif st == "ponytail":
        for i in range(4):
            _smooth(hd.sph(f"pt{i}", r * (0.28 - i * 0.04), (0, -r * (1.05 + i * 0.12), r * (1.2 - i * 0.32)), hc, seg=10))
        hd.cyl("tie", r * 0.2, r * 0.12, (0, -r * 0.98, r * 1.2), cloth(p["scarf_color"]), 10, rot=(80, 0, 0))
    elif st == "bun":
        _smooth(hd.sph("bun", r * 0.36, (0, -r * 0.6, r * 1.85), hc, seg=12))
    elif st == "spiky":
        for i in range(7):
            a = -1.3 + i * 0.43
            hd.cyl(f"sp{i}", r * 0.18, r * 0.5, (math.sin(a) * r * 0.6, -r * 0.2 + math.cos(a) * r * 0.1, r * 1.65), hc, 6, r2=0.005,
                   rot=(-20, math.degrees(a) * 0.5, 0))
    elif st == "long":
        _smooth(hd.sph("back", r * 0.9, (0, -r * 0.55, r * 0.45), hc, scale=(1.0, 0.55, 1.5), seg=14))
    elif st == "braid":
        for i in range(5):
            _smooth(hd.sph(f"br{i}", r * 0.17, (r * 0.55, -r * 0.55, r * (0.6 - i * 0.28)), hc, seg=8))
    if p["family"] == "halfling":
        for i in range(6):
            a = i * 1.05
            _smooth(hd.sph(f"curl{i}", r * 0.26, (math.cos(a) * r * 0.75, math.sin(a) * r * 0.6 - r * 0.2, r * 1.35), hc, seg=8))


def _hat(hd, p, r):
    h = p["hat"]
    if p["source"] == "cli":
        if h == "cap":
            c = cloth(p["coat"])
            _smooth(hd.sph("cap", r * 1.1, (0, -r * 0.05, r * 1.3), c, scale=(1.0, 1.0, 0.62), seg=18), 2)
            hd.box("visor", (r * 1.1, r * 0.6, 0.02), (0, r * 0.9, r * 1.33), c, 0.02, rot=(-10, 0, 0))
            hd.sph("button", 0.015, (0, -r * 0.05, r * 1.9), c)
        elif h == "bandana":
            c = cloth(p["scarf_color"])
            _smooth(hd.sph("band", r * 1.06, (0, -r * 0.05, r * 1.3), c, scale=(1.0, 1.0, 0.55), seg=16))
            hd.sph("knot", r * 0.18, (0, -r * 1.0, r * 1.2), c, seg=8)
        elif h == "goggles":
            hd.cyl("strap", r * 1.03, r * 0.16, (0, 0, r * 1.38), leather("#4A3326"), 20)
            for s in (-1, 1):
                hd.cyl(f"gog{s}", r * 0.22, r * 0.14, (s * r * 0.38, r * 0.92, r * 1.48), metal("#B08A4A"), 14, rot=(90, 0, 0))
                hd.cyl(f"glass{s}", r * 0.17, r * 0.02, (s * r * 0.38, r * 1.06, r * 1.48), gloss("#8FD0E8"), 14, rot=(90, 0, 0))
    else:
        c = cloth(p["coat"])
        if h == "pointed":
            hd.cyl("brim", r * 1.6, 0.03, (0, 0, r * 1.62), c, 24)
            hd.cyl("band", r * 0.98, r * 0.18, (0, 0, r * 1.64), cloth(p["trim"]), 20)
            hd.cyl("cone", r * 0.95, r * 1.4, (0, 0, r * 1.64), c, 20, r2=r * 0.28)
            hd.cyl("tip", r * 0.3, r * 0.6, (0, -r * 0.1, r * 2.95), c, 10, r2=0.01, rot=(-38, 0, 0))
            hd.box("buckle", (r * 0.3, 0.02, r * 0.18), (0, r * 0.98, r * 1.64), metal(p["trim"]), 0.005)
        elif h == "hood":
            _smooth(hd.sph("hood", r * 1.22, (0, -r * 0.15, r * 1.05), cloth(p["mantle"]), scale=(1.0, 1.05, 1.08), seg=18), 2)
            hd.sph("hoodtip", r * 0.3, (0, -r * 1.2, r * 1.5), cloth(p["mantle"]), seg=8)
        elif h == "beret":
            _smooth(hd.sph("beret", r * 1.1, (r * 0.15, -r * 0.05, r * 1.55), c, scale=(1.1, 1.1, 0.4), seg=16))
            hd.sph("stalk", 0.015, (r * 0.15, -r * 0.05, r * 1.8), c)
        elif h == "circlet":
            hd.cyl("circlet", r * 1.02, r * 0.06, (0, 0, r * 1.3), metal(p["trim"]), 24)
            hd.sph("gem", r * 0.08, (0, r * 1.02, r * 1.34), gloss("#5FC9E0"), seg=8)


def villager(p, name, loc, yaw, state, per, frame=0, col="bots"):
    """Build one villager from a persona. Local +Y = facing."""
    sL, eL, sR, eR, hp, hy, hr, lean, mode = POSE[state]
    d = FRAMES[state][frame]
    sL, eL, sR, eR, hp, hy, hr = sL + d[0], eL + d[1], sR + d[2], eR + d[3], hp + d[4], hy + d[5], hr + d[6]
    fam = per["family"]
    H, W, _ = FAMILY_SHAPE[fam]
    H *= per["height"]
    root = G(name, loc, yaw, parent=p, col=col)
    root.e["bot"] = name
    root.e.scale = (SCALE * W, SCALE * W, SCALE * H)
    cli = per["source"] == "cli"
    coat = cloth(per["coat"])
    sk = skin(per["skin"])
    body = root.sub("body")
    if mode == "lie":
        body.e.location = (0, -0.45, 0.2)
        body.e.rotation_euler = (math.radians(-86), 0, 0)
    elif mode == "sit":
        body.e.location = (0, 0, -0.36)
        body.e.rotation_euler = (math.radians(lean), 0, 0)
    else:
        body.e.rotation_euler = (math.radians(lean), 0, 0)
    # legs and feet
    bare = fam == "halfling"
    pants = cloth(per.get("pants", "#3E3A50"))
    for s in (-1, 1):
        if mode == "sit":
            leg = _limb(body, f"leg{s}", 0.36, 0.06, 0.05, pants, rot_x=-82, loc=(s * 0.08, 0, 0.42))
        else:
            leg = _limb(body, f"leg{s}", 0.36, 0.062, 0.05, pants, loc=(s * 0.08, 0, 0.44))
        if bare:
            _smooth(leg.sph("foot", 0.07, (0, 0.04, -0.38), sk, scale=(0.85, 1.5, 0.55), seg=12))
            for t in range(3):
                leg.sph(f"toe{t}", 0.016, ((t - 1) * 0.022, 0.12, -0.39), sk, seg=6)
        else:
            boot = leather(per.get("apron", "#4A3326") if cli else "#3A2A22")
            _smooth(leg.cyl("boot", 0.062, 0.12, (0, 0, -0.42), boot, 14))
            _smooth(leg.sph("toe", 0.06, (0, 0.05, -0.41), boot, scale=(0.95, 1.5, 0.6), seg=12))
            leg.box("sole", (0.11, 0.2, 0.02), (0, 0.03, -0.445), leather("#2A1F1A"), 0.008)
            leg.cyl("cuff", 0.068, 0.025, (0, 0, -0.31), boot, 14)
    # torso
    if cli:
        shirt = cloth(per["shirt"])
        _smooth(body.cyl("torso", 0.15, 0.36, (0, 0, 0.42), shirt, 18, r2=0.14), 2)
        _smooth(body.cyl("vest", 0.155, 0.3, (0, -0.005, 0.46), coat, 18, r2=0.145), 2)
        body.box("vestgap", (0.025, 0.012, 0.28), (0, 0.152, 0.47), shirt, 0.005)
        for i in range(3):
            body.sph(f"btn{i}", 0.011, (0.04, 0.158, 0.55 + i * 0.07), metal("#C9A44A"), seg=6)
        body.box("collar", (0.2, 0.1, 0.05), (0, 0.04, 0.77), shirt, 0.02)
        body.box("apron", (0.24, 0.02, 0.36), (0, 0.155, 0.3), leather(per["apron"]), 0.015)
        body.box("pocket", (0.1, 0.012, 0.07), (0, 0.168, 0.4), leather(per["apron"]), 0.006)
        body.cyl("belt", 0.158, 0.05, (0, 0, 0.45), leather("#3A2A20"), 18)
        body.box("buckle", (0.05, 0.02, 0.04), (0, 0.16, 0.455), metal("#C9A44A"), 0.004)
        for i, a in enumerate((-60, 60, 150)):
            x, y = math.sin(math.radians(a)) * 0.165, math.cos(math.radians(a)) * 0.165
            body.box(f"pouch{i}", (0.06, 0.04, 0.07), (x, y, 0.4), leather("#6B4A30"), 0.01, rot=(0, 0, -a))
    else:
        trim = cloth(per["trim"])
        robe_r = lambda z: 0.24 - (z - 0.06) / 0.72 * 0.1  # bell: radius at height z
        body.cyl("robe", 0.24, 0.72, (0, 0, 0.06), coat, 40, r2=0.14)
        body.cyl("hem", robe_r(0.07) + 0.004, 0.03, (0, 0, 0.06), trim, 40, r2=robe_r(0.1) + 0.004)
        body.cyl("sash", robe_r(0.46) + 0.004, 0.05, (0, 0, 0.44), trim, 40, r2=robe_r(0.49) + 0.004)
        for i in range(4):  # a row of clasps down the front opening
            z = 0.2 + i * 0.12
            body.sph(f"clasp{i}", 0.014, (0, robe_r(z) + 0.004, z), metal(per["trim"]), seg=8)
        _smooth(body.cyl("mantle", 0.2, 0.12, (0, 0, 0.66), cloth(per["mantle"]), 18, r2=0.12))
        body.sph("clasp", 0.022, (0, 0.18, 0.74), metal(per["trim"]), seg=8)
    if per["scarf"]:
        _smooth(body.cyl("scarf", 0.12, 0.07, (0, 0, 0.76), cloth(per["scarf_color"]), 16))
        body.box("scarfend", (0.06, 0.02, 0.2), (0.06, 0.12, 0.6), cloth(per["scarf_color"]), 0.01, rot=(0, 8, 0))
    if per["satchel"]:
        body.bar("strap", (-0.13, 0.12, 0.76), (0.15, -0.1, 0.42), 0.012, leather("#5A3B26"), 6)
        body.box("bag", (0.06, 0.18, 0.14), (0.19, -0.04, 0.36), leather("#7A5233"), 0.02)
    if per["tail"]:
        for i in range(6):
            t = i / 5
            body.sph(f"tail{i}", 0.05 * (1 - t * 0.4), (0.04 * math.sin(t * 3), -0.17 - t * 0.2, 0.42 + math.sin(t * 2.4) * 0.2), sk, seg=10)
    for s in (-1, 1):  # shoulders: rounded, so the torso is not a tube
        _smooth(body.sph(f"shoulder{s}", 0.075, (s * 0.15, 0, 0.72), coat if (not cli or True) else coat, scale=(1.1, 1.0, 0.8), seg=14))
    _smooth(body.cyl("neck", 0.05, 0.08, (0, 0, 0.76), sk, 12))
    # arms: shoulder -> elbow -> hand
    sleeve = coat if not cli else shirt
    for s, sh, el in ((-1, sL, eL), (1, sR, eR)):
        upper = _limb(body, f"arm{s}", 0.2, 0.048, 0.042, sleeve, rot_x=sh, loc=(s * 0.19, 0, 0.73))
        if not cli:
            _smooth(upper.cyl("cuff", 0.07, 0.12, (0, 0, -0.2), coat, 14, r2=0.09))
        fore = _limb(upper, "fore", 0.17, 0.042, 0.036, sk if cli else coat, rot_x=el, loc=(0, 0, -0.2))
        h = _hand(fore, -0.17, sk, s)
        if s == 1:
            _tool(h, per)
    if mode == "sit":
        pass
    _head(body, per, 0.8, hp, hy, hr, closed=(state == "offline"))
    if state == "error":  # dazed: little stars circle the head
        hd = body.e
        for i in range(3):
            a = i * 2.09 + frame * 0.5
            body.sph(f"star{i}", 0.035, (math.cos(a) * 0.24, math.sin(a) * 0.24, 1.32), av.emit("star", "#FFD66B", 3.0), scale=(1, 1, 0.5), seg=6)
    return root
