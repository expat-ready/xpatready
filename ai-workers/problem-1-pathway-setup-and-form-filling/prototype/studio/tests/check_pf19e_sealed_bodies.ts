// PF-19e (AG-1-70; PF-19b part 2's held binding; amended 18 Nov for PF-19r's senders): every TRANSACTIONAL message body
// is stored sealed (SecretBoxPort, purpose "message-body"; the row's hash is of the sealed bytes), opened only by the
// send worker and the demo inbox; the platform's own account and security mail (invitation, two-step reset notice, the
// identity provider's codes) is not counted on the firm's daily cap, at most 5 an hour to one address (429 above it); a
// reset notice the gate refuses answers 409 in words with an audit line, never 500. Named tests DW1-DW5 from the brief,
// each a pass and a fail. A scratch database with every migration and the Sample firms; a Nest app of the identity
// classes with the app's own MAIL_PORT and MESSAGES_MAIL providers (from their feature files), MessagePort on fakeJobs, a
// real AES-GCM box on a test key ring, files in a scratch folder, the local email adapter. No model call, nothing leaves
// the machine (US$0). The database and folder are removed.
//   tsx studio/tests/check_pf19e_sealed_bodies.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { format } from "node:util";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf19e_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`, WORK = join(STUDIO, "var", `pf19e-check-${process.pid}`);
let pass = 0, fail = 0;
// DW5: every line this run logs is kept and scanned for a token or a code (the console is wrapped before any import).
const logged: string[] = [];
for (const k of ["log", "warn", "error", "info", "debug"] as const) { const orig = console[k].bind(console); console[k] = (...a: unknown[]) => { logged.push(format(...a)); orig(...a); }; }
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; process.stdout.write(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}\n`); };   // not console: DW5 scans the app's lines
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
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
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
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
const { fileKeyOf, Messages, PLATFORM_FILES_SPACE } = await import("../api/src/platform/messages/send/messages.ts");
const { MESSAGE_BODY_PURPOSE, bodyBoxOf, openStored, storedBytes } = await import("../api/src/platform/messages/send/sealed-body.ts");
const { aesGcmSecretBox } = await import("../api/src/platform/secret-box/aes-gcm.ts");
const { Secret } = await import("../api/src/platform/config/secret.ts");
const { asBypass, touchPlatform } = await import("../api/src/platform/firm-scope.ts");
const messagesFeature = (await import("../api/src/features/platform-messages.ts")).default, { MESSAGE_PORT, MESSAGES_MAIL } = await import("../api/src/features/platform-messages.ts");
const staffFeature = (await import("../api/src/features/platform-staff-read.ts")).default;
const { fakeAlerts } = await import("../ports/alert.ts");
const { FakeClock } = await import("../ports/clock.ts");
const { sha256Hex } = await import("../ports/files.ts");
const { fakeJobs } = await import("../ports/jobs.ts");
const { HELD_DAILY_LIMIT, SYSTEM_PER_ADDRESS_HOUR } = await import("../ports/messages.ts");
const { SecretRefused } = await import("../ports/secret-box.ts");
const { runContract } = await import("../ports/contracts/contract.ts");
const { secretBoxPortContract } = await import("../ports/contracts/secret-box-port.contract.ts");

type P = { provide?: unknown; useExisting?: unknown; useFactory?: unknown; inject?: unknown[] };
const providerOf = (f: { providers?: unknown[] }, token: unknown) => (f.providers as P[]).find((p) => p?.provide === token);

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const mclock = new FakeClock(new Date()), jobs = fakeJobs(mclock), alerts = fakeAlerts(), files = new LocalFiles(join(WORK, "files"));
const ring = (k: string) => ({ current: 1, keys: new Map([[1, new Secret("PLATFORM_SECRET_BOX_KEYS v1", k)]]) });
const key1 = randomBytes(32).toString("base64"), box = aesGcmSecretBox(ring(key1));
const messages = new Messages({ db, consent: new ConsentStore(auditEvent, mclock), files, jobs, alerts: () => alerts, channels: channelsOf([["EMAIL", localEmail]]), clock: mclock, box, log: (l) => console.warn(l) });
await messages.register();
const inbox = new PlatformInbox(db as never, files, () => true, undefined, box);
const local = new LocalIdentity("pf19e-check-signing-key-0123456789abcdef", () => clock.now());
const admin = new LocalIdentityAdmin(() => clock.now());
const apps: { close(): Promise<void> }[] = [];
const fileOf = async (firmId: string | null, id: string) => (await files.get(firmId ?? PLATFORM_FILES_SPACE, fileKeyOf(firmId, id)))!.bytes;
const textOf = (b: Uint8Array) => new TextDecoder().decode(b);

async function appWith(mailProviders: unknown[]) {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: IDENTITY_ADMIN_PORT, useValue: admin }, { provide: MESSAGE_PORT, useValue: messages }, ...mailProviders, PlatformSession, StaffReads];
  @Module({ controllers: [PlatformIdentityController, PlatformSessionController, PublicInvitationController, StaffReadController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); apps.push(nest);
  return { nest, base: `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}` };
}

try {
  // The shared SecretBoxPort contract on bodyBoxOf (the app's box for message bodies: a key ring's versions).
  const keysFor = [randomBytes(32).toString("base64"), randomBytes(32).toString("base64"), randomBytes(32).toString("base64")];
  await runContract(secretBoxPortContract, "bodyBoxOf", ({ current, held }) => bodyBoxOf({ environment: "test", secretBox: { current, keys: new Map(held.map((v) => [v, new Secret(`PLATFORM_SECRET_BOX_KEYS v${v}`, keysFor[v - 1])])) } }), ok);
  await seedSampleFirms(db);
  const firmA = await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } });
  const firmB = await db.platformFirm.findFirstOrThrow({ where: { id: { not: firmA.id } } });
  const idOf = async (actorId: string) => (await db.platformStaff.findFirstOrThrow({ where: { actorId } })).id;
  const R = await idOf("user-R"), T = await idOf("user-T");
  const run = async () => { await jobs.runDue(); await jobs.runDue(); };
  const rowsTo = (address: string) => db.msgOutbox.findMany({ where: { address: address.toLowerCase() }, orderBy: { createdAt: "asc" } });
  const audits = (action: string) => Number(sql(`select count(*) from audit_event where action = '${action}'`));
  const { base } = await appWith([providerOf(staffFeature, MAIL_PORT), providerOf(messagesFeature, MESSAGES_MAIL)]);
  const signIn = async (actorId: string) => { const r = await call(base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const tR = await signIn("user-R");
  const freeSeats = () => sql(`update platform_invitation set revoked_at = now() where revoked_at is null and accepted_at is null`);
  freeSeats();

  // ----------------------------------------------------------------------- DW1 an invitation, sealed
  const inv1 = await call(base, "POST", "/api/platform/staff/invitations", { token: tR, body: { email: "dw1.sealed@example.com", roles: ["CASE_OFFICER"] } });
  const [r1q] = await rowsTo("dw1.sealed@example.com"), f1 = await fileOf(firmA.id, r1q.id), s1 = textOf(f1);
  const sealed1 = JSON.parse(s1) as { sealed?: string; parts?: string[] };
  ok("PF-19e DW1 pass: the invitation's stored body holds no invitation#t= text (no link, no subject, no address): its parts are sealed (sb1), and the row's hash is of those sealed bytes",
    inv1.status === 201 && !s1.includes("invitation#t=") && !s1.includes("invited to join") && !s1.includes("dw1.sealed@") && sealed1.sealed === "msg-sealed-1" && (sealed1.parts ?? []).length > 0
    && sealed1.parts!.every((p) => /^sb1\.v1\./.test(p)) && r1q.renderedHash === await sha256Hex(f1), { inv1: inv1.body, s1: s1.slice(0, 200) });
  await run();
  const [r1] = await rowsTo("dw1.sealed@example.com"), m1 = (await inbox.list("dw1.sealed@example.com", undefined)).messages[0];
  ok("PF-19e DW1 pass: the worker opens and sends it (SENT by the local adapter) and the demo inbox shows the link", r1.state === "SENT" && /\/invitation#t=[A-Za-z0-9_-]{43}/.test(m1?.body ?? ""), { r1, m1 });
  const other = (() => { try { openStored(box, firmB.id, r1.id, "TRANSACTIONAL", f1); return "opened"; } catch (e) { return e instanceof SecretRefused ? e.code : String(e); } })();
  const otherRing = (() => { try { openStored(aesGcmSecretBox(ring(randomBytes(32).toString("base64"))), firmA.id, r1.id, "TRANSACTIONAL", f1); return "opened"; } catch (e) { return e instanceof SecretRefused ? e.code : String(e); } })();
  ok("PF-19e DW1 fail: another firm's key cannot open it, nor another server's key ring, nor another message's id (refused TAMPERED_OR_OTHER_OWNER)",
    other === "TAMPERED_OR_OTHER_OWNER" && otherRing === "TAMPERED_OR_OTHER_OWNER" && (() => { try { openStored(box, firmA.id, randomUUID(), "TRANSACTIONAL", f1); return false; } catch (e) { return e instanceof SecretRefused; } })(), { other, otherRing });
  // A plain body put in place of the sealed one, with its own hash (an edit of the store and the row): never sent.
  const inv1b = await call(base, "POST", "/api/platform/staff/invitations", { token: tR, body: { email: "dw1.plain@example.com", roles: ["CASE_OFFICER"] } });
  const [r1b] = await rowsTo("dw1.plain@example.com"), plain = new TextEncoder().encode(JSON.stringify(openStored(box, firmA.id, r1b.id, "TRANSACTIONAL", await fileOf(firmA.id, r1b.id))));
  writeFileSync(join(files.root, firmA.id, fileKeyOf(firmA.id, r1b.id)), plain);
  await db.msgOutbox.update({ where: { firmId_id: { firmId: firmA.id, id: r1b.id } }, data: { renderedHash: await sha256Hex(plain) } });
  await run();
  const [r1bAfter] = await rowsTo("dw1.plain@example.com");
  ok("PF-19e DW1 fail: a transactional body stored unsealed (with a matching hash) is never sent: FAILED \"content changed\", nothing in the inbox",
    inv1b.status === 201 && r1bAfter.state === "FAILED" && r1bAfter.stateReason === "content changed" && (await inbox.list("dw1.plain@example.com", undefined)).messages.length === 0, r1bAfter);
  freeSeats();

  // ----------------------------------------------------------------------- DW2 only TRANSACTIONAL is sealed
  const send = (cls: "TRANSACTIONAL" | "MARKETING", address: string, extra: Record<string, unknown> = {}) => db.$transaction((tx) => messages.send(tx, { firmId: firmA.id, channel: "EMAIL", class: cls, address,
    content: { subject: `DW2 ${cls}`, text: `Body words for ${cls}.` }, idempotencyKey: `pf19e-dw2-${cls}-${randomUUID()}`, ...extra } as never));
  // (No consent: the marketing row is SUPPRESSED, but its file is written before the row, as every message's.)
  const rEmail = sql(`select email from platform_staff where id = '${R}'`);
  const mk = await send("MARKETING", rEmail, { person: { kind: "STAFF", id: R } }).catch((e: Error) => ({ outboxId: "", error: e.message }));
  const tr = await send("TRANSACTIONAL", "dw2.receipt@example.com");
  const fm = mk.outboxId ? textOf(await fileOf(firmA.id, mk.outboxId)) : "", ft = textOf(await fileOf(firmA.id, tr.outboxId));
  ok("PF-19e DW2 pass: a marketing body is stored as before (its JSON, words readable; this one SUPPRESSED, no consent)", !!mk.outboxId && fm.includes("Body words for MARKETING.") && JSON.parse(fm).outboxId === mk.outboxId, { mk, fm: fm.slice(0, 120) });
  ok("PF-19e DW2 fail: a TRANSACTIONAL body (a receipt, not the platform's own mail) is never stored unsealed: no words in its file",
    !ft.includes("Body words for TRANSACTIONAL.") && JSON.parse(ft).sealed === "msg-sealed-1" && storedBytes(box, { ...JSON.parse(fm), class: "TRANSACTIONAL" }).byteLength > 0, ft.slice(0, 120));
  // The platform's own key for PF-19p's platform account messages (no firm).
  const pa = await asBypass("platform.account.mail", () => db.$transaction(async (tx) => { await touchPlatform(tx); return messages.send(tx, { platformAccount: true, channel: "EMAIL", class: "TRANSACTIONAL", address: "dw2.account@example.com", content: { subject: "Confirm your email", text: "Your code is 551177." }, idempotencyKey: `pf19e-dw2-pa-${randomUUID()}` }); }));
  const fp = await fileOf(null, pa.outboxId);
  ok("PF-19e DW2 pass: a platform account message (no firm) is sealed under the platform's own key: no code in its file, opens only as the platform's",
    !textOf(fp).includes("551177") && openStored(box, null, pa.outboxId, "TRANSACTIONAL", fp).text.includes("551177")
    && (() => { try { openStored(box, firmA.id, pa.outboxId, "TRANSACTIONAL", fp); return false; } catch (e) { return e instanceof SecretRefused; } })(), textOf(fp).slice(0, 120));
  const elsewhere = bodyBoxOf({ environment: "test", secretBox: null });
  ok("PF-19e DW2 fail: a server outside local with no key ring refuses to seal (NOT_CONFIGURED), so a transactional body is never stored unsealed there",
    (() => { try { elsewhere.seal({ firmId: firmA.id, purpose: MESSAGE_BODY_PURPOSE }, "x"); return false; } catch (e) { return e instanceof SecretRefused && e.code === "NOT_CONFIGURED"; } })());

  // ----------------------------------------------------------------------- DW4 a reset notice to a suppressed address
  const tEmail = sql(`select email from platform_staff where id = '${T}'`);
  await db.msgSuppression.create({ data: { firmId: firmA.id, channel: "EMAIL", address: tEmail, reason: "HARD_BOUNCE", createdBy: "seed:pf19e" } });
  const notSent0 = audits("platform.staff.notice_not_sent"), resets0 = audits("platform.staff.two_step_reset");
  const refused = await call(base, "POST", `/api/platform/staff/${T}/reset-two-step`, { token: tR });
  ok("PF-19e DW4 pass: a reset to a suppressed address → 409 NOTICE_NOT_SENT in words, one platform.staff.notice_not_sent audit line (ids only), nothing reset, the address still suppressed",
    refused.status === 409 && refused.body.code === "NOTICE_NOT_SENT" && /not reset/.test(refused.body.detail ?? "") && audits("platform.staff.notice_not_sent") === notSent0 + 1 && audits("platform.staff.two_step_reset") === resets0
    && !sql(`select coalesce(string_agg(detail::text || summary, ''), '') from audit_event where action = 'platform.staff.notice_not_sent'`).includes(tEmail)
    && (await db.msgSuppression.count({ where: { address: tEmail } })) === 1 && (await rowsTo(tEmail)).length === 0, refused.body);
  await db.msgSuppression.deleteMany({ where: { address: tEmail } });
  const okReset = await call(base, "POST", `/api/platform/staff/${T}/reset-two-step`, { token: tR });
  ok("PF-19e DW4 fail: the same reset to an address that takes email → 200 (never 500), and no notice_not_sent line", okReset.status === 200 && audits("platform.staff.notice_not_sent") === notSent0 + 1, okReset.body);

  // ----------------------------------------------------------------------- DW4 an invitation to a suppressed address (break B2)
  await db.msgSuppression.create({ data: { firmId: firmA.id, channel: "EMAIL", address: "dw4.gone@example.com", reason: "HARD_BOUNCE", createdBy: "seed:pf19e" } });
  const invNot0 = audits("platform.invitation.not_sent");
  const inv4 = await call(base, "POST", "/api/platform/staff/invitations", { token: tR, body: { email: "dw4.gone@example.com", roles: ["CASE_OFFICER"] } });
  ok("PF-19e DW4 pass: an invitation to a suppressed address → 409 \"We couldn't send email to <address>. Ask your firm's Owner or Admin to check it.\", one platform.invitation.not_sent line, no invitation kept, the address still suppressed",
    inv4.status === 409 && inv4.body.code === "INVITATION_NOT_SENT" && inv4.body.detail === "We couldn't send email to dw4.gone@example.com. Ask your firm's Owner or Admin to check it."
    && audits("platform.invitation.not_sent") === invNot0 + 1 && sql(`select count(*) from platform_invitation where email = 'dw4.gone@example.com'`) === "0" && (await db.msgSuppression.count({ where: { address: "dw4.gone@example.com" } })) === 1, inv4.body);
  freeSeats();

  // ----------------------------------------------------------------------- DW3 the platform's own mail at the daily cap
  await messages.dispatch(firmA.id, [tr.outboxId]);   // DW2's receipt: counted, so the day's counter row exists
  await run();
  await db.platformFirm.update({ where: { id: firmA.id }, data: { status: "TRIAL" } });
  const day = sql(`select coalesce(max(day)::text, '') from msg_send_counter where firm_id = '${firmA.id}'`);
  sql(`update msg_send_counter set sent = 50 where firm_id = '${firmA.id}' and day = '${day}'`);
  freeSeats();
  const inv3 = await call(base, "POST", "/api/platform/staff/invitations", { token: tR, body: { email: "dw3.atcap@example.com", roles: ["CASE_OFFICER"] } });
  const reset3 = await call(base, "POST", `/api/platform/staff/${T}/reset-two-step`, { token: tR });
  const code3 = await handleCustomEmail({ triggerSource: "CustomEmailSender_ForgotPassword", request: { code: "enc", userAttributes: { email: tEmail } } }, { decrypt: async () => "118833", mail: new MessagesMail({ db, messages, files }), firmOf: async () => firmA.id });
  await run();
  const [i3] = await rowsTo("dw3.atcap@example.com"), tRows = await rowsTo(tEmail);
  ok("PF-19e DW3 pass: with the trial firm at its daily cap of 50, an invitation, a two-step reset and a sign-in code still send (SENT), and the day's count stays 50",
    inv3.status === 201 && inv3.body.emailHeld === undefined && reset3.status === 200 && code3.sent === true && i3?.state === "SENT" && tRows.length === 3 && tRows.every((r) => r.state === "SENT")
    && sql(`select sent from msg_send_counter where firm_id = '${firmA.id}' and day = '${day}'`) === "50", { inv3: inv3.body, reset3: reset3.body, code3, i3, tRows });
  // Amendment (review M3): a test per sender. The reset notice's and the code email's stored files hold none of their words.
  const tFiles = await Promise.all(tRows.map(async (r) => textOf(await fileOf(firmA.id, r.id))));
  ok("PF-19e DW1 pass (each sender): the two-step reset notice's and the sign-in code's stored files are sealed and hold no code or notice words",
    tFiles.length === 3 && tFiles.every((f) => JSON.parse(f).sealed === "msg-sealed-1" && !/118833|two-step sign-in was reset|reset your password/i.test(f)), tFiles.map((f) => f.slice(0, 80)));
  const staffMail = await new MessagesMail({ db, messages, files }).send({ firmId: firmA.id, to: "dw3.client@example.com", replyTo: firmA.contactEmail, class: "TRANSACTIONAL", subject: "Your receipt", text: "Receipt words." });
  await run();
  ok("PF-19e DW3 fail: a TRANSACTIONAL email that is not the platform's own (a receipt) is still held at the cap (QUEUED \"daily limit\")",
    staffMail.held === true && (await rowsTo("dw3.client@example.com"))[0]?.stateReason === HELD_DAILY_LIMIT, await rowsTo("dw3.client@example.com"));
  const more: number[] = [];
  for (let i = tRows.length; i < SYSTEM_PER_ADDRESS_HOUR; i++) more.push((await call(base, "POST", `/api/platform/staff/${T}/reset-two-step`, { token: tR })).status);
  const sixth = await call(base, "POST", `/api/platform/staff/${T}/reset-two-step`, { token: tR });
  ok(`PF-19e DW3 fail: the sixth account email in an hour to one address → 429 EMAIL_HOURLY_LIMIT in words, nothing reset, no row written`,
    more.every((s) => s === 200) && sixth.status === 429 && sixth.body.code === "EMAIL_HOURLY_LIMIT" && /not reset/.test(sixth.body.detail ?? "") && (await rowsTo(tEmail)).length === SYSTEM_PER_ADDRESS_HOUR, { more, sixth: sixth.body });
  // Break B1: an invitation over the hour's limit → 429, and Resend over it keeps the link that works.
  freeSeats();
  const inv6 = await call(base, "POST", "/api/platform/staff/invitations", { token: tR, body: { email: "dw3.storm@example.com", roles: ["CASE_OFFICER"] } });
  const resent: number[] = [];
  for (let i = 1; i < SYSTEM_PER_ADDRESS_HOUR; i++) resent.push((await call(base, "POST", `/api/platform/staff/invitations/${sql(`select id from platform_invitation where email = 'dw3.storm@example.com' and revoked_at is null`)}/resend`, { token: tR, body: {} })).status);
  const live = sql(`select id from platform_invitation where email = 'dw3.storm@example.com' and revoked_at is null`);
  const over = await call(base, "POST", `/api/platform/staff/invitations/${live}/resend`, { token: tR, body: {} });
  ok("PF-19e DW3 fail (break B1): a resend over the hour's limit → 429 EMAIL_HOURLY_LIMIT, and the last emailed link still works (not revoked)",
    inv6.status === 201 && resent.every((x) => x === 200 || x === 201) && over.status === 429 && over.body.code === "EMAIL_HOURLY_LIMIT" && sql(`select id from platform_invitation where email = 'dw3.storm@example.com' and revoked_at is null`) === live, { inv6: inv6.body, resent, over: over.body });
  const code6 = await handleCustomEmail({ triggerSource: "CustomEmailSender_ForgotPassword", request: { code: "enc", userAttributes: { email: tEmail } } }, { decrypt: async () => "118834", mail: new MessagesMail({ db, messages, files }), firmOf: async () => firmA.id });
  ok("PF-19e DW3 fail: a sign-in code over the hour's limit is not sent and says so", code6.sent === false && /an hour/.test(code6.reason ?? ""), code6);
  const forged = await db.$transaction((tx) => messages.send(tx, { firmId: firmA.id, channel: "EMAIL", class: "TRANSACTIONAL", address: "dw3.forged@example.com", content: { subject: "x", text: "y" }, idempotencyKey: "system:forged" })).then(() => "written", (e: Error) => e.name);
  ok("PF-19e DW3 fail: a caller cannot pass for the platform's own mail by its key (\"system:…\" refused)", forged === "MessageRefused", forged);
  await db.platformFirm.update({ where: { id: firmA.id }, data: { status: "ACTIVE" } });

  // ----------------------------------------------------------------------- DW5 no token in any log line
  const leaks = logged.filter((l) => /invitation#t=|118833|118834|551177/.test(l));
  const lines = sql(`select coalesce(string_agg(concat_ws(' ', summary, detail::text), ' '), '') from audit_event`)
    + sql(`select coalesce(string_agg(concat_ws(' ', state_reason, idempotency_key), ' '), '') from msg_outbox`) + sql(`select coalesce(string_agg(detail::text, ' '), '') from msg_event`);
  ok("PF-19e DW5 pass: no line this run logged, no audit line, outbox reason or message event holds an invitation token or a code (scanned)",
    leaks.length === 0 && !/invitation#t=|118833|118834|551177/.test(lines) && lines.length > 0, { leaks: leaks.slice(0, 3) });
  ok("PF-19e DW5 fail: the scan finds a token when one is logged (its own probe)", [`x invitation#t=${"a".repeat(43)}`].some((l) => /invitation#t=/.test(l)));
} catch (e) {
  fail++; console.log(`FAIL  the check stopped: ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for the next run */ }
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\nPF-19e: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
