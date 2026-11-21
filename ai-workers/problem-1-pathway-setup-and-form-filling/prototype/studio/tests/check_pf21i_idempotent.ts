// PF-21i (BACKLOG row PF-21i rev 16.24; STANDARDS §4 "[M] Idempotent creates and job launches"; #1823 M1; map row 109):
// recording a complaint is idempotent by `Idempotency-Key`. Named cases DW1-DW6 (the brief, Lead B 16 Nov), each with a
// passing and a failing case. One scratch database: every migration before PF-21i's, PF-3's Sample seed and a complaint
// recorded the old way (no key), then PF-21i's migration and the rest (DW6); then a Nest app built from the feature's
// own classes behind PF-4's guard (as PF-21w's suite does), the audit port real, the job runner a recorder. No server
// of the app, no browser, no model call (US$0). The database is dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf21i_idempotent.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { JobHandler, JobPort } from "../ports/jobs.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const NEW = "20261118233000_pf21i_complaint_request_key";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf21i_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const psql = (args: string[]) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string) => psql(["-Atc", q]);
const refused = (q: string, re: RegExp) => { try { sql(q); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };

const all = readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort();
if (!all.includes(NEW)) throw new Error(`no migration ${NEW}`);
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of all.filter((x) => x < NEW)) psql(["-f", join(MIG, d, "migration.sql")]);
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED"]) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";   // PF-24w: required, no default (features/platform-messages.ts reads the loader at import)

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformJobs } = await import("../api/src/platform/jobs/platform-jobs.ts");
const { canonicalJson, readIdempotencyKey, requestHash } = await import("../api/src/platform/idempotency.ts");
const { EVENT } = await import("../ports/events.ts");
const feature = (await import("../api/src/features/platform-complaints.ts")).default;
const { MESSAGES_MAIL } = await import("../api/src/features/platform-messages.ts");   // PF-19r: the complaints feature mails through it (in memory here)
const { fakeMail } = await import("../ports/mail.ts");

/** A job runner that counts what it is asked to schedule. */
const recorder = () => {
  const handled: string[] = [], scheduled: string[] = [];
  const port: JobPort & { scheduled: string[] } = {
    scheduled,
    async handle(name: string, _h: JobHandler) { handled.push(name); },
    async schedule(_n, _at, _p, o) { scheduled.push(o.key); return { queued: true }; },
    async enqueue() { return { queued: true }; }, async cancel() { return true; }, async recurring() {},
  };
  return port;
};

const db = new Db();
const apps: { close(): Promise<void> }[] = [];
const local = new LocalIdentity("pf21i-check-signing-key-0123456789abcdef", () => Date.now());

type Res = { status: number; body: any };
let BASE = "";
const post = async (token: string, body: unknown, key?: string | null): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${token}` };
  if (key !== null && key !== undefined) headers["idempotency-key"] = key;
  const r = await fetch(`${BASE}/api/platform/complaints`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
  const text = await r.text(); let b: any = text; try { b = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: b };
};

try {
  await seedSampleFirms(db);
  const firmA = (await db.platformFirm.findFirstOrThrow({ where: { key: "sample-firm" } })).id;
  const firmB = (await db.platformFirm.findFirstOrThrow({ where: { key: "sample-solo" } })).id;
  const person = async (firmId: string, name: string, role: "OWNER" | "CASE_MANAGER" | "CASE_OFFICER") => {
    const s = await db.platformStaff.create({ data: { firmId, email: `${name}@pf21i.example.com`, displayName: `Sample ${name}`, actorId: `pf21i-${name}`, status: "ACTIVE" } });
    await db.platformRoleGrant.create({ data: { firmId, staffId: s.id, role, grantedBy: "seed:pf21i" } });
    return { id: s.id, token: local.issue(s.id, { authTimeMs: Date.now() - 60_000, secondStep: true }) };
  };
  const owner = await person(firmA, "owner", "OWNER");
  const manager = await person(firmA, "manager", "CASE_MANAGER");
  const officer = await person(firmA, "officer", "CASE_OFFICER");
  const caseManager = await person(firmA, "handler", "CASE_MANAGER");   // PF-21j: a handler holds agent/complaint:record (a Case Officer cannot be one)
  const ownerB = await person(firmB, "owner-b", "OWNER");

  // ---------------------------------------------------------------------------------------------------------- DW6
  // A complaint recorded before PF-21i (no key), with its RECEIVED event, in one transaction (the deferred trigger).
  const old = randomUUID();
  psql(["-c", `BEGIN;
    INSERT INTO plat_complaint (id, firm_id, subject_kind, complainant_name, received_at, channel, category, summary, handler_staff_id, acknowledge_by, recorded_by, updated_at)
      VALUES ('${old}', '${firmA}', 'OTHER_PERSON', 'Client Old', now() - interval '3 days', 'PHONE', 'SERVICE', 'Recorded before PF-21i (Sample)', '${officer.id}', now() - interval '1 day', 'staff:${owner.id}', now());
    INSERT INTO plat_complaint_event (id, firm_id, complaint_id, kind, at, actor) SELECT gen_random_uuid(), firm_id, id, 'RECEIVED', received_at, recorded_by FROM plat_complaint WHERE id = '${old}';
    COMMIT;`]);
  ok("PF-21i DW6 fail (before): main's schema has no request_key column", sql(`select count(*) from information_schema.columns where table_name = 'plat_complaint' and column_name in ('request_key','request_hash')`) === "0");
  for (const d of all.filter((x) => x >= NEW)) psql(["-f", join(MIG, d, "migration.sql")]);
  ok("PF-21i DW6 pass: the migration applies over existing complaints; the old one keeps NULL key and hash",
    sql(`select count(*) from information_schema.columns where table_name = 'plat_complaint' and column_name in ('request_key','request_hash') and is_nullable = 'YES'`) === "2"
    && sql(`select (request_key is null and request_hash is null)::text from plat_complaint where id = '${old}'`) === "true");
  ok("PF-21i DW6 pass: the unique index is partial, on (firm_id, request_key) where request_key is not null",
    /UNIQUE INDEX .* ON public\.plat_complaint USING btree \(firm_id, request_key\) WHERE \(request_key IS NOT NULL\)/.test(sql(`select indexdef from pg_indexes where indexname = 'plat_complaint_firm_request_key'`)));
  ok("PF-21i DW6 fail: the migration does not apply twice", (() => { try { psql(["-f", join(MIG, NEW, "migration.sql")]); return false; } catch (e) { return /already exists/.test(String((e as { stderr?: string }).stderr)); } })());
  ok("PF-21i DW6 fail: a key is never set later on a recorded complaint (trigger)", refused(`update plat_complaint set request_key = 'late', request_hash = repeat('a', 64) where id = '${old}'`, /request key and its hash .* never change/));
  ok("PF-21i DW6 fail: a key without its hash, or a key with a space, is refused (check)",
    refused(`update plat_complaint set request_key = 'k' where id = '${old}'`, /plat_complaint_request_shape|never change/)
    && refused(`BEGIN; INSERT INTO plat_complaint (id, firm_id, subject_kind, complainant_name, received_at, channel, category, summary, handler_staff_id, acknowledge_by, recorded_by, updated_at, request_key, request_hash)
      VALUES (gen_random_uuid(), '${firmA}', 'OTHER_PERSON', 'X', now(), 'PHONE', 'SERVICE', 'x', '${officer.id}', now() + interval '1 day', 'x', now(), 'a b', repeat('a', 64)); COMMIT;`, /plat_complaint_request_shape/));

  // Devin review: a CHECK passes when it evaluates to NULL, so each half-filled pair is tried as an insert (no trigger
  // in the way), beside the two pairs that are allowed.
  const insertWith = (k: string, h: string) => `BEGIN; WITH c AS (INSERT INTO plat_complaint (id, firm_id, subject_kind, complainant_name, received_at, channel, category, summary, handler_staff_id, acknowledge_by, recorded_by, updated_at, request_key, request_hash)
      VALUES (gen_random_uuid(), '${firmA}', 'OTHER_PERSON', 'X', now() - interval '1 hour', 'PHONE', 'SERVICE', 'x (Sample)', '${officer.id}', now() + interval '1 day', 'staff:${owner.id}', now(), ${k}, ${h}) RETURNING firm_id, id, received_at, recorded_by)
      INSERT INTO plat_complaint_event (id, firm_id, complaint_id, kind, at, actor) SELECT gen_random_uuid(), firm_id, id, 'RECEIVED', received_at, recorded_by FROM c; ROLLBACK;`;
  const H = `repeat('a', 64)`;
  ok("PF-21i DW6 fail (insert): a key with a NULL hash, or a hash with a NULL key, is refused (check)",
    refused(insertWith(`'pair-k'`, "NULL"), /plat_complaint_request_shape/) && refused(insertWith("NULL", H), /plat_complaint_request_shape/));
  ok("PF-21i DW6 pass (insert): both NULL, or a valid key with its hash, is accepted", (() => { try { sql(insertWith("NULL", "NULL")); sql(insertWith(`'pair-ok'`, H)); return true; } catch { return false; } })());

  const jobs = recorder();
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, PlatformClock, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: MESSAGES_MAIL, useValue: fakeMail() }, { provide: PlatformJobs, useValue: jobs }, ...feature.providers];
  @Module({ controllers: feature.controllers as never[], providers: providers as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1"); apps.push(app);
  BASE = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;

  const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const AT = ago(6);   // one received time: a repeat sends the very same body
  const complaint = (summary = "Called about a delay (Sample)", handler = caseManager.id) => ({ subjectKind: "OTHER_PERSON", complainantName: "Client A", receivedAt: AT, channel: "PHONE", category: "SERVICE", summary, handlerStaffId: handler });
  /** What one complaint wrote: its rows, RECEIVED events, complaint.record audit lines, complaint.received outbox rows. */
  const counts = (firm: string) => ({
    complaints: Number(sql(`select count(*) from plat_complaint where firm_id = '${firm}'`)),
    received: Number(sql(`select count(*) from plat_complaint_event where firm_id = '${firm}' and kind = 'RECEIVED'`)),
    audit: Number(sql(`select count(*) from audit_event where action = 'complaint.record' and entity_key in (select id::text from plat_complaint where firm_id = '${firm}')`)),
    outbox: Number(sql(`select count(*) from module_event where firm_id = '${firm}' and type = '${EVENT.COMPLAINT_RECEIVED}'`)),
  });
  const grew = (a: ReturnType<typeof counts>, b: ReturnType<typeof counts>) => ({ complaints: b.complaints - a.complaints, received: b.received - a.received, audit: b.audit - a.audit, outbox: b.outbox - a.outbox });
  const same = (x: object, y: object) => JSON.stringify(x) === JSON.stringify(y);
  const ONE = { complaints: 1, received: 1, audit: 1, outbox: 1 }, NONE = { complaints: 0, received: 0, audit: 0, outbox: 0 };

  // ---------------------------------------------------------------------------------------------------------- DW1
  {
    const key = randomUUID(), before = counts(firmA), jobsBefore = jobs.scheduled.length;
    const r = [await post(owner.token, complaint(), key), await post(owner.token, complaint(), key), await post(owner.token, complaint(), key)];
    const d = grew(before, counts(firmA));
    const v = same(d, ONE) && jobs.scheduled.length - jobsBefore === 1 && r[0].status === 201 && r[1].status === 200 && r[2].status === 200 && r[1].body.id === r[0].body.id && r[2].body.id === r[0].body.id;
    ok(`PF-21i DW1 ${v ? "pass" : "fail"}: three posts with one key and one body → one complaint, one RECEIVED event, one complaint.record audit line, one complaint.received outbox row, one reminder job; the second and third answer 200 with the first's id`, v, { d, jobs: jobs.scheduled.length - jobsBefore, s: r.map((x) => x.status) });
    ok("PF-21i DW1: the answers never show the key or its hash", r.every((x) => !("requestKey" in x.body) && !("requestHash" in x.body)), r[1].body);
    ok("PF-21i DW1: the complaint keeps the key and the SHA-256 of the canonical body", sql(`select request_key || ' ' || request_hash from plat_complaint where id = '${r[0].body.id}'`) === `${key} ${requestHash(complaint())}`);
    // A body that differs only in key order is the same request (the canonical hash).
    const reordered = Object.fromEntries(Object.entries(complaint()).reverse());
    const k2 = randomUUID(); const a = await post(owner.token, complaint(), k2), b0 = counts(firmA), b = await post(owner.token, JSON.stringify(reordered), k2);
    ok("PF-21i DW1 pass: the same body with its keys in another order is the same request → 200, the first id, nothing written", a.status === 201 && b.status === 200 && b.body.id === a.body.id && same(grew(b0, counts(firmA)), NONE), { a: a.status, b: b.status });
    ok("PF-21i DW1: canonicalJson sorts keys at every depth and keeps array order", canonicalJson({ b: 1, a: { d: [2, 1], c: null } }) === canonicalJson({ a: { c: null, d: [2, 1] }, b: 1 }) && canonicalJson([2, 1]) !== canonicalJson([1, 2]));
    const k3 = randomUUID(); const c = await post(owner.token, complaint(), k3), c2 = await post(owner.token, complaint(), randomUUID());
    ok("PF-21i DW1 fail→pass: a new key is a new complaint (201, another id)", c.status === 201 && c2.status === 201 && c.body.id !== c2.body.id);
  }

  // ---------------------------------------------------------------------------------------------------------- DW2
  {
    const key = randomUUID(), first = await post(owner.token, complaint(), key), before = counts(firmA), jobsBefore = jobs.scheduled.length;
    const r = await post(owner.token, complaint("Another summary (Sample)"), key);
    const v = first.status === 201 && r.status === 422 && r.body.code === "IDEMPOTENCY_KEY_REUSED" && r.body.detail === "This request key was already used for a different complaint." && same(grew(before, counts(firmA)), NONE) && jobs.scheduled.length === jobsBefore;
    ok(`PF-21i DW2 ${v ? "pass" : "fail"}: the same key with a different summary → 422 "This request key was already used for a different complaint.", nothing new written`, v, r);
    const other = await post(manager.token, complaint(), key);
    ok("PF-21i DW2 fail: the same key and body from another person of the firm → 422, never the first person's complaint", other.status === 422 && other.body.code === "IDEMPOTENCY_KEY_REUSED" && !JSON.stringify(other.body).includes(first.body.id), other);
    const again = await post(owner.token, complaint(), key);
    ok("PF-21i DW2 pass: after the refusal the first body still answers the first complaint (200)", again.status === 200 && again.body.id === first.body.id);
  }

  // ---------------------------------------------------------------------------------------------------------- DW2b
  // Review M1: a repeat answers the complaint as it was recorded, never its later state: a recorder without the read key
  // who is not the handler (a case manager) must not learn of the handler's acknowledgement, response, close or change.
  {
    const key = randomUUID(), body = complaint("Recorded by a case manager (Sample)");
    const first = await post(manager.token, body, key);
    const id = first.body.id as string, at = (h: number) => new Date(Date.parse(AT) + h * 3_600_000).toISOString();
    const steps = [
      await fetch(`${BASE}/api/platform/complaints/${id}/acknowledge`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${caseManager.token}` }, body: JSON.stringify({ at: at(1) }) }),
      await fetch(`${BASE}/api/platform/complaints/${id}/response-sent`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${caseManager.token}` }, body: JSON.stringify({ at: at(2) }) }),
      await fetch(`${BASE}/api/platform/complaints/${id}/handler`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${owner.token}` }, body: JSON.stringify({ handlerStaffId: owner.id }) }),
      await fetch(`${BASE}/api/platform/complaints/${id}/close`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${owner.token}` }, body: JSON.stringify({ at: at(3), outcome: "RESOLVED", note: "Resolved (Sample)" }) }),
    ];
    const cannotRead = (await fetch(`${BASE}/api/platform/complaints/${id}`, { headers: { authorization: `Bearer ${manager.token}` } })).status;
    const again = await post(manager.token, body, key);
    const asRecorded = again.status === 200 && again.body.id === id && again.body.status === "OPEN" && again.body.acknowledgedAt === null && again.body.responseSentAt === null
      && again.body.outcome === null && again.body.closedAt === null && again.body.handlerStaffId === caseManager.id && again.body.updatedAt === again.body.createdAt;
    ok(`PF-21i DW2b ${asRecorded ? "pass" : "fail"}: a repeat by a recorder who cannot read the complaint (404 on GET) answers it as recorded: open, not acknowledged, no response, no outcome, the first handler`,
      steps.every((x) => x.status === 200) && first.status === 201 && cannotRead === 404 && asRecorded, { steps: steps.map((x) => x.status), cannotRead, again: again.body });
    ok("PF-21i DW2b: the repeat's answer is the first answer (apart from reminderScheduled), field by field", JSON.stringify({ ...first.body, reminderScheduled: undefined, updatedAt: undefined }) === JSON.stringify({ ...again.body, reminderScheduled: undefined, updatedAt: undefined, overdue: first.body.overdue, businessDaysLeft: first.body.businessDaysLeft }), { first: first.body, again: again.body });
  }

  // ---------------------------------------------------------------------------------------------------------- DW3
  {
    let good = 0; const bad: unknown[] = [];
    for (let i = 0; i < 20; i++) {
      const key = randomUUID(), before = counts(firmA), jobsBefore = jobs.scheduled.length;
      const [a, b] = await Promise.all([post(owner.token, complaint(`Parallel ${i} (Sample)`), key), post(owner.token, complaint(`Parallel ${i} (Sample)`), key)]);
      const st = [a.status, b.status].sort().join(",");
      if (st === "200,201" && a.body.id === b.body.id && same(grew(before, counts(firmA)), ONE) && jobs.scheduled.length - jobsBefore === 1) good++; else bad.push({ i, st, d: grew(before, counts(firmA)) });
    }
    ok(`PF-21i DW3 ${good === 20 ? "pass" : "fail"}: two parallel posts with one key → one row, one 201 and one 200 with the same id (${good} of 20 runs)`, good === 20, bad);
  }

  // ---------------------------------------------------------------------------------------------------------- DW4
  {
    const before = counts(firmA), jobsBefore = jobs.scheduled.length;
    const none = await post(owner.token, complaint(), null);
    const v = none.status === 400 && none.body.code === "IDEMPOTENCY_KEY_MISSING" && none.body.detail === "Send an Idempotency-Key header with each new complaint.";
    const long = await post(owner.token, complaint(), "k".repeat(256));
    const max = await post(owner.token, complaint(), "k".repeat(255));
    ok(`PF-21i DW4 ${v && long.status === 400 ? "pass" : "fail"}: no key → 400 IDEMPOTENCY_KEY_MISSING; a 256-character key → 400; nothing written`, v && long.status === 400 && long.body.code === "IDEMPOTENCY_KEY_INVALID" && same(grew(before, counts(firmA)), ONE) && jobs.scheduled.length - jobsBefore === 1, { none, long: long.status });
    ok("PF-21i DW4 pass: a 255-character key is accepted (201)", max.status === 201, max.status);
    const empty = await post(owner.token, complaint(), "");
    ok("PF-21i DW4 fail: an empty key is no key (400 IDEMPOTENCY_KEY_MISSING)", empty.status === 400 && empty.body.code === "IDEMPOTENCY_KEY_MISSING", empty);
    const quoted = randomUUID(), q1 = await post(owner.token, complaint("Quoted (Sample)"), `"${quoted}"`), q2 = await post(owner.token, complaint("Quoted (Sample)"), quoted);
    ok("PF-21i DW4 pass: a quoted key (the draft's string form) is the same key without its quotes", q1.status === 201 && q2.status === 200 && q2.body.id === q1.body.id, { q1: q1.status, q2: q2.status });
    const shapes = { space: () => readIdempotencyKey("a b", "m"), tab: () => readIdempotencyKey("a\tb", "m"), nul: () => readIdempotencyKey("a\u0000b", "m"), del: () => readIdempotencyKey("a\u007fb", "m"), nonAscii: () => readIdempotencyKey("clé", "m"),
      twice: () => readIdempotencyKey(["a", "b"], "m"), loneQuote: () => readIdempotencyKey("\"", "m"), params: () => readIdempotencyKey("\"k\";p=1", "m"), openQuote: () => readIdempotencyKey("\"abc", "m"), bareQuote: () => readIdempotencyKey("\"a\"b\"", "m"), emptyQuoted: () => readIdempotencyKey("\"\"", "m"), badEscape: () => readIdempotencyKey("\"a\\b\"", "m") };
    const refusedShapes = Object.entries(shapes).filter(([, f]) => { try { f(); return false; } catch (e) { return (e as { getStatus?: () => number }).getStatus?.() === 400; } }).map(([k]) => k);
    ok("PF-21i DW4 fail: control characters, spaces, non-ASCII, a repeated header and a broken quoted string → 400", refusedShapes.length === Object.keys(shapes).length, refusedShapes);
    const ctl = await fetch(`${BASE}/api/platform/complaints`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${owner.token}`, "idempotency-key": "a b" }, body: JSON.stringify(complaint()) });
    ok("PF-21i DW4 fail: through the route, a key with a space → 400 IDEMPOTENCY_KEY_INVALID", ctl.status === 400 && (await ctl.json()).code === "IDEMPOTENCY_KEY_INVALID");
    // A repeated header line, as a client sends it on the wire (fetch would merge it): Node joins the two values with ", ".
    const { request } = await import("node:http");
    const twiceStatus = await new Promise<number>((done, failed) => {
      const u = new URL(`${BASE}/api/platform/complaints`), payload = JSON.stringify(complaint());
      const rq = request({ host: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: [["content-type", "application/json"], ["authorization", `Bearer ${owner.token}`], ["idempotency-key", "k1"], ["idempotency-key", "k1"], ["content-length", String(Buffer.byteLength(payload))]].flat() }, (rs) => { rs.resume(); done(rs.statusCode ?? 0); });
      rq.on("error", failed); rq.end(payload);
    });
    ok("PF-21i DW4 fail: two Idempotency-Key header lines on one request → 400 (not one key)", twiceStatus === 400, twiceStatus);
    const officerTry = await post(officer.token, complaint(), randomUUID());
    ok("PF-21i DW4: the permission still comes first (a case officer with a key → 403)", officerTry.status === 403);
  }

  // ---------------------------------------------------------------------------------------------------------- DW5
  {
    const key = randomUUID(), aBefore = counts(firmA), bBefore = counts(firmB);
    const a = await post(owner.token, complaint(), key);
    const b = await post(ownerB.token, complaint("Called about a delay (Sample)", ownerB.id), key);
    ok("PF-21i DW5 pass: the same key in firm A and firm B makes one complaint in each (the key is per firm)", a.status === 201 && b.status === 201 && a.body.id !== b.body.id && same(grew(aBefore, counts(firmA)), ONE) && same(grew(bBefore, counts(firmB)), ONE), { a: a.status, b: b.status });
    const b2 = await post(ownerB.token, complaint("Called about a delay (Sample)", ownerB.id), key);
    const b3 = await post(ownerB.token, complaint(), key);
    ok("PF-21i DW5 fail: firm B's answers never name firm A's id (a repeat answers B's own; firm A's body with B's key → 422 or a field error, never A's)", b2.status === 200 && b2.body.id === b.body.id && !JSON.stringify([b, b2, b3].map((x) => x.body)).includes(a.body.id) && b3.status === 422, { b2: b2.status, b3: b3.status });
  }
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
