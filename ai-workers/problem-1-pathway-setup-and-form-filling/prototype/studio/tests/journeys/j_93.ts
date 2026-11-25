// J-93 (map row 93, R1.93: "Our team's console; health per firm; support button"), written by the qa lane (22 Nov)
// BEFORE its parts merge, so qa only has to run it when they do. Persona: ExpatReady's own Platform Owner in our console
// (PF-17) and a firm's Owner pressing "?" on a staff page, on an isolated copy of the running app (its own database and
// port, never :4400), by screens where they exist and on the routes and the database underneath.
// Done when (CAPABILITIES R1.93), word for word as the steps:
//   W1 "Our staff sign in on their own pool": PF-4s part 1 (#2927): POST /api/system/session/local {email, secondStep}
//      for a plat_system_staff row; no second step is refused; /api/system answers 401 with no session (never 404); a
//      firm's token is refused there (403) and our token is refused on a firm route (never 200); our email is no firm's.
//   W2 "the console lists firms with health (last sign-in, failed jobs, plan state)": PF-17's firms list under
//      /api/system and on its screen: each Sample firm with its last staff sign-in (platform_staff.last_sign_in_at), its
//      failed jobs (PF-14's dead-letter list, platform_jobs, for that firm) and its plan state (platform_subscription),
//      each read back from the database and compared per firm, so firm A's figures are never firm B's.
//   W3 "opening a firm's data writes a line the firm sees (R1.87)": our staff open firm A in the console; firm A's
//      Owner then reads one more "ExpatReady staff access" line (GET /api/platform/audit?ours=1, AUD-4, merged; the line
//      itself is AUD-3's) and firm B's Owner reads none for it; on firm A's Activity log page (AUD-4s) too.
//   W4 '"?" opens a ticket that reaches the console': firm A's Owner presses "?" (PF-18s part 2, merged), writes, Sends;
//      the ticket is stored for firm A with the page (PF-18b, merged); our console lists it with its firm (PF-17).
// Fails on main today only where a part is not merged (P-606); each failing label names its part: PF-4s part 1 (#2927),
// PF-17 (the console: its routes and screens), AUD-3 (our access line on the firm's chain), AUD-4s (the firm's page).
// Assumptions (said, not hidden): PF-17's paths (/api/system/firms, /api/system/firms/:id, /api/system/support/tickets,
// the screens /system/firms and /system/support) and its answer's field names are this journey's guesses from the BACKLOG
// row, which names no paths: qa aligns the names only when PF-17 merges. The console's own browser session key
// (sessionStorage "xr-system-session") is a guess too. Stand-ins: our Platform Owner is written in SQL (PF-4s part 1 has
// no invite; part 2 adds it), and firm A's failed job is put on PF-14's dead-letter list by pg-boss from this process
// (no job of the app fails on demand). Sample values only; US$0, no model call, no live mail. No screenshots.
// Run from prototype/ (PLATFORM_SYSTEM_IDENTITY=local turns on PF-4s's stand-in once it merges; unused on main today):
//   zsh studio/tools/isolated.sh j93 4493 start --ttl 30 PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j93 4493 stop' EXIT && npx tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_93.ts j93 4493
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { PgBoss } from "pg-boss";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { DEAD_LETTER, JOBS_SCHEMA } from "../../api/src/platform/jobs/pgboss-jobs.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "j93", Number(process.argv[3] ?? 4493)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`;
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other journeys
type Ans = { status: number; body: any };
const j = async (method: string, path: string, body?: unknown, token?: string): Promise<Ans> => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
};
const table = (t: string) => sql(`select count(*) from information_schema.tables where table_name = '${t}'`) === "1";
const items = (b: unknown): Record<string, unknown>[] => (Array.isArray(b) ? b : Array.isArray((b as { items?: unknown })?.items) ? (b as { items: unknown[] }).items : Array.isArray((b as { firms?: unknown })?.firms) ? (b as { firms: unknown[] }).firms : Array.isArray((b as { tickets?: unknown })?.tickets) ? (b as { tickets: unknown[] }).tickets : []) as Record<string, unknown>[];
const pick = (o: Record<string, unknown> | undefined, ...paths: string[]): unknown => {
  for (const p of paths) { let v: unknown = o; for (const k of p.split(".")) v = v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined; if (v !== undefined) return v; }
  return undefined;
};
const sameMoment = (a: unknown, b: string) => typeof a === "string" && !!b && Math.abs(Date.parse(a) - Date.parse(b)) < 1;

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
const nameA = sql(`select operating_name from platform_firm where id = '${A}'`), nameB = sql(`select operating_name from platform_firm where id = '${B}'`);
ok("J-93 setup: the two Sample firms (A sample-firm, B sample-solo) and their front office are seeded", !!A && !!B && fo.failed.length === 0, fo.failed);
const emailOf = (actor: string) => sql(`select email from platform_staff where actor_id = '${actor}'`);
const firmSignIn = async (firmKey: string, email: string) => {
  const r = await j("POST", "/api/platform/session/local", { firmKey, email, secondStep: true });
  if (!r.body?.token) { console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${r.body?.detail}`); process.exit(2); }
  return r.body.token as string;
};
const tA = await firmSignIn("sample-firm", emailOf("user-R"));   // firm A's Owner
const tB = await firmSignIn("sample-solo", emailOf("user-S"));   // firm B's Owner
// Our Platform Owner (stand-in, SQL): PF-4s part 1 has no invite (part 2). Only when PF-4s's tables exist.
const ourEmail = `ops.${run}@expatready.example.com`;
const pf4s = table("plat_system_staff");
if (pf4s) {
  sql(`with s as (insert into plat_system_staff (id, email, display_name) values (gen_random_uuid(), '${ourEmail}', 'Platform Owner ${run} (Sample)') returning id)
       insert into plat_system_role_grant (id, staff_id, role_code) select gen_random_uuid(), id, 'platform-owner' from s returning staff_id`);
}
// Firm A's failed job (stand-in: put on PF-14's dead-letter list by pg-boss from this process, in the app's own schema).
const boss = new PgBoss({ connectionString: URL, schema: JOBS_SCHEMA, supervise: false, schedule: false, migrate: false, createSchema: false });
boss.on("error", () => undefined);
let deadSeeded = "";
try { await boss.start(); deadSeeded = String(await boss.send(DEAD_LETTER, { key: `j93-${run}`, firmId: A, payload: {} }) ?? ""); }
catch (e) { deadSeeded = `refused: ${(e as Error).message}`.slice(0, 160); }
finally { await boss.stop({ graceful: false, wait: true }).catch(() => undefined); }
const deadOf = (firm: string) => Number(sql(`select count(*) from ${JOBS_SCHEMA}.job where name = '${DEAD_LETTER}' and data->>'firmId' = '${firm}'`));
ok("J-93 setup: firm A has a failed job on PF-14's dead-letter list (stand-in, written by pg-boss), firm B none of this run", /^[0-9a-f-]{36}$/.test(deadSeeded) && deadOf(A) >= 1, { deadSeeded, A: deadOf(A), B: deadOf(B) });

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
try {
  // ---------------------------------------------------------------------------------------- W1 our staff sign in on their own pool
  const anon = await j("GET", "/api/system/me");
  ok("J-93 W1 (part missing: PF-4s part 1 #2927, the /api/system guard): /api/system answers as a guarded area with no session (401, never 404)", anon.status === 401, anon.status);
  const noStep = await j("POST", "/api/system/session/local", { email: ourEmail, secondStep: false });
  const our = await j("POST", "/api/system/session/local", { email: ourEmail, secondStep: true });
  const tOur: string | undefined = our.body?.token;
  ok("J-93 W1 (part missing: PF-4s part 1 #2927, plat_system_staff and our sign-in door): our Platform Owner signs in with the second step (a system session token)", !!tOur, { table: pf4s, status: our.status });
  const meRead = tOur ? await j("GET", "/api/system/me", undefined, tOur) : { status: 0, body: null };
  ok("J-93 W1 (part missing: PF-4s part 1 #2927): who-am-I names our Platform Owner and their system/* keys only", meRead.status === 200 && meRead.body?.email === ourEmail && Array.isArray(meRead.body?.keys) && meRead.body.keys.includes("system/firm:read") && meRead.body.keys.every((k: string) => k.startsWith("system/")), { status: meRead.status });
  ok("J-93 W1 fail (part missing: PF-4s part 1 #2927): without the second step our sign-in is refused (401, no token)", noStep.status === 401 && !noStep.body?.token, noStep.status);
  const firmOnOurs = await j("GET", "/api/system/me", undefined, tA);
  ok("J-93 W1 fail (part missing: PF-4s part 1 #2927): a firm Owner's token is refused on our pool's routes (403, never 404)", firmOnOurs.status === 403, firmOnOurs.status);
  const oursOnFirm = tOur ? await j("GET", "/api/platform/support/tickets", undefined, tOur) : { status: 0, body: null };
  ok("J-93 W1 fail (part missing: PF-4s part 1 #2927): our token is refused on a firm route (401 or 403, never 200)", !!tOur && [401, 403].includes(oursOnFirm.status), oursOnFirm.status);
  const ourAsFirm = await j("POST", "/api/platform/session/local", { firmKey: "sample-firm", email: ourEmail, secondStep: true });
  ok("J-93 W1 fail: our staff member's email is no firm's staff (the firm pool refuses it; vacuous until PF-4s part 1 merges: the email is on no pool today)", !ourAsFirm.body?.token && ourAsFirm.status >= 400, ourAsFirm.status);

  // ---------------------------------------------------------------------------------------- W2 the firms list with health
  const firmsList = await j("GET", "/api/system/firms", undefined, tOur);
  const rows = items(firmsList.body), rowOf = (id: string, key: string) => rows.find((r) => r.id === id || r.firmId === id || r.key === key);
  const rA = rowOf(A, "sample-firm"), rB = rowOf(B, "sample-solo");
  ok("J-93 W2 (parts missing: PF-17, PF-4s part 1): the console's firms list (GET /api/system/firms) lists both Sample firms", firmsList.status === 200 && !!rA && !!rB, { status: firmsList.status, rows: rows.length });
  const lastIn = (firm: string) => sql(`select coalesce(to_char(max(last_sign_in_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '') from platform_staff where firm_id = '${firm}'`);
  const lA = lastIn(A), lB = lastIn(B);
  const gotLA = pick(rA, "lastSignInAt", "health.lastSignInAt", "lastStaffSignInAt"), gotLB = pick(rB, "lastSignInAt", "health.lastSignInAt", "lastStaffSignInAt");
  ok("J-93 W2 (parts missing: PF-17, PF-4s part 1): each firm's last staff sign-in is its own (the database's latest platform_staff.last_sign_in_at, per firm)", !!lA && !!lB && lA !== lB && sameMoment(gotLA, lA) && sameMoment(gotLB, lB), { db: [lA, lB], read: [gotLA ?? null, gotLB ?? null] });
  const fA = pick(rA, "failedJobs", "health.failedJobs", "failedJobCount"), fB = pick(rB, "failedJobs", "health.failedJobs", "failedJobCount");
  ok("J-93 W2 (parts missing: PF-17, PF-4s part 1): each firm's failed jobs are its own dead letters (firm A counts this run's failed job; firm B's figure is firm B's)", fA === deadOf(A) && fB === deadOf(B) && deadOf(A) >= 1, { db: [deadOf(A), deadOf(B)], read: [fA ?? null, fB ?? null] });
  const planOf = (firm: string) => sql(`select coalesce(string_agg(p.code || '|' || s.status, ',' order by s.created_at desc), '') from platform_subscription s join platform_plan p on p.id = s.plan_id where s.firm_id = '${firm}'`).split(",")[0];
  const pA = planOf(A), pB = planOf(B);
  const planRead = (r: Record<string, unknown> | undefined) => `${pick(r, "plan.code", "planCode", "health.plan.code") ?? ""}|${pick(r, "plan.status", "planState", "subscriptionStatus", "health.planState", "status") ?? ""}`;
  ok("J-93 W2 (parts missing: PF-17, PF-4s part 1): each firm's plan state is its own subscription (plan and status, as stored)", !!pA && planRead(rA) === pA && planRead(rB) === pB, { db: [pA, pB], read: [planRead(rA), planRead(rB)] });

  // The console's screen (PF-17): our Platform Owner opens Firms and reads firm A's row with its health.
  const cctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  if (tOur) await cctx.addInitScript((x) => sessionStorage.setItem("xr-system-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tOur);
  const cp: Page = await cctx.newPage(); cp.on("pageerror", (e) => errors.push(`console: ${String(e)}`));
  await cp.goto(`${BASE}/system/firms`);
  const firmsHeading = cp.getByRole("heading", { level: 1, name: /^Firms$/ });
  const sawFirms = await firmsHeading.waitFor({ timeout: 15_000 }).then(() => true, () => false);
  const rowA = cp.getByRole("row").filter({ hasText: nameA }), rowB = cp.getByRole("row").filter({ hasText: nameB });
  const rowAText = sawFirms && (await rowA.count()) === 1 ? (await rowA.innerText()).replace(/\s+/g, " ") : "";
  // Aligned by qa 10 on #3489's head 8e7f454d6 (PF-17 part 4 PR B): each row's "Failed jobs" cell ([data-failed-jobs],
  // a count, "n+" past the cap) read on its own, firm A's and firm B's each against its own dead letters (the row's
  // text alone held "150", so "1" was found in any row).
  const cellOf = async (row: typeof rowA) => (await row.count()) === 1 && (await row.locator("[data-failed-jobs]").count()) === 1 ? (await row.locator("[data-failed-jobs]").innerText()).trim() : "";   // no cell: the step fails, never a timeout (reviewer m4, #3533)
  const [cellA, cellB] = sawFirms ? [await cellOf(rowA), await cellOf(rowB)] : ["", ""];
  ok("J-93 W2 (parts missing: PF-17 screens, PF-4s part 1): our console's Firms page lists firm A and firm B, each row's Failed jobs cell its own dead letters, firm A's row with its plan state",
    sawFirms && (await rowB.count()) === 1 && cellA === String(deadOf(A)) && cellB === String(deadOf(B)) && new RegExp(pA.split("|")[1] ?? "-", "i").test(rowAText), { heading: sawFirms, cells: [cellA, cellB], dead: [deadOf(A), deadOf(B)], rowA: rowAText.slice(0, 160) });

  // ---------------------------------------------------------------------------------------- W3 opening a firm writes a line the firm sees
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const oursLines = async (t: string) => { const r = await j("GET", `/api/platform/audit?from=${day(-1)}&to=${day(1)}&ours=1`, undefined, t); return { status: r.status, lines: (r.body?.lines ?? []) as { advanced?: { actorType?: string; entityKey?: string | null } }[] }; };
  const beforeA = await oursLines(tA), beforeB = await oursLines(tB);
  ok("J-93 W3: each firm's Owner reads its own activity log's \"ExpatReady staff access\" lines (AUD-4, merged)", beforeA.status === 200 && beforeB.status === 200, [beforeA.status, beforeB.status]);
  const opened = await j("GET", `/api/system/firms/${A}`, undefined, tOur);
  ok("J-93 W3 (parts missing: PF-17, PF-4s part 1): our Platform Owner opens firm A in the console (GET /api/system/firms/:id)", opened.status === 200 && (opened.body?.id === A || opened.body?.firm?.id === A), opened.status);
  const afterA = await oursLines(tA), afterB = await oursLines(tB);
  // Since #3209 (AUD-3 part 1) one read writes two lines under one correlation id, by design: PF-12's audited bypass use
  // (platform.bypass) and AUD-3's platform.system.firm_read (qa 6, 24 Nov; as R1.87's probe).
  const newActions = afterA.lines.slice(0, afterA.lines.length - beforeA.lines.length).map((l) => String((l as { action?: string }).action ?? "")).sort().join(",");
  ok("J-93 W3 (AUD-3 part 1 #3209 and PF-17, on main): opening firm A writes the lines firm A's Owner sees as ExpatReady staff access (actor type OUR_STAFF): its platform.system.firm_read line and PF-12's platform.bypass line",
    afterA.lines.length === beforeA.lines.length + 2 && newActions === "platform.bypass,platform.system.firm_read" && afterA.lines.every((l) => l.advanced?.actorType === "OUR_STAFF"), { before: beforeA.lines.length, after: afterA.lines.length, newActions });
  ok("J-93 W3 fail: firm B's Owner reads no line for our opening of firm A (another firm's access line never appears; vacuous until PF-17 and AUD-3 merge: no line is written today)", afterB.status === 200 && afterB.lines.length === beforeB.lines.length, { before: beforeB.lines.length, after: afterB.lines.length });
  const actx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  await actx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tA);
  const ap: Page = await actx.newPage(); ap.on("pageerror", (e) => errors.push(`firm: ${String(e)}`));
  await ap.goto(`${BASE}/platform/activity-log`);
  const staffAccess = ap.getByRole("button", { name: /ExpatReady staff access/i });
  const sawLog = await staffAccess.waitFor({ timeout: 15_000 }).then(() => true, () => false);
  if (sawLog) await staffAccess.click();
  const logLine = ap.getByText(/ExpatReady staff/).nth(1);
  ok("J-93 W3 (part missing: AUD-4s, the firm's Activity log page): firm A's Owner sees our access on Settings › Activity log under \"ExpatReady staff access\"",
    sawLog && (await logLine.waitFor({ timeout: 10_000 }).then(() => true, () => false)), { page: sawLog });

  // ---------------------------------------------------------------------------------------- W4 "?" opens a ticket that reaches the console
  const words = `Sample question ${run}: the licences page shows two seats (J-93)`;
  await ap.goto(`${BASE}/platform/licences`);
  const help = ap.locator("[data-help-button]");
  const sawHelp = await help.waitFor({ timeout: 30_000 }).then(() => true, () => false);
  ok("J-93 W4: a staff page shows the \"?\" (named \"Get help with this page\") to firm A's Owner (PF-18s part 2, merged)", sawHelp && (await ap.getByRole("button", { name: "Get help with this page" }).count()) === 1);
  let ticketId = "";
  if (sawHelp) {
    await help.click();
    await ap.locator("[data-raise-body]").fill(words);
    const noted = (await ap.locator("[data-raise-page]").innerText().catch(() => "")).trim();
    await ap.locator("[data-raise-send]").click();
    const sent = await ap.locator("[data-raise-sent]").waitFor({ timeout: 20_000 }).then(() => true, () => false);
    ticketId = sql(`select coalesce(string_agg(t.id::text, ','), '') from platform_support_ticket t join platform_support_message m on m.ticket_id = t.id where t.firm_id = '${A}' and m.body = '${words.replace(/'/g, "''")}'`);
    ok("J-93 W4: \"?\" opens Ask for help; Send stores one ticket for firm A with the page it was pressed on (PF-18b, merged)",
      sent && /^[0-9a-f-]{36}$/.test(ticketId) && sql(`select page from platform_support_ticket where id = '${ticketId}'`) === noted && noted === "/platform/licences", { sent, ticketId, noted });
  }
  const queue = await j("GET", "/api/system/support/tickets", undefined, tOur);
  const inQueue = items(queue.body).find((t) => t.id === ticketId);
  ok("J-93 W4 (parts missing: PF-17, PF-4s part 1): the ticket reaches our console's support list (GET /api/system/support/tickets) with its firm",
    queue.status === 200 && !!ticketId && !!inQueue && (pick(inQueue, "firmId", "firm.id") === A || pick(inQueue, "firmKey", "firm.key") === "sample-firm"), { status: queue.status, found: !!inQueue });
  await cp.goto(`${BASE}/system/support`);
  const sawQueue = await cp.getByRole("heading", { level: 1, name: /support/i }).waitFor({ timeout: 15_000 }).then(() => true, () => false);
  ok("J-93 W4 (parts missing: PF-17 screens, PF-4s part 1): our console's support page shows the ticket with firm A's name",
    sawQueue && (await cp.getByRole("row").filter({ hasText: `Sample question ${run}` }).filter({ hasText: nameA }).count()) === 1, { page: sawQueue });

  // ---------------------------------------------------------------------------------------- W5 the next capability's first step (gate A, P-348c)
  // Added by qa 10 (25 Nov) after the R1.93 reader's Major: the walk must end where the next step begins. Our Platform
  // Owner opens the ticket from its subject, writes a reply and presses Send reply (PF-17 part 4 PR C, the ticket panel;
  // POST /api/system/support/tickets/:id/replies); firm A's Owner then opens the ticket on Help & support
  // (/platform/support/:id, PF-18s part 2) and reads our reply: where the support thread's own capability continues.
  const reply = `Sample reply ${run}: the second seat is the Sample owner's own (J-93)`;
  const qrow = cp.getByRole("row").filter({ hasText: `Sample question ${run}` });
  let sentReply = false;
  if (sawQueue && (await qrow.count()) === 1) {
    await qrow.getByRole("button").first().click();
    const box = cp.getByLabel(/^Reply/);
    if (await box.waitFor({ timeout: 15_000 }).then(() => true, () => false)) {
      await box.fill(reply);
      await cp.getByRole("button", { name: "Send reply" }).click();
      sentReply = await cp.locator("[data-reply-sent]").waitFor({ timeout: 15_000 }).then(() => true, () => false);
    }
  }
  const stored = ticketId ? sql(`select coalesce(string_agg(t.status::text || '|' || m.author_kind::text, ','), '') from platform_support_ticket t join platform_support_message m on m.ticket_id = t.id where t.id = '${ticketId}' and m.body = '${reply.replace(/'/g, "''")}'`) : "";
  ok("J-93 W5 (gate A's next step): our Platform Owner opens the ticket on the console's Support page, writes a reply and presses Send reply; it is stored once as ExpatReady support's message and the ticket waits on the firm",
    sentReply && /^[A-Z_]+\|SUPPORT$/.test(stored) && !stored.includes(","), { sent: sentReply, stored });
  let firmSees = false;
  if (ticketId) {
    await ap.goto(`${BASE}/platform/support/${ticketId}`);
    const msgs = ap.getByRole("list", { name: "Messages" });
    firmSees = await msgs.waitFor({ timeout: 15_000 }).then(async () => (await msgs.innerText()).includes(reply), () => false);
  }
  ok("J-93 W5 (gate A's next step): firm A's Owner opens the ticket on Help & support and reads our reply in its messages, where the support thread continues",
    firmSees, { firmSees });
  ok("J-93: no page error during the walk", errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
