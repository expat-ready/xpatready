// J-37 (map row 37, R1.37 public booking page; no double booking): the join-and-walk row (rows rev 16.11 (b), brief
// lead-b-briefs/J-rows.md §J-37). It adds no feature: it walks FO-3w's public booking page in two browsers and reads the
// demo inbox, on an isolated copy of the running app (its own database and port, never :4400), on the real clock.
//   DW1: booking's mail is the real sending path (PF-19b part 1 did the swap): A's mails are msg_outbox rows SENT, or
//        DELIVERED once the local Delivery test event lands (#2397, QA-570), by the local adapter, read back from the
//        running app's demo inbox. Fails on the fake: fakeMail wrote no row.
//   DW2: booking's arrival is the real one (FO-2 part 3b, #2196): A is an fo_person row, and after the API restarts the
//        reminder still finds A and mails them. Fails on the fake: fakeArrival kept people in the process's memory, so
//        after a restart the reminder found no booker and sent nothing (PF-23w's deferred J-9 W4, #1800).
//   W1: the firm's public page lists its consultation and the day's free times;
//   W2: booker A books one (browser 1);
//   W3: booker B, who had the same time open in a second browser, is refused ("This time was just booked.") and offered
//       the next free times, none of them A's; one booking exists underneath;
//   W4: A's confirmation arrives in the demo inbox;
//   W4b (J-9 W4, moved from PF-23w): the API restarts; A's 1 h reminder still runs at its due time and arrives in the
//       demo inbox, not before;
//   W5: ends at row 42's first step: the manage link in A's mail opens A's own page, which offers Reschedule.
// The real clock, no seam: A books a time about 66 minutes ahead, so the 1 h reminder falls due 6 to 11 minutes after the
// booking; the API restarts in between and the walk waits for the reminder. For that the test's own consultation type
// has Sample settings a firm may choose: 60 minutes' notice (default 240), times every 5 minutes, a 30-minute self-service
// limit (default 240, which would hide Reschedule an hour before), and its one host works every hour of every day. The
// meeting is 5 minutes (the database's shortest) so a time is offered up to 23:55: with 30 minutes the last start is
// 23:30, and a run between 22:25 and 22:49 Toronto time would find nothing (review M1).
// Known gap, one night a year: a run started between 00:49 and 01:29 on the night Toronto's clocks go back (next 7 Nov
// 2027) aims inside the repeated hour, whose second times the page does not offer; W1 fails then (review m3).
// Setup a person cannot do through the product yet (firm, host, hours, type: PF-5, PF-4s, FO-3a) is written straight to
// the copy's database (Sample rows). Sample values only; US$0, no model call. About 12 minutes.
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j37 4437 start --ttl 40 && trap 'zsh studio/tools/isolated.sh j37 4437 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_37.ts j37 4437
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { platformAuditWorkspaceId } from "../../api/src/platform/audit/audit-event.ts";
import { CLOSED_DAYS, TIME_ZONE, writeSetting } from "../../api/src/platform/settings.ts";
import { recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j37", Number(process.argv[3] ?? 4437)];
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-37", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/xr_studio_${NAME}`, options: "-c TimeZone=UTC" }) });
const ZONE = "America/Toronto", MIN = 60_000;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pad = (n: number) => String(n).padStart(2, "0");

type Mail = { subject: string; body: string; sent_at: string | null };
/** The inbox's answer and its mails, oldest first (a refused or failed read is status 0 or the HTTP status, no mails). */
async function inboxRead(address: string): Promise<{ status: number; mails: Mail[] }> {
  try {
    const r = await fetch(`${BASE}/api/demo/platform-inbox?address=${encodeURIComponent(address)}`);
    return { status: r.status, mails: r.status === 200 ? ((await r.json()) as { messages: Mail[] }).messages.reverse() : [] };
  } catch { return { status: 0, mails: [] }; }
}
const inboxNow = async (address: string) => (await inboxRead(address)).mails;
/** The demo inbox (stand-in SI-20: it has no screen) until `want` mails are there or `ms` pass; then what arrived. */
async function inbox(address: string, want: number, ms = 90_000): Promise<Mail[]> {
  const t = Date.now();
  let got = await inboxNow(address);
  while (got.length < want && Date.now() - t < ms) { await pause(2_000); got = await inboxNow(address); }
  return got;
}
/** A failing line shows the mail, never the booker's token. */
const seen = (m?: Mail) => (m ? `${m.subject} | ${m.body}` : "none").replace(/#\S+/g, "#<token>").slice(0, 300);
/** The page's own words for a moment in the zone (en-GB, as the page writes them): "Thursday 19 November". */
const dayOf = (t: number) => new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, weekday: "long", day: "numeric", month: "long" }).format(t).replace(",", "");
const clockOf = (t: number) => new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t);
const monthOf = (t: number) => new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, month: "long", year: "numeric" }).format(t);
const slotName = (t: number) => `${dayOf(t)}, ${clockOf(t)} ${ZONE} time`;

// ------------------------------------------------------------------------------------------------ setup (Sample)
const run = Date.now().toString(36), key = `j37-${run}`;
const firm = await db.platformFirm.create({ data: { key, operatingName: "Sample J-37 firm", countryCode: "CA", status: "ACTIVE", contactEmail: `office-${run}@j37-firm.example` } });
const ws = await platformAuditWorkspaceId(db);
await writeSetting(db, { firmId: firm.id, key: TIME_ZONE.key, value: ZONE, by: "seed:J-37-test", workspaceId: ws, reason: "J-37: the firm's zone, stated" });
await writeSetting(db, { firmId: firm.id, key: CLOSED_DAYS.key, value: [], by: "seed:J-37-test", workspaceId: ws, reason: "J-37: no closed day, stated" });
const host = await db.platformStaff.create({ data: { firmId: firm.id, email: `host-${run}@j37-firm.example`, displayName: "Sample host", status: "ACTIVE" } });
await db.foAvailability.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ firmId: firm.id, staffId: host.id, weekday, startMinute: 0, endMinute: 1440, timeZone: ZONE })) });
await db.foConsultationType.create({ data: { firmId: firm.id, slug: "free", name: "Free consultation", modes: ["VIDEO"], hostStaffIds: [host.id], minutes: 5,
  minNoticeMinutes: 60, slotIntervalMinutes: 5, selfServiceLimitMinutes: 30 } });
const aEmail = `booker-a-${run}@j37-client.example`, bEmail = `booker-b-${run}@j37-client.example`;
console.log(`setup (not through the product: no firm, staff, hours or type screens in this walk): firm ${key} in ${ZONE}, one host on every hour, type "free" (60 min notice, every 5 min)`);

const launch = () => chromium.launch({ headless: !HEADED, slowMo: HEADED ? 150 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const browsers: Browser[] = [await launch(), await launch()];   // two people, two browsers
const pageIn = async (b: Browser) => (await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: ZONE, locale: "en-GB", colorScheme: "light", reducedMotion: "reduce" })).newPage();
const [pa, pb] = [await pageIn(browsers[0]), await pageIn(browsers[1])];
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}-1440.png`), fullPage: true });
const axe = async (p: Page, where: string) => { const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze(); ok(`J-37 ${where}: axe finds no WCAG A/AA violation`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes.length}`)); };
/** A person opens the firm's page, chooses the consultation, and goes to the day of `t` (paging months as needed). */
async function openDay(p: Page, t: number) {
  await p.goto(`${BASE}/book/${key}`);
  await p.locator("[data-type-card]").first().waitFor({ timeout: 30_000 });
  await p.getByRole("link", { name: "Choose Free consultation" }).click();
  await p.getByRole("heading", { name: "Choose a time" }).waitFor();
  const heading = p.locator("h2[aria-live]");
  for (let i = 0; i < 2 && (await heading.innerText()) !== monthOf(t); i++) { const before = await heading.innerText(); await p.getByRole("button", { name: "Next month" }).click(); await heading.filter({ hasNotText: before }).waitFor(); }
  await p.locator("[data-loading]").waitFor({ state: "detached" });
  await p.getByRole("button", { name: dayOf(t), exact: true }).click();
  await p.locator("[data-day-times] h3", { hasText: dayOf(t) }).waitFor();
}
async function fillAndBook(p: Page, given: string, email: string) {
  await p.getByRole("heading", { name: "Your details" }).waitFor();
  await p.getByLabel("Given names").fill(given); await p.getByLabel("Family name").fill("Sample"); await p.getByLabel("Email").fill(email);
  await p.getByRole("button", { name: "Book this time" }).click();   // the form waits out its own minimum fill time
  await p.locator('[data-public-state="booked"], [data-summary]').first().waitFor({ timeout: 30_000 });
}

try {
  // ---------------------------------------------------------------------------------------------- W1: the page lists times
  // The time both people aim at: the first 5-minute mark at least 66 minutes ahead (its 1 h reminder is then 6-11
  // minutes away, after the restart below), or the next one the page offers.
  const aim = Math.ceil((Date.now() + 66 * MIN) / (5 * MIN)) * 5 * MIN;
  await openDay(pa, aim);
  await shot(pa, "W1-times"); await axe(pa, "W1 the times");
  let at = 0;
  for (let t = aim; t <= aim + 20 * MIN && !at; t += 5 * MIN) if (dayOf(t) === dayOf(aim) && (await pa.getByRole("button", { name: slotName(t), exact: true }).count()) === 1) at = t;
  const offered = await pa.locator("[data-day-times] li button").count();
  ok(`J-37 W1: the public page lists the day's free times, among them ${at ? slotName(at) : "a time 66-86 minutes ahead"}`, at > 0 && offered > 1, { offered, aim: slotName(aim) });
  if (!at) throw new Error("no time about an hour ahead is offered: the walk cannot go on");
  const name = slotName(at), due = at - 60 * MIN;
  console.log(`NOTE  the time walked: ${new Date(at).toISOString()} (${name}); its 1 h reminder is due ${new Date(due).toISOString()}`);

  // ---------------------------------------------------------------------------------------------- W2, W3: two browsers, one time
  await openDay(pb, at);
  ok(`J-37 W3: booker B, in a second browser, has the same time open (${name})`, (await pb.getByRole("button", { name, exact: true }).count()) === 1);
  await pa.getByRole("button", { name, exact: true }).click(); await pb.getByRole("button", { name, exact: true }).click();
  await fillAndBook(pa, "Ana", aEmail);
  const aDone = await pa.locator("main").innerText();
  await shot(pa, "W2-booked"); await axe(pa, "W2 the confirmation");
  ok(`J-37 W2: booker A books it: "You are booked" for ${name}`, aDone.includes("You are booked") && aDone.includes(name), aDone.slice(0, 200));
  await fillAndBook(pb, "Ben", bEmail);
  const refusal = pb.locator("[data-summary]");
  const bText = (await refusal.count()) ? await refusal.innerText() : await pb.locator("main").innerText();
  const next = (await refusal.count()) ? await refusal.getByRole("button").allInnerTexts() : [];
  await shot(pb, "W3-refused"); await axe(pb, "W3 the refusal");
  ok('J-37 W3: booker B is refused on the page: "This time was just booked." and "Please choose another time."', (await pb.locator('[data-public-state="booked"]').count()) === 0 && bText.includes("This time was just booked.") && bText.includes("Please choose another time."), bText.slice(0, 200));
  ok("J-37 W3: B is offered the next free times, none of them A's time", bText.includes("Next free times") && next.length > 0 && !next.includes(name), next);
  const rows = await db.foBooking.findMany({ where: { firmId: firm.id }, select: { id: true, startsAt: true, personId: true, sequence: true } });
  ok("J-37 W3: underneath, one booking at that time, A's; none for B", rows.length === 1 && rows[0].startsAt.getTime() === at, rows.map((r) => r.startsAt));
  const booking = rows[0];

  // ---------------------------------------------------------------------------------------------- W4, DW1, DW2: the confirmation
  const aMails = await inbox(aEmail, 1);
  ok("J-37 W4: A's confirmation arrives in the demo inbox, for that time", aMails.length === 1 && /is booked/.test(aMails[0].subject) && aMails[0].body.includes(`(${ZONE})`), seen(aMails[0]));
  // A delivered mail is SENT or DELIVERED: since PF-19b part 3 (#2397) the local adapter's Delivery test event moves the row
  // SENT -> DELIVERED a moment after it is sent (local.ts, bounces.ts), so either is right; QUEUED, FAILED or BOUNCED never is (QA-570).
  const delivered = (s: string) => s === "SENT" || s === "DELIVERED";
  const out = await db.msgOutbox.findMany({ where: { firmId: firm.id, address: aEmail }, select: { state: true, providerId: true, idempotencyKey: true } });
  ok("J-37 DW1: A's confirmation is an outbox row SENT or DELIVERED by the local adapter (the in-memory fake wrote none)", out.length === 1 && delivered(out[0].state) && !!out[0].providerId?.startsWith("local:") && out[0].idempotencyKey === `mail:booking:${booking?.id}:${booking?.sequence}:mail-person`, out);
  const person = booking?.personId ? await db.foPerson.findFirst({ where: { firmId: firm.id, id: booking.personId }, select: { email: true, givenNames: true } }) : null;
  ok("J-37 DW2: A is a person in the database (FO-2's arrival; the fake kept people in memory only)", person?.email === aEmail && person?.givenNames === "Ana", person);
  const jobs = await db.$queryRawUnsafe<{ key: string; state: string }[]>(`select data->>'key' as key, state from platform_jobs.job where name = 'booking.reminder' and data->>'key' like $1`, `booking:${booking?.id}:%`);
  ok("J-37 W4b: before the restart, A's 1 h reminder waits in the job table (the 24 h one is already past, so none)", jobs.length === 1 && jobs[0].key.endsWith("reminder-1h") && jobs[0].state === "created", jobs);

  // ---------------------------------------------------------------------------------------------- W4b: restart, then the reminder
  execFileSync("zsh", [join(STUDIO, "tools", "isolated.sh"), NAME, String(PORT), "restart"], { stdio: ["ignore", "ignore", "inherit"] });
  let ready = 0;
  for (let i = 0; i < 90 && ready !== 200; i++) { try { ready = (await fetch(`${BASE}/api/health/ready`)).status; } catch { /* starting */ } if (ready !== 200) await pause(1_000); }
  ok("J-37 W4b: the API restarted and is ready, before the reminder is due", ready === 200 && Date.now() < due, { ready, msLeft: due - Date.now() });
  const early = await inboxNow(aEmail);
  ok("J-37 W4b: no reminder before its due time", Date.now() < due && early.every((m) => !/^Reminder/.test(m.subject)), early.map((m) => m.subject));
  const after = await inbox(aEmail, 2, due - Date.now() + 3 * MIN);
  const reminder = after.find((m) => /^Reminder: your Free consultation in one hour/.test(m.subject));
  const arrived = reminder?.sent_at ? Date.parse(reminder.sent_at) : 0;
  ok(`J-37 W4b / DW2: after the restart A's 1 h reminder arrives in the demo inbox at its due time (${clockOf(due)}), naming the time`, !!reminder && arrived >= due && arrived < due + 3 * MIN && reminder.body.includes("Hello Ana") && reminder.body.includes(`(${ZONE})`),
    { got: after.map((m) => [m.subject, m.sent_at]), due: new Date(due).toISOString() });
  const remOut = await db.msgOutbox.count({ where: { firmId: firm.id, address: aEmail, state: { in: ["SENT", "DELIVERED"] }, idempotencyKey: { startsWith: `mail:booking:${booking?.id}:` }, AND: { idempotencyKey: { endsWith: ":reminder-1h" } } } });
  ok("J-37 W4b: the reminder ran once (one outbox row)", remOut === 1, remOut);
  // Read after the wait, when any mail for B would long have arrived; the inbox must answer (review m1).
  const bBox = await inboxRead(bEmail);
  ok("J-37 W3: B got no mail at all (nothing was booked for B), the inbox answering 200", bBox.status === 200 && bBox.mails.length === 0, { status: bBox.status, subjects: bBox.mails.map((m) => m.subject) });

  // ---------------------------------------------------------------------------------------------- W5: row 42's first step
  const link = /To reschedule or cancel: (\S+)/.exec(aMails[0]?.body ?? "")?.[1] ?? "";
  ok("J-37 W5: A's confirmation carries A's manage link, on this copy", link.startsWith(`${BASE}/book/${key}/manage#`) && link.length > `${BASE}/book/${key}/manage#`.length + 20, link.replace(/#.*/, "#<token>"));
  const mine = await pa.context().newPage();
  await mine.goto(link.startsWith(BASE) ? link : `${BASE}/book/${key}/manage`);
  await mine.locator("[data-public-state]").first().waitFor({ timeout: 30_000 });
  const state = await mine.locator("[data-public-state]").first().getAttribute("data-public-state");
  const when = state === "manage" ? await mine.locator("[data-when]").innerText() : "";
  await shot(mine, "W5-manage"); await axe(mine, "W5 A's own page");
  ok(`J-37 W5: the link opens A's own page for this booking (${name}), which offers Reschedule: row 42's first step`, state === "manage" && when.includes(name) && (await mine.getByRole("button", { name: "Reschedule" }).count()) === 1, { state, when });
} finally {
  for (const b of browsers) await b.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
