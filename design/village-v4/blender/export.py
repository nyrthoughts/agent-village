"""Convert renders to WebP and write asset-manifest.json.

Run from design/village-v3: python3 blender/export.py
Monitor screen textures (renders/screens) stay PNG: they are Blender inputs.
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
R = ROOT / "renders"
TILE = [64, 32]


def webp(p: Path) -> Path:
    out = p.with_suffix(".webp")
    im = Image.open(p)
    im.save(out, "WEBP", quality=90, method=4, exact=False)
    p.unlink()
    return out


def main():
    for p in sorted(R.rglob("*.png")):
        if p.parent.name == "screens":
            continue
        webp(p)
    for j in R.rglob("*.json"):
        j.write_text(j.read_text().replace(".png", ".webp"))

    assets = []
    scene = json.loads((R / "scene/scene.json").read_text())
    assets.append({"file": "renders/scene/scene-base.webp", "group": "layer", "role": "Whole floor, no bots, monitors off",
                   "size_2x": scene["frame"], "anchor_rule": "frame origin = top-left of the scene", "frames": 1})
    for l in scene["layers"]:
        b = scene["bots"][l["id"]]
        assets.append({"file": f"renders/scene/{l['file']}", "group": "bot layer", "role": f"{l['id']} · {b['source']} · {b['state']} · demo",
                       "size_2x": [l["w"], l["h"]], "offset_2x": [l["x"], l["y"]], "anchor_2x": b["foot"], "depth": l["depth"], "frames": 1})
    props = json.loads((R / "props/props.json").read_text())
    for p in props:
        assets.append({"file": f"renders/props/{p['file']}", "group": "prop", "role": p["file"].replace(".webp", ""),
                       "size_2x": [round(p["size_px"][0] * 2 / 3), round(p["size_px"][1] * 2 / 3)], "anchor_2x": [round(p["anchor_px"][0] * 2 / 3, 1), round(p["anchor_px"][1] * 2 / 3, 1)], "file_scale": 3, "anchor_rule": "floor point under the prop origin", "frames": 1})
    for src in ("cli", "codex"):
        for st in ("working", "idle", "approval", "input", "error", "offline"):
            n = 1 if st == "offline" else 4
            assets.append({"file": f"renders/states/frame-{src}-{st}-f[0-{n - 1}].webp", "group": "sprite frames",
                           "role": f"{src} · {st}", "size_2x": [300, 300], "anchor_2x": "fixed: same camera target for every frame",
                           "frames": n})
    assets.append({"file": "renders/states/frame-app-offline-f0.webp", "group": "sprite frames", "role": "Claude app stall · closed (no source)",
                   "size_2x": [300, 300], "frames": 1})
    manifest = {
        "version": "design-v3-rpg-village-2026-11-08",
        "status": "proposal, not validated",
        "source": "blender/jrpg.py + blender/rpg_render.py (Blender 5.2, Cycles, toon shading). No image model, no downloaded asset, nothing taken from an existing game.",
        "projection": {"type": "orthographic 2:1 isometric", "camera_rotation_deg": [60, 0, 135], "elevation_deg": 30,
                       "tile_px_1x": TILE, "px_per_m_screen_1x": 45.25, "z_px_per_m_1x": 39.19,
                       "formula": "screen = ((y - x) * 32, (x + y) * 16 - z * 39.19), world origin at the floor's back corner"},
        "export": {"format": "WebP with alpha, quality 90, @2x (zoom @3x), sRGB",
                   "rules": ["no baked text: monitors show abstract bars", "no secrets or transcripts",
                             "constant camera and scale", "bot layers rendered against the scene as a shadow catcher",
                             "painter order: ascending depth = x + y"]},
        "assets": assets,
    }
    (ROOT / "asset-manifest.json").write_text(json.dumps(manifest, indent=1))
    print(len(assets), "assets")


if __name__ == "__main__":
    main()
