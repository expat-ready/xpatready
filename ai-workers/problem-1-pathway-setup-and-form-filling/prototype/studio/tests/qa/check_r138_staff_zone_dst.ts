// qa R1.38, the staff zone across a daylight-saving change (qa 12, 21 Nov; after FO-3st1 #2322 and J-38 W6 #2326).
// J-38 W6 shows the staff calendar for one booking on a day with no clock change near it. R1.38's Done when asks for the
// staff zone "with the right offset across a daylight-saving change", so this walk books, by screens, two slots that
// straddle Toronto's 14 Mar 2027 change from a browser in Asia/Dubai (Fri 12 Mar 19:00 = 10:00 EST = 15:00Z; Mon 15 Mar
// 18:00 = 10:00 EDT = 14:00Z), then signs the host in from a browser in Europe/London (still GMT on both days: the UK
// changes on 28 Mar), the weeks when only one of the three zones has changed, and reads:
//   S1, S2: each week's calendar names the office zone and shows the booking in its 10:00 row (not 15:00 or 14:00);
//   S3, S4: each booking's detail reads 10:00–10:30 America/Toronto and the booker's 19:00 / 18:00 (Asia/Dubai);
//   S5: the host's two mails both read 10:00 a.m. (America/Toronto); the invites' DTSTART are 15:00Z and 14:00Z.
// Setup a person cannot do through the product yet (firm, zone, host, roles, hours, type) is written with Prisma (Sample
// rows). No model call (US$0). Run from prototype/ on an isolated copy started with PLATFORM_IDENTITY=local:
//   STUDIO_URL=http://localhost:4473 DATABASE_URL=postgresql://xr_studio@127.0.0.1:54329/xr_studio_<name> tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_r138_staff_zone_dst.ts <shots-dir>
import "reflect-metadata";
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type Page } from "playwright";
import { copyFirmHoursTo } from "../../api/src/front-office/booking-seed.ts";
import { platformAuditWorkspaceId } from "../../api/src/platform/audit/audit-event.ts";
import { TIME_ZONE, writeSetting } from "../../api/src/platform/settings.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const BASE = process.env.STUDIO_URL ?? "http://localhost:4473";
const SHOTS = process.argv[2] ?? "."; mkdirSync(SHOTS, { recursive: true });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, options: "-c TimeZone=UTC" }) });
const FIRM_ZONE = "America/Toronto", BOOKER_ZONE = "Asia/Dubai", STAFF_BROWSER = "Europe/London";
let pass = 0, fail = 0;
const ok = (n: string, c: unknown, d?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${!c && d !== undefined ? ` — ${JSON.stringify(d).slice(0, 500)}` : ""}`); };
const axe = async (p: Page, where: string) => {
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  ok(`axe clean: ${where}`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes.length}`));
};
const plain = (s: string) => s.replace(/[   ]/g, " ");
type Mail = { subject: string; body: string; attachments: { filename: string; text: string | null }[] };
const inbox = async (address: string, want: number): Promise<Mail[]> => {
  let got: Mail[] = [];
  for (let i = 0; i < 60 && got.length < want; i++) {
    if (i) await new Promise((x) => setTimeout(x, 1000));
    const r = await fetch(`${BASE}/api/demo/platform-inbox?address=${encodeURIComponent(address)}`);
    got = r.status === 200 ? ((await r.json()) as { messages: Mail[] }).messages.reverse() : [];
  }
  return got;
};

async function bookOnce(p: Page, key: string, day: string, time: string, email: string) {
  await p.goto(`${BASE}/book/${key}`);
  await p.locator("[data-type-card]").first().waitFor({ timeout: 30_000 });
  await p.getByRole("link", { name: "Choose Free consultation" }).click();
  await p.getByRole("heading", { name: "Choose a time" }).waitFor();
  for (let i = 0; i < 6 && (await p.getByRole("heading", { name: "March 2027" }).count()) === 0; i++) { await p.getByRole("button", { name: "Next month" }).click(); await p.waitForTimeout(600); }
  await p.getByRole("button", { name: day, exact: true }).click();
  const slot = p.getByRole("button", { name: `${day}, ${time} Asia/Dubai time`, exact: true });
  ok(`R1.38 booker: "${day}, ${time}" (Asia/Dubai) is offered`, (await slot.count()) === 1, await p.locator("[data-day-times] li button").allInnerTexts());
  await slot.click();
  await p.getByRole("heading", { name: "Your details" }).waitFor();
  await p.getByLabel("Given names").fill("Ana"); await p.getByLabel("Family name").fill("Sample"); await p.getByLabel("Email").fill(email);
  await p.waitForTimeout(3500); // the form's minimum fill time
  await p.getByRole("button", { name: "Book this time" }).click();
  await p.locator('[data-public-state="booked"]').waitFor({ timeout: 20_000 });
  ok(`R1.38 booker: "You are booked" for ${day}, ${time}`, (await p.locator('[data-public-state="booked"]').innerText()).includes("You are booked"));
}

async function main() {
  const run = Date.now().toString(36), key = `qa-r138-${run}`;
  const firm = await db.platformFirm.create({ data: { key, operatingName: "Sample qa firm", countryCode: "CA", status: "ACTIVE", contactEmail: `office-${run}@qa-firm.example` } });
  await writeSetting(db, { firmId: firm.id, key: TIME_ZONE.key, value: FIRM_ZONE, by: "seed:qa-r138", workspaceId: await platformAuditWorkspaceId(db), reason: "qa R1.38: the firm's zone, stated" });
  const hostEmail = `host-${run}@qa-firm.example`;
  const host = await db.platformStaff.create({ data: { firmId: firm.id, email: hostEmail, displayName: "Sample host", status: "ACTIVE" } });
  await copyFirmHoursTo(db, firm.id, [host.id]);
  await db.platformRoleGrant.create({ data: { firmId: firm.id, staffId: host.id, role: "CASE_OFFICER", grantedBy: "seed:qa-r138" } });
  await db.foConsultationType.create({ data: { firmId: firm.id, slug: "free", name: "Free consultation", modes: ["VIDEO"], hostStaffIds: [host.id], minutes: 30, windowDays: 130 } });
  console.log(`setup (Sample, not through the product): firm ${key} in ${FIRM_ZONE}, one host (Case Officer), type "free"`);

  const browser = await chromium.launch({ headless: !process.env.HEADED, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
  try {
    const bctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: BOOKER_ZONE, locale: "en-GB" });
    const bp = await bctx.newPage();
    const runs = [
      { tag: "est", day: "Friday 12 March", time: "19:00", torontoDay: "2027-03-12", iso: "2027-03-12T15:00:00.000Z", utc: "20270312T150000Z", mailDay: "Friday, March 12, 2027" },
      { tag: "edt", day: "Monday 15 March", time: "18:00", torontoDay: "2027-03-15", iso: "2027-03-15T14:00:00.000Z", utc: "20270315T140000Z", mailDay: "Monday, March 15, 2027" },
    ];
    const ids: Record<string, string> = {};
    for (const r of runs) {
      await bookOnce(bp, key, r.day, r.time, `booker-${r.tag}-${run}@qa-client.example`);
      const row = await db.foBooking.findFirst({ where: { firmId: firm.id }, orderBy: { createdAt: "desc" } });
      ids[r.tag] = row!.id;
      ok(`R1.38 ${r.tag}: stored in UTC (${r.iso}) with the booker's zone, hosted by the host`, row?.startsAt.toISOString() === r.iso && row?.bookerTimeZone === BOOKER_ZONE && row?.staffId === host.id, [row?.startsAt, row?.bookerTimeZone]);
    }
    await bctx.close();

    const signIn = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: key, email: hostEmail, secondStep: true }) });
    if (!signIn.ok) throw new Error(`host sign-in refused (${signIn.status}): start the copy with PLATFORM_IDENTITY=local`);
    const { token } = await signIn.json() as { token: string };
    const sctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: STAFF_BROWSER, locale: "en-GB" });
    await sctx.addInitScript((t) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })), token);
    const sp = await sctx.newPage();
    for (const r of runs) {
      const londonHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: STAFF_BROWSER, hour: "2-digit", hourCycle: "h23" }).format(new Date(r.iso)));
      await sp.goto(`${BASE}/front-office/bookings?view=week&whose=mine&date=${r.torontoDay}`);
      await sp.locator("[data-grid]").waitFor({ timeout: 30_000 });
      const zoneSaid = await sp.locator("[data-zone-line]").innerText();
      const inTen = await sp.locator(`[data-cell="${r.torontoDay}T10"] [data-block="${ids[r.tag]}"]`).count();
      const inLondon = await sp.locator(`[data-cell="${r.torontoDay}T${String(londonHour).padStart(2, "0")}"] [data-block="${ids[r.tag]}"]`).count();
      await sp.screenshot({ path: join(SHOTS, `staff-week-${r.tag}-1440.png`), fullPage: true });
      await axe(sp, `the host's week of ${r.torontoDay}`);
      ok(`R1.38 staff ${r.tag}: the week of ${r.torontoDay} names ${FIRM_ZONE} and shows the booking in the 10:00 row, not the London ${londonHour}:00 row (browser in ${STAFF_BROWSER})`, zoneSaid.includes(FIRM_ZONE) && inTen === 1 && inLondon === 0, { zoneSaid, inTen, inLondon });
      await sp.locator(`[data-block="${ids[r.tag]}"]`).click();
      await sp.locator("[data-booking-detail]").waitFor({ timeout: 20_000 });
      const whenSaid = await sp.locator("[data-when]").innerText();
      await sp.screenshot({ path: join(SHOTS, `staff-detail-${r.tag}-1440.png`), fullPage: true });
      ok(`R1.38 staff ${r.tag}: the detail reads 10:00–10:30 ${FIRM_ZONE} and ${r.time} for the booker (${BOOKER_ZONE}), nothing in London time`,
        whenSaid.includes(`10:00–10:30 ${FIRM_ZONE}`) && whenSaid.includes(`${r.time} for Ana Sample (${BOOKER_ZONE})`) && !whenSaid.includes(STAFF_BROWSER), whenSaid);
    }
    await sctx.close();

    const mails = await inbox(hostEmail, 2);
    for (const [i, r] of runs.entries()) {
      const m = mails[i], text = plain(`${m?.subject ?? ""}\n${m?.body ?? ""}`), ics = m?.attachments.find((a) => /\.ics$/.test(a.filename))?.text ?? "";
      ok(`R1.38 staff mail ${r.tag}: the host's mail reads "${r.mailDay} at 10:00 a.m. (${FIRM_ZONE})" and its invite starts at ${r.utc}`, text.includes(`${r.mailDay} at 10:00 a.m. (${FIRM_ZONE})`) && ics.includes(`DTSTART:${r.utc}`), [m?.subject, /DTSTART[^\r\n]*/.exec(ics)?.[0]]);
    }
  } catch (e) {
    ok("the check ran to the end", false, String((e as Error)?.stack ?? e).slice(0, 800));
  } finally {
    await browser.close(); await db.$disconnect();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
await main();
