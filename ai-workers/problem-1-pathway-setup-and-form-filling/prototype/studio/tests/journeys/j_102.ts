// J-102 (map row 102, R1.102: find a person or case by name, email or file number), written by the qa lane (22 Nov) ahead
// of the build, from the row's done-when on the qa board: "A search by name, email or file number finds the firm's people
// and cases only, within the person's rights". It walks the parts as their PRs draw them: PF-30a's one find door
// (`GET /api/platform/find`, #2884), CS-S1 part 2's case finder on it (#2913, over CS-S1 part 1's case party index, #2035)
// and PF-30s's find box in the staff top bar ("/" opens it, #2921), on an isolated copy of the running app (its own
// database and port, never :4400), as the firm's case officer (user-O) signed in on the sign-in card.
//   Setup (Sample, through the app's own doors where one exists): the two Sample firms with their staff and front-office
//   setup; firm A's "Everyone sees all" off (each person sees their own leads and prospects); the configured checkpoint
//   (Demo › Load's test fixture, no AI step) for a released combination. Records, each named after this run's tag (letters only):
//     firm A: a lead "Nadia<tag> Sample" with an email (POST leads, by user-O), a case opened on a released combination
//     whose principal is "Nadia<tag> Sample" (POST /runtime/cases as user-O; the principal's email written as the
//     client's answer, a stand-in for the questionnaire), and a lead "Hidden<tag> Sample" owned by user-T (Case Manager);
//     firm B (sample-solo): a lead with the same name and email and a case with the same name (by user-S).
//   W0 fails on the fake (P-606): before the records exist the box answers "No matches" for Nadia<tag>.
//   W1 by name: "/" opens the box; Nadia<tag> lists firm A's lead (Leads and prospects) and firm A's case principal
//      (People on cases); none of firm B's.
//   W2 by email: the lead's email lists the lead, "Matched: Email", and the case principal by the same email; firm B's
//      lead with the same email is never listed to firm A, and firm B's own search finds it.
//   W3 by file number: firm A's case number (typed in lower case) lists the case, "Matched: File number"; Enter opens the
//      case page (/cases/<id>), which shows that number: the next capability's first step. Firm B's first case has the same number
//      (numbers are per firm): firm A's search names only firm A's case, firm B's only firm B's.
//   W4 within the person's rights: user-O never finds Hidden<tag> (user-T's lead; each person sees their own), and the
//      door answers the same through the API; user-T finds it; firm B's user-S finds only firm B's Nadia<tag>; the
//      records stay closed by their own routes (user-O on Hidden's lead, user-S on firm A's case).
//   W5 keyboard only: "/" from Home, type, ArrowDown marks the second row (aria-activedescendant), Enter opens that row's
//      own address.
//   W6 400, 1024 and 1440 px with the list open: no sideways scroll, no serious axe violation (WCAG 2.2 A/AA); no page
//      error during the walk.
// What stays a stand-in (said, not hidden): the case principal's email is written as a client answer in SQL (no screen
// writes it here); the case rule's "own cases only" (agent/case:view.own without view.all) cannot be walked by screens
// on main's seed, where every role holds view.all: that rule rests on CS-S1 part 2's own check,
// tests/check_css1_search.ts (#2913), not on this walk. Sample data only; US$0, no
// model call, live AI off. Screenshots: product/screens/J-102/screenshots/.
// Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j102 4473 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j102 4473 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_102.ts j102 4473
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const NAME = process.argv[2] ?? "j102", PORT = Number(process.argv[3] ?? 4473), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`;
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "screens", "J-102", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => { try { return rawSql(q).split("\n")[0].trim(); } catch { return ""; } };
const qt = (s: string) => `'${s.replace(/'/g, "''")}'`;
process.env.DATABASE_URL = URL_;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
const { seedSampleFirms } = await import("../../api/src/platform/seed-sample-firms.ts");
const { seedSampleFirmsFrontOffice } = await import("../../api/src/front-office/firm-seed.ts");
const { EVERYONE_SEES_ALL, writeSetting } = await import("../../api/src/platform/settings.ts");
const { platformAuditWorkspaceId } = await import("../../api/src/platform/audit/audit-event.ts");
// Letters only, so a name search reads the tag as part of the name (as PF-30s's own check does).
const tag = Date.now().toString(36).replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]);
const NADIA = `Nadia${tag}`, HIDDEN = `Hidden${tag}`, MAIL = `nadia.${tag}@example.org`;
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys
const api = async (method: string, path: string, o: { token?: string; actor?: string; body?: unknown } = {}): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...(o.actor ? { "x-actor": o.actor } : {}) }, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
/** What the find door answers as this person: the hits' addresses, or null when there is no door (404). */
type Row = { kind: string; title: string; url: string };
const doorRows = async (token: string, q: string): Promise<Row[] | null> => { const r = await api("GET", `/platform/find?q=${encodeURIComponent(q)}`, { token }); return r.status === 200 ? (r.body?.groups ?? []).flatMap((g: { hits: Row[] }) => g.hits.map((h) => ({ kind: h.kind, title: h.title, url: h.url }))) : null; };
const door = async (token: string, q: string) => (await doorRows(token, q))?.map((h) => h.url) ?? null;
/** The box shows exactly the door's rows: the same kinds and titles, one for one (the box draws no addresses). */
const sameRows = (box: { kind: string; text: string }[], rows: Row[] | null) => !!rows && box.length === rows.length && rows.every((r) => box.some((b) => b.kind === r.kind && b.text.startsWith(r.title)));

const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 150 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true }).catch(() => undefined);
const settle = async (p: Page) => { await p.locator("main").first().waitFor({ timeout: 30_000 }).catch(() => undefined); await p.locator("[data-loading]").first().waitFor({ state: "detached", timeout: 30_000 }).catch(() => undefined); await p.waitForTimeout(250); };
/** A person signs in on the sign-in card (PF-4's local stand-in: firm key and work email). */
async function signIn(firmKey: string, email: string, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${BASE}/account`);
  await p.getByLabel("Firm key").fill(firmKey); await p.getByLabel("Work email").fill(email); await p.getByRole("button", { name: "Sign in" }).click();
  await p.getByLabel("Firm key").waitFor({ state: "detached", timeout: 20_000 });
  await settle(p);
  return p;
}
type Hit = { kind: string; text: string; id: string };
/** Like a person: open the box ("/" or, below 640 px, the Find button), type key by key, wait for the drawn answer.
 *  Null when there is no box on the page (the judge then fails; nothing throws). */
async function find(p: Page, text: string, how: "slash" | "button" = "slash"): Promise<{ hits: Hit[]; line: string } | null> {
  if (!(await p.locator("[data-find]").count())) return null;
  if (how === "button" && await p.locator("[data-find-open]").isVisible()) await p.locator("[data-find-open]").click();
  else { await p.locator("body").click({ position: { x: 5, y: 300 } }).catch(() => undefined); await p.keyboard.press("/"); }
  const box = p.locator("[data-find-input]");
  if (!(await box.evaluate((e) => e === document.activeElement).catch(() => false))) return null;
  await box.fill(""); await box.pressSequentially(text, { delay: 20 });
  const drawn = await p.waitForFunction(() => { const l = document.querySelector("[data-find-live]")?.textContent ?? ""; return l !== "" && l !== "Searching…"; }, undefined, { timeout: 15_000 }).then(() => true, () => false);
  if (!drawn) return null;
  await p.waitForTimeout(150);
  const hits = await p.locator("[data-find-hit]").evaluateAll((els) => els.map((e) => ({ kind: e.getAttribute("data-find-hit") ?? "", text: (e as HTMLElement).innerText.replace(/\s+/g, " "), id: e.id })));
  return { hits, line: (await p.locator("[data-find-live]").innerText()).trim() };
}
/** The address a hit opens, read from the API's answer for the same text (the box draws rows, not links). */
const has = (urls: string[] | null, path: string) => !!urls?.some((u) => u === path);
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

let firmAId = "";
try {
  // ------------------------------------------------------------------------------------------------ setup
  await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
  firmAId = sql(`select id from platform_firm where key = 'sample-firm'`);
  await writeSetting(db, { firmId: firmAId, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:j102", workspaceId: await platformAuditWorkspaceId(db as never), reason: "J-102: each person sees their own" });
  const staff = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
  const O = staff("user-O"), T = staff("user-T"), S = staff("user-S");
  const tokenOf = async (firmKey: string, email: string) => (await api("POST", "/platform/session/local", { body: { firmKey, email, secondStep: true } })).body?.token as string;
  // user-O signs in on the sign-in card; the API steps use that same session (a second sign-in would end it).
  const o = await signIn("sample-firm", O.email);
  const tok = { O: await o.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}").token as string), T: await tokenOf("sample-firm", T.email), S: await tokenOf("sample-solo", S.email) };
  ok("J-102 setup: the two Sample firms are seeded, firm A's \"Everyone sees all\" is off; user-O signs in on the sign-in card, user-T (firm A) and user-S (firm B) by the local stand-in", !!firmAId && !!tok.O && !!tok.T && !!tok.S);

  // W0 (fails on the fake): before the records exist, the box finds nothing for the name.
  await o.getByRole("link", { name: "Home", exact: true }).first().click().catch(() => undefined); await settle(o);
  const before = await find(o, NADIA);
  ok(`J-102 W0 fail (before the records exist, P-606): "/" opens the top bar's find box and ${NADIA} answers "No matches"`, !!before && before.hits.length === 0 && /^No matches/.test(before.line), before ?? "no find box on the page");
  await shot(o, "w0-before-1440");

  // Records (Sample).
  const lead = async (token: string, given: string, email: string) => (await api("POST", "/front-office/leads", { token, body: { requestId: randomUUID(), givenNames: given, familyName: "Sample", email, source: "Phone call", confirmedNew: true } }));
  const la = await lead(tok.O, NADIA, MAIL), lh = await lead(tok.T, HIDDEN, `hidden.${tag}@example.org`), lb = await lead(tok.S, NADIA, MAIL);   // firm B's lead has the same email (W2)
  const LA = String(la.body?.id ?? ""), LH = String(lh.body?.id ?? ""), LB = String(lb.body?.id ?? "");
  // A released combination to open the cases on: Demo › Load's test fixture (no AI step, US$0), on a fresh copy only.
  type Openable = { combination_id: string; startable: boolean; stage?: unknown }[] | null;
  let openable = (await api("GET", "/runtime/openable", { actor: "user-O" })).body as Openable;
  if (!(openable ?? []).some((r) => r.startable && !r.stage)) { await api("POST", "/demo/load", { actor: "user-A" }); openable = (await api("GET", "/runtime/openable", { actor: "user-O" })).body as Openable; }
  const combo = (openable ?? []).find((r) => r.startable && !r.stage)?.combination_id ?? "";
  const open = async (actor: string) => (await api("POST", "/runtime/cases", { actor, body: { combinationId: combo, clientActor: "user-P", principal: { displayName: `${NADIA} Sample` } } }));
  const ca = await open("user-O"), cb = await open("user-S");
  const CA = String(ca.body?.id ?? ""), CB = String(cb.body?.id ?? "");
  const NUM = sql(`select case_number from runtime_case where id = '${CA}'`), NUMB = sql(`select case_number from runtime_case where id = '${CB}'`);
  // The principal's email, as the client's answer (stand-in for the questionnaire; see the header).
  const subj = sql(`select s.id || '|' || s.party_id || '|' || s.workspace_id from case_participant p join answer_subject s on s.id = p.subject_id where p.case_id = '${CA}' and p.role = 'principal'`).split("|");
  const field = subj[2] ? sql(`select id from canonical_field where workspace_id = '${subj[2]}' and canonical_field_key in ('person.email', 'person.email_address') order by canonical_field_key limit 1`) : "";
  if (field) sql(`insert into client_canonical_answer (id, workspace_id, party_id, subject_id, canonical_field_id, canonical_field_key, value_json, status, source_json)
    values ('${randomUUID()}', '${subj[2]}', '${subj[1]}', '${subj[0]}', '${field}', (select canonical_field_key from canonical_field where id = '${field}'), ${qt(JSON.stringify(MAIL))}::jsonb, 'DECLARED', '{"channel":"questionnaire"}')`);
  const indexed = sql(`select count(*) from case_party_index where case_id in ('${CA}', '${CB}') and name_norm like ${qt(`${NADIA.toLowerCase()}%`)}`);
  ok(`J-102 setup: firm A has the lead ${NADIA} Sample (user-O's), the lead ${HIDDEN} Sample (user-T's) and case ${NUM || "?"} whose principal is ${NADIA} Sample; firm B has a lead with the same name and email and a case with the same name (case number ${NUMB || "?"}${NUMB && NUMB === NUM ? ", the same as firm A's" : ""}); both principals are in the case party index`,
    la.status === 201 && lh.status === 201 && lb.status === 201 && !!CA && !!CB && /^C-\d{4}-\d+$/.test(NUM) && indexed === "2", { leads: [la.status, lh.status, lb.status], cases: [ca.status, cb.status, ca.body?.detail, cb.body?.detail], combo, NUM, NUMB, indexed, emailField: !!field });

  // ------------------------------------------------------------------------------------------------ W1 by name
  const w1 = await find(o, NADIA), r1 = await doorRows(tok.O, NADIA), d1 = r1?.map((h) => h.url) ?? null;
  const caseHere = `/cases/${CA}`, caseThere = `/cases/${CB}`, leadHere = `/front-office/leads/${LA}`, leadThere = `/front-office/leads/${LB}`;
  ok(`J-102 W1: by name, ${NADIA} lists firm A's lead under "Leads and prospects" and firm A's case principal under "People on cases"`,
    !!w1 && w1.hits.some((h) => h.kind === "person" && h.text.includes(NADIA)) && w1.hits.some((h) => h.kind === "case_person" && h.text.includes(NUM)) && has(d1, leadHere) && has(d1, caseHere),
    { box: w1?.hits.map((h) => `${h.kind}: ${h.text.slice(0, 60)}`) ?? "no find box", door: d1 ?? "no find door" });
  // Judged by address: case numbers are per firm, so firm B's case may carry the same number as firm A's.
  ok("J-102 W1: firm B's lead and case of the same name are never listed (the door names firm A's and neither of B's; the box shows the door's rows, kind and name, one for one)",
    !!w1 && !!d1 && d1.length > 0 && !has(d1, caseThere) && !has(d1, leadThere) && sameRows(w1.hits, r1), { door: r1?.map((h) => `${h.kind}: ${h.title}`) ?? "no find door", box: w1?.hits.map((h) => `${h.kind}: ${h.text.slice(0, 50)}`) ?? "no find box" });
  await shot(o, "w1-by-name-1440");

  // ------------------------------------------------------------------------------------------------ W2 by email
  const w2 = await find(o, MAIL), d2 = await door(tok.O, MAIL);
  ok("J-102 W2: by email, the lead is listed with \"Matched: Email\"", !!w2 && w2.hits.some((h) => h.kind === "person" && h.text.includes("Matched: Email")) && has(d2, leadHere), { box: w2?.hits.map((h) => h.text.slice(0, 80)) ?? "no find box", door: d2 ?? "no find door" });
  ok(`J-102 W2: by email, the case principal on ${NUM} is listed too, "Matched: Email" (the answer is the stand-in above)`, !!field && !!w2 && w2.hits.some((h) => h.kind === "case_person" && h.text.includes("Matched: Email")) && has(d2, caseHere), { emailField: !!field, box: w2?.hits.map((h) => h.kind) ?? "no find box" });
  const d2s = await door(tok.S, MAIL);
  ok("J-102 W2: firm B's lead with the same email is never listed to firm A, and firm B's own search finds it (and not firm A's)", d2 !== null && d2.length > 0 && !has(d2, leadThere) && has(d2s, leadThere) && !has(d2s, leadHere), { firmA: d2 ?? "no find door", firmB: d2s ?? "no find door" });
  await shot(o, "w2-by-email-1440");

  // ------------------------------------------------------------------------------------------------ W3 by file number
  const w3 = await find(o, NUM.toLowerCase()), d3 = await door(tok.O, NUM), d3s = await door(tok.S, NUMB);
  const first = w3?.hits[0];
  // Case numbers are per firm: the two Sample firms' first cases carry the same number, so this is a real test of the firm.
  ok(`J-102 W3: firm A's ${NUM} and firm B's ${NUMB} are the same number; firm A's search names only firm A's case, firm B's search only firm B's`,
    NUM === NUMB && has(d3, caseHere) && !has(d3, caseThere) && has(d3s, caseThere) && !has(d3s, caseHere), { NUM, NUMB, firmA: d3 ?? "no find door", firmB: d3s ?? "no find door" });
  ok(`J-102 W3: by file number, ${NUM.toLowerCase()} lists case ${NUM} first, "Matched: File number"`, !!first && first.kind === "case" && first.text.includes(NUM) && first.text.includes("Matched: File number"), w3?.hits.map((h) => `${h.kind}: ${h.text.slice(0, 60)}`) ?? "no find box");
  await shot(o, "w3-by-number-1440");
  if (w3 && w3.hits.length) {
    await o.locator("[data-find-input]").press("Enter");
    await o.waitForURL(`**${caseHere}`, { timeout: 15_000 }).catch(() => undefined); await settle(o);
    // The case page draws grey placeholders without [data-loading] (settle returns at once), so wait for the number itself.
    await o.locator("main").getByText(NUM).first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  }
  const caseText = o.url().endsWith(caseHere) ? (await o.locator("main").innerText().catch(() => "")) : "";
  ok(`J-102 W3: Enter opens the case page ${caseHere}, which shows ${NUM} (the next capability's first step)`, o.url().endsWith(caseHere) && caseText.includes(NUM), { url: o.url() });
  await shot(o, "w3-case-opened-1440");

  // ------------------------------------------------------------------------------------------------ W4 rights
  await o.goto(`${BASE}/home`); await settle(o);
  const w4 = await find(o, HIDDEN), d4o = await door(tok.O, HIDDEN), d4t = await door(tok.T, HIDDEN), d4s = await door(tok.S, NADIA);
  ok(`J-102 W4: user-O (each person sees their own) never finds ${HIDDEN}, user-T's lead: the box shows no row and the door names nothing`, !!w4 && w4.hits.length === 0 && d4o !== null && !has(d4o, `/front-office/leads/${LH}`), { box: w4?.hits.length ?? "no find box", door: d4o ?? "no find door" });
  ok(`J-102 W4: user-T, who owns it, finds ${HIDDEN} through the same door`, has(d4t, `/front-office/leads/${LH}`), d4t ?? "no find door");
  ok(`J-102 W4: firm B's user-S finds only firm B's ${NADIA} (lead and case), never firm A's`, d4s !== null && has(d4s, caseThere) && has(d4s, leadThere) && !has(d4s, caseHere) && !has(d4s, leadHere), d4s ?? "no find door");
  const shut = [(await api("GET", `/front-office/leads/${LH}`, { token: tok.O })).status, (await api("GET", `/runtime/cases/${CA}`, { token: tok.S })).status];
  ok("J-102 W4: the records stay closed by their own routes: user-O on user-T's lead, user-S on firm A's case (403 or 404)", shut.every((s) => s === 403 || s === 404), shut);
  await shot(o, "w4-hidden-1440");

  // ------------------------------------------------------------------------------------------------ W5 keyboard
  await o.goto(`${BASE}/home`); await settle(o);
  const w5 = await find(o, NADIA);
  let opened = "", want = "";
  let at = -1;
  if (w5 && w5.hits.length >= 2) {
    await o.keyboard.press("ArrowDown");
    const marked = await o.locator("[data-find-input]").getAttribute("aria-activedescendant");
    at = w5.hits.findIndex((h) => h.id === marked);
    const rows = await doorRows(tok.O, NADIA) ?? [], hit = w5.hits[at];
    want = hit ? rows.find((r) => r.kind === hit.kind && hit.text.startsWith(r.title))?.url ?? "" : "";
    await o.keyboard.press("Enter"); await o.waitForURL((u) => u.pathname !== "/home", { timeout: 15_000 }).catch(() => undefined);
    opened = new URL(o.url()).pathname;
  }
  ok("J-102 W5: keyboard only: \"/\" from Home, type the name, ArrowDown marks the second row (index 1), Enter opens that row's own address", !!w5 && w5.hits.length >= 2 && at === 1 && !!want && opened === want, { hits: w5?.hits.length ?? "no find box", at, want, opened });

  // ------------------------------------------------------------------------------------------------ W6 sizes and axe
  for (const width of [400, 1024, 1440]) {
    const q = await signIn("sample-firm", O.email, width);
    const r = await find(q, NADIA, width < 640 ? "button" : "slash");
    const fits = await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const bad = (await new AxeBuilder({ page: q }).withTags(TAGS).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`);
    ok(`J-102 W6: at ${width} px the find box opens with its list (${width < 640 ? "the Find button" : "\"/\""}), no sideways scroll, no serious axe violation`, !!r && r.hits.length > 0 && fits && bad.length === 0, { hits: r?.hits.length ?? "no find box", fits, bad });
    if (width === 400) await shot(q, "w6-open-400");
    await q.context().close();
  }
  ok("J-102: no page error during the walk", errors.length === 0, errors);
} catch (e) {
  ok("J-102: the walk ran to its end", false, String(e).slice(0, 500));
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
