// J-35 (map row 35, R1.35: "Contacts import from a spreadsheet"), the acceptance journey for the row: PF-10s (My account →
// Import, New import in three steps) on PF-10b part 1's engine and PF-10t's People target. It walks the firm's Owner on
// an isolated copy of the running app (its own database and port, never :4400), by screens, with the API and the
// database read underneath. Done when (R1.35): "Preview, column mapping, each bad row's reason; good rows imported once
// (a re-import adds no duplicate), with source and consent set". Steps:
//   W1 the Owner signs in on the sign-in card, finds Import in My account's menu, sees the empty state and saves the
//      People template (a CSV whose header is the People fields).
//   W2 New import: People, "Old CRM", a 5-row CSV (one person already known by email, one bad email, one repeat of an
//      earlier row, two new people) → the Columns step offers each column's field from its header.
//   W3 Columns: one column per field (a field used by one column is disabled in the others); the consent column needs
//      the declaration (refused on the field until ticked); the Owner confirms the attestation once; Preview.
//   W4 Preview: To create 2 · To merge 1 · Skip 1 · Errors 1; the bad row's reason in words ("Email: is not an email
//      address"), never the cell's value; a changed column after the preview disables Import with the reason, and a
//      fresh preview enables it again (BR-2).
//   W5 Import 3 people → the result "Done: 2 created, 1 merged, 1 skipped, 1 not imported."; the created rows read
//      "Imported from Old CRM"; underneath: the known person kept their filled names and gained the phone; the new people
//      have origin Import, source "Old CRM"; one IMPORT_DECLARED marketing consent for the "yes" person, none for "no";
//      no lead, no message.
//   W6 the same file again → the preview shows To create 0, Import disabled "Nothing new to import."; no person added.
//   W7 the Case Officer (no import keys) sees no Import entry; the page says no access; the API refuses (403).
//   W8 375, 1024 and 1440 px: the list and the import page have no sideways scroll and no WCAG 2.2 A/AA violation (axe);
//      no page error. The walk ends on the list, the import "Done with errors" (imported people have no front-office
//      page yet: challenge B1, a follow-up row).
// Re-runnable on one copy (the emails carry the run's id). Sample firm and people only; US$0, no model call, live AI off,
// no live mail. Screenshots: product/screens/J-35/screenshots/. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j35 4435 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j35 4435 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_35.ts j35 4435
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Locator, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j35", Number(process.argv[3] ?? 4435)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-35", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
const run = Date.now().toString(36).slice(-5);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys
const api = async (t: string, path: string): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { headers: { authorization: `Bearer ${t}` } });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j };
};
const seen = (l: Locator, ms = 8_000) => l.first().waitFor({ timeout: ms }).then(() => true, () => false);

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
const email = (actor: string) => sql(`select email from platform_staff where actor_id = '${actor}' and firm_id = '${A}'`);
const R = email("user-R"), O = email("user-O");
const KNOWN = `known.${run}@client.test`, NEW_A = `ana.${run}@client.test`, NEW_B = `ben.${run}@client.test`;
const known = await db.foPerson.create({ data: { firmId: A, createdBy: "seed:j35", phoneReadable: true, givenNames: "Kim", familyName: "Known", email: KNOWN } as never });
const FILE = ["First name,Last name,Email,Phone,Marketing",
  `Ana,New,${NEW_A},(416) 555-0101,yes`,       // 1 create, consent
  `Kimberly,Known,${KNOWN},416 555 0102,`,      // 2 merge: phone filled, names kept
  "Bad,Row,not-an-email,,",                     // 3 error: the email
  `Ana,Again,${NEW_A.toUpperCase()},,yes`,      // 4 skip: a repeat of row 1
  `Ben,New,${NEW_B},,no`,                       // 5 create, no consent
].join("\r\n") + "\r\n";
const people = () => Number(sql(`select count(*) from fo_person where firm_id = '${A}'`) || "0");
const leads0 = sql(`select count(*) from fo_lead where firm_id = '${A}'`), out0 = sql("select count(*) from msg_outbox");
ok("J-35 setup: the Sample firm with its front office, the Owner (user-R), the Case Officer (user-O) and one known person by email", !!A && !!R && !!O && fo.failed.length === 0);

const browser = await chromium.launch({ headless: process.env.HEADED !== "1", slowMo: process.env.HEADED === "1" ? 150 : 0, ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errors: string[] = [];
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `j35-${name}.png`), fullPage: true }).catch(() => undefined);
const newPage = async (width = 1440, token?: string) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce", acceptDownloads: true });
  if (token) await ctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, token);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
  return p;
};
async function signIn(mail: string): Promise<Page> {
  const p = await newPage();
  await p.goto(`${BASE}/account`);
  await p.getByLabel("Firm key").fill("sample-firm"); await p.getByLabel("Work email").fill(mail); await p.getByRole("button", { name: "Sign in" }).click();
  await p.getByLabel("Firm key").waitFor({ state: "detached", timeout: 30_000 });
  return p;
}
const pageToken = (p: Page) => p.evaluate(() => (JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}") as { token?: string }).token ?? "");
const chip = async (p: Page, o: string) => (await p.locator(`[data-chip="${o}"] [data-count]`).innerText().catch(() => "")).trim();
const upload = async (p: Page, source: string) => {
  await p.locator("[data-new-import]").click();
  await p.locator("[data-source]").fill(source);
  await p.locator("[data-file]").setInputFiles({ name: "contacts.csv", mimeType: "text/csv", buffer: Buffer.from(FILE, "utf8") });
  await p.locator("[data-upload]").click();
  return seen(p.locator('[data-step="columns"]'), 30_000);
};

try {
  // ---------------------------------------------------------------------------------------------- W1 the menu and the template
  const p = await signIn(R); const TR = await pageToken(p);
  const entry = p.locator('[data-account-section="/platform/import"]');
  const hasEntry = await seen(entry, 20_000);
  if (hasEntry) await entry.first().click(); else await p.goto(`${BASE}/platform/import`);
  const empty = await seen(p.locator("[data-empty]"), 20_000);
  const dl = await Promise.all([p.waitForEvent("download", { timeout: 10_000 }), p.locator("[data-template-download]").first().click()]).then(([d]) => d, () => null);
  const tpl = dl ? readFileSync((await dl.path())!, "utf8") : "";
  await shot(p, "w1-empty-1440");
  ok("J-35 W1: the Owner finds Import in My account's menu, sees the empty state and saves the People template (Given names, Family name, Email, Phone, Language, Email marketing consent)",
    hasEntry && empty && dl?.suggestedFilename() === "people-import-template.csv" && tpl.split("\r\n")[0] === "Given names,Family name,Email,Phone,Language,Email marketing consent", { hasEntry, empty, file: dl?.suggestedFilename(), head: tpl.split("\r\n")[0] });

  // ---------------------------------------------------------------------------------------------- W2 the file
  const onColumns = await upload(p, "Old CRM");
  const offered = Object.fromEntries(await Promise.all(["First name", "Last name", "Email", "Phone", "Marketing"].map(async (h) => [h, await p.locator(`[data-import-as="${h}"]`).inputValue().catch(() => "")])));
  await shot(p, "w2-columns-1440");
  ok("J-35 W2: the upload reaches Columns, each column offered its field from the header (first name → Given names, …, Marketing → Email marketing consent)",
    onColumns && offered["First name"] === "givenNames" && offered["Last name"] === "familyName" && offered.Email === "email" && offered.Phone === "phone" && offered.Marketing === "marketingConsent", offered);

  // ---------------------------------------------------------------------------------------------- W3 one per field, declaration, attestation
  const usedDisabled = await p.locator('[data-import-as="Phone"] option[value="email"]').isDisabled();
  await p.locator("[data-preview]").click();
  const declRefused = await seen(p.locator("#decl-err"), 5_000) && (await p.locator("[data-declare]").getAttribute("aria-invalid")) === "true";
  await p.locator("[data-declare]").check();
  const attestShown = await seen(p.locator("[data-attest]"), 10_000);
  if (attestShown) { await p.locator("[data-attest-tick]").click(); await p.locator("[data-attest]").waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined); }
  ok("J-35 W3: a field one column uses is disabled in the others; the consent column is refused on the declaration until ticked; the Owner confirms the attestation once",
    usedDisabled && declRefused && attestShown && sql(`select count(*) from plat_import_attestation where firm_id = '${A}'`) === "1", { usedDisabled, declRefused, attestShown });
  await p.locator("[data-preview]").click();

  // ---------------------------------------------------------------------------------------------- W4 the preview
  const onPreview = await seen(p.locator('[data-step="preview"]'), 30_000) && await seen(p.locator("[data-row]"), 20_000);
  const totals = { c: await chip(p, "CREATE"), m: await chip(p, "MERGE"), s: await chip(p, "SKIP"), e: await chip(p, "ERROR") };
  const bad = (await p.locator('[data-row="3"] [data-reason]').innerText().catch(() => "")).trim();
  const tableText = await p.locator('[data-step="preview"] table').innerText().catch(() => "");
  await shot(p, "w4-preview-1440");
  ok("J-35 W4: the preview: To create 2 · To merge 1 · Skip 1 · Errors 1; the bad row's reason in words, never the cell's value",
    onPreview && totals.c === "2" && totals.m === "1" && totals.s === "1" && totals.e === "1" && bad === "Email: is not an email address" && !tableText.includes("not-an-email"), { totals, bad });
  await p.locator("[data-back]").click();
  await p.locator('[data-import-as="Phone"]').selectOption("");
  await p.locator("[data-to-preview]").click();
  const staleWhy = (await p.locator("[data-run-why]").innerText().catch(() => "")).trim(), staleOff = await p.locator("[data-run]").isDisabled();
  await shot(p, "w4-stale-1440");
  await p.locator("[data-back]").click();
  await p.locator('[data-import-as="Phone"]').selectOption("phone");
  await p.locator("[data-preview]").click();
  await seen(p.locator('[data-step="preview"]'), 30_000);
  const runWords = (await p.locator("[data-run]").innerText().catch(() => "")).trim(), runOn = await p.locator("[data-run]").isEnabled();
  ok("J-35 W4: a changed column after the preview disables Import with the reason; a fresh preview enables \"Import 3 people\" (BR-2)",
    staleOff && staleWhy === "The columns changed. Preview again before importing." && runOn && runWords === "Import 3 people", { staleOff, staleWhy, runOn, runWords });

  // ---------------------------------------------------------------------------------------------- W5 the run and the result
  const p0 = people();
  await p.locator("[data-run]").click();
  const done = await seen(p.locator("[data-done]"), 60_000);
  const doneText = (await p.locator("[data-done]").innerText().catch(() => "")).trim();
  const createdWords = await p.locator('[data-outcome="CREATE"] [data-reason]').allInnerTexts().catch(() => [] as string[]);
  await shot(p, "w5-result-1440");
  ok("J-35 W5: Import → the result \"Done: 2 created, 1 merged, 1 skipped, 1 not imported.\"; each created row reads \"Imported from Old CRM\"",
    done && doneText === "Done: 2 created, 1 merged, 1 skipped, 1 not imported." && createdWords.length === 2 && createdWords.every((w) => w.trim() === "Imported from Old CRM"), { doneText, createdWords });
  const k = await db.foPerson.findUniqueOrThrow({ where: { id: known.id } });
  const ana = await db.foPerson.findFirst({ where: { firmId: A, email: NEW_A } }), ben = await db.foPerson.findFirst({ where: { firmId: A, email: NEW_B } });
  const origin = ana ? await api(TR, `/platform/imports/origin/fo_person/${ana.id}`) : null;
  const consent = (id?: string) => (id ? sql(`select coalesce(string_agg(basis || '|' || source, ','), '') from msg_consent where subject_id = '${id}' and purpose = 'MARKETING' and withdrawn_at is null`) : "x");
  ok("J-35 W5: underneath: 2 people added; the known person kept \"Kim\" and gained the phone in E.164; Ana's origin is Import from \"Old CRM\"; one IMPORT_DECLARED consent for Ana, none for Ben; no lead, no message",
    people() === p0 + 2 && k.givenNames === "Kim" && k.phone === "+14165550102" && origin?.body?.origin === "IMPORT" && origin.body.sourceName === "Old CRM"
      && consent(ana?.id) === "IMPORT_DECLARED|IMPORT_DECLARED" && consent(ben?.id) === "" && sql(`select count(*) from fo_lead where firm_id = '${A}'`) === leads0 && sql("select count(*) from msg_outbox") === out0,
    { people: people() - p0, k: [k.givenNames, k.phone], origin: origin?.body, ana: consent(ana?.id), ben: consent(ben?.id) });

  // ---------------------------------------------------------------------------------------------- W6 the same file again
  await p.goto(`${BASE}/platform/import`);
  await seen(p.locator("[data-import-row]"), 20_000);
  await upload(p, "Old CRM");
  const saved = await seen(p.locator("[data-saved-mapping]"), 5_000);
  if (await p.locator("[data-declare]").count()) await p.locator("[data-declare]").check();
  await p.locator("[data-preview]").click();
  await seen(p.locator('[data-step="preview"]'), 30_000); await seen(p.locator("[data-row]"), 20_000);
  const again = { c: await chip(p, "CREATE"), m: await chip(p, "MERGE") }, nothingWhy = (await p.locator("[data-run-why]").innerText().catch(() => "")).trim(), off = await p.locator("[data-run]").isDisabled();
  await shot(p, "w6-reimport-1440");
  ok("J-35 W6: the same file again: the saved mapping is offered; the preview shows To create 0 · To merge 0 and Import is disabled \"Nothing new to import.\"; no person added",
    saved && again.c === "0" && again.m === "0" && off && nothingWhy === "Nothing new to import." && people() === p0 + 2, { saved, again, nothingWhy, off });

  // ---------------------------------------------------------------------------------------------- W7 the Case Officer
  const o = await signIn(O); const TO = await pageToken(o);
  await o.goto(`${BASE}/account`); await wait(1500);
  const oEntry = await o.locator('[data-account-section="/platform/import"]').count();
  await o.goto(`${BASE}/platform/import`);
  const oNo = await seen(o.locator("[data-no-access]"), 20_000), oApi = await api(TO, "/platform/imports");
  await shot(o, "w7-case-officer-1440");
  ok("J-35 W7: the Case Officer sees no Import entry, the page says no access, and the API refuses (403)", oEntry === 0 && oNo && oApi.status === 403, { oEntry, oNo, api: oApi.status });
  await o.context().close();

  // ---------------------------------------------------------------------------------------------- W8 sizes, axe, the end
  const batchId = sql(`select id from plat_import_batch where firm_id = '${A}' and state in ('COMPLETED','PARTIAL') order by created_at limit 1`);
  for (const width of [375, 1024, 1440]) for (const path of ["/platform/import", `/platform/import/${batchId}`]) {
    const q = await newPage(width, TR);
    await q.goto(`${BASE}${path}`);
    const there = await seen(q.locator(path === "/platform/import" ? "[data-import-row]" : "[data-done]"), 30_000);
    const fits = await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const badA = there ? (await wait(300), await new AxeBuilder({ page: q }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${x.id}: ${x.nodes[0]?.target}`) : ["no page"];
    if (width !== 1440) await shot(q, `w8-${path === "/platform/import" ? "list" : "result"}-${width}`);
    ok(`J-35 W8: ${path === "/platform/import" ? "the list" : "the import's result"} at ${width} px has no sideways scroll and no WCAG 2.2 A/AA violation (axe)`, there && fits && badA.length === 0, { there, fits, bad: badA });
    await q.context().close();
  }
  await p.goto(`${BASE}/platform/import`);
  const endRow = await seen(p.locator('[data-import-row][data-state="PARTIAL"]'), 20_000);
  await shot(p, "w8-end-list-1440");
  ok("J-35 W8: the walk ends on the list: the import \"Done with errors\" with its counts; no page error on any page walked", endRow && errors.length === 0, errors.slice(0, 3));
  await p.context().close();
} catch (e) {
  ok("J-35: the walk ran to its end", false, String(e).slice(0, 500));
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
