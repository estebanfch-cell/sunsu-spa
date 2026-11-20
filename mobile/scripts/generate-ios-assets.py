#!/usr/bin/env python3
"""Genera el App Icon (1024x1024 RGB sin alfa) y el Splash (2732x2732) de Sunsu Spa
a partir del logo oficial del repo (assets/sunsu-logo-celeste.png). Uso: python3 mobile/scripts/generate-ios-assets.py"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
XC = ROOT / "mobile/ios/App/App/Assets.xcassets"
LOGO = ROOT / "assets/sunsu-logo-celeste.png"
CREMA = (0xF5, 0xF0, 0xE8)


def logo_recortado():
    im = Image.open(LOGO).convert("RGBA")
    return im.crop(im.getbbox())


def lienzo(lado, ancho_logo, dy=0):
    logo = logo_recortado()
    w = int(ancho_logo)
    h = round(logo.height * w / logo.width)
    logo = logo.resize((w, h), Image.LANCZOS)
    base = Image.new("RGBA", (lado, lado), CREMA + (255,))
    base.alpha_composite(logo, ((lado - w) // 2, (lado - h) // 2 + dy))
    return base.convert("RGB")  # sin canal alfa (requisito de Apple para el icono)


def main():
    icon = lienzo(1024, 1024 * 0.70)
    icon_dir = XC / "AppIcon.appiconset"
    for f in icon_dir.glob("*.png"):
        f.unlink()
    icon.save(icon_dir / "AppIcon-1024.png", optimize=True)
    (icon_dir / "Contents.json").write_text(
        '{\n  "images" : [\n    {\n      "filename" : "AppIcon-1024.png",\n      "idiom" : "universal",\n'
        '      "platform" : "ios",\n      "size" : "1024x1024"\n    }\n  ],\n  "info" : {\n    "author" : "xcode",\n    "version" : 1\n  }\n}\n'
    )
    splash = lienzo(2732, 640)
    sd = XC / "Splash.imageset"
    for n in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
        splash.save(sd / n, optimize=True)
    for p in [icon_dir / "AppIcon-1024.png", sd / "splash-2732x2732.png"]:
        im = Image.open(p)
        assert im.mode == "RGB", (p, im.mode)
        print(p.relative_to(ROOT), im.size, im.mode)


if __name__ == "__main__":
    main()
