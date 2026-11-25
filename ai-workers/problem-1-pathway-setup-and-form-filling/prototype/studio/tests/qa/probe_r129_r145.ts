// qa probe (capability R1.29, R1.45, 25 Nov): People to merge and the template editor at 400/1024 px, keyboard, axe,
// wrong role by URL, reload mid-dialog. Runs after j_29 and j_45 on the same isolated copy (their data). Never :4400.
import { createRequire } from "node:module";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { chromium, type Page } from "playwright";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const [NAME, PORT, OUT] = [process.argv[2], Number(process.argv[3]), process.argv[4]];
if (PORT === 4400) process.exit(2);
const BASE = `http://localhost:${PORT}`;
import { execFileSync } from "node:child_process";
// No shell: psql gets the query as one argument, so nothing in it needs escaping.
const sql = (q: string) => execFileSync("psql", ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio", "-d", `xr_studio_${NAME}`, "-At", "-c", q]).toString().trim();
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
const mail = (a: string) => sql(`select email from platform_staff where actor_id = '${a}' and firm_id = '${A}'`);
const token = async (m: string) => ((await (await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email: m, secondStep: true }) })).json()) as { token: string }).token;
const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {});
const out: string[] = []; const line = (ok: boolean, s: string, d: unknown = "") => { const t = `${ok ? "PASS" : "FAIL"}  ${s} — ${typeof d === "string" ? d : JSON.stringify(d)}`; out.push(t); console.log(t); };
async function page(tok: string, w: number): Promise<{ p: Page; errs: string[] }> {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tok);
  const p = await ctx.newPage(); const errs: string[] = []; p.on("pageerror", (e) => errs.push(String(e))); return { p, errs };
}
const sideways = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const tR = await token(mail("user-R")), tO = await token(mail("user-O"));
const KEY = encodeURIComponent("sales.lead.follow_up");
for (const w of [400, 1024]) {
  for (const [label, path] of [["People to merge", "/front-office/duplicates"], ["People to merge › Merged", "/front-office/duplicates?tab=merged"], ["Templates list", "/platform/templates"], ["Template editor", `/platform/templates/${KEY}`]]) {
    const { p, errs } = await page(tR, w); await p.goto(`${BASE}${path}`); await p.waitForLoadState("networkidle"); await p.waitForTimeout(600);
    const sw = await sideways(p); line(sw <= 1, `${w} px: ${label} has no sideways scroll`, `${sw}px`);
    const ax = (await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}(${v.nodes.length})`);
    line(ax.length === 0, `${w} px: ${label} axe clean`, ax);
    line(errs.length === 0, `${w} px: ${label} no page error`, errs);
    await p.screenshot({ path: join(OUT, `${w}-${label.replace(/[^a-z]+/gi, "-").toLowerCase()}.png`), fullPage: true }); await p.context().close();
  }
}
// wrong role by URL: the Case Officer opens People to merge
{ const { p } = await page(tO, 1024); await p.goto(`${BASE}/front-office/duplicates`); await p.waitForTimeout(1500);
  const body = (await p.locator("main").innerText().catch(() => "")).slice(0, 300);
  const merge = await p.getByRole("button", { name: /^Merge/ }).count();
  line(merge === 0, "Case Officer by URL: People to merge offers no Merge button", { merge, body });
  await p.screenshot({ path: join(OUT, "1024-case-officer-people-to-merge.png"), fullPage: true }); await p.context().close(); }
// keyboard: open a merge dialog by keyboard, Escape closes it, focus returns to the button; reload mid-dialog merges nothing
{ const { p } = await page(tR, 1024); await p.goto(`${BASE}/front-office/duplicates`); await p.waitForLoadState("networkidle");
  const btn = p.getByRole("button", { name: /^Merge/ }).first();
  if (await btn.count()) {
    await btn.focus(); await p.keyboard.press("Enter"); const dlg = p.getByRole("dialog"); const open = await dlg.isVisible().catch(() => false);
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    const closed = !(await dlg.isVisible().catch(() => false)); const back = await p.evaluate(() => (document.activeElement?.textContent ?? "").trim());
    line(open && closed && /^Merge/.test(back), "keyboard: Enter opens the merge dialog, Escape closes it, focus back on its Merge button", { open, closed, back });
    const merged = () => sql(`select count(*) from fo_person where merged_into_id is not null`);
    const before = merged();
    await btn.click(); await p.getByRole("button", { name: /Next/ }).first().click().catch(() => {}); await p.reload(); await p.waitForLoadState("networkidle"); await p.waitForTimeout(800);
    const after = merged(), open2 = await p.getByRole("dialog").isVisible().catch(() => false);
    line(!open2 && before === after, "reload mid-dialog: the page comes back with no dialog open and nothing merged (merged-away people before = after)", { before, after, dialog: open2 });
  } else line(false, "keyboard: a Merge button to open", "none on To review");
  await p.context().close(); }
// API: Case Officer may not publish a template; unknown field via API 422 (repeat), very long subject refused in words
{ const put = (t: string, b: unknown) => fetch(`${BASE}/api/platform/templates/${KEY}`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: JSON.stringify(b) });
  const cur = (await (await fetch(`${BASE}/api/platform/templates/${KEY}`, { headers: { authorization: `Bearer ${tR}` } })).json()) as { version?: number };
  const base = cur.version ?? 0;
  const co = await put(tO, { subject: "Hi", body: "Dear {{ lead_first_name }}", baseVersion: base });
  line(co.status === 403, "API: the Case Officer may not publish a template (403)", `${co.status} ${(await co.text()).slice(0, 160)}`);
  const stale = await put(tR, { subject: "Hi", body: "Dear {{ lead_first_name }}", baseVersion: base - 1 });
  line(stale.status === 409 || stale.status === 422, "API: a stale baseVersion is refused", `${stale.status} ${(await stale.text()).slice(0, 200)}`);
  const empty = await put(tR, { subject: "", body: "", baseVersion: base });
  line(empty.status === 422, "API: an empty subject and message are refused (422)", `${empty.status} ${(await empty.text()).slice(0, 200)}`);
  const long = await put(tR, { subject: "x".repeat(400), body: "Dear {{ lead_first_name }}", baseVersion: base });
  line(long.status >= 400 && long.status < 500, "API: a 400-character subject is refused (4xx)", `${long.status} ${(await long.text()).slice(0, 200)}`); }
await browser.close();
const fails = out.filter((l) => l.startsWith("FAIL")).length; console.log(`${out.length - fails}/${out.length} PASS`); process.exit(fails ? 1 : 0);
