// qa R1.9 "Background jobs, schedules, reminders" (PF-14 runner, used by FO-3's booking since FO-3f): gate A walked by
// API on a running isolated copy (no screen; P-348 (3) "otherwise by API to the next step"). A person books a
// consultation over HTTP; underneath, the booking's jobs sit in PF-14's real queue (pg-boss, schema platform_jobs):
// two reminders (24 h and 1 h before) and the host's attendance question (30 min after), each at its instant, each once;
// the two booking emails run to completion on the runner. Phase "after" runs after the shell restarts the app on the same
// database (isolated.sh restart): the scheduled jobs are still there (not in memory), and a cancel by the visitor's link
// cancels them in the queue. Setup a person cannot do through the product yet (firm, staff, hours, type) is written with
// Prisma, as in check_r1_fo3_tz_walk.ts. No model call (US$0).
//   STUDIO_URL=http://localhost:4471 DATABASE_URL=postgresql://xr_studio@127.0.0.1:54329/xr_studio_qa_fo3 \
//     tsx studio/tests/qa/check_r19_jobs_walk.ts book <state-file>
//   zsh studio/tools/isolated.sh qa_fo3 4471 restart
//   … tsx studio/tests/qa/check_r19_jobs_walk.ts after <state-file>
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { copyFirmHoursTo } from "../../api/src/front-office/booking-seed.ts";

const BASE = process.env.STUDIO_URL ?? "http://localhost:4471";
const [phase, stateFile] = process.argv.slice(2);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, options: "-c TimeZone=UTC" }) });
let pass = 0, fail = 0;
const ok = (n: string, c: unknown, d?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${!c && d !== undefined ? ` — ${JSON.stringify(d).slice(0, 500)}` : ""}`); };
const j = async (method: string, path: string, body?: unknown) => {
  const r = await fetch(BASE + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let b: any = t; try { b = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body: b };
};
type Job = { name: string; state: string; start_after: Date; key: string | null; data: any };
// PF-14 wraps each job's data as { due, key, firmId, payload } (platform-jobs.ts); the booking id is in payload.
const jobsOf = (bookingId: string) => db.$queryRawUnsafe<Job[]>(
  `SELECT name, state::text AS state, start_after, data->>'key' AS key, data->'payload' AS data FROM platform_jobs.job WHERE data->'payload'->>'bookingId' = $1 ORDER BY name, start_after`, bookingId);
const MIN = 60_000;

async function book() {
  const key = `qa-r19-${process.pid}`;
  const firm = await db.platformFirm.create({ data: { key, operatingName: "Sample qa firm", countryCode: "CA", status: "ACTIVE", contactEmail: `${key}@firm.example` } });
  const host = await db.platformStaff.create({ data: { firmId: firm.id, email: `host-${key}@staff.example`, displayName: "Sample host", status: "ACTIVE" } });
  await copyFirmHoursTo(db, firm.id, [host.id]);
  await db.foConsultationType.create({ data: { firmId: firm.id, slug: "free", name: "Free consultation", modes: ["VIDEO", "PHONE"], hostStaffIds: [host.id], minutes: 30, windowDays: 30 } });
  console.log(`setup (not through the product): firm ${key}, one host, firm hours, type "free"`);
  const from = new Date(Date.now() + 2 * 24 * 60 * MIN), to = new Date(Date.now() + 9 * 24 * 60 * MIN);
  const s = await j("GET", `/api/public/firms/${key}/book/free/slots?from=${from.toISOString()}&to=${to.toISOString()}&tz=America/Vancouver`);
  ok("slots: 200 with at least one slot 2 to 9 days out", s.status === 200 && (s.body.slots?.length ?? 0) > 0, s);
  const slot: string = s.body.slots[0].startsAt;
  await new Promise((r) => setTimeout(r, 3500)); // the form's minimum fill time
  const b = await j("POST", `/api/public/firms/${key}/book/free/bookings`, { givenNames: "Client", familyName: "A", email: `client-${key}@example.com`, mode: "VIDEO", startsAt: slot, timeZone: "America/Vancouver", consent: true, consentWordingId: s.body.consent?.wordingId, formStamp: s.body.formStamp });
  ok("book: 201", b.status === 201, b);
  const row = await db.foBooking.findFirst({ where: { firmId: firm.id } });
  const start = row!.startsAt.getTime(), end = row!.endsAt.getTime();
  await new Promise((r) => setTimeout(r, 6000)); // let the runner take the two emails
  const js = await jobsOf(row!.id);
  const rem = js.filter((x) => x.name === "booking.reminder"), ask = js.filter((x) => x.name === "booking.attendance_ask"), mail = js.filter((x) => x.name === "booking.mail");
  ok("R1.9 underneath: two reminders in PF-14's queue (platform_jobs.job), not in memory", rem.length === 2, js.map((x) => [x.name, x.state]));
  const at = rem.map((x) => x.start_after.getTime()).sort();
  ok("R1.9 schedule: reminders at 24 h and 1 h before the start", at[0] === start - 24 * 60 * MIN && at[1] === start - 60 * MIN, { at: at.map((t) => new Date(t).toISOString()), start: row!.startsAt });
  ok("R1.9 schedule: one attendance question 30 min after the end", ask.length === 1 && ask[0].start_after.getTime() === end + 30 * MIN, ask);
  ok("R1.9 waiting: the reminders and the question wait (state created), none ran early", rem.length + ask.length === 3 && [...rem, ...ask].every((x) => x.state === "created"), [...rem, ...ask].map((x) => x.state));
  ok("R1.9 run: the booking emails (booker and host) ran to completion on the runner", mail.length === 2 && mail.every((x) => x.state === "completed"), mail.map((x) => [x.data?.to, x.state]));
  const keys = js.map((x) => x.key ?? "");
  ok("R1.9 once: every job carries its own key, no key twice", keys.length === 5 && keys.every(Boolean) && new Set(keys).size === keys.length, keys);
  writeFileSync(stateFile, JSON.stringify({ bookingId: row!.id, link: b.body.manageToken, count: js.length }));
}

async function after() {
  const st = JSON.parse(readFileSync(stateFile, "utf8"));
  const js = await jobsOf(st.bookingId);
  ok("R1.9 restart: after the app restarted on the same database, the same jobs are there", st.count === 5 && js.length === st.count, js.map((x) => [x.name, x.state]));
  ok("R1.9 restart: the reminders and the question still wait", js.filter((x) => x.name !== "booking.mail").length === 3 && js.filter((x) => x.name !== "booking.mail").every((x) => x.state === "created"), js.map((x) => [x.name, x.state]));
  const h = await j("GET", "/api/health/ready");
  ok("R1.9 ready: the restarted app counts its job queue", h.status === 200 && h.body.checks?.job_queue?.ok === true, h);
  const c = await j("POST", `/api/public/bookings/${st.link}/cancel`);
  ok("cancel by the visitor's link: 200 CANCELLED", c.status === 200 && c.body.status === "CANCELLED", c);
  await new Promise((r) => setTimeout(r, 3000));
  const js2 = await jobsOf(st.bookingId);
  const waiting = js2.filter((x) => x.name !== "booking.mail");
  ok("R1.9 cancel (fail case for a leftover): the reminders and the question are cancelled in the queue", waiting.length === 3 && waiting.every((x) => x.state === "cancelled"), waiting.map((x) => [x.name, x.state]));
  ok("R1.9 cancel: the cancellation emails were queued as their own keyed jobs", js2.filter((x) => x.name === "booking.mail").length > 2, js2.filter((x) => x.name === "booking.mail").map((x) => [x.data?.kind, x.data?.to, x.state]));
}

(async () => {
  try { if (phase === "book") await book(); else if (phase === "after") await after(); else throw new Error("phase: book | after"); }
  catch (e) { console.error(e); fail++; }
  console.log(`${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
})();
