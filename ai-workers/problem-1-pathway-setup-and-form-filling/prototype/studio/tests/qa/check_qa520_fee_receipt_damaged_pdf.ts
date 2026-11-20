// qa 10 (19 Nov, R1.67 gate A on main after #2253; QA-520, Gap · Major): R1.67 says "a damaged PDF is refused". CS-D1t
// (#2253) puts the one file-type check (PF-F4 checkFile + the PDF reader) on the two Documents doors only. The case side's
// fee-receipt door (POST /runtime/filings/:id/record/fee-receipt, submission.ts) and the signed-scan door
// (POST /runtime/items/:id/signed-scan, sign-steps.ts) judged by contracts' mediaOf, which reads only the first bytes: a
// PDF cut short, or a header with nothing behind it, was stored. Widened by the runtime lane (QA-520 fix) to both doors:
// each damaged file is refused in PF-F4's words with nothing stored (no row, no file on disk, no audit line), and a whole
// PDF, JPEG and PNG are still stored at each door.
// Setup as check_c82_record_api.ts (the pack's Visitor visa release 2, one person's case). Sample data, US$0, no AI.
//   zsh studio/tools/isolated.sh qa_520 4472 start --ttl 60 && trap 'zsh studio/tools/isolated.sh qa_520 4472 stop' EXIT \
//     && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_qa520_fee_receipt_damaged_pdf.ts 4472 xr_studio_qa_520
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DB, PORT, answer, call, confirmAll, sendFile, fillEverything, firms, generateCopy, inDays, itemsOf, needVisitorVisa, openCase, prepare, readyToFile, sql, yearsAgo, type Prepare } from "../../acceptance/lib/m3.ts";
import { textPdf } from "../../acceptance/lib/fixtures.ts";
import { recorder } from "../runtime/api.ts";

const { ok, summary } = recorder();
const releases = () => { try { return Number(sql(`select coalesce(max(r.version), 0) from config_release r join combination c on c.id = r.combination_id where c.combination_key = 'vv.single'`)); } catch { return 0; } };
const studio = join(import.meta.dirname, "..", ".."), tsx = join(studio, "node_modules", ".bin", "tsx");
const setup = (file: string) => spawnSync(tsx, ["--tsconfig", join(studio, "api", "tsconfig.json"), join(studio, file), String(PORT), DB], { cwd: join(studio, ".."), stdio: "ignore", timeout: 900_000 });
if (releases() < 1) setup("tests/runtime/setup_visitor_visa.ts");
if (releases() < 2) setup("acceptance/lib/setup_vv_m3.ts");
ok("setup: the copy has Visitor visa release 2 (the pack's setup)", releases() >= 2, releases());
const vv = needVisitorVisa();
const f = await firms();
const officer = f.officer!, rep = f.rep!;
type Filing = Prepare["filings"][number];
const filingsOf = (p: Prepare | null) => (p?.filings ?? []) as Filing[];
const c = await openCase(vv, [{ role: "principal", name: "Sample Client Q", dob: yearsAgo(41) }], { representative: rep, caseOfficers: [officer] });
const P = c.subjects["Sample Client Q"];
await fillEverything(c.id);
let p = (await prepare(c.id, officer)).p;

// The files (Sample, synthetic): a whole PDF, JPEG and PNG, and the three damaged ones of the brief.
const fixture = (n: string) => readFileSync(join(studio, "tests", "fixtures", "file-types", n));
const whole = textPdf(["SYNTHETIC SPECIMEN - MADE-UP TEST DOCUMENT - NOT VALID", "IRCC Transaction Approved page (Sample)"]);
const GOOD: [string, Buffer, string, string][] = [["PDF", whole, "page.pdf", "application/pdf"], ["JPEG", fixture("sample.jpg"), "page.jpg", "image/jpeg"], ["PNG", fixture("sample.png"), "page.png", "image/png"]];
const DAMAGED: [string, Buffer, string][] = [
  ["a PDF cut short (60% of a whole one)", whole.subarray(0, Math.floor(whole.length * 0.6)), "approved.pdf"],
  ["a PDF header with nothing behind it", Buffer.from("%PDF-1.4\n% nothing else\n%%EOF\n", "latin1"), "approved.pdf"],
  ["a PNG cut off after its signature, named .png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), "approved.png"],
];
const detail = (u: { body: unknown }) => String((u.body as { detail?: string } | null)?.detail ?? "");
const filesUnder = (dir: string) => execFileSync("find", [join(studio, "var"), "-path", `*/cases/${c.id}/${dir}/*`, "-type", "f"], { encoding: "utf8" }).trim().split("\n").filter(Boolean).length;
// PF-F4's words for a damaged file (case-checklist.ts checkedCaseFile): "could not be read: it may be damaged", the allowed list, "Nothing was stored."
const pf4 = (d: string) => /could not be read: it may be damaged\. Allowed here: PDF, JPEG and PNG\. Nothing was stored\.$/.test(d);

// ---- the signed-scan door (before the submission is recorded: a recorded filing takes no scan, B129) ----
const it = itemsOf(p, P, "IMM 5476")[0];
const scanned = () => ({ rows: sql(`select count(*) from signed_scan where case_id='${c.id}'`), files: filesUnder("signed-scans"), audit: sql(`select count(*) from audit_event where action='uploaded' and entity='signed scan' and summary like '%case ${c.id.slice(0, 8)}%'`) });
const printAndSign = async () => {
  const copy = await generateCopy(c.id, "IMM 5476", P);
  const pr = await call("POST", `/runtime/items/${it?.id}/sign-steps/print`, { copy }, officer), sg = await call("POST", `/runtime/items/${it?.id}/sign-steps/signed`, {}, officer);
  return pr.status === 200 && sg.status === 200 ? copy : null;
};
ok("setup: the case has IMM 5476 signed by hand and scanned", it?.signature === "HAND_SCANNED", it?.signature);
let copy = await printAndSign();
ok("setup: IMM 5476 is printed and marked signed by hand, so it takes its signed scan", !!copy, copy);
const scan = (bytes: Buffer, name: string) => sendFile(`/runtime/items/${it?.id}/signed-scan`, bytes, name, officer);
for (const [label, bytes, name] of DAMAGED) {
  const before = scanned(), u = await scan(bytes, name), after = scanned();
  ok(`QA-520 fail: the signed-scan door refuses ${label} (400) in PF-F4's words, nothing stored (no row, no file, no audit line)`, u.status === 400 && pf4(detail(u)) && JSON.stringify(before) === JSON.stringify(after), { status: u.status, detail: detail(u), before, after });
}
{
  const before = scanned(), u = await scan(fixture("bomb.png"), "signed.png"), after = scanned();
  ok("QA-520 fail: the signed-scan door refuses an image with too many pixels (413) in PF-F4's words, not as \"larger than 20 MB\", nothing stored",
    u.status === 413 && /^This image is too large to open safely/.test(detail(u)) && !/larger than/.test(detail(u)) && JSON.stringify(before) === JSON.stringify(after), { status: u.status, detail: detail(u), before, after });
}
for (const [kind, bytes, name, media] of GOOD) {
  // A scan marks "scan received": the steps restart only when a fact changed since the copy printed (B132, as
  // check_c81_signing_api.ts B130), so change one, have it confirmed, and print and sign a new copy for the next scan.
  if (kind !== "PDF") { await answer(c.id, P, "person.family_name", `SAMPLEQ${kind}`, officer); await confirmAll(c.id, P); copy = await printAndSign(); }
  const before = scanned(), u = await scan(bytes, name), after = scanned();
  ok(`QA-520 pass: a whole ${kind} is still stored at the signed-scan door (201): one more row, file and audit line, its type from its bytes`,
    u.status === 201 && Number(after.rows) === Number(before.rows) + 1 && after.files === before.files + 1 && Number(after.audit) === Number(before.audit) + 1
      && sql(`select media_type from signed_scan where case_id='${c.id}' order by uploaded_at desc limit 1`) === media, { status: u.status, detail: detail(u), before, after, copy });
}

// ---- the fee-receipt door (on the recorded submission) ----
p = (await prepare(c.id, officer)).p;
const g = p?.groups[0];
const fP = filingsOf(p).find((x) => x.applicants[0]?.subject === P)?.id;
if (!(await readyToFile(c.id, rep)).length) sql(`update filing set status='READY_TO_FILE' where case_id='${c.id}' and active`);
p = (await prepare(c.id, officer)).p;
const rec = await call("PATCH", `/runtime/groups/${g?.id}/record`, { filings: [{ filing: fP, our_reference: "SAMPLE-REF-Q", submitted_on: inDays(0), application_number: "V300000901", fee_receipt: "SAMPLE-RECEIPT" }], ucis: [{ subject: P, uci: "9999-9999" }], version: p?.version }, officer);
ok("setup: the submission is recorded, so the filing takes a fee receipt", rec.status === 200, rec.body);
const receipts = () => ({ rows: sql(`select count(*) from fee_receipt_file where case_id='${c.id}'`), files: filesUnder("fee-receipts"), audit: sql(`select count(*) from audit_event where action='uploaded' and entity='fee receipt' and summary like '%case ${c.id.slice(0, 8)}%'`) });
const send = (bytes: Buffer, name: string) => sendFile(`/runtime/filings/${fP}/record/fee-receipt`, bytes, name, officer);
for (const [label, bytes, name] of DAMAGED) {
  const before = receipts(), u = await send(bytes, name), after = receipts();
  ok(`QA-520 fail-today: the fee-receipt door refuses ${label} (400) in PF-F4's words, on the field "file", nothing stored (no row, no file, no audit line)`,
    u.status === 400 && pf4(detail(u)) && (u.body as { errors?: { field: string }[] } | null)?.errors?.[0]?.field === "file" && JSON.stringify(before) === JSON.stringify(after), { status: u.status, detail: detail(u), before, after });
}
// Review M1 (QA-520): an image over PF-F4's pixel limit is refused (413) in PF-F4's words, on the field "file", never
// reworded by main.ts's upload-limit filter as "larger than 20 MB" (it is a few hundred bytes).
{
  const before = receipts(), u = await send(fixture("bomb.png"), "approved.png"), after = receipts();
  ok("QA-520 fail: the fee-receipt door refuses an image with too many pixels (413) in PF-F4's words, not as \"larger than 20 MB\", on the field \"file\", nothing stored",
    u.status === 413 && /^This image is too large to open safely/.test(detail(u)) && !/larger than/.test(detail(u)) && (u.body as { errors?: { field: string }[] } | null)?.errors?.[0]?.field === "file" && JSON.stringify(before) === JSON.stringify(after), { status: u.status, detail: detail(u), before, after });
}
for (const [kind, bytes, name, media] of GOOD) {
  const before = receipts(), u = await send(bytes, name), after = receipts();
  ok(`QA-520 pass: a whole ${kind} is still stored as the fee receipt (200): one more row, file and audit line, its type from its bytes`,
    u.status === 200 && Number(after.rows) === Number(before.rows) + 1 && after.files === before.files + 1 && Number(after.audit) === Number(before.audit) + 1
      && sql(`select media_type from fee_receipt_file where case_id='${c.id}' order by uploaded_at desc limit 1`) === media, { status: u.status, detail: detail(u), before, after });
}
process.exitCode = summary() ? 1 : 0; // a FAIL fails the run (qa's copy ended with summary() alone, exit 0)
