// CS-D6 part 1 (R1.69, map row 69; brief design/briefs/CS-D6.md): the part's own browser walk, by screens like a person, on
// an isolated copy (its own database and port, never :4400), on the Visitor visa of acceptance pack 4, at 1440 px and at
// phone width. The capability's journey is qa's tests/journeys/j_69.ts (all of R1.69's parts); this suite proves part 1.
//   W1  the case officer uploads a PDF on a person's document line (the step before), opens the line's ⋯ → "File details…",
//       signs in to the firm inline (the routes take the staff session), reads the full fingerprint (SHA-256) and presses
//       "Check the file is unchanged": "Unchanged"; as a Case officer they see no "Read by" list (no view-access-log key)
//   W2  the file is opened (the download, the step every reader takes) and the stored bytes are altered on disk; the
//       Owner signs in, opens the same "File details…": "Read by" lists the case officer's opening and check, newest first,
//       and the check now says "The file has changed"
//   W3  keyboard only: the menu item and the button are reached and pressed with the keyboard; the dialog fits a 390 px
//       phone with no sideways scroll; axe finds no WCAG A/AA violation in the dialog
// The walk ends back on the line. Sample people and synthetic files only; US$0, no model call.
//   zsh studio/tools/isolated.sh csd6_browser 4492 start PLATFORM_IDENTITY=local && tsx studio/tests/check_csd6_reads_browser.ts 4492 xr_studio_csd6_browser
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { textPdf } from "../acceptance/lib/fixtures.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const PORT = Number(process.argv[2] ?? 4492), DBNAME0 = process.argv[3] ?? "xr_studio_csd6_browser", NAME = DBNAME0.replace(/^xr_studio_/, "");
const DBNAME = DBNAME0, BASE = `http://127.0.0.1:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "CS-D6", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
process.argv[2] = String(PORT); process.argv[3] = DBNAME;
const { FAMILY, OFFICER, call, ok, openCase, rec, sql } = await import("../acceptance/lib/m3.ts");

// ------------------------------------------------------------------------------------------------ setup (Sample)
const vvOf = () => sql("select id from combination where combination_key='vv.single'") || null;
if (!vvOf()) for (const f of ["tests/runtime/setup_visitor_visa.ts", "acceptance/lib/setup_vv_m3.ts"])
  try { execFileSync(join(STUDIO, "node_modules", ".bin", "tsx"), ["--tsconfig", join(STUDIO, "api", "tsconfig.json"), join(STUDIO, f), String(PORT), DBNAME], { stdio: ["ignore", "ignore", "inherit"], timeout: 900_000 }); }
  catch { /* the setups exit 1 on their own known gaps; what this walk needs is asked below */ }
ok("CS-D6 setup: the Visitor visa is released on this copy", !!vvOf());
const c = await openCase(vvOf()!, FAMILY);
const A = c.subjects["Sample Client A"];
type Line = { id: string; label: string; state: string; documents: { id: string; file_name: string; sha256: string; current: boolean }[] };
const lines = async () => ((await call("GET", `/runtime/cases/${c.id}/checklist`, undefined, OFFICER)).body?.people as { subject: string; lines: Line[] }[]).find((p) => p.subject === A)!.lines;
const first = (await lines()).find((l) => l.state === "not_requested");
ok("CS-D6 setup: Client A has a document line not yet requested", !!first, (await lines()).map((l) => [l.label, l.state]));
const PDF = textPdf(["SYNTHETIC SPECIMEN - MADE-UP TEST DOCUMENT - NOT VALID", "Sample synthetic document (CS-D6)"]);
const storedFile = (doc: string) => {
  const root = join(STUDIO, "var", `isolated-${NAME}`, "workspaces"), rel = sql(`select path from case_document where id='${doc}'`);
  // Named, never listed (a folder listing ties every acceptance pack to this journey in the suite selector).
  const p = rel ? join(root, process.env.STUDIO_WORKSPACE_KEY?.trim() || "demo", rel) : null;
  return p && existsSync(p) ? p : null;
};

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((a) => { try { localStorage.setItem("xr-actor", a); } catch { /* private window */ } }, c.officer);
  const page = await ctx.newPage();
  const row = page.locator(`[data-line="${first!.id}"]`), dialog = page.getByRole("dialog");
  const open = async () => { await page.goto(`/cases/${c.id}`); await row.waitFor({ timeout: 30_000 }); };
  const details = async () => { await row.locator("[data-line-menu]").click(); await page.locator('[data-action="file-details"]').click(); await dialog.locator("[data-document-reads]").first().waitFor({ timeout: 15_000 }); };
  const signIn = async (p: Page, email: string) => {
    await dialog.getByLabel("Firm key").fill("sample-firm"); await dialog.getByLabel("Work email").fill(email);
    await dialog.getByRole("button", { name: "Sign in" }).click();
    await p.locator("[data-check-unchanged]").waitFor({ timeout: 30_000 });
  };

  // W1: upload on the line (the step before), then the file's details as the case officer.
  await open();
  await row.locator("[data-upload-input]").setInputFiles({ name: "invitation-letter.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.locator(`[data-line="${first!.id}"][data-state="received"]`).waitFor({ timeout: 30_000 });
  // The upload has finished only when its spinner is gone and focus is back on the line's ⋯ button (checklist.tsx back()):
  // a menu opened before that is closed by the focus coming back.
  await row.locator("[data-line-busy]").waitFor({ state: "detached", timeout: 30_000 });
  await page.waitForFunction((id) => document.activeElement?.closest(`[data-line="${id}"]`)?.contains(document.activeElement) && document.activeElement?.hasAttribute("data-line-menu"), first!.id, { timeout: 10_000 });
  const doc = (await lines()).find((l) => l.id === first!.id)!.documents.find((d) => d.current)!;
  ok("CS-D6 W1: the case officer uploads a PDF on the line: Received, one current file", !!doc?.id, doc);
  await details();
  ok("CS-D6 W1: File details shows the staff sign-in inline before any staff call", await dialog.locator("[data-sign-in-card]").isVisible());
  await signIn(page, "user-o@sample-firm.example.com");
  const fp = (await dialog.locator("[data-fingerprint]").textContent())?.trim();
  ok("CS-D6 W1: the full fingerprint (SHA-256) is shown, the stored file's own", fp === doc.sha256 && fp?.length === 64, [fp, doc.sha256]);
  await dialog.locator("[data-check-unchanged]").click();
  const said = await dialog.locator('[data-check-result="unchanged"]').waitFor({ timeout: 15_000 }).then(() => true, () => false);
  ok("CS-D6 W1: \"Check the file is unchanged\" says Unchanged", said, said ? null : await dialog.textContent());
  ok("CS-D6 W1: a Case officer sees no \"Read by\" list (the key is the Owner's and Admin's)", (await dialog.locator("[data-read-by]").count()) === 0);
  await dialog.screenshot({ path: join(SHOTS, "w1-officer-details-1440.png") });

  // W2: the file is opened, its stored bytes change; the Owner reads who read it.
  ok("CS-D6 W2: the case officer opens the file (download 200)", (await fetch(`${BASE}/api/runtime/documents/${doc.id}/file`, { headers: { "x-actor": OFFICER } })).status === 200);
  const file = storedFile(doc.id);
  ok("CS-D6 W2 setup: the stored file is found on this copy", !!file);
  if (file) writeFileSync(file, textPdf(["Sample synthetic document, altered after upload"]));
  await page.keyboard.press("Escape");
  await page.evaluate(() => { try { sessionStorage.removeItem("xr-staff-session"); } catch { /* ignore */ } });
  await open(); await details();
  await signIn(page, "representative@sample-firm.example.com");
  const list = dialog.locator("[data-read-lines]");
  const shown = await list.waitFor({ timeout: 15_000 }).then(() => true, () => false);
  const items = shown ? await list.locator("li").allTextContents() : [];
  ok("CS-D6 W2: the Owner's \"Read by\" lists the case officer's opening, then their earlier check, newest first, in words", items.length === 2 && /Case officer \(Sample\).*Opened the file/.test(items[0] ?? "") && /Case officer \(Sample\).*Checked: unchanged/.test(items[1] ?? ""), items);
  await dialog.locator("[data-check-unchanged]").click();
  const changed = await dialog.locator('[data-check-result="changed"]').waitFor({ timeout: 15_000 }).then(() => true, () => false);
  ok("CS-D6 W2: the check now says the file has changed, and the list shows it first", changed && await list.locator("li").first().filter({ hasText: "Checked: changed" }).waitFor({ timeout: 15_000 }).then(() => true, () => false), changed);
  await dialog.screenshot({ path: join(SHOTS, "w2-owner-read-by-1440.png") });
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  ok("CS-D6 W3: axe finds no WCAG A/AA violation in the File details dialog", axe.violations.length === 0, axe.violations.map((v) => v.id));

  // W3: keyboard only, then phone width.
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.activeElement?.hasAttribute("data-line-menu"), undefined, { timeout: 5_000 }).catch(() => undefined);
  ok("CS-D6 W3: closing the dialog hands focus back to the line's ⋯ button", await row.locator("[data-line-menu]").evaluate((e) => e === document.activeElement));
  await page.keyboard.press("Enter");
  await page.locator('[data-action="file-details"]').waitFor();
  for (let i = 0; i < 12 && !(await page.locator('[data-action="file-details"]').evaluate((e) => e === document.activeElement || e.hasAttribute("data-highlighted"))); i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const byKeys = await dialog.locator("[data-check-unchanged]").waitFor({ timeout: 15_000 }).then(() => true, () => false);
  if (byKeys) { await dialog.locator("[data-check-unchanged]").focus(); await page.keyboard.press("Enter"); }
  ok("CS-D6 W3: keyboard only: ⋯ → File details… → Check, each with Enter", byKeys && await dialog.locator("[data-check-result]").waitFor({ timeout: 15_000 }).then(() => true, () => false));
  ok("CS-D6 W3: after the check, focus is still on the Check button (never dropped to the dialog)", await dialog.locator("[data-check-unchanged]").evaluate((e) => e === document.activeElement));
  await page.setViewportSize({ width: 390, height: 844 });
  // After the resize, the layout is measured once it has settled (up to 5 s), and each claim gets its own line with the
  // widths, so a red says which element is wide: the dialog (this row's) or the case page behind it.
  type Fit = { inside: boolean; noScroll: boolean; wraps: boolean; page: boolean; widths: Record<string, number>; widest: [string, number][] };
  const measure = () => dialog.evaluate((d): Fit => {
    const r = d.getBoundingClientRect(), code = d.querySelector("[data-fingerprint]")?.getBoundingClientRect();
    const widest = [...document.body.querySelectorAll("*")].map((e) => [`${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ""}.${String(e.getAttribute("class") ?? "").split(" ").slice(0, 3).join(".")}`, Math.round(e.getBoundingClientRect().right)] as [string, number]).filter((x) => x[1] > innerWidth).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { inside: r.left >= 0 && r.right <= innerWidth + 1, noScroll: d.scrollWidth <= d.clientWidth + 1, wraps: !!code && code.right <= r.right + 1, page: document.documentElement.scrollWidth <= innerWidth + 1,
      widths: { viewport: innerWidth, dialogLeft: Math.round(r.left), dialogRight: Math.round(r.right), dialogScroll: d.scrollWidth, dialogClient: d.clientWidth, fingerprintRight: Math.round(code?.right ?? -1), pageScroll: document.documentElement.scrollWidth }, widest };
  });
  await page.waitForFunction(() => innerWidth === 390, undefined, { timeout: 5_000 }).catch(() => undefined);
  let fit = await measure();
  for (let i = 0; i < 25 && !(fit.inside && fit.noScroll && fit.wraps && fit.page); i++) { await page.waitForTimeout(200); fit = await measure(); }
  ok("CS-D6 W3: at 390 px the dialog fits inside the screen and its fingerprint wraps, with no sideways scroll in the dialog", fit.inside && fit.noScroll && fit.wraps, fit);
  ok("CS-D6 W3: at 390 px with the dialog open, the page has no sideways scroll", fit.page, fit);
  await dialog.screenshot({ path: join(SHOTS, "w3-owner-read-by-390.png") });
  await page.keyboard.press("Escape");
  ok("CS-D6 end: back on the line, where the next capability starts", await row.isVisible() && (await dialog.count()) === 0);
} finally {
  await browser.close();
}
process.exit(rec.summary() ? 1 : 0);
