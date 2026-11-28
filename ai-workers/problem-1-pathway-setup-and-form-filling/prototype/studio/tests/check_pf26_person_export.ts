// PF-26 part 2 (R1.34; AG-2-93 rules 1-3, 5, 7, 8, 10, 11; SA-11-36, SA-11-40; shape product/screens/PF-26/shape.md): one
// person's data as one export, over the routes, on a scratch database with PF-12's walls, PF-4's guard, fake jobs and files
// on a fake clock. Each line a pass and a fail: who may (the key, can see the person: a lead, view.all, the case scope;
// none of those → 404); one person record (merged records in, a family member never, a merged-away record 404); the
// reason; 503 until every required module registered; the job (READY, or FAILED naming the module, no file; a write in
// the read-only build fails it); the requester-only download (others 404, expired 410); expiry deletes the file unless a
// legal hold covers the person; the audit lines (who, the person, no content, no reason text); the walls; the front
// office's person exporter keeps the exporter rules (exporterCases). No model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf26_person_export.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { FakeClock } from "../ports/clock.ts";
import { exporterCases } from "../ports/contracts/person-export-port.contract.ts";
import { fakeFiles } from "../ports/files.ts";
import { fakeJobs } from "../ports/jobs.ts";
import type { PersonExporter } from "../ports/person-export.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf26_${process.pid}`;
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
const sql = (q: string, user = "xr_studio") => execFileSync(join(BIN, "psql"), [urlOf(DB, user), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const refused = (q: string, like: RegExp, user = "xr_studio") => { try { sql(q, user); return false; } catch (e) { return like.test(String((e as { stderr?: unknown }).stderr ?? e)); } };

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
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
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { withFirm } = await import("../api/src/platform/firm-scope.ts");
const { PgLegalHolds } = await import("../api/src/platform/register/holds/adapter.ts");
const { PersonExportRegistry } = await import("../api/src/platform/person-export/registry.ts");
const { PersonExportController } = await import("../api/src/platform/person-export/routes.ts");
const { PersonExports, canSee, lineageOf, LINEAGE_MAX, PERSON_EXPORT_KEY } = await import("../api/src/platform/person-export/service.ts");
const { personRecordExporter } = await import("../api/src/front-office/person-export/person.ts");
const feature = (await import("../api/src/features/platform-person-export.ts")).default;
const foFeature = (await import("../api/src/features/front-office-person-export.ts")).default;

const fc = new FakeClock("2026-11-25T05:00:00Z"), jobs = fakeJobs(fc), files = fakeFiles();
const clock = new (class extends PlatformClock { override now() { return fc.now().getTime(); } })();
const local = new LocalIdentity("pf26-check-signing-key-0123456789abcdef", () => clock.now());
type Res = { status: number; body: any; bytes?: Uint8Array; headers?: Headers };
let app: { close(): Promise<void> } | null = null;
try {
  await seedSampleFirms(new (await import("@prisma/client")).PrismaClient({ adapter: new (await import("@prisma/adapter-pg")).PrismaPg({ connectionString: urlOf(DB) }) }));
  const FIRM_A = sql(`select id from platform_firm where key = 'sample-firm'`), FIRM_B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const staff = (actor: string) => sql(`select id from platform_staff where actor_id = '${actor}'`);
  const [R, O, T] = ["user-R", "user-O", "user-T"].map(staff);   // R Owner + Case Manager, O Case Officer (no key), T Case Manager
  for (const f of [FIRM_A, FIRM_B]) sql(`insert into fo_sales_setup (firm_id) values ('${f}') on conflict do nothing`);
  const person = (firm: string, given: string) => sql(`insert into fo_person (firm_id, given_names, family_name, language, created_by, updated_at) values ('${firm}', '${given}', 'Sample', 'fr', 'seed:pf26', now()) returning id`).split("\n")[0];
  const lead = (firm: string, p: string, owner: string | null) => sql(`insert into fo_lead (firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values ('${firm}', '${p}', 'MANUAL', 'Sample', ${owner ? `'${owner}'` : "null"}, 'seed:pf26', now()) returning id`).split("\n")[0];
  const CLIENT_B = person(FIRM_A, "ClientB"), MERGED = person(FIRM_A, "ClientBOld"), FAMILY = person(FIRM_A, "FamilyMember"), NO_LEAD = person(FIRM_A, "NoLead"), OTHER = person(FIRM_B, "OtherFirm");
  sql(`update fo_person set merged_into_id = '${CLIENT_B}', merged_at = now() where id = '${MERGED}'`);
  lead(FIRM_A, CLIENT_B, R); lead(FIRM_A, FAMILY, R);
  const setEveryone = (on: boolean) => sql(`insert into platform_firm_setting (firm_id, key, value, changed_by) values ('${FIRM_A}', 'platform.everyone_sees_all', '${on}', 'seed:pf26') on conflict (firm_id, key) do update set value = excluded.value`);

  // The registry: the front office's real person exporter, and stand-ins for the case side and client money (part 4 makes
  // them real) that mark what they were asked; `failing` makes the money stand-in throw, `writing` makes it write.
  const flags = { failing: false, writing: false, asked: [] as string[] };
  const caseSide: PersonExporter<never> = { module: "case-side", declares: ["cases"], async sections(_tx, s) { flags.asked.push(s.records.join("+")); return [{ name: "cases", title: "Cases", items: [] }]; } };
  const money: PersonExporter<any> = { module: "client-money", declares: ["invoices"], async sections(tx, s) {
    if (flags.failing) throw new Error(`invoice of ${s.personId} unreadable`);
    if (flags.writing) await tx.$executeRawUnsafe(`update fo_person set language = 'en' where id = '${s.personId}'`);
    return [{ name: "invoices", title: "Invoices", items: [{ number: "INV-1", deleted: true }] }]; } };
  let theDb: never;
  const holds = { on: false, real: new PgLegalHolds(), isHeld(tx: never, f: string, q: never) { return this.on ? Promise.resolve({ held: true as const, holds: [] }) : this.real.isHeld(tx, f, q); } };
  const registry = new PersonExportRegistry();
  // Failures injected once (review M3, break M1/M3, review m3): the "ready" line, a file delete, the queueing.
  const inject = { readyLine: false, deleteOnce: false, enqueueOnce: false, scheduleOnce: false }, puts: string[] = [], schedules: { key: string; queued: boolean }[] = [];
  const wAudit = { record: (tx: never, e: { action: string }) => { if (inject.readyLine && e.action === "platform.person_export.ready") { inject.readyLine = false; throw new Error("audit down"); } return (auditEvent as any).record(tx, e); } };
  const wFiles = { ...files, put: async (f: string, k: string, b: Uint8Array, t: string) => { puts.push(k); return files.put(f, k, b, t); }, get: files.get.bind(files), exists: files.exists.bind(files),
    delete: async (f: string, k: string) => { if (inject.deleteOnce) { inject.deleteOnce = false; throw new Error("store down"); } return files.delete(f, k); } } as typeof files;
  const wJobs = { ...jobs, enqueue: async (...a: Parameters<typeof jobs.enqueue>) => { if (inject.enqueueOnce) { inject.enqueueOnce = false; throw new Error("queue down"); } return jobs.enqueue(...a); },
    schedule: async (...a: Parameters<typeof jobs.schedule>) => { if (inject.scheduleOnce) { inject.scheduleOnce = false; throw new Error("queue down"); } const r = await jobs.schedule(...a); schedules.push({ key: a[3].key, queued: r.queued }); return r; }, handle: jobs.handle.bind(jobs), recurring: jobs.recurring.bind(jobs) } as typeof jobs;
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: PersonExports, useFactory: (db: never) => { theDb = db; return new PersonExports({ db, port: registry, files: wFiles, jobs: wJobs, audit: wAudit as never, holds: holds as never, now: () => fc.now() }); }, inject: [Db] }];
  @Module({ controllers: [PlatformIdentityController, PersonExportController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const svc = nest.get(PersonExports); await svc.register(wJobs);
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  const call = async (method: string, path: string, token?: string, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const buf = new Uint8Array(await r.arrayBuffer()), text = new TextDecoder().decode(buf); let parsed: any = text; try { parsed = JSON.parse(text); } catch { /* bytes */ }
    return { status: r.status, body: parsed, bytes: buf, headers: r.headers };
  };
  const signIn = async (actorId: string, firmKey = "sample-firm") => { const r = await call("POST", "/api/platform/session/local", undefined, { firmKey, actorId, secondStep: true }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  let [tR, tO, tT, tS] = [await signIn("user-R"), await signIn("user-O"), await signIn("user-T"), await signIn("user-S", "sample-solo")];
  const P = (id: string) => `/api/front-office/people/${id}/exports`;
  const ask = (t: string, id: string, reason: unknown = "Client B asked for a copy of their data (Sample)") => call("POST", P(id), t, { reason });
  const rows = () => Number(sql(`select count(*) from platform_person_export`));
  const lines = (action: string) => sql(`select coalesce(json_agg(json_build_object('actor', actor, 'detail', detail, 'summary', summary) order by at), '[]') from audit_event where action = '${action}'`);

  ok("setup: the feature files register the registry, the controller and the service; the front office registers its person exporter",
    feature.controllers?.[0] === PersonExportController && feature.providers?.length === 2 && foFeature.providers?.length === 1);

  // ------------------------------------------------------------------- switched off until whole (review m7)
  registry.register(personRecordExporter);
  const early = await ask(tT, CLIENT_B), earlyAllowed = await call("GET", `${P(CLIENT_B)}/allowed`, tT);
  ok("PF-26 fail (shape, review m7): with the case side and client money not registered, a request answers 503 NOT_AVAILABLE_YET and the action is not offered; no row made",
    early.status === 503 && early.body.code === "NOT_AVAILABLE_YET" && earlyAllowed.status === 503 && rows() === 0, [early.body, earlyAllowed.body]);
  const stub = (module: string): PersonExporter<never> => ({ module, declares: ["items"], sections: async () => [{ name: "items", title: module, items: [] }] });
  registry.register(stub("front-office.sales") as never); registry.register(stub("front-office.services") as never); registry.register(stub("platform.messages") as never);
  registry.register(stub("case-side.extra") as never);   // a wildcard look-alike opens nothing
  const notYet = await ask(tT, CLIENT_B);
  ok("PF-26 fail (review round 2): every module but case-side and client-money registered (and a case-side.extra look-alike) → still 503", notYet.status === 503 && rows() === 0, notYet.body);
  registry.register(caseSide as never); registry.register(money as never);

  // ------------------------------------------------------------------- who may (rules 1, 2)
  const first = await ask(tT, CLIENT_B), allowed = await call("GET", `${P(CLIENT_B)}/allowed`, tT);
  const again = await ask(tT, CLIENT_B, "Pressed twice (Sample)");
  ok("PF-26 pass (AG-2-93 rules 1, 2): a Case Manager who sees the person (everyone sees all) asks: 201 QUEUED with the reason; the action is offered",
    first.status === 201 && first.body.state === "QUEUED" && /asked for a copy/.test(first.body.reason) && allowed.status === 200 && again.body.id === first.body.id && rows() === 1, [first.body, allowed.body]);
  const noKey = await Promise.all([ask(tO, CLIENT_B), call("GET", `${P(CLIENT_B)}/allowed`, tO), call("GET", P(CLIENT_B), tO), ask("", CLIENT_B)]);
  ok("PF-26 fail (AG-2-93 rule 1): a Case Officer (no agent/data-export:request) asking, asking whether it is offered, or listing → 403; no session → 401; no row made",
    noKey.map((r) => r.status).join() === "403,403,403,401" && rows() === 1, noKey.map((r) => [r.status, r.body.code]));
  setEveryone(false);
  const ownNot = await Promise.all([ask(tT, CLIENT_B), ask(tT, NO_LEAD), call("GET", `${P(CLIENT_B)}/allowed`, tT)]), ownYes = await ask(tR, CLIENT_B);
  ok("PF-26 pass/fail (AG-2-93 rule 2, AG02-D12): with everyone-sees-all off, the Case Manager who owns none of Client B's leads → 404 (as reading it would), a person with no lead, prospect or client file → 404; the lead's owner asks → 201",
    ownNot.every((r) => r.status === 404 && r.body.code === "NOT_FOUND") && ownYes.status === 201 && rows() === 2, [ownNot.map((r) => r.status), ownYes.status]);
  setEveryone(true);
  const noLeadAll = await ask(tT, NO_LEAD);
  ok("PF-26 pass (AG02-D12): a person with no lead, prospect or client file is exported by a holder of view.all with everyone-sees-all on", noLeadAll.status === 201, noLeadAll.body);
  // The case scope (CS-S1's rule): a viewer with view.own only sees a person whose case they own the file of.
  const ownCtx = (staffId: string) => ({ staffId, firmId: FIRM_A, firmKey: "sample-firm", roles: [], keys: [PERSON_EXPORT_KEY, "agent/prospect:view.own", "agent/case:view.own"], duties: [], authTime: 0, via: "local" as const });
  const W = sql(`select id from workspace limit 1`) || sql(`insert into workspace (id, name) values (gen_random_uuid(), 'pf26') returning id`).split("\n")[0];
  const CC = sql(`set session_replication_role = replica; insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, file_owner, created_by) values (gen_random_uuid(), '${W}', 'sample-firm', '${FIRM_A}', 9001, 'NoLead Sample', 'PERSON', '${NO_LEAD}', '${T}', 'seed:pf26') returning id`).split("\n").filter(Boolean).pop()!;
  sql(`set session_replication_role = replica; insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id, client_id) values (gen_random_uuid(), '${W}', gen_random_uuid(), 'user-P', 'user-O', 'C-2026-09001', 'sample-firm', '${FIRM_A}', '${CC}')`);
  const db = nest.get(Db) as never as import("@prisma/client").PrismaClient;
  const seesCase = await withFirm(FIRM_A, () => canSee(db, ownCtx(T), [NO_LEAD])), notCase = await withFirm(FIRM_A, () => canSee(db, ownCtx(O), [NO_LEAD]));
  ok("PF-26 pass/fail (AG-2-93 rule 2, AG-7-88): with view.own only, the file owner of the person's case sees the person; another staff member does not", seesCase === true && notCase === false, { seesCase, notCase });

  // ------------------------------------------------------------------- one person record (rule 3, SA-11-40)
  const lin = await withFirm(FIRM_A, () => lineageOf(db, FIRM_A, CLIENT_B)), gone = await ask(tT, MERGED), otherFirm = await ask(tT, OTHER), crossFirm = await ask(tS, CLIENT_B);
  ok("PF-26 pass/fail (AG-2-93 rule 3): Client B's records are Client B then the record merged into it; the merged-away record, another firm's person, and another firm's staff asking for Client B → 404",
    lin?.join() === [CLIENT_B, MERGED].join() && [gone, otherFirm, crossFirm].every((r) => r.status === 404), [lin, gone.status, otherFirm.status, crossFirm.status]);

  // ------------------------------------------------------------------- the reason ("who and why")
  const bad = await Promise.all([ask(tT, CLIENT_B, ""), ask(tT, CLIENT_B, "   "), ask(tT, CLIENT_B, "x".repeat(301)), ask(tT, CLIENT_B, "a‮b"), call("POST", P(CLIENT_B), tT, {}), call("POST", P(CLIENT_B), tT, { reason: "ok", extra: 1 })]);
  ok("PF-26 fail (shape question (a)): an empty, blank, 301-character, direction-mark or missing reason, or an extra field → 422 naming reason; no row made",
    bad.every((r) => r.status === 422) && bad.slice(0, 5).every((r) => typeof r.body.fields?.reason === "string") && rows() === 3, bad.map((r) => [r.status, r.body]));
  const odd = await Promise.all(["Client asked by email\nfor a copy", "tab\there", "\u200b\u200b", "ok\u061cok", "ok\u2060ok", "ok\u{E0041}ok", "ok\u2028ok", "ok\ufeffok", "ok\ud800ok", "...!!!"].map((r) => ask(tT, CLIENT_B, r)));
  ok("PF-26 fail (review M1, break m1): a reason with a line break or tab, only zero-width characters, U+061C, a word joiner, a tag character, a line separator, a byte-order mark, a lone surrogate, or no letter or digit → 422 naming reason, never 500; no row made",
    odd.every((r) => r.status === 422 && typeof r.body.fields?.reason === "string") && rows() === 3, odd.map((r) => [r.status, r.body.fields]));
  const scripts = ["طلب العميل نسخة", "ग्राहक ने प्रति मांगी", "客户要求复制数据", "Ο πελάτης ζήτησε αντίγραφο", "مشتری می\u200cخواهد نسخه"];
  const nonLatin: Res[] = []; for (const r of scripts) { nonLatin.push(await ask(tR, NO_LEAD, r)); await jobs.runDue(); }
  ok("PF-26 pass (review R2-M1, break R2-M2, R2-m1): a reason written in Arabic, Hindi, Chinese, Greek, or Persian with a zero-width non-joiner is accepted by the app and the table (on this cluster's C locale)",
    nonLatin.every((r) => r.status === 201), nonLatin.map((r) => [r.status, r.body.code]));
  ok("PF-26 fail (database, review M1): the table refuses the same reasons (a line break, U+061C, a zero-width-only reason, no letter or digit)",
    [`E'a\\nb'`, `E'ok\\u061cok'`, `E'\\u200b'`, `'...!!!'`].every((lit) => refused(`insert into platform_person_export (id, firm_id, person_id, requested_by, reason) values (gen_random_uuid(), '${FIRM_A}', '${CLIENT_B}', '${T}', ${lit})`, /platform_person_export_facts/)));
  ok("PF-26 fail (database): a reason over 300 characters or a control character is refused by the table's check too",
    refused(`insert into platform_person_export (id, firm_id, person_id, requested_by, reason) values (gen_random_uuid(), '${FIRM_A}', '${CLIENT_B}', '${T}', repeat('x', 301))`, /platform_person_export_facts/)
    && refused(`insert into platform_person_export (id, firm_id, person_id, requested_by, reason) values (gen_random_uuid(), '${FIRM_A}', '${CLIENT_B}', '${T}', E'a\\x01b')`, /platform_person_export_facts/));

  // ------------------------------------------------------------------- the job and the package (rules 5, 8, 10, 11)
  await jobs.runDue();
  const done = await call("GET", `${P(CLIENT_B)}/${first.body.id}`, tT), got = await call("GET", `${P(CLIENT_B)}/${first.body.id}/download`, tT);
  const pkg = got.status === 200 ? JSON.parse(new TextDecoder().decode(got.bytes)) : null;
  const persons = pkg?.modules.find((m: any) => m.module === "front-office.person")?.sections[0].items ?? [];
  ok("PF-26 pass (AG-2-93 rules 3, 5, 8, 10, 11; SA-11-40): the job makes it READY; the requester downloads one JSON file holding every module, Client B and the merged record, unmasked, the person's language, the deleted invoice marked, no family member",
    done.body.state === "READY" && got.status === 200 && /application\/json/.test(got.headers?.get("content-type") ?? "") && got.headers?.get("x-export-sha256") === done.body.sha256 && got.headers?.get("cache-control") === "no-store"
      && pkg.modules.map((m: any) => m.module).join() === "front-office.person,front-office.sales,front-office.services,platform.messages,case-side.extra,case-side,client-money" && persons.map((p: any) => p.recordId).join() === [CLIENT_B, MERGED].join()
      && pkg.masked === false && pkg.language === "fr" && pkg.modules[6].sections[0].items[0].deleted === true && !JSON.stringify(pkg).includes("FamilyMember") && flags.asked[0] === [CLIENT_B, MERGED].join("+"), { done: done.body, pkg });
  const others = await Promise.all([call("GET", `${P(CLIENT_B)}/${first.body.id}/download`, tR), call("GET", `${P(CLIENT_B)}/${first.body.id}`, tR), call("GET", `${P(CLIENT_B)}/${first.body.id}/download`, tS), call("GET", `${P(NO_LEAD)}/${first.body.id}/download`, tT)]);
  const list = await call("GET", P(CLIENT_B), tR);
  ok("PF-26 fail (AG-2-93 §10: only the requester downloads): the Owner (another staff member), another firm's staff, and the requester through another person's path → 404; the Owner's list shows only the Owner's own export",
    others.every((r) => r.status === 404) && list.status === 200 && list.body.items.every((i: any) => i.id !== first.body.id), [others.map((r) => r.status), list.body]);
  flags.failing = true; const f1 = await ask(tT, CLIENT_B); await jobs.runDue(); flags.failing = false;
  flags.writing = true; const f2 = await ask(tT, CLIENT_B); await jobs.runDue(); flags.writing = false;
  const [v1, v2] = [await call("GET", `${P(CLIENT_B)}/${f1.body.id}`, tT), await call("GET", `${P(CLIENT_B)}/${f2.body.id}`, tT)], dl1 = await call("GET", `${P(CLIENT_B)}/${f1.body.id}/download`, tT);
  const failedLines = lines("platform.person_export.failed");
  ok("PF-26 fail (AG-2-93 Failure state; shape m9 read-only): a module that throws, and a module that writes inside the build, each end FAILED naming the module, no file stored; the download answers 409 \"Export failed\"; the failure line holds no message",
    v1.body.state === "FAILED" && v2.body.state === "FAILED" && sql(`select failed_module from platform_person_export where id = '${f1.body.id}'`) === "client-money" && sql(`select file_key is null from platform_person_export where id in ('${f1.body.id}', '${f2.body.id}') group by 1`) === "t"
      && sql(`select language from fo_person where id = '${CLIENT_B}'`) === "fr" && dl1.status === 409 && dl1.body.title === "Export failed" && !failedLines.includes("unreadable"), [v1.body, v2.body, dl1.body]);

  // ------------------------------------------------------------------- the audit lines (rule 7)
  const asked = JSON.parse(lines("platform.person_export.requested")), ready = JSON.parse(lines("platform.person_export.ready")), dl = JSON.parse(lines("platform.person_export.downloaded"));
  ok("PF-26 pass (AG-2-93 rule 7): the request, the ready file and the download each write a line naming who (staff:<id> or the job), the person's id and, for the file, its hash; none holds the reason text, a name or the package's content",
    asked[0]?.actor === `staff:${T}` && asked[0].detail.personId === CLIENT_B && ready[0]?.detail.sha256 === done.body.sha256 && dl[0]?.actor === `staff:${T}` && dl[0].detail.sha256 === done.body.sha256
      && ![asked, ready, dl].some((l) => /asked for a copy|ClientB|Sample"|INV-1/.test(JSON.stringify(l))), { asked, ready, dl });

  // ------------------------------------------------------------------- a build whose result is not recorded (review M3, break M1)
  inject.readyLine = true; const orphan = await ask(tT, FAMILY), putsBefore = puts.length; await jobs.runDue();
  const firstAttempt = puts[putsBefore];
  const stillQueued = sql(`select state from platform_person_export where id = '${orphan.body.id}'`);
  await withFirm(FIRM_A, () => svc.build(orphan.body.id, FIRM_A));   // the runner's retry
  const retryKey = sql(`select file_key from platform_person_export where id = '${orphan.body.id}'`);
  ok("PF-26 fail/pass (review M3, break M1): when the ready line fails, the row stays QUEUED and that attempt's file is deleted, never left; the retry stores its own file and ends READY",
    orphan.status === 201 && stillQueued === "QUEUED" && !!firstAttempt && !(await files.exists(FIRM_A, firstAttempt)) && retryKey !== firstAttempt && (await files.exists(FIRM_A, retryKey))
      && sql(`select state from platform_person_export where id = '${orphan.body.id}'`) === "READY", { firstAttempt, retryKey, stillQueued });

  // ------------------------------------------------------------------- queueing fails (review m3); a double click (review m4)
  inject.enqueueOnce = true; const nq = await ask(tT, NO_LEAD);
  ok("PF-26 fail (review m3): when the build cannot be queued, the request answers 503 \"Export failed\" and its row is FAILED \"(queue)\", never QUEUED forever",
    nq.status === 503 && sql(`select count(*) from platform_person_export where state = 'QUEUED'`) === "0" && sql(`select count(*) from platform_person_export where failed_module = '(queue)'`) === "1", nq.body);
  const d1 = await ask(tT, NO_LEAD), d2 = await ask(tT, NO_LEAD, "A second click (Sample)"); await jobs.runDue();
  ok("PF-26 pass (review m4): a second request while the first is still being prepared answers the same export (one row, one file)", d1.body.id === d2.body.id && sql(`select count(*) from platform_person_export where id = '${d1.body.id}'`) === "1", [d1.body, d2.body]);

  // ------------------------------------------------------------------- a client file with no case (review m1); a long lineage (review m2)
  const FILE_ONLY = person(FIRM_A, "FileOnly");
  sql(`set session_replication_role = replica; insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, file_owner, created_by) values (gen_random_uuid(), '${W}', 'sample-firm', '${FIRM_A}', 9002, 'FileOnly Sample', 'PERSON', '${FILE_ONLY}', '${T}', 'seed:pf26')`);
  const fileOwner = await withFirm(FIRM_A, () => canSee(db, ownCtx(T), [FILE_ONLY])), notOwner = await withFirm(FIRM_A, () => canSee(db, ownCtx(O), [FILE_ONLY]));
  ok("PF-26 pass/fail (review m1; AG-2-93 rule 2, AG-7-88): with view.own only, the owner of the person's client file with no case sees the person; another staff member does not", fileOwner === true && notOwner === false, { fileOwner, notOwner });
  const LONG = person(FIRM_A, "LongChain");
  sql(`do $$ declare prev uuid := '${LONG}'; nid uuid; begin for i in 1..${LINEAGE_MAX} loop insert into fo_person (firm_id, given_names, family_name, created_by, updated_at, merged_into_id, merged_at) values ('${FIRM_A}', 'Old', 'Sample', 'seed:pf26', now(), prev, now()) returning id into nid; prev := nid; end loop; end $$`);
  const long = await ask(tT, LONG);
  ok(`PF-26 fail (review m2): a person with more than ${LINEAGE_MAX} merged records answers 409 LINEAGE_TOO_LONG, never a shortened package`, long.status === 409 && long.body.code === "LINEAGE_TOO_LONG", long.body);

  // ------------------------------------------------------------------- a build that never finished (break R2-M1)
  const deadId = sql(`insert into platform_person_export (id, firm_id, person_id, requested_by, reason, created_at) values (gen_random_uuid(), '${FIRM_A}', '${FILE_ONLY}', '${R}', 'Lost build (Sample)', '${new Date(fc.now().getTime() - 3_600_000).toISOString()}') returning id`).split("\n")[0];
  const fresh = await ask(tR, FILE_ONLY, "Asked again (Sample)"); await jobs.runDue();
  ok("PF-26 fail/pass (break R2-M1): a request QUEUED for over 30 minutes is closed FAILED \"(stale)\" with its line, and a new request starts a new export that becomes READY",
    fresh.status === 201 && fresh.body.id !== deadId && sql(`select state || ':' || failed_module from platform_person_export where id = '${deadId}'`) === "FAILED:(stale)"
      && sql(`select state from platform_person_export where id = '${fresh.body.id}'`) === "READY" && sql(`select count(*) from audit_event where action = 'platform.person_export.failed' and entity_key = '${deadId}'`) === "1", fresh.body);
  // An early expiry run, and a schedule lost after READY (break R2-M3; review R2-m1, R2-m2).
  await withFirm(FIRM_A, () => svc.expire(fresh.body.id, FIRM_A));
  const earlyRun = schedules[schedules.length - 1];
  inject.scheduleOnce = true; const lost = await ask(tR, CLIENT_B, "Schedule lost (Sample)"); await jobs.runDue();
  const lostKeyBefore = schedules.filter((x) => x.key.startsWith(`person-export:${lost.body.id}:expire`)).length;
  await withFirm(FIRM_A, () => svc.build(lost.body.id, FIRM_A));   // the runner's retry of the failed build job
  const lostAfter = schedules.filter((x) => x.key.startsWith(`person-export:${lost.body.id}:expire`));
  ok("PF-26 pass (break R2-M3; review R2-m1, R2-m2): an early expiry run queues its own check for the expiry time; when the schedule fails after READY, the build's retry queues it",
    earlyRun?.queued === true && earlyRun.key.startsWith(`person-export:${fresh.body.id}:expire:`) && earlyRun.key.split(":").length > 4
      && sql(`select state from platform_person_export where id = '${lost.body.id}'`) === "READY" && lostKeyBefore === 0 && lostAfter.length === 1 && lostAfter[0].queued, { earlyRun, lostAfter });

  // ------------------------------------------------------------------- expiry (Sample 7 days) and the legal hold (review M2, break M2, M3)
  holds.on = true;   // before the clock moves: advancing runs the due expiry jobs
  await fc.advance({ days: 7 });
  [tR, tT] = [await signIn("user-R"), await signIn("user-T")];   // a session ends long before 7 days
  const expiredRead = await call("GET", `${P(CLIENT_B)}/${ownYes.body.id}/download`, tR);
  const keptKey = sql(`select file_key from platform_person_export where id = '${ownYes.body.id}'`), firstKey = sql(`select file_key from platform_person_export where id = '${first.body.id}'`);
  ok("PF-26 pass/fail (shape; SA-11 BR-7): after 7 days the download answers 410 \"This download has expired\"; while a hold covers the person the files are kept (READY, one \"kept\" line each, checked again daily)",
    expiredRead.status === 410 && expiredRead.body.title === "This download has expired" && sql(`select string_agg(distinct state::text, ',') from platform_person_export where id in ('${ownYes.body.id}', '${first.body.id}')`) === "READY"
      && (await files.exists(FIRM_A, keptKey)) && (await files.exists(FIRM_A, firstKey)) && sql(`select count(*) from audit_event where action = 'platform.person_export.kept' and entity_key = '${first.body.id}'`) === "1", [expiredRead.body, keptKey]);
  await fc.advance({ days: 1, minutes: 1 });   // still held: checked again, still kept, no second line
  const stillKept = sql(`select count(*) from audit_event where action = 'platform.person_export.kept' and entity_key = '${first.body.id}'`) === "1" && (await files.exists(FIRM_A, firstKey));
  holds.on = false; await fc.advance({ days: 1, minutes: 1 });   // the hold released: the next daily check deletes
  ok("PF-26 pass (review M2, break M2): once the hold is released, the next daily check marks them EXPIRED and deletes the files",
    stillKept && sql(`select string_agg(distinct state::text, ',') from platform_person_export where id in ('${ownYes.body.id}', '${first.body.id}')`) === "EXPIRED" && !(await files.exists(FIRM_A, keptKey)) && !(await files.exists(FIRM_A, firstKey)));
  [tR, tT] = [await signIn("user-R"), await signIn("user-T")];
  const n2 = await call("POST", P(NO_LEAD), tT, { reason: "Second copy (Sample)" }); await jobs.runDue();
  inject.deleteOnce = true; await fc.advance({ days: 7, minutes: 1 });
  const k2 = sql(`select file_key from platform_person_export where id = '${n2.body.id}'`), afterFailedDelete = await files.exists(FIRM_A, k2);
  await withFirm(FIRM_A, () => svc.expire(n2.body.id, FIRM_A));   // the runner's retry
  [tR, tT] = [await signIn("user-R"), await signIn("user-T")];
  ok("PF-26 fail/pass (break M3): a delete that fails leaves the row EXPIRED with its file; the job's retry deletes the file",
    n2.status === 201 && sql(`select state from platform_person_export where id = '${n2.body.id}'`) === "EXPIRED" && afterFailedDelete && !(await files.exists(FIRM_A, k2)), k2);

  // ------------------------------------------------------------------- the table's rules and walls
  const id1 = first.body.id;
  ok("PF-26 fail (database): who, for whom and why never change; EXPIRED never goes back; a request is never deleted; a READY row needs its file facts",
    refused(`update platform_person_export set reason = 'changed' where id = '${id1}'`, /never change/) && refused(`update platform_person_export set state = 'READY' where id = '${id1}'`, /forward only/)
    && refused(`delete from platform_person_export where id = '${id1}'`, /never deleted/) && refused(`truncate platform_person_export`, /never deleted/)
    && refused(`insert into platform_person_export (id, firm_id, person_id, requested_by, reason, state, finished_at) values (gen_random_uuid(), '${FIRM_A}', '${CLIENT_B}', '${T}', 'x', 'READY', now())`, /platform_person_export_facts/));
  const asApp = (firm: string, q: string) => sql(`begin; select set_config('app.firm_id', '${firm}', true); ${q}; commit`, "xr_app").split("\n").filter((l) => /^\d+$/.test(l)).pop();
  ok("PF-12 walls: as the app, firm B sees none of firm A's exports and firm A sees its own", asApp(FIRM_B, `select count(*) from platform_person_export`) === "0" && Number(asApp(FIRM_A, `select count(*) from platform_person_export`)) > 0);

  // ------------------------------------------------------------------- the front office's person exporter keeps the rules
  for (const c of exporterCases(async () => ({
    exporter: personRecordExporter as never,
    run: (firm, fn) => withFirm(firm, () => (db as any).$transaction((tx: never) => fn(tx))) as never,
    async seed() {
      const k = crypto.randomUUID().slice(0, 8), me = person(FIRM_A, `Own${k}`), old = person(FIRM_A, `Merged${k}`), fam = person(FIRM_A, `Family${k}`), there = person(FIRM_B, `Elsewhere${k}`);
      sql(`update fo_person set merged_into_id = '${me}', merged_at = now() where id = '${old}'`); void there;
      return { subject: { firmId: FIRM_A, personId: me, records: [me, old] }, marker: `Own${k}`, deletedMarker: null, mergedMarker: `Merged${k}`, familyMarker: `Family${k}`, otherFirmMarker: `Elsewhere${k}` };
    },
  }))) { try { await c.run(); ok(`PF-26 exporterCases front-office.person: ${c.name}`, true); } catch (e) { ok(`PF-26 exporterCases front-office.person: ${c.name}`, false, String((e as Error).message)); } }
} finally {
  await app?.close();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for the sweep */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
