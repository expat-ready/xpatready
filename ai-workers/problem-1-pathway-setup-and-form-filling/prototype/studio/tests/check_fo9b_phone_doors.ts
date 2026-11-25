// FO-9b (R1.33's last part; brief design/lead-b-briefs/FO-9b.md; QA-526, QA-528; ruling P-747): one exact phone
// normaliser at every arrival door. Each door with a pass and a fail, on one scratch database (every migration, PF-3's
// and FO-1a's Sample seeds), dropped at the end:
//   P0 duplicates/phone.ts phoneE164Exact reads "00" international dialling (QA-528: "0044 20 7946 0958" never parsed);
//   D1-D5 the public enquiry, Add a lead, a company's new contact, the FO person port and the booking door: a trunk-0
//      spelling is stored +442079460958 readable (the old +4402… never), an impossible "+999 123" is accepted and kept as
//      typed with readable false (never a 4xx), a CA local "416 555 0101" is +14165550101; booking takes "555 0101" with
//      no country code and keeps it unreadable (P-747: refused on the field only on the edit route);
//   D6 the duplicate check meets two spellings of one number, and an unreadable one matches nothing;
//   E  the edit route still refuses an impossible number (422; FO-9a unchanged);
//   G  one normaliser: no phone regex in api/src/front-office outside duplicates/phone.ts, no door calls the looser phoneE164.
// US$0, no model call.
//   tsx studio/tests/check_fo9b_phone_doors.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fakeArrival } from "../ports/arrival.ts";
import { fakeAudit, type AuditPort } from "../ports/audit.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";
import { copyFirmHoursTo } from "../api/src/front-office/booking-seed.ts";
import { BookingService } from "../api/src/front-office/booking/service.ts";
import { wallToUtc } from "../api/src/front-office/booking/slots.ts";
import { phoneE164Exact } from "../api/src/front-office/duplicates/phone.ts";
import { Duplicates } from "../api/src/front-office/duplicates/service.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { PeopleEdit, UNREADABLE_PHONE } from "../api/src/front-office/people/edit.ts";
import { foPersonPort } from "../api/src/front-office/people/fo-person-port.ts";
import { PrismaArrival } from "../api/src/front-office/sales/arrival-port.ts";
import { Corporate } from "../api/src/front-office/sales/corporate/service.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { Prospects } from "../api/src/front-office/sales/prospects.ts";
import { PublicForms, type SalesPorts } from "../api/src/front-office/sales/public.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { dutiesOf, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo9b_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const SITE = "https://maple.example", TZ = "America/Toronto";
const TRUNK = "+44 (0) 20 7946 0958", UK = "+442079460958", OLD_UK = "+4402079460958", IMPOSSIBLE = "+999 123", LOCAL = "416 555 0101", CA = "+14165550101";

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
/** The stored phone of a person: "phone|readable|e164". */
const stored = (where: string) => sql(`select coalesce(phone, '-') || '|' || phone_readable || '|' || coalesce(phone_e164, '-') from fo_person where ${where} order by created_at desc limit 1`);
const STORED_UK = `${UK}|true|${UK}`, STORED_CA = `${CA}|true|${CA}`, STORED_BAD = `${IMPOSSIBLE}|false|-`;

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  // ------------------------------------------------------------------------------------- P0: the one normaliser
  ok("FO-9b P0 pass (QA-528): \"0044 20 7946 0958\" (00 dialling), \"+44 (0) 20 7946 0958\" (a trunk 0) and \"011 44 20 7946 0958\" are all +442079460958",
    phoneE164Exact("0044 20 7946 0958") === UK && phoneE164Exact(TRUNK) === UK && phoneE164Exact("011 44 20 7946 0958") === UK && phoneE164Exact("00 44 20 7946 0958") === UK,
    ["0044 20 7946 0958", TRUNK, "011 44 20 7946 0958"].map(phoneE164Exact));
  const NANP_BAD = ["000-000-0000", "0000000000", "123 456 7890", "00 0 123 4567", "+1 416 055 0100", "(115) 555-0100"];
  ok("FO-9b P0 fail (review M1): a North American number whose area code or exchange starts with 0 or 1 reads as nothing (\"possible\" checks only the length)",
    NANP_BAD.every((x) => phoneE164Exact(x) === null) && phoneE164Exact("+1 416 555 0100") === "+14165550100" && phoneE164Exact("(212) 555-0100") === "+12125550100", NANP_BAD.map(phoneE164Exact));
  ok("FO-9b P0 fail: \"00\" alone, \"+999 123\", \"555 0101\" (no area code) and \"0044\" with no number read as nothing",
    ["00", IMPOSSIBLE, "555 0101", "0044"].every((x) => phoneE164Exact(x) === null), ["00", IMPOSSIBLE, "555 0101", "0044"].map(phoneE164Exact));

  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("FO-9b setup: both Sample firms have a front office", fo.failed.length === 0, fo.failed);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`);
  const ctxOf = (actorId: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey: "sample-firm", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R");
  const ws = await platformAuditWorkspaceId(db as never);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: ws });
  const consent = new ConsentStore(auditEvent);
  let clock = Date.parse("2026-11-20T10:00:00Z");
  const ports: SalesPorts = { audit: auditEvent, consent, now: () => clock, publicOrigin: "http://localhost:4400", formKey: Buffer.from("fo9b-test-stamp-key (Sample, not a secret)") };
  const leads = new Leads(db, ports), corp = new Corporate(db, ports), dup = new Duplicates(db), people = new PeopleEdit(db, ports);
  let n = 0;
  const who = (tag: string) => ({ givenNames: `Door${tag}`, familyName: `Sample${++n}`, email: `door.${tag.toLowerCase()}.${n}@fo9b.example` });

  // ------------------------------------------------------------------------------------- D1: the public enquiry form
  const wording = await db.$transaction((tx) => consent.publishWording(tx, { firmId: A, channel: "EMAIL", purpose: "MARKETING", locale: "en", text: "Send me news by email. (Sample)", by: "seed:FO-9b-test" }));
  const token = sql(`update fo_web_form set enabled = true, consent_wording_version_id = '${wording.id}', allowed_sites = '{${SITE}}' where firm_id = '${A}' returning public_token`).split("\n")[0];
  const forms = new PublicForms(db, ports);
  let ip = 0;
  const post = async (fields: Record<string, unknown>) => {
    const r = { ip: `203.0.113.${++ip}`, headers: { origin: SITE } };
    const f = await forms.read(token, r); clock += 5000;
    return refusal(() => forms.submit(token, { submissionId: f.submissionId, loadStamp: f.loadStamp, ...fields }, r));
  };
  const web = { uk: who("WebUk"), bad: who("WebBad"), ca: who("WebCa") };
  const webUk = await post({ ...web.uk, phone: TRUNK }), webBad = await post({ ...web.bad, phone: IMPOSSIBLE }), webCa = await post({ ...web.ca, phone: LOCAL });
  ok("FO-9b D1 pass (public form): the trunk-0 spelling is stored +442079460958 readable, and a CA local one +14165550101",
    webUk === null && webCa === null && stored(`email = '${web.uk.email}'`) === STORED_UK && stored(`email = '${web.ca.email}'`) === STORED_CA, { webUk, a: stored(`email = '${web.uk.email}'`), b: stored(`email = '${web.ca.email}'`) });
  ok("FO-9b D1 fail (public form): \"+999 123\" is accepted (no 4xx) and kept as typed, unreadable; the old +4402… is never stored",
    webBad === null && stored(`email = '${web.bad.email}'`) === STORED_BAD && sql(`select count(*) from fo_person where phone = '${OLD_UK}'`) === "0", { webBad, s: stored(`email = '${web.bad.email}'`) });

  // ------------------------------------------------------------------------------------- D2: Add a lead (staff)
  const add = (p: Record<string, unknown>) => refusal(() => leads.add(R, { requestId: randomUUID(), source: "Phone call", confirmedNew: true, ...p }));
  const lead = { uk: who("LeadUk"), bad: who("LeadBad"), ca: who("LeadCa") };
  const [lUk, lBad, lCa] = [await add({ ...lead.uk, phone: TRUNK }), await add({ ...lead.bad, phone: IMPOSSIBLE }), await add({ ...lead.ca, phone: LOCAL })];
  ok("FO-9b D2 pass (Add a lead): +442079460958 and +14165550101, readable", lUk === null && lCa === null && stored(`email = '${lead.uk.email}'`) === STORED_UK && stored(`email = '${lead.ca.email}'`) === STORED_CA, [lUk, lCa]);
  ok("FO-9b D2 fail (Add a lead): \"+999 123\" is accepted and unreadable, never readable as \"+999123\"", lBad === null && stored(`email = '${lead.bad.email}'`) === STORED_BAD, { lBad, s: stored(`email = '${lead.bad.email}'`) });
  const junk = who("LeadJunk"), lJunk = await add({ ...junk, phone: "000-000-0000" });
  ok("FO-9b D2 fail (review M1): \"000-000-0000\" is accepted and kept as typed, unreadable (Fix number), never +10000000000", lJunk === null && stored(`email = '${junk.email}'`) === "000-000-0000|false|-", stored(`email = '${junk.email}'`));

  // ------------------------------------------------------------------------------------- D3: a company's new contact
  const companyId = randomUUID();
  sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${companyId}', '${A}', 'Pine Bakeries (Sample)', 'pine bakeries', 'test', now())`);
  const contact = (p: Record<string, unknown>) => refusal(() => corp.addContact(R, companyId, { role: "OTHER", confirmedNew: true, ...p }));
  const co = { uk: who("CoUk"), bad: who("CoBad"), ca: who("CoCa") };
  const [cUk, cBad, cCa] = [await contact({ ...co.uk, phone: TRUNK }), await contact({ ...co.bad, phone: IMPOSSIBLE }), await contact({ ...co.ca, phone: LOCAL })];
  ok("FO-9b D3 pass (company contact): +442079460958 and +14165550101, readable", cUk === null && cCa === null && stored(`email = '${co.uk.email}'`) === STORED_UK && stored(`email = '${co.ca.email}'`) === STORED_CA, [cUk, cCa]);
  ok("FO-9b D3 fail (company contact): \"+999 123\" is accepted and unreadable", cBad === null && stored(`email = '${co.bad.email}'`) === STORED_BAD, { cBad, s: stored(`email = '${co.bad.email}'`) });

  // ------------------------------------------------------------------------------------- D4: the FO person port (case side)
  const port = async (tag: string, phone: string) => { const p = who(tag); const r = await db.$transaction((tx) => foPersonPort.ensureForClient(tx, { firmId: A, actor: "system:test", displayName: `${p.givenNames} ${p.familyName}`, givenNames: p.givenNames, familyName: p.familyName, email: p.email, phone, prospectId: null } as never)); return r.foPersonId; };
  const [pUk, pBad, pCa] = [await port("PortUk", TRUNK), await port("PortBad", IMPOSSIBLE), await port("PortCa", LOCAL)];
  ok("FO-9b D4 pass (person port): +442079460958 and +14165550101, readable", stored(`id = '${pUk}'`) === STORED_UK && stored(`id = '${pCa}'`) === STORED_CA, [stored(`id = '${pUk}'`), stored(`id = '${pCa}'`)]);
  ok("FO-9b D4 fail (person port): \"+999 123\" is kept as typed, unreadable (the looser phoneE164 no longer decides)", stored(`id = '${pBad}'`) === STORED_BAD, stored(`id = '${pBad}'`));

  // ------------------------------------------------------------------------------------- D5: the booking door
  const firmB = await db.platformFirm.create({ data: { key: `fo9b-book-${Date.now().toString(36)}`, operatingName: "Sample booking firm", countryCode: "CA", status: "ACTIVE", contactEmail: "office@fo9b-book.example" } });
  await db.$transaction((tx) => seedSampleFirmsFrontOffice(tx as never).catch(() => undefined));
  const host = await db.platformStaff.create({ data: { firmId: firmB.id, email: "host@fo9b-book.example", displayName: "Sample host", status: "ACTIVE" } });
  await copyFirmHoursTo(db, firmB.id, [host.id]);
  await db.foConsultationType.create({ data: { firmId: firmB.id, slug: "free", name: "Free consultation", modes: ["VIDEO", "PHONE"], hostStaffIds: [host.id], minutes: 30, windowDays: 60 } });
  const bclock = new FakeClock(new Date("2026-11-23T13:00:00Z"));   // Monday 08:00 Toronto
  const arrival = fakeArrival();
  const svc = new BookingService(db, { audit: fakeAudit() as AuditPort<never>, clock: bclock, jobs: fakeJobs(bclock), mail: fakeMail({ clock: bclock }), arrival, publicBaseUrl: "http://localhost:4430", limits: { bookPerIp: 1000, bookPerFirm: 1000, slotsPerIp: 1000, tokenPerIp: 1000 }, warn: () => undefined });
  const days = new Set<string>();   // one booking a day, so no two are near each other
  const book = async (tag: string, phone: string) => {
    const page = await svc.publicSlots(firmB.key, "free", {}, "10.0.0.1");
    // A day ahead at least, so the 5 s of "typing" never pushes a slot inside the shortest notice; one booking a day.
    const slot = page.slots.find((x) => Date.parse(x.startsAt) > bclock.now().getTime() + 86_400_000 && !days.has(x.startsAt.slice(0, 10)));
    if (slot) days.add(slot.startsAt.slice(0, 10));
    await bclock.advance({ seconds: 5 });
    const p = who(tag);
    const r = await refusal(() => svc.publicBook(firmB.key, "free", { ...p, mode: "PHONE", phone, startsAt: slot?.startsAt, timeZone: TZ, formStamp: page.formStamp }, "10.0.0.1"));
    return { r, sent: arrival.calls.find((c) => c.person.email === p.email.toLowerCase())?.person };
  };
  const bUk = await book("BookUk", "0044 20 7946 0958"), bBad = await book("BookBad", "555 0101"), bCa = await book("BookCa", LOCAL);
  ok("FO-9b D5 pass (booking door): \"0044 20 7946 0958\" and \"416 555 0101\" are booked and sent to the arrival as +442079460958 and +14165550101",
    bUk.r === null && bCa.r === null && bUk.sent?.phone === UK && bUk.sent?.phoneReadable === undefined && bCa.sent?.phone === CA, [bUk, bCa]);
  ok("FO-9b D5 fail (booking door, P-747): \"555 0101\" with no country code is booked, not refused, and sent as typed with phoneReadable false",
    bBad.r === null && bBad.sent?.phone === "555 0101" && bBad.sent?.phoneReadable === false, bBad);
  // The real adapter stores what the door sends.
  const real = new PrismaArrival({ audit: auditEvent, consent });
  const arrive = async (tag: string, phone: string, readable: boolean) => { const p = who(tag); const r = await db.$transaction((tx) => real.bookingArrived(tx, { firmId: A, person: { ...p, phone, ...(readable ? {} : { phoneReadable: false as const }) }, bookingId: randomUUID() })); return r.personId; };
  const aBad = await arrive("ArriveBad", "555 0101", false), aUk = await arrive("ArriveUk", UK, true);
  ok("FO-9b D5 pass (booking arrival, real adapter): an E.164 phone is stored readable", stored(`id = '${aUk}'`) === STORED_UK, stored(`id = '${aUk}'`));
  ok("FO-9b D5 fail (booking arrival, real adapter): an unreadable phone is kept as typed with readable false, and is no contact phone",
    stored(`id = '${aBad}'`) === "555 0101|false|-" && !(await real.contactOf(db, A, aBad))?.phone, stored(`id = '${aBad}'`));
  // Review m1: a booker on file with an open prospect and no phone gives an unreadable one: it fills the empty phone
  // flagged unreadable (keepPhone's readable=false branch); kept readable it would break fo_person_phone_check (a 500).
  const held = who("Held");
  const heldLead = await leads.add(R, { requestId: randomUUID(), source: "Phone call", confirmedNew: true, ...held }) as { id: string; person: { id: string } };
  await new Prospects(db, ports).engage(R, heldLead.id);
  const heldR = await refusal(() => db.$transaction((tx) => real.bookingArrived(tx, { firmId: A, person: { ...held, phone: "555 0101", phoneReadable: false }, bookingId: randomUUID() })));
  ok("FO-9b D5 fail (review m1): a booker on file with no phone and an open prospect: \"555 0101\" fills the phone as typed, unreadable (no 500)", heldR === null && stored(`id = '${heldLead.person.id}'`) === "555 0101|false|-", { heldR, s: stored(`id = '${heldLead.person.id}'`) });
  ok("FO-9b D5 fail (the port's contract): an unflagged phone that is not E.164 is still refused by the port, never stored readable",
    (await refusal(() => db.$transaction((tx) => real.bookingArrived(tx, { firmId: A, person: { ...who("ArriveRaw"), phone: "555 0101" }, bookingId: randomUUID() })))) !== null);

  // ------------------------------------------------------------------------------------- D6: the duplicate check
  const m1 = await dup.check(R, { phone: "0044 20 7946 0958" }), m2 = await dup.check(R, { phone: TRUNK });
  const ukPeople = sql(`select string_agg(id::text, ',') from fo_person where firm_id = '${A}' and phone_e164 = '${UK}'`).split(",");
  ok("FO-9b D6 pass: \"0044 20 7946 0958\" and \"+44 (0) 20 7946 0958\" both find the people stored +442079460958 (PHONE)",
    [m1, m2].every((m) => m.matches.some((x) => x.kind === "PERSON" && ukPeople.includes(x.personId) && x.reasons.some((r) => r.key === "PHONE"))), { m1: m1.matches.length, m2: m2.matches.length });
  const onlyBad = await refusal(() => dup.check(R, { phone: IMPOSSIBLE }));
  ok("FO-9b D6 fail: an unreadable \"+999 123\" is no phone key: alone it leaves nothing to check (422), never a match on \"+999123\"", onlyBad?.status === 422 && "body" in ((onlyBad.body.fields as object) ?? {}), onlyBad);

  // ------------------------------------------------------------------------------------- E: the edit route still refuses
  const pid = sql(`select id from fo_person where email = '${lead.bad.email}'`);
  const e422 = await refusal(() => people.editPhone(R, pid, { phone: IMPOSSIBLE }));
  ok("FO-9b E fail (FO-9a unchanged): the staff edit still refuses \"+999 123\" with 422 and the field's sentence", e422?.status === 422 && (e422.body.fields as Record<string, string>)?.phone === UNREADABLE_PHONE, e422);
  ok("FO-9b E pass: the staff edit saves the trunk-0 spelling as +442079460958", (await people.editPhone(R, pid, { phone: TRUNK })).phone === UK);

  // ------------------------------------------------------------------------------------- G: one normaliser, no second regex
  // The API doors only (the brief's grep): a suite that also lists the web folder would be picked by every page change
  // (check-select-suites.sh "that page chooses fewer than 30 suites"). The booking screen's phone check is proven by
  // behaviour instead: J-33 W5 books with "0044 …" on screen, and check_fo3w_booking_browser.ts.
  const FO = join(STUDIO, "api", "src", "front-office");
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);
  const PHONE_RE = /\[0-9\]\{6,14\}|\\\+\[1-9\]|\[2-9\]\[0-9\]\{9\}/;
  const regexHits = files(FO).filter((f) => !f.endsWith(join("duplicates", "phone.ts")) && PHONE_RE.test(readFileSync(f, "utf8"))).map((f) => relative(STUDIO, f));
  ok("FO-9b G pass: no phone regex in api/src/front-office outside duplicates/phone.ts", regexHits.length === 0, regexHits);
  const looseHits = files(FO).filter((f) => !f.endsWith(join("duplicates", "phone.ts")) && /import\s*\{[^}]*\bphoneE164\b(?!Exact)[^}]*\}\s*from\s*"[^"]*duplicates\/phone\.ts"/.test(readFileSync(f, "utf8"))).map((f) => relative(STUDIO, f));
  ok("FO-9b G fail: no front-office file imports the looser phoneE164; every door uses phoneE164Exact", looseHits.length === 0, looseHits);
  ok("FO-9b G pass: phone() in sales/common.ts calls phoneE164Exact", /phoneE164Exact\(t\)/.test(readFileSync(join(FO, "sales", "common.ts"), "utf8")));
  void wallToUtc;
} catch (e) {
  fail++;
  console.log(`FAIL  FO-9b: the check stopped — ${String((e as Error).stack ?? e).slice(0, 1200)}`);
} finally {
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* the next run's dropdb */ }
}
console.log(`\nFO-9b phone doors: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
