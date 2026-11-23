// PF-15c (brief design/lead-b-briefs/PF-15.md "After part 2"; SA-3-4, SA-3-5, SA-3-39): the case limits bound in the
// running app. Runtime.createCase reads PgEntitlements (features/platform-entitlements.ts) in place of CS-C1b's
// allow-all fake. Every opening below goes through the copy's own server (POST /api/runtime/cases), not the adapter:
// DW1 the 11th active individual case on a 10-case plan is refused · DW2 a closed (withdrawn) case frees one · DW3 a firm with no
// live plan is refused with its sentence, never a 500 · DW4 an unbound Runtime fails loudly, never a silent allow-all.
// The plan is this check's own (a Sample plan with 10 individual cases) on sample-firm's live subscription, put back at
// the end. The case is withdrawn through CS-C1a's CaseClose on the copy's database. No browser, no model call (US$0).
//   zsh studio/tools/isolated.sh pf15c 4591 start && tsx studio/tests/check_pf15c_case_limits.ts 4591 xr_studio_pf15c
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { client, recorder } from "./runtime/api.ts";

const PORT = Number(process.argv[2] ?? 4591), DBN = process.argv[3] ?? "xr_studio_pf15c";
process.env.DATABASE_URL = `postgresql://xr_studio@127.0.0.1:54329/${DBN}`;
const { call, sql } = client(PORT, DBN);
const { ok, summary } = recorder();

const comboId = (key: string) => sql(`select c.id from combination c where c.combination_key='${key}' and exists (select 1 from config_release r where r.combination_id=c.id)`);
if (!comboId("vv.single")) { const l = await call("POST", "/demo/load", { sample: "configured" }, "user-A"); if (l.status >= 300) { console.error("STOP  the configured checkpoint did not load", l.status); process.exit(2); } }
const VV = comboId("vv.single")!;

const { Db } = await import("../api/src/core.ts");
const { CaseClose } = await import("../api/src/case-close.ts");
const { PgCaseCount } = await import("../api/src/case-count.ts");
const { Runtime } = await import("../api/src/runtime.ts");
const db = new Db();

const FA = sql(`select id from platform_firm where key = 'sample-firm'`);
const SUB = sql(`select id from platform_subscription where firm_id = '${FA}' and status <> 'ENDED'`);
const OLD_PLAN = sql(`select plan_id from platform_subscription where id = '${SUB}'`);
const PLAN = randomUUID(), tag = Date.now().toString(36);
const cases = () => Number(sql(`select count(*) from runtime_case where firm_key = 'sample-firm'`));
const active = async () => (await new PgCaseCount(db, "sample-firm").activeCounts()).individual;
const firm = await call("GET", "/runtime/firm", undefined, "user-O");
const rep = (firm.body?.users ?? []).find((u: { duties: string[] }) => u.duties.includes("representative"))?.id;
const open = () => call("POST", "/runtime/cases", { combinationId: VV, clientActor: "user-P", principal: { displayName: "Sample Client PF15c" }, ...(rep ? { representative: rep, caseOfficers: ["user-O"] } : {}) }, "user-O");

try {
  ok("setup: the copy has the Sample firms with a live subscription and the configured checkpoint (Visitor visa, an individual combination)", !!VV && !!FA && !!SUB && !!OLD_PLAN
    && sql(`select p.client_type from combination c join program_def r on r.id = c.program_def_id join program_def p on p.program_node_key = r.parent_node_key and p.workspace_id = r.workspace_id where c.id = '${VV}'`) !== "CORPORATE", { VV, FA, SUB });

  // This check's plan: 10 active individual cases (Sample), 10 corporate, storage Unlimited; sample-firm moves onto it.
  sql(`insert into platform_plan (id, code, name, seats_limit) values ('${PLAN}', 'pf15c-${tag}', 'Sample Ten', 50);
    insert into platform_plan_limit (plan_id, metric, limit_value) values ('${PLAN}', 'ACTIVE_INDIVIDUAL_CASES', 10), ('${PLAN}', 'ACTIVE_CORPORATE_CASES', 10), ('${PLAN}', 'STORAGE_MB', null);
    update platform_subscription set plan_id = '${PLAN}' where id = '${SUB}'`);
  const before = await active();
  if (before > 10) throw new Error(`the copy already has ${before} active individual cases on sample-firm (a fresh copy has none)`);
  const fill: number[] = [];
  for (let i = before; i < 10; i++) fill.push((await open()).status);
  ok(`DW1 pass: on the 10-case plan, openings up to the 10th are 201 through the running app (from ${before} active)`, fill.every((s) => s === 201) && await active() === 10, fill);

  const n0 = cases();
  const eleventh = await open();
  ok("DW1 fail: the 11th active individual case → 409 PLAN_LIMIT_REACHED with the metric, the limit, the usage and the upgrade path (SA-3-5)", eleventh.status === 409 && eleventh.body?.code === "PLAN_LIMIT_REACHED"
    && eleventh.body?.metric === "active_individual_cases" && eleventh.body?.limit === 10 && eleventh.body?.used === 10 && /plan allows 10 active individual cases/.test(eleventh.body?.detail ?? "") && /Settings, Billing/.test(eleventh.body?.upgradePath ?? "") && /choose a larger plan/.test(eleventh.body?.detail ?? ""), [eleventh.status, eleventh.body]);
  ok("DW1 fail: the refused opening wrote no case", cases() === n0, [n0, cases()]);

  // DW2: one case withdrawn (and so closed; a case with no decision cannot be closed otherwise, AG-7-34) stops counting, so the next opening passes, and the one after is refused again.
  const victim = sql(`select id from runtime_case where firm_key = 'sample-firm' order by created_at desc limit 1`);
  await new CaseClose(db).withdraw({ staffId: `pf15c-${tag}`, firmId: FA, firmKey: "sample-firm", roles: ["OWNER"], keys: [], duties: [], authTime: Date.now(), via: "local" }, victim, { reason: "Sample: PF-15c frees one", withdrawnOn: new Date().toISOString().slice(0, 10) });
  ok("DW2 pass: a closed (withdrawn) case frees one (9 active)", await active() === 9, await active());
  const freed = await open();
  ok("DW2 pass: with one freed, the next opening is 201", freed.status === 201, [freed.status, freed.body?.detail]);
  const full = await open();
  ok("DW2 fail: back at 10, the next is refused 409 again", full.status === 409 && full.body?.code === "PLAN_LIMIT_REACHED" && full.body?.used === 10, [full.status, full.body?.code]);

  // DW3: no live plan. The subscription ends; the opening is refused with its own sentence, nothing written, no 500.
  sql(`update platform_subscription set status = 'ENDED' where id = '${SUB}'`);
  const n3 = cases();
  const none = await open();
  ok("DW3 pass: a firm with no live plan → 409 PLAN_LIMIT_REACHED (never a 500) with the no-subscription sentence", none.status === 409 && none.body?.code === "PLAN_LIMIT_REACHED" && none.body?.limit === 0
    && /no live subscription, so no case can be opened/.test(none.body?.detail ?? ""), [none.status, none.body]);
  ok("DW3 fail: the refused opening wrote no case", cases() === n3, [n3, cases()]);
  sql(`update platform_subscription set status = 'ACTIVE' where id = '${SUB}'`);
  const back = await open();
  ok("DW3 fail: the sentence is only for no live plan: live again at 10 of 10, the refusal says the plan's limit", back.status === 409 && /plan allows 10/.test(back.body?.detail ?? "") && !/no live subscription/.test(back.body?.detail ?? ""), [back.status, back.body?.detail]);

  // DW4: a Runtime with nothing bound (an app without features/platform-entitlements.ts) refuses to guess.
  const bare = new Runtime(db, null as never, null as never, null as never, null as never) as unknown as { entitlements: (tx: unknown) => unknown };
  let threw = "";
  try { bare.entitlements(null); } catch (e) { threw = String((e as Error).message); }
  ok("DW4 fail: an unbound Runtime throws (no EntitlementPort bound), never a silent allow-all", /no EntitlementPort bound/.test(threw), threw);
} finally {
  sql(`update platform_subscription set status = 'ACTIVE', plan_id = '${OLD_PLAN}' where id = '${SUB}'`);
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
