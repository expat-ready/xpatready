// J-72 (map row 72, R1.72: a won prospect becomes one case with its applicants, representative and pinned release; brief
// design/build-lead-c-briefs/CS-K1-2.md, section "Answers to the FO-8 lane's resume note", ruling 1; P-606, P-719, P-728):
// the join-and-walk row, merged with CS-K1 part 2. It walks the merged parts (FO-4 part 2a's Pipeline and prospect screens,
// FO-2w's one win helper, FO-5's Signed offline, FO-8's client and "Open a case?", CS-K1 part 2's poll and links) on an
// isolated copy (its own database and port, never :4400), on screen and through the API, as a firm's staff member would.
//   W1 Convert on the prospect's screen, reached from its Pipeline card, by keyboard (FO-4 part 2a);
//   W2 the client appears with no hand-run command: the app's poll (case-clients/live.ts) takes the won prospect in; the
//      walk reads the client list with a bounded wait (at most three poll intervals), never a fixed sleep;
//   W3 the client on screen (CS-K1s): the Clients menu entry, a search by name, the client's page and its "Open a case?"
//      card (program, principal applicant, representative of record), by keyboard; "Open the case" opens one case and
//      lands on it;
//   W4 the case page on screen shows the client, the principal applicant, the representative of record and the pinned
//      release;
//   W5-W8 the same for a Signed offline win (W7 on screen as W3): the paper copy recorded through FO-5's own route (no retainer screen on main),
//      on a Sample retainer whose sent version names its representative by id; W8 also asserts the case's representative
//      is the one in that version's merge value `representative.staff_id` (FO-8's first real run of that branch).
//   DW lines, each a pass and its stand-in that must fail:
//      DW-a a second delivery (and a catch-up run) makes no second client; stand-in: a forged delivery naming firm B
//           makes nothing (refused);
//      DW-b firm B's staff get 404 on firm A's client (read and open-case); stand-in: firm A's own read is 200;
//      DW-c a second open-case answers 409 OFFER_USED and opens no second case; stand-in: the first answered 201;
//      DW-d a Signed offline win after a Convert of the same prospect raises nothing new (FO-2w: once per prospect);
//           stand-in: a fresh prospect's Convert raises exactly one.
//   Keyboard only on the screens walked; axe clean; 1024 and 1440 px with no sideways scroll. Sample rows only; US$0, no
//   model call; live AI off. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j72 4472 start --ttl 30 PLATFORM_IDENTITY=local PROSPECT_WON_POLL_MS=500 && trap 'zsh studio/tools/isolated.sh j72 4472 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_72.ts j72 4472
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { foPersonPort } from "../../api/src/front-office/people/fo-person-port.ts";
import { auditEvent } from "../../api/src/platform/audit/audit-event.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { catchUpProspectsWon, onProspectWon } from "../../api/src/case-clients/prospect-won.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j72", Number(process.argv[3] ?? 4472)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "CS-K1", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const POLL = Number(process.env.PROSPECT_WON_POLL_MS) || 500;   // the copy is started with the same value (the run line above)
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string | null, method: string, path: string, body?: unknown, actor?: string): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}), ...(actor ? { "x-actor": actor } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
const vv = () => sql(`select c.id from combination c where c.combination_key = 'vv.single' and exists (select 1 from config_release r where r.combination_id = c.id)`);
if (!vv()) await api(null, "POST", "/demo/load", { sample: "configured" }, "user-A");
const VV = vv();
// CS-K1s: a service of firm A on the released combination, so each lead is "interested in" it and the offer names the program.
const SERVICE = sql(`select id from fo_service where firm_id = (select id from platform_firm where key = 'sample-firm') and combination_id = '${VV}'`)
  || sql(`insert into fo_service (firm_id, label, combination_id, sort_order, created_by) select id, 'Sample service', '${VV}', 900, 'seed:J-72' from platform_firm where key = 'sample-firm' returning id`);
ok("J-72 setup: both Sample firms, their front office, a released Visitor visa and a service on it are on the copy", !!A && !!B && fo.failed.length === 0 && !!VV && !!SERVICE, fo.failed);
const staff = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
const R = staff("user-R"), S = staff("user-S");
async function signIn(firmKey: string, email: string): Promise<string> {
  const r = await api(null, "POST", "/platform/session/local", { firmKey, email, secondStep: true });
  if (r.body?.token) return r.body.token as string;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${r.body?.detail}`); process.exit(2);
}
const TA = await signIn("sample-firm", R.email), TB = await signIn("sample-solo", S.email);
let n = 0;
/** A Sample lead of firm A, engaged into a prospect through the API (as J-30 makes them). */
const prospect = async (given: string) => {
  const p = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', '${given}${run}', 'Sample', 'j72.${++n}.${run}@example.org', 'seed:J-72', now()) returning id`);
  const lead = sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, interested_in_service_id, created_by, updated_at) values (gen_random_uuid(), '${A}', '${p}', 'MANUAL', 'Phone call', '${R.id}', '${SERVICE}', 'seed:J-72', now()) returning id`);
  const e = await api(TA, "POST", `/front-office/leads/${lead}/engage`);
  // FO-13c: no client without a recorded conflict check; recorded through its API (the Conflict check panel is FO-13s).
  const c = await api(TA, "POST", "/front-office/conflict-checks", { prospectId: e.body?.id, requestId: crypto.randomUUID(), result: "NO_CONFLICT" });
  if (c.status !== 201) throw new Error(`J-72: the conflict check was not recorded (${c.status})`);
  return { id: e.body?.id as string, number: e.body?.number as string, personId: p, name: `${given}${run} Sample` };
};
const won = (prospectId: string) => sql(`select count(*) from module_event where type = 'prospect.won' and subject_id = '${prospectId}'`);
const clientsOf = (prospectId: string) => sql(`select count(*) from case_client where prospect_id = '${prospectId}'`);
/** W2/W6: the client appears by itself; the list is read until it does, at most three poll intervals (and a margin for the copy's start). */
const appears = async (name: string) => {
  const until = Date.now() + 3 * POLL;   // ruling 2: at most three intervals
  for (;;) {
    const r = await api(TA, "GET", `/runtime/clients?query=${encodeURIComponent(name)}`);
    const c = (r.body?.clients ?? []).find((x: { display_name: string }) => x.display_name === name);
    if (c || Date.now() > until) return c as { id: string; number: string; display_kind: string } | undefined;
    await new Promise((res) => setTimeout(res, 100));
  }
};

// ------------------------------------------------------------------------------------------------ the browser
const browser = await chromium.launch({ headless: process.env.HEADED !== "1", slowMo: process.env.HEADED === "1" ? 250 : 0, ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const bctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
await bctx.addInitScript((x) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })); localStorage.setItem("xr-actor", "user-O"); }, TA);
const page = await bctx.newPage(); const errs: string[] = []; page.on("pageerror", (e) => errs.push(e.message));
const shot = (name: string) => page.screenshot({ path: join(SHOTS, `j72-${name}.png`), fullPage: true });
const axe = async (what: string) => { const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations; ok(`J-72 axe: ${what}: no WCAG 2.2 A/AA violation`, v.length === 0, v.map((x) => `${x.id}: ${x.nodes[0]?.target}`)); };
const sizes = async (what: string) => {
  const fits: boolean[] = [];
  for (const width of [1024, 1440]) { await page.setViewportSize({ width, height: 900 }); fits.push(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); }
  ok(`J-72 ${what}: no sideways page scroll at 1024 and 1440 px`, fits.every(Boolean), fits);
};
/** Tab to a control and press Enter (keyboard only: no click). */
const press = async (p: Page, target: ReturnType<Page["getByRole"]>, max = 120) => {
  for (let i = 0; i < max; i++) { if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return p.keyboard.press("Enter"); await p.keyboard.press("Tab"); }
  throw new Error("not reached by Tab");
};
/** W3/W7 (CS-K1s): the client opened on screen, by keyboard from the case area's Clients entry: a search by name, the
 *  client's page with its "Open a case?" card, one press of "Open the case"; the walk lands on the new case. */
const openOnScreen = async (c: { id: string; number: string }, who: string, rep: string | null, tag: string) => {
  await page.goto(`${BASE}/cases`); await page.locator('[data-nav="clients"]').waitFor({ timeout: 60_000 });
  await press(page, page.getByRole("link", { name: "Clients", exact: true }));
  const search = page.getByRole("searchbox", { name: "Search clients" }); await search.waitFor();
  await search.fill(who); await page.locator(`[data-client-row="${c.number}"]`).waitFor({ timeout: 30_000 });
  await press(page, page.getByRole("link", { name: who, exact: true }));
  const card = page.locator("[data-offer-card]"); await card.waitFor({ timeout: 30_000 });
  const values = [await page.locator("[data-offer-program]").innerText(), await page.locator("[data-offer-principal]").innerText(), await page.locator("[data-offer-representative]").innerText()];
  await shot(`${tag}-card`); await axe(`${tag} the client page and its card`); await sizes(`${tag} the client page`); await page.setViewportSize({ width: 1440, height: 900 });
  const before = Number(sql(`select count(*) from runtime_case where client_id = '${c.id}'`));
  await press(page, page.getByRole("button", { name: "Open the case" }));
  await page.waitForURL(/\/cases\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const caseId = new URL(page.url()).pathname.split("/").pop()!;
  const label = sql(`select label from combination where id = '${VV}'`);
  ok(`J-72 ${tag} pass (screen step, CS-K1s): the client's page shows "Open a case?" with the program, ${who} as principal applicant and the representative${rep ? ` (${rep})` : ""}; one press of "Open the case" opens one case for the client, with case.opened, and lands on it`,
    values[0] === label && values[1] === who && (!rep || values[2] === rep) && before === 0 && sql(`select count(*) from runtime_case where client_id = '${c.id}'`) === "1"
    && sql(`select client_id from runtime_case where id = '${caseId}'`) === c.id && sql(`select count(*) from module_event where type = 'case.opened' and subject_id = '${caseId}'`) === "1", [values, before, caseId]);
  return caseId;
};
/** W4/W8: the case page shows the client, the principal applicant, the representative of record and the pinned release. */
const casePage = async (caseId: string, who: string, tag: string) => {
  const repActor = sql(`select user_id from case_team_member where case_id = '${caseId}' and role = 'LEAD_REPRESENTATIVE' and ended_at is null`);
  const release = sql(`select coalesce(v.version, r.version) from pack_work_pin p join config_release r on r.id = p.config_release_id left join pack_version v on v.id = r.pack_version_id where p.case_id = '${caseId}'`);   // releaseLabel
  const users = (await api(null, "GET", "/runtime/firm", undefined, "user-O")).body?.users ?? [];
  const repName = users.find((u: { id: string }) => u.id === repActor)?.name as string;
  await page.goto(`${BASE}/cases/${caseId}`); await page.getByText(`Client: ${who}`).first().waitFor({ timeout: 60_000 });
  await page.getByRole("table").getByText("Principal applicant").first().waitFor({ timeout: 30_000 });
  const text = await page.locator("main").innerText();
  ok(`J-72 ${tag} pass: the case page shows the client, ${who} as principal applicant, the representative of record (${repName}) and the pinned release (Release ${release})`,
    text.includes(`Client: ${who}`) && new RegExp(`${who}\\s+Principal applicant`).test(text) && !!repName && text.includes(repName) && text.includes(`Release ${release}`),
    [repActor, repName, release, text.slice(text.indexOf("People and filings"), text.indexOf("People and filings") + 300)]);
  await shot(`${tag}-case`); await axe(`${tag} the case page`); await sizes(`${tag} the case page`);
  return repActor;
};

try {
  // ------------------------------------------------------------------------------------------- W1-W4: a Convert win
  const ana = await prospect("Ana");
  await page.goto(`${BASE}/front-office/pipeline`);
  const cardLink = page.locator(`[data-card="${ana.number}"]`).getByRole("link");
  await cardLink.waitFor(); await axe("W1 the Pipeline board"); await sizes("W1 the Pipeline board"); await page.setViewportSize({ width: 1440, height: 900 });
  await press(page, cardLink as never);
  await page.getByRole("button", { name: "Convert to client" }).waitFor(); await axe("W1 the prospect's screen"); await sizes("W1 the prospect's screen"); await page.setViewportSize({ width: 1440, height: 900 });
  await press(page, page.getByRole("button", { name: "Convert to client" }));
  await press(page, page.getByRole("button", { name: "Yes, convert to client" }));
  await page.getByRole("button", { name: "Undo convert" }).waitFor(); await shot("w1-converted");
  ok("J-72 W1 pass: Convert to client, by keyboard from the prospect's Pipeline card, wins it (Won by Convert) and raises one prospect.won", sql(`select won_via from fo_prospect where id = '${ana.id}'`) === "CONVERTED" && won(ana.id) === "1");
  const t0 = Date.now(), anaClient = await appears(ana.name);
  ok(`J-72 W2 pass: the client appears with no hand-run command, taken in by the app's poll (${Date.now() - t0} ms; poll ${POLL} ms), a PERSON linked to the prospect's own fo_person`,
    !!anaClient && anaClient.display_kind === "PERSON" && sql(`select fo_person_id from case_client where id = '${anaClient.id}'`) === ana.personId, anaClient);
  const open = (id: string, t: string, body: Record<string, unknown> = {}) => api(t, "POST", `/runtime/clients/${id}/open-case`, { combinationId: VV, clientActor: "user-P", caseOfficers: ["user-O"], ...body });
  const anaCaseId = await openOnScreen(anaClient!, ana.name, null, "W3");
  await casePage(anaCaseId, ana.name, "W4");

  // ------------------------------------------------------------------------------------ W5-W8: a Signed offline win
  // Review M2: the signed version names user-T by id, while the retainer row and the firm's default name user-R: only a
  // read of the version's merge value gives user-T.
  const ben = await prospect("Ben"), rep = R, T = staff("user-T");
  const [RET, VER, TPL] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()], hex = "ab".repeat(32);
  sql(`insert into fo_retainer_template (id, firm_id, name, kind, file_key, file_sha256, placeholders, created_by, updated_by, updated_at) values ('${TPL}', '${A}', 'Retainer (Sample J-72 ${run})', 'RETAINER', 'retainer-templates/${TPL}/v1.docx', '${hex}', '{client.name}', 'seed:J-72', 'seed:J-72', now())`);
  sql(`insert into fo_retainer (id, firm_id, kind, prospect_id, subject, signer_person_id, representative_staff_id, template_id, template_version, template_file_key, created_by, updated_at) values ('${RET}', '${A}', 'RETAINER', '${ben.id}', 'PERSON', '${ben.personId}', '${rep.id}', '${TPL}', 1, 'retainer-templates/${TPL}/v1.docx', 'staff:${rep.id}', now()); insert into fo_retainer_version (id, firm_id, retainer_id, n, merge_values, file_key, original_sha256, created_by) values ('${VER}', '${A}', '${RET}', 1, '{"client.name":"Sample","representative.staff_id":"${T.id}","signer.person_id":"${ben.personId}"}', 'retainers/${RET}/v1.docx', '${hex}', 'staff:${rep.id}')`);
  sql(`update fo_retainer_version set sent_at = now() where id = '${VER}'; update fo_retainer set status = 'SENT' where id = '${RET}'`);
  const signOffline = (retainerId: string) => { const f = new FormData(); f.set("reason", "Signed at the office (Sample)"); f.set("expectedVersion", "1"); f.set("file", new Blob(["%PDF-1.4\n%%EOF\n"], { type: "application/pdf" }), "signed.pdf");
    return fetch(`${BASE}/api/front-office/retainers/${retainerId}/signed-offline`, { method: "POST", headers: { authorization: `Bearer ${TA}` }, body: f }).then((r) => r.status); };
  const off = await signOffline(RET);
  ok("J-72 W5 pass (API step: no retainer screen on main): Signed offline (FO-5's route, the staff session; no retainer screen on main) wins the prospect and raises one prospect.won naming the retainer (FO-2w)", off === 200 && sql(`select won_via from fo_prospect where id = '${ben.id}'`) === "SIGNED_OFFLINE"
    && sql(`select count(*) from module_event where type = 'prospect.won' and subject_id = '${ben.id}' and payload->>'retainer_id' = '${RET}' and payload->>'won_via' = 'SIGNED_OFFLINE'`) === "1", off);
  const benClient = await appears(ben.name);
  ok("J-72 W6 pass: its client appears by itself too, linked to the prospect's fo_person", !!benClient && sql(`select fo_person_id from case_client where id = '${benClient.id}'`) === ben.personId, benClient);
  // The screen sends no representative: the offer's comes from the signed version (the card names it).
  const benCaseId = await openOnScreen(benClient!, ben.name, sql(`select display_name from platform_staff where id = '${T.id}'`), "W7");
  const benRep = await casePage(benCaseId, ben.name, "W8");
  ok("J-72 W8 pass: the case's representative of record is the one the signed version names by id (merge value representative.staff_id), FO-8's first real run of that branch",
    benRep === "user-T" && benRep === sql(`select actor_id from platform_staff where id = (select (merge_values->>'representative.staff_id')::uuid from fo_retainer_version where retainer_id = '${RET}' and end_reason = 'SIGNED_OFFLINE')`)
    && sql(`select representative_staff_id from fo_retainer where id = '${RET}'`) === R.id, benRep);

  // ------------------------------------------------------------------------------------------------ the DW lines
  const deps = { workspaceId: sql(`select workspace_id from case_client where id = '${anaClient!.id}'`), foPerson: foPersonPort, audit: auditEvent };
  const event = (prospectId: string) => ({ type: "prospect.won", firmId: A, payload: JSON.parse(rawSql(`select payload::text from module_event where type = 'prospect.won' and subject_id = '${prospectId}' order by seq desc limit 1`).trim()) });
  const again = await onProspectWon(db, event(ana.id), deps), sweep = await catchUpProspectsWon(db, deps);
  ok("J-72 DW-a pass: a second delivery and a catch-up run make no second client", again?.made === false && !sweep.results.some((r) => r.made && r.prospectId === ana.id) && clientsOf(ana.id) === "1", [again, sweep.failed]);
  const forged = await onProspectWon(db, { ...event(ana.id), firmId: B }, deps).then(() => "made", (e) => String(e));
  ok("J-72 DW-a fail (stand-in): a delivery naming firm B for firm A's prospect is refused and makes nothing", /names firm/.test(forged) && clientsOf(ana.id) === "1", forged);
  const bRead = await api(TB, "GET", `/runtime/clients/${anaClient!.id}`), bOpen = await open(anaClient!.id, TB), aRead = await api(TA, "GET", `/runtime/clients/${anaClient!.id}`);
  ok("J-72 DW-b pass: firm B's staff get 404 on firm A's client (read and open-case)", bRead.status === 404 && bOpen.status === 404, [bRead.status, bOpen.status]);
  ok("J-72 DW-b fail (stand-in): firm A's own read of it is 200, with its one case", aRead.status === 200 && aRead.body?.cases?.length === 1, aRead.status);
  const second = await open(anaClient!.id, TA);
  ok("J-72 DW-c pass: a second open-case answers 409 OFFER_USED and opens no second case", second.status === 409 && second.body?.code === "OFFER_USED" && sql(`select count(*) from runtime_case where client_id = '${anaClient!.id}'`) === "1", [second.status, second.body?.code]);
  ok("J-72 DW-c fail (stand-in): the first opening (W3, on screen) made exactly that one case", sql(`select client_id from runtime_case where id = '${anaCaseId}'`) === anaClient!.id);
  const ret2 = crypto.randomUUID(), ver2 = crypto.randomUUID();
  sql(`insert into fo_retainer (id, firm_id, kind, prospect_id, subject, signer_person_id, representative_staff_id, template_id, template_version, template_file_key, created_by, updated_at) values ('${ret2}', '${A}', 'RETAINER', '${ana.id}', 'PERSON', '${ana.personId}', '${rep.id}', '${TPL}', 1, 'retainer-templates/${TPL}/v1.docx', 'staff:${rep.id}', now()); insert into fo_retainer_version (id, firm_id, retainer_id, n, merge_values, file_key, original_sha256, created_by) values ('${ver2}', '${A}', '${ret2}', 1, '{"client.name":"Sample","representative.staff_id":"${rep.id}"}', 'retainers/${ret2}/v1.docx', '${hex}', 'staff:${rep.id}')`);
  sql(`update fo_retainer_version set sent_at = now() where id = '${ver2}'; update fo_retainer set status = 'SENT' where id = '${ret2}'`);
  const offAfter = await signOffline(ret2);
  ok("J-72 DW-d pass: a Signed offline win after a Convert of the same prospect raises nothing new (one prospect.won, one client, one case)", offAfter === 200 && won(ana.id) === "1" && clientsOf(ana.id) === "1" && sql(`select count(*) from runtime_case where client_id = '${anaClient!.id}'`) === "1", [offAfter, won(ana.id)]);
  const cyd = await prospect("Cyd"), w0 = won(cyd.id); await api(TA, "POST", `/front-office/prospects/${cyd.id}/convert`, {});
  ok("J-72 DW-d fail (stand-in): a fresh prospect's Convert raises exactly one", w0 === "0" && won(cyd.id) === "1", [w0, won(cyd.id)]);
  ok("J-72: no error on any page walked", errs.length === 0, errs);
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
