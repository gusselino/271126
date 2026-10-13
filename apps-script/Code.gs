/**
 * 271126 – baksidan. Ligger som Apps Script i kalkylarket "271126 gästlista".
 *
 * Flikar:
 *   Länkar      A kod | B namn | C platser | D spärrad | E länk | F tagna
 *   Biljetter   A id  | B kod  | C namn    | D skapad  | E insläppt
 *   Inställningar  A1 "PIN" | B1 vaktens kod
 *
 * Kör funktionen "installera" en gång. Därefter: Deploy → New deployment → Web app,
 * Execute as: Me, Who has access: Anyone.
 */

const SAJT = 'https://271126.com/';
const TECKEN = 'abcdefghjkmnpqrstuvwxyz23456789'; // inga förväxlingsbara tecken

function onOpen() {
  SpreadsheetApp.getUi().createMenu('271126')
    .addItem('Skapa länkar för nya rader', 'skapaLankar')
    .addToUi();
}

function installera() {
  const ss = SpreadsheetApp.getActive();
  const flik = (namn, rubriker) => {
    const s = ss.getSheetByName(namn) || ss.insertSheet(namn);
    if (s.getLastRow() === 0) s.appendRow(rubriker);
    s.setFrozenRows(1);
    return s;
  };
  flik('Länkar', ['kod', 'namn', 'platser', 'spärrad', 'länk', 'tagna']);
  flik('Biljetter', ['id', 'kod', 'namn', 'skapad', 'insläppt']);
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
    do { kod = slump(6); } while (finns.has(kod));
    finns.add(kod);
    const platser = Number(rader[i][2]) || 1;
    s.getRange(i + 1, 1, 1, 6).setValues([[kod, rader[i][1], platser, rader[i][3] || '', SAJT + '?' + kod,
      '=COUNTIF(Biljetter!B:B;A' + (i + 1) + ')']]);
  }
}

// ---------------------------------------------------------------- data

function lasLank(kod) {
  const rader = SpreadsheetApp.getActive().getSheetByName('Länkar').getDataRange().getValues();
  for (let i = 1; i < rader.length; i++) {
    if (String(rader[i][0]) === kod) {
      return { kod: kod, namn: String(rader[i][1]), platser: Number(rader[i][2]) || 1, sparrad: !!rader[i][3] };
    }
  }
  return null;
}

function lasBiljetter() {
  const rader = SpreadsheetApp.getActive().getSheetByName('Biljetter').getDataRange().getValues();
  return rader.slice(1).filter(r => r[0]).map((r, i) => ({
    rad: i + 2, id: String(r[0]), kod: String(r[1]), namn: String(r[2]), inne: r[4] ? r[4] : null,
  }));
}

function pinOk(pin) {
  const ratt = String(SpreadsheetApp.getActive().getSheetByName('Inställningar').getRange('B1').getValue());
  return ratt !== '' && String(pin) === ratt;
}

function stadaNamn(n) {
  return String(n || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

function klockslag(d) {
  return Utilities.formatDate(new Date(d), 'Europe/Stockholm', 'HH:mm');
}

// ---------------------------------------------------------------- handlingar

function visaLank(kod) {
  const l = lasLank(kod);
  if (!l) return { ok: false, fel: 'okänd' };
  if (l.sparrad) return { ok: false, fel: 'spärrad' };
  const b = lasBiljetter().filter(x => x.kod === kod).map(x => ({ id: x.id, namn: x.namn }));
  return { ok: true, platser: l.platser, biljetter: b, kvar: Math.max(0, l.platser - b.length) };
}

function taBiljett(kod, namn) {
  namn = stadaNamn(namn);
  if (namn.length < 2) return { ok: false, fel: 'namn' };
  const las = LockService.getScriptLock();
  las.waitLock(20000);
  try {
    const l = lasLank(kod);
    if (!l) return { ok: false, fel: 'okänd' };
    if (l.sparrad) return { ok: false, fel: 'spärrad' };
    const alla = lasBiljetter();
    if (alla.filter(x => x.kod === kod).length >= l.platser) return { ok: false, fel: 'fullt' };
    const finns = new Set(alla.map(x => x.id));
    let id;
    do { id = slump(10); } while (finns.has(id));
    SpreadsheetApp.getActive().getSheetByName('Biljetter').appendRow([id, kod, namn, new Date(), '']);
    SpreadsheetApp.flush();
    return { ok: true, biljett: { id: id, namn: namn } };
  } finally {
    las.releaseLock();
  }
}

function slappIn(id, pin) {
  if (!pinOk(pin)) return { ok: false, fel: 'pin' };
  const las = LockService.getScriptLock();
  las.waitLock(20000);
  try {
    const alla = lasBiljetter();
    const b = alla.filter(x => x.id === id)[0];
    const inne = alla.filter(x => x.inne).length;
    if (!b) return { ok: false, fel: 'okänd', inne: inne, totalt: alla.length };
    const l = lasLank(b.kod);
    if (l && l.sparrad) return { ok: false, fel: 'spärrad', namn: b.namn, inne: inne, totalt: alla.length };
    if (b.inne) return { ok: false, fel: 'använd', namn: b.namn, tid: klockslag(b.inne), inne: inne, totalt: alla.length };
    SpreadsheetApp.getActive().getSheetByName('Biljetter').getRange(b.rad, 5).setValue(new Date());
    SpreadsheetApp.flush();
    return { ok: true, namn: b.namn, via: l ? l.namn : '', inne: inne + 1, totalt: alla.length };
  } finally {
    las.releaseLock();
  }
}

function lage(pin) {
  if (!pinOk(pin)) return { ok: false, fel: 'pin' };
  const alla = lasBiljetter();
  return { ok: true, inne: alla.filter(x => x.inne).length, totalt: alla.length };
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
    if (p.a === 'ta') return svar(taBiljett(String(p.k || ''), p.namn));
    if (p.a === 'in') return svar(slappIn(String(p.b || ''), p.pin));
    if (p.a === 'lage') return svar(lage(p.pin));
    return svar({ ok: false, fel: 'fråga' });
  } catch (err) {
    return svar({ ok: false, fel: 'server', detalj: String(err) });
  }
}
