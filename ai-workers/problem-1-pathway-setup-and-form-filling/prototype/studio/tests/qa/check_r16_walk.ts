// qa, R1.6 (map row 6) gate A by screens, written ahead of PF-6 part 2a (Team, Invite people with Compare roles, the
// Person panel; brief lead-b-briefs/PF-6p2.md on lead-b-front-office). Until that part is on main the walk SKIPs (exit 0,
// one "SKIP" line naming what is missing), so it can sit in tests/qa/ without failing anyone's run.
// When the screens land, the walk, by screens only, as a person would (P-348 (3)):
//   W1 the Owner signs in through the staff sign-in card and opens Team (the Owner holds agent/staff:manage);
//   W2 Invite people → Compare roles: money keys and licence actions are shown in their own groups, never as one tick
//      with other keys (PF-6 DW3, R1.6 "money and licence apart");
//   W3 the Owner invites a new person as Billing/Finance; the Person panel's Invitation shows it pending;
//   W4 a Case Officer typing /platform/team is refused on screen in words, and GET /api/platform/staff answers 403
//      (PF-6 DW4, R1.6 "wrong role by URL refused on screen and API");
//   W5 axe WCAG 2.2 AA clean on Team and the refusal; no sideways scroll at 400 and 1024 px;
//   ends at R1.5's next step: the invitation exists for the invitee to accept (the accept page is part 2b).
// The selectors follow the concept (screens/pf-6-staff/concept.md r2); a builder's different words are a finding to
// reconcile, not a reason to loosen the walk. Run from prototype/ (never :4400):
//   zsh studio/tools/isolated.sh qar16w 4477 start --ttl 20 PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on \
//     && trap 'zsh studio/tools/isolated.sh qar16w 4477 stop' EXIT \
//     && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_r16_walk.ts 4477 xr_studio_qar16w
// Sample rows only; US$0, no model call.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, type Page } from "playwright";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4477), DBNAME = process.argv[3] ?? "xr_studio_qar16w", BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const emailOf = (actor: string) => sql(`select email from platform_staff where actor_id = '${actor}'`);

const browser = await chromium.launch(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {});
const signIn = async (email: string, path: string) => {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`${BASE}${path}`);
  const card = await page.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 20_000 }).then(() => true, () => false);
  if (!card) return null;   // the route does not exist yet: the app shows no sign-in card for it
  await page.getByLabel("Firm key").fill("sample-firm"); await page.getByLabel("Work email").fill(email); await page.keyboard.press("Enter");
  return page;
};
const axeClean = async (p: Page) => (await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => v.id);

const ownerOrNull = await signIn(emailOf("user-R"), "/platform/team");
const team = ownerOrNull?.getByRole("heading", { name: "Team", level: 1 });
const present = !!team && await team.waitFor({ timeout: 20_000 }).then(() => true, () => false);
if (!present) {
  console.log("SKIP  R1.6 walk: /platform/team shows no \"Team\" heading on this commit; PF-6 part 2a (Team, Invite people, the Person panel) is not on main. Parts missing: PF-6 part 2a, J-6 part 2.");
  await browser.close();
  process.exit(0);
}
const owner = ownerOrNull!;
ok("W1 the Owner signs in and Team opens", true);
await owner.getByRole("button", { name: /Invite people/i }).click();
await owner.getByRole("button", { name: /Compare roles/i }).click();
const money = owner.getByRole("group", { name: /money/i }), licence = owner.getByRole("group", { name: /licen/i });
ok("W2 Compare roles shows money keys in their own group", await money.count() > 0);
ok("W2 Compare roles shows licence actions in their own group", await licence.count() > 0);
await owner.keyboard.press("Escape");
const invitee = `qa.r16w.${Date.now().toString(36)}@example.com`;
await owner.getByLabel(/Work email/i).first().fill(invitee);
await owner.getByLabel(/Role/i).first().selectOption({ label: "Billing/Finance" }).catch(() => owner.getByRole("checkbox", { name: /Billing\/Finance/ }).check());
await owner.getByRole("button", { name: /^Send invitation|^Invite$/i }).click();
await owner.getByRole("row", { name: new RegExp(invitee.replace(/[.+]/g, "\\$&")) }).first().waitFor({ timeout: 20_000 });
ok("W3 the invitation shows on Team as pending", (await owner.getByRole("row", { name: new RegExp(invitee.replace(/[.+]/g, "\\$&")) }).first().innerText()).match(/Invited|Pending/i) !== null);
ok("W3 the invitation exists underneath, for Billing/Finance", sql(`select roles::text from platform_invitation where email = '${invitee}'`) === "{BILLING_FINANCE}");
ok("W5 axe clean on Team", (await axeClean(owner)).length === 0);

const officer = (await signIn(emailOf("user-O"), "/platform/team"))!;
await officer.waitForLoadState("networkidle");
const body = await officer.locator("main").innerText().catch(() => "");
ok("W4 a Case Officer typing /platform/team sees no Team and is told why in words", !(await officer.getByRole("heading", { name: "Team", level: 1 }).count()) && /not allowed|permission|can't|cannot/i.test(body), body.slice(0, 160));
const tok = await officer.evaluate(() => Object.values(sessionStorage).concat(Object.values(localStorage)).find((v) => /^[A-Za-z0-9._-]{20,}$/.test(v)) ?? "");
const api = await fetch(`${BASE}/api/platform/staff`, { headers: tok ? { authorization: `Bearer ${tok}` } : {} });
ok("W4 the same person's GET /api/platform/staff answers 403 (401 if no token was found in the page)", api.status === 403 || (!tok && api.status === 401), api.status);
ok("W5 axe clean on the refusal", (await axeClean(officer)).length === 0);
for (const w of [400, 1024]) {
  await owner.setViewportSize({ width: w, height: 900 }); await owner.goto(`${BASE}/platform/team`); await team!.waitFor();
  ok(`W5 Team at ${w} px has no sideways scroll`, await owner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
}
await browser.close();
process.exit(summary() ? 1 : 0);
