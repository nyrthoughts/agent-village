"""Render jobs for the JRPG direction. Run with Blender's Python (bpy 5.2).

  python rpg_render.py preview <out> [scale=1 samples=32]
  python rpg_render.py scene   <out>     base layer + one layer per villager + scene.json
  python rpg_render.py zoom    <out>     camera zoomed on Warehouse
  python rpg_render.py parked  <out>     reduced motion: the walker waits at its station
  python rpg_render.py states  <out>     station renders and 4 frames per state
  python rpg_render.py props   <out>     one render per asset
"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "village-v3" / "blender"))  # shared helpers: av.py
import av  # noqa: E402
import jrpg as J  # noqa: E402

JOB = sys.argv[1]
OUT = Path(sys.argv[2]).resolve()
OUT.mkdir(parents=True, exist_ok=True)
ARGS = dict(a.split("=") for a in sys.argv[3:] if "=" in a)
SAMPLES = int(ARGS.get("samples", 64))


def build(overrides=None, walker=True):
    av.reset()
    J._T.clear()
    av.M.update(av.mats())
    J.palette()
    world = av.G("world")
    stations = {}
    R = J.build_village(world, stations)
    placed = J.place(world, R, stations, overrides, walker)
    J.lights(world)
    J.outline_all()
    bpy.context.view_layer.update()
    return world, R, placed


def frame_area(margin=0):
    X, Y = J.AREA
    pts = [Vector((x, y, z)) for x in (-1.0, X + 1.0) for y in (-1.0, Y + 1.0) for z in (0, 3.5)]
    xs, ys = zip(*[av.project(p) for p in pts])
    return [min(xs) - margin, min(ys) - margin, max(xs) + margin, max(ys) + margin]


def autoframe(box, margin=0):
    sc = bpy.context.scene
    cam = sc.camera
    x0, y0, x1, y1 = box
    W, H = sc.render.resolution_x, sc.render.resolution_y
    dx, dy = (x0 + x1) / 2 - W / 2, (y0 + y1) / 2 - H / 2
    m = cam.matrix_world.to_3x3()
    cam.location += (m @ Vector((1, 0, 0))) * dx / av.PX_PER_M + (m @ Vector((0, -1, 0))) * dy / av.PX_PER_M
    bpy.context.view_layer.update()
    return int(x1 - x0 + 2 * margin), int(y1 - y0 + 2 * margin)


def set_frame(w, h, scale):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = int(w * scale), int(h * scale)
    sc.camera.data.ortho_scale = max(w, h) / av.PX_PER_M
    bpy.context.view_layer.update()


def start_camera(w=1200, h=800):
    J.setup((w, h), SAMPLES)
    J.lights(None)
    av.camera((J.AREA[0] / 2, J.AREA[1] / 2, 0.5), (w, h))


def meshes(e):
    return [o for o in e.children_recursive if o.type == "MESH"]


def mode_base():
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_render = o.users_collection[0].name == "bots"
            o.is_shadow_catcher = False


def mode_layer(root):
    keep = set(root.children_recursive) | {root}
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        if o.users_collection[0].name == "bots":
            o.hide_render = o not in keep
            o.is_shadow_catcher = False
        else:
            o.hide_render = False
            o.is_shadow_catcher = True


def anchors(placed):
    out = {"bots": {}, "projects": {}}
    for bid, (b, proj, src, state, st) in placed.items():
        ms = meshes(b.e)
        zmax = max((o.matrix_world @ Vector(c)).z for o in ms for c in o.bound_box)
        p = b.e.matrix_world.translation
        out["bots"][bid] = {"project": proj, "source": src, "state": state, "head": av.project((p.x, p.y, zmax + 0.1)),
                            "foot": av.project((p.x, p.y, 0)), "depth": round(p.x + p.y, 3)}
    for k, v in J.PROJECTS.items():
        x, y = v["at"]
        h = 0.25 + 2.1 * v["floors"] + min(v["w"], v["d"]) * 0.5 + 0.6
        rx, ry = max(v["w"], v["d"]) / 2 + 0.6, max(v["w"], v["d"]) / 2 + 0.6
        out["projects"][k] = {"roof": av.project((x, y, h)), "center": av.project((x, y, 0)),
                              "poly": [av.project(p) for p in ((x - rx, y - ry, 0), (x + rx, y - ry, 0), (x + rx, y + ry + 2.8, 0), (x - rx, y + ry + 2.8, 0))]}
    return out


def layered(tag, scale, focus=None, focus_size=None, walker=True, parked=False):
    world, R, placed = build(walker=walker)
    J.setup((1200, 800), SAMPLES)
    J.lights(world)
    av.camera((J.AREA[0] / 2, J.AREA[1] / 2, 0.5), (1200, 800))
    w, h = autoframe(frame_area(), 0)
    if focus:
        x, y = J.PROJECTS[focus]["at"]
        cam = bpy.context.scene.camera
        fwd = cam.matrix_world.to_3x3() @ Vector((0, 0, -1))
        cam.location = Vector((x - 0.6, y + 0.8, 1.2)) - fwd * 60
        w, h = focus_size
    set_frame(w, h, scale)
    meta = {"frame": [bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y], "scale": scale, "layers": []}
    meta.update(anchors(placed))
    mode_base()
    av.render_to(OUT / f"{tag}-base.png")
    for bid, (b, proj, src, state, st) in placed.items():
        mode_layer(b.e)
        box = av.bbox_px(meshes(b.e), 10 * scale)
        box[3] += 10 * scale
        box[0] -= 16 * scale
        box[2] += 16 * scale
        crop = av.render_to(OUT / f"{tag}-bot-{bid}.png", box)
        if crop is None:
            continue
        meta["layers"].append({"id": bid, "file": f"{tag}-bot-{bid}.png", "x": crop[0], "y": crop[1], "w": crop[2], "h": crop[3],
                               "depth": meta["bots"][bid]["depth"]})
    (OUT / f"{tag}.json").write_text(json.dumps(meta, indent=1))


if JOB == "preview":
    world, R, placed = build()
    J.setup((1200, 800), SAMPLES)
    J.lights(world)
    av.camera((J.AREA[0] / 2, J.AREA[1] / 2, 0.5), (1200, 800))
    w, h = autoframe(frame_area(), 0)
    set_frame(w, h, float(ARGS.get("scale", 1)))
    print("FRAME", w, h)
    box = None
    if "room" in ARGS:
        x, y = J.PROJECTS[ARGS["room"]]["at"]
        c = av.project((x, y + 1.2, 1.0))
        r = 260 * float(ARGS.get("scale", 1))
        box = [c[0] - r * 1.3, c[1] - r, c[0] + r * 1.3, c[1] + r * 0.9]
    av.render_to(OUT / f"preview{('-' + ARGS['room']) if 'room' in ARGS else ''}.png", box)
elif JOB == "scene":
    layered("scene", 2.0)
elif JOB == "zoom":
    layered("zoom", 3.0, focus="warehouse", focus_size=(620, 560))


def studio(size=(3.0, 2.6)):
    av.reset()
    J._T.clear()
    av.M.update(av.mats())
    J.palette()
    w = av.G("world")
    f = w.box("floor", (size[0], size[1], 0.08), (0, 0.3, -0.08), J.PAL["grass"], 0.02)
    f["no_ink"] = True
    return w, f


def finish(w):
    J.lights(w)
    J.outline_all()
    bpy.context.view_layer.update()


def frame_on(objs, scale=2.0, margin=8):
    J.setup((400, 400), SAMPLES)
    J.lights(None)
    dg = bpy.context.evaluated_depsgraph_get()
    pts = [o.evaluated_get(dg).matrix_world @ Vector(c) for o in objs if o.type == "MESH" for c in o.evaluated_get(dg).bound_box]
    ctr = sum(pts, Vector()) / len(pts)
    av.camera(tuple(ctr), (400, 400))
    box = av.bbox_px([o for o in objs if o.type == "MESH"], 0)
    w, h = autoframe(box, margin)
    set_frame(w, h, scale)


def fixed_cam(px=150):
    J.setup((px * 2, px * 2), SAMPLES)
    J.lights(None)
    av.camera((0, 0.3, 0.85), (px, px))
    set_frame(px, px, 2.0)


STATES = ["working", "idle", "approval", "input", "error", "offline"]

if JOB == "parked":
    world, R, placed = build(walker=False)
    J.setup((1200, 800), SAMPLES)
    J.lights(world)
    av.camera((J.AREA[0] / 2, J.AREA[1] / 2, 0.5), (1200, 800))
    w, h = autoframe(frame_area(), 0)
    set_frame(w, h, 2.0)
    x, y, rot = J.world_pos(R, "connector", -2.0, 1.4)
    v = J.villager(world, "release-notes", (x, y, 0), rot - 90, "idle", "codex")
    J.outline_all(collections=("bots",))
    mode_layer(v.e)
    box = av.bbox_px(meshes(v.e), 20)
    box[3] += 20
    crop = av.render_to(OUT / "parked-bot-release-notes.png", box)
    p = v.e.matrix_world.translation
    (OUT / "parked.json").write_text(json.dumps({"layers": [{"id": "release-notes", "file": "parked-bot-release-notes.png", "x": crop[0], "y": crop[1],
                                                            "w": crop[2], "h": crop[3], "depth": round(p.x + p.y, 3)}]}, indent=1))

elif JOB == "states":
    ONLY = ARGS.get("only")
    for src in ("cli", "codex"):
        for st in STATES:
            w, f = studio()
            kind = "anvil" if src == "cli" else "lectern"
            J.station(w, "st", (0, -0.25, 0), 0, kind, st)
            J.villager(w, "bot", (0, 0.45, 0), 180, st, src)
            finish(w)
            frame_on(meshes(w.e), 3.5, 6)
            J.lights(None)
            av.render_to(OUT / f"station-{src}-{st}.png")
            if ONLY == "stations":
                continue
            for fr in range(1 if st == "offline" else 4):
                w, f = studio((1.6, 1.6))
                f.is_shadow_catcher = True
                J.villager(w, "bot", (0, 0.3, 0), 200, st, src, frame=fr)
                finish(w)
                fixed_cam()
                av.render_to(OUT / f"frame-{src}-{st}-f{fr}.png")
    if ONLY != "stations":
        w, f = studio((2.4, 2.0))
        f.is_shadow_catcher = True
        J.courier_stall(w, "bot", (0, 0.3, 0), 200)
        finish(w)
        fixed_cam()
        av.render_to(OUT / "frame-app-offline-f0.png")

elif JOB == "props":
    P = J.PROJECTS
    items = [(f"house-{k}", (lambda k: lambda w: J.cottage(w, "x", (0, 0, 0), 0, w=P[k]["w"], d=P[k]["d"], wall=P[k]["wall"], roof=P[k]["roof"],
                                                        floors=P[k]["floors"], seed=len(k)))(k)) for k in P]
    items += [
        ("well", lambda w: J.well(w, "x", (0, 0, 0))),
        ("tree-round", lambda w: J.tree(w, "x", (0, 0, 0), 1.1, 3)),
        ("tree-pine", lambda w: J.tree(w, "x", (0, 0, 0), 1.1, 3, "pine")),
        ("bush-flowers", lambda w: J.bush(w, "x", (0, 0, 0), 1.0, 1, "flower_r")),
        ("lantern", lambda w: J.lantern_post(w, "x", (0, 0, 0))),
        ("bench", lambda w: J.bench(w, "x", (0, 0, 0), 0)),
        ("crate", lambda w: J.crate(w, "x", (0, 0, 0))),
        ("barrel", lambda w: J.barrel(w, "x", (0, 0, 0))),
        ("sack", lambda w: J.sack(w, "x", (0, 0, 0))),
        ("station-desk", lambda w: J.station(w, "x", (0, 0, 0), 0, "desk", "working")),
        ("station-lectern", lambda w: J.station(w, "x", (0, 0, 0), 0, "lectern", "working")),
        ("station-anvil", lambda w: J.station(w, "x", (0, 0, 0), 0, "anvil", "working")),
        ("villager-cli", lambda w: J.villager(w, "x", (0, 0, 0), 200, "idle", "cli")),
        ("villager-codex", lambda w: J.villager(w, "x", (0, 0, 0), 200, "idle", "codex")),
        ("stall-claude-app", lambda w: J.courier_stall(w, "x", (0, 0, 0), 200)),
        ("signs", lambda w: [J.sign(w, f"s{i}", (0, i * 0.9 - 1.8, 1.0), 0, icon=ic) for i, ic in enumerate(("book", "key", "gear", "sack", "flag"))][0]),
    ]
    meta = []
    for name, fn in items:
        if ARGS.get("only") and name != ARGS["only"]:
            continue
        w, f = studio((7.0, 7.0))
        f.is_shadow_catcher = True
        g = fn(w)
        finish(w)
        target = meshes(w.e) if name == "signs" else meshes(g.e)
        target = [o for o in target if o is not f]
        frame_on(target, 3.0, 6)
        J.lights(None)
        a = av.project((g.e.matrix_world.translation.x, g.e.matrix_world.translation.y, 0))
        av.render_to(OUT / f"{name}.png")
        sc = bpy.context.scene.render
        meta.append({"file": f"{name}.webp", "scale": 3, "size_px": [sc.resolution_x, sc.resolution_y], "anchor_px": a})
    (OUT / "props.json").write_text(json.dumps(meta, indent=1))
