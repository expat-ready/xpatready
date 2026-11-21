// PF-21w (PF-21's part 2; P-579, P-584 (8), P-606): the complaints record's routes, /api/platform/complaints, behind
// PF-4's guard. Named cases DW1-DW9 and the walk W1 (the brief, Lead B 15 Nov), each with a passing and a failing case,
// on the six seeded roles (one staff member per role in the Sample firm, plus firm B's Owner and an inactive person;
// PF-21j: the handlers are Case Managers, who hold agent/complaint:record, as a Case Officer can no longer be one).
// One scratch database (every migration, PF-3's Sample seed) and a Nest app built from the feature's own classes
// (features/platform-complaints.ts) beside PF-4's (the guard, the local stand-in's tokens), the audit port real, the job
// runner a recorder. No server of the app, no browser, no model call (US$0). The database is dropped at the end.
//   tsx studio/tests/check_pf21w_routes.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, ModulesContainer, NestFactory, Reflector } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { JobHandler, JobPort } from "../ports/jobs.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf21w_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const throwsLike = (f: () => unknown, re: RegExp) => { try { f(); return false; } catch (e) { return re.test(String((e as Error).message)); } };

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
const { PlatformGuard, assertEveryRouteDeclared, platformRoutes } = await import("../api/src/platform/identity/guard.ts");
const { PlatformJobs } = await import("../api/src/platform/jobs/platform-jobs.ts");
const { ACK_REMINDER_JOB } = await import("../api/src/platform/complaints/complaints.ts");
const { EVENT } = await import("../ports/events.ts");
const { ComplaintJobs } = await import("../api/src/features/platform-complaints.ts");
const feature = (await import("../api/src/features/platform-complaints.ts")).default;
const { MESSAGES_MAIL } = await import("../api/src/features/platform-messages.ts");   // PF-19r: the complaints feature mails through it (in memory here)
const { fakeMail } = await import("../ports/mail.ts");

/** A job runner that records what it is given (the reminder's runs are PF-21's suite's). */
const recorder = () => {
  const handled: string[] = [], scheduled: string[] = [];
  const port: JobPort & { handled: string[]; scheduled: string[] } = {
    handled, scheduled,
    async handle(name: string, _h: JobHandler) { if (handled.includes(name)) throw new Error(`jobs: "${name}" already has a handler`); handled.push(name); },
    async schedule(_n, _at, _p, o) { scheduled.push(o.key); return { queued: true }; },
    async enqueue() { return { queued: true }; }, async cancel() { return true; }, async recurring() {},
  };
  return port;
};

const db = new Db();
const apps: { close(): Promise<void> }[] = [];
const local = new LocalIdentity("pf21w-check-signing-key-0123456789abcdef", () => Date.now());
async function makeApp(jobs: JobPort) {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, PlatformClock, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: MESSAGES_MAIL, useValue: fakeMail() }, { provide: PlatformJobs, useValue: jobs }, ...feature.providers];
  @Module({ controllers: feature.controllers as never[], providers: providers as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1"); apps.push(app);
  return { app, base: `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}` };
}

type Res = { status: number; body: any };
let BASE = "";
const call = async (method: string, path: string, token?: string, body?: unknown): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (method === "POST" && path === "") headers["idempotency-key"] = randomUUID();   // PF-21i: a fresh key per create
  const r = await fetch(`${BASE}/api/platform/complaints${path}`, { method, headers, body: body === undefined || method === "GET" ? undefined : JSON.stringify(body) });
  const text = await r.text(); let b: any = text; try { b = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: b };
};

try {
  await seedSampleFirms(db);
  const firmA = (await db.platformFirm.findFirstOrThrow({ where: { key: "sample-firm" } })).id;
  const firmB = (await db.platformFirm.findFirstOrThrow({ where: { key: "sample-solo" } })).id;
  const ROLES = ["OWNER", "ADMIN", "CASE_MANAGER", "CASE_OFFICER", "BILLING_FINANCE", "READ_ONLY"] as const;
  type Role = (typeof ROLES)[number];
  const person = async (firmId: string, name: string, role: Role | null, status: "ACTIVE" | "DEACTIVATED" = "ACTIVE") => {
    const s = await db.platformStaff.create({ data: { firmId, email: `${name}@pf21w.example.com`, displayName: `Sample ${name}`, actorId: `pf21w-${name}`, status } });
    if (role) await db.platformRoleGrant.create({ data: { firmId, staffId: s.id, role, grantedBy: "seed:pf21w" } });
    return { id: s.id, token: local.issue(s.id, { authTimeMs: Date.now() - 60_000, secondStep: true }) };
  };
  const as = {} as Record<Role, { id: string; token: string }>;
  for (const r of ROLES) as[r] = await person(firmA, r.toLowerCase().replace(/_/g, "-"), r);
  const ownerB = await person(firmB, "owner-b", "OWNER");
  const gone = await person(firmA, "gone", "CASE_OFFICER", "DEACTIVATED");
  const manager2 = await person(firmA, "manager-2", "CASE_MANAGER");   // PF-21j: a second handler who may record complaints

  const jobs = recorder();
  const { app, base } = await makeApp(jobs);
  BASE = base;

  // ---------------------------------------------------------------------------------------------------------- DW9
  const routes = platformRoutes(app.get(ModulesContainer), app.get(Reflector)).filter((r) => r.path.startsWith("/api/platform/complaints"));
  ok("PF-21w DW9 pass: PF-4's start-up check passes with the ten complaint routes (PF-21v added GET /handlers), each declared", routes.length === 10 && routes.every((r) => r.access) && (() => { try { assertEveryRouteDeclared(routes); return true; } catch { return false; } })(), routes.map((r) => `${r.method} ${r.path}`));
  const stripped = routes.map((r, i) => (i === 0 ? { ...r, access: undefined } : r));
  ok("PF-21w DW9 fail: assertEveryRouteDeclared refuses the list with one route stripped of its declaration, naming it", throwsLike(() => assertEveryRouteDeclared(stripped), new RegExp(`no declared permission keys.*${routes[0].name}`)));
  const declared = Object.fromEntries(routes.map((r) => [`${r.method} ${r.path}`, r.access]));
  ok("PF-21w DW9: the declarations are the brief's (record; record + read on the handler; any staff elsewhere, checked by the service)",
    JSON.stringify(declared["POST /api/platform/complaints"]) === JSON.stringify({ kind: "keys", keys: ["agent/complaint:record"] }) &&
    JSON.stringify(declared["POST /api/platform/complaints/:id/handler"]) === JSON.stringify({ kind: "keys", keys: ["agent/complaint:record", "agent/complaint:read"] }) &&
    routes.filter((r) => r.access?.kind === "any-staff").length === 7, declared);
  ok("PF-21w DW9 pass: the reminder job is registered once at start", JSON.stringify(jobs.handled) === JSON.stringify([ACK_REMINDER_JOB]), jobs.handled);
  await app.get(ComplaintJobs).onModuleInit();
  const second = await makeApp(jobs);
  ok("PF-21w DW9 fail→pass: a second start (the hook again, and a second app on the same runner) registers nothing new", jobs.handled.length === 1, jobs.handled);
  const fresh = recorder(); await makeApp(fresh);
  ok("PF-21w DW9: a new runner gets the reminder's handler (the guard is per runner, not a global off switch)", JSON.stringify(fresh.handled) === JSON.stringify([ACK_REMINDER_JOB]), fresh.handled);
  void second;

  // ---------------------------------------------------------------------------------------------------------- DW1
  const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const complaint = (handler: string, name = "Client A") => ({ subjectKind: "OTHER_PERSON", complainantName: name, receivedAt: ago(6), channel: "PHONE", category: "SERVICE", summary: "Called about a delay (Sample)", handlerStaffId: handler });
  const recorded: Record<string, string> = {};
  for (const r of ["OWNER", "ADMIN", "CASE_MANAGER"] as const) {
    const res = await call("POST", "", as[r].token, complaint(as.CASE_MANAGER.id, `Client ${r}`));
    ok(`PF-21w DW1 pass: ${r} records a complaint → 201`, res.status === 201 && res.body.status === "OPEN" && res.body.reminderScheduled === true, res);
    recorded[r] = res.body.id;
  }
  for (const r of ["CASE_OFFICER", "BILLING_FINANCE", "READ_ONLY"] as const) {
    const res = await call("POST", "", as[r].token, complaint(as[r].id));
    ok(`PF-21w DW1 fail: ${r} records a complaint → 403 (P-601: no agent/complaint:record)`, res.status === 403 && res.body.code === "MISSING_PERMISSION", res);
  }
  ok("PF-21w DW1: the three recorded complaints each queued one reminder, and the refused ones none", jobs.scheduled.length === 3, jobs.scheduled);
  const bad = await call("POST", "", as.OWNER.token, { ...complaint(as.CASE_MANAGER.id), summary: " " });
  ok("PF-21w DW1 fail: the service's field errors come through the route (422, at the field)", bad.status === 422 && typeof bad.body.fields?.summary === "string", bad);

  // A complaint handled by a second case manager, not the first one's (PF-21j: only people who may record complaints handle one).
  const theirs = (await call("POST", "", as.OWNER.token, complaint(manager2.id, "Client B"))).body.id as string;
  const mine = recorded.OWNER;

  // ---------------------------------------------------------------------------------------------------------- DW2
  const ids = (r: Res) => (r.body.items ?? []).map((c: { id: string }) => c.id).sort();
  const every = [...Object.values(recorded), theirs].sort();
  for (const r of ["OWNER", "ADMIN"] as const) {
    const l = await call("GET", "?view=all", as[r].token);
    ok(`PF-21w DW2 pass: ${r} lists every complaint of the firm`, l.status === 200 && JSON.stringify(ids(l)) === JSON.stringify(every), l);
    ok(`PF-21w DW2 pass: ${r} opens a complaint someone else handles`, (await call("GET", `/${theirs}`, as[r].token)).status === 200);
  }
  const lo = await call("GET", "?view=all", as.CASE_MANAGER.token);
  ok("PF-21w DW2 pass: a CASE_MANAGER handler (no read key) lists only their own", lo.status === 200 && JSON.stringify(ids(lo)) === JSON.stringify(Object.values(recorded).sort()), lo);
  const g = await call("GET", `/${mine}`, as.CASE_MANAGER.token);
  ok("PF-21w DW2 pass: the handler opens their own, with its events", g.status === 200 && g.body.events?.[0]?.kind === "RECEIVED", g);
  for (const r of ["CASE_OFFICER", "CASE_MANAGER", "BILLING_FINANCE", "READ_ONLY"] as const) {
    const id = theirs;   // PF-21j: the case manager handles mine, not theirs
    const x = await call("GET", `/${id}`, as[r].token);
    ok(`PF-21w DW2 fail: ${r} opening a complaint they do not handle → 404, never 403`, x.status === 404 && x.body.code === "NOT_FOUND", x);
  }
  const lr = await call("GET", "?view=all", as.READ_ONLY.token);
  ok("PF-21w DW2 fail: READ_ONLY (handles none) lists none", lr.status === 200 && lr.body.items.length === 0, lr);
  const page = await call("GET", "?view=all&limit=2", as.OWNER.token);
  const page2 = await call("GET", `?view=all&limit=2&cursor=${encodeURIComponent(page.body.next ?? "")}`, as.OWNER.token);
  ok("PF-21w DW2 pass: the list pages with limit and cursor (2 + 2 = every one, none twice)", page.body.items.length === 2 && page2.body.items.length === 2 && JSON.stringify([...ids(page), ...ids(page2)].sort()) === JSON.stringify(every), [page.body, page2.body]);
  for (const q of ["?view=nope", "?limit=0", "?limit=abc", "?limit=101", "?view=all&view=open", "?cursor=bad"]) {
    const x = await call("GET", q, as.OWNER.token);
    // A repeated key is refused by the one input rule at the door (PF-28 part 2b: INVALID, the field named), the rest by the service.
    ok(`PF-21w DW2 fail: list ${q} → a field error (422)`, x.status === 422 && (q.includes("&view=") ? x.body.code === "INVALID" && Object.hasOwn(x.body.fields ?? {}, "view") : x.body.code === "COMPLAINT_FIELDS"), x);
  }

  // ---------------------------------------------------------------------------------------------------------- DW3
  const steps: [string, (at: string) => unknown][] = [["acknowledge", (at) => ({ at })], ["steps", () => ({ kind: "STEP", note: "Called back (Sample)" })], ["response-sent", (at) => ({ at })], ["close", (at) => ({ at, outcome: "RESOLVED", note: "Sorted (Sample)" })]];
  for (const [i, [route, body]] of steps.entries()) {
    const no = await call("POST", `/${theirs}/${route}`, as.BILLING_FINANCE.token, body(ago(5 - i)));
    ok(`PF-21w DW3 fail: a non-handler without the keys (BILLING_FINANCE) on ${route} → 404`, no.status === 404 && no.body.code === "NOT_FOUND", no);
    const yes = await call("POST", `/${recorded.ADMIN}/${route}`, as.CASE_MANAGER.token, body(ago(5 - i)));
    ok(`PF-21w DW3 pass: the CASE_MANAGER handler (record key, no read key; PF-21j) on ${route}, their own complaint → 200`, yes.status === 200, yes);
  }
  ok("PF-21w DW3: the handler's own complaint is closed RESOLVED", (await call("GET", `/${recorded.ADMIN}`, as.OWNER.token)).body.outcome === "RESOLVED");
  const cm = await call("POST", `/${mine}/acknowledge`, manager2.token, { at: ago(5) });
  ok("PF-21w DW3 fail: record alone (another CASE_MANAGER, not the handler) cannot act on a complaint → 404", cm.status === 404, cm);

  // ---------------------------------------------------------------------------------------------------------- DW4
  for (const [r, to] of [["OWNER", as.ADMIN.id], ["ADMIN", as.CASE_MANAGER.id]] as const) {
    const h = await call("POST", `/${theirs}/handler`, as[r].token, { handlerStaffId: to });
    ok(`PF-21w DW4 pass: ${r} (record + read) changes the handler → 200`, h.status === 200 && h.body.handlerStaffId === to, h);
  }
  for (const r of ["CASE_MANAGER", "CASE_OFFICER", "READ_ONLY"] as const) {
    const h = await call("POST", `/${theirs}/handler`, as[r].token, { handlerStaffId: as.ADMIN.id });
    ok(`PF-21w DW4 fail: ${r} changes the handler → 403 (needs both keys)`, h.status === 403 && h.body.code === "MISSING_PERMISSION", h);
  }
  const toGone = await call("POST", `/${theirs}/handler`, as.OWNER.token, { handlerStaffId: gone.id });
  ok("PF-21w DW4 fail: an inactive staff member as the new handler → the service's field error", toGone.status === 422 && /active staff member/.test(toGone.body.fields?.handlerStaffId ?? ""), toGone);
  const toB = await call("POST", `/${theirs}/handler`, as.OWNER.token, { handlerStaffId: ownerB.id });
  ok("PF-21w DW4 fail: another firm's staff member as the new handler → the same field error", toB.status === 422 && typeof toB.body.fields?.handlerStaffId === "string", toB);

  // ---------------------------------------------------------------------------------------------------------- DW5
  const snapshot = async () => JSON.stringify([await db.platComplaint.findMany({ orderBy: { id: "asc" } }), await db.platComplaintEvent.count()]);
  const before = await snapshot();
  for (const r of ROLES) {
    const d = await call("DELETE", `/${mine}`, as[r].token);
    ok(`PF-21w DW5 fail: ${r} deletes a complaint → refused (405, kept)`, d.status === 405 && d.body.code === "COMPLAINT_KEPT", d);
  }
  ok("PF-21w DW5 pass: after every DELETE the rows and their events are unchanged", (await snapshot()) === before);

  // ---------------------------------------------------------------------------------------------------------- DW6
  const closed = recorded.ADMIN, events = async () => db.platComplaintEvent.count({ where: { complaintId: closed } });
  const row = async () => JSON.stringify(await db.platComplaint.findFirst({ where: { id: closed } }));
  const [e0, r0] = [await events(), await row()];
  const again = await call("POST", `/${closed}/close`, as.OWNER.token, { at: ago(1), outcome: "UPHELD", note: "Again" });
  ok("PF-21w DW6 fail: a second close → the service's refusal (409 complaint closed)", again.status === 409 && again.body.code === "COMPLAINT_CLOSED", again);
  const step = await call("POST", `/${closed}/steps`, as.CASE_MANAGER.token, { kind: "STEP", note: "Late step" });
  ok("PF-21w DW6 fail: a handling step on a closed complaint → 409", step.status === 409 && step.body.code === "COMPLAINT_CLOSED", step);
  const note = await call("POST", `/${closed}/steps`, as.CASE_MANAGER.token, { kind: "NOTE", note: "Client wrote again (Sample)" });
  ok("PF-21w DW6 pass: a closed complaint changes only by a new event (a note: one event more, the record as it was)", note.status === 200 && (await events()) === e0 + 1 && (await row()) === r0, note);

  // ---------------------------------------------------------------------------------------------------------- DW7
  const every9: [string, string][] = [["POST", ""], ["GET", ""], ["GET", `/${mine}`], ["POST", `/${mine}/acknowledge`], ["POST", `/${mine}/steps`], ["POST", `/${mine}/response-sent`], ["POST", `/${mine}/close`], ["POST", `/${mine}/handler`], ["DELETE", `/${mine}`]];
  for (const [m, p] of every9) { const x = await call(m, p, undefined, {}); ok(`PF-21w DW7 fail: no token on ${m} /api/platform/complaints${p} → 401`, x.status === 401 && x.body.code === "NOT_SIGNED_IN", x); }
  const forged = await call("GET", "", "not-a-token");
  ok("PF-21w DW7 fail: a token that is not one → 401", forged.status === 401, forged);
  ok("PF-21w DW7 pass: the same list with a token → 200", (await call("GET", "", as.OWNER.token)).status === 200);

  // ---------------------------------------------------------------------------------------------------------- DW8
  const inB = await call("POST", "", ownerB.token, complaint(ownerB.id, "Client C"));
  ok("PF-21w DW8 pass: firm B's Owner records and opens their own firm's complaint", inB.status === 201 && (await call("GET", `/${inB.body.id}`, ownerB.token)).status === 200, inB);
  for (const [m, p, b] of [["GET", "", undefined], ["POST", "/acknowledge", { at: ago(5) }], ["POST", "/steps", { kind: "NOTE", note: "x" }], ["POST", "/response-sent", { at: ago(4) }], ["POST", "/close", { at: ago(3), outcome: "RESOLVED", note: "x" }], ["POST", "/handler", { handlerStaffId: as.ADMIN.id }]] as const) {
    const x = await call(m, `/${inB.body.id}${p}`, as.OWNER.token, b);
    ok(`PF-21w DW8 fail: firm A's Owner on firm B's complaint, ${m} /:id${p} → 404`, x.status === 404 && x.body.code === "NOT_FOUND", x);
  }
  const delB = await call("DELETE", `/${inB.body.id}`, as.OWNER.token), delA = await call("DELETE", `/${mine}`, as.OWNER.token);
  ok("PF-21w DW8: DELETE /:id answers firm B's id exactly as its own firm's (the same 405 for any id: it tells nothing either)", delB.status === 405 && JSON.stringify(delB.body) === JSON.stringify(delA.body), [delB, delA]);
  ok("PF-21w DW8 pass: firm A's lists never show firm B's complaint", !ids(await call("GET", "?view=all", as.OWNER.token)).includes(inB.body.id));
  ok("PF-21w DW8: firm B's complaint is unchanged by firm A's calls (only its RECEIVED event)", (await db.platComplaintEvent.count({ where: { complaintId: inB.body.id } })) === 1);

  // ----------------------------------------------------------------------------------------------------------- W1
  const w = await call("POST", "", as.CASE_MANAGER.token, complaint(as.CASE_MANAGER.id, "Client W"));
  const inView = async (v: string) => ids(await call("GET", `?view=${v}`, as.CASE_MANAGER.token)).includes(w.body.id);
  ok("PF-21w W1: recorded → it appears in \"open\", not in \"closed\"", w.status === 201 && (await inView("open")) && !(await inView("closed")), w);
  const walk = [await call("POST", `/${w.body.id}/acknowledge`, as.CASE_MANAGER.token, { at: ago(5) }), await call("POST", `/${w.body.id}/steps`, as.CASE_MANAGER.token, { kind: "STEP", note: "Called the client (Sample)", at: ago(4) }),
    await call("POST", `/${w.body.id}/response-sent`, as.CASE_MANAGER.token, { at: ago(3) }), await call("POST", `/${w.body.id}/close`, as.CASE_MANAGER.token, { at: ago(2), outcome: "RESOLVED", note: "Resolved (Sample)" })];
  ok("PF-21w W1: acknowledge → step → response sent → close (RESOLVED), each 200", walk.every((x) => x.status === 200) && walk[3].body.outcome === "RESOLVED", walk.map((x) => x.status));
  const out = await db.moduleEvent.findMany({ where: { subjectId: w.body.id }, orderBy: { seq: "asc" } });
  ok("PF-21w W1: it appears in \"closed\" and no longer in \"open\", with complaint.closed in the outbox", (await inView("closed")) && !(await inView("open")) && out.map((e) => e.type).join(",") === `${EVENT.COMPLAINT_RECEIVED},${EVENT.COMPLAINT_CLOSED}`, out.map((e) => e.type));
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
