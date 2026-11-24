// FO-3v part 1 DW7 (brief lead-b-briefs/FO-3v.md; AG-4-58 rules 1-4, AG-4-59, AG-16-73): My account → Video in a real
// browser against this row's real routes on the isolated copy (PF-4's local stand-in sign-in; no fake API). A Case
// Officer with no extra keys finds Video in My account, saves a bad link (the field's error, nothing saved), saves a good
// one by keyboard only (the choice appears, pre-set to My meeting link), and clears it (the choice goes); then a public
// Video booking with her as host carries her link in its answer. axe-core at 375, 1024 and 1440; no sideways scroll.
// Seeds the Sample firms, then adds this run's own Case Officer and one public type she hosts. US$0, no network.
//   zsh studio/tools/isolated.sh runtime_fo3v 4635 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo3v_video_browser.ts 4635 xr_studio_runtime_fo3v
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { copyFirmHoursTo } from "../api/src/front-office/booking-seed.ts";
import { ACCOUNT_SECTIONS } from "../web/src/modules/platform/account-sections.ts";
import { recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4635), DBNAME = process.argv[3] ?? "xr_studio_runtime_fo3v";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "fo-3-booking", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"], TZ = "America/Toronto";
const WORDS = "Enter a full link starting with https://", LINK = "https://zoom.us/j/1234567890";
const { ok, summary } = recorder();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const firm = await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } });

type Res = { status: number; body: any };
async function call(tok: string | null, method: string, path: string, body?: unknown): Promise<Res> {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let b: any = t; try { b = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body: b };
}
async function signIn(email: string): Promise<string> {
  const r = await call(null, "POST", "/platform/session/local", { firmKey: "sample-firm", email, secondStep: true });
  if (!r.body.token) throw new Error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${JSON.stringify(r.body)}`);
  const pending = await call(r.body.token, "GET", "/platform/me/terms");   // PF-5t: a new person accepts the privacy notice first
  const ids = ((pending.body?.pending ?? pending.body?.terms ?? []) as { id?: string; versionId?: string }[]).map((t) => t.versionId ?? t.id).filter(Boolean);
  if (ids.length) await call(r.body.token, "POST", "/platform/me/terms/accept", { versionIds: ids });
  return r.body.token as string;
}
const F = await db.platformStaff.create({ data: { firmId: firm.id, email: `fo3v-clientf-${run}@sample-firm.example.com`, displayName: `Client F ${run}`, status: "ACTIVE" } });
await db.platformRoleGrant.create({ data: { firmId: firm.id, staffId: F.id, role: "CASE_OFFICER" as never, grantedBy: "test:fo3v" } });
await copyFirmHoursTo(db, firm.id, [F.id]);
const fTok = await signIn(F.email);
const slug = `fo3v-${run}`;
await db.foConsultationType.create({ data: { firmId: firm.id, slug, name: `Video check ${run}`, modes: ["VIDEO"], hostStaffIds: [F.id], minutes: 30, windowDays: 120 } });
const pref = () => db.foVideoPref.findFirst({ where: { staffId: F.id } });

const browser: Browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function open(path: string, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce", timezoneId: TZ });
  await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, fTok);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${BASE}${path}`);
  return p;
}
const axe = async (name: string, p: Page) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`${name}: axe finds no serious or critical WCAG A/AA violation`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
const noSideways = async (name: string, p: Page) => ok(`${name}: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `fo3v-${name}.png`), fullPage: true });
const status = (p: Page) => p.locator("[data-video-status]").innerText();

try {
  // ------------------------------------------------------------------------------- the menu: everyone, no key
  const home = await open("/account/availability");
  const entry = home.locator('nav[aria-label="My account"] [data-account-section="/account/video"]');
  await entry.waitFor({ timeout: 30_000 });
  ok("FO-3v DW7 pass: a Case Officer with no extra keys finds Video in My account (one entry, no key)", (await entry.count()) === 1 && ACCOUNT_SECTIONS.filter((s) => s.path === "/account/video" && s.key === null).length === 1);
  await entry.click();
  await home.locator("[data-video-link]").waitFor({ timeout: 30_000 });
  ok("FO-3v DW7 pass: the Video page opens from the menu, empty: no link and no source yet (Connect Zoom not shown, rule 1)",
    home.url().endsWith("/account/video") && (await home.locator("[data-video-link]").inputValue()) === "" && (await home.locator("[data-video-no-source]").count()) === 1 && (await home.getByText("Connect Zoom").count()) === 0);
  await axe("FO-3v DW7 Video, empty (1440)", home); await shot(home, "video-empty-1440");
  await home.context().close();

  // ------------------------------------------------------------------------------------- keyboard only: a bad link
  const p = await open("/account/video");
  await p.locator("[data-video-link]").waitFor({ timeout: 30_000 });
  await p.locator("[data-video-link]").focus();
  await p.keyboard.type("zoom.us/j/1234");
  await p.keyboard.press("Enter");
  await p.getByText(WORDS, { exact: true }).waitFor({ timeout: 10_000 });
  const stillFocused = await p.evaluate(() => (document.activeElement as HTMLElement | null)?.hasAttribute("data-video-link"));
  ok(`FO-3v DW7 fail: "zoom.us/j/1234" shows "${WORDS}" on the field, the keyboard stays on it, nothing saved`, stillFocused && !(await pref()), { stillFocused });
  await axe("FO-3v DW7 Video, field error (1440)", p); await shot(p, "video-error-1440");
  // The server's own refusal, past the page's check (http is refused there too).
  const http = await call(fTok, "PUT", "/front-office/me/video", { myMeetingLink: "http://zoom.us/j/1" });
  ok("FO-3v DW7 fail: the server refuses http:// with the same words", http.status === 422 && http.body.fields?.myMeetingLink === WORDS && !(await pref()), http.body);

  // ------------------------------------------------------------------------------------ keyboard only: a good link
  await p.locator("[data-video-link]").fill("");
  await p.keyboard.type(LINK);
  await p.keyboard.press("Tab");   // onto Save link
  const onSave = await p.evaluate(() => (document.activeElement as HTMLElement | null)?.hasAttribute("data-video-save"));
  await p.keyboard.press("Enter");
  await p.locator("[data-video-source]").waitFor({ timeout: 10_000 });
  ok("FO-3v DW7 pass: by keyboard only (Tab to Save link, Enter) the link is saved, the status says so, and the choice lists My meeting link, pre-set (rule 3)",
    onSave && (await status(p)) === "Meeting link saved." && (await p.locator("[data-video-source]").inputValue()) === "MY_LINK" && (await p.locator("[data-video-source] option").allInnerTexts()).join() === "My meeting link"
      && (await pref())?.myMeetingLink === LINK && (await pref())?.sourceChoice === "MY_LINK", { onSave, status: await status(p) });
  await axe("FO-3v DW7 Video, saved (1440)", p); await noSideways("FO-3v DW7 Video (1440)", p); await shot(p, "video-saved-1440");

  // --------------------------------------------------------------- the link reaches a booking with her as the host
  const slots = await call(null, "GET", `/public/firms/sample-firm/book/${slug}/slots`);
  await new Promise((r) => setTimeout(r, 3_200));   // the real app's minimum fill time (AG-4-20 rule 3)
  const first = slots.body.slots?.[0]?.startsAt as string | undefined;
  const booked = first ? await call(null, "POST", `/public/firms/sample-firm/book/${slug}/bookings`, { givenNames: "Client B", familyName: "Sample", email: `client.b.${run}@example.org`, mode: "VIDEO", startsAt: first, timeZone: TZ, formStamp: slots.body.formStamp }) : null;
  ok("FO-3v DW7 pass: a public Video booking with her as host carries her link (the confirmation's join link)", booked?.status === 201 && booked.body.joinLink === LINK, booked?.body);

  // ------------------------------------------------------------------------------------------- clear: rule 4
  await p.locator("[data-video-clear]").focus();
  await p.keyboard.press("Enter");
  await p.locator("[data-video-no-source]").waitFor({ timeout: 10_000 });
  ok("FO-3v DW7 pass: Clear link empties the field and the choice goes (no source left, rule 4)", (await status(p)) === "Meeting link cleared." && (await p.locator("[data-video-link]").inputValue()) === "" && !(await pref())?.myMeetingLink && !(await pref())?.sourceChoice);
  await p.context().close();

  // ------------------------------------------------------------------------------------------------- widths
  await call(fTok, "PUT", "/front-office/me/video", { myMeetingLink: LINK });
  for (const w of [375, 1024]) {
    const q = await open("/account/video", w);
    await q.locator("[data-video-source]").waitFor({ timeout: 30_000 });
    await axe(`FO-3v DW7 Video (${w})`, q); await noSideways(`FO-3v DW7 Video (${w})`, q); await shot(q, `video-${w}`);
    await q.context().close();
  }
  ok("FO-3v: no page error in any browser", errors.length === 0, errors);
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
