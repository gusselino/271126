// 271126 – gemensamt för gästsidan och vaktsidan.

// Adressen till Apps Script-webbappen. Lokalt (test) går allt mot /api.
const API_SKARP = '';
const API = ['localhost', '127.0.0.1'].includes(location.hostname) ? '/api' : API_SKARP;

const TEXT = {
  datum: 'Fredag 27 november',
  tid: '',                       // t.ex. '23.00', lämnas tomt tills den är bestämd
  plats: 'Stockholm',
  adress: 'Adress kommer samma dag.',
  kladsel: 'Kom som dig själv.',
};

async function hamta(params) {
  const r = await fetch(API + '?' + new URLSearchParams(params), { cache: 'no-store' });
  return r.json();
}

// text/plain gör att webbläsaren inte skickar någon förfrågan i förväg, vilket Apps Script inte svarar på
async function skicka(data) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
  return r.json();
}

function el(tagg, attr, ...barn) {
  const e = document.createElement(tagg);
  for (const [k, v] of Object.entries(attr || {})) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const b of barn) e.append(b);   // append lägger in text som text, aldrig som html
  return e;
}

function qrBild(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount(), marg = 3, s = n + marg * 2;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + marg} ${y + marg}h1v1h-1z`;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${s} ${s}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', s); bg.setAttribute('height', s); bg.setAttribute('fill', '#fff');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', d); p.setAttribute('fill', '#000');
  svg.append(bg, p);
  return svg;
}
