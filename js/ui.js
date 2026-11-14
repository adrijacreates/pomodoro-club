/* Pomodoro Club — UI shell: router, rendering, sheets, the timer (bar, activity sheet, Finish sheet,
   one-timer-at-a-time sheet), log-a-mistake, the jar reveal and toasts. Screens register themselves in PC.screens. */
(function () {
  'use strict';
  const PC = window.PC;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const calm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const UI = PC.ui = { route: { name: 'oggi', args: [] }, sheet: null, reveal: null, local: {} };
  const screens = PC.screens = {};
  const actions = PC.actions = {};
  const sheets = PC.sheets = {};
  PC.hooks = {};
  PC.esc = esc; PC.$ = $; PC.calm = calm;
  PC.chimeCount = 0;

  const TABS = [['oggi', 'Oggi', 'Today'], ['quaderno', 'Quaderno', 'Learn'], ['progressi', 'Progressi', 'Progress'], ['dispensa', 'Dispensa', 'Rewards']];

  /* ---------- router ---------- */
  function parseHash() {
    const parts = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const name = screens[parts[0]] ? parts[0] : 'oggi';
    return { name: name, args: parts.slice(1) };
  }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  PC.go = go;

  /* ---------- render ---------- */
  function focusKey(el) {
    if (!el || el === document.body) return null;
    if (el.id) return '#' + el.id;
    const d = el.dataset || {};
    if (d.bind) return '[data-bind="' + d.bind + '"]';
    if (d.act) return '[data-act="' + d.act + '"]' + (d.id ? '[data-id="' + d.id + '"]' : '') + (d.v ? '[data-v="' + d.v + '"]' : '');
    return null;
  }
  function render() {
    const S = PC.S, fk = focusKey(document.activeElement);
    const sel = document.activeElement && 'selectionStart' in document.activeElement ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    const welcome = !S.meta.welcomed;
    $('#app').hidden = welcome; $('#welcome').hidden = !welcome;
    if (welcome) { $('#welcome').innerHTML = screens.welcome.render(); $('#view').innerHTML = ''; $('#timerbar').innerHTML = ''; }
    else {
      $('#welcome').innerHTML = '';
      const sc = screens[UI.route.name] || screens.oggi;
      const tab = sc.tab || '';
      const nav = TABS.map(t => '<a href="#/' + t[0] + '" class="tab"' + (tab === t[0] ? ' aria-current="page"' : '') + '><span class="tab-it">' + t[1] + '</span><span class="tab-en">' + t[2] + '</span></a>').join('');
      $('#tabbar').innerHTML = nav; $('#topnav').innerHTML = nav;
      $('#timerbar').innerHTML = timerBarHtml();
      $('#view').innerHTML = sc.render.apply(sc, UI.route.args);
      $('#view').className = 'view' + (sc.wide ? ' view-wide' : '');
      if (sc.mount) sc.mount($('#view'));
      $('#fab').hidden = !!sc.noFab;
      document.title = (sc.title ? sc.title + ' · ' : '') + 'Pomodoro Club';
    }
    renderSheet(); renderReveal();
    if (fk) { const el = $(fk); if (el && el !== document.activeElement) { try { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignore */ } } }
    paintTimer();
  }
  PC.render = render;

  let sheetOpener = null;
  function renderSheet() {
    const root = $('#sheet-root'), sh = UI.sheet;
    if (!sh) { if (root.innerHTML) { root.innerHTML = ''; document.body.classList.remove('has-sheet'); if (sheetOpener) { const el = $(sheetOpener); if (el) el.focus({ preventScroll: true }); sheetOpener = null; } } return; }
    const fresh = !root.innerHTML;
    root.innerHTML = '<div class="backdrop" data-act="sheet-backdrop"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1">' + sheets[sh.type](sh) + '</div>';
    document.body.classList.add('has-sheet');
    if (fresh) { const f = $('[data-autofocus]', root) || $('.sheet', root); f.focus({ preventScroll: true }); }
  }
  function openSheet(sh) {
    if (!UI.sheet) sheetOpener = focusKey(document.activeElement);
    $('#sheet-root').innerHTML = ''; UI.sheet = sh; render();
  }
  function closeSheet() { UI.sheet = null; render(); }
  PC.openSheet = openSheet; PC.closeSheet = closeSheet;

  let toastT = null;
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => { el.classList.remove('on'); el.textContent = ''; }, 2600); }
  PC.toast = toast;

  /* a button that needs a second tap: returns true on the second tap */
  function armed(btn, label) {
    if (btn._arm) { clearTimeout(btn._arm); btn._arm = null; return true; }
    const old = btn.textContent; btn.textContent = label || 'Tap again to confirm'; btn.classList.add('armed');
    btn._arm = setTimeout(() => { btn._arm = null; btn.textContent = old; btn.classList.remove('armed'); }, 4000);
    return false;
  }
  PC.armed = armed;

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    ensureAudio();
    const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'FORM') return;
    const fn = actions[el.dataset.act]; if (!fn) return;
    if (el.tagName !== 'A') e.preventDefault();
    fn(el, e);
  });
  document.addEventListener('submit', e => {
    const f = e.target; if (!f.dataset || !f.dataset.act) return;
    e.preventDefault(); const fn = actions[f.dataset.act]; if (fn) fn(f, e);
  });
  /* data-bind="a.b": writes the value into the open sheet's form (or UI.local) without re-rendering.
     data-live re-renders afterwards; data-then calls an action afterwards. */
  function onBind(e) {
    const el = e.target, k = el.dataset && el.dataset.bind; if (!k) return;
    const target = el.closest('#sheet-root') && UI.sheet ? UI.sheet.form : UI.local;
    target[k] = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.then && actions[el.dataset.then]) actions[el.dataset.then](el, e);
    if (el.dataset.live != null) render();
  }
  document.addEventListener('input', onBind);
  document.addEventListener('change', e => { if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox' || e.target.type === 'date' || e.target.type === 'file') onBind(e); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (UI.reveal) { actions['reveal-close'](); return; }
      if (UI.sheet) { actions['sheet-close'](); return; }
    }
    if (e.key === 'Tab' && UI.sheet) { // keep focus inside the open sheet
      const f = Array.from(document.querySelectorAll('#sheet-root .sheet a[href], #sheet-root .sheet button:not([disabled]), #sheet-root .sheet input, #sheet-root .sheet select, #sheet-root .sheet textarea'));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !$('#sheet-root').contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener('hashchange', () => { UI.route = parseHash(); UI.local = {}; render(); window.scrollTo(0, 0); $('#view').focus({ preventScroll: true }); });
  window.addEventListener('storage', e => { if (e.key === PC.NS) { PC.load(); render(); } }); // another tab changed the data

  actions['sheet-close'] = () => { const sh = UI.sheet; if (sh && sh.type === 'finish' && sh.mode === 'timer') return actions['fin-keep'](); closeSheet(); };
  actions['sheet-backdrop'] = () => { const sh = UI.sheet; if (sh && (sh.type === 'finish' || sh.type === 'switch')) return; closeSheet(); };
  actions['go'] = el => go(el.dataset.to);

  /* ---------- sound ---------- */
  let actx = null;
  function ensureAudio() { if (actx || !PC.S.settings.sound) return; try { const C = window.AudioContext || window.webkitAudioContext; if (C) actx = new C(); } catch (e) { /* no audio */ } }
  function chime() {
    PC.chimeCount++;
    if (!PC.S.settings.sound || !actx) return;
    try {
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime;
      [659.25, 880].forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + i * 0.18);
        g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.18 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.7);
        o.connect(g); g.connect(actx.destination); o.start(t + i * 0.18); o.stop(t + i * 0.18 + 0.75);
      });
    } catch (e) { /* ignore */ }
  }

  /* ---------- timer ---------- */
  const RING_C = 2 * Math.PI * 45;
  function timerLabel() {
    const t = PC.S.timer; if (!t) return '';
    const a = PC.act(t.activityId), r = PC.resName(t.activityId, t.resourceId);
    const tb = t.ctx && t.ctx.tableId ? PC.table(t.ctx.tableId) : null;
    return a.short + (r ? ' · ' + r : '') + (tb ? ' · ' + tb.t : '');
  }
  PC.timerLabel = timerLabel;
  function timerBarHtml() {
    const t = PC.S.timer; if (!t) return '';
    const running = !!t.runningSince;
    return '<div class="timerbar" role="region" aria-label="Running timer">'
      + '<button class="timerbar-main" data-act="timer-open" aria-label="Open ' + esc(timerLabel()) + '"><span class="timerbar-label">' + esc(timerLabel()) + (running ? '' : ' · paused') + '</span><strong class="timerbar-clock" data-clock>' + PC.fmtClock(PC.timerElapsed()) + '</strong></button>'
      + '<button class="btn btn-on-strong" data-act="' + (running ? 'timer-pause' : 'timer-resume') + '">' + (running ? 'Pause' : 'Resume') + '</button>'
      + '<button class="btn btn-invert" data-act="timer-finish">Finish</button></div>';
  }
  function toPomodoro(sec) {
    if (sec >= PC.POMODORO) { const n = Math.floor(sec / PC.POMODORO); return n + (n === 1 ? ' pomodoro' : ' pomodoros') + ' on the clock. The timer keeps going.'; }
    const left = PC.POMODORO - sec, m = Math.floor(left / 60), s = left % 60;
    return (m ? m + ' min ' : '') + s + ' s to your first pomodoro.';
  }
  /* cheap repaint of everything that shows the running time; no full render */
  function paintTimer() {
    const t = PC.S.timer; if (!t) return;
    const sec = PC.timerElapsed(), clock = PC.fmtClock(sec);
    document.querySelectorAll('[data-clock]').forEach(el => { if (el.textContent !== clock) el.textContent = clock; });
    document.querySelectorAll('[data-ring]').forEach(el => { el.style.strokeDashoffset = String(RING_C * (1 - Math.min(1, sec / PC.POMODORO))); });
    document.querySelectorAll('[data-to-pomo]').forEach(el => { const s = toPomodoro(sec); if (el.textContent !== s) el.textContent = s; });
  }
  let lastDay = PC.todayKey();
  function tick() {
    const t = PC.S.timer;
    if (t) {
      const sec = PC.timerElapsed();
      if (sec >= PC.POMODORO && !t.chimed) { t.chimed = true; PC.save(); if (t.runningSince && sec < PC.POMODORO + 10) chime(); }
      if (sec >= PC.CAP && t.runningSince) { PC.timerPause(); openFinish(false); return; } // forgotten timer
      paintTimer();
    }
    const d = PC.todayKey(); if (d !== lastDay) { lastDay = d; render(); }
  }
  PC.tick = tick;

  function sameCtx(a, b) { return ((a && a.tableId) || '') === ((b && b.tableId) || ''); }
  /* start timing an activity; with a timer already going, ask first (one timer at a time) */
  function startActivity(id, o) {
    o = o || {}; const t = PC.S.timer;
    if (t) {
      if (t.activityId === id && sameCtx(t.ctx, o.ctx)) { if (o.resume && !t.runningSince) PC.timerResume(); if (o.sheet !== false && PC.act(id).opens === 'sheet') openSheet({ type: 'activity', id: id, form: {} }); else render(); return; }
      openSheet({ type: 'switch', to: { id: id, o: o }, form: {} }); return;
    }
    PC.timerStart(id, o.resourceId, o.ctx);
    if (o.sheet !== false && PC.act(id).opens === 'sheet') openSheet({ type: 'activity', id: id, form: {} }); else render();
  }
  PC.startActivity = startActivity;

  /* turn the running timer into a saved session (+ the piece or table result that belongs to it) */
  function commitTimer(seconds, o) {
    o = o || {}; const t = PC.S.timer;
    const r = PC.addSession({
      activityId: t.activityId, date: PC.key(new Date(t.startedAt)), startedAt: t.startedAt, endedAt: Date.now(), seconds: seconds, source: 'timer',
      resourceId: o.resourceId !== undefined ? o.resourceId : t.resourceId, note: o.note || ''
    });
    if (t.activityId === 'writing' && PC.hooks.savePiece) PC.hooks.savePiece();
    if (t.ctx && t.ctx.tableId && o.result) PC.addTableResult(t.ctx.tableId, o.result);
    PC.timerClear();
    return r;
  }
  function afterSave(r) {
    if (r && r.after.jars > r.before.jars) { const q = []; for (let n = r.before.jars + 1; n <= r.after.jars; n++) q.push(n); startReveal(q); }
  }
  PC.afterSave = afterSave;

  function openFinish(wasRunning, extra) {
    const t = PC.S.timer; if (!t) return;
    if (wasRunning === undefined) wasRunning = !!t.runningSince;
    PC.timerPause();
    openSheet({ type: 'finish', mode: 'timer', wasRunning: wasRunning, elapsed: PC.timerElapsed(), activityId: t.activityId,
      form: Object.assign({ choice: 'exact', minutes: '', note: '', resourceId: t.resourceId || '', result: '' }, extra || {}) });
  }
  PC.openFinish = openFinish;
  function openManual(o) {
    o = o || {};
    openSheet({ type: 'finish', mode: 'manual', form: { choice: o.choice || 'typed', minutes: '', note: '', resourceId: '', activityId: o.activityId || 'vocab', date: o.date || PC.todayKey() } });
  }
  PC.openManual = openManual;

  actions['act-open'] = el => {
    const a = PC.act(el.dataset.id);
    if (a.opens === 'writing') return go('#/scritti');
    if (a.opens === 'grammar') return go('#/grammatica');
    openSheet({ type: 'activity', id: a.id, form: {} });
  };
  actions['act-start'] = el => {
    const a = PC.act(el.dataset.id);
    if (a.opens === 'writing') return go('#/scritti');
    if (a.opens === 'grammar') return go('#/grammatica');
    const sh = UI.sheet;
    startActivity(a.id, { resourceId: (sh && sh.type === 'activity' && sh.form.resourceId) || el.dataset.res || null, resume: true });
  };
  actions['act-res'] = el => { // "What are you using?"
    const sh = UI.sheet, t = PC.S.timer, v = el.dataset.v;
    if (t && t.activityId === sh.id) { t.resourceId = t.resourceId === v ? null : v; PC.save(); }
    else sh.form.resourceId = sh.form.resourceId === v ? '' : v;
    render();
  };
  actions['timer-open'] = () => {
    const t = PC.S.timer; if (!t) return;
    if (t.activityId === 'writing') return go('#/scritti');
    if (t.activityId === 'grammar') return go(t.ctx && t.ctx.tableId ? '#/table/' + t.ctx.tableId : '#/grammatica');
    if (t.activityId === 'review') return go('#/journal');
    openSheet({ type: 'activity', id: t.activityId, form: {} });
  };
  actions['timer-pause'] = () => { PC.timerPause(); render(); };
  actions['timer-resume'] = () => { PC.timerResume(); render(); };
  actions['timer-finish'] = () => openFinish();
  actions['manual-open'] = el => openManual({ activityId: el.dataset.id, choice: el.dataset.v, date: el.dataset.date });

  actions['switch-confirm'] = () => {
    const sh = UI.sheet, sec = PC.timerElapsed();
    const r = sec > 0 ? commitTimer(sec) : (PC.timerClear(), null); // the first session is saved before the second starts
    UI.sheet = null; $('#sheet-root').innerHTML = '';
    const a = PC.act(sh.to.id);
    PC.timerStart(sh.to.id, sh.to.o.resourceId, sh.to.o.ctx);
    if (sh.to.o.sheet !== false && a.opens === 'sheet') UI.sheet = { type: 'activity', id: a.id, form: {} };
    if (r) toast('Saved ' + PC.act(r.session.activityId).short + ' · ' + PC.fmtMin(r.session.seconds));
    render(); afterSave(r);
    if (sh.to.o.then) sh.to.o.then();
  };

  /* ---------- sheet: activity (Ready -> Running -> Paused) ---------- */
  sheets.activity = sh => {
    const a = PC.act(sh.id), t = PC.S.timer, mine = t && t.activityId === a.id;
    const state = !mine ? 'ready' : t.runningSince ? 'running' : 'paused';
    const sec = mine ? PC.timerElapsed() : 0;
    const resId = mine ? t.resourceId : sh.form.resourceId;
    const today = PC.todayKey(), todaySec = PC.sessionsOn(today).filter(s => s.activityId === a.id).reduce((x, s) => x + s.seconds, 0);
    const lastS = PC.S.sessions.filter(s => s.activityId === a.id).sort((x, y) => x.date < y.date ? 1 : -1)[0];
    const res = PC.resourcesFor(a.id);
    const quick = PC.isTutor(a.id, resId) ? [30, 45, 60] : [15, 20, 25];
    return '<div class="sheet-head"><div><p class="eyebrow">Activity · ' + esc(a.it) + '</p><h2 id="sheet-title">' + esc(a.name) + '</h2></div><button class="btn" data-act="sheet-close">Close</button></div>'
      + (res.length ? '<p class="label">What are you using?</p><div class="chips">' + res.map(r => '<button class="chip" data-act="act-res" data-v="' + esc(r.id) + '" aria-pressed="' + (resId === r.id) + '">' + esc(r.name) + '</button>').join('') + '</div>' : '')
      + '<div class="ring-wrap"><p class="ring-mark">25:00 · 1 pomodoro</p><div class="ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ring-track" cx="50" cy="50" r="45"/><circle class="ring-fill" data-ring cx="50" cy="50" r="45" stroke-dasharray="' + RING_C.toFixed(2) + '" stroke-dashoffset="' + (RING_C * (1 - Math.min(1, sec / PC.POMODORO))).toFixed(2) + '" transform="rotate(-90 50 50)"/><line class="ring-tick" x1="50" y1="0" x2="50" y2="10"/></svg>'
      + '<div class="ring-center"><span class="clock" ' + (mine ? 'data-clock' : '') + ' role="timer">' + PC.fmtClock(sec) + '</span><span class="muted">' + state + '</span></div></div>'
      + '<p class="muted center" ' + (mine ? 'data-to-pomo' : '') + '>' + (mine ? esc(toPomodoro(sec)) : 'The ring fills at 25:00, one pomodoro. The timer keeps going after it.') + '</p></div>'
      + '<div class="row">'
      + (state === 'ready' ? '<button class="btn btn-primary grow" data-act="act-start" data-id="' + a.id + '" data-autofocus>Start</button>'
        : '<button class="btn grow" data-act="' + (state === 'running' ? 'timer-pause' : 'timer-resume') + '">' + (state === 'running' ? 'Pause' : 'Resume') + '</button><button class="btn btn-primary grow" data-act="timer-finish">Finish</button>')
      + '</div>'
      + (state === 'ready' ? '<p class="label">Or log it without the timer</p><div class="chips">' + quick.map(m => '<button class="chip" data-act="manual-open" data-id="' + a.id + '" data-v="' + m + '">' + m + ' min</button>').join('') + '<button class="chip" data-act="manual-open" data-id="' + a.id + '">Other…</button></div>' : '')
      + '<div class="sheet-foot"><div class="split"><strong>' + esc(a.short) + ' today</strong><span class="muted">' + (todaySec ? PC.fmtMin(todaySec) : 'nothing saved yet') + '</span></div>'
      + '<p class="muted small">' + (lastS ? 'Last saved ' + PC.fmtDate(lastS.date) + '.' : 'Not logged yet.') + (state !== 'ready' ? ' Close the sheet and the timer keeps going in the bar.' : '') + '</p></div>';
  };

  /* ---------- sheet: one timer at a time ---------- */
  sheets['switch'] = sh => {
    const t = PC.S.timer, from = PC.act(t.activityId), to = PC.act(sh.to.id);
    return '<div class="sheet-head"><div><p class="eyebrow">One timer at a time</p><h2 id="sheet-title">Finish ' + esc(from.short) + ' (' + PC.fmtClock(PC.timerElapsed()) + ') and start ' + esc(to.short) + '?</h2></div></div>'
      + '<p class="muted">' + esc(from.short) + ' is saved with the time on its clock, then ' + esc(to.short) + ' starts.</p>'
      + '<div class="stack"><button class="btn btn-primary" data-act="switch-confirm" data-autofocus>Finish ' + esc(from.short) + ' and start ' + esc(to.short) + '</button><button class="btn" data-act="sheet-close">Keep timing ' + esc(from.short) + '</button></div>';
  };

  /* ---------- sheet: Finish / log by hand / edit a session (one sheet, three modes) ---------- */
  function finSeconds(sh) {
    const f = sh.form;
    if (f.choice === 'exact') return sh.mode === 'timer' ? sh.elapsed : sh.mode === 'edit' ? sh.orig.seconds : 0;
    if (f.choice === 'typed') { const m = parseFloat(String(f.minutes).replace(',', '.')); return isFinite(m) && m > 0 ? Math.round(Math.min(m, 1440) * 60) : 0; }
    return (+f.choice) * 60;
  }
  function finPreview(sh) {
    const sec = finSeconds(sh), old = sh.mode === 'edit' ? sh.orig.seconds : 0;
    if (sec <= 0) return sh.mode === 'timer' ? 'Nothing on the clock yet.' : 'Type the minutes, or pick a length.';
    const before = PC.tomatoStats(), after = PC.tomatoStats(before.total - old + sec);
    const gained = after.tomatoes - before.tomatoes, jars = after.jars - before.jars;
    let s = (sh.mode === 'edit' ? 'Becomes ' : 'Adds ') + PC.fmtMin(sec);
    if (gained > 0) s += ' · ' + gained + (gained === 1 ? ' tomato' : ' tomatoes') + ' earned';
    if (jars > 0) s += ' · ' + (jars === 1 ? 'fills jar ' + after.jars : 'fills ' + jars + ' jars');
    s += ' · ' + after.minsInto + ' of 25 min toward your next tomato.';
    return s;
  }
  sheets.finish = sh => {
    const f = sh.form, mode = sh.mode, t = PC.S.timer;
    const actId = mode === 'timer' ? sh.activityId : f.activityId, a = PC.act(actId);
    const res = PC.resourcesFor(actId), quick = PC.isTutor(actId, f.resourceId) ? [30, 45, 60] : [15, 20, 25];
    const sec = finSeconds(sh), today = PC.todayKey();
    const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>';
    let h = '<div class="sheet-head"><div><p class="eyebrow">' + (mode === 'timer' ? 'Save this session' : mode === 'manual' ? 'Log time by hand' : 'Edit session') + '</p><h2 id="sheet-title">' + esc(a.name) + '</h2>';
    if (mode === 'timer') {
      const d = PC.key(new Date(t.startedAt));
      h += '<p class="muted">' + (d === today ? 'Today' : PC.fmtDate(d)) + ', started ' + PC.fmtTime(t.startedAt) + ' · timed ' + PC.fmtClock(sh.elapsed) + '</p>';
    }
    h += '</div></div>';
    if (mode !== 'timer') {
      h += '<div class="grid2"><label class="field"><span>Activity</span><select data-bind="activityId" data-live>' + PC.ALL_ACTS.map(x => opt(x.id, x.name, f.activityId)).join('') + '</select></label>'
        + '<label class="field"><span>Day</span><input type="date" data-bind="date" max="' + today + '" value="' + esc(f.date) + '"></label></div>';
    }
    h += '<p class="label">Count it as</p><div class="chips">'
      + (mode === 'timer' ? '<button class="chip" data-act="fin-choice" data-v="exact" aria-pressed="' + (f.choice === 'exact') + '">' + PC.fmtClock(sh.elapsed) + '</button>' : '')
      + quick.map(m => '<button class="chip" data-act="fin-choice" data-v="' + m + '" aria-pressed="' + (String(f.choice) === String(m)) + '">' + m + '</button>').join('') + '</div>'
      + '<label class="field"><span>' + (mode === 'timer' ? 'Or type minutes' : 'Minutes') + '</span><input type="text" inputmode="decimal" autocomplete="off" data-bind="minutes" data-then="fin-typed" value="' + esc(f.minutes) + '"' + (mode !== 'timer' ? ' data-autofocus' : '') + '></label>';
    if (mode !== 'edit') {
      if (res.length) h += '<label class="field"><span>Resource (optional)</span><select data-bind="resourceId" data-live><option value="">None</option>' + res.map(r => opt(r.id, r.name, f.resourceId)).join('') + '</select></label>';
      h += '<label class="field"><span>Note (optional)</span><input type="text" data-bind="note" value="' + esc(f.note) + '"></label>';
    }
    if (mode === 'timer' && t.ctx && t.ctx.tableId) {
      h += '<p class="label">How did it go? (optional)</p><div class="chips">' + [['solid', 'Solid'], ['shaky', 'Shaky'], ['not finished', 'Not finished']].map(x => '<button class="chip" data-act="fin-result" data-v="' + x[0] + '" aria-pressed="' + (f.result === x[0]) + '">' + x[1] + '</button>').join('') + '</div>';
    }
    h += '<p class="preview" id="fin-preview" aria-live="polite">' + esc(finPreview(sh)) + '</p>'
      + (sh.error ? '<p class="error" role="alert">' + esc(sh.error) + '</p>' : '')
      + '<div class="stack"><button class="btn btn-primary" data-act="fin-save" id="fin-save"' + (sec <= 0 ? ' disabled' : '') + (mode === 'timer' ? ' data-autofocus' : '') + '>' + (mode === 'edit' ? 'Save changes' : mode === 'timer' ? 'Save' : 'Save session') + '</button>'
      + (mode === 'timer' ? '<div class="row"><button class="btn grow" data-act="fin-keep">Keep timing</button><button class="btn btn-quiet grow" data-act="fin-discard">Discard</button></div>' : '<button class="btn" data-act="sheet-close">Cancel</button>')
      + '</div>';
    return h;
  };
  actions['fin-choice'] = el => { const f = UI.sheet.form; f.choice = el.dataset.v; f.minutes = ''; UI.sheet.error = ''; render(); };
  actions['fin-result'] = el => { const f = UI.sheet.form; f.result = f.result === el.dataset.v ? '' : el.dataset.v; render(); };
  actions['fin-typed'] = () => { // typing minutes: update the preview in place, keep the caret where it is
    const sh = UI.sheet, f = sh.form;
    f.choice = String(f.minutes).trim() ? 'typed' : (sh.mode === 'manual' ? 'typed' : 'exact');
    $('#fin-preview').textContent = finPreview(sh); $('#fin-save').disabled = finSeconds(sh) <= 0;
    document.querySelectorAll('#sheet-root [data-act="fin-choice"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(f.choice))));
  };
  actions['fin-save'] = () => {
    const sh = UI.sheet, f = sh.form, sec = finSeconds(sh); if (sec <= 0) return;
    let r;
    if (sh.mode === 'timer') r = commitTimer(sec, { resourceId: f.resourceId || null, note: f.note, result: f.result });
    else {
      if (!PC.isKey(f.date) || f.date > PC.todayKey()) { sh.error = 'Pick today or an earlier day.'; render(); return; }
      if (sh.mode === 'manual') r = PC.addSession({ activityId: f.activityId, date: f.date, startedAt: null, seconds: sec, source: 'manual', resourceId: f.resourceId || null, note: f.note });
      else r = PC.updateSession(sh.orig.id, { seconds: sec, activityId: f.activityId, date: f.date });
    }
    UI.sheet = null;
    toast(sh.mode === 'edit' ? 'Changes saved' : 'Saved · ' + PC.fmtMin(sec));
    render(); afterSave(r);
  };
  actions['fin-keep'] = () => { const sh = UI.sheet; if (sh.wasRunning) PC.timerResume(); closeSheet(); };
  actions['fin-discard'] = el => { if (!armed(el, 'Tap again to discard this session')) return; PC.timerClear(); UI.sheet = null; toast('Session discarded'); render(); };

  /* ---------- sheet: log a mistake (never stops a running timer) ---------- */
  function openMistake(pre) {
    openSheet({ type: 'mistake', form: Object.assign({ wrote: '', correct: '', note: '', topicId: '', pieceId: '', editId: '' }, pre || {}) });
  }
  PC.openMistake = openMistake;
  sheets.mistake = sh => {
    const f = sh.form;
    return '<form data-act="mistake-save" novalidate><div class="sheet-head"><div><p class="eyebrow">Error Journal</p><h2 id="sheet-title">' + (f.editId ? 'Edit entry' : 'Log a mistake') + '</h2></div><button type="button" class="btn" data-act="sheet-close">Close</button></div>'
      + '<label class="field"><span>What I wrote or said</span><input type="text" lang="it" autocomplete="off" data-bind="wrote" value="' + esc(f.wrote) + '" data-autofocus></label>'
      + '<label class="field"><span>Correct version</span><input type="text" lang="it" autocomplete="off" data-bind="correct" value="' + esc(f.correct) + '"></label>'
      + '<label class="field"><span>Note (optional)</span><input type="text" data-bind="note" value="' + esc(f.note) + '"></label>'
      + '<label class="field"><span>Topic (optional)</span><select data-bind="topicId"><option value="">None</option>' + PC.TOPICS.map(t => '<option value="' + t[0] + '"' + (f.topicId === t[0] ? ' selected' : '') + '>' + esc(t[2]) + '</option>').join('') + '</select></label>'
      + (sh.error ? '<p class="error" role="alert">' + esc(sh.error) + '</p>' : '')
      + '<button class="btn btn-primary block" type="submit">' + (f.editId ? 'Save changes' : 'Save to journal') + '</button>'
      + (f.editId ? '' : '<p class="muted small">Saving counts today as a practice day. It adds no minutes.' + (PC.S.timer ? ' Your timer keeps going.' : '') + '</p>') + '</form>';
  };
  actions['mistake-open'] = () => openMistake();
  actions['mistake-save'] = () => {
    const sh = UI.sheet, f = sh.form, wrote = String(f.wrote).trim(), correct = String(f.correct).trim();
    if (!wrote || !correct) { sh.error = 'Fill in what you wrote and the correct version.'; render(); return; }
    if (f.editId) { const e = PC.S.journal.find(x => x.id === f.editId); if (e) Object.assign(e, { wrote: wrote, correct: correct, note: String(f.note).trim(), topicId: f.topicId || null }); }
    else PC.S.journal.push({ id: PC.uid('j'), wrote: wrote, correct: correct, note: String(f.note).trim(), topicId: f.topicId || null, pieceId: f.pieceId || null, createdAt: Date.now(), reviewedAt: null });
    PC.save(); UI.sheet = null; toast(f.editId ? 'Entry updated' : 'Saved to your journal'); render();
  };

  /* ---------- discoveries and the jar reveal ---------- */
  function discoveryHtml(n) {
    const d = PC.discovery(n), date = PC.S.jarDates[n];
    const head = '<p class="eyebrow">Jar no. ' + n + (date ? ' · filled ' + PC.fmtDate(date, { day: 'numeric', month: 'long' }) : '') + (d ? ' · ' + esc(d.category) : '') + '</p>';
    if (!d) return head + '<h2 class="disc-title">Discovery on its way</h2><p class="muted">This jar counts. Its discovery has not been written yet, and it will appear here when it is.</p>';
    return '<div class="img-slot" role="img" aria-label="' + esc(d.imageAlt) + '"><span>Image · jar no. ' + n + '</span></div>' + head
      + '<h2 class="disc-title">' + esc(d.title) + '</h2>' + (d.placeholder ? '<p class="tag">Placeholder text</p>' : '')
      + d.text.split(/\n\s*\n/).map(p => '<p>' + esc(p) + '</p>').join('')
      + '<p class="eyebrow">Parole da portare via</p><ul class="words">' + d.words.map(w => '<li><strong lang="it">' + esc(w[0]) + '</strong> · ' + esc(w[1]) + '</li>').join('') + '</ul>';
  }
  PC.discoveryHtml = discoveryHtml;
  function markRevealed(n) { if (PC.S.revealed.indexOf(n) < 0) { PC.S.revealed.push(n); PC.save(); } }
  PC.markRevealed = markRevealed;
  let revealT = null;
  function startReveal(queue) {
    clearTimeout(revealT);
    UI.reveal = { queue: queue.slice(1), n: queue[0], stage: calm() ? 'read' : 'fill' };
    if (UI.reveal.stage === 'read') markRevealed(queue[0]);
    else revealT = setTimeout(() => { if (UI.reveal && UI.reveal.stage === 'fill') { UI.reveal.stage = 'read'; markRevealed(UI.reveal.n); render(); } }, 1100);
    render();
  }
  function renderReveal() {
    const root = $('#reveal-root'), rv = UI.reveal;
    if (!rv) { if (root.innerHTML) root.innerHTML = ''; return; }
    const key = rv.n + rv.stage; if (root.dataset.k === key && root.innerHTML) return; root.dataset.k = key;
    if (rv.stage === 'fill') {
      root.innerHTML = '<div class="reveal" role="dialog" aria-modal="true" aria-label="Jar ' + rv.n + ' is full"><div class="reveal-fill"><div class="jar jar-big jar-filling" aria-hidden="true"><i></i></div><h2>Jar no. ' + rv.n + ' is full</h2><button class="btn" data-act="reveal-skip">Skip</button></div></div>';
    } else {
      root.innerHTML = '<div class="reveal" role="dialog" aria-modal="true" aria-labelledby="reveal-h"><div class="reveal-read"><p class="reveal-note" id="reveal-h">Jar no. ' + rv.n + ' is full. Here is its discovery.</p>' + discoveryHtml(rv.n)
        + '<div class="row">' + (rv.queue.length ? '<button class="btn btn-primary grow" data-act="reveal-next">' + rv.queue.length + ' more</button>' : '') + '<button class="btn ' + (rv.queue.length ? '' : 'btn-primary ') + 'grow" data-act="reveal-close" id="reveal-close">Close</button></div></div></div>';
      const b = $('#reveal-close'); if (b) b.focus({ preventScroll: true });
    }
  }
  actions['reveal-skip'] = () => { clearTimeout(revealT); UI.reveal.stage = 'read'; markRevealed(UI.reveal.n); render(); };
  actions['reveal-next'] = () => { const q = UI.reveal.queue; $('#reveal-root').innerHTML = ''; startReveal(q); };
  actions['reveal-close'] = () => { clearTimeout(revealT); UI.reveal = null; $('#reveal-root').innerHTML = ''; render(); }; // back to where the learner was

  /* ---------- boot ---------- */
  PC.boot = function () {
    PC.load(); PC.reconcileJars(); UI.route = parseHash();
    render(); setInterval(tick, 250); tick();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); render(); } });
  };
})();
