"""Render a lineup of generated villagers. python lineup.py <out.png> [n=24] [scale=4]"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parents[1] / "village-v3" / "blender"), str(HERE.parents[1] / "village-v4" / "blender")]
import bpy  # noqa: E402
import av  # noqa: E402
import jrpg as J  # noqa: E402
import characters as C  # noqa: E402

ARGS = dict(a.split("=") for a in sys.argv[2:] if "=" in a)
N = int(ARGS.get("n", 24))
SCALE = float(ARGS.get("scale", 4))
IDS = ["graph-map", "entity-audit", "privacy-guard", "redaction-check", "partner-connector", "tool-schema", "model-refresh",
       "segment-models", "warehouse-qa", "landing-review", "outreach-copy", "release-notes", "billing-sync", "docs-sweep",
       "api-gateway", "eval-harness", "onboarding-flow", "pricing-page", "log-triage", "schema-migrate", "ui-polish",
       "search-index", "audit-trail", "deploy-notes"]

av.reset()
C._C.clear()
J._T.clear()
av.M.update(av.mats())
J.palette()
w = av.G("world")
f = w.box("floor", (40, 40, 0.1), (0, 0, -0.1), C.cmat("ground", "#7DAF55", 0.9, var=0.08, nscale=3), 0)
f["no_ink"] = True
cols = int(ARGS.get('cols', 12))
for i, aid in enumerate(IDS[:N]):
    src = "cli" if i % 2 == 0 else "codex"
    per = C.persona(aid, src)
    r, c = divmod(i, cols)
    k = c - (cols - 1) / 2
    # screen-right is (-x, +y); toward the camera is (+x, +y)
    x = -k * 0.78 + r * 2.4
    y = k * 0.78 + r * 2.4
    C.villager(w, f"v{i}", (x, y, 0), -45, ARGS.get("state", "idle"), per)
J.outline_all(thick=0.008)
J.setup((1600, 600), int(ARGS.get("samples", 48)))
J.lights(None)
bpy.data.objects['sun'].data.energy = 7.0
bpy.context.scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.1
sc = bpy.context.scene
sc.view_settings.view_transform = "AgX"
sc.view_settings.look = "AgX - Punchy"
av.camera((0.6, 0.6, 0.75), (1600, 600))
sc.render.resolution_x, sc.render.resolution_y = int(1500 * SCALE / 2), int(520 * SCALE / 2)
sc.camera.data.ortho_scale = float(ARGS.get('ortho', 1500 / av.PX_PER_M / 1.9))
bpy.context.view_layer.update()
av.render_to(sys.argv[1])
