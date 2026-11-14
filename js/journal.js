/* Pomodoro Club — Error Journal (M8). Entries are added from the global Log-a-mistake sheet (ui.js).
   Review mistakes is a timed session saved under "Mistakes review", which is not one of the 8 activities. */
(function () {
  'use strict';
  const PC = window.PC, UI = PC.ui, screens = PC.screens, actions = PC.actions, esc = PC.esc;
  const topicName = id => { const t = PC.TOPICS.find(x => x[0] === id); return t ? t[2] : ''; };

  screens.journal = {
    tab: 'quaderno', title: 'Error Journal',
    render() {
      const S = PC.S, all = S.journal.slice().sort((a, b) => b.createdAt - a.createdAt), f = UI.local.topic || '';
      const tm = S.timer, mine = tm && tm.activityId === 'review';
      const used = PC.TOPICS.filter(t => all.some(e => e.topicId === t[0]));
      const list = all.filter(e => !f || e.topicId === f);
      let h = '<a class="back" href="#/quaderno">‹ Quaderno</a><h1>Error Journal</h1><p class="muted">' + (all.length ? PC.plural(all.length, 'entry').replace('entrys', 'entries') + ' · ' + all.filter(e => e.reviewedAt).length + ' reviewed' : 'Nothing here yet.') + '</p>'
        + '<section class="card" aria-label="Review mistakes"><div class="split"><span><strong>Review mistakes</strong><br><span class="muted small">A timed session. Counts as practice; never required.</span></span>'
        + (mine ? '<span class="row-start"><strong class="clock-inline" data-clock role="timer">' + PC.fmtClock(PC.timerElapsed()) + '</strong><button class="btn btn-small" data-act="' + (tm.runningSince ? 'timer-pause' : 'timer-resume') + '">' + (tm.runningSince ? 'Pause' : 'Resume') + '</button><button class="btn btn-small btn-primary" data-act="timer-finish">Finish</button></span>'
          : '<button class="btn btn-primary" data-act="review-start"' + (all.length ? '' : ' disabled') + '>Start</button>') + '</div></section>'
        + '<button class="btn block" data-act="mistake-open">+ Log a mistake</button>';
      if (!all.length) return h + '<p class="empty">No entries yet. Log a mistake from any screen, or add one from your writing feedback.</p>';
      h += '<div class="split"><h2>Entries</h2><label class="field field-inline"><span class="visually-hidden">Filter by topic</span><select data-bind="topic" data-live><option value="">All topics</option>' + used.map(t => '<option value="' + t[0] + '"' + (f === t[0] ? ' selected' : '') + '>' + esc(t[2]) + '</option>').join('') + '</select></label></div>';
      h += list.length ? '<ul class="list">' + list.map(e => '<li class="card' + (e.reviewedAt ? ' is-reviewed' : '') + '"><p lang="it"><s>' + esc(e.wrote) + '</s> → <strong>' + esc(e.correct) + '</strong></p>' + (e.note ? '<p class="muted">' + esc(e.note) + '</p>' : '')
        + '<p class="muted small">' + (e.topicId ? '<span class="tag">' + esc(topicName(e.topicId)) + '</span> ' : '') + (e.pieceId ? 'Writing · ' : '') + esc(PC.fmtDate(PC.key(new Date(e.createdAt)))) + (e.reviewedAt ? ' · reviewed' : '') + '</p>'
        + '<div class="row-start"><button class="btn btn-small" data-act="j-review" data-id="' + e.id + '" aria-pressed="' + !!e.reviewedAt + '">' + (e.reviewedAt ? 'Reviewed ✓' : 'Mark reviewed') + '</button><button class="btn btn-small" data-act="j-edit" data-id="' + e.id + '">Edit</button><button class="btn btn-small btn-quiet" data-act="j-delete" data-id="' + e.id + '">Delete</button></div></li>').join('') + '</ul>'
        : '<p class="empty">No entries for this topic. Choose All topics to see everything.</p>';
      return h;
    }
  };
  actions['review-start'] = () => PC.startActivity('review', { sheet: false });
  actions['j-review'] = el => { const e = PC.S.journal.find(x => x.id === el.dataset.id); if (!e) return; e.reviewedAt = e.reviewedAt ? null : Date.now(); PC.save(); PC.render(); };
  actions['j-edit'] = el => { const e = PC.S.journal.find(x => x.id === el.dataset.id); if (!e) return; PC.openMistake({ editId: e.id, wrote: e.wrote, correct: e.correct, note: e.note || '', topicId: e.topicId || '' }); };
  actions['j-delete'] = el => { if (!PC.armed(el, 'Tap again to delete')) return; PC.S.journal = PC.S.journal.filter(x => x.id !== el.dataset.id); PC.save(); PC.render(); };
})();
