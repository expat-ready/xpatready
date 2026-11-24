// CS-D6 part 1 (R1.69, map row 69; brief design/briefs/CS-D6.md part 1): who read a stored case document, and whether its
// file is still the one uploaded. Requirement text: AG-9-32 (every read writes an access record, in the one audit trail),
// AG-9-24 (every preview audited), AG-9-31 (SHA-256 per file; a mismatch flags it), AG-9-53 (only those who can see the
// case). Each rule has a passing and a failing case:
//   DW1  a download (and a preview, once CS-D5's route is on this copy) adds one line naming the right person, listed for
//        that document only; a refused download adds none
//   DW2  without agent/document:view-access-log (Case officer, Case manager) the list is 403; with no session 401; the
//        Owner gets it; the other Sample firm's Owner gets 404 in the words of an unknown id; 51 lines page as 50 + 1,
//        newest first, no line twice; a cursor the list did not give is 400; a person holding the key but not the case
//        (no agent/case:view.all, not on the case's team, not its file owner: caseScope, AG-9-53) gets 404 on both routes
//   DW3  "Check the file is unchanged" on the stored file answers unchanged and writes "checked unchanged"; after the
//        stored bytes are altered on disk it answers changed and writes "found changed"; another firm gets 404 and
//        writes nothing
//   DW4  (part 2) "Documents past their keep period", with the Sample firm's 6 years: a case closed 6 years ago today (the
//        firm's date) is listed, one closed a day later is not, an open case never is, a reopened case is not; a firm
//        with no number gets an empty list and the words; a cursor the list did not give is 400
//   DW5  (part 2) another firm's closed cases never appear; a person with the key but not the case does not see it; no
//        session 401, the Case officer (no agent/document:dispose) 403; the answer holds no document name
//   DW6  (part 2) the weekly reminder on the fake clock (FakeClock, fakeJobs, fakeNotifications): over 14 days each holder
//        is told about the past case once a week (twice), never about the others; a second weekly run in the same
//        week queues and tells nothing; a redelivered firm job adds no notification; no file and no row is removed
// Part 3 (Dispose) adds DW7-DW8 here. Synthetic Sample documents only. No model call (US$0).
//   zsh studio/tools/isolated.sh runtime_csd6 4494 start PLATFORM_IDENTITY=local && tsx studio/tests/check_csd6_reads_keep.ts 4494 xr_studio_runtime_csd6
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs, type JobHandler, type JobRun } from "../ports/jobs.ts";
import { fakeNotifications, NOTIFICATION_KIND } from "../ports/notifications.ts";
import { KeepPeriods } from "../api/src/platform/keep-period/service.ts";
import { CLIENT, FAMILY, OFFICER, PORT, DB, call, main, ok, openCase, sql } from "../acceptance/lib/m3.ts";
import { textPdf, upload } from "../acceptance/lib/fixtures.ts";

const studio = join(import.meta.dirname, "..");
const vvOf = () => sql("select id from combination where combination_key='vv.single'") || null;
if (!vvOf()) for (const f of ["tests/runtime/setup_visitor_visa.ts", "acceptance/lib/setup_vv_m3.ts"])
  try { execFileSync(join(studio, "node_modules", ".bin", "tsx"), ["--tsconfig", join(studio, "api", "tsconfig.json"), join(studio, f), String(PORT), DB], { stdio: ["ignore", "ignore", "inherit"], timeout: 900_000 }); }
  catch { /* the setups exit 1 on their own known gaps; what this check needs is asked below */ }

const BASE = `http://127.0.0.1:${PORT}/api`;
const UNKNOWN = "00000000-0000-4000-8000-000000000000";
type Res = { status: number; body: any };
/** A staff route call with a bearer session (PF-4), optionally also an x-actor header (which must change nothing). */
const staff = async (method: string, path: string, token: string | null, actor?: string): Promise<Res> => {
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (actor) headers["x-actor"] = actor;
  const r = await fetch(`${BASE}${path}`, { method, headers }).catch(() => null);
  return { status: r?.status ?? 0, body: await r?.json().catch(() => null) };
};
const tokenOf = async (actorId: string, firmKey = "sample-firm") => {
  const r = await fetch(`${BASE}/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, actorId, secondStep: true }) }).catch(() => null);
  return r?.ok ? ((await r.json()) as { token: string }).token : null;
};
const download = (doc: string, actor: string) => fetch(`${BASE}/runtime/documents/${doc}/file`, { headers: { "x-actor": actor } }).then(async (r) => { await r.arrayBuffer(); return r.status; }).catch(() => 0);
const reads = (doc: string, token: string | null, before?: string) => staff("GET", `/runtime/documents/${doc}/reads${before !== undefined ? `?before=${encodeURIComponent(before)}` : ""}`, token);
const lineCount = (doc: string, action: string) => Number(sql(`select count(*) from audit_event where entity='case document' and entity_key='${doc}' and action='${action}'`) ?? "-1");
/** The stored file of a document on this copy (studio/var/isolated-<name>/workspaces/<workspace key>/<path>). Named, never
 *  listed: a folder listing beside the pack paths above makes the suite selector tie every acceptance pack to this suite. */
function storedFile(doc: string): string | null {
  const root = join(studio, "var", `isolated-${DB.replace(/^xr_studio_/, "")}`, "workspaces"), rel = sql(`select path from case_document where id='${doc}'`);
  if (!rel) return null;
  const p = join(root, process.env.STUDIO_WORKSPACE_KEY?.trim() || "demo", rel);
  return existsSync(p) ? p : null;
}

await main("CS-D6 reads", "Read by list, the fingerprint and the file check; staff session and keys; one audit trail (US$0)", async () => {
  const vv = vvOf();
  ok("setup: the Visitor visa is released on this copy", !!vv);
  const c = await openCase(vv!, FAMILY);
  const [owner, officer, manager, soloOwner] = await Promise.all([tokenOf("user-R"), tokenOf("user-O"), tokenOf("user-T"), tokenOf("user-S", "sample-solo")]);
  ok("setup: staff sessions for the Sample firm's Owner, Case officer and Case manager and the solo firm's Owner", !!(owner && officer && manager && soloOwner));
  const put = async (name: string) => (await upload(PORT, `/runtime/cases/${c.id}/documents`, textPdf([`Sample synthetic letter ${name}`]), name, OFFICER, { subjectId: c.caseSubject, documentType: "letter_of_invitation" })).body?.document?.id as string | undefined;
  const doc = await put(`letter-a-${Date.now().toString(36)}.pdf`), doc2 = await put(`letter-b-${Date.now().toString(36)}.pdf`);
  ok("setup: two Sample PDFs are stored on the case", !!doc && !!doc2, [doc, doc2]);

  // ---- DW1 a read adds one line, the right person, this document only
  const v0 = lineCount(doc!, "viewed");
  ok("CS-D6 DW1 pass: the case officer's download answers 200", (await download(doc!, OFFICER)) === 200);
  let r = await reads(doc!, owner);
  const mine = (r.body?.lines ?? []).filter((l: { action: string }) => l.action === "viewed");
  ok("CS-D6 DW1 pass: the download added exactly one \"viewed\" line, listed for the document, naming the case officer from the firm's record", r.status === 200 && lineCount(doc!, "viewed") === v0 + 1 && mine.length === v0 + 1 && mine[0]?.who === "Case officer (Sample)", [r.status, v0, lineCount(doc!, "viewed"), mine[0]]);
  r = await reads(doc2!, owner);
  ok("CS-D6 DW1 fail: the other document's list does not show that line", r.status === 200 && (r.body?.lines ?? []).length === 0, r.body?.lines?.length);
  const v1 = lineCount(doc!, "viewed"), refused = await download(doc!, CLIENT);
  ok("CS-D6 DW1 fail: a refused download (a client, 403) adds no line", refused === 403 && lineCount(doc!, "viewed") === v1, [refused, v1, lineCount(doc!, "viewed")]);
  const pv = await call("POST", `/runtime/documents/${doc}/preview-link`, {}, OFFICER);
  if (pv.status === 200) {
    r = await reads(doc!, owner);
    ok("CS-D6 DW1 pass: a preview (CS-D5) adds one \"previewed\" line, listed with the case officer's name", (r.body?.lines ?? []).filter((l: { action: string; who: string }) => l.action === "previewed" && l.who === "Case officer (Sample)").length === 1, r.body?.lines);
  } else console.log(`NOTE  CS-D6 DW1: no preview route on this copy (${pv.status}); CS-D5 part 1 (#3188) is not merged, so the "previewed" case runs once it is`);

  // ---- DW2 the key, the firm, the pages
  const [byOfficer, byManager, noSession, xActorOnly] = await Promise.all([reads(doc!, officer), reads(doc!, manager), reads(doc!, null), staff("GET", `/runtime/documents/${doc}/reads`, null, "user-R")]);
  ok("CS-D6 DW2 fail: a Case officer and a Case manager (no agent/document:view-access-log) get 403", byOfficer.status === 403 && byManager.status === 403, [byOfficer.status, byManager.status]);
  ok("CS-D6 DW2 fail: no session gets 401, also with the Owner's x-actor header (the simulated person never decides)", noSession.status === 401 && xActorOnly.status === 401, [noSession.status, xActorOnly.status]);
  const [other, unknown] = await Promise.all([reads(doc!, soloOwner), reads(UNKNOWN, owner)]);
  ok("CS-D6 DW2 fail: the other Sample firm's Owner gets 404 in the same words as an unknown id", other.status === 404 && unknown.status === 404 && other.body?.detail === unknown.body?.detail, [other.status, unknown.status, other.body?.detail]);
  ok("CS-D6 DW2 fail: a cursor the list did not give → 400", (await reads(doc!, owner, "yesterday")).status === 400);
  // A line tagged with the other Sample firm, about this document's key, never shows (review m1).
  const soloFirm = sql("select id from platform_firm where key='sample-solo'"), ws = sql(`select workspace_id from case_document where id='${doc}'`);
  sql(`insert into audit_event (id, workspace_id, actor, action, entity, entity_key, summary, firm_id) values (gen_random_uuid(), '${ws}', 'user-S', 'viewed', 'case document', '${doc}', 'Sample line of the other firm', '${soloFirm}')`);
  ok("CS-D6 DW2 fail: a read line tagged with another firm, about this document, is not listed", lineCount(doc!, "viewed") === v1 + 1 && !((await reads(doc!, owner)).body?.lines ?? []).some((l: { summary: string }) => l.summary === "Sample line of the other firm"), lineCount(doc!, "viewed"));
  ok("CS-D6 DW2 pass: the Owner gets the list with the file's name and fingerprint", (await reads(doc!, owner)).body?.document?.sha256 === sql(`select sha256 from case_document where id='${doc}'`));
  for (let i = 0; i < 51; i++) await download(doc2!, OFFICER);
  const p1 = await reads(doc2!, owner), p2 = p1.body?.next ? await reads(doc2!, owner, p1.body.next) : { status: 0, body: null };
  const all = [...(p1.body?.lines ?? []), ...(p2.body?.lines ?? [])] as { id: string; at: string }[];
  const sorted = all.every((l, i) => i === 0 || all[i - 1]!.at >= l.at);
  ok("CS-D6 DW2 pass: 51 reads page as 50 + 1, newest first, no line twice, and the last page has no next", p1.body?.lines?.length === 50 && !!p1.body?.next && p2.body?.lines?.length === 1 && p2.body?.next === null && new Set(all.map((l) => l.id)).size === 51 && sorted, [p1.body?.lines?.length, p2.body?.lines?.length, p2.body?.next, sorted]);

  // Breaker M1: the key alone is not enough; the case must be in the person's caseScope. On this copy only, the Case
  // manager role loses agent/case:view.all and gains the access-log key; user-T is on no team of this case.
  sql(`delete from platform_role_permission where role='CASE_MANAGER' and permission_key='agent/case:view.all'; insert into platform_role_permission (role, permission_key) values ('CASE_MANAGER', 'agent/document:view-access-log') on conflict do nothing`);
  const ownOnly = await tokenOf("user-T"), lines0 = lineCount(doc!, "checked unchanged") + lineCount(doc!, "found changed");
  const [scopedList, scopedCheck] = [await reads(doc!, ownOnly), await staff("POST", `/runtime/documents/${doc}/check-unchanged`, ownOnly)];
  ok("CS-D6 DW2 fail: a person with the access-log key but not the case (own cases only, not on its team) gets 404 on the list and the check, and no line is written",
    scopedList.status === 404 && scopedCheck.status === 404 && lineCount(doc!, "checked unchanged") + lineCount(doc!, "found changed") === lines0, [scopedList.status, scopedCheck.status]);
  sql(`delete from platform_role_permission where role='CASE_MANAGER' and permission_key='agent/document:view-access-log'; insert into platform_role_permission (role, permission_key) values ('CASE_MANAGER', 'agent/case:view.all') on conflict do nothing`);

  // Lines written in the same microsecond (a writer using the database's own clock) page by id, none skipped (review m1).
  sql(`insert into audit_event (id, workspace_id, actor, action, entity, entity_key, summary, at) select gen_random_uuid(), workspace_id, 'user-O', 'viewed', 'case document', id::text, 'Sample same-moment line', '2026-01-01 00:00:00.000001+00' from case_document, generate_series(1, 52) where id = '${doc2}'`);
  const seen = new Set<string>(); let next: string | null | undefined = undefined, pages = 0;
  do { const pg = await reads(doc2!, owner, next ?? undefined); (pg.body?.lines ?? []).forEach((l: { id: string }) => seen.add(l.id)); next = pg.body?.next; pages++; } while (next && pages < 10);
  ok("CS-D6 DW2 pass: 103 lines, 52 of them in the same microsecond, page through as 50 + 50 + 3 with every line once", seen.size === 103 && seen.size === lineCount(doc2!, "viewed") && pages === 3, [seen.size, lineCount(doc2!, "viewed"), pages]);

  // ---- DW3 the file check
  const u0 = lineCount(doc!, "checked unchanged");
  r = await staff("POST", `/runtime/documents/${doc}/check-unchanged`, officer);
  ok("CS-D6 DW3 pass: on the stored file the Case officer (agent/document:show) gets unchanged and one \"checked unchanged\" line", r.status === 200 && r.body?.unchanged === true && r.body?.found_sha256 === r.body?.sha256 && lineCount(doc!, "checked unchanged") === u0 + 1, [r.status, r.body]);
  const f0 = lineCount(doc!, "found changed"), x = await staff("POST", `/runtime/documents/${doc}/check-unchanged`, soloOwner);
  ok("CS-D6 DW3 fail: the other firm's Owner gets 404 and no line is written", x.status === 404 && lineCount(doc!, "found changed") === f0 && lineCount(doc!, "checked unchanged") === u0 + 1, [x.status]);
  const file = storedFile(doc!);
  ok("setup: the stored file is found on this copy", !!file, file);
  if (file) writeFileSync(file, textPdf(["Sample synthetic letter, altered after upload"]));
  r = await staff("POST", `/runtime/documents/${doc}/check-unchanged`, officer);
  ok("CS-D6 DW3 fail: after the stored bytes are altered the check answers changed and writes one \"found changed\" line", r.status === 200 && r.body?.unchanged === false && !!r.body?.found_sha256 && r.body?.found_sha256 !== r.body?.sha256 && lineCount(doc!, "found changed") === f0 + 1, [r.status, r.body]);
  const file2 = storedFile(doc2!);
  if (file2) execFileSync("rm", ["-f", file2]);
  r = await staff("POST", `/runtime/documents/${doc2}/check-unchanged`, officer);
  ok("CS-D6 DW3 fail: a stored file that is gone (or cannot be read) answers changed with no hash found, and writes \"found changed\"", r.status === 200 && r.body?.unchanged === false && r.body?.found_sha256 === null && lineCount(doc2!, "found changed") === 1, [r.status, r.body]);
  r = await reads(doc!, owner);
  ok("CS-D6 DW3 pass: both checks show in the document's Read by list, newest first", r.body?.lines?.[0]?.action === "found changed" && (r.body?.lines ?? []).some((l: { action: string }) => l.action === "checked unchanged"), r.body?.lines?.slice(0, 3));

  // ---- DW4 the keep list (part 2)
  const KEEP = "/runtime/documents/past-keep-period";
  const ONE = [FAMILY[0]!];
  const [kExact, kShort, kOpen, kReopened] = [await openCase(vv!, ONE), await openCase(vv!, ONE), await openCase(vv!, ONE), await openCase(vv!, ONE)];
  const keepName = `keep-letter-${Date.now().toString(36)}.pdf`;
  const keepDoc = (await upload(PORT, `/runtime/cases/${kExact.id}/documents`, textPdf(["Sample synthetic letter, keep period"]), keepName, OFFICER, { subjectId: kExact.caseSubject, documentType: "letter_of_invitation" })).body?.document?.id as string | undefined;
  ok("setup: four Sample cases for the keep list, one document on the first", !!(kExact.id && kShort.id && kOpen.id && kReopened.id && keepDoc), keepDoc);
  let k = await staff("GET", KEEP, owner);
  const zone = k.body?.zone as string, today = k.body?.today as string;
  ok("CS-D6 DW4 pass: the Owner reads the list with the firm's number (Sample 6 years, firm setting), its zone and today's date", k.status === 200 && k.body?.years === 6 && k.body?.source === "firm setting" && !!zone && /^\d{4}-\d{2}-\d{2}$/.test(today ?? ""), [k.status, k.body?.years, zone, today]);
  const closeAt = (id: string, offset: string) => sql(`update runtime_case set status = 'CLOSED', close_outcome = 'CLOSED_BY_STAFF', closed_reason = 'Sample (CS-D6 DW4)', closed_at = (('${today}'::date - interval '6 years' + interval '${offset}')::date + time '12:00') at time zone '${zone}' where id = '${id}'`);
  closeAt(kExact.id, "0 days"); closeAt(kShort.id, "1 day"); closeAt(kReopened.id, "0 days");
  // Reopened as case-close.ts reopens: back to OPEN with the closing fields cleared.
  sql(`update runtime_case set status = 'OPEN', closed_at = null, closed_reason = null, close_outcome = null where id = '${kReopened.id}'`);
  ok("setup: the reopened case is OPEN again", sql(`select status from runtime_case where id = '${kReopened.id}'`) === "OPEN");
  k = await staff("GET", KEEP, owner);
  const listed = (k.body?.cases ?? []) as { case_id: string; closed_on: string; passed_on: string; documents_held: number; document_ids: string[] }[];
  const exact = listed.find((x) => x.case_id === kExact.id);
  ok("CS-D6 DW4 pass: a case closed 6 years ago today is listed, passed today, with its one document held (by id)", !!exact && exact.passed_on === today && exact.documents_held === 1 && exact.document_ids[0] === keepDoc, exact);
  ok("CS-D6 DW4 fail: a case closed 6 years less a day ago is not listed", !listed.some((x) => x.case_id === kShort.id));
  ok("CS-D6 DW4 fail: an open case and a reopened case are never listed", !listed.some((x) => x.case_id === kOpen.id || x.case_id === kReopened.id));
  ok("CS-D6 DW4 fail: a cursor the list did not give → 400", (await staff("GET", `${KEEP}?after=${UNKNOWN}`, owner)).status === 400 && (await staff("GET", `${KEEP}?after=yesterday`, owner)).status === 400);
  sql(`delete from platform_firm_setting where firm_id = '${soloFirm}' and key = 'legal.closed_client_files_years'`);
  const solo0 = await staff("GET", KEEP, soloOwner);
  ok("CS-D6 DW4 fail: a firm with no number set gets an empty list and the words", solo0.status === 200 && solo0.body?.years === null && (solo0.body?.cases ?? []).length === 0 && solo0.body?.words === "Your firm has not set a keep period for closed client files.", solo0.body);

  // ---- DW5 walls, keys, no names
  const soloSet = await fetch(`${BASE}/platform/keep-periods/closed-client-files`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${soloOwner}` }, body: JSON.stringify({ years: 1, reason: "Sample (CS-D6 DW5)" }) }).then((x) => x.status).catch(() => 0);
  const solo1 = await staff("GET", KEEP, soloOwner);
  ok("CS-D6 DW5 fail: the other Sample firm's Owner, with a number set, never sees this firm's closed cases", soloSet === 200 && solo1.status === 200 && solo1.body?.years === 1 && !JSON.stringify(solo1.body).includes(kExact.id), [soloSet, solo1.status, solo1.body?.years]);
  const [kNone, kOfficer, kX] = await Promise.all([staff("GET", KEEP, null), staff("GET", KEEP, officer), staff("GET", KEEP, null, "user-R")]);
  ok("CS-D6 DW5 fail: no session 401 (also with the Owner's x-actor), the Case officer (no agent/document:dispose) 403", kNone.status === 401 && kX.status === 401 && kOfficer.status === 403, [kNone.status, kX.status, kOfficer.status]);
  sql(`delete from platform_role_permission where role='CASE_MANAGER' and permission_key='agent/case:view.all'; insert into platform_role_permission (role, permission_key) values ('CASE_MANAGER', 'agent/document:dispose') on conflict do nothing`);
  const keyOnly = await tokenOf("user-T"), kScoped = await staff("GET", KEEP, keyOnly);
  sql(`delete from platform_role_permission where role='CASE_MANAGER' and permission_key='agent/document:dispose'; insert into platform_role_permission (role, permission_key) values ('CASE_MANAGER', 'agent/case:view.all') on conflict do nothing`);
  ok("CS-D6 DW5 fail: a person with the dispose key but not the case (own cases only, not on its team) does not see it", kScoped.status === 200 && !(kScoped.body?.cases ?? []).some((x: { case_id: string }) => x.case_id === kExact.id), [kScoped.status, kScoped.body?.cases?.length]);
  ok("CS-D6 DW5 pass: the list names no document (no file name in the answer)", !JSON.stringify(k.body).includes(keepName) && !JSON.stringify(k.body).includes("file_name"));

  // ---- DW6 the weekly reminder, on the fake clock
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DB}`, options: "-c TimeZone=UTC" }) });
  try {
    const { KeepPeriodReminders, KEEP_REMIND_JOB, KEEP_WEEKLY_JOB } = await import("../api/src/documents/keep-period.ts");
    const clock = new FakeClock(new Date()), jobs = fakeJobs(clock), inner = fakeNotifications({ now: () => clock.now() });
    const told: { staffId: string; kind: string; id: string; at: Date }[] = [], handlers = new Map<string, JobHandler>();
    const notifications = { async notify(tx: unknown, rcp: { staffId: string }, kind: Parameters<typeof inner.notify>[2], item: Parameters<typeof inner.notify>[3]) { told.push({ staffId: rcp.staffId, kind, id: item.id, at: clock.now() }); return inner.notify(tx, rcp, kind, item); } };
    const watched = { ...jobs, async handle(n: string, h: JobHandler) { handlers.set(n, h); return jobs.handle(n, h); } };
    await new KeepPeriodReminders({ db, jobs: watched as never, notifications: notifications as never, clock, keepPeriods: new KeepPeriods(db) }).register();
    const counts = () => sql("select (select count(*) from case_document) || '/' || (select count(*) from runtime_case)");
    const c0 = counts();
    for (let d = 0; d < 14; d++) await clock.advance({ days: 1 });
    const ownerStaff = sql("select s.id from platform_staff s join platform_firm f on f.id = s.firm_id where s.actor_id = 'user-R' and f.key = 'sample-firm'");
    const aboutExact = told.filter((t) => t.id === kExact.id && t.kind === NOTIFICATION_KIND.KEEP_PERIOD_PASSED), byOwner = aboutExact.filter((t) => t.staffId === ownerStaff);
    const others = told.filter((t) => [kOpen.id, kReopened.id, c.id].includes(t.id));
    ok("CS-D6 DW6 pass: over 14 days the Owner (a holder of the dispose key) is told about the past case once a week: twice, as keep-period-passed on the case", byOwner.length === 2 && aboutExact.every((t) => t.kind === "keep-period-passed"), { byOwner: byOwner.length, aboutExact: aboutExact.length, jobs: jobs.jobs.length });
    ok("CS-D6 DW6 fail: never about the open case or the reopened case", others.length === 0, others);
    // The case a day short passes on the firm's tomorrow, inside the 14 days: told only once its date has come.
    const shortPass = sql(`select to_char(((closed_at at time zone '${zone}')::date + interval '6 years')::date, 'YYYY-MM-DD') from runtime_case where id = '${kShort.id}'`)!;
    const early = told.filter((t) => t.id === kShort.id && new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(t.at) < shortPass);
    ok("CS-D6 DW6 fail: the case a day short of its period is never told about before the day it passes", early.length === 0 && told.some((t) => t.id === kShort.id), { shortPass, early: early.length, later: told.filter((t) => t.id === kShort.id).length });
    const n0 = told.length, q = await new KeepPeriodReminders({ db, jobs: watched as never, notifications: notifications as never, clock, keepPeriods: new KeepPeriods(db) }).weekly();
    await clock.advance({ minutes: 1 });
    ok("CS-D6 DW6 fail: a second weekly run in the same week queues nothing and tells nobody", q === 0 && told.length === n0, [q, told.length - n0]);
    const sent0 = inner.sent().length, done = jobs.jobs.filter((x) => x.status === "done" && x.name === KEEP_REMIND_JOB);
    for (const x of done) await handlers.get(KEEP_REMIND_JOB)!({ name: x.name, payload: x.payload, key: x.key, firmId: x.firmId, runAt: x.runAt, attempt: x.attempt + 1 } as JobRun).catch(() => undefined);
    ok("CS-D6 DW6 fail: a redelivered firm job adds no notification (one per person, case and kind)", done.length > 0 && inner.sent().length === sent0, [done.length, inner.sent().length, sent0]);
    ok("CS-D6 DW6 fail: the reminder removes no file and no row", counts() === c0 && !!storedFile(keepDoc!), [c0, counts()]);
    ok("CS-D6 DW6 pass: the weekly job is scheduled on its own queue", handlers.has(KEEP_WEEKLY_JOB));
  } finally { await db.$disconnect(); }
});
