// CS-NT1 part 1 (map row 76, the case half; design/briefs/CS-NT1.md, build-lead-c-briefs/CS-NT1-1.md): plain notes on a
// case. Named cases CS-NT1 DW1-DW7, each a pass and a fail, plus the database's own rules (insert-only, the firm and
// version checks, the case's removal), STANDARDS §4 (the version seen, idempotent adds) and the audit lines (no note
// text). It runs in this process: a scratch database (every migration, PF-3's Sample seed, staff of the starter roles)
// and a small Nest app built from core.ts's ConfigReadGuard, PF-4's guard and identity routes (the local stand-in) and
// this row's feature. Cases are fixtures written in SQL (replica role, as check_csc1_close.ts). The client's read is
// runtime.ts's one hook (clientNotesOf), called here as the hook calls it, and the hook's line is read from runtime.ts.
// No server, no browser, no model call (US$0). Both scratch databases are dropped at the end.
//   tsx studio/tests/check_csnt1_notes.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLE_FIRM_ID, SAMPLE_FIRMS_SQL } from "./runtime/sample-firms.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261122110000_csnt1a_case_note";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_csnt1_${process.pid}`, DEMO = `xr_studio_csnt1_demo_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const psql = (db: string, args: string[]) => execFileSync(join(BIN, "psql"), [urlOf(db), "-X", "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string, db = DB) => psql(db, ["-Atc", q]);
const refused = (q: string, re: RegExp, db = DB) => { try { sql(q, db); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
type Res = { status: number; body: any };
const call = async (base: string, method: string, path: string, o: { token?: string; actor?: string; body?: unknown } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.actor) headers["x-actor"] = o.actor;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text();
  let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
for (const d of [DB, DEMO]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", d]); execFileSync(join(BIN, "createdb"), [...PG, d]); }

// ------------------------------------------------------------------------------------- DW7: the migration (rev 16.7)
// Measured right after its own migration: the folders before it, then it, then any later ones. Never assumes it is the newest.
const before = all.filter((d) => d < NEW).at(-1) ?? "";
ok(`CS-NT1 DW7 pass: the migration has its own stamp, later than every one before it (newest before it: ${before})`,
  all.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && before >= "20261119051500_pf15_limit_changes");
for (const d of all.filter((x) => x < NEW)) psql(DEMO, ["-f", join(MIG, d, "migration.sql")]);
const W0 = randomUUID(), K0 = randomUUID();
// CS-W1 part 2 needs the case's firm; it is written with it, as its client row is not (no later backfill update to check it).
sql(`${SAMPLE_FIRMS_SQL} set session_replication_role = replica; insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, client_id, firm_id) values ('${K0}', '${W0}', '${randomUUID()}', 'user-P', 'user-O', 'C-2026-00001', '${randomUUID()}', '${SAMPLE_FIRM_ID["sample-firm"]}')`, DEMO);
psql(DEMO, ["-f", join(MIG, NEW, "migration.sql")]);
ok("CS-NT1 DW7 pass: right after its own migration, on a copy with an existing case, the table is empty and the case untouched",
  sql(`select count(*) from case_note`, DEMO) === "0" && sql(`select count(*) from runtime_case where id = '${K0}'`, DEMO) === "1");
ok("CS-NT1 DW7 fail: the migration does not apply twice", (() => { try { psql(DEMO, ["-f", join(MIG, NEW, "migration.sql")]); return false; } catch (e) { return /already exists/.test(String((e as { stderr?: string }).stderr)); } })());
for (const d of all.filter((x) => x > NEW)) psql(DEMO, ["-f", join(MIG, d, "migration.sql")]);
for (const d of all) psql(DB, ["-f", join(MIG, d, "migration.sql")]);
{
  mkdirSync(join(STUDIO, "var"), { recursive: true });
  const cfg = join(STUDIO, "var", `csnt1-${process.pid}.config.ts`);
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(DB))} } });\n`);
  const r = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--script"], { cwd: STUDIO, encoding: "utf8" });
  const mine = `${r.stdout}`.split("\n").filter((l) => /case_note/.test(l));
  rmSync(cfg, { force: true });
  ok("CS-NT1 DW7 pass: migrate diff from the migrated database to the schema names nothing of this row", r.status === 0 && mine.length === 0, mine.length ? mine : r.stderr);
  ok("CS-NT1 DW7 pass: every function this migration adds is named case_note_*",
    sql(`select string_agg(proname, ',' order by proname) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'case_note%'`) === "case_note_check_insert,case_note_follow_case,case_note_refuse_change"
    && !/CREATE FUNCTION (?!case_note_)/.test(readFileSync(join(MIG, NEW, "migration.sql"), "utf8")));
  ok("CS-NT1 DW7 fail: the migration changes no existing table but runtime_case's one AFTER DELETE trigger (additive)",
    !/ALTER TABLE "(?!case_note")/.test(readFileSync(join(MIG, NEW, "migration.sql"), "utf8")) && sql(`select string_agg(tgname, ',') from pg_trigger where tgrelid = 'runtime_case'::regclass and tgname like 'case_note%'`) === "case_note_follow_case");
}

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
const { CaseNotesController } = await import("../api/src/case-notes/routes.ts");
const { clientNotesOf, NOTE_TEXT_MAX } = await import("../api/src/case-notes/service.ts");
const { CASE_ENTITIES, caseOf } = await import("../api/src/case-feed.ts");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });

const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const local = new LocalIdentity("csnt1-check-signing-key-0123456789abcdef", () => clock.now());
const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard }, ...feature.providers];
@Module({ controllers: [PlatformIdentityController, ...feature.controllers] as never[], providers: providers as never[] }) class TestApp {}
const app = await NestFactory.create(TestApp, { logger: false });
await app.listen(0, "127.0.0.1");
const BASE = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;

try {
  ok("setup: the app starts with this row's routes (the platform guard's start-up rule passes)", feature.controllers.includes(CaseNotesController) && !!BASE);
  await seedSampleFirms(db);
  const firmOf = async (key: string) => (await db.platformFirm.findUniqueOrThrow({ where: { key } })).id;
  const FA = await firmOf("sample-firm");
  // Staff in firm A, one per role (PF-3's seeded keys decide; no key is granted here), and a second Case Officer.
  const PEOPLE = [["OWNER", "OWNER"], ["ADMIN", "ADMIN"], ["CASE_MANAGER", "CASE_MANAGER"], ["CASE_OFFICER", "CASE_OFFICER"], ["OFFICER2", "CASE_OFFICER"], ["READ_ONLY", "READ_ONLY"], ["BILLING", "BILLING_FINANCE"]] as const;
  const STAFF: Record<string, string> = {};
  for (const [who, role] of PEOPLE) {
    const s = await db.platformStaff.create({ data: { firmId: FA, actorId: `csnt1-${who.toLowerCase()}`, email: `csnt1-${who.toLowerCase()}@sample.invalid`, displayName: `Sample ${who}` } });
    await db.platformRoleGrant.create({ data: { firmId: FA, staffId: s.id, role, grantedBy: "seed:csnt1" } });
    STAFF[who] = s.id;
  }
  const tokenOf = async (actorId: string, firmKey = "sample-firm") => {
    const r = await call(BASE, "POST", "/api/platform/session/local", { body: { firmKey, actorId, secondStep: true } });
    if (r.status !== 200) throw new Error(`sign-in ${actorId}: ${JSON.stringify(r.body)}`);
    return r.body.token as string;
  };
  const T: Record<string, string> = {};
  for (const [who] of PEOPLE) T[who] = await tokenOf(`csnt1-${who.toLowerCase()}`);
  const TB = await tokenOf("user-S", "sample-solo");   // firm B's Owner

  const W = randomUUID();
  sql(`insert into workspace (id, key, label) values ('${W}', 'csnt1-${process.pid}', 'CS-NT1 check')`);
  let n = 0;
  const newCase = (firmKey = "sample-firm") => {
    const id = randomUUID();
    sql(`set session_replication_role = replica; insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_id, firm_key, client_id) values ('${id}', '${W}', '${randomUUID()}', 'user-P', 'user-O', 'C-2026-${String(++n).padStart(5, "0")}', (select id from platform_firm where key = '${firmKey}'), '${firmKey}', '${randomUUID()}')`);
    return id;
  };
  const N = (c: string, rest = "") => `/api/runtime/cases/${c}/notes${rest}`;
  const add = (c: string, token: string, body: Record<string, unknown>) => call(BASE, "POST", N(c), { token, body });
  const put = (c: string, k: string, what: string, token: string, body: Record<string, unknown>) => call(BASE, "PUT", N(c, `/${k}/${what}`), { token, body });
  const versions = (c: string) => sql(`select count(*) from case_note where case_id = '${c}'`);

  // ---------------------------------------------------------------------------------- DW1: add and list; the text checks
  const c1 = newCase();
  let r = await add(c1, T.CASE_OFFICER, { text: "  Called the client about the police certificate.\nThey will send it Friday.  " });
  const k1 = r.body?.note?.id as string;
  ok("CS-NT1 DW1 pass: a note is added (201, version 1, INTERNAL by default, trimmed, new lines kept)",
    r.status === 201 && r.body.note.version === 1 && r.body.note.visibility === "INTERNAL" && r.body.note.pinned === false && r.body.note.text === "Called the client about the police certificate.\nThey will send it Friday." && r.body.note.author.staffId === STAFF.CASE_OFFICER && r.body.note.author.name === "Sample CASE_OFFICER", r.body);
  let list = await call(BASE, "GET", N(c1), { token: T.READ_ONLY });
  ok("CS-NT1 DW1 pass: it is listed for anyone of the firm holding agent/case:show (Read-only)", list.status === 200 && list.body.notes.length === 1 && list.body.notes[0].id === k1 && list.body.maxLength === NOTE_TEXT_MAX, list.body);
  const max = await add(c1, T.CASE_OFFICER, { text: "é".repeat(NOTE_TEXT_MAX - 1) + "😀" });
  ok("CS-NT1 DW1 pass: exactly 5,000 characters (an emoji counts as one) is accepted", max.status === 201, max.body);
  const bad = await Promise.all([{ text: "" }, { text: " \n\t " }, { text: "x".repeat(NOTE_TEXT_MAX + 1) }, { text: "a\u0000b" }, { text: "a​b" }, { text: 5 }, {}, { text: "ok", author: "someone" }, { text: "ok", visibility: "PUBLIC" }].map((b) => add(c1, T.CASE_OFFICER, b)));
  ok("CS-NT1 DW1 fail: empty, spaces only, over 5,000 characters, a NUL, an invisible character, not text, missing, an unknown field or visibility → 400 INVALID; nothing written",
    bad.every((x) => x.status === 400 && x.body.code === "INVALID" && x.body.fields) && versions(c1) === "2", bad.map((x) => [x.status, x.body.code]));
  const ro = await add(c1, T.READ_ONLY, { text: "Read-only tries" });
  ok("CS-NT1 DW1 fail: without agent/case:edit (Read-only) → 403 MISSING_PERMISSION; nothing written", ro.status === 403 && ro.body.code === "MISSING_PERMISSION" && versions(c1) === "2", ro.body);
  const noToken = await call(BASE, "GET", N(c1)), asActor = await call(BASE, "GET", N(c1), { actor: "user-P" });
  ok("CS-NT1 DW1 fail: no session → 401; the simulated client's header alone reads nothing (401)", noToken.status === 401 && asActor.status === 401 && !JSON.stringify(asActor.body).includes("police"), [noToken.status, asActor.status]);

  // STANDARDS §4: an idempotent add.
  const i1 = await add(c1, T.CASE_MANAGER, { text: "Retried note", idempotencyKey: "csnt1-retry-1" });
  const i2 = await Promise.all([add(c1, T.CASE_MANAGER, { text: "Retried note", idempotencyKey: "csnt1-retry-1" }), add(c1, T.CASE_MANAGER, { text: "Retried note", idempotencyKey: "csnt1-retry-1" })]);
  const i3 = await add(c1, T.CASE_MANAGER, { text: "Another note", idempotencyKey: "csnt1-retry-1" });
  ok("CS-NT1 DW1 pass (idempotent add): the same key again, also twice at once, returns the first note; one row, one audit line",
    i1.status === 201 && i2.every((x) => x.status === 201 && x.body.note.id === i1.body.note.id && x.body.replayed === true) && sql(`select count(*) from case_note where case_id = '${c1}' and idempotency_key = 'csnt1-retry-1'`) === "1"
    && sql(`select count(*) from audit_event where action = 'case.note.added' and detail->>'noteKey' = '${i1.body.note.id}'`) === "1", [i1.body, i2.map((x) => x.body)]);
  ok("CS-NT1 DW1 fail (idempotent add): the key with another note → 409 IDEMPOTENCY_KEY_REUSED; nothing written", i3.status === 409 && i3.body.code === "IDEMPOTENCY_KEY_REUSED" && versions(c1) === "3", i3.body);

  // ------------------------------------------------------------------------- DW2: an edit is version 2; v1 is kept
  r = await put(c1, k1, "text", T.CASE_OFFICER, { text: "Called the client: the certificate comes Monday.", version: 1 });
  const hist = await call(BASE, "GET", N(c1, `/${k1}/versions`), { token: T.READ_ONLY });
  ok("CS-NT1 DW2 pass: an edit writes version 2 and keeps version 1; both are readable in the history, newest first",
    r.status === 200 && r.body.note.version === 2 && r.body.note.edited === true && hist.status === 200 && hist.body.versions.length === 2
    && hist.body.versions[0].version === 2 && hist.body.versions[0].text === "Called the client: the certificate comes Monday." && hist.body.versions[1].text.startsWith("Called the client about the police"), [r.body, hist.body]);
  const v1id = hist.body.versions[1].versionId, v2id = hist.body.versions[0].versionId;
  ok("CS-NT1 DW2 fail: the database refuses UPDATE, DELETE and TRUNCATE on case_note (a note is kept)",
    refused(`update case_note set text = 'changed' where id = '${v1id}'`, /refused/) && refused(`delete from case_note where id = '${v1id}'`, /refused/) && refused(`truncate case_note`, /refused/)
    && sql(`select text from case_note where id = '${v1id}'`).startsWith("Called the client about the police"));
  const stale = await put(c1, k1, "text", T.CASE_OFFICER, { text: "An edit on the old version", version: 1 });
  ok("CS-NT1 DW2 fail (STANDARDS §4): an edit on a version that is no longer current → 409 NOTE_CHANGED with the current note; nothing written",
    stale.status === 409 && stale.body.code === "NOTE_CHANGED" && stale.body.current?.version === 2 && sql(`select count(*) from case_note where note_key = '${k1}'`) === "2", stale.body);
  const race = await Promise.all([put(c1, k1, "text", T.CASE_OFFICER, { text: "Race A", version: 2 }), put(c1, k1, "text", T.CASE_OFFICER, { text: "Race B", version: 2 })]);
  ok("CS-NT1 DW2 fail: two edits of the same version at once: one is saved (version 3), the other is 409 NOTE_CHANGED, never a 500",
    race.map((x) => x.status).sort().join() === "200,409" && sql(`select count(*) from case_note where note_key = '${k1}'`) === "3", race.map((x) => [x.status, x.body.code]));
  const same = await put(c1, k1, "text", T.CASE_OFFICER, { text: race.find((x) => x.status === 200)!.body.note.text, version: 3 });
  ok("CS-NT1 DW2 pass: saving the same words again writes no version (unchanged)", same.status === 200 && same.body.unchanged === true && sql(`select count(*) from case_note where note_key = '${k1}'`) === "3", same.body);
  // The insert trigger's own checks (a write that skips the service).
  const row = (over: string) => `insert into case_note (firm_id, workspace_id, case_id, note_key, version, text, author, by_actor) select ${over} from case_note where id = '${v2id}'`;
  const FB = await firmOf("sample-solo");
  ok("CS-NT1 DW2 fail: the database refuses a version that skips one, another author's next version, another firm, another workspace, a missing case",
    refused(row(`firm_id, workspace_id, case_id, note_key, 9, 'x', author, by_actor`), /does not follow/)
    && refused(row(`firm_id, workspace_id, case_id, note_key, 4, 'x', 'staff:someone-else', by_actor`), /does not follow/)
    && refused(row(`'${FB}', workspace_id, case_id, gen_random_uuid(), 1, 'x', author, by_actor`), /is not the firm of case/)
    && refused(row(`firm_id, gen_random_uuid(), case_id, gen_random_uuid(), 1, 'x', author, by_actor`), /is not the workspace of case/)
    && refused(row(`firm_id, workspace_id, gen_random_uuid(), gen_random_uuid(), 1, 'x', author, by_actor`), /no case/)
    && refused(row(`firm_id, workspace_id, case_id, note_key, 1, 'x', author, by_actor`), /already exists|duplicate key/));
  ok("CS-NT1 DW2 fail: the database refuses empty text, over 5,000 characters, a control character, another visibility",
    refused(row(`firm_id, workspace_id, case_id, gen_random_uuid(), 1, '   ', author, by_actor`), /case_note_text_check/)
    && refused(row(`firm_id, workspace_id, case_id, gen_random_uuid(), 1, repeat('x', 5001), author, by_actor`), /case_note_text_check/)
    && refused(row(`firm_id, workspace_id, case_id, gen_random_uuid(), 1, E'a\\x01b', author, by_actor`), /case_note_text_check/)
    && refused(`insert into case_note (firm_id, workspace_id, case_id, note_key, version, text, author, by_actor, visibility) select firm_id, workspace_id, case_id, gen_random_uuid(), 1, 'x', author, by_actor, 'PUBLIC' from case_note where id = '${v2id}'`, /case_note_visibility_check/));
  ok("CS-NT1 DW2 pass: created_at is the database's clock, never the writer's",
    (() => { const id = sql(`insert into case_note (firm_id, workspace_id, case_id, note_key, version, text, author, by_actor, created_at) select firm_id, workspace_id, case_id, gen_random_uuid(), 1, 'clock', author, by_actor, '2001-01-01' from case_note where id = '${v2id}' returning id`); return sql(`select created_at > now() - interval '1 hour' from case_note where id = '${id}'`) === "t"; })());

  // ----------------------------------------------------------------------- DW3: another firm's case or note is 404
  const theirs = newCase("sample-solo");
  const before3 = sql(`select string_agg(id::text, ',' order by id) from case_note where case_id = '${c1}'`);
  const asB = await Promise.all([
    call(BASE, "GET", N(c1), { token: TB }), call(BASE, "GET", N(c1, `/${k1}/versions`), { token: TB }), add(c1, TB, { text: "From firm B" }),
    put(c1, k1, "text", TB, { text: "From firm B", version: 3 }), put(c1, k1, "pin", TB, { pinned: true, version: 3 }), put(c1, k1, "visibility", TB, { visibility: "CLIENT_VISIBLE", version: 3 }),
    // firm B's own case with firm A's note key
    call(BASE, "GET", N(theirs, `/${k1}/versions`), { token: TB }), put(theirs, k1, "text", TB, { text: "From firm B", version: 3 }), put(theirs, k1, "pin", TB, { pinned: true, version: 3 }),
  ]);
  ok("CS-NT1 DW3 fail: firm B's token on firm A's case, or on firm A's note through its own case → 404 on every route",
    asB.every((x) => x.status === 404 && x.body.code === "NOT_FOUND") && !asB.some((x) => JSON.stringify(x.body).includes("certificate")), asB.map((x) => [x.status, x.body.code]));
  ok("CS-NT1 DW3 pass: firm A's note is unchanged (no version added), and firm A still reads it",
    sql(`select string_agg(id::text, ',' order by id) from case_note where case_id = '${c1}'`) === before3 && (await call(BASE, "GET", N(c1), { token: T.OWNER })).body.notes.some((x: { id: string }) => x.id === k1));
  const own = await add(theirs, TB, { text: "Firm B's own note" });
  ok("CS-NT1 DW3 pass: firm B adds a note on its own case, with firm B's firm id", own.status === 201 && sql(`select firm_id from case_note where note_key = '${own.body.note.id}'`) === FB, own.body);
  const odd = await Promise.all([call(BASE, "GET", N("not-a-uuid"), { token: T.OWNER }), call(BASE, "GET", N(c1, "/not-a-uuid/versions"), { token: T.OWNER }), put(c1, randomUUID(), "pin", T.OWNER, { pinned: true, version: 1 })]);
  ok("CS-NT1 DW3 fail: a malformed case or note id, or a note that does not exist → 404, never a 500", odd.every((x) => x.status === 404), odd.map((x) => x.status));

  // ------------------------------------------------------------------------- DW4: only the author, an Owner or an Admin edits
  const c4 = newCase();
  const n4 = (await add(c4, T.CASE_OFFICER, { text: "Officer one's note" })).body.note;
  r = await put(c4, n4.id, "text", T.OFFICER2, { text: "Officer two rewrites it", version: 1 });
  ok("CS-NT1 DW4 fail: another Case Officer (who holds agent/case:edit) cannot edit the note → 403 NOT_NOTE_AUTHOR; nothing written",
    r.status === 403 && r.body.code === "NOT_NOTE_AUTHOR" && sql(`select count(*) from case_note where note_key = '${n4.id}'`) === "1", r.body);
  const cm = await put(c4, n4.id, "text", T.CASE_MANAGER, { text: "Case Manager rewrites it", version: 1 });
  ok("CS-NT1 DW4 fail: a Case Manager (not Owner or Admin) cannot edit another person's note either → 403 NOT_NOTE_AUTHOR", cm.status === 403 && cm.body.code === "NOT_NOTE_AUTHOR", cm.body);
  const list4 = await call(BASE, "GET", N(c4), { token: T.OFFICER2 });
  ok("CS-NT1 DW4 pass: the list says who may edit the words (canEditText false for officer two)", list4.body.notes[0].canEditText === false, list4.body);
  r = await put(c4, n4.id, "text", T.ADMIN, { text: "Admin corrects it", version: 1 });
  const r4 = await put(c4, n4.id, "text", T.CASE_OFFICER, { text: "The author edits it again", version: 2 });
  const o4 = await put(c4, n4.id, "text", T.OWNER, { text: "The Owner edits it", version: 3 });
  ok("CS-NT1 DW4 pass: an Admin can (version 2), the author can (version 3), an Owner can (version 4); the author stays officer one, each version names who wrote it",
    r.status === 200 && r4.status === 200 && o4.status === 200 && o4.body.note.version === 4 && o4.body.note.author.staffId === STAFF.CASE_OFFICER && o4.body.note.lastChangedBy.staffId === STAFF.OWNER
    && sql(`select string_agg(by_actor, ',' order by version) from case_note where note_key = '${n4.id}'`) === [STAFF.CASE_OFFICER, STAFF.ADMIN, STAFF.CASE_OFFICER, STAFF.OWNER].map((s) => `staff:${s}`).join(","), [r.body, r4.body, o4.body]);
  const pin4 = await put(c4, n4.id, "pin", T.OFFICER2, { pinned: true, version: 4 });
  ok("CS-NT1 DW4 pass: pinning is not an edit of the words: officer two may pin another person's note (brief: agent/case:edit)", pin4.status === 200 && pin4.body.note.pinned === true, pin4.body);

  // ------------------------------------------------------------------- DW5: the client reads CLIENT_VISIBLE notes only
  const c5 = newCase();
  const internal = (await add(c5, T.CASE_OFFICER, { text: "Internal: the employer seems unsure." })).body.note;
  const shared = (await add(c5, T.CASE_OFFICER, { text: "We sent your application today.", visibility: "CLIENT_VISIBLE" })).body.note;
  const flip = (await add(c5, T.CASE_OFFICER, { text: "Your biometrics letter came.", visibility: "CLIENT_VISIBLE" })).body.note;
  const back = await put(c5, flip.id, "visibility", T.CASE_OFFICER, { visibility: "INTERNAL", version: 1 });
  const seen = await clientNotesOf(db, c5);
  ok("CS-NT1 DW5 pass: a CLIENT_VISIBLE note appears in the client's read (words, pinned, times; no staff ids or names)",
    seen.length === 1 && seen[0].id === shared.id && seen[0].text === "We sent your application today." && !JSON.stringify(seen).includes(STAFF.CASE_OFFICER) && !JSON.stringify(seen).includes("Sample"), seen);
  ok("CS-NT1 DW5 fail: an INTERNAL note never appears, nor an old CLIENT_VISIBLE version whose current version is INTERNAL",
    back.status === 200 && back.body.note.visibility === "INTERNAL" && !seen.some((x) => x.id === internal.id || x.id === flip.id) && !JSON.stringify(seen).includes("employer") && !JSON.stringify(seen).includes("biometrics"), seen);
  ok("CS-NT1 DW5 fail: another case's client-visible notes never appear in this case's read", (await clientNotesOf(db, c1)).every((x) => !x.text.includes("application today")));
  const hook = readFileSync(join(STUDIO, "api", "src", "runtime.ts"), "utf8");
  const getBody = hook.slice(hook.indexOf("  async get(actor: Actor, caseId: string) {"), hook.indexOf("\n  }\n", hook.indexOf("  async get(actor: Actor, caseId: string) {")));
  ok("CS-NT1 DW5 pass: runtime.ts's case read carries the notes for the client only, through clientNotesOf (its one hook)",
    /\.\.\.\(isOfficer\(actor\) \? \{\} : \{ notes: await clientNotesOf\(this\.db, c\.id\) \}\)/.test(getBody) && (hook.match(/clientNotesOf/g) ?? []).length === 2, getBody.slice(-400));
  const share = await Promise.all([add(c5, T.BILLING, { text: "Billing shares", visibility: "CLIENT_VISIBLE" })]);
  ok("CS-NT1 DW5 fail: without agent/case:edit nobody adds a note, client-visible or not (Billing → 403)", share.every((x) => x.status === 403), share.map((x) => [x.status, x.body.code]));
  const marked = await put(c5, internal.id, "visibility", T.CASE_OFFICER, { visibility: "CLIENT_VISIBLE", version: 1 });
  ok("CS-NT1 DW5 pass: marking a note client-visible is audited as its own action (AG-13-21), and the client then reads it",
    marked.status === 200 && sql(`select count(*) from audit_event where action = 'case.note.marked-client-visible' and detail->>'noteKey' = '${internal.id}'`) === "1" && (await clientNotesOf(db, c5)).some((x) => x.id === internal.id));

  // --------------------------------------------------------------------------------- DW6: pin first; unpin restores; audited
  const c6 = newCase();
  const a6 = (await add(c6, T.CASE_OFFICER, { text: "First note" })).body.note;
  const b6 = (await add(c6, T.CASE_OFFICER, { text: "Second note" })).body.note;
  const order = async () => (await call(BASE, "GET", N(c6), { token: T.CASE_OFFICER })).body.notes.map((x: { id: string }) => x.id).join(",");
  const o0 = await order();
  r = await put(c6, a6.id, "pin", T.CASE_OFFICER, { pinned: true, version: 1 });
  const o1 = await order();
  const u = await put(c6, a6.id, "pin", T.CASE_OFFICER, { pinned: false, version: 2 });
  const o2 = await order();
  ok("CS-NT1 DW6 pass: newest first; pin puts the older note first; unpin restores the order",
    o0 === `${b6.id},${a6.id}` && r.status === 200 && o1 === `${a6.id},${b6.id}` && u.status === 200 && o2 === o0, [o0, o1, o2]);
  ok("CS-NT1 DW6 pass: pin and unpin are each one audit line (case note, keyed by the case, its words naming the case)",
    sql(`select string_agg(action, ',' order by at, action) from audit_event where entity = 'case note' and entity_key = '${c6}' and action like 'case.note.%pinned'`) === "case.note.pinned,case.note.unpinned");
  const again = await put(c6, a6.id, "pin", T.CASE_OFFICER, { pinned: false, version: 3 });
  const badPin = await Promise.all([put(c6, a6.id, "pin", T.CASE_OFFICER, { pinned: "yes", version: 3 }), put(c6, a6.id, "pin", T.CASE_OFFICER, { pinned: true }), put(c6, a6.id, "pin", T.READ_ONLY, { pinned: true, version: 3 })]);
  ok("CS-NT1 DW6 fail: unpinning an unpinned note writes nothing and no audit line; a wrong value or no version → 400; Read-only → 403",
    again.body.unchanged === true && sql(`select count(*) from case_note where note_key = '${a6.id}'`) === "3" && badPin[0].status === 400 && badPin[1].status === 400 && badPin[2].status === 403,
    [again.body, badPin.map((x) => x.status)]);

  // ------------------------------------------------- review M2, m1: agent/note:share-with-client is its own check
  // Every seeded role with agent/case:edit also holds the share key, so firm A's Case Officer role loses it here (this
  // scratch database only) and officer two signs in again.
  const c7 = newCase();
  const own7 = (await add(c7, T.OFFICER2, { text: "Officer two shares this.", visibility: "CLIENT_VISIBLE" })).body.note;
  const int7 = (await add(c7, T.OFFICER2, { text: "Officer two keeps this internal." })).body.note;
  sql(`delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key = 'agent/note:share-with-client'`);
  const T7 = await tokenOf("csnt1-officer2");
  const s7 = await Promise.all([add(c7, T7, { text: "Shown without the key", visibility: "CLIENT_VISIBLE" }), put(c7, int7.id, "visibility", T7, { visibility: "CLIENT_VISIBLE", version: 1 }),
    put(c7, own7.id, "visibility", T7, { visibility: "INTERNAL", version: 1 }), put(c7, own7.id, "text", T7, { text: "New words the client would read", version: 1 })]);
  ok("CS-NT1 DW5 fail (review M2, m1): without agent/note:share-with-client (but with agent/case:edit): a CLIENT_VISIBLE add, a visibility change either way and an edit of a client-visible note's words → 403 MISSING_PERMISSION; nothing written",
    s7.every((x) => x.status === 403 && x.body.code === "MISSING_PERMISSION") && versions(c7) === "2", s7.map((x) => [x.status, x.body.code]));
  const i7 = await add(c7, T7, { text: "An internal note without the key" }), e7 = await put(c7, int7.id, "text", T7, { text: "Officer two edits the internal note", version: 1 });
  ok("CS-NT1 DW5 pass (review M2): the same person still adds an INTERNAL note (201) and edits an internal note's words (200)", i7.status === 201 && i7.body.note.visibility === "INTERNAL" && e7.status === 200, [i7.body, e7.body]);
  sql(`insert into platform_role_permission (role, permission_key) values ('CASE_OFFICER', 'agent/note:share-with-client')`);

  // ------------------------------------------------- review m2, break m1, m2, m3: order of checks, key case, races, hidden text
  const c8 = newCase();
  const n8 = (await add(c8, T.CASE_OFFICER, { text: "Officer one's note" })).body.note;
  await put(c8, n8.id, "pin", T.CASE_OFFICER, { pinned: true, version: 1 });
  r = await put(c8, n8.id, "text", T.CASE_MANAGER, { text: "The Case Manager, stale", version: 1 });
  ok("review m2 fail: a non-author on a stale version gets 403 NOT_NOTE_AUTHOR (who may comes before which version), never the current note", r.status === 403 && r.body.code === "NOT_NOTE_AUTHOR" && !r.body.current, r.body);
  const up = n8.id.toUpperCase(), mixed = n8.id.slice(0, 18).toUpperCase() + n8.id.slice(18);
  const race8 = await Promise.all([put(c8, n8.id, "text", T.CASE_OFFICER, { text: "Case a", version: 2 }), put(c8, up, "text", T.CASE_OFFICER, { text: "Case b", version: 2 }), put(c8, mixed, "text", T.CASE_OFFICER, { text: "Case c", version: 2 })]);
  ok("break m1 fail: the same note in other letter cases, edited at once: one 200, the others 409 NOTE_CHANGED (one lock per note), never a bare 409 or 500",
    race8.filter((x) => x.status === 200).length === 1 && race8.filter((x) => x.status === 409 && x.body.code === "NOTE_CHANGED").length === 2, race8.map((x) => [x.status, x.body.code]));
  ok("break m1 pass: the history and the audit lines name the note in lower case", (await call(BASE, "GET", N(c8, `/${up}/versions`), { token: T.CASE_OFFICER })).body.versions?.length === 3
    && sql(`select count(*) from audit_event where entity_key = '${c8}' and detail->>'noteKey' <> lower(detail->>'noteKey')`) === "0");
  const hidden = await Promise.all(["hi\u2060there", "hi" + String.fromCodePoint(0xe0069, 0xe0067), "\u3164\u3164", "\u2800", " \u00ad ", "a\u061cb"].map((t) => add(c8, T.CASE_OFFICER, { text: t })));
  ok("break m3 fail: a word joiner, tag characters (hidden text), a note of only Hangul fillers, the Braille blank or a soft hyphen, an Arabic letter mark → 400; nothing written",
    hidden.every((x) => x.status === 400 && x.body.code === "INVALID") && sql(`select count(distinct note_key) from case_note where case_id = '${c8}'`) === "1", hidden.map((x) => x.status));
  ok("break m3 fail: the database refuses the same hidden characters on a direct insert (zero-width space, direction override, word joiner, a tag character, C1)",
    ["E'a\\u200bb'", "E'a\\u202eb'", "E'a\\u2060b'", "E'a\\U000e0041b'", "E'a\\u0085b'"].every((t) => refused(`insert into case_note (firm_id, workspace_id, case_id, note_key, version, text, author, by_actor) select firm_id, workspace_id, case_id, gen_random_uuid(), 1, ${t}, author, by_actor from case_note where note_key = '${n8.id}' and version = 1`, /case_note_text_check/)));
  ok("break m3 pass: ordinary non-Latin text, an emoji with a joiner and CRLF are kept as typed",
    (await add(c8, T.CASE_OFFICER, { text: "Résumé — 履歴書 — सारांश 👩‍💻\r\nline two" })).body?.note?.text === "Résumé — 履歴書 — सारांश 👩‍💻\r\nline two");
  // break m2: a note added while its case is being deleted: 404 once the delete commits, never a 500, no orphan.
  const gone = newCase();
  const { spawn } = await import("node:child_process");
  const del = spawn(join(BIN, "psql"), [urlOf(DB), "-X", "-q", "-c", `begin; delete from runtime_case where id = '${gone}'; select pg_sleep(1.5); commit;`], { stdio: "ignore" });
  const ended = new Promise((res) => del.on("exit", res));
  await new Promise((res) => setTimeout(res, 400));
  r = await add(gone, T.CASE_OFFICER, { text: "Written while the case goes" });
  await ended;
  ok("break m2 fail: an add racing its case's delete → 404 NOT_FOUND, never a 500; no orphan note", r.status === 404 && r.body.code === "NOT_FOUND" && sql(`select count(*) from case_note where case_id = '${gone}'`) === "0", r.body);
  ok("review M1 pass: the case-only read paths use an index whose first column is case_id",
    sql(`select count(*) from pg_indexes where tablename = 'case_note' and indexdef like '%(case_id, note_key, version)%'`) === "1");

  // ---------------------------------------------------------------------------------- audit lines: never the note's words
  const lines = sql(`select coalesce(string_agg(summary || ' ' || coalesce(detail::text, ''), ' | '), '') from audit_event where entity = 'case note'`);
  ok("audit pass: every change wrote a 'case note' line keyed by its case, read as that case's line (case-feed.ts), with its case id",
    CASE_ENTITIES.has("case note") && sql(`select count(*) from audit_event where entity = 'case note' and (case_id is null or case_id <> entity_key::uuid)`) === "0"
    && caseOf({ entity: "case note", entityKey: c6, summary: sql(`select summary from audit_event where entity = 'case note' and entity_key = '${c6}' limit 1`) }) === c6.slice(0, 8));
  ok("audit fail: no note text is ever in an audit line (summary or detail); the edit names its before and after version ids",
    !/certificate|employer|biometrics|application today|Officer one|rewrites|First note|Second note/.test(lines)
    && sql(`select count(*) from audit_event where action = 'case.note.edited' and detail->>'beforeVersionId' = '${v1id}' and detail->>'afterVersionId' = '${v2id}'`) === "1", lines.slice(0, 300));
  ok("events fail: no note writes a module event (part 1 sends none; the text never leaves in one)", sql(`select count(*) from module_event where payload::text like '%certificate%' or type like '%note%'`) === "0");

  // ------------------------------------------------------------------------------- the case's removal takes its notes
  const before9 = Number(sql(`select count(*) from case_note where case_id = '${c4}'`));
  sql(`delete from runtime_case where id = '${c4}'`);
  ok("cascade pass: deleting a case removes its notes (its five versions: the trigger a foreign key would be), and nothing else's",
    before9 === 5 && sql(`select count(*) from case_note where case_id = '${c4}'`) === "0" && Number(sql(`select count(*) from case_note where case_id = '${c1}'`)) > 0);
  ok("cascade fail: a note's direct DELETE is still refused while its case exists", refused(`delete from case_note where case_id = '${c1}'`, /refused/));
} finally {
  await app.close().catch(() => undefined);
  await db.$disconnect();
  for (const d of [DB, DEMO]) spawnSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", d]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
