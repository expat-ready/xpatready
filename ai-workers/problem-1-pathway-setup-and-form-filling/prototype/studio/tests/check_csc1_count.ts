// CS-C1b (map row 77; brief design/build-lead-c-briefs/CS-C1b.md, spec design/briefs/CS-C1b.md): the active-case count
// (CaseCountPort, api/src/case-count.ts) and the plan-limit check at opening (Runtime.createCase; EntitlementPort,
// ports/entitlement.ts). Named cases CS-C1 DW9-DW14, each a pass and a fail. Needs an isolated copy: the configured
// checkpoint gives a released, startable combination (Visitor visa, single) to open cases on. The openings with a test
// plan limit go through an in-process app on the copy's own database (the same Runtime and RuntimeController, only its
// EntitlementPort bound to the test's limits, and to the allow-all fake explicitly between them: PF-15c's Runtime has no
// default; the copy's own server reads the Sample plans through PgEntitlements). Count fixtures are SQL
// cases in this check's own workspace (a case, a CURRENT stage, a group, filings, C8.2's filing_record), moved by
// CS-C1a's CaseClose service (decision, withdrawal, close, reopen). No browser, no model call (US$0).
//   zsh studio/tools/isolated.sh csc1b_count 4578 start && tsx studio/tests/check_csc1_count.ts 4578 xr_studio_csc1b_count
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import { client, recorder } from "./runtime/api.ts";

const PORT = Number(process.argv[2] ?? 4578), DBN = process.argv[3] ?? "xr_studio_csc1b_count";
process.env.DATABASE_URL = `postgresql://xr_studio@127.0.0.1:54329/${DBN}`;
const { call, sql } = client(PORT, DBN);
const { ok, summary } = recorder();

const comboId = (key: string) => sql(`select c.id from combination c where c.combination_key='${key}' and exists (select 1 from config_release r where r.combination_id=c.id)`);
if (!comboId("vv.single")) { const l = await call("POST", "/demo/load", { sample: "configured" }, "user-A"); if (l.status >= 300) { console.error("STOP  the configured checkpoint did not load", l.status); process.exit(2); } }
const VV = comboId("vv.single")!;

const { Db, Workspace, Audit } = await import("../api/src/core.ts");
const { Programs } = await import("../api/src/programs.ts");
const { Runtime, RuntimeController } = await import("../api/src/runtime.ts");
const { FO_PERSON_PORT } = await import("../ports/fo-person.ts");
const { foPersonPort } = await import("../api/src/front-office/people/fo-person-port.ts");   // CS-K1 part 2: an opening links its client
const { CaseClose } = await import("../api/src/case-close.ts");
const { PgCaseCount } = await import("../api/src/case-count.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { fakeCaseCount } = await import("../ports/case-count.ts");
const { fakeEntitlements } = await import("../ports/entitlement.ts");
const { caseCountPortContract } = await import("../ports/contracts/case-count-port.contract.ts");
const { runContract } = await import("../ports/contracts/contract.ts");
type EntitlementPort = import("../ports/entitlement.ts").EntitlementPort;
type Harness = import("../ports/contracts/case-count-port.contract.ts").CaseCountHarness;

// Programs' only use in Runtime is the startable check (S4); its own providers (Studio, the library) are not this check's.
// The copy's own server opens a case on the same combination below, so it is startable; the stand-in says so.
@Module({ controllers: [RuntimeController], providers: [Db, Workspace, Audit, { provide: Programs, useValue: { startableMissing: async () => [] } }, Runtime, { provide: FO_PERSON_PORT, useValue: foPersonPort }] }) class CountApp {}
const app = await NestFactory.create(CountApp, { logger: false, abortOnError: false });
await app.listen(0, "127.0.0.1");
const BASE = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}/api`;
const runtime = app.get(Runtime), db = app.get(Db);
runtime.useEntitlements(fakeEntitlements());   // PF-15c: bound explicitly (this app loads no features/platform-entitlements.ts)
type Res = { status: number; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any -- responses read loosely, as in the other checks
const local = async (method: string, path: string, body: unknown, actor: string): Promise<Res> => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", "x-actor": actor }, body: JSON.stringify(body) });
  const t = await r.text(); let j: unknown = t; try { j = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body: j };
};

/** A test plan: a limit per firm key and metric; every call is kept. */
const plan = (limits: Record<string, Partial<Record<string, number>>>) => {
  const asked: { firm: string; metric: string; used: number | undefined }[] = [];
  const port: EntitlementPort = { async check(firm, metric, used) {
    asked.push({ firm, metric, used });
    const limit = limits[firm]?.[metric];
    return limit === undefined || used === undefined || used < limit ? { allowed: true } : { allowed: false, metric, limit, used };
  } };
  return { port, asked };
};

try {
  await seedSampleFirms(db);
  const FA = sql(`select id from platform_firm where key = 'sample-firm'`)!, FB = sql(`select id from platform_firm where key = 'sample-solo'`)!;
  const firmA = await call("GET", "/runtime/firm", undefined, "user-O");
  const rep = (firmA.body?.users ?? []).find((u: { duties: string[] }) => u.duties.includes("representative"))?.id;
  const viaCopy = await call("POST", "/runtime/cases", { combinationId: VV, clientActor: "user-P", principal: { displayName: "Sample Client N" }, ...(rep ? { representative: rep, caseOfficers: ["user-O"] } : {}) }, "user-O");
  ok("setup: the configured checkpoint (the copy's own server opens a case on it: startable), both Sample firms on the platform, the in-process app on the copy's database", !!VV && !!FA && !!FB && !!BASE && viaCopy.status === 201, { VV, FA, FB, copy: [viaCopy.status, viaCopy.body?.detail] });

  // Fixtures: this check's own workspace, an INDIVIDUAL, a CORPORATE and a family (no client type) pathway.
  const W = randomUUID(), tag = Date.now().toString(36);
  sql(`insert into workspace (id, key, label) values ('${W}', 'csc1b-${tag}', 'CS-C1b check')`);
  const combo = (type: string | null) => {
    const pw = randomUUID(), pr = randomUUID(), c = randomUUID(), k = `csc1b-${tag}-${(type ?? "family").toLowerCase()}`;
    sql(`set session_replication_role = replica;
      insert into program_def (id, workspace_id, program_node_key, node_kind, label, client_type, created_by) values ('${pw}', '${W}', '${k}-pw', 'PATHWAY', 'Sample ${type ?? "family"}', ${type ? `'${type}'` : "null"}, 'seed'), ('${pr}', '${W}', '${k}-pr', 'PROGRAM', 'Sample program', null, 'seed');
      update program_def set parent_node_key = '${k}-pw' where id = '${pr}';
      insert into combination (id, workspace_id, program_def_id, combination_key, label, participants, created_by) values ('${c}', '${W}', '${pr}', '${k}', 'Sample', '[]', 'seed')`);
    return { id: c, key: k };
  };
  const IND = combo("INDIVIDUAL"), CORP = combo("CORPORATE"), FAM = combo(null);
  let n = 0;
  /** A case with its CURRENT stage, one group and `filings` filings, every one recorded as submitted (C8.2). */
  const newCase = (o: { firmKey?: string; filings?: number; cmb?: { id: string; key: string } } = {}) => {
    const id = randomUUID(), stage = randomUUID(), group = randomUUID(), cmb = o.cmb ?? IND, firmKey = o.firmKey ?? "sample-firm";
    const filings = Array.from({ length: o.filings ?? 1 }, () => randomUUID());
    sql(`set session_replication_role = replica;
      insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key) values ('${id}', '${W}', '${cmb.id}', 'user-P', 'user-O', 'C-1999-${String(++n).padStart(5, "0")}', '${firmKey}');
      insert into case_stage (id, workspace_id, case_id, firm_key, ord, stage_key, staff_name, client_name, combination_id, state, application_subject_id, started_from) values ('${stage}', '${W}', '${id}', '${firmKey}', 1, 'only', 'Application', 'Application', '${cmb.id}', 'CURRENT', '${randomUUID()}', 'BEGIN');
      insert into submission_group (id, workspace_id, case_id, kind, stage_id) values ('${group}', '${W}', '${id}', 'FAMILY', '${stage}');
      ${filings.map((f) => `insert into filing (id, workspace_id, case_id, submission_group_id, subject_id, combination_key, mode, stage_id) values ('${f}', '${W}', '${id}', '${group}', '${randomUUID()}', '${cmb.key}', 'files_own', '${stage}');`).join("\n")}
      insert into filing_record (id, workspace_id, case_id, filing_id, submission_group_id, our_reference, submitted_on, application_number, prepared_by, recorded_by, filed_facts)
        select gen_random_uuid(), workspace_id, case_id, id, submission_group_id, 'SAMPLE-REF', current_date, 'V3000' || substr(md5(id::text), 1, 5), 'user-O', 'user-O', '[]' from filing where case_id = '${id}'`);
    return { id, filings, firmKey, stage };
  };
  const closer = new CaseClose(db);
  const ctxOf = (firmKey: string) => ({ staffId: `csc1b-${firmKey}`, firmId: firmKey === "sample-solo" ? FB : FA, firmKey, roles: ["OWNER"], keys: [], duties: [], authTime: Date.now(), via: "local" as const });
  const decide = (c: { id: string; firmKey: string }, filingId: string) => closer.decide(ctxOf(c.firmKey), c.id, { filingId, outcome: "APPROVED", decidedOn: "2027-03-03" });
  const withdraw = (c: { id: string; firmKey: string }) => closer.withdraw(ctxOf(c.firmKey), c.id, { reason: "The client stopped", withdrawnOn: "2027-03-04" });
  const close = (c: { id: string; firmKey: string }) => closer.close(ctxOf(c.firmKey), c.id, { reason: "Decision received" });
  const reopen = (c: { id: string; firmKey: string }) => closer.reopen(ctxOf(c.firmKey), c.id, { reason: "Late document" });
  const A = new PgCaseCount(db, "sample-firm"), B = new PgCaseCount(db, "sample-solo");

  // ------------------------------------------------------------------------------------------------ DW9: decisions
  const c9 = newCase({ filings: 2 });
  const a0 = await A.activeCounts();
  await decide(c9, c9.filings[0]);
  const a1 = await A.activeCounts();
  ok("CS-C1 DW9 fail: a case with one of two filings decided still counts (its count does not drop)", a1.individual === a0.individual && a1.corporate === a0.corporate, { a0, a1 });
  await decide(c9, c9.filings[1]);
  const a2 = await A.activeCounts();
  ok("CS-C1 DW9 pass: the count drops by one when every filing of the case has a decision", a2.individual === a0.individual - 1 && a2.corporate === a0.corporate, { a0, a2 });
  await close(c9);
  const a3 = await A.activeCounts();
  ok("CS-C1 DW9 fail: closing the decided case changes nothing more (after-decision work never counts)", a3.individual === a2.individual, { a2, a3 });
  await reopen(c9);
  const a4 = await A.activeCounts();
  ok("CS-C1 DW9 pass: reopening it counts it again (+1), though its old decisions stay", a4.individual === a0.individual && a4.corporate === a0.corporate, { a0, a4 });
  await decide(c9, c9.filings[0]);
  const a5 = await A.activeCounts();
  await decide(c9, c9.filings[1]);
  const a6 = await A.activeCounts();
  ok("CS-C1 DW9 pass: after the reopen it ends again only when every filing has a new decision (one new: still counts; both: -1)", a5.individual === a0.individual && a6.individual === a0.individual - 1, { a0, a5, a6 });

  // Breaker M3: a case on its next stage counts by that stage's filings; the ended stage's filings are history.
  const nextStage = (c: { id: string; stage: string }) => { const s2 = randomUUID();
    sql(`set session_replication_role = replica; update case_stage set state = 'ENDED_NEXT_STARTED' where id = '${c.stage}';
      insert into case_stage (id, workspace_id, case_id, firm_key, ord, stage_key, staff_name, client_name, combination_id, state, application_subject_id, started_from) select '${s2}', workspace_id, case_id, firm_key, 2, 'next', 'Next', 'Next', '${FAM.id}', 'CURRENT', '${randomUUID()}', 'BEGIN' from case_stage where id = '${c.stage}'`); return s2; };
  const cs = newCase({ filings: 1 }), cu = newCase({ filings: 2 });
  await decide(cs, cs.filings[0]); await decide(cu, cu.filings[0]);
  const m0 = await A.activeCounts();
  nextStage(cs); nextStage(cu);
  const m1 = await A.activeCounts();
  ok("CS-C1 DW9 pass (breaker M3): a decided case whose next stage has started counts again (its new stage has no decision)", m1.individual === m0.individual + 1, { m0, m1 });
  const csStage2 = sql(`select id from case_stage where case_id = '${cs.id}' and state = 'CURRENT'`)!, f2 = randomUUID();
  sql(`set session_replication_role = replica; insert into filing (id, workspace_id, case_id, submission_group_id, subject_id, combination_key, mode, stage_id) select '${f2}', workspace_id, case_id, submission_group_id, '${randomUUID()}', combination_key, mode, '${csStage2}' from filing where id = '${cs.filings[0]}';
    insert into filing_record (id, workspace_id, case_id, filing_id, submission_group_id, our_reference, submitted_on, application_number, prepared_by, recorded_by, filed_facts) select gen_random_uuid(), workspace_id, case_id, id, submission_group_id, 'SAMPLE-REF', current_date, 'V3001' || substr(md5(id::text), 1, 5), 'user-O', 'user-O', '[]' from filing where id = '${f2}'`);
  await decide(cs, f2);
  const m2 = await A.activeCounts();
  ok("CS-C1 DW9 fail (breaker M3): the ended stage's decided filing alone never ends the new stage: only a decision on the current stage's filing does (-1); the other case, on its new stage with no filing, still counts", m2.individual === m1.individual - 1, { m1, m2 });

  // ------------------------------------------------------------------------------------------------ DW10: the group
  const b0 = await A.activeCounts();
  newCase({ cmb: CORP });
  const b1 = await A.activeCounts();
  ok("CS-C1 DW10 pass: a case on a CORPORATE pathway counts as corporate (and not as individual)", b1.corporate === b0.corporate + 1 && b1.individual === b0.individual, { b0, b1 });
  newCase({ cmb: IND }); newCase({ cmb: FAM });
  const b2 = await A.activeCounts();
  ok("CS-C1 DW10 fail: an individual and a family case count as individual, never corporate", b2.individual === b1.individual + 2 && b2.corporate === b1.corporate, { b1, b2 });

  // ------------------------------------------------------------------------------------------------ DW14: withdrawal
  const c14 = newCase({ cmb: CORP });
  const d0 = await A.activeCounts();
  await withdraw(c14);
  const d1 = await A.activeCounts();
  ok("CS-C1 DW14 fail: a withdrawn case does not count", d1.corporate === d0.corporate - 1 && d1.individual === d0.individual, { d0, d1 });
  await reopen(c14);
  const d2 = await A.activeCounts();
  ok("CS-C1 DW14 pass: reopening the withdrawn case counts it again", d2.corporate === d0.corporate && d2.individual === d0.individual, { d0, d2 });

  // ------------------------------------------------------------------------------------------------ DW12: per firm
  const e0 = await B.activeCounts(), ea0 = await A.activeCounts();
  newCase({}); newCase({ cmb: CORP });
  const e1 = await B.activeCounts();
  ok("CS-C1 DW12 fail: firm A's new cases never reach firm B's count", e1.individual === e0.individual && e1.corporate === e0.corporate, { e0, e1 });
  const cb = newCase({ firmKey: "sample-solo" });
  const e2 = await B.activeCounts(), ea2 = await A.activeCounts();
  ok("CS-C1 DW12 pass: firm B's case counts in firm B's count only", e2.individual === e0.individual + 1 && ea2.individual === ea0.individual + 1 && ea2.corporate === ea0.corporate + 1, { e0, e2, ea0, ea2 });
  await decide(cb, cb.filings[0]);
  ok("CS-C1 DW12 pass: firm B's decision moves firm B's count, not firm A's", (await B.activeCounts()).individual === e0.individual && (await A.activeCounts()).individual === ea2.individual);

  // ------------------------------------------------------------------------------------------------ DW13: the contract
  const real = async (): Promise<Harness> => {
    const made = new Map<string, { id: string; firmKey: string; filings: string[]; ended?: "decided" | "withdrawn" }>();
    return {
      count: A, other: B,
      async open(group) { const c = newCase({ cmb: group === "corporate" ? CORP : group === "family" ? FAM : IND }); made.set(c.id, c); return c.id; },
      async end(id, how) { const c = made.get(id)!; if (how === "decided") for (const f of c.filings) await decide(c, f); else await withdraw(c); c.ended = how; },
      async reopen(id) { const c = made.get(id)!; if (c.ended === "decided") await close(c); await reopen(c); c.ended = undefined; },
      inTransaction: (fn) => db.$transaction((tx) => fn(tx)),
    };
  };
  const fakeHarness = (): Harness => {
    const mine = fakeCaseCount(), theirs = fakeCaseCount({ individual: 3, corporate: 1 });
    const cases = new Map<string, { group: "individual" | "corporate"; active: boolean }>();
    const sync = () => { const t = { individual: 0, corporate: 0 }; for (const c of cases.values()) if (c.active) t[c.group]++; mine.set(t); };
    return {
      count: mine, other: theirs,
      async open(group) { const id = randomUUID(); cases.set(id, { group: group === "corporate" ? "corporate" : "individual", active: true }); sync(); return id; },
      async end(id) { cases.get(id)!.active = false; sync(); },
      async reopen(id) { cases.get(id)!.active = true; sync(); },
      inTransaction: (fn) => fn(undefined),
    };
  };
  const rf = await runContract(caseCountPortContract, "fakeCaseCount", fakeHarness, ok);
  const rr = await runContract(caseCountPortContract, "PgCaseCount", real, ok);
  ok("CS-C1 DW13 pass: the fake and the real adapter pass the same contract", rf.failed.length === 0 && rr.failed.length === 0 && rf.passed.length === rr.passed.length && rr.passed.length > 0, [rf.failed, rr.failed]);
  const broken = { ...fakeHarness() }; const lying = fakeCaseCount({ individual: 9, corporate: 9 }); broken.count = lying; broken.other = lying;
  const rb = await runContract(caseCountPortContract, "brokenCount", () => broken, null);
  ok("CS-C1 DW13 fail: an adapter whose count ignores openings and endings fails the contract (its first two cases)", rb.failed.length === 2 && rb.failed.every((x) => /adds to individual|ends a case's count/.test(x)), rb.failed);

  // ------------------------------------------------------------------------------------------------ DW11: the check at opening
  const open = (actor = "user-O", extra: Record<string, unknown> = {}) => local("POST", "/runtime/cases", { combinationId: VV, clientActor: "user-P", principal: { displayName: "Sample Client N" }, ...(actor === "user-O" && rep ? { representative: rep, caseOfficers: ["user-O"] } : {}), ...extra }, actor);
  const caseNo = (r: Res) => Number(String(r.body?.case_number ?? "").slice(7));
  const opened = await open();
  ok("CS-C1 DW11 pass: with the allow-all fake (bound explicitly) opening behaves as today: 201 with a case number", opened.status === 201 && Number.isInteger(caseNo(opened)), [opened.status, opened.body?.detail]);
  const used = (await A.activeCounts()).individual, N = used + 1;
  const parties = () => Number(sql(`select count(*) from party`)), counter = () => sql(`select string_agg(firm_key || ':' || next_value, ',' order by firm_key) from firm_case_counter`);
  const p0 = parties();
  const t1 = plan({ "sample-firm": { active_individual_cases: N } });
  const was = runtime.useEntitlements(t1.port);
  const two = await Promise.all([open(), open()]);
  const won = two.filter((r) => r.status === 201), lost = two.filter((r) => r.status === 409);
  ok(`CS-C1 DW11 pass: at limit N=${N} with N−1 active, two openings in parallel → exactly one 201 (the Nth)`, won.length === 1 && caseNo(won[0]) === caseNo(opened) + 1, two.map((r) => [r.status, r.body?.code, r.body?.case_number]));
  ok("CS-C1 DW11 fail: the other parallel opening → 409 PLAN_LIMIT_REACHED with the metric and the limit", lost.length === 1 && lost[0].body?.code === "PLAN_LIMIT_REACHED" && lost[0].body?.metric === "active_individual_cases" && lost[0].body?.limit === N && lost[0].body?.used === N, lost.map((r) => r.body));
  const cnt0 = counter(), p1 = parties();
  const third = await open();
  ok("CS-C1 DW11 fail: with N active, one opening → 409 PLAN_LIMIT_REACHED", third.status === 409 && third.body?.code === "PLAN_LIMIT_REACHED" && third.body?.limit === N, [third.status, third.body]);
  ok("CS-C1 DW11 fail: the refused openings leave no case, no party and no case number (the counter and the party rows unchanged)", p1 === p0 + 1 && parties() === p1 && counter() === cnt0 && (await A.activeCounts()).individual === N, { p0, p1, now: parties(), cnt0, cnt: counter() });
  ok("CS-C1 DW11 pass: the check ran with the opener's firm key, the individual metric and the count read in the opening's transaction", t1.asked.length === 3 && t1.asked.every((x) => x.firm === "sample-firm" && x.metric === "active_individual_cases") && t1.asked.map((x) => x.used).sort((x, y) => (x ?? 0) - (y ?? 0)).join() === [N - 1, N, N].join(), t1.asked);
  // Ten openings at once from N−1 active (the breaker's case): one passes.
  const t10 = plan({ "sample-firm": { active_individual_cases: N + 1 } });
  runtime.useEntitlements(t10.port);
  const ten = await Promise.all(Array.from({ length: 10 }, () => open()));
  ok("CS-C1 DW11 pass: ten openings at once from N−1 active → one 201, nine 409 PLAN_LIMIT_REACHED", ten.filter((r) => r.status === 201).length === 1 && ten.filter((r) => r.status === 409 && r.body?.code === "PLAN_LIMIT_REACHED").length === 9, ten.map((r) => r.status));
  // Review M1: a retry with the same idempotency key at the same moment, from N−1 active, answers the one case made.
  const tk = plan({ "sample-firm": { active_individual_cases: (await A.activeCounts()).individual + 1 } });
  runtime.useEntitlements(tk.port);
  const key = `csc1b-retry-${tag}`, twins = await Promise.all([open("user-O", { idempotencyKey: key }), open("user-O", { idempotencyKey: key })]);
  ok("CS-C1 DW11 pass (review M1): two openings with the same idempotency key at once, one below the limit → both 201 with the same case (one created, one replayed), never a 409",
    twins.every((r) => r.status === 201) && twins[0].body?.id === twins[1].body?.id && twins.map((r) => r.body?.created).sort().join() === "false,true" && sql(`select count(*) from runtime_case where idempotency_key = '${key}'`) === "1", twins.map((r) => [r.status, r.body?.code, r.body?.created, r.body?.id]));
  const third2 = await open("user-O", { idempotencyKey: key }), fresh = await open();
  ok("CS-C1 DW11 fail (review M1): now full, the same key again still replays its case (201), while a new opening is refused (409)", third2.status === 201 && third2.body?.created === false && third2.body?.id === twins[0].body?.id && fresh.status === 409, [third2.status, fresh.status]);
  // A corporate opening is checked against the corporate metric (the group comes from the combination's Pathway). The
  // checkpoint releases no corporate combination, so for this one opening Visitor visa's chain hangs under a Sample
  // CORPORATE pathway in its own workspace (the node just under its Pathway re-parented), then is put back.
  const chain = sql(`with recursive up as (select p.*, 0 d from program_def p join combination x on x.program_def_id = p.id where x.id = '${VV}' union all select p.*, up.d + 1 from program_def p join up on p.workspace_id = up.workspace_id and p.program_node_key = up.parent_node_key) select string_agg(id || '|' || coalesce(parent_node_key, '') || '|' || node_kind || '|' || workspace_id, ',' order by d) from up`)!.split(",").map((r) => r.split("|"));
  const under = chain[chain.findIndex((r) => r[2] === "PATHWAY") - 1], corpKey = `csc1b-${tag}-corp-pw`;
  sql(`set session_replication_role = replica; insert into program_def (id, workspace_id, program_node_key, node_kind, label, client_type, created_by) values ('${randomUUID()}', '${under[3]}', '${corpKey}', 'PATHWAY', 'Sample corporate', 'CORPORATE', 'seed');
    update program_def set parent_node_key = '${corpKey}' where id = '${under[0]}'`);
  const tc = plan({ "sample-firm": { active_corporate_cases: (await A.activeCounts()).corporate } });
  runtime.useEntitlements(tc.port);
  const corp = await open();
  sql(`set session_replication_role = replica; update program_def set parent_node_key = '${under[1]}' where id = '${under[0]}'; delete from program_def where program_node_key = '${corpKey}'`);
  ok("CS-C1 DW11 fail: on a CORPORATE pathway the opening is checked against active_corporate_cases (full → 409)", corp.status === 409 && corp.body?.metric === "active_corporate_cases" && tc.asked[0]?.metric === "active_corporate_cases", [corp.status, corp.body, tc.asked]);
  // DW12 through the API: firm A full, firm B (the solo firm) still opens.
  const soloUsed = (await B.activeCounts()).individual;
  const tb = plan({ "sample-firm": { active_individual_cases: 0 }, "sample-solo": { active_individual_cases: soloUsed + 1 } });
  runtime.useEntitlements(tb.port);
  const [aFull, bOpen] = [await open(), await open("user-S")];
  ok("CS-C1 DW12 pass (API): firm A at its limit does not stop firm B: firm A 409, firm B 201 on its own count", aFull.status === 409 && bOpen.status === 201 && tb.asked.some((x) => x.firm === "sample-solo" && x.used === soloUsed) && tb.asked.some((x) => x.firm === "sample-firm"), [aFull.status, bOpen.status, bOpen.body?.detail, tb.asked]);
  runtime.useEntitlements(was);
  const after = await open();
  ok("CS-C1 DW11 pass: back on the allow-all fake, the next opening takes the next number with no gap", after.status === 201 && caseNo(after) === caseNo(won[0]) + 3, [after.status, after.body?.case_number, won[0].body?.case_number]);
  ok("CS-C1 DW11 fail: the allow-all fake refuses nothing, at any count", (await fakeEntitlements().check("sample-firm", "active_individual_cases", 1_000_000)).allowed === true && (await fakeEntitlements({ active_individual_cases: 2 }).check("sample-firm", "active_individual_cases", 2)).allowed === false);
} finally {
  await app.close().catch(() => undefined);
}
process.exit(summary() ? 1 : 0);
