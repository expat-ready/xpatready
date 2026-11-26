// PF-11 part 1 (brief lead-b-briefs/PF-11.md, Lead B's corrections on #1972): DW1-DW7 and FirmExportPort's contract (fake and
// real), on a scratch database with PF-12's walls, PF-4's guard, PF-5's hold gate, fake jobs and files on a fake clock. US$0.
//   tsx studio/tests/check_pf11_firm_export.ts
import "reflect-metadata";
import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import PizZip from "pizzip";
import { FakeClock } from "../ports/clock.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { firmExportPortContract } from "../ports/contracts/firm-export-port.contract.ts";
import { fakeFiles } from "../ports/files.ts";
import { exportRegistry, fakeFirmExport, FirmExportRefused, type ModuleExportInput } from "../ports/firm-export.ts";
import { fakeJobs } from "../ports/jobs.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf11_scratch_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const A_ID = "0c0c0c0c-0000-4000-8000-0000000000a1", B_ID = "0c0c0c0c-0000-4000-8000-0000000000b2";
await runContract(firmExportPortContract, "fakeFirmExport", () => ({ port: fakeFirmExport() as never, firmId: A_ID, otherFirmId: B_ID }), ok);
await runContract(firmExportPortContract, "exportRegistry", () => ({ port: exportRegistry<string>((f, ex) => ex(f, "tx")) as never, firmId: A_ID, otherFirmId: B_ID }), ok);

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { PaymentHoldGate } = await import("../api/src/platform/billing/routes.ts");
const { AnyStaff } = await import("../api/src/platform/identity/keys.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { withFirm } = await import("../api/src/platform/firm-scope.ts");
const { PgFirmExport } = await import("../api/src/platform/firm-export/registry.ts");
const { platformSections } = await import("../api/src/platform/firm-export/platform-sections.ts");
const { FirmExports, BUILD_JOB, SWEEP_JOB } = await import("../api/src/platform/firm-export/service.ts");
const { buildPackage, ExportTooLarge } = await import("../api/src/platform/firm-export/package.ts");
const { PgLegalHolds } = await import("../api/src/platform/register/holds/adapter.ts");
const { FirmExportController } = await import("../api/src/platform/firm-export/routes.ts");
const feature = (await import("../api/src/features/platform-firm-export.ts")).default;

const fc = new FakeClock("2026-11-24T10:00:00Z"), jobs = fakeJobs(fc), files = fakeFiles();
const clock = new (class extends PlatformClock { override now() { return fc.now().getTime(); } })();
const local = new LocalIdentity("pf11-check-signing-key-0123456789abcdef", () => clock.now());
type Res = { status: number; body: any; bytes?: Uint8Array };
let app: { close(): Promise<void> } | null = null;
try {
  await seedSampleFirms(new (await import("@prisma/client")).PrismaClient({ adapter: new (await import("@prisma/adapter-pg")).PrismaPg({ connectionString: urlOf(DB) }) }));
  const FIRM_A = sql(`select id from platform_firm where key = 'sample-firm'`), FIRM_B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const staff = (actor: string) => sql(`select id from platform_staff where actor_id = '${actor}'`);
  const [R, O, T] = ["user-R", "user-O", "user-T"].map(staff);
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${FIRM_A}', '${T}', 'ADMIN', 'seed:PF-11')`);
  const blob = new TextEncoder().encode("x".repeat(5000)), stored = await files.put(FIRM_A, "test/one.txt", blob, "text/plain");
  const testModule = async (firmId: string): Promise<ModuleExportInput> => ({ module: "test-module", files: firmId === FIRM_A ? [{ key: stored.key, name: "one.txt", sha256: stored.sha256 }] : [], sections: [{
    key: "notes", title: "Notes", columns: [{ key: "firm_id", kind: "text" }, { key: "text", kind: "text" }, { key: "amount", kind: "minor", currency: "currency" }, { key: "currency", kind: "text" }],
    rows: [[firmId, "=HYPERLINK(\"http://x\")", -1250, "CAD"], [firmId, "+1", 900, "USD"], [firmId, "-x", null, null], [firmId, "@sum", 0, "CAD"]] }] });
  let theDb: never;
  const nestDb = () => theDb;
  const holds = { on: false, real: new PgLegalHolds(), isHeld(tx: never, f: string, q: never) { return this.on ? Promise.resolve({ held: true as const, holds: [] }) : this.real.isHeld(tx, f, q); } };
  const make = (cap?: number, extra?: (f: string) => Promise<void>, over: { db?: never; files?: never } = {}) => { const port = new PgFirmExport(nestDb()); port.register("platform", platformSections); port.register("test-module", async (f) => { await extra?.(f); return testModule(f); });
    return new FirmExports({ db: over.db ?? nestDb(), port, files: over.files ?? files, jobs, audit: auditEvent as never, holds: holds as never, now: () => fc.now(), cap }); };
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: PaymentHoldGate }, { provide: FirmExports, useFactory: (db: never) => { theDb = db; return make(); }, inject: [Db] }];
  @Controller("api/platform/pf11-probe") class Probe { @Get() @AnyStaff("PF-11's check of the hold gate") get() { return { ok: true }; } }
  @Module({ controllers: [PlatformIdentityController, FirmExportController, Probe] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const svc = nest.get(FirmExports); await svc.register(jobs);
  ok("setup: the feature registers the controller, the real port and the service", feature.controllers[0] === FirmExportController && feature.providers.length === 2);
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  const call = async (method: string, path: string, token?: string, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const buf = new Uint8Array(await r.arrayBuffer()), text = new TextDecoder().decode(buf); let parsed: any = text; try { parsed = JSON.parse(text); } catch { /* bytes */ }
    return { status: r.status, body: parsed, bytes: buf };
  };
  const signIn = async (actorId: string, firmKey = "sample-firm") => { const r = await call("POST", "/api/platform/session/local", undefined, { firmKey, actorId, secondStep: true }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const [tR, tO, tT, tS] = [await signIn("user-R"), await signIn("user-O"), await signIn("user-T"), await signIn("user-S", "sample-solo")];
  const op = () => crypto.randomUUID(), ask = (t: string, operationId = op()) => call("POST", "/api/platform/firm-export", t, { operationId });
  const rows = () => Number(sql(`select count(*) from platform_firm_export`));

  // ------------------------------------------------------------------------------------------ DW1: who may ask and list
  const op1 = op(), first = await ask(tR, op1);
  await jobs.runDue();
  const ready = await call("GET", "/api/platform/firm-export", tT);
  ok("PF-11 DW1 pass: the Owner asks (201 QUEUED); the job makes it READY; an Admin lists it (200) with who and when",
    first.status === 201 && first.body.state === "QUEUED" && ready.status === 200 && ready.body.items[0]?.id === first.body.id && ready.body.items[0].state === "READY" && ready.body.items[0].requestedBy === R && !!ready.body.items[0].requestedByName, [first.body, ready.body]);
  const got = await call("GET", `/api/platform/firm-export/${first.body.id}/download`, tR);
  const zip = new PizZip(got.bytes!), names = Object.keys(zip.files), csv = (n: string) => zip.file(n)?.asText() ?? "";
  ok("PF-11 DW1 pass: the download is one zip with the README, every registered module's sections and the stored file",
    got.status === 200 && names.includes("README.txt") && names.includes("platform/staff.csv") && names.includes("platform/complaints.csv") && names.includes("test-module/notes.csv") && csv("test-module/files/one.txt").length === 5000
    && /Nothing in this download is masked/.test(csv("README.txt")) && /test-module\/notes\.csv: Notes \(4 rows\)/.test(csv("README.txt")), names);
  const refusedAsk = await Promise.all([ask(tT), ask(tO), call("GET", "/api/platform/firm-export", tO), ask("", op())]);
  ok("PF-11 DW1 fail: an Admin and a Case Officer asking → 403; a Case Officer listing → 403; no session → 401; no row made",
    refusedAsk.map((r) => r.status).join() === "403,403,403,401" && rows() === 1, refusedAsk.map((r) => [r.status, r.body.code]));
  const ctx = (staffId: string) => ({ staffId, firmId: FIRM_A, firmKey: "sample-firm", roles: [], keys: [], duties: [], authTime: 0, via: "local" as const });
  sql(`update platform_staff set status = 'DEACTIVATED', deactivation_reason = 'PF-11 check' where id = '${R}'`);
  const deact = await withFirm(FIRM_A, () => svc.request(ctx(R), { operationId: op() }).then(() => 0, (e) => e.getStatus?.()));
  sql(`update platform_staff set status = 'ACTIVE', deactivation_reason = null where id = '${R}'`);
  const back = await withFirm(FIRM_A, () => svc.request(ctx(R), { operationId: op() }).then((v) => v.state, (e) => String(e)));
  ok("PF-11 DW1 fail: a deactivated Owner is refused 403 by the in-transaction re-check (the same call passes once active)", deact === 403 && back === "QUEUED", [deact, back]);
  ok("PF-11 DW1 pass (the key rows, exactly): agent/firm-data-export:list in the catalogue (NONE, GENERAL) on OWNER and ADMIN only; :request on OWNER only (PF-3's seed)",
    sql(`select scope || ',' || class from platform_permission_key where key = 'agent/firm-data-export:list'`) === "NONE,GENERAL" && sql(`select string_agg(role::text || '=' || permission_key, ' ' order by permission_key, role) from platform_role_permission where permission_key like 'agent/firm-data-export:%'`) === "OWNER=agent/firm-data-export:list ADMIN=agent/firm-data-export:list OWNER=agent/firm-data-export:request");
  ok("PF-11 DW1 fail: a non-Owner holding the key by context alone is refused by the re-check", await withFirm(FIRM_A, () => svc.request(ctx(T), { operationId: op() }).then(() => 0, (e) => e.getStatus?.())) === 403);

  // ------------------------------------------------------------------------------------------ DW2: one request per operationId
  const before = rows(), again = await ask(tR, op1), other = await ask(tR);
  ok("PF-11 DW2 pass: the same operationId again → 200, the same request, one job", again.status === 200 && again.body.id === first.body.id && jobs.jobs.filter((j) => j.name === BUILD_JOB && j.key === `firm-export:${first.body.id}`).length === 1);
  ok("PF-11 DW2 fail: a different operationId → a second request and job", other.status === 201 && other.body.id !== first.body.id && rows() === before + 1);
  const badBody = await Promise.all([call("POST", "/api/platform/firm-export", tR, {}), call("POST", "/api/platform/firm-export", tR, { operationId: op(), format: "json" }), call("POST", "/api/platform/firm-export", tR, { operationId: "x" })]);
  ok("PF-11 DW2 fail: no operationId, an extra field (no format picker, AG-16-20) or a non-uuid → 422, nothing made", badBody.every((r) => r.status === 422) && rows() === before + 1, badBody.map((r) => r.status));

  // ------------------------------------------------------------------------------------------ DW3: the firm states
  const inState = async (st: string) => { sql(`update platform_firm set status = '${st}' where id = '${FIRM_A}'`); const r = await ask(tR); return r.status; };
  const open = [await inState("TRIAL"), await inState("PAYMENT_HOLD"), (sql(`update platform_firm set status = 'PAYMENT_HOLD' where id = '${FIRM_A}'`), (await call("GET", "/api/platform/firm-export", tT)).status)];
  ok("PF-11 DW3 pass: allowed in TRIAL and PAYMENT_HOLD (a held Owner gets 201, not 402, through @HoldOpen; the list too)", open.join() === "201,201,200", open);
  await jobs.runDue(); const heldDl = await call("GET", `/api/platform/firm-export/${other.body.id}/download`, tR);
  ok("PF-11 DW3 pass: a held Owner downloads (200 through @HoldOpen)", heldDl.status === 200, heldDl.body);
  const n3 = rows(), shut = [];
  for (const st of ["PROVISIONING", "SECURITY_LOCK", "ABANDONED", "DELETED"]) { shut.push(await inState(st)); if (st !== "DELETED") shut.push((await call("GET", "/api/platform/firm-export", tT)).status); }
  sql(`update platform_firm set status = 'ACTIVE' where id = '${FIRM_A}'`);
  ok("PF-11 DW3 fail: refused in PROVISIONING, SECURITY_LOCK, ABANDONED and DELETED (the list too); no row made", shut.every((s) => s >= 400) && rows() === n3, shut);
  sql(`update platform_firm set status = 'PAYMENT_HOLD' where id = '${FIRM_A}'`); const probe = await call("GET", "/api/platform/pf11-probe", tR); sql(`update platform_firm set status = 'ACTIVE' where id = '${FIRM_A}'`);
  ok("PF-11 DW3 fail (the gate itself): a route without @HoldOpen answers a held firm 402 (PF-5's gate is on in this app)", probe.status === 402 && probe.body.code === "PAYMENT_HOLD", probe.body);

  // ------------------------------------------------------------------------------------------ DW4: expiry and who downloads
  const otherFirm = await call("GET", `/api/platform/firm-export/${first.body.id}/download`, tS);
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${FIRM_A}', '${T}', 'OWNER', 'seed:PF-11')`);
  const tT2 = await signIn("user-T"), sameFirm = await call("GET", `/api/platform/firm-export/${first.body.id}/download`, tT2), junk = await call("GET", "/api/platform/firm-export/not-an-id/download", tR);
  ok("PF-11 DW4 fail: another firm's Owner, another Owner of the same firm and a malformed id → 404", [otherFirm.status, sameFirm.status, junk.status].join() === "404,404,404", [otherFirm.body, sameFirm.body]);
  await fc.advance({ days: 7, minutes: 1 });
  const late = await call("GET", `/api/platform/firm-export/${first.body.id}/download`, await signIn("user-R"));
  ok("PF-11 DW4 pass: after the Sample 7 days on the fake clock the expiry job marks it EXPIRED and the download answers 410",
    sql(`select state from platform_firm_export where id = '${first.body.id}'`) === "EXPIRED" && late.status === 410 && late.body.code === "EXPIRED", late.body);
  ok("PF-11 DW4 pass: with no legal hold the expired zip is deleted (FilesPort.delete, after the commit)", await files.get(FIRM_A, sql(`select file_key from platform_firm_export where id = '${first.body.id}'`)) === null);
  const kept = await ask(await signIn("user-R")); await jobs.runDue(); holds.on = true; await fc.advance({ days: 8 }); holds.on = false;
  ok("PF-11 DW4 fail: while a legal hold covers the firm the expired zip is kept", sql(`select state from platform_firm_export where id = '${kept.body.id}'`) === "EXPIRED" && !!(await files.get(FIRM_A, sql(`select file_key from platform_firm_export where id = '${kept.body.id}'`))));

  // ------------------------------------------------------------------------------------------ DW5: the CSV and the cap
  const notes = csv("test-module/notes.csv");
  ok("PF-11 DW5 pass: =, +, - and @ text is neutralised with a leading '", notes.includes(`"'=HYPERLINK(""http://x"")"`) && notes.includes("'+1") && notes.includes("'-x") && notes.includes("'@sum"), notes);
  ok("PF-11 DW5 fail: a negative amount stays a number (-1250, never '-1250), beside its own currency; no total row", /,-1250,CAD\r\n/.test(notes) && !notes.includes("'-1250") && notes.split("\r\n").filter(Boolean).length === 5, notes);
  const small = make(3000), op2 = op();
  sql(`insert into platform_firm_export (id, firm_id, operation_id, requested_by, updated_at) values ('${op2}', '${FIRM_A}', '${op2}', '${R}', now())`);
  await withFirm(FIRM_A, () => small.build(op2, FIRM_A));
  let read = false;
  ok("PF-11 DW5 fail: the cap is checked while adding: past it on the sections, the stored file is never read", await buildPackage({ title: "t", madeAt: fc.now(), modules: await (() => { const p = new PgFirmExport(nestDb()); p.register("platform", platformSections); p.register("test-module", testModule); return p.collect(FIRM_A); })(), file: async () => { read = true; return blob; }, cap: 2000 }).then(() => false, (e) => e instanceof ExportTooLarge) && !read);
  ok("PF-11 DW5 fail: the build checks the firm state itself (a locked firm's queued export fails in words)", await (async () => { const id = op(); sql(`insert into platform_firm_export (id, firm_id, operation_id, requested_by, updated_at) values ('${id}', '${FIRM_A}', '${id}', '${R}', now()); update platform_firm set status = 'SECURITY_LOCK' where id = '${FIRM_A}'`);
    await withFirm(FIRM_A, () => svc.build(id, FIRM_A)); sql(`update platform_firm set status = 'ACTIVE' where id = '${FIRM_A}'`); return sql(`select failed_reason from platform_firm_export where id = '${id}'`) === "the firm's account is not open for a data download"; })());
  let release = () => {}; const gate = new Promise<void>((r) => { release = r; }), slow = make(undefined, async () => { await gate; }), race = op();
  sql(`insert into platform_firm_export (id, firm_id, operation_id, requested_by, updated_at) values ('${race}', '${FIRM_A}', '${race}', '${R}', now())`);
  const late1 = withFirm(FIRM_A, () => slow.build(race, FIRM_A)); await new Promise((r) => setTimeout(r, 300)); await withFirm(FIRM_A, () => svc.build(race, FIRM_A)); release(); await late1;
  ok("PF-11 DW2 fail (break M1): a redelivered build finishing late changes nothing: READY at attempt 2, one ready line, its own zip deleted", sql(`select state || '|' || attempt || '|' || (select count(*) from audit_event where entity_key = '${race}' and action = 'platform.firm_export.ready') from platform_firm_export where id = '${race}'`) === "READY|2|1" && await files.get(FIRM_A, `firm-export/${race}/1.zip`) === null);
  ok("PF-11 DW5 fail: with a small cap the job stops FAILED \"too large for one download\" before storing anything", sql(`select state || '|' || failed_reason from platform_firm_export where id = '${op2}'`) === "FAILED|too large for one download" && await files.get(FIRM_A, `firm-export/${op2}/1.zip`) === null);

  // ------------------------------------------------------------------------------------------ DW6: no other firm, the read
  const firmCols = names.filter((n) => n.endsWith(".csv")).map((n) => { const [head, ...body] = csv(n).split("\r\n").filter(Boolean); const i = head.split(",").indexOf("firm_id"); return { n, ids: i < 0 ? [] : body.map((l) => l.split(",")[i]) }; });
  ok("PF-11 DW6 pass: every section with a firm_id holds firm A's only, and firm B's staff and email are absent", firmCols.filter((c) => c.ids.length).length >= 4 && firmCols.every((c) => c.ids.every((id) => id === FIRM_A)) && !Object.values(zip.files).some((f) => !f.dir && /sample-solo\.example\.com/.test(f.asText())), firmCols);
  const pg = new PgFirmExport(nestDb());
  pg.register("peek", async () => ({ module: "peek", sections: [{ key: "staff", title: "Staff", columns: [{ key: "firm_id", kind: "text" }], rows: (await withFirm(FIRM_B, () => (nestDb() as any).platformStaff.findMany())).map((s: any) => [s.firmId]) }] }));
  ok("PF-11 DW6 fail: a test exporter that reads outside its firm's scope (as firm B) fails the check", await pg.collect(FIRM_A).then(() => false, (e) => e instanceof FirmExportRefused));
  const bare = new PgFirmExport(nestDb()); bare.register("bare", async (_f, tx) => ({ module: "bare", sections: [{ key: "staff", title: "Staff", columns: [{ key: "firm_id", kind: "text" }], rows: (await tx.platformStaff.findMany()).map((x) => [x.firmId]) }] }));
  const bareRows = await bare.collect(FIRM_A).then((m) => m[0].sections[0].rows, () => []);   // called from no scope: only the adapter's withFirm makes it firm A's
  ok("PF-11 DW6 pass: an exporter's unfiltered read runs as the firm (withFirm inside the adapter): firm A's staff only, not none", bareRows.length >= 3 && bareRows.every((r) => r[0] === FIRM_A), bareRows);
  const writer = new PgFirmExport(nestDb()); writer.register("writer", async (_f, tx) => { await tx.$executeRaw`update platform_firm set status = status`; return { module: "writer", sections: [] }; });
  ok("PF-11 DW6 fail: an exporter that writes is refused (the transaction is READ ONLY)", await writer.collect(FIRM_A).then(() => false, (e) => /read-only/i.test(String(e))));
  await runContract(firmExportPortContract, "PgFirmExport", () => ({ port: new PgFirmExport(nestDb()) as never, firmId: FIRM_A, otherFirmId: FIRM_B }), ok);

  // ------------------------------------------------------------------------------------------ DW7: the audit lines
  const lines = sql(`select action || '|' || actor || '|' || summary || '|' || detail::text from audit_event where entity = 'platform_firm_export' and entity_key = '${first.body.id}' order by at, id`).split("\n");
  ok("PF-11 DW7 pass: request, ready, download and expiry are one line each, with the actor, the counts and the hash",
    lines.length === 4 && lines[0].startsWith(`platform.firm_export.requested|staff:${R}|`) && lines[1].startsWith("platform.firm_export.ready|system:firm-export|") && /"rowCounts": \[.*"platform\/staff:\d+"/.test(lines[1]) && lines[2].includes(got.body?.sha256 ?? sql(`select sha256 from platform_firm_export where id = '${first.body.id}'`)) && lines[3].startsWith("platform.firm_export.expired|"), lines);
  ok("PF-11 DW7 fail: no line holds a name, an email or a value from the export", !lines.some((l) => /@|Sample|Representative|HYPERLINK/.test(l)), lines);

  // ------------------------------------------------------------------------------------------ DW8 (part 1b): export hygiene
  const fresh = async () => { const r = await ask(await signIn("user-R")); await jobs.runDue(); return r.body.id as string; };
  const st = (id: string) => sql(`select state from platform_firm_export where id = '${id}'`);
  const raced = await fresh();
  const expiring = { ...files, get: async (f: string, k: string) => { sql(`update platform_firm_export set state = 'EXPIRED' where id = '${raced}'`); return files.get(f, k); } } as never;
  const racer = make(undefined, undefined, { files: expiring });
  const rd = await withFirm(FIRM_A, () => racer.download(ctx(R), raced).then(() => 200, (e) => e.getStatus?.()));
  ok("PF-11 DW8 fail (m1): a download racing the expiry answers 410 and leaves the row EXPIRED; no download line",
    rd === 410 && st(raced) === "EXPIRED" && sql(`select count(*) from audit_event where entity_key = '${raced}' and action = 'platform.firm_export.downloaded'`) === "0", [rd, st(raced)]);
  const twice = await fresh(); await fc.advance({ days: 7, minutes: 1 });
  sql(`update platform_firm_export set state = 'DOWNLOADED', downloaded_at = now() where id = '${twice}' and state = 'EXPIRED'`);   // as if a download committed before the job
  const twin = { on: true, isHeld(tx: never, f: string, q: never) { if (this.on) { this.on = false; sql(`update platform_firm_export set state = 'EXPIRED' where id = '${twice}'`); } return holds.isHeld(tx, f, q); } };
  await withFirm(FIRM_A, () => new FirmExports({ db: nestDb(), port: new PgFirmExport(nestDb()), files, jobs, audit: auditEvent as never, holds: twin as never, now: () => fc.now() }).expire(twice, FIRM_A));
  ok("PF-11 DW8 fail (m1): an expiry whose row moved under it writes nothing (compare-and-set from READY or DOWNLOADED)",
    sql(`select count(*) from audit_event where entity_key = '${twice}' and action = 'platform.firm_export.expired'`) === "1", sql(`select string_agg(action, ' ') from audit_event where entity_key = '${twice}'`));
  const daily = sql(`select count(*) from audit_event where entity_key = '${kept.body.id}' and action = 'platform.firm_export.file_deleted'`);
  ok("PF-11 DW8 pass (m3): the daily sweep on the runner deleted the zip kept under DW4's hold once the hold was gone, one line", daily === "1" && !(await files.get(FIRM_A, sql(`select file_key from platform_firm_export where id = '${kept.body.id}'`))), daily);
  const ok200 = await call("GET", `/api/platform/firm-export/${await fresh()}/download`, await signIn("user-R"));
  ok("PF-11 DW8 pass: an open download still answers 200 after the change (zip read before the transaction)", ok200.status === 200 && new PizZip(ok200.bytes!).file("README.txt") !== null, ok200.status);
  const lost = await fresh(), lostKey = sql(`select file_key from platform_firm_export where id = '${lost}'`);
  await jobs.cancel(`firm-export:${lost}:expire`); sql(`update platform_firm_export set expires_at = now() - interval '1 day' where id = '${lost}'`);
  holds.on = true; const heldSweep = await svc.sweep(); holds.on = false;
  ok("PF-11 DW8 fail (m2): an export whose expiry job never came is expired by the sweep; under a hold its zip is kept", st(lost) === "EXPIRED" && !!(await files.get(FIRM_A, lostKey)) && heldSweep.expired === 1 && heldSweep.deleted === 0, heldSweep);
  const swept = await svc.sweep();
  ok("PF-11 DW8 pass (m3): once no hold covers the firm the sweep deletes that zip, one line",
    (await files.get(FIRM_A, lostKey)) === null && swept.deleted === 1 && sql(`select count(*) from audit_event where entity_key = '${lost}' and action = 'platform.firm_export.file_deleted'`) === "1", swept);
  ok("PF-11 DW8 pass: a second sweep finds nothing to delete (no repeat line)", (await svc.sweep()).deleted === 0 && sql(`select count(*) from audit_event where entity_key = '${lost}' and action = 'platform.firm_export.file_deleted'`) === "1");
  ok("PF-11 DW8 pass: the sweep runs on the runner (a recurring run of its queue was queued)", jobs.jobs.some((j) => j.name === SWEEP_JOB));
  const byp = Number(sql(`select count(*) from audit_event where action = 'platform.bypass' and firm_id = '${FIRM_A}' and detail->>'use' = 'job:platform.firm_export.sweep'`)); await svc.sweep();
  ok("PF-11 DW8 fail (P-607): the sweep's read across firms writes one platform.bypass line per firm it reads, each run", byp >= 1 && Number(sql(`select count(*) from audit_event where action = 'platform.bypass' and firm_id = '${FIRM_A}' and detail->>'use' = 'job:platform.firm_export.sweep'`)) === byp + 1, byp);
  const caseReg = exportRegistry<string>((f, ex) => ex(f, "tx")); caseReg.register("twins", async (f) => ({ module: "twins", files: [{ key: "a", name: "a.pdf", sha256: "0".repeat(64) }, { key: "b", name: "A.pdf", sha256: "0".repeat(64) }], sections: [] }));
  ok("PF-11 DW8 fail (m4): two stored files whose names differ only in letter case are refused", await caseReg.collect(FIRM_A).then(() => false, (e) => e instanceof FirmExportRefused));
  // m5: the four fixes without a failing test
  let gateOpen = () => {}; const g = new Promise<void>((r) => { gateOpen = r; }); let collects = 0;
  const dbReal = nestDb() as any, slowRead = new Proxy(dbReal, { get(t, k) { const v = t[k]; if (k !== "platformFirmExport") return typeof v === "function" ? v.bind(t) : v;
    return new Proxy(v, { get(m, kk) { const f = m[kk]; return kk === "findFirst" ? async (a: unknown) => { const r = await f.call(m, a); await g; return r; } : typeof f === "function" ? f.bind(m) : f; } }); } });
  const claimId = op(); sql(`insert into platform_firm_export (id, firm_id, operation_id, requested_by, updated_at) values ('${claimId}', '${FIRM_A}', '${claimId}', '${R}', now())`);
  let bGo = () => {}; const bGate = new Promise<void>((r) => { bGo = r; });
  const counting = make(undefined, async () => { collects++; await bGate; });   // B claims attempt 1, then waits mid-build
  const a = withFirm(FIRM_A, () => make(undefined, async () => { collects++; }, { db: slowRead as never }).build(claimId, FIRM_A));   // A read attempt 0, waits
  await new Promise((r) => setTimeout(r, 200)); const b = withFirm(FIRM_A, () => counting.build(claimId, FIRM_A));
  await new Promise((r) => setTimeout(r, 300)); gateOpen(); await a; bGo(); await b;
  ok("PF-11 DW8 fail (m5, the claim's compare-and-set): a build that read attempt 0 after another claimed it builds nothing", collects === 1 && sql(`select state || '|' || attempt from platform_firm_export where id = '${claimId}'`) === "READY|1", [collects, sql(`select state || '|' || attempt from platform_firm_export where id = '${claimId}'`)]);
  const mods = await (() => { const p = new PgFirmExport(nestDb()); p.register("test-module", testModule); return p.collect(FIRM_A); })();
  const big = await buildPackage({ title: "t", madeAt: fc.now(), modules: mods, file: async () => blob, cap: 10_000_000 });
  const raw = Object.values(new PizZip(big.bytes).files).filter((f) => !f.dir).reduce((n, f) => n + f.asUint8Array().byteLength, 0);
  ok("PF-11 DW8 fail (m5, the zip headers counted): a cap a little above the entries' bytes alone is refused", await buildPackage({ title: "t", madeAt: fc.now(), modules: mods, file: async () => blob, cap: raw + 20 }).then(() => false, (e) => e instanceof ExportTooLarge), raw);
  const chk = (q: string) => { try { sql(q); return "stored"; } catch { return "refused"; } };
  const cid = op();
  ok("PF-11 DW8 fail (m5, the CHECK's IS NOT NULL): a READY row with no hash or no size, or a DOWNLOADED one with no date, is refused by the database",
    chk(`insert into platform_firm_export (id, firm_id, operation_id, requested_by, state, file_key, size_bytes, expires_at, updated_at) values ('${cid}', '${FIRM_A}', '${cid}', '${R}', 'READY', 'k', 1, now(), now())`) === "refused"
    && chk(`insert into platform_firm_export (id, firm_id, operation_id, requested_by, state, file_key, sha256, size_bytes, expires_at, updated_at) values ('${cid}', '${FIRM_A}', '${cid}', '${R}', 'DOWNLOADED', 'k', '${"0".repeat(64)}', 1, now(), now())`) === "refused"
    && chk(`insert into platform_firm_export (id, firm_id, operation_id, requested_by, state, file_key, sha256, expires_at, updated_at) values ('${cid}', '${FIRM_A}', '${cid}', '${R}', 'READY', 'k', '${"0".repeat(64)}', now(), now())`) === "refused");
} catch (e) { ok("no unexpected error", false, String((e as Error)?.stack ?? e)); } finally {
  await app?.close();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
