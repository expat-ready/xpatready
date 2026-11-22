// PF-18s part 3 (concept screens/PF-18s §4 board A, approved by Lead 19 on #2332 with the challenge's Majors; AG-16-10, AG-16 §3.3;
// R1.92): My account → Notifications walked in a browser on an isolated copy (its own database and port, never :4400), with the API and
// the database read underneath. Each line has a pass and a fail:
//   DN1 only the groups that reach the person: the Case Officer sees groups 1-5 (plus Payments: the Sample Case Officer holds
//       agent/invoice:list) and the security row "Always on" with no control; fail: Team watch and Firm and connections absent for
//       them, present for the Owner (every group the API gives);
//   DN2 change a setting, reload, it stays: Mentions email off → Save → one saved row → reload shows it off; fail: Save is disabled
//       with no change, and the unchanged groups are not written;
//   DN3 a stale view (a second tab saved first) → 409 in words, the latest loaded (the other tab's change shows), the person's own
//       change kept on top, the next Save goes through; the overlay drops a group the latest view no longer has (pure);
//   DN4 a refusal (422, the server's real answer to a repeated group) shows the server's words, the switches kept, nothing written;
//   DN5 a failed send keeps the changes and re-enables Save; a double click sends one PUT; a failed load offers Try again;
//   DN6 leaving with unsaved changes asks (beforeunload), and not when saved;
//   DN8 (break M1) a role change while the page is open: Save is refused (422), the page re-reads, drops the group that no longer
//       reaches the person (by its label), keeps the other change, and the next Save goes through; fail: the same save straight to the
//       API is refused as a whole, so the page's re-read is what recovers; (break m2, m3, review m4) a 409 whose re-read fails says
//       "reload the page"; a 409 where the other tab saved the same change says there is nothing left to save; after a Save focus is
//       on the heading;
//   DN7 keyboard only (Tab to a checkbox, Space, Tab to Save, Enter), axe clean (WCAG 2.2 A/AA) on every state, 375, 1024 and 1440 px
//       with no sideways scroll; fail: the same axe run finds an unlabelled button we add;
//   API fail lines: no token 401, an unknown field 422, a stale version 409 (nothing written).
// Sample firms only. US$0, no model call; live AI off. Screenshots (deviceScaleFactor 1) in product/screens/PF-18s/screenshots/.
// Run from prototype/:
//   zsh studio/tools/isolated.sh pf18sn 4443 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_pf18s_notifications_browser.ts 4443 xr_studio_pf18sn
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { client, recorder } from "./runtime/api.ts";
import { draftOf, overlay, PrefsView } from "../web/src/modules/platform/settings/notifications-contract.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4443), process.argv[3] ?? "xr_studio_pf18sn"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "PF-18s", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
type Ans = { status: number; body: any; text: string };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j, text };
};
const signIn = async (firmKey: string, who: { actorId?: string; email?: string }): Promise<string> => {
  const r = await api(null, "POST", "/platform/session/local", { firmKey, ...who, secondStep: true });
  if (r.body?.token) return r.body.token as string;
  console.error(`STOP  local sign-in refused for ${JSON.stringify(who)} (start the copy with PLATFORM_IDENTITY=local): ${r.text.slice(0, 300)}`); process.exit(2);
};
const STALE = "Your notification settings were changed elsewhere since you opened them.";

// ------------------------------------------------------------------------------------------------ setup (Sample)
await api(null, "GET", "/platform/me");   // the app seeds the Sample firms at start; this only waits for it
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
const TOWNER = await signIn("sample-firm", { actorId: "user-R" }), TOFF = await signIn("sample-firm", { actorId: "user-O" });
const OFF = sql(`select id from platform_staff where actor_id = 'user-O' and firm_id = '${A}'`);
await api(TOWNER, "PATCH", `/platform/staff/${OFF}/roles`, { roles: ["CASE_OFFICER"], reason: "PF-18s part 3 setup: a stopped run may have left DN8's role" });   // no change is fine
rawSql(`delete from platform_notification_preference where staff_id = '${OFF}'`);   // a reused copy starts from the §3.3 defaults
const rows = (where = "") => Number(sql(`select count(*) from platform_notification_preference where staff_id = '${OFF}' ${where}`));
ok("PF-18s part 3 setup: the Owner (user-R) and the Case Officer (user-O) signed in; the Case Officer has no saved switch", !!A && !!OFF && rows() === 0);

// ------------------------------------------------------------------------------------------------ the browser
const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errs: string[] = [];
const tab = async (token: string, width = 1440) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, token);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); return p;
};
const open = async (p: Page) => { await p.goto(`${BASE}/account/notifications`); await p.locator("[data-pref-row], [data-prefs-load-error]").first().waitFor({ timeout: 60_000 }); };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `pf18s-n${name}.png`), fullPage: true });
const axe = async (p: Page) => (await p.waitForTimeout(300), await new AxeBuilder({ page: p }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
const ids = (v: { id: string; nodes: { target: unknown }[] }[]) => v.map((x) => `${x.id}: ${x.nodes[0]?.target}`);
const reach = async (p: Page, target: Locator, max = 80) => {
  for (let i = 0; i < max; i++) { if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return; await p.keyboard.press("Tab"); }
  throw new Error("not reached by Tab");
};
const box = (p: Page, k: string) => p.locator(`[data-pref="${k}"]`);
const save = (p: Page) => p.locator("[data-prefs-save]");
/** Does `act` and waits for the PUT's 200 and the page's saved state (a toast from an earlier save is still on screen, so it is no signal). */
const saving = async (p: Page, act: () => Promise<unknown>) => {
  const done = p.waitForResponse((r) => r.url().endsWith("/api/platform/me/notifications") && r.request().method() === "PUT" && r.status() === 200, { timeout: 15_000 });
  await act(); await done;
  await p.waitForFunction(() => (document.querySelector("[data-prefs-save]") as HTMLButtonElement | null)?.disabled === true && !document.querySelector("[data-prefs-problem]"), undefined, { timeout: 15_000 });
};
const groupsOn = async (p: Page) => p.locator("[data-pref-row]").evaluateAll((els) => els.map((e) => e.getAttribute("data-pref-row")));
const leaveAsks = (p: Page) => p.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });

let failed = 0;
try {
  // ---------------------------------------------------------------------------------------------- DN1
  const p = await tab(TOFF); await open(p);
  const coGroups = await groupsOn(p), apiCo = await api(TOFF, "GET", "/platform/me/notifications");
  const holdsInvoices = (await api(TOFF, "GET", "/platform/me")).text.includes("agent/invoice:list");
  ok("PF-18s DN1: the Case Officer has the Notifications entry and sees exactly the API's groups: 1-5, plus Payments only when they hold agent/invoice:list; each with In app and Email named for the group",
    await p.locator('nav[aria-label="My account"] [data-account-section="/account/notifications"]').count() === 1
      && JSON.stringify(coGroups) === JSON.stringify(["WORK_HANDED_TO_ME", "NEEDS_YOU", "MY_DEADLINES", "CLIENT_MESSAGED_ME", "MENTIONS", ...(holdsInvoices ? ["PAYMENTS"] : [])])
      && JSON.stringify(coGroups) === JSON.stringify(apiCo.body.groups.map((g: { group: string }) => g.group))
      && await p.getByRole("checkbox", { name: "Email for Mentions" }).count() === 1, coGroups);
  const sec = p.locator("[data-pref-security]");
  ok("PF-18s DN1: the security emails row says \"Always on\" and has no control",
    (await sec.innerText()).includes("Security emails (new sign-in, password change)") && (await sec.innerText()).includes("Always on") && await sec.locator("input").count() === 0);
  const po = await tab(TOWNER); await open(po);
  const ownGroups = await groupsOn(po), apiOwn = await api(TOWNER, "GET", "/platform/me/notifications");
  ok("PF-18s DN1 fail: Team watch and Firm and connections are absent for the Case Officer and shown for the Owner, with Payments (every group the API gives the Owner)",
    !coGroups.some((g) => ["TEAM_WATCH", "FIRM_AND_CONNECTIONS"].includes(g!)) && ["TEAM_WATCH", "PAYMENTS", "FIRM_AND_CONNECTIONS"].every((g) => ownGroups.includes(g))
      && JSON.stringify(ownGroups) === JSON.stringify(apiOwn.body.groups.map((g: { group: string }) => g.group)), ownGroups);
  await shot(po, "1-owner-1440"); await po.context().close();

  // ---------------------------------------------------------------------------------------------- DN2 change, reload, it stays
  const disabledFirst = await save(p).isDisabled(), askClean = await leaveAsks(p);
  ok("PF-18s DN2 fail: with no change Save is disabled and leaving does not ask", disabledFirst && !askClean);
  const v0 = await axe(p); ok("PF-18s DN7: the page as loaded has no WCAG 2.2 A/AA violation", v0.length === 0, ids(v0));
  await shot(p, "2-case-officer-1440");
  await box(p, "MENTIONS.email").uncheck();
  const hint = await p.locator("[data-prefs-hint]").innerText();
  ok("PF-18s DN2: unticking Email for Mentions enables Save, says \"1 unsaved change\" and Mentions no longer says Default",
    await save(p).isEnabled() && hint.startsWith("1 unsaved change.") && await p.locator('[data-pref-row="MENTIONS"] [data-pref-default]').count() === 0, hint);
  ok("PF-18s DN6: with an unsaved change, leaving the page asks", await leaveAsks(p));
  await saving(p, () => save(p).click());
  ok("PF-18s DN2: the toast says \"Notification settings saved\"", await p.getByText("Notification settings saved").first().isVisible());
  ok("PF-18s DN2: Save writes one row (Mentions: in app on, email off) and no other group", rows() === 1 && rows("and \"group\" = 'MENTIONS' and in_app and not email") === 1, { rows: rows() });
  ok("PF-18s DN6 fail: once saved, leaving no longer asks and Save is disabled again", !(await leaveAsks(p)) && await save(p).isDisabled());
  await p.reload(); await p.locator("[data-pref-row]").first().waitFor({ timeout: 30_000 });
  ok("PF-18s DN2: after a reload Email for Mentions is still off, In app still on, Save disabled",
    !(await box(p, "MENTIONS.email").isChecked()) && await box(p, "MENTIONS.inApp").isChecked() && await save(p).isDisabled());

  // ---------------------------------------------------------------------------------------------- DN3 409
  const cur = await api(TOFF, "GET", "/platform/me/notifications");
  const other = await api(TOFF, "PUT", "/platform/me/notifications", { version: cur.body.version, groups: [{ group: "NEEDS_YOU", inApp: true, email: false }] });
  await box(p, "WORK_HANDED_TO_ME.inApp").uncheck(); await save(p).click();
  await p.locator('[data-prefs-problem="warn"]').waitFor({ timeout: 15_000 });
  const staleText = await p.locator("[data-prefs-problem-text]").innerText();
  ok("PF-18s DN3: a second tab's save first → the page says so in words, loads the latest (Needs you email off) and keeps the person's change (Work handed to me in app off); Save stays enabled",
    other.status === 200 && staleText.startsWith(STALE) && staleText.includes("your unsaved changes are kept on top")
      && !(await box(p, "NEEDS_YOU.email").isChecked()) && !(await box(p, "WORK_HANDED_TO_ME.inApp").isChecked()) && !(await box(p, "MENTIONS.email").isChecked()) && await save(p).isEnabled(), staleText);
  ok("PF-18s DN3: focus moves to the conflict notice", await p.locator("[data-prefs-problem]").evaluate((el) => el === document.activeElement));
  const v3 = await axe(p); ok("PF-18s DN7: the conflict state has no WCAG 2.2 A/AA violation", v3.length === 0, ids(v3));
  await shot(p, "3-conflict-1440");
  ok("PF-18s DN3 fail: before the second Save, the person's change is not written", rows("and \"group\" = 'WORK_HANDED_TO_ME'") === 0);
  await saving(p, () => save(p).click());
  ok("PF-18s DN3: the next Save (with the latest version) goes through: Work handed to me in app off, Needs you email off, Mentions email off all saved",
    rows("and \"group\" = 'WORK_HANDED_TO_ME' and not in_app and email") === 1 && rows("and \"group\" = 'NEEDS_YOU' and not email") === 1 && rows("and \"group\" = 'MENTIONS' and not email") === 1 && await save(p).isDisabled());
  // the overlay's rule on a group the latest view no longer has (a role change): pure
  const g = (group: string, inApp = true, email = true) => ({ group, number: 1, label: group, whatIsInIt: "x", inApp, email, defaults: { inApp: true, email: true }, saved: false });
  const loaded = PrefsView.parse({ version: "a", groups: [g("MENTIONS"), g("TEAM_WATCH"), g("NEEDS_YOU")], security: { label: "s", email: true, switchable: false } });
  const latest = PrefsView.parse({ version: "b", groups: [g("MENTIONS"), g("NEEDS_YOU", true, false)], security: { label: "s", email: true, switchable: false } });
  const ov = overlay(latest, loaded, { ...draftOf(loaded), MENTIONS: { inApp: false, email: true }, TEAM_WATCH: { inApp: false, email: false } });
  ok("PF-18s DN3 (challenge m2, pure): the overlay keeps the person's change, shows the other tab's on a group they did not touch, and drops a group the latest view no longer has",
    JSON.stringify(ov) === JSON.stringify({ MENTIONS: { inApp: false, email: true }, NEEDS_YOU: { inApp: true, email: false } }), ov);
  const latest2 = PrefsView.parse({ version: "c", groups: [g("MENTIONS", true, false)], security: { label: "s", email: true, switchable: false } });
  const ov2 = overlay(latest2, loaded, { ...draftOf(loaded), MENTIONS: { inApp: false, email: true } });
  ok("PF-18s DN3 (review m2, pure): per box: the person's In app change is kept and the other tab's Email change on the same group shows",
    JSON.stringify(ov2) === JSON.stringify({ MENTIONS: { inApp: false, email: false } }), ov2);

  // ---------------------------------------------------------------------------------------------- DN4 422 refusal (the server's real answer)
  const before = rawSql(`select string_agg("group" || in_app || email, ',' order by "group") from platform_notification_preference where staff_id = '${OFF}'`);
  await p.route("**/api/platform/me/notifications", async (r) => {
    if (r.request().method() !== "PUT") return r.continue();
    const b = JSON.parse(r.request().postData() ?? "{}"); b.groups = [...b.groups, b.groups[0]];   // the same group twice
    await r.continue({ postData: JSON.stringify(b) });
  });
  await box(p, "MY_DEADLINES.email").uncheck(); await save(p).click();
  await p.locator('[data-prefs-problem="danger"]').waitFor({ timeout: 15_000 });
  const refusedText = await p.locator("[data-prefs-problem-text]").innerText();
  ok("PF-18s DN4: a refusal (422) shows the server's words, keeps the person's change, Save enabled, nothing written",
    refusedText === "Each group may be named once." && !(await box(p, "MY_DEADLINES.email").isChecked()) && await save(p).isEnabled()
      && rawSql(`select string_agg("group" || in_app || email, ',' order by "group") from platform_notification_preference where staff_id = '${OFF}'`) === before, refusedText);
  const v4 = await axe(p); ok("PF-18s DN7: the refusal state has no WCAG 2.2 A/AA violation", v4.length === 0, ids(v4));
  await shot(p, "4-refused-1440");
  await p.unroute("**/api/platform/me/notifications");

  // ---------------------------------------------------------------------------------------------- DN5 failed send, double click, failed load
  await p.route("**/api/platform/me/notifications", (r) => (r.request().method() === "PUT" ? r.abort("connectionreset") : r.continue()));
  await save(p).click();
  await p.locator("[data-prefs-problem-text]", { hasText: "Your changes are still here; try again." }).waitFor({ timeout: 15_000 });
  ok("PF-18s DN5: a failed send says \"Your changes are still here; try again.\", keeps the change and re-enables Save",
    !(await box(p, "MY_DEADLINES.email").isChecked()) && await save(p).isEnabled() && rows("and \"group\" = 'MY_DEADLINES'") === 0);
  await p.unroute("**/api/platform/me/notifications");
  let puts = 0;
  await p.route("**/api/platform/me/notifications", async (r) => { if (r.request().method() === "PUT") { puts++; await new Promise((s) => setTimeout(s, 800)); } await r.continue(); });
  await saving(p, () => save(p).dblclick());
  ok("PF-18s DN5: a double click on Save sends one PUT, and the retry after the failure saves My deadlines email off", puts === 1 && rows("and \"group\" = 'MY_DEADLINES' and not email") === 1, { puts });
  await p.unroute("**/api/platform/me/notifications");
  const pf = await tab(TOFF);
  await pf.route("**/api/platform/me/notifications", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ title: "Server error", status: 500, detail: "Something went wrong on our side." }) }));
  await open(pf);
  const loadErr = await pf.locator("[data-prefs-load-error]").count();
  const v5 = await axe(pf); ok("PF-18s DN7: the load-failure state has no WCAG 2.2 A/AA violation", v5.length === 0, ids(v5));
  await shot(pf, "5-load-failed-1440");
  await pf.unroute("**/api/platform/me/notifications"); await pf.locator("[data-prefs-retry]").click();
  await pf.locator("[data-pref-row]").first().waitFor({ timeout: 15_000 });
  ok("PF-18s DN5: a failed load says so with Try again, and Try again loads the settings (Mentions email off as saved)", loadErr === 1 && !(await box(pf, "MENTIONS.email").isChecked()));
  await pf.context().close();

  // ---------------------------------------------------------------------------------------------- DN7 keyboard only
  await p.reload(); await p.locator("[data-pref-row]").first().waitFor({ timeout: 30_000 });
  await p.locator("main h1").click();
  await reach(p, box(p, "CLIENT_MESSAGED_ME.email")); await p.keyboard.press("Space");
  await reach(p, save(p)); await saving(p, () => p.keyboard.press("Enter"));
  ok("PF-18s DN7: keyboard only: Tab to Email for A client or lead messaged me, Space unticks it, Tab to Save, Enter saves", rows("and \"group\" = 'CLIENT_MESSAGED_ME' and not email") === 1);
  ok("PF-18s DN8 (review m4): after a Save, focus is on the page's heading, not lost to the page", await p.locator("main h1").evaluate((el) => el === document.activeElement));

  // ---------------------------------------------------------------------------------------------- DN8 409 edges
  const problemText = async (tone: string) => { await p.locator(`[data-prefs-problem="${tone}"]`).waitFor({ timeout: 15_000 }); return p.locator("[data-prefs-problem-text]").innerText(); };
  await box(p, "MENTIONS.inApp").uncheck();
  const c1 = await api(TOFF, "GET", "/platform/me/notifications");
  await api(TOFF, "PUT", "/platform/me/notifications", { version: c1.body.version, groups: [{ group: "MENTIONS", inApp: false, email: false }] });
  await save(p).click(); const same = await problemText("warn");
  ok("PF-18s DN8 (break m3): the other tab saved the same change → the page says there is nothing left to save, and Save is disabled",
    same.endsWith("it already matches your changes, so there is nothing left to save.") && !same.includes("Save again") && await save(p).isDisabled(), same);
  await box(p, "MENTIONS.inApp").check();
  const c2 = await api(TOFF, "GET", "/platform/me/notifications");
  await api(TOFF, "PUT", "/platform/me/notifications", { version: c2.body.version, groups: [{ group: "NEEDS_YOU", inApp: true, email: true }] });
  await p.route("**/api/platform/me/notifications", (r) => (r.request().method() === "GET" ? r.abort("connectionreset") : r.continue()));
  await save(p).click(); const noReread = await problemText("danger");
  ok("PF-18s DN8 (break m2): a 409 whose re-read fails never says it loaded the latest: it says to reload the page; nothing written",
    noReread.startsWith(STALE) && noReread.endsWith("reload the page.") && !noReread.includes("loaded the latest") && rows("and \"group\" = 'MENTIONS' and not in_app") === 1, noReread);
  await p.unroute("**/api/platform/me/notifications");

  // ---------------------------------------------------------------------------------------------- DN8 (break M1) role change
  await p.reload(); await p.locator("[data-pref-row]").first().waitFor({ timeout: 30_000 });
  ok("PF-18s DN8 setup: the Sample Case Officer sees Payments (holds agent/invoice:list)", holdsInvoices && await p.locator('[data-pref-row="PAYMENTS"]').count() === 1);
  await box(p, "PAYMENTS.email").uncheck(); await box(p, "MENTIONS.inApp").check();
  const demote = await api(TOWNER, "PATCH", `/platform/staff/${OFF}/roles`, { roles: ["READ_ONLY"], reason: "PF-18s DN8: a role change while the page is open" });
  try {
    const afterRole = await api(TOFF, "GET", "/platform/me/notifications");
    const direct = await api(TOFF, "PUT", "/platform/me/notifications", { version: afterRole.body?.version, groups: [{ group: "PAYMENTS", inApp: true, email: false }, { group: "MENTIONS", inApp: true, email: false }] });
    ok("PF-18s DN8 fail (break M1): after the role change Payments no longer reaches the person, and the same save straight to the API is refused as a whole (422), nothing written",
      demote.status < 300 && !afterRole.body?.groups?.some((x: { group: string }) => x.group === "PAYMENTS") && direct.status === 422 && rows("and \"group\" = 'PAYMENTS'") === 0 && rows("and \"group\" = 'MENTIONS' and not in_app") === 1,
      { demote: demote.status, direct: direct.status });
    await save(p).click(); const roleText = await problemText("warn");
    ok("PF-18s DN8 (break M1): Save after the role change → the page says by label which group no longer reaches the person and that its change was removed; Payments leaves the table; the Mentions change stays; Save stays enabled",
      roleText.startsWith("This group no longer reaches you, so its changes were removed: Payments.") && !roleText.includes("PAYMENTS") && await p.locator('[data-pref-row="PAYMENTS"]').count() === 0
        && await box(p, "MENTIONS.inApp").isChecked() && await save(p).isEnabled(), roleText);
    await saving(p, () => save(p).click());
    ok("PF-18s DN8 (break M1): the next Save goes through: Mentions in app on is saved, and nothing is written for Payments", rows("and \"group\" = 'MENTIONS' and in_app") === 1 && rows("and \"group\" = 'PAYMENTS'") === 0);
  } finally {
    const back = await api(TOWNER, "PATCH", `/platform/staff/${OFF}/roles`, { roles: ["CASE_OFFICER"], reason: "PF-18s DN8: restore" });
    ok("PF-18s DN8: the Case Officer's role is restored", back.status < 300, back.status);
  }
  await p.context().close();

  // ---------------------------------------------------------------------------------------------- API fail lines
  const v = (await api(TOFF, "GET", "/platform/me/notifications")).body.version, n = rows();
  const [noTok, extra, stale] = [
    await api(null, "GET", "/platform/me/notifications"),
    await api(TOFF, "PUT", "/platform/me/notifications", { version: v, groups: [{ group: "MENTIONS", inApp: true, email: true }], extra: 1 }),
    await api(TOFF, "PUT", "/platform/me/notifications", { version: "stale", groups: [{ group: "MENTIONS", inApp: true, email: true }] }),
  ];
  ok("PF-18s API fail: no token 401, an unknown field 422, a stale version 409 with the current view; nothing written",
    noTok.status === 401 && extra.status === 422 && stale.status === 409 && stale.body?.detail === STALE && Array.isArray(stale.body?.current?.groups) && rows() === n && rows("and \"group\" = 'MENTIONS' and not email") === 1,
    { noTok: noTok.status, extra: extra.status, stale: stale.status });

  // ---------------------------------------------------------------------------------------------- DN7 three widths
  for (const w of [375, 1024, 1440]) {
    const q = await tab(TOWNER, w); await open(q);
    const vw = await axe(q), wide = await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    ok(`PF-18s DN7: Notifications at ${w} px has no WCAG 2.2 A/AA violation and no sideways scroll`, vw.length === 0 && wide, { v: ids(vw), wide });
    if (w !== 1440) await shot(q, `7-owner-${w}`);
    if (w === 375) {
      await q.evaluate(() => { document.querySelector("main table")!.parentElement!.appendChild(document.createElement("button")); });
      const bad = await axe(q);
      ok("PF-18s DN7 fail: the same axe run finds the unlabelled button we add (the check can fail)", bad.some((x) => x.id === "button-name"), bad.map((x) => x.id));
    }
    await q.context().close();
  }
  ok("PF-18s part 3: no page error in any tab", errs.length === 0, errs);
} catch (e) {
  failed++; console.log(`FAIL  PF-18s part 3: the check stopped: ${(e as Error).stack?.slice(0, 600)}`);
} finally {
  await browser.close();
}
process.exit(summary() + failed ? 1 : 0);
