// PF-19b part 3 (R1.48; brief lead-b-briefs/PF-19b3.md): a message's delivery state and the staff read. DW1-DW5, each a
// pass and a fail: SES Delivery notices (signed by a key this run makes) move SENT to DELIVERED once; states only move
// forward; the signature and topic checks are Bounce's (and PF-19b part 2's suite passes unchanged); the local adapter's
// test events (a Delivery, or a hard Bounce for a Sample bounce address) within one worker cycle with no SES; the staff
// read's service (who sees which record's messages; no body, no full address). One scratch database with every
// migration and the Sample firms; fakeJobs on a fake clock; files in a scratch folder. US$0, nothing leaves the machine.
//   tsx studio/tests/check_pf19b3_delivery.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { createSign, generateKeyPairSync, randomUUID } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import type { StaffContext } from "../api/src/platform/identity/keys.ts";
import { NoticeRefused, SesNotices, snsStringToSign } from "../api/src/platform/messages/channels/email/bounces.ts";
import { connectLocalNotices, localEmail, localNoticesSettled, SAMPLE_BOUNCE_ADDRESSES } from "../api/src/platform/messages/channels/email/local.ts";
import { SES_PROVIDER } from "../api/src/platform/messages/channels/email/ses.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { channelsOf } from "../api/src/platform/messages/send/channels.ts";
import { MessagesMail } from "../api/src/platform/messages/send/mail.ts";
import { Messages, type ChannelAdapter } from "../api/src/platform/messages/send/messages.ts";
import { maskAddress, NOT_FOUND, PAGE, StaffMessages } from "../api/src/platform/messages/staff-routes.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { fakeAlerts } from "../ports/alert.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import type { MessageSend } from "../ports/messages.ts";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const uuid = () => randomUUID(), box = (w: string) => `pf19b3.${w}.${uuid().slice(0, 6)}@example.com`;

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf19b3_${process.pid}`, DBURL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`, WORK = join(STUDIO, "var", `pf19b3-check-${process.pid}`);
const sql = (q: string) => execFileSync(join(BIN, "psql"), [DBURL, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim().split("\n")[0];
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [DBURL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DBURL, options: "-c TimeZone=UTC" }) });

// SNS: a key pair made by this run stands for Amazon's signing certificate (as PF-19b part 2's suite).
const sns = generateKeyPairSync("rsa", { modulusLength: 2048 }), CERT_URL = "https://sns.ca-central-1.amazonaws.com/SimpleNotificationService-rec.pem";
const TOPIC = "arn:aws:sns:ca-central-1:000000000000:ses-notices";
const fetchCert = async (url: string) => { if (url !== CERT_URL) throw new Error("unexpected certificate"); return sns.publicKey.export({ type: "spki", format: "pem" }).toString(); };
const signed = (message: object, o: { id?: string; topic?: string } = {}) => {
  const n: Record<string, string> = { Type: "Notification", MessageId: o.id ?? uuid(), TopicArn: o.topic ?? TOPIC, Message: JSON.stringify(message), Timestamp: new Date().toISOString(), SignatureVersion: "2", SigningCertURL: CERT_URL };
  n.Signature = createSign("RSA-SHA256").update(snsStringToSign(n)).sign(sns.privateKey, "base64");
  return n;
};
const mail = (firmId: string, outboxId: string, sesId: string) => ({ messageId: sesId, tags: { firm: [firmId], outbox: [outboxId] } });
const delivery = (firmId: string, outboxId: string, sesId: string, to: string) => ({ notificationType: "Delivery", mail: mail(firmId, outboxId, sesId), delivery: { recipients: [to], smtpResponse: "250 OK" } });
const bounce = (firmId: string, outboxId: string, sesId: string, to: string) => ({ notificationType: "Bounce", mail: mail(firmId, outboxId, sesId), bounce: { bounceType: "Permanent", bounceSubType: "General", bouncedRecipients: [{ emailAddress: to }] } });
/** SES's answer recorded: the provider id SES would give, no network (part 2's suite proves the real adapter). */
const recordedSes: ChannelAdapter = { provider: SES_PROVIDER, async deliver(_tx, r) { return { providerId: `${SES_PROVIDER}:0101019a-rec-${r.outboxId.slice(0, 8)}` }; } };

try {
  await seedSampleFirms(db);
  await seedSampleFirmsFrontOffice(db);
  const firmA = sql(`select id from platform_firm where key='sample-firm'`), firmB = sql(`select id from platform_firm where key='sample-solo'`);
  const clock = new FakeClock(new Date()), jobs = fakeJobs(clock), files = new LocalFiles(join(WORK, "files")), consent = new ConsentStore(auditEvent, clock);
  const logs: string[] = [], log = (l: string) => { logs.push(l); };
  const notices = new SesNotices({ db, consent, fetchCert, topics: [TOPIC], log });
  const viaSes = new Messages({ db, consent, files, jobs, alerts: () => fakeAlerts(), channels: channelsOf([["EMAIL", recordedSes]]), clock });
  await viaSes.register();
  const row = (id: string) => db.msgOutbox.findUniqueOrThrow({ where: { id } });
  const events = (id: string, kind?: string) => db.msgEvent.count({ where: { outboxId: id, ...(kind ? { kind: kind as never } : {}) } });
  const words = { subject: "Your consultation (Sample)", text: "SECRET-BODY-TEXT: see you on Monday." };
  const sendNow = async (m: Messages, x: Omit<MessageSend, "idempotencyKey">, dispatch = true) => {
    const r = await db.$transaction((t) => m.send(t, { idempotencyKey: uuid(), ...x }));
    if (dispatch) { await m.dispatch(x.firmId, [r.outboxId]); await jobs.runDue(); }
    return { id: r.outboxId, row: await row(r.outboxId) };
  };
  const sesIdOf = (r: { providerId: string | null }) => r.providerId!.slice(SES_PROVIDER.length + 1);

  // ------------------------------------------------------------------------------------------ DW1 Delivery → DELIVERED once
  const x1 = box("dw1"), s1 = await sendNow(viaSes, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x1, content: words });
  const n1 = signed(delivery(firmA, s1.id, sesIdOf(s1.row), x1));
  const a1 = await notices.receive(n1), r1 = await row(s1.id);
  ok("DW1 pass: a sent message plus a signed Delivery notice → DELIVERED and one DELIVERED event", s1.row.state === "SENT" && a1 === "applied" && r1.state === "DELIVERED" && (await events(s1.id, "DELIVERED")) === 1, { a1, state: r1.state });
  const a1b = await notices.receive(n1);
  ok("DW1 fail: the same notice twice → repeated, still one DELIVERED event, still DELIVERED", a1b === "repeated" && (await events(s1.id, "DELIVERED")) === 1 && (await row(s1.id)).state === "DELIVERED", a1b);
  const x1o = box("dw1o"), s1o = await sendNow(viaSes, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x1o, content: words });
  const a1o = await notices.receive(signed(delivery(firmB, s1o.id, sesIdOf(s1o.row), x1o)));
  const a1w = await notices.receive(signed(delivery(firmA, s1o.id, "0101019a-not-ours", x1o)));
  ok("DW1 fail: a Delivery naming another firm, or another SES message id → ignored; the row stays SENT with no event", a1o === "ignored" && a1w === "ignored" && (await row(s1o.id)).state === "SENT" && (await events(s1o.id, "DELIVERED")) === 0, { a1o, a1w });

  // ------------------------------------------------------------------------------------------ DW2 states only move forward
  const x2 = box("dw2"), s2 = await sendNow(viaSes, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x2, content: words });
  await notices.receive(signed(bounce(firmA, s2.id, sesIdOf(s2.row), x2)));
  const before2 = logs.length, a2 = await notices.receive(signed(delivery(firmA, s2.id, sesIdOf(s2.row), x2))), r2 = await row(s2.id);
  ok("DW2 pass: a Bounce and then a Delivery → still BOUNCED (hard bounce); the Delivery is ignored and logged by ids only",
    a2 === "ignored" && r2.state === "BOUNCED" && r2.stateReason === "hard bounce" && (await events(s2.id, "DELIVERED")) === 0 && logs.slice(before2).some((l) => l.includes(s2.id) && l.includes("BOUNCED") && !l.includes(x2)), { a2, r2: r2.state, logs: logs.slice(before2) });
  const x2q = box("dw2q"), s2q = await sendNow(viaSes, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x2q, content: words }, false);
  const before2q = logs.length, a2q = await notices.receive(signed(delivery(firmA, s2q.id, "0101019a-early", x2q)));
  ok("DW2 fail: a Delivery on a QUEUED row → ignored and logged, no state jump, no event",
    s2q.row.state === "QUEUED" && a2q === "ignored" && (await row(s2q.id)).state === "QUEUED" && (await events(s2q.id)) === 0 && logs.slice(before2q).some((l) => l.includes(s2q.id) && l.includes("QUEUED")), { a2q, logs: logs.slice(before2q) });
  const x2d = box("dw2d"), s2d = await sendNow(viaSes, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x2d, content: words });
  await notices.receive(signed(delivery(firmA, s2d.id, sesIdOf(s2d.row), x2d)));
  await notices.receive(signed(bounce(firmA, s2d.id, sesIdOf(s2d.row), x2d)));
  ok("DW2 pass: a Delivery and then a hard Bounce → BOUNCED (a later bounce still counts, forward), the address suppressed",
    (await row(s2d.id)).state === "BOUNCED" && (await db.msgSuppression.count({ where: { firmId: firmA, address: x2d } })) === 1);
  // A FAILED row is final: a hard bounce suppresses the address but never makes it BOUNCED.
  const x2f = box("dw2f"), s2f = await sendNow(viaSes, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x2f, content: words });
  sql(`update msg_outbox set state = 'FAILED', state_reason = 'test: failed' where id = '${s2f.id}'`);
  await notices.receive(signed(bounce(firmA, s2f.id, sesIdOf(s2f.row), x2f)));
  const a2f = await notices.receive(signed(delivery(firmA, s2f.id, sesIdOf(s2f.row), x2f)));
  ok("DW2 fail: FAILED is final: a Bounce leaves it FAILED (the address is suppressed), a Delivery is ignored", (await row(s2f.id)).state === "FAILED" && a2f === "ignored");

  // ------------------------------------------------------------------------------------------ DW3 signature and topic
  const x3 = box("dw3"), s3 = await sendNow(viaSes, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x3, content: words });
  const good3 = signed(delivery(firmA, s3.id, sesIdOf(s3.row), x3));
  const tampered = { ...good3, Message: JSON.stringify({ ...delivery(firmA, s3.id, sesIdOf(s3.row), x3), extra: 1 }) };
  const refusedOf = (n: unknown) => notices.receive(n).then(() => "accepted", (e: unknown) => (e instanceof NoticeRefused ? `refused: ${e.message}` : `error: ${String(e)}`));
  const bad = await refusedOf(tampered), topic = await refusedOf(signed(delivery(firmA, s3.id, sesIdOf(s3.row), x3), { topic: "arn:aws:sns:ca-central-1:999999999999:someone-else" }));
  ok("DW3 fail: a Delivery with a bad signature, or from another topic → refused as for Bounce; the row stays SENT",
    bad === "refused: signature does not verify" && topic === "refused: not our topic" && (await row(s3.id)).state === "SENT" && (await events(s3.id, "DELIVERED")) === 0, { bad, topic });
  ok("DW3 pass: the same notice signed properly is applied", (await notices.receive(good3)) === "applied" && (await row(s3.id)).state === "DELIVERED");
  // Its own tsx with absolute paths: the suite runner gives this file a relative --tsconfig, which a child started in another folder cannot find.
  const part2 = spawnSync(join(STUDIO, "node_modules", ".bin", "tsx"), ["--tsconfig", join(STUDIO, "api", "tsconfig.json"), join(STUDIO, "tests", "check_pf19b2_ses.ts")], { encoding: "utf8", timeout: 600_000, cwd: STUDIO, env: process.env });
  const tally = /(\d+) passed, (\d+) failed/.exec(part2.stdout ?? "");
  ok("DW3 pass: every PF-19b part 2 test passes unchanged (tests/check_pf19b2_ses.ts)", part2.status === 0 && tally && Number(tally[1]) > 0 && tally[2] === "0", { status: part2.status, tally: tally?.[0], err: (part2.stderr ?? "").slice(-300) });

  // ------------------------------------------------------------------------------------------ DW4 the demo copy's test events
  const localNotices = new SesNotices({ db, consent, log });
  const localJobs = fakeJobs(clock);   // its own runner: the local adapter's worker (SES's above has its own)
  const viaLocal = new Messages({ db, consent, files, jobs: localJobs, alerts: () => fakeAlerts(), channels: channelsOf([["EMAIL", localEmail]]), clock });
  await viaLocal.register();
  const mailPort = new MessagesMail({ db, messages: viaLocal, files, log });
  const sendLocal = async (x: Omit<MessageSend, "idempotencyKey">) => { const r = await db.$transaction((t) => viaLocal.send(t, { idempotencyKey: uuid(), ...x })); await viaLocal.dispatch(x.firmId, [r.outboxId]); await localJobs.runDue(); return { id: r.outboxId }; };
  // Unconnected (every earlier suite): the local adapter's row stays SENT.
  connectLocalNotices(null);
  const x4u = box("dw4u"), s4u = await sendLocal({ firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x4u, content: words });
  await localNoticesSettled();
  ok("DW4 fail: with no notice handler connected (the suites before part 3) a local send stays SENT with no event but SENT", (await row(s4u.id)).state === "SENT" && (await events(s4u.id)) === 1);
  connectLocalNotices(localNotices, log);
  const person4 = { kind: "FO_PERSON" as const, id: uuid() }, x4 = box("dw4");
  // A booking email, as FO-3 sends it: MailPort with the job's key (one worker cycle: dispatch, then the job runs once).
  const m4 = await mailPort.send({ firmId: firmA, to: x4, replyTo: "office@sample-firm.example.com", class: "TRANSACTIONAL", person: person4, idempotencyKey: `booking:${uuid()}:1:mail-client`, templateKey: "booking.confirmed", subject: "Booked (Sample)", text: words.text });
  await localJobs.runDue(); await localNoticesSettled();
  const r4 = await row(m4.messageId);
  ok("DW4 pass: on the demo copy (local adapter, no SES) a booking email reads DELIVERED within one worker cycle, with SENT and DELIVERED events",
    r4.state === "DELIVERED" && r4.providerId === `local:${m4.messageId}` && (await events(m4.messageId, "SENT")) === 1 && (await events(m4.messageId, "DELIVERED")) === 1, { state: r4.state });
  const xb = SAMPLE_BOUNCE_ADDRESSES[0];
  const b4 = await mailPort.send({ firmId: firmA, to: xb, replyTo: "office@sample-firm.example.com", class: "TRANSACTIONAL", person: person4, idempotencyKey: `booking:${uuid()}:1:mail-client`, subject: "Booked (Sample)", text: words.text });
  await localJobs.runDue(); await localNoticesSettled();
  const rb = await row(b4.messageId);
  const next = await mailPort.send({ firmId: firmA, to: xb, replyTo: "office@sample-firm.example.com", class: "TRANSACTIONAL", person: person4, subject: "Again (Sample)", text: words.text }).then(() => "sent", (e: Error) => e.message);
  ok("DW4 pass: a Sample bounce address reads BOUNCED (hard bounce) and the next send to it is suppressed (not sent)",
    rb.state === "BOUNCED" && rb.stateReason === "hard bounce" && (await db.msgSuppression.count({ where: { firmId: firmA, address: xb, reason: "HARD_BOUNCE" } })) === 1 && /not sent/.test(next), { rb: rb.state, next });
  // The test event runs only after the worker commits: a send that rolls back is never "delivered".
  const x4r = box("dw4r"), q4r = await db.$transaction((t) => viaLocal.send(t, { firmId: firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: x4r, content: words, idempotencyKey: uuid() }));
  const before4r = logs.length;
  await db.$transaction(async (tx) => { await localEmail.deliver(tx, { outboxId: q4r.outboxId, firmId: firmA, to: x4r } as never); throw new Error("rolled back (test)"); }).catch(() => undefined);
  await localNoticesSettled();
  ok("DW4 fail: a send whose transaction rolls back leaves the row QUEUED; its test event is ignored and logged", (await row(q4r.outboxId)).state === "QUEUED" && (await events(q4r.outboxId)) === 0 && logs.slice(before4r).some((l) => l.includes(q4r.outboxId) && l.includes("QUEUED")), logs.slice(before4r));
  const p4 = await mailPort.send({ platformAccount: true, to: box("dw4p"), replyTo: "no-reply@expatready.example", class: "TRANSACTIONAL", subject: "Verify (Sample)", text: "x" } as never);
  await localJobs.runDue(); await localNoticesSettled();
  ok("DW4 fail: a platform account message (no firm) gets no test event and stays SENT", (await row(p4.messageId)).state === "SENT");
  connectLocalNotices(null);

  // ------------------------------------------------------------------------------------------ DW5 the staff read
  await writeSetting(db, { firmId: firmA, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:pf19b3", workspaceId: await platformAuditWorkspaceId(db), reason: "PF-19b part 3 test" });
  const keysOf = (role: string) => sql(`select string_agg(permission_key, ',') from platform_role_permission where role = '${role}'`).split(",");
  const staffIn = (firmId: string, role: string) => {
    const id = sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${firmId}', 'pf19b3-${role.toLowerCase()}-${uuid().slice(0, 6)}@example.com', 'Sample ${role}', 'pf19b3-${uuid().slice(0, 8)}', now()) returning id`);
    sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${firmId}', '${id}', '${role}', 'seed:pf19b3')`);
    const key = sql(`select key from platform_firm where id = '${firmId}'`);
    return { staffId: id, firmId, firmKey: key, roles: [role], keys: keysOf(role), duties: [], authTime: Math.floor(Date.now() / 1000), via: "local" } as StaffContext;
  };
  const officer = staffIn(firmA, "CASE_OFFICER"), reader = staffIn(firmA, "READ_ONLY"), other = staffIn(firmB, "OWNER");
  const personId = sql(`insert into fo_person (firm_id, given_names, family_name, email, created_by, updated_at) values ('${firmA}', 'Priya', 'Sample', 'priya.sample@example.com', 'seed:pf19b3', now()) returning id`);
  const leadId = sql(`insert into fo_lead (firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values ('${firmA}', '${personId}', 'MANUAL', 'Phone (Sample)', '${officer.staffId}', 'seed:pf19b3', now()) returning id`);
  const subject = { kind: "FO_PERSON" as const, id: personId }, addr = "priya.sample@example.com";
  const sent5 = await sendNow(viaSes, { firmId: firmA, person: subject, channel: "EMAIL", class: "TRANSACTIONAL", address: addr, content: words });
  await notices.receive(signed(delivery(firmA, sent5.id, sesIdOf(sent5.row), addr)));
  const staff = new StaffMessages(db as never);
  const listed = await staff.list(officer, { subjectKind: "LEAD", subjectId: leadId });
  const m5 = listed.messages[0], text5 = JSON.stringify(listed);
  ok("DW5 pass: the lead's owner sees the lead's messages with state, class, channel, events with times and the from-name",
    listed.messages.length === 1 && m5.state === "DELIVERED" && m5.class === "TRANSACTIONAL" && m5.channel === "EMAIL" && m5.events.map((e) => e.kind).join(",") === "SENT,DELIVERED"
    && m5.events.every((e) => !Number.isNaN(Date.parse(e.at))) && m5.fromName === sql(`select operating_name from platform_firm where id = '${firmA}'`), listed);
  ok("DW5 pass: the address is masked to its first letter and domain; no body text and no full address in the answer",
    m5.address === "p…@example.com" && m5.address === maskAddress("EMAIL", addr) && !text5.includes(addr) && !text5.includes("SECRET-BODY-TEXT") && !text5.includes("Your consultation"), text5.slice(0, 400));
  const byPerson = await staff.list(officer, { subjectKind: "FO_PERSON", subjectId: personId });
  ok("DW5 pass: the same messages by the person (FO_PERSON) as by the lead", byPerson.messages.length === 1 && byPerson.messages[0].id === m5.id);
  const status = (p: Promise<unknown>) => p.then(() => 200, (e: { getStatus?: () => number; getResponse?: () => { detail?: string } }) => `${e.getStatus?.()}:${e.getResponse?.().detail}`);
  const nf = `404:${NOT_FOUND}`;
  const ro = await status(staff.list(reader, { subjectKind: "LEAD", subjectId: leadId })), roP = await status(staff.list(reader, { subjectKind: "FO_PERSON", subjectId: personId }));
  ok("DW5 fail: a Read-only person who cannot see the lead (another's, everyone-sees-all off) → 404, by lead and by person", ro === nf && roP === nf, { ro, roP });
  const fb = await status(staff.list(other, { subjectKind: "LEAD", subjectId: leadId })), fbP = await status(staff.list(other, { subjectKind: "FO_PERSON", subjectId: personId }));
  ok("DW5 fail: firm B's Owner → 404 with the same words, by lead and by person", fb === nf && fbP === nf, { fb, fbP });
  const noKey = await status(staff.list({ ...officer, keys: officer.keys.filter((k) => k !== "agent/prospect:show") }, { subjectKind: "LEAD", subjectId: leadId }));
  const caseNoKey = await status(staff.list({ ...officer, keys: officer.keys.filter((k) => k !== "agent/case:show") }, { subjectKind: "CASE_PARTY", subjectId: uuid() }));
  const caseNone = await status(staff.list(officer, { subjectKind: "CASE_PARTY", subjectId: uuid() }));
  const kind = await status(staff.list(officer, { subjectKind: "STAFF", subjectId: officer.staffId })), junk = await status(staff.list(officer, { subjectKind: "LEAD", subjectId: "not-an-id" }));
  ok("DW5 fail: no agent/prospect:show, a case party without agent/case:show or in no case of the firm, a kind not offered, a malformed id → the same 404",
    [noKey, caseNoKey, caseNone, kind, junk].every((s) => s === nf), { noKey, caseNoKey, caseNone, kind, junk });
  sql(`update fo_lead set owner_staff_id = null where id = '${leadId}'`);
  ok("DW5 pass: an unassigned lead is seen by a Read-only person (view.all: Unassigned leads are visible)", (await staff.list(reader, { subjectKind: "LEAD", subjectId: leadId })).messages.length === 1);
  // Paging: 50 a page, newest first, then the rest.
  const many = { kind: "FO_PERSON" as const, id: sql(`insert into fo_person (firm_id, given_names, created_by, updated_at) values ('${firmA}', 'Paged', 'seed:pf19b3', now()) returning id`) };
  sql(`insert into fo_lead (firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values ('${firmA}', '${many.id}', 'MANUAL', 'Phone (Sample)', '${officer.staffId}', 'seed:pf19b3', now())`);
  for (let i = 0; i <= PAGE; i++) await db.$transaction((t) => viaSes.send(t, { firmId: firmA, person: many, channel: "EMAIL", class: "TRANSACTIONAL", address: `paged${i}@example.com`, content: words, idempotencyKey: uuid() }));
  const p1 = await staff.list(officer, { subjectKind: "FO_PERSON", subjectId: many.id }), p2 = await staff.list(officer, { subjectKind: "FO_PERSON", subjectId: many.id, cursor: p1.nextCursor! });
  const times = p1.messages.map((m) => Date.parse(m.createdAt));
  ok("DW5 pass: 51 messages → a page of 50, newest first, and a next page of 1 (no repeats)",
    p1.messages.length === PAGE && !!p1.nextCursor && p2.messages.length === 1 && p2.nextCursor === null && times.every((t, i) => i === 0 || t <= times[i - 1]) && !p1.messages.some((m) => m.id === p2.messages[0].id), { n1: p1.messages.length, n2: p2.messages.length });
  const cursors = ["x", `2026-13-45T25:61:61.000Z_${uuid()}`, "2026-11-18T10:00:00.000Z_------------------------------------", `2026-02-30T10:00:00.000Z_${uuid()}`, `0000-01-01T00:00:00.000Z_${uuid()}`];
  const bads = await Promise.all(cursors.map((cursor) => status(staff.list(officer, { subjectKind: "FO_PERSON", subjectId: many.id, cursor }))));
  ok("DW5 fail: a cursor that is not one we gave (text, an impossible date, an all-dash id, year 0000) → 400, never 500 (review m3)", bads.every((b) => String(b).startsWith("400:")), bads);
} finally {
  connectLocalNotices(null);
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); } catch { /* left for the lane's cleaner */ }
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
