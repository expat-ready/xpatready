// FO-9b part 1 (BACKLOG row FO-9b; briefs design/lead-b-briefs/FO-9b.md "Part 1" and design/briefs/track-b/FO-9b-1.md;
// R1.29; P-574 (2); AG-2-16 rules 1, 2, 2b, 4, 5, 8, 10, 11, §10): merge and Undo of two person (or company) records and
// the PersonMergePort adapter, each Done-when line with a pass and a fail, on one scratch database dropped at the end.
// Merges run as the app (xr_app under PF-12's firm walls, walledPool); data is written through the sales services.
// The migration is measured right after it applies (every migration up to and including it, then the rest; rows rev
// 16.7). Every value is Sample. US$0, no model call.
//   tsx studio/tests/check_fo9b_merge.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runContract } from "../ports/contracts/contract.ts";
import { personMergePortContract, type PersonMergeHarness } from "../ports/contracts/person-merge-port.contract.ts";
import { EVENT, PersonMergePayload } from "../ports/events.ts";
import { PersonMergeRefused, type MergeRefusalCode } from "../ports/person-merge.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { COLUMNS } from "../api/src/front-office/duplicates/merge/columns.ts";
import { PersonMergeAdapter } from "../api/src/front-office/duplicates/merge/port.ts";
import { MergeBusy } from "../api/src/front-office/duplicates/merge/service.ts";
import { isBusy } from "../api/src/busy.ts";
import { Duplicates, wonDuplicates } from "../api/src/front-office/duplicates/service.ts";
import { possibleMatch } from "../api/src/front-office/sales/arrival.ts";
import { Activity } from "../api/src/front-office/sales/calls.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { Prospects } from "../api/src/front-office/sales/prospects.ts";
import type { SalesPorts } from "../api/src/front-office/sales/public.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { oneQueryPerCaller, walledPool, withFirm } from "../api/src/platform/firm-scope.ts";
import { dutiesOf, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { clearingConflicts } from "./lib/conflict-clear.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), NEW = "20261122100000_fo9b_person_merge";
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo9b_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sqlErr = (q: string) => { try { sql(q); return ""; } catch (e) { return String((e as { stderr?: string }).stderr ?? e); } };
const apply = (d: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
const count = (t: string, where = "true") => Number(sql(`select count(*) from ${t} where ${where}`));
const refusedAs = async (fn: () => Promise<unknown>, code: MergeRefusalCode) => { try { await fn(); return false; } catch (e) { return e instanceof PersonMergeRefused && e.code === code ? true : String(e); } };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
let walled: PrismaClient | null = null;
try {
  // ------------------------------------------------------------------------------------- the migration, right after it applies
  const all = readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort();
  ok("FO-9b setup: its stamp is later than every migration before it and unique", all.filter((d) => d < NEW).every((d) => d.slice(0, 14) < NEW.slice(0, 14)) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1);
  for (const d of all.filter((x) => x <= NEW)) apply(d);
  const cascades = sql(`select string_agg(conrelid::regclass::text || ':' || confupdtype::text, ',' order by conrelid::regclass::text) from pg_constraint where contype = 'f' and confrelid = 'fo_lead'::regclass and conname like '%lead_id_person_id_fkey'`);
  ok("FO-9b DW1 pass: right after its migration the lead-level keys of fo_arrival_receipt, fo_call and fo_note cascade on update", cascades === "fo_arrival_receipt:c,fo_call:c,fo_note:c", cascades);
  ok("FO-9b DW1 fail: the other lead keys stay RESTRICT (attribution, prospect, previous lead)", sql(`select string_agg(distinct confupdtype::text, '') from pg_constraint where contype = 'f' and confrelid = 'fo_lead'::regclass and conname not like '%lead_id_person_id_fkey'`) === "r");
  ok("FO-9b setup: fo_dup_merge is walled (forced policy) and its trigger functions run as the wall reader",
    sql(`select relforcerowsecurity from pg_class where relname = 'fo_dup_merge'`) === "t" && sql(`select string_agg(distinct pg_get_userbyid(proowner), ',') from pg_proc where proname in ('fo_dup_merge_write', 'fo_dup_merge_no_delete', 'fo_sales_insert_only')`) === "xr_wall_reader");
  for (const d of all.filter((x) => x > NEW)) apply(d);

  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("FO-9b setup: both Sample firms have a front office", fo.failed.length === 0);
  const firm = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firm("sample-firm"), B = firm("sample-solo");
  const ctxOf = (actorId: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey: firmId === A ? "sample-firm" : "sample-solo", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R"), SOLO = ctxOf("user-S");
  ok("FO-9b setup: R (firm A) and S (firm B) hold agent/prospect:merge", R.keys.includes("agent/prospect:merge") && SOLO.keys.includes("agent/prospect:merge"));
  const ws = await platformAuditWorkspaceId(db as never);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: ws });
  const consent = new ConsentStore(auditEvent);
  const ports: SalesPorts = { audit: auditEvent, consent, publicOrigin: "http://localhost:4400" };
  const leads = new Leads(db, ports), pros = new Prospects(db, ports), act = new Activity(db, ports), dup = new Duplicates(db);
  clearingConflicts(db, { prospects: Prospects.prototype });
  const add = (p: Record<string, unknown>) => leads.add(R, { requestId: randomUUID(), source: "Phone call", confirmedNew: true, ...p }) as Promise<{ id: string; person: { id: string } }>;

  walled = new PrismaClient({ adapter: new PrismaPg(walledPool(URL_)) });
  oneQueryPerCaller(walled);
  const w = walled;
  const merger = new PersonMergeAdapter();
  const inFirm = <T,>(f: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) => withFirm(f, () => w.$transaction((t) => fn(t)));
  const merge = (input: Parameters<PersonMergeAdapter["mergePersons"]>[2], ctx = R, f = A, m = merger) => inFirm(f, (t) => m.mergePersons(t, ctx, input));
  const undo = (ref: string, ctx = R) => inFirm(A, (t) => merger.unmergePersons(t, ctx, ref));

  // ------------------------------------------------------------------------------------- DW2: every column, from the schema
  const NAMING = `
    with fk as (select c.conrelid::regclass::text as t, a.attname::text as c from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
                 where c.contype = 'f' and c.confrelid in ('fo_person'::regclass, 'fo_company'::regclass) and a.attname <> 'firm_id'),
         named as (select table_name::text as t, column_name::text as c from information_schema.columns where table_schema = 'public' and column_name ~ '(^|_)(person|company)_id$'),
         poly as (select c.table_name::text as t, 'subject_id' as c from information_schema.columns c where c.table_schema = 'public' and c.column_name = 'subject_kind'
                   and c.udt_name in (select t.typname from pg_type t join pg_enum e on e.enumtypid = t.oid where e.enumlabel in ('FO_PERSON', 'FRONT_OFFICE_PERSON', 'FO_COMPANY')))
    select string_agg(x, ',' order by x) from (select distinct t || '.' || c as x from (select * from fk union select * from named union select * from poly) u) v`;
  const live = sql(NAMING).split(","), listed = Object.keys(COLUMNS).sort();
  ok("FO-9b DW2 pass: every column that names a front-office person or company (keys, *_person_id / *_company_id, FO_PERSON subjects) is classified MOVE, COPY or STAYS with its reason, and nothing listed is gone",
    JSON.stringify(live) === JSON.stringify(listed) && Object.values(COLUMNS).every(([, why]) => why.length > 10), { unlisted: live.filter((c) => !listed.includes(c)), gone: listed.filter((c) => !live.includes(c)) });
  const withNew = sql(`begin; alter table fo_call add column other_person_id uuid; ${NAMING}; rollback;`).split("\n").filter((l) => l.includes(".")).pop()!.split(",");
  ok("FO-9b DW2 fail: a new column naming a person (fo_call.other_person_id, in a rolled-back transaction) is unlisted, so the check turns red", withNew.includes("fo_call.other_person_id") && !listed.includes("fo_call.other_person_id"));

  // ------------------------------------------------------------------------------------- a pair with history (DW1, DW3, DW5)
  const sv = await add({ givenNames: "Maya", familyName: "Singh", email: "maya.s@example.org", phone: "+1 416 555 0111" });
  const ls = await add({ givenNames: "Maya", familyName: "Singh-Rao", email: "maya.rao@example.org", phone: "+1 416 555 0122", note: "Asked about study permits (Sample)." });
  const ls2 = await add({ personId: ls.person.id });
  const S = sv.person.id, L = ls.person.id;
  await act.logCall(R, { kind: "lead", id: ls.id }, { direction: "OUT", outcome: "CONNECTED" });
  await act.addNote(R, { kind: "lead", id: ls2.id }, { text: "Second enquiry (Sample)." });
  sql(`insert into fo_lead_attribution (firm_id, lead_id, utm_source, utm_campaign) values ('${A}', '${ls.id}', 'sample', 'fo9b')`);
  sql(`insert into fo_note (firm_id, person_id, visibility, text, by_actor) values ('${A}', '${L}', 'INTERNAL', 'A note on the person only (Sample).', 'staff:${R.staffId}')`);
  const pr = await pros.engage(R, ls2.id) as { id: string };
  const flagged = await leads.add(R, { requestId: randomUUID(), source: "Phone call", confirmedNew: true, givenNames: "M.", familyName: "Rao", phone: "+1 416 555 0122" }) as { id: string; person: { id: string } };
  const flagBefore = sql(`select possible_match_person_id from fo_lead where id = '${flagged.id}'`);
  const co = randomUUID();
  sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${co}', '${A}', 'Pine Bakeries (Sample)', 'pine bakeries', 'seed:fo9b', now());
       insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${co}', '${S}', 'HR', 'seed:fo9b'), ('${A}', '${co}', '${L}', 'HR', 'seed:fo9b'), ('${A}', '${co}', '${L}', 'BILLING', 'seed:fo9b')`);
  await db.$transaction(async (t) => {
    await consent.record(t, { firmId: A, subject: { kind: "FO_PERSON", id: L }, channel: "EMAIL", purpose: "MARKETING", basis: "IMPORT_DECLARED", source: "IMPORT_DECLARED", recordedKind: "USER", recordedBy: `staff:${R.staffId}` });
    await consent.withdraw(t, { firmId: A, subject: { kind: "FO_PERSON", id: L }, channel: "EMAIL", purpose: "MARKETING", via: "STAFF", by: `staff:${R.staffId}` });
  });
  ok("FO-9b setup: the loser has two leads (a call, three notes, an attribution, a prospect with its stage move), a company link duplicating the survivor's, a withdrawn consent; a third person's lead is flagged as a possible match of the loser",
    count("fo_lead", `person_id = '${L}'`) === 2 && count("fo_call", `person_id = '${L}'`) === 1 && count("fo_note", `person_id = '${L}'`) === 3 && count("fo_stage_move", `prospect_id = '${pr.id}'`) === 1 && flagBefore === L);

  // The exact state Undo must give back: every MOVE cell naming either record, link ends, both records' fields.
  const moveCols = Object.entries(COLUMNS).filter(([, [k]]) => k === "MOVE").map(([tc]) => tc.split("."));
  const state = (ids: string[]) => sql(`select string_agg(x, '|' order by x) from (
      ${moveCols.map(([t, c]) => `select '${t}.${c}:' || id || '=' || ${c} as x from ${t} where ${c} in (${ids.map((i) => `'${i}'`).join(",")})`).join(" union all ")}
      union all select 'link:' || id || '=' || coalesce(valid_to::text, 'live') from fo_company_contact where person_id in (${ids.map((i) => `'${i}'`).join(",")})
      union all select 'person:' || id || '=' || (to_jsonb(p) - 'updated_at')::text from fo_person p where id in (${ids.map((i) => `'${i}'`).join(",")})) s`);
  const before = state([S, L, flagged.person.id]);
  const noteText = sql(`select string_agg(text || by_actor || created_at::text, '|' order by id) from fo_note where person_id = '${L}'`);

  // ------------------------------------------------------------------------------------- DW1: the guided merge
  const { merge_ref: ref } = await merge({ kind: "PERSON", survivor_fo_id: S, loser_fo_id: L, choices: { familyName: "LOSER", email: "SURVIVOR", phone: "LOSER" }, reason: "Same person, two enquiries (Sample)." });
  const [fam, mail, ph, e164] = sql(`select family_name || '|' || email || '|' || phone || '|' || phone_e164 from fo_person where id = '${S}'`).split("|");
  ok("FO-9b DW1 pass: the guided merge keeps the chosen value per field (family name and phone from the loser, email the survivor's), the phone key recomputed", fam === "Singh-Rao" && mail === "maya.s@example.org" && ph === "+14165550122" && e164 === "+14165550122", { fam, mail, ph, e164 });
  ok("FO-9b DW1 fail: a field not chosen keeps the default (given name equal on both: the survivor's)", sql(`select given_names from fo_person where id = '${S}'`) === "Maya");
  const onLoser = moveCols.map(([t, c]) => `${t}.${c}:${count(t, `${c} = '${L}'`)}`).filter((x) => !x.endsWith(":0"));
  ok("FO-9b DW1 pass: every lead, note, call, receipt, link, prospect and flag sits on the survivor; no MOVE column names the tombstone (rule 5)",
    onLoser.length === 0 && count("fo_lead", `person_id = '${S}'`) === 3 && count("fo_note", `person_id = '${S}'`) === 3 && count("fo_call", `person_id = '${S}'`) === 1
      && count("fo_arrival_receipt", `person_id = '${S}'`) === 3 && sql(`select subject_person_id::text || primary_contact_person_id::text from fo_prospect where id = '${pr.id}'`) === S + S, onLoser);
  ok("FO-9b DW1 pass: the attribution and the stage move stay on their (moved) lead and prospect; the notes' text, author and time never change",
    count("fo_lead_attribution", `lead_id = '${ls.id}'`) === 1 && count("fo_stage_move", `prospect_id = '${pr.id}'`) === 1 && sql(`select string_agg(text || by_actor || created_at::text, '|' order by id) from fo_note where id in (select id from fo_note where lead_id in ('${ls.id}', '${ls2.id}') or (lead_id is null and text like 'A note on the person%'))`) === noteText);
  ok("FO-9b DW1 pass: the loser is a tombstone on the survivor (merged_into_id, merged_at), never deleted; the flagged lead points at the survivor (rule 10)",
    sql(`select merged_into_id from fo_person where id = '${L}'`) === S && sql(`select merged_at is not null from fo_person where id = '${L}'`) === "t" && sql(`select possible_match_person_id from fo_lead where id = '${flagged.id}'`) === S);
  ok("FO-9b DW1 pass: the survivor's duplicate HR link is kept; the loser's is ended and moved; its BILLING link moved live",
    count("fo_company_contact", `person_id = '${S}' and valid_to is null`) === 2 && count("fo_company_contact", `person_id = '${S}' and role = 'HR' and valid_to is not null`) === 1);
  const mrow = sql(`select kind || '|' || survivor_id || '|' || loser_id || '|' || automatic || '|' || by || '|' || (loser_snapshot->'loser'->>'email') || '|' || jsonb_array_length(loser_snapshot->'changes') from fo_dup_merge where id = '${ref}'`).split("|");
  ok("FO-9b DW1 pass: one merge record with the loser's full row, every change and who did it; one audit line (no contact value) and one person.merged outbox row, ids only",
    mrow[0] === "PERSON" && mrow[1] === S && mrow[2] === L && mrow[3] === "false" && mrow[4] === `staff:${R.staffId}` && mrow[5] === "maya.rao@example.org" && Number(mrow[6]) >= 8
      && count("audit_event", `action = 'person.merged' and entity_key = '${L}'`) === 1 && sql(`select count(*) from audit_event where action = 'person.merged' and entity_key = '${L}' and (detail::text ~ 'example.org|416555')`) === "0"
      && sql(`select payload::text from module_event where type = 'person.merged' and payload->>'mergeRef' = '${ref}'`) === JSON.stringify({ kind: "PERSON", loserId: L, mergeRef: ref, survivorId: S }).replace(/,/g, ", ").replace(/:/g, ": "), mrow);
  // the enabler, on the live database
  const noteId = sql(`select id from fo_note where person_id = '${S}' limit 1`);
  ok("FO-9b DW1 fail: with fo_dup.merging unset, an UPDATE of a note's person_id is still refused", /written once/.test(sqlErr(`update fo_note set person_id = '${flagged.person.id}' where id = '${noteId}'`)));
  ok("FO-9b DW1 fail: with fo_dup.merging on, an UPDATE of a note's text is still refused (and of its person and text together)",
    /written once/.test(sqlErr(`begin; select set_config('fo_dup.merging', 'on', true); update fo_note set text = 'changed' where id = '${noteId}'; commit;`))
      && /written once/.test(sqlErr(`begin; select set_config('fo_dup.merging', 'on', true); update fo_note set text = 'changed', person_id = '${flagged.person.id}' where id = '${noteId}'; commit;`)));
  ok("FO-9b DW1 fail: a delete of a note, and an update of an attribution or a stage move, stay refused with the flag on",
    /written once/.test(sqlErr(`begin; select set_config('fo_dup.merging', 'on', true); delete from fo_note where id = '${noteId}'; commit;`))
      && /written once/.test(sqlErr(`begin; select set_config('fo_dup.merging', 'on', true); update fo_lead_attribution set utm_source = 'x' where lead_id = '${ls.id}'; commit;`)));
  ok("FO-9b DW1 fail: the merge record cannot be changed or deleted (only its Undo stamp, once)",
    /written once/.test(sqlErr(`update fo_dup_merge set reason = 'x' where id = '${ref}'`)) && /never removed/.test(sqlErr(`delete from fo_dup_merge where id = '${ref}'`)));
  const flagCode = readdirSync(join(STUDIO, "api", "src"), { recursive: true }).map(String).filter((f) => f.endsWith(".ts") && readFileSync(join(STUDIO, "api", "src", f), "utf8").includes("fo_dup.merging"));
  ok("FO-9b DW1 pass: only the merge service sets fo_dup.merging, and only transaction-local (set_config …, true)", JSON.stringify(flagCode) === JSON.stringify(["front-office/duplicates/merge/service.ts"])
    && /set_config\('fo_dup\.merging', 'on', true\)/.test(readFileSync(join(STUDIO, "api/src/front-office/duplicates/merge/service.ts"), "utf8")), flagCode);

  // ------------------------------------------------------------------------------------- DW3: consent copied, attribution kept
  const copies = sql(`select count(*) || '|' || count(*) filter (where withdrawn_at is not null) from msg_consent where subject_id = '${S}' and copied_from_id in (select id from msg_consent where subject_id = '${L}')`);
  ok("FO-9b DW3 pass: the loser's withdrawn marketing consent is on the survivor, copied withdrawn (rule 2b), and its withdrawal written for the survivor", copies === "1|1" && count("msg_consent_withdrawal", `subject_id = '${S}'`) === 1, copies);
  ok("FO-9b DW3 fail: the loser's own consent rows are untouched (never moved, never changed)", count("msg_consent", `subject_id = '${L}' and withdrawn_at is not null`) === 1 && count("msg_consent_withdrawal", `subject_id = '${L}'`) === 1);
  ok("FO-9b DW3 pass: the attribution row is kept and reached through the survivor's lead", Number(sql(`select count(*) from fo_lead_attribution a join fo_lead l on l.id = a.lead_id where l.person_id = '${S}' and a.utm_campaign = 'fo9b'`)) === 1);

  // ------------------------------------------------------------------------------------- DW1m: a tombstone is never a match
  const chk = await dup.check(R, { email: "maya.rao@example.org" });
  ok("FO-9b DW1m fail: FO-9a's check by the loser's own email (held by no live record) names and counts no one", chk.matches.length === 0 && chk.hidden === 0 && !JSON.stringify(chk).includes(L), chk);
  const chk2 = await dup.check(R, { phone: "416 555 0122" });
  ok("FO-9b DW1m pass: the check by the phone the survivor took names the survivor (and the third person who shares it), never the tombstone",
    chk2.matches.some((m) => m.kind === "PERSON" && m.personId === S) && !JSON.stringify(chk2).includes(L), chk2);
  ok("FO-9b DW1m fail: the possible match skips the tombstone (the loser's email → none); the survivor's email finds the survivor",
    (await possibleMatch(db, A, { givenNames: "x", familyName: null, email: "maya.rao@example.org", phone: null })) === null && (await possibleMatch(db, A, { givenNames: "x", familyName: null, email: "maya.s@example.org", phone: null })) === S);
  const fresh = await leads.add(R, { requestId: randomUUID(), source: "Phone call", givenNames: "Maya", email: "maya.rao@example.org" }) as { id: string; person: { id: string } };
  ok("FO-9b DW1m fail: Add a lead with only the loser's email asks no 409 KNOWN_PERSON and makes a new person", fresh.person.id !== L && fresh.person.id !== S);
  const wonDup = await wonDuplicates(db, A, { subject: "PERSON", personId: S });
  ok("FO-9b DW1m fail: the won-prospect duplicate result for the survivor never lists the tombstone (same name)", !wonDup.matches.some((m) => m.id === L), wonDup);
  const picked = await leads.add(R, { requestId: randomUUID(), source: "Phone call", personId: L }) as { id: string; person: { id: string } };
  ok("FO-9b DW1m pass: Add a lead with personId naming the tombstone is followed to its survivor (AG-2-68 rule 12)", picked.person.id === S && sql(`select person_id from fo_lead where id = '${picked.id}'`) === S);

  // ------------------------------------------------------------------------------------- DW5: Undo
  ok("FO-9b DW5 fail: Undo after something new reached the survivor (a lead and note just added) → 409 UNDO_REFUSED, nothing changed",
    (await refusedAs(() => undo(ref), "UNDO_REFUSED")) === true && sql(`select merged_into_id from fo_person where id = '${L}'`) === S && count("module_event", `type = 'person.unmerged'`) === 0);
  // A clean pair for the Undo itself (the first now holds new rows).
  const sv2 = await add({ givenNames: "Ivo", familyName: "Petrov", email: "ivo@example.org", phone: "+1 416 555 0133" });
  const ls3 = await add({ givenNames: "Ivo", familyName: "Petrov", email: "ivo.p@example.org", note: "Sample note." });
  const ls4 = await add({ personId: ls3.person.id });
  await act.logCall(R, { kind: "lead", id: ls3.id }, { direction: "IN", outcome: "CONNECTED" });
  const pr2 = await pros.engage(R, ls4.id) as { id: string };
  const flagged2 = await leads.add(R, { requestId: randomUUID(), source: "Phone call", confirmedNew: true, givenNames: "I.", email: "ivo.p@example.org" }) as { id: string; person: { id: string } };
  sql(`insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${co}', '${sv2.person.id}', 'OTHER', 'seed:fo9b'), ('${A}', '${co}', '${ls3.person.id}', 'OTHER', 'seed:fo9b')`);
  const S2 = sv2.person.id, L2 = ls3.person.id, ids2 = [S2, L2, flagged2.person.id];
  const typeId = sql(`insert into fo_consultation_type (id, firm_id, slug, name, modes, host_staff_ids, minutes, updated_at) values (gen_random_uuid(), '${A}', 'fo9b', 'Consult (Sample)', '{VIDEO}', '{${R.staffId}}', 30, now()) returning id`).split("\n")[0];
  const booking = sql(`insert into fo_booking (id, firm_id, type_id, staff_id, person_id, mode, starts_at, ends_at, visitor_time_zone, updated_at) values (gen_random_uuid(), '${A}', '${typeId}', '${R.staffId}', '${L2}', 'VIDEO', now() + interval '20 days', now() + interval '20 days 30 minutes', 'America/Toronto', now()) returning id`).split("\n")[0];
  const before2 = state(ids2);
  const m2 = await merge({ kind: "PERSON", survivor_fo_id: S2, loser_fo_id: L2 });
  const mid2 = state(ids2);
  const out = await undo(m2.merge_ref);
  const after2 = state(ids2);
  ok("FO-9b DW1 pass: the loser's booking moved to the survivor and came back with Undo", mid2.includes(`fo_booking.person_id:${booking}=${S2}`) && after2.includes(`fo_booking.person_id:${booking}=${L2}`));
  ok("FO-9b DW5 pass: Undo restores both records and exactly the moved rows (every MOVE cell, link end and both records' fields as before the merge)", out.restored === true && after2 === before2 && mid2 !== before2, { before2, after2 });
  ok("FO-9b DW5 pass: the prospect, its lead's notes and calls are back on the loser; the record carries its Undo stamp; one person.unmerged after person.merged",
    sql(`select subject_person_id from fo_prospect where id = '${pr2.id}'`) === L2 && count("fo_note", `person_id = '${L2}'`) === 1 && count("fo_call", `person_id = '${L2}'`) === 1
      && sql(`select undone_by from fo_dup_merge where id = '${m2.merge_ref}'`) === `staff:${R.staffId}` && sql(`select string_agg(type, ',' order by seq) from module_event where payload->>'mergeRef' = '${m2.merge_ref}'`) === "person.merged,person.unmerged");
  ok("FO-9b DW5 fail: a second Undo → 409 ALREADY_UNDONE", (await refusedAs(() => undo(m2.merge_ref), "ALREADY_UNDONE")) === true);
  ok("FO-9b DW5 fail: Undo of another firm's merge (firm B's caller) → 404; a reference that is no id → 404",
    (await refusedAs(() => inFirm(B, (t) => merger.unmergePersons(t, SOLO, ref)), "NOT_FOUND")) === true && (await refusedAs(() => undo("not-a-ref"), "NOT_FOUND")) === true);
  // Undo refused after a new note from the loser's channel, on a fresh merge of the same clean pair.
  const m3 = await merge({ kind: "PERSON", survivor_fo_id: S2, loser_fo_id: L2 });
  const mid3 = state(ids2);
  await act.addNote(R, { kind: "lead", id: ls3.id }, { text: "Came in by the old email (Sample)." });
  ok("FO-9b DW5 fail: Undo after the survivor got a new note on the loser's lead → 409 UNDO_REFUSED with the reason, nothing changed",
    (await refusedAs(() => undo(m3.merge_ref), "UNDO_REFUSED")) === true && state(ids2).replace(/fo_note\.person_id:[^|]*\|?/g, "") === mid3.replace(/fo_note\.person_id:[^|]*\|?/g, "") && sql(`select merged_into_id from fo_person where id = '${L2}'`) === S2);

  // Undo refusals for what reached the survivor after the merge (break M2, M3; review M2, m4): one fresh pair each.
  let pn = 0;
  const pairOf = async () => {
    const a = await add({ givenNames: "Pair", familyName: `Sample${++pn}`, email: `pair${pn}.a@example.org` });
    const b = await add({ givenNames: "Pair", familyName: `Sample${pn}`, email: `pair${pn}.b@example.org`, note: "Sample." });
    return { s: a.person.id, l: b.person.id, lLead: b.id };
  };
  const undoRefusedFor = async (what: string, after: (p: Awaited<ReturnType<typeof pairOf>>, ref: string) => Promise<void> | void, before?: (p: Awaited<ReturnType<typeof pairOf>>) => Promise<void> | void) => {
    const p = await pairOf();
    await before?.(p);
    const { merge_ref } = await merge({ kind: "PERSON", survivor_fo_id: p.s, loser_fo_id: p.l });
    await after(p, merge_ref);
    const r = await refusedAs(() => undo(merge_ref), "UNDO_REFUSED");
    ok(`FO-9b DW5 fail: Undo after ${what} → 409 UNDO_REFUSED, still merged`, r === true && sql(`select merged_into_id from fo_person where id = '${p.l}'`) === p.s, r);
  };
  await undoRefusedFor("staff changed the survivor's phone (never silently overwritten)", (p) => { sql(`update fo_person set phone = '+14165550199', updated_at = now() where id = '${p.s}'`); });
  await undoRefusedFor("Engage on the loser's moved lead", async (p) => { await pros.engage(R, p.lLead); });
  await undoRefusedFor("a consent recorded for the survivor", async (p) => { await db.$transaction((t) => consent.record(t, { firmId: A, subject: { kind: "FO_PERSON", id: p.s }, channel: "EMAIL", purpose: "MARKETING", basis: "IMPORT_DECLARED", source: "IMPORT_DECLARED", recordedKind: "USER", recordedBy: `staff:${R.staffId}` })); });
  await undoRefusedFor("the merge copied a live consent (consent rows are never removed)", () => undefined,
    async (p) => { await db.$transaction((t) => consent.record(t, { firmId: A, subject: { kind: "FO_PERSON", id: p.l }, channel: "EMAIL", purpose: "MARKETING", basis: "IMPORT_DECLARED", source: "IMPORT_DECLARED", recordedKind: "USER", recordedBy: `staff:${R.staffId}` })); });
  await undoRefusedFor("a moved row changed since (a moved company link re-pointed to the third person)", (p) => { sql(`update fo_company_contact set person_id = '${flagged2.person.id}' where person_id = '${p.s}' and role = 'SIGNATORY'`); },
    (p) => { sql(`insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${co}', '${p.l}', 'SIGNATORY', 'seed:fo9b')`); });
  await undoRefusedFor("a crafted merge record naming another column", (_p, ref) => { sql(`alter table fo_dup_merge disable trigger fo_dup_merge_write; update fo_dup_merge set loser_snapshot = jsonb_set(loser_snapshot, '{changes,0,c}', '"given_names"') where id = '${ref}'; alter table fo_dup_merge enable trigger fo_dup_merge_write;`); });

  // Rows written while a merge is open (break and review M1): the writer waits for the merge, then follows the tombstone
  // to its survivor (Add a lead with personId), or is refused by the database (a raw row naming the tombstone).
  const rp = await pairOf();
  let release!: () => void, merged!: () => void;
  const gate = new Promise<void>((r) => { release = r; }), mergedNow = new Promise<void>((r) => { merged = r; });
  const open = inFirm(A, async (t) => { await merger.mergePersons(t, R, { kind: "PERSON", survivor_fo_id: rp.s, loser_fo_id: rp.l }); merged(); await gate; });
  await mergedNow;
  const racing = leads.add(R, { requestId: randomUUID(), source: "Phone call", personId: rp.l }) as Promise<{ id: string; person: { id: string } }>;
  const rawNote = db.$executeRawUnsafe(`insert into fo_note (firm_id, person_id, visibility, text, by_actor) values ('${A}', '${rp.l}', 'INTERNAL', 'Raced (Sample).', 'staff:${R.staffId}')`).then(() => "written", (e) => String(e));
  await new Promise((r) => setTimeout(r, 400));
  release();
  await open;
  const raced = await racing, noteOut = await rawNote;
  ok("FO-9b DW4 pass: Add a lead naming the loser while the merge is open waits, then lands on the survivor", raced.person.id === rp.s && count("fo_lead", `person_id = '${rp.l}'`) === 0, raced);
  ok("FO-9b DW4 fail: a raw note naming the loser while the merge is open is refused once it commits (no row on the tombstone)", /merged-away/.test(noteOut) && count("fo_note", `person_id = '${rp.l}'`) === 0, noteOut);
  ok("FO-9b DW4 fail: a lead re-pointed onto a tombstone later is refused by the database", /merged-away/.test(sqlErr(`update fo_lead set person_id = '${rp.l}' where id = '${raced.id}'`)));
  ok("FO-9b DW4 fail: a new lead naming a tombstone (no note, no cascade) is refused by the database's own guard on fo_lead", /merged-away/.test(sqlErr(`insert into fo_lead (firm_id, person_id, number, door, source, created_by, updated_at) values ('${A}', '${rp.l}', 'L-x', 'MANUAL', 'Sample', 'seed:fo9b', now())`)));
  const guarded = sql(`select string_agg(tgrelid::regclass::text || ':' || encode(tgargs, 'escape'), ',' order by tgrelid::regclass::text) from pg_trigger where tgname = 'fo_dup_live_party'`).split(",")
    .flatMap((x) => { const [t, args] = x.split(":"); let company = false; return args.split("\\000").filter(Boolean).flatMap((c) => { if (c === "|") { company = true; return []; } void company; return [`${t}.${c}`]; }); }).sort();
  const moveList = Object.entries(COLUMNS).filter(([, [k]]) => k === "MOVE").map(([tc]) => tc).sort();
  ok("FO-9b DW2 pass: the database guard (fo_dup_live_party) covers exactly columns.ts's MOVE list", JSON.stringify(guarded) === JSON.stringify(moveList), { guarded, moveList });

  // B1 (round 2): the usual pair: the newer lead is flagged as a possible match of the older record; merged newer → older.
  const older = await add({ givenNames: "Oona", familyName: "Sample", email: "oona@example.org" });
  const newer = await leads.add(R, { requestId: randomUUID(), source: "Web", confirmedNew: true, givenNames: "Oona", familyName: "Sample", email: "oona@example.org", phone: "+1 416 555 0177" }) as { id: string; person: { id: string } };
  const flagWas = sql(`select possible_match_person_id from fo_lead where id = '${newer.id}'`);
  const before7 = state([older.person.id, newer.person.id]);
  let b1: unknown = null;
  try { b1 = await merge({ kind: "PERSON", survivor_fo_id: older.person.id, loser_fo_id: newer.person.id }); } catch (e) { b1 = String(e); }
  ok("FO-9b DW1 pass (round 2 B1): merging the newer record, whose lead is flagged as a possible match of the older one, into the older works; the flag is done (cleared), the lead on the older record",
    flagWas === older.person.id && typeof b1 === "object" && sql(`select coalesce(possible_match_person_id::text, 'none') || '|' || person_id from fo_lead where id = '${newer.id}'`) === `none|${older.person.id}`, { flagWas, b1 });
  if (typeof b1 === "object" && b1) await undo((b1 as { merge_ref: string }).merge_ref);
  ok("FO-9b DW5 pass (round 2 B1): its Undo puts the flag and the lead back exactly", state([older.person.id, newer.person.id]) === before7);

  // Round 2 M1: merges and Undos racing ordinary writers on the same person never deadlock (40P01); each writer either
  // lands on the survivor or is refused cleanly, and no row is left on a tombstone.
  const outcomes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const p = await pairOf();
    const r = await Promise.allSettled([
      merge({ kind: "PERSON", survivor_fo_id: p.s, loser_fo_id: p.l }),
      act.addNote(R, { kind: "lead", id: p.lLead }, { text: `Racing note ${i} (Sample).` }),
      act.logCall(R, { kind: "lead", id: p.lLead }, { direction: "OUT", outcome: "NO_ANSWER" }),
      leads.add(R, { requestId: randomUUID(), source: "Phone call", personId: p.l }),
    ]);
    outcomes.push(...r.map((x) => (x.status === "fulfilled" ? "ok" : String(x.reason))));
    const m = r[0].status === "fulfilled" ? (r[0].value as { merge_ref: string }).merge_ref : null;
    if (m && i % 2 === 0) {
      const u = await Promise.allSettled([undo(m), leads.add(R, { requestId: randomUUID(), source: "Phone call", personId: p.l }), act.addNote(R, { kind: "lead", id: p.lLead }, { text: "During Undo (Sample)." })]);
      outcomes.push(...u.map((x) => (x.status === "fulfilled" ? "ok" : String(x.reason))));
    }
  }
  const onTomb = Number(sql(`select count(*) from fo_person t where t.merged_into_id is not null and (exists (select 1 from fo_lead x where x.person_id = t.id) or exists (select 1 from fo_note x where x.person_id = t.id) or exists (select 1 from fo_call x where x.person_id = t.id))`));
  ok("FO-9b DW4 pass (round 2 M1): 8 merges racing a note, a call and an Add on the loser (4 with an Undo racing an Add and a note): no deadlock, no row on a tombstone",
    !outcomes.some((o) => /deadlock|40P01/i.test(o)) && onTomb === 0, { deadlocks: outcomes.filter((o) => /deadlock/i.test(o)).length, onTomb, failed: outcomes.filter((o) => o !== "ok").slice(0, 3) });

  // Break m4 remainder: a crafted record whose "loser" is live moves nothing; a forged Undo stamp is refused.
  const cp = await pairOf(), cp2 = await pairOf();
  const { merge_ref: cref } = await merge({ kind: "PERSON", survivor_fo_id: cp.s, loser_fo_id: cp.l });
  const forged = sqlErr(`update fo_dup_merge set undone_at = now(), undone_by = 'staff:x' where id = '${cref}'`);
  ok("FO-9b DW5 fail: a forged Undo stamp on a merge that still stands is refused by the database", /only once the merge is undone/.test(forged), forged);
  const craft = randomUUID();
  sql(`insert into fo_dup_merge (id, firm_id, kind, survivor_id, loser_id, loser_snapshot, survivor_before, choices, by, at)
       select '${craft}', firm_id, kind, '${cp2.s}', '${cp2.l}', loser_snapshot, survivor_before, choices, by, clock_timestamp() from fo_dup_merge where id = '${cref}'`);
  const before8 = state([cp2.s, cp2.l]);
  ok("FO-9b DW5 fail: Undo of a crafted record naming a live loser → 409 UNDO_REFUSED, nothing moved", (await refusedAs(() => undo(craft), "UNDO_REFUSED")) === true && state([cp2.s, cp2.l]) === before8);

  // Review round 2 m2: once the copied consent is withdrawn on the survivor, the Undo runs (the withdrawal stays).
  const wp = await pairOf();
  await db.$transaction((t) => consent.record(t, { firmId: A, subject: { kind: "FO_PERSON", id: wp.l }, channel: "EMAIL", purpose: "MARKETING", basis: "IMPORT_DECLARED", source: "IMPORT_DECLARED", recordedKind: "USER", recordedBy: `staff:${R.staffId}` }));
  const { merge_ref: wref } = await merge({ kind: "PERSON", survivor_fo_id: wp.s, loser_fo_id: wp.l });
  ok("FO-9b DW5 fail: Undo while the copied consent is live → refused", (await refusedAs(() => undo(wref), "UNDO_REFUSED")) === true);
  await db.$transaction((t) => consent.withdraw(t, { firmId: A, subject: { kind: "FO_PERSON", id: wp.s }, channel: "EMAIL", purpose: "MARKETING", via: "STAFF", by: `staff:${R.staffId}` }));
  const wout = await undo(wref).then(() => "ok", (e) => String(e));
  ok("FO-9b DW5 pass: after the copy is withdrawn on the survivor, the Undo runs; the withdrawn copy stays on the survivor", wout === "ok" && count("msg_consent", `subject_id = '${wp.s}' and withdrawn_at is not null`) === 1 && sql(`select coalesce(merged_into_id::text, 'live') from fo_person where id = '${wp.l}'`) === "live", wout);

  // Round 3 M1: writers that lock a record before its rows. Each holder takes its first lock, the merge starts and must
  // queue behind it without taking anything the holder needs next; then the holder takes its second lock and commits.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // Lead 5's ruling (round 4): merge and Undo never wait while holding locks (NOWAIT, back-off, then Busy), so the holder
  // always finishes; the merge either finishes after its back-off or answers Busy and then works when tried again.
  const outcome = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof MergeBusy ? "busy" : String(e)));
  const lockRace = async (what: string, first: string, second: string, run: () => Promise<unknown>, holdMs = 500) => {
    const holder = db.$transaction(async (t) => { await t.$queryRawUnsafe(first); await sleep(holdMs); await t.$queryRawUnsafe(second); }, { timeout: 20000 }).then(() => "ok", (e) => String(e));
    await sleep(150);
    const [h, m] = await Promise.all([holder, outcome(run())]);
    const again = m === "busy" ? await outcome(run()) : m;
    ok(`FO-9b DW4 pass (rounds 3-4 M1): ${what}: no deadlock; the writer finishes; the merge finishes (at once or after Busy)`, h === "ok" && (m === "ok" || m === "busy") && again === "ok", { holder: h.slice(0, 200), merge: m.slice(0, 200), again: again.slice(0, 200) });
  };
  const cA = randomUUID(), cB = randomUUID(), kA = await pairOf(), kB = await pairOf();
  sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${cA}', '${A}', 'Alder Co (Sample)', 'alder co', 'seed:fo9b', now()), ('${cB}', '${A}', 'Alder Company (Sample)', 'alder company', 'seed:fo9b', now());
       insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${cA}', '${kA.s}', 'HR', 'seed:fo9b'), ('${A}', '${cB}', '${kB.s}', 'HR', 'seed:fo9b')`);
  const linkB = sql(`select id from fo_company_contact where company_id = '${cB}'`);
  await lockRace("a company merge while a contact edit holds the company and then changes its link (Corporate changeRole's order)",
    `select 1 from fo_company where id = '${cB}' for update`, `update fo_company_contact set role = 'BILLING' where id = '${linkB}'`,
    () => merge({ kind: "COMPANY", survivor_fo_id: cA, loser_fo_id: cB }));
  const kC = await pairOf(), cC = randomUUID();
  sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${cC}', '${A}', 'Birch Co (Sample)', 'birch co', 'seed:fo9b', now());
       insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${cC}', '${kC.l}', 'HR', 'seed:fo9b')`);
  const linkC = sql(`select id from fo_company_contact where company_id = '${cC}'`);
  await lockRace("a person merge while a contact edit holds the loser's company and then changes the loser's link",
    `select 1 from fo_company where id = '${cC}' for update`, `update fo_company_contact set role = 'OTHER' where id = '${linkC}'`,
    () => merge({ kind: "PERSON", survivor_fo_id: kC.s, loser_fo_id: kC.l }));
  const kD = await pairOf(), prD = await pros.engage(R, kD.lLead) as { id: string };
  await lockRace("a person merge while a note on a prospect holds the prospect and then its lead (calls.ts's order)",
    `select 1 from fo_prospect where id = '${prD.id}' for update`, `select 1 from fo_lead where id = '${kD.lLead}' for update`,
    () => merge({ kind: "PERSON", survivor_fo_id: kD.s, loser_fo_id: kD.l }));
  // Round 4 M1: the Corporate writers whose order no fixed lock order can serve, and Undo against the same holders.
  const kG = await pairOf(), cG = randomUUID();
  sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${cG}', '${A}', 'Cedar Co (Sample)', 'cedar co', 'seed:fo9b', now());
       insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${cG}', '${kG.l}', 'HR', 'seed:fo9b')`);
  await lockRace("a person merge while Corporate engage holds the loser's lead and then the company it links (engage's order)",
    `select 1 from fo_lead where id = '${kG.lLead}' for update`, `select 1 from fo_company where id = '${cG}' for update`,
    () => merge({ kind: "PERSON", survivor_fo_id: kG.s, loser_fo_id: kG.l }));
  const kH = await pairOf(), cH = randomUUID(), prH = await pros.engage(R, kH.lLead) as { id: string };
  sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${cH}', '${A}', 'Dogwood Co (Sample)', 'dogwood co', 'seed:fo9b', now());
       insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${cH}', '${kH.l}', 'HR', 'seed:fo9b')`);
  await lockRace("a person merge while change-type holds the loser's prospect and then the company (changeType's order)",
    `select 1 from fo_prospect where id = '${prH.id}' for update`, `select 1 from fo_company where id = '${cH}' for update`,
    () => merge({ kind: "PERSON", survivor_fo_id: kH.s, loser_fo_id: kH.l }));
  const kI = await pairOf(), cI = randomUUID();
  sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${cI}', '${A}', 'Elm Co (Sample)', 'elm co', 'seed:fo9b', now());
       insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${cI}', '${kI.l}', 'SIGNATORY', 'seed:fo9b')`);
  const prI = await pros.engage(R, kI.lLead) as { id: string };
  const { merge_ref: iref } = await merge({ kind: "PERSON", survivor_fo_id: kI.s, loser_fo_id: kI.l });
  const linkI = sql(`select id from fo_company_contact where company_id = '${cI}'`);
  await lockRace("an Undo while a contact edit holds the moved link's company and then changes the link",
    `select 1 from fo_company where id = '${cI}' for update`, `select 1 from fo_company_contact where id = '${linkI}' for update`,
    () => undo(iref));
  const kJ = await pairOf(), prJ = await pros.engage(R, kJ.lLead) as { id: string };
  const { merge_ref: jref } = await merge({ kind: "PERSON", survivor_fo_id: kJ.s, loser_fo_id: kJ.l });
  await lockRace("an Undo while a note on the moved prospect holds the prospect and then its lead",
    `select 1 from fo_prospect where id = '${prJ.id}' for update`, `select 1 from fo_lead where id = '${kJ.lLead}' for update`,
    () => undo(jref));
  void prI;
  // A company merge and a person merge of people linked across the two companies, at once (round 4 M2), 10 times.
  const crossOut: string[] = [];
  for (let i = 0; i < 10; i++) {
    const x = randomUUID(), y = randomUUID(), kp = await pairOf();
    sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${x}', '${A}', 'Fir ${i} Co (Sample)', 'fir ${i} co', 'seed:fo9b', now()), ('${y}', '${A}', 'Fir ${i} Company (Sample)', 'fir ${i} company', 'seed:fo9b', now());
         insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${x}', '${kp.l}', 'HR', 'seed:fo9b'), ('${A}', '${y}', '${kp.s}', 'BILLING', 'seed:fo9b')`);
    const [first, second] = i % 2 ? [x, y] : [y, x];
    const r = await Promise.all([outcome(merge({ kind: "COMPANY", survivor_fo_id: first, loser_fo_id: second })), outcome(merge({ kind: "PERSON", survivor_fo_id: kp.s, loser_fo_id: kp.l }))]);
    crossOut.push(...r);
  }
  ok("FO-9b DW4 pass (round 4 M2): 10 company merges racing person merges of people linked across both companies: no deadlock (each finishes or answers Busy)",
    crossOut.every((o) => o === "ok" || o === "busy"), crossOut.filter((o) => o !== "ok" && o !== "busy").slice(0, 2));
  // Busy, then the caller's transaction is still usable (the savepoint), and nothing was merged.
  const kK = await pairOf(), cK = randomUUID();
  sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${cK}', '${A}', 'Grove Co (Sample)', 'grove co', 'seed:fo9b', now());
       insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${cK}', '${kK.l}', 'HR', 'seed:fo9b')`);
  const longHold = db.$transaction(async (t) => { await t.$queryRawUnsafe(`select 1 from fo_company where id = '${cK}' for update`); await sleep(2500); }, { timeout: 20000 });
  await sleep(150);
  let busyOut = "", after = "";
  await inFirm(A, async (t) => {
    try { await merger.mergePersons(t, R, { kind: "PERSON", survivor_fo_id: kK.s, loser_fo_id: kK.l }); busyOut = "merged"; } catch (e) { busyOut = e instanceof MergeBusy ? "busy" : String(e); }
    after = (await t.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int as n from fo_person where id = '${kK.l}'`))[0].n === 1 ? "usable" : "?";
  });
  await longHold;
  ok("FO-9b DW4 fail (Lead 5's ruling): a lock held past the back-off → MergeBusy (55P03, busy.ts reads it as try again); the caller's transaction stays usable; nothing merged",
    busyOut === "busy" && after === "usable" && isBusy(new MergeBusy()) && sql(`select coalesce(merged_into_id::text, 'live') from fo_person where id = '${kK.l}'`) === "live", { busyOut, after });
  // A crafted standing record for a live loser → a later merge of that loser answers ALREADY_MERGED (no raw P2002).
  const kL = await pairOf(), kM = await pairOf();
  const { merge_ref: lref } = await merge({ kind: "PERSON", survivor_fo_id: kM.s, loser_fo_id: kM.l });
  sql(`insert into fo_dup_merge (firm_id, kind, survivor_id, loser_id, loser_snapshot, survivor_before, choices, by) select firm_id, kind, '${kL.s}', '${kL.l}', loser_snapshot, survivor_before, choices, by from fo_dup_merge where id = '${lref}'`);
  ok("FO-9b DW4 fail (round 4 m4″): a loser with a standing (crafted) merge record → 409 ALREADY_MERGED before anything is written",
    (await refusedAs(() => merge({ kind: "PERSON", survivor_fo_id: kL.s, loser_fo_id: kL.l }), "ALREADY_MERGED")) === true && count("fo_lead", `person_id = '${kL.l}'`) === 1);

  // An arrival whose possible match is merged while it is in flight (round 2-3 m1): it waits, then flags no tombstone.
  const kE = await pairOf();
  let rel2!: () => void, merged2!: () => void;
  const gate2 = new Promise<void>((r) => { rel2 = r; }), mergedNow2 = new Promise<void>((r) => { merged2 = r; });
  const open2 = inFirm(A, async (t) => { await merger.mergePersons(t, R, { kind: "PERSON", survivor_fo_id: kE.s, loser_fo_id: kE.l }); merged2(); await gate2; });
  await mergedNow2;
  const arriving = leads.add(R, { requestId: randomUUID(), source: "Web", confirmedNew: true, givenNames: "Late", email: `pair${pn}.b@example.org` }).then((x) => x as { id: string }, (e) => String(e));
  await sleep(300);
  rel2();
  await open2;
  const arrived = await arriving;
  ok("FO-9b DW1m pass (round 3 m1): an arrival matching the loser while the merge is open waits, then saves without flagging the tombstone",
    typeof arrived === "object" && sql(`select coalesce(possible_match_person_id::text, 'none') from fo_lead where id = '${(arrived as { id: string }).id}'`) !== kE.l, arrived);
  // One standing merge per loser; the tombstone check on its own (break m4 remainder, review round 3 m3).
  const kF = await pairOf();
  const { merge_ref: fref } = await merge({ kind: "PERSON", survivor_fo_id: kF.s, loser_fo_id: kF.l });
  ok("FO-9b DW5 fail: a second standing merge record for the same loser cannot be written (crafted copy refused by the database)",
    /fo_dup_merge_one_standing|duplicate key/.test(sqlErr(`insert into fo_dup_merge (firm_id, kind, survivor_id, loser_id, loser_snapshot, survivor_before, choices, by) select firm_id, kind, survivor_id, loser_id, loser_snapshot, survivor_before, choices, by from fo_dup_merge where id = '${fref}'`)));
  sql(`update fo_person set merged_at = merged_at + interval '1 second' where id = '${kF.l}'`);
  ok("FO-9b DW5 fail: Undo of a record whose tombstone is not this merge's (merged_at differs) → 409 UNDO_REFUSED", (await refusedAs(() => undo(fref), "UNDO_REFUSED")) === true && sql(`select merged_into_id from fo_person where id = '${kF.l}'`) === kF.s);

  // The flag is off again once the merge returns (review m2): the same transaction cannot re-point an unrelated note.
  const fp = await pairOf(), other = await pairOf();
  let flagLeft = "";
  try {
    await inFirm(A, async (t) => {
      await merger.mergePersons(t, R, { kind: "PERSON", survivor_fo_id: fp.s, loser_fo_id: fp.l });
      await t.$executeRawUnsafe(`update fo_note set person_id = '${other.s}' where person_id = '${other.l}'`);
    });
  } catch (e) { flagLeft = String(e); }
  ok("FO-9b DW1 fail: after the merge returns, the caller's transaction cannot move another note (fo_dup.merging is off again)", /written once/.test(flagLeft) && count("fo_note", `person_id = '${other.l}'`) === 1 && sql(`select coalesce(merged_into_id::text, 'live') from fo_person where id = '${fp.l}'`) === "live", flagLeft);
  // A refusal changes nothing (review m1): two companies with two different primary contacts.
  const c1 = randomUUID(), c2 = randomUUID(), pc1 = await pairOf();
  sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${c1}', '${A}', 'Old Name Co (Sample)', 'old name co', 'seed:fo9b', now() - interval '1 day'), ('${c2}', '${A}', 'New Name Co (Sample)', 'new name co', 'seed:fo9b', now());
       insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${c1}', '${pc1.s}', 'PRIMARY', 'seed:fo9b'), ('${A}', '${c2}', '${pc1.l}', 'PRIMARY', 'seed:fo9b')`);
  let primaryOut: unknown = null;
  try { await inFirm(A, async (t) => { try { await merger.mergePersons(t, R, { kind: "COMPANY", survivor_fo_id: c1, loser_fo_id: c2 }); } catch (e) { primaryOut = e; } }); } catch (e) { primaryOut = e; }
  ok("FO-9b DW4 fail: two companies with two primaries → refused before anything is written (a caller that commits keeps nothing)",
    primaryOut instanceof PersonMergeRefused && primaryOut.code === "INVALID_INPUT" && sql(`select operating_name from fo_company where id = '${c1}'`) === "Old Name Co (Sample)" && count("fo_company_contact", `company_id in ('${c1}', '${c2}') and valid_to is not null`) === 0, String(primaryOut));

  // ------------------------------------------------------------------------------------- DW4: refusals and two merges at once
  const person = (g: string, f = A) => { const id = randomUUID(); sql(`insert into fo_person (id, firm_id, given_names, email, created_by, updated_at) values ('${id}', '${f}', '${g}', '${g.toLowerCase()}@example.org', 'seed:fo9b', now())`); return id; };
  const p1 = person("Ada"), p2 = person("Adah");
  const race = await Promise.allSettled([merge({ kind: "PERSON", survivor_fo_id: p1, loser_fo_id: p2 }), merge({ kind: "PERSON", survivor_fo_id: p1, loser_fo_id: p2 }), merge({ kind: "PERSON", survivor_fo_id: p2, loser_fo_id: p1 })]);
  const won = race.filter((r) => r.status === "fulfilled").length, lost = race.filter((r) => r.status === "rejected" && r.reason instanceof PersonMergeRefused && r.reason.code === "ALREADY_MERGED").length;
  ok("FO-9b DW4 pass: three merges of one pair at once → exactly one succeeds, the others 409 ALREADY_MERGED; one record, one event", won === 1 && lost === 2
    && count("fo_dup_merge", `survivor_id in ('${p1}', '${p2}')`) === 1 && count("module_event", `type = 'person.merged' and (payload->>'loserId' in ('${p1}', '${p2}'))`) === 1, race.map((r) => r.status === "rejected" ? String(r.reason) : "ok"));
  const p3 = person("Bea"), coB = randomUUID(), pB = person("Cleo", B);
  sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${coB}', '${A}', 'Bea Co (Sample)', 'bea co', 'seed:fo9b', now())`);
  ok("FO-9b DW4 fail: a self-merge → 400 SELF_MERGE; a person with a company → 409 KIND_MISMATCH",
    (await refusedAs(() => merge({ kind: "PERSON", survivor_fo_id: p3, loser_fo_id: p3 }), "SELF_MERGE")) === true && (await refusedAs(() => merge({ kind: "PERSON", survivor_fo_id: p3, loser_fo_id: coB }), "KIND_MISMATCH")) === true);
  ok("FO-9b DW4 fail: firm B's caller on firm A's pair → 404; firm A's caller naming firm B's person → 404; nothing changed",
    (await refusedAs(() => merge({ kind: "PERSON", survivor_fo_id: p3, loser_fo_id: person("Dot") }, SOLO, B), "NOT_FOUND")) === true
      && (await refusedAs(() => merge({ kind: "PERSON", survivor_fo_id: p3, loser_fo_id: pB }), "NOT_FOUND")) === true && count("fo_person", `merged_into_id = '${p3}'`) === 0);
  ok("FO-9b DW4 fail: without agent/prospect:merge → 403 MISSING_PERMISSION", (await refusedAs(() => merge({ kind: "PERSON", survivor_fo_id: p3, loser_fo_id: person("Eve") }, { ...R, keys: R.keys.filter((k) => k !== "agent/prospect:merge") }), "MISSING_PERMISSION")) === true);

  // ------------------------------------------------------------------------------------- DW6: a failure on the last step
  const f1 = await add({ givenNames: "Noor", familyName: "Ali", email: "noor@example.org" }), f2 = await add({ givenNames: "Noor", familyName: "Ali", email: "noor.a@example.org", note: "Sample." });
  const ids6 = [f1.person.id, f2.person.id], before6 = state(ids6), events6 = count("module_event"), merges6 = count("fo_dup_merge"), audits6 = count("audit_event", `action = 'person.merged'`);
  const failing = new PersonMergeAdapter({ emit: async () => { throw new Error("forced outbox failure"); } });
  let forced = "";
  try { await merge({ kind: "PERSON", survivor_fo_id: f1.person.id, loser_fo_id: f2.person.id }, R, A, failing); } catch (e) { forced = String(e); }
  ok("FO-9b DW6 pass: a forced failure on the last step (the outbox row) fails the merge", /forced outbox failure/.test(forced), forced);
  ok("FO-9b DW6 fail: … and nothing changed: no tombstone, no moved row, no field written, no record, no audit line, no event",
    state(ids6) === before6 && count("module_event") === events6 && count("fo_dup_merge") === merges6 && count("audit_event", `action = 'person.merged'`) === audits6);

  // ------------------------------------------------------------------------------------- DW9: the shared contract
  const harness = (): PersonMergeHarness => ({
    port: merger as never,
    tx: (fn) => inFirm(A, (t) => fn(t)),
    ctx: R as never,
    async seed(kind, f, updatedAt, otherFirm) {
      const id = randomUUID(), firmId = otherFirm ? B : A, lit = (v: string | null | undefined) => (v == null ? "null" : `'${v.replace(/'/g, "''")}'`);
      if (kind === "PERSON") sql(`insert into fo_person (id, firm_id, given_names, family_name, email, phone, language, time_zone, created_by, updated_at) values ('${id}', '${firmId}', ${lit(f.givenNames)}, ${lit(f.familyName)}, ${lit(f.email)}, ${lit(f.phone)}, ${lit(f.language)}, ${lit(f.timeZone)}, 'seed:fo9b', '${updatedAt.toISOString()}')`);
      else sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${id}', '${firmId}', ${lit(f.operatingName)}, lower(${lit(f.operatingName)}), 'seed:fo9b', '${updatedAt.toISOString()}')`);
      return id;
    },
    async read(id) {
      const p = sql(`select json_build_object('fields', json_build_object('givenNames', given_names, 'familyName', family_name, 'email', email, 'phone', phone, 'language', language, 'timeZone', time_zone), 'mergedIntoId', merged_into_id) from fo_person where id = '${id}'`)
        || sql(`select json_build_object('fields', json_build_object('operatingName', operating_name), 'mergedIntoId', merged_into_id) from fo_company where id = '${id}'`);
      return p ? JSON.parse(p) : null;
    },
    async events() {   // jsonb sorts keys: put them back in the payload schema's order (the contract compares JSON text)
      const rows = JSON.parse(sql(`select coalesce(json_agg(json_build_object('type', type, 'payload', payload) order by seq), '[]') from module_event where type in ('${EVENT.PERSON_MERGED}', '${EVENT.PERSON_UNMERGED}')`)) as { type: string; payload: unknown }[];
      return rows.map((r) => ({ type: r.type, payload: PersonMergePayload.parse(r.payload) }));
    },
    async addFromLoserChannel(mergeRef) { sql(`insert into fo_note (firm_id, person_id, visibility, text, by_actor) select firm_id, survivor_id, 'INTERNAL', 'By the old email (Sample).', 'staff:${R.staffId}' from fo_dup_merge where id = '${mergeRef}'`); },
  });
  const good = await runContract(personMergePortContract, "PersonMergeAdapter", harness, ok);
  ok("FO-9b DW9 pass: the adapter passes the shared PersonMergePort contract (a rolled-back caller merges nothing; Undo order; refusals)", good.failed.length === 0 && good.passed.length >= 8, good);
  const ownTx = await runContract(personMergePortContract, "ownTransaction", () => ({ ...harness(), port: { ...merger, mergePersons: (_t: unknown, c: never, i: never) => inFirm(A, (t) => merger.mergePersons(t, c, i)), unmergePersons: (t: never, c: never, r: string) => merger.unmergePersons(t, c, r) } as never }), null);
  ok("FO-9b DW9 fail: an adapter that opens its own transaction fails the contract (the caller's rollback must undo the merge)", ownTx.failed.some((n) => /rolls back/.test(n)), ownTx);
} catch (e) {
  fail++;
  console.log(`FAIL  FO-9b: the check stopped — ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  await walled?.$disconnect();
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\nFO-9b merge: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
