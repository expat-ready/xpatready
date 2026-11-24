// J-50 (map row 50, R1.50: in-app notifications; personal notification settings), written by the qa lane (24 Nov) as the
// acceptance journey for the row after its parts merged: PF-18a (#2304, the switches and NotificationPrefsPort), PF-18np
// (the port), PF-18n (the store and the person's list API), PF-18n part 2 (#3289, "a lead assigned to me", the first
// caller), PF-18s (My account → Notifications) and PF-18ns (#3302, the bell and the notification list). It walks the
// Sample firm on an isolated copy of the running app (its own database and port, never :4400), by screens, with the API
// and the database read underneath.
// Done when (CAPABILITIES R1.50), word for word as the steps:
//   W1 "An event notifies its people": the Owner (R) signs in on the sign-in card and, on two new leads' pages, uses
//      Assign to hand one to the Case Officer (O) and one to the second representative (T). O's and T's bells each say 1,
//      named for screen readers; each panel names its own lead; one msg_notification row each (kind lead-assigned).
//      Fail: R, who did the assigning, is not told (bell 0, no row).
//   W2 "read per person": O opens the notice from the panel; it lands on the lead and O's count is 0, O's row read
//      underneath; T's row and bell stay unread (1). Fail: O cannot mark T's row read (404), and T's row is unchanged.
//      (Each lead-assigned notice has one person; the one-item-many-people shape, a case deadline's reminder to the
//      officer and the lead representative, is not reachable by screens on a fresh copy and is not walked here.)
//   W3 "a kind switched off stops for that person only": O, in My account → Notifications, unticks In app for "Work
//      handed to me" and saves (one saved row). R assigns two more leads by screens, one to O and one to T: T's bell says
//      it, O's bell stays 0 and O has no row for it; R's switches are untouched. Fail (before the switch, W1): the same
//      event did reach O. O ticks it back on and the next one reaches O again (the switch, not a breakage).
//   W4 another person or firm never reads O's notice: T's and another firm's lists do not hold O's row id or lead name;
//      marking O's row read as T or as the other firm's Owner is 404; no token is 401.
//   W5 400, 1024 and 1440 px: the page with the bell, the open panel, the All page and My account → Notifications have no
//      sideways scroll and axe finds 0 serious or critical (WCAG 2.2 A/AA); no page error.
//   W6 the walk ends at the next step a person takes: O, from the notice, is on the lead's page with its actions (Engage,
//      the first step of the prospect pipeline, R1.31, Works; there is no R1.51 row).
// Bell steps are labelled "[bell, PF-18ns]" so they can be judged on their own. Sample firms and leads only; the switches
// and notices of O, T and R are cleared at the start by the database owner (the app never deletes a notification), and O's
// switch is put back at the end. US$0, no model call, live AI off, no live mail. Screenshots: product/screens/J-50/
// screenshots/. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j50 4477 start --ttl 30 AI_LIVE=off PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j50 4477 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_50.ts j50 4477
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Locator, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j50", Number(process.argv[3] ?? 4477)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-50", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
const run = Date.now().toString(36).slice(-5);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Ans = { status: number; body: any; text: string };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j, text };
};
const seen = (l: Locator, ms = 8_000) => l.first().waitFor({ timeout: ms }).then(() => true, () => false);

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
const staff = (actor: string) => { const [id, email, name] = sql(`select id || '|' || email || '|' || display_name from platform_staff where actor_id = '${actor}' and firm_id = '${A}'`).split("|"); return { id, email, name }; };
const R = staff("user-R"), O = staff("user-O"), T = staff("user-T");
const BOWNER = sql(`select s.email from platform_staff s join platform_role_grant g on g.staff_id = s.id and g.ended_at is null and g.role = 'OWNER' where s.firm_id = '${B}' limit 1`);
const people = `'${R.id}', '${O.id}', '${T.id}'`;
sql(`delete from msg_notification where staff_id in (${people})`);
sql(`delete from platform_notification_preference where staff_id in (${people})`);   // back to AG-16 §3.3's defaults (in app on)
const rowsOf = (staffId: string, where = "") => Number(sql(`select count(*) from msg_notification where staff_id = '${staffId}' ${where}`) || "0");
const readOf = (staffId: string, leadId: string) => sql(`select coalesce(read_at::text, 'unread') from msg_notification where staff_id = '${staffId}' and item_id = '${leadId}'`);
ok("J-50 setup: the Sample firm with its front office; the Owner (user-R), the Case Officer (user-O) and the second representative (user-T); another firm's Owner; no notices or switches left for R, O and T",
  !!A && !!B && !!R.id && !!O.id && !!T.id && !!BOWNER && fo.failed.length === 0 && rowsOf(O.id) + rowsOf(T.id) + rowsOf(R.id) === 0, { R: R.email, O: O.email, T: T.email, BOWNER });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1", slowMo: process.env.HEADED === "1" ? 150 : 0, ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errors: string[] = [];
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `j50-${name}.png`), fullPage: true }).catch(() => undefined);
const newPage = async (width = 1440, token?: string) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  if (token) await ctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, token);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
  p.on("dialog", (d) => { void (d.type() === "beforeunload" ? d.accept() : d.dismiss()); });
  return p;
};
/** A person signs in on the sign-in card (PF-4's local stand-in: firm key and work email). */
async function signIn(mail: string, firmKey = "sample-firm"): Promise<Page> {
  const p = await newPage();
  await p.goto(`${BASE}/account`);
  await p.getByLabel("Firm key").fill(firmKey); await p.getByLabel("Work email").fill(mail); await p.getByRole("button", { name: "Sign in" }).click();
  await p.getByLabel("Firm key").waitFor({ state: "detached", timeout: 30_000 });
  return p;
}
const pageToken = (p: Page) => p.evaluate(() => (JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}") as { token?: string }).token ?? "");
const bell = (p: Page) => p.locator("[data-notifications-bell]");
const count = async (p: Page) => Number(await bell(p).getAttribute("data-unread-count"));
/** The bell's count after a fresh page load (the bell polls each minute; a person reloads or moves page). */
const countAfterLoad = async (p: Page, want: number, path = "/account", ms = 20_000) => {
  await p.goto(`${BASE}${path}`); await bell(p).waitFor({ timeout: 60_000 });
  const t = Date.now(); while (Date.now() - t < ms) { if (await count(p) === want) return want; await wait(250); }
  return count(p);
};
const panel = (p: Page) => p.locator("[data-notifications-panel]");
const openPanel = async (p: Page) => { await bell(p).click(); await panel(p).locator("[data-notification], [data-notifications-empty]").first().waitFor({ timeout: 20_000 }); };
const serious = async (p: Page) => (await wait(300), await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const sideways = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const nbsp = (s: string) => s.replace(/‑/g, "-");   // lead numbers show with a non-breaking hyphen

let n = 0;
/** A new lead (setup through the API as R; P-33: lead capture is not under test), then R hands it over on the lead's page with Assign. */
async function assignByScreen(rp: Page, TR: string, to: { id: string; name: string }) {
  const given = `Client ${String.fromCharCode(65 + (n % 26))}${run}${n++}`;
  const added = await api(TR, "POST", "/front-office/leads", { givenNames: given, familyName: "Sample", email: `j50-${run}-${n}@sample.invalid`, source: "Referral", requestId: randomUUID() });
  const id = added.body?.id as string, number = added.body?.number as string;
  await rp.goto(`${BASE}/front-office/leads/${id}`);
  await rp.locator("[data-assign-open]").click();
  await rp.locator("[data-assign-choices]").getByLabel(to.name, { exact: true }).check();
  const done = rp.waitForResponse((r) => r.url().endsWith(`/api/front-office/leads/${id}/assign`) && r.request().method() === "POST", { timeout: 20_000 });
  await rp.getByRole("dialog").getByRole("button", { name: /^(Assign|Reassign)$/ }).click();
  const status = (await done).status();
  await rp.locator("[data-owner]").filter({ hasText: to.name }).waitFor({ timeout: 20_000 });
  return { id, number, name: `${given} Sample`, status, added: added.status };
}
const prefBox = (p: Page, k: string) => p.locator(`[data-pref="${k}"]`);
const openPrefs = async (p: Page) => { await p.goto(`${BASE}/account/notifications`); return seen(p.locator("[data-pref-row]"), 60_000); };
const savePrefs = async (p: Page) => {
  const done = p.waitForResponse((r) => r.url().endsWith("/api/platform/me/notifications") && r.request().method() === "PUT", { timeout: 15_000 });
  await p.locator("[data-prefs-save]").click(); const s = (await done).status();
  await p.waitForFunction(() => (document.querySelector("[data-prefs-save]") as HTMLButtonElement | null)?.disabled === true, undefined, { timeout: 15_000 }).catch(() => undefined);
  return s;
};
const prefRows = (staffId: string, where = "") => Number(sql(`select count(*) from platform_notification_preference where staff_id = '${staffId}' ${where}`) || "0");

try {
  // ---------------------------------------------------------------------------------------------- W1 an event notifies its people
  const rp = await signIn(R.email); const TR = await pageToken(rp);
  const op = await signIn(O.email); const TO = await pageToken(op);
  const tp = await signIn(T.email); const TT = await pageToken(tp);
  ok("J-50 W1: the Owner, the Case Officer and the second representative sign in on the sign-in card", !!TR && !!TO && !!TT);
  const o0 = await countAfterLoad(op, 0), t0 = await countAfterLoad(tp, 0);
  const l1 = await assignByScreen(rp, TR, O), l2 = await assignByScreen(rp, TR, T);
  await shot(rp, "w1-assigned-on-the-lead-page-1440");
  ok("J-50 W1: R hands one new lead to O and one to T with Assign on each lead's page (200, the page shows the new owner)", l1.status === 200 && l2.status === 200 && l1.added < 300 && l2.added < 300, { l1, l2 });
  ok("J-50 W1: underneath, exactly one notice each: O's names O's lead and T's names T's lead (kind lead-assigned, group Work handed to me), both unread",
    rowsOf(O.id) === 1 && rowsOf(T.id) === 1 && rowsOf(O.id, `and item_id = '${l1.id}' and kind = 'lead-assigned' and "group" = 'WORK_HANDED_TO_ME' and read_at is null`) === 1
      && rowsOf(T.id, `and item_id = '${l2.id}' and kind = 'lead-assigned' and read_at is null`) === 1, { O: rowsOf(O.id), T: rowsOf(T.id) });
  const o1 = await countAfterLoad(op, 1), t1 = await countAfterLoad(tp, 1);
  ok("J-50 W1 [bell, PF-18ns]: O's and T's bells went from 0 to 1, named \"Notifications, 1 unread\" for screen readers",
    o0 === 0 && t0 === 0 && o1 === 1 && t1 === 1 && (await bell(op).getAttribute("aria-label")) === "Notifications, 1 unread" && (await bell(tp).getAttribute("aria-label")) === "Notifications, 1 unread", { o0, t0, o1, t1 });
  await openPanel(op); const oPanel = nbsp(await panel(op).innerText());
  await openPanel(tp); const tPanel = nbsp(await panel(tp).innerText());
  ok("J-50 W1 [bell, PF-18ns]: each panel says \"Lead assigned to you\" with its own lead's name and number, and not the other's",
    oPanel.includes(`Lead assigned to you · ${l1.name} (${l1.number})`) && !oPanel.includes(l2.name) && tPanel.includes(`Lead assigned to you · ${l2.name} (${l2.number})`) && !tPanel.includes(l1.name), { oPanel: oPanel.slice(0, 200), tPanel: tPanel.slice(0, 200) });
  await shot(op, "w1-o-panel-1440");
  await tp.keyboard.press("Escape");
  const r1 = await countAfterLoad(rp, 0);
  ok("J-50 W1 fail: R, who did the assigning, is not told (no row; bell 0, \"none unread\")", rowsOf(R.id) === 0 && r1 === 0 && (await bell(rp).getAttribute("aria-label")) === "Notifications, none unread", { rows: rowsOf(R.id), r1 });

  // ---------------------------------------------------------------------------------------------- W2 read per person
  await op.locator(`[data-notification] [data-notification-open]`).first().click();
  await op.waitForURL(`${BASE}/front-office/leads/${l1.id}`, { timeout: 20_000 });
  const onLead = await seen(op.getByText(l1.number.replace(/-/g, "‑")).or(op.getByText(l1.number)), 20_000);
  ok("J-50 W2: O opens the notice from the panel and lands on that lead's page; O's row is read underneath", onLead && readOf(O.id, l1.id) !== "unread", { onLead, read: readOf(O.id, l1.id) });
  await shot(op, "w2-o-on-the-lead-1440");
  ok("J-50 W2: T's notice stays unread underneath (reading is per person)", readOf(T.id, l2.id) === "unread");
  const o2 = await countAfterLoad(op, 0), t2 = await countAfterLoad(tp, 1);
  ok("J-50 W2 [bell, PF-18ns]: O's bell says 0 and T's still says 1", o2 === 0 && t2 === 1, { o2, t2 });
  const tRow = sql(`select id from msg_notification where staff_id = '${T.id}' and item_id = '${l2.id}'`);
  const steal = await api(TO, "POST", `/platform/me/notifications/${tRow}/read`);
  ok("J-50 W2 fail: O marking T's notice read is refused (404) and T's row stays unread", steal.status === 404 && readOf(T.id, l2.id) === "unread", { status: steal.status, read: readOf(T.id, l2.id) });

  // ---------------------------------------------------------------------------------------------- W3 a kind switched off, for O only
  const there = await openPrefs(op);
  const wasOn = there && await prefBox(op, "WORK_HANDED_TO_ME.inApp").isChecked();
  await prefBox(op, "WORK_HANDED_TO_ME.inApp").uncheck();
  const s3 = await savePrefs(op);
  await op.reload(); await seen(op.locator("[data-pref-row]"), 30_000);
  ok("J-50 W3: O, in My account → Notifications, unticks In app for \"Work handed to me\" and saves; after a reload it is still off; one saved row (in app off) and none for T or R",
    wasOn && s3 === 200 && !(await prefBox(op, "WORK_HANDED_TO_ME.inApp").isChecked()) && prefRows(O.id) === 1 && prefRows(O.id, `and "group" = 'WORK_HANDED_TO_ME' and not in_app`) === 1 && prefRows(T.id) + prefRows(R.id) === 0,
    { wasOn, s3, rows: prefRows(O.id) });
  await shot(op, "w3-o-switch-off-1440");
  const l3 = await assignByScreen(rp, TR, O), l4 = await assignByScreen(rp, TR, T);
  ok("J-50 W3: with O's switch off, R hands one more lead to O and one to T (200 each): T gets a notice for it, O gets none (no row for O's new lead)",
    l3.status === 200 && l4.status === 200 && rowsOf(O.id, `and item_id = '${l3.id}'`) === 0 && rowsOf(T.id, `and item_id = '${l4.id}' and read_at is null`) === 1 && rowsOf(O.id) === 1, { l3: l3.status, l4: l4.status, oRows: rowsOf(O.id), tRows: rowsOf(T.id) });
  const o3 = await countAfterLoad(op, 0), t3 = await countAfterLoad(tp, 2);
  await openPanel(op); const oPanel3 = nbsp(await panel(op).innerText()); await op.keyboard.press("Escape");
  ok("J-50 W3 [bell, PF-18ns]: O's bell stays 0 and O's panel does not name the new lead; T's bell says 2", o3 === 0 && !oPanel3.includes(l3.name) && t3 === 2, { o3, t3 });
  await openPrefs(op); await prefBox(op, "WORK_HANDED_TO_ME.inApp").check(); const s3b = await savePrefs(op);
  const l5 = await assignByScreen(rp, TR, O);
  ok("J-50 W3: O ticks it back on and the next lead handed to O reaches O again (the switch stopped it, nothing else)", s3b === 200 && l5.status === 200 && rowsOf(O.id, `and item_id = '${l5.id}' and read_at is null`) === 1, { s3b, l5: l5.status });

  // ---------------------------------------------------------------------------------------------- W4 another person or firm
  const oRow = sql(`select id from msg_notification where staff_id = '${O.id}' and item_id = '${l5.id}'`);
  const bp = await signIn(BOWNER, "sample-solo"); const TB = await pageToken(bp);
  const tList = await api(TT, "GET", "/platform/me/notifications/items?size=100"), bList = await api(TB, "GET", "/platform/me/notifications/items?size=100");
  const asT = await api(TT, "POST", `/platform/me/notifications/${oRow}/read`), asB = await api(TB, "POST", `/platform/me/notifications/${oRow}/read`), anon = await api(null, "GET", "/platform/me/notifications/items");
  ok("J-50 W4: T's and the other firm's lists hold neither O's row nor O's lead name; marking O's notice read as T or as the other firm's Owner is 404; no token is 401; O's row still unread",
    tList.status === 200 && bList.status === 200 && !tList.text.includes(oRow) && !tList.text.includes(l5.name) && !bList.text.includes(oRow) && !bList.text.includes(l5.name)
      && asT.status === 404 && asB.status === 404 && anon.status === 401 && readOf(O.id, l5.id) === "unread", { t: tList.status, b: bList.status, asT: asT.status, asB: asB.status, anon: anon.status });
  await bp.context().close();

  // ---------------------------------------------------------------------------------------------- W5 sizes and axe
  for (const width of [400, 1024, 1440]) {
    const q = await newPage(width, TO);
    await q.goto(`${BASE}/account`); await bell(q).waitFor({ timeout: 60_000 });
    const onPage = await serious(q), w1 = await sideways(q);
    await openPanel(q); const inPanel = await serious(q), w2 = await sideways(q); await q.keyboard.press("Escape");
    await q.goto(`${BASE}/account/notifications/all`); await seen(q.locator("[data-notifications-tabs]"), 30_000); await seen(q.locator("section[aria-label='Notifications'] [data-notification], [data-notifications-empty]"), 20_000);
    const onAll = await serious(q), w3 = await sideways(q);
    await openPrefs(q); const onPrefs = await serious(q), w4 = await sideways(q);
    if (width !== 1440) await shot(q, `w5-prefs-${width}`);
    ok(`J-50 W5 [bell, PF-18ns]: at ${width} px the page with the bell, the open panel, the All page and My account → Notifications: no sideways scroll, axe 0 serious or critical`,
      [onPage, inPanel, onAll, onPrefs].every((v) => v.length === 0) && ![w1, w2, w3, w4].some(Boolean), { onPage, inPanel, onAll, onPrefs, wide: [w1, w2, w3, w4] });
    await q.context().close();
  }
  ok("J-50 W5: no page error on any page walked", errors.length === 0, errors.slice(0, 3));

  // ---------------------------------------------------------------------------------------------- W6 the next step
  await op.goto(`${BASE}/account`); await bell(op).waitFor({ timeout: 60_000 });
  await openPanel(op);
  await panel(op).locator(`[data-notification] [data-notification-open]`).filter({ hasText: l5.name }).first().click();
  await op.waitForURL(`${BASE}/front-office/leads/${l5.id}`, { timeout: 20_000 });
  const engage = await seen(op.getByRole("complementary", { name: "Owner and actions" }).getByRole("button", { name: "Engage" }), 20_000);
  await shot(op, "w6-next-step-engage-1440");
  ok("J-50 W6: the walk ends at the person's next step: from the notice O is on the lead's page, owner shown, with Engage (the prospect pipeline's first step, R1.31)", engage, { engage });

  // put back: O's switches to the defaults
  sql(`delete from platform_notification_preference where staff_id = '${O.id}'`);
  for (const p of [rp, op, tp]) await p.context().close();
} catch (e) {
  ok("J-50: the walk ran to its end", false, String(e).slice(0, 500));
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
