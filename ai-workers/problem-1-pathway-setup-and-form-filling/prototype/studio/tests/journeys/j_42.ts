// J-42 (map row 42, R1.42: reschedule or cancel by link; outcomes; consult record): the join-and-walk row (BACKLOG J-42;
// Lead 7's ask, 20 Nov). It adds no feature: it walks FO-3w part 2's manage page (the booker's single-use link), FO-3st1
// part 1's booking detail (attendance) and part 2's consult record panel and next-step button, on an isolated copy of the running app
// (its own database and port, never :4400), on the real clock, at 1440 px.
//   W0: an Admin adds the type on Settings → Booking types (FO-3st3 part 3a), previews it as a booker, and sets its own
//       timings under Advanced (FO-3st3b): no shortest notice, a 1-hour self-service limit;
//   W1: booker A books a time about 90 minutes ahead and booker B the next free time (minutes away), on the public page;
//   W2: A's link reschedules inside the firm's notice rule (the 60-minute self-service limit): "Booking updated";
//   W3: A's first link is refused once used (the single-use link): "This link is no longer valid. …";
//   W4: A cancels on the same page with the new link: "Your booking is cancelled. …";
//   W5: B's link, inside the limit, is refused in words ("It is less than 1 hour before your meeting. …"), no buttons;
//   W6: once B's meeting has ended, B's link is refused as expired (the same bad-link words);
//   W7: B's host signs in, opens B on the staff booking detail and answers Attended (one click): the booking is COMPLETED
//       and one audit line names the host and the time;
//   W8: the host records the consult on the booking detail's Consult record panel (FO-3st1 part 2): time spent starts at
//       the booked length; a fee with no currency is refused in the concept's words (J-S6) and nothing is stored; then
//       notes, a recommended item and a CAD fee are saved ("Saved"): stored with who and when, one audit line without the
//       notes' text; a quoted fee in EUR is still refused by the route (422, on quotedFeeCurrency);
//   W9: row 53's first step: the panel's Next step offers "Engage and prepare retainer" (B hangs on a lead, the host has
//       agent/retainer:draft); it opens FO-4's Engage panel on B's lead page, and Engage as Individual starts the prospect.
//       FO-5's retainer draft screen (FO-5s) is not on main, so the walk ends at the prospect (NOTE line).
//   DW1: the manage link travels by the real sending path: A's confirmation and the reschedule's new mail are msg_outbox
//        rows SENT or DELIVERED by the local adapter, read back from the copy's demo inbox (fakeMail wrote no row).
//   DW2: the attendance answer and the consult record are database rows with audit_event lines (the in-memory audit fake
//        wrote no row).
// The real clock, no seam: the test's own consultation type has Sample settings a firm may choose: no shortest notice
// (default 240), times every 5 minutes, a 60-minute self-service limit (default 240), 5-minute meetings (the shortest),
// and its one host works every hour of every day; so B's meeting starts and ends within about 15 minutes and the walk
// waits for its end. Setup a person cannot do through the product yet (firm, host, hours, the type's 5-minute interval) is written straight to the
// copy's database (Sample rows). Sample values only; US$0, no model call. About 11 to 14 minutes.
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j42 4442 start --ttl 40 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j42 4442 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_42.ts j42 4442
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { platformAuditWorkspaceId } from "../../api/src/platform/audit/audit-event.ts";
import { CLOSED_DAYS, TIME_ZONE, writeSetting } from "../../api/src/platform/settings.ts";
import { recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j42", Number(process.argv[3] ?? 4442)];
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-42", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/xr_studio_${NAME}`, options: "-c TimeZone=UTC" }) });
const ZONE = "America/Toronto", MIN = 60_000, PHONE = "+1 416 555 0100";
const BAD = "This link is no longer valid. Please use the link in your latest email, or reply to it.";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
async function call(tok: string | null, method: string, path: string, body?: unknown): Promise<Res> {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body: b };
}

type Mail = { subject: string; body: string; sent_at: string | null };
/** The demo inbox (stand-in SI-20: it has no screen), oldest first, until `want` mails are there or `ms` pass. */
async function inbox(address: string, want: number, ms = 90_000): Promise<Mail[]> {
  const read = async () => { try { const r = await fetch(`${BASE}/api/demo/platform-inbox?address=${encodeURIComponent(address)}`); return r.status === 200 ? ((await r.json()) as { messages: Mail[] }).messages.reverse() : []; } catch { return []; } };
  const t = Date.now(); let got = await read();
  while (got.length < want && Date.now() - t < ms) { await pause(2_000); got = await read(); }
  return got;
}
const linkIn = (m?: Mail) => /To reschedule or cancel: (\S+)/.exec(m?.body ?? "")?.[1] ?? "";
const hide = (s: string) => s.replace(/#\S+/g, "#<token>");
const dayOf = (t: number) => new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, weekday: "long", day: "numeric", month: "long" }).format(t).replace(",", "");
const clockOf = (t: number) => new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t);
const monthOf = (t: number) => new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, month: "long", year: "numeric" }).format(t);
const slotName = (t: number) => `${dayOf(t)}, ${clockOf(t)} ${ZONE} time`;
const mark = (t: number) => Math.ceil(t / (5 * MIN)) * 5 * MIN;

// ------------------------------------------------------------------------------------------------ setup (Sample)
const run = Date.now().toString(36), key = `j42-${run}`;
const firm = await db.platformFirm.create({ data: { key, operatingName: "Sample J-42 firm", countryCode: "CA", status: "ACTIVE", contactEmail: `office-${run}@j42-firm.example`,
  businessAddress: { street_number: "100", street_name: "Sample Street", city: "Toronto", province_state: "ON", postal_code: "M5V 0A1", country: "CA", phone: PHONE } } });
const ws = await platformAuditWorkspaceId(db);
await writeSetting(db, { firmId: firm.id, key: TIME_ZONE.key, value: ZONE, by: "seed:J-42-test", workspaceId: ws, reason: "J-42: the firm's zone, stated" });
await writeSetting(db, { firmId: firm.id, key: CLOSED_DAYS.key, value: [], by: "seed:J-42-test", workspaceId: ws, reason: "J-42: no closed day, stated" });
const host = await db.platformStaff.create({ data: { firmId: firm.id, email: `host-${run}@j42-firm.example`, displayName: "Sample host", status: "ACTIVE" } });
await db.platformRoleGrant.create({ data: { firmId: firm.id, staffId: host.id, role: "CASE_OFFICER", grantedBy: "test:j42" } });
await db.foAvailability.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ firmId: firm.id, staffId: host.id, weekday, startMinute: 0, endMinute: 1440, timeZone: ZONE })) });
const admin = await db.platformStaff.create({ data: { firmId: firm.id, email: `admin-${run}@j42-firm.example`, displayName: "Sample admin", status: "ACTIVE" } });
await db.platformRoleGrant.create({ data: { firmId: firm.id, staffId: admin.id, role: "ADMIN", grantedBy: "test:j42" } });
async function signIn(email: string): Promise<string> {
  const signedIn = await call(null, "POST", "/platform/session/local", { firmKey: key, email, secondStep: true });
  const t = signedIn.body?.token as string | undefined;
  if (!t) throw new Error(`STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local): ${JSON.stringify(signedIn.body)}`);
  const pending = await call(t, "GET", "/platform/me/terms");   // PF-5t: a new person accepts the privacy notice first
  const termIds = ((pending.body?.pending ?? pending.body?.terms ?? []) as { id?: string; versionId?: string }[]).map((x) => x.versionId ?? x.id).filter(Boolean);
  if (termIds.length) await call(t, "POST", "/platform/me/terms/accept", { versionIds: termIds });
  return t;
}
const tok = await signIn(host.email), adminTok = await signIn(admin.email);
const aEmail = `booker-a-${run}@j42-client.example`, bEmail = `booker-b-${run}@j42-client.example`;
console.log(`setup (not through the product): firm ${key} in ${ZONE} (phone ${PHONE}), one host (Case Officer) on every hour, an Admin; the booking type is made in W0 on Settings → Booking types`);

const errors: string[] = [];
const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 150 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
async function pageAs(session: string | null): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: ZONE, locale: "en-GB", colorScheme: "light", reducedMotion: "reduce" });
  if (session) await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, session);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
  return p;
}
/** Full page, except a long list (two weeks of times): the screen as a person sees it. */
const shot = (p: Page, name: string, fullPage = true) => p.screenshot({ path: join(SHOTS, `${name}-1440.png`), fullPage });
const axe = async (p: Page, where: string) => { const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze(); ok(`J-42 ${where}: axe finds no WCAG A/AA violation`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes.length}`)); };
const main = async (p: Page) => (await p.locator("main").innerText()).replace(/\s+/g, " ");
/** A full load, as from an email (a hash change alone keeps the page). */
const open = async (p: Page, url: string) => { await p.goto("about:blank"); await p.goto(url); await p.locator("[data-public-state]").first().waitFor({ timeout: 30_000 }); };
const state = (p: Page) => p.locator("[data-public-state]").first().getAttribute("data-public-state");

/** A person books the first offered time from `aim` on (up to 30 minutes later) on the public page; its time, or 0. */
async function book(p: Page, aim: number, given: string, email: string): Promise<number> {
  await p.goto(`${BASE}/book/${key}`);
  await p.locator("[data-type-card]").first().waitFor({ timeout: 30_000 });
  await p.getByRole("link", { name: "Choose Free consultation" }).click();
  await p.getByRole("heading", { name: "Choose a time" }).waitFor();
  let at = 0;
  for (let t = aim; t <= aim + 30 * MIN && !at; t += 5 * MIN) {
    const heading = p.locator("h2[aria-live]");
    for (let i = 0; i < 2 && (await heading.innerText()) !== monthOf(t); i++) { const before = await heading.innerText(); await p.getByRole("button", { name: "Next month" }).click(); await heading.filter({ hasNotText: before }).waitFor(); }
    await p.locator("[data-loading]").waitFor({ state: "detached" });
    if ((await p.locator("[data-day-times] h3", { hasText: dayOf(t) }).count()) === 0) { await p.getByRole("button", { name: dayOf(t), exact: true }).click(); await p.locator("[data-day-times] h3", { hasText: dayOf(t) }).waitFor(); }
    if ((await p.getByRole("button", { name: slotName(t), exact: true }).count()) === 1) at = t;
  }
  if (!at) return 0;
  await p.getByRole("button", { name: slotName(at), exact: true }).click();
  await p.getByRole("heading", { name: "Your details" }).waitFor();
  await p.getByLabel("Given names").fill(given); await p.getByLabel("Family name").fill("Sample"); await p.getByLabel("Email").fill(email);
  await p.getByRole("button", { name: "Book this time" }).click();   // the form waits out its own minimum fill time
  await p.locator('[data-public-state="booked"], [data-summary]').first().waitFor({ timeout: 30_000 });
  return at;
}

try {
  // ---------------------------------------------------------------------------------------------- W0: the type, by screens (FO-3st3 part 3a)
  const pw = await pageAs(adminTok);
  await pw.goto(`${BASE}/front-office/settings/booking-types`);
  await pw.locator("[data-booking-types]").waitFor({ timeout: 30_000 });
  await pw.getByRole("button", { name: "New booking type" }).click();
  const tp = pw.locator("[data-type-panel]"); await tp.waitFor();
  await tp.getByLabel("Name", { exact: true }).fill("Free consultation"); await tp.getByLabel("Length (minutes)", { exact: true }).fill("5");
  await tp.getByLabel("Sample host").check();
  await pw.getByRole("button", { name: "Save type" }).click();
  await pw.locator('[data-type-row="Free consultation"]').waitFor({ timeout: 15_000 });
  const typeRow = await db.foConsultationType.findFirst({ where: { firmId: firm.id, name: "Free consultation", deletedAt: null } });
  await shot(pw, "W0-booking-types"); await axe(pw, "W0 Settings → Booking types");
  ok("J-42 W0 pass (FO-3st3 part 3a): the Admin adds \"Free consultation\" (5 minutes, video, Sample host) on Settings → Booking types; it is on the firm's booking page",
    !!typeRow && typeRow.minutes === 5 && typeRow.hostStaffIds.includes(host.id) && (await pw.locator('[data-type-row="Free consultation"] [data-on-page]').innerText()) === "Yes", typeRow);
  await pw.getByRole("button", { name: "Free consultation", exact: true }).click(); await tp.waitFor();
  await tp.getByRole("button", { name: "Preview as a booker" }).click();
  const pv = pw.getByRole("dialog", { name: /Preview as a booker/ });
  await pv.locator("[data-preview-day]").first().waitFor({ timeout: 20_000 });
  let pvDays: string[] = [];   // today may be all inside the 4-hour notice; a later day has times (the dialog reads again once it knows the zone)
  for (let i = 0; i < 40 && !pvDays.some((d) => /\d\d:\d\d/.test(d)); i++) { await pause(250); pvDays = await pv.locator("[data-preview-day]").allInnerTexts(); }
  ok("J-42 W0 pass: Preview as a booker shows the type's times for the week without booking (no booking row)", pvDays.some((d) => /\d\d:\d\d/.test(d)) && (await db.foBooking.count({ where: { firmId: firm.id } })) === 0, pvDays.map((d) => d.slice(0, 60)));
  await shot(pw, "W0-preview"); await pw.keyboard.press("Escape"); await pv.waitFor({ state: "hidden" });
  // FO-3st3b: the type's own timings under Advanced, by screens: no shortest notice, a 1-hour self-service limit.
  const timing = async (field: string, label: string, value: string) => {
    const r = tp.locator(`[data-type-timing="${field}"]`);
    await r.getByRole("button", { name: "Change for this type" }).click();
    await tp.getByLabel(`${label} for this type`, { exact: true }).fill(value);
    const answer = pw.waitForResponse((x) => x.url().endsWith(`/booking-types/${typeRow!.id}/timings`) && x.request().method() === "PATCH", { timeout: 15_000 });
    await r.getByRole("button", { name: "Save", exact: true }).click(); await answer;
    await r.locator("[data-type-timing-value]").waitFor();
    return (await r.locator("[data-type-timing-value]").innerText()).trim();
  };
  const notice = await timing("minNoticeMinutes", "Shortest notice (hours)", "0"), selfService = await timing("selfServiceLimitMinutes", "Self-service limit (hours)", "1");
  await shot(pw, "W0-timings");
  const typed = await db.foConsultationType.findUniqueOrThrow({ where: { id: typeRow!.id } });
  ok("J-42 W0 pass (FO-3st3b): under Advanced the Admin sets this type's shortest notice to 0 and its self-service limit to 1 hour; both are the type's own values",
    notice === "0 hours (this type)" && selfService === "1 hour (this type)" && typed.minNoticeMinutes === 0 && typed.selfServiceLimitMinutes === 60, { notice, selfService, db: [typed.minNoticeMinutes, typed.selfServiceLimitMinutes] });
  await pw.context().close();
  // Times every 5 minutes (the slot interval) is not a timing a person sets (AG-4-4's Timings has no interval): Sample set-up.
  console.log("setup (not through the product): the type offers a time every 5 minutes (slot interval, not on the Timings screen)");
  await db.foConsultationType.update({ where: { id: typeRow!.id }, data: { slotIntervalMinutes: 5 } });

  // ---------------------------------------------------------------------------------------------- W1: two bookings
  const pa = await pageAs(null), pb = await pageAs(null);
  const bAt = await book(pb, mark(Date.now() + 4 * MIN), "Ben", bEmail);
  const aAt = await book(pa, mark(Date.now() + 90 * MIN), "Ana", aEmail);
  await shot(pa, "W1-booked"); await axe(pa, "W1 the confirmation");
  const rows = await db.foBooking.findMany({ where: { firmId: firm.id }, select: { id: true, startsAt: true, endsAt: true, staffId: true } });
  const A = rows.find((r) => r.startsAt.getTime() === aAt), B = rows.find((r) => r.startsAt.getTime() === bAt);
  ok(`J-42 W1: A books ${aAt ? slotName(aAt) : "a time ~90 min ahead"} and B ${bAt ? slotName(bAt) : "the next free time"}; two bookings underneath`, !!A && !!B && rows.length === 2, rows.map((r) => r.startsAt));
  if (!A || !B) throw new Error("the two bookings were not made: the walk cannot go on");
  console.log(`NOTE  B's meeting ${B.startsAt.toISOString()}-${B.endsAt.toISOString()}; A's ${A.startsAt.toISOString()}`);

  // ---------------------------------------------------------------------------------------------- W2, DW1: reschedule by A's link
  const aMails = await inbox(aEmail, 1), aLink = linkIn(aMails[0]);
  ok("J-42 W1: A's confirmation carries A's manage link on this copy", aLink.startsWith(`${BASE}/book/${key}/manage#`), hide(aLink));
  const mine = await pageAs(null);
  await open(mine, aLink);
  ok(`J-42 W2: A's link opens A's own page (${slotName(aAt)}) with Reschedule and Cancel (outside the 60-minute limit)`,
    (await state(mine)) === "manage" && (await mine.locator("[data-when]").innerText()).includes(slotName(aAt)) && (await mine.getByRole("button", { name: "Reschedule" }).count()) === 1 && (await mine.getByRole("button", { name: "Cancel", exact: true }).count()) === 1, await main(mine));
  await mine.getByRole("button", { name: "Reschedule" }).click(); await mine.locator("[data-move] [role=radio]").first().waitFor({ timeout: 15_000 });
  let to = 0;
  for (let t = aAt + 10 * MIN; t <= aAt + 40 * MIN && !to; t += 5 * MIN) if ((await mine.getByRole("radio", { name: slotName(t) }).count()) === 1) to = t;
  ok(`J-42 W2: Choose a new time offers a later time (${to ? slotName(to) : "none found 10-40 min after A's"})`, to > 0);
  await shot(mine, "W2-choose-new-time", false); await axe(mine, "W2 choose a new time");
  await mine.getByRole("radio", { name: slotName(to) }).click(); await mine.getByRole("button", { name: "Move to this time" }).click();
  await mine.locator("[data-updated]").waitFor({ timeout: 15_000 });
  const moved = await db.foBooking.findUniqueOrThrow({ where: { id: A.id } });
  await shot(mine, "W2-updated");
  ok(`J-42 W2 pass: A reschedules by link to ${slotName(to)}: "Booking updated. …"; underneath RESCHEDULED at the new time`,
    (await main(mine)).includes("Booking updated. We have sent a new email; links in older emails no longer work.") && moved.status === "RESCHEDULED" && moved.startsAt.getTime() === to, { status: moved.status, at: moved.startsAt });
  const aMails2 = await inbox(aEmail, 2);
  const delivered = (s: string) => s === "SENT" || s === "DELIVERED";
  const out = await db.msgOutbox.findMany({ where: { firmId: firm.id, address: aEmail }, select: { state: true, providerId: true } });
  ok("J-42 DW1: A's confirmation and the reschedule's new mail are outbox rows SENT or DELIVERED by the local adapter, and both reached the demo inbox (fakeMail wrote no row)",
    aMails2.length >= 2 && out.length >= 2 && out.every((o) => delivered(o.state) && !!o.providerId?.startsWith("local:")) && linkIn(aMails2[1]) !== aLink, { inbox: aMails2.map((m) => m.subject), out });

  // ---------------------------------------------------------------------------------------------- W3: the used link
  const old = await pageAs(null);
  await open(old, aLink);
  await shot(old, "W3-used-link"); await axe(old, "W3 the used link");
  ok("J-42 W3 fail: A's first link, once used, is refused in words, with no buttons", (await state(old)) === "bad-link" && (await main(old)).includes(BAD) && (await old.locator("main button").count()) === 0, await main(old));

  // ---------------------------------------------------------------------------------------------- W4: cancel with the new link
  await mine.getByRole("button", { name: "Cancel", exact: true }).click(); await mine.getByRole("dialog").waitFor();
  await mine.getByRole("button", { name: "Cancel booking" }).click();
  await mine.locator('[data-public-state="cancelled"]').waitFor({ timeout: 15_000 });
  await shot(mine, "W4-cancelled");
  ok('J-42 W4 pass: A cancels on the same page: "Your booking is cancelled. …"; underneath CANCELLED',
    (await main(mine)).includes("Your booking is cancelled. We have sent you an email.") && (await db.foBooking.findUniqueOrThrow({ where: { id: A.id } })).status === "CANCELLED");
  await axe(mine, "W4 the cancelled page");
  const newLink = linkIn(aMails2[1]), again = await pageAs(null);
  await open(again, newLink);
  const aMails3 = await inbox(aEmail, 3);
  ok("J-42 W4 fail: after the cancel, the link that cancelled is refused too, and A's cancel mail arrives (AG-4-36)",
    (await state(again)) === "bad-link" && (await main(again)).includes(BAD) && aMails3.length === 3 && /cancel/i.test(aMails3[2].subject), { state: await state(again), inbox: aMails3.map((m) => m.subject) });

  // ---------------------------------------------------------------------------------------------- W5: inside the limit
  const bLink = linkIn((await inbox(bEmail, 1))[0]);
  const late = await pageAs(null);
  await open(late, bLink);
  const lateText = await main(late);
  await shot(late, "W5-inside-limit"); await axe(late, "W5 inside the limit");
  ok(`J-42 W5 fail: B's link inside the 60-minute limit is refused in words ("It is less than 1 hour before your meeting. Please reply to this email or call us on ${PHONE}."), no Reschedule or Cancel`,
    (await state(late)) === "manage" && lateText.includes(`It is less than 1 hour before your meeting. Please reply to this email or call us on ${PHONE}.`) && (await late.locator("main button").count()) === 0, lateText);

  // ---------------------------------------------------------------------------------------------- W6: expired
  const wait = B.endsAt.getTime() + 5_000 - Date.now();
  console.log(`NOTE  waiting ${Math.max(0, Math.round(wait / 1000))} s for B's meeting to end`);
  if (wait > 0) await pause(wait);
  await open(late, bLink);
  await shot(late, "W6-expired");
  ok("J-42 W6 fail: after B's meeting ended, B's link is refused (expired) in the same words, with no buttons", (await state(late)) === "bad-link" && (await main(late)).includes(BAD) && (await late.locator("main button").count()) === 0, await main(late));

  // ---------------------------------------------------------------------------------------------- W7, DW2: attendance on the staff screen
  const staff = await pageAs(tok);
  await staff.goto(`${BASE}/front-office/bookings/${B.id}`);
  await staff.locator("[data-booking-detail]").waitFor({ timeout: 30_000 });
  const asked = await staff.locator("[data-booking-detail]").innerText();
  await shot(staff, "W7-attendance-asked"); await axe(staff, "W7 the booking detail");
  ok("J-42 W7: the host opens B on the booking detail, which asks whether Ben attended (Attended, No-show)", /Did .*attend\?/.test(asked) && (await staff.getByRole("button", { name: "Attended" }).count()) === 1 && (await staff.getByRole("button", { name: "No-show" }).count()) === 1, asked.slice(0, 300));
  const before = Date.now();
  await staff.getByRole("button", { name: "Attended" }).click();
  await staff.locator('[data-attendance] button[aria-pressed="true"]').waitFor({ timeout: 15_000 });
  await shot(staff, "W7-attended");
  const bRow = await db.foBooking.findUniqueOrThrow({ where: { id: B.id } });
  const attLines = await db.auditEvent.findMany({ where: { firmId: firm.id, entity: "fo_booking", entityKey: B.id, action: "booking.completed" } });
  ok("J-42 W7 pass / DW2: one click saves Attended: B is COMPLETED, with one audit line naming the host and the time",
    bRow.status === "COMPLETED" && attLines.length === 1 && attLines[0].actor.includes(host.id) && attLines[0].at.getTime() >= before - 5_000, { status: bRow.status, lines: attLines.map((l) => [l.actor, l.at]) });

  // ---------------------------------------------------------------------------------------------- W8, DW2: the consult record panel
  const form = staff.locator(`[data-consult-record="${B.id}"]`);
  await form.waitFor({ timeout: 15_000 });
  const booked = Math.round((B.endsAt.getTime() - B.startsAt.getTime()) / MIN);
  ok(`J-42 W8: after Attended the booking detail shows the Consult record, time spent pre-filled with the booked length (${booked} min), CAD pre-filled, and no next step before a save`,
    (await staff.getByLabel("Time spent (minutes)").inputValue()) === String(booked) && (await staff.getByLabel("Currency").inputValue()) === "CAD" && (await staff.locator("[data-next-step]").count()) === 0);
  await shot(staff, "W8-consult-record-empty"); await axe(staff, "W8 the consult record");
  await staff.getByLabel("Quoted fee (optional)").fill("1500"); await staff.getByLabel("Currency").selectOption("");
  await staff.getByRole("button", { name: "Save record" }).click();
  await staff.getByText("Choose a currency for the quoted fee.").waitFor({ timeout: 5_000 });
  ok('J-42 W8 fail (J-S6): a fee with no currency is refused in words ("Choose a currency for the quoted fee."), only CAD and USD are offered, and nothing is stored',
    (await db.foConsultRecord.count({ where: { bookingId: B.id } })) === 0 && JSON.stringify(await staff.getByLabel("Currency").locator("option").allInnerTexts()) === JSON.stringify(["Choose", "CAD", "USD"]));
  const note = "Sample: has a job offer; next, an employer check.";
  await staff.getByLabel("Currency").selectOption("CAD");
  await staff.getByLabel("Notes (optional)").fill(note);
  await staff.getByLabel("Recommended item").fill("Express Entry assessment"); await staff.getByRole("button", { name: "+ Add" }).click();
  await staff.getByRole("button", { name: "Save record" }).click();
  await staff.locator("[data-consult-saved]").waitFor({ timeout: 15_000 });
  await staff.locator("[data-next-step]").waitFor({ timeout: 15_000 });
  const rec = await db.foConsultRecord.findFirst({ where: { firmId: firm.id, bookingId: B.id } });
  const recLines = await db.auditEvent.findMany({ where: { firmId: firm.id, entity: "fo_consult_record" } });
  await shot(staff, "W8-consult-record-saved"); await axe(staff, "W8 the saved record and its next step");
  ok("J-42 W8 pass / DW2: Save record says \"Saved\"; the record is stored as typed (minutes, note, item, 1,500.00 CAD) with who (created and updated by the host) and when, and one audit line names the host without the notes' text",
    rec?.notes === note && rec.timeSpentMinutes === booked && JSON.stringify(rec.recommended) === JSON.stringify(["Express Entry assessment"]) && rec.quotedFeeMinor === 150000 && rec.quotedFeeCurrency === "CAD"
    && rec.createdBy.includes(host.id) && rec.updatedBy.includes(host.id) && rec.createdAt.getTime() >= before - 5_000
    && recLines.length === 1 && recLines[0].action === "booking.consult_record.created" && recLines[0].actor.includes(host.id) && !JSON.stringify(recLines[0].detail).includes(note),
    { rec, lines: recLines.map((l) => [l.action, l.actor]) });
  const eur = await call(tok, "PUT", `/front-office/bookings/${B.id}/consult-record`, { quotedFeeMinor: 1000, quotedFeeCurrency: "EUR", version: rec?.version });
  ok("J-42 W8 (route) fail: a quoted fee in EUR is refused (422, on quotedFeeCurrency) and the record is unchanged", eur.status === 422 && JSON.stringify(eur.body?.issues ?? "").includes("quotedFeeCurrency") && (await db.foConsultRecord.findFirstOrThrow({ where: { id: rec?.id } })).quotedFeeCurrency === "CAD", eur);

  // ---------------------------------------------------------------------------------------------- W9: the next-step button (row 53's first step)
  const steps = await staff.locator("[data-next-step] button").allInnerTexts();
  const mailsBefore = await db.msgOutbox.count({ where: { firmId: firm.id, address: bEmail } });
  ok('J-42 W9: the Next step offers "Engage and prepare retainer" (B hangs on a lead; the host may draft retainers)', steps.includes("Engage and prepare retainer"), steps);
  await staff.getByRole("button", { name: "Engage and prepare retainer" }).click();
  const engagePanel = staff.getByRole("dialog", { name: "Engage" });
  await engagePanel.waitFor({ timeout: 15_000 });
  ok("J-42 W9: the button opens FO-4's Engage panel on B's lead page (the address carries no engage flag once open)", /\/front-office\/leads\/[0-9a-f-]+$/.test(new URL(staff.url()).pathname) && !staff.url().includes("engage=1"), staff.url());
  await shot(staff, "W9-engage-panel");
  await staff.getByRole("button", { name: "Engage as Individual" }).click();
  await staff.waitForURL(/\/front-office\/prospects\//, { timeout: 15_000 });
  const prospects = await db.foProspect.findMany({ where: { firmId: firm.id } });
  await shot(staff, "W9-prospect");
  ok("J-42 W9 pass: Engage as Individual starts one prospect for B and opens it; nothing is sent to B on the way (BR-16)",
    prospects.length === 1 && staff.url().endsWith(prospects[0].id) && (await db.msgOutbox.count({ where: { firmId: firm.id, address: bEmail } })) === mailsBefore, { url: staff.url(), prospects: prospects.length });
  console.log("NOTE  J-42 W9: the retainer step goes on in FO-5's draft screen (FO-5s, R1.53's own row), not on main; the walk ends at the prospect it starts from");
  ok("J-42: no page error in any browser during the walk", errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
