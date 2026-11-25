// R1.10 A5 (PF-28 W5, the case side; #3544's hand-over, Lead 4 on 25 Nov): a malformed id is the one not-found (404) before
// the body is read, and a list's unknown query key is refused 400 and named. On an isolated copy, with the session each door
// takes (the Sample firm's representative user-R where a door declares keys, else the case officer user-O by x-actor):
//   I  "not-a-uuid" in each id of the doors W5 found answering 400 or 405, with a body the door would refuse ({}): 404;
//   B  the same doors with a well-formed random id and that body still answer the body's own 400 (a case-side field error)
//      or the one 404: the body is still read, only after the id's shape;
//   Q  GET /api/runtime/clients and GET /api/runtime/documents/past-keep-period with ?pf28Unknown=x: 400 naming it; with
//      their own keys only (?query=, ?page=1; none, ?after=) they answer 200; a malformed cursor stays 400;
//   D  the document flags door keeps its order: a person with no case duty is refused 403 whatever the id.
// Sample data only; no model call (US$0). Run from prototype/ (never :4400):
//   zsh studio/tools/isolated.sh runtime_pf28a5 4799 start PLATFORM_IDENTITY=local && tsx studio/tests/check_pf28_a5_case_ids.ts 4799
// (the usage line run-suites.sh reads; by hand, stop the copy after: zsh studio/tools/isolated.sh runtime_pf28a5 4799 stop)
import { randomUUID } from "node:crypto";
import { recorder } from "./runtime/api.ts";

const PORT = Number(process.argv[2] ?? 4799), BASE = `http://localhost:${PORT}`;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const { ok, summary } = recorder();
type Answer = { status: number; body: Record<string, unknown> | null };
type As = { token?: string; actor?: string };
const call = async (method: string, path: string, as: As, body?: unknown): Promise<Answer> => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...(as.token ? { authorization: `Bearer ${as.token}` } : {}), ...(as.actor ? { "x-actor": as.actor } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: Record<string, unknown> | null = null; try { b = JSON.parse(t); } catch { /* not JSON */ }
  return { status: r.status, body: b };
};
/** The answer names field k: PF/FO's `fields`, or the case side's `errors[].field`. */
const named = (a: Answer, k: string) => (typeof a.body?.fields === "object" && a.body.fields !== null && k in (a.body.fields as object))
  || ((a.body?.errors as { field?: string }[] | undefined) ?? []).some((e) => e?.field === k);

const tR = ((await (await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: "user-R", secondStep: true }) })).json()) as { token?: string }).token ?? "";
ok("A5 setup: the Sample firm's representative signs in on the local stand-in", !!tR);
if (!tR) process.exit(summary() ? 1 : 0);
const R: As = { token: tR }, O: As = { actor: "user-O" }, BAD = "not-a-uuid", id = () => randomUUID();

// [label, method, path with "{id}" for the id under test and "{x}" for any other id, session]
const DOORS: [string, string, string, As][] = [
  ["document flags", "POST", "/api/runtime/documents/{id}/flags", O],
  ["record a government step", "POST", "/api/runtime/cases/{id}/milestones", R],
  ["cancel a step (the case id)", "POST", "/api/runtime/cases/{id}/milestones/{x}/cancel", R],
  ["cancel a step (the step id)", "POST", "/api/runtime/cases/{x}/milestones/{id}/cancel", R],
  ["add a note", "POST", "/api/runtime/cases/{id}/notes", R],
  ["edit a note's text (the case id)", "PUT", "/api/runtime/cases/{id}/notes/{x}/text", R],
  ["pin a note (the note key)", "PUT", "/api/runtime/cases/{x}/notes/{id}/pin", R],
  ["a note's visibility (the note key)", "PUT", "/api/runtime/cases/{x}/notes/{id}/visibility", R],
  ["plan a review run", "POST", "/api/runtime/cases/{id}/review-runs/plan", O],
  ["start a review run", "POST", "/api/runtime/cases/{id}/review-runs", O],
  ["a checklist line's providers", "POST", "/api/runtime/checklist-lines/{id}/providers", O],
  ["add a form to a filing", "POST", "/api/runtime/filings/{id}/form-additions", O],
];
const fill = (p: string, v: string) => p.replace("{id}", v).replace("{x}", id());
const iBad: string[] = [], bBad: string[] = [];
for (const [label, m, p, as] of DOORS) {
  const a = await call(m, fill(p, BAD), as, {});
  if (a.status !== 404) iBad.push(`${label}: ${a.status}`);
  const b = await call(m, fill(p, id()), as, {});
  if (!(b.status === 400 || b.status === 404 || b.status === 422)) bBad.push(`${label}: ${b.status}`);
}
const head = await fetch(`${BASE}/api/runtime/cases/${BAD}/prepare`, { method: "HEAD", headers: { "x-actor": "user-O" } }), headOk = await fetch(`${BASE}/api/runtime/cases/${id()}/prepare`, { method: "HEAD", headers: { "x-actor": "user-O" } });
ok(`A5 I fail: "not-a-uuid" in each id of ${DOORS.length} case-side writes, with a body each would refuse, is the one 404 (never 400)`, iBad.length === 0, iBad);
ok("A5 I fail: HEAD /prepare with a malformed id is 404; with a well-formed one it is still 405 (HEAD is not offered)", head.status === 404 && headOk.status === 405, { malformed: head.status, wellFormed: headOk.status });
ok("A5 B pass: with a well-formed id each door still reads its body (400/422) or finds nothing (404), never 2xx or 500", bBad.length === 0, bBad);

const cu = await call("GET", "/api/runtime/clients?pf28Unknown=x", R), cOk = await call("GET", "/api/runtime/clients?query=Sample&page=1", R), cPage = await call("GET", "/api/runtime/clients?page=x", R);
ok("A5 Q fail: the clients list with an unknown query key → 400 naming it", cu.status === 400 && named(cu, "pf28Unknown"), cu);
ok("A5 Q pass: the clients list with its own keys (?query=, ?page=) → 200; a bad page is still 400 in its own words", cOk.status === 200 && cPage.status === 400 && named(cPage, "page"), { ok: cOk.status, page: cPage.body });
const ku = await call("GET", "/api/runtime/documents/past-keep-period?pf28Unknown=x", R), kOk = await call("GET", "/api/runtime/documents/past-keep-period", R), kAfter = await call("GET", `/api/runtime/documents/past-keep-period?after=${BAD}`, R);
ok("A5 Q fail: the keep-period list with an unknown query key → 400 naming it", ku.status === 400 && named(ku, "pf28Unknown"), ku);
ok("A5 Q pass: the keep-period list with no query → 200; a cursor it did not give is still 400", kOk.status === 200 && kAfter.status === 400, { list: kOk.status, after: kAfter.status });
const d = await call("POST", `/api/runtime/documents/${BAD}/flags`, { actor: "user-A" }, {});
ok("A5 D pass: the configuration author (no case duty) setting a document's flags is refused 403 before the id is read", d.status === 403 || d.status === 401, d.status);
process.exit(summary() ? 1 : 0);
