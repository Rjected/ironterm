#!/usr/bin/env python3
"""Generates the Ironterm app icon (1024×1024): an amber "IT_" prompt (underscore cursor) on black.

  python3 ios/Tools/make_icon.py     (needs Pillow; writes Ironterm/Assets.xcassets/AppIcon.appiconset/icon-1024.png)
"""
import os
from PIL import Image, ImageDraw, ImageFont

S = 1024
AMBER = (255, 176, 0)
LINE = (34, 36, 40)
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "Ironterm", "Assets.xcassets", "AppIcon.appiconset", "icon-1024.png")

img = Image.new("RGB", (S, S), (0, 0, 0))
d = ImageDraw.Draw(img)

# faint terminal scanlines
for y in range(0, S, 16):
    d.line([(0, y), (S, y)], fill=(8, 8, 9), width=2)

try:
    font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 470, index=1)  # Menlo Bold
except OSError:
    font = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", 470)

text = "IT"
box = d.textbbox((0, 0), text, font=font)
tw, th = box[2] - box[0], box[3] - box[1]
cursor_w, gap = 190, 30
total = tw + gap + cursor_w
x0 = (S - total) // 2 - box[0]
y0 = (S - th) // 2 - box[1] - 20
d.text((x0, y0), text, font=font, fill=AMBER)

# underscore cursor on the baseline
cx = x0 + box[0] + tw + gap
d.rectangle([cx, y0 + box[3] - 56, cx + cursor_w, y0 + box[3]], fill=AMBER)

img.save(OUT)
print("wrote", os.path.normpath(OUT))
