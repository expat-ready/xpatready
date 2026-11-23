// FO-9b part 2 (BACKLOG row FO-9b; Lead 6 on #3174, 23 Nov; design: product/screens/FO-9b-2/pair-model.md): seeded random
// sequences of the pair actions (arrival with and without "Add as new", Keep separate, guided merge, merge by itself,
// Undo) on 4 to 5 people per world, the invariants checked after every step:
//   I1  no Kept separate decision is ever joined: for every KEPT_SEPARATE pair the two people have different live roots;
//   I2  an Undo of the last change gives back exactly what the review list showed before it (every pair's tab, or not
//       listed) and every person's root;
//   I3  no deadlock (40P01) and no unexpected error when actions on pairs that share a person run at the same moment;
//   I4  the To review tab never lists two people a Kept separate decision keeps apart;
//   I5  every pair's tab in list() is the one listed() derives for that pair alone (review R7-1).
// Seeded (mulberry32), so a run repeats; SEEDS=1,2,3 picks seeds. Every value is Sample. US$0, no model call.
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
const SEEDS = (process.env.SEEDS ?? "1,2,3,4,5,6,7,8").split(",").map(Number);
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
const { mergeIfSafe, DuplicateReview, listedPair } = await import("../api/src/front-office/duplicates/merge/review.ts");
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
    const pairs = () => sql(`select id || ':' || low_id || ':' || high_id || ':' || status from fo_dup_review where firm_id = '${A}' and (low_id in (${ids()}) or high_id in (${ids()})) order by id`).split("\n").filter(Boolean).map((l) => { const [id, lo, hi, st] = l.split(":"); return { id, lo, hi, st }; });
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
            const after = await view(), diff = Object.keys({ ...top.before, ...after }).filter((k) => (top.before[k] ?? "-") !== (after[k] ?? "-")).map((k) => `${k.slice(0, 13)}: ${top.before[k] ?? "(no row)"} → ${after[k] ?? "(no row)"}`);
            if (diff.length) { ok(`FO-9b pairs I2 fail (seed ${seed}, step ${s}): Undo of the last change did not give back the list as it was`, false, { diff, log }); good = false; break; }
            stack.pop();
          } else stack.length = 0;   // an Undo of an earlier merge: the views between are not comparable
        } else stack.push({ merge: ref, before });
      }
      good = await check(`step ${s}`);
    }
    if (good) ok(`FO-9b pairs I1 I2 I4 pass (seed ${seed}): ${log.length} actions on ${people.length} people, every step checked`, true);

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
