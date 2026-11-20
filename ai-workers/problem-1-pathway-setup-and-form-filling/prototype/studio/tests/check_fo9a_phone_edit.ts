// FO-9a phone part (R1.33; brief design/lead-b-briefs/FO-9a.md, amendment 19 Nov 11:23 IST, Lead B; rev 17.21 ruling):
// a staff edit of a person's phone, `PATCH /api/front-office/people/:personId` with `{ phone }` only. Each line with a
// pass and a fail, on one scratch database (every migration, PF-3's and FO-1a's Sample seeds), dropped at the end:
//   E1 an impossible number → 422 with the field's sentence, nothing saved; a readable one is saved in E.164 (its
//      country kept), "Fix number" clears on the lead and on the list, the database's phone_e164 follows;
//   E2 own or all as FO-2v: another firm's person, an unseen person and a malformed id are the same 404, nothing saved;
//   E3 `{ phone }` only: any other key, an empty phone, a control mark → 422, nothing saved;
//   E4 audited with ids only, never the number (PF-23);
//   E5 the route declares agent/prospect:edit; the app's own path under the firm walls (PF-12) saves in its firm only;
//   E6 the breaker's findings on b6b6b3d4: no 500 on a long number, no number without its E.164 key, no digit or
//      extension dropped, one sentence for every refusal, the same number again writes nothing.
// US$0, no model call.
//   tsx studio/tests/check_fo9a_phone_edit.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { PeopleEdit, PeopleEditController, PHONE_EDIT_ACTION, PHONE_REQUIRED, UNREADABLE_PHONE } from "../api/src/front-office/people/edit.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { Prospects } from "../api/src/front-office/sales/prospects.ts";
import type { SalesPorts } from "../api/src/front-office/sales/public.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { oneQueryPerCaller, walledPool, withFirm } from "../api/src/platform/firm-scope.ts";
import { assertEveryRouteDeclared } from "../api/src/platform/identity/guard.ts";
import { dutiesOf, PLATFORM_ACCESS, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin";   // on Linux, cloud-setup.sh's stand-ins
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo9ap_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
async function refusal(fn: () => Promise<unknown>): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try { await fn(); return null; } catch (e) {
    const x = e as { getStatus?: () => number; getResponse?: () => unknown };
    if (!x.getStatus) return { status: 0, body: { error: String(e) } };
    return { status: x.getStatus(), body: x.getResponse!() as Record<string, unknown> };
  }
}

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("FO-9a phone setup: both Sample firms have a front office", fo.failed.length === 0, fo.failed);
  const firm = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firm("sample-firm"), B = firm("sample-solo");
  const ctxOf = (actorId: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey: firmId === A ? "sample-firm" : "sample-solo", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R"), T = ctxOf("user-T"), SOLO = ctxOf("user-S");
  const ws = await platformAuditWorkspaceId(db as never);
  const seesAll = (value: boolean) => writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value, by: "system:test", workspaceId: ws });
  await seesAll(true);
  const ports: SalesPorts = { audit: auditEvent, consent: new ConsentStore(auditEvent), publicOrigin: "http://localhost:4400", formKey: Buffer.from("fo9a-phone-test-stamp-key (Sample, not a secret)") };
  const leads = new Leads(db, ports), people = new PeopleEdit(db, ports);
  const add = (who: StaffContext, p: Record<string, unknown>) => leads.add(who, { requestId: randomUUID(), source: "Phone call", confirmedNew: true, ...p }) as Promise<{ id: string; person: { id: string; phone: string | null; fixNumber: boolean } }>;
  const person = (id: string) => sql(`select coalesce(phone, '-') || '|' || phone_readable || '|' || coalesce(phone_e164, '-') from fo_person where id = '${id}'`);
  const audits = (id: string) => Number(sql(`select count(*) from audit_event where entity = 'fo_person' and entity_key = '${id}' and action = '${PHONE_EDIT_ACTION}'`));

  // ------------------------------------------------------------------------------------- E1: refuse the impossible, keep the readable
  const lena = await add(R, { givenNames: "Lena", familyName: "Fixnumber", phone: "12" });
  ok("FO-9a phone setup: a lead whose phone is \"12\" is kept as typed and shows Fix number (AG-2-84 rule 5)", lena.person.phone === "12" && lena.person.fixNumber === true && person(lena.person.id) === "12|false|-", { p: lena.person, db: person(lena.person.id) });
  const bad = await refusal(() => people.editPhone(R, lena.person.id, { phone: "12" }));
  ok("FO-9a phone E1 fail: staff entering \"12\" → 422 with the field's sentence, and nothing is saved (no audit line)",
    bad?.status === 422 && (bad.body.fields as Record<string, string>)?.phone === UNREADABLE_PHONE && person(lena.person.id) === "12|false|-" && audits(lena.person.id) === 0, { bad, db: person(lena.person.id) });
  const bad2 = await refusal(() => people.editPhone(R, lena.person.id, { phone: "555-01" }));
  ok("FO-9a phone E1 fail: a number too short to be a phone (555-01) is refused the same way", bad2?.status === 422 && (bad2.body.fields as Record<string, string>)?.phone === UNREADABLE_PHONE);
  const saved = await people.editPhone(R, lena.person.id, { phone: "+1 416 555 0100" });
  ok("FO-9a phone E1 pass: staff entering \"+1 416 555 0100\" → saved in E.164, Fix number cleared, the database's phone_e164 follows",
    saved.phone === "+14165550100" && saved.fixNumber === false && person(lena.person.id) === "+14165550100|true|+14165550100", { saved, db: person(lena.person.id) });
  const read = await leads.read(R, lena.id), row = (await leads.list(R, "all")).find((l) => l.id === lena.id);
  ok("FO-9a phone E1 pass: the lead no longer shows Fix number, and the list no longer flags it", read.person.fixNumber === false && read.person.phone === "+14165550100" && row?.fixNumber === false, { read: read.person, row });
  const uk = await add(R, { givenNames: "Uma", familyName: "Abroad", phone: "0044 20 79" });
  ok("FO-9a phone setup: a second lead with an unreadable phone", uk.person.fixNumber === true);
  const ukSaved = await people.editPhone(R, uk.person.id, { phone: "+44 20 7946 0000" });
  ok("FO-9a phone E1 pass: a number outside Canada keeps its country (+44 20 7946 0000 → +442079460000)", ukSaved.phone === "+442079460000" && person(uk.person.id) === "+442079460000|true|+442079460000", ukSaved);
  const local = await people.editPhone(R, uk.person.id, { phone: "(416) 555-0199" });
  ok("FO-9a phone E1 pass: a 10-digit number with no country is read as Canada's (Sample default region CA)", local.phone === "+14165550199");
  ok("FO-9a phone E1 fail: the earlier number is gone (one phone per person; nothing kept beside it)", !sql(`select phone from fo_person where id = '${uk.person.id}'`).includes("44"));

  // ------------------------------------------------------------------------------------- E2: own or all; another firm is 404
  const bea = await add(SOLO, { givenNames: "Bea", familyName: "Otherfirm", phone: "12" });
  const other = await refusal(() => people.editPhone(R, bea.person.id, { phone: "+1 416 555 0100" }));
  ok("FO-9a phone E2 fail: firm B's person, asked by firm A's Owner → 404, nothing saved", other?.status === 404 && person(bea.person.id) === "12|false|-" && audits(bea.person.id) === 0, other);
  ok("FO-9a phone E2 pass: firm B's Owner fixes their own person", (await people.editPhone(SOLO, bea.person.id, { phone: "+1 416 555 0101" })).phone === "+14165550101");
  ok("FO-9a phone E2 fail: a malformed id or an unknown id → 404", (await refusal(() => people.editPhone(R, "not-a-uuid", { phone: "+14165550100" })))?.status === 404 && (await refusal(() => people.editPhone(R, randomUUID(), { phone: "+14165550100" })))?.status === 404);
  await seesAll(false);
  const omar = await add(T, { givenNames: "Omar", familyName: "Own", phone: "12" });
  const notTs = await refusal(() => people.editPhone(T, lena.person.id, { phone: "+1 416 555 0102" }));
  ok("FO-9a phone E2 fail: with \"everyone sees all\" off, the Case Manager editing the Owner's person → 404, nothing saved", notTs?.status === 404 && person(lena.person.id) === "+14165550100|true|+14165550100", notTs);
  ok("FO-9a phone E2 pass: the Case Manager fixes the person on their own lead", (await people.editPhone(T, omar.person.id, { phone: "+1 416 555 0103" })).fixNumber === false);
  const una = await add(R, { givenNames: "Una", familyName: "Unassigned", phone: "12" }); sql(`update fo_lead set owner_staff_id = null where id = '${una.id}'`);
  ok("FO-9a phone E2 pass: an Unassigned lead's person, for someone who may see Unassigned leads (view.all, AG-2-13c rule 6)", (await people.editPhone(T, una.person.id, { phone: "+1 416 555 0104" })).phone === "+14165550104");
  // Review m3: a person seen only through a prospect the editor owns (Engage, then the prospect handed over), and a deactivated owner's lead counting as Unassigned.
  const pia = await add(R, { givenNames: "Pia", familyName: "Prospect", phone: "12" });
  const noProspect = await refusal(() => people.editPhone(T, pia.person.id, { phone: "+1 416 555 0111" }));
  await new Prospects(db, ports).engage(R, pia.id);   // FO-2 part 3's Engage: the lead stays the Owner's
  sql(`update fo_prospect set owner_staff_id = '${T.staffId}' where lead_id = '${pia.id}'`);   // handed to the Case Manager (Sample)
  ok("FO-9a phone E2 pass/fail (review m3): a person on no visible lead is 404 to the Case Manager until a prospect they own names them, then theirs to fix",
    noProspect?.status === 404 && (await people.editPhone(T, pia.person.id, { phone: "+1 416 555 0111" })).phone === "+14165550111", noProspect);
  const gus = await add(R, { givenNames: "Gus", familyName: "Inactive", phone: "12" });
  const before = await refusal(() => people.editPhone(T, gus.person.id, { phone: "+1 416 555 0112" }));
  sql(`update platform_staff set status = 'DEACTIVATED' where id = '${R.staffId}'`);
  const whileInactive = await people.editPhone(T, gus.person.id, { phone: "+1 416 555 0112" }).catch((e) => e);
  sql(`update platform_staff set status = 'ACTIVE' where id = '${R.staffId}'`);
  ok("FO-9a phone E2 pass/fail (review m3): the Owner's lead is 404 to the Case Manager while the Owner is active; once the Owner is deactivated the lead counts as Unassigned (BR-4) and is theirs to fix",
    before?.status === 404 && whileInactive?.phone === "+14165550112", { before, whileInactive: String(whileInactive?.phone ?? whileInactive) });
  await seesAll(true);
  ok("FO-9a phone E2 pass: with \"everyone sees all\" on, the Case Manager may fix the Owner's person", (await people.editPhone(T, lena.person.id, { phone: "+1 416 555 0110" })).phone === "+14165550110");

  // ------------------------------------------------------------------------------------- E3: { phone } only
  const kim = await add(R, { givenNames: "Kim", familyName: "Body", phone: "12", email: "kim@example.org" });
  const extra = await refusal(() => people.editPhone(R, kim.person.id, { phone: "+1 416 555 0105", email: "x@example.org" }));
  ok("FO-9a phone E3 fail: another key beside phone (email) → 422 naming it, nothing saved", extra?.status === 422 && "email" in ((extra.body.fields as object) ?? {}) && person(kim.person.id) === "12|false|-" && sql(`select email from fo_person where id = '${kim.person.id}'`) === "kim@example.org", extra);
  const empty = await refusal(() => people.editPhone(R, kim.person.id, { phone: "  " })), none = await refusal(() => people.editPhone(R, kim.person.id, {}));
  ok("FO-9a phone E3 fail: an empty phone or no phone → 422 \"Enter a phone number.\", nothing saved", empty?.status === 422 && (empty.body.fields as Record<string, string>)?.phone === PHONE_REQUIRED && none?.status === 422 && person(kim.person.id) === "12|false|-", { empty, none });
  const ctl = await refusal(() => people.editPhone(R, kim.person.id, { phone: "+1 416 555 0105\u0000" })), arr = await refusal(() => people.editPhone(R, kim.person.id, [{ phone: "+14165550105" }]));
  ok("FO-9a phone E3 fail: a control mark, a number that is not text, or a list → 422 (never a database error)", ctl?.status === 422 && arr?.status === 422 && (await refusal(() => people.editPhone(R, kim.person.id, { phone: 4165550105 })))?.status === 422);
  ok("FO-9a phone E3 pass: the same person with { phone } alone is saved", (await people.editPhone(R, kim.person.id, { phone: "416.555.0105" })).phone === "+14165550105");

  // ------------------------------------------------------------------------------------- E4: audited with ids only
  const lines = sql(`select summary || ' ' || detail::text || ' ' || actor from audit_event where entity = 'fo_person' and entity_key = '${lena.person.id}' and action = '${PHONE_EDIT_ACTION}'`).split("\n").filter(Boolean);
  ok("FO-9a phone E4 pass: each saved edit is one audit line on fo_person, naming the person and the staff member", lines.length === audits(lena.person.id) && lines.length === 2 && lines.every((l) => l.includes(lena.person.id) && (l.includes(`staff:${R.staffId}`) || l.includes(`staff:${T.staffId}`))), lines);
  // Ids are uuids, which may hold "555" by chance (re-review R1): they are removed before looking for a number.
  // R1.8 (QA-594, P-687): the numbers are the line's before and after values, in full; nowhere else on the line.
  const all = sql(`select string_agg(summary || ' ' || (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(detail) e(k, v) where k !~ '_(before|after)$')::text, ' ') from audit_event where action = '${PHONE_EDIT_ACTION}'`).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>");
  ok("FO-9a phone E4 fail: no audit line holds a number in its words or ids (no 4165550, no +44, no 7946)", !/4165550|\+44|7946|555/.test(all), all.slice(0, 300));
  const vals = sql(`select string_agg(coalesce(detail->>'phone_before', '-') || '>' || coalesce(detail->>'phone_after', '-'), ' ' order by at) from audit_event where entity_key = '${lena.person.id}' and action = '${PHONE_EDIT_ACTION}'`);
  ok("FO-9a phone E4 pass (R1.8, P-687): each line holds the number before and after in full, as phone_before and phone_after", vals.split(" ").length === 2 && vals.split(" ").every((v) => /^[^>]+>\+\d{6,15}$/.test(v)), vals);

  // ------------------------------------------------------------------------------------- E6: the breaker's findings on b6b6b3d4 (F1-F4, F7)
  const ivy = await add(R, { givenNames: "Ivy", familyName: "Edges", phone: "12" });
  const sentence = (r: Awaited<ReturnType<typeof refusal>>) => r?.status === 422 && (r.body.fields as Record<string, string>)?.phone === UNREADABLE_PHONE;
  const long = await refusal(() => people.editPhone(R, ivy.person.id, { phone: "+49 23456789012345" }));
  ok("FO-9a phone E6 fail (breaker F1): a 16-digit number libphonenumber calls possible (+49 23456789012345) → 422 with the sentence, never a 500; nothing saved", sentence(long) && person(ivy.person.id) === "12|false|-", long);
  ok("FO-9a phone E6 fail (breaker F2): a number too short for the database's E.164 key (+43 2345) → 422, so a saved number always has its phone_e164", sentence(await refusal(() => people.editPhone(R, ivy.person.id, { phone: "+43 2345" }))));
  ok("FO-9a phone E6 fail (breaker F3): digits libphonenumber would drop (+86 1234567890123456 read as +8667890123456) or an extension (416 555 0199 ext 12) → 422, nothing lost silently",
    sentence(await refusal(() => people.editPhone(R, ivy.person.id, { phone: "+86 1234567890123456" }))) && sentence(await refusal(() => people.editPhone(R, ivy.person.id, { phone: "416 555 0199 ext 12" }))) && person(ivy.person.id) === "12|false|-");
  ok("FO-9a phone E6 fail (breaker F7): over 40 characters or a control mark → the field's one sentence, not a fragment", sentence(await refusal(() => people.editPhone(R, ivy.person.id, { phone: "+1 416 555 0100".padEnd(41, "0") }))) && sentence(await refusal(() => people.editPhone(R, ivy.person.id, { phone: "+1 416\u0007 555 0100" }))));
  ok("FO-9a phone E6 fail (review M1): a local-only number with no area code (555 0100, 4165550) → 422, never saved as +15550100",
    sentence(await refusal(() => people.editPhone(R, ivy.person.id, { phone: "555 0100" }))) && sentence(await refusal(() => people.editPhone(R, ivy.person.id, { phone: "4165550" }))) && person(ivy.person.id) === "12|false|-");
  const spellings: [string, string][] = [["011 44 20 7946 0000", "+442079460000"], ["+44 (0) 20 7946 0958", "+442079460958"], ["1 416 555 0108", "+14165550108"], ["\uff14\uff11\uff16 555 0109", "+14165550109"]];
  const read6: (string | null)[] = [];   // one after another: the last save is the last spelling (re-review R1: Promise.all raced on the row lock)
  for (const [t] of spellings) read6.push((await people.editPhone(R, ivy.person.id, { phone: t })).phone);
  ok("FO-9a phone E6 pass: an international prefix (011), a trunk (0), a leading 1 and full-width digits are read without loss", read6.every((x, i) => x === spellings[i][1]), read6);
  const n6 = audits(ivy.person.id), same = await people.editPhone(R, ivy.person.id, { phone: "416 555 0109" });
  ok("FO-9a phone E6 fail (breaker F4): the same number saved again writes nothing (no second audit line)", same.phone === "+14165550109" && audits(ivy.person.id) === n6, { n6, after: audits(ivy.person.id) });

  // ------------------------------------------------------------------------------------- E5: the route and the app's own path
  const access = Reflect.getMetadata(PLATFORM_ACCESS, PeopleEditController.prototype.edit) as { keys?: string[] } | undefined;
  ok("FO-9a phone E5 pass: the route declares agent/prospect:edit, which PF-4's start-up rule accepts", access?.keys?.join() === "agent/prospect:edit" && (() => { try { assertEveryRouteDeclared([{ name: "PeopleEditController.edit", method: "PATCH", path: "/api/front-office/people/:personId", access } as never]); return true; } catch { return false; } })(), access);
  const readOnly = sql(`select coalesce(string_agg(permission_key, ','), '') from platform_role_permission where role::text = 'READ_ONLY'`).split(",");
  ok("FO-9a phone E5 fail: a role without agent/prospect:edit is refused by the guard (the seeded Read-only role reads leads but lacks edit)", readOnly.includes("agent/prospect:show") && !readOnly.includes("agent/prospect:edit"), readOnly);
  const walled = new PrismaClient({ adapter: new PrismaPg(walledPool(URL_)) });
  oneQueryPerCaller(walled);
  const wpeople = new PeopleEdit(walled, ports);
  const zoe = await add(R, { givenNames: "Zoe", familyName: "Walled", phone: "12" });
  const viaApp = await withFirm(A, () => wpeople.editPhone(R, zoe.person.id, { phone: "+1 416 555 0106" }));
  ok("FO-9a phone E5 pass: as the app role under the firm walls, the edit saves (the trigger fills phone_e164)", viaApp.phone === "+14165550106" && person(zoe.person.id) === "+14165550106|true|+14165550106", { viaApp, db: person(zoe.person.id) });
  const crossApp = await refusal(() => withFirm(A, () => wpeople.editPhone(SOLO, bea.person.id, { phone: "+1 416 555 0107" })));
  ok("FO-9a phone E5 fail: under firm A's walls, firm B's person is 404 even for firm B's staff context (the wall reads nothing)", crossApp?.status === 404 && person(bea.person.id) === "+14165550101|true|+14165550101", crossApp);
  await walled.$disconnect();
} catch (e) {
  fail++;
  console.log(`FAIL  FO-9a phone: the check stopped — ${String((e as Error).stack ?? e).slice(0, 1200)}`);
} finally {
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* the next run's dropdb */ }
}
console.log(`\nFO-9a phone edit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
