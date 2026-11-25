// J-64 (map row 64, R1.64: "Upload that resumes after a dropped connection"): the join-and-walk for the row, by screens
// like a person, on an isolated copy of the running app (its own database and port, never :4400). Parts: PF-F2 part 1
// (the tus rail, #3277), part 1b (#3640), part 2 (the browser client, #3303) and CS-D1u (the staff case-document door
// on the rail and the Documents panel's upload; this journey's own row).
// Persona: the Sample firm's case officer, signed in to the firm, adding a letter of invitation (Sample) for a client.
//   W1 the officer opens a Sample case's Documents at 1440 px, signs in to the firm inline, uploads a ~6 MB Sample PDF;
//      the browser goes offline mid-upload (context.setOffline) → "Upload paused: reconnecting"; back online →
//      "Resumed, N%" with N > 0 → the document is listed on the panel; the stored sha256 is the original's.
//   W2 underneath: one plat_file row (SCANNING) and one new document version; a repeated finish (an empty PATCH at the
//      end, then HEAD) → the same file id, no second row.
//   W3 sample-solo's Owner gets 404 on HEAD and PATCH of W1's upload id.
//   W4 a .pdf-named file whose bytes are not an allowed kind → PF-F4's words on screen, no row, no file.
//   W5 W1's cut and resume on a Pixel 7.
//   W6 at 1024 px, keyboard only: Add, sign in with the keyboard, focus is back on Add; Enter uploads; focus is back on
//      Add after it; axe finds no WCAG A/AA violation on the Documents panel. A staff member whose only role is Read only
//      (labelled test data) is told so in words, never "no longer on the server".
// Sample people and synthetic files only; US$0, no model call, live AI off. Screenshots (device scale 2):
// product/screens/CS-D1u/. Run from prototype/ (HEADED=1 opens a visible browser, slowed):
//   zsh studio/tools/isolated.sh j64 4434 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j64 4434 stop' EXIT && npx tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_64.ts j64 4434
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { chromium, devices, type BrowserContext, type Page } from "playwright";
import { textPdf } from "../../acceptance/lib/fixtures.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "j64", Number(process.argv[3] ?? 4434)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://127.0.0.1:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const VAR = join(STUDIO, "var", `isolated-${NAME}`);
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "CS-D1u"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const { call, sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0]?.trim() ?? "";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
const run = Date.now().toString(36);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const OFFICER = "user-O", REP = "user-R", OTHER = "user-S", CLIENT = "user-P", MB = 1024 * 1024;
const UPLOADS = "/api/platform/files/uploads";

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const vv = () => sql(`select c.id from combination c where c.combination_key = 'vv.single' and exists (select 1 from config_release r where r.combination_id = c.id and r.status = 'RELEASED')`);
if (!vv()) await call("POST", "/demo/load", { sample: "configured" }, "user-A");
const VV = vv();
const caseId = (await call("POST", "/runtime/cases", { combinationId: VV, reference: `J64-${run}`, clientActor: CLIENT, principal: { displayName: `Sample Client J64 ${run}` }, representative: REP, caseOfficers: [OFFICER] }, OFFICER)).body?.id as string;
const person = (await call("GET", `/runtime/cases/${caseId}/checklist`, undefined, OFFICER)).body?.people?.[0]?.subject as string;
ok("J-64 setup: the Visitor visa is released; a Sample case of sample-firm with its client", !!VV && !!caseId && !!person, { VV, caseId });
const emailOf = (actor: string) => sql(`select email from platform_staff where actor_id = '${actor}'`);
const tokenOf = async (actor: string, firmKey = "sample-firm") => ((await (await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, email: emailOf(actor), secondStep: true }) })).json().catch(() => ({}))) as { token?: string }).token ?? "";
const tOther = await tokenOf(OTHER, "sample-solo");
if (!tOther || !(await tokenOf(OFFICER))) { console.error("STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local)"); process.exit(2); }
const tus = async (token: string, method: string, path: string, headers: Record<string, string> = {}, body?: Uint8Array) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { authorization: `Bearer ${token}`, "tus-resumable": "1.0.0", ...headers }, ...(body ? { body: Buffer.from(body) } : {}) });
  return { status: r.status, headers: r.headers, text: (await r.text()).trim() };
};
/** A ~n-byte Sample PDF that opens (a text page whose content is long enough). */
const bigPdf = (n: number, tag: string) => textPdf(["SYNTHETIC SPECIMEN - MADE-UP TEST DOCUMENT - NOT VALID", `Letter of invitation (Sample) J-64 ${tag} ${run}`,
  ...Array.from({ length: Math.ceil(n / 64) }, (_, i) => `Sample filler line ${String(i).padStart(7, "0")} for the resumable upload walk (J-64).`)]);
const fileRows = () => Number(sql(`select count(*) from plat_file`));
const docRows = () => Number(sql(`select count(*) from case_document where subject_id = '${person}' and document_type = 'letter_of_invitation'`));

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
/** One walk: open the case's Documents, sign in inline, choose the file, cut the network mid-upload, bring it back. */
async function walk(label: string, ctxOpts: Parameters<typeof browser.newContext>[0], file: { name: string; bytes: Buffer }, cut: boolean, shot: string) {
  const ctx: BrowserContext = await browser.newContext({ ...ctxOpts, baseURL: BASE, colorScheme: "light", reducedMotion: "reduce", deviceScaleFactor: 2 });
  await ctx.addInitScript((a) => {
    try { localStorage.setItem("xr-actor", a); } catch { /* private window */ }
    // The words the person sees, every change in order (the status line under the button).
    const w = window as unknown as { __words: string[] }; w.__words = [];
    new MutationObserver(() => { const t = document.querySelector("[data-upload-words]")?.textContent ?? ""; if (t && w.__words.at(-1) !== t) w.__words.push(t); })
      .observe(document, { subtree: true, childList: true, characterData: true });
  }, OFFICER);
  const page: Page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  const ids: string[] = []; page.on("response", (r) => { if (r.request().method() === "POST" && r.url().endsWith(UPLOADS) && r.status() === 201) ids.push((r.headers()["location"] ?? "").split("/").pop() ?? ""); });
  await page.goto(`/cases/${caseId}`);
  const add = page.locator(`[data-other-documents="${person}"] [data-other-upload="letter_of_invitation"]`);
  await add.waitFor({ timeout: 60_000 });
  await add.scrollIntoViewIfNeeded();
  await add.click();   // signed out: the firm sign-in shows inline
  const card = page.locator("[data-other-sign-in]");
  await card.waitFor({ timeout: 15_000 });
  await card.getByLabel("Firm key").fill("sample-firm"); await card.getByLabel("Work email").fill(emailOf(OFFICER));
  await card.getByRole("button", { name: "Sign in" }).click();
  await card.waitFor({ state: "detached", timeout: 30_000 });
  // Each chunk (1 MB) waits 600 ms before it leaves, so the cut lands mid-file (a slow line; the cut itself is the
  // browser's own offline switch, context.setOffline).
  await page.route(`**${UPLOADS}/*`, async (r) => { if (r.request().method() === "PATCH") await new Promise((res) => setTimeout(res, 600)); await r.continue().catch(() => undefined); });
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), add.click()]);
  await chooser.setFiles({ name: file.name, mimeType: "application/pdf", buffer: file.bytes });
  const words = page.locator("[data-upload-words]");
  let paused = false, whileCut = { files: -1, docs: -1 };
  if (cut) {
    await page.waitForFunction(() => /(\d+)%/.test(document.querySelector("[data-upload-words]")?.textContent ?? "") && Number(/(\d+)%/.exec(document.querySelector("[data-upload-words]")!.textContent!)![1]) >= 20, null, { timeout: 60_000 });
    await ctx.setOffline(true);   // the connection drops mid-file
    // A timeout is a loud failure: the step's check below reads paused = false, with the words seen so far.
    paused = await page.waitForFunction(() => (document.querySelector("[data-upload-words]")?.textContent ?? "").endsWith("Upload paused: reconnecting"), null, { timeout: 30_000 })
      .then(() => true, async () => { console.log(`FAIL  ${label}: no "Upload paused: reconnecting" within 30 s; words: ${JSON.stringify(await page.evaluate(() => (window as unknown as { __words: string[] }).__words))}`); return false; });
    whileCut = { files: fileRows(), docs: docRows() };
    await page.screenshot({ path: join(SHOTS, `${shot}-paused.png`) });
    await page.waitForTimeout(1500);
    await ctx.setOffline(false);   // back online
  }
  await page.locator("[data-upload-words='done'], [data-upload-refused]").first().waitFor({ timeout: 120_000 });
  const seen = await page.evaluate(() => (window as unknown as { __words: string[] }).__words);
  const refused = await page.locator("[data-upload-refused]").textContent().catch(() => null);
  return { ctx, page, ids, seen, paused, whileCut, refused, words: await words.textContent() };
}

try {
  // ---------------------------------------------------------------------- W1: cut and resume at 1440 px, listed
  const files0 = fileRows(), docs0 = docRows();
  const doc1 = bigPdf(6 * MB, "w1");
  const w1 = await walk("1440", { viewport: { width: 1440, height: 900 } }, { name: "invitation-letter.pdf", bytes: doc1 }, true, "w1-1440");
  const resumed = w1.seen.map((s) => /Resumed, (\d+)%$/.exec(s)?.[1]).filter((x): x is string => !!x).map(Number);
  ok("R1.64 W1: at 1440 px, offline mid-upload the panel says \"Upload paused: reconnecting\" and nothing is stored yet", w1.paused && w1.whileCut.files === files0 && w1.whileCut.docs === docs0, { paused: w1.paused, whileCut: w1.whileCut });
  ok("R1.64 W1: back online it says \"Resumed, N%\" with N > 0, then finishes (no refusal)", resumed.length > 0 && resumed[0] > 0 && !w1.refused && w1.seen.indexOf(w1.seen.find((s) => s.endsWith("Upload paused: reconnecting"))!) < w1.seen.findIndex((s) => /Resumed/.test(s)), { seen: w1.seen.slice(-6), refused: w1.refused });
  const listed = w1.page.locator(`[data-other-documents="${person}"] [data-other-document][data-current]`).filter({ hasText: "invitation-letter.pdf" });
  const isListed = await listed.waitFor({ timeout: 30_000 }).then(() => true, () => false);
  const stored = rawSql(`select id || '|' || sha256 || '|' || path from case_document where subject_id = '${person}' and document_type = 'letter_of_invitation' and current`).split("|");
  const onDisk = stored[2] ? join(VAR, "workspaces", "demo", stored[2]) : "";
  ok("R1.64 W1: the document is listed on the panel; the stored sha256 is the original's (database and the file kept)",
    isListed && stored[1] === sha(doc1) && !!onDisk && existsSync(onDisk) && sha(readFileSync(onDisk)) === sha(doc1), { isListed, stored: stored.slice(0, 2) });
  await w1.page.locator(`[data-other-documents="${person}"]`).screenshot({ path: join(SHOTS, "w1-1440-listed.png") });

  // ------------------------------------------------------------------------- W2: one row, one version, repeat
  const upload1 = w1.ids.at(-1) ?? "";
  await w1.ctx.close();
  const tOfficer = await tokenOf(OFFICER);   // the browser's sign-in ended the earlier session (one session per person)
  const f1 = sql(`select id from plat_file where key = 'case-documents/${person}/${upload1}'`);
  ok("R1.64 W2: one plat_file row (SCANNING, the original's sha256) and one new document version",
    fileRows() === files0 + 1 && sql(`select scan_state || '|' || sha256 from plat_file where id = '${f1}'`) === `SCANNING|${sha(doc1)}` && docRows() === docs0 + 1, { files: [files0, fileRows()], docs: [docs0, docRows()] });
  const again = await tus(tOfficer, "PATCH", `${UPLOADS}/${upload1}`, { "upload-offset": String(doc1.length), "content-type": "application/offset+octet-stream" }, new Uint8Array(0));
  const againHead = await tus(tOfficer, "HEAD", `${UPLOADS}/${upload1}`);
  ok("R1.64 W2: a repeated finish (an empty PATCH at the end, then HEAD) answers the same file id; no second row, no second version",
    !!f1 && again.headers.get("upload-file-id") === f1 && againHead.headers.get("upload-file-id") === f1 && fileRows() === files0 + 1 && docRows() === docs0 + 1, { patch: again.status, head: againHead.status });

  // ------------------------------------------------------------------------- W3: another firm's Owner → 404
  const oh = await tus(tOther, "HEAD", `${UPLOADS}/${upload1}`), op = await tus(tOther, "PATCH", `${UPLOADS}/${upload1}`, { "upload-offset": String(doc1.length), "content-type": "application/offset+octet-stream" }, new Uint8Array(0));
  ok("R1.64 W3: sample-solo's Owner gets 404 on HEAD and PATCH of W1's upload id", oh.status === 404 && op.status === 404 && !op.headers.get("upload-file-id"), { head: oh.status, patch: op.status });

  // ---------------------------------------------------------------------- W4: not an allowed kind behind .pdf
  const files4 = fileRows(), docs4 = docRows();
  const fake = Buffer.from(`MZ Sample J-64 ${run}: these bytes are no PDF, JPEG or PNG ${"x".repeat(4000)}`);
  const w4 = await walk("1440 refused", { viewport: { width: 1440, height: 900 } }, { name: "letter.pdf", bytes: fake }, false, "w4");
  const upload4 = w4.ids.at(-1) ?? "";
  const keptFile = upload4 && existsSync(join(VAR, "front-office-files", sql(`select id from platform_firm where key = 'sample-firm'`).toLowerCase(), "case-documents", person, upload4));
  ok("R1.64 W4: a .pdf-named file whose bytes are not an allowed kind shows PF-F4's words on screen; no plat_file row, no document, no stored file",
    /Allowed here: PDF, JPEG and PNG\./.test(w4.refused ?? "") && /Nothing was stored\./.test(w4.refused ?? "") && fileRows() === files4 && docRows() === docs4 && !keptFile, { refused: w4.refused, files: [files4, fileRows()], docs: [docs4, docRows()], keptFile });
  ok("R1.64 W4: the refusal is said once (the alert; the status line is empty)", (await w4.page.locator("[data-upload-words]").textContent()) === "", await w4.page.locator("[data-upload-words]").textContent());
  await w4.page.locator(`[data-other-documents="${person}"]`).screenshot({ path: join(SHOTS, "w4-refused-1440.png") });
  await w4.ctx.close();

  // ------------------------------------------------------------------------------- W5: the same on a Pixel 7
  const files5 = fileRows(), docs5 = docRows();
  const doc5 = bigPdf(6 * MB, "w5");
  const w5 = await walk("Pixel 7", { ...devices["Pixel 7"] }, { name: "invitation-letter-phone.pdf", bytes: doc5 }, true, "w5-pixel7");
  const resumed5 = w5.seen.map((s) => /Resumed, (\d+)%$/.exec(s)?.[1]).filter((x): x is string => !!x).map(Number);
  const stored5 = sql(`select sha256 from case_document where subject_id = '${person}' and document_type = 'letter_of_invitation' and current`);
  ok("R1.64 W5: on a Pixel 7 the same cut says \"Upload paused: reconnecting\", then \"Resumed, N%\" (N > 0), and the file is stored once with the original's sha256",
    w5.paused && resumed5.length > 0 && resumed5[0] > 0 && !w5.refused && stored5 === sha(doc5) && fileRows() === files5 + 1 && docRows() === docs5 + 1, { paused: w5.paused, seen: w5.seen.slice(-5), refused: w5.refused });
  // The panel's block fits the phone: nothing of it past the right edge. The case page as a whole is measured too and,
  // when it scrolls sideways because of another panel, said as a NOTE naming that panel (not this row's).
  const fit = await w5.page.evaluate((who) => {
    const vw = document.documentElement.clientWidth, block = document.querySelector(`[data-other-documents="${who}"]`)!;
    const over = [block, ...block.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > vw + 0.5 && !e.classList.contains("sr-only")).map((e) => e.tagName);
    const wide = [...document.querySelectorAll("table, pre")].filter((e) => e.getBoundingClientRect().right > vw + 0.5).map((e) => e.closest("section[aria-labelledby]")?.querySelector("h2")?.textContent?.trim() ?? e.tagName);
    return { over, page: document.documentElement.scrollWidth - vw, wide: [...new Set(wide)] };
  }, person);
  ok("R1.64 W5: the Other documents block fits the phone: nothing of it past the right edge", fit.over.length === 0, fit);
  if (fit.page > 0) console.log(`NOTE  W5: the case page scrolls sideways by ${fit.page} px on a Pixel 7, from ${fit.wide.join(", ") || "another element"} (not this row's panel)`);
  const block5 = w5.page.locator(`[data-other-documents="${person}"]`);
  ok("R1.64 W5: the current file is marked \"current\"; the earlier one is folded behind \"1 earlier version\" with when it was replaced",
    /invitation-letter-phone\.pdf .*· current/.test(await block5.locator("[data-other-document][data-current]").innerText()) && (await block5.locator("[data-other-earlier] summary").innerText()).trim() === "1 earlier version"
    && /· replaced \d/.test(await block5.locator("[data-other-earlier] [data-other-document]").textContent() ?? ""), await block5.innerText());
  await w5.page.locator(`[data-other-documents="${person}"]`).screenshot({ path: join(SHOTS, "w5-pixel7-listed.png") });
  await w5.ctx.close();

  // ------------------------------------------------- W6: 1024 px, keyboard only, axe; a Read-only person's words
  const ctx6 = await browser.newContext({ viewport: { width: 1024, height: 800 }, baseURL: BASE, colorScheme: "light", reducedMotion: "reduce", deviceScaleFactor: 2 });
  await ctx6.addInitScript((a) => { try { localStorage.setItem("xr-actor", a); } catch { /* private window */ } }, OFFICER);
  const p6 = await ctx6.newPage(); p6.on("pageerror", (e) => errors.push(`1024: ${e.message}`));
  await p6.goto(`/cases/${caseId}`);
  const add6 = p6.locator(`[data-other-documents="${person}"] [data-other-upload="letter_of_invitation"]`);
  await add6.waitFor({ timeout: 60_000 });
  const onAdd = () => add6.evaluate((e) => e === document.activeElement);
  const signInByKeys = async (email: string) => {
    await add6.focus(); await p6.keyboard.press("Enter");
    const card = p6.locator("[data-other-sign-in]"); await card.waitFor({ timeout: 15_000 });
    await card.getByLabel("Firm key").focus(); await p6.keyboard.type("sample-firm"); await p6.keyboard.press("Tab"); await p6.keyboard.type(email); await p6.keyboard.press("Enter");
    await card.waitFor({ state: "detached", timeout: 30_000 });
    await p6.waitForLoadState("networkidle");   // the signed-in page's reads settle before the next key
    return p6.waitForFunction((who) => document.activeElement?.closest(`[data-other-documents="${who}"]`)?.hasAttribute("data-other-documents") && document.activeElement.hasAttribute("data-other-upload"), person, { timeout: 5_000 }).then(() => true, async () => { console.log(`FAIL  W6: focus after sign-in is on ${await p6.evaluate(() => `${document.activeElement?.tagName} ${document.activeElement?.outerHTML.slice(0, 120)}`)}`); return false; });
  };
  // Review R2-1: Enter on Add opens the chooser only once Add is ready (not aria-disabled while the page settles); the
  // waiter is armed before the key, and the key goes to Add itself.
  const enterOnAdd = async (timeout = 30_000) => {
    await p6.waitForFunction(() => { const a = document.activeElement; return !!a?.hasAttribute("data-other-upload") && a.getAttribute("aria-disabled") !== "true"; }, null, { timeout: 10_000 }).catch(() => undefined);
    const waiter = p6.waitForEvent("filechooser", { timeout });
    await add6.press("Enter");
    return waiter;
  };
  const focusAfterSignIn = await signInByKeys(emailOf(OFFICER));
  if (!focusAfterSignIn) await add6.focus();   // said above as a failure; the walk goes on from the button
  const chooser6 = await enterOnAdd(60_000);
  await chooser6.setFiles({ name: "invitation-keyboard.pdf", mimeType: "application/pdf", buffer: bigPdf(200_000, "w6") });
  await p6.locator("[data-upload-words='done']").waitFor({ timeout: 60_000 });
  const focusAfterUpload = await p6.waitForFunction(() => document.activeElement?.hasAttribute("data-other-upload"), null, { timeout: 5_000 }).then(() => true, () => false);
  ok("R1.64 W6: at 1024 px, keyboard only: Enter on Add, the sign-in typed and sent with Enter, focus back on Add; Enter uploads; focus back on Add after it",
    focusAfterSignIn && focusAfterUpload && await onAdd(), { focusAfterSignIn, focusAfterUpload });
  const axe = await new AxeBuilder({ page: p6 }).include("[data-documents-panel]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  ok("R1.64 W6: axe finds no WCAG A/AA violation on the Documents panel at 1024 px", axe.violations.length === 0, axe.violations.map((v) => v.id));
  await p6.locator(`[data-other-documents="${person}"]`).screenshot({ path: join(SHOTS, "w6-1024-keyboard.png") });
  // Labelled test data: the second representative's roles ended and Read only given, then restored.
  const rep2 = sql(`select id from platform_staff where actor_id = 'user-T'`), firmA = sql(`select id from platform_firm where key = 'sample-firm'`);
  rawSql(`update platform_role_grant set ended_at = now(), ended_by = 'J-64 (Sample)', end_reason = 'Sample: Read only' where staff_id = '${rep2}' and ended_at is null; insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${firmA}', '${rep2}', 'READ_ONLY', 'J-64 (Sample)')`);
  await p6.evaluate(() => { try { sessionStorage.removeItem("xr-staff-session"); } catch { /* ignore */ } }); await p6.reload(); await add6.waitFor({ timeout: 60_000 });
  await signInByKeys(emailOf("user-T"));
  const chooser7 = await enterOnAdd(15_000).catch(() => null);
  await chooser7?.setFiles({ name: "invitation-read-only.pdf", mimeType: "application/pdf", buffer: bigPdf(2_000, "w6ro") });
  const roWords = await p6.locator("[data-upload-refused]").textContent({ timeout: 30_000 }).catch(() => null);
  ok("R1.64 W6 fail: a Read-only staff member is told in words (\"Your role cannot add documents to cases. Nothing was stored.\"), never \"no longer on the server\"",
    roWords === "Your role cannot add documents to cases. Nothing was stored.", roWords);
  rawSql(`update platform_role_grant set ended_at = now(), ended_by = 'J-64 (Sample)', end_reason = 'Sample: roles back' where staff_id = '${rep2}' and role = 'READ_ONLY' and ended_at is null; update platform_role_grant set ended_at = null, ended_by = null, end_reason = null where staff_id = '${rep2}' and role <> 'READ_ONLY'`);
  await ctx6.close();
  ok("J-64: no page error in any walk", errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
