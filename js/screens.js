/* Pomodoro Club — main screens: Welcome, Oggi, All activities, Sessions, Progressi, Dispensa, Discovery, Quaderno, Settings. */
(function () {
  'use strict';
  const PC = window.PC, UI = PC.ui, screens = PC.screens, actions = PC.actions, sheets = PC.sheets, esc = PC.esc, $ = PC.$;
  const STORAGE_NOTE = 'Your data lives only in this browser on this device.';
  const long = k => PC.fmtDate(k, { weekday: 'long', day: 'numeric', month: 'long' });
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const hoursMin = sec => { const m = PC.wholeMin(sec); return m < 60 ? PC.fmtMin(sec) : Math.floor(m / 60) + ' h ' + PC.pad(m % 60) + ' min'; };
  const tomatoDots = n => '<span class="tomatoes" aria-hidden="true">' + Array.from({ length: PC.JAR_TOMATOES }, (_, i) => '<i class="' + (i < n ? 'on' : '') + '"></i>').join('') + '</span>';
  PC.tomatoDots = tomatoDots; PC.plural = plural;

  /* ---------- first visit ---------- */
  screens.welcome = {
    render() {
      const L = UI.local;
      return '<div class="welcome"><p class="eyebrow">Pomodoro Club</p><h1>Benvenuto.</h1>'
        + '<p>A place to log your Italian practice across the apps, books and lessons you already use, and to see it add up.</p>'
        + '<label class="field"><span>What should we call you? (optional)</span><input type="text" id="w-name" autocomplete="given-name" data-bind="name" value="' + esc(L.name || '') + '"></label>'
        + '<button class="btn btn-primary block" data-act="welcome-start">Start practising</button>'
        + restoreHtml('Restore a backup')
        + '<div class="card"><h2 class="h3">How it works, in short</h2><p class="muted">Pick any of 8 activities and time it, or type the minutes. Every 25 minutes is a tomato; every 8 tomatoes fill a jar, and each jar opens a short piece about Italian life.</p></div>'
        + '<p class="muted small">' + STORAGE_NOTE + ' Nothing is sent to a server. No account, no setup.</p></div>';
    }
  };
  actions['welcome-start'] = () => { const S = PC.S; S.settings.name = String(UI.local.name || '').trim().slice(0, 40); S.meta.welcomed = true; PC.save(); UI.local = {}; PC.go('#/oggi'); };

  /* restore: pick a file, check it, then a second confirmation before anything is replaced */
  function restoreHtml(label) {
    const L = UI.local, p = L.pendingRestore;
    let h = '<label class="btn block filebtn">' + esc(label) + '<input type="file" accept="application/json,.json" class="visually-hidden" data-bind="restoreFile" data-then="restore-file"></label>';
    if (L.restoreError) h += '<p class="error" role="alert">' + esc(L.restoreError) + '</p>';
    if (p) h += '<div class="confirm" role="alertdialog" aria-label="Confirm restore"><p><strong>Replace everything on this device with this backup?</strong> It was exported on ' + esc(PC.fmtDate(PC.key(new Date(p.exportedAt)), { day: 'numeric', month: 'long', year: 'numeric' })) + ' and holds ' + plural(p.data.sessions.length, 'session') + ', ' + plural(p.data.pieces.length, 'piece') + ' and ' + plural(p.data.journal.length, 'journal entry').replace('entrys', 'entries') + '. What is here now will be gone.</p>'
      + '<div class="row"><button class="btn btn-danger grow" data-act="restore-confirm">Replace my data</button><button class="btn grow" data-act="restore-cancel">Cancel</button></div></div>';
    return h;
  }
  actions['restore-file'] = el => {
    const f = el.files && el.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      let o = null; try { o = JSON.parse(String(rd.result)); } catch (e) { /* not JSON */ }
      const err = o ? PC.checkBackup(o) : 'That file could not be read as a backup.';
      UI.local.restoreError = err; UI.local.pendingRestore = err ? null : o; PC.render();
    };
    rd.onerror = () => { UI.local.restoreError = 'That file could not be read.'; PC.render(); };
    rd.readAsText(f);
  };
  actions['restore-cancel'] = () => { UI.local.pendingRestore = null; PC.render(); };
  actions['restore-confirm'] = () => {
    const o = UI.local.pendingRestore; if (!o) return;
    PC.restore(o); PC.S.meta.welcomed = true; PC.save(); UI.local = {}; UI.sheet = null; PC.toast('Backup restored'); PC.go('#/oggi');
  };

  /* ---------- Oggi ---------- */
  function greeting() { const h = new Date().getHours(); return h >= 5 && h < 13 ? 'Buongiorno' : h >= 13 && h < 18 ? 'Buon pomeriggio' : 'Buonasera'; }
  screens.oggi = {
    tab: 'oggi', title: 'Oggi', wide: true,
    render() {
      const S = PC.S, today = PC.todayKey(), sec = PC.secOn(today), st = PC.tomatoStats(), t = S.timer;
      const by = PC.secByActivity(s => s.date === today);
      const split = PC.ALL_ACTS.filter(a => by[a.id]).map(a => a.short + ' ' + (by[a.id] < 60 ? '<1' : PC.wholeMin(by[a.id])));
      if (t) split.push(PC.act(t.activityId).short + (t.runningSince ? ' running' : ' paused'));
      const sessions = PC.sessionsOn(today), cards = PC.suggestions(today);
      const m = PC.wholeMin(sec);
      const big = sec > 0 && sec < 60 ? '&lt;1 <small>min</small>' : m < 60 ? m + ' <small>min</small>' : Math.floor(m / 60) + ' <small>h</small> ' + (m % 60) + ' <small>min</small>';
      let h = '<div class="cols"><div class="col-a">'
        + '<p class="eyebrow">' + esc(long(today)) + '</p><h1>' + greeting() + (S.settings.name ? ', ' + esc(S.settings.name) : '') + '</h1>'
        + '<section class="card" aria-label="Studied today"><p class="eyebrow">Studied today</p><p class="big" id="today-min">' + big + '</p>'
        + '<p class="muted">' + (split.length ? esc(split.join(' · ')) : 'Nothing logged yet today. Any activity counts, for any length.') + '</p>'
        + '<div class="strip"><div><strong>' + st.minsToNext + ' min to your next tomato</strong>' + tomatoDots(st.inJar) + '</div><a href="#/dispensa">Jar ' + (st.jars + 1) + ' · ' + st.inJar + ' of 8</a></div></section>'
        + '<section aria-labelledby="sug-h"><h2 id="sug-h">Suggested for you</h2>';
      h += cards.length ? cards.map(c => '<article class="card sug"><span class="tag">' + esc(c.activity.short) + (S.settings.pinned.indexOf(c.activity.id) >= 0 ? ' · every day' : '') + '</span><h3>' + esc(c.action) + '</h3><p class="muted">' + esc(c.reason) + '</p>'
        + '<div class="row-start"><button class="btn btn-primary" data-act="sug-start" data-id="' + c.activity.id + '">Start</button><button class="btn btn-link" data-act="sug-hide" data-id="' + c.activity.id + '">Not today</button></div></article>').join('')
        : '<p class="muted">Nothing to suggest right now. Pick anything from All activities.</p>';
      h += '</section></div><div class="col-b">'
        + '<a class="btn block" href="#/activities">All activities</a>'
        + '<section aria-label="Shortcuts" class="grid2"><a class="card link-card" href="#/scritti" data-act="short-write"><strong>Write</strong><span class="muted">Two sentences is enough</span></a>'
        + '<a class="card link-card" href="#/grammatica"><strong>Grammar tables</strong><span class="muted">' + PC.TABLES.filter(x => PC.tableRec(x.id).state === 'practising').length + ' practising</span></a></section>'
        + '<section aria-labelledby="ts-h"><h2 id="ts-h" class="h3"><a href="#/sessions">Today’s sessions (' + sessions.length + ')</a></h2>'
        + (sessions.length ? '<ul class="list">' + sessions.map(s => '<li class="split"><span>' + esc(PC.act(s.activityId).name) + (PC.resName(s.activityId, s.resourceId) ? ' · ' + esc(PC.resName(s.activityId, s.resourceId)) : '') + '</span><strong>' + PC.fmtMin(s.seconds) + '</strong></li>').join('') + '</ul>'
          : '<p class="muted">No sessions yet today. Start a timer above, or log time by hand.</p>')
        + '<button class="btn btn-link" data-act="manual-open">Log time without the timer</button></section></div></div>';
      return h;
    }
  };
  actions['sug-hide'] = el => { PC.hideSuggestion(el.dataset.id); PC.render(); };
  actions['sug-start'] = el => {
    const c = PC.suggestions().find(x => x.activity.id === el.dataset.id); if (!c) return;
    if (c.activity.id === 'writing') { if (c.promptId && PC.hooks.usePrompt) PC.hooks.usePrompt(c.promptId, 'short'); return PC.go('#/scritti'); }
    if (c.activity.id === 'grammar') return PC.go(c.table ? '#/table/' + c.table.id : '#/grammatica');
    PC.startActivity(c.activity.id, { resume: true });
  };
  actions['short-write'] = () => { if (PC.hooks.usePrompt) PC.hooks.usePrompt(null, 'short'); };

  /* ---------- All activities ---------- */
  screens.activities = {
    tab: 'oggi', title: 'All activities',
    render() {
      const S = PC.S, today = PC.todayKey(), by = PC.secByActivity(s => s.date === today), t = S.timer;
      return '<a class="back" href="#/oggi">‹ Oggi</a><h1>All activities</h1><p class="muted">Pick anything. Nothing here has to be done every day.</p><ul class="list card">'
        + PC.ACTS.map(a => {
          const running = t && t.activityId === a.id, special = a.opens !== 'sheet';
          return '<li class="act-row"><button class="act-main" data-act="act-open" data-id="' + a.id + '"><strong>' + esc(a.name) + '</strong>' + (S.settings.pinned.indexOf(a.id) >= 0 ? ' <span class="tag">Every day</span>' : '')
            + '<span class="muted small">' + esc(a.it) + ' · ' + esc(a.hint) + '</span></button>'
            + '<span class="act-min">' + (running ? (t.runningSince ? 'running' : 'paused') : by[a.id] ? PC.fmtMin(by[a.id]) : '—') + '</span>'
            + '<button class="btn" data-act="act-start" data-id="' + a.id + '" aria-label="' + (special ? 'Open ' : 'Start ') + esc(a.name) + '">' + (special ? 'Open' : running ? 'Open' : 'Start') + '</button></li>';
        }).join('') + '</ul><button class="btn block" data-act="manual-open">Log time without the timer</button>';
    }
  };

  /* ---------- Sessions log ---------- */
  screens.sessions = {
    tab: 'oggi', title: 'Sessions',
    render(d) {
      const today = PC.todayKey(); if (!PC.isKey(d) || d > today) d = today;
      const list = PC.sessionsOn(d), sec = PC.secOn(d), t = PC.S.timer;
      return '<a class="back" href="#/oggi">‹ Oggi</a><h1>Sessions</h1>'
        + '<div class="pager"><a class="btn btn-icon" href="#/sessions/' + PC.addDays(d, -1) + '" aria-label="Previous day">‹</a><div class="center"><strong>' + esc(d === today ? 'Today · ' + long(d) : long(d)) + '</strong><br><span class="muted">' + plural(list.length, 'session') + ' · ' + PC.fmtMin(sec) + (t && d === today ? ' · ' + esc(PC.act(t.activityId).short) + ' is still on the clock' : '') + '</span></div>'
        + (d < today ? '<a class="btn btn-icon" href="#/sessions/' + PC.addDays(d, 1) + '" aria-label="Next day">›</a>' : '<span class="btn btn-icon" aria-disabled="true">›</span>') + '</div>'
        + (list.length ? '<ul class="list">' + list.map(s => '<li class="card"><div class="split"><strong>' + esc(PC.act(s.activityId).name) + (PC.resName(s.activityId, s.resourceId) ? ' · ' + esc(PC.resName(s.activityId, s.resourceId)) : '') + '</strong><strong>' + PC.fmtMin(s.seconds) + '</strong></div>'
          + '<p class="muted small">' + (s.startedAt ? PC.fmtTime(s.startedAt) + (s.endedAt ? ' – ' + PC.fmtTime(s.endedAt) : '') + ' · timed' : 'logged by hand') + (s.note ? ' · ' + esc(s.note) : '') + '</p>'
          + '<div class="row-start"><button class="btn btn-small" data-act="session-edit" data-id="' + s.id + '">Edit</button><button class="btn btn-small btn-quiet" data-act="session-delete" data-id="' + s.id + '">Delete</button></div></li>').join('') + '</ul>'
          : '<p class="empty">No sessions on this day. Start a timer from Oggi, or add one by hand below.</p>')
        + '<button class="btn block" data-act="manual-open" data-date="' + d + '">+ Add a session by hand</button>'
        + '<p class="muted small">Totals and tomatoes are worked out again from all your sessions, so an edit never counts anything twice.</p>';
    }
  };
  actions['session-edit'] = el => {
    const s = PC.S.sessions.find(x => x.id === el.dataset.id); if (!s) return;
    PC.openSheet({ type: 'finish', mode: 'edit', orig: PC.clone(s), form: { choice: 'exact', minutes: String(PC.wholeMin(s.seconds)), activityId: s.activityId, date: s.date } });
  };
  actions['session-delete'] = el => { if (!PC.armed(el, 'Tap again to delete')) return; PC.deleteSession(el.dataset.id); PC.toast('Session deleted'); PC.render(); };

  /* ---------- Progressi ---------- */
  const BANDS = [[0, 'none'], [15, '1–15'], [30, '16–30'], [60, '31–60'], [Infinity, '60+ min']];
  const band = sec => { const m = PC.wholeMin(sec); return sec <= 0 ? 0 : m <= 15 ? 1 : m <= 30 ? 2 : m <= 60 ? 3 : 4; };
  screens.progressi = {
    tab: 'progressi', title: 'Progressi', wide: true,
    render() {
      const S = PC.S, today = PC.todayKey(), total = PC.totalSec(), first = PC.firstDataDate(), days = PC.practiceDays(), sk = PC.streaks(today);
      let in30 = 0, sec30 = 0;
      for (let i = 0; i < 30; i++) { const k = PC.addDays(today, -i); if (days.has(k)) in30++; sec30 += PC.secOn(k); }
      const thisWeek = PC.weekStart(today), firstWeek = PC.weekStart(first || today);
      let ws = UI.local.week && PC.isKey(UI.local.week) ? UI.local.week : thisWeek; if (ws > thisWeek) ws = thisWeek; if (ws < firstWeek) ws = firstWeek;
      const wk = Array.from({ length: 7 }, (_, i) => PC.addDays(ws, i)), weekSec = wk.reduce((x, k) => x + PC.secOn(k), 0);
      const rows = PC.ALL_ACTS, D = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
      const cell = (k, sec) => k > today ? '<span class="dot dot-future" aria-hidden="true"></span>' : sec <= 0 ? '<span class="dot dot-empty"><span class="visually-hidden">none</span></span>'
        : '<span class="dot dot-on" style="--s:' + Math.min(1, PC.wholeMin(sec) / 60).toFixed(2) + '" title="' + PC.fmtMin(sec) + '"><span class="visually-hidden">' + PC.fmtMin(sec) + '</span></span>';
      const g = S.settings.goal;
      let h = '<p class="eyebrow">' + (first ? 'Since ' + esc(PC.fmtDate(first, { day: 'numeric', month: 'long' })) : 'Nothing logged yet') + '</p><h1>Progressi</h1><div class="cols"><div class="col-a">'
        + '<section class="grid2" aria-label="Totals"><div class="card"><p class="eyebrow">Studied</p><p class="stat" id="total-time">' + hoursMin(total) + '</p><p class="muted">' + plural(S.sessions.length, 'session') + ' logged</p></div>'
        + '<div class="card"><p class="eyebrow">Practice days</p><p class="stat">' + in30 + ' <small>of last 30</small></p><p class="muted" id="streak">streak ' + sk.current + ' · best ' + sk.best + '</p></div></section>';
      // goal (optional)
      h += '<section class="card" aria-label="Goal"><div class="split"><p class="eyebrow">Goal (optional)</p><button class="btn btn-link" data-act="goal-open">' + (g ? 'Edit' : 'Set a goal') + '</button></div>';
      if (g) {
        const pct = Math.min(100, Math.round(total / 36 / g.hours)), left = PC.diffDays(today, g.date) + 1, avg = Math.round(sec30 / 60 / 30);
        const remain = Math.max(0, g.hours * 60 - total / 60);
        h += '<p><strong>' + g.hours + ' hours by ' + esc(PC.fmtDate(g.date, { day: 'numeric', month: 'long', year: 'numeric' })) + '</strong></p><div class="bar" role="img" aria-label="' + pct + '% done"><i style="--w:' + pct + '%"></i></div>'
          + '<div class="split muted small"><span>' + (total / 3600).toFixed(1) + ' h done · ' + (left > 0 ? plural(left, 'day') + ' left' : 'the date has passed') + '</span><span>' + pct + '%</span></div>'
          + '<p>' + (remain <= 0 ? 'You have reached it.' : left > 0 ? 'Needs about <strong>' + Math.ceil(remain / left) + ' min a day</strong>.' : '') + ' Your last 30 days: <strong>' + avg + ' min a day</strong>.'
          + (left > 0 && remain > 0 ? ' At your 30-day pace, you reach about ' + ((total / 60 + avg * left) / 60).toFixed(0) + ' h by ' + esc(PC.fmtDate(g.date)) + '.' : '') + '</p>';
      } else h += '<p class="muted">No goal set. You can add an hours target and a date, or leave this empty.</p>';
      h += '<p class="muted"><strong>Hours measure effort, not level.</strong> For level, see <a href="#/esame">Esame</a>.</p></section></div><div class="col-b">';
      // week view
      h += '<section aria-label="Week view"><div class="pager"><button class="btn btn-icon" data-act="week-prev" aria-label="Previous week"' + (ws <= firstWeek ? ' disabled' : '') + '>‹</button><div class="center"><strong id="week-label">' + esc(PC.fmtDate(wk[0]) + ' – ' + PC.fmtDate(wk[6])) + (ws === thisWeek ? ' · this week' : '') + '</strong><br><span class="muted">Week total: ' + PC.fmtMin(weekSec) + '</span></div>'
        + '<button class="btn btn-icon" data-act="week-next" aria-label="Next week"' + (ws >= thisWeek ? ' disabled' : '') + '>›</button></div>'
        + '<div class="card"><table class="week"><thead><tr><td></td>' + D.map((d, i) => '<th scope="col"><abbr title="' + esc(PC.fmtDate(wk[i], { weekday: 'long', day: 'numeric', month: 'short' })) + '">' + d + '</abbr></th>').join('') + '</tr></thead><tbody>'
        + '<tr class="week-total"><th scope="row">Day total</th>' + wk.map(k => { const s = PC.secOn(k); return '<td>' + (k > today ? '<span class="dot dot-future" aria-hidden="true"></span>' : '<span class="sq band-' + band(s) + '" title="' + PC.fmtMin(s) + '"><span class="visually-hidden">' + PC.fmtMin(s) + '</span></span>') + '</td>'; }).join('') + '</tr>'
        + rows.map(a => '<tr><th scope="row">' + esc(a.short) + '</th>' + wk.map(k => '<td>' + cell(k, PC.S.sessions.reduce((x, s) => x + (s.date === k && s.activityId === a.id ? s.seconds : 0), 0)) + '</td>').join('') + '</tr>').join('')
        + '</tbody></table><p class="legend">Day total: ' + BANDS.map((b, i) => '<span><i class="sq sq-small band-' + i + '"></i>' + b[1] + '</span>').join('') + '</p><p class="muted small">Activity rows: dot size shows minutes. An empty ring is none.</p></div></section>';
      // time by activity
      const mode = UI.local.bars === 'week' ? 'week' : 'all';
      const by = PC.secByActivity(mode === 'week' ? (s => s.date >= wk[0] && s.date <= wk[6]) : null), max = Math.max.apply(null, rows.map(a => by[a.id] || 0).concat([1]));
      h += '<section aria-labelledby="tba-h"><h2 id="tba-h">Time by activity</h2><div class="chips"><button class="chip" data-act="bars-mode" data-v="all" aria-pressed="' + (mode === 'all') + '">All time</button><button class="chip" data-act="bars-mode" data-v="week" aria-pressed="' + (mode === 'week') + '">Week shown above</button></div>'
        + '<div class="card"><ul class="bars">' + rows.slice().sort((a, b) => (by[b.id] || 0) - (by[a.id] || 0)).map(a => '<li><span>' + esc(a.short) + '</span><span class="bar"><i style="--w:' + ((by[a.id] || 0) / max * 100).toFixed(1) + '%"></i></span><span class="num">' + PC.fmtMin(by[a.id] || 0) + '</span></li>').join('') + '</ul></div></section></div></div>';
      return h;
    }
  };
  actions['week-prev'] = () => { const cur = UI.local.week || PC.weekStart(PC.todayKey()); UI.local.week = PC.addDays(cur, -7); PC.render(); };
  actions['week-next'] = () => { const cur = UI.local.week || PC.weekStart(PC.todayKey()); UI.local.week = PC.addDays(cur, 7); PC.render(); };
  actions['bars-mode'] = el => { UI.local.bars = el.dataset.v; PC.render(); };
  actions['goal-open'] = () => { const g = PC.S.settings.goal; PC.openSheet({ type: 'goal', form: { hours: g ? String(g.hours) : '', date: g ? g.date : '' } }); };
  sheets.goal = sh => '<form data-act="goal-save" novalidate><div class="sheet-head"><div><p class="eyebrow">Optional</p><h2 id="sheet-title">Goal</h2></div><button type="button" class="btn" data-act="sheet-close">Close</button></div>'
    + '<div class="grid2"><label class="field"><span>Hours target</span><input type="text" inputmode="numeric" data-bind="hours" value="' + esc(sh.form.hours) + '" data-autofocus></label>'
    + '<label class="field"><span>By this date</span><input type="date" data-bind="date" value="' + esc(sh.form.date) + '"></label></div>'
    + (sh.error ? '<p class="error" role="alert">' + esc(sh.error) + '</p>' : '')
    + '<p class="muted small">Hours measure effort, not level.</p><div class="stack"><button class="btn btn-primary" type="submit">Save goal</button>' + (PC.S.settings.goal ? '<button type="button" class="btn btn-quiet" data-act="goal-remove">Remove goal</button>' : '') + '</div></form>';
  actions['goal-save'] = () => {
    const sh = UI.sheet, hrs = parseFloat(sh.form.hours);
    if (!(hrs > 0) || !PC.isKey(sh.form.date)) { sh.error = 'Enter a number of hours and pick a date.'; PC.render(); return; }
    PC.S.settings.goal = { hours: Math.round(hrs * 10) / 10, date: sh.form.date }; PC.save(); PC.closeSheet();
  };
  actions['goal-remove'] = () => { PC.S.settings.goal = null; PC.save(); PC.closeSheet(); };

  /* ---------- La Dispensa ---------- */
  screens.dispensa = {
    tab: 'dispensa', title: 'La Dispensa',
    render() {
      const S = PC.S, st = PC.tomatoStats();
      const left = (PC.JAR_TOMATOES - st.inJar - 1) * 25 + st.minsToNext;
      let h = '<p class="eyebrow">Rewards and discoveries</p><h1>La Dispensa</h1><p class="muted">Every 25 minutes of study is a tomato. Every 8 tomatoes fill a jar, and each jar opens a short piece about Italian life.</p>'
        + '<section class="grid3" aria-label="Totals"><div class="card"><p class="eyebrow">Tomatoes</p><p class="stat" id="tomatoes">' + st.tomatoes + '</p></div><div class="card"><p class="eyebrow">Jars</p><p class="stat" id="jars">' + st.jars + '</p></div><div class="card"><p class="eyebrow">Next tomato</p><p class="stat">' + st.minsToNext + ' <small>min</small></p></div></section>'
        + '<section class="card" aria-label="Current jar"><div class="split"><strong>Jar ' + (st.jars + 1) + '</strong><span>' + st.inJar + ' of 8 tomatoes</span></div>' + tomatoDots(st.inJar) + '<p class="muted">About ' + left + ' more minutes to fill it. Nothing is lost on days you skip.</p></section>'
        + '<section aria-labelledby="shelf-h"><h2 id="shelf-h">The shelf</h2>';
      if (!st.jars) h += '<p class="empty">No jars yet. Log ' + left + ' more minutes of any activity to fill your first one.</p>';
      else {
        h += '<ul class="shelf">';
        for (let n = st.jars; n >= 1; n--) { const d = PC.discovery(n); h += '<li><button class="jar-btn" data-act="jar-open" data-id="' + n + '"><span class="jar" aria-hidden="true"><i></i></span><span class="small">No. ' + n + ' · ' + esc(PC.fmtDate(S.jarDates[n] || PC.todayKey())) + '</span><strong>' + esc(d ? d.title : 'Discovery on its way') + '</strong>' + (S.revealed.indexOf(n) < 0 ? '<span class="tag">New</span>' : '') + '</button></li>'; }
        h += '</ul><p class="muted small">Tap a jar to see its label and reread its discovery.</p>';
      }
      return h + '</section>';
    }
  };
  actions['jar-open'] = el => PC.openSheet({ type: 'jar', n: +el.dataset.id, form: {} });
  sheets.jar = sh => {
    const n = sh.n, c = PC.jarContents(n), d = PC.discovery(n), date = PC.S.jarDates[n];
    return '<div class="sheet-head"><div><p class="eyebrow">Jar label</p><h2 id="sheet-title">Jar no. ' + n + '</h2><p class="muted">Filled ' + esc(date ? PC.fmtDate(date, { day: 'numeric', month: 'long', year: 'numeric' }) : '') + '</p></div><button class="btn" data-act="sheet-close">Close</button></div>'
      + '<dl class="facts"><div><dt>Study inside this jar</dt><dd>' + c.minutes + ' min</dd></div><div><dt>Sessions</dt><dd>' + c.sessions + '</dd></div><div><dt>Days</dt><dd>' + esc(c.days.map(k => PC.fmtDate(k)).join(', ')) + '</dd></div><div><dt>Mostly</dt><dd>' + esc(c.top.join(', ')) + '</dd></div></dl>'
      + '<p class="eyebrow">La scoperta</p><p><strong>' + esc(d ? d.title : 'Discovery on its way') + '</strong></p><a class="btn btn-primary block" href="#/discovery/' + n + '" data-act="sheet-nav" data-autofocus>Read discovery</a>';
  };
  actions['sheet-nav'] = () => { UI.sheet = null; };

  screens.discovery = {
    tab: 'dispensa', title: 'Discovery',
    render(n) {
      n = parseInt(n, 10); const S = PC.S, jars = PC.tomatoStats().jars;
      const open = Array.from(new Set(Array.from({ length: jars }, (_, i) => i + 1).concat(S.revealed))).sort((a, b) => a - b);
      if (open.indexOf(n) < 0) return '<a class="back" href="#/dispensa">‹ La Dispensa</a><p class="empty">This discovery is not open yet. It opens when its jar is full.</p>';
      PC.markRevealed(n);
      const i = open.indexOf(n), prev = open[i - 1], next = open[i + 1];
      return '<a class="back" href="#/dispensa">‹ La Dispensa</a><article class="disc">' + PC.discoveryHtml(n) + '</article>'
        + '<nav class="pager" aria-label="Discoveries">' + (prev ? '<a class="btn" href="#/discovery/' + prev + '">‹ No. ' + prev + '</a>' : '<span></span>') + '<span class="muted small">Readable any time</span>' + (next ? '<a class="btn" href="#/discovery/' + next + '">No. ' + next + ' ›</a>' : '<span></span>') + '</nav>';
    }
  };

  /* ---------- Quaderno hub ---------- */
  screens.quaderno = {
    tab: 'quaderno', title: 'Quaderno',
    render() {
      const S = PC.S, res = Object.keys(S.resources).map(k => S.resources[k]);
      const practising = PC.TABLES.filter(t => PC.tableRec(t.id).state === 'practising').length, mem = PC.TABLES.filter(t => PC.tableRec(t.id).state === 'memorised').length;
      const reviewed = S.journal.filter(e => e.reviewedAt).length;
      const tools = [
        ['scritti', 'Scritti · Writing', S.pieces.length ? plural(S.pieces.length, 'piece') + ' · ' + plural(S.tailored.length, 'tailored prompt') + (S.analysis ? ' · patterns from ' + PC.fmtDate(PC.key(new Date(S.analysis.at))) : '') : 'No pieces yet. Two sentences is enough to start.'],
        ['grammatica', 'Grammatica · Grammar', plural(S.topics.length, 'topic') + ' met · ' + practising + ' of ' + PC.TABLES.length + ' tables practising · ' + mem + ' memorised'],
        ['journal', 'Error Journal · Mistakes', S.journal.length ? plural(S.journal.length, 'entry').replace('entrys', 'entries') + ' · ' + reviewed + ' reviewed' : 'No entries yet. Log a mistake from any screen.'],
        ['esame', 'Esame · A1 tests', PC.examStatus ? 'Prova A: ' + PC.examStatus('A') + ' · Prova B: ' + PC.examStatus('B') : ''],
        ['risorse', 'Risorse · Resources', res.length ? res.filter(r => r.st === 'use').length + ' in use · ' + res.filter(r => r.st === 'eval').length + ' to evaluate · ' + res.filter(r => r.st === 'later').length + ' for later' : 'Nothing saved yet. Paste a link or a title to park it.']
      ];
      return '<p class="eyebrow">Learning and reflection</p><h1>Quaderno</h1><ul class="list">' + tools.map(t => '<li><a class="card link-card tool" href="#/' + t[0] + '"><span><strong>' + esc(t[1]) + '</strong><span class="muted">' + esc(t[2]) + '</span></span><span aria-hidden="true">›</span></a></li>').join('') + '</ul>';
    }
  };

  /* ---------- Settings ---------- */
  screens.settings = {
    title: 'Settings',
    render() {
      const S = PC.S, L = UI.local, g = S.settings.goal, key = PC.getKey();
      return '<a class="back" href="#/oggi">‹ Oggi</a><h1>Settings</h1>'
        + '<section class="card"><p class="eyebrow">You</p><label class="field"><span>Name</span><input type="text" id="set-name" autocomplete="given-name" value="' + esc(S.settings.name) + '" data-bind="name" data-then="set-name"></label>'
        + '<div class="split"><span>Goal<br><span class="muted">' + (g ? g.hours + ' h by ' + esc(PC.fmtDate(g.date, { day: 'numeric', month: 'short', year: 'numeric' })) : 'Not set') + '</span></span><button class="btn" data-act="goal-open">' + (g ? 'Edit' : 'Set') + '</button></div>'
        + '<div class="split"><span>Topics I’ve met<br><span class="muted">' + plural(S.topics.length, 'topic') + ' ticked</span></span><a class="btn" href="#/grammatica">In Grammatica</a></div></section>'
        + '<section class="card"><p class="eyebrow">Every-day activities</p><p class="muted small">Shown first on Oggi until logged that day. Nothing is required.</p>'
        + PC.ACTS.map(a => '<label class="check"><input type="checkbox" data-act="pin-toggle" data-id="' + a.id + '"' + (S.settings.pinned.indexOf(a.id) >= 0 ? ' checked' : '') + '><span>' + esc(a.name) + '</span></label>').join('') + '</section>'
        + '<section class="card"><p class="eyebrow">Timer</p><label class="check"><input type="checkbox" data-act="sound-toggle"' + (S.settings.sound ? ' checked' : '') + '><span>Sound<br><span class="muted small">A soft chime at 25:00, one pomodoro</span></span></label></section>'
        + '<section class="card" id="ai"><p class="eyebrow">AI features</p>'
        + (key ? '<p><strong>Set up.</strong> Check my Italian, Patterns and Ask Claude where it fits are on. Key ending …' + esc(key.slice(-4)) + '.</p><button class="btn" data-act="key-remove">Remove key</button>'
          : '<p><strong>Not set up.</strong> Check my Italian, Patterns and Ask Claude where it fits need an Anthropic API key of your own. Everything else works without it.</p>'
            + '<form data-act="key-save"><label class="field"><span>API key</span><input type="password" id="set-key" autocomplete="off" spellcheck="false" data-bind="key" value="' + esc(L.key || '') + '"></label><button class="btn" type="submit">Save key</button></form>')
        + '<p class="muted small">Stored only in this browser and sent only to Anthropic. Usage is billed to your key. It is never included in a backup.</p></section>'
        + '<section class="card"><p class="eyebrow">Your data</p><p>' + STORAGE_NOTE + ' Clearing site data erases it.</p>'
        + '<p class="muted small">Last backup: ' + (S.meta.lastBackup ? esc(PC.fmtDate(S.meta.lastBackup, { day: 'numeric', month: 'long', year: 'numeric' })) : 'never') + ' · ' + plural(S.sessions.length, 'session') + ', ' + plural(S.pieces.length, 'piece') + ', ' + plural(S.journal.length, 'journal entry').replace('entrys', 'entries') + '</p>'
        + (PC.storageOk ? '' : '<p class="error" role="alert">This browser is not letting the app save. Private windows and blocked site data can cause this.</p>')
        + '<div class="stack"><button class="btn" data-act="export">Export backup</button>' + restoreHtml('Restore…')
        + (L.erase ? '<div class="confirm" role="alertdialog" aria-label="Confirm erase"><p><strong>Erase every session, piece, journal entry, test result and setting on this device?</strong> This cannot be undone. Export a backup first if you might want it back.</p><div class="row"><button class="btn btn-danger grow" data-act="erase-confirm">Yes, erase everything</button><button class="btn grow" data-act="erase-cancel">Cancel</button></div></div>'
          : '<button class="btn btn-quiet" data-act="erase-ask">Erase everything on this device</button>') + '</div></section>';
    }
  };
  actions['set-name'] = () => { PC.S.settings.name = String(UI.local.name || '').trim().slice(0, 40); PC.save(); };
  actions['pin-toggle'] = el => { const p = PC.S.settings.pinned, i = p.indexOf(el.dataset.id); if (i >= 0) p.splice(i, 1); else p.push(el.dataset.id); PC.save(); PC.render(); };
  actions['sound-toggle'] = () => { PC.S.settings.sound = !PC.S.settings.sound; PC.save(); PC.render(); };
  actions['key-save'] = () => { const k = String(UI.local.key || '').trim(); if (!k) return; PC.setKey(k); UI.local.key = ''; PC.toast('Key saved in this browser'); PC.render(); };
  actions['key-remove'] = el => { if (!PC.armed(el, 'Tap again to remove the key')) return; PC.setKey(''); PC.render(); };
  actions['export'] = () => {
    PC.S.meta.lastBackup = PC.todayKey(); PC.save();
    const blob = new Blob([JSON.stringify(PC.exportData(), null, 1)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'pomodoro-club-backup-' + PC.todayKey() + '.json'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000); PC.toast('Backup exported'); PC.render();
  };
  actions['erase-ask'] = () => { UI.local.erase = true; PC.render(); };
  actions['erase-cancel'] = () => { UI.local.erase = false; PC.render(); };
  actions['erase-confirm'] = () => { PC.erase(); UI.local = {}; UI.sheet = null; UI.reveal = null; location.hash = ''; PC.render(); };
})();
