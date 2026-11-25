// OS-73 (25 Nov, founder ruling 13:04 IST): the acceptance walker (acceptance/lib/browser.ts) reads each settled page's
// LCP and CLS against Google's "good" line (2.5 s, 0.1) and prints one VITALS line, warning only. Three planted pages on
// a throwaway local server (no app, no database): a quick still page (ok), a page whose block pushes the text down
// (CLS over 0.1), and a page whose main text paints after 3 s behind "Loading" (LCP over 2.5 s). A miss must print
// WARN and must never throw. No server of the app, no model call (US$0).
//   tsx studio/tests/check_os73_vitals_browser.ts
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { CLS_BUDGET, LCP_BUDGET_MS, walker } from "../acceptance/lib/browser.ts";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 260)}` : ""}`); };

const TEXT = "<p style='font:16px sans-serif;width:600px'>" + "A paragraph a person reads on this page. ".repeat(20) + "</p>";
const PAGES: Record<string, string> = {
  "/still": `<h1>Still page</h1>${TEXT}`,
  // A 500 px block lands above the text after first paint: the text moves down by most of the viewport.
  "/shift": `<div id=top></div><h1>Shift page</h1>${TEXT}<script>setTimeout(()=>{document.getElementById("top").style.height="500px"},300)</script>`,
  // The largest text paints only after 3 s (a fixed script moves a <template> in; no code is built from strings);
  // "Loading" until then, so settle waits for it.
  "/slow": `<div id=w>Loading</div><template id=t><h1 style='font-size:64px'>Slow page</h1>${TEXT}</template><script>setTimeout(()=>{document.getElementById("w").replaceChildren(document.getElementById("t").content.cloneNode(true))},3000)</script>`,
};
const server = createServer((req, res) => {
  const body = PAGES[(req.url ?? "/").split("?")[0]];
  res.writeHead(body ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
  res.end(body ? `<!doctype html><html><head><meta charset=utf-8><title>t</title></head><body>${body}</body></html>` : "not found");
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const w = await walker(base);
const logs: string[] = [], log = console.log;
console.log = (...a: unknown[]) => { logs.push(a.join(" ")); log(...a); };
try {
  ok("OS-73 the budgets are Google's good line: LCP 2.5 s, CLS 0.1", LCP_BUDGET_MS === 2500 && CLS_BUDGET === 0.1, { LCP_BUDGET_MS, CLS_BUDGET });
  for (const path of ["/still", "/shift", "/slow"]) {
    const p = await w.open("Firm admin");
    await p.goto(path);
    let threw: unknown = null;
    try { await w.settle(p, `planted ${path}`); } catch (e) { threw = e; }
    ok(`OS-73 ${path}: settle never throws on a budget (warning only)`, threw === null, threw === null ? undefined : String(threw));
    await p.context().close();
  }
  const by = (path: string) => w.vitals.find((v) => v.path === path);
  const line = (path: string) => logs.find((l) => l.startsWith(`VITALS ${path} `)) ?? "";
  const still = by("/still"), shift = by("/shift"), slow = by("/slow");
  ok("OS-73 /still: LCP read and within 2.5 s, CLS within 0.1, line says ok", !!still && still.lcpMs !== null && still.lcpMs <= 2500 && still.cls <= 0.1 && / ok \(/.test(line("/still")), { still, line: line("/still") });
  ok("OS-73 /shift: CLS over 0.1 is read and the line says WARN CLS over 0.1", !!shift && shift.cls > 0.1 && /WARN .*CLS over 0\.1/.test(line("/shift")), { shift, line: line("/shift") });
  ok("OS-73 /slow: LCP over 2.5 s is read and the line says WARN LCP over 2.5 s", !!slow && (slow.lcpMs ?? 0) > 2500 && /WARN .*LCP over 2\.5 s/.test(line("/slow")), { slow, line: line("/slow") });
  ok("OS-73 one VITALS line per settled page, each naming LCP and CLS", logs.filter((l) => /^VITALS \/\S+ LCP (none|\d+ ms) CLS \d\.\d{3} /.test(l)).length === 3, logs.filter((l) => l.startsWith("VITALS")));
} finally {
  console.log = log;
  await w.close();
  server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
