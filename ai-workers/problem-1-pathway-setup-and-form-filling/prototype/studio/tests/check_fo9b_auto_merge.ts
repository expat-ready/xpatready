// FO-9b part 2b (BACKLOG row FO-9b part 2b; R1.29; P-574 (2); Lead 10 and Lead 12 on #3174): every arrival door merges a
// new safe duplicate by itself, by a job after the arrival commits (api/src/front-office/duplicates/merge/at-arrival.ts),
// each Done-when line with a pass and a fail, on one scratch database dropped at the end. The doors run their one
// arrival path (arrive(): the web form, the hand-added lead; PrismaArrival for the booking page) with the job on
// PF-14's fake runner. Every value is Sample. US$0, no model call.
//   tsx studio/tests/check_fo9b_auto_merge.ts
import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo9bam_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const psql = (args: string[]) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string) => psql(["-Atc", q]);

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
process.env.DATABASE_URL = URL_;
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED"]) delete process.env[k];

const { Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { seedSampleFirmsFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { ConsentStore } = await import("../api/src/platform/messages/consent/consent-store.ts");
const { arrive } = await import("../api/src/front-office/sales/arrival.ts");
const { PrismaArrival } = await import("../api/src/front-office/sales/arrival-port.ts");
const { phone: salesPhone } = await import("../api/src/front-office/sales/common.ts");
const { ArrivalAutoMerge, AUTO_MERGE_QUEUE, mergeArrival, registerAutoMerge } = await import("../api/src/front-office/duplicates/merge/at-arrival.ts");
const { listedPair, DuplicateReview, SYSTEM_ACTOR } = await import("../api/src/front-office/duplicates/merge/review.ts");
const { FakeClock } = await import("../ports/clock.ts");
const { fakeJobs } = await import("../ports/jobs.ts");

try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) psql(["-f", join(MIG, d, "migration.sql")]);
  const db = new Db();
  await seedSampleFirms(db);
  await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const R = sql(`select id from platform_staff where actor_id = 'user-R'`);
  const consent = new ConsentStore(auditEvent), ports = { audit: auditEvent, consent };
  const jobs = fakeJobs(new FakeClock("2026-11-24T12:00:00.000Z"));
  const auto = new ArrivalAutoMerge(db, jobs, ports);
  await auto.register();   // the app's provider does this: the job on the runner, then the queue for arrive()

  type P = { givenNames: string; familyName: string | null; email?: string; phone?: string };
  const person = (p: P) => ({ givenNames: p.givenNames, familyName: p.familyName, email: p.email ?? null, phone: p.phone ? salesPhone(p.phone) : null });
  // The web form's arrival (public.ts: door WEB_FORM, actor system:web-form) and the hand-added lead's (leads.ts: MANUAL)
  const formOf = (firmId: string) => sql(`select id from fo_web_form where firm_id = '${firmId}' order by created_at limit 1`);
  const webIn = (firmId: string) => { const f = formOf(firmId); return { firmId, door: "WEB_FORM" as const, webFormId: f, intakeKey: `form:${f}:${randomUUID()}` }; };
  const web = async (p: P, firmId = A) => (await db.$transaction((tx) => arrive(tx as never, { ...webIn(firmId), source: "Website", actor: "system:web-form", payloadHash: randomUUID(), person: person(p) }, ports))).personId!;
  const manual = async (p: P) => (await db.$transaction((tx) => arrive(tx as never, { firmId: A, door: "MANUAL", intakeKey: `manual:${randomUUID()}`, source: "Phone call", actor: `staff:${R}`, payloadHash: randomUUID(), ownerStaffId: R, person: person(p) }, ports))).personId!;
  const booking = new PrismaArrival(ports);
  const book = async (p: P & { email: string }) => (await db.$transaction((tx) => booking.bookingArrived(tx as never, { firmId: A, bookingId: randomUUID(), person: { givenNames: p.givenNames, familyName: p.familyName ?? "", email: p.email } }))).personId;
  const pairOf = (a: string, b: string) => sql(`select id from fo_dup_review where low_id = least('${a}'::uuid, '${b}'::uuid) and high_id = greatest('${a}'::uuid, '${b}'::uuid)`);
  const live = (...ids: string[]) => Number(sql(`select count(*) from fo_person where id = any('{${ids.join(",")}}'::uuid[]) and merged_into_id is null`));
  const queued = (id: string) => jobs.jobs.filter((j) => j.name === AUTO_MERGE_QUEUE && j.payload.personId === id);

  // --------------------------------------------------------------------------- two safe arrivals become one record
  const ann1 = await web({ givenNames: "Ann", familyName: "Auto", email: "ann.auto@example.org" });
  const ann2 = await web({ givenNames: "Anne", familyName: "Auto", email: "ann.auto@example.org" });
  ok("FO-9b 2b: each new person's arrival queues one merge job for its firm, keyed by the person (none runs inside the arrival)",
    queued(ann1).length === 1 && queued(ann2).length === 1 && queued(ann2)[0].firmId === A && queued(ann2)[0].status === "waiting" && live(ann1, ann2) === 2);
  await jobs.runDue();
  const m = sql(`select id || '|' || automatic || '|' || by || '|' || survivor_id || '|' || loser_id from fo_dup_merge where loser_id = '${ann2}'`).split("|");
  ok("FO-9b 2b pass: two safe web-form arrivals with one email become one record once (the newer into the older), logged automatic by system:fo-duplicates with its merge record",
    m.length === 5 && m[1] === "true" && m[2] === SYSTEM_ACTOR && m[3] === ann1 && m[4] === ann2 && live(ann1, ann2) === 1 && sql(`select status from fo_dup_review where id = '${pairOf(ann1, ann2)}'`) === "MERGED", m);
  ok("FO-9b 2b pass: one person.merged event and one audit line for that merge; both leads are on the survivor",
    sql(`select count(*) from module_event where type = 'person.merged' and payload->>'loserId' = '${ann2}'`) === "1" && sql(`select count(*) from audit_event where action = 'person.merged' and entity_key in ('${ann1}', '${ann2}', '${m[0]}')`) === "1"
    && sql(`select count(*) from fo_lead where person_id = '${ann1}'`) === "2", [sql(`select count(*) from module_event where type = 'person.merged'`), sql(`select string_agg(entity_key, ',') from audit_event where action = 'person.merged'`)]);
  ok("FO-9b 2b pass (break B1): the record on file keeps its own name: the newcomer's \"Anne\" never overwrites \"Ann\"", sql(`select given_names from fo_person where id = '${ann1}'`) === "Ann");
  await auto.run({ ...queued(ann2)[0], attempt: 2 });
  ok("FO-9b 2b fail: running the job again merges nothing (one merge record for the person)", sql(`select count(*) from fo_dup_merge where '${ann2}' in (loser_id, survivor_id)`) === "1");

  // -------------------------------------------------------------------- the hand-added lead and the booking page
  const ted1 = await web({ givenNames: "Ted", familyName: "Door", phone: "+1 416 555 0171" });
  const ted2 = await manual({ givenNames: "Ted", familyName: "Doors", phone: "416-555-0171" });
  const bo1 = await web({ givenNames: "Bo", familyName: "Booker", email: "bo.booker@example.org" });
  const bo2 = await book({ givenNames: "Bo", familyName: "Booker", email: "bo.booker@example.org" });
  await jobs.runDue();
  ok("FO-9b 2b pass: arrive()'s MANUAL path (reached by Add a lead only in a race: an exact match is 409 KNOWN_PERSON first) with an exact phone, and a booking-page arrival with an exact email, are merged by themselves into the earlier record",
    live(ted1, ted2) === 1 && sql(`select merged_into_id from fo_person where id = '${ted2}'`) === ted1 && live(bo1, bo2) === 1 && sql(`select merged_into_id from fo_person where id = '${bo2}'`) === bo1);
  const known = await db.$transaction((tx) => arrive(tx as never, { firmId: A, door: "MANUAL", intakeKey: `manual:${randomUUID()}`, source: "Phone call", actor: `staff:${R}`, payloadHash: randomUUID(), ownerStaffId: R, existingPersonId: ted1, person: person({ givenNames: "Ted", familyName: "Door" }) }, ports));
  ok("FO-9b 2b fail: a lead added for a person already on file queues nothing (no new person)", known.personId === ted1 && queued(ted1).length === 1);

  // --------------------------------------------------------------------- never with money; not exact; Kept separate
  const replica = (q: string) => sql(`set session_replication_role = replica; ${q}`);
  const moneyCase = async (tag: string, seed: (p: string) => void) => {
    const a = await web({ givenNames: "Mo", familyName: `Money${tag}`, email: `mo.${tag}@example.org` });
    seed(a);
    const b = await web({ givenNames: "Mo", familyName: `Money${tag}`, email: `mo.${tag}@example.org` });
    await jobs.runDue();
    return { a, b, pair: pairOf(a, b) };
  };
  const payer = await web({ givenNames: "Pat", familyName: "Payer", email: "pat.payer@example.org" });
  const inv = await moneyCase("inv", (p) => replica(`insert into money_invoice (id, firm_id, person_id, currency, due_date, created_by, updated_at) values (gen_random_uuid(), '${A}', '${p}', 'CAD', '2026-12-15', 'seed:fo9b2b', now())`));
  const tax = await moneyCase("tax", (p) => replica(`insert into money_party_tax_treatment (firm_id, person_id, treatment, updated_by) values ('${A}', '${p}', 'EXEMPT', 'seed:fo9b2b')`));
  const pay = await moneyCase("pay", (p) => replica(`insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, refund_method, refunded_on, payee_person_id, payee_reason, reason, created_by) values ('${A}', '${payer}', 'REFUND_TO_CLIENT', -100, 'CAD', 1, 0, 'E_TRANSFER', current_date, '${p}', 'Refund paid to a relative (Sample).', 'Refund (Sample).', 'seed:fo9b2b')`));
  for (const [what, c] of [["an invoice", inv], ["a tax treatment", tax], ["a trust payee row", pay]] as const)
    ok(`FO-9b 2b fail: an arrival matching a person with ${what} is never merged by itself and waits on the review list (To review)`, live(c.a, c.b) === 2 && !!c.pair && (await listedPair(db, A, c.pair)) === "OPEN", { live: live(c.a, c.b), pair: c.pair });
  const n1 = await web({ givenNames: "Nadia", familyName: "Similar", email: "nadia.1@example.org" });
  const n2 = await web({ givenNames: "Nadia", familyName: "Similar", email: "nadia.2@example.org" });
  await jobs.runDue();
  ok("FO-9b 2b fail: a similar name alone (no exact email or phone) is listed, never merged by itself", live(n1, n2) === 2 && !!pairOf(n1, n2) && (await listedPair(db, A, pairOf(n1, n2))) === "OPEN");

  // ------------------------------------------------------------------- a Busy lock never fails the arrival
  const b1 = await web({ givenNames: "Bea", familyName: "Busy", email: "bea.busy@example.org" });
  let release!: () => void, holding!: () => void;
  const held = new Promise<void>((r) => { holding = r; });
  const holder = db.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(`select 1 from fo_lead where person_id = $1::uuid for update`, b1);   // a writer on Bea's lead, in another session
    holding(); await new Promise<void>((r) => { release = r; });
  }, { timeout: 60_000 });
  await held;
  let arrivalErr = "";
  const t0 = Date.now();
  const b2 = await web({ givenNames: "Bea", familyName: "Busy", email: "bea.busy@example.org" }).catch((e) => { arrivalErr = String(e); return ""; });
  const arrivedIn = Date.now() - t0;
  await jobs.runDue();
  const busyJob = queued(b2)[0];
  ok("FO-9b 2b pass: with a planted lock held on the earlier person's lead, the arrival still commits at once (its lead and person written)",
    !arrivalErr && !!b2 && arrivedIn < 2000 && sql(`select count(*) from fo_lead where person_id = '${b2}'`) === "1", { arrivalErr, arrivedIn });
  ok("FO-9b 2b fail: the merge meets the held lock: Busy, nothing merged, the job fails so the queue tries again, and the pair stays To review",
    busyJob?.status === "failed" && /busy/i.test(busyJob?.error ?? "") && live(b1, b2) === 2 && sql(`select status from fo_dup_review where id = '${pairOf(b1, b2)}'`) === "OPEN", busyJob);
  release(); await holder;
  await auto.run({ ...busyJob, attempt: 2 });
  ok("FO-9b 2b pass: the queue's next try, once the lock is let go, merges the pair", live(b1, b2) === 1 && sql(`select status from fo_dup_review where id = '${pairOf(b1, b2)}'`) === "MERGED");

  // ------------------------------------------------------------------- the job waits for the arrival to end
  {
    let go!: () => void;
    const gate = new Promise<void>((r) => { go = r; });
    const w1 = await web({ givenNames: "Wes", familyName: "Wait", email: "wes.wait@example.org" });
    let w2 = "";
    const slow = db.$transaction(async (tx) => {
      const out = await arrive(tx as never, { ...webIn(A), source: "Website", actor: "system:web-form", payloadHash: randomUUID(), person: person({ givenNames: "Wes", familyName: "Wait", email: "wes.wait@example.org" }) }, ports);
      w2 = out.personId!; await gate;   // the arrival is still open: its person and pair are not committed yet
    }, { timeout: 30_000 });
    while (!w2) await new Promise((r) => setTimeout(r, 20));
    let done = false;
    const merging = mergeArrival(db, A, w2, ports).then((r) => { done = true; return r; });
    await new Promise((r) => setTimeout(r, 600));
    const waited = !done;
    go(); await slow;
    const r = await merging;
    ok("FO-9b 2b pass: the job waits on the open arrival (its arrival lock), then sees it committed and merges", waited && !!r.mergeRef && live(w1, w2) === 1, { waited, r });
    let rolled = "";
    await db.$transaction(async (tx) => {
      const out = await arrive(tx as never, { ...webIn(A), source: "Website", actor: "system:web-form", payloadHash: randomUUID(), person: person({ givenNames: "Wes", familyName: "Wait", email: "wes.wait@example.org" }) }, ports);
      rolled = out.personId!; throw new Error("rolled back on purpose");
    }).catch(() => undefined);
    const rr = await mergeArrival(db, A, rolled, ports);
    ok("FO-9b 2b fail: an arrival that rolled back leaves a job that finds no person and merges nothing", !rr.arrived && !rr.mergeRef && sql(`select count(*) from fo_person where id = '${rolled}'`) === "0", rr);
  }


  // ------------------------------------------------------------- break B1, M1 and m1-m3 on #3527 (the arrival is unchecked)
  const ctxOf = (actor: string) => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actor}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey: "sample-firm", roles, keys, duties: [], authTime: 0, via: "local" as const };
  };
  const review = new DuplicateReview(db, ports), owner = ctxOf("user-R");
  const vera = await web({ givenNames: "Vera", familyName: "Victim", email: "vera.v@example.org" });
  const mal = await web({ givenNames: "Mallory", familyName: "Attacker", email: "vera.v@example.org", phone: "+1 416 555 0144" });
  await jobs.runDue();
  ok("FO-9b 2b fail (break B1, R2-B1): a stranger's arrival with Vera's email and a phone she lacks is never merged by itself: her record unchanged, the pair To review",
    live(vera, mal) === 2 && sql(`select given_names || ' ' || family_name || '|' || email || '|' || coalesce(phone_e164, '-') from fo_person where id = '${vera}'`) === "Vera Victim|vera.v@example.org|-" && (await listedPair(db, A, pairOf(vera, mal))) === "OPEN");
  const ada = await web({ givenNames: "Ada", familyName: "One", phone: "+1 416 555 0146" }), bea = await web({ givenNames: "Bea", familyName: "Two", email: "bea.two@example.org" });
  const zed = await web({ givenNames: "Zed", familyName: "Bridge", email: "bea.two@example.org", phone: "416 555 0146" });
  await jobs.runDue();
  ok("FO-9b 2b fail (R2-B2, M-r1): one stranger with Bea's email and Ada's phone joins no one: Ada, Bea and Zed all stay live, Ada and Bea unchanged",
    live(ada, bea, zed) === 3 && sql(`select coalesce(email, '-') from fo_person where id = '${ada}'`) === "-" && sql(`select coalesce(phone_e164, '-') from fo_person where id = '${bea}'`) === "-");
  const hh1 = await web({ givenNames: "Hal", familyName: "Home", email: "hal@example.org", phone: "+1 416 555 0145" });
  const hh2 = await web({ givenNames: "Hana", familyName: "Home", email: "hana@example.org", phone: "416 555 0145" });
  await jobs.runDue();
  ok("FO-9b 2b fail (break B1): one phone with two different emails (a household phone) is never merged by itself; the pair waits To review",
    live(hh1, hh2) === 2 && (await listedPair(db, A, pairOf(hh1, hh2))) === "OPEN" && sql(`select email from fo_person where id = '${hh1}'`) === "hal@example.org");
  const wording = sql(`select id || '|' || channel || '|' || purpose || '|' || locale from msg_consent_wording where firm_id = '${A}' order by version limit 1`).split("|");
  const c1 = await web({ givenNames: "Cora", familyName: "Consent", email: "cora@example.org" });
  const c2 = (await db.$transaction((tx) => arrive(tx as never, { ...webIn(A), source: "Website", actor: "system:web-form", payloadHash: randomUUID(), person: person({ givenNames: "Cora", familyName: "Consent", email: "cora@example.org" }),
    consent: { wordingId: wording[0], channel: wording[1] as never, purpose: wording[2] as never, locale: wording[3] } }, ports))).personId!;
  await jobs.runDue();
  ok("FO-9b 2b fail (break M1): an arrival carrying a consent is never merged by itself (its copy could never be undone); the pair waits To review, no consent on Cora",
    live(c1, c2) === 2 && (await listedPair(db, A, pairOf(c1, c2))) === "OPEN" && sql(`select count(*) from msg_consent where subject_id = '${c1}'`) === "0");
  const u1 = await web({ givenNames: "Uma", familyName: "Undo", email: "uma@example.org" }), u2 = await web({ givenNames: "Uma", familyName: "Undo", email: "uma@example.org" });
  await jobs.runDue();
  const um = sql(`select id from fo_dup_merge where loser_id = '${u2}'`);
  const undone = await review.undo(owner as never, um) as { restored?: boolean };
  await auto.run({ ...queued(u2)[0], attempt: 2 });
  ok("FO-9b 2b fail (review m1, break m3): the job run again after a person's Undo never merges the pair again",
    !!undone.restored && live(u1, u2) === 2 && sql(`select count(*) from fo_dup_merge where loser_id = '${u2}'`) === "1" && (await listedPair(db, A, pairOf(u1, u2))) === "OPEN", { undone, merges: sql(`select count(*) from fo_dup_merge where loser_id = '${u2}'`) });
  const k1 = await web({ givenNames: "Kip", familyName: "Kept", email: "kip@example.org" });
  const k2 = (await db.$transaction((tx) => arrive(tx as never, { firmId: A, door: "MANUAL", intakeKey: `manual:${randomUUID()}`, source: "Phone call", actor: `staff:${R}`, payloadHash: randomUUID(), ownerStaffId: R, addedAsNew: true, person: person({ givenNames: "Kip", familyName: "Kept", email: "kip@example.org" }) }, ports))).personId!;
  await jobs.runDue();
  ok("FO-9b 2b fail (review m3): Add a lead's \"Add as new\" writes the pair Kept separate and the job never merges it", live(k1, k2) === 2 && (await listedPair(db, A, pairOf(k1, k2))) === "KEPT_SEPARATE");
  // a burst: P2's job never ran (no queue then); P3's job merges P3 into P1, then P2 too (it also matched P3)
  const p1 = await web({ givenNames: "Pia", familyName: "Burst", email: "pia@example.org" });
  await jobs.runDue();   // P1's own job is done before the burst (review m-r1: else it alone would merge P2)
  registerAutoMerge(null); const p2 = await web({ givenNames: "Pia", familyName: "Burst", email: "pia@example.org" }); registerAutoMerge(auto);
  const p3 = await web({ givenNames: "Pia", familyName: "Burst", email: "pia@example.org" });
  await jobs.runDue();
  ok("FO-9b 2b pass (break m1): a burst of one person's arrivals becomes one record, even when one job did not run", live(p1, p2, p3) === 1 && live(p1) === 1,   // P3 into P1 or into P2 first (equal scores): either way one record, the first
    { live: live(p1, p2, p3), into: sql(`select string_agg(coalesce(merged_into_id::text, '-'), ',') from fo_person where id in ('${p1}', '${p2}', '${p3}')`), ids: [p1, p2, p3], pairs: sql(`select string_agg(low_id || '-' || high_id || ':' || status, ' ') from fo_dup_review where '${p1}' in (low_id, high_id) or '${p2}' in (low_id, high_id)`), job: queued(p3)[0]?.status + (queued(p3)[0]?.error ?? "") });
  const o1 = await web({ givenNames: "Oli", familyName: "Old", email: "oli@example.org" });
  await jobs.runDue();   // O1's own job done first
  registerAutoMerge(null); const o2 = await web({ givenNames: "Oli", familyName: "Old", email: "oli@example.org" }); registerAutoMerge(auto);
  sql(`update fo_person set created_at = created_at - interval '1 day' where id in ('${o1}', '${o2}')`);   // a pair left on To review since yesterday
  const o3 = await web({ givenNames: "Oli", familyName: "Old", email: "oli@example.org" });
  await jobs.runDue();
  ok("FO-9b 2b fail (review m-r3): a new arrival merges itself only; an old pair a person left on To review stays (O1 and O2 both live)",
    sql(`select merged_into_id from fo_person where id = '${o3}'`) !== "" && live(o1, o2) === 2 && (await listedPair(db, A, pairOf(o1, o2))) === "OPEN", { o3: sql(`select coalesce(merged_into_id::text, '-') from fo_person where id = '${o3}'`), live: live(o1, o2), job: queued(o3)[0]?.status + (queued(o3)[0]?.error ?? "") });
  {
    const slow = { enqueue: () => new Promise<void>((r) => setTimeout(r, 3_000)) };
    const t0 = Date.now();
    const sp = (await db.$transaction((tx) => arrive(tx as never, { ...webIn(A), source: "Website", actor: "system:web-form", payloadHash: randomUUID(), person: person({ givenNames: "Sol", familyName: "Slow", email: "sol@example.org" }), }, { ...ports, autoMerge: slow }))).personId!;
    const took = Date.now() - t0;
    ok("FO-9b 2b pass (break m2): a queue that takes 3 s holds the arrival at most about 2 s, and the arrival commits", took < 2_800 && sql(`select count(*) from fo_person where id = '${sp}'`) === "1", took);
  }
  auto.onApplicationShutdown();
  const z1 = await web({ givenNames: "Zoe", familyName: "Closed", email: "zoe@example.org" });
  ok("FO-9b 2b fail (review m2): once the app's shutdown hook ran, arrive() queues nothing", queued(z1).length === 0);
  registerAutoMerge(auto);
  ok("FO-9b 2b fail (break m1): with no burst, the run stops at the person's own merge (one merge for the Ann pair)", sql(`select count(*) from fo_dup_merge where survivor_id = '${ann1}'`) === "1");

  // ------------------------------------------------------------------- part 2b follow-ups (round-3 Minors on #3527)
  {   // m-r3-3, R3-m1: an unchecked arrival never sets a name, not even an empty last name
    const c1 = await web({ givenNames: "Cher", familyName: null, email: "cher@example.org" });
    await jobs.runDue();
    const c2 = await web({ givenNames: "Mallory", familyName: "Attacker", email: "cher@example.org" });
    await jobs.runDue();
    const names = sql(`select given_names || '|' || coalesce(family_name, '') from fo_person where id = '${c1}'`);
    ok("FO-9b 2b follow-ups fail (review m-r3-3, break R3-m1): a stranger's arrival with her email merges, but her record keeps its own name: no last name \"Attacker\" is added",
      live(c1, c2) === 1 && names === "Cher|", { names, live: live(c1, c2) });
  }
  {   // m-r3-4, R3-m2: two phones that differ only in their typed digits (one or both unreadable) are a conflict
    const u1 = await web({ givenNames: "Una", familyName: "Phone", email: "una@example.org", phone: "555 0199 ext 4" });
    await jobs.runDue();
    const u2 = await web({ givenNames: "Una", familyName: "Phone", email: "una@example.org", phone: "0161 496 0000" });
    const v1 = await web({ givenNames: "Vic", familyName: "Phone", email: "vic@example.org", phone: "+1 416 555 0188" });
    await jobs.runDue();
    const v2 = await web({ givenNames: "Vic", familyName: "Phone", email: "vic@example.org", phone: "555 0199 ext 4" });
    const w1 = await web({ givenNames: "Wes", familyName: "Phone", email: "wes@example.org", phone: "555 0177 ext 9" });
    await jobs.runDue();
    const w2 = await web({ givenNames: "Wes", familyName: "Phone", email: "wes@example.org", phone: "555-0177 ext. 9" });
    await jobs.runDue();
    ok("FO-9b 2b follow-ups fail (review m-r3-4, break R3-m2): one email with two different unreadable phones, or a readable and a different unreadable one, is never merged by itself: both stay, the pair on To review",
      live(u1, u2) === 2 && (await listedPair(db, A, pairOf(u1, u2))) === "OPEN" && live(v1, v2) === 2 && (await listedPair(db, A, pairOf(v1, v2))) === "OPEN", { u: live(u1, u2), v: live(v1, v2) });
    ok("FO-9b 2b follow-ups pass: the same unreadable phone typed another way (the same digits) is no conflict: one record", live(w1, w2) === 1, live(w1, w2));
  }
  // m-r3-1, R3-m3: the burst window is measured from the job's own person, and ties go to the oldest partner first, so
  // the outcome is fixed: S (on file since yesterday), X (arrived, its job never ran), then L → L into S, then X into S.
  for (let t = 1; t <= 4; t++) {
    const mail = `tie${t}@example.org`;
    const s1 = await web({ givenNames: "Tia", familyName: "Tie", email: mail });
    await jobs.runDue();
    sql(`update fo_person set created_at = created_at - interval '1 day' where id = '${s1}'`);
    registerAutoMerge(null); const x1 = await web({ givenNames: "Tia", familyName: "Tie", email: mail }); registerAutoMerge(auto);
    const l1 = await web({ givenNames: "Tia", familyName: "Tie", email: mail });
    await jobs.runDue();
    ok(`FO-9b 2b follow-ups pass (review m-r3-1, break R3-m3), trial ${t} of 4: equal scores go to the oldest partner first: L merges into S (on file since yesterday), then X too: one record, S`,
      live(s1, x1, l1) === 1 && live(s1) === 1 && sql(`select merged_into_id from fo_person where id = '${l1}'`) === s1, { into: sql(`select string_agg(coalesce(merged_into_id::text, '-'), ',') from fo_person where id in ('${s1}', '${x1}', '${l1}')`), ids: [s1, x1, l1] });
  }
  {   // the window never slides along a chain: O1, O2, O3 arrived 27, 18 and 9 minutes ago (no jobs), then O4
    const ids: string[] = [];
    registerAutoMerge(null);
    for (const ago of [27, 18, 9]) { const o = await web({ givenNames: "Sly", familyName: "Slide", email: "sly@example.org" }); sql(`update fo_person set created_at = clock_timestamp() - interval '${ago} minutes' where id = '${o}'`); ids.push(o); }
    registerAutoMerge(auto);
    const o4 = await web({ givenNames: "Sly", familyName: "Slide", email: "sly@example.org" });
    await jobs.runDue();
    ok("FO-9b 2b follow-ups fail (break R3-m3, slides): the follow-up reaches only arrivals within 10 minutes of the job's person: O4 into O1, then O3 (9 min); O2 (18 min) stays, its pair with O1 on To review",
      live(...ids, o4) === 2 && live(ids[1]) === 1 && (await listedPair(db, A, pairOf(ids[0], ids[1]))) === "OPEN", { into: sql(`select string_agg(coalesce(merged_into_id::text, '-'), ',' order by created_at) from fo_person where id in ('${[...ids, o4].join("','")}')`) });
  }
  {   // m-r3-2: only pairs written before the run, by the database's clock: a pair stamped after the run's start is not followed
    const s1 = await web({ givenNames: "Rae", familyName: "Run", email: "rae@example.org" });
    await jobs.runDue();
    registerAutoMerge(null); const x1 = await web({ givenNames: "Rae", familyName: "Run", email: "rae@example.org" }); registerAutoMerge(auto);
    const l1 = await web({ givenNames: "Rae", familyName: "Run", email: "rae@example.org" });
    replica(`update fo_dup_review set first_seen_at = clock_timestamp() + interval '1 hour' where id = '${pairOf(s1, x1)}'`);
    await jobs.runDue();
    ok("FO-9b 2b follow-ups fail (review m-r3-2): a pair first seen after the run started (the database's clock) is never followed: L into S, X stays, its pair with S on To review",
      sql(`select merged_into_id from fo_person where id = '${l1}'`) === s1 && live(s1, x1) === 2 && (await listedPair(db, A, pairOf(s1, x1))) === "OPEN", { into: sql(`select string_agg(coalesce(merged_into_id::text, '-'), ',') from fo_person where id in ('${s1}', '${x1}', '${l1}')`) });
  }

  // ------------------------------------------------------------------- firms never meet; no queue, no merge
  const f1 = await web({ givenNames: "Fay", familyName: "Firm", email: "fay.firm@example.org" });
  const fB = await web({ givenNames: "Fay", familyName: "Firm", email: "fay.firm@example.org" }, B);
  await jobs.runDue();
  ok("FO-9b 2b fail: firm B's arrival with firm A's person's email makes no pair and no merge (both stay)", live(f1, fB) === 2 && !pairOf(f1, fB) && queued(fB)[0]?.firmId === B);
  registerAutoMerge(null);
  const q1 = await web({ givenNames: "Quin", familyName: "Off", email: "quin.off@example.org" }), q2 = await web({ givenNames: "Quin", familyName: "Off", email: "quin.off@example.org" });
  await jobs.runDue();
  ok("FO-9b 2b fail: with no queue registered (a suite or tool without the app's job), nothing is queued and both records stay, the pair To review",
    queued(q2).length === 0 && live(q1, q2) === 2 && sql(`select status from fo_dup_review where id = '${pairOf(q1, q2)}'`) === "OPEN");
} finally {
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\nFO-9b part 2b: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
