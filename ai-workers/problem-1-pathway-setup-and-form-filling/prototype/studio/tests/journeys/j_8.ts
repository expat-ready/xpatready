// J-8 (map row 8, R1.8 "Audit trail nobody can edit"; P-728, brief build-lead-c-briefs/AUD-1m-2.md, joined in AUD-1m
// part 2b): the join-and-walk row. It adds no feature: it walks the audit trail AUD-1a (insert-only), AUD-1b (the adapter,
// firm walls) and AUD-1m parts 1, 2a and 2b (every case-side write through AuditPort) left on main, on an isolated copy of
// the running app (its own database and port, never :4400), through the API, the database and on screen.
//   DW1 one writer: a case action, a document action and a library action each write exactly one line, and no case-side
//       file writes audit_event directly (CW1's grep, here on the tree). NR: a planted direct write is caught.
//   DW2 typed actor and case id: each line carries the simulated person's word (or staff:<id>) and, for the case and
//       document actions, the case id; an act with no person is 401 and writes no line. NR: a stand-in direct line has
//       no case id and an untyped actor, and the judge refuses it.
//   DW3 insert-only: as the app's role xr_app, UPDATE on audit_event is refused (permission denied) and DELETE is refused
//       by the trigger. NR: the stand-in UPDATE leaves the row exactly as it was.
//   DW4 firm walls: a line naming another firm in this firm's request is refused (AUD-1b), and firm A's activity feed never
//       shows firm B's case lines. NR: a stand-in writer without the wall (a direct create) lets the line through.
//   DW5 transactions: an action that fails after its audit line rolls the line back. NR: a stand-in that writes the line
//       outside the transaction keeps it.
//   DW6 (R1.8, QA-594) before and after: firm A's Owner adds and renames an office (PF) and changes a person's phone (FO)
//       through the running app's routes; each line holds who, when and the values before and after in full (P-687), read
//       by AUD-4's reader as "field: old → new". NR: an ids-only line (as before R1.8) shows no change.
//   DW7 (R1.8, QA-595) case firm: the case lines carry their case's firm; firm B's request writing about firm A's case is
//       refused.
//   W1-W4 the walk (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run): the case officer opens a Sample
//       case, records an answer and moves a stage, and Activity shows both lines with who and when (W1); supplies a
//       document and Activity shows it (W2). Firm staff have no feed screen of their own (Activity is the configuration
//       people's; R1.88 is not built), so the lines are read on screen as the configuration author and the officer's own
//       feed (GET /activity) by API; the configuration author proposes a form's role and the approver approves it,
//       and Activity shows the line with before and after (W3); the walk ends at the case's page, the next capability's
//       first step (W4: R1.77's decision/close screen is not built, QA-502; R1.88, the firm audit view, is not built).
//       axe-core on each screen walked; 1024 and 1440 px with no sideways scroll.
// Sample rows only (the configured checkpoint); US$0, no model call.
//   zsh studio/tools/isolated.sh j8 4438 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j8 4438 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_8.ts j8 4438
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { chromium, type Page } from "playwright";
import { textPdf } from "../../acceptance/lib/fixtures.ts";
import { client, recorder, type Res } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j8", Number(process.argv[3] ?? 4438)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", ".."), API = join(STUDIO, "api", "src");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-8", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const urlOf = (user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${DBNAME}`;
process.env.DATABASE_URL = urlOf();   // the in-process adapter (DW4, DW5) writes to the copy's own database
const { ok, summary } = recorder();
const { call, sql } = client(PORT, DBNAME);
const run = Date.now().toString(36);
const OFFICER = "user-O", REP = "user-R", SOLO = "user-S", CLIENT = "user-P", AUTHOR = "user-A", APPROVER = "user-B";
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const psqlAs = (user: string, q: string) => execFileSync("/opt/homebrew/opt/postgresql@18/bin/psql", [urlOf(user), "-X", "-v", "ON_ERROR_STOP=1", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const errOf = (f: () => unknown) => { try { f(); return ""; } catch (e) { return String((e as { stderr?: string }).stderr ?? (e as Error).message); } };
type Line = { id: string; actor: string; action: string; entity: string; entity_key: string | null; case_id: string | null; summary: string; detail: Record<string, unknown> | null; at: string };
const lines = (where: string): Line[] => { const t = sql(`select coalesce(json_agg(x order by x.at), '[]') from (select id, actor, action, entity, entity_key, case_id, summary, detail, at from audit_event where ${where}) x`); return JSON.parse(t || "[]"); };
const count = () => Number(sql("select count(*) from audit_event"));

// ------------------------------------------------------------------------------------------------ setup (Sample)
const served = (await call("GET", "/session", undefined, AUTHOR)).body?.workspace?.id;
if (!served || sql(`select id from workspace where id=${lit(served)}`) !== served) { console.error(`STOP  the database ${DBNAME} is not the one the server on port ${PORT} uses.`); process.exit(2); }
if (process.argv[4] !== "loaded") {
  await call("POST", "/demo/reset", { confirm: "RESET" }, AUTHOR);
  const l = await call("POST", "/demo/load", { sample: "configured" }, AUTHOR);
  if (l.status >= 300) { console.error("STOP  the configured checkpoint did not load", l.body); process.exit(2); }
}
type Openable = { combination_id: string; startable: boolean; stage?: { route: string; earlier: unknown[] } };
const rows = ((await call("GET", "/runtime/openable", undefined, REP)).body ?? []) as Openable[];
const later = rows.find((r) => r.startable && r.stage && r.stage.earlier.length > 0);
const firstKey = later?.stage ? sql(`select (stages->0->>'combination_key') from route where key=${lit(later.stage.route)}`) : null;
const first = rows.find((r) => r.startable && !r.stage && sql(`select combination_key from combination where id=${lit(r.combination_id)}`) === firstKey);
const opened = first ? await call("POST", "/runtime/cases", { combinationId: first.combination_id, reference: `J8-${run}`, clientActor: CLIENT, principal: { displayName: "Sample Client J8" }, representative: REP, caseOfficers: [OFFICER] }, REP) : null;
const CASE: string = opened?.body?.id ?? "";
const principal: string = (opened?.body?.people ?? []).find((p: { role: string }) => p.role === "principal")?.subject_id ?? "";
ok("J-8 setup: the configured checkpoint is loaded and a Sample case on the first stage of a two-stage route is open, with the case officer on its team", opened?.status === 201 && !!CASE && !!principal && !!later, { status: opened?.status, later: later?.stage?.route });
if (!CASE) { summary(); process.exit(1); }
// Firm B's case (the Sample solo firm), for DW4's wall.
const vv = sql("select id from combination where combination_key='vv.single'");
const openedB = await call("POST", "/runtime/cases", { combinationId: vv, reference: `J8B-${run}`, clientActor: "user-Q", principal: { displayName: "Sample Client J8B" } }, SOLO);
const CASE_B: string = openedB.body?.id ?? "";
ok("J-8 setup: firm B (the Sample solo firm) has its own Visitor visa case", openedB.status === 201 && !!CASE_B, openedB.status);

// ------------------------------------------------------------------------- the three actions (the walk's own, by API)
const answer = (caseId: string, subject: string, fact: string, value: unknown, actor: string | null): Promise<Res> => call("PUT", `/runtime/cases/${caseId}/answers/${subject}/${fact}`, { value, expectedId: null }, actor);
const upload = async (lineId: string, name: string, actor: string | null) => {
  // CS-D1t (R1.67, on main): a PDF that does not open is refused as damaged, so the Sample document is a well-formed PDF.
  const fd = new FormData(); fd.append("file", new Blob([new Uint8Array(textPdf([`Sample synthetic document ${name}`]))]), name);
  const res = await fetch(`${BASE}/api/runtime/checklist-lines/${lineId}/documents`, { method: "POST", headers: actor ? { "x-actor": actor } : {}, body: fd }).catch(() => null);
  return res?.status ?? 0;
};
const checklistLines = async (id: string) => { const out: { id: string; document_type?: string; state?: string }[] = []; const walk = (x: unknown) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") { const o = x as Record<string, unknown>; if (typeof o.id === "string" && "document_type" in o && "state" in o) out.push(o as never); Object.values(o).forEach(walk); } }; walk((await call("GET", `/runtime/cases/${id}/checklist`, undefined, OFFICER)).body); return out; };

// Case action 1: an answer.
let n0 = count();
const FAMILY = `Samplefamily${run}`;
const ans = await answer(CASE, principal, "person.family_name", FAMILY, OFFICER);
const answerLines = lines(`case_id = ${lit(CASE)} and action = 'answered' and summary like '%person.family_name%'`);
const nAnswer = count() - n0;
// Document action: supply a document on the case's checklist.
await call("GET", `/runtime/cases/${CASE}/prepare`, undefined, OFFICER);
const docLine = (await checklistLines(CASE)).find((l) => /passport/i.test(String(l.document_type))) ?? (await checklistLines(CASE))[0];
n0 = count();
const up = docLine ? await upload(docLine.id, "sample-passport-j8.pdf", OFFICER) : 0;
const nDoc = count() - n0;
const docLines = lines(`case_id = ${lit(CASE)} and at >= now() - interval '10 minutes' and entity ilike '%document%'`);
// Case action 2: move to the next stage.
const st = (await call("GET", `/runtime/cases/${CASE}/stages`, undefined, OFFICER)).body as { current: string; stages: { id: string; version: number }[] } | null;
const cur = st?.stages.find((s) => s.id === st.current);
const stagesBefore = lines(`case_id = ${lit(CASE)}`).length;
const go = cur ? await call("POST", `/runtime/cases/${CASE}/stages/next`, { from_stage: cur.id, stage_version: cur.version, reason: "J-8 walk (Sample)" }, OFFICER) : null;
const stageLines = lines(`case_id = ${lit(CASE)}`).slice(stagesBefore);
// Library action: a form's role, proposed by the configuration author and approved by the approver (form-library.ts and
// lifecycle.ts, both moved to AuditPort in AUD-1m part 2b).
const form = sql("select form_key from gov_form_def where form_kind = 'data_form' and form_role is null and retired_at is null order by form_key limit 1");
n0 = count();
const proposed = form ? await call("POST", `/library/forms/${encodeURIComponent(form)}/role`, { role: "family_information", reason: "Sample: J-8 walk" }, AUTHOR) : null;
const nPropose = count() - n0;
n0 = count();
const approved = proposed?.body?.id ? await call("POST", `/library/changes/${proposed.body.id}/approve`, { note: "Sample: J-8 walk" }, APPROVER) : null;
const nApprove = count() - n0;
const libLines = form ? lines(`entity = 'form' and entity_key = ${lit(form)} and action in ('proposed', 'approved')`) : [];

// ------------------------------------------------------------------------------------------------- DW1: one writer
const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? files(join(d, x.name)) : x.name.endsWith(".ts") ? [join(d, x.name)] : []));
const ADAPTER = "platform/audit/audit-event.ts", PLATFORM_LEFT: string[] = []; // AUD-1m part 2c: only the adapter writes
const directWriters = (tree: Record<string, string>) => Object.entries(tree).filter(([f, t]) => f !== ADAPTER && t.includes("auditEvent.create")).map(([f]) => f).sort();
const tree = Object.fromEntries(files(API).map((f) => [relative(API, f), readFileSync(f, "utf8")]));
const oneWriter = (t: Record<string, string>) => JSON.stringify(directWriters(t)) === JSON.stringify(PLATFORM_LEFT);
// The approval writes two lines, as before AUD-1m: the decision on the change (screen02.ts, Audit.log) and the role applied
// (lifecycle.ts applyRole), each one through the adapter.
ok("J-8 DW1 pass: the case action (an answer), the document action (a supply) and the library action (a form role proposed) each wrote exactly one line; the approval its two (the decision and the role applied)",
  ans.status < 300 && nAnswer === 1 && answerLines.length === 1 && up === 201 && nDoc === 1 && nPropose === 1 && nApprove === 2 && libLines.length === 2,
  { ans: ans.status, nAnswer, up, nDoc, propose: proposed?.status, nPropose, approve: approved?.status, nApprove, lib: libLines.length });
ok("J-8 DW1 pass: no case-side file writes audit_event directly: every case and configuration line goes through the adapter (only the adapter writes)", oneWriter(tree), directWriters(tree));
ok("J-8 DW1 NR: a stand-in direct write in a case file is caught by the same judge", !oneWriter({ ...tree, "case-close.ts": `${tree["case-close.ts"]}\nawait tx.auditEvent.create({ data })` }));

// ------------------------------------------------------------------------------- DW2: typed actor and case id
const TYPED = /^(?:(?:staff|person|system|seed):[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}|user-[ABCORTSPQ])$/;
const typedWithCase = (l: Line | undefined, caseId: string) => !!l && TYPED.test(l.actor) && l.case_id === caseId;
ok("J-8 DW2 pass: the answer's and the document's lines carry the case officer's word and the case id; the library lines carry the configuration people's words and no case",
  typedWithCase(answerLines[0], CASE) && answerLines[0].actor === OFFICER && docLines.length >= 1 && docLines.every((l) => typedWithCase(l, CASE))
  && libLines.map((l) => l.actor).join(",") === `${AUTHOR},${APPROVER}` && libLines.every((l) => l.case_id === null), { answer: answerLines[0], doc: docLines.map((l) => [l.actor, l.case_id]), lib: libLines.map((l) => [l.actor, l.case_id]) });
n0 = count();
const anon = await answer(CASE, principal, "person.given_name", "Sample", null);
const anonUp = docLine ? await upload(docLine.id, "sample-anon.pdf", null) : 401;
ok("J-8 DW2 fail: an answer and an upload with no person are 401 and write no line", anon.status === 401 && anonUp === 401 && count() === n0, { anon: anon.status, anonUp, lines: count() - n0 });
// The stand-in: a line written straight to the table, as the case-side writers did before AUD-1m (no case id, a bare word).
const standId = psqlAs("xr_studio", `insert into audit_event (id, workspace_id, actor, action, entity, entity_key, summary) values (gen_random_uuid(), ${lit(served)}, 'system', 'answered', 'case fact', 'j8-stand-in', ${lit(`x on case ${CASE.slice(0, 8)}`)}) returning id`).split("\n")[0];
ok("J-8 DW2 NR: the stand-in direct line has no case id and a bare actor word, and the same judge refuses it", !typedWithCase(lines(`id = ${lit(standId)}`)[0], CASE), lines(`id = ${lit(standId)}`)[0]);

// -------------------------------------------------------------------------------------------- DW3: insert-only
const target = answerLines[0]?.id ?? standId;
const snap = () => sql(`select actor || '|' || action || '|' || summary || '|' || coalesce(case_id::text, '') from audit_event where id = ${lit(target)}`);
const s0 = snap();
const upd = errOf(() => psqlAs("xr_app", `update audit_event set summary = 'changed by J-8' where id = ${lit(target)}`));
const del = errOf(() => psqlAs("xr_app", `delete from audit_event where id = ${lit(target)}`));
ok("J-8 DW3 pass: as the app's role xr_app, an UPDATE of a line is refused (permission denied) and a DELETE is refused by the trigger", /permission denied for table audit_event/.test(upd) && /audit lines are never changed or deleted/.test(del), { upd: upd.slice(0, 160), del: del.slice(0, 160) });
ok("J-8 DW3 NR: the stand-in UPDATE (and the DELETE) left the row exactly as it was", snap() === s0 && !!s0, { s0, now: snap() });

// ----------------------------------------------------------------------------------------------- DW4: firm walls
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(), options: "-c TimeZone=UTC" }) });
const { auditEvent, AuditRefused } = await import("../../api/src/platform/audit/audit-event.ts");
const { requestScope } = await import("../../api/src/platform/observability/log.ts");
const { Audit } = await import("../../api/src/core.ts");
const firmA = sql("select id from platform_firm where key = 'sample-firm'"), firmB = sql("select id from platform_firm where key = 'sample-solo'");
const inFirm = <T>(firm: string, fn: () => Promise<T>) => requestScope.run({ correlationId: `j8-${run}`, firmId: () => firm }, fn);
const entryB = { firmId: firmB, actor: "system:j8", action: "j8.wall", entity: "platform_firm", entityKey: `j8-wall-${run}`, summary: "J-8: a line naming another firm" };
let refused = false;
try { await inFirm(firmA, () => db.$transaction((tx) => auditEvent.record(tx, entryB))); } catch (e) { refused = e instanceof AuditRefused; }
const wallLines = () => Number(sql(`select count(*) from audit_event where entity_key = 'j8-wall-${run}'`));
ok("J-8 DW4 pass: in firm A's request, a line naming firm B is refused by the adapter and nothing is written", !!firmA && !!firmB && refused && wallLines() === 0, { firmA, firmB, refused });
await answer(CASE_B, (openedB.body?.people ?? []).find((p: { role: string }) => p.role === "principal")?.subject_id ?? "", "person.family_name", `Samplesolo${run}`, SOLO);
const feedA = ((await call("GET", "/activity", undefined, OFFICER)).body ?? []) as Line[];
const feedB = ((await call("GET", "/activity", undefined, SOLO)).body ?? []) as Line[];
const namesB = (l: Line) => l.case_id === CASE_B || l.summary.toLowerCase().includes(CASE_B.slice(0, 8));
ok("J-8 DW4 pass: firm A's activity feed shows its own case's lines and never firm B's; firm B's shows its own and never firm A's",
  feedA.some((l) => l.id === answerLines[0]?.id) && !feedA.some(namesB) && feedB.some(namesB) && !feedB.some((l) => l.case_id === CASE), { a: feedA.length, b: feedB.length });
// The stand-in: a writer without the wall (a direct create, as before AUD-1b) lets firm B's line into firm A's request.
const ws = sql("select id from workspace where key = 'platform-audit'") || served;
await inFirm(firmA, () => db.$transaction((tx) => tx.auditEvent.create({ data: { workspaceId: ws, firmId: firmB, actor: entryB.actor, action: entryB.action, entity: entryB.entity, entityKey: entryB.entityKey, summary: entryB.summary } }))).catch(() => undefined);
ok("J-8 DW4 NR: the stand-in writer without the wall writes firm B's line in firm A's request (the judge 'nothing written' fails on it)", wallLines() === 1, wallLines());

// ---------------------------------------------------------------------------------------------- DW5: transactions
const key5 = `j8-rollback-${run}`;
await db.$transaction(async (tx) => { await new Audit(tx as never).log(served, OFFICER, "answered", "case fact", key5, `J-8 on case ${CASE.slice(0, 8)}`); throw new Error("the action fails after its line"); }).catch(() => undefined);
ok("J-8 DW5 pass: an action that fails after its audit line rolls the line back with it", Number(sql(`select count(*) from audit_event where entity_key = '${key5}'`)) === 0);
const key5b = `j8-outside-${run}`;
await db.$transaction(async () => { await new Audit(db as never).log(served, OFFICER, "answered", "case fact", key5b, `J-8 on case ${CASE.slice(0, 8)}`); throw new Error("the action fails after its line"); }).catch(() => undefined);
ok("J-8 DW5 NR: the stand-in writing the line outside the action's transaction keeps it (the judge 'rolled back' fails on it)", Number(sql(`select count(*) from audit_event where entity_key = '${key5b}'`)) === 1);

// ------------------------------------------------------------------- DW6 (R1.8, QA-594): PF and FO writes, before and after
// Firm A's Owner signs in on the copy (local identity) and makes one platform write (adds an office, then renames it) and
// one front-office write (a person's phone), through the running app's own routes. Each line holds who, when and the
// values before and after in full, personal values included (P-687), and AUD-4's reader shows them as "field: old → new".
const tokenOf = async (firmKey: string, actorId: string) => ((await (await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, actorId, secondStep: true }) })).json()) as { token?: string }).token ?? "";
const pf = async (tok: string, method: string, path: string, body?: unknown) => { const r = await fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) as any }; };
const owner = await tokenOf("sample-firm", REP), ownerId = sql(`select id from platform_staff where firm_id = ${lit(firmA)} and actor_id = ${lit(REP)}`);
const officeName = `Sample office J8 ${run}`, renamed = `Sample office J8 ${run} (renamed)`;
const added = await pf(owner, "POST", "/platform/offices", { name: officeName });
const officeId: string = added.body?.office?.id ?? "";
const changed = officeId ? await pf(owner, "PATCH", `/platform/offices/${officeId}`, { name: renamed, version: added.body?.office?.version }) : null;
const officeLines = lines(`entity = 'platform_office' and entity_key = ${lit(officeId)}`);
const addLine = officeLines.find((l) => l.action === "platform.office.add"), changeLine = officeLines.find((l) => l.action === "platform.office.change");
const { changesOf } = await import("../../api/src/platform/audit/firm-read/render.ts");
ok("J-8 DW6 pass (PF): the Owner adds an office and renames it; the add's line holds the name after (no before), the change's line the name before and after, each with who (the Owner) and when, and AUD-4's reader shows \"name: old → new\"",
  added.status < 300 && changed?.status === 200 && addLine?.detail?.name_after === officeName && !("name_before" in (addLine?.detail ?? {}))
  && changeLine?.detail?.name_before === officeName && changeLine?.detail?.name_after === renamed && changeLine?.actor === `staff:${ownerId}` && !!changeLine?.at
  && changesOf(changeLine?.detail).some((c) => c.words === `name: ${officeName} → ${renamed}`), { added: added.status, changed: changed?.status, add: addLine?.detail, change: changeLine?.detail });
const PERSON = psqlAs("xr_studio", `insert into fo_person (id, firm_id, created_by, updated_at, phone) values (gen_random_uuid(), ${lit(firmA)}, 'seed:j8', now(), '+14165550100') returning id`).split("\n")[0];
const phoned = await pf(owner, "PATCH", `/front-office/people/${PERSON}`, { phone: "+1 416 555 0199" });
const phoneLine = lines(`entity = 'fo_person' and entity_key = ${lit(PERSON)} and action = 'front_office.person.phone_changed'`)[0];
ok("J-8 DW6 pass (FO): the Owner changes a person's phone; the line holds the number before and after in full (P-687), who and when",
  phoned.status === 200 && phoneLine?.detail?.phone_before === "+14165550100" && phoneLine?.detail?.phone_after === "+14165550199" && phoneLine?.actor === `staff:${ownerId}` && !!phoneLine?.at, { phoned: phoned.status, body: phoned.status === 200 ? undefined : phoned.body, line: phoneLine?.detail });
// NR: a writer that leaves before and after out (the line as it was before this row) fails the same judge.
const bare = { ...phoneLine, detail: { foPersonId: PERSON, staffId: ownerId, firmId: firmA } } as Line;
ok("J-8 DW6 NR: the stand-in line with ids only (the phone edit's line before R1.8) shows no change, so the judge fails on it", changesOf(bare.detail).length === 0 && bare.detail?.phone_before === undefined);

// ------------------------------------------------------------------ DW7 (R1.8, QA-595): a case line carries its firm
const firmOf = (l: Line | undefined) => (l ? sql(`select coalesce(firm_id::text, '-') from audit_event where id = ${lit(l.id)}`) : "");
const lineB = lines(`case_id = ${lit(CASE_B)} and action = 'answered'`)[0];
ok("J-8 DW7 pass: the officer's answer on firm A's case and firm B's answer on its own case carry their case's firm (QA-595), with no firm named by the case routes",
  firmOf(answerLines[0]) === firmA && firmOf(stageLines[0]) === firmA && firmOf(docLines[0]) === firmA && firmOf(lineB) === firmB, { a: firmOf(answerLines[0]), stage: firmOf(stageLines[0]), doc: firmOf(docLines[0]), b: firmOf(lineB) });
const key7 = `j8-case-wall-${run}`;
let caseRefused = false;
try { await inFirm(firmB, () => db.$transaction((tx) => auditEvent.record(tx, { workspaceId: served, actor: "system:j8", action: "answered", entity: "case fact", entityKey: key7, summary: "J-8: firm B writes about firm A's case", caseId: CASE }))); } catch (e) { caseRefused = e instanceof AuditRefused; }
ok("J-8 DW7 fail: in firm B's request, a case line about firm A's case is refused and nothing is written (the wall on the case side)", caseRefused && Number(sql(`select count(*) from audit_event where entity_key = '${key7}'`)) === 0, caseRefused);
await db.$disconnect();

// ----------------------------------------------------------------------------------------------------- the walk
ok("J-8 W1 setup: the stage moved (one stage line at least, every one with the case id and the officer's word)", go?.status === 201 && stageLines.length >= 1 && stageLines.every((l) => l.case_id === CASE && l.actor === OFFICER), { go: go?.status, body: go?.status === 201 ? undefined : go?.body, lines: stageLines.map((l) => [l.action, l.entity]) });
const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const axeClean = async (page: Page, where: string) => { const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze(); ok(`J-8 axe: ${where} has no WCAG A/AA violation`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes.length}`)); };
const noSideways = async (page: Page, where: string) => { for (const w of [1024, 1440]) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(200); const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(`J-8 ${where} at ${w} px: no sideways scroll`, sw <= 1, sw); } };
const as = async (actor: string) => { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addInitScript((a) => { try { localStorage.setItem("xr-actor", a); } catch { /* private window */ } }, actor); return ctx.newPage(); };
const rowOf = (page: Page, text: string) => page.locator("tr", { hasText: text }).first();
try {
  // Firm staff have no screen for their firm's case feed (GET /activity answers them by API; Activity on screen is the
  // configuration people's, and R1.88, the firm's own audit view, is not built): the lines are read on screen as the
  // configuration author, who reads every line, and the officer's own feed is read through the API with the same lines.
  const officerFeed = ((await call("GET", "/activity", undefined, OFFICER)).body ?? []) as (Line & { who: string })[];
  const inFeed = (l: Line | undefined) => !!l && officerFeed.some((f) => f.id === l.id && f.who === "Case officer" && !!f.at);
  ok("J-8 W1/W2 (API): the case officer's own feed (GET /activity) holds the answer's, the stage's and the document's lines, with who and when", inFeed(answerLines[0]) && inFeed(stageLines[0]) && inFeed(docLines[0]), officerFeed.length);
  const officerPage = await as(OFFICER);
  await officerPage.goto(`${BASE}/activity`); await officerPage.getByText("This page is for the configuration people").waitFor();
  ok("J-8 W1 note: firm staff have no Activity screen of their own (the page sends them to their cases); R1.88, the firm's audit view, is not built", true);
  await officerPage.close();
  const page = await as(AUTHOR);
  await page.goto(`${BASE}/activity`); await page.getByRole("heading", { name: "Activity" }).waitFor();
  await page.locator("tbody tr").first().waitFor();
  const aRow = rowOf(page, `answered person.family_name on case ${CASE.slice(0, 8)}`);
  const aWords = await aRow.innerText().catch(() => "");
  const stageWords = stageLines[0] ? await rowOf(page, stageLines[0].summary.slice(0, 60)).innerText().catch(() => "") : "";
  const when = /\d{1,2}:\d{2}|\d{4}|\bago\b|today/i;
  ok("J-8 W1: Activity shows the answer's line and the stage's line, each with who (Case officer) and when", /Case officer/.test(aWords) && when.test(aWords) && /Case officer/.test(stageWords) && when.test(stageWords), { aWords: aWords.slice(0, 200), stageWords: stageWords.slice(0, 200) });
  const docWords = docLines[0] ? await rowOf(page, docLines[0].summary.slice(0, 60)).innerText().catch(() => "") : "";
  ok("J-8 W2: the document the officer supplied on the case shows on Activity with who and when", /Case officer/.test(docWords) && when.test(docWords), docWords.slice(0, 200));
  await page.screenshot({ path: join(SHOTS, "w1-w2-activity.png"), fullPage: false });
  await axeClean(page, "Activity"); await noSideways(page, "Activity");
  const cfg = page;
  const prop = libLines.find((l) => l.action === "proposed"), appr = libLines.find((l) => l.action === "approved");
  const propWords = prop ? await rowOf(cfg, prop.summary.slice(0, 60)).innerText().catch(() => "") : "";
  const apprWords = appr ? await rowOf(cfg, appr.summary.slice(0, 60)).innerText().catch(() => "") : "";
  ok("J-8 W3: the configuration trail shows the form's role change with before and after (\"… (was …)\" on screen; from and to on the line), and who approved it",
    /Configuration author/.test(propWords) && /\(was /.test(propWords) && /Approver/.test(apprWords) && prop?.detail?.to === "family_information" && "from" in (prop?.detail ?? {}) && appr?.detail?.to === "family_information",
    { propWords: propWords.slice(0, 220), apprWords: apprWords.slice(0, 160), detail: prop?.detail });
  await cfg.screenshot({ path: join(SHOTS, "w3-activity-library.png"), fullPage: false });
  // W4: the next capability's first step. R1.77's decision/close screen is not built (QA-502); R1.88, the firm's own audit
  // view, is not built (this row does not build it). The walk ends on the case's own page.
  const casePage = await as(OFFICER);
  await casePage.goto(`${BASE}/cases/${CASE}`); await casePage.waitForLoadState("networkidle");
  const title = await casePage.locator("h1").first().innerText().catch(() => "");
  ok("J-8 W4: the walk ends at the case's own page as its officer, the next capability's first step (R1.77's close screen and R1.88's audit view are not built)", title.length > 0, title);
  await casePage.screenshot({ path: join(SHOTS, "w4-case-page.png"), fullPage: false });
  await axeClean(casePage, "the case's page"); await noSideways(casePage, "the case's page");
} finally { await browser.close(); }

process.exit(summary() ? 1 : 0);
