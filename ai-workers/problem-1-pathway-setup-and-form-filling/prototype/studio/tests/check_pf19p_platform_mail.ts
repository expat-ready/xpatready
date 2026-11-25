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
import { appDatabaseUrl, asJob, BypassRefused, firmScope, inRequest, WalledPool, withFirm } from "../api/src/platform/firm-scope.ts";
import { localEmail } from "../api/src/platform/messages/channels/email/local.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { PlatformInbox } from "../api/src/platform/messages/demo-inbox.ts";
import { channelsOf } from "../api/src/platform/messages/send/channels.ts";
import { MessagesMail } from "../api/src/platform/messages/send/mail.ts";
import { fileKeyOf, Messages, PLATFORM_FILES_SPACE, PLATFORM_SEND_TRIES, platformJobKey, platformRetryAfterMs, SWEEP_AFTER_MS, SWEEP_PER_FIRM } from "../api/src/platform/messages/send/messages.ts";
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
const NEW = "20261119163000_pf19p_platform_account_mail", ALL = readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort();
const migrate = (d: string) => execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = URL;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
try {
  // ------------------------------------------------------------------ DW4: the migration in a parallel world (rev 16.7)
  // Every migration before PF-19p's, demo-shaped rows (the Sample firms, an old-shape outbox row with an event), then
  // PF-19p's migration, checked right after it, then every later one.
  const before = ALL.filter((d) => d < NEW);
  ok(`DW4 pass: the migration has its own stamp, later than every one before it and unique (newest before it: ${before.at(-1)})`,
    ALL.includes(NEW) && ALL.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && before.at(-1)! >= "20261118200100_fo7ts_card_terminal_trust");
  for (const d of before) migrate(d);
  await seedSampleFirms(db);
  const oldFirm = sql(`select id from platform_firm where key='sample-firm'`), oldId = uuid();
  sql(`insert into msg_firm (firm_id) values ('${oldFirm}') on conflict do nothing;
    insert into msg_outbox (id, firm_id, channel, address, rendered_hash, class, state, updated_at) values ('${oldId}', '${oldFirm}', 'EMAIL', 'old.row@example.com', '${HASH}', 'SERVICE', 'SENT', now());
    insert into msg_event (id, firm_id, outbox_id, kind, occurred_at) values (gen_random_uuid(), '${oldFirm}', '${oldId}', 'SENT', now())`);
  ok("DW4 fail: before PF-19p's migration there is no audience column and firm_id is required", sql(`select count(*) from information_schema.columns where table_name = 'msg_outbox' and column_name = 'audience'`) === "0"
    && sql(`select is_nullable from information_schema.columns where table_name = 'msg_outbox' and column_name = 'firm_id'`) === "NO");
  migrate(NEW);
  ok("DW4 pass: right after its own migration the old row is FIRM with its firm and its event, and both checks and the index are valid",
    sql(`select audience || ',' || firm_id from msg_outbox where id = '${oldId}'`) === `FIRM,${oldFirm}` && sql(`select count(*) from msg_event where outbox_id = '${oldId}'`) === "1"
      && sql(`select count(*) from pg_constraint where conname in ('msg_outbox_audience_check', 'msg_outbox_platform_account_check') and convalidated`) === "2"
      && sql(`select count(*) from pg_index i join pg_class c on c.oid = i.indexrelid where c.relname = 'msg_outbox_platform_idempotency_key' and i.indisvalid and i.indisunique`) === "1");
  for (const d of ALL.filter((x) => x > NEW)) migrate(d);
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
  const queuedJob = jobs.jobs.find((j) => j.payload.outboxId === sent.messageId);
  ok("DW1 pass/fail: the send is not made in the caller's request: MessagesMail answers with the row QUEUED and one platform job (no firm) on messages.send",
    (await db.msgOutbox.findUniqueOrThrow({ where: { id: sent.messageId } })).state === "QUEUED" && queuedJob?.name === "messages.send" && queuedJob.firmId === null && queuedJob.status === "waiting", queuedJob);
  await jobs.runDue();
  const row = await db.msgOutbox.findUniqueOrThrow({ where: { id: sent.messageId } });
  ok("DW1 pass: a platformAccount email is stored with audience PLATFORM_ACCOUNT and no firm, and sent by the local adapter (no consent gate: the person asked for it)",
    row.audience === "PLATFORM_ACCOUNT" && row.firmId === null && row.class === "TRANSACTIONAL" && row.state === "SENT" && row.address === to1 && row.consentId === null && row.subjectKind === null && /^local:/.test(row.providerId ?? ""), row);
  const shown = await inbox.list(to1, undefined);
  ok("DW1 pass: the demo inbox shows it by address, from ExpatReady at platform.account_mail_from (the Sample), replying there, with no firm's name",
    shown.messages.length === 1 && shown.messages[0].audience === "PLATFORM_ACCOUNT" && shown.messages[0].from === `${PLATFORM_ACCOUNT_NAME} <${PLATFORM_ACCOUNT_FROM_SAMPLE}>` && shown.messages[0].reply_to === PLATFORM_ACCOUNT_FROM_SAMPLE
      && ACCOUNT_MAIL_FROM.default === PLATFORM_ACCOUNT_FROM_SAMPLE && shown.messages[0].subject === words.subject && !Object.values(senders).some((s) => shown.messages[0].html.includes(s.name)) && !/Reply to this email/.test(shown.messages[0].html), shown.messages[0]);
  ok("DW1 pass: its rendered file is in the platform's file space, never a firm's", (await files.get(PLATFORM_FILES_SPACE, fileKeyOf(null, row.id))) !== null && (await files.get(firmA, fileKeyOf(null, row.id))) === null);
  const again = await mail.send(platformMail(to1, { idempotencyKey: "signup:pending-1" }));
  await jobs.runDue();
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
  await messages.sweep(); await jobs.runDue();
  ok("DW1 pass: the sweep sends a platform row a crash left QUEUED, once, after SWEEP_AFTER_MS (not before)", early === 0 && (await db.msgOutbox.findUniqueOrThrow({ where: { id: q2.outboxId } })).state === "SENT" && (await inbox.list(to2, undefined)).messages.length === 1);
  ok("DW1 fail: delivering a sent platform row again sends nothing (skipped)", (await messages.deliver(null, q2.outboxId)) === "skipped" && (await inbox.list(to2, undefined)).messages.length === 1);
  ok("DW1 fail: a firm's worker never takes a platform row (firm A's deliver of its id is skipped)", (await messages.deliver(firmA, (await tx((t) => messages.send(t, { platformAccount: true, channel: "EMAIL", class: "TRANSACTIONAL", address: box("firmw"), content: words, idempotencyKey: uuid() }))).outboxId)) === "skipped");
  const to3 = box("changed"), q3 = await tx((t) => messages.send(t, { platformAccount: true, channel: "EMAIL", class: "TRANSACTIONAL", address: to3, content: words, idempotencyKey: uuid() }));
  sql(`update msg_outbox set rendered_hash = '${"b".repeat(64)}' where id = '${q3.outboxId}'`);
  await messages.dispatch(null, [q3.outboxId]); await jobs.runDue();
  ok("DW1 fail: a platform row whose file no longer matches is FAILED \"content changed\" and nothing is sent", (await db.msgOutbox.findUniqueOrThrow({ where: { id: q3.outboxId } })).stateReason === "content changed" && (await inbox.list(to3, undefined)).messages.length === 0);

  // (review m4) Eight sends of one platform key at once: one row, and every caller answers with it (the advisory lock).
  const raceKey = uuid(), raceTo = box("race");
  const race = await Promise.allSettled(Array.from({ length: 8 }, () => tx((t) => messages.send(t, { platformAccount: true, channel: "EMAIL", class: "TRANSACTIONAL", address: raceTo, content: words, idempotencyKey: raceKey }))));
  const raceIds = new Set(race.map((r) => (r.status === "fulfilled" ? r.value.outboxId : `refused:${String(r.reason)}`)));
  ok("DW1 pass/fail: eight concurrent sends of one platform key write one row and all eight answer with it (seven repeated)",
    raceIds.size === 1 && (await db.msgOutbox.count({ where: { audience: "PLATFORM_ACCOUNT", idempotencyKey: raceKey } })) === 1
      && race.filter((r) => r.status === "fulfilled" && r.value.repeated).length === 7, [...raceIds]);

  // ------------------------------------------------------------------------------------- DW1: a provider that refuses
  // (break F1) A platform row whose send throws counts its tries, waits longer each time, and is FAILED after
  // PLATFORM_SEND_TRIES with a log line (ids only); stuck rows never starve a newer one.
  const lines: string[] = [], flaky = { provider: "local", async deliver(_t: unknown, r: Rendered) { if (r.to.startsWith("pf19p.stuck")) throw new Error("provider refused"); return { providerId: `local:${r.outboxId}` }; } };
  const clock2 = new FakeClock(clock.now()), jobs2 = fakeJobs(clock2);   // its own runner: the first instance's sweep never sees these rows
  const m2 = new Messages({ db, consent, files, jobs: jobs2, alerts: () => fakeAlerts(), channels: channelsOf([["EMAIL", flaky]]), clock: clock2, log: (l) => lines.push(l) });
  await m2.register();
  const stuck: string[] = [];
  for (let i = 0; i < SWEEP_PER_FIRM + 1; i++) { const r = await tx((t) => m2.send(t, { platformAccount: true, channel: "EMAIL", class: "TRANSACTIONAL", address: box(`stuck${i}`), content: words, idempotencyKey: uuid() })); await m2.dispatch(null, [r.outboxId]); stuck.push(r.outboxId); }
  await jobs2.runDue();
  const fresh = await tx((t) => m2.send(t, { platformAccount: true, channel: "EMAIL", class: "TRANSACTIONAL", address: box("fresh"), content: words, idempotencyKey: uuid() }));
  sql(`update msg_outbox set updated_at = '${new Date(clock2.now().getTime() + 1000).toISOString()}' where id = '${fresh.outboxId}'`);   // newer than every stuck row's try
  const after1 = await db.msgOutbox.findUniqueOrThrow({ where: { id: stuck[0] } });
  ok("DW1 fail (review m-r4): a send that throws fails its job, so the job runner retries it (the dispatch's job ends failed, not done)",
    jobs2.jobs.find((j) => j.key === platformJobKey(stuck[0], 0))?.status === "failed", jobs2.jobs.find((j) => j.key === platformJobKey(stuck[0], 0)));
  ok("DW1 fail: a platform send the provider refuses stays QUEUED with its try counted and a log line naming only ids",
    after1.state === "QUEUED" && after1.stateReason === `send failed: try 1 of ${PLATFORM_SEND_TRIES}` && lines.length === stuck.length && lines.every((l) => !l.includes("@") && /outbox [0-9a-f-]{36}/.test(l)), { after1, line: lines[0] });
  await clock2.advance(platformRetryAfterMs(1) + 2000); await m2.sweep(); await jobs2.runDue();
  ok("DW1 pass: the first sweep sends a fresh platform row although more than SWEEP_PER_FIRM stuck rows are due (never starved)", (await db.msgOutbox.findUniqueOrThrow({ where: { id: fresh.outboxId } })).state === "SENT");
  for (let i = 0; i < 60; i++) { await clock2.advance(60_000); await m2.sweep(); await jobs2.runDue(); }
  const states = await db.msgOutbox.findMany({ where: { id: { in: stuck } }, select: { state: true, stateReason: true } });
  ok(`DW1 fail: after ${PLATFORM_SEND_TRIES} tries with growing waits each stuck row is FAILED "send failed" and is tried no more`,
    states.every((r) => r.state === "FAILED" && r.stateReason === "send failed") && lines.length === stuck.length * PLATFORM_SEND_TRIES, { states: states.slice(0, 3), lines: lines.length });
  // (break R2, review m-r2) A try that failed before it was counted (its job's key used, the row's reason still empty) is
  // queued again by a later sweep, never left QUEUED for good.
  const lost = await tx((t) => m2.send(t, { platformAccount: true, channel: "EMAIL", class: "TRANSACTIONAL", address: box("stuckuncounted"), content: words, idempotencyKey: uuid() }));
  await m2.dispatch(null, [lost.outboxId]); await jobs2.runDue();
  sql(`update msg_outbox set state_reason = null where id = '${lost.outboxId}'`);   // as if the count itself had failed
  await clock2.advance(60 * 60_000); await m2.sweep(); await jobs2.runDue();
  ok("DW1 fail→pass: a platform try that was never counted is queued again by the sweep and counted (its first key is already used)",
    (await db.msgOutbox.findUniqueOrThrow({ where: { id: lost.outboxId } })).stateReason === `send failed: try 1 of ${PLATFORM_SEND_TRIES}`
      && jobs2.jobs.filter((j) => j.payload.outboxId === lost.outboxId).length >= 2);
  // (break R1, review m-r1) A job with no firm only ever sends a platform row: one whose payload names a firm's row sends nothing.
  const firmRow = await tx((t) => messages.send(t, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: box("firmrow"), content: words, idempotencyKey: uuid() }));
  await jobs.enqueue("messages.send", { firmId: firmA, outboxId: firmRow.outboxId }, { key: `pf19p:forged:${uuid()}`, platform: true }); await jobs.runDue();
  ok("DW3 fail (break R1): a platform job (no firm) whose payload names a firm's QUEUED row never sends it (the job's own firm picks the path)",
    (await db.msgOutbox.findUniqueOrThrow({ where: { id: firmRow.outboxId } })).state === "QUEUED");

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
  const tv = sql(`select id from msg_template_version where firm_id = '${firmA}' limit 1`), cs = uuid();
  ok("DW2 fail: a raw PLATFORM_ACCOUNT row on WhatsApp, naming a consent, or naming a template version (a firm's) is refused (23514)",
    [`insert into msg_outbox (id, audience, channel, address, rendered_hash, class, updated_at, idempotency_key) values (gen_random_uuid(), 'PLATFORM_ACCOUNT', 'WHATSAPP', '+14165550100', '${HASH}', 'TRANSACTIONAL', now(), '${uuid()}')`,
      rawPlat(", consent_id", `${v("TRANSACTIONAL")}, '${cs}'`), rawPlat(", template_version_id", `${v("TRANSACTIONAL")}, '${tv}'`)].every((q) => sqlState(q) === "23514") && tv.length === 36);
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
  const hadRls = sql(`select relrowsecurity from pg_class where relname = 'msg_outbox'`) === "t";   // PF-12's own wall, when on main
  sql(`create role ${FIRM_ROLE} nologin; create role ${SYSTEM_ROLE} nologin bypassrls; grant select, insert, update on msg_outbox to ${FIRM_ROLE}, ${SYSTEM_ROLE};
    alter table msg_outbox enable row level security;
    create policy pf19p_probe on msg_outbox to ${FIRM_ROLE} using (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid)`);
  const asRole = (role: string, firm: string, q: string) => sql(`begin; set local role ${role}; select set_config('app.firm_id', '${firm}', true); ${q}; commit`).split("\n").filter(Boolean).at(-1);
  ok("DW3 fail: a firm's role behind the wall reads no PLATFORM_ACCOUNT row (firm A, firm B, and no firm set)",
    [firmA, firmB, ""].every((f) => asRole(FIRM_ROLE, f, `select count(*) from msg_outbox where audience = 'PLATFORM_ACCOUNT'`) === "0") && asRole(FIRM_ROLE, firmA, `select count(*) from msg_outbox where firm_id is null`) === "0");
  ok("DW3 pass: the same firm role reads its own firm's rows; the system role reads the PLATFORM_ACCOUNT rows",
    Number(asRole(FIRM_ROLE, firmA, `select count(*) from msg_outbox`)) > 0 && asRole(SYSTEM_ROLE, "", `select count(*) from msg_outbox where audience = 'PLATFORM_ACCOUNT'`) === platformCount);
  const asRoleState = (role: string, firm: string, q: string) => sqlState(`begin; set local role ${role}; select set_config('app.firm_id', '${firm}', true); ${q}; commit`);
  const platRow = (key: string) => `insert into msg_outbox (id, audience, channel, address, rendered_hash, class, updated_at, idempotency_key) values (gen_random_uuid(), 'PLATFORM_ACCOUNT', 'EMAIL', '${box("role")}', '${HASH}', 'TRANSACTIONAL', now(), '${key}')`;
  const touched = (role: string, firm: string) => asRole(role, firm, `with u as (update msg_outbox set state_reason = 'probe' where audience = 'PLATFORM_ACCOUNT' returning 1) select count(*) from u`);
  ok("DW3 fail: a firm's role behind the wall cannot write a PLATFORM_ACCOUNT row (insert refused 42501) nor change one (0 rows)",
    asRoleState(FIRM_ROLE, firmA, platRow(uuid())) === "42501" && asRoleState(FIRM_ROLE, "", platRow(uuid())) === "42501" && touched(FIRM_ROLE, firmA) === "0");
  ok("DW3 pass: the system role writes and changes PLATFORM_ACCOUNT rows", asRoleState(SYSTEM_ROLE, "", platRow(uuid())) === "ok" && Number(touched(SYSTEM_ROLE, "")) > 0);
  sql(`drop policy pf19p_probe on msg_outbox;${hadRls ? "" : " alter table msg_outbox disable row level security;"} revoke all on msg_outbox from ${FIRM_ROLE}, ${SYSTEM_ROLE}`);
  // PF-12's own walls (on main since #1910): its roles, and the app's real path through the walled pool (xr_app).
  const nowPlatform = sql(`select count(*) from msg_outbox where audience = 'PLATFORM_ACCOUNT'`);
  ok("DW3 fail (PF-12): xr_app with a firm set, or with none, reads no PLATFORM_ACCOUNT row and cannot insert one (42501)",
    asRole("xr_app", firmA, `select count(*) from msg_outbox where audience = 'PLATFORM_ACCOUNT'`) === "0" && asRole("xr_app", "", `select count(*) from msg_outbox where audience = 'PLATFORM_ACCOUNT'`) === "0"
      && asRoleState("xr_app", firmA, platRow(uuid())) === "42501");
  ok("DW3 pass (PF-12): xr_staff_bypass reads them all", asRole("xr_staff_bypass", "", `select count(*) from msg_outbox where audience = 'PLATFORM_ACCOUNT'`) === nowPlatform);
  {
    const wpool = new WalledPool({ connectionString: appDatabaseUrl(URL, {}), max: 2, options: "-c TimeZone=UTC" }), wdb = new PrismaClient({ adapter: new PrismaPg(wpool) });
    try {
      const wjobs = fakeJobs(clock), wm = new Messages({ db: wdb, consent, files, jobs: wjobs, alerts: () => fakeAlerts(), channels: channelsOf([["EMAIL", localEmail]]), clock });
      const wmail = new MessagesMail({ db: wdb, messages: wm, files }), signup = { method: "POST", path: "/api/public/signup" }, toW = box("walled");
      const sentW = await inRequest(signup, () => wmail.send(platformMail(toW, { idempotencyKey: `signup:${uuid()}` })));
      const rowW = await db.msgOutbox.findUnique({ where: { id: sentW.messageId } });
      ok("DW3 pass (PF-12): on the sign-up door, MessagesMail writes the platform row through the walled pool as the system role (platform.account.mail)", rowW?.audience === "PLATFORM_ACCOUNT" && rowW.firmId === null);
      const direct = await rejects(() => inRequest(signup, () => wdb.$transaction((t) => wm.send(t, { platformAccount: true, channel: "EMAIL", class: "TRANSACTIONAL", address: box("nobypass"), content: words, idempotencyKey: uuid() }))));
      const elsewhere = await rejects(() => inRequest({ method: "POST", path: "/api/platform/staff/invitations" }, () => wmail.send(platformMail(box("otherroute")))));
      ok("DW3 fail (PF-12): the same write without the bypass is refused by the wall, and platform.account.mail is refused on another route", /row-level security|42501/.test(String(direct)) && elsewhere instanceof BypassRefused, { direct: String(direct).slice(0, 160), elsewhere: String(elsewhere).slice(0, 160) });
      ok("DW3 fail (PF-12): a firm's job never sees the platform row (firm A's deliver of its id is skipped)", (await withFirm(firmA, () => wm.deliver(firmA, sentW.messageId))) === "skipped" && (await db.msgOutbox.findUniqueOrThrow({ where: { id: sentW.messageId } })).state === "QUEUED");
      ok("DW3 pass (PF-12): the platform job runs as the system role (job:messages.send) and sends it", (await asJob("messages.send", () => wm.deliver(null, sentW.messageId))) === "sent" && (await db.msgOutbox.findUniqueOrThrow({ where: { id: sentW.messageId } })).state === "SENT");
    } finally { await wdb.$disconnect().catch(() => undefined); await wpool.end().catch(() => undefined); }
  }

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
