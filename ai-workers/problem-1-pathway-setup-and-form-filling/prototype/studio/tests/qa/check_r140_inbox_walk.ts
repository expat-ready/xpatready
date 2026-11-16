// qa R1.40 / R1.38 (16 Nov, after PF-19b booking mail #b54c2cd4b): the invite read back from the running app. On a running
// isolated copy (demo workspace) a visitor in Asia/Dubai books Fri 12 Mar 2027 10:00 Toronto (EST) over HTTP, moves it by
// the self-service link to Mon 15 Mar 10:00 (EDT, after Toronto's 14 Mar change), then cancels. Then the demo inbox
// (GET /api/demo/platform-inbox, stand-in SI-20) is read for the booker and the host: three mails each, each with an
// invite .ics; one UID; SEQUENCE rising; METHOD REQUEST, REQUEST, CANCEL; DTSTART in UTC across the change; the booker's
// wall time in Dubai, the host's in Toronto. Each with a fail case. Setup a person cannot do through the product yet
// (firm, host, hours, type: PF-5, PF-4s, FO-3a not built) is written once with Prisma. No model call (US$0).
//   STUDIO_URL=http://localhost:4472 DATABASE_URL=postgresql://xr_studio@127.0.0.1:54329/xr_studio_qa_fon tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_r140_inbox_walk.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { copyFirmHoursTo } from "../../api/src/front-office/booking-seed.ts";

const BASE = process.env.STUDIO_URL ?? "http://localhost:4472";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, options: "-c TimeZone=UTC" }) });
let pass = 0, fail = 0;
const ok = (n: string, c: unknown, d?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${!c && d !== undefined ? ` — ${JSON.stringify(d).slice(0, 500)}` : ""}`); };
const j = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(BASE + path, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let b: any = t; try { b = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body: b };
};
type Msg = { subject: string; body: string; attachments: { filename: string; content_type: string; text: string | null }[]; sent_at: string };
const icsOf = (m?: Msg) => m?.attachments.find((a) => /calendar/.test(a.content_type) || /\.ics$/.test(a.filename))?.text ?? "";
const inbox = async (address: string, want: number) => {
  for (let i = 0; i < 60; i++) {
    const r = await j("GET", `/api/demo/platform-inbox?address=${encodeURIComponent(address)}`);
    if (r.status === 200 && r.body.messages.length >= want) return { status: r.status, msgs: [...r.body.messages as Msg[]].reverse() /* oldest first */ };
    await new Promise((x) => setTimeout(x, 1000));
  }
  const r = await j("GET", `/api/demo/platform-inbox?address=${encodeURIComponent(address)}`);
  return { status: r.status, msgs: [...(r.body?.messages ?? []) as Msg[]].reverse() };
};

async function main() {
  const key = `qa-r140-${process.pid}`;
  const firm = await db.platformFirm.create({ data: { key, operatingName: "Sample qa firm", countryCode: "CA", status: "ACTIVE", contactEmail: `${key}@firm.example` } });
  const hostEmail = `host-${key}@staff.example`, booker = `client-${key}@example.com`;
  const host = await db.platformStaff.create({ data: { firmId: firm.id, email: hostEmail, displayName: "Sample host", status: "ACTIVE" } });
  await copyFirmHoursTo(db, firm.id, [host.id]);
  await db.foConsultationType.create({ data: { firmId: firm.id, slug: "free", name: "Free consultation", modes: ["VIDEO"], hostStaffIds: [host.id], minutes: 30, windowDays: 130 } });
  console.log(`setup (not through the product: no firm, staff, hours or type screens yet): firm ${key}, one host, type "free"`);

  const q = `from=2027-03-12T00:00:00Z&to=2027-03-16T00:00:00Z`;
  const s = await j("GET", `/api/public/firms/${key}/book/free/slots?${q}&tz=Asia/Dubai`);
  await new Promise((r) => setTimeout(r, 3500)); // the form's minimum fill time
  const b = await j("POST", `/api/public/firms/${key}/book/free/bookings`, { givenNames: "Client", familyName: "A", email: booker, mode: "VIDEO", startsAt: "2027-03-12T15:00:00.000Z", timeZone: "Asia/Dubai", consent: true, consentWordingId: s.body.consent?.wordingId, formStamp: s.body.formStamp });
  ok("book: 201 at 15:00Z", b.status === 201 && b.body.startsAt === "2027-03-12T15:00:00.000Z", b);
  // A person moves it later: wait for the booked mail first. The worker drops a mail whose booking changed before it ran
  // (service.ts runMail: "a newer state has its own email, so an older one is not sent"), so a walk without the wait
  // sees only the last mail (qa's first run, 16 Nov: 1 of 3 per inbox).
  ok("the booked mail reaches the booker's demo inbox before the move", (await inbox(booker, 1)).msgs.length === 1);
  const mv = await j("POST", `/api/public/bookings/${b.body.manageToken}/reschedule`, { startsAt: "2027-03-15T14:00:00.000Z" });
  ok("move by link across Toronto's change: 200 at 14:00Z", mv.status === 200 && mv.body.startsAt === "2027-03-15T14:00:00.000Z", mv);
  ok("the moved mail reaches the booker's demo inbox before the cancel", (await inbox(booker, 2)).msgs.length === 2);
  const c = await j("POST", `/api/public/bookings/${mv.body.manageToken}/cancel`);
  ok("cancel by link: CANCELLED", c.status === 200 && c.body.status === "CANCELLED", c);
  const row = await db.foBooking.findFirstOrThrow({ where: { firmId: firm.id } });

  const B = await inbox(booker, 3), H = await inbox(hostEmail, 3);
  console.log(`NOTE  booker inbox: ${B.msgs.map((m) => m.subject).join(" | ")}`);
  console.log(`NOTE  host inbox: ${H.msgs.map((m) => m.subject).join(" | ")}`);
  console.log(`NOTE  first invite as read from the demo inbox:\n${icsOf(B.msgs[0])}`);
  ok("R1.40 running app: the booker's demo inbox holds three mails (booked, moved, cancelled), each with an invite .ics", B.status === 200 && B.msgs.length === 3 && B.msgs.every((m) => icsOf(m).includes("BEGIN:VCALENDAR")), B.msgs.map((m) => [m.subject, m.attachments.map((a) => a.filename)]));
  ok("R1.40 running app: the host's demo inbox holds three mails, each with an invite .ics", H.status === 200 && H.msgs.length === 3 && H.msgs.every((m) => icsOf(m).includes("BEGIN:VCALENDAR")), H.msgs.map((m) => m.subject));
  const uid = `UID:${row.id}@booking.expatready.com`;
  const all = [...B.msgs, ...H.msgs];
  ok("R1.40 one UID across all six invites (an update replaces the event)", all.length === 6 && all.every((m) => icsOf(m).includes(uid)), all.map((m) => /UID:[^\r\n]*/.exec(icsOf(m))?.[0]));
  const seqOf = (ms: Msg[]) => ms.map((m) => Number(/SEQUENCE:(\d+)/.exec(icsOf(m))?.[1] ?? -1));
  const rising = (s: number[]) => s.length === 3 && s[0] >= 0 && s[0] < s[1] && s[1] < s[2];
  const seqB = seqOf(B.msgs), seqH = seqOf(H.msgs);
  console.log(`NOTE  SEQUENCE booker ${seqB.join(",")} · host ${seqH.join(",")}`);
  ok("R1.40 SEQUENCE present and rising (book, move, cancel), booker and host alike", rising(seqB) && rising(seqH) && seqB.join() === seqH.join(), [seqB, seqH]);
  const methods = (ms: Msg[]) => ms.map((m) => /METHOD:(\w+)/.exec(icsOf(m))?.[1]).join(",");
  ok("R1.40 METHOD REQUEST, REQUEST, then CANCEL (a cancel removes it), booker and host alike", methods(B.msgs) === "REQUEST,REQUEST,CANCEL" && methods(H.msgs) === "REQUEST,REQUEST,CANCEL", [methods(B.msgs), methods(H.msgs)]);
  ok("R1.40 / R1.38 DTSTART in UTC: 15:00Z, then 14:00Z after the change (the same time as the booking)", B.msgs.length === 3 && H.msgs.length === 3 && [B.msgs[0], H.msgs[0]].every((m) => icsOf(m).includes("DTSTART:20270312T150000Z")) && icsOf(H.msgs[1]).includes("DTSTART:20270315T140000Z") && icsOf(B.msgs[0]).includes("DTSTART:20270312T150000Z") && icsOf(B.msgs[1]).includes("DTSTART:20270315T140000Z"), [icsOf(B.msgs[0]).match(/DTSTART[^\r\n]*/)?.[0], icsOf(B.msgs[1]).match(/DTSTART[^\r\n]*/)?.[0]]);
  ok("R1.40 fail case: the moved invite does not still carry the old time", !!B.msgs[1] && icsOf(B.msgs[1]).includes("DTSTART:") && !icsOf(B.msgs[1]).includes("DTSTART:20270312T150000Z"));
  const w = (m?: Msg) => `${m?.subject ?? ""} ${m?.body ?? ""}`;
  ok("R1.38 the booker's mails read 7:00 p.m., then 6:00 p.m., each naming Asia/Dubai", B.msgs.length === 3 && /7:00\s?p\.m\./.test(w(B.msgs[0])) && /6:00\s?p\.m\./.test(w(B.msgs[1])) && [B.msgs[0], B.msgs[1]].every((m) => w(m).includes("Asia/Dubai")), [B.msgs[0]?.subject, B.msgs[1]?.subject]);
  ok("R1.38 the host's mails read 10:00 a.m., each naming America/Toronto", H.msgs.length === 3 && [H.msgs[0], H.msgs[1]].every((m) => /10:00\s?a\.m\./.test(w(m)) && w(m).includes("America/Toronto")), H.msgs.map((m) => m.subject));
  ok("R1.38 fail case: the host's moved mail does not read 9:00 or 11:00 a.m. (an offset not shifted)", !!H.msgs[1] && /a\.m\./.test(w(H.msgs[1])) && !/(9|11):00\s?a\.m\./.test(w(H.msgs[1])), H.msgs[1]?.subject);
  const bad = await j("GET", `/api/demo/platform-inbox?address=not-an-address`);
  ok("fail case: a malformed address → 400 in words", bad.status === 400, bad);
  console.log(`${pass} passed, ${fail} failed`);
  await db.$disconnect(); process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
