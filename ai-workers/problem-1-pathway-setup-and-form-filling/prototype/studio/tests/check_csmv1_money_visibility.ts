// CS-MV1 (Track B; brief design/briefs/track-b/CS-MV1.md; R1.56; AG-6-1 §8 C5): who may see an invoice, behind
// MoneyVisibilityPort. The row's six named cases, each with a pass and a fail:
//   DW1 a case officer on case X sees X (and so X's invoices), not case Y, nor a case whose team row has ended;
//   DW2 the case side's firm-wide rule (agent/case:view.all) never crosses firms;
//   DW3 a party with no case follows its prospect's own-versus-all (AG-2-64: view.all + "everyone sees all", else own);
//   DW4 the invoice keys alone (agent/invoice:list, :show) see nothing;
//   DW5 fakeMoneyVisibility and PgMoneyVisibility pass the port's contract;
//   DW6 FO-7q's DW9 cases with the adapter's scope: one case gives only that case's invoice; a party in scope reaches its
//       invoices with no case only, never a case's invoice of the same person; an empty scope gives nothing. FO-7q's
//       reads are on #3001 (not on main), so its C5 condition (`reads/visibility.ts` `scopeSql`, quoted below) is run
//       here as SQL on planted invoices; the real reads take this adapter in the one-line follow-up after #3001 merges.
// A scratch database (every migration; fixtures written with the replica role, as check_css1_search.ts does: a fixture
// needs no lead, stage or release). No network, no model call (US$0). Dropped at the end.
//   tsx studio/tests/check_csmv1_money_visibility.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeMoneyVisibility, type MoneyVisibility, type MoneyVisibilityPort } from "../ports/money-visibility.ts";
import { moneyVisibilityPortContract, type MoneyVisibilityHarness } from "../ports/contracts/money-visibility-port.contract.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { PgMoneyVisibility } from "../api/src/client-money/visibility-adapter.ts";
import { dutiesOf, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin", "/usr/local/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_csmv1_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const INVOICE_KEYS = ["agent/invoice:list", "agent/invoice:show"];

// ------------------------------------------------------------------------------ DW5 (fake): the contract, no database
const F_A = "00000000-0000-4000-8000-0000000000a1", F_B = "00000000-0000-4000-8000-0000000000b1";
const fctx = (firmId: string, keys: string[] = []): StaffContext => ({ staffId: randomUUID(), firmId, firmKey: "fake", roles: [], keys, duties: [], authTime: 0, via: "local" });
const fakeHarness = (): MoneyVisibilityHarness => {
  const port = fakeMoneyVisibility(), x = randomUUID(), y = randomUUID(), p = randomUUID(), q = randomUUID(), ob = randomUUID(), opb = randomUUID();
  const viewer = fctx(F_A), partyViewer = fctx(F_A), widest = fctx(F_A);
  port.grant(F_A, viewer.staffId, { cases: [x], parties: [] });
  port.grant(F_A, partyViewer.staffId, { cases: [], parties: [p] });
  port.grant(F_A, widest.staffId, { cases: [x, y], parties: [p, q] });
  port.grant(F_B, randomUUID(), { cases: [ob], parties: [opb] });
  return {
    port,
    async caseViewer() { return { ctx: viewer, seen: x, unseen: y }; },
    async partyViewer() { return { ctx: partyViewer, seen: p, unseen: q }; },
    async moneyKeysOnly() { return { ctx: fctx(F_A, INVOICE_KEYS) }; },
    async widestAndOtherFirm() { return { ctx: widest, otherCase: ob, otherParty: opb }; },
  };
};
await runContract(moneyVisibilityPortContract, "fakeMoneyVisibility", fakeHarness, ok);
{
  const f = fakeMoneyVisibility(), c = fctx(F_A), d = randomUUID();
  f.grant(F_A, c.staffId, { cases: [d, d], parties: [] });
  ok("CS-MV1 DW5 pass (fake): a grant answers its ids once each", JSON.stringify((await f.scopeOf(c)).cases) === JSON.stringify([d]));
  ok("CS-MV1 DW5 fail (fake): an ungranted person, and the same staff id in another firm, get nothing (fail closed)",
    JSON.stringify(await f.scopeOf(fctx(F_A))) === '{"cases":[],"parties":[]}' && JSON.stringify(await f.scopeOf({ ...c, firmId: F_B })) === '{"cases":[],"parties":[]}');
  let refused = false; try { f.grant(F_A, c.staffId, { cases: ["ALL"], parties: [] } as unknown as MoneyVisibility); } catch { refused = true; }
  ok("CS-MV1 DW5 fail (fake): \"ALL\" (or any non-uuid) is never a scope", refused);
}

// ------------------------------------------------------------------------------------------ the scratch database
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const firmId = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firmId("sample-firm"), B = firmId("sample-solo");
  const ctxOf = (actorId: string): StaffContext => {
    const [id, firm] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId: firm, firmKey: firm === A ? "sample-firm" : "sample-solo", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const without = (c: StaffContext, ...gone: string[]): StaffContext => ({ ...c, keys: c.keys.filter((k) => !gone.includes(k)) });
  const R = ctxOf("user-R"), O = ctxOf("user-O"), T = ctxOf("user-T"), S = ctxOf("user-S");
  const ownCases = (c: StaffContext) => without(c, "agent/case:view.all");
  ok("CS-MV1 setup: user-R, user-O and user-T are the Sample firm's staff, user-S the solo firm's; every seeded role holds agent/case:view.all and agent/prospect:view.all (PF-3's seed)",
    R.firmId === A && O.firmId === A && T.firmId === A && S.firmId === B && A !== B && [R, O, T, S].every((c) => c.keys.includes("agent/case:view.all") && c.keys.includes("agent/prospect:view.all")), { O: O.roles });

  // ---------------------------------------------------------------------------------------------- fixtures (Sample)
  const W = randomUUID();
  sql(`insert into workspace (id, key, label) values ('${W}', 'csmv1-${W.slice(0, 8)}', 'CS-MV1 (Sample)')`);
  let n = 0;
  const newCase = (firmKey: "sample-firm" | "sample-solo") => {
    const id = randomUUID(), client = randomUUID(), firm = firmKey === "sample-firm" ? A : B; n++;
    sql(`set session_replication_role = replica;
      insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, created_by) values ('${client}', '${W}', '${firmKey}', '${firm}', ${n}, 'Client ${n} (Sample)', 'PERSON', '${randomUUID()}', 'seed:CS-MV1');
      insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id, client_id, status)
        values ('${id}', '${W}', '${randomUUID()}', 'user-P', 'user-O', 'C-2026-${String(n).padStart(5, "0")}', '${firmKey}', '${firm}', '${client}', 'OPEN')`);
    return id;
  };
  const team = (caseId: string, userId: string, ended = false) => sql(`insert into case_team_member (id, workspace_id, case_id, user_id, role, assigned_by${ended ? ", ended_at, ended_by, end_reason" : ""})
    values ('${randomUUID()}', '${W}', '${caseId}', '${userId}', 'OFFICER', 'user-R'${ended ? ", now(), 'user-R', 'Sample'" : ""})`);
  const person = (firm: string) => { const id = randomUUID(); sql(`set session_replication_role = replica; insert into fo_person (id, firm_id, given_names, family_name, created_by, updated_at) values ('${id}', '${firm}', 'Sample', 'Party', 'seed:CS-MV1', now())`); return id; };
  const company = (firm: string) => { const id = randomUUID(); sql(`set session_replication_role = replica; insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${id}', '${firm}', 'Sample Co ${id.slice(0, 4)}', 'sample co ${id.slice(0, 4)}', 'seed:CS-MV1', now())`); return id; };
  let pn = 0;
  const prospect = (firm: string, owner: string | null, subject: { person?: string; company?: string }) => sql(`set session_replication_role = replica;
    insert into fo_prospect (id, firm_id, number, lead_id, type, stage_id, subject_person_id, subject_company_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    values ('${randomUUID()}', '${firm}', 'P-${String(++pn).padStart(5, "0")}', '${randomUUID()}', '${subject.company ? "CORPORATE" : "INDIVIDUAL"}', '${randomUUID()}', ${subject.person ? `'${subject.person}'` : "null"}, ${subject.company ? `'${subject.company}'` : "null"}, '${subject.person ?? randomUUID()}', ${owner ? `'${owner}'` : "null"}, 'seed:CS-MV1', now())`);
  const everyoneSeesAll = (firm: string, on: boolean) => sql(`delete from platform_firm_setting where firm_id = '${firm}' and key = 'platform.everyone_sees_all';
    insert into platform_firm_setting (firm_id, key, value, changed_by) values ('${firm}', 'platform.everyone_sees_all', '${on}'::jsonb, 'seed:CS-MV1')`);

  // Firm A: X (user-O on its team), Y (no team for O), Z (O's team row ended); firm B: W1. Parties: P1 (O's prospect),
  // P2 (R's prospect), C1 (a company prospect of O's), P3 (an unassigned prospect); firm B: PB (S's prospect).
  const X = newCase("sample-firm"), Y = newCase("sample-firm"), Z = newCase("sample-firm"), W1 = newCase("sample-solo");
  team(X, "user-O"); team(Z, "user-O", true); team(Y, "user-T");
  const P1 = person(A), P2 = person(A), P3 = person(A), C1 = company(A), PB = person(B);
  prospect(A, O.staffId, { person: P1 }); prospect(A, R.staffId, { person: P2 }); prospect(A, O.staffId, { company: C1 }); prospect(A, null, { person: P3 });
  prospect(B, S.staffId, { person: PB });
  const port: MoneyVisibilityPort = new PgMoneyVisibility(db);

  // ------------------------------------------------------------------------- DW1: the case officer's own cases
  const o = await port.scopeOf(ownCases(O));
  ok("CS-MV1 DW1 pass: with agent/case:view.own (view.all removed) user-O's cases are exactly X, the case they are on the team of", o.cases.length === 1 && o.cases[0] === X, { cases: o.cases, X });
  ok("CS-MV1 DW1 fail: Y (someone else's team) and Z (user-O's team row ended) are not in user-O's cases", !o.cases.includes(Y) && !o.cases.includes(Z), o.cases);
  const t = await port.scopeOf(ownCases(T));
  ok("CS-MV1 DW1 pass: user-T, on Y's team, sees Y and not X", t.cases.includes(Y) && !t.cases.includes(X), t.cases);

  // ------------------------------------------------------------------- DW2: the firm-wide rule stays in its firm
  const r = await port.scopeOf(R);
  ok("CS-MV1 DW2 pass: agent/case:view.all gives every case of the firm (X, Y, Z)", [X, Y, Z].every((c) => r.cases.includes(c)), r.cases);
  ok("CS-MV1 DW2 fail: firm B's case and party never appear in firm A's widest scope", !r.cases.includes(W1) && !r.parties.includes(PB), r);
  const s = await port.scopeOf(S);
  ok("CS-MV1 DW2 fail: and firm A's never in firm B's", ![X, Y, Z].some((c) => s.cases.includes(c)) && ![P1, P2, P3, C1].some((p) => s.parties.includes(p)) && s.cases.includes(W1) && s.parties.includes(PB), s);
  const forged = await port.scopeOf({ ...R, staffId: S.staffId });
  ok("CS-MV1 DW2 fail: a staff id of firm B under firm A's session is no member of A: no case and no party at all", forged.cases.length === 0 && forged.parties.length === 0, forged);
  const notStaff = await port.scopeOf({ ...without(R, "agent/prospect:view.all"), staffId: "not-a-staff-id" });
  ok("CS-MV1 DW2 fail: a staff id that is no uuid gets nothing (never a thrown query)", notStaff.cases.length === 0 && notStaff.parties.length === 0, notStaff);

  // ----------------------------------------------------------- DW3: a party with no case follows its prospect's rule
  everyoneSeesAll(A, true);
  const onAll = await port.scopeOf(O);
  ok("CS-MV1 DW3 pass: \"everyone sees all\" on + agent/prospect:view.all → every prospect's subject (P1, P2, P3, C1)", [P1, P2, P3, C1].every((p) => onAll.parties.includes(p)), onAll.parties);
  everyoneSeesAll(A, false);
  const off = await port.scopeOf(O);
  ok("CS-MV1 DW3 pass: \"everyone sees all\" off → user-O's own prospects' subjects only (P1 and company C1)", off.parties.length === 2 && off.parties.includes(P1) && off.parties.includes(C1), off.parties);
  ok("CS-MV1 DW3 fail: off → R's prospect (P2) and the unassigned one (P3) are not user-O's", !off.parties.includes(P2) && !off.parties.includes(P3), off.parties);
  everyoneSeesAll(A, true);
  const ownProspects = await port.scopeOf(without(O, "agent/prospect:view.all"));
  ok("CS-MV1 DW3 fail: on, but without agent/prospect:view.all → own only (both are needed, AG-2-64)", ownProspects.parties.length === 2 && !ownProspects.parties.includes(P2), ownProspects.parties);

  // ------------------------------------------------------------------------------- DW4: the money keys alone
  const money = await port.scopeOf({ ...O, keys: INVOICE_KEYS });
  ok("CS-MV1 DW4 pass: agent/invoice:list and :show alone → nothing, though user-O is on X's team and owns P1's prospect", money.cases.length === 0 && money.parties.length === 0, money);
  const caseOnly = await port.scopeOf({ ...O, keys: [...INVOICE_KEYS, "agent/case:view.own"] });
  ok("CS-MV1 DW4 fail: adding agent/case:view.own gives the case (X) but still no party (no prospect key)", caseOnly.cases.length === 1 && caseOnly.cases[0] === X && caseOnly.parties.length === 0, caseOnly);

  // ------------------------------------------------------------------------------ DW5 (adapter): the contract
  const pgHarness = (): MoneyVisibilityHarness => ({
    port,
    async caseViewer() { return { ctx: ownCases(O), seen: X, unseen: Y }; },
    async partyViewer() { everyoneSeesAll(A, false); return { ctx: O, seen: P1, unseen: P2 }; },
    async moneyKeysOnly() { return { ctx: { ...O, keys: INVOICE_KEYS } }; },
    async widestAndOtherFirm() { everyoneSeesAll(A, true); return { ctx: R, otherCase: W1, otherParty: PB }; },
  });
  await runContract(moneyVisibilityPortContract, "PgMoneyVisibility", pgHarness, ok);
  everyoneSeesAll(A, false);

  // ------------------------------------------------------------- DW6: FO-7q's DW9 cases with the adapter's scope
  // FO-7q's C5 condition, word for word from #3001's reads/visibility.ts scopeSql (the app's list filter).
  const inv = (caseId: string | null, personId: string) => { const id = randomUUID(); sql(`set session_replication_role = replica; insert into money_invoice (id, firm_id, case_id, person_id, created_by, updated_at) values ('${id}', '${A}', ${caseId ? `'${caseId}'` : "null"}, '${personId}', 'seed:CS-MV1', now())`); return id; };
  const onX = inv(X, P2), onY = inv(Y, P1), noCaseP1 = inv(null, P1), noCaseP2 = inv(null, P2);
  const visible = (sc: MoneyVisibility) => {
    if (!sc.cases.length && !sc.parties.length) return [];
    const arr = (xs: string[]) => `array[${xs.map((x) => `'${x}'`).join(",") || "null"}]::uuid[]`;
    return sql(`select id from money_invoice i where i.firm_id = '${A}' and (i.case_id = any(${arr(sc.cases)}) or (i.case_id is null and coalesce(i.person_id, i.company_id) = any(${arr(sc.parties)})))`).split("\n").filter(Boolean);
  };
  const mine = visible(await port.scopeOf(ownCases(O)));
  ok("CS-MV1 DW6 pass (FO-7q DW9): user-O (own cases, own prospects) sees X's invoice and P1's invoice with no case", mine.includes(onX) && mine.includes(noCaseP1), { mine, onX, noCaseP1 });
  ok("CS-MV1 DW6 fail (FO-7q DW9): Y's invoice (another officer's case) is not seen, even billed to user-O's party P1; P2's invoice with no case is not seen",
    !mine.includes(onY) && !mine.includes(noCaseP2), { mine, onY, noCaseP2 });
  ok("CS-MV1 DW6 fail (FO-7q DW9): the money keys alone see no invoice at all", visible(await port.scopeOf({ ...O, keys: INVOICE_KEYS })).length === 0);
} finally {
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); } catch { /* the database may not exist */ }
}

console.log(`\nCS-MV1: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
