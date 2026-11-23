// PF-21b part 2 (R1.85; brief design/briefs/track-b/PF-21b-2.md; SA-11 §3.5, SA-11-40, SA7-D74 (a), BR-7, BR-12): the
// legal-hold register, LegalHoldPort's real adapter and our console's routes. Each "Done when" line passes and fails:
// DW2 the shared contract on the real adapter (and the firm's own path through the definer); DW3 the routes: a firm's
// staff, our Support and Admin → 403, the Platform Owner → 200, one audit line per place and per release, a second
// release → 409 with nothing changed; DW4 a test-only deleter calling AUD-5's KeepPeriods.check with the real adapter
// answers HELD with the reason and keeps the row, proceeds after release, and firm A's hold never holds firm B; DW6 no
// firm route for holds, the database refuses DELETE and TRUNCATE, the migration measured right after itself on an empty
// and a demo-data copy, migrate diff empty. Plus the breaker's cases: a hold placed while a deleter is open waits for it;
// a firm's session can never place, release or read; REPEATABLE READ is refused; two parallel releases → one wins.
// One process, scratch databases (dropped at the end), no model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf21b_holds.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runContract } from "../ports/contracts/contract.ts";
import { legalHoldPortContract, type LegalHoldHarness } from "../ports/contracts/legal-hold-port.contract.ts";
import { LegalHoldRefused } from "../ports/legal-hold.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261122180000_pf21b_legal_holds";
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf21b_${process.pid}`, EMPTY = `xr_studio_pf21b_empty_${process.pid}`, DEMO = `xr_studio_pf21b_demo_${process.pid}`;
const WORK = join(STUDIO, "var", `pf21b-${process.pid}`);
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
const psqlFile = (db: string, f: string) => execFileSync(join(BIN, "psql"), [urlOf(db), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", f], { stdio: ["ignore", "ignore", "pipe"] });
const sqlOn = (db: string, q: string, user = "xr_studio") => execFileSync(join(BIN, "psql"), [urlOf(db, user), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string, user = "xr_studio") => sqlOn(DB, q, user);
const refusedBySql = (q: string, like: RegExp, user = "xr_studio") => { try { sql(q, user); return false; } catch (e) { return like.test(String((e as { stderr?: unknown }).stderr ?? e)); } };
/** As the app's role, in one transaction acting for `firm` (or none, our own staff's plane). */
const asApp = (firm: string | null, q: string) => sql(`begin; select set_config('app.firm_id', '${firm ?? ""}', true); ${q}; commit`, "xr_app").split("\n").filter((l) => l !== "" && l !== firm).join("\n");
const refusedAsApp = (firm: string | null, q: string, like: RegExp) => { try { asApp(firm, q); return false; } catch (e) { return like.test(String((e as { stderr?: unknown }).stderr ?? e)); } };

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const throwsLike = async (f: () => unknown, test: (e: unknown) => boolean) => { try { await f(); return false; } catch (e) { return test(e); } };
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const uuid = () => globalThis.crypto.randomUUID();
const settledWithin = async (p: Promise<unknown>, ms: number) => { let done = false; p.then(() => { done = true; }, () => { done = true; }); await pause(ms); return done; };

type Res = { status: number; body: any };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "pf21b-check/1" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text();
  let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};

// ------------------------------------------------------------------------------------------- the scratch databases
for (const d of [DB, EMPTY, DEMO]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", d]); execFileSync(join(BIN, "createdb"), [...PG, d]); }
const all = readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort();
for (const d of all) psqlFile(DB, join(MIG, d, "migration.sql"));
process.env.DATABASE_URL = urlOf(DB);
for (const k of Object.keys(process.env)) if (/^PLATFORM_/.test(k)) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { appDatabaseUrl, wallUnscopedQueries, WalledPool, withFirm } = await import("../api/src/platform/firm-scope.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { requestMiddleware } = await import("../api/src/platform/observability/hook.ts");
const { SystemLocalIdentity } = await import("../api/src/platform/system-identity/local.ts");
const { SYSTEM_IDENTITY_PORT, SystemIdentity } = await import("../api/src/platform/system-identity/service.ts");
const { SystemGuard, SystemPlaneWall } = await import("../api/src/platform/system-identity/guard.ts");
const { SystemIdentityController } = await import("../api/src/platform/system-identity/routes.ts");
const { PgLegalHolds, LegalHoldTxRefused } = await import("../api/src/platform/register/holds/adapter.ts");
const { LegalHolds, LEGAL_HOLD_AUDIT, LEGAL_HOLD_KEY } = await import("../api/src/platform/register/holds/service.ts");
const { LegalHoldController } = await import("../api/src/platform/register/holds/routes.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { KeepPeriods, KEEP_CHECK_HOLDS } = await import("../api/src/platform/keep-period/service.ts");
const feature = (await import("../api/src/features/platform-register-holds.ts")).default;

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
wallUnscopedQueries();   // as the API server: a query outside every scope runs as xr_app with no firm (our staff's plane)
const pool = new WalledPool({ connectionString: appDatabaseUrl(urlOf(DB), {}), max: 6, options: "-c TimeZone=UTC" });
const walled = new PrismaClient({ adapter: new PrismaPg(pool) });
const holds = new PgLegalHolds();
const svc = new LegalHolds(walled, auditEvent);
const by = "staff:5b1f3a8e-0000-4000-8000-0000000000a1";
const newFirm = async () => { const k = `pf21b-${uuid().slice(0, 8)}`; return (await owner.$queryRaw<{ id: string }[]>`insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at)
  values (gen_random_uuid(), ${k}, 'Sample hold firm', 'CA', ${`${k}@sample-firm.example`}, now()) returning id::text as id`)[0].id; };
const holdLines = (firm: string, action: string) => Number(sql(`select count(*) from audit_event where firm_id = '${firm}' and action = '${action}'`));
/** A firm's deleter: its own firm's transaction as xr_app. */
const asFirm = <T>(firm: string, fn: (tx: any) => Promise<T>) => withFirm(firm, () => walled.$transaction(fn));

const apps: { close(): Promise<void> }[] = [];
try {
  const firmA = await newFirm(), firmB = await newFirm();

  // ----------------------------------------------------------------------------------- DW2: the shared contract
  const make = async (): Promise<LegalHoldHarness> => ({
    holds: holds as never, tx: (fn) => owner.$transaction(fn as never) as never, firmA: await newFirm(), firmB: await newFirm(), by,
    place: (input, during) => svc.placeAs(input.by, { firmId: input.firmId, scope: input.scope, reason: input.reason }, during),
    release: (input, during) => svc.releaseAs(input, during),
  });
  const real = await runContract(legalHoldPortContract, "PgLegalHolds", make, ok);
  ok(`PF-21b DW2 pass: the shared LegalHoldPort contract passes on the real adapter over plat_legal_hold (${real.passed.length} cases; placements and releases on our staff's plane as xr_app)`, real.failed.length === 0 && real.passed.length === legalHoldPortContract(make as never).length, real.failed);
  // Review m1: the same contract on the path the app uses: each isHeld in an xr_app transaction acting for the asked firm,
  // reading through plat_legal_hold_active (the adapter itself unchanged; the wrapper only names the session's firm).
  const asFirmHolds = { isHeld: async (t: any, firm: string, subjects: any) => { await t.$executeRaw`select set_config('app.firm_id', ${firm.toLowerCase()}, true)`; return holds.isHeld(t, firm, subjects); } };
  const makeWalled = async (): Promise<LegalHoldHarness> => ({ ...(await make()), holds: asFirmHolds as never, tx: (fn) => walled.$transaction(fn as never) as never });
  const viaFirm = await runContract(legalHoldPortContract, "PgLegalHolds", makeWalled, ok);
  ok(`PF-21b DW2 pass (review m1): the same contract passes on the app's own path, xr_app in the asked firm's session through plat_legal_hold_active (${viaFirm.passed.length} cases)`, viaFirm.failed.length === 0 && viaFirm.passed.length === real.passed.length, viaFirm.failed);
  const tool = spawnSync(process.execPath, [join(STUDIO, "tools", "check-port-contracts.mjs")], { cwd: STUDIO, encoding: "utf8" });
  ok("PF-21b DW2 pass: tools/check-port-contracts.mjs finds the real adapter's contract call (exit 0)", tool.status === 0, `${tool.stdout}${tool.stderr}`.slice(-500));

  // The firm's own path (xr_app in its firm's transaction, through the definer), and its refusals.
  const p1 = uuid(), p2 = uuid();
  const personHold = await svc.placeAs(by, { firmId: firmA, scope: { kind: "PERSON", id: p1 }, reason: "Sample: court order on a person's records" });
  const mine = await asFirm(firmA, (tx) => holds.isHeld(tx, firmA, [{ kind: "PERSON", id: p1 }]));
  const other = await asFirm(firmA, (tx) => holds.isHeld(tx, firmA, [{ kind: "PERSON", id: p2 }]));
  ok("PF-21b DW2 pass (firm's path): in firm A's own transaction as xr_app, the person hold is held with its reason; another person is not",
    mine.held && mine.holds[0].holdId === personHold.holdId && mine.holds[0].reason === "Sample: court order on a person's records" && !other.held, { mine, other });
  ok("PF-21b DW2 fail (firm's path): firm A's session asking about firm B is refused by the database, never answered 'not held'",
    await throwsLike(() => asFirm(firmA, (tx) => holds.isHeld(tx, firmB, [{ kind: "FIRM" }])), (e) => /only the session's own firm's holds/.test(String(e))));
  ok("PF-21b DW2 fail (fail-closed): xr_app with no firm asking isHeld is refused, never a silent 'not held' (forced row-level security would read nothing)",
    await throwsLike(() => walled.$transaction((tx) => holds.isHeld(tx, firmA, [{ kind: "PERSON", id: p1 }])), (e) => /only the session's own firm's holds/.test(String(e))));
  ok("PF-21b DW2 fail (rule 3): isHeld on the root client, and in a REPEATABLE READ or SERIALIZABLE transaction, is refused",
    await throwsLike(() => holds.isHeld(owner as never, firmA, [{ kind: "FIRM" }]), (e) => e instanceof LegalHoldTxRefused)
    && await throwsLike(() => owner.$transaction((tx) => holds.isHeld(tx, firmA, [{ kind: "FIRM" }]), { isolationLevel: "RepeatableRead" }), (e) => e instanceof LegalHoldTxRefused && /READ COMMITTED/.test(String(e)))
    && await throwsLike(() => owner.$transaction((tx) => holds.isHeld(tx, firmA, [{ kind: "FIRM" }]), { isolationLevel: "Serializable" }), (e) => e instanceof LegalHoldTxRefused));

  // A firm's session can never place, release, list or read a hold (the database, whatever the code does).
  ok("PF-21b DW3 fail (database wall, review m4): placing inside a firm's session is refused by the database (svc.placeAs as firm A); with no firm the gate is the code's (PF-4s's guard and the key)",
    await throwsLike(() => withFirm(firmA, () => svc.placeAs(by, { firmId: firmA, scope: { kind: "FIRM" }, reason: "Sample: from a firm" })), (e) => /only ExpatReady's own staff/.test(String(e))));
  ok("PF-21b DW3 fail (database wall): releasing and listing inside a firm's session are refused; a direct read or insert as xr_app reads and writes nothing",
    await throwsLike(() => withFirm(firmA, () => svc.releaseAs({ holdId: personHold.holdId, by, reason: "Sample: from a firm" })), (e) => /only ExpatReady's own staff/.test(String(e)))
    && refusedAsApp(firmA, `select count(*) from plat_legal_hold_list(null, null, null, 10)`, /only ExpatReady's own staff/)
    && asApp(firmA, `select count(*) from plat_legal_hold`) === "0" && asApp(null, `select count(*) from plat_legal_hold`) === "0"
    && refusedAsApp(firmA, `insert into plat_legal_hold (id, firm_id, scope_kind, reason, placed_by) values (gen_random_uuid(), '${firmA}', 'FIRM', 'x', 'staff:x')`, /row-level security|permission denied/)
    && sql(`select released_at is null from plat_legal_hold where id = '${personHold.holdId}'`) === "t");

  // ------------------------------------------------------------------------------------ DW6: the database rules
  ok("PF-21b DW6 fail: a DELETE of a hold, and a TRUNCATE, are refused by the database (even for the owner)",
    refusedBySql(`delete from plat_legal_hold where id = '${personHold.holdId}'`, /released, never deleted/) && refusedBySql(`truncate plat_legal_hold`, /released, never deleted/)
    && sql(`select count(*) from plat_legal_hold where id = '${personHold.holdId}'`) === "1");
  ok("PF-21b DW6 fail: a hold's facts never change (its reason), a release must name who and why, and a second release is refused by the database",
    refusedBySql(`update plat_legal_hold set reason = 'changed' where id = '${personHold.holdId}'`, /facts never change/)
    && refusedBySql(`update plat_legal_hold set released_by = '${by}' where id = '${personHold.holdId}'`, /names who released it and why/)
    && sql(`update plat_legal_hold set released_by = '${by}', release_reason = 'Sample: owner release in SQL' where id = '${personHold.holdId}' returning released_at is not null`) === "t"
    && refusedBySql(`update plat_legal_hold set released_by = '${by}', release_reason = 'again' where id = '${personHold.holdId}'`, /already released/));
  ok("PF-21b DW6 fail: a scope without its target, a date range ending before it starts, an unknown firm, an empty reason and a bare actor are refused",
    refusedBySql(`insert into plat_legal_hold (id, firm_id, scope_kind, reason, placed_by) values (gen_random_uuid(), '${firmA}', 'CASE', 'r', '${by}')`, /plat_legal_hold_scope_shape/)
    && refusedBySql(`insert into plat_legal_hold (id, firm_id, scope_kind, range_from, range_to, reason, placed_by) values (gen_random_uuid(), '${firmA}', 'DATE_RANGE', '2026-02-01', '2026-01-01', 'r', '${by}')`, /plat_legal_hold_scope_shape/)
    && refusedBySql(`insert into plat_legal_hold (id, firm_id, scope_kind, reason, placed_by) values (gen_random_uuid(), '${uuid()}', 'FIRM', 'r', '${by}')`, /no such firm/)
    && refusedBySql(`insert into plat_legal_hold (id, firm_id, scope_kind, reason, placed_by) values (gen_random_uuid(), '${firmA}', 'FIRM', '  ', '${by}')`, /plat_legal_hold_facts_set/)
    && refusedBySql(`insert into plat_legal_hold (id, firm_id, scope_kind, reason, placed_by) values (gen_random_uuid(), '${firmA}', 'FIRM', 'r', 'test')`, /plat_legal_hold_facts_set/));
  ok("PF-21b DW6 pass: the placement time is the database's, never the caller's (a back-dated placed_at is replaced)",
    sql(`insert into plat_legal_hold (id, firm_id, scope_kind, reason, placed_by, placed_at) values (gen_random_uuid(), '${firmB}', 'CATEGORY', 'Sample: backdate', '${by}', '2000-01-01') returning placed_at > now() - interval '1 minute'`) === "t");
  sql(`update plat_legal_hold set released_by = '${by}', release_reason = 'Sample: cleanup' where firm_id = '${firmB}' and released_at is null`);

  // ------------------------------------------------- breaker: a hold placed while a deleter is open waits for it
  const p3 = uuid();
  sql(`create table pf21b_probe (firm_id uuid not null, person_id uuid not null, note text); grant select, insert, delete on pf21b_probe to xr_data`);
  const seedProbe = (firm: string, person: string) => sql(`insert into pf21b_probe values ('${firm}', '${person}', 'Sample record')`);
  const probe = (firm: string, person: string) => Number(sql(`select count(*) from pf21b_probe where firm_id = '${firm}' and person_id = '${person}'`));
  const kp = new KeepPeriods(walled as never, holds as never, () => new Date());
  /** The test-only deleter (BR-7, BR-12): AUD-5's check first, in the firm's own transaction; HELD → nothing deleted. */
  const deleteRecord = (firm: string, person: string, during?: () => Promise<void>) => asFirm(firm, async (tx) => {
    const v = await kp.check(tx, { firmId: firm, class: "closed_client_file", startedAt: new Date("2005-01-01T00:00:00Z"), subject: [{ kind: "CASE", id: uuid() }, { kind: "PERSON", id: person }], recordDates: [new Date("2005-01-01T00:00:00Z")] });
    if (v.verdict === "HELD") return { status: "HELD" as const, words: v.words, reasons: v.reasons };
    if (v.verdict === "FLOOR") return { status: "FLOOR" as const };
    await during?.();
    const n = await tx.$executeRaw`delete from pf21b_probe where firm_id = ${firm}::uuid and person_id = ${person}::uuid`;
    return { status: "DELETED" as const, n };
  });
  seedProbe(firmA, p3);
  // The placement is our staff's (no firm): registered here, outside the deleter's firm scope, and started from inside it.
  let go!: () => void, waited = false;
  const placing = new Promise<void>((r) => { go = r; }).then(() => svc.placeAs(by, { firmId: firmA, scope: { kind: "PERSON", id: p3 }, reason: "Sample: placed mid-delete" }));
  const first = await deleteRecord(firmA, p3, async () => { go(); waited = !(await settledWithin(placing, 300)); });
  await placing;
  seedProbe(firmA, p3);
  const next = await deleteRecord(firmA, p3);
  ok("PF-21b breaker pass (no race): a hold placed while a deleter's transaction is open waits for that deleter to finish; the next deleter sees the hold and keeps the row",
    first.status === "DELETED" && waited && next.status === "HELD" && probe(firmA, p3) === 1, { first, waited, next });

  // --------------------------------------------------------------- DW4: the delete check with the real adapter
  const p4 = uuid();
  seedProbe(firmA, p4); seedProbe(firmB, p4);
  const h4 = await svc.placeAs(by, { firmId: firmA, scope: { kind: "PERSON", id: p4 }, reason: "Sample: regulator's inquiry" });
  const held = await deleteRecord(firmA, p4);
  ok("PF-21b DW4 pass (BR-12): the deleter calling KeepPeriods.check with the real adapter answers HELD with the hold's reason and leaves the row",
    held.status === "HELD" && held.reasons.includes("Sample: regulator's inquiry") && /legal hold/.test(held.words) && probe(firmA, p4) === 1, held);
  const otherFirm = await deleteRecord(firmB, p4);
  ok("PF-21b DW4 fail: firm A's hold never holds firm B (the same person id in firm B is deleted)", otherFirm.status === "DELETED" && probe(firmB, p4) === 0, otherFirm);
  await svc.releaseAs({ holdId: h4.holdId, by, reason: "Sample: inquiry closed" });
  const after = await deleteRecord(firmA, p4);
  ok("PF-21b DW4 pass: after the release the same delete goes ahead (the row is gone)", after.status === "DELETED" && probe(firmA, p4) === 0, after);
  ok("PF-21b DW4 fail (never a false success): no deleter answered DELETED while its record was held",
    held.status !== "DELETED" && next.status !== "DELETED");

  // --------------------------------------------------------------------------------- DW3: the routes, end to end
  const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
  const firmLocal = new LocalIdentity("pf21b-firm-standin-key-0123456789abcdef", () => clock.now());
  const systemLocal = new SystemLocalIdentity("pf21b-system-standin-key-0123456789abc", () => clock.now());
  @Module({ controllers: [PlatformIdentityController, SystemIdentityController, ...feature.controllers] as never[],
    providers: [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: firmLocal }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
      { provide: SYSTEM_IDENTITY_PORT, useValue: systemLocal }, SystemIdentity, SystemPlaneWall, SystemGuard, { provide: APP_GUARD, useExisting: SystemGuard },
      { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, ...feature.providers] as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  app.use(requestMiddleware());
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  ok("PF-21b DW4 pass: in the app, AUD-5's delete check gets the real adapter under KEEP_CHECK_HOLDS (no KeepCheckNotBuilt)", app.get(KEEP_CHECK_HOLDS) instanceof PgLegalHolds && app.get(LEGAL_HOLD_AUDIT) === auditEvent);

  await seedSampleFirms(owner);
  const person = async (name: string, roles: string[]) => (await owner.platSystemStaff.create({ data: { email: `${name.toLowerCase()}.pf21b@expatready.example`, displayName: `Sample ${name}`, grants: { create: roles.map((roleCode) => ({ roleCode })) } } })).id;
  const OWNER = await person("Owner", ["platform-owner"]), SUPPORT = await person("Support", ["platform-support"]), ADMIN = await person("Admin", ["platform-admin"]), AUDITOR = await person("Auditor", ["platform-auditor"]);
  const tokenOf = async (id: string) => { const email = (await owner.platSystemStaff.findUniqueOrThrow({ where: { id } })).email; const r = await call(base, "POST", "/api/system/session/local", { body: { email, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const ownerT = await tokenOf(OWNER), supportT = await tokenOf(SUPPORT), adminT = await tokenOf(ADMIN), auditorT = await tokenOf(AUDITOR);
  const firmT = (await call(base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId: "user-R", secondStep: true } })).body.token as string;
  const sampleFirm = sql(`select id from platform_firm where key = 'sample-firm'`);
  const firmMe = await call(base, "GET", "/api/platform/me", { token: firmT });
  ok("PF-21b DW3 (review m5): the firm token used below is a firm admin's that holds agent/legal-hold:manage (the dormant firm key)", firmMe.status === 200 && firmMe.body.keys.includes("agent/legal-hold:manage"), firmMe.body?.keys);
  ok("PF-21b DW3 pass (SA7-D74 (a)): the migration gives system/compliance:legal-hold to the Platform Owner only",
    sql(`select string_agg(role_code, ',') from plat_system_role_permission where permission_key = '${LEGAL_HOLD_KEY}'`) === "platform-owner");

  const c = uuid(), body = { firmId: sampleFirm, scope: { kind: "CASE", id: c }, reason: "Sample: litigation on this case" };
  const placedBefore = holdLines(sampleFirm, "platform.legal_hold.placed"), rowsBefore = Number(sql(`select count(*) from plat_legal_hold`));
  const refusals = await Promise.all([firmT, supportT, adminT, auditorT].map((t) => call(base, "POST", "/api/system/register/holds", { token: t, body })));
  const listRefusals = await Promise.all([firmT, supportT, adminT].map((t) => call(base, "GET", "/api/system/register/holds", { token: t })));
  ok("PF-21b DW3 fail: a firm's staff token (user-R, the Sample firm's representative and firm admin), our Support, Admin and Auditor → 403 on place and list; no hold, no line",
    refusals.every((r) => r.status === 403) && listRefusals.every((r) => r.status === 403) && refusals[0].body.code === "FIRM_SESSION_REFUSED"
    && Number(sql(`select count(*) from plat_legal_hold`)) === rowsBefore && holdLines(sampleFirm, "platform.legal_hold.placed") === placedBefore, { refusals: refusals.map((r) => [r.status, r.body.code]), listRefusals: listRefusals.map((r) => r.status) });
  const anon = await call(base, "GET", "/api/system/register/holds");
  ok("PF-21b DW3 fail: no token → 401", anon.status === 401, anon);
  const noReason = await call(base, "POST", "/api/system/register/holds", { token: ownerT, body: { firmId: sampleFirm, scope: { kind: "CASE", id: c } } });
  const badScope = await call(base, "POST", "/api/system/register/holds", { token: ownerT, body: { ...body, scope: { kind: "CATEGORY", category: "everything" } } });
  const noFirm = await call(base, "POST", "/api/system/register/holds", { token: ownerT, body: { ...body, firmId: uuid() } });
  ok("PF-21b DW3 fail: the Platform Owner without a reason (400, the guard), with an unknown category (422) or an unknown firm (404) places nothing",
    noReason.status === 400 && badScope.status === 422 && noFirm.status === 404 && noFirm.body.code === "FIRM_NOT_FOUND" && Number(sql(`select count(*) from plat_legal_hold`)) === rowsBefore, { noReason, badScope, noFirm });
  const placed = await call(base, "POST", "/api/system/register/holds", { token: ownerT, body });
  ok("PF-21b DW3 pass: the Platform Owner places a hold → 201 with scope, reason, placed by staff:<id>, active; one audit line on the held firm's trail",
    placed.status === 201 && placed.body.scope.kind === "CASE" && placed.body.scope.id === c && placed.body.reason === body.reason && placed.body.placedBy === `staff:${OWNER}` && placed.body.active === true
    && holdLines(sampleFirm, "platform.legal_hold.placed") === placedBefore + 1, placed);
  const line = JSON.parse(sql(`select row_to_json(a) from (select actor, actor_type, entity_key, detail from audit_event where firm_id = '${sampleFirm}' and action = 'platform.legal_hold.placed' order by at desc, id desc limit 1) a`));
  ok("PF-21b DW3 pass: the line names the hold, our system actor (never typed as the firm's own staff) and the staff member's id in its detail",
    line.entity_key === placed.body.id && line.actor === "system:platform.register.legal-hold" && line.actor_type === "SYSTEM" && line.detail.staffId === OWNER, line);
  const values = JSON.parse(sql(`select detail from audit_event where firm_id = '${sampleFirm}' and action = 'platform.legal_hold.placed' order by at desc, id desc limit 1`));
  ok("PF-21b DW3 pass (review M1, QA-594): the placement line carries the hold's values in full as after-values (scope, target, reason, placed by), no before",
    values.scope_after === "CASE" && values.target_after === c && values.reason_after === body.reason && values.placedBy_after === `staff:${OWNER}` && !Object.keys(values).some((k) => k.endsWith("_before")), values);
  const listed = await call(base, "GET", `/api/system/register/holds?firm=${sampleFirm}&state=active`, { token: ownerT });
  ok("PF-21b DW3 pass: the Platform Owner lists the firm's active holds → 200 with the new hold", listed.status === 200 && listed.body.holds.some((h: { id: string }) => h.id === placed.body.id) && listed.body.holds.every((h: { firmId: string; active: boolean }) => h.firmId === sampleFirm && h.active), listed);
  const badList = await call(base, "GET", `/api/system/register/holds?firm=nope`, { token: ownerT });
  ok("PF-21b DW3 fail: a list filter that is not a firm id → 422", badList.status === 422, badList);
  const firmHeld = await withFirm(sampleFirm, () => walled.$transaction((tx) => holds.isHeld(tx, sampleFirm, [{ kind: "CASE", id: c }])));
  ok("PF-21b DW3 pass: the hold placed through the route holds that case for the firm's own deleter", firmHeld.held && firmHeld.holds[0].holdId === placed.body.id, firmHeld);

  const releasedBefore = holdLines(sampleFirm, "platform.legal_hold.released");
  const supportRelease = await call(base, "POST", `/api/system/register/holds/${placed.body.id}/release`, { token: supportT, body: { reason: "Sample: not mine to release" } });
  ok("PF-21b DW3 fail: our Support person releasing → 403, the hold stays active", supportRelease.status === 403 && sql(`select released_at is null from plat_legal_hold where id = '${placed.body.id}'`) === "t", supportRelease);
  const [r1, r2] = await Promise.all([1, 2].map((n) => call(base, "POST", `/api/system/register/holds/${placed.body.id}/release`, { token: ownerT, body: { reason: `Sample: litigation ended (${n})` } })));
  const statuses = [r1.status, r2.status].sort();
  const row = JSON.parse(sql(`select row_to_json(h) from (select released_by, release_reason from plat_legal_hold where id = '${placed.body.id}') h`));
  ok("PF-21b DW3 pass/fail (breaker: two parallel releases): one release → 200 (released, by staff:<id>), the other → 409 ALREADY_RELEASED; exactly one release line",
    JSON.stringify(statuses) === "[200,409]" && [r1, r2].find((r) => r.status === 409)!.body.code === "ALREADY_RELEASED" && row.released_by === `staff:${OWNER}`
    && holdLines(sampleFirm, "platform.legal_hold.released") === releasedBefore + 1, { r1, r2, row });
  const relLine = JSON.parse(sql(`select row_to_json(a) from (select summary, detail from audit_event where firm_id = '${sampleFirm}' and action = 'platform.legal_hold.released' order by at desc, id desc limit 1) a`));
  ok("PF-21b DW3 pass (review M1): the release line names the hold in its summary and carries before (active) and after (released, by whom, why, in full)",
    relLine.summary.includes(`case ${c}`) && relLine.detail.active_before === true && relLine.detail.active_after === false && relLine.detail.releasedBy_after === `staff:${OWNER}` && /^Sample: litigation ended/.test(relLine.detail.releaseReason_after), relLine);
  const again = await call(base, "POST", `/api/system/register/holds/${placed.body.id}/release`, { token: ownerT, body: { reason: "Sample: once more" } });
  const rowAfter = JSON.parse(sql(`select row_to_json(h) from (select released_by, release_reason from plat_legal_hold where id = '${placed.body.id}') h`));
  ok("PF-21b DW3 fail: a second release → 409, nothing changed (who and why kept), no new line",
    again.status === 409 && JSON.stringify(rowAfter) === JSON.stringify(row) && holdLines(sampleFirm, "platform.legal_hold.released") === releasedBefore + 1, { again, rowAfter });
  const unknownRelease = await call(base, "POST", `/api/system/register/holds/${uuid()}/release`, { token: ownerT, body: { reason: "Sample: no such hold" } });
  ok("PF-21b DW3 fail: releasing an unknown hold → 404", unknownRelease.status === 404, unknownRelease);
  const replaced = await call(base, "POST", "/api/system/register/holds", { token: ownerT, body: { ...body, reason: "Sample: litigation reopened" } });
  const replacedHeld = await withFirm(sampleFirm, () => walled.$transaction((tx) => holds.isHeld(tx, sampleFirm, [{ kind: "CASE", id: c }])));
  ok("PF-21b breaker pass: a release followed by a new hold on the same case holds again, by the new hold only",
    replaced.status === 201 && replacedHeld.held && replacedHeld.holds.length === 1 && replacedHeld.holds[0].holdId === replaced.body.id, replacedHeld);

  // --------------------------------------------- review M2, break M1: the list is filtered in the database, never cut silently
  const crowded = await newFirm();
  const oldHold = await svc.placeAs(by, { firmId: crowded, scope: { kind: "FIRM" }, reason: "Sample: the oldest, still active" });
  sql(`with h as (select plat_legal_hold_place('${crowded}', 'CASE', gen_random_uuid(), null, null, null, 'Sample: bulk', '${by}') from generate_series(1, 520))
       select count(*) from h; update plat_legal_hold set released_by = '${by}', release_reason = 'Sample: bulk release' where firm_id = '${crowded}' and reason = 'Sample: bulk'`);
  const activeOnly = await call(base, "GET", `/api/system/register/holds?firm=${crowded}&state=active`, { token: ownerT });
  const page = await call(base, "GET", `/api/system/register/holds?firm=${crowded}&limit=2`, { token: ownerT });
  const whole = await call(base, "GET", `/api/system/register/holds?firm=${crowded}&state=released`, { token: ownerT });
  ok("PF-21b pass/fail (review M2, break M1): behind 520 released holds the firm's one active hold is still listed as active; a page of 2 and the 520 released say truncated, a list that fits does not",
    activeOnly.status === 200 && activeOnly.body.holds.length === 1 && activeOnly.body.holds[0].id === oldHold.holdId && activeOnly.body.truncated === false
    && page.body.holds.length === 2 && page.body.truncated === true && whole.body.holds.length === 500 && whole.body.truncated === true, { activeOnly: activeOnly.body, page: page.body.truncated, whole: whole.body.holds?.length });
  const oldRelease = await call(base, "POST", `/api/system/register/holds/${oldHold.holdId}/release`, { token: ownerT, body: { reason: "Sample: the oldest released" } });
  ok("PF-21b pass (break M1): releasing a hold older than 500 others answers 200 with that hold, never a 404 after a commit", oldRelease.status === 200 && oldRelease.body.id === oldHold.holdId && oldRelease.body.active === false, oldRelease);

  // ------------------------------------------------- review M3, break M2: a date range given as calendar dates
  const day = await call(base, "POST", "/api/system/register/holds", { token: ownerT, body: { firmId: sampleFirm, scope: { kind: "DATE_RANGE", from: "2026-03-31", to: "2026-03-31" }, reason: "Sample: one day's records" } });
  const lateThatDay = await withFirm(sampleFirm, () => walled.$transaction((tx) => holds.isHeld(tx, sampleFirm, [{ kind: "DATE", at: new Date("2026-03-31T22:30:00Z") }])));
  const nextDay = await withFirm(sampleFirm, () => walled.$transaction((tx) => holds.isHeld(tx, sampleFirm, [{ kind: "DATE", at: new Date("2026-04-01T00:00:00Z") }])));
  ok("PF-21b pass/fail (review M3, break M2): a hold from 2026-03-31 to 2026-03-31 covers that whole day (UTC): a record at 22:30 that day is held, one at 00:00 the next day is not",
    day.status === 201 && day.body.scope.from === "2026-03-31T00:00:00.000Z" && day.body.scope.to === "2026-03-31T23:59:59.999Z" && lateThatDay.held && lateThatDay.holds.some((h) => h.holdId === day.body.id) && !nextDay.held, { day: day.body, lateThatDay, nextDay });
  const before422 = Number(sql(`select count(*) from plat_legal_hold`));
  const badDates = await Promise.all([{ from: null, to: null }, { from: 0, to: true }, { from: "0001-01-01", to: "0001-01-02" }, { from: "2026-03-01T10:00:00", to: "2026-03-02T10:00:00" }, { from: "2026-03-02", to: "2026-03-01" }]
    .map((r) => call(base, "POST", "/api/system/register/holds", { token: ownerT, body: { firmId: sampleFirm, scope: { kind: "DATE_RANGE", ...r }, reason: "Sample: bad dates" } })));
  ok("PF-21b fail (break M2, m6): null, a number, true, year 1, a time with no zone and a range ending before it starts → 422 each, nothing placed",
    badDates.every((r) => r.status === 422 && r.body.code === "LEGAL_HOLD_FIELDS") && Number(sql(`select count(*) from plat_legal_hold`)) === before422, badDates.map((r) => [r.status, r.body.fields]));
  const bidi = await call(base, "POST", "/api/system/register/holds", { token: ownerT, body: { ...body, reason: "Sample \u202e reversed" } });
  const c1 = await call(base, "POST", "/api/system/register/holds", { token: ownerT, body: { ...body, reason: "Sample \u0085 next line" } });
  ok("PF-21b fail (break m4): a reason with a direction mark or a C1 control character → 422, nothing placed", bidi.status === 422 && c1.status === 422 && Number(sql(`select count(*) from plat_legal_hold`)) === before422, { bidi, c1 });
  const slash = await svc.placeAs("system:jobs/purge", { firmId: sampleFirm, scope: { kind: "CATEGORY", category: "case_files" }, reason: "Sample: a door with a slash" });
  ok("PF-21b pass (break m5): every AuditPort actor word is a valid placer (system:jobs/purge with a slash)", typeof slash.holdId === "string");

  // ------------------------------------------------------------------------------- DW6: no firm route for holds
  const firmTry = await Promise.all(["/api/platform/legal-holds", "/api/platform/register/holds", "/api/front-office/legal-holds"].map((p) => call(base, "GET", p, { token: firmT })));
  const srcFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? srcFiles(join(dir, e.name)) : /\.ts$/.test(e.name) ? [join(dir, e.name)] : []);
  const controllers = srcFiles(join(STUDIO, "api", "src")).flatMap((f) => [...readFileSync(f, "utf8").matchAll(/@Controller\(\s*"([^"]*)"/g)].map((m) => m[1]));
  const firmKeyUsed = srcFiles(join(STUDIO, "api", "src")).filter((f) => /@(PermissionKeys|AnyStaff)\([^)]*legal-hold/.test(readFileSync(f, "utf8")));
  ok("PF-21b DW6 pass/fail: no firm route answers for holds (404), the only controller naming holds is under /api/system, and no firm route declares agent/legal-hold:manage (dormant)",
    firmTry.every((r) => r.status === 404) && controllers.filter((p) => /hold/i.test(p)).join() === "api/system/register/holds" && firmKeyUsed.length === 0, { firmTry: firmTry.map((r) => r.status), controllers: controllers.filter((p) => /hold/i.test(p)), firmKeyUsed });

  // ------------------------------------------------------ DW6: the migration, right after itself (rows rev 16.7)
  const before = all.filter((d) => d < NEW);
  ok(`PF-21b DW6: the migration has its own stamp, later than every one before it and unique (P-600; newest before: ${before.at(-1)})`, all.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && before.length === all.indexOf(NEW));
  for (const d of before) psqlFile(EMPTY, join(MIG, d, "migration.sql"));
  for (const d of before) psqlFile(DEMO, join(MIG, d, "migration.sql"));
  const demo = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DEMO), options: "-c TimeZone=UTC" }) });
  try { await seedSampleFirms(demo); } finally { await demo.$disconnect(); }
  const firmsBefore = sqlOn(DEMO, `select count(*) from platform_firm`);
  psqlFile(EMPTY, join(MIG, NEW, "migration.sql")); psqlFile(DEMO, join(MIG, NEW, "migration.sql"));
  const shape = (d: string) => sqlOn(d, `select c.relrowsecurity and c.relforcerowsecurity and not exists (select 1 from pg_policy p where p.polrelid = c.oid) from pg_class c where c.relname = 'plat_legal_hold'`)
    + sqlOn(d, `select string_agg(role_code, ',') from plat_system_role_permission where permission_key = 'system/compliance:legal-hold'`)
    + sqlOn(d, `select count(*) from pg_proc p where p.proname like 'plat_legal_hold%' and p.prosecdef and pg_get_userbyid(p.proowner) = 'xr_wall_reader'`);
  ok("PF-21b DW6 pass: right after its own migration, on an empty copy and on a demo-data copy: the table is forced with no policy, the key is the Platform Owner's only, the five definers are xr_wall_reader's; the demo firms are untouched",
    shape(EMPTY) === "tplatform-owner5" && shape(DEMO) === "tplatform-owner5" && sqlOn(DEMO, `select count(*) from platform_firm`) === firmsBefore, { empty: shape(EMPTY), demo: shape(DEMO) });
  ok("PF-21b DW6: every function the migration creates carries the area prefix plat_ (rows rev 15.2)",
    [...readFileSync(join(MIG, NEW, "migration.sql"), "utf8").replace(/^\s*--.*$/gm, "").matchAll(/CREATE (?:OR REPLACE )?FUNCTION (\w+)/g)].every((m) => m[1].startsWith("plat_legal_hold")));
  // The diff compares the fully migrated database with the schema: every migration later than this one is applied to the
  // empty copy first, so a later row's tables never read as drift (batch 45080999446: FO-9b's fo_dup_merge listed).
  const later = all.filter((d) => d > NEW);
  for (const d of later) psqlFile(EMPTY, join(MIG, d, "migration.sql"));
  mkdirSync(WORK, { recursive: true });
  const cfg = join(WORK, "prisma.config.ts");
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(EMPTY))} } });\n`);
  const diff = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
  ok(`PF-21b DW6 pass: prisma migrate diff between the fully migrated database (this migration, then the ${later.length} after it) and the schema is empty`, diff.status === 0, `${diff.stdout}${diff.stderr}`.slice(0, 800));
} catch (e) {
  fail++; console.log(`FAIL  unexpected error — ${String((e as Error)?.stack ?? e).slice(0, 1500)}`);
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await walled.$disconnect().catch(() => undefined); await owner.$disconnect().catch(() => undefined); await pool.end().catch(() => undefined);
  rmSync(WORK, { recursive: true, force: true });
  for (const d of [DB, EMPTY, DEMO]) { try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", d]); } catch { /* left for the cleanup tool */ } }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
