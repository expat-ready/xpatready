// J-37 (map row 37: the public booking page, no double booking; brief lead-b-briefs/J-rows.md §J-37 on branch
// lead-b-front-office): the join-and-walk row. It adds no feature: it walks FO-3w's public pages (on main) on an isolated
// copy of the running app (its own database and port, never :4400), in two real browsers, with the booking mail read
// back from the demo inbox (GET /api/demo/platform-inbox: the app's MailPort over MessagePort and PF-19b's local adapter,
// already the running app's mail, runtime-ports.ts).
//   W1: the public page lists slots;  W2: booker A books one;  W3: booker B, on the same slot in a second browser, is
//   refused ("This time was just booked.") and offered the next slots, and only one booking exists;  W4: A's
//   confirmation arrives in the demo inbox;  W5: ends at row 42's first step: A's manage link opens A's booking.
//   W4b (J-9 W4, moved from PF-23w, #1800): restart the API; A's reminder still runs at its due time and arrives in the
//   demo inbox. It needs FO-2 part 3b's real ArrivalPort (#2196, bound in booking/runtime-ports.ts): on fakeArrival the
//   restarted API keeps no booker in memory and sends nothing. Clock seam: after the restart the walk sets the queued
//   reminder's start_after to now in pg-boss's job table on the copy (the only change made outside the app).
// Fails on the fake (P-606): the inbox read is the real outbox (msg_outbox SENT by the local provider), never fakeMail.
// The firm, its host, hours and free-consultation type are written straight to the copy's database (Sample rows: no
// screen makes a firm or a type yet in this walk's path). US$0, no model call.
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j37 4437 start --ttl 30 && trap 'zsh studio/tools/isolated.sh j37 4437 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_37.ts j37 4437
import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type Page } from "playwright";
import { copyFirmHoursTo } from "../../api/src/front-office/booking-seed.ts";

const [NAME, PORT] = [process.argv[2] ?? "j37", Number(process.argv[3] ?? 4437)];
const STUDIO = join(import.meta.dirname, "..", ".."), BASE = `http://localhost:${PORT}`, TZ = "America/Toronto";
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-37", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/xr_studio_${NAME}`, options: "-c TimeZone=UTC" }) });
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const run = Date.now().toString(36);
const headed = process.env.HEADED === "1";
const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 150 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const visitor = async () => { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: TZ, locale: "en-CA", colorScheme: "light", reducedMotion: "reduce" }); return { ctx, p: await ctx.newPage() }; };
const inbox = async (address: string) => ((await (await fetch(`${BASE}/api/demo/platform-inbox?address=${encodeURIComponent(address)}`)).json()) as { messages?: { subject: string; body?: string; html?: string }[] }).messages ?? [];
async function fill(p: Page, given: string, email: string) {
  await p.getByLabel("Given names").fill(given); await p.getByLabel("Family name").fill("Sample"); await p.getByLabel("Email").fill(email);
}
/** Opens the type page and picks the first day with times, then its first time; answers that time's label. */
async function pickFirst(p: Page, path: string): Promise<string> {
  await p.goto(`${BASE}${path}`); await p.getByRole("heading", { name: "Choose a time" }).waitFor({ timeout: 30_000 });
  for (let i = 0; i < 3 && !(await p.locator("[data-day-times] li").count()); i++) { await p.getByRole("button", { name: "Next month" }).click(); await p.waitForTimeout(800); }
  const first = p.locator("[data-day-times] li button").first();
  const label = (await first.getAttribute("aria-label")) ?? (await first.innerText());
  await first.click(); await p.getByRole("heading", { name: "Your details" }).waitFor({ timeout: 15_000 });
  return label;
}

try {
  // ------------------------------------------------------------------------------------------- the firm (Sample rows)
  const firm = await db.platformFirm.create({ data: { key: `j37-${run}`, operatingName: "Sample J-37 firm", countryCode: "CA", status: "ACTIVE", contactEmail: `office-${run}@j37.example` } });
  const host = await db.platformStaff.create({ data: { firmId: firm.id, email: `host-${run}@j37.example`, displayName: "Sample host", status: "ACTIVE" } });
  await copyFirmHoursTo(db, firm.id, [host.id]);
  await db.foConsultationType.create({ data: { firmId: firm.id, slug: "free", name: "Free consultation", modes: ["VIDEO"], hostStaffIds: [host.id], minutes: 30, minNoticeMinutes: 240 } });   // 4 h notice: the 1 h reminder is always queued (review n1)
  const path = `/book/${firm.key}/free`, A = `booker-a-${run}@j37-client.example`, B = `booker-b-${run}@j37-client.example`;

  // ------------------------------------------------------------------------------------------- W1: the page lists slots
  const a = await visitor(), b = await visitor();
  await a.p.goto(`${BASE}/book/${firm.key}`); await a.p.getByRole("link", { name: "Choose Free consultation" }).waitFor({ timeout: 30_000 });
  const listed = await a.p.getByRole("link", { name: "Choose Free consultation" }).count();
  const slotA = await pickFirst(a.p, path);
  ok("J-37 W1: the firm's public page lists its type, and the type page lists free times", listed === 1 && slotA.length > 0, slotA);
  await a.p.screenshot({ path: join(SHOTS, "w1-times-1440.png"), fullPage: true });

  // --------------------------------------------------------------- W2, W3: A books; B, on the same slot, is refused
  const slotB = await pickFirst(b.p, path);
  ok("J-37 W3 set-up: booker B, in a second browser, has the same time open", slotB === slotA, [slotA, slotB]);
  await fill(a.p, "Client A", A); await fill(b.p, "Client B", B);
  await a.p.waitForTimeout(3_200);   // the form's minimum fill time (FO-3f), as a person takes
  // A true race (review m1): both press "Book this time" at the same moment; the door lets exactly one through.
  await Promise.all([a.p.getByRole("button", { name: "Book this time" }).click(), b.p.getByRole("button", { name: "Book this time" }).click()]);
  const outcome = async (x: Page) => { await x.locator('[data-public-state="booked"], [data-summary]').first().waitFor({ timeout: 20_000 }); return (await x.locator('[data-public-state="booked"]').count()) ? "booked" : "refused"; };
  const [oa, ob] = await Promise.all([outcome(a.p), outcome(b.p)]);
  const [win, lose, winMail, loseMail] = oa === "booked" ? [a, b, A, B] : [b, a, B, A];
  ok("J-37 W2: one booker books the time and sees \"You are booked\"", [oa, ob].filter((o) => o === "booked").length === 1, [oa, ob]);
  await win.p.screenshot({ path: join(SHOTS, "w2-booked-1440.png"), fullPage: true });
  const loseText = await lose.p.locator("main").innerText();
  const rows = await db.foBooking.findMany({ where: { firmId: firm.id }, select: { status: true, staffId: true } });
  ok("J-37 W3: the other, pressing at the same moment on the same time, is refused (\"This time was just booked.\", \"Please choose another time.\"), offered the next free times, answers kept; exactly one booking, SCHEDULED, with the host",
    loseText.includes("This time was just booked.") && loseText.includes("Please choose another time.") && loseText.includes("Next free times")
    && (await lose.p.getByLabel("Email").inputValue()) === loseMail && rows.length === 1 && rows[0].status === "SCHEDULED" && rows[0].staffId === host.id, { rows, text: loseText.slice(0, 300) });
  await lose.p.screenshot({ path: join(SHOTS, "w3-taken-1440.png"), fullPage: true });

  // ---------------------------------------------------------- W4: the booker's confirmation arrives in the demo inbox
  let mails: Awaited<ReturnType<typeof inbox>> = [];
  for (let i = 0; i < 60 && !mails.some((m) => /is booked/.test(m.subject)); i++) { mails = await inbox(winMail); if (!mails.length) await new Promise((r) => setTimeout(r, 3_000)); }
  const body = mails.map((m) => `${m.body ?? ""}\n${m.html ?? ""}`).join("\n");
  ok("J-37 W4: the booker's confirmation (\"Your Free consultation is booked\") arrives in the demo inbox: the real outbox, sent by the local provider",
    mails.some((m) => m.subject === "Your Free consultation is booked"), mails.map((m) => m.subject));
  await new Promise((r) => setTimeout(r, 8_000));   // two job hops' time for a wrong mail to arrive (review m4)
  ok("J-37 W4 fail side: the refused booker got no booking mail", (await inbox(loseMail)).length === 0);

  // -------------------------------------------------------------- W4b (J-9 W4): the reminder after an API restart
  // The booking's reminders are pg-boss jobs keyed `booking:<id>:<seq>:reminder-…` (booking/service.ts afterCommit);
  // only those due after now are queued, so the 24 h one is absent for a slot within a day, the 1 h one is there.
  const booking = await db.foBooking.findFirstOrThrow({ where: { firmId: firm.id, status: "SCHEDULED" }, select: { id: true } });
  const reminders = () => db.$queryRawUnsafe<{ id: string; key: string; state: string }[]>(`select id::text, data->>'key' as key, state from platform_jobs.job where name = 'booking.reminder' and data->>'key' like $1 order by start_after`, `booking:${booking.id}:%`);
  const queued = await reminders();
  // Fail at once, naming the cause, rather than after the restart and the wait (review n1).
  if (!queued.length) { ok("J-37 W4b set-up: the booking has a reminder queued (none: the slot is within an hour)", false, { bookingId: booking.id }); throw new Error("no reminder queued"); }
  execFileSync("zsh", [join(STUDIO, "tools", "isolated.sh"), NAME, String(PORT), "restart", "--ttl", "30"], { stdio: ["ignore", "ignore", "inherit"] });
  let ready = 0;
  for (let i = 0; i < 90 && ready !== 200; i++) { try { ready = (await fetch(`${BASE}/api/health/ready`)).status; } catch { /* starting */ } if (ready !== 200) await new Promise((r) => setTimeout(r, 1_000)); }
  const after = await reminders();
  // The clock seam (named in the PR): the walk cannot wait until an hour before the slot, so on this copy only, after
  // the restart, the earliest queued reminder's start_after is set to now in pg-boss's own table. Everything after is
  // the running app: pg-boss hands it to the restarted worker, runReminder reads the booker through the ArrivalPort
  // (FO-2 part 3b's real adapter: the person is in the database, not in a fake's memory) and sends through MailPort.
  const due = after.find((r) => r.state === "created");
  if (due) await db.$executeRawUnsafe(`update platform_jobs.job set start_after = now() where id = $1::uuid`, due.id);
  let reminded: Awaited<ReturnType<typeof inbox>> = [];
  for (let i = 0; i < 40 && !reminded.length; i++) { reminded = (await inbox(winMail)).filter((m) => m.subject.startsWith("Reminder: your Free consultation")); if (!reminded.length) await new Promise((r) => setTimeout(r, 3_000)); }
  ok("J-37 W4b (J-9 W4): after an API restart (ready 200) the booking's reminder is still queued, runs when due (clock seam: start_after set to now on the copy) and arrives in the demo inbox; on fakeArrival it finds no booker and nothing arrives",
    queued.length >= 1 && ready === 200 && !!due && reminded.length === 1, { queued, after, ready, subjects: (await inbox(winMail)).map((m) => m.subject) });

  // ------------------------------------------------------------------------- W5: row 42's first step, the manage link
  const link = body.match(/\/book\/[a-z0-9-]+\/manage#[A-Za-z0-9._~-]+/)?.[0];
  if (link) { await win.p.goto(`${BASE}${link}`); await win.p.getByRole("button", { name: /Reschedule|Cancel/ }).first().waitFor({ timeout: 20_000 }).catch(() => undefined); }
  const manage = link ? await win.p.locator("main").innerText() : "", hm = slotA.match(/\d{1,2}:\d{2}/)?.[0] ?? "?";
  ok("J-37 W5: the mail carries the manage link; it opens this booking at its own time with Reschedule and Cancel (row 42's first step)", !!link && manage.includes(hm) && /Reschedule/.test(manage) && /Cancel/.test(manage), { link, hm, manage: manage.slice(0, 200) });
  await win.p.screenshot({ path: join(SHOTS, "w5-manage-1440.png"), fullPage: true });
  await lose.p.goto(`${BASE}/book/${firm.key}/manage#bad.link`); await lose.p.getByText("This link is no longer valid.").waitFor({ timeout: 15_000 }).catch(() => undefined);
  ok("J-37 W5 fail side: a broken manage link shows \"This link is no longer valid.\"", (await lose.p.locator("main").innerText()).includes("This link is no longer valid."));
  await a.ctx.close(); await b.ctx.close();
} finally {
  await browser.close(); await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
