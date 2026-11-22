// J-29 (map row 29, R1.29: one person record; duplicate warning; safe merge): the join-and-walk for the row, over FO-1a
// (fo_person), FO-9a part 1 (#2062, the match service and POST duplicates/check), FO-9b part 0 (#2021, PersonMergePort
// and its fake), FO-9s part 1 (the warning in Add a lead), and the parts still to come: FO-9b part 1 (merge and Undo),
// FO-9b part 2 (the review list, the guided merge routes, never automatic with a case or money), FO-9s parts 2-3
// (Sales › People to merge and the merge dialog; concept screens/FO-9s/concept.md r3, #2896). Written by Track B's qa
// lane (22 Nov, A286) before the build finishes, so qa only runs it when the last part merges (concept §J-29: S1 → lead
// → S2 → S3 → Undo).
// Done when (CAPABILITIES R1.29): "Adding a lead that matches name, email or phone warns before saving; merge keeps
// both histories, never automatic when either has a case or money; a merge can be undone from the review list".
//   W1 (warns before saving, by screens): in Add a lead, a similar name with the same phone in another spelling, and an
//       exact email, each name the person on file with the reason; Save stays enabled; nothing is saved by the warning.
//   W2 (the review list): the pair is on Sales › People to merge (GET duplicates/review) with its score and reasons.
//   W3 (merge keeps both histories): merging the pair keeps the survivor and moves the loser's lead and notes to it;
//       the loser is a tombstone (merged_into), one audit line, no contact values in it.
//   W4 (never automatic with money): a person with an invoice and a new lead with the same email are not merged by
//       themselves: both people stay, and the pair is on the review list.
//   W5 (undo from the review list): Undo merge on the Merged tab restores both people and exactly the moved rows; a
//       second Undo is refused (409) in words.
//   W6 (roles): the review list without agent/prospect:merge has no merge (403); no session 401.
//   W7: the walk ends at R1.30's first step: the Leads list (filters) shows the survivor's leads under one person.
// Fails on main today (P-606) only on the steps whose parts are not merged; each failing label names the part.
// Sample data only; US$0, no model call, no live mail. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j29 4429 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j29 4429 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_29.ts j29 4429
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j29", Number(process.argv[3] ?? 4429)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "screens", "J-29", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
// Letters only: FO-9a matches a name with a digit only exactly, so a digit in the tag would hide the similar-name match.
const run = Date.now().toString(36).replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const errors: string[] = [];
const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 150 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
try {
  // ------------------------------------------------------------------------------------------------ setup (Sample)
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`);
  const staffOf = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
  const signIn = async (email: string): Promise<string> => {
    const r = await api(null, "POST", "/platform/session/local", { firmKey: "sample-firm", email, secondStep: true });
    if (r.body?.token) return r.body.token as string;
    console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${r.body?.detail}`); process.exit(2);
  };
  const R = staffOf("user-R"), O = staffOf("user-O");   // the Owner (may merge), a Case Officer (adds leads)
  const tR = await signIn(R.email), tO = await signIn(O.email);
  const addLead = (t: string, body: Record<string, unknown>) => api(t, "POST", "/front-office/leads", { requestId: randomUUID(), source: "Phone call", ...body });
  // Two people on file, each with a lead and a note of its own (the "histories"), added by the Owner through FO-2's route.
  const lena = await addLead(tR, { givenNames: `Lena${run}`, familyName: "Park", email: `lena.${run}@example.org`, phone: "+1 (416) 555-0101", note: `Lena's first call ${run}`, confirmedNew: true });
  const omar = await addLead(tR, { givenNames: `Omar${run}`, familyName: "Haddad", email: `omar.${run}@example.org`, confirmedNew: true });
  const personOf = (email: string) => sql(`select coalesce(string_agg(id::text, ','), '') from fo_person where firm_id = '${A}' and lower(email) = lower('${email}')`);
  const people = () => sql(`select count(*) from fo_person where firm_id = '${A}'`);
  const LENA = personOf(`lena.${run}@example.org`), OMAR = personOf(`omar.${run}@example.org`);
  ok("J-29 setup: the Sample firm's front office and two people on file, each with a lead", fo.failed.length === 0 && lena.status === 201 && omar.status === 201 && !!LENA && !!OMAR, [lena.status, omar.status, lena.body?.detail]);

  // --------------------------------------------------------------------------- W1: warns before saving (by screens)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tO);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
  const checks: string[] = []; p.on("request", (r) => { if (r.url().includes("/api/front-office/duplicates/check")) checks.push(r.postData() ?? ""); });
  const field = (pg: Page, label: string) => pg.getByLabel(label, { exact: true });
  const typeIn = async (pg: Page, label: string, v: string) => { await field(pg, label).fill(v); await field(pg, label).press("Tab"); };
  const openPanel = async () => {
    await p.goto(`${BASE}/front-office/leads?view=all`);
    await p.getByRole("heading", { level: 1, name: "Leads" }).waitFor({ timeout: 30_000 });
    await p.locator("[data-add-lead-open]").click();
    await field(p, "First name").waitFor({ timeout: 20_000 });
  };
  await openPanel();
  const n0 = people();
  await typeIn(p, "First name", `Lena${run}`); await typeIn(p, "Last name (optional)", "Parks"); await typeIn(p, "Phone", "416.555.0101");
  await p.locator("[data-dup-hint]").waitFor({ timeout: 10_000 }).catch(() => undefined);
  const hint1 = (await p.locator("[data-dup-hint]").innerText().catch(() => "")).replace(/\s+/g, " ");
  await p.screenshot({ path: join(SHOTS, "w1-warning-name-phone-1440.png"), fullPage: true });
  ok("R1.29 W1: Add a lead with a similar name (Parks) and the same phone in another spelling (416.555.0101) names Lena Park on file with the reason, before Save",
    hint1.includes(`Lena${run} Park`) && /Same phone/.test(hint1) && /Similar name/.test(hint1), hint1.slice(0, 240));
  ok("R1.29 W1: the warning does not block: Save lead stays enabled, and nothing was saved by the warning", await p.getByRole("button", { name: "Save lead" }).isEnabled() && people() === n0);
  await field(p, "Phone").fill(""); await field(p, "First name").fill("Hugo"); await field(p, "Last name (optional)").fill("Sample");
  await typeIn(p, "Email", `OMAR.${run}@example.org`);
  await p.locator("[data-dup-hint]").waitFor({ timeout: 10_000 }).catch(() => undefined);
  const hint2 = (await p.locator("[data-dup-hint]").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("R1.29 W1: the same email in other capitals names Omar Haddad with 'Same email'", hint2.includes(`Omar${run} Haddad`) && /Same email/i.test(hint2), hint2.slice(0, 240));
  const axe = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  ok("R1.29 W1: the Add a lead panel with the warning open is axe clean", axe.violations.length === 0, axe.violations.map((v) => `${v.id} (${v.nodes.length})`));
  await field(p, "First name").fill("Lena"); await field(p, "Last name (optional)").fill(""); await typeIn(p, "Email", `someone.${run}@example.org`); await p.waitForTimeout(1_200);
  ok("R1.29 W1 fail: a first name alone with another email names no one (no warning)", (await p.locator("[data-dup-hint]").count()) === 0, checks.length);
  // A third person with Lena's phone typed apart, added as new by the Case Officer: the pair a manager will merge.
  const lena2 = await addLead(tO, { givenNames: `Lena${run}`, familyName: "Parks", email: `lena.parks.${run}@example.org`, phone: "416 555 0102", note: `Second record's call ${run}`, confirmedNew: true });
  const LENA2 = personOf(`lena.parks.${run}@example.org`);
  ok("J-29 W1: 'Add as new' keeps a second record (Lena Parks) as the adder chose", lena2.status === 201 && !!LENA2 && LENA2 !== LENA, lena2.body?.detail ?? lena2.status);

  // ------------------------------------------------------------------------------------ W2: the review list
  const list = await api(tR, "GET", "/front-office/duplicates/review");
  const pair = (list.body?.items ?? list.body?.pairs ?? []).find((x: { personIds?: string[]; a?: { id: string }; b?: { id: string } }) => JSON.stringify(x).includes(LENA) && JSON.stringify(x).includes(LENA2));
  ok("R1.29 W2 (part missing: FO-9b part 2, GET duplicates/review): the pair Lena Park / Lena Parks is on the review list with a score and its reasons",
    list.status === 200 && !!pair && typeof pair.score === "number" && (pair.reasons ?? []).length > 0, { status: list.status, detail: list.body?.detail ?? list.body?.message ?? null });
  await p.goto(`${BASE}/front-office/leads`); await p.waitForTimeout(800);
  const menu = await p.getByRole("link", { name: /People to merge/ }).count();
  await p.screenshot({ path: join(SHOTS, "w2-sales-menu-1440.png"), fullPage: true });
  ok("R1.29 W2 (part missing: FO-9s part 2, Sales › People to merge): the Owner's Sales menu offers People to merge with the open count", await (async () => {
    const pr = await ctx.newPage(); await pr.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tR);
    await pr.goto(`${BASE}/front-office/leads`); await pr.waitForTimeout(1_500);
    const n = await pr.getByRole("link", { name: /People to merge/ }).count(); await pr.close(); return n === 1;
  })(), { caseOfficerSees: menu });

  // ---------------------------------------------------------------------------- W3: merge keeps both histories
  const notesOf = (person: string) => sql(`select count(*) from fo_note n join fo_lead l on l.id = n.lead_id where l.person_id = '${person}'`);
  const leadsBefore = Number(sql(`select count(*) from fo_lead where person_id in ('${LENA}', '${LENA2}')`)), notesBefore = Number(notesOf(LENA)) + Number(notesOf(LENA2));
  const merged = pair ? await api(tR, "POST", `/front-office/duplicates/review/${pair.id}/merge`, { survivorId: LENA, choices: {} }) : { status: 0, body: null };
  ok("R1.29 W3 (part missing: FO-9b part 1, the merge; part 2, POST review/:id/merge): merging keeps Lena Park and moves Lena Parks' lead and notes to her (both histories on one person)",
    merged.status === 200 && Number(sql(`select count(*) from fo_lead where person_id = '${LENA}'`)) === leadsBefore && Number(notesOf(LENA)) === notesBefore, { status: merged.status, leadsBefore, notesBefore });
  const tomb = sql(`select count(*) from information_schema.columns where table_name = 'fo_person' and column_name = 'merged_into_id'`) === "1"
    ? sql(`select coalesce(merged_into_id::text, 'none') from fo_person where id = '${LENA2}'`) : "no merged_into_id column";
  const auditLine = sql(`select coalesce(string_agg(detail::text, ' '), '') from audit_event where firm_id = '${A}' and action in ('person.merged', 'fo.person.merged')`);
  ok("R1.29 W3 (part missing: FO-9b part 1): the second record is a tombstone pointing at the survivor, with one audit line that carries no email or phone",
    tomb === LENA && auditLine !== "" && !auditLine.includes(`lena.parks.${run}`) && !auditLine.includes("5550102"), { tomb, audit: auditLine.slice(0, 160) });

  // ---------------------------------------------------------------------- W4: never automatic with money
  // Omar has money: a draft invoice (FO-7b part 1a). A new lead with Omar's email is then added as new by the Owner.
  sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${A}', 'seed:J-29', now()) on conflict (firm_id) do nothing`);
  const inv = await api(tR, "POST", "/front-office/money/invoices", { personId: OMAR, currency: "CAD" });
  const omar2 = await addLead(tR, { givenNames: `Omar${run}`, familyName: "Haddad", email: `omar.haddad.${run}@example.org`, phone: "+1 416 555 0177", confirmedNew: true });
  const OMAR2 = personOf(`omar.haddad.${run}@example.org`);
  await new Promise((r) => setTimeout(r, 1500));   // any automatic merge runs after the add
  const hasTomb = sql(`select count(*) from information_schema.columns where table_name = 'fo_person' and column_name = 'merged_into_id'`) === "1";
  const bothStay = sql(`select count(*) from fo_person where id in ('${OMAR}', '${OMAR2 || OMAR}')`) === "2" && (!hasTomb || sql(`select count(*) from fo_person where id in ('${OMAR}', '${OMAR2}') and merged_into_id is null`) === "2");
  ok("R1.29 W4 fail: a person with money (a draft invoice) is never merged by itself: both Omar records stay, neither a tombstone (vacuous until FO-9b part 2 merges: no merge runs today)",
    inv.status === 201 && omar2.status === 201 && !!OMAR2 && bothStay, { invoice: inv.status, add: omar2.status, hasTomb });
  const list4 = await api(tR, "GET", "/front-office/duplicates/review");
  ok("R1.29 W4 (part missing: FO-9b part 2, the review list): the Omar pair waits on the review list for a person to decide",
    list4.status === 200 && JSON.stringify(list4.body).includes(OMAR) && JSON.stringify(list4.body).includes(OMAR2), { status: list4.status });

  // A person with a case (the case side's client row linked to the front-office person, CS-K1; seeded as its row, Sample)
  // and a new lead with the same phone: never merged by itself, and the pair waits on the review list.
  const kim = await addLead(tR, { givenNames: `Kim${run}`, familyName: "Sample", email: `kim.${run}@example.org`, phone: "+1 416 555 0188", confirmedNew: true });
  const KIM = personOf(`kim.${run}@example.org`);
  let caseSeeded = "";
  try {
    sql(`insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, created_by) values (gen_random_uuid(), (select id from workspace order by created_at limit 1), 'sample-firm', '${A}', (select coalesce(max(client_number), 9000) + 1 from case_client where firm_key = 'sample-firm'), 'Kim Sample', 'PERSON', '${KIM}', 'user-R')`);
    caseSeeded = "yes";
  } catch (e) { caseSeeded = String((e as { stderr?: string }).stderr ?? e).split("\n")[0]; }
  const kim2 = await addLead(tR, { givenNames: `Kim${run}`, familyName: "Sample", email: `kim.other.${run}@example.org`, phone: "416.555.0188", confirmedNew: true });
  const KIM2 = personOf(`kim.other.${run}@example.org`);
  await new Promise((r) => setTimeout(r, 1500));
  const kimStay = !!KIM && !!KIM2 && sql(`select count(*) from fo_person where id in ('${KIM}', '${KIM2}')`) === "2" && (!hasTomb || sql(`select count(*) from fo_person where id in ('${KIM}', '${KIM2}') and merged_into_id is null`) === "2");
  ok("R1.29 W4 fail: a person with a case (the case side's client row) is never merged by itself: both Kim records stay (vacuous until FO-9b part 2 merges: no merge runs today)",
    kim.status === 201 && kim2.status === 201 && caseSeeded === "yes" && kimStay, { caseSeeded, add: [kim.status, kim2.status] });
  const list4c = await api(tR, "GET", "/front-office/duplicates/review");
  const kimPair = (list4c.body?.items ?? list4c.body?.pairs ?? []).find((x: unknown) => JSON.stringify(x).includes(KIM) && JSON.stringify(x).includes(KIM2));
  ok("R1.29 W4 (part missing: FO-9b part 2, the review list with needsCaseSide): the Kim pair waits on the review list, marked as needing the case side",
    list4c.status === 200 && !!kimPair && kimPair.needsCaseSide === true, { status: list4c.status });

  // --------------------------------------------------------------------------- W5: undo from the review list
  const mergesList = await api(tR, "GET", "/front-office/duplicates/merges");
  const m = (mergesList.body?.items ?? []).find((x: unknown) => JSON.stringify(x).includes(LENA2));
  const undo = m ? await api(tR, "POST", `/front-office/duplicates/merges/${m.id}/undo`, {}) : { status: 0, body: null };
  ok("R1.29 W5 (parts missing: FO-9b part 1 Undo, part 2 GET duplicates/merges): Undo merge from the Merged tab's list restores both people and their own leads",
    undo.status === 200 && sql(`select count(*) from fo_lead where person_id = '${LENA2}'`) === "1" && sql(`select count(*) from fo_person where id in ('${LENA}', '${LENA2}')`) === "2", { list: mergesList.status, undo: undo.status });
  const undo2 = m ? await api(tR, "POST", `/front-office/duplicates/merges/${m.id}/undo`, {}) : { status: 0, body: null };
  ok("R1.29 W5 fail (part missing: FO-9b part 1): a second Undo is refused (409) in words, nothing changed", undo2.status === 409 && typeof undo2.body?.detail === "string", undo2.status);
  const pm = await ctx.newPage(); await pm.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tR);
  await pm.goto(`${BASE}/front-office/duplicates`); await pm.waitForTimeout(1_500);
  const tabs = await pm.getByRole("tab", { name: /To review|Merged|Kept separate/ }).count();
  await pm.screenshot({ path: join(SHOTS, "w5-people-to-merge-1440.png"), fullPage: true });
  ok("R1.29 W5 (parts missing: FO-9s parts 2-3, People to merge and the merge dialog): the review list page has To review, Merged and Kept separate, and Undo merge on a merged pair",
    tabs === 3 && (await pm.getByRole("button", { name: /Undo merge/ }).count()) >= 1, { tabs });
  await pm.close();

  // ------------------------------------------------------------------------------------------- W6: roles
  const offList = await api(tO, "POST", `/front-office/duplicates/review/${pair?.id ?? randomUUID()}/merge`, { survivorId: LENA, choices: {} });
  const anon = await api(null, "GET", "/front-office/duplicates/review"), anonCheck = await api(null, "POST", "/front-office/duplicates/check", { givenNames: "Lena" });
  ok("R1.29 W6 fail: no session gets 401 on the check (FO-9a)", anonCheck.status === 401, anonCheck.status);
  ok("R1.29 W6 fail (part missing: FO-9b part 2): no session gets 401 on the review list; a Case Officer without agent/prospect:merge gets 403 on a merge",
    anon.status === 401 && offList.status === 403, [anon.status, offList.status]);

  // --------------------------------------------------------------------------- W7: R1.30's first step
  await p.goto(`${BASE}/front-office/leads?view=all`); await p.getByRole("heading", { level: 1, name: "Leads" }).waitFor({ timeout: 30_000 });
  await p.waitForTimeout(800);
  const listWords = (await p.locator("main").innerText()).replace(/\s+/g, " ");
  const filters = await p.locator("main select, main [role='combobox'], main input[type='search']").count();
  ok("R1.29 W7: the walk ends at R1.30's first step: the Leads list (all open) shows Lena Park's lead and offers its filters", listWords.includes(`Lena${run} Park`) && filters >= 1, { filters, words: listWords.slice(0, 160) });
  ok("R1.29: no page error in the browser", errors.length === 0, errors);
  await ctx.close();
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
