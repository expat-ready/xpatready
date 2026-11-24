// J-77 (map row 77, R1.77: submission number and UCI; a case decided, withdrawn, closed and reopened with audit lines;
// brief design/build-lead-c-briefs/J-77.md, P-606, P-719): the join-and-walk row. It adds no feature: it walks the merged
// parts (C8.2's Record the submission, CS-C1a's four acts, CS-C1b's active-case count, BK-21, CS-C1s's Decision and
// closing panel) on an isolated copy of the running app (its own database and port, never :4400), on screen and through
// the API, as a firm's staff member would.
//   DW1-DW4, the swaps shown real; each judge also runs against its stand-in, where it must fail (the NR lines, as j_6.ts):
//     DW1 the panel's buttons are the server's `can`;     NR: a screen that trusts its own copy (the read's `can` replaced
//         in the browser) offers Close on a case whose filing is not submitted (the judge, run on that tab's buttons,
//         fails), and the API answers 409 in the screen's words.
//     DW2 every act (decision, withdrawal, close, reopen) writes one audit line by `staff:<id>`; NR: the same act sent as
//         the simulated person (x-actor only) is 401 and writes no line.
//     DW3 the firm is the session's: firm A's session reads firm B's case as 404; NR: the simulated-person read, whose
//         firm comes from its header, answers 200 on that case, so the same judge fails on it. A break check: firm A's
//         session with firm B's person in the header is still 404.
//     DW4 the active-case count moves (CS-C1b: active = open and not every filing decided since the last reopen): the
//         decision or a withdrawal takes the case off, the close keeps it off, the reopen puts it back; NR: the refused
//         forced close of DW1, on an active case, would have moved it, and moves nothing.
//   W1-W7, the walk at 1440 px (axe on each screen walked; 1024 px with no sideways scroll):
//     W1 the case officer records the submission number and UCI (case page, Submission to IRCC, C8.2);
//     W2 staff record Approved (Sample) with the authority's date and a note; W3 correct it to Refused (Sample), the
//     earlier decision in the history; W4 Withdraw refused once a filing is decided, in the screen's words; W5 close with
//     a reason, the header Closed; W6 reopen with a reason, back at its stage; W4b a case with nothing decided is
//     withdrawn on screen (date, reason): the header reads Withdrawn; W7 a case with an earlier-stage filing never
//     submitted: Close not offered, that filing named. The walk ends at the case list (the next step).
// The earlier stage of W7 is a fixture: a multi-stage Visitor visa route is not in the configured checkpoint, so an ended
// stage, its group and its filing are written in SQL (Sample rows) under session_replication_role = replica, which turns
// off the foreign keys and the stage triggers (trg_case_stage_forward, trg_case_stage_current, trg_filing_stage_current,
// trg_submission_group_stage_current, case_firm_fill, filing_record_only_corrected) for those rows; the earlier stage's
// application subject is a fresh id with no answer_subject row. The behaviour under test (Close not offered, the filing
// named) is still read on the product's own screen. Sample rows only; US$0, no model call; live AI off.
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j77 4477 start AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on && trap 'zsh studio/tools/isolated.sh j77 4477 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_77.ts j77 4477
import "reflect-metadata";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type Page } from "playwright";
import { PgCaseCount } from "../../api/src/case-count.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
// <name> <port>, as tests/journeys/walk.mjs and j_6.ts call a journey; the shared helpers read <port> <db>, so they get those.
const [NAME, PORT_ARG] = [process.argv[2] ?? "j77", process.argv[3] ?? "4477"];
process.argv[2] = PORT_ARG; process.argv[3] = `xr_studio_${NAME}`;
const { AUTHOR, DB, PORT, call, firms, inDays, needVisitorVisa, ok, openCase, prepare, readyToFile, rec, sql, yearsAgo } = await import("../../acceptance/lib/m3.ts");

if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, HEADED = process.env.HEADED === "1";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DB}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const one = (q: string) => (sql(q) ?? "").split("\n")[0].trim();
const staffApi = async (t: string | null, method: string, path: string, body?: unknown, actor?: string): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}), ...(actor ? { "x-actor": actor } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
async function signIn(firmKey: string, email: string): Promise<string> {
  const r = await staffApi(null, "POST", "/platform/session/local", { firmKey, email, secondStep: true });
  if (r.body?.token) return r.body.token as string;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on): ${r.body?.detail}`); process.exit(2);
}
const audit = (caseId: string) => (sql(`select action || '|' || actor from audit_event where entity = 'case' and entity_key = '${caseId}' and action in ('case.decision.recorded','case.closed','case.reopened','case.withdrawn') order by at, id`) ?? "").split("\n").filter(Boolean);

let failed = 0;
try {
  // ---------------------------------------------------------------------------------------------------- setup (Sample)
  if (!one(`select r.id from config_release r join combination c on c.id = r.combination_id where c.combination_key = 'vv.single' and r.status = 'RELEASED'`)) {
    const l = await call("POST", "/demo/load", { sample: "configured" }, AUTHOR);
    ok("J-77 setup: Demo › Load the configured checkpoint", l.status === 200 || l.status === 201, l.status);
  }
  const vv = needVisitorVisa(), f = await firms(), officer = f.officer ?? "user-O", rep = f.rep ?? "user-R";
  const R = await signIn("sample-firm", "representative@sample-firm.example.com");   // user-R: Owner and Case manager
  const S = await signIn("sample-solo", "representative@sample-solo.example.com");   // firm B's Owner
  const count = new PgCaseCount(db, "sample-firm"), active = async () => (await count.activeCounts()).individual;
  const a = await openCase(vv, [{ role: "principal", name: "Sample Client J77", dob: yearsAgo(41) }], { representative: rep, caseOfficers: [officer] });
  const ready = await readyToFile(a.id, rep);
  const fA = (await prepare(a.id, officer)).p?.filings[0]?.id, stageA = one(`select id from case_stage where case_id = '${a.id}' and state = 'CURRENT'`);
  ok("J-77 setup: a Visitor visa case for Sample Client J77 is Ready to file (C7.6)", ready.length === 1 && !!fA && !!stageA, { ready, fA });
  // Case C (DW1, W4b): its filing worked out but never submitted, nothing decided.
  const c = await openCase(vv, [{ role: "principal", name: "Sample Client J77 C", dob: yearsAgo(29) }], { representative: rep, caseOfficers: [officer] });
  await prepare(c.id, officer);
  ok("J-77 setup: case C has a filing, not submitted", one(`select count(*) from filing f where f.case_id = '${c.id}' and f.active and not exists (select 1 from filing_record r where r.filing_id = f.id)`) === "1");
  // Firm B's case (DW3): opened by firm B's own person.
  const bCase = await call("POST", "/runtime/cases", { combinationId: vv, clientActor: "user-Q", principal: { displayName: "Sample Client J77 B" } }, "user-S");
  ok("J-77 setup: firm B (Sample solo firm) has its own case", bCase.status === 201 && !!bCase.body?.id, bCase.status);

  // ---------------------------------------------------------------------------------------------------- the browser
  const b = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  const p = await ctx.newPage(); const errs: string[] = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(BASE); await p.evaluate((x) => { localStorage.setItem("xr-actor", x); sessionStorage.removeItem("xr-staff-session"); }, officer);
  const panel = p.locator("[data-case-decision]"), submission = p.locator("[data-submission]"), dialog = p.getByRole("dialog");
  const openCasePage = async (pg: Page, id: string) => { await pg.goto(`${BASE}/cases/${id}`); await pg.locator("[data-case-decision]").waitFor({ timeout: 60_000 }); };
  const asStaff = (pg: Page, t: string) => pg.evaluate((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_000_000 })), t);
  async function look(what: string, scope: string) {
    const v = (await new AxeBuilder({ page: p }).include(scope).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
    ok(`J-77 axe: ${what}: no WCAG 2.2 A/AA violation`, v.length === 0, v.map((x) => `${x.id}: ${x.nodes[0]?.target}`));
    ok(`J-77 1440 px: ${what}: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await p.setViewportSize({ width: 1024, height: 768 }); await p.waitForTimeout(200);
    ok(`J-77 1024 px: ${what}: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(150);
  }

  // ---- W1: the submission number and UCI, on the case page (Submission to IRCC, C8.2) ----------------------------------
  await openCasePage(p, a.id);
  await submission.getByRole("button", { name: "Record the submission…" }).click();
  await dialog.waitFor();
  await dialog.locator("[data-record-filing] input").first().fill("V300077001");
  await dialog.locator("[data-record-filing] input[type=date]").first().fill(inDays(0));
  await dialog.getByLabel("Sample Client J77’s UCI").fill("1177-0077");
  await look("the Record the submission dialog", "[role=dialog]");
  await dialog.getByRole("button", { name: "Record the submission", exact: true }).click();
  await dialog.waitFor({ state: "detached", timeout: 30_000 });
  ok("J-77 W1 pass: the case officer records the application number and the UCI on the case page; the filing is submitted",
    one(`select application_number from filing_record where filing_id = '${fA}'`) === "V300077001" && one(`select uci from filing_person_record where filing_id = '${fA}'`) === "1177-0077",
    [one(`select application_number from filing_record where filing_id = '${fA}'`), one(`select uci from filing_person_record where filing_id = '${fA}'`)]);

  // ---- the panel without a staff sign-in, then signed in inline ------------------------------------------------------
  await panel.locator("[data-decision-no-session]").waitFor({ timeout: 30_000 });
  ok("J-77 W2 pass: with no firm staff sign-in the panel offers the sign-in in place, no act", (await panel.locator("[data-act]").count()) === 0 && (await panel.locator("[data-sign-in-card]").count()) === 1);
  await panel.getByLabel("Firm key").fill("sample-firm"); await panel.getByLabel("Work email").fill("representative@sample-firm.example.com");
  await panel.getByRole("button", { name: "Sign in" }).click();
  await panel.locator("[data-act='decide']").waitFor({ timeout: 30_000 });
  const R2 = await p.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session")!).token as string);   // the one session of user-R now
  await look("the Decision and closing panel, a submitted filing", "[data-case-decision]");

  // ---- DW1: the buttons are the server's `can` --------------------------------------------------------------------------
  type Can = { decide: string[]; withdraw: boolean; close: boolean; reopen: boolean };
  const buttons = async (pn: ReturnType<Page["locator"]>) => ({ decide: await pn.locator("[data-act='decide']").count(), withdraw: await pn.locator("[data-act='withdraw']").count(), close: await pn.locator("[data-act='close']").count(), reopen: await pn.locator("[data-act='reopen']").count() });
  const read = await staffApi(R2, "GET", `/runtime/cases/${a.id}/decisions`);
  const offered = await buttons(panel);
  const dw1 = (can: Can, o: typeof offered) => o.decide === can.decide.length && o.withdraw === Number(can.withdraw) && o.close === Number(can.close) && o.reopen === Number(can.reopen);
  ok("J-77 DW1 pass: the panel offers exactly what the server's read lists in `can` (decide on the submitted filing, withdraw; no close, no reopen)", read.status === 200 && dw1(read.body.can, offered), [read.body?.can, offered]);
  // NR, on case C (its filing never submitted, nothing decided): the stand-in is a screen that trusts its own copy of the
  // state (the read's `can` replaced in the browser), so it offers Close the server does not list.
  const tab = await ctx.newPage(); tab.on("pageerror", (e) => errs.push(`tab: ${e.message}`));
  await tab.goto(BASE); await tab.evaluate((x) => localStorage.setItem("xr-actor", x), officer); await asStaff(tab, R2);
  const tabPanel = tab.locator("[data-case-decision]"), tabDialog = tab.getByRole("dialog");
  const routeErrs: string[] = [];
  await tab.route(`**/api/runtime/cases/${c.id}/decisions`, async (route) => {
    try { if (route.request().method() !== "GET") return await route.continue(); const r = await route.fetch(); const j = await r.json(); if (j?.can) j.can.close = true; await route.fulfill({ response: r, json: j }); }
    catch (e) { routeErrs.push(String((e as Error)?.message ?? e)); }
  });
  await openCasePage(tab, c.id);
  await tabPanel.locator("[data-act='close']").waitFor({ timeout: 30_000 });
  const readC = await staffApi(R2, "GET", `/runtime/cases/${c.id}/decisions`), standIn = await buttons(tabPanel);
  ok("J-77 DW1 NR: against the stand-in the judge fails: the self-trusting screen's buttons are not the server's `can` (it offers Close)", readC.status === 200 && readC.body.can.close === false && !dw1(readC.body.can, standIn), [readC.body?.can, standIn]);
  const nC = await active();
  await tabPanel.locator("[data-act='close']").click(); await tabDialog.locator("[data-act-text]").fill("Forced from a stale screen (Sample)");
  await tabDialog.getByRole("button", { name: "Close the case" }).click();
  await tabDialog.locator("[data-act-refusal]").waitFor({ timeout: 15_000 });
  const forced = await tabDialog.locator("[data-act-refusal]").innerText();
  ok("J-77 DW1 NR: and the API refuses it (409), shown in the screen's words with no rule number; the case stays open",
    forced === "Every filing needs a decision before the case is closed. Before any decision, withdraw the case." && !/AG-7|rule/i.test(forced) && one(`select status from runtime_case where id = '${c.id}'`) === "OPEN", forced);
  ok("J-77 DW4 NR: against the stand-in (a refused close on an active case, whose success would take it off) the judge fails: the count did not move", (await active()) === nC, { before: nC, now: await active() });
  await tabDialog.getByRole("button", { name: "Cancel" }).click(); await tab.unrouteAll({ behavior: "ignoreErrors" });
  ok("J-77 DW1: the stand-in's route ran without error", routeErrs.length === 0, routeErrs);

  // ---- W4b: case C (nothing decided) is withdrawn on screen with a date and a reason --------------------------------------
  await openCasePage(p, c.id); await panel.locator("[data-act='withdraw']").waitFor({ timeout: 30_000 });
  ok("J-77 DW1 pass: on case C the panel offers exactly the server's `can` (withdraw only: its filing is not submitted)", dw1((await staffApi(R2, "GET", `/runtime/cases/${c.id}/decisions`)).body.can, await buttons(panel)) && (await panel.locator("[data-act='withdraw']").count()) === 1);
  const cLines0 = audit(c.id).length;
  await panel.locator("[data-act='withdraw']").click(); await dialog.waitFor();
  await dialog.locator("[data-act-date]").fill(inDays(-2)); await dialog.locator("[data-act-text]").fill("The client withdrew before any decision (Sample)");
  await look("the Withdraw the case dialog", "[role=dialog]");
  await dialog.getByRole("button", { name: "Withdraw the case" }).click();
  await dialog.waitFor({ state: "detached", timeout: 30_000 });
  const cEnd = p.locator("[data-case-end-line='WITHDRAWN']"); await cEnd.waitFor({ timeout: 30_000 });
  ok("J-77 W4b pass: withdrawn, the header reads Withdrawn, with the withdrawal date and the reason",
    (await p.locator("[data-case-status-pill]").innerText()) === "Withdrawn" && (await cEnd.innerText()).includes("Reason: The client withdrew before any decision (Sample)") && /Withdrawn\s*Sample\s*on /.test(await cEnd.innerText()), await cEnd.innerText());
  ok("J-77 W4b data: the case is CLOSED WITHDRAWN with one WITHDRAWAL row dated as typed",
    one(`select status || '|' || close_outcome from runtime_case where id = '${c.id}'`) === "CLOSED|WITHDRAWN" && one(`select count(*) || '|' || min(decided_on::text) from case_decision where case_id = '${c.id}' and kind = 'WITHDRAWAL'`) === `1|${inDays(-2)}`);
  const staffRid = one(`select id from platform_staff where email = 'representative@sample-firm.example.com'`);
  ok("J-77 DW2 pass: the withdrawal wrote one audit line, case.withdrawn by staff:<the representative's id>", audit(c.id).slice(cLines0).join() === `case.withdrawn|staff:${staffRid}`, audit(c.id));
  ok("J-77 DW4 pass: the withdrawal took case C off the active count", (await active()) === nC - 1, { before: nC, now: await active() });
  await look("the case header, withdrawn", "main");
  await openCasePage(p, a.id);

  // ---- W4 (set up): a second tab holds Withdraw open while the decision is recorded ------------------------------------
  await openCasePage(tab, a.id);
  await tabPanel.locator("[data-act='withdraw']").click();
  await tab.getByRole("dialog").locator("[data-act-date]").fill(inDays(0)); await tab.getByRole("dialog").locator("[data-act-text]").fill("Client asked to withdraw (Sample)");

  // ---- W2: Approved (Sample), with the authority's date and a note --------------------------------------------------------
  const n0 = await active(), lines0 = audit(a.id).length;
  await panel.locator("[data-act='decide']").click(); await dialog.waitFor();
  await look("the Record a decision dialog", "[role=dialog]");
  await dialog.locator("[data-outcome-choice='APPROVED']").check();
  await dialog.locator("[data-act-date]").fill(inDays(-1));
  await dialog.locator("[data-act-text]").fill("Visa counterfoil received (Sample)");
  await dialog.getByRole("button", { name: "Record the decision" }).click();
  await dialog.waitFor({ state: "detached", timeout: 30_000 });
  await panel.locator("[data-latest-decision='APPROVED']").waitFor({ timeout: 30_000 });
  ok("J-77 W2 pass: Approved (Sample) is recorded with the authority's date and the note; the row says so, marked Sample",
    one(`select outcome || '|' || decided_on || '|' || note from case_decision where filing_id = '${fA}' order by recorded_at desc limit 1`) === `APPROVED|${inDays(-1)}|Visa counterfoil received (Sample)`
    && (await panel.locator("[data-decision-filing] [data-sample-mark]").count()) >= 1);

  // ---- W3: corrected to Refused (Sample); the earlier one stays in the history -------------------------------------------
  await panel.locator("[data-act='decide']").click(); await dialog.waitFor();
  ok("J-77 W3 pass: on a decided filing the act is Correct the decision, which keeps the earlier one", /This records a new decision\. The earlier one stays in the history\./.test(await dialog.innerText()));
  await dialog.locator("[data-outcome-choice='REFUSED']").check(); await dialog.locator("[data-act-date]").fill(inDays(0));
  await dialog.getByRole("button", { name: "Record the correction" }).click();
  await dialog.waitFor({ state: "detached", timeout: 30_000 });
  await panel.locator("[data-latest-decision='REFUSED']").waitFor({ timeout: 30_000 });
  await panel.locator("[data-decision-history-toggle]").click();
  const hist = await panel.locator("[data-decision-history]").innerText();
  ok("J-77 W3 pass: Refused (Sample) is the latest; 1 earlier decision opens the history in place, with who recorded each",
    one(`select count(*) from case_decision where filing_id = '${fA}' and kind = 'DECISION'`) === "2" && /Approved \(Sample\)/.test(hist) && /Refused \(Sample\)/.test(hist) && /recorded by Representative \(Sample\)/.test(hist), hist);
  await look("the panel with the decision history open", "[data-case-decision]");

  // ---- W4: Withdraw refused once a filing is decided, in the screen's words -----------------------------------------------
  ok("J-77 W4 pass: once a filing is decided the panel no longer offers Withdraw", (await panel.locator("[data-act='withdraw']").count()) === 0);
  await tab.getByRole("dialog").getByRole("button", { name: "Withdraw the case" }).click();
  await tab.getByRole("dialog").locator("[data-act-refusal]").waitFor({ timeout: 15_000 });
  ok("J-77 W4 fail: the Withdraw held open in another tab is refused in the screen's words; the case stays open",
    (await tab.getByRole("dialog").locator("[data-act-refusal]").innerText()) === "A filing has a decision, so the case cannot be withdrawn. Close it with a reason instead." && one(`select status from runtime_case where id = '${a.id}'`) === "OPEN");
  // A tab closed as it opens can hang: page.close() has no time limit (2 in 6,416 on a busy machine, CI run 45429673590).
  await tab.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
  if (await Promise.race([tab.close().then(() => "closed"), new Promise((f) => setTimeout(f, 15000, "late"))]) === "late") console.log("NOTE  j_77.ts: the new tab was not closed after 15 s; going on");

  // ---- DW2: every act writes one audit line by staff:<id> -----------------------------------------------------------------
  const staffR = one(`select id from platform_staff where email = 'representative@sample-firm.example.com'`);
  const after2 = audit(a.id).slice(lines0);
  const dw2 = (lines: string[], n: number) => lines.length === n && lines.every((l) => l.endsWith(`|staff:${staffR}`));
  ok("J-77 DW2 pass: the decision and its correction each wrote one audit line on the case, actor staff:<the representative's id>", dw2(after2, 2) && after2.every((l) => l.startsWith("case.decision.recorded")), after2);
  ok("J-77 DW4 pass: the decision took the case off the active count (every filing decided)", (await active()) === n0 - 1, { before: n0, now: await active() });
  const asPerson = await staffApi(null, "POST", `/runtime/cases/${a.id}/close`, { reason: "As the simulated person (Sample)" }, rep);
  ok("J-77 DW2 NR: against the stand-in (the simulated person's header, no session) the act is 401 and the judge fails: no line", asPerson.status === 401 && !dw2(audit(a.id).slice(lines0 + 2), 1), asPerson.status);


  // ---- W5: close with a reason; the header says Closed --------------------------------------------------------------------
  await panel.locator("[data-act='close']").click(); await dialog.waitFor();
  await dialog.locator("[data-act-text]").fill("Refusal explained to the client; file complete (Sample)");
  await look("the Close the case dialog", "[role=dialog]");
  await dialog.getByRole("button", { name: "Close the case" }).click();
  await dialog.waitFor({ state: "detached", timeout: 30_000 });
  const endLine = p.locator("[data-case-end-line]"); await endLine.waitFor({ timeout: 30_000 });
  const end = await endLine.innerText();
  ok("J-77 W5 pass: closed with the reason; the header reads Closed and the line gives how, when, the decision and the reason",
    (await p.locator("[data-case-status-pill]").innerText()) === "Closed" && /Closed by staff/.test(end) && /Decision: Refused/.test(end) && end.includes("Reason: Refusal explained to the client; file complete (Sample)"), end);
  await look("the case header and panel, closed", "main");
  ok("J-77 W5 data: the case row is CLOSED, CLOSED_BY_STAFF, with the reason and the stage it closed from",
    one(`select status || '|' || close_outcome || '|' || closed_reason || '|' || closed_from_stage from runtime_case where id = '${a.id}'`) === `CLOSED|CLOSED_BY_STAFF|Refusal explained to the client; file complete (Sample)|${stageA}`);
  ok("J-77 DW2 pass: the close wrote one more line by the same staff member", dw2(audit(a.id).slice(lines0 + 2), 1), audit(a.id).slice(lines0 + 2));
  ok("J-77 DW4 pass: closed, the case stays off the active count", (await active()) === n0 - 1, { before: n0, now: await active() });

  // ---- W6: reopen with a reason; back at its stage --------------------------------------------------------------------------
  const nClosed = await active();
  await panel.locator("[data-act='reopen']").click(); await dialog.waitFor();
  ok("J-77 W6 pass: Reopen says where the case goes back to", /The case goes back to /.test(await dialog.innerText()));
  await dialog.locator("[data-act-text]").fill("IRCC reconsideration requested (Sample)");
  await look("the Reopen the case dialog", "[role=dialog]");
  await dialog.getByRole("button", { name: "Reopen the case" }).click();
  await dialog.waitFor({ state: "detached", timeout: 30_000 });
  await endLine.waitFor({ state: "detached", timeout: 15_000 });
  const toast = await p.getByText(/^Reopened\. The case is back at /).first().innerText().catch(() => "");
  ok("J-77 W6 pass: reopened, the header is Open again with no closing line, and the case is at the stage it closed from",
    /Reopened\. The case is back at .+\./.test(toast) && (await p.locator("[data-case-status-pill]").count()) === 0 && (await p.locator("h1").innerText()).includes("Open") && one(`select status || '|' || coalesce(close_outcome, '') from runtime_case where id = '${a.id}'`) === "OPEN|" && one(`select state from case_stage where id = '${stageA}'`) === "CURRENT");
  ok("J-77 DW4 pass: reopening put the case back on the active count", (await active()) === nClosed + 1, { closed: nClosed, now: await active() });
  ok("J-77 DW2 pass: one line per act, in order, each by staff: decision, correction, close, reopen", audit(a.id).slice(lines0).map((l) => l.split("|")[0]).join() === "case.decision.recorded,case.decision.recorded,case.closed,case.reopened" && dw2(audit(a.id).slice(lines0), 4), audit(a.id));

  // ---- DW3: the firm is the session's ----------------------------------------------------------------------------------------
  const bRead = await staffApi(R2, "GET", `/runtime/cases/${bCase.body.id}/decisions`);
  const bHeader = await staffApi(R2, "GET", `/runtime/cases/${bCase.body.id}/decisions`, undefined, "user-S");
  const bOwn = await staffApi(S, "GET", `/runtime/cases/${bCase.body.id}/decisions`);
  ok("J-77 DW3 pass: firm A's session gets 404 on firm B's case; firm B's own session reads it (200)", bRead.status === 404 && bRead.body?.code === "NOT_FOUND" && bOwn.status === 200, [bRead.status, bOwn.status]);
  const dw3 = (r: Ans) => r.status === 404;   // the judge: firm A's caller does not reach firm B's case
  const standInB = await call("GET", `/runtime/cases/${bCase.body.id}`, undefined, "user-S");   // the stand-in: the firm named by the header
  ok("J-77 DW3 NR: against the stand-in (the simulated-person read, its firm taken from the header) the judge fails: 200 on firm B's case", standInB.status === 200 && !dw3(standInB), standInB.status);
  ok("J-77 DW3 break: firm A's session with firm B's person in the header is still 404, never B's rows", dw3(bHeader) && !JSON.stringify(bHeader.body).includes(bCase.body.id), bHeader.status);
  await p.evaluate((x) => localStorage.setItem("xr-actor", x), "user-S");
  await openCasePage(p, bCase.body.id);
  await panel.getByText("This case is not in the firm you are signed in to.").waitFor({ timeout: 30_000 });
  ok("J-77 DW3 pass (screen): on firm B's case page the panel says, in words, that the case is not in the signed-in firm; no act", (await panel.locator("[data-act]").count()) === 0);
  await look("the firm B notice in the panel", "[data-case-decision]");
  await p.evaluate((x) => localStorage.setItem("xr-actor", x), officer);

  // ---- W7: an earlier-stage filing never submitted keeps Close off and is named ----------------------------------------------
  const w = await openCase(vv, [{ role: "principal", name: "Sample Client J77 W", dob: yearsAgo(36) }], { representative: rep, caseOfficers: [officer] });
  await prepare(w.id, officer);
  const fW = one(`select id from filing where case_id = '${w.id}' and active order by created_at limit 1`);
  // Fixture: the current stage's filing recorded as submitted (C8.2's row), and an ended earlier stage with its own filing
  // that was never submitted (another combination, the Study permit's; Sample rows).
  sql(`set session_replication_role = replica;
    insert into filing_record (id, workspace_id, case_id, filing_id, submission_group_id, our_reference, submitted_on, application_number, prepared_by, recorded_by, filed_facts)
      select gen_random_uuid(), workspace_id, case_id, id, submission_group_id, 'SAMPLE-J77-W', current_date, 'V300077099', '${officer}', '${officer}', '[]' from filing where id = '${fW}';
    with s as (insert into case_stage (id, workspace_id, case_id, firm_key, ord, stage_key, staff_name, client_name, combination_id, state, application_subject_id, started_from)
        select gen_random_uuid(), workspace_id, id, firm_key, 0, 'earlier', 'Study permit (Sample, earlier stage)', 'Study permit', (select id from combination where combination_key = 'sp.outside'), 'ENDED_NEXT_STARTED', gen_random_uuid(), 'BEGIN' from runtime_case where id = '${w.id}' returning id, workspace_id, case_id),
      g as (insert into submission_group (id, workspace_id, case_id, kind, stage_id) select gen_random_uuid(), workspace_id, case_id, 'FAMILY', id from s returning id, workspace_id, case_id, stage_id)
    insert into filing (id, workspace_id, case_id, submission_group_id, subject_id, combination_key, mode, stage_id)
      select gen_random_uuid(), g.workspace_id, g.case_id, g.id, (select subject_id from filing where id = '${fW}'), 'sp.outside', 'files_own', g.stage_id from g`);
  await staffApi(R2, "POST", `/runtime/cases/${w.id}/decisions`, { filingId: fW, outcome: "APPROVED", decidedOn: inDays(0) });
  await openCasePage(p, w.id);
  await panel.locator("[data-decision-close-hint]").waitFor({ timeout: 30_000 });
  const hint = await panel.locator("[data-decision-close-hint]").innerText();
  ok("J-77 W7 pass: with an earlier-stage filing never submitted, Close is not offered; the panel counts 1 of 2 decided and names that filing",
    (await panel.locator("[data-act='close']").count()) === 0 && /1 of 2 decided/.test(hint) && /Not submitted yet: Sample Client J77 W \(Study permit \(Sample, earlier stage\)\)/.test(hint), hint);
  ok("J-77 W7 pass: the earlier stage's filing is a row of its own, marked as the earlier stage and Not submitted yet", /earlier stage/.test(await panel.innerText()) && (await panel.locator("[data-decision-filing]").count()) === 2);
  await look("the panel with an earlier-stage filing", "[data-case-decision]");

  // ---- the walk ends at the next step: the case list ----------------------------------------------------------------------------
  await p.goto(`${BASE}/cases`);
  const row = p.locator(`[data-case-row="${a.body?.case_number ?? one(`select case_number from runtime_case where id = '${a.id}'`)}"]`);
  await row.waitFor({ timeout: 30_000 });
  ok("J-77 end: the walk ends on the case list, where the reopened case is listed Open (the next step: its work goes on)", /Open/.test(await row.innerText()));
  await look("the case list", "main");
  ok("J-77: no error in the browser", errs.length === 0, errs);
  await b.close();
} catch (e) {
  ok("J-77: the walk ran to its end", false, String((e as Error)?.stack ?? e).slice(0, 600));
} finally {
  await db.$disconnect();
  failed = rec.summary();
}
process.exit(failed ? 1 : 0);
