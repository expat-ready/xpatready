// qa (15 Nov, capability old-majors; QA-383, Bug · Major, C7.8 / C6.19): an inside-Canada worker must be able to give a
// valid "current country of residence" on IMM 5710. IMM 5710's map note "code_list:imm5710.current_cor (only option:
// Canada=511)" became the one choice "only option: Canada", and "Canada", "CAN" and "511" were refused with "Choose one
// of: only option: Canada." (on main 1fcde2d15 the answer saves, 200, with that problem on it). Fails today; passes when
// the choice reads "Canada" and the answer "Canada" is saved with no problem.
// Runs on the configured checkpoint (Demo › Load the configured checkpoint); one With an LMIA case opened here. US$0, no AI.
//   zsh studio/tools/isolated.sh qa_383 4476 start && tsx studio/tests/qa/check_qa383_imm5710_current_cor.ts 4476 xr_studio_qa_383
import { client, recorder } from "../runtime/api.ts";

const PORT = Number(process.argv[2] ?? 4476), DB = process.argv[3] ?? "xr_studio_qa_383";
const { call, sql } = client(PORT, DB);
const { ok, summary } = recorder();
const FIELD = "person.current_residence_country", CLIENT = "user-P", OFFICER = "user-O";

(async () => {
  const comboId = () => sql("select id from combination where combination_key='wp.lmia_inside'");
  if (!comboId()) {
    const l = await call("POST", "/demo/load", { sample: "configured" }, "user-A");
    ok("QA-383 setup: the configured checkpoint loads (Demo › Load the configured checkpoint)", l.status < 300, { status: l.status });
  }
  const combo = comboId();
  ok("QA-383 setup: With an LMIA (wp.lmia_inside) is on the checkpoint", !!combo);
  const opened = await call("POST", "/runtime/cases", { combinationId: combo, reference: `QA383-${Date.now().toString(36)}`, clientActor: CLIENT, principal: { displayName: "Sample Client A" } }, OFFICER);
  ok("QA-383 setup: a With an LMIA case opens", opened.status === 201, { status: opened.status, body: opened.status === 201 ? undefined : opened.body });
  const caseId = opened.body?.id;
  const people = (await call("GET", `/runtime/cases/${caseId}`, undefined, OFFICER)).body?.people as { subject_id: string; role: string }[] | undefined;
  const principal = people?.find((p) => p.role === "principal")?.subject_id;
  // What the client is offered: the question's options as the questionnaire gives them.
  const q = await call("GET", `/runtime/cases/${caseId}/questionnaire`, undefined, CLIENT);
  const found: unknown[] = [];
  const walk = (n: unknown) => { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === "object") { const o = n as Record<string, unknown>; if (o.fact === FIELD) found.push(o); Object.values(o).forEach(walk); } };
  walk(q.body);
  if (!found.length) walk((await call("GET", `/runtime/cases/${caseId}/questionnaire?mode=agent`, undefined, OFFICER)).body); // asked of the firm instead
  const offered = JSON.stringify(found.map((o) => (o as { options?: unknown }).options ?? null));
  ok("QA-383 fail (C6.19): the question is on the case's questionnaire (client's, else the firm's)", found.length > 0, { status: q.status });
  ok("QA-383 fail (C6.19): no choice is labelled with the map note's lead-in \"only option:\"", !/only option/i.test(offered), { offered });
  for (const value of ["Canada"]) {
    const r = await call("PUT", `/runtime/cases/${caseId}/answers/${principal}/${FIELD}`, { value, expectedId: null }, CLIENT);
    // A refused choice is saved with a problem on it ("answered with a problem"), so 200 alone is not acceptance.
    const problems = r.body?.answer?.problems ?? null;
    ok(`QA-383 fail (C6.19): the answer "${value}" is saved with no problem on it`, r.status < 300 && Array.isArray(problems) && problems.length === 0, { status: r.status, problems, detail: r.status < 300 ? undefined : r.body?.detail });
  }
  process.exitCode = summary() ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
