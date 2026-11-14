/* Core calculations checked against the spec's acceptance numbers. Run: node tests/core.test.js */
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
global.window = global;
['data/activities', 'data/topics-prompts', 'data/grammar-tables', 'data/discoveries', 'core'].forEach(f => require('../js/' + f + '.js'));
const PC = global.PC; let fails = 0;
const ok = (name, cond) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + name); if (!cond) fails++; };
const reset = () => { PC.erase(); PC.load(); };
const T = PC.todayKey(), Y = PC.addDays(T, -1);
const add = (min, date, act) => PC.addSession({ activityId: act || 'listening', date: date || T, seconds: min * 60, source: 'manual' });

reset();
PC.addSession({ activityId: 'listening', date: T, seconds: 320, source: 'timer' });
ok('5:20 stores 320 s and shows 5 min', PC.S.sessions[0].seconds === 320 && PC.fmtMin(PC.secOn(T)) === '5 min');
ok('under a minute shows <1 min', PC.fmtMin(40) === '<1 min');
ok('20 min to next tomato after 5:20', PC.tomatoStats().minsToNext === 20);

reset(); add(15, Y); ok('15 min: no tomato yet', PC.tomatoStats().tomatoes === 0);
add(10, T); ok('15 + 10 across two days: one tomato', PC.tomatoStats().tomatoes === 1);

reset(); add(75); ok('75 min in a day: 3 tomatoes', PC.tomatoStats().tomatoes === 3 && PC.tomatoStats().minsToNext === 25);

reset(); add(190, Y); const r = add(10, T);
ok('crossing 200 min: jar 1, dated the crossing session', r.before.jars === 0 && r.after.jars === 1 && PC.S.jarDates[1] === T);
PC.deleteSession(r.session.id);
ok('deleting that session removes the jar and its date', PC.tomatoStats().jars === 0 && !PC.S.jarDates[1]);
add(10, T); ok('saving again: jar 1 back, same discovery number', PC.tomatoStats().jars === 1 && PC.discovery(1).number === 1);
const jc = PC.jarContents(1); ok('jar label: 200 min, 2 sessions, 2 days', jc.minutes === 200 && jc.sessions === 2 && jc.days.length === 2);

reset(); const e = add(30); add(30);
PC.updateSession(e.session.id, { seconds: 600 });
ok('edit 30 -> 10: 40 min total, 1 tomato, nothing doubled', PC.totalSec() === 2400 && PC.tomatoStats().tomatoes === 1);

reset(); add(10, Y); ok('10 min yesterday keeps the streak today', PC.streaks(T).current === 1);
reset(); PC.S.journal.push({ id: 'j1', wrote: 'a', correct: 'b', createdAt: Date.now() });
ok('journal entry alone: practice day, 0 min', PC.streaks(T).current === 1 && PC.totalSec() === 0);

reset(); let sg = PC.suggestions(T);
ok('at most 3 suggestions, each with a reason', sg.length === 3 && sg.every(c => c.reason));
ok('vocabulary (pinned) comes first', sg[0].activity.id === 'vocab');
ok('no due / overdue / late / missed', !/\b(due|overdue|late|missed)\b/i.test(JSON.stringify(sg.map(c => [c.action, c.reason]))));
PC.hideSuggestion('vocab', T); ok('Not today hides the card', !PC.suggestions(T).some(c => c.activity.id === 'vocab'));
ok('hidden only until tomorrow', PC.suggestions(PC.addDays(T, 1)).some(c => c.activity.id === 'vocab'));

reset(); PC.S.grammar.p7 = { state: 'practising', stateAt: Y, results: [{ date: Y, result: 'shaky' }] };
sg = PC.suggestions(T); ok('a table marked shaky yesterday is suggested today', sg.some(c => c.table && c.table.id === 'p7'));
ok('not suggested on the same day', !PC.suggestedTable(Y));

reset(); ok('default topics: 4, and prompts only from them', PC.S.topics.length === 4 && PC.promptPool().every(p => PC.S.topics.includes(p.t)));
PC.S.topics = PC.S.topics.filter(t => t !== 'saluti'); ok('unticking a topic removes its prompts', !PC.promptPool().some(p => p.t === 'saluti'));

reset(); add(40); PC.S.journal.push({ id: 'j', wrote: 'x', correct: 'y', createdAt: Date.now() });
const b = JSON.parse(JSON.stringify(PC.exportData())), snap = JSON.stringify(PC.S);
PC.erase(); ok('erase empties everything', PC.S.sessions.length === 0);
ok('backup passes the shape check', PC.checkBackup(b) === '');
PC.restore(b); ok('restore returns every record exactly', JSON.stringify(PC.S) === snap);
ok('a wrong file is refused', PC.checkBackup({ foo: 1 }) !== '' && PC.checkBackup(Object.assign({}, b, { schema: 9 })) !== '');
PC.setKey('sk-test'); ok('AI key is never in the export', !JSON.stringify(PC.exportData()).includes('sk-test'));

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed'); process.exit(fails ? 1 : 0);
