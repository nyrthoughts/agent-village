"""Generate the abstract monitor screens used by each agent state.

No text, no logos: only bars and boxes. One PNG per state.
Run: python3 screens.py <out_dir>
"""
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw

W, H = 320, 200
STATE = {
    "working": (0, 186, 124),
    "idle": (139, 152, 165),
    "approval": (255, 173, 31),
    "input": (29, 155, 240),
    "error": (244, 33, 46),
}


def base(bg=(22, 27, 35)):
    im = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 14], fill=(26, 30, 37))  # title bar
    for i, x in enumerate((8, 18, 28)):
        d.ellipse([x, 4, x + 6, 10], fill=(70, 76, 86))
    d.rectangle([0, 14, 54, H], fill=(20, 24, 30))  # sidebar
    for y in range(26, 150, 14):
        d.rectangle([8, y, 8 + random.randint(18, 38), y + 5], fill=(58, 64, 74))
    return im, d


def code_lines(d, x0, y0, y1, dim=1.0, accent=None):
    y = y0
    indent = 0
    while y < y1:
        indent = max(0, min(4, indent + random.choice((-1, 0, 0, 1))))
        x = x0 + indent * 10
        for _ in range(random.randint(1, 4)):
            w = random.randint(10, 46)
            if x + w > W - 10:
                break
            g = int(random.randint(130, 215) * dim)
            col = (g, g + 4, g + 10)
            if accent and random.random() < 0.18:
                col = tuple(int(c * 0.75 * dim) for c in accent)
            d.rectangle([x, y, x + w, y + 4], fill=col)
            x += w + 6
        y += 10


def make(state):
    random.seed(state)
    if state == "offline":
        return Image.new("RGB", (W, H), (6, 7, 8))
    im, d = base()
    col = STATE[state]
    if state == "working":
        code_lines(d, 66, 24, H - 16, accent=col)
        d.rectangle([66, H - 12, 74, H - 6], fill=(220, 226, 232))  # caret
    elif state == "idle":
        code_lines(d, 66, 24, H - 16, dim=0.45)
    elif state in ("approval", "input"):
        code_lines(d, 66, 24, H - 16, dim=0.5)
        bx = [92, 58, W - 30, 150]
        d.rectangle(bx, fill=(30, 34, 42), outline=col, width=2)
        d.rectangle([bx[0], bx[1], bx[0] + 6, bx[3]], fill=col)
        for i, w in enumerate((140, 110, 90)):
            d.rectangle([bx[0] + 18, bx[1] + 14 + i * 12, bx[0] + 18 + w, bx[1] + 19 + i * 12], fill=(180, 186, 194))
        if state == "approval":  # two buttons: approve / deny
            d.rectangle([bx[2] - 112, bx[3] - 26, bx[2] - 64, bx[3] - 10], fill=col)
            d.rectangle([bx[2] - 56, bx[3] - 26, bx[2] - 10, bx[3] - 10], outline=(150, 156, 164), width=2)
        else:  # one text field with a caret
            d.rectangle([bx[0] + 18, bx[3] - 28, bx[2] - 14, bx[3] - 10], outline=col, width=2)
            d.rectangle([bx[0] + 24, bx[3] - 24, bx[0] + 27, bx[3] - 14], fill=(230, 236, 240))
    elif state == "error":
        code_lines(d, 66, 24, 100, dim=0.5)
        d.rectangle([60, 108, W - 8, H - 10], fill=(46, 12, 16))
        d.rectangle([60, 108, W - 8, 112], fill=col)
        for i in range(5):
            d.rectangle([72, 122 + i * 12, 72 + random.randint(60, 200), 126 + i * 12], fill=(220, 120, 126))
    return im


if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    out.mkdir(parents=True, exist_ok=True)
    for s in ("working", "idle", "approval", "input", "error", "offline"):
        make(s).save(out / f"screen-{s}.png")
    print("ok")
