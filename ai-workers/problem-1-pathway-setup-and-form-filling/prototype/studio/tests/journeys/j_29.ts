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
// Aligned by qa 9 (24 Nov) to the ruling qa 8 traced (`product/qa/reports/2026-11-24-capability-R1.29-trace.md`): "Add
// as new" writes its pair Kept separate, decided by the adder (`duplicates/merge/review.ts` notePairs, FO-9b concept §8
// B1, AG-2-68 rule 16), and a manual add matching someone on file is stopped (409 KNOWN_PERSON), so an OPEN pair comes
// at arrival only through a web form or a booking. W1's "Add as new" record now proves the ruling (the Kept separate
// tab), and each second record of W2-W5 (Lena, Omar, Kim) arrives through the firm's published web form
// (POST /api/public/forms/:token/submissions, door WEB_FORM), so its pair is OPEN with its score and reasons. W4's two
// "never by itself" lines are vacuous until FO-9b part 2b (#3527) wires the automatic merge (`mergeIfSafe`, `review.ts:190`)
// into the doors; W4's control (a safe exact duplicate merges by itself) proves the merge runs, so the two lines bite once
// it passes. Lena's web-form record is a name-only match (another email and phone): never merged by itself (NOT_EXACT,
// `whyNotSafe`), so it stays on To review for a person, with or without part 2b.
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
const { sql: rawSql, until } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
// Letters only: FO-9a matches a name with a digit only exactly, so a digit in the tag would hide the similar-name match.
const run = Date.now().toString(36).replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]);
// Each run's own phone exchange (Sample, 200-899): a later run on the same copy must not match an earlier run's people by an
// exact phone, which (FO-9b part 2b) merges a safe pair by itself and would take the run's people away from its steps.
const NXX = String(200 + Math.floor(Math.random() * 700));
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
  // The firm's web form, published (FO-4a; on as j_27 turns it on, embedded on the firm's own site), and an enquiry sent
  // through it as a visitor on that site would: read the form (its submission id and load stamp), wait past its minimum
  // fill time (2 s, sales/public.ts LIMITS), send from the site's origin (an allowed site, or 403 SITE_NOT_ALLOWED).
  // A form that is on names its consent wording (fo_web_form_consent_check): the wording the firm's set-up gave it (as j_26).
  const wording = sql(`select coalesce((select id::text from msg_consent_wording where firm_id = '${A}' and channel = 'EMAIL' and purpose = 'MARKETING' order by published_at desc, version desc limit 1), '')`);
  const FORM = wording ? sql(`update fo_web_form set enabled = true, consent_wording_version_id = coalesce(consent_wording_version_id, '${wording}'), allowed_sites = array['https://firm.example'] where id = (select id from fo_web_form where firm_id = '${A}' order by created_at limit 1) returning public_token`) : "";
  const enquire = async (person: { givenNames: string; familyName?: string; email?: string; phone?: string; message?: string }) => {
    const f = await fetch(`${BASE}/api/public/forms/${FORM}`).then((r) => r.json()).catch(() => null) as { submissionId?: string; loadStamp?: string } | null;
    await new Promise((r) => setTimeout(r, 2_300));
    const r = await fetch(`${BASE}/api/public/forms/${FORM}/submissions`, { method: "POST", headers: { "content-type": "application/json", origin: "https://firm.example" }, body: JSON.stringify({ submissionId: f?.submissionId, loadStamp: f?.loadStamp, ...person }) });
    return r.status;
  };
  const newPersonBy = (email: string, not: string[]) => sql(`select coalesce((select id::text from fo_person where firm_id = '${A}' and lower(email) = lower('${email}') and id not in (${not.filter(Boolean).map((x) => `'${x}'`).join(", ") || "null"}) order by created_at desc limit 1), '')`);
  const listOf = async (status?: string) => { const l = await api(tR, "GET", `/front-office/duplicates/review${status ? `?status=${status}` : ""}`); return { status: l.status, items: (l.body?.items ?? []) as { id: string; score?: number; reasons?: unknown[]; status?: string; automatic?: boolean; decidedAt?: string | null; needsCaseSide?: boolean }[] }; };
  const pairOf = (items: { id: string }[], x: string, y: string) => items.find((i) => JSON.stringify(i).includes(x) && JSON.stringify(i).includes(y));
  // Two people on file, each with a lead and a note of its own (the "histories"), added by the Owner through FO-2's route.
  const lena = await addLead(tR, { givenNames: `Lena${run}`, familyName: "Park", email: `lena.${run}@example.org`, phone: `+1 (416) ${NXX}-0101`, note: `Lena's first call ${run}`, confirmedNew: true });
  const omar = await addLead(tR, { givenNames: `Omar${run}`, familyName: "Haddad", email: `omar.${run}@example.org`, confirmedNew: true });
  const personOf = (email: string) => sql(`select coalesce(string_agg(id::text, ','), '') from fo_person where firm_id = '${A}' and lower(email) = lower('${email}')`);
  const people = () => sql(`select count(*) from fo_person where firm_id = '${A}'`);
  const LENA = personOf(`lena.${run}@example.org`), OMAR = personOf(`omar.${run}@example.org`);
  ok("J-29 setup: the Sample firm's front office, its web form published, and two people on file, each with a lead", fo.failed.length === 0 && /^[A-Za-z0-9_-]{22,100}$/.test(FORM) && lena.status === 201 && omar.status === 201 && !!LENA && !!OMAR, [lena.status, omar.status, lena.body?.detail]);

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
  await typeIn(p, "First name", `Lena${run}`); await typeIn(p, "Last name (optional)", "Parks"); await typeIn(p, "Phone", `416.${NXX}.0101`);
  await p.locator("[data-dup-hint]").waitFor({ timeout: 10_000 }).catch(() => undefined);
  const hint1 = (await p.locator("[data-dup-hint]").innerText().catch(() => "")).replace(/\s+/g, " ");
  await p.screenshot({ path: join(SHOTS, "w1-warning-name-phone-1440.png"), fullPage: true });
  ok("R1.29 W1: Add a lead with a similar name (Parks) and the same phone in another spelling (416.NXX.0101) names Lena Park on file with the reason, before Save",
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
  const lena2 = await addLead(tO, { givenNames: `Lena${run}`, familyName: "Parks", email: `lena.parks.${run}@example.org`, phone: `416 ${NXX} 0102`, note: `Second record's call ${run}`, confirmedNew: true });
  const LENA2 = personOf(`lena.parks.${run}@example.org`);
  ok("J-29 W1: 'Add as new' keeps a second record (Lena Parks) as the adder chose", lena2.status === 201 && !!LENA2 && LENA2 !== LENA, lena2.body?.detail ?? lena2.status);
  const kept = await listOf("KEPT_SEPARATE"), keptPair = pairOf(kept.items, LENA, LENA2);
  ok("R1.29 W1 (the ruling: FO-9b part 2, #3174, on main; concept §8 B1, AG-2-68 rule 16): the 'Add as new' pair Lena Park / Lena Parks is on the Kept separate tab, decided by the adder (not automatic), never on To review",
    kept.status === 200 && !!keptPair && keptPair.automatic === false && !!keptPair.decidedAt && !pairOf((await listOf()).items, LENA, LENA2), { status: kept.status, pair: keptPair ?? null });
  // W2-W5's second record of Lena: an enquiry through the firm's web form with Lena's name, from another email and phone
  // (a name-only match: a person decides it). A web-form arrival always makes a new person and writes its pairs OPEN
  // (sales/arrival.ts, notePairs).
  const sentL = await enquire({ givenNames: `Lena${run}`, familyName: "Park", email: `lena.web.${run}@example.org`, phone: `+1 416 ${NXX} 0144`, message: `A web enquiry ${run} (Sample)` });
  const LENA3 = newPersonBy(`lena.web.${run}@example.org`, [LENA, LENA2]);
  ok("J-29 W2: a web-form enquiry from Lena Park (another email and phone) arrives as a new record with its own lead", sentL === 201 && !!LENA3 && sql(`select count(*) from fo_lead where person_id = '${LENA3}' and door = 'WEB_FORM'`) === "1", { sent: sentL, person: LENA3 || null });

  // ------------------------------------------------------------------------------------ W2: the review list
  const list = await listOf();
  const pair = LENA3 ? pairOf(list.items, LENA, LENA3) : undefined;
  ok("R1.29 W2 (FO-9b part 2, #3174, on main: GET duplicates/review): the pair Lena Park / her web-form record is on To review with a score and its reasons",
    list.status === 200 && !!pair && pair.status === "OPEN" && typeof pair.score === "number" && (pair.reasons ?? []).length > 0, { status: list.status, pair: pair ?? null });
  await p.goto(`${BASE}/front-office/leads`); await p.waitForTimeout(800);
  const menu = await p.getByRole("link", { name: /People to merge/ }).count();
  await p.screenshot({ path: join(SHOTS, "w2-sales-menu-1440.png"), fullPage: true });
  const w2 = await (async () => {
    const pr = await ctx.newPage(); await pr.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tR);
    await pr.goto(`${BASE}/front-office/leads`); await pr.waitForTimeout(1_500);
    const link = pr.getByRole("navigation", { name: "Sales" }).getByRole("link", { name: /People to merge/ });
    const n = await link.count(), count = (await link.locator("[data-dup-count]").innerText().catch(() => "")).trim();
    if (n === 1) await link.click();
    await pr.getByRole("heading", { level: 1, name: "People to merge" }).waitFor({ timeout: 15_000 }).catch(() => undefined);
    await pr.locator(`[data-dup-pair="${pair?.id ?? "none"}"]`).waitFor({ timeout: 15_000 }).catch(() => undefined);
    const row = (await pr.locator(`[data-dup-pair="${pair?.id ?? "none"}"]`).innerText().catch(() => "")).replace(/\s+/g, " ");
    const tab = (await pr.getByRole("tab", { name: /To review/ }).innerText().catch(() => "")).trim();
    await pr.screenshot({ path: join(SHOTS, "w2-people-to-merge-1440.png"), fullPage: true });
    await pr.close(); return { n, count, tab, row: row.slice(0, 200) };
  })();
  ok("R1.29 W2 (FO-9s part 2: Sales › People to merge): the Owner's Sales menu offers People to merge with the open count, and its To review tab shows the Lena pair with what matched and the score, by screens",
    w2.n === 1 && !!w2.count && w2.tab === `To review (${w2.count})` && w2.row.includes(`Lena${run} Park`) && /Similar name|Same/.test(w2.row) && /\d/.test(w2.row), { ...w2, caseOfficerSees: menu });

  // ---------------------------------------------------------------------------- W3: merge keeps both histories
  const notesOf = (person: string) => sql(`select count(*) from fo_note n join fo_lead l on l.id = n.lead_id where l.person_id = '${person}'`);
  const L3 = LENA3 || LENA;   // no web-form record: the merge steps below fail on their own, never on a query
  const leadsBefore = Number(sql(`select count(*) from fo_lead where person_id in ('${LENA}', '${L3}')`)), notesBefore = Number(notesOf(LENA)) + (LENA3 ? Number(notesOf(LENA3)) : 0);
  // The guided merge by screens (FO-9s part 3): People to merge › Merge… on the Lena pair › Lena Park stays › Next ›
  // Next › Merge 2 people (concept §4 S3; FO-9b's preview and merge routes underneath).
  const pg = await ctx.newPage(); await pg.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tR);
  const mergeAnswers: number[] = []; pg.on("response", (r) => { if (/\/duplicates\/review\/[^/]+\/merge$/.test(r.url())) mergeAnswers.push(r.status()); });
  const w3 = await (async () => {
    await pg.goto(`${BASE}/front-office/duplicates`);
    await pg.locator(`[data-dup-pair="${pair?.id ?? "none"}"]`).getByRole("button", { name: "Merge…" }).click({ timeout: 20_000 });
    const d = pg.getByRole("dialog");
    await d.locator("[data-merge-field='email']").waitFor({ timeout: 15_000 });
    await d.locator(`input[name='survivor'][value='${LENA}']`).check();   // both records are named Lena Park: by record
    await d.locator("[data-merge-field='email']").waitFor({ timeout: 15_000 });
    await pg.waitForTimeout(500);
    await d.getByRole("button", { name: "Next" }).click(); const moves = await d.locator("[data-merge-moves]").innerText().catch(() => "");
    await d.getByRole("button", { name: "Next" }).click(); const confirm = await d.locator("[data-merge-confirm]").innerText().catch(() => "");
    await pg.screenshot({ path: join(SHOTS, "w3-merge-dialog-confirm-1440.png"), fullPage: true });
    await d.getByRole("button", { name: "Merge 2 people" }).click();
    await pg.locator("[data-merged-notice]").waitFor({ timeout: 15_000 }).catch(() => undefined);
    await pg.screenshot({ path: join(SHOTS, "w3-merged-1440.png"), fullPage: true });
    return { moves: moves.replace(/\s+/g, " ").slice(0, 120), confirm, notice: await pg.locator("[data-merged-notice]").count() };
  })().catch((e) => ({ moves: "", confirm: "", notice: 0, error: String(e).split("\n")[0] }));
  await pg.close();
  const merged = { status: mergeAnswers[0] ?? 0 };
  ok("R1.29 W3 (FO-9s part 3, the guided merge dialog): People to merge › Merge… › Lena Park stays › what moves › Merge 2 people, by screens; the notice names the survivor",
    merged.status === 200 && w3.notice === 1 && w3.confirm.includes(`into Lena${run} Park`) && /1 lead/.test(w3.moves), { ...w3, status: merged.status });
  ok("R1.29 W3 (FO-9b parts 1-2, on main: POST review/:id/merge): merging keeps Lena Park and moves her web-form record's lead and notes to her (both histories on one person)",
    merged.status === 200 && Number(sql(`select count(*) from fo_lead where person_id = '${LENA}'`)) === leadsBefore && Number(notesOf(LENA)) === notesBefore, { status: merged.status, leadsBefore, notesBefore });
  const tomb = sql(`select count(*) from information_schema.columns where table_name = 'fo_person' and column_name = 'merged_into_id'`) === "1"
    ? sql(`select coalesce(merged_into_id::text, 'none') from fo_person where id = '${L3}'`) : "no merged_into_id column";
  const auditLine = sql(`select coalesce(string_agg(detail::text, ' '), '') from audit_event where firm_id = '${A}' and action in ('person.merged', 'fo.person.merged')`);
  ok("R1.29 W3 (FO-9b part 1, on main): the web-form record is a tombstone pointing at the survivor, with one audit line that carries no email or phone",
    tomb === LENA && auditLine !== "" && !auditLine.includes(`lena.web.${run}`) && !auditLine.includes(`${NXX}0144`), { tomb, audit: auditLine.slice(0, 160) });

  // ---------------------------------------------------------------------- W4: never automatic with money
  // The control (P-574 (2)): a safe exact duplicate, a web-form enquiry with the email of a person on file who has no case,
  // document or money, is merged by itself into the older record, decided by the system (FO-9b part 2b: a job after the
  // arrival commits). It runs before and after the Omar and Kim arrivals, so their jobs have run when those lines are read.
  const control = async (tag: string) => {
    const first = await addLead(tR, { givenNames: `Noor${tag}${run}`, familyName: "Sample", email: `noor.${tag}.${run}@example.org`, confirmedNew: true });
    const N1 = personOf(`noor.${tag}.${run}@example.org`);
    const sent = await enquire({ givenNames: `Noor${tag}${run}`, familyName: "Sample", email: `NOOR.${tag}.${run}@example.org` });
    const N2 = newPersonBy(`noor.${tag}.${run}@example.org`, [N1]);
    const merged = !!N1 && !!N2 && await until(async () => sql(`select coalesce(merged_into_id::text, '') from fo_person where id = '${N2}'`) === N1, 20_000);
    const auto = merged && (await listOf("MERGED")).items.some((i) => JSON.stringify(i).includes(N2) && i.automatic === true);
    return { ok: first.status === 201 && sent === 201 && merged && auto, detail: { add: first.status, sent, merged, auto } };
  };
  const c1 = await control("a");
  ok("R1.29 W4 control (part missing: FO-9b part 2b, #3527, the automatic merge at arrival): a safe exact duplicate (the same email by web form; no case, document or money) is merged by itself into the older record, automatic on the Merged tab", c1.ok, c1.detail);
  // Omar has money: a draft invoice (FO-7b part 1a). A new lead with Omar's own email then arrives by the web form.
  sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${A}', 'seed:J-29', now()) on conflict (firm_id) do nothing`);
  // Omar is a lead, not a client the Owner may invoice: FO-7b's draft route is C5-scoped (Lead 14 on #3321: a party outside
  // the caller's scope is 404), so his money is a fixture row, as the step needs only "a person with money"
  const invId = sql(`insert into money_invoice (firm_id, person_id, currency, created_by, updated_at) values ('${A}', '${OMAR}', 'CAD', 'seed:J-29', now()) returning id`);
  const invStored = !!invId;   // a fixture row, not an API answer
  const omar2 = { status: await enquire({ givenNames: `Omar${run}`, familyName: "Haddad", email: `OMAR.${run}@Example.org`, phone: `+1 416 ${NXX} 0177` }) };
  const OMAR2 = newPersonBy(`omar.${run}@example.org`, [OMAR]);
  // A person with a case (the case side's client row linked to the front-office person, CS-K1; seeded as its row, Sample)
  // and a new lead with the same phone in another spelling, by the web form.
  const kim = await addLead(tR, { givenNames: `Kim${run}`, familyName: "Sample", email: `kim.${run}@example.org`, phone: `+1 416 ${NXX} 0188`, confirmedNew: true });
  const KIM = personOf(`kim.${run}@example.org`);
  let caseSeeded = "";
  try {
    sql(`insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, created_by) values (gen_random_uuid(), (select id from workspace order by created_at limit 1), 'sample-firm', '${A}', (select coalesce(max(client_number), 9000) + 1 from case_client where firm_key = 'sample-firm'), 'Kim Sample', 'PERSON', '${KIM}', 'user-R')`);
    caseSeeded = "yes";
  } catch (e) { caseSeeded = String((e as { stderr?: string }).stderr ?? e).split("\n")[0]; }
  const kim2 = { status: await enquire({ givenNames: `Kim${run}`, familyName: "Sample", email: `kim.other.${run}@example.org`, phone: `416.${NXX}.0188` }) };
  const KIM2 = newPersonBy(`kim.other.${run}@example.org`, [KIM]);
  const c2 = await control("b");   // the Omar and Kim jobs were queued before this one
  ok("R1.29 W4 control again, after the Omar and Kim arrivals (part missing: FO-9b part 2b, #3527): a second safe exact duplicate is merged by itself", c2.ok, c2.detail);
  const live = (x: string, y: string) => !!x && !!y && sql(`select count(*) from fo_person where id in ('${x}', '${y}') and merged_into_id is null`) === "2";
  ok("R1.29 W4 fail: a person with money (a draft invoice) is never merged by itself: both Omar records stay, neither a tombstone (bites once W4's control passes: FO-9b part 2b, #3527)",
    invStored && omar2.status === 201 && live(OMAR, OMAR2), { invoiceFixture: invStored, add: omar2.status });
  const list4 = await listOf(), omarPair = OMAR2 ? pairOf(list4.items, OMAR, OMAR2) : undefined;
  ok("R1.29 W4 (FO-9b part 2, #3174, on main: the review list): the Omar pair (the same email) waits on To review for a person to decide",
    list4.status === 200 && !!omarPair && omarPair.status === "OPEN", { status: list4.status, pair: omarPair ?? null });
  ok("R1.29 W4 fail: a person with a case (the case side's client row) is never merged by itself: both Kim records stay (bites once W4's control passes: FO-9b part 2b, #3527)",
    kim.status === 201 && kim2.status === 201 && caseSeeded === "yes" && live(KIM, KIM2), { caseSeeded, add: [kim.status, kim2.status] });
  const kimPair = KIM2 ? pairOf(list4.items, KIM, KIM2) : undefined;
  ok("R1.29 W4 (FO-9b part 2, #3174, on main: the review list with needsCaseSide): the Kim pair waits on To review, marked as needing the case side",
    list4.status === 200 && !!kimPair && kimPair.needsCaseSide === true, { status: list4.status, pair: kimPair ?? null });

  // --------------------------------------------------------------------------- W5: undo from the review list
  const mergesList = await api(tR, "GET", "/front-office/duplicates/merges");
  const m = LENA3 ? (mergesList.body?.items ?? []).find((x: unknown) => JSON.stringify(x).includes(LENA3)) : undefined;
  // Undo by screens (FO-9s part 2): People to merge › Merged › Undo merge on the Lena merge's row.
  const pu = await ctx.newPage(); await pu.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tR);
  const undoAnswers: number[] = []; pu.on("response", (r) => { if (r.url().includes("/undo") && r.request().method() === "POST") undoAnswers.push(r.status()); });
  await pu.goto(`${BASE}/front-office/duplicates?tab=merged`);
  const mRow = pu.locator(`[data-dup-merge="${m?.id ?? "none"}"]`);
  await mRow.getByRole("button", { name: "Undo merge" }).click({ timeout: 15_000 }).catch(() => undefined);
  await mRow.getByText(/^Undone/).waitFor({ timeout: 15_000 }).catch(() => undefined);
  await pu.screenshot({ path: join(SHOTS, "w5-undo-merge-1440.png"), fullPage: true });
  const undone = (await mRow.getByText(/^Undone/).count()) === 1; await pu.close();
  ok("R1.29 W5 (FO-9s part 2 over FO-9b's POST merges/:id/undo): Undo merge on People to merge's Merged tab restores both people and their own leads, by screens",
    undone && undoAnswers[0] === 200 && !!LENA3 && sql(`select count(*) from fo_lead where person_id = '${L3}'`) === "1" && sql(`select count(*) from fo_person where id in ('${LENA}', '${L3}') and merged_into_id is null`) === "2", { list: mergesList.status, undo: undoAnswers, undone });
  const undo2 = m ? await api(tR, "POST", `/front-office/duplicates/merges/${m.id}/undo`, {}) : { status: 0, body: null };
  ok("R1.29 W5 fail (FO-9b part 1, on main): a second Undo is refused (409) in words, nothing changed", undo2.status === 409 && typeof undo2.body?.detail === "string", undo2.status);
  const pm = await ctx.newPage(); await pm.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tR);
  await pm.goto(`${BASE}/front-office/duplicates?tab=merged`); await pm.waitForTimeout(1_500);
  const tabs = await pm.getByRole("tab", { name: /To review|Merged|Kept separate/ }).count();
  await pm.screenshot({ path: join(SHOTS, "w5-people-to-merge-1440.png"), fullPage: true });
  ok("R1.29 W5 (FO-9s part 2): the review list page has To review, Merged and Kept separate, and Undo merge on a merged pair",
    tabs === 3 && (await pm.getByRole("button", { name: /Undo merge/ }).count()) >= 1, { tabs });
  await pm.close();

  // ------------------------------------------------------------------------------------------- W6: roles
  const offList = await api(tO, "POST", `/front-office/duplicates/review/${pair?.id ?? randomUUID()}/merge`, { survivorId: LENA, choices: {} });
  const anon = await api(null, "GET", "/front-office/duplicates/review"), anonCheck = await api(null, "POST", "/front-office/duplicates/check", { givenNames: "Lena" });
  ok("R1.29 W6 fail: no session gets 401 on the check (FO-9a)", anonCheck.status === 401, anonCheck.status);
  ok("R1.29 W6 fail (FO-9b part 2, on main): no session gets 401 on the review list; a Case Officer without agent/prospect:merge gets 403 on a merge",
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
