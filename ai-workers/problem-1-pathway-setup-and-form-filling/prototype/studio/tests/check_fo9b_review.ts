// FO-9b part 2 (BACKLOG row FO-9b; brief design/lead-b-briefs/FO-9b.md "Part 2"; R1.29; P-574 (2); AG-2-16 §8,
// AG-2-78; concept screens/FO-9s/concept.md r3 BR-6, BR-7, BR-10, BR-11, M6-M8): the duplicate review list, the safe pair
// (fail-closed: case, document, money with tax treatment and trust payee), the merge by itself, and the routes with
// their keys, each Done-when line with a pass and a fail, on one scratch database dropped at the end. A Nest app is built
// from the merge feature beside PF-4's guard and the local sign-in stand-in. Every value is Sample. US$0, no model call.
//   tsx studio/tests/check_fo9b_review.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), NEW = "20261123170000_fo9b_review";
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
const { arrive } = await import("../api/src/front-office/sales/arrival.ts");
const { phone: salesPhone } = await import("../api/src/front-office/sales/common.ts");
const { ClientMoney } = await import("../api/src/client-money/port.ts");
const { mergeIfSafe, whyNotSafe, DuplicateReview, SYSTEM_ACTOR, CASE_SIDE_LINE, STALE_LINE, MONEY_LINE, MERGED_AWAY_LINE, NOT_LISTED_LINE } = await import("../api/src/front-office/duplicates/merge/review.ts");
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
  // Arrivals through the one arrival path (a web-form-like arrival, not Add a lead's "Add as new"), owned by `ctx`.
  const add = async (ctx: Ctx, p: { givenNames: string; familyName: string; email?: string; phone?: string; ownerStaffId?: string }) => {
    const out = await db.$transaction((tx) => arrive(tx as never, { firmId: ctx.firmId, door: "MANUAL", intakeKey: `manual:${randomUUID()}`, source: "Phone call", actor: `staff:${ctx.staffId}`, payloadHash: randomUUID(), ownerStaffId: p.ownerStaffId ?? ctx.staffId,
      person: { givenNames: p.givenNames, familyName: p.familyName, email: p.email ?? null, phone: p.phone ? salesPhone(p.phone) : null } }, ports));
    return { id: out.leadId!, person: { id: out.personId! } };
  };
  const pairOf = (a: string, b: string) => sql(`select id from fo_dup_review where firm_id = '${A}' and low_id = least('${a}'::uuid, '${b}'::uuid) and high_id = greatest('${a}'::uuid, '${b}'::uuid)`);
  const ports = { audit: auditEvent, consent };
  const inTx = <T,>(fn: (tx: never) => Promise<T>) => db.$transaction((tx) => fn(tx as never));
  const review = new DuplicateReview(db, ports);   // the list as a person sees it (pair-model.md)

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
  const BASE = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}/api`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = async (method: string, path: string, tok: string | null, body?: Record<string, unknown>): Promise<{ status: number; body: any }> => {
    const r = await fetch(`${BASE}${path}`, { method, headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let b: unknown = text; try { b = JSON.parse(text); } catch { /* text */ }
    return { status: r.status, body: b };
  };

  const listR = await call("GET", "/front-office/duplicates/review", tR);
  const ids = (listR.body?.items ?? []).map((i: { id: string }) => i.id);
  ok("FO-9b review pass: the Owner's list shows the open pairs with score, reasons and first seen; a merged pair is not on To review",
    listR.status === 200 && ids.includes(inv.pair) && ids.includes(PN) && !ids.includes(P1) && listR.body.openCount === ids.length && listR.body.items.every((i: { score: number; firstSeenAt: string }) => typeof i.score === "number" && !!i.firstSeenAt), listR);
  ok("FO-9b BR-7 pass: the case pair is listed with needsCaseSide; the others are not", listR.body.items.find((i: { id: string }) => i.id === kim.pair)?.needsCaseSide === true && listR.body.items.find((i: { id: string }) => i.id === inv.pair)?.needsCaseSide === false);
  const noSession = await call("GET", "/front-office/duplicates/review", null), roList = await call("GET", "/front-office/duplicates/review", tRO), roKeep = await call("POST", `/front-office/duplicates/review/${PN}/keep-separate`, tRO, {});
  ok("FO-9b keys fail: no session 401; a member without agent/prospect:edit gets 403 on the list and on Keep separate", noSession.status === 401 && roList.status === 403 && roKeep.status === 403, [noSession.status, roList.status, roKeep.status]);
  const oMerge = await call("POST", `/front-office/duplicates/review/${inv.pair}/merge`, tO, { survivorId: inv.a }), oPrev = await call("POST", `/front-office/duplicates/review/${inv.pair}/preview`, tO, { survivorId: inv.a }), oUndo = await call("POST", `/front-office/duplicates/merges/${auto.mergeRef}/undo`, tO, {});
  ok("FO-9b keys fail: a Case Officer without agent/prospect:merge gets 403 on preview, merge and Undo, and nothing merged", oMerge.status === 403 && oPrev.status === 403 && oUndo.status === 403 && sql(`select status from fo_dup_review where id = '${inv.pair}'`) === "OPEN", [oMerge.status, oPrev.status, oUndo.status]);

  // DW8: firms and visibility
  const sList = await call("GET", "/front-office/duplicates/review", tS), sMerge = await call("POST", `/front-office/duplicates/review/${inv.pair}/merge`, tS, { survivorId: inv.a }), sKeep = await call("POST", `/front-office/duplicates/review/${inv.pair}/keep-separate`, tS, {});
  ok("FO-9b DW8 fail: firm B sees none of firm A's pairs and gets the one not-found on them", sList.status === 200 && (sList.body.items ?? []).length === 0 && sMerge.status === 404 && sKeep.status === 404, [sList.status, sMerge.status, sKeep.status]);
  const oOwn = await add(O, { givenNames: "Ola", familyName: "Own", email: "ola@example.org" }), oOther = await add(R, { givenNames: "Ola", familyName: "Own", email: "ola@example.org", ownerStaffId: R.staffId });
  const PO = pairOf(oOwn.person.id, oOther.person.id);
  const oList = await call("GET", "/front-office/duplicates/review", tO), oKeep = await call("POST", `/front-office/duplicates/review/${PO}/keep-separate`, tO, {});
  ok("FO-9b DW8 fail: a viewer who may open only one side never sees the pair (absent from the list, Keep separate 404)",
    !!PO && oList.status === 200 && !(oList.body.items ?? []).some((i: { id: string }) => i.id === PO) && oKeep.status === 404, { PO, o: oList.body?.items?.length, keep: oKeep.status });
  const both1 = await add(O, { givenNames: "Uma", familyName: "Own", email: "uma@example.org" }), both2 = await add(O, { givenNames: "Uma", familyName: "Owne", email: "uma@example.org" });
  const PB = pairOf(both1.person.id, both2.person.id);
  ok("FO-9b DW8 pass: the same Case Officer sees a pair whose two sides are both theirs", !!PB && (await call("GET", "/front-office/duplicates/review", tO)).body.items.some((i: { id: string }) => i.id === PB));

  // guided merge, preview, Undo, the Merged tab
  const pv = await call("POST", `/front-office/duplicates/review/${inv.pair}/preview`, tR, { survivorId: inv.a });
  ok("FO-9b preview pass: both values of every field, the default pick, what moves and each side's updatedAt", pv.status === 200 && pv.body.fields.length === 6 && pv.body.fields.every((f: { pick: string }) => ["SURVIVOR", "LOSER"].includes(f.pick)) && pv.body.moves.leads === 1 && !!pv.body.updatedAt.loser, pv);
  const pvBad = await call("POST", `/front-office/duplicates/review/${inv.pair}/preview`, tR, { survivorId: noor.person.id });
  ok("FO-9b preview fail: a survivor outside the pair → 422 on survivorId", pvBad.status === 422 && !!pvBad.body.fields?.survivorId, pvBad);
  ok("FO-9b preview pass: preview says when either person has money", pv.body.hasMoney === true);
  const gmMoney = await call("POST", `/front-office/duplicates/review/${inv.pair}/merge`, tR, { survivorId: inv.a });
  ok("FO-9b M6 fail: a guided merge of a person with money (an invoice) → 409 HAS_MONEY with the sentence, nothing merged (client money never follows merged_into_id)",
    gmMoney.status === 409 && gmMoney.body.code === "HAS_MONEY" && gmMoney.body.detail === MONEY_LINE && sql(`select count(*) from fo_person where id in ('${inv.a}', '${inv.b}') and merged_into_id is null`) === "2", gmMoney);
  const gp = await pairWith("35", () => undefined);
  const gm = await call("POST", `/front-office/duplicates/review/${gp.pair}/merge`, tR, { survivorId: gp.a, choices: { familyName: "LOSER" } });
  ok("FO-9b DW1 pass (guided): the chosen survivor stays, the loser's family name is kept as picked, the pair is MERGED by the staff member, not automatic",
    gm.status === 200 && sql(`select family_name from fo_person where id = '${gp.a}'`) === "Money35x" && sql(`select merged_into_id from fo_person where id = '${gp.b}'`) === gp.a
    && sql(`select status || ':' || decided_by from fo_dup_review where id = '${gp.pair}'`) === `MERGED:staff:${R.staffId}` && sql(`select automatic from fo_dup_merge where id = '${gm.body.mergeRef}'`) === "f", gm);
  const gm2 = await call("POST", `/front-office/duplicates/review/${gp.pair}/merge`, tR, { survivorId: gp.a });
  ok("FO-9b merge fail: a decided pair → 409", gm2.status === 409, gm2);
  const ck = await call("POST", `/front-office/duplicates/review/${kim.pair}/merge`, tR, { survivorId: kim.a });
  ok("FO-9b BR-7 fail: a client with a case is never merged here: 409 with the sentence, nothing changed", ck.status === 409 && ck.body.detail === CASE_SIDE_LINE && sql(`select count(*) from fo_person where id in ('${kim.a}', '${kim.b}') and merged_into_id is null`) === "2", ck);
  const bad = await call("POST", `/front-office/duplicates/review/${PN}/merge`, tR, { survivorId: noor.person.id, extra: 1 }), notId = await call("POST", "/front-office/duplicates/review/not-a-uuid/merge", tR, { survivorId: noor.person.id });
  ok("FO-9b input fail: an unknown field 422 (named); a path id that is not a uuid 404", bad.status === 422 && notId.status === 404, [bad.status, notId.status]);
  const mergedTab = await call("GET", "/front-office/duplicates/review?status=MERGED", tR);
  ok("FO-9b review pass: a merged pair is listed under MERGED (its merged-away side seen through the survivor)", mergedTab.body.items?.some((i: { id: string; mergeRef: string }) => i.id === gp.pair && i.mergeRef === gm.body.mergeRef) && mergedTab.body.items?.some((i: { id: string; automatic: boolean }) => i.id === P1 && i.automatic), mergedTab);
  const merges = await call("GET", "/front-office/duplicates/merges", tR);
  const mi = (merges.body?.items ?? []) as { id: string; automatic: boolean; undoneAt: string | null }[];
  ok("FO-9b M6 pass: the Merged tab lists the guided and the automatic merge, automatic marked", merges.status === 200 && mi.find((m) => m.id === gm.body.mergeRef)?.automatic === false && mi.find((m) => m.id === auto.mergeRef)?.automatic === true, merges);
  ok("FO-9b M6 fail: firm B's Merged tab is empty", ((await call("GET", "/front-office/duplicates/merges", tS)).body.items ?? []).length === 0);
  const un = await call("POST", `/front-office/duplicates/merges/${gm.body.mergeRef}/undo`, tR, {});
  ok("FO-9b BR-10 pass: Undo from the Merged tab restores both people and the pair opens again", un.status === 200 && sql(`select count(*) from fo_person where id in ('${gp.a}', '${gp.b}') and merged_into_id is null`) === "2" && sql(`select status from fo_dup_review where id = '${gp.pair}'`) === "OPEN", un);
  const un2 = await call("POST", `/front-office/duplicates/merges/${gm.body.mergeRef}/undo`, tR, {}), unS = await call("POST", `/front-office/duplicates/merges/${auto.mergeRef}/undo`, tS, {});
  ok("FO-9b BR-10 fail: a second Undo → 409 with the reason; firm B's Undo of firm A's merge → 404", un2.status === 409 && /already undone/i.test(un2.body.detail ?? "") && unS.status === 404, [un2.status, unS.status]);

  // BR-11: Keep separate clears the possible-match flag
  const flagBefore = sql(`select count(*) from fo_lead where person_id in ('${both1.person.id}', '${both2.person.id}') and possible_match_person_id in ('${both1.person.id}', '${both2.person.id}')`);
  const keep = await call("POST", `/front-office/duplicates/review/${PB}/keep-separate`, tO, {});
  ok("FO-9b BR-11 pass: Keep separate (a Case Officer with agent/prospect:edit) decides the pair and clears the possible-match flag between them",
    flagBefore === "1" && keep.status === 200 && sql(`select status from fo_dup_review where id = '${PB}'`) === "KEPT_SEPARATE" && sql(`select count(*) from fo_lead where person_id in ('${both1.person.id}', '${both2.person.id}') and possible_match_person_id in ('${both1.person.id}', '${both2.person.id}')`) === "0", { flagBefore, keep });
  const kept = await call("GET", "/front-office/duplicates/review?status=KEPT_SEPARATE", tO), keep2 = await call("POST", `/front-office/duplicates/review/${PB}/keep-separate`, tO, {});
  ok("FO-9b BR-11 fail: the pair leaves To review for Kept separate; a second Keep separate → 409", kept.body.items.some((i: { id: string }) => i.id === PB) && !(await call("GET", "/front-office/duplicates/review", tO)).body.items.some((i: { id: string }) => i.id === PB) && keep2.status === 409, keep2);

  // ------------------------------------------------------------------------------- review round 1 (M1, M7, M8)
  await leads.add(R, { requestId: randomUUID(), source: "Phone call", givenNames: "Ana", familyName: "First", email: "ana.couple@example.org" });
  const anaNew = await leads.add(R, { requestId: randomUUID(), source: "Phone call", confirmedNew: true, givenNames: "Ben", familyName: "Second", email: "ana.couple@example.org" }) as { person: { id: string } };
  const PA = sql(`select id from fo_dup_review where firm_id = '${A}' and '${anaNew.person.id}' in (low_id, high_id)`);
  const ra = PA ? await inTx((tx) => mergeIfSafe(tx, A, PA, ports)) as { mergeRef?: string } : {};
  ok("FO-9b M7 fail: \"Add as new\" writes the pair Kept separate (decided by the adder) and the merge by itself never joins it",
    !!PA && sql(`select status || ':' || decided_by from fo_dup_review where id = '${PA}'`) === `KEPT_SEPARATE:staff:${R.staffId}` && !ra.mergeRef && sql(`select merged_into_id is null from fo_person where id = '${anaNew.person.id}'`) === "t");
  const retainer = (p: string, viaProspect: boolean) => {
    const t = randomUUID();
    sql(`set session_replication_role = replica;
      insert into fo_prospect (id, number, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, created_by, updated_at)
        select gen_random_uuid(), 'P-9' || lpad((floor(random() * 100000))::int::text, 5, '0'), '${A}', l.id, 'INDIVIDUAL', gen_random_uuid(), '${p}', '${p}', 'staff:${R.staffId}', now() from fo_lead l where l.person_id = '${p}' limit 1;
      insert into fo_retainer (id, firm_id, prospect_id, signer_person_id, representative_staff_id, template_id, template_version, template_file_key, created_by, updated_at)
        select gen_random_uuid(), '${A}', x.id, ${viaProspect ? "null" : `'${p}'`}, '${R.staffId}', '${t}', 1, 'retainer-templates/${t}/v1.docx', 'staff:${R.staffId}', now() from fo_prospect x where x.subject_person_id = '${p}'`);
  };
  const d1 = await pairWith("36", (p) => retainer(p, true));
  const wd1 = await inTx((tx) => whyNotSafe(tx, A, [d1.a, d1.b], [{ key: "PHONE" }]));
  ok("FO-9b M1 fail: a draft retainer with no signer yet, on the person's prospect, is a stored document (DOCUMENT)", JSON.stringify(wd1) === '["DOCUMENT"]', wd1);
  const d2 = await pairWith("37", (p) => retainer(p, false));
  const wd2 = await inTx((tx) => whyNotSafe(tx, A, [d2.a, d2.b], [{ key: "PHONE" }]));
  ok("FO-9b M8 fail: a retainer that names the person as signer is a stored document (DOCUMENT)", JSON.stringify(wd2) === '["DOCUMENT"]', wd2);
  const d3 = await pairWith("38", (p) => sql(`set session_replication_role = replica; insert into fo_identity_check (id, firm_id, person_id, method, checked_by, details_corroborated, document_type, issuing_country, document_number_last4, copy_file_key, copy_sha256)
    values (gen_random_uuid(), '${A}', '${p}', 'IN_PERSON', '${R.staffId}', '{NAME}', 'PASSPORT', 'CA', '1234', 'identity-copies/${randomUUID()}.pdf', '${"a".repeat(64)}')`));
  const wd3 = await inTx((tx) => whyNotSafe(tx, A, [d3.a, d3.b], [{ key: "PHONE" }]));
  ok("FO-9b M8 fail: an identity check holding a copy is a stored document (DOCUMENT)", JSON.stringify(wd3) === '["DOCUMENT"]', wd3);
  const d3n = await pairWith("40", (p) => sql(`set session_replication_role = replica; insert into fo_identity_check (id, firm_id, person_id, method, checked_by, details_corroborated, document_type, issuing_country, document_number_last4)
    values (gen_random_uuid(), '${A}', '${p}', 'IN_PERSON', '${R.staffId}', '{NAME}', 'PASSPORT', 'CA', '1234')`));
  const wd3n = await inTx((tx) => whyNotSafe(tx, A, [d3n.a, d3n.b], [{ key: "PHONE" }]));
  ok("FO-9b M8 pass (review r3-m1): an identity check holding no copy is not a stored document (safe)", JSON.stringify(wd3n) === "[]", wd3n);
  const d4 = await pairWith("39", (p) => sql(`set session_replication_role = replica; insert into fo_signer (id, firm_id, request_id, role, person_id, sign_order, link_token_sha256)
    values (gen_random_uuid(), '${A}', gen_random_uuid(), 'CLIENT', '${p}', 1, '${"b".repeat(64)}')`));
  const wd4 = await inTx((tx) => whyNotSafe(tx, A, [d4.a, d4.b], [{ key: "PHONE" }]));
  ok("FO-9b M8 fail: a signer row naming the person (signing evidence) is a stored document (DOCUMENT)", JSON.stringify(wd4) === '["DOCUMENT"]', wd4);
  // n1: A (email E), B (E and phone P), C (phone P, Add as new: B-C Kept separate). Merging B into A must not reopen A-C.
  const nA = await add(R, { givenNames: "Kai", familyName: "Alpha", email: "kai.e@example.org" });
  const nB = await add(R, { givenNames: "Kai", familyName: "Beta", email: "kai.e@example.org", phone: "+1 416 555 0140" });
  const nC = await leads.add(R, { requestId: randomUUID(), source: "Phone call", confirmedNew: true, givenNames: "Cy", familyName: "Gamma", phone: "+1 416 555 0140" }) as { person: { id: string } };
  const nAB = pairOf(nA.person.id, nB.person.id), nBC = pairOf(nB.person.id, nC.person.id);
  const nm = await inTx((tx) => mergeIfSafe(tx, A, nAB, ports)) as { mergeRef?: string };
  const nAC = pairOf(nA.person.id, nC.person.id);   // written by the merge itself (review r3-m5: no fallback, no skip)
  const rAC = nAC ? await inTx((tx) => mergeIfSafe(tx, A, nAC, ports)) as { mergeRef?: string } : {};
  ok("FO-9b n1 fail: after B merges into A, the A-C pair is shown Kept separate through B-C's decision and C is never merged by itself",
    !!nm.mergeRef && sql(`select status from fo_dup_review where id = '${nBC}'`) === "KEPT_SEPARATE" && !!nAC && (await review.list(R, "KEPT_SEPARATE")).items.some((it) => it.id === nAC && it.keptThrough === nBC) && !rAC.mergeRef
    && sql(`select merged_into_id is null from fo_person where id = '${nC.person.id}'`) === "t", { nm, nAC, rAC });
  // R3-1: A (name N, phone P), B (phone P, email E), C (name N, email E): pairs A-B, B-C and A-C (by name). B-C is kept
  // separate; once B merges into A (guided or by itself), A-C carries that decision and C is never merged by itself.
  const trio = async (n: string) => {
    const a = await add(R, { givenNames: "Sami", familyName: `Rivera${n}`, phone: `+1 416 555 01${n}` });
    const b = await add(R, { givenNames: "Bob", familyName: `Xu${n}`, phone: `+1 416 555 01${n}`, email: `r3.${n}@example.org` });
    const c = await add(R, { givenNames: "Sami", familyName: `Rivera${n}`, email: `r3.${n}@example.org` });
    return { a: a.person.id, b: b.person.id, c: c.person.id, ab: pairOf(a.person.id, b.person.id), bc: pairOf(b.person.id, c.person.id), ac: pairOf(a.person.id, c.person.id) };
  };
  const g = await trio("61");
  const r3gk = await call("POST", `/front-office/duplicates/review/${g.bc}/keep-separate`, tR, {});
  const r3gm = await call("POST", `/front-office/duplicates/review/${g.ab}/merge`, tR, { survivorId: g.a, choices: { email: "LOSER" } });
  const gAC = g.ac ? await inTx((tx) => mergeIfSafe(tx, A, g.ac, ports)) as { mergeRef?: string; refused?: string[] } : {};
  ok("FO-9b R3-1 fail: B-C kept separate, then a guided merge of B into A → the A-C pair already listed is shown Kept separate through B-C, and C is never merged by itself",
    !!g.ac && r3gk.status === 200 && r3gm.status === 200 && (await review.list(R, "KEPT_SEPARATE")).items.some((it) => it.id === g.ac && it.keptThrough === g.bc) && !gAC.mergeRef
    && sql(`select merged_into_id is null from fo_person where id = '${g.c}'`) === "t", { ac: g.ac, gk: r3gk.status, gm: r3gm.status, gAC });
  const gu4 = await call("POST", `/front-office/duplicates/merges/${r3gm.body.mergeRef}/undo`, tR, {});
  ok("FO-9b R4-3 fail: Undo of that merge opens the A-C pair again (a decision nobody made on A-C is not left behind); B-C stays Kept separate",
    gu4.status === 200 && sql(`select status || ':' || coalesce(decided_by, '-') from fo_dup_review where id = '${g.ac}'`) === "OPEN:-" && sql(`select status from fo_dup_review where id = '${g.bc}'`) === "KEPT_SEPARATE", { gu4: gu4.status });
  // R4-1: the merge never waits on a pair row another action holds (service.ts: merge and Undo never wait while they
  // hold locks). Another session holds the A-C row while B merges into A; the carry skips it, and the merge by itself
  // still refuses A-C (KEPT_SEPARATE).
  const w = await trio("64");
  await call("POST", `/front-office/duplicates/review/${w.bc}/keep-separate`, tR, {});
  const rowHolder = spawn(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-c", `begin; select 1 from fo_dup_review where id = '${w.ac}' for update; select pg_sleep(2.5); commit;`], { stdio: "ignore" });
  const rowHeld = new Promise<number>((r) => rowHolder.on("exit", (c) => r(c ?? 1)));
  for (let i = 0; i < 50 && sql(`select count(*) from pg_stat_activity where query like '%pg_sleep(2.5)%' and pid <> pg_backend_pid()`) === "0"; i++) await new Promise((r) => setTimeout(r, 50));
  const t0 = Date.now();
  const wm = await inTx((tx) => mergeIfSafe(tx, A, w.ab, ports)) as { mergeRef?: string };
  const waited = Date.now() - t0;
  const rowExit = await rowHeld;
  const wAC = await inTx((tx) => mergeIfSafe(tx, A, w.ac, ports)) as { mergeRef?: string; refused?: string[] };
  ok("FO-9b R4-1 fail: B merges into A while another session holds the A-C pair row → the merge does not wait on it (under 1.5 s), and A-C is still never merged by itself (KEPT_SEPARATE)",
    rowExit === 0 && !!wm.mergeRef && waited < 1500 && !wAC.mergeRef && (wAC.refused ?? []).includes("KEPT_SEPARATE") && sql(`select merged_into_id is null from fo_person where id = '${w.c}'`) === "t", { waited, wm, wAC, rowExit });
  // R4-2: B-C kept separate; B merges into A (A keeps its phone, so no A-C pair); D matches A by email and C by phone;
  // A merges into D. The decision follows both merges: D and C are not safe, and C is never merged by itself.
  const q4ca = await add(R, { givenNames: "Ari", familyName: "Chain", email: "ari.chain@example.org", phone: "+1 416 555 0171" });
  const q4cb = await add(R, { givenNames: "Bo", familyName: "Link", email: "ari.chain@example.org", phone: "+1 416 555 0172" });
  const q4cc = await add(R, { givenNames: "Cid", familyName: "Ring", phone: "+1 416 555 0172" });
  const q4cBC = pairOf(q4cb.person.id, q4cc.person.id);
  const q4ck = await call("POST", `/front-office/duplicates/review/${q4cBC}/keep-separate`, tR, {});
  const q4cm1 = await call("POST", `/front-office/duplicates/review/${pairOf(q4ca.person.id, q4cb.person.id)}/merge`, tR, { survivorId: q4ca.person.id, choices: { phone: "SURVIVOR" } });
  const q4cd = await add(R, { givenNames: "Dee", familyName: "Join", email: "ari.chain@example.org", phone: "+1 416 555 0172" });
  const q4cm2 = await call("POST", `/front-office/duplicates/review/${pairOf(q4ca.person.id, q4cd.person.id)}/merge`, tR, { survivorId: q4cd.person.id });
  const q4cDC = pairOf(q4cd.person.id, q4cc.person.id);
  const q4cw = await inTx((tx) => whyNotSafe(tx, A, [q4cd.person.id, q4cc.person.id], [{ key: "PHONE" }]));
  const q4cr = q4cDC ? await inTx((tx) => mergeIfSafe(tx, A, q4cDC, ports)) as { mergeRef?: string } : {};
  ok("FO-9b R4-2 fail: a Kept separate decision follows a chain of merges (B into A, then A into D) → D and C are not safe (KEPT_SEPARATE), C is never merged by itself",
    q4ck.status === 200 && q4cm1.status === 200 && q4cm2.status === 200 && !!q4cDC && q4cw.includes("KEPT_SEPARATE") && !q4cr.mergeRef && sql(`select merged_into_id is null from fo_person where id = '${q4cc.person.id}'`) === "t", { q4ck: q4ck.status, q4cm1: q4cm1.status, q4cm2: q4cm2.status, q4cDC, q4cw, q4cr });
  const h = await trio("62");
  await call("POST", `/front-office/duplicates/review/${h.bc}/keep-separate`, tR, {});
  const hm = await inTx((tx) => mergeIfSafe(tx, A, h.ab, ports)) as { mergeRef?: string };
  const hw = await inTx((tx) => whyNotSafe(tx, A, [h.a, h.c], [{ key: "EMAIL" }]));
  const hAC = h.ac ? await inTx((tx) => mergeIfSafe(tx, A, h.ac, ports)) as { mergeRef?: string } : {};
  ok("FO-9b R3-1 fail: B-C kept separate, then B merges into A by itself → A and C are not safe (KEPT_SEPARATE) and C is never merged by itself",
    !!hm.mergeRef && JSON.stringify(hw) === '["KEPT_SEPARATE"]' && !hAC.mergeRef && sql(`select merged_into_id is null from fo_person where id = '${h.c}'`) === "t", { hm, hw, hAC });
  const k = await trio("63");
  const km = await inTx((tx) => mergeIfSafe(tx, A, k.ab, ports)) as { mergeRef?: string };
  const kk = await call("POST", `/front-office/duplicates/review/${k.bc}/keep-separate`, tR, {});
  ok("FO-9b R3-1 fail: Keep separate on a pair whose side was merged away since → 409 MERGED_AWAY with the sentence, the pair stays OPEN",
    !!km.mergeRef && kk.status === 409 && kk.body.code === "MERGED_AWAY" && kk.body.detail === MERGED_AWAY_LINE && sql(`select status from fo_dup_review where id = '${k.bc}'`) === "OPEN", { km, kk });
  const kw = await inTx((tx) => whyNotSafe(tx, A, [k.a, k.c], [{ key: "EMAIL" }]));
  ok("FO-9b R3-1 pass: with no Kept separate decision, the survivor and the other person may merge by themselves (the carry never suppresses an undecided pair)", JSON.stringify(kw) === "[]", kw);
  // R3-3: the newer record's email changes while the merge by itself waits on its lock; the change must not be copied
  // into the survivor and then match itself. Another session holds the merge's lock, changes the email, then commits.
  const r3a = await add(R, { givenNames: "Ola", familyName: "Wait", email: "ola.wait@example.org" }), r3b = await add(R, { givenNames: "Ola", familyName: "Waits", email: "ola.wait@example.org" });
  const PR3 = pairOf(r3a.person.id, r3b.person.id), loser3 = r3b.person.id;
  const holder = spawn(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-c",
    `begin; select pg_advisory_xact_lock(hashtextextended('fo_dup_merge:${loser3}', 0)); select pg_sleep(2); update fo_person set email = 'ola.moved@example.org', updated_at = now() + interval '1 second' where id = '${loser3}'; commit;`], { stdio: "ignore" });
  const held = new Promise<number>((r) => holder.on("exit", (c) => r(c ?? 1)));
  for (let i = 0; i < 50 && sql(`select count(*) from pg_locks where locktype = 'advisory' and granted`) === "0"; i++) await new Promise((r) => setTimeout(r, 50));
  const r3 = await inTx((tx) => mergeIfSafe(tx, A, PR3, ports)) as { mergeRef?: string; refused?: string[] };
  const holderExit = await held;
  ok("FO-9b R3-3 fail: the newer record's email changed while the merge by itself waited on its lock → refused NOT_EXACT from the keys as locked, nothing merged",
    holderExit === 0 && !r3.mergeRef && (r3.refused ?? []).includes("NOT_EXACT") && sql(`select count(*) from fo_person where id in ('${r3a.person.id}', '${loser3}') and merged_into_id is null`) === "2", { holderExit, r3 });
  // ------------------------------------------------------------------------------- round 7: the pair model's rules, each pinned
  // (pair-model.md §1, §2; review R7-1, break R7-3/R7-4)
  {
  const onList = async (tab: "OPEN" | "KEPT_SEPARATE" | "MERGED", pairId: string) => (await review.list(R, tab)).items.some((it) => it.id === pairId);
  const p7 = await add(R, { givenNames: "Pia", familyName: "Seven", email: "pia.seven@example.org" });
  const q7 = await add(R, { givenNames: "Quin", familyName: "Sevenq", email: "pia.seven@example.org", phone: "+1 416 555 0181" });
  const z7 = await add(R, { givenNames: "Zed", familyName: "Sevenz", phone: "+1 416 555 0181" });
  const PQ7 = pairOf(p7.person.id, q7.person.id), QZ7 = pairOf(q7.person.id, z7.person.id);
  const m71 = await call("POST", `/front-office/duplicates/review/${PQ7}/merge`, tR, { survivorId: p7.person.id, choices: { phone: "LOSER" } });
  const PZ7 = pairOf(p7.person.id, z7.person.id);
  ok("FO-9b R7 §1 pass: after Q merges into P, the Q-Z pair (a side merged away) is not on To review, and the P-Z pair the merge wrote is",
    m71.status === 200 && !!PZ7 && !(await onList("OPEN", QZ7)) && (await onList("OPEN", PZ7)), { m71: m71.status, PZ7 });
  const az7 = await inTx((tx) => mergeIfSafe(tx, A, QZ7, ports)).then((v) => v as { refused?: string[]; mergeRef?: string }, (e: { status?: number }) => ({ threw: e.status }));
  ok("FO-9b R7 (r7-m4) fail: the merge by itself on a pair with a merged-away side refuses (returns), never throws 409", "refused" in az7 && !("mergeRef" in az7 && az7.mergeRef), az7);
  const u71 = await call("POST", `/front-office/duplicates/merges/${m71.body.mergeRef}/undo`, tR, {});
  ok("FO-9b R7 §1 pass: Undo puts Q-Z back on To review and takes P-Z (the merge wrote it) off every tab",
    u71.status === 200 && (await onList("OPEN", QZ7)) && !(await onList("OPEN", PZ7)) && !(await onList("KEPT_SEPARATE", PZ7)) && !(await onList("MERGED", PZ7)), { u71: u71.status });
  sql(`update fo_person set phone = (select phone from fo_person where id = '${z7.person.id}'), phone_readable = true where id = '${p7.person.id}'`);   // P and Z match exactly now, by an edit
  const nl = [await call("POST", `/front-office/duplicates/review/${PZ7}/merge`, tR, { survivorId: p7.person.id }), await call("POST", `/front-office/duplicates/review/${PZ7}/keep-separate`, tR, {}), await call("POST", `/front-office/duplicates/review/${PZ7}/preview`, tR, { survivorId: p7.person.id })];
  ok("FO-9b R7 §1 fail: a pair its merge's Undo took off the list → guided merge, Keep separate and preview each 409 NOT_LISTED with the sentence, nothing changed",
    nl.every((r) => r.status === 409 && r.body.code === "NOT_LISTED" && r.body.detail === NOT_LISTED_LINE) && sql(`select status from fo_dup_review where id = '${PZ7}'`) === "OPEN", nl.map((r) => [r.status, r.body.code]));
  const aw7 = await inTx((tx) => mergeIfSafe(tx, A, PZ7, ports)) as { refused?: string[]; mergeRef?: string };
  ok("FO-9b R7 §1 fail: the merge by itself never merges a pair taken off the list, even when the two now match exactly", !aw7.mergeRef && sql(`select count(*) from fo_person where id in ('${p7.person.id}', '${z7.person.id}') and merged_into_id is null`) === "2", aw7);
  const m72 = await call("POST", `/front-office/duplicates/review/${PQ7}/merge`, tR, { survivorId: p7.person.id });
  ok("FO-9b R7 §1 pass: a later merge that finds the pair again lists it again (it now names that merge)",
    m72.status === 200 && (await onList("OPEN", PZ7)) && sql(`select noted_by_merge_id from fo_dup_review where id = '${PZ7}'`) === m72.body.mergeRef, { m72: m72.status });
  // §2 the lock order: while another session holds one person's lock, the action waits for it holding no pair row
  const holdPerson = async (personId: string, secs: number) => {
    const h = spawn(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-c", `begin; select pg_advisory_xact_lock(hashtextextended('fo_dup_merge:${personId}', 0)); select pg_sleep(${secs}); commit;`], { stdio: "ignore" });
    const done = new Promise<number>((r) => h.on("exit", (c) => r(c ?? 1)));
    const mine = `select count(*) from pg_locks l cross join lateral (select hashtextextended('fo_dup_merge:${personId}', 0) as k) h where l.locktype = 'advisory' and l.granted
      and l.database = (select oid from pg_database where datname = current_database()) and l.classid::bigint = ((h.k >> 32) & 4294967295) and l.objid::bigint = (h.k & 4294967295)`;   // this person's lock only (review R8-6)
    for (let i = 0; i < 60 && sql(mine) === "0"; i++) await new Promise((r) => setTimeout(r, 50));
    return done;
  };
  const rowFree = (pairId: string) => !sqlErr(`begin; select 1 from fo_dup_review where id = '${pairId}' for update nowait; rollback;`);
  for (const [what, act] of [
    ["Keep separate", (pid: string) => call("POST", `/front-office/duplicates/review/${pid}/keep-separate`, tR, {})],
    ["the guided merge", (pid: string, sv: string) => call("POST", `/front-office/duplicates/review/${pid}/merge`, tR, { survivorId: sv })],
    ["the merge by itself", (pid: string) => inTx((tx) => mergeIfSafe(tx, A, pid, ports))],
  ] as const) {
    const n = 191 + ["Keep separate", "the guided merge", "the merge by itself"].indexOf(what);
    const x = await add(R, { givenNames: "Lou", familyName: `Order${n}`, phone: `+1 416 555 0${n}` }), y = await add(R, { givenNames: "Lou", familyName: `Orders${n}`, phone: `+1 416 555 0${n}` });
    const pid = pairOf(x.person.id, y.person.id);
    const held = holdPerson(x.person.id, 1.5), t0 = Date.now();
    const running = (act as (p: string, s: string) => Promise<unknown>)(pid, x.person.id);
    await new Promise((r) => setTimeout(r, 500));
    const free = rowFree(pid);
    await running; const waited = Date.now() - t0; await held;
    ok(`FO-9b R7 §2 fail: ${what} waits for the people's locks (another session holds one) and holds no pair row while it waits`, free && waited >= 1000, { free, waited });
  }
  {
    const x = await add(R, { givenNames: "Ula", familyName: "Undo194", phone: "+1 416 555 0194" }), y = await add(R, { givenNames: "Ula", familyName: "Undos194", phone: "+1 416 555 0194" });
    const pid = pairOf(x.person.id, y.person.id), mm = await call("POST", `/front-office/duplicates/review/${pid}/merge`, tR, { survivorId: x.person.id });
    const held = holdPerson(x.person.id, 1.5), t0 = Date.now(), running = call("POST", `/front-office/duplicates/merges/${mm.body.mergeRef}/undo`, tR, {});
    await new Promise((r) => setTimeout(r, 500));
    const free = rowFree(pid), uo = await running, waited = Date.now() - t0; await held;
    ok("FO-9b R7 §2 fail: Undo waits for the people's locks and holds no pair row while it waits", mm.status === 200 && uo.status === 200 && free && waited >= 1000, { free, waited, uo: uo.status });
  }
  // part 2b's limit (pair-model.md §4): an arrival never takes a person's lock inside its own transaction, so the merge by
  // itself at arrival must run after the arrival commits. This turns red if the arrival path starts to call it inside.
  {
    const g1 = await add(R, { givenNames: "Ira", familyName: "Arrive7", phone: "+1 416 555 0197" });
    const held = await db.$transaction(async (tx) => {
      await arrive(tx as never, { firmId: A, door: "MANUAL", intakeKey: `manual:${randomUUID()}`, source: "Phone call", actor: `staff:${R.staffId}`, payloadHash: randomUUID(), ownerStaffId: R.staffId,
        person: { givenNames: "Ira", familyName: "Arrive7b", email: null, phone: salesPhone("+1 416 555 0197") } }, ports);
      // the person locks only (fo_dup_merge:<person id>, service.ts lockPair), of every person of the firm; FO-2's own
      // fo_sales_match:<firm>:<email or phone> locks are another namespace no merge takes (pair-model.md §2)
      return Number((await (tx as never as { $queryRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<{ n: number }[]> }).$queryRaw`
        select count(*)::int as n from pg_locks l join fo_person p on p.firm_id = ${A}::uuid
         cross join lateral (select hashtextextended('fo_dup_merge:' || p.id::text, 0) as k) h
         where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.classid::bigint = ((h.k >> 32) & 4294967295) and l.objid::bigint = (h.k & 4294967295)`)[0].n);
    });
    // the test can see a person lock: one taken on purpose in the same kind of transaction is counted
    const seenLock = await db.$transaction(async (tx) => {
      await (tx as never as { $executeRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<number> }).$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`fo_dup_merge:${g1.person.id}`}, 0))`;
      return Number((await (tx as never as { $queryRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<{ n: number }[]> }).$queryRaw`
        select count(*)::int as n from pg_locks l join fo_person p on p.firm_id = ${A}::uuid
         cross join lateral (select hashtextextended('fo_dup_merge:' || p.id::text, 0) as k) h
         where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.classid::bigint = ((h.k >> 32) & 4294967295) and l.objid::bigint = (h.k & 4294967295)`)[0].n);
    });
    ok("FO-9b part 2b limit: an arrival that writes a pair takes no person's lock inside its transaction (the merge by itself at arrival runs after it commits)",
      held === 0 && seenLock === 1 && sql(`select count(*) from fo_dup_review where '${g1.person.id}' in (low_id, high_id)`) === "1", { held, seenLock });
  }
  // a chain: B into A, then A into D; Undo of the earlier one is refused (409), never "not found"
  const cA = await add(R, { givenNames: "Cal", familyName: "Chain7", phone: "+1 416 555 0195" }), cB = await add(R, { givenNames: "Cal", familyName: "Chains7", phone: "+1 416 555 0195" }), cD = await add(R, { givenNames: "Cal", familyName: "Chainz7", phone: "+1 416 555 0195" });
  const ch1 = await call("POST", `/front-office/duplicates/review/${pairOf(cA.person.id, cB.person.id)}/merge`, tR, { survivorId: cA.person.id });
  const ch2 = await call("POST", `/front-office/duplicates/review/${pairOf(cA.person.id, cD.person.id)}/merge`, tR, { survivorId: cD.person.id });
  const chU1 = await call("POST", `/front-office/duplicates/merges/${ch1.body.mergeRef}/undo`, tR, {});
  const chU2 = await call("POST", `/front-office/duplicates/merges/${ch2.body.mergeRef}/undo`, tR, {}), chU3 = await call("POST", `/front-office/duplicates/merges/${ch1.body.mergeRef}/undo`, tR, {});
  ok("FO-9b R7 (break R7-1) fail: in a chain (B into A, then A into D) Undo of the earlier merge → 409 UNDO_REFUSED, not 404; in order, both go through",
    ch1.status === 200 && ch2.status === 200 && chU1.status === 409 && chU1.body.code === "UNDO_REFUSED" && chU2.status === 200 && chU3.status === 200, [ch1.status, ch2.status, chU1.status, chU1.body.code, chU2.status, chU3.status]);
  // After an Undo a pair that still matches is always To review, whatever the order of Undos; a stale one may stay
  // listed, and the merge by itself refuses it (Lead 8 on #3174: a valid pair is never hidden; pair-model.md §1).
  const sA = await add(R, { givenNames: "Ari", familyName: "Stale7", phone: "+1 416 555 0196" }), sB = await add(R, { givenNames: "Bea", familyName: "Stale7b", phone: "+1 416 555 0196", email: "stale7@example.org" });
  const sm = await call("POST", `/front-office/duplicates/review/${pairOf(sA.person.id, sB.person.id)}/merge`, tR, { survivorId: sA.person.id, choices: { email: "LOSER" } });
  const sN = await add(R, { givenNames: "Neo", familyName: "Stale7n", email: "stale7@example.org" });
  const NA = pairOf(sN.person.id, sA.person.id);
  const su = await call("POST", `/front-office/duplicates/merges/${sm.body.mergeRef}/undo`, tR, {});
  const NB = pairOf(sN.person.id, sB.person.id), sr = NA ? await inTx((tx) => mergeIfSafe(tx, A, NA, ports)) as { refused?: string[]; mergeRef?: string } : {};
  ok("FO-9b Undo limit pass: N arrived while the merge stood; after the Undo N's pair with the survivor may stay listed (stale), the merge by itself refuses it (NOT_EXACT), and N's pair with the record split off is To review",
    sm.status === 200 && su.status === 200 && !!NA && !sr.mergeRef && (sr.refused ?? []).includes("NOT_EXACT") && !!NB && (await onList("OPEN", NB)), { sm: sm.status, su: su.status, NA, sr, NB });
  for (const [n, order] of [["11", "M1 then M2"], ["12", "M2 then M1"]] as const) {
    // break 2b: Y matches S by S's own phone; M2 (Z into Y, Z's phone) makes them stop matching; both Undos give it back
    const bS = await add(R, { givenNames: "Sol", familyName: `Order${n}`, phone: `+1 416 555 04${n}` }), bL = await add(R, { givenNames: "Lin", familyName: `Order${n}l`, phone: `+1 416 555 04${n}`, email: `order${n}.l@example.org` });
    const bM1 = await call("POST", `/front-office/duplicates/review/${pairOf(bS.person.id, bL.person.id)}/merge`, tR, { survivorId: bS.person.id, choices: { email: "LOSER" } });
    const bY = await add(R, { givenNames: "Yul", familyName: `Order${n}y`, phone: `+1 416 555 04${n}`, email: `order${n}.y@example.org` });
    const bZ = await add(R, { givenNames: "Zia", familyName: `Order${n}z`, phone: `+1 416 555 05${n}`, email: `order${n}.y@example.org` });
    const bSY = pairOf(bS.person.id, bY.person.id);
    const bM2 = await call("POST", `/front-office/duplicates/review/${pairOf(bY.person.id, bZ.person.id)}/merge`, tR, { survivorId: bY.person.id, choices: { phone: "LOSER" } });
    const refs = order === "M1 then M2" ? [bM1.body.mergeRef, bM2.body.mergeRef] : [bM2.body.mergeRef, bM1.body.mergeRef];
    const us = []; for (const r of refs) us.push((await call("POST", `/front-office/duplicates/merges/${r}/undo`, tR, {})).status);
    ok(`FO-9b Undo fail (break 2b, ${order}): a pair that still matches after both Undos is To review`,
      bM1.status === 200 && bM2.status === 200 && us.every((x) => x === 200) && !!bSY && (await onList("OPEN", bSY)), { bM1: bM1.status, bM2: bM2.status, us, bSY });
  }
  {
    // more than 10 matches: every pair with the survivor that was listed is still listed after the Undo
    const u8S = await add(R, { givenNames: "Uma", familyName: "Eight", phone: "+1 416 555 0301" }), u8B = await add(R, { givenNames: "Ben", familyName: "Eightb", phone: "+1 416 555 0301", email: "eight.b@example.org" });
    const u8m = await call("POST", `/front-office/duplicates/review/${pairOf(u8S.person.id, u8B.person.id)}/merge`, tR, { survivorId: u8S.person.id, choices: { email: "LOSER" } });
    const u8X: string[] = [];
    for (let i = 0; i < 11; i++) u8X.push((await add(R, { givenNames: `Xan${"abcdefghijk"[i]}`, familyName: `Many${"lmnopqrstuv"[i]}`, phone: "+1 416 555 0301" })).person.id);
    const listed8: boolean[] = []; for (const x of u8X) { const pid = pairOf(u8S.person.id, x); listed8.push(!!pid && (await onList("OPEN", pid))); }
    const u8u = await call("POST", `/front-office/duplicates/merges/${u8m.body.mergeRef}/undo`, tR, {});
    const kept8: boolean[] = []; for (const x of u8X) { const pid = pairOf(u8S.person.id, x); kept8.push(!!pid && (await onList("OPEN", pid))); }
    // 11 people arrived; each arrival writes at most 10 pairs (FO-9a's cap), so 10 or 11 of them have a pair with S
    ok("FO-9b Undo fail (more than 10 matches): every pair with the survivor that was To review is still To review after the Undo",
      u8m.status === 200 && u8u.status === 200 && listed8.filter(Boolean).length >= 10 && JSON.stringify(kept8) === JSON.stringify(listed8), { u8m: u8m.status, u8u: u8u.status, listed8, kept8 });
    }
  }

  sql(`alter table case_client rename to case_client_away`);
  const wu = await inTx((tx) => whyNotSafe(tx, A, [gp.a, gp.b], [{ key: "PHONE" }]));
  const gu = await call("POST", `/front-office/duplicates/review/${gp.pair}/merge`, tR, { survivorId: gp.a });
  sql(`alter table case_client_away rename to case_client`);
  ok("FO-9b M8 fail: when the case read fails, the pair is not safe (CASE_UNKNOWN) and a guided merge is refused (409 NEEDS_CASE_SIDE): fail-closed",
    JSON.stringify(wu) === '["CASE_UNKNOWN"]' && gu.status === 409 && gu.body.code === "NEEDS_CASE_SIDE", [wu, gu.status]);

  // ------------------------------------------------------------------------------- break round 1 (F1-F7)
  const f1a = await add(R, { givenNames: "Eve", familyName: "Shift", email: "eve.shift@example.org" }), f1b = await add(R, { givenNames: "Eve", familyName: "Shifts", email: "eve.shift@example.org" });
  const PF1 = pairOf(f1a.person.id, f1b.person.id);
  sql(`update fo_person set email = 'eve.other@example.org' where id = '${f1b.person.id}'`);
  const rf1 = await inTx((tx) => mergeIfSafe(tx, A, PF1, ports)) as { refused?: string[]; mergeRef?: string };
  ok("FO-9b F1 fail: a pair whose email no longer matches (changed after it was listed) is never merged by itself (NOT_EXACT, from the records as they are now)", !rf1.mergeRef && (rf1.refused ?? []).includes("NOT_EXACT") && sql(`select count(*) from fo_person where id in ('${f1a.person.id}', '${f1b.person.id}') and merged_into_id is null`) === "2", rf1);
  const f2a = await add(R, { givenNames: "Ivy", familyName: "Race", email: "ivy.race@example.org" }), f2b = await add(R, { givenNames: "Ivy", familyName: "Races", email: "ivy.race@example.org" });
  const PF2 = pairOf(f2a.person.id, f2b.person.id);
  // Another writer commits an invoice for the newer record while the merge runs (its last step, the outbox row, is where it lands).
  const racing = { ...ports, emit: async () => { replica(`insert into money_invoice (id, firm_id, person_id, currency, due_date, created_by, updated_at) values (gen_random_uuid(), '${A}', '${f2b.person.id}', 'CAD', '2026-12-15', 'seed:fo9b', now())`); } };
  const rf2 = await inTx((tx) => mergeIfSafe(tx, A, PF2, racing)) as { refused?: string[]; mergeRef?: string };
  ok("FO-9b F2 fail: an invoice committed while the merge by itself runs → checked again under the merge's locks, rolled back (MONEY), no tombstone, no merge record, the pair stays OPEN",
    !rf2.mergeRef && JSON.stringify(rf2.refused) === '["MONEY"]' && sql(`select count(*) from fo_person where id in ('${f2a.person.id}', '${f2b.person.id}') and merged_into_id is null`) === "2"
    && sql(`select count(*) from fo_dup_merge where loser_id = '${f2b.person.id}'`) === "0" && sql(`select status from fo_dup_review where id = '${PF2}'`) === "OPEN", rf2);
  const f3a = await add(R, { givenNames: "Gus", familyName: "Case", email: "gus.case@example.org" }), f3b = await add(R, { givenNames: "Gus", familyName: "Cases", email: "gus.case@example.org" });
  const PF3 = pairOf(f3a.person.id, f3b.person.id);
  const caseRace = new DuplicateReview(db, { ...ports, emit: async () => { replica(`insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, created_by) values (gen_random_uuid(), (select id from workspace order by created_at limit 1), 'sample-firm', '${A}', (select coalesce(max(client_number), 9000) + 1 from case_client where firm_key = 'sample-firm'), 'Gus Sample', 'PERSON', '${f3b.person.id}', 'seed:fo9b')`); } });
  const rf3 = await caseRace.merge(R, PF3, { survivorId: f3a.person.id }).then(() => 200, (e: { status?: number; response?: { detail?: string } }) => `${e.status}:${e.response?.detail}`);
  ok("FO-9b F3 fail: a case opened while a guided merge runs → 409 with the case sentence, nothing merged", rf3 === `409:${CASE_SIDE_LINE}` && sql(`select count(*) from fo_person where id in ('${f3a.person.id}', '${f3b.person.id}') and merged_into_id is null`) === "2", rf3);
  const f4a = await add(R, { givenNames: "Lou", familyName: "Stale", email: "lou.stale@example.org" }), f4b = await add(R, { givenNames: "Lou", familyName: "Stales", email: "lou.stale@example.org" });
  const PF4 = pairOf(f4a.person.id, f4b.person.id);
  const pv4 = await call("POST", `/front-office/duplicates/review/${PF4}/preview`, tR, { survivorId: f4a.person.id });
  sql(`update fo_person set email = 'lou.changed@example.org', updated_at = now() + interval '1 second' where id = '${f4b.person.id}'`);
  const st = await call("POST", `/front-office/duplicates/review/${PF4}/merge`, tR, { survivorId: f4a.person.id, choices: { email: "LOSER" }, updatedAt: pv4.body.updatedAt });
  ok("FO-9b F4 fail: the loser changed after the preview → 409 STALE_VERSION with the sentence, nothing merged", st.status === 409 && st.body.code === "STALE_VERSION" && st.body.detail === STALE_LINE && sql(`select merged_into_id is null from fo_person where id = '${f4b.person.id}'`) === "t", st);
  const pv4b = await call("POST", `/front-office/duplicates/review/${PF4}/preview`, tR, { survivorId: f4a.person.id });
  const fresh = await call("POST", `/front-office/duplicates/review/${PF4}/merge`, tR, { survivorId: f4a.person.id, choices: { email: "LOSER" }, updatedAt: pv4b.body.updatedAt });
  ok("FO-9b F4 pass: with the preview's updatedAt still true, the merge goes through and keeps the picked email", fresh.status === 200 && sql(`select email from fo_person where id = '${f4a.person.id}'`) === "lou.changed@example.org", fresh);
  sql(`insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, created_by) values (gen_random_uuid(), (select id from workspace order by created_at limit 1), 'sample-firm', '${A}', (select coalesce(max(client_number), 9000) + 1 from case_client where firm_key = 'sample-firm'), 'Lena Sample', 'PERSON', '${L1}', 'seed:fo9b')`);
  const u5 = await call("POST", `/front-office/duplicates/merges/${auto.mergeRef}/undo`, tR, {});
  ok("FO-9b F5 fail: Undo of a merge whose survivor became a case-side client since → 409 NEEDS_CASE_SIDE, nothing undone", u5.status === 409 && u5.body.code === "NEEDS_CASE_SIDE" && sql(`select merged_into_id from fo_person where id = '${L2}'`) === L1, u5);
  const c6 = await call("POST", `/front-office/duplicates/review/${PN}/merge`, tR, { survivorId: noor.person.id, choices: { emial: "LOSER" } });
  const c6p = await fetch(`${BASE}/front-office/duplicates/review/${PN}/merge`, { method: "POST", headers: { authorization: `Bearer ${tR}`, "content-type": "application/json" }, body: `{"survivorId":"${noor.person.id}","choices":{"__proto__":"LOSER"}}` });
  const c8 = await fetch(`${BASE}/front-office/duplicates/review/${PN}/merge`, { method: "POST", headers: { authorization: `Bearer ${tR}`, "content-type": "application/json" }, body: `{"survivorId":"${noor.person.id}","updatedAt":{"survivor":"2026-11-23T00:00:00Z","loser":"2026-11-23T00:00:00Z","__proto__":{"x":1}}}` });
  ok("FO-9b R2-8 fail: a __proto__ key inside updatedAt → 422 naming it", c8.status === 422 && Object.keys(((await c8.json()) as { fields?: object }).fields ?? {}).includes("updatedAt.__proto__"));
  ok("FO-9b F6 fail: choices with an unknown field (emial) or __proto__ → 422 naming it, nothing merged", c6.status === 422 && Object.keys(c6.body.fields ?? {}).some((k) => k.includes("emial")) && c6p.status === 422 && sql(`select status from fo_dup_review where id = '${PN}'`) === "OPEN", [c6, c6p.status]);
  const q7 = await call("GET", "/front-office/duplicates/merges?x=1", tR);
  ok("FO-9b F7 fail: an unknown query field on the Merged tab → 422 naming it", q7.status === 422 && !!q7.body.fields?.x, q7);

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
