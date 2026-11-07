"""Render jobs for the Agent Village v2 art. Run with Blender's Python (bpy 5.2).

  python render.py preview  <out>   quick full scene with bots, 1x, low samples
  python render.py scene    <out>   base layer + one layer per bot + scene.json (anchors)
  python render.py zoom     <out>   same, camera zoomed on one project (Warehouse)
  python render.py states   <out>   station sprites: 2 bots x 6 states x 4 frames
  python render.py props    <out>   one transparent render per asset for the asset sheet
"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import av  # noqa: E402

JOB = sys.argv[1]
OUT = Path(sys.argv[2]).resolve()
OUT.mkdir(parents=True, exist_ok=True)
SAMPLES = int(dict(a.split("=") for a in sys.argv[3:] if "=" in a).get("samples", 160))
av.SCREEN_DIR = str(Path(__file__).resolve().parent.parent / "renders" / "screens")


def build(overrides=None, walker=True):
    av.reset()
    av.M.update(av.mats())
    world = av.G("world")
    av.building(world)
    stations = {}
    R = av.furnish(world, stations)
    placed = av.place_bots(world, R, stations, overrides, walker)
    for bid, (b, proj, src, state, st) in placed.items():
        av.set_screen(st, state)
    return world, R, stations, placed


def autoframe(objs, margin=24, scale=1.0):
    """Shift the ortho camera so objs are centred; size the frame to fit (1x px)."""
    sc = bpy.context.scene
    cam = sc.camera
    x0, y0, x1, y1 = av.bbox_px(objs, 0)
    W, H = sc.render.resolution_x, sc.render.resolution_y
    dx, dy = (x0 + x1) / 2 - W / 2, (y0 + y1) / 2 - H / 2
    m = cam.matrix_world.to_3x3()
    cam.location += (m @ Vector((1, 0, 0))) * dx / av.PX_PER_M + (m @ Vector((0, -1, 0))) * dy / av.PX_PER_M
    w, h = int(x1 - x0 + 2 * margin), int(y1 - y0 + 2 * margin)
    bpy.context.view_layer.update()
    return w, h


def set_frame(w, h, scale):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = int(w * scale), int(h * scale)
    sc.camera.data.ortho_scale = max(w, h) / av.PX_PER_M


def objs_named(prefix):
    return [o for o in bpy.data.objects if o.name.startswith(prefix)]


def mode_layer(bot_root, catch=True):
    """Show only one bot (and its screen) against the scene as a shadow catcher."""
    keep = set(bot_root.children_recursive) | {bot_root}
    for o in bpy.data.objects:
        if o.type not in ("MESH",):
            continue
        in_bots = o.users_collection[0].name == "bots"
        if in_bots:
            o.hide_render = o not in keep
            o.is_shadow_catcher = False
        else:
            o.hide_render = False
            o.is_shadow_catcher = catch and not o.get("_lit_screen")


def mode_base():
    for o in bpy.data.objects:
        if o.type == "MESH":
            in_bots = o.users_collection[0].name == "bots"
            o.hide_render = in_bots
            o.is_shadow_catcher = False


def screens_off(placed):
    """Base layer shows every monitor dark; lit screens travel with the bot layer."""
    for bid, (b, proj, src, state, st) in placed.items():
        av.set_screen(st, "offline") if st else None


def anchors(placed, R):
    out = {"bots": {}, "projects": {}}
    for bid, (b, proj, src, state, st) in placed.items():
        e = b.e
        meshes = [o for o in e.children_recursive if o.type == "MESH"]
        zmax = max((o.matrix_world @ Vector(c)).z for o in meshes for c in o.bound_box)
        p = e.matrix_world.translation
        out["bots"][bid] = {"project": proj, "source": src, "state": state,
                            "head": av.project((p.x, p.y, zmax + 0.08)), "foot": av.project((p.x, p.y, 0)),
                            "depth": round(p.x + p.y, 3)}
    out["bots"] = {k: v for k, v in out["bots"].items() if v["project"] or k == "claude-app"}
    for k, (x0, x1, y0, y1) in av.ROOMS.items():
        h = av.WALL_H if (x0 == 0 or y0 == 0) else av.CUT_H
        out["projects"][k] = {"plate": av.project((x0 + 0.15, y0 + 0.15, h + 0.2)),
                              "center": av.project(((x0 + x1) / 2, (y0 + y1) / 2, 0)),
                              "poly": [av.project(p) for p in ((x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0))]}
    return out


def layered(tag, scale, focus=None, zoom=1.0, overrides=None, walker=True):
    world, R, stations, placed = build(overrides, walker)
    av.setup_render((1000, 700), SAMPLES)
    av.camera((av.FLOOR[0] / 2, av.FLOOR[1] / 2, 0.5), (1000, 700))
    frame_objs = objs_named("world.building.plinth") + objs_named("world.building.wallX0") + objs_named("world.building.wallY0")
    w, h = autoframe(frame_objs, 28)
    if focus:  # zoom: centre on one room, keep the same camera angle
        x0, x1, y0, y1 = av.ROOMS[focus]
        cam = bpy.context.scene.camera
        tgt = Vector(((x0 + x1) / 2 + 0.4, (y0 + y1) / 2 + 0.2, 0.9))
        fwd = cam.matrix_world.to_3x3() @ Vector((0, 0, -1))
        cam.location = tgt - fwd * 60
        w, h = focus_size
    set_frame(w, h, scale)
    bpy.context.view_layer.update()  # refresh camera matrix before projecting anchors
    # lit screens belong to bot layers
    lit = {}
    for bid, (b, proj, src, state, st) in placed.items():
        lit[bid] = av.set_screen(st, state) if st else []
    meta = {"frame": [bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y], "scale": scale,
            "px_per_m_1x": av.PX_PER_M, "layers": []}
    meta.update(anchors(placed, R))
    # base
    for bid in lit:
        for o in lit[bid]:
            o.hide_render = True
    mode_base()
    for bid in lit:
        for o in lit[bid]:
            o.hide_render = True
    if True:
        av.render_to(OUT / f"{tag}-base.png")
    # one layer per bot, cropped to its box; its lit screen rides along
    for bid, (b, proj, src, state, st) in placed.items():
        mode_layer(b.e)
        for other in lit:
            for o in lit[other]:
                o.hide_render = other != bid
                o.is_shadow_catcher = False
        objs = [o for o in b.e.children_recursive if o.type == "MESH"] + lit[bid]
        box = av.bbox_px(objs, 10 * scale)
        box[3] += 14 * scale  # room for the contact shadow
        box[0] -= 20 * scale
        box[2] += 20 * scale
        crop = av.render_to(OUT / f"{tag}-bot-{bid}.png", box)
        if crop is None:
            continue
        meta["layers"].append({"id": bid, "file": f"{tag}-bot-{bid}.png", "x": crop[0], "y": crop[1], "w": crop[2], "h": crop[3],
                               "depth": meta["bots"][bid]["depth"]})
    (OUT / f"{tag}.json").write_text(json.dumps(meta, indent=1))


if JOB == "preview":
    world, R, stations, placed = build()
    av.setup_render((1000, 700), SAMPLES)
    av.camera((av.FLOOR[0] / 2, av.FLOOR[1] / 2, 0.5), (1000, 700))
    w, h = autoframe(objs_named("world.building.plinth") + objs_named("world.building.wallX0") + objs_named("world.building.wallY0"), 28)
    sc = float(dict(a.split("=") for a in sys.argv[3:] if "=" in a).get("scale", 1))
    set_frame(w, h, sc)
    print("FRAME", w, h)
    room = dict(a.split("=") for a in sys.argv[3:] if "=" in a).get("room")
    box = None
    if room:
        objs = [o for o in bpy.data.objects if o.type == "MESH" and (o.name.startswith(f"world.{room}.") or o.name.startswith(f"world.{room}"))]
        objs += [o for o in bpy.data.objects if o.type == "MESH" and any(p.name == f"world.{room}" for p in [o.parent] if p)]
        box = av.bbox_px(objs, 20)
    av.render_to(OUT / f"preview{('-' + room) if room else ''}.png", box)
elif JOB == "scene":
    layered("scene", 2.0)
elif JOB == "reduced":
    layered("reduced", 2.0, walker=False)
elif JOB == "zoom":
    focus_size = (620, 560)  # 1x frame in world px; rendered at 3x so the browser can show it at ~1.6x
    layered("zoom", 3.0, focus="warehouse", zoom=1.0)


# --------------------------------------------------------------------------- isolated renders

def studio(floor=True, catcher=True, size=(3.0, 2.6)):
    av.reset()
    av.M.update(av.mats())
    w = av.G("world")
    if floor:
        f = w.box("floor", (size[0], size[1], 0.06), (0, 0.3, -0.06), av.M["concrete"], 0.01)
        f.is_shadow_catcher = catcher
    w.light("key", "AREA", (-1.5, -2.0, 5.0), 260, "#DCE6FF", size=4.0, rot=(-20, 15, 0))
    w.light("ceil", "AREA", (0.3, 0.6, 3.1), 260, "#FFE2BF", size=2.2)
    w.light("fill", "AREA", (5, 5, 3.0), 90, "#FFE2C2", size=4.0, rot=(-60, 0, 135))
    for o in av.coll("lights").objects:
        o.visible_camera = False
    return w


def frame_on(objs, scale=2.0, margin=8):
    av.setup_render((400, 400), SAMPLES)
    dg = bpy.context.evaluated_depsgraph_get()
    pts = [o.evaluated_get(dg).matrix_world @ Vector(c) for o in objs if o.type == "MESH" for c in o.evaluated_get(dg).bound_box]
    ctr = sum(pts, Vector()) / len(pts)
    av.camera(tuple(ctr), (400, 400))
    w, h = autoframe([o for o in objs if o.type == "MESH"], margin)
    set_frame(w, h, scale)


def meshes(g):
    return [o for o in g.e.children_recursive if o.type == "MESH"]


def fixed_cam(px=140):
    """Same camera, scale and anchor for every sprite frame: foot at (0, 0.3, 0)."""
    av.setup_render((px * 2, px * 2), SAMPLES)
    av.camera((0, 0.3, 0.78), (px, px))
    set_frame(px, px, 2.0)


ONLY = dict(a.split("=") for a in sys.argv[3:] if "=" in a).get("only")
STATES = ["working", "idle", "approval", "input", "error", "offline"]

if JOB == "parked":  # reduced motion: the walker waits at its station instead of walking
    world, R, stations, placed = build(walker=False)
    av.setup_render((1000, 700), SAMPLES)
    av.camera((av.FLOOR[0] / 2, av.FLOOR[1] / 2, 0.5), (1000, 700))
    w, h = autoframe(objs_named("world.building.plinth") + objs_named("world.building.wallX0") + objs_named("world.building.wallY0"), 28)
    set_frame(w, h, 2.0)
    b = av.bot_codex(R["connector"], "release-notes", (1.35, 4.85, 0), 90, "idle")
    mode_layer(b.e)
    box = av.bbox_px(meshes(b), 20)
    box[3] += 28
    crop = av.render_to(OUT / "parked-bot-release-notes.png", box)
    p = b.e.matrix_world.translation
    (OUT / "parked.json").write_text(json.dumps({"layers": [{"id": "release-notes", "file": "parked-bot-release-notes.png", "x": crop[0], "y": crop[1],
                                                            "w": crop[2], "h": crop[3], "depth": round(p.x + p.y, 3)}]}, indent=1))

elif JOB == "states":
    for src in ("cli", "codex"):
        for st in STATES:
            # full station: floor patch, desk, monitor, bot
            w = studio(catcher=False, size=(2.3, 2.1))
            d = av.desk(w, "desk", (0, 0, 0), 0, seed=3)
            av.task_lamp(w, "lamp", (-0.62, -0.2, 0.74), 40)
            av.set_screen(d, st)
            b = av.BOT_FN[src](w, "bot", (0, 0.82, 0), 180, st)
            if st == "error":
                av.warn_triangle(b, "warn", (0.5, -0.1, 0), 140)
            frame_on(meshes(w), 3.5, 6)
            av.render_to(OUT / f"station-{src}-{st}.png")
            if ONLY == "stations":
                continue
            # frames: bot alone over a shadow catcher
            for f in range(1 if st == "offline" else 4):
                w = studio(catcher=True, size=(1.6, 1.6))
                b = av.BOT_FN[src](w, "bot", (0, 0.3, 0), 200, st, frame=f)
                if st == "error":
                    av.warn_triangle(b, "warn", (0.5, -0.1, 0), 140)
                fixed_cam()
                av.render_to(OUT / f"frame-{src}-{st}-f{f}.png")
    if ONLY != "stations":
        w = studio(catcher=True, size=(1.6, 1.6))
        av.bot_app(w, "bot", (0, 0.3, 0), 200)
        fixed_cam()
        av.render_to(OUT / "frame-app-offline-f0.png")

elif JOB == "props":
    items = [
        ("desk", lambda w: av.desk(w, "x", seed=3)),
        ("task-lamp", lambda w: av.task_lamp(w, "x", (0, 0, 0), 30)),
        ("floor-lamp", lambda w: av.floor_lamp(w, "x", (0, 0, 0))),
        ("plant-floor", lambda w: av.plant(w, "x", (0, 0, 0), 1.5, seed=4)),
        ("plant-desk", lambda w: av.plant(w, "x", (0, 0, 0), 0.45, seed=6, pot="clay")),
        ("shelving-archive", lambda w: av.shelving(w, "x", (0, 0, 0), 0, w=2.0, seed=1)),
        ("shelving-bins", lambda w: av.shelving(w, "x", (0, 0, 0), 0, w=1.8, levels=4, h=1.6, fill="bins", seed=5, tint="connector")),
        ("pinboard", lambda w: av.pinboard(w, "x", (0, 0, 1.0), 0, w=2.0)),
        ("lockers", lambda w: av.lockers(w, "x", (0, 0, 0), 0, n=4)),
        ("filing-cabinet", lambda w: av.filing(w, "x", (0, 0, 0), 0)),
        ("safe", lambda w: av.safe(w, "x", (0, 0, 0), 0)),
        ("shredder", lambda w: av.shredder(w, "x", (0, 0, 0), 0)),
        ("workbench", lambda w: av.workbench(w, "x", (0, 0, 0), 0, w=2.4)),
        ("cable-spool", lambda w: av.spool(w, "x", (0, 0, 0), 0.32, rot=30)),
        ("server-rack", lambda w: av.rack(w, "x", (0, 0, 0), 0)),
        ("pallet-rack", lambda w: av.pallet_rack(w, "x", (0, 0, 0), 0)),
        ("whiteboard", lambda w: av.whiteboard(w, "x", (0, 0, 0), 0)),
        ("sofa", lambda w: av.sofa(w, "x", (0, 0, 0), 0)),
        ("coffee-table", lambda w: av.coffee_table(w, "x", (0, 0, 0), 0)),
        ("reading-table", lambda w: av.reading_table(w, "x", (0, 0, 0), 0)),
        ("warning-triangle", lambda w: av.warn_triangle(w, "x", (0, 0, 0), 20)),
        ("bot-cli", lambda w: av.bot_cli(w, "x", (0, 0, 0), 200, "working")),
        ("bot-codex", lambda w: av.bot_codex(w, "x", (0, 0, 0), 200, "working")),
        ("bot-app-dock", lambda w: av.bot_app(w, "x", (0, 0, 0), 200)),
    ]
    meta = []
    for name, fn in items:
        w = studio(catcher=True, size=(4.0, 3.0))
        g = fn(w)
        frame_on(meshes(g), 4.0, 6)
        a = av.project((g.e.matrix_world.translation.x, g.e.matrix_world.translation.y, 0))
        av.render_to(OUT / f"{name}.png")
        sc = bpy.context.scene.render
        meta.append({"file": f"{name}.webp", "scale": 4, "size_px": [sc.resolution_x, sc.resolution_y], "anchor_px": a})
    (OUT / "props.json").write_text(json.dumps(meta, indent=1))
