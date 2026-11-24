// PF-21rs R0 (R1.86, R1.85; QA-757; concept screens/PF-21rs/concept.md r2 §6, challenge M1 and M2; Lead 29 on #3492): what
// our console's Privacy pages need from the three registers' reads, before the pages are built. Each line passes and fails:
// R0-1 (QA-757) a breach's notices carry the words sent (subject and text only), read from the stored message through the
//      messages module's port (MessageWordsPort), never re-rendered from today's record; a stored file that is missing or
//      no longer matches its hash gives no words and says so; nothing else of the stored message (address, html) leaves it.
// R0-2 the port answers only inside the firm the message belongs to: another firm's message id gives nothing.
// R0-3 firm and staff names: breaches (list and one) name each affected firm and each staff actor; holds and requests name
//      their firm and their staff actors; the names are read with one firm-less line per call, never a line on each firm's
//      trail; a firm's token still gets 403 and the Auditor reads names too.
// One process, a scratch database and file folder (removed at the end), fakeJobs (nothing leaves the machine), no model
// call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf21rs_r0.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf21rs_r0_${process.pid}`, WORK = join(STUDIO, "var", `pf21rs-r0-${process.pid}`);
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };
const uuid = () => globalThis.crypto.randomUUID();
type Res = { status: number; body: any };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "pf21rs-r0-check/1" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (method === "POST" && /\/api\/system\/register\/breaches$/.test(path)) headers["idempotency-key"] = `pf21rs-r0-${uuid()}`;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text();
  let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of Object.keys(process.env)) if (/^PLATFORM_/.test(k)) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { appDatabaseUrl, wallUnscopedQueries, WalledPool } = await import("../api/src/platform/firm-scope.ts");
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
const { Messages, fileKeyOf } = await import("../api/src/platform/messages/send/messages.ts");
const { fakeAlerts } = await import("../ports/alert.ts");
const { FakeClock } = await import("../ports/clock.ts");
const { fakeJobs } = await import("../ports/jobs.ts");
const { BREACH_MESSAGES, BREACH_WORDS } = await import("../api/src/platform/register/breaches/service.ts") as Record<string, unknown> & typeof import("../api/src/platform/register/breaches/service.ts");
const breaches = (await import("../api/src/features/platform-register-breaches.ts")).default;
const holds = (await import("../api/src/features/platform-register-holds.ts")).default;
const requests = (await import("../api/src/features/platform-register-requests.ts")).default;
const { DATA_REQUEST_DAILY } = await import("../api/src/features/platform-register-requests.ts");
const { DATA_REQUEST_ALERTS } = await import("../api/src/platform/register/requests/service.ts");
const { MESSAGE_PORT } = await import("../api/src/features/platform-messages.ts");

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
wallUnscopedQueries();
const pool = new WalledPool({ connectionString: appDatabaseUrl(urlOf(DB), {}), max: 8, options: "-c TimeZone=UTC" });
const walled = new PrismaClient({ adapter: new PrismaPg(pool) });
mkdirSync(WORK, { recursive: true });
const mclock = new FakeClock(new Date()), files = new LocalFiles(join(WORK, "files"));
const messages = new Messages({ db: walled as never, consent: new ConsentStore(auditEvent, mclock), files, jobs: fakeJobs(mclock), alerts: () => fakeAlerts(), channels: channelsOf([["EMAIL", localEmail]]), clock: mclock });
const newFirm = async (name: string) => { const k = `pf21rs-${uuid().slice(0, 8)}`; return (await owner.$queryRaw<{ id: string }[]>`insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at)
  values (gen_random_uuid(), ${k}, ${name}, 'CA', ${`${k}@sample-firm.example`}, now()) returning id::text as id`)[0].id; };
const staff = (firm: string, who: string, role: string) => { const id = uuid();
  sql(`insert into platform_staff (id, firm_id, email, display_name, status, updated_at) values ('${id}', '${firm}', '${who}.${id.slice(0, 6)}@sample-firm.example', 'Sample ${who}', 'ACTIVE', now())`);
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${firm}', '${id}', '${role}', 'seed:pf21rs-r0')`); return id; };
/** Lines on one firm's own trail, and the platform's firm-less bypass lines, by action. */
const firmLines = (firm: string) => Number(sql(`select count(*) from audit_event where firm_id = '${firm}'`));
const bypassLines = (use: string) => Number(sql(`select count(*) from audit_event where action = 'platform.bypass' and entity_key = '${use}'`));

const apps: { close(): Promise<void> }[] = [];
try {
  const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
  const firmLocal = new LocalIdentity("pf21rs-r0-firm-standin-key-0123456789ab", () => clock.now());
  const systemLocal = new SystemLocalIdentity("pf21rs-r0-system-standin-key-012345678", () => clock.now());
  const keep = (p: unknown) => !(typeof p === "object" && p !== null && "provide" in p && [BREACH_MESSAGES, BREACH_WORDS, DATA_REQUEST_DAILY].includes((p as { provide: unknown }).provide));
  @Module({ controllers: [PlatformIdentityController, SystemIdentityController, ...breaches.controllers, ...holds.controllers, ...requests.controllers] as never[],
    providers: [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: firmLocal }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
      { provide: SYSTEM_IDENTITY_PORT, useValue: systemLocal }, SystemIdentity, SystemPlaneWall, SystemGuard, { provide: APP_GUARD, useExisting: SystemGuard },
      { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: BREACH_MESSAGES, useValue: messages }, { provide: BREACH_WORDS, useValue: messages }, { provide: DATA_REQUEST_ALERTS, useValue: fakeAlerts() },
      ...[...breaches.providers, ...holds.providers, ...requests.providers].filter(keep)] as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false, abortOnError: false });
  app.use(requestMiddleware());
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  ok("R0 wiring (M1): the breaches feature reads the words through MessageWordsPort, bound to the messages module's own MESSAGE_PORT (the real Messages)",
    !!BREACH_WORDS && breaches.providers.some((p) => typeof p === "object" && "provide" in p && p.provide === BREACH_WORDS && "useExisting" in p && (p as { useExisting: unknown }).useExisting === MESSAGE_PORT)
    && typeof (messages as unknown as { storedWords?: unknown }).storedWords === "function");

  await seedSampleFirms(owner);
  const person = async (name: string, role: string) => (await owner.platSystemStaff.create({ data: { email: `${name.toLowerCase()}.pf21rs@expatready.example`, displayName: `Sample ${name}`, grants: { create: [{ roleCode: role }] } } })).id;
  const OWNER = await person("Owner", "platform-owner"), AUDITOR = await person("Auditor", "platform-auditor");
  const tokenOf = async (id: string) => { const email = (await owner.platSystemStaff.findUniqueOrThrow({ where: { id } })).email; return (await call(base, "POST", "/api/system/session/local", { body: { email, secondStep: true } })).body.token as string; };
  const ownerT = await tokenOf(OWNER), auditorT = await tokenOf(AUDITOR);
  const firmT = (await call(base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId: "user-R", secondStep: true } })).body.token as string;
  const firmA = await newFirm("Sample Words Firm A"), firmB = await newFirm("Sample Words Firm B");
  staff(firmA, "owner", "OWNER"); staff(firmA, "admin", "ADMIN"); staff(firmB, "owner", "OWNER");

  // A breach naming A and B, decided, both notified.
  const rec = { reason: "Sample: recording (R0)", discoveredAt: new Date(Date.now() - 3_600_000).toISOString(), description: "Sample: files readable by link for two hours (R0).",
    affectedFirms: [firmA, firmB], dataCategories: ["contact_details"], containment: "Sample: links revoked." };
  const opened = await call(base, "POST", "/api/system/register/breaches", { token: ownerT, body: rec });
  const id = opened.body.id as string;
  await call(base, "PATCH", `/api/system/register/breaches/${id}`, { token: ownerT, body: { reason: "Sample: decide", decision: "NOTIFY_FIRMS", decisionReason: "Sample: contact details may have been seen." } });
  const nA = await call(base, "POST", `/api/system/register/breaches/${id}/notices`, { token: ownerT, body: { reason: "Sample: notify A", firmId: firmA } });
  const nB = await call(base, "POST", `/api/system/register/breaches/${id}/notices`, { token: ownerT, body: { reason: "Sample: notify B", firmId: firmB } });
  ok("R0 setup: a breach naming firms A and B, decided, one notice each (201)", opened.status === 201 && nA.status === 201 && nB.status === 201, [opened.status, nA.status, nB.status]);
  const stored = async (firm: string, outboxId: string) => JSON.parse(new TextDecoder().decode((await files.get(firm, fileKeyOf(firm, outboxId)))!.bytes)) as { subject: string; text: string };
  const wantA = await stored(firmA, nA.body.recipients[0].outboxId), wantB = await stored(firmB, nB.body.recipients[0].outboxId);

  // R0-1 (QA-757)
  const linesA0 = firmLines(firmA), linesB0 = firmLines(firmB);
  const one = await call(base, "GET", `/api/system/register/breaches/${id}`, { token: ownerT });
  const noticeOf = (r: Res, firm: string) => (r.body?.notices ?? []).find((n: { firmId: string }) => n.firmId === firm) ?? {};
  const gotA = noticeOf(one, firmA), gotB = noticeOf(one, firmB);
  ok("R0-1 pass (QA-757): each notice on the breach carries the words sent, its subject and text exactly as the stored message holds them, with no note",
    one.status === 200 && gotA.subject === wantA.subject && gotA.text === wantA.text && gotB.subject === wantB.subject && gotB.text === wantB.text && gotA.wordsNote === null && gotA.text.includes("Sample Words Firm A"),
    { status: one.status, gotA: { s: gotA.subject, n: gotA.wordsNote }, wantA: wantA.subject });
  ok("R0-1 pass: only the subject and text leave the stored message: no address, sender, html or attachment on the notice",
    !["html", "to", "from", "replyTo", "attachments", "address"].some((k) => k in gotA) && !JSON.stringify(one.body).includes("<html"), Object.keys(gotA));
  // The record changes after the notice: the words stay those sent (never re-rendered).
  await call(base, "PATCH", `/api/system/register/breaches/${id}`, { token: ownerT, body: { reason: "Sample: correct", description: "Sample: a corrected description (R0)." } });
  const after = noticeOf(await call(base, "GET", `/api/system/register/breaches/${id}`, { token: ownerT }), firmA);
  ok("R0-1 fail (never re-rendered): after the description changes, firm A's notice still shows the words sent, not today's record", after.text === wantA.text && !after.text?.includes("corrected description"), after.text?.slice(0, 120));
  // A stored message changed on disk: no words, and the answer says so.
  const keyB = fileKeyOf(firmB, nB.body.recipients[0].outboxId);
  writeFileSync(join(files.root, firmB, keyB), JSON.stringify({ ...wantB, subject: "Sample: forged subject" }));   // on disk, past the write-once port
  const forged = noticeOf(await call(base, "GET", `/api/system/register/breaches/${id}`, { token: ownerT }), firmB);
  ok("R0-1 fail: a stored message that no longer matches its hash gives no words (subject and text null) and a note saying so; firm A's words still show",
    forged.subject === null && forged.text === null && typeof forged.wordsNote === "string" && forged.wordsNote.length > 0 && noticeOf(await call(base, "GET", `/api/system/register/breaches/${id}`, { token: ownerT }), firmA).subject === wantA.subject, forged);

  // R0-2 the port inside its firm only
  const words = messages as unknown as { storedWords(firmId: string, outboxId: string): Promise<{ subject: string; text: string } | null> };
  const own = await words.storedWords(firmA, nA.body.recipients[0].outboxId), cross = await words.storedWords(firmB, nA.body.recipients[0].outboxId);
  ok("R0-2 pass: the port gives firm A's message's subject and text, and nothing else", !!own && own.subject === wantA.subject && own.text === wantA.text && Object.keys(own).sort().join(",") === "subject,text", own);
  ok("R0-2 fail: firm A's message id asked as firm B gives nothing (the firm's walls and the file's own firm)", cross === null, cross);

  // R0-3 names
  const list = await call(base, "GET", "/api/system/register/breaches", { token: ownerT });
  const inList = (list.body?.breaches ?? []).find((b: { id: string }) => b.id === id) ?? {};
  const fresh = await call(base, "GET", `/api/system/register/breaches/${id}`, { token: ownerT });
  ok("R0-3 pass: a breach names each affected firm in order (list and one), and its staff actors: opened by, decided by, each notice's firm and sender",
    JSON.stringify(inList.firms) === JSON.stringify([{ id: firmA, name: "Sample Words Firm A" }, { id: firmB, name: "Sample Words Firm B" }]) && JSON.stringify(fresh.body.firms) === JSON.stringify(inList.firms)
    && fresh.body.openedByName === "Sample Owner" && fresh.body.decidedByName === "Sample Owner" && noticeOf(fresh, firmA).firmName === "Sample Words Firm A" && noticeOf(fresh, firmB).sentByName === "Sample Owner"
    && (fresh.body.events ?? []).every((e: { actor: string; actorName: string | null }) => !/^(our)?staff:/.test(e.actor) || e.actorName === "Sample Owner"), { firms: inList.firms, opened: fresh.body.openedByName });
  ok("R0-3 pass: the list carries no words (they are read on one breach only)", !(inList.notices ?? []).some((n: Record<string, unknown>) => "text" in n));
  const aud = await call(base, "GET", `/api/system/register/breaches/${id}`, { token: auditorT });
  const refused = await call(base, "GET", `/api/system/register/breaches/${id}`, { token: firmT });
  ok("R0-3 pass/fail: the Auditor reads the names and words too; a firm's token still gets 403 and no names", aud.status === 200 && aud.body.firms?.[0]?.name === "Sample Words Firm A" && refused.status === 403 && !JSON.stringify(refused.body).includes("Sample Words Firm"), [aud.status, refused.status]);
  ok("R0-3 fail (one firm-less line, never each firm's): reading names and words wrote nothing on firm A's or firm B's own trail, and the names' use wrote its firm-less line per read",
    firmLines(firmA) === linesA0 + 0 && firmLines(firmB) === linesB0 + 0 && bypassLines("platform.register.firm-names") >= 4, { a: [linesA0, firmLines(firmA)], b: [linesB0, firmLines(firmB)], bypass: bypassLines("platform.register.firm-names") });

  // Holds and requests
  const subject = uuid();
  const placed = await call(base, "POST", "/api/system/register/holds", { token: ownerT, body: { firmId: firmA, scope: { kind: "PERSON", id: subject }, reason: "Sample: litigation notice (R0)" } });
  await call(base, "POST", `/api/system/register/holds/${placed.body.id}/release`, { token: ownerT, body: { reason: "Sample: matter closed (R0)" } });
  const hs = await call(base, "GET", "/api/system/register/holds?state=all", { token: ownerT });
  const h = (hs.body?.holds ?? []).find((x: { id: string }) => x.id === placed.body.id) ?? {};
  ok("R0-3 pass (holds): a hold names its firm, who placed it and who released it", h.firmName === "Sample Words Firm A" && h.placedByName === "Sample Owner" && h.releasedByName === "Sample Owner", h);
  const withFirm = await call(base, "POST", "/api/system/register/requests", { token: ownerT, body: { type: "DELETION", requester: "Requester A (Sample)", requesterEmail: "requester.a@example.com", receivedOn: new Date().toISOString().slice(0, 10), firmId: firmA, subject: { kind: "PERSON", id: subject } } });
  const noFirm = await call(base, "POST", "/api/system/register/requests", { token: ownerT, body: { type: "ACCESS", requester: "Requester B (Sample)", requesterEmail: "requester.b@example.com", receivedOn: new Date().toISOString().slice(0, 10) } });
  await call(base, "POST", `/api/system/register/requests/${withFirm.body.id}/status`, { token: ownerT, body: { status: "IN_PROGRESS" } });
  const rq = await call(base, "GET", `/api/system/register/requests/${withFirm.body.id}`, { token: ownerT });
  const rl = await call(base, "GET", "/api/system/register/requests", { token: ownerT });
  const rB = (rl.body?.requests ?? []).find((x: { id: string }) => x.id === noFirm.body.id) ?? {};
  ok("R0-3 pass (requests): a request names its firm and who logged it, and each step its staff actor",
    rq.status === 200 && rq.body.firmName === "Sample Words Firm A" && rq.body.recordedByName === "Sample Owner" && (rq.body.steps ?? []).length >= 2
    && rq.body.steps.every((s: { actor: string; actorName: string | null }) => !/^(our)?staff:/.test(s.actor) || s.actorName === "Sample Owner"), { firm: rq.body.firmName, by: rq.body.recordedByName, steps: rq.body.steps });
  ok("R0-3 fail (requests): a request that names no firm has no firm name (null), and still names who logged it", "firmName" in rB && rB.firmName === null && rB.recordedByName === "Sample Owner", rB);
} catch (e) {
  fail++; console.log(`FAIL  unexpected error — ${String((e as Error)?.stack ?? e).slice(0, 1500)}`);
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await walled.$disconnect().catch(() => undefined); await owner.$disconnect().catch(() => undefined); await pool.end().catch(() => undefined);
  rmSync(WORK, { recursive: true, force: true });
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for the cleanup tool */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
