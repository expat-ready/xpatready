// J-55 (map row 55, R1.55: "Withdraw, re-issue, decline, signed offline"), written by the qa lane (22 Nov, Track B's qa
// lane, A286) BEFORE its last parts merge, so qa only has to run it when they do. It walks the firm's Owner (a licensed
// representative) on an isolated copy of the running app (its own database and port, never :4400), by screens where
// they exist and on the routes and the database underneath. It starts where J-53 ends (j_53.ts W5: a retainer Sent and
// waiting for the client).
// Done when (CAPABILITIES R1.55), word for word as the steps:
//   W1 "Withdraw stops the link": Withdraw is offered on the retainer page (FO-5s' Withdraw panel); a withdraw needs a
//      reason; the client's signing link stops (FO-6: Send makes a signing request with a link; Withdraw cancels it).
//   W2 "re-issue makes a new version": after a withdraw the prospect takes a new retainer (Prepare, on screen); from
//      Declined (and Expired) Edit and resend makes version n+1 in Draft, which is sent again.
//   W3 "a decline kept with its reason": the client declines on the signing page with a reason (FO-6's public door);
//      the retainer reads Declined and the reason is kept (a reason column) and shown on the retainer page.
//   W4 "Signed offline needs the uploaded file and moves the prospect as a signature does": Signed offline is offered on
//      the retainer page (FO-5s' panel); with no file, or a file that is not a PDF, it is refused on its field; with the
//      PDF and a reason it is filed "Signed on paper", final, and the prospect is Won once, with prospect.won's audit
//      line, as FO-6's signature does (signing.completed); a second record is refused.
//   W5 roles: no session is 401 on withdraw and on signed offline.
//   W6: the walk ends at R1.56's first step: the won client can be invoiced (FO-7b's draft for that person is accepted).
// Fails on main today only where a part is not merged (P-606); each failing step names its part: FO-6 (the signing
// request, link, decline door and reason), FO-5s' later part (the Withdraw and Signed offline panels). The decline in W2
// is a stand-in written by SQL (said, not hidden), because no route on main makes a retainer Declined.
// Sample values only; US$0, no model call, no live mail. Screenshots: product/screens/J-55/screenshots/. Run from prototype/:
//   zsh studio/tools/isolated.sh j55 4455 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j55 4455 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_55.ts j55 4455
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

const [NAME, PORT] = [process.argv[2] ?? "j55", Number(process.argv[3] ?? 4455)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-55", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other journeys
const j = async (method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; body: any }> => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
const multipart = async (path: string, fields: Record<string, string>, file: { name: string; type: string; bytes: Buffer } | null, token?: string): Promise<{ status: number; body: any }> => {
  const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v);
  if (file) f.append("file", new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body: f });
  const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
};
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% Sample signed retainer (J-55), not a real signature\ntrailer << /Root 1 0 R >>\n%%EOF\n", "latin1");
const hasColumn = (tables: string[], like: string) => sql(`select count(*) from information_schema.columns where table_name in (${tables.map((t) => `'${t}'`).join(", ")}) and column_name like '${like}'`) !== "0";

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const firmId = sql(`select id from platform_firm where key = 'sample-firm'`);
ok("J-55 setup: the Sample firm and its front office are seeded", !!firmId && fo.failed.length === 0, fo.failed);
const [ownerId, ownerEmail] = sql(`select id || '|' || email from platform_staff where actor_id = 'user-R'`).split("|");   // Owner + Case Manager, licensed
// Two engaged prospects (Sample), as j_53's setup: A is withdrawn then re-prepared; B is declined then signed on paper.
const prospect = (tag: string) => {
  const given = `Client${tag}${run}`, email = `j55.${tag.toLowerCase()}.${run}@example.com`;
  const pid = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firmId}', '${given}', 'Sample', '${email}', 'test', now()) returning id`);
  sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, state, engaged_at, engaged_by, created_by, updated_at) values (gen_random_uuid(), '${firmId}', '${pid}', 'MANUAL', 'WEBSITE', '${ownerId}', 'ENGAGED', now(), 'test', 'test', now())`);
  const id = sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    select gen_random_uuid(), '${firmId}', l.id, 'INDIVIDUAL', (select id from fo_stage where firm_id = '${firmId}' and pipeline = 'INDIVIDUAL' and key = 'ENGAGED'), '${pid}', '${pid}', '${ownerId}', 'test', now() from fo_lead l where l.person_id = '${pid}' returning id`);
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${id}'`);
  return { id, pid, name: `${given} Sample` };
};
const A = prospect("A"), B = prospect("B");
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
const axe = async (name: string) => { const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze(); ok(`J-55 ${name}: axe finds no serious or critical WCAG A/AA finding`, !r.violations.some((v) => v.impact === "serious" || v.impact === "critical"), r.violations.map((v) => `${v.id}: ${v.nodes.length}`)); };
const card = p.locator("[data-retainer-card]"), status = p.locator("[data-retainer-status]");
const retOf = (prospectId: string) => db.foRetainer.findMany({ where: { firmId, prospectId }, orderBy: { createdAt: "asc" }, include: { versions: { orderBy: { n: "asc" } } } });
const sendNow = async () => { await p.locator("[data-check-and-send]").click(); const s = p.getByRole("dialog", { name: /^Send to .* to sign$/ }); await s.waitFor(); await s.getByRole("button", { name: /^Send to / }).click(); await status.filter({ hasText: "Sent" }).waitFor({ timeout: 15_000 }); };
const signingRequests = (retainerId: string) => sql(`select count(*) || '|' || coalesce(string_agg(status::text || ':' || coalesce(cancel_reason::text, '-'), ',' order by sent_at), '') from fo_signature_request where firm_id = '${firmId}' and document_id = '${retainerId}'`);
/** Prepare from the prospect's card (screens), save the fee as version 2, Check and send (J-53 W2-W3's path). */
const prepareAndSend = async (pr: { id: string }, fee: string) => {
  await p.goto(`${BASE}/front-office/prospects/${pr.id}`);
  await card.getByRole("button", { name: "Prepare retainer" }).waitFor({ timeout: 30_000 });
  await card.getByRole("button", { name: "Prepare retainer" }).click();
  const prep = p.getByRole("dialog", { name: "Prepare retainer" });
  await prep.getByLabel("Template").locator("option", { hasText: `Standard retainer ${run}` }).waitFor({ state: "attached", timeout: 10_000 });
  await prep.getByRole("button", { name: "Prepare retainer" }).click();
  await p.waitForURL(/\/front-office\/retainers\//, { timeout: 15_000 }); await status.waitFor({ timeout: 15_000 });
  await p.getByLabel("Fee 1: amount").fill(fee);
  await p.getByRole("button", { name: /^Save as version \d+$/ }).click();
  await p.locator("[data-version]", { hasText: "Version 2" }).waitFor({ timeout: 15_000 });
  await sendNow();
};
const conflictCheck = async (pr: { id: string }) => {
  await p.goto(`${BASE}/front-office/prospects/${pr.id}`);
  const panel = p.locator("[data-conflict-panel]"); await panel.getByRole("button", { name: "Run a check" }).click({ timeout: 30_000 });
  const check = p.getByRole("dialog", { name: "Run a conflict check" }); await check.locator("[data-searched]").waitFor({ timeout: 15_000 });
  await check.getByLabel("No conflict").check(); await check.getByRole("button", { name: "Save check" }).click(); await check.waitFor({ state: "detached", timeout: 15_000 });
};

try {
  // ---------------------------------------------------------------------------------------------- set-up by screens: the template, the conflict checks, a sent retainer (J-53's walk)
  await p.goto(`${BASE}/front-office/settings/retainer-templates`);
  await p.getByRole("heading", { name: "Retainer templates" }).waitFor({ timeout: 30_000 });
  const dlS = p.waitForEvent("download"); await p.getByRole("button", { name: "Download a starter template" }).click();
  const starterFile = await (await dlS).path();
  await p.getByRole("button", { name: "Upload template" }).click();
  const up = p.getByRole("dialog", { name: "Upload template" });
  await up.getByLabel("Name").fill(`Standard retainer ${run}`); await up.getByLabel("Template file (.docx)").setInputFiles(starterFile);
  await up.getByRole("button", { name: "Upload template" }).click(); await up.waitFor({ state: "detached", timeout: 15_000 });
  await conflictCheck(A); await conflictCheck(B);
  await prepareAndSend(A, "1500");
  let [ra] = await retOf(A.id);
  ok("J-55 setup: client A's retainer is Sent (version 2, by screens, as J-53 ends)", ra?.status === "SENT" && ra.currentVersion === 2, ra?.status);
  await shot("W0-sent");

  // ---------------------------------------------------------------------------------------------- W1 Withdraw stops the link
  const sentReq = signingRequests(ra.id);
  ok("J-55 W1 (parts missing: FO-6, the signing request): Send made one live signing request with the client's link for version 2", /^1\|SENT:-$/.test(sentReq), sentReq);
  const offered = await p.getByRole("button", { name: /^Withdraw/ }).count();
  ok("J-55 W1 (parts missing: FO-5s' Withdraw panel): the retainer page offers Withdraw on a sent retainer", offered === 1, `${offered} Withdraw buttons; the page says: ${(await p.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 200)}`);
  const noReason = await j("POST", `/api/front-office/retainers/${ra.id}/withdraw`, { expectedVersion: 2, expectedStatus: "SENT", reason: "   " }, tok);
  ok("J-55 W1 fail: a withdraw with a blank reason is refused on the reason field (422); the retainer stays Sent", noReason.status === 422 && JSON.stringify(noReason.body).includes("reason") && (await retOf(A.id))[0].status === "SENT", noReason);
  const stale = await j("POST", `/api/front-office/retainers/${ra.id}/withdraw`, { expectedVersion: 1, expectedStatus: "SENT", reason: "Client changed plans" }, tok);
  ok("J-55 W1 fail: a withdraw of a version the page no longer shows is refused (409), nothing changes", stale.status === 409 && (await retOf(A.id))[0].status === "SENT", stale.status);
  const wd = await j("POST", `/api/front-office/retainers/${ra.id}/withdraw`, { expectedVersion: 2, expectedStatus: "SENT", reason: "Client changed plans" }, tok);
  [ra] = await retOf(A.id);
  ok("J-55 W1: Withdraw with a reason: the retainer is Withdrawn, the reason kept, version 2's request ended (WITHDRAWN), one audit line", wd.status === 200 && ra.status === "WITHDRAWN" && ra.withdrawnReason === "Client changed plans" && ra.versions[1].endReason === "WITHDRAWN"
    && sql(`select count(*) from audit_event where firm_id = '${firmId}' and action = 'retainer.withdrawn' and (entity_key = '${ra.id}' or detail::text like '%${ra.id}%')`) === "1", { status: wd.status, r: ra.status });
  const afterReq = signingRequests(ra.id);
  ok("J-55 W1 (parts missing: FO-6, the withdraw stops the signing link): the client's signing request is cancelled with reason WITHDRAWN", /^1\|CANCELLED:WITHDRAWN$/.test(afterReq), afterReq);
  const again = await j("POST", `/api/front-office/retainers/${ra.id}/withdraw`, { expectedVersion: 2, expectedStatus: "WITHDRAWN", reason: "again" }, tok);
  ok("J-55 W1 fail: a withdrawn retainer is not withdrawn again (409)", again.status === 409, again.status);
  await p.reload(); await status.waitFor({ timeout: 15_000 });
  ok("J-55 W1: the retainer page says it is withdrawn and to prepare a new one from the prospect", /withdrawn/i.test(await p.locator("main").innerText()) && (await p.getByRole("button", { name: /^Save as version/ }).count()) === 0);
  await shot("W1-withdrawn"); await axe("W1 the withdrawn retainer");

  // ---------------------------------------------------------------------------------------------- W2 re-issue makes a new version
  await prepareAndSend(A, "1600");
  const as = await retOf(A.id);
  ok("J-55 W2: after the withdraw, client A takes a new retainer from the card (Prepare, by screens), sent as version 2; the withdrawn one is kept", as.length === 2 && as[0].status === "WITHDRAWN" && as[1].status === "SENT" && as[1].currentVersion === 2, as.map((r) => `${r.status}:${r.currentVersion}`));
  await prepareAndSend(B, "2000");
  let [rb] = await retOf(B.id);
  // Stand-in (said, not hidden): no route on main makes a retainer Declined (FO-6's decline door), so the decline is written
  // here by SQL as FO-5's own pack does: the version's request ends, the retainer reads DECLINED.
  sql(`update fo_retainer_version set ended_at = now(), end_reason = 'DECLINED' where retainer_id = '${rb.id}' and n = ${rb.currentVersion}; update fo_retainer set status = 'DECLINED' where id = '${rb.id}'; select 1`);
  await p.goto(`${BASE}/front-office/retainers/${rb.id}`); await status.waitFor({ timeout: 15_000 });
  const declinedPage = (await p.locator("main").innerText()).replace(/\s+/g, " ");
  await shot("W2-declined");
  const editBtn = p.getByRole("button", { name: /^Edit/ });
  if (await editBtn.count()) await editBtn.first().click();
  await p.getByLabel("Fee 1: amount").fill("1900");
  await p.getByRole("button", { name: /^Save as version 3$/ }).click();
  await p.locator("[data-version]", { hasText: "Version 3" }).waitFor({ timeout: 15_000 }).catch(() => undefined);
  [rb] = await retOf(B.id);
  ok("J-55 W2: from Declined, Edit and resend makes version 3 in Draft (version 2 keeps its fee, ended)", rb.status === "DRAFT" && rb.currentVersion === 3 && rb.versions[1].endedAt !== null, { status: rb.status, v: rb.currentVersion, page: declinedPage.slice(0, 160) });
  await sendNow().catch(() => undefined);
  [rb] = await retOf(B.id);
  ok("J-55 W2: the re-issued version 3 is sent", rb.status === "SENT" && rb.currentVersion === 3, rb.status);
  await shot("W2-reissued"); await axe("W2 the re-issued retainer");

  // ---------------------------------------------------------------------------------------------- W3 a decline kept with its reason
  // The client opens the signing link from their email (FO-6's public door) and declines with a reason of their own.
  const REASON = `The fee is more than we agreed on the call (Sample ${run})`;
  const mails = (await (await fetch(`${BASE}/api/demo/platform-inbox?address=${encodeURIComponent(`j55.b.${run}@example.com`)}`)).json().catch(() => ({}))) as { messages?: { subject: string; body: string }[] };
  // The demo inbox lists newest first (demo-inbox.ts: sentAt desc), so the first link is version 3's, not version 2's ended one.
  const link = (mails.messages ?? []).map((m) => m.body.match(/https?:\/\/[^\s)]+\/sign[^\s)]*/)?.[0]).find(Boolean);
  ok("J-55 W3 (parts missing: FO-6, the signing email and its public door): the client has a signing link for version 3 in their email", !!link, { mails: (mails.messages ?? []).map((m) => m.subject) });
  let declinedVia = "no link";
  if (link) {
    const c = await browser.newContext({ viewport: { width: 1024, height: 900 } }), cp = await c.newPage();
    await cp.goto(link.replace(/^https?:\/\/[^/]+/, BASE)); await cp.waitForTimeout(800);
    const dec = cp.getByRole("button", { name: /decline/i });
    if (await dec.count()) { await dec.first().click(); await cp.getByLabel(/reason/i).fill(REASON); await cp.getByRole("button", { name: /^decline/i }).last().click(); await cp.waitForTimeout(1_000); declinedVia = "door"; } else declinedVia = "no Decline on the door";
    await c.close();
  }
  const kept = hasColumn(["fo_retainer", "fo_retainer_version", "fo_signature_request", "fo_signer"], "decline%reason%")
    ? sql(`select count(*) from (select to_jsonb(r) as j from fo_signature_request r where document_id = '${rb.id}' union all select to_jsonb(s) from fo_signer s join fo_signature_request r2 on r2.id = s.request_id where r2.document_id = '${rb.id}' union all select to_jsonb(v) from fo_retainer_version v where retainer_id = '${rb.id}' union all select to_jsonb(f) from fo_retainer f where id = '${rb.id}') x where x.j::text like '%${REASON}%'`) : "0";
  ok("J-55 W3 (parts missing: FO-6, the decline with its reason): the client's decline is kept with their own reason, word for word, and the retainer reads DECLINED",
    declinedVia === "door" && kept !== "0" && (await retOf(B.id))[0].status === "DECLINED", { declinedVia, kept });
  await p.goto(`${BASE}/front-office/retainers/${rb.id}`); await status.waitFor({ timeout: 15_000 });
  const declinedNow = (await p.locator("main").innerText()).replace(/\s+/g, " ");
  ok("J-55 W3 (parts missing: FO-6 decline, FO-5s' declined state): the retainer page shows Declined with the client's reason, word for word", /declined/i.test(declinedNow) && declinedNow.includes(REASON), declinedNow.slice(0, 260));

  // ---------------------------------------------------------------------------------------------- W4 Signed offline needs the file, moves the prospect
  await p.goto(`${BASE}/front-office/retainers/${rb.id}`); await status.waitFor({ timeout: 15_000 });
  const offOffered = await p.getByRole("button", { name: /signed offline|signed on paper/i }).count();
  ok("J-55 W4 (parts missing: FO-5s' Signed offline panel): the retainer page offers Signed offline on a sent retainer", offOffered === 1, `${offOffered} buttons`);
  const off = `/api/front-office/retainers/${rb.id}/signed-offline`;
  const noFile = await multipart(off, { expectedVersion: "3", reason: "Signed at the office" }, null, tok);
  ok("J-55 W4 fail: Signed offline with no file is refused on the file field in words (\"Upload the signed PDF.\"); nothing changes", noFile.status === 422 && JSON.stringify(noFile.body).includes("Upload the signed PDF.") && (await retOf(B.id))[0].status === "SENT", noFile);
  const notPdf = await multipart(off, { expectedVersion: "3", reason: "Signed at the office" }, { name: "signed.pdf", type: "application/pdf", bytes: Buffer.from("not a pdf at all") }, tok);
  ok("J-55 W4 fail: a file that is not a PDF (named .pdf) is refused (422, \"must be a PDF\"); nothing changes", notPdf.status === 422 && /PDF/.test(JSON.stringify(notPdf.body)) && (await retOf(B.id))[0].status === "SENT", notPdf);
  const noWhy = await multipart(off, { expectedVersion: "3", reason: "" }, { name: "signed.pdf", type: "application/pdf", bytes: PDF }, tok);
  ok("J-55 W4 fail: Signed offline with no reason is refused (422)", noWhy.status === 422, noWhy.status);
  const signed = await multipart(off, { expectedVersion: "3", reason: "Signed at the office" }, { name: "signed.pdf", type: "application/pdf", bytes: PDF }, tok);
  [rb] = await retOf(B.id);
  const stage = sql(`select s.kind::text || '|' || coalesce(p.won_via::text, '') from fo_prospect p join fo_stage s on s.id = p.stage_id where p.id = '${B.id}'`);
  ok("J-55 W4: with the PDF and a reason the retainer is filed Signed on paper (SIGNED_OFFLINE, the file's sha256 kept)", signed.status === 200 && rb.status === "SIGNED_OFFLINE" && !!rb.offlineFileSha256 && rb.offlineReason === "Signed at the office", { status: signed.status, r: rb.status });
  ok("J-55 W4: the prospect moves to Won (via SIGNED_OFFLINE) once, with one prospect.won audit line", stage === "WON|SIGNED_OFFLINE" && sql(`select count(*) from audit_event where firm_id = '${firmId}' and action = 'prospect.won' and (entity_key = '${B.id}' or detail::text like '%${B.id}%')`) === "1", stage);
  const twice = await multipart(off, { expectedVersion: "3", reason: "again" }, { name: "signed.pdf", type: "application/pdf", bytes: PDF }, tok);
  ok("J-55 W4 fail: a second Signed offline is refused (409); still one prospect.won line", twice.status === 409 && sql(`select count(*) from audit_event where firm_id = '${firmId}' and action = 'prospect.won' and (entity_key = '${B.id}' or detail::text like '%${B.id}%')`) === "1", twice.status);
  const wdSigned = await j("POST", `/api/front-office/retainers/${rb.id}/withdraw`, { expectedVersion: 3, expectedStatus: "SIGNED_OFFLINE", reason: "x" }, tok);
  ok("J-55 W4 fail: a retainer signed on paper cannot be withdrawn (409, final)", wdSigned.status === 409, wdSigned.status);
  // "as a signature does": FO-6's signature completes with one signing.completed event; the paper signature raises its own
  // event (retainer.signed_offline) and the same prospect.won. The event table is read for both names.
  const ev = sql(`select count(*) filter (where type = 'retainer.signed_offline') || '|' || count(*) filter (where type = 'prospect.won') from module_event where firm_id = '${firmId}' and (payload::text like '%${rb.id}%' or subject_id = '${B.id}')`);
  ok("J-55 W4: as a signature does, the paper signature raises its event and prospect.won once (outbox)", /^1\|1$/.test(ev), ev);
  await p.goto(`${BASE}/front-office/prospects/${B.id}`); await card.waitFor({ timeout: 30_000 }); await p.waitForTimeout(500);
  const cardWords = (await card.innerText()).replace(/\s+/g, " ");
  ok("J-55 W4: the prospect's card says the retainer is signed on paper", /signed on paper|signed offline/i.test(cardWords), cardWords.slice(0, 200));
  await shot("W4-signed-on-paper"); await axe("W4 the won prospect's card");

  // ---------------------------------------------------------------------------------------------- W5 roles
  const anonW = await j("POST", `/api/front-office/retainers/${as[1].id}/withdraw`, { expectedVersion: 2, expectedStatus: "SENT", reason: "x" });
  const anonO = await multipart(`/api/front-office/retainers/${as[1].id}/signed-offline`, { expectedVersion: "2", reason: "x" }, { name: "signed.pdf", type: "application/pdf", bytes: PDF });
  ok("J-55 W5 fail: with no session, withdraw and signed offline are refused (401) and nothing changes", anonW.status === 401 && anonO.status === 401 && (await retOf(A.id))[1].status === "SENT", [anonW.status, anonO.status]);

  // ---------------------------------------------------------------------------------------------- W6 R1.56's first step
  // The firm's payment settings, written as a seed line as j_59 does (FO-7ts' own settings route is not on main yet).
  sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${firmId}', 'seed:J-55', now()) on conflict (firm_id) do nothing; select 1`);
  const inv = await j("POST", "/api/front-office/money/invoices", { personId: B.pid, currency: "CAD" }, tok);
  ok("J-55 W6: the walk ends at R1.56's first step: an invoice draft for the won client is accepted (FO-7b)", inv.status === 200 || inv.status === 201, { status: inv.status, body: JSON.stringify(inv.body).slice(0, 200) });
  for (const width of [400, 1024]) {
    await p.setViewportSize({ width, height: 900 }); await p.goto(`${BASE}/front-office/retainers/${rb.id}`); await status.waitFor({ timeout: 15_000 });
    const wide = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`J-55 W6: the signed retainer page at ${width} px has no sideways scroll`, wide <= 1, wide);
  }
  ok("J-55: no page error during the walk", errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
