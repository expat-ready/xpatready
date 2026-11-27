// claude-lanes.js — the Lead's claude.ai lane read (A430, founder 27 Nov: "this time I had to remind you").
// Run it in the built-in browser on https://claude.ai/code with javascript_tool, at every lead-watch check.
// Output: one line per cloud session (WAIT = Awaiting input, UNREAD = finished a turn you have not read,
// RUN = running), then a summary line the check report must quote:
//   "claude.ai: signed in · W waiting · U unread · R running"
// Signed out (no session list, or a login page) prints "claude.ai: SIGNED OUT" — the Lead tells the founder 🔴
// in that same check with the exact URL (https://claude.ai/login), and pushes a notification.
// The sidebar hides older sessions behind "Show more" (20 Nov: 11 lanes were hidden, 4 of them waiting), so the read
// clicks it until it is gone before counting; the summary says how many clicks it took.
(async () => {
  let clicks = 0;
  for (; clicks < 20; clicks++) {
    const b = [...document.querySelectorAll('button,[role="button"],a')].find(e => /^\s*Show more\s*$/i.test(e.innerText));
    if (!b) break;
    b.click(); await new Promise(r => setTimeout(r, 1200));
  }
  if (/\/login/.test(location.pathname) || !document.querySelector('a[href*="/code/session_"]')) {
    return 'claude.ai: SIGNED OUT or list not loaded (' + location.href + ')';
  }
  const rows = [...document.querySelectorAll('a[href*="/code/session_"]')].map(a => {
    const h = a.outerHTML, t = a.innerText.replace(/\s+/g, ' ').trim();
    const k = /Awaiting input/.test(h) ? 'WAIT' : /Unread response/.test(t) ? 'UNREAD' : /Running/.test(t) ? 'RUN' : '-';
    return { k, t: t.slice(0, 70), u: 'https://claude.ai' + a.getAttribute('href') };
  });
  const n = k => rows.filter(r => r.k === k).length;
  return rows.filter(r => r.k !== '-').map(r => r.k.padEnd(6) + r.t + ' ' + r.u).join('\n') +
    `\nclaude.ai: signed in · ${n('WAIT')} waiting · ${n('UNREAD')} unread · ${n('RUN')} running · ${rows.length} listed · Show more ×${clicks}`;
})();
