// FO-3a part 1c (Lead B on #2243, 19 Nov; breaker M4 and m11 on FO-3st2; AG-4-62 rule 1a, §8): a person's sets of hours
// have different names (case and repeated spaces ignored; 409 on fields.name; the database's index holds it under two
// saves at once), and a deactivated person is not a target of the hours, sets and time-off routes (404, the answer for
// an id the firm does not have). DW22 (names), DW23 (deactivated), DW24 (the migration on existing duplicates), a pass
// and a fail each. A scratch database (and a copy migrated up to the step before), one small Nest app over HTTP behind
// PF-4's guard, the real audit adapter. US$0. Dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo3a1c_set_names.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeArrival } from "../ports/arrival.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BREW = "/opt/homebrew/opt/postgresql@18/bin", bin = (n: string) => (existsSync(join(BREW, n)) ? join(BREW, n) : n);
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo3a1c_${process.pid}`, OLD = `xr_studio_fo3a1c_old_${process.pid}`;
const urlOf = (d: string) => `postgresql://xr_studio@127.0.0.1:54329/${d}`, URL = urlOf(DB);
const THIS = "20261119081500_fo3a_set_name_unique", INDEX = "fo_availability_set_firm_id_staff_id_name_norm_key";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const migrations = readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort();
const migrate = (d: string, list: string[]) => { for (const m of list) execFileSync(bin("psql"), [urlOf(d), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, m, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] }); };
const psql = (d: string, q: string) => execFileSync(bin("psql"), [urlOf(d), "-v", "ON_ERROR_STOP=1", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const refused = (d: string, q: string, re: RegExp) => { try { psql(d, q); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };

for (const d of [DB, OLD]) { execFileSync(bin("dropdb"), [...PG, "--if-exists", d]); execFileSync(bin("createdb"), [...PG, d]); }
migrate(DB, migrations);
process.env.DATABASE_URL = URL;
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_POOL_MFA_REQUIRED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

const { Db } = await import("../api/src/core.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { BOOKING_PORTS } = await import("../api/src/front-office/booking/public.controller.ts");
const { Availability, AvailabilityController } = await import("../api/src/front-office/booking/settings/availability.controller.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
const clock = new FakeClock(new Date("2026-10-19T12:00:00Z"));
const ports = { audit: auditEvent as never, clock, jobs: fakeJobs(clock), mail: fakeMail({ clock }), arrival: fakeArrival(), publicBaseUrl: "http://localhost:4432", limits: { bookPerIp: 1000, bookPerFirm: 1000, slotsPerIp: 1000, tokenPerIp: 1000 } };
const identity = new LocalIdentity("fo3a1c-check-signing-key-0123456789abcdef", () => Date.now());
const pclock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const providers = [Db, { provide: PlatformClock, useValue: pclock }, { provide: IDENTITY_PORT, useValue: identity }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
  { provide: BOOKING_PORTS, useValue: ports }, Availability];
@Module({ controllers: [AvailabilityController] as never[], providers: providers as never[] }) class TestApp {}

let app: Awaited<ReturnType<typeof NestFactory.create>> | null = null;
try {
  // ---------------------------------------------------------------------------------------------------------- set-up
  const A = await db.platformFirm.create({ data: { key: "fo3a1c-a", operatingName: "Sample fo3a1c-a", countryCode: "CA", status: "ACTIVE", contactEmail: "fo3a1c-a@firm.example" } });
  await db.workspace.create({ data: { key: "fo3a1c-check", label: "FO-3a 1c check" } });
  const person = async (n: string, role: string) => {
    const s = await db.platformStaff.create({ data: { firmId: A.id, email: `${n}@staff.example`, displayName: `Sample ${n}` } });
    await db.platformRoleGrant.create({ data: { firmId: A.id, staffId: s.id, role: role as never, grantedBy: "seed:fo3a1c" } });
    return { id: s.id, token: identity.issue(s.id, { authTimeMs: Date.now() - 1000, secondStep: true }) };
  };
  const OWNER = await person("owner", "OWNER"), HOST = await person("host", "CASE_OFFICER"), OTHER = await person("other", "CASE_OFFICER"), GONE = await person("gone", "CASE_OFFICER"), PAUSED = await person("paused", "CASE_OFFICER");

  app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const F = async (method: string, path: string, who: { token: string }, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}/api/front-office/${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${who.token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text(); let b: unknown = text; try { b = JSON.parse(text); } catch { /* text */ }
    return { status: r.status, body: b };
  };
  const names = async (staffId: string) => (await db.foAvailabilitySet.findMany({ where: { staffId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map((s) => s.name);
  const TAKEN = (n: string) => `You already have a set called ${n}.`;
  const is409 = (r: Res, n: string) => r.status === 409 && r.body.fields?.name === TAKEN(n) && r.body.detail === TAKEN(n) && r.body.code === "NAME_TAKEN";

  // ------------------------------------------------------------------------------------- DW22: one name per person
  await F("GET", "me/availability-sets", HOST);   // the first read gives "Normal hours"
  const evening = await F("POST", "me/availability-sets", HOST, { name: "Evening calls" });
  const weekend = await F("POST", "me/availability-sets", HOST, { name: "Weekend" });
  ok("FO-3a DW22 pass: two sets with different names are saved (201 each)", evening.status === 201 && weekend.status === 201 && JSON.stringify(await names(HOST.id)) === JSON.stringify(["Normal hours", "Evening calls", "Weekend"]), [evening, weekend]);
  const dup = await F("POST", "me/availability-sets", HOST, { name: "Evening calls" });
  const dupCase = await F("POST", "me/availability-sets", HOST, { name: "  evening    CALLS " });
  const dupDefault = await F("POST", "me/availability-sets", HOST, { name: "normal HOURS" });
  ok("FO-3a DW22 fail: the same name again → 409 on fields.name, \"You already have a set called Evening calls.\"", is409(dup, "Evening calls"), dup);
  ok("FO-3a DW22 fail: the name in other capitals and with repeated spaces → the same 409, naming the set as it is saved", is409(dupCase, "Evening calls"), dupCase);
  ok("FO-3a DW22 fail: the default set's name is taken too (\"normal HOURS\" → 409), and nothing was saved by any refusal", is409(dupDefault, "Normal hours") && (await names(HOST.id)).length === 3, [dupDefault, await names(HOST.id)]);
  const rename = await F("PATCH", `me/availability-sets/${weekend.body.id}`, HOST, { name: "EVENING calls", version: weekend.body.version });
  const kept = await db.foAvailabilitySet.findUniqueOrThrow({ where: { id: weekend.body.id } });
  ok("FO-3a DW22 fail: renaming a set to another set's name → 409 on fields.name; its name and version are unchanged", is409(rename, "Evening calls") && kept.name === "Weekend" && kept.version === weekend.body.version, [rename, kept]);
  const recase = await F("PATCH", `me/availability-sets/${evening.body.id}`, HOST, { name: "Evening Calls", version: evening.body.version });
  const hoursOnly = await F("PATCH", `me/availability-sets/${evening.body.id}`, HOST, { windows: [{ weekday: 2, start: "18:00", end: "20:00" }], version: recase.body.version });
  ok("FO-3a DW22 pass: a set may change the capitals of its own name, and a save that sends no name is not checked", recase.status === 200 && recase.body.name === "Evening Calls" && hoursOnly.status === 200 && hoursOnly.body.windows.length === 1, [recase, hoursOnly]);
  await F("GET", "me/availability-sets", OTHER);
  const theirs = await F("POST", "me/availability-sets", OTHER, { name: "Evening calls" });
  ok("FO-3a DW22 pass: another person may use the same name (one name per person, not per firm)", theirs.status === 201, theirs);
  const race = await Promise.all([1, 2, 3, 4].map(() => F("POST", "me/availability-sets", HOST, { name: "Lunch" })));
  ok("FO-3a DW22 fail: four saves of one new name at once → one 201 and three 409s, one set", race.filter((r) => r.status === 201).length === 1 && race.filter((r) => is409(r, "Lunch")).length === 3 && (await names(HOST.id)).filter((n) => n === "Lunch").length === 1, race.map((r) => r.status));
  ok("FO-3a DW22 fail: the database refuses a second set of that name written past the API (the unique index)",
    refused(DB, `insert into fo_availability_set (firm_id, staff_id, name, time_zone) values ('${A.id}', '${HOST.id}', ' lunch ', 'America/Toronto')`, new RegExp(INDEX))
    && psql(DB, `select indexdef like '%lower(regexp_replace(btrim(name)%' and indexdef like 'CREATE UNIQUE INDEX%' from pg_indexes where indexname = '${INDEX}'`) === "t");
  const audits = await db.auditEvent.count({ where: { firmId: A.id, entityKey: HOST.id, action: "availability.set_created" } });
  ok("FO-3a DW22: a refused save writes no audit line (three sets made by the host: three lines)", audits === 3, audits);

  // --------------------------------------------------------------------------- DW23: a deactivated person is no target
  const goneSets = (await F("GET", `staff/${GONE.id}/availability-sets`, OWNER)).body.sets as { id: string; version: number }[];
  const goneOff = await F("POST", `staff/${GONE.id}/time-off`, OWNER, { startsAt: "2026-11-02T00:00:00-05:00", endsAt: "2026-11-03T00:00:00-05:00" });
  const pausedBefore = await F("GET", `staff/${PAUSED.id}/availability-sets`, OWNER);
  ok("FO-3a DW23 pass: an Owner reads and changes an active colleague's sets and time off (200, 201)", goneSets.length === 1 && goneOff.status === 201 && pausedBefore.status === 200, [goneSets, goneOff]);
  await db.platformStaff.update({ where: { id: GONE.id }, data: { status: "DEACTIVATED" } });
  await db.platformStaff.update({ where: { id: PAUSED.id }, data: { status: "SUSPENDED" } });
  const snapshot = () => psql(DB, `select (select string_agg(name || ':' || version, ',' order by name) from fo_availability_set where staff_id = '${GONE.id}') || '|' || (select count(*) from fo_availability where staff_id = '${GONE.id}') || '|' || (select count(*) from fo_time_off where staff_id = '${GONE.id}') || '|' || (select count(*) from audit_event where entity_key = '${GONE.id}')`);
  const was = snapshot();
  const unknown = await F("GET", "staff/00000000-0000-4000-8000-000000000000/availability-sets", OWNER);
  const tries: [string, Res][] = [
    ["read sets", await F("GET", `staff/${GONE.id}/availability-sets`, OWNER)],
    ["add a set", await F("POST", `staff/${GONE.id}/availability-sets`, OWNER, { name: "After leaving" })],
    ["change hours", await F("PATCH", `staff/${GONE.id}/availability-sets/${goneSets[0].id}`, OWNER, { windows: [], version: goneSets[0].version })],
    ["delete a set", await F("DELETE", `staff/${GONE.id}/availability-sets/${goneSets[0].id}`, OWNER)],
    ["read time off", await F("GET", `staff/${GONE.id}/time-off`, OWNER)],
    ["add time off", await F("POST", `staff/${GONE.id}/time-off`, OWNER, { startsAt: "2026-11-09T00:00:00-05:00", endsAt: "2026-11-10T00:00:00-05:00" })],
    ["remove time off", await F("DELETE", `staff/${GONE.id}/time-off/${goneOff.body.id}`, OWNER)],
  ];
  ok("FO-3a DW23 fail: every hours, sets and time-off route answers 404 for a deactivated colleague (an Owner, by the id in the address)", tries.every(([, r]) => r.status === 404), tries.map(([n, r]) => `${n}: ${r.status}`));
  ok("FO-3a DW23 fail: the 404 is the same answer as for an id the firm does not have", unknown.status === 404 && tries.every(([, r]) => JSON.stringify(r.body) === JSON.stringify(unknown.body)), [unknown.body, tries[0][1].body]);
  ok("FO-3a DW23 fail: nothing of theirs changed (sets, versions, hours, time off, audit lines)", snapshot() === was, [was, snapshot()]);
  const paused = await F("GET", `staff/${PAUSED.id}/availability-sets`, OWNER);
  ok("FO-3a DW23 pass: a suspended colleague (not deactivated) can still be read", paused.status === 200 && paused.body.sets.length === 1, paused);

  // -------------------------------------------------------------------- DW24: the migration on existing duplicates
  migrate(OLD, migrations.filter((m) => m < THIS));
  const of = psql(OLD, "insert into platform_firm (id, key, operating_name, country_code, status, contact_email, updated_at) values (gen_random_uuid(), 'old-firm', 'Sample Old', 'CA', 'ACTIVE', 'old@firm.example', now()) returning id").split("\n")[0];
  const os = (n: string) => psql(OLD, `insert into platform_staff (id, firm_id, email, display_name, updated_at) values (gen_random_uuid(), '${of}', '${n}@old.example', 'Old ${n}', now()) returning id`).split("\n")[0];
  const [o1, o2] = [os("one"), os("two")];
  const LONG = "L".repeat(80);
  const put = (staff: string, name: string, isDefault: boolean, minutesAgo: number) => psql(OLD, `insert into fo_availability_set (firm_id, staff_id, name, is_default, time_zone, created_at) values ('${of}', '${staff}', '${name}', ${isDefault}, 'America/Toronto', now() - interval '${minutesAgo} minutes') returning id`).split("\n")[0];
  const first = put(o1, "Evening", false, 50), second = put(o1, "evening ", false, 40); put(o1, "Evening (2)", false, 30); const fourth = put(o1, "EVENING", false, 20);
  const older = put(o1, "day", false, 15); put(o1, "Day", true, 10);   // the default keeps its name although it is newer
  put(o1, LONG, false, 9); const long2 = put(o1, LONG.toLowerCase(), false, 8);
  put(o2, "Evening", true, 5);   // another person's: untouched
  psql(OLD, `insert into fo_availability (id, firm_id, staff_id, set_id, weekday, start_minute, end_minute, time_zone) values (gen_random_uuid(), '${of}', '${o1}', '${second}', 2, 1080, 1200, 'America/Toronto')`);
  let up = ""; try { migrate(OLD, [THIS]); up = "ok"; } catch (e) { up = String((e as { stderr?: Buffer }).stderr ?? e); }
  const nameOf = (id: string) => psql(OLD, `select name || ':' || version from fo_availability_set where id = '${id}'`);
  ok("FO-3a DW24 pass: the migration runs on a database with duplicate names; the older set keeps its name, each later one gets the first free \" (n)\"",
    up === "ok" && nameOf(first) === "Evening:1" && nameOf(second) === "evening (3):2" && nameOf(fourth) === "EVENING (4):2", [up, nameOf(first), nameOf(second), nameOf(fourth)]);
  ok("FO-3a DW24 pass: the default keeps its name over an older set; an 80-character name is cut so the new one still fits",
    nameOf(older) === "day (2):2" && nameOf(long2) === `${"l".repeat(76)} (2):2`, [nameOf(older), nameOf(long2)]);
  ok("FO-3a DW24 pass: nothing is deleted (nine sets, the renamed set's hours kept) and another person's same name is untouched",
    psql(OLD, "select count(*) from fo_availability_set") === "9" && psql(OLD, `select count(*) from fo_availability where set_id = '${second}'`) === "1" && psql(OLD, `select name from fo_availability_set where staff_id = '${o2}'`) === "Evening");
  const lines = psql(OLD, `select count(*) || ':' || count(*) filter (where firm_id = '${of}' and actor = 'system:migration' and actor_type = 'SYSTEM' and entity = 'fo_availability' and entity_key = '${o1}' and detail->>'migration' = '${THIS}') from audit_event where action = 'availability.set_renamed'`);
  const line = psql(OLD, `select (detail->>'name_before') || '>' || (detail->>'name_after') from audit_event where action = 'availability.set_renamed' and detail->>'setId' = '${second}'`);
  ok("FO-3a DW24 pass: one audit line per rename on the firm's trail, with the name before and after", lines === "4:4" && line === "evening >evening (3)", [lines, line]);
  ok("FO-3a DW24 fail: after the migration the database refuses a new duplicate, and a second run of the rename finds nothing to do",
    refused(OLD, `insert into fo_availability_set (firm_id, staff_id, name, time_zone) values ('${of}', '${o1}', 'EVENING  (3)', 'America/Toronto')`, new RegExp(INDEX))
    && psql(OLD, "select count(*) from (select 1 from fo_availability_set group by firm_id, staff_id, lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) having count(*) > 1) d") === "0");
} finally {
  await app?.close();
  await db.$disconnect();
  for (const d of [DB, OLD]) { try { execFileSync(bin("dropdb"), [...PG, "--if-exists", "--force", d]); } catch { /* left for prune-test-dbs.sh */ } }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
