// qa, R1.12 (map row 12 "Screen framework, one UI kit", PF-1) gate A by screens (P-348 (3)): the first real module on
// main (FO-4 part 1, web/src/modules/front-office) is walked as a firm's Case Manager would, from the module's own address
// to the next capability's first step (the Leads list after the visible sign-in), at 400, 1024 and 1440 px, twice.
//   1 /front-office/leads opens inside the app's one Frame (data-frame header, the place line) with the kit's fields;
//     no page error, no sideways scroll, axe WCAG 2.2 AA clean (sign-in and Leads, round 1);
//   2 fail: a wrong firm key is refused in words on the form (the kit's Notice), nobody is signed in;
//   3 pass: the person types the firm key and work email, presses Sign in, and the Leads page opens (heading "Leads");
//   4 the app's own pages beside the module (/, /sign-in, /cases) still open with their headings;
//   5 the module's frame is the same component as /cases' (same header height and the same data-frame attribute shape).
// Run from prototype/ (an isolated copy; never :4400):
//   zsh studio/tools/isolated.sh qa_r112 4472 start --ttl 30 PLATFORM_IDENTITY=local \
//     && trap 'zsh studio/tools/isolated.sh qa_r112 4472 stop' EXIT \
//     && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_r112_module_seam_walk.ts 4472 xr_studio_qa_r112
// US$0, no model call; live AI off.
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4472), DBNAME = process.argv[3] ?? "xr_studio_qa_r112";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = process.env.QA_SHOTS ?? join(STUDIO, "..", "..", "product", "qa", "reports", "2026-11-16-capability-platform", "shots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
ok("R1.12 setup: the Sample firm and its front office are seeded", fo.failed.length === 0, fo.failed);
const cmEmail = sql(`select email from platform_staff where actor_id = 'user-T'`);   // Case Manager
ok("R1.12 setup: the Sample firm's Case Manager has a work email", /@/.test(cmEmail), cmEmail);
const browser = await chromium.launch({ headless: true, ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });

async function fresh(width: number): Promise<{ p: Page; errors: string[] }> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  const p = await ctx.newPage(), errors: string[] = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  return { p, errors };
}
const h1 = async (p: Page) => (await p.getByRole("heading", { level: 1 }).first().innerText({ timeout: 20_000 }).catch(() => "")).trim();
const frameShape = (p: Page) => p.evaluate(() => {
  const f = document.querySelector("[data-frame]"), h = f?.querySelector(":scope > header") as HTMLElement | null;
  return { frame: f?.getAttribute("data-frame") ?? null, headerHeight: h ? Math.round(h.getBoundingClientRect().height) : 0 };
});

for (const round of [1, 2]) for (const width of [400, 1024, 1440]) {
  const tag = `(${width} px, round ${round})`;
  const { p, errors } = await fresh(width);
  // 1 the module's own address, inside the one Frame
  await p.goto(`${BASE}/front-office/leads`);
  const head = await h1(p);
  ok(`R1.12 ${tag}: /front-office/leads opens the module's sign-in`, head === "Sign in to your firm", head);
  const shape = await frameShape(p);
  ok(`R1.12 ${tag}: the module page sits in the app's one Frame (data-frame, its header)`, shape.frame === "outside" && shape.headerHeight > 0, shape);
  ok(`R1.12 ${tag}: the place line names the module's area`, /Sales/.test(await p.locator("[data-where]").innerText().catch(() => "")));
  ok(`R1.12 ${tag}: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  if (round === 1) {
    const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
    ok(`R1.12 ${tag}: axe finds no WCAG A/AA violation on the module's sign-in`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined);
    await p.screenshot({ path: join(SHOTS, `r112-module-sign-in-${width}.png`), fullPage: true });
  }
  // 2 fail: wrong firm key, refused in words on the form
  await p.getByLabel("Firm key").fill("no-such-firm");
  await p.getByLabel("Work email").fill(cmEmail);
  await p.getByRole("button", { name: "Sign in" }).click();
  const notice = p.getByText("Not signed in");
  await notice.waitFor({ timeout: 15_000 }).catch(() => {});
  const noticeText = (await notice.locator("xpath=ancestor::*[1]").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok(`R1.12 ${tag}: a wrong firm key is refused in words on the form, still the sign-in`, (await notice.count()) > 0 && (await h1(p)) === "Sign in to your firm", noticeText);
  // 3 pass: the person signs in and reaches the Leads list (the next capability's first step)
  await p.getByLabel("Firm key").fill("sample-firm");
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.getByRole("heading", { level: 1, name: "Leads" }).waitFor({ timeout: 20_000 }).catch(() => {});
  const after = await h1(p);
  ok(`R1.12 ${tag}: typed sign-in opens the Leads page inside the same Frame`, after === "Leads" && (await frameShape(p)).frame === "outside", after);
  if (round === 1) {
    const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
    ok(`R1.12 ${tag}: axe finds no WCAG A/AA violation on the module's Leads page`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined);
    await p.screenshot({ path: join(SHOTS, `r112-module-leads-${width}.png`), fullPage: true });
  }
  // 4 the app's own pages beside the module
  for (const [path, want] of [["/", "Immigration programs"], ["/sign-in", "Who are you today?"], ["/cases", "Cases"]] as const) {
    await p.goto(`${BASE}${path}`);
    const got = await h1(p);
    ok(`R1.12 ${tag}: ${path} still opens with "${want}" beside the module`, got === want, got);
  }
  // 5 the same Frame component on /cases and the module
  await p.goto(`${BASE}/cases`); await h1(p);
  const cases = await frameShape(p);
  await p.goto(`${BASE}/front-office/leads`); await h1(p);
  const mod = await frameShape(p);
  ok(`R1.12 ${tag}: the module's header is the app's (same height as /cases')`, !!cases.frame && cases.headerHeight === mod.headerHeight && mod.headerHeight > 0, { cases, mod });
  ok(`R1.12 ${tag}: no page error on the walk`, errors.length === 0, errors.slice(0, 3));
  await p.context().close();
}
await browser.close(); await db.$disconnect();
process.exitCode = summary() ? 1 : 0;
