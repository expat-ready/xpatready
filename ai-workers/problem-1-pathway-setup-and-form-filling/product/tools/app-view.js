// App view (P-326, P-339b): paste into the built-in browser's javascript_tool on https://claude.ai/code.
// Lists each session row of the sidebar with its status words, cloud rows first, and flags the ones the Lead acts on
// now: waiting on a question or a permission, failed, merge conflicts. "Unread response" means the lane ended a turn:
// check its PR (pushed in the last 90 min? labelled? a question?) and send "continue" plus its next step if work is left.
// Local Mac rows ("xpatready · Connected") are read with list_sessions instead. Read-only: it clicks nothing.
// Then: bash product/tools/lead-watch.sh app-view-read "<n cloud, n flagged: names>"
(async () => {
  const rows = () => [...document.querySelectorAll('a[href*="/code/session_"]')];
  const a0 = rows()[0];
  let el = a0;
  while (el && !(el.scrollHeight > el.clientHeight + 20 && getComputedStyle(el).overflowY !== "visible")) el = el.parentElement;
  for (let i = 0; el && i < 6; i++) { el.scrollTop = el.scrollHeight; await new Promise((r) => setTimeout(r, 800)); }
  const FLAG = /Waiting|Asked a question|Awaiting|Needs (input|approval)|Failed|Error|Merge conflict/i;
  const out = rows().map((a) => {
    const t = (a.closest("li") || a.parentElement).textContent.replace(/\s+/g, " ").trim();
    return { t: t.slice(0, 120), id: a.href.split("/").pop(), cloud: /Cloud/.test(t), flag: FLAG.test(t) };
  });
  const banner = [...document.querySelectorAll("main *")].filter((e) => e.children.length < 3 && FLAG.test(e.textContent))
    .map((e) => e.textContent.replace(/\s+/g, " ").trim().slice(0, 120));
  return [
    `rows ${out.length} · cloud ${out.filter((r) => r.cloud).length} · flagged ${out.filter((r) => r.flag).length + banner.length}`,
    ...banner.map((b) => `FLAG banner: ${b}`),
    ...out.filter((r) => r.flag).map((r) => `FLAG ${r.t} | ${r.id}`),
    ...out.filter((r) => r.cloud && !r.flag).map((r) => `cloud ${r.t} | ${r.id}`),
  ].join("\n");
})();
