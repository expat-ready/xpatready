// FO-4 part 2b (concept screens/fo-4-sales r2 §4 screen 4; R1.76 j_76 W8's prospect page): the prospect page's Notes,
// calls and timeline, walked like a person in a browser at 1440 px and 375 px, with axe (WCAG 2.2 AA), and the data
// checked underneath. Named cases, each a pass and a fail:
//   PA1 Add a note: it shows first on the timeline with who and when, stored once in fo_note; an empty note is not sent
//       ("Write the note first."), 5,001 characters are refused on the box
//   PA2 Log a call: the panel needs "How it went"; logged, the call shows on the timeline in words and is stored once
//   PA3 the timeline reads newest first in plain words (no staff id, no audit summary); "Engaged as a prospect" shows
//   PA4 firm B's note never shows on firm A's prospect; firm B opening A's prospect sees no line
//   PA5 without agent/prospect:edit there is no Add note; without agent/prospect:log-call no Log a call
//   PA6 (round 1) the page's own Move adds its line to the timeline without a reload; a long note reads in full after
//       "Show all of it"; the Log a call panel gives focus back to its button, and asks before throwing typed data away
// Firm keys are put back at the end. No model call, US$0, never :4400.
//   zsh studio/tools/isolated.sh fo4p2b 4433 start AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on && tsx studio/tests/check_fo4p2b_prospect_activity_browser.ts 4433 xr_studio_fo4p2b
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

// The port and the copy's database, as run-suites.sh passes them (a lane prefix renames both).
const PORT = Number(process.argv[2] ?? 4433), DBNAME = process.argv[3] ?? "xr_studio_fo4p2b";
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the journeys
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const x = await r.text(); let b: unknown = x; try { b = JSON.parse(x); } catch { /* text */ } return { status: r.status, body: b };
};
const run = Date.now().toString(36);
const removed: [string, string][] = [];
const takeKey = (role: string, key: string) => { const n = sql(`with d as (delete from platform_role_permission where role = '${role}' and permission_key = '${key}' returning 1) select count(*) from d`); if (n !== "0") removed.push([role, key]); };
const putBack = () => { for (const [role, key] of removed.splice(0)) sql(`insert into platform_role_permission (role, permission_key) values ('${role}', '${key}') on conflict do nothing`); };
const browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });

try {
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  const staff = (actor: string) => { const [id, email, name] = sql(`select id || '|' || email || '|' || display_name from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email, name }; };
  const R = staff("user-R"), S = staff("user-S"), O = staff("user-O");
  const signIn = async (firmKey: string, email: string) => (await api(null, "POST", "/platform/session/local", { firmKey, email, secondStep: true })).body?.token as string;
  const tA = await signIn("sample-firm", R.email), tB = await signIn("sample-solo", S.email), tO = await signIn("sample-firm", O.email);
  const prospectFor = async (t: string, given: string) => {
    const lead = await api(t, "POST", "/front-office/leads", { requestId: randomUUID(), source: "Phone call", givenNames: given, familyName: "Sample", email: `${given.toLowerCase()}@example.org`, confirmedNew: true });
    await api(t, "POST", `/front-office/leads/${lead.body?.id}/engage`);
    return sql(`select coalesce(max(id::text), '') from fo_prospect where lead_id = '${lead.body?.id}'`);
  };
  const PA = await prospectFor(tA, `Noor${run}`), PB = await prospectFor(tB, `Lina${run}`);
  const bNote = await api(tB, "POST", `/front-office/prospects/${PB}/notes`, { text: `Firm B note ${run}` });
  ok("setup: both Sample firms' front office, a prospect each, firm B's note on its own", fo.failed.length === 0 && !!tA && !!tB && !!tO && !!PA && !!PB && bNote.status === 201, fo.failed);

  for (const width of [1440, 375]) {
    const first = width === 1440;
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    let token = tA;
    await ctx.addInitScript(() => { const t = (window as unknown as { __t?: string }).__t; void t; });
    const p = await ctx.newPage(); const errors: string[] = []; p.on("pageerror", (e) => errors.push(String(e)));
    const as = async (t: string) => { token = t; await p.goto(BASE); await p.evaluate((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_000_000 })), token); };
    const section = p.locator("[data-prospect-activity]");
    const open = async () => { await p.goto(`${BASE}/front-office/prospects/${PA}`); await section.waitFor({ timeout: 60000 }); await section.locator("[data-prospect-line]").first().waitFor({ timeout: 30000 }); };
    const axe = async (what: string, scope = "[data-prospect-activity]") => { const r = await new AxeBuilder({ page: p }).include(scope).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze(); ok(`axe (WCAG 2.2 AA) at ${width}: ${what}`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)); };
    await as(tA); await open();
    if (first) {
      // ---- PA3 ------------------------------------------------------------------------------------------------------
      const text0 = await section.innerText();
      ok("PA3 pass: the timeline shows \"Engaged as a prospect\" with who (the Owner's name) and when", /Engaged as a prospect/.test(text0) && text0.includes(R.name));
      ok("PA3 fail: no staff id and no audit summary on the page (\"Staff <id> …\")", !text0.includes(R.id) && !/Staff [0-9a-f]{8}-/.test(text0));
      await axe("the section, a new prospect");
      // ---- PA1 ------------------------------------------------------------------------------------------------------
      const n0 = sql(`select count(*) from fo_note where prospect_id = '${PA}'`);
      await section.locator("[data-prospect-note-add]").click();
      ok("PA1 fail: Add on an empty note says \"Write the note first.\" and sends nothing", /Write the note first\./.test(await section.innerText()) && sql(`select count(*) from fo_note where prospect_id = '${PA}'`) === n0);
      await section.locator("[data-prospect-note-text]").fill("x".repeat(5001));
      ok("PA1 fail: 5,001 characters are refused on the box with the count, Add note disabled", /Keep the note to 5,000 characters \(5,001 now\)\./.test(await section.innerText()) && await section.locator("[data-prospect-note-add]").isDisabled());
      const words = `Sample prospect note ${run}: asked about fees`;
      await section.locator("[data-prospect-note-text]").fill(words);
      await section.locator("[data-prospect-note-add]").dblclick();
      await section.locator("[data-prospect-line='NOTE']").first().filter({ hasText: words }).waitFor({ timeout: 30000 });
      ok("PA1 pass: the note shows first on the timeline with who and when, and the box is empty again", (await section.locator("[data-prospect-line]").first().innerText()).includes(words) && (await section.locator("[data-prospect-note-text]").inputValue()) === "");
      ok("PA1 pass: fo_note holds it once, on firm A's prospect, by the Owner", sql(`select count(*) || '|' || min(by_actor) from fo_note where prospect_id = '${PA}' and text = '${words}'`) === `1|staff:${R.id}`);
      // ---- PA2 ------------------------------------------------------------------------------------------------------
      await section.locator("[data-log-call]").click();
      const panel = p.getByRole("dialog");
      await panel.waitFor();
      await panel.locator("[data-log-call-save]").click();
      ok("PA2 fail: Log the call with no outcome says \"Choose how the call went.\" and logs nothing", /Choose how the call went\./.test(await panel.innerText()) && sql(`select count(*) from fo_call where prospect_id = '${PA}'`) === "0");
      await axe("the Log a call panel with its error", "[role=dialog]");
      await panel.locator("[data-log-call-outcome]").selectOption("LEFT_VOICEMAIL");
      await panel.getByLabel("Notes (optional)").fill(`Call notes ${run}`);
      await panel.locator("[data-log-call-save]").click();
      await panel.waitFor({ state: "detached", timeout: 30000 });
      await section.locator("[data-prospect-line='CALL']").first().waitFor({ timeout: 30000 });
      ok("PA2 pass: the call shows on the timeline in words (Outgoing call: left a voicemail) and is stored once", /Outgoing call: left a voicemail/.test(await section.locator("[data-prospect-line='CALL']").first().innerText()) && sql(`select count(*) || '|' || min(outcome::text) from fo_call where prospect_id = '${PA}'`) === "1|LEFT_VOICEMAIL");
      const ats = await section.locator("[data-prospect-line] time").evaluateAll((els) => els.map((e) => e.getAttribute("datetime") ?? ""));
      ok("PA3 pass: newest first", ats.every((a, i) => i === 0 || ats[i - 1] >= a), ats);
      await axe("the section with a note and a call");
      // ---- PA6 (round 1 fixes) ----------------------------------------------------------------------------------------
      const linesBefore = await section.locator("[data-prospect-line]").count();
      await p.locator("[data-move]").first().click();
      await p.locator("[data-move-to]").first().click();
      const moved = await p.waitForFunction(([n]) => document.querySelectorAll("[data-prospect-activity] [data-prospect-line]").length > n, [linesBefore], { timeout: 15000 }).then(() => true, () => false);
      ok("PA6 fail (review M1): the page's own Move adds its line to the timeline without a reload", moved && /Moved to another stage/.test(await section.locator("[data-prospect-line]").first().innerText()));
      const longText = Array.from({ length: 12 }, (_, i) => `Line ${i + 1} of a long note ${run}`).join("\n");
      await section.locator("[data-prospect-note-text]").fill(longText);
      await section.locator("[data-prospect-note-add]").click();
      const longLine = section.locator("[data-prospect-line='NOTE']").filter({ hasText: `Line 1 of a long note ${run}` }).first();
      await longLine.waitFor({ timeout: 30000 });
      ok("PA6 pass: after a save, focus is back in the note box and a polite line says so", await section.locator("[data-prospect-note-text]").evaluate((e) => e === document.activeElement) && /Note added\./.test(await section.locator("[data-prospect-said]").innerText()));
      const clamped = async () => longLine.locator("[data-prospect-words]").evaluate((e) => e.scrollHeight > e.clientHeight + 2);
      ok("PA6 fail (review M2, break M3): a 12-line note starts folded, with \"Show all of it\"", await clamped() && (await longLine.locator("[data-prospect-show-more]").count()) === 1);
      await longLine.locator("[data-prospect-show-more]").click();
      ok("PA6 pass: \"Show all of it\" shows every line", !(await clamped()));
      await section.locator("[data-log-call]").focus();
      await p.keyboard.press("Enter");
      await p.getByRole("dialog").waitFor();
      await p.keyboard.press("Escape");
      await p.getByRole("dialog").waitFor({ state: "detached", timeout: 10000 });
      await p.waitForFunction(() => document.activeElement?.hasAttribute("data-log-call"), null, { timeout: 5000 }).catch(() => undefined);
      ok("PA6 fail (break M1, review M3): Escape closes the empty panel and focus is back on Log a call", await section.locator("[data-log-call]").evaluate((e) => e === document.activeElement));
      await section.locator("[data-log-call]").click();
      const dlg = p.getByRole("dialog");
      await dlg.locator("[data-log-call-outcome]").selectOption("CONNECTED");
      await dlg.getByLabel("Notes (optional)").fill("typed, not saved");
      p.once("dialog", (d) => void d.dismiss());
      await p.keyboard.press("Escape");
      await p.waitForTimeout(400);
      ok("PA6 fail (break M2): Escape with typed data asks first; on No the panel stays with what was typed", (await dlg.count()) === 1 && (await dlg.getByLabel("Notes (optional)").inputValue()) === "typed, not saved");
      p.once("dialog", (d) => void d.accept());
      await p.keyboard.press("Escape");
      await dlg.waitFor({ state: "detached", timeout: 10000 });
      ok("PA6 pass: on Yes it closes and logs nothing", sql(`select count(*) from fo_call where prospect_id = '${PA}'`) === "1");
    }
    // ---- PA4 ------------------------------------------------------------------------------------------------------------
    ok(`PA4 fail at ${width}: firm B's note never shows on firm A's prospect`, !(await section.innerText()).includes(`Firm B note ${run}`));
    ok(`no sideways scroll at ${width}`, !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
    if (process.env.SHOTS) await section.screenshot({ path: `${process.env.SHOTS}/prospect-activity-${width}.png` });
    // ---- PA5: keys --------------------------------------------------------------------------------------------------
    takeKey("CASE_OFFICER", "agent/prospect:edit"); takeKey("CASE_OFFICER", "agent/prospect:log-call");
    await as(tO);
    await p.goto(`${BASE}/front-office/prospects/${PA}`);
    const seen = await section.waitFor({ timeout: 30000 }).then(() => true, () => false);
    ok(`PA5 fail at ${width}: without agent/prospect:edit and :log-call, no Add note and no Log a call (the timeline still reads, or the page is refused)`, !seen || ((await section.locator("[data-prospect-note-text]").count()) === 0 && (await section.locator("[data-log-call]").count()) === 0), { seen });
    putBack();
    // ---- PA4: firm B on A's prospect ----------------------------------------------------------------------------------
    await as(tB);
    await p.goto(`${BASE}/front-office/prospects/${PA}`);
    await p.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 30000 }).catch(() => undefined);
    ok(`PA4 fail at ${width}: firm B opening A's prospect sees none of its lines`, (await p.locator("[data-prospect-line]").count()) === 0 && !(await p.content()).includes(`Sample prospect note ${run}`));
    ok(`no page error at ${width}`, errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }
} finally {
  putBack();
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
