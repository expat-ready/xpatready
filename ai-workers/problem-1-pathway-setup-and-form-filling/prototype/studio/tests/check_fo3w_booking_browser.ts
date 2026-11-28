// FO-3w part 1 (brief lead-b-briefs/FO-3w.md + P-626 A1; concept screens/fo-3-booking r2 BR-1..BR-7, BR-11, §6): the
// public booking pages in a real browser: J-P1..J-P5, J-P9, DW10 (axe, four widths, no outside host). Two servers:
//   * the isolated copy (the real app: its build, its routes, the system clock) for a smoke booking (R1..R3);
//   * a server this test holds, on the copy's database: FO-3's real public controller and service, the same web build,
//     and a clock the test sets (the journeys' dates, J-P2 and J-P5, are in the past or far ahead of today), the
//     ArrivalPort fake (the running app's own adapter until FO-2's, runtime-ports.ts), which records the consent given,
//     and a firm with no consent sentence; plus a second one with a small read limit for J-P9's 429.
// The browser's clock is set to the server's (Playwright clock) and its zone per journey. Seeds firm `maple` (Sample).
// The schema has one purpose (FREE_CONSULT), so J-P1's "case type" cannot be stored yet: a retired type stands in. US$0.
//   zsh studio/tools/isolated.sh screens_fo3w 4531 start && tsx studio/tests/check_fo3w_booking_browser.ts 4531 xr_studio_screens_fo3w
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { fakeArrival } from "../ports/arrival.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";
import { recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const COPY = Number(process.argv[2] ?? 4531), DBNAME = process.argv[3] ?? "xr_studio_screens_fo3w", HELD = COPY + 300, LIMITED = COPY + 301;
const URL = `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, STUDIO = join(import.meta.dirname, ".."), WEB = join(STUDIO, "web", "dist");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "fo-3-booking", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
process.env.DATABASE_URL = URL;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
const { Db } = await import("../api/src/core.ts");
const { Booking, BOOKING_PORTS, BookingPublicController } = await import("../api/src/front-office/booking/public.controller.ts");
const { wallToUtc } = await import("../api/src/front-office/booking/slots.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const TZ = "America/Toronto";
const at = (s: string) => { const [d, t] = s.split(" "); const [y, m, dd] = d.split("-").map(Number); const [h, mi] = t.split(":").map(Number); return wallToUtc(y, m, dd, h * 60 + mi, TZ)!; };

// ------------------------------------------------------------------------------------------------------------ set-up
if (await db.platformFirm.findUnique({ where: { key: "maple" } })) { console.error("STOP  firm maple exists: start a fresh copy (isolated.sh … start)"); process.exit(2); }
const firm = (key: string, name: string) => db.platformFirm.create({ data: { key, operatingName: name, countryCode: "CA", status: "ACTIVE", contactEmail: `hello@${key}.example`,
  businessAddress: { street_number: "100", street_name: "Sample Street", city: "Toronto", province_state: "ON", postal_code: "M5V 0A1", country: "CA", phone: "+1 416 555 0100" } } });
const M = await firm("maple", "Maple Immigration"), E = await firm("maple-empty", "Sample Empty Firm"), Q = await firm("maple-quiet", "Sample Quiet Firm");
const host = async (firmId: string, name: string) => {
  const s = await db.platformStaff.create({ data: { firmId, email: `${name.replace(/\W/g, "").toLowerCase()}@${firmId.slice(0, 8)}.example`, displayName: name } });
  // Mon-Fri 09:00-17:00, Sunday 00:00-04:00 (the DST nights, J-P5) and Monday 19:00-20:00 (an evening past UTC midnight,
  // Devin #1921) Toronto. Sample.
  await db.foAvailability.createMany({ data: [1, 2, 3, 4, 5].map((weekday) => ({ firmId, staffId: s.id, weekday, startMinute: 540, endMinute: 1020, timeZone: TZ })).concat([{ firmId, staffId: s.id, weekday: 0, startMinute: 0, endMinute: 240, timeZone: TZ }, { firmId, staffId: s.id, weekday: 1, startMinute: 1140, endMinute: 1200, timeZone: TZ }]) });
  // FO-3v part 1: the join line is the host's own My meeting link (the type's meetingLink is not a source, AG-16-73).
  await db.foVideoPref.create({ data: { firmId, staffId: s.id, myMeetingLink: "https://meet.example/sample-room", sourceChoice: "MY_LINK" } });
  return s;
};
const F = await host(M.id, "Client F"), FQ = await host(Q.id, "Client C");
const type = (firmId: string, hostId: string, slug: string, name: string, extra: Record<string, unknown> = {}) =>
  db.foConsultationType.create({ data: { firmId, slug, name, modes: ["VIDEO", "PHONE"], hostStaffIds: [hostId], minutes: 30, windowDays: 400, meetingLink: "https://meet.example/sample-room", ...extra } });
await type(M.id, F.id, "free-consultation", "Free consultation");
await type(M.id, F.id, "study-permit-check", "Study permit check", { minutes: 45, modes: ["VIDEO", "IN_PERSON"] });
await type(M.id, F.id, "hidden-call", "Hidden call", { showOnBookingPage: false });
await type(M.id, F.id, "retired-call", "Retired call", { active: false });
await type(Q.id, FQ.id, "free-consultation", "Free consultation");
ok("FO-3w setup: three Sample firms, two hosts with hours, five types", true);

class SetClock extends FakeClock { shift = 0; override now() { return new Date(Date.now() + this.shift); } async to(d: Date) { this.shift = d.getTime() - Date.now(); } }
const clock = new SetClock();
const arrival = fakeArrival();
const wording = await arrival.bookingConsentWording(null as never, M.id);
(arrival as { bookingConsentWording: typeof arrival.bookingConsentWording }).bookingConsentWording = async (_tx, firmId) => firmId === Q.id ? null : wording;
const portsWith = (limits: Record<string, number>) => ({ audit: auditEvent as never, clock, jobs: fakeJobs(clock), mail: fakeMail({ clock }), arrival, publicBaseUrl: `http://localhost:${HELD}`, limits });
async function serve(port: number, limits: Record<string, number>) {
  @Module({ controllers: [BookingPublicController] as never[], providers: [Db, Booking, { provide: BOOKING_PORTS, useValue: portsWith(limits) }] as never[] }) class Held {}
  const app = await NestFactory.create<NestExpressApplication>(Held, { logger: ["error"] });
  app.useStaticAssets(WEB, { index: false });
  app.getHttpAdapter().getInstance().get(/^\/(?!api\/).*/, (_q: unknown, res: { sendFile(p: string): void }) => res.sendFile(join(WEB, "index.html")));
  await app.listen(port, "127.0.0.1"); return app;
}
const apps = [await serve(HELD, { slotsPerIp: 100_000, bookPerIp: 100_000, bookPerFirm: 100_000, tokenPerIp: 100_000 }), await serve(LIMITED, { slotsPerIp: 20, windowMinutes: 1 })];
const BASE = `http://localhost:${HELD}`;
const browser: Browser = await chromium.launch({ headless: !process.env.HEADED, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [], outside: string[] = [];
async function visitor(zone: string, width = 1440, now?: Date): Promise<{ p: Page; ctx: BrowserContext }> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: zone, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("request", (r) => { const u = new globalThis.URL(r.url()); if (!["data:", "blob:"].includes(u.protocol) && !/^localhost:\d+$/.test(u.host)) outside.push(r.url()); });
  if (now) { await p.clock.install({ time: now }); await p.clock.resume(); }
  return { p, ctx };
}
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const axe = async (name: string, p: Page) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze(); const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`FO-3w DW10 ${name}: axe finds no serious or critical finding`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `fo3w-${name}.png`), fullPage: true });
const mainText = async (p: Page) => (await p.locator("main").innerText()).replace(/\s+/g, " ");
/** The arrivals the held server saw for an email (the ArrivalPort fake records each, with its consent). */
const bookings = async (email: string) => arrival.calls.filter((c) => c.person.email === email);
const open = async (p: Page, path: string) => { await p.goto(`${BASE}${path}`); await p.locator("main h1").first().waitFor({ timeout: 30_000 }); };
async function fill(p: Page, v: { given?: string; family?: string; email: string; phone?: string }) {
  await p.getByLabel("Given names").fill(v.given ?? "Client B"); await p.getByLabel("Family name").fill(v.family ?? "Sample"); await p.getByLabel("Email").fill(v.email);
  if (v.phone) { await p.getByLabel("Phone call").check(); await p.getByLabel("Phone", { exact: true }).fill(v.phone); }
}
const book = async (p: Page) => { await p.getByRole("button", { name: "Book this time" }).click(); await p.locator('[data-public-state="booked"], [data-summary]').first().waitFor({ timeout: 20_000 }); };
const run = Date.now().toString(36);

try {
  // ---------------------------------------------------------------------------------------- R: the real app (the copy)
  {
    const { p, ctx } = await visitor(TZ);
    await p.goto(`http://localhost:${COPY}/book/maple`); await p.locator("[data-type-card]").first().waitFor({ timeout: 30_000 });
    ok("FO-3w R1: the real app routes /book/maple (PF-1's seam) to the list, in its own frame with no Studio shell", (await p.locator("[data-type-card]").count()) === 2 && (await p.locator("header [data-firm-name]").innerText()) === "Maple Immigration" && (await p.getByText("Product Studio").count()) === 0);
    await p.getByRole("link", { name: "Choose Free consultation" }).click(); await p.getByRole("heading", { name: "Choose a time" }).waitFor();
    for (let i = 0; i < 3 && !(await p.locator("[data-day-times] li").count()); i++) { await p.getByRole("button", { name: "Next month" }).click(); await p.waitForTimeout(800); }
    await p.locator("[data-day-times] li button").first().click(); await fill(p, { email: `real.${run}@example.org` }); await book(p);
    ok("FO-3w R2: on the real app a visitor books the first free time and sees \"You are booked\"", (await p.locator('[data-public-state="booked"]').count()) === 1, await mainText(p));
    ok("FO-3w R3: the address bar never carries the manage token", !p.url().includes("#") && !/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(p.url()), p.url());
    await ctx.close();
  }
  // ------------------------------------------------------------------------------------------------------------- J-P1
  {
    await clock.to(at("2026-10-16 09:00"));
    const { p, ctx } = await visitor(TZ, 1440, clock.now());
    await open(p, "/book/maple");
    const cards = await p.locator("[data-type-card] h2").allInnerTexts();
    ok("FO-3w J-P1 pass (BR-1, AG-4-16): two public types, one hidden and one retired → two cards with lengths and ways to meet", cards.length === 2 && cards[0] === "Free consultation · 30 minutes" && cards[1] === "Study permit check · 45 minutes" && (await mainText(p)).includes("Video call, In person"), cards);
    ok("FO-3w J-P1: the title reads \"Book a meeting with Maple Immigration\"", (await p.locator("main h1").innerText()) === "Book a meeting with Maple Immigration");
    await axe("list (1440)", p); await shot(p, "list-1440");
    await open(p, "/book/maple-empty");
    const empty = await mainText(p);
    ok("FO-3w J-P1 fail (AG-4-16 §12): no public type → the empty text and the firm's email", empty.includes("No bookings are available online. Please contact the firm.") && (await p.getByRole("link", { name: "Email hello@maple-empty.example" }).getAttribute("href")) === "mailto:hello@maple-empty.example", empty);
    await axe("empty list", p);
    const nf: string[] = [];
    for (const path of ["/book/no-such-firm", "/book/maple/hidden-call", "/book/maple/retired-call", "/book/maple/no-such-type", `/book/maple/${F.id}`, `/book/${M.id}`]) { await open(p, path); nf.push(await mainText(p)); }
    ok("FO-3w BR-2: an unknown firm, hidden, retired or unknown type and a UUID give the identical \"This page is not available.\"", nf.every((t) => t === "This page is not available."), nf);
    await axe("not found", p);
    await ctx.close();
  }
  // ------------------------------------------------------------------------------------------------------------- J-P2
  {
    const { p, ctx } = await visitor("Asia/Dubai", 1440, clock.now());
    await open(p, "/book/maple/free-consultation");
    await p.getByRole("button", { name: "Tuesday 20 October", exact: true }).click();
    const line = (await p.locator("[data-zone-line]").innerText()).replace(/\s+/g, " ");
    ok("FO-3w J-P2 pass (BR-3, AG-4-18): a Dubai browser sees Client F's 14:00 Toronto slot on Tue 20 Oct as 22:00, \"Times shown in Asia/Dubai (change)\"", line.startsWith("Times shown in Asia/Dubai (change)") && (await p.getByRole("button", { name: "Tuesday 20 October, 22:00 Asia/Dubai time" }).count()) === 1, line);
    await axe("times (1440)", p); await shot(p, "times-dubai-1440");
    await p.getByRole("button", { name: "(change) time zone" }).click();
    await p.getByLabel("Search for a city or zone").fill("Nowhere/Atlantis"); await p.getByRole("button", { name: "Use this zone" }).click();
    ok("FO-3w J-P2 fail: a zone that is not one is refused on the field, the zone unchanged", (await p.getByText("Choose a time zone from the list.").count()) === 1 && (await p.locator("[data-zone-line] span").first().innerText()) === "Asia/Dubai");
    const refusedZones: string[] = [];
    for (const z of ["Factory", "+05:30"]) { await p.getByLabel("Search for a city or zone").fill(z); await p.getByRole("button", { name: "Use this zone" }).click(); if ((await p.getByText("Choose a time zone from the list.").count()) === 1) refusedZones.push(z); }
    ok("FO-3w J-P2 fail (break M2): zones the browser knows but the server refuses (Factory, +05:30) are refused on the field", refusedZones.length === 2, refusedZones);
    await axe("zone dialog", p);
    await p.getByLabel("Search for a city or zone").fill("Europe/London"); await p.getByRole("button", { name: "Use this zone" }).click();
    await p.getByRole("button", { name: "Tuesday 20 October", exact: true }).click();
    const slot = p.getByRole("button", { name: "Tuesday 20 October, 19:00 Europe/London time" });
    ok("FO-3w J-P2 pass: switched to Europe/London the same slot shows 19:00", (await slot.count()) === 1 && (await p.locator("[data-zone-line]").innerText()).includes("Europe/London"));
    await slot.click(); await fill(p, { email: `dubai.${run}@example.org` }); await book(p);
    const row = await db.foBooking.findFirst({ where: { firmId: M.id, startsAt: at("2026-10-20 14:00") } });
    ok("FO-3w J-P2 pass: the booked UTC instant is 14:00 Toronto (18:00 UTC), kept with the visitor's chosen zone", row?.startsAt.toISOString() === "2026-10-20T18:00:00.000Z" && row?.bookerTimeZone === "Europe/London", row);
    ok("FO-3w J-P2: the confirmation says the time in the visitor's zone", (await mainText(p)).includes("Tuesday 20 October, 19:00 Europe/London time, with Maple Immigration"), await mainText(p));
    await ctx.close();
  }
  // Break M1: a zone change reads the month in the new zone, so no day loses its times at the month's edge.
  {
    await clock.to(at("2026-11-20 09:00"));
    const { p, ctx } = await visitor("Asia/Dubai", 1440, clock.now());
    await open(p, "/book/maple/free-consultation");
    await p.getByRole("button", { name: "(change) time zone" }).click(); await p.getByLabel("Search for a city or zone").fill("America/Toronto"); await p.getByRole("button", { name: "Use this zone" }).click();
    await p.getByRole("button", { name: "Monday 30 November", exact: true }).click();
    ok("FO-3w J-P2 (break M1): Dubai switched to Toronto still shows Mon 30 Nov's last times (16:30), read in the new zone", (await p.getByRole("button", { name: "Monday 30 November, 16:30 America/Toronto time" }).count()) === 1, await p.locator("[data-day-times]").innerText());
    await ctx.close();
    // Devin #1921: a browser with no zone the server takes ("Factory") is shown the firm's zone, and the month is read in
    // it, so the firm's evening on the month's last day (19:30 Toronto = 00:30 UTC the next day) is still there.
    const f = await visitor("Factory", 1440, clock.now());
    await open(f.p, "/book/maple/free-consultation"); await f.p.getByRole("button", { name: "Monday 30 November", exact: true }).click();
    ok("FO-3w BR-3 (Devin #1921): no browser zone → the firm's zone, and Mon 30 Nov 19:30 America/Toronto is offered", (await f.p.locator("[data-zone-line]").innerText()).includes("America/Toronto") && (await f.p.getByRole("button", { name: "Monday 30 November, 19:30 America/Toronto time" }).count()) === 1, await f.p.locator("[data-day-times]").innerText());
    // A month that fails to load says so, and never also "No free times" (Devin #1921, review n1).
    await f.p.route("**/slots?**", (rt) => rt.abort("failed")); await f.p.getByRole("button", { name: "Next month" }).click(); await f.p.getByRole("alert").first().waitFor();
    ok("FO-3w (review n1): a month that fails to load shows the error and not \"No free times\"", (await f.p.locator('[data-public-state="no-times"]').count()) === 0 && (await mainText(f.p)).includes("We could not load the times. Please try again."), await mainText(f.p));
    await f.ctx.close(); await clock.to(at("2026-10-16 09:00"));
  }
  // ------------------------------------------------------------------------------------------------------------- J-P3
  {
    const { p, ctx } = await visitor(TZ, 1440, clock.now());
    await open(p, "/book/maple/free-consultation");
    const tabTo = async (want: (el: { label: string; text: string; tag: string }) => boolean, max = 80) => { for (let i = 0; i < max; i++) { await p.keyboard.press("Tab"); const el = await p.evaluate(() => { const a = document.activeElement as HTMLElement; return { label: a.getAttribute("aria-label") ?? a.getAttribute("id") ?? "", text: a.innerText ?? "", tag: a.tagName }; }); if (want(el)) return true; } return false; };
    const reached = await tabTo((e) => e.label === "Wednesday 21 October") && (await p.keyboard.press("Enter"), true) && await tabTo((e) => e.label.startsWith("Wednesday 21 October, 10:00"));
    await p.keyboard.press("Enter"); await p.getByRole("heading", { name: "Your details" }).waitFor();
    // The first field after the step line: Tab from "Back to times" to the inputs, typing like a person.
    await tabTo((e) => e.text === "Back to times");
    for (const text of ["Client B", "Sample", `kb.${run}@example.org`]) { await p.keyboard.press("Tab"); await p.keyboard.type(text); }
    ok("FO-3w J-P3: the consent box is the firm's sentence, unticked", (await p.getByRole("checkbox").isChecked()) === false && (await mainText(p)).includes(wording!.text));
    await tabTo((e) => e.text === "Book this time"); await p.keyboard.press("Enter");
    await p.locator('[data-public-state="booked"]').waitFor({ timeout: 20_000 });
    const done = await mainText(p);
    ok("FO-3w J-P3 pass (BR-5, AG-4-19): keyboard only, box unticked → \"You are booked\" with Add to calendar, Reschedule, Cancel and the join line", reached && done.includes("You are booked") && done.includes("Your join link: https://meet.example/sample-room") && done.includes(`We have sent the details to kb.${run}@example.org.`)
      && (await p.getByRole("link", { name: "Add to calendar" }).count()) === 1 && (await p.getByRole("link", { name: "Reschedule" }).count()) === 1 && (await p.getByRole("link", { name: "Cancel booking" }).count()) === 1, done);
    ok("FO-3w J-P3: Add to calendar is the booking's .ics; Reschedule and Cancel open the manage address with the token in the fragment", (await p.getByRole("link", { name: "Add to calendar" }).getAttribute("href"))!.endsWith("/ics") && /^\/book\/maple\/manage#.+/.test((await p.getByRole("link", { name: "Reschedule" }).getAttribute("href")) ?? ""));
    const kb = (await bookings(`kb.${run}@example.org`))[0];
    ok("FO-3w J-P3 pass: no marketing consent stored (the arrival carries none)", !!kb && kb.consent === undefined, kb);
    await axe("confirmation", p); await shot(p, "booked-1440");
    await open(p, "/book/maple/free-consultation"); await p.getByRole("button", { name: "Wednesday 21 October", exact: true }).click(); await p.getByRole("button", { name: /^Wednesday 21 October, 11:00/ }).click();
    await fill(p, { email: `tick.${run}@example.org` }); await p.getByRole("checkbox").check(); await book(p);
    const tick = (await bookings(`tick.${run}@example.org`))[0];
    ok("FO-3w J-P3 pass: box ticked → one consent with the wording id", tick?.consent?.wordingId === wording!.wordingId, tick);
    await open(p, "/book/maple-quiet/free-consultation"); await p.getByRole("button", { name: "Wednesday 21 October", exact: true }).click(); await p.getByRole("button", { name: /^Wednesday 21 October, 10:00/ }).click();
    ok("FO-3w J-P3 fail side (AG-4-19 rule 4): a firm with no sentence shows no box", (await p.getByRole("checkbox").count()) === 0);
    await fill(p, { email: `quiet.${run}@example.org` }); await book(p);
    ok("FO-3w J-P3: … and booking still works", (await p.locator('[data-public-state="booked"]').count()) === 1);
    // The form's own checks: each on its field and in the summary, nothing sent.
    await open(p, "/book/maple/free-consultation"); await p.getByRole("button", { name: "Wednesday 21 October", exact: true }).click(); await p.getByRole("button", { name: /^Wednesday 21 October, 13:00/ }).click();
    await p.getByLabel("Email").fill("client.b@example"); await p.getByLabel("Phone call").check(); await p.getByRole("button", { name: "Book this time" }).click();
    const sum = await p.locator("[data-summary]").innerText();
    ok("FO-3w J-P3 fail: empty names, a bad email and no phone for a phone call → the four sentences, the email kept", ["There is a problem", "Enter your given names.", "Enter your family name.", "Enter an email like name@example.com.", "Enter a phone number with its country code, e.g. +1 416 555 0100."].every((s) => sum.includes(s)) && (await p.getByLabel("Email").inputValue()) === "client.b@example", sum);
    await axe("details with errors", p); await shot(p, "details-errors-1440");
    await ctx.close();
  }
  // ------------------------------------------------------------------------------------------------------------- J-P4
  {
    const { p, ctx } = await visitor(TZ, 1440, clock.now());
    await open(p, "/book/maple/free-consultation"); await p.getByRole("button", { name: "Thursday 22 October", exact: true }).click(); await p.getByRole("button", { name: /^Thursday 22 October, 09:00/ }).click();
    await fill(p, { given: "Client P", email: `taken.${run}@example.org` });
    // Someone else books the same time first, through the same public door.
    const s = await (await fetch(`${BASE}/api/public/firms/maple/book/free-consultation/slots?from=${at("2026-10-22 00:00").toISOString()}&to=${at("2026-10-23 00:00").toISOString()}`)).json() as { formStamp: string };
    await new Promise((r) => setTimeout(r, 3_200));
    const other = await fetch(`${BASE}/api/public/firms/maple/book/free-consultation/bookings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ givenNames: "Client X", familyName: "Sample", email: `other.${run}@example.org`, mode: "VIDEO", startsAt: at("2026-10-22 09:00").toISOString(), timeZone: TZ, formStamp: s.formStamp }) });
    await book(p);
    const t = await p.locator("[data-summary]").innerText();
    ok("FO-3w J-P4 pass (BR-7, AG-4-36 §12): taken between choosing and booking → \"This time was just booked.\", \"Please choose another time.\", the next free times, answers kept", other.status === 201 && t.includes("This time was just booked.") && t.includes("Please choose another time.") && t.includes("Next free times") && (await p.getByLabel("Given names").inputValue()) === "Client P" && (await p.getByLabel("Email").inputValue()) === `taken.${run}@example.org`, { status: other.status, t });
    await axe("slot taken", p); await shot(p, "slot-taken-1440");
    await p.locator("[data-summary] li button").first().click();
    ok("FO-3w J-P4: a next free time is taken into the form, which keeps its answers", /^\w+ \d+ \w+, \d\d:\d\d America\/Toronto time$/.test(await p.locator("[data-chosen]").innerText()) && !(await p.locator("[data-chosen]").innerText()).startsWith("Thursday 22 October, 09:00") && (await p.getByLabel("Given names").inputValue()) === "Client P");
    await book(p);
    ok("FO-3w J-P4: … and books", (await p.locator('[data-public-state="booked"]').count()) === 1 && (await bookings(`taken.${run}@example.org`)).length === 1);
    await open(p, "/book/maple/free-consultation"); await p.getByRole("button", { name: "Thursday 22 October", exact: true }).click(); await p.getByRole("button", { name: /^Thursday 22 October, 14:00/ }).click();
    // Break M3: the answer is lost on the way (network): a sentence, no page error, the answers kept.
    await p.route("**/bookings", (rt) => rt.abort("failed"), { times: 1 });
    const errs = errors.length;
    await fill(p, { email: `twice.${run}@example.org` }); await book(p);
    ok("FO-3w J-P4 fail (break M3): a lost answer shows \"We could not take this booking. Please try again.\", answers kept, no page error", (await p.locator("[data-summary]").innerText()).includes("We could not take this booking. Please try again.") && (await p.getByLabel("Email").inputValue()) === `twice.${run}@example.org` && errors.length === errs);
    await open(p, "/book/maple/free-consultation"); await p.getByRole("button", { name: "Thursday 22 October", exact: true }).click(); await p.getByRole("button", { name: /^Thursday 22 October, 14:00/ }).click();
    await fill(p, { email: `twice.${run}@example.org` }); await p.getByRole("button", { name: "Book this time" }).dblclick(); await p.locator('[data-public-state="booked"]').waitFor({ timeout: 20_000 }); await p.waitForTimeout(1500);
    ok("FO-3w J-P4 fail side: a double click books once", (await bookings(`twice.${run}@example.org`)).length === 1);
    await ctx.close();
  }
  // ------------------------------------------------------------------------------------------------------------- J-P5
  {
    await clock.to(at("2026-10-28 09:00"));
    const { p, ctx } = await visitor(TZ, 1440, clock.now());
    await open(p, "/book/maple/free-consultation"); await p.getByRole("button", { name: "Next month" }).click(); await p.getByRole("button", { name: "Sunday 1 November", exact: true }).click();
    const fall = await p.locator("[data-day-times] li").allInnerTexts();
    ok("FO-3w J-P5 pass (BR-4): Sun 1 Nov 2026 in America/Toronto shows no time twice and the DST note", fall.length === 8 && new Set(fall).size === fall.length && (await p.locator("[data-dst]").innerText()) === "Clocks change on this day. Times shown are real times in America/Toronto.", fall);
    await axe("DST day", p); await shot(p, "dst-fall-1440");
    await p.getByRole("button", { name: "Next month" }).click();
    ok("FO-3w J-P5 fail side: a day with no clock change has no note", await p.getByRole("button", { name: "Sunday 6 December", exact: true }).click().then(async () => (await p.locator("[data-dst]").count()) === 0));
    await ctx.close();
    await clock.to(at("2027-03-10 09:00"));
    const s = await visitor(TZ, 1440, clock.now());
    await open(s.p, "/book/maple/free-consultation"); await s.p.getByRole("button", { name: "Sunday 14 March", exact: true }).click();
    const spring = await s.p.locator("[data-day-times] li").allInnerTexts();
    ok("FO-3w J-P5 pass: Sun 14 Mar 2027 shows no 02:00-02:59 time, with the note", spring.length > 0 && !spring.some((x) => x.startsWith("02:")) && (await s.p.locator("[data-dst]").count()) === 1, spring);
    await s.ctx.close();
  }
  // ------------------------------------------------------------------------------------------------------------- J-P9
  {
    await clock.to(at("2026-10-16 09:00"));
    const { p, ctx } = await visitor(TZ, 1440, clock.now());
    await p.setContent(`<!doctype html><html lang="en"><title>Embed</title><body><iframe src="${BASE}/book/maple/free-consultation" title="Book a meeting with Maple Immigration" width="100%" height="900"></iframe></body></html>`);
    const f = p.frameLocator("iframe");
    await f.getByRole("button", { name: "Friday 23 October", exact: true }).click(); await f.getByRole("button", { name: /^Friday 23 October, 09:00/ }).click();
    await f.getByLabel("Given names").fill("Client B"); await f.getByLabel("Family name").fill("Sample"); await f.getByLabel("Email").fill(`embed.${run}@example.org`);
    await f.getByRole("button", { name: "Book this time" }).click(); await f.locator('[data-public-state="booked"]').waitFor({ timeout: 20_000 });
    ok("FO-3w J-P9 pass (BR-11, AG-4-16 rule 4): the type page in an iframe books normally", (await bookings(`embed.${run}@example.org`)).length === 1);
    await open(p, "/book/maple/free-consultation"); await p.getByRole("button", { name: "Friday 23 October", exact: true }).click(); await p.getByRole("button", { name: /^Friday 23 October, 11:00/ }).click();
    await fill(p, { email: `bot.${run}@example.org` }); await p.locator('input[name="website"]').evaluate((el: HTMLInputElement) => { el.value = "https://spam.example"; });
    const before = await db.foBooking.count({ where: { firmId: M.id } });
    await book(p);
    ok("FO-3w J-P9 fail (BR-6, AG-4-20 rule 3): a filled honeypot is refused with the server's sentence and nothing is saved", (await p.locator("[data-summary]").innerText()).includes("We could not take this booking. Please try again.") && (await db.foBooking.count({ where: { firmId: M.id } })) === before && (await bookings(`bot.${run}@example.org`)).length === 0);
    // The 21st read in a minute (the second server's limit is 20 a minute, AG-4-20 rule 4's "Please try again in a minute.").
    for (let i = 0; i < 20; i++) await fetch(`http://localhost:${LIMITED}/api/public/firms/maple/book`);
    await p.goto(`http://localhost:${LIMITED}/book/maple`); await p.locator("main h1").waitFor({ timeout: 20_000 });
    ok("FO-3w J-P9 fail: the 21st request in a minute shows \"Please try again in a minute.\"", (await mainText(p)) === "Please try again in a minute.", await mainText(p));
    await axe("rate limit", p);
    await ctx.close();
    // Every step at 360 px with 44 × 44 px targets, no sideways scroll; screenshots at 360, 375, 1024 (1440 above).
    const small = async (p: Page, step: string) => {
      const tiny = await p.evaluate(() => [...document.querySelectorAll<HTMLElement>(["main", "[role=dialog]"].flatMap((w) => ["button", "a", "input:not([type=radio]):not([type=checkbox]):not([name=website])", "label:has(input[type=radio])"].map((t) => `${w} ${t}`)).join(", "))]
        .filter((e) => e.offsetParent && !(e.tagName === "A" && e.closest("p")?.querySelector("a") === e && e.parentElement?.tagName === "P" && (e.parentElement.textContent ?? "").length > (e.textContent ?? "").length))
        .map((e) => { const r = e.getBoundingClientRect(); return { t: (e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((r) => r.w < 44 || r.h < 44));
      ok(`FO-3w J-P9 ${step} at ${p.viewportSize()!.width} px: every target is at least 44 × 44 px, no sideways scroll`, tiny.length === 0 && await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), tiny);
    };
    for (const width of [360, 375, 1024]) {
      const v = await visitor(TZ, width, clock.now());
      await open(v.p, "/book/maple"); await small(v.p, "list"); await shot(v.p, `list-${width}`);
      await v.p.getByRole("link", { name: "Choose Free consultation" }).click(); await v.p.getByRole("button", { name: "Monday 26 October", exact: true }).click();
      await small(v.p, "times"); await shot(v.p, `times-${width}`); if (width === 360) await axe("times (360)", v.p);
      if (width === 360) {   // review R1, m1: the zone picker's targets, and focus back on "(change)" when it closes
        await v.p.getByRole("button", { name: "(change) time zone" }).click(); await v.p.getByRole("dialog").waitFor();
        await small(v.p, "zone dialog"); await shot(v.p, "zone-dialog-360"); await v.p.keyboard.press("Escape");
        ok("FO-3w J-P9 (review m1): closing the zone picker puts focus back on \"(change)\"", await v.p.waitForFunction(() => (document.activeElement as HTMLElement | null)?.innerText?.startsWith("(change)"), null, { timeout: 3_000 }).then(() => true, () => false), await v.p.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)));
      }
      await v.p.getByRole("button", { name: new RegExp(`^Monday 26 October, ${["09", "10", "11"][[360, 375, 1024].indexOf(width)]}:00`) }).click();
      await small(v.p, "details"); await shot(v.p, `details-${width}`); if (width === 360) await axe("details (360)", v.p);
      await fill(v.p, { email: `w${width}.${run}@example.org`, phone: "+971 50 000 0000" }); await book(v.p);
      ok(`FO-3w J-P9 booked at ${width} px by phone call, "The firm will call you on +971 50 000 0000."`, (await mainText(v.p)).includes("The firm will call you on +971 50 000 0000."), await mainText(v.p));
      await small(v.p, "confirmation"); await shot(v.p, `booked-${width}`);
      await v.ctx.close();
    }
  }
  ok("FO-3w DW10: the network log shows no call to any host but the app (no outside fonts, maps or trackers)", outside.length === 0, outside.slice(0, 5));
  ok("FO-3w: no page error in any step", errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close(); for (const a of apps) await a.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
