// PF-21j (QA-517, Major; J-109 breaker M1; map row 109; brief product/design/lead-b-briefs/PF-21j.md, Lead B 19 Nov):
// only a person who may record complaints (agent/complaint:record) can handle one. Before, canAct trusted the handler
// whatever their keys and handlers() offered every active staff member, so a Read-only person made handler could
// acknowledge and close. Named cases H1-H5 (H5: the reminder, break M2; H6, the screen's rule, is in check_pf21s_complaints_browser.ts), each with a passing and a failing case; each failing case fails on the code
// before PF-21j (the two checks it adds: the handler list and handler setting; the record key on acting).
// One scratch database (every migration, PF-3's Sample seed) and a Nest app built from the feature's own classes behind
// PF-4's guard (as PF-21w's suite does), the audit port real, the job runner a recorder. Keys are read from a person's
// current grants on every request, so ending a grant takes effect on the same token. No server of the app, no browser,
// no model call (US$0). The database is dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf21j_handler_key.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { JobPort } from "../ports/jobs.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf21j_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
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
const feature = (await import("../api/src/features/platform-complaints.ts")).default;
const { ComplaintsService } = await import("../api/src/platform/complaints/complaints.ts");
const { MESSAGES_MAIL } = await import("../api/src/features/platform-messages.ts");
const { fakeMail } = await import("../ports/mail.ts");

const HANDLER_NEEDS_KEY = "This person cannot handle complaints. Choose someone who may record them.";
const jobs: JobPort = { async handle() {}, async schedule() { return { queued: true }; }, async enqueue() { return { queued: true }; }, async cancel() { return true; }, async recurring() {} };

const db = new Db();
let app: { close(): Promise<void> } | undefined;
const local = new LocalIdentity("pf21j-check-signing-key-0123456789abcdef", () => Date.now());

type Res = { status: number; body: any };
let BASE = "";
const call = async (method: string, path: string, token: string, body?: unknown): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${token}` };
  if (method === "POST" && path === "") headers["idempotency-key"] = randomUUID();   // PF-21i: a fresh key per create
  const r = await fetch(`${BASE}/api/platform/complaints${path}`, { method, headers, body: body === undefined || method === "GET" ? undefined : JSON.stringify(body) });
  const text = await r.text(); let b: any = text; try { b = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: b };
};

try {
  await seedSampleFirms(db);
  const firm = (await db.platformFirm.findFirstOrThrow({ where: { key: "sample-firm" } })).id;
  type Role = "OWNER" | "CASE_MANAGER" | "CASE_OFFICER" | "READ_ONLY";
  const person = async (name: string, role: Role) => {
    const s = await db.platformStaff.create({ data: { firmId: firm, email: `${name}@pf21j.example.com`, displayName: `Sample ${name}`, actorId: `pf21j-${name}`, status: "ACTIVE" } });
    await db.platformRoleGrant.create({ data: { firmId: firm, staffId: s.id, role, grantedBy: "seed:pf21j" } });
    return { id: s.id, token: local.issue(s.id, { authTimeMs: Date.now() - 60_000, secondStep: true }) };
  };
  const owner = await person("owner", "OWNER"), manager = await person("manager", "CASE_MANAGER");
  const officer = await person("officer", "CASE_OFFICER"), readOnly = await person("read-only", "READ_ONLY");
  const demoted = await person("demoted", "CASE_MANAGER");   // made handler while a Case Manager, then made Read-only (H4)

  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, PlatformClock, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: MESSAGES_MAIL, useValue: fakeMail() }, { provide: PlatformJobs, useValue: jobs }, ...feature.providers];
  @Module({ controllers: feature.controllers as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false });
  await nest.listen(0, "127.0.0.1"); app = nest;
  BASE = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;

  const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const complaint = (handler: string, name: string) => ({ subjectKind: "OTHER_PERSON", complainantName: name, receivedAt: ago(6), channel: "PHONE", category: "SERVICE", summary: "Called about a delay (Sample)", handlerStaffId: handler });
  const record = async (handler: string, name: string) => { const r = await call("POST", "", owner.token, complaint(handler, name)); if (r.status !== 201) throw new Error(`setup: recording a complaint → ${r.status} ${JSON.stringify(r.body)}`); return r.body.id as string; };

  // ----------------------------------------------------------------------------------------------------------- H1
  const list = await call("GET", "/handlers", owner.token);
  const listed = new Set((list.body.items ?? []).map((i: { id: string }) => i.id));
  ok("PF-21j H1 pass: the handler list offers people who may record complaints (the Owner, a Case Manager)", list.status === 200 && listed.has(owner.id) && listed.has(manager.id), list);
  ok("PF-21j H1 fail: the handler list leaves out a Read-only person", list.status === 200 && !listed.has(readOnly.id), list);
  ok("PF-21j H1 fail: the handler list leaves out a Case Officer (no agent/complaint:record either)", list.status === 200 && !listed.has(officer.id), list);

  // ----------------------------------------------------------------------------------------------------------- H2
  const count = () => db.platComplaint.count({ where: { firmId: firm } });
  const n0 = await count();
  const asReadOnly = await call("POST", "", owner.token, complaint(readOnly.id, "Client R"));
  ok("PF-21j H2 fail: recording a complaint with a Read-only handler → 422 at handlerStaffId, with its sentence", asReadOnly.status === 422 && asReadOnly.body.fields?.handlerStaffId === HANDLER_NEEDS_KEY, asReadOnly);
  ok("PF-21j H2 fail: … and nothing is recorded", (await count()) === n0);
  const theirs = await record(manager.id, "Client H");
  const snap = async () => JSON.stringify([await db.platComplaint.findFirst({ where: { id: theirs } }), await db.platComplaintEvent.count({ where: { complaintId: theirs } })]);
  const before = await snap();
  const toReadOnly = await call("POST", `/${theirs}/handler`, owner.token, { handlerStaffId: readOnly.id });
  ok("PF-21j H2 fail: making a Read-only person the handler → 422 at handlerStaffId, with its sentence", toReadOnly.status === 422 && toReadOnly.body.fields?.handlerStaffId === HANDLER_NEEDS_KEY, toReadOnly);
  ok("PF-21j H2 fail: … and nothing changes (the row and its events as they were)", (await snap()) === before);
  const toOwner = await call("POST", `/${theirs}/handler`, owner.token, { handlerStaffId: owner.id });
  ok("PF-21j H2 pass: making someone who may record complaints the handler → 200", toOwner.status === 200 && toOwner.body.handlerStaffId === owner.id, toOwner);

  // ----------------------------------------------------------------------------------------------------------- H3
  const managers = await record(manager.id, "Client M");
  const ack = await call("POST", `/${managers}/acknowledge`, manager.token, { at: ago(5) });
  ok("PF-21j H3 pass: a handler holding agent/complaint:record (a Case Manager, no read key) acknowledges → 200", ack.status === 200 && !!ack.body.acknowledgedAt, ack);
  const closed = await call("POST", `/${managers}/close`, manager.token, { at: ago(4), outcome: "RESOLVED", note: "Sorted (Sample)" });
  ok("PF-21j H3 pass: … and closes it → 200, Closed", closed.status === 200 && closed.body.status === "CLOSED", closed);

  // ----------------------------------------------------------------------------------------------------------- H4
  const demotedOnes = await record(demoted.id, "Client D");
  await db.platformRoleGrant.updateMany({ where: { firmId: firm, staffId: demoted.id, endedAt: null }, data: { endedAt: new Date(), endedBy: "seed:pf21j", endReason: "made Read-only (Sample)" } });
  await db.platformRoleGrant.create({ data: { firmId: firm, staffId: demoted.id, role: "READ_ONLY", grantedBy: "seed:pf21j" } });
  const rowBefore = JSON.stringify(await db.platComplaint.findFirst({ where: { id: demotedOnes } }));
  const ackNo = await call("POST", `/${demotedOnes}/acknowledge`, demoted.token, { at: ago(5) });
  ok("PF-21j H4 fail: a handler made Read-only acknowledges → 403", ackNo.status === 403 && ackNo.body.code === "NOT_ALLOWED", ackNo);
  const closeNo = await call("POST", `/${demotedOnes}/close`, demoted.token, { at: ago(4), outcome: "RESOLVED", note: "Not theirs to close now" });
  ok("PF-21j H4 fail: … and closes → 403", closeNo.status === 403 && closeNo.body.code === "NOT_ALLOWED", closeNo);
  ok("PF-21j H4 fail: … and the complaint is unchanged (open, not acknowledged)", JSON.stringify(await db.platComplaint.findFirst({ where: { id: demotedOnes } })) === rowBefore);
  const open = await call("GET", `/${demotedOnes}`, demoted.token);
  ok("PF-21j H4 pass: … but can still open it (canRead unchanged: the handler reads their own)", open.status === 200 && open.body.id === demotedOnes && open.body.status === "OPEN", open);
  // Review Major 3: only grants not ended count. The demoted person still has their ended Case Manager grant.
  const listAfter = await call("GET", "/handlers", owner.token);
  ok("PF-21j H4 fail: an ended Case Manager grant does not count: the handler list leaves the demoted person out", listAfter.status === 200 && !(listAfter.body.items ?? []).some((i: { id: string }) => i.id === demoted.id), listAfter);
  const anotherOne = await record(manager.id, "Client E");
  const toDemoted = await call("POST", `/${anotherOne}/handler`, owner.token, { handlerStaffId: demoted.id });
  ok("PF-21j H4 fail: … and making them a handler again → 422 with its sentence", toDemoted.status === 422 && toDemoted.body.fields?.handlerStaffId === HANDLER_NEEDS_KEY, toDemoted);
  const ownerAck = await call("POST", `/${demotedOnes}/acknowledge`, owner.token, { at: ago(5) });
  ok("PF-21j H4 pass: someone with both keys (the Owner) still acts on it → 200", ownerAck.status === 200, ownerAck);

  // ----------------------------------------------------------------------------------------------------------- H5
  // Break M2: the acknowledgement reminder goes to the handler only while they may still act on it; one who lost the
  // record key could not acknowledge, so the firm's Owners and Admins are reminded instead.
  const svc = nest.get(ComplaintsService);
  const sentTo = async (id: string) => {
    const run = await svc.runAckReminder({ firmId: firm, complaintId: id });
    const e = await db.platComplaintEvent.findFirst({ where: { complaintId: id, kind: "REMINDER_SENT" } });
    return { run, sentTo: (e?.detail as { sentTo?: string } | null)?.sentTo ?? null };
  };
  const keyed = await sentTo(await record(manager.id, "Client K"));
  ok("PF-21j H5 pass: a handler who holds the record key gets the reminder", keyed.run === "sent" && keyed.sentTo === "handler", keyed);
  const lost = await person("lost-key", "CASE_MANAGER");
  const lostOnes = await record(lost.id, "Client L");
  await db.platformRoleGrant.updateMany({ where: { firmId: firm, staffId: lost.id, endedAt: null }, data: { endedAt: new Date(), endedBy: "seed:pf21j", endReason: "made Read-only (Sample)" } });
  await db.platformRoleGrant.create({ data: { firmId: firm, staffId: lost.id, role: "READ_ONLY", grantedBy: "seed:pf21j" } });
  const unkeyed = await sentTo(lostOnes);
  ok("PF-21j H5 fail: a handler made Read-only is not the one reminded; the firm's Owners and Admins are", unkeyed.run === "sent" && unkeyed.sentTo === "owners_admins", unkeyed);

} finally {
  await app?.close().catch(() => undefined);
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
