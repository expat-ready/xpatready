// qa R1.38 / R1.40 (16 Nov, after FO-3sr #1811): a visitor in Asia/Dubai books Friday 12 Mar 2027 10:00 Toronto (EST),
// then the host moves it through the staff path (FO-3sr's staffReschedule) to Tuesday 16 Mar 10:00 Toronto (EDT, after
// Toronto's 14 Mar 2027 change), then cancels it. Checks: the stored instants in UTC (15:00Z, then 14:00Z); each invite
// keeps one UID, SEQUENCE rises, METHOD:REQUEST then METHOD:CANCEL; DTSTART in UTC; the booker's mail in Dubai's wall time
// (7:00 p.m., then 6:00 p.m.), the host's in the office zone (10:00 a.m. both times, America/Toronto). Each with a fail
// case. FO-3's own fakes (fakeMail, fakeJobs, FakeClock), a scratch firm in the given database; no model call (US$0).
//   DATABASE_URL=postgresql://xr_studio@127.0.0.1:54329/xr_studio_qa_fon tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_r140_staff_move_invite.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { fakeArrival } from "../../ports/arrival.ts";
import { fakeAudit, type AuditPort } from "../../ports/audit.ts";
import { FakeClock } from "../../ports/clock.ts";
import { fakeJobs } from "../../ports/jobs.ts";
import { fakeMail } from "../../ports/mail.ts";
import { copyFirmHoursTo } from "../../api/src/front-office/booking-seed.ts";
import { BookingService } from "../../api/src/front-office/booking/service.ts";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, options: "-c TimeZone=UTC" }) });
let pass = 0, fail = 0;
const ok = (n: string, c: unknown, d?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${!c && d !== undefined ? ` — ${JSON.stringify(d).slice(0, 400)}` : ""}`); };
type M = { to: string; subject: string; text: string; attachments?: { bytes: Uint8Array }[] };
const ics = (m?: M) => (m?.attachments?.[0] ? new TextDecoder().decode(m.attachments[0].bytes) : "");
const words = (m?: M) => `${m?.subject ?? ""} ${m?.text ?? ""}`;

async function main() {
  const key = `qa140-${process.pid}`;
  const firm = await db.platformFirm.create({ data: { key, operatingName: "Sample qa firm", countryCode: "CA", status: "ACTIVE", contactEmail: `${key}@firm.example` } });
  const host = await db.platformStaff.create({ data: { firmId: firm.id, email: `host-${key}@staff.example`, displayName: "Sample host", status: "ACTIVE" } });
  await copyFirmHoursTo(db, firm.id, [host.id]);
  await db.foConsultationType.create({ data: { firmId: firm.id, slug: "free", name: "Free consultation", modes: ["VIDEO"], hostStaffIds: [host.id], minutes: 30 } });
  const clock = new FakeClock(new Date("2027-03-10T14:00:00Z")); // Wednesday 09:00 Toronto (EST)
  const mail = fakeMail({ clock });
  const jobs = fakeJobs(clock);
  const svc = new BookingService(db, { audit: fakeAudit() as AuditPort<never>, clock, jobs, mail, arrival: fakeArrival(), publicBaseUrl: "http://localhost:4472", limits: { bookPerIp: 99, bookPerFirm: 99, slotsPerIp: 99, tokenPerIp: 99 }, warn: () => {} });
  await svc.registerJobs();
  const page = await svc.publicSlots(key, "free", { tz: "Asia/Dubai" }, "10.0.0.9");
  await clock.advance({ seconds: 5 });
  const booker = `client-${key}@example.com`;
  await svc.publicBook(key, "free", { givenNames: "Client", familyName: "A", email: booker, mode: "VIDEO", startsAt: "2027-03-12T15:00:00.000Z", timeZone: "Asia/Dubai", consent: true, consentWordingId: page.consent!.wordingId, formStamp: page.formStamp }, "10.0.0.9");
  await jobs.runDue();
  const b = await db.foBooking.findFirstOrThrow({ where: { firmId: firm.id } });
  ok("R1.38 pass: stored 12 Mar 15:00Z (10:00 EST) with the booker's zone Asia/Dubai", b.startsAt.toISOString() === "2027-03-12T15:00:00.000Z" && b.bookerTimeZone === "Asia/Dubai", [b.startsAt, b.bookerTimeZone]);

  const ctx = { staffId: host.id, firmId: firm.id, firmKey: key, roles: ["OWNER"], keys: ["agent/booking:create", "agent/booking:edit", "agent/booking:list"], duties: [], authTime: Math.floor(clock.now().getTime() / 1000), via: "local" as const };
  const moved = await svc.staffReschedule(ctx as never, b.id, { startsAt: "2027-03-16T14:00:00.000Z" }) as { startsAt: string; timeZone: string };
  await jobs.runDue();
  const b2 = await db.foBooking.findUniqueOrThrow({ where: { id: b.id } });
  ok("R1.38 pass: the staff move stores 16 Mar 14:00Z (10:00 EDT, after Toronto's change); the booker's zone kept", b2.startsAt.toISOString() === "2027-03-16T14:00:00.000Z" && moved.timeZone === "Asia/Dubai", [b2.startsAt, moved]);
  const view = await svc.staffGet(ctx as never, b.id) as Record<string, unknown>;
  console.log(`NOTE  staff read of the booking (FO-3sr GET /:id): ${JSON.stringify(view)}`);

  await svc.staffCancel(ctx as never, b.id);
  await jobs.runDue();
  const sent = mail.sent as M[];
  const toB = sent.filter((m) => m.to.toLowerCase() === booker), toH = sent.filter((m) => m.to.toLowerCase().startsWith("host-"));
  console.log(`NOTE  booker mails: ${toB.map((m) => m.subject).join(" | ")}`);
  console.log(`NOTE  host mails: ${toH.map((m) => m.subject).join(" | ")}`);
  const uid = `UID:${b.id}@booking.expatready.com`;
  ok("R1.40 pass: three invites to the booker (book, move, cancel), each with an .ics", toB.length === 3 && toB.every((m) => ics(m).length > 0), toB.map((m) => m.subject));
  ok("R1.40 pass: one UID across all three, the host's too", [...toB, ...toH].every((m) => ics(m).includes(uid)), [...toB, ...toH].map((m) => /UID:[^\r]*/.exec(ics(m))?.[0]));
  const seq = toB.map((m) => Number(/SEQUENCE:(\d+)/.exec(ics(m))?.[1] ?? -1));
  ok("R1.40 pass: SEQUENCE rises on each change (staff move, staff cancel)", seq.length === 3 && seq[0] < seq[1] && seq[1] < seq[2], seq);
  ok("R1.40 pass: METHOD:REQUEST, REQUEST, then CANCEL", /METHOD:REQUEST\r\n/.test(ics(toB[0])) && /METHOD:REQUEST\r\n/.test(ics(toB[1])) && /METHOD:CANCEL\r\n/.test(ics(toB[2])), toB.map((m) => /METHOD:\w+/.exec(ics(m))?.[0]));
  ok("R1.40 / R1.38 pass: DTSTART in UTC, 15:00Z then 14:00Z after the change", ics(toB[0]).includes("DTSTART:20270312T150000Z") && ics(toB[1]).includes("DTSTART:20270316T140000Z"), [ics(toB[0]).match(/DTSTART[^\r]*/)?.[0], ics(toB[1]).match(/DTSTART[^\r]*/)?.[0]]);
  ok("R1.40 fail case: the moved invite does not still carry the old time", !ics(toB[1]).includes("DTSTART:20270312T150000Z"), ics(toB[1]).match(/DTSTART[^\r]*/)?.[0]);
  ok("R1.38 pass: the booker reads 7:00 p.m. then 6:00 p.m. (Asia/Dubai) across Toronto's change", /7:00\s?p\.m\./.test(words(toB[0])) && /6:00\s?p\.m\./.test(words(toB[1])) && words(toB[1]).includes("Asia/Dubai"), [toB[0]?.subject, toB[1]?.subject]);
  ok("R1.38 pass: the host reads 10:00 a.m. (America/Toronto) both times (office zone, AG-04 rule 9)", toH.length >= 2 && /10:00\s?a\.m\./.test(words(toH[0])) && /10:00\s?a\.m\./.test(words(toH[1])) && words(toH[1]).includes("America/Toronto"), toH.map((m) => m.subject));
  ok("R1.38 fail case: the host's moved mail does not read 9:00 or 11:00 (an offset not shifted)", !!toH[1] && !/(9|11):00\s?a\.m\./.test(words(toH[1])), toH[1]?.subject);
  await db.foBooking.deleteMany({ where: { firmId: firm.id } }).catch(() => {});
  console.log(`${pass} passed, ${fail} failed`);
  await db.$disconnect(); process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
