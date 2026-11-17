// FO-9a (BACKLOG row FO-9a; brief design/lead-b-briefs/FO-9a.md; P-574 (2); AG-2-78, AG-2-96): the duplicate warning on
// key fields, each Done-when line with a pass and a fail, on one scratch database dropped at the end. The migration is
// measured right after it applies (every migration up to and including it, then the rest), never assuming it is the
// newest (rows rev 16.7). US$0, no model call.
//   tsx studio/tests/check_fo9a_duplicates.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { DuplicateCheckOut, matchScore, NAME_THRESHOLD, normaliseEmail, personNameKey } from "../ports/matching.ts";
import { seedSampleFirmsFrontOffice, seedFirmFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { DuplicatesController } from "../api/src/front-office/duplicates/routes.ts";
import { phoneE164 } from "../api/src/front-office/duplicates/phone.ts";
import { Duplicates, HIDDEN_LINE } from "../api/src/front-office/duplicates/service.ts";
import { Corporate } from "../api/src/front-office/sales/corporate/service.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { PublicForms, type SalesPorts } from "../api/src/front-office/sales/public.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { assertEveryRouteDeclared } from "../api/src/platform/identity/guard.ts";
import { dutiesOf, PLATFORM_ACCESS, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), NEW = "20261117030000_fo9a_duplicate_match";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo9a_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const SITE = "https://maple.example";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
const apply = (d: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
async function refusal(fn: () => Promise<unknown>): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try { await fn(); return null; } catch (e) {
    const x = e as { getStatus?: () => number; getResponse?: () => unknown };
    if (!x.getStatus) return { status: 0, body: { error: String(e) } };
    return { status: x.getStatus(), body: x.getResponse!() as Record<string, unknown> };
  }
}
const count = (t: string, where = "true") => Number(sql(`select count(*) from ${t} where ${where}`));

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  // ------------------------------------------------------------------------------------- the migration, in a parallel world
  const all = readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort();
  ok("FO-9a setup: its stamp is later than every migration before it and unique", all.filter((d) => d < NEW).every((d) => d.slice(0, 14) < NEW.slice(0, 14)) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1);
  for (const d of all.filter((x) => x < NEW)) apply(d);
  const F0 = randomUUID(), P0 = randomUUID(), P1 = randomUUID();
  sql(`insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values ('${F0}', 'fo9a-old', 'Old firm (Sample)', 'CA', 'old@fo9a.example', now());
       insert into fo_sales_setup (firm_id) values ('${F0}');
       insert into fo_person (id, firm_id, given_names, phone, phone_readable, created_by, updated_at) values ('${P0}', '${F0}', 'Readable', '+14165550199', true, 'test', now()), ('${P1}', '${F0}', 'Unreadable', '555-01', false, 'test', now())`);
  apply(NEW);
  ok("FO-9a pass: right after its migration, pg_trgm is enabled and a readable phone written before it is backfilled in E.164", sql(`select count(*) from pg_extension where extname = 'pg_trgm'`) === "1" && sql(`select phone_e164 from fo_person where id = '${P0}'`) === "+14165550199");
  ok("FO-9a fail: an unreadable phone written before it stays without an E.164 value", sql(`select coalesce(phone_e164, 'none') from fo_person where id = '${P1}'`) === "none");
  sql(`update fo_person set phone_e164 = '+19999999999' where id = '${P1}'`);
  ok("FO-9a fail: a writer cannot set phone_e164 by hand (the database keeps it from the phone)", sql(`select coalesce(phone_e164, 'none') from fo_person where id = '${P1}'`) === "none");
  ok("FO-9a pass: the person-name and company-name trigram indexes and the lower(email) index exist", sql(`select count(*) from pg_indexes where indexname in ('fo_person_name_trgm_idx', 'fo_company_normalised_name_trgm_idx', 'fo_person_firm_id_email_lower_idx', 'fo_person_firm_id_phone_e164_idx')`) === "4");
  for (const d of all.filter((x) => x > NEW)) apply(d);

  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("FO-9a setup: both Sample firms have a front office", fo.failed.length === 0);
  const firm = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firm("sample-firm");
  const ctxOf = (actorId: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey: firmId === A ? "sample-firm" : "sample-solo", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R"), T = ctxOf("user-T"), SOLO = ctxOf("user-S");
  const ws = await platformAuditWorkspaceId(db as never);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "test", workspaceId: ws });
  const consent = new ConsentStore(auditEvent);
  let clock = Date.parse("2026-11-17T10:00:00Z");
  const ports: SalesPorts = { audit: auditEvent, consent, now: () => clock, publicOrigin: "http://localhost:4400", formKey: Buffer.from("fo9a-test-stamp-key (Sample, not a secret)") };
  const leads = new Leads(db, ports), dup = new Duplicates(db), corp = new Corporate(db, ports);
  const add = (who: StaffContext, p: Record<string, unknown>) => leads.add(who, { requestId: randomUUID(), source: "Phone call", ...p }) as Promise<{ id: string; person: { id: string } }>;

  // ------------------------------------------------------------------------------------- the shared rules (ports/matching.ts)
  ok("FO-9a pass: the shared rules: email lower-cased, the name key, the score (exact key 100, name = similarity × 100)",
    normaliseEmail(" Lena@Example.ORG ") === "lena@example.org" && personNameKey(" Lena ", "  Park") === "lena park" && matchScore([{ key: "PHONE" }]) === 100 && matchScore([{ key: "NAME", similarity: 0.75 }]) === 75);
  ok("FO-9a fail: not an email → no key; no reason → score 0", normaliseEmail("lena@") === null && matchScore([]) === 0);
  ok("FO-9a pass: the name key is the database's (fo_sales_person_name)", sql(`select fo_sales_person_name('  Lena ', ' Park ')`) === personNameKey("  Lena ", " Park "));

  // ------------------------------------------------------------------------------------- phone: two spellings, one number
  const lena = await add(R, { givenNames: "Lena", familyName: "Park", email: "lena.park@example.org", phone: "+1 (416) 555-0101" });
  ok("FO-9a setup: Lena's phone is stored with its E.164 key", sql(`select phone_e164 from fo_person where id = '${lena.person.id}'`) === "+14165550101");
  ok("FO-9a pass: libphonenumber reads +1 (416) 555-0101 and 416.555.0101 as one number", phoneE164("+1 (416) 555-0101") === "+14165550101" && phoneE164("416.555.0101") === "+14165550101");
  const byPhone = await dup.check(R, { phone: "416.555.0101" });
  ok("FO-9a pass: a check with 416.555.0101 finds the person stored as +1 (416) 555-0101 (PHONE, score 100, use the existing one)",
    byPhone.matches[0]?.kind === "PERSON" && byPhone.matches[0].personId === lena.person.id && byPhone.matches[0].score === 100 && byPhone.matches[0].reasons.some((r) => r.key === "PHONE")
      && JSON.stringify(byPhone.matches[0].useExisting) === JSON.stringify({ personId: lena.person.id }), byPhone);
  ok("FO-9a fail: another number (416.555.0102) or something that is not a phone matches nobody", (await dup.check(R, { phone: "416.555.0102" })).matches.length === 0 && phoneE164("12345") === null);
  ok("FO-9a pass: the email matches whatever its case", (await dup.check(R, { email: "LENA.PARK@EXAMPLE.ORG" })).matches[0]?.reasons.some((r) => r.key === "EMAIL"));

  // ------------------------------------------------------------------------------------- the name: similar, not the first name alone
  const sameName = await dup.check(R, { givenNames: "Lena", familyName: "Parke" });
  const nameReason = sameName.matches[0]?.reasons.find((r) => r.key === "NAME");
  ok(`FO-9a pass: a similar full name ("Lena Parke") matches by NAME at or above ${NAME_THRESHOLD}, scored by its similarity`,
    sameName.matches[0]?.kind === "PERSON" && nameReason?.key === "NAME" && nameReason.similarity >= NAME_THRESHOLD && sameName.matches[0].score === Math.floor(nameReason.similarity * 100) && sameName.matches[0].score < 100, sameName);
  const firstOnly = await dup.check(R, { givenNames: "Lena", familyName: "Smith" });
  const lenaSmithSim = Number(sql(`select similarity('lena park', 'lena smith')`));
  ok("FO-9a fail: a different person with the same first name only (Lena Smith) scores below the threshold and is not offered", firstOnly.matches.length === 0 && firstOnly.hidden === 0 && lenaSmithSim < NAME_THRESHOLD, { firstOnly, lenaSmithSim });
  ok("FO-9a fail: the first name alone (\"Lena\") is below the threshold too", (await dup.check(R, { givenNames: "Lena" })).matches.length === 0);

  // ------------------------------------------------------------------------------------- a match the viewer may not see is never named
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "test", workspaceId: ws });
  const tSees = await dup.check(T, { email: "lena.park@example.org", givenNames: "Lena", familyName: "Park" });
  ok("FO-9a fail: with \"everyone sees all\" off, T's check on R's Lena names no one: a count and the line only, no id",
    tSees.matches.length === 0 && tSees.hidden === 1 && tSees.hiddenLine === HIDDEN_LINE && !JSON.stringify(tSees).includes(lena.person.id) && !JSON.stringify(tSees).includes("Park"), tSees);
  const rSees = await dup.check(R, { email: "lena.park@example.org" });
  ok("FO-9a pass: R, who owns Lena's lead, sees her named, with no hidden count", rSees.matches.length === 1 && rSees.matches[0].kind === "PERSON" && rSees.matches[0].name === "Lena Park" && rSees.hidden === 0);
  await add(T, { givenNames: "Omar", familyName: "Haddad", email: "omar@example.org" });
  ok("FO-9a pass: T's own lead's person is named to T", (await dup.check(T, { email: "omar@example.org" })).matches[0]?.kind === "PERSON");
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "test", workspaceId: ws });
  ok("FO-9a fail: firm B's staff never see firm A's people, not even as a count (matching stays inside the firm)", JSON.stringify(await dup.check(SOLO, { email: "lena.park@example.org" })) === JSON.stringify({ matches: [], hidden: 0, hiddenLine: null }));

  // ------------------------------------------------------------------------------------- use the existing one
  const tables = ["fo_person", "fo_lead", "fo_company", "fo_company_contact", "audit_event", "module_event"];
  const snap = () => tables.map((t) => count(t)).join(",");
  const before = snap();
  await dup.check(R, { givenNames: "Lena", familyName: "Park", email: "lena.park@example.org", phone: "416 555 0101", companyName: "Pine Bakery" });
  ok("FO-9a pass: the check itself creates nothing (no person, lead, company, link, audit line or event)", snap() === before, [before, snap()]);
  const use = (await dup.check(R, { email: "lena.park@example.org" })).matches[0];
  const people = count("fo_person");
  const linked = await add(R, { ...(use?.kind === "PERSON" ? use.useExisting : {}), note: "Asked again by phone (Sample)." });
  ok("FO-9a pass: \"use the existing one\" (its personId on Add a lead) links the new lead to Lena and makes no new person", linked.person.id === lena.person.id && count("fo_person") === people && count("fo_lead", `person_id = '${lena.person.id}'`) === 2);
  const fresh = await add(R, { givenNames: "Lena", familyName: "Park", email: "lena.park@example.org", confirmedNew: true });
  ok("FO-9a fail: choosing \"someone new\" instead makes a second person (a duplicate beats a miss, AG16-60)", fresh.person.id !== lena.person.id && count("fo_person") === people + 1);

  // Companies: a similar name is offered with its id to someone who sees the company; never to someone who does not.
  const pine = await corp.engage(R, (await add(R, { givenNames: "Ana", email: "ana@pinebakery.example" })).id, { companyName: "Pine Bakery Ltd" });
  const co = await dup.check(R, { companyName: "Pine Bakeries" });
  ok("FO-9a pass: a similar company name (\"Pine Bakeries\") offers Pine Bakery Ltd with its companyId to use", co.matches.some((m) => m.kind === "COMPANY" && m.companyId === pine.company!.id && m.useExisting.companyId === pine.company!.id && m.score >= NAME_THRESHOLD * 100), co);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "test", workspaceId: ws });
  const coT = await dup.check(T, { companyName: "Pine Bakeries" });
  ok("FO-9a fail: T, who sees none of its prospects, gets the count only for the company", !coT.matches.some((m) => m.kind === "COMPANY") && coT.hidden === 1 && !JSON.stringify(coT).includes(pine.company!.id), coT);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "test", workspaceId: ws });
  ok("FO-9a fail: an empty check → refused at the body (422), and a wrong type → 422", (await refusal(() => dup.check(R, {})))?.status === 422 && (await refusal(() => dup.check(R, { email: 7 })))?.status === 422);
  ok("FO-9a pass: every answer is the shared contract's shape (DuplicateCheckOut)", [byPhone, sameName, tSees, co].every((x) => DuplicateCheckOut.safeParse(x).success));

  // ------------------------------------------------------------------------------------- the public form answers the same either way
  const wording = await db.$transaction((tx) => consent.publishWording(tx, { firmId: A, channel: "EMAIL", purpose: "MARKETING", locale: "en", text: "Send me news by email. (Sample)", by: "seed:FO-9a-test" }));
  const token = sql(`update fo_web_form set enabled = true, consent_wording_version_id = '${wording.id}', allowed_sites = '{${SITE}}' where firm_id = '${A}' returning public_token`);
  const forms = new PublicForms(db, ports);
  let ip = 0;
  const post = async (fields: Record<string, unknown>) => {
    const r = { ip: `203.0.113.${++ip}`, headers: { origin: SITE } };
    const f = await forms.read(token, r); clock += 5000;
    return forms.submit(token, { submissionId: f.submissionId, loadStamp: f.loadStamp, ...fields }, r);
  };
  const known = await post({ givenNames: "Lena", familyName: "Park", email: "lena.park@example.org", phone: "416.555.0101" });
  const unknown = await post({ givenNames: "Noor", familyName: "Ali", email: "noor@example.org" });
  ok("FO-9a pass: the public form answers a known person exactly as it answers a new one (no match is revealed)", JSON.stringify(known) === JSON.stringify(unknown), [known, unknown]);
  ok("FO-9a fail: the match is only on the staff side: the known person's new lead is flagged, the new person's is not", count("fo_lead l join fo_person p on p.id = l.person_id", `p.email = 'lena.park@example.org' and l.possible_match_person_id is not null`) >= 1
    && count("fo_lead l join fo_person p on p.id = l.person_id", `p.email = 'noor@example.org' and l.possible_match_person_id is not null`) === 0);

  // ------------------------------------------------------------------------------------- speed: 20 checks at once, 100 firms of Sample data
  const firms = Array.from({ length: 98 }, () => randomUUID());
  sql(`insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) select f, 'fo9a-' || i, 'Sample firm ' || i, 'CA', 'firm' || i || '@fo9a.example', now() from unnest(array['${firms.join("','")}']::uuid[]) with ordinality t(f, i)`);
  for (const f of firms) await db.$transaction((tx) => seedFirmFrontOffice(tx, f));
  sql(`insert into fo_person (firm_id, given_names, family_name, email, phone, phone_readable, created_by, updated_at)
       select f.id, (array['Lena','Omar','Ana','Raj','Mei','Ivo','Sara','Tomas'])[1 + (g % 8)], 'Sample' || g, 'p' || g || '@' || f.key || '.example', '+1416' || lpad((g % 10000000)::text, 7, '0'), true, 'test', now()
         from platform_firm f cross join generate_series(1, 250) g where f.key like 'fo9a-%' or f.id = '${A}'`);
  sql(`analyze fo_person; analyze fo_company`);
  ok("FO-9a setup: 100 firms of Sample data (25,000 more people)", count("platform_firm") >= 100 && count("fo_person") >= 25000);
  const times: number[] = [];
  await Promise.all(Array.from({ length: 20 }, (_, i) => (async () => { const t = performance.now(); await dup.check(R, { givenNames: "Lena", familyName: `Sample${i}`, email: `p${i}@x.example`, phone: `416 555 ${String(100 + i).padStart(4, "0")}` }); times.push(performance.now() - t); })()));
  times.sort((a, b) => a - b);
  const p95 = times[Math.ceil(0.95 * times.length) - 1];
  ok(`FO-9a pass: 20 checks at once, each against 100 firms of Sample data, answer within STANDARDS §9's 200 ms (p95 ${Math.round(p95)} ms)`, p95 < 200, times.map(Math.round));
  const plan = (q: string) => sql(`begin; select set_config('pg_trgm.similarity_threshold', '0.6', true); explain ${q}; rollback;`);
  const nameQ = `select id from fo_person where firm_id = '${A}' and fo_sales_person_name(given_names, family_name) % 'lena park'`;
  ok("FO-9a pass: the name match is answered by the firm's trigram index (EXPLAIN, 100 firms of data)", /fo_person_name_trgm_idx/.test(plan(nameQ)), plan(nameQ));
  const noIndex = sql(`begin; drop index fo_person_name_trgm_idx; select set_config('pg_trgm.similarity_threshold', '0.6', true); explain ${nameQ}; rollback;`);
  ok("FO-9a fail: without the trigram index the same match reads the firm's rows one by one (no trigram index in the plan)", !/trgm_idx/.test(noIndex), noIndex);

  // ------------------------------------------------------------------------------------- the route
  const access = Reflect.getMetadata(PLATFORM_ACCESS, DuplicatesController.prototype.check) as { keys?: string[] } | undefined;
  ok("FO-9a pass: the route declares the seeded agent/prospect:show key (a read; PF-4's start-up rule accepts it)", access?.keys?.join() === "agent/prospect:show" && (() => { try { assertEveryRouteDeclared([{ name: "DuplicatesController.check", method: "POST", path: "/api/front-office/duplicates/check", access } as never]); return true; } catch { return false; } })());
  // Every seeded role holds agent/prospect:show, so a staff member stripped of it stands in: the guard refuses a route
  // whose declared keys the person lacks (guard.ts, `missing`; PF-4's own tests prove the guard).
  const stripped = { ...R, keys: R.keys.filter((k) => k !== "agent/prospect:show") };
  ok("FO-9a fail: a person without agent/prospect:show lacks the route's one key, so PF-4's guard refuses it", (access?.keys ?? []).filter((k) => !stripped.keys.includes(k)).join() === "agent/prospect:show");
} catch (e) {
  fail++;
  console.log(`FAIL  FO-9a: the check stopped — ${String((e as Error).stack ?? e).slice(0, 1200)}`);
} finally {
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* the next run's dropdb */ }
}
console.log(`\nFO-9a duplicates: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
