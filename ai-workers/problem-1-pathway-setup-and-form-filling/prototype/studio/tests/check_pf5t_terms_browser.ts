// PF-5t part 2 (Lead B's briefs PF-5t.md "Part 2, screens" and wave1-terms.md): the terms page and Settings → Terms in a
// real browser against part 1's real routes on the local stand-in (no fake API; one rewritten answer only for DW8, which
// the screens cannot reach by themselves). DW6 to DW9, a pass and a fail each. Publishes Sample versions (insert-only
// table) and, at the end, records them as accepted for every Sample person so the copy reruns clean. Wording and
// versions Sample. Unconfirmed: no counsel. US$0.
//   zsh studio/tools/isolated.sh screens_pf5tui 4544 start PLATFORM_IDENTITY=local && tsx studio/tests/check_pf5t_terms_browser.ts 4544 xr_studio_screens_pf5tui
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { ACCOUNT_SECTIONS, visibleSections } from "../web/src/modules/platform/account-sections.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4544), DBNAME = process.argv[3] ?? "xr_studio_screens_pf5tui";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "PF-5t", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const OWNER_ONLY = "Only an Owner can accept these terms for the firm.";   // part 1's words (terms/service.ts)
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const staffOf = (where: string) => { const [id, email, name] = sql(`select id || '|' || email || '|' || display_name from platform_staff where ${where}`).split("|"); return { id, email, name }; };
const R = staffOf("actor_id = 'user-R' and firm_id = (select id from platform_firm where key = 'sample-firm')");   // Owner + Case Manager
const O = staffOf("actor_id = 'user-O' and firm_id = (select id from platform_firm where key = 'sample-firm')");   // Case Officer
let n = 0;
/** Publishes a Sample version of a kind, current from a second ago; returns its id. */
const publish = (kind: string) => sql(`insert into platform_terms_version (id, kind, version, url, published_at) values (gen_random_uuid(), '${kind}', 'pf5t-ui-${run}-${++n}', 'https://example.com/sample-terms/${run}-${n}', now() - interval '1 second') returning id`);
const accepted = (staffId: string, versionId: string) => sql(`select count(*) from platform_terms_acceptance where staff_id = '${staffId}' and version_id = '${versionId}'`) === "1";
async function signIn(email: string) {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string };
  if (!b.token) throw new Error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`);
  return b.token;
}
const call = async (tok: string, path: string) => { const r = await fetch(`${BASE}/api${path}`, { headers: { authorization: `Bearer ${tok}` } }); return { status: r.status, body: await r.json() as any }; };   // eslint-disable-line @typescript-eslint/no-explicit-any -- read loosely, as the other checks
const browser: Browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function newPage(width = 1440, tok: string | null = null): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  if (tok) await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, tok);
  p.on("pageerror", (e) => errors.push(String(e)));
  return p;
}
const axe = async (name: string, p: Page) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`${name}: axe finds no serious or critical WCAG A/AA violation`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
const noSideways = async (name: string, p: Page) => ok(`${name}: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const termsPage = (p: Page) => p.locator("[data-terms-page]").waitFor({ timeout: 20_000 });
const items = (p: Page) => p.locator("[data-terms-item]").evaluateAll((els) => els.map((e) => e.getAttribute("data-terms-item")).sort());

const plan = sql(`select p.id || '|' || p.seats_limit from platform_subscription s join platform_plan p on p.id = s.plan_id join platform_firm f on f.id = s.firm_id where f.key = 'sample-firm' and s.status <> 'ENDED' limit 1`).split("|");
sql(`update platform_plan set seats_limit = ${Number(plan[1]) + 10} where id = '${plan[0]}'`);   // lent for Invite people, given back in the finally
try {
const pn1 = publish("PRIVACY_NOTICE"), tos1 = publish("TERMS_OF_SERVICE");

// ----------------------------------------------------------------- DW7 (and the non-Owner's rule): a Case Officer, pending
const oTok = await signIn(O.email);
for (const w of [375, 1024, 1440]) {
  const v = await newPage(w, oTok); await v.goto(`${BASE}/account`); await termsPage(v);
  if (w === 375) ok("PF-5t DW6 pass (part 1's rule): a Case Officer is asked only for the privacy notice, never the firm's terms of service", JSON.stringify(await items(v)) === '["PRIVACY_NOTICE"]', await items(v));
  await axe(`PF-5t DW7 terms page (${w} px)`, v); await noSideways(`PF-5t DW7 terms page (${w} px)`, v); await shot(v, `terms-page-${w}`);
  await v.context().close();
}

// ------------------------------------------------------------------------- DW8: a 403 from accept shows the server's words
{
  const f = await newPage(1440, oTok);
  // The screens never offer a non-Owner the firm's terms; this rewrites GET /me/terms so "I accept" sends the current
  // terms of service, as a person forcing it would. The server's answer is untouched.
  await f.route("**/api/platform/me/terms", (rt) => rt.fulfill({ json: { pending: [{ id: tos1, kind: "TERMS_OF_SERVICE", version: "forced", url: "https://example.com/x", publishedAt: new Date().toISOString() }], note: "Sample" } }));
  await f.goto(`${BASE}/account`); await termsPage(f);
  const answer = f.waitForResponse((r) => r.url().endsWith("/api/platform/me/terms/accept"));
  await f.locator("[data-terms-accept]").click();
  const res = await answer; await f.locator("[data-terms-error]").waitFor({ timeout: 10_000 });
  ok("PF-5t DW8 fail: a non-Owner forcing the firm's terms gets 403 and the page shows the server's words; nothing is recorded", res.status() === 403 && (await f.locator("[data-terms-error]").innerText()) === OWNER_ONLY && !accepted(O.id, tos1), await f.locator("[data-terms-error]").innerText());
  ok("PF-5t DW8 pass: after the 403 the person is still signed in on the terms page", (await f.locator("[data-terms-page]").count()) === 1 && (await call(oTok, "/platform/me")).status === 200);
  await f.context().close();
}

// ------------------------------------------------------------------------------------ DW7 keyboard: the Case Officer accepts
{
  const k = await newPage(1440, oTok); await k.goto(`${BASE}/account`); await termsPage(k);
  ok("PF-5t DW7 keyboard: the terms page takes the focus on its heading", (await k.evaluate(() => document.activeElement?.id)) === "pf-terms");
  let reached = false;
  for (let i = 0; i < 25 && !reached; i++) { await k.keyboard.press("Tab"); reached = await k.evaluate(() => document.activeElement?.hasAttribute("data-terms-accept") ?? false); }
  ok("PF-5t DW7 keyboard: Tab reaches the link and then I accept", reached);
  await k.keyboard.press("Enter"); await k.locator("[data-account]").waitFor({ timeout: 20_000 });
  ok("PF-5t DW7 keyboard pass: Enter on I accept records the privacy notice for that person and opens their Profile at the same address", accepted(O.id, pn1) && new URL(k.url()).pathname === "/account");
  await k.context().close();
}

// ------------------------------------------------------------------- DW6: the journey (publish, sign in, the page, accept)
const p = await newPage(1440);
await p.goto(`${BASE}/platform/team?view=invited`);
await p.getByLabel("Firm key").fill("sample-firm"); await p.getByLabel("Work email").fill(R.email); await p.getByRole("button", { name: "Sign in" }).click();
await termsPage(p);
const rTok = await p.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session")!).token as string);
const blocked = await call(rTok, "/platform/staff");
ok("PF-5t DW6 fail: while the Owner's terms are pending, Team's own call answers 428 TERMS_PENDING and the page is not shown", blocked.status === 428 && blocked.body.code === "TERMS_PENDING" && (await p.locator("[data-seat-line]").count()) === 0, blocked);
ok("PF-5t DW6 pass: the Owner's page lists each pending kind (privacy notice and terms of service) with its link", JSON.stringify(await items(p)) === '["PRIVACY_NOTICE","TERMS_OF_SERVICE"]' && (await p.locator("[data-terms-item] a").count()) === 2
  && (await p.locator("h1#pf-terms").innerText()).startsWith("We've updated our "), await items(p));
await shot(p, "terms-page-owner-1440");
await p.locator("[data-terms-accept]").click(); await p.locator("[data-seat-line]").waitFor({ timeout: 20_000 });
ok("PF-5t DW6 pass: I accept records both versions and the Owner carries on at the same address (Team, Invited chip)", accepted(R.id, pn1) && accepted(R.id, tos1) && new URL(p.url()).pathname === "/platform/team" && new URL(p.url()).searchParams.get("view") === "invited");
ok("PF-5t DW6 pass: the firm's call now answers 200", (await call(rTok, "/platform/staff")).status === 200);

// --------------------------------------------------------------------------------------------- Settings → Terms (list)
await p.locator('nav[aria-label="My account"] [data-account-section="/platform/terms"]').click();
await p.locator("[data-acceptance]").first().waitFor({ timeout: 20_000 });
const listed = (await call(rTok, "/platform/terms/acceptances?limit=50")).body.acceptances as { id: string; versionId: string; staffName: string }[];
const mine = listed.filter((a) => a.versionId === pn1 || a.versionId === tos1);
ok("PF-5t part 2 pass: Settings → Terms shows who accepted which version and when, as the API lists it (the Owner's two, the Case Officer's one)", mine.length === 3 && (await p.locator("[data-acceptance]").count()) === Math.min(listed.length, 50)
  && (await p.locator(`[data-acceptance="${mine[0].id}"]`).innerText()).includes(mine[0].staffName), mine);
await axe("PF-5t DW7 Settings → Terms (1440)", p); await noSideways("PF-5t DW7 Settings → Terms (1440)", p); await shot(p, "terms-acceptances-1440");
for (const w of [375, 1024]) {   // review m1
  const v = await newPage(w, rTok); await v.goto(`${BASE}/platform/terms`); await v.locator("[data-acceptance]").first().waitFor({ timeout: 20_000 });
  await axe(`PF-5t DW7 Settings → Terms (${w} px)`, v); await noSideways(`PF-5t DW7 Settings → Terms (${w} px)`, v); await shot(v, `terms-acceptances-${w}`); await v.context().close();
}
{
  const ok403 = await call(oTok, "/platform/terms/acceptances");
  const op = await newPage(1440, oTok); await op.goto(`${BASE}/platform/terms`);
  if (ok403.status === 403) {
    await op.locator("[data-terms-refused]").waitFor({ timeout: 20_000 });
    ok("PF-5t part 2 fail: a Case Officer opening Settings → Terms by its address sees the server's refusal, and has no Terms entry", (await op.locator("[data-terms-refused]").innerText()) === ok403.body.detail && (await op.locator('[data-account-section="/platform/terms"]').count()) === 0, ok403.body);
  } else {
    // On the Sample roles a Case Officer holds agent/settings:list (part 1's key): the list and its entry show.
    await op.locator("[data-acceptance], [data-terms-empty]").first().waitFor({ timeout: 20_000 });
    ok("PF-5t part 2 pass: a Case Officer, who holds agent/settings:list, sees the Terms entry and the same list", ok403.status === 200 && (await op.locator('nav[aria-label="My account"] [data-account-section="/platform/terms"]').count()) === 1
      && (await op.locator("[data-acceptance]").count()) === Math.min(ok403.body.acceptances.length, 50), ok403.status);
  }
  await op.context().close();
}

ok("PF-5t part 2 fail: the Terms entry is hidden from a person without agent/settings:list, shown with it", !visibleSections(ACCOUNT_SECTIONS, ["agent/staff:manage"]).some((x) => x.path === "/platform/terms")
  && visibleSections(ACCOUNT_SECTIONS, ["agent/settings:list"]).some((x) => x.path === "/platform/terms" && x.label === "Terms"));

// ------------------------------------------------------- a version published while signed in asks at the next move (428)
const pn2 = publish("PRIVACY_NOTICE");
await p.locator('nav[aria-label="My account"] [data-account-section="/account"]').click(); await termsPage(p);
ok("PF-5t DW6 pass: a privacy notice published while the Owner is signed in shows the terms page at their next click", JSON.stringify(await items(p)) === '["PRIVACY_NOTICE"]' && !accepted(R.id, pn2));
await p.locator("[data-terms-accept]").click(); await p.locator("[data-account]").waitFor({ timeout: 20_000 });
ok("PF-5t DW7 (review m2): after I accept, the focus moves to the returned page's heading", accepted(R.id, pn2) && (await p.evaluate(() => document.activeElement?.tagName === "H1" && document.activeElement.textContent === "Profile")));

// ------------------------------- review M1: a 428 from a call inside the page (no move) brings the terms page at once
// The first page of acceptances is given a next page (route rewrite), so "Show more" calls the server without a move.
await p.route((u) => u.pathname === "/api/platform/terms/acceptances" && !u.searchParams.has("cursor"), async (rt) => {
  const res = await rt.fetch(), json = await res.json() as { nextCursor: string | null; acceptances?: { id: string }[] };
  // PF-31 (Lead 13): with Terms kept open in its tab, the list is also read while terms are pending (428): only a list is rewritten.
  if (!res.ok || !json.acceptances?.length) { await rt.fulfill({ response: res }); return; }
  await rt.fulfill({ response: res, json: { ...json, nextCursor: json.acceptances[json.acceptances.length - 1].id } });
});
// PF-31 (Lead 13): Terms is still open in its workspace tab, so accepting above already read its list again, before this
// rewrite was in place; past the app's 2 s staleTime, bringing the tab forward reads it again (as the page's remount did).
await p.waitForTimeout(2_100);
await p.locator('nav[aria-label="My account"] [data-account-section="/platform/terms"]').click(); await p.locator("[data-terms-more]").waitFor({ timeout: 20_000 });
const pn3 = publish("PRIVACY_NOTICE");
const at = p.url(); await p.locator("[data-terms-more]").click(); await termsPage(p);
ok("PF-5t DW6 pass (review M1): a version published while on Settings → Terms shows the terms page when Show more answers 428, with no move", p.url() === at && JSON.stringify(await items(p)) === '["PRIVACY_NOTICE"]');
await p.locator("[data-terms-accept]").click(); await p.locator("[data-acceptance]").first().waitFor({ timeout: 20_000 });
ok("PF-5t DW6 pass: after I accept, Settings → Terms shows again at the same address, its refused page asked again", accepted(R.id, pn3) && p.url() === at && (await p.locator("[data-terms-page]").count()) === 0);
await p.unroute((u) => u.pathname === "/api/platform/terms/acceptances" && !u.searchParams.has("cursor"));
// ------------------------- break M2: what the person typed is kept when a 428 brings the terms page in the middle of an action
const E = `pf5t-${run}@example.com`;
await p.locator('nav[aria-label="My account"] [data-account-section="/platform/team"]').click(); await p.locator("[data-seat-line]").waitFor({ timeout: 20_000 });
await p.locator("[data-invite-open]").click(); await p.getByLabel("Email, person 1").fill(E);
const pn5 = publish("PRIVACY_NOTICE");
await p.locator("[data-send-invites]").click(); await termsPage(p);
await p.locator("[data-terms-accept]").click(); await p.locator("[data-terms-page]").waitFor({ state: "detached", timeout: 20_000 });
ok("PF-5t DW6 pass (break M2): after I accept, Invite people is still open with the email typed before", accepted(R.id, pn5) && (await p.getByLabel("Email, person 1").inputValue()) === E && (await p.getByLabel("Email, person 1").isVisible()));
await p.locator("[data-send-invites]").click();
for (let i = 0; i < 100 && sql(`select count(*) from platform_invitation where email = '${E}'`) === "0"; i++) await p.waitForTimeout(100);
ok("PF-5t DW6 pass (break M2): sending it again then makes the invitation", sql(`select count(*) from platform_invitation where email = '${E}'`) === "1");
await p.keyboard.press("Escape"); await p.keyboard.press("Escape");

// -------------------------------------------------- break M1: GET /me/terms failing while terms are pending never loops
{
  const pn6 = publish("PRIVACY_NOTICE"); void pn6;
  const lp = await newPage(1440, rTok); let calls = 0;
  await lp.route("**/api/platform/me/terms", (rt) => { calls++; return rt.fulfill({ status: 500, json: { title: "Broken", detail: "Something went wrong on our side. Please try again." } }); });
  await lp.goto(`${BASE}/platform/team`); await lp.waitForTimeout(3000);
  const first = calls; await lp.waitForTimeout(2000);
  ok("PF-5t DW6 fail (break M1): with GET /me/terms failing and terms pending, the page asks it a few times at most and stops (no loop)", first <= 5 && calls === first && (await lp.locator("[data-team-refused]").count()) === 1, { first, calls });
  await lp.context().close();
}
const pn4 = publish("PRIVACY_NOTICE");
await p.locator('nav[aria-label="My account"] [data-account-section="/account"]').click(); await termsPage(p);

// ------------------------------------------------------------------------- DW9: Sign out from the terms page while pending
await p.locator("[data-terms-sign-out]").click(); await p.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 15_000 });
ok("PF-5t DW9 pass: Sign out on the terms page ends the session (the sign-in card shows; the old token answers 401)", (await call(rTok, "/platform/me")).status === 401);
ok("PF-5t DW9 fail: signing out accepted nothing", !accepted(R.id, pn4));
ok("PF-5t: no page error in any browser", errors.length === 0, errors);
} finally {
  sql(`update platform_plan set seats_limit = ${Number(plan[1])} where id = '${plan[0]}'`);
  // Every Sample person accepts this run's privacy notices and each firm's Owner its firm terms, so the copy (and a rerun) is not left asking (the table is insert-only).
  sql(`insert into platform_terms_acceptance (id, firm_id, staff_id, version_id, accepted_at) select gen_random_uuid(), s.firm_id, s.id, v.id, now() from platform_staff s cross join platform_terms_version v where v.version like 'pf5t-ui-${run}-%' and v.kind = 'PRIVACY_NOTICE' on conflict do nothing`);
  sql(`insert into platform_terms_acceptance (id, firm_id, staff_id, version_id, accepted_at) select distinct on (g.firm_id, v.id) gen_random_uuid(), g.firm_id, g.staff_id, v.id, now() from platform_role_grant g cross join platform_terms_version v where g.role = 'OWNER' and g.ended_at is null and v.version like 'pf5t-ui-${run}-%' and v.kind <> 'PRIVACY_NOTICE' and not exists (select 1 from platform_terms_acceptance a where a.firm_id = g.firm_id and a.version_id = v.id) on conflict do nothing`);
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
