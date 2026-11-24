// J-46 (map row 46, R1.46: "Template text editor (a plain text box)"), written by the qa lane (23 Nov) as the acceptance
// journey for the row, while its part is in flight: PF-19s (My account → Templates, the plain-text editor with the field
// picker and the preview) carrying a thin PF-19c part 1 (the templates API: list, open, publish, preview), #3179. It walks
// the firm's Owner (AG-12 §10: Owner and Admin publish the firm's wording; every other role but Billing / Finance reads it)
// on an isolated copy of the running app (its own database and port, never :4400), by screens, with the API and the
// database read underneath.
// Done when (CAPABILITIES R1.46), word for word as the steps:
//   W1 "The box saves": the Owner signs in on the sign-in card, reaches Templates from My account's menu, opens the
//      Going-cold nudge; the message is a plain text box (one <textarea>, no rich editor); the Owner types new wording by
//      keyboard, with French, Arabic, Chinese and an emoji; Publish says "Published: version n"; after a reload the box
//      holds exactly what was typed; the API read and the newest msg_template_version hold it exactly; one audit line
//      (platform.template.publish) without the wording (AG-12-95). Needs PF-19s (screen) and PF-19c part 1 (API, store).
//   W2 "a field goes in from the picker": with the cursor in the middle of the text, the Owner picks "Lead number" from
//      Insert field: `{{ lead_number }}` goes in exactly at the cursor, the cursor sits after it, the preview fills it with
//      the Sample lead's number; published, the store holds it. Then keyboard only: Tab to the box, type at the end, Tab
//      to the picker, arrow keys to "Lead's full name", Tab to Insert, Enter; Tab to Publish, Enter: stored. The picker
//      offers exactly the record type's fields. Needs PF-19s and PF-19c part 1.
//   W3 "over the length limit refused with the limit": the limit is the product's own constant (LIMITS.body in
//      api/src/platform/messages/templates/registry.ts, which the API read also answers), never a number written here.
//      A message one character over it is refused ON the message field (aria-invalid, its note names the limit), nothing
//      stored; the API refuses the same on its `body` field (422); a message exactly at the limit publishes. Needs PF-19c
//      part 1 (the check) and PF-19s (the refusal on the field).
//   W4 the wrong role: the Case Officer opens the same message read-only (no Publish, no Insert field, the box read-only)
//      and the API refuses a publish (403); nothing stored. Needs PF-19s and PF-19c part 1.
//   W5 400, 1024 and 1440 px: the list and the editor have no sideways scroll and no WCAG 2.2 A/AA violation (axe); no
//      page error. Needs PF-19s.
//   W6 the walk ends at R1.47's first step: a visitor opens the firm's public booking page (its confirmation email is
//      the one layout R1.47 checks). On main, so it passes today.
// Fails on main today only where PF-19s / PF-19c part 1 are missing (P-606); each failing line names its part. Re-runnable
// on one copy (each run reads the current version first; its wording carries the run's id). Sample firms and wording only;
// US$0, no model call, live AI off, no live mail. Screenshots: product/screens/J-46/screenshots/. Run from prototype/
// (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j46 4446 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j46 4446 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_46.ts j46 4446
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Locator, type Page } from "playwright";
import { copyFirmHoursTo } from "../../api/src/front-office/booking-seed.ts";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j46", Number(process.argv[3] ?? 4446)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-46", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
const run = Date.now().toString(36).slice(-5);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => Promise<boolean>, ms = 20_000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(300); } return false; };
type Ans = { status: number; body: any; text: string };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j, text };
};
/** Is it there within ms? (a missing part answers false, never throws) */
const seen = (l: Locator, ms = 8_000) => l.first().waitFor({ timeout: ms }).then(() => true, () => false);

// ------------------------------------------------------------------------------------------------ the product's own registry
// PF-19c part 1's registry: the limit, the fields and the template kinds come from it, never from numbers written here.
// On main it does not exist yet: the steps that need it fail, naming the part.
type Registry = { LIMITS: { subject: number; body: number }; FIELDS: Record<string, { key: string; label: string; sample: string }[]>; KINDS: { key: string; name: string; recordType: string }[] };
const REGISTRY = join(STUDIO, "api", "src", "platform", "messages", "templates", "registry.ts");
const reg = existsSync(REGISTRY) ? (await import(pathToFileURL(REGISTRY).href).catch(() => null)) as Registry | null : null;
const LIMIT = reg?.LIMITS?.body ?? null;
const KIND = reg?.KINDS.find((k) => k.key === "sales.lead.going_cold") ?? null;
const KEY = KIND?.key ?? "sales.lead.going_cold", KNAME = KIND?.name ?? "Going-cold nudge";
const LEAD_FIELDS = reg?.FIELDS[KIND?.recordType ?? "lead"] ?? [];
const sampleOf = (k: string) => LEAD_FIELDS.find((f) => f.key === k)?.sample ?? null;
const labelOf = (k: string) => LEAD_FIELDS.find((f) => f.key === k)?.label ?? null;

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
const email = (actor: string) => sql(`select email from platform_staff where actor_id = '${actor}' and firm_id = '${A}'`);
const R = email("user-R"), O = email("user-O"), OID = sql(`select id from platform_staff where actor_id = 'user-O' and firm_id = '${A}'`);
// R1.47's first step needs a bookable consultation type on the firm's public page (as J-23 sets it up).
if (sql(`select count(*) from fo_consultation_type where firm_id = '${A}' and slug = 'free'`) === "0") {
  await copyFirmHoursTo(db, A, [OID]);
  await db.foConsultationType.create({ data: { firmId: A, slug: "free", name: "Free consultation", modes: ["VIDEO"], hostStaffIds: [OID], minutes: 30, windowDays: 60 } });
}
const versions = () => Number(sql(`select count(*) from msg_template_version v join msg_template t on t.id = v.template_id where t.firm_id = '${A}' and t.key = '${KEY}'`) || "0");
const newest = () => sql(`select replace(encode(convert_to(v.body, 'UTF8'), 'base64'), E'\\n', '') from msg_template_version v join msg_template t on t.id = v.template_id where t.firm_id = '${A}' and t.key = '${KEY}' order by v.version desc limit 1`);
const storedBody = () => { const b = newest(); return b ? Buffer.from(b.replace(/\s/g, ""), "base64").toString("utf8") : null; };
const publishAudits = () => Number(sql(`select count(*) from audit_event where firm_id = '${A}' and action = 'platform.template.publish' and entity_key = '${A}:${KEY}'`) || "0");
ok(`J-46 setup: the Sample firm with its front office, the Owner (user-R) and the Case Officer (user-O); the product's limit read from its registry: ${LIMIT ?? "none"} [registry: PF-19c part 1]`,
  !!A && !!R && !!O && fo.failed.length === 0, { limit: LIMIT, registry: existsSync(REGISTRY) });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1", slowMo: process.env.HEADED === "1" ? 150 : 0, ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errors: string[] = [];
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `j46-${name}.png`), fullPage: true }).catch(() => undefined);
const newPage = async (width = 1440, token?: string) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  if (token) await ctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, token);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
  p.on("dialog", (d) => { void (d.type() === "beforeunload" ? d.accept() : d.dismiss()); });   // leaving unpublished changes (a refused draft) is the walk's choice
  return p;
};
/** A person signs in on the sign-in card (PF-4's local stand-in: firm key and work email). */
async function signIn(mail: string): Promise<Page> {
  const p = await newPage();
  await p.goto(`${BASE}/account`);
  await p.getByLabel("Firm key").fill("sample-firm"); await p.getByLabel("Work email").fill(mail); await p.getByRole("button", { name: "Sign in" }).click();
  await p.getByLabel("Firm key").waitFor({ state: "detached", timeout: 30_000 });
  return p;
}
const pageToken = (p: Page) => p.evaluate(() => (JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}") as { token?: string }).token ?? "");
const box = (p: Page) => p.locator("[data-template-body]");
const openEditor = async (p: Page) => { await p.goto(`${BASE}/platform/templates/${encodeURIComponent(KEY)}`); return seen(p.locator("[data-template-form]"), 30_000); };
const focused = (l: Locator) => l.evaluate((el) => el === document.activeElement).catch(() => false);
const reach = async (p: Page, target: Locator, max = 60) => { for (let i = 0; i < max; i++) { if (await focused(target)) return true; await p.keyboard.press("Tab"); } return focused(target); };
const saidText = (p: Page, re: RegExp) => p.locator("[data-template-said-text]").filter({ hasText: re }).first().innerText({ timeout: 20_000 }).catch(() => "");
/** The words under a field (its aria-describedby note). */
const noteOf = (l: Locator) => l.evaluate((el) => { const id = el.getAttribute("aria-describedby"); return id ? document.getElementById(id)?.textContent ?? "" : ""; }).catch(() => "");
const read = async (t: string) => { const r = await api(t, "GET", `/platform/templates/${encodeURIComponent(KEY)}`); return r.status === 200 ? r.body : null; };
const NEEDS = "[needs PF-19s screens + PF-19c part 1 API, #3179]";

try {
  // ---------------------------------------------------------------------------------------------- W1 the box saves
  const p = await signIn(R); const TR = await pageToken(p);
  const entry = p.locator('nav[aria-label="My account"] a[href="/platform/templates"], nav[aria-label="My account"] [data-account-section="/platform/templates"]');
  const hasEntry = await seen(entry, 15_000);
  ok(`J-46 W1: the Owner signs in on the sign-in card and finds Templates in My account's menu (no address typed) [needs PF-19s]`, hasEntry);
  if (hasEntry) {
    await entry.first().click();
    const open = p.locator(`[data-template-open="${KEY}"]`);
    if (await seen(open, 20_000)) await open.click(); else await p.goto(`${BASE}/platform/templates/${encodeURIComponent(KEY)}`);
  } else await p.goto(`${BASE}/platform/templates/${encodeURIComponent(KEY)}`);
  const hasEditor = await seen(p.locator("[data-template-form]"), 20_000);
  const plain = hasEditor && (await p.locator("textarea[data-template-body]").count()) === 1 && (await p.locator('[data-template-form] [contenteditable="true"]').count()) === 0;
  await shot(p, "w1-editor-opened-1440");
  ok(`J-46 W1: ${KNAME} opens in the editor; its message is one plain text box (a <textarea>, no rich editor) ${NEEDS}`, plain, { url: p.url() });

  const t0 = await read(TR), v0 = versions(), a0 = publishAudits();
  const TYPED = `Bonjour ${run}, nous avons reçu votre demande — merci !\nVotre numéro de dossier : .\nمرحبا بكم · 欢迎 · 🍁\nÀ bientôt.`;
  let saidPub = "", afterReload = "";
  if (plain) {
    await box(p).click(); await p.keyboard.press("ControlOrMeta+a"); await p.keyboard.press("Delete");
    await p.keyboard.type(TYPED);
    await p.locator("[data-template-publish]").click();
    saidPub = await saidText(p, /Published: version \d+/);
    await shot(p, "w1-published-1440");
    await p.reload(); await seen(p.locator("[data-template-form]"), 30_000);
    afterReload = await box(p).inputValue().catch(() => "");
  }
  const t1 = await read(TR), audit1 = sql(`select coalesce(summary, '') || ' ' || coalesce(detail::text, '') from audit_event where firm_id = '${A}' and action = 'platform.template.publish' and entity_key = '${A}:${KEY}' order by at desc limit 1`);
  ok(`J-46 W1: the Owner types the wording (French, Arabic, Chinese, an emoji) and Publish says "Published: version ${(t0?.version ?? 0) + 1}"; after a reload the box holds exactly what was typed ${NEEDS}`,
    saidPub.includes(`Published: version ${(t0?.version ?? 0) + 1}`) && afterReload === TYPED, { saidPub, afterReload: afterReload.slice(0, 120) });
  ok(`J-46 W1 underneath: the API read and the newest stored version hold exactly the typed text (one new version), and one audit line platform.template.publish without the wording ${NEEDS}`,
    !!t1 && t1.body === TYPED && t1.version === (t0?.version ?? 0) + 1 && storedBody() === TYPED && versions() === v0 + 1 && publishAudits() === a0 + 1 && !audit1.includes(run),
    { api: t1?.body?.slice?.(0, 60) ?? null, stored: (storedBody() ?? "").slice(0, 60), versions: [v0, versions()], audits: [a0, publishAudits()] });

  // ---------------------------------------------------------------------------------------------- W2 a field from the picker
  const pick = p.getByLabel("Insert field"), TOKEN = "{{ lead_number }}";
  const at = TYPED.indexOf(" .\n") + 1;   // just before the full stop after "dossier :"
  const want2 = TYPED.slice(0, at) + TOKEN + TYPED.slice(at);
  let got2 = "", caret = -1, offered: string[] = [], inPreview = false, saidPub2 = "";
  if (plain && await seen(pick, 3_000)) {
    offered = (await pick.locator("option").allInnerTexts()).filter((o) => !/choose/i.test(o));
    await box(p).click(); await p.keyboard.press("ControlOrMeta+Home");
    for (let i = 0; i < at; i++) await p.keyboard.press("ArrowRight");
    await pick.selectOption({ label: labelOf("lead_number") ?? "Lead number" });
    await p.locator("[data-template-field-insert]").click();
    await until(async () => (await box(p).inputValue()) !== TYPED, 5_000);
    await wait(200);
    got2 = await box(p).inputValue();
    caret = await box(p).evaluate((el: HTMLTextAreaElement) => (el === document.activeElement && el.selectionStart === el.selectionEnd ? el.selectionStart : -1));
    const sample = sampleOf("lead_number");
    inPreview = !!sample && await seen(p.locator("[data-preview-body] [data-preview-value='lead_number']").filter({ hasText: sample }), 10_000);
    await shot(p, "w2-field-inserted-1440");
    await p.locator("[data-template-publish]").click();
    saidPub2 = await saidText(p, /Published: version \d+/);
  }
  ok(`J-46 W2: with the cursor after "dossier :", Insert field → "Lead number" puts ${TOKEN} exactly at the cursor and leaves the cursor after it ${NEEDS}`,
    got2 === want2 && caret === at + TOKEN.length, { got2: got2.slice(0, 120), caret, want: at + TOKEN.length });
  ok(`J-46 W2: the picker offers exactly the lead's fields from the registry, and the preview fills the inserted field with the Sample lead's number (${sampleOf("lead_number") ?? "?"}) ${NEEDS}`,
    LEAD_FIELDS.length > 0 && offered.length === LEAD_FIELDS.length && LEAD_FIELDS.every((f) => offered.includes(f.label)) && inPreview, { offered, inPreview });
  ok(`J-46 W2 underneath: published, the API read and the store hold the text with ${TOKEN} in place ${NEEDS}`,
    !!saidPub2 && (await read(TR))?.body === want2 && storedBody() === want2, { saidPub2, stored: (storedBody() ?? "").slice(0, 100) });

  // Keyboard only: a fresh page, Tab to the box, type, Tab to the picker, arrows, Tab to Insert, Enter, Tab to Publish, Enter.
  const k = await newPage(1440, TR);
  const kEditor = await openEditor(k);
  const TOKEN2 = "{{ lead_full_name }}", tail = `\nRéf. ${run} `;
  let kReached = false, kPicked = false, kInserted = "", kSaved = false;
  if (kEditor && await seen(k.getByLabel("Insert field"), 3_000)) {
    kReached = await reach(k, box(k));
    if (kReached) {
      await k.keyboard.press("ControlOrMeta+End"); await k.keyboard.type(tail);
      const kPick = k.getByLabel("Insert field");
      if (await reach(k, kPick, 10)) {
        for (let i = 0; i < 12 && (await kPick.inputValue()) !== "lead_full_name"; i++) await k.keyboard.press("ArrowDown");
        kPicked = (await kPick.inputValue()) === "lead_full_name";
      }
      if (kPicked && await reach(k, k.locator("[data-template-field-insert]"), 5)) {
        await k.keyboard.press("Enter");
        await until(async () => (await box(k).inputValue()).endsWith(TOKEN2), 5_000);
        kInserted = await box(k).inputValue();
      }
      if (kInserted && await reach(k, k.locator("[data-template-publish]"), 10)) {
        await k.keyboard.press("Enter");
        kSaved = !!(await saidText(k, /Published: version \d+/));
      }
    }
  }
  await shot(k, "w2-keyboard-published-1440");
  ok(`J-46 W2 keyboard only: Tab reaches the box, typing goes in; Tab reaches Insert field, the arrow keys choose "Lead's full name", Tab and Enter on Insert put ${TOKEN2} at the cursor; Tab and Enter on Publish store it ${NEEDS}`,
    kReached && kPicked && kInserted === want2 + tail + TOKEN2 && kSaved && storedBody() === want2 + tail + TOKEN2, { kEditor, kReached, kPicked, kInserted: kInserted.slice(-60), kSaved });
  await k.context().close();

  // ---------------------------------------------------------------------------------------------- W3 over the length limit
  const limitApi = (await read(TR))?.limits?.body ?? null;
  ok(`J-46 W3: the message's length limit is the product's own constant (registry LIMITS.body = ${LIMIT ?? "missing"}) and the API read answers the same (${limitApi ?? "missing"}) [needs PF-19c part 1]`,
    typeof LIMIT === "number" && LIMIT > 0 && limitApi === LIMIT, { LIMIT, limitApi });
  const v3 = versions(), before3 = storedBody();
  let fieldInvalid = false, fieldNote = "", said3 = "";
  if (plain && LIMIT) {
    await openEditor(p);
    const over = `${run} `.repeat(Math.ceil((LIMIT + 1) / (run.length + 1))).slice(0, LIMIT + 1);   // the person pastes a long text
    await box(p).fill(over);
    await p.locator("[data-template-publish]").click();
    said3 = await saidText(p, /Not published/);
    fieldInvalid = (await box(p).getAttribute("aria-invalid")) === "true";
    fieldNote = await noteOf(box(p));
    await shot(p, "w3-over-limit-refused-1440");
  }
  const limitWords = (s: string) => !!LIMIT && (s.includes(String(LIMIT)) || s.includes(LIMIT.toLocaleString("en-CA")));
  ok(`J-46 W3: a message one character over the limit (${LIMIT ? LIMIT + 1 : "?"}) is refused ON the message field (aria-invalid, its note names the limit ${LIMIT ?? "?"}); nothing stored ${NEEDS}`,
    fieldInvalid && limitWords(fieldNote) && /Not published/.test(said3) && versions() === v3 && storedBody() === before3, { fieldInvalid, fieldNote, said3: said3.slice(0, 120), versions: [v3, versions()] });
  const base3 = (await read(TR))?.version ?? 0;
  const apiOver = LIMIT ? await api(TR, "PUT", `/platform/templates/${encodeURIComponent(KEY)}`, { subject: "Following up J46", body: "a".repeat(LIMIT + 1), baseVersion: base3 }) : null;
  ok(`J-46 W3 underneath: the API refuses ${LIMIT ? LIMIT + 1 : "?"} characters on its body field (422) with the limit in words; nothing stored [needs PF-19c part 1]`,
    apiOver?.status === 422 && limitWords(String(apiOver.body?.fields?.body ?? "")) && versions() === v3, { status: apiOver?.status, body: apiOver?.body?.fields?.body });
  let atLimit = "";
  if (plain && LIMIT) {
    await openEditor(p);
    await box(p).fill("b".repeat(LIMIT));
    await p.locator("[data-template-publish]").click();
    atLimit = await saidText(p, /Published: version \d+/);
  }
  ok(`J-46 W3: a message of exactly ${LIMIT ?? "?"} characters publishes (the limit is the limit, not one below it) ${NEEDS}`,
    !!atLimit && versions() === v3 + 1 && (storedBody() ?? "").length === LIMIT, { atLimit, stored: (storedBody() ?? "").length });
  if (LIMIT) {   // a NOTE, not a step: what "characters" counts for a person who types an emoji at the limit
    const base = (await read(TR))?.version ?? 0;
    const emoji = await api(TR, "PUT", `/platform/templates/${encodeURIComponent(KEY)}`, { subject: "Following up J46", body: "c".repeat(LIMIT - 1) + "🍁", baseVersion: base });
    console.log(`NOTE  J-46 W3: ${LIMIT - 1} letters + one emoji (${LIMIT} characters to a person, ${LIMIT + 1} UTF-16 units): ${emoji.status} ${String(emoji.body?.fields?.body ?? "").slice(0, 120)}`);
  }

  // ---------------------------------------------------------------------------------------------- W4 the wrong role
  const o = await signIn(O); const TO = await pageToken(o);
  const oEditor = await openEditor(o);
  const v4 = versions(), before4 = storedBody();
  const oReadOnly = oEditor && (await box(o).getAttribute("readonly")) !== null && (await o.locator("[data-template-publish]").count()) === 0 && (await o.getByLabel("Insert field").count()) === 0
    && await seen(o.locator("[data-template-readonly]"), 3_000) && (await box(o).inputValue()) === before4;
  await shot(o, "w4-case-officer-read-only-1440");
  const oPut = await api(TO, "PUT", `/platform/templates/${encodeURIComponent(KEY)}`, { subject: "Not allowed J46", body: `Not allowed ${run}`, baseVersion: (await read(TO))?.version ?? 0 });
  ok(`J-46 W4: the Case Officer opens the message read-only (the box read-only, no Insert field, no Publish, the Owner's wording shown) and the API refuses a publish (403); nothing stored ${NEEDS}`,
    oReadOnly && oPut.status === 403 && versions() === v4 && storedBody() === before4, { oEditor, oReadOnly, put: oPut.status });
  await o.context().close();

  // ---------------------------------------------------------------------------------------------- W5 sizes and axe
  for (const width of [400, 1024, 1440]) for (const path of ["/platform/templates", `/platform/templates/${encodeURIComponent(KEY)}`]) {
    const q = await newPage(width, TR);
    await q.goto(`${BASE}${path}`);
    const there = await seen(q.locator(path.endsWith("templates") ? "[data-template-row]" : "[data-template-form]"), 30_000);
    if (there && !path.endsWith("templates")) await seen(q.locator("[data-preview-body]"), 10_000);
    const fits = await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const bad = there ? (await wait(300), await new AxeBuilder({ page: q }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${x.id}: ${x.nodes[0]?.target}`) : ["no page"];
    if (width !== 1440) await shot(q, `w5-${path.endsWith("templates") ? "list" : "editor"}-${width}`);
    ok(`J-46 W5: ${path} at ${width} px has no sideways scroll and no WCAG 2.2 A/AA violation (axe) [needs PF-19s]`, there && fits && bad.length === 0, { there, fits, bad });
    await q.context().close();
  }
  ok("J-46 W5: no page error on any page walked", errors.length === 0, errors.slice(0, 3));

  // ---------------------------------------------------------------------------------------------- W6 R1.47's first step
  const v = await newPage();
  await v.goto(`${BASE}/book/sample-firm`);
  const booking = await seen(v.locator("[data-type-card]"), 30_000) && await seen(v.locator('a[href="/book/sample-firm/free"]'), 5_000);
  await shot(v, "w6-r147-booking-page-1440");
  ok("J-46 W6: the walk ends at R1.47's first step: a visitor opens the firm's public booking page and can choose the Free consultation (its confirmation email is the one layout R1.47 checks)", booking);
  await v.context().close();
  await p.context().close();
} catch (e) {
  ok("J-46: the walk ran to its end", false, String(e).slice(0, 500));
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
