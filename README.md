# Pomodoro Club

A browser app for a self-directed Italian learner: log practice across the resources you already use, see it add up, and turn study time into tomatoes, jars and short discoveries about Italian life.

This is the first working prototype of v2, built from the "Pomodoro Club v2 — Build Spec" (13 Nov 2026).

- Static site: plain HTML, CSS and JavaScript. No build step, no server, no dependencies.
- One learner per browser. All data stays in that browser's `localStorage` under the key `pc.v1`.
- AI features are optional and use the learner's own Anthropic API key, kept only in their browser.

## Publish with GitHub Pages

1. Merge this branch into `main`.
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Choose **Branch: `main`**, folder **`/ (root)`**, and save.
4. After a minute the site is at `https://<your-username>.github.io/pomodoro-club/`.

`index.html` is at the root of the repository, and `.nojekyll` tells Pages to serve the files as they are.

## Run it on your computer

```bash
python3 -m http.server 8765
```

Then open `http://localhost:8765/`. (Opening `index.html` directly from disk also works.)

## Where things are

| Path | What it holds |
| --- | --- |
| `index.html` | The page shell. |
| `css/tokens.css` | **Design tokens.** Every colour, font, size, space, radius, shadow and duration. Rebrand by editing this file only. |
| `css/app.css` | Layout and components. Uses the tokens; no hard-coded design values. |
| `js/data/discoveries.js` | **Discovery content**, one entry per jar. The 10 entries are placeholders (`placeholder: true`). |
| `js/data/activities.js` | The 8 activities and their suggested resources, as data. |
| `js/data/topics-prompts.js` | Topics I've met and the writing prompt bank. New A2 prompts are marked `a2new: true`. |
| `js/data/grammar-tables.js` | The 16 tables to memorise. |
| `js/data/exam-bank.js` | The A1 exam, Prova A and Prova B (unchanged from Quaderno d'Italiano). |
| `js/core.js` | Storage, the session log, the timer record and every calculation (tomatoes, jars, streaks, suggestions, backup). |
| `js/ui.js` | Router, sheets, the timer bar, Finish sheet, log-a-mistake, jar reveal. |
| `js/screens.js` | Welcome, Oggi, All activities, Sessions, Progressi, Dispensa, Quaderno, Settings. |
| `js/scritti.js`, `js/grammatica.js`, `js/journal.js`, `js/esame.js`, `js/risorse.js` | The five Quaderno tools. |
| `js/ai.js` | The one place that calls Anthropic. The model name is set at the top. |
| `tests/` | `core.test.js` (calculations) and `acceptance.js` (the spec's 27 acceptance tests, in a real browser). |

## Tests

```bash
node tests/core.test.js
```

```bash
node tests/acceptance.js
```

The second needs [Playwright](https://playwright.dev) and the local server above running.
