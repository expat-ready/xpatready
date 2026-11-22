// FO-9s part 1 (R1.29; concept screens/FO-9s/concept.md r3, board design/fo9s-boards.html S1; P-574 (2); AG-2-68 rules 11,
// 16): the duplicate warning in Add a lead as details are typed, against the real API (FO-9a's `POST duplicates/check`,
// FO-2's `POST leads`), on an isolated copy. Each rule has a pass and a fail:
//   D1 BR-3  a similar name with the same phone in another spelling names the person with "Same phone · Similar name (NN%)";
//            a first name alone names no one
//   D2 BR-1  Save stays enabled while the hint shows
//   D3 BR-2  three blurs with unchanged details send one check; editing a key clears the hint at once, and leaving the
//            field checks again; the public web form never calls the check
//   D4 BR-4  a record the adder may not open is the nameless line only
//   D5 BR-5  "Use this person" → Save reads "Add lead to <name>", the lead goes on that person (no new person); Add as new
//            → one Save, no 409, a new person; an exact match with no choice → the 409 box replaces the hint (one box)
//   D6 BR-5b after "Use this person" on a name match, the typed email the pick did not match is offered pre-ticked and kept
//            in the first note; unticked it reads "Not saved" and is not kept
//   D7       keyboard (Tab from Phone reaches the hint, Enter picks), axe with the hint open, no sideways scroll at 375,
//            1024 and 1440 px; no page error
// Sample rows only; US$0, no model call. Usage, from prototype/:
//   zsh studio/tools/isolated.sh screens_dup 4561 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo9s_duplicates_browser.ts 4561 xr_studio_screens_dup
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const PORT = Number(process.argv[2] ?? 4561), DBNAME = process.argv[3] ?? "xr_studio_screens_dup", BASE = `http://localhost:${PORT}`;
const STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "FO-9s", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
// Letters only: FO-9a matches a name with a digit only exactly, so a digit in the tag would hide the similar-name match.
const run = Date.now().toString(36).replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
// D4 needs "each person sees their own", so a colleague's lead is one the Case Officer may not open.
await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:FO-9s-test", workspaceId: await platformAuditWorkspaceId(db as never), reason: "FO-9s: each person sees their own" });
await db.$disconnect();
const staffOf = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
const T = staffOf("user-T"), O = staffOf("user-O");   // Case Manager, Case Officer (sees own)
async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tok = { T: await signIn(T.email), O: await signIn(O.email) };
const post = async (t: string, body: unknown) => { const r = await fetch(`${BASE}/api/front-office/leads`, { method: "POST", headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) as { person?: { id: string } } | null }; };
const personsByEmail = (email: string) => sql(`select count(*) from fo_person where firm_id = '${A}' and lower(email) = lower('${email}')`);
const personOfLead = (given: string) => sql(`select p.id from fo_lead l join fo_person p on p.id = l.person_id where l.firm_id = '${A}' and l.created_at > now() - interval '1 hour' and exists (select 1 from fo_note n where n.lead_id = l.id and n.text like '%${given}%') limit 1`);

// Sample people the Case Officer owns (so they may open them), and one the Case Manager owns (hidden from the Case Officer).
const lena = await post(tok.O, { requestId: randomUUID(), givenNames: `Lena${run}`, familyName: "Park", email: `lena.${run}@example.org`, phone: "+1 (416) 555-0101", source: "Phone call", confirmedNew: true });
const omar = await post(tok.O, { requestId: randomUUID(), givenNames: `Omar${run}`, familyName: "Haddad", email: `omar.${run}@example.org`, source: "Phone call", confirmedNew: true });
const hidden = await post(tok.T, { requestId: randomUUID(), givenNames: `Hidden${run}`, familyName: "Sample", email: `hidden.${run}@example.org`, source: "Referral", confirmedNew: true });

const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") && process.platform !== "darwin" ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {});
const errors: string[] = [];
async function pageAs(t: string, width = 1440): Promise<{ p: Page; checks: string[]; leadStatuses: number[] }> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
  p.on("pageerror", (e) => errors.push(String(e)));
  const checks: string[] = [], leadStatuses: number[] = [];
  p.on("request", (r) => { if (r.url().includes("/api/front-office/duplicates/check")) checks.push(r.postData() ?? ""); });
  p.on("response", (r) => { if (r.url().endsWith("/api/front-office/leads") && r.request().method() === "POST") leadStatuses.push(r.status()); });
  return { p, checks, leadStatuses };
}
async function openPanel(p: Page) {
  await p.goto(`${BASE}/front-office/leads?view=mine`);
  await p.getByRole("heading", { level: 1, name: "Leads" }).waitFor({ timeout: 30_000 });
  await p.locator("[data-add-lead-open]").waitFor({ timeout: 30_000 });
  await p.locator("[data-add-lead-open]").click();
  await p.getByLabel("First name", { exact: true }).waitFor({ timeout: 20_000 });
}
const field = (p: Page, label: string) => p.getByLabel(label, { exact: true });
/** Types into a field and leaves it (Tab), as a person does: the blur is what checks. */
async function typeIn(p: Page, label: string, v: string) { await field(p, label).fill(v); await field(p, label).press("Tab"); }
const settle = (p: Page) => p.waitForTimeout(1_200);   // the 400 ms wait, the answer, a margin

try {
  ok("FO-9s setup: three Sample people on file (two the Case Officer owns, one the Case Manager owns)", [lena, omar, hidden].every((x) => x.status === 201), [lena.status, omar.status, hidden.status]);
  const { p: o, checks, leadStatuses } = await pageAs(tok.O);

  // ---------------------------------------------------------------- D1, D2: a similar name with the same phone
  await openPanel(o);
  await typeIn(o, "First name", `Lena${run}`); await typeIn(o, "Last name (optional)", "Parks");
  await typeIn(o, "Phone", "416.555.0101");
  await o.locator("[data-dup-hint]").waitFor({ timeout: 10_000 });
  const hint = await o.locator("[data-dup-hint]").innerText();
  await o.screenshot({ path: join(SHOTS, "fo9s-01-hint-1440.png"), fullPage: true });
  ok("FO-9s D1 pass (BR-3, R1.29): \"416.555.0101\" + a similar name names Lena Park with \"Same phone · Similar name (NN%)\"",
    hint.includes(`Lena${run} Park`) && /Same phone · Similar name \(\d{2,3}%\)/.test(hint) && hint.includes("Add as new"), hint);
  ok("FO-9s D2 pass (BR-1): Save lead stays enabled while the hint shows (warn, don't block)", await o.getByRole("button", { name: "Save lead" }).isEnabled());

  // ---------------------------------------------------------------- D3: one check per details; an edit clears and checks again
  const before = checks.length;
  await field(o, "Phone").focus(); await field(o, "Phone").press("Tab"); await field(o, "Email").focus(); await field(o, "Email").press("Tab"); await field(o, "Phone").focus(); await field(o, "Phone").press("Tab");
  await settle(o);
  ok("FO-9s D3 fail (BR-2): three blurs with the same details send no new check", checks.length === before, { before, after: checks.length });
  await field(o, "Phone").fill("416.555.0109");
  ok("FO-9s D3 pass (BR-2): editing a key clears the hint at once", (await o.locator("[data-dup-hint]").count()) === 0);
  await field(o, "Phone").press("Tab"); await settle(o);
  ok("FO-9s D3 pass (BR-2): leaving the edited field checks again, once", checks.length === before + 1, checks.slice(before));
  const webForm = readdirSync(join(STUDIO, "web", "src", "modules", "front-office", "sales")).filter((f) => f.startsWith("web-form")).map((f) => readFileSync(join(STUDIO, "web", "src", "modules", "front-office", "sales", f), "utf8")).join("\n");
  ok("FO-9s D3 fail (BR-2, FO-2): the public web form pages never call the duplicate check", !/duplicates|DuplicateHint|useDuplicateCheck/.test(webForm));

  // D1 fail: a first name alone names no one (the hint for Lena Parks is gone after the edit; start again).
  o.once("dialog", (d) => void d.accept()); await o.keyboard.press("Escape"); await o.waitForTimeout(300);
  await openPanel(o);
  // A plain first name (the run tag inside a name would itself make names alike).
  await typeIn(o, "First name", "Lena"); await typeIn(o, "Email", `someone.${run}@example.org`); await settle(o);
  ok("FO-9s D1 fail (BR-3): the first name \"Lena\" alone with another email does not name Lena Park (no hint)", (await o.locator("[data-dup-hint]").count()) === 0);

  // ---------------------------------------------------------------- D4: a record the adder may not open
  await field(o, "First name").fill("Hugo"); await field(o, "Email").fill(`hidden.${run}@example.org`); await field(o, "Email").press("Tab");
  await o.locator("[data-dup-hint]").waitFor({ timeout: 10_000 });
  const hid = await o.locator("[data-dup-hint]").innerText();
  ok("FO-9s D4 (BR-4, AG-2-68 rule 11): a match the Case Officer may not open is the nameless line only, no name, no Use this person",
    hid.includes("Possible match with a record you cannot open — ask a manager") && !hid.includes(`Hidden${run}`) && (await o.locator("[data-dup-match]").count()) === 0, hid);

  // ---------------------------------------------------------------- D5: Use this person; Add as new; the 409 replaces
  o.once("dialog", (d) => void d.accept()); await o.keyboard.press("Escape"); await o.waitForTimeout(300);
  await openPanel(o);
  await typeIn(o, "First name", `Omar${run}`); await typeIn(o, "Last name (optional)", "Haddad"); await typeIn(o, "Email", `omar.${run}@example.org`);
  await o.locator("[data-dup-hint]").waitFor({ timeout: 10_000 });
  await o.getByRole("button", { name: `Use this person: Omar${run} Haddad` }).click();
  await o.getByRole("button", { name: `Add lead to Omar${run} Haddad` }).waitFor({ timeout: 5_000 });
  await o.screenshot({ path: join(SHOTS, "fo9s-02-chosen-1440.png"), fullPage: true });
  await typeIn(o, "Source", "Phone call");
  await field(o, "First note (optional)").fill(`D5 use ${run}`);
  const n409 = leadStatuses.length;
  await o.getByRole("button", { name: `Add lead to Omar${run} Haddad` }).click();
  await o.getByRole("heading", { level: 1, name: new RegExp(`Omar${run}`) }).waitFor({ timeout: 20_000 });
  ok("FO-9s D5 pass (BR-5, AG-2-68 rule 16): Use this person → the lead is on Omar's person, no new person, one Save (no 409)",
    personOfLead(`D5 use ${run}`) === omar.body?.person?.id && personsByEmail(`omar.${run}@example.org`) === "1" && leadStatuses.slice(n409).join() === "201", { person: personOfLead(`D5 use ${run}`), statuses: leadStatuses.slice(n409) });
  await openPanel(o);
  await typeIn(o, "First name", `Omar${run}`); await typeIn(o, "Email", `omar.${run}@example.org`);
  await o.locator("[data-dup-hint]").waitFor({ timeout: 10_000 });
  await o.locator("[data-dup-hint]").getByRole("button", { name: "Add as new" }).click();
  await typeIn(o, "Source", "Walk-in"); await field(o, "First note (optional)").fill(`D5 new ${run}`);
  const nNew = leadStatuses.length;
  await o.getByRole("button", { name: "Save lead" }).click();
  await o.getByRole("heading", { level: 1, name: new RegExp(`Omar${run}`) }).waitFor({ timeout: 20_000 });
  ok("FO-9s D5 fail (BR-5): Add as new in the hint → one Save, no 409, a new person (two people with that email now)",
    leadStatuses.slice(nNew).join() === "201" && personsByEmail(`omar.${run}@example.org`) === "2" && personOfLead(`D5 new ${run}`) !== omar.body?.person?.id, leadStatuses.slice(nNew));
  await openPanel(o);
  await typeIn(o, "First name", `Lena${run}`); await typeIn(o, "Email", `lena.${run}@example.org`); await typeIn(o, "Source", "Phone call");
  await o.locator("[data-dup-hint]").waitFor({ timeout: 10_000 });
  await o.getByRole("button", { name: "Save lead" }).click();
  await o.locator("[data-known-person]").waitFor({ timeout: 10_000 });
  await o.screenshot({ path: join(SHOTS, "fo9s-03-409-replaces-1440.png"), fullPage: true });
  ok("FO-9s D5 (BR-5, M1): an exact match with no choice → Save shows the 409 box and the hint is gone (one box, never two)",
    (await o.locator("[data-dup-hint]").count()) === 0 && (await o.locator("[data-known-person]").count()) === 1);
  o.once("dialog", (d) => void d.accept()); await o.keyboard.press("Escape"); await o.waitForTimeout(300);

  // ---------------------------------------------------------------- D6: the typed email is offered, kept or not
  for (const tick of [true, false]) {
    await openPanel(o);
    const mail = `lena.new.${tick ? "k" : "n"}${run}@example.org`;
    await typeIn(o, "First name", `Lena${run}`); await typeIn(o, "Last name (optional)", "Parke"); await typeIn(o, "Email", mail);
    await o.locator("[data-dup-hint]").waitFor({ timeout: 10_000 });
    await o.getByRole("button", { name: `Use this person: Lena${run} Park` }).click();
    const keep = o.locator("[data-dup-keep]");
    await keep.waitFor({ timeout: 5_000 });
    const offered = await o.locator("[data-dup-choice]").innerText();
    if (!tick) await keep.uncheck();
    const said = await o.locator("[data-dup-choice]").innerText();
    if (tick) await o.screenshot({ path: join(SHOTS, "fo9s-04-offered-1440.png"), fullPage: true });
    await typeIn(o, "Source", "Email"); await field(o, "First note (optional)").fill(`D6 ${tick} ${run}`);
    await o.getByRole("button", { name: `Add lead to Lena${run} Park` }).click();
    await o.getByRole("heading", { level: 1, name: new RegExp(`Lena${run}`) }).waitFor({ timeout: 20_000 });
    const note = sql(`select replace(n.text, E'\\n', ' ') from fo_note n where n.firm_id = '${A}' and n.text like 'D6 ${tick} ${run}%'`);
    if (tick) ok("FO-9s D6 pass (BR-5b, M2): the typed email is offered pre-ticked and kept in the first note (\"Also gave: …\"), on Lena's person",
      offered.includes(`Also keep in the lead's first note: ${mail}`) && (await keep.count()) === 0 && note.includes(`Also gave: ${mail}`) && personOfLead(`D6 ${tick} ${run}`) === lena.body?.person?.id, { offered, note });
    else ok("FO-9s D6 fail (BR-5b): unticked, the box says \"Not saved\" and the note does not keep it", said.includes(`Not saved: ${mail}`) && !note.includes(mail), { said, note });
  }

  // ---------------------------------------------------------------- D7: keyboard, axe, widths
  await openPanel(o);
  await typeIn(o, "First name", `Lena${run}`); await typeIn(o, "Last name (optional)", "Parks"); await typeIn(o, "Phone", "416 555 0101");
  await o.locator("[data-dup-hint]").waitFor({ timeout: 10_000 });
  const axe = await new AxeBuilder({ page: o }).include("[role=dialog]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  ok("FO-9s D7: the panel with the hint passes axe (WCAG 2.1 A and AA)", axe.violations.length === 0, axe.violations.map((v) => `${v.id}: ${v.help}`));
  await field(o, "Phone").focus(); await o.keyboard.press("Tab");
  const focused = await o.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? "");
  await o.keyboard.press("Enter");
  ok("FO-9s D7: keyboard only: Tab from Phone reaches Use this person and Enter picks it", focused.startsWith("Use this person") && (await o.locator("[data-dup-choice]").count()) === 1, focused);
  o.once("dialog", (d) => void d.accept()); await o.keyboard.press("Escape"); await o.waitForTimeout(300);
  for (const w of [375, 1024, 1440]) {
    const { p } = await pageAs(tok.O, w); await openPanel(p);
    await typeIn(p, "First name", `Lena${run}`); await typeIn(p, "Last name (optional)", "Parks"); await typeIn(p, "Phone", "416 555 0101");
    await p.locator("[data-dup-hint]").waitFor({ timeout: 10_000 });
    await p.locator("[data-dup-hint]").scrollIntoViewIfNeeded();
    await p.screenshot({ path: join(SHOTS, `fo9s-05-hint-${w}.png`) });
    ok(`FO-9s D7: no sideways page scroll with the hint open at ${w} px`, !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
    await p.context().close();
  }
  ok("FO-9s: no page error", errors.length === 0, errors);
} finally { await browser.close(); }
process.exit(summary() ? 1 : 0);
