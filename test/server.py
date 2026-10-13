#!/usr/bin/env python3
"""Lokal testserver: serverar site/ och härmar Apps Script-baksidan på /api.

Samma regler som apps-script/Code.gs, med data i minnet. Vaktens kod är 1234.
Testlänkar: ?solo11 (1 plats), ?plus11 (2 platser), ?plus22 (3 platser), ?sparr1 (spärrad).
"""
import json
import random
import re
import sys
import threading
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

SITE = Path(__file__).resolve().parent.parent / "site"
PIN = "1234"
LANKAR = {
    "solo11": {"namn": "Test Solo", "platser": 1, "sparrad": False},
    "plus11": {"namn": "Test Plus Ett", "platser": 2, "sparrad": False},
    "plus22": {"namn": "Test Plus Två", "platser": 3, "sparrad": False},
    "sparr1": {"namn": "Test Spärrad", "platser": 1, "sparrad": True},
}
BILJETTER = []  # {id, kod, namn, inne}
LAS = threading.Lock()
TECKEN = "abcdefghjkmnpqrstuvwxyz23456789"


def stada(n):
    return re.sub(r"\s+", " ", re.sub(r"[<>]", "", str(n or ""))).strip()[:40]


def visa(kod):
    l = LANKAR.get(kod)
    if not l:
        return {"ok": False, "fel": "okänd"}
    if l["sparrad"]:
        return {"ok": False, "fel": "spärrad"}
    b = [{"id": x["id"], "namn": x["namn"]} for x in BILJETTER if x["kod"] == kod]
    return {"ok": True, "platser": l["platser"], "biljetter": b, "kvar": max(0, l["platser"] - len(b))}


def ta(kod, namn):
    namn = stada(namn)
    if len(namn) < 2:
        return {"ok": False, "fel": "namn"}
    with LAS:
        l = LANKAR.get(kod)
        if not l:
            return {"ok": False, "fel": "okänd"}
        if l["sparrad"]:
            return {"ok": False, "fel": "spärrad"}
        if len([x for x in BILJETTER if x["kod"] == kod]) >= l["platser"]:
            return {"ok": False, "fel": "fullt"}
        bid = "".join(random.choice(TECKEN) for _ in range(10))
        BILJETTER.append({"id": bid, "kod": kod, "namn": namn, "inne": None})
        return {"ok": True, "biljett": {"id": bid, "namn": namn}}


def slapp_in(bid, pin):
    if str(pin) != PIN:
        return {"ok": False, "fel": "pin"}
    with LAS:
        inne = len([x for x in BILJETTER if x["inne"]])
        b = next((x for x in BILJETTER if x["id"] == bid), None)
        if not b:
            return {"ok": False, "fel": "okänd", "inne": inne, "totalt": len(BILJETTER)}
        if LANKAR[b["kod"]]["sparrad"]:
            return {"ok": False, "fel": "spärrad", "namn": b["namn"], "inne": inne, "totalt": len(BILJETTER)}
        if b["inne"]:
            return {"ok": False, "fel": "använd", "namn": b["namn"], "tid": b["inne"], "inne": inne, "totalt": len(BILJETTER)}
        b["inne"] = datetime.now().strftime("%H:%M")
        return {"ok": True, "namn": b["namn"], "via": LANKAR[b["kod"]]["namn"], "inne": inne + 1, "totalt": len(BILJETTER)}


def lage(pin):
    if str(pin) != PIN:
        return {"ok": False, "fel": "pin"}
    return {"ok": True, "inne": len([x for x in BILJETTER if x["inne"]]), "totalt": len(BILJETTER)}


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

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/api":
            q = {k: v[0] for k, v in parse_qs(u.query).items()}
            return self._json(visa(q.get("k", "")) if q.get("a") == "l" else {"ok": False, "fel": "fråga"})
        if u.path == "/_data":
            return self._json({"biljetter": BILJETTER})
        super().do_GET()

    def do_POST(self):
        p = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        if p.get("a") == "ta":
            return self._json(ta(str(p.get("k", "")), p.get("namn")))
        if p.get("a") == "in":
            return self._json(slapp_in(str(p.get("b", "")), p.get("pin")))
        if p.get("a") == "lage":
            return self._json(lage(p.get("pin")))
        self._json({"ok": False, "fel": "fråga"})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
