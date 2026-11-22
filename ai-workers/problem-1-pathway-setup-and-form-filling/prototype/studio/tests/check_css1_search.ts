// CS-S1 part 2 (BACKLOG CS-S1, brief design/briefs/CS-S1.md part 2; map row 102, R1.102; contract v0.1 §3.1; AG-7-88
// rules 1, 4, 5, 7; AG-7-75 rule 3): caseScope, the case party search (PartySearchPort's real adapter) and the case
// finder on the one find door (PF-30a's FindRegistry). Named cases CS-S1 DW6-DW12 and the scope's own, each a pass and
// a fail. One scratch database with every migration and the two Sample firms' staff (seedSampleFirms); cases and
// clients are written with the replica role (no stage or release needed), people and answers normally, so part 1's
// triggers fill the index. PartySearchPort's contract runs on the fake and on the adapter. No server, no browser, no
// model call (US$0). Every value is Sample. The database is dropped at the end.
//   tsx studio/tests/check_css1_search.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runContract } from "../ports/contracts/contract.ts";
import { partySearchPortContract, type PartySearchWorld } from "../ports/contracts/party-search-port.contract.ts";
import { FindResult } from "../ports/find.ts";
import { fakePartySearch } from "../ports/party-search.ts";
import { caseScope, caseScopeWhere } from "../api/src/case-access.ts";
import { CASE_ENTITIES } from "../api/src/case-feed.ts";
import { FindRegistry } from "../api/src/platform/find/registry.ts";
import { dutiesOf, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { CaseFinder } from "../api/src/search/case-finder.ts";
import { CasePartySearch, phoneOf, SEARCH_ROWS } from "../api/src/search/party-search.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_css1s_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const qt = (s: string) => `'${s.replace(/'/g, "''")}'`;
const refused = async (f: () => unknown) => { try { await f(); return false; } catch { return true; } };

// The fake's contract needs no database: the five Sample parties, one hidden, in one firm.
const FAKE_FIRM = "00000000-0000-4000-8000-0000000000f1";
const fakeWorld = (): PartySearchWorld => ({
  port: fakePartySearch(FAKE_FIRM), viewer: { firmId: FAKE_FIRM, staffId: randomUUID() }, outsider: { firmId: "00000000-0000-4000-8000-0000000000f2", staffId: randomUUID() },
  seen: { name: "Sample Client Avery", email: "avery.client@example.test" }, phoned: { name: "Sample Sponsor Casey", phone: "+14165550199" }, hidden: { name: "Sample Hidden Emery" },
});
await runContract(partySearchPortContract, "fakePartySearch", fakeWorld, ok);
ok("CS-S1 pass: the firm's country is the phone's default (CA reads 416-555-0101)", phoneOf("416-555-0101", "CA") === "+14165550101" && phoneOf("+1 416 555 0101", "GB") === "+14165550101");
ok("CS-S1 fail: text that is no phone number gives none", phoneOf("555", "CA") === null && phoneOf("Dupont", "CA") === null);

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
  const R = ctxOf("user-R"), T = ctxOf("user-T"), SOLO = ctxOf("user-S");
  const without = (c: StaffContext, ...gone: string[]): StaffContext => ({ ...c, keys: c.keys.filter((k) => !gone.includes(k)) });
  const ownOnly = (c: StaffContext) => without(c, "agent/case:view.all");
  ok("CS-S1 setup: user-R and user-T are staff of the Sample firm with agent/case:view.all and view.own; user-S is the solo firm's",
    R.firmId === A && T.firmId === A && SOLO.firmId === B && A !== B && R.keys.includes("agent/case:view.all") && T.keys.includes("agent/case:view.own") && R.keys.includes("agent/case:show"), { R: R.roles, T: T.roles });

  // ------------------------------------------------------------------------------------------ fixtures (all Sample)
  const KEYS = ["person.given_names", "person.family_name", "person.email", "person.phone_number", "organisation.employer_name"];
  const W = randomUUID(), field = Object.fromEntries(KEYS.map((k) => [k, randomUUID()]));
  sql(`insert into workspace (id, key, label) values ('${W}', 'css1s-${W.slice(0, 8)}', 'CS-S1 part 2 (Sample)');
    insert into person_role (id, workspace_id, role_key, label, meaning, takes_part_in_case, may_be_applicant) values
      ('${randomUUID()}', '${W}', 'principal', 'Principal', 'Sample', true, true), ('${randomUUID()}', '${W}', 'spouse_or_partner', 'Spouse', 'Sample', true, true);
    set session_replication_role = replica;
    ${KEYS.map((k) => `insert into canonical_field (id, workspace_id, canonical_field_key, data_type, value_type, meaning, status, updated_by, version, subject_kind, scope, origin)
      values ('${field[k]}', '${W}', '${k}', 'STRING', 'text', 'Sample', 'PUBLISHED', 'css1', 1, 'person', 'CLIENT_LEVEL', 'HUMAN');`).join("\n")}`);
  let n = 0;
  /** A case of a firm with its client (written with the replica role: a fixture needs no stage, release or counter). */
  const newCase = (firmKey: string, clientName: string, o: { fileOwner?: string; status?: string } = {}) => {
    const id = randomUUID(), client = randomUUID(), number = `C-2026-${String(++n).padStart(5, "0")}`, firm = firmId(firmKey);
    sql(`set session_replication_role = replica;
      insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, file_owner, created_by) values ('${client}', '${W}', '${firmKey}', '${firm}', ${n}, ${qt(clientName)}, 'PERSON', '${randomUUID()}', ${o.fileOwner ? qt(o.fileOwner) : "null"}, 'css1');
      insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id, client_id, status, closed_at, close_outcome, closed_reason)
        values ('${id}', '${W}', '${randomUUID()}', 'user-P', 'user-O', '${number}', '${firmKey}', '${firm}', '${client}', ${o.status === "CLOSED" ? "'CLOSED', now(), 'CLOSED_BY_STAFF', 'Sample'" : "'OPEN', null, null, null"})`);
    return { id, number, client };
  };
  const person = (caseId: string, role: string, profileName: string) => {
    const party = randomUUID(), subject = randomUUID();
    sql(`insert into party (id, workspace_id) values ('${party}', '${W}');
      insert into party_profile (id, workspace_id, party_id, display_name) values ('${randomUUID()}', '${W}', '${party}', ${qt(profileName)});
      insert into answer_subject (id, workspace_id, party_id, subject_kind, label) values ('${subject}', '${W}', '${party}', '${role}', ${qt(profileName)});
      insert into case_participant (id, workspace_id, case_id, subject_id, role, "order") values ('${randomUUID()}', '${W}', '${caseId}', '${subject}', '${role}', (select coalesce(max("order"), 0) + 1 from case_participant where case_id = '${caseId}'));`);
    return { party, subject };
  };
  /** An answer, as the write sites store one: the current version superseded by the new one, in one transaction. */
  const answer = (who: { party: string; subject: string }, key: string, value: unknown) => {
    const id = randomUUID();
    sql(`begin; update client_canonical_answer set superseded_by_id = '${id}' where subject_id = '${who.subject}' and canonical_field_key = '${key}' and row_key is null and superseded_by_id is null;
      insert into client_canonical_answer (id, workspace_id, party_id, subject_id, canonical_field_id, canonical_field_key, value_json, status, source_json)
        values ('${id}', '${W}', '${who.party}', '${who.subject}', '${field[key]}', '${key}', ${qt(JSON.stringify(value))}::jsonb, 'DECLARED', '{"channel":"questionnaire"}'); commit;`);
  };
  const named = (who: { party: string; subject: string }, given: string, family: string) => { answer(who, "person.given_names", given); answer(who, "person.family_name", family); };
  const indexId = (subject: string) => sql(`select id from case_party_index where subject_id = '${subject}'`);

  // Case 1 (firm A): Marie Dupont, owned by nobody; user-T sits on its team. Case 2 (firm A): Paul Tremblay, no team for T.
  // Case 3 (firm A): its client's file owner is user-T. Case 4 (firm B): another Dupont, with Marie's email and phone.
  const c1 = newCase("sample-firm", "Marie Dupont (Sample)"), c2 = newCase("sample-firm", "Paul Tremblay (Sample)"), c3 = newCase("sample-firm", "Owned Client (Sample)", { fileOwner: T.staffId, status: "CLOSED" });
  const c4 = newCase("sample-solo", "Solo Dupont (Sample)");
  const marie = person(c1.id, "principal", "Marie Dupont (Sample)"); named(marie, "Marie", "Dupont");
  answer(marie, "person.email", "Dupont@X.com"); answer(marie, "person.phone_number", { country_code: "1", number: "416-555-0101" });
  const jean = person(c1.id, "spouse_or_partner", "Jean Dupont (Sample)"); named(jean, "Jean", "Dupont");
  const paul = person(c2.id, "principal", "Paul Tremblay (Sample)"); named(paul, "Paul", "Tremblay"); answer(paul, "person.email", "paul@x.com"); answer(paul, "person.phone_number", { country_code: "1", number: "416-555-0177" });
  const owned = person(c3.id, "principal", "Olga Ownedcase (Sample)"); named(owned, "Olga", "Ownedcase"); answer(owned, "person.email", "olga@x.com"); answer(owned, "person.phone_number", { country_code: "1", number: "416-555-0133" });
  const solo = person(c4.id, "principal", "Solo Dupont (Sample)"); named(solo, "Solange", "Dupont"); answer(solo, "person.email", "dupont@x.com"); answer(solo, "person.phone_number", { country_code: "1", number: "416-555-0101" });
  sql(`insert into case_team_member (id, workspace_id, case_id, user_id, role, assigned_by) values ('${randomUUID()}', '${W}', '${c1.id}', 'user-T', 'OFFICER', 'user-O')`);
  const teamRow = randomUUID();
  sql(`insert into case_team_member (id, workspace_id, case_id, user_id, role, assigned_by, ended_at, ended_by, end_reason) values ('${teamRow}', '${W}', '${c2.id}', 'user-T', 'OFFICER', 'user-O', now(), 'user-O', 'Sample')`);
  ok("CS-S1 setup: part 1's triggers indexed the five people, each under its case's firm", sql("select count(*) from case_party_index") === "5" && sql(`select firm_id from case_party_index where subject_id = '${solo.subject}'`) === B);

  const search = new CasePartySearch(db), registry = new FindRegistry();
  new CaseFinder(registry, search).onModuleInit();
  const find = (who: StaffContext, q: string) => registry.find(who, q);
  const hits = (r: FindResult, kind?: string) => r.groups.flatMap((g) => g.hits).filter((h) => !kind || h.kind === kind);

  // ------------------------------------------------------------------------------------------ caseScope (the one rule)
  const seen = async (who: Parameters<typeof caseScope>[1]) => (await db.case.findMany({ where: caseScopeWhere(await caseScope(db, who)), select: { id: true } })).map((c) => c.id).sort();
  const sorted = (...ids: string[]) => ids.sort();
  ok("CS-S1 scope pass: agent/case:view.all sees every case of the firm", JSON.stringify(await seen(R)) === JSON.stringify(sorted(c1.id, c2.id, c3.id)));
  ok("CS-S1 scope fail: view.all never reaches another firm's case", !(await seen(R)).includes(c4.id) && JSON.stringify(await seen(SOLO)) === JSON.stringify([c4.id]));
  ok("CS-S1 scope pass: view.own alone sees the case whose team the person is on (an open row) and the one whose client's file owner they are", JSON.stringify(await seen(ownOnly(T))) === JSON.stringify(sorted(c1.id, c3.id)));
  ok("CS-S1 scope fail: view.own alone does not see a case where the person's team row has ended, nor one they have no part in", !(await seen(ownOnly(T))).includes(c2.id) && (await seen(ownOnly(R))).length === 0);
  ok("CS-S1 scope fail: with neither key no case is seen", (await seen(without(T, "agent/case:view.all", "agent/case:view.own"))).length === 0);
  ok("CS-S1 scope pass: a caller with ids only has the keys read from the live role grants (the guard's own tables)", JSON.stringify(await seen({ firmId: T.firmId, staffId: T.staffId })) === JSON.stringify(sorted(c1.id, c2.id, c3.id)));
  ok("CS-S1 scope fail: a staff id that is not a staff member of that firm (firm B's person named with firm A's id) sees nothing", (await seen({ firmId: A, staffId: SOLO.staffId })).length === 0);

  // ------------------------------------------------------------------------------------------ DW6: name, email, phone
  const mId = indexId(marie.subject);
  const ids = (r: FindResult) => hits(r, "case_person").map((h) => h.id);
  const byName = await find(R, "Dupont"), byEmail = await find(R, "DUPONT@x.com"), byPlus = await find(R, "+1 416 555 0101"), byLocal = await find(R, "416-555-0101");
  ok("CS-S1 DW6 pass: \"Dupont\", \"DUPONT@x.com\", \"+1 416 555 0101\" and \"416-555-0101\" find the same person, each opening her case",
    [byName, byEmail, byPlus, byLocal].every((r) => ids(r).includes(mId) && FindResult.safeParse(r).success) && hits(byEmail)[0].id === mId && hits(byEmail)[0].url === `/cases/${c1.id}`
    && hits(byEmail)[0].matched_on.includes("EMAIL") && hits(byLocal)[0].matched_on.includes("PHONE") && hits(byName).find((h) => h.id === mId)?.matched_on.includes("NAME"), { byName, byEmail, byPlus, byLocal });
  ok("CS-S1 DW6 pass: the hit names the person, her role and her case number", hits(byEmail)[0].title === "Marie Dupont" && hits(byEmail)[0].subtitle === `Principal · case ${c1.number}`, hits(byEmail)[0]);
  ok("CS-S1 DW6 pass: \"Dupnt\" (one letter off) still finds her (Sample threshold), and \"Dup\" finds her by the start of a name", ids(await find(R, "Dupnt")).includes(mId) && ids(await find(R, "Dup")).includes(mId));
  ok("CS-S1 DW6 fail: \"Zz\", another address (dupont@x.org) and another number (416-555-0109) find nothing", hits(await find(R, "Zz")).length === 0 && hits(await find(R, "dupont@x.org")).length === 0 && hits(await find(R, "416-555-0109")).length === 0);
  ok("CS-S1 DW6 fail: \"upon\" (inside a word, not its start, and too unlike) does not find her; a name with % or _ is read as typed", !ids(await find(R, "upon")).includes(mId) && hits(await find(R, "%%")).length === 0 && hits(await find(R, "D_pont%")).length === 0);

  const zw = await search.find(R, { name: "d\u200b" }), nul = await search.find(R, { name: "Du\u0000pont" }), nulNumber = await search.find(R, { caseNumber: `${c1.number}\u0000` }), nulDoor = await find(R, "Du\u0000pont");
  ok("CS-S1 DW6 fail (breaker m1): a letter with an invisible mark (\"d\" + U+200B) is no 2-character search: no one is named or counted", zw.parties.length === 0 && zw.hidden_count === 0, zw);
  ok("CS-S1 DW6 pass (breaker m3): a NUL byte in the text is dropped, never a database error: the name and the case number still find", nul.parties.some((p) => p.recordId === mId) && nulNumber.cases[0]?.caseId === c1.id && !nulDoor.partial, { nul, nulNumber, nulDoor });

  // ------------------------------------------------------------------------------------------ DW7: the case number
  const byNumber = await find(R, c2.number.toLowerCase());
  ok("CS-S1 DW7 pass: a case number (typed in lower case) finds its case first, named with its client and opening the case page",
    hits(byNumber)[0]?.kind === "case" && hits(byNumber)[0].id === c2.id && hits(byNumber)[0].title === `${c2.number} · Paul Tremblay (Sample)` && hits(byNumber)[0].url === `/cases/${c2.id}` && hits(byNumber)[0].matched_on[0] === "NUMBER" && hits(byNumber, "case").length === 1, byNumber);
  const byStart = await find(R, "C-2026");
  ok("CS-S1 DW7 pass: the start of a number (\"C-2026\") lists the firm's cases; a closed one is labelled", hits(byStart, "case").length === 3 && hits(byStart, "case").find((h) => h.id === c3.id)?.subtitle === "Closed case", byStart);
  ok("CS-S1 DW7 fail: a number no case has (C-2026-00999) finds no case", hits(await find(R, "C-2026-00999"), "case").length === 0);
  ok("CS-S1 DW7 fail: through PartySearchPort a case number is not a search field (refused)", await refused(() => search.search(R, { case_number: c2.number } as never)));

  // ------------------------------------------------------------------------------------------ DW8: hidden matches
  const tOwn = ownOnly(T);
  const hiddenP = await search.search(tOwn, { name: "Tremblay" }), shownP = await search.search(T, { name: "Tremblay" });
  ok("CS-S1 DW8 pass: view.own only, not on case 2's team: its person is not named, hidden_count is 1 and needs_confirmation_by_role names the file owner and a firm admin",
    hiddenP.matches.length === 0 && hiddenP.hidden_count === 1 && JSON.stringify(hiddenP.needs_confirmation_by_role) === JSON.stringify(["FILE_OWNER", "FIRM_ADMIN"]), hiddenP);
  ok("CS-S1 DW8 fail: with view.all the same person is named and nothing is hidden", shownP.matches.length === 1 && shownP.matches[0].displayName === "Paul Tremblay" && shownP.matches[0].caseNumber === c2.number && shownP.hidden_count === 0 && shownP.needs_confirmation_by_role.length === 0, shownP);
  const hEmail = await search.find(tOwn, { email: "paul@x.com" }), hPhone = await search.find(tOwn, { phone: "416 555 0177" }), hNumber = await search.find(tOwn, { caseNumber: c2.number });
  ok("CS-S1 DW8 pass: the hidden person's exact email and phone, and the hidden case's own number, are only counted too", [hEmail, hPhone, hNumber].every((r) => r.parties.length === 0 && r.cases.length === 0 && r.hidden_count === 1), { hEmail, hPhone, hNumber });
  const fHidden = [await find(tOwn, "Tremblay"), await find(tOwn, "paul@x.com"), await find(tOwn, c2.number)];
  ok("CS-S1 DW8 pass: on the find door the hidden person and case are in no hit (no id, name or number of case 2)", fHidden.every((r) => !JSON.stringify(r).includes(c2.id) && !JSON.stringify(r).includes("Tremblay") && !JSON.stringify(r).includes(c2.number)), fHidden);
  const mixed = await search.search(tOwn, { name: "Dupont" });
  ok("CS-S1 DW8 fail: the same viewer still finds the people on the case they are on the team of (2 named, none hidden)", mixed.matches.length === 2 && mixed.hidden_count === 0 && hits(await find(tOwn, c1.number), "case")[0]?.id === c1.id, mixed);
  ok("CS-S1 DW8 fail: without agent/case:show the case side finds nothing on the door", hits(await find(without(R, "agent/case:show"), "Dupont")).length === 0);
  // The port's caller passes ids only: the keys are read from the role grants. Take view.all from user-T's roles.
  sql(`delete from platform_role_permission where permission_key = 'agent/case:view.all' and role::text = any(string_to_array('${T.roles.join(",")}', ','))`);
  const viaGrants = await search.search({ firmId: T.firmId, staffId: T.staffId }, { name: "Tremblay" });
  ok("CS-S1 DW8 pass: a port caller with ids only whose roles lost view.all gets the same count and no name", viaGrants.matches.length === 0 && viaGrants.hidden_count === 1 && viaGrants.needs_confirmation_by_role.length === 2, viaGrants);

  // ------------------------------------------------------------------------------------------ DW9: firm A never sees firm B
  const sId = indexId(solo.subject);
  const aAll = [await find(R, "Dupont"), await find(R, "dupont@x.com"), await find(R, "4165550101"), await find(R, c4.number), await find(R, "Solange")];
  ok("CS-S1 DW9 pass: firm A, searching the name, email and phone firm B's person shares, and firm B's case number, never gets firm B's person or case",
    aAll.every((r) => !JSON.stringify(r).includes(sId) && !JSON.stringify(r).includes(c4.id) && !JSON.stringify(r).includes("Solange")) && hits(aAll[3], "case").length === 0 && hits(aAll[4]).length === 0, aAll);
  const aPort = await search.search(R, { name: "Solange Dupont", email: "dupont@x.com", phone: "+14165550101" });
  ok("CS-S1 DW9 pass: another firm's person is absent, not hidden: firm A's port search counts no hidden match for it", aPort.hidden_count === 0 && aPort.matches.every((m) => m.caseId === c1.id) && (await search.find(R, { caseNumber: c4.number })).hidden_count === 0, aPort);
  const bSees = await find(SOLO, "dupont@x.com"), bPort = await search.search(SOLO, { name: "Marie Dupont" });
  ok("CS-S1 DW9 fail: firm B finds its own person by that email and none of firm A's (by name: nothing of case 1, hidden_count 0)",
    ids(bSees).length === 1 && ids(bSees)[0] === sId && bPort.matches.every((m) => m.caseId === c4.id) && bPort.hidden_count === 0 && hits(await find(SOLO, "Tremblay")).length === 0, { bSees, bPort });

  const stray = await search.find({ firmId: A, staffId: SOLO.staffId, keys: ["agent/case:view.all", "agent/case:view.own"] }, { name: "Dupont" }), strayIds = await search.find({ firmId: A, staffId: SOLO.staffId }, { name: "Dupont", caseNumber: c1.number });
  ok("CS-S1 DW9 fail (breaker m4): a caller naming firm A with firm B's staff id gets no name and no count, whatever keys it passes", [stray, strayIds].every((r) => r.parties.length === 0 && r.cases.length === 0 && r.hidden_count === 0), { stray, strayIds });

  // ------------------------------------------------------------------------------------------ DW10: the one find door
  ok("CS-S1 DW10 pass: the case finder is registered as \"case\" and its hits come back grouped as case and case_person", JSON.stringify(registry.modules()) === JSON.stringify(["case"])
    && JSON.stringify((await find(R, c1.number)).groups.map((g) => g.kind)) === JSON.stringify(["case"]) && JSON.stringify(byName.groups.map((g) => g.kind)) === JSON.stringify(["case_person"]) && !byName.partial);
  ok("CS-S1 DW10 fail: a second registration under \"case\" is refused (one finder per module)", await refused(() => new CaseFinder(registry, search).onModuleInit()));
  const lines = (a: { displayName: string }[]) => a.map((m) => m.displayName);
  const employer = person(c1.id, "case", "Case 1 stage 1 (Sample)"), employer2 = person(c1.id, "case", "Case 1 stage 2 (Sample)");
  answer(employer, "organisation.employer_name", "Sample Employer Ltd"); answer(employer2, "organisation.employer_name", "Sample Employer Ltd");
  ok("CS-S1 DW10 pass: an employer indexed once per stage is one hit on the door, and two matches for the port (each row is unique)", hits(await find(R, "Sample Employer"), "case_person").length === 1
    && JSON.stringify(lines((await search.find(R, { name: "Sample Employer" })).parties)) === JSON.stringify(["Sample Employer Ltd", "Sample Employer Ltd"]));

  // ------------------------------------------------------------------------------------------ the index follows an edit
  named(jean, "Jean", "Lafleur");
  ok("CS-S1 pass (trigger): an answer edited later is found under its new value", hits(await find(R, "Lafleur")).some((h) => h.id === indexId(jean.subject)));
  ok("CS-S1 fail (trigger): and no longer under the old one", !ids(await find(R, "Jean Dupont")).includes(indexId(jean.subject)) && (await search.find(R, { name: "Dupont" })).parties.every((p) => p.recordId !== indexId(jean.subject)));

  // ------------------------------------------------------------------------------------------ DW11: the audit line
  const auditCount = () => Number(sql("select count(*) from audit_event where entity = 'case search'"));
  const before = auditCount();
  await find(R, "Dupont"); await search.find(R, { name: "Dupont" });
  ok("CS-S1 DW11 fail: the find door's finder writes no audit line (it only reads)", auditCount() === before);
  const audited = await search.search(tOwn, { name: "Tremblay", email: "Dupont@X.com", phone: "416-555-0101" });
  const line = JSON.parse(sql("select row_to_json(x) from (select actor, action, entity, entity_key, summary, detail, firm_id, case_id from audit_event where entity = 'case search' order by at desc limit 1) x")) as Record<string, unknown>;
  const detail = line.detail as { fields: string[]; shown: number; hidden: number };
  ok("CS-S1 DW11 pass: a port search writes one line: who, the fields searched and the counts, on the searcher's firm",
    auditCount() === before + 1 + 0 && line.actor === `staff:${T.staffId}` && line.firm_id === A && line.case_id === null && JSON.stringify(detail.fields) === JSON.stringify(["name", "email", "phone"]) && detail.shown === 1 && detail.hidden === 1 && Object.keys(detail).length === 3
    && audited.hidden_count === 1 && audited.matches.length === 1 && CASE_ENTITIES.has("case search"), line);
  ok("CS-S1 DW11 fail: the line holds none of the searched values, no found name and no case number", ["tremblay", "dupont", "x.com", "416555", "0101", "marie", c1.number.toLowerCase(), c2.number.toLowerCase()].every((v) => !JSON.stringify(line).toLowerCase().includes(v)), line);
  const failing = new CasePartySearch(db); failing.audit = { record: async () => { throw new Error("forced audit failure"); } };
  ok("CS-S1 DW11 fail: when the audit line cannot be written the search answers nothing (fail-closed)", await refused(() => failing.search(R, { name: "Dupont" })) && auditCount() === before + 1);

  // ------------------------------------------------------------------------------------------ DW12: FO-13's stored shape
  const stored = (m: unknown[]) => sql(`select fo_compliance_matches_ok(${qt(JSON.stringify(m))}::jsonb)`) === "t";
  const real = (await search.search(R, { name: "Dupont", email: "dupont@x.com" })).matches, fake = (await fakePartySearch(A).search({ firmId: A, staffId: R.staffId }, { email: "avery.client@example.test" })).matches;
  ok("CS-S1 DW12 pass: every match the adapter and the fake return, wrapped as FO-13c stores it (source CASE), passes fo_compliance_matches_ok", real.length >= 1 && fake.length === 1 && stored([...real, ...fake].map((m) => ({ source: "CASE", ...m }))), { real, fake });
  ok("CS-S1 DW12 fail: a lowercase roleOnCase, or a matchedOn of CASE_NUMBER, does not pass it", !stored([{ source: "CASE", ...real[0], roleOnCase: "principal" }]) && !stored([{ source: "CASE", ...real[0], matchedOn: ["CASE_NUMBER"] }]));
  ok("CS-S1 DW12 pass: recordId is the index row's id (stable per person), with the case's client id", real.find((m) => m.recordId === mId)?.clientId === c1.client && real.find((m) => m.recordId === mId)?.kind === "CLIENT" && real.find((m) => m.recordId === mId)?.score === 1);

  // ------------------------------------------------------------------------------------------ ranking: email, then phone, then name
  const ranked = await search.search(R, { name: "Tremblay", email: "dupont@x.com" });
  ok("CS-S1 pass (ranking): an exact email ranks above a name match (Marie by EMAIL first, Paul by NAME after)", ranked.matches[0]?.recordId === mId && ranked.matches[0].matchedOn.includes("EMAIL") && ranked.matches.at(-1)?.displayName === "Paul Tremblay", ranked);
  const rankedPhone = await search.search(R, { name: "Olga Ownedcase", phone: "416 555 0101" });
  ok("CS-S1 fail (ranking): a name match never ranks above an exact phone (Marie by PHONE first, Olga by NAME after)", rankedPhone.matches[0]?.recordId === mId && rankedPhone.matches[0].matchedOn.includes("PHONE") && rankedPhone.matches.at(-1)?.displayName === "Olga Ownedcase", rankedPhone);

  // ------------------------------------------------------------------------------------------ the count survives the row cap (review M2)
  // 55 people on case 1 (user-T sees it: team row) and 3 on case 2 (hidden from T), all named "Bulkname <n>", made in one
  // statement per case so part 1's triggers index them at commit.
  const bulk = (caseId: string, from: number, count: number) => sql(`with p as (select gen_random_uuid() as party, gen_random_uuid() as subject, ${from} + g as n from generate_series(0, ${count - 1}) g),
      a as (insert into party (id, workspace_id) select party, '${W}' from p),
      b as (insert into party_profile (id, workspace_id, party_id, display_name) select gen_random_uuid(), '${W}', party, 'Bulkname ' || n from p),
      c as (insert into answer_subject (id, workspace_id, party_id, subject_kind, label) select subject, '${W}', party, 'spouse_or_partner', 'Bulkname ' || n from p)
    insert into case_participant (id, workspace_id, case_id, subject_id, role, "order") select gen_random_uuid(), '${W}', '${caseId}', subject, 'spouse_or_partner', 100 + n from p`);
  bulk(c1.id, 1, 55); bulk(c2.id, 101, 3);
  ok("CS-S1 setup (cap): the 58 bulk people are indexed", sql("select count(*) from case_party_index where name_norm like 'bulkname %'") === "58");
  const capped = await search.search({ firmId: T.firmId, staffId: T.staffId }, { name: "Bulkname" });
  ok(`CS-S1 DW8 pass (cap, review M2): with 55 visible and 3 hidden matches, ${SEARCH_ROWS} are named and all 3 hidden are still counted (the count is taken before the row cap)`,
    capped.matches.length === SEARCH_ROWS && capped.hidden_count === 3 && capped.needs_confirmation_by_role.length === 2 && capped.matches.every((m) => m.caseId === c1.id), { n: capped.matches.length, hidden: capped.hidden_count });
  const cappedAll = await search.search(R, { name: "Bulkname" });
  ok("CS-S1 DW8 fail (cap): for a viewer who sees all, nothing is hidden and the answer is still capped", cappedAll.matches.length === SEARCH_ROWS && cappedAll.hidden_count === 0 && cappedAll.needs_confirmation_by_role.length === 0, { n: cappedAll.matches.length, hidden: cappedAll.hidden_count });

  // ------------------------------------------------------------------------------------------ the port's contract on the adapter
  // user-T's roles hold view.own only now (above): T sees case 1 (team) and case 3 (file owner), not case 2.
  const world = (): PartySearchWorld => ({ port: search, viewer: { firmId: T.firmId, staffId: T.staffId }, outsider: { firmId: SOLO.firmId, staffId: SOLO.staffId },
    seen: { name: "Olga Ownedcase", email: "olga@x.com" }, phoned: { name: "Olga Ownedcase", phone: "+14165550133" }, hidden: { name: "Paul Tremblay" } });
  await runContract(partySearchPortContract, "CasePartySearch", world, ok);
} finally {
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
}
console.log(`\ncheck_css1_search: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
