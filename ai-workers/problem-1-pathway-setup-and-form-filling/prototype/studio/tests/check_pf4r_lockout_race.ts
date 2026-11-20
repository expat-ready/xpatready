// R1.5 (J-5 part 1, break-report B1 and B2): lock-out on leaving holds while the person is signing in. On a running copy
// (the real main.ts, the local stand-in), parallel sign-ins of one Case Officer race the Owner's Deactivate, and then
// the Owner's Sign out everywhere:
//   B1: every Deactivate and Sign out everywhere answers 200 and no sign-in answers 500 (before the fix: the sign-in took
//       the person's row, then the firm's; staff changes take the firm's, then the person's; Postgres deadlocked and 7 of
//       10 deactivations answered 500);
//   B2: after the person is reactivated, no token from the burst works (before the fix: a sign-in checked "active" before
//       its lock and was dated after the deactivation, so reactivation brought its token back).
// The race is real (parallel requests, no test hook), so each round is a chance, not a certainty; ROUNDS rounds make a
// miss of the old fault rare (it failed 7 of 10 and 2 of 3 rounds). Sample rows only; US$0, no model call.
//   zsh studio/tools/isolated.sh pf4r 4421 start --ttl 20 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh pf4r 4421 stop' EXIT && tsx studio/tests/check_pf4r_lockout_race.ts pf4r 4421
import { client, recorder } from "./runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "pf4r", Number(process.argv[3] ?? 4421)];
const BASE = `http://localhost:${PORT}`, ROUNDS = 6, LOOPS = 3, PER_LOOP = 6;
const { ok, summary } = recorder();
const { sql } = client(PORT, `xr_studio_${NAME}`);
const run = Date.now().toString(36);
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks

const signIn = async (email: string): Promise<Ans> => {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const api = async (t: string, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${t}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
const ownerEmail = sql(`select email from platform_staff where actor_id = 'user-R'`);
const first = await signIn(ownerEmail);
if (!first.body?.token) { console.error(`STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local): ${first.body?.detail}`); process.exit(2); }
const owner = first.body.token as string;
const plan = sql(`select p.id || '|' || p.seats_limit from platform_subscription s join platform_plan p on p.id = s.plan_id where s.firm_id = '${A}' and s.status <> 'ENDED' limit 1`).split("|");
sql(`update platform_plan set seats_limit = ${Number(plan[1]) + ROUNDS + 2} where id = '${plan[0]}'`);   // lent; given back below

/** One Sample Case Officer per round (made by SQL, as PF-4's check does). */
function person(tag: string) {
  const email = `pf4r-${tag}-${run}@sample-firm.example.com`;
  const id = sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', '${email}', 'Race person (Sample)', 'pf4r-${tag}-${run}', now()) returning id`).split("\n")[0];
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${id}', 'CASE_OFFICER', 'seed:pf4r-check')`);
  return { id, email };
}
/** LOOPS loops of PER_LOOP sign-ins, and `change` sent once the burst has started. */
async function race(email: string, change: () => Promise<Ans>) {
  const signIns: Ans[] = [];
  const loop = async () => { for (let i = 0; i < PER_LOOP; i++) signIns.push(await signIn(email)); };
  const loops = Array.from({ length: LOOPS }, loop);
  await new Promise((r) => setTimeout(r, 5));
  const changed = await change();
  await Promise.all(loops);
  return { changed, signIns };
}

const people: string[] = [];
try {
  const deact: number[] = [], out: number[] = [], fives: number[] = [], alive: string[] = [], tokens: number[] = [];
  for (let n = 0; n < ROUNDS; n++) {
    const p = person(`d${n}`); people.push(p.id);
    await signIn(p.email);   // they have a session already
    const { changed, signIns } = await race(p.email, () => api(owner, "POST", `/platform/staff/${p.id}/deactivate`, { reason: "pf4r race (Sample)" }));
    deact.push(changed.status); fives.push(signIns.filter((s) => s.status >= 500).length);
    const issued = signIns.map((s) => s.body?.token).filter((t): t is string => typeof t === "string"); tokens.push(issued.length);
    const back = await api(owner, "POST", `/platform/staff/${p.id}/reactivate`, { reason: "pf4r back (Sample)" });
    for (const t of issued) { const me = await api(t, "GET", "/platform/me"); if (me.status !== 401) alive.push(`round ${n}: ${me.status} (reactivate ${back.status})`); }
    // Sign out everywhere, raced the same way, on the reactivated person.
    const so = await race(p.email, () => api(owner, "POST", `/platform/staff/${p.id}/sign-out-everywhere`, {}));
    out.push(so.changed.status); fives.push(so.signIns.filter((s) => s.status >= 500).length);
  }
  ok(`R1.5 B1: Deactivate raced by ${LOOPS}x${PER_LOOP} parallel sign-ins answers 200 every round (${ROUNDS} rounds)`, deact.every((s) => s === 200), deact);
  ok(`R1.5 B1: Sign out everywhere raced the same way answers 200 every round`, out.every((s) => s === 200), out);
  ok("R1.5 B1: no sign-in in any burst answers 500 (each answers 200, or 401 in words once deactivated)", fives.every((f) => f === 0), fives);
  ok("R1.5 B2: after reactivation, no token issued during a burst that raced the deactivation works (each gets 401)", alive.length === 0, { alive, tokensPerRound: tokens });
  // The pass half: a calm sign-in after reactivation works, so the refusals above are the race rules and nothing else.
  const calm = await signIn(sql(`select email from platform_staff where id = '${people[0]}'`));
  ok("R1.5 B2 pass: a calm sign-in after reactivation gives a working token", calm.status === 200 && (await api(calm.body.token, "GET", "/platform/me")).status === 200, calm.status);
} finally {
  for (const id of people) if (sql(`select status from platform_staff where id = '${id}'`) === "ACTIVE") await api(owner, "POST", `/platform/staff/${id}/deactivate`, { reason: "pf4r done (Sample)" });
  sql(`update platform_plan set seats_limit = ${Number(plan[1])} where id = '${plan[0]}'`);
}
process.exit(summary() ? 1 : 0);
