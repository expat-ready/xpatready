// App view (B197, founder A110, 16 Nov; P-326, P-339, P-565): every lane on claude.ai/code, as text, for the Lead's
// 30-minute check. Run it in the built-in browser on claude.ai/code (signed in) with javascript_tool: paste this file's
// text; the page answers with the lines below. Then save them: bash product/tools/app-view-save.sh <<'EOF' ... EOF
// It reads the page's own session list (GET /v1/code/sessions, header anthropic-version 2023-06-01) and prints one line
// per session: title, cloud or mac, status_category, needs_action, status_detail, minutes since last_event_at, context.
// A line starts FLAG when the session needs the Lead: status need_input, blocked or failed; idle over 10 min with work
// left (status not completed, or a needs_action); context over 45% (P-565: refresh past about half). Otherwise "ok".
// Signed out or the call refused: one line "UNREADABLE ..." (ask the founder to sign in; save it all the same).
// It asks for LIMIT (200) sessions (B204 (4): at 50, the sidebar's "Show more" hid 11 of 45 sessions on 20 Nov); when the
// answer holds as many sessions as the limit, or says more remain (has_more, a next page or cursor), the second line is
// "WARNING: list may be cut (N of LIMIT)" and app-view-check.sh makes it an ACT. ENF-761 part 2 (tested 20 Nov): the API
// gives at most API_CAP (50) sessions plus a resume_token, whatever the limit, and no paging parameter reaches the rest;
// so resume_token counts as a "more" marker, and exactly 50 sessions is "WARNING: list may be cut (50 of 50): archive
// ended sessions" (the sidebar shows the same 50; archiving ended ones is the only way to see the rest).
// Node (tests): require('./app-view.js').lines(json, nowMs) gives the same text without the network. Test:
// check-app-view.sh. Read-only: it changes nothing on the page or in any session.
(function () {
  const IDLE_MIN = 10, CTX_SHARE = 0.45, WINDOW = 1000000; // WINDOW: assumed context size when the API gives none
  const LIMIT = 200;    // harmless: the API answers at most API_CAP whatever is asked
  const API_CAP = 50;   // ENF-761: GET /v1/code/sessions returns at most 50 (20 Nov)
  const WORK_DONE = ['completed'];
  const FLAG_STATUS = ['need_input', 'blocked', 'failed'];
  const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  function items(json) {
    if (Array.isArray(json)) return json;
    for (const k of ['data', 'sessions', 'items', 'results']) if (json && Array.isArray(json[k])) return json[k];
    return null;
  }
  function one(s, now) {
    s = s || {};
    const m = s.external_metadata || {};
    const pts = m.post_turn_summary || {};
    const cu = m.context_usage || {};
    const cat = clean(pts.status_category) || clean(s.status) || 'unknown';
    const need = Array.isArray(pts.needs_action) ? pts.needs_action.map(clean).join('; ') : clean(pts.needs_action);
    const detail = clean(pts.status_detail);
    const t = Date.parse(s.last_event_at || s.updated_at || '');
    const idle = Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 60000)) : null;
    const used = Number(cu.used_tokens);
    const win = Number(cu.max_tokens || cu.context_window || cu.limit_tokens || cu.total_tokens) || WINDOW;
    const share = Number.isFinite(used) && used > 0 ? used / win : null;
    const where = /local|bridge|mac|desktop/i.test(clean(s.environment_kind)) ? 'mac' : 'cloud';
    const why = [];
    if (FLAG_STATUS.includes(cat) || clean(s.status) === 'failed') why.push(cat === 'unknown' ? 'failed' : cat);
    const workLeft = !WORK_DONE.includes(cat) || need !== '';
    if (idle !== null && idle > IDLE_MIN && workLeft) why.push(`idle ${idle} min with work left`);
    if (share !== null && share > CTX_SHARE) why.push(`context ${Math.round(share * 100)}% (over 45%, P-565)`);
    const ctx = share === null ? 'context ?' : `context ${Math.round(used / 1000)}k (${Math.round(share * 100)}%)`;
    const text = [clean(s.title) || '(no title)', where, cat, need ? `needs: ${need}` : 'needs: none',
      detail || 'no detail', idle === null ? 'idle ?' : `idle ${idle} min`, ctx].join(' · ');
    return { flagged: why.length > 0, line: (why.length ? 'FLAG  ' : 'ok    ') + text + (why.length ? ' -> ' + why.join(', ') : '') };
  }
  function more(json) {   // the API's own "there is another page" markers, whichever it uses
    if (!json || Array.isArray(json)) return false;
    return json.has_more === true || json.has_more === 'true'
      || ['next_page', 'next_cursor', 'next', 'next_page_token', 'resume_token'].some((k) => json[k] != null && json[k] !== '' && json[k] !== false);
  }
  function lines(json, now, limit) {
    limit = Number(limit) || LIMIT;
    const list = items(json);
    if (!list) return 'UNREADABLE app view: the session list had no sessions array (' + clean(JSON.stringify(json)).slice(0, 120) + ')';
    const out = list.map((s) => one(s, now));
    const n = out.filter((o) => o.flagged).length;
    out.sort((a, b) => Number(b.flagged) - Number(a.flagged));
    const cut = list.length === API_CAP ? [`WARNING: list may be cut (${API_CAP} of ${API_CAP}): archive ended sessions`]
      : list.length >= limit || more(json) ? [`WARNING: list may be cut (${list.length} of ${limit})`] : [];
    return [`app view ${list.length} sessions · ${n} flagged`, ...cut, ...out.map((o) => o.line)].join('\n');
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { lines }; return undefined; }
  const url = '/v1/code/sessions?statuses=active&statuses=paused&statuses=failed&limit=' + LIMIT + '&include_pinned_beyond_page=true&omit_bound_device=true';
  return fetch(url, { credentials: 'include', headers: { 'anthropic-version': '2023-06-01' } })
    .then((r) => (r.ok ? r.json().then((j) => lines(j, Date.now()))
      : `UNREADABLE app view: HTTP ${r.status} ` + ([401, 403].includes(r.status) ? '(signed out? ask the founder to sign in to claude.ai)'
        : `(the API refused the request; a 400 may mean limit=${LIMIT} is over its maximum: lower LIMIT in tools/app-view.js)`)))
    .catch((e) => `UNREADABLE app view: ${clean(e && e.message)} (open claude.ai/code in the built-in browser, signed in)`);
})();
