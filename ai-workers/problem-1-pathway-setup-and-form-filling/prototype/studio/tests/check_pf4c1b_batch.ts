// PF-4c part 1b (BACKLOG PF-4c1b; P-727 "1-50 rows, send good ones"; AG-1-69, AG-1-34, SA-3-39; R1.20 one entitlement
// check): POST /api/platform/staff/invitations/batch sends the good rows. A pass and a fail per Done when line (brief
// design/lead-b-briefs/PF-4c.md, amendment 19 Nov, on lead-b-front-office):
//   DW1 50 rows → all invited; 51 → 422 with `fields` · DW2 3 valid and 2 flagged → 3 invited, 2 listed with their reasons ·
//   DW3 8 valid with 5 seats left → 5 invited (rows in order) and 3 OVER_SEAT_LIMIT; the seat limit is read once
//   (one EntitlementPort check per form) · DW4 the same batch again → the invited rows come back ALREADY_INVITED and
//   nothing is sent twice · DW5 two batches at once never pass the limit (the firm row lock) · DW6 every reason
//   (INVALID_EMAIL, INVALID_ROLES, DUPLICATE_IN_FORM, ALREADY_STAFF, ALREADY_INVITED, OVER_SEAT_LIMIT, role not allowed)
//   names its row; a body that is itself invalid (an unknown field) still sends nothing.
// A scratch database (every migration, the Sample firms) and a Nest app of PF-4's classes with the local stand-in, a test
// clock and the fake MailPort. No server, no browser, no model call (US$0). The database is dropped.
//   tsx studio/tests/check_pf4c1b_batch.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf4c1b_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}) => {
  const r = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) }, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const { PgEntitlements } = await import("../api/src/platform/entitlements/limits.ts");

// Counts EntitlementPort's seat checks (R1.20: one check for the whole form, never one per row).
let seatChecks = 0;
const realCheck = PgEntitlements.prototype.check;
PgEntitlements.prototype.check = function (this: InstanceType<typeof PgEntitlements>, ...a: Parameters<typeof realCheck>) { if (a[1] === "seats") seatChecks++; return realCheck.apply(this, a); };

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const local = new LocalIdentity("pf4c1b-check-signing-key-0123456789abcdef", () => clock.now());
const mail = fakeMail();

let app: { close(): Promise<void> } | null = null;
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: MAIL_PORT, useValue: mail }];
  @Module({ controllers: [PlatformIdentityController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;

  await seedSampleFirms(db);
  const FIRM_A = sql(`select id from platform_firm where key = 'sample-firm'`), O = sql(`select id from platform_staff where actor_id = 'user-O'`);
  const signIn = async (actorId: string) => (await call(base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId, secondStep: true } })).body.token as string;
  const tR = await signIn("user-R");
  const used = () => Number(sql(`select ((select count(*) from platform_staff where firm_id = '${FIRM_A}' and status in ('ACTIVE','SUSPENDED')) + (select count(*) from platform_invitation where firm_id = '${FIRM_A}' and accepted_at is null and revoked_at is null and expires_at > now()))::int`));
  const limit = () => Number(sql(`select p.seats_limit from platform_plan p join platform_subscription s on s.plan_id = p.id where s.firm_id = '${FIRM_A}' and s.status <> 'ENDED' limit 1`));
  /** Clears the pending invitations and leaves exactly `free` seats. */
  const seatsLeft = (free: number) => { sql(`update platform_invitation set revoked_at = now() where firm_id = '${FIRM_A}' and accepted_at is null and revoked_at is null`); sql(`update platform_plan set seats_limit = ${used() + free} where id in (select plan_id from platform_subscription where firm_id = '${FIRM_A}' and status <> 'ENDED')`); };
  const invites = () => Number(sql(`select count(*) from platform_invitation where firm_id = '${FIRM_A}'`));
  const auditLines = () => Number(sql(`select count(*) from audit_event where action = 'platform.invitation.created'`));
  const batch = (rows: unknown, token = tR) => call(base, "POST", "/api/platform/staff/invitations/batch", { token, body: { rows } });
  const row = (email: string, roles = ["CASE_OFFICER"]) => ({ email, roles });
  const snap = () => ({ i: invites(), a: auditLines(), m: mail.sent.length });
  const reasons = (b: any) => (b.flagged ?? []).map((f: any) => `${f.row}:${f.reason}`).join();
  const invitedRows = (b: any) => (b.invited ?? []).map((i: any) => i.row).join();

  // --------------------------------------------------------------------------------------- DW1: 1-50 rows
  seatsLeft(50);
  let before = snap();
  const fifty = await batch(Array.from({ length: 50 }, (_, i) => row(`fifty${i}@example.com`)));
  ok("PF-4c1b DW1 pass: 50 rows with 50 seats → 200, 50 invited, 50 invitations, 50 audit lines, 50 emails, nothing flagged",
    fifty.status === 200 && fifty.body.invited?.length === 50 && fifty.body.flagged?.length === 0 && invites() === before.i + 50 && auditLines() === before.a + 50 && mail.sent.length === before.m + 50
    && fifty.body.invited.every((i: any) => i.status === "PENDING" && i.emailed === true) && !/token/i.test(JSON.stringify(fifty.body)), { status: fifty.status, code: fifty.body.code, n: fifty.body.invited?.length });
  seatsLeft(60);
  before = snap();
  const fiftyOne = await batch(Array.from({ length: 51 }, (_, i) => row(`fiftyone${i}@example.com`)));
  ok("PF-4c1b DW1 fail: 51 rows → 422 ROWS_COUNT with `fields.rows`, nothing created or sent",
    fiftyOne.status === 422 && fiftyOne.body.code === "ROWS_COUNT" && typeof fiftyOne.body.fields?.rows === "string" && fiftyOne.body.maxRows === 50 && invites() === before.i && mail.sent.length === before.m, fiftyOne.body);
  const zero = await batch([]);
  ok("PF-4c1b DW1 fail: 0 rows → 422 ROWS_COUNT, nothing sent", zero.status === 422 && zero.body.code === "ROWS_COUNT" && invites() === before.i, zero.body);

  // ------------------------------------------------------------------------- DW2: valid rows sent, flagged rows listed
  seatsLeft(10);
  before = snap();
  const mixed = await batch([row("good.one@example.com"), row("not-an-email"), row("good.two@example.com"), row("bad.role@example.com", ["CHIEF"]), row("good.three@example.com")]);
  ok("PF-4c1b DW2 pass: 3 valid and 2 flagged → 200; rows 1, 3, 5 invited; rows 2 and 4 listed with INVALID_EMAIL and INVALID_ROLES and their words",
    mixed.status === 200 && invitedRows(mixed.body) === "1,3,5" && reasons(mixed.body) === "2:INVALID_EMAIL,4:INVALID_ROLES"
    && mixed.body.flagged.every((f: any) => typeof f.detail === "string" && f.detail.length > 0 && Array.isArray(f.flags)), mixed.body);
  ok("PF-4c1b DW2 fail: the flagged rows are not sent — exactly 3 invitations, 3 audit lines and 3 emails, none to a flagged row",
    invites() === before.i + 3 && auditLines() === before.a + 3 && mail.sent.length === before.m + 3 && !mail.sent.slice(before.m).some((m) => /bad\.role|not-an-email/.test(m.to))
    && sql(`select count(*) from platform_invitation where email = 'bad.role@example.com'`) === "0", snap());
  before = snap();
  const allBad = await batch([row("still-not-an-email"), row("x@example.com", [])]);
  ok("PF-4c1b DW2 fail: every row flagged → 200 with invited [] and both rows listed, nothing sent",
    allBad.status === 200 && allBad.body.invited?.length === 0 && reasons(allBad.body) === "1:INVALID_EMAIL,2:INVALID_ROLES" && invites() === before.i && mail.sent.length === before.m, allBad.body);

  // ----------------------------------------------- DW3: the seats, read once, in row order; the rows past them flagged
  seatsLeft(5);
  before = snap();
  seatChecks = 0;
  const eight = await batch([row("s1@example.com"), row("s2@example.com"), row("not-an-email"), row("s3@example.com"), row("s4@example.com"), row("s5@example.com"), row("s6@example.com"), row("s7@example.com"), row("s8@example.com")]);
  ok("PF-4c1b DW3 pass: 8 valid (and 1 flagged) with 5 seats left → 5 invited in row order (1, 2, 4, 5, 6); rows 7, 8, 9 OVER_SEAT_LIMIT; row 3 INVALID_EMAIL (holds no seat)",
    eight.status === 200 && invitedRows(eight.body) === "1,2,4,5,6" && reasons(eight.body) === "3:INVALID_EMAIL,7:OVER_SEAT_LIMIT,8:OVER_SEAT_LIMIT,9:OVER_SEAT_LIMIT"
    && /No seat left/.test(eight.body.flagged[1]?.detail ?? "") && invites() === before.i + 5 && mail.sent.length === before.m + 5, eight.body);
  ok("PF-4c1b DW3 pass (R1.20): the seat limit is counted once for the whole form — one EntitlementPort seat check", seatChecks === 1, seatChecks);
  ok("PF-4c1b DW3 fail: the seats never pass the limit; the answer's seat line is full (seatsUsed = seatsLimit)",
    used() === limit() && eight.body.seatsUsed === eight.body.seatsLimit && eight.body.seatsLimit === limit(), { used: used(), limit: limit(), body: [eight.body.seatsUsed, eight.body.seatsLimit] });
  before = snap();
  seatChecks = 0;
  const none = await batch([row("t1@example.com"), row("t2@example.com")]);
  ok("PF-4c1b DW3 fail: no seat left → 200, both rows OVER_SEAT_LIMIT, nothing sent, one seat check",
    none.status === 200 && none.body.invited?.length === 0 && reasons(none.body) === "1:OVER_SEAT_LIMIT,2:OVER_SEAT_LIMIT" && invites() === before.i && mail.sent.length === before.m && seatChecks === 1, none.body);
  sql(`update platform_subscription set status = 'ENDED' where firm_id = '${FIRM_A}'`);
  const noPlan = await batch([row("u1@example.com")]);
  ok("PF-4c1b DW3 fail: no live plan → the row OVER_SEAT_LIMIT saying there is no live subscription (fail closed), nothing sent",
    noPlan.status === 200 && reasons(noPlan.body) === "1:OVER_SEAT_LIMIT" && /no live subscription/.test(noPlan.body.flagged[0]?.detail ?? "") && invites() === before.i, noPlan.body);
  sql(`update platform_subscription set status = 'ACTIVE' where firm_id = '${FIRM_A}' and id = (select id from platform_subscription where firm_id = '${FIRM_A}' order by created_at desc limit 1)`);

  // ------------------------------------------------------------------- DW4: the same batch again sends nothing twice
  seatsLeft(10);
  const form = [row("again.one@example.com"), row("again.two@example.com"), row("not-an-email")];
  const first = await batch(form);
  before = snap();
  const repeat = await batch(form);
  ok("PF-4c1b DW4 pass: the first send invites rows 1 and 2", first.status === 200 && invitedRows(first.body) === "1,2", first.body);
  ok("PF-4c1b DW4 fail: the same batch again → rows 1 and 2 ALREADY_INVITED, row 3 INVALID_EMAIL; no invitation, audit line or email twice",
    repeat.status === 200 && repeat.body.invited?.length === 0 && reasons(repeat.body) === "1:ALREADY_INVITED,2:ALREADY_INVITED,3:INVALID_EMAIL"
    && invites() === before.i && auditLines() === before.a && mail.sent.length === before.m && sql(`select count(*) from platform_invitation where email = 'again.one@example.com'`) === "1", repeat.body);

  // ----------------------------------------------------------------- DW5: two batches at once never pass the limit
  seatsLeft(3);
  const [b1, b2] = await Promise.all([batch([row("race.a1@example.com"), row("race.a2@example.com")]), batch([row("race.b1@example.com"), row("race.b2@example.com")])]);
  const sent = (b1.body.invited?.length ?? 0) + (b2.body.invited?.length ?? 0), overs = [...(b1.body.flagged ?? []), ...(b2.body.flagged ?? [])].filter((f: any) => f.reason === "OVER_SEAT_LIMIT").length;
  ok("PF-4c1b DW5: two batches of 2 at once with 3 seats left → both 200, exactly 3 invited and 1 OVER_SEAT_LIMIT; the seats never pass the limit",
    b1.status === 200 && b2.status === 200 && sent === 3 && overs === 1 && used() === limit(), { s: [b1.status, b2.status], sent, overs, used: used(), limit: limit() });

  // ----------------------------------------------------------------------- DW6: every reason names its own row
  seatsLeft(3);
  const staffEmail = sql(`select email from platform_staff where id = '${O}'`);
  await batch([row("pending.person@example.com")]);
  const toAdmin = await call(base, "PATCH", `/api/platform/staff/${O}/roles`, { token: tR, body: { roles: ["ADMIN"], reason: "batch check" } });
  const tAdmin = await signIn("user-O");
  const beyond = sql(`select r.role from (select distinct role from platform_role_permission where role <> 'OWNER') r where exists (select 1 from platform_role_permission k where k.role = r.role
    and k.permission_key not in (select permission_key from platform_role_permission where role = 'ADMIN')) order by r.role limit 1`);
  ok("setup: user-O is an Admin, and a starter role holds a key an Admin lacks", toAdmin.status === 200 && !!beyond && !!tAdmin, { toAdmin: toAdmin.body, beyond });
  const RO = ["READ_ONLY"];   // a role an Admin may give
  before = snap();
  const every = await batch([
    row("v1@example.com", RO), row("v1@EXAMPLE.com", RO), row(staffEmail.toUpperCase(), RO), row("pending.person@example.com", RO), row("owner.row@example.com", ["OWNER"]),
    row("beyond@example.com", [beyond]), row("bad@", RO), row("v2@example.com", RO), row("v3@example.com", RO),
  ], tAdmin);
  ok("PF-4c1b DW6: each flagged row names its reason (DUPLICATE_IN_FORM, ALREADY_STAFF, ALREADY_INVITED, OWNER_BY_SINGLE_INVITE, ROLE_BEYOND_OWN_KEYS, INVALID_EMAIL); of the 3 valid rows with 2 seats left, rows 1 and 8 go and row 9 is OVER_SEAT_LIMIT",
    every.status === 200 && invitedRows(every.body) === "1,8"
    && reasons(every.body) === "2:DUPLICATE_IN_FORM,3:ALREADY_STAFF,4:ALREADY_INVITED,5:OWNER_BY_SINGLE_INVITE,6:ROLE_BEYOND_OWN_KEYS,7:INVALID_EMAIL,9:OVER_SEAT_LIMIT"
    && invites() === before.i + 2 && mail.sent.length === before.m + 2, every.body);
  before = snap();
  const typo = await batch([row("typo.ok@example.com"), { email: "typo.row@example.com", roles: ["CASE_OFFICER"], nmae: "Client B" }]);
  ok("PF-4c1b DW6 fail: a body that is itself invalid (row 2 has an unknown field) → 422 ROWS_FLAGGED naming row 2 with `fields`, and nothing is sent, not even row 1",
    typo.status === 422 && typo.body.code === "ROWS_FLAGGED" && typo.body.rows?.[0]?.row === 2 && typeof typo.body.fields?.["rows.1"] === "string" && invites() === before.i && mail.sent.length === before.m, typo.body);
  seatsLeft(5);
  before = snap();
  const crafted = await batch([row("crafted.ok@example.com"), { email: "crafted.bad@example.com", roles: [{ toString: 1 }] }, { email: "crafted.num@example.com", roles: [7, null] }]);
  ok("PF-4c1b break M1 fail: a role that is not text ({\"toString\":1}, a number, null) → that row INVALID_ROLES (never a 500), and the good row is still sent",
    crafted.status === 200 && invitedRows(crafted.body) === "1" && reasons(crafted.body) === "2:INVALID_ROLES,3:INVALID_ROLES" && /not text/.test(crafted.body.flagged[0]?.detail ?? "") && invites() === before.i + 1, crafted.body);
  await call(base, "PATCH", `/api/platform/staff/${O}/roles`, { token: tR, body: { roles: ["READ_ONLY"], reason: "batch check" } });
  const readOnly = await batch([row("nokey@example.com")], await signIn("user-O"));
  ok("PF-4c1b fail: a person without agent/staff:manage → 403, nothing sent", readOnly.status === 403 && sql(`select count(*) from platform_invitation where email = 'nokey@example.com'`) === "0", readOnly.body);

  // ------------- DW7 (QA-774, R1.20 "every gated action asks one check"): while a lower plan is booked (SA-3-59) the gate
  // uses the booked plan's seat limit; its refusal names that plan, and Team's seat line (StaffReads.seats) reads the same
  // limit through the same check. Sample plan, booked through the table's own trigger (it stamps the rest).
  seatsLeft(10);
  const curName = sql(`select p.name from platform_plan p join platform_subscription s on s.plan_id = p.id where s.firm_id = '${FIRM_A}' and s.status <> 'ENDED'`);
  const LOW = `pf4c1b-lower-${process.pid}`, LOW_NAME = "Sample Lower (PF-4c1b)", lowSeats = used() + 1;
  sql(`insert into platform_plan (id, code, name, seats_limit) values (gen_random_uuid(), '${LOW}', '${LOW_NAME}', ${lowSeats})`);
  sql(`insert into platform_subscription_change (id, firm_id, subscription_id, from_plan_id, to_plan_id, booked_by, booked_at, effective_at)
    select gen_random_uuid(), s.firm_id, s.id, s.plan_id, p.id, 'seed:pf4c1b', now(), now() from platform_subscription s, platform_plan p where s.firm_id = '${FIRM_A}' and s.status <> 'ENDED' and p.code = '${LOW}'`);
  const { StaffReads } = await import("../api/src/platform/staff-read/service.ts");
  const reads = new StaffReads(db as never, {} as never, {} as never);
  ok("setup: a lower Sample plan is booked for the renewal (open, not applied), its seats one above today's use",
    sql(`select count(*) from platform_subscription_change where firm_id = '${FIRM_A}' and withdrawn_at is null and applied_at is null`) === "1" && limit() === used() + 10);
  const line = await reads.seats(FIRM_A);
  ok("PF-4c1b DW7 fail (QA-774): Team's seat line reads the limit the gate uses (the booked plan's) and names that plan, not the plan row's",
    line.limit === lowSeats && line.used === used() && line.plan === LOW_NAME && line.line === `${used()} of ${lowSeats} seats used`, line);
  before = snap();
  const twoRows = await batch([row("low.one@example.com"), row("low.two@example.com")]);
  const lowWords = twoRows.body.flagged?.[0]?.detail ?? "";
  ok("PF-4c1b DW7 pass: the batch gives the one seat left under the booked plan; row 2 OVER_SEAT_LIMIT; the answer's limit is the booked one",
    twoRows.status === 200 && invitedRows(twoRows.body) === "1" && reasons(twoRows.body) === "2:OVER_SEAT_LIMIT" && twoRows.body.seatsLimit === lowSeats && invites() === before.i + 1, twoRows.body);
  ok("PF-4c1b DW7 fail (QA-774): the row's words name the plan whose seat count they quote (the booked one), never the current plan with the booked plan's number",
    lowWords.includes(LOW_NAME) && lowWords.includes(`${lowSeats} seats`) && !lowWords.includes(curName), lowWords);
  const single = await call(base, "POST", "/api/platform/staff/invitations", { token: tR, body: { email: "low.single@example.com", roles: ["CASE_OFFICER"] } });
  const singleWords = String(single.body?.detail ?? "");
  ok("PF-4c1b DW7 fail (QA-774): a single invite past the booked limit is refused 409 naming the booked plan and its limit, not the current plan",
    single.status === 409 && single.body.code === "PLAN_LIMIT_REACHED" && single.body.limit === lowSeats && singleWords.includes(LOW_NAME) && !singleWords.includes(curName)
    && sql(`select count(*) from platform_invitation where email = 'low.single@example.com'`) === "0", single.body);
  sql(`update platform_subscription_change set withdrawn_at = now() where firm_id = '${FIRM_A}' and withdrawn_at is null and applied_at is null`);
  const back = await reads.seats(FIRM_A);
  ok("PF-4c1b DW7 pass: the booking withdrawn, the seat line is the current plan's limit and name again", back.limit === limit() && back.plan === curName, back);
} finally {
  PgEntitlements.prototype.check = realCheck;
  await app?.close().catch(() => {});
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
