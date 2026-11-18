// PF-19e (AG-1-70; Lead B brief rev 16.64): TRANSACTIONAL message bodies are stored sealed (SecretBoxPort, purpose
// "message-body"), and staff and system mail (invitations, two-step reset notices) goes through the one send path
// (MessagesMail with `system: true`, the app's MAIL_PORT): exempt from the firm's daily cap, at most 5 an hour to one
// address (Sample), a suppressed address → 409 with an audit line. Named tests DW1-DW5, each with a pass and a fail.
// A scratch database (every migration, the Sample firms), a Nest app of PF-4's and PF-4b's classes whose MAIL_PORT is the
// real MessagesMail over the real Messages (fakeJobs, the local email adapter, files in a scratch folder, a generated
// test key ring); every line the run writes is kept and scanned for invitation tokens. No server of the app, no browser,
// no model call, nothing leaves the machine (US$0). The database and folder are removed at the end.
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
import { fakeAlerts } from "../ports/alert.ts";
import { FakeClock } from "../ports/clock.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { MAIL_CONTRACT_FIRM, MAIL_CONTRACT_FIRM_B, mailPortContract } from "../ports/contracts/mail-port.contract.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { DAILY_CAP, HELD_DAILY_LIMIT } from "../ports/messages.ts";
import { SecretRefused } from "../ports/secret-box.ts";

// Every line this run writes, kept for DW5's token scan (still printed).
const written: string[] = [];
for (const s of [process.stdout, process.stderr]) {
  const w = s.write.bind(s);
  s.write = ((chunk: unknown, ...rest: unknown[]) => { written.push(String(chunk)); return (w as (...a: unknown[]) => boolean)(chunk, ...rest); }) as typeof s.write;
}

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf19e_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`, WORK = join(STUDIO, "var", `pf19e-check-${process.pid}`);
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}) => {
  const r = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) }, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};
const refusedWith = (f: () => unknown) => { try { f(); return null; } catch (e) { return e; } };

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
const { PlatformSession } = await import("../api/src/platform/identity/session/service.ts");
const { PlatformSessionController, PublicInvitationController } = await import("../api/src/platform/identity/session/routes.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { ConsentStore } = await import("../api/src/platform/messages/consent/consent-store.ts");
const { localEmail } = await import("../api/src/platform/messages/channels/email/local.ts");
const { PlatformInbox } = await import("../api/src/platform/messages/demo-inbox.ts");
const { channelsOf } = await import("../api/src/platform/messages/send/channels.ts");
const { MessagesMail } = await import("../api/src/platform/messages/send/mail.ts");
const { fileKeyOf, Messages, UNOPENED } = await import("../api/src/platform/messages/send/messages.ts");
const { BODY_PURPOSE, isSealedBody, openStoredBody } = await import("../api/src/platform/messages/send/body-seal.ts");
const { SYSTEM_PER_ADDRESS_HOUR, suppressedWords } = await import("../api/src/platform/messages/send/system-mail.ts");
const { aesGcmSecretBox } = await import("../api/src/platform/secret-box/aes-gcm.ts");
const { Secret } = await import("../api/src/platform/config/secret.ts");
const { LocalFiles } = await import("../api/src/front-office/files.ts");

const ring = (v = 1) => ({ current: v, keys: new Map([[v, new Secret(`pf19e test key v${v}`, randomBytes(32).toString("base64"))]]) });
const box = aesGcmSecretBox(ring()), otherKeyBox = aesGcmSecretBox(ring());
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const msgClock = new FakeClock(new Date()), jobs = fakeJobs(msgClock), alerts = fakeAlerts(), files = new LocalFiles(join(WORK, "files"));
const logs: string[] = [];
const consent = new ConsentStore(auditEvent, msgClock);
const messages = new Messages({ db, consent, files, jobs, alerts: () => alerts, channels: channelsOf([["EMAIL", localEmail]]), clock: msgClock, box, log: (l) => logs.push(l) });
await messages.register();
// The app's MAIL_PORT runs on the app's own walled pool (Db), as in the app: set once the Nest app is made (break M1's storm).
const mailDeps = { db: db as PrismaClient, messages, files, system: true, log: (l: string) => logs.push(l) };
const systemMail = new MessagesMail(mailDeps);
const inbox = new PlatformInbox(db as never, files, () => true, undefined, box);
const run = async () => { await jobs.runDue(); await jobs.runDue(); };

let app: { close(): Promise<void> } | null = null;
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: new LocalIdentity("pf19e-check-signing-key-0123456789abcdef", () => clock.now()) }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: IDENTITY_ADMIN_PORT, useValue: new LocalIdentityAdmin(() => clock.now()) }, { provide: MAIL_PORT, useValue: systemMail }, PlatformSession];
  @Module({ controllers: [PlatformIdentityController, PlatformSessionController, PublicInvitationController] as never[], providers: providers as never[] }) class TestApp {}
  // Nest's own error lines are written, so DW5 scans them too (review m4).
  const nest = await NestFactory.create(TestApp, { logger: ["error", "warn"] }); await nest.listen(0, "127.0.0.1"); app = nest;
  mailDeps.db = nest.get(Db);
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;

  await seedSampleFirms(db);
  sql(`update platform_plan set seats_limit = 100`);   // seats are not this row's rule
  const R = sql(`select id from platform_staff where actor_id = 'user-R'`), O = sql(`select id from platform_staff where actor_id = 'user-O'`);
  const FIRM = sql(`select firm_id from platform_staff where id = '${R}'`), OTHER = sql(`select id from platform_firm where id <> '${FIRM}' order by key limit 1`);
  const oEmail = sql(`select email from platform_staff where id = '${O}'`);
  const signIn = async (actorId: string) => { clock.t += 1000; return (await call(base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId, secondStep: true } })).body.token as string; };
  const tR = await signIn("user-R");   // the Owner
  const rowsTo = (address: string) => db.msgOutbox.findMany({ where: { address }, orderBy: { createdAt: "asc" } });
  const raw = async (firmId: string, id: string) => (await files.get(firmId, fileKeyOf(firmId, id)))!.bytes;

  // --------------------------------------------------- DW3 first: the firm at its trial cap of 50
  // The firm's first message is a reset sent while the reset holds the firm's row lock (its msg_firm row is made then).
  const reset0 = await call(base, "POST", `/api/platform/staff/${O}/reset-two-step`, { token: tR });
  ok("PF-19e DW3 pass: a firm's very first email, a two-step reset under the firm's row lock, is sent (no lock wait)", reset0.status === 200 && reset0.body.notified === true, reset0);
  sql(`update platform_firm set status = 'TRIAL' where id = '${FIRM}'`);
  for (const d of [-1, 0, 1]) sql(`insert into msg_send_counter (firm_id, day, sent, updated_at) values ('${FIRM}', (now() at time zone 'UTC')::date + ${d}, ${DAILY_CAP.TRIAL}, now()) on conflict (firm_id, day) do update set sent = ${DAILY_CAP.TRIAL}`);
  const reset1 = await call(base, "POST", `/api/platform/staff/${O}/reset-two-step`, { token: tR });
  const inv = await call(base, "POST", "/api/platform/staff/invitations", { token: tR, body: { email: "pf19e.invitee@example.com", roles: ["READ_ONLY"] } });
  await run();
  const [invRow] = await rowsTo("pf19e.invitee@example.com"), resetRows = await rowsTo(oEmail);
  const firmMsg = await new MessagesMail({ db, messages, files }).send({ firmId: FIRM, to: "pf19e.client@example.com", replyTo: "no-reply@example.com", subject: "Your receipt", text: "A receipt.", class: "TRANSACTIONAL" });
  await run();
  const firmRow = await db.msgOutbox.findUniqueOrThrow({ where: { id: firmMsg.messageId } });
  const counted = sql(`select max(sent) from msg_send_counter where firm_id = '${FIRM}'`);
  ok("PF-19e DW3 pass: with the firm at its daily cap of 50, an invitation and a two-step reset still send (SENT, not counted in the cap)",
    reset1.status === 200 && inv.status === 201 && inv.body.emailed === true && invRow?.state === "SENT" && resetRows.length === 2 && resetRows.every((r) => r.state === "SENT") && counted === String(DAILY_CAP.TRIAL), { reset1: reset1.body, inv: inv.body, invRow, resetRows, counted });
  ok("PF-19e DW3 fail: the firm's own TRANSACTIONAL email that day is held by the cap (QUEUED, \"daily limit\")", firmRow.state === "QUEUED" && firmRow.stateReason === HELD_DAILY_LIMIT, firmRow);

  // ----------------------------------------------------------------------------------------- DW1 the invitation's body
  const invBytes = await raw(FIRM, invRow.id), invText = new TextDecoder().decode(invBytes);
  const sealedParts = (JSON.parse(invText) as { parts?: string[] }).parts ?? [];
  ok("PF-19e DW1 pass: the invitation's stored body file holds no invitation#t= text (nor its subject or address), and its bytes are sealed (sb1 parts, purpose message-body)",
    !invText.includes("invitation#t=") && !invText.includes("invited to join") && !invText.includes("pf19e.invitee") && isSealedBody(invBytes) && sealedParts.length > 0 && sealedParts.every((p) => p.startsWith("sb1.v1.")), invText.slice(0, 200));
  const { sha256Hex } = await import("../ports/files.ts");
  ok("PF-19e DW1 pass: the row's stored hash is the hash of the sealed bytes", invRow.renderedHash === (await sha256Hex(invBytes)));
  const shown = (await inbox.list("pf19e.invitee@example.com", undefined)).messages, link = /\/invitation#t=([A-Za-z0-9_-]{43})/.exec(shown[0]?.body ?? "");
  ok("PF-19e DW1 pass: the demo inbox shows the link, and the worker sent it (SENT by the local adapter)", shown.length === 1 && !!link && invRow.providerId?.startsWith("local:"), shown);
  const accepted = link ? await call(base, "POST", `/api/public/invitations/${link[1]}/accept`) : { status: 0 };
  ok("PF-19e DW1 pass: the link the sealed body carried accepts the invitation", accepted.status === 200, accepted);
  const otherFirm = refusedWith(() => openStoredBody(box, OTHER, invRow.id, invBytes)), otherKey = refusedWith(() => openStoredBody(otherKeyBox, FIRM, invRow.id, invBytes));
  const otherRow = refusedWith(() => openStoredBody(box, FIRM, randomUUID(), invBytes));
  ok("PF-19e DW1 fail: another firm's key cannot open it, nor another key ring for the same firm, nor the same firm for another message",
    otherFirm instanceof SecretRefused && otherKey instanceof SecretRefused && otherRow instanceof SecretRefused, { otherFirm: String(otherFirm), otherKey: String(otherKey) });
  // The worker refuses a sealed body moved to another firm's message (the hash matched: the file was moved, not changed).
  const moved = await db.$transaction((tx) => messages.send(tx, { firmId: OTHER, channel: "EMAIL", class: "TRANSACTIONAL", address: "pf19e.moved@example.com", content: { subject: "Hello", text: "Hello." }, idempotencyKey: randomUUID() }));
  writeFileSync(join(files.root, OTHER, fileKeyOf(OTHER, moved.outboxId)), invBytes);
  await db.msgOutbox.update({ where: { id: moved.outboxId }, data: { renderedHash: await sha256Hex(invBytes) } });
  const movedOut = await messages.deliver(OTHER, moved.outboxId), movedRow = await db.msgOutbox.findUniqueOrThrow({ where: { id: moved.outboxId } });
  ok("PF-19e DW1 fail: a sealed body moved into another firm's outbox (its hash set to match) is never sent: FAILED \"body could not be opened\"", movedOut === "failed" && movedRow.state === "FAILED" && movedRow.stateReason === UNOPENED, movedRow);
  // Review m4: a body over one part (a long notice) is cut into sealed parts; reordered or dropped parts never open.
  const long = await db.$transaction((tx) => messages.send(tx, { firmId: OTHER, channel: "EMAIL", class: "TRANSACTIONAL", address: "pf19e.long@example.com", content: { subject: "Long", text: "Your code is 654321. ".repeat(900) }, idempotencyKey: randomUUID() }));
  const longBytes = await raw(OTHER, long.outboxId), longParts = (JSON.parse(new TextDecoder().decode(longBytes)) as { parts: string[] }).parts;
  const asFile = (parts: string[]) => new TextEncoder().encode(JSON.stringify({ sealed: "msgseal1", parts }));
  ok("PF-19e DW1 pass: a long body is sealed in several parts and opens whole", longParts.length >= 3 && openStoredBody(box, OTHER, long.outboxId, longBytes).text.startsWith("Your code is 654321."), longParts.length);
  ok("PF-19e DW1 fail: its parts reordered, one dropped, or one repeated never open",
    [[longParts[1], longParts[0], ...longParts.slice(2)], longParts.slice(0, -1), [longParts[0], ...longParts]].every((ps) => refusedWith(() => openStoredBody(box, OTHER, long.outboxId, asFile(ps))) instanceof SecretRefused));
  ok("PF-19e DW1 fail: no log line of the worker carries the body", !logs.some((l) => l.includes("#t=") || l.includes("invited to join")), logs);
  void BODY_PURPOSE;

  // --------------------------------------------------------------------------------- DW2 marketing as before; never unsealed
  const mkt = await db.$transaction((tx) => messages.send(tx, { firmId: OTHER, person: { kind: "FO_PERSON", id: randomUUID() }, channel: "EMAIL", class: "MARKETING", address: "pf19e.news@example.com", content: { subject: "Our news", text: "News for you." }, idempotencyKey: randomUUID() }));
  const mktText = new TextDecoder().decode(await raw(OTHER, mkt.outboxId));
  ok("PF-19e DW2 pass: a marketing body is stored as before (the plain rendered JSON, its subject and text readable)", !isSealedBody(new TextEncoder().encode(mktText)) && JSON.parse(mktText).subject === "Our news" && JSON.parse(mktText).text === "News for you.", mktText.slice(0, 200));
  /** Every TRANSACTIONAL row's stored body, checked sealed: the names of any that are not. */
  const unsealed = async () => {
    const out: string[] = [];
    for (const r of await db.msgOutbox.findMany({ where: { class: "TRANSACTIONAL" }, select: { id: true, firmId: true } })) {
      const f = await files.get(r.firmId ?? "00000000-0000-0000-0000-000000000000", fileKeyOf(r.firmId, r.id));
      if (f && !isSealedBody(f.bytes)) out.push(r.id);
    }
    return out;
  };
  const before = await unsealed();
  ok("PF-19e DW2 pass: no TRANSACTIONAL body in the outbox is stored unsealed (every stored file checked)", before.length === 0 && (await db.msgOutbox.count({ where: { class: "TRANSACTIONAL" } })) >= 4, before);
  // What the check sees when sealing is removed (the stored file written plainly, as the code did before PF-19e).
  const plain = await db.$transaction((tx) => messages.send(tx, { firmId: OTHER, channel: "EMAIL", class: "TRANSACTIONAL", address: "pf19e.plain@example.com", content: { subject: "Code", text: "Your code is 123456." }, idempotencyKey: randomUUID() }));
  writeFileSync(join(files.root, OTHER, fileKeyOf(OTHER, plain.outboxId)), JSON.stringify(openStoredBody(box, OTHER, plain.outboxId, await raw(OTHER, plain.outboxId))));
  const after = await unsealed();
  ok("PF-19e DW2 fail: a TRANSACTIONAL body written unsealed (sealing removed) is caught by the check", after.length === 1 && after[0] === plain.outboxId, after);

  // ------------------------------------------------------------------------------------ DW3 the per-address hourly limit
  const resets = [reset0.status, reset1.status];
  for (let i = 3; i <= SYSTEM_PER_ADDRESS_HOUR; i++) resets.push((await call(base, "POST", `/api/platform/staff/${O}/reset-two-step`, { token: tR })).status);
  const sixth = await call(base, "POST", `/api/platform/staff/${O}/reset-two-step`, { token: tR });
  ok("PF-19e DW3 pass: five reset emails in an hour to one address are sent", resets.length === 5 && resets.every((s) => s === 200) && (await rowsTo(oEmail)).length === 5, resets);
  ok("PF-19e DW3 fail: the sixth reset email in an hour to that address → 429 with a plain sentence, nothing reset, no sixth email",
    sixth.status === 429 && sql(`select count(*) from audit_event where action = 'platform.staff.two_step_reset' and entity_key = '${O}'`) === String(SYSTEM_PER_ADDRESS_HOUR) && sixth.body.code === "EMAIL_LIMIT" && /Too many account emails went to this address in the last hour/.test(sixth.body.detail) && (await rowsTo(oEmail)).length === 5, sixth);
  const firmOwn = await db.$transaction((tx) => messages.send(tx, { firmId: FIRM, channel: "EMAIL", class: "TRANSACTIONAL", address: oEmail, content: { subject: "Receipt", text: "A receipt." }, idempotencyKey: randomUUID() }));
  ok("PF-19e DW3 pass: the firm's own email to the same address is not stopped by the platform's limit (it meets the cap instead)", firmOwn.state === "QUEUED", firmOwn);
  const claim = await (async () => { try { await db.$transaction((tx) => messages.send(tx, { firmId: FIRM, channel: "EMAIL", class: "TRANSACTIONAL", address: "x@example.com", content: { subject: "S", text: "T" }, idempotencyKey: "system:mine" })); return null; } catch (e) { return e; } })();
  ok("PF-19e DW3 fail: a firm's own message cannot claim the exemption with a system: key (refused)", claim instanceof Error && /platform's own/.test(String(claim)), String(claim));
  // Break M1: a storm of parallel resets to one person answers 200 or 429 only (never 500), and the limit holds.
  const T = sql(`select id from platform_staff where actor_id = 'user-T'`), tEmail = sql(`select email from platform_staff where id = '${T}'`);
  const storm = await Promise.all(Array.from({ length: 25 }, () => call(base, "POST", `/api/platform/staff/${T}/reset-two-step`, { token: tR })));
  const codes = storm.map((r) => r.status);
  ok("PF-19e DW3 fail (break M1): 25 parallel resets to one person → only 200 and 429, never a 500; exactly 5 emails to the address",
    codes.every((c) => c === 200 || c === 429) && codes.filter((c) => c === 200).length === SYSTEM_PER_ADDRESS_HOUR && (await rowsTo(tEmail)).length === SYSTEM_PER_ADDRESS_HOUR, codes);
  // Break M3: a resend refused by the limit changes nothing: the link the person last got still works.
  const rInv = await call(base, "POST", "/api/platform/staff/invitations", { token: tR, body: { email: "pf19e.resend@example.com", roles: ["READ_ONLY"] } });
  let lastId = rInv.body.id as string;
  for (let i = 2; i <= SYSTEM_PER_ADDRESS_HOUR; i++) lastId = (await call(base, "POST", `/api/platform/staff/invitations/${lastId}/resend`, { token: tR, body: {} })).body.id;
  const sixthResend = await call(base, "POST", `/api/platform/staff/invitations/${lastId}/resend`, { token: tR, body: {} });
  await run();
  // The link of the invitation still pending: the one whose token hashes to its stored hash (the emails share a send time).
  const lastHash = sql(`select token_hash from platform_invitation where id = '${lastId}'`), { createHash } = await import("node:crypto");
  const lastLink = (await inbox.list("pf19e.resend@example.com", undefined)).messages.map((m) => /\/invitation#t=([A-Za-z0-9_-]{43})/.exec(m.body)?.[1]).find((t) => !!t && createHash("sha256").update(t).digest("hex") === lastHash);
  ok("PF-19e DW3 fail (break M3): the sixth resend in an hour → 429, and the invitation the person last got stays pending (not revoked, nothing new made)",
    sixthResend.status === 429 && sixthResend.body.code === "EMAIL_LIMIT" && sql(`select count(*) from platform_invitation where email = 'pf19e.resend@example.com' and revoked_at is null`) === "1"
    && sql(`select revoked_at is null from platform_invitation where id = '${lastId}'`) === "t", { sixthResend, lastId });
  const lastAccept = lastLink ? await call(base, "POST", `/api/public/invitations/${lastLink}/accept`) : { status: 0 };
  ok("PF-19e DW3 pass (break M3): that last link still accepts", lastAccept.status === 200, lastAccept);

  // ------------------------------------------------------------------------------------------ DW4 a suppressed address
  // Break m2 first: O's address is at the hourly limit and then suppressed → 409, not the limit's 429.
  await db.$transaction((tx) => consent.suppress(tx, { firmId: FIRM, channel: "EMAIL", address: oEmail, reason: "HARD_BOUNCE", by: "system:pf19e" }));
  const supAtLimit = await call(base, "POST", `/api/platform/staff/${O}/reset-two-step`, { token: tR });
  ok("PF-19e DW4 fail (break m2): a suppressed address already at the hourly limit → 409 (not 429)", supAtLimit.status === 409 && supAtLimit.body.code === "NOTICE_NOT_SENT", supAtLimit);
  sql(`update msg_outbox set created_at = created_at - interval '2 hours'`);   // the hour starts again
  const supLinesBefore = Number(sql(`select count(*) from audit_event where action = 'platform.staff.email_suppressed' and entity_key = '${O}'`));   // audit lines are never deleted (AUD-1a)
  const sessionsBefore = sql(`select count(*) from platform_session_revocation where staff_id = '${O}'`);
  const sup = await call(base, "POST", `/api/platform/staff/${O}/reset-two-step`, { token: tR });
  const supLine = sql(`select count(*) from audit_event where action = 'platform.staff.email_suppressed' and entity_key = '${O}'`);
  ok("PF-19e DW4 fail: a two-step reset to a suppressed address → 409 with the sentence, never 500",
    // A reset answers in Lead B's words of PF-19r question 4 (NOTICE_NOT_SENT: how to clear it); an invitation in PF-19e's sentence (below).
    sup.status === 409 && sup.body.code === "NOTICE_NOT_SENT" && /^Update this person's email address first/.test(sup.body.detail ?? "") && /not reset/.test(sup.body.detail ?? ""), sup);
  ok("PF-19e DW4 fail: it writes one audit line (no address in it), resets nothing, and the address stays suppressed",
    Number(supLine) === supLinesBefore + 1 && !sql(`select summary || detail::text from audit_event where action = 'platform.staff.email_suppressed'`).includes(oEmail)
    && sql(`select count(*) from platform_session_revocation where staff_id = '${O}'`) === sessionsBefore && sql(`select count(*) from msg_suppression where firm_id = '${FIRM}' and address = '${oEmail}'`) === "1", { supLine, sessionsBefore });
  await db.$transaction((tx) => consent.suppress(tx, { firmId: FIRM, channel: "EMAIL", address: "pf19e.bounced@example.com", reason: "COMPLAINT", by: "system:pf19e" }));
  const supInv = await call(base, "POST", "/api/platform/staff/invitations", { token: tR, body: { email: "pf19e.bounced@example.com", roles: ["READ_ONLY"] } });
  ok("PF-19e DW4 fail: an invitation to a suppressed address → 409 with the sentence and an audit line, and no invitation is made (break m1: no seat taken)",
    supInv.status === 409 && supInv.body.detail === suppressedWords("pf19e.bounced@example.com") && sql(`select count(*) from audit_event where action = 'platform.invitation.email_suppressed'`) === "1"
    && sql(`select count(*) from platform_invitation where email = 'pf19e.bounced@example.com'`) === "0", supInv);
  const R2 = sql(`select id from platform_staff where firm_id = '${FIRM}' and status = 'ACTIVE' and id not in ('${R}', '${O}') and email <> '${oEmail}' limit 1`);
  const fine = await call(base, "POST", `/api/platform/staff/${R2}/reset-two-step`, { token: tR });
  ok("PF-19e DW4 pass: a reset to an address that is not suppressed is done (200)", fine.status === 200 && fine.body.notified === true, fine);

  // ---------------------------------------------------------------------------- DW5 the contract; no token in any line
  sql(`update msg_outbox set created_at = created_at - interval '2 hours'`);
  await db.platformFirm.create({ data: { id: MAIL_CONTRACT_FIRM, key: "pf19e-contract", operatingName: "Sample Contract Firm", countryCode: "CA", status: "ACTIVE", contactEmail: "office@contract.example" } });
  await db.platformFirm.create({ data: { id: MAIL_CONTRACT_FIRM_B, key: "pf19e-contract-b", operatingName: "Sample Contract Firm B", countryCode: "CA", status: "ACTIVE", contactEmail: "office@contract-b.example" } });
  await runContract(mailPortContract, "MessagesMail (system: true, sealed bodies)", () => ({
    send: async (m) => { const r = await systemMail.send(m); await run(); return r; },
    inbox: async (a) => { try { return (await inbox.list(a, undefined)).messages.map((x) => ({ text: x.body })); } catch { return []; } },
  }), ok);
  const tokens = [link?.[1]].filter((t): t is string => !!t), holds = (lines: string[]) => lines.filter((l) => tokens.some((t) => l.includes(t)) || /#t=[A-Za-z0-9_-]{20,}/.test(l));
  ok("PF-19e DW5 pass: no log line in the run holds a token (every line written, and the send path's log, scanned)", tokens.length === 1 && holds(written).length === 0 && holds(logs).length === 0, holds(written).slice(0, 2));
  ok("PF-19e DW5 fail: the scan finds a token in a line that holds one", holds([`a line with /invitation#t=${tokens[0]}`]).length === 1);
} finally {
  await app?.close().catch(() => undefined);
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* best effort */ }
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
