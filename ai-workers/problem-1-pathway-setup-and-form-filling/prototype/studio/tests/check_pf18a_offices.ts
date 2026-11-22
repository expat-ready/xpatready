// PF-18a part 1 (brief design/lead-b-briefs/PF-18a.md; AG-1-74, AG-16-68, AG-16-59; P-600, P-606): a firm's offices with their own time zone, hours and closed days, and
// OfficeClockPort. Each "Done when" line of part 1 (DW1-DW4, DW7's OfficeClockPort share) with a passing and a failing case. Three scratch databases: "empty" gets every
// migration (then PF-3's Sample seed); "demo" gets every migration before PF-18a's, demo-shaped rows and the Sample firms, then the rest; "bare" stops before PF-18a's.
// The routes run in a Nest app built from the feature's own classes beside PF-4's guard and the local stand-in's tokens (as check_pf21w_routes.ts), on the empty copy.
// The database's walls are checked as xr_app (PF-12). The port's contract runs on the real OfficeClock and on fakeOfficeClock. No server of the app, no browser, no model
// call (US$0). Every scratch database is dropped at the end.
//   tsx studio/tests/check_pf18a_offices.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runContract } from "../ports/contracts/contract.ts";
import { officeClockPortContract, type OfficeClockHarness } from "../ports/contracts/office-clock-port.contract.ts";
import { fakeOfficeClock, type OfficeClockValues } from "../ports/offices.ts";
const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261117120000_pf18a_offices";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const EMPTY = `xr_studio_pf18a_empty_${process.pid}`, DEMO = `xr_studio_pf18a_demo_${process.pid}`, BARE = `xr_studio_pf18a_bare_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const WORK = join(STUDIO, "var", `pf18a-check-${process.pid}`);
let pass = 0, fail = 0; const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const psql = (db: string, args: string[], user = "xr_studio") => execFileSync(join(BIN, "psql"), [`postgresql://${user}@127.0.0.1:54329/${db}`, "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (db: string, q: string, user?: string) => psql(db, ["-Atc", q], user);
const refused = (db: string, q: string, re: RegExp, user?: string) => { try { sql(db, q, user); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };
/** As the API's role with a session firm (or none), as PF-12's own check does. */
const asApp = (db: string, firm: string | null, q: string) => sql(db, `begin; ${firm ? `select set_config('app.firm_id', '${firm}', true);` : ""} ${q}; commit;`, "xr_app").split("\n").filter((l) => l !== "" && l !== firm).join("\n");
function officesDiff(db: string): string[] {
  mkdirSync(WORK, { recursive: true });
  const cfg = join(WORK, `prisma.${db}.config.ts`);
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(db))} } });\n`);
  const r = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--script"], { cwd: STUDIO, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`migrate diff: ${r.stdout}${r.stderr}`);
  return `${r.stdout}`.split("\n").filter((l) => /platform_office|platform_staff_office/.test(l));
}
const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
for (const db of [EMPTY, DEMO, BARE]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", db]); execFileSync(join(BIN, "createdb"), [...PG, db]); }
for (const d of all) psql(EMPTY, ["-f", join(MIG, d, "migration.sql")]);
process.env.DATABASE_URL = urlOf(EMPTY);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED"]) delete process.env[k];
const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { platformAuditWorkspaceId } = await import("../api/src/platform/identity/audit.ts");
const { writeSetting, TIME_ZONE, BUSINESS_HOURS, CLOSED_DAYS } = await import("../api/src/platform/settings.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { OfficeClock } = await import("../api/src/platform/settings/offices/clock.ts");
const { withFirm } = await import("../api/src/platform/firm-scope.ts");
const { Offices, ZONE_REFUSED, PROVINCE_REFUSED } = await import("../api/src/platform/settings/offices/service.ts");
const { zoneForProvince, prefillZone, PROVINCES } = await import("../api/src/platform/settings/offices/zones.ts");
const feature = (await import("../api/src/features/platform-settings-personal.ts")).default;
const db = new Db();
const apps: { close(): Promise<void> }[] = [];
const local = new LocalIdentity("pf18a-check-signing-key-0123456789abcdef", () => Date.now());
type Res = { status: number; body: any };
let BASE = "";
const call = async (method: string, path: string, token?: string, body?: unknown): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}/api/platform/offices${path}`, { method, headers, body: body === undefined || method === "GET" ? undefined : JSON.stringify(body) });
  const text = await r.text(); let b: any = text; try { b = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: b };
};
try {
  const before = all.filter((d) => d < NEW);
  ok(`PF-18a DW7: the migration has its own stamp, later than every migration before it (P-600 (4), rows rev 16.7; newest before it: ${before.at(-1)})`, all.includes(NEW) && (before.at(-1) ?? "") < NEW && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1, all.slice(-3));
  const migText = readFileSync(join(MIG, NEW, "migration.sql"), "utf8").replace(/--.*$/gm, "");
  const fns = [...migText.matchAll(/CREATE (?:OR REPLACE )?FUNCTION\s+"?([a-z_0-9]+)/gi)].map((m) => m[1]);
  ok("PF-18a DW7: every function the migration creates carries the area prefix platform_office_ (rows rev 15.2)", fns.length === 2 && fns.every((f) => /^platform_office_/.test(f)), fns);
  const slotted = (model: string) => (new RegExp(`\\nmodel ${model} \\{\\n([\\s\\S]*?)\\n\\}`).exec(readFileSync(join(SCHEMA, "platform.prisma"), "utf8"))?.[1] ?? "").split("\n").map((l) => l.trim()).filter((l, i, a) => /PlatformOffice|PlatformStaffOffice|offices \(PF-18a\)/.test(l) || /offices \(PF-18a\)/.test(a[i - 1] ?? ""));
  ok("PF-18a DW7 (P-600, Lead B on #2009): platform.prisma gains only the slot line `offices (PF-18a)` and one back-relation line under it, in PlatformFirm and PlatformStaff",
    JSON.stringify(slotted("PlatformFirm")) === JSON.stringify(["// back-relation slot: offices (PF-18a)", "offices PlatformOffice[] // platform-offices.prisma"]) && slotted("PlatformStaff").length === 2 && /^office PlatformStaffOffice\?/.test(slotted("PlatformStaff")[1]), [slotted("PlatformFirm"), slotted("PlatformStaff")]);
  for (const d of before) psql(BARE, ["-f", join(MIG, d, "migration.sql")]);
  ok("PF-18a DW7 fail: before the migration there is no office table and migrate diff names them", sql(BARE, `select count(*) from pg_tables where tablename in ('platform_office', 'platform_staff_office')`) === "0" && officesDiff(BARE).length > 0);
  ok("PF-18a DW7 pass: every migration applies to an empty database; migrate diff names no office table", officesDiff(EMPTY).length === 0, officesDiff(EMPTY));
  ok("PF-18a DW7 fail: the migration does not apply twice", refused(EMPTY, readFileSync(join(MIG, NEW, "migration.sql"), "utf8"), /already exists/));
  for (const d of before) psql(DEMO, ["-f", join(MIG, d, "migration.sql")]);
  const W = "00000000-0000-4000-8000-000000000001", CMB = "00000000-0000-4000-8000-000000000002";
  sql(DEMO, `set session_replication_role = replica;
    insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, firm_key, case_number) values ('00000000-0000-4000-8000-000000000010', '${W}', '${CMB}', 'user-P', 'user-O', 'sample-firm', 'C-2026-00001');
    insert into audit_event (id, workspace_id, actor, action, entity, summary) values (gen_random_uuid(), '${W}', 'user-R', 'case.open', 'runtime_case', 'Sample');`);
  { process.env.DATABASE_URL = urlOf(DEMO); const pre = new Db(); await seedSampleFirms(pre); await pre.$disconnect(); process.env.DATABASE_URL = urlOf(EMPTY); }
  const demoRows = `select (select count(*) from runtime_case) || ':' || (select count(*) from audit_event) || ':' || (select count(*) from platform_firm) || ':' || (select count(*) from platform_staff) || ':' || (select count(*) from platform_firm_setting)`;
  const demoBefore = sql(DEMO, demoRows);
  psql(DEMO, ["-f", join(MIG, NEW, "migration.sql")]);   // rows rev 16.7 (review M2): checked right after its own migration, before any later one
  ok("PF-18a DW7 pass: on a demo-data copy the migration leaves every row as it was and writes no office (nothing seeded)", sql(DEMO, demoRows) === demoBefore && sql(DEMO, "select count(*) from platform_office") === "0", [demoBefore, sql(DEMO, demoRows)]);
  for (const d of all.filter((x) => x > NEW)) psql(DEMO, ["-f", join(MIG, d, "migration.sql")]);
  ok("PF-18a DW7 pass: migrate diff after it on the demo-data copy names no office table", officesDiff(DEMO).length === 0, officesDiff(DEMO));
  const pack = JSON.parse(readFileSync(join(STUDIO, "samples", "province-time-zones-ca.json"), "utf8"));
  const tzNames = new Set(sql(EMPTY, "select name from pg_timezone_names").split("\n"));
  ok("PF-18a DW1: the pack list has the 13 provinces and territories, each one zone this runtime and PostgreSQL know; it cites tzdata 2026e zone1970.tab and the date read", PROVINCES.length === 13 && PROVINCES.every((p) => { const z = zoneForProvince(p)!; return Intl.supportedValuesOf("timeZone").includes(z) || tzNames.has(z); }) && PROVINCES.every((p) => tzNames.has(zoneForProvince(p)!))
    && pack.source.release === "2026e" && pack.source.file === "zone1970.tab" && /^\d{4}-\d{2}-\d{2}$/.test(pack.source.read), PROVINCES.map((p) => `${p}=${zoneForProvince(p)}`));
  ok("PF-18a DW1 pass: zoneForProvince(AB) is America/Edmonton (any case, spaces ignored); BC Vancouver, ON Toronto, NU Iqaluit (ours, labelled)", zoneForProvince("AB") === "America/Edmonton" && zoneForProvince(" ab ") === "America/Edmonton" && zoneForProvince("BC") === "America/Vancouver" && zoneForProvince("ON") === "America/Toronto" && zoneForProvince("NU") === "America/Iqaluit"
    && /^ours/.test(pack.provinces.BC.choice) && /^ours/.test(pack.provinces.ON.choice) && /^ours/.test(pack.provinces.NU.choice));
  ok("PF-18a DW1 fail: a code not on the list, no code, or a code abroad gives no province zone (the firm's zone is the pre-fill)", zoneForProvince("ZZ") === null && zoneForProvince(null) === null && zoneForProvince("") === null
    && JSON.stringify(prefillZone("America/Toronto", "US", "AB")) === JSON.stringify({ zone: "America/Toronto", from: "firm" }) && prefillZone("America/Halifax", "CA", null).zone === "America/Halifax");
  await seedSampleFirms(db);
  const firmA = (await db.platformFirm.findFirstOrThrow({ where: { key: "sample-firm" } })).id, firmB = (await db.platformFirm.findFirstOrThrow({ where: { key: "sample-solo" } })).id;
  type Role = "OWNER" | "ADMIN" | "CASE_OFFICER" | "READ_ONLY";
  let n = 0;
  const person = async (firmId: string, role: Role) => {
    const s = await db.platformStaff.create({ data: { firmId, email: `p${++n}@pf18a.example.com`, displayName: `Sample ${n}`, actorId: `pf18a-${n}` } });
    await db.platformRoleGrant.create({ data: { firmId, staffId: s.id, role, grantedBy: "seed:pf18a" } });
    return { id: s.id, token: local.issue(s.id, { authTimeMs: Date.now() - 60_000, secondStep: true }) };
  };
  const owner = await person(firmA, "OWNER"), admin = await person(firmA, "ADMIN"), officer = await person(firmA, "CASE_OFFICER"), reader = await person(firmA, "READ_ONLY"), ownerB = await person(firmB, "OWNER");
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, PlatformClock, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard }, ...feature.providers];
  @Module({ controllers: feature.controllers as never[], providers: providers as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false }); await app.listen(0, "127.0.0.1"); apps.push(app);
  BASE = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  /** A change made from the office's current version (STANDARDS §4: a stale one is 409). */
  const patch = async (id: string, token: string, body: Record<string, unknown>) => call("PATCH", `/${id}`, token, { version: (await db.platformOffice.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString(), ...body });
  const clock = new OfficeClock(db), ws = await platformAuditWorkspaceId(db);
  const FIRM_HOURS = [{ day: "MON", opens: "08:30", closes: "16:30" }, { day: "TUE", opens: "08:30", closes: "16:30" }];
  for (const [key, value] of [[TIME_ZONE.key, "America/Toronto"], [BUSINESS_HOURS.key, FIRM_HOURS], [CLOSED_DAYS.key, ["2026-12-25"]]] as const)
    await writeSetting(db, { firmId: firmA, key, value, by: `staff:${owner.id}`, workspaceId: ws });
  const one = await call("GET", "", owner.token);
  ok("PF-18a DW2 pass: a firm with one office lists one implicit office, the firm's name, with no zone field", one.status === 200 && one.body.multipleOffices === false && one.body.offices.length === 1 && one.body.offices[0].implicit === true && one.body.offices[0].id === null && !("timeZone" in one.body.offices[0]) && !("businessHours" in one.body.offices[0]), one);
  ok("PF-18a DW2 pass: with one office OfficeClockPort gives the firm's zone, hours and closed days", (await clock.zoneFor(firmA, null)) === "America/Toronto" && JSON.stringify(await clock.hoursFor(firmA, null)) === JSON.stringify(FIRM_HOURS) && JSON.stringify(await clock.closedDaysFor(firmA, null)) === JSON.stringify(["2026-12-25"]));
  ok("PF-18a DW2 fail: a staff member with no office has none (the caller then uses the firm's zone)", (await clock.officeOfStaff(firmA, officer.id)) === null);
  const coAdd = await call("POST", "", officer.token, { name: "Calgary", province: "AB" });
  ok("PF-18a DW4 fail: a Case Officer adding an office → 403, nothing written", coAdd.status === 403 && sql(EMPTY, "select count(*) from platform_office") === "0", coAdd);
  ok("PF-18a DW4 pass: a Read only person may read the list (agent/settings:list)", (await call("GET", "", reader.token)).status === 200);
  ok("PF-18a DW4 fail: no token → 401", (await call("GET", "")).status === 401);
  const ab = await call("POST", "", admin.token, { name: "Calgary", province: "AB", country: "Canada" });
  const calgary = ab.body?.office?.id as string;
  ok("PF-18a DW1 pass: an office in Alberta is pre-filled America/Edmonton (201)", ab.status === 201 && ab.body.office.timeZone === "America/Edmonton" && ab.body.timeZoneFrom === "province" && ab.body.office.province === "AB", ab);
  ok("PF-18a DW2/AG-1-74 §7: adding the second office writes the first, holding the firm's zone, hours and closed days", ab.body.first?.isFirst === true && ab.body.first.timeZone === "America/Toronto" && JSON.stringify(ab.body.first.businessHours) === JSON.stringify(FIRM_HOURS) && JSON.stringify(ab.body.first.closedDays) === JSON.stringify(["2026-12-25"]) && ab.body.first.province === "ON", ab.body.first);
  const two = await call("GET", "", reader.token);
  ok("PF-18a DW2 fail→pass: once a second office exists the list shows both, each with its zone field", two.body.multipleOffices === true && two.body.offices.length === 2 && two.body.offices.every((o: any) => typeof o.timeZone === "string") && two.body.offices[0].isFirst === true, two.body);
  const changed = await patch(calgary, owner.token, { timeZone: "America/Regina" });
  ok("PF-18a DW1 pass: the pre-filled zone can be changed and saved", changed.status === 200 && changed.body.timeZone === "America/Regina" && (await clock.zoneFor(firmA, calgary)) === "America/Regina", changed);
  const zoneLine = await db.auditEvent.findFirst({ where: { action: "platform.office.time_zone_change", entityKey: calgary } });
  ok("PF-18a (AG-1-74 §9): the change is audited \"office time zone changed\" with before and after", !!zoneLine && (zoneLine.detail as any).fromTimeZone === "America/Edmonton" && (zoneLine.detail as any).toTimeZone === "America/Regina" && (zoneLine.detail as any).firmId === firmA, zoneLine);
  for (const bad of ["Mountain", "America/Toronto ", "america/toronto", "Mars/Olympus", 42, ""]) {
    const r = await patch(calgary, owner.token, { timeZone: bad });
    ok(`PF-18a DW1 fail: the zone ${JSON.stringify(bad)} → 422 "${ZONE_REFUSED}", nothing stored`, r.status === 422 && r.body.detail === ZONE_REFUSED && (await clock.zoneFor(firmA, calgary)) === "America/Regina", r);
  }
  ok("PF-18a DW1 fail: an invalid zone on add → 400, nothing written", (await call("POST", "", owner.token, { name: "Bad zone", province: "AB", timeZone: "Mountain" })).status === 422 && sql(EMPTY, "select count(*) from platform_office where name = 'Bad zone'") === "0");
  const noProv = await call("POST", "", owner.token, { name: "Remote" });
  const abroad = await call("POST", "", owner.token, { name: "New York", country: "US" });
  ok("PF-18a fail (review m3): a province for an office abroad → 400, not dropped", (await call("POST", "", owner.token, { name: "Boston", country: "US", province: "MA" })).status === 422);
  ok("PF-18a DW1 pass (§12, AG16-55): an office with no province, or outside Canada, pre-fills the firm's zone (and keeps no Canadian province abroad)", noProv.status === 201 && noProv.body.office.timeZone === "America/Toronto" && noProv.body.timeZoneFrom === "firm" && noProv.body.first === null
    && abroad.status === 201 && abroad.body.office.timeZone === "America/Toronto" && abroad.body.office.countryCode === "US", [noProv.body, abroad.body]);
  const zz = await call("POST", "", owner.token, { name: "Nowhere", province: "ZZ" });
  ok("PF-18a DW1 fail: a Canadian office in a province code not on the list → 422", zz.status === 422 && zz.body.detail === PROVINCE_REFUSED, zz);
  const chosen = await call("POST", "", owner.token, { name: "Halifax", province: "AB", timeZone: "America/Halifax" });
  ok("PF-18a DW1 pass: a zone the person chose wins over the pre-fill", chosen.status === 201 && chosen.body.office.timeZone === "America/Halifax" && chosen.body.timeZoneFrom === "chosen", chosen.body);
  ok("PF-18a fail: a second office with the same name (any case) → 409", (await call("POST", "", owner.token, { name: "calgary", province: "AB" })).status === 409);
  ok("PF-18a fail: an unknown field or a missing name → 422", (await call("POST", "", owner.token, { name: "X", isFirst: true })).status === 422 && (await call("POST", "", owner.token, { province: "AB" })).status === 422);
  const vancouver = (await call("POST", "", owner.token, { name: "Vancouver", province: "BC" })).body.office;
  ok("PF-18a DW3 pass: a new office's closed-days list starts empty, though the firm has a closed day (nothing seeded)", JSON.stringify(vancouver.closedDays) === "[]" && JSON.stringify(vancouver.businessHours) === JSON.stringify(FIRM_HOURS), vancouver);
  const closeB = await patch(vancouver.id, owner.token, { closedDays: ["2026-12-26"] });
  ok("PF-18a DW3 pass: a closed day in office B is saved on office B", closeB.status === 200 && (await clock.closedDaysFor(firmA, vancouver.id)).includes("2026-12-26"), closeB);
  ok("PF-18a DW3 fail: that day does not close office A, nor the firm", !(await clock.closedDaysFor(firmA, calgary)).includes("2026-12-26") && !(await clock.closedDaysFor(firmA, null)).includes("2026-12-26"));
  ok("PF-18a DW3 fail: closed days and hours that fail the firm settings' schemas → 422", (await patch(vancouver.id, owner.token, { closedDays: ["2026-02-30"] })).status === 422 && (await patch(vancouver.id, owner.token, { businessHours: [{ day: "MON", opens: "17:00", closes: "09:00" }] })).status === 422 && (await patch(vancouver.id, owner.token, { closedDays: ["2026-12-26", "2026-12-26"] })).status === 422);
  await new Offices({ db, audit: auditEvent }).setStaffOffice({ firmId: firmA, staffId: owner.id }, officer.id, calgary);
  ok("PF-18a DW2 pass: a staff member put in an office is that office's (officeOfStaff)", (await clock.officeOfStaff(firmA, officer.id)) === calgary);
  const bList = await call("GET", "", ownerB.token);
  ok("PF-18a DW4 pass: firm B's list is its own one implicit office, never firm A's", bList.status === 200 && bList.body.multipleOffices === false && bList.body.offices[0].name !== two.body.offices[0].name, bList.body);
  const bPatch = await patch(calgary, ownerB.token, { timeZone: "America/Vancouver" });
  ok("PF-18a DW4 fail: firm B changing firm A's office → 404, unchanged", bPatch.status === 404 && (await clock.zoneFor(firmA, calgary)) === "America/Regina", bPatch);
  ok("PF-18a DW4 fail: an id that is not one → 404", (await call("PATCH", "/not-an-id", owner.token, { name: "Y" })).status === 404);
  let crossed = false; try { await clock.zoneFor(firmB, calgary); } catch (e) { crossed = (e as { code?: string }).code === "OFFICE_NOT_FOUND"; }
  ok("PF-18a DW4 fail: OfficeClockPort asked as firm B for firm A's office → OfficeNotFound", crossed);
  let placed = false; try { await new Offices({ db, audit: auditEvent }).setStaffOffice({ firmId: firmB, staffId: ownerB.id }, ownerB.id, calgary); } catch (e) { placed = (e as { getStatus?: () => number }).getStatus?.() === 404; }
  ok("PF-18a DW4 fail: firm B placing its person in firm A's office → 404", placed);
  const [r1, r2] = await Promise.all([patch(chosen.body.office.id, owner.token, { name: "Twin" }), patch(noProv.body.office.id, owner.token, { name: "twin" })]);
  ok("PF-18a fail (review m1): two renames at once to names that differ only by case → one 200, one 409", [r1.status, r2.status].sort().join() === "200,409", [r1.status, r2.status]);
  const [z1, z2] = await Promise.all([patch(vancouver.id, owner.token, { timeZone: "America/Edmonton" }), patch(vancouver.id, owner.token, { timeZone: "America/Regina" })]);
  const froms = (await db.auditEvent.findMany({ where: { action: "platform.office.time_zone_change", entityKey: vancouver.id } })).map((l) => (l.detail as any).fromTimeZone);
  ok("PF-18a fail (break B2, review m2): two changes from one version at once → one 200, one 409 with the current office; one audit line, from the true before", [z1.status, z2.status].sort().join() === "200,409" && [z1, z2].find((z) => z.status === 409)!.body.current?.id === vancouver.id && JSON.stringify(froms) === '["America/Vancouver"]', [z1.status, z2.status, froms]);
  ok("PF-18a fail (break B2): a change with no version → 422", (await call("PATCH", `/${vancouver.id}`, owner.token, { name: "V2" })).status === 422);
  const lines = await db.auditEvent.count({ where: { entityKey: vancouver.id } });
  ok("PF-18a fail (review m3): a change that changes nothing → 200 and no audit line", (await patch(vancouver.id, owner.token, {})).status === 200 && (await patch(vancouver.id, owner.token, { name: "Vancouver" })).status === 200 && (await db.auditEvent.count({ where: { entityKey: vancouver.id } })) === lines);
  // Two adds at once on a firm with none (the breaker's two parallel writes): both land, one first office.
  const placeTwo = await Promise.all([calgary, vancouver.id].map((o) => new Offices({ db, audit: auditEvent }).setStaffOffice({ firmId: firmA, staffId: owner.id }, reader.id, o))), placeFroms = (await db.auditEvent.findMany({ where: { action: "platform.office.staff", entityKey: reader.id } })).map((l) => (l.detail as any).fromOffice);
  ok("PF-18a pass (Devin review): two placements of one person at once audit the true before (one from none, the other from the first's office)", placeTwo.length === 2 && placeFroms.length === 2 && placeFroms.filter((f) => f === null).length === 1, placeFroms);
  const [p1, p2] = await Promise.all([call("POST", "", ownerB.token, { name: "Montreal", province: "QC" }), call("POST", "", ownerB.token, { name: "Ottawa", province: "ON" })]);
  ok("PF-18a pass: two adds at once on a firm with no office both land, with exactly one first office", p1.status === 201 && p2.status === 201 && sql(EMPTY, `select count(*) || ':' || count(*) filter (where is_first) from platform_office where firm_id = '${firmB}'`) === "3:1", [p1.status, p2.status]);
  const ins = (cols: string) => `insert into platform_office (firm_id, name, time_zone, business_hours, closed_days, created_by, updated_at${cols ? ", " + cols.split("=")[0] : ""}) values ('${firmA}', 'Db ${Math.random()}', `;
  ok("PF-18a DB fail: a zone PostgreSQL does not know by that exact name ('America/Toronto ' with a space) is refused", refused(EMPTY, `${ins("")}'America/Toronto ', '[]', '[]', 'seed:pf18a', now())`, /not a time zone name/));
  ok("PF-18a DB fail: a Canadian province not on the list, or a province abroad, is refused", refused(EMPTY, `insert into platform_office (firm_id, name, province, time_zone, business_hours, closed_days, created_by, updated_at) values ('${firmA}', 'Db p', 'ZZ', 'America/Toronto', '[]', '[]', 'seed:pf18a', now())`, /province_check/)
    && refused(EMPTY, `insert into platform_office (firm_id, name, province, country_code, time_zone, business_hours, closed_days, created_by, updated_at) values ('${firmA}', 'Db q', 'AB', 'US', 'America/Toronto', '[]', '[]', 'seed:pf18a', now())`, /province_check/));
  ok("PF-18a DB fail: an office of a firm that does not exist is refused", refused(EMPTY, `insert into platform_office (firm_id, name, time_zone, business_hours, closed_days, created_by, updated_at) values (gen_random_uuid(), 'Db f', 'America/Toronto', '[]', '[]', 'seed:pf18a', now())`, /platform_office_firm_id_fkey/));
  ok("PF-18a DB fail: a second first office, a changed firm or first flag, and a removal are refused", refused(EMPTY, `insert into platform_office (firm_id, name, time_zone, business_hours, closed_days, created_by, is_first, updated_at) values ('${firmA}', 'Db first', 'America/Toronto', '[]', '[]', 'seed:pf18a', true, now())`, /platform_office_one_first/)
    && refused(EMPTY, `update platform_office set is_first = not is_first where id = '${calgary}'`, /never change/) && refused(EMPTY, `update platform_office set firm_id = '${firmB}' where id = '${calgary}'`, /never change/)
    && refused(EMPTY, `delete from platform_office where id = '${calgary}'`, /never removed/));
  ok("PF-18a DB fail: placing firm B's person in a firm A row, or a person who does not exist, is refused", refused(EMPTY, `insert into platform_staff_office (staff_id, firm_id, office_id, set_by, updated_at) values ('${ownerB.id}', '${firmA}', '${calgary}', 'seed:pf18a', now())`, /platform_staff_office_firm_id_staff_id_fkey/)
    && refused(EMPTY, `insert into platform_staff_office (staff_id, firm_id, office_id, set_by, updated_at) values (gen_random_uuid(), '${firmA}', '${calgary}', 'seed:pf18a', now())`, /platform_staff_office_firm_id_staff_id_fkey/));
  const mkStaff = async (e: string) => (await db.platformStaff.create({ data: { firmId: firmA, email: `${e}@pf18a.example.com`, displayName: `Sample ${e}` } })).id;
  const loose = await mkStaff("loose"), placedS = await mkStaff("placed"); sql(EMPTY, `insert into platform_staff_office (staff_id, firm_id, office_id, set_by, updated_at) values ('${placedS}', '${firmA}', '${calgary}', 'seed:pf18a', now())`);
  ok("PF-18a DB (review m5): a staff member with an office, or a firm with offices, cannot be deleted (RESTRICT); one with no office can", refused(EMPTY, `delete from platform_staff where id = '${placedS}'`, /platform_staff_office_firm_id_staff_id_fkey/) && refused(EMPTY, `delete from platform_firm where id = '${firmA}'`, /fkey/) && sql(EMPTY, `delete from platform_staff where id = '${loose}' returning id`) === loose);
  ok("PF-18a DB fail: a person's row naming another firm's office breaks the (firm, office) key", refused(EMPTY, `insert into platform_staff_office (staff_id, firm_id, office_id, set_by, updated_at) values ('${owner.id}', '${firmA}', '${p1.body.office.id}', 'seed:pf18a', now())`, /foreign key|fkey/));
  ok("PF-18a DB fail (break B5): hours, closed days or a zone the code would refuse are refused by the database too", ["'[1,2]', '[]', 'America/Toronto'", `'[{"day":"MON","opens":"9","closes":"17:00"}]', '[]', 'America/Toronto'`, `'[]', '["nope",5]', 'America/Toronto'`, "'[]', '[]', 'Factory'"].every((v) => refused(EMPTY, `insert into platform_office (firm_id, name, business_hours, closed_days, time_zone, created_by, updated_at) values ('${firmA}', 'B5 ${Math.random()}', ${v}, 'seed:pf18a', now())`, /check/)));
  const mail = await call("POST", "", owner.token, { name: "help@example.com", province: "AB" }), many = Array.from({ length: 51 }, (_, i) => new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10));
  await patch(mail.body.office.id, owner.token, { closedDays: many }); const swap = await patch(mail.body.office.id, owner.token, { closedDays: [...many.slice(0, 50), "2027-12-31"] }); const swapLine = await db.auditEvent.findFirst({ where: { entityKey: mail.body.office.id, action: "platform.office.change" }, orderBy: { at: "desc" } });
  ok("PF-18a pass (Devin review): an email-shaped office name saves (the audit keeps no name text); replacing closed day 51 is audited as removed and added", mail.status === 201 && swap.status === 200 && JSON.stringify((swapLine?.detail as any)?.closedDaysRemoved) === JSON.stringify([many[50]]) && JSON.stringify((swapLine?.detail as any)?.closedDaysAdded) === '["2027-12-31"]', [mail.status, swap.status, swapLine?.detail]);
  ok("PF-18a fail (break B6, B7): an invisible or direction character in a name, a second spelling of a name, or country ZZ → 422 or 409; 61 emoji are a name", (await call("POST", "", owner.token, { name: "Cal\u200bgary" })).status === 422 && (await call("POST", "", owner.token, { name: "Calgary\u202e" })).status === 422 && (await call("POST", "", owner.token, { name: "Cafe\u0301" })).status === 201 && (await call("POST", "", owner.token, { name: "Caf\u00e9" })).status === 409 && (await call("POST", "", owner.token, { name: "Z", country: "ZZ" })).status === 422 && (await call("POST", "", owner.token, { name: "😀".repeat(61) })).status === 201);
  ok("PF-18a DB fail (break B1): a name that differs only by case is refused by the database too", refused(EMPTY, `insert into platform_office (firm_id, name, time_zone, business_hours, closed_days, created_by, updated_at) values ('${firmA}', 'CALGARY', 'America/Toronto', '[]', '[]', 'seed:pf18a', now())`, /platform_office_firm_name_ci/));
  ok("PF-18a walls fail (break B9): as xr_app a person's row is never moved to another person; its office may change", refused(EMPTY, `begin; select set_config('app.firm_id', '${firmA}', true); update platform_staff_office set staff_id = '${loose}' where staff_id = '${placedS}'; commit;`, /permission denied/, "xr_app") && asApp(EMPTY, firmA, `update platform_staff_office set office_id = office_id where staff_id = '${placedS}' returning 1`) === "1");
  let outside = ""; try { await withFirm(firmB, () => clock.zoneFor(firmA, null)); } catch (e) { outside = String((e as Error).message); }
  ok("PF-18a fail (break B3): OfficeClock asked for firm A under firm B's scope refuses, never the defaults; in firm A's own scope it answers", /not readable here/.test(outside) && (await withFirm(firmA, () => clock.zoneFor(firmA, null))) === "America/Toronto", outside);
  ok("PF-18a fail (break B4): a zone the code knows and PostgreSQL does not → 400, not 500", (await patch(calgary, owner.token, { timeZone: "US/Pacific-New" })).status === 422 && await (async () => { const f = await db.platformFirm.create({ data: { key: "pf18a-b4", operatingName: "B4", countryCode: "CA", status: "ACTIVE", contactEmail: "b4@pf18a.example.com" } }); await db.platformFirmSetting.create({ data: { firmId: f.id, key: TIME_ZONE.key, value: "US/Pacific-New", changedBy: "seed:pf18a" } }); const o = await person(f.id, "OWNER"); const r = await call("POST", "", o.token, { name: "B4 office", province: "AB" }); return r.status === 422 && /firm's own time zone/.test(r.body.detail); })());
  ok("PF-18a walls pass: as xr_app with no firm, both tables read nothing", asApp(EMPTY, null, "select count(*) from platform_office") === "0" && asApp(EMPTY, null, "select count(*) from platform_staff_office") === "0");
  ok("PF-18a walls pass: firm A's session reads its own offices only; firm B's rows read nothing", asApp(EMPTY, firmA, `select count(*) from platform_office where firm_id = '${firmA}'`) === sql(EMPTY, `select count(*) from platform_office where firm_id = '${firmA}'`) && asApp(EMPTY, firmA, `select count(*) from platform_office where firm_id = '${firmB}'`) === "0");
  ok("PF-18a walls fail: firm A's session writing an office of firm B is refused", refused(EMPTY, `begin; select set_config('app.firm_id', '${firmA}', true); insert into platform_office (firm_id, name, time_zone, business_hours, closed_days, created_by, updated_at) values ('${firmB}', 'W', 'America/Toronto', '[]', '[]', 'seed:pf18a', now()); commit;`, /row-level security/, "xr_app"));
  ok("PF-18a walls pass: firm A's session adds its own office (the keys and the wall reader's triggers let it through)", /^[0-9a-f-]{36}$/.test(asApp(EMPTY, firmA, `insert into platform_office (firm_id, name, time_zone, business_hours, closed_days, created_by, updated_at) values ('${firmA}', 'As app', 'America/Toronto', '[]', '[]', 'seed:pf18a', now()) returning id`)));
  let k = 0;
  const realHarness = async (): Promise<OfficeClockHarness> => {
    const mk = async () => (await db.platformFirm.create({ data: { key: `pf18a-c-${++k}`, operatingName: `Contract ${k}`, countryCode: "CA", status: "ACTIVE", contactEmail: `c${k}@pf18a-c.example.com` } })).id;
    const a = await mk(), b = await mk();
    return {
      port: new OfficeClock(db), firmA: a, firmB: b,
      async setFirm(firmId, v) { for (const [key, value] of [[TIME_ZONE.key, v.zone], [BUSINESS_HOURS.key, v.hours], [CLOSED_DAYS.key, v.closedDays]] as const) await writeSetting(db, { firmId, key, value, by: "seed:pf18a", workspaceId: ws }); },
      async addOffice(firmId, v: OfficeClockValues) { return (await db.platformOffice.create({ data: { firmId, name: `O ${globalThis.crypto.randomUUID()}`, timeZone: v.zone, businessHours: v.hours, closedDays: v.closedDays, createdBy: "seed:pf18a" } })).id; },
      async newStaff(firmId) { return (await db.platformStaff.create({ data: { firmId, email: `s${++n}@pf18a.example.com`, displayName: `Sample ${n}` } })).id; },
      async assign(firmId, staffId, officeId) { await db.platformStaffOffice.create({ data: { firmId, staffId, officeId, setBy: "seed:pf18a" } }); },
    };
  };
  const fakeHarness = (): OfficeClockHarness => {
    const f = fakeOfficeClock(), a = globalThis.crypto.randomUUID(), b = globalThis.crypto.randomUUID();
    return { port: f, firmA: a, firmB: b, async setFirm(id, v) { f.setFirm(id, v); }, async addOffice(id, v) { return f.addOffice(id, v); }, async newStaff() { return globalThis.crypto.randomUUID(); }, async assign(id, s, o) { f.assign(id, s, o); } };
  };
  await runContract(officeClockPortContract, "OfficeClock", realHarness, ok);
  await runContract(officeClockPortContract, "fakeOfficeClock", fakeHarness, ok);
  const broken = await runContract(officeClockPortContract, "fakeOfficeClock", () => { const h = fakeHarness(); return { ...h, port: { ...h.port, zoneFor: async () => "America/Toronto" } }; }, null);
  ok("PF-18a DW7 fail: an adapter that always answers the firm's zone breaks the contract", broken.failed.length > 0, broken);
  const contracts = spawnSync(process.execPath, [join(STUDIO, "tools", "check-port-contracts.mjs")], { cwd: STUDIO, encoding: "utf8" });
  ok("PF-18a DW7 pass: tools/check-port-contracts.mjs passes (OfficeClockPort has its contract, both adapters run it)", contracts.status === 0, `${contracts.stdout}${contracts.stderr}`.slice(-600));
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await db.$disconnect(); for (const d of [EMPTY, DEMO, BARE]) execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", d]);
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
