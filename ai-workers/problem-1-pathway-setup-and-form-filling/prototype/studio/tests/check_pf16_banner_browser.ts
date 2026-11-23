// PF-16 (trial banner part; R1.90 "trial banner counts days"): GET /api/platform/billing/banner and the banner in PF-6's
// frame, on an isolated copy (the local stand-in sign-in, the fake BillingPort; no Stripe call), a pass and a fail each:
//   B1 14 days left → neutral banner on Home and Team, "14 days left"; 4 days → still neutral (the amber edge's fail side).
//   B2 3 days left (2.5 days stored, a part day counts) → amber on Home and Team; the card not on file → "Add a card".
//   B3 not in a trial (ACTIVE, its old trial end kept as a converted firm's is) → show: false and no banner on any page.
//   B6 (review M1) the stored end passed → daysLeft 0, amber, "Free trial: ended on …", never "ends today", no Add a card.
//   B7 (review M2, m3) the read over a stub BillingPort: set to cancel, card saved, Stripe down; and on screen (the
//      answer rewritten in the browser): set to cancel → "no payment will be taken" and no card ask; card saved →
//      "Card saved"; Stripe down → no card claim either way. The words are Plan and billing's trialLine.
//   B4 a Case Officer → 403 on the read and no banner (the page never asks); an Admin → 200 and the banner.
//   B5 Home with the banner at 400, 1024 and 1440 px: no sideways scroll, axe WCAG 2.2 A/AA: no violation at all.
// The Sample firm's subscription is put back at the end; extra staff get their grants ended. Wording Sample. US$0.
//   zsh studio/tools/isolated.sh runtime_pf16b 4431 start PLATFORM_IDENTITY=local && tsx studio/tests/check_pf16_banner_browser.ts 4431 xr_studio_runtime_pf16b
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { BillingBanner, bannerDaysLeft } from "../api/src/platform/billing/banner.ts";
import type { BillingPorts } from "../api/src/platform/billing/webhook.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4431), DBNAME = process.argv[3] ?? "xr_studio_runtime_pf16b";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "PF-16", "screenshots-banner"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
const staffOf = (actor: string) => sql(`select email from platform_staff where actor_id = '${actor}' and firm_id = '${A}'`);
const extra = (role: string) => {
  const email = `pf16b-${role.toLowerCase()}-${run}@sample-firm.example.com`;
  const id = sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', '${email}', 'Sample ${role.toLowerCase().replace("_", " ")} ${run}', 'pf16b-${role.toLowerCase()}-${run}', now()) returning id`);
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${id}', '${role}', 'seed:PF-16b-test')`);
  return { id, email };
};
const OWNER = staffOf("user-R"), AD = extra("ADMIN"), CO = extra("CASE_OFFICER");
const SUB = sql(`select id from platform_subscription where firm_id = '${A}' and status <> 'ENDED' order by created_at desc limit 1`);
const kept = sql(`select row_to_json(s)::text from (select status, stripe_customer_id, stripe_subscription_id, trial_ends_at, current_period_end from platform_subscription where id = '${SUB}') s`);
const trial = (interval: string) => sql(`update platform_subscription set status = 'TRIAL', stripe_subscription_id = null, trial_ends_at = now() + interval '${interval}', current_period_end = null where id = '${SUB}' returning id`);

async function signIn(email: string) {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string };
  if (!b.token) throw new Error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`);
  const pend = await (await fetch(`${BASE}/api/platform/me/terms`, { headers: { authorization: `Bearer ${b.token}` } })).json() as { pending?: { id: string }[] };
  if (pend.pending?.length) await fetch(`${BASE}/api/platform/me/terms/accept`, { method: "POST", headers: { authorization: `Bearer ${b.token}`, "content-type": "application/json" }, body: JSON.stringify({ versionIds: pend.pending.map((p) => p.id) }) });
  return b.token;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other checks
const read = async (tok: string): Promise<{ status: number; body: any }> => { const r = await fetch(`${BASE}/api/platform/billing/banner`, { headers: { authorization: `Bearer ${tok}` } }); return { status: r.status, body: await r.json().catch(() => null) }; };

const browser: Browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [], stripeHits: string[] = [];
async function newPage(tok: string, width = 1440): Promise<{ p: Page; asked: () => number }> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, tok);
  let n = 0;
  ctx.on("request", (r) => { if (/stripe\.com/.test(r.url())) stripeHits.push(r.url()); if (r.url().includes("/api/platform/billing/banner")) n++; });
  p.on("pageerror", (e) => errors.push(String(e)));
  return { p, asked: () => n };
}
/** Opens a page and waits for it to be ready, then for the banner's read to settle. */
const visit = async (p: Page, path: string, ready: string) => { await p.goto(`${BASE}${path}`); await p.locator(ready).first().waitFor({ timeout: 30_000 }); await p.waitForLoadState("networkidle"); };
const banner = async (p: Page) => (await p.locator("[data-trial-banner]").count()) ? { tone: await p.locator("[data-trial-banner]").getAttribute("data-trial-banner"), text: (await p.locator("[data-trial-banner]").innerText()).replace(/\s+/g, " ") } : null;
const HOME = ["/home", "[data-home]"] as const, TEAM = ["/platform/team", "[data-seat-line]"] as const;
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

try {
  // The rule itself (the read and Plan and billing count alike): a part day counts as a day; 0 on the last day and after.
  const now = Date.parse("2026-11-22T12:00:00Z");
  ok("PF-16 banner rule pass: 2.5 days ahead → 3; 14 days → 14", bannerDaysLeft(new Date(now + 2.5 * 86_400_000), now) === 3 && bannerDaysLeft(new Date(now + 14 * 86_400_000), now) === 14);
  ok("PF-16 banner rule fail: an end already passed → 0, never negative", bannerDaysLeft(new Date(now - 86_400_000), now) === 0);

  const oTok = await signIn(OWNER), adTok = await signIn(AD.email), coTok = await signIn(CO.email);
  const { p } = await newPage(oTok);

  // ------------------------------------------------------------------------------------------------ B1: 14 days, neutral
  trial("14 days");
  const r14 = await read(oTok);
  ok("PF-16 B1 pass: 14 days left → 200 { show, daysLeft 14, tone neutral, cardOnFile false } from the stored trial end", r14.status === 200 && r14.body?.show === true && r14.body.daysLeft === 14 && r14.body.tone === "neutral" && r14.body.cardOnFile === false, r14);
  await visit(p, ...HOME); const h14 = await banner(p);
  await visit(p, ...TEAM); const t14 = await banner(p);
  ok("PF-16 B1 pass: Home and Team each show the neutral banner 'Free trial: 14 days left'", h14?.tone === "neutral" && t14?.tone === "neutral" && /Free trial: 14 days left/.test(h14.text) && /Free trial: 14 days left/.test(t14.text), { h14, t14 });
  await shot(p, "b1-team-14-days-1440");
  trial("3 days 12 hours");   // 3.5 days → 4 left: the amber edge's other side
  const r4 = await read(oTok);
  ok("PF-16 B1 fail (the edge): 4 days left is not amber (amber only in the last 3 days)", r4.status === 200 && r4.body?.daysLeft === 4 && r4.body.tone === "neutral", r4);

  // ------------------------------------------------------------------------------------------------ B2: 3 days, amber
  trial("2 days 12 hours");
  const r3 = await read(oTok);
  ok("PF-16 B2 pass: 2.5 days stored → 3 days left, tone amber", r3.status === 200 && r3.body?.daysLeft === 3 && r3.body.tone === "amber", r3);
  await visit(p, ...HOME); const h3 = await banner(p);
  await shot(p, "b2-home-3-days-amber-1440");
  await visit(p, ...TEAM); const t3 = await banner(p);
  ok("PF-16 B2 pass: Home and Team each show the amber banner 'Free trial: 3 days left'", h3?.tone === "amber" && t3?.tone === "amber" && /Free trial: 3 days left/.test(h3.text) && /Free trial: 3 days left/.test(t3.text), { h3, t3 });
  ok("PF-16 B2 pass: with no card on file the Owner is offered 'Add a card' (to Plan and billing)", (await p.locator("[data-trial-banner-card]").getAttribute("href")) === "/settings/billing" && /Add a card before then/.test(t3?.text ?? ""), t3);
  await p.locator("[data-trial-banner-card]").click(); await p.locator("[data-billing-summary]").waitFor({ timeout: 30_000 });
  ok("PF-16 B2 pass: 'Add a card' opens Plan and billing, which still shows the banner, with no link to itself (break m6)", (await banner(p))?.tone === "amber" && (await p.locator("[data-trial-banner-card]").count()) === 0);

  // ------------------------------------------------------------------------------------------------ B3: no trial
  sql(`update platform_subscription set status = 'ACTIVE', trial_ends_at = now() + interval '5 days', current_period_end = now() + interval '20 days' where id = '${SUB}' returning id`);
  const rNo = await read(oTok);
  await visit(p, ...HOME); const hNo = await banner(p);
  await visit(p, ...TEAM); const tNo = await banner(p);
  ok("PF-16 B3 fail: a firm not in a trial → { show: false } and no banner on Home or Team", rNo.status === 200 && rNo.body?.show === false && Object.keys(rNo.body).length === 1 && !hNo && !tNo, { rNo, hNo, tNo });
  await shot(p, "b3-home-no-trial-1440");

  // A held firm whose subscription row is still TRIAL (out of step): no banner (break m3).
  trial("10 days");
  const firmWas = sql(`select status from platform_firm where id = '${A}'`);
  sql(`update platform_firm set status = 'PAYMENT_HOLD' where id = '${A}' returning id`);
  const rHeld = await read(oTok);
  sql(`update platform_firm set status = '${firmWas}' where id = '${A}' returning id`);
  const rBack = await read(oTok);
  ok("PF-16 B3 fail: a held firm with its row still TRIAL → { show: false }; the same row once the hold ends → the banner", rHeld.status === 200 && rHeld.body?.show === false && rBack.body?.show === true, { rHeld, rBack });

  // ------------------------------------------------------------------------------------------------ B6: the end passed
  trial("-2 days");
  const rPast = await read(oTok);
  ok("PF-16 B6 pass: a stored end two days ago → daysLeft 0, amber (the record not yet moved by Stripe's event)", rPast.status === 200 && rPast.body?.show === true && rPast.body.daysLeft === 0 && rPast.body.tone === "amber", rPast);
  await visit(p, ...HOME); const hPast = await banner(p);
  ok("PF-16 B6 fail: the passed end reads 'Free trial: ended on …', never 'ends today', and asks for no card", /Free trial: ended on /.test(hPast?.text ?? "") && !/ends today|days? left/.test(hPast?.text ?? "") && (await p.locator("[data-trial-banner-card]").count()) === 0, hPast);
  await shot(p, "b6-home-ended-1440");

  // ------------------------------------------------------------------------------------- B7: cancel, card, Stripe down
  {
    let mode: "cancel" | "card" | "down" = "cancel";
    const stub = { subscription: async () => { if (mode === "down") throw new Error("Stripe unreachable (stub)"); return { hasCard: mode === "card", cancelAtPeriodEnd: mode === "cancel" }; } };
    const reader = new BillingBanner(db as never, { billing: stub, clock: { now: () => new Date() } } as unknown as BillingPorts);
    trial("10 days"); sql(`update platform_subscription set stripe_subscription_id = 'sub_pf16bStub${run}' where id = '${SUB}' returning id`);
    const who = { firmId: A, staffId: "pf16b", keys: [], roles: [] } as never;
    const c = await reader.read(who); mode = "card"; const k = await reader.read(who); mode = "down"; const d = await reader.read(who);
    ok("PF-16 B7 pass: a trial set to cancel → cancelAtPeriodEnd true from BillingPort; a card saved → cardOnFile true", (c as { cancelAtPeriodEnd?: unknown }).cancelAtPeriodEnd === true && (k as { cardOnFile?: unknown }).cardOnFile === true && (k as { cancelAtPeriodEnd?: unknown }).cancelAtPeriodEnd === false, { c, k });
    ok("PF-16 B7 fail: Stripe unreachable → card and cancel null (never guessed), the days still shown", d.show === true && d.cardOnFile === null && d.cancelAtPeriodEnd === null && d.daysLeft === 10, d);
    sql(`update platform_subscription set stripe_subscription_id = null where id = '${SUB}' returning id`);
    const rewrite = async (patch: Record<string, unknown>) => { const v = await newPage(oTok); await v.p.route("**/api/platform/billing/banner", async (rt) => { const res = await rt.fetch(); return rt.fulfill({ response: res, json: { ...(await res.json()), ...patch } }); }); await visit(v.p, ...HOME); const b = await banner(v.p), asks = await v.p.locator("[data-trial-banner-card]").count(); await v.p.context().close(); return { b, asks }; };
    const onCancel = await rewrite({ cardOnFile: true, cancelAtPeriodEnd: true }), onCard = await rewrite({ cardOnFile: true, cancelAtPeriodEnd: false }), onDown = await rewrite({ cardOnFile: null, cancelAtPeriodEnd: null });
    ok("PF-16 B7 fail: a trial set to cancel says no payment will be taken, and never 'Card saved' or 'Add a card'", /no payment will be taken/.test(onCancel.b?.text ?? "") && !/Card saved|Add a card/.test(onCancel.b?.text ?? "") && onCancel.asks === 0, onCancel);
    ok("PF-16 B7 pass: a card saved → 'Card saved. Your first payment is on …', no card ask", /Card saved\. Your first payment is on /.test(onCard.b?.text ?? "") && onCard.asks === 0, onCard);
    ok("PF-16 B7 fail: Stripe down → the days left with no card claim either way", /Free trial: 10 days left/.test(onDown.b?.text ?? "") && !/Card saved|Add a card/.test(onDown.b?.text ?? "") && onDown.asks === 0, onDown);
  }

  // ------------------------------------------------------------------------------------------------ B4: who sees it
  trial("2 days 12 hours");
  const rCo = await read(coTok), rAd = await read(adTok);
  ok("PF-16 B4 fail: a Case Officer → 403 on the read", rCo.status === 403, rCo);
  ok("PF-16 B4 pass: an Admin → 200 with the days left", rAd.status === 200 && rAd.body?.daysLeft === 3, rAd);
  const co = await newPage(coTok);
  await visit(co.p, ...HOME);
  ok("PF-16 B4 fail: the Case Officer's Home shows no banner and never asks for it", !(await banner(co.p)) && co.asked() === 0, { asked: co.asked() });
  await co.p.context().close();
  const ad = await newPage(adTok);
  await visit(ad.p, ...HOME);
  ok("PF-16 B4 pass: the Admin's Home shows the amber banner", (await banner(ad.p))?.tone === "amber");
  await ad.p.context().close();

  // ------------------------------------------------------------------------------------------------ B5: sizes and axe
  for (const [tone, interval] of [["amber", "2 days 12 hours"], ["neutral", "14 days"]] as const) {
    trial(interval);
    for (const width of [400, 1024, 1440]) {
      const v = await newPage(oTok, width);
      await visit(v.p, ...HOME);
      const b = await banner(v.p), wide = await v.p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const axe = await new AxeBuilder({ page: v.p }).withTags(TAGS).analyze();
      ok(`PF-16 B5: Home with the ${tone} banner at ${width} px: the banner shows, no sideways scroll, axe clean (no violation)`, b?.tone === tone && wide <= 1 && axe.violations.length === 0, { b, wide, axe: axe.violations.map((x) => `${x.id}: ${x.nodes[0]?.target?.join(" ")}`) });
      if (width !== 1440 || tone === "neutral") await shot(v.p, `b5-home-${tone}-${width}`);
      await v.p.context().close();
    }
  }
  ok("PF-16: no Stripe page or call from the browser, and no page error", stripeHits.length === 0 && errors.length === 0, { stripeHits, errors: errors.slice(0, 3) });
} finally {
  const k = JSON.parse(kept) as { status: string; stripe_customer_id: string | null; stripe_subscription_id: string | null; trial_ends_at: string | null; current_period_end: string | null };
  const q = (v: string | null) => v === null ? "null" : `'${v}'`;
  sql(`update platform_subscription set status = '${k.status}', stripe_customer_id = ${q(k.stripe_customer_id)}, stripe_subscription_id = ${q(k.stripe_subscription_id)}, trial_ends_at = ${q(k.trial_ends_at)}, current_period_end = ${q(k.current_period_end)} where id = '${SUB}' returning id`);
  sql(`update platform_role_grant set ended_at = now(), ended_by = 'seed:PF-16b-test' where staff_id in ('${AD.id}', '${CO.id}') and ended_at is null returning id`);
  await browser.close(); await db.$disconnect();
}
process.exitCode = summary() ? 1 : 0;
