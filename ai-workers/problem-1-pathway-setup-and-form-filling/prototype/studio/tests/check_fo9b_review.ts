// FO-9b part 2 (BACKLOG row FO-9b; brief design/lead-b-briefs/FO-9b.md "Part 2"; R1.29; P-574 (2); AG-2-16 §8,
// AG-2-78; concept screens/FO-9s/concept.md r3 BR-6, BR-7, BR-10, BR-11, M6-M8): the duplicate review list, the safe pair
// (fail-closed: case, document, money with tax treatment and trust payee), the merge by itself, and the routes with
// their keys, each Done-when line with a pass and a fail, on one scratch database dropped at the end. A Nest app is built
// from the merge feature beside PF-4's guard and the local sign-in stand-in. Every value is Sample. US$0, no model call.
//   tsx studio/tests/check_fo9b_review.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), NEW = "20261123030000_fo9b_review";
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo9br_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const psql = (args: string[]) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string) => psql(["-Atc", q]);
const sqlErr = (q: string) => { try { sql(q); return ""; } catch (e) { return String((e as { stderr?: string }).stderr ?? e); } };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
process.env.DATABASE_URL = URL_;
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { seedSampleFirmsFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { dutiesOf } = await import("../api/src/platform/identity/keys.ts");
const { EVERYONE_SEES_ALL, writeSetting } = await import("../api/src/platform/settings.ts");
const { auditEvent, platformAuditWorkspaceId } = await import("../api/src/platform/audit/audit-event.ts");
const { ConsentStore } = await import("../api/src/platform/messages/consent/consent-store.ts");
const { Leads } = await import("../api/src/front-office/sales/leads.ts");
const { ClientMoney } = await import("../api/src/client-money/port.ts");
const { mergeIfSafe, whyNotSafe, SYSTEM_ACTOR, CASE_SIDE_LINE } = await import("../api/src/front-office/duplicates/merge/review.ts");
const mergeFeature = (await import("../api/src/features/front-office-merge.ts")).default;
type Ctx = import("../api/src/platform/identity/keys.ts").StaffContext;

const apps: { close(): Promise<void> }[] = [];
try {
  // ------------------------------------------------------------------------------- the migration, right after it applies
  const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
  ok("FO-9b review setup: its stamp is later than every migration before it and unique", all.filter((d) => d < NEW).every((d) => d.slice(0, 14) < NEW.slice(0, 14)) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1);
  for (const d of all.filter((x) => x <= NEW)) psql(["-f", join(MIG, d, "migration.sql")]);
  ok("FO-9b review setup: fo_dup_review is walled (forced policy) and its trigger function runs as the wall reader",
    sql(`select relforcerowsecurity from pg_class where relname = 'fo_dup_review'`) === "t" && sql(`select pg_get_userbyid(proowner) from pg_proc where proname = 'fo_dup_review_no_delete'`) === "xr_wall_reader");
  for (const d of all.filter((x) => x > NEW)) psql(["-f", join(MIG, d, "migration.sql")]);

  const db = new Db();
  await seedSampleFirms(db);
  await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const sid = (actor: string) => sql(`select id from platform_staff where actor_id = '${actor}'`);
  const ctxOf = (actor: string): Ctx => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actor}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey: firmId === A ? "sample-firm" : "sample-solo", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const ws = await platformAuditWorkspaceId(db as never);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:fo9b", workspaceId: ws });
  const R = ctxOf("user-R"), O = ctxOf("user-O");
  ok("FO-9b review setup: R (Owner) holds agent/prospect:edit and agent/prospect:merge; O (Case Officer) holds edit, not merge",
    R.keys.includes("agent/prospect:merge") && R.keys.includes("agent/prospect:edit") && O.keys.includes("agent/prospect:edit") && !O.keys.includes("agent/prospect:merge"));
  const consent = new ConsentStore(auditEvent);
  const leads = new Leads(db, { audit: auditEvent, consent, publicOrigin: "http://localhost:4400" });
  const add = (ctx: Ctx, p: Record<string, unknown>) => leads.add(ctx, { requestId: randomUUID(), source: "Phone call", confirmedNew: true, ...p }) as Promise<{ id: string; person: { id: string } }>;
  const pairOf = (a: string, b: string) => sql(`select id from fo_dup_review where firm_id = '${A}' and low_id = least('${a}'::uuid, '${b}'::uuid) and high_id = greatest('${a}'::uuid, '${b}'::uuid)`);
  const ports = { audit: auditEvent, consent };
  const inTx = <T,>(fn: (tx: never) => Promise<T>) => db.$transaction((tx) => fn(tx as never));

  // ------------------------------------------------------------------------------- the database's rules
  const ins = (lo: string, hi: string, extra = "", vals = "") => `insert into fo_dup_review (firm_id, low_id, high_id, score, reasons${extra}) values ('${A}', '${lo}', '${hi}', 100, '[]'${vals})`;
  const [u1, u2, u3] = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"];
  ok("FO-9b review fail: a pair is never deleted or truncated; its ids are in order; MERGED names a merge record",
    /never removed/.test(sqlErr(`begin; ${ins(u1, u2)}; delete from fo_dup_review; commit;`)) && /never removed/.test(sqlErr(`truncate fo_dup_review`))
    && /fo_dup_review_order/.test(sqlErr(ins(u2, u1))) && /fo_dup_review_merged/.test(sqlErr(ins(u1, u3, ", status, decided_by, decided_at", ", 'MERGED', 'seed:fo9b', now()")))
    && /fo_dup_review_firm_id_low_id_high_id_key/.test(sqlErr(`begin; ${ins(u1, u2)}; ${ins(u1, u2)}; commit;`)));

  // ------------------------------------------------------------------------------- M8: pairs written at arrival
  const lena = await add(R, { givenNames: "Lena", familyName: "Park", email: "lena.park@example.org" });
  const lena2 = await add(R, { givenNames: "Lena", familyName: "Parks", email: "lena.park@example.org" });
  const L1 = lena.person.id, L2 = lena2.person.id, P1 = pairOf(L1, L2);
  ok("FO-9b M8 pass: a new person with the same email is on the review list once, OPEN, score 100 with the EMAIL reason",
    !!P1 && sql(`select status || ':' || score || ':' || (reasons @> '[{"key":"EMAIL"}]')::text from fo_dup_review where id = '${P1}'`) === "OPEN:100:true");
  const noor = await add(R, { givenNames: "Noor", familyName: "Haddad", email: "noor@example.org" });
  ok("FO-9b M8 fail: a person who matches no one makes no pair", sql(`select count(*) from fo_dup_review where '${noor.person.id}' in (low_id, high_id)`) === "0");

  // ------------------------------------------------------------------------------- DW7: the merge by itself
  ok("FO-9b DW7 pass: the two Lena records (leads only, exact email, no case, document or money) are a safe pair", JSON.stringify(await inTx((tx) => whyNotSafe(tx, A, [L1, L2], [{ key: "EMAIL" }]))) === "[]");
  const auto = await inTx((tx) => mergeIfSafe(tx, A, P1, ports)) as { mergeRef?: string };
  ok("FO-9b DW7 pass: a safe pair merges by itself once (the newer into the older), logged automatic, by system:fo-duplicates; the pair is MERGED",
    !!auto.mergeRef && sql(`select automatic || ':' || by || ':' || survivor_id || ':' || loser_id from fo_dup_merge where id = '${auto.mergeRef}'`) === `true:${SYSTEM_ACTOR}:${L1}:${L2}`
    && sql(`select status || ':' || merge_id from fo_dup_review where id = '${P1}'`) === `MERGED:${auto.mergeRef}` && sql(`select merged_into_id from fo_person where id = '${L2}'`) === L1, auto);
  const again = await inTx((tx) => mergeIfSafe(tx, A, P1, ports)) as { mergeRef?: string };
  ok("FO-9b DW7 fail: a second run merges nothing (one merge record for the pair)", !again.mergeRef && sql(`select count(*) from fo_dup_merge where loser_id = '${L2}' or survivor_id = '${L2}'`) === "1");

  // money: an invoice, a tax treatment, a trust payee; and a case
  const pairWith = async (tag: string, seed: (personId: string) => void) => {
    const a = await add(R, { givenNames: "Sam", familyName: `Money${tag}`, phone: `+1 416 555 01${tag}` });
    seed(a.person.id);
    const b = await add(R, { givenNames: "Sam", familyName: `Money${tag}x`, phone: `416 555 01${tag}` });
    return { a: a.person.id, b: b.person.id, pair: pairOf(a.person.id, b.person.id) };
  };
  const replica = (q: string) => sql(`set session_replication_role = replica; ${q}`);
  const inv = await pairWith("31", (p) => replica(`insert into money_invoice (id, firm_id, person_id, currency, due_date, created_by, updated_at) values (gen_random_uuid(), '${A}', '${p}', 'CAD', '2026-12-15', 'seed:fo9b', now())`));
  const tax = await pairWith("32", (p) => replica(`insert into money_party_tax_treatment (firm_id, person_id, treatment, updated_by) values ('${A}', '${p}', 'EXEMPT', 'seed:fo9b')`));
  const other = await add(R, { givenNames: "Pat", familyName: "Payer", email: "pat.payer@example.org" });
  const payeeErr = { e: "" };
  const payee = await pairWith("33", (p) => { payeeErr.e = sqlErr(`set session_replication_role = replica; insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, refund_method, refunded_on, payee_person_id, payee_reason, reason, created_by) values ('${A}', '${other.person.id}', 'REFUND_TO_CLIENT', -100, 'CAD', 1, 0, 'E_TRANSFER', current_date, '${p}', 'Refund paid to the client''s relative (Sample).', 'Refund (Sample).', 'seed:fo9b')`); });
  const real = new ClientMoney(db);
  ok("FO-9b money pass: hasMoney is true for a party with only a tax treatment row, and for one named only as a trust entry's payee",
    !payeeErr.e && await real.hasMoney(A, { personId: tax.a }) === true && await real.hasMoney(A, { personId: payee.a }) === true, payeeErr);
  ok("FO-9b money fail: hasMoney stays false for a party with none (and for another firm)", await real.hasMoney(A, { personId: noor.person.id }) === false && await real.hasMoney(B, { personId: tax.a }) === false);
  for (const [what, p] of [["an invoice", inv], ["a tax treatment row", tax], ["a trust payee", payee]] as const) {
    const r = await inTx((tx) => mergeIfSafe(tx, A, p.pair, ports)) as { refused?: string[] };
    ok(`FO-9b DW7 fail: a lead with ${what} is never merged by itself (refused MONEY) and stays OPEN on the review list`,
      !!p.pair && JSON.stringify(r.refused) === '["MONEY"]' && sql(`select status from fo_dup_review where id = '${p.pair}'`) === "OPEN" && sql(`select count(*) from fo_person where id in ('${p.a}', '${p.b}') and merged_into_id is null`) === "2", r);
  }
  const kim = await pairWith("34", (p) => sql(`insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, created_by) values (gen_random_uuid(), (select id from workspace order by created_at limit 1), 'sample-firm', '${A}', (select coalesce(max(client_number), 9000) + 1 from case_client where firm_key = 'sample-firm'), 'Kim Sample', 'PERSON', '${p}', 'seed:fo9b')`));
  const rk = await inTx((tx) => mergeIfSafe(tx, A, kim.pair, ports)) as { refused?: string[] };
  ok("FO-9b DW7 fail: a client with a case is never merged by itself (refused CASE)", JSON.stringify(rk.refused) === '["CASE"]' && sql(`select status from fo_dup_review where id = '${kim.pair}'`) === "OPEN", rk);
  const nameOnly = await add(R, { givenNames: "Noor", familyName: "Hadad", email: "noor.h@example.org" }), PN = pairOf(noor.person.id, nameOnly.person.id);
  const rn = await inTx((tx) => mergeIfSafe(tx, A, PN, ports)) as { refused?: string[] };
  ok("FO-9b DW7 fail: a similar name alone (no exact key) is listed, never merged by itself (refused NOT_EXACT)", !!PN && JSON.stringify(rn.refused) === '["NOT_EXACT"]', rn);

  // ------------------------------------------------------------------------------- the routes and their keys
  const local = new LocalIdentity("fo9b-review-signing-key-0123456789abcdef", () => Date.now());
  const token = (staffId: string) => local.issue(staffId, { authTimeMs: Date.now() - 60_000, secondStep: true });
  const ro = await db.platformStaff.create({ data: { firmId: A, email: "ro@fo9b.example.com", displayName: "Sample read only", actorId: "fo9b-ro", status: "ACTIVE" } });
  await db.platformRoleGrant.create({ data: { firmId: A, staffId: ro.id, role: "READ_ONLY" as never, grantedBy: "seed:fo9b" } });
  const tR = token(R.staffId), tO = token(O.staffId), tRO = token(ro.id), tS = token(sid("user-S"));
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: { now: () => Date.now() } }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard }, ...mergeFeature.providers];
  @Module({ controllers: mergeFeature.controllers as never[], providers: providers as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const BASE = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}/api/front-office`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = async (method: string, path: string, tok: string | null, body?: Record<string, unknown>): Promise<{ status: number; body: any }> => {
    const r = await fetch(`${BASE}/${path}`, { method, headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let b: unknown = text; try { b = JSON.parse(text); } catch { /* text */ }
    return { status: r.status, body: b };
  };

  const listR = await call("GET", "duplicates/review", tR);
  const ids = (listR.body?.items ?? []).map((i: { id: string }) => i.id);
  ok("FO-9b review pass: the Owner's list shows the open pairs with score, reasons and first seen; a merged pair is not on To review",
    listR.status === 200 && ids.includes(inv.pair) && ids.includes(PN) && !ids.includes(P1) && listR.body.openCount === ids.length && listR.body.items.every((i: { score: number; firstSeenAt: string }) => typeof i.score === "number" && !!i.firstSeenAt), listR);
  ok("FO-9b BR-7 pass: the case pair is listed with needsCaseSide; the others are not", listR.body.items.find((i: { id: string }) => i.id === kim.pair)?.needsCaseSide === true && listR.body.items.find((i: { id: string }) => i.id === inv.pair)?.needsCaseSide === false);
  const noSession = await call("GET", "duplicates/review", null), roList = await call("GET", "duplicates/review", tRO), roKeep = await call("POST", `duplicates/review/${PN}/keep-separate`, tRO, {});
  ok("FO-9b keys fail: no session 401; a member without agent/prospect:edit gets 403 on the list and on Keep separate", noSession.status === 401 && roList.status === 403 && roKeep.status === 403, [noSession.status, roList.status, roKeep.status]);
  const oMerge = await call("POST", `duplicates/review/${inv.pair}/merge`, tO, { survivorId: inv.a }), oPrev = await call("POST", `duplicates/review/${inv.pair}/preview`, tO, { survivorId: inv.a }), oUndo = await call("POST", `duplicates/merges/${auto.mergeRef}/undo`, tO, {});
  ok("FO-9b keys fail: a Case Officer without agent/prospect:merge gets 403 on preview, merge and Undo, and nothing merged", oMerge.status === 403 && oPrev.status === 403 && oUndo.status === 403 && sql(`select status from fo_dup_review where id = '${inv.pair}'`) === "OPEN", [oMerge.status, oPrev.status, oUndo.status]);

  // DW8: firms and visibility
  const sList = await call("GET", "duplicates/review", tS), sMerge = await call("POST", `duplicates/review/${inv.pair}/merge`, tS, { survivorId: inv.a }), sKeep = await call("POST", `duplicates/review/${inv.pair}/keep-separate`, tS, {});
  ok("FO-9b DW8 fail: firm B sees none of firm A's pairs and gets the one not-found on them", sList.status === 200 && (sList.body.items ?? []).length === 0 && sMerge.status === 404 && sKeep.status === 404, [sList.status, sMerge.status, sKeep.status]);
  const oOwn = await add(O, { givenNames: "Ola", familyName: "Own", email: "ola@example.org" }), oOther = await add(R, { givenNames: "Ola", familyName: "Own", email: "ola@example.org", ownerStaffId: R.staffId });
  const PO = pairOf(oOwn.person.id, oOther.person.id);
  const oList = await call("GET", "duplicates/review", tO), oKeep = await call("POST", `duplicates/review/${PO}/keep-separate`, tO, {});
  ok("FO-9b DW8 fail: a viewer who may open only one side never sees the pair (absent from the list, Keep separate 404)",
    !!PO && oList.status === 200 && !(oList.body.items ?? []).some((i: { id: string }) => i.id === PO) && oKeep.status === 404, { PO, o: oList.body?.items?.length, keep: oKeep.status });
  const both1 = await add(O, { givenNames: "Uma", familyName: "Own", email: "uma@example.org" }), both2 = await add(O, { givenNames: "Uma", familyName: "Owne", email: "uma@example.org" });
  const PB = pairOf(both1.person.id, both2.person.id);
  ok("FO-9b DW8 pass: the same Case Officer sees a pair whose two sides are both theirs", !!PB && (await call("GET", "duplicates/review", tO)).body.items.some((i: { id: string }) => i.id === PB));

  // guided merge, preview, Undo, the Merged tab
  const pv = await call("POST", `duplicates/review/${inv.pair}/preview`, tR, { survivorId: inv.a });
  ok("FO-9b preview pass: both values of every field, the default pick, what moves and each side's updatedAt", pv.status === 200 && pv.body.fields.length === 6 && pv.body.fields.every((f: { pick: string }) => ["SURVIVOR", "LOSER"].includes(f.pick)) && pv.body.moves.leads === 1 && !!pv.body.updatedAt.loser, pv);
  const pvBad = await call("POST", `duplicates/review/${inv.pair}/preview`, tR, { survivorId: noor.person.id });
  ok("FO-9b preview fail: a survivor outside the pair → 422 on survivorId", pvBad.status === 422 && !!pvBad.body.fields?.survivorId, pvBad);
  const gm = await call("POST", `duplicates/review/${inv.pair}/merge`, tR, { survivorId: inv.a, choices: { familyName: "LOSER" } });
  ok("FO-9b DW1 pass (guided): the chosen survivor stays, the loser's family name is kept as picked, the pair is MERGED by the staff member, not automatic",
    gm.status === 200 && sql(`select family_name from fo_person where id = '${inv.a}'`) === "Money31x" && sql(`select merged_into_id from fo_person where id = '${inv.b}'`) === inv.a
    && sql(`select status || ':' || decided_by from fo_dup_review where id = '${inv.pair}'`) === `MERGED:staff:${R.staffId}` && sql(`select automatic from fo_dup_merge where id = '${gm.body.mergeRef}'`) === "f", gm);
  const gm2 = await call("POST", `duplicates/review/${inv.pair}/merge`, tR, { survivorId: inv.a });
  ok("FO-9b merge fail: a decided pair → 409", gm2.status === 409, gm2);
  const ck = await call("POST", `duplicates/review/${kim.pair}/merge`, tR, { survivorId: kim.a });
  ok("FO-9b BR-7 fail: a client with a case is never merged here: 409 with the sentence, nothing changed", ck.status === 409 && ck.body.detail === CASE_SIDE_LINE && sql(`select count(*) from fo_person where id in ('${kim.a}', '${kim.b}') and merged_into_id is null`) === "2", ck);
  const bad = await call("POST", `duplicates/review/${PN}/merge`, tR, { survivorId: noor.person.id, extra: 1 }), notId = await call("POST", "duplicates/review/not-a-uuid/merge", tR, { survivorId: noor.person.id });
  ok("FO-9b input fail: an unknown field 422 (named); a path id that is not a uuid 404", bad.status === 422 && notId.status === 404, [bad.status, notId.status]);
  const mergedTab = await call("GET", "duplicates/review?status=MERGED", tR);
  ok("FO-9b review pass: a merged pair is listed under MERGED (its merged-away side seen through the survivor)", mergedTab.body.items?.some((i: { id: string; mergeRef: string }) => i.id === inv.pair && i.mergeRef === gm.body.mergeRef) && mergedTab.body.items?.some((i: { id: string; automatic: boolean }) => i.id === P1 && i.automatic), mergedTab);
  const merges = await call("GET", "duplicates/merges", tR);
  const mi = (merges.body?.items ?? []) as { id: string; automatic: boolean; undoneAt: string | null }[];
  ok("FO-9b M6 pass: the Merged tab lists the guided and the automatic merge, automatic marked", merges.status === 200 && mi.find((m) => m.id === gm.body.mergeRef)?.automatic === false && mi.find((m) => m.id === auto.mergeRef)?.automatic === true, merges);
  ok("FO-9b M6 fail: firm B's Merged tab is empty", ((await call("GET", "duplicates/merges", tS)).body.items ?? []).length === 0);
  const un = await call("POST", `duplicates/merges/${gm.body.mergeRef}/undo`, tR, {});
  ok("FO-9b BR-10 pass: Undo from the Merged tab restores both people and the pair opens again", un.status === 200 && sql(`select count(*) from fo_person where id in ('${inv.a}', '${inv.b}') and merged_into_id is null`) === "2" && sql(`select status from fo_dup_review where id = '${inv.pair}'`) === "OPEN", un);
  const un2 = await call("POST", `duplicates/merges/${gm.body.mergeRef}/undo`, tR, {}), unS = await call("POST", `duplicates/merges/${auto.mergeRef}/undo`, tS, {});
  ok("FO-9b BR-10 fail: a second Undo → 409 with the reason; firm B's Undo of firm A's merge → 404", un2.status === 409 && /already undone/i.test(un2.body.detail ?? "") && unS.status === 404, [un2.status, unS.status]);

  // BR-11: Keep separate clears the possible-match flag
  const flagBefore = sql(`select count(*) from fo_lead where person_id in ('${both1.person.id}', '${both2.person.id}') and possible_match_person_id in ('${both1.person.id}', '${both2.person.id}')`);
  const keep = await call("POST", `duplicates/review/${PB}/keep-separate`, tO, {});
  ok("FO-9b BR-11 pass: Keep separate (a Case Officer with agent/prospect:edit) decides the pair and clears the possible-match flag between them",
    flagBefore === "1" && keep.status === 200 && sql(`select status from fo_dup_review where id = '${PB}'`) === "KEPT_SEPARATE" && sql(`select count(*) from fo_lead where person_id in ('${both1.person.id}', '${both2.person.id}') and possible_match_person_id in ('${both1.person.id}', '${both2.person.id}')`) === "0", { flagBefore, keep });
  const kept = await call("GET", "duplicates/review?status=KEPT_SEPARATE", tO), keep2 = await call("POST", `duplicates/review/${PB}/keep-separate`, tO, {});
  ok("FO-9b BR-11 fail: the pair leaves To review for Kept separate; a second Keep separate → 409", kept.body.items.some((i: { id: string }) => i.id === PB) && !(await call("GET", "duplicates/review", tO)).body.items.some((i: { id: string }) => i.id === PB) && keep2.status === 409, keep2);

  // DW8: no contact value in any audit line or event of these actions
  const lines = sql(`select coalesce(string_agg(coalesce(detail::text, '') || ' ' || coalesce(summary, ''), ' '), '') from audit_event where action in ('person.merged', 'person.unmerged', 'fo.duplicates.kept_separate')`)
    + sql(`select coalesce(string_agg(payload::text, ' '), '') from module_event where type in ('person.merged', 'person.unmerged')`);
  ok("FO-9b DW8 fail: no email or phone in any merge, Undo or Keep separate audit line or event", lines.length > 0 && !/@|\+1416|416 555/.test(lines), lines.slice(0, 300));
} finally {
  for (const a of apps) await a.close();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\nFO-9b review: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
