#!/usr/bin/env python3
"""Lokal testserver: serverar docs/ och härmar Apps Script-baksidan på /api.

Samma regler som apps-script/Code.gs, med data i minnet. Vaktens kod är 1234.
Testlänkar: ?solo1111 (1 plats), ?plus1111 (2 platser), ?plus2222 (3 platser), ?sparr111 (spärrad).
"""
import json
import sys
import threading
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

SITE = Path(__file__).resolve().parent.parent / "docs"
PIN = "1234"


def ny():
    return {
        "solo1111": {"namn": "Anna Test", "platser": 1, "sparrad": False, "svar": "", "gaster": [], "inne": {}, "ord": ""},
        "plus1111": {"namn": "Erik Test", "villkor": "en tjej", "platser": 2, "sparrad": False, "svar": "", "gaster": [], "inne": {}, "ord": ""},
        "plus2222": {"namn": "Maja Test", "platser": 3, "sparrad": False, "svar": "", "gaster": [], "inne": {}, "ord": ""},
        "sparr111": {"namn": "Test Spärrad", "platser": 1, "sparrad": True, "svar": "", "gaster": [], "inne": {}, "ord": ""},
    }


LANKAR = ny()
LAS = threading.Lock()


def rakna():
    return {"inne": sum(len(l["inne"]) for l in LANKAR.values()),
            "totalt": sum(l["platser"] for l in LANKAR.values() if l["svar"] == "ja" and not l["sparrad"])}


def visa(kod):
    l = LANKAR.get(kod)
    if not l or l["sparrad"]:
        return {"ok": False, "fel": "okänd"}
    return {"ok": True, "namn": l["namn"], "platser": l["platser"], "svar": l["svar"], "gaster": l["gaster"], "villkor": l.get("villkor", ""),
            "ord": l["ord"], "inslappta": l["inne"]}


def stada_ord(o):
    return "".join(c for c in str(o or "") if c.isalpha())[:14].upper()


def svara(kod, svar, ord=""):
    if svar not in ("ja", "kanske", "nej"):
        return {"ok": False, "fel": "svar"}
    with LAS:
        l = LANKAR.get(kod)
        if not l or l["sparrad"]:
            return {"ok": False, "fel": "okänd"}
        l["svar"] = svar
        if stada_ord(ord):
            l["ord"] = stada_ord(ord)
        return {"ok": True, "namn": l["namn"], "platser": l["platser"], "svar": svar, "gaster": l["gaster"],
                "villkor": l.get("villkor", ""), "ord": l["ord"], "inslappta": l["inne"]}


def spara_gaster(kod, gaster):
    lista = [" ".join(str(g or "").replace("<", "").replace(">", "").replace(";", "").split())[:60] for g in (gaster if isinstance(gaster, list) else [])]
    lista = [g for g in lista if g]
    with LAS:
        l = LANKAR.get(kod)
        if not l or l["sparrad"]:
            return {"ok": False, "fel": "okänd"}
        l["gaster"] = lista[: l["platser"] - 1]
        return {"ok": True, "namn": l["namn"], "platser": l["platser"], "svar": l["svar"], "gaster": l["gaster"]}


def slapp_in(biljett, pin):
    if str(pin) != PIN:
        return {"ok": False, "fel": "pin"}
    kod, _, p = str(biljett).partition("-")
    plats = int(p) if p.isdigit() else 1
    with LAS:
        l = LANKAR.get(kod)
        r = rakna()
        if not l or plats < 1 or plats > l["platser"]:
            return {"ok": False, "fel": "okänd", **r}
        bas = {"namn": l["namn"] if plats == 1 else (l["gaster"][plats - 2] if len(l["gaster"]) >= plats - 1 else ""),
               "vard": "" if plats == 1 else l["namn"], "ord": l["ord"], "plats": plats, "platser": l["platser"], **r}
        if l["sparrad"]:
            return {"ok": False, "fel": "spärrad", **bas}
        if str(plats) in l["inne"]:
            return {"ok": False, "fel": "använd", "tid": l["inne"][str(plats)], **bas}
        l["inne"][str(plats)] = datetime.now().strftime("%H:%M")
        return {"ok": True, "klar": True, "pabiljetten": len(l["inne"]), **bas, "inne": r["inne"] + 1}


def lista(pin):
    if str(pin) != PIN:
        return {"ok": False, "fel": "pin"}
    ut = []
    for kod, l in LANKAR.items():
        if l["sparrad"]:
            continue
        for p in range(1, l["platser"] + 1):
            ut.append({"b": f"{kod}-{p}", "namn": l["namn"] if p == 1 else (l["gaster"][p - 2] if len(l["gaster"]) >= p - 1 else ""),
                       "vard": "" if p == 1 else l["namn"], "svar": l["svar"], "inne": l["inne"].get(str(p), "")})
    return {"ok": True, "personer": ut, **rakna()}


def lage(pin):
    if str(pin) != PIN:
        return {"ok": False, "fel": "pin"}
    return {"ok": True, **rakna()}


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(SITE), **k)

    def _json(self, o):
        data = json.dumps(o, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        global LANKAR
        u = urlparse(self.path)
        if u.path == "/api":
            q = {k: v[0] for k, v in parse_qs(u.query).items()}
            return self._json(visa(q.get("k", "")) if q.get("a") == "l" else {"ok": False, "fel": "fråga"})
        if u.path == "/_data":
            return self._json(LANKAR)
        if u.path == "/_nollstall":
            LANKAR = ny()
            return self._json({"ok": True})
        super().do_GET()

    def do_POST(self):
        p = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        if p.get("a") == "gaster":
            return self._json(spara_gaster(str(p.get("k", "")), p.get("gaster")))
        if p.get("a") == "svar":
            return self._json(svara(str(p.get("k", "")), str(p.get("svar", "")), p.get("ord")))
        if p.get("a") == "in":
            return self._json(slapp_in(str(p.get("b", "")), p.get("pin")))
        if p.get("a") == "lista":
            return self._json(lista(p.get("pin")))
        if p.get("a") == "lage":
            return self._json(lage(p.get("pin")))
        self._json({"ok": False, "fel": "fråga"})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
