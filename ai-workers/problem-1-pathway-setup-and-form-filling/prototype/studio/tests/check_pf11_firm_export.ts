// PF-11 part 1 (brief lead-b-briefs/PF-11.md, Lead B's corrections on #1972): DW1 ask and list; DW2 one request per
// operationId; DW3 firm states (@HoldOpen); DW4 expiry, who downloads; DW5 the CSV and the cap; DW6 no other firm, the
// read-only scoped read, the port contract (fake and real); DW7 audit. Scratch database, PF-12 walls on, PF-4's guard,
// PF-5's hold gate, fake jobs and files on a fake clock. No network, US$0.   tsx studio/tests/check_pf11_firm_export.ts
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
const { FirmExports, BUILD_JOB } = await import("../api/src/platform/firm-export/service.ts");
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
  const make = (cap?: number) => { const port = new PgFirmExport(nestDb()); port.register("platform", platformSections); port.register("test-module", testModule); return new FirmExports({ db: nestDb(), port, files, jobs, audit: auditEvent as never, now: () => fc.now(), cap }); };
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
  const n3 = rows(), shut = [];
  for (const st of ["PROVISIONING", "SECURITY_LOCK", "ABANDONED", "DELETED"]) shut.push(await inState(st));
  sql(`update platform_firm set status = 'ACTIVE' where id = '${FIRM_A}'`);
  ok("PF-11 DW3 fail: refused in PROVISIONING, SECURITY_LOCK, ABANDONED and DELETED; no row made", shut.every((s) => s >= 400) && rows() === n3, shut);
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
    sql(`select state from platform_firm_export where id = '${first.body.id}'`) === "EXPIRED" && late.status === 410 && late.body.code === "EXPIRED" && files.count >= 2, late.body);

  // ------------------------------------------------------------------------------------------ DW5: the CSV and the cap
  const notes = csv("test-module/notes.csv");
  ok("PF-11 DW5 pass: =, +, - and @ text is neutralised with a leading '", notes.includes(`"'=HYPERLINK(""http://x"")"`) && notes.includes("'+1") && notes.includes("'-x") && notes.includes("'@sum"), notes);
  ok("PF-11 DW5 fail: a negative amount stays a number (-1250, never '-1250), beside its own currency; no total row", /,-1250,CAD\r\n/.test(notes) && !notes.includes("'-1250") && notes.split("\r\n").filter(Boolean).length === 5, notes);
  const small = make(3000), puts = files.count, op2 = op();
  sql(`insert into platform_firm_export (id, firm_id, operation_id, requested_by, updated_at) values ('${op2}', '${FIRM_A}', '${op2}', '${R}', now())`);
  await withFirm(FIRM_A, () => small.build(op2, FIRM_A));
  ok("PF-11 DW5 fail: with a small cap the job stops FAILED \"too large for one download\" before storing anything", sql(`select state || '|' || failed_reason from platform_firm_export where id = '${op2}'`) === "FAILED|too large for one download" && files.count === puts);

  // ------------------------------------------------------------------------------------------ DW6: no other firm, the read
  const firmCols = names.filter((n) => n.endsWith(".csv")).map((n) => { const [head, ...body] = csv(n).split("\r\n").filter(Boolean); const i = head.split(",").indexOf("firm_id"); return { n, ids: i < 0 ? [] : body.map((l) => l.split(",")[i]) }; });
  ok("PF-11 DW6 pass: every section with a firm_id holds firm A's only, and firm B's staff and email are absent", firmCols.filter((c) => c.ids.length).length >= 4 && firmCols.every((c) => c.ids.every((id) => id === FIRM_A)) && !Object.values(zip.files).some((f) => !f.dir && f.asText().includes("sample-solo.example.com")), firmCols);
  const pg = new PgFirmExport(nestDb());
  pg.register("peek", async () => ({ module: "peek", sections: [{ key: "staff", title: "Staff", columns: [{ key: "firm_id", kind: "text" }], rows: (await withFirm(FIRM_B, () => (nestDb() as any).platformStaff.findMany())).map((s: any) => [s.firmId]) }] }));
  ok("PF-11 DW6 fail: a test exporter that reads outside its firm's scope (as firm B) fails the check", await pg.collect(FIRM_A).then(() => false, (e) => e instanceof FirmExportRefused));
  const writer = new PgFirmExport(nestDb()); writer.register("writer", async (_f, tx) => { await tx.$executeRaw`update platform_firm set status = status`; return { module: "writer", sections: [] }; });
  ok("PF-11 DW6 fail: an exporter that writes is refused (the transaction is READ ONLY)", await writer.collect(FIRM_A).then(() => false, (e) => /read-only/i.test(String(e))));
  await runContract(firmExportPortContract, "PgFirmExport", () => ({ port: new PgFirmExport(nestDb()) as never, firmId: FIRM_A, otherFirmId: FIRM_B }), ok);

  // ------------------------------------------------------------------------------------------ DW7: the audit lines
  const lines = sql(`select action || '|' || actor || '|' || summary || '|' || detail::text from audit_event where entity = 'platform_firm_export' and entity_key = '${first.body.id}' order by at, id`).split("\n");
  ok("PF-11 DW7 pass: request, ready, download and expiry are one line each, with the actor, the counts and the hash",
    lines.length === 4 && lines[0].startsWith(`platform.firm_export.requested|staff:${R}|`) && lines[1].startsWith("platform.firm_export.ready|system:firm-export|") && /"rowCounts": \[.*"platform\/staff:\d+"/.test(lines[1]) && lines[2].includes(got.body?.sha256 ?? sql(`select sha256 from platform_firm_export where id = '${first.body.id}'`)) && lines[3].startsWith("platform.firm_export.expired|"), lines);
  ok("PF-11 DW7 fail: no line holds a name, an email or a value from the export", !lines.some((l) => /@|Sample|Representative|HYPERLINK/.test(l)), lines);
} catch (e) { ok("no unexpected error", false, String((e as Error)?.stack ?? e)); } finally {
  await app?.close();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
