// FO-9s part 3 (R1.29; concept screens/FO-9s/concept.md r3 §4 S3, board design/fo9s-boards.html S3): the guided merge
// dialog on People to merge, against FO-9b part 2's real preview and merge routes, on an isolated copy. Each rule has a
// pass and a fail:
//   G1 BR-8  each field pre-picks its default and says why ("only value", "same", "newer"); "Keep this one instead" on a
//            field keeps that value after the merge (by the database); a field left alone keeps the default
//   G2 BR-8  switching which record stays reloads the preview with the columns swapped and the choices reset
//   G3 BR-9  step 2 names what moves (the loser's leads and notes, as the database counts them); Back keeps the choices
//   G4       step 3's sentence, "Merge 2 people": the pair moves to the Merged tab, the loser is merged into the survivor,
//            and the notice "Merged into <name>." offers Undo, which restores both people
//   G5       a record changed after the dialog opened → "One of these records changed. Reload to see it." with Reload;
//            nothing merged; Reload shows the new value and the merge then goes through
//   G6       money arriving after the dialog opened → the server's sentence; nothing merged
//   G7       Cancel and Escape merge nothing; keyboard only (radios by arrow keys, Next by Enter); axe on the dialog (no
//            serious); 375 px with no sideways scroll; no page error
// Sample rows only; US$0, no model call. Usage, from prototype/:
//   zsh studio/tools/isolated.sh screens_mrg 4573 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo9s_merge_browser.ts 4573 xr_studio_screens_mrg
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const PORT = Number(process.argv[2] ?? 4573), DBNAME = process.argv[3] ?? "xr_studio_screens_mrg", BASE = `http://localhost:${PORT}`;
const SHOTS = join(import.meta.dirname, "..", "..", "..", "product", "screens", "FO-9s", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36).replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db); await db.$disconnect();
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
const R = sql(`select email from platform_staff where actor_id = 'user-R'`);   // the Owner (agent/prospect:merge)
const signIn = async (email: string) => { const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) }); const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token; console.error(`STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2); };
const tR = await signIn(R);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other browser checks
const api = async (method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${tR}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
/** A person with one lead and a note, owned by the Owner (added as new), then given a language as Sample. */
async function person(given: string, family: string, email: string | null, language: string | null): Promise<{ person: string; lead: string }> {
  const tag = `${given.toLowerCase()}.${family.toLowerCase()}.${run}@example.org`;
  const r = await api("POST", "/front-office/leads", { requestId: randomUUID(), givenNames: `${given}${run}`, familyName: family, email: tag, source: "Phone call", note: `First call ${given} ${family} ${run}`, confirmedNew: true });
  if (r.status !== 201) { console.error(`STOP  add lead refused: ${r.status} ${JSON.stringify(r.body)}`); process.exit(2); }
  const [p, l] = sql(`select p.id || '|' || l.id from fo_person p join fo_lead l on l.person_id = p.id where p.firm_id = '${A}' and lower(p.email) = '${tag}'`).split("|");
  sql(`update fo_person set email = ${email ? `'${email}'` : "null"}, language = ${language ? `'${language}'` : "null"} where id = '${p}'`);
  return { person: p, lead: l };
}
/** An OPEN pair as a web-form arrival writes it ("Add as new" wrote it Kept separate: set back to To review). */
const pairOf = (a: string, b: string) => { const [lo, hi] = [a, b].sort(); return sql(`insert into fo_dup_review (firm_id, kind, low_id, high_id, score, reasons, status) values ('${A}', 'PERSON', '${lo}', '${hi}', 84, '[{"key":"NAME","similarity":0.84}]'::jsonb, 'OPEN')
  on conflict (firm_id, low_id, high_id) do update set status = 'OPEN', score = excluded.score, reasons = excluded.reasons, decided_by = null, decided_at = null returning id`); };
const val = (p: string, col: string) => sql(`select coalesce(${col}::text, '') from fo_person where id = '${p}'`);
const mergedInto = (p: string) => val(p, "merged_into_id");

// The Lena pair (G1-G4): the older record has no email and English; the newer has an email and French.
const lena = await person("Lena", "Park", null, "en");
await new Promise((r) => setTimeout(r, 30));
const lena2 = await person("Lena", "Parks", `lena.parks.${run}@example.org`, "fr");
const P_LENA = pairOf(lena.person, lena2.person);
const notesMoving = sql(`select count(*) from fo_note n join fo_lead l on l.id = n.lead_id where l.person_id = '${lena2.person}'`);
// G5 (a record changes meanwhile) and G6 (money arrives meanwhile).
const omar = await person("Omar", "Haddad", null, null), omar2 = await person("Omar", "Hadad", null, null), P_OMAR = pairOf(omar.person, omar2.person);
const ines = await person("Ines", "Costa", null, null), ines2 = await person("Ines", "Kosta", null, null), P_INES = pairOf(ines.person, ines2.person);
ok("FO-9s part 3 setup: three Sample pairs on To review", !!P_LENA && !!P_OMAR && !!P_INES);

const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") && process.platform !== "darwin" ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {});
const errors: string[] = [];
async function pageAs(width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tR);
  p.on("pageerror", (e) => errors.push(String(e)));
  return p;
}
const dialog = (p: Page) => p.locator("[data-merge-dialog]");
async function openMerge(p: Page, pair: string) {
  await p.goto(`${BASE}/front-office/duplicates`);
  await p.locator(`[data-dup-pair="${pair}"]`).getByRole("button", { name: "Merge…" }).click({ timeout: 30_000 });
  await dialog(p).locator("[data-merge-field='email']").waitFor({ timeout: 15_000 });
}
const why = async (p: Page, f: string) => (await dialog(p).locator(`[data-merge-field='${f}'] td`).last().innerText()).trim();
const next = (p: Page) => p.getByRole("dialog").getByRole("button", { name: "Next" });

try {
  const p = await pageAs();
  // ----------------------------------------------------------------------- G7 Cancel / Escape merge nothing
  await openMerge(p, P_LENA);
  await p.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await openMerge(p, P_LENA); await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  ok("FO-9s G7 fail: Cancel and Escape close the dialog and merge nothing", (await p.getByRole("dialog").count()) === 0 && mergedInto(lena2.person) === "" && sql(`select status from fo_dup_review where id = '${P_LENA}'`) === "OPEN");

  // ----------------------------------------------------------------------- G1, G2 step 1
  await openMerge(p, P_LENA);
  const headers = await dialog(p).locator("thead th").allInnerTexts();
  await p.screenshot({ path: join(SHOTS, "fo9s3-01-choose-1440.png"), fullPage: true });
  ok("FO-9s G1 BR-8 pass: the defaults say why: email 'only value', first name 'same', language 'newer'",
    await why(p, "email") === "only value" && await why(p, "givenNames") === "same" && await why(p, "language") === "newer", { email: await why(p, "email"), given: await why(p, "givenNames"), lang: await why(p, "language") });
  const firstStays = headers[1] ?? "";
  await p.getByRole("radiogroup", { name: "Which record stays" }).getByRole("radio").nth(1).check();
  await p.waitForFunction((h) => document.querySelectorAll("[data-merge-dialog] thead th")[1]?.textContent !== h, firstStays, { timeout: 10_000 });
  const swapped = await dialog(p).locator("thead th").allInnerTexts();
  ok("FO-9s G2 BR-8 pass: switching which record stays reloads the preview with the columns swapped", swapped[1] === `${headers[2]} (stays)` && swapped[2] === headers[1].replace(" (stays)", ""), { headers, swapped });
  await p.getByRole("radiogroup", { name: "Which record stays" }).getByRole("radio").nth(0).check();
  await p.waitForFunction((h) => document.querySelectorAll("[data-merge-dialog] thead th")[1]?.textContent === h, firstStays, { timeout: 10_000 });
  // Survivor = the first listed. Keep the other record's last name ("Keep this one instead"), by keyboard.
  const survivorIsLena = sql(`select id from fo_person where id in ('${lena.person}', '${lena2.person}') order by id limit 1`) === lena.person;
  const S = survivorIsLena ? lena : lena2, L = survivorIsLena ? lena2 : lena;
  // The last name's other value (not the default): its radio is the one not checked.
  const famRadios = dialog(p).locator("[data-merge-field='familyName'] input[type=radio]");
  const famOff = (await famRadios.nth(0).isChecked()) ? 1 : 0, loserFamily = (await famRadios.nth(famOff).getAttribute("aria-label"))!.replace("Last name: keep ", "");
  await famRadios.nth(famOff).check();
  ok("FO-9s G1: a changed field says it is the person's choice", await why(p, "familyName") === "your choice");

  // ----------------------------------------------------------------------- G3 step 2, Back keeps choices
  await next(p).focus(); await p.keyboard.press("Enter");
  await dialog(p).locator("[data-merge-moves]").waitFor();
  await p.screenshot({ path: join(SHOTS, "fo9s3-02-what-moves-1440.png"), fullPage: true });
  const movesText = await dialog(p).locator("[data-merge-moves]").innerText();
  const loserNotes = sql(`select count(*) from fo_note n join fo_lead l on l.id = n.lead_id where l.person_id = '${L.person}'`);
  ok("FO-9s G3 BR-9 pass: step 2 names what moves as the database counts it (1 lead and its notes) and that nothing is deleted",
    movesText.includes("1 lead") && movesText.includes(`${loserNotes} note`) && /Nothing is deleted/.test(movesText), { movesText: movesText.slice(0, 200), loserNotes, notesMoving });
  await p.getByRole("dialog").getByRole("button", { name: "Back" }).click();
  ok("FO-9s G3 fail: Back keeps the choice made on step 1", await dialog(p).getByRole("radio", { name: `Last name: keep ${loserFamily}`, exact: true }).isChecked() && await why(p, "familyName") === "your choice");

  // ----------------------------------------------------------------------- G4 confirm, merged, Undo
  await next(p).click(); await next(p).click();
  const sentence = await dialog(p).locator("[data-merge-confirm]").innerText();
  await p.screenshot({ path: join(SHOTS, "fo9s3-03-confirm-1440.png"), fullPage: true });
  await p.getByRole("dialog").getByRole("button", { name: "Merge 2 people" }).click();
  await p.locator("[data-merged-notice]").waitFor({ timeout: 15_000 });
  await p.screenshot({ path: join(SHOTS, "fo9s3-04-merged-notice-1440.png"), fullPage: true });
  ok("FO-9s G4 pass: Merge 2 people merges the loser into the survivor; the pair is MERGED and leaves To review; the notice names the survivor",
    / will be merged into /.test(sentence) && mergedInto(L.person) === S.person && sql(`select status from fo_dup_review where id = '${P_LENA}'`) === "MERGED"
    && (await p.locator(`[data-dup-pair="${P_LENA}"]`).count()) === 0 && /^Merged into /.test((await p.getByText(/^Merged into /).innerText())), sentence);
  ok("FO-9s G1 BR-8 pass and fail: the chosen (non-default) last name is kept; the untouched language and email keep their defaults (the newer value, the only value)",
    val(S.person, "family_name") === loserFamily && val(S.person, "language") === "fr" && val(S.person, "email") === `lena.parks.${run}@example.org`,
    { family: val(S.person, "family_name"), lang: val(S.person, "language"), email: val(S.person, "email") });
  await p.locator("main").getByRole("button", { name: "Undo", exact: true }).click();
  await p.locator("[data-merged-notice]").waitFor({ state: "detached", timeout: 15_000 });
  ok("FO-9s G4: Undo on the notice restores both people", mergedInto(L.person) === "" && sql(`select count(*) from fo_person where id in ('${S.person}', '${L.person}') and merged_into_id is null`) === "2");

  // ----------------------------------------------------------------------- G5 stale
  await openMerge(p, P_OMAR);
  const omarLoser = sql(`select id from fo_person where id in ('${omar.person}', '${omar2.person}') order by id desc limit 1`);
  sql(`update fo_person set language = 'es', updated_at = now() where id = '${omarLoser}'`);   // someone else edits it meanwhile
  await next(p).click(); await next(p).click();
  await p.getByRole("dialog").getByRole("button", { name: "Merge 2 people" }).click();
  await dialog(p).getByText("One of these records changed. Reload to see it.").waitFor({ timeout: 15_000 });
  await p.screenshot({ path: join(SHOTS, "fo9s3-05-stale-1440.png"), fullPage: true });
  ok("FO-9s G5 fail: a record changed after the dialog opened is refused in words with Reload; nothing merged",
    mergedInto(omar.person) === "" && mergedInto(omar2.person) === "" && await p.getByRole("dialog").getByRole("button", { name: "Merge 2 people" }).isDisabled());
  await p.getByRole("dialog").getByRole("button", { name: "Reload" }).click();
  await dialog(p).locator("[data-merge-field='language']").getByText("es").waitFor({ timeout: 10_000 });
  await next(p).click(); await next(p).click(); await p.getByRole("dialog").getByRole("button", { name: "Merge 2 people" }).click();
  await p.locator("[data-merged-notice]").waitFor({ timeout: 15_000 });
  ok("FO-9s G5 pass: Reload shows the new value and the merge then goes through", (mergedInto(omar.person) || mergedInto(omar2.person)) !== "");

  // ----------------------------------------------------------------------- G6 money arrives meanwhile
  await openMerge(p, P_INES);
  sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${A}', 'seed:FO-9s-3', now()) on conflict (firm_id) do nothing`);
  sql(`insert into money_invoice (firm_id, person_id, currency, created_by, updated_at) values ('${A}', '${ines2.person}', 'CAD', 'seed:FO-9s-3', now())`);
  await next(p).click(); await next(p).click(); await p.getByRole("dialog").getByRole("button", { name: "Merge 2 people" }).click();
  await dialog(p).getByText(/cannot be merged here yet/).waitFor({ timeout: 15_000 });
  ok("FO-9s G6 fail: money arriving after the dialog opened → the server's sentence; nothing merged", mergedInto(ines.person) === "" && mergedInto(ines2.person) === "");
  await p.keyboard.press("Escape");
  await openMerge(p, P_INES);
  ok("FO-9s G6: reopened, the dialog says so before any step and Next is off", (await dialog(p).getByText(/cannot be merged here yet/).count()) === 1 && await next(p).isDisabled());
  const axe = await new AxeBuilder({ page: p }).include("[role=dialog]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok("FO-9s G7: the dialog passes axe (no serious or critical)", bad.length === 0, bad.map((v) => `${v.id}: ${v.help}`));
  await p.keyboard.press("Escape");

  // ----------------------------------------------------------------------- G7 keyboard radios, 375 px
  const k = await person("Kai", "Lund", null, null), k2 = await person("Kai", "Lunde", null, null), P_KAI = pairOf(k.person, k2.person);
  const m = await pageAs(375); await openMerge(m, P_KAI);
  await m.getByRole("radiogroup", { name: "Which record stays" }).getByRole("radio").first().focus(); await m.keyboard.press("ArrowRight");
  await m.waitForTimeout(800);
  ok("FO-9s G7: keyboard only: an arrow key moves which record stays", await m.getByRole("radiogroup", { name: "Which record stays" }).getByRole("radio").nth(1).isChecked());
  await m.screenshot({ path: join(SHOTS, "fo9s3-06-choose-375.png"), fullPage: true });
  ok("FO-9s G7: no sideways page scroll with the dialog open at 375 px", !(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  await m.context().close();
  ok("FO-9s part 3: no page error", errors.length === 0, errors);
} finally { await browser.close(); }
process.exit(summary() ? 1 : 0);
