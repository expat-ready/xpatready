// J-42 (map row 42, R1.42: reschedule or cancel by link; outcomes; consult record): the join-and-walk row (BACKLOG J-42;
// Lead 7's ask, 20 Nov). It adds no feature: it walks FO-3w part 2's manage page (the booker's single-use link), FO-3st1
// part 1's booking detail (attendance) and FO-3a part 2a's consult record route, on an isolated copy of the running app
// (its own database and port, never :4400), on the real clock, at 1440 px.
//   W1: booker A books a time about 90 minutes ahead and booker B the next free time (minutes away), on the public page;
//   W2: A's link reschedules inside the firm's notice rule (the 60-minute self-service limit): "Booking updated";
//   W3: A's first link is refused once used (the single-use link): "This link is no longer valid. …";
//   W4: A cancels on the same page with the new link: "Your booking is cancelled. …";
//   W5: B's link, inside the limit, is refused in words ("It is less than 1 hour before your meeting. …"), no buttons;
//   W6: once B's meeting has ended, B's link is refused as expired (the same bad-link words);
//   W7: B's host signs in, opens B on the staff booking detail and answers Attended (one click): the booking is COMPLETED
//       and one audit line names the host and the time;
//   W8: the host records the outcome and a note in the consult record: stored with who and when, one audit line.
//       GAP: the consult record has no screen on main (detail-panel.tsx: "Part 2 adds the consult record and the next
//       step"), so W8 is walked through the route the screen will call, with the host's own session; the line "W8 screen"
//       reports the missing screen and the walk cannot reach row 53's first step (the next-step button). Question for the
//       tech lead on the PR.
//   DW1: the manage link travels by the real sending path: A's confirmation and the reschedule's new mail are msg_outbox
//        rows SENT or DELIVERED by the local adapter, read back from the copy's demo inbox (fakeMail wrote no row).
//   DW2: the attendance answer and the consult record are database rows with audit_event lines (the in-memory audit fake
//        wrote no row).
// The real clock, no seam: the test's own consultation type has Sample settings a firm may choose: no shortest notice
// (default 240), times every 5 minutes, a 60-minute self-service limit (default 240), 5-minute meetings (the shortest),
// and its one host works every hour of every day; so B's meeting starts and ends within about 15 minutes and the walk
// waits for its end. Setup a person cannot do through the product yet (firm, host, hours, type) is written straight to the
// copy's database (Sample rows). Sample values only; US$0, no model call. About 18 minutes.
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
await db.foConsultationType.create({ data: { firmId: firm.id, slug: "free", name: "Free consultation", modes: ["VIDEO"], hostStaffIds: [host.id], minutes: 5,
  minNoticeMinutes: 0, slotIntervalMinutes: 5, selfServiceLimitMinutes: 60 } });
const signedIn = await call(null, "POST", "/platform/session/local", { firmKey: key, email: host.email, secondStep: true });
const tok = signedIn.body?.token as string | undefined;
if (!tok) throw new Error(`STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local): ${JSON.stringify(signedIn.body)}`);
const pending = await call(tok, "GET", "/platform/me/terms");   // PF-5t: a new person accepts the privacy notice first
const termIds = ((pending.body?.pending ?? pending.body?.terms ?? []) as { id?: string; versionId?: string }[]).map((t) => t.versionId ?? t.id).filter(Boolean);
if (termIds.length) await call(tok, "POST", "/platform/me/terms/accept", { versionIds: termIds });
const aEmail = `booker-a-${run}@j42-client.example`, bEmail = `booker-b-${run}@j42-client.example`;
console.log(`setup (not through the product): firm ${key} in ${ZONE} (phone ${PHONE}), one host (Case Officer) on every hour, type "free" (no notice, 60 min self-service limit, 5 min)`);

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 150 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
async function pageAs(session: string | null): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: ZONE, locale: "en-GB", colorScheme: "light", reducedMotion: "reduce" });
  if (session) await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, session);
  return ctx.newPage();
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
  // ---------------------------------------------------------------------------------------------- W1: two bookings
  const pa = await pageAs(null), pb = await pageAs(null);
  const bAt = await book(pb, mark(Date.now() + 4 * MIN), "Ben", bEmail);
  const aAt = await book(pa, mark(Date.now() + 90 * MIN), "Ana", aEmail);
  await shot(pa, "W1-booked");
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

  // ---------------------------------------------------------------------------------------------- W8, DW2: the consult record
  const panel = await staff.locator("[data-booking-detail]").innerText();
  const hasScreen = /consult record|time spent|notes/i.test(panel);
  console.log(`${hasScreen ? "NOTE" : "GAP "}  W8 screen: the booking detail ${hasScreen ? "shows" : "has no"} consult record (FO-3st1 part 2 not on main); the record is saved through its route with the host's session`);
  const note = "Sample: has a job offer; next, an employer check.";
  const saved = await call(tok, "PUT", `/front-office/bookings/${B.id}/consult-record`, { timeSpentMinutes: 5, notes: note });
  const rec = await db.foConsultRecord.findFirst({ where: { firmId: firm.id, bookingId: B.id } });
  const recLines = await db.auditEvent.findMany({ where: { firmId: firm.id, entity: "fo_consult_record" } });
  ok("J-42 W8 pass / DW2: the host records the outcome and a note: the record is stored with who (created and updated by the host) and when, and one audit line names the host",
    saved.status === 200 && rec?.notes === note && rec.createdBy.includes(host.id) && rec.updatedBy.includes(host.id) && rec.createdAt.getTime() >= before - 5_000
    && recLines.length === 1 && recLines[0].action === "booking.consult_record.created" && recLines[0].actor.includes(host.id) && !JSON.stringify(recLines[0].detail).includes(note),
    { status: saved.status, rec, lines: recLines.map((l) => [l.action, l.actor]) });
  const eur = await call(tok, "PUT", `/front-office/bookings/${B.id}/consult-record`, { quotedFeeMinor: 1000, quotedFeeCurrency: "EUR", version: saved.body?.version });
  ok("J-42 W8 fail: a quoted fee in EUR is refused (400) and the record is unchanged", eur.status === 400 && (await db.foConsultRecord.findFirstOrThrow({ where: { id: rec?.id } })).quotedFeeCurrency === null, eur);
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
