// PF-10b part 1 (R1.35; map row 35; AG-18-1, -6, -8, -11, -12, -13, -15, -16, -17, -20, -38, -49, -54, -58): the one import
// engine, on a test target. Each "Done when" line passes and fails:
//   DW1 the CSV reader: quotes, line breaks, CRLF, a byte-order mark, ';' files; a formula is text; non-UTF-8, an open
//       quote, a repeated or empty header, the row ceiling refused in words naming the limit; the report cell is formula-safe;
//   DW2 upload: text/csv only, a named target and source, the key agent/import:run; the mapping offered from the headers,
//       then from the saved mapping of the same source;
//   DW3 column mapping: an unknown field, a field mapped twice, a required field unmapped, a consent column without the
//       declaration → refused with each column named;
//   DW4 the preview (dry run): CREATE, MERGE, SKIP (duplicate in the file, nothing new) and ERROR with {field, rule} reasons
//       in words, never the cell's value; nothing written to a record;
//   DW5 the run: refused without a dry run, for another dry run's code, without the Owner's attestation (Owner only);
//       a job, never in the request; each row once; a merge fills only empty fields; a stopped job resumes and decides
//       as the preview did; a row the target refuses is an error and the run goes on; a re-import creates nothing;
//   DW6 firm walls, permission keys, one audit line per step (counts only).
// A scratch database and a Nest app of PF-4's guard and this row's classes with the local stand-in sign-in. US$0.
//   tsx studio/tests/check_pf10b_import_engine.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeFiles } from "../ports/files.ts";
import { ImportTargetUnavailable, ImportTargets, type Existing, type ImportTarget } from "../ports/import-target.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { CsvRefused, MAX_ROWS, readCsv, safeCell } from "../api/src/platform/import/csv.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf10b_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };
const refusedCsv = (s: string | Uint8Array, code: string) => { try { readCsv(typeof s === "string" ? new TextEncoder().encode(s) : s); return false; } catch (e) { return e instanceof CsvRefused && e.code === code; } };
const enc = (s: string) => new TextEncoder().encode(s);
// ------------------------------------------------------------------------------------------- DW1: the CSV reader (no db)
const c1 = readCsv(enc("\ufeffName,Email,Note\r\n\"Doe, Jane\",jane@x.test,\"two\nlines \"\"quoted\"\"\"\r\n\r\nBo,bo@x.test,=HYPERLINK(\"http://x\")\n"));
ok("PF-10b DW1 pass: quotes, a comma and a line break inside quotes, doubled quotes, CRLF, a BOM and an empty line", c1.header.join("|") === "Name|Email|Note" && c1.rows.length === 2 && c1.rows[0][0] === "Doe, Jane" && c1.rows[0][2] === "two\nlines \"quoted\"", c1);
ok("PF-10b DW1 pass: a formula cell is kept as the text it is (never evaluated, AG-18-6)", c1.rows[1][2] === "=HYPERLINK(\"http://x\")");
ok("PF-10b DW1 pass: a ';' file (a French-language spreadsheet's CSV) is read by its header line", readCsv(enc("a;b\n1;2,5\n")).rows[0].join("|") === "1|2,5");
ok("PF-10b DW1 fail: bytes that are not UTF-8 → NOT_UTF8 (never guessed)", refusedCsv(new Uint8Array([0x61, 0x2c, 0x62, 0x0a, 0xe9, 0x2c, 0x31, 0x0a]), "NOT_UTF8"));
ok("PF-10b DW1 fail: a quote never closed → UNCLOSED_QUOTE", refusedCsv("a,b\n\"x,1\n", "UNCLOSED_QUOTE"));
ok("PF-10b DW1 fail: a repeated header, an empty header cell, no rows", refusedCsv("a,a\n1,2\n", "HEADER_REPEATED") && refusedCsv("a,,c\n1,2,3\n", "NO_HEADER") && refusedCsv("a,b\n", "NO_ROWS"));
let rowsMsg = "";
try { readCsv(enc(`a\n${"1\n".repeat(MAX_ROWS + 1)}`)); } catch (e) { rowsMsg = (e as Error).message; }
ok("PF-10b DW1 fail: one row over the ceiling → refused, the message names the limit (AG-18-58); the ceiling itself passes", /at most 5,000/.test(rowsMsg) && readCsv(enc(`a\n${"1\n".repeat(MAX_ROWS)}`)).rows.length === MAX_ROWS, rowsMsg);
ok("PF-10b DW1 pass/fail: a report cell starting =, +, -, @ is neutralised; ordinary text is unchanged (AG-18-21)", safeCell("=1+1") === "'=1+1" && safeCell("@x") === "'@x" && safeCell("-2") === "'-2" && safeCell("Jane") === "Jane" && safeCell("a,b") === "\"a,b\"");

ok("PF-10b DW1 fail: a header over 200 UTF-16 units (101 emoji: re-review N1) or with a control character → HEADER_TOO_LONG (break F1, F4)", refusedCsv(`${"h".repeat(201)},b\n1,2\n`, "HEADER_TOO_LONG") && refusedCsv("a\u0000,b\n1,2\n", "HEADER_TOO_LONG") && refusedCsv(`${"😀".repeat(101)},b\n1,2\n`, "HEADER_TOO_LONG") && readCsv(enc(`${"h".repeat(200)},b\n1,2\n`)).header.length === 2);
ok("PF-10b DW1 pass (break F7): a CR-only ';' file and a line of spaces only", readCsv(enc("a;b\r1;2,5\r  \r")).rows.map((r) => r.join("|")).join("/") === "1|2,5");
// ------------------------------------------------- the test target: a real table, written in the engine's transaction
type Tx = { $queryRaw: <T>(q: TemplateStringsArray, ...v: unknown[]) => Promise<T>; $executeRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<number> };
let unavailableAt: string | null = null;
const testTarget: ImportTarget<unknown> = {
  key: "test_contact", label: "Test contacts", recordKind: "test_contact", personalData: true, version: 1, keyField: "email",
  fields: [
    { key: "name", label: "Name", required: true, kind: "TEXT", aliases: ["full name"] },
    { key: "email", label: "Email", required: false, kind: "EMAIL", aliases: ["e-mail"] },
    { key: "city", label: "City", required: false, kind: "TEXT", aliases: [] },
    { key: "consent", label: "Email marketing consent", required: false, kind: "CONSENT", aliases: [], values: ["yes", "no"] },
  ],
  check(c) {
    const reasons = [];
    if (c.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(c.email)) reasons.push({ field: "email", rule: "not_email" });
    if (c.consent !== undefined && !["yes", "no"].includes(c.consent.toLowerCase())) reasons.push({ field: "consent", rule: "not_allowed_value" });
    if (reasons.length) return { reasons };
    return { values: { ...c, ...(c.email ? { email: c.email.toLowerCase() } : {}) }, naturalKey: c.email ? c.email.toLowerCase() : null };
  },
  async find(tx, firmId, key) { const [r] = await (tx as Tx).$queryRaw<Record<string, string | null>[]>`select id::text, name, email, city, consent from test_contact where firm_id = ${firmId}::uuid and email = ${key}`; return r ? { id: r.id!, values: { name: r.name, email: r.email, city: r.city, consent: r.consent } } : null; },
  fills(e: Existing, v) { return Object.keys(v).filter((k) => (e.values[k] ?? null) === null); },
  async create(tx, ctx, v) {
    if (unavailableAt !== null && v.email === unavailableAt) { unavailableAt = null; throw new ImportTargetUnavailable(); }
    const id = crypto.randomUUID();
    await (tx as Tx).$executeRaw`insert into test_contact values (${id}::uuid, ${ctx.firmId}::uuid, ${v.name ?? null}, ${v.email ?? null}, ${v.city ?? null}, ${v.consent ?? null})`;
    return { id };
  },
  async merge(tx, _ctx, e, v, fields) {
    for (const f of fields) await (tx as Tx).$executeRaw`update test_contact set city = case when ${f} = 'city' then ${v[f]} else city end, consent = case when ${f} = 'consent' then ${v[f]} else consent end where id = ${e.id}::uuid`;
    return { before: e.values };
  },
};
// --------------------------------------------------------------------------------------------- the scratch database
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
// The name check stands for a target that refuses a row on write (its own key or check): break M2, M3.
sql("create table test_contact (id uuid primary key, firm_id uuid not null, name text check (name <> 'Refused'), email text, city text, consent text, unique (firm_id, email))");
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { ImportService } = await import("../api/src/platform/import/engine.ts");
const { ImportController } = await import("../api/src/platform/import/routes.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { default: feature, registerImportJobs } = await import("../api/src/features/platform-import.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const local = new LocalIdentity("pf10b-check-signing-key-0123456789abcdef", () => clock.now());
const targets = new ImportTargets<unknown>();
targets.register(testTarget);
const files = fakeFiles(), jclock = new FakeClock(), jobs = fakeJobs(jclock);
const contacts = () => Number(sql("select count(*) from test_contact"));
const contact = (email: string) => JSON.parse(sql(`select coalesce(row_to_json(c)::text, 'null') from test_contact c where email = '${email}'`) || "null");

type Res = { status: number; body: any };
let base = "";
const call = async (method: string, path: string, o: { token?: string; body?: unknown; csv?: string | Uint8Array; type?: string } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": o.type ?? (o.csv !== undefined ? "text/csv" : "application/json") };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.csv !== undefined ? (typeof o.csv === "string" ? o.csv : Buffer.from(o.csv)) : o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};
const lines = (action: string) => Number(sql(`select count(*) from audit_event where action = '${action}'`));

let app: { close(): Promise<void> } | null = null;
try {
  let svc: InstanceType<typeof ImportService> | null = null;
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: ImportService, useFactory: (d: InstanceType<typeof Db>) => (svc = new ImportService({ db: d, audit: auditEvent, files, targets: targets as never, jobs, now: () => jclock.now() })), inject: [Db] }];
  @Module({ controllers: [PlatformIdentityController, ImportController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  await registerImportJobs(jobs, svc!);
  ok("setup: the feature registers the controller, the registry, the service and the job's handler", feature.controllers.length === 1 && feature.controllers[0] === ImportController && feature.providers.length === 3);

  await seedSampleFirms(db);
  const FIRM_A = (await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } })).id;
  const signIn = async (actorId: string, firmKey = "sample-firm") => { const r = await call("POST", "/api/platform/session/local", { body: { firmKey, actorId, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const tR = await signIn("user-R"), tO = await signIn("user-O"), tS = await signIn("user-S", "sample-solo");
  const KNOWN = crypto.randomUUID();
  sql(`insert into test_contact values ('${KNOWN}', '${FIRM_A}', 'Client B', 'b@client.test', null, null)`);
  const FILE = "Full name,E-mail,City,Marketing\r\nClient A,a@client.test,Toronto,yes\r\nClient B,B@Client.test,Ottawa,no\r\nClient C,not-an-email,Halifax,yes\r\nClient A again,a@client.test,Montreal,yes\r\n,c2@client.test,,maybe\r\n";
  const upload = (token: string, csv: string | Uint8Array = FILE, q = "target=test_contact&source=Old%20CRM", type?: string) => call("POST", `/api/platform/imports?${q}`, { token, csv, type });
  const dry = (token: string, id: string, body: unknown) => call("POST", `/api/platform/imports/${id}/dry-run`, { token, body });
  const run = async (token: string, id: string, dryRunHash: unknown) => { const r = await call("POST", `/api/platform/imports/${id}/run`, { token, body: { dryRunHash } }); await jobs.runDue(); return r; };
  const view = async (id: string) => (await call("GET", `/api/platform/imports/${id}`, { token: tR })).body;
  // --------------------------------------------------------------------------------------------- DW2: upload
  const noKey = await upload(tO);
  ok("PF-10b DW2 fail: a Case Officer without agent/import:run → 403, no batch", noKey.status === 403 && sql("select count(*) from plat_import_batch") === "0", noKey.body);
  const asJson = await call("POST", "/api/platform/imports?target=test_contact&source=Old%20CRM", { token: tR, body: { csv: FILE } });
  ok("PF-10b DW2 fail: a JSON body (not the file) → 415 NOT_CSV", asJson.status === 415 && asJson.body.code === "NOT_CSV", asJson.body);
  const noTarget = await upload(tR, FILE, "target=nothing&source=Old%20CRM"), noSource = await upload(tR, FILE, "target=test_contact&source=%20%20"), longSource = await upload(tR, FILE, `target=test_contact&source=${"s".repeat(201)}`);
  ok("PF-10b DW2 fail: an unknown target → 404; a blank source or one over 200 characters → 422 naming source in words", noTarget.status === 404 && noTarget.body.code === "NO_SUCH_TARGET" && noSource.status === 422 && "source" in noSource.body.fields && longSource.body.fields?.source === "At most 200 characters.", [noTarget.body, noSource.body, longSource.body]);
  const notUtf8 = await upload(tR, new Uint8Array([0x61, 0x0a, 0xff, 0x0a])), big = await upload(tR, "a\n" + "x".repeat(10 * 1024 * 1024));
  ok("PF-10b DW2 fail: not UTF-8 → 422 in words; over 10 MB → 422 TOO_LARGE naming the limit (AG-18-58); no batch", notUtf8.status === 422 && notUtf8.body.code === "NOT_UTF8" && /CSV UTF-8/.test(notUtf8.body.detail) && big.status === 422 && big.body.code === "TOO_LARGE" && /10 MB/.test(big.body.detail) && sql("select count(*) from plat_import_batch") === "0", [notUtf8.body, big.status]);
  const up = await upload(tR);
  const B1 = up.body.id as string;
  ok("PF-10b DW2 pass: the Owner uploads → a DRAFT batch, 5 rows, the header, and the mapping offered by header words (aliases)", up.status === 201 && up.body.state === "DRAFT" && up.body.rows === 5 && up.body.mapping.columns["Full name"] === "name" && up.body.mapping.columns["E-mail"] === "email" && up.body.mapping.columns.City === "city" && up.body.mapping.columns.Marketing === null && up.body.mappingFrom === "headers", up.body);
  ok("PF-10b DW2 pass: the file is stored by the file port, its SHA-256 on the batch; one audit line, counts only", files.count === 1 && /^[0-9a-f]{64}$/.test(sql(`select file_sha256 from plat_import_batch where id = '${B1}'`)) && lines("platform.import.uploaded") === 1 && !sql("select detail::text || summary from audit_event where action = 'platform.import.uploaded'").includes("client.test"));
  // --------------------------------------------------------------------------------------------- DW3: column mapping
  const cols = { "Full name": "name", "E-mail": "email", City: "city", Marketing: "consent" };
  const bad = await Promise.all([{ ...cols, City: "nothing" }, { ...cols, City: "email" }, { ...cols, "Full name": null }].map((columns) => dry(tR, B1, { columns })));
  const noDecl = await dry(tR, B1, { columns: cols });
  ok("PF-10b DW3 fail: a column mapped to an unknown field, a field mapped twice, the required Name unmapped → 422 MAPPING_REFUSED naming each column", bad.every((b) => b.status === 422 && b.body.code === "MAPPING_REFUSED") && /Column "City" is mapped to a field that does not exist/.test(bad[0].body.faults[0].words) && bad[1].body.faults.some((f: { rule: string }) => f.rule === "field_mapped_twice") && /Name is required: map a column to it/.test(bad[2].body.faults[0].words), bad.map((b) => b.body));
  ok("PF-10b DW3 fail: a consent column mapped without the importer's declaration → 422 DECLARATION_NEEDED (AG-18-45)", noDecl.status === 422 && noDecl.body.code === "DECLARATION_NEEDED", noDecl.body);
  ok("PF-10b DW3: no refused mapping moved the batch or wrote a preview row", sql(`select state from plat_import_batch where id = '${B1}'`) === "DRAFT" && sql("select count(*) from plat_import_row") === "0");
  // --------------------------------------------------------------------------------------------- DW4: the preview
  const p1 = await dry(tR, B1, { columns: cols, declared: true });
  ok("PF-10b DW4 pass: the dry run → DRY_RUN_READY: 1 create, 1 merge, 1 skip (a duplicate in the file), 2 errors, and its code", p1.status === 201 && p1.body.state === "DRY_RUN_READY" && JSON.stringify(p1.body.totals) === JSON.stringify({ CREATE: 1, MERGE: 1, SKIP: 1, ERROR: 2 }) && /^[0-9a-f]{64}$/.test(p1.body.dryRunHash), p1.body);
  const pr = await call("GET", `/api/platform/imports/${B1}/rows`, { token: tR });
  const byRow = (n: number) => pr.body.rows.find((r: { row: number }) => r.row === n);
  ok("PF-10b DW4 pass: each bad row's reason in words: row 3 \"Email: is not an email address\", row 5 the required Name and the consent value", byRow(3).outcome === "ERROR" && byRow(3).reasons[0].words === "Email: is not an email address" && byRow(5).reasons.some((r: { words: string }) => r.words === "Name: is required") && byRow(5).reasons.some((r: { words: string }) => r.words === "Email marketing consent: is not one of the allowed values"), pr.body);
  ok("PF-10b DW4 pass: row 4 repeats row 1's email → SKIP; row 2 matches the firm's Client B by email (case folded) → MERGE naming the record", byRow(4).outcome === "SKIP" && byRow(4).reasons[0].rule === "duplicate_in_file" && byRow(2).outcome === "MERGE" && byRow(2).recordId === KNOWN && byRow(1).outcome === "CREATE", pr.body);
  ok("PF-10b DW4 fail: no reason holds a cell's value (AG-18-12), and the preview wrote nothing to a record", !/not-an-email|maybe|client\.test/.test(sql("select coalesce(string_agg(reasons::text, ''), '') from plat_import_row")) && !JSON.stringify(pr.body).includes("not-an-email") && contacts() === 1 && contact("b@client.test").city === null);
  ok("PF-10b DW4 pass: the rows filter by outcome", (await call("GET", `/api/platform/imports/${B1}/rows?outcome=ERROR`, { token: tR })).body.total === 2);
  // --------------------------------------------------------------------------------------------- DW5: the run
  const noAtt = await run(tR, B1, p1.body.dryRunHash);
  ok("PF-10b DW5 fail: personal data and no Owner's attestation → 409 ATTESTATION_NEEDED, nothing imported (AG-18-49)", noAtt.status === 409 && noAtt.body.code === "ATTESTATION_NEEDED" && contacts() === 1, noAtt.body);
  const attO = await call("POST", "/api/platform/imports/attestation", { token: tO, body: { version: "2026-11-25.1", confirm: true } });
  const attNoTick = await call("POST", "/api/platform/imports/attestation", { token: tR, body: { version: "2026-11-25.1" } });
  ok("PF-10b DW5 fail: a Case Officer cannot attest (403); an Owner without ticking → 422", attO.status === 403 && attNoTick.status === 422 && sql("select count(*) from plat_import_attestation") === "0", [attO.body, attNoTick.body]);
  const att = await call("POST", "/api/platform/imports/attestation", { token: tR, body: { version: "2026-11-25.1", confirm: true } });
  ok("PF-10b DW5 pass: the Owner attests the current wording → one attestation and one audit line", att.status === 201 && sql("select count(*) from plat_import_attestation") === "1" && lines("platform.import.attested") === 1, att.body);
  const stale = await run(tR, B1, p1.body.dryRunHash);
  ok("PF-10b DW5 fail: the dry run before the attestation names none → the run still refuses until the preview is run again", stale.status === 409 && stale.body.code === "ATTESTATION_NEEDED", stale.body);
  const p2 = await dry(tR, B1, { columns: { ...cols, City: null }, declared: true });
  const changed = await run(tR, B1, p1.body.dryRunHash);
  ok("PF-10b DW5 fail: a changed mapping after the first preview → a new code; the old one is refused 409 DRY_RUN_CHANGED (AG-18-16)", p2.body.dryRunHash !== p1.body.dryRunHash && changed.status === 409 && changed.body.code === "DRY_RUN_CHANGED" && contacts() === 1, changed.body);
  const p3 = await dry(tR, B1, { columns: cols, declared: true });
  ok("PF-10b DW5 fail: a run without a dry run's code → 422", (await call("POST", `/api/platform/imports/${B1}/run`, { token: tR, body: {} })).status === 422);
  unavailableAt = "a@client.test";   // the store is down while row 1 is written: the job stops
  const started = await run(tR, B1, p3.body.dryRunHash);
  ok("PF-10b DW5 pass: the run answers at once with the batch RUNNING and a job queued (never the rows in the request, STANDARDS §3)", started.status === 201 && started.body.state === "RUNNING" && jobs.jobs.some((j) => j.name === "platform.import.run"), started.body);
  ok("PF-10b DW5 (store down): the job failed at row 1, the batch is still RUNNING, row 1 not written", jobs.jobs.some((j) => j.status === "failed") && (await view(B1)).state === "RUNNING" && sql(`select count(*) from plat_import_row where batch_id = '${B1}' and phase = 'RUN'`) === "0");
  await jclock.advance({ minutes: 1 });
  const resumed = await run(tR, B1, p3.body.dryRunHash), v1 = await view(B1);
  ok("PF-10b DW5 pass: Run again queues the job again; it finishes PARTIAL: 1 created, 1 merged, 1 skipped, 2 errors, each row written once (AG-18-20)", resumed.status === 201 && v1.state === "PARTIAL" && JSON.stringify(v1.counts) === JSON.stringify({ created: 1, merged: 1, skipped: 1, errors: 2 }) && sql(`select count(*) || '/' || count(distinct row_number) from plat_import_row where batch_id = '${B1}' and phase = 'RUN'`) === "5/5" && v1.undoDeadline !== null, v1);
  ok("PF-10b DW5 pass: Client A created once (row 4's repeat skipped), as normalised", contacts() === 2 && contact("a@client.test")?.city === "Toronto" && contact("a@client.test")?.consent === "yes");
  const b = contact("b@client.test");
  ok("PF-10b DW5 pass: the merge filled only Client B's empty fields (city, consent), kept the name; the before-image is kept for undo", b.name === "Client B" && b.city === "Ottawa" && b.consent === "no" && sql(`select before_image->>'city' is null and before_image->>'name' = 'Client B' from plat_import_row where batch_id = '${B1}' and phase = 'RUN' and outcome = 'MERGE'`) === "t");
  const again = await run(tR, B1, p3.body.dryRunHash);
  ok("PF-10b DW5 fail: running a finished import again → 409 ALREADY_RUN, nothing more", again.status === 409 && again.body.code === "ALREADY_RUN" && contacts() === 2, again.body);
  // Break M1 / F2: a resumed job decides as the preview did (an error row's email never makes a later row a duplicate).
  const R = "Full name,E-mail\r\n,dup@x.test\r\nZed,crash@x.test\r\nAnn,dup@x.test\r\nRefused,refused@x.test\r\nCy,cy@x.test\r\n";
  const u3 = await upload(tR, R, "target=test_contact&source=Resume"), d3 = await dry(tR, u3.body.id, { columns: { "Full name": "name", "E-mail": "email" } });
  unavailableAt = "crash@x.test";
  await run(tR, u3.body.id, d3.body.dryRunHash); await jclock.advance({ minutes: 1 }); await run(tR, u3.body.id, d3.body.dryRunHash);
  const v3 = await view(u3.body.id), r3 = (await call("GET", `/api/platform/imports/${u3.body.id}/rows`, { token: tR })).body.rows;
  ok("PF-10b DW5 fail (break M1, F2): after a stop at row 2, row 3 (Ann) is created, not skipped as a duplicate of row 1's error", d3.body.totals.CREATE === 4 && contact("dup@x.test")?.name === "Ann" && r3[2].outcome === "CREATE", r3);
  ok("PF-10b DW5 fail (break M2, M3): the target refuses row 4 on write → that row is an error \"could not be saved\", the run goes on to row 5 and ends PARTIAL", r3[3].outcome === "ERROR" && r3[3].reasons[0].words === "row: could not be saved (nothing of it was imported)" && contact("cy@x.test")?.name === "Cy" && v3.state === "PARTIAL" && v3.counts.errors === 2, [v3, r3]);
  // A second import of the same file (re-import adds no duplicate).
  const up2 = await upload(tR);
  ok("PF-10b DW2 pass: the same source again → the saved mapping is offered (AG-18-11)", up2.body.mappingFrom === "saved" && up2.body.mapping.columns.Marketing === "consent", up2.body);
  const q2 = await dry(tR, up2.body.id, { columns: cols, declared: true });
  ok("PF-10b DW4 pass: the re-import's preview → 0 to create, 0 to merge (all on record with nothing new), 2 errors as before", JSON.stringify(q2.body.totals) === JSON.stringify({ CREATE: 0, MERGE: 0, SKIP: 3, ERROR: 2 }), q2.body);
  await run(tR, up2.body.id, q2.body.dryRunHash);
  const v2 = await view(up2.body.id), before2 = contacts();
  ok("PF-10b DW5 pass: the re-import runs and adds no record (FAILED: nothing made, 2 errors)", v2.state === "FAILED" && v2.undoDeadline === null && contacts() === before2 && contact("a@client.test") !== null, v2);
  // --------------------------------------------------------------------------------------------- DW6: walls, keys, audit, origin
  const otherFirm = await call("GET", `/api/platform/imports/${B1}`, { token: tS }), otherRows = await call("GET", `/api/platform/imports/${B1}/rows`, { token: tS });
  ok("PF-10b DW6 fail: firm B's Owner gets 404 for firm A's import and its rows", otherFirm.status === 404 && otherRows.status === 404, otherFirm.body);
  ok("PF-10b DW6 pass: one audit line per step (3 uploads, 5 dry runs, 3 starts, 3 finishes), none naming a person's value", lines("platform.import.uploaded") === 3 && lines("platform.import.dry_run") === 5 && lines("platform.import.started") === 3 && lines("platform.import.finished") === 3 && !sql("select string_agg(summary || detail::text, ' ') from audit_event where action like 'platform.import.%'").includes("client.test"));
  const targetsRes = await call("GET", "/api/platform/imports/targets", { token: tR });
  ok("PF-10b DW2 pass: the targets list names the test target, its fields and the two wordings", targetsRes.body.targets[0].key === "test_contact" && targetsRes.body.targets[0].fields.length === 4 && /Unconfirmed: no counsel/.test(targetsRes.body.attestation.unconfirmed));
  ok("PF-10b fail: the registry refuses a second target with the same key", (() => { try { targets.register(testTarget); return false; } catch { return true; } })());
} catch (e) {
  ok("the check ran to the end", false, String((e as Error).stack ?? e));
} finally {
  await app?.close().catch(() => {});
  await db.$disconnect().catch(() => {});
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
