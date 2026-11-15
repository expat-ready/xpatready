// PF-19b booking mail (qa #1855, map rows 38 and 40): MailPort over MessagePort (MessagesMail), so the booking service's
// mail goes through the outbox, the consent gate, the worker and the local adapter, and a booking's invite.ics is read
// back from GET /api/demo/platform-inbox. Named tests BM1-BM9, each with a pass and a fail. The real BookingService with
// the app's runtime ports (runtimeBookingPorts) on a scratch database with every migration; fakeJobs on a fake clock;
// files in a scratch folder; the route over HTTP through a child Nest app (this file with --serve). No model call, nothing
// leaves the machine (US$0). The database and folder are removed at the end.
//   tsx studio/tests/check_pf19b_mail.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Db } from "../api/src/core.ts";
import { copyFirmHoursTo } from "../api/src/front-office/booking-seed.ts";
import { runtimeBookingPorts } from "../api/src/front-office/booking/runtime-ports.ts";
import { BookingService } from "../api/src/front-office/booking/service.ts";
import { wallToUtc } from "../api/src/front-office/booking/slots.ts";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { auditEvent } from "../api/src/platform/audit/audit-event.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { localEmail } from "../api/src/platform/messages/channels/email/local.ts";
import { PlatformInbox } from "../api/src/platform/messages/demo-inbox.ts";
import { channelsOf } from "../api/src/platform/messages/send/channels.ts";
import { MessagesMail } from "../api/src/platform/messages/send/mail.ts";
import { Messages, SWEEP_AFTER_MS } from "../api/src/platform/messages/send/messages.ts";
import { fakeAlerts } from "../ports/alert.ts";
import { FakeClock } from "../ports/clock.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { MAIL_CONTRACT_FIRM, mailPortContract } from "../ports/contracts/mail-port.contract.ts";
import { fakeJobs, type JobHandler, type JobPort } from "../ports/jobs.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf19bm_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`, WORK = join(STUDIO, "var", `pf19bm-check-${process.pid}`);
const TZ = "America/Toronto";
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const at = (s: string) => { const [d, t] = s.split(" "); const [y, m, dd] = d.split("-").map(Number); const [h, mi] = t.split(":").map(Number); return wallToUtc(y, m, dd, h * 60 + mi, TZ)!; };
const iso = (s: string) => at(s).toISOString();
const rejects = async (f: () => unknown) => { try { await f(); return null; } catch (e) { return e instanceof Error ? e : new Error(String(e)); } };

if (process.argv.includes("--serve")) await serve();
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = URL;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
let server: ChildProcess | null = null;
try {
  const ws = await db.workspace.create({ data: { key: "pf19bm-check", label: "PF-19b mail check" } });
  void ws;
  const A = await db.platformFirm.create({ data: { key: "pf19bm-a", operatingName: "Sample Firm A", countryCode: "CA", status: "ACTIVE", contactEmail: "office@firm-a.example" } });
  const A1 = await db.platformStaff.create({ data: { firmId: A.id, email: "host@firm-a.example", displayName: "Sample Host", status: "ACTIVE" } });
  await copyFirmHoursTo(db, A.id, [A1.id]);
  await db.foConsultationType.create({ data: { firmId: A.id, slug: "free", name: "Free consultation", modes: ["VIDEO", "PHONE"], hostStaffIds: [A1.id], minutes: 30 } });

  const clock = new FakeClock(at("2026-10-26 08:00")), jobs = fakeJobs(clock), alerts = fakeAlerts(), files = new LocalFiles(join(WORK, "files"));
  const messages = new Messages({ db, consent: new ConsentStore(auditEvent, clock), files, jobs, alerts: () => alerts, channels: channelsOf([["EMAIL", localEmail]]), clock });
  await messages.register();
  const logs: string[] = [];
  const mail = new MessagesMail({ db, messages, files, log: (l) => logs.push(l) });
  // The app's own booking ports, with the test's clock and jobs (the app takes jobs from PF-14's runner).
  // Booking's handlers are kept, so a test can run one job a second time, as a runner does after a crash (break M1).
  const handlers = new Map<string, JobHandler>();
  const bookingJobs: JobPort = { enqueue: (...a) => jobs.enqueue(...a), schedule: (...a) => jobs.schedule(...a), cancel: (...a) => jobs.cancel(...a), recurring: (...a) => jobs.recurring(...a), handle: async (n, h) => { handlers.set(n, h); await jobs.handle(n, h); } };
  const S = new BookingService(db, { ...runtimeBookingPorts(mail), clock, jobs: bookingJobs, publicBaseUrl: "http://localhost:4430", limits: { bookPerIp: 1000, bookPerFirm: 1000, slotsPerIp: 1000, tokenPerIp: 1000 } });
  await S.registerJobs();
  const inbox = new PlatformInbox(db as unknown as Db, files, () => true);
  const run = async () => { await jobs.runDue(); await jobs.runDue(); };
  const form = async (startsAt: string, who: string) => {
    const page = await S.publicSlots(A.key, "free", {}, "10.0.0.1");
    await clock.advance({ seconds: 5 });
    return { givenNames: "Ana", familyName: `Sample ${who}`, email: `${who}@client.example`, mode: "VIDEO", startsAt: iso(startsAt), timeZone: TZ, consent: true, consentWordingId: page.consent!.wordingId, formStamp: page.formStamp };
  };
  const uidOf = (t: string | null | undefined) => /\r?\nUID:([^\r\n]+)/.exec(t ?? "")?.[1] ?? null;
  const seqOf = (t: string | null | undefined) => Number(/\r?\nSEQUENCE:(\d+)/.exec(t ?? "")?.[1] ?? NaN);

  // ------------------------------------------------------------------------------- BM1 the booker's invite in the inbox
  const b1 = await S.publicBook(A.key, "free", await form("2026-10-27 13:00", "ana"), "10.0.0.1");
  ok("BM1 fail: before the jobs run, nothing is in the demo inbox (the mail is a job after the booking's commit)", (await inbox.list("ana@client.example", undefined)).messages.length === 0);
  await run();
  const l1 = await inbox.list("ana@client.example", undefined), m1 = l1.messages[0], ics1 = m1?.attachments.find((a) => a.filename === "invite.ics");
  const row1 = m1 ? await db.msgOutbox.findUniqueOrThrow({ where: { id: m1.id } }) : null;
  ok("BM1 pass: the booking confirmation is SENT by the local adapter, TRANSACTIONAL for the booker, in /api/demo/platform-inbox with invite.ics (METHOD:REQUEST, a UID, text/calendar)",
    l1.messages.length === 1 && row1?.state === "SENT" && row1.class === "TRANSACTIONAL" && row1.subjectKind === "FO_PERSON" && /is booked/.test(m1.subject) && m1.body.includes("/manage#")
    && !!ics1 && /^text\/calendar/.test(ics1.content_type) && /METHOD:REQUEST/.test(ics1.text ?? "") && !!uidOf(ics1.text) && m1.reply_to === A.contactEmail && m1.from.startsWith(A.operatingName), l1);
  ok("BM1 fail: another address's inbox does not hold it", (await inbox.list("bob@client.example", undefined)).messages.length === 0);
  void b1;

  // ------------------------------------------------------------------------------- BM2 the host's copy names the host
  const h2 = (await inbox.list(A1.email, undefined)).messages, hostRow = h2[0] ? await db.msgOutbox.findUniqueOrThrow({ where: { id: h2[0].id } }) : null;
  ok("BM2 pass: the host's copy is SERVICE for the host (STAFF subject), with its own invite.ics of the same UID",
    h2.length === 1 && hostRow?.class === "SERVICE" && hostRow.subjectKind === "STAFF" && hostRow.subjectId === A1.id && uidOf(h2[0].attachments[0]?.text) === uidOf(ics1?.text), h2);
  const before2 = await db.msgOutbox.count();
  const e2 = await rejects(() => mail.send({ firmId: A.id, to: "x2@client.example", replyTo: A.contactEmail, class: "SERVICE", subject: "No person", text: "x" }));
  ok("BM2 fail: a SERVICE email that names no person is refused, and no outbox row is written", e2?.name === "MessageRefused" && (await db.msgOutbox.count()) === before2, e2?.message);

  // ------------------------------------------------------------------------------- BM3 a suppressed address
  await db.msgSuppression.create({ data: { firmId: A.id, channel: "EMAIL", address: "gone@client.example", reason: "HARD_BOUNCE", createdBy: "seed:pf19bm" } });
  const e3 = await rejects(() => mail.send({ firmId: A.id, to: "Gone@client.example", replyTo: A.contactEmail, class: "TRANSACTIONAL", subject: "Hello", text: "x" }));
  await run();
  const r3 = await db.msgOutbox.findFirst({ where: { address: "gone@client.example" } });
  ok("BM3 fail: mail to a suppressed address throws (the caller's job sees it was not sent), the row is SUPPRESSED, nothing is in the inbox",
    e3?.name === "MessageRefused" && r3?.state === "SUPPRESSED" && /HARD_BOUNCE/.test(r3.stateReason ?? "") && (await inbox.list("gone@client.example", undefined)).messages.length === 0, { e: e3?.message, r3 });
  await mail.send({ firmId: A.id, to: "fine@client.example", replyTo: A.contactEmail, class: "TRANSACTIONAL", subject: "Hello", text: "x" });
  await run();
  ok("BM3 pass: the same email to an address that is not suppressed is sent", (await inbox.list("fine@client.example", undefined)).messages.length === 1);

  // ------------------------------------------------------------------------------- BM4 a dispatch that fails after commit
  const broken = new MessagesMail({ db, files, log: (l) => logs.push(l), messages: { send: (tx, m) => messages.send(tx, m), dispatch: async () => { throw new Error("job runner away"); } } });
  const r4 = await rejects(() => broken.send({ firmId: A.id, to: "late@client.example", replyTo: A.contactEmail, class: "TRANSACTIONAL", subject: "Late", text: "x" }));
  await run();
  ok("BM4 fail: the commit holds, the dispatch fails: send does not throw (no second row from a retry), nothing sent yet, one log line without the address",
    r4 === null && (await db.msgOutbox.count({ where: { address: "late@client.example" } })) === 1 && (await inbox.list("late@client.example", undefined)).messages.length === 0
    && logs.length === 1 && !logs[0].includes("late@client.example"), { r4: r4?.message, logs });
  // created_at is the database's own now(); the booking needs a fixed date, so the row is placed on the fake clock's time.
  await db.msgOutbox.updateMany({ where: { address: "late@client.example" }, data: { createdAt: clock.now() } });
  await clock.advance({ minutes: SWEEP_AFTER_MS / 60_000 + 1 }); await run(); await clock.advance({ minutes: 1 }); await run();
  ok("BM4 pass: the sweep sends it, once", (await inbox.list("late@client.example", undefined)).messages.length === 1);

  // ------------------------------------------------------------------------------- BM5 move, then cancel: one UID
  const moved = await S.selfReschedule(b1.manageToken, { startsAt: iso("2026-10-29 10:00") }, "ip");
  await run(); await clock.advance({ minutes: 1 });
  await S.selfCancel(moved.manageToken, "ip");
  await run();
  const all5 = (await inbox.list("ana@client.example", undefined)).messages;   // newest first
  const icsOf = (i: number) => all5[i]?.attachments.find((a) => a.filename === "invite.ics")?.text;
  ok("BM5 pass: moved then cancelled → three mails, newest first: CANCEL then REQUEST then REQUEST, one UID, SEQUENCE rising",
    all5.length === 3 && /METHOD:CANCEL/.test(icsOf(0) ?? "") && /METHOD:REQUEST/.test(icsOf(1) ?? "") && new Set([0, 1, 2].map((i) => uidOf(icsOf(i)))).size === 1
    && seqOf(icsOf(0)) > seqOf(icsOf(1)) && seqOf(icsOf(1)) > seqOf(icsOf(2)), all5.map((m) => m.subject));
  ok("BM5 fail: the cancellation carries no reschedule link", !!all5[0] && !all5[0].body.includes("/manage#"));

  // ------------------------------------------------------------------------------- BM7 reminders and the attendance question (review M1)
  const b7 = await S.publicBook(A.key, "free", await form("2026-10-27 09:00", "rem"), "10.0.0.1");
  const c7 = await S.publicBook(A.key, "free", await form("2026-10-27 11:00", "quiet"), "10.0.0.1");
  await run();
  await db.msgSuppression.create({ data: { firmId: A.id, channel: "EMAIL", address: "quiet@client.example", reason: "COMPLAINT", createdBy: "seed:pf19bm" } });
  for (let h = 0; h < 30; h++) { await clock.advance({ hours: 1 }); await run(); }   // past both reminders and both meetings' ends
  const rem = (await inbox.list("rem@client.example", undefined)).messages, remRows = await db.msgOutbox.findMany({ where: { address: "rem@client.example", class: "SERVICE" } });
  const asks = (await inbox.list(A1.email, undefined)).messages.filter((m) => m.subject === "Did they attend?");
  ok("BM7 pass: the 24 h and 1 h reminders go through the outbox as SERVICE for the booker (FO_PERSON) and are SENT; the host's attendance question is SENT for the host",
    rem.filter((m) => m.subject.startsWith("Reminder:")).length === 2 && remRows.length === 2 && remRows.every((r) => r.state === "SENT" && r.subjectKind === "FO_PERSON") && asks.length >= 1, { rem: rem.map((m) => m.subject), remRows: remRows.map((r) => [r.state, r.subjectKind]), asks: asks.length });
  const quietRows = await db.msgOutbox.findMany({ where: { address: "quiet@client.example", class: "SERVICE" } });
  ok("BM7 fail: a booker suppressed after booking gets no reminder: the rows are SUPPRESSED by the gate, the inbox holds only the confirmation",
    quietRows.length >= 2 && quietRows.every((r) => r.state === "SUPPRESSED" && /COMPLAINT/.test(r.stateReason ?? "")) && (await inbox.list("quiet@client.example", undefined)).messages.length === 1, quietRows.map((r) => [r.state, r.stateReason]));
  void b7; void c7;

  // ------------------------------------------------------------------------------- BM8 one key, one email (review m2)
  const once = { firmId: A.id, to: "twice@client.example", replyTo: A.contactEmail, class: "TRANSACTIONAL" as const, subject: "Once", text: "x", idempotencyKey: "booking:job-1" };
  const [k1, k2] = [await mail.send(once), await mail.send(once)];
  await mail.send({ ...once, idempotencyKey: "booking:job-2" });
  await run();
  ok("BM8 pass: a job run twice with its key sends once (the second call answers the first row, without throwing)", k1.messageId === k2.messageId && (await db.msgOutbox.count({ where: { address: "twice@client.example", idempotencyKey: "mail:booking:job-1" } })) === 1);
  ok("BM8 fail: another key is another email", (await inbox.list("twice@client.example", undefined)).messages.length === 2);
  const job8 = jobs.jobs.find((j) => j.name === "booking.mail" && j.status === "done" && j.key.endsWith("mail-person") && j.firmId === A.id)!;
  const rows8 = () => db.msgOutbox.count({ where: { idempotencyKey: `mail:${job8.key}` } });
  const had8 = await rows8();
  await handlers.get("booking.mail")!({ ...job8, payload: structuredClone(job8.payload) }); await run();
  ok("BM8 pass: booking's own mail job run a second time after it sent makes no second row and no second email (it passes its job key)", had8 === 1 && (await rows8()) === 1, { key: job8?.key, had8 });

  // ------------------------------------------------------------------------------- BM9 refused before anything is stored (review m5)
  const filesOf = () => existsSync(join(WORK, "files", A.id, "mail")) ? readdirSync(join(WORK, "files", A.id, "mail")).length : 0;
  const before9 = filesOf();
  const e9 = await rejects(() => mail.send({ firmId: A.id, to: "nine@client.example", replyTo: A.contactEmail, class: "TRANSACTIONAL", subject: "Two\nlines", text: "x", attachments: [{ filename: "a.txt", contentType: "text/plain", bytes: new TextEncoder().encode("a") }] }));
  ok("BM9 fail: a subject on two lines is refused as MessageRefused, and no attachment file is stored", e9?.name === "MessageRefused" && filesOf() === before9, { e: e9?.name, before9, after: filesOf() });
  await mail.send({ firmId: A.id, to: "nine@client.example", replyTo: A.contactEmail, class: "TRANSACTIONAL", subject: "One line", text: "x", attachments: [{ filename: "a.txt", contentType: "text/plain", bytes: new TextEncoder().encode("a") }] });
  ok("BM9 pass: the same mail on one line stores its attachment and is accepted", filesOf() === before9 + 1);
  const e9b = await rejects(() => mail.send({ firmId: A.id, to: "ana.sample@client-.example", replyTo: A.contactEmail, class: "TRANSACTIONAL", subject: "Hello", text: "x" }));
  ok("BM9 fail: an address the channel refuses (a@b-.example) is MessageRefused, and the error text never quotes the address (break M2)",
    e9b?.name === "MessageRefused" && !e9b.message.includes("client-.example") && (await db.msgOutbox.count({ where: { address: { contains: "client-.example" } } })) === 0, e9b?.message);
  const k9 = await mail.send({ firmId: A.id, to: "nine@client.example", replyTo: A.contactEmail, class: "TRANSACTIONAL", subject: "Two files", text: "x", attachments: ["Invite.ics", "invite.ics", "x.meta"].map((filename) => ({ filename, contentType: "text/plain", bytes: new TextEncoder().encode(filename) })) });
  await run();
  const m9 = (await inbox.list("nine@client.example", undefined)).messages.find((m) => m.id === k9.messageId);
  ok("BM9 pass: two names that clean alike and a .meta name are all kept, each with its own bytes (break m3)",
    m9?.attachments.length === 3 && m9.attachments.map((a) => a.text).join("|") === "Invite.ics|invite.ics|x.meta", m9?.attachments);

  // ------------------------------------------------------------------------------- PF-0c: MailPort's shared contract
  // The contract's firm is a platform firm here; each case gets a fresh address book, read back from the demo inbox.
  await db.platformFirm.create({ data: { id: MAIL_CONTRACT_FIRM, key: "pf19bm-contract", operatingName: "Sample Contract Firm", countryCode: "CA", status: "ACTIVE", contactEmail: "office@contract.example" } });
  await runContract(mailPortContract, "MessagesMail", () => ({
    send: async (m) => { const r = await mail.send(m); await run(); return r; },
    inbox: async (a) => { try { return (await inbox.list(a, undefined)).messages.map((x) => ({ text: x.body })); } catch { return []; } },
  }), ok);

  // ------------------------------------------------------------------------------- BM6 over HTTP, the app's route
  const child = spawn(join(STUDIO, "node_modules", ".bin", "tsx"), ["--tsconfig", join(STUDIO, "api", "tsconfig.json"), import.meta.filename, "--serve"], { env: { ...process.env, DATABASE_URL: URL, FO_FILES_DIR: join(WORK, "files") }, stdio: ["ignore", "pipe", "inherit"] });
  server = child;
  const base = await new Promise<string>((resolve, reject) => {
    let out = "";
    child.stdout.on("data", (d: Buffer) => { out += d; const m = /^LISTEN (\S+)$/m.exec(out); if (m) resolve(m[1]); });
    child.on("exit", (c) => reject(new Error(`the route server stopped (${c}): ${out}`)));
    setTimeout(() => reject(new Error(`the route server did not start in 60 s: ${out}`)), 60_000).unref();
  });
  const h6 = await fetch(`${base}/api/demo/platform-inbox?address=ana%40client.example`), j6 = await h6.json() as { messages: { attachments: { filename: string; text: string | null }[] }[] };
  ok("BM6 pass: GET /api/demo/platform-inbox answers 200 with the three booking mails and the invite text", h6.status === 200 && j6.messages.length === 3 && /BEGIN:VCALENDAR/.test(j6.messages[2].attachments[0]?.text ?? ""), h6.status);
  const f6 = await fetch(`${base}/api/demo/platform-inbox?address=ana%40client.example`, { headers: { "x-actor": "user-P" } });
  ok("BM6 fail: a client's persona gets 403 from the same route", f6.status === 403, f6.status);
} catch (e) {
  fail++;
  console.log(`FAIL  PF-19b mail check stopped: ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  server?.kill();
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

/** The child: the platform inbox controller on the parent's database and files. Never returns. */
async function serve(): Promise<never> {
  const { NestFactory } = await import("@nestjs/core");
  const { Module } = await import("@nestjs/common");
  const core = await import("../api/src/core.ts");
  const di = await import("../api/src/platform/messages/demo-inbox.ts");
  class TestModule {}
  Module({ controllers: [di.PlatformInboxController], providers: [core.Db, { provide: di.PlatformInbox, useFactory: (d: Db) => new di.PlatformInbox(d, new LocalFiles(), () => true), inject: [core.Db] }] })(TestModule);
  const nest = await NestFactory.create(TestModule, { logger: false });
  await nest.listen(0, "127.0.0.1");
  console.log(`LISTEN ${(await nest.getUrl()).replace("[::1]", "127.0.0.1")}`);
  return new Promise<never>(() => {});
}
