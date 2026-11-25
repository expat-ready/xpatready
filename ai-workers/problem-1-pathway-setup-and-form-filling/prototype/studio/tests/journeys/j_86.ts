// J-86 (map row 86, R1.86: "Breach register with firm notices"), written by the qa lane (23 Nov) while PF-21c is in
// flight (draft #3185, branch claude/eloquent-ptolemy-h9jfsm), so qa only has to run it when its parts merge. Persona:
// ExpatReady's own Platform Owner in our console (PF-17, signed in on PF-4s), on an isolated copy of the running app (its
// own database and port, never :4400), by screens where they exist and on the routes and the database underneath. It
// starts where J-85 ends: our console's Breaches page (PF-21c, PF-21rs).
// Done when (CAPABILITIES R1.86), word for word as the steps:
//   W1 "A breach is recorded": our console's Breaches page (PF-21rs) offers "Record a breach"; the Platform Owner records
//      one naming two firms (POST /api/system/register/breaches, PF-21c): plat_breach keeps it as written, with a
//      RECORDED event and the guard's line in plat_system_audit carrying the reason.
//   W2 "with its assessment": data categories, root cause, containment and the decision to notify with who, when and why
//      (PATCH …/:id, PF-21c) are stored on the breach, the change an event with before and after.
//   W3 "and the firms notified": one notice to each named firm (POST …/:id/notices, PF-21c) reaching its active Owner
//      and Admins only (never a case officer); a third firm gets none; a second notice to one firm is refused (409).
//   W4 "each with time": each notice's sent time is the same on the answer, on plat_breach_notice and on the firm's own
//      audit line, inside the call's window; the local email adapter marks each message sent after it.
//   W5 "and words": each recipient's stored words (the outbox file, checked against rendered_hash) are exactly the
//      published Security incident notice filled for that firm (Sample wording; Unconfirmed: no counsel); the copy's
//      demo inbox shows the same subject and body; one firm's words never name the other firm.
//   W6 (screen) the breach's page in our console lists each notice with its firm, time and subject, offers no second
//      send to a notified firm and lists no third firm (PF-21rs W4).
//   W7 one firm's notice never shows another firm: firm A's Owner sees its notice line in its Activity log (AUD-4s);
//      firm B's Owner's activity log holds its own notice line only, never firm A's.
//   W8 wrong role: a firm's own Owner gets 403 on our register (list, read, record, notify), and nothing is recorded.
//   W9 our console's Breaches page at 400, 1024 and 1440 px: rendered, no sideways scroll, axe 0 serious; no page error.
//   (W10, our staff's read of this breach landing on firm A's own chain, moved to R1.87 by Lead 2's ruling on #3538 (#3579's
//      body: "W10 moves to R1.87, which makes it 27/27"); R1.87's lane owns that step. Removed here by qa 9, 25 Nov.)
// Fails on main today only where a part is not merged (P-606); each failing step names its part: PF-21c (#3185: the
// tables, routes, notices), PF-21rs (the console pages). Route names under
// /api/system/register/breaches and the notice words come from #3185's diff (23 Nov); the console page paths
// (/system/privacy/breaches, …/:id, as J-85's) and its sign-in card ("Work email", "Sign in") are this journey's
// assumption until PF-21rs's concept: when it merges, qa aligns the paths and labels only.
// Sample values only; US$0, no model call, no live mail (the copy's local email adapter). Screenshots:
// product/screens/J-86/screenshots/. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j86 4486 start --ttl 30 PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j86 4486 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_86.ts j86 4486
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { fillFields } from "../../ports/messages.ts";
import { LocalFiles } from "../../api/src/front-office/files.ts";
import { fileKeyOf } from "../../api/src/platform/messages/send/messages.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j86", Number(process.argv[3] ?? 4486)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const FILES = join(STUDIO, "var", `isolated-${NAME}`, "front-office-files");   // the copy's own LocalFiles folder (isolated.sh STUDIO_VAR)
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-86", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ROUTE = "/api/system/register/breaches";
const { ok, summary } = recorder();
const { sql: rawSql, until } = client(PORT, DBNAME);
/** First line of a query's answer, or "ERR: …" when the query fails (a table not merged yet): never a throw. */
const sql = (q: string) => { try { return rawSql(q).split("\n")[0].trim(); } catch (e) { return `ERR: ${String((e as { stderr?: unknown }).stderr ?? e).split("\n")[0]}`; } };
const run = Date.now().toString(36);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other journeys
const j = async (method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
};
const table = (t: string) => sql(`select count(*) from information_schema.tables where table_name = '${t}'`) === "1";
const iso = (col: string) => `to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const ownerOfSample = sql(`select email from platform_staff where actor_id = 'user-R'`);   // the Sample firm's own Owner (not our staff)
/** A Sample firm of this run, ACTIVE, with staff in these roles. */
const firm = (label: string) => {
  const key = `j86-${label.toLowerCase()}-${run}`, name = `Sample Breach Firm ${label} ${run}`;
  const id = sql(`insert into platform_firm (id, key, operating_name, country_code, contact_email, status, updated_at) values (gen_random_uuid(), '${key}', '${name}', 'CA', 'contact.${key}@example.com', 'ACTIVE', now()) returning id`);
  return { id, key, name };
};
const staff = (f: { id: string; key: string }, who: string, role: string) => {
  const email = `${who}.${f.key}@example.com`;
  const id = sql(`insert into platform_staff (id, firm_id, email, display_name, status, updated_at) values (gen_random_uuid(), '${f.id}', '${email}', 'Sample ${who}', 'ACTIVE', now()) returning id`);
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${f.id}', '${id}', '${role}', 'seed:J-86')`);
  return { id, email };
};
const A = firm("A"), B = firm("B"), C = firm("C");
const aOwner = staff(A, "owner", "OWNER"), aAdmin = staff(A, "admin", "ADMIN"), aOfficer = staff(A, "officer", "CASE_OFFICER");
const bOwner = staff(B, "owner", "OWNER"), cOwner = staff(C, "owner", "OWNER");
ok("J-86 setup: three Sample firms (A, B, C) with their Owners, firm A's Admin and a case officer", [A.id, B.id, C.id, aOwner.id, aAdmin.id, aOfficer.id, bOwner.id, cOwner.id].every((x) => /^[0-9a-f-]{36}$/.test(x)), { A: A.id, B: B.id, C: C.id });
const firmSignIn = async (firmKey: string, email: string) => (await j("POST", "/api/platform/session/local", { firmKey, email, secondStep: true })).body?.token as string | undefined;
const sampleTok = await firmSignIn("sample-firm", ownerOfSample);
if (!sampleTok) { console.error("STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local)"); process.exit(2); }
const aTok = await firmSignIn(A.key, aOwner.email), bTok = await firmSignIn(B.key, bOwner.email);
ok("J-86 setup: firm A's and firm B's Owners sign in (local stand-in)", !!aTok && !!bTok, { a: !!aTok, b: !!bTok });
// Our own Platform Owner (PF-4s, merged: plat_system_staff and POST /api/system/session/local), a Sample person of this run.
const ourEmail = `platform.owner.${run}@expatready.example`;
let ourStaffId = "";
try { ourStaffId = (await (db as unknown as { platSystemStaff: { create(a: unknown): Promise<{ id: string }> } }).platSystemStaff.create({ data: { email: ourEmail, displayName: "Sample Platform Owner", grants: { create: [{ roleCode: "platform-owner" }] } } })).id; } catch (e) { console.log(`note: no plat_system_staff (${String(e).slice(0, 120)})`); }
const ourTok: string | undefined = ourStaffId ? (await j("POST", "/api/system/session/local", { email: ourEmail, secondStep: true })).body?.token : undefined;
const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
const p: Page = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
const shot = (pg: Page, name: string) => pg.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
/** Opens a console page; if our console's sign-in card shows (assumed: "Work email" and "Sign in"), signs our Platform Owner in. */
const consolePage = async (path: string) => {
  await p.goto(`${BASE}${path}`); await p.waitForLoadState("networkidle").catch(() => undefined); await wait(500);
  const email = p.getByLabel("Work email");
  if (await email.count() && !(await p.getByLabel("Firm key").count())) {
    await email.fill(ourEmail); await p.getByRole("button", { name: "Sign in" }).click();
    await p.waitForLoadState("networkidle").catch(() => undefined); await wait(800);
  }
  return (await p.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
};
const onBreachesPage = async () => (await p.getByRole("heading", { name: /breaches/i }).count()) > 0 && (await p.getByRole("button", { name: /record a breach/i }).count()) > 0;

try {
  // ---------------------------------------------------------------------------------------------- W1 a breach is recorded
  const guarded = await j("GET", "/api/system/me");
  ok("J-86 W1 (PF-4s, merged): /api/system answers as a guarded area (401 with no session, never 404)", guarded.status === 401, guarded.status);
  ok("J-86 W1 (PF-4s, merged): our Platform Owner signs in to the console (a system session token)", !!ourTok, { ourStaff: ourStaffId || "no plat_system_staff" });
  const words1 = await consolePage("/system/privacy/breaches");
  ok("J-86 W1 (parts missing: PF-21rs, PF-17's console): our console's Breaches page opens with \"Record a breach\" (where J-85 ended)", await onBreachesPage(), words1.slice(0, 200));
  await shot(p, "W1-console-breaches");
  const discoveredAt = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const rec = {
    reason: "Sample: recording the incident (J-86)", discoveredAt, description: `Sample: a storage bucket's files were readable by link for two hours (J-86 ${run}).`,
    affectedFirms: [A.id, B.id], dataCategories: ["identity_documents", "contact_details"], rootCause: "Sample: a wrong bucket policy", containment: "Sample: the policy was corrected and the links revoked.",
  };
  const opened = await j("POST", ROUTE, rec, ourTok, { "idempotency-key": `j86-${run}` });
  const id: string | undefined = typeof opened.body === "object" && typeof opened.body?.id === "string" ? opened.body.id : undefined;
  const stored = id ? sql(`select status || '|' || ${iso("discovered_at")} || '|' || description || '|' || array_to_string(affected_firms, ',') || '|' || opened_by from plat_breach where id = '${id}'`) : "no breach";
  ok("J-86 W1 (parts missing: PF-21c, plat_breach and POST /api/system/register/breaches): the Platform Owner records a breach naming firms A and B → 201; stored as written (RECORDED, discovered at, description, both firms, opened by our staff member)",
    opened.status === 201 && stored === `RECORDED|${discoveredAt}|${rec.description}|${A.id},${B.id}|staff:${ourStaffId}`, { status: opened.status, stored });
  const recEvents = id ? sql(`select count(*) from plat_breach_event where breach_id = '${id}' and kind::text = 'RECORDED' and actor = 'staff:${ourStaffId}'`) : "no breach";
  const guardLine = id ? sql(`select count(*) from plat_system_audit where route = '${ROUTE}' and outcome::text = 'ALLOWED' and staff_id = '${ourStaffId}' and reason = '${rec.reason}'`) : "no breach";
  ok("J-86 W1 (parts missing: PF-21c): the record is audited: one RECORDED event naming our staff member, and the guard's ALLOWED line with the reason in plat_system_audit", recEvents === "1" && guardLine === "1", { recEvents, guardLine });

  // ---------------------------------------------------------------------------------------------- W2 with its assessment
  const decision = { reason: "Sample: decide (J-86)", decision: "NOTIFY_FIRMS", decisionReason: "Sample: identity documents may have been seen." };
  const decided = id ? await j("PATCH", `${ROUTE}/${id}`, decision, ourTok) : { status: 0, body: null };
  const assess = id ? sql(`select array_to_string(data_categories, ',') || '|' || root_cause || '|' || containment || '|' || decision::text || '|' || decision_reason || '|' || decided_by || '|' || (decided_at is not null and decided_at <= now())::text from plat_breach where id = '${id}'`) : "no breach";
  ok("J-86 W2 (parts missing: PF-21c): the assessment is stored on the breach: data categories, root cause, containment, and the decision to notify with who, when and why",
    decided.status === 200 && assess === `identity_documents,contact_details|${rec.rootCause}|${rec.containment}|NOTIFY_FIRMS|${decision.decisionReason}|staff:${ourStaffId}|true`, { status: decided.status, assess });
  const changed = id ? sql(`select detail->'before'->>'decision' || '>' || (detail->'after'->>'decision') from plat_breach_event where breach_id = '${id}' and kind::text = 'CHANGED' order by seq desc limit 1`) : "no breach";
  ok("J-86 W2 (parts missing: PF-21c): the decision is a CHANGED event with before and after (UNDECIDED > NOTIFY_FIRMS)", changed === "UNDECIDED>NOTIFY_FIRMS", changed);

  // ---------------------------------------------------------------------------------------------- W3 and the firms notified
  const t0 = Date.now() - 1000;
  const nA = id ? await j("POST", `${ROUTE}/${id}/notices`, { reason: "Sample: notify A (J-86)", firmId: A.id }, ourTok) : { status: 0, body: null };
  const nB = id ? await j("POST", `${ROUTE}/${id}/notices`, { reason: "Sample: notify B (J-86)", firmId: B.id }, ourTok) : { status: 0, body: null };
  const t1 = Date.now() + 1000;
  const nC = id ? await j("POST", `${ROUTE}/${id}/notices`, { reason: "Sample: notify C (J-86)", firmId: C.id }, ourTok) : { status: 0, body: null };
  const addrs = (f: string) => sql(`select coalesce(string_agg(address, ',' order by address), '') from msg_outbox where firm_id = '${f}' and idempotency_key like 'breach-notice:${id ?? "none"}:%'`);
  const wantA = [aOwner.email, aAdmin.email].sort().join(",");
  ok("J-86 W3 (parts missing: PF-21c, POST …/notices): firm A's notice → 201 and goes to its active Owner and Admin only (never its case officer); firm B's → 201 to its Owner",
    nA.status === 201 && nB.status === 201 && addrs(A.id) === wantA && addrs(B.id) === bOwner.email && !addrs(A.id).includes(aOfficer.email), { a: [nA.status, addrs(A.id)], b: [nB.status, addrs(B.id)] });
  const noticeRows = id ? sql(`select coalesce(string_agg(firm_id::text, ',' order by firm_id), '') from plat_breach_notice where breach_id = '${id}'`) : "no breach";
  ok("J-86 W3 (parts missing: PF-21c): a third firm the breach does not name → 422 and gets nothing; the breach holds exactly one notice per named firm",
    nC.status === 422 && sql(`select count(*) from msg_outbox where firm_id = '${C.id}'`) === "0" && noticeRows === [A.id, B.id].sort().join(","), { c: nC.status, noticeRows });
  const again = id ? await j("POST", `${ROUTE}/${id}/notices`, { reason: "Sample: again (J-86)", firmId: A.id }, ourTok) : { status: 0, body: null };
  ok("J-86 W3 (parts missing: PF-21c): a second notice to firm A for this breach → 409 ALREADY_NOTIFIED, no new message, still one notice row",
    again.status === 409 && again.body?.code === "ALREADY_NOTIFIED" && addrs(A.id) === wantA && sql(`select count(*) from plat_breach_notice where breach_id = '${id}' and firm_id = '${A.id}'`) === "1", { status: again.status, code: again.body?.code ?? null });

  // ---------------------------------------------------------------------------------------------- W4 each with time
  const timeOf = (n: { status: number; body: any }, f: { id: string }) => {   // eslint-disable-line @typescript-eslint/no-explicit-any -- loose answer
    const sentAt: string | undefined = n.body?.sentAt, noticeId: string | undefined = n.body?.id;
    const dbAt = noticeId ? sql(`select ${iso("sent_at")} from plat_breach_notice where id = '${noticeId}'`) : "no notice";
    const lineAt = noticeId ? sql(`select coalesce(detail->'after'->>'sentAt', detail->>'sentAt_after', '') from audit_event where firm_id = '${f.id}' and action = 'platform.breach.notice_sent' and entity_key = '${noticeId}'`) : "no notice";
    return { sentAt: sentAt ?? null, dbAt, lineAt, inWindow: !!sentAt && Date.parse(sentAt) >= t0 && Date.parse(sentAt) <= t1 };
  };
  const timeA = timeOf(nA, A), timeB = timeOf(nB, B);
  ok("J-86 W4 (parts missing: PF-21c): each notice's sent time is the same on the answer, on plat_breach_notice and on the firm's own audit line, and falls inside the send call",
    [timeA, timeB].every((t) => t.inWindow && t.sentAt === t.dbAt && t.sentAt === t.lineAt), { timeA, timeB });
  const delivered = id ? await until(async () => sql(`select count(*) from msg_outbox where idempotency_key like 'breach-notice:${id}:%' and state::text in ('SENT', 'DELIVERED') and sent_at is not null`) === "3", 30_000) : false;
  ok("J-86 W4 (parts missing: PF-21c): the copy's local email adapter marks each of the three messages sent (a sent time on each, never before the notice)",
    delivered && sql(`select count(*) from msg_outbox o join plat_breach_notice n on n.breach_id = '${id}' and n.firm_id = o.firm_id where o.idempotency_key like 'breach-notice:${id}:%' and o.sent_at >= date_trunc('milliseconds', n.sent_at)`) === "3",
    { delivered, states: id ? sql(`select coalesce(string_agg(state::text, ','), '') from msg_outbox where idempotency_key like 'breach-notice:${id}:%'`) : "no breach" });

  // ---------------------------------------------------------------------------------------------- W5 and words
  const files = new LocalFiles(FILES);
  const tplId: string | undefined = nA.body?.templateVersionId;
  const tpl = tplId ? await db.$queryRaw<{ subject: string | null; body: string; key: string }[]>`select v.subject, v.body, t.key from msg_template_version v join msg_template t on t.id = v.template_id where v.id = ${tplId}::uuid`.catch(() => []) : [];
  const expected = (f: { name: string }) => {
    if (!tpl[0] || !id) return null;
    const values = { firm_name: f.name, discovered_on: `${discoveredAt.slice(0, 16).replace("T", " ")} UTC`, description: rec.description, data_categories: "identity documents, contact details", containment: rec.containment, breach_ref: id };
    try { return { subject: fillFields(tpl[0].subject ?? "", values), text: fillFields(tpl[0].body, values) }; } catch (e) { return { subject: `template refused: ${String(e)}`, text: "" }; }
  };
  const wordsOf = async (n: { body: any }, f: { id: string; name: string }) => {   // eslint-disable-line @typescript-eslint/no-explicit-any -- loose answer
    const want = expected(f), out: { outboxId: string; exact: boolean; hashOk: boolean; inbox: boolean }[] = [];
    for (const r of (Array.isArray(n.body?.recipients) ? n.body.recipients : []) as { outboxId: string }[]) {
      const file = await files.get(f.id, fileKeyOf(f.id, r.outboxId)).catch(() => null);
      const got = file ? JSON.parse(new TextDecoder().decode(file.bytes)) as { subject?: string; text?: string } : null;
      const hash = file ? createHash("sha256").update(file.bytes).digest("hex") : "";
      const address = sql(`select address from msg_outbox where id = '${r.outboxId}'`);
      const inbox = await j("GET", `/api/demo/platform-inbox?address=${encodeURIComponent(address)}`);
      const shown = Array.isArray(inbox.body?.messages) ? (inbox.body.messages as { subject: string; body: string }[]).filter((m) => m.subject === want?.subject && m.body === want?.text) : [];
      out.push({ outboxId: r.outboxId, exact: !!want && got?.subject === want.subject && got?.text === want.text, hashOk: !!hash && hash === sql(`select rendered_hash from msg_outbox where id = '${r.outboxId}'`), inbox: shown.length === 1 });
    }
    return { want: want?.subject ?? null, out };
  };
  const wA = await wordsOf(nA, A), wB = await wordsOf(nB, B);
  ok("J-86 W5 (parts missing: PF-21c, the seeded \"platform.security_incident_notice\" template): the notices use the published Security incident notice (Sample wording; Unconfirmed: no counsel)",
    tpl[0]?.key === "platform.security_incident_notice" && /security incident notice/i.test(tpl[0]?.subject ?? ""), { tplId: tplId ?? null, key: tpl[0]?.key ?? null });
  ok("J-86 W5 (parts missing: PF-21c): each recipient's stored words are exactly the notice filled for its firm (firm name, discovery time, description, categories, containment, breach reference), the file matching rendered_hash",
    wA.out.length === 2 && wB.out.length === 1 && [...wA.out, ...wB.out].every((x) => x.exact && x.hashOk), { wA, wB });
  ok("J-86 W5 (parts missing: PF-21c): the copy's demo inbox shows each recipient the same subject and body, once", [...wA.out, ...wB.out].length === 3 && [...wA.out, ...wB.out].every((x) => x.inbox), { wA: wA.out.map((x) => x.inbox), wB: wB.out.map((x) => x.inbox) });
  const eA = expected(A), eB = expected(B);
  ok("J-86 W5 (parts missing: PF-21c): one firm's words never name the other firm", !!eA && !!eB && eA.text.includes(A.name) && !eA.text.includes(B.name) && eB.text.includes(B.name) && !eB.text.includes(A.name));

  // ---------------------------------------------------------------------------------------------- W6 (screen) the breach's page
  const page6 = id ? await consolePage(`/system/privacy/breaches/${id}`) : "";
  const sendA = id ? await p.getByRole("button", { name: new RegExp(`(send|notify).*${A.name}`, "i") }).count() : -1;
  // The notice's time is read from the page's <time datetime> cells (aligned by qa 8, 24 Nov, PF-21rs concept r2 §8 M3,
  // #3492): the console prints "24 Nov 2026" inside <time datetime>, so the machine-readable attribute decides, the same
  // instant or the same day; the printed day is the fallback. Never a class or a position.
  const times6 = id ? await p.locator("time[datetime]").evaluateAll((els) => els.map((e) => e.getAttribute("datetime") ?? "")) : [];
  const timeShown = (t: string | null) => !!t && (times6.some((d) => d === t.slice(0, 10) || (!Number.isNaN(Date.parse(d)) && d.length > 10 && Math.abs(Date.parse(d) - Date.parse(t)) < 60_000))
    || [t.slice(0, 10), new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })].some((d) => page6.includes(d)));
  ok("J-86 W6 (parts missing: PF-21rs; the words need QA-757): the breach's page in our console shows the assessment and lists firm A's and firm B's notices, each with its time and the notice's subject; firm C is not listed",
    !!id && page6.includes(rec.description) && page6.includes(decision.decisionReason) && page6.includes(A.name) && page6.includes(B.name) && !page6.includes(C.name) && timeShown(timeA.sentAt) && !!eA && page6.includes(eA.subject),
    page6.slice(0, 240) || "no breach to open (PF-21c)");
  ok("J-86 W6 (parts missing: PF-21rs): no second send is offered to a notified firm", !!id && /notice|notified/i.test(page6) && sendA === 0, { sendA });
  if (id) await shot(p, "W6-console-breach-notices");

  // ---------------------------------------------------------------------------------------------- W7 one firm's notice never shows another firm
  const fctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  const fp = await fctx.newPage(); fp.on("pageerror", (e) => errors.push(String(e)));
  await fp.goto(`${BASE}/platform/activity-log`); await fp.waitForLoadState("networkidle").catch(() => undefined);
  if (await fp.getByLabel("Firm key").count()) { await fp.getByLabel("Firm key").fill(A.key); await fp.getByLabel("Work email").fill(aOwner.email); await fp.getByRole("button", { name: "Sign in" }).click(); }
  await fp.waitForLoadState("networkidle").catch(() => undefined); await wait(1200);
  const logA = (await fp.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("J-86 W7 (parts missing: PF-21c): firm A's Owner sees ExpatReady's Security incident notice line in the firm's Activity log", /Security incident notice/.test(logA), logA.slice(0, 240));
  await shot(fp, "W7-firm-a-activity-log"); await fctx.close();
  type Line = { action: string; advanced?: { entityKey?: string } };
  const range = `from=${new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)}&to=${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}`;
  const linesOf = async (tok?: string) => { const r = await j("GET", `/api/platform/audit?${range}`, undefined, tok); return { status: r.status, lines: (Array.isArray(r.body?.lines) ? r.body.lines : []) as Line[] }; };
  // A fresh token for firm A: its Owner's sign-in on screen above ended the earlier session (401 seen on main).
  const la = await linesOf(await firmSignIn(A.key, aOwner.email)), lb = await linesOf(bTok);
  const notices = (l: Line[]) => l.filter((x) => x.action === "platform.breach.notice_sent").map((x) => x.advanced?.entityKey ?? "");
  ok("J-86 W7 (parts missing: PF-21c): each firm's activity log holds its own notice line only: firm A's names A's notice, firm B's names B's notice and never firm A's",
    la.status === 200 && lb.status === 200 && !!nA.body?.id && !!nB.body?.id && JSON.stringify(notices(la.lines)) === JSON.stringify([nA.body.id]) && JSON.stringify(notices(lb.lines)) === JSON.stringify([nB.body.id]),
    { a: [la.status, notices(la.lines)], b: [lb.status, notices(lb.lines)] });

  // ---------------------------------------------------------------------------------------------- W8 wrong role
  const before8 = sql(`select count(*) from plat_breach`), aTok8 = await firmSignIn(A.key, aOwner.email);
  const refused = [await j("GET", ROUTE, undefined, sampleTok), await j("GET", `${ROUTE}/${id ?? "00000000-0000-4000-8000-000000000000"}`, undefined, aTok8),
    await j("POST", ROUTE, { ...rec, reason: "Sample: a firm tries" }, sampleTok, { "idempotency-key": `j86-firm-${run}` }), await j("POST", `${ROUTE}/${id ?? "00000000-0000-4000-8000-000000000000"}/notices`, { reason: "x", firmId: C.id }, sampleTok)];
  ok("J-86 W8 (parts missing: PF-21c): a firm's own Owner gets 403 on our register: list, read (firm A's Owner on its own breach), record, notify (never 404: the routes exist and refuse); nothing recorded",
    refused.every((r) => r.status === 403) && sql(`select count(*) from plat_breach`) === before8 && !before8.startsWith("ERR"), { statuses: refused.map((r) => r.status), before8 });

  // ---------------------------------------------------------------------------------------------- W9 sizes, axe
  for (const width of [400, 1024, 1440]) {
    await p.setViewportSize({ width, height: 900 }); await consolePage("/system/privacy/breaches");
    const rendered = await onBreachesPage();
    const wide = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const serious = (await new AxeBuilder({ page: p }).withTags(TAGS).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} (${v.nodes.length})`);
    ok(`J-86 W9 (parts missing: PF-21rs): our console's Breaches page at ${width} px: rendered, no sideways scroll, axe 0 serious`, rendered && wide <= 1 && serious.length === 0, { rendered, wide, serious });
    if (width === 400) await shot(p, "W9-console-breaches-400");
  }
  ok("J-86: no page error during the walk", errors.length === 0, errors.slice(0, 5));

} catch (e) {
  ok("J-86: the walk ran to its end", false, String(e).slice(0, 500));
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
