// PF-4c part 1 (BACKLOG PF-4c; AG-1-69 multi-row invite, SA-3-39 / SA-3-5 hard seats): the batch invite,
// POST /api/platform/staff/invitations/batch. A pass and a fail per Done when line:
//   DW1 one seat check for the whole form (over: 409 PLAN_LIMIT_REACHED, removeCount, nothing created or sent) ·
//   DW2 duplicates in the form, existing staff and already-invited people flagged on their rows, nothing sent ·
//   DW3 two batches at once (and a batch against a single invite) never pass the seat limit: the firm row lock ·
//   DW4 Owner rows, roles beyond the inviter's keys and malformed emails flagged on their rows; 0 or 21 rows → 422; the
//       single invite of an Owner by an Owner still 201 · DW5 a failed insert on the third row creates nothing; a failed
//       email leaves that row emailed: false and its invitation pending.
// Plus the reviewer's two: letter case or spaces never skip a row's flag, and the greeting's name is never stored.
// A scratch database (every migration, the Sample firms) and a Nest app of PF-4's classes with the local stand-in, a test
// clock and the fake MailPort. No server, no browser, no model call (US$0). The database is dropped.
//   tsx studio/tests/check_pf4c_batch_invite.ts
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
const DB = `xr_studio_pf4c_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
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

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const local = new LocalIdentity("pf4c-check-signing-key-0123456789abcdef", () => clock.now());
const mail = fakeMail({ failOn: (m) => m.to === "mail.fails@example.com" });

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
  const row = (email: string, roles = ["CASE_OFFICER"], name?: string) => ({ email, roles, ...(name ? { name } : {}) });
  const flagsOf = (b: any, n: number) => ((b.rows ?? []).find((r: any) => r.row === n)?.flags ?? []).map((f: any) => f.code);
  const nothingChanged = (before: { i: number; a: number; m: number }) => invites() === before.i && auditLines() === before.a && mail.sent.length === before.m;
  const snap = () => ({ i: invites(), a: auditLines(), m: mail.sent.length });

  // ------------------------------------------------------------------------- DW1: one seat check for the whole form
  seatsLeft(2);
  let before = snap();
  const over = await batch([row("one@example.com"), row("two@example.com"), row("three@example.com")]);
  ok("PF-4c DW1 fail: 3 rows with 2 seats left → 409 PLAN_LIMIT_REACHED, removeCount 1, afterInvites = limit + 1; no invitation, audit line or email",
    over.status === 409 && over.body.code === "PLAN_LIMIT_REACHED" && over.body.removeCount === 1 && over.body.afterInvites === limit() + 1 && over.body.seatsLimit === limit()
    && /of \d+ seats after these invites/.test(over.body.detail) && /Remove 1 person or upgrade/.test(over.body.detail) && nothingChanged(before), over.body);
  seatsLeft(3);
  before = snap();
  const fits = await batch([row("one@example.com", ["CASE_OFFICER"], "Ana Silva"), row("two@example.com", ["READ_ONLY"]), row("three@example.com", ["CASE_OFFICER", "READ_ONLY"])]);
  const fitEmails = mail.sent.slice(before.m);
  ok("PF-4c DW1 pass: 3 rows with 3 seats left → 201, 3 invitations, 3 audit lines, 3 emails (one per row, each to its person), the seat line full",
    fits.status === 201 && fits.body.invitations.length === 3 && invites() === before.i + 3 && auditLines() === before.a + 3 && fitEmails.length === 3
    && fitEmails.map((m) => m.to).join() === "one@example.com,two@example.com,three@example.com" && fits.body.invitations.every((i: any) => i.emailed === true && i.status === "PENDING")
    && fits.body.seatsUsed === fits.body.seatsLimit && fits.body.seatsLimit === limit(), fits.body);
  ok("PF-4c DW1 pass: no token in the answer; each invitation keeps its own roles", !/token/i.test(JSON.stringify(fits.body)) && fits.body.invitations[2]?.roles.join() === "CASE_OFFICER,READ_ONLY", fits.body);
  ok("PF-4c pass: the greeting names the person (\"Hello Ana Silva,\") and the name is stored nowhere (no invitation or audit line holds it)",
    /^Hello Ana Silva,\n/.test(fitEmails[0]?.text ?? "") && !/Hello/.test(fitEmails[1]?.text ?? "")
    && sql(`select count(*) from platform_invitation i where i::text like '%Ana Silva%'`) === "0" && sql(`select count(*) from audit_event a where a::text like '%Ana Silva%'`) === "0", fitEmails[0]?.text);

  // ------------------------------------------------------------------------------- DW2: duplicates and existing people
  seatsLeft(10);
  const staffEmail = sql(`select email from platform_staff where id = '${O}'`);
  await batch([row("pending.person@example.com")]);
  before = snap();
  const dups = await batch([row("dup@example.com"), row("Dup@Example.COM"), row(staffEmail.toUpperCase()), row("PENDING.person@example.com"), row("clean@example.com")]);
  ok("PF-4c DW2 fail: the same email twice (other letter case) → the second row DUPLICATE_IN_FORM; a staff email → ALREADY_STAFF; an invited one → ALREADY_INVITED; 422 ROWS_FLAGGED, nothing sent",
    dups.status === 422 && dups.body.code === "ROWS_FLAGGED" && flagsOf(dups.body, 1).length === 0 && flagsOf(dups.body, 2).join() === "DUPLICATE_IN_FORM"
    && flagsOf(dups.body, 3).join() === "ALREADY_STAFF" && flagsOf(dups.body, 4).join() === "ALREADY_INVITED" && flagsOf(dups.body, 5).length === 0 && dups.body.rows.length === 5 && nothingChanged(before), dups.body);
  const spaced = await batch([row("dup@example.com"), row(" dup@example.com"), row("dup@example.com​")]);
  ok("PF-4c fail (reviewer's point): a space or an invisible character never hides a duplicate — those rows are flagged INVALID_EMAIL, nothing sent",
    spaced.status === 422 && flagsOf(spaced.body, 2).join() === "INVALID_EMAIL" && flagsOf(spaced.body, 3).join() === "INVALID_EMAIL" && nothingChanged(before), spaced.body);
  const clean = await batch([row("dup@example.com"), row("clean@example.com")]);
  ok("PF-4c DW2 pass: the same form without the flagged rows → all sent (2 invitations)", clean.status === 201 && clean.body.invitations.length === 2 && invites() === before.i + 2, clean.body);

  // --------------------------------------------------------------------------- DW3: two at once never pass the limit
  seatsLeft(3);
  const [b1, b2] = await Promise.all([batch([row("race.a1@example.com"), row("race.a2@example.com")]), batch([row("race.b1@example.com"), row("race.b2@example.com")])]);
  ok("PF-4c DW3: two batches of 2 at once with 3 seats left → exactly one 201, the other 409 PLAN_LIMIT_REACHED; the seats never pass the limit",
    [b1.status, b2.status].sort().join() === "201,409" && [b1, b2].some((b) => b.body.code === "PLAN_LIMIT_REACHED") && used() <= limit() && used() === limit() - 1, [b1.status, b2.status, used(), limit()]);
  seatsLeft(2);
  const [b3, single] = await Promise.all([batch([row("race.c1@example.com"), row("race.c2@example.com")]), call(base, "POST", "/api/platform/staff/invitations", { token: tR, body: { email: "race.single@example.com", roles: ["CASE_OFFICER"] } })]);
  ok("PF-4c DW3: a batch of 2 and a single invite at once with 2 seats left → exactly one goes through; the seats never pass the limit",
    [b3.status, single.status].filter((s) => s === 201).length === 1 && [b3.status, single.status].includes(409) && used() <= limit(), [b3.status, single.status, used(), limit()]);

  // --------------------------------------------------------------- DW4: Owner rows, roles beyond keys, bad emails, counts
  seatsLeft(10);
  // user-O becomes an Admin only (an Owner gives it), so it holds staff:manage but not every role's keys.
  const toAdmin = await call(base, "PATCH", `/api/platform/staff/${O}/roles`, { token: tR, body: { roles: ["ADMIN"], reason: "batch check" } });
  const tAdmin = await signIn("user-O");
  const beyond = sql(`select r.role from (select distinct role from platform_role_permission where role <> 'OWNER') r where exists (select 1 from platform_role_permission k where k.role = r.role
    and k.permission_key not in (select permission_key from platform_role_permission where role = 'ADMIN')) order by r.role limit 1`);
  ok("setup: user-O is an Admin, and a starter role holds a key an Admin lacks", toAdmin.status === 200 && !!beyond && !!tAdmin, { toAdmin: toAdmin.body, beyond });
  before = snap();
  const mixed = await batch([row("owner.row@example.com", ["OWNER"]), row("beyond@example.com", [beyond]), row("not-an-email"), row("fine@example.com", ["READ_ONLY"]), row("badrole@example.com", ["CHIEF"]), row("named@example.com", ["READ_ONLY"], "Line\nBreak")], tAdmin);
  ok("PF-4c DW4 fail: an Owner row → OWNER_BY_SINGLE_INVITE, a role beyond the inviter's keys → ROLE_BEYOND_OWN_KEYS, a malformed email → INVALID_EMAIL, an unknown role → INVALID_ROLES, a name with a line break → INVALID_NAME; every flag listed at once, nothing sent",
    mixed.status === 422 && flagsOf(mixed.body, 1).includes("OWNER_BY_SINGLE_INVITE") && flagsOf(mixed.body, 2).join() === "ROLE_BEYOND_OWN_KEYS" && flagsOf(mixed.body, 3).join() === "INVALID_EMAIL"
    && flagsOf(mixed.body, 4).length === 0 && flagsOf(mixed.body, 5).join() === "INVALID_ROLES" && flagsOf(mixed.body, 6).join() === "INVALID_NAME" && nothingChanged(before), mixed.body);
  const ownerByOwner = await batch([row("owner.row@example.com", ["OWNER"])]);
  ok("PF-4c DW4 fail: no Owner in a batch, even from an Owner (OWNER_BY_SINGLE_INVITE), nothing sent", ownerByOwner.status === 422 && flagsOf(ownerByOwner.body, 1).join() === "OWNER_BY_SINGLE_INVITE" && nothingChanged(before), ownerByOwner.body);
  const ownerSingle = await call(base, "POST", "/api/platform/staff/invitations", { token: tR, body: { email: "owner.single@example.com", roles: ["OWNER"], reason: "a second Owner for cover" } });
  ok("PF-4c DW4 pass: the single invite of an Owner by an Owner, with a reason, still answers 201 as on main", ownerSingle.status === 201, ownerSingle.body);
  const counts = await Promise.all([batch([]), batch(Array.from({ length: 21 }, (_, i) => row(`many${i}@example.com`))), batch("rows"), call(base, "POST", "/api/platform/staff/invitations/batch", { token: tR, body: {} })]);
  ok("PF-4c DW4 fail: 0 rows, 21 rows, rows not a list or missing → 422 ROWS_COUNT", counts.every((c) => c.status === 422 && c.body.code === "ROWS_COUNT"), counts.map((c) => [c.status, c.body.code]));
  seatsLeft(20);
  const twenty = await batch(Array.from({ length: 20 }, (_, i) => row(`many${i}@example.com`)));
  ok("PF-4c DW4 pass: 20 rows (the most) with the seats → 201, 20 invitations", twenty.status === 201 && twenty.body.invitations.length === 20, twenty.status);
  await call(base, "PATCH", `/api/platform/staff/${O}/roles`, { token: tR, body: { roles: ["READ_ONLY"], reason: "batch check" } });
  const tRO = await signIn("user-O");
  const readOnly = await batch([row("nokey@example.com")], tRO);
  ok("PF-4c fail: a person without agent/staff:manage (Read-only) → 403 MISSING_PERMISSION, nothing sent", readOnly.status === 403 && readOnly.body.code === "MISSING_PERMISSION" && sql(`select count(*) from platform_invitation where email = 'nokey@example.com'`) === "0", readOnly.body);
  const unsigned = await call(base, "POST", "/api/platform/staff/invitations/batch", { body: { rows: [row("x@example.com")] } });
  ok("PF-4c fail: no session → 401", unsigned.status === 401, unsigned.status);

  // ---------------------------------------------------------------------------- DW5: one transaction, email after it
  seatsLeft(10);
  sql(`create function pf4c_boom() returns trigger language plpgsql as $$ begin if new.email = 'boom@example.com' then raise exception 'PF-4c DW5 forced insert failure'; end if; return new; end $$`);
  sql(`create trigger pf4c_boom before insert on platform_invitation for each row execute function pf4c_boom()`);
  before = snap();
  const boom = await batch([row("first.ok@example.com"), row("second.ok@example.com"), row("boom@example.com")]);
  ok("PF-4c DW5: a forced failure on the third row's insert → an error, and no invitation, audit line or email of the batch exists",
    boom.status >= 500 && nothingChanged(before) && sql(`select count(*) from platform_invitation where email in ('first.ok@example.com', 'second.ok@example.com')`) === "0", { status: boom.status, after: snap(), before });
  sql(`drop trigger pf4c_boom on platform_invitation`);
  before = snap();
  const mailFail = await batch([row("first.ok@example.com"), row("mail.fails@example.com"), row("second.ok@example.com")]);
  const failedId = mailFail.body.invitations?.find((i: any) => i.email === "mail.fails@example.com")?.id;
  ok("PF-4c DW5: a failed email on one row → that row emailed: false, the others true, its invitation pending (all 3 made)",
    mailFail.status === 201 && mailFail.body.invitations.map((i: any) => i.emailed).join() === "true,false,true" && invites() === before.i + 3
    && sql(`select (accepted_at is null and revoked_at is null and expires_at > now())::text from platform_invitation where id = '${failedId}'`) === "true", mailFail.body);
} finally {
  await app?.close().catch(() => {});
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
