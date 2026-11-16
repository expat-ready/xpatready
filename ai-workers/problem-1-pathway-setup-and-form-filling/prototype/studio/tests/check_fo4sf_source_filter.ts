// FO-4sf (R1.27; AG-2-23 rule 1 "filters on leads: … source"; brief design/lead-b-briefs/FO-4sf.md rev 16.63): the lead
// list's Source filter, through the real route and in a real browser. `?source=` takes the stored arrival doors
// (WEB_FORM, MANUAL, BOOKING), one or more; it narrows inside FO-2v's visibility and never widens it; an unknown value
// → 400 naming the allowed ones. On Leads, a Source filter beside the chips, kept in the address. One named case per
// Done when line, a pass and a fail each: DW1 the route, DW2 own-only, DW3 the browser (keyboard only, axe-core, 375,
// 1024, 1440, a reload). Seeds the Sample firms itself (PF-3, then FO-1a). No model call (US$0).
//   zsh studio/tools/isolated.sh runtime_fo4sf 4533 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo4sf_source_filter.ts 4533 xr_studio_runtime_fo4sf
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4533), DBNAME = process.argv[3] ?? "xr_studio_runtime_fo4sf";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "fo-4-sales", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();   // psql prints "INSERT 0 1" after a RETURNING row
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
ok("FO-4sf setup: the Sample firm and its front office are seeded", !!A && fo.failed.length === 0, fo.failed);
await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:FO-4sf-test", workspaceId: await platformAuditWorkspaceId(db), reason: "FO-4sf test" });
const staffOf = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
const T = staffOf("user-T"), O = staffOf("user-O");   // Case Manager, Case Officer; with the setting off both see only their own
let n = 0;
/** One lead through a given door, owned by a given person (a booking lead is written as FO-3's door will write it). */
const lead = (door: string, owner: string, source: string) => {
  const given = `Src${++n}${run}`;
  const p = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', '${given}', 'Sample', 'fo4sf.${n}.${run}@example.com', 'test', now()) returning id`);
  const id = sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values (gen_random_uuid(), '${A}', '${p}', '${door}', '${source}', '${owner}', 'test', now()) returning id`);
  return { id, given, door };
};
const tWeb = lead("WEB_FORM", T.id, "WEBSITE"), tMan = lead("MANUAL", T.id, "Phone call (Sample)"), tBook = lead("BOOKING", T.id, "Booking page (Sample)"), tMan2 = lead("MANUAL", T.id, "Referral (Sample)");
const oMan = lead("MANUAL", O.id, "Walk-in (Sample)"), oWeb = lead("WEB_FORM", O.id, "WEBSITE");
const mine = new Set([tWeb, tMan, tBook, tMan2, oMan, oWeb].map((l) => l.id));
async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tokens = { T: await signIn(T.email), O: await signIn(O.email) };
const list = async (tok: string, query: string) => {
  const r = await fetch(`${BASE}/api/front-office/leads?${query}`, { headers: { authorization: `Bearer ${tok}` } });
  const body = await r.json() as unknown;
  return { status: r.status, body, ids: Array.isArray(body) ? new Set((body as { id: string }[]).map((l) => l.id).filter((id) => mine.has(id))) : new Set<string>() };
};
const same = (a: Set<string>, b: { id: string }[]) => a.size === b.length && b.every((x) => a.has(x.id));
const doorOf = (id: string) => sql(`select door from fo_lead where id = '${id}'`);

// ------------------------------------------------------------------------------------------- DW1 the route
const man = await list(tokens.T, "view=all&source=MANUAL");
ok("FO-4sf DW1 pass: source=MANUAL returns only manual leads (the web-form and booking leads left out)", man.status === 200 && same(man.ids, [tMan, tMan2])
  && (man.body as { id: string }[]).every((l) => doorOf(l.id) === "MANUAL"), { status: man.status, n: man.ids.size });
const two = await list(tokens.T, "view=all&source=MANUAL,BOOKING"), rep = await list(tokens.T, "view=all&source=WEB_FORM&source=BOOKING");
ok("FO-4sf DW1 pass: two values return both (comma-separated, or the parameter repeated)", same(two.ids, [tMan, tMan2, tBook]) && same(rep.ids, [tWeb, tBook]), { two: two.ids.size, rep: rep.ids.size });
const none = await list(tokens.T, "view=all");
ok("FO-4sf DW1 pass: no value → every source, as before", same(none.ids, [tWeb, tMan, tBook, tMan2]), none.ids.size);
const bad = await list(tokens.T, "view=all&source=MANUAL,FAX"), lower = await list(tokens.T, "view=all&source=manual");
const bd = bad.body as { detail?: string; allowed?: string[]; fields?: Record<string, string> };
ok("FO-4sf DW1 fail: an unknown value → 400 naming it and the allowed ones, no rows", bad.status === 400 && !Array.isArray(bad.body) && /FAX/.test(bd.detail ?? "")
  && ["WEB_FORM", "MANUAL", "BOOKING"].every((s) => bd.detail!.includes(s) && bd.allowed?.includes(s)) && !!bd.fields?.source, bad.body);
ok("FO-4sf DW1 fail: a value in the wrong case is unknown too (the stored codes only) → 400", lower.status === 400, lower.status);

// ------------------------------------------------------------------------------------------- DW2 own-only
const oM = await list(tokens.O, "view=all&source=MANUAL"), oAll = await list(tokens.O, "view=all&source=WEB_FORM,MANUAL,BOOKING");
ok("FO-4sf DW2 pass: an own-only Case Officer filtering by source sees only their own leads of that source", oM.status === 200 && same(oM.ids, [oMan]), [...oM.ids]);
ok("FO-4sf DW2 fail: every source chosen never shows another person's lead (the Case Manager's four stay out)", same(oAll.ids, [oMan, oWeb]) && ![tWeb, tMan, tBook, tMan2].some((l) => oAll.ids.has(l.id)), [...oAll.ids]);
const oMine = await list(tokens.O, "view=mine&source=BOOKING");
ok("FO-4sf DW2 fail: Mine filtered by a source they hold none of is empty, never someone else's", oMine.status === 200 && oMine.ids.size === 0, [...oMine.ids]);

// ------------------------------------------------------------------------------------------- DW3 the browser
const browser: Browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function pageAs(tok: string, width: number): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((t) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })), tok);
  p.on("pageerror", (e) => errors.push(String(e))); return p;
}
const axe = async (name: string, p: Page) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  ok(`${name}: axe finds no WCAG A/AA violation`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
const noSideways = async (name: string, p: Page) => ok(`${name}: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
const shown = async (p: Page) => { await p.locator("tr[data-lead-row], [data-empty]").first().waitFor({ timeout: 20_000 });
  const numbers = await p.locator("tr[data-lead-row]").evaluateAll((rs) => rs.map((r) => r.getAttribute("data-lead-row") ?? ""));
  return new Set(numbers.map((num) => sql(`select id from fo_lead where firm_id = '${A}' and number = '${num}'`)).filter((id) => mine.has(id))); };
const allDoors = async (p: Page, door: string) => { const numbers = await p.locator("tr[data-lead-row]").evaluateAll((rs) => rs.map((r) => r.getAttribute("data-lead-row") ?? ""));
  return numbers.every((num) => sql(`select door from fo_lead where firm_id = '${A}' and number = '${num}'`) === door); };
/** Keyboard only: Tab from the top of the page to the control, then Space. */
async function press(p: Page, selector: string) {
  await p.locator("body").focus();
  for (let i = 0; i < 60; i++) { await p.keyboard.press("Tab"); if (await p.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) { await p.keyboard.press("Space"); return true; } }
  return false;
}
for (const width of [1440, 1024, 375]) {
  const p = await pageAs(tokens.T, width);
  await p.goto(`${BASE}/front-office/leads?view=all`); await p.getByRole("heading", { name: "Leads" }).waitFor({ timeout: 30_000 });
  await p.locator("[data-source-filter]").waitFor({ timeout: 20_000 });
  const before = await shown(p);
  ok(`FO-4sf DW3 (${width} px) fail: before a choice, no source is pressed and every source shows`, same(before, [tWeb, tMan, tBook, tMan2]) && (await p.locator('[data-source][aria-pressed="true"]').count()) === 0, before.size);
  const reached = await press(p, '[data-source="MANUAL"]');
  await p.waitForURL(/source=MANUAL/, { timeout: 10_000 }).catch(() => undefined);
  await p.waitForFunction(() => !!document.querySelector('[data-source="MANUAL"][aria-pressed="true"]'), undefined, { timeout: 10_000 }).catch(() => undefined);
  await p.waitForTimeout(300);
  const after = await shown(p);
  ok(`FO-4sf DW3 (${width} px) pass: chosen by keyboard, "Added by staff" filters the list to manual leads and is kept in the address`,
    reached && new URL(p.url()).searchParams.get("source") === "MANUAL" && new URL(p.url()).searchParams.get("view") === "all" && same(after, [tMan, tMan2]) && await allDoors(p, "MANUAL"), { reached, url: p.url(), n: after.size });
  await axe(`FO-4sf DW3 Leads filtered (${width} px)`, p); await noSideways(`FO-4sf DW3 Leads filtered (${width} px)`, p);
  await p.screenshot({ path: join(SHOTS, `leads-source-filter-${width}.png`), fullPage: true });
  await p.reload(); await p.locator("[data-source-filter]").waitFor({ timeout: 20_000 });
  const reloaded = await shown(p);
  ok(`FO-4sf DW3 (${width} px) pass: the filter survives a reload`, same(reloaded, [tMan, tMan2]) && (await p.locator('[data-source="MANUAL"]').getAttribute("aria-pressed")) === "true", reloaded.size);
  if (width !== 1440) { await p.context().close(); continue; }
  // 1440 only: a second source adds to the first; Clear source shows every source again; a bad address value is dropped.
  await press(p, '[data-source="BOOKING"]'); await p.waitForURL(/source=MANUAL%2CBOOKING|source=MANUAL,BOOKING/, { timeout: 10_000 }).catch(() => undefined); await p.waitForTimeout(300);
  const both = await shown(p);
  ok("FO-4sf DW3 pass: a second source by keyboard shows both, in the address", same(both, [tMan, tMan2, tBook]) && new URL(p.url()).searchParams.get("source") === "MANUAL,BOOKING", { url: p.url(), n: both.size });
  await press(p, "[data-source-clear]"); await p.waitForFunction(() => !location.search.includes("source="), undefined, { timeout: 10_000 }).catch(() => undefined); await p.waitForTimeout(300);
  const cleared = await shown(p);
  ok("FO-4sf DW3 fail: Clear source (keyboard) leaves the address and every source shows again", !new URL(p.url()).searchParams.has("source") && same(cleared, [tWeb, tMan, tBook, tMan2]), { url: p.url(), n: cleared.size });
  await p.goto(`${BASE}/front-office/leads?view=all&source=FAX`); await p.locator("[data-source-filter]").waitFor({ timeout: 20_000 });
  const junk = await shown(p);
  ok("FO-4sf DW3 fail: an unknown source in the address is dropped (no error, every source shows)", same(junk, [tWeb, tMan, tBook, tMan2]) && (await p.getByRole("alert").count()) === 0, junk.size);
  const o = await pageAs(tokens.O, 1440);
  await o.goto(`${BASE}/front-office/leads?view=all&source=MANUAL`); await o.locator("[data-source-filter]").waitFor({ timeout: 20_000 });
  const oSeen = await shown(o);
  ok("FO-4sf DW3 fail (DW2 on the screen): the own-only Case Officer filtered to manual sees only their own", same(oSeen, [oMan]), oSeen.size);
  await o.context().close(); await p.context().close();
}
ok("FO-4sf: no page error in the browser", errors.length === 0, errors);
await db.$disconnect();
await browser.close();
process.exit(summary() ? 1 : 0);
