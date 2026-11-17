// qa 17 Nov (/qa capability R1.77, map row 77 "Submission number and UCI; decision, close, reopen", Case side), after
// CS-C1a #1818 and CS-C1b #2002 merged (P-606). qa's own walk of the row's words on an isolated configured-checkpoint
// copy, as staff with the right keys (the local identity stand-in), checked underneath (rows, audit lines, outbox,
// active-case count):
//   1 the submission number and UCI recorded on a Ready-to-file Visitor visa filing (C8.2);
//   2 a decision on that submitted filing; 3 close with a reason; 4 reopen with a reason, back at the stage it closed
//   from, and the next step after reopen (a new decision, close again); 5 a different case withdrawn before any decision;
//   wrong roles (403), another firm (404), the active-case count (CS-C1b) at each step, and whether a person can do it
//   by screens (web/src calls none of the four routes: FAIL while that Gap is open).
// No model call, no Stripe call (US$0); live AI off. Never :4400. Run from prototype/:
//   zsh studio/tools/isolated.sh qa77a 4474 start --ttl 60 AI_LIVE=off PLATFORM_IDENTITY=local \
//     && trap 'zsh studio/tools/isolated.sh qa77a 4474 stop' EXIT \
//     && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_r177_case_decision.ts 4474 xr_studio_qa77a
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { AUTHOR, PORT, DB, call, firms, inDays, main, needVisitorVisa, ok, openCase, prepare, readyToFile, sql, yearsAgo } from "../../acceptance/lib/m3.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { PgCaseCount } from "../../api/src/case-count.ts";

const BASE = `http://localhost:${PORT}`, WEB = join(import.meta.dirname, "..", "..", "web", "src");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DB}`, options: "-c TimeZone=UTC" }) });
const staff = async (method: string, path: string, token: string | null, body?: unknown) => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: any = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b }; // eslint-disable-line @typescript-eslint/no-explicit-any
};
const signIn = async (firmKey: string, email: string) => (await staff("POST", "/platform/session/local", null, { firmKey, email, secondStep: true })).body?.token as string | undefined;
const one = (q: string) => (sql(q) ?? "").split("\n")[0].trim();
const audit = (caseId: string) => (sql(`select action || '|' || actor || '|' || coalesce(detail->>'reason', '') || '|' || coalesce(detail->>'closeOutcome', '') from audit_event where entity = 'case' and entity_key = '${caseId}' and action in ('case.decision.recorded','case.closed','case.reopened','case.withdrawn') order by at, id`) ?? "").split("\n").filter(Boolean);
const events = (caseId: string) => (sql(`select type || ':' || coalesce(payload->>'reason', '') || ':' || coalesce(payload->>'outcome', payload->>'previousOutcome', '') from module_event where subject_id = '${caseId}' order by seq`) ?? "").split("\n").filter(Boolean);
const count = new PgCaseCount(db, "sample-firm");
const individual = async () => (await count.activeCounts()).individual;
const today = inDays(0);

await main("R1.77", "submission number and UCI; decision, close, reopen (Case side)", async () => {
  if (!one(`select r.id from config_release r join combination c on c.id = r.combination_id where c.combination_key = 'vv.single' and r.status = 'RELEASED'`)) {
    const l = await call("POST", "/demo/load", { sample: "configured" }, AUTHOR);
    ok("setup: Demo › Load the configured checkpoint", l.status === 201 || l.status === 200, l.status);
  }
  const vv = needVisitorVisa();
  const seeded = await seedSampleFirms(db);
  ok("setup: the Sample firms' staff are on the copy (PF-3 seed)", seeded.unmatchedCaseFirmKeys.length === 0, seeded);
  const owner = await signIn("sample-firm", "representative@sample-firm.example.com");        // user-R: OWNER, CASE_MANAGER
  const manager = await signIn("sample-firm", "second.representative@sample-firm.example.com"); // user-T: CASE_MANAGER
  const officerT = await signIn("sample-firm", "user-o@sample-firm.example.com");              // user-O: CASE_OFFICER
  const solo = await signIn("sample-solo", "representative@sample-solo.example.com");          // another firm
  ok("setup: owner, case manager, case officer and another firm's owner sign in (local stand-in, second step)", !!owner && !!manager && !!officerT && !!solo, { owner: !!owner, manager: !!manager, officer: !!officerT, solo: !!solo });
  const keys = async (t?: string) => new Set<string>((await staff("GET", "/platform/me", t ?? null)).body?.keys ?? []);
  const [kO, kM, kC] = [await keys(owner), await keys(manager), await keys(officerT)];
  ok("setup: the owner and the case manager hold agent/case:record-decision and agent/case:reopen; the case officer neither",
    kO.has("agent/case:record-decision") && kO.has("agent/case:reopen") && kM.has("agent/case:record-decision") && kM.has("agent/case:reopen") && !kC.has("agent/case:record-decision") && !kC.has("agent/case:reopen"));

  // ---- 1 the submission number and UCI (C8.2) on case A ---------------------------------------------------------------
  const f = await firms(), off = f.officer ?? "user-O";
  const n0 = await individual();
  const a = await openCase(vv, [{ role: "principal", name: "Sample Client R177", dob: yearsAgo(40) }], { representative: f.rep, caseOfficers: [off] });
  const P = a.subjects["Sample Client R177"];
  ok("R1.77 count (CS-C1b): a newly opened case is active (+1 individual)", (await individual()) === n0 + 1, { before: n0, after: await individual() });
  const ready = await readyToFile(a.id, f.rep);
  let p = (await prepare(a.id, off)).p;
  const fA = p?.filings[0]?.id, gA = p?.groups[0]?.id;
  ok("C8.2 setup: case A's filing reaches Ready to file", ready.length === 1 && !!fA, ready);
  const early = await staff("POST", `/runtime/cases/${a.id}/decisions`, owner!, { filingId: fA, outcome: "APPROVED", decidedOn: today });
  ok("R1.77 fail: a decision on a filing not yet recorded as submitted is refused (409 NOT_SUBMITTED)", early.status === 409 && early.body?.code === "NOT_SUBMITTED", [early.status, early.body?.code]);
  const rec = await call("PATCH", `/runtime/groups/${gA}/record`, { version: p?.version, filings: [{ filing: fA, our_reference: "SAMPLE-R177-1", submitted_on: today, application_number: "V300177001", fee_receipt: "SAMPLE-RECEIPT" }], ucis: [{ subject: P, uci: "1177-0001" }] }, off);
  p = (await prepare(a.id, off)).p;
  ok("R1.77 / C8.2 pass: the submission is recorded with its application number (filing submitted, number shown)", rec.status === 200 && p?.filings[0]?.status === "submitted" && p.filings[0].number === "V300177001", [rec.status, p?.filings[0]?.status, p?.filings[0]?.number]);
  ok("R1.77 / C8.2 data: filing_record keeps the number and the portal; the UCI is on the person", one(`select application_number || '|' || portal from filing_record where filing_id = '${fA}'`) === "V300177001|APR_PORTAL" && one(`select uci from filing_person_record where filing_id = '${fA}' and subject_id = '${P}'`) === "1177-0001");

  // ---- 2 a decision on the submitted filing ---------------------------------------------------------------------------
  const dBody = { filingId: fA, outcome: "APPROVED", decidedOn: today, note: "IRCC approved (Sample)" };
  const asOfficer = await staff("POST", `/runtime/cases/${a.id}/decisions`, officerT!, dBody);
  ok("R1.77 fail: the case officer cannot record a decision (403 MISSING_PERMISSION)", asOfficer.status === 403 && asOfficer.body?.code === "MISSING_PERMISSION", [asOfficer.status, asOfficer.body?.code]);
  const noToken = await call("POST", `/runtime/cases/${a.id}/decisions`, dBody, off);
  ok("R1.77 fail: x-actor alone (no staff session) is refused (401)", noToken.status === 401, noToken.status);
  const other = await staff("POST", `/runtime/cases/${a.id}/decisions`, solo!, dBody);
  ok("R1.77 fail: another firm's owner gets 404 on this firm's case", other.status === 404, other.status);
  const badOutcome = await staff("POST", `/runtime/cases/${a.id}/decisions`, owner!, { ...dBody, outcome: "MAYBE" });
  ok("R1.77 fail: an outcome outside the list is refused on its field (400)", badOutcome.status === 400 && !!badOutcome.body?.fields?.outcome, badOutcome.body);
  const closeEarly = await staff("POST", `/runtime/cases/${a.id}/close`, owner!, { reason: "Done (Sample)" });
  ok("R1.77 fail: close before every filing has a decision is refused (409 NOT_DECIDED)", closeEarly.status === 409 && closeEarly.body?.code === "NOT_DECIDED", [closeEarly.status, closeEarly.body?.code]);
  const n1 = await individual();
  const dec = await staff("POST", `/runtime/cases/${a.id}/decisions`, owner!, dBody);
  ok("R1.77 pass: the owner records a decision on the submitted filing (201)", dec.status === 201 && dec.body?.decision?.outcome === "APPROVED" && dec.body?.everyFilingDecided === true, [dec.status, dec.body?.decision?.outcome]);
  ok("R1.77 data: one DECISION row on the filing, with the outcome, date and who recorded it", one(`select count(*) || '|' || max(outcome) || '|' || max(decided_on::text) || '|' || max(recorded_by) from case_decision where case_id = '${a.id}' and filing_id = '${fA}' and kind = 'DECISION'`).startsWith(`1|APPROVED|${today}|staff:`));
  ok("R1.77 count (CS-C1b): with every filing decided the case is no longer active (-1)", (await individual()) === n1 - 1, { before: n1, after: await individual() });
  const wdA = await staff("POST", `/runtime/cases/${a.id}/withdraw`, owner!, { reason: "Client changed plans (Sample)", withdrawnOn: today });
  ok("R1.77 fail: a case with a decision cannot be withdrawn (409 HAS_DECISION)", wdA.status === 409 && wdA.body?.code === "HAS_DECISION", [wdA.status, wdA.body?.code]);
  ok("R1.77 data: the C8.2 record is unchanged by the decision", one(`select application_number from filing_record where filing_id = '${fA}'`) === "V300177001");

  // ---- 3 close with a reason ----------------------------------------------------------------------------------------
  const stageBefore = one(`select id from case_stage where case_id = '${a.id}' and state = 'CURRENT'`);
  const closeOfficer = await staff("POST", `/runtime/cases/${a.id}/close`, officerT!, { reason: "Approved (Sample)" });
  ok("R1.77 fail: the case officer cannot close (403)", closeOfficer.status === 403, closeOfficer.status);
  const closeBlank = await staff("POST", `/runtime/cases/${a.id}/close`, manager!, { reason: "   " });
  ok("R1.77 fail: close with a blank reason is refused on the reason field (400 REASON_REQUIRED)", closeBlank.status === 400 && closeBlank.body?.code === "REASON_REQUIRED" && !!closeBlank.body?.fields?.reason, [closeBlank.status, closeBlank.body?.code]);
  const closed = await staff("POST", `/runtime/cases/${a.id}/close`, manager!, { reason: "Visa approved; file complete (Sample)" });
  ok("R1.77 pass: the case manager closes the case with a reason (200 CLOSED, CLOSED_BY_STAFF)", closed.status === 200 && closed.body?.case?.status === "CLOSED" && closed.body?.case?.closeOutcome === "CLOSED_BY_STAFF", [closed.status, closed.body?.case?.status]);
  ok("R1.77 data: the case row keeps the reason, the time and the stage it closed from", one(`select status || '|' || closed_reason || '|' || (closed_at is not null) || '|' || closed_from_stage from runtime_case where id = '${a.id}'`) === `CLOSED|Visa approved; file complete (Sample)|true|${stageBefore}`);
  const caseRead = await call("GET", `/runtime/cases/${a.id}`, undefined, off);
  ok("R1.77: the case read shows it closed (status CLOSED)", caseRead.body?.status === "CLOSED", caseRead.body?.status);
  const decClosed = await staff("POST", `/runtime/cases/${a.id}/decisions`, owner!, { ...dBody, outcome: "REFUSED" });
  ok("R1.77 fail: a closed case refuses a new decision (409 CASE_CLOSED)", decClosed.status === 409 && decClosed.body?.code === "CASE_CLOSED", [decClosed.status, decClosed.body?.code]);
  const nClosed = await individual();

  // ---- 4 reopen with a reason, back at the stage it closed from; the next step ------------------------------------------
  const reOfficer = await staff("POST", `/runtime/cases/${a.id}/reopen`, officerT!, { reason: "IRCC asked for more (Sample)" });
  ok("R1.77 fail: the case officer cannot reopen (403)", reOfficer.status === 403, reOfficer.status);
  const reNo = await staff("POST", `/runtime/cases/${a.id}/reopen`, owner!, {});
  ok("R1.77 fail: reopen with no reason is refused (400 REASON_REQUIRED)", reNo.status === 400 && reNo.body?.code === "REASON_REQUIRED", [reNo.status, reNo.body?.code]);
  const re = await staff("POST", `/runtime/cases/${a.id}/reopen`, owner!, { reason: "IRCC reconsideration request (Sample)" });
  ok("R1.77 pass: the owner reopens with a reason (200 OPEN), back at the stage it closed from", re.status === 200 && re.body?.case?.status === "OPEN" && re.body?.stageId === stageBefore && re.body?.currentStageId === stageBefore, [re.status, re.body?.case?.status, re.body?.stageId === stageBefore]);
  ok("R1.77 data: reopened, the closing fields are cleared and the stage is still CURRENT", one(`select status || '|' || (closed_at is null and closed_reason is null and close_outcome is null and closed_from_stage is null) from runtime_case where id = '${a.id}'`) === "OPEN|true" && one(`select state from case_stage where id = '${stageBefore}'`) === "CURRENT");
  ok("R1.77 count (CS-C1b): a reopened case is active again (+1)", (await individual()) === nClosed + 1, { closed: nClosed, reopened: await individual() });
  const reAgain = await staff("POST", `/runtime/cases/${a.id}/reopen`, owner!, { reason: "Again (Sample)" });
  ok("R1.77 fail: reopening an open case is refused (409 CASE_OPEN)", reAgain.status === 409 && reAgain.body?.code === "CASE_OPEN", [reAgain.status, reAgain.body?.code]);
  const dec2 = await staff("POST", `/runtime/cases/${a.id}/decisions`, manager!, { filingId: fA, outcome: "APPROVED", decidedOn: today, note: "Reconsideration upheld (Sample)" });
  ok("R1.77 next step: after reopen a new decision is recorded (201, a second row)", dec2.status === 201 && one(`select count(*) from case_decision where case_id = '${a.id}' and kind = 'DECISION'`) === "2", dec2.status);
  ok("R1.77 count (CS-C1b): the new decision since the reopen ends its activity again (-1)", (await individual()) === nClosed, await individual());
  const close2 = await staff("POST", `/runtime/cases/${a.id}/close`, owner!, { reason: "Reconsideration done (Sample)" });
  ok("R1.77 next step: the reopened case closes again (200 CLOSED)", close2.status === 200 && close2.body?.case?.status === "CLOSED", close2.status);
  const aLines = audit(a.id);
  ok("R1.77 audit: one line per step, each by a staff member, with its reason: decision, close, reopen, decision, close",
    aLines.map((l) => l.split("|")[0]).join(",") === "case.decision.recorded,case.closed,case.reopened,case.decision.recorded,case.closed" && aLines.every((l) => l.split("|")[1].startsWith("staff:"))
    && aLines[1].includes("Visa approved; file complete (Sample)") && aLines[2].includes("IRCC reconsideration request (Sample)"), aLines);
  ok("R1.77 audit: the reopen line keeps the old closing values (CLOSED_BY_STAFF)", one(`select (detail->>'closeOutcome') || '|' || (detail->>'closedReason') from audit_event where entity = 'case' and entity_key = '${a.id}' and action = 'case.reopened'`) === "CLOSED_BY_STAFF|Visa approved; file complete (Sample)");
  const aEv = events(a.id);
  ok("R1.77 outbox: case.closed, case.reopened, case.closed, once each", aEv.join(",") === "case.closed:DECISION:CLOSED_BY_STAFF,case.reopened::CLOSED_BY_STAFF,case.closed:DECISION:CLOSED_BY_STAFF", aEv);

  // ---- 5 withdraw a different case before any decision ----------------------------------------------------------------
  const nB0 = await individual();
  const b = await openCase(vv, [{ role: "principal", name: "Sample Client R177 B", dob: yearsAgo(35) }], { representative: f.rep, caseOfficers: [off] });
  ok("R1.77 count (CS-C1b): case B opens active (+1)", (await individual()) === nB0 + 1, await individual());
  const wOfficer = await staff("POST", `/runtime/cases/${b.id}/withdraw`, officerT!, { reason: "Client withdrew (Sample)", withdrawnOn: today });
  ok("R1.77 fail: the case officer cannot withdraw (403)", wOfficer.status === 403, wOfficer.status);
  const wNoDate = await staff("POST", `/runtime/cases/${b.id}/withdraw`, owner!, { reason: "Client withdrew (Sample)" });
  ok("R1.77 fail: withdraw without a date is refused on its field (400)", wNoDate.status === 400 && !!wNoDate.body?.fields?.withdrawnOn, wNoDate.body?.fields);
  const w = await staff("POST", `/runtime/cases/${b.id}/withdraw`, owner!, { reason: "Client withdrew before filing (Sample)", withdrawnOn: today });
  ok("R1.77 pass: the owner withdraws case B before any decision (200 CLOSED WITHDRAWN)", w.status === 200 && w.body?.case?.status === "CLOSED" && w.body?.case?.closeOutcome === "WITHDRAWN", [w.status, w.body?.case?.closeOutcome]);
  ok("R1.77 data: one WITHDRAWAL row (no filing) and the case keeps the withdrawal reason", one(`select count(*) || '|' || bool_and(filing_id is null) from case_decision where case_id = '${b.id}' and kind = 'WITHDRAWAL'`) === "1|true" && one(`select withdraw_reason from runtime_case where id = '${b.id}'`) === "Client withdrew before filing (Sample)");
  ok("R1.77 audit and outbox: case.withdrawn by staff with the reason; case.closed WITHDRAWAL", audit(b.id).join() === `case.withdrawn|${audit(b.id)[0]?.split("|")[1]}|Client withdrew before filing (Sample)|` && audit(b.id)[0]?.split("|")[1].startsWith("staff:") && events(b.id).join() === "case.closed:WITHDRAWAL:WITHDRAWN", [audit(b.id), events(b.id)]);
  ok("R1.77 count (CS-C1b): the withdrawn case no longer counts (-1)", (await individual()) === nB0, await individual());
  const reB = await staff("POST", `/runtime/cases/${b.id}/reopen`, manager!, { reason: "Client came back (Sample)" });
  ok("R1.77 next step: the withdrawn case reopens (200 OPEN) and counts again", reB.status === 200 && reB.body?.case?.status === "OPEN" && (await individual()) === nB0 + 1, [reB.status, await individual()]);

  // ---- the person's bar: by screens ------------------------------------------------------------------------------------
  const files = (d: string): string[] => readdirSync(d).flatMap((n) => { const x = join(d, n); return statSync(x).isDirectory() ? files(x) : /\.tsx?$/.test(n) ? [x] : []; });
  const callers = files(WEB).filter((x) => /cases\/\$\{[^}]+\}\/(decisions|withdraw|close|reopen)\b/.test(readFileSync(x, "utf8")));
  ok("R1.77 person (Gap): a staff person can record a decision, close, reopen or withdraw a case from a screen (web/src calls none of the four routes: API only today)", callers.length > 0, callers);
});
await db.$disconnect();
