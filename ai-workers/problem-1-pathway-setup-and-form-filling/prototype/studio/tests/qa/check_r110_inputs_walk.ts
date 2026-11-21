// qa R1.10 "Checking every input" (PF-28 part 1 on the PF/FO doors, CS-V1 on the case side): gate A walked by API on a
// running isolated copy (input checking has no screen of its own; by API as R1.2 and R1.9 were accepted). An Owner of the
// Sample firm records a complaint over HTTP with a mistake in each request, reads the refusal, corrects it, and the next
// capability's first step (the complaint in the firm's list, then acknowledged) works on what was stored. Then the probes
// a person cannot see: 1 MB, a malformed id, the case side's answer, and the doors PF-28 part 1 left on its allow-list.
// No model call (US$0). Never :4400.
//   zsh studio/tools/isolated.sh qa_r110 4474 start --ttl 30 PLATFORM_IDENTITY=local && \
//     STUDIO_URL=http://localhost:4474 tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_r110_inputs_walk.ts
const BASE = process.env.STUDIO_URL ?? "http://localhost:4474";
let pass = 0, fail = 0;
const ok = (n: string, c: unknown, d?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d !== undefined ? ` — ${JSON.stringify(d).slice(0, 400)}` : ""}`); };
const note = (s: string) => console.log(`NOTE  ${s}`);
type A = { status: number; body: any };
const call = async (method: string, path: string, o: { token?: string; body?: unknown; raw?: string; headers?: Record<string, string> } = {}): Promise<A> => {
  const has = o.body !== undefined || o.raw !== undefined;
  const r = await fetch(BASE + path, { method, headers: { ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...(has ? { "content-type": "application/json" } : {}), ...(o.headers ?? {}) }, body: o.raw ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined) });
  const t = await r.text(); let b: any = t; try { b = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body: b };
};
const fields = (a: A) => (a.body && typeof a.body === "object" ? a.body.fields ?? a.body.issues ?? null : null);

const signIn = await call("POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId: "user-R", secondStep: true } });
const tok = signIn.body?.token as string;
ok("R1.10 setup: the Sample firm's Owner signs in (local identity)", signIn.status < 300 && !!tok, signIn.status);
const me = await call("GET", "/api/platform/me", { token: tok });
const staffId = me.body?.staffId ?? me.body?.staff?.id ?? me.body?.id;
ok("R1.10 setup: /me names the Owner's staff id", typeof staffId === "string", Object.keys(me.body ?? {}));

const good = { subjectKind: "OTHER_PERSON", complainantName: "Sample complainant", receivedAt: "2026-11-20T14:00:00Z", channel: "EMAIL", category: "SERVICE", summary: "Sample: the reply took too long.", handlerStaffId: staffId };
const list = async () => ((await call("GET", "/api/platform/complaints", { token: tok })).body?.items ?? []) as { id: string }[];
const n0 = (await list()).length;

// W1: an unknown field is refused, named, in plain words, and nothing is stored.
const w1 = await call("POST", "/api/platform/complaints", { token: tok, body: { ...good, priority: "high" }, headers: { "idempotency-key": `qa-r110-w1-${process.pid}` } });
ok("R1.10 W1 fail: a complaint with an unknown field (priority) is refused with Problem Details naming the field, and nothing is stored",
  w1.status >= 400 && w1.status < 500 && JSON.stringify(fields(w1) ?? w1.body).includes("priority") && (await list()).length === n0, { status: w1.status, body: w1.body });
note(`W1 answered ${w1.status} (PF-28's rule: 422; the R1.10 row as written: 400)`);
// W2: a wrong type and a missing field each name their field.
const { summary: _drop, ...noSummary } = good;
const w2a = await call("POST", "/api/platform/complaints", { token: tok, body: { ...good, summary: 7 }, headers: { "idempotency-key": `qa-r110-w2a-${process.pid}` } });
const w2b = await call("POST", "/api/platform/complaints", { token: tok, body: noSummary, headers: { "idempotency-key": `qa-r110-w2b-${process.pid}` } });
ok("R1.10 W2 fail: a wrong type (summary: 7) and a missing summary are each refused naming summary, nothing stored",
  w2a.status >= 400 && w2a.status < 500 && JSON.stringify(fields(w2a) ?? w2a.body).includes("summary") && w2b.status >= 400 && w2b.status < 500 && JSON.stringify(fields(w2b) ?? w2b.body).includes("summary") && (await list()).length === n0,
  [w2a.status, fields(w2a), w2b.status, fields(w2b)]);
note(`W2 answered ${w2a.status} and ${w2b.status}; words: ${JSON.stringify([fields(w2a), fields(w2b)]).slice(0, 300)}`);
// W3: over-long text is refused naming the field.
const w3 = await call("POST", "/api/platform/complaints", { token: tok, body: { ...good, summary: "x".repeat(4001) }, headers: { "idempotency-key": `qa-r110-w3-${process.pid}` } });
ok("R1.10 W3 fail: a 4,001-character summary is refused naming summary, nothing stored", w3.status >= 400 && w3.status < 500 && JSON.stringify(fields(w3) ?? w3.body).includes("summary") && (await list()).length === n0, { status: w3.status, f: fields(w3) });
// W4: corrected, it is stored exactly as entered.
const w4 = await call("POST", "/api/platform/complaints", { token: tok, body: good, headers: { "idempotency-key": `qa-r110-w4-${process.pid}` } });
const id = w4.body?.id as string;
ok("R1.10 W4 pass: the corrected complaint is stored (201) with the summary as typed", w4.status === 201 && typeof id === "string" && w4.body?.summary === good.summary, { status: w4.status, body: w4.body });
// W5: the next capability's first step works on what was stored: it is in the firm's list and can be acknowledged.
const inList = (await list()).some((c) => c.id === id);
const ack = await call("POST", `/api/platform/complaints/${id}/acknowledge`, { token: tok, body: { at: "2026-11-20T15:00:00Z" } });
ok("R1.10 W5 pass (next step): the stored complaint is in the firm's list and its handler acknowledges it (200)", inList && ack.status === 200, { inList, ack: ack.status, body: ack.status === 200 ? undefined : ack.body });
const ackBad = await call("POST", `/api/platform/complaints/${id}/acknowledge`, { token: tok, body: { at: "2026-11-20T15:00:00Z", pf: 1 } });
note(`W5 acknowledge with an unknown field answered ${ackBad.status}`);

// Underneath: the body limit, a malformed id, the case side, two allow-listed front-office doors.
const big = await call("POST", "/api/platform/complaints", { token: tok, raw: JSON.stringify({ ...good, summary: "a".repeat(1024 * 1024) }), headers: { "idempotency-key": `qa-r110-big-${process.pid}` } });
ok("R1.10 U1 fail: a 1 MB body answers 413 BODY_TOO_LARGE, never 500, nothing stored", big.status === 413 && big.body?.code === "BODY_TOO_LARGE" && (await list()).length === n0 + 1, { status: big.status, code: big.body?.code, detail: big.body?.detail });
const bad = await call("GET", "/api/platform/complaints/not-a-uuid", { token: tok });
ok("R1.10 U2 fail: a malformed complaint id answers 404, never 500", bad.status === 404, bad);
const cs = await call("GET", "/api/runtime/cases?pf28Unknown=x", { headers: { "x-actor": "user-R" } });
ok("R1.10 U3 fail (case side, CS-V1): an unknown query field on the case list answers 400, never 2xx or 500", cs.status === 400, { status: cs.status, body: cs.body });
const fo1 = await call("GET", "/api/front-office/leads?pf28Unknown=x", { token: tok });
const fo2 = await call("GET", "/api/platform/audit?pf28Unknown=x", { token: tok });
note(`U4 allow-listed doors (PF-28 parts 2-3): GET /api/front-office/leads?pf28Unknown=x → ${fo1.status}; GET /api/platform/audit?pf28Unknown=x → ${fo2.status} (the rule: 422 naming it)`);
ok("R1.10 U4 (gap, expected to fail until PF-28 parts 2-6): an unknown query field on two allow-listed doors is refused, not silently ignored", fo1.status === 422 && fo2.status === 422, [fo1.status, fo2.status]);

console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
