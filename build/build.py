#!/usr/bin/env python3
"""Gabungkan template + CSS + JS + data menjadi satu index.html mandiri.

Tidak ada referensi jaringan sama sekali: CSS, JS, data (dan font, bila ada)
di-inline agar berkas bisa dibuka langsung lewat file:// di komputer mana pun.
"""

import base64
import json
import os
import re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "src")
OUT = os.path.join(BASE, "index.html")

FONT = os.path.join(SRC, "fonts", "oswald-latin.woff2")


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def fmt_id(n):
    return f"{n:,}".replace(",", ".")


def main():
    data = json.loads(read(os.path.join(BASE, "data.json")))
    meta = data["meta"]
    insights = data["insights"]

    for key, name in (
        ("players_dim", "players.json"),
        ("winners", "winners.json"),
        ("performance", "performance.json"),
    ):
        path = os.path.join(SRC, name)
        if os.path.exists(path):
            data[key] = json.loads(read(path))

    images_manifest = os.path.join(SRC, "images.json")
    if os.path.exists(images_manifest):
        manifest = json.loads(read(images_manifest))
        images = {}
        inline_bytes = 0
        for kind, mapping in manifest.items():
            images[kind] = {}
            for name, rel in mapping.items():
                path = os.path.join(BASE, "assets", "img", rel)
                if not os.path.exists(path):
                    continue
                ext = os.path.splitext(path)[1].lower()
                mime = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"
                with open(path, "rb") as fh:
                    b64 = base64.b64encode(fh.read()).decode("ascii")
                images[kind][name] = f"data:{mime};base64,{b64}"
                inline_bytes += len(images[kind][name])
        data["images"] = images
        print(
            f"images       : {sum(len(v) for v in images.values())} "
            f"({inline_bytes / 1024 / 1024:.1f} MB inline)"
        )

    css = read(os.path.join(SRC, "styles.css"))
    charts = read(os.path.join(SRC, "charts.js"))
    app = read(os.path.join(SRC, "app.js"))
    views = read(os.path.join(SRC, "views.js"))
    html = read(os.path.join(SRC, "template.html"))

    if os.path.exists(FONT):
        with open(FONT, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode("ascii")
        # Oswald adalah variable font: satu berkas melayani weight 200-700.
        face = (
            "@font-face{font-family:'Oswald';font-style:normal;"
            "font-weight:200 700;font-display:swap;"
            f"src:url(data:font/woff2;base64,{b64}) format('woff2');}}\n"
        )
        css = face + css

    chips = ['<button class="chip" type="button" data-year="all" aria-pressed="true">Semua</button>']
    for y in data["years"]:
        chips.append(
            f'<button class="chip" type="button" data-year="{y["year"]}" aria-pressed="false">'
            f'{y["year"]}</button>'
        )

    tokens = {
        "YEAR_MIN": str(meta["yearMin"]),
        "YEAR_MAX": str(meta["yearMax"]),
        "MAPGAMES": fmt_id(meta["mapGames"]),
        "MATCHES": fmt_id(meta["matches"]),
        "TOURNAMENTS": fmt_id(meta["tournaments"]),
        "TOURNAMENT_IDS": fmt_id(meta["tournamentIds"]),
        "DUP_TOURNAMENTS": str(meta["duplicateTournamentNames"]),
        "MAPS": str(meta["maps"]),
        "TEAMS": fmt_id(meta["teams"]),
        "PLAYERS": fmt_id(meta["players"]),
        "RAWROWS": fmt_id(meta["rawRows"]),
        "EXCLUDED": str(meta["excluded"]),
        "COVERAGE": f'{insights["coverage2021_2022"] * 100:.1f}'.replace(".", ","),
        "YEAR_CHIPS": "\n      ".join(chips),
    }

    html = html.replace("/*STYLES*/", css)
    html = html.replace("/*CHARTS*/", charts)
    html = html.replace("/*APP*/", app)
    html = html.replace("/*VIEWS*/", views)
    html = html.replace("/*DATA*/", json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/"))

    for key, value in tokens.items():
        html = re.sub(r"\{\{" + key + r"\}\}", value, html)

    leftover = re.findall(r"\{\{[A-Z_]+\}\}", html)
    if leftover:
        raise SystemExit(f"Token belum terisi: {sorted(set(leftover))}")

    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(html)

    size = os.path.getsize(OUT)
    print(f"index.html   : {size:,} bytes ({size / 1024:.1f} KB)")
    print(f"font embedded: {'ya' if os.path.exists(FONT) else 'tidak'}")
    print(f"data         : {len(json.dumps(data)):,} chars json")
    print(f"players      : {'ya' if 'players_dim' in data else 'tidak'}")
    print(f"winners      : {'ya' if 'winners' in data else 'tidak'}")
    print(f"performance  : {'ya' if 'performance' in data else 'tidak'}")
    print(f"images       : {'ya' if 'images' in data else 'tidak'}")
    print(f"sections     : {html.count('<section')}")
    print(f"scripts      : {html.count('<script')}")


if __name__ == "__main__":
    main()
