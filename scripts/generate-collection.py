#!/usr/bin/env python3
"""ZENSAI collection generator — 5 16-bit pixel bonsai variants + 3,333 metadata JSONs.
Pixel art is drawn on a 32x32 grid, then upscaled NEAREST to 512x512 (crisp pixels).
Run: python3 scripts/generate-collection.py
"""
import json, os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_DIR = os.path.join(ROOT, "collection", "images")
META_DIR = os.path.join(ROOT, "collection", "metadata")
BASE_IMG = "https://raw.githubusercontent.com/nugian10/ZENSAI/main/collection/images/"
BASE_META = "https://raw.githubusercontent.com/nugian10/ZENSAI/main/collection/metadata/"

VARIANTS = [
    # slug, species, tier, start, end, palette
    ("common-pine", "Pine Bonsai", "Common", 1, 1667, dict(
        bg="#EDE6D0", ground="#C9B98F", trunk="#6B4A2F", trunk_d="#4A3220",
        c_dark="#1E4D28", c_mid="#2F6B3A", c_light="#4A9A55", pot="#B3541E", pot_d="#8A3E14",
        accent="#7FB069", pot_name="Terracotta", bg_name="Rice Paper")),
    ("uncommon-juniper", "Juniper Bonsai", "Uncommon", 1668, 2500, dict(
        bg="#DCE8E2", ground="#A8C4B8", trunk="#5A4632", trunk_d="#3E2F22",
        c_dark="#1F5C4D", c_mid="#2E7D6B", c_light="#4AA98F", pot="#3A6EA5", pot_d="#2A5278",
        accent="#8FD0C0", pot_name="Glazed Blue", bg_name="Mist Green")),
    ("rare-sakura", "Sakura Bonsai", "Rare", 2501, 3000, dict(
        bg="#F6E3E8", ground="#D9A8B8", trunk="#6B4A2F", trunk_d="#4A3220",
        c_dark="#D1608F", c_mid="#E87EA8", c_light="#F8A9C6", pot="#7A3B4F", pot_d="#5A2A3A",
        accent="#FFFFFF", pot_name="Dark Rose", bg_name="Sakura Pink")),
    ("epic-wisteria", "Wisteria Bonsai", "Epic", 3001, 3217, dict(
        bg="#E6E0F2", ground="#B3A6D6", trunk="#5A4632", trunk_d="#3E2F22",
        c_dark="#5B3F8F", c_mid="#7B5FBF", c_light="#A78BDB", pot="#4A3B6B", pot_d="#33284C",
        accent="#D6C6F5", pot_name="Indigo", bg_name="Wisteria Mist")),
    ("legendary-golden-pine", "Golden Pine Bonsai", "Legendary", 3218, 3333, dict(
        bg="#232B1E", ground="#3A4A2E", trunk="#4A3220", trunk_d="#2E1E10",
        c_dark="#9A6B00", c_mid="#C99700", c_light="#F5C542", pot="#141414", pot_d="#000000",
        accent="#FFE98A", pot_name="Black Lacquer + Gold", bg_name="Midnight Garden")),
]

# Canopy blob centers (x, y, r) per variant — different silhouette each.
CANOPY = {
    "common-pine": [(12, 10, 5), (20, 8, 5), (16, 5, 4)],
    "uncommon-juniper": [(10, 12, 4), (18, 13, 5), (22, 8, 4), (14, 6, 4)],
    "rare-sakura": [(11, 9, 6), (21, 10, 5), (16, 5, 4)],
    "epic-wisteria": [(12, 8, 5), (21, 9, 5), (16, 13, 4)],
    "legendary-golden-pine": [(11, 9, 6), (21, 8, 6), (16, 4, 5)],
}
TRUNK_TOP = {  # (x, y) where trunk meets canopy
    "common-pine": (16, 10), "uncommon-juniper": (15, 11), "rare-sakura": (17, 10),
    "epic-wisteria": (16, 12), "legendary-golden-pine": (16, 9),
}


def blob(px, cx, cy, r, colors):
    dark, mid, light = colors
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            d2 = (x - cx) ** 2 + (y - cy) ** 2
            if d2 <= r * r:
                # shade: top-left lighter, bottom darker
                if d2 <= (r * 0.45) ** 2:
                    c = light
                elif (x < cx - 1 and y < cy) or d2 <= (r * 0.75) ** 2:
                    c = mid
                else:
                    c = dark
                if 0 <= x < 32 and 0 <= y < 32:
                    px[x, y] = c


def line(px, x0, y0, x1, y1, color, w=2):
    steps = max(abs(x1 - x0), abs(y1 - y0), 1) * 2
    for i in range(steps + 1):
        t = i / steps
        x = round(x0 + (x1 - x0) * t)
        y = round(y0 + (y1 - y0) * t)
        for dx in range(-(w // 2), w // 2 + 1):
            for dy in range(0, 1):
                if 0 <= x + dx < 32 and 0 <= y + dy < 32:
                    px[x + dx, y + dy] = color


def hx(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def draw_variant(slug, pal):
    pal = {k: (hx(v) if isinstance(v, str) and v.startswith("#") else v) for k, v in pal.items()}
    img = Image.new("RGB", (32, 32), pal["bg"])
    px = img.load()
    # ground
    for y in range(27, 32):
        for x in range(32):
            px[x, y] = pal["ground"]
    # moss / stones on ground
    for (x, y) in [(4, 28), (6, 29), (27, 28), (25, 30), (9, 30), (22, 29)]:
        px[x, y] = pal["c_dark"]
    # trunk: from pot (16,24) leaning to canopy top
    tx, ty = TRUNK_TOP[slug]
    line(px, 16, 24, tx, ty, pal["trunk"], w=3)
    line(px, 16, 24, tx, ty, pal["trunk_d"], w=1)
    # branches to each canopy blob
    for (cx, cy, _r) in CANOPY[slug]:
        line(px, tx, ty + 2, cx, cy + 1, pal["trunk"], w=1)
    # canopy blobs (dark edge first, then mid/light via blob shading)
    for (cx, cy, r) in CANOPY[slug]:
        blob(px, cx, cy, r, (pal["c_dark"], pal["c_mid"], pal["c_light"]))
    # wisteria: hanging flower clusters under canopy
    if slug == "epic-wisteria":
        for (x, y) in [(11, 16), (12, 17), (21, 16), (20, 18), (16, 18), (15, 19)]:
            px[x, y] = pal["accent"]
            px[x, y + 1] = pal["c_light"]
    # sakura: falling petals
    if slug == "rare-sakura":
        for (x, y) in [(6, 15), (26, 14), (24, 20), (8, 21), (28, 22)]:
            px[x, y] = pal["accent"]
    # legendary: gold sparkles
    if slug == "legendary-golden-pine":
        for (x, y) in [(5, 6), (27, 5), (28, 15), (4, 16), (26, 22), (7, 22)]:
            px[x, y] = pal["accent"]
        # gold rim on pot
        for x in range(11, 22):
            px[x, 24] = pal["accent"]
    # pot: trapezoid rows y=24..28
    for y, (x0, x1) in {24: (11, 21), 25: (12, 20), 26: (12, 20), 27: (13, 19), 28: (13, 19)}.items():
        for x in range(x0, x1 + 1):
            px[x, y] = pal["pot"] if x not in (x0, x1) else pal["pot_d"]
    # pot rim highlight
    px[12, 24] = pal["pot_d"]
    return img.resize((512, 512), Image.NEAREST)


def main():
    os.makedirs(IMG_DIR, exist_ok=True)
    os.makedirs(META_DIR, exist_ok=True)
    manifest = {"name": "ZENSAI", "symbol": "ZSAI", "supply": 3333,
                "baseURI": BASE_META, "images": BASE_IMG, "tiers": []}
    for slug, species, tier, start, end, pal in VARIANTS:
        img = draw_variant(slug, pal)
        img.save(os.path.join(IMG_DIR, slug + ".png"))
        manifest["tiers"].append({"tier": tier, "species": species, "range": [start, end],
                                  "count": end - start + 1, "image": slug + ".png"})
        for tid in range(start, end + 1):
            meta = {
                "name": f"ZENSAI #{tid}",
                "description": f"A 16-bit pixel {species.lower()} — a miniature tree grown on BNB Chain. "
                               f"ZENSAI #{tid} is {tier}. Token ID decides the variant; what you mint is what you get.",
                "image": BASE_IMG + slug + ".png",
                "attributes": [
                    {"trait_type": "Tier", "value": tier},
                    {"trait_type": "Species", "value": species},
                    {"trait_type": "Pot", "value": pal["pot_name"]},
                    {"trait_type": "Background", "value": pal["bg_name"]},
                    {"trait_type": "Style", "value": "16-bit Pixel"},
                ],
            }
            with open(os.path.join(META_DIR, f"{tid}.json"), "w") as f:
                json.dump(meta, f, indent=2)
    with open(os.path.join(ROOT, "collection", "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print("images:", len(os.listdir(IMG_DIR)), "metadata:", len(os.listdir(META_DIR)))


if __name__ == "__main__":
    main()
