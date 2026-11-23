// PF-19s (concept screens/PF-19s-templates, challenged; R1.46 "Template text editor (a plain text box)"; AG-12-38..-42, -44,
// -45, -64, -66, -69, -70, -89, -90, -95; SA-05 §3.6.1, Appendix A.1) with its thin PF-19c part 1: My account → Templates
// walked in a browser on an isolated copy (its own database and port, never :4400), the API and the database read
// underneath. Each line has a pass and a fail:
//   T1 open: the Owner's menu has Templates; the list shows the three lead messages with "ExpatReady's wording"; the editor
//      opens with the starter wording (Sample); fail: an unknown template is "No such template" (404);
//   T2 edit and pick a field: typed wording and "Insert field" put `{{ lead_number }}` where the cursor was; the live preview
//      (Sample lead) fills it; nothing is stored before Publish; fail: a typed `{{ passport_number }}` or a lone `{{` refuses
//      the publish on the field, named, and stores nothing;
//   T3 preview with a real record: a lead found by name fills the preview with its own values, a missing value is marked
//      "[missing: …]", a name holding markup shows as text (nothing runs); fail: the API answers 404 for a lead the person may
//      not open, exactly when the lead read does (same rule), and for a person without agent/prospect:show;
//   T4 save: Publish stores version 1 (write-once), one audit line without the wording, the list says "Your wording, version
//      1", and the send path's own lookup picks this version; fail: a second publish from the old version is 409 and two
//      parallel publishes from one version give one 200 and one 409 (AG-12-69);
//   T5 permissions: the Case Officer reads the wording and previews but has no Publish and gets 403 from the API; a Read-only
//      person reads, has no preview (403); fail: a person without agent/template:list has no menu entry and a 403;
//   T6 keyboard only, axe-core clean (WCAG 2.2 A/AA), 375/1024/1440 px with no sideways scroll; fail: a planted unlabelled
//      button is found.
// Sample firms only, on a fresh copy. US$0, no model call; live AI off. Screenshots (deviceScaleFactor 1) in
// product/screens/PF-19s-templates/screenshots/. Run from prototype/:
//   zsh studio/tools/isolated.sh pf19s 4461 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_pf19s_templates_browser.ts 4461 xr_studio_pf19s
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { FIELDS, KINDS } from "../api/src/platform/messages/templates/registry.ts";
import { ACCOUNT_SECTIONS, visibleSections } from "../web/src/modules/platform/account-sections.ts";
import { insertField } from "../web/src/modules/platform/messages/templates/contract.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4461), process.argv[3] ?? "xr_studio_pf19s"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "PF-19s-templates", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
const run = Date.now().toString(36);
type Ans = { status: number; body: any; text: string };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j, text };
};
const signIn = async (who: { actorId?: string; email?: string }): Promise<string> => {
  const r = await api(null, "POST", "/platform/session/local", { firmKey: "sample-firm", ...who, secondStep: true });
  if (r.body?.token) return r.body.token as string;
  console.error(`STOP  local sign-in refused for ${JSON.stringify(who)} (start the copy with PLATFORM_IDENTITY=local): ${r.text.slice(0, 300)}`); process.exit(2);
};

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`), FIRM = sql(`select operating_name from platform_firm where key = 'sample-firm'`);
const versions = (key = "lead.follow_up") => Number(sql(`select count(*) from msg_template_version v join msg_template t on t.id = v.template_id where t.firm_id = '${A}' and t.key = '${key}'`));
if (versions() !== 0) { console.error("STOP  sample-firm already has a Follow-up version: start a fresh isolated copy"); process.exit(2); }
// People this run needs that the seed lacks: a Read-only person and a Billing / Finance person (no template keys, AG-12 §10).
const person = (role: string) => {
  const id = randomUUID(), actorId = `pf19s-${role.toLowerCase()}-${run}`;
  sql(`insert into platform_staff (id, firm_id, actor_id, email, display_name, updated_at) values ('${id}', '${A}', '${actorId}', '${actorId}@sample.invalid', 'Sample ${role.toLowerCase().replace("_", " ")}', now())`);
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${id}', '${role}', 'seed:pf19s')`);
  return actorId;
};
const TOWNER = await signIn({ actorId: "user-R" }), TOFF = await signIn({ actorId: "user-O" });
const TREAD = await signIn({ actorId: person("READ_ONLY") }), TBILL = await signIn({ actorId: person("BILLING_FINANCE") });
const owner = sql(`select id from platform_staff where firm_id = '${A}' and actor_id = 'user-R'`), officer = sql(`select id from platform_staff where firm_id = '${A}' and actor_id = 'user-O'`);
const addLead = async (givenNames: string, familyName: string, ownerId: string | null) => {
  const r = await api(TOWNER, "POST", "/front-office/leads", { requestId: randomUUID(), givenNames, familyName, email: `${familyName.toLowerCase().replace(/[^a-z]/g, "")}.${run}@sample.invalid`, source: "Phone", confirmedNew: true });
  const id = r.body?.id ?? r.body?.lead?.id ?? r.body?.leadId;
  if (!id) { console.error(`STOP  could not add a lead: ${r.status} ${r.text.slice(0, 300)}`); process.exit(2); }
  sql(`update fo_lead set owner_staff_id = ${ownerId ? `'${ownerId}'` : "null"} where id = '${id}'`);
  return { id: id as string, number: sql(`select number from fo_lead where id = '${id}'`) };
};
const HADDAD = await addLead("Amira", `Haddad${run}`, owner);            // the Owner's lead
const OFFICERS = await addLead("Bruno", `Okafor${run}`, officer);        // the Case Officer's own lead
const MARKUP = await addLead(`<img src=x onerror="window.__pf19s=1">Zoe`, `Markup${run}`, owner);   // a name holding markup
// Each person sees their own leads (the firm's "everyone sees all" off), so the Case Officer cannot open the Owner's lead.
await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:pf19s", workspaceId: await platformAuditWorkspaceId(db), reason: "PF-19s test" });
ok("PF-19s setup: the Sample firm and its front office, the Owner (user-R), the Case Officer (user-O), a Read-only and a Billing / Finance person signed in, three leads",
  !!A && fo.failed.length === 0 && !!HADDAD.number && !!OFFICERS.number && !!MARKUP.number, fo.failed);

// ------------------------------------------------------------------------------------------------ pure parts (no browser)
const ins = insertField("Dear , welcome", 5, 5, "lead_first_name");
ok("R1.46 PF-19s T2: Insert field puts {{ field }} at the cursor (or over the selection) and moves the cursor after it",
  ins.text === "Dear {{ lead_first_name }}, welcome" && ins.cursor === 5 + "{{ lead_first_name }}".length && insertField("ab", 0, 2, "x").text === "{{ x }}", ins);
ok("R1.46 PF-19s: every starter uses only its record type's fields (AG-12-70) and no passport or financial field is offered (SA-5-63)",
  KINDS.every((k) => [...`${k.starter.subject} ${k.starter.body}`.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].every((m) => FIELDS[k.recordType].some((f) => f.key === m[1])))
  && !FIELDS.lead.some((f) => /passport|bank|card|account|sin\b/i.test(f.key)));

// ------------------------------------------------------------------------------------------------ the browser
const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errs: string[] = [];
const tab = async (token: string, width = 1440) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, token);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => { errs.push(`dialog: ${d.message()}`); void d.dismiss(); }); return p;
};
const openList = async (p: Page) => { await p.goto(`${BASE}/platform/templates`); await p.locator("[data-template-row], [data-templates-refused], [data-templates-error]").first().waitFor({ timeout: 60_000 }); };
const openOne = async (p: Page, key = "lead.follow_up") => { await p.goto(`${BASE}/platform/templates/${key}`); await p.locator("[data-template-form], [data-templates-refused], [data-template-error]").first().waitFor({ timeout: 60_000 }); };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `pf19s-${name}.png`), fullPage: true });
const axe = async (p: Page) => (await p.waitForTimeout(400), await new AxeBuilder({ page: p }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
const ids = (v: { id: string; nodes: { target: unknown }[] }[]) => v.map((x) => `${x.id}: ${x.nodes[0]?.target}`);
const reach = async (p: Page, target: Locator, max = 80) => {
  for (let i = 0; i < max; i++) { if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return; await p.keyboard.press("Tab"); }
  throw new Error("not reached by Tab");
};
const menuHas = (p: Page) => p.locator('nav[aria-label="My account"] [data-account-section="/platform/templates"]').count();
const said = async (p: Page, text: string | RegExp) => { await p.locator("[data-template-said-text]").filter({ hasText: text }).waitFor({ timeout: 30_000 }); return p.locator("[data-template-said-text]").innerText(); };
const previewHas = async (p: Page, where: "subject" | "body", text: string) => { await p.locator(`[data-preview-${where}]`).filter({ hasText: text }).waitFor({ timeout: 20_000 }); return true; };
const bodyOf = (p: Page) => p.locator("[data-template-body]").inputValue();

let failed = 0;
try {
  // ---------------------------------------------------------------------------------------------- T1 open
  const p = await tab(TOWNER); await openList(p);
  const rows = await p.locator("[data-template-row]").count(), whoseAll = await p.locator("[data-template-whose]").allInnerTexts();
  ok("R1.46 PF-19s T1: the Owner's My account menu has Templates; the list shows the three lead messages (Kind, Sent to) with ExpatReady's wording",
    await menuHas(p) === 1 && rows === 3 && whoseAll.every((w) => w === "ExpatReady's wording") && (await p.locator('[data-template-row="lead.acknowledgement"]').innerText()).includes("Automatic"), { rows, whoseAll });
  await p.locator("[data-templates-search]").fill("cold");
  const searched = await p.locator("[data-template-row]").count();
  await p.locator("[data-templates-search]").fill("");
  await shot(p, "1-list");
  await p.locator('[data-template-open="lead.follow_up"]').click(); await p.locator("[data-template-form]").waitFor({ timeout: 30_000 });
  const starter = KINDS.find((k) => k.key === "lead.follow_up")!.starter;
  ok("R1.46 PF-19s T1: search narrows the list by name; Open shows Follow-up's starter subject and message in a plain text box, marked Sample",
    searched === 1 && await p.locator("[data-template-subject]").inputValue() === starter.subject && await bodyOf(p) === starter.body
    && await p.locator("textarea[data-template-body]").count() === 1 && (await p.locator("header").filter({ hasText: "Follow-up" }).innerText()).includes("Sample"), { searched });
  const nf = await tab(TOWNER); await openOne(nf, "lead.nope");
  ok("R1.46 PF-19s T1 fail: an unknown template's address says No such template, and the API answers 404",
    (await nf.locator("[data-template-error]").count()) === 1 && (await api(TOWNER, "GET", "/platform/templates/lead.nope")).status === 404);
  await nf.context().close();

  // ---------------------------------------------------------------------------------------------- T2 edit, pick a field
  await previewHas(p, "body", "Amira");   // the Sample lead's first name
  const body = p.locator("[data-template-body]");
  await body.fill("Dear {{ lead_first_name }},\n\nYour reference is .\n\nKind regards,\n{{ firm_name }}");
  await body.evaluate((el: HTMLTextAreaElement) => { const at = el.value.indexOf(" ."); el.focus(); el.setSelectionRange(at + 1, at + 1); });
  await body.press("ArrowRight"); await body.press("ArrowLeft");   // the cursor is remembered from the keyboard
  await p.locator("[data-template-field-pick]").selectOption("lead_number");
  await p.locator("[data-template-field-insert]").click();
  const typed = await bodyOf(p);
  ok("R1.46 PF-19s T2: Insert field (Lead number) puts {{ lead_number }} where the cursor was; Unpublished changes shows",
    typed.includes("Your reference is {{ lead_number }}.") && await p.locator("[data-template-unsaved]").count() === 1, typed);
  await previewHas(p, "body", "Your reference is L-0042.");
  ok("R1.46 PF-19s T2: the live preview (Sample lead) fills the new field before anything is published; nothing is stored", versions() === 0);
  await shot(p, "2-edited-sample-preview");
  await body.fill(`${typed}\nPassport: {{ passport_number }}`);
  await p.locator("[data-preview-unknown='passport_number']").waitFor({ timeout: 20_000 });
  await p.locator("[data-template-publish]").click(); await said(p, /Not published/);
  const fieldErr = await p.locator('[data-template-form] [role="alert"]').allInnerTexts();
  ok("R1.46 PF-19s T2 fail: a typed {{ passport_number }} is marked in the preview as not a field and refuses the publish on the message, naming it; nothing is stored (AG-12-66, -70)",
    fieldErr.some((t) => t.includes("{{ passport_number }} is not a field")) && versions() === 0 && (await p.locator("[data-preview-unknown='passport_number']").innerText()) === "[not a field: {{ passport_number }}]", fieldErr);
  const stray = await api(TOWNER, "PUT", "/platform/templates/lead.follow_up", { subject: "Hi {{ lead_first_name", body: "Body {{ Lead.Name }}", baseVersion: 0 });
  ok("R1.46 PF-19s T2 fail: a lone {{ in the subject and {{ Lead.Name }} in the message are refused by the API, each named on its field (challenge M3)",
    stray.status === 422 && /lone/.test(stray.body?.fields?.subject ?? "") && /Lead\.Name/.test(stray.body?.fields?.body ?? "") && versions() === 0, stray.body?.fields);
  const nul = await api(TOWNER, "PUT", "/platform/templates/lead.follow_up", { subject: "Hi", body: "Body\u0000here", baseVersion: 0 });
  const broken = await api(TOWNER, "PUT", "/platform/templates/lead.follow_up", { subject: "Hi \ud800", body: "Fine", baseVersion: 0 });
  const nokey = await api(TOWNER, "PUT", "/platform/templates/not-a-key", { pf28Unknown: "x" });
  ok("R1.46 PF-19s T2 fail: a control character in the message and a broken character in the subject are refused on their field (422, break m1, m3); an unknown key is 404 before the body is read (PF-28)",
    nul.status === 422 && /control character/.test(nul.body?.fields?.body ?? "") && broken.status === 422 && /broken character/.test(broken.body?.fields?.subject ?? "") && nokey.status === 404 && versions() === 0, { nul: nul.body?.fields, broken: broken.body?.fields, nokey: nokey.status });
  await body.fill(typed);

  // ---------------------------------------------------------------------------------------------- T3 preview with a real lead
  await p.locator("[data-preview-find]").fill(`Haddad${run}`);
  await p.locator(`[data-preview-pick*="${HADDAD.number}"]`).click();
  await previewHas(p, "body", `Your reference is ${HADDAD.number}.`);
  const realBody = await p.locator("[data-preview-body]").innerText();
  ok("R1.46 PF-19s T3: a lead found by name fills the preview with its own first name, number and the firm's name (AG-12-89)",
    realBody.startsWith("Dear Amira,") && realBody.includes(FIRM) && (await p.locator("[data-preview-record]").innerText()).includes(HADDAD.number), realBody);
  await shot(p, "3-real-lead-preview");
  await p.locator("[data-template-field-pick]").selectOption("owner_name");
  await body.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }); await body.press("End");
  await p.locator("[data-template-field-insert]").click();
  await previewHas(p, "body", "Sample");   // the Owner's display name (Sample people)
  await p.locator("[data-preview-sample]").click(); await p.locator("[data-preview-find]").fill(`Markup${run}`);
  await p.locator(`[data-preview-pick*="${MARKUP.number}"]`).click();
  await previewHas(p, "body", MARKUP.number);
  const raw = await p.locator("[data-preview-body]").innerText(), ran = await p.evaluate(() => (window as unknown as { __pf19s?: number }).__pf19s ?? 0);
  ok("R1.46 PF-19s T3: a lead whose name holds markup shows it as text in the preview; no element is made and nothing runs (values are data)",
    raw.includes('<img src=x onerror="window.__pf19s=1">Zoe') && ran === 0 && await p.locator("[data-preview-body] img").count() === 0, { raw: raw.slice(0, 120), ran });
  const gap = await api(TOWNER, "POST", "/platform/templates/lead.follow_up/preview", { subject: "s", body: "Hi {{ owner_name }}", leadId: HADDAD.id });
  sql(`update fo_lead set owner_staff_id = null where id = '${HADDAD.id}'`);   // unassigned: the Owner still sees it (assign key)
  const gapNone = await api(TOWNER, "POST", "/platform/templates/lead.follow_up/preview", { subject: "s", body: "Hi {{ owner_name }}", leadId: HADDAD.id });
  sql(`update fo_lead set owner_staff_id = '${owner}' where id = '${HADDAD.id}'`);
  ok("R1.46 PF-19s T3: a value the record lacks is a missing part, listed (never blank); with an owner it fills",
    gap.status === 200 && gap.body.body.some((x: any) => x.field === "owner_name" && x.value) && gapNone.status === 200 && gapNone.body.missing.includes("Assigned staff member"), { gap: gap.body?.missing, gapNone: gapNone.body?.missing });   // eslint-disable-line @typescript-eslint/no-explicit-any
  // The same rule as the lead read: for each person and lead, the preview is 404 exactly when the lead read is.
  const pairs: [string, string, { id: string }][] = [["Owner", TOWNER, HADDAD], ["Owner", TOWNER, OFFICERS], ["Case Officer", TOFF, HADDAD], ["Case Officer", TOFF, OFFICERS]];
  const same = await Promise.all(pairs.map(async ([who, t, l]) => {
    const read = (await api(t, "GET", `/front-office/leads/${l.id}`)).status, prev = (await api(t, "POST", "/platform/templates/lead.follow_up/preview", { subject: "s", body: "b", leadId: l.id })).status;
    return { who, lead: l.id.slice(0, 8), read, prev };
  }));
  ok("R1.46 PF-19s T3 fail: a lead the person may not open is 404 in the preview exactly when the lead read is 404 (the Case Officer and the Owner's lead), and 200 when the read is",
    same.every((x) => (x.read === 404) === (x.prev === 404) && (x.read === 200) === (x.prev === 200)) && same.some((x) => x.prev === 404), same);
  const noLeadKey = await api(TBILL, "POST", "/platform/templates/lead.follow_up/preview", { subject: "s", body: "b", leadId: HADDAD.id });
  const foreign = await api(TOWNER, "POST", "/platform/templates/lead.follow_up/preview", { subject: "s", body: "b", leadId: randomUUID() });
  ok("R1.46 PF-19s T3 fail: an unknown lead id is 404; a person without the preview key gets 403", foreign.status === 404 && noLeadKey.status === 403, { foreign: foreign.status, noLeadKey: noLeadKey.status });

  // ---------------------------------------------------------------------------------------------- T4 save
  await p.locator("[data-template-subject]").fill("Following up, {{ lead_first_name }}");
  const wording = await bodyOf(p);
  await p.locator("[data-template-publish]").click(); await said(p, "Published: version 1");
  const v1 = sql(`select v.version || '|' || v.subject || '|' || v.published_by from msg_template_version v join msg_template t on t.id = v.template_id where t.firm_id = '${A}' and t.key = 'lead.follow_up'`);
  const storedBody = sql(`select replace(v.body, chr(10), '\\n') from msg_template_version v join msg_template t on t.id = v.template_id where t.firm_id = '${A}' and t.key = 'lead.follow_up'`);
  const audit = sql(`select count(*) || '|' || coalesce(max(summary), '') from audit_event where entity = 'msg_template' and entity_key = '${A}:lead.follow_up'`);
  ok("R1.46 PF-19s T4: Publish stores version 1 with the subject and message as typed, by the Owner, and one audit line that names the version, never the wording (AG-12-95)",
    v1 === `1|Following up, {{ lead_first_name }}|staff:${owner}` && storedBody === wording.replace(/\n/g, "\\n") && audit.startsWith("1|") && audit.includes("version 1") && !audit.includes("reference"), { v1, audit });
  await openList(p);
  ok("R1.46 PF-19s T4: the list now says Your wording, version 1 for Follow-up and ExpatReady's wording for the others",
    (await p.locator('[data-template-row="lead.follow_up"] [data-template-whose]').innerText()) === "Your wording, version 1" && (await p.locator('[data-template-row="lead.going_cold"] [data-template-whose]').innerText()) === "ExpatReady's wording");
  // The send path's own lookup (api/src/platform/messages/send/messages.ts: the firm's version first, the newest) picks it.
  const picked = await db.msgTemplateVersion.findFirst({ where: { OR: [{ firmId: A }, { firmId: null }], template: { key: "lead.follow_up", channel: "EMAIL", language: "en", OR: [{ firmId: A }, { owner: "PLATFORM", firmId: null }] } }, orderBy: [{ template: { owner: "desc" } }, { version: "desc" }], select: { version: true, firmId: true } });
  ok("R1.46 PF-19s T4: the send path's lookup for lead.follow_up (EMAIL, en) now returns this firm's version 1 (challenge B1: publishing decides the wording used)", picked?.version === 1 && picked.firmId === A, picked);
  let changedRow = "";
  try { await db.$executeRawUnsafe(`update msg_template_version set body = 'changed' where firm_id = '${A}'`); changedRow = "updated"; } catch (e) { changedRow = (e as Error).message.slice(0, 80); }
  const stale = await api(TOWNER, "PUT", "/platform/templates/lead.follow_up", { subject: "Old", body: "From version 0", baseVersion: 0 });
  const [x, y] = await Promise.all([1, 2].map((n) => api(TOWNER, "PUT", "/platform/templates/lead.follow_up", { subject: `Race ${n}`, body: `Race ${n} {{ lead_first_name }}`, baseVersion: 1 })));
  ok("R1.46 PF-19s T4 fail: a published version cannot be changed; a publish from version 0 after version 1 is 409 naming version 1; two parallel publishes from version 1 give one 200 and one 409, and exactly version 2 exists (AG-12-69)",
    changedRow !== "updated" && stale.status === 409 && /version 1/.test(stale.body?.detail ?? "") && [x.status, y.status].sort().join() === "200,409" && versions() === 2, { changedRow, stale: stale.status, race: [x.status, y.status], n: versions() });
  await p.context().close();

  // ---------------------------------------------------------------------------------------------- T5 permissions
  const o = await tab(TOFF); await openOne(o);
  const oReadOnly = await o.locator("[data-template-readonly]").count(), oPublish = await o.locator("[data-template-publish]").count(), oLocked = await o.locator("[data-template-body]").getAttribute("readonly");
  await previewHas(o, "subject", "Following up") .catch(() => false);
  const oPreview = await o.locator("[data-preview-body]").count();
  const oPut = await api(TOFF, "PUT", "/platform/templates/lead.follow_up", { subject: "x", body: "y", baseVersion: 2 });
  ok("R1.46 PF-19s T5: the Case Officer has Templates in the menu, reads the wording in a read-only box with no Publish, previews it, and the API refuses a publish (403); nothing stored",
    await menuHas(o) === 1 && oReadOnly === 1 && oPublish === 0 && oLocked !== null && oPreview === 1 && oPut.status === 403 && versions() === 2, { oReadOnly, oPublish, oPreview, put: oPut.status });
  await shot(o, "5-case-officer-read-only");
  await o.context().close();
  const r = await tab(TREAD); await openOne(r);
  const rPrev = await api(TREAD, "POST", "/platform/templates/lead.follow_up/preview", { subject: "s", body: "b" });
  ok("R1.46 PF-19s T5: a Read-only person reads the wording (no Publish), sees that previewing is not in their role, and the API refuses the preview (403)",
    await r.locator("[data-template-readonly]").count() === 1 && await r.locator("[data-template-publish]").count() === 0 && await r.locator("[data-preview-refused]").count() === 1 && rPrev.status === 403, { prev: rPrev.status });
  await r.context().close();
  const b = await tab(TBILL); await openList(b);
  const bMe = (await api(TBILL, "GET", "/platform/me")).body?.keys as string[];
  ok("R1.46 PF-19s T5 fail: Billing / Finance (no template key) has no Templates entry, the address says Not available, and the API answers 403 (AG-12 §10)",
    await menuHas(b) === 0 && await b.locator("[data-templates-refused]").count() === 1 && (await api(TBILL, "GET", "/platform/templates")).status === 403
    && visibleSections(ACCOUNT_SECTIONS, bMe ?? []).every((s) => s.path !== "/platform/templates"));
  await b.context().close();

  // ---------------------------------------------------------------------------------------------- T6 keyboard only
  const k = await tab(TOWNER); await openOne(k, "lead.going_cold");
  await reach(k, k.locator("[data-template-body]"));
  await k.keyboard.press("ControlOrMeta+End"); await k.keyboard.type("\nP.S. Your lead number: ");
  await reach(k, k.locator("[data-template-field-pick]")); await k.keyboard.press("ArrowDown"); await k.keyboard.press("ArrowDown"); await k.keyboard.press("ArrowDown");
  const picked3 = await k.locator("[data-template-field-pick]").inputValue();
  await reach(k, k.locator("[data-template-field-insert]")); await k.keyboard.press("Enter");
  const kBodyFocused = await k.waitForFunction(() => document.activeElement?.hasAttribute("data-template-body"), undefined, { timeout: 5_000 }).then(() => true, () => false);
  await reach(k, k.locator("[data-template-publish]")); await k.keyboard.press("Enter"); await said(k, "Published: version 1");
  const kBody = sql(`select v.body from msg_template_version v join msg_template t on t.id = v.template_id where t.firm_id = '${A}' and t.key = 'lead.going_cold'`);
  ok("R1.46 PF-19s T6: by keyboard only: Tab to the message, type, Tab to Insert field, choose with the arrows, Enter inserts it and focus returns to the message, Tab to Publish, Enter publishes",
    picked3 === "lead_number" && kBodyFocused && versions("lead.going_cold") === 1, { picked3, kBodyFocused, kBody: kBody.slice(-60) });
  await k.context().close();

  // ---------------------------------------------------------------------------------------------- T6 three widths, axe
  for (const w of [375, 1024, 1440]) {
    const q = await tab(TOWNER, w); await openOne(q, "lead.acknowledgement"); await previewHas(q, "subject", "Thank you");
    const v = await axe(q), wide = await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const beside = await q.evaluate(() => { const f = document.querySelector("[data-template-form]")!.getBoundingClientRect(), pr = document.querySelector("[data-preview]")!.getBoundingClientRect(); return pr.left >= f.right - 1; });
    await openList(q); const vList = await axe(q), wideList = await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    ok(`R1.46 PF-19s T6: the editor and the list at ${w} px have no WCAG 2.2 A/AA violation and no sideways scroll; the preview is ${w >= 1024 ? "beside" : "under"} the editor`,
      v.length === 0 && vList.length === 0 && wide && wideList && beside === (w >= 1024), { v: ids(v), vList: ids(vList), wide, wideList, beside });
    await openOne(q, "lead.acknowledgement"); await previewHas(q, "subject", "Thank you"); await shot(q, `6-editor-${w}`);
    if (w === 375) {
      await q.evaluate(() => { document.querySelector("[data-template-form]")!.appendChild(document.createElement("button")); });
      const bad = await axe(q);
      ok("R1.46 PF-19s T6 fail: the same axe run finds the unlabelled button we add (the check can fail)", bad.some((x) => x.id === "button-name"), bad.map((x) => x.id));
    }
    await q.context().close();
  }
  ok("R1.46 PF-19s: no page error and no dialog in any tab", errs.length === 0, errs);
} catch (e) {
  failed++; console.log(`FAIL  PF-19s: the check stopped: ${(e as Error).stack?.slice(0, 800)}`);
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() + failed ? 1 : 0);
