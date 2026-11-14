/* The spec's acceptance tests, driven through the real UI in Chromium at a phone and a desktop size.
   Run:  python3 -m http.server 8765   (in the repo root), then   node tests/acceptance.js
   Needs Playwright. The browser clock is controlled, so "tomorrow" and "25 minutes later" are instant.
   Test 23 uses a stand-in for the Anthropic API (no real key is used). */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const URL = process.env.PC_URL || 'http://localhost:8765/';
const START = new Date(2026, 10, 14, 10, 0, 0); // Sat 14 Nov 2026, 10:00 local
const SIZES = [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1280, height: 800 }];
const results = {};

async function open(browser, size, opts) {
  opts = opts || {};
  const ctx = await browser.newContext(Object.assign({ viewport: { width: size.width, height: size.height }, acceptDownloads: true }, opts.ctx || {}));
  const page = await ctx.newPage();
  page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.clock.install({ time: START });
  await page.goto(URL);
  if (!opts.stayOnWelcome) await page.click('text=Start practising');
  return page;
}
const S = page => page.evaluate(() => JSON.parse(JSON.stringify(PC.S)));
const ff = (page, sec) => page.clock.fastForward(sec * 1000);
const seed = (page, list) => page.evaluate(l => { const T = PC.todayKey(); l.forEach(x => PC.addSession({ activityId: x[0], date: PC.addDays(T, x[1]), seconds: x[2] * 60, source: 'manual' })); PC.render(); }, list);
async function start(page, id) { await page.goto(URL + '#/activities'); await page.click('[data-act="act-start"][data-id="' + id + '"]'); }
async function closeSheet(page) { await page.keyboard.press('Escape'); await page.waitForSelector('#sheet-root .sheet', { state: 'detached' }); }
async function finish(page, choice) {
  if (await page.locator('#sheet-root .sheet').count()) await page.click('#sheet-root [data-act="timer-finish"]'); else await page.click('#timerbar [data-act="timer-finish"]');
  if (choice) await page.click('#sheet-root [data-act="fin-choice"][data-v="' + choice + '"]');
  await page.click('#fin-save');
}
async function logByHand(page, act, min, date) {
  await page.goto(URL + '#/activities'); await page.click('text=Log time without the timer');
  await page.selectOption('#sheet-root [data-bind="activityId"]', act);
  if (date) await page.fill('#sheet-root [data-bind="date"]', date);
  await page.fill('#sheet-root [data-bind="minutes"]', String(min)); await page.click('#fin-save');
}
const text = (page, sel) => page.locator(sel).innerText();

const TESTS = [
  ['A new visitor sees the welcome screen, skips the name, and logs a session without any setup', async (b, z) => {
    const p = await open(b, z, { stayOnWelcome: true });
    const welcome = await p.isVisible('text=Benvenuto.');
    await p.click('text=Start practising');
    await start(p, 'listening'); await ff(p, 90); await finish(p);
    const s = await S(p); return welcome && s.sessions.length === 1 && s.settings.name === '';
  }],
  ['Time a session for 5:20 and save: today shows 5 min, the session stores 320 seconds', async (b, z) => {
    const p = await open(b, z); await start(p, 'reading'); await ff(p, 320); await finish(p);
    await p.goto(URL + '#/oggi'); const s = await S(p);
    return s.sessions[0].seconds === 320 && /^5\s*min$/.test((await text(p, '#today-min')).trim());
  }],
  ['Pause for 2 minutes mid-session: the paused time is not counted', async (b, z) => {
    const p = await open(b, z); await start(p, 'reading'); await ff(p, 60);
    await p.click('#sheet-root [data-act="timer-pause"]'); await ff(p, 120);
    await p.click('#sheet-root [data-act="timer-resume"]'); await ff(p, 60); await finish(p);
    return (await S(p)).sessions[0].seconds === 120;
  }],
  ['Refresh the page while a timer runs: it continues with the correct time', async (b, z) => {
    const p = await open(b, z); await start(p, 'reading'); await ff(p, 100); await p.reload(); await ff(p, 50);
    const el = await p.evaluate(() => PC.timerElapsed()), bar = await text(p, '#timerbar [data-clock]');
    return el === 150 && bar === '02:30' && (await S(p)).timer.runningSince !== null;
  }],
  ['Pass 25:00: one chime, the timer keeps running', async (b, z) => {
    const p = await open(b, z); await start(p, 'reading'); await p.clock.runFor(1502 * 1000);
    const c1 = await p.evaluate(() => PC.chimeCount); await p.clock.runFor(120 * 1000);
    const c2 = await p.evaluate(() => PC.chimeCount), el = await p.evaluate(() => PC.timerElapsed());
    return c1 === 1 && c2 === 1 && el === 1622 && (await S(p)).timer.runningSince !== null;
  }],
  ['Time 5:20 and tap 15 on the Finish sheet: 15 min is saved', async (b, z) => {
    const p = await open(b, z); await start(p, 'reading'); await ff(p, 320); await finish(p, '15');
    return (await S(p)).sessions[0].seconds === 900;
  }],
  ['Log 40 min by hand for yesterday: it appears on yesterday, not today', async (b, z) => {
    const p = await open(b, z); const y = await p.evaluate(() => PC.addDays(PC.todayKey(), -1));
    await logByHand(p, 'lessons', 40, y);
    await p.goto(URL + '#/sessions/' + y); const onY = await p.isVisible('text=40 min');
    await p.goto(URL + '#/oggi'); const s = await S(p);
    return onY && s.sessions[0].date === y && s.sessions[0].startedAt === null && /^0\s*min$/.test((await text(p, '#today-min')).trim());
  }],
  ['Start Reading while Listening runs: the confirm sheet appears, and Listening is saved first', async (b, z) => {
    const p = await open(b, z); await start(p, 'listening'); await ff(p, 760); await closeSheet(p);
    await p.click('[data-act="act-start"][data-id="reading"]');
    const q = await text(p, '#sheet-title'); const before = (await S(p)).sessions.length;
    await p.click('[data-act="switch-confirm"]'); const s = await S(p);
    return q === 'Finish Listening (12:40) and start Reading?' && before === 0 && s.sessions.length === 1 && s.sessions[0].activityId === 'listening' && s.sessions[0].seconds === 760 && s.timer.activityId === 'reading' && s.sessions[0].createdAt <= s.timer.startedAt;
  }],
  ['Log 15 min today and 10 min tomorrow: one tomato appears on the second day', async (b, z) => {
    const p = await open(b, z); await logByHand(p, 'vocab', 15);
    await p.goto(URL + '#/dispensa'); const t1 = await text(p, '#tomatoes');
    await ff(p, 24 * 3600); await logByHand(p, 'vocab', 10);
    await p.goto(URL + '#/dispensa'); const t2 = await text(p, '#tomatoes'), s = await S(p);
    return t1 === '0' && t2 === '1' && s.sessions[0].date !== s.sessions[1].date;
  }],
  ['Log 75 min in one day: 3 tomatoes', async (b, z) => {
    const p = await open(b, z); await logByHand(p, 'lessons', 75); await p.goto(URL + '#/dispensa');
    return (await text(p, '#tomatoes')) === '3';
  }],
  ['Cross 200 min: the discovery opens automatically, jar 1 is on the shelf with that day\'s date', async (b, z) => {
    const p = await open(b, z); await seed(p, [['lessons', -1, 190]]);
    await start(p, 'reading'); await ff(p, 600); await finish(p);
    await p.waitForSelector('#reveal-root .reveal'); await ff(p, 2);          // jar-fill moment, then the discovery by itself
    await p.waitForSelector('#reveal-root .disc-title'); const title = await text(p, '#reveal-root .disc-title');
    await p.click('[data-act="reveal-close"]'); const back = p.url().endsWith('#/activities');
    await p.goto(URL + '#/dispensa'); const shelf = await text(p, '.shelf');
    return title === 'Placeholder discovery 1' && back && /No\. 1 · 14 Nov/.test(shelf) && (await S(p)).jarDates[1] === '2026-11-14';
  }],
  ['Delete the session that crossed 200 min: jar 1 leaves the shelf; saving it again brings back the same discovery', async (b, z) => {
    const p = await open(b, z); await seed(p, [['lessons', -1, 190], ['reading', 0, 10]]);
    await p.goto(URL + '#/dispensa'); const had = await p.locator('.shelf li').count();
    await p.goto(URL + '#/sessions'); await p.click('[data-act="session-delete"]'); await p.click('[data-act="session-delete"]');
    await p.goto(URL + '#/dispensa'); const gone = (await p.locator('.shelf li').count()) === 0 && !(await S(p)).jarDates[1];
    await logByHand(p, 'reading', 10); await ff(p, 2); await p.waitForSelector('#reveal-root .disc-title');
    return had === 1 && gone && (await text(p, '#reveal-root .disc-title')) === 'Placeholder discovery 1';
  }],
  ['Edit a session from 30 to 10 min: totals, tomatoes and the week view all update; nothing is counted twice', async (b, z) => {
    const p = await open(b, z); await seed(p, [['lessons', 0, 30], ['vocab', 0, 30]]);
    await p.goto(URL + '#/sessions'); await p.locator('[data-act="session-edit"]').first().click();
    await p.fill('#sheet-root [data-bind="minutes"]', '10'); await p.click('#fin-save');
    await p.goto(URL + '#/progressi'); const total = await text(p, '#total-time'), week = await text(p, '.pager');
    await p.goto(URL + '#/dispensa'); const tom = await text(p, '#tomatoes'), s = await S(p);
    return total === '40 min' && /Week total: 40 min/.test(week) && tom === '1' && s.sessions.length === 2 && s.sessions.reduce((t, x) => t + x.seconds, 0) === 2400;
  }],
  ['Oggi shows at most 3 suggestions, each with a reason; none contains due, overdue, late or missed', async (b, z) => {
    const p = await open(b, z); await seed(p, [['lessons', -3, 20], ['reading', -9, 20]]);
    await p.evaluate(() => { const y = PC.addDays(PC.todayKey(), -2); PC.S.grammar.p7 = { state: 'practising', stateAt: y, results: [{ date: y, result: 'shaky' }] }; PC.save(); });
    await p.goto(URL + '#/oggi'); const cards = await p.locator('.sug').allInnerTexts(), reasons = await p.locator('.sug p.muted').allInnerTexts();
    return cards.length > 0 && cards.length <= 3 && reasons.length === cards.length && reasons.every(r => r.trim().length > 5) && !cards.some(c => /\b(due|overdue|late|missed)\b/i.test(c));
  }],
  ['Oggi does not list all 8 activities; All activities does', async (b, z) => {
    const p = await open(b, z); const names = await p.evaluate(() => PC.ACTS.map(a => a.name));
    await p.goto(URL + '#/oggi'); const oggi = await text(p, '#view');
    await p.goto(URL + '#/activities'); const all = await text(p, '#view'), rows = await p.locator('.act-row').count();
    return names.filter(n => oggi.includes(n)).length < 8 && names.every(n => all.includes(n)) && rows === 8;
  }],
  ['A day with only 10 min of one activity keeps the streak', async (b, z) => {
    const p = await open(b, z); await seed(p, [['lessons', -2, 40], ['vocab', -1, 10], ['reading', 0, 25]]);
    await p.goto(URL + '#/progressi'); return /streak 3/.test(await text(p, '#streak'));
  }],
  ['Saving a journal entry with no session keeps the streak and adds 0 min', async (b, z) => {
    const p = await open(b, z); await seed(p, [['lessons', -1, 40]]);
    await p.goto(URL + '#/oggi'); await p.click('#fab');
    await p.fill('#sheet-root [data-bind="wrote"]', 'à Milano'); await p.fill('#sheet-root [data-bind="correct"]', 'a Milano'); await p.click('#sheet-root button[type="submit"]');
    const min = (await text(p, '#today-min')).trim(); await p.goto(URL + '#/progressi'); const s = await S(p);
    return /streak 2/.test(await text(p, '#streak')) && /^0\s*min$/.test(min) && s.journal.length === 1 && s.sessions.length === 1;
  }],
  ['The week view moves back and forward and stops at the first week with data and at the current week', async (b, z) => {
    const p = await open(b, z); await seed(p, [['lessons', -15, 30], ['vocab', 0, 20]]);
    await p.goto(URL + '#/progressi'); const dis = sel => p.locator(sel).isDisabled();
    const l0 = await text(p, '#week-label'), nextOff0 = await dis('[data-act="week-next"]');
    await p.click('[data-act="week-prev"]'); const l1 = await text(p, '#week-label');
    await p.click('[data-act="week-prev"]'); const l2 = await text(p, '#week-label'), prevOff = await dis('[data-act="week-prev"]');
    await p.click('[data-act="week-next"]'); await p.click('[data-act="week-next"]'); const l3 = await text(p, '#week-label');
    return /9 Nov – 15 Nov · this week/.test(l0) && nextOff0 && /2 Nov – 8 Nov/.test(l1) && /26 Oct – 1 Nov/.test(l2) && prevOff && l3 === l0 && await dis('[data-act="week-next"]');
  }],
  ['Write two sentences, tap Keep going, reach 60 words: one piece and one Writing session are saved', async (b, z) => {
    const p = await open(b, z); await p.goto(URL + '#/scritti');
    await p.locator('#w-text').pressSequentially('Mi chiamo Ada. Abito a Milano.', { delay: 0 });
    const two = /2 sentences/.test(await text(p, '#w-count')); await ff(p, 120);
    await p.click('#w-keep'); const kept = await p.inputValue('#w-text');
    await p.locator('#w-text').pressSequentially(' ' + Array.from({ length: 54 }, (_, i) => 'parola' + (i % 7 ? '' : '.')).join(' '), { delay: 0 });
    const words = await p.evaluate(() => PC.countWords(document.querySelector('#w-text').value)); await ff(p, 300);
    await p.click('#w-finish'); await p.click('#fin-save'); const s = await S(p);
    return two && kept === 'Mi chiamo Ada. Abito a Milano.' && words === 60 && s.pieces.length === 1 && s.pieces[0].goal === 'full' && PCwords(s.pieces[0].text) === 60
      && s.sessions.length === 1 && s.sessions[0].activityId === 'writing' && s.sessions[0].seconds === 420 && s.timer === null;
  }],
  ['Untick a topic in Topics I\'ve met: prompts for it stop appearing', async (b, z) => {
    const p = await open(b, z); await p.goto(URL + '#/grammatica');
    for (const id of ['articoli', 'avere', 'presente']) await p.click('[data-act="topic-toggle"][data-id="' + id + '"]'); // leaves only Greetings
    await p.goto(URL + '#/scritti'); const before = await text(p, '#w-tag');
    await p.goto(URL + '#/grammatica'); await p.click('[data-act="topic-toggle"][data-id="saluti"]'); await p.click('[data-act="topic-toggle"][data-id="cibo"]');
    await p.goto(URL + '#/scritti'); const seen = new Set();
    for (let i = 0; i < 30; i++) { seen.add(await text(p, '#w-tag')); await p.click('[data-act="w-another"]'); }
    return before === 'Greetings and introductions' && seen.size === 1 && seen.has('Food and ordering');
  }],
  ['Mark a table Shaky: the next day it is suggested on Oggi; Grammatica shows no date for it', async (b, z) => {
    const p = await open(b, z); await p.goto(URL + '#/table/p7');
    await p.click('[data-act="tb-result"][data-v="shaky"]'); await p.click('[data-act="tb-finish"]');
    await p.goto(URL + '#/oggi'); const sameDay = (await text(p, '#view')).includes('Adjectives & possessives');
    await ff(p, 24 * 3600); await p.goto(URL + '#/oggi'); await p.reload(); const card = (await p.locator('.sug').allInnerTexts()).find(c => c.includes('Adjectives & possessives')) || '';
    await p.goto(URL + '#/grammatica'); const row = await text(p, 'a[href="#/table/p7"]'), page = await text(p, '#view');
    return !sameDay && /You marked it shaky on 14 Nov\./.test(card) && /Last result: Shaky/.test(row) && /Suggested/.test(row) && !/\d|Nov|due/i.test(row.replace('A2', '')) && !/\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/.test(page);
  }],
  ['With no AI key, Check my Italian and Analyse show the "AI checks are off" line and saved feedback still shows', async (b, z) => {
    const p = await open(b, z);
    await p.evaluate(() => { PC.S.pieces.push({ id: 'p1', date: PC.todayKey(), promptId: 'saluti-1', promptTitle: 'Mi presento', goal: 'short', text: 'Io sono di Canada.', updatedAt: Date.now(), feedback: { corrected: 'Sono del Canada.', mistakes: [{ wrote: 'di Canada', correct: 'del Canada', why: 'Countries take the article.' }], wellDone: 'Clear sentence.', at: Date.now() } }); PC.save(); });
    const off = 'AI checks are off. Add a key in Settings.';
    await p.goto(URL + '#/scritti'); const w = await text(p, '#view'), noBtnW = (await p.locator('[data-act="w-check"]').count()) === 0;
    await p.goto(URL + '#/scritti/patterns'); const pa = await text(p, '#view'), noBtnP = (await p.locator('[data-act="pat-run"]').count()) === 0;
    await p.goto(URL + '#/scritti/pieces/p1'); const pc = await text(p, '#view'), link = await p.locator('.ai-off a').count();
    return w.includes(off) && noBtnW && pa.includes(off) && noBtnP && pc.includes('Sono del Canada.') && pc.includes('Countries take the article.') && link === 0;
  }],
  ['With a valid key, Check my Italian returns feedback that is saved with the piece (API stood in for; no real key used)', async (b, z) => {
    const p = await open(b, z); let sent = null;
    await p.route('https://api.anthropic.com/v1/messages', route => {
      const r = route.request(); sent = { headers: r.headers(), body: JSON.parse(r.postData()) };
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"corrected":"Sono del Canada.","mistakes":[{"wrote":"di Canada","correct":"del Canada","why":"Countries take the article."}],"wellDone":"Clear sentence."}' }] }) });
    });
    await p.goto(URL + '#/settings'); await p.fill('#set-key', 'sk-ant-test-key'); await p.click('text=Save key');
    await p.goto(URL + '#/scritti'); await p.locator('#w-text').pressSequentially('Io sono di Canada.', { delay: 0 });
    await p.click('[data-act="w-check"]'); await p.waitForSelector('.feedback'); const shown = await text(p, '.feedback'), s = await S(p);
    await p.reload(); await p.goto(URL + '#/scritti/pieces/' + s.pieces[0].id); const after = await text(p, '#view');
    return shown.includes('del Canada') && s.pieces.length === 1 && s.pieces[0].feedback.mistakes.length === 1 && after.includes('Countries take the article.')
      && sent.headers['x-api-key'] === 'sk-ant-test-key' && sent.headers['anthropic-dangerous-direct-browser-access'] === 'true' && !JSON.stringify(s).includes('sk-ant-test-key');
  }],
  ['Both exam papers can be started, left, resumed, submitted and reviewed; results persist', async (b, z) => {
    const p = await open(b, z); let ok = true;
    for (const f of ['A', 'B']) {
      await p.goto(URL + '#/quaderno'); await p.click('a[href="#/esame"]'); await p.click('#ex-landing .chip[data-f="' + f + '"]'); await p.click('#ex-begin');
      const first = await p.evaluate(f => window.PC_EXAM.BANK[f][0].a[0], f);
      await p.fill('#ex-mainInput', first); await p.click('#ex-next'); await p.fill('#ex-mainInput', 'sbagliato');
      await p.click('#ex-pause');                                   // leave
      await p.goto(URL + '#/oggi'); await p.reload(); await p.goto(URL + '#/esame');
      await p.click('#ex-landing .chip[data-f="' + f + '"]'); await p.click('#ex-resumeBtn');   // resume
      ok = ok && (await p.inputValue('#ex-mainInput')) === 'sbagliato' && (await text(p, '#ex-counter')) === '2 / 100';
      await p.click('#ex-toReview'); ok = ok && (await p.locator('.excell.done').count()) === 2;  // review
      await ff(p, 600); await p.click('#ex-submit');                 // submit
      ok = ok && (await text(p, '#ex-pct')).trim() === '0.9%' && (await p.locator('.marks').count()) === 6;
      await p.locator('.marks .chip[data-v="1"]').first().click();   // self-marking moves the score
      ok = ok && (await text(p, '#ex-pct')).trim() !== '0.9%';
    }
    await p.reload(); await p.goto(URL + '#/esame'); const log = await p.locator('#ex-log li').count(), land = await text(p, '#ex-landing');
    await p.click('#ex-resumeBtn'); const res = await p.isVisible('#ex-pct');
    return ok && log === 2 && res && land.includes('Checks specific A1 grammar; it is not a certificate.') && p.errors.length === 0;
  }],
  ['Export, Erase everything, then Restore: every record returns exactly', async (b, z) => {
    const p = await open(b, z); await seed(p, [['lessons', -3, 205], ['reading', 0, 12]]);
    await p.evaluate(() => { const S = PC.S; S.journal.push({ id: 'j1', wrote: 'a', correct: 'b', note: '', topicId: 'saluti', pieceId: null, createdAt: Date.now(), reviewedAt: null });
      S.pieces.push({ id: 'p1', date: PC.todayKey(), promptId: 'saluti-1', goal: 'short', text: 'Ciao.', feedback: null, updatedAt: Date.now() });
      S.grammar.p6 = { state: 'memorised', stateAt: PC.todayKey(), results: [{ date: PC.todayKey(), result: 'solid' }] }; S.topics.push('cibo'); S.revealed.push(1);
      S.resources.r1 = { id: 'r1', title: 'Busuu', url: '', buy: '', type: 'app', for: ['vocabolario'], lvl: 'A1', st: 'use', note: 'n', ai: '', at: 1, u: 1 };
      S.settings = { name: 'Ada', goal: { hours: 100, date: '2027-01-08' }, pinned: ['vocab', 'reading'], sound: false }; S.exam.A = { answers: new Array(100).fill(null), cur: 3, started: 5, finished: null, submitted: false, selfMarks: {}, u: 9 };
      PC.save(); PC.timerStart('listening', 'coffee-break'); });
    await p.goto(URL + '#/settings');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('text=Export backup')]);
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pc-')), 'backup.json'); await dl.saveAs(file);
    const before = await S(p);
    await p.click('[data-act="erase-ask"]'); await p.click('[data-act="erase-confirm"]');
    const emptied = await p.isVisible('text=Benvenuto.') && (await p.evaluate(() => localStorage.getItem('pc.v1'))) === null;
    await p.locator('#welcome input[type="file"]').setInputFiles(file); await p.click('[data-act="restore-confirm"]');
    const after = await S(p), one = JSON.parse(fs.readFileSync(file, 'utf8'));
    return emptied && JSON.stringify(after) === JSON.stringify(before) && one.schema === 1 && before.sessions.length === 2 && after.timer.activityId === 'listening';
  }],
  ['A second browser profile starts empty', async (b, z) => {
    const p = await open(b, z); await seed(p, [['lessons', 0, 60]]);
    const q = await open(b, z, { stayOnWelcome: true });   // a separate profile
    return await q.isVisible('text=Benvenuto.') && (await S(q)).sessions.length === 0 && (await S(p)).sessions.length === 1;
  }],
  ['With reduced motion on, the jar moment has no animation', async (b, z) => {
    const p = await open(b, z, { ctx: { reducedMotion: 'reduce' } }); await seed(p, [['lessons', -1, 195]]);
    await logByHand(p, 'reading', 10);
    const straight = await p.locator('#reveal-root .disc-title').count(), filling = await p.locator('.jar-filling').count();
    const anim = await p.evaluate(() => { const d = document.createElement('div'); d.className = 'jar jar-filling'; d.innerHTML = '<i></i>'; document.body.appendChild(d); const n = getComputedStyle(d.firstChild).animationName; d.remove(); return n; });
    return straight === 1 && filling === 0 && anim === 'none';
  }]
];
function PCwords(t) { return (t.match(/[A-Za-zÀ-ſ]+(?:[’'][A-Za-zÀ-ſ]+)*/g) || []).length; }

(async () => {
  const browser = await chromium.launch();
  const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
  for (const size of SIZES) for (let i = 0; i < TESTS.length; i++) {
    if (only && only.indexOf(i + 1) < 0) continue;
    let ok = false, note = '';
    try { ok = await TESTS[i][1](browser, size); } catch (e) { note = String(e.message).split('\n')[0].slice(0, 140); }
    (results[i] = results[i] || {})[size.name] = ok ? 'PASS' : 'FAIL' + (note ? ' (' + note + ')' : '');
    for (const c of browser.contexts()) await c.close();
  }
  await browser.close();
  let fails = 0;
  Object.keys(results).forEach(i => { const r = results[i]; if (r.phone !== 'PASS' || r.desktop !== 'PASS') fails++;
    console.log(String(+i + 1).padStart(2) + '. phone ' + r.phone + ' · desktop ' + r.desktop + ' · ' + TESTS[i][0]); });
  console.log(fails ? '\n' + fails + ' test(s) failing' : '\nall ' + Object.keys(results).length + ' pass on phone and desktop');
  process.exit(fails ? 1 : 0);
})();
