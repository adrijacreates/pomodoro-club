/* Pomodoro Club — Esame (M12.2): the A1 exam module from Quaderno d'Italiano.
   Question bank, grading, save and resume, review, self-marking, results by area and results history are unchanged.
   Only the storage calls (now the one app store) and the button labels (now English) differ. */
(function () {
  'use strict';
  const PC = window.PC, screens = PC.screens, $ = PC.$;
  const SECTIONS = window.PC_EXAM.SECTIONS, CATS = window.PC_EXAM.CATS, BANK = window.PC_EXAM.BANK;

  function norm(s) {
    if (s == null) return '';
    return String(s).replace(/[‘’ʼ`´]/g, "'").replace(/[“”«»"]/g, '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?;:,]+$/, '').trim();
  }
  function deacc(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function nospace(s) { return s.replace(/\s+/g, ''); }
  // returns "correct" | "accent" | "wrong"
  function checkOne(given, accepts) {
    const g = norm(given);
    if (!g) return 'wrong';
    for (const a of accepts) { const n = norm(a); if (g === n) return 'correct'; if (nospace(g) === nospace(n)) return 'correct'; }
    for (const a of accepts) { const n = norm(a); if (deacc(g) === deacc(n)) return 'accent'; if (nospace(deacc(g)) === nospace(deacc(n))) return 'accent'; }
    return 'wrong';
  }
  const PERSONS = ['io', 'tu', 'lui / lei', 'noi', 'voi', 'loro'];

  const N = BANK.A.length;
  const blank = () => ({ answers: new Array(N).fill(null), cur: 0, started: null, finished: null, submitted: false, selfMarks: {}, u: 0 });
  const valid = (d, f) => !!d && Array.isArray(d.answers) && d.answers.length === BANK[f].length;
  const store = () => PC.S.exam;
  let form = 'A', Q = BANK[form], answers = new Array(N).fill(null), selfMarks = {}, cur = 0, started = null, finished = null, submitted = false;
  let screen = 'landing', inited = false, lastInput = null;

  function gradeQuestion(i) {
    const q = Q[i], v = answers[i], pts = q.pts || 1;
    if (q.t === 'situ') {
      const m = selfMarks[i];
      return { status: m === undefined ? 'unmarked' : (m === 1 ? 'correct' : (m === 0.5 ? 'partial' : 'wrong')), earned: m === undefined ? 0 : m * pts, pts: pts, self: true };
    }
    if (q.t === 'para') {
      const a = Array.isArray(v) ? v : new Array(6).fill('');
      let earned = 0, accents = 0; const bad = [];
      for (let k = 0; k < 6; k++) { const res = checkOne(a[k], q.a[k]); if (res === 'correct') earned++; else if (res === 'accent') { earned++; accents++; } else bad.push(k); }
      return { status: bad.length === 0 ? (accents ? 'accent' : 'correct') : (earned > 0 ? 'partial' : 'wrong'), earned: earned, pts: pts, bad: bad, accents: accents };
    }
    const res = checkOne(v, q.a);
    return { status: res === 'accent' ? 'accent' : (res === 'correct' ? 'correct' : 'wrong'), earned: (res === 'wrong' ? 0 : pts), pts: pts };
  }
  function isAnswered(i) {
    const q = Q[i], v = answers[i];
    if (q.t === 'para') return Array.isArray(v) && v.some(x => (x || '').trim() !== '');
    return (v || '').toString().trim() !== '';
  }

  function save() { store()[form] = { answers: answers, cur: cur, started: started, finished: finished, submitted: submitted, selfMarks: selfMarks, u: Date.now() }; PC.save(); }
  function load(f) { return valid(store()[f], f) ? store()[f] : null; }
  function clearSave() { const d = blank(); d.u = Date.now(); store()[form] = d; PC.save(); }
  function answeredCount(f, d) {
    if (!d) return 0;
    return d.answers.filter((v, i) => BANK[f][i].t === 'para' ? (Array.isArray(v) && v.some(x => (x || '').trim())) : (v || '').toString().trim()).length;
  }
  function useForm(f) {
    form = f; Q = BANK[f];
    const d = load(f) || blank();
    answers = d.answers; cur = d.cur || 0; started = d.started || null; finished = d.finished || null; submitted = !!d.submitted; selfMarks = d.selfMarks || {};
  }

  /* one-line status of a paper, for the Quaderno hub and the entry screen */
  function status(f) {
    const d = load(f), n = answeredCount(f, d);
    if (!d || (!n && !d.submitted)) return 'not started';
    if (!d.submitted) return 'in progress, ' + n + ' of ' + BANK[f].length + ' answered';
    const e = (store().log.list || []).find(x => x.id === f + ':' + d.started);
    return e ? e.pct + '%' + (e.open ? ' · ' + e.open + ' to mark' : '') : 'finished';
  }
  PC.examStatus = status;

  const el = id => document.getElementById('ex-' + id);
  const SCREENS = ['landing', 'test', 'review', 'results'];
  function show(which, keep) { screen = which; SCREENS.forEach(x => { el(x).hidden = x !== which; }); if (!keep) window.scrollTo(0, 0); }
  function sectionOf(i) { return SECTIONS.find(x => x.id === Q[i].s); }
  const esc = x => String(x == null ? '' : x).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function renderQuestion() {
    const q = Q[cur], sec = sectionOf(cur);
    el('sectName').textContent = sec.name;
    el('counter').textContent = (cur + 1) + ' / ' + Q.length;
    el('barFill').style.setProperty('--w', ((cur + 1) / Q.length * 100).toFixed(1) + '%');
    el('qnum').textContent = 'Prova ' + form + ' · question ' + String(cur + 1).padStart(2, '0');
    el('qtext').innerHTML = q.q;
    el('qsub').innerHTML = q.sub || ''; el('qsub').hidden = !q.sub;
    const box = el('qinput'); box.innerHTML = ''; lastInput = null;
    const focusSoon = n => setTimeout(() => { if (screen === 'test' && n && document.body.contains(n) && !PC.ui.sheet) n.focus({ preventScroll: true }); }, 40);
    if (q.t === 'para') {
      const grid = document.createElement('div'); grid.className = 'paragrid';
      const vals = Array.isArray(answers[cur]) ? answers[cur] : new Array(6).fill('');
      PERSONS.forEach((pn, k) => {
        const cell = document.createElement('div'); cell.className = 'field';
        cell.innerHTML = '<label for="ex-p' + k + '">' + pn + '</label>';
        const inp = document.createElement('input');
        inp.type = 'text'; inp.id = 'ex-p' + k; inp.className = 'exin'; inp.autocomplete = 'off'; inp.spellcheck = false; inp.autocapitalize = 'none'; inp.lang = 'it';
        inp.value = vals[k] || '';
        inp.addEventListener('input', () => { const a = Array.isArray(answers[cur]) ? answers[cur].slice() : new Array(6).fill(''); a[k] = inp.value; answers[cur] = a; save(); updateHint(); });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter' && k === 5) goNext(); });
        cell.appendChild(inp); grid.appendChild(cell);
      });
      box.appendChild(grid); focusSoon(grid.querySelector('input'));
    } else if (q.t === 'situ') {
      const ta = document.createElement('textarea');
      ta.id = 'ex-situInput'; ta.className = 'exin'; ta.spellcheck = false; ta.lang = 'it'; ta.rows = 4; ta.setAttribute('aria-label', 'Your answer in Italian');
      ta.placeholder = 'Scrivi cosa diresti…'; ta.value = answers[cur] || '';
      ta.addEventListener('input', () => { answers[cur] = ta.value; save(); updateHint(); });
      box.appendChild(ta); focusSoon(ta);
    } else {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.id = 'ex-mainInput'; inp.className = 'exin'; inp.autocomplete = 'off'; inp.spellcheck = false; inp.autocapitalize = 'none'; inp.lang = 'it'; inp.setAttribute('aria-label', 'Your answer in Italian');
      inp.placeholder = 'La tua risposta…'; inp.value = answers[cur] || '';
      inp.addEventListener('input', () => { answers[cur] = inp.value; save(); updateHint(); });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); goNext(); } });
      box.appendChild(inp); focusSoon(inp);
    }
    el('prev').disabled = cur === 0;
    el('next').textContent = cur === Q.length - 1 ? 'Review →' : 'Next →';
    updateHint();
  }
  function updateHint() {
    const blanks = Q.map((_, i) => i).filter(i => !isAnswered(i)).length;
    el('navhint').textContent = blanks === 0 ? 'All answered' : blanks + ' left blank';
  }
  function goNext() { if (cur === Q.length - 1) { openReview(); return; } cur++; save(); renderQuestion(); }
  function goPrev() { if (cur > 0) { cur--; save(); renderQuestion(); } }

  function openReview() {
    const grid = el('navGrid'); grid.innerHTML = '';
    Q.forEach((q, i) => {
      const b = document.createElement('button');
      b.className = 'excell' + (isAnswered(i) ? ' done' : '');
      b.textContent = i + 1; b.title = sectionOf(i).name; b.setAttribute('aria-label', 'Question ' + (i + 1) + (isAnswered(i) ? ', answered' : ', left blank'));
      b.addEventListener('click', () => { cur = i; save(); show('test'); renderQuestion(); });
      grid.appendChild(b);
    });
    const blanks = Q.map((_, i) => i).filter(i => !isAnswered(i));
    el('warnWrap').innerHTML = blanks.length
      ? '<div class="notice"><b>' + blanks.length + ' question' + (blanks.length > 1 ? 's' : '') + ' left blank.</b> A blank scores zero, which is honest data. If you know it, now is the time. Blank: ' + blanks.map(i => i + 1).join(', ') + '.</div>'
      : '<div class="notice"><b>All ' + Q.length + ' questions answered.</b> Hand it in when you are ready.</div>';
    show('review');
  }

  function statusOf(pct) { return pct >= 90 ? 'm' : (pct >= 75 ? 's' : 'r'); }
  function statusWord(k) { return k === 'm' ? 'Mastered' : (k === 's' ? 'Shaky' : 'Needs review'); }

  function renderResults(keep) {
    const graded = Q.map((q, i) => ({ q: q, i: i, g: gradeQuestion(i) }));
    const catAgg = {};
    graded.forEach(({ q, g }) => { const c = catAgg[q.c] || (catAgg[q.c] = { earned: 0, pts: 0, n: 0 }); c.earned += g.earned; c.pts += g.pts; c.n++; });
    const metaAgg = { grammar: { e: 0, p: 0 }, conjugation: { e: 0, p: 0 }, phrase: { e: 0, p: 0 }, practical: { e: 0, p: 0 } };
    Object.keys(catAgg).forEach(k => { const m = CATS[k].meta; metaAgg[m].e += catAgg[k].earned; metaAgg[m].p += catAgg[k].pts; });
    const totalPts = graded.reduce((t, x) => t + x.g.pts, 0);
    const earned = graded.reduce((t, x) => t + x.g.earned, 0);
    const unmarked = graded.filter(x => x.g.status === 'unmarked').length;
    const autoPts = graded.filter(x => !x.g.self).reduce((t, x) => t + x.g.pts, 0);
    const autoEarn = graded.filter(x => !x.g.self).reduce((t, x) => t + x.g.earned, 0);
    const pct = totalPts ? Math.round(earned / totalPts * 1000) / 10 : 0;
    const wrongs = graded.filter(x => !x.g.self && (x.g.status === 'wrong' || x.g.status === 'partial'));
    const slips = graded.filter(x => x.g.status === 'accent' || (x.g.accents > 0 && x.g.status !== 'wrong'));

    const weakCats = Object.keys(catAgg).filter(k => catAgg[k].earned / catAgg[k].pts < 0.75);
    let verdict, vnote;
    if (pct >= 90 && weakCats.length === 0) {
      verdict = 'Your A1 grammar and fixed phrases are <b>closed</b>.';
      vnote = 'Stop cramming A1. Move to A2 as your primary material and let A1 come back through spiral review: a short warm-up, not a study block. Nothing on this test suggests a foundation that will fail under A2 load.';
    } else if (pct >= 90) {
      verdict = 'A1 is <b>effectively closed</b>, with one soft spot.';
      vnote = 'Begin A2 now. Carry the one category below 75% as a weekly repair item and give it no more than 20% of your study time.';
    } else if (pct >= 80) {
      verdict = 'A1 is <b>close</b>, with two or three real gaps left.';
      vnote = 'Start A2 on schedule and run the weak categories below as a short repair list alongside it. These will close faster inside A2 than they would by circling A1 for another fortnight.';
    } else if (pct >= 70) {
      verdict = 'The foundation is <b>mostly there</b>, but several gaps are load-bearing.';
      vnote = 'One more focused week on the categories marked Needs review, then retest only those sections rather than the whole paper. Set the A2 start date now and keep it regardless of how that week feels.';
    } else {
      verdict = "Not closed yet. Several core structures <b>aren't retrievable</b> under pressure.";
      vnote = "Work the two weakest categories for two weeks, then retest those sections only. Note which they are: if they're conjugations the fix is drilling, and if they're prepositions or articles the fix is volume of input, not drilling.";
    }

    const catRows = Object.keys(CATS).filter(k => catAgg[k]).map(k => {
      const c = catAgg[k], pc = Math.round(c.earned / c.pts * 100), st = statusOf(pc);
      return '<tr><td>' + CATS[k].label + ' <span class="muted small">· ' + c.n + ' q</span></td>'
        + '<td class="extab-meter"><span class="bar"><i style="--w:' + pc + '%"></i></span></td>'
        + '<td class="num">' + pc + '%</td><td><span class="tag' + (st === 'r' ? ' tag-strong' : '') + '">' + statusWord(st) + '</span></td></tr>';
    }).join('');

    const TILE = { grammar: ['Grammatica', 'grammar'], conjugation: ['Coniugazione', 'conjugation'], phrase: ['Frasi fatte', 'fixed phrases'], practical: ['In pratica', 'practical'] };
    const metaTiles = Object.keys(TILE).map(k => {
      const m = metaAgg[k], pc = m.p ? Math.round(m.e / m.p * 100) : 0, t = TILE[k];
      return '<div class="card"><p class="stat">' + pc + '<small>%</small></p><p class="muted small">' + t[0] + ' · ' + t[1] + ' · ' + (Math.round(m.e * 10) / 10) + ' / ' + m.p + '</p></div>';
    }).join('');

    const wrongCards = wrongs.map(({ q, i, g }) => {
      let you, right;
      if (q.t === 'para') {
        const v = Array.isArray(answers[i]) ? answers[i] : new Array(6).fill('');
        you = PERSONS.map((pn, k) => (g.bad || []).includes(k) ? '<span class="bad">' + esc(v[k] || '—') + '</span>' : '<span>' + esc(v[k] || '—') + '</span>').join(' · ');
        right = q.a.map(x => x[0]).join(' · ');
      } else { you = esc(answers[i] || ''); right = q.a.slice(0, 3).join('  /  '); }
      const blankQ = !isAnswered(i);
      return '<div class="card excard"><div><span class="tag">' + String(i + 1).padStart(2, '0') + ' · ' + CATS[q.c].label + '</span> ' + q.q + (q.sub ? ' <span class="sub">' + q.sub + '</span>' : '') + '</div>'
        + '<dl class="ab"><dt>You</dt><dd class="' + (blankQ ? 'muted' : 'bad') + '" lang="it">' + (blankQ ? 'left blank' : you) + '</dd><dt>Answer</dt><dd class="ok" lang="it">' + right + '</dd></dl>'
        + '<div class="muted small">' + q.r + '</div></div>';
    }).join('');

    const slipCards = slips.map(({ q, i }) => {
      const v = q.t === 'para' ? (answers[i] || []).join(' · ') : (answers[i] || '');
      return '<div class="card excard"><span class="tag">' + String(i + 1).padStart(2, '0') + ' · ' + CATS[q.c].label + '</span>'
        + '<p>You wrote <span class="it" lang="it">' + esc(v) + '</span>, correct apart from an accent. Expected <span class="it" lang="it">' + (q.t === 'para' ? q.a.map(x => x[0]).join(' · ') : q.a[0]) + '</span>.</p></div>';
    }).join('');

    const situCards = graded.filter(x => x.g.self).map(({ q, i }) => {
      const v = answers[i] || '', m = selfMarks[i];
      return '<div class="card excard"><div><span class="tag">' + String(i + 1).padStart(2, '0') + ' · Situazione</span> ' + q.q + '</div>'
        + '<p class="muted small">' + q.sub + '</p>'
        + '<dl class="ab"><dt>You</dt><dd class="' + (v.trim() ? '' : 'muted') + '" lang="it">' + (v.trim() ? esc(v) : 'left blank') + '</dd></dl>'
        + '<div class="model" lang="it">' + q.model + '</div><div class="muted small">' + q.alt + '</div><div class="muted small">' + q.r + '</div>'
        + '<div class="chips marks" data-q="' + i + '"><button class="chip" data-v="1" aria-pressed="' + (m === 1) + '">Mine works</button><button class="chip" data-v="0.5" aria-pressed="' + (m === 0.5) + '">Partly</button><button class="chip" data-v="0" aria-pressed="' + (m === 0) + '">No, I’d have failed</button></div></div>';
    }).join('');

    const weakList = Object.keys(CATS).filter(k => catAgg[k]).map(k => ({ k: k, p: catAgg[k].earned / catAgg[k].pts })).filter(x => x.p < 0.9).sort((a, b) => a.p - b.p);
    const weakSummary = weakList.length
      ? '<ul class="pts">' + weakList.map(x => { const pc = Math.round(x.p * 100), n = catAgg[x.k].n;
        return '<li><b>' + CATS[x.k].label + ', ' + pc + '%</b> across ' + n + ' question' + (n > 1 ? 's' : '') + '. ' + (pc < 75 ? 'Below the line: this one is worth deliberate work before it starts limiting A2 material.' : 'Close to solid. Spiral review will finish it; a study block would be overkill.') + '</li>'; }).join('') + '</ul>'
      : '<p>No category fell below 90%. There is no weak-area list to give you, which is itself the result.</p>';
    const reviewNext = weakList.length
      ? '<ul class="pts">' + weakList.slice(0, 5).map((x, idx) => '<li><b>' + (idx + 1) + '. ' + CATS[x.k].label + '</b>: <i>Tutto in uno</i>, ' + CATS[x.k].page + '. ' + (catAgg[x.k].n <= 4 ? 'Only ' + catAgg[x.k].n + ' questions here, so treat this as a signal to re-test rather than a firm verdict.' : '') + '</li>').join('') + '</ul>'
        + '<p class="muted">Everything not listed is in good enough shape to leave alone. Resist reviewing it because it feels productive.</p>'
      : '<p>Nothing. Open A2 material instead.</p>';

    const mins = started ? Math.max(1, Math.round(((finished || Date.now()) - started) / 60000)) : null;
    const other = form === 'A' ? 'B' : 'A';
    el('results').innerHTML =
      '<p class="eyebrow">Result · Prova ' + form + '</p>'
      + '<div class="exscore"><p class="big" id="ex-pct">' + pct + '<small>%</small></p><p class="muted">' + (Math.round(earned * 10) / 10) + ' of ' + totalPts + ' points<br>' + Q.length + ' questions · ' + (mins !== null ? mins + ' min' : 'no time recorded') + '<br>Auto-graded ' + (Math.round(autoEarn * 10) / 10) + ' / ' + autoPts + '</p></div>'
      + '<p class="h3">' + verdict + '</p><p>' + vnote + (unmarked ? ' <b>' + unmarked + ' situation' + (unmarked > 1 ? 's are' : ' is') + ' still unmarked.</b> Scroll to Situazioni pratiche and mark ' + (unmarked > 1 ? 'them' : 'it') + ' to finalise the score.' : '') + '</p>'
      + '<p class="muted small">Checks specific A1 grammar; it is not a certificate.</p>'
      + '<div class="grid2">' + metaTiles + '</div>'
      + '<section><h2>Categoria per categoria <span class="muted small">Results by area</span></h2>'
      + '<div class="card tabwrap"><table class="extab"><thead><tr><th>Category</th><th></th><th class="num">Score</th><th>Status</th></tr></thead><tbody>' + catRows + '</tbody></table></div>'
      + '<p class="muted small">Mastered is 90% or more, Shaky is 75 to 89%, Needs review is below 75%. Categories with four or fewer questions move a lot on one mistake, so read those as a signal, not a verdict.</p></section>'
      + '<section><h2>Punti deboli <span class="muted small">Weak areas</span></h2>' + weakSummary + '</section>'
      + '<section><h2>Cosa ripassare <span class="muted small">What to review next</span></h2>' + reviewNext + '</section>'
      + (wrongs.length
        ? '<section><h2>Le risposte sbagliate <span class="muted small">Every question you got wrong · ' + wrongs.length + '</span></h2>' + wrongCards + '</section>'
        : '<section><h2>Le risposte sbagliate <span class="muted small">Questions you got wrong</span></h2><p>None. Every auto-graded question was correct.</p></section>')
      + (slips.length ? '<section><h2>Quasi giuste <span class="muted small">Correct, with an accent slip · ' + slips.length + '</span></h2><p class="muted">These scored as correct. They are spelling, not grammar, but accents carry stress and occasionally meaning, so they are worth tidying.</p>' + slipCards + '</section>' : '')
      + '<section><h2>Situazioni pratiche <span class="muted small">Self-review</span></h2><p class="muted">Several answers work for each of these, so they are not auto-graded. Compare yours with the model and mark it yourself; the score above updates as you do. Mark it as working if an Italian would have understood you and the interaction would have completed, errors included.</p>' + situCards + '</section>'
      + '<div class="stack"><button class="btn btn-primary" id="ex-otherForm">Switch to Prova ' + other + '</button><button class="btn" id="ex-retake">Erase and retake Prova ' + form + '</button><button class="btn btn-link" id="ex-home">Back to the start</button></div>'
      + '<p class="muted small">La prova del nove · sourced from <i>Italiano — Tutto in uno</i>.</p>';

    el('results').querySelectorAll('.marks').forEach(group => {
      group.querySelectorAll('.chip').forEach(btn => {
        btn.addEventListener('click', () => { selfMarks[+group.dataset.q] = parseFloat(btn.dataset.v); save(); const y = window.scrollY; renderResults(true); window.scrollTo(0, y); });
      });
    });
    el('retake').addEventListener('click', function () { if (!PC.armed(this, 'Sure? Tap again to erase it')) return; clearSave(); useForm(form); refreshFormUI(); show('landing'); });
    el('otherForm').addEventListener('click', () => { useForm(other); refreshFormUI(); show('landing'); });
    el('home').addEventListener('click', () => { refreshFormUI(); show('landing'); });
    logResult(pct, Math.round(earned * 10) / 10, totalPts, mins, unmarked);
    show('results', keep);
  }
  /* one line per sitting, kept even after a paper is cleared and retaken */
  function logResult(pct, earned, total, mins, open) {
    if (!started) return; const id = form + ':' + started, log = store().log, list = log.list, e = list.find(x => x.id === id);
    if (e) { if (e.pct === pct && e.open === open) return; e.pct = pct; e.earned = earned; e.open = open; }
    else list.unshift({ id: id, form: form, at: finished || Date.now(), pct: pct, earned: earned, total: total, mins: mins, open: open });
    log.u = Date.now(); PC.save();
  }

  function refreshFormUI() {
    document.querySelectorAll('#ex-landing .formbar .chip').forEach(btn => {
      const f = btn.dataset.f; btn.setAttribute('aria-pressed', String(f === form));
      el('st' + f).textContent = status(f);
    });
    const d = load(form), n = answeredCount(form, d), other = form === 'A' ? 'B' : 'A', od = load(other);
    const note = el('formNote');
    if (d && d.submitted) note.textContent = 'Prova ' + form + ' is done. Open the results again, or switch to Prova ' + other + ' for fresh questions.';
    else if (n > 0) note.textContent = 'Prova ' + form + ' is part-done: ' + n + ' of ' + Q.length + ' answered.';
    else if (od && od.submitted) note.textContent = 'Prova ' + other + ' is already done. Prova ' + form + ' is fresh: same recipe, none of the same items.';
    else note.textContent = 'Untouched. Either paper can be sat first; they are equal in difficulty.';
    const begin = el('begin'), rb = el('resumeBtn'), going = !!(d && (n > 0 || d.submitted));
    if (begin._arm) { clearTimeout(begin._arm); begin._arm = null; }
    begin.textContent = (going ? 'Start Prova ' + form + ' again' : 'Start Prova ' + form);
    begin.className = going ? 'btn' : 'btn btn-primary';
    rb.hidden = !going; rb.textContent = d && d.submitted ? 'See the results of Prova ' + form : 'Resume Prova ' + form;
    const list = store().log.list || [];
    el('logBlock').hidden = !list.length;
    el('log').innerHTML = list.slice(0, 12).map(x => '<li class="split"><strong>' + x.pct + '%</strong><span class="muted">Prova ' + esc(x.form) + ' · ' + x.earned + ' / ' + x.total + ' points' + (x.mins ? ' · ' + x.mins + ' min' : '') + ' · ' + esc(PC.fmtDate(PC.key(new Date(x.at)), { day: 'numeric', month: 'long' })) + (x.open ? ' · ' + x.open + ' situation' + (x.open > 1 ? 's' : '') + ' still to mark' : '') + '</span></li>').join('');
  }

  function bind() {
    const tb = el('blueprint');
    SECTIONS.forEach(x => { const n = BANK.A.filter(q => q.s === x.id).length, tr = document.createElement('tr'); tr.innerHTML = '<td>' + x.name + '</td><td class="muted">' + x.focus + '</td><td class="num">' + n + '</td>'; tb.appendChild(tr); });
    el('next').addEventListener('click', goNext);
    el('prev').addEventListener('click', goPrev);
    el('toReview').addEventListener('click', openReview);
    el('pause').addEventListener('click', () => { save(); refreshFormUI(); show('landing'); });
    el('backToTest').addEventListener('click', () => { show('test'); renderQuestion(); });
    el('submit').addEventListener('click', () => { submitted = true; finished = Date.now(); save(); renderResults(); });
    document.querySelectorAll('#ex-landing .formbar .chip').forEach(btn => btn.addEventListener('click', () => { useForm(btn.dataset.f); refreshFormUI(); }));
    const start = () => { clearSave(); answers = new Array(Q.length).fill(null); selfMarks = {}; submitted = false; finished = null; started = Date.now(); cur = 0; save(); show('test'); renderQuestion(); };
    el('begin').addEventListener('click', function () { const d = load(form); if (d && (answeredCount(form, d) > 0 || d.submitted)) { if (PC.armed(this, 'Sure? Tap again to erase it')) start(); } else start(); });
    el('resumeBtn').addEventListener('click', () => { if (submitted) renderResults(); else { show('test'); renderQuestion(); } });
    /* accent buttons type into whichever answer box was used last */
    el('qinput').addEventListener('focusin', e => { if (e.target.classList.contains('exin')) lastInput = e.target; });
    el('accents').addEventListener('pointerdown', e => { if (e.target.closest('.acc')) e.preventDefault(); });
    el('accents').addEventListener('click', e => {
      const b = e.target.closest('.acc'); if (!b) return;
      const t = lastInput && document.body.contains(lastInput) ? lastInput : el('qinput').querySelector('.exin'); if (!t) return;
      const fresh = t !== document.activeElement && t !== lastInput, a = fresh ? t.value.length : t.selectionStart, z = fresh ? t.value.length : t.selectionEnd;
      t.focus(); t.setRangeText(b.dataset.ch, a, z, 'end'); t.dispatchEvent(new Event('input', { bubbles: true })); lastInput = t;
    });
  }

  const SKELETON = '<a class="back" href="#/quaderno">‹ Quaderno</a>'
    + '<section id="ex-landing"><p class="eyebrow">Level A1 · exit test</p><h1>Esame</h1>'
    + '<p>Two A1 practice papers, Prova A and Prova B: 100 questions and 110 points each, no multiple choice. One question to answer: are my A1 grammar and fixed phrases solid enough to start A2?</p>'
    + '<p class="notice">Checks specific A1 grammar; it is not a certificate.</p>'
    + '<section class="card"><h2 class="h3">Pick a paper</h2><div class="formbar"><button class="chip" data-f="A" aria-pressed="true">Prova A · <span id="ex-stA"></span></button><button class="chip" data-f="B" aria-pressed="false">Prova B · <span id="ex-stB"></span></button></div>'
    + '<p class="muted" id="ex-formNote"></p><div class="stack"><button class="btn btn-primary" id="ex-resumeBtn" hidden></button><button class="btn" id="ex-begin"></button></div></section>'
    + '<section class="card" id="ex-logBlock" hidden><h2 class="h3">Results <span class="muted small">Every sitting so far</span></h2><ul class="list" id="ex-log"></ul></section>'
    + '<section class="card"><h2 class="h3">How it is put together</h2>'
    + '<p>Every question comes from <b>Italiano — Tutto in uno</b>: Part A, pages 4 to 19, and the ◆ phrases of Part B. The A2 material stays off the menu: passato prossimo, irregular participles, the imperfetto contrast, and the full future and conditional. The fixed forms the workbook tells you to learn early (<span class="it" lang="it">vorrei, potrei, mi piacerebbe</span>) are in.</p>'
    + '<p>It tests <b>retrieval, not recognition</b>. You type every answer yourself, because on this material multiple choice would flatter you. Listening, pronunciation and vocabulary breadth are out of scope by design.</p>'
    + '<p><b>Two papers, one recipe.</b> Prova A and Prova B fill the same 100 slots with a different item in every one. Sit one as a dry run to find out what to review, then sit the other cold for a clean reading. They save and score separately.</p></section>'
    + '<section class="card"><h2 class="h3">Before you start</h2><ul class="pts"><li>No dictionary, no notes, no workbook, no translator.</li><li>You will not be told whether an answer is right until you hand the paper in.</li><li>Skip anything that stalls you past ten seconds. A blank is cleaner data than a reconstruction.</li><li>Accents count, but an accent-only slip is reported separately from a grammar error.</li><li>Your answers save as you go, so you can leave and pick the paper up again. About 60 to 90 minutes in all.</li></ul></section>'
    + '<section class="card"><h2 class="h3">Eleven sections</h2><div class="tabwrap"><table class="extab"><thead><tr><th>Section</th><th>Focus</th><th class="num">Qs</th></tr></thead><tbody id="ex-blueprint"></tbody></table></div></section>'
    + '<p class="muted small">Hours show effort; these papers show level. Scores never feed tomatoes or study time.</p></section>'
    + '<section id="ex-test" hidden><div class="split small"><span id="ex-sectName"></span><b id="ex-counter"></b></div><div class="bar"><i id="ex-barFill"></i></div>'
    + '<div class="card exq"><p class="eyebrow" id="ex-qnum"></p><h2 class="h3 exqtext" id="ex-qtext"></h2><p class="exqsub" id="ex-qsub"></p><div id="ex-qinput"></div>'
    + '<div class="accents" id="ex-accents" role="group" aria-label="Accented letters">' + ['à', 'è', 'é', 'ì', 'ò', 'ù', 'È'].map(c => '<button type="button" class="acc" data-ch="' + c + '" aria-label="Insert ' + c + '">' + c + '</button>').join('') + '</div></div>'
    + '<div class="split"><button class="btn" id="ex-prev">← Back</button><span class="muted small" id="ex-navhint"></span><button class="btn btn-primary" id="ex-next">Next →</button></div>'
    + '<div class="row-start"><button class="btn btn-link" id="ex-toReview">Review all answers</button><button class="btn btn-link" id="ex-pause">Leave and resume later</button></div></section>'
    + '<section id="ex-review" hidden><p class="eyebrow">Before you hand it in</p><h1>Review your answers</h1><p class="muted">Tap any number to go back to that question. Nothing is graded until you hand it in.</p>'
    + '<div id="ex-warnWrap"></div><p class="legend"><span><i class="sq sq-small band-4"></i>answered</span><span><i class="sq sq-small band-0"></i>left blank</span></p><div class="exgrid" id="ex-navGrid"></div>'
    + '<div class="split"><button class="btn" id="ex-backToTest">← Back to the questions</button><button class="btn btn-primary" id="ex-submit">Hand it in</button></div></section>'
    + '<section id="ex-results" hidden></section>';

  screens.esame = {
    tab: 'quaderno', title: 'Esame',
    render() { return SKELETON; },
    mount() {
      if (!inited) { inited = true; useForm('A'); const a = load('A'), b = load('B'); if (a && a.submitted && (!b || !b.submitted)) useForm('B'); }
      else useForm(form); // pick up whatever is saved (a restore may have replaced it)
      if (!PC.ui.local.ex) { PC.ui.local.ex = true; screen = 'landing'; } // arriving from elsewhere always lands on the entry screen
      bind();
      if (screen === 'results' && submitted) renderResults(true);
      else if (screen === 'test' && started && !submitted) { show('test', true); renderQuestion(); }
      else if (screen === 'review' && started && !submitted) openReview();
      else { refreshFormUI(); show('landing', true); }
    }
  };
})();
