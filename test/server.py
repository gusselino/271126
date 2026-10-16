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
        "solo1111": {"namn": "Anna Test", "platser": 1, "sparrad": False, "svar": "", "gaster": [], "inne": 0, "senast": None},
        "plus1111": {"namn": "Erik Test", "villkor": "en tjej", "platser": 2, "sparrad": False, "svar": "", "gaster": [], "inne": 0, "senast": None},
        "plus2222": {"namn": "Maja Test", "platser": 3, "sparrad": False, "svar": "", "gaster": [], "inne": 0, "senast": None},
        "sparr111": {"namn": "Test Spärrad", "platser": 1, "sparrad": True, "svar": "", "gaster": [], "inne": 0, "senast": None},
    }


LANKAR = ny()
LAS = threading.Lock()


def rakna():
    return {"inne": sum(l["inne"] for l in LANKAR.values()),
            "totalt": sum(l["platser"] for l in LANKAR.values() if l["svar"] == "ja" and not l["sparrad"])}


def visa(kod):
    l = LANKAR.get(kod)
    if not l or l["sparrad"]:
        return {"ok": False, "fel": "okänd"}
    return {"ok": True, "namn": l["namn"], "platser": l["platser"], "svar": l["svar"], "gaster": l["gaster"], "villkor": l.get("villkor", "")}


def svara(kod, svar):
    if svar not in ("ja", "kanske", "nej"):
        return {"ok": False, "fel": "svar"}
    with LAS:
        l = LANKAR.get(kod)
        if not l or l["sparrad"]:
            return {"ok": False, "fel": "okänd"}
        l["svar"] = svar
        return {"ok": True, "namn": l["namn"], "platser": l["platser"], "svar": svar, "gaster": l["gaster"]}


def spara_gaster(kod, gaster):
    lista = [" ".join(str(g or "").replace("<", "").replace(">", "").replace(";", "").split())[:60] for g in (gaster if isinstance(gaster, list) else [])]
    lista = [g for g in lista if g]
    with LAS:
        l = LANKAR.get(kod)
        if not l or l["sparrad"]:
            return {"ok": False, "fel": "okänd"}
        l["gaster"] = lista[: l["platser"] - 1]
        return {"ok": True, "namn": l["namn"], "platser": l["platser"], "svar": l["svar"], "gaster": l["gaster"]}


def slapp_in(kod, pin, antal):
    if str(pin) != PIN:
        return {"ok": False, "fel": "pin"}
    with LAS:
        l = LANKAR.get(kod)
        r = rakna()
        if not l:
            return {"ok": False, "fel": "okänd", **r}
        bas = {"namn": l["namn"], "platser": l["platser"], "gaster": l["gaster"], **r}
        if l["sparrad"]:
            return {"ok": False, "fel": "spärrad", **bas}
        kvar = l["platser"] - l["inne"]
        if kvar <= 0:
            return {"ok": False, "fel": "använd", "tid": l["senast"] or "", **bas}
        try:
            n = float(antal or 0)
        except (TypeError, ValueError):
            n = 0
        if not n and l["platser"] == 1:
            n = 1
        if not n:
            return {"ok": True, "klar": False, "redan": l["inne"], "kvar": kvar, **bas}
        if n < 1 or n > kvar or n != int(n):
            return {"ok": False, "fel": "antal", "kvar": kvar, **bas}
        n = int(n)
        l["inne"] += n
        l["senast"] = datetime.now().strftime("%H:%M")
        return {"ok": True, "klar": True, "antal": n, "kvar": kvar - n, **bas, "inne": r["inne"] + n}


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
            ut = svara(str(p.get("k", "")), str(p.get("svar", "")))
            if ut.get("ok") and p.get("ord"):
                LANKAR[p["k"]]["ord"] = str(p["ord"])[:14]
                ut["ord"] = LANKAR[p["k"]]["ord"]
            return self._json(ut)
        if p.get("a") == "in":
            return self._json(slapp_in(str(p.get("b", "")), p.get("pin"), p.get("antal")))
        if p.get("a") == "lage":
            return self._json(lage(p.get("pin")))
        self._json({"ok": False, "fel": "fråga"})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
