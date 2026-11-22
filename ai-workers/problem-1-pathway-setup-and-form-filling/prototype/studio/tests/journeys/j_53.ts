// J-53 (map row 53, R1.53: "Retainer with the regulator's 26 items; versioned until sent"): the join-and-walk row. It adds
// no feature: it joins FO-5 (retainers, versions, Send), FO-5b (the Code s. 24(3) checklist) and FO-5s part 1 (the
// retainer screens) and walks them like a person on an isolated copy of the running app (own database and port, never
// :4400), in a real browser against the real routes: no fake API, no stubbed request. It starts where J-42 ends (j_42.ts W9:
// an Engaged prospect).
//   W0 the firm's Owner sets up the firm's retainer: Settings › Retainer templates, Download a starter template, Upload it
//      (FO-5s part 2, S1); the template's Code line says how many of the 26 items it marks;
//   W1 the firm's Owner (a licensed representative) opens the prospect: the Retainer card says "No retainer yet."; the
//      conflict check is recorded on the prospect's own panel (FO-13s; Send needs it, FO-13c);
//   W2 Prepare retainer from the card makes version 1 in Draft and opens it: the Code line ("n of 26 items marked"), each
//      item marked or not, never blocking; the empty fee blocks Send on its field and in the summary;
//   W3 the fee is typed and saved: version 2; Check and send, Send: version 2 is sent and stays as sent;
//   W4 Edit after Send makes version 3 in Draft (version 2 keeps its fee, ended as replaced); Send sends version 3;
//   W5 the card on the prospect says Sent, version 3, waiting for the client: map row 54's first step (the client signs:
//      FO-6's public signing door is not on main), so the walk ends on this card.
//   DW1 the checklist is the committed official text (samples/cicc-code-s24-items.json: its items and "current to" date
//   are what the page shows) · DW2 the version a person downloads is the real rendered agreement: its SHA-256 is the
//   stored original_sha256 and its text holds the client's name and the fee. Each DW judge is run again on a stand-in
//   (a list with one item fewer; bytes not from the renderer) and must fail there (the "NR" lines, P-606).
// No setup by API: the template is uploaded by screens (W0). Sample values only; US$0, no model call. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j53 4593 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j53 4593 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_53.ts j53 4593
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import PizZip from "pizzip";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j53", Number(process.argv[3] ?? 4593)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-53", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const firmId = sql(`select id from platform_firm where key = 'sample-firm'`);
ok("J-53 setup: the Sample firm and its front office are seeded", !!firmId && fo.failed.length === 0, fo.failed);
const [ownerId, ownerEmail] = sql(`select id || '|' || email from platform_staff where actor_id = 'user-R'`).split("|");   // Owner + Case Manager, licensed
const given = `Client${run}`, email = `j53.${run}@example.com`, client53 = `${given} Sample`;
const pid = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firmId}', '${given}', 'Sample', '${email}', 'test', now()) returning id`);
sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, state, engaged_at, engaged_by, created_by, updated_at) values (gen_random_uuid(), '${firmId}', '${pid}', 'MANUAL', 'WEBSITE', '${ownerId}', 'ENGAGED', now(), 'test', 'test', now())`);
const prospectId = sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
  select gen_random_uuid(), '${firmId}', l.id, 'INDIVIDUAL', (select id from fo_stage where firm_id = '${firmId}' and pipeline = 'INDIVIDUAL' and key = 'ENGAGED'), '${pid}', '${pid}', '${ownerId}', 'test', now() from fo_lead l where l.person_id = '${pid}' returning id`);
sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${prospectId}'`);
const signIn = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email: ownerEmail, secondStep: true }) });
const tok = ((await signIn.json()) as { token?: string }).token;
if (!tok) { console.error("STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local)"); process.exit(2); }
sql(`update fo_retainer_template set active = false where firm_id = '${firmId}'`);   // re-runnable: one active template
const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce", acceptDownloads: true });
await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tok);
const p: Page = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
const shot = (name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const axe = async (name: string) => { const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze(); ok(`J-53 ${name}: axe finds no serious or critical WCAG A/AA finding`, !r.violations.some((v) => v.impact === "serious" || v.impact === "critical"), r.violations.map((v) => `${v.id}: ${v.nodes.length}`)); };
const card = p.locator("[data-retainer-card]"), status = p.locator("[data-retainer-status]");
const ret = () => db.foRetainer.findFirstOrThrow({ where: { firmId, prospectId }, include: { versions: { orderBy: { n: "asc" }, include: { fees: true } } } });
const sendNow = async () => { await p.locator("[data-check-and-send]").click(); const s = p.getByRole("dialog", { name: /^Send to .* to sign$/ }); await s.waitFor(); await s.getByRole("button", { name: /^Send to / }).click(); await status.filter({ hasText: "Sent" }).waitFor({ timeout: 15_000 }); };

try {
  // ---------------------------------------------------------------------------------------------- W0 the firm's template, by screens
  await p.goto(`${BASE}/front-office/pipeline`); await p.getByRole("navigation", { name: "Sales" }).getByRole("link", { name: "Retainer templates" }).click();
  await p.getByRole("heading", { name: "Retainer templates" }).waitFor({ timeout: 30_000 });
  const dlS = p.waitForEvent("download"); await p.getByRole("button", { name: "Download a starter template" }).click();
  const starterFile = await (await dlS).path();
  await p.getByRole("button", { name: "Upload template" }).click();
  const up = p.getByRole("dialog", { name: "Upload template" });
  await up.getByLabel("Name").fill(`Standard retainer ${run}`); await up.getByLabel("Template file (.docx)").setInputFiles(starterFile);
  await up.getByRole("button", { name: "Upload template" }).click(); await up.waitFor({ state: "detached", timeout: 15_000 });
  await p.locator(`[data-template-row="Standard retainer ${run}"]`).getByRole("button").click();
  const tplSummary = await p.locator("[data-template-summary]").innerText({ timeout: 15_000 });
  ok(`J-53 W0: the Owner downloads the starter and uploads it in Settings › Retainer templates; its panel says "${tplSummary}"`, /^\d+ of 26 items marked in this template$/.test(tplSummary) && sql(`select count(*) from fo_retainer_template where firm_id = '${firmId}' and active`) === "1");
  await shot("W0-template"); await axe("W0 the template panel");
  await p.keyboard.press("Escape");

  // ---------------------------------------------------------------------------------------------- W1 the prospect, the conflict check
  await p.goto(`${BASE}/front-office/prospects/${prospectId}`);
  await card.locator("[data-no-retainer]").waitFor({ timeout: 30_000 });
  ok("J-53 W1: the prospect page's Retainer card says \"No retainer yet.\" and offers Prepare retainer", await card.getByRole("button", { name: "Prepare retainer" }).isVisible());
  await shot("W1-prospect"); await axe("W1 the prospect page");
  const panel = p.locator("[data-conflict-panel]");
  await panel.getByRole("button", { name: "Run a check" }).click();
  const check = p.getByRole("dialog", { name: "Run a conflict check" }); await check.locator("[data-searched]").waitFor({ timeout: 15_000 });
  await check.getByLabel("No conflict").check(); await check.getByRole("button", { name: "Save check" }).click(); await check.waitFor({ state: "detached", timeout: 15_000 });
  ok("J-53 W1: the conflict check is recorded on the prospect's own panel (one row, No conflict)", sql(`select count(*) || ':' || max(result::text) from fo_conflict_check where prospect_id = '${prospectId}'`) === "1:NO_CONFLICT");

  // ---------------------------------------------------------------------------------------------- W2 Prepare, the Code's items, the blocker
  await card.getByRole("button", { name: "Prepare retainer" }).click();
  const prep = p.getByRole("dialog", { name: "Prepare retainer" });
  await prep.getByLabel("Template").locator("option", { hasText: `Standard retainer ${run}` }).waitFor({ state: "attached", timeout: 10_000 });
  await prep.getByRole("button", { name: "Prepare retainer" }).click();
  await p.waitForURL(/\/front-office\/retainers\//, { timeout: 15_000 }); await status.waitFor({ timeout: 15_000 });
  let r = await ret();
  ok("J-53 W2: Prepare makes version 1 in Draft for the client and opens its page", r.status === "DRAFT" && r.currentVersion === 1 && (await p.locator("h1").innerText()).includes(client53));
  const code = JSON.parse(readFileSync(join(STUDIO, "samples", "cicc-code-s24-items.json"), "utf8")) as { source: { currentTo: string }; items: { letter: string }[] };
  const line = await p.locator("[data-code-line]").innerText(), chips = await p.locator("[data-code-checklist] li").allTextContents();
  ok(`J-53 W2: the draft shows the Code's ${code.items.length} items, each marked or not ("${line}"), and says it never stops a send (Unconfirmed: no counsel)`,
    new RegExp(`\\d+ of ${code.items.length} items marked`).test(line) && chips.length === code.items.length && chips.every((c) => /marked/.test(c)) && (await p.locator("[data-code-checklist]").innerText()).includes("never stops a send"), line);
  await p.getByRole("button", { name: "See the items and how we check" }).click();
  const items = p.getByRole("dialog", { name: "The regulator's Code, s. 24(3)" }); await items.locator("[data-code-item]").first().waitFor({ timeout: 10_000 });
  const shown = (await items.locator("[data-code-item]").evaluateAll((els) => els.map((e) => e.getAttribute("data-code-item")))).join(""), itemsText = await items.innerText();
  const dw1 = (list: { letter: string }[], currentTo: string) => shown === list.map((i) => i.letter).join("") && itemsText.includes(currentTo);
  ok("J-53 DW1: the items panel is the committed official text: the same letters in order and its \"current to\" date", dw1(code.items, code.source.currentTo), shown);
  ok("J-53 DW1 NR: the same judge fails on a stand-in list with one item fewer", !dw1(code.items.slice(1), code.source.currentTo));
  await shot("W2-code-items"); await axe("W2 the Code items panel");
  await p.keyboard.press("Escape"); await items.waitFor({ state: "detached" });
  ok("J-53 W2: the empty fee blocks Send, on its field and in the summary", (await p.locator("[data-error-summary]").innerText()).includes("Fee is missing. Add a fee row."));
  await shot("W2-draft"); await axe("W2 the draft");

  // ---------------------------------------------------------------------------------------------- W3 the fee, version 2, Send
  await p.getByLabel("Fee 1: amount").fill("1500");
  await p.getByRole("button", { name: "Save as version 2" }).click();
  await p.locator("[data-version]", { hasText: "Version 2" }).waitFor({ timeout: 15_000 });
  await sendNow();
  r = await ret();
  ok("J-53 W3: the saved fee is version 2 (CAD 1,500.00; version 1 keeps no amount); Send sends version 2", r.status === "SENT" && r.versions.length === 2 && r.versions[1].fees[0].amountMinor === 150000n && r.versions[0].fees[0].amountMinor === null && r.versions[1].sentAt !== null);
  const dl = p.waitForEvent("download"); await p.getByRole("button", { name: "Download version 2" }).click();
  const bytes = readFileSync(await (await dl).path());
  const dw2 = (b: Buffer) => { try { const text = (new PizZip(b).file("word/document.xml")?.asText().match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) ?? []).map((t) => t.slice(t.indexOf(">") + 1, -6)).join(""); return createHash("sha256").update(b).digest("hex") === r.versions[1].originalSha256 && text.includes(client53) && text.includes("1,500.00"); } catch { return false; } };
  ok("J-53 DW2: the downloaded version 2 is the rendered agreement: SHA-256 = the stored original_sha256, and its text holds the client's name and CAD 1,500.00", dw2(bytes));
  ok("J-53 DW2 NR: the same judge fails on bytes not from the renderer", !dw2(Buffer.from("PK stand-in")));
  await shot("W3-sent");

  // ---------------------------------------------------------------------------------------------- W4 Edit after Send: version 3
  await p.getByRole("button", { name: "Edit" }).click();
  await p.getByLabel("Fee 1: amount").fill("1750");
  await p.getByRole("button", { name: "Save as version 3" }).click();
  await p.locator("[data-version]", { hasText: "Version 3" }).waitFor({ timeout: 15_000 });
  r = await ret();
  ok("J-53 W4: Edit after Send makes version 3 in Draft; the sent version 2 keeps CAD 1,500.00 and is ended as replaced", r.status === "DRAFT" && r.currentVersion === 3 && r.versions[1].fees[0].amountMinor === 150000n && r.versions[1].endReason === "UPDATED");
  await shot("W4-version-3"); await sendNow();
  ok("J-53 W4: Send sends version 3", (await ret()).status === "SENT");

  // ---------------------------------------------------------------------------------------------- W5 the card: row 54's first step
  await p.goto(`${BASE}/front-office/prospects/${prospectId}`); await card.locator("[data-waiting]").waitFor({ timeout: 15_000 });
  ok("J-53 W5: the prospect's card says Sent, version 3, waiting for the client to sign", (await card.innerText()).includes("Version 3") && (await card.locator("[data-retainer-status]").innerText()) === "Sent");
  await shot("W5-card-waiting"); await axe("W5 the card");
  console.log("NOTE  J-53 W5: map row 54's first step is the client signing (FO-6's public signing door, not on main); the walk ends on the waiting card");
  ok("J-53: no page error during the walk", errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
