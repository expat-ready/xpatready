// FO-9s part 2 (R1.29; concept screens/FO-9s/concept.md r3 §4 S2, board design/fo9s-boards.html S2; brief
// design/briefs/track-b/FO-9s-2.md): Sales › People to merge against FO-9b part 2's real routes, on an isolated copy.
// Each rule has a pass and a fail:
//   R1 BR-6  ("each person sees their own" on) the Case Officer sees a pair whose two sides are theirs and not one whose
//            other side a colleague owns; the Owner sees their own pair with names, lead numbers, what matched and the
//            score; a member without agent/prospect:edit has no menu item and the no-key sentence at the address
//   R2 BR-6  Merge… is shown to holders of agent/prospect:merge (the Owner) and not to a Case Officer
//   R3 BR-7  a case pair's Merge… is off with the sentence word for word; a pair with no case has no sentence
//   R4 BR-11 Keep separate (confirm) moves the pair to Kept separate and the lead page's "Possible match" notice goes;
//            Cancel changes nothing
//   R5 BR-10 Undo merge on the Merged tab restores both people (by API); a refused Undo (the person has a case now) shows
//            the server's reason after the click and nothing changes
//   R6       the menu's open count matches the To review tab; each tab's empty sentence (a firm with no pairs)
//   R7       keyboard only (tabs by arrow keys, Keep separate by Enter), axe (no serious), 375/1024/1440 with no sideways
//            scroll; no page error
// Sample rows only; US$0, no model call. Usage, from prototype/:
//   zsh studio/tools/isolated.sh screens_ptm 4571 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo9s_review_browser.ts 4571 xr_studio_screens_ptm
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const PORT = Number(process.argv[2] ?? 4571), DBNAME = process.argv[3] ?? "xr_studio_screens_ptm", BASE = `http://localhost:${PORT}`;
const SHOTS = join(import.meta.dirname, "..", "..", "..", "product", "screens", "FO-9s", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36).replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]);
const CASE_LINE = "This person has a case; merge them from the client record.";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`), SOLO = sql(`select id from platform_firm where key = 'sample-solo'`);
// R1 needs "each person sees their own", so a colleague's lead is one the Case Officer may not open.
await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:FO-9s-2", workspaceId: await platformAuditWorkspaceId(db as never), reason: "FO-9s part 2: each person sees their own" });
// A member with no agent/prospect:edit (read only), for the no-key case.
const roEmail = `ro.${run}@fo9s.example.com`;
const ro = await db.platformStaff.create({ data: { firmId: A, email: roEmail, displayName: "Sample read only", actorId: `fo9s-ro-${run}`, status: "ACTIVE" } });
await db.platformRoleGrant.create({ data: { firmId: A, staffId: ro.id, role: "READ_ONLY" as never, grantedBy: "seed:FO-9s-2" } });
await db.$disconnect();

const staffOf = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
async function signIn(email: string, firmKey = "sample-firm"): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const R = staffOf("user-R"), O = staffOf("user-O"), T = staffOf("user-T");   // Owner (may merge), Case Officer (edit only), Case Manager
const tok = { R: await signIn(R.email), O: await signIn(O.email), T: await signIn(T.email), RO: await signIn(roEmail) };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other browser checks
const api = async (t: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${t}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
/** A person with one lead owned by the adder (FO-2's route, added as new). */
async function person(t: string, given: string, family: string): Promise<{ person: string; lead: string }> {
  const email = `${given.toLowerCase()}.${family.toLowerCase()}.${run}@example.org`;
  const r = await api(t, "POST", "/front-office/leads", { requestId: randomUUID(), givenNames: `${given}${run}`, familyName: family, email, source: "Phone call", confirmedNew: true });
  if (r.status !== 201) { console.error(`STOP  add lead refused for ${given}: ${r.status} ${JSON.stringify(r.body)}`); process.exit(2); }
  const [p, l] = sql(`select p.id || '|' || l.id from fo_person p join fo_lead l on l.person_id = p.id where p.firm_id = '${A}' and lower(p.email) = '${email}'`).split("|");
  return { person: p, lead: l };
}
/** An OPEN pair as a web-form arrival writes it (notePairs' columns; a similar name, Sample score). The second person was
 *  added with "Add as new", which wrote the pair Kept separate: it is set back to To review, as a web-form arrival's is. */
const pairOf = (a: string, b: string, score = 82) => { const [lo, hi] = [a, b].sort(); return sql(`insert into fo_dup_review (firm_id, kind, low_id, high_id, score, reasons, status) values ('${A}', 'PERSON', '${lo}', '${hi}', ${score}, '[{"key":"NAME","similarity":0.${score}}]'::jsonb, 'OPEN')
  on conflict (firm_id, low_id, high_id) do update set status = 'OPEN', score = excluded.score, reasons = excluded.reasons, decided_by = null, decided_at = null returning id`); };
const caseFor = (p: string, name: string) => sql(`insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, created_by) values (gen_random_uuid(), (select id from workspace order by created_at limit 1), 'sample-firm', '${A}', (select coalesce(max(client_number), 9000) + 1 from case_client where firm_key = 'sample-firm'), '${name}', 'PERSON', '${p}', 'user-R') returning id`);
const live = (x: string, y: string) => sql(`select count(*) from fo_person where id in ('${x}', '${y}') and merged_into_id is null`) === "2";

// Sample people and pairs.
const ana = await person(tok.O, "Ana", "Silva"), ana2 = await person(tok.O, "Ana", "Silvo");        // both the Case Officer's
const ben = await person(tok.O, "Ben", "Okafor"), ben2 = await person(tok.T, "Ben", "Okafur");      // one side a colleague's
const dan = await person(tok.R, "Dan", "Fischer"), dan2 = await person(tok.R, "Dan", "Fisher");    // the Owner's own
const kim = await person(tok.R, "Kim", "Moreau"), kim2 = await person(tok.R, "Kim", "Moreaux");     // a case pair
const lea = await person(tok.R, "Lea", "Dubois"), lea2 = await person(tok.R, "Lea", "Duboiss");     // merged, then undone
const max = await person(tok.R, "Max", "Weber"), max2 = await person(tok.R, "Max", "Webber");       // merged, Undo refused
const P_ANA = pairOf(ana.person, ana2.person), P_BEN = pairOf(ben.person, ben2.person), P_KIM = pairOf(kim.person, kim2.person, 90);
const P_DAN = pairOf(dan.person, dan2.person);
const P_LEA = pairOf(lea.person, lea2.person), P_MAX = pairOf(max.person, max2.person);
caseFor(kim.person, "Kim Moreau");
// BR-11: Ana's second lead carries the "Possible match" flag naming Ana (as an arrival sets it).
sql(`update fo_lead set possible_match_person_id = '${ana.person}' where id = '${ana2.lead}'`);
const m1 = await api(tok.R, "POST", `/front-office/duplicates/review/${P_LEA}/merge`, { survivorId: lea.person, choices: {} });
const m2 = await api(tok.R, "POST", `/front-office/duplicates/review/${P_MAX}/merge`, { survivorId: max.person, choices: {} });
ok("FO-9s part 2 setup: five Sample pairs (one a case pair) and two merges by the Owner", !!P_ANA && !!P_BEN && !!P_KIM && m1.status === 200 && m2.status === 200, [m1.status, m2.status, m1.body?.detail, m2.body?.detail]);

const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") && process.platform !== "darwin" ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {});
const errors: string[] = [];
async function pageAs(t: string, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
  p.on("pageerror", (e) => errors.push(String(e)));
  return p;
}
async function openPage(p: Page, tab = "") {
  await p.goto(`${BASE}/front-office/duplicates${tab ? `?tab=${tab}` : ""}`);
  await p.getByRole("heading", { level: 1, name: "People to merge" }).waitFor({ timeout: 30_000 });
}
const row = (p: Page, id: string) => p.locator(`[data-dup-pair="${id}"]`);
const settle = async (p: Page) => { await p.getByText(/^Loading/).first().waitFor({ state: "detached", timeout: 15_000 }); await p.waitForTimeout(200); };

try {
  // ----------------------------------------------------------------------- R1, R2, R3, R6: the Owner's To review
  const r = await pageAs(tok.R); await openPage(r); await settle(r);
  await row(r, P_DAN).waitFor({ timeout: 15_000 });
  await r.screenshot({ path: join(SHOTS, "fo9s2-01-to-review-1440.png"), fullPage: true });
  ok("FO-9s R1 BR-6 pass: the Owner sees their own pair with names, lead numbers, what matched and the score",
    /Dan\w* Fischer · L-\d+/.test(await row(r, P_DAN).innerText()) && /Similar name \(82%\)/.test(await row(r, P_DAN).innerText()) && (await row(r, P_DAN).locator("[data-match-score='82']").count()) === 1);
  ok("FO-9s R2 BR-6 pass: Merge… is shown to the Owner (agent/prospect:merge)", (await row(r, P_DAN).getByRole("button", { name: "Merge…" }).count()) === 1);
  ok("FO-9s R3 BR-7 pass: the case pair's Merge… is off with the sentence word for word, tied to the button",
    await row(r, P_KIM).getByRole("button", { name: "Merge…" }).isDisabled() && (await row(r, P_KIM).locator("[data-needs-case-side]").innerText()) === CASE_LINE
    && (await row(r, P_KIM).getByRole("button", { name: "Merge…" }).getAttribute("aria-describedby")) === `dup-case-${P_KIM}`);
  ok("FO-9s R3 BR-7 fail: a pair with no case has no case sentence", (await row(r, P_DAN).locator("[data-needs-case-side]").count()) === 0);
  const apiOpen = await api(tok.R, "GET", "/front-office/duplicates/review");
  const menuCount = (await r.getByRole("navigation", { name: "Sales" }).locator("[data-dup-count]").innerText().catch(() => "")).trim();
  const tabText = (await r.getByRole("tab", { name: /To review/ }).innerText()).trim();
  ok("FO-9s R6 pass: the menu's People to merge count matches the To review tab and the API's open count",
    menuCount === String(apiOpen.body?.openCount) && tabText === `To review (${apiOpen.body?.openCount})`, { menuCount, tabText, api: apiOpen.body?.openCount });
  await r.getByRole("tab", { name: /To review/ }).hover();
  const tip = r.locator("[data-match-score]").first(); await tip.focus(); await r.waitForTimeout(500);
  ok("FO-9s R1: the Match pill explains itself on focus (tooltip)", (await r.getByRole("tooltip").first().innerText().catch(() => "")).includes("An exact email or phone is a 100 match."));

  // ----------------------------------------------------------------------- R1, R2 for the Case Officer
  const o = await pageAs(tok.O); await openPage(o); await settle(o);
  await row(o, P_ANA).waitFor({ timeout: 15_000 });
  ok("FO-9s R1 BR-6 pass: the Case Officer sees the pair whose two sides are theirs", (await row(o, P_ANA).count()) === 1);
  ok("FO-9s R1 BR-6 fail: the Case Officer who may open only one side sees no pair (Ben's)", (await row(o, P_BEN).count()) === 0 && !(await o.locator("main").innerText()).includes(`Ben${run} Okafur`));
  ok("FO-9s R2 BR-6 fail: a Case Officer without agent/prospect:merge sees no Merge…", (await o.getByRole("button", { name: "Merge…" }).count()) === 0);
  ok("FO-9s R1: the Case Officer's Sales menu offers People to merge (agent/prospect:edit)", (await o.getByRole("navigation", { name: "Sales" }).getByRole("link", { name: /People to merge/ }).count()) === 1);

  // ----------------------------------------------------------------------- R1 no key
  const n = await pageAs(tok.RO); await n.goto(`${BASE}/front-office/leads`); await n.waitForTimeout(1_500);
  const noItem = (await n.getByRole("link", { name: /People to merge/ }).count()) === 0;
  await openPage(n);
  ok("FO-9s R1 BR-6 fail: a member without agent/prospect:edit has no menu item, and the address says who to ask",
    noItem && (await n.getByText("You need access to People to merge. Ask an Owner or Admin.").count()) === 1 && (await n.getByRole("tab").count()) === 0);
  await n.screenshot({ path: join(SHOTS, "fo9s2-06-no-key-1440.png"), fullPage: true });
  await n.context().close();
  // The key taken away mid-session (the page still holds the old keys): the list's 403 is the no-key sentence (break r1 F7).
  const lostKey = await pageAs(tok.O);
  await lostKey.route("**/api/front-office/duplicates/review?status=*", (q) => q.fulfill({ status: 403, contentType: "application/problem+json", body: JSON.stringify({ title: "Not allowed", detail: "You do not have access.", code: "FORBIDDEN" }) }));
  await openPage(lostKey);
  ok("FO-9s R1 BR-6 fail (break r1 F7): a key lost mid-session (the list answers 403) shows the no-key sentence, not a load error",
    await lostKey.getByText("You need access to People to merge. Ask an Owner or Admin.").waitFor({ timeout: 10_000 }).then(() => true, () => false) && (await lostKey.getByText("Could not load").count()) === 0);
  await lostKey.context().close();

  // ----------------------------------------------------------------------- R4 BR-11 Keep separate
  // From the lead (its "Possible match" notice shown) to People to merge by the menu, so Back is the app's own
  // navigation with its cached answers (break r1 F1).
  await o.goto(`${BASE}/front-office/leads/${ana2.lead}`); await o.getByText(/Possible match/i).first().waitFor({ timeout: 15_000 });
  await o.getByRole("navigation", { name: "Sales" }).getByRole("link", { name: /People to merge/ }).click();
  await row(o, P_ANA).waitFor({ timeout: 15_000 });
  await row(o, P_ANA).getByRole("button", { name: "Keep separate" }).click();
  await o.getByRole("dialog").waitFor();
  await o.screenshot({ path: join(SHOTS, "fo9s2-02-keep-separate-confirm-1440.png"), fullPage: true });
  await o.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  ok("FO-9s R4 BR-11 fail: Cancel on the confirm changes nothing (the pair stays To review)", sql(`select status from fo_dup_review where id = '${P_ANA}'`) === "OPEN" && (await row(o, P_ANA).count()) === 1);
  await o.waitForTimeout(300);
  const back = await o.evaluate(() => (document.activeElement as HTMLElement | null)?.closest("[data-dup-pair]")?.getAttribute("data-dup-pair") + "|" + document.activeElement?.textContent);
  ok("FO-9s R7 fail (review r1 M1): after Cancel, focus is back on the row's Keep separate (never the page body)", back === `${P_ANA}|Keep separate`, back);
  await o.keyboard.press("Enter");   // focus is already on it: the keyboard reopens the dialog
  const keepPosts: number[] = []; o.on("request", (q) => { if (q.url().endsWith("/keep-separate") && q.method() === "POST") keepPosts.push(1); });
  await o.getByRole("dialog").getByRole("button", { name: "Keep separate" }).dblclick();
  await row(o, P_ANA).waitFor({ state: "detached", timeout: 10_000 });
  const after = await o.waitForFunction(() => document.activeElement && document.activeElement !== document.body ? (document.activeElement.getAttribute("data-dup-tab") ?? (document.activeElement.hasAttribute("data-dup-keep") ? "keep" : document.activeElement.tagName)) : null, null, { timeout: 5_000 }).then((h) => h.jsonValue(), () => "body");
  ok("FO-9s R7 fail (review r1 M1, m1): a double click on Keep separate sends one request, and focus moves to the next pair's Keep separate or the tab, never the body",
    keepPosts.length === 1 && (after === "keep" || after === "review"), { posts: keepPosts.length, after });
  await o.goBack(); await o.waitForTimeout(1_500);
  ok("FO-9s R4 BR-11 fail (break r1 F1): Back to the lead right after Keep separate no longer shows \"Possible match\" (no reload)", !(/Possible match/i.test(await o.locator("main").innerText())));
  await o.goForward(); await o.getByRole("heading", { level: 1, name: "People to merge" }).waitFor();
  await o.getByRole("tab", { name: /Kept separate/ }).click();
  await row(o, P_ANA).waitFor({ timeout: 10_000 });
  await o.screenshot({ path: join(SHOTS, "fo9s2-03-kept-separate-1440.png"), fullPage: true });
  ok("FO-9s R4 BR-11 pass: Keep separate moves the pair to the Kept separate tab (by keyboard and confirm), decided by staff",
    sql(`select status from fo_dup_review where id = '${P_ANA}'`) === "KEPT_SEPARATE" && /Decided by staff/.test(await row(o, P_ANA).innerText()) && o.url().includes("tab=kept"));
  await o.goto(`${BASE}/front-office/leads/${ana2.lead}`); await o.waitForTimeout(1_500);
  ok("FO-9s R4 BR-11 pass: the lead page's \"Possible match\" notice is gone after Keep separate", !(/Possible match/i.test(await o.locator("main").innerText())) && sql(`select coalesce(possible_match_person_id::text, '') from fo_lead where id = '${ana2.lead}'`) === "");

  // ----------------------------------------------------------------------- R5 BR-10 Undo merge
  await openPage(r, "merged"); await settle(r);
  const leaRow = r.locator(`[data-dup-merge="${m1.body?.mergeRef}"]`), maxRow = r.locator(`[data-dup-merge="${m2.body?.mergeRef}"]`);
  await leaRow.waitFor({ timeout: 10_000 });
  await r.screenshot({ path: join(SHOTS, "fo9s2-04-merged-1440.png"), fullPage: true });
  ok("FO-9s R5: the Merged tab names the people (one name, said as two records, when the kept record took the other's name) and who merged ('Merged by you')", /Lea\w* Dubois\w* (into Lea\w* Dubois|\(two records\))/.test(await leaRow.innerText()) && /Merged by you/.test(await leaRow.innerText()));
  await leaRow.getByRole("button", { name: "Undo merge" }).click();
  await leaRow.getByText(/^Undone/).waitFor({ timeout: 10_000 });
  const undoFocus = await r.waitForFunction((id) => document.activeElement?.closest(`[data-dup-merge="${id}"]`) && document.activeElement?.hasAttribute("data-dup-after"), m1.body?.mergeRef, { timeout: 5_000 }).then(() => true, () => false);
  ok("FO-9s R7 fail (review r1 M1): after Undo merge, focus stays on the row (its Undone line), never the page body", undoFocus);
  ok("FO-9s R5 BR-10 pass: Undo merge restores both people (by API: two live records, each with its own lead) and the row reads Undone",
    live(lea.person, lea2.person) && sql(`select count(*) from fo_lead where id = '${lea2.lead}' and person_id = '${lea2.person}'`) === "1" && (await leaRow.getByRole("button", { name: "Undo merge" }).count()) === 0);
  // Busy (503) is "try again": Undo stays offered (break r1 F4).
  await r.route(`**/duplicates/merges/${m2.body?.mergeRef}/undo`, (q) => q.fulfill({ status: 503, contentType: "application/problem+json", body: JSON.stringify({ title: "Busy", detail: "These records were being changed by someone else at the same moment. Nothing was changed. Try again.", code: "BUSY" }) }), { times: 1 });
  await maxRow.getByRole("button", { name: "Undo merge" }).click();
  await r.getByText("These records were being changed by someone else at the same moment.", { exact: false }).first().waitFor({ timeout: 10_000 });
  ok("FO-9s R5 BR-10 fail (break r1 F4): a busy answer (503) says try again and Undo merge stays offered", (await maxRow.getByRole("button", { name: "Undo merge" }).count()) === 1 && (await maxRow.locator("[data-undo-refused]").count()) === 0);
  caseFor(max.person, "Max Weber");   // a case since the merge: the case side splits it, not here
  await maxRow.getByRole("button", { name: "Undo merge" }).click();
  await maxRow.locator("[data-undo-refused]").waitFor({ timeout: 10_000 });
  await r.screenshot({ path: join(SHOTS, "fo9s2-05-undo-refused-1440.png"), fullPage: true });
  ok("FO-9s R5 BR-10 fail: a refused Undo shows the server's reason in the button's place, and nothing changed",
    (await maxRow.locator("[data-undo-refused]").innerText()).includes("This person has a case now; undo the merge from the client record.") && sql(`select coalesce(merged_into_id::text, '') from fo_person where id = '${max2.person}'`) === max.person);
  const oMerged = await pageAs(tok.O); await openPage(oMerged, "merged"); await settle(oMerged);
  ok("FO-9s R5 BR-6 fail: a Case Officer (no agent/prospect:merge) has no Undo merge button", (await oMerged.getByRole("button", { name: "Undo merge" }).count()) === 0);
  await oMerged.context().close();

  // ----------------------------------------------------------------------- R6 empty states (the solo firm: no pairs)
  const soloOwner = sql(`select s.email from platform_staff s join platform_role_grant g on g.staff_id = s.id where s.firm_id = '${SOLO}' and g.role = 'OWNER' limit 1`);
  const e = await pageAs(await signIn(soloOwner, "sample-solo")); await openPage(e); await settle(e);
  const emptyReview = await e.locator("[data-dup-empty='OPEN']").innerText().catch(() => "");
  await e.screenshot({ path: join(SHOTS, "fo9s2-07-empty-1440.png"), fullPage: true });
  await e.getByRole("tab", { name: /Merged/ }).click();
  ok("FO-9s R6 pass: an empty firm reads each tab's sentence (To review word for word; Merged)",
    emptyReview === "No pairs to review. When two records look like one person, they appear here." && (await e.locator("[data-dup-empty='MERGED']").count()) === 1);
  ok("FO-9s R6 fail: with no pairs the menu shows no count", (await e.getByRole("navigation", { name: "Sales" }).locator("[data-dup-count]").count()) === 0);
  await e.context().close();

  // ----------------------------------------------------------------------- R7 keyboard, axe, widths
  await openPage(r); await settle(r);
  await r.getByRole("tab", { name: /To review/ }).focus(); await r.keyboard.press("ArrowRight");
  const moved = await r.locator("[data-dup-tab='merged'][aria-selected='true']").waitFor({ timeout: 5_000 }).then(() => true, () => false);
  ok("FO-9s R7: keyboard only: the arrow key moves to the Merged tab", moved, await r.evaluate(() => document.activeElement?.textContent));
  for (const t of ["review", "merged", "kept"]) {
    await openPage(r, t); await settle(r);
    const axe = await new AxeBuilder({ page: r }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const bad = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    ok(`FO-9s R7: the ${t} tab passes axe (no serious or critical)`, bad.length === 0, bad.map((v) => `${v.id}: ${v.help}`));
  }
  for (const w of [375, 1024, 1440]) {
    const p = await pageAs(tok.R, w); await openPage(p); await settle(p);
    if (w !== 1440) await p.screenshot({ path: join(SHOTS, `fo9s2-01-to-review-${w}.png`), fullPage: true });
    ok(`FO-9s R7: no sideways page scroll on People to merge at ${w} px`, !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
    if (w === 375) {
      const cell = await p.locator("[data-dup-pair] td").first().evaluate((td) => ({ w: td.getBoundingClientRect().width, h: td.getBoundingClientRect().height }));
      ok("FO-9s R7 fail (review r1 m2): at 375 px the People column keeps a readable width (names do not break letter by letter)", cell.w >= 140 && cell.h < 160, cell);
    }
    if (w === 375) ok("FO-9s R7: the phone's Sales links reach People to merge", (await p.getByRole("navigation", { name: "Sales pages" }).getByRole("link", { name: "People to merge" }).count()) === 1);
    await p.context().close();
  }
  ok("FO-9s part 2: no page error", errors.length === 0, errors);
} finally { await browser.close(); }
process.exit(summary() ? 1 : 0);
