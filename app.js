/* ELCO v2 — application (HTML/CSS/JS sans dépendance). Données : data.js */
(() => {
'use strict';

/* ───────── Utilitaires ───────── */
const D = window.ELCO_DATA;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const mod = (a, n) => ((a % n) + n) % n;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(r => setTimeout(r, ms));
function rand() { if (window.crypto && crypto.getRandomValues) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; } return Math.random(); }
const pickFrom = l => l[Math.floor(rand() * l.length)];
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const store = {
  get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
};
const KEY_B = 'elco.v2.bank', KEY_S = 'elco.v2.session', KEY_H = 'elco.v2.sessions', KEY_T = 'elco.v2.theme', KEY_SND = 'elco.v2.sound';

let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200); }

function confirmDialog(title, body, yes = 'Confirmer') {
  const dlg = $('#dlg');
  if (!dlg.showModal) return Promise.resolve(window.confirm(title + '\n\n' + body));
  $('#dlgTitle').textContent = title; $('#dlgBody').textContent = body; $('#dlgYes').textContent = yes;
  return new Promise(res => {
    const yb = $('#dlgYes'), nb = $('#dlgNo');
    const done = v => { yb.removeEventListener('click', onY); nb.removeEventListener('click', onN); dlg.removeEventListener('close', onC); res(v); };
    const onY = () => done(true), onN = () => done(false), onC = () => done(false);
    yb.addEventListener('click', onY); nb.addEventListener('click', onN); dlg.addEventListener('close', onC);
    dlg.returnValue = 'cancel'; dlg.showModal();
  });
}
function download(name, text, type) {
  const blob = new Blob(['﻿' + text], { type: type + ';charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const csvCell = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';

/* ───────── Sons (synthèse WebAudio, aucun fichier) ───────── */
const Sound = {
  ctx: null, on: store.get(KEY_SND, true),
  ensure() {
    if (!this.on) return null;
    try { this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; } catch { return null; }
  },
  beep(freq, dur = .12, type = 'sine', vol = .16, when = 0) {
    const c = this.ensure(); if (!c) return;
    const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + .03);
  },
  wheel(totalMs) { // clics de plus en plus espacés, comme une roue qui ralentit
    const n = 46;
    for (let i = 1; i <= n; i++) this.beep(900 + (i % 2) * 140, .035, 'square', .05, totalMs / 1000 * Math.pow(i / n, 2.1) * .97);
  },
  ding() { this.beep(784, .35, 'sine', .18); this.beep(1175, .5, 'sine', .15, .12); },
  pop() { this.beep(520, .09, 'sine', .12); },
  tick(sec) { this.beep(sec <= 3 ? 1318 : 880, sec <= 3 ? .14 : .08, 'sine', .16); },
  end() { this.beep(330, .5, 'sawtooth', .13); this.beep(247, .7, 'sawtooth', .13, .35); }
};

/* ───────── Banque de questions ───────── */
const MODES = D.modes;
const ALL_MODE = { id: 'tous', name: 'Tous les thèmes', short: 'Tous', desc: 'Un mélange imprévisible de tous les modes : expertise, actualité, émotions et échanges spontanés.', types: [], note: 'Vous pouvez exclure des modes avant de commencer.' };
const modeById = id => id === 'tous' ? ALL_MODE : MODES.find(m => m.id === id);

function defaultBank() {
  return {
    themes: D.themes.map(t => ({ ...t })), questions: D.questions.map(q => ({ ...q })),
    modesOff: [], allowRepeat: false,
    nextId: Math.max(...D.questions.map(q => q.id)) + 1, nextTheme: Math.max(...D.themes.map(t => t.id)) + 1
  };
}
function validBank(b) {
  return b && Array.isArray(b.themes) && Array.isArray(b.questions) && b.questions.every(q => q && Number.isInteger(q.id) && typeof q.text === 'string' && Array.isArray(q.modes) && b.themes.some(t => t.id === q.th));
}
let bank = store.get(KEY_B, null);
if (!validBank(bank)) bank = defaultBank();
bank.modesOff = bank.modesOff || [];
bank.nextId = Math.max(bank.nextId || 0, ...bank.questions.map(q => q.id + 1));
bank.nextTheme = Math.max(bank.nextTheme || 0, ...bank.themes.map(t => t.id + 1));
const saveBank = () => { if (!store.set(KEY_B, bank)) toast('Stockage local indisponible : les modifications ne seront pas conservées.'); };
const themeOf = id => bank.themes.find(t => t.id === id) || { name: '—', short: '—' };

/* ───────── Session ───────── */
function freshSession(prev) {
  return {
    mode: prev ? prev.mode : null, catsOff: prev ? prev.catsOff : [], excl: prev ? prev.excl : [],
    timer: prev ? prev.timer : 60, names: prev ? prev.names : { A: 'Participante A', B: 'Participante B' },
    speaker: 'A', starter: 'A', entries: [], queue: [], curMode: null
  };
}
let S = store.get(KEY_S, null);
if (!S || !Array.isArray(S.entries) || !S.names) S = freshSession();
const saveSession = () => store.set(KEY_S, S);
const other = w => (w === 'A' ? 'B' : 'A');
const nameOf = w => (S.names[w] || '').trim() || (w === 'A' ? 'Participante A' : 'Participante B');
const current = () => S.entries.find(e => e.status === 'current') || null;
const STATUS = { answered: 'répondue', skipped: 'passée', current: 'en cours' };
const modeOk = m => !bank.modesOff.includes(m) && !(S.mode === 'tous' && S.excl.includes(m));

function matches(q) {
  if (q.active === false) return false;
  if (S.mode === 'tous') return q.modes.some(modeOk);
  return q.modes.includes(S.mode) && !S.catsOff.includes(q.th);
}
function pool() {
  const drawn = new Set(S.entries.map(e => e.qid));
  let p = bank.questions.filter(q => matches(q) && !drawn.has(q.id));
  if (!p.length && bank.allowRepeat) { const c = current(); p = bank.questions.filter(q => matches(q) && (!c || q.id !== c.qid)); }
  return p;
}
function themesForMode(mode) {
  const ids = new Set(bank.questions.filter(q => q.active !== false && q.modes.includes(mode)).map(q => q.th));
  return bank.themes.filter(t => ids.has(t.id)).map(t => t.id);
}
function sectors() {
  const p = pool();
  if (S.mode === 'tous') return MODES.filter(m => modeOk(m.id)).map(m => ({ key: m.id, label: m.short, n: p.filter(q => q.modes.includes(m.id)).length }));
  return themesForMode(S.mode).filter(t => !S.catsOff.includes(t)).map(t => ({ key: t, label: themeOf(t).short, n: p.filter(q => q.th === t).length }));
}
function ensureQueue() { if (!S.queue.length) S.queue = shuffle(bank.questions.map(q => q.id)); }

/** Tirage réel : angle uniforme, rejet des secteurs vides ; question suivant l'ordre mélangé. */
function pickDraw() {
  const p = pool(); if (!p.length) return null;
  const secs = sectors(), N = secs.length; if (!N) return null;
  const span = 360 / N;
  for (let i = 0; i < 5000; i++) {
    const u = rand() * 360, idx = Math.min(N - 1, Math.floor(u / span));
    if (secs[idx].n === 0) continue;
    if (Math.min(u - idx * span, (idx + 1) * span - u) < 0.8) continue;
    const key = secs[idx].key;
    const cand = p.filter(q => S.mode === 'tous' ? q.modes.includes(key) && modeOk(key) : q.th === key);
    if (!cand.length) continue;
    ensureQueue();
    const set = new Set(cand.map(q => q.id));
    const qid = S.queue.find(id => set.has(id));
    const question = cand.find(q => q.id === qid) || pickFrom(cand);
    return { u, sector: idx, key, question };
  }
  return null;
}

/* ───────── Roue ───────── */
const WCOL = [['#E83E8C', '#fff'], ['#FCEAF2', '#650026'], ['#8F0038', '#fff'], ['#E66BA7', '#650026']];
const pt = (a, r) => [r * Math.sin(a * Math.PI / 180), -r * Math.cos(a * Math.PI / 180)];
let rot = 0;
function wheelSVG(secs) {
  const N = secs.length || 1, span = 360 / N, R = 190;
  const paths = secs.map((s, i) => {
    let [fill, ink] = WCOL[i % 4];
    if (i === N - 1 && N > 1 && i % 4 === 0) [fill, ink] = ['#FFFFFF', '#650026'];
    const a0 = i * span, a1 = (i + 1) * span, [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R), mid = (a0 + a1) / 2;
    const lab = s.label.length > 15 ? s.label.slice(0, 14) + '…' : s.label;
    const d = N === 1 ? `M0 ${-R}A${R} ${R} 0 1 1 0 ${R}A${R} ${R} 0 1 1 0 ${-R}Z` : `M0 0L${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`;
    return `<g opacity="${s.n ? 1 : .35}"><path d="${d}" fill="${fill}" stroke="#650026" stroke-width="2"/>
      <text transform="rotate(${(mid - 90).toFixed(2)}) translate(172 0)" text-anchor="end" dominant-baseline="central" fill="${ink}" font-family="Georgia,serif" font-weight="700" font-size="${N > 9 ? 12 : 14}">${esc(lab)}</text></g>`;
  }).join('');
  return `<svg viewBox="-200 -200 400 400" role="img" aria-label="Roulette des thématiques"><circle r="198" fill="#fff"/><g class="rotor" style="transform:rotate(${rot}deg)">${paths}</g><circle r="40" fill="#650026" stroke="#fff" stroke-width="3"/><text y="1" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="Georgia,serif" font-weight="700" font-size="17" letter-spacing="3">ELCO</text></svg>`;
}
function renderWheel() {
  const secs = sectors(), left = pool().length;
  $('#wheelMount').innerHTML = wheelSVG(secs);
  $('#wLeft').textContent = left; $('#wDone').textContent = S.entries.length;
  $('#wMode').textContent = S.mode ? modeById(S.mode).name : '';
  $('#spinBtn').disabled = !left || spinning;
  const msg = $('#wMsg');
  if (!left) msg.textContent = 'Toutes les questions disponibles ont été tirées. Réinitialisez la session pour recommencer.';
  else if (current()) msg.textContent = 'La question en cours sera passée si vous relancez la roulette.';
  else if (!msg.dataset.keep) msg.textContent = '';
}

/* ───────── Tirage ───────── */
let spinning = false;
const recOn = () => document.body.classList.contains('rec-on');
async function spin() {
  if (spinning || !S.mode) return;
  const pick = pickDraw();
  if (!pick) { renderAll(); toast('Plus aucune question disponible.'); return; }
  spinning = true; stopTimer();
  const msg = $('#wMsg'); msg.dataset.keep = '1'; msg.textContent = 'La roulette tourne…';
  $('#spinBtn').disabled = true;
  const rotor = $('#wheelMount .rotor');
  const visible = !recOn() && rotor && !reduceMotion() && currentView() === 'roulette';
  const dur = visible ? 5200 : (recOn() ? 700 : 450);
  const N = sectors().length, span = 360 / N;
  const u = pick.sector * span + span * (.1 + rand() * .8) ;
  const target = rot + (visible ? (4 + Math.floor(rand() * 3)) * 360 : 0) + mod(-u - rot, 360);
  if (rotor) { rotor.style.transition = visible ? `transform ${dur}ms cubic-bezier(.35,.02,.08,1)` : 'none'; rotor.style.transform = `rotate(${target}deg)`; }
  rot = target;
  if (visible) Sound.wheel(dur); else Sound.pop();
  await wait(dur + 80);

  const prev = current(); if (prev) prev.status = 'skipped';
  const q = pick.question;
  S.entries.push({
    n: S.entries.length + 1, qid: q.id, th: q.th, text: q.text, mode: S.mode === 'tous' ? pick.key : S.mode,
    ty: q.ty || '', d: q.d || 1, sensitive: !!q.sensitive, ch: q.ch || null, source: q.source || '', date: q.date || '', status: 'current'
  });
  S.curMode = S.entries[S.entries.length - 1].mode;
  S.queue = S.queue.filter(id => id !== q.id);
  saveSession();
  spinning = false;
  msg.dataset.keep = ''; msg.textContent = 'Thématique : ' + themeOf(q.th).name;
  Sound.ding();
  const w = $('#wheel'); w.classList.remove('landed'); void w.offsetWidth; w.classList.add('landed');
  if (recOn()) { renderAll(true); return; }
  renderWheel();
  await wait(reduceMotion() ? 100 : 750);
  if (currentView() === 'roulette') go('question'); else renderAll(true);
}
function endTurn(status) {
  const c = current(); if (!c || spinning) return false;
  c.status = status;
  if (status === 'answered') { S.starter = other(S.starter); S.speaker = S.starter; }
  saveSession(); return true;
}
function afterTurn() {
  if (recOn()) { if (pool().length) spin(); else renderAll(); return; }
  if (!pool().length) { go('roulette'); return; }
  pendingSpin = true; go('roulette');
}
let pendingSpin = false;
const passMic = () => { S.speaker = other(S.speaker); saveSession(); renderAll(); Sound.pop(); };

function archiveSession() {
  if (!S.entries.length) return;
  const h = store.get(KEY_H, []);
  h.unshift({ date: new Date().toISOString(), mode: S.mode, names: S.names, entries: S.entries });
  store.set(KEY_H, h.slice(0, 30));
}
async function resetSession() {
  if (!S.entries.length) { toast('La session est déjà vide.'); return; }
  if (!await confirmDialog('Réinitialiser la session ?', 'Les questions tirées pourront être tirées de nouveau. La session actuelle est conservée dans l’historique (page Gérer).', 'Réinitialiser')) return;
  archiveSession(); S = freshSession(S); ensureQueue(); saveSession(); stopTimer(); go('roulette'); renderAll(); toast('Nouvelle session démarrée.');
}

/* ───────── Chronomètre ───────── */
let tInt = null, timerQid = null;
const RING = 2 * Math.PI * 44;
const fmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
const TIMES = [60, 120, 180, 240, 300];
function timerHTML() {
  return `<div class="ringwrap"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="rb" cx="50" cy="50" r="44"/><circle class="rf" cx="50" cy="50" r="44" stroke-dasharray="${RING}" transform="rotate(-90 50 50)"/></svg><span class="rn"></span></div>
  <div class="tstate"></div>
  <div class="tctl ctrl">${TIMES.map(t => `<button type="button" data-t="${t}">${t / 60} min</button>`).join('')}<button type="button" data-restart>Relancer</button></div>`;
}
function stopTimer() { clearInterval(tInt); tInt = null; timerQid = null; }
function startTimer() {
  clearInterval(tInt);
  const sels = ['#qTimer', '#rTimer'], total = S.timer; let t = total;
  sels.forEach(s => { const el = $(s); if (!el.querySelector('.rn')) el.innerHTML = timerHTML(); $$('[data-t]', el).forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.t) === total)); });
  const draw = () => sels.forEach(s => {
    const el = $(s);
    el.querySelector('.rn').textContent = fmt(t);
    el.querySelector('.rf').style.strokeDashoffset = RING * (1 - t / total);
    el.classList.toggle('low', t <= 10 && t > 0); el.classList.toggle('done', t === 0);
    el.querySelector('.tstate').textContent = t === 0 ? 'Temps écoulé !' : t <= 10 ? 'Concluez !' : 'Réponse spontanée';
  });
  draw();
  tInt = setInterval(() => {
    t = Math.max(0, t - 1); draw();
    if (t === 0) { clearInterval(tInt); Sound.end(); } else if (t <= 10) Sound.tick(t);
  }, 1000);
}
document.addEventListener('click', e => {
  const b = e.target.closest('.tbox [data-t], .tbox [data-restart]'); if (!b) return;
  if (b.dataset.t) { S.timer = Number(b.dataset.t); saveSession(); }
  startTimer();
});

/* ───────── Rendu : accueil ───────── */
const ICONS = {
  technique: 'M4 20h16M6 20V9l6-4 6 4v11M10 20v-5h4v5', actu: 'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 13h7',
  confidences: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z', debat: 'M4 5h12v8H9l-3 3v-3H4zM18 9h2v8h-2v3l-3-3h-4v-2',
  carriere: 'M4 20h4v-4h4v-4h4V8h4', entre: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4',
  chantier: 'M4 16a8 8 0 0 1 16 0zM3 19h18M12 8v4', flash: 'M13 3L5 14h6l-1 7 8-11h-6z',
  parcours: 'M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.6 6.7 19.5l1.1-6L3.4 9.3l6-.8z', tous: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'
};
const modeCount = id => id === 'tous'
  ? bank.questions.filter(q => q.active !== false && q.modes.some(m => !bank.modesOff.includes(m))).length
  : bank.questions.filter(q => q.active !== false && q.modes.includes(id)).length;
function renderHome() {
  $('#modeGrid').innerHTML = [...MODES, ALL_MODE].map(m => {
    const off = m.id !== 'tous' && bank.modesOff.includes(m.id);
    return `<div class="card${m.id === 'tous' ? ' all' : ''}${off ? ' off' : ''}">
      <div class="ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[m.id]}"/></svg></div>
      <h3>${esc(m.name)}</h3><p>${esc(m.desc)}</p>
      <p class="count">${modeCount(m.id)} questions${off ? ' · désactivé pour ce tournage' : ''}</p>
      <button class="btn ${m.id === 'tous' ? 'btn-solid' : 'btn-line'}" type="button" data-act="open-mode" data-mode="${m.id}"${off ? ' disabled' : ''}>Lancer ce mode</button></div>`;
  }).join('');
}

/* ───────── Rendu : page du mode ───────── */
function openMode(id) {
  if (S.mode && S.mode !== id) archiveSession();
  if (S.mode !== id) { S = freshSession({ ...S, mode: id, catsOff: [], excl: [] }); S.mode = id; }
  saveSession(); go('mode');
}
function renderModePage() {
  const m = modeById(S.mode); if (!m) return;
  $('#mEyebrow').textContent = m.id === 'tous' ? 'Session mixte' : 'Mode';
  $('#mTitle').textContent = m.name; $('#mDesc').textContent = m.desc;
  $('#timerField').hidden = m.id !== 'flash';
  $('#timerSeg').innerHTML = TIMES.map(t => `<button type="button" data-t="${t}" aria-pressed="${S.timer === t}">${t / 60} min</button>`).join('');
  if (m.id === 'tous') {
    $('#mCatTitle').textContent = 'Modes inclus (touchez pour exclure)';
    $('#mCats').innerHTML = MODES.filter(x => !bank.modesOff.includes(x.id)).map(x => `<button class="chip" type="button" aria-pressed="${!S.excl.includes(x.id)}" data-mx="${x.id}">${esc(x.short)}</button>`).join('');
    $('#mTypes').innerHTML = ['Expertise', 'Actualité', 'Émotions', 'Échanges spontanés'].map(t => `<span class="tag">${t}</span>`).join('');
  } else {
    $('#mCatTitle').textContent = 'Thématiques (touchez pour exclure)';
    $('#mCats').innerHTML = themesForMode(m.id).map(t => `<button class="chip" type="button" aria-pressed="${!S.catsOff.includes(t)}" data-mc="${t}">${esc(themeOf(t).name)}</button>`).join('');
    $('#mTypes').innerHTML = m.types.map(t => `<span class="tag">${esc(t)}</span>`).join('');
  }
  $('#mNote').textContent = m.note || ''; $('#mNote').hidden = !m.note;
  $('#nameA').value = S.names.A; $('#nameB').value = S.names.B;
  $('#mCount').textContent = pool().length + ' questions disponibles avec ces filtres.';
  const rb = $('#resumeBox');
  rb.innerHTML = S.entries.length ? `<div class="resume"><span><strong>Session en cours</strong> : ${S.entries.length} question(s) tirée(s).</span>
    <span class="row"><button class="btn btn-pink btn-sm" type="button" data-act="resume">Reprendre</button><button class="btn btn-line btn-sm" type="button" data-act="reset">Nouvelle session</button></span></div>` : '';
}

/* ───────── Rendu : question, tournage, historique ───────── */
function sourceLine(e) {
  if (e.mode !== 'actu') return '';
  return e.source ? `Source : ${esc(e.source)}${e.date ? ' · ' + esc(e.date) : ''}` : 'Question de discussion — pas un fait vérifié. Ajoutez une source et une date dans « Gérer » pour un fait.';
}
function typeLabel(e) { return e.mode === 'actu' ? (e.source ? 'Fait daté · source' : 'Discussion') : (e.ty || ''); }
function renderQuestion(reveal) {
  const e = current(), m = e ? modeById(e.mode) : modeById(S.mode);
  if (!e) { $('#qBadges').innerHTML = ''; $('#qCard').innerHTML = '<div class="q">Aucune question en cours — retournez à la roulette.</div>'; return; }
  $('#qBadges').innerHTML = `<span class="badge p">${esc(m.name)}</span><span class="badge">${esc(themeOf(e.th).name)}</span>${typeLabel(e) ? `<span class="badge">${esc(typeLabel(e))}</span>` : ''}<span class="badge">Difficulté ${'●'.repeat(e.d)}${'○'.repeat(3 - e.d)}</span>`;
  $('#qCount').textContent = `${pool().length} restantes · ${S.entries.length} tirées`;
  const card = $('#qCard');
  card.className = 'qcard' + (e.sensitive ? ' sober' : '') + (reveal ? ' reveal' : '');
  card.innerHTML = `<div class="meta">${esc(m.short)} · ${esc(themeOf(e.th).name)}</div><div class="q">${esc(e.text)}</div>
    ${e.ch ? `<div class="choices">${e.ch.map((c, i) => `<div><b>${'ABC'[i]}</b>${esc(c)}</div>`).join('')}</div><div class="extra">Choisissez, puis justifiez votre décision. Ce scénario sert à discuter, pas de référence normative.</div>` : ''}
    ${e.sensitive ? '<div class="extra">Sujet sensible — personne n’est obligée de répondre, ni de s’expliquer.</div>' : ''}
    ${e.mode === 'actu' ? `<div class="extra">${sourceLine(e)}</div>` : ''}`;
  $('#skipBtn').textContent = e.sensitive ? 'Je passe cette question' : 'Je passe';
  const flash = e.mode === 'flash';
  $('#qTimer').hidden = !flash;
  if (flash && timerQid !== e.qid) { timerQid = e.qid; startTimer(); }
  if (!flash) { stopTimer(); }
}
function setWho(prefix) {
  ['A', 'B'].forEach(w => {
    const el = $('#' + prefix + w), on = S.speaker === w;
    el.classList.toggle('on', on);
    const inp = el.querySelector('input'); if (inp && document.activeElement !== inp) inp.value = S.names[w];
    const st = el.querySelector('strong'); if (st) st.textContent = nameOf(w);
    el.querySelector('small').textContent = on ? 'Prend la parole' : (S.starter === w && current() ? 'A commencé' : 'Écoute');
  });
}
function renderRec(reveal) {
  const e = current(), m = e ? modeById(e.mode) : modeById(S.mode);
  $('#rec').classList.toggle('sober', !!(e && e.sensitive));
  $('#rLab').textContent = e ? `${m.name} · ${themeOf(e.th).name}` : (m ? m.name : '');
  const q = $('#rQ'); q.textContent = spinning ? 'La roulette tourne…' : (e ? e.text : (pool().length ? 'Prêtes ? Lancez la roulette.' : 'Toutes les questions ont été tirées.'));
  q.classList.toggle('fade', !!reveal);
  $('#rSens').hidden = !(e && e.sensitive);
  $('#rSkip').textContent = e && e.sensitive ? 'Je passe cette question' : 'Je passe';
  const flash = e && e.mode === 'flash';
  $('#rTimer').hidden = !flash;
  setWho('rWho');
}
function renderHistory() {
  const sel = $('#hFilter'), v = sel.value || '';
  const modesIn = [...new Set(S.entries.map(e => e.mode))];
  sel.innerHTML = '<option value="">Tous les modes</option>' + modesIn.map(id => `<option value="${id}">${esc(modeById(id).short)}</option>`).join('');
  sel.value = modesIn.includes(v) ? v : '';
  const rows = S.entries.filter(e => !sel.value || e.mode === sel.value).slice().reverse();
  $('#hList').innerHTML = rows.length ? rows.map(e => `<li class="${e.status === 'current' ? 'cur' : ''}">
    <div class="hm"><b>N° ${e.n}</b><span>${esc(modeById(e.mode).short)}</span><span>${esc(themeOf(e.th).short)}</span><span class="st st-${e.status}">${STATUS[e.status]}</span></div>
    <div>${esc(e.text)}</div></li>`).join('') : `<li class="empty" style="padding:1.2rem">${S.entries.length ? 'Aucune question dans ce mode.' : 'Aucune question tirée pour le moment.'}</li>`;
}
function renderAll(reveal) {
  const v = currentView();
  if (v === 'roulette') renderWheel();
  if (v === 'question') { renderQuestion(reveal); setWho('who'); }
  if (v === 'mode') $('#mCount').textContent = pool().length + ' questions disponibles avec ces filtres.';
  if (recOn()) renderRec(reveal);
  if (!$('#hist').hidden) renderHistory();
}
const histOpen = () => !$('#hist').hidden;
function toggleHist(open) { $('#hist').hidden = !(open ?? !histOpen()); if (histOpen()) renderHistory(); }

function exportHistory(kind, data = S) {
  if (!data.entries.length) { toast('Rien à exporter : aucune question tirée.'); return; }
  const nm = data.names || S.names;
  if (kind === 'csv') {
    download(`elco-session-${stamp()}.csv`, ['numero;mode;thematique;question;statut', ...data.entries.map(e => [e.n, csvCell(modeById(e.mode).name), csvCell(themeOf(e.th).name), csvCell(e.text), STATUS[e.status]].join(';'))].join('\r\n'), 'text/csv');
  } else {
    download(`elco-session-${stamp()}.txt`, `ELCO — Historique de session\r\nParticipantes : ${nm.A} et ${nm.B}\r\n${data.entries.length} question(s)\r\n\r\n` + data.entries.map(e => `${e.n}. [${modeById(e.mode).short} · ${themeOf(e.th).name}] (${STATUS[e.status]})\r\n   ${e.text}`).join('\r\n\r\n'), 'text/plain');
  }
}

/* ───────── Mode tournage ───────── */
function recEnter() {
  if (!S.mode) return;
  $('#rec').hidden = false; $('#rec').classList.remove('clean'); document.body.classList.add('rec-on'); toggleHist(false);
  const e = current(); if (e && e.mode === 'flash') { $('#rTimer').innerHTML = $('#qTimer').innerHTML || ''; }
  renderRec();
  if (e && e.mode === 'flash') { if (timerQid === e.qid && tInt) { /* le chrono continue */ } else { timerQid = e.qid; startTimer(); } }
  const el = document.documentElement; if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
}
function recExit() {
  if (!recOn()) return;
  $('#rec').hidden = true; document.body.classList.remove('rec-on');
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  renderAll();
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && recOn()) recExit(); });

/* ───────── Administration ───────── */
let editing = null, shown = 60;
const allTypes = () => [...new Set([...MODES.flatMap(m => m.types), ...bank.questions.map(q => q.ty).filter(Boolean)])];
function fillSelect(sel, items, first) {
  const v = sel.value;
  sel.innerHTML = (first ? `<option value="${first[0]}">${esc(first[1])}</option>` : '') + items.map(([val, lab]) => `<option value="${val}">${esc(lab)}</option>`).join('');
  if ([...sel.options].some(o => o.value === v)) sel.value = v;
}
function modeChecks(selected, name) {
  return MODES.map(m => `<label class="chk"><input type="checkbox" name="${name}" value="${m.id}"${selected.includes(m.id) ? ' checked' : ''}> ${esc(m.short)}</label>`).join('');
}
function renderAdmin() {
  const themeItems = bank.themes.map(t => [t.id, t.name]);
  fillSelect($('#addTheme'), themeItems);
  fillSelect($('#aTheme'), themeItems, ['0', 'Toutes les thématiques']);
  fillSelect($('#aMode'), MODES.map(m => [m.id, m.short]), ['', 'Tous les modes']);
  $('#addModes').innerHTML = modeChecks([], 'addMode');
  $('#typeList').innerHTML = allTypes().map(t => `<option value="${esc(t)}">`).join('');
  $('#allowRepeat').checked = !!bank.allowRepeat;
  $('#modesToggle').innerHTML = MODES.map(m => `<label class="chk"><input type="checkbox" data-moff="${m.id}"${bank.modesOff.includes(m.id) ? '' : ' checked'}> ${esc(m.name)} <span style="color:var(--muted)">(${bank.questions.filter(q => q.active !== false && q.modes.includes(m.id)).length})</span></label>`).join('');
  const act = bank.questions.filter(q => q.active !== false).length;
  $('#adminSummary').innerHTML = `<span class="badge p">${bank.questions.length} questions</span><span class="badge">${act} actives</span><span class="badge">${bank.questions.length - act} inactives</span><span class="badge">${bank.themes.length} thématiques</span>`;

  const term = norm($('#aSearch').value), fm = $('#aMode').value, ft = Number($('#aTheme').value), fd = Number($('#aDiff').value), fa = $('#aActive').value;
  const rows = bank.questions.filter(q => (!term || norm(q.text).includes(term) || String(q.id) === term) && (!fm || q.modes.includes(fm)) && (!ft || q.th === ft)
    && (!fd || (q.d || 1) === fd) && (fa === 'all' || (fa === 'on') === (q.active !== false)));
  $('#aCount').textContent = `${rows.length} résultat(s)`;
  $('#qList').innerHTML = rows.length ? rows.slice(0, shown).map(q => adminRow(q)).join('') : '<li class="empty">Aucune question ne correspond.</li>';
  $('#moreBtn').hidden = rows.length <= shown;
  const hs = store.get(KEY_H, []);
  $('#sessList').innerHTML = hs.length ? hs.map((h, i) => `<div class="sess"><span><strong>${new Date(h.date).toLocaleString('fr-FR')}</strong> · ${esc(modeById(h.mode) ? modeById(h.mode).short : h.mode)} · ${esc(h.names.A)} / ${esc(h.names.B)} · ${h.entries.length} question(s)</span>
    <span class="row"><button class="btn btn-line btn-sm" type="button" data-act="sess-csv" data-i="${i}">CSV</button><button class="btn btn-line btn-sm" type="button" data-act="sess-txt" data-i="${i}">TXT</button></span></div>`).join('')
    + '<p style="margin-top:.8rem"><button class="btn btn-danger btn-sm" type="button" data-act="sess-clear">Vider l’historique</button></p>'
    : '<p class="empty">Aucune session archivée pour le moment.</p>';
}
function adminRow(q) {
  if (editing === q.id) {
    return `<li class="qrow"><span class="qid">${q.id}</span><div class="qedit">
      <textarea id="eText" rows="3" aria-label="Texte">${esc(q.text)}</textarea>
      <div class="form-grid">
        <div class="field"><label for="eTheme">Thématique</label><select id="eTheme">${bank.themes.map(t => `<option value="${t.id}"${t.id === q.th ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="eDiff">Difficulté</label><select id="eDiff">${[1, 2, 3].map(d => `<option value="${d}"${(q.d || 1) === d ? ' selected' : ''}>${d}</option>`).join('')}</select></div>
        <div class="field"><label for="eType">Type</label><input type="text" id="eType" list="typeList" value="${esc(q.ty || '')}"></div>
      </div>
      <div class="checks" id="eModes">${modeChecks(q.modes, 'eMode')}</div>
      <div class="form-grid">
        <div class="field"><label for="eSource">Source</label><input type="text" id="eSource" value="${esc(q.source || '')}"></div>
        <div class="field"><label for="eDate">Date</label><input type="date" id="eDate" value="${esc(q.date || '')}"></div>
        <label class="chk"><input type="checkbox" id="eSens"${q.sensitive ? ' checked' : ''}> Sujet sensible</label>
        <label class="chk"><input type="checkbox" id="eActive"${q.active !== false ? ' checked' : ''}> Active</label>
      </div></div>
      <span class="qb"><button class="btn btn-pink btn-sm" type="button" data-act="q-save" data-id="${q.id}">Enregistrer</button><button class="btn btn-line btn-sm" type="button" data-act="q-cancel">Annuler</button></span></li>`;
  }
  return `<li class="qrow${q.active === false ? ' inactive' : ''}"><span class="qid">${q.id}</span><div>${esc(q.text)}</div>
    <span class="qb"><button class="btn btn-line btn-sm" type="button" data-act="q-edit" data-id="${q.id}">Modifier</button><button class="btn btn-danger btn-sm" type="button" data-act="q-del" data-id="${q.id}">Supprimer</button></span>
    <span class="qm"><span class="tag">${esc(themeOf(q.th).name)}</span>${q.modes.map(m => `<span class="tag">${esc(modeById(m) ? modeById(m).short : m)}</span>`).join('')}<span>Diff. ${q.d || 1}</span>${q.ty ? `<span>${esc(q.ty)}</span>` : ''}${q.sensitive ? '<span>Sensible</span>' : ''}${q.source ? `<span>Source : ${esc(q.source)}${q.date ? ' (' + esc(q.date) + ')' : ''}</span>` : ''}
    <label class="chk"><input type="checkbox" data-qactive="${q.id}"${q.active !== false ? ' checked' : ''}> Active</label></span></li>`;
}
const isDup = (text, exceptId) => bank.questions.some(q => q.id !== exceptId && norm(q.text) === norm(text));
function afterBank() { saveBank(); renderHome(); renderAdmin(); if (S.mode) renderAll(); }
function themeIdFor(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(v); if (Number.isInteger(n) && bank.themes.some(t => t.id === n)) return n;
  const t = bank.themes.find(x => norm(x.name) === norm(v) || norm(x.short) === norm(v));
  if (t) return t.id;
  const id = bank.nextTheme++; bank.themes.push({ id, name: String(v).trim(), short: String(v).trim().slice(0, 15) }); return id;
}
function modeIdsFor(v) {
  const arr = Array.isArray(v) ? v : String(v ?? '').split(/[|,;]/);
  return [...new Set(arr.map(x => String(x).trim()).filter(Boolean).map(x => {
    const m = MODES.find(m => m.id === x || norm(m.short) === norm(x) || norm(m.name) === norm(x)); return m && m.id;
  }).filter(Boolean))];
}
function addQuestion(o) {
  const text = String(o.text || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'empty';
  if (isDup(text)) return 'dup';
  const modes = o.modes || []; if (!modes.length) return 'nomode';
  bank.questions.push({ id: bank.nextId++, th: o.th, text, ty: o.ty || '', d: [1, 2, 3].includes(o.d) ? o.d : 2, modes, sensitive: !!o.sensitive || modes.includes('confidences') || undefined, source: o.source || undefined, date: o.date || undefined, active: o.active !== false });
  return 'ok';
}
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
function importText(txt, filename) {
  let items = [];
  if (/\.json$/i.test(filename) || /^\s*[\[{]/.test(txt)) {
    const data = JSON.parse(txt), arr = Array.isArray(data) ? data : data.questions;
    if (!Array.isArray(arr)) throw new Error('format');
    items = arr.map(o => ({ text: o.text ?? o.question, theme: o.theme ?? o.thematique ?? o.th ?? o.categorie, modes: o.modes ?? o.mode, d: Number(o.d ?? o.difficulte), ty: o.ty ?? o.type, source: o.source, date: o.date, sensitive: o.sensitive ?? o.sensible, active: o.active ?? o.actif }));
  } else {
    const rows = parseCSV(txt); if (!rows.length) throw new Error('format');
    const h = rows[0].map(norm), ix = re => h.findIndex(x => re.test(x));
    const iT = ix(/^(question|text|texte)$/), iTh = ix(/^(theme|thematique|categorie|category)$/), iM = ix(/^(modes?)$/), iD = ix(/^(difficulte|d)$/), iTy = ix(/^(type|ty)$/), iS = ix(/^source$/), iDa = ix(/^date$/), iSe = ix(/^(sensible|sensitive)$/), iA = ix(/^(actif|active)$/);
    if (iT < 0) throw new Error('format');
    const yes = v => /^(1|oui|true|x)$/i.test(String(v || '').trim());
    rows.slice(1).forEach(r => items.push({ text: r[iT], theme: iTh >= 0 ? r[iTh] : null, modes: iM >= 0 ? r[iM] : '', d: iD >= 0 ? Number(r[iD]) : 2, ty: iTy >= 0 ? r[iTy] : '', source: iS >= 0 ? r[iS] : '', date: iDa >= 0 ? r[iDa] : '', sensitive: iSe >= 0 ? yes(r[iSe]) : false, active: iA >= 0 ? !/^(0|non|false)$/i.test((r[iA] || '').trim()) : true }));
  }
  let added = 0, dup = 0, bad = 0;
  items.forEach(it => {
    const th = themeIdFor(it.theme), modes = modeIdsFor(it.modes);
    if (th === null || !modes.length) { bad++; return; }
    const r = addQuestion({ ...it, th, modes });
    if (r === 'ok') added++; else if (r === 'dup') dup++; else bad++;
  });
  return { added, dup, bad };
}
function exportQuestions(kind) {
  if (kind === 'json') download(`elco-questions-${stamp()}.json`, JSON.stringify(bank.questions.map(q => ({ ...q, theme: themeOf(q.th).name })), null, 2), 'application/json');
  else download(`elco-questions-${stamp()}.csv`, ['id;modes;theme;question;difficulte;type;actif;sensible;source;date', ...bank.questions.map(q => [q.id, q.modes.join('|'), csvCell(themeOf(q.th).name), csvCell(q.text), q.d || 1, csvCell(q.ty || ''), q.active !== false ? 'oui' : 'non', q.sensitive ? 'oui' : 'non', csvCell(q.source || ''), q.date || ''].join(';'))].join('\r\n'), 'text/csv');
}

/* ───────── Actions ───────── */
const actions = {
  'open-mode': b => openMode(b.dataset.mode),
  'start-tous': () => openMode('tous'),
  'go-wheel': () => { if (!pool().length) { toast('Aucune question avec ces filtres.'); return; } ensureQueue(); saveSession(); go('roulette'); },
  resume: () => go(current() ? 'question' : 'roulette'),
  spin: () => { Sound.ensure(); spin(); },
  shuffle: () => { S.queue = shuffle(bank.questions.map(q => q.id)); saveSession(); const m = $('#wMsg'); m.dataset.keep = '1'; m.textContent = 'Questions mélangées : l’ordre de tirage est renouvelé.'; Sound.pop(); },
  next: () => { if (endTurn('answered')) afterTurn(); },
  skip: () => { if (endTurn('skipped')) afterTurn(); },
  passmic: passMic,
  'to-wheel': () => go('roulette'),
  hist: () => toggleHist(true), 'hist-close': () => toggleHist(false),
  'back-current': () => { toggleHist(false); go(current() ? 'question' : 'roulette'); },
  reset: resetSession,
  'rec-on': recEnter, 'rec-off': recExit,
  'rec-hide': () => $('#rec').classList.add('clean'),
  'rec-full': () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); },
  'export-csv': () => exportHistory('csv'), 'export-txt': () => exportHistory('txt'),
  'sess-csv': b => exportHistory('csv', store.get(KEY_H, [])[Number(b.dataset.i)]),
  'sess-txt': b => exportHistory('txt', store.get(KEY_H, [])[Number(b.dataset.i)]),
  'sess-clear': async () => { if (await confirmDialog('Vider l’historique ?', 'Toutes les sessions archivées seront supprimées.', 'Vider')) { store.set(KEY_H, []); renderAdmin(); } },
  'q-export-json': () => exportQuestions('json'), 'q-export-csv': () => exportQuestions('csv'),
  'q-edit': b => { editing = Number(b.dataset.id); renderAdmin(); },
  'q-cancel': () => { editing = null; renderAdmin(); },
  'q-save': b => {
    const q = bank.questions.find(x => x.id === Number(b.dataset.id)); if (!q) return;
    const text = $('#eText').value.replace(/\s+/g, ' ').trim(), modes = $$('#eModes input:checked').map(i => i.value);
    if (!text) return toast('Le texte ne peut pas être vide.');
    if (isDup(text, q.id)) return toast('Cette question existe déjà.');
    if (!modes.length) return toast('Choisissez au moins un mode.');
    Object.assign(q, { text, modes, th: Number($('#eTheme').value), d: Number($('#eDiff').value), ty: $('#eType').value.trim(), source: $('#eSource').value.trim() || undefined, date: $('#eDate').value || undefined, sensitive: $('#eSens').checked || undefined, active: $('#eActive').checked });
    editing = null; afterBank(); toast('Question enregistrée.');
  },
  'q-del': async b => {
    const q = bank.questions.find(x => x.id === Number(b.dataset.id)); if (!q) return;
    if (!await confirmDialog('Supprimer cette question ?', '« ' + q.text.slice(0, 120) + (q.text.length > 120 ? '…' : '') + ' »', 'Supprimer')) return;
    bank.questions = bank.questions.filter(x => x.id !== q.id); afterBank(); toast('Question supprimée.');
  },
  'q-restore': async () => {
    if (!await confirmDialog('Rétablir la banque d’origine ?', 'Vos ajouts, modifications et suppressions seront remplacés par la banque d’origine d’ELCO.', 'Rétablir')) return;
    bank = defaultBank(); editing = null; S = freshSession(S); afterBank(); toast('Banque d’origine rétablie.');
  }
};
document.addEventListener('click', e => {
  const nb = e.target.closest('[data-nav-to]'); if (nb) { go(nb.dataset.navTo); return; }
  const b = e.target.closest('[data-act]');
  if (b && actions[b.dataset.act] && !b.disabled) actions[b.dataset.act](b);
});
$('#wheel').addEventListener('click', () => { if (!$('#spinBtn').disabled) actions.spin(); });
$('#hideBar').addEventListener('click', () => $('#rec').classList.remove('clean'));

/* champs */
$('#mCats').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on);
  const list = b.dataset.mx ? S.excl : S.catsOff, id = b.dataset.mx || Number(b.dataset.mc);
  const i = list.indexOf(id); if (on && i >= 0) list.splice(i, 1); if (!on && i < 0) list.push(id);
  saveSession(); $('#mCount').textContent = pool().length + ' questions disponibles avec ces filtres.';
});
$('#timerSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.timer = Number(b.dataset.t); saveSession(); $$('#timerSeg button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
const nameInput = (id, w) => $(id).addEventListener('input', e => { S.names[w] = e.target.value.slice(0, 28); saveSession(); if (currentView() !== 'mode') { setWho('who'); setWho('rWho'); } });
nameInput('#nameA', 'A'); nameInput('#nameB', 'B');
$('#whoA input').addEventListener('input', e => { S.names.A = e.target.value.slice(0, 28); saveSession(); });
$('#whoB input').addEventListener('input', e => { S.names.B = e.target.value.slice(0, 28); saveSession(); });
['#whoA', '#whoB'].forEach(s => $(s).addEventListener('click', e => { if (e.target.tagName !== 'INPUT') { S.speaker = s === '#whoA' ? 'A' : 'B'; S.starter = S.speaker; saveSession(); setWho('who'); } }));
$('#hFilter').addEventListener('change', renderHistory);
$('#addForm').addEventListener('submit', e => {
  e.preventDefault();
  const nt = $('#addNewTheme').value.trim();
  const th = nt ? themeIdFor(nt) : Number($('#addTheme').value);
  const r = addQuestion({ text: $('#addText').value, th, modes: $$('#addModes input:checked').map(i => i.value), d: Number($('#addDiff').value), ty: $('#addType').value.trim(), source: $('#addSource').value.trim(), date: $('#addDate').value, sensitive: $('#addSens').checked });
  if (r === 'empty') return toast('Écrivez une question.');
  if (r === 'dup') return toast('Cette question existe déjà.');
  if (r === 'nomode') return toast('Choisissez au moins un mode.');
  $('#addForm').reset(); afterBank(); toast('Question ajoutée.');
});
['#aSearch', '#aMode', '#aTheme', '#aDiff', '#aActive'].forEach(s => $(s).addEventListener('input', () => { shown = 60; renderAdmin(); }));
$('#moreBtn').addEventListener('click', () => { shown += 60; renderAdmin(); });
$('#allowRepeat').addEventListener('change', e => { bank.allowRepeat = e.target.checked; saveBank(); });
$('#modesToggle').addEventListener('change', e => {
  const m = e.target.dataset.moff; if (!m) return;
  bank.modesOff = e.target.checked ? bank.modesOff.filter(x => x !== m) : [...bank.modesOff, m];
  saveBank(); renderHome();
});
$('#qList').addEventListener('change', e => {
  const id = e.target.dataset.qactive; if (!id) return;
  bank.questions.find(q => q.id === Number(id)).active = e.target.checked; afterBank();
});
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const r = importText(await f.text(), f.name); afterBank(); toast(`${r.added} ajoutée(s), ${r.dup} doublon(s) ignoré(s), ${r.bad} invalide(s).`); }
  catch { toast('Fichier illisible : utilisez un JSON ou un CSV valide.'); }
});

/* clavier */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (recOn()) { recExit(); return; }
    if (histOpen()) { toggleHist(false); return; }
  }
  if (e.ctrlKey || e.metaKey || e.altKey || $('#dlg').open) return;
  const v = currentView();
  if (!(v === 'roulette' || v === 'question' || recOn())) return;
  if (e.target.closest('input,textarea,select,button,a,summary')) return;
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'enter') { e.preventDefault(); if (v === 'question' && !recOn()) return; actions.spin(); }
  else if (k === 'n') actions.next();
  else if (k === 'p') actions.skip();
  else if (k === 'm') passMic();
  else if (k === 'h' && !recOn()) toggleHist();
});

/* ───────── Thème et sons ───────── */
let themePref = store.get(KEY_T, 'auto');
function applyTheme() {
  const r = document.documentElement;
  if (themePref === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', themePref);
  $('#themeBtn').textContent = 'Fond : ' + { auto: 'auto', light: 'blanc', dark: 'sombre' }[themePref];
}
$('#themeBtn').addEventListener('click', () => { themePref = { auto: 'light', light: 'dark', dark: 'auto' }[themePref]; store.set(KEY_T, themePref); applyTheme(); });
function applySound() { $('#soundBtn').textContent = 'Sons : ' + (Sound.on ? 'oui' : 'non'); $('#soundBtn').setAttribute('aria-pressed', Sound.on); }
$('#soundBtn').addEventListener('click', () => { Sound.on = !Sound.on; store.set(KEY_SND, Sound.on); applySound(); if (Sound.on) Sound.ding(); });

/* ───────── Navigation ───────── */
const VIEWS = ['accueil', 'mode', 'roulette', 'question', 'apropos', 'admin'];
const currentView = () => { const h = location.hash.replace('#', ''); return VIEWS.includes(h) ? h : 'accueil'; };
function go(name) { if (location.hash === '#' + name) route(); else location.hash = '#' + name; }
function route() {
  let v = currentView();
  if (['mode', 'roulette', 'question'].includes(v) && !S.mode) v = 'accueil';
  if (v === 'question' && !current()) v = 'roulette';
  if (v !== currentView()) { history.replaceState(null, '', '#' + v); }
  $$('.view').forEach(s => { s.hidden = s.dataset.view !== v; });
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === v));
  if (v !== 'question') stopTimer();
  if (v === 'accueil') renderHome();
  if (v === 'mode') renderModePage();
  if (v === 'roulette') { const m = $('#wMsg'); m.dataset.keep = ''; renderWheel(); }
  if (v === 'question') { renderQuestion(true); setWho('who'); }
  if (v === 'admin') renderAdmin();
  if (v !== 'roulette' && v !== 'question') toggleHist(false);
  window.scrollTo(0, 0);
  if (v === 'roulette' && pendingSpin) { pendingSpin = false; setTimeout(() => spin(), 350); }
}
window.addEventListener('hashchange', route);

/* ───────── Démarrage ───────── */
applyTheme(); applySound();
// Lien direct d'aperçu : ?mode=flash&vue=question|roulette|mode|tournage&fond=blanc|sombre
let demoVue = null;
{
  const qp = new URLSearchParams(location.search), dm = qp.get('mode'), fond = qp.get('fond');
  if (fond === 'blanc' || fond === 'sombre') { themePref = fond === 'blanc' ? 'light' : 'dark'; applyTheme(); }
  if (dm && modeById(dm)) {
    demoVue = qp.get('vue'); S = freshSession(); S.mode = dm;
    if (['question', 'tournage'].includes(qp.get('vue'))) {
      ensureQueue(); const pk = pickDraw();
      if (pk) { const q = pk.question; S.entries.push({ n: 1, qid: q.id, th: q.th, text: q.text, mode: dm === 'tous' ? pk.key : dm, ty: q.ty || '', d: q.d || 1, sensitive: !!q.sensitive, ch: q.ch || null, source: q.source || '', date: q.date || '', status: 'current' }); S.curMode = S.entries[0].mode; }
    }
    history.replaceState(null, '', location.pathname + '#' + ({ question: 'question', tournage: 'question', roulette: 'roulette', mode: 'mode' }[qp.get('vue')] || 'mode'));
  }
}
renderHome(); route();
if (demoVue === 'tournage' && current()) recEnter();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__ELCO = { get state() { return S; }, get bank() { return bank; }, pool, sectors, pickDraw };
})();
