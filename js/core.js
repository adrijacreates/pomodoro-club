/* Pomodoro Club — core: storage, the session log, the timer record and every calculation.
   Nothing here touches the DOM. The session log is the record everything else is worked out from:
   totals, streaks, tomatoes and jars are never stored as counters. */
(function (root) {
  'use strict';

  const NS = 'pc.v1';              // every record lives under this one key
  const KEY_NS = 'pc.v1.aikey';    // the AI key is kept apart so it can never end up in a backup
  const SCHEMA = 1;
  const POMODORO = 1500;           // 25 min = 1 tomato
  const JAR_TOMATOES = 8;
  const JAR_SEC = POMODORO * JAR_TOMATOES; // 200 min
  const CAP = 10800;               // a single run stops itself at 3 h

  const ACTS = root.PC_ACTIVITIES;
  const REVIEW = root.PC_REVIEW;
  const ALL_ACTS = ACTS.concat([REVIEW]);
  const TOPICS = root.PC_TOPICS.TOPICS;
  const PROMPTS = root.PC_TOPICS.PROMPTS;
  const DEFAULT_TOPICS = root.PC_TOPICS.DEFAULT_TOPICS;
  const TABLES = root.PC_TABLES;
  const DISCOVERIES = root.PC_DISCOVERIES;

  /* ---------- dates ---------- */
  const pad = n => String(n).padStart(2, '0');
  const key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = k => { const p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12); };
  const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return key(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const todayKey = () => key(new Date());
  const isKey = k => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && !isNaN(parse(k));
  const fmtDate = (k, o) => { try { return new Intl.DateTimeFormat('en-GB', o || { day: 'numeric', month: 'short' }).format(parse(k)); } catch (e) { return k; } };
  const fmtTime = ms => { try { return new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(ms)); } catch (e) { return ''; } };
  const weekStart = k => { const d = parse(k); const wd = (d.getDay() + 6) % 7; return addDays(k, -wd); }; // Monday
  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  const uid = p => (p || 'x') + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ---------- durations ---------- */
  const wholeMin = sec => Math.floor(sec / 60);
  function fmtMin(sec) { // "<1 min", "5 min", "1 h 05 min"
    if (sec <= 0) return '0 min';
    if (sec < 60) return '<1 min';
    const m = wholeMin(sec);
    return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + pad(m % 60) + ' min';
  }
  function fmtClock(sec) { // 12:40, 1:02:05
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
  }

  /* ---------- state ---------- */
  function blank() {
    return {
      schema: SCHEMA,
      sessions: [],          // Session: id, activityId, date, startedAt, endedAt, seconds, source, resourceId?, note?, createdAt, updatedAt
      timer: null,           // Active timer: activityId, resourceId?, startedAt, accumulatedSeconds, runningSince, chimed, ctx?
      journal: [],           // Journal entry: id, wrote, correct, note?, topicId?, pieceId?, createdAt, reviewedAt?
      pieces: [],            // Writing piece: id, date, promptId, goal, text, feedback?, updatedAt
      draft: null,           // the piece being written: promptId, goal, text, pieceId?, feedback?
      analysis: null,        // Analysis: summary, patterns[], strengths[], at, pieceCount
      tailored: [],          // Tailored prompt: id, text, focus, hint, createdAt (+ title, pts)
      grammar: {},           // sectionId -> { state, stateAt, results: [{date, result}] }
      topics: DEFAULT_TOPICS.slice(),
      jarDates: {},          // jar number -> date earned
      revealed: [],          // discovery numbers already shown
      exam: { A: null, B: null, log: { u: 0, list: [] } },
      resources: {},
      settings: { name: '', goal: null, pinned: ['vocab'], sound: true },
      meta: { welcomed: false, hidden: { date: '', ids: [] }, lastBackup: null, resview: null }
    };
  }
  let S = blank();
  let storageOk = true;

  function normalise(d) {
    const b = blank();
    const out = Object.assign(b, d || {});
    out.settings = Object.assign(blank().settings, (d && d.settings) || {});
    out.meta = Object.assign(blank().meta, (d && d.meta) || {});
    out.exam = Object.assign(blank().exam, (d && d.exam) || {});
    if (!out.exam.log || !Array.isArray(out.exam.log.list)) out.exam.log = { u: 0, list: [] };
    if (!out.meta.hidden || !Array.isArray(out.meta.hidden.ids)) out.meta.hidden = { date: '', ids: [] };
    ['sessions', 'journal', 'pieces', 'tailored', 'revealed', 'topics'].forEach(k => { if (!Array.isArray(out[k])) out[k] = b[k]; });
    ['grammar', 'jarDates', 'resources'].forEach(k => { if (!out[k] || typeof out[k] !== 'object' || Array.isArray(out[k])) out[k] = {}; });
    if (!Array.isArray(out.settings.pinned)) out.settings.pinned = ['vocab'];
    delete out.settings.aiKey;
    out.schema = SCHEMA;
    return out;
  }
  function load() {
    try {
      const raw = localStorage.getItem(NS);
      S = raw ? normalise(JSON.parse(raw)) : blank();
    } catch (e) { S = blank(); storageOk = false; }
    return S;
  }
  function save() {
    try { localStorage.setItem(NS, JSON.stringify(S)); storageOk = true; } catch (e) { storageOk = false; }
  }

  /* AI key: this browser only; never in the state, never exported, never logged */
  const getKey = () => { try { return localStorage.getItem(KEY_NS) || ''; } catch (e) { return ''; } };
  const setKey = k => { try { k ? localStorage.setItem(KEY_NS, k) : localStorage.removeItem(KEY_NS); } catch (e) { /* ignore */ } };

  /* ---------- activities ---------- */
  const act = id => ALL_ACTS.find(a => a.id === id) || { id: id, name: id, short: id, it: '', resources: [], opens: 'sheet' };
  /* resources offered on an activity: its own suggestions + Risorse items in "Using now" that are good for its skill */
  function resourcesFor(activityId) {
    const a = act(activityId), out = (a.resources || []).map(r => ({ id: r.id, name: r.name, tutor: !!r.tutor }));
    if (a.skill) Object.keys(S.resources).map(id => S.resources[id]).filter(r => r && r.st === 'use' && (r.for || []).indexOf(a.skill) >= 0)
      .forEach(r => { if (!out.some(o => o.name.toLowerCase() === String(r.title).toLowerCase())) out.push({ id: r.id, name: r.title, tutor: false }); });
    return out;
  }
  function resName(activityId, resourceId) {
    if (!resourceId) return '';
    const r = resourcesFor(activityId).find(x => x.id === resourceId) || (S.resources[resourceId] && { name: S.resources[resourceId].title });
    return r ? r.name : '';
  }
  const isTutor = (activityId, resourceId) => !!resourcesFor(activityId).find(x => x.id === resourceId && x.tutor);

  /* ---------- the session log ---------- */
  const sessionsOn = d => S.sessions.filter(s => s.date === d).sort((a, b) => (a.startedAt || a.createdAt) - (b.startedAt || b.createdAt));
  const secOn = d => S.sessions.reduce((t, s) => t + (s.date === d ? s.seconds : 0), 0);
  function secByActivity(filter) {
    const out = {};
    S.sessions.forEach(s => { if (!filter || filter(s)) out[s.activityId] = (out[s.activityId] || 0) + s.seconds; });
    return out;
  }
  const totalSec = () => S.sessions.reduce((t, s) => t + s.seconds, 0);

  /* tomatoes and jars, always from the log */
  function tomatoStats(total) {
    if (total == null) total = totalSec();
    const tomatoes = Math.floor(total / POMODORO), jars = Math.floor(tomatoes / JAR_TOMATOES);
    return {
      total: total, tomatoes: tomatoes, jars: jars, inJar: tomatoes % JAR_TOMATOES,
      minsToNext: Math.ceil(25 - (total % POMODORO) / 60),
      minsInto: Math.floor((total % POMODORO) / 60)
    };
  }
  /* Jar dates: the date of the session whose save first crossed the jar's line. Removed when an edit removes the jar. */
  function reconcileJars(date) {
    const jars = tomatoStats().jars;
    Object.keys(S.jarDates).forEach(n => { if (+n > jars) delete S.jarDates[n]; });
    for (let n = 1; n <= jars; n++) if (!S.jarDates[n]) S.jarDates[n] = date || todayKey();
  }
  /* the study inside jar n: walk the log in time order and take the seconds that fall in this jar's 200 minutes */
  function jarContents(n) {
    const lo = (n - 1) * JAR_SEC, hi = n * JAR_SEC;
    const list = S.sessions.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.startedAt || a.createdAt) - (b.startedAt || b.createdAt));
    let run = 0, sessions = 0; const days = new Set(), byAct = {};
    list.forEach(s => {
      const a = run, b = run + s.seconds; run = b;
      const part = Math.min(b, hi) - Math.max(a, lo);
      if (part > 0) { sessions++; days.add(s.date); byAct[s.activityId] = (byAct[s.activityId] || 0) + part; }
    });
    const top = Object.keys(byAct).sort((x, y) => byAct[y] - byAct[x]).slice(0, 2).map(id => act(id).name);
    return { minutes: JAR_SEC / 60, sessions: sessions, days: Array.from(days).sort(), top: top };
  }
  const discovery = n => DISCOVERIES.find(d => d.number === n) || null;

  function addSession(o) {
    const now = Date.now(), before = tomatoStats();
    const s = {
      id: uid('s'), activityId: o.activityId, date: o.date, startedAt: o.startedAt || null, endedAt: o.endedAt || null,
      seconds: Math.max(0, Math.round(o.seconds)), source: o.source || 'manual',
      resourceId: o.resourceId || null, note: o.note || '', createdAt: now, updatedAt: now
    };
    S.sessions.push(s); reconcileJars(s.date); save();
    return { session: s, before: before, after: tomatoStats() };
  }
  function updateSession(id, patch) {
    const s = S.sessions.find(x => x.id === id); if (!s) return null;
    const before = tomatoStats();
    Object.assign(s, patch, { updatedAt: Date.now() });
    s.seconds = Math.max(0, Math.round(s.seconds));
    reconcileJars(s.date); save();
    return { session: s, before: before, after: tomatoStats() };
  }
  function deleteSession(id) {
    S.sessions = S.sessions.filter(x => x.id !== id); reconcileJars(); save();
  }

  /* ---------- practice days and streak ---------- */
  function practiceDays() {
    const set = new Set();
    S.sessions.forEach(s => { if (s.seconds > 0) set.add(s.date); });
    S.journal.forEach(e => set.add(key(new Date(e.createdAt))));
    return set;
  }
  function streaks(today) {
    today = today || todayKey();
    const set = practiceDays();
    let k = set.has(today) ? today : addDays(today, -1), current = 0; // today does not break it until the day ends
    while (set.has(k)) { current++; k = addDays(k, -1); }
    let best = 0, run = 0, prev = null;
    Array.from(set).sort().forEach(d => { run = (prev && addDays(prev, 1) === d) ? run + 1 : 1; if (run > best) best = run; prev = d; });
    return { current: current, best: best };
  }
  function firstDataDate() {
    const ds = Array.from(practiceDays()).sort();
    return ds.length ? ds[0] : null;
  }

  /* ---------- timer record ---------- */
  function timerElapsed(now) {
    const t = S.timer; if (!t) return 0;
    const s = t.accumulatedSeconds + (t.runningSince ? ((now || Date.now()) - t.runningSince) / 1000 : 0);
    return Math.min(CAP, Math.max(0, Math.floor(s)));
  }
  function timerStart(activityId, resourceId, ctx) {
    const now = Date.now();
    S.timer = { activityId: activityId, resourceId: resourceId || null, startedAt: now, accumulatedSeconds: 0, runningSince: now, chimed: false, ctx: ctx || null };
    save();
  }
  function timerPause() {
    const t = S.timer; if (!t || !t.runningSince) return;
    t.accumulatedSeconds = timerElapsed(); t.runningSince = null; save();
  }
  function timerResume() {
    const t = S.timer; if (!t || t.runningSince || t.accumulatedSeconds >= CAP) return;
    t.runningSince = Date.now(); save();
  }
  function timerClear() { S.timer = null; save(); }

  /* ---------- grammar tables ---------- */
  const table = id => TABLES.find(t => t.id === id);
  const tableRec = id => S.grammar[id] || { state: 'not started', stateAt: null, results: [] };
  const lastResult = id => { const r = tableRec(id).results; return r.length ? r[r.length - 1] : null; };
  function setTableState(id, state) {
    const r = S.grammar[id] || (S.grammar[id] = { state: 'not started', stateAt: null, results: [] });
    r.state = state; r.stateAt = todayKey(); save();
  }
  function addTableResult(id, result) {
    const r = S.grammar[id] || (S.grammar[id] = { state: 'not started', stateAt: null, results: [] });
    r.results.push({ date: todayKey(), result: result }); save();
  }
  /* tables the latest Patterns analysis points at (same mapping as the old tracker) */
  function linkedTables() {
    const f = new Set();
    ((S.analysis && S.analysis.patterns) || []).forEach(x => patternTables(x).forEach(id => f.add(id)));
    return f;
  }
  function patternTables(x) {
    const f = [], t = ((x.title || '') + ' ' + (x.rule || '')).toLowerCase(), a = x.area;
    if (a === 'articles') f.push('p6');
    else if (a === 'prepositions') f.push('p16');
    else if (a === 'agreement') { f.push('p7'); if (/gender|plural|noun/.test(t)) f.push('p5'); }
    else if (a === 'spelling') f.push('p4');
    else if (a === 'word order') f.push('p17');
    else if (a === 'verbs') {
      if (/piac|reflex|riflessiv|modal|potere|dovere|volere/.test(t)) f.push('p10');
      else if (/passato prossimo|participle/.test(t)) { f.push('p11'); f.push('p12'); }
      else if (/imperfetto/.test(t)) f.push('p13');
      else if (/futur|condition/.test(t)) f.push('p14');
      else if (/irregular|essere|avere|andare|fare|venire/.test(t)) f.push('p9');
      else { f.push('p8'); f.push('p9'); }
    } else if (a === 'grammar') {
      if (/\barticle/.test(t)) f.push('p6'); if (/preposition/.test(t)) f.push('p16'); if (/possess/.test(t)) f.push('p7'); if (/plural|gender/.test(t)) f.push('p5');
      if (/pronoun/.test(t)) f.push('p15'); if (/question|negat/.test(t)) f.push('p17'); if (/number|\btime\b|\bdate/.test(t)) f.push('p18'); if (/c['’]è|ci sono|quantit|compar/.test(t)) f.push('p19');
    }
    return f;
  }
  /* The one table that may be suggested on Oggi (M7). Returns { table, reason } or null. */
  function suggestedTable(today) {
    today = today || todayKey();
    const linked = linkedTables(), short = k => fmtDate(k, { day: 'numeric', month: 'short' });
    const c = [];
    TABLES.forEach((t, i) => {
      const r = tableRec(t.id), last = lastResult(t.id), since = last ? last.date : r.stateAt;
      let reason = null;
      if (last && last.result === 'shaky' && diffDays(last.date, today) >= 1) reason = 'You marked it shaky on ' + short(last.date) + '.';
      else if (r.state === 'practising' && since && diffDays(since, today) >= 7) reason = 'You are practising it, and it was last on paper on ' + short(since) + '.';
      else if (r.state === 'memorised' && since && diffDays(since, today) >= 21) reason = 'Memorised, and not written out since ' + short(since) + '.';
      if (reason) c.push({ table: t, reason: reason, linked: linked.has(t.id) ? 1 : 0, since: since || '', i: i });
    });
    c.sort((a, b) => (b.linked - a.linked) || (a.since < b.since ? -1 : a.since > b.since ? 1 : 0) || a.i - b.i);
    return c[0] || null;
  }

  /* ---------- writing prompts ---------- */
  const COMP = PROMPTS.filter(p => p.k === 's' || p.k === 'd');
  function promptPool() { // only topics marked "met"
    return COMP.filter(p => S.topics.indexOf(p.t) >= 0);
  }
  function findPrompt(id) {
    if (!id) return null;
    const p = PROMPTS.find(x => x.id === id);
    if (p) { const t = TOPICS.find(x => x[0] === p.t); return { id: p.id, title: p.it, text: p.en, pts: p.pts || [], hint: p.hint || '', topic: t ? t[2] : '', tailored: false }; }
    const s = S.tailored.find(x => x.id === id);
    if (s) return { id: s.id, title: s.title || '', text: s.text, pts: s.pts || [], hint: s.hint || '', topic: '', focus: s.focus || '', tailored: true };
    return null;
  }
  /* a new prompt: tailored about one time in three, otherwise from the bank */
  function pickPrompt(excludeId, rnd) {
    rnd = rnd || Math.random;
    const su = S.tailored.filter(p => p.id !== excludeId);
    if (su.length && rnd() < 1 / 3) return su[Math.floor(rnd() * su.length)].id;
    const pool = promptPool().filter(p => p.id !== excludeId);
    if (pool.length) return pool[Math.floor(rnd() * pool.length)].id;
    if (su.length) return su[Math.floor(rnd() * su.length)].id;
    return null;
  }
  const countWords = t => ((t || '').match(/[A-Za-zÀ-ſ]+(?:[’'][A-Za-zÀ-ſ]+)*/g) || []).length;
  const countSentences = t => ((t || '').match(/[^.!?…\s][^.!?…]*[.!?…]+/g) || []).length;

  /* ---------- suggestions for Oggi (M4) ---------- */
  function suggestions(today) {
    today = today || todayKey();
    const hidden = S.meta.hidden.date === today ? S.meta.hidden.ids : [];
    const logged = new Set(S.sessions.filter(s => s.date === today && s.seconds > 0).map(s => s.activityId));
    const last = {};
    S.sessions.forEach(s => { if (s.seconds > 0 && (!last[s.activityId] || s.date > last[s.activityId])) last[s.activityId] = s.date; });
    const short = k => fmtDate(k, { day: 'numeric', month: 'short' });
    const cards = [];
    const find = id => cards.find(c => c.activity.id === id);
    const add = (a, reason, extra) => {
      if (cards.length >= 3 || hidden.indexOf(a.id) >= 0 || find(a.id)) return;
      const c = Object.assign({ activity: a, reason: reason, action: a.action }, extra || {});
      if (a.id === 'writing') {
        const pid = S.tailored.length ? S.tailored[0].id : (promptPool().length ? promptPool()[hash(today) % promptPool().length].id : null);
        const p = findPrompt(pid);
        if (p) { c.promptId = p.id; c.action = 'Two sentences: ' + (p.title ? p.title + ' · ' : '') + p.text; if (p.tailored) c.reason = 'Tailored for you. ' + reason; }
      }
      if (a.opens === 'sheet') { const r = resourcesFor(a.id).find(x => S.resources[x.id]); if (r) c.action = a.action + ' · ' + r.name; }
      cards.push(c);
    };
    // 1. every-day activities not yet logged today
    ACTS.filter(a => S.settings.pinned.indexOf(a.id) >= 0 && !logged.has(a.id)).forEach(a => add(a, 'Every day, and not logged yet today.'));
    // 2. one grammar table, if one qualifies
    const st = suggestedTable(today);
    if (st) {
      const g = act('grammar'), have = find('grammar');
      if (have) { have.table = st.table; have.action = st.table.t; }
      else add(g, st.reason, { table: st.table, action: st.table.t });
    }
    // 3. the least recently practised, longest gap first
    ACTS.map((a, i) => ({ a: a, i: i, last: last[a.id] || '' })).filter(x => !logged.has(x.a.id))
      .sort((x, y) => (x.last < y.last ? -1 : x.last > y.last ? 1 : 0) || x.i - y.i)
      .forEach(x => add(x.a, x.last ? 'Not logged since ' + short(x.last) + '.' : 'Not logged yet.'));
    return cards;
  }
  function hideSuggestion(activityId, today) {
    today = today || todayKey();
    if (S.meta.hidden.date !== today) S.meta.hidden = { date: today, ids: [] };
    if (S.meta.hidden.ids.indexOf(activityId) < 0) S.meta.hidden.ids.push(activityId);
    save();
  }

  /* ---------- backup ---------- */
  function exportData() {
    const data = clone(S); data.timer = S.timer ? clone(S.timer) : null;
    return { app: 'pomodoro-club', schema: SCHEMA, exportedAt: new Date().toISOString(), data: data };
  }
  /* returns an error message, or '' when the file is safe to restore */
  function checkBackup(o) {
    if (!o || typeof o !== 'object' || o.app !== 'pomodoro-club') return 'This is not a Pomodoro Club backup file.';
    if (o.schema !== SCHEMA) return 'This backup is from a different version (schema ' + o.schema + ') and cannot be restored here.';
    const d = o.data; if (!d || typeof d !== 'object') return 'The backup file has no data in it.';
    const arr = ['sessions', 'journal', 'pieces', 'tailored', 'revealed', 'topics'], obj = ['grammar', 'jarDates', 'resources', 'settings', 'exam'];
    for (const k of arr) if (!Array.isArray(d[k])) return 'The backup file is damaged: "' + k + '" is missing.';
    for (const k of obj) if (!d[k] || typeof d[k] !== 'object' || Array.isArray(d[k])) return 'The backup file is damaged: "' + k + '" is missing.';
    for (const s of d.sessions) if (!s || typeof s.id !== 'string' || typeof s.activityId !== 'string' || !isKey(s.date) || typeof s.seconds !== 'number' || s.seconds < 0) return 'The backup file is damaged: a session is not readable.';
    for (const e of d.journal) if (!e || typeof e.id !== 'string' || typeof e.createdAt !== 'number') return 'The backup file is damaged: a journal entry is not readable.';
    for (const p of d.pieces) if (!p || typeof p.id !== 'string' || typeof p.text !== 'string') return 'The backup file is damaged: a writing piece is not readable.';
    return '';
  }
  function restore(o) { S = normalise(clone(o.data)); save(); return S; }
  function erase() {
    try { localStorage.removeItem(NS); localStorage.removeItem(KEY_NS); } catch (e) { /* ignore */ }
    S = blank();
  }

  root.PC = {
    NS: NS, SCHEMA: SCHEMA, POMODORO: POMODORO, JAR_TOMATOES: JAR_TOMATOES, JAR_SEC: JAR_SEC, CAP: CAP,
    ACTS: ACTS, REVIEW: REVIEW, ALL_ACTS: ALL_ACTS, TOPICS: TOPICS, PROMPTS: PROMPTS, TABLES: TABLES, DISCOVERIES: DISCOVERIES,
    get S() { return S; }, get storageOk() { return storageOk; },
    load: load, save: save, blank: blank, getKey: getKey, setKey: setKey,
    pad: pad, key: key, parse: parse, addDays: addDays, diffDays: diffDays, todayKey: todayKey, isKey: isKey, fmtDate: fmtDate, fmtTime: fmtTime,
    weekStart: weekStart, hash: hash, uid: uid, clone: clone, wholeMin: wholeMin, fmtMin: fmtMin, fmtClock: fmtClock,
    act: act, resourcesFor: resourcesFor, resName: resName, isTutor: isTutor,
    sessionsOn: sessionsOn, secOn: secOn, secByActivity: secByActivity, totalSec: totalSec, tomatoStats: tomatoStats,
    reconcileJars: reconcileJars, jarContents: jarContents, discovery: discovery,
    addSession: addSession, updateSession: updateSession, deleteSession: deleteSession,
    practiceDays: practiceDays, streaks: streaks, firstDataDate: firstDataDate,
    timerElapsed: timerElapsed, timerStart: timerStart, timerPause: timerPause, timerResume: timerResume, timerClear: timerClear,
    table: table, tableRec: tableRec, lastResult: lastResult, setTableState: setTableState, addTableResult: addTableResult,
    linkedTables: linkedTables, patternTables: patternTables, suggestedTable: suggestedTable,
    promptPool: promptPool, findPrompt: findPrompt, pickPrompt: pickPrompt, countWords: countWords, countSentences: countSentences,
    suggestions: suggestions, hideSuggestion: hideSuggestion,
    exportData: exportData, checkBackup: checkBackup, restore: restore, erase: erase
  };
})(typeof window !== 'undefined' ? window : globalThis);
