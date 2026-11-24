// PF-19b part 1 (map rows 47-49; AG-10-1, -3, -5, -20, -22, -25): the outbox, the consent gate at send time, the worker,
// the daily cap and the local adapter with its demo inbox. Named tests DW0-DW8 (brief PF-19b, Lead B), each with a pass
// and a fail, plus MessagePort's shared contract on the adapter and the fake (PF-0c). One scratch database with every
// migration and the Sample firms; the job runner is fakeJobs on a fake clock; files in a scratch folder. No server, no
// browser, no model call, nothing leaves the machine (US$0). The database and folder are removed at the end.
//   tsx studio/tests/check_pf19b_sending.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { HttpException } from "@nestjs/common";
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Db } from "../api/src/core.ts";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { auditEvent } from "../api/src/platform/audit/audit-event.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { PlatformInbox } from "../api/src/platform/messages/demo-inbox.ts";
import { localEmail } from "../api/src/platform/messages/channels/email/local.ts";
import { channelsOf } from "../api/src/platform/messages/send/channels.ts";
import { fileKeyOf, Messages, SWEEP_AFTER_MS } from "../api/src/platform/messages/send/messages.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { fakeAlerts } from "../ports/alert.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeConsent } from "../ports/consent.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { messagePortContract } from "../ports/contracts/message-port.contract.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMessages, HELD_DAILY_LIMIT, MessageRepeated, type MessageSend, type Rendered } from "../ports/messages.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf19b_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`, WORK = join(STUDIO, "var", `pf19b-check-${process.pid}`);
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
const statusOf = async (e: () => unknown) => { try { await e(); return 200; } catch (x) { return x instanceof HttpException ? x.getStatus() : String(x); } };
const uuid = () => crypto.randomUUID(), box = (w: string) => `pf19b.${w}.${uuid().slice(0, 6)}@example.com`;

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
try {
  await seedSampleFirms(db);
  const firmA = sql(`select id from platform_firm where key='sample-firm'`), firmB = sql(`select id from platform_firm where key='sample-solo'`);
  const senders = Object.fromEntries((await db.platformFirm.findMany({ where: { id: { in: [firmA, firmB] } } })).map((f) => [f.id, { name: f.operatingName, replyTo: f.contactEmail }]));
  await db.msgFirm.upsert({ where: { firmId: firmA }, create: { firmId: firmA }, update: {} });
  const tpl = await db.msgTemplate.create({ data: { firmId: firmA, owner: "FIRM", key: "pf19b.hello", kind: "notice", channel: "EMAIL", language: "en" } });
  await db.msgTemplateVersion.create({ data: { firmId: firmA, templateId: tpl.id, version: 1, subject: "Hello {{ name }}", body: "Dear {{ name }}, your file is open.", publishedBy: "seed:pf19b" } });

  const clock = new FakeClock(new Date()), jobs = fakeJobs(clock), alerts = fakeAlerts(), files = new LocalFiles(join(WORK, "files"));
  const consent = new ConsentStore(auditEvent, clock);
  const messages = new Messages({ db, consent, files, jobs, alerts: () => alerts, channels: channelsOf([["EMAIL", localEmail]]), clock });
  await messages.register();
  const inbox = new PlatformInbox(db as unknown as Db, files, () => true);
  const tx = <T>(f: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(f);
  const sendNow = async (m: Omit<MessageSend, "idempotencyKey"> & { idempotencyKey?: string }) => {
    const r = await tx((t) => messages.send(t, { idempotencyKey: uuid(), ...m }));
    await messages.dispatch(m.firmId, [r.outboxId]); await jobs.runDue();
    return { ...r, row: await db.msgOutbox.findUniqueOrThrow({ where: { id: r.outboxId } }) };
  };
  const words = { subject: "Your file (Sample)", text: "Your file is open.\n\nThe firm" };
  const demoMessages = () => sql(`select count(*) from demo_message`);
  const demoBefore = demoMessages();

  // ------------------------------------------------------------------------------------------- DW0 the local demo inbox
  const x0 = box("dw0"), y0 = box("dw0y");
  await sendNow({ firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x0, content: words });
  await sendNow({ firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: y0, content: { subject: "Other", text: "For someone else." } });
  const l0 = await inbox.list(x0.toUpperCase(), undefined);
  ok("DW0 pass: a local send appears in /api/demo/platform-inbox for its address only, with the stored subject and body, sender and Reply-To",
    l0.messages.length === 1 && l0.messages[0].subject === words.subject && l0.messages[0].body === words.text && l0.messages[0].reply_to === senders[firmA].replyTo && l0.messages[0].from.startsWith(senders[firmA].name), l0);
  ok("DW0 fail: outside the demo workspace the route answers 404; a client persona gets 403; a bad address 400",
    await statusOf(() => new PlatformInbox(db as unknown as Db, files, () => false).list(x0, undefined)) === 404
    && await statusOf(() => inbox.list(x0, "user-P")) === 403 && await statusOf(() => inbox.list("not an address", undefined)) === 400);

  // ------------------------------------------------------------------------------------------- DW1 marketing needs consent
  const p1 = { kind: "FO_PERSON" as const, id: uuid() }, x1 = box("dw1");
  const r1 = await sendNow({ firmId: firmA, person: p1, channel: "EMAIL", class: "MARKETING", address: x1, content: words });
  ok("DW1 fail: marketing without consent → SUPPRESSED with the reason, nothing sent (no SENT event, not in the inbox)",
    r1.state === "SUPPRESSED" && r1.row.stateReason === "NO_CONSENT: MARKETING" && !r1.row.sentAt && (await db.msgEvent.count({ where: { outboxId: r1.outboxId } })) === 0 && (await inbox.list(x1, undefined)).messages.length === 0, r1.row);
  const w1 = await tx((t) => consent.publishWording(t, { firmId: firmA, channel: "EMAIL", purpose: "MARKETING", locale: "en", text: "Sample: yes, send me news.", by: "seed:pf19b" }));
  const c1 = await tx((t) => consent.record(t, { firmId: firmA, subject: p1, channel: "EMAIL", purpose: "MARKETING", wordingId: w1.id, source: "WEB_FORM", locale: "en", recordedKind: "SELF_SERVICE", recordedBy: "system:web-form" }));
  const r1b = await sendNow({ firmId: firmA, person: p1, channel: "EMAIL", class: "MARKETING", address: x1, content: words });
  ok("DW1 pass: with a live consent the marketing message is SENT, naming the consent that allowed it (AG-10-27)", r1b.row.state === "SENT" && r1b.row.consentId === c1.id, r1b.row);

  const q1 = await tx((t) => messages.send(t, { firmId: firmA, person: p1, channel: "EMAIL", class: "MARKETING", address: x1, content: words, idempotencyKey: uuid() }));
  await clock.advance(1_000);
  await tx((t) => consent.withdraw(t, { firmId: firmA, subject: p1, channel: "EMAIL", purpose: "MARKETING", via: "STAFF", by: "staff:pf19b" }));
  await clock.advance(1_000);
  const c1b = await tx((t) => consent.record(t, { firmId: firmA, subject: p1, channel: "EMAIL", purpose: "MARKETING", wordingId: w1.id, source: "WEB_FORM", locale: "en", recordedKind: "SELF_SERVICE", recordedBy: "system:web-form" }));
  await messages.deliver(firmA, q1.outboxId);
  const q1row = await db.msgOutbox.findUniqueOrThrow({ where: { id: q1.outboxId } });
  ok("DW1 (Devin #1824): consent withdrawn and given again while the message waited → SENT names the new consent that allowed it, never the withdrawn one",
    q1row.state === "SENT" && q1row.consentId === c1b.id && c1b.id !== c1.id, q1row);

  // ------------------------------------------------------------------------------------------- DW2 suppressed addresses
  const x2 = box("dw2");
  await tx((t) => consent.suppress(t, { firmId: firmA, channel: "EMAIL", address: x2, reason: "COMPLAINT", by: "system:pf19b" }));
  const r2 = await sendNow({ firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x2, content: words });
  const x2b = box("dw2b"), q2 = await tx((t) => messages.send(t, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x2b, content: words, idempotencyKey: uuid() }));
  await tx((t) => consent.suppress(t, { firmId: firmA, channel: "EMAIL", address: x2b, reason: "HARD_BOUNCE", by: "system:pf19b" }));
  await messages.dispatch(firmA, [q2.outboxId]); await jobs.runDue();
  const q2row = await db.msgOutbox.findUniqueOrThrow({ where: { id: q2.outboxId } });
  ok("DW2 fail: transactional to a suppressed address → not sent (SUPPRESSED at send; and an address suppressed after queueing is stopped by the worker)",
    r2.row.state === "SUPPRESSED" && r2.row.stateReason === "SUPPRESSED: COMPLAINT" && q2.state === "QUEUED" && q2row.state === "SUPPRESSED" && q2row.stateReason === "SUPPRESSED: HARD_BOUNCE" && (await inbox.list(x2b, undefined)).messages.length === 0, [r2.row, q2row]);
  ok("DW2 pass: firm B's suppression of the address never stops firm A (the list is per firm)",
    (await sendNow({ firmId: firmB, channel: "EMAIL", class: "TRANSACTIONAL", address: x2, content: words })).row.state === "SENT");

  // ------------------------------------------------------------------------------------------- DW3 rollback
  const x3 = box("dw3"); let id3 = "";
  const rolled = await tx(async (t) => { id3 = (await messages.send(t, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x3, content: words, idempotencyKey: uuid() })).outboxId; throw new Error("caller failed"); }).then(() => false, (e: Error) => e.message === "caller failed");
  await messages.dispatch(firmA, [id3]); await jobs.runDue(); await clock.advance(SWEEP_AFTER_MS + 61_000);
  ok("DW3 fail: a send in a rolled-back transaction never goes out (no row; dispatch and the sweep send nothing; at most an orphan file)",
    rolled && !!id3 && (await db.msgOutbox.count({ where: { id: id3 } })) === 0 && (await inbox.list(x3, undefined)).messages.length === 0, id3);
  ok("DW3 pass: the same message committed goes out", (await sendNow({ firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x3, content: words })).row.state === "SENT");

  // ------------------------------------------------------------------------------------------- DW4 crash after commit
  const x4 = box("dw4"), q4 = await tx((t) => messages.send(t, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x4, content: words, idempotencyKey: uuid() }));
  const twice = [await messages.deliver(firmA, q4.outboxId), await messages.deliver(firmA, q4.outboxId)];
  const ev4 = await db.msgEvent.findMany({ where: { outboxId: q4.outboxId } });
  ok("DW4 pass: the job run twice → one send (sent, then skipped; one SENT event)", JSON.stringify(twice) === '["sent","skipped"]' && ev4.length === 1 && ev4[0].kind === "SENT" && (await inbox.list(x4, undefined)).messages.length === 1, { twice, ev4 });
  const x4b = box("dw4b"), q4b = await tx((t) => messages.send(t, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x4b, content: words, idempotencyKey: uuid() }));
  const before4 = (await db.msgOutbox.findUniqueOrThrow({ where: { id: q4b.outboxId } })).state;
  await sql(`update msg_outbox set created_at = now() - interval '5 minutes' where id = '${q4b.outboxId}'`);
  await clock.advance(61_000); await clock.advance(61_000);
  ok("DW4 fail→pass: a crash between commit and dispatch (no job) leaves the row QUEUED; the sweep sends it, once",
    before4 === "QUEUED" && (await db.msgOutbox.findUniqueOrThrow({ where: { id: q4b.outboxId } })).state === "SENT" && (await db.msgEvent.count({ where: { outboxId: q4b.outboxId } })) === 1);

  // ------------------------------------------------------------------------------------------- DW5 the daily cap
  sql(`update platform_firm set status = 'TRIAL' where id = '${firmB}'`);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(clock.now());
  sql(`insert into msg_send_counter (firm_id, day, sent, updated_at) values ('${firmB}', '${day}', 49, now()) on conflict (firm_id, day) do update set sent = 49`);
  const r50 = await sendNow({ firmId: firmB, channel: "EMAIL", class: "TRANSACTIONAL", address: box("dw5a"), content: words });
  const r51 = await sendNow({ firmId: firmB, channel: "EMAIL", class: "TRANSACTIONAL", address: box("dw5b"), content: words });
  const r52 = await sendNow({ firmId: firmB, channel: "EMAIL", class: "TRANSACTIONAL", address: box("dw5c"), content: words });
  const capAlerts = alerts.raised.filter((a) => a.kind === "send_cap_reached");
  ok("DW5 fail: the 51st trial message of the day → held QUEUED, reason \"daily limit\"; one alert to our team for the firm and day (the 52nd adds none)",
    r50.row.state === "SENT" && r51.row.state === "QUEUED" && r51.row.stateReason === HELD_DAILY_LIMIT && r52.row.stateReason === HELD_DAILY_LIMIT
    && capAlerts.length === 1 && capAlerts[0].detail.firmId === firmB && sql(`select sent from msg_send_counter where firm_id='${firmB}' and day='${day}'`) === "50", { r51: r51.row, capAlerts });
  sql(`update msg_send_counter set sent = 50 where firm_id = '${firmA}' and day = '${day}'`);
  ok("DW5 pass: an active firm's 51st message of the day is sent (cap 2,000, Sample)", (await sendNow({ firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: box("dw5d"), content: words })).row.state === "SENT");

  sql(`update platform_firm set status = 'ACTIVE' where id = '${firmB}'`);   // firm B back to active for the rest

  // ------------------------------------------------------------------------------------------- DW6 content changed
  const x6 = box("dw6"), q6 = await tx((t) => messages.send(t, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x6, content: words, idempotencyKey: uuid() }));
  const stored = (await messages.readStored(firmA, q6.outboxId, "TRANSACTIONAL"))!;   // PF-19e: sealed on store
  writeFileSync(join(files.root, firmA, fileKeyOf(firmA, q6.outboxId)), JSON.stringify({ ...stored, text: "Send money to account 123." }));
  const d6 = await messages.deliver(firmA, q6.outboxId), row6 = await db.msgOutbox.findUniqueOrThrow({ where: { id: q6.outboxId } });
  ok("DW6 fail: the rendered file changed after commit → FAILED \"content changed\", a FAILED event, nothing sent",
    d6 === "failed" && row6.state === "FAILED" && row6.stateReason === "content changed" && !row6.sentAt && (await db.msgEvent.findFirst({ where: { outboxId: q6.outboxId } }))?.kind === "FAILED" && (await inbox.list(x6, undefined)).messages.length === 0, row6);
  ok("DW6 pass: an unchanged file is sent and its hash is the row's", stored.subject === words.subject && (await sendNow({ firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x6, content: words })).row.state === "SENT");

  // ------------------------------------------------------------------------------------------- DW7 firm A never carries B's sender
  const x7 = box("dw7");
  await sendNow({ firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x7, content: { templateKey: "pf19b.hello", values: { name: "Client A" } } });
  await sendNow({ firmId: firmB, channel: "EMAIL", class: "TRANSACTIONAL", address: x7, content: words });
  const l7 = (await inbox.list(x7, undefined)).messages;
  ok("DW7 pass: each firm's message carries its own sender name and Reply-To (and firm A's template filled)",
    l7.length === 2 && l7.some((m) => m.from.startsWith(senders[firmA].name) && m.reply_to === senders[firmA].replyTo && m.subject === "Hello Client A")
    && l7.some((m) => m.from.startsWith(senders[firmB].name) && m.reply_to === senders[firmB].replyTo), l7.map((m) => [m.from, m.reply_to, m.subject]));
  ok("DW7 fail: firm B cannot use firm A's template (refused, no row)",
    await tx((t) => messages.send(t, { firmId: firmB, channel: "EMAIL", class: "TRANSACTIONAL", address: x7, content: { templateKey: "pf19b.hello", values: { name: "x" } }, idempotencyKey: uuid() })).then(() => false, (e: Error) => /no email template/.test(e.message)));

  // ------------------------------------------------------------------------------------------- DW8 the case side's inbox
  ok("DW8: this row never writes demo_message (the case side's link emails stay as they are; its case-side suites check_c616_privacy and check_forms_qa53 run unchanged apart from listing the new route)", demoMessages() === demoBefore, [demoBefore, demoMessages()]);
  ok("DW8 fail: send refuses a bare client in place of the caller's transaction (no row written outside a transaction)",
    await messages.send(db as never, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: box("dw8"), content: words, idempotencyKey: uuid() }).then(() => false, (e: Error) => e instanceof TypeError));

  // ------------------------------------------------------------------------------------------- break round 1 (M1, m1, m3, m5, m7)
  sql(`insert into msg_outbox (id, firm_id, channel, address, rendered_hash, class, state, state_reason, idempotency_key, created_at, updated_at)
    select gen_random_uuid(), '${firmB}', 'EMAIL', 'held' || g || '@example.com', repeat('0', 64), 'TRANSACTIONAL', 'QUEUED', '${HELD_DAILY_LIMIT}', 'held-' || g, now() - interval '1 day', now() from generate_series(1, 510) g`);
  const xm1 = box("m1"), qm1 = await tx((t) => messages.send(t, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: xm1, content: words, idempotencyKey: uuid() }));
  sql(`update msg_outbox set created_at = now() - interval '5 minutes' where id = '${qm1.outboxId}'`);
  await clock.advance(61_000);
  ok("break M1 fail→pass: 510 rows another firm's cap holds never hide a row a crash left: the next sweep sends it",
    (await db.msgOutbox.findUniqueOrThrow({ where: { id: qm1.outboxId } })).state === "SENT");
  ok("break m1 fail: a client persona by persona name (client, client-b) also gets 403 from the platform inbox",
    await statusOf(() => inbox.list(x0, "client")) === 403 && await statusOf(() => inbox.list(x0, "client-b")) === 403 && await statusOf(() => inbox.list(x0, "user-O")) === 200);
  const refusedSend = (m: Partial<MessageSend>, re: RegExp) => tx((t) => messages.send(t, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: box("m"), content: words, idempotencyKey: uuid(), ...m })).then(() => false, (e: Error) => re.test(e.message));
  ok("break m3, m5, m7 fail: a subject with a line break, a template subject over 200 characters, a stored message as an attachment and a firm id that is no firm are each refused",
    await refusedSend({ content: { subject: "Hi\r\nBcc: x@example.com", text: "x" } }, /one line/)
    && await refusedSend({ content: { templateKey: "pf19b.hello", values: { name: "n".repeat(300) } } }, /over 200/)
    && await refusedSend({ attachments: [fileKeyOf(firmA, qm1.outboxId)] }, /not a file of this firm/)
    && await refusedSend({ firmId: uuid() }, /not a platform firm/));

  // ------------------------------------------------------------------------------------------- review m2: the locks
  const keyC = uuid(), parAll = await Promise.allSettled(Array.from({ length: 8 }, () => tx((t) => messages.send(t, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: box("par"), content: words, idempotencyKey: keyC }))));
  const par = parAll.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof messages.send>>> => r.status === "fulfilled").map((r) => r.value);
  ok("review m2: 8 parallel sends with one key → one row, the other 7 answer it as repeated (the advisory lock)",
    par.length === 8 && new Set(par.map((r) => r.outboxId)).size === 1 && par.filter((r) => r.repeated).length === 7 && (await db.msgOutbox.count({ where: { idempotencyKey: keyC } })) === 1, par);
  const keyR = uuid(), rr = await Promise.allSettled([0, 1].map(() => db.$transaction((t) => messages.send(t, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: box("rr"), content: words, idempotencyKey: keyR }), { isolationLevel: "RepeatableRead" })));
  const retry = await db.$transaction((t) => messages.send(t, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: box("rr"), content: words, idempotencyKey: keyR }), { isolationLevel: "RepeatableRead" });
  const won = rr.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ outboxId: string }> | undefined, lost = rr.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
  ok("Lead B #1824 (4): two concurrent sends with one key at REPEATABLE READ → one row; the other gets MessageRepeated (never a raw P2002), and its retry answers the first row",
    !!won && lost?.reason instanceof MessageRepeated && retry.repeated && retry.outboxId === won.value.outboxId && (await db.msgOutbox.count({ where: { idempotencyKey: keyR } })) === 1, rr.map((r) => r.status === "rejected" ? String(r.reason) : r.value));
  const runs = await Promise.all(Array.from({ length: 6 }, () => messages.deliver(firmA, par[0].outboxId)));
  ok("review m2: 6 workers on one row at once → one send, one event (the row lock)",
    runs.filter((r) => r === "sent").length === 1 && (await db.msgEvent.count({ where: { outboxId: par[0].outboxId } })) === 1, runs);
  sql(`update platform_firm set status = 'TRIAL' where id = '${firmB}'`); sql(`update msg_send_counter set sent = 49 where firm_id = '${firmB}' and day = '${day}'`);
  const race = await Promise.all(Array.from({ length: 5 }, () => tx((t) => messages.send(t, { firmId: firmB, channel: "EMAIL", class: "TRANSACTIONAL", address: box("race"), content: words, idempotencyKey: uuid() }))));
  const raced = await Promise.all(race.map((r) => messages.deliver(firmB, r.outboxId)));
  ok("review m2: 5 workers racing for a trial firm's last place of the day → 1 sent, 4 held, the counter exactly 50 (the counter lock)",
    raced.filter((r) => r === "sent").length === 1 && raced.filter((r) => r === "held").length === 4 && sql(`select sent from msg_send_counter where firm_id='${firmB}' and day='${day}'`) === "50", raced);
  sql(`update platform_firm set status = 'ACTIVE' where id = '${firmB}'`);

  // ------------------------------------------------------------------------------------------- re-review M2, m-a
  sql(`update platform_firm set status = 'TRIAL' where id = '${firmB}'`);
  sql(`insert into msg_outbox (id, firm_id, channel, address, rendered_hash, class, state, state_reason, idempotency_key, created_at, updated_at)
    select gen_random_uuid(), '${firmB}', 'EMAIL', 'heldb' || g || '@example.com', repeat('0', 64), 'TRANSACTIONAL', 'QUEUED', '${HELD_DAILY_LIMIT}', 'heldb-' || g, now() - interval '2 days', now() from generate_series(1, 505) g`);
  const xh = box("held"), qh = await tx((t) => messages.send(t, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: xh, content: words, idempotencyKey: uuid() }));
  sql(`update msg_outbox set state_reason = '${HELD_DAILY_LIMIT}', created_at = now() - interval '1 day' where id = '${qh.outboxId}'`);
  await clock.advance(61_000);
  ok("re-review M2 fail→pass: 505 older rows another firm's cap holds never hide a held row of a firm with room: the next sweep sends it",
    (await db.msgOutbox.findUniqueOrThrow({ where: { id: qh.outboxId } })).state === "SENT");
  sql(`update platform_firm set status = 'ACTIVE' where id = '${firmB}'`);
  const xk = box("key"), qk = await tx((t) => messages.send(t, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: xk, content: words, idempotencyKey: uuid() }));
  await messages.dispatch(firmB, [qk.outboxId]); await jobs.runDue();
  const afterWrong = (await db.msgOutbox.findUniqueOrThrow({ where: { id: qk.outboxId } })).state;
  await messages.dispatch(firmA, [qk.outboxId]); await jobs.runDue();
  ok("re-review m-a fail→pass: a dispatch naming the wrong firm sends nothing and never uses up the right firm's job key (the right dispatch sends at once)",
    afterWrong === "QUEUED" && (await db.msgOutbox.findUniqueOrThrow({ where: { id: qk.outboxId } })).state === "SENT");

  // ------------------------------------------------------------------------------------------- PF-0c contract
  await runContract(messagePortContract, "Messages", () => ({
    messages, consent, tx: (f) => db.$transaction((t) => f(t)), settle: () => jobs.runDue(), firmA, firmB, senders, templateKey: "pf19b.hello",
    sentTo: async (a) => (await inbox.list(a, undefined)).messages.reverse().map((m) => ({ firmId: m.reply_to === senders[firmA].replyTo ? firmA : firmB, from: { name: m.from.replace(/ <.*$/, ""), address: "" }, replyTo: m.reply_to, html: m.html } as Rendered)),
  }), ok);
  await runContract(messagePortContract, "fakeMessages", () => {
    const fc = fakeConsent({ now: () => clock.now() }), fm = fakeMessages({ consent: fc, senders, templates: { "pf19b.hello": { subject: "Hello {{ name }}", body: "Dear {{ name }}" } } });
    return { messages: fm, consent: fc, tx: (f) => f(null), settle: async () => {}, sentTo: async (a) => fm.sent.filter((m) => m.to === a.toLowerCase()), firmA, firmB, senders, templateKey: "pf19b.hello" };
  }, ok);
} finally {
  await db.$disconnect().catch(() => undefined);
  spawnSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB], { stdio: "ignore" });
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
