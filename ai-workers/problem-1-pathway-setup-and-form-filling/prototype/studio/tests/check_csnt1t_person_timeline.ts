// CS-NT1t (map row 76, "each ... person ... has its own timeline"; BACKLOG row CS-NT1t; j_76 W5): GET
// /api/runtime/clients/:id/timeline on an isolated copy, through the API as firm staff (PF-4's local stand-in) and the data
// checked underneath. Named cases, each a pass and a fail:
//   PT1 a person on two cases sees both cases' lines and their own notes, newest first; a case of another person never
//   PT2 firm B's lines never appear: B's note on its own person, and a line in A's workspace carrying B's firm id that
//       names A's case (planted); firm B reading A's person → 404, its own → 200
//   PT3 a person from a won prospect shows the prospect's lines once, not twice; without the link, none
//   PT4 page 2 continues where page 1 stopped (cursor): no line skipped or repeated across 120 lines; a forged cursor → 400
//   PT5 staff only: the simulated client (x-actor, no staff session) is refused; an internal note never reaches a client
//       read (there is none here: the client's case read shows only CLIENT_VISIBLE case notes, never a person's)
//   PT6 a case outside the reader's caseScope is left out of the person's timeline, never named
//   PT7 by screens: the client page shows the Timeline with the person's note, a case's note and the prospect's note, at
//       1440 and 375 px, axe clean, no sideways scroll; another firm's Owner sees no such client
// No model call, US$0, never :4400.
//   zsh studio/tools/isolated.sh csnt1t 4432 start --ttl 60 AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on && tsx --tsconfig studio/api/tsconfig.json studio/tests/check_csnt1t_person_timeline.ts 4432 xr_studio_csnt1t
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const PORT = Number(process.argv[2] ?? 4432), DB = process.argv[3] ?? "xr_studio_csnt1t", BASE = `http://localhost:${PORT}`;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const PSQL = existsSync("/opt/homebrew/opt/postgresql@18/bin/psql") ? "/opt/homebrew/opt/postgresql@18/bin/psql" : "psql";
const sql = (q: string) => execFileSync(PSQL, [`postgresql://xr_studio@127.0.0.1:54329/${DB}`, "-Atc", q], { encoding: "utf8" }).trim().split("\n")[0] ?? "";
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other API checks
type Res = { status: number; body: any };
const call = async (method: string, path: string, json?: unknown, o: { token?: string; actor?: string } = {}): Promise<Res> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(o.actor ? { "x-actor": o.actor } : {}), ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) }, body: json === undefined ? undefined : JSON.stringify(json) });
  const text = await r.text();
  return { status: r.status, body: text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null };
};
const signIn = async (firmKey: string, email: string) => (await call("POST", "/platform/session/local", { firmKey, email, secondStep: true })).body?.token as string;
const removed: [string, string][] = [];
const putBack = () => { for (const [role, key] of removed.splice(0)) sql(`insert into platform_role_permission (role, permission_key) values ('${role}', '${key}') on conflict do nothing`); };
const run = Date.now().toString(36);
const has = (b: unknown, s: string) => JSON.stringify(b ?? null).includes(s);

try {
  if (sql("select count(*) from config_release r join combination c on c.id = r.combination_id where c.combination_key = 'vv.single' and r.status = 'RELEASED'") === "0") {
    const l = await call("POST", "/demo/load", { sample: "configured" }, { actor: "user-A" });
    ok("setup: the configured checkpoint loads", l.status < 300, l.status);
  }
  const vv = sql("select id from combination where combination_key = 'vv.single'");
  const tA = await signIn("sample-firm", "representative@sample-firm.example.com");
  const soloOwner = sql("select s.email from platform_staff s join platform_firm f on f.id = s.firm_id join platform_role_grant g on g.staff_id = s.id and g.ended_at is null where f.key = 'sample-solo' and g.role = 'OWNER' limit 1");
  const tB = await signIn("sample-solo", soloOwner);
  const tT = await signIn("sample-firm", sql("select email from platform_staff where actor_id = 'user-T' and firm_id = (select id from platform_firm where key = 'sample-firm')"));
  const openCase = async (actor: string, name: string, team: Record<string, unknown>) => (await call("POST", "/runtime/cases", { combinationId: vv, reference: `CSNT1T-${run}-${randomUUID().slice(0, 4)}`, clientActor: "user-P", principal: { displayName: name }, ...team }, { actor })).body?.id as string;
  const A1 = await openCase("user-O", `Sample Person ${run} One`, { representative: "user-R", caseOfficers: ["user-O"] });
  const A2 = await openCase("user-O", `Sample Person ${run} Two`, { representative: "user-R", caseOfficers: ["user-O"] });
  const OTHER = await openCase("user-O", `Sample Other ${run}`, { representative: "user-R", caseOfficers: ["user-O"] });
  const B1 = await openCase("user-S", `Sample Person ${run} B`, {});
  const P = sql(`select client_id from runtime_case where id = '${A1}'`), PB = sql(`select client_id from runtime_case where id = '${B1}'`);
  sql(`update runtime_case set client_id = '${P}' where id = '${A2}'`);   // the same person on a second case
  ok("setup: one person of firm A on two cases (A1, A2), another person's case, and firm B's person (staff signed in)", !!tA && !!tB && !!tT && !!P && !!PB && sql(`select count(*) from runtime_case where client_id = '${P}'`) === "2");

  // Lines: a note on the person, a note on each of their cases, a note on the other case, firm B's notes.
  const add = (path: string, text: string, token = tA) => call("POST", path, { text }, { token });
  const pn = await add(`/runtime/clients/${P}/notes`, `Person note ${run}`);
  await add(`/runtime/cases/${A1}/notes`, `Case one note ${run}`);
  await add(`/runtime/cases/${A2}/notes`, `Case two note ${run}`);
  await add(`/runtime/cases/${OTHER}/notes`, `Other person's case note ${run}`);
  const bn = await add(`/runtime/clients/${PB}/notes`, `Firm B person note ${run}`, tB);
  await add(`/runtime/cases/${B1}/notes`, `Firm B case note ${run}`, tB);
  const ws = sql(`select workspace_id from runtime_case where id = '${A1}'`), firmB = sql("select id from platform_firm where key = 'sample-solo'");
  sql(`insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, firm_id) values (gen_random_uuid(), '${ws}', now(), 'staff:x', 'uploaded', 'case document', gen_random_uuid()::text, 'Firm B planted line ${run} on case ${A1.slice(0, 8)}', '${firmB}')`);
  ok("setup: the notes are written (201)", pn.status === 201 && bn.status === 201, [pn.status, bn.status]);

  // ---- PT1 ---------------------------------------------------------------------------------------------------------
  const t1 = await call("GET", `/runtime/clients/${P}/timeline`, undefined, { token: tA });
  const lines: { at: string; summary: string; caseId: string | null; source: string }[] = t1.body?.lines ?? [];
  ok("PT1 pass: the person's timeline shows their own note and both cases' notes, each case line naming its case", t1.status === 200 && has(lines, `Person note ${run}`)
    && lines.some((l) => l.summary === `Case one note ${run}` && l.caseId === A1) && lines.some((l) => l.summary === `Case two note ${run}` && l.caseId === A2), t1.status);
  ok("PT1 pass: newest first", lines.every((l, i) => i === 0 || lines[i - 1].at >= l.at));
  ok("PT1 fail: another person's case note never appears", !has(lines, `Other person's case note ${run}`));
  // ---- PT2 ---------------------------------------------------------------------------------------------------------
  ok("PT2 fail: firm B's notes and the planted line carrying B's firm id never appear on firm A's person", !has(lines, `Firm B person note ${run}`) && !has(lines, `Firm B case note ${run}`) && !has(lines, `Firm B planted line ${run}`));
  const bOnA = await call("GET", `/runtime/clients/${P}/timeline`, undefined, { token: tB }), bOwn = await call("GET", `/runtime/clients/${PB}/timeline`, undefined, { token: tB });
  ok("PT2 fail/pass: firm B reading A's person → 404 with no line; its own person → 200 with its note", bOnA.status === 404 && !has(bOnA.body, run) && bOwn.status === 200 && has(bOwn.body, `Firm B person note ${run}`), [bOnA.status, bOwn.status]);
  const nope = await call("GET", `/runtime/clients/${randomUUID()}/timeline`, undefined, { token: tA });
  ok("PT2 fail: no such person → 404", nope.status === 404, nope.status);
  // ---- PT3 ---------------------------------------------------------------------------------------------------------
  ok("PT3 fail: with no prospect link, no prospect line", !lines.some((l) => l.source === "prospect"));
  const lead = await call("POST", "/front-office/leads", { requestId: randomUUID(), source: "Phone call", givenNames: `Prospect${run}`, familyName: "Sample", email: `p.${run}@example.org`, confirmedNew: true }, { token: tA });
  const leadId = lead.body?.id as string;
  await call("POST", `/front-office/leads/${leadId}/engage`, undefined, { token: tA });
  const prospectId = sql(`select coalesce(max(id::text), '') from fo_prospect where lead_id = '${leadId}'`);
  const pnote = await call("POST", `/front-office/prospects/${prospectId}/notes`, { text: `Prospect note ${run}` }, { token: tA });
  sql(`update case_client set prospect_id = '${prospectId}' where id = '${P}'`);
  const t3 = await call("GET", `/runtime/clients/${P}/timeline`, undefined, { token: tA });
  const pl: { summary: string; source: string }[] = t3.body?.lines ?? [];
  ok("PT3 pass: the won prospect's lines show, its note exactly once", !!prospectId && pnote.status === 201 && pl.filter((l) => l.summary === `Prospect note ${run}`).length === 1 && pl.some((l) => l.source === "prospect"), { prospectId, note: pnote.status, n: pl.filter((l) => l.summary === `Prospect note ${run}`).length });
  // ---- PT4: paging -----------------------------------------------------------------------------------------------
  sql(`insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, case_id) select gen_random_uuid(), '${ws}', now() - interval '1 hour', 'staff:x', 'uploaded', 'case document', gen_random_uuid()::text, 'Paged upload ${run} ' || g, (case when g % 2 = 0 then '${A1}' else '${A2}' end)::uuid from generate_series(1, 120) g`);
  const seen: string[] = [];
  let cursor: string | null = null, pages = 0, okCursor = true;
  do {
    const r: Res = await call("GET", `/runtime/clients/${P}/timeline${cursor ? `?cursor=${cursor}` : ""}`, undefined, { token: tA });
    if (r.status !== 200) { okCursor = false; break; }
    for (const l of r.body.lines as { summary: string }[]) { const m = /^Paged upload \S+ (\d+)$/.exec(l.summary); if (m) seen.push(m[1]); }
    cursor = r.body.nextCursor; pages++;
  } while (cursor && pages < 10);
  ok("PT4 pass: page by page, each of the 120 lines exactly once, over at least 3 pages", okCursor && seen.length === 120 && new Set(seen).size === 120 && pages >= 3, { n: seen.length, distinct: new Set(seen).size, pages });
  const forged = await call("GET", `/runtime/clients/${P}/timeline?cursor=${Buffer.from('["1","x","y"]').toString("base64url")}`, undefined, { token: tA });
  ok("PT4 fail: a forged cursor → 400 INVALID on cursor", forged.status === 400 && forged.body?.fields?.cursor, forged.status);
  // ---- PT5 -------------------------------------------------------------------------------------------------------
  const asClient = await call("GET", `/runtime/clients/${P}/timeline`, undefined, { actor: "user-P" });
  ok("PT5 fail: the simulated client (no staff session) is refused, no line", asClient.status === 401 || asClient.status === 403 ? !has(asClient.body, run) : false, asClient.status);
  const clientRead = await call("GET", `/runtime/cases/${A1}`, undefined, { actor: "user-P" });
  ok("PT5 fail: the client's case read never shows the person's internal note", clientRead.status === 200 && !has(clientRead.body, `Person note ${run}`), clientRead.status);
  // ---- PT6: caseScope ---------------------------------------------------------------------------------------------
  const n = sql("with d as (delete from platform_role_permission where role = 'CASE_MANAGER' and permission_key = 'agent/case:view.all' returning 1) select count(*) from d");
  if (n !== "0") removed.push(["CASE_MANAGER", "agent/case:view.all"]);
  const t6 = await call("GET", `/runtime/clients/${P}/timeline`, undefined, { token: tT });
  ok("PT6 fail: a Case manager who cannot open the cases sees the person's own note but none of the cases' lines", t6.status === 200 && has(t6.body, `Person note ${run}`) && !(t6.body?.lines ?? []).some((l: { caseId: string | null }) => l.caseId), t6.status);
  putBack();
  // ---- PT7 by screens ------------------------------------------------------------------------------------------------
  const browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
  try {
    for (const width of [1440, 375]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      await ctx.addInitScript((x) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_000_000 })); localStorage.setItem("xr-actor", "user-R"); }, tA);
      const pg = await ctx.newPage(); const errors: string[] = []; pg.on("pageerror", (e) => errors.push(String(e)));
      await pg.goto(`${BASE}/clients/${P}`);
      const tl = pg.locator("[data-client-timeline]");
      await tl.locator("[data-timeline-line]").first().waitFor({ timeout: 60000 });
      for (let i = 0; i < 3 && !(await tl.innerText()).includes(`Person note ${run}`) && (await tl.locator("[data-timeline-older]").count()); i++) {
        const before = await tl.locator("[data-timeline-line]").count();
        await tl.locator("[data-timeline-older]").click();
        await pg.waitForFunction(([n]) => document.querySelectorAll("[data-client-timeline] [data-timeline-line]").length > n, [before], { timeout: 30000 });
      }
      const text = await tl.innerText();
      ok(`PT7 pass at ${width}: the client page's Timeline shows the person's note, both cases' notes and the prospect's note (Show older as needed)`, [`Person note ${run}`, `Case one note ${run}`, `Case two note ${run}`, `Prospect note ${run}`].every((s) => text.includes(s)), text.slice(0, 300));
      const axe = await new AxeBuilder({ page: pg }).include("[data-client-timeline]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      ok(`PT7 axe (WCAG 2.2 AA) at ${width}: the client page's Timeline`, axe.violations.length === 0, axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`));
      ok(`PT7 at ${width}: no sideways scroll, no page error`, !(await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) && errors.length === 0, errors.slice(0, 3));
      if (process.env.SHOTS) await tl.screenshot({ path: `${process.env.SHOTS}/client-timeline-${width}.png` });
      await ctx.close();
    }
    const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctxB.addInitScript((x) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_000_000 })); }, tB);
    const pb = await ctxB.newPage();
    await pb.goto(`${BASE}/clients/${P}`);
    const none = await pb.locator("[data-no-client]").waitFor({ timeout: 60000 }).then(() => true, () => false);
    ok("PT7 fail: another firm's Owner opening A's client sees \"No such client\" and no timeline line", none && !(await pb.content()).includes(`Person note ${run}`), { none });
  } finally { await browser.close(); }
  const t6b = await call("GET", `/runtime/clients/${P}/timeline`, undefined, { token: tT });
  ok("PT6 pass: with agent/case:view.all back, the same person sees the cases' lines", t6b.status === 200 && (t6b.body?.lines ?? []).some((l: { caseId: string | null }) => l.caseId === A1 || l.caseId === A2), t6b.status);
} finally {
  putBack();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
