#!/usr/bin/env python3
"""Ritar Gamla stan som grön linjekarta (SVG) ur OpenStreetMap-data i osm.json och skriver docs/karta.js.

Data hämtas med Overpass (se README). Kartdata © OpenStreetMaps bidragsgivare.
"""
import json
import math
from pathlib import Path

HAR = Path(__file__).parent
S, V, N, O = 59.3208, 18.0628, 59.3287, 18.0778          # utsnittet
MAL = (59.3239719, 18.0741567)                            # Pelikansgränd 5 enligt Nominatim
B = 320
kx = math.cos(math.radians((S + N) / 2))
skala = B / ((O - V) * kx)
H = round((N - S) * skala)


def xy(lat, lon):
    return round((lon - V) * kx * skala, 1), round((N - lat) * skala, 1)


def bana(g):
    p = [xy(n["lat"], n["lon"]) for n in g]
    return "M" + "L".join(f"{x} {y}" for x, y in p)


GATOR = {"pedestrian", "residential", "tertiary", "unclassified", "secondary", "living_street", "trunk", "primary", "tertiary_link", "secondary_link", "trunk_link"}
el = json.load(open(HAR / "osm.json"))["elements"]
gator, kust, malgata, namn = [], [], [], {}
for e in el:
    if e["type"] != "way" or "geometry" not in e:
        continue
    t = e.get("tags", {})
    if t.get("natural") == "coastline":
        kust.append(bana(e["geometry"]))
    elif t.get("highway") in GATOR and t.get("area") != "yes":
        (malgata if t.get("name") == "Pelikansgränd" else gator).append(bana(e["geometry"]))
        if t.get("name"):
            namn.setdefault(t["name"], []).extend(e["geometry"])


def mitt(n):
    g = namn[n]
    return xy(sum(p["lat"] for p in g) / len(g), sum(p["lon"] for p in g) / len(g))


etiketter = ""
for n, visat in [("Västerlånggatan", "VÄSTERLÅNGG."), ("Österlånggatan", "ÖSTERLÅNGG."), ("Stortorget", "STORTORGET"), ("Skeppsbron", "SKEPPSBRON"), ("Järntorget", "JÄRNTORGET")]:
    if n in namn:
        x, y = mitt(n)
        etiketter += f'<text x="{x}" y="{y}">{visat}</text>'
mx, my = xy(*MAL)
svg = (f'<svg viewBox="0 0 {B} {H}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">'
       f'<path class="kust" d="{"".join(kust)}"/><path class="gator" d="{"".join(gator)}"/><path class="mal" d="{"".join(malgata)}"/>'
       f'<g class="namn">{etiketter}</g>'
       f'<g class="har"><circle cx="{mx}" cy="{my}" r="9"/><circle class="prick" cx="{mx}" cy="{my}" r="3"/>'
       f'<path d="M{mx - 9} {my}H{mx - 60}"/><text x="{mx - 62}" y="{my + 3}" text-anchor="end">PELIKANSGRÄND 5</text></g></svg>')
(HAR.parent / "docs" / "karta.js").write_text("// Byggd av karta/bygg.py. Kartdata © OpenStreetMaps bidragsgivare.\nconst KARTA = " + json.dumps(svg, ensure_ascii=False) + ";\n", encoding="utf-8")
(HAR / "forhands.html").write_text(f"<body style='background:#050505;color:#c8f7c5;margin:20px'><style>svg{{width:640px}}.gator{{stroke-width:.7;opacity:.75}}.kust{{stroke-width:.9;opacity:.5;stroke-dasharray:2 2}}.mal{{stroke-width:2.2;stroke:#fff}}.namn text,.har text{{font:6px Menlo;fill:currentColor;stroke:none}}.har{{stroke:#fff;stroke-width:1}}.har text{{fill:#fff;font-size:8px}}.prick{{fill:#fff}}</style>{svg}", encoding="utf-8")
print(len(svg) // 1024, "kB", B, H, "mål", mx, my, "gator", len(gator), "namn", [n for n in ["Västerlånggatan", "Österlånggatan", "Stortorget", "Skeppsbron", "Järntorget"] if n in namn])
