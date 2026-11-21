// J-108 (R1.108, the conflict-of-interest check before a person becomes a client; concept screens/FO-13s2-conflict, approved;
// FO-13c's API, FO-13s part 2's panel): the row's walk on an isolated copy of the running app (its own database and port;
// never :4400), in a real browser against the real routes: no fake API, no stubbed request. Part A's walk:
//   W1: before any check, the prospect page's Conflict check says the gate's refusal, the Convert dialog says it before the
//       click, and a retainer Send is refused (409 CONFLICT_CHECK_REQUIRED);
//   W2: the Owner runs a check by screens: it searches the client's own details and lists a current client with the same
//       email ("· client");
//   W3: No conflict is saved: the status is "Cleared" with who checked, and the history names them;
//   W4: the retainer Send is accepted, and Convert by screens makes the client;
//   W5: the client's email changes after a check on another prospect: the status says a new check is needed;
//   W6 (PR B): with "everyone sees all" off, a Case Manager's check finds a match they may not open (the Case Officer's
//       lead): it is counted, never named, recorded for confirmation, and Convert says it waits for a manager;
//   W7: the firm's Admin opens the link, sees the match by name and confirms No conflict;
//   W8: the Case Manager's page is Cleared, naming who confirmed, and Convert by screens makes the client. Scaffolding (P-33): no retainer screen is on main (FO-5s not
// built), so the retainer is drafted and sent through FO-5's real API as the Owner; everything else is by screens.
// Code SOR/2022-128 s. 5, 15, 16 (our product rule; the Code names no check step). Unconfirmed: no counsel.
// Run from prototype/ (US$0, no model call; HEADED=1 for a visible browser):
//   zsh studio/tools/isolated.sh j108 4438 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j108 4438 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_108.ts j108 4438
import "reflect-metadata";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { buildDocx } from "../../api/src/front-office/retainers/docx.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { platformAuditWorkspaceId } from "../../api/src/platform/audit/audit-event.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../../api/src/platform/settings.ts";

const [NAME, PORT] = [process.argv[2] ?? "j108", Number(process.argv[3] ?? 4438)];
const BASE = `http://127.0.0.1:${PORT}`, DB_URL = `postgresql://xr_studio@127.0.0.1:54329/xr_studio_${NAME}`;
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "screens", "J-108"); mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL, options: "-c TimeZone=UTC" }) });
const run = Date.now().toString(36);

async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  throw new Error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`);
}
const api = async (tok: string, method: string, path: string, body?: unknown) => {
  const form = body instanceof FormData;
  const r = await fetch(`${BASE}/api/front-office${path}`, { method, headers: { authorization: `Bearer ${tok}`, ...(body && !form ? { "content-type": "application/json" } : {}) }, body: body === undefined ? undefined : form ? body : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) as any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- answers read loosely, as in the other walks
};

await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
const firm = await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } });
const R = await db.platformStaff.findFirstOrThrow({ where: { firmId: firm.id, actorId: "user-R" } });   // Owner + Case Manager
const rTok = await signIn(R.email);
/** A person with a lead owned by the Owner, engaged into a prospect through FO-2's own route. */
async function engaged(given: string, email: string) {
  const person = await db.foPerson.create({ data: { firmId: firm.id, givenNames: `${given}${run}`, familyName: "Sample", email, createdBy: "seed:j108" } });
  const lead = await db.foLead.create({ data: { firmId: firm.id, personId: person.id, door: "MANUAL", source: "WEBSITE", ownerStaffId: R.id, createdBy: "seed:j108" } });
  const e = await api(rTok, "POST", `/leads/${lead.id}/engage`);
  return { personId: person.id, prospectId: e.body?.id as string, name: `${given}${run} Sample` };
}
const shared = `j108-${run}@example.com`;
// A current client with the client's email: engaged, checked and converted through the API (setup, not the walk).
const client = await engaged("Current", shared);
await api(rTok, "POST", "/conflict-checks", { prospectId: client.prospectId, requestId: crypto.randomUUID(), result: "NO_CONFLICT" });
const conv0 = await api(rTok, "POST", `/prospects/${client.prospectId}/convert`, {});
const ana = await engaged("Ana", shared);
const tplForm = new FormData(); tplForm.append("name", `J-108 retainer ${run}`);
tplForm.append("file", new Blob([buildDocx(["Client {client.name}", "{#fees}", "{label}: {amount}", "{/fees}"])]), "j108.docx");
const tpl = await api(rTok, "POST", "/retainer-templates", tplForm);
const draft = await api(rTok, "POST", `/prospects/${ana.prospectId}/retainers`, { templateId: tpl.body?.id, fees: [{ label: "Fee (Sample)", amountMinor: 100000, when: "ON_SIGNING" }] });
ok("J-108 setup: a current client with the same email (converted), the prospect, and a draft retainer", conv0.status === 200 && !!ana.prospectId && draft.status === 201, [conv0.status, draft.status]);

const browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), r = await ctx.newPage();
  await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, rTok);
  r.on("pageerror", (e) => errors.push(String(e)));
  const shot = (n: string) => r.screenshot({ path: join(SHOTS, `${n}.png`), fullPage: true });
  const panel = r.locator("[data-conflict-panel]"), status = panel.locator("[data-conflict-status]"), drawer = r.getByRole("dialog", { name: "Run a conflict check" });
  const conv = r.getByRole("dialog", { name: /Convert .* to a client\?/ });

  // ----------------------------------------------------------------------------------------------------------- W1
  await r.goto(`${BASE}/front-office/prospects/${ana.prospectId}`); await status.waitFor({ timeout: 30_000 });
  ok("J-108 W1 fail: before any check the Conflict check says the gate's refusal (CONFLICT_CHECK_REQUIRED)", (await status.getAttribute("data-conflict-status")) === "CONFLICT_CHECK_REQUIRED");
  await r.getByRole("button", { name: "Convert to client" }).click();
  ok("J-108 W1 fail: the Convert dialog says it before the click", await conv.locator('[data-convert-conflict="CONFLICT_CHECK_REQUIRED"]').isVisible());
  await r.keyboard.press("Escape");
  const send0 = await api(rTok, "POST", `/retainers/${draft.body?.id}/send`, { expectedVersion: 1 });
  ok("J-108 W1 fail (API step: no retainer screen on main): the retainer Send is refused, 409 CONFLICT_CHECK_REQUIRED", send0.status === 409 && send0.body?.code === "CONFLICT_CHECK_REQUIRED", send0);
  await shot("w1-no-check-1440");

  // ----------------------------------------------------------------------------------------------------------- W2
  await panel.getByRole("button", { name: "Run a check" }).click(); await drawer.locator("[data-searched]").waitFor({ timeout: 15_000 });
  ok("J-108 W2 pass: the check searches the client's own details and lists the current client with the same email",
    (await drawer.locator("[data-searched]").innerText()).includes(shared) && (await drawer.getByText(`${client.name} · client`).count()) === 1, await drawer.innerText());
  await shot("w2-run-check-1440");

  // ----------------------------------------------------------------------------------------------------------- W3
  await drawer.getByLabel("No conflict").check();
  await drawer.getByRole("button", { name: "Save check" }).click();
  await r.locator('[data-conflict-status="CLEARED"]').waitFor({ timeout: 15_000 });
  ok("J-108 W3 pass: the status is Cleared with who checked, and the history names them (recorded with who)",
    (await status.innerText()).includes(`Cleared: no conflict found · ${R.displayName}`) && (await panel.locator("[data-checked-by]").first().innerText()) === R.displayName
    && (await db.foConflictCheck.count({ where: { prospectId: ana.prospectId, checkedBy: R.id, result: "NO_CONFLICT" } })) === 1);
  await shot("w3-cleared-1440");

  // ----------------------------------------------------------------------------------------------------------- W4
  const send1 = await api(rTok, "POST", `/retainers/${draft.body?.id}/send`, { expectedVersion: 1 });
  ok("J-108 W4 pass (API step): after the check the retainer Send is accepted", send1.status === 200 && send1.body?.status === "SENT", send1);
  await r.getByRole("button", { name: "Convert to client" }).click();
  await conv.getByRole("button", { name: "Yes, convert to client" }).click();
  await r.locator("[data-stage-now]", { hasText: "Won" }).waitFor({ timeout: 15_000 });
  ok("J-108 W4 pass (R1.108): Convert by screens makes the client", (await db.foProspect.findUniqueOrThrow({ where: { id: ana.prospectId }, include: { stage: true } })).stage.kind === "WON");

  // ----------------------------------------------------------------------------------------------------------- W5
  const bob = await engaged("Bob", `j108-bob-${run}@example.com`);
  await r.goto(`${BASE}/front-office/prospects/${bob.prospectId}`); await status.waitFor({ timeout: 30_000 });
  await panel.getByRole("button", { name: "Run a check" }).click(); await drawer.locator("[data-searched]").waitFor({ timeout: 15_000 });
  await drawer.getByLabel("No conflict").check(); await drawer.getByRole("button", { name: "Save check" }).click();
  await r.locator('[data-conflict-status="CLEARED"]').waitFor({ timeout: 15_000 });
  await db.foPerson.update({ where: { id: bob.personId }, data: { email: `j108-bob-new-${run}@example.com` } });
  await r.reload(); await status.waitFor({ timeout: 30_000 });
  ok("J-108 W5 fail: the client's email changed after the check: the status says a new check is needed (CONFLICT_CHECK_STALE)",
    (await status.getAttribute("data-conflict-status")) === "CONFLICT_CHECK_STALE" && /new check/.test(await status.innerText()));
  await shot("w5-stale-1440");

  // ---------------------------------------------------------------------------------------------- W6-W8 (PR B)
  const T = await db.platformStaff.findFirstOrThrow({ where: { firmId: firm.id, actorId: "user-T" } }), O = await db.platformStaff.findFirstOrThrow({ where: { firmId: firm.id, actorId: "user-O" } });
  const AD = await db.platformStaff.create({ data: { firmId: firm.id, email: `j108-admin-${run}@sample-firm.example.com`, displayName: `Sample admin ${run}`, actorId: `j108-admin-${run}`, status: "ACTIVE" } });
  await db.platformRoleGrant.create({ data: { firmId: firm.id, staffId: AD.id, role: "ADMIN", grantedBy: "seed:j108" } });
  await writeSetting(db, { firmId: firm.id, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:j108", workspaceId: await platformAuditWorkspaceId(db), reason: "J-108 W6" });
  const tTok = await signIn(T.email), adTok = await signIn(AD.email), deeEmail = `j108-dee-${run}@example.com`;
  const hiddenP = await db.foPerson.create({ data: { firmId: firm.id, givenNames: `Hidden${run}`, familyName: "Sample", email: deeEmail, createdBy: "seed:j108" } });
  await db.foLead.create({ data: { firmId: firm.id, personId: hiddenP.id, door: "MANUAL", source: "WEBSITE", ownerStaffId: O.id, createdBy: "seed:j108" } });
  const deeP = await db.foPerson.create({ data: { firmId: firm.id, givenNames: `Dee${run}`, familyName: "Sample", email: deeEmail, createdBy: "seed:j108" } });
  const deeLead = await db.foLead.create({ data: { firmId: firm.id, personId: deeP.id, door: "MANUAL", source: "WEBSITE", ownerStaffId: T.id, createdBy: "seed:j108" } });
  const dee = (await api(tTok, "POST", `/leads/${deeLead.id}/engage`)).body?.id as string;
  const tctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), t = await tctx.newPage();
  await tctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tTok);
  t.on("pageerror", (e) => errors.push(String(e)));
  const tPanel = t.locator("[data-conflict-panel]"), tDrawer = t.getByRole("dialog", { name: "Run a conflict check" });
  await t.goto(`${BASE}/front-office/prospects/${dee}`); await tPanel.locator("[data-conflict-status]").waitFor({ timeout: 30_000 });
  await tPanel.getByRole("button", { name: "Run a check" }).click(); await tDrawer.locator("[data-searched]").waitFor({ timeout: 15_000 });
  ok("J-108 W6 pass: the Case Officer's lead is counted with the server's line, never named; the result waits for a manager",
    await tDrawer.locator("[data-hidden-line]").isVisible() && !(await tDrawer.innerText()).includes(`Hidden${run}`) && await tDrawer.getByRole("button", { name: "Record for confirmation" }).isVisible());
  await t.screenshot({ path: join(SHOTS, "w6-hidden-1440.png"), fullPage: true });
  await tDrawer.getByRole("button", { name: "Record for confirmation" }).click();
  await t.locator('[data-conflict-status="CONFLICT_CHECK_UNCONFIRMED"]').waitFor({ timeout: 15_000 });
  await t.getByRole("button", { name: "Convert to client" }).click();
  ok("J-108 W6 fail: Convert says the check waits for a manager's confirmation", await t.getByRole("dialog", { name: /Convert .* to a client\?/ }).locator('[data-convert-conflict="CONFLICT_CHECK_UNCONFIRMED"]').isVisible());
  await t.keyboard.press("Escape");
  const link = await tPanel.locator("[data-waiting-link] a").getAttribute("href");
  const actx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), ad = await actx.newPage();
  await actx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), adTok);
  ad.on("pageerror", (e) => errors.push(String(e)));
  await ad.goto(`${BASE}${link}`); await ad.locator("[data-confirm-check]").waitFor({ timeout: 30_000 });
  ok("J-108 W7 pass: the Admin opens the link, sees who checked and the match by name", (await ad.locator("[data-checked-by]").innerText()).includes(T.displayName) && (await ad.getByText(`Hidden${run} Sample`).count()) >= 1);
  await ad.getByLabel("No conflict").check(); await ad.locator("[data-confirm-check]").click(); await ad.locator("[data-confirmed]").waitFor({ timeout: 15_000 });
  await ad.screenshot({ path: join(SHOTS, "w7-confirmed-1440.png"), fullPage: true });
  await t.reload(); await t.locator('[data-conflict-status="CLEARED"]').waitFor({ timeout: 30_000 });
  ok("J-108 W8 pass: the Case Manager's page is Cleared, naming who confirmed", (await tPanel.locator("[data-counts]").first().innerText()).includes(`confirmed by ${AD.displayName}`));
  await t.getByRole("button", { name: "Convert to client" }).click();
  await t.getByRole("dialog", { name: /Convert .* to a client\?/ }).getByRole("button", { name: "Yes, convert to client" }).click();
  await t.locator("[data-stage-now]", { hasText: "Won" }).waitFor({ timeout: 15_000 });
  ok("J-108 W8 pass (R1.108): after the manager's confirmation, Convert by screens makes the client", (await db.foProspect.findUniqueOrThrow({ where: { id: dee }, include: { stage: true } })).stage.kind === "WON");
  await writeSetting(db, { firmId: firm.id, key: EVERYONE_SEES_ALL.key, value: true, by: "seed:j108", workspaceId: await platformAuditWorkspaceId(db), reason: "J-108 done" });
  ok("J-108: no page error in any browser step", errors.length === 0, errors);
} finally {
  await browser.close(); await db.$disconnect();
}
console.log(`\nJ-108: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
