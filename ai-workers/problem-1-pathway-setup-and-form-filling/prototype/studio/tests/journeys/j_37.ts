// J-37 (map row 37: the public booking page, no double booking; brief lead-b-briefs/J-rows.md §J-37 on branch
// lead-b-front-office): the join-and-walk row. It adds no feature: it walks FO-3w's public pages (on main) on an isolated
// copy of the running app (its own database and port, never :4400), in two real browsers, with the booking mail read
// back from the demo inbox (GET /api/demo/platform-inbox: the app's MailPort over MessagePort and PF-19b's local adapter,
// already the running app's mail, runtime-ports.ts).
//   W1: the public page lists slots;  W2: booker A books one;  W3: booker B, on the same slot in a second browser, is
//   refused ("This time was just booked.") and offered the next slots, and only one booking exists;  W4: A's
//   confirmation arrives in the demo inbox;  W5: ends at row 42's first step: A's manage link opens A's booking.
//   W4b (J-9 W4, moved from PF-23w, #1800): HELD until FO-2 part 3b swaps booking's `arrival` from fakeArrival to FO-2's
//   ArrivalPort (runtime-ports.ts): on a running copy a reminder due after a restart finds no booker (the fake keeps
//   people in memory) and sends nothing. Once the swap is on this branch, W4b restarts the API and waits for the
//   reminder in the demo inbox (the clock seam is named in the PR then).
// Fails on the fake (P-606): the inbox read is the real outbox (msg_outbox SENT by the local provider), never fakeMail.
// The firm, its host, hours and free-consultation type are written straight to the copy's database (Sample rows: no
// screen makes a firm or a type yet in this walk's path). US$0, no model call.
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j37 4437 start --ttl 30 && trap 'zsh studio/tools/isolated.sh j37 4437 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_37.ts j37 4437
import "reflect-metadata";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type Page } from "playwright";
import { copyFirmHoursTo } from "../../api/src/front-office/booking-seed.ts";

const [NAME, PORT] = [process.argv[2] ?? "j37", Number(process.argv[3] ?? 4437)];
const STUDIO = join(import.meta.dirname, "..", ".."), BASE = `http://localhost:${PORT}`, TZ = "America/Toronto";
const SHOTS = join(STUDIO, "var", "walks", "j_37-shots"); mkdirSync(SHOTS, { recursive: true });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/xr_studio_${NAME}`, options: "-c TimeZone=UTC" }) });
let pass = 0, fail = 0, held = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const hold = (name: string, why: string) => { held++; console.log(`HELD  ${name} — ${why}`); };
const run = Date.now().toString(36);
const headed = process.env.HEADED === "1";
const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 150 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const visitor = async () => { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: TZ, locale: "en-CA", colorScheme: "light", reducedMotion: "reduce" }); return { ctx, p: await ctx.newPage() }; };
const inbox = async (address: string) => ((await (await fetch(`${BASE}/api/demo/platform-inbox?address=${encodeURIComponent(address)}`)).json()) as { messages?: { subject: string; text?: string; html?: string }[] }).messages ?? [];
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
  await db.foConsultationType.create({ data: { firmId: firm.id, slug: "free", name: "Free consultation", modes: ["VIDEO"], hostStaffIds: [host.id], minutes: 30 } });
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
  await a.p.getByRole("button", { name: "Book this time" }).click();
  await a.p.locator('[data-public-state="booked"]').waitFor({ timeout: 20_000 });
  ok("J-37 W2: booker A books the time and sees \"You are booked\"", await a.p.locator('[data-public-state="booked"]').count() === 1);
  await a.p.screenshot({ path: join(SHOTS, "w2-booked-1440.png"), fullPage: true });
  await b.p.getByRole("button", { name: "Book this time" }).click();
  await b.p.getByText("This time was just booked.").waitFor({ timeout: 20_000 });
  const bText = await b.p.locator("main").innerText();
  const rows = await db.foBooking.findMany({ where: { firmId: firm.id }, select: { status: true } });
  ok("J-37 W3: booker B is refused (\"This time was just booked.\", \"Please choose another time.\"), offered the next times, answers kept; one booking exists",
    bText.includes("Please choose another time.") && bText.includes("Next free times")
    && (await b.p.getByLabel("Email").inputValue()) === B && rows.length === 1, { rows: rows.length, text: bText.slice(0, 300) });
  await b.p.screenshot({ path: join(SHOTS, "w3-taken-1440.png"), fullPage: true });

  // ------------------------------------------------------------------- W4: A's confirmation arrives in the demo inbox
  let mails: Awaited<ReturnType<typeof inbox>> = [];
  for (let i = 0; i < 60 && !mails.length; i++) { mails = await inbox(A); if (!mails.length) await new Promise((r) => setTimeout(r, 3_000)); }
  const body = mails.map((m) => `${m.text ?? ""}\n${m.html ?? ""}`).join("\n");
  ok("J-37 W4: A's confirmation arrives in the demo inbox (the real outbox, sent by the local provider)", mails.length >= 1, mails.map((m) => m.subject));
  ok("J-37 W4 fail side: booker B, refused, got no booking mail", (await inbox(B)).length === 0);

  // -------------------------------------------------------------------- W4b: the reminder after a restart (held)
  hold("J-37 W4b (J-9 W4): restart the API; A's reminder still runs at its due time and arrives in the demo inbox",
    "waits on FO-2 part 3b: booking's arrival is fakeArrival on the running app (runtime-ports.ts), so a reminder after a restart finds no booker");

  // ------------------------------------------------------------------------- W5: row 42's first step, the manage link
  const link = body.match(/\/book\/[a-z0-9-]+\/manage#[A-Za-z0-9._~-]+/)?.[0];
  if (link) { await a.p.goto(`${BASE}${link}`); await a.p.getByRole("button", { name: /Reschedule|Cancel/ }).first().waitFor({ timeout: 20_000 }).catch(() => undefined); }
  const manage = link ? await a.p.locator("main").innerText() : "";
  ok("J-37 W5: A's mail carries the manage link; it opens A's booking with Reschedule and Cancel (row 42's first step)", !!link && /Reschedule/.test(manage) && /Cancel/.test(manage), { link, manage: manage.slice(0, 200) });
  await a.p.screenshot({ path: join(SHOTS, "w5-manage-1440.png"), fullPage: true });
  await a.ctx.close(); await b.ctx.close();
} finally {
  await browser.close(); await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed, ${held} held`);
process.exit(fail ? 1 : 0);
