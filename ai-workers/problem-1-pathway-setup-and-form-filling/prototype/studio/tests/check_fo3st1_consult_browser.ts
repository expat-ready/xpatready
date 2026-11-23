// FO-3st1 part 2 (concept screens/fo-3-booking r2 §4, §5, J-S5..J-S8; BR-15, BR-16; AG-4-49, AG-4-50): the consult record
// panel and its Next step on the staff booking detail, in a real browser on an isolated copy of the running app (its build,
// its routes, PF-4's local sign-in). Sample firm `cedar` is written to the copy's database (staff in four roles, a free
// and a Follow-up type, leads, one prospect made by the product's Engage, ended bookings); the browser signs in as each
// person. Each rule has a pass and a fail (review M2 on #2717): C1 J-S5 (Attended opens the record at the booked length
// with the lead's "Interested in"; No-show and Read-only show none), C2 J-S6 and break M1 (currency; decimal-comma fees),
// C3 the route's field issues at their fields (review M3), C4 J-S7 (lead: Engage panel, Engage cancelled → no prospect;
// prospect: Prepare retainer; case: no button), C5 J-S8 (No-show later → read-only), C6 a stale save (Reload), C7
// `?engage=1` without the key or on a closed lead says why (break M2). US$0, no model call.
//   zsh studio/tools/isolated.sh screens_consult 4441 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo3st1_consult_browser.ts 4441 xr_studio_screens_consult
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { recorder } from "./runtime/api.ts";

const PORT = Number(process.argv[2] ?? 4441), DBNAME = process.argv[3] ?? "xr_studio_screens_consult";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, ".."), URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`;
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "fo-3-booking", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
process.env.DATABASE_URL = URL_;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
const { seedFirmFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { EVERYONE_SEES_ALL, TIME_ZONE, CLOSED_DAYS, writeSetting } = await import("../api/src/platform/settings.ts");
const { platformAuditWorkspaceId } = await import("../api/src/platform/audit/audit-event.ts");
const MIN = 60_000, FK = "cedar";

// ------------------------------------------------------------------------------------------------------------ set-up (Sample)
if (await db.platformFirm.findUnique({ where: { key: FK } })) { console.error(`STOP  firm ${FK} exists: start a fresh copy (isolated.sh … start)`); process.exit(2); }
const M = await db.platformFirm.create({ data: { key: FK, operatingName: "Sample Cedar firm", countryCode: "CA", status: "ACTIVE", contactEmail: `hello@${FK}.example` } });
await db.$transaction((tx) => seedFirmFrontOffice(tx as never, M.id));
const ws = await platformAuditWorkspaceId(db as never);
const setting = (key: string, value: unknown) => writeSetting(db as never, { firmId: M.id, key, value, by: "seed:consult-test", workspaceId: ws, reason: "FO-3st1 part 2 check" });
await setting(TIME_ZONE.key, "America/Toronto"); await setting(CLOSED_DAYS.key, []); await setting(EVERYONE_SEES_ALL.key, true);
const staff = async (name: string, role: string) => {
  const s = await db.platformStaff.create({ data: { firmId: M.id, email: `${name.toLowerCase()}@${FK}.example`, displayName: `Sample ${name}`, status: "ACTIVE" } });
  await db.platformRoleGrant.create({ data: { firmId: M.id, staffId: s.id, role: role as never, grantedBy: "seed:consult-test" } });
  return s;
};
const OW = await staff("Owner", "OWNER"), HO = await staff("Host", "CASE_OFFICER"), RO = await staff("Reader", "READ_ONLY");
const free = await db.foConsultationType.create({ data: { firmId: M.id, slug: "free", name: "Free consultation", modes: ["VIDEO"], hostStaffIds: [HO.id, OW.id], minutes: 45, windowDays: 400, minNoticeMinutes: 0 } });
const follow = await db.foConsultationType.create({ data: { firmId: M.id, slug: "follow", name: "Follow-up", purpose: "FOLLOW_UP", modes: ["VIDEO"], hostStaffIds: [HO.id], minutes: 30, windowDays: 400, minNoticeMinutes: 0 } });
const service = await db.foService.create({ data: { firmId: M.id, label: "Sample: Express Entry assessment", sortOrder: 1, createdBy: "seed:consult-test" } });   // a firm's own service (no combination)
const client = async (given: string, interested: string | null = null) => {
  const p = await db.foPerson.create({ data: { firmId: M.id, givenNames: given, familyName: "Sample", email: `${given.toLowerCase()}@client.example`, createdBy: "seed:consult-test" } });
  const l = await db.foLead.create({ data: { firmId: M.id, personId: p.id, door: "MANUAL", source: "WEBSITE", ownerStaffId: HO.id, interestedInServiceId: interested, createdBy: "seed:consult-test" } });
  return { person: p, lead: l };
};
async function sign(email: string) {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: FK, email, secondStep: true }) });
  const { token } = (await r.json()) as { token?: string };
  if (!token) throw new Error("STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local)");
  const p = (await (await fetch(`${BASE}/api/platform/me/terms`, { headers: { authorization: `Bearer ${token}` } })).json()) as { pending?: { id?: string; versionId?: string }[]; terms?: { id?: string; versionId?: string }[] };
  const ids = (p.pending ?? p.terms ?? []).map((t) => t.versionId ?? t.id).filter(Boolean);
  if (ids.length) await fetch(`${BASE}/api/platform/me/terms/accept`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ versionIds: ids }) });
  return token;
}
const tok = { owner: await sign(OW.email), host: await sign(HO.email), reader: await sign(RO.email) };
const api = async (t: string, method: string, path: string, body?: unknown) => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${t}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: (await r.json().catch(() => null)) as Record<string, unknown> | null };
};
const Lena = await client("Lena", service.id), Pavel = await client("Pavel"), Carla = await client("Carla"), Nora = await client("Nora"), Cleo = await client("Cleo");
const prospect = await api(tok.owner, "POST", `/front-office/leads/${Pavel.lead.id}/engage`);
if (prospect.status !== 201 && prospect.status !== 200) throw new Error(`STOP  engage for the prospect booking: ${JSON.stringify(prospect)}`);
const why = await db.foReason.findFirst({ where: { firmId: M.id, kind: "LEAD_CLOSE", active: true, isSystem: false } });
const closed = await api(tok.owner, "POST", `/front-office/leads/${Cleo.lead.id}/close`, { reasonId: why?.id });
if (closed.status !== 200) throw new Error(`STOP  close the lead: ${JSON.stringify(closed)}`);
let k = 0;
const book = async (personId: string, status: "COMPLETED" | "NO_SHOW", o: { type?: string; prospectId?: string } = {}) => {
  const startsAt = new Date(Date.now() - (120 + 60 * k++) * MIN);
  const id = (await db.foBooking.create({ data: { firmId: M.id, typeId: o.type ?? free.id, staffId: HO.id, personId, prospectId: o.prospectId ?? null, mode: "VIDEO", startsAt, endsAt: new Date(startsAt.getTime() + 45 * MIN), bookerTimeZone: "America/Toronto" } })).id;
  // The attendance through the product's own route, as the host answers it (a booking is written SCHEDULED).
  const a = await api(tok.host, "POST", `/front-office/bookings/${id}/attendance`, { outcome: status });
  if (a.status >= 300) throw new Error(`STOP  attendance ${status}: ${JSON.stringify(a)}`);
  return id;
};
const B = {
  lead: await book(Lena.person.id, "COMPLETED"), noShow: await book(Nora.person.id, "NO_SHOW"), prospect: await book(Pavel.person.id, "COMPLETED", { prospectId: String(prospect.body?.id) }),
  caseCall: await book(Carla.person.id, "COMPLETED", { type: follow.id }), fees: await book(Nora.person.id, "COMPLETED"),
};

const errors: string[] = [];
const browser = await chromium.launch({ ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
async function as(t: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "America/Toronto", locale: "en-GB", reducedMotion: "reduce" });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: s, expiresAt: Date.now() + 3_600_000 })); }, t);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
  return p;
}
const detail = async (p: Page, id: string) => { await p.goto(`${BASE}/front-office/bookings/${id}`); await p.locator(`[data-booking-detail="${id}"]`).waitFor({ timeout: 30_000 }); };
const form = (p: Page, id: string) => p.locator(`[data-consult-record="${id}"]`);
const record = (id: string) => db.foConsultRecord.findFirst({ where: { firmId: M.id, bookingId: id } });

try {
  const host = await as(tok.host);
  // ------------------------------------------------------------------------------------------------ C1 J-S5
  await detail(host, B.lead);
  await form(host, B.lead).waitFor({ timeout: 15_000 });
  const items = await form(host, B.lead).locator("[data-recommended] li bdi").allInnerTexts();
  ok("C1 J-S5 pass: Attended → the Consult record opens with time spent = the booked length (45) and Recommended from the lead's Interested in (BR-15)",
    (await host.getByLabel("Time spent (minutes)").inputValue()) === "45" && JSON.stringify(items) === JSON.stringify([service.label]), items);
  await detail(host, B.noShow);
  ok("C1 J-S5 fail: No-show with no record → no Consult record section", (await host.getByRole("heading", { name: "Consult record" }).count()) === 0 && (await host.locator("[data-consult-record]").count()) === 0);
  const reader = await as(tok.reader);
  await detail(reader, B.lead);
  ok("C1 fail: Read-only (list key, not the host, no edit key) sees the booking but no Consult record", (await reader.getByRole("heading", { name: "Consult record" }).count()) === 0);

  // ------------------------------------------------------------------------------------------------ C2 J-S6, break M1
  await detail(host, B.fees); await form(host, B.fees).waitFor({ timeout: 15_000 });
  for (const bad of ["1 500,50", "15,00", "1,5", "10000000"]) {
    await host.getByLabel("Quoted fee (optional)").fill(bad); await host.getByRole("button", { name: "Save record" }).click();
    await host.getByText("Enter the fee as an amount up to 9,999,999.99").waitFor({ timeout: 5_000 });
  }
  ok('C2 fail (break M1): "1 500,50", "15,00", "1,5" and "10000000" are refused in words, nothing stored', (await record(B.fees)) === null);
  await host.getByLabel("Quoted fee (optional)").fill("1,500.50"); await host.getByLabel("Currency").selectOption("");
  await host.getByRole("button", { name: "Save record" }).click();
  await host.getByText("Choose a currency for the quoted fee.").waitFor({ timeout: 5_000 });
  ok("C2 J-S6 fail: a fee with no currency → \"Choose a currency for the quoted fee.\"; nothing stored", (await record(B.fees)) === null);
  await host.getByLabel("Currency").selectOption("USD"); await host.getByRole("button", { name: "Save record" }).click();
  await host.locator("[data-consult-saved]").waitFor({ timeout: 15_000 });
  const fees = await record(B.fees);
  // The form gives the focus back to Save a frame after "Saved" shows (consult-record.tsx: requestAnimationFrame once the
  // busy button lets go), so it is waited for, at most 5 s, and false on a timeout. Read at once, it was red on a busy
  // machine (the frame had not run yet) and green alone.
  const saveFocused = await host.waitForFunction(() => document.activeElement?.textContent === "Save record", undefined, { timeout: 5_000 }).then(() => true, () => false);
  ok('C2 J-S6 pass: "1,500.50" USD saves as 150050 minor units, "Saved"; the Save button keeps the focus', fees?.quotedFeeMinor === 150050 && fees.quotedFeeCurrency === "USD"
    && saveFocused, { focused: await host.evaluate(() => document.activeElement?.outerHTML.slice(0, 160) ?? null), fee: [fees?.quotedFeeMinor, fees?.quotedFeeCurrency] });

  // ------------------------------------------------------------------------------------------------ C3 the route's issues at their fields
  await host.getByLabel("Notes (optional)").fill("bad \u0001 text"); await host.getByRole("button", { name: "Save record" }).click();
  await host.getByText("no control characters").waitFor({ timeout: 10_000 });
  const notesField = await host.getByLabel("Notes (optional)").getAttribute("aria-invalid");
  ok("C3 pass (review M3): the route's refusal of the notes shows its words at the Notes field (aria-invalid), not only \"Please check the highlighted details.\"", notesField === "true" && (await record(B.fees))?.notes === null);
  await host.getByLabel("Notes (optional)").fill("");
  await host.getByLabel("Recommended item").fill("​"); await host.getByRole("button", { name: "+ Add" }).click();
  ok("C3 fail: an item of only an invisible mark is refused at + Add (\"Each item is 1 to 120 characters.\")", await host.getByText("Each item is 1 to 120 characters.").isVisible());
  await host.getByLabel("Recommended item").fill("");

  // ------------------------------------------------------------------------------------------------ C4 J-S7
  await detail(host, B.lead); await form(host, B.lead).waitFor();
  ok("C4 fail: no Next step before a record is saved", (await host.locator("[data-next-step]").count()) === 0);
  await host.getByRole("button", { name: "Save record" }).click(); await host.locator("[data-next-step]").waitFor({ timeout: 15_000 });
  const steps = await host.locator("[data-next-step] button").allInnerTexts();
  ok('C4 J-S7 pass: on a lead the Next step offers "Engage and prepare retainer" (not filled: Save record stays the one primary, review M4)', steps.join("|") === "Engage and prepare retainer"
    && !((await host.getByRole("button", { name: "Engage and prepare retainer" }).getAttribute("class")) ?? "").includes("bg-primary "), steps);
  await host.getByRole("button", { name: "Engage and prepare retainer" }).click();
  await host.getByRole("dialog", { name: "Engage" }).waitFor({ timeout: 15_000 });
  await host.getByRole("dialog", { name: "Engage" }).getByRole("button", { name: "Cancel" }).click();
  await host.getByRole("dialog", { name: "Engage" }).waitFor({ state: "detached" });
  ok("C4 J-S7 fail: Engage cancelled → no prospect for the lead", (await db.foProspect.count({ where: { firmId: M.id, leadId: Lena.lead.id } })) === 0);
  await detail(host, B.prospect); await form(host, B.prospect).waitFor();
  await host.getByRole("button", { name: "Save record" }).click(); await host.locator("[data-next-step]").waitFor({ timeout: 15_000 });
  await host.getByRole("button", { name: "Prepare retainer" }).click();
  await host.waitForURL(new RegExp(`/front-office/prospects/${String(prospect.body?.id)}$`), { timeout: 15_000 });
  ok("C4 J-S7 pass: on a prospect, Prepare retainer opens the prospect", true);
  await detail(host, B.caseCall); await form(host, B.caseCall).waitFor();
  await host.getByRole("button", { name: "Save record" }).click(); await host.locator("[data-consult-saved]").waitFor({ timeout: 15_000 });
  ok("C4 J-S7 fail: on a case (Follow-up) no retainer button and no Next step", (await host.locator("[data-next-step]").count()) === 0 && (await record(B.caseCall)) !== null);

  // ------------------------------------------------------------------------------------------------ C5 J-S8
  const att = await api(tok.host, "POST", `/front-office/bookings/${B.caseCall}/attendance`, { outcome: "NO_SHOW" });
  await detail(host, B.caseCall);
  await host.getByText("Attendance changed to No-show.").waitFor({ timeout: 15_000 });
  ok("C5 J-S8 pass: Attended changed to No-show → \"Attendance changed to No-show.\" over the record, read-only (no Save record)",
    att.status < 300 && (await host.locator("[data-consult-readonly]").count()) === 1 && (await host.getByRole("button", { name: "Save record" }).count()) === 0, att);
  ok("C5 fail: the record itself stays (AG-4-49 §12)", (await record(B.caseCall)) !== null);

  // ------------------------------------------------------------------------------------------------ C6 a stale save
  await detail(host, B.lead); await form(host, B.lead).waitFor();
  const now = await record(B.lead);
  const other = await api(tok.owner, "PUT", `/front-office/bookings/${B.lead}/consult-record`, { timeSpentMinutes: 50, version: now?.version });
  await host.getByLabel("Time spent (minutes)").fill("40"); await host.getByRole("button", { name: "Save record" }).click();
  await host.getByText("Someone else saved this record. Reload to see their changes.").waitFor({ timeout: 10_000 });
  ok("C6 fail: a save from a form read before someone else's save is refused in words; theirs (50) stays", other.status === 200 && (await record(B.lead))?.timeSpentMinutes === 50);
  await host.getByRole("button", { name: "Reload" }).click();
  await host.waitForFunction(() => (document.querySelector<HTMLInputElement>('[data-consult-record] input[inputmode="numeric"]')?.value ?? "") === "50", undefined, { timeout: 10_000 });
  ok("C6 pass: Reload shows their saved 50 minutes", true);

  // ------------------------------------------------------------------------------------------------ C7 ?engage=1 says why it did not open
  await reader.goto(`${BASE}/front-office/leads/${Lena.lead.id}?engage=1`);
  await reader.getByText("Engaging a lead needs a role that works prospects.").waitFor({ timeout: 15_000 });
  ok("C7 fail: ?engage=1 for Read-only opens no Engage panel and says why", (await reader.getByRole("dialog", { name: "Engage" }).count()) === 0);
  await host.goto(`${BASE}/front-office/leads/${Cleo.lead.id}?engage=1`);
  await host.getByText("This lead is closed, so it cannot be engaged.").waitFor({ timeout: 15_000 });
  ok("C7 fail (break M2): ?engage=1 on a closed lead opens no panel and says it is closed", (await host.getByRole("dialog", { name: "Engage" }).count()) === 0);
  await host.goto(`${BASE}/front-office/leads/${Lena.lead.id}?engage=1`);
  await host.getByRole("dialog", { name: "Engage" }).waitFor({ timeout: 15_000 });
  ok("C7 pass: ?engage=1 for the host opens the Engage panel once and drops the flag", !host.url().includes("engage=1"));
  await host.screenshot({ path: join(SHOTS, "fo3st1-consult-engage-1440.png") });
  ok("no page error in any browser", errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
