// J-45 (map row 45, R1.45: "Firm templates, field picker, preview with a real record"), the acceptance journey for the
// row. The capability itself landed with R1.46's part (#3179: PF-19s screens with the thin PF-19c part 1 API); this walk
// proves R1.45's own clauses by screens, as the firm's Owner on an isolated copy (its own database and port, never
// :4400), with the API and the database read underneath (AG-12-44, -66, -70, -89; AG-12-45's publish half only: drafts
// are PF-19c part 2, not built; SA-05 §3.6.1).
// Done when (CAPABILITIES R1.45), word for word as the steps:
//   W1 "A template uses only picker fields": the Owner signs in on the sign-in card, reaches Templates from My account's
//      menu; the Follow-up is "ExpatReady's wording" until the firm publishes (a firm template, AG-12-44); in the editor
//      the "Insert field" list offers exactly the lead's fields from the product's registry (no passport or financial
//      field, SA-5-63), every field in the starter is one of them, and a field picked there goes in as {{ key }}.
//   W2 "preview fills it from a chosen real record": the Owner types a lead's name in "Preview with a real lead", picks it,
//      and the preview says it is that lead and shows that lead's own first name, number and the firm's name as the
//      database holds them (AG-12-89); "Use the Sample lead" goes back to made-up details. Fail: the Case Officer (own
//      leads only) finds no such lead on the screen, and the API answers 404 for its id, as the lead read does.
//   W3 "an unknown field refused on save, named": the Owner types {{ passport_number }} in the message; the preview marks
//      it "not a field"; Publish says "Not published", the message field is aria-invalid and its note names
//      {{ passport_number }}; nothing stored. The API refuses the same on its field (422), and a typed unknown field in
//      the subject too. Pass: with the unknown field removed, Publish stores version n+1 holding only picker fields, and
//      the list then says "Your wording, version n+1" (AG-12-45, its publish half).
//   W4 1440 px: the editor with a real lead's preview has no sideways scroll and no WCAG 2.2 A/AA violation (axe); no
//      page error on any page walked.
//   W5 the walk ends at R1.46's first step (the next item in J3): the message is one plain text box ready to type in.
// Re-runnable on one copy (each run reads the current version first; its lead names carry the run's id). Sample firms,
// leads and wording only; US$0, no model call, live AI off, no live mail. Screenshots: product/screens/J-45/screenshots/.
// Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j45 4455 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j45 4455 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_45.ts j45 4455
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Locator, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { platformAuditWorkspaceId } from "../../api/src/platform/audit/audit-event.ts";
import { FIELDS, kindOf } from "../../api/src/platform/messages/templates/registry.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../../api/src/platform/settings.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j45", Number(process.argv[3] ?? 4455)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-45", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
const run = Date.now().toString(36).slice(-5);
type Ans = { status: number; body: any; text: string };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j, text };
};
/** Is it there within ms? (a missing part answers false, never throws) */
const seen = (l: Locator, ms = 8_000) => l.first().waitFor({ timeout: ms }).then(() => true, () => false);

// ------------------------------------------------------------------------------------------------ the product's registry
const KIND = kindOf("sales.lead.follow_up");
const KEY = KIND?.key ?? "sales.lead.follow_up", KNAME = KIND?.name ?? "Follow-up";
const LEAD_FIELDS = FIELDS[KIND?.recordType ?? "lead"];
const PATH = `/platform/templates/${encodeURIComponent(KEY)}`;

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`), FIRM = sql(`select operating_name from platform_firm where key = 'sample-firm'`);
const email = (actor: string) => sql(`select email from platform_staff where actor_id = '${actor}' and firm_id = '${A}'`);
const staffId = (actor: string) => sql(`select id from platform_staff where actor_id = '${actor}' and firm_id = '${A}'`);
const R = email("user-R"), O = email("user-O"), RID = staffId("user-R");
const versions = () => Number(sql(`select count(*) from msg_template_version v join msg_template t on t.id = v.template_id where t.firm_id = '${A}' and t.key = '${KEY}'`) || "0");
const storedBody = () => { const b = sql(`select replace(encode(convert_to(v.body, 'UTF8'), 'base64'), E'\\n', '') from msg_template_version v join msg_template t on t.id = v.template_id where t.firm_id = '${A}' and t.key = '${KEY}' order by v.version desc limit 1`); return b ? Buffer.from(b, "base64").toString("utf8") : null; };
async function token(mail: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email: mail, secondStep: true }) });
  return ((await r.json().catch(() => ({}))) as { token?: string }).token ?? "";
}
// The real record: a lead the Owner owns, added the way the front office adds one (its own API), before the walk.
const TR0 = await token(R);
const added = await api(TR0, "POST", "/front-office/leads", { requestId: randomUUID(), givenNames: "Noor", familyName: `Rahimi${run}`, email: `rahimi.${run}@sample.invalid`, source: "Phone", confirmedNew: true });
const LEAD = (added.body?.id ?? added.body?.lead?.id ?? added.body?.leadId ?? "") as string;
if (LEAD) sql(`update fo_lead set owner_staff_id = '${RID}' where id = '${LEAD}'`);
// Each person sees their own leads (the firm's "everyone sees all" off): the Case Officer cannot open the Owner's lead.
await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:j45", workspaceId: await platformAuditWorkspaceId(db), reason: "J-45 walk" });
const held = LEAD ? { first: sql(`select p.given_names from fo_lead l join fo_person p on p.id = l.person_id where l.id = '${LEAD}'`), number: sql(`select number from fo_lead where id = '${LEAD}'`) } : null;
ok("J-45 setup: the Sample firm with its front office, the Owner (user-R), the Case Officer (user-O), and one real lead the Owner owns",
  !!A && !!R && !!O && fo.failed.length === 0 && !!LEAD && !!held?.number && !!KIND, { lead: added.status, held, kind: !!KIND });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1", slowMo: process.env.HEADED === "1" ? 150 : 0, ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errors: string[] = [];
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `j45-${name}.png`), fullPage: true }).catch(() => undefined);
async function signIn(mail: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e))); p.on("console", (m) => { if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });   // a refused 422 or 404 is a step's own check, not an error
  p.on("dialog", (d) => { void (d.type() === "beforeunload" ? d.accept() : d.dismiss()); });
  await p.goto(`${BASE}/account`);
  await p.getByLabel("Firm key").fill("sample-firm"); await p.getByLabel("Work email").fill(mail); await p.getByRole("button", { name: "Sign in" }).click();
  await p.getByLabel("Firm key").waitFor({ state: "detached", timeout: 30_000 });
  return p;
}
const pageToken = (p: Page) => p.evaluate(() => (JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}") as { token?: string }).token ?? "");
const box = (p: Page) => p.locator("[data-template-body]");
const said = (p: Page, re: RegExp) => p.locator("[data-template-said-text]").filter({ hasText: re }).first().innerText({ timeout: 20_000 }).catch(() => "");
const noteOf = (l: Locator) => l.evaluate((el) => { const id = el.getAttribute("aria-describedby"); return id ? document.getElementById(id)?.textContent ?? "" : ""; }).catch(() => "");
const preview = (p: Page) => p.locator("[data-preview-body]").innerText({ timeout: 10_000 }).catch(() => "");
const until = async (fn: () => Promise<boolean>, ms = 15_000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 300)); } return false; };
const fieldsIn = (s: string) => [...s.matchAll(/\{\{([^{}]*)\}\}/g)].map((m) => m[1].trim());

try {
  // ---------------------------------------------------------------------------------------------- W1 only picker fields
  const p = await signIn(R); const TR = await pageToken(p);
  const entry = p.locator('nav[aria-label="My account"] a[href="/platform/templates"]');
  const hasEntry = await seen(entry, 15_000);
  if (hasEntry) await entry.first().click(); else await p.goto(`${BASE}/platform/templates`);
  const row = p.locator(`[data-template-row="${KEY}"]`);
  await seen(row, 20_000);
  const v0 = versions();
  const whose0 = await row.locator("[data-template-whose]").innerText().catch(() => "");
  ok(`J-45 W1: the Owner signs in and finds Templates in My account's menu; the ${KNAME} says "${v0 ? `Your wording, version ${v0}` : "ExpatReady's wording"}" (a firm template: ExpatReady's until the firm publishes, AG-12-44)`,
    hasEntry && whose0 === (v0 ? `Your wording, version ${v0}` : "ExpatReady's wording"), { hasEntry, whose0, v0 });
  await row.locator(`[data-template-open="${KEY}"]`).click();
  const hasEditor = await seen(p.locator("[data-template-form]"), 20_000);
  const pick = p.getByLabel("Insert field");
  const offered = hasEditor ? (await pick.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).filter(Boolean) : [];
  // The lead's fields as the agreed concept lists them (screens/PF-19s-templates/concept.md §5), not read back from the
  // registry, so a field added to the registry without a decision fails here (review m3).
  const keys = ["lead_first_name", "lead_full_name", "lead_number", "firm_name", "owner_name"];
  const starter = KIND ? `${KIND.starter.subject}\n${KIND.starter.body}` : "";
  ok(`J-45 W1: the editor's Insert field list offers exactly the lead's fields the concept agreed (${keys.join(", ")}), the registry's too, none a passport or financial field (SA-5-63), and every field in ExpatReady's starter is one of them (AG-12-70)`,
    hasEditor && offered.length === keys.length && keys.every((k) => offered.includes(k)) && LEAD_FIELDS.length === keys.length && !offered.some((k) => /passport|bank|card|account|sin\b|income|fund/i.test(k))
      && fieldsIn(starter).length > 0 && fieldsIn(starter).every((f) => keys.includes(f)), { offered, starter: fieldsIn(starter) });
  const v1 = versions(), before = await box(p).inputValue().catch(() => "");
  if (hasEditor) {
    await box(p).evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }); await box(p).press("End");
    await box(p).pressSequentially(`\nRef. `);
    await pick.selectOption({ label: LEAD_FIELDS.find((f) => f.key === "lead_full_name")?.label ?? "Lead's full name" });
    await p.locator("[data-template-field-insert]").click();
  }
  await until(async () => (await box(p).inputValue().catch(() => "")).endsWith("{{ lead_full_name }}"), 5_000);
  const withField = await box(p).inputValue().catch(() => "");
  await shot(p, "w1-picker-field-inserted-1440");
  ok("J-45 W1: a field picked from Insert field goes into the message as {{ lead_full_name }}; nothing is stored before Publish",
    withField === `${before}\nRef. {{ lead_full_name }}` && versions() === v1, { tail: withField.slice(-40), versions: [v1, versions()] });

  // ---------------------------------------------------------------------------------------------- W2 real-record preview
  const find = p.locator("[data-preview-find]");
  let picked = false;
  if (await seen(find, 10_000) && held) {
    await find.fill(`Rahimi${run}`);
    const choice = p.locator(`[data-preview-pick*="${held.number}"]`);
    picked = await seen(choice, 15_000);
    if (picked) await choice.click();
  }
  const filled = picked && held ? await until(async () => (await preview(p)).includes(`Ref. ${held.first} Rahimi${run}`)) : false;
  const realBody = await preview(p), recordLine = await p.locator("[data-preview-record]").innerText().catch(() => "");
  await shot(p, "w2-real-lead-preview-1440");
  ok(`J-45 W2: the Owner types the lead's name in "Preview with a real lead", picks it, and the preview says it is that lead (${held?.number ?? "?"}) and fills its own first name "${held?.first ?? "?"}", its full name and the firm's name "${FIRM}" as the database holds them (AG-12-89)`,
    filled && recordLine.includes(held?.number ?? "--") && realBody.startsWith(`Dear ${held?.first},`) && realBody.includes(FIRM), { recordLine, realBody: realBody.slice(0, 200) });
  const sampleFirst = LEAD_FIELDS.find((f) => f.key === "lead_first_name")?.sample ?? "";
  let backToSample = false;
  if (await seen(p.locator("[data-preview-sample]"), 3_000)) {
    await p.locator("[data-preview-sample]").click();
    backToSample = await until(async () => (await preview(p)).startsWith(`Dear ${sampleFirst},`)) && (await p.locator("[data-preview-record]").innerText()).includes("Sample lead");
  }
  ok(`J-45 W2: "Use the Sample lead" goes back to the made-up details (Dear ${sampleFirst},)`, backToSample);

  const o = await signIn(O); const TO = await pageToken(o);
  await o.goto(`${BASE}${PATH}`);
  let oNone = false;
  if (await seen(o.locator("[data-preview-find]"), 20_000)) {
    await o.locator("[data-preview-find]").fill(`Rahimi${run}`);
    oNone = await seen(o.locator("[data-preview-found-none]"), 15_000) && (await o.locator(`[data-preview-pick*="${held?.number ?? "--"}"]`).count()) === 0;
  }
  await shot(o, "w2-case-officer-finds-none-1440");
  const oRead = (await api(TO, "GET", `/front-office/leads/${LEAD}`)).status;
  const oPrev = await api(TO, "POST", `/platform/templates/${encodeURIComponent(KEY)}/preview`, { subject: "s", body: "Dear {{ lead_first_name }}", leadId: LEAD });
  ok("J-45 W2 fail: the Case Officer (own leads only) finds no such lead on the screen, and the API answers 404 for its id, as the lead read does; nothing of the lead is in the answer",
    oNone && oRead === 404 && oPrev.status === 404 && !oPrev.text.includes(held?.first ?? "--"), { oNone, oRead, oPrev: oPrev.status });
  await o.context().close();

  // ---------------------------------------------------------------------------------------------- W3 unknown field refused
  const v3 = versions(), stored3 = storedBody();
  const typed = `${withField}\nPassport: {{ passport_number }}`;
  await box(p).fill(typed);
  const marked = await seen(p.locator('[data-preview-unknown="passport_number"]'), 10_000);
  await p.locator("[data-template-publish]").click();
  const refused = await said(p, /Not published/);
  const invalid = (await box(p).getAttribute("aria-invalid")) === "true", note = await noteOf(box(p));
  await shot(p, "w3-unknown-field-refused-1440");
  ok("J-45 W3: a typed {{ passport_number }} is marked \"not a field\" in the preview; Publish says \"Not published\", the message field is aria-invalid and its note names {{ passport_number }}; nothing stored",
    marked && /Not published/.test(refused) && invalid && note.includes("{{ passport_number }}") && versions() === v3 && storedBody() === stored3, { marked, refused: refused.slice(0, 160), invalid, note });
  const base = (await api(TR, "GET", PATH)).body?.version ?? 0;
  const apiBody = await api(TR, "PUT", PATH, { subject: "Following up", body: typed, baseVersion: base });
  const apiSubj = await api(TR, "PUT", PATH, { subject: "Hello {{ client_income }}", body: "Dear {{ lead_first_name }}", baseVersion: base });
  ok("J-45 W3 underneath: the API refuses the same on its field (422, fields.body names {{ passport_number }}), and an unknown field in the subject on fields.subject naming it; nothing stored",
    apiBody.status === 422 && String(apiBody.body?.fields?.body ?? "").includes("{{ passport_number }}")
      && apiSubj.status === 422 && String(apiSubj.body?.fields?.subject ?? "").includes("{{ client_income }}") && versions() === v3,
    { body: [apiBody.status, apiBody.body?.fields?.body], subject: [apiSubj.status, apiSubj.body?.fields?.subject] });

  await box(p).fill(withField);
  await p.locator("[data-template-publish]").click();
  const pub = await said(p, /Published: version \d+/);
  const stored = storedBody() ?? "";
  await p.locator("[data-templates-back]").click();
  const whoseEl = p.locator(`[data-template-row="${KEY}"] [data-template-whose]`);
  await until(async () => (await whoseEl.innerText().catch(() => "")) === `Your wording, version ${v3 + 1}`);   // the list may show its last answer first, then refetch
  const whose1 = await whoseEl.innerText({ timeout: 20_000 }).catch(() => "");
  await shot(p, "w3-list-your-wording-1440");
  ok(`J-45 W3 pass: with the unknown field removed, Publish says "Published: version ${v3 + 1}", the store holds only picker fields, and the list says "Your wording, version ${v3 + 1}" (AG-12-45, its publish half)`,
    pub.includes(`Published: version ${v3 + 1}`) && versions() === v3 + 1 && stored === withField && fieldsIn(stored).every((f) => keys.includes(f)) && whose1 === `Your wording, version ${v3 + 1}`,
    { pub, versions: [v3, versions()], whose1 });

  // ---------------------------------------------------------------------------------------------- W4 1440 px, axe
  await p.goto(`${BASE}${PATH}`);
  let axeBad: string[] = ["no editor"];
  if (await seen(p.locator("[data-preview-find]"), 20_000) && held) {
    await p.locator("[data-preview-find]").fill(`Rahimi${run}`);
    if (await seen(p.locator(`[data-preview-pick*="${held.number}"]`), 15_000)) await p.locator(`[data-preview-pick*="${held.number}"]`).click();
    const real = await until(async () => (await preview(p)).startsWith(`Dear ${held.first},`)) && (await p.locator("[data-preview-record]").innerText()).includes(held.number);
    axeBad = !real ? ["the real lead's preview never showed"] : (await new AxeBuilder({ page: p }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${x.id}: ${x.nodes[0]?.target}`);
  }
  const fits = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok("J-45 W4: the editor with a real lead's preview at 1440 px has no sideways scroll and no WCAG 2.2 A/AA violation (axe)", fits && axeBad.length === 0, { fits, axeBad });
  ok("J-45 W4: no page error and no console error on any page walked", errors.length === 0, errors.slice(0, 3));

  // ---------------------------------------------------------------------------------------------- W5 R1.46's first step
  const plain = (await p.locator("textarea[data-template-body]").count()) === 1 && (await p.locator('[data-template-form] [contenteditable="true"]').count()) === 0
    && (await box(p).getAttribute("readonly")) === null;
  await shot(p, "w5-r146-plain-text-box-1440");
  ok("J-45 W5: the walk ends at R1.46's first step: the message is one plain text box (a <textarea>, no rich editor) ready to type in", plain);
  await p.context().close();
} catch (e) {
  ok("J-45: the walk ran to its end", false, String(e).slice(0, 500));
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
