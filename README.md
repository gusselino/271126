# 271126

Festinbjudan med personliga länkar och biljetter som skannas i dörren.

- `docs/` – det som ligger på 271126.com: gästsidan (`index.html`) och dörrsidan (`v.html`).
- `apps-script/Code.gs` – baksidan. Klistras in som Apps Script i kalkylarket med gästlistan.
- `test/server.py` – lokal testserver som härmar baksidan. Kör `python3 test/server.py` och öppna
  `http://localhost:8766/?plus2222`. Dörrkoden i testet är 1234.

Adressen till baksidan står överst i `docs/app.js` (`API_SKARP`). Tider och texter står i `FEST` i samma fil.
