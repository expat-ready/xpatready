// QA-518 (Release 1 row 49, consent gate before every send; tech lead's ruling, Lead 96, P-294, 19 Nov; Unconfirmed: no
// counsel). Send path covered: MessagePort.send (platform/messages/send/messages.ts) → ConsentStore.allows → the outbox,
// for marketing email; the unsubscribe door is the real one (channels/email/unsubscribe.ts, Unsubscribe.confirm). A
// one-click unsubscribe stops marketing email to every person of the firm at that address (same-email persons are never
// linked, AG-2-84); only a fresh express consent the person gave on a public page (web form or booking tick), with its
// own wording and after the unsubscribe, lifts it; a staff-recorded consent never does, nor an older consent on another
// person record. Service and transactional email still go. Each check has a pass and a fail. One scratch database with
// every migration and the Sample firms; the local adapter; fakeJobs on a fake clock. Nothing leaves the machine (US$0).
//   tsx studio/tests/check_qa518_unsubscribe_address.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { auditEvent } from "../api/src/platform/audit/audit-event.ts";
import { Secret } from "../api/src/platform/config/secret.ts";
import { localEmail } from "../api/src/platform/messages/channels/email/local.ts";
import { Unsubscribe, UnsubscribeTokens } from "../api/src/platform/messages/channels/email/unsubscribe.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { channelsOf } from "../api/src/platform/messages/send/channels.ts";
import { Messages } from "../api/src/platform/messages/send/messages.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { fakeAlerts } from "../ports/alert.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import type { MessageSend } from "../ports/messages.ts";
import { liftsAddressOptOut } from "../ports/consent.ts";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const uuid = () => randomUUID(), box = (w: string) => `qa518.${w}.${uuid().slice(0, 6)}@example.com`;

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_qa518_${process.pid}`, DBURL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`, WORK = join(STUDIO, "var", `qa518-check-${process.pid}`);
const sql = (q: string) => execFileSync(join(BIN, "psql"), [DBURL, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [DBURL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DBURL, options: "-c TimeZone=UTC" }) });

try {
  await seedSampleFirms(db);
  const firmA = sql(`select id from platform_firm where key='sample-firm'`), firmB = sql(`select id from platform_firm where key='sample-solo'`);
  const clock = new FakeClock(new Date()), jobs = fakeJobs(clock), files = new LocalFiles(join(WORK, "files")), consent = new ConsentStore(auditEvent, clock);
  const tokens = new UnsubscribeTokens({ current: 1, keys: new Map([[1, new Secret("PLATFORM_SECRET_BOX_KEYS v1", randomBytes(32).toString("base64"))]]) });
  const messages = new Messages({ db, consent, files, jobs, alerts: () => fakeAlerts(), channels: channelsOf([["EMAIL", localEmail]]), clock });
  await messages.register();
  const unsub = new Unsubscribe({ db, consent, tokens, now: () => clock.now().getTime() });
  const tick = () => clock.advance({ minutes: 1 });

  type P = { kind: "FO_PERSON"; id: string };
  const person = (): P => ({ kind: "FO_PERSON", id: uuid() });
  const send = async (firmId: string, p: P | undefined, address: string, cls: MessageSend["class"], o: { hold?: boolean } = {}) => {
    const r = await db.$transaction((t) => messages.send(t, { firmId, ...(p ? { person: p } : {}), channel: "EMAIL", class: cls, address, content: { subject: "Spring seminar (Sample)", text: "Join us in April." }, idempotencyKey: uuid() }));
    if (!o.hold) { await messages.dispatch(firmId, [r.outboxId]); await jobs.runDue(); }
    return { outboxId: r.outboxId, row: await db.msgOutbox.findUniqueOrThrow({ where: { id: r.outboxId } }) };
  };
  /** Email marketing consent for a person, from a door: a public page (WEB_FORM, BOOKING_FORM, self-service, with the
   *  firm's wording) or staff (STAFF_RECORDED, by a staff member). */
  const give = (firmId: string, p: P, source: "WEB_FORM" | "BOOKING_FORM" | "STAFF_RECORDED", o: { channel?: "EMAIL" | "WHATSAPP"; givenAt?: Date; typedByStaff?: boolean } = {}) => db.$transaction(async (tx) => {
    const channel = o.channel ?? "EMAIL", staff = source === "STAFF_RECORDED" || o.typedByStaff;
    const w = await consent.publishWording(tx, { firmId, channel, purpose: "MARKETING", locale: "en", text: `Sample: ${channel.toLowerCase()} news yes ${uuid().slice(0, 4)}`, by: "seed:qa518" });
    await consent.record(tx, { firmId, subject: p, channel, purpose: "MARKETING", wordingId: w.id, source, locale: "en", ...(o.givenAt ? { givenAt: o.givenAt } : {}),
      recordedKind: staff ? "USER" : "SELF_SERVICE", recordedBy: staff ? "staff:qa518" : "system:web-form" });
  });
  const allowed = async (firmId: string, p: P, address: string) => consent.allows(db, { firmId, subject: p, channel: "EMAIL", address, class: "MARKETING" });

  // Two person records of firm A at one address (a booking made its own person, AG-2-84), both with live consent.
  const X = box("shared"), p1 = person(), p2 = person();
  await give(firmA, p1, "WEB_FORM"); await give(firmA, p2, "BOOKING_FORM");
  // Firm B has a person at the same address; firm A has a person at another address.
  const pB = person(), Y = box("other"), p3 = person();
  await give(firmB, pB, "WEB_FORM"); await give(firmA, p3, "WEB_FORM");
  await tick();

  const before2 = await send(firmA, p2, X, "MARKETING");
  ok("Q1 fail (before): marketing to the second person at the address goes while nobody unsubscribed", before2.row.state === "SENT", before2.row);
  const m1 = await send(firmA, p1, X, "MARKETING");
  await tick();
  const page = await unsub.confirm(tokens.mint(firmA, m1.outboxId));
  ok("Q1 setup: the first person's one-click unsubscribe (the real door) answers its page", typeof page === "string" && page.includes("You are unsubscribed"));
  await tick();

  const after2 = await send(firmA, p2, X, "MARKETING");
  ok("Q1 pass: after the unsubscribe, marketing to the second person record at the same address is SUPPRESSED (ADDRESS_UNSUBSCRIBED: MARKETING, its own reason: that person never withdrew), not sent",
    after2.row.state === "SUPPRESSED" && after2.row.stateReason === "ADDRESS_UNSUBSCRIBED: MARKETING" && after2.row.sentAt === null, after2.row);
  const a2 = await allowed(firmA, p2, X.toUpperCase());
  ok("Q1 pass: ConsentPort.allows says so for any spelling of the address (ADDRESS_UNSUBSCRIBED)", !a2.allowed && a2.reason === "ADDRESS_UNSUBSCRIBED", a2);
  ok("Q1 pass: the second person's own consent row is not changed (the address rule decides, nothing is rewritten)",
    (await db.msgConsent.count({ where: { firmId: firmA, subjectId: p2.id, withdrawnAt: null } })) === 1);

  const other = await send(firmA, p3, Y, "MARKETING"), firmBsend = await send(firmB, pB, X, "MARKETING");
  ok("Q2 fail: another address of the same firm still gets marketing", other.row.state === "SENT", other.row);
  ok("Q2 fail: another firm's person at the same address still gets that firm's marketing (one firm's unsubscribe is its own)", firmBsend.row.state === "SENT", firmBsend.row);

  const svc = await send(firmA, p2, X, "SERVICE"), trx = await send(firmA, undefined, X, "TRANSACTIONAL");
  ok("Q3 fail: service and transactional email to the address still go (an unsubscribe is marketing only)", svc.row.state === "SENT" && trx.row.state === "SENT", [svc.row.state, trx.row.state]);

  // A staff member records consent after the unsubscribe: for the person who unsubscribed, and for a new person record.
  const p4 = person();
  await give(firmA, p1, "STAFF_RECORDED"); await give(firmA, p4, "STAFF_RECORDED");
  await tick();
  const s1 = await send(firmA, p1, X, "MARKETING"), s4 = await send(firmA, p4, X, "MARKETING");
  ok("Q4 fail: a staff-recorded consent never lifts the unsubscribe — the person who unsubscribed, and a new person record at the address",
    s1.row.state === "SUPPRESSED" && s4.row.state === "SUPPRESSED", [s1.row.stateReason, s4.row.stateReason]);

  // A fresh tick on a public page after the unsubscribe lifts it for that person only.
  await give(firmA, p2, "WEB_FORM");
  await tick();
  const l2 = await send(firmA, p2, X, "MARKETING"), still4 = await send(firmA, p4, X, "MARKETING");
  ok("Q5 pass: a fresh web-form consent given after the unsubscribe lifts it for that person (SENT)", l2.row.state === "SENT", l2.row);
  ok("Q5 fail: it lifts nothing for another person record at the address (still SUPPRESSED)", still4.row.state === "SUPPRESSED", still4.row);
  const p5 = person();
  await give(firmA, p5, "BOOKING_FORM");
  await tick();
  const b5 = await send(firmA, p5, X, "MARKETING");
  ok("Q5 pass: a booking's tick on a new person record after the unsubscribe is that person's own fresh consent (SENT)", b5.row.state === "SENT", b5.row);

  // A second unsubscribe (from the lifted person's new message) puts the address back under the rule.
  await tick();
  await unsub.confirm(tokens.mint(firmA, l2.outboxId));
  await tick();
  const again5 = await send(firmA, p5, X, "MARKETING");
  ok("Q6 fail: a later unsubscribe from the address ends the lift for everyone at it, the booking's person too (SUPPRESSED)", again5.row.state === "SUPPRESSED", again5.row);

  // Review m6 and m3: the ruling's other exclusions, the worker's re-check, WhatsApp, and an unsubscribe from service mail.
  const Z = box("more"), q1 = person(), q2 = person(), q3 = person(), q4 = person();
  for (const q of [q1, q2]) await give(firmA, q, "WEB_FORM");
  await give(firmA, q2, "WEB_FORM", { channel: "WHATSAPP" });
  await tick();
  const svcMail = await send(firmA, q1, Z, "SERVICE");
  const held = await send(firmA, q2, Z, "MARKETING", { hold: true });   // written (QUEUED) before the unsubscribe, delivered after
  // No clock step until it is delivered: a step runs the fake job runner's sweep, which would send it early.
  const svcPage = await unsub.confirm(tokens.mint(firmA, svcMail.outboxId));
  await messages.dispatch(firmA, [held.outboxId]); await jobs.runDue();
  const heldRow = await db.msgOutbox.findUniqueOrThrow({ where: { id: held.outboxId } });
  ok("Q7 pass: a marketing email queued before the unsubscribe (from a service email) and delivered after it is stopped by the worker's re-check",
    typeof svcPage === "string" && held.row.state === "QUEUED" && heldRow.state === "SUPPRESSED" && heldRow.stateReason === "ADDRESS_UNSUBSCRIBED: MARKETING", [held.row.state, heldRow.state, heldRow.stateReason]);
  const wa = await consent.allows(db, { firmId: firmA, subject: q2, channel: "WHATSAPP", address: "+15145550123", class: "MARKETING" });
  ok("Q7 fail: the same person's WhatsApp marketing consent is untouched (the unsubscribe is email marketing only)", wa.allowed, wa);
  await give(firmA, q3, "WEB_FORM", { givenAt: new Date(clock.now().getTime() - 10 * 60_000) });   // a public consent dated before the unsubscribe
  await give(firmA, q4, "WEB_FORM", { typedByStaff: true });                                        // a staff member typing a web-form source
  await tick();
  const old3 = await send(firmA, q3, Z, "MARKETING"), typed4 = await send(firmA, q4, Z, "MARKETING");
  ok("Q8 fail: a web-form consent dated before the unsubscribe lifts nothing (SUPPRESSED)", old3.row.state === "SUPPRESSED", old3.row);
  ok("Q8 fail: a consent a staff member recorded with a web-form source lifts nothing (only a self-service row does; review m3)", typed4.row.state === "SUPPRESSED", typed4.row);
  const at = new Date("2026-11-20T10:00:00Z"), later = new Date("2026-11-20T11:00:00Z");
  const row = { givenAt: later, basis: "EXPRESS", source: "WEB_FORM", wordingId: uuid(), copiedFromId: null, recordedKind: "SELF_SERVICE" };
  ok("Q9 pass: liftsAddressOptOut accepts a fresh self-service web-form or booking consent with wording", liftsAddressOptOut(at, row) && liftsAddressOptOut(at, { ...row, source: "BOOKING_FORM" }));
  ok("Q9 fail: it refuses an import, a copy, a staff row, a portal or API row, no wording, and the same instant",
    ![{ basis: "IMPORT_DECLARED", source: "IMPORT_DECLARED" }, { copiedFromId: uuid(), recordedKind: "SYSTEM" }, { source: "STAFF_RECORDED", recordedKind: "USER" }, { source: "PORTAL" }, { source: "API" }, { wordingId: null }, { givenAt: at }]
      .some((c) => liftsAddressOptOut(at, { ...row, ...c })));

  // Review M1 (STANDARDS [M] "Read paths indexed"): with 30,000 outbox rows the address read uses the two indexes of
  // this row's migration and scans neither table whole.
  sql(`INSERT INTO msg_outbox (id, firm_id, channel, address, rendered_hash, class, state, updated_at) SELECT gen_random_uuid(), '${firmA}', 'EMAIL', 'bulk' || g || '@example.com', repeat('a', 64), 'MARKETING', 'SENT', now() FROM generate_series(1, 30000) g`);
  sql(`ANALYZE msg_outbox; ANALYZE msg_consent_withdrawal`);
  const plan = sql(`EXPLAIN SELECT max(w."withdrawn_at") FROM "msg_outbox" o JOIN "msg_consent_withdrawal" w ON w."firm_id" = o."firm_id" AND w."withdrawn_by" = 'system:unsubscribe:' || o."id"::text WHERE o."firm_id" = '${firmA}'::uuid AND o."channel" = 'EMAIL' AND o."address" = '${Z}' AND w."via" = 'UNSUBSCRIBE' AND w."channel" = 'EMAIL' AND w."purpose" = 'MARKETING'`);
  ok("Q10 pass: the address read's plan uses msg_outbox_firm_id_channel_address_idx (30,000 outbox rows)", plan.includes("msg_outbox_firm_id_channel_address_idx"), plan);
  ok("Q10 fail: the plan has no sequential scan of msg_outbox", !/Seq Scan on msg_outbox/.test(plan), plan);
  const src = readFileSync(join(STUDIO, "api", "src", "platform", "messages", "consent", "consent-store.ts"), "utf8");
  ok("Q10 pass: the adapter runs that query shape (it starts from the address, joins the withdrawal by its writer)", /FROM "msg_outbox" o\s+JOIN "msg_consent_withdrawal" w ON w."firm_id" = o."firm_id" AND w."withdrawn_by" = 'system:unsubscribe:' \|\| o."id"::text/.test(src));
} finally {
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); } catch { /* left for the sweep */ }
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
