// FO-3st3 part 1 (brief lead-b-briefs/FO-3st3.md, split by its P-610 line, with P-626-order.md A3; concept fo-3-booking
// r2 BR-19, §4, §5, §6 J-T1..J-T4): Settings → Booking types in a real browser against FO-3a's real routes on the local
// stand-in, inside PF-6's frame. J-T1..J-T4, DW6 and DW7, each a pass and a fail. J-T5 (timings) is part 2. Seeds the
// Sample firms; adds one Billing and finance person. No model call (US$0).
//   zsh studio/tools/isolated.sh screens_fo3st3 4581 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo3st3_types_browser.ts 4581 xr_studio_screens_fo3st3
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4581), DBNAME = process.argv[3] ?? "xr_studio_screens_fo3st3";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "fo-3-booking", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const firm = sql(`select id from platform_firm where key = 'sample-firm'`);
const staffId = (email: string) => sql(`select id from platform_staff where email = '${email}'`);
const OWNER = "representative@sample-firm.example.com", CM = "second.representative@sample-firm.example.com", BILLING = `billing-${run}@sample-firm.example.com`, SOLO = "representative@sample-solo.example.com";
sql(`with s as (insert into platform_staff (id, firm_id, email, display_name, updated_at) values (gen_random_uuid(), '${firm}', '${BILLING}', 'Sample Billing ${run}', now()) returning id)
  insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) select gen_random_uuid(), '${firm}', id, 'BILLING_FINANCE', 'seed:fo3st3' from s`);
async function token(email: string, firmKey = "sample-firm") {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string };
  if (!b.token) throw new Error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`);
  return b.token;
}
const api = async (tok: string | null, method: string, path: string, body?: unknown) => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let b: any = t; try { b = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body: b };
};
const [ownerTok, cmTok, billTok, soloTok] = [await token(OWNER), await token(CM), await token(BILLING), await token(SOLO, "sample-solo")];
const OWNER_ID = staffId(OWNER);
await api(ownerTok, "GET", "/front-office/me/availability-sets");   // the Owner's "Normal hours" (FO-3a 1b-i, first read)
const make = async (extra: Record<string, unknown>) => { const r = await api(ownerTok, "POST", "/front-office/booking-types", { minutes: 30, modes: ["VIDEO"], hostStaffIds: [OWNER_ID], ...extra }); if (r.status !== 201) throw new Error(`type: ${JSON.stringify(r)}`); return r.body as { id: string; slug: string; version: number }; };
const typeCount = () => sql(`select count(*) from fo_consultation_type where firm_id = '${firm}' and deleted_at is null`);
const publicSlugs = async () => ((await api(null, "GET", "/public/firms/sample-firm/book")).body.types as { slug: string }[] ?? []).map((t) => t.slug);

const browser: Browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function newPage(tok: string, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, tok);
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("dialog", (dlg) => void dlg.accept());   // "Discard your unsaved changes?" when a drawer with edits closes
  return p;
}
const types = async (p: Page, q = "") => { await p.goto(`${BASE}/front-office/booking-types${q}`); await p.locator("[data-type-row], [data-types-empty], [data-types-refused]").first().waitFor({ timeout: 30_000 }); };
const openType = async (p: Page, slug: string) => { await p.locator(`[data-type-row="${slug}"] button`).click(); await p.locator("[data-type-panel]").waitFor({ timeout: 15_000 }); };
const axe = async (name: string, p: Page) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`${name}: axe finds no serious or critical WCAG A/AA violation`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `fo3st3-${name}.png`), fullPage: true });

try {
  // -------------------------------------------------------------------------------- J-T1: the name's limit (AG-4-9 rule 1)
  const p = await newPage(ownerTok);
  await types(p);
  await p.locator("[data-new-type]").click();
  await p.locator("[data-name]").fill("N".repeat(81));
  await p.locator(`[data-host="${OWNER_ID}"]`).check();
  const before1 = typeCount();
  await p.locator("[data-save]").click();
  await p.getByText("Name must be 1 to 80 characters.").waitFor({ timeout: 10_000 });
  ok("FO-3st3 J-T1 fail: an 81-character name shows \"Name must be 1 to 80 characters.\" at the field (the server's words), nothing saved, input kept",
    await p.locator("[data-name]").getAttribute("aria-invalid") === "true" && typeCount() === before1 && (await p.locator("[data-name]").inputValue()).length === 81);
  const name80 = `T${run}`.padEnd(80, "x");
  await p.locator("[data-name]").fill(name80);
  await p.locator("[data-save]").click();
  await p.locator("[data-type-panel]:not([data-type-panel='new'])").waitFor({ timeout: 10_000 });
  ok("FO-3st3 J-T1 pass: 80 characters saves (one more type) and the drawer opens on it", Number(typeCount()) === Number(before1) + 1);
  const head = await p.locator('[role="dialog"] .text-lg').first().boundingBox(), close = await p.getByRole("button", { name: "Close" }).first().boundingBox();
  ok("FO-3st3 DW7: an 80-character name's title stays clear of the drawer's close button", !!head && !!close && head.x + head.width <= close.x + 1, [head, close]);
  await shot(p, "panel-1440"); await axe("FO-3st3 DW7 drawer (Owner, 1440)", p);
  const wide = await make({ name: "W".repeat(80) });
  for (const w of [1440, 375]) {
    const pw = await newPage(ownerTok, w); await types(pw, `?type=${wide.id}`); await pw.locator("[data-type-panel]").waitFor({ timeout: 15_000 });
    const h = await pw.locator('[role="dialog"] .text-lg').first().boundingBox(), c = await pw.getByRole("button", { name: "Close" }).first().boundingBox();
    ok(`FO-3st3 DW7 (break m7): 80 wide letters wrap in the drawer title at ${w} px, clear of Close and inside the screen`, !!h && !!c && h.x + h.width <= c.x + 1 && h.x + h.width <= w, [h, c]);
  }
  await p.keyboard.press("Escape");

  // ------------------------------------------------------------------------------- J-T2: Retire and switch on (rule 4)
  const T = await make({ name: `Free consultation ${run}` });
  const slots = await api(null, "GET", `/public/firms/sample-firm/book/${T.slug}/slots`);
  await new Promise((r) => setTimeout(r, 4_000));   // the form's minimum fill time (FO-3f)
  const booked = await api(null, "POST", `/public/firms/sample-firm/book/${T.slug}/bookings`, { givenNames: "Ana", familyName: `Sample ${run}`, email: `ana-${run}@client.example`, mode: "VIDEO", startsAt: slots.body.slots?.[0]?.startsAt, timeZone: "America/Toronto", formStamp: slots.body.formStamp });
  const bookingId = sql(`select id from fo_booking where type_id = '${T.id}' limit 1`);
  await types(p); await openType(p, T.slug);
  await p.locator("[data-retire]").click();
  ok("FO-3st3 J-T2: Retire asks first, in AG-4-9's words", (await p.locator("[data-confirm-text]").innerText()).startsWith(`Retire Free consultation ${run}? It leaves the booking page and staff lists. Its bookings stay.`));
  await p.locator("[data-confirm]").click();
  await p.locator("[data-switch-on]").waitFor({ timeout: 10_000 });
  ok("FO-3st3 J-T2 pass: Retire takes it off the booking page; its booking stays (read through the API)", booked.status === 201 && !(await publicSlugs()).includes(T.slug)
    && (await api(ownerTok, "GET", `/front-office/bookings/${bookingId}`)).status === 200, [booked.status, booked.body?.detail]);
  await p.locator("[data-switch-on]").click();
  await p.locator("[data-retire]").waitFor({ timeout: 10_000 });
  ok("FO-3st3 J-T2 fail (the way back): Switch on brings it back to the booking page", (await publicSlugs()).includes(T.slug));

  // ------------------------------------------------------------------------------------- J-T3: Preview writes nothing
  const ws = sql(`select id from workspace order by created_at limit 1`);
  const { CLOSED_DAYS, writeSetting } = await import("../api/src/platform/settings.ts");
  await writeSetting(db, { firmId: firm, key: CLOSED_DAYS.key, value: ["2026-12-25"], by: "seed:fo3st3", workspaceId: ws });
  const counts = () => sql(`select (select count(*) from fo_booking) || '|' || (select count(*) from audit_event) || '|' || (select count(*) from fo_consultation_type)`);
  const c0 = counts();
  await p.locator("[data-preview-date]").fill("2026-12-25"); await p.locator("[data-preview-zone]").fill("America/Toronto");
  await p.locator("[data-preview]").click();
  await p.locator("[data-preview-reason], [data-preview-slots]").first().waitFor({ timeout: 15_000 });
  ok("FO-3st3 J-T3 pass: Preview on 25 Dec shows no times and \"Closed day\"; nothing written (bookings, audit lines, types counted)", (await p.locator("[data-preview-reason]").innerText()) === "Closed day" && counts() === c0, counts());
  await p.locator("[data-preview-date]").fill("2026-12-28"); await p.locator("[data-preview]").click();
  await p.locator("[data-preview-slots], [data-preview-reason]").first().waitFor({ timeout: 15_000 });
  ok("FO-3st3 J-T3 fail (an open day): Monday 28 Dec shows the host's times and no reason", await p.locator("[data-preview-slots] li").count() > 0 && counts() === c0);

  // -------------------------------------------------------------------- DW6: duplicate, delete, a stale save, a case type
  await p.locator("[data-duplicate]").click();
  await p.locator(`.text-lg:has-text("Free consultation ${run} (copy)")`).first().waitFor({ timeout: 10_000 });
  ok("FO-3st3 DW6 pass: Duplicate adds \"(copy)\" and opens the copy", await p.locator("[data-type-panel]").count() === 1);
  await p.keyboard.press("Escape");
  await types(p); await openType(p, T.slug);
  await p.locator("[data-delete]").click();
  const delText = await p.locator("[data-confirm-text]").innerText();
  await p.locator("[data-confirm]").click();
  await p.locator("[data-type-panel]").waitFor({ state: "detached", timeout: 10_000 });
  await p.locator(`[data-type-row="${T.slug}"]`).waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);   // the list's refetch; asserted next
  ok("FO-3st3 DW6 pass: Delete asks with the count of future bookings, removes the type and keeps its booking",
    delText === `Delete "Free consultation ${run}"? 1 future booking stays booked.` && await p.locator(`[data-type-row="${T.slug}"]`).count() === 0 && (await api(ownerTok, "GET", `/front-office/bookings/${bookingId}`)).status === 200, delText);
  const S = await make({ name: `Stale ${run}` });
  const [a, b] = [p, await newPage(ownerTok)];
  await types(a); await openType(a, S.slug); await types(b); await openType(b, S.slug);
  await b.locator("[data-name]").fill(`Stale ${run} B`); await b.locator("[data-save]").click();
  await b.waitForFunction(() => !document.querySelector("[data-save][aria-busy='true']"));
  await a.locator("[data-name]").fill(`Stale ${run} A`); await a.locator("[data-save]").click();
  await a.locator("[data-panel-error]").waitFor({ timeout: 10_000 });
  ok("FO-3st3 DW6 fail: a save after another tab's save shows \"Someone else changed this type. Reload to see their changes.\" and keeps the input",
    (await a.locator("[data-panel-error]").innerText()) === "Someone else changed this type. Reload to see their changes." && (await a.locator("[data-name]").inputValue()) === `Stale ${run} A`
    && sql(`select name from fo_consultation_type where id = '${S.id}'`) === `Stale ${run} B`);
  const n0 = typeCount();
  await types(a); await a.locator("[data-new-type]").click(); await a.locator("[data-name]").fill(`Burst ${run}`);
  await a.locator("[data-save]").evaluate((el: HTMLElement) => { el.click(); el.click(); el.click(); });
  await a.locator("[data-type-panel]:not([data-type-panel='new'])").waitFor({ timeout: 10_000 });
  ok("FO-3st3 DW6 fail (break m1): three clicks on Save at once make one type", Number(typeCount()) === Number(n0) + 1, [n0, typeCount()]);
  await a.keyboard.press("Escape");
  const K = await make({ name: `Case review ${run}`, purpose: "CASE_REVIEW" });
  await types(a);
  const cell = await a.locator(`[data-type-row="${K.slug}"] [data-on-page]`).innerText();
  await openType(a, K.slug);
  ok("FO-3st3 DW6 pass: a case purpose reads \"Never (case type)\" in the list and AG-4-10's line in the drawer", cell === "Never (case type)" && (await a.locator("[data-case-line]").innerText()) === "Clients book this from their case. It is not on your booking page.");

  // --------------------------------------------------------------------------------------------- J-T4: who sees what (C5)
  const cm = await newPage(cmTok);
  await types(cm); await openType(cm, K.slug);
  ok("FO-3st3 J-T4 pass: a Case Manager sees Booking types in the menu and the type read-only (no button, no field)",
    await cm.locator('nav[aria-label="My account"] [data-account-section="/front-office/booking-types"]').count() === 1 && await cm.locator("[data-new-type]").count() === 0
    && await cm.locator("[data-read-only]").count() === 1 && await cm.locator("[data-type-panel] input, [data-type-panel] textarea, [data-type-panel] select, [data-save], [data-delete], [data-retire], [data-duplicate]").count() === 0
    && await cm.locator("[data-share-link]").count() === 1);
  await shot(cm, "read-only-1440"); await axe("FO-3st3 DW7 read-only drawer (Case Manager)", cm);
  await cm.goto(`${BASE}/front-office/booking-types?type=new`); await cm.locator("[data-type-row]").first().waitFor({ timeout: 15_000 });
  ok("FO-3st3 J-T4 fail (break M1): a Case Manager opening ?type=new sees the list and no drawer, no page error", await cm.locator("[data-type-panel]").count() === 0 && !errors.some((e) => /hostStaffIds/.test(e)), errors);
  const consoleSave = await cm.evaluate(async ([id, v]) => { const t = JSON.parse(sessionStorage.getItem("xr-staff-session")!).token; return (await fetch(`/api/front-office/booking-types/${id}`, { method: "PATCH", headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ name: "Hacked", version: v }) })).status; }, [K.id, K.version] as const);
  ok("FO-3st3 J-T4 fail: the Case Manager's save from the browser console is refused by the server (403)", consoleSave === 403, consoleSave);
  const bill = await newPage(billTok);
  await types(bill);
  ok("FO-3st3 J-T4 fail: Billing and finance has no Booking types entry and the direct link shows the server's refusal",
    await bill.locator('[data-account-section="/front-office/booking-types"]').count() === 0 && (await bill.locator("[data-types-refused]").innerText()).length > 0 && await bill.locator("[data-type-row]").count() === 0,
    await bill.locator("[data-types-refused]").innerText());

  // ------------------------------------------------------------------------- DW7: empty, loading, keyboard, sizes, axe
  const solo = await newPage(soloTok);
  await solo.route("**/api/front-office/booking-types", async (r) => { await new Promise((x) => setTimeout(x, 1_500)); await r.continue(); });
  await solo.goto(`${BASE}/front-office/booking-types`);
  await solo.locator("[data-types-loading]").waitFor({ timeout: 15_000 });
  const skeleton = await solo.locator("[data-types-loading] > *").count() === 3;
  await solo.locator("[data-types-empty]").waitFor({ timeout: 15_000 });
  ok("FO-3st3 DW7: loading shows skeleton rows, then the empty state's words", skeleton && (await solo.locator("[data-types-empty]").innerText()) === "No booking types yet. Add one so visitors can book.");
  await shot(solo, "empty-1440");
  const k = await newPage(ownerTok);
  await types(k);
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) { await k.keyboard.press("Tab"); reached = await k.evaluate(() => document.activeElement?.hasAttribute("data-new-type") ?? false); }
  await k.keyboard.press("Enter"); await k.locator("[data-type-panel='new']").waitFor({ timeout: 10_000 });
  const inName = await k.evaluate(() => document.activeElement?.hasAttribute("data-name") ?? false);
  await k.keyboard.press("Escape"); await k.locator("[data-type-panel]").waitFor({ state: "detached" });
  await k.waitForFunction(() => document.activeElement?.hasAttribute("data-new-type") ?? false, null, { timeout: 3_000 }).catch(() => undefined);   // asserted next
  ok("FO-3st3 DW7: keyboard only: Tab reaches New booking type, Enter opens the drawer on Name, Escape closes it and focus returns",
    reached && inName && await k.evaluate(() => document.activeElement?.hasAttribute("data-new-type") ?? false));
  for (const w of [375, 1024, 1440]) {
    const s = await newPage(ownerTok, w); await types(s);
    ok(`FO-3st3 DW7: ${w} px, the list has no sideways page scroll`, await s.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await shot(s, `list-${w}`); if (w === 1440) await axe("FO-3st3 DW7 list (Owner, 1440)", s);
  }
  ok("FO-3st3: no page error in any browser", errors.length === 0, errors);
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
