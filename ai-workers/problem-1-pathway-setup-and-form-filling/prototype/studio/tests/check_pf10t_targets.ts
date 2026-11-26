// PF-10t (R1.35; map row 35's "contacts"; AG-18-3, -13, -14, -38, -42, -43, -45, -59): people as an import target, through
// the engine's routes on a scratch database with the real fo_person, ConsentPort and audit. Each "Done when" line passes
// and fails:
//   DW1 a CSV of people, one already known by email → the others created, the known one merged filling ONLY empty fields;
//   DW2 a phone in a local format is stored in E.164 and matches by phone when there is no email; each bad row's reason
//       in words (email, phone, language, no name, no contact, consent without an email);
//   DW3 consent: a "yes" with the declaration writes one IMPORT_DECLARED email marketing consent naming the batch; "no"
//       writes none; a person who withdrew, merged away, suppressed or unsubscribed is never given consent by an import;
//   DW4 source: a created person's origin is Import, its batch and its source name;
//   DW5 a re-import of the same file adds no person and no consent;
//   DW6 quiet: no lead, no message in the outbox (AG-18-43, -59); the target is registered by the feature.
// US$0, no network.
//   tsx studio/tests/check_pf10t_targets.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeFiles } from "../ports/files.ts";
import { ImportTargets } from "../ports/import-target.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf10t_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
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
const { CONSENT_PORT, consentStore } = await import("../api/src/platform/messages/consent/index.ts");
const { IMPORT_TARGETS, registerImportJobs } = await import("../api/src/features/platform-import.ts");
const { FrontOfficeImportTargets } = await import("../api/src/features/front-office-import-targets.ts");
const { seedFirmFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { PersonImportTarget } = await import("../api/src/front-office/import-targets/person.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const local = new LocalIdentity("pf10t-check-signing-key-0123456789abcdef", () => clock.now());
const targets = new ImportTargets<unknown>();
const files = fakeFiles(), jobs = fakeJobs(new FakeClock());

type Res = { status: number; body: any };
let base = "";
const call = async (method: string, path: string, o: { token?: string; body?: unknown; csv?: string } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": o.csv !== undefined ? "text/csv" : "application/json" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.csv ?? (o.body === undefined ? undefined : JSON.stringify(o.body)) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};

let app: { close(): Promise<void> } | null = null;
let svc: InstanceType<typeof ImportService> | null = null;
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: IMPORT_TARGETS, useValue: targets }, { provide: CONSENT_PORT, useValue: consentStore }, FrontOfficeImportTargets,
    { provide: ImportService, useFactory: (d: InstanceType<typeof Db>) => (svc = new ImportService({ db: d, audit: auditEvent, files, targets: targets as never, jobs })), inject: [Db] }];
  @Module({ controllers: [PlatformIdentityController, ImportController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  await registerImportJobs(jobs, svc!);
  const person = targets.get("person");
  ok("PF-10t DW6 pass: the front office's feature registers the person target (fo_person, personal data) at start-up", person?.recordKind === "fo_person" && person.personalData === true && person.label === "People");

  await seedSampleFirms(db);
  const FIRM_A = (await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } })).id;
  await db.$transaction(async (tx) => { if (!(await tx.foSalesSetup.findFirst({ where: { firmId: FIRM_A } }))) await seedFirmFrontOffice(tx, FIRM_A); });
  const signIn = async (actorId: string, firmKey = "sample-firm") => { const r = await call("POST", "/api/platform/session/local", { body: { firmKey, actorId, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const tR = await signIn("user-R");
  // Known people: Client B by email (no phone, no language), Client W who withdrew marketing email, Client P by phone only.
  const mk = (d: Record<string, unknown>) => db.foPerson.create({ data: { firmId: FIRM_A, createdBy: "seed:test", phoneReadable: true, ...d } as never });
  const B = await mk({ givenNames: "Client", familyName: "B", email: "b@client.test" });
  const W = await mk({ givenNames: "Client", familyName: "W", email: "w@client.test" });
  const P = await mk({ givenNames: "Client", familyName: "P", phone: "+14165550199" });
  await db.$transaction(async (tx) => {
    await consentStore.record(tx, { firmId: FIRM_A, subject: { kind: "FO_PERSON", id: W.id }, channel: "EMAIL", purpose: "MARKETING", basis: "IMPORT_DECLARED", source: "IMPORT_DECLARED", recordedKind: "USER", recordedBy: "staff:seed" });
    await consentStore.withdraw(tx, { firmId: FIRM_A, subject: { kind: "FO_PERSON", id: W.id }, channel: "EMAIL", purpose: "MARKETING", via: "STAFF", by: "staff:seed" });
  });
  const consents = () => Number(sql(`select count(*) from msg_consent where firm_id = '${FIRM_A}'`));
  const c0 = consents(), people0 = Number(sql(`select count(*) from fo_person where firm_id = '${FIRM_A}'`)), leads0 = sql(`select count(*) from fo_lead where firm_id = '${FIRM_A}'`), out0 = sql("select count(*) from msg_outbox");

  const FILE = [
    "First name,Last name,Email,Phone,Language,Marketing",
    "Client,A,a@client.test,(416) 555-0101,fr,yes",          // 1 create, consent
    "Client,Bee,B@client.test,416 555 0102,en,yes",           // 2 merge: phone, language, consent filled; family name kept
    "Client,C,c@client.test,,,no",                             // 3 create, no consent
    "Client,W,w@client.test,,,yes",                            // 4 merge: nothing new (consent withdrawn stays) → SKIP
    "Client,P,,416-555-0199,es,",                              // 5 merge by phone: language filled
    "Client,D,not-an-email,,,",                                // 6 error: email
    "Client,E,e@client.test,12,xx,",                           // 7 error: phone, language
    ",,f@client.test,,,",                                      // 8 error: no name
    "Client,G,,,,",                                            // 9 error: no contact
    "Client,H,,4165550103,,yes",                               // 10 error: consent needs an email
  ].join("\r\n") + "\r\n";
  const up = await call("POST", "/api/platform/imports?target=person&source=Old%20spreadsheet", { token: tR, csv: FILE });
  ok("PF-10t DW1 pass: the upload offers the mapping from the headers (first name, last name, email, phone, language, marketing)",
    up.status === 201 && Object.entries({ "First name": "givenNames", "Last name": "familyName", Email: "email", Phone: "phone", Language: "language", Marketing: "marketingConsent" }).every(([k, v]) => up.body.mapping.columns[k] === v) && Object.keys(up.body.mapping.columns).length === 6, up.body);
  const noDecl = await call("POST", `/api/platform/imports/${up.body.id}/dry-run`, { token: tR, body: { columns: up.body.mapping.columns } });
  ok("PF-10t DW3 fail: the consent column without the declaration → refused before any preview", noDecl.status === 422 && noDecl.body.code === "DECLARATION_NEEDED", noDecl.body);
  await call("POST", "/api/platform/imports/attestation", { token: tR, body: { version: "2026-11-25.1", confirm: true } });
  const dry = await call("POST", `/api/platform/imports/${up.body.id}/dry-run`, { token: tR, body: { columns: up.body.mapping.columns, declared: true } });
  ok("PF-10t DW1 pass: the preview: 2 to create, 2 to merge (by email, and by phone with no email), 1 skip (withdrawn consent is not filled), 5 errors",
    dry.status === 201 && dry.body.totals.CREATE === 2 && dry.body.totals.MERGE === 2 && dry.body.totals.SKIP === 1 && dry.body.totals.ERROR === 5, dry.body.totals);
  const rows = (await call("GET", `/api/platform/imports/${up.body.id}/rows`, { token: tR })).body.rows as { row: number; outcome: string; recordId: string | null; reasons: { words: string }[] }[];
  const words = (n: number) => rows.find((r) => r.row === n)!.reasons.map((r) => r.words);
  ok("PF-10t DW2 pass: each bad row's reason in words", words(6)[0] === "Email: is not an email address" && words(7).join("|") === "Phone: is not a phone number|Language: is not a language code (for example en or fr)"
    && words(8)[0] === "Given names: needs a given or family name" && words(9)[0] === "Email: needs an email or a phone" && words(10)[0] === "Email marketing consent: needs an email (consent is for email)", rows);
  ok("PF-10t DW2 pass: row 5 (no email) matches Client P by the phone in E.164; row 4 (Client W, withdrawn) is SKIP nothing new",
    rows[4].outcome === "MERGE" && rows[4].recordId === P.id && rows[3].outcome === "SKIP" && rows[3].recordId === W.id && rows[1].recordId === B.id);
  await call("POST", `/api/platform/imports/${up.body.id}/run`, { token: tR, body: { dryRunHash: dry.body.dryRunHash } }); await jobs.runDue();
  const run = await call("GET", `/api/platform/imports/${up.body.id}`, { token: tR });
  ok("PF-10t DW1 pass: the run → PARTIAL: 2 created, 2 merged, 1 skipped, 5 errors", run.status === 200 && run.body.state === "PARTIAL" && run.body.counts.created === 2 && run.body.counts.merged === 2 && run.body.counts.skipped === 1 && run.body.counts.errors === 5, run.body);
  const a = await db.foPerson.findFirstOrThrow({ where: { firmId: FIRM_A, email: "a@client.test" } }), b = await db.foPerson.findUniqueOrThrow({ where: { id: B.id } }), p = await db.foPerson.findUniqueOrThrow({ where: { id: P.id } });
  ok("PF-10t DW2 pass: the local phone \"(416) 555-0101\" is stored as +14165550101 (readable), the language as fr", a.phone === "+14165550101" && a.phoneReadable && a.phoneE164 === "+14165550101" && a.language === "fr", a);
  ok("PF-10t DW1 pass: Client B kept the filled family name (\"B\", not the file's \"Bee\") and gained phone and language; Client P gained the language only",
    b.familyName === "B" && b.phone === "+14165550102" && b.language === "en" && p.language === "es" && p.phone === "+14165550199" && p.givenNames === "Client", [b, p]);
  ok("PF-10t DW1 fail: 2 people more, not 5 (a merge never makes a second person)", Number(sql(`select count(*) from fo_person where firm_id = '${FIRM_A}'`)) === people0 + 2);
  const live = (id: string) => sql(`select count(*) from msg_consent where subject_id = '${id}' and purpose = 'MARKETING' and withdrawn_at is null`);
  ok("PF-10t DW3 pass: Client A and Client B each have one live email marketing consent, basis and source IMPORT_DECLARED, naming the batch",
    live(a.id) === "1" && live(B.id) === "1" && sql(`select basis || '|' || source || '|' || source_ref from msg_consent where subject_id = '${a.id}'`) === `IMPORT_DECLARED|IMPORT_DECLARED|import:${up.body.id}` && consents() === c0 + 2);
  const c = await db.foPerson.findFirstOrThrow({ where: { firmId: FIRM_A, email: "c@client.test" } });
  ok("PF-10t DW3 fail: \"no\" writes no consent; Client W, who withdrew, is not given consent again", live(c.id) === "0" && live(W.id) === "0");
  const orig = await call("GET", `/api/platform/imports/origin/fo_person/${a.id}`, { token: tR }), origB = await call("GET", `/api/platform/imports/origin/fo_person/${B.id}`, { token: tR });
  ok("PF-10t DW4 pass/fail: Client A's origin is Import, from \"Old spreadsheet\"; Client B (already known) was not imported", orig.body.imported && orig.body.origin === "IMPORT" && orig.body.sourceName === "Old spreadsheet" && origB.body.imported === false, [orig.body, origB.body]);
  const listA = await call("GET", "/api/platform/imports", { token: tR }), tO = await signIn("user-O"), listO = await call("GET", "/api/platform/imports", { token: tO });
  ok("PF-10t DW4 pass/fail: the import list shows the batch with its source and counts (AG-18-56); a Case Officer without view-report → 403", listA.body.total === 1 && listA.body.imports[0].sourceName === "Old spreadsheet" && listA.body.imports[0].counts.created === 2 && listO.status === 403, listA.body);
  ok("PF-10t DW6 pass: quiet: no lead made, no message queued (AG-18-43, -59)", sql(`select count(*) from fo_lead where firm_id = '${FIRM_A}'`) === leads0 && sql("select count(*) from msg_outbox") === out0);
  ok("PF-10t DW6 pass: one audit line per person made or filled, ids and fields named, in the trail", sql("select count(*) from audit_event where action = 'front_office.person.imported'") === "2" && sql("select count(*) from audit_event where action = 'front_office.person.import_filled'") === "2");

  // DW5: the same file again.
  const up2 = await call("POST", "/api/platform/imports?target=person&source=Old%20spreadsheet", { token: tR, csv: FILE });
  const dry2 = await call("POST", `/api/platform/imports/${up2.body.id}/dry-run`, { token: tR, body: { columns: up2.body.mapping.columns, declared: true } });
  ok("PF-10t DW5 pass: the re-import's preview: 0 to create, 0 to merge, 5 skip (nothing new), the same 5 errors", dry2.body.totals.CREATE === 0 && dry2.body.totals.MERGE === 0 && dry2.body.totals.SKIP === 5 && dry2.body.totals.ERROR === 5, dry2.body.totals);
  const run2 = await call("POST", `/api/platform/imports/${up2.body.id}/run`, { token: tR, body: { dryRunHash: dry2.body.dryRunHash } }); await jobs.runDue();
  ok("PF-10t DW5 fail: the re-import adds no person and no consent", run2.status === 201 && Number(sql(`select count(*) from fo_person where firm_id = '${FIRM_A}'`)) === people0 + 2 && consents() === c0 + 2, run2.body);

  // DW3 (review and break, round 1): a merged-away person's email, a suppressed address, an address the consent store
  // cannot keep, and an unsubscribe never bring consent back; one odd address never fails the preview.
  const D = await mk({ givenNames: "Client", familyName: "D", email: "d.old@client.test" }), L = await mk({ givenNames: "Client", familyName: "L", email: "l.new@client.test" }), S2 = await mk({ givenNames: "Client", familyName: "S2", email: "s2@client.test" });
  await db.$transaction(async (tx) => {
    await consentStore.record(tx, { firmId: FIRM_A, subject: { kind: "FO_PERSON", id: D.id }, channel: "EMAIL", purpose: "MARKETING", basis: "IMPORT_DECLARED", source: "IMPORT_DECLARED", recordedKind: "USER", recordedBy: "staff:seed" });
    await consentStore.withdraw(tx, { firmId: FIRM_A, subject: { kind: "FO_PERSON", id: D.id }, channel: "EMAIL", purpose: "MARKETING", via: "STAFF", by: "staff:seed" });
    await tx.$executeRaw`select set_config('fo_dup.merging', 'on', true)`;
    await tx.$executeRaw`update fo_person set merged_into_id = ${L.id}::uuid, merged_at = now() where id = ${D.id}::uuid`;
    for (const address of ["s.new@client.test", "s2@client.test"]) await consentStore.suppress(tx, { firmId: FIRM_A, channel: "EMAIL", address, reason: "STAFF", by: "staff:seed" });
  });
  const people3 = Number(sql(`select count(*) from fo_person where firm_id = '${FIRM_A}'`)), c3 = consents();
  const FILE3 = ["First name,Last name,Email,Marketing", "Client,Dee,d.old@client.test,yes", "Client,S,s.new@client.test,yes", "Client,S2,s2@client.test,yes", "José,Núñez,josé@exemple.fr,yes", "Mia,C,\"mia,c@example.com\",yes"].join("\n") + "\n";
  const up3 = await call("POST", "/api/platform/imports?target=person&source=Second%20file", { token: tR, csv: FILE3 });
  const dry3 = await call("POST", `/api/platform/imports/${up3.body.id}/dry-run`, { token: tR, body: { columns: up3.body.mapping.columns, declared: true } });
  const rows3 = dry3.status === 201 ? (await call("GET", `/api/platform/imports/${up3.body.id}/rows`, { token: tR })).body.rows as { row: number; outcome: string; recordId: string | null; reasons: { words: string }[] }[] : [];
  ok("PF-10t DW3 pass: a merged-away person's email follows to the survivor (SKIP on Client L, no new person)", rows3[0]?.outcome === "SKIP" && rows3[0]?.recordId === L.id, [dry3.status, rows3]);
  ok("PF-10t DW2 fail: an address the consent store cannot keep (non-ASCII, a comma) is \"not an email address\", and the preview answers (no 500)",
    dry3.status === 201 && rows3[3]?.reasons[0]?.words === "Email: is not an email address" && rows3[4]?.reasons[0]?.words === "Email: is not an email address", [dry3.status, dry3.body, rows3]);
  ok("PF-10t DW3 pass: a known person at a suppressed address is SKIP (consent kept off)", rows3[2]?.outcome === "SKIP" && rows3[2]?.recordId === S2.id, rows3);
  await call("POST", `/api/platform/imports/${up3.body.id}/run`, { token: tR, body: { dryRunHash: dry3.body.dryRunHash } }); await jobs.runDue();
  const sNew = await db.foPerson.findFirst({ where: { firmId: FIRM_A, email: "s.new@client.test" } });
  ok("PF-10t DW3 fail: no consent for the survivor through the tombstone, none for the new person at a suppressed address, none for the suppressed known one",
    !!sNew && live(sNew.id) === "0" && live(L.id) === "0" && live(S2.id) === "0" && consents() === c3 && Number(sql(`select count(*) from fo_person where firm_id = '${FIRM_A}'`)) === people3 + 1, [sNew, consents(), c3]);
  const target = new PersonImportTarget(auditEvent, { ...consentStore, allows: async () => ({ allowed: false, reason: "ADDRESS_UNSUBSCRIBED", purpose: "MARKETING" }) } as never);
  const noneTarget = new PersonImportTarget(auditEvent, { ...consentStore, allows: async () => ({ allowed: false, reason: "NO_CONSENT", purpose: "MARKETING" }) } as never);
  ok("PF-10t DW3 pass/fail: an unsubscribed address keeps consent off (\"kept\"); with no consent at all the import may fill it (null)",
    (await target.find(db as never, FIRM_A, "email:c@client.test"))?.values.marketingConsent === "kept" && (await noneTarget.find(db as never, FIRM_A, "email:c@client.test"))?.values.marketingConsent === null);
  await mk({ givenNames: "Odd", familyName: "Door", email: "odd,x@client.test" });
  ok("PF-10t DW3 fail: a known person whose address another door let in is matched without a throw, consent kept off", (await new PersonImportTarget(auditEvent, consentStore).find(db as never, FIRM_A, "email:odd,x@client.test"))?.values.marketingConsent === "kept");

  // Firm walls and keys on the list and the origin (review M3).
  const tS = await signIn("user-S", "sample-solo");
  const listS = await call("GET", "/api/platform/imports", { token: tS }), origS = await call("GET", `/api/platform/imports/origin/fo_person/${a.id}`, { token: tS });
  ok("PF-10t DW4 fail: another firm's Owner sees none of this firm's imports, and not this firm's person's origin", listS.status === 200 && listS.body.total === 0 && origS.status === 200 && origS.body.imported === false, [listS.body, origS.body]);
  const origO = await call("GET", `/api/platform/imports/origin/fo_person/${a.id}`, { token: tO }), origQ = await call("GET", `/api/platform/imports/origin/fo_person/${a.id}?x=1`, { token: tR });
  ok("PF-10t DW4 fail: the origin without view-report → 403; an unknown query key → 422 (PF-28)", origO.status === 403 && origQ.status === 422, [origO.status, origQ.status]);
} catch (e) {
  ok("the check ran to the end", false, String((e as Error).stack ?? e));
} finally {
  await app?.close().catch(() => {});
  await db.$disconnect().catch(() => {});
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
