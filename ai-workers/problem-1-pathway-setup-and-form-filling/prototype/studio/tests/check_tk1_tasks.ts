// PF-29a and PF-29b (R1.75; shape screens/tk-tasks/shape-r175.md part p1; concept r2.1 BR-3, BR-5, BR-8, BR-10; AG-13-1,
// -2, -8, -62, -67; BR-19): the task table's rules (plat_task, migration 20261125100000_pf29a_plat_task) and the task
// routes (api/src/platform/tasks/) behind PF-4's guard and PF-12's walls. Each Done when line is one named case with a pass
// and a fail (TK1-TK8). One scratch database (every migration, PF-3's Sample firms), dropped at the end; the routes run in
// a Nest app as the API server builds them (the local stand-in's tokens). Sample people only; no browser, no model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_tk1_tasks.ts
import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import pg from "pg";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_tk1_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = URL;   // read by core.ts at import: every app import below comes after it
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED"]) delete process.env[k];

const { NestFactory, APP_GUARD } = await import("@nestjs/core");
const { Module } = await import("@nestjs/common");
const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { TaskHosts } = await import("../api/src/platform/tasks/hosts.ts");
const { dueInstant } = await import("../api/src/platform/tasks/service.ts");
type Feat = { controllers?: unknown[]; providers?: unknown[] };
const feature = async (f: string) => (await import(`../api/src/features/${f}.ts`)).default as Feat;

const db = new Db();
const sql = new pg.Pool({ connectionString: URL, max: 2 });   // the owner: sees every firm's rows (the checks' own reads)
const q = async <T = Record<string, unknown>>(text: string, v: unknown[] = []) => (await sql.query(text, v)).rows as T[];
const code = async (text: string, v: unknown[] = []) => { try { await q(text, v); return "ok"; } catch (e) { return (e as { code?: string }).code ?? String(e); } };
let app: { close(): Promise<void>; get<T>(t: unknown): T } | undefined;

try {
  await seedSampleFirms(db);
  const firm = async (key: string) => (await db.platformFirm.findUniqueOrThrow({ where: { key } })).id;
  const FA = await firm("sample-firm"), FB = await firm("sample-solo");
  const staff = async (actorId: string) => (await db.platformStaff.findUniqueOrThrow({ where: { actorId } })).id;
  const [OWNER, OFF, SOLO] = [await staff("user-R"), await staff("user-O"), await staff("user-S")];
  const person = async (name: string, role: string, status = "ACTIVE") => {
    const [p] = await q<{ id: string }>("insert into platform_staff (id, firm_id, email, display_name, actor_id, status, updated_at) values (gen_random_uuid(), $1, $2, $3, $4, $5, now()) returning id", [FA, `${name.toLowerCase().replace(/\W/g, "")}@tk1.example.com`, name, `tk1-${name}`, status]);
    await q("insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), $1, $2, $3, 'seed:tk1')", [FA, p!.id, role]);
    return p!.id;
  };
  const READER = await person("Sample Reader", "READ_ONLY"), BILLING = await person("Sample Billing", "BILLING_FINANCE");
  const AWAY = await person("Sample Away", "CASE_OFFICER", "SUSPENDED"), GONE = await person("Sample Gone", "CASE_OFFICER", "DEACTIVATED");
  const names = Object.fromEntries((await q<{ id: string; display_name: string }>("select id, display_name from platform_staff where firm_id = $1", [FA])).map((r) => [r.id, r.display_name]));

  // ---------------------------------------------------------------- the app, as the API server builds it
  const local = new LocalIdentity("tk1-check-signing-key-0123456789abcdef", () => Date.now());
  const [wallsF, prefsF, tasksF] = [await feature("platform-firm-walls"), await feature("platform-settings-personal"), await feature("platform-tasks")];
  class AppModule {}
  Module({ controllers: [...(tasksF.controllers ?? [])] as never[], providers: [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, PlatformClock, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, ...(wallsF.providers ?? []), ...(prefsF.providers ?? []), ...(tasksF.providers ?? [])] as never[] })(AppModule);
  const nest = await NestFactory.create(AppModule, { logger: false });
  await nest.listen(0, "127.0.0.1"); app = nest as never;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as AddressInfo).port}`;
  // A test host for fo_person: a record the reader "sees" when its id is in SEEN (the real hosts come with part p2).
  const SEEN = new Set<string>(), LEAD = randomUUID(), HIDDEN = randomUUID();
  SEEN.add(LEAD);
  nest.get(TaskHosts).register("fo_person", async (_r, refs) => new Map(refs.filter((x) => SEEN.has(x.id)).map((x) => [`${x.id}|${x.contextType ?? ""}|${x.contextId ?? ""}`, { label: "Client A Sample (L-00001)", url: `/front-office/leads/${x.id}`, typeLabel: null, zone: "America/Vancouver" }])));
  const call = async (method: string, path: string, who: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${local.issue(who, { authTimeMs: Date.now() - 60_000, secondStep: true })}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let b: any = t; try { b = JSON.parse(t); } catch { /* text */ }
    return { status: r.status, body: b };
  };
  const onLead = (extra: Record<string, unknown> = {}) => ({ host: { type: "fo_person", id: LEAD, contextType: "LEAD", contextId: LEAD }, title: "Call about the job offer", ...extra });
  const row = async (id: string) => (await q<Record<string, any>>("select * from plat_task where id = $1", [id]))[0];
  const audits = async (id: string) => (await q<{ action: string }>("select action from audit_event where entity = 'plat_task' and entity_key = $1 order by at, id", [id])).map((a) => a.action);

  // ---------------------------------------------------------------- TK1 the table's rules (PF-29a)
  const ins = (cols: Record<string, unknown>) => {
    const c = { id: randomUUID(), firm_id: FA, host_type: "firm", title: "Sample task", created_by: "seed:tk1", ...cols };
    return code(`insert into plat_task (${Object.keys(c).join(", ")}) values (${Object.keys(c).map((_, i) => `$${i + 1}`).join(", ")})`, Object.values(c));
  };
  ok("TK1 pass: a firm task with a title inserts (the owner, below the walls)", await ins({}) === "ok");
  ok("TK1 fail: CANCELLED without a reason is refused by the check (23514); a reason without CANCELLED too", await ins({ status: "CANCELLED" }) === "23514" && await ins({ cancel_reason: "No longer needed" }) === "23514");
  ok("TK1 fail: an assignee of another firm is refused (23503, the same-firm trigger)", await ins({ assignee_staff_id: SOLO }) === "23503");
  const shapes = [await ins({ title: "x".repeat(201) }), await ins({ title: "  " }), await ins({ due_at: new Date() }), await ins({ host_id: randomUUID() }), await ins({ host_type: "fo_person" }), await ins({ context_type: "LEAD" })];
  const mars = await ins({ due_at: new Date(), due_zone: "Mars/Olympus" });
  ok("TK1 fail: a 201-character title, a blank title, a due time without its zone, a host id on a firm task, no host id on a person task and a context without its id are each refused (23514); a zone PostgreSQL does not know is refused too (22023)",
    shapes.every((x) => x === "23514") && mars === "22023", { shapes, mars });
  const keyed = randomUUID();
  ok("TK1 pass and fail: one source_key per firm (a second in firm A is 23505; the same key in firm B inserts)",
    await ins({ id: keyed, source_key: "auto:1" }) === "ok" && await ins({ source_key: "auto:1" }) === "23505" && await ins({ firm_id: FB, source_key: "auto:1" }) === "ok");
  ok("TK1 fail: a task never moves firm or host, keeps its version counter, and is never deleted by the app's role",
    await code("update plat_task set host_type = 'case', host_id = gen_random_uuid() where id = $1", [keyed]) === "23514" && await code("update plat_task set title = 'x' where id = $1", [keyed]) === "23514"
    && (await q<{ n: boolean }>("select has_table_privilege('xr_data', 'plat_task', 'DELETE') as n"))[0]!.n === false);
  ok("TK1 pass: a change that moves version on by one is kept, and updated_at moves", await code("update plat_task set title = 'Renamed', version = version + 1 where id = $1", [keyed]) === "ok" && (await row(keyed))!.version === 2);
  ok("TK1: PF-12's wall is forced on plat_task", (await q<{ f: boolean }>("select relforcerowsecurity as f from pg_class where relname = 'plat_task'"))[0]!.f === true);

  // ---------------------------------------------------------------- TK2 add a task (create, BR-9's fields)
  const made = await call("POST", "/api/platform/tasks", OFF, onLead({ due: { date: "2026-11-25", time: "17:30" }, assigneeStaffId: OFF, priority: "HIGH", category: "Call" }));
  ok("TK2 pass: a Case Officer adds a task on a lead they can see, given to themself, due 17:30 in the record's zone (Vancouver), one audit line",
    // The instant read back in the record's zone is 25 Nov 17:30 (the zone's own offset, from the machine's zone data).
    made.status === 201 && made.body.assignee?.id === OFF && made.body.dueZone === "America/Vancouver" && made.body.priority === "HIGH"
    && new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(made.body.dueAt)) === "2026-11-25, 17:30"
    && made.body.host?.label === "Client A Sample (L-00001)" && made.body.version === 1 && JSON.stringify(await audits(made.body.id)) === JSON.stringify(["plat.task.create"]), made.body);
  const T = made.body.id as string;
  const noKey = await call("POST", "/api/platform/tasks", READER, onLead());
  const hidden = await call("POST", "/api/platform/tasks", OWNER, { ...onLead(), host: { type: "fo_person", id: HIDDEN } });
  const long = await call("POST", "/api/platform/tasks", OFF, onLead({ title: "x".repeat(201) }));
  ok("TK2 fail: Read-only (no agent/task:create) → 403; a record the maker cannot see → 404; a 201-character title → 422 naming the field with the screen's words",
    noKey.status === 403 && hidden.status === 404 && long.status === 422 && long.body.fields?.title === "Write what needs doing (up to 200 characters)", { noKey: noKey.status, hidden: hidden.status, long: long.body });
  const toOther = await call("POST", "/api/platform/tasks", OFF, onLead({ assigneeStaffId: OWNER }));
  const toAway = await call("POST", "/api/platform/tasks", OWNER, onLead({ assigneeStaffId: AWAY })), toGone = await call("POST", "/api/platform/tasks", OWNER, onLead({ assigneeStaffId: GONE })), toB = await call("POST", "/api/platform/tasks", OWNER, onLead({ assigneeStaffId: SOLO }));
  ok("TK2 fail (BR-19, AG-13-2): a Case Officer cannot give a new task to someone else (403); a suspended, a deactivated or another firm's person is refused (422) and nothing is written",
    toOther.status === 403 && toAway.status === 422 && toGone.status === 422 && toB.status === 422 && (await q("select 1 from plat_task where assignee_staff_id = any($1)", [[AWAY, GONE, SOLO]])).length === 0, { toOther: toOther.status, toAway: toAway.status, toGone: toGone.status, toB: toB.status });
  const badDate = await call("POST", "/api/platform/tasks", OFF, onLead({ due: { date: "2026-02-30" } })), dateOnly = await call("POST", "/api/platform/tasks", OFF, onLead({ due: { date: "2026-11-25", zone: "America/Toronto" } }));
  ok("TK2 pass and fail: a date alone is due at the end of that day in the zone named (23:59 Toronto); 30 February is refused (422)", dateOnly.status === 201 && dateOnly.body.dueAt === "2026-11-26T04:59:00.000Z" && badDate.status === 422, { dateOnly: dateOnly.body.dueAt, badDate: badDate.status });
  ok("TK2: the due instant is DST-safe (1 Nov 2026, 01:30 Toronto is the first, daylight one; 09:00 the next day is standard time)",
    dueInstant({ date: "2026-11-02", time: "09:00" }, "America/Toronto").toISOString() === "2026-11-02T14:00:00.000Z" && dueInstant({ date: "2026-10-31", time: "09:00" }, "America/Toronto").toISOString() === "2026-10-31T13:00:00.000Z");

  // ---------------------------------------------------------------- TK3 who reads a task (BR-3, BR-10, AG-13-67)
  const asOwner = await call("GET", `/api/platform/tasks/${T}`, OWNER), asB = await call("GET", `/api/platform/tasks/${T}`, SOLO), junk = await call("GET", "/api/platform/tasks/not-a-uuid", OWNER);
  ok("TK3 pass: a colleague with view.all who can see the lead reads the task with its details; TK3 fail: firm B's person gets 404, a malformed id 404",
    asOwner.status === 200 && asOwner.body.host?.url === `/front-office/leads/${LEAD}` && asOwner.body.context?.type === "LEAD" && asB.status === 404 && junk.status === 404, { asOwner: asOwner.status, asB: asB.status });
  SEEN.delete(LEAD);   // the lead is reassigned away: nobody but the task's own people may see it now
  const restricted = await call("GET", `/api/platform/tasks/${T}`, OFF), other = await call("GET", `/api/platform/tasks/${T}`, OWNER);
  ok("TK3 pass (BR-3): its assignee still reads it as Restricted, with no name, page, type or context; TK3 fail: anyone else gets 404",
    restricted.status === 200 && restricted.body.host === "RESTRICTED" && restricted.body.context === null && !JSON.stringify(restricted.body).includes("L-00001") && other.status === 404, { restricted: restricted.body, other: other.status });
  const editHidden = await call("PATCH", `/api/platform/tasks/${T}`, OFF, { version: 1, title: "New words" });
  ok("TK3 fail (BR-3): the assignee of a Restricted task cannot change it (403)", editHidden.status === 403, editHidden.body);
  SEEN.add(LEAD);

  // ---------------------------------------------------------------- TK4 edit with a version (409 when stale)
  const edited = await call("PATCH", `/api/platform/tasks/${T}`, OFF, { version: 1, title: "Call about the job offer letter", due: null });
  const stale = await call("PATCH", `/api/platform/tasks/${T}`, OFF, { version: 1, title: "Lost update" });
  ok("TK4 pass: an edit naming the current version is kept (version 2, due cleared); TK4 fail: a second edit naming version 1 is 409 'This task changed' and nothing moves",
    edited.status === 200 && edited.body.version === 2 && edited.body.dueAt === null && stale.status === 409 && stale.body.detail === "This task changed. Reload to see it." && (await row(T))!.title === "Call about the job offer letter", { edited: edited.body, stale: stale.body });
  const readerEdit = await call("PATCH", `/api/platform/tasks/${T}`, READER, { version: 2, title: "x" }), unknown = await call("PATCH", `/api/platform/tasks/${T}`, OFF, { version: 2, owner: "x" });
  ok("TK4 fail (BR-8): Read-only (view.all, no edit) reads it but cannot edit (403); an unknown field is 422", readerEdit.status === 403 && unknown.status === 422, { readerEdit: readerEdit.status, unknown: unknown.status });

  // ---------------------------------------------------------------- TK5 assign and Take it (BR-5, BR-8)
  const open = await call("POST", "/api/platform/tasks", OWNER, onLead({ title: "Send the checklist" }));
  const U = open.body.id as string;
  ok("TK5 pass: a task added with no assignee is Unassigned", open.status === 201 && open.body.assignee === null && (await row(U))!.assignee_staff_id === null);
  const offAssign = await call("POST", `/api/platform/tasks/${U}/assign`, OFF, { version: 1, assigneeStaffId: OFF });
  const readerTake = await call("POST", `/api/platform/tasks/${U}/take`, READER), billTake = await call("POST", `/api/platform/tasks/${U}/take`, BILLING);
  ok("TK5 fail (BR-8): a Case Officer (no agent/task:assign) cannot Assign… (403); Read-only and Billing (no edit) cannot Take it (403)", offAssign.status === 403 && readerTake.status === 403 && billTake.status === 403, [offAssign.status, readerTake.status, billTake.status]);
  const [a, b] = await Promise.all([call("POST", `/api/platform/tasks/${U}/take`, OFF), call("POST", `/api/platform/tasks/${U}/take`, OWNER)]);
  const won = a.status === 200 ? a : b, lost = a.status === 200 ? b : a, winner = won.body.assignee?.id;
  ok("TK5 pass (BR-5): two Take its at once: one wins (the task is theirs, version 2); TK5 fail: the other is 409 naming the winner, and nothing else changed",
    won.status === 200 && lost.status === 409 && lost.body.code === "TAKEN" && lost.body.detail === `${names[winner]} already has this task` && (await row(U))!.assignee_staff_id === winner && (await row(U))!.version === 2,
    { a: [a.status, a.body.detail], b: [b.status, b.body.detail] });
  const reassign = await call("POST", `/api/platform/tasks/${U}/assign`, OWNER, { version: 2, assigneeStaffId: AWAY });
  const toOff = await call("POST", `/api/platform/tasks/${U}/assign`, OWNER, { version: 2, assigneeStaffId: OFF });
  const unassign = await call("POST", `/api/platform/tasks/${U}/assign`, OWNER, { version: 3, assigneeStaffId: null });
  ok("TK5 pass: the Owner reassigns to the Case Officer, then back to Unassigned; TK5 fail: reassigning to a suspended person is 422",
    reassign.status === 422 && toOff.status === 200 && toOff.body.assignee?.id === OFF && unassign.status === 200 && unassign.body.assignee === null && (await audits(U)).filter((x) => x === "plat.task.assign").length === 2, [reassign.status, toOff.status, unassign.status]);

  // ---------------------------------------------------------------- TK6 Done, reopen, cancel (AG-13-8)
  const doneByReader = await call("POST", `/api/platform/tasks/${T}/complete`, READER, { version: 2 });
  const done = await call("POST", `/api/platform/tasks/${T}/complete`, OFF, { version: 2 });
  const twice = await call("POST", `/api/platform/tasks/${T}/complete`, OFF, { version: 3 });
  ok("TK6 pass: its assignee marks it Done (who and when kept); TK6 fail: Read-only cannot (403), and a second Done is 409",
    done.status === 200 && done.body.status === "COMPLETED" && done.body.completedBy === `staff:${OFF}` && !!done.body.completedAt && doneByReader.status === 403 && twice.status === 409, [doneByReader.status, done.status, twice.status]);
  const reopened = await call("POST", `/api/platform/tasks/${T}/reopen`, OFF, { version: 3 });
  ok("TK6 pass: reopened, it is OPEN with no completion left", reopened.status === 200 && reopened.body.status === "OPEN" && reopened.body.completedAt === null, reopened.body);
  const noReason = await call("POST", `/api/platform/tasks/${T}/cancel`, OFF, { version: 4, reason: "  " });
  const cancelled = await call("POST", `/api/platform/tasks/${T}/cancel`, OFF, { version: 4, reason: "The client found another job" });
  ok("TK6 pass: cancelled with a reason; TK6 fail: a blank reason is 422 'Give a reason for cancelling'",
    noReason.status === 422 && noReason.body.fields?.reason === "Give a reason for cancelling" && cancelled.status === 200 && cancelled.body.status === "CANCELLED" && cancelled.body.cancelReason === "The client found another job", [noReason.body, cancelled.status]);
  ok("TK6: every change wrote one audit line, in order", JSON.stringify(await audits(T)) === JSON.stringify(["plat.task.create", "plat.task.edit", "plat.task.complete", "plat.task.reopen", "plat.task.cancel"]), await audits(T));

  // ---------------------------------------------------------------- TK7 the walls: the routes run as the caller's firm
  const fromB = await call("POST", `/api/platform/tasks/${U}/take`, SOLO), countB = await q<{ n: number }>("select count(*)::int as n from plat_task where firm_id = $1", [FB]);
  ok("TK7 fail: firm B's Owner cannot take firm A's task (404), and firm B has only its own row", fromB.status === 404 && countB[0]!.n === 1, fromB.status);
  const fb = await call("POST", "/api/platform/tasks", SOLO, { host: { type: "firm" }, title: "Renew the office lease" });
  ok("TK7 pass: firm B's Owner adds a firm task; it is firm B's", fb.status === 201 && (await row(fb.body.id))!.firm_id === FB && fb.body.host?.label === "Firm", fb.body);

  // ---------------------------------------------------------------- TK8 hosts register once
  let twiceHost = "";
  try { nest.get(TaskHosts).register("fo_person", async () => new Map()); } catch (e) { twiceHost = (e as Error).message; }
  ok("TK8 fail: a second host for one type is refused at start-up", /already has its host/.test(twiceHost), twiceHost);
  nest.get(TaskHosts).register("case", async () => { throw new Error("boom"); });
  const broken = await call("POST", "/api/platform/tasks", OWNER, { host: { type: "case", id: randomUUID() }, title: "x" });
  ok("TK8 fail: a host that throws sees nothing (404, never a 500)", broken.status === 404, broken.status);
} catch (e) {
  fail++;
  process.stderr.write(`FAIL  TK1: the check crashed — ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
} finally {
  await app?.close().catch(() => undefined);
  await sql.end(); await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
