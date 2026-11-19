// J-38 (map rows 38 + 40, R1.38 time zones and R1.40 calendar invite files): the join-and-walk row (rows rev 16.11 (b),
// brief lead-b-briefs/J-rows.md §J-38). It adds no feature: it walks FO-3w's public booking page (parts 1 and 2 on main)
// and reads the mails in the demo inbox, on an isolated copy of the running app (its own database and port, never :4400).
//   DW1: booking's mail port is the real one (PF-19b part 1 did the swap; J-37 shares it): both mails are msg_outbox rows
//        SENT by the local adapter and are read back from the running app's demo inbox. Fails on the fake: fakeMail kept
//        mail in the API's memory, wrote no outbox row and gave the inbox nothing, so DW1 and W2..W5 would all fail.
//   W1: a booker whose browser is in Asia/Dubai books 10:00 Toronto time on the public page, by screens at 1440 px;
//   W2: the booker's mail states the time in the booker's zone: 7:00 p.m. (Asia/Dubai);
//   W3: the host's mail states the same moment in the firm's zone: 10:00 a.m. (America/Toronto);
//   W4: the .ics (in both mails and behind "Add to calendar") is read as a calendar reads it and starts at that instant
//       in UTC, for 30 minutes, one UID;
//   W5: ends at row 42's first step: the reschedule link in the booker's mail opens the booker's own page for it.
// The day is the first one the page offers 10:00 Toronto on, at least 26 hours ahead, so the test never goes stale. In
// Toronto's winter (EST, UTC-5) that is 15:00 UTC and 7:00 p.m. in Dubai, as the brief words it; in summer (EDT, UTC-4)
// it is 14:00 UTC and 6:00 p.m. What is expected is worked out here with plain UTC sums (Dubai is UTC+4 all year), never
// with the product's own functions. Not here (a later lane adds it): the staff member's own time-zone step for R1.38.
// Setup a person cannot do through the product yet (the firm, its host, hours and consultation type) is written straight
// to the copy's database (Sample rows). Sample values only; US$0, no model call.
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j38 4438 start --ttl 30 && trap 'zsh studio/tools/isolated.sh j38 4438 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_38.ts j38 4438
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
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
await db.foConsultationType.create({ data: { firmId: firm.id, slug: "free", name: "Free consultation", modes: ["VIDEO"], hostStaffIds: [host.id], minutes: 30 } });
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
  const monthHeading = p.locator("h2[aria-live]");
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
  const sentTo = (address: string, who: string) => sent.filter((o) => o.address === address && o.state === "SENT" && o.providerId?.startsWith("local:") && o.idempotencyKey === `mail:booking:${row?.id}:${row?.sequence}:mail-${who}`).length;
  ok("J-38 DW1: booking's mail is the real sending path: one outbox row each for the booker and the host, SENT by the local adapter, both in the app's demo inbox (the in-memory fake wrote neither)",
    sent.length === 2 && sentTo(bookerEmail, "person") === 1 && sentTo(hostEmail, "host") === 1 && bookerMails.length === 1 && hostMails.length === 1, { outbox: sent.map((o) => [o.address, o.state, o.idempotencyKey?.replace(row?.id ?? "-", "<booking>")]), inbox: [bookerMails.length, hostMails.length] });
  const bookerMail = bookerMails[0], hostMail = hostMails[0];
  const bookerText = plain(`${bookerMail?.subject}\n${bookerMail?.body}`), hostText = plain(`${hostMail?.subject}\n${hostMail?.body}`);

  // ---------------------------------------------------------------------------------------------- W2, W3: the two mails
  ok(`J-38 W2: the booker's mail reads "${mailDay} at ${bookerTime}"`, bookerText.includes(`${mailDay} at ${bookerTime}`), bookerText.slice(0, 260));
  ok("J-38 W2: the booker's mail states no other zone's time (the firm's zone is not in it)", !!bookerMail && !bookerText.includes(FIRM_ZONE) && !/10:00 a\.m\./.test(bookerText), bookerText.slice(0, 260));
  ok(`J-38 W3: the host's mail reads "${mailDay} at ${hostTime}", in its subject and its text`, plain(hostMail?.subject ?? "").includes(`${mailDay} at ${hostTime}`) && plain(hostMail?.body ?? "").includes(`${mailDay} at ${hostTime}`), hostText.slice(0, 260));
  ok("J-38 W3: the host's mail states no other zone's time (the booker's zone is not in it)", !!hostMail && !hostText.includes(BOOKER_ZONE) && !hostText.includes(clock12(dubaiHour, 0)), hostText.slice(0, 260));

  // ---------------------------------------------------------------------------------------------- W4: the .ics
  const attached = (m?: Mail) => m?.attachments.find((a) => /\.ics$/.test(a.filename));
  const href = await p.getByRole("link", { name: "Add to calendar" }).getAttribute("href");
  const download = await fetch(new URL(href ?? "/missing", BASE));
  const files = [
    { from: "the booker's mail", type: attached(bookerMail)?.content_type ?? "", text: attached(bookerMail)?.text ?? "" },
    { from: "the host's mail", type: attached(hostMail)?.content_type ?? "", text: attached(hostMail)?.text ?? "" },
    { from: '"Add to calendar" on the confirmation', type: download.headers.get("content-type") ?? "", text: download.status === 200 ? await download.text() : "" },
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
  const linkAt = link.replace(/#.*/, "#<token>");   // the token is never printed
  ok("J-38 W5: the booker's mail carries the reschedule link, to this copy's own page for the booker", link.startsWith(`${BASE}/book/${key}/manage#`) && link.length > `${BASE}/book/${key}/manage#`.length + 20, linkAt);
  ok("J-38 W5: the host's mail carries no booker's link", !!hostMail && !/manage#|reschedule or cancel/i.test(hostText), hostText.slice(0, 200));
  const mine = await ctx.newPage();   // the link opened from the mail, in the booker's browser
  await mine.goto(link.startsWith(BASE) ? link : `${BASE}/book/${key}/manage`);
  await mine.locator("[data-public-state]").first().waitFor({ timeout: 30_000 });
  const state = await mine.locator("[data-public-state]").first().getAttribute("data-public-state");
  const when = state === "manage" ? await mine.locator("[data-when]").innerText() : "";
  await shot(mine, "W5-manage"); await axe(mine, "W5 the booker's own page");
  ok(`J-38 W5: the link opens the booker's own page for this booking (${slotName}) and it offers Reschedule: row 42's first step`, state === "manage" && when.includes(slotName) && (await mine.getByRole("button", { name: "Reschedule" }).count()) === 1, { state, when });
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
