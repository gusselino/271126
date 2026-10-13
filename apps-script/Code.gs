/**
 * 271126 – baksidan. Ligger som Apps Script i kalkylarket "271126 gästlista".
 *
 * Flikar:
 *   Länkar         A kod | B namn | C platser | D spärrad | E länk | F tackat ja | G inne | H senast insläppt
 *   Inställningar  A1 "PIN" | B1 vaktens kod
 *
 * En rad = en inbjudan = en biljett. "platser" är hur många personer biljetten gäller för
 * (1 = bara personen, 2 = plus en, 3 = plus två). "inne" räknas upp i dörren.
 *
 * Kör funktionen "installera" en gång. Därefter: Deploy → New deployment → Web app,
 * Execute as: Me, Who has access: Anyone.
 */

const SAJT = 'https://271126.com/';
const TECKEN = 'abcdefghjkmnpqrstuvwxyz23456789'; // inga förväxlingsbara tecken
const K = { kod: 1, namn: 2, platser: 3, sparrad: 4, lank: 5, ja: 6, inne: 7, senast: 8 };

function onOpen() {
  SpreadsheetApp.getUi().createMenu('271126')
    .addItem('Skapa länkar för nya rader', 'skapaLankar')
    .addToUi();
}

function installera() {
  const ss = SpreadsheetApp.getActive();
  const s = ss.getSheetByName('Länkar') || ss.insertSheet('Länkar');
  if (s.getLastRow() === 0) s.appendRow(['kod', 'namn', 'platser', 'spärrad', 'länk', 'tackat ja', 'inne', 'senast insläppt']);
  s.setFrozenRows(1);
  const inst = ss.getSheetByName('Inställningar') || ss.insertSheet('Inställningar');
  if (!inst.getRange('B1').getValue()) {
    inst.getRange('A1:B1').setValues([['PIN', String(Math.floor(1000 + Math.random() * 9000))]]);
  }
}

function slump(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += TECKEN.charAt(Math.floor(Math.random() * TECKEN.length));
  return s;
}

/** Fyller i kod och länk på alla rader i Länkar som har namn men saknar kod. */
function skapaLankar() {
  const s = SpreadsheetApp.getActive().getSheetByName('Länkar');
  const rader = s.getDataRange().getValues();
  const finns = new Set(rader.slice(1).map(r => String(r[0])));
  for (let i = 1; i < rader.length; i++) {
    if (rader[i][0] || !rader[i][1]) continue;
    let kod;
    do { kod = slump(8); } while (finns.has(kod));
    finns.add(kod);
    s.getRange(i + 1, K.kod).setValue(kod);
    s.getRange(i + 1, K.platser).setValue(Math.max(1, Number(rader[i][2]) || 1));
    s.getRange(i + 1, K.lank).setValue(SAJT + '?' + kod);
  }
}

// ---------------------------------------------------------------- data

function blad() { return SpreadsheetApp.getActive().getSheetByName('Länkar'); }

function allaLankar() {
  return blad().getDataRange().getValues().slice(1).map((r, i) => ({
    rad: i + 2, kod: String(r[0]), namn: String(r[1]), platser: Math.max(1, Number(r[2]) || 1),
    sparrad: !!r[3], ja: r[5] ? r[5] : null, inne: Number(r[6]) || 0, senast: r[7] ? r[7] : null,
  })).filter(l => l.kod);
}

function lasLank(kod) { return allaLankar().filter(l => l.kod === kod)[0] || null; }

function pinOk(pin) {
  const ratt = String(SpreadsheetApp.getActive().getSheetByName('Inställningar').getRange('B1').getValue());
  return ratt !== '' && String(pin) === ratt;
}

function klockslag(d) { return Utilities.formatDate(new Date(d), 'Europe/Stockholm', 'HH:mm'); }

/** Räknare som dörrsidan visar: inne just nu, och hur många platser som har tackat ja. */
function rakna(alla) {
  return {
    inne: alla.reduce((s, l) => s + l.inne, 0),
    totalt: alla.filter(l => l.ja && !l.sparrad).reduce((s, l) => s + l.platser, 0),
  };
}

// ---------------------------------------------------------------- handlingar

function visaLank(kod) {
  const l = lasLank(kod);
  if (!l || l.sparrad) return { ok: false, fel: 'okänd' };
  return { ok: true, namn: l.namn, platser: l.platser, ja: !!l.ja };
}

function tackaJa(kod) {
  const las = LockService.getScriptLock();
  las.waitLock(20000);
  try {
    const l = lasLank(kod);
    if (!l || l.sparrad) return { ok: false, fel: 'okänd' };
    if (!l.ja) { blad().getRange(l.rad, K.ja).setValue(new Date()); SpreadsheetApp.flush(); }
    return { ok: true, namn: l.namn, platser: l.platser, ja: true };
  } finally { las.releaseLock(); }
}

/**
 * Dörren. Utan antal: en biljett för en person släpps in direkt, en biljett för flera
 * svarar med hur många som är kvar så att vakten väljer. Med antal: släpper in så många.
 */
function slappIn(kod, pin, antal) {
  if (!pinOk(pin)) return { ok: false, fel: 'pin' };
  const las = LockService.getScriptLock();
  las.waitLock(20000);
  try {
    const alla = allaLankar();
    const l = alla.filter(x => x.kod === kod)[0];
    const r = rakna(alla);
    if (!l) return { ok: false, fel: 'okänd', inne: r.inne, totalt: r.totalt };
    const bas = { namn: l.namn, platser: l.platser, inne: r.inne, totalt: r.totalt };
    if (l.sparrad) return Object.assign({ ok: false, fel: 'spärrad' }, bas);
    const kvar = l.platser - l.inne;
    if (kvar <= 0) return Object.assign({ ok: false, fel: 'använd', tid: l.senast ? klockslag(l.senast) : '' }, bas);
    let n = Number(antal) || 0;
    if (!n && l.platser === 1) n = 1;
    if (!n) return Object.assign({ ok: true, klar: false, redan: l.inne, kvar: kvar }, bas);
    if (n < 1 || n > kvar || n !== Math.floor(n)) return Object.assign({ ok: false, fel: 'antal', kvar: kvar }, bas);
    blad().getRange(l.rad, K.inne, 1, 2).setValues([[l.inne + n, new Date()]]);
    SpreadsheetApp.flush();
    return Object.assign({ ok: true, klar: true, antal: n, kvar: kvar - n }, bas, { inne: r.inne + n });
  } finally { las.releaseLock(); }
}

function lage(pin) {
  if (!pinOk(pin)) return { ok: false, fel: 'pin' };
  return Object.assign({ ok: true }, rakna(allaLankar()));
}

// ---------------------------------------------------------------- webbapp

function svar(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const p = e.parameter || {};
  try {
    if (p.a === 'l') return svar(visaLank(String(p.k || '')));
    return svar({ ok: false, fel: 'fråga' });
  } catch (err) {
    return svar({ ok: false, fel: 'server', detalj: String(err) });
  }
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents || '{}');
    if (p.a === 'ja') return svar(tackaJa(String(p.k || '')));
    if (p.a === 'in') return svar(slappIn(String(p.b || ''), p.pin, p.antal));
    if (p.a === 'lage') return svar(lage(p.pin));
    return svar({ ok: false, fel: 'fråga' });
  } catch (err) {
    return svar({ ok: false, fel: 'server', detalj: String(err) });
  }
}
