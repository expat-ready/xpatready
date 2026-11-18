// FO-3w part 2 (brief lead-b-briefs/FO-3w.md part 2; Lead B's QA-496 ruling, #1968 rev 16.68; concept screens/fo-3-booking r2 BR-8..BR-10, §5 "Manage";
// AG-4-36, -37, -38): the booker's manage page in a real browser: J-P6..J-P8, the route order (/book/:firmKey/manage before /book/:firmKey/:slug) and the
// reserved slug "manage", axe on every state, 360 and 1440 px. Two servers, as part 1's suite:
//   * the isolated copy (the real app: its build and its routes) for the route order, through the real router (Q1..Q3);
//   * a server this test holds, on the copy's database: FO-3's real public controller and service, the same web build, a clock the test sets (J-P7's
//     "3 h before", J-P8's "expired"), the mail fake (the email's own link is opened) and no minimum fill time (bookings go through the public API).
// Seeds firm `maple` (Sample) with a phone and a type named "Manage" (slug `manage-2`): since FO-3a 1a (#1918) the database refuses the
// slug `manage` itself (check fo_consultation_type_slug_reserved; its check_fo3a_booking_types.ts DW2, DW11), so no type can stand at that address. US$0, no model.
//   zsh studio/tools/isolated.sh screens_fo3wm 4533 start && tsx studio/tests/check_fo3w_manage_browser.ts 4533 xr_studio_screens_fo3wm
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { fakeArrival } from "../ports/arrival.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";
import { recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const COPY = Number(process.argv[2] ?? 4533), DBNAME = process.argv[3] ?? "xr_studio_screens_fo3wm", HELD = COPY + 300;
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
const BAD = "This link is no longer valid. Please use the link in your latest email, or reply to it.";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// ------------------------------------------------------------------------------------------------------------ set-up
if (await db.platformFirm.findUnique({ where: { key: "maple" } })) { console.error("STOP  firm maple exists: start a fresh copy (isolated.sh … start)"); process.exit(2); }
const M = await db.platformFirm.create({ data: { key: "maple", operatingName: "Maple Immigration", countryCode: "CA", status: "ACTIVE", contactEmail: "hello@maple.example",
  businessAddress: { street_number: "100", street_name: "Sample Street", city: "Toronto", province_state: "ON", postal_code: "M5V 0A1", country: "CA", phone: "+1 416 555 0100" } } });
const F = await db.platformStaff.create({ data: { firmId: M.id, email: "clientf@maple.example", displayName: "Client F" } });
await db.foAvailability.createMany({ data: [1, 2, 3, 4, 5].map((weekday) => ({ firmId: M.id, staffId: F.id, weekday, startMinute: 540, endMinute: 1020, timeZone: TZ })) });
const type = (slug: string, name: string, extra: Record<string, unknown> = {}) =>
  db.foConsultationType.create({ data: { firmId: M.id, slug, name, modes: ["VIDEO"], hostStaffIds: [F.id], minutes: 30, windowDays: 400, meetingLink: "https://meet.example/sample-room", ...extra } });
await type("free-consultation", "Free consultation");
await type("no-cancel", "Reschedule only", { allowCancel: false });
await type("no-change", "Fixed call", { allowCancel: false, allowReschedule: false });
await type("manage-2", "Manage");   // a type named Manage gets manage-2 (FO-3a 1a, #1918, DW2)
let manageRefused = false;
try { await type("manage", "Stored under the reserved word"); } catch (e) { manageRefused = /fo_consultation_type_slug_reserved/.test(String(e)); }
ok("FO-3w part 2 setup: firm maple with a phone, one host Mon-Fri 09-17 Toronto, four types (one named Manage, slug manage-2)", true);
ok("FO-3w QA-496 reserved slug fail side: the database refuses a type stored under the slug manage (FO-3a 1a)", manageRefused);

class SetClock extends FakeClock { shift = 0; override now() { return new Date(Date.now() + this.shift); } async to(d: Date) { this.shift = d.getTime() - Date.now(); } }
const clock = new SetClock(), mail = fakeMail({ clock }), jobs = fakeJobs(clock);
@Module({ controllers: [BookingPublicController] as never[], providers: [Db, Booking, { provide: BOOKING_PORTS, useValue: {
  audit: auditEvent as never, clock, jobs, mail, arrival: fakeArrival(), publicBaseUrl: `http://localhost:${HELD}`,
  limits: { slotsPerIp: 100_000, bookPerIp: 100_000, bookPerFirm: 100_000, tokenPerIp: 100_000, minFillSeconds: 0 } } }] as never[] }) class Held {}
const app = await NestFactory.create<NestExpressApplication>(Held, { logger: ["error"] });
app.useStaticAssets(WEB, { index: false });
app.getHttpAdapter().getInstance().get(/^\/(?!api\/).*/, (_q: unknown, res: { sendFile(p: string): void }) => res.sendFile(join(WEB, "index.html")));
await app.init(); await app.listen(HELD, "127.0.0.1");
const BASE = `http://localhost:${HELD}`;

const browser: Browser = await chromium.launch({ headless: !process.env.HEADED, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [], outside: string[] = [], queries: string[] = [], consoleLines: string[] = [];
async function visitor(width = 1440): Promise<{ p: Page; ctx: BrowserContext }> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: "Asia/Dubai", colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => consoleLines.push(m.text()));
  p.on("request", (r) => { const u = new globalThis.URL(r.url()); if (!["data:", "blob:"].includes(u.protocol) && !/^localhost:\d+$/.test(u.host)) outside.push(r.url()); if (u.pathname.startsWith("/api/")) queries.push(u.search); });
  await p.clock.install({ time: clock.now() }); await p.clock.resume();
  return { p, ctx };
}
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const axe = async (name: string, p: Page) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze(); const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`FO-3w DW10 manage ${name}: axe finds no serious or critical finding`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `fo3w-manage-${name}.png`), fullPage: true });
const mainText = async (p: Page) => (await p.locator("main").innerText()).replace(/\s+/g, " ");
const open = async (p: Page, url: string) => { await p.goto("about:blank"); await p.goto(url);   // a full load, as from an email
  await p.locator("main h1").first().waitFor({ timeout: 30_000 }); await p.waitForFunction(() => !document.querySelector("[data-loading]"), null, { timeout: 15_000 }); };
/** No id in the page text, or in the address outside the fragment (the fragment is the email's token itself, whose first
 *  part is FO-3's token key: never sent to a server but in the API path, never shown). */
const noId = async (p: Page) => !UUID.test(await p.locator("body").innerText()) && !UUID.test(p.url().replace(/#.*/, ""));

/** Books through the public door and returns the answer's token and the email's manage link (the mail fake). */
let n = 0;
async function booking(slug: string, when: string, base = BASE) {
  const email = `client.b${++n}@example.org`, from = at(when), to = new Date(from.getTime() + 86_400_000);
  const s = await (await fetch(`${base}/api/public/firms/maple/book/${slug}/slots?from=${from.toISOString()}&to=${to.toISOString()}`)).json() as { formStamp: string };
  if (base !== BASE) await new Promise((r) => setTimeout(r, 3_200));   // the real app keeps its minimum fill time (AG-4-20 rule 3)
  const r = await fetch(`${base}/api/public/firms/maple/book/${slug}/bookings`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ givenNames: "Client B", familyName: "Sample", email, mode: "VIDEO", startsAt: from.toISOString(), timeZone: "Asia/Dubai", formStamp: s.formStamp }) });
  const body = await r.json() as { manageToken: string };
  if (r.status !== 201) throw new Error(`booking ${slug} ${when}: ${r.status} ${JSON.stringify(body)}`);
  await jobs.runDue();
  const link = /To reschedule or cancel: (\S+)/.exec(mail.sent.filter((m) => m.to === email).at(-1)?.text ?? "")?.[1];
  return { key: body.manageToken, link: link ?? "", email };
}
const latestLink = (email: string) => /To reschedule or cancel: (\S+)/.exec(mail.sent.filter((m) => m.to === email).at(-1)?.text ?? "")?.[1] ?? "";

try {
  // ----------------------------------------------------------------------------- QA-496: route order and reserved slug
  {
    const src = readFileSync(join(STUDIO, "web", "src", "modules", "front-office", "routes.tsx"), "utf8");
    const iManage = src.indexOf('path: "/book/:firmKey/manage"'), iSlug = src.indexOf('path: "/book/:firmKey/:slug"');
    ok("FO-3w QA-496 route order: /book/:firmKey/manage is declared before /book/:firmKey/:slug in routes.tsx", iManage > 0 && iSlug > iManage, { iManage, iSlug });
    await clock.to(new Date());
    const real = await booking("free-consultation", "2027-01-12 10:00", `http://localhost:${COPY}`);
    const { p, ctx } = await visitor();
    await open(p, `http://localhost:${COPY}/book/maple/manage#${real.key}`);
    const t = await mainText(p);
    ok("FO-3w QA-496 route order pass: on the real app /book/maple/manage#<token> opens the manage page (not \"This page is not available.\")", (await p.locator('[data-public-state="manage"]').count()) === 1 && t.includes("Your booking: Tuesday 12 January, 19:00 Asia/Dubai time, with Maple Immigration."), t);
    await open(p, `http://localhost:${COPY}/book/maple/manage`);
    ok("FO-3w QA-496 reserved slug: with a type named Manage (slug manage-2), /book/maple/manage is still the manage page (no token → the bad-link text), never that type", (await mainText(p)) === BAD && !(await mainText(p)).includes("Choose a time"), await mainText(p));
    await open(p, `http://localhost:${COPY}/book/maple/free-consultation`);
    ok("FO-3w QA-496 fail side: a type's own address still opens its type page", (await p.getByRole("heading", { name: "Choose a time" }).count()) === 1);
    await ctx.close();
  }
  // ------------------------------------------------------------------------------------------------------------- J-P6
  {
    await clock.to(at("2026-10-16 09:00"));
    const b = await booking("free-consultation", "2026-10-20 14:00");
    ok("FO-3w J-P6: the booking email carries /book/maple/manage#<its own token> (one token per email, AG-4-36 rule 1)", b.link.startsWith(`${BASE}/book/maple/manage#`) && b.link.length > `${BASE}/book/maple/manage#`.length + 20, b.link.replace(/#.*/, "#…"));
    const { p, ctx } = await visitor();
    await open(p, b.link);
    const v = await mainText(p);
    ok("FO-3w J-P6 pass (BR-8, AG-4-36): the email link shows \"Your booking: Tuesday 20 October, 22:00 Asia/Dubai time, with Maple Immigration.\" with Reschedule and Cancel",
      v.includes("Your booking: Tuesday 20 October, 22:00 Asia/Dubai time, with Maple Immigration.") && v.includes("Free consultation, 30 minutes, Video call")
      && (await p.getByRole("button", { name: "Reschedule" }).count()) === 1 && (await p.getByRole("button", { name: "Cancel", exact: true }).count()) === 1, v);
    await axe("view (1440)", p); await shot(p, "view-1440");
    await p.getByRole("button", { name: "Reschedule" }).click(); await p.getByRole("heading", { name: "Choose a new time" }).waitFor();
    await p.locator("[data-move] [role=radio]").first().waitFor({ timeout: 15_000 });
    ok("FO-3w J-P6: Choose a new time lists the same type's times in the booking's zone, not the booking's own time", (await p.getByRole("radio", { name: "Tuesday 20 October, 22:00 Asia/Dubai time" }).count()) === 0 && (await p.getByRole("button", { name: "Move to this time" }).isDisabled()), await mainText(p));
    await axe("choose a new time", p); await shot(p, "move-1440");
    await p.getByRole("radio", { name: "Wednesday 21 October, 19:00 Asia/Dubai time" }).click();
    await p.getByRole("button", { name: "Move to this time" }).dblclick();
    await p.locator("[data-updated]").waitFor({ timeout: 15_000 });
    const after = await mainText(p), row = await db.foBooking.findFirstOrThrow({ where: { firmId: M.id, startsAt: at("2026-10-21 11:00") } });
    const movedKey = decodeURIComponent(new globalThis.URL(p.url()).hash.slice(1)); await jobs.runDue();
    ok("FO-3w J-P6 pass (AG-4-38): Move → \"Booking updated. We have sent a new email; links in older emails no longer work.\", the card shows the new time, the row moved once",
      after.includes("Booking updated. We have sent a new email; links in older emails no longer work.") && after.includes("Your booking: Wednesday 21 October, 19:00 Asia/Dubai time") && row.status === "RESCHEDULED" && row.sequence === 1
      && (await db.foBooking.count({ where: { firmId: M.id, startsAt: at("2026-10-20 14:00") } })) === 0, after);
    ok("FO-3w J-P6: the address now carries the move's new token, and \"Booking updated\" brought a newer email link", movedKey !== b.key && movedKey.length > 20 && !b.link.endsWith(movedKey) && latestLink(b.email) !== b.link && latestLink(b.email).startsWith(`${BASE}/book/maple/manage#`), { url: p.url().replace(/#.*/, "#…") });
    await axe("updated", p); await shot(p, "updated-1440");
    // AG-4-36 §11 "V1.5 bug 5": a booking already rescheduled once can be rescheduled again by the newest link.
    await p.getByRole("button", { name: "Reschedule" }).click(); await p.locator("[data-move] [role=radio]").first().waitFor({ timeout: 15_000 });
    await p.getByRole("radio", { name: "Wednesday 28 October, 18:00 Asia/Dubai time" }).click(); await p.getByRole("button", { name: "Move to this time" }).click();
    await p.waitForFunction(() => document.querySelector("[data-when]")?.textContent?.includes("Wednesday 28 October, 18:00"), null, { timeout: 15_000 });
    const twice = await db.foBooking.findUniqueOrThrow({ where: { id: row.id } });
    ok("FO-3w J-P6 pass (AG-4-36 §11, bug 5): rescheduled once, the newest link reschedules again", twice.status === "RESCHEDULED" && twice.sequence === 2 && twice.startsAt.toISOString() === at("2026-10-28 10:00").toISOString() && (await p.locator("[data-updated]").count()) === 1, { status: twice.status, sequence: twice.sequence });
    await p.getByRole("button", { name: "Cancel", exact: true }).click(); await p.getByRole("dialog").waitFor();
    ok("FO-3w J-P6: Cancel asks \"Cancel this booking?\" with \"Reason (optional)\", \"Cancel booking\" and \"Keep booking\"", (await p.getByRole("dialog").innerText()).includes("Cancel this booking?") && (await p.getByLabel("Reason (optional)").count()) === 1 && (await p.getByRole("button", { name: "Keep booking" }).count()) === 1);
    await axe("cancel dialog", p); await shot(p, "cancel-dialog-1440");
    await p.getByRole("button", { name: "Keep booking" }).click();
    ok("FO-3w J-P6 fail side: Keep booking changes nothing", (await db.foBooking.findUniqueOrThrow({ where: { id: row.id } })).status === "RESCHEDULED" && (await p.getByRole("dialog").count()) === 0);
    // A pasted reason with a tab and a right-to-left mark (break M1): sent as the API takes it, never refused without a word.
    const typed = "Moving to another city,\tSample reason\u200f", reason = "Moving to another city, Sample reason";
    await p.getByRole("button", { name: "Cancel", exact: true }).click(); await p.getByLabel("Reason (optional)").fill(typed);
    ok("FO-3w J-P6: the reason box takes at most 500 characters", (await p.getByLabel("Reason (optional)").getAttribute("maxlength")) === "500");
    await p.getByRole("button", { name: "Cancel booking" }).click();
    await p.locator('[data-public-state="cancelled"]').waitFor({ timeout: 15_000 });
    const gone = await db.foBooking.findUniqueOrThrow({ where: { id: row.id } }), done = await mainText(p);
    ok("FO-3w J-P6 pass: Cancel on the same page works with the new token → \"Your booking is cancelled. We have sent you an email.\"", gone.status === "CANCELLED" && done.includes("Your booking is cancelled. We have sent you an email."), done);
    ok("FO-3w J-P6 (break M1): the reason, its tab and mark cleaned, was sent and kept on the booking, and is never shown back", (gone as { cancelReason?: string | null }).cancelReason === reason && !done.includes(reason) && !(await p.locator("body").innerText()).includes(reason));
    await axe("cancelled", p); await shot(p, "cancelled-1440");
    await p.evaluate((h) => { window.location.hash = h; }, new globalThis.URL(b.link).hash.slice(1)); await p.locator('[data-public-state="bad-link"]').waitFor({ timeout: 15_000 });
    ok("FO-3w J-P6: an older link opened into the same tab (only the # changes) is read again → the bad-link text", (await mainText(p)) === BAD, await mainText(p));
    await open(p, b.link);
    ok("FO-3w J-P6 fail (AG-4-38 rule 3): the old link (from before the move) shows the bad-link text", (await mainText(p)) === BAD, await mainText(p));
    await open(p, `${BASE}/book/maple/manage#${movedKey}`);
    ok("FO-3w J-P8 fail (AG-4-36 rule 3): a cancelled booking's link shows the same bad-link text", (await mainText(p)) === BAD, await mainText(p));
    await axe("bad link", p); await shot(p, "bad-link-1440");
    await ctx.close();
  }
  // Two tabs, one link: the second move gets the bad-link text (AG-4-36 §12).
  {
    const b = await booking("free-consultation", "2026-10-22 10:00");
    const one = await visitor(), two = await visitor();
    await open(one.p, b.link); await open(two.p, b.link);
    for (const t of [one.p, two.p]) { await t.getByRole("button", { name: "Reschedule" }).click(); await t.locator("[data-move] [role=radio]").first().waitFor({ timeout: 15_000 }); }
    await one.p.getByRole("radio", { name: "Thursday 22 October, 20:00 Asia/Dubai time" }).click(); await one.p.getByRole("button", { name: "Move to this time" }).click(); await one.p.locator("[data-updated]").waitFor();
    await two.p.getByRole("radio", { name: "Thursday 22 October, 21:00 Asia/Dubai time" }).click(); await two.p.getByRole("button", { name: "Move to this time" }).click();
    await two.p.locator('[data-public-state="bad-link"]').waitFor({ timeout: 15_000 });
    ok("FO-3w J-P6 fail (AG-4-36 §12): a second tab moving with the old token gets the bad-link text, and the booking keeps the first move", (await mainText(two.p)) === BAD
      && (await db.foBooking.findFirstOrThrow({ where: { firmId: M.id, startsAt: at("2026-10-22 12:00") } })).status === "RESCHEDULED");
    await one.ctx.close(); await two.ctx.close();
  }
  // Slot taken between choosing and moving: the sentence, fresh times, the booking unmoved.
  {
    const b = await booking("free-consultation", "2026-10-23 10:00");
    const { p, ctx } = await visitor();
    await open(p, b.link); await p.getByRole("button", { name: "Reschedule" }).click(); await p.locator("[data-move] [role=radio]").first().waitFor({ timeout: 15_000 });
    await p.getByRole("radio", { name: "Friday 23 October, 22:00 Asia/Dubai time" }).click();
    await booking("free-consultation", "2026-10-23 14:00");   // someone else takes 14:00 Toronto first
    await p.getByRole("button", { name: "Move to this time" }).click(); await p.locator('[data-notice="taken"]').waitFor({ timeout: 15_000 });
    const t = await mainText(p);
    ok("FO-3w J-P6 fail (AG-4-26): the time taken a moment ago → \"This time was just booked.\" and \"Please choose another time.\", that time gone from the list, the booking unmoved",
      t.includes("This time was just booked.") && t.includes("Please choose another time.") && (await p.getByRole("radio", { name: "Friday 23 October, 22:00 Asia/Dubai time" }).count()) === 0
      && (await db.foBooking.count({ where: { firmId: M.id, startsAt: at("2026-10-23 10:00"), status: "SCHEDULED" } })) === 1, t);
    await axe("time taken", p);
    await ctx.close();
  }
  // Break M2: a move's or a cancel's answer is lost, though the change was made: "check the email", never "try again".
  {
    await clock.to(at("2026-10-16 09:00"));
    const b = await booking("free-consultation", "2026-10-19 10:00"), c = await booking("free-consultation", "2026-10-19 15:00");
    const { p, ctx } = await visitor();
    await open(p, b.link); await p.getByRole("button", { name: "Reschedule" }).click(); await p.locator("[data-move] [role=radio]").first().waitFor({ timeout: 15_000 });
    await p.route("**/reschedule", async (rt) => { await rt.fetch(); await rt.abort("failed"); }, { times: 1 });
    await p.getByRole("radio", { name: "Monday 19 October, 20:00 Asia/Dubai time" }).click(); await p.getByRole("button", { name: "Move to this time" }).click();
    await p.locator('[data-notice="lost"]').waitFor({ timeout: 15_000 });
    ok("FO-3w (break M2): a move made but its answer lost → \"We could not confirm your change. Please check your latest email from the firm.\", no buttons, the booking moved",
      (await mainText(p)).includes("We could not confirm your change. Please check your latest email from the firm.") && !(await mainText(p)).includes("try again") && (await p.locator("main button").count()) === 0
      && (await db.foBooking.count({ where: { firmId: M.id, startsAt: at("2026-10-19 12:00"), status: "RESCHEDULED" } })) === 1, await mainText(p));
    await open(p, c.link);
    await p.route("**/cancel", async (rt) => { await rt.fetch(); await rt.abort("failed"); }, { times: 1 });
    await p.getByRole("button", { name: "Cancel", exact: true }).click(); await p.getByRole("button", { name: "Cancel booking" }).click();
    await p.locator('[data-notice="lost"]').waitFor({ timeout: 15_000 });
    ok("FO-3w (break M2): a cancel made but its answer lost → the same sentence, no buttons", (await p.locator("main button").count()) === 0 && (await db.foBooking.count({ where: { firmId: M.id, startsAt: at("2026-10-19 15:00"), status: "CANCELLED" } })) === 1, await mainText(p));
    await p.route("**/reschedule", (rt) => rt.abort("failed"), { times: 1 });
    const d = await booking("free-consultation", "2026-10-19 16:00");
    await open(p, d.link); await p.getByRole("button", { name: "Reschedule" }).click(); await p.locator("[data-move] [role=radio]").first().waitFor({ timeout: 15_000 });
    await p.getByRole("radio", { name: "Tuesday 20 October, 17:00 Asia/Dubai time" }).click(); await p.getByRole("button", { name: "Move to this time" }).click();
    await p.locator('[data-notice="error"]').waitFor({ timeout: 15_000 });
    ok("FO-3w (break M2) fail side: a move that never reached the firm → \"We could not make this change. Please try again.\", the times still offered", (await mainText(p)).includes("We could not make this change. Please try again.") && (await p.getByRole("button", { name: "Move to this time" }).count()) === 1, await mainText(p));
    await ctx.close();
  }
  // ------------------------------------------------------------------------------------------------------------- J-P7
  {
    await clock.to(at("2026-10-16 09:00"));
    const b = await booking("free-consultation", "2026-10-26 13:00"), nc = await booking("no-cancel", "2026-10-27 13:00"), fx = await booking("no-change", "2026-10-28 13:00");
    await clock.to(at("2026-10-26 10:00"));   // 3 h before the start
    const { p, ctx } = await visitor();
    await open(p, b.link);
    const t = await mainText(p);
    ok("FO-3w J-P7 pass (BR-9, AG-4-37 rule 5): 3 h before the start → \"It is less than 4 hours before your meeting. Please reply to this email or call us on +1 416 555 0100.\", no buttons",
      t.includes("It is less than 4 hours before your meeting. Please reply to this email or call us on +1 416 555 0100.") && (await p.locator("main button").count()) === 0, t);
    await axe("inside the limit", p); await shot(p, "limit-1440");
    await clock.to(at("2026-10-26 08:00"));   // 5 h before: open again
    await open(p, b.link);
    ok("FO-3w J-P7 fail side: 5 h before the start → Reschedule and Cancel", (await p.getByRole("button", { name: "Reschedule" }).count()) === 1 && (await p.getByRole("button", { name: "Cancel", exact: true }).count()) === 1);
    // The limit passes while the page is open: the next action shows the limit text (BR-8).
    await clock.to(at("2026-10-26 09:30"));
    await p.getByRole("button", { name: "Cancel", exact: true }).click(); await p.getByRole("button", { name: "Cancel booking" }).click();
    await p.locator('[data-notice="closed"]').waitFor({ timeout: 15_000 });
    ok("FO-3w J-P7 (BR-8): the limit passes while the page is open → Cancel shows the limit sentence, the buttons go, the booking stays", (await mainText(p)).includes("It is less than 4 hours before your meeting.") && (await p.locator("main button").count()) === 0
      && (await db.foBooking.count({ where: { firmId: M.id, startsAt: at("2026-10-26 13:00"), status: "SCHEDULED" } })) === 1, await mainText(p));
    await clock.to(at("2026-10-16 09:00"));
    await open(p, nc.link);
    const c = await mainText(p);
    ok("FO-3w J-P7 fail (AG-4-37 rule 4): allowCancel false → \"This booking cannot be changed online. Please reply to your confirmation email.\", no Cancel (Reschedule stays)",
      c.includes("This booking cannot be changed online. Please reply to your confirmation email.") && (await p.getByRole("button", { name: "Cancel", exact: true }).count()) === 0 && (await p.getByRole("button", { name: "Reschedule" }).count()) === 1, c);
    await axe("no cancel", p);
    await open(p, fx.link);
    ok("FO-3w J-P7 fail: allowReschedule and allowCancel false → the same sentence and no buttons", (await mainText(p)).includes("This booking cannot be changed online.") && (await p.locator("main button").count()) === 0, await mainText(p));
    await ctx.close();
  }
  // ------------------------------------------------------------------------------------------------------------- J-P8
  {
    await clock.to(at("2026-10-16 09:00"));
    const b = await booking("free-consultation", "2026-10-29 10:00");
    const { p, ctx } = await visitor();
    await clock.to(at("2026-10-29 10:31"));   // the meeting has ended: every token has expired (AG-4-36 rule 2)
    const texts: string[] = [];
    for (const h of [b.link, `${BASE}/book/maple/manage#not-a-real-token`, `${BASE}/book/maple/manage#${"x".repeat(43)}`, `${BASE}/book/maple/manage`, `${BASE}/book/maple/manage#`]) { await open(p, h); texts.push(await mainText(p)); }
    ok("FO-3w J-P8 pass (BR-10, AG-4-36 rule 9): an expired, garbage, well-shaped or missing token → the one bad-link text", texts.every((t) => t === BAD), texts);
    ok("FO-3w J-P8 (BR-2): no id appears in the page's text or address", await noId(p));
    await clock.to(at("2026-10-16 09:00"));
    const v = await visitor(360), c = await booking("free-consultation", "2026-10-30 10:00");
    await open(v.p, c.link);
    ok("FO-3w J-P8: a live link shows no id either", await noId(v.p));
    const tiny = await v.p.evaluate(() => [...document.querySelectorAll<HTMLElement>("main button, main a")].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return { t: e.innerText.trim(), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((r) => r.w < 44 || r.h < 44));
    ok("FO-3w BR-6: at 360 px every manage target is at least 44 × 44 px, no sideways scroll", tiny.length === 0 && await v.p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), tiny);
    await axe("view (360)", v.p); await shot(v.p, "view-360");
    await v.p.getByRole("button", { name: "Reschedule" }).click(); await v.p.locator("[data-move] [role=radio]").first().waitFor({ timeout: 15_000 });
    ok("FO-3w BR-6: the new-time list fits 360 px", await v.p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); await shot(v.p, "move-360");
    // Break M3 (WCAG 2.4.11): Tab through the first 40 times; none is hidden behind the sticky Move bar.
    const hidden: string[] = [];
    await v.p.locator("[data-move] [role=radio]").first().focus();
    for (let i = 0; i < 40; i++) {
      const r = await v.p.evaluate(() => { const a = document.activeElement as HTMLElement, bar = document.querySelector("[data-move-bar]")!.getBoundingClientRect(), e = a.getBoundingClientRect(); return { radio: a.getAttribute("role") === "radio", label: a.getAttribute("aria-label"), hidden: e.top >= bar.top - 1 }; });
      if (!r.radio) break; if (r.hidden) hidden.push(r.label ?? "");
      await v.p.keyboard.press("Tab");
    }
    ok("FO-3w (break M3, WCAG 2.4.11): at 360 px no focused time is hidden behind the sticky Move bar", hidden.length === 0, hidden.slice(0, 3));
    await v.ctx.close(); await ctx.close();
  }
  ok("FO-3w AG-4-36 rule 10: the token never travels in a query string (every API call's query is empty or slots' tz)", queries.every((q) => q === "" || /^\?(from=[^&]+&to=[^&]+&)?tz=[^&]+$|^\?from=[^&]+&to=[^&]+$/.test(q)), queries.filter((q) => q !== "").slice(0, 5));
  ok("FO-3w AG-4-36 rule 10: no token is written to the browser console", !consoleLines.some((l) => /[A-Za-z0-9_-]{20,}/.test(l)), consoleLines.slice(0, 3));
  ok("FO-3w DW10 manage: the network log shows no call to any host but the app", outside.length === 0, outside.slice(0, 5));
  ok("FO-3w manage: no page error in any step", errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close(); await app.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
