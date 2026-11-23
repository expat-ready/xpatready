// J-69 (map row 69, R1.69: who read a document, its fingerprint, keep period): CS-D6 part 1's journey (brief
// design/briefs/CS-D6.md). Walked on an isolated copy (its own database and port, never :4400) on the Visitor visa of
// acceptance pack 4, at 1440 px and at phone width, by screens, like a person:
//   W1  the case officer uploads a PDF on a person's document line (the step before), opens the line's ⋯ → "File details…",
//       signs in to the firm inline (the routes take the staff session), reads the full fingerprint (SHA-256) and presses
//       "Check the file is unchanged": "Unchanged"; as a Case officer they see no "Read by" list (no view-access-log key)
//   W2  the file is opened (the download, the step every reader takes) and the stored bytes are altered on disk; the
//       Owner signs in, opens the same "File details…": "Read by" lists the case officer's opening and check, newest first,
//       and the check now says "The file has changed"
//   W3  keyboard only: the menu item and the button are reached and pressed with the keyboard; the dialog fits a 390 px
//       phone with no sideways scroll; axe finds no WCAG A/AA violation in the dialog
// The walk ends where the next capability starts: the dialog closed, back on the line (part 2's keep list is not built).
// Sample people and synthetic files only; US$0, no model call.
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j69 4495 start PLATFORM_IDENTITY=local --ttl 40 && trap 'zsh studio/tools/isolated.sh j69 4495 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_69.ts j69 4495
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { textPdf } from "../../acceptance/lib/fixtures.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j69", Number(process.argv[3] ?? 4495)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://127.0.0.1:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-69", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
process.argv[2] = String(PORT); process.argv[3] = DBNAME;
const { FAMILY, OFFICER, call, ok, openCase, rec, sql } = await import("../../acceptance/lib/m3.ts");

// ------------------------------------------------------------------------------------------------ setup (Sample)
const vvOf = () => sql("select id from combination where combination_key='vv.single'") || null;
if (!vvOf()) for (const f of ["tests/runtime/setup_visitor_visa.ts", "acceptance/lib/setup_vv_m3.ts"])
  try { execFileSync(join(STUDIO, "node_modules", ".bin", "tsx"), ["--tsconfig", join(STUDIO, "api", "tsconfig.json"), join(STUDIO, f), String(PORT), DBNAME], { stdio: ["ignore", "ignore", "inherit"], timeout: 900_000 }); }
  catch { /* the setups exit 1 on their own known gaps; what this walk needs is asked below */ }
ok("J-69 setup: the Visitor visa is released on this copy", !!vvOf());
const c = await openCase(vvOf()!, FAMILY);
const A = c.subjects["Sample Client A"];
type Line = { id: string; label: string; state: string; documents: { id: string; file_name: string; sha256: string; current: boolean }[] };
const lines = async () => ((await call("GET", `/runtime/cases/${c.id}/checklist`, undefined, OFFICER)).body?.people as { subject: string; lines: Line[] }[]).find((p) => p.subject === A)!.lines;
const first = (await lines()).find((l) => l.state === "not_requested");
ok("J-69 setup: Client A has a document line not yet requested", !!first, (await lines()).map((l) => [l.label, l.state]));
const PDF = textPdf(["SYNTHETIC SPECIMEN - MADE-UP TEST DOCUMENT - NOT VALID", "Sample synthetic document (J-69)"]);
const storedFile = (doc: string) => {
  const root = join(STUDIO, "var", `isolated-${NAME}`, "workspaces"), rel = sql(`select path from case_document where id='${doc}'`);
  if (rel) for (const ws of existsSync(root) ? readdirSync(root) : []) { const p = join(root, ws, rel); if (existsSync(p) && statSync(p).isFile()) return p; }
  return null;
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
  const doc = (await lines()).find((l) => l.id === first!.id)!.documents.find((d) => d.current)!;
  ok("J-69 W1: the case officer uploads a PDF on the line: Received, one current file", !!doc?.id, doc);
  await details();
  ok("J-69 W1: File details shows the staff sign-in inline before any staff call", await dialog.locator("[data-sign-in-card]").isVisible());
  await signIn(page, "user-o@sample-firm.example.com");
  const fp = (await dialog.locator("[data-fingerprint]").textContent())?.trim();
  ok("J-69 W1: the full fingerprint (SHA-256) is shown, the stored file's own", fp === doc.sha256 && fp?.length === 64, [fp, doc.sha256]);
  await dialog.locator("[data-check-unchanged]").click();
  const said = await dialog.locator('[data-check-result="unchanged"]').waitFor({ timeout: 15_000 }).then(() => true, () => false);
  ok("J-69 W1: \"Check the file is unchanged\" says Unchanged", said, said ? null : await dialog.textContent());
  ok("J-69 W1: a Case officer sees no \"Read by\" list (the key is the Owner's and Admin's)", (await dialog.locator("[data-read-by]").count()) === 0);
  await dialog.screenshot({ path: join(SHOTS, "w1-officer-details-1440.png") });

  // W2: the file is opened, its stored bytes change; the Owner reads who read it.
  ok("J-69 W2: the case officer opens the file (download 200)", (await fetch(`${BASE}/api/runtime/documents/${doc.id}/file`, { headers: { "x-actor": OFFICER } })).status === 200);
  const file = storedFile(doc.id);
  ok("J-69 W2 setup: the stored file is found on this copy", !!file);
  if (file) writeFileSync(file, textPdf(["Sample synthetic document, altered after upload"]));
  await page.keyboard.press("Escape");
  await page.evaluate(() => { try { sessionStorage.removeItem("xr-staff-session"); } catch { /* ignore */ } });
  await open(); await details();
  await signIn(page, "representative@sample-firm.example.com");
  const list = dialog.locator("[data-read-lines]");
  const shown = await list.waitFor({ timeout: 15_000 }).then(() => true, () => false);
  const items = shown ? await list.locator("li").allTextContents() : [];
  ok("J-69 W2: the Owner's \"Read by\" lists the case officer's opening, then their earlier check, newest first, in words", items.length === 2 && /Case officer \(Sample\).*Opened the file/.test(items[0] ?? "") && /Case officer \(Sample\).*Checked: unchanged/.test(items[1] ?? ""), items);
  await dialog.locator("[data-check-unchanged]").click();
  const changed = await dialog.locator('[data-check-result="changed"]').waitFor({ timeout: 15_000 }).then(() => true, () => false);
  ok("J-69 W2: the check now says the file has changed, and the list shows it first", changed && await list.locator("li").first().filter({ hasText: "Checked: changed" }).waitFor({ timeout: 15_000 }).then(() => true, () => false), changed);
  await dialog.screenshot({ path: join(SHOTS, "w2-owner-read-by-1440.png") });
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  ok("J-69 W3: axe finds no WCAG A/AA violation in the File details dialog", axe.violations.length === 0, axe.violations.map((v) => v.id));

  // W3: keyboard only, then phone width.
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.activeElement?.hasAttribute("data-line-menu"), undefined, { timeout: 5_000 }).catch(() => undefined);
  ok("J-69 W3: closing the dialog hands focus back to the line's ⋯ button", await row.locator("[data-line-menu]").evaluate((e) => e === document.activeElement));
  await page.keyboard.press("Enter");
  await page.locator('[data-action="file-details"]').waitFor();
  for (let i = 0; i < 12 && !(await page.locator('[data-action="file-details"]').evaluate((e) => e === document.activeElement || e.hasAttribute("data-highlighted"))); i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const byKeys = await dialog.locator("[data-check-unchanged]").waitFor({ timeout: 15_000 }).then(() => true, () => false);
  if (byKeys) { await dialog.locator("[data-check-unchanged]").focus(); await page.keyboard.press("Enter"); }
  ok("J-69 W3: keyboard only: ⋯ → File details… → Check, each with Enter", byKeys && await dialog.locator("[data-check-result]").waitFor({ timeout: 15_000 }).then(() => true, () => false));
  ok("J-69 W3: after the check, focus is still on the Check button (never dropped to the dialog)", await dialog.locator("[data-check-unchanged]").evaluate((e) => e === document.activeElement));
  await page.setViewportSize({ width: 390, height: 844 });
  const fits = await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth + 1 && document.documentElement.scrollWidth <= 391);
  ok("J-69 W3: at 390 px the dialog fits, the fingerprint wraps, no sideways scroll", fits);
  await dialog.screenshot({ path: join(SHOTS, "w3-owner-read-by-390.png") });
  await page.keyboard.press("Escape");
  ok("J-69 end: back on the line, where the next capability starts", await row.isVisible() && (await dialog.count()) === 0);
} finally {
  await browser.close();
}
process.exit(rec.summary() ? 1 : 0);
