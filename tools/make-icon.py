"""Genera los iconos de la app a partir de assets/app-icon-source.png (Rojos.png).

Uso:  python tools/make-icon.py

Salida:
  assets/app-icon.png  -> 256x256 PNG con fondo transparente (ventanas / bandeja)
  assets/icon.ico      -> 16/24/32/48/64/128/256 (electron-builder, exe, accesos)

El PNG original es 1536x1024 con fondo transparente: se recorta al contenido
real y se encuadra en un lienzo cuadrado con un margen, para que el escudo no
quede pegado a los bordes en el icono de 16px.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "app-icon-source.png"
PNG_OUT = ROOT / "assets" / "app-icon.png"
ICO_OUT = ROOT / "assets" / "icon.ico"

CANVAS = 256
PADDING = 18
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def build() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    alpha = source.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise SystemExit("la imagen no tiene contenido visible")
    content = source.crop(bbox)

    size = CANVAS - PADDING * 2
    content.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(
        content,
        ((CANVAS - content.width) // 2, (CANVAS - content.height) // 2),
        content,
    )
    canvas.save(PNG_OUT, optimize=True)

    canvas.save(ICO_OUT, format="ICO", sizes=ICO_SIZES)
    print(f"origen: {SOURCE.name} {source.size} · recorte {bbox}")
    print(f"escrito: {PNG_OUT.relative_to(ROOT)} ({PNG_OUT.stat().st_size} bytes)")
    print(f"escrito: {ICO_OUT.relative_to(ROOT)} ({ICO_OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    build()
