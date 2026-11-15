// J-9 (map rows 9 + 13, background jobs; logs, metrics and alerts): PF-23w's walk (rows rev 16.11 (b)), on an isolated
// copy of the running app (its own database and port; never :4400). A booker books a slot on a firm's public booking
// door, the reminder waits in pg-boss, the API restarts, ready is ok and the reminder is still queued.
//   W1: book a slot through the public booking API (the public page is FO-3w's screen row: none in web/ yet);
//   W2: the reminder is a row in pg-boss's job table (platform_jobs.job), waiting;
//   W3: restart the API (isolated.sh restart); /api/health/ready is 200 with job_queue.ok true and the reminder is
//       still queued;
//   W4: the reminder runs at its due time and the booker's mail arrives in the demo inbox: not run here (PR #1800's
//       question for the tech lead: the running app's mail and arrival are in-memory fakes and its clock is the system's).
// The test firm, its host and its free-consultation type are written straight to the copy's database (Sample rows).
// Run from prototype/ (US$0, no model call):
//   zsh studio/tools/isolated.sh j9 4431 start --ttl 20 && trap 'zsh studio/tools/isolated.sh j9 4431 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_9.ts j9 4431
import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { copyFirmHoursTo } from "../../api/src/front-office/booking-seed.ts";

const [NAME, PORT] = [process.argv[2] ?? "j9", Number(process.argv[3] ?? 4431)];
const STUDIO = join(import.meta.dirname, "..", ".."), BASE = `http://127.0.0.1:${PORT}`;
const URL = `postgresql://xr_studio@127.0.0.1:54329/xr_studio_${NAME}`;
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
const json = async (r: Response) => ({ status: r.status, body: await r.json() as Record<string, any> });

try {
  // The firm's public door (Sample rows).
  const firm = await db.platformFirm.create({ data: { key: `j9-${Date.now().toString(36)}`, operatingName: "Sample J-9 firm", countryCode: "CA", status: "ACTIVE", contactEmail: "office@j9.example" } });
  const host = await db.platformStaff.create({ data: { firmId: firm.id, email: "host@j9.example", displayName: "Sample host", status: "ACTIVE" } });
  await copyFirmHoursTo(db, firm.id, [host.id]);
  await db.foConsultationType.create({ data: { firmId: firm.id, slug: "free", name: "Free consultation", modes: ["VIDEO", "PHONE"], hostStaffIds: [host.id], minutes: 30 } });

  // W1: a booker books the first time more than 25 h ahead (so the 24 h reminder is queued).
  const page = await json(await fetch(`${BASE}/api/public/firms/${firm.key}/book/free/slots`));
  const slot = (page.body.slots as { startsAt: string }[] | undefined)?.find((s) => Date.parse(s.startsAt) > Date.now() + 25 * 3_600_000);
  await pause(3_500);   // the form's minimum fill time
  const booked = await json(await fetch(`${BASE}/api/public/firms/${firm.key}/book/free/bookings`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ givenNames: "Ana", familyName: "Sample", email: "ana@j9-client.example", mode: "VIDEO", startsAt: slot?.startsAt, timeZone: "America/Toronto", consent: true, consentWordingId: page.body.consent?.wordingId, formStamp: page.body.formStamp }) }));
  ok("J-9 W1: a booker books a slot on the firm's public booking door (201, a self-service link)", page.status === 200 && slot && booked.status === 201 && typeof booked.body.manageToken === "string", { page: page.status, slot, booked });

  // W2: the reminder is in pg-boss.
  const tok = await db.foBookingToken.findUniqueOrThrow({ where: { id: String(booked.body.manageToken).split(".")[0] } });
  const reminders = () => db.$queryRawUnsafe<{ key: string; state: string }[]>(`select data->>'key' as key, state from platform_jobs.job where name = 'booking.reminder' and data->>'key' like $1`, `booking:${tok.bookingId}:%`);
  const r1 = await reminders();
  ok("J-9 W2: the booking's reminders (24 h and 1 h) are rows in pg-boss's job table, waiting", r1.length === 2 && r1.every((r) => r.state === "created"), r1);

  // W3: the API restarts; ready is ok and the reminder is still queued.
  execFileSync("zsh", [join(STUDIO, "tools", "isolated.sh"), NAME, String(PORT), "restart"], { stdio: ["ignore", "ignore", "inherit"] });
  let ready = { status: 0, body: {} as Record<string, any> };
  for (let i = 0; i < 60 && ready.status !== 200; i++) { try { ready = await json(await fetch(`${BASE}/api/health/ready`)); } catch { /* starting */ } if (ready.status !== 200) await pause(1_000); }
  ok("J-9 W3: after the API restart /api/health/ready is 200 with job_queue.ok true", ready.status === 200 && ready.body.checks?.job_queue?.ok === true, ready);
  const r2 = await reminders();
  ok("J-9 W3: the reminders are still queued after the restart", r2.length === 2 && r2.every((r) => r.state === "created"), r2);
  console.log("NOT RUN  J-9 W4 (the reminder mails the booker into the demo inbox): PR #1800's question for the tech lead");
} finally {
  await db.$disconnect();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
