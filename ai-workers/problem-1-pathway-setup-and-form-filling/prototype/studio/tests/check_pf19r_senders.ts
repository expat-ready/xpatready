// PF-19r part 1 (gap G4, QA-495; Release 1 rows R1.47 one email layout, R1.49 the gate on every path): staff and system
// mail through MessagePort. The staff invitation and the two-step reset notice (MAIL_PORT, now the app's MESSAGES_MAIL),
// the identity provider's code emails (handleCustomEmail over the same MailPort) and the complaint acknowledgement
// reminder (the complaints feature's ports). Named tests DW1-DW6 from the brief, each with a pass and a fail; DW7 (part 3):
// sign-up's "You already have an account" on the app's MESSAGES_MAIL (moved by PF-5v part 2; DW7 proves it through MessagePort). A scratch
// database with every migration and the Sample firms; a Nest app of the identity classes with the app's own MAIL_PORT and
// MESSAGES_MAIL providers (from their feature files), MessagePort on fakeJobs and a test clock, files in a scratch
// folder, the local email adapter. No model call, nothing leaves the machine (US$0). The database and folder are removed.
//   tsx studio/tests/check_pf19r_senders.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), API = join(STUDIO, "api", "src");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf19r_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`, WORK = join(STUDIO, "var", `pf19r-check-${process.pid}`);
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const rejects = async (f: () => unknown) => { try { await f(); return null; } catch (e) { return e instanceof Error ? e : new Error(String(e)); } };
type Res = { status: number; body: any };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}): Promise<Res> => {
  const r = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) }, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = URL;
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED"]) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";   // PF-24w: required, no default (features/platform-messages.ts reads the loader at import)

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { IDENTITY_ADMIN_PORT, LocalIdentityAdmin } = await import("../api/src/platform/identity/session/provider.ts");
const { MAIL_PORT, LocalMail } = await import("../api/src/platform/identity/session/mail.ts");
const { PlatformSession } = await import("../api/src/platform/identity/session/service.ts");
const { PlatformSessionController, PublicInvitationController } = await import("../api/src/platform/identity/session/routes.ts");
const { handleCustomEmail } = await import("../api/src/platform/identity/session/email-sender.ts");
const { StaffReads } = await import("../api/src/platform/staff-read/service.ts");
const { StaffReadController } = await import("../api/src/platform/staff-read/routes.ts");
const { LocalFiles } = await import("../api/src/front-office/files.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { ConsentStore } = await import("../api/src/platform/messages/consent/consent-store.ts");
const { localEmail } = await import("../api/src/platform/messages/channels/email/local.ts");
const { PlatformInbox } = await import("../api/src/platform/messages/demo-inbox.ts");
const { channelsOf } = await import("../api/src/platform/messages/send/channels.ts");
const { MessagesMail } = await import("../api/src/platform/messages/send/mail.ts");
const { Messages } = await import("../api/src/platform/messages/send/messages.ts");
const { ComplaintsService } = await import("../api/src/platform/complaints/complaints.ts");
const messagesFeature = (await import("../api/src/features/platform-messages.ts")).default, { MESSAGE_PORT, MESSAGES_MAIL } = await import("../api/src/features/platform-messages.ts");
const staffFeature = (await import("../api/src/features/platform-staff-read.ts")).default;
const complaintsFeature = await import("../api/src/features/platform-complaints.ts");
const { fakeAlerts } = await import("../ports/alert.ts");
const { FakeClock } = await import("../ports/clock.ts");
const { fakeJobs } = await import("../ports/jobs.ts");
const { HELD_DAILY_LIMIT } = await import("../ports/messages.ts");

type P = { provide?: unknown; useExisting?: unknown; useFactory?: unknown; inject?: unknown[] };
const providerOf = (f: { providers?: unknown[] }, token: unknown) => (f.providers as P[]).find((p) => p?.provide === token);

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const mclock = new FakeClock(new Date()), jobs = fakeJobs(mclock), alerts = fakeAlerts(), files = new LocalFiles(join(WORK, "files"));
const messages = new Messages({ db, consent: new ConsentStore(auditEvent, mclock), files, jobs, alerts: () => alerts, channels: channelsOf([["EMAIL", localEmail]]), clock: mclock });
await messages.register();
const inbox = new PlatformInbox(db as never, files, () => true);
const local = new LocalIdentity("pf19r-check-signing-key-0123456789abcdef", () => clock.now());
const admin = new LocalIdentityAdmin(() => clock.now());
const apps: { close(): Promise<void> }[] = [];

/** The identity classes on a Nest app; MAIL_PORT and MESSAGES_MAIL as the given providers (the app's own by default). */
async function appWith(mailProviders: unknown[]) {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: IDENTITY_ADMIN_PORT, useValue: admin }, { provide: MESSAGE_PORT, useValue: messages }, ...mailProviders, PlatformSession, StaffReads];
  @Module({ controllers: [PlatformIdentityController, PlatformSessionController, PublicInvitationController, StaffReadController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); apps.push(nest);
  return { nest, base: `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}` };
}

try {
  await seedSampleFirms(db);
  const firmA = await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } });
  const idOf = async (actorId: string) => (await db.platformStaff.findFirstOrThrow({ where: { actorId } })).id;
  const R = await idOf("user-R"), T = await idOf("user-T");
  const run = async () => { await jobs.runDue(); await jobs.runDue(); };
  const rowsTo = (address: string) => db.msgOutbox.findMany({ where: { address: address.toLowerCase() }, orderBy: { createdAt: "asc" } });

  // The app's own providers: MAIL_PORT as platform-staff-read binds it, MESSAGES_MAIL as platform-messages makes it.
  const mailBinding = providerOf(staffFeature, MAIL_PORT), messagesMail = providerOf(messagesFeature, MESSAGES_MAIL);
  ok("setup: platform-staff-read binds MAIL_PORT to the app's MESSAGES_MAIL (useExisting), not to LocalMail", mailBinding?.useExisting === MESSAGES_MAIL && mailBinding.useFactory === undefined, mailBinding);
  const { nest, base } = await appWith([mailBinding, messagesMail]);
  const signIn = async (actorId: string, firmKey = "sample-firm") => { const r = await call(base, "POST", "/api/platform/session/local", { body: { firmKey, actorId, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  let tR = await signIn("user-R");

  // ----------------------------------------------------------------------- DW1 an invitation through the one sending path
  const inv1 = await call(base, "POST", "/api/platform/staff/invitations", { token: tR, body: { email: "dw1.invitee@example.com", roles: ["CASE_OFFICER"] } });
  await run();
  const r1 = await rowsTo("dw1.invitee@example.com"), m1 = (await inbox.list("dw1.invitee@example.com", undefined)).messages[0];
  ok("DW1 pass: an invitation from the app's providers lands in msg_outbox (TRANSACTIONAL, SENT by the local adapter) with the one layout: the firm's name on top, the \"Sent by\" line, the firm's sender name and Reply-To",
    inv1.status === 201 && inv1.body.emailed === true && r1.length === 1 && r1[0].class === "TRANSACTIONAL" && r1[0].state === "SENT"
    && !!m1 && m1.html.includes(`>${firmA.operatingName}</p>`) && m1.html.includes('role="presentation"') && m1.html.includes(`Sent by ${firmA.operatingName}.`) && m1.from.startsWith(firmA.operatingName) && m1.reply_to === firmA.contactEmail && /\/invitation#t=[A-Za-z0-9_-]{43}/.test(m1.body), { inv1: inv1.body, r1, m1 });
  // Fail: today's main (LocalMail bound to MAIL_PORT) writes no outbox row.
  const legacy = new LocalMail(() => clock.now());
  const old = await appWith([{ provide: MAIL_PORT, useValue: legacy }]);
  const tOld = (await call(old.base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId: "user-R", secondStep: true } })).body.token;
  const inv1f = await call(old.base, "POST", "/api/platform/staff/invitations", { token: tOld, body: { email: "dw1.legacy@example.com", roles: ["CASE_OFFICER"] } });
  ok("DW1 fail: with LocalMail bound (main before PF-19r) the invitation is \"emailed\" into memory and no outbox row exists (no layout, no gate, no cap)",
    inv1f.status === 201 && legacy.inbox("dw1.legacy@example.com").length === 1 && (await rowsTo("dw1.legacy@example.com")).length === 0, inv1f.body);

  tR = await signIn("user-R");   // the sign-in on the old app ended this one (one session per person)
  const freeSeats = () => sql(`update platform_invitation set revoked_at = now() where revoked_at is null and accepted_at is null`);   // the Team plan's 5 seats
  freeSeats();

  // ----------------------------------------------------------------------- DW2 an invitation to a suppressed address
  await db.msgSuppression.create({ data: { firmId: firmA.id, channel: "EMAIL", address: "dw2.gone@example.com", reason: "HARD_BOUNCE", createdBy: "seed:pf19r" } });
  const inv2 = await call(base, "POST", "/api/platform/staff/invitations", { token: tR, body: { email: "DW2.Gone@example.com", roles: ["CASE_OFFICER"] } });
  await run();
  const r2 = await rowsTo("dw2.gone@example.com");
  ok("DW2 pass: an invitation to a suppressed address → SUPPRESSED, nothing sent, the invitation stays pending and the answer says it was not emailed",
    inv2.status === 201 && inv2.body.emailed === false && inv2.body.status === "PENDING" && r2.length === 1 && r2[0].state === "SUPPRESSED" && /HARD_BOUNCE/.test(r2[0].stateReason ?? "")
    && (await inbox.list("dw2.gone@example.com", undefined)).messages.length === 0 && sql(`select count(*) from platform_invitation where email = 'dw2.gone@example.com' and accepted_at is null and revoked_at is null`) === "1", { inv2: inv2.body, r2 });
  ok("DW2 fail: the same invitation to an address that is not suppressed is sent (DW1's address: SENT, in the inbox)", r1[0]?.state === "SENT" && !!m1);

  // ----------------------------------------------------------------------- DW3 the two-step reset notice
  const tEmail = sql(`select email from platform_staff where id = '${T}'`);
  await db.msgSuppression.create({ data: { firmId: firmA.id, channel: "EMAIL", address: tEmail, reason: "COMPLAINT", createdBy: "seed:pf19r" } });
  const resets = () => Number(sql(`select count(*) from audit_event where action = 'platform.staff.two_step_reset'`)), before3 = resets();
  const refused3 = await call(base, "POST", `/api/platform/staff/${T}/reset-two-step`, { token: tR });
  ok("DW3 fail: a notice the gate refuses (the person's address is suppressed) rolls the reset back: 409 NOTICE_NOT_SENT in words that say how to clear it (Lead B, question 4), no audit line, the provider not reset, no outbox row kept",
    refused3.status === 409 && refused3.body.code === "NOTICE_NOT_SENT" && /not reset/.test(refused3.body.detail ?? "") && /^Update this person's email address first/.test(refused3.body.detail ?? "") && resets() === before3
    && (await admin.twoStep({ staffId: T, subject: null, email: "" })).method === "TOTP" && (await rowsTo(tEmail)).length === 0, refused3.body);
  await db.msgSuppression.deleteMany({ where: { address: tEmail } });
  const reset3 = await call(base, "POST", `/api/platform/staff/${T}/reset-two-step`, { token: tR });
  await run();
  const r3 = await rowsTo(tEmail), m3 = (await inbox.list(tEmail, undefined)).messages[0];
  ok("DW3 pass: the two-step reset notice goes through MessagePort (outbox row TRANSACTIONAL for the STAFF person, SENT, with the layout) and the reset is done",
    reset3.status === 200 && reset3.body.notified === true && resets() === before3 + 1 && r3.length === 1 && r3[0].state === "SENT" && r3[0].subjectKind === "STAFF" && r3[0].subjectId === T
    && m3?.subject === "Your two-step sign-in was reset" && m3.html.includes(`Sent by ${firmA.operatingName}.`) && (await admin.twoStep({ staffId: T, subject: null, email: "" })).method === null, { b: reset3.body, r3 });

  // The identity provider's code emails over the same MailPort (sender 3: no deployed caller on main; see the PR).
  const appMail = nest.get(MESSAGES_MAIL) as InstanceType<typeof MessagesMail>;
  const code = await handleCustomEmail({ triggerSource: "CustomEmailSender_ForgotPassword", request: { code: "enc", userAttributes: { email: tEmail } } }, { decrypt: async () => "731942", mail: appMail, firmOf: async () => firmA.id });
  await run();
  const c3 = (await inbox.list(tEmail, undefined)).messages.find((m) => m.subject === "Reset your password");
  ok("DW3 pass (sender 3): the provider's code email through the app's MailPort is in the outbox with the layout", code.sent === true && !!c3 && c3.body.includes("731942") && c3.html.includes(`Sent by ${firmA.operatingName}.`), c3);
  await db.msgSuppression.create({ data: { firmId: firmA.id, channel: "EMAIL", address: "dw3.code.gone@example.com", reason: "HARD_BOUNCE", createdBy: "seed:pf19r" } });
  const codeRefused = await rejects(() => handleCustomEmail({ triggerSource: "CustomEmailSender_ForgotPassword", request: { code: "enc", userAttributes: { email: "dw3.code.gone@example.com" } } }, { decrypt: async () => "552211", mail: appMail, firmOf: async () => firmA.id }));
  ok("DW3 fail (sender 3): a code email to a suppressed address is refused (nothing sent) and the refusal never quotes the code", codeRefused?.name === "MessageRefused" && !codeRefused.message.includes("552211") && (await inbox.list("dw3.code.gone@example.com", undefined)).messages.length === 0, codeRefused?.message);

  // A reset as firm B's very first message, while another email of firm B is written at the same moment (break m1): the
  // reset makes the firm's messages row before it takes the firm's row lock, so neither waits on the other.
  const firmB = await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-solo" } });
  const noMsgFirm = sql(`select count(*) from msg_firm where firm_id = '${firmB.id}'`) === "0";
  const B2 = await db.platformStaff.create({ data: { firmId: firmB.id, email: "dw3.b.officer@example.com", displayName: "Sample Officer B", actorId: "pf19r-b2", status: "ACTIVE" } });
  await db.platformRoleGrant.create({ data: { firmId: firmB.id, staffId: B2.id, role: "CASE_OFFICER", grantedBy: "seed:pf19r" } });
  const tS = await signIn("user-S", "sample-solo");
  const [resetB, otherB] = await Promise.all([
    call(base, "POST", `/api/platform/staff/${B2.id}/reset-two-step`, { token: tS }),
    appMail.send({ firmId: firmB.id, to: "dw3.b.other@example.com", replyTo: "no-reply@expatready.example", class: "TRANSACTIONAL", subject: "Hello", text: "x" }).then(() => "sent", (e: Error) => e.message),
  ]);
  ok("DW3 pass (break m1): a reset as the firm's first message, with another of the firm's emails at the same moment: both go through, no lock wait or deadlock",
    noMsgFirm && resetB.status === 200 && otherB === "sent" && (await rowsTo("dw3.b.officer@example.com")).length === 1, { noMsgFirm, resetB: resetB.body, otherB });

  // ----------------------------------------------------------------------- DW4 the complaint acknowledgement reminder
  const ports = (complaintsFeature.runtimeComplaintPorts as (m: unknown) => { mail: unknown })(appMail);
  const cBinding = providerOf(complaintsFeature.default, complaintsFeature.COMPLAINT_PORTS);
  ok("setup: the complaints feature gives its service the app's MESSAGES_MAIL (no fakeMail)", ports.mail === appMail && cBinding?.inject?.length === 1 && cBinding.inject[0] === MESSAGES_MAIL, cBinding);
  const svc = new ComplaintsService({ db, jobs, ...(ports as never as object), audit: auditEvent, clock: mclock } as never);
  // A complaint is written with its RECEIVED event (the table's own check), as ComplaintsService.record writes it.
  const complaint = (handler: string) => db.$transaction(async (tx) => {
    const receivedAt = new Date(Date.now() - 864e5 * 5);
    const c = await tx.platComplaint.create({ data: { firmId: firmA.id, subjectKind: "OTHER_PERSON", complainantName: "Sample Complainant", receivedAt, channel: "EMAIL", category: "SERVICE", summary: "Sample", handlerStaffId: handler, acknowledgeBy: new Date(Date.now() - 864e5), recordedBy: `staff:${R}` } });
    await tx.platComplaintEvent.create({ data: { firmId: firmA.id, complaintId: c.id, kind: "RECEIVED", at: receivedAt, actor: `staff:${R}`, detail: {} } });
    return c.id;
  });
  const c4 = await complaint(T);
  const sent4 = await svc.runAckReminder({ firmId: firmA.id, complaintId: c4 });
  await run();
  const r4 = (await rowsTo(tEmail)).filter((r) => (r.idempotencyKey ?? "").includes(c4));
  ok("DW4 pass: the reminder reaches the handler through MessagePort: SERVICE for the STAFF person (the handler), SENT, one REMINDER_SENT event",
    sent4 === "sent" && r4.length === 1 && r4[0].class === "SERVICE" && r4[0].subjectKind === "STAFF" && r4[0].subjectId === T && r4[0].state === "SENT"
    && (await db.platComplaintEvent.count({ where: { complaintId: c4, kind: "REMINDER_SENT" } })) === 1, r4);
  const before4 = await db.msgOutbox.count();
  const blank = await rejects(() => appMail.send({ firmId: firmA.id, to: "dw4.blank@example.com", replyTo: firmA.contactEmail, class: "SERVICE", subject: "A complaint is waiting for its acknowledgement", text: "x" }));
  ok("DW4 fail: a reminder with no person is refused, never sent blank (no outbox row)", blank?.name === "MessageRefused" && (await db.msgOutbox.count()) === before4, blank?.message);
  await db.msgSuppression.create({ data: { firmId: firmA.id, channel: "EMAIL", address: tEmail, reason: "HARD_BOUNCE", createdBy: "seed:pf19r" } });
  const c4b = await complaint(T);
  const e4b = await rejects(() => svc.runAckReminder({ firmId: firmA.id, complaintId: c4b }));
  const r4b = await db.msgOutbox.findMany({ where: { idempotencyKey: { contains: c4b } } }), ev4b = await db.platComplaintEvent.findFirst({ where: { complaintId: c4b, kind: "REMINDER_SENT" } });
  ok("DW4 pass (break m3): a handler whose address is suppressed is skipped (nothing written for them) and the firm's Owners and Admins get it instead; the event counts only who was reached",
    e4b === null && !r4b.some((r) => r.subjectId === T) && r4b.length > 0 && r4b.every((r) => r.subjectId !== T && r.state === "QUEUED") && (ev4b?.detail as { sentTo?: string; recipients?: number })?.sentTo === "owners_admins"
    && (ev4b?.detail as { recipients?: number }).recipients === r4b.filter((r) => r.state === "QUEUED").length, { e: e4b?.message, r4b, ev4b });
  // Nobody reachable: every Owner and Admin and the firm's contact suppressed too → rolled back, the job tries again.
  const everyone = [...new Set([...(await db.platformStaff.findMany({ where: { firmId: firmA.id } })).map((x) => x.email), firmA.contactEmail.toLowerCase()])];
  await db.msgSuppression.createMany({ data: everyone.filter((x) => x !== tEmail).map((address) => ({ firmId: firmA.id, channel: "EMAIL" as const, address, reason: "HARD_BOUNCE" as const, createdBy: "seed:pf19r" })) });
  const c4n = await complaint(T);
  const e4n = await rejects(() => svc.runAckReminder({ firmId: firmA.id, complaintId: c4n }));
  ok("DW4 fail: a reminder nobody can be sent rolls back: no REMINDER_SENT event, no outbox row, the job tries again",
    e4n?.name === "MessageRefused" && (await db.platComplaintEvent.count({ where: { complaintId: c4n, kind: "REMINDER_SENT" } })) === 0 && (await db.msgOutbox.count({ where: { idempotencyKey: { contains: c4n } } })) === 0, e4n?.message);
  await db.msgSuppression.deleteMany({ where: { address: { in: everyone.filter((x) => x !== tEmail) } } });
  await db.msgSuppression.deleteMany({ where: { address: tEmail } });
  // The handler no longer active: each active Owner and Admin, each a SERVICE email for their own STAFF record.
  const c4c = await complaint(T);
  sql(`update platform_staff set status = 'SUSPENDED' where id = '${T}'`);
  await svc.runAckReminder({ firmId: firmA.id, complaintId: c4c });
  const r4c = await db.msgOutbox.findMany({ where: { idempotencyKey: { contains: c4c } } });
  const leads = await db.platformStaff.findMany({ where: { firmId: firmA.id, status: "ACTIVE", grants: { some: { role: { in: ["OWNER", "ADMIN"] }, endedAt: null } } }, select: { id: true, email: true } });
  ok("DW4 pass: with the handler not active, each active Owner and Admin gets it as SERVICE for their own STAFF record (never the handler's)",
    leads.length > 0 && r4c.length === leads.length && r4c.every((r) => r.class === "SERVICE" && r.subjectKind === "STAFF" && leads.some((l) => l.id === r.subjectId && l.email === r.address)), { r4c, leads });
  // Nobody active: the firm's contact address, which is the firm's and no person's, as TRANSACTIONAL (question on the PR).
  const c4d = await complaint(T);
  sql(`update platform_staff set status = 'SUSPENDED' where firm_id = '${firmA.id}' and id <> '${T}' and status = 'ACTIVE' returning id`);
  await svc.runAckReminder({ firmId: firmA.id, complaintId: c4d });
  const r4d = await db.msgOutbox.findMany({ where: { idempotencyKey: { contains: c4d } } });
  ok("DW4 pass: with no active handler, Owner or Admin, the firm's contact address gets it, TRANSACTIONAL with no person (never a reminder to nobody)",
    r4d.length === 1 && r4d[0].address === firmA.contactEmail.toLowerCase() && r4d[0].class === "TRANSACTIONAL" && r4d[0].subjectKind === null, r4d);
  sql(`update platform_staff set status = 'ACTIVE' where firm_id = '${firmA.id}' and status = 'SUSPENDED'`);
  await run();   // every email so far is sent before the day's count is set

  // ----------------------------------------------------------------------- DW5 the trial firm's daily cap
  await db.platformFirm.update({ where: { id: firmA.id }, data: { status: "TRIAL" } });
  const counted = () => sql(`select coalesce(max(sent), 0) from msg_send_counter where firm_id = '${firmA.id}'`);
  const sentSoFar = Number(counted());
  freeSeats();
  sql(`update msg_send_counter set sent = 49 where firm_id = '${firmA.id}'`);
  const b5 = await call(base, "POST", "/api/platform/staff/invitations/batch", { token: tR, body: { rows: [{ email: "dw5.fiftieth@example.com", roles: ["CASE_OFFICER"] }, { email: "dw5.fiftyfirst@example.com", roles: ["CASE_OFFICER"] }] } });
  await run();
  const f50 = (await rowsTo("dw5.fiftieth@example.com"))[0], f51 = (await rowsTo("dw5.fiftyfirst@example.com"))[0];
  ok("DW5 pass: on a trial firm the 50th email of the day is sent and the 51st is held: QUEUED with the reason \"daily limit\", nothing in the inbox, one alert",
    sentSoFar > 0 && b5.status === 200 && f50?.state === "SENT" && f51?.state === "QUEUED" && f51.stateReason === HELD_DAILY_LIMIT && (await inbox.list("dw5.fiftyfirst@example.com", undefined)).messages.length === 0 && alerts.raised.some((a) => a.kind === "send_cap_reached"), { b5: b5.body, f50, f51, alerts: alerts.raised });
  const held = await db.msgOutbox.findMany({ where: { firmId: firmA.id, state: "QUEUED", stateReason: HELD_DAILY_LIMIT }, select: { address: true } });
  const rowOf = (e: string) => (b5.body.invited ?? []).find((x: { email: string }) => x.email === e);
  ok("DW5 pass: the batch's answer reports the held row: heldRows [2], and row 2 says emailHeld \"daily limit\" (row 1 does not); the outbox holds exactly that one",
    held.length === 1 && held[0].address === "dw5.fiftyfirst@example.com" && JSON.stringify(b5.body.heldRows) === "[2]" && rowOf("dw5.fiftyfirst@example.com")?.emailHeld === HELD_DAILY_LIMIT && rowOf("dw5.fiftieth@example.com")?.emailHeld === undefined, { held, b5: b5.body });
  // The two-step reset notice at the cap (break M1): never left for tomorrow, so nothing is reset.
  const resetsAtCap = resets();
  const capped = await call(base, "POST", `/api/platform/staff/${T}/reset-two-step`, { token: tR });
  ok("DW5 fail (break M1): a two-step reset whose notice the daily limit would hold is refused in words (409 NOTICE_HELD_DAILY_LIMIT): no audit line, no outbox row kept",
    capped.status === 409 && capped.body.code === "NOTICE_HELD_DAILY_LIMIT" && /not reset/.test(capped.body.detail ?? "") && resets() === resetsAtCap && (await rowsTo(tEmail)).filter((r) => r.state === "QUEUED").length === 0, capped.body);
  const codeHeld = await handleCustomEmail({ triggerSource: "CustomEmailSender_ForgotPassword", request: { code: "enc", userAttributes: { email: tEmail } } }, { decrypt: async () => "118833", mail: appMail, firmOf: async () => firmA.id });
  ok("DW5 fail (break m5): a sign-in code the daily limit holds is not reported as sent", codeHeld.sent === false && /daily email limit/.test(codeHeld.reason ?? ""), codeHeld);
  await db.platformFirm.update({ where: { id: firmA.id }, data: { status: "ACTIVE" } });
  await run();
  // Fail: the same 51st email on an active firm (cap 2,000) is sent by the sweep that picks held rows up again.
  await mclock.advance({ minutes: 20 }); await run();
  ok("DW5 fail: on an active firm (cap 2,000) the same held email is not held: the sweep sends it", (await rowsTo("dw5.fiftyfirst@example.com"))[0]?.state === "SENT", await rowsTo("dw5.fiftyfirst@example.com"));

  // ----------------------------------------------------------------------- DW6 no feature binds the stand-ins
  const featureDir = join(API, "features"), offenders: string[] = [];
  for (const f of readdirSync(featureDir).filter((x) => x.endsWith(".ts"))) {
    const text = readFileSync(join(featureDir, f), "utf8");
    if (/\bLocalMail\b/.test(text)) offenders.push(`${f}: LocalMail`);
    if (/\bfakeMail\(/.test(text)) offenders.push(`${f}: fakeMail(`);
  }
  // The sign-up ports PF-5v part 2 owns (api/src/platform/firms/runtime-ports.ts) are outside features/ and not this row's.
  ok("DW6 pass: no file under api/src/features/ binds MAIL_PORT to LocalMail or uses fakeMail(", offenders.length === 0, offenders);
  const probe = "{ provide: MAIL_PORT, useFactory: () => new LocalMail(() => 0) }; runtimeComplaintPorts = () => ({ mail: fakeMail() })";
  ok("DW6 fail: the same scan finds both in main's old lines (the scan is not blind)", /\bLocalMail\b/.test(probe) && /\bfakeMail\(/.test(probe));

  // ----------------------------------------------------------------------- DW7 (part 3) sign-up's "already have an account"
  // The sign-up door's ports as the app builds them (features/platform-firms.ts: runtimeSignUpPorts with MESSAGES_MAIL),
  // on the app's MessagesMail; the form's time stamp on a test clock. A known staff email gets the email through MessagePort.
  const { runtimeSignUpPorts } = await import("../api/src/platform/firms/runtime-ports.ts");
  const { FirmSignUp, ACCEPTED } = await import("../api/src/platform/firms/signup.ts");
  const firmsFeature = (await import("../api/src/features/platform-firms.ts")).default as { providers: unknown[] };
  const { SIGNUP_PORTS } = await import("../api/src/platform/firms/routes.ts");
  const signupBinding = providerOf(firmsFeature, SIGNUP_PORTS) as P & { useFactory: (m: unknown) => ReturnType<typeof runtimeSignUpPorts> };
  const fclock = new FakeClock(new Date());
  // This scratch server has no identity provider set (notReady says so); the local stand-in and the fake billing stand in,
  // and the mail is the factory's own (the thing under test).
  const { LocalSignUp } = await import("../api/src/platform/firms/signup-identity.ts");
  const { fakeBilling } = await import("../ports/billing.ts");
  const built = signupBinding.useFactory(appMail);
  const door = () => new FirmSignUp(db, { ...built, notReady: null, identity: new LocalSignUp(() => fclock.now()), billing: fakeBilling(), clock: fclock, appUrl: "http://localhost:4400" });
  const form = async (d: InstanceType<typeof FirmSignUp>, email: string) => { const p = await d.plans(); await fclock.advance({ seconds: 30 }); return { email, password: "a long enough password 1", firmName: "Known Firm", countryCode: "CA", acceptedTerms: p.terms.map((t) => t.id), formStamp: p.formStamp }; };
  const ownerEmail = (await db.platformStaff.findFirstOrThrow({ where: { firmId: firmA.id, actorId: "user-O" } })).email;
  const firmCount = async () => (await db.msgSendCounter.aggregate({ where: { firmId: firmA.id }, _sum: { sent: true } }))._sum.sent ?? 0;
  const before7 = await firmCount();
  const d7 = door(), a7 = await d7.signUp(await form(d7, ownerEmail.toUpperCase()), "10.7.0.1"); await d7.settled(); await run();
  const r7 = await rowsTo(ownerEmail), m7 = (await inbox.list(ownerEmail, undefined)).messages.find((m: { subject: string }) => m.subject === "You already have an ExpatReady account");
  ok("DW7 pass: sign-up with a known staff email → \"You already have an account\" through MessagePort as a platform account email (review M1): one outbox row with no firm (PLATFORM_ACCOUNT, TRANSACTIONAL, SENT), the one layout from ExpatReady, and the firm's daily count unchanged",
    signupBinding.inject?.[0] === MESSAGES_MAIL && built.mail === appMail && a7.message === ACCEPTED && r7.length === 1 && r7[0].firmId === null && r7[0].audience === "PLATFORM_ACCOUNT" && r7[0].class === "TRANSACTIONAL" && r7[0].state === "SENT"
    && !!m7 && m7.html.includes(">ExpatReady</p>") && m7.html.includes('role="presentation"') && m7.html.includes("Sent by ExpatReady.") && !m7.html.includes(firmA.operatingName) && m7.body.includes("/account") && (await firmCount()) === before7, { a7, r7, m7, before7, after: await firmCount() });
  // Fail: the same email as the firm's (main's shape with firmId, which this PR's first commit sent) spends the firm's cap.
  await appMail.send({ firmId: firmA.id, to: "dw7.firm.shape@example.com", replyTo: "no-reply@expatready.com", subject: "You already have an ExpatReady account", text: "x", class: "TRANSACTIONAL" }); await run();
  ok("DW7 fail: the firm-shaped send (firmId) is counted against the firm's daily cap (the check above is not blind)", (await firmCount()) === before7 + 1, { before7, after: await firmCount() });
  await fclock.advance({ hours: 2 });   // past the 3-an-hour limit per address
  const a7s = await d7.signUp(await form(d7, "Nobody.Known@example.com"), "10.7.0.2"); await d7.settled(); await run();
  ok("DW7 fail: an email with no account gets no \"already\" email (this door's identity stand-in has no mail, so nothing at all), and the same answer",
    a7s.message === ACCEPTED && (await rowsTo("nobody.known@example.com")).length === 0, await rowsTo("nobody.known@example.com"));
} catch (e) {
  fail++; console.log(`FAIL  the check stopped: ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for the next run */ }
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\nPF-19r part 1: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
