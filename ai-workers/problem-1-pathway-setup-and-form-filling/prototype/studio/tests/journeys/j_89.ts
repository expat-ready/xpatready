// J-89 (map row 89, R1.89: the public pricing page), written by the qa lane (22 Nov) because no j_89 was on main. It
// walks PF-5s part 1's page `/pricing` (#2608) on an isolated copy of the running app (its own database and port, never
// :4400), as a firm's owner who has no account yet. Done when (CAPABILITIES R1.89): plans, prices and trial read from the
// plan table (no number typed into the page); a plan change shows without a deploy; keyboard, 400 px, axe clean.
//   W1 Pricing lists exactly the active plans of platform_plan, fewest seats first: name, seats and trial days as stored.
//   W2 a plan change shows without a deploy: the Team plan's name and trial days are changed and the Firm plan is switched
//      off in the table; after a reload (no restart, no build) the page shows the new name and trial and no Firm card.
//      Fails on the fake (P-606): the same judge is read before the change and must not hold.
//   W3 no number typed into the page: every digit on a plan card is one of that plan's stored values, before and after W2.
//   W4 keyboard only: Tab to Billing period, Right arrow to Yearly, Tab to the first plan's Start free trial, Enter:
//      Sign up opens with that plan and "yearly" on its plan line (the walk ends at R1.90's first step).
//   W5 400, 1024 and 1440 px: no sideways scroll and no WCAG 2.2 A/AA violation (axe); no page error.
//   W6 the prices clause, on the copy as it runs: at least one plan card shows a price, and each price shown is the one
//      GET /api/public/plans answers for that plan and period. Today this FAILS (QA-741): a copy has no Stripe key and
//      the seeded plans carry no price id, so every card reads "Price not shown"; the plan table's own
//      monthly_price_cents and yearly_price_cents are not read either (W6b sets them and reloads).
//   W7 the page's half of the prices clause, on a stand-in (said, not hidden): the browser's GET /api/public/plans is
//      answered with the copy's own answer plus Sample prices (49.00 and 490.00 CAD on the first plan); the card shows
//      "$49" per month, CAD, "+ applicable taxes"; Yearly shows "$490" per year; the other plans stay "Price not shown".
//      This is not proof of R1.89's prices: no price reaches the page from a running server here.
// Every change to the plan table is put back at the end. Plan names, trial days and prices are Sample. US$0, no model
// call, no Stripe call, no priced button (Start free trial only opens Sign up; nothing is submitted).
// Screenshots: product/screens/J-89/screenshots/. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j89 4489 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j89 4489 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_89.ts j89 4489
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const NAME = process.argv[2] ?? "j89", PORT = Number(process.argv[3] ?? 4489), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "screens", "J-89", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const PSQL = existsSync("/opt/homebrew/opt/postgresql@18/bin/psql") ? "/opt/homebrew/opt/postgresql@18/bin/psql" : "psql";
const sql = (q: string) => execFileSync(PSQL, [`postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
type Row = { code: string; name: string; seats: number; trial: number };
const stored = (): Row[] => (sql(`select code || '|' || name || '|' || seats_limit || '|' || trial_days from platform_plan where active order by seats_limit`) || "").split("\n").filter(Boolean)
  .map((l) => { const [code, name, seats, trial] = l.split("|"); return { code, name, seats: Number(seats), trial: Number(trial) }; });
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
/** What a person reads on each card. */
const cards = (p: Page) => p.locator("[data-plan]").evaluateAll((els) => els.map((e) => ({ code: e.getAttribute("data-plan") ?? "", name: e.querySelector("h2")?.textContent ?? "", text: (e as HTMLElement).innerText })));
const open = async (p: Page) => { await p.goto(`${BASE}/pricing`); await p.locator("[data-plan]").first().waitFor({ timeout: 20_000 }); };
const matches = (seen: Awaited<ReturnType<typeof cards>>, rows: Row[]) => seen.length === rows.length && rows.every((r, i) => seen[i].code === r.code && seen[i].name === r.name
  && seen[i].text.includes(`Up to ${r.seats} ${r.seats === 1 ? "seat" : "seats"}`) && seen[i].text.includes(`${r.trial}-day free trial`));
/** W3: the digits on a card, less the plan's own stored values (its name, seats and trial days). */
const strayDigits = (seen: Awaited<ReturnType<typeof cards>>, rows: Row[]) => seen.flatMap((c, i) => (c.text.replace(rows[i]?.name ?? "", "").match(/\d+/g) ?? []).filter((d) => ![String(rows[i]?.seats), String(rows[i]?.trial)].includes(d)).map((d) => `${c.code}:${d}`));

const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 200 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const before = sql(`select coalesce(json_agg(json_build_object('code', code, 'name', name, 'trial', trial_days, 'active', active, 'm', monthly_price_cents, 'y', yearly_price_cents))::text, '[]') from platform_plan`);
const restore = () => { for (const r of JSON.parse(before) as { code: string; name: string; trial: number; active: boolean; m: number | null; y: number | null }[]) sql(`update platform_plan set name = '${r.name.replace(/'/g, "''")}', trial_days = ${r.trial}, active = ${r.active}, monthly_price_cents = ${r.m ?? "null"}, yearly_price_cents = ${r.y ?? "null"} where code = '${r.code}'`); };
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));

  // ------------------------------------------------------------------------------------------ W1: the plans, as stored
  const rows0 = stored();
  const t0 = Date.now(); await open(p); const ms = Date.now() - t0;
  const seen0 = await cards(p);
  ok(`R1.89 W1: Pricing lists exactly the active plans of the plan table, fewest seats first, each with its stored name, seats and trial days (${rows0.map((r) => r.code).join(", ")}); shown in ${ms} ms`, rows0.length > 0 && matches(seen0, rows0) && ms < 3000, { seen: seen0.map((c) => c.code), ms });
  ok("R1.89 W3: no number typed into the page: every digit on a plan card is that plan's stored seats or trial days", strayDigits(seen0, rows0).length === 0, strayDigits(seen0, rows0));
  await shot(p, "w1-pricing-1440");

  // ------------------------------------------------------------------------------------------ W2: a plan change, no deploy
  const team = rows0.find((r) => r.code === "team") ?? rows0[0], gone = rows0.find((r) => r.code !== team.code && r.code === "firm") ?? rows0[rows0.length - 1];
  const want = rows0.filter((r) => r.code !== gone.code).map((r) => (r.code === team.code ? { ...r, name: "Team Plus (Sample, J-89)", trial: 21 } : r));
  ok("R1.89 W2 fail (before the change, P-606): the page does not show the changed plans yet", !matches(seen0, want));
  sql(`update platform_plan set name = 'Team Plus (Sample, J-89)', trial_days = 21 where code = '${team.code}'; update platform_plan set active = false where code = '${gone.code}'`);
  await p.reload(); await p.locator("[data-plan]").first().waitFor({ timeout: 20_000 });
  const seen1 = await cards(p);
  ok(`R1.89 W2: after a reload (no restart, no build) the page shows the plan change: '${team.code}' reads "Team Plus (Sample, J-89)" with a 21-day trial, and the switched-off '${gone.code}' plan is not offered`, matches(seen1, want), seen1.map((c) => `${c.code}: ${c.name}`));
  ok("R1.89 W3: after the change too, every digit on a card is a stored value", strayDigits(seen1, want).length === 0, strayDigits(seen1, want));
  await shot(p, "w2-plan-changed-1440");
  restore();
  await p.reload(); await p.locator("[data-plan]").first().waitFor({ timeout: 20_000 });
  ok("R1.89 W2: the plans put back in the table show again after a reload", matches(await cards(p), rows0));

  // ------------------------------------------------------------------------------------------ W4: keyboard only
  await p.keyboard.press("Tab"); await p.keyboard.press("ArrowRight");
  const period = await p.locator('input[name="period"]:checked').getAttribute("value");
  await p.keyboard.press("Tab");
  const href = await p.evaluate(() => document.activeElement?.getAttribute("href"));
  await p.keyboard.press("Enter"); await p.locator("[data-signup-plan-line]").waitFor({ timeout: 20_000 });
  const planLine = await p.locator("[data-signup-plan-line]").innerText();
  ok(`R1.89 W4: keyboard only (Tab, Right arrow, Tab, Enter): Yearly is chosen and the first plan's Start free trial opens Sign up with "${rows0[0].name}, yearly" on its plan line (R1.90's first step)`,
    period === "YEARLY" && href === `/sign-up?plan=${rows0[0].code}&period=YEARLY` && planLine.includes(rows0[0].name) && /yearly/i.test(planLine), { period, href, planLine });
  await shot(p, "w4-sign-up-1440");
  await ctx.close();

  // ------------------------------------------------------------------------------------------ W5: sizes and axe
  for (const width of [400, 1024, 1440]) {
    const c = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
    const q = await c.newPage(); q.on("pageerror", (e) => errors.push(String(e)));
    await open(q);
    const v = (await new AxeBuilder({ page: q }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
    const fits = await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    ok(`R1.89 W5: at ${width} px Pricing has no sideways scroll and no WCAG 2.2 A/AA violation (axe)`, fits && v.length === 0, { fits, axe: v.map((x) => x.id) });
    if (width === 400) await shot(q, "w5-pricing-400");
    await c.close();
  }

  // ------------------------------------------------------------------------------------------ W6: prices, as the copy runs
  const c6 = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  const r = await c6.newPage(); r.on("pageerror", (e) => errors.push(String(e)));
  const answer = async () => (await (await fetch(`${BASE}/api/public/plans`)).json()) as { plans: { code: string; monthly: { amountCents: number; currency: string } | null; yearly: { amountCents: number; currency: string } | null }[] };
  const shown = async () => r.locator("[data-plan]").evaluateAll((els) => els.map((e) => ({ code: e.getAttribute("data-plan") ?? "", price: e.querySelector("[data-price]")?.textContent ?? null })));
  const fmt = (x: { amountCents: number; currency: string }) => new Intl.NumberFormat("en-CA", { style: "currency", currency: x.currency, maximumFractionDigits: x.amountCents % 100 ? 2 : 0 }).format(x.amountCents / 100);
  await open(r);
  const a6 = await answer(), s6 = await shown();
  ok("R1.89 W6 (QA-741): on the copy as it runs, at least one plan card shows a price, and each price shown is the one GET /api/public/plans answers for that plan (Monthly)",
    s6.some((c) => c.price !== null) && s6.every((c) => { const m = a6.plans.find((x) => x.code === c.code)?.monthly ?? null; return c.price === (m ? fmt(m) : null); }), { shown: s6, notice: await r.locator("[data-prices-unavailable]").count() });
  await shot(r, "w6-no-price-1440");
  sql(`update platform_plan set monthly_price_cents = 4900, yearly_price_cents = 49000 where code = '${rows0[0].code}'`);
  await r.reload(); await r.locator("[data-plan]").first().waitFor({ timeout: 20_000 });
  const s6b = await shown();
  ok(`R1.89 W6b (QA-741): a price stored on the plan table ('${rows0[0].code}': monthly_price_cents 4900, Sample) shows on that plan's card after a reload`, s6b.find((c) => c.code === rows0[0].code)?.price === "$49", s6b);
  restore();

  // ------------------------------------------------------------------------------------------ W7: the page's half, stand-in
  await r.route("**/api/public/plans", async (route) => {
    const res = await route.fetch(), body = await res.json();
    body.plans[0].monthly = { amountCents: 4900, currency: "CAD", interval: "month" }; body.plans[0].yearly = { amountCents: 49000, currency: "CAD", interval: "year" };
    await route.fulfill({ response: res, json: body });
  });
  await r.reload(); await r.locator("[data-plan]").first().waitFor({ timeout: 20_000 });
  const first = r.locator("[data-plan]").first(), monthly = await first.innerText();
  await r.getByRole("radio", { name: "Yearly" }).check({ force: true });
  const yearly = await first.innerText(), others = (await shown()).slice(1);
  ok("R1.89 W7 (stand-in: the answer's prices are added in the browser, Sample): the card shows \"$49 per month, CAD\" with \"+ applicable taxes\"; Yearly shows \"$490 per year, CAD\"; plans with no price stay \"Price not shown\"; no \"Prices unavailable\" notice",
    /\$49\s+per month, CAD/.test(monthly) && monthly.includes("+ applicable taxes") && /\$490\s+per year, CAD/.test(yearly) && others.every((c) => c.price === null) && await r.locator("[data-prices-unavailable]").count() === 0, { monthly, yearly });
  await shot(r, "w7-stand-in-price-1440");
  await c6.close();
  ok("R1.89: no page error during the walk", errors.length === 0, errors);
} catch (e) {
  ok("R1.89: the walk ran to its end", false, String(e).slice(0, 400));
} finally {
  try { restore(); } catch { /* the copy is thrown away anyway */ }
  await browser.close();
}
process.exit(summary() ? 1 : 0);
