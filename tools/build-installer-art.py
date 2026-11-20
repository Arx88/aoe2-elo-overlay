"""
Genera los bitmaps 24-bit BMP oficiales del instalador NSIS usando el mismo
arte cartográfico oscuro y el emblema dorado del Launcher (v2.3.1+):
  - build/installer-sidebar.bmp  (164x314 px)
  - build/installer-header.bmp   (150x57 px)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
BUILD.mkdir(exist_ok=True)

EMBLEM = ROOT / "assets" / "brand" / "double-h-v1.png"
ART_PERFIL = ROOT / "assets" / "art" / "perfil.webp"
ART_LATERAL = ROOT / "assets" / "art" / "lateral.webp"


def make_sidebar():
    W, H = 164, 314
    canvas = Image.new("RGB", (W, H), (18, 22, 27))
    px = canvas.load()
    for y in range(H):
        t = y / (H - 1)
        r = int(23 - 9 * t)
        g = int(28 - 10 * t)
        b = int(31 - 11 * t)
        for x in range(W):
            px[x, y] = (r, g, b)

    # Fondo cartográfico sutil abajo (estética del rail lateral del Launcher)
    if ART_LATERAL.exists():
        art = Image.open(ART_LATERAL).convert("RGBA")
        ratio = max(W / art.width, 190 / art.height)
        art = art.resize((int(art.width * ratio), int(art.height * ratio)), Image.Resampling.LANCZOS)
        crop_y = max(0, art.height - 190)
        crop_x = max(0, (art.width - W) // 2)
        art = art.crop((crop_x, crop_y, crop_x + W, crop_y + 190))
        art = ImageEnhance.Brightness(art).enhance(0.92)
        # Degradado vertical suave de transparente a visible
        mask = Image.new("L", (W, 190), 0)
        mpx = mask.load()
        for y in range(190):
            alpha = int(205 * min(1.0, max(0.0, (y - 12) / 95.0)))
            for x in range(W):
                mpx[x, y] = alpha
        canvas.paste(art.convert("RGB"), (0, H - 190), mask)

    draw = ImageDraw.Draw(canvas)
    # Línea vertical sutil en el borde derecho (separador de latón suave)
    draw.line([(W - 1, 0), (W - 1, H)], fill=(86, 74, 52), width=1)
    # Acento superior dorado muy fino
    draw.line([(20, 146), (W - 20, 146)], fill=(120, 102, 68), width=1)

    # Emblema dorado del Launcher centrado en la parte superior
    if EMBLEM.exists():
        logo = Image.open(EMBLEM).convert("RGBA")
        logo.thumbnail((84, 84), Image.Resampling.LANCZOS)
        lx = (W - logo.width) // 2
        ly = 34
        canvas.paste(logo, (lx, ly), logo)

    # Etiqueta limpia debajo del emblema
    try:
        font_title = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 14)
        font_sub = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 10)
    except Exception:
        font_title = ImageFont.load_default()
        font_sub = ImageFont.load_default()

    title = "AoE2 Helper"
    tb = draw.textbbox((0, 0), title, font=font_title)
    draw.text(((W - (tb[2] - tb[0])) // 2, 124), title, fill=(239, 238, 233), font=font_title)

    sub = "AGE OF EMPIRES II · DE"
    sb = draw.textbbox((0, 0), sub, font=font_sub)
    draw.text(((W - (sb[2] - sb[0])) // 2, 156), sub, fill=(199, 173, 118), font=font_sub)

    out = BUILD / "installer-sidebar.bmp"
    canvas.save(out, format="BMP")
    print(f"Created {out} ({W}x{H})")


def make_header():
    W, H = 150, 57
    canvas = Image.new("RGB", (W, H), (18, 22, 27))
    if ART_PERFIL.exists():
        art = Image.open(ART_PERFIL).convert("RGB")
        ratio = max(W / art.width, H / art.height)
        art = art.resize((int(art.width * ratio), int(art.height * ratio)), Image.Resampling.LANCZOS)
        x0 = max(0, art.width - W)
        y0 = max(0, (art.height - H) // 2)
        art = art.crop((x0, y0, x0 + W, y0 + H))
        art = ImageEnhance.Brightness(art).enhance(0.68)
        mask = Image.new("L", (W, H), 0)
        mpx = mask.load()
        for y in range(H):
            for x in range(W):
                mpx[x, y] = int(200 * (x / (W - 1)))
        canvas.paste(art, (0, 0), mask)

    if EMBLEM.exists():
        logo = Image.open(EMBLEM).convert("RGBA")
        logo.thumbnail((40, 40), Image.Resampling.LANCZOS)
        canvas.paste(logo, (W - logo.width - 12, (H - logo.height) // 2), logo)

    draw = ImageDraw.Draw(canvas)
    draw.line([(0, H - 1), (W, H - 1)], fill=(96, 82, 56), width=1)

    out = BUILD / "installer-header.bmp"
    canvas.save(out, format="BMP")
    print(f"Created {out} ({W}x{H})")


if __name__ == "__main__":
    make_sidebar()
    make_header()
