// qa R1.38 / R1.40 / R1.42 (FO-3 booking API): gate A walked by API on a running isolated copy (no booking screen exists;
// P-348 (3) "otherwise by API to the next step"). The setup a person cannot do yet through the product (a firm, its staff,
// their hours, one consultation type: PF-5, PF-4s, FO-3a are not built) is written once with Prisma; everything after it
// goes over HTTP the way the booking page would: slots in the visitor's zone across a daylight-saving change, book,
// self-service view, move to a time after the change, the old link refused, cancel. No model call (US$0).
//   STUDIO_URL=http://localhost:4471 DATABASE_URL=postgresql://xr_studio@127.0.0.1:54329/xr_studio_qa_fo3 tsx studio/tests/qa/check_r1_fo3_tz_walk.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { copyFirmHoursTo } from "../../api/src/front-office/booking-seed.ts";

const BASE = process.env.STUDIO_URL ?? "http://localhost:4471";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, options: "-c TimeZone=UTC" }) /* as api/src/core.ts: the adapter reads timestamptz in the session zone */ });
let pass = 0, fail = 0;
const ok = (n: string, c: unknown, d?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${!c && d !== undefined ? ` — ${JSON.stringify(d).slice(0, 400)}` : ""}`); };
const j = async (method: string, path: string, body?: unknown) => {
  const r = await fetch(BASE + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let b: any = t; try { b = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body: b };
};

async function main() {
  const key = `qa-r1-${process.pid}`;
  const firm = await db.platformFirm.create({ data: { key, operatingName: "Sample qa firm", countryCode: "CA", status: "ACTIVE", contactEmail: `${key}@firm.example` } });
  const host = await db.platformStaff.create({ data: { firmId: firm.id, email: `host-${key}@staff.example`, displayName: "Sample host", status: "ACTIVE" } });
  await copyFirmHoursTo(db, firm.id, [host.id]);
  await db.foConsultationType.create({ data: { firmId: firm.id, slug: "free", name: "Free consultation", modes: ["VIDEO", "PHONE"], hostStaffIds: [host.id], minutes: 30, windowDays: 130 } });
  console.log(`setup (not through the product: no firm, staff, hours or type screens yet): firm ${key}, one host, firm hours copied, type "free" (window 130 days to reach 14 Mar 2027)`);

  // Toronto leaves EST for EDT on Sun 14 Mar 2027 (02:00 → 03:00). Fri 12 Mar 09:00 EST = 14:00Z; Mon 15 Mar 09:00 EDT = 13:00Z.
  const q = `from=2027-03-12T00:00:00Z&to=2027-03-16T00:00:00Z`;
  const s = await j("GET", `/api/public/firms/${key}/book/free/slots?${q}&tz=Asia/Dubai`);
  ok("R1.38 slots: 200 and the page answers in the visitor's zone (Asia/Dubai)", s.status === 200 && s.body.timeZone === "Asia/Dubai", s);
  const slots: { startsAt: string; label: string }[] = s.body.slots ?? [];
  const first = (day: string) => slots.find((x) => x.startsAt.startsWith(day))?.startsAt;
  ok("R1.38 DST: Friday 12 Mar's first slot is 09:00 Toronto = 14:00Z (EST)", first("2027-03-12") === "2027-03-12T14:00:00.000Z", first("2027-03-12"));
  ok("R1.38 DST: Monday 15 Mar's first slot is 09:00 Toronto = 13:00Z (EDT, the hours followed the change)", first("2027-03-15") === "2027-03-15T13:00:00.000Z", first("2027-03-15"));
  ok("R1.38 fail: no slot on the weekend (13, 14 Mar) when the firm's hours are Monday to Friday", !slots.some((x) => /^2027-03-1[34]/.test(x.startsAt)), slots.filter((x) => /^2027-03-1[34]/.test(x.startsAt)).length);
  const fri = slots.find((x) => x.startsAt === "2027-03-12T15:00:00.000Z"), mon = slots.find((x) => x.startsAt === "2027-03-15T14:00:00.000Z");
  ok("R1.38 label: Fri 10:00 Toronto (15:00Z) reads 7:00 p.m. in Dubai, zone named", !!fri && /7:00\s?p\.m\./.test(fri.label) && fri.label.includes("(Asia/Dubai)"), fri);
  ok("R1.38 label: Mon 10:00 Toronto (14:00Z) reads 6:00 p.m. in Dubai after the change", !!mon && /6:00\s?p\.m\./.test(mon.label), mon);
  const sT = await j("GET", `/api/public/firms/${key}/book/free/slots?${q}`);
  ok("R1.38 default: with no tz the page answers in the firm's zone (America/Toronto) and Fri 15:00Z reads 10:00 a.m.", sT.body.timeZone === "America/Toronto" && /10:00\s?a\.m\./.test(sT.body.slots.find((x: any) => x.startsAt === "2027-03-12T15:00:00.000Z")?.label ?? ""), sT.body.timeZone);
  const bad = await j("GET", `/api/public/firms/${key}/book/free/slots?${q}&tz=Mars/Olympus`);
  ok("R1.38 fail: an unknown zone → 422 in words, never 500 (PF-28 part 4: a field error)", bad.status === 422, bad);

  await new Promise((r) => setTimeout(r, 3500)); // the form's minimum fill time (3 s)
  const form = { givenNames: "Client", familyName: "A", email: `client-${key}@example.com`, mode: "VIDEO", startsAt: "2027-03-12T15:00:00.000Z", timeZone: "Asia/Dubai", consent: true, consentWordingId: s.body.consent?.wordingId, formStamp: s.body.formStamp };
  const b = await j("POST", `/api/public/firms/${key}/book/free/bookings`, form);
  ok("R1.38 book: 201, stored 15:00Z, shown 7:00 p.m. (Asia/Dubai)", b.status === 201 && b.body.startsAt === "2027-03-12T15:00:00.000Z" && /7:00\s?p\.m\..*\(Asia\/Dubai\)/.test(b.body.label), b);
  const token1: string = b.body.manageToken;
  const row = await db.foBooking.findFirst({ where: { firmId: firm.id } });
  const raw = await db.$queryRaw<{ utc: string }[]>`SELECT to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS utc FROM fo_booking WHERE id = ${row!.id}::uuid`;
  ok("R1.38 underneath (SQL, zone-free): the stored instant is 2027-03-12T15:00 UTC", raw[0]?.utc === "2027-03-12T15:00", raw);
  ok("R1.38 underneath: fo_booking.starts_at is the UTC instant and the booker's zone is kept", row?.startsAt.toISOString() === "2027-03-12T15:00:00.000Z" && row?.bookerTimeZone === "Asia/Dubai" && row?.sequence === 0, row);
  const twice = await j("POST", `/api/public/firms/${key}/book/free/bookings`, { ...form, email: `other-${key}@example.com` });
  ok("R1.37 fail: the same host and time again → refused (409), one booking only", twice.status === 409 && (await db.foBooking.count({ where: { firmId: firm.id } })) === 1, twice);

  const m = await j("GET", `/api/public/bookings/${token1}`);
  ok("R1.42 next step: the self-service link opens the booking in the booker's zone and can still change it", m.status === 200 && m.body.canChange === true && /7:00\s?p\.m\./.test(m.body.label), m);
  const ms = await j("GET", `/api/public/bookings/${token1}/slots?${q}`);
  ok("R1.42 move slots: answered in the booker's zone; Monday 14:00Z is offered", ms.body.timeZone === "Asia/Dubai" && ms.body.slots.some((x: any) => x.startsAt === "2027-03-15T14:00:00.000Z"), ms.body.timeZone);
  const mv = await j("POST", `/api/public/bookings/${token1}/reschedule`, { startsAt: "2027-03-15T14:00:00.000Z" });
  ok("R1.38/R1.42 move across the change: RESCHEDULED, 14:00Z, 6:00 p.m. in Dubai, a new link", mv.status === 200 && mv.body.status === "RESCHEDULED" && /6:00\s?p\.m\./.test(mv.body.label) && mv.body.manageToken && mv.body.manageToken !== token1, mv);
  const row2 = await db.foBooking.findFirst({ where: { firmId: firm.id } });
  ok("R1.40 underneath: the move raised the invite's SEQUENCE source (fo_booking.sequence 1); same booking id (the invite's UID)", row2?.sequence === 1 && row2?.id === row?.id, row2);
  const old = await j("GET", `/api/public/bookings/${token1}`);
  const unknown = await j("GET", `/api/public/bookings/${"x".repeat(token1.length)}`);
  ok("R1.42 fail: the old link → the identical not-found an unknown link gets", old.status === 404 && JSON.stringify(old.body) === JSON.stringify(unknown.body), [old, unknown]);
  const c = await j("POST", `/api/public/bookings/${mv.body.manageToken}/cancel`);
  ok("R1.42 cancel by link: CANCELLED", c.status === 200 && c.body.status === "CANCELLED", c);
  const s2 = await j("GET", `/api/public/firms/${key}/book/free/slots?${q}&tz=Asia/Dubai`);
  ok("R1.37 pass: the freed Monday 14:00Z is offered again", s2.body.slots.some((x: any) => x.startsAt === "2027-03-15T14:00:00.000Z"));
  console.log(`${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
