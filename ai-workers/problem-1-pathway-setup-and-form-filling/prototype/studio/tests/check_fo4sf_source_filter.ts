// FO-4sf (brief lead-b-briefs/FO-4sf.md rev 16.63; AG-2-23 rule 1 "Filters on leads: … source …"; R1.27): the Leads
// list filters by source, the stored way the lead arrived (web form, added by hand, booking), inside FO-2v's visibility.
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
// Six leads: each source owned by the Case Manager and by the Case Officer (Sample people, made for this run).
let n = 0;
const lead = (door: string, owner: string) => {
  const p = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Src${door.replace("_", "")}${++n}${run}', 'Sample', 'fo4sf${n}.${run}@example.org', 'test', now()) returning id`);
  return sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values (gen_random_uuid(), '${A}', '${p}', '${door}', '${door === "WEB_FORM" ? "WEBSITE" : door === "MANUAL" ? "Phone call" : "Booking"}', '${owner}', 'test', now()) returning id`);
};
const L = { tWeb: lead("WEB_FORM", T.id), tMan: lead("MANUAL", T.id), tBook: lead("BOOKING", T.id), oWeb: lead("WEB_FORM", O.id), oMan: lead("MANUAL", O.id), oBook: lead("BOOKING", O.id) };
const ours = new Set(Object.values(L));
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

// ------------------------------------------------------------------------------------------- DW1: the API filter
await seesAll(true);
const man = await list(tok.T, "&source=MANUAL");
ok("FO-4sf DW1 pass: source=MANUAL returns only the leads added by hand", man.status === 200 && same(man.ids, [L.tMan, L.oMan]), [man.status, [...man.ids]]);
const two = await list(tok.T, "&source=MANUAL,BOOKING"), rep = await list(tok.T, "&source=WEB_FORM&source=BOOKING");
ok("FO-4sf DW1 pass: two values return both (a comma list or the key twice)", same(two.ids, [L.tMan, L.oMan, L.tBook, L.oBook]) && same(rep.ids, [L.tWeb, L.oWeb, L.tBook, L.oBook]), [[...two.ids], [...rep.ids]]);
const none = await list(tok.T, ""), blank = await list(tok.T, "&source=");
ok("FO-4sf DW1 pass: no value (or an empty one) → every source, as before", same(none.ids, Object.values(L)) && same(blank.ids, Object.values(L)), [none.ids.size, blank.ids.size]);
const bad = await list(tok.T, "&source=MANUAL,FAX"), lower = await list(tok.T, "&source=manual");
const badBody = bad.body as { detail?: string; code?: string; allowed?: string[] };
ok("FO-4sf DW1 fail: an unknown value → 400 naming the allowed ones, and no rows", bad.status === 400 && badBody.code === "UNKNOWN_SOURCE" && /WEB_FORM, MANUAL, BOOKING/.test(badBody.detail ?? "") && /FAX/.test(badBody.detail ?? "") && badBody.allowed?.length === 3, bad.body);
ok("FO-4sf DW1 fail: a value in the wrong case is unknown too (400), never a silent match", lower.status === 400, lower.status);

// ------------------------------------------------------------------------------------------- DW2: inside FO-2v's visibility
await seesAll(false);   // own-only: FO-2v, all = view.all AND the setting on
const oMan = await list(tok.O, "&source=MANUAL"), oAll = await list(tok.O, "&source=MANUAL,WEB_FORM,BOOKING");
ok("FO-4sf DW2 pass: an own-only Case Officer filtering by MANUAL sees only their own manual lead", oMan.status === 200 && same(oMan.ids, [L.oMan]), [...oMan.ids]);
ok("FO-4sf DW2 fail: no filter widens it: every source chosen still shows none of the Case Manager's leads", same(oAll.ids, [L.oMan, L.oWeb, L.oBook]) && ![L.tWeb, L.tMan, L.tBook].some((x) => oAll.ids.has(x)), [...oAll.ids]);
const tOwn = await list(tok.T, "&source=BOOKING");
ok("FO-4sf DW2 pass: the setting off narrows the Case Manager too: only their own booking lead", same(tOwn.ids, [L.tBook]), [...tOwn.ids]);
const mine = await fetch(`${BASE}/api/front-office/leads?view=mine&source=WEB_FORM`, { headers: { authorization: `Bearer ${tok.O}` } }).then((r) => r.json()) as { id: string }[];
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
await p.goto(`${BASE}/front-office/leads?view=all`); await p.locator(`tr[data-lead-row="${numberOf(L.tBook)}"]`).waitFor({ timeout: 30_000 });
ok("FO-4sf DW3 pass: the Source filter sits beside the view chips with plain labels, none chosen", (await p.locator('[role="group"][aria-label="Source"] button').allInnerTexts()).join("|") === "Web form|Added by hand|Booking" && (await p.locator('[data-source][aria-pressed="true"]').count()) === 0);
await axe("FO-4sf Leads with the Source filter (1440 px)");
// Keyboard only: Tab to "Added by hand", Enter.
let reached = false;
for (let i = 0; i < 40 && !reached; i++) { await p.keyboard.press("Tab"); reached = await p.evaluate(() => document.activeElement?.getAttribute("data-source") === "MANUAL"); }
await p.keyboard.press("Enter");
await p.waitForURL(/source=MANUAL/, { timeout: 10_000 }); await p.locator(`tr[data-lead-row="${numberOf(L.tBook)}"]`).waitFor({ state: "detached", timeout: 15_000 });
const afterPick = await shown();
ok("FO-4sf DW3 pass (keyboard only): Tab reaches \"Added by hand\", Enter filters the list to the manual leads", reached && afterPick.has(numberOf(L.tMan)) && afterPick.has(numberOf(L.oMan)) && ![L.tWeb, L.tBook, L.oWeb, L.oBook].some((x) => afterPick.has(numberOf(x))), [...afterPick]);
await p.reload(); await p.locator(`tr[data-lead-row="${numberOf(L.tMan)}"]`).waitFor({ timeout: 30_000 });
const afterReload = await shown();
ok("FO-4sf DW3 pass: the choice survives a reload (?source= in the address, the chip still pressed)", (await p.locator('[data-source="MANUAL"][aria-pressed="true"]').count()) === 1 && !afterReload.has(numberOf(L.tBook)) && p.url().includes("view=all"), p.url());
await axe("FO-4sf Leads filtered by Added by hand");
await p.screenshot({ path: join(SHOTS, "leads-source-filter-1440.png"), fullPage: true });
for (const w of [1024, 375]) {
  await p.setViewportSize({ width: w, height: 800 });
  ok(`FO-4sf DW3 pass: no sideways page scroll at ${w} px`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await p.screenshot({ path: join(SHOTS, `leads-source-filter-${w}.png`), fullPage: true });
}
await axe("FO-4sf Leads filtered (375 px)"); await p.setViewportSize({ width: 1440, height: 900 });
await p.locator('[data-source-clear]').click(); await p.locator(`tr[data-lead-row="${numberOf(L.tBook)}"]`).waitFor({ timeout: 15_000 });
ok("FO-4sf DW3 pass: All sources clears the filter and the address", !p.url().includes("source=") && (await shown()).has(numberOf(L.oWeb)), p.url());
// Fail side: a hand-edited address with an unknown source is dropped (all sources shown), never an error page.
await p.goto(`${BASE}/front-office/leads?view=all&source=FAX`); await p.locator(`tr[data-lead-row="${numberOf(L.tBook)}"]`).waitFor({ timeout: 30_000 });
ok("FO-4sf DW3 fail: an unknown ?source= in the address is ignored: no chip pressed, every source listed, no error", (await p.locator('[data-source][aria-pressed="true"]').count()) === 0 && (await p.getByRole("alert").count()) === 0);
// Fail side: a source with no lead in this view says so and offers All sources.
sql(`update fo_lead set state = 'CLOSED' where firm_id = '${A}' and door = 'BOOKING' and state = 'OPEN'`);
await p.goto(`${BASE}/front-office/leads?view=all&source=BOOKING`); await p.locator("[data-empty]").waitFor({ timeout: 30_000 });
ok("FO-4sf DW3 fail: a source with no open lead says so in plain words and offers All sources", /No leads from Booking here/.test(await p.locator("[data-empty]").innerText()) && (await p.locator("[data-source-clear]").count()) === 1);
ok("FO-4sf: no page error in the browser", errors.length === 0, errors);
await db.$disconnect();
await browser.close();
process.exit(summary() ? 1 : 0);
