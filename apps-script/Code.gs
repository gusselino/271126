/**
 * 271126 – baksidan. Ligger som Apps Script i kalkylarket "271126 gästlista".
 *
 * Flikar:
 *   Länkar         A kod | B namn | C platser | D spärrad | E länk | F svar (ja/kanske/nej) | G inne | H senast insläppt  | I svarade | J gäster | K telefon | L sms | M villkor för plus | N favoritord | O insläppta | P hemligt meddelande
 *   (villkor: fri text som gästen ser, t.ex. "en tjej")
 *   Inställningar  A1 "PIN" | B1 vaktens kod
 *
 * En rad = en inbjudan. "platser" är hur många personer den gäller för (1 = bara personen,
 * 2 = plus en, 3 = plus två). Varje person har en egen QR-kod: kod-1 är den inbjudna, kod-2 och
 * kod-3 är gästerna. "insläppta" visar vilka platser som har gått in och när, t.ex. "1 22:41; 3 23:10".
 * "inne" är hur många av dem som är inne.
 *
 * Kör funktionen "installera" en gång (och igen efter en uppdatering, den lägger till nya kolumner). Därefter: Deploy → New deployment → Web app,
 * Execute as: Me, Who has access: Anyone.
 */

const SAJT = 'https://271126.com/';
const TECKEN = 'abcdefghjkmnpqrstuvwxyz23456789'; // inga förväxlingsbara tecken
const K = { kod: 1, namn: 2, platser: 3, sparrad: 4, lank: 5, svar: 6, inne: 7, senast: 8, svarade: 9, gaster: 10, telefon: 11, sms: 12, villkor: 13, ord: 14, inslappta: 15, meddelande: 16 };
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
  const rubriker = ['kod', 'namn', 'platser', 'spärrad', 'länk', 'svar', 'inne', 'senast insläppt', 'svarade', 'gäster', 'telefon', 'sms', 'villkor för plus', 'favoritord', 'insläppta', 'hemligt meddelande'];
  if (s.getLastRow() === 0) s.appendRow(rubriker);
  rubriker.forEach((r, i) => { if (!s.getRange(1, i + 1).getValue()) s.getRange(1, i + 1).setValue(r); });
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
    const kod = String(rader[i][K.kod - 1]);
    // Svenska nummer i alla former blir +46...: 070-123 45 67, 46701234567 (Sheets tar bort plustecknet), +46 70 ...
    let tel = String(rader[i][K.telefon - 1]).replace(/[^0-9+]/g, '');
    if (/^00/.test(tel)) tel = '+' + tel.slice(2);
    else if (/^0/.test(tel)) tel = '+46' + tel.slice(1);
    else if (/^46/.test(tel)) tel = '+' + tel;
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
    gaster: utanTommaSist(String(r[9] || '').split(';').map(x => x.trim())),   // platsen styr: tomt fält = gäst utan namn
    villkor: String(r[12] || '').trim(), ord: String(r[13] || '').trim(), platserInne: lasPlatser(r[14]), meddelande: String(r[15] || '').trim(),
  })).filter(l => l.kod).map(l => Object.assign(l, { inne: Object.keys(l.platserInne).length }));
}

function utanTommaSist(a) { while (a.length && !a[a.length - 1]) a.pop(); return a; }

// "1 22:41; 3 23:10" -> { 1: '22:41', 3: '23:10' }
function lasPlatser(text) {
  const ut = {};
  String(text || '').split(';').forEach(d => { const m = /^\s*(\d+)\s*(\S*)/.exec(d); if (m) ut[m[1]] = m[2] || '?'; });
  return ut;
}
function skrivPlatser(p) { return Object.keys(p).sort((a, b) => a - b).map(k => k + ' ' + p[k]).join('; '); }

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
  return { ok: true, namn: l.namn, platser: l.platser, svar: l.svar, gaster: l.gaster, villkor: l.villkor, ord: l.ord, inslappta: l.platserInne, meddelande: l.meddelande };
}

// Favoritordet: bara bokstäver, högst 14.
function stadaOrd(o) { return String(o || '').replace(/[^A-Za-zÅÄÖåäöÉéÜü]/g, '').slice(0, 14).toUpperCase(); }

/** Gästens svar. Kan ändras hur många gånger som helst; senaste svaret gäller. */
function svara(kod, svar, ord) {
  if (SVAR.indexOf(svar) < 0) return { ok: false, fel: 'svar' };
  const las = LockService.getScriptLock();
  las.waitLock(20000);
  try {
    const l = lasLank(kod);
    if (!l || l.sparrad) return { ok: false, fel: 'okänd' };
    blad().getRange(l.rad, K.svar).setValue(svar);
    blad().getRange(l.rad, K.svarade).setValue(new Date());
    const o = stadaOrd(ord);
    if (o) blad().getRange(l.rad, K.ord).setValue(o);
    SpreadsheetApp.flush();
    return { ok: true, namn: l.namn, platser: l.platser, svar: svar, gaster: l.gaster, villkor: l.villkor, ord: o || l.ord, inslappta: l.platserInne };
  } finally { las.releaseLock(); }
}

/**
 * Dörren. Biljetten "kod-2" är plats 2 på inbjudan "kod" (en kod utan plats är plats 1).
 * Varje plats släpps in en gång; samma kod igen ger "använd" med klockslaget.
 */
function slappIn(biljett, pin) {
  if (!pinOk(pin)) return { ok: false, fel: 'pin' };
  const delar = String(biljett).split('-'), kod = delar[0], plats = Number(delar[1]) || 1;
  const las = LockService.getScriptLock();
  las.waitLock(20000);
  try {
    const alla = allaLankar();
    const l = alla.filter(x => x.kod === kod)[0];
    const r = rakna(alla);
    if (!l || plats < 1 || plats > l.platser) return { ok: false, fel: 'okänd', inne: r.inne, totalt: r.totalt };
    const bas = { namn: plats === 1 ? l.namn : (l.gaster[plats - 2] || ''), vard: plats === 1 ? '' : l.namn, ord: l.ord,
      plats: plats, platser: l.platser, inne: r.inne, totalt: r.totalt };
    if (l.sparrad) return Object.assign({ ok: false, fel: 'spärrad' }, bas);
    if (l.platserInne[plats]) return Object.assign({ ok: false, fel: 'använd', tid: l.platserInne[plats] }, bas);
    const nu = new Date();
    l.platserInne[plats] = klockslag(nu);
    const antal = Object.keys(l.platserInne).length;
    blad().getRange(l.rad, K.inne, 1, 2).setValues([[antal, nu]]);   // inne, senast insläppt
    blad().getRange(l.rad, K.inslappta).setValue(skrivPlatser(l.platserInne));
    SpreadsheetApp.flush();
    return Object.assign({ ok: true, klar: true, pabiljetten: antal }, bas, { inne: r.inne + 1 });
  } finally { las.releaseLock(); }
}

/** Alla platser på alla inbjudningar, för vaktens namnsökning. */
function lista(pin) {
  if (!pinOk(pin)) return { ok: false, fel: 'pin' };
  const alla = allaLankar(), ut = [];
  alla.filter(l => !l.sparrad).forEach(l => {
    for (let p = 1; p <= l.platser; p++) {
      ut.push({ b: l.kod + '-' + p, namn: p === 1 ? l.namn : (l.gaster[p - 2] || ''), vard: p === 1 ? '' : l.namn,
        svar: l.svar, inne: l.platserInne[p] || '' });
    }
  });
  return Object.assign({ ok: true, personer: ut }, rakna(alla));
}

function lage(pin) {
  if (!pinOk(pin)) return { ok: false, fel: 'pin' };
  return Object.assign({ ok: true }, rakna(allaLankar()));
}

/** Namnen på dem gästen tar med. Högst antal platser minus ett, förnamn och efternamn. */
function sparaGaster(kod, gaster) {
  // varje gäst behåller sin plats (gäst 2, gäst 3 ...) även om en tidigare plats är tom
  const lista = utanTommaSist((Array.isArray(gaster) ? gaster : []).map(g => String(g || '').replace(/[<>;]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)));
  const las = LockService.getScriptLock();
  las.waitLock(20000);
  try {
    const l = lasLank(kod);
    if (!l || l.sparrad) return { ok: false, fel: 'okänd' };
    const spara = utanTommaSist(lista.slice(0, l.platser - 1));
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
    if (p.a === 'svar') return svar(svara(String(p.k || ''), String(p.svar || ''), p.ord));
    if (p.a === 'gaster') return svar(sparaGaster(String(p.k || ''), p.gaster));
    if (p.a === 'in') return svar(slappIn(String(p.b || ''), p.pin));
    if (p.a === 'lage') return svar(lage(p.pin));
    if (p.a === 'lista') return svar(lista(p.pin));
    return svar({ ok: false, fel: 'fråga' });
  } catch (err) {
    return svar({ ok: false, fel: 'server', detalj: String(err) });
  }
}
