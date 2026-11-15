// qa (15 Nov, capability old-majors; QA-383, Bug · Major, C7.8 / C6.19): an inside-Canada worker must be able to give a
// valid "current country of residence" on IMM 5710. IMM 5710's map note "code_list:imm5710.current_cor (only option:
// Canada=511)" became the one choice "only option: Canada", and "Canada", "CAN" and "511" were refused with "Choose one
// of: only option: Canada." (on main 1fcde2d15 the answer saves, 200, with that problem on it). Fails today; passes when
// the choice reads "Canada" and the answer "Canada" is saved with no problem.
// BK-383 (the fix, forms lane) extends it with the row's named cases: DW1 the choice reads "Canada"; DW2 IMM 5710's copy
// writes 511; DW3 IMM 5409's copy writes "Canada"; DW4 typing "Canada" saves with no problem; DW5 an answer saved before the
// fix as "only option: Canada" reads as "Canada" (and its copies write 511 and "Canada"); DW6 an "e.g." note gives no option
// list. The copies are read back from their own PDFs (the proven E5 reader, as check_qa395_own_country.ts).
// Runs on the configured checkpoint (Demo › Load the configured checkpoint); one With an LMIA case opened here. US$0, no AI.
//   zsh studio/tools/isolated.sh qa_383 4476 start && tsx studio/tests/qa/check_qa383_imm5710_current_cor.ts 4476 xr_studio_qa_383
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { client, recorder } from "../runtime/api.ts";
import { noteList, pdfOptions } from "../../engine/options.ts";
import { runTransform } from "../../../p5/transforms.ts";

const PORT = Number(process.argv[2] ?? 4476), DB = process.argv[3] ?? "xr_studio_qa_383";
const { call, sql } = client(PORT, DB);
const { ok, summary } = recorder();
const FIELD = "person.current_residence_country", CLIENT = "user-P", OFFICER = "user-O";
const STUDIO = join(import.meta.dirname, "..", ".."), ROOT = join(STUDIO, "..", "..", "..", "..");
const PY = join(ROOT, ".tools", "solution-1-prototype", ".venv", "bin", "python");
const BOX = { "IMM 5710": "form1[0].Page1[0].PersonalDetails[0].CurrentCOR[0].CurrentCOR[0].Row2[0].Country[0]", "IMM 5409": "IMM_5409[0].Page1[0].Info[0].Country[0]" } as const;
/** Every value a filled PDF holds, by its form field's data path (the proven E5 reader, as check_qa395_own_country.ts). */
function pdfValues(pdf: Buffer): Record<string, string> {
  if (!pdf.length) return {};
  const dir = mkdtempSync(join(tmpdir(), "q383-")), file = join(dir, "copy.pdf");
  try {
    writeFileSync(file, pdf);
    const code = "import sys, json; sys.path.insert(0, sys.argv[1]); import e5_roundtrip as E, xml.etree.ElementTree as ET\n"
      + "r = E.open_reader(open(sys.argv[2], 'rb').read()); d = E.data_root(ET.fromstring(E.xfa_streams(r)['datasets'].get_object().get_data()))\n"
      + "print(json.dumps({p: v for p, v in E.leaves(d) if v}))";
    return JSON.parse(execFileSync(PY, ["-I", "-c", code, join(STUDIO, "..", "p1"), file], { encoding: "utf8" }).trim().split("\n").pop()!);
  } catch { return {}; } finally { rmSync(dir, { recursive: true, force: true }); }
}
/** What one form's copy for the principal writes in its Country box (null: no copy made). */
async function written(caseId: string, subject: string, form: keyof typeof BOX, tag: string): Promise<string | null> {
  const r = await call("POST", `/runtime/cases/${caseId}/forms/${encodeURIComponent(form)}/${subject}/generate`, { idempotencyKey: `qa383-${tag}-${form.replace(" ", "")}-${Date.now().toString(36)}` }, OFFICER);
  let copy: { status?: string } | null = null;
  if (r.body?.id) for (let i = 0; i < 90 && !["GENERATED", "FAILED"].includes(copy?.status ?? ""); i++) { await new Promise((z) => setTimeout(z, 500)); copy = (await call("GET", `/runtime/form-copies/${r.body.id}`, undefined, OFFICER)).body; }
  if (copy?.status !== "GENERATED") return null;
  // IMM 5710's blank PDF already holds 511 in this box: the copy's own record must say it wrote the box.
  const result = sql(`select b->>'result' from form_instance f, jsonb_array_elements(f.result_json->'boxes') b where f.id='${r.body.id}' and b->>'box'='${BOX[form]}'`);
  if (result !== "written") return `(not written: ${result || "no such box"})`;
  const res = await fetch(`http://127.0.0.1:${PORT}/api/runtime/form-copies/${r.body.id}/file`, { headers: { "x-actor": OFFICER } }).catch(() => null);
  const values = pdfValues(res?.ok ? Buffer.from(await res.arrayBuffer()) : Buffer.alloc(0));
  const at = Object.keys(values).find((k) => k.replace(/\[0\]/g, "") === BOX[form].replace(/\[0\]/g, ""));
  return at ? values[at] : "";
}

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
  ok("BK-383 DW1: the one choice offered reads \"Canada\"", offered === JSON.stringify([[{ key: "Canada", label: "Canada" }]]), { offered });
  // DW5 first: an answer saved before the fix held the lead-in's text (what the old choice sent). It is written here as it
  // was stored then, and must read as "Canada": on the questionnaire with no problem, and in both copies.
  const old = await call("PUT", `/runtime/cases/${caseId}/answers/${principal}/${FIELD}`, { value: "only option: Canada", expectedId: null }, CLIENT);
  const stored = sql(`select value_json #>> '{}' from client_canonical_answer where id='${old.body?.answer?.id}'`);
  ok("BK-383 DW5 setup: the answer is stored as before the fix, \"only option: Canada\"", stored === "only option: Canada", { status: old.status, stored });
  const answerNow = async () => { const v = (await call("GET", `/runtime/cases/${caseId}/questionnaire?mode=agent`, undefined, OFFICER)).body; const hits: { answer?: { id?: string; value?: unknown; problems?: string[] } | null }[] = []; const w = (n: unknown) => { if (Array.isArray(n)) n.forEach(w); else if (n && typeof n === "object") { const o = n as Record<string, unknown>; if (o.fact === FIELD && (o as { subjectId?: string }).subjectId === principal) hits.push(o as never); Object.values(o).forEach(w); } }; w(v); return hits.find((h) => h.answer)?.answer ?? null; };
  const read = await answerNow();
  ok("BK-383 DW5: the saved \"only option: Canada\" reads as \"Canada\", with no problem on it", read?.value === "Canada" && Array.isArray(read?.problems) && read!.problems!.length === 0, read);
  const o5710 = await written(caseId, principal!, "IMM 5710", "old"), o5409 = await written(caseId, principal!, "IMM 5409", "old");
  ok("BK-383 DW5 (IMM 5710): its copy writes the form's code 511", o5710 === "511", { written: o5710 });
  ok("BK-383 DW5 (IMM 5409): its copy writes \"Canada\" in the Country box, never the lead-in", o5409 === "Canada", { written: o5409 });
  for (const value of ["Canada"]) {
    const r = await call("PUT", `/runtime/cases/${caseId}/answers/${principal}/${FIELD}`, { value, expectedId: read?.id ?? null }, CLIENT);
    // A refused choice is saved with a problem on it ("answered with a problem"), so 200 alone is not acceptance.
    const problems = r.body?.answer?.problems ?? null;
    ok(`QA-383 fail (C6.19) = BK-383 DW4: the answer "${value}" is saved with no problem on it`, r.status < 300 && Array.isArray(problems) && problems.length === 0, { status: r.status, problems, detail: r.status < 300 ? undefined : r.body?.detail });
  }
  const w5710 = await written(caseId, principal!, "IMM 5710", "new"), w5409 = await written(caseId, principal!, "IMM 5409", "new");
  ok("BK-383 DW2: IMM 5710's copy writes the form's code 511 for \"Canada\"", w5710 === "511", { written: w5710 });
  ok("BK-383 DW3: IMM 5409's copy writes \"Canada\" in the Country box", w5409 === "Canada", { written: w5409 });
  // DW6 (pure, the same helper every reader uses): an "e.g." note names examples, not the list.
  const eg = "code_list:imm1344.country (e.g. Canada=511, United States of America=461)";
  ok("BK-383 DW6: an \"e.g.\" note gives no option list (noteList, pdfOptions)", noteList("e.g. Canada=511, United States of America=461") === null && pdfOptions({}, eg).length === 0 && noteList("codes as in inventory, e.g. Stateless=979") === null, { options: pdfOptions({}, eg) });
  ok("BK-383 DW6: the fill writes no example's code into a box that prints no list (by hand instead)", "hand" in runTransform(eg, "United States of America", {}));
  ok("BK-383 DW1 (pure): \"only option: Canada=511\" lists the one choice \"Canada\" and the fill writes 511 for it", noteList("only option: Canada=511") === "Canada=511" && JSON.stringify(pdfOptions({}, "code_list:imm5710.current_cor (only option: Canada=511)")) === JSON.stringify([{ code: "511", label: "Canada" }]) && (runTransform("code_list:imm5710.current_cor (only option: Canada=511)", "Canada", {}) as { value?: string }).value === "511");
  process.exitCode = summary() ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
