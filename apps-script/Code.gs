/**
 * 271126 – baksidan. Ligger som Apps Script i kalkylarket "271126 gästlista".
 *
 * Flikar:
 *   Länkar         A kod | B namn | C platser | D spärrad | E länk | F svar (ja/kanske/nej) | G inne | H senast insläppt  | I svarade | J gäster | K telefon | L sms | M villkor för plus
 *   (villkor: fri text som gästen ser, t.ex. "en tjej")
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
const K = { kod: 1, namn: 2, platser: 3, sparrad: 4, lank: 5, svar: 6, inne: 7, senast: 8, svarade: 9, gaster: 10, telefon: 11, sms: 12, villkor: 13 };
const SVAR = ['ja', 'kanske', 'nej'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('271126')
    .addItem('Skapa länkar för nya rader', 'skapaLankar')
    .addItem('Uppdatera sms-länkar', 'smsLankar')
    .addToUi();
}

function installera() {
  const ss = SpreadsheetApp.getActive();
  const s = ss.getSheetByName('Länkar') || ss.insertSheet('Länkar');
  if (s.getLastRow() === 0) s.appendRow(['kod', 'namn', 'platser', 'spärrad', 'länk', 'svar', 'inne', 'senast insläppt', 'svarade', 'gäster', 'telefon', 'sms', 'villkor för plus']);
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
  smsLankar();
}

/** Sms-kolumnen: en länk per rad som öppnar Meddelanden med färdig text, om telefonnumret är ifyllt. */
function smsLankar() {
  const s = SpreadsheetApp.getActive().getSheetByName('Länkar');
  const rader = s.getDataRange().getValues();
  for (let i = 1; i < rader.length; i++) {
    const kod = String(rader[i][K.kod - 1]), tel = String(rader[i][K.telefon - 1]).replace(/[^0-9+]/g, '');
    if (!kod || !tel) continue;
    const n = Math.max(1, Number(rader[i][K.platser - 1]) || 1);
    const text = '271126. Det här är din länk, den gäller bara dig' + (n > 1 ? ' och ' + (n - 1) + ' till' : '') + ': ' + SAJT + '?' + kod;
    const adress = 'sms:' + tel + '&body=' + encodeURIComponent(text);
    s.getRange(i + 1, K.sms).setFormula('=HYPERLINK("' + adress + '";"skicka")');
  }
}

// ---------------------------------------------------------------- data

function blad() { return SpreadsheetApp.getActive().getSheetByName('Länkar'); }

function allaLankar() {
  return blad().getDataRange().getValues().slice(1).map((r, i) => ({
    rad: i + 2, kod: String(r[0]), namn: String(r[1]), platser: Math.max(1, Number(r[2]) || 1),
    sparrad: !!r[3], svar: SVAR.indexOf(String(r[5])) >= 0 ? String(r[5]) : '', inne: Number(r[6]) || 0, senast: r[7] ? r[7] : null,
    gaster: String(r[9] || '').split(';').map(x => x.trim()).filter(Boolean),
    villkor: String(r[12] || '').trim(),
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
    totalt: alla.filter(l => l.svar === 'ja' && !l.sparrad).reduce((s, l) => s + l.platser, 0),
  };
}

// ---------------------------------------------------------------- handlingar

function visaLank(kod) {
  const l = lasLank(kod);
  if (!l || l.sparrad) return { ok: false, fel: 'okänd' };
  return { ok: true, namn: l.namn, platser: l.platser, svar: l.svar, gaster: l.gaster, villkor: l.villkor };
}

/** Gästens svar. Kan ändras hur många gånger som helst; senaste svaret gäller. */
function svara(kod, svar) {
  if (SVAR.indexOf(svar) < 0) return { ok: false, fel: 'svar' };
  const las = LockService.getScriptLock();
  las.waitLock(20000);
  try {
    const l = lasLank(kod);
    if (!l || l.sparrad) return { ok: false, fel: 'okänd' };
    blad().getRange(l.rad, K.svar).setValue(svar);
    blad().getRange(l.rad, K.svarade).setValue(new Date());
    SpreadsheetApp.flush();
    return { ok: true, namn: l.namn, platser: l.platser, svar: svar, gaster: l.gaster };
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
    const bas = { namn: l.namn, platser: l.platser, gaster: l.gaster, inne: r.inne, totalt: r.totalt };
    if (l.sparrad) return Object.assign({ ok: false, fel: 'spärrad' }, bas);
    const kvar = l.platser - l.inne;
    if (kvar <= 0) return Object.assign({ ok: false, fel: 'använd', tid: l.senast ? klockslag(l.senast) : '' }, bas);
    let n = Number(antal) || 0;
    if (!n && l.platser === 1) n = 1;
    if (!n) return Object.assign({ ok: true, klar: false, redan: l.inne, kvar: kvar }, bas);
    if (n < 1 || n > kvar || n !== Math.floor(n)) return Object.assign({ ok: false, fel: 'antal', kvar: kvar }, bas);
    blad().getRange(l.rad, K.inne, 1, 2).setValues([[l.inne + n, new Date()]]);  // inne, senast insläppt
    SpreadsheetApp.flush();
    return Object.assign({ ok: true, klar: true, antal: n, kvar: kvar - n }, bas, { inne: r.inne + n });
  } finally { las.releaseLock(); }
}

function lage(pin) {
  if (!pinOk(pin)) return { ok: false, fel: 'pin' };
  return Object.assign({ ok: true }, rakna(allaLankar()));
}

/** Namnen på dem gästen tar med. Högst antal platser minus ett, förnamn och efternamn. */
function sparaGaster(kod, gaster) {
  const lista = (Array.isArray(gaster) ? gaster : []).map(g => String(g || '').replace(/[<>;]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)).filter(Boolean);
  const las = LockService.getScriptLock();
  las.waitLock(20000);
  try {
    const l = lasLank(kod);
    if (!l || l.sparrad) return { ok: false, fel: 'okänd' };
    const spara = lista.slice(0, l.platser - 1);
    blad().getRange(l.rad, K.gaster).setValue(spara.join('; '));
    SpreadsheetApp.flush();
    return { ok: true, namn: l.namn, platser: l.platser, svar: l.svar, gaster: spara };
  } finally { las.releaseLock(); }
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
    if (p.a === 'svar') return svar(svara(String(p.k || ''), String(p.svar || '')));
    if (p.a === 'gaster') return svar(sparaGaster(String(p.k || ''), p.gaster));
    if (p.a === 'in') return svar(slappIn(String(p.b || ''), p.pin, p.antal));
    if (p.a === 'lage') return svar(lage(p.pin));
    return svar({ ok: false, fel: 'fråga' });
  } catch (err) {
    return svar({ ok: false, fel: 'server', detalj: String(err) });
  }
}
