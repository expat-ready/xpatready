// PF-6m2 (PF-6m's break F1 and F4; Lead B's brief rev 16.60): accepting an invitation checks the inviter again, and firm
// signup's first Owner writes the money-keys line. A pass and a fail per Done when line:
//   DW1 an Admin's Billing/Finance invitation, the Admin then deactivated → 410, nothing granted; the Admin active → accepted
//       with one money line · DW2 the Admin demoted to Case Manager after inviting → 410; an Owner's invitation, the Owner
//       still Owner → accepted · DW3 a new firm's signup writes one money line for the Owner, actor system:signup; a refused
//       signup writes none · DW4 a replayed accept still gives one winner and 410s for the rest (PF-4b's, PF-5's, PF-6b's and
//       PF-6m's suites are run unchanged beside this one).
// Plus the breaker's two: a deactivation racing the accept, and an inviter reactivated before the accept.
// A scratch database (every migration, the Sample firms) and a Nest app of PF-4's and PF-4b's classes with the local
// stand-ins and a test clock; the signup service with its fakes. No server, no browser, no model call (US$0). Dropped after.
//   tsx studio/tests/check_pf6m2_invite_recheck.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeBilling } from "../ports/billing.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf6m2_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}) => {
  const r = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) }, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};
const problemOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { const x = e as { getStatus?: () => number }; return { status: x.getStatus?.() ?? 0 }; } };

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
const { IDENTITY_ADMIN_PORT, LocalIdentityAdmin } = await import("../api/src/platform/identity/session/provider.ts");
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const { INVITER_REFUSED, PlatformSession } = await import("../api/src/platform/identity/session/service.ts");
const { PlatformSessionController, PublicInvitationController } = await import("../api/src/platform/identity/session/routes.ts");
const { moneyKeysOfRoles } = await import("../api/src/platform/identity/catalogue.ts");
const { MONEY_KEYS_GRANTED } = await import("../api/src/platform/identity/money-line.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { LocalSignUp } = await import("../api/src/platform/firms/signup-identity.ts");
const { ACCEPTED, FirmSignUp } = await import("../api/src/platform/firms/signup.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const local = new LocalIdentity("pf6m2-check-signing-key-0123456789abcdef", () => clock.now());
const admin = new LocalIdentityAdmin(() => clock.now());
const mail = fakeMail();

let app: { close(): Promise<void> } | null = null;
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: IDENTITY_ADMIN_PORT, useValue: admin }, { provide: MAIL_PORT, useValue: mail }, PlatformSession];
  @Module({ controllers: [PlatformIdentityController, PlatformSessionController, PublicInvitationController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;

  await seedSampleFirms(db);
  sql(`update platform_plan set seats_limit = 100`);   // seats are not this row's rule
  const R = sql(`select id from platform_staff where actor_id = 'user-R'`), O = sql(`select id from platform_staff where actor_id = 'user-O'`), T = sql(`select id from platform_staff where actor_id = 'user-T'`);
  const signIn = async (actorId: string) => { clock.t += 1000; return (await call(base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId, secondStep: true } })).body.token as string; };
  const tR = await signIn("user-R");   // the Owner
  const toAdmin = await call(base, "PATCH", `/api/platform/staff/${T}/roles`, { token: tR, body: { roles: ["ADMIN"] } });
  const oAdmin = await call(base, "PATCH", `/api/platform/staff/${O}/roles`, { token: tR, body: { roles: ["ADMIN"] } });
  ok("setup: the Owner makes T and O Admins", toAdmin.status === 200 && oAdmin.status === 200, { toAdmin: toAdmin.body, oAdmin: oAdmin.body });

  /** An invitation sent through the real door; its link is read from the fake mail (the token is never stored plainly). */
  const invite = async (token: string, email: string, roles: string[]) => {
    const r = await call(base, "POST", "/api/platform/staff/invitations", { token, body: { email, roles } });
    const link = mail.sent.filter((m) => m.to === email).at(-1)?.text ?? "";
    return { status: r.status, id: r.body?.id as string, token: /#t=([A-Za-z0-9_-]{43})/.exec(link)?.[1] ?? "" };
  };
  const accept = (token: string) => call(base, "POST", `/api/public/invitations/${token}/accept`);
  const moneyLines = (email: string) => Number(sql(`select count(*) from audit_event a join platform_staff s on s.id::text = a.entity_key where a.action = '${MONEY_KEYS_GRANTED}' and s.email = '${email}'`));
  const refusals = (invId: string) => JSON.parse(sql(`select coalesce(json_agg(json_build_object('actor', actor, 'detail', detail, 'summary', summary)), '[]') from audit_event where action = '${INVITER_REFUSED}' and entity_key = '${invId}'`)) as { actor: string; detail: Record<string, any>; summary: string }[];
  const nothingGranted = (email: string) => sql(`select count(*) from platform_staff where email = '${email}'`) === "0";
  const revoked = (invId: string) => sql(`select (revoked_at is not null and accepted_at is null)::text from platform_invitation where id = '${invId}'`) === "true";
  const bfMoney = await moneyKeysOfRoles(db as never, ["BILLING_FINANCE"]);

  // ------------------------------------------------------------------------------- DW1: the inviter deactivated
  let tT = await signIn("user-T");
  const live = await invite(tT, "bf.live@example.com", ["BILLING_FINANCE"]), gone = await invite(tT, "bf.gone@example.com", ["BILLING_FINANCE"]);
  const okLive = await accept(live.token);
  ok("PF-6m2 DW1 pass: an Admin's Billing/Finance invitation, the Admin still active → accepted, with one money line",
    live.status === 201 && okLive.status === 200 && moneyLines("bf.live@example.com") === 1 && refusals(live.id).length === 0, { live, okLive: okLive.body });
  const deact = await call(base, "POST", `/api/platform/staff/${T}/deactivate`, { token: tR, body: { reason: "left the firm" } });
  const goneAcc = await accept(gone.token), goneLine = refusals(gone.id);
  ok("PF-6m2 DW1 fail: the Admin deactivated after inviting → the accept answers 410 \"This invitation is no longer valid.\" and grants nothing",
    gone.status === 201 && deact.status === 200 && goneAcc.status === 410 && goneAcc.body.code === "INVITATION_NOT_VALID" && goneAcc.body.detail === "This invitation is no longer valid."
    && nothingGranted("bf.gone@example.com") && moneyLines("bf.gone@example.com") === 0, { deact: deact.body, goneAcc: goneAcc.body });
  ok("PF-6m2 DW1 fail: the invitation is marked no longer valid, with one platform.invitation.refused_inviter line naming the reason (inactive), no key names",
    revoked(gone.id) && goneLine.length === 1 && goneLine[0].detail.reason === "inactive" && goneLine[0].detail.invitedBy === `staff:${T}` && !JSON.stringify(goneLine[0]).includes("agent/"), goneLine);
  const again = await accept(gone.token);
  ok("PF-6m2 DW1 fail: a second try of the refused invitation is still 410 and writes no second refusal line", again.status === 410 && refusals(gone.id).length === 1, again.body);

  // ------------------------------------------------------- the breaker: the inviter reactivated before the accept
  const re = await call(base, "POST", `/api/platform/staff/${T}/reactivate`, { token: tR, body: { reason: "came back" } });
  tT = await signIn("user-T");
  const back = await invite(tT, "bf.back@example.com", ["BILLING_FINANCE"]);
  await call(base, "POST", `/api/platform/staff/${T}/deactivate`, { token: tR, body: { reason: "left again" } });
  await call(base, "POST", `/api/platform/staff/${T}/reactivate`, { token: tR, body: { reason: "back again" } });
  const backAcc = await accept(back.token);
  ok("PF-6m2 break pass: an inviter deactivated and reactivated before the accept is active again, so the invitation is accepted with its money line",
    re.status === 200 && back.status === 201 && backAcc.status === 200 && moneyLines("bf.back@example.com") === 1 && refusals(back.id).length === 0, { re: re.body, backAcc: backAcc.body });

  // --------------------------------------------------------------------------------- DW2: the inviter demoted
  const tO = await signIn("user-O");
  const demoted = await invite(tO, "bf.demoted@example.com", ["BILLING_FINANCE"]);
  const down = await call(base, "PATCH", `/api/platform/staff/${O}/roles`, { token: tR, body: { roles: ["CASE_MANAGER"] } });
  const demAcc = await accept(demoted.token), demLine = refusals(demoted.id);
  ok("PF-6m2 DW2 fail: the Admin demoted to Case Manager after inviting → 410, nothing granted, one refusal line (a Case Manager may no longer invite: break F1)",
    demoted.status === 201 && down.status === 200 && demAcc.status === 410 && demAcc.body.code === "INVITATION_NOT_VALID" && nothingGranted("bf.demoted@example.com") && revoked(demoted.id)
    && demLine.length === 1 && demLine[0].detail.reason === "may_no_longer_invite" && demLine[0].detail.invitedBy === `staff:${O}` && !JSON.stringify(demLine[0]).includes("agent/"), { down: down.body, demAcc: demAcc.body, demLine });
  // Break F1: even a role the demoted person still holds the keys of (Read-only) is refused: they lost the invite door's key.
  const upAgain = await call(base, "PATCH", `/api/platform/staff/${O}/roles`, { token: tR, body: { roles: ["ADMIN"] } });
  const roInv = await invite(await signIn("user-O"), "ro.demoted@example.com", ["READ_ONLY"]);
  const down2 = await call(base, "PATCH", `/api/platform/staff/${O}/roles`, { token: tR, body: { roles: ["CASE_MANAGER"] } });
  const roAcc = await accept(roInv.token), roLine = refusals(roInv.id);
  ok("PF-6m2 break F1 fail: an Admin's Read-only invitation, the Admin then demoted to Case Manager (no invite key) → 410 may_no_longer_invite, nothing granted",
    upAgain.status === 200 && roInv.status === 201 && down2.status === 200 && roAcc.status === 410 && nothingGranted("ro.demoted@example.com") && roLine.length === 1 && roLine[0].detail.reason === "may_no_longer_invite", { roAcc: roAcc.body, roLine });

  // Break F2 and F3: an invited_by that is no staff member of this firm (another firm's Owner, or a malformed value) → 410
  // with reason inviter_not_found, never a 500, and the line never copies the raw value.
  const FIRM_A = sql(`select firm_id from platform_staff where id = '${R}'`), otherOwner = sql(`select s.id from platform_staff s join platform_role_grant g on g.staff_id = s.id and g.role = 'OWNER' and g.ended_at is null where s.firm_id <> '${FIRM_A}' and s.status = 'ACTIVE' limit 1`);
  const raw = async (email: string, invitedBy: string) => { const { randomBytes, createHash } = await import("node:crypto"); const token = randomBytes(32).toString("base64url");
    const id = sql(`insert into platform_invitation (id, firm_id, email, roles, token_hash, invited_by, created_at, expires_at) values (gen_random_uuid(), '${FIRM_A}', '${email}', '{READ_ONLY}', '${createHash("sha256").update(token).digest("hex")}', '${invitedBy}', now(), now() + interval '72 hours') returning id`); return { id, token }; };
  for (const [email, by, what] of [["x.firm@example.com", `staff:${otherOwner}`, "another firm's active Owner"], ["x.mail@example.com", "someone@example.com", "an email"], ["x.long@example.com", `staff:${"z".repeat(240)}`, "a 246-character value"]] as const) {
    const r = await raw(email, by), a = await accept(r.token), line = refusals(r.id);
    ok(`PF-6m2 break F2/F3 fail: invited_by is ${what} → 410 (never 500), nothing granted, one line with reason inviter_not_found and no raw invited_by`,
      (what !== "another firm's active Owner" || otherOwner !== "") && a.status === 410 && nothingGranted(email) && revoked(r.id) && line.length === 1 && line[0].detail.reason === "inviter_not_found" && !("invitedBy" in line[0].detail) && !JSON.stringify(line[0]).includes("@"), { a: a.body, line });
  }
  const own = await invite(tR, "bf.owner@example.com", ["BILLING_FINANCE"]), ownAcc = await accept(own.token);
  ok("PF-6m2 DW2 pass: an Owner's invitation, the Owner still Owner → accepted, with one money line by the Owner",
    own.status === 201 && ownAcc.status === 200 && moneyLines("bf.owner@example.com") === 1 && sql(`select actor from audit_event where action = '${MONEY_KEYS_GRANTED}' and entity_key = '${ownAcc.body.staffId}'`) === `staff:${R}`, ownAcc.body);
  const coOk = await accept((await invite(tR, "co.owner@example.com", ["CASE_OFFICER", "READ_ONLY"])).token);
  ok("PF-6m2 DW2 pass: an Owner's two-role invitation is accepted (every key of every role held)", coOk.status === 200, coOk.body);

  // ------------------------------------------------- the breaker: a deactivation racing the accept (the firm's lock)
  tT = await signIn("user-T");
  const race = await invite(tT, "bf.race@example.com", ["BILLING_FINANCE"]);
  const [rAcc, rDeact] = await Promise.all([accept(race.token), call(base, "POST", `/api/platform/staff/${T}/deactivate`, { token: tR, body: { reason: "race" } })]);
  const accepted = rAcc.status === 200, refusedRace = rAcc.status === 410 && refusals(race.id).length === 1 && nothingGranted("bf.race@example.com");
  ok("PF-6m2 break pass: a deactivation racing the accept ends one way or the other (accepted before it, or refused after it), never both, never a 5xx",
    rDeact.status === 200 && (accepted ? refusals(race.id).length === 0 && moneyLines("bf.race@example.com") === 1 : refusedRace), { rAcc: rAcc.body, rDeact: rDeact.status });

  // ------------------------------------------------------------------------- DW4: a replayed accept, one winner
  await call(base, "POST", `/api/platform/staff/${T}/reactivate`, { token: tR, body: { reason: "back" } });
  tT = await signIn("user-T");
  const rep = await invite(tT, "bf.replay@example.com", ["BILLING_FINANCE"]);
  const replays = await Promise.all(Array.from({ length: 8 }, () => accept(rep.token)));
  ok("PF-6m2 DW4 pass: 8 parallel accepts of one invitation → one 200, the rest 410, one staff member and one money line",
    replays.filter((r) => r.status === 200).length === 1 && replays.filter((r) => r.status === 410).length === 7 && sql(`select count(*) from platform_staff where email = 'bf.replay@example.com'`) === "1" && moneyLines("bf.replay@example.com") === 1 && refusals(rep.id).length === 0, replays.map((r) => r.status));

  // ------------------------- the role no longer givable: an Owner's Owner invitation, the Owner then only an Admin
  const tR2 = await signIn("user-R");
  const tToOwner = await call(base, "PATCH", `/api/platform/staff/${T}/roles`, { token: tR2, body: { roles: ["OWNER"], reason: "a second Owner for cover" } });
  const ownerInv = await (async () => { const r = await call(base, "POST", "/api/platform/staff/invitations", { token: tR2, body: { email: "owner.invited@example.com", roles: ["OWNER"], reason: "a third Owner" } });
    return { status: r.status, id: r.body?.id as string, token: /#t=([A-Za-z0-9_-]{43})/.exec(mail.sent.filter((m) => m.to === "owner.invited@example.com").at(-1)?.text ?? "")?.[1] ?? "" }; })();
  const coInv = await invite(tR2, "co.stepdown@example.com", ["CASE_OFFICER"]);   // reviewer M1: a non-Owner role an Admin cannot give
  const rDown = await call(base, "PATCH", `/api/platform/staff/${R}/roles`, { token: await signIn("user-T"), body: { roles: ["ADMIN"], reason: "R steps back to Admin" } });
  const oAcc = await accept(ownerInv.token), oLine = refusals(ownerInv.id);
  ok("PF-6m2 DW2 fail: an Owner's invitation into Owner, the inviter then only an Admin (keeps the invite key) → 410 role_no_longer_givable naming OWNER",
    tToOwner.status === 200 && ownerInv.status === 201 && rDown.status === 200 && oAcc.status === 410 && nothingGranted("owner.invited@example.com") && oLine.length === 1 && oLine[0].detail.reason === "role_no_longer_givable" && oLine[0].detail.roles.join() === "OWNER",
    { tToOwner: tToOwner.body, ownerInv: ownerInv.status, rDown: rDown.body, oAcc: oAcc.body, oLine });
  const adminMissing = Number(sql(`select count(*) from platform_role_permission p where p.role = 'CASE_OFFICER' and p.permission_key not in (select permission_key from platform_role_permission where role = 'ADMIN')`));
  const coAcc = await accept(coInv.token), coLine = refusals(coInv.id);
  ok("PF-6m2 DW2 fail (BR-1's key rule): an Owner's Case Officer invitation, the inviter then only an Admin (who lacks some Case Officer keys) → 410 role_no_longer_givable naming CASE_OFFICER",
    adminMissing > 0 && coInv.status === 201 && coAcc.status === 410 && nothingGranted("co.stepdown@example.com") && coLine.length === 1 && coLine[0].detail.reason === "role_no_longer_givable" && coLine[0].detail.roles.join() === "CASE_OFFICER", { adminMissing, coAcc: coAcc.body, coLine });

  // --------------------------------------------------------------------------- DW3: firm signup's first Owner
  const fclock = new FakeClock(new Date()), identity = new LocalSignUp(() => fclock.now());
  let failAudit: string | null = null;
  const s = new FirmSignUp(db, { audit: { record: async (tx, e) => { if (failAudit && e.action === failAudit) throw new Error("forced audit failure"); await auditEvent.record(tx, e); } }, billing: fakeBilling({ prices: [] }), identity, mail: fakeMail({ clock: fclock }), clock: fclock, appUrl: "https://app.expatready.test" });
  const terms = (await s.plans()).terms.map((t) => t.id);
  const signUp = async (email: string) => {
    const p = await s.plans(); await fclock.advance({ seconds: 5 });
    const r = await s.signUp({ email, password: "correct horse battery staple 77", firmName: "Maple Immigration", countryCode: "CA", acceptedTerms: terms, formStamp: p.formStamp }, `10.9.0.${email.length}`); await s.settled();
    const link = identity.sent.filter((m) => m.to === email).at(-1)?.text ?? "";
    return { r, token: /token=([A-Za-z0-9_-]{43})/.exec(link)?.[1] ?? "", code: /code=(\d{6})/.exec(link)?.[1] ?? "" };
  };
  const ownerMoney = await moneyKeysOfRoles(db as never, ["OWNER"]);
  const lineOf = (email: string) => JSON.parse(sql(`select coalesce(json_agg(json_build_object('actor', a.actor, 'detail', a.detail)), '[]') from audit_event a join platform_staff s on s.id::text = a.entity_key where a.action = '${MONEY_KEYS_GRANTED}' and s.email = '${email}'`)) as { actor: string; detail: Record<string, any> }[];
  const up = await signUp("owner@maple.example.com"), made = await s.verify({ token: up.token, code: up.code }, "10.9.1.1"), upLines = lineOf("owner@maple.example.com");
  ok(`PF-6m2 DW3 pass: a new firm's signup writes one ${MONEY_KEYS_GRANTED} line for its Owner (${ownerMoney.length} money keys), actor system:signup`,
    up.r.message === ACCEPTED && made.status === "PROVISIONING" && upLines.length === 1 && upLines[0].actor === "system:signup" && upLines[0].detail.roles.join() === "OWNER"
    && upLines[0].detail.moneyKeys.join() === ownerMoney.join() && upLines[0].detail.staffId === made.ownerStaffId && upLines[0].detail.firmKey === made.firmKey, { made, upLines });
  const before = Number(sql(`select count(*) from audit_event where action = '${MONEY_KEYS_GRANTED}' and actor = 'system:signup'`));
  const bad = await signUp("wrong.code@maple.example.com"), wrong = await problemOf(() => s.verify({ token: bad.token, code: bad.code === "000000" ? "111111" : "000000" }, "10.9.1.2"));
  failAudit = "platform.terms.accepted";
  const rolled = await problemOf(() => s.verify({ token: bad.token, code: bad.code }, "10.9.1.3")); failAudit = null;
  ok("PF-6m2 DW3 fail: a refused signup (a wrong code, or a later step failing in the same transaction) writes no money line and makes no Owner",
    wrong?.status === 422 && rolled !== null && sql(`select count(*) from platform_staff where email = 'wrong.code@maple.example.com'`) === "0"
    && Number(sql(`select count(*) from audit_event where action = '${MONEY_KEYS_GRANTED}' and actor = 'system:signup'`)) === before, { wrong, rolled, before });
} finally {
  await app?.close().catch(() => {});
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
