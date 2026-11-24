// PF-21c (R1.86; map row 86; SA-11 §3.7, SA-11-14, SA-11-24, SA-11-25, SA-11-35, BR-11; SA7-D74 (b)): ExpatReady's breach
// register and the "Security incident notice" to affected firms. Each "Done when" line passes and fails:
// DW1 a firm key → 403 (and our Support and Admin; the Auditor reads only); DW2 a breach naming two firms sends one notice
// to each firm's active Owner and Admins and none to a third firm (nor to a case officer, a deactivated Admin or an ended
// grant); DW3 a notice can't be sent twice to one firm for one breach (also two at once); DW4 a notice row can't be
// changed or deleted, nor a breach deleted; DW5 an integrity alert pre-fills a draft breach and sends nothing (a draft or
// an undecided breach gets no notice); DW6 the record and notices are audited (events, one line on the firm's trail);
// DW7 firm walls: a firm's session reads and writes nothing in the register, and the definers refuse it; DW8 the
// migration measured right after itself on an empty and a demo-data copy, migrate diff empty.
// One process, scratch databases and a scratch file folder (removed at the end), fakeJobs (nothing leaves the machine),
// no model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf21c_breaches.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261123210000_pf21c_breaches";
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf21c_${process.pid}`, EMPTY = `xr_studio_pf21c_empty_${process.pid}`, DEMO = `xr_studio_pf21c_demo_${process.pid}`;
const WORK = join(STUDIO, "var", `pf21c-${process.pid}`);
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
const psqlFile = (db: string, f: string) => execFileSync(join(BIN, "psql"), [urlOf(db), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", f], { stdio: ["ignore", "ignore", "pipe"] });
const sqlOn = (db: string, q: string, user = "xr_studio") => execFileSync(join(BIN, "psql"), [urlOf(db, user), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string, user = "xr_studio") => sqlOn(DB, q, user);
const refusedBySql = (q: string, like: RegExp, user = "xr_studio") => { try { sql(q, user); return false; } catch (e) { return like.test(String((e as { stderr?: unknown }).stderr ?? e)); } };
/** As the app's role, in one transaction acting for `firm` (or none, our own staff's plane). */
const asApp = (firm: string | null, q: string) => sql(`begin; select set_config('app.firm_id', '${firm ?? ""}', true); ${q}; commit`, "xr_app").split("\n").filter((l) => l !== "" && l !== firm).join("\n");
const refusedAsApp = (firm: string | null, q: string, like: RegExp) => { try { asApp(firm, q); return false; } catch (e) { return like.test(String((e as { stderr?: unknown }).stderr ?? e)); } };

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };
const uuid = () => globalThis.crypto.randomUUID();

type Res = { status: number; body: any };
/** Creates carry an Idempotency-Key (break B4): a new one per call unless the test names it (`key`), or none (`key: null`). */
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown; key?: string | null } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "pf21c-check/1" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  const creates = method === "POST" && /\/api\/system\/register\/breaches(\/from-alert)?$/.test(path);
  if (creates && o.key !== null) headers["idempotency-key"] = o.key ?? `pf21c-${globalThis.crypto.randomUUID()}`;
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
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { LocalFiles } = await import("../api/src/front-office/files.ts");
const { ConsentStore } = await import("../api/src/platform/messages/consent/consent-store.ts");
const { localEmail } = await import("../api/src/platform/messages/channels/email/local.ts");
const { channelsOf } = await import("../api/src/platform/messages/send/channels.ts");
const { Messages } = await import("../api/src/platform/messages/send/messages.ts");
const { fakeAlerts } = await import("../ports/alert.ts");
const { FakeClock } = await import("../ports/clock.ts");
const { fakeJobs } = await import("../ports/jobs.ts");
const { BREACH_MESSAGES, BREACH_AUDIT, BREACH_MANAGE_KEY, BREACH_READ_KEY, Breaches } = await import("../api/src/platform/register/breaches/service.ts");
const feature = (await import("../api/src/features/platform-register-breaches.ts")).default;

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
wallUnscopedQueries();   // as the API server: a query outside every scope runs as xr_app with no firm (our staff's plane)
const pool = new WalledPool({ connectionString: appDatabaseUrl(urlOf(DB), {}), max: 8, options: "-c TimeZone=UTC" });
const walled = new PrismaClient({ adapter: new PrismaPg(pool) });
mkdirSync(WORK, { recursive: true });
const mclock = new FakeClock(new Date()), jobs = fakeJobs(mclock), files = new LocalFiles(join(WORK, "files"));
const messages = new Messages({ db: walled as never, consent: new ConsentStore(auditEvent, mclock), files, jobs, alerts: () => fakeAlerts(), channels: channelsOf([["EMAIL", localEmail]]), clock: mclock });

const newFirm = async (name: string) => { const k = `pf21c-${uuid().slice(0, 8)}`; return (await owner.$queryRaw<{ id: string }[]>`insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at)
  values (gen_random_uuid(), ${k}, ${name}, 'CA', ${`${k}@sample-firm.example`}, now()) returning id::text as id`)[0].id; };
/** A firm staff member with these roles (an ended grant when `ended`), ACTIVE unless `status` says otherwise. */
const staff = async (firm: string, who: string, roles: string[], o: { status?: string; ended?: boolean } = {}) => {
  const id = uuid(), email = `${who}.${id.slice(0, 6)}@sample-firm.example`;
  sql(`insert into platform_staff (id, firm_id, email, display_name, status, updated_at) values ('${id}', '${firm}', '${email}', 'Sample ${who}', '${o.status ?? "ACTIVE"}', now())`);
  for (const r of roles) sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by${o.ended ? ", ended_at, ended_by, end_reason" : ""}) values (gen_random_uuid(), '${firm}', '${id}', '${r}', 'seed:pf21c'${o.ended ? ", now(), 'seed:pf21c', 'Sample: ended'" : ""})`);
  return { id, email };
};
const outboxOf = (firm: string) => sql(`select coalesce(string_agg(address, ',' order by address), '') from msg_outbox where firm_id = '${firm}'`);
const outboxAll = () => Number(sql(`select count(*) from msg_outbox`));
const lines = (firm: string, action: string) => Number(sql(`select count(*) from audit_event where firm_id = '${firm}' and action = '${action}'`));

const apps: { close(): Promise<void> }[] = [];
try {
  // ------------------------------------------------------------------------------------------ the app (DW1-DW6)
  const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
  const firmLocal = new LocalIdentity("pf21c-firm-standin-key-0123456789abcdef", () => clock.now());
  const systemLocal = new SystemLocalIdentity("pf21c-system-standin-key-0123456789abc", () => clock.now());
  const providers = feature.providers.filter((p) => !(typeof p === "object" && "provide" in p && p.provide === BREACH_MESSAGES));
  @Module({ controllers: [PlatformIdentityController, SystemIdentityController, ...feature.controllers] as never[],
    providers: [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: firmLocal }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
      { provide: SYSTEM_IDENTITY_PORT, useValue: systemLocal }, SystemIdentity, SystemPlaneWall, SystemGuard, { provide: APP_GUARD, useExisting: SystemGuard },
      { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: BREACH_MESSAGES, useValue: messages }, ...providers] as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  app.use(requestMiddleware());
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  ok("PF-21c wiring: the feature gives the service its audit port (AuditPort) and its MessagePort token", app.get(BREACH_AUDIT) === auditEvent && app.get(Breaches) instanceof Breaches
    && feature.providers.some((p) => typeof p === "object" && "provide" in p && p.provide === BREACH_MESSAGES && "useExisting" in p));

  await seedSampleFirms(owner);
  const person = async (name: string, roles: string[]) => (await owner.platSystemStaff.create({ data: { email: `${name.toLowerCase()}.pf21c@expatready.example`, displayName: `Sample ${name}`, grants: { create: roles.map((roleCode) => ({ roleCode })) } } })).id;
  const OWNER = await person("Owner", ["platform-owner"]), SUPPORT = await person("Support", ["platform-support"]), ADMIN = await person("Admin", ["platform-admin"]), AUDITOR = await person("Auditor", ["platform-auditor"]);
  const tokenOf = async (id: string) => { const email = (await owner.platSystemStaff.findUniqueOrThrow({ where: { id } })).email; const r = await call(base, "POST", "/api/system/session/local", { body: { email, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const ownerT = await tokenOf(OWNER), supportT = await tokenOf(SUPPORT), adminT = await tokenOf(ADMIN), auditorT = await tokenOf(AUDITOR);
  const firmT = (await call(base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId: "user-R", secondStep: true } })).body.token as string;

  ok("PF-21c DW1 pass (SA7-D74 (b)): the migration gives system/breach:manage to the Platform Owner only, system/breach:read to the Platform Owner and the Auditor",
    sql(`select string_agg(role_code, ',' order by role_code) from plat_system_role_permission where permission_key = '${BREACH_MANAGE_KEY}'`) === "platform-owner"
    && sql(`select string_agg(role_code, ',' order by role_code) from plat_system_role_permission where permission_key = '${BREACH_READ_KEY}'`) === "platform-auditor,platform-owner");

  const firmA = await newFirm("Sample Breach Firm A"), firmB = await newFirm("Sample Breach Firm B"), firmC = await newFirm("Sample Breach Firm C");
  const aOwner = await staff(firmA, "owner", ["OWNER"]), aAdmin = await staff(firmA, "admin", ["ADMIN"]), aBoth = await staff(firmA, "both", ["OWNER", "ADMIN"]);
  const aOfficer = await staff(firmA, "officer", ["CASE_OFFICER"]), aGone = await staff(firmA, "gone", ["ADMIN"], { status: "DEACTIVATED" }), aEnded = await staff(firmA, "ended", ["ADMIN"], { ended: true });
  const bOwner = await staff(firmB, "owner", ["OWNER"]), cOwner = await staff(firmC, "owner", ["OWNER"]), cAdmin = await staff(firmC, "admin", ["ADMIN"]);
  const discoveredAt = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const body = { reason: "Sample: recording the incident", discoveredAt, description: "Sample: a storage bucket's files were readable by link for two hours.", affectedFirms: [firmA, firmB],
    dataCategories: ["identity_documents", "contact_details"], rootCause: "Sample: a wrong bucket policy", containment: "Sample: the policy was corrected and the links revoked." };

  // DW1: refusals
  const rowsBefore = Number(sql(`select count(*) from plat_breach`));
  const refusals = await Promise.all([firmT, supportT, adminT, auditorT].map((t) => call(base, "POST", "/api/system/register/breaches", { token: t, body })));
  const readRefusals = await Promise.all([firmT, supportT, adminT].map((t) => call(base, "GET", "/api/system/register/breaches", { token: t })));
  ok("PF-21c DW1 fail: a firm's staff token, our Support, Admin (SA7-D74 (b): Admin does not hold the key) and the Auditor → 403 on record; firm, Support and Admin → 403 on read; nothing recorded",
    refusals.every((r) => r.status === 403) && readRefusals.every((r) => r.status === 403) && refusals[0].body.code === "FIRM_SESSION_REFUSED"
    && Number(sql(`select count(*) from plat_breach`)) === rowsBefore, { refusals: refusals.map((r) => [r.status, r.body.code]), readRefusals: readRefusals.map((r) => r.status) });
  const anon = await call(base, "GET", "/api/system/register/breaches");
  ok("PF-21c DW1 fail: no token → 401", anon.status === 401, anon);
  const noReason = await call(base, "POST", "/api/system/register/breaches", { token: ownerT, body: { ...body, reason: undefined } });
  const badCat = await call(base, "POST", "/api/system/register/breaches", { token: ownerT, body: { ...body, dataCategories: ["everything"] } });
  const future = await call(base, "POST", "/api/system/register/breaches", { token: ownerT, body: { ...body, discoveredAt: new Date(Date.now() + 86_400_000).toISOString() } });
  const noFirm = await call(base, "POST", "/api/system/register/breaches", { token: ownerT, body: { ...body, affectedFirms: [uuid()] } });
  const extra = await call(base, "POST", "/api/system/register/breaches", { token: ownerT, body: { ...body, status: "RECORDED" } });
  ok("PF-21c DW1 fail: the Platform Owner without a reason (400), with an unknown category, a future discovery or an unknown field (422 each), or an unknown firm (404) records nothing",
    noReason.status === 400 && badCat.status === 422 && future.status === 422 && extra.status === 422 && noFirm.status === 404 && noFirm.body.code === "FIRM_NOT_FOUND"
    && Number(sql(`select count(*) from plat_breach`)) === rowsBefore, [noReason.status, badCat.status, future.status, extra.status, noFirm.status]);

  // Record a breach
  const opened = await call(base, "POST", "/api/system/register/breaches", { token: ownerT, body });
  const id = opened.body.id as string;
  ok("PF-21c DW2 pass (SA-11-24): the Platform Owner records a breach → 201, RECORDED, every SA-11-24 field kept, decision UNDECIDED, opened by staff:<id>",
    opened.status === 201 && opened.body.status === "RECORDED" && opened.body.source === "MANUAL" && opened.body.description === body.description && opened.body.discoveredAt === new Date(discoveredAt).toISOString()
    && JSON.stringify(opened.body.affectedFirms) === JSON.stringify([firmA, firmB]) && opened.body.scope === "KNOWN" && JSON.stringify(opened.body.dataCategories) === JSON.stringify(body.dataCategories)
    && opened.body.rootCause === body.rootCause && opened.body.containment === body.containment && opened.body.decision === "UNDECIDED" && opened.body.openedBy === `staff:${OWNER}` && opened.body.notices.length === 0, opened);
  ok("PF-21c Lead read fail (SA-11-24, BR-11: a decision names why): plat_breach_change deciding \"notify firms\" with no decision_reason is refused by plat_breach_decision_whole",
    refusedBySql(`select plat_breach_change('${id}', '{"decision":"NOTIFY_FIRMS"}', 'staff:${OWNER}')`, /plat_breach_decision_whole/) && sql(`select decision from plat_breach where id = '${id}'`) === "UNDECIDED");
  ok("PF-21c Lead read fail (SA-11-24, BR-11: a decision names who): a direct update deciding \"notify firms\" with decided_by null is refused by plat_breach_decision_whole",
    refusedBySql(`update plat_breach set decision = 'NOTIFY_FIRMS', decision_reason = 'Sample: who is missing', decided_by = null where id = '${id}'`, /plat_breach_decision_whole/) && sql(`select decision from plat_breach where id = '${id}'`) === "UNDECIDED");
  const audList = await call(base, "GET", "/api/system/register/breaches", { token: auditorT });
  const audOne = await call(base, "GET", `/api/system/register/breaches/${id}`, { token: auditorT });
  ok("PF-21c DW1 pass: the Auditor reads the register and the breach (200, read-only)", audList.status === 200 && audList.body.breaches.some((b: { id: string }) => b.id === id) && audOne.status === 200 && audOne.body.id === id, { audList: audList.status, audOne: audOne.status });
  const audChange = await call(base, "PATCH", `/api/system/register/breaches/${id}`, { token: auditorT, body: { reason: "Sample: auditor", description: "changed" } });
  const audNotify = await call(base, "POST", `/api/system/register/breaches/${id}/notices`, { token: auditorT, body: { reason: "Sample: auditor", firmId: firmA } });
  ok("PF-21c DW1 fail: the Auditor changing a breach or sending a notice → 403, nothing changed", audChange.status === 403 && audNotify.status === 403 && sql(`select description from plat_breach where id = '${id}'`) === body.description, [audChange.status, audNotify.status]);

  // DW5: undecided → no notice
  const outbox0 = outboxAll();
  const undecided = await call(base, "POST", `/api/system/register/breaches/${id}/notices`, { token: ownerT, body: { reason: "Sample: too early", firmId: firmA } });
  ok("PF-21c DW5 fail (BR-11): before the decision to notify is recorded, a notice → 409 NOT_DECIDED_TO_NOTIFY, nothing written", undecided.status === 409 && undecided.body.code === "NOT_DECIDED_TO_NOTIFY" && outboxAll() === outbox0, undecided);
  const noWhy = await call(base, "PATCH", `/api/system/register/breaches/${id}`, { token: ownerT, body: { reason: "Sample: decide", decision: "NOTIFY_FIRMS" } });
  ok("PF-21c DW2 fail: a decision without its why → 422", noWhy.status === 422 && noWhy.body.code === "BREACH_FIELDS", noWhy);
  const decided = await call(base, "PATCH", `/api/system/register/breaches/${id}`, { token: ownerT, body: { reason: "Sample: decide", decision: "NOTIFY_FIRMS", decisionReason: "Sample: identity documents may have been seen." } });
  ok("PF-21c DW2 pass: the decision to notify names who, when and why", decided.status === 200 && decided.body.decision === "NOTIFY_FIRMS" && decided.body.decidedBy === `staff:${OWNER}` && decided.body.decidedAt !== null && /identity documents/.test(decided.body.decisionReason), decided);

  // DW2: notify A and B, not C
  const a1 = await call(base, "POST", `/api/system/register/breaches/${id}/notices`, { token: ownerT, body: { reason: "Sample: notify A", firmId: firmA } });
  const b1 = await call(base, "POST", `/api/system/register/breaches/${id}/notices`, { token: ownerT, body: { reason: "Sample: notify B", firmId: firmB } });
  const c1 = await call(base, "POST", `/api/system/register/breaches/${id}/notices`, { token: ownerT, body: { reason: "Sample: notify C", firmId: firmC } });
  const wantA = [aOwner.email, aAdmin.email, aBoth.email].sort().join(",");
  ok("PF-21c DW2 pass (SA-11-25): firm A's notice → 201 and goes to its active Owner and Admins only, once each (an Owner who is also an Admin once), never a case officer, a deactivated Admin or an ended grant",
    a1.status === 201 && outboxOf(firmA) === wantA && a1.body.recipients.length === 3 && !outboxOf(firmA).includes(aOfficer.email) && !outboxOf(firmA).includes(aGone.email) && !outboxOf(firmA).includes(aEnded.email)
    && a1.body.recipients.every((r: { state: string; outboxId: string }) => r.state === "QUEUED" && r.outboxId), { a1: a1.body, outbox: outboxOf(firmA) });
  ok("PF-21c DW2 pass: firm B's notice → 201 to its Owner only", b1.status === 201 && outboxOf(firmB) === bOwner.email && b1.body.recipients.length === 1, b1);
  ok("PF-21c DW2 fail: a third firm the breach does not name → 422, and nothing is sent to it", c1.status === 422 && outboxOf(firmC) === "" && !outboxOf(firmC).includes(cOwner.email) && !outboxOf(firmC).includes(cAdmin.email), c1);
  const tpl = sql(`select v.id from msg_template_version v join msg_template t on t.id = v.template_id where t.key = 'platform.security_incident_notice' and t.firm_id is null`);
  const stored = (await messages.readStored(firmA, a1.body.recipients[0].outboxId, "TRANSACTIONAL"))!;   // PF-19e: sealed on store
  ok("PF-21c DW2 pass: each notice records channel, recipients (staff ids and roles, never an address), template version and sender on the breach; the email is the Security incident notice filled for the firm",
    a1.body.channel === "EMAIL" && a1.body.templateVersionId === tpl && a1.body.sentBy === `staff:${OWNER}` && !JSON.stringify(a1.body.recipients).includes("@")
    && /Security incident notice/.test(stored.subject) && stored.text.includes("Sample Breach Firm A") && stored.text.includes(body.description) && stored.text.includes("identity documents, contact details") && stored.text.includes(id), { a1: a1.body, subject: stored.subject });
  const sendJobs = jobs.jobs.filter((j) => j.name === "messages.send");
  ok("PF-21c DW2 pass: after the commit the send worker is queued for the notices, each in its own firm (A and B)",
    sendJobs.some((j) => j.firmId === firmA) && sendJobs.some((j) => j.firmId === firmB) && !sendJobs.some((j) => j.firmId === firmC), jobs.jobs.map((j) => [j.name, j.firmId]));

  // DW3: twice
  const outboxA = outboxOf(firmA);
  const a2 = await call(base, "POST", `/api/system/register/breaches/${id}/notices`, { token: ownerT, body: { reason: "Sample: again", firmId: firmA } });
  ok("PF-21c DW3 fail: a second notice to firm A for this breach → 409 ALREADY_NOTIFIED, no new message, still one notice row", a2.status === 409 && a2.body.code === "ALREADY_NOTIFIED" && outboxOf(firmA) === outboxA
    && sql(`select count(*) from plat_breach_notice where breach_id = '${id}' and firm_id = '${firmA}'`) === "1", a2);
  // Two at once on a fresh breach and firm
  const firmD = await newFirm("Sample Breach Firm D"); const dOwner = await staff(firmD, "owner", ["OWNER"]);
  const twin = await call(base, "POST", "/api/system/register/breaches", { token: ownerT, body: { ...body, affectedFirms: [firmD] } });
  await call(base, "PATCH", `/api/system/register/breaches/${twin.body.id}`, { token: ownerT, body: { reason: "Sample", decision: "NOTIFY_FIRMS", decisionReason: "Sample: tell them" } });
  const [t1, t2] = await Promise.all([1, 2].map((n) => call(base, "POST", `/api/system/register/breaches/${twin.body.id}/notices`, { token: ownerT, body: { reason: `Sample: race ${n}`, firmId: firmD } })));
  ok("PF-21c DW3 pass/fail (breaker: two sends at once): one → 201, the other → 409; one notice row, one email",
    JSON.stringify([t1.status, t2.status].sort()) === "[201,409]" && sql(`select count(*) from plat_breach_notice where breach_id = '${twin.body.id}'`) === "1" && outboxOf(firmD) === dOwner.email, [t1.status, t2.status, outboxOf(firmD)]);

  // Review M1: a change in flight (not yet committed) that withdraws the firm and the decision; a notice sent meanwhile
  // waits for it, then finds the firm no longer named, and records and sends nothing.
  const firmE = await newFirm("Sample Breach Firm E"); await staff(firmE, "owner", ["OWNER"]);
  const race = await call(base, "POST", "/api/system/register/breaches", { token: ownerT, body: { ...body, affectedFirms: [firmE] } });
  await call(base, "PATCH", `/api/system/register/breaches/${race.body.id}`, { token: ownerT, body: { reason: "Sample", decision: "NOTIFY_FIRMS", decisionReason: "Sample: tell them" } });
  let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
  let changeStarted!: () => void; const started = new Promise<void>((r) => { changeStarted = r; });
  const changing = owner.$transaction(async (tx) => {
    await tx.$queryRaw`select plat_breach_change(${race.body.id}::uuid, ${JSON.stringify({ affected_firms: [], decision: "NO_NOTICE", decision_reason: "Sample: not affected after all" })}::jsonb, ${`staff:${OWNER}`})`;
    changeStarted(); await gate;
  }, { timeout: 30_000 });
  await started;
  const sending = call(base, "POST", `/api/system/register/breaches/${race.body.id}/notices`, { token: ownerT, body: { reason: "Sample: during a change", firmId: firmE } });
  let waitedOnChange = true; sending.then(() => { waitedOnChange = false; }, () => { waitedOnChange = false; });
  await new Promise((r) => setTimeout(r, 400));
  const blocked = waitedOnChange;
  release(); await changing;
  const raced = await sending;
  ok("PF-21c review M1 pass/fail: a notice sent while a change withdrawing the firm and the decision is in flight waits for it, then is refused; no notice row, no message, and the record stays consistent",
    blocked && raced.status >= 400 && raced.status < 500 && sql(`select count(*) from plat_breach_notice where breach_id = '${race.body.id}'`) === "0" && outboxOf(firmE) === ""
    && sql(`select decision || ':' || cardinality(affected_firms) from plat_breach where id = '${race.body.id}'`) === "NO_NOTICE:0", { blocked, raced: [raced.status, raced.body.code] });

  // Break B4 (STANDARDS §4): idempotent creates.
  const k4 = `pf21c-b4-${uuid()}`, before4 = Number(sql(`select count(*) from plat_breach`));
  const first4 = await call(base, "POST", "/api/system/register/breaches", { token: ownerT, body, key: k4 });
  const again4 = await call(base, "POST", "/api/system/register/breaches", { token: ownerT, body, key: k4 });
  const other4 = await call(base, "POST", "/api/system/register/breaches", { token: ownerT, body: { ...body, description: "Sample: another breach" }, key: k4 });
  const none4 = await call(base, "POST", "/api/system/register/breaches", { token: ownerT, body, key: null });
  const ka = `pf21c-alert-${uuid()}`, alertBody = { reason: "Sample: from the alarm", alert: { kind: "audit_write_failed", detail: { rule: "BR-5" }, raisedAt: new Date(Date.now() - 60_000).toISOString() } };
  const three = await Promise.all([1, 2, 3].map(() => call(base, "POST", "/api/system/register/breaches/from-alert", { token: ownerT, body: alertBody, key: ka })));
  ok("PF-21c break B4 pass/fail: the same Idempotency-Key and body answers the first breach (201 then 200, one row); three drafts at once with one key make one; another body with the key → 422 IDEMPOTENCY_KEY_REUSED; no key → 400",
    first4.status === 201 && again4.status === 200 && again4.body.id === first4.body.id && other4.status === 422 && other4.body.code === "IDEMPOTENCY_KEY_REUSED" && none4.status === 400
    && new Set(three.map((r) => r.body.id)).size === 1 && three.filter((r) => r.status === 201).length === 1 && three.filter((r) => r.status === 200).length === 2
    && Number(sql(`select count(*) from plat_breach`)) === before4 + 2 && !("requestKey" in first4.body) && !("repeated" in again4.body), { first4: first4.status, again4: again4.status, other4: other4.body.code, none4: none4.status, three: three.map((r) => r.status) });

  // Break B2: every address suppressed → not recorded as sent; once the address works, the notice goes.
  const firmS = await newFirm("Sample Breach Firm S"); const sOwner = await staff(firmS, "owner", ["OWNER"]);
  sql(`insert into msg_firm (firm_id) values ('${firmS}') on conflict do nothing; insert into msg_suppression (id, firm_id, channel, address, reason, created_by) values (gen_random_uuid(), '${firmS}', 'EMAIL', '${sOwner.email}', 'HARD_BOUNCE', 'seed:pf21c')`);
  const sb = await call(base, "POST", "/api/system/register/breaches", { token: ownerT, body: { ...body, affectedFirms: [firmS] } });
  await call(base, "PATCH", `/api/system/register/breaches/${sb.body.id}`, { token: ownerT, body: { reason: "Sample", decision: "NOTIFY_FIRMS", decisionReason: "Sample: tell them" } });
  const suppressed = await call(base, "POST", `/api/system/register/breaches/${sb.body.id}/notices`, { token: ownerT, body: { reason: "Sample: bounced", firmId: firmS } });
  const noRow = sql(`select count(*) from plat_breach_notice where breach_id = '${sb.body.id}'`) === "0" && sql(`select count(*) from msg_outbox where firm_id = '${firmS}'`) === "0" && lines(firmS, "platform.breach.notice_sent") === 0;
  sql(`alter table msg_suppression disable trigger user; delete from msg_suppression where firm_id = '${firmS}'; alter table msg_suppression enable trigger user`);
  const lifted = await call(base, "POST", `/api/system/register/breaches/${sb.body.id}/notices`, { token: ownerT, body: { reason: "Sample: address fixed", firmId: firmS } });
  ok("PF-21c break B2 pass/fail: a notice whose every address is suppressed → 409 NOT_DELIVERABLE with no notice, message or trail line; once the address works it is sent (201)",
    suppressed.status === 409 && suppressed.body.code === "NOT_DELIVERABLE" && noRow && lifted.status === 201 && lifted.body.recipients[0].state === "QUEUED", { suppressed: suppressed.body, lifted: lifted.status });

  // Break B5, B6: the decision's reason after notices; text that shows nothing or carries half a character.
  const rewrite = await call(base, "PATCH", `/api/system/register/breaches/${id}`, { token: ownerT, body: { reason: "Sample", decision: "NOTIFY_FIRMS", decisionReason: "Sample: a different reason after the fact" } });
  ok("PF-21c break B5 fail: once notices went, the decision's reason (and who decided) can't be rewritten → 409 DECISION_KEPT", rewrite.status === 409 && rewrite.body.code === "DECISION_KEPT"
    && /identity documents/.test(sql(`select decision_reason from plat_breach where id = '${id}'`)), rewrite.body);
  const zw = await call(base, "POST", "/api/system/register/breaches", { token: ownerT, body: { ...body, description: "\u200b\u200b\u2060" } });
  const lone = await call(base, "POST", "/api/system/register/breaches", { token: ownerT, body: { ...body, description: "Sample \ud800 half" } });
  ok("PF-21c break B6 fail: a description of zero-width characters only, and one with a lone surrogate → 422 each", zw.status === 422 && lone.status === 422, [zw.status, lone.status]);

  // DW4: insert-only and kept
  const noticeId = a1.body.id as string;
  ok("PF-21c DW4 fail: a notice row can't be changed or deleted, nor the notices table truncated (even by the owner)",
    refusedBySql(`update plat_breach_notice set recipients = '[]' where id = '${noticeId}'`, /kept as written/) && refusedBySql(`delete from plat_breach_notice where id = '${noticeId}'`, /kept as written/)
    && refusedBySql(`truncate plat_breach_notice cascade`, /kept as written/) && sql(`select count(*) from plat_breach_notice where id = '${noticeId}'`) === "1");
  ok("PF-21c DW4 fail (SA-11-14: kept 7 years): a breach can't be deleted or truncated; an event can't be changed",
    refusedBySql(`delete from plat_breach where id = '${id}'`, /kept as written/) && refusedBySql(`truncate plat_breach cascade`, /kept as written/)
    && refusedBySql(`update plat_breach_event set actor = 'staff:x' where breach_id = '${id}'`, /kept as written/) && sql(`select count(*) from plat_breach where id = '${id}'`) === "1");
  ok("PF-21c DW4 fail: the discovery time and opener never change; a notice needs a decided, recorded breach naming the firm (the database, whatever the code does)",
    refusedBySql(`update plat_breach set discovered_at = now() - interval '9 days' where id = '${id}'`, /never change/)
    && refusedBySql(`insert into plat_breach_notice (id, breach_id, firm_id, recipients, template_version_id, sent_by) values (gen_random_uuid(), '${id}', '${firmC}', '[{"staffId":"x"}]', '${tpl}', 'staff:${OWNER}')`, /names this firm/));
  const drop = await call(base, "PATCH", `/api/system/register/breaches/${id}`, { token: ownerT, body: { reason: "Sample: narrow", affectedFirms: [firmB] } });
  const undo = await call(base, "PATCH", `/api/system/register/breaches/${id}`, { token: ownerT, body: { reason: "Sample: undo", decision: "NO_NOTICE", decisionReason: "Sample: changed my mind" } });
  ok("PF-21c DW4 fail: a notified firm can't be removed from the affected firms, and the decision can't leave \"notify firms\" once notices went (409 each)",
    drop.status === 409 && drop.body.code === "NOTIFIED_FIRM_KEPT" && undo.status === 409 && undo.body.code === "DECISION_KEPT", [drop.body, undo.body]);

  // DW5: from an alert
  const outbox1 = outboxAll(), drafts0 = Number(sql(`select count(*) from plat_breach where status = 'DRAFT'`));
  const alert = { kind: "audit_chain_break", detail: { rule: "BR-2", firmId: firmC, entity: "audit_event", entityKey: uuid() }, raisedAt: new Date(Date.now() - 600_000).toISOString() };
  const draft = await call(base, "POST", "/api/system/register/breaches/from-alert", { token: ownerT, body: { reason: "Sample: from the alarm", alert } });
  ok("PF-21c DW5 pass: an integrity alert pre-fills a DRAFT (source ALERT, the alert kept, the firm it names, discovered at the alert's time), and sends nothing",
    draft.status === 201 && draft.body.status === "DRAFT" && draft.body.source === "ALERT" && draft.body.sourceAlert.kind === "audit_chain_break" && JSON.stringify(draft.body.affectedFirms) === JSON.stringify([firmC])
    && draft.body.discoveredAt === alert.raisedAt && /nothing has been sent/.test(draft.body.description) && !draft.body.description.includes(alert.detail.entityKey) && outboxAll() === outbox1 && Number(sql(`select count(*) from plat_breach where status = 'DRAFT'`)) === drafts0 + 1, draft);
  const notIntegrity = await call(base, "POST", "/api/system/register/breaches/from-alert", { token: ownerT, body: { reason: "Sample", alert: { ...alert, kind: "job_stuck" } } });
  const personal = await call(base, "POST", "/api/system/register/breaches/from-alert", { token: ownerT, body: { reason: "Sample", alert: { ...alert, detail: { rule: "BR-2", entity: "jane@example.com" } } } });
  const ghost = await call(base, "POST", "/api/system/register/breaches/from-alert", { token: ownerT, body: { reason: "Sample", alert: { ...alert, detail: { rule: "BR-5", firmId: uuid() } } } });
  ok("PF-21c DW5 fail: a non-integrity alert and an alert carrying personal data → 422; an alert naming no known firm still opens a draft, scope under investigation (BR-11)",
    notIntegrity.status === 422 && personal.status === 422 && ghost.status === 201 && ghost.body.scope === "UNDER_INVESTIGATION" && ghost.body.affectedFirms.length === 0, [notIntegrity.status, personal.status, ghost.body]);
  await call(base, "PATCH", `/api/system/register/breaches/${draft.body.id}`, { token: ownerT, body: { reason: "Sample", decision: "NOTIFY_FIRMS", decisionReason: "Sample: decided early" } });
  const draftNotice = await call(base, "POST", `/api/system/register/breaches/${draft.body.id}/notices`, { token: ownerT, body: { reason: "Sample: too early", firmId: firmC } });
  ok("PF-21c DW5 fail: a draft gets no notice even with a decision (409 BREACH_DRAFT), nothing sent to firm C", draftNotice.status === 409 && draftNotice.body.code === "BREACH_DRAFT" && outboxOf(firmC) === "", draftNotice);
  const confirm = await call(base, "PATCH", `/api/system/register/breaches/${draft.body.id}`, { token: ownerT, body: { reason: "Sample: confirmed", status: "RECORDED", description: "Sample: the chain broke at one line; checked and confirmed." } });
  const back = await call(base, "PATCH", `/api/system/register/breaches/${draft.body.id}`, { token: ownerT, body: { reason: "Sample", status: "DRAFT" } });
  const ghostConfirm = await call(base, "PATCH", `/api/system/register/breaches/${ghost.body.id}`, { token: ownerT, body: { reason: "Sample", status: "RECORDED" } });
  ok("PF-21c review m2 fail: confirming a draft without the description firms will read → 422 naming description; it stays a draft",
    ghostConfirm.status === 422 && Object.hasOwn(ghostConfirm.body.fields ?? {}, "description") && sql(`select status from plat_breach where id = '${ghost.body.id}'`) === "DRAFT", ghostConfirm.body);
  ok("PF-21c DW5 pass: our staff confirm the draft (RECORDED, its event says RECORDED); it never goes back to draft (422)",
    confirm.status === 200 && confirm.body.status === "RECORDED" && back.status === 422, [confirm.body.status, back.status]);

  // DW6: audited
  const one = await call(base, "GET", `/api/system/register/breaches/${id}`, { token: ownerT });
  const kinds = (one.body.events as { kind: string }[]).map((e) => e.kind).join(",");
  const changeEv = (one.body.events as { kind: string; detail: any }[]).find((e) => e.kind === "CHANGED");
  ok("PF-21c DW6 pass: the breach's events read RECORDED, CHANGED (the decision, before and after), NOTICE_SENT for A and B; each names our staff member",
    one.status === 200 && kinds === "RECORDED,CHANGED,NOTICE_SENT,NOTICE_SENT" && changeEv?.detail.before.decision === "UNDECIDED" && changeEv?.detail.after.decision === "NOTIFY_FIRMS"
    && (one.body.events as { actor: string }[]).every((e) => e.actor === `staff:${OWNER}`) && one.body.notices.length === 2, { kinds, changeEv });
  const ev = JSON.parse(sql(`select row_to_json(a) from (select actor, actor_type, entity_key, detail, summary from audit_event where firm_id = '${firmA}' and action = 'platform.breach.notice_sent') a`));
  ok("PF-21c DW6 pass: firm A's own trail has exactly one notice line, naming the notice and our staff member by their own word (AUD-3a: ourstaff:<id>, OUR_STAFF, as PF-21b's holds); firm C's has none; no firm line for the record itself",
    lines(firmA, "platform.breach.notice_sent") === 1 && lines(firmB, "platform.breach.notice_sent") === 1 && lines(firmC, "platform.breach.notice_sent") === 0
    && ev.entity_key === noticeId && ev.actor === `ourstaff:${OWNER}` && ev.actor_type === "OUR_STAFF" && ev.detail.staffId === OWNER && ev.detail.breachId_after === id
    && Number(sql(`select count(*) from audit_event where action like 'platform.breach.%' and action <> 'platform.breach.notice_sent'`)) === 0, ev);
  ok("PF-21c DW6 pass: every register call by our staff has its line in plat_system_audit (PF-4s's guard), with the reason",
    Number(sql(`select count(*) from plat_system_audit where route like '/api/system/register/breaches%' and outcome = 'ALLOWED' and staff_id = '${OWNER}'`)) >= 10
    && sql(`select reason from plat_system_audit where route = '/api/system/register/breaches/:id/notices' and outcome = 'ALLOWED' order by at limit 1`) === "Sample: too early");

  // DW7: firm walls
  ok("PF-21c DW7 fail (firm walls): as xr_app in firm A's session or with no firm, the three tables read nothing; a direct insert is refused",
    ["plat_breach", "plat_breach_event", "plat_breach_notice"].every((t) => asApp(firmA, `select count(*) from ${t}`) === "0" && asApp(null, `select count(*) from ${t}`) === "0")
    && refusedAsApp(firmA, `insert into plat_breach (id, status, source, discovered_at, description, opened_by) values (gen_random_uuid(), 'RECORDED', 'MANUAL', now(), 'x', 'staff:x')`, /row-level security|permission denied/));
  ok("PF-21c DW7 fail (firm walls): inside a firm's session the register's definers (open, change, list, events) are refused by the database",
    refusedAsApp(firmA, `select plat_breach_list(null, 10)`, /only ExpatReady's own staff/)
    && refusedAsApp(firmA, `select plat_breach_open('RECORDED', 'MANUAL', null, now(), 'x', '{}', '{}', null, null, null, 'staff:x', null, null)`, /only ExpatReady's own staff/)
    && refusedAsApp(firmA, `select plat_breach_change('${id}', '{"description":"x"}', 'staff:x')`, /only ExpatReady's own staff/)
    && refusedAsApp(firmA, `select * from plat_breach_events('${id}')`, /only ExpatReady's own staff/));
  ok("PF-21c DW7 fail (firm walls): the notice definers run only in the named firm's own session (firm B's session for firm A, and no firm, refused); a firm-named sender is refused",
    refusedAsApp(firmB, `select plat_breach_notice_ready('${id}', '${firmA}')`, /only in the notified firm's own session/)
    && refusedAsApp(null, `select plat_breach_notice_ready('${id}', '${firmA}')`, /only in the notified firm's own session/)
    && refusedAsApp(firmC, `select * from plat_breach_notice_record('${id}', '${firmC}', '[{"staffId":"x"}]', '${tpl}', 'staff:${uuid()}')`, /ExpatReady's own staff/));
  ok("PF-21c review m3 fail: a firm's own session can't record a notice that was never sent (recipients without this notice's outbox rows are refused), even naming a real staff member of ours",
    refusedAsApp(firmC, `select * from plat_breach_notice_record('${draft.body.id}', '${firmC}', '[{"staffId":"${cOwner.id}","outboxId":"${uuid()}"}]', '${tpl}', 'staff:${OWNER}')`, /this notice's message in the outbox/)
    && sql(`select count(*) from plat_breach_notice where firm_id = '${firmC}'`) === "0");
  ok("PF-21c break B3 fail: in a firm's own session a notice naming the Auditor (no manage key) as sender, or a template that is not the Security incident notice, is refused",
    refusedAsApp(firmC, `select * from plat_breach_notice_record('${draft.body.id}', '${firmC}', '[{"staffId":"${cOwner.id}","outboxId":"${uuid()}"}]', '${tpl}', 'staff:${AUDITOR}')`, /manages the breach register/)
    && refusedAsApp(firmC, `select * from plat_breach_notice_record('${draft.body.id}', '${firmC}', '[{"staffId":"${cOwner.id}","outboxId":"${uuid()}"}]', '${uuid()}', 'staff:${OWNER}')`, /published version of the Security incident notice/));
  const firmTry = await Promise.all(["/api/platform/breaches", "/api/platform/register/breaches", "/api/front-office/breaches"].map((p) => call(base, "GET", p, { token: firmT })));
  const srcFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? srcFiles(join(dir, e.name)) : /\.ts$/.test(e.name) ? [join(dir, e.name)] : []);
  const controllers = srcFiles(join(STUDIO, "api", "src")).flatMap((f) => [...readFileSync(f, "utf8").matchAll(/@Controller\(\s*"([^"]*)"/g)].map((m) => m[1]));
  ok("PF-21c DW7 pass/fail (SA-11-35): no firm route answers for breaches (404); the only controller naming breaches is under /api/system",
    firmTry.every((r) => r.status === 404) && controllers.filter((p) => /breach/i.test(p)).join() === "api/system/register/breaches", { firmTry: firmTry.map((r) => r.status), controllers: controllers.filter((p) => /breach/i.test(p)) });
  const viaService = await withFirm(firmA, () => app.get(Breaches).list({ staffId: OWNER, keys: [BREACH_READ_KEY] }, {})).then(() => "answered", (e) => String(e));
  ok("PF-21c DW7 fail: even the service, called inside a firm's scope with the key, is refused by the database", /only ExpatReady's own staff/.test(viaService), viaService);

  // ------------------------------------------------------ DW8: the migration, right after itself
  const before = all.filter((d) => d < NEW);
  ok(`PF-21c DW8: the migration has its own stamp, later than every one before it and unique (P-600; newest before: ${before.at(-1)})`, all.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && before.length === all.indexOf(NEW));
  for (const d of before) psqlFile(EMPTY, join(MIG, d, "migration.sql"));
  for (const d of before) psqlFile(DEMO, join(MIG, d, "migration.sql"));
  const demo = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DEMO), options: "-c TimeZone=UTC" }) });
  try { await seedSampleFirms(demo); } finally { await demo.$disconnect(); }
  const firmsBefore = sqlOn(DEMO, `select count(*) from platform_firm`);
  psqlFile(EMPTY, join(MIG, NEW, "migration.sql")); psqlFile(DEMO, join(MIG, NEW, "migration.sql"));
  const shape = (d: string) => sqlOn(d, `select count(*) from pg_class c where c.relname in ('plat_breach', 'plat_breach_event', 'plat_breach_notice') and c.relrowsecurity and c.relforcerowsecurity and not exists (select 1 from pg_policy p where p.polrelid = c.oid)`)
    + "|" + sqlOn(d, `select string_agg(role_code || ':' || permission_key, ',' order by role_code, permission_key) from plat_system_role_permission where permission_key like 'system/breach:%'`)
    + "|" + sqlOn(d, `select count(*) from pg_proc p where p.proname like 'plat_breach%' and p.prosecdef and pg_get_userbyid(p.proowner) = 'xr_wall_reader'`)
    + "|" + sqlOn(d, `select count(*) from msg_template_version v join msg_template t on t.id = v.template_id where t.key = 'platform.security_incident_notice' and t.firm_id is null and v.version = 1`);
  const want = "3|platform-auditor:system/breach:read,platform-owner:system/breach:manage,platform-owner:system/breach:read|6|1";
  ok("PF-21c DW8 pass: right after its own migration, on an empty copy and on a demo-data copy: the three tables forced with no policy, the keys as SA7-D74 (b), the six definers xr_wall_reader's, one Sample template; demo firms untouched",
    shape(EMPTY) === want && shape(DEMO) === want && sqlOn(DEMO, `select count(*) from platform_firm`) === firmsBefore, { empty: shape(EMPTY), demo: shape(DEMO) });
  ok("PF-21c DW8: every function the migration creates carries the prefix plat_breach",
    [...readFileSync(join(MIG, NEW, "migration.sql"), "utf8").replace(/^\s*--.*$/gm, "").matchAll(/CREATE (?:OR REPLACE )?FUNCTION (\w+)/g)].every((m) => m[1].startsWith("plat_breach")));
  const later = all.filter((d) => d > NEW);
  for (const d of later) psqlFile(EMPTY, join(MIG, d, "migration.sql"));
  const cfg = join(WORK, "prisma.config.ts");
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(EMPTY))} } });\n`);
  const diff = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
  ok(`PF-21c DW8 pass: prisma migrate diff between the fully migrated database (this migration, then the ${later.length} after it) and the schema is empty`, diff.status === 0, `${diff.stdout}${diff.stderr}`.slice(0, 1200));
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
