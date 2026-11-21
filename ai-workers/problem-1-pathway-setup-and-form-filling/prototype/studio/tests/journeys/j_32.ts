// J-32 (R1.32, assign, take, reassign; Unassigned): the screen part's walk on an isolated copy of the running app (its own
// database and port; never :4400), by screens at 1440 px, with the data read underneath. A new web enquiry lands in
// Unassigned leads (no assignment rule yet: FO-10, #2476, adds "follows the rule"); the walk ends on the lead's page, where
// the next capability starts (R1.33: its phone number).
//   W1: a visitor sends the web form → the Case Manager's Unassigned leads list shows the lead, owner Nobody;
//   W2: the Case Manager opens it and assigns it to the Case Officer (the picker: every active person of the firm);
//       the owner history says who assigned it to whom and when, and so does the audit line underneath;
//   W3: the Case Officer finds it under Mine; they see no Assign or Reassign, and the server refuses theirs (403);
//   W4: the Case Manager reassigns it to the Owner; the Owner reads both lines in the history, oldest first;
//   W5: a second enquiry: the Case Officer takes it from Unassigned leads; its history reads "<Case Officer> took it".
// The firm's web form is switched on by SQL, as an Owner does in Settings (QA-605; #2556 adds the switch by screens).
// Sample rows only; US$0, no model call. Repeatable on a kept copy (names carry a run stamp).
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j32 4432 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j32 4432 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_32.ts j32 4432
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { auditEvent } from "../../api/src/platform/audit/audit-event.ts";
import { ConsentStore } from "../../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "j32", Number(process.argv[3] ?? 4432)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-32", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
try {
  // ---------------------------------------------------------------------------------------------- setup (Sample)
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`);
  const wordingId = sql(`select consent_wording_version_id from fo_web_form where firm_id = '${A}' order by created_at limit 1`)
    || (await db.$transaction((tx) => new ConsentStore(auditEvent).publishWording(tx, { firmId: A, channel: "EMAIL", purpose: "MARKETING", locale: "en", text: "Send me news from the firm by email. I can stop at any time. (Sample)", by: "seed:J-32-test" }))).id;
  const token = sql(`update fo_web_form set enabled = true, consent_wording_version_id = '${wordingId}' where firm_id = '${A}' returning public_token`);
  ok("J-32 setup: firm A has a front office and its web form is on", !!A && fo.failed.length === 0 && !!token, fo.failed);
  const staff = (actor: string) => { const [id, email, name] = sql(`select id || '|' || email || '|' || display_name from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email, name }; };
  const R = staff("user-R"), T = staff("user-T"), O = staff("user-O");   // Owner, Case Manager, Case Officer
  const signIn = async (email: string) => {
    const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
    const t = ((await r.json()) as { token?: string }).token; if (t) return t;
    console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local)`); process.exit(2);
  };
  const tok = { R: await signIn(R.email), T: await signIn(T.email), O: await signIn(O.email) };
  const errors: string[] = [];
  async function pageAs(t: string | null): Promise<Page> {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
    if (t) await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
    p.on("pageerror", (e) => errors.push(String(e))); return p;
  }
  const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
  const send = async (given: string) => {
    const v = await pageAs(null);
    await v.goto(`${BASE}/front-office/web-form/${token}`);
    await v.getByLabel("First name", { exact: true }).waitFor({ timeout: 30_000 });
    await v.getByLabel("First name", { exact: true }).fill(given); await v.getByLabel("Last name (optional)").fill("Sample");
    await v.getByLabel("Email", { exact: true }).fill(`${given.toLowerCase()}@j32.example`);
    await v.waitForTimeout(2_500);   // the form's minimum fill time
    await v.getByRole("button", { name: "Send my enquiry" }).click();
    await v.locator('[data-form-state="thanks"]').waitFor({ timeout: 20_000 }); await v.context().close();
    return sql(`select l.id from fo_lead l join fo_person p on p.id = l.person_id where p.given_names = '${given}'`);
  };
  const ownerOf = (id: string) => sql(`select coalesce(owner_staff_id::text, '-') from fo_lead where id = '${id}'`);
  const history = (p: Page) => p.locator("[data-owner-history]").innerText();

  // ---------------------------------------------------------------- W1: the enquiry waits in Unassigned leads
  const given = `Uma${run}`, leadId = await send(given);
  const t = await pageAs(tok.T);
  await t.goto(`${BASE}/front-office/leads?view=unassigned`);
  const row = t.locator("tr[data-lead-row]", { hasText: given }).first(); await row.waitFor({ timeout: 30_000 });
  await shot(t, "w1-unassigned-1440");
  ok("J-32 W1: the new enquiry is in the Case Manager's Unassigned leads, owner Nobody", ownerOf(leadId) === "-" && (await row.locator("[data-owner]").innerText()).includes("Nobody"));

  // ---------------------------------------------------------------- W2: assign by screens
  await row.getByRole("link").first().click();
  await t.getByRole("heading", { level: 1, name: new RegExp(given) }).waitFor({ timeout: 20_000 });
  await t.locator("[data-assign-open]").click(); await t.locator("[data-assign-choices]").waitFor({ timeout: 10_000 });
  await shot(t, "w2-assign-panel-1440");
  await t.getByLabel(O.name, { exact: true }).check(); await t.getByRole("dialog").getByRole("button", { name: "Assign", exact: true }).click();
  await t.locator("[data-owner-history] li", { hasText: `assigned it to ${O.name}` }).waitFor({ timeout: 10_000 });
  await shot(t, "w2-assigned-1440");
  ok("J-32 W2: the Case Manager assigns it to the Case Officer by screens; the history says who, to whom and when", ownerOf(leadId) === O.id && (await history(t)).includes(`${T.name} assigned it to ${O.name}`), await history(t));
  ok("J-32 W2: underneath, the audit line names who assigned it, to whom, from nobody, with its time", sql(`select count(*) from audit_event where entity = 'fo_lead' and entity_key = '${leadId}' and action = 'lead.taken' and actor = 'staff:${T.id}' and detail->>'ownerStaffId' = '${O.id}' and detail->>'previousOwnerStaffId' is null and at is not null`) === "1");

  // ---------------------------------------------------------------- W3: the Case Officer has it, and cannot reassign
  const o = await pageAs(tok.O);
  await o.goto(`${BASE}/front-office/leads?view=mine`);
  await o.locator("tr[data-lead-row]", { hasText: given }).first().getByRole("link").first().click();
  await o.getByRole("heading", { level: 1, name: new RegExp(given) }).waitFor({ timeout: 20_000 });
  const refused = await fetch(`${BASE}/api/front-office/leads/${leadId}/assign`, { method: "POST", headers: { authorization: `Bearer ${tok.O}`, "content-type": "application/json" }, body: JSON.stringify({ staffId: R.id, expectedOwnerStaffId: O.id }) });
  await shot(o, "w3-case-officer-mine-1440");
  ok("J-32 W3: the Case Officer finds it under Mine, sees no Assign or Reassign, and the server refuses theirs (403)", (await o.locator("[data-assign-open]").count()) === 0 && refused.status === 403 && ownerOf(leadId) === O.id, refused.status);

  // ---------------------------------------------------------------- W4: reassign to the Owner
  await t.reload(); await t.locator("[data-assign-open]", { hasText: "Reassign" }).click(); await t.locator("[data-assign-choices]").waitFor({ timeout: 10_000 });
  await t.getByLabel(R.name, { exact: true }).check(); await t.getByRole("dialog").getByRole("button", { name: "Reassign", exact: true }).click();
  await t.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });
  const r = await pageAs(tok.R);
  await r.goto(`${BASE}/front-office/leads/${leadId}`);
  await r.locator("[data-owner-history] li", { hasText: `assigned it to ${R.name}` }).waitFor({ timeout: 20_000 });
  const h = await history(r);
  await shot(r, "w4-owner-reads-history-1440");
  ok("J-32 W4: reassigned to the Owner, who reads both lines in the history, oldest first", ownerOf(leadId) === R.id && h.indexOf(`assigned it to ${O.name}`) >= 0 && h.indexOf(`assigned it to ${O.name}`) < h.indexOf(`assigned it to ${R.name}`), h);

  // ---------------------------------------------------------------- W5: Take it from Unassigned leads
  const given2 = `Taro${run}`, lead2 = await send(given2);
  await o.goto(`${BASE}/front-office/leads?view=unassigned`);
  const row2 = o.locator("tr[data-lead-row]", { hasText: given2 }).first(); await row2.waitFor({ timeout: 30_000 });
  await row2.getByRole("button", { name: /^Take it/ }).click();
  await o.getByText(/You have lead L-/).first().waitFor({ timeout: 10_000 });
  await o.goto(`${BASE}/front-office/leads/${lead2}`);
  await o.locator("[data-owner-history] li", { hasText: "took it" }).waitFor({ timeout: 20_000 });
  await shot(o, "w5-taken-ends-on-lead-1440");
  ok("J-32 W5: the Case Officer takes the second enquiry from Unassigned leads; its history reads \"<Case Officer> took it\"", ownerOf(lead2) === O.id && (await history(o)).includes(`${O.name} took it`), await history(o));
  ok("J-32: no page error in the walk", errors.length === 0, errors);
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
