// qa 10 (19 Nov, R1.67 gate A on main after #2253; QA-520, Gap · Major): R1.67 says "a damaged PDF is refused". CS-D1t
// (#2253) puts the one file-type check (PF-F4 checkFile + the PDF reader) on the two Documents doors only. The case side's
// fee-receipt door (POST /runtime/filings/:id/record/fee-receipt, submission.ts) still judges by contracts' mediaOf, which
// reads only the first bytes: a PDF cut short, or a header with nothing behind it, is stored as the filing's evidence.
// Fails today; passes when the door refuses each damaged file in words, with nothing stored, and still stores a whole PDF.
// Setup as check_c82_record_api.ts (the pack's Visitor visa release 2, one family case recorded). Sample data, US$0, no AI.
//   zsh studio/tools/isolated.sh qa_520 4472 start --ttl 60 && trap 'zsh studio/tools/isolated.sh qa_520 4472 stop' EXIT \
//     && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_qa520_fee_receipt_damaged_pdf.ts 4472 xr_studio_qa_520
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { DB, PORT, call, sendFile, fillEverything, firms, inDays, needVisitorVisa, openCase, prepare, readyToFile, sql, yearsAgo, type Prepare } from "../../acceptance/lib/m3.ts";
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
const g = p?.groups[0];
const fP = filingsOf(p).find((x) => x.applicants[0]?.subject === P)?.id;
if (!(await readyToFile(c.id, rep)).length) sql(`update filing set status='READY_TO_FILE' where case_id='${c.id}' and active`);
p = (await prepare(c.id, officer)).p;
const rec = await call("PATCH", `/runtime/groups/${g?.id}/record`, { filings: [{ filing: fP, our_reference: "SAMPLE-REF-Q", submitted_on: inDays(0), application_number: "V300000901", fee_receipt: "SAMPLE-RECEIPT" }], ucis: [{ subject: P, uci: "9999-9999" }], version: p?.version }, officer);
ok("setup: the submission is recorded, so the filing takes a fee receipt", rec.status === 200, rec.body);

const whole = textPdf(["SYNTHETIC SPECIMEN - MADE-UP TEST DOCUMENT - NOT VALID", "IRCC Transaction Approved page (Sample)"]);
const count = () => Number(sql(`select count(*) from fee_receipt_file where case_id='${c.id}'`));
const send = (bytes: Buffer, name: string) => sendFile(`/runtime/filings/${fP}/record/fee-receipt`, bytes, name, officer);
const detail = (u: { body: unknown }) => String((u.body as { detail?: string } | null)?.detail ?? "");
for (const [label, bytes] of [
  ["a PDF cut short (60% of a whole one)", whole.subarray(0, Math.floor(whole.length * 0.6))],
  ["a PDF header with nothing behind it", Buffer.from("%PDF-1.4\n% nothing else\n%%EOF\n", "latin1")],
  ["a PNG cut off after its signature, named .png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])],
] as [string, Buffer][]) {
  const before = count(); const u = await send(bytes, label.includes("PNG") ? "approved.png" : "approved.pdf");
  ok(`QA-520 fail-today: the fee-receipt door refuses ${label} in words (4xx, "damaged"/"could not be read"), nothing stored`, u.status >= 400 && u.status < 500 && /damaged|could not be read/i.test(detail(u)) && count() === before, { status: u.status, detail: detail(u), stored: count() - before });
}
const before = count(); const u = await send(whole, "approved.pdf");
ok("QA-520 pass: a whole PDF is still stored as the fee receipt", u.status === 200 && count() === before + 1, { status: u.status, detail: detail(u) });
summary();
