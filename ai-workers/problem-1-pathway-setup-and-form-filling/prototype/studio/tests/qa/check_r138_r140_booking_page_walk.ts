// qa R1.38 / R1.40, gate A by screens (16 Nov, after FO-3w part 1 #b98e16934, merged 12:29 IST): a visitor whose browser
// is in Asia/Dubai books from the firm's public booking page on a running isolated copy (the real app and clock), using
// only what a person sees: the list → Choose → month → day → time → details → Book this time → "You are booked". Two
// bookings straddle Toronto's 14 Mar 2027 change: Fri 12 Mar 19:00 Dubai (10:00 Toronto EST, 15:00Z) and Mon 15 Mar 18:00
// Dubai (10:00 Toronto EDT, 14:00Z). Then the next step a person takes: "Add to calendar" (the .ics), the emailed invite in
// the demo inbox (stand-in SI-20, by API: it has no screen), and "Reschedule" (map row 42's first step). Widths 400, 1024,
// 1440; axe on each page. Setup a person cannot do through the product yet (firm, host, hours, type: PF-5, PF-4s, FO-3a)
// is written once with Prisma. No model call (US$0). Screenshots to the report folder given as argv[2].
//   STUDIO_URL=http://localhost:4472 DATABASE_URL=… tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_r138_r140_booking_page_walk.ts <shots-dir>
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type Page } from "playwright";
import { copyFirmHoursTo } from "../../api/src/front-office/booking-seed.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const BASE = process.env.STUDIO_URL ?? "http://localhost:4472";
const SHOTS = process.argv[2] ?? "."; mkdirSync(SHOTS, { recursive: true });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, options: "-c TimeZone=UTC" }) });
let pass = 0, fail = 0;
const ok = (n: string, c: unknown, d?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${!c && d !== undefined ? ` — ${JSON.stringify(d).slice(0, 500)}` : ""}`); };
const axe = async (p: Page, where: string) => {
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  ok(`axe clean: ${where}`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes.length}`));
};
const inbox = async (address: string, want: number) => {
  for (let i = 0; i < 60; i++) {
    const r = await (await fetch(`${BASE}/api/demo/platform-inbox?address=${encodeURIComponent(address)}`)).json() as { messages: { subject: string; attachments: { filename: string; text: string | null }[] }[] };
    if (r.messages.length >= want) return r.messages.reverse();
    await new Promise((x) => setTimeout(x, 1000));
  }
  const r = await (await fetch(`${BASE}/api/demo/platform-inbox?address=${encodeURIComponent(address)}`)).json() as { messages: { subject: string; attachments: { filename: string; text: string | null }[] }[] };
  return r.messages.reverse();   // what arrived, so a failing line shows it
};

async function bookOnce(p: Page, key: string, width: number, day: string, time: string, email: string, tag: string) {
  await p.setViewportSize({ width, height: 900 });
  await p.goto(`${BASE}/book/${key}`);
  await p.locator("[data-type-card]").first().waitFor({ timeout: 30_000 });
  await p.screenshot({ path: join(SHOTS, `${tag}-list-${width}.png`), fullPage: true });
  await axe(p, `list page at ${width} px`);
  await p.getByRole("link", { name: "Choose Free consultation" }).click();
  await p.getByRole("heading", { name: "Choose a time" }).waitFor();
  const zoneLine = await p.locator("[data-zone-line]").innerText().catch(() => "");
  ok(`R1.38 ${tag} ${width}px: the page states the visitor's zone (Asia/Dubai)`, zoneLine.includes("Asia/Dubai"), zoneLine);
  for (let i = 0; i < 6 && (await p.getByRole("heading", { name: "March 2027" }).count()) === 0; i++) { await p.getByRole("button", { name: "Next month" }).click(); await p.waitForTimeout(600); }
  await p.getByRole("button", { name: day, exact: true }).click();
  const slotName = `${day}, ${time} Asia/Dubai time`;
  const slot = p.getByRole("button", { name: slotName, exact: true });
  ok(`R1.38 ${tag} ${width}px: "${slotName}" is offered (10:00 Toronto in the visitor's zone)`, (await slot.count()) === 1, await p.locator("[data-day-times] li button").allInnerTexts());
  await p.screenshot({ path: join(SHOTS, `${tag}-times-${width}.png`), fullPage: true });
  await axe(p, `times page at ${width} px`);
  await slot.click();
  await p.getByRole("heading", { name: "Your details" }).waitFor();
  await p.getByLabel("Given names").fill("Client"); await p.getByLabel("Family name").fill("A"); await p.getByLabel("Email").fill(email);
  await p.waitForTimeout(3500); // the form's minimum fill time
  await p.getByRole("button", { name: "Book this time" }).click();
  await p.locator('[data-public-state="booked"], [data-summary]').first().waitFor({ timeout: 20_000 });
  const done = await p.locator('[data-public-state="booked"]').innerText().catch(() => "");
  await p.screenshot({ path: join(SHOTS, `${tag}-booked-${width}.png`), fullPage: true });
  ok(`R1.38 ${tag} ${width}px: "You are booked" reads ${slotName}`, done.includes("You are booked") && done.includes(slotName), done.slice(0, 300));
  return done;
}

async function main() {
  const key = `qa-fo3w-${process.pid}`;
  const firm = await db.platformFirm.create({ data: { key, operatingName: "Sample qa firm", countryCode: "CA", status: "ACTIVE", contactEmail: `${key}@firm.example` } });
  const hostEmail = `host-${key}@staff.example`;
  const host = await db.platformStaff.create({ data: { firmId: firm.id, email: hostEmail, displayName: "Sample host", status: "ACTIVE" } });
  await copyFirmHoursTo(db, firm.id, [host.id]);
  await db.foConsultationType.create({ data: { firmId: firm.id, slug: "free", name: "Free consultation", modes: ["VIDEO"], hostStaffIds: [host.id], minutes: 30, windowDays: 130 } });
  console.log(`setup (not through the product: no firm, staff, hours or type screens yet): firm ${key}, one host, type "free"`);

  const browser = await chromium.launch({ headless: !process.env.HEADED, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });   // as the builder suites
  const ctx = await browser.newContext({ timezoneId: "Asia/Dubai", acceptDownloads: true });
  const p = await ctx.newPage();
  const runs: { width: number; day: string; time: string; utc: string; tag: string }[] = [
    { width: 1440, day: "Friday 12 March", time: "19:00", utc: "20270312T150000Z", tag: "est" },
    { width: 1024, day: "Monday 15 March", time: "18:00", utc: "20270315T140000Z", tag: "edt" },
    { width: 400, day: "Tuesday 16 March", time: "18:00", utc: "20270316T140000Z", tag: "edt-400" },
  ];
  for (const r of runs) {
    const email = `client-${r.tag}-${key}@example.com`;
    await bookOnce(p, key, r.width, r.day, r.time, email, r.tag);
    const row = await db.foBooking.findFirst({ where: { firmId: firm.id }, orderBy: { createdAt: "desc" } });
    const isoZ = `${r.utc.slice(0, 4)}-${r.utc.slice(4, 6)}-${r.utc.slice(6, 8)}T${r.utc.slice(9, 11)}:${r.utc.slice(11, 13)}:00.000Z`;
    ok(`R1.38 ${r.tag}: stored in UTC (${isoZ}) with the booker's zone Asia/Dubai`, row?.startsAt.toISOString() === isoZ && row?.bookerTimeZone === "Asia/Dubai", [row?.startsAt, row?.bookerTimeZone]);
    // Next step a person takes: Add to calendar.
    const href = await p.getByRole("link", { name: "Add to calendar" }).getAttribute("href");
    const dl = await fetch(BASE + href!); const ics = await dl.text();
    ok(`R1.40 ${r.tag}: "Add to calendar" gives the invite (200, text/calendar), DTSTART ${r.utc}, METHOD:REQUEST`, dl.status === 200 && /text\/calendar/.test(dl.headers.get("content-type") ?? "") && ics.includes(`DTSTART:${r.utc}`) && /METHOD:REQUEST/.test(ics), [dl.status, ics.match(/DTSTART[^\r\n]*/)?.[0]]);
    const mails = await inbox(email, 1);
    const mailIcs = mails[0]?.attachments.find((a) => /\.ics$/.test(a.filename))?.text ?? "";
    const strip = (t: string) => t.replace(/\r?\nDTSTAMP:[^\r\n]*/g, "").replace(/\r\n/g, "\n").trim();
    ok(`R1.40 ${r.tag}: the emailed invite (demo inbox) is the same invite as "Add to calendar" (DTSTAMP aside)`, mailIcs.length > 0 && strip(mailIcs) === strip(ics), [mails.map((m) => m.subject), mailIcs.slice(0, 120)]);
    const h = Number(r.time.slice(0, 2)), mailTime = `${((h + 11) % 12) + 1}:${r.time.slice(3)} ${h < 12 ? "a.m." : "p.m."}`;   // en-CA short time (wallLabel)
    const body = (mails[0] as unknown as { body?: string })?.body ?? "";
    ok(`R1.38 ${r.tag}: the email body reads "${mailTime} (Asia/Dubai)"`, mails.length > 0 && new RegExp(`${mailTime.replace(/\./g, "\\.").replace(" ", "\\s?")}\\s*\\(Asia/Dubai\\)`).test(body), body.slice(0, 200));
  }
  // The next capability's first step (map row 42: reschedule or cancel by link): the confirmation's Reschedule link.
  const resched = await p.getByRole("link", { name: "Reschedule" }).getAttribute("href");
  await p.getByRole("link", { name: "Reschedule" }).click(); await p.waitForTimeout(2500);
  const after = (await p.locator("main").innerText().catch(() => (p.locator("body").innerText()))).slice(0, 300);
  await p.screenshot({ path: join(SHOTS, "next-step-reschedule-400.png"), fullPage: true });
  console.log(`NOTE  next step: Reschedule → ${resched?.replace(/#.*/, "#<token>")} shows: ${JSON.stringify(after)}`);
  ok("next step (map row 42): Reschedule opens a page that can change the booking", /choose a (new )?time|reschedule|change/i.test(after) && !/not found|404/i.test(after), after);

  // After FO-3w part 2 (#1982, 21:32 IST 16 Nov): R1.40's update and cancel by screens, on the manage page the email link
  // opens. Reschedule → a new time → "Move to this time"; then Cancel → "Cancel booking". The invites read back from the
  // demo inbox must keep one UID, raise SEQUENCE, carry the new DTSTART, and end with METHOD:CANCEL.
  if ((await p.getByRole("button", { name: "Reschedule" }).count()) > 0) {
    const last = runs[runs.length - 1], email = `client-${last.tag}-${key}@example.com`;
    const row0 = await db.foBooking.findFirst({ where: { firmId: firm.id, bookerTimeZone: "Asia/Dubai" }, orderBy: { createdAt: "desc" } });
    await p.getByRole("button", { name: "Reschedule" }).click();
    await p.getByRole("heading", { name: "Choose a new time" }).waitFor();
    const first = p.getByRole("radio").first(); const chosen = await first.getAttribute("aria-label");
    await first.click(); await p.getByRole("button", { name: "Move to this time" }).click();
    await p.locator("[data-updated]").waitFor({ timeout: 20_000 }).catch(() => {});
    await p.screenshot({ path: join(SHOTS, "manage-moved-400.png"), fullPage: true });
    const movedText = await p.locator("main").innerText();
    ok(`R1.40 by screens: "Move to this time" (${chosen}) says the booking is updated and a new email is sent`, /Booking updated/.test(movedText) && !!chosen && movedText.includes(chosen.replace(/ Asia\/Dubai time$/, "")), movedText.slice(0, 200));
    const row1 = await db.foBooking.findUnique({ where: { id: row0!.id } });
    const z = row1!.startsAt.toISOString().replace(/[-:]/g, "").replace(".000", "");
    // A person cancels later: wait for the moved mail first (the worker drops a mail whose booking changed before it ran).
    ok("R1.40 by screens: the moved mail reaches the booker's demo inbox before the cancel", (await inbox(email, 2)).length === 2);
    await p.getByRole("button", { name: "Cancel", exact: true }).click();
    await p.getByRole("button", { name: "Cancel booking" }).click();
    await p.locator('[data-public-state="cancelled"]').waitFor({ timeout: 20_000 }).catch(() => {});
    await p.screenshot({ path: join(SHOTS, "manage-cancelled-400.png"), fullPage: true });
    const row2 = await db.foBooking.findUnique({ where: { id: row0!.id } });
    ok("R1.40 by screens: \"Cancel booking\" cancels it (CANCELLED underneath)", row2?.status === "CANCELLED", row2?.status);
    const ms = await inbox(email, 3);
    const icsAt = (i: number) => ms[i]?.attachments.find((a) => /\.ics$/.test(a.filename))?.text ?? "";
    const uid = `UID:${row0!.id}@booking.expatready.com`;
    const seq = [0, 1, 2].map((i) => Number(/SEQUENCE:(\d+)/.exec(icsAt(i))?.[1] ?? -1));
    console.log(`NOTE  manage-page invites: ${ms.map((m) => m.subject).join(" | ")} · SEQUENCE ${seq.join(",")} · moved DTSTART ${/DTSTART[^\r\n]*/.exec(icsAt(1))?.[0]}`);
    ok("R1.40 by screens: three invites to the booker (booked, moved, cancelled), one UID", ms.length === 3 && [0, 1, 2].every((i) => icsAt(i).includes(uid)), ms.map((m) => m.subject));
    ok("R1.40 by screens: SEQUENCE rises; METHOD REQUEST, REQUEST, CANCEL", seq[0] >= 0 && seq[0] < seq[1] && seq[1] < seq[2] && /METHOD:REQUEST/.test(icsAt(0)) && /METHOD:REQUEST/.test(icsAt(1)) && /METHOD:CANCEL/.test(icsAt(2)), seq);
    ok(`R1.40 / R1.38 by screens: the moved invite carries the new time in UTC (DTSTART:${z}), not the old one`, icsAt(1).includes(`DTSTART:${z}`) && !icsAt(1).includes("DTSTART:20270316T140000Z"), /DTSTART[^\r\n]*/.exec(icsAt(1))?.[0]);
  }

  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  await db.$disconnect(); process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
