// qa probe, R1.87 ("Every read of a firm's data by our staff writes who, when and why; the firm sees those lines; nobody
// can remove one"), after #3209 (AUD-3 part 1) merged. Written by qa 6 (24 Nov) to re-score the row on main: it walks
// the part that is on main, as a person would, through the API (no console page reads a firm's trail for our staff yet),
// and names the parts that are not (AUD-3 parts 2-3: our access report and our audit search; AUD-3b: support sessions).
//   P1 our Platform Owner opens firm A's health in our console (GET /api/system/firms/:id, @ReadsFirm): one OUR_STAFF
//      line lands on firm A's own trail, naming our staff member (ourstaff:<id>), and none on firm B's.
//   P2 firm A's Owner sees that line in the firm's Activity log with the "ExpatReady staff access" filter
//      (GET /api/platform/audit?ours=1, AUD-4s, R1.88); firm B's Owner sees no line of it.
//   P3 nobody can remove one: the database refuses a delete or change of the line from any user (trigger, AUD-1a).
//   P4 our firms list (@ReadsAcrossFirms) writes one cross_tenant.access line and nothing on any firm's trail.
//   P5 (parts missing) our side's access report GET /api/system/firms/:id/access-report and our audit search
//      GET /api/system/audit (AUD-3 parts 2-3); a support session POST /api/system/firms/:id/support-sessions (AUD-3b).
// Run from prototype/:
//   zsh studio/tools/isolated.sh r187 4478 start --ttl 30 PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh r187 4478 stop' EXIT && npx tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/probe_r187_firm_sees_our_read.ts r187 4478
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "r187", Number(process.argv[3] ?? 4478)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the journeys do
type Ans = { status: number; body: any };
const j = async (method: string, path: string, body?: unknown, token?: string, extra: Record<string, string> = {}): Promise<Ans> => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
};
const refused = (q: string) => { try { rawSql(q); return false; } catch { return true; } };

try {
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const emailOf = (actor: string) => sql(`select email from platform_staff where actor_id = '${actor}'`);
  const firmSignIn = async (firmKey: string, email: string) => {
    const r = await j("POST", "/api/platform/session/local", { firmKey, email, secondStep: true });
    if (!r.body?.token) { console.error(`STOP  local sign-in refused for ${email} (PLATFORM_IDENTITY=local): ${r.body?.detail}`); process.exit(2); }
    return r.body.token as string;
  };
  // Our Platform Owner (stand-in, SQL, as j_93 and j_86: PF-4s part 1 has no invite).
  const ourEmail = `ops.${run}@expatready.example.com`;
  const ourId = sql(`with s as (insert into plat_system_staff (id, email, display_name) values (gen_random_uuid(), '${ourEmail}', 'Platform Owner ${run} (Sample)') returning id)
    insert into plat_system_role_grant (id, staff_id, role_code) select gen_random_uuid(), id, 'platform-owner' from s returning staff_id`);
  const our = await j("POST", "/api/system/session/local", { email: ourEmail, secondStep: true });
  const ourTok = String(our.body?.token ?? "");
  ok("R1.87 setup: two Sample firms; our Platform Owner signs in to our console (system session)", !!A && !!B && fo.failed.length === 0 && !!ourTok, { status: our.status });

  // P1: our staff open firm A's health
  const count = (firm: string) => Number(sql(`select count(*) from audit_event where firm_id = '${firm}' and actor_type::text = 'OUR_STAFF'`));
  const a0 = count(A), b0 = count(B);
  const read = await j("GET", `/api/system/firms/${A}`, undefined, ourTok);
  const a1 = count(A), b1 = count(B);
  const line = sql(`select coalesce((select id::text || '|' || action || '|' || coalesce(actor, '') || '|' || coalesce(correlation_id::text, '') from audit_event where firm_id = '${A}' and actor_type::text = 'OUR_STAFF' and action = 'platform.system.firm_read' order by at desc limit 1), '')`);
  // Two lines, one correlation id: PF-12's bypass use (platform.bypass, "the bypass role is audited", row 87) and
  // AUD-3's platform.system.firm_read (the read itself); nothing on firm B's trail.
  const kinds = sql(`select string_agg(action, ',' order by action) from audit_event where firm_id = '${A}' and actor_type::text = 'OUR_STAFF'`);
  const oneCorr = sql(`select count(distinct correlation_id) from audit_event where firm_id = '${A}' and actor_type::text = 'OUR_STAFF'`) === "1";
  ok("R1.87 P1 (AUD-3 part 1, #3209, and PF-12's audited bypass, on main): our Platform Owner opens firm A's health (200); one platform.system.firm_read line and its platform.bypass line land on firm A's own trail under one correlation id, naming our staff member (ourstaff:<id>); none on firm B's",
    read.status === 200 && a1 === a0 + 2 && kinds === "platform.bypass,platform.system.firm_read" && oneCorr && b1 === b0 && line.includes(ourId), { read: read.status, a: [a0, a1], b: [b0, b1], kinds, line });
  console.log(`      the line: ${line}`);

  // P2: the firm sees the line; the other firm does not
  const tA = await firmSignIn("sample-firm", emailOf("user-R")), tB = await firmSignIn("sample-solo", emailOf("user-S"));
  const day = new Date(), from = new Date(day.getTime() - 3_600_000).toISOString(), to = new Date(day.getTime() + 3_600_000).toISOString();
  const lineId = line.split("|")[0];
  const seenA = await j("GET", `/api/platform/audit?ours=1&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, undefined, tA);
  const seenB = await j("GET", `/api/platform/audit?ours=1&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, undefined, tB);
  const txtA = JSON.stringify(seenA.body ?? ""), txtB = JSON.stringify(seenB.body ?? "");
  ok("R1.87 P2 (AUD-4s on main): firm A's Owner sees that line in the firm's Activity log under \"ExpatReady staff access\" (ours=1), naming ExpatReady staff; firm B's Owner does not see it",
    seenA.status === 200 && !!lineId && txtA.includes(lineId) && seenB.status === 200 && !txtB.includes(lineId), { a: seenA.status, b: seenB.status, aHas: txtA.includes(lineId), bHas: txtB.includes(lineId) });
  console.log(`      firm A's view of it: ${txtA.slice(Math.max(0, txtA.indexOf(lineId) - 40), txtA.indexOf(lineId) + 400)}`);
  // "why": the health read is not a @SystemReason route (a reason is asked only on changes, in the body), so the line
  // has who and when; the "why" of a read comes with a support session's reason or ticket (AUD-3b, not built).
  const detail = sql(`select coalesce(detail::text, '') from audit_event where id = '${lineId}'`);
  ok("R1.87 P2 (\"who, when and why\"; part missing: AUD-3b, the support session's reason): the read's line carries a reason for the read", /reason|ticket/i.test(detail), { detail: detail.slice(0, 300) });

  // P3: nobody can remove one (the app's own database user)
  ok("R1.87 P3 (AUD-1a, on main): the line cannot be deleted or changed: the test's database user (xr_studio) is refused, by the aud_event_no_change trigger, which refuses any user",
    refused(`delete from audit_event where id = '${lineId}'`) && refused(`update audit_event set action = 'x' where id = '${lineId}'`) && count(A) === a1);

  // P4: across firms
  const x0 = Number(sql(`select count(*) from audit_event where action = 'cross_tenant.access'`)), all0 = Number(sql(`select count(*) from audit_event where actor_type::text = 'OUR_STAFF' and firm_id is not null`));
  const list = await j("GET", "/api/system/firms", undefined, ourTok);
  const x1 = Number(sql(`select count(*) from audit_event where action = 'cross_tenant.access'`)), all1 = Number(sql(`select count(*) from audit_event where actor_type::text = 'OUR_STAFF' and firm_id is not null`));
  ok("R1.87 P4 (AUD-3 part 1, #3209): our firms list (200) writes one cross_tenant.access line and nothing on any firm's trail", list.status === 200 && x1 === x0 + 1 && all1 === all0, { list: list.status, x: [x0, x1], firmLines: [all0, all1] });

  // P5: the parts not on main
  const rep = await j("GET", `/api/system/firms/${A}/access-report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, undefined, ourTok);
  ok("R1.87 P5 (part missing: AUD-3 part 2): our side's access report for firm A answers (200, firm A's OUR_STAFF lines)", rep.status === 200, { status: rep.status });
  const search = await j("GET", `/api/system/audit?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, undefined, ourTok);
  ok("R1.87 P5 (part missing: AUD-3 part 3): our audit search answers (200)", search.status === 200, { status: search.status });
  const sess = await j("POST", `/api/system/firms/${A}/support-sessions`, { reason: "Sample: ticket 42" }, ourTok);
  ok("R1.87 P5 (part missing: AUD-3b): a support session into firm A can be started (201)", sess.status === 201, { status: sess.status });
} finally {
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
