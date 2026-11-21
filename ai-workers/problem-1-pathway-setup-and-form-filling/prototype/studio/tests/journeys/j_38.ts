// J-38 (map rows 38 + 40, R1.38 time zones and R1.40 calendar invite files): the join-and-walk row (rows rev 16.11 (b),
// brief lead-b-briefs/J-rows.md §J-38). It adds no feature: it walks FO-3w's public booking page (parts 1 and 2 on main)
// and reads the mails in the demo inbox, on an isolated copy of the running app (its own database and port, never :4400).
//   DW1: booking's mail port is the real one (PF-19b part 1 did the swap; J-37 shares it): both mails are msg_outbox rows
//        SENT, or DELIVERED once the local Delivery test event lands (#2397, QA-570), by the local adapter and are read
//        back from the running app's demo inbox. Fails on the fake: fakeMail kept
//        mail in the API's memory, wrote no outbox row and gave the inbox nothing, so DW1 and W2..W5 would all fail.
//   W1: a booker whose browser is in Asia/Dubai books 10:00 Toronto time on the public page, by screens at 1440 px;
//   W2: the booker's mail states the time in the booker's zone: 7:00 p.m. (Asia/Dubai);
//   W3: the host's mail states the same moment in the firm's zone: 10:00 a.m. (America/Toronto);
//   W4: the .ics (in both mails and behind "Add to calendar") is read as a calendar reads it and starts at that instant
//       in UTC, for 30 minutes, one UID;
//   W5: ends at row 42's first step: the reschedule link in the booker's mail opens the booker's own page for it.
//   W7 (J-38r, QA-522): staff move the booking an hour later; both demo inboxes get a METHOD:REQUEST invite with the same
//       UID, a higher SEQUENCE and the new time in UTC, and the mails name the new time in each one's zone;
//   W8 (J-38r, QA-522): staff cancel it; both inboxes get a METHOD:CANCEL invite, STATUS:CANCELLED, the same UID and a
//       higher SEQUENCE again. (W6 is #2326's staff time-zone step for R1.38.)
// W7 and W8 go through the staff API (POST /api/front-office/bookings/:id/reschedule and /cancel), signed in by the
// local sign-in stand-in, because no staff booking screen is on main yet. The demo inbox has no screen either (stand-in
// SI-20): the host's W7 and W8 judgments read the host's inbox in the browser (its address opened in the page); the page
// then shows each mail's subject and invite for the screenshot. The picture leaves headers and links out; the walk's
// trace still holds the raw answer, with the unsubscribe link's token (Sample address, a copy dropped at stop), as W5's
// trace holds the booker's link.
// The day is the first one the page offers 10:00 Toronto on, at least 26 hours ahead, so the test never goes stale. In
// Toronto's winter (EST, UTC-5) that is 15:00 UTC and 7:00 p.m. in Dubai, as the brief words it; in summer (EDT, UTC-4)
// it is 14:00 UTC and 6:00 p.m. What is expected is worked out here with plain UTC sums (Dubai is UTC+4 all year), never
// with the product's own functions.
//   W6 (R1.38's staff zone, FO-3st1): the host, signed in from a browser in Europe/London, sees the booking at 10:00 in
//       the office zone on the staff calendar and in its detail, beside the booker's 19:00 (Asia/Dubai).
//   W9 (R1.38 "across a daylight-saving change", QA-616): the next Toronto clock change is found from today's clock (so the
//       walk never goes stale), and a booker in Asia/Dubai books, by screens, 10:00 Toronto on the last open day before it
//       and the first open day after it (15:00Z and 14:00Z in March; 14:00Z and 15:00Z in November). Each is stored at its
//       own instant; the host, in a Europe/London browser, sees both in the 10:00 row of the staff calendar in the office
//       zone, and their details read 10:00–10:30 America/Toronto beside the booker's hour; both mails name each one's own
//       zone (10:00 a.m. America/Toronto for the host, the right p.m. hour in Asia/Dubai for the booker), and both invites
//       start at the right UTC instant. The type's booking window is 250 days so the next change is always bookable.
// Setup a person cannot do through the product yet (the firm, its host, hours and consultation type) is written straight
// to the copy's database (Sample rows). Sample values only; US$0, no model call.
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j38 4438 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j38 4438 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_38.ts j38 4438
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { copyFirmHoursTo } from "../../api/src/front-office/booking-seed.ts";
import { platformAuditWorkspaceId } from "../../api/src/platform/audit/audit-event.ts";
import { TIME_ZONE, writeSetting } from "../../api/src/platform/settings.ts";
import { recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j38", Number(process.argv[3] ?? 4438)];
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-38", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/xr_studio_${NAME}`, options: "-c TimeZone=UTC" }) });
const BOOKER_ZONE = "Asia/Dubai", FIRM_ZONE = "America/Toronto", MIN = 60_000, HOUR = 60 * MIN;

type Mail = { subject: string; body: string; attachments: { filename: string; content_type: string; text: string | null }[] };
/** The running app's demo inbox for one address (stand-in SI-20: it has no screen), oldest first; waits for `want` mails. */
async function inbox(address: string, want: number): Promise<Mail[]> {
  let got: Mail[] = [];
  for (let i = 0; i < 90 && got.length < want; i++) {
    if (i) await new Promise((r) => setTimeout(r, 1_000));
    const r = await fetch(`${BASE}/api/demo/platform-inbox?address=${encodeURIComponent(address)}`);
    got = r.status === 200 ? ((await r.json()) as { messages: Mail[] }).messages.reverse() : [];
  }
  return got;   // fewer than wanted after 90 s: the caller's line fails and shows what arrived
}
/** Narrow and no-break spaces (en-CA writes "7:00 p.m." with one) read as plain spaces. */
const plain = (s: string) => s.replace(/[   ]/g, " ");
const pad = (n: number) => String(n).padStart(2, "0");
/** "7:00 p.m." from a 24-hour clock, as Canadian English mail writes it. */
const clock12 = (h: number, m: number) => `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "a.m." : "p.m."}`;

/** An invite as a calendar reads it (RFC 5545): folded lines joined, the one event's properties, UTC date-times as instants. */
function readInvite(text: string) {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/).filter(Boolean);
  const from = lines.indexOf("BEGIN:VEVENT"), to = lines.indexOf("END:VEVENT");
  const event = new Map(lines.slice(from + 1, to < 0 ? undefined : to).map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1)] as const));
  // Only the UTC form ("20270312T150000Z") is an instant by itself; a local or TZID form is not read here (null).
  const instant = (v?: string) => { const m = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/.exec(v ?? ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null; };
  return {
    calendars: lines.filter((l) => l === "BEGIN:VCALENDAR").length, events: lines.filter((l) => l === "BEGIN:VEVENT").length,
    method: lines.slice(0, Math.max(from, 0)).find((l) => l.startsWith("METHOD:"))?.slice(7) ?? null,
    uid: event.get("UID") ?? null, start: instant(event.get("DTSTART")), end: instant(event.get("DTEND")), rawStart: lines.find((l) => l.startsWith("DTSTART")) ?? null,
  };
}

// ------------------------------------------------------------------------------------------------ setup (Sample)
const run = Date.now().toString(36), key = `j38-${run}`;
const firm = await db.platformFirm.create({ data: { key, operatingName: "Sample J-38 firm", countryCode: "CA", status: "ACTIVE", contactEmail: `office-${run}@j38-firm.example` } });
await writeSetting(db, { firmId: firm.id, key: TIME_ZONE.key, value: FIRM_ZONE, by: "seed:J-38-test", workspaceId: await platformAuditWorkspaceId(db), reason: "J-38: the firm's zone, stated" });
const hostEmail = `host-${run}@j38-firm.example`, bookerEmail = `booker-${run}@j38-client.example`;
const host = await db.platformStaff.create({ data: { firmId: firm.id, email: hostEmail, displayName: "Sample host", status: "ACTIVE" } });
await copyFirmHoursTo(db, firm.id, [host.id]);
// W6 signs the host in (PF-4's local stand-in, PLATFORM_IDENTITY=local on the copy) as a Case Officer (a seeded role).
await db.platformRoleGrant.create({ data: { firmId: firm.id, staffId: host.id, role: "CASE_OFFICER", grantedBy: "seed:J-38-test" } });
await db.platformRoleGrant.create({ data: { firmId: firm.id, staffId: host.id, role: "OWNER", grantedBy: "seed:J-38-test" } });   // W7, W8: staff who may move and cancel
await db.foConsultationType.create({ data: { firmId: firm.id, slug: "free", name: "Free consultation", modes: ["VIDEO"], hostStaffIds: [host.id], minutes: 30, windowDays: 250 } });   // W9: the next clock change is at most ~240 days away
console.log(`setup (not through the product: no firm, staff, hours or type screens in this walk): firm ${key} in ${FIRM_ZONE}, one host, type "free"`);

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: BOOKER_ZONE, locale: "en-GB", colorScheme: "light", reducedMotion: "reduce" });
const p = await ctx.newPage();
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}-1440.png`), fullPage: true });
const axe = async (page: Page, where: string) => { const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze(); ok(`J-38 ${where}: axe finds no WCAG A/AA violation`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes.length}`)); };

try {
  // ---------------------------------------------------------------------------------------------- W1: the booking
  await p.goto(`${BASE}/book/${key}`);
  await p.locator("[data-type-card]").first().waitFor({ timeout: 30_000 });
  await shot(p, "W1-1-list"); await axe(p, "W1 the firm's booking page");
  await p.getByRole("link", { name: "Choose Free consultation" }).click();
  await p.getByRole("heading", { name: "Choose a time" }).waitFor();
  const zoneLine = await p.locator("[data-zone-line]").innerText();
  ok("J-38 W1: the page says the times are in the booker's zone (Asia/Dubai)", zoneLine.includes(BOOKER_ZONE), zoneLine);

  // The first day the page offers 10:00 Toronto time on, at least 26 hours ahead, found as a person does: each open day
  // of the month shown, then "Next month". Which UTC hour is 10:00 in Toronto on a day is read with Intl here (never the
  // product's code) and checked with plain sums below.
  const torontoClock = new Intl.DateTimeFormat("en-GB", { timeZone: FIRM_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const monthHeading = p.locator("h2[aria-live]"), dayTimes = (d: string) => p.locator("[data-day-times] h3", { hasText: d });
  let at = 0;
  for (let turn = 0; turn < 3 && !at; turn++) {
    if (turn) { const before = await monthHeading.innerText(); await p.getByRole("button", { name: "Next month" }).click(); await monthHeading.filter({ hasNotText: before }).waitFor(); }
    await p.locator("[data-loading]").waitFor({ state: "detached" });
    const shown = await monthHeading.innerText();   // "March 2027"
    for (const label of await p.getByRole("group", { name: shown }).locator("button:not([disabled])").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label") ?? ""))) {
      const noon = Date.parse(`${label.split(" ")[1]} ${shown} 12:00 UTC`);   // "Friday 12 March" in "March 2027"
      const t = [14, 15].map((h) => noon + (h - 12) * HOUR).find((x) => torontoClock.format(x) === "10:00") ?? 0;
      if (t < Date.now() + 26 * HOUR) continue;
      await p.getByRole("button", { name: label, exact: true }).click();
      await dayTimes(label).waitFor();   // the day's own times are drawn before they are read
      if (await p.getByRole("button", { name: `${label}, ${pad(new Date(t).getUTCHours() + 4)}:00 ${BOOKER_ZONE} time`, exact: true }).count()) { at = t; break; }
    }
  }
  const start = new Date(at), utcHour = start.getUTCHours();
  // 10:00 in Toronto is 15:00 UTC on standard time (UTC-5) and 14:00 UTC on daylight time (UTC-4); Dubai is UTC+4.
  ok("J-38 W1: the page's times include 10:00 Toronto time on a coming day (15:00 UTC in winter, 14:00 UTC in summer)", at > 0 && (utcHour === 15 || utcHour === 14) && start.getUTCMinutes() === 0, at ? start.toISOString() : "none in three months");
  if (!at) throw new Error("no 10:00 Toronto time is offered: the walk cannot go on");
  const dubaiHour = utcHour + 4, season = utcHour === 15 ? "EST" : "EDT";
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(start).replace(",", "");   // "Friday 12 March": Dubai's day is the UTC day at 14:00 or 15:00
  const slotName = `${day}, ${pad(dubaiHour)}:00 ${BOOKER_ZONE} time`;
  const mailDay = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", dateStyle: "full" }).format(start);   // "Friday, March 12, 2027"
  const bookerTime = `${clock12(dubaiHour, 0)} (${BOOKER_ZONE})`, hostTime = `10:00 a.m. (${FIRM_ZONE})`;
  console.log(`NOTE  the moment walked: ${start.toISOString()} = 10:00 Toronto (${season}) = ${pad(dubaiHour)}:00 Dubai, ${mailDay}`);

  await p.getByRole("button", { name: day, exact: true }).click();
  await dayTimes(day).waitFor();
  const slot = p.getByRole("button", { name: slotName, exact: true });
  ok(`J-38 W1: "${slotName}" is offered (10:00 Toronto, shown in the booker's zone)`, (await slot.count()) === 1, await p.locator("[data-day-times] li button").allInnerTexts());
  await shot(p, "W1-2-times"); await axe(p, "W1 the times");
  await slot.click();
  await p.getByRole("heading", { name: "Your details" }).waitFor();
  await p.getByLabel("Given names").fill("Ana"); await p.getByLabel("Family name").fill("Sample"); await p.getByLabel("Email").fill(bookerEmail);
  await shot(p, "W1-3-details"); await axe(p, "W1 the details form");
  await p.waitForTimeout(3_500);   // the form refuses a booking sent sooner than a person can fill it
  await p.getByRole("button", { name: "Book this time" }).click();
  await p.locator('[data-public-state="booked"], [data-summary]').first().waitFor({ timeout: 20_000 });
  const done = await p.locator("main").innerText();
  await shot(p, "W1-4-booked"); await axe(p, "W1 the confirmation");
  ok(`J-38 W1: the page says "You are booked" for ${slotName}`, done.includes("You are booked") && done.includes(slotName), done.slice(0, 300));
  const row = await db.foBooking.findFirst({ where: { firmId: firm.id }, orderBy: { createdAt: "desc" } });
  ok("J-38 W1: underneath, one booking at that instant, with the booker's zone kept", (await db.foBooking.count({ where: { firmId: firm.id } })) === 1 && row?.startsAt.getTime() === at && row?.bookerTimeZone === BOOKER_ZONE && row?.staffId === host.id, [row?.startsAt, row?.bookerTimeZone]);

  // ---------------------------------------------------------------------------------------------- DW1: the mail port
  const [bookerMails, hostMails] = [await inbox(bookerEmail, 1), await inbox(hostEmail, 1)];
  const sent = await db.msgOutbox.findMany({ where: { firmId: firm.id, channel: "EMAIL" }, select: { address: true, state: true, providerId: true, idempotencyKey: true } });
  // A delivered mail is SENT or DELIVERED: since PF-19b part 3 (#2397) the local adapter's Delivery test event moves the row
  // SENT -> DELIVERED a moment after it is sent (local.ts, bounces.ts), so either is right; QUEUED, FAILED or BOUNCED never is (QA-570).
  const delivered = (s: string) => s === "SENT" || s === "DELIVERED";
  const sentTo = (address: string, who: string) => sent.filter((o) => o.address === address && delivered(o.state) && o.providerId?.startsWith("local:") && o.idempotencyKey === `mail:booking:${row?.id}:${row?.sequence}:mail-${who}`).length;
  ok("J-38 DW1: booking's mail is the real sending path: one outbox row each for the booker and the host, sent by the local adapter (SENT or DELIVERED), both in the app's demo inbox (the in-memory fake wrote neither)",
    sent.length === 2 && sentTo(bookerEmail, "person") === 1 && sentTo(hostEmail, "host") === 1 && bookerMails.length === 1 && hostMails.length === 1, { outbox: sent.map((o) => [o.address, o.state, o.idempotencyKey?.replace(row?.id ?? "-", "<booking>")]), inbox: [bookerMails.length, hostMails.length] });
  const bookerMail = bookerMails[0], hostMail = hostMails[0];
  const seen = (t: string) => t.replace(/#\S+/g, "#<token>").slice(0, 260);   // a failing line shows the mail, never the booker's token
  const bookerText = plain(`${bookerMail?.subject}\n${bookerMail?.body}`), hostText = plain(`${hostMail?.subject}\n${hostMail?.body}`);

  // ---------------------------------------------------------------------------------------------- W2, W3: the two mails
  ok(`J-38 W2: the booker's mail reads "${mailDay} at ${bookerTime}"`, bookerText.includes(`${mailDay} at ${bookerTime}`), seen(bookerText));
  ok("J-38 W2: the booker's mail states no other zone's time (the firm's zone is not in it)", !!bookerMail && !bookerText.includes(FIRM_ZONE) && !/10:00 a\.m\./.test(bookerText), seen(bookerText));
  ok(`J-38 W3: the host's mail reads "${mailDay} at ${hostTime}", in its subject and its text`, plain(hostMail?.subject ?? "").includes(`${mailDay} at ${hostTime}`) && plain(hostMail?.body ?? "").includes(`${mailDay} at ${hostTime}`), hostText.slice(0, 260));
  ok("J-38 W3: the host's mail states no other zone's time (the booker's zone is not in it)", !!hostMail && !hostText.includes(BOOKER_ZONE) && !hostText.includes(clock12(dubaiHour, 0)), hostText.slice(0, 260));

  // ---------------------------------------------------------------------------------------------- W6: the staff zone (R1.38)
  // The host opens the staff calendar (FO-3st1) from a browser in a third zone, Europe/London, so a time shown in the
  // browser's zone would read 15:00 (or 14:00 in summer) and fail: the screen shows the office zone and names it.
  const staffSignIn = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: key, email: hostEmail, secondStep: true }) });
  if (!staffSignIn.ok) throw new Error(`W6: the host's sign-in was refused (${staffSignIn.status}): start the copy with PLATFORM_IDENTITY=local, as the header's line does`);
  const { token: staffToken } = await staffSignIn.json() as { token: string };
  const staffCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Europe/London", locale: "en-GB", colorScheme: "light", reducedMotion: "reduce" });
  await staffCtx.addInitScript((t) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })), staffToken);
  const sp = await staffCtx.newPage();
  const torontoDay = new Intl.DateTimeFormat("en-CA", { timeZone: FIRM_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(start);
  await sp.goto(`${BASE}/front-office/bookings?view=week&whose=mine&date=${torontoDay}`);
  await sp.locator("[data-grid]").waitFor({ timeout: 30_000 });
  const zoneSaid = await sp.locator("[data-zone-line]").innerText();
  const inTen = await sp.locator(`[data-cell="${torontoDay}T10"] [data-block="${row?.id}"]`).count();
  await shot(sp, "W6-1-staff-week"); await axe(sp, "W6 the host's week");
  ok(`J-38 W6: the host's calendar names the office zone (${FIRM_ZONE}) and shows the booking in the 10:00 row of ${torontoDay}`, staffSignIn.ok && zoneSaid.includes(FIRM_ZONE) && inTen === 1, { status: staffSignIn.status, zoneSaid, inTen });
  await sp.locator(`[data-block="${row?.id}"]`).click();
  await sp.locator("[data-booking-detail]").waitFor({ timeout: 20_000 });
  const whenSaid = await sp.locator("[data-when]").innerText();
  await shot(sp, "W6-2-staff-detail"); await axe(sp, "W6 the booking's detail");
  ok(`J-38 W6: the detail reads 10:00–10:30 ${FIRM_ZONE} and ${pad(dubaiHour)}:00 for the booker (${BOOKER_ZONE}), the same moment as both mails`,
    whenSaid.includes(`10:00–10:30 ${FIRM_ZONE}`) && whenSaid.includes(`${pad(dubaiHour)}:00 for Ana Sample (${BOOKER_ZONE})`), whenSaid);
  // London's own hour for that moment, from its own offset (the weeks when only one of the two countries has changed
  // its clocks included; review m2).
  const londonHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(start));
  ok("J-38 W6: the staff screen states no time in the browser's own zone (Europe/London)", !whenSaid.includes("Europe/London") && !whenSaid.includes(`${pad(londonHour)}:00`) && !zoneSaid.includes("Europe/London"), { whenSaid, londonHour });
  await staffCtx.close();

  // ---------------------------------------------------------------------------------------------- W4: the .ics
  const attached = (m?: Mail) => m?.attachments.find((a) => /\.ics$/.test(a.filename));
  // "Add to calendar" pressed as a person presses it: the browser saves the file (a download has no content type to read,
  // so its name stands in for it).
  const [saved] = await Promise.all([p.waitForEvent("download", { timeout: 20_000 }), p.getByRole("link", { name: "Add to calendar" }).click()]);
  const savedAs = saved.suggestedFilename();
  const files = [
    { from: "the booker's mail", type: attached(bookerMail)?.content_type ?? "", text: attached(bookerMail)?.text ?? "" },
    { from: "the host's mail", type: attached(hostMail)?.content_type ?? "", text: attached(hostMail)?.text ?? "" },
    { from: '"Add to calendar" on the confirmation', type: /\.ics$/.test(savedAs) ? "text/calendar (by its name)" : `named ${savedAs}`, text: readFileSync(await saved.path(), "utf8") },
  ];
  const uid = `${row?.id}@booking.expatready.com`;
  for (const f of files) {
    const i = readInvite(f.text);
    ok(`J-38 W4: the .ics from ${f.from} is one calendar event starting at ${start.toISOString()} (UTC) for 30 minutes, a REQUEST with the booking's UID`,
      /^text\/calendar/.test(f.type) && i.calendars === 1 && i.events === 1 && i.start === at && i.end === at + 30 * MIN && i.method === "REQUEST" && i.uid === uid, { type: f.type, ...i, start: i.start && new Date(i.start).toISOString(), end: i.end && new Date(i.end).toISOString() });
  }
  const noStamp = (t: string) => t.replace(/\r?\nDTSTAMP:[^\r\n]*/g, "").replace(/\r\n/g, "\n").trim();
  ok('J-38 W4: the booker\'s mailed invite is the invite "Add to calendar" gives (the writing stamp aside)', files[0].text.length > 0 && noStamp(files[0].text) === noStamp(files[2].text), [files[0].text.length, files[2].text.length]);

  // ---------------------------------------------------------------------------------------------- W5: row 42's first step
  const link = /To reschedule or cancel: (\S+)/.exec(bookerMail?.body ?? "")?.[1] ?? "";
  const linkAt = link.replace(/#.*/, "#<token>");   // the token is never printed by this file (the walk's browser trace holds the pages' own requests)
  ok("J-38 W5: the booker's mail carries the reschedule link, to this copy's own page for the booker", link.startsWith(`${BASE}/book/${key}/manage#`) && link.length > `${BASE}/book/${key}/manage#`.length + 20, linkAt);
  ok("J-38 W5: the host's mail carries no booker's link", !!hostMail && !/manage#|reschedule or cancel/i.test(hostText), hostText.slice(0, 200));
  const mine = await ctx.newPage();   // the link opened from the mail, in the booker's browser
  await mine.goto(link.startsWith(BASE) ? link : `${BASE}/book/${key}/manage`);
  await mine.locator("[data-public-state]").first().waitFor({ timeout: 30_000 });
  const state = await mine.locator("[data-public-state]").first().getAttribute("data-public-state");
  const when = state === "manage" ? await mine.locator("[data-when]").innerText() : "";
  await shot(mine, "W5-manage"); await axe(mine, "W5 the booker's own page");
  ok(`J-38 W5: the link opens the booker's own page for this booking (${slotName}) and it offers Reschedule: row 42's first step`, state === "manage" && when.includes(slotName) && (await mine.getByRole("button", { name: "Reschedule" }).count()) === 1, { state, when });

  // ---------------------------------------------------------------------------------------------- W7, W8: staff move, then cancel
  const signIn = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: key, email: hostEmail, secondStep: true }) });
  const token = signIn.status < 300 ? ((await signIn.json()) as { token?: string }).token ?? "" : "";
  ok("J-38 W7: a staff member of the firm signs in (local sign-in stand-in; the copy runs PLATFORM_IDENTITY=local)", token.length > 20, signIn.status);
  const staff = async (path: string, body?: unknown) => {
    const r = await fetch(`${BASE}/api/front-office/bookings/${row?.id}${path}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    return { status: r.status, body: await r.json().catch(() => null) as Record<string, unknown> | null };
  };
  /** The host's inbox opened in the browser (the inbox's own JSON answer; it has no screen), read there (oldest first) and
   *  shown as each mail's subject and invite for the screenshot. What the browser read is what is judged. */
  const inboxInBrowser = async (name: string, title: string): Promise<Mail[]> => {
    const p = await ctx.newPage();
    await p.goto(`${BASE}/api/demo/platform-inbox?address=${encodeURIComponent(hostEmail)}`);
    const mails = await p.evaluate((t) => {
      let list: { subject: string; body: string; attachments: { filename: string; content_type: string; text: string | null }[] }[] = [];
      try { list = (JSON.parse(document.body.innerText) as { messages: typeof list }).messages.slice().reverse(); } catch { /* shown as none */ }
      document.body.innerHTML = "";
      const h = document.createElement("h1"); h.textContent = t; h.style.font = "600 20px sans-serif"; document.body.append(h);
      for (const m of list) {
        const s = document.createElement("h2"); s.textContent = m.subject; s.style.font = "600 15px sans-serif"; document.body.append(s);
        const pre = document.createElement("pre"); pre.textContent = m.attachments.find((a) => a.filename.endsWith(".ics"))?.text ?? "(no invite)"; pre.style.font = "12px monospace"; document.body.append(pre);
      }
      return list.map((m) => ({ subject: m.subject, body: m.body, attachments: m.attachments.map((a) => ({ filename: a.filename, content_type: a.content_type, text: a.text })) }));
    }, title);
    await p.screenshot({ path: join(SHOTS, `${name}-1440.png`), fullPage: true });
    await p.close();
    return mails;
  };
  const icsAt = (m?: Mail) => readInvite(m?.attachments.find((a) => /\.ics$/.test(a.filename))?.text ?? "");
  const seqOf = (m?: Mail) => Number(/SEQUENCE:(\d+)/.exec(m?.attachments.find((a) => /\.ics$/.test(a.filename))?.text ?? "")?.[1] ?? -1);
  const statusOf = (m?: Mail) => /\r?\nSTATUS:([A-Z]+)/.exec(m?.attachments.find((a) => /\.ics$/.test(a.filename))?.text ?? "")?.[1] ?? null;

  // W7: staff move it an hour later (11:00 Toronto, a free time inside the host's hours).
  const moved = at + 60 * MIN, movedDubai = new Date(moved).getUTCHours() + 4;
  const mv = await staff("/reschedule", { startsAt: new Date(moved).toISOString() });
  const after7 = await db.foBooking.findUnique({ where: { id: row!.id }, select: { startsAt: true, sequence: true, status: true } });
  ok(`J-38 W7: staff move the booking to ${new Date(moved).toISOString()} (11:00 Toronto); underneath it is at the new time with a higher sequence`, mv.status === 200 && after7?.startsAt.getTime() === moved && (after7?.sequence ?? 0) > (row?.sequence ?? 0), { status: mv.status, after7 });
  const [b7, h7] = [await inbox(bookerEmail, 2), await inbox(hostEmail, 2)];   // both moved mails are in before the cancel (a mail whose booking changed again before it ran is dropped)
  const hb7 = await inboxInBrowser("W7-inbox-moved", "The host's demo inbox, read in the browser after the move");
  const movedTime = { booker: `${new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", dateStyle: "full" }).format(moved)} at ${clock12(movedDubai, 0)} (${BOOKER_ZONE})`, host: `${new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", dateStyle: "full" }).format(moved)} at 11:00 a.m. (${FIRM_ZONE})` };
  for (const [who, list] of [["booker", b7], ["host", hb7]] as const) {
    const [first, second] = [list[0], list[1]], i = icsAt(second);
    ok(`J-38 W7: the ${who}'s inbox gets the moved invite: METHOD:REQUEST, the same UID, a higher SEQUENCE, DTSTART at the new time in UTC`,
      list.length === 2 && i.method === "REQUEST" && i.uid === uid && i.events === 1 && seqOf(second) > seqOf(first) && seqOf(first) >= 0 && i.start === moved && i.end === moved + 30 * MIN,
      { mails: list.map((m) => m.subject), method: i.method, uid: i.uid === uid, seq: [seqOf(first), seqOf(second)], start: i.start && new Date(i.start).toISOString() });
    ok(`J-38 W7: the ${who}'s moved mail names the new time in its own zone ("${movedTime[who]}")`, plain(`${second?.subject}\n${second?.body}`).includes(movedTime[who]), plain(second?.subject ?? "").slice(0, 160));
  }
  const sameMails = (a: Mail[], b: Mail[]) => a.length === b.length && a.every((m, i) => m.subject === b[i].subject && m.attachments.find((x) => x.filename.endsWith(".ics"))?.text === b[i].attachments.find((x) => x.filename.endsWith(".ics"))?.text);
  ok("J-38 W7: the host's inbox read in the browser is the inbox's own answer (same subjects and invites as read by the API)", sameMails(hb7, h7), [hb7.map((m) => m.subject), h7.map((m) => m.subject)]);

  // W8: staff cancel it.
  const cx = await staff("/cancel");
  const after8 = await db.foBooking.findUnique({ where: { id: row!.id }, select: { status: true, sequence: true } });
  ok("J-38 W8: staff cancel the booking; underneath it is CANCELLED with a higher sequence again", cx.status === 200 && after8?.status === "CANCELLED" && (after8?.sequence ?? 0) > (after7?.sequence ?? 0), { status: cx.status, after8 });
  const b8 = await inbox(bookerEmail, 3);
  const h8 = await inbox(hostEmail, 3);
  const hb8 = await inboxInBrowser("W8-inbox-cancelled", "The host's demo inbox, read in the browser after the cancel");
  ok("J-38 W8: the host's inbox read in the browser is the inbox's own answer (same subjects and invites as read by the API)", sameMails(hb8, h8), [hb8.map((m) => m.subject), h8.map((m) => m.subject)]);
  for (const [who, list] of [["booker", b8], ["host", hb8]] as const) {
    const [prev, last] = [list[1], list[2]], i = icsAt(last);
    ok(`J-38 W8: the ${who}'s inbox gets the cancel invite: METHOD:CANCEL, STATUS:CANCELLED, the same UID, a higher SEQUENCE than the move's`,
      list.length === 3 && i.method === "CANCEL" && statusOf(last) === "CANCELLED" && i.uid === uid && i.events === 1 && seqOf(last) > seqOf(prev),
      { mails: list.map((m) => m.subject), method: i.method, status: statusOf(last), uid: i.uid === uid, seq: [seqOf(prev), seqOf(last)] });
  }
  ok("J-38 W8: the booker's cancel mail carries no manage link (nothing left to change)", !!b8[2] && !/manage#|reschedule or cancel/i.test(b8[2].body), seen(b8[2]?.body ?? ""));

  // ---------------------------------------------------------------------------------------------- W9: across a clock change (R1.38, QA-616)
  // The next day Toronto's UTC offset changes, worked out here with Intl (never the product's code): the offset is read
  // at noon UTC each day from today. The walk books 10:00 Toronto on the last open day the page offers before that day and
  // the first one after it, at least 26 hours ahead; if the change is too near for a day before it, the following change.
  const offsetOn = (t: number) => new Intl.DateTimeFormat("en-US", { timeZone: FIRM_ZONE, timeZoneName: "shortOffset" }).formatToParts(t).find((x) => x.type === "timeZoneName")?.value ?? "";
  const DAY = 24 * HOUR, today = Math.floor(Date.now() / DAY) * DAY + 12 * HOUR;
  const changes: number[] = [];
  for (let d = 1; d < 400 && changes.length < 2; d++) if (offsetOn(today + d * DAY) !== offsetOn(today + (d - 1) * DAY)) changes.push(today + d * DAY);   // noon UTC of the first day on the new offset
  const tenToronto = (noon: number) => [14, 15].map((h) => noon + (h - 12) * HOUR).find((x) => torontoClock.format(x) === "10:00") ?? 0;
  const monthName = (t: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(t);   // "March 2027"
  const dayLabel = (t: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(t).replace(",", "");
  /** Opens the booking page at the month of `t` and returns the open days the page offers there (their noon UTC). */
  const openDays = async (t: number) => {
    await p.goto(`${BASE}/book/${key}`);
    await p.getByRole("link", { name: "Choose Free consultation" }).click();
    await p.getByRole("heading", { name: "Choose a time" }).waitFor();
    await p.locator("[data-loading]").waitFor({ state: "detached" });
    for (let i = 0; i < 10 && (await monthHeading.innerText()) !== monthName(t); i++) {
      const before = await monthHeading.innerText();
      await p.getByRole("button", { name: "Next month" }).click(); await monthHeading.filter({ hasNotText: before }).waitFor();
      await p.locator("[data-loading]").waitFor({ state: "detached" });
    }
    const shown = await monthHeading.innerText();
    const labels = await p.getByRole("group", { name: shown }).locator("button:not([disabled])").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label") ?? ""));
    return labels.map((l) => Date.parse(`${l.split(" ")[1]} ${shown} 12:00 UTC`)).filter((x) => Number.isFinite(x));
  };
  /** Whether the page offers 10:00 Toronto (in the booker's zone) on the day at `noon`: the day is opened and its times read,
   *  as a person does (an open day in Dubai can hold only Toronto's evening before, e.g. Saturday 00:00-01:30). */
  const offersTen = async (noon: number) => {
    const t = tenToronto(noon); if (!t) return false;
    const label = dayLabel(noon);
    if ((await monthHeading.innerText()) !== monthName(noon) || !(await p.getByRole("button", { name: label, exact: true }).count())) await openDays(noon);
    const b = p.getByRole("button", { name: label, exact: true });
    if (!(await b.count()) || await b.isDisabled()) return false;
    await b.click(); await dayTimes(label).waitFor();
    return (await p.getByRole("button", { name: `${label}, ${pad(new Date(t).getUTCHours() + 4)}:00 ${BOOKER_ZONE} time`, exact: true }).count()) === 1;
  };
  let pair: { before: number; after: number; change: number } | null = null;
  for (const change of changes) {
    const near = [...new Set([...(await openDays(change - 7 * DAY)), ...(await openDays(change)), ...(await openDays(change + 7 * DAY))])].sort((a, b) => a - b);
    let before = 0, after = 0;
    for (const n of near.filter((x) => x < change && x >= change - 7 * DAY && tenToronto(x) > Date.now() + 26 * HOUR).reverse()) if (await offersTen(n)) { before = n; break; }
    for (const n of near.filter((x) => x >= change && x <= change + 7 * DAY)) if (await offersTen(n)) { after = n; break; }
    if (before && after) { pair = { before, after, change }; break; }
  }
  ok("J-38 W9: the next Toronto clock change is found from today's clock, with an open day on the booking page either side of it", !!pair, { changes: changes.map((c) => new Date(c).toISOString().slice(0, 10)) });
  if (!pair) throw new Error("W9: no open day either side of the next clock change");
  console.log(`NOTE  W9: Toronto's clocks change on ${new Date(pair.change - DAY).toISOString().slice(0, 10)}/${new Date(pair.change).toISOString().slice(0, 10)}; booking ${dayLabel(pair.before)} and ${dayLabel(pair.after)}`);
  const sides = [{ tag: "before", noon: pair.before }, { tag: "after", noon: pair.after }].map((x) => {
    const at9 = tenToronto(x.noon), h = new Date(at9).getUTCHours();
    return { ...x, at: at9, utcHour: h, dubaiHour: h + 4, label: dayLabel(x.noon), email: `booker-w9${x.tag}-${run}@j38-client.example`,
      torontoDay: new Intl.DateTimeFormat("en-CA", { timeZone: FIRM_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(at9),
      mailDay: new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", dateStyle: "full" }).format(at9) };
  });
  ok(`J-38 W9: the two sides are on different UTC offsets (10:00 Toronto = ${sides[0].utcHour}:00Z, then ${sides[1].utcHour}:00Z)`, sides[0].utcHour !== sides[1].utcHour && sides.every((x) => x.utcHour === 14 || x.utcHour === 15), sides.map((x) => new Date(x.at).toISOString()));
  const w9ids: Record<string, string> = {};
  for (const x of sides) {
    await openDays(x.noon);
    await p.getByRole("button", { name: x.label, exact: true }).click();
    await dayTimes(x.label).waitFor();
    const name9 = `${x.label}, ${pad(x.dubaiHour)}:00 ${BOOKER_ZONE} time`;
    const slot9 = p.getByRole("button", { name: name9, exact: true });
    ok(`J-38 W9 ${x.tag}: "${name9}" is offered (10:00 Toronto, shown in the booker's zone)`, (await slot9.count()) === 1, await p.locator("[data-day-times] li button").allInnerTexts());
    await slot9.click();
    await p.getByRole("heading", { name: "Your details" }).waitFor();
    await p.getByLabel("Given names").fill("Ana"); await p.getByLabel("Family name").fill("Sample"); await p.getByLabel("Email").fill(x.email);
    await p.waitForTimeout(3_500);   // the form's minimum fill time
    await p.getByRole("button", { name: "Book this time" }).click();
    await p.locator('[data-public-state="booked"], [data-summary]').first().waitFor({ timeout: 20_000 });
    const said = await p.locator("main").innerText();
    await shot(p, `W9-${x.tag}-booked`);
    const r9 = await db.foBooking.findFirst({ where: { firmId: firm.id, startsAt: new Date(x.at) } });
    w9ids[x.tag] = r9?.id ?? "";
    ok(`J-38 W9 ${x.tag}: "You are booked" for ${name9}; underneath it is at ${new Date(x.at).toISOString()} with the booker's zone kept`, said.includes("You are booked") && said.includes(name9) && r9?.bookerTimeZone === BOOKER_ZONE && r9?.staffId === host.id, { said: said.slice(0, 160), r9: [r9?.startsAt, r9?.bookerTimeZone] });
  }
  const londonCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Europe/London", locale: "en-GB", colorScheme: "light", reducedMotion: "reduce" });
  await londonCtx.addInitScript((t) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })), token);   // W7's sign-in: a new sign-in ends the host's earlier session (one session at a time), so W6's token is no longer valid
  const lp = await londonCtx.newPage();
  lp.on("console", (m) => { if (m.type() === "error") console.log(`NOTE  W9 browser: ${m.text().slice(0, 200)}`); });
  for (const x of sides) {
    const londonHour9 = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(x.at));
    await lp.goto(`${BASE}/front-office/bookings?view=week&whose=mine&date=${x.torontoDay}`);
    await lp.locator("[data-grid]").waitFor({ timeout: 30_000 }).catch(async (e) => { await shot(lp, `W9-${x.tag}-no-grid`); console.log(`NOTE  W9: ${(await lp.locator("main").innerText().catch(() => "")).slice(0, 300)}`); throw e; });
    const zone9 = await lp.locator("[data-zone-line]").innerText();
    const inTen9 = await lp.locator(`[data-cell="${x.torontoDay}T10"] [data-block="${w9ids[x.tag]}"]`).count();
    await shot(lp, `W9-${x.tag}-staff-week`); await axe(lp, `W9 ${x.tag}: the host's week`);
    ok(`J-38 W9 ${x.tag}: the host's calendar (browser in Europe/London) names ${FIRM_ZONE} and shows the booking in the 10:00 row of ${x.torontoDay}`, zone9.includes(FIRM_ZONE) && inTen9 === 1, { zone9, inTen9 });
    await lp.locator(`[data-block="${w9ids[x.tag]}"]`).click();
    await lp.locator("[data-booking-detail]").waitFor({ timeout: 20_000 });
    const when9 = await lp.locator("[data-when]").innerText();
    await shot(lp, `W9-${x.tag}-staff-detail`);
    ok(`J-38 W9 ${x.tag}: the detail reads 10:00–10:30 ${FIRM_ZONE} and ${pad(x.dubaiHour)}:00 for the booker (${BOOKER_ZONE}), no London time (${londonHour9}:00)`,
      when9.includes(`10:00–10:30 ${FIRM_ZONE}`) && when9.includes(`${pad(x.dubaiHour)}:00 for Ana Sample (${BOOKER_ZONE})`) && !when9.includes("Europe/London") && !when9.includes(`${pad(londonHour9)}:00`), when9);
  }
  await londonCtx.close();
  const host9 = await inbox(hostEmail, 5);
  for (const x of sides) {
    // The host's mail for this W9 booking, found by its invite's UID: W9's "before" day can be W1's day (W1's first mail
    // names the same date at 10:00 a.m.), so matching on the date alone could read W1's mail (review m1).
    const uidW9 = `${w9ids[x.tag]}@booking.expatready.com`;
    const hm = host9.find((m) => icsAt(m).uid === uidW9), [bm] = await inbox(x.email, 1);
    const hostSays = `${x.mailDay} at 10:00 a.m. (${FIRM_ZONE})`, bookerSays = `${x.mailDay} at ${clock12(x.dubaiHour, 0)} (${BOOKER_ZONE})`, z = new Date(x.at).toISOString();
    ok(`J-38 W9 ${x.tag}: the host's mail reads "${hostSays}" and the booker's "${bookerSays}"`, !!hm && plain(`${hm.subject}\n${hm.body}`).includes(hostSays) && !!bm && plain(`${bm.subject}\n${bm.body}`).includes(bookerSays), [hm?.subject, seen(plain(bm?.body ?? ""))]);
    const [hi, bi] = [icsAt(hm), icsAt(bm)];
    ok(`J-38 W9 ${x.tag}: both invites are one event starting at ${z} (UTC), the booking's UID`, hi.start === x.at && bi.start === x.at && hi.events === 1 && bi.events === 1 && !!hi.uid && hi.uid === uidW9 && bi.uid === uidW9, [hi.rawStart, bi.rawStart, hi.uid]);
  }
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
