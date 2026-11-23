// PF-13 part 3 (R1.23 "client pages … show them"; AG-1-6, AG-1-9, AG-16-2; P-629; FO-3w option (b); Lead 4, 22 Nov): the
// firm's brand on its public booking pages, walked in a browser on an isolated copy (its own database and port, never :4400).
// Firm A (sample-firm) gets a colour, a tagline, a logo, a favicon and a banner through the Owner's API (the Branding page is
// PF-13 part 2's and has its own check); firm B (sample-solo) sets nothing. Each line has a pass and a fail:
//   BB1 firm A's list page /book/sample-firm draws its banner, its logo beside the name, its tagline, its colour on the header's
//       rule and the primary buttons, and uses its favicon; fail: before anything is set the same page draws none of them;
//   BB2 the same brand on the type page /book/sample-firm/free and, after a real booking, on the manage page by its link;
//   BB3 firm B's page never shows firm A's brand: no image of firm A's, no #7a1f4e, no request to firm A's branding, the app's
//       own favicon; and B shows the neutral look (ExpatReady's neutral colour #1f4e79, no image, no tagline; AG-16-2);
//   BB3b firm A → firm B inside the app (no reload), then Back: B shows nothing of A's, the app's favicon; A's brand comes back;
//   BB4 a page that is not found (/book/no-such-firm) shows no brand (its branding read, started with the page's, answers 404);
//   BB4b the page's own read refused (429): no brand, although the brand's read answers;
//   BB7 firm B's booking opened under firm A's address (manage link): no brand of A's; fail: under its own address, B's;
//   BB8 a slow brand read: loading state, then drawn once (1.5 s: with the brand); fail: slower than the 3 s wait, drawn
//       without it, and the late answer changes nothing;
//   BB5 a replaced logo: the page that still holds the old link shows no broken image;
//   BB6 keyboard (Tab reaches the first choice; the brand images take no focus), axe-core WCAG 2.2 A/AA (colour contrast of the
//       brand buttons included) at 375, 1024 and 1440 px with no sideways scroll, on A's and B's pages; fail: the same axe run
//       finds an unlabelled button we add.
// Sample firms only. US$0, no model call; live AI off. Screenshots (deviceScaleFactor 1) in product/screens/PF-13c/screenshots/.
// Run from prototype/:
//   zsh studio/tools/isolated.sh pf13c 4442 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_pf13c_booking_brand_browser.ts 4442 xr_studio_pf13c
// (run-suites.sh reads that line; by hand, stop the copy afterwards: zsh studio/tools/isolated.sh pf13c 4442 stop)
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { chromium, type Locator, type Page } from "playwright";
import { copyFirmHoursTo } from "../api/src/front-office/booking-seed.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4442), process.argv[3] ?? "xr_studio_pf13c"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "PF-13c", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
const one = async (q: string) => String(((await db.$queryRawUnsafe(q)) as Record<string, unknown>[])[0]?.v ?? "");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let b: unknown = text; try { b = JSON.parse(text); } catch { /* text */ } return { status: r.status, body: b };
};
const upload = async (t: string, kind: string, bytes: Uint8Array): Promise<Ans> => {
  const form = new FormData(); form.append("file", new Blob([new Uint8Array(bytes)], { type: "image/png" }), `${kind}.png`);
  const r = await fetch(`${BASE}/api/platform/branding/${kind}`, { method: "PUT", headers: { authorization: `Bearer ${t}` }, body: form });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const seen = (l: Locator, ms = 8_000) => l.first().waitFor({ timeout: ms }).then(() => true, () => false);

// ------------------------------------------------------------------------------------------------ Sample images, made here
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const enc = (s: string) => new TextEncoder().encode(s);
const chunk = (type: string, data: Uint8Array) => { const head = new Uint8Array(8); new DataView(head.buffer).setUint32(0, data.length); head.set(enc(type), 4); const crc = new Uint8Array(4); new DataView(crc.buffer).setUint32(0, crc32(cat(enc(type), data)) >>> 0); return cat(head, data, crc); };
function png(w: number, h: number, rgb: [number, number, number]): Uint8Array {
  const ihdr = new Uint8Array(13); const v = new DataView(ihdr.buffer); v.setUint32(0, w); v.setUint32(4, h); ihdr.set([8, 2, 0, 0, 0], 8);
  const raw = new Uint8Array(h * (1 + 3 * w)); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (1 + 3 * w) + 1 + 3 * x);
  return cat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", new Uint8Array(deflateSync(raw))), chunk("IEND", new Uint8Array(0)));
}
const LOGO = png(96, 48, [122, 31, 78]), LOGO2 = png(96, 48, [20, 90, 50]), FAVICON = png(32, 32, [122, 31, 78]), BANNER = png(600, 120, [230, 238, 245]);
const COLOUR = "#7a1f4e", RGB = "rgb(122, 31, 78)", NEUTRAL = "#1f4e79", NEUTRAL_RGB = "rgb(31, 78, 121)", TAGLINE = "Immigration advice in plain words (Sample)";

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const firm = async (key: string) => ({ id: await one(`select id as v from platform_firm where key = '${key}'`), name: await one(`select operating_name as v from platform_firm where key = '${key}'`) });
const A = await firm("sample-firm"), B = await firm("sample-solo");
const host = async (firmId: string) => one(`select id as v from platform_staff where firm_id = '${firmId}' and status = 'ACTIVE' order by created_at limit 1`);
for (const f of [A, B]) {
  if (await one(`select count(*)::text as v from fo_consultation_type where firm_id = '${f.id}' and slug = 'free'`) !== "0") continue;
  const h = await host(f.id);
  await copyFirmHoursTo(db, f.id, [h]);
  await db.foConsultationType.create({ data: { firmId: f.id, slug: "free", name: "Free consultation", modes: ["VIDEO"], hostStaffIds: [h], minutes: 30, windowDays: 60 } });
}
const ownerEmail = await one(`select email as v from platform_staff where actor_id = 'user-R' and firm_id = '${A.id}'`);
const TR = (await api(null, "POST", "/platform/session/local", { firmKey: "sample-firm", email: ownerEmail, secondStep: true })).body?.token as string;
const [pubA0, pubB0] = [(await api(null, "GET", "/public/firms/sample-firm/branding")).body, (await api(null, "GET", "/public/firms/sample-solo/branding")).body];
ok("PF-13c setup: both Sample firms have a public type \"free\"; the Owner of firm A is signed in; neither firm has a brand yet (neutral colour, no image)",
  !!A.id && !!B.id && fo.failed.length === 0 && !!TR && pubA0?.colour === NEUTRAL && !pubA0?.logo && pubB0?.colour === NEUTRAL && !pubB0?.logo, { pubA0, pubB0 });

// ------------------------------------------------------------------------------------------------ the browser
const browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errs: string[] = [];
const tab = async (width = 1440) => { const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" }); const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); return p; };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `pf13c-${name}.png`), fullPage: true });
const axe = async (p: Page) => (await p.waitForTimeout(300), await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
const ids = (v: { id: string; nodes: { target: unknown }[] }[]) => v.map((x) => `${x.id}: ${x.nodes[0]?.target}`);
const list = async (p: Page, key: string) => { await p.goto(`${BASE}/book/${key}`); return seen(p.locator("[data-type-card]"), 30_000); };
/** What the page draws of a brand, read from the page itself. */
const drawn = (p: Page) => p.evaluate(() => {
  const imgs = [...document.querySelectorAll("img")].map((i) => i.getAttribute("src") ?? "");
  const icon = document.querySelector('link[rel~="icon"]')?.getAttribute("href") ?? "";
  const header = document.querySelector("header"), button = document.querySelector<HTMLElement>("[data-type-card] a, [data-type-card] button, main a[data-slot='button'], main button[data-slot='button']");
  const brokenImgs = [...document.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth === 0).length;
  return {
    logo: imgs.filter((s) => s.includes("/branding/logo")), banner: imgs.some((s) => s.includes("/branding/banner")), icon,
    tagline: document.querySelector("[data-brand-tagline]")?.textContent ?? null, name: document.querySelector("[data-firm-name]")?.textContent ?? "",
    rule: header ? getComputedStyle(header).borderBottomColor : "", button: button ? getComputedStyle(button).backgroundColor : "", brokenImgs,
    colourAttr: document.querySelector("[data-brand-colour]")?.getAttribute("data-brand-colour") ?? null,
  };
});
/** Waits until the brand's read has been drawn (its colour attribute appears), or ms. */
/** Waits until the page has decided its brand (drawn or none), then reads colours after any transition. */
const branded = async (p: Page, ms = 15_000) => { const s = await seen(p.locator('[data-brand-state="brand"], [data-brand-state="none"]'), ms); await p.waitForTimeout(400); return s; };
const state = (p: Page) => p.locator("[data-brand-state]").first().getAttribute("data-brand-state");
/** A visitor books firm <key>'s type "free" on its page; the manage link from the confirmation. */
async function book(p: Page, key: string): Promise<string> {
  await list(p, key); await p.locator(`a[href="/book/${key}/free"]`).click(); await p.getByRole("heading", { name: "Choose a time" }).waitFor({ timeout: 20_000 });
  const days = p.locator('[role="group"] button:not([disabled])');
  for (let i = 0; i < 3 && (await days.count()) === 0; i++) { await p.getByRole("button", { name: "Next month" }).click(); await wait(800); }
  await days.first().click(); await p.locator("[data-day-times] li button").first().click();
  await p.getByRole("heading", { name: "Your details" }).waitFor({ timeout: 20_000 });
  await p.getByLabel("Given names").fill("Visitor"); await p.getByLabel("Family name").fill("Sample PF13c"); await p.getByLabel("Email").fill(`pf13c-${key}-${Date.now()}@example.com`);
  await wait(3500);   // the form's minimum fill time
  await p.getByRole("button", { name: "Book this time" }).click();
  await p.locator('[data-public-state="booked"]').waitFor({ timeout: 20_000 });
  return (await p.locator('a[href*="/manage#"]').first().getAttribute("href")) ?? "";
}
const reach = async (p: Page, target: Locator, max = 40) => {
  for (let i = 0; i < max; i++) { if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return true; await p.keyboard.press("Tab"); }
  return false;
};

let failed = 0;
try {
  // ---------------------------------------------------------------------------------------------- BB1 fail first: nothing set yet
  const p0 = await tab(); const open0 = await list(p0, "sample-firm"); await branded(p0); const d0 = await drawn(p0);
  ok("R1.23 PF-13c BB1 fail (before anything is set): firm A's booking page draws no logo, banner, favicon or tagline of its own and paints the neutral colour on its rule, never #7a1f4e",
    open0 && d0.logo.length === 0 && !d0.banner && !d0.icon.includes("/branding/") && d0.tagline === null && d0.rule === NEUTRAL_RGB && d0.button !== RGB, d0);
  await p0.context().close();

  // ---------------------------------------------------------------------------------------------- set firm A's brand (Owner's API)
  const put = await api(TR, "PUT", "/platform/branding", { colour: COLOUR, tagline: TAGLINE });
  const ups = [await upload(TR, "logo", LOGO), await upload(TR, "favicon", FAVICON), await upload(TR, "banner", BANNER)];
  ok("PF-13c setup: firm A's colour, tagline, logo, favicon and banner are stored (PUT 200, three uploads 200)", put.status === 200 && ups.every((u) => u.status === 200), { put: put.status, ups: ups.map((u) => u.status) });

  // ---------------------------------------------------------------------------------------------- BB1
  const p = await tab();
  const requests: string[] = []; p.on("request", (r) => requests.push(new URL(r.url()).pathname));
  await list(p, "sample-firm"); await branded(p); await p.locator("[data-brand-logo]").waitFor({ timeout: 15_000 });
  const d1 = await drawn(p);
  ok("R1.23 PF-13c BB1: firm A's /book/sample-firm draws its banner, its logo beside the name, its tagline, its colour on the header's rule and the Choose button, and uses its favicon",
    d1.logo.length === 1 && d1.banner && d1.icon.includes("/api/public/firms/sample-firm/branding/favicon?v=") && d1.tagline === TAGLINE && d1.name === A.name && d1.rule === RGB && d1.button === RGB && d1.brokenImgs === 0, { rule: d1.rule, button: d1.button, broken: d1.brokenImgs, name: d1.name, logo: d1.logo.length, banner: d1.banner });
  const logoAlt = await p.locator("[data-brand-logo]").getAttribute("alt"), bannerAlt = await p.locator("[data-brand-banner]").getAttribute("alt");
  ok("R1.23 PF-13c BB1: the logo says whose it is (alt \"<firm> logo\"); the banner is decorative (alt \"\")", logoAlt === `${A.name} logo` && bannerAlt === "", { logoAlt, bannerAlt });
  const vA = await axe(p); ok("R1.23 PF-13c BB6: firm A's branded list page has no WCAG 2.2 A/AA violation (the white text on the brand colour included)", vA.length === 0, ids(vA));
  await shot(p, "1-firm-a-list-1440");

  // ---------------------------------------------------------------------------------------------- BB2 type page and manage page
  await p.locator('a[href="/book/sample-firm/free"]').click(); await p.getByRole("heading", { name: "Choose a time" }).waitFor({ timeout: 20_000 });
  await branded(p); await p.locator("[data-brand-logo]").waitFor({ timeout: 15_000 });
  const d2 = await drawn(p);
  const vT = await axe(p); ok("R1.23 PF-13c BB6: firm A's branded type page has no WCAG 2.2 A/AA violation", vT.length === 0, ids(vT));
  await shot(p, "2-firm-a-type-1440");
  const manage = await book(p, "sample-firm");
  await p.goto(`${BASE}${manage}`); await p.locator('[data-public-state="manage"]').waitFor({ timeout: 20_000 });
  await branded(p); await p.locator("[data-brand-logo]").waitFor({ timeout: 15_000 });
  const d3 = await drawn(p);
  ok("R1.23 PF-13c BB2: the type page and, after a real booking, the manage page by its link carry the same brand (logo, banner, tagline, colour on the rule, favicon)",
    [d2, d3].every((d) => d.logo.length === 1 && d.banner && d.tagline === TAGLINE && d.rule === RGB && d.icon.includes("/branding/favicon")), { d2, d3 });
  await shot(p, "3-firm-a-manage-1440");

  // ---------------------------------------------------------------------------------------------- BB3 firm B
  requests.length = 0;
  await list(p, "sample-solo"); await branded(p); await wait(500);
  const dB = await drawn(p);
  ok("R1.23 PF-13c BB3: firm B's page never shows firm A's brand: no image of firm A's, no #7a1f4e anywhere on its rule or buttons, no request to firm A's branding, the app's own favicon",
    dB.logo.length === 0 && !dB.banner && !dB.icon.includes("/branding/") && dB.rule !== RGB && dB.button !== RGB && !requests.some((r) => r.includes("/firms/sample-firm/")) && dB.name === B.name, { dB, aRequests: requests.filter((r) => r.includes("/firms/sample-firm/")) });
  ok("R1.23 PF-13c BB3: firm B, with nothing set, shows the neutral look: ExpatReady's neutral colour #1f4e79 on its rule and buttons, no logo, no banner, no tagline (AG-16-2)",
    dB.colourAttr === NEUTRAL && dB.rule === NEUTRAL_RGB && dB.button === NEUTRAL_RGB && dB.tagline === null && dB.brokenImgs === 0, dB);
  const vB = await axe(p); ok("R1.23 PF-13c BB6: firm B's neutral page has no WCAG 2.2 A/AA violation", vB.length === 0, ids(vB));
  await shot(p, "4-firm-b-neutral-1440");

  // ---------------------------------------------------------------------------------------------- BB3b firm A → firm B inside the app
  // Review finding 1: a leak could only come from the client: the brand's cache (keyed by the firm) or a favicon left behind.
  await list(p, "sample-firm"); await branded(p); await p.locator("[data-brand-logo]").waitFor({ timeout: 15_000 });
  await p.evaluate(() => { history.pushState({}, "", "/book/sample-solo"); dispatchEvent(new PopStateEvent("popstate")); });
  await p.locator("[data-firm-name]", { hasText: B.name }).waitFor({ timeout: 20_000 }); await branded(p);
  const dS = await drawn(p);
  await p.goBack(); await p.locator("[data-firm-name]", { hasText: A.name }).waitFor({ timeout: 20_000 }); await branded(p); await p.locator("[data-brand-logo]").waitFor({ timeout: 15_000 });
  const dBack = await drawn(p);
  ok("R1.23 PF-13c BB3b: moving from firm A's page to firm B's inside the app (no reload): B shows no image of A's, not #7a1f4e, the neutral colour and the app's own favicon; Back shows A's brand again",
    dS.logo.length === 0 && !dS.banner && !dS.icon.includes("/branding/") && dS.rule !== RGB && dS.button !== RGB && dS.colourAttr === NEUTRAL && dBack.logo.length === 1 && dBack.rule === RGB && dBack.icon.includes("/sample-firm/branding/favicon"), { dS, back: { logo: dBack.logo.length, rule: dBack.rule, icon: dBack.icon } });

  // ---------------------------------------------------------------------------------------------- BB7 a manage link under another firm's address
  // Break M1, review finding 2: the booking read names its firm, never its key; a firm B booking opened under firm A's address
  // must not wear firm A's brand.
  const manageB = await book(p, "sample-solo");
  await p.goto(`${BASE}${manageB}`); await p.locator('[data-public-state="manage"]').waitFor({ timeout: 20_000 }); await branded(p);
  const own = await drawn(p), ownState = await state(p);
  await p.goto(`${BASE}${manageB.replace("/book/sample-solo/", "/book/sample-firm/")}`); await p.locator('[data-public-state="manage"]').waitFor({ timeout: 20_000 }); await branded(p);
  const cross = await drawn(p), crossState = await state(p);
  ok("R1.23 PF-13c BB7: firm B's booking opened under firm A's address (/book/sample-firm/manage#<B's token>) shows no brand of A's: no logo, banner or tagline, no #7a1f4e, the app's own favicon; fail: under its own address it shows B's brand (neutral)",
    crossState === "none" && cross.logo.length === 0 && !cross.banner && cross.tagline === null && cross.rule !== RGB && cross.button !== RGB && !cross.icon.includes("/branding/") && cross.name === B.name
      && ownState === "brand" && own.colourAttr === NEUTRAL, { crossState, cross: { logo: cross.logo.length, rule: cross.rule, icon: cross.icon, name: cross.name }, ownState, own: own.colourAttr });
  await shot(p, "6-cross-firm-manage-1440");

  // ---------------------------------------------------------------------------------------------- BB4 not found
  requests.length = 0;
  await p.goto(`${BASE}/book/no-such-firm`); await p.locator('[data-public-state="not-found"]').waitFor({ timeout: 20_000 }); await wait(500);
  const dN = await drawn(p);
  ok("R1.23 PF-13c BB4: a page that is not found shows no brand (its one branding read answers 404 and draws nothing)", dN.colourAttr === null && dN.logo.length === 0 && !dN.icon.includes("/branding/"), { requests: requests.filter((r) => r.includes("/branding")), dN });

  // ---------------------------------------------------------------------------------------------- BB4b the page's own read refused
  // Review finding 3: the brand is drawn only once the page has found its firm, even when the brand's own read answers.
  await p.route("**/api/public/firms/sample-firm/book", (r) => r.fulfill({ status: 429, contentType: "application/problem+json", body: JSON.stringify({ status: 429, title: "Too many requests" }) }));
  await p.goto(`${BASE}/book/sample-firm`); await p.locator('[data-public-state="error"]').waitFor({ timeout: 20_000 }); await wait(1500);
  const dE = await drawn(p), brandOk = (await api(null, "GET", "/public/firms/sample-firm/branding")).status;
  ok("R1.23 PF-13c BB4b: when the page's own read is refused (429) it draws no brand, although firm A's brand read answers 200", brandOk === 200 && dE.colourAttr === null && dE.logo.length === 0 && !dE.banner && !dE.icon.includes("/branding/"), { brandOk, dE });
  await p.unroute("**/api/public/firms/sample-firm/book");
  await p.context().close();

  // ---------------------------------------------------------------------------------------------- BB8 a slow brand read
  // Break M2: the page waits for the brand behind its loading state, then draws once; nothing changes colour or moves after.
  for (const [delay, drawsBrand] of [[1500, true], [4500, false]] as const) {
    const s8 = await tab();
    await s8.route("**/api/public/firms/sample-firm/branding", async (r) => { await wait(delay); await r.continue(); });
    await s8.goto(`${BASE}/book/sample-firm`);
    await wait(800); const early = { cards: await s8.locator("[data-type-card]").count(), st: await state(s8) };
    await s8.locator("[data-type-card]").first().waitFor({ timeout: 20_000 }); await wait(400);
    const at = async () => ({ y: (await s8.locator("[data-type-card]").first().boundingBox())?.y ?? -1, ...(await drawn(s8)) });
    const first = await at(); await wait(delay + 1500); const later = await at();
    ok(drawsBrand
      ? "R1.23 PF-13c BB8: with the brand read slowed to 1.5 s the page shows its loading state, then draws the cards once with the brand; later the cards have not moved and the colour has not changed"
      : "R1.23 PF-13c BB8 fail: a brand read slower than the wait (4.5 s) draws the page without the brand at about 3 s, and the late answer changes nothing",
      early.cards === 0 && early.st === "waiting" && first.y === later.y && first.button === later.button && first.logo.length === later.logo.length && (drawsBrand ? first.button === RGB && first.logo.length === 1 : first.button !== RGB && first.logo.length === 0 && first.colourAttr === null),
      { early, first: { y: first.y, button: first.button, logo: first.logo.length }, later: { y: later.y, button: later.button, logo: later.logo.length } });
    await s8.context().close();
  }

  // ---------------------------------------------------------------------------------------------- BB5 a logo link that stops answering
  // A replaced image's old link answers 404 (part 1b); a page opened before the change still names it. Browsers keep the old
  // bytes for a day (Cache-Control), so the lost answer is made here: the logo's request answers 404 on a fresh tab.
  const q = await tab();
  await q.route("**/api/public/firms/sample-firm/branding/logo**", (r) => r.fulfill({ status: 404, contentType: "application/problem+json", body: "{}" }));
  await list(q, "sample-firm"); await branded(q); await q.locator("[data-brand-banner]").waitFor({ timeout: 15_000 }); await wait(1500);
  const lost = await drawn(q);
  ok("R1.23 PF-13c BB5: when the logo's link answers 404 the page shows no broken image: the logo is taken away, the name, tagline, banner and colour stay",
    lost.brokenImgs === 0 && await q.locator("[data-brand-logo]").count() === 0 && lost.banner && lost.tagline === TAGLINE && lost.rule === RGB, { broken: lost.brokenImgs, logo: lost.logo.length, banner: lost.banner, rule: lost.rule });
  const replaced = await upload(TR, "logo", LOGO2), oldAnswers = (await fetch(`${BASE}${d1.logo[0]}`)).status;
  ok("R1.23 PF-13c BB5: a replaced logo's old link answers 404 (part 1b), which is the case above", replaced.status === 200 && oldAnswers === 404, { replaced: replaced.status, oldAnswers });
  await q.context().close();

  // ---------------------------------------------------------------------------------------------- BB6 keyboard and widths
  const k = await tab(); await list(k, "sample-firm"); await k.locator("[data-brand-logo]").waitFor({ timeout: 15_000 });
  const firstChoice = k.locator('a[href="/book/sample-firm/free"]');
  const reached = await reach(k, firstChoice);
  const imgFocus = await k.evaluate(() => [...document.querySelectorAll("[data-brand-logo], [data-brand-banner]")].some((e) => (e as HTMLElement).tabIndex >= 0));
  await k.keyboard.press("Enter"); const went = await k.getByRole("heading", { name: "Choose a time" }).waitFor({ timeout: 20_000 }).then(() => true, () => false);
  ok("R1.23 PF-13c BB6: by keyboard Tab reaches the first choice and Enter opens it; the brand images take no focus", reached && !imgFocus && went, { reached, imgFocus, went });
  await k.context().close();
  for (const w of [375, 1024, 1440]) for (const key of ["sample-firm", "sample-solo"]) {
    const t = await tab(w); await list(t, key); await branded(t); if (key === "sample-firm") await t.locator("[data-brand-logo]").waitFor({ timeout: 15_000 });
    const v = await axe(t), wide = await t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    ok(`R1.23 PF-13c BB6: /book/${key} at ${w} px has no WCAG 2.2 A/AA violation and no sideways scroll`, v.length === 0 && wide, { v: ids(v), wide });
    if (w !== 1440) await shot(t, `5-${key}-${w}`);
    if (w === 375 && key === "sample-firm") {
      await t.evaluate(() => { document.querySelector("header")!.appendChild(document.createElement("button")); });
      const bad = await axe(t);
      ok("R1.23 PF-13c BB6 fail: the same axe run finds the unlabelled button we add (the check can fail)", bad.some((x) => x.id === "button-name"), bad.map((x) => x.id));
    }
    await t.context().close();
  }
  ok("R1.23 PF-13c: no page error in any tab", errs.length === 0, errs);
} catch (e) {
  failed++; console.log(`FAIL  PF-13c: the check stopped: ${(e as Error).stack?.slice(0, 600)}`);
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() + failed ? 1 : 0);
