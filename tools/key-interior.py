"""Make a vehicle interior's grey windows transparent, for the driving view.

    python tools/key-interior.py <painted interior.jpg|png> <out.webp>

Paint the windows (windscreen, side windows) flat mid grey (several greys are fine: the sky seen
through a cab's partition is darker than through its side windows). Every large, smooth area of
neutral grey becomes transparent, with a soft edge. Painted things near grey but textured (silver
paint on a bonnet, chrome) stay, because an area must be flat over a few pixels to count, and
only areas over MIN_SHARE of the picture are windows. Mirrors keep their own painted
reflections. Saved as webp with an alpha channel.
"""
import sys
from collections import deque
from pathlib import Path
from PIL import Image, ImageFilter

# Window grey: channels within SPREAD of each other, brightness between LO and HI.
SPREAD, LO, HI = 6, 85, 180
# The edge: greyish pixels beside a window, a little looser, made half see-through.
EDGE_SPREAD = 14
# Flat over this many pixels square (an erosion), and a window at least this share of the picture.
FLAT = 5
MIN_SHARE = 0.004


def key(src, dst):
    im = Image.open(src).convert("RGB")
    w, h = im.size
    flat = lambda img: list(img.get_flattened_data() if hasattr(img, "get_flattened_data") else img.getdata())
    data = flat(im)
    near = lambda r, g, b, spread: max(r, g, b) - min(r, g, b) <= spread and LO <= (r + g + b) / 3 <= HI
    strict = Image.new("L", (w, h))
    strict.putdata([255 if near(r, g, b, SPREAD) else 0 for r, g, b in data])
    # Only what is flat over FLAT pixels square: brushwork near grey drops out here.
    core = flat(strict.filter(ImageFilter.MinFilter(FLAT)))
    n, least = w * h, int(w * h * MIN_SHARE)
    keep, seen, windows = bytearray(n), bytearray(n), 0
    for start in range(n):
        if not core[start] or seen[start]:
            continue
        seen[start] = 1
        part, queue = [start], deque([start])
        while queue:
            i = queue.popleft()
            x, y = i % w, i // w
            for j in (i - 1 if x else -1, i + 1 if x < w - 1 else -1, i - w if y else -1, i + w if y < h - 1 else -1):
                if j >= 0 and core[j] and not seen[j]:
                    seen[j] = 1
                    part.append(j)
                    queue.append(j)
        if len(part) >= least:
            windows += 1
            for i in part:
                keep[i] = 255
    # Back out to the window's own edge (the erosion took FLAT // 2 off it), on window grey only.
    grown = Image.new("L", (w, h))
    grown.putdata(keep)
    grown = flat(grown.filter(ImageFilter.MaxFilter(FLAT + 2)))
    clear = [1 if grown[i] and near(*data[i], SPREAD) else 0 for i in range(n)]
    halo = flat(Image.frombytes("L", (w, h), bytes(255 if c else 0 for c in clear)).filter(ImageFilter.MaxFilter(3)))
    out = []
    for i, (r, g, b) in enumerate(data):
        if clear[i]:
            out.append((r, g, b, 0))
        elif halo[i] and near(r, g, b, EDGE_SPREAD):
            out.append((r, g, b, 128))
        else:
            out.append((r, g, b, 255))
    res = Image.new("RGBA", (w, h))
    res.putdata(out)
    res.save(dst, "WEBP", quality=90, alpha_quality=100, method=6)
    print(f"{Path(dst).name}: {w}x{h}, {windows} window area(s), {sum(clear) * 100 // n}% transparent")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    key(sys.argv[1], sys.argv[2])
