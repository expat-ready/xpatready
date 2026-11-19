// J-33 (R1.33, phone numbers; FO-9a's phone part, brief lead-b-briefs/FO-9a.md amendment 19 Nov 11:23 IST, Lead B; J4
// lane 4): a person's walk on an isolated copy of the running app (its own database and port; never :4400), by screens
// at 1440 px, with the data read underneath. Rev 17.21: a public door keeps an unreadable phone as typed and flags it
// "Fix number"; staff fixing it are refused an impossible number and a readable one keeps its country.
//   W1: a visitor sends the firm's web form with phone "12" → the lead shows Fix number on the Leads list and its page;
//   W2: staff press Fix number and enter "12" → the field's sentence, and nothing is saved;
//   W3: staff enter "+1 416 555 0100" → saved (E.164), the pill goes away, and the list no longer flags it;
//   W4: firm B's person, asked by firm A's staff → 404 (the route), and nothing of B's changes.
// Sample rows only (the web form switched on by SQL, as an Owner would in settings); US$0, no model call. Repeatable on a
// kept copy (each run's names carry a run stamp).
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j33 4433 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j33 4433 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_33.ts j33 4433
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { UNREADABLE_PHONE } from "../../api/src/front-office/people/edit.ts";
import { auditEvent } from "../../api/src/platform/audit/audit-event.ts";
import { ConsentStore } from "../../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j33", Number(process.argv[3] ?? 4433)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-33", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const { sql } = client(PORT, DBNAME);
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
try {
  // ---------------------------------------------------------------------------------------------- setup (Sample)
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  const firmId = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firmId("sample-firm"), B = firmId("sample-solo");
  // An enabled form needs its consent wording (fo_web_form_consent_check): published once per copy through PF-19a's store.
  const wordingId = sql(`select consent_wording_version_id from fo_web_form where firm_id = '${A}' order by created_at limit 1`)
    || (await db.$transaction((tx) => new ConsentStore(auditEvent).publishWording(tx, { firmId: A, channel: "EMAIL", purpose: "MARKETING", locale: "en", text: "Send me news from the firm by email. I can stop at any time. (Sample)", by: "seed:J-33-test" }))).id;
  const token = sql(`update fo_web_form set enabled = true, consent_wording_version_id = '${wordingId}' where firm_id = '${A}' returning public_token`).split("\n")[0];
  ok("J-33 setup: both Sample firms have a front office, and firm A's web form is switched on", !!A && !!B && fo.failed.length === 0 && !!token, fo.failed);
  const staff = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
  const R = staff("user-R"), S = staff("user-S");   // firm A's Owner; firm B's Owner
  async function signIn(firmKey: string, email: string): Promise<string> {
    const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, email, secondStep: true }) });
    const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
    console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
  }
  const tok = { R: await signIn("sample-firm", R.email), S: await signIn("sample-solo", S.email) };
  const api = async (t: string, method: string, path: string, body?: unknown): Promise<Ans> => {
    const r = await fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${t}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const errors: string[] = [];
  async function pageAs(t: string | null): Promise<Page> {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
    if (t) await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
    p.on("pageerror", (e) => errors.push(String(e))); return p;
  }
  const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

  // ------------------------------------------------------------- W1: a web-form lead with "12" shows Fix number
  const given = `Wren${run}`;
  const visitor = await pageAs(null);
  await visitor.goto(`${BASE}/front-office/web-form/${token}`);
  await visitor.getByLabel("First name", { exact: true }).waitFor({ timeout: 30_000 });
  await visitor.getByLabel("First name", { exact: true }).fill(given);
  await visitor.getByLabel("Last name (optional)").fill("Sample");
  await visitor.getByLabel("Email", { exact: true }).fill(`wren.${run}@j33.example`);
  await visitor.getByLabel("Phone (optional)").fill("12");
  const consent = visitor.getByRole("checkbox"); if (await consent.count()) await consent.first().check();
  await visitor.waitForTimeout(2_500);   // the form's minimum fill time (LIMITS.minFillSeconds)
  await visitor.getByRole("button", { name: "Send my enquiry" }).click();
  await visitor.locator('[data-form-state="thanks"]').waitFor({ timeout: 20_000 });
  await shot(visitor, "W1-web-form-sent-with-12-1440");
  const [leadId, personId] = sql(`select l.id || '|' || p.id from fo_lead l join fo_person p on p.id = l.person_id where p.given_names = '${given}'`).split("|");
  const row = () => sql(`select coalesce(phone, '-') || '|' || phone_readable || '|' || coalesce(phone_e164, '-') from fo_person where id = '${personId}'`);
  ok("J-33 W1: the visitor's enquiry arrives as a web-form lead, the phone kept as typed (\"12\") and marked unreadable", !!leadId && sql(`select door from fo_lead where id = '${leadId}'`) === "WEB_FORM" && row() === "12|false|-", row());

  const owner = await pageAs(tok.R);
  const listRow = async () => {
    await owner.goto(`${BASE}/front-office/leads?view=unassigned`);
    const r = owner.locator("tr[data-lead-row]", { hasText: given }).first(); await r.waitFor({ timeout: 30_000 }); await owner.waitForTimeout(300);
    return r.innerText();
  };
  const before = await listRow();
  await shot(owner, "W1-leads-list-fix-number-1440");
  ok("J-33 W1: the Owner's Leads list flags the lead \"Fix number\"", before.includes("Fix number"), before);
  await owner.locator("tr[data-lead-row]", { hasText: given }).first().getByRole("link").first().click();
  await owner.getByRole("heading", { level: 1, name: new RegExp(given) }).waitFor({ timeout: 20_000 });
  const fixButton = owner.locator("[data-fix-number]");
  ok("J-33 W1: the lead page's Phone row shows 12 with the Fix number pill, which can be pressed", (await fixButton.count()) === 1 && (await owner.locator("main").innerText()).includes("12"));
  await shot(owner, "W1-lead-page-fix-number-1440");

  // ------------------------------------------------------------- W2: "12" → the field's sentence, nothing saved
  await fixButton.click();
  const field = owner.getByLabel("Phone", { exact: true });
  await field.waitFor({ timeout: 10_000 });
  ok("J-33 W2: Fix number opens the phone field, focused, with the number in it", (await field.inputValue()) === "12" && (await field.evaluate((e) => e === document.activeElement)));
  await field.fill("12"); await owner.keyboard.press("Enter");
  const alert = owner.locator("#fo-phone-edit-error");
  await alert.waitFor({ timeout: 10_000 });
  await shot(owner, "W2-twelve-refused-1440");
  ok("J-33 W2: staff entering \"12\" see the field's sentence under the field (role alert, the field marked invalid)", (await alert.innerText()).trim() === UNREADABLE_PHONE && (await field.getAttribute("aria-invalid")) === "true", await alert.innerText());
  ok("J-33 W2: nothing is saved: the person still holds \"12\", unreadable, and no phone audit line exists", row() === "12|false|-" && sql(`select count(*) from audit_event where entity = 'fo_person' and entity_key = '${personId}' and action = 'front_office.person.phone_changed'`) === "0", row());
  const axe = await new AxeBuilder({ page: owner }).include("[data-phone-edit]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  ok("J-33 W2: the open phone field passes axe (WCAG 2.1 A and AA) with its error showing", axe.violations.length === 0, axe.violations.map((v) => `${v.id}: ${v.help}`));
  const api422 = await api(tok.R, "PATCH", `/front-office/people/${personId}`, { phone: "12" });
  ok("J-33 W2: the same through the route: 422 with the field's sentence in fields.phone", api422.status === 422 && api422.body?.fields?.phone === UNREADABLE_PHONE, api422);

  // ------------------------------------------------------------- W3: "+1 416 555 0100" → saved, pill gone, list clear
  await field.fill("+1 416 555 0100"); await owner.getByRole("button", { name: "Save" }).click();
  await owner.locator("[data-phone-edit]").waitFor({ state: "detached", timeout: 10_000 });
  await owner.getByText("+14165550100").first().waitFor({ timeout: 10_000 });
  await shot(owner, "W3-saved-pill-gone-1440");
  ok("J-33 W3: the number is saved and shown in E.164 (+14165550100), and the Fix number pill is gone", (await owner.locator("[data-fix-number]").count()) === 0 && !(await owner.locator("main").innerText()).includes("Fix number"));
  ok("J-33 W3: underneath, the person holds +14165550100, readable, and the database's phone_e164 follows", row() === "+14165550100|true|+14165550100", row());
  const after = await listRow();
  await shot(owner, "W3-leads-list-no-flag-1440");
  ok("J-33 W3: the Leads list no longer flags the lead", !after.includes("Fix number"), after);
  ok("J-33 W3: one phone audit line, with ids only (no number)", sql(`select count(*) || '|' || bool_and(detail::text !~ '4165550100|555') from audit_event where entity = 'fo_person' and entity_key = '${personId}' and action = 'front_office.person.phone_changed'`) === "1|true");

  // ------------------------------------------------------------- W4: firm B's person → 404
  const bLead = await api(tok.S, "POST", "/front-office/leads", { requestId: randomUUID(), givenNames: `Bea${run}`, familyName: "Sample", phone: "12", source: "Phone call (Sample)", confirmedNew: true });
  const bPerson = String(bLead.body?.person?.id ?? "");
  const cross = await api(tok.R, "PATCH", `/front-office/people/${bPerson}`, { phone: "+1 416 555 0101" });
  ok("J-33 W4: firm A's Owner asking to change firm B's person's phone → 404, and B's person still holds \"12\"",
    bLead.status === 201 && cross.status === 404 && sql(`select phone || '|' || phone_readable from fo_person where id = '${bPerson}'`) === "12|false", { b: bLead.status, cross });
  const own = await api(tok.S, "PATCH", `/front-office/people/${bPerson}`, { phone: "+1 416 555 0101" });
  ok("J-33 W4: firm B's Owner can fix their own person (the 404 is the firm wall, not a broken route)", own.status === 200 && own.body?.phone === "+14165550101", own);
  ok("J-33: no page error in the walk", errors.length === 0, errors);
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
