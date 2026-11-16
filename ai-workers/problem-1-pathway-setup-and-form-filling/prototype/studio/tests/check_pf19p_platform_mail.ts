// PF-19p (Lead B rev 16.62, ruled on #1955; AG-1-70): platform account messages, an email to a person before any firm
// exists (sign-up's verification). msg_outbox.audience PLATFORM_ACCOUNT with no firm (a check), MailPort and MessagePort
// take either a firm or `platformAccount: true`, sent as "ExpatReady" from platform.account_mail_from, through the same
// outbox, file, idempotency and local adapter, and shown by the demo inbox by address. Named tests DW1-DW4, each with a
// pass and a fail. A scratch database with every migration, fakeJobs on a fake clock, files in a scratch folder; no model
// call, nothing leaves the machine (US$0). The database, the folder and the probe roles are removed at the end.
//   tsx studio/tests/check_pf19p_platform_mail.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ZodError } from "zod";
import type { Db } from "../api/src/core.ts";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { auditEvent } from "../api/src/platform/audit/audit-event.ts";
import { firmScope } from "../api/src/platform/firm-scope.ts";
import { localEmail } from "../api/src/platform/messages/channels/email/local.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { PlatformInbox } from "../api/src/platform/messages/demo-inbox.ts";
import { channelsOf } from "../api/src/platform/messages/send/channels.ts";
import { MessagesMail } from "../api/src/platform/messages/send/mail.ts";
import { fileKeyOf, Messages, PLATFORM_FILES_SPACE, SWEEP_AFTER_MS } from "../api/src/platform/messages/send/messages.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { ACCOUNT_MAIL_FROM } from "../api/src/platform/settings.ts";
import { fakeAlerts } from "../ports/alert.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeConsent } from "../ports/consent.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { MAIL_CONTRACT_FIRM, MAIL_CONTRACT_FIRM_B, mailPortContract } from "../ports/contracts/mail-port.contract.ts";
import { messagePortContract } from "../ports/contracts/message-port.contract.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail, MailMessage } from "../ports/mail.ts";
import { AnyMessageSend, fakeMessages, PLATFORM_ACCOUNT_FROM_SAMPLE, PLATFORM_ACCOUNT_NAME, type Rendered } from "../ports/messages.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf19p_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`, WORK = join(STUDIO, "var", `pf19p-check-${process.pid}`);
const FIRM_ROLE = `pf19p_firm_${process.pid}`, SYSTEM_ROLE = `pf19p_system_${process.pid}`;
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const psql = (q: string) => spawnSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" });
const sql = (q: string) => { const r = psql(q); if (r.status !== 0) throw new Error(r.stderr); return r.stdout.trim(); };
/** The SQLSTATE a statement fails with (VERBOSITY verbose prints it), or "ok". */
const sqlState = (q: string) => { const r = spawnSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-q", "-Atc", q], { encoding: "utf8" }); return r.status === 0 ? "ok" : (/ERROR:\s+([0-9A-Z]{5})/.exec(r.stderr)?.[1] ?? r.stderr); };
const rejects = async (f: () => unknown) => { try { await f(); return null; } catch (e) { return e; } };
const uuid = () => crypto.randomUUID(), box = (w: string) => `pf19p.${w}.${uuid().slice(0, 6)}@example.com`;
const HASH = "a".repeat(64);

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = URL;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
try {
  await seedSampleFirms(db);
  const firmA = sql(`select id from platform_firm where key='sample-firm'`), firmB = sql(`select id from platform_firm where key='sample-solo'`);
  const senders = Object.fromEntries((await db.platformFirm.findMany({ where: { id: { in: [firmA, firmB] } } })).map((f) => [f.id, { name: f.operatingName, replyTo: f.contactEmail }]));
  const clock = new FakeClock(new Date()), jobs = fakeJobs(clock), files = new LocalFiles(join(WORK, "files"));
  const consent = new ConsentStore(auditEvent, clock);
  const messages = new Messages({ db, consent, files, jobs, alerts: () => fakeAlerts(), channels: channelsOf([["EMAIL", localEmail]]), clock });
  await messages.register();
  const mail = new MessagesMail({ db, messages, files });
  const inbox = new PlatformInbox(db as unknown as Db, files, () => true);
  const tx = <T>(f: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(f);
  await db.msgFirm.upsert({ where: { firmId: firmA }, create: { firmId: firmA }, update: {} });
  const tpl = await db.msgTemplate.create({ data: { firmId: firmA, owner: "FIRM", key: "pf19p.hello", kind: "notice", channel: "EMAIL", language: "en" } });
  await db.msgTemplateVersion.create({ data: { firmId: firmA, templateId: tpl.id, version: 1, subject: "Hello {{ name }}", body: "Dear {{ name }}, your file is open.", publishedBy: "seed:pf19p" } });
  const words = { subject: "Confirm your email", text: "Your code is 654321." };
  const platformMail = (to: string, more: Record<string, unknown> = {}) => ({ platformAccount: true as const, to, replyTo: "ignored@example.com", subject: words.subject, text: words.text, class: "TRANSACTIONAL" as const, ...more });

  // ------------------------------------------------------------------------------------- DW1: stored, shown, refused
  const to1 = box("signup");
  const sent = await mail.send(platformMail(to1.toUpperCase(), { idempotencyKey: "signup:pending-1" }));
  const row = await db.msgOutbox.findUniqueOrThrow({ where: { id: sent.messageId } });
  ok("DW1 pass: a platformAccount email is stored with audience PLATFORM_ACCOUNT and no firm, and sent by the local adapter (no consent gate: the person asked for it)",
    row.audience === "PLATFORM_ACCOUNT" && row.firmId === null && row.class === "TRANSACTIONAL" && row.state === "SENT" && row.address === to1 && row.consentId === null && row.subjectKind === null && /^local:/.test(row.providerId ?? ""), row);
  const shown = await inbox.list(to1, undefined);
  ok("DW1 pass: the demo inbox shows it by address, from ExpatReady at platform.account_mail_from (the Sample), replying there, with no firm's name",
    shown.messages.length === 1 && shown.messages[0].audience === "PLATFORM_ACCOUNT" && shown.messages[0].from === `${PLATFORM_ACCOUNT_NAME} <${PLATFORM_ACCOUNT_FROM_SAMPLE}>` && shown.messages[0].reply_to === PLATFORM_ACCOUNT_FROM_SAMPLE
      && ACCOUNT_MAIL_FROM.default === PLATFORM_ACCOUNT_FROM_SAMPLE && shown.messages[0].subject === words.subject && !Object.values(senders).some((s) => shown.messages[0].html.includes(s.name)) && !/Reply to this email/.test(shown.messages[0].html), shown.messages[0]);
  ok("DW1 pass: its rendered file is in the platform's file space, never a firm's", (await files.get(PLATFORM_FILES_SPACE, fileKeyOf(null, row.id))) !== null && (await files.get(firmA, fileKeyOf(null, row.id))) === null);
  const again = await mail.send(platformMail(to1, { idempotencyKey: "signup:pending-1" }));
  ok("DW1 pass: the same key among platform account emails is one email (a retry answers the first)", again.messageId === sent.messageId && (await inbox.list(to1, undefined)).messages.length === 1);
  const firmSame = await mail.send({ firmId: firmA, to: to1, replyTo: "x@example.com", subject: "Firm notice", text: "From the firm.", class: "TRANSACTIONAL", idempotencyKey: "signup:pending-1" });
  await jobs.runDue();
  ok("DW1 pass: a firm's email with the same key is its own email (the firm's key space and the platform's are apart)", firmSame.messageId !== sent.messageId && (await inbox.list(to1, undefined)).messages.length === 2);

  const both = { ...platformMail(box("both")), firmId: firmA };
  const bothPort = MailMessage.safeParse(both), bothMail = await rejects(() => mail.send(both as never));
  ok("DW1 fail: a message with both firmId and platformAccount is refused by the port (and by MessagesMail, nothing stored)",
    !bothPort.success && bothMail instanceof ZodError && !AnyMessageSend.safeParse({ platformAccount: true, firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: both.to, content: words, idempotencyKey: uuid() }).success
      && (await db.msgOutbox.count({ where: { address: both.to } })) === 0, bothPort.error?.issues);
  const { platformAccount: _p, ...neither } = platformMail(box("neither"));
  const neitherPort = MailMessage.safeParse(neither);
  ok("DW1 fail: a message with neither firmId nor platformAccount is refused by the port (as a firm email without its firmId)",
    !neitherPort.success && neitherPort.error.issues.some((i) => i.path.join(".") === "firmId") && !AnyMessageSend.safeParse({ channel: "EMAIL", class: "TRANSACTIONAL", address: neither.to, content: words, idempotencyKey: uuid() }).success);
  const forged = [
    MailMessage.safeParse(platformMail(box("mkt"), { class: "MARKETING" })), MailMessage.safeParse(platformMail(box("svc"), { class: "SERVICE" })),
    MailMessage.safeParse(platformMail(box("person"), { person: { kind: "FO_PERSON", id: uuid() } })),
    MailMessage.safeParse(platformMail(box("att"), { attachments: [{ filename: "a.pdf", contentType: "application/pdf", bytes: new Uint8Array([1]) }] })),
    MailMessage.safeParse(platformMail(box("false"), { platformAccount: false })),
    AnyMessageSend.safeParse({ platformAccount: true, channel: "WHATSAPP", class: "TRANSACTIONAL", address: "+14165550100", content: words, idempotencyKey: uuid() }),
    AnyMessageSend.safeParse({ platformAccount: true, channel: "EMAIL", class: "TRANSACTIONAL", address: box("tpl"), content: { templateKey: "booking.confirmed", values: {} }, idempotencyKey: uuid() }),
  ];
  ok("DW1 fail: a forged platformAccount message is refused: marketing, service, a person, an attachment, platformAccount false, WhatsApp, a template", forged.every((r) => !r.success), forged.map((r) => r.success));
  const mkt = await rejects(() => tx((t) => messages.send(t, { platformAccount: true, channel: "EMAIL", class: "MARKETING", address: box("mkt2"), content: words, idempotencyKey: uuid() } as never)));
  ok("DW1 fail: Messages.send refuses a marketing platformAccount message (nothing stored)", mkt instanceof ZodError && (await db.msgOutbox.count({ where: { audience: "PLATFORM_ACCOUNT", class: "MARKETING" } })) === 0);

  // ------------------------------------------------------------------------------------- DW1: the worker and the sweep
  const to2 = box("crash"), q2 = await tx((t) => messages.send(t, { platformAccount: true, channel: "EMAIL", class: "TRANSACTIONAL", address: to2, content: words, idempotencyKey: uuid() }));
  ok("DW1 pass: written in the caller's transaction QUEUED, with no firm row made (msg_firm unchanged) and no job (platform rows have no firm)",
    q2.state === "QUEUED" && (await db.msgOutbox.findUniqueOrThrow({ where: { id: q2.outboxId } })).state === "QUEUED" && jobs.jobs.every((j) => !JSON.stringify(j.payload).includes(q2.outboxId)));
  const early = await messages.sweep();
  await clock.advance(SWEEP_AFTER_MS + 1000);
  await messages.sweep();
  ok("DW1 pass: the sweep sends a platform row a crash left QUEUED, once, after SWEEP_AFTER_MS (not before)", early === 0 && (await db.msgOutbox.findUniqueOrThrow({ where: { id: q2.outboxId } })).state === "SENT" && (await inbox.list(to2, undefined)).messages.length === 1);
  ok("DW1 fail: delivering a sent platform row again sends nothing (skipped)", (await messages.deliver(null, q2.outboxId)) === "skipped" && (await inbox.list(to2, undefined)).messages.length === 1);
  ok("DW1 fail: a firm's worker never takes a platform row (firm A's deliver of its id is skipped)", (await messages.deliver(firmA, (await tx((t) => messages.send(t, { platformAccount: true, channel: "EMAIL", class: "TRANSACTIONAL", address: box("firmw"), content: words, idempotencyKey: uuid() }))).outboxId)) === "skipped");
  const to3 = box("changed"), q3 = await tx((t) => messages.send(t, { platformAccount: true, channel: "EMAIL", class: "TRANSACTIONAL", address: to3, content: words, idempotencyKey: uuid() }));
  sql(`update msg_outbox set rendered_hash = '${"b".repeat(64)}' where id = '${q3.outboxId}'`);
  await messages.dispatch(null, [q3.outboxId]);
  ok("DW1 fail: a platform row whose file no longer matches is FAILED \"content changed\" and nothing is sent", (await db.msgOutbox.findUniqueOrThrow({ where: { id: q3.outboxId } })).stateReason === "content changed" && (await inbox.list(to3, undefined)).messages.length === 0);

  // ------------------------------------------------------------------------------------- DW2: the database's checks
  const ins = (firm: string | null, audience: string) => `insert into msg_outbox (id, firm_id, audience, channel, address, rendered_hash, class, idempotency_key, updated_at)
    values (gen_random_uuid(), ${firm ? `'${firm}'` : "null"}, '${audience}', 'EMAIL', '${box("raw")}', '${HASH}', 'TRANSACTIONAL', '${uuid()}', now())`;
  ok("DW2 pass: a direct insert of a PLATFORM_ACCOUNT row with no firm, and of a FIRM row with its firm, are accepted", sqlState(ins(null, "PLATFORM_ACCOUNT")) === "ok" && sqlState(ins(firmA, "FIRM")) === "ok");
  ok("DW2 fail: a direct insert of a FIRM row with no firm is refused by the check (23514)", sqlState(ins(null, "FIRM")) === "23514", sqlState(ins(null, "FIRM")));
  ok("DW2 fail: a direct insert of a PLATFORM_ACCOUNT row with a firm is refused by the check (23514)", sqlState(ins(firmA, "PLATFORM_ACCOUNT")) === "23514", sqlState(ins(firmA, "PLATFORM_ACCOUNT")));
  ok("DW2 fail: an existing row cannot lose its firm or change its audience (the same check on update)",
    sqlState(`update msg_outbox set firm_id = null where audience = 'FIRM'`) === "23514" && sqlState(`update msg_outbox set audience = 'PLATFORM_ACCOUNT' where audience = 'FIRM'`) === "23514");
  ok("DW2 pass: a row written before this migration's way (no audience named) is FIRM", sql(`insert into msg_outbox (id, firm_id, channel, address, rendered_hash, class, updated_at) values (gen_random_uuid(), '${firmA}', 'EMAIL', '${box("old")}', '${HASH}', 'SERVICE', now()) returning audience`) === "FIRM");
  const rawPlat = (cols: string, vals: string) => `insert into msg_outbox (id, audience, channel, address, rendered_hash, class, updated_at, idempotency_key${cols}) values (gen_random_uuid(), 'PLATFORM_ACCOUNT', 'EMAIL', '${box("rawp")}', '${HASH}', ${vals})`;
  const v = (cls: string, key: string | null = `'${uuid()}'`) => `'${cls}', now(), ${key}`;
  ok("DW2 fail: a raw PLATFORM_ACCOUNT row that is marketing, service, names a person, or has no idempotency key is refused (23514)",
    [rawPlat("", v("MARKETING")), rawPlat("", v("SERVICE")), rawPlat(", subject_kind, subject_id", `${v("TRANSACTIONAL")}, 'FO_PERSON', gen_random_uuid()`), rawPlat("", v("TRANSACTIONAL", "null"))].every((q) => sqlState(q) === "23514"));
  sql(rawPlat("", v("TRANSACTIONAL", "'raw-dup'")));
  ok("DW2 fail: a second raw PLATFORM_ACCOUNT row with the same idempotency key is refused (23505), while the same key in a firm is not",
    sqlState(rawPlat("", v("TRANSACTIONAL", "'raw-dup'"))) === "23505" && sqlState(`insert into msg_outbox (id, firm_id, channel, address, rendered_hash, class, updated_at, idempotency_key) values (gen_random_uuid(), '${firmA}', 'EMAIL', '${box("dupf")}', '${HASH}', 'TRANSACTIONAL', now(), 'raw-dup')`) === "ok");

  // ------------------------------------------------------------------------------------- DW3: walls
  const platformCount = sql(`select count(*) from msg_outbox where audience = 'PLATFORM_ACCOUNT'`);
  const firmRows = await db.msgOutbox.findMany({ where: firmScope(firmA), select: { audience: true } });
  ok("DW3 pass/fail: firm A's scoped read (firmScope) has its own rows and no PLATFORM_ACCOUNT row", firmRows.length > 0 && firmRows.every((r) => r.audience === "FIRM") && Number(platformCount) > 0, { firmRows: firmRows.length, platformCount });
  // PF-12's wall (#1910, not on main when this landed): row-level security, firm_id = the session's firm, and a system role
  // that passes it. The same policy is applied here to probe roles, so the rule PF-12 relies on is proved now: a NULL firm
  // matches no firm's session. Where PF-12 is on main, its own roles are probed as well.
  sql(`create role ${FIRM_ROLE} nologin; create role ${SYSTEM_ROLE} nologin bypassrls; grant select on msg_outbox to ${FIRM_ROLE}, ${SYSTEM_ROLE};
    alter table msg_outbox enable row level security;
    create policy pf19p_probe on msg_outbox to ${FIRM_ROLE} using (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid)`);
  const asRole = (role: string, firm: string, q: string) => sql(`begin; set local role ${role}; select set_config('app.firm_id', '${firm}', true); ${q}; commit`).split("\n").filter(Boolean).at(-1);
  ok("DW3 fail: a firm's role behind the wall reads no PLATFORM_ACCOUNT row (firm A, firm B, and no firm set)",
    [firmA, firmB, ""].every((f) => asRole(FIRM_ROLE, f, `select count(*) from msg_outbox where audience = 'PLATFORM_ACCOUNT'`) === "0") && asRole(FIRM_ROLE, firmA, `select count(*) from msg_outbox where firm_id is null`) === "0");
  ok("DW3 pass: the same firm role reads its own firm's rows; the system role reads the PLATFORM_ACCOUNT rows",
    Number(asRole(FIRM_ROLE, firmA, `select count(*) from msg_outbox`)) > 0 && asRole(SYSTEM_ROLE, "", `select count(*) from msg_outbox where audience = 'PLATFORM_ACCOUNT'`) === platformCount);
  sql(`drop policy pf19p_probe on msg_outbox; alter table msg_outbox disable row level security; revoke all on msg_outbox from ${FIRM_ROLE}, ${SYSTEM_ROLE}`);
  if (sql(`select to_regprocedure('platform_session_firm()') is not null`) === "t") {
    ok("DW3 fail (PF-12 on main): xr_app with a firm set reads no PLATFORM_ACCOUNT row", asRole("xr_app", firmA, `select count(*) from msg_outbox where audience = 'PLATFORM_ACCOUNT'`) === "0");
    ok("DW3 pass (PF-12 on main): xr_staff_bypass reads them", asRole("xr_staff_bypass", "", `select count(*) from msg_outbox where audience = 'PLATFORM_ACCOUNT'`) === platformCount);
  } else console.log("NOTE  DW3: PF-12's walls (#1910) are not on main: the probe policy above stands in; whichever lands second runs its roles here");

  // ------------------------------------------------------------------------------------- DW4: shared contracts
  await runContract(mailPortContract, "fakeMail", () => fakeMail(), ok);
  for (const [id, key] of [[MAIL_CONTRACT_FIRM, "pf19p-contract"], [MAIL_CONTRACT_FIRM_B, "pf19p-contract-b"]]) await db.platformFirm.create({ data: { id, key, operatingName: `Sample ${key}`, countryCode: "CA", status: "ACTIVE", contactEmail: `office@${key}.example` } });
  await runContract(mailPortContract, "MessagesMail", () => ({
    send: async (m) => { const r = await mail.send(m); await jobs.runDue(); return r; },
    inbox: async (a) => { try { return (await inbox.list(a, undefined)).messages.map((x) => ({ text: x.body })); } catch { return []; } },
  }), ok);
  await runContract(messagePortContract, "Messages", () => ({
    messages, consent, tx: (f) => db.$transaction((t) => f(t)), settle: () => jobs.runDue(), firmA, firmB, senders, templateKey: "pf19p.hello",
    sentTo: async (a) => (await inbox.list(a, undefined)).messages.reverse().map((m) => ({ firmId: m.reply_to === senders[firmA].replyTo ? firmA : firmB, from: { name: m.from.replace(/ <.*$/, ""), address: "" }, replyTo: m.reply_to, html: m.html } as Rendered)),
  }), ok);
  await runContract(messagePortContract, "fakeMessages", () => {
    const fc = fakeConsent({ now: () => clock.now() }), fm = fakeMessages({ consent: fc, senders, templates: { "pf19p.hello": { subject: "Hello {{ name }}", body: "Dear {{ name }}" } } });
    return { messages: fm, consent: fc, tx: (f) => f(null), settle: async () => {}, sentTo: async (a) => fm.sent.filter((m) => m.to === a.toLowerCase()), firmA, firmB, senders, templateKey: "pf19p.hello" };
  }, ok);
} catch (e) {
  fail++;
  console.log(`FAIL  PF-19p check stopped: ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  await db.$disconnect().catch(() => undefined);
  spawnSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB], { stdio: "ignore" });
  for (const r of [FIRM_ROLE, SYSTEM_ROLE]) spawnSync(join(BIN, "psql"), ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio", "-d", "postgres", "-q", "-c", `drop role if exists ${r}`], { stdio: "ignore" });
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
