// CS-NT1 part 3 (map row 76, the case half; design/briefs/CS-NT1.md part 3): notes on a case client, and one timeline
// per case. Named cases, each a pass and a fail:
//   CS-NT1 DW17 the migration (own stamp; applies on a copy holding case notes; part 1's three functions replaced, none added)
//   CS-NT1 DW18 a note on a case client: added, listed, edited with its history; another firm's client → 404; the
//               database keeps one subject per note and refuses UPDATE and DELETE; the client's removal takes its notes
//   CS-NT1 DW13 the timeline lists a document upload, a note and a decision, newest first, with who and when; pages at 50
//               with no skip or duplicate across 120 lines of one timestamp
//   CS-NT1 DW14 a kind, author and date filter returns only those lines; firm B's lines never appear on firm A's case
//               (a line of firm B's naming firm A's case, written before AUD-1m's case_id, is left out); firm B → 404
//   CS-NT1 DW12 an @mention tells the person once (a replay of the same add tells no one again), never the writer; a
//               person of another firm, or no such person → 400 and nothing written (AG-13-22)
//   break F1, F2, F3, F5 (product/screens/CS-NT1c/break-report.md): an out-of-range cursor, pages left empty by the
//               prefilter, a same-prefix case's line, a client moved to another firm
// It runs in this process, as check_csnt1_notes.ts: a scratch database (every migration, PF-3's Sample seed, staff of
// the starter roles) and a small Nest app with PF-4's guard and this row's feature. Cases and audit lines are fixtures
// written in SQL. No server, no browser, no model call (US$0). Both scratch databases are dropped at the end.
//   tsx studio/tests/check_csnt1_timeline.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const NEW = "20261126100000_shared__csnt1c_case_client_note", PART1 = "20261122110000_csnt1a_case_note";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_csnt1c_${process.pid}`, DEMO = `xr_studio_csnt1c_demo_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const psql = (db: string, args: string[]) => execFileSync(join(BIN, "psql"), [urlOf(db), "-X", "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string, db = DB) => psql(db, ["-Atc", q]);
const refused = (q: string, re: RegExp, db = DB) => { try { sql(q, db); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as check_csnt1_notes.ts
type Res = { status: number; body: any };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text();
  let body: unknown = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
for (const d of [DB, DEMO]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", d]); execFileSync(join(BIN, "createdb"), [...PG, d]); }

// ------------------------------------------------------------------------------------ DW17: the migration (rev 16.7)
const before = all.filter((d) => d < NEW).at(-1) ?? "";
ok(`CS-NT1 DW17 pass: the migration has its own stamp, later than part 1's and every one before it (newest before it: ${before})`,
  all.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && before > PART1);
for (const d of all.filter((x) => x < NEW)) psql(DEMO, ["-f", join(MIG, d, "migration.sql")]);
{
  const W0 = randomUUID(), K0 = randomUUID();
  sql(`set session_replication_role = replica; insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, client_id) values ('${K0}', '${W0}', '${randomUUID()}', 'user-P', 'user-O', 'C-2026-00001', '${randomUUID()}');
       insert into case_note (firm_id, workspace_id, case_id, note_key, version, text, author, by_actor) values ('${randomUUID()}', '${W0}', '${K0}', '${randomUUID()}', 1, 'An existing note', 'staff:x', 'staff:x')`, DEMO);
}
psql(DEMO, ["-f", join(MIG, NEW, "migration.sql")]);
ok("CS-NT1 DW17 pass: right after its own migration, on a copy holding a case note, the note is kept on its case and no client note exists",
  sql(`select count(*) || '|' || count(case_id) || '|' || count(case_client_id) from case_note`, DEMO) === "1|1|0");
ok("CS-NT1 DW17 fail: the migration does not apply twice", (() => { try { psql(DEMO, ["-f", join(MIG, NEW, "migration.sql")]); return false; } catch (e) { return /already exists/.test(String((e as { stderr?: string }).stderr)); } })());
for (const d of all.filter((x) => x > NEW)) psql(DEMO, ["-f", join(MIG, d, "migration.sql")]);
for (const d of all) psql(DB, ["-f", join(MIG, d, "migration.sql")]);
ok("CS-NT1 DW17 pass: part 1's three case_note_* functions are replaced, none added; the client's delete trigger is the one new trigger",
  sql(`select string_agg(proname, ',' order by proname) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'case_note%'`) === "case_note_check_insert,case_note_follow_case,case_note_refuse_change"
  && sql(`select string_agg(tgname, ',') from pg_trigger where tgrelid = 'case_client'::regclass and tgname like 'case_note%'`) === "case_note_follow_client");
ok("CS-NT1 DW17 fail: the migration changes no table but case_note, and adds only a trigger on case_client",
  !/ALTER TABLE "(?!case_note")/.test(readFileSync(join(MIG, NEW, "migration.sql"), "utf8")) && !/CREATE FUNCTION/.test(readFileSync(join(MIG, NEW, "migration.sql"), "utf8").replace(/CREATE OR REPLACE FUNCTION/g, "")));

// ------------------------------------------------------------------------------------------------ the app
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];
const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const feature = (await import("../api/src/features/case-notes.ts")).default;
const { CaseTimelineController, ClientNotesController } = await import("../api/src/case-notes/routes.ts");
const { TIMELINE_PAGE } = await import("../api/src/case-notes/timeline.ts");
const { NOTIFICATION_PORT } = await import("../api/src/platform/notifications/store.ts");
const { NOTIFICATION_KIND } = await import("../ports/notifications.ts");
/** Every notify call, as made (the port itself folds repeats; DW12 counts the calls). */
const told: { staffId: string; kind: string; item: { kind: string; id: string } }[] = [];
const countingPort = { async notify(_tx: unknown, r: { staffId: string }, kind: string, item: { kind: string; id: string }) { told.push({ staffId: r.staffId, kind, item }); } };
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });

const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const local = new LocalIdentity("csnt1c-check-signing-key-0123456789abcdef", () => clock.now());
const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: NOTIFICATION_PORT, useValue: countingPort }, ...feature.providers];
@Module({ controllers: [PlatformIdentityController, ...feature.controllers] as never[], providers: providers as never[] }) class TestApp {}
const app = await NestFactory.create(TestApp, { logger: false });
await app.listen(0, "127.0.0.1");
const BASE = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;

try {
  ok("setup: the app starts with this row's routes (the platform guard's start-up rule passes)", feature.controllers.includes(ClientNotesController) && feature.controllers.includes(CaseTimelineController) && !!BASE);
  await seedSampleFirms(db);
  const FA = (await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } })).id, FB = (await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-solo" } })).id;
  const STAFF: Record<string, string> = {};
  for (const [who, role] of [["OWNER", "OWNER"], ["OFFICER", "CASE_OFFICER"], ["OFFICER2", "CASE_OFFICER"], ["READ_ONLY", "READ_ONLY"]] as const) {
    const s = await db.platformStaff.create({ data: { firmId: FA, actorId: `csnt1c-${who.toLowerCase()}`, email: `csnt1c-${who.toLowerCase()}@sample.invalid`, displayName: `Sample ${who}` } });
    await db.platformRoleGrant.create({ data: { firmId: FA, staffId: s.id, role, grantedBy: "seed:csnt1c" } });
    STAFF[who] = s.id;
  }
  const tokenOf = async (actorId: string, firmKey = "sample-firm") => {
    const r = await call(BASE, "POST", "/api/platform/session/local", { body: { firmKey, actorId, secondStep: true } });
    if (r.status !== 200) throw new Error(`sign-in ${actorId}: ${JSON.stringify(r.body)}`);
    return r.body.token as string;
  };
  const T = { OWNER: await tokenOf("csnt1c-owner"), OFFICER: await tokenOf("csnt1c-officer"), OFFICER2: await tokenOf("csnt1c-officer2"), READ_ONLY: await tokenOf("csnt1c-read_only") };
  const TB = await tokenOf("user-S", "sample-solo");

  const W = randomUUID();
  sql(`insert into workspace (id, key, label) values ('${W}', 'csnt1c-${process.pid}', 'CS-NT1 part 3 check')`);
  let n = 0;
  /** A case of the firm (its client made by case_client_for_case, ENABLE ALWAYS); its id and its client's. */
  const newCase = (firmKey = "sample-firm") => {
    const id = randomUUID();
    sql(`set session_replication_role = replica; insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_id, firm_key) values ('${id}', '${W}', '${randomUUID()}', 'user-P', 'user-O', 'C-2026-${String(++n).padStart(5, "0")}', (select id from platform_firm where key = '${firmKey}'), '${firmKey}')`);
    return { id, client: sql(`select client_id from runtime_case where id = '${id}'`) };
  };
  /** An audit line written straight to the table (its trigger off), at a time given, as a case's code would write it. */
  const line = (o: { at: string; actor: string; action: string; entity: string; key: string | null; summary: string; caseId?: string | null; firmId?: string | null }) => {
    const id = randomUUID();
    sql(`set session_replication_role = replica; insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, firm_id, case_id, actor_type) values ('${id}', '${W}', '${o.at}', '${o.actor}', '${o.action}', '${o.entity}', ${o.key ? `'${o.key}'` : "null"}, '${o.summary}', ${o.firmId ? `'${o.firmId}'` : "null"}, ${o.caseId ? `'${o.caseId}'` : "null"}, 'FIRM_STAFF')`);
    return id;
  };
  const CN = (c: string, rest = "") => `/api/runtime/clients/${c}/notes${rest}`;
  const TL = (c: string, q = "") => `/api/runtime/cases/${c}/timeline${q}`;

  // -------------------------------------------------------------------------- DW18: a note on a case client (a person)
  const a1 = newCase(), b1 = newCase("sample-solo");
  ok("setup: each fixture case has its own client of its firm", !!a1.client && !!b1.client && a1.client !== b1.client, [a1, b1]);
  let r = await call(BASE, "POST", CN(a1.client), { token: T.OFFICER, body: { text: "Prefers email; call after 5 pm." } });
  const ck = r.body?.note?.id as string;
  ok("CS-NT1 DW18 pass: a Case Officer adds a note to the case client (201, version 1, INTERNAL), stored on the client, not on a case",
    r.status === 201 && r.body.note.version === 1 && r.body.note.visibility === "INTERNAL" && r.body.note.author.name === "Sample OFFICER"
    && sql(`select count(*) || '|' || count(case_id) from case_note where case_client_id = '${a1.client}'`) === "1|0", r.body);
  const list = await call(BASE, "GET", CN(a1.client), { token: T.READ_ONLY });
  ok("CS-NT1 DW18 pass: it is listed for anyone of the firm holding agent/case:show, with who and when", list.status === 200 && list.body.notes.length === 1 && list.body.notes[0].id === ck && /\d{4}-\d{2}-\d{2}T/.test(list.body.notes[0].writtenAt), list.body);
  const caseList = await call(BASE, "GET", `/api/runtime/cases/${a1.id}/notes`, { token: T.OWNER });
  ok("CS-NT1 DW18 fail: a client's note is never in a case's notes list", caseList.status === 200 && caseList.body.notes.length === 0, caseList.body);
  r = await call(BASE, "PUT", CN(a1.client, `/${ck}/text`), { token: T.OFFICER, body: { text: "Prefers email; call after 6 pm.", version: 1 } });
  const hist = await call(BASE, "GET", CN(a1.client, `/${ck}/versions`), { token: T.OWNER });
  ok("CS-NT1 DW18 pass: an edit writes version 2 and the first stays readable in the history",
    r.status === 200 && r.body.note.version === 2 && hist.status === 200 && hist.body.versions.length === 2 && hist.body.versions[1].text === "Prefers email; call after 5 pm.", [r.body, hist.body]);
  const other = await call(BASE, "PUT", CN(a1.client, `/${ck}/text`), { token: T.OFFICER2, body: { text: "Not mine", version: 2 } });
  ok("CS-NT1 DW18 fail: another Case Officer cannot edit it (403 NOT_NOTE_AUTHOR); the Owner can", other.status === 403 && other.body.code === "NOT_NOTE_AUTHOR"
    && (await call(BASE, "PUT", CN(a1.client, `/${ck}/pin`), { token: T.OWNER, body: { pinned: true, version: 2 } })).status === 200, other.body);
  const cross = await Promise.all([call(BASE, "GET", CN(a1.client), { token: TB }), call(BASE, "POST", CN(a1.client), { token: TB, body: { text: "Firm B writes" } }),
    call(BASE, "GET", CN(a1.client, `/${ck}/versions`), { token: TB }), call(BASE, "PUT", CN(a1.client, `/${ck}/text`), { token: TB, body: { text: "x", version: 3 } }), call(BASE, "GET", CN(randomUUID()), { token: T.OWNER })]);
  ok("CS-NT1 DW18 fail: firm B on firm A's client or its note → 404 on every route (and an unknown client is 404); nothing written, no words shown",
    cross.every((x) => x.status === 404) && !JSON.stringify(cross.map((x) => x.body)).includes("Prefers") && sql(`select count(*) from case_note where case_client_id = '${a1.client}'`) === "3", cross.map((x) => x.status));
  const clientLines = sql(`select string_agg(entity || '|' || coalesce(entity_key, '') || '|' || summary || '|' || coalesce(case_id::text, '-'), ' ; ') from audit_event where entity = 'case client' and entity_key = '${a1.client}'`);
  ok("CS-NT1 DW18 pass: each change wrote a 'case client' line keyed by the client, naming no case (no case's feed reads it), never the note's words",
    /Note added on client CL-\d{5}\|-/.test(clientLines) && !/Prefers|pm/.test(clientLines) && sql(`select count(*) from audit_event where entity = 'case client' and entity_key = '${a1.client}' and (case_id is not null or detail->>'firmId' <> '${FA}')`) === "0", clientLines);
  ok("CS-NT1 DW18 fail: the database keeps one subject per note (both, or neither → refused) and refuses UPDATE and DELETE of a client note",
    refused(`insert into case_note (firm_id, workspace_id, case_id, case_client_id, note_key, version, text, author, by_actor) values ('${FA}', '${W}', '${a1.id}', '${a1.client}', '${randomUUID()}', 1, 'both', 'staff:x', 'staff:x')`, /case_note_subject_check/)
    && refused(`insert into case_note (firm_id, workspace_id, note_key, version, text, author, by_actor) values ('${FA}', '${W}', '${randomUUID()}', 1, 'neither', 'staff:x', 'staff:x')`, /case_note_subject_check/)
    && refused(`update case_note set text = 'changed' where case_client_id = '${a1.client}'`, /refused/) && refused(`delete from case_note where case_client_id = '${a1.client}'`, /refused/));
  ok("CS-NT1 DW18 fail: a client note written for another firm's client, or a next version moved to another subject, is refused by the database",
    refused(`insert into case_note (firm_id, workspace_id, case_client_id, note_key, version, text, author, by_actor) values ('${FB}', '${W}', '${a1.client}', '${randomUUID()}', 1, 'wrong firm', 'staff:x', 'staff:x')`, /is not the firm of client/)
    && refused(`insert into case_note (firm_id, workspace_id, case_id, note_key, version, text, author, by_actor) select firm_id, workspace_id, '${a1.id}', note_key, 4, 'moved', author, by_actor from case_note where note_key = '${ck}' and version = 3`, /does not follow/));

  // ------------------------------------------------------------------- DW13: one case's timeline, newest first, paged
  const c = newCase();
  const added = await call(BASE, "POST", `/api/runtime/cases/${c.id}/notes`, { token: T.OFFICER, body: { text: "Client called about the visitor visa." } });
  const noteAt = added.body.note.writtenAt as string, s8 = c.id.slice(0, 8);
  const tA = (ms: number) => new Date(Date.parse(noteAt) + ms).toISOString();
  line({ at: tA(-60_000), actor: "csnt1c-officer", action: "uploaded", entity: "case document", key: randomUUID(), summary: `Sample OFFICER uploaded the passport for the principal applicant on case ${s8} (PDF, 1200 bytes)`, caseId: c.id, firmId: FA });
  line({ at: tA(60_000), actor: `staff:${STAFF.OWNER}`, action: "case.decision.recorded", entity: "case", key: c.id, summary: `C-2026-00003: Decision approved recorded`, caseId: c.id, firmId: FA });
  const old = line({ at: tA(-120_000), actor: "csnt1c-owner", action: "stage moved", entity: "case", key: c.id, summary: `Moved case ${s8} to Gathering`, caseId: null, firmId: null });
  // Firm B's lines: on its own case, and one (before AUD-1m, case_id empty) whose words name firm A's case but carry firm B's id.
  line({ at: tA(1_000), actor: "user-S", action: "uploaded", entity: "case document", key: randomUUID(), summary: `Firm B upload on case ${b1.id.slice(0, 8)}`, caseId: b1.id, firmId: FB });
  const planted = line({ at: tA(2_000), actor: "user-S", action: "uploaded", entity: "case document", key: randomUUID(), summary: `Firm B planted upload on case ${s8}`, caseId: null, firmId: FB });
  const tl = await call(BASE, "GET", TL(c.id), { token: T.READ_ONLY });
  const kinds = (tl.body?.lines ?? []).map((l: { kind: string }) => l.kind).join(",");
  ok("CS-NT1 DW13 pass: the timeline lists the decision, the note, the document upload and the earlier stage line, newest first, each with who and when",
    tl.status === 200 && kinds === "DECISION,NOTE,DOCUMENT,ACTIVITY" && tl.body.lines[0].actorName === "Sample OWNER" && tl.body.lines[1].actorName === "Sample OFFICER" && tl.body.lines[1].summary === "Client called about the visitor visa."
    && tl.body.lines[2].actorName === "Sample OFFICER" && tl.body.lines[3].refId === old && tl.body.lines.every((l: { at: string }) => /^\d{4}-\d{2}-\d{2}T/.test(l.at)) && tl.body.more === false && tl.body.nextCursor === null, tl.body);
  ok("CS-NT1 DW13 fail: the note's own 'added' audit line is not shown a second time (the note line is it)", (tl.body?.lines ?? []).filter((l: { type: string }) => l.type === "case.note.added").length === 0);

  const big = newCase(), b8 = big.id.slice(0, 8), same = "2026-11-20T10:00:00.123456Z";
  for (let i = 0; i < 4; i++) sql(`set session_replication_role = replica; insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, firm_id, case_id, actor_type)
    select gen_random_uuid(), '${W}', '${same}', 'csnt1c-officer', 'answered', 'case fact', null, 'Answer saved on case ${b8} #' || g, '${FA}', '${big.id}', 'FIRM_STAFF' from generate_series(${i * 30 + 1}, ${i * 30 + 30}) g`);
  const seen: string[] = [];
  let cursor: string | null = null, pages = 0, sizes: number[] = [];
  do {
    const p: Res = await call(BASE, "GET", TL(big.id, cursor ? `?cursor=${cursor}` : ""), { token: T.OWNER });
    if (p.status !== 200) { sizes = [p.status]; break; }
    sizes.push(p.body.lines.length); seen.push(...p.body.lines.map((l: { refId: string }) => l.refId)); cursor = p.body.nextCursor; pages++;
  } while (cursor && pages < 10);
  ok(`CS-NT1 DW13 pass: 120 lines of one timestamp page at ${TIMELINE_PAGE}, 50 + 50 + 20, with no skip and no duplicate`,
    sizes.join(",") === "50,50,20" && seen.length === 120 && new Set(seen).size === 120, { sizes, seen: seen.length, unique: new Set(seen).size });
  // Review m3: notes and audit lines of one microsecond across a page boundary (both sources tie on the time).
  const tie = newCase(), t8 = tie.id.slice(0, 8);
  sql(`insert into case_note (firm_id, workspace_id, case_id, note_key, version, text, author, by_actor) select '${FA}', '${W}', '${tie.id}', gen_random_uuid(), 1, 'Tie note ' || g, 'staff:${STAFF.OFFICER}', 'staff:${STAFF.OFFICER}' from generate_series(1, 30) g`);
  const tieAt = sql(`select min(created_at)::text from case_note where case_id = '${tie.id}'`);
  sql(`set session_replication_role = replica; insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, firm_id, case_id, actor_type)
    select gen_random_uuid(), '${W}', '${tieAt}', 'csnt1c-officer', 'answered', 'case fact', null, 'Tie answer on case ${t8} #' || g, '${FA}', '${tie.id}', 'FIRM_STAFF' from generate_series(1, 40) g`);
  const tieSeen: string[] = [], tieSizes: number[] = [];
  for (let cur: string | null = null, i = 0; i === 0 || (cur && i < 5); i++) {
    const p: Res = await call(BASE, "GET", TL(tie.id, cur ? `?cursor=${cur}` : ""), { token: T.OWNER });
    tieSizes.push(p.body.lines.length); tieSeen.push(...p.body.lines.map((l: { source: string; refId: string }) => `${l.source}:${l.refId}`)); cur = p.body.nextCursor;
  }
  ok("CS-NT1 DW13 pass: 30 notes and 40 audit lines of one microsecond page 50 + 20 with no skip and no duplicate (notes first at a tie)",
    sql(`select count(distinct created_at) from case_note where case_id = '${tie.id}'`) === "1" && tieSizes.join(",") === "50,20" && new Set(tieSeen).size === 70 && tieSeen.filter((x) => x.startsWith("note:")).length === 30 && tieSeen.slice(0, 30).every((x) => x.startsWith("note:")), { tieSizes, unique: new Set(tieSeen).size });
  const badCursor = await Promise.all(["not-a-cursor", Buffer.from(JSON.stringify(["1", "nope", randomUUID()])).toString("base64url")].map((x) => call(BASE, "GET", TL(big.id, `?cursor=${x}`), { token: T.OWNER })));
  ok("CS-NT1 DW13 fail: a cursor this timeline did not give → 400 INVALID", badCursor.every((x) => x.status === 400 && x.body.code === "INVALID" && x.body.fields?.cursor), badCursor.map((x) => x.body));

  // ------------------------------------------------------------------------- DW14: filters; another firm's lines never
  const onlyNotes = await call(BASE, "GET", TL(c.id, "?kinds=NOTE"), { token: T.OWNER });
  const docsDecisions = await call(BASE, "GET", TL(c.id, "?kinds=DOCUMENT,decision"), { token: T.OWNER });
  ok("CS-NT1 DW14 pass: a kind filter returns only that kind (NOTE; DOCUMENT and DECISION together, any letter case)",
    onlyNotes.status === 200 && onlyNotes.body.lines.length === 1 && onlyNotes.body.lines[0].kind === "NOTE" && docsDecisions.body.lines.map((l: { kind: string }) => l.kind).join(",") === "DECISION,DOCUMENT", [onlyNotes.body, docsDecisions.body]);
  const byOwner = await call(BASE, "GET", TL(c.id, `?author=${STAFF.OWNER}`), { token: T.OWNER });
  const day = noteAt.slice(0, 10), nextDay = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const onDay = await call(BASE, "GET", TL(c.id, `?from=${day}&to=${day}`), { token: T.OWNER }), later = await call(BASE, "GET", TL(c.id, `?from=${nextDay}`), { token: T.OWNER });
  ok("CS-NT1 DW14 pass: an author filter returns that person's lines (a session's staff:<id> and their own actor id); a date filter keeps the day's lines",
    byOwner.status === 200 && byOwner.body.lines.map((l: { refId: string }) => l.refId).sort().join() === [old, tl.body.lines[0].refId].sort().join() && onDay.status === 200 && onDay.body.lines.length >= 1 && later.body.lines.length === 0, [byOwner.body, onDay.body?.lines?.length, later.body]);
  const badQ = await Promise.all(["?kinds=EMAIL", "?kinds=", "?author=someone", "?from=2026-02-30", "?from=2026-11-21&to=2026-11-20", "?limit=5"].map((q) => call(BASE, "GET", TL(c.id, q), { token: T.OWNER })));
  ok("CS-NT1 DW14 fail: an unknown kind, a malformed author, an impossible day, a range ending before it starts or an unknown filter → 400 INVALID",
    badQ.filter((x, i) => i !== 1).every((x) => x.status === 400 && x.body.code === "INVALID") && badQ[1].status === 200, badQ.map((x) => [x.status, x.body?.code]));
  const shown = JSON.stringify(tl.body);
  ok("CS-NT1 DW14 fail: firm B's lines never appear on firm A's case: neither its own case's line nor its planted line naming firm A's case (firm B's id, no case_id)",
    !shown.includes("Firm B") && !shown.includes(planted), tl.body);
  const crossTl = await Promise.all([call(BASE, "GET", TL(c.id), { token: TB }), call(BASE, "GET", TL(randomUUID()), { token: T.OWNER }), call(BASE, "GET", TL(c.id))]);
  ok("CS-NT1 DW14 fail: firm B reading firm A's case timeline → 404 (an unknown case 404, no session 401), and firm B's own case timeline answers with its own line",
    crossTl[0].status === 404 && !JSON.stringify(crossTl[0].body).includes("visitor") && crossTl[1].status === 404 && crossTl[2].status === 401
    && (await call(BASE, "GET", TL(b1.id), { token: TB })).body?.lines?.some((l: { summary: string }) => l.summary.startsWith("Firm B upload")), crossTl.map((x) => x.status));

  // --------------------------------------------------------------------------------- DW12: @mentions (AG-13-22)
  const m = newCase(), body = { text: "Please check the passport scan.", mentions: [STAFF.OFFICER2, STAFF.OFFICER, STAFF.OFFICER2], idempotencyKey: "csnt1c-mention-1" };
  const m1 = await call(BASE, "POST", `/api/runtime/cases/${m.id}/notes`, { token: T.OFFICER, body });
  const m2 = await call(BASE, "POST", `/api/runtime/cases/${m.id}/notes`, { token: T.OFFICER, body });
  const toO2 = told.filter((x) => x.staffId === STAFF.OFFICER2);
  ok("CS-NT1 DW12 pass: a note mentioning a colleague (twice in the list) tells them once, as a note-mention pointing at the case; the writer is not told; a replay of the same add tells no one again",
    m1.status === 201 && m2.status === 201 && m2.body.replayed === true && told.length === 1 && toO2.length === 1 && toO2[0].kind === NOTIFICATION_KIND.NOTE_MENTION && toO2[0].item.kind === "case" && toO2[0].item.id === m.id
    && sql(`select detail->'mentioned' from audit_event where action = 'case.note.added' and detail->>'noteKey' = '${m1.body.note.id}'`) === `["${STAFF.OFFICER2}"]`, { told, m2: m2.body });
  const e1 = await call(BASE, "PUT", `/api/runtime/cases/${m.id}/notes/${m1.body.note.id}/text`, { token: T.OFFICER, body: { text: "Please check the passport scan today.", version: 1, mentions: [STAFF.OWNER] } });
  const cm = await call(BASE, "POST", CN(m.client), { token: T.OFFICER, body: { text: "Ask about the address.", mentions: [STAFF.OWNER] } });
  ok("CS-NT1 DW12 pass: an edit's mention tells that person for the new version; a client note's mention points at the client",
    e1.status === 200 && told.length === 3 && told[1].staffId === STAFF.OWNER && told[1].item.kind === "case" && cm.status === 201 && told[2].item.kind === "case-client" && told[2].item.id === m.client, told);
  const sB = sql(`select id from platform_staff where actor_id = 'user-S'`), before12 = sql(`select count(*) from case_note`);
  const bad12 = await Promise.all([[sB], [randomUUID()], ["not-an-id"]].map((ids) => call(BASE, "POST", `/api/runtime/cases/${m.id}/notes`, { token: T.OFFICER, body: { text: "Mentioning", mentions: ids } })));
  ok("CS-NT1 DW12 fail: a person of another firm, no such person or not an id → 400 INVALID on mentions; no note written, no one told",
    bad12.every((x) => x.status === 400 && x.body.code === "INVALID" && x.body.fields?.mentions) && sql(`select count(*) from case_note`) === before12 && told.length === 3, bad12.map((x) => [x.status, x.body?.fields]));

  // ----------------------------------------------------------------------- the breaker's findings (break-report.md)
  const huge = Buffer.from(JSON.stringify(["9999999999999999999", "audit", randomUUID()])).toString("base64url"), top = Buffer.from(JSON.stringify(["9223372036854775807", "audit", randomUUID()])).toString("base64url");
  const [hugeR, topR] = await Promise.all([call(BASE, "GET", TL(c.id, `?cursor=${huge}`), { token: T.OWNER }), call(BASE, "GET", TL(c.id, `?cursor=${top}`), { token: T.OWNER })]);
  ok("break F1 fail: a cursor past PostgreSQL's bigint → 400 INVALID, never a 500; the largest bigint itself answers 200", hugeR.status === 400 && hugeR.body.code === "INVALID" && topR.status === 200, [hugeR.status, topR.status]);
  const d = newCase(), d8 = d.id.slice(0, 8);
  for (let i = 0; i < 10; i++) line({ at: `2026-11-01T10:00:${String(i).padStart(2, "0")}Z`, actor: "csnt1c-officer", action: "answered", entity: "case fact", key: null, summary: `Answer ${i} saved on case ${d8}`, caseId: d.id, firmId: FA });
  sql(`set session_replication_role = replica; insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, actor_type)
    select gen_random_uuid(), '${W}', '2026-11-10T10:00:00Z'::timestamptz + g * interval '1 second', 'csnt1c-officer', 'stage moved', 'case', null, 'Moved case 0000aaaa to Gathering (ref ${d8})', 'FIRM_STAFF' from generate_series(1, 300) g`);
  const dp = await call(BASE, "GET", TL(d.id), { token: T.OWNER });
  ok("break F2 pass: 300 lines the prefilter reads but case-feed.ts drops never leave an empty page: page 1 holds the case's 10 lines and says no more",
    dp.status === 200 && dp.body.lines.length === 10 && dp.body.more === false && dp.body.lines.every((l: { summary: string }) => l.summary.includes(`saved on case ${d8}`)), { n: dp.body?.lines?.length, more: dp.body?.more });
  const bc = randomUUID().replace(/^.{8}/, s8);
  sql(`set session_replication_role = replica; insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_id, firm_key) values ('${bc}', '${W}', '${randomUUID()}', 'user-Q', 'user-S', 'C-2026-09999', (select id from platform_firm where key = 'sample-solo'), 'sample-solo')`);
  const leak = line({ at: tA(3_000), actor: "user-S", action: "stage moved", entity: "case", key: bc, summary: `FIRMB-LEAK moved case ${s8} to Submitted`, caseId: null, firmId: null });
  const tlF3 = await call(BASE, "GET", TL(c.id), { token: T.OWNER });
  ok("break F3 fail: a 'case' line keyed by another case's full id (the same first 8 characters, no firm id) never shows on this case's timeline",
    tlF3.status === 200 && !JSON.stringify(tlF3.body).includes("FIRMB-LEAK") && !JSON.stringify(tlF3.body).includes(leak) && tlF3.body.lines.length === tl.body.lines.length, tlF3.body?.lines?.map((l: { summary: string }) => l.summary));
  const lone = newCase(); sql(`set session_replication_role = replica; delete from runtime_case where id = '${lone.id}'`);
  const loneNote = await call(BASE, "POST", CN(lone.client), { token: T.OWNER, body: { text: "Firm A's words about this person." } });
  sql(`update case_client set firm_key = 'sample-solo' where id = '${lone.client}'`);
  const bRead = await call(BASE, "GET", CN(lone.client), { token: TB });
  ok("break F5 fail: a client moved to another firm in the database: that firm's list never shows the first firm's note (reads filter by the note's firm too)",
    loneNote.status === 201 && bRead.status === 200 && bRead.body.notes.length === 0 && !JSON.stringify(bRead.body).includes("Firm A's words"), [loneNote.status, bRead.status, bRead.body]);
  sql(`update case_client set firm_key = 'sample-firm' where id = '${lone.client}'`);
  const aRead = await call(BASE, "GET", CN(lone.client), { token: T.OWNER });
  ok("break F5 pass: moved back, its own firm reads the note again", aRead.status === 200 && aRead.body.notes.length === 1, aRead.body);

  // ------------------------------------------------------------------------------ the client's removal takes its notes
  const n0 = Number(sql(`select count(*) from case_note where case_client_id = '${a1.client}'`));
  sql(`set session_replication_role = replica; delete from runtime_case where id = '${a1.id}'; set session_replication_role = origin; delete from case_client where id = '${a1.client}'`);
  ok("cascade pass: deleting a case client removes its notes (as a case's), and nothing else's", n0 === 3 && sql(`select count(*) from case_note where case_client_id = '${a1.client}'`) === "0" && Number(sql(`select count(*) from case_note where case_id = '${c.id}'`)) === 1);
  ok("cascade fail: a case note's direct DELETE is still refused while its case exists", refused(`delete from case_note where case_id = '${c.id}'`, /refused/));
} finally {
  await app.close().catch(() => undefined);
  await db.$disconnect();
  for (const d of [DB, DEMO]) spawnSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", d]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
