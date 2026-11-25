#!/usr/bin/env python3
"""
Pase HD 2x (48x48 -> 96x96) con Lanczos + UnsharpMask calibrado + micro-contraste
sobre los iconos oficiales AoE2:DE en assets/icons/aoe2/.
Idempotente: solo procesa imagenes menores a 96px para no sobre-enfocar jamas.
"""
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter

ICON_DIR = Path(__file__).resolve().parent.parent / "assets" / "icons" / "aoe2"

def main():
    upgraded = 0
    skipped = 0
    for p in sorted(ICON_DIR.glob("*.png")):
        with Image.open(p) as im:
            w, h = im.size
            if max(w, h) >= 96:
                skipped += 1
                continue
            rgba = im.convert("RGBA")
            # Reescalado 2x Lanczos (minimo 96x96)
            nw, nh = max(96, w * 2), max(96, h * 2)
            up = rgba.resize((nw, nh), Image.Resampling.LANCZOS)
            # Separar canal alpha para no generar halos en bordes transparentes
            r, g, b, a = up.split()
            rgb = Image.merge("RGB", (r, g, b))
            # Unsharp mask sutil de estudio: recupera nitidez de armaduras y bordes sin artefactos
            rgb = rgb.filter(ImageFilter.UnsharpMask(radius=1.1, percent=115, threshold=3))
            rgb = ImageEnhance.Contrast(rgb).enhance(1.05)
            rgb = ImageEnhance.Color(rgb).enhance(1.04)
            out = Image.merge("RGBA", (*rgb.split(), a))
            out.save(p, format="PNG", optimize=True)
            upgraded += 1
    print(f"sharpen-aoe2-icons: {upgraded} iconos subidos a HD 96x96, {skipped} ya estaban en HD")

if __name__ == "__main__":
    main()
