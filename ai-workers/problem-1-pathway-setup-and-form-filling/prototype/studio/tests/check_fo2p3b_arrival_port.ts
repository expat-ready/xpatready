// FO-2 part 3b (brief design/lead-b-briefs/FO-2p3b.md, rev 17.39; QA-511, R1.28; ports/arrival.ts; AG-2-84 rule 8,
// AG-2-26 rules 6 and 8, AG-4-19): the real ArrivalPort, `FO-2p3b DW1..DW6`, each with a pass and a fail. The contract
// (ports/contracts/arrival-port.contract.ts) runs on fakeArrival and on PrismaArrival; a broken fake shows it can fail.
// One scratch database (every migration, PF-3's and FO-1a's Sample seeds), dropped at the end. US$0.
//   tsx studio/tests/check_fo2p3b_arrival_port.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeArrival, type ArrivalPort, type FakeArrival } from "../ports/arrival.ts";
import { fakeAudit } from "../ports/audit.ts";
import { arrivalPortContract, type ArrivalHarness } from "../ports/contracts/arrival-port.contract.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { ensureBookingWording, SAMPLE_BOOKING_WORDING, seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { runtimeBookingPorts } from "../api/src/front-office/booking/runtime-ports.ts";
import { BOOKING_SOURCE, PrismaArrival } from "../api/src/front-office/sales/arrival-port.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { auditEvent } from "../api/src/platform/audit/audit-event.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo2p3b_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
const count = (t: string, where = "true") => Number(sql(`select count(*) from ${t} where ${where}`));

// ------------------------------------------------------------------------------------- the fake's harness
const FAKE_A = "00000000-0000-4000-8000-0000000000aa", FAKE_B = "00000000-0000-4000-8000-0000000000bb";
const fakeHarness = (wrap: (f: FakeArrival) => ArrivalPort<unknown> = (f) => f): ArrivalHarness => {
  const f = fakeArrival(), port = wrap(f);
  const at = (stage: string) => (stage === "CONSULT" ? "CONSULT" : ["NEW", "ENGAGED"].includes(stage) ? "BEFORE_CONSULT" : "PAST_CONSULT") as "CONSULT";
  return {
    port, firmId: FAKE_A, otherFirmId: FAKE_B,
    async tx(fn) { const t = {}; try { return await fn(t); } catch (e) { f.discard(t); throw e; } },
    async addProspect(firmId, email, standing) {
      const personId = f.addPerson(firmId, { givenNames: "Client", familyName: "Sample", email });
      const p = f.addProspect(firmId, email, standing === "BEFORE_CONSULT" ? "ENGAGED" : "RETAINER");
      return { personId, prospectId: p.id };
    },
    async addPerson(firmId, email) { return f.addPerson(firmId, { givenNames: "Client", familyName: "Sample", email }); },
    async standing(id) { const p = f.prospects.find((x) => x.id === id)!; return { at: at(p.stage), consultBooked: p.causes.filter((c) => c === "consult booked").length }; },
    async counts(firmId) { return { persons: [...f.people.keys()].filter((k) => k.startsWith(`${firmId.toLowerCase()}|`)).length, leads: f.leads.filter((l) => l.firmId === firmId.toLowerCase()).length }; },
    async wordingId() { return (await f.bookingConsentWording(undefined, FAKE_A))?.wordingId ?? null; },
  };
};

const fakeGood = await runContract(arrivalPortContract, "fakeArrival", () => fakeHarness(), ok);
ok("FO-2p3b DW6 pass: the contract passes on the fake", fakeGood.failed.length === 0, fakeGood.failed);
// A broken fake (it makes a lead even for a booker with an open prospect) must fail the contract: the contract can fail.
const broken = await runContract(arrivalPortContract, "leadForOpenProspect", () => fakeHarness((f) => ({
  ...f,
  async bookingArrived(tx, a) { const r = await f.bookingArrived(tx, a); return { personId: r.personId }; },
})), null);
ok("FO-2p3b DW6 fail: a port that never names the open prospect fails the contract", broken.failed.length > 0, broken);

// ------------------------------------------------------------------------------------- the real adapter
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("FO-2p3b setup: both Sample firms have their front office", fo.failed.length === 0);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const consent = new ConsentStore(auditEvent);
  const wording = await db.$transaction((tx) => consent.publishWording(tx as never, { firmId: A, channel: "EMAIL", purpose: "MARKETING", locale: "en-CA", text: "I agree that the firm may send me news by email (Sample wording).", by: "seed:fo2p3b-test" }));
  const real = new PrismaArrival({ audit: auditEvent, consent });
  const stage = (key: string) => sql(`select id from fo_stage where firm_id = '${A}' and pipeline = 'INDIVIDUAL' and key = '${key}'`);
  const addPerson = async (firmId: string, email: string) => (await db.foPerson.create({ data: { firmId, givenNames: "Client", familyName: "Sample", email, createdBy: "seed:fo2p3b-test" } })).id;
  const realHarness = (port: ArrivalPort<unknown> = real as ArrivalPort<unknown>): ArrivalHarness => ({
    port, firmId: A, otherFirmId: B,
    tx: (fn) => db.$transaction((tx) => fn(tx), { timeout: 30_000 }),
    async addProspect(firmId, email, standing) {
      // One person per email, as the fake keeps them: a second prospect for the same email is that person's second.
      const personId = (await db.foPerson.findFirst({ where: { firmId, email }, select: { id: true } }))?.id ?? await addPerson(firmId, email);
      const lead = sql(`insert into fo_lead (firm_id, person_id, door, source, created_by, updated_at) values ('${firmId}', '${personId}', 'MANUAL', 'Phone call', 'seed:fo2p3b-test', now()) returning id`).split("\n")[0];
      sql(`update fo_lead set state = 'ENGAGED', engaged_at = now(), engaged_by = 'seed:fo2p3b-test' where id = '${lead}'`);
      const s = stage(standing === "BEFORE_CONSULT" ? "ENGAGED" : "PROPOSAL");
      const prospectId = sql(`insert into fo_prospect (firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, created_by, updated_at) values ('${firmId}', '${lead}', 'INDIVIDUAL', '${s}', '${personId}', '${personId}', 'seed:fo2p3b-test', now()) returning id`).split("\n")[0];
      sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) values ('${firmId}', '${prospectId}', '${s}', 'PERSON', 'seed:fo2p3b-test')`);
      return { personId, prospectId };
    },
    addPerson,
    async standing(id) {
      const key = sql(`select s.key from fo_prospect p join fo_stage s on s.id = p.stage_id where p.id = '${id}'`);
      return { at: key === "CONSULT" ? "CONSULT" : ["ENGAGED", "QUALIFIED"].includes(key) ? "BEFORE_CONSULT" : "PAST_CONSULT", consultBooked: count("fo_stage_move", `prospect_id = '${id}' and cause = 'BOOKING'`) };
    },
    async counts(firmId) { return { persons: count("fo_person", `firm_id = '${firmId}'`), leads: count("fo_lead", `firm_id = '${firmId}'`) }; },
    async wordingId(firmId) { return firmId === A ? wording.id : null; },
  });
  const realGood = await runContract(arrivalPortContract, "PrismaArrival", () => realHarness(), ok);
  ok("FO-2p3b DW6 pass: the contract passes on the real adapter", realGood.failed.length === 0, realGood.failed);

  const booker = (tag: string) => ({ givenNames: "Client", familyName: `${tag} Sample`, email: `p3b.${tag.toLowerCase()}.${randomUUID().slice(0, 8)}@example.com` });
  const book = (a: Parameters<PrismaArrival["bookingArrived"]>[1]) => db.$transaction((tx) => real.bookingArrived(tx, a));

  // ------------------------------------------------------------------------------------- DW1: no tick, no consent row
  const id1 = randomUUID(), p1 = booker("NoTick");
  const consents0 = count("msg_consent", `firm_id = '${A}'`);
  const r1 = await book({ firmId: A, person: p1, bookingId: id1 });
  const lead1 = sql(`select id || '|' || door || '|' || source from fo_lead where person_id = '${r1.personId}'`).split("|");
  ok("FO-2p3b DW1 pass: a booking with the tick empty → one person and one lead (door BOOKING, source the booking page), its receipt keyed booking:<id> CREATED, and zero consent rows (QA-511)",
    lead1[1] === "BOOKING" && lead1[2] === BOOKING_SOURCE && count("fo_arrival_receipt", `intake_key = 'booking:${id1}' and door = 'BOOKING' and outcome = 'CREATED' and person_id = '${r1.personId}'`) === 1
      && count("msg_consent", `firm_id = '${A}'`) === consents0 && count("msg_consent", `subject_id = '${r1.personId}'`) === 0, { lead1, consents: count("msg_consent", `firm_id = '${A}'`) - consents0 });
  ok("FO-2p3b DW1 pass: the lead's audit line says it arrived by a booking, with a typed actor", count("audit_event", `entity_key = '${lead1[0]}' and action = 'lead.created' and summary like '%arrived by a booking%' and actor = 'system:booking-page'`) === 1);
  // The fail half: an adapter that writes consent with the tick empty is caught by the same count.
  const leaky = new PrismaArrival({ audit: auditEvent, consent });
  const leakyBook: PrismaArrival["bookingArrived"] = async (tx, a) => leaky.bookingArrived(tx, { ...a, consent: { wordingId: wording.id, givenAt: new Date() } });
  const rl = await db.$transaction((tx) => leakyBook(tx, { firmId: A, person: booker("Leaky"), bookingId: randomUUID() }));
  ok("FO-2p3b DW1 fail: an arrival that records consent although the tick was empty is caught (a consent row appears for that person)", count("msg_consent", `subject_id = '${rl.personId}'`) === 1);

  // ------------------------------------------------------------------------------------- DW2: a tick, one consent row
  const r2 = await book({ firmId: A, person: booker("Tick"), consent: { wordingId: wording.id, givenAt: new Date() }, bookingId: randomUUID() });
  ok("FO-2p3b DW2 pass: a booking with the tick → one consent row through ConsentPort, with the firm's wording id, source BOOKING_FORM, EMAIL marketing, for the new person",
    count("msg_consent", `subject_id = '${r2.personId}' and subject_kind = 'FO_PERSON' and wording_id = '${wording.id}' and source = 'BOOKING_FORM' and channel = 'EMAIL' and purpose = 'MARKETING'`) === 1);
  const otherWording = await db.$transaction((tx) => consent.publishWording(tx as never, { firmId: B, channel: "EMAIL", purpose: "MARKETING", locale: "en-CA", text: "Firm B's own sentence (Sample).", by: "seed:fo2p3b-test" }));
  const before2 = count("fo_person", `firm_id = '${A}'`);
  let refusedOther = false;
  try { await book({ firmId: A, person: booker("Wrong"), consent: { wordingId: otherWording.id, givenAt: new Date() }, bookingId: randomUUID() }); } catch { refusedOther = true; }
  ok("FO-2p3b DW2 fail: another firm's wording id is refused and nothing is left (the booking rolls back)", refusedOther && count("fo_person", `firm_id = '${A}'`) === before2);

  // ------------------------------------------------------------------------------------- DW3: idempotent
  const again = await book({ firmId: A, person: p1, bookingId: id1 });
  ok("FO-2p3b DW3 pass: the same booking id twice → the same person, one lead, one receipt", again.personId === r1.personId && count("fo_lead", `person_id = '${r1.personId}'`) === 1 && count("fo_arrival_receipt", `intake_key = 'booking:${id1}'`) === 1);
  const r3 = await book({ firmId: A, person: p1, bookingId: randomUUID() });
  ok("FO-2p3b DW3 fail: a new booking id by the same person is a new arrival (a new lead, flagged as a possible match, never linked)",
    r3.personId !== r1.personId && count("fo_lead", `person_id = '${r3.personId}' and possible_match_person_id = '${r1.personId}'`) === 1);

  // ------------------------------------------------------------------------------------- DW4: open prospects
  const h = realHarness();
  const op = await h.addProspect(A, booker("Lead").email, "BEFORE_CONSULT");
  const opEmail = sql(`select email from fo_person where id = '${op.personId}'`);
  const leads4 = count("fo_lead", `firm_id = '${A}'`);
  const r4 = await book({ firmId: A, person: { ...booker("Lead"), email: opEmail }, bookingId: randomUUID() });
  ok("FO-2p3b DW4 pass: a booker with one open prospect → no new lead or person (receipt ON_OPEN_PROSPECT), the prospect moves to Consult with the cause BOOKING, audited and in the outbox",
    r4.personId === op.personId && r4.prospectId === op.prospectId && count("fo_lead", `firm_id = '${A}'`) === leads4 && (await h.standing(op.prospectId)).at === "CONSULT"
      && count("fo_arrival_receipt", `person_id = '${op.personId}' and outcome = 'ON_OPEN_PROSPECT' and lead_id is null`) === 1
      && count("audit_event", `entity_key = '${op.prospectId}' and action = 'prospect.stage_moved' and detail->>'cause' = 'BOOKING'`) === 1
      && count("module_event", `subject_id = '${op.prospectId}' and type = 'prospect.stage_moved' and payload->>'cause' = 'BOOKING'`) === 1, r4);
  const two = await h.addProspect(A, booker("Two").email, "BEFORE_CONSULT");
  const twoEmail = sql(`select email from fo_person where id = '${two.personId}'`);
  const second = sql(`insert into fo_prospect (firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, created_by, updated_at) select firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, created_by, now() from fo_prospect where id = '${two.prospectId}' returning id`).split("\n")[0];
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) values ('${A}', '${second}', '${stage("ENGAGED")}', 'PERSON', 'seed:fo2p3b-test')`);
  const r4b = await book({ firmId: A, person: { ...booker("Two"), email: twoEmail }, bookingId: randomUUID() });
  ok("FO-2p3b DW4 fail: with two open prospects neither moves and no prospect is named (and still no new lead)",
    r4b.prospectId === undefined && (await h.standing(two.prospectId)).at === "BEFORE_CONSULT" && (await h.standing(second)).at === "BEFORE_CONSULT" && count("fo_lead", `person_id = '${two.personId}'`) === 1);
  const past = await h.addProspect(A, booker("Past").email, "PAST_CONSULT");
  await book({ firmId: A, person: { ...booker("Past"), email: sql(`select email from fo_person where id = '${past.personId}'`) }, bookingId: randomUUID() });
  ok("FO-2p3b DW4 fail: a prospect already past Consult (Fees discussed) is not moved back", (await h.standing(past.prospectId)).at === "PAST_CONSULT" && count("fo_stage_move", `prospect_id = '${past.prospectId}' and cause = 'BOOKING'`) === 0);

  // Break M1 (AG-2-10 rule 3): the phone a booker on file types is kept: an empty phone is filled; a different one on
  // file is never overwritten, the typed number goes on an INTERNAL note on the prospect.
  const ph = await h.addProspect(A, booker("Phone").email, "BEFORE_CONSULT");
  const phEmail = sql(`select email from fo_person where id = '${ph.personId}'`);
  await book({ firmId: A, person: { ...booker("Phone"), email: phEmail, phone: "+14165550123" }, bookingId: randomUUID() });
  ok("FO-2p3b DW4 pass (break M1): a booker on file with no phone → the typed phone is kept on the person (E.164, readable)", sql(`select phone || '|' || phone_readable from fo_person where id = '${ph.personId}'`) === "+14165550123|true");
  await book({ firmId: A, person: { ...booker("Phone"), email: phEmail, phone: "+14165550199" }, bookingId: randomUUID() });
  ok("FO-2p3b DW4 fail (break M1): a different typed phone never overwrites the one on file; it is kept as an INTERNAL note on the prospect, and no audit line carries it",
    sql(`select phone from fo_person where id = '${ph.personId}'`) === "+14165550123" && count("fo_note", `person_id = '${ph.personId}' and prospect_id = '${ph.prospectId}' and visibility = 'INTERNAL' and text like '%+14165550199%'`) === 1
      && count("audit_event", `detail::text like '%4165550199%' or summary like '%4165550199%'`) === 0);
  // Break m1: a booking and a hand-added lead with the same email and phone at once never deadlock (one lock order).
  const leadsSvc = new Leads(db, { audit: auditEvent, consent, publicOrigin: "http://localhost:4400" });
  const R = (() => { const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = 'user-R'`).split("|"); const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission rp join platform_role_grant g on g.role = rp.role where g.staff_id = '${id}'`).split(","); return { staffId: id, firmId, firmKey: "sample-firm", roles: [], keys, duties: [], authTime: 0, via: "local" } as never; })();
  const races = [];
  for (let i = 0; i < 4; i++) {
    const email = `p3b.race${i}.${randomUUID().slice(0, 6)}@example.com`, phone = `+1416555${String(1000 + i)}`;
    races.push(Promise.allSettled([book({ firmId: A, person: { givenNames: "Race", familyName: "Sample", email, phone }, bookingId: randomUUID() }), leadsSvc.add(R, { requestId: randomUUID(), givenNames: "Race", familyName: "Sample", email, phone, source: "Phone call" })]));
  }
  const settled = (await Promise.all(races)).flat();
  ok("FO-2p3b DW4 fail (break m1): four rounds of a booking and a hand-added lead with the same email and phone at once all succeed (no deadlock, 40P01)",
    settled.every((x) => x.status === "fulfilled"), settled.filter((x) => x.status === "rejected").map((x) => String((x as PromiseRejectedResult).reason).slice(0, 120)));
  // Review M1: a staff move committed while the booking waits on the prospect rows. Two open prospects: one is moved
  // Engaged → Qualified (still open) by another transaction holding its row; the booking must still see two and move none.
  const rc = await h.addProspect(A, booker("Race").email, "BEFORE_CONSULT");
  const rcEmail = sql(`select email from fo_person where id = '${rc.personId}'`);
  const rc2 = sql(`insert into fo_prospect (firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, created_by, updated_at) select firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, created_by, now() from fo_prospect where id = '${rc.prospectId}' returning id`).split("\n")[0];
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) values ('${A}', '${rc2}', '${stage("ENGAGED")}', 'PERSON', 'seed:fo2p3b-test')`);
  const first = [rc.prospectId, rc2].sort()[0];
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const mover = db.$transaction(async (tx) => {
    await tx.$queryRaw`select 1 from fo_prospect where id = ${first}::uuid for update`;
    await tx.foProspect.update({ where: { id: first }, data: { stageId: stage("QUALIFIED") } });
    await tx.foStageMove.create({ data: { firmId: A, prospectId: first, fromStageId: stage("ENGAGED"), toStageId: stage("QUALIFIED"), cause: "PERSON", byActor: "seed:fo2p3b-test" } });
    await gate;
  }, { timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 300));
  const racing = book({ firmId: A, person: { ...booker("Race"), email: rcEmail }, bookingId: randomUUID() });
  await new Promise((r) => setTimeout(r, 500));
  release();
  await mover;
  const raced = await racing;
  ok("FO-2p3b DW4 fail (review M1): a staff move committed while the booking waited leaves two open prospects: neither moves to Consult and no prospect is named; still no new lead",
    raced.prospectId === undefined && (await h.standing(rc.prospectId)).at === "BEFORE_CONSULT" && (await h.standing(rc2)).at === "BEFORE_CONSULT" && count("fo_lead", `person_id = '${rc.personId}'`) === 1
      && count("fo_stage_move", `prospect_id in ('${rc.prospectId}', '${rc2}') and cause = 'BOOKING'`) === 0, raced);
  ok("FO-2p3b DW5 pass (review m2): contactOf of a person without an email is null (the port's person always has one)",
    (await real.contactOf(db, A, (await db.foPerson.create({ data: { firmId: A, givenNames: "Phone", familyName: "Only", phone: "+14165550101", createdBy: "seed:fo2p3b-test" } })).id)) === null);

  // Break m4: only the firm's current booking wording; an older version of the same firm is refused in process too.
  const newer = await db.$transaction((tx) => consent.publishWording(tx as never, { firmId: A, channel: "EMAIL", purpose: "MARKETING", locale: "en-CA", text: "I agree that the firm may send me news by email, version 2 (Sample wording).", by: "seed:fo2p3b-test" }));
  let staleRefused = false;
  try { await book({ firmId: A, person: booker("Stale"), consent: { wordingId: wording.id, givenAt: new Date() }, bookingId: randomUUID() }); } catch { staleRefused = true; }
  const fresh = await book({ firmId: A, person: booker("Fresh"), consent: { wordingId: newer.id, givenAt: new Date() }, bookingId: randomUUID() });
  ok("FO-2p3b DW2 fail (break m4): an older wording version is refused; the current one is recorded", staleRefused && count("msg_consent", `subject_id = '${fresh.personId}' and wording_id = '${newer.id}'`) === 1);
  ok("FO-2p3b DW5 fail (break m7): a 36-character id that is no uuid → null, never a database error",
    (await db.$transaction((tx) => real.bookingForPerson(tx, { firmId: A, personId: "------------------------------------", bookingId: randomUUID() }))) === null && (await real.contactOf(db, A, "------------------------------------")) === null);

  // ------------------------------------------------------------------------------------- DW5: bookingForPerson
  const bp = await h.addProspect(A, booker("Staff").email, "BEFORE_CONSULT");
  const nullB = await db.$transaction((tx) => real.bookingForPerson(tx, { firmId: B, personId: bp.personId, bookingId: randomUUID() }));
  const unknown = await db.$transaction((tx) => real.bookingForPerson(tx, { firmId: A, personId: randomUUID(), bookingId: randomUUID() }));
  ok("FO-2p3b DW5 fail: firm B's booking for firm A's person, or an unknown person → null (the booking side's 404)", nullB === null && unknown === null, { nullB, unknown });
  const leads5 = count("fo_lead", `firm_id = '${A}'`);
  const own = await db.$transaction((tx) => real.bookingForPerson(tx, { firmId: A, personId: bp.personId, bookingId: randomUUID() }));
  ok("FO-2p3b DW5 pass: the firm's own person → the prospect moves to Consult and no lead is made", own?.prospectId === bp.prospectId && (await h.standing(bp.prospectId)).at === "CONSULT" && count("fo_lead", `firm_id = '${A}'`) === leads5, own);

  // ------------------------------------------------------------------------------------- DW6: binding and rollback
  const bound = runtimeBookingPorts({ send: async () => ({ id: "x" }) } as never).arrival;
  ok("FO-2p3b DW6 pass: the running app's booking ports bind the real adapter, not fakeArrival", bound instanceof PrismaArrival);
  const failing = new PrismaArrival({ audit: fakeAudit({ failOn: () => true }), consent });
  const persons6 = count("fo_person", `firm_id = '${A}'`);
  let rolled = false;
  try { await db.$transaction((tx) => failing.bookingArrived(tx, { firmId: A, person: booker("Fail"), bookingId: randomUUID() })); } catch { rolled = true; }
  ok("FO-2p3b DW6 fail: a forced audit failure rolls the arrival back (no person, lead or receipt)", rolled && count("fo_person", `firm_id = '${A}'`) === persons6);
  ok("FO-2p3b DW6 pass: every audit line the adapter wrote has a typed actor", count("audit_event", `actor not similar to '(staff|system|seed):%'`) === 0);

  // ------------------------------------------------------------- DW7: the Sample booking wording (Lead B's ruling on #2196)
  const words = (f: string) => count("msg_consent_wording", `firm_id = '${f}' and channel = 'EMAIL' and purpose = 'MARKETING'`);
  const sampleOf = (f: string) => count("msg_consent_wording", `firm_id = '${f}' and channel = 'EMAIL' and purpose = 'MARKETING' and text = '${SAMPLE_BOOKING_WORDING}'`);
  ok("FO-2p3b DW7 pass: a seeded firm has exactly one Sample booking wording", sampleOf(B) === 1, { sample: sampleOf(B) });
  await seedSampleFirmsFrontOffice(db);
  const againB = await db.$transaction((tx) => ensureBookingWording(tx, B));
  ok("FO-2p3b DW7 fail: a second seed adds no wording", sampleOf(B) === 1 && againB === false, { sample: sampleOf(B), againB });
  const wordsA = words(A), madeA = await db.$transaction((tx) => ensureBookingWording(tx, A)), newestA = await real.bookingConsentWording(db, A);
  ok("FO-2p3b DW7 fail: a firm's own wording is never replaced (no row added; the page shows the firm's newest)", madeA === false && words(A) === wordsA && newestA?.wordingId !== undefined && sql(`select text from msg_consent_wording where id = '${newestA.wordingId}'`) !== SAMPLE_BOOKING_WORDING, { madeA, newestA });
  const C = (await db.platformFirm.create({ data: { key: "fo2p3b-unseeded", operatingName: "Sample Firm C", countryCode: "CA", status: "ACTIVE", contactEmail: "office@firm-c.example" } })).id;
  const firstC = await real.bookingConsentWording(db, C), secondC = await real.bookingConsentWording(db, C);
  ok("FO-2p3b DW7 pass: the Sample wording asks for marketing email and is published with its audit line", /news and updates/.test(SAMPLE_BOOKING_WORDING) && count("audit_event", `action = 'consent.wording.published' and entity_key = '${firstC?.wordingId}'`) === 1);
  ok("FO-2p3b DW7 pass: a firm with no wording is offered the Sample one on the public page, made once", firstC?.text === SAMPLE_BOOKING_WORDING && secondC?.wordingId === firstC?.wordingId && words(C) === 1, { firstC, words: words(C) });
} catch (e) {
  fail++;
  console.log(`FAIL  FO-2p3b: the check stopped — ${String((e as Error).stack ?? e).slice(0, 1200)}`);
} finally {
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* the next run's dropdb */ }
}
console.log(`\nFO-2p3b the real ArrivalPort: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
