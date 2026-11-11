# Render the native village

Use Python 3.13 on a machine supported by the Blender Python wheel. Run from the repository root.

```sh
python3.13 -m venv ../village-render-venv
../village-render-venv/bin/pip install bpy==5.2.3 pillow numpy
../village-render-venv/bin/python design/village-v5/blender/render_library.py preview /tmp/village-preview --samples 12
../village-render-venv/bin/python design/village-v5/blender/render_library.py map public/rpg/map --samples 24
../village-render-venv/bin/python design/village-v5/blender/render_library.py sprites public/rpg/sprites --samples 16
```

The sprite job skips completed sheets so it can resume after interruption. Use an empty output directory to rebuild a library after changing the generator. Each of the 32 personas has six WebP sheets; each sheet contains four 300 × 300 frames. Every frame uses the same camera and foot anchor. The map manifest contains eight lots, five roof layers per lot, and map coordinates in @2x pixels. Render intermediates stay in a temporary directory.

## Choose a different villager

For a private override, create `villager-overrides.json` next to `project-plans.json` in the Agent Village state directory. Give it mode `0600`. Use the session ID displayed in the Conversations tab and an index from 0 to 15, for example `{"codex:example": 4}`. Change the index to pick a different persona, or remove the entry to restore the default. The server reads the file without modifying it.
