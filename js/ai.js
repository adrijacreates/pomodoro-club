/* Pomodoro Club — optional AI (M11). Three features only: Check my Italian, Patterns analysis, Ask Claude where it fits.
   The learner's own Anthropic API key is read from this browser and sent only to api.anthropic.com. It is never logged. */
(function () {
  'use strict';
  const PC = window.PC;
  const MODEL = 'claude-opus-5-5';   // change the model here
  const ENDPOINT = 'https://api.anthropic.com/v1/messages';

  function fail(message) { const e = new Error(message); e.friendly = message; return e; }

  /* Sends one prompt and returns the JSON object in the reply. Throws an Error whose .friendly is a plain message. */
  async function json(prompt, signal) {
    const key = PC.getKey();
    if (!key) throw fail('AI checks are off. Add a key in Settings.');
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST', signal: signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'   // allows a direct call from the browser
        },
        body: JSON.stringify({ model: MODEL, max_tokens: 8000, output_config: { effort: 'low' }, messages: [{ role: 'user', content: prompt }] })
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw fail('Stopped.');
      throw fail('Could not reach Anthropic. You may be offline. Your text is still here; try again when you are connected.');
    }
    if (!res.ok) {
      let msg = ''; try { const b = await res.json(); msg = (b && b.error && b.error.message) || ''; } catch (e) { /* no body */ }
      if (res.status === 401) throw fail('The API key was not accepted. Check it in Settings.');
      if (res.status === 402 || /credit|billing/i.test(msg)) throw fail('Your Anthropic account has no credit left. Add credit in the Anthropic Console, then try again.');
      if (res.status === 403) throw fail('This API key is not allowed to do that. Check it in the Anthropic Console.');
      if (res.status === 429) throw fail('Anthropic is rate-limiting this key. Wait a minute and try again.');
      if (res.status >= 500) throw fail('Anthropic is busy right now. Try again in a minute.');
      throw fail('The request was not accepted (' + res.status + '). Try again.');
    }
    let body; try { body = await res.json(); } catch (e) { throw fail('The reply could not be read. Try again.'); }
    if (body.stop_reason === 'refusal') throw fail('No feedback came back for that text. Try rewording it.');
    const text = (body.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const a = text.indexOf('{'), z = text.lastIndexOf('}');
    if (a < 0 || z <= a) throw fail(body.stop_reason === 'max_tokens' ? 'The reply was cut short. Try a shorter text.' : 'The reply came back in a form the app could not use. Try again.');
    try { return JSON.parse(text.slice(a, z + 1)); } catch (e) { throw fail('The reply came back in a form the app could not use. Try again.'); }
  }

  PC.ai = {
    MODEL: MODEL,
    ready: () => !!PC.getKey(),
    json: json,
    /* the one line that replaces every AI button when there is no key */
    off: () => '<p class="ai-off">AI checks are off. <a href="#/settings">Add a key in Settings</a>.</p>'
  };
})();
