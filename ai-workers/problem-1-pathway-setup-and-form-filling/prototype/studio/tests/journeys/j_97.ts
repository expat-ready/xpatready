// J-97 (map row 97, R1.97: tamper-evident audit chain; "each line holds the hash of the one before; a changed or removed
// line is detected by the check; the daily export lands in S3 Object Lock in ca-central-1"): the walk over AUD-1c parts 1
// and 2 and AUD-2 part 2, on an isolated copy of the running app (its own database and port; never :4400). R1.97 has no
// screen of its own (the Activity log's integrity pill is row AUD-4s-i), so the walk is a person's actions through the
// API and what an owner of the database could do underneath. The checker's and the export's jobs run on their schedules;
// here the demo-only routes run one pass now. The archive on a copy is the fake (Sample; it keeps every rule of the
// port); the S3 adapter's own test runs on a recorded bucket. Owed (P-821): the live bucket in ca-central-1.
//   W1: firm A's Owner saves the firm's tagline three times (real lines on firm A's chain); a check finds no break and
//       the Owner's integrity read is INTACT up to the chain's head;
//   W5: the daily export writes firm A's lines and an anchor to the write-once archive, kept 7 years; replacing a file
//       is refused (409) and deleting one is refused (423);
//   W6: the database's owner rewrites firm A's exported newest line, recomputes its hash and moves the checker's own
//       record to match (the chain alone verifies):
//       the check names firm A at that seq as an anchor mismatch, and the Owner's read is BROKEN;
//   W4: firm B's Owner reads firm B's chain: INTACT, untouched by firm A's break;
//   W2: the owner changes one old line of firm B (no recomputation): the check names firm B from that seq (hash);
//   W3: the owner deletes an earlier line of firm B: the check now reports a gap from that seq.
// Fails on the fake (P-606): every judge is also run before the step that makes it true (W1's INTACT before W6, W4's
// INTACT before W2, W3's gap before the delete). US$0, no model call. Run from prototype/:
//   zsh studio/tools/isolated.sh j97 4497 start --ttl 30 PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on && trap 'zsh studio/tools/isolated.sh j97 4497 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_97.ts j97 4497
import pg from "pg";
import { request } from "node:http";
import { entryHash } from "../../api/src/platform/audit/canonical.ts";
import { recorder } from "../runtime/api.ts";

const NAME = process.argv[2] ?? "j97", PORT = Number(process.argv[3] ?? 4497);
const { ok, summary } = recorder();
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other journeys
/** node:http without keep-alive (tests/runtime/api.ts's reason). */
const api = (method: string, path: string, o: { token?: string; actor?: string; body?: unknown } = {}): Promise<Res> => new Promise((resolve, reject) => {
  const data = o.body === undefined ? undefined : Buffer.from(JSON.stringify(o.body));
  const headers: Record<string, string | number> = { "content-type": "application/json", ...(data ? { "content-length": data.length } : {}), ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...(o.actor ? { "x-actor": o.actor } : {}) };
  const req = request({ host: "127.0.0.1", port: PORT, path: `/api${path}`, method, headers, agent: false }, (res) => {
    let t = ""; res.on("data", (c) => (t += c)); res.on("end", () => { let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } resolve({ status: res.statusCode ?? 0, body: b }); });
  });
  req.on("error", reject); if (data) req.write(data); req.end();
});
const db = new pg.Client({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/xr_studio_${NAME}` });
await db.connect();
const one = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows[0];
const asOwner = async (q: string, v: unknown[] = []) => { await db.query("begin"); await db.query("alter table audit_event disable trigger aud_event_no_change"); await db.query(q, v); await db.query("alter table audit_event enable trigger aud_event_no_change"); await db.query("commit"); };
const check = (mode: "incremental" | "full" = "full") => api("POST", "/demo/audit-chain/check", { actor: "user-A", body: { mode } });
const breakOf = (r: Res, k: string) => (r.body?.breaks as { chainKey: string; fromSeq: string; toSeq: string; why: string }[] | undefined)?.find((b) => b.chainKey === k);
const signIn = async (actorId: string, firmKey: string) => (await api("POST", "/platform/session/local", { body: { firmKey, actorId, secondStep: true } })).body?.token as string;

try {
  const A = (await one(`select f.id::text id from platform_firm f where f.key = 'sample-firm'`)).id as string, B = (await one(`select f.id::text id from platform_firm f where f.key = 'sample-solo'`)).id as string;
  const tA = await signIn("user-R", "sample-firm"), tB = await signIn("user-S", "sample-solo");
  ok("J-97 setup: firm A's and firm B's Owners are signed in on the copy", !!tA && !!tB && A !== B, { A, B });

  // ------------------------------------------------------------------------------- W1: real lines, a clean check
  const saves = [];
  for (const n of [1, 2, 3]) saves.push((await api("PUT", "/platform/branding", { token: tA, body: { tagline: `Sample tagline ${n} (J-97)` } })).status);
  const headA = Number((await one(`select max(seq)::text h from audit_event where chain_key = $1`, [A])).h);
  const lines = await db.query(`select seq, encode(prev_hash, 'hex') p, encode(entry_hash, 'hex') e from audit_event where chain_key = $1 order by seq`, [A]);
  ok("J-97 W1: firm A's three saves are lines on firm A's chain, each holding the hash of the one before (seq 1..head, no gap)",
    saves.every((s) => s === 200) && headA >= 3 && lines.rows.every((r, i) => Number(r.seq) === i + 1 && (i === 0 || r.p === lines.rows[i - 1].e)), { saves, headA });
  const c1 = await check("incremental"), i1 = await api("GET", "/platform/audit/integrity", { token: tA });
  ok("J-97 W1: a check finds no break; the Owner's integrity read says INTACT, checked, verified up to the chain's head",
    c1.status === 200 && c1.body.breaks.length === 0 && i1.status === 200 && i1.body.status === "INTACT" && Number(i1.body.verifiedSeq) >= headA && typeof i1.body.lastCheckedAt === "string", [c1.body, i1.body]);

  // ------------------------------------------------------------------------------- W5: the daily export
  const ex = await api("POST", "/demo/audit-chain/export", { actor: "user-A" }), exA = (ex.body?.exports as { chainKey: string; file: string; anchor: string; toSeq: string }[] | undefined)?.find((e) => e.chainKey === A);
  const list = await api("GET", `/demo/audit-chain/archive?prefix=${encodeURIComponent(`audit/${A}/`)}`, { actor: "user-A" });
  const fileA = (list.body?.objects as { key: string; retainUntil: string; sha256: string }[] | undefined)?.find((o) => o.key === exA?.file);
  const years = fileA ? (Date.parse(fileA.retainUntil) - Date.now()) / (365.25 * 86_400_000) : 0;
  ok("J-97 W5: the export writes firm A's lines and an anchor to the write-once archive, kept for the activity log's 7 years",
    ex.status === 200 && !!exA && !!fileA && (list.body.objects as { key: string }[]).some((o) => o.key === exA.anchor) && years > 6.9 && years < 7.1, [ex.body, list.body]);
  const replace = await api("POST", "/demo/audit-chain/archive/tamper", { actor: "user-A", body: { key: exA?.file, how: "replace" } });
  const remove = await api("POST", "/demo/audit-chain/archive/tamper", { actor: "user-A", body: { key: exA?.file, how: "delete" } });
  const again = await api("GET", `/demo/audit-chain/archive?prefix=${encodeURIComponent(`audit/${A}/`)}`, { actor: "user-A" });
  ok("J-97 W5: replacing an archived file is refused (409) and deleting it is refused (423); it is still there with the same digest",
    replace.status === 409 && remove.status === 423 && (again.body.objects as { key: string; sha256: string }[]).find((o) => o.key === exA?.file)?.sha256 === fileA?.sha256, [replace, remove]);

  // ------------------------------------------------------------------------------- W6: a rewrite the chain alone misses
  const at = Number(exA?.toSeq);
  const row = await one(`select id::text id, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') at, workspace_id::text ws, firm_id::text firm, case_id::text cas, combination_id::text combo,
    actor, actor_type::text atype, action, entity, entity_key, correlation_id, support_session_id::text sup, detail::text detail, prev_hash from audit_event where chain_key = $1 and seq = $2`, [A, at]);
  const forged = entryHash(row.prev_hash, { chainKey: A, seq: String(at), id: row.id, at: row.at, workspaceId: row.ws, firmId: row.firm, caseId: row.cas, combinationId: row.combo, actor: row.actor,
    actorType: row.atype, action: row.action, entity: row.entity, entityKey: row.entity_key, summary: "Rewritten by the database owner (J-97, Sample)", correlationId: row.correlation_id, supportSessionId: row.sup, detail: row.detail });
  await asOwner(`update audit_event set summary = 'Rewritten by the database owner (J-97, Sample)', entry_hash = $1 where chain_key = $2 and seq = $3`, [forged, A, at]);
  await db.query(`update aud_chain_check set verified_hash = $1 where chain_key = $2`, [forged, A]);   // and moves the checker's own record to match
  const c6 = await check("full"), bA = breakOf(c6, A), i6 = await api("GET", "/platform/audit/integrity", { token: tA });
  ok("J-97 W6: the database owner rewrote firm A's exported line and recomputed its hash: the check names firm A at that seq as an anchor mismatch",
    bA?.why === "anchor" && Number(bA.fromSeq) === at, c6.body);
  ok("J-97 W6: firm A's Owner now reads BROKEN with the range from that seq (it was INTACT in W1)", i6.body.status === "BROKEN" && Number(i6.body.failingFromSeq) === at, i6.body);

  // ------------------------------------------------------------------------------- W4: firm B untouched
  const i4 = await api("GET", "/platform/audit/integrity", { token: tB });
  ok("J-97 W4: firm B's Owner reads firm B's own chain: INTACT, untouched by firm A's break", i4.status === 200 && i4.body.status === "INTACT" && !breakOf(c6, B), [i4.body, c6.body]);

  // ------------------------------------------------------------------------------- W2: a changed line
  const headB = Number((await one(`select max(seq)::text h from audit_event where chain_key = $1`, [B])).h);
  ok("J-97 W2 setup: firm B's chain has at least three lines (its Sample seed and sign-in)", headB >= 3, { headB });
  await asOwner(`update audit_event set summary = summary || ' (changed, J-97)' where chain_key = $1 and seq = $2`, [B, headB - 1]);
  const c2 = await check("full"), bB = breakOf(c2, B), i2 = await api("GET", "/platform/audit/integrity", { token: tB });
  ok("J-97 W2: one old line of firm B changed: the check names firm B from that seq (a hash mismatch), and B's Owner reads BROKEN",
    bB?.why === "hash" && Number(bB.fromSeq) === headB - 1 && i2.body.status === "BROKEN", [c2.body, i2.body]);

  // ------------------------------------------------------------------------------- W3: a removed line
  ok("J-97 W3 fail first: before the delete, firm B's break is not a gap", bB?.why !== "gap");
  await asOwner(`delete from audit_event where chain_key = $1 and seq = $2`, [B, headB - 2]);
  const c3 = await check("full"), g = breakOf(c3, B);
  ok("J-97 W3: an earlier line of firm B removed: the check reports a gap from that seq", g?.why === "gap" && Number(g.fromSeq) === headB - 2, c3.body);
} finally {
  await db.end();
}
process.exit(summary() ? 1 : 0);
