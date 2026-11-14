/* Pomodoro Club — Grammatica (M7): two separate lists that are never merged.
   "Topics I've met" decides which writing prompts can appear. "Tables to memorise" holds a state only the learner changes.
   No dates and no review labels are shown here; at most one row carries a "Suggested" tag. */
(function () {
  'use strict';
  const PC = window.PC, UI = PC.ui, screens = PC.screens, actions = PC.actions, esc = PC.esc;
  const STATES = [['not started', 'Not started'], ['practising', 'Practising'], ['memorised', 'Memorised']];
  const RESULTS = [['solid', 'Solid'], ['shaky', 'Shaky'], ['not finished', 'Not finished']];
  const label = (list, v) => (list.find(x => x[0] === v) || ['', v])[1];

  screens.grammatica = {
    tab: 'quaderno', title: 'Grammatica',
    render() {
      const S = PC.S, linked = PC.linkedTables(), sug = PC.suggestedTable(), f = UI.local.filter || 'all';
      const count = st => PC.TABLES.filter(t => PC.tableRec(t.id).state === st).length;
      let h = '<a class="back" href="#/quaderno">‹ Quaderno</a><h1>Grammatica</h1>'
        + '<section aria-labelledby="tm-h"><h2 id="tm-h">Topics I’ve met</h2><p class="muted">Tick what your lessons have covered. Writing prompts only use ticked topics.</p><ul class="list card">'
        + PC.TOPICS.map(t => { const on = S.topics.indexOf(t[0]) >= 0; return '<li><button class="topic" role="checkbox" aria-checked="' + on + '" data-act="topic-toggle" data-id="' + t[0] + '"><span class="box" aria-hidden="true">' + (on ? '✓' : '') + '</span><span class="grow"><strong>' + esc(t[2]) + '</strong><span class="muted small">' + esc(t[3]) + '</span></span><span class="tag">' + t[4] + '</span></button></li>'; }).join('')
        + '</ul></section>'
        + '<section aria-labelledby="tb-h"><h2 id="tb-h">Tables to memorise</h2><p class="muted">Pick any table, write it out on paper from memory, then set how well you know it.</p><div class="chips">'
        + [['all', 'All ' + PC.TABLES.length]].concat(STATES.map(s => [s[0], s[1] + ' ' + count(s[0])])).map(c => '<button class="chip" data-act="tb-filter" data-v="' + c[0] + '" aria-pressed="' + (f === c[0]) + '">' + c[1] + '</button>').join('') + '</div>';
      const list = PC.TABLES.filter(t => f === 'all' || PC.tableRec(t.id).state === f);
      h += list.length ? '<ul class="list">' + list.map(t => {
        const r = PC.tableRec(t.id), last = PC.lastResult(t.id);
        return '<li><a class="card link-card tool" href="#/table/' + t.id + '"><span><strong>' + esc(t.t) + (t.l === 'A2' ? ' · A2' : '') + '</strong><span class="muted">' + (last ? 'Last result: ' + label(RESULTS, last.result) : 'Not practised yet') + (linked.has(t.id) ? ' · linked from your writing' : '') + '</span></span>'
          + '<span class="row-start">' + (sug && sug.table.id === t.id ? '<span class="tag tag-strong">Suggested</span>' : '') + '<span class="tag">' + label(STATES, r.state) + '</span></span></a></li>';
      }).join('') + '</ul>' : '<p class="empty">No tables in this state yet. Open any table from All to set its state.</p>';
      return h + '</section>';
    }
  };
  actions['topic-toggle'] = el => { const t = PC.S.topics, i = t.indexOf(el.dataset.id); if (i >= 0) t.splice(i, 1); else t.push(el.dataset.id); PC.save(); PC.render(); };
  actions['tb-filter'] = el => { UI.local.filter = el.dataset.v; PC.render(); };

  /* ---------- practising one table ---------- */
  screens.table = {
    tab: 'quaderno', title: 'Grammar table',
    render(id) {
      const t = PC.table(id); if (!t) return '<a class="back" href="#/grammatica">‹ Grammatica</a><p class="empty">That table is not in the list.</p>';
      const r = PC.tableRec(id), tm = PC.S.timer, mine = tm && tm.activityId === 'grammar' && tm.ctx && tm.ctx.tableId === id, res = UI.local.result || '';
      const last = PC.lastResult(id);
      const ex = ((PC.S.analysis && PC.S.analysis.patterns) || []).filter(x => PC.patternTables(x).indexOf(id) >= 0).reduce((a, x) => a.concat(x.examples), []).slice(0, 2);
      return '<a class="back" href="#/grammatica">‹ Grammatica</a><p class="eyebrow">p. ' + t.pg + ' · Italiano — Tutto in uno · ' + t.l + '</p><h1>' + esc(t.t) + '</h1>'
        + (ex.length ? '<p class="notice" lang="it">Your writing: ' + ex.map(v => esc(v.wrote) + ' → ' + esc(v.better)).join(' · ') + '</p>' : '')
        + '<section class="card"><p class="eyebrow">What to memorise</p><p>' + esc(t.how) + '</p><ol class="steps"><li>Look at the page for a minute.</li><li>Cover it and write the table out on paper from memory.</li><li>Check and correct in a different colour.</li></ol></section>'
        + '<section class="card" aria-label="Grammar timer"><div class="split"><span>Grammar timer · <strong class="clock-inline" ' + (mine ? 'data-clock role="timer"' : '') + '>' + PC.fmtClock(mine ? PC.timerElapsed() : 0) + '</strong>' + (mine && !tm.runningSince ? ' · paused' : '') + '</span>'
        + (mine ? '<button class="btn btn-small" data-act="' + (tm.runningSince ? 'timer-pause' : 'timer-resume') + '">' + (tm.runningSince ? 'Pause' : 'Resume') + '</button>' : '<button class="btn btn-small btn-primary" data-act="tb-start" data-id="' + id + '">Start</button>') + '</div></section>'
        + '<section class="card"><p class="label">How did it go?</p><div class="chips">' + RESULTS.map(x => '<button class="chip" data-act="tb-result" data-v="' + x[0] + '" aria-pressed="' + (res === x[0]) + '">' + x[1] + '</button>').join('') + '</div>'
        + '<p class="muted small">' + (last ? 'Last result: ' + label(RESULTS, last.result) + '. ' : '') + 'The result is saved with today’s date. It may come back as a suggestion on Oggi.</p>'
        + '<p class="label">Your state for this table</p><div class="chips">' + STATES.map(x => '<button class="chip" data-act="tb-state" data-id="' + id + '" data-v="' + x[0] + '" aria-pressed="' + (r.state === x[0]) + '">' + x[1] + '</button>').join('') + '</div>'
        + '<p class="muted small">Only you change this. It never changes on its own.</p></section>'
        + (UI.local.tbError ? '<p class="error" role="alert">' + esc(UI.local.tbError) + '</p>' : '')
        + '<button class="btn btn-primary block" data-act="tb-finish" data-id="' + id + '">Save and finish</button>';
    }
  };
  actions['tb-start'] = el => PC.startActivity('grammar', { ctx: { tableId: el.dataset.id }, sheet: false });
  actions['tb-result'] = el => { UI.local.result = UI.local.result === el.dataset.v ? '' : el.dataset.v; UI.local.tbError = ''; PC.render(); };
  actions['tb-state'] = el => { PC.setTableState(el.dataset.id, el.dataset.v); PC.render(); };
  actions['tb-finish'] = el => {
    const id = el.dataset.id, tm = PC.S.timer, mine = tm && tm.activityId === 'grammar' && tm.ctx && tm.ctx.tableId === id, res = UI.local.result || '';
    if (mine) return PC.openFinish(undefined, { result: res });          // the session and the result are saved together
    if (!res) { UI.local.tbError = 'Pick how it went, or start the timer first.'; PC.render(); return; }
    PC.addTableResult(id, res); UI.local.result = ''; PC.toast('Result saved'); PC.go('#/grammatica');
  };
})();
