# Draws the Cercle icon (a sprout in a pot on a leaf-green tile) at every size the PWA and Android need.
from PIL import Image, ImageDraw
import os, math
BG = (47, 107, 69); LEAF = (134, 207, 148); LEAF2 = (93, 176, 111); POT = (232, 154, 104); RIM = (198, 120, 80); PETAL = (242, 201, 76); CTR = (217, 130, 43)

def art(size, pad_ratio=0.0, bg=True, round_=False):
    S = size * 4
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg:
        if round_: d.ellipse([0, 0, S - 1, S - 1], fill=BG)
        else: d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BG)
    # drawing box (content scaled into the safe area)
    m = S * pad_ratio
    def P(x, y): return (m + x / 100 * (S - 2 * m), m + y / 100 * (S - 2 * m))
    def W(v): return v / 100 * (S - 2 * m)
    # stem
    pts = [P(50, 74), P(50, 60), P(50, 46), P(50, 34)]
    d.line(pts, fill=LEAF, width=int(W(4.2)), joint="curve")
    def leaf(cx, cy, rx, ry, ang, col):
        L = Image.new("RGBA", (S, S), (0, 0, 0, 0)); ld = ImageDraw.Draw(L)
        x, y = P(cx, cy); ld.ellipse([x - W(rx), y - W(ry), x + W(rx), y + W(ry)], fill=col)
        L = L.rotate(ang, center=(x, y), resample=Image.BICUBIC); im.alpha_composite(L)
    leaf(39, 58, 12, 5.2, 28, LEAF2); leaf(61, 49, 12, 5.2, -28, LEAF); leaf(40, 42, 9.5, 4.4, 32, LEAF)
    for (dx, dy) in [(0, -7), (6.5, -2.5), (-6.5, -2.5), (4, 4.5), (-4, 4.5)]:
        x, y = P(50 + dx, 27 + dy); r = W(5.6); d.ellipse([x - r, y - r, x + r, y + r], fill=PETAL)
    x, y = P(50, 27); r = W(4.4); d.ellipse([x - r, y - r, x + r, y + r], fill=CTR)
    # pot
    d.polygon([P(33, 76), P(67, 76), P(62, 93), P(38, 93)], fill=POT)
    d.rounded_rectangle([*P(30, 71), *P(70, 78)], radius=int(W(2)), fill=RIM)
    return im.resize((size, size), Image.LANCZOS)

os.makedirs("www/icons", exist_ok=True)
art(192, 0.08).save("www/icons/icon-192.png")
art(512, 0.08).save("www/icons/icon-512.png")
art(180, 0.08).convert("RGB").save("www/icons/apple-touch-icon.png") if False else None
a = Image.new("RGB", (180, 180), BG); a.paste(art(180, 0.1, bg=False), (0, 0), art(180, 0.1, bg=False)); a.save("www/icons/apple-touch-icon.png")
m = Image.new("RGBA", (512, 512), BG + (255,)); fg = art(512, 0.2, bg=False); m.alpha_composite(fg); m.save("www/icons/maskable-512.png")
art(64, 0.04).save("www/icons/favicon.png")

res = "android/app/src/main/res"
if os.path.isdir(res):
    dens = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    for k, s in dens.items():
        dd = f"{res}/mipmap-{k}"; os.makedirs(dd, exist_ok=True)
        art(s, 0.08).save(f"{dd}/ic_launcher.png")
        art(s, 0.1, round_=True).save(f"{dd}/ic_launcher_round.png")
        fs = int(s * 108 / 48)  # adaptive foreground canvas (108dp)
        art(fs, 0.27, bg=False).save(f"{dd}/ic_launcher_foreground.png")
    with open(f"{res}/values/ic_launcher_background.xml", "w") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#2F6B45</color>\n</resources>\n')
    print("android icons written")
print("web icons written")
