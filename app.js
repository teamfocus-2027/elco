/* ELCO — application (sans dépendance, sans build). Données : questions.js */
(() => {
'use strict';

/* ───────── Utilitaires ───────── */
const D = window.ELCO_DATA;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mod = (a, n) => ((a % n) + n) % n;
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Nombre aléatoire uniforme [0,1) — crypto si disponible. */
function rand() {
  if (window.crypto && crypto.getRandomValues) {
    const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296;
  }
  return Math.random();
}

const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
};
const KEY_Q = 'elco.v1.questions';
const KEY_S = 'elco.v1.session';

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

function confirmDialog(title, body, yes = 'Confirmer') {
  const dlg = $('#dlg');
  if (!dlg.showModal) return Promise.resolve(window.confirm(title + '\n\n' + body));
  $('#dlgTitle').textContent = title; $('#dlgBody').textContent = body; $('#dlgYes').textContent = yes;
  return new Promise(res => {
    const yes = $('#dlgYes'), no = $('#dlgNo');
    const done = v => { yes.removeEventListener('click', onYes); no.removeEventListener('click', onNo); dlg.removeEventListener('close', onClose); res(v); };
    const onYes = () => done(true), onNo = () => done(false), onClose = () => done(false); // « close » : touche Échap
    yes.addEventListener('click', onYes); no.addEventListener('click', onNo); dlg.addEventListener('close', onClose);
    dlg.returnValue = 'cancel'; dlg.showModal();
  });
}

/* ───────── Banque de questions ───────── */
const cats = D.categories;
const catById = id => cats.find(c => c.id === id) || cats[0];

function defaultBank() {
  return { questions: D.questions.map(q => ({ ...q })), nextId: Math.max(...D.questions.map(q => q.id)) + 1 };
}
function validBank(b) {
  return b && Array.isArray(b.questions) && b.questions.every(q => q && Number.isInteger(q.id) && cats.some(c => c.id === q.cat) && typeof q.text === 'string' && q.text.trim());
}
let bank = store.get(KEY_Q, null);
if (!validBank(bank)) bank = defaultBank();
bank.nextId = Math.max(bank.nextId || 0, ...bank.questions.map(q => q.id + 1), 1);
const saveBank = () => { if (!store.set(KEY_Q, bank)) toast('Stockage local indisponible : les modifications ne seront pas conservées.'); };

/* ───────── Session ───────── */
function freshSession(names) {
  return { entries: [], names: names || { A: 'Participante A', B: 'Participante B' }, speaker: 'A', starter: 'A' };
}
let S = store.get(KEY_S, null);
if (!S || !Array.isArray(S.entries) || !S.names) S = freshSession();
const saveSession = () => store.set(KEY_S, S);

const other = w => (w === 'A' ? 'B' : 'A');
const nameOf = w => (S.names[w] || '').trim() || (w === 'A' ? 'Participante A' : 'Participante B');
const drawnIds = () => new Set(S.entries.map(e => e.qid));
const available = () => { const d = drawnIds(); return bank.questions.filter(q => !d.has(q.id)); };
const current = () => S.entries.find(e => e.status === 'current') || null;
const STATUS = { answered: 'répondue', skipped: 'passée', current: 'en cours' };

/* ───────── Roulette : géométrie ───────── */
function sectors() {
  const rows = cats.map(c => ({ cat: c, n: bank.questions.filter(q => q.cat === c.id).length })).filter(r => r.n > 0);
  const total = rows.reduce((a, r) => a + r.n, 0) || 1;
  let a = 0;
  return rows.map(r => { const span = 360 * r.n / total; const s = { cat: r.cat, start: a, end: a + span }; a += span; return s; });
}
const pt = (deg, r) => { const t = deg * Math.PI / 180; return [r * Math.sin(t), -r * Math.cos(t)]; };

function wheelSVG(secs, withLabels) {
  const R = 190;
  const paths = secs.map((s, i) => {
    const [x0, y0] = pt(s.start, R), [x1, y1] = pt(s.end, R);
    const large = s.end - s.start > 180 ? 1 : 0;
    const d = secs.length === 1 ? `M0 ${-R}A${R} ${R} 0 1 1 0 ${R}A${R} ${R} 0 1 1 0 ${-R}Z` : `M0 0L${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`;
    let label = '';
    if (withLabels) {
      const mid = (s.start + s.end) / 2;
      label = `<text class="wl" transform="rotate(${(mid - 90).toFixed(2)}) translate(172 0)" text-anchor="end" dominant-baseline="central" fill="${s.cat.ink}" font-family="Georgia,serif" font-weight="700" font-size="15">${esc(s.cat.id + ' · ' + s.cat.short)}</text>`;
    }
    return `<g class="sector" data-i="${i}"><path d="${d}" fill="${s.cat.color}" stroke="#FAF8F5" stroke-width="2.5"/>${label}</g>`;
  }).join('');
  return `<svg viewBox="-200 -200 400 400" role="img" aria-label="Roulette des huit catégories de questions"><circle r="197" fill="#081B3A"/><g class="rotor">${paths}</g><circle r="46" fill="#FAF8F5" stroke="#081B3A" stroke-width="3"/><text y="2" text-anchor="middle" dominant-baseline="central" font-family="Georgia,serif" font-weight="700" font-size="21" letter-spacing="3" fill="#6B1F2B">ELCO</text></svg>`;
}

let rot = 0;
function renderWheel() {
  const secs = sectors();
  $('#wheelMount').innerHTML = wheelSVG(secs, true);
  $('#heroWheel').innerHTML = wheelSVG(secs, false);
  rot = 0;
}

/**
 * Tirage réel : un angle uniforme est tiré ; c'est le secteur situé sous le repère
 * qui détermine la catégorie. Si cette catégorie est épuisée, on retire un angle
 * (rejet) jusqu'à tomber sur une catégorie contenant encore des questions.
 */
function pickDraw() {
  const pool = available();
  if (!pool.length) return null;
  const secs = sectors();
  for (let i = 0; i < 5000; i++) {
    const u = rand() * 360;
    const s = secs.find(x => u >= x.start && u < x.end);
    if (!s) continue;
    if (Math.min(u - s.start, s.end - u) < 0.8) continue; // évite la ligne de séparation
    const sub = pool.filter(q => q.cat === s.cat.id);
    if (!sub.length) continue;
    return { u, sector: secs.indexOf(s), question: sub[Math.floor(rand() * sub.length)] };
  }
  return null;
}

/* ───────── Tirage / actions de session ───────── */
let spinning = false;
const recOn = () => document.body.classList.contains('rec-on');
const wait = ms => new Promise(r => setTimeout(r, ms));

async function spin() {
  if (spinning) return;
  const pick = pickDraw();
  if (!pick) { render(); toast('Plus aucune question disponible : lancez une nouvelle session.'); return; }
  spinning = true;
  $$('.sector').forEach(el => el.classList.remove('win', 'win-dim'));
  render();

  const rotor = $('#wheelMount .rotor');
  const visible = !recOn() && rotor && !reduceMotion();
  const dur = visible ? 5200 : (recOn() ? 700 : 450);
  const turns = 4 + Math.floor(rand() * 3);
  const target = rot + (visible ? turns * 360 : 0) + mod(-pick.u - rot, 360);
  if (rotor) {
    rotor.style.transition = visible ? `transform ${dur}ms cubic-bezier(.35,.02,.08,1)` : 'none';
    rotor.style.transform = `rotate(${target}deg)`;
  }
  rot = target;
  await wait(dur + 80);

  // validation du tirage
  const prev = current(); if (prev) prev.status = 'skipped';
  const q = pick.question;
  S.entries.push({ n: S.entries.length + 1, qid: q.id, cat: q.cat, text: q.text, sensitive: !!q.sensitive, status: 'current' });
  saveSession();
  spinning = false;
  render(true);
  const secEls = $$('.sector');
  secEls.forEach((el, i) => el.classList.add(i === pick.sector ? 'win' : 'win-dim'));
  const ww = $('#wheelWrap'); ww.classList.remove('landed'); void ww.offsetWidth; ww.classList.add('landed');
}

function endTurn() { // « Passer au tour suivant »
  const c = current(); if (!c || spinning) return;
  c.status = 'answered';
  S.starter = other(S.starter); S.speaker = S.starter;
  saveSession(); render();
}
function skipQ() { // « Passer cette question »
  const c = current(); if (!c || spinning) return;
  c.status = 'skipped'; saveSession(); render();
}
function passMic() { S.speaker = other(S.speaker); saveSession(); render(); }
function setStarter(w) { S.starter = w; S.speaker = w; saveSession(); render(); }
function flip() { S.starter = other(S.starter); S.speaker = other(S.speaker); saveSession(); render(); }

async function resetSession() {
  if (!S.entries.length) { toast('La session est déjà vide.'); return; }
  const ok = await confirmDialog('Nouvelle session ?', 'La progression (questions tirées et statuts) sera effacée. Les questions et les prénoms sont conservés.', 'Effacer la progression');
  if (!ok) return;
  S = freshSession(S.names); saveSession(); render(); toast('Nouvelle session démarrée.');
}

/* ───────── Rendu : roulette ───────── */
const catChip = c => `<span class="cat"><i style="background:${c.color}"></i>${esc(c.name)}</span>`;

function stageHTML(forRec) {
  const c = current(), left = available().length;
  if (spinning) return `<p class="ph">La roulette tourne…</p>`;
  if (c) {
    const sens = c.sensitive ? `<span class="badge-sens">Sujet sensible</span>` + (forRec ? '' : `<p class="sens-note">Aucune obligation de répondre ni de s’expliquer.</p>`) : '';
    return `${catChip(catById(c.cat))}${forRec ? '' : `<span class="qn">Question n° ${c.n}</span>`}<p class="q">${esc(c.text)}</p>${sens}`;
  }
  if (!left) return `<p class="ph">Les ${S.entries.length} questions ont toutes été tirées.<small>Bravo ! Lancez une nouvelle session pour recommencer.</small></p>`;
  return `<p class="ph">${S.entries.length ? 'Prêtes pour la suite ?' : 'Prêtes ?'}<small>Faites tourner la roulette pour découvrir la prochaine question.</small></p>`;
}

function actionButtons(forRec) {
  const c = current(), left = available().length, dis = spinning ? ' disabled' : '';
  const spinLabel = c ? 'Tirer une autre question' : 'FAIRE TOURNER LA ROULETTE';
  const out = [];
  if (!left && !c) out.push(`<button class="btn btn-primary" data-act="reset" type="button">Recommencer une nouvelle session</button>`);
  else if (forRec) out.push(`<button class="btn btn-primary" data-act="spin" type="button"${dis}${c && !left ? ' disabled' : ''}>${spinLabel}</button>`);
  if (c) {
    out.push(`<button class="btn ${forRec ? 'btn-ghost' : 'btn-primary'}" data-act="next" type="button"${dis}>Passer au tour suivant</button>`);
    out.push(`<button class="btn btn-ghost" data-act="skip" type="button"${dis}>${c.sensitive ? 'Passer sans expliquer' : 'Passer cette question'}</button>`);
  }
  if (!forRec) out.push(`<button class="btn btn-ghost" data-act="hist" type="button">Voir les questions déjà tirées</button>`);
  else out.push(`<button class="btn btn-ghost" data-act="passmic" type="button">À toi de répondre</button>`);
  return out.join('');
}

let lastRevealN = -1;
function render(reveal = false) {
  // compteurs
  const drawn = S.entries.length, left = available().length, total = drawn + left, c = current();
  $('#mCount').textContent = `${drawn} / ${total}`;
  $('#mLeft').textContent = `${left} restante${left > 1 ? 's' : ''}`;
  $('#mBar').style.width = (total ? drawn / total * 100 : 0) + '%';

  // scène
  const st = $('#stage');
  st.className = 'stage' + (spinning ? ' spinning' : '') + (c && c.sensitive && !spinning ? ' sober' : '') + (reveal ? ' reveal' : '');
  st.innerHTML = stageHTML(false);
  $('#actions').innerHTML = actionButtons(false);

  // bouton principal
  const sb = $('#spinBtn');
  sb.textContent = c ? 'TIRER UNE AUTRE QUESTION' : 'FAIRE TOURNER LA ROULETTE';
  sb.disabled = spinning || (!left);
  sb.hidden = !left && !c ? true : false;

  // participantes
  ['A', 'B'].forEach(w => {
    const box = $('#who' + w), inp = $('#name' + w);
    if (document.activeElement !== inp) inp.value = S.names[w];
    inp.placeholder = w === 'A' ? 'Participante A' : 'Participante B';
    box.classList.toggle('speaking', S.speaker === w);
    $('.who-txt', box).textContent = S.speaker === w ? 'Prend la parole' : (S.starter === w && c ? 'A commencé' : 'Écoute');
  });
  $('#duoStatus').textContent = `Commence : ${nameOf(S.starter)}`;

  // mode enregistrement
  const rec = $('#rec');
  rec.classList.toggle('sober', !!(c && c.sensitive && !spinning));
  $('#rCount').textContent = `${drawn} / ${total} questions tirées`;
  const rm = $('#rMain'); rm.className = 'rec-main' + (reveal ? ' reveal' : '');
  rm.innerHTML = stageHTML(true);
  $('#rSpeaker').innerHTML = `<span class="pulse"></span><span>${esc(nameOf(S.speaker))} <small>prend la parole · commence : ${esc(nameOf(S.starter))}</small></span>`;
  $('#rActions').innerHTML = actionButtons(true);

  renderHistory();
}

/* ───────── Historique ───────── */
function renderHistory() {
  const sel = $('#hFilter'), v = sel.value || '0';
  sel.innerHTML = `<option value="0">Toutes les catégories</option>` + cats.map(c => `<option value="${c.id}">${esc(c.id + '. ' + c.name)}</option>`).join('');
  sel.value = [...sel.options].some(o => o.value === v) ? v : '0';
  const f = Number(sel.value);
  const rows = S.entries.filter(e => !f || e.cat === f).slice().reverse();
  $('#hList').innerHTML = rows.length ? rows.map(e => `<li class="${e.status === 'current' ? 'cur' : ''}">
      <div class="hm"><b>N° ${e.n}</b><span>${esc(catById(e.cat).short)}</span><span class="st st-${e.status}">${STATUS[e.status]}</span></div>
      <div>${esc(e.text)}</div></li>`).join('')
    : `<li class="empty">${S.entries.length ? 'Aucune question dans cette catégorie.' : 'Aucune question tirée pour le moment.'}</li>`;
}
const histOpen = () => !$('#hist').hidden;
function toggleHist(open) { $('#hist').hidden = !(open ?? !histOpen()); }

function download(name, text, type) {
  const blob = new Blob(['﻿' + text], { type: type + ';charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const csvCell = s => '"' + String(s).replace(/"/g, '""') + '"';
function exportHistory(kind) {
  if (!S.entries.length) { toast('Rien à exporter : aucune question tirée.'); return; }
  if (kind === 'csv') {
    const lines = ['numero;id_question;categorie;question;statut', ...S.entries.map(e => [e.n, e.qid, csvCell(catById(e.cat).name), csvCell(e.text), STATUS[e.status]].join(';'))];
    download(`elco-session-${stamp()}.csv`, lines.join('\r\n'), 'text/csv');
  } else {
    const head = `ELCO — Historique de session\r\nParticipantes : ${nameOf('A')} et ${nameOf('B')}\r\n${S.entries.length} question(s) tirée(s)\r\n\r\n`;
    download(`elco-session-${stamp()}.txt`, head + S.entries.map(e => `${e.n}. [${catById(e.cat).name}] (${STATUS[e.status]})\r\n   ${e.text}`).join('\r\n\r\n'), 'text/plain');
  }
}

/* ───────── Mode enregistrement ───────── */
function recEnter() {
  $('#rec').hidden = false; document.body.classList.add('rec-on'); toggleHist(false); render();
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => { /* l'overlay plein écran suffit */ });
}
function recExit() {
  if (!recOn()) return;
  $('#rec').hidden = true; document.body.classList.remove('rec-on');
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) recExit(); });

/* ───────── Catégories ───────── */
function renderCategories() {
  $('#catList').innerHTML = cats.map(c => {
    const qs = bank.questions.filter(q => q.cat === c.id);
    return `<details><summary><span class="cn">${String(c.id).padStart(2, '0')}</span><span class="sw" style="background:${c.color}"></span><span class="ct">${esc(c.name)}</span><span class="cc">${qs.length} question${qs.length > 1 ? 's' : ''}</span></summary>
      <ol>${qs.map(q => `<li><b>${q.id}</b><span>${esc(q.text)}</span></li>`).join('') || '<li>Aucune question.</li>'}</ol></details>`;
  }).join('');
}

/* ───────── Administration ───────── */
function fillCatSelect(sel, withAll) {
  const v = sel.value;
  sel.innerHTML = (withAll ? `<option value="0">Toutes les catégories</option>` : '') + cats.map(c => `<option value="${c.id}">${esc(c.id + '. ' + c.name)}</option>`).join('');
  if ([...sel.options].some(o => o.value === v)) sel.value = v;
}
let editing = null;
function renderAdmin() {
  fillCatSelect($('#addCat'), false); fillCatSelect($('#aCat'), true);
  const term = norm($('#aSearch').value), f = Number($('#aCat').value);
  const rows = bank.questions.filter(q => (!f || q.cat === f) && (!term || norm(q.text).includes(term) || String(q.id) === term));
  $('#aCount').textContent = `${rows.length} / ${bank.questions.length} question${bank.questions.length > 1 ? 's' : ''}`;
  $('#qList').innerHTML = rows.length ? rows.map(q => {
    const catOpts = cats.map(c => `<option value="${c.id}"${c.id === q.cat ? ' selected' : ''}>${esc(c.id + '. ' + c.name)}</option>`).join('');
    const body = editing === q.id
      ? `<textarea class="qedit" id="editText" rows="3" aria-label="Modifier le texte">${esc(q.text)}</textarea>`
      : `<div class="qt">${esc(q.text)}</div>`;
    const btns = editing === q.id
      ? `<button class="btn btn-primary" data-act="q-save" data-id="${q.id}" type="button">Enregistrer</button><button class="btn btn-ghost" data-act="q-cancel" type="button">Annuler</button>`
      : `<button class="btn btn-ghost" data-act="q-edit" data-id="${q.id}" type="button">Modifier</button><button class="btn btn-danger" data-act="q-del" data-id="${q.id}" type="button">Supprimer</button>`;
    return `<li class="qrow"><span class="qid">${q.id}</span>${body}<span class="qb">${btns}</span>
      <span class="qm"><select data-qcat="${q.id}" aria-label="Catégorie de la question ${q.id}">${catOpts}</select>
      <label class="chk"><input type="checkbox" data-qsens="${q.id}"${q.sensitive ? ' checked' : ''}> Sujet sensible</label></span></li>`;
  }).join('') : `<li class="empty">Aucune question ne correspond.</li>`;
  if (editing !== null) { const t = $('#editText'); if (t) t.focus(); }
}
function afterBankChange() { saveBank(); renderWheel(); renderCategories(); renderAdmin(); render(); }
const isDup = (text, exceptId) => bank.questions.some(q => q.id !== exceptId && norm(q.text) === norm(text));

function addQuestion(text, cat, sensitive) {
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return 'empty';
  if (isDup(text)) return 'dup';
  bank.questions.push({ id: bank.nextId++, cat, text, sensitive: !!sensitive });
  return 'ok';
}

/* CSV / JSON */
function parseCSV(txt) {
  txt = txt.replace(/^﻿/, '');
  const first = txt.split(/\r?\n/)[0] || '';
  const delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
function resolveCat(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v); if (Number.isInteger(n) && cats.some(c => c.id === n)) return n;
  const t = norm(v); const c = cats.find(c => norm(c.name) === t || norm(c.short) === t || norm(c.name).startsWith(t));
  return c ? c.id : null;
}
function importText(txt, filename) {
  let items = [];
  if (/\.json$/i.test(filename) || /^\s*[\[{]/.test(txt)) {
    const data = JSON.parse(txt);
    const arr = Array.isArray(data) ? data : data.questions;
    if (!Array.isArray(arr)) throw new Error('format');
    items = arr.map(o => typeof o === 'string' ? { text: o } : { text: o.text ?? o.question, cat: o.cat ?? o.categorie ?? o.category, sensitive: o.sensitive ?? o.sensible });
  } else {
    const rows = parseCSV(txt); if (!rows.length) throw new Error('format');
    const h = rows[0].map(norm); const iT = h.findIndex(x => /^(question|text|texte)$/.test(x)), iC = h.findIndex(x => /^(categorie|category|cat)$/.test(x)), iS = h.findIndex(x => /^(sensible|sensitive)$/.test(x));
    const hasHead = iT >= 0;
    (hasHead ? rows.slice(1) : rows).forEach(r => items.push(hasHead
      ? { text: r[iT], cat: iC >= 0 ? r[iC] : null, sensitive: iS >= 0 ? /^(1|oui|true|x)$/i.test((r[iS] || '').trim()) : undefined }
      : { cat: r.length > 1 ? r[0] : null, text: r.length > 1 ? r[1] : r[0] }));
  }
  let added = 0, dup = 0, bad = 0;
  items.forEach(it => {
    const text = String(it.text ?? '').trim();
    const cat = resolveCat(it.cat);
    if (!text || !cat) { bad++; return; }
    const r = addQuestion(text, cat, it.sensitive ?? cat === 3);
    if (r === 'ok') added++; else if (r === 'dup') dup++; else bad++;
  });
  return { added, dup, bad };
}

function exportQuestions(kind) {
  if (kind === 'json') {
    download(`elco-questions-${stamp()}.json`, JSON.stringify(bank.questions.map(({ id, cat, text, sensitive }) => ({ id, cat, categorie: catById(cat).name, text, sensitive: !!sensitive })), null, 2), 'application/json');
  } else {
    download(`elco-questions-${stamp()}.csv`, ['id;categorie;question;sensible', ...bank.questions.map(q => [q.id, csvCell(catById(q.cat).name), csvCell(q.text), q.sensitive ? 'oui' : 'non'].join(';'))].join('\r\n'), 'text/csv');
  }
}

/* ───────── Actions (délégation) ───────── */
const actions = {
  spin: () => spin(),
  next: endTurn, skip: skipQ, passmic: passMic, flip,
  starter: b => setStarter(b.dataset.who),
  hist: () => toggleHist(true),
  'hist-close': () => toggleHist(false),
  'back-current': () => { toggleHist(false); if (location.hash !== '#roulette') location.hash = '#roulette'; $('#stage').scrollIntoView({ behavior: 'smooth', block: 'center' }); },
  reset: resetSession,
  'rec-on': recEnter, 'rec-off': recExit,
  'export-csv': () => exportHistory('csv'), 'export-txt': () => exportHistory('txt'),
  'q-export-json': () => exportQuestions('json'), 'q-export-csv': () => exportQuestions('csv'),
  'q-edit': b => { editing = Number(b.dataset.id); renderAdmin(); },
  'q-cancel': () => { editing = null; renderAdmin(); },
  'q-save': b => {
    const id = Number(b.dataset.id), q = bank.questions.find(x => x.id === id), text = $('#editText').value.replace(/\s+/g, ' ').trim();
    if (!text) return toast('Le texte ne peut pas être vide.');
    if (isDup(text, id)) return toast('Cette question existe déjà.');
    q.text = text; editing = null; afterBankChange(); toast('Question modifiée.');
  },
  'q-del': async b => {
    const id = Number(b.dataset.id), q = bank.questions.find(x => x.id === id); if (!q) return;
    if (!await confirmDialog('Supprimer cette question ?', '« ' + q.text.slice(0, 120) + (q.text.length > 120 ? '…' : '') + ' »', 'Supprimer')) return;
    bank.questions = bank.questions.filter(x => x.id !== id); afterBankChange(); toast('Question supprimée.');
  },
  'q-restore': async () => {
    if (!await confirmDialog('Rétablir les questions d’origine ?', 'Toutes vos modifications, ajouts et suppressions seront remplacés par les 100 questions du podcast.', 'Rétablir')) return;
    bank = defaultBank(); editing = null; afterBankChange(); toast('Les 100 questions d’origine sont rétablies.');
  }
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b && actions[b.dataset.act] && !b.disabled) actions[b.dataset.act](b);
});

/* Formulaires et champs */
$('#addForm').addEventListener('submit', e => {
  e.preventDefault();
  const r = addQuestion($('#addText').value, Number($('#addCat').value), $('#addSens').checked);
  if (r === 'empty') return toast('Écrivez une question.');
  if (r === 'dup') return toast('Cette question existe déjà.');
  $('#addText').value = ''; $('#addSens').checked = false; afterBankChange(); toast('Question ajoutée.');
});
$('#aSearch').addEventListener('input', renderAdmin);
$('#aCat').addEventListener('change', renderAdmin);
$('#hFilter').addEventListener('change', renderHistory);
$('#qList').addEventListener('change', e => {
  const cs = e.target.dataset.qcat, ss = e.target.dataset.qsens;
  if (cs) { bank.questions.find(q => q.id === Number(cs)).cat = Number(e.target.value); afterBankChange(); toast('Catégorie modifiée.'); }
  if (ss) { bank.questions.find(q => q.id === Number(ss)).sensitive = e.target.checked; saveBank(); }
});
['A', 'B'].forEach(w => $('#name' + w).addEventListener('input', e => { S.names[w] = e.target.value.slice(0, 28); saveSession(); render(); }));
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const res = importText(await f.text(), f.name);
    afterBankChange();
    toast(`${res.added} ajoutée(s), ${res.dup} doublon(s) ignoré(s), ${res.bad} ligne(s) invalide(s).`);
  } catch { toast('Fichier illisible : utilisez un JSON ou un CSV valide.'); }
});

/* Clavier */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (recOn()) { recExit(); return; }
    if (histOpen()) { toggleHist(false); return; }
  }
  if (e.ctrlKey || e.metaKey || e.altKey || $('#dlg').open) return;
  if (!(currentView() === 'roulette' || recOn())) return;
  if (e.target.closest('input,textarea,select,button,a,summary')) return;
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'enter') { e.preventDefault(); spin(); }
  else if (k === 'n') endTurn();
  else if (k === 'p') skipQ();
  else if (k === 'm') passMic();
  else if (k === 'h' && !recOn()) toggleHist();
});

/* ───────── Navigation ───────── */
const VIEWS = ['accueil', 'roulette', 'categories', 'apropos', 'admin'];
const currentView = () => { const h = location.hash.replace('#', ''); return VIEWS.includes(h) ? h : 'accueil'; };
function route() {
  const v = currentView();
  $$('.view').forEach(s => { s.hidden = s.dataset.view !== v; });
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === v));
  if (v === 'categories') renderCategories();
  if (v === 'admin') renderAdmin();
  if (v !== 'roulette') toggleHist(false);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ───────── Démarrage ───────── */
renderWheel(); route(); render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Aide aux tests automatiques
window.__ELCO = { get state() { return S; }, get bank() { return bank; }, available, pickDraw };
})();
