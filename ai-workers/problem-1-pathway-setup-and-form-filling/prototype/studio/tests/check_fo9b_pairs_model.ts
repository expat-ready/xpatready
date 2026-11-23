// FO-9b part 2 (BACKLOG row FO-9b; Lead 6 on #3174, 23 Nov; design: product/screens/FO-9b-2/pair-model.md): seeded random
// sequences of the pair actions (arrival with and without "Add as new", Keep separate, guided merge, merge by itself,
// Undo) on 4 to 5 people per world, the invariants checked after every step:
//   I1  no Kept separate decision is ever joined: for every KEPT_SEPARATE pair the two people have different live roots;
//   I2  an Undo of the last change (nothing else changed on these records in between) gives back exactly what the
//       review list showed before it (every pair's tab, or not listed) and every person's root, except that a pair
//       which had no row before and whose two live people match after the Undo is To review (Lead 10 on #3174; the
//       match asked as I6 asks it); a pair that stops matching after other changes may stay listed (pair-model.md §1);
//   I3  no deadlock (40P01) and no unexpected error when actions on pairs that share a person run at the same moment;
//   I4  the To review tab never lists two people a Kept separate decision keeps apart;
//   I5  every pair's tab in list() is the one listed() derives for that pair alone (review R7-1);
//   I6  a pair is never hidden while its two people are live and still match: every OPEN pair whose two people match
//       (FO-9a's rule asked of that pair, no 10-match cap) is To review or Kept separate (Lead 8 on #3174, break B10-1).
// Seeded (mulberry32), so a run repeats; SEEDS=1,2,3 picks seeds (472 is in the default: round 12's I2 sequence). Every value is Sample. US$0, no model call.
//   tsx studio/tests/check_fo9b_pairs_model.ts
import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo9bpm_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const SEEDS = (process.env.SEEDS ?? "1,2,3,4,5,6,7,8,472").split(",").map(Number);
const STEPS = Number(process.env.STEPS ?? 30), BURSTS = Number(process.env.BURSTS ?? 12);

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 1500)}` : ""}`); };
const psql = (args: string[]) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string) => psql(["-Atc", q]);
const mulberry32 = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
process.env.DATABASE_URL = URL_;
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED"]) delete process.env[k];

const { Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { seedSampleFirmsFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { dutiesOf } = await import("../api/src/platform/identity/keys.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { ConsentStore } = await import("../api/src/platform/messages/consent/consent-store.ts");
const { Leads } = await import("../api/src/front-office/sales/leads.ts");
const { arrive } = await import("../api/src/front-office/sales/arrival.ts");
const { phone: salesPhone } = await import("../api/src/front-office/sales/common.ts");
const { NAME_THRESHOLD } = await import("../ports/matching.ts");
const { mergeIfSafe, DuplicateReview, listedPair } = await import("../api/src/front-office/duplicates/merge/review.ts");
const { wonDuplicates } = await import("../api/src/front-office/duplicates/service.ts");
type Ctx = import("../api/src/platform/identity/keys.ts").StaffContext;

try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) psql(["-f", join(MIG, d, "migration.sql")]);
  const db = new Db();
  await seedSampleFirms(db);
  await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`);
  const [rid] = sql(`select id from platform_staff where actor_id = 'user-R'`).split("|");
  const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${rid}'`).split(",");
  const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
  const R: Ctx = { staffId: rid, firmId: A, firmKey: "sample-firm", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  const consent = new ConsentStore(auditEvent);
  const ports = { audit: auditEvent, consent };
  const leads = new Leads(db, { audit: auditEvent, consent, publicOrigin: "http://localhost:4400" });
  const review = new DuplicateReview(db, ports);
  const deadlocks = () => Number(sql(`select pg_stat_clear_snapshot(); select deadlocks from pg_stat_database where datname = current_database()`).split("\n").pop());
  const deadlocksBefore = deadlocks();

  /** An action's outcome: done, refused (a 4xx or 503 answer, or the merge by itself declining), or an error. */
  type Out = { kind: "done"; value: unknown } | { kind: "refused"; status: number; code?: string } | { kind: "error"; message: string };
  const run = async (f: () => Promise<unknown>): Promise<Out> => {
    try {
      const v = await f();
      if (v && typeof v === "object" && "refused" in v) return { kind: "refused", status: 0, code: String((v as { refused: string[] }).refused) };
      return { kind: "done", value: v };
    } catch (e) {
      const st = (e as { status?: number }).status, msg = `${(e as Error)?.message ?? e} ${JSON.stringify((e as { response?: unknown }).response ?? "")}`;
      if (/40P01|deadlock/i.test(msg)) return { kind: "error", message: `deadlock: ${msg.slice(0, 300)}` };
      if (st && st >= 400 && st < 500) return { kind: "refused", status: st, code: (e as { response?: { code?: string } }).response?.code };
      if (st === 503 && (e as { response?: { code?: string } }).response?.code === "BUSY") return { kind: "refused", status: 503, code: "BUSY" };
      return { kind: "error", message: msg.slice(0, 400) };
    }
  };

  /** I6: the OPEN pairs between two live people who match (email, E.164 phone or similar name, FO-9a's rule, asked of the
   *  pair itself) that the list hides: on neither To review nor Kept separate. Firm-wide. */
  const matchingOpen = () => sql(`select r.id from fo_dup_review r join fo_person a on a.id = r.low_id join fo_person b on b.id = r.high_id
       where r.firm_id = '${A}' and r.status = 'OPEN' and a.merged_into_id is null and b.merged_into_id is null
         and ((a.email is not null and a.email = b.email) or (a.phone_e164 is not null and a.phone_e164 = b.phone_e164)
           or (coalesce(a.name_key, '') <> '' and coalesce(b.name_key, '') <> '' and (
                ((a.name_key ~ '[0-9]' or b.name_key ~ '[0-9]') and lower(a.name_key) = lower(b.name_key))
             or (a.name_key !~ '[0-9]' and b.name_key !~ '[0-9]' and extensions.similarity(lower(a.name_key), lower(b.name_key)) >= ${NAME_THRESHOLD}::float8))))`).split("\n").filter(Boolean);
  /** I2's one exception (Lead 10 on #3174): the pairs `before` had no row for that are To review now and whose two live
   *  people match (asked as I6 asks it). Any other difference between the two views is an I2 failure. */
  const i2diff = (before: Record<string, string>, after: Record<string, string>) => {
    const fresh = new Set(matchingOpen());
    return Object.keys({ ...before, ...after }).filter((k) => (before[k] ?? "-") !== (after[k] ?? "-") && !(!(k in before) && after[k] === "OPEN" && fresh.has(k)))
      .map((k) => `${k.slice(0, 13)}: ${before[k] ?? "(no row)"} → ${after[k] ?? "(no row)"}`);
  };
  const hiddenValid = async (): Promise<string[]> => {
    const cand = matchingOpen();
    if (!cand.length) return [];
    const shown = new Set([...(await review.list(R, "OPEN")).items, ...(await review.list(R, "KEPT_SEPARATE")).items].map((i) => i.id));
    return cand.filter((id) => !shown.has(id));
  };
  const arriveP = async (givenNames: string, familyName: string, email: string | null, phone: string | null) =>
    (await db.$transaction((tx) => arrive(tx as never, { firmId: A, door: "MANUAL", intakeKey: `manual:${randomUUID()}`, source: "Phone call", actor: `staff:${R.staffId}`, payloadHash: randomUUID(), ownerStaffId: R.staffId,
      person: { givenNames, familyName, email, phone: phone ? salesPhone(phone) : null } }, ports))).personId!;
  const pairId = (a: string, b: string) => sql(`select id from fo_dup_review where firm_id = '${A}' and low_id = least('${a}'::uuid, '${b}'::uuid) and high_id = greatest('${a}'::uuid, '${b}'::uuid)`);
  {
    // I6, seeded with break B10-1: a pair Ma noted, whose row Mb meets and leaves, stays listed after Undo Ma while S and X still match
    const s0 = await arriveP("Sora", "Quill", null, "+1 416 555 0901"), l0 = await arriveP("Lumi", "Vexa", "b10.e@example.org", "+1 416 555 0901");
    const x0 = await arriveP("Xeno", "Drap", "b10.e@example.org", "+1 416 555 0902");
    const ma = await review.merge(R, pairId(s0, l0), { survivorId: s0, choices: { email: "LOSER" } }) as { mergeRef: string };
    const v0 = await arriveP("Vito", "Hask", "b10.e@example.org", "+1 416 555 0901");
    await review.merge(R, pairId(x0, v0), { survivorId: x0, choices: { phone: "LOSER" } });
    await review.undo(R, ma.mergeRef);
    const sx = pairId(s0, x0), hid = await hiddenValid();
    ok("FO-9b pairs I6 fail (break B10-1 seeded): after Ma (S takes e, notes S-X), Mb (X takes S's phone, meets S-X's row) and Undo Ma, S-X still matches and is listed", !!sx && !hid.includes(sx) && hid.length === 0, { sx, hid });
  }
  {
    // I6, the sequence the round-11 sweep captured (seed 353): the other side of a pair changes while one is merged away
    const p0 = await arriveP("Oberon", "Fitch", "r12.e0@example.org", null), p1 = await arriveP("Quenby", "Arlow", "r12.e0@example.org", "+1 416 555 0911");
    const p2 = await arriveP("Tamsin", "Brook", null, "+1 416 555 0910"), p3 = await arriveP("Wystan", "Cole", "r12.e0@example.org", "+1 416 555 0910");
    const m1 = await review.merge(R, pairId(p2, p3), { survivorId: p2 }) as { mergeRef: string };   // P2 takes e0, notes P2-P0 and P2-P1
    await review.undo(R, m1.mergeRef);                                                                // both withdrawn: P2 has no email again
    const m2 = await db.$transaction((tx) => mergeIfSafe(tx as never, A, pairId(p0, p1), ports)) as { mergeRef: string };   // P1 into P0
    await db.$transaction((tx) => mergeIfSafe(tx as never, A, pairId(p2, p3), ports));               // P3 into P2 again: P2 has e0 again
    await review.undo(R, m2.mergeRef);                                                                // P1 is back and matches P2 by e0
    const p21 = pairId(p1, p2), hid = await hiddenValid();
    ok("FO-9b pairs I6 fail (round-11 sweep, seed 353 captured): after M1 P3→P2 and its Undo, auto P1→P0, auto P3→P2, Undo P1→P0, P2-P1 still matches and is listed", !!p21 && !hid.includes(p21) && hid.length === 0, { p21, hid });
  }
  /** Every pair row touching `who`: its tab on the list, or "-" (not listed); the fixed I2 scenarios compare two of these. */
  const tabsOf = async (who: string[]) => {
    const tabs: Record<string, string> = {};
    for (const st of ["OPEN", "KEPT_SEPARATE", "MERGED"] as const) for (const it of (await review.list(R, st)).items) tabs[it.id] = st;
    const inList = who.map((x) => `'${x}'`).join(",");
    return Object.fromEntries(sql(`select id from fo_dup_review where firm_id = '${A}' and (low_id in (${inList}) or high_id in (${inList}))`).split("\n").filter(Boolean).map((id) => [id, tabs[id] ?? "-"]));
  };
  {
    // I2's exception, the reviewer's sequence (round 12, Major 1): the survivor meets a match it made while it was split
    const s = await arriveP("Hollis", "Marchetti", "r13.e1@example.org", "+1 416 555 0921"), l3 = await arriveP("Ignatia", "Roweby", "r13.e2@example.org", "+1 416 555 0921");
    const l4 = await arriveP("Jasper", "Kintyre", "r13.e1@example.org", "+1 416 555 0922"), y = await arriveP("Kerensa", "Dumont", null, "+1 416 555 0922");
    const m3 = await review.merge(R, pairId(s, l3), { survivorId: s, choices: { email: "LOSER" } }) as { mergeRef: string };   // S has e2
    await review.merge(R, pairId(l4, y), { survivorId: y, choices: { email: "LOSER" } });                                   // Y has e1
    await review.undo(R, m3.mergeRef);                                                                                       // S has e1 again: S and Y match, no row
    const before = await tabsOf([s, l3, l4, y]), noRow = !pairId(s, y);
    const m = await review.merge(R, pairId(s, l3), { survivorId: s, choices: { email: "SURVIVOR" } }) as { mergeRef: string };   // notePairs(S) writes S-Y
    await review.undo(R, m.mergeRef);                                                                                        // the last change
    const sy = pairId(s, y), diff = i2diff(before, await tabsOf([s, l3, l4, y])), strict = Object.keys(await tabsOf([s, l3, l4, y])).filter((k) => !(k in before));
    ok("FO-9b pairs I2 exception (round 12 reviewer's sequence): after Undo of the last merge, S-Y (no row before, S and Y match) is To review and nothing else differs",
      noRow && !!sy && strict.length === 1 && strict[0] === sy && (await listedPair(db, A, sy)) === "OPEN" && diff.length === 0, { noRow, sy, strict, diff });
  }
  {
    // I2's exception, seed 472's shape (round 12 sweep): an Undo gives P2 back a phone P4 arrived with meanwhile
    const p0 = await arriveP("Leontyne", "Abara", null, "+1 416 555 0930"), p2 = await arriveP("Mordecai", "Feeny", "r13.p2@example.org", "+1 416 555 0930");
    const x = await arriveP("Nerissa", "Galloway", "r13.p2@example.org", "+1 416 555 0931");
    const ax = await db.$transaction((tx) => mergeIfSafe(tx as never, A, pairId(p2, x), ports)) as { mergeRef: string };   // X into P2: P2 takes X's phone (newer)
    const p4 = await arriveP("Octavia", "Haldane", "r13.p4@example.org", "+1 416 555 0930");                                 // matches P0, not P2
    await review.undo(R, ax.mergeRef);                                                                                       // P2 has phone 0930 again: P2 and P4 match, no row
    const before = await tabsOf([p0, p2, x, p4]), noRow = !pairId(p2, p4);
    const m = await review.merge(R, pairId(p0, p4), { survivorId: p4 }) as { mergeRef: string };                            // notePairs(P4) writes P4-P2
    await review.undo(R, m.mergeRef);
    const pp = pairId(p2, p4), after = await tabsOf([p0, p2, x, p4]), strict = Object.keys(after).filter((k) => !(k in before));
    ok("FO-9b pairs I2 exception (seed 472's shape): after Undo of the last merge, P2-P4 (no row before, they match) is To review and nothing else differs",
      !!ax.mergeRef && noRow && !!pp && strict.length === 1 && strict[0] === pp && after[pp] === "OPEN" && i2diff(before, after).length === 0, { ax, noRow, pp, strict, diff: i2diff(before, after) });
  }
  {
    // WITHDRAWN's name branch (round 12 reviewer, Major 2), asked against FO-9a's own wonDuplicates for the pair
    const fo9a = async (a: string, b: string) => (await db.$transaction((tx) => wonDuplicates(tx as never, A, { subject: "PERSON", personId: a }))).matches.some((m: { id: string }) => m.id === b);
    const withdrawnPair = async (n: string) => {   // P-Z noted by a merge, the merge undone, P and Z not matching
      const pp = await arriveP("Corwin", "Ashby", `r13.${n}@example.org`, null), q = await arriveP("Quillon", "Teague", `r13.${n}@example.org`, `+1 416 555 09${n}`);
      const z = await arriveP("Zebulon", "Pratt", null, `+1 416 555 09${n}`);
      const mq = await review.merge(R, pairId(pp, q), { survivorId: pp, choices: { phone: "LOSER" } }) as { mergeRef: string };
      await review.undo(R, mq.mergeRef);
      return { pp, z, id: pairId(pp, z) };
    };
    const w1 = await withdrawnPair("41"), was1 = await listedPair(db, A, w1.id);
    sql(`update fo_person set given_names = 'Corwin', family_name = 'Ashbey' where id = '${w1.z}'`);   // a similar name, no digit
    const now1 = await listedPair(db, A, w1.id), f1 = await fo9a(w1.pp, w1.z);
    const w2 = await withdrawnPair("42"), was2 = await listedPair(db, A, w2.id);
    sql(`update fo_person set given_names = 'Corwin', family_name = 'Ashby2' where id = '${w2.z}'`);   // near, but a key with a digit matches only exactly
    const now2 = await listedPair(db, A, w2.id), f2 = await fo9a(w2.pp, w2.z);
    sql(`update fo_person set given_names = 'Corwin', family_name = 'Ashby' where id = '${w2.z}'`);    // the exact key
    const now3 = await listedPair(db, A, w2.id), f3 = await fo9a(w2.pp, w2.z);
    ok("FO-9b pairs WITHDRAWN name branch: a withdrawn pair is To review once the two match only by a similar name, stays withdrawn for a near name with a digit, and is To review for the exact name — each as FO-9a's wonDuplicates matches it",
      was1 === "HIDDEN" && now1 === "OPEN" && f1 && was2 === "HIDDEN" && now2 === "HIDDEN" && !f2 && now3 === "OPEN" && f3, { was1, now1, f1, was2, now2, f2, now3, f3 });
  }

  for (const seed of SEEDS) {
    const rnd = mulberry32(seed), pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
    const tag = `s${seed}`, people: string[] = [], log: string[] = [];
    const email = (k: number) => `pm.${tag}.${k}@example.org`, phone = (k: number) => `+1 416 555 ${String(seed * 10 + k).padStart(4, "0")}`;
    const arriveOne = async (asNew: boolean) => {
      const i = people.length, e = rnd() < 0.7 ? email(Math.floor(rnd() * 2)) : null, p = rnd() < 0.7 || !e ? phone(Math.floor(rnd() * 2)) : null;
      const who = { givenNames: `Pm${i}`, familyName: `${tag}x${i}${"abcdefgh"[Math.floor(rnd() * 8)]}`, email: e, phone: p };
      const out = await run(async () => {
        if (asNew) return (await leads.add(R, { requestId: randomUUID(), source: "Phone call", confirmedNew: true, givenNames: who.givenNames, familyName: who.familyName, ...(e ? { email: e } : {}), ...(p ? { phone: p } : {}) }) as { person: { id: string } }).person.id;
        return (await db.$transaction((tx) => arrive(tx as never, { firmId: A, door: "MANUAL", intakeKey: `manual:${randomUUID()}`, source: "Phone call", actor: `staff:${R.staffId}`, payloadHash: randomUUID(), ownerStaffId: R.staffId,
          person: { givenNames: who.givenNames, familyName: who.familyName, email: e, phone: p ? salesPhone(p) : null } }, ports))).personId!;
      });
      if (out.kind === "done") people.push(out.value as string);
      return { out, what: `arrive${asNew ? " as new" : ""} ${who.givenNames} ${e ?? "-"} ${p ?? "-"}` };
    };
    const ids = () => people.map((p) => `'${p}'`).join(",") || "null";
    const pairs = () => sql(`select id || ':' || low_id || ':' || high_id || ':' || status from fo_dup_review where firm_id = '${A}' and (low_id in (${ids()}) or high_id in (${ids()})) order by id`).split("\n").filter(Boolean).map((l) => { const [id, lo, hi, st] = l.split(":"); return { id, lo, hi, st }; })
      // by the people's arrival order, never by random ids, so a seed picks the same pairs on every run
      .sort((x, y) => (people.indexOf(x.lo) - people.indexOf(y.lo)) || (people.indexOf(x.hi) - people.indexOf(y.hi)));
    const root = (id: string) => sql(`with recursive up(id, nxt, d) as (select id, merged_into_id, 0 from fo_person where id = '${id}' union all select p.id, p.merged_into_id, up.d + 1 from fo_person p join up on p.id = up.nxt where up.d < 20) select id from up where nxt is null limit 1`);
    /** What the review list shows for this world's pairs (each pair's tab, else "-") and every person's root. */
    const view = async () => {
      const tabs: Record<string, string> = {};
      for (const st of ["OPEN", "KEPT_SEPARATE", "MERGED"] as const) for (const it of (await review.list(R, st)).items) tabs[it.id] = tabs[it.id] ? `${tabs[it.id]}+${st}` : st;
      const out: Record<string, string> = {};
      for (const p of pairs()) out[p.id] = tabs[p.id] ?? "-";
      for (const p of people) out[`root:${p}`] = root(p);
      return out;
    };
    const check = async (step: string) => {
      const ps = pairs(), roots = new Map(people.map((p) => [p, root(p)]));
      const joined = ps.filter((p) => p.st === "KEPT_SEPARATE" && roots.get(p.lo) && roots.get(p.lo) === roots.get(p.hi));
      if (joined.length) { ok(`FO-9b pairs I1 fail (seed ${seed}, ${step}): a Kept separate pair was joined`, false, { joined, log }); return false; }
      const kept = ps.filter((p) => p.st === "KEPT_SEPARATE").map((p) => [roots.get(p.lo), roots.get(p.hi)].sort().join("|"));
      const listed = (await review.list(R, "OPEN")).items.filter((it) => ps.some((p) => p.id === it.id));
      const bad = listed.filter((it) => { const p = ps.find((x) => x.id === it.id)!; return kept.includes([roots.get(p.lo), roots.get(p.hi)].sort().join("|")); });
      if (bad.length) { ok(`FO-9b pairs I4 fail (seed ${seed}, ${step}): To review lists people a Kept separate decision keeps apart`, false, { bad: bad.map((b) => b.id), log }); return false; }
      const v = await view(), apart: string[] = [];
      for (const p of ps) { const one = await listedPair(db, A, p.id); if ((one === "HIDDEN" ? "-" : one) !== v[p.id]) apart.push(`${p.id.slice(0, 8)}: list ${v[p.id]}, listed ${one}`); }
      if (apart.length) { ok(`FO-9b pairs I5 fail (seed ${seed}, ${step}): list() and listed() disagree`, false, { apart, log }); return false; }
      const hid = await hiddenValid();
      if (hid.length) { ok(`FO-9b pairs I6 fail (seed ${seed}, ${step}): a pair whose two live people still match is hidden`, false, { hid, log }); return false; }
      return true;
    };

    for (let i = 0; i < 4; i++) { const a = await arriveOne(false); log.push(`${a.what} → ${a.out.kind}`); }
    // stack of [what, view before] for every change; an Undo of the top one must give back that view exactly (I2)
    const stack: { merge?: string; before: Record<string, string> }[] = [];
    let good = await check("start");
    for (let s = 0; s < STEPS && good; s++) {
      const ps = pairs(), r = rnd(), before = await view();
      const merges = sql(`select id from fo_dup_merge where firm_id = '${A}' and undone_at is null and survivor_id in (${ids()}) order by at desc`).split("\n").filter(Boolean);
      let what = "", out: Out;
      if (r < 0.1 && people.length < 5) { const a = await arriveOne(rnd() < 0.4); what = a.what; out = a.out; }
      else if (r < 0.3 && ps.length) { const p = pick(ps); what = `keep ${p.id.slice(0, 8)}`; out = await run(() => review.keepSeparate(R, p.id)); }
      else if (r < 0.5 && ps.length) { const p = pick(ps); const sv = rnd() < 0.5 ? p.lo : p.hi; what = `merge ${p.id.slice(0, 8)} into ${sv.slice(0, 8)}`; out = await run(() => review.merge(R, p.id, { survivorId: sv })); }
      else if (r < 0.7 && ps.length) { const p = pick(ps); what = `auto ${p.id.slice(0, 8)}`; out = await run(() => db.$transaction((tx) => mergeIfSafe(tx as never, A, p.id, ports))); }
      else if (merges.length) { const m = rnd() < 0.7 ? merges[0] : pick(merges); what = `undo ${m.slice(0, 8)}`; out = await run(() => review.undo(R, m)); }
      else continue;
      log.push(`${what} → ${out.kind}${out.kind === "refused" ? ` ${out.status} ${out.code ?? ""}` : ""}`);
      if (out.kind === "error") { ok(`FO-9b pairs I3 fail (seed ${seed}, step ${s}): an action ended in an error`, false, { what, out, log }); good = false; break; }
      if (out.kind === "done") {
        const ref = (out.value as { mergeRef?: string } | undefined)?.mergeRef;
        if (what.startsWith("undo")) {
          const top = stack[stack.length - 1], m = what.split(" ")[1];
          if (top?.merge?.startsWith(m)) {
            const after = await view(), diff = i2diff(top.before, after);
            if (diff.length) {
              const keys = Object.keys({ ...top.before, ...after }).filter((k) => !k.startsWith("root:") && (top.before[k] ?? "-") !== (after[k] ?? "-"));
              const rows = keys.length ? sql(`select r.id || ' noted=' || coalesce(r.noted_by_merge_id::text, '-') || ' seen=' || r.first_seen_at from fo_dup_review r where r.id = any(array[${keys.map((k) => `'${k}'`).join(",")}]::uuid[])`) : "";
              const recent = sql(`select id || ' s=' || survivor_id || ' l=' || loser_id || ' undone=' || coalesce(undone_at::text, '-') from fo_dup_merge where firm_id = '${A}' order by at desc limit 4`);
              ok(`FO-9b pairs I2 fail (seed ${seed}, step ${s}): Undo of the last change did not give back the list as it was`, false, { diff, rows, recent, log }); good = false; break;
            }
            stack.pop();
          } else stack.length = 0;   // an Undo of an earlier merge: the views between are not comparable
        } else stack.push({ merge: ref, before });
      }
      good = await check(`step ${s}`);
    }
    if (good) ok(`FO-9b pairs I1 I2 I4 I5 I6 pass (seed ${seed}): ${log.length} actions on ${people.length} people, every step checked`, true);

    // I3: actions on pairs that share a person, at the same moment. Each burst gets a fresh trio X, Y, Z who all match
    // (one phone), so every pair is listed and every action can go ahead; two or three actions start together.
    let burstErr: unknown = null;
    for (let b = 0; b < BURSTS && good && !burstErr; b++) {
      const trio: string[] = [], ph = `+1 416 555 ${String(5000 + seed * 100 + b).padStart(4, "0")}`;
      for (let k = 0; k < 3; k++) trio.push((await db.$transaction((tx) => arrive(tx as never, { firmId: A, door: "MANUAL", intakeKey: `manual:${randomUUID()}`, source: "Phone call", actor: `staff:${R.staffId}`, payloadHash: randomUUID(), ownerStaffId: R.staffId,
        person: { givenNames: `Bu${k}`, familyName: `${tag}b${b}x${k}`, email: null, phone: salesPhone(ph) } }, ports))).personId!);
      const tp = sql(`select id || ':' || low_id || ':' || high_id from fo_dup_review where firm_id = '${A}' and low_id in (${trio.map((x) => `'${x}'`).join(",")}) and high_id in (${trio.map((x) => `'${x}'`).join(",")}) order by id`).split("\n").filter(Boolean).map((l) => { const [id, lo, hi] = l.split(":"); return { id, lo, hi }; });
      if (tp.length < 3) continue;
      // Half the trios start with one merge already made, so the burst can race its Undo (break R7-3).
      let made: string | null = null;
      if (rnd() < 0.5) { const m0 = await run(() => review.merge(R, tp[2].id, { survivorId: tp[2].lo })); made = m0.kind === "done" ? ((m0.value as { mergeRef?: string }).mergeRef ?? null) : null; }
      const act = (p: { id: string; lo: string; hi: string }) => { const r = rnd();
        if (made && r < 0.25) return { what: `undo ${made.slice(0, 8)}`, f: () => review.undo(R, made!) };
        if (r < 0.35) return { what: "arrive", f: () => db.$transaction((tx) => arrive(tx as never, { firmId: A, door: "MANUAL", intakeKey: `manual:${randomUUID()}`, source: "Phone call", actor: `staff:${R.staffId}`, payloadHash: randomUUID(), ownerStaffId: R.staffId,
          person: { givenNames: "Bn", familyName: `${tag}b${b}n${Math.floor(rnd() * 1e6)}`, email: null, phone: salesPhone(ph) } }, ports)) };
        return r < 0.55 ? { what: `keep ${p.id.slice(0, 8)}`, f: () => review.keepSeparate(R, p.id) } : r < 0.85 ? { what: `merge ${p.id.slice(0, 8)}`, f: () => review.merge(R, p.id, { survivorId: rnd() < 0.5 ? p.lo : p.hi }) } : { what: `auto ${p.id.slice(0, 8)}`, f: () => db.$transaction((tx) => mergeIfSafe(tx as never, A, p.id, ports)) }; };
      const chosen = rnd() < 0.5 ? tp : [tp[0], tp[1]], acts = chosen.map(act);
      const outs = await Promise.all(acts.map((a) => run(a.f)));
      log.push(`burst ${acts.map((a) => a.what).join(" + ")} → ${outs.map((o) => o.kind + (o.kind === "refused" ? ` ${o.status} ${o.code ?? ""}` : "")).join(", ")}`);
      const err = outs.find((o) => o.kind === "error");
      if (err) burstErr = { err, log: log.slice(-6) };
      else {
        const kept = tp.filter((p) => sql(`select status from fo_dup_review where id = '${p.id}'`) === "KEPT_SEPARATE");
        const joined = kept.filter((p) => root(p.lo) === root(p.hi));
        if (joined.length) burstErr = { I1: "a Kept separate pair was joined by actions at the same moment", joined, log: log.slice(-6) };
        else { const hid = await hiddenValid(); if (hid.length) burstErr = { I6: "a pair whose two live people still match is hidden after actions at the same moment", hid, log: log.slice(-6) }; }
      }
    }
    ok(`FO-9b pairs I3 (seed ${seed}): actions on pairs that share a person at the same moment end done or refused, never in an error or a deadlock`, !burstErr, burstErr);
  }
  await new Promise((r) => setTimeout(r, 1200));   // the server's statistics are written at most every second
  const dl = deadlocks() - deadlocksBefore;
  ok("FO-9b pairs I3: the database counted no deadlock (40P01) in the whole run", dl === 0, { deadlocks: dl });
  await db.$disconnect();
} finally {
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\nFO-9b pairs model: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
