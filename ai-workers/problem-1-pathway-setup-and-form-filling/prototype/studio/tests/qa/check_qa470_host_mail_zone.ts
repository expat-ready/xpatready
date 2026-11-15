// QA-470 (qa R1.38, 15 Nov): the host's booking email states the time in the booker's zone, not the host's office zone.
// AG-04 v2.1 rule 9 (Display): "Staff views show the host's office time, labelled when it differs from the viewer's,
// e.g. "10:00 (Calgary)" (AG01-24)". Today service.ts sends the host `Consultation scheduled: <booker's wall time>
// (Asia/Dubai)`. Fails today; passes when the host's email reads the host's office (firm) zone. The booker's own
// confirmation in the booker's zone is checked too (pass case, kept as is). On FO-3's own fakes; no model call (US$0).
//   DATABASE_URL=postgresql://xr_studio@127.0.0.1:54329/xr_studio_qa_fo3 tsx studio/tests/qa/check_qa470_host_mail_zone.ts
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

async function main() {
  const key = `qa470-${process.pid}`;
  const firm = await db.platformFirm.create({ data: { key, operatingName: "Sample qa firm", countryCode: "CA", status: "ACTIVE", contactEmail: `${key}@firm.example` } });
  const host = await db.platformStaff.create({ data: { firmId: firm.id, email: `host-${key}@staff.example`, displayName: "Sample host", status: "ACTIVE" } });
  await copyFirmHoursTo(db, firm.id, [host.id]);
  await db.foConsultationType.create({ data: { firmId: firm.id, slug: "free", name: "Free consultation", modes: ["VIDEO"], hostStaffIds: [host.id], minutes: 30 } });
  const clock = new FakeClock(new Date("2026-11-16T13:00:00Z")); // Monday 08:00 Toronto
  const mail = fakeMail({ clock });
  const svc = new BookingService(db, { audit: fakeAudit() as AuditPort<never>, clock, jobs: fakeJobs(clock), mail, arrival: fakeArrival(), publicBaseUrl: "http://localhost:4471", limits: { bookPerIp: 99, bookPerFirm: 99, slotsPerIp: 99, tokenPerIp: 99 }, warn: () => {} });
  const page = await svc.publicSlots(key, "free", {}, "10.0.0.9");
  await clock.advance({ seconds: 5 });
  // Tue 17 Nov 10:00 Toronto = 15:00Z = 19:00 Dubai.
  await svc.publicBook(key, "free", { givenNames: "Amira", familyName: "Haddad", email: `client-${key}@example.com`, mode: "VIDEO", startsAt: "2026-11-17T15:00:00.000Z", timeZone: "Asia/Dubai", consent: true, consentWordingId: page.consent!.wordingId, formStamp: page.formStamp }, "10.0.0.9");
  const toClient = mail.sent.find((m) => m.to.toLowerCase().startsWith("client-"));
  const toHost = mail.sent.find((m) => m.to.toLowerCase().startsWith("host-"));
  ok("pass (kept): the booker's confirmation reads 7:00 p.m. (Asia/Dubai)", !!toClient && /7:00\s?p\.m\./.test(`${toClient.subject} ${toClient.text}`) && `${toClient.subject} ${toClient.text}`.includes("Asia/Dubai"), toClient?.subject);
  const h = `${toHost?.subject ?? ""} ${toHost?.text ?? ""}`;
  ok("QA-470: the host's email reads the host's office time, 10:00 a.m. (America/Toronto) (AG-04 rule 9, AG01-24)", !!toHost && /10:00\s?a\.m\./.test(h) && h.includes("America/Toronto"), toHost?.subject);
  ok("QA-470 fail case: the host's email does not state the time only in the booker's zone", !!toHost && !(h.includes("Asia/Dubai") && !h.includes("America/Toronto")), toHost?.subject);
  console.log(`${pass} passed, ${fail} failed`);
  await db.$disconnect(); process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
