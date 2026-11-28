// LR-125 (lab register 27 Nov, founder A425): the journey-test skill's strict self-check fails on a planted console error
// and on a slow page; the default (warning) mode stays as OS-73 left it. Planted pages on a throwaway local server (no
// app, no database, no model call: US$0). One walker per page, since a strict run counts errors over the whole run.
//   tsx studio/tests/check_lr125_strict_browser.ts
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { walker } from "../acceptance/lib/browser.ts";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 260)}` : ""}`); };

const TEXT = "<p style='font:16px sans-serif;width:600px'>" + "A paragraph a person reads on this page. ".repeat(20) + "</p>";
const PAGES: Record<string, string> = {
  "/still": `<h1>Still page</h1>${TEXT}`,
  // A planted console error after first paint (the page itself works and shows its text).
  "/console": `<h1>Console page</h1>${TEXT}<script>setTimeout(()=>console.error("planted console error"),100)</script>`,
  // An error journey: a request answered 400, shown to the person (Chrome logs "Failed to load resource ... 400").
  "/handled400": `<h1>Handled page</h1>${TEXT}<p id=m></p><script>fetch("/bad").then(r=>{document.getElementById("m").textContent="Shown: "+r.status})</script>`,
  // The same page that also fails at the server (500): not a handled error.
  "/server500": `<h1>Server page</h1>${TEXT}<script>fetch("/boom")</script>`,
  // The largest text paints only after 3 s, behind "Loading" (LCP over 2.5 s), as in check_os73_vitals_browser.ts.
  "/slow": `<div id=w>Loading</div><template id=t><h1 style='font-size:64px'>Slow page</h1>${TEXT}</template><script>setTimeout(()=>{document.getElementById("w").replaceChildren(document.getElementById("t").content.cloneNode(true))},3000)</script>`,
};
const server = createServer((req, res) => {
  const url = (req.url ?? "/").split("?")[0];
  if (url === "/bad" || url === "/boom") { res.writeHead(url === "/bad" ? 400 : 500, { "content-type": "application/json" }); res.end("{}"); return; }
  const body = PAGES[url];
  res.writeHead(body ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
  res.end(body ? `<!doctype html><html><head><meta charset=utf-8><title>t</title><link rel=icon href="data:,"></head><body>${body}</body></html>` : "not found");
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

/** Walks one planted page in a fresh walker; returns what settle threw (null when it passed) and the walker's record. */
const walk = async (path: string, strict: boolean) => {
  const w = await walker(base, { strict });
  try {
    const p = await w.open("Firm admin");
    await p.goto(path);
    await p.waitForTimeout(200); // the planted console error fires at 100 ms
    let threw: string | null = null;
    try { await w.settle(p, `planted ${path}`); } catch (e) { threw = String(e); }
    return { threw, consoleErrors: [...w.consoleErrors], vitals: [...w.vitals] };
  } finally { await w.close(); }
};

try {
  const saved = process.env.JOURNEY_STRICT;
  process.env.JOURNEY_STRICT = "1";
  ok("LR-125 JOURNEY_STRICT=1 turns strict on", (await walker(base).then(async (w) => { const s = w.strict; await w.close(); return s; })) === true);
  delete process.env.JOURNEY_STRICT;
  ok("LR-125 strict is off by default (STANDARDS §9 warning budget)", (await walker(base).then(async (w) => { const s = w.strict; await w.close(); return s; })) === false);
  if (saved !== undefined) process.env.JOURNEY_STRICT = saved;

  const still = await walk("/still", true);
  ok("LR-125 strict: a clean quick page passes", still.threw === null, still);
  const con = await walk("/console", true);
  ok("LR-125 strict: a planted console error fails the check and names it", !!con.threw && /strict self-check failed.*console error .*planted console error/.test(con.threw), con);
  const slow = await walk("/slow", true);
  ok("LR-125 strict: a slow page (LCP over 2.5 s) fails the check and names it", !!slow.threw && /strict self-check failed.*LCP over 2\.5 s/.test(slow.threw), slow);
  const h400 = await walk("/handled400", true);
  ok("LR-125 strict: a handled 400 (error journey) passes, though Chrome logged it", h400.threw === null && h400.consoleErrors.some((e) => / 400 /.test(e)), h400);
  const s500 = await walk("/server500", true);
  ok("LR-125 strict: a 500 fails the check", !!s500.threw && /console error .*status of 500/.test(s500.threw), s500);
  const conWarn = await walk("/console", false);
  ok("LR-125 default mode: the console error is collected, settle does not throw", conWarn.threw === null && conWarn.consoleErrors.some((e) => e.includes("planted console error")), conWarn);
  const slowWarn = await walk("/slow", false);
  ok("LR-125 default mode: a slow page warns only (OS-73 unchanged)", slowWarn.threw === null && !!slowWarn.vitals[0]?.over.includes("LCP over 2.5 s"), slowWarn);
} finally {
  server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
