"""Bake the native village assets. See scripts/render-village.md."""
import argparse
import json
import math
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

import v5_render as V

av, J, CH, bpy = V.av, V.J, V.CH, V.bpy
STATIONS = ((-1.6, 2.9), (-0.5, 3.25), (0.55, 3.2), (1.65, 2.9), (0, 4.35))
ROOFS = ("blue", "green", "orange", "red", "purple")
EXTRA = {
    "east": dict(at=(20.0, 10.2), rot=90, w=3.3, d=2.7, floors=1, wall="wall_stone", roof="roof_blue"),
    "south": dict(at=(12.6, 18.9), rot=180, w=3.3, d=2.7, floors=1, wall="wall_wood", roof="roof_red"),
    "west": dict(at=(0.8, 20.4), rot=-90, w=3.3, d=2.7, floors=1, wall="wall_plaster", roof="roof_green"),
}


def webp(png, target):
    with Image.open(png) as image:
        image.save(target, quality=90, method=4, exact=True)
        return image.size


def sprites(out, tmp, guilds, count):
    for guild, source in guilds:
        for i in range(count):
            persona_id = f"{guild}-{i:02d}"
            per = CH.persona(persona_id, source)
            for state in V.STATES:
                target = out / f"{persona_id}-{state}.webp"
                if target.exists():
                    continue
                sheet = Image.new("RGBA", (1200, 300))
                for frame in range(4):
                    world, floor = V.studio((1.6, 1.6))
                    floor.is_shadow_catcher = True
                    CH.villager(world, persona_id, (0, 0.3, 0), 200, state, per, frame)
                    V.finish(world)
                    V.fixed_cam()
                    png = tmp / "frame.png"
                    av.render_to(png)
                    with Image.open(png) as image:
                        sheet.paste(image, (300 * frame, 0))
                sheet.save(target, quality=90, method=4, exact=True)
                print(f"Saved {target.name}", flush=True)


def map_assets(out, tmp, preview):
    # Build the reference village without its fictional villagers or state lights.
    av.reset()
    J._T.clear()
    CH._C.clear()
    av.M.update(av.mats())
    J.palette()
    world = av.G("world")
    plots = world.sub("ground")
    for key, spec in EXTRA.items():
        plots.box(f"soil-{key}", (spec["w"] + 0.7, spec["d"] + 0.6, 0.035), (*spec["at"], -0.015),
                  J.PAL["earth"], 0, rot=(0, 0, spec["rot"]))["no_ink"] = True
    roots = J.build_village(world, {})
    J.PROJECTS.update(EXTRA)
    roots.update({key: world.sub(key, (*spec["at"], 0), spec["rot"]) for key, spec in EXTRA.items()})
    for lot in roots.values():
        for index, (x, y) in enumerate(STATIONS):
            J.station(lot, f"station-{index}", (x, y - 0.55, 0), 0, ("lectern", "anvil")[index % 2], "offline")
    board = world.sub("inbox-board", (10.4, 13.5, 0), -25)
    for x in (-0.52, 0.52):
        board.box("post", (0.1, 0.1, 1.35), (x, 0, 0), J.PAL["timber"], 0.01)
    board.box("board", (1.3, 0.14, 0.68), (0, 0, 0.64), J.PAL["wood_lt"], 0.02)
    for x in (-0.36, 0, 0.36):
        board.box("note", (0.25, 0.025, 0.38), (x, 0.08, 0.81), J.PAL["paper"], 0.01)
    J.courier_stall(world, "closed-stall", (14.6, 9.0, 0), -90)
    J.setup((1200, 800), V.SAMPLES)
    J.lights(world)
    av.camera((J.AREA[0] / 2, J.AREA[1] / 2, 0.5), (1200, 800))
    w, h = V.autoframe(V.frame_area(55), 0)
    V.set_frame(w, h, 0.65 if preview else 2.0)
    J.outline_all()
    bpy.context.view_layer.update()
    if preview:
        av.render_to(out / "preview.png")
        return
    specs = list(J.PROJECTS.items())
    for key, spec in specs:
        if key in EXTRA:
            continue
        for obj in V.meshes(roots[key].e):
            if ".house." in obj.name or ".iron_door" in obj.name:
                obj.hide_render = True
    png = tmp / "map.png"
    sc = bpy.context.scene
    meta = {
        "frame": [sc.render.resolution_x, sc.render.resolution_y],
        "lots": [],
        "inbox": av.project((10.4, 13.5, 0.9)),
        "stall": av.project((14.6, 9.0, 1.2)),
    }
    av.render_to(png)
    webp(png, out / "base.webp")
    ground = bpy.data.objects["world.ground.grass_out"]
    for idx, (key, spec) in enumerate(specs):
        x, y = spec["at"]
        height = 0.25 + 2.1 * spec["floors"] + min(spec["w"], spec["d"]) * 0.5 + 0.6
        workers = []
        for station_index, (dx, dy) in enumerate(STATIONS):
            station = next(obj for obj in V.meshes(roots[key].e) if f".station-{station_index}.crystal" in obj.name)
            r = math.radians(spec["rot"])
            sx, sy = x + dx * math.cos(r) - dy * math.sin(r), y + dx * math.sin(r) + dy * math.cos(r)
            workers.append({"point": av.project((sx, sy, 0)), "depth": round(sx + sy, 3),
                            "crystal": av.project(station.matrix_world.translation)})
        lot = {"roof": av.project((x, y, height)), "center": av.project((x, y, 0)), "workers": workers, "layers": {}}
        meta["lots"].append(lot)
        for color in ROOFS:
            house = J.cottage(roots[key], f"variant-{color}", (0, 0, 0), 0, w=spec["w"], d=spec["d"],
                              wall=spec["wall"], roof=f"roof_{color}", floors=spec["floors"], seed=len(key))
            J.outline_all(collections=("env",))
            meshes = V.meshes(house.e)
            keep = set(meshes)
            for obj in av.coll("env").objects:
                if obj.type == "MESH":
                    obj.hide_render = obj not in keep and obj != ground
            ground.is_shadow_catcher = True
            bpy.context.view_layer.update()
            box = av.bbox_px(meshes, 14)
            box[0] -= 210
            box[3] += 190
            crop = av.render_to(png, box)
            if crop is None:
                raise RuntimeError(f"Lot {idx + 1} is outside the map")
            file = f"house-{idx}-{color}.webp"
            size = webp(png, out / file)
            lot["layers"][color] = [*crop[:2], *size]
            for obj in meshes:
                bpy.data.objects.remove(obj, do_unlink=True)
    (out / "map.json").write_text(json.dumps(meta, separators=(",", ":")) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("job", choices=("sprites", "map", "preview"))
    parser.add_argument("output", type=Path)
    parser.add_argument("--samples", type=int, default=24)
    parser.add_argument("--count", type=int, default=16)
    parser.add_argument("--guild", choices=("artisan", "scholar"))
    args = parser.parse_args()
    V.SAMPLES = args.samples
    args.output.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory() as directory:
        if args.job == "sprites":
            guilds = [("artisan", "cli"), ("scholar", "codex")]
            sprites(args.output, Path(directory), [g for g in guilds if not args.guild or args.guild == g[0]], args.count)
        else:
            map_assets(args.output, Path(directory), args.job == "preview")


if __name__ == "__main__":
    main()
