// FO-5cr (AG-4-49 rule 6, AG-4-50 rule 4 and §11 test 1; MS-D18(4)): the retainer draft filled in from a consult record,
// by screens, in a real browser at 1440 px on an isolated copy (its build, its database): the host saves the consult
// record on the attended booking, clicks "Prepare retainer" (a prospect) or "Engage and prepare retainer" (a lead, then
// Engage), the prospect opens with the Prepare panel saying it fills in from the record, and the draft's first fee row is
// "Quoted at the consultation: <item>" with the quoted amount. A USD quote and another firm's record each leave their
// notice on the retainer page. Every record is a real row read through FO-3a part 2a's adapter (review m3). axe-core on
// the panel and on the draft (no serious or critical finding). Screenshots: product/screens/fo-5cr/screenshots. US$0.
//   zsh studio/tools/isolated.sh screens_fo5cr 4443 start PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh screens_fo5cr 4443 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo5cr_prefill_browser.ts 4443 xr_studio_screens_fo5cr
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { NO_CONSULT_RECORD } from "../api/src/front-office/retainers/service.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const PORT = Number(process.argv[2] ?? 4443), DBNAME = process.argv[3] ?? "xr_studio_screens_fo5cr", BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "fo-5cr", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
const staffOf = (actor: string) => sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|");
const [RID, REMAIL] = staffOf("user-R"), [SID] = staffOf("user-S");   // R: Owner + Case Manager with a licence (firm A); S: firm B
const signIn = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email: REMAIL, secondStep: true }) });
const tok = ((await signIn.json()) as { token?: string }).token;
if (!tok) { console.error("STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local)"); process.exit(2); }
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const call = async (method: string, path: string, body?: unknown): Promise<Ans> => {
  const form = body instanceof FormData;
  const x = await fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${tok}`, ...(body && !form ? { "content-type": "application/json" } : {}) }, body: form ? body : body ? JSON.stringify(body) : undefined });
  return { status: x.status, body: await x.json().catch(() => null) };
};
const clear = (prospectId: string) => call("POST", "/front-office/conflict-checks", { requestId: crypto.randomUUID(), prospectId, result: "NO_CONFLICT" });   // FO-13c's check, as the firm records it
sql(`update fo_retainer_template set active = false where firm_id = '${A}'`);
const starter = await fetch(`${BASE}/api/front-office/retainer-templates/starter`, { headers: { authorization: `Bearer ${tok}` } });
const up = new FormData(); up.set("name", "Standard retainer (Sample)"); up.set("file", new Blob([await starter.arrayBuffer()]), "starter.docx");
ok("FO-5cr setup: the Sample starter template is uploaded", (await call("POST", "/front-office/retainer-templates", up)).status === 201);
const typeOf = (firmId: string, host: string) => db.foConsultationType.create({ data: { firmId, slug: `fo5cr-${crypto.randomUUID().slice(0, 8)}`, name: "Free consultation (Sample)", modes: ["VIDEO"], hostStaffIds: [host], minutes: 45, windowDays: 400, minNoticeMinutes: 0 } });
const typeA = await typeOf(A, RID);
const person = (firmId: string, given: string) => db.foPerson.create({ data: { firmId, givenNames: given, familyName: "Sample", email: `${given.toLowerCase()}.fo5cr@example.com`, createdBy: "seed:FO-5cr-test" } });
const lead = async (given: string) => { const p = await person(A, given); return { person: p, lead: await db.foLead.create({ data: { firmId: A, personId: p.id, door: "MANUAL", source: "WEBSITE", ownerStaffId: RID, createdBy: "seed:FO-5cr-test" } }) }; };
let k = 0;
const book = async (personId: string, prospectId: string | null) => {
  const startsAt = new Date(Date.now() - (120 + 60 * k++) * 60_000);
  const id = (await db.foBooking.create({ data: { firmId: A, typeId: typeA.id, staffId: RID, personId, prospectId, mode: "VIDEO", startsAt, endsAt: new Date(startsAt.getTime() + 45 * 60_000), bookerTimeZone: "America/Toronto" } })).id;
  const a = await call("POST", `/front-office/bookings/${id}/attendance`, { outcome: "COMPLETED" });   // Attended, through the product's route
  if (a.status >= 300) throw new Error(`STOP  attendance: ${JSON.stringify(a)}`);
  return id;
};
const engaged = async (given: string) => { const x = await lead(given); const p = (await call("POST", `/front-office/leads/${x.lead.id}/engage`)).body; await clear(p.id); return { ...x, prospectId: String(p.id) }; };
const Bina = await engaged("Bina"), Chen = await lead("Chen"), Dara = await engaged("Dara"), Esme = await engaged("Esme");
const bBina = await book(Bina.person.id, Bina.prospectId), bChen = await book(Chen.person.id, null), bDara = await book(Dara.person.id, Dara.prospectId);
// Firm B's record (a real row, firm B's booking): its id is given to firm A's prospect Esme.
const typeB = await typeOf(B, SID), pB = await person(B, "Faro");
const startsB = new Date(Date.now() - 600 * 60_000);
const bookingB = await db.foBooking.create({ data: { firmId: B, typeId: typeB.id, staffId: SID, personId: pB.id, mode: "VIDEO", startsAt: startsB, endsAt: new Date(startsB.getTime() + 45 * 60_000), bookerTimeZone: "America/Toronto" } });
sql(`update fo_booking set status = 'COMPLETED' where id = '${bookingB.id}'`);
const recB = await db.foConsultRecord.create({ data: { firmId: B, bookingId: bookingB.id, timeSpentMinutes: 45, recommended: ["Study permit"], quotedFeeMinor: 999900, quotedFeeCurrency: "CAD", createdBy: `staff:${SID}`, updatedBy: `staff:${SID}` } });

const browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "America/Toronto", locale: "en-GB", colorScheme: "light", reducedMotion: "reduce" });
await ctx.addInitScript((x) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })); }, tok);
const host: Page = await ctx.newPage(); host.on("pageerror", (e) => errors.push(String(e)));
const shot = (name: string) => host.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const axe = async (what: string, include?: string) => {
  let b = new AxeBuilder({ page: host }).withTags(TAGS); if (include) b = b.include(include);
  const bad = (await b.analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`FO-5cr DW axe: ${what}: no serious or critical finding`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes.length}`));
};
const panel = () => host.getByRole("dialog", { name: "Prepare retainer" });
const recordIt = async (bookingId: string, fee: string, item: string, currency = "CAD") => {
  await host.goto(`${BASE}/front-office/bookings/${bookingId}`); await host.locator(`[data-consult-record="${bookingId}"]`).waitFor({ timeout: 30_000 });
  await host.getByLabel("Recommended item").fill(item); await host.getByRole("button", { name: "+ Add" }).click();
  await host.getByLabel("Quoted fee (optional)").fill(fee); await host.getByLabel("Currency").selectOption(currency);
  await host.getByRole("button", { name: "Save record" }).click(); await host.locator("[data-next-step]").waitFor({ timeout: 15_000 });
};
const prepare = async () => {
  await panel().getByRole("button", { name: "Prepare retainer" }).click();
  await host.waitForURL(/\/front-office\/retainers\/[0-9a-f-]+$/, { timeout: 30_000 });
  await host.getByLabel("Fee 1: what it is for").waitFor({ timeout: 15_000 });
  return { label: await host.getByLabel("Fee 1: what it is for").inputValue(), amount: await host.getByLabel("Fee 1: amount").inputValue(), status: await host.locator("[data-retainer-status]").innerText() };
};
const notices = async () => (await host.locator("main").innerText());
try {
  // ---- AG-4-50 rule 2: on a prospect, "Prepare retainer"
  await recordIt(bBina, "3,500", "Work permit");
  await host.getByRole("button", { name: "Prepare retainer" }).click();
  await panel().waitFor({ timeout: 15_000 });
  await host.waitForURL(new RegExp(`/front-office/prospects/${Bina.prospectId}$`), { timeout: 15_000 });
  ok("FO-5cr W1 pass: Prepare retainer opens the prospect with the Prepare panel open, saying it fills in from the consultation record; the address drops the record's id",
    await panel().locator("[data-from-consult]").isVisible(), host.url());
  await shot("fo5cr-2-prepare-panel-from-record-1440"); await axe("the Prepare panel from a record", '[role="dialog"]');
  const w2 = await prepare();
  ok("FO-5cr W2 pass (AG-4-50 §11 test 1): the draft's first fee row is \"Quoted at the consultation: Work permit\", 3500.00, and it is a Draft (nothing sent)",
    w2.label === "Quoted at the consultation: Work permit" && w2.amount === "3500.00" && w2.status === "Draft", w2);
  ok("FO-5cr W2: the row is stored with the record's id in the draft's audit line", sql(`select count(*) from audit_event where action = 'retainer.drafted' and detail->>'consultRecordId' is not null and detail->>'prospectId' = '${Bina.prospectId}'`) === "1");
  await shot("fo5cr-3-retainer-draft-prefilled-1440"); await axe("the pre-filled draft");
  // ---- AG-4-50 rule 1: on a lead, "Engage and prepare retainer"; Cancel forgets the record (review n3)
  await recordIt(bChen, "1,200", "Translation");
  await host.getByRole("button", { name: "Engage and prepare retainer" }).click();
  const engage = host.getByRole("dialog", { name: "Engage" });
  await engage.waitFor({ timeout: 15_000 });
  await engage.getByRole("button", { name: "Engage as Individual" }).click();
  await host.waitForURL(/\/front-office\/prospects\/[0-9a-f-]+/, { timeout: 30_000 });
  const prosChen = host.url().match(/prospects\/([0-9a-f-]+)/)![1];
  await panel().waitFor({ timeout: 15_000 });
  ok("FO-5cr W3 pass: after Engage the new prospect opens with the Prepare panel filled in from the lead's record", await panel().locator("[data-from-consult]").isVisible());
  await shot("fo5cr-4-after-engage-prepare-panel-1440");
  await clear(prosChen);
  const w4 = await prepare();
  ok("FO-5cr W4 pass: the lead's draft: \"Quoted at the consultation: Translation\", 1200.00", w4.label === "Quoted at the consultation: Translation" && w4.amount === "1200.00", w4);
  await shot("fo5cr-5-lead-retainer-draft-1440");
  // ---- X-6: a USD quote fills the items, asks for CAD, and the notice stays on the draft (review m2)
  await recordIt(bDara, "2,500", "Visitor visa", "USD");
  await host.getByRole("button", { name: "Prepare retainer" }).click(); await panel().waitFor({ timeout: 15_000 });
  const w5 = await prepare();
  await host.waitForTimeout(5_000);   // longer than a toast lives (4.5 s): the notice is on the page, not a toast
  ok("FO-5cr W5 fail: a USD quote never lands as a CAD amount: the items fill the row, the amount stays empty and the draft says to enter it in CAD",
    w5.label === "Quoted at the consultation: Visitor visa" && w5.amount === "" && (await notices()).includes("The quoted fee was USD 2,500.00. A retainer is in CAD, so enter the amount in CAD."), w5);
  await shot("fo5cr-6-usd-notice-1440");
  // ---- another firm's record (a real row in firm B), by address: the empty row, the one notice, nothing of the record
  await host.goto(`${BASE}/front-office/prospects/${Esme.prospectId}?consultRecord=${recB.id}`);
  await panel().waitFor({ timeout: 15_000 });
  const w6 = await prepare(), page6 = await notices();
  ok("FO-5cr W6 fail: another firm's record id → \"Deposit on signing\" with no amount, the one neutral notice, and nothing of the record on the page",
    w6.label === "Deposit on signing" && w6.amount === "" && page6.includes(NO_CONSULT_RECORD) && !/Study permit|9,999/.test(page6) && !(await host.content()).includes("Study permit"), { w6, notice: page6.includes(NO_CONSULT_RECORD) });
  await shot("fo5cr-7-other-firm-record-1440");
  ok("FO-5cr: no page error in the browser", errors.length === 0, errors.slice(0, 5));
} finally { await browser.close(); await db.$disconnect(); }
process.exit(summary() ? 1 : 0);
