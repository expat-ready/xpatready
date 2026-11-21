// J-110 (R1.110, the client identity check; brief lead-b-briefs/FO-13s.md Part B, P-728): the row's walk on an isolated
// copy of the running app (its own database and port; never :4400), in a real browser against the real routes: no fake
// API, no stubbed request.
//   W1: before any check, a retainer Send for the person answers the warning "No identity check is recorded for <name>."
//       and the person's lead page says the same sentence;
//   W2: a Case Officer records a check on the lead page (a passport, the firm's today as expiry, a PDF copy);
//   W3: it is listed (plain words, ···last 4, who checked) and Open copy saves the same bytes;
//   W4: a retainer Send after the check answers no warning;
//   W5: an expiry before the firm's today shows "This document has expired. Check a current one." on the field (FO-13i
//       part 2's 422, the firm's own rule, P-735; Unconfirmed: no counsel), and nothing is stored; the server itself answers 422 on fields.documentExpiry (QA-510).
//   W6: the won prospect's client page shows the check read-only: method, type, country, expiry, who and when (FO-13s
//       part 2, QA-610, QA-611);
// Scaffolding (P-33): no retainer screen is on main (FO-5s not built), so W1 and W4's Send goes through FO-5's real API
// (template upload, draft, send) as the firm's Owner, and W6's win is FO-2w's Convert route as the Owner, its client found
// by the database once FO-8's poll makes it; everything else (record, list, copy, the client page) is by screens.
// Run from prototype/ (US$0, no model call; HEADED=1 for a visible browser):
//   zsh studio/tools/isolated.sh j110 4437 start --ttl 30 PLATFORM_IDENTITY=local PROSPECT_WON_POLL_MS=500 && trap 'zsh studio/tools/isolated.sh j110 4437 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_110.ts j110 4437
import "reflect-metadata";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { buildDocx } from "../../api/src/front-office/retainers/docx.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { readSetting, TIME_ZONE } from "../../api/src/platform/settings.ts";

const POLL = Number(process.env.PROSPECT_WON_POLL_MS) || 500;   // the copy is started with the same value (the run line)
const [NAME, PORT] = [process.argv[2] ?? "j110", Number(process.argv[3] ?? 4437)];
const BASE = `http://127.0.0.1:${PORT}`, DB_URL = `postgresql://xr_studio@127.0.0.1:54329/xr_studio_${NAME}`;
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "screens", "J-110"); mkdirSync(SHOTS, { recursive: true });
const WORK = join(import.meta.dirname, "..", "..", "var", `j110-${process.pid}`); mkdirSync(WORK, { recursive: true });
const EXPIRED = "This document has expired. Check a current one.";
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL, options: "-c TimeZone=UTC" }) });
const run = Date.now().toString(36), who = `Client J${run} Sample`;

async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  throw new Error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`);
}
const api = async (tok: string, method: string, path: string, body?: unknown) => {
  const form = body instanceof FormData;
  const r = await fetch(`${BASE}/api/front-office${path}`, { method, headers: { authorization: `Bearer ${tok}`, ...(body && !form ? { "content-type": "application/json" } : {}) }, body: body === undefined ? undefined : form ? body : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) as any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- answers read loosely, as in the other walks
};

await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
const firm = await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } });
const staff = (actorId: string) => db.platformStaff.findFirstOrThrow({ where: { firmId: firm.id, actorId } });
const R = await staff("user-R"), O = await staff("user-O");   // Owner (templates, retainers); Case Officer (the check)
const zone = await readSetting<string>(db, firm.id, TIME_ZONE.key);
const dayIn = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const TODAY = dayIn(Date.now()), LAST_YEAR = dayIn(Date.now() - 400 * 86_400_000);
const person = await db.foPerson.create({ data: { firmId: firm.id, givenNames: `Client J${run}`, familyName: "Sample", email: `j110-${run}@example.com`, createdBy: "seed:j110" } });
const lead = await db.foLead.create({ data: { firmId: firm.id, personId: person.id, door: "MANUAL", source: "WEBSITE", ownerStaffId: O.id, createdBy: "seed:j110" } });
const rTok = await signIn(R.email), oTok = await signIn(O.email);
const rows = () => db.foIdentityCheck.count({ where: { personId: person.id } });
const tplForm = new FormData();
tplForm.append("name", `J-110 retainer ${run}`);
tplForm.append("file", new Blob([buildDocx(["Client {client.name}", "{#fees}", "{label}: {amount}", "{/fees}"])]), "j110.docx");
const tpl = await api(rTok, "POST", "/retainer-templates", tplForm);
/** Engage makes a new prospect each time (FO-4 part 2a); a retainer is drafted on it and sent, as the Owner. */
async function sendRetainer() {
  const p = await api(oTok, "POST", `/leads/${lead.id}/engage`);
  const d = await api(rTok, "POST", `/prospects/${p.body?.id}/retainers`, { templateId: tpl.body?.id, fees: [{ label: "Fee (Sample)", amountMinor: 100000, when: "ON_SIGNING" }] });
  // FO-13c: no retainer is sent without a recorded conflict check; recorded through its API (the panel is FO-13s).
  const c = await api(rTok, "POST", "/conflict-checks", { prospectId: p.body?.id, requestId: crypto.randomUUID(), result: "NO_CONFLICT" });
  const s = await api(rTok, "POST", `/retainers/${d.body?.id}/send`, { expectedVersion: 1 });
  return { steps: [p.status, d.status, c.status, s.status], warnings: s.body?.warnings as string[] | undefined, status: s.body?.status, prospectId: p.body?.id as string };
}
ok("J-110 setup: the Sample firm, a person with a lead owned by the Case Officer, and a retainer template", tpl.status === 201 || tpl.status === 200, tpl);

const browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce", acceptDownloads: true }), o = await ctx.newPage();
  await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, oTok);
  o.on("pageerror", (e) => errors.push(String(e)));
  const shot = (n: string) => o.screenshot({ path: join(SHOTS, `${n}.png`), fullPage: true });
  const panel = o.locator("[data-identity-panel]"), drawer = o.getByRole("dialog", { name: "Record an identity check" });

  // ----------------------------------------------------------------------------------------------------------- W1
  const before = await sendRetainer();
  const sentence = `No identity check is recorded for ${who}.`;
  ok("J-110 W1 pass: before any check, the retainer Send answers SENT with the warning naming the person", before.status === "SENT" && JSON.stringify(before.warnings) === JSON.stringify([sentence]), before);
  await o.goto(`${BASE}/front-office/leads/${lead.id}`); await panel.locator("[data-no-check]").waitFor({ timeout: 30_000 });
  ok("J-110 W1: the lead page says the same sentence in its Identity check section", (await panel.innerText()).includes(sentence));
  await shot("w1-no-check-1440");

  // ----------------------------------------------------------------------------------------------------------- W2
  const PDF = join(WORK, "passport.pdf"); writeFileSync(PDF, `%PDF-1.4\n% J-110 Sample copy ${run}\n%%EOF\n`);
  await panel.getByRole("button", { name: "Record a check" }).click(); await drawer.waitFor();
  await drawer.getByLabel("Method").selectOption("DOCUMENT_COPY");
  await drawer.getByLabel(/^Document type/).selectOption("PASSPORT");
  await drawer.getByLabel(/^Issuing country/).fill("IN");
  await drawer.getByLabel(/^Last 4/).fill("4K9Z");
  await drawer.getByLabel(/^Expiry date/).fill(TODAY);
  await drawer.getByLabel(/^Copy/).setInputFiles(PDF);
  await drawer.getByLabel("Name", { exact: true }).check(); await drawer.getByLabel("Email", { exact: true }).check();
  await shot("w2-record-1440");
  await drawer.getByRole("button", { name: "Save check" }).click();
  await drawer.waitFor({ state: "detached", timeout: 15_000 });
  ok("J-110 W2: the Case Officer saves the check by screens: one row for one Save", (await rows()) === 1);

  // ----------------------------------------------------------------------------------------------------------- W3
  const row = panel.locator("[data-check]").first(); await row.waitFor({ timeout: 15_000 });
  ok("J-110 W3 pass: it is listed with plain words, the last 4 only, the expiry and who checked",
    (await row.locator("[data-doc]").innerText()) === "Passport, IN ···4K9Z" && (await row.locator("[data-expiry]").innerText()) === new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${TODAY}T00:00:00Z`)) && (await row.locator("[data-details]").innerText()) === "Name, Email"
    && /Document copy/.test(await row.innerText()) && (await row.innerText()).includes(O.displayName), await row.innerText());
  ok("J-110 W3 fail: the no-check sentence is gone", (await panel.locator("[data-no-check]").count()) === 0);
  const dl = o.waitForEvent("download", { timeout: 15_000 });
  await row.getByRole("button", { name: "Open copy" }).click();
  const got = await dl, saved = join(WORK, "downloaded.pdf"); await got.saveAs(saved);
  ok("J-110 W3: Open copy saves the same bytes that were uploaded", readFileSync(saved).equals(readFileSync(PDF)));
  await shot("w3-listed-1440");

  // ----------------------------------------------------------------------------------------------------------- W4
  const after = await sendRetainer();
  ok("J-110 W4 fail: after the check, the retainer Send answers SENT with no warning", after.status === "SENT" && Array.isArray(after.warnings) && after.warnings.length === 0, after);

  // ----------------------------------------------------------------------------------------------------------- W5
  await panel.getByRole("button", { name: "Record a check" }).click(); await drawer.waitFor();
  await drawer.getByLabel(/^Document type/).selectOption("PASSPORT");
  await drawer.getByLabel(/^Issuing country/).fill("IN");
  await drawer.getByLabel(/^Last 4/).fill("4K9Z");
  await drawer.getByLabel(/^Expiry date/).fill(LAST_YEAR);
  await drawer.getByLabel("Name", { exact: true }).check();
  const refusal = o.waitForResponse((r) => r.request().method() === "POST" && /\/identity-checks$/.test(new URL(r.url()).pathname));
  await drawer.getByRole("button", { name: "Save check" }).click();
  const refused = await refusal; const refusedBody = await refused.json().catch(() => null);
  ok("J-110 W5: the server refuses the expired document as the basis (422 on fields.documentExpiry, FO-13i part 2, QA-510)",
    refused.status() === 422 && JSON.stringify(refusedBody ?? {}).includes("documentExpiry"), { status: refused.status(), body: refusedBody });
  await drawer.locator("[data-error-summary]").waitFor({ timeout: 10_000 });
  ok("J-110 W5: an expiry before the firm's today shows the sentence on the field, the panel stays open and nothing is stored",
    (await drawer.getByText(EXPIRED, { exact: true }).count()) === 1 && (await drawer.getByLabel(/^Expiry date/).getAttribute("aria-invalid")) === "true" && (await rows()) === 1);
  await shot("w5-expired-1440");
  // ----------------------------------------------------------------------------------------------------------- W6
  // FO-13s part 2 (QA-610, QA-611): the won prospect's client page shows the person's checks read-only, with the method,
  // the document's type and country, its expiry, who checked and when (in the firm's words, the same row as the lead page).
  const conv = await api(rTok, "POST", `/prospects/${after.prospectId}/convert`, {});
  let clientId: string | undefined;
  for (const until = Date.now() + 3 * POLL + 5_000; !clientId && Date.now() < until; await new Promise((res) => setTimeout(res, 100)))
    clientId = (await db.caseClient.findFirst({ where: { prospectId: after.prospectId }, select: { id: true } }))?.id;
  ok("J-110 W6 setup: Convert to client wins the prospect, and the app's poll makes its client (FO-8), linked to the same person",
    conv.status === 200 && !!clientId && (await db.caseClient.findUnique({ where: { id: clientId! } }))?.foPersonId === person.id, { conv: conv.status, clientId });
  await o.goto(`${BASE}/clients/${clientId}`);
  await o.locator(`[data-client-page]`).waitFor({ timeout: 60_000 });
  const cPanel = o.locator("[data-identity-panel]"), cRow = cPanel.locator("[data-check]").first();
  await cRow.waitFor({ timeout: 15_000 });
  const cText = await cRow.innerText(), checker = O.displayName;
  // QA-611 (review M2): "when" is the stored checked_at, shown as the panel shows it (en-CA, medium date, short time,
  // in the browser's zone); a time that is not the stored one fails here.
  const savedAt = (await db.foIdentityCheck.findFirstOrThrow({ where: { personId: person.id }, orderBy: { checkedAt: "desc" } })).checkedAt.toISOString();
  const shownWhen = await cRow.locator("[data-checked]").innerText(), shownIso = await cRow.locator("[data-checked]").getAttribute("data-checked");
  const expectWhen = await o.evaluate((iso) => new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)), savedAt);
  ok("J-110 W6 pass: the client page lists the check with method, document type and country, expiry, who checked and when",
    (await cPanel.locator("[data-check]").count()) === 1 && /Document copy/.test(cText) && (await cRow.locator("[data-doc]").innerText()) === "Passport, IN ···4K9Z"
      && (await cRow.locator("[data-expiry]").innerText()) === new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${TODAY}T00:00:00Z`))
      && cText.includes(`${expectWhen} by ${checker}`) && shownWhen === expectWhen && shownIso === savedAt, { cText, shownWhen, expectWhen, shownIso, savedAt });
  ok("J-110 W6 fail: on the client page the panel is read-only (no Record a check; checks are recorded on the lead or prospect page)",
    (await cPanel.getByRole("button", { name: "Record a check" }).count()) === 0);
  await shot("w6-client-1440");
  ok("J-110: no page error in any browser step", errors.length === 0, errors);
} finally {
  await browser.close(); await db.$disconnect(); rmSync(WORK, { recursive: true, force: true });
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
