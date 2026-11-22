// FO-4sf (brief lead-b-briefs/FO-4sf.md rev 16.63; AG-2-23 rule 1 "Filters on leads: … source …"; R1.27): the Leads
// list filters by the lead's stored source (AG-02 glossary: where it came from, not the door), inside FO-2v's visibility.
// Against the real routes (no fake API) and in a real browser: DW1 the API filter, DW2 an own-only Case Officer, DW3 the
// screen (keyboard only, kept in the address over a reload, axe-core, 375/1024/1440 px). A pass and a fail each. US$0.
//   zsh studio/tools/isolated.sh screens_fo4sf 4531 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo4sf_source_filter.ts 4531 xr_studio_screens_fo4sf
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4531), DBNAME = process.argv[3] ?? "xr_studio_screens_fo4sf";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "fo-4-sales", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
ok("FO-4sf setup: the Sample firm and its front office are seeded", !!A && fo.failed.length === 0, fo.failed);
const ws = await platformAuditWorkspaceId(db);
const seesAll = (value: boolean) => writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value, by: "seed:FO-4sf-test", workspaceId: ws, reason: "FO-4sf test" });
const staffOf = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
const T = staffOf("user-T"), O = staffOf("user-O");   // Case Manager (sees all when the setting is on), Case Officer
// Seven leads (Sample people, made for this run). The source is the stored "where it came from", not the door (AG-02
// glossary): oBook arrived by booking with the source "Phone call", so a filter on the door would miss it. tComma is a
// typed source with a comma (never split) that only the Case Manager has.
let n = 0;
const lead = (door: string, source: string, owner: string) => {
  const p = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Src${++n}${run}', 'Sample', 'fo4sf${n}.${run}@example.org', 'test', now()) returning id`);
  return sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values (gen_random_uuid(), '${A}', '${p}', '${door}', '${source}', '${owner}', 'test', now()) returning id`);
};
const L = {
  tWeb: lead("WEB_FORM", "WEBSITE", T.id), tMan: lead("MANUAL", "Phone call", T.id), tBook: lead("BOOKING", "Referral", T.id), tComma: lead("MANUAL", "Event, Toronto", T.id),
  oWeb: lead("WEB_FORM", "WEBSITE", O.id), oMan: lead("MANUAL", "Phone call", O.id), oBook: lead("BOOKING", "Phone call", O.id),
};
const ours = new Set(Object.values(L));
const enc = (...v: string[]) => v.map((x) => `&source=${encodeURIComponent(x)}`).join("");
async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tok = { T: await signIn(T.email), O: await signIn(O.email) };
const list = async (t: string, qs: string) => {
  const r = await fetch(`${BASE}/api/front-office/leads?view=all${qs}`, { headers: { authorization: `Bearer ${t}` } });
  const body = await r.json() as unknown;
  return { status: r.status, body, ids: Array.isArray(body) ? new Set((body as { id: string }[]).map((x) => x.id).filter((id) => ours.has(id))) : new Set<string>() };
};
const same = (a: Set<string>, b: string[]) => a.size === b.length && b.every((x) => a.has(x));

const sourcesOf = async (t: string) => ((await fetch(`${BASE}/api/front-office/leads/sources`, { headers: { authorization: `Bearer ${t}` } }).then((r) => r.json())) as { sources: string[] }).sources;

// ------------------------------------------------------------------------------------------- DW1: the API filter
await seesAll(true);
const phone = await list(tok.T, enc("Phone call"));
ok("FO-4sf DW1 pass: source=Phone call returns only those leads, the one that arrived by booking included (the source, not the door)", phone.status === 200 && same(phone.ids, [L.tMan, L.oMan, L.oBook]), [phone.status, [...phone.ids]]);
const two = await list(tok.T, enc("Phone call", "Referral")), comma = await list(tok.T, enc("Event, Toronto"));
ok("FO-4sf DW1 pass: two values return both; a source holding a comma is one value, never split", same(two.ids, [L.tMan, L.oMan, L.oBook, L.tBook]) && same(comma.ids, [L.tComma]), [[...two.ids], [...comma.ids]]);
const none = await list(tok.T, ""), blank = await list(tok.T, "&source=");
ok("FO-4sf DW1 pass: no value (or an empty one) → every source, as before", same(none.ids, Object.values(L)) && same(blank.ids, Object.values(L)), [none.ids.size, blank.ids.size]);
const tSources = await sourcesOf(tok.T);
ok("FO-4sf DW1 pass: the choices are the stored sources, A to Z", ["Event, Toronto", "Phone call", "Referral", "WEBSITE"].every((x) => tSources.includes(x)) && [...tSources].sort().join("|") === tSources.join("|"), tSources);
const bad = await list(tok.T, enc("Phone call", "MANUAL")), lower = await list(tok.T, enc("phone call"));
const badBody = bad.body as { detail?: string; code?: string; allowed?: string[] };
ok("FO-4sf DW1 fail: an unknown value (here a door, MANUAL) → 422 naming the allowed ones, and no rows (PF-28 part 3a: a field error is 422)", bad.status === 422 && badBody.code === "UNKNOWN_SOURCE" && /Unknown source: MANUAL/.test(badBody.detail ?? "") && /Phone call/.test(badBody.detail ?? "") && badBody.allowed?.includes("Referral") === true, bad.body);
ok("FO-4sf DW1 fail: a value in the wrong case is unknown too (422), never a silent match (PF-28 part 3a: a field error is 422)", lower.status === 422, lower.status);

// ------------------------------------------------------------------------------------------- DW2: inside FO-2v's visibility
await seesAll(false);   // own-only: FO-2v, all = view.all AND the setting on
const oPhone = await list(tok.O, enc("Phone call")), oAll = await list(tok.O, enc("Phone call", "WEBSITE"));
ok("FO-4sf DW2 pass: an own-only Case Officer filtering by Phone call sees only their own leads of that source", oPhone.status === 200 && same(oPhone.ids, [L.oMan, L.oBook]), [...oPhone.ids]);
ok("FO-4sf DW2 fail: no filter widens it: the sources the Case Manager shares still show none of their leads", same(oAll.ids, [L.oMan, L.oBook, L.oWeb]) && ![L.tWeb, L.tMan].some((x) => oAll.ids.has(x)), [...oAll.ids]);
const oSources = await sourcesOf(tok.O), oHidden = await list(tok.O, enc("Event, Toronto"));
ok("FO-4sf DW2 fail: another person's source is never named: not in the choices, and asking for it is the same 422 as any unknown value (PF-28 part 3a: a field error is 422)", !oSources.includes("Event, Toronto") && !oSources.includes("Referral") && oHidden.status === 422 && !((oHidden.body as { allowed?: string[] }).allowed ?? []).includes("Event, Toronto"), [oSources, oHidden.status]);
const tOwn = await list(tok.T, enc("Phone call"));
ok("FO-4sf DW2 pass: the setting off narrows the Case Manager too: only their own Phone call lead", same(tOwn.ids, [L.tMan]), [...tOwn.ids]);
const mine = await fetch(`${BASE}/api/front-office/leads?view=mine${enc("WEBSITE")}`, { headers: { authorization: `Bearer ${tok.O}` } }).then((r) => r.json()) as { id: string }[];
ok("FO-4sf DW2 pass: Mine with a source is the person's own leads of that source", same(new Set(mine.map((x) => x.id).filter((id) => ours.has(id))), [L.oWeb]));

// ------------------------------------------------------------------------------------------- DW3: the screen
await seesAll(true);
const browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
await ctx.addInitScript((t) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })), tok.T);
const p: Page = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
const shown = async () => new Set(await p.locator("tr[data-lead-row]").evaluateAll((rs) => rs.map((r) => r.getAttribute("data-lead-row") ?? "")));
const numberOf = (id: string) => sql(`select number from fo_lead where id = '${id}'`);
const axe = async (name: string) => { const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  ok(`${name}: axe finds no WCAG A/AA violation`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
// Scale (review M4): 30 more sources the Case Manager has, so the control must hold an open-ended list.
for (let i = 1; i <= 30; i++) lead("MANUAL", `Sample source ${String(i).padStart(2, "0")}`, T.id);
await p.setViewportSize({ width: 1024, height: 800 });
await p.goto(`${BASE}/front-office/leads?view=all`); await p.locator(`tr[data-lead-row="${numberOf(L.tBook)}"]`).waitFor({ timeout: 30_000 });
const firstRowTop = async () => (await p.locator("tr[data-lead-row]").first().boundingBox())?.y ?? 9999;
ok("FO-4sf DW3 pass (scale): with 34 sources at 1024 px the Source filter is one control and the table starts in the first screen", (await p.locator("[data-source-toggle]").count()) === 1 && (await p.locator("[data-source-toggle]").innerText()).trim() === "Source: all" && (await firstRowTop()) < 800, await firstRowTop());
await axe("FO-4sf Leads with the Source filter (1024 px)");
// Keyboard only: Tab to the Source button, Enter opens it with the cursor in Find, type, Tab to the box, Space ticks it.
let reached = false;
for (let i = 0; i < 40 && !reached; i++) { await p.keyboard.press("Tab"); reached = await p.evaluate(() => document.activeElement?.hasAttribute("data-source-toggle") ?? false); }
await p.keyboard.press("Enter");
await p.locator("#fo-source-list").waitFor({ timeout: 5_000 });
const inFind = await p.evaluate(() => document.activeElement?.hasAttribute("data-source-find") ?? false);
const listTexts = await p.locator('#fo-source-list label:has(input[data-source])').allInnerTexts();
ok("FO-4sf DW3 pass: the list holds the stored sources in plain words, none ticked, and scrolls inside itself", ["Website form", "Phone call", "Referral", "Event, Toronto"].every((x) => listTexts.map((t) => t.trim()).includes(x)) && !listTexts.some((t) => t.trim() === "WEBSITE") && (await p.locator("#fo-source-list input:checked").count()) === 0
  && await p.locator("#fo-source-list fieldset").evaluate((f) => f.scrollHeight > f.clientHeight) && (await firstRowTop()) < 800, listTexts.length);
await axe("FO-4sf Source list open (1024 px)");
await p.keyboard.type("zzz");
ok("FO-4sf DW3 fail: Find with no match says so, and nothing is chosen", (await p.locator("#fo-source-list [role=status]").innerText()).includes("No source matches") && !p.url().includes("source="));
await p.keyboard.press("Control+a"); await p.keyboard.type("phone");
await p.keyboard.press("Tab"); const onBox = await p.evaluate(() => document.activeElement?.getAttribute("data-source"));
await p.keyboard.press("Space");
await p.waitForURL(/source=Phone/, { timeout: 10_000 }); await p.locator(`tr[data-lead-row="${numberOf(L.tBook)}"]`).waitFor({ state: "detached", timeout: 15_000 }); await p.locator(`tr[data-lead-row="${numberOf(L.tMan)}"]`).waitFor({ timeout: 15_000 });
await p.keyboard.press("Escape");
const afterPick = await shown();
ok("FO-4sf DW3 pass (keyboard only): Tab, Enter, type \"phone\", Tab, Space filters to Phone call, the booked lead included; Escape closes and returns to the button", reached && inFind && onBox === "Phone call" && [L.tMan, L.oMan, L.oBook].every((x) => afterPick.has(numberOf(x))) && ![L.tWeb, L.tBook, L.oWeb, L.tComma].some((x) => afterPick.has(numberOf(x)))
  && (await p.locator("#fo-source-list").count()) === 0 && await p.evaluate(() => document.activeElement?.hasAttribute("data-source-toggle") ?? false), { reached, inFind, onBox, rows: [...afterPick] });
await p.reload(); await p.locator(`tr[data-lead-row="${numberOf(L.tMan)}"]`).waitFor({ timeout: 30_000 });
const afterReload = await shown();
ok("FO-4sf DW3 pass: the choice survives a reload (?source= in the address, shown as a chip and on the button)", (await p.locator('[data-source-chip="Phone call"]').count()) === 1 && (await p.locator("[data-source-toggle]").innerText()).trim() === "Source (1)" && !afterReload.has(numberOf(L.tBook)) && p.url().includes("view=all"), p.url());
await axe("FO-4sf Leads filtered by Phone call (1024 px)");
await p.screenshot({ path: join(SHOTS, "leads-source-filter-1024.png"), fullPage: true });
for (const w of [1440, 375]) {
  await p.setViewportSize({ width: w, height: w === 375 ? 800 : 900 });
  ok(`FO-4sf DW3 pass: no sideways page scroll at ${w} px`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  if (w === 375) { await p.locator("[data-source-toggle]").click(); await p.locator("#fo-source-list").waitFor(); ok("FO-4sf DW3 pass: the open list fits the 375 px screen", await p.evaluate(() => { const r = document.getElementById("fo-source-list")!.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1; })); await axe("FO-4sf Source list open (375 px)"); await p.screenshot({ path: join(SHOTS, "leads-source-filter-375.png"), fullPage: true }); await p.keyboard.press("Escape"); }
  else await p.screenshot({ path: join(SHOTS, "leads-source-filter-1440.png"), fullPage: true });
}
// 200 % zoom (1440×900 → 720×450, review M7): the open panel stays on screen, the page never scrolls sideways. It is
// opened at 1024 px and the window then narrowed, so a panel placed only when it opens would fail here (review m10).
// No source chosen, so the control sits beside the view chips (a chosen chip would wrap it onto its own row and hide
// the bug: review m11).
await p.setViewportSize({ width: 1024, height: 800 });
await p.goto(`${BASE}/front-office/leads?view=all`); await p.locator(`tr[data-lead-row="${numberOf(L.tWeb)}"]`).waitFor({ timeout: 30_000 });
await p.locator("[data-source-toggle]").click(); await p.locator("#fo-source-list").waitFor();
await p.setViewportSize({ width: 720, height: 450 }); await p.waitForTimeout(100);
const at720 = await p.evaluate(() => { const r = document.getElementById("fo-source-list")!.getBoundingClientRect(); return { left: r.left, right: r.right, sw: document.documentElement.scrollWidth, w: window.innerWidth }; });
ok("FO-4sf DW3 pass (200 % zoom): at 720 px the open Source panel stays inside the screen and the page has no sideways scroll", at720.left >= 0 && at720.right <= at720.w + 1 && at720.sw <= at720.w + 1, at720);
await axe("FO-4sf Source list open (720 px, 200 % zoom)");
// Fail side (review m9): Tab out of the last box leaves the control, and the panel closes rather than lying over the table.
const boxes = await p.locator("#fo-source-list input[data-source]").count();
await p.locator("[data-source-find]").focus(); for (let i = 0; i <= boxes; i++) await p.keyboard.press("Tab");
ok("FO-4sf DW3 fail: focus leaving the Source control closes the panel", (await p.locator("#fo-source-list").count()) === 0 && !(await p.evaluate(() => document.getElementById("fo-source-list")?.contains(document.activeElement) ?? false)));
await p.setViewportSize({ width: 1440, height: 900 });
await p.goto(`${BASE}/front-office/leads?view=all&source=${encodeURIComponent("Phone call")}`); await p.locator('[data-source-chip="Phone call"]').waitFor({ timeout: 30_000 });
// Keyboard removal (review m8): the × removes that source and focus lands on the Source button, never on the page.
await p.getByRole("button", { name: "Remove source: Phone call" }).focus(); await p.keyboard.press("Enter"); await p.locator(`tr[data-lead-row="${numberOf(L.tBook)}"]`).waitFor({ timeout: 15_000 });
ok("FO-4sf DW3 pass: the chip's × (keyboard) removes that source, clears the address and leaves focus on the Source button", !p.url().includes("source=") && (await shown()).has(numberOf(L.oWeb)) && await p.evaluate(() => document.activeElement?.hasAttribute("data-source-toggle") ?? false), p.url());
await p.goto(`${BASE}/front-office/leads?view=all&source=Referral&source=WEBSITE`); await p.locator(`tr[data-lead-row="${numberOf(L.tWeb)}"]`).waitFor({ timeout: 30_000 });
await p.locator("[data-source-clear]").click(); await p.locator(`tr[data-lead-row="${numberOf(L.tMan)}"]`).waitFor({ timeout: 15_000 });
ok("FO-4sf DW3 pass: All sources clears every chosen source and the address", !p.url().includes("source=") && (await p.locator("[data-source-chip]").count()) === 0, p.url());
// Fail side (Devin on #1962): the sources cannot be loaded. The asked filter is kept and no unfiltered list is fetched.
let unfiltered = 0;
await p.route("**/api/front-office/leads/sources", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ title: "Unavailable", detail: "Sample outage." }) }));
p.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.endsWith("/api/front-office/leads") && u.searchParams.get("view") === "all" && !u.searchParams.has("source")) unfiltered++; });   // view=all only: the frame's own Unassigned count is not the list
await p.goto(`${BASE}/front-office/leads?view=all&source=Referral`); await p.locator("[data-source-blocked]").waitFor({ timeout: 30_000 });
ok("FO-4sf DW3 fail: when the sources cannot be loaded, the asked source stays (chip and message), no unfiltered list is fetched or shown, and Try again is offered",
  (await p.locator('[data-source-chip="Referral"]').count()) === 1 && unfiltered === 0 && (await p.locator("tr[data-lead-row]").count()) === 0 && (await p.getByRole("button", { name: "Try again" }).count()) >= 1, { unfiltered });
await p.unroute("**/api/front-office/leads/sources");
await p.getByRole("button", { name: "Try again" }).first().click(); await p.locator(`tr[data-lead-row="${numberOf(L.tBook)}"]`).waitFor({ timeout: 15_000 });
ok("FO-4sf DW3 pass: Try again loads the sources and the filtered list follows", (await shown()).has(numberOf(L.tBook)) && !(await shown()).has(numberOf(L.tMan)));
// Fail side: a hand-edited address with an unknown source is dropped (all sources shown), never an error page.
await p.goto(`${BASE}/front-office/leads?view=all&source=FAX`); await p.locator(`tr[data-lead-row="${numberOf(L.tBook)}"]`).waitFor({ timeout: 30_000 });
ok("FO-4sf DW3 fail: an unknown ?source= in the address is ignored: no chip, every source listed, no error", (await p.locator("[data-source-chip]").count()) === 0 && (await p.getByRole("alert").count()) === 0);
// Fail side: a source with no lead in this view says so and offers All sources.
sql(`update fo_lead set owner_staff_id = '${O.id}' where id = '${L.tBook}'`);   // the Case Manager now owns no Referral lead
await p.goto(`${BASE}/front-office/leads?view=mine&source=Referral`); await p.locator("[data-empty]").waitFor({ timeout: 30_000 });
ok("FO-4sf DW3 fail: a source with none of the person's own leads (Mine) says so in plain words and offers All sources", /No leads from Referral here/.test(await p.locator("[data-empty]").innerText()) && (await p.locator("[data-source-clear]").count()) === 1);
ok("FO-4sf: no page error in the browser", errors.length === 0, errors);
await db.$disconnect();
await browser.close();
process.exit(summary() ? 1 : 0);
