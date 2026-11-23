// CS-D5 part 1 (R1.68, map row 68; concept screens/CS-D5/concept.md r2.1, approved on #3005; brief
// design/briefs/CS-D5.md as corrected on #3024): a staff member previews a client's uploaded case document through a
// short-lived, single-use, nameless link. Requirement text: AG-9-24 (preview through a short-lived signed GET; every
// preview audited), AG-9-16 (signed, never public), AG-9-53 (only those who can see the case), AG-9-20 / AG-9-55 (never an
// unscanned file), AG-9-32 (every read leaves a record). Each rule has a passing and a failing case:
//   DW1  a clean PDF and a clean PNG get a link and their bytes with the download's four headers; a file still being
//        checked → 409 "Checking for viruses…", a removed one → 410 "Removed — infected file", no link made
//   DW2  the link answers 404 after 300 s (in-process, fixed clock), for another firm, for another staff member of the
//        same firm and with one character altered; 200 inside its life for its own person
//   DW3  making a link writes one "previewed" audit line naming the document; a second fetch of the same link → 404 and
//        no line (single use); a refused link (404, 403, 409, 410) writes none
//   DW4  someone who cannot see the case gets 404 in the download's words; a client gets the download's status (403)
//   DW5  the URL and the token's readable part hold no firm name, no person's name and no file name
// Synthetic Sample documents only. No model call (US$0).
//   zsh studio/tools/isolated.sh runtime_csd5 4462 start && tsx studio/tests/check_csd5_preview.ts 4462 xr_studio_runtime_csd5
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { CLIENT, FAMILY, OFFICER, PORT, DB, call, firms, main, ok, openCase, sql } from "../acceptance/lib/m3.ts";
import { textPdf, upload } from "../acceptance/lib/fixtures.ts";
import { PreviewLinks, PREVIEW_SECONDS } from "../api/src/case-preview-links.ts";

const studio = join(import.meta.dirname, "..");
const vvOf = () => sql("select id from combination where combination_key='vv.single'") || null;
if (!vvOf()) for (const f of ["tests/runtime/setup_visitor_visa.ts", "acceptance/lib/setup_vv_m3.ts"])
  try { execFileSync(join(studio, "node_modules", ".bin", "tsx"), ["--tsconfig", join(studio, "api", "tsconfig.json"), join(studio, f), String(PORT), DB], { stdio: ["ignore", "ignore", "inherit"], timeout: 900_000 }); }
  catch { /* the setups exit 1 on their own known gaps; what this check needs is asked below */ }

const OTHER_FIRM = "user-S";   // the Sample solo firm's one person (acceptance/lib/m3.ts FIRM_READERS.solo)
const UNKNOWN = "00000000-0000-4000-8000-000000000000";
// A PNG with its header (IHDR, 1 x 1), as PF-F4's check reads an image's size (CS-D1t).
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89]);

type Link = { url: string; expires_at: string; media_type: string; file_name: string; size_bytes: number; uploaded_at: string; scan: string; contains_scripts: boolean };
const link = (doc: string, actor: string) => call("POST", `/runtime/documents/${doc}/preview-link`, {}, actor);
const fetchBytes = async (url: string, actor: string) => {
  const res = await fetch(`http://127.0.0.1:${PORT}${url}`, { headers: { "x-actor": actor } });
  const h = (n: string) => res.headers.get(n) ?? "";
  return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()), type: h("content-type"), nosniff: h("x-content-type-options"), csp: h("content-security-policy"), disposition: h("content-disposition"), cache: h("cache-control") };
};
const previewed = (doc: string) => Number(sql(`select count(*) from audit_event where action='previewed' and entity='case document' and entity_key='${doc}'`) ?? "-1");

await main("CS-D5 preview", "short-lived single-use nameless link, the download's headers, one audit line per opening, the case's reach (US$0)", async () => {
  const vv = vvOf();
  ok("setup: the Visitor visa is released on this copy", !!vv);
  const c = await openCase(vv!, FAMILY);
  const f = await firms();
  const colleague = [f.rep, f.rep2, f.admin].find((a) => a && a !== OFFICER) ?? null;
  ok("setup: a second staff member of the Sample firm exists (for DW2)", !!colleague, f.firm?.users?.length);

  const name = `passport-scan-sample-client-a-${Date.now().toString(36)}.pdf`;
  let r = await upload(PORT, `/runtime/cases/${c.id}/documents`, textPdf(["Sample synthetic passport scan"]), name, OFFICER, { subjectId: c.caseSubject, documentType: "letter_of_invitation" });
  const pdfDoc = r.body?.document?.id as string;
  ok("setup: a Sample PDF is stored on the case", r.status === 201 && !!pdfDoc, r.status);
  r = await upload(PORT, `/runtime/cases/${c.id}/documents`, PNG, "photo-sample.png", OFFICER, { subjectId: c.caseSubject, documentType: "letter_of_invitation" });
  const pngDoc = r.body?.document?.id as string;
  ok("setup: a Sample PNG is stored on the case", r.status === 201 && !!pngDoc, r.status);

  // ---- DW1 a clean file: link and bytes with the download's four headers
  const before = previewed(pdfDoc);
  r = await link(pdfDoc, OFFICER);
  const l = r.body as Link;
  ok("CS-D5 DW1 pass: the officer gets a link for the PDF, with its type, name, size, upload date and its scan state said as it is (NOT_SCANNED while case files have no scan, never a false CLEAN)", r.status === 200 && l.media_type === "application/pdf" && l.file_name === name && l.size_bytes > 0 && !!l.uploaded_at && l.scan === "NOT_SCANNED" && typeof l.contains_scripts === "boolean", r.body);
  let b = await fetchBytes(l.url, OFFICER);
  ok("CS-D5 DW1 pass: its bytes come inline with nosniff, the CSP sandbox and no-store", b.status === 200 && b.type.startsWith("application/pdf") && b.nosniff === "nosniff" && /sandbox/.test(b.csp) && /default-src 'none'/.test(b.csp) && b.disposition.startsWith("inline") && /no-store/.test(b.cache) && b.bytes.subarray(0, 5).toString() === "%PDF-", [b.status, b.type, b.csp, b.disposition, b.cache]);
  const png = (await link(pngDoc, OFFICER)).body as Link;
  const pb = await fetchBytes(png?.url ?? "/", OFFICER);
  ok("CS-D5 DW1 pass: a clean PNG gets a link and its bytes as image/png", png?.media_type === "image/png" && pb.status === 200 && pb.type.startsWith("image/png") && pb.bytes[1] === 0x50, [png, pb.status]);
  // DW1 scan states: waiting on the tech lead's choice (PR question). Case files have no scan state on main (PF-F3 not
  // built); this check names the cases so they cannot be skipped silently.
  ok("CS-D5 DW1 fail: a file still being checked → 409 \"Checking for viruses…\", no link (needs a scan state on main: PF-F3)", false, "waiting: no scan state on main");
  ok("CS-D5 DW1 fail: a removed file → 410 \"Removed — infected file\", no link (needs a scan state on main: PF-F3)", false, "waiting: no scan state on main");

  // ---- DW3 one line per opening; single use
  ok("CS-D5 DW3 pass: making the link wrote one \"previewed\" line for the document", previewed(pdfDoc) === before + 1, [before, previewed(pdfDoc)]);
  b = await fetchBytes(l.url, OFFICER);
  ok("CS-D5 DW3 fail: a second fetch of the same link → 404 (single use) and no second line", b.status === 404 && previewed(pdfDoc) === before + 1, [b.status, previewed(pdfDoc)]);

  // ---- DW2 the link is the asker's, unaltered
  const fresh = ((await link(pdfDoc, OFFICER)).body as Link).url;
  b = await fetchBytes(fresh, OTHER_FIRM);
  ok("CS-D5 DW2 fail: another firm's person gets 404 for the link", b.status === 404, b.status);
  if (colleague) { b = await fetchBytes(fresh, colleague); ok("CS-D5 DW2 fail: another staff member of the same firm gets 404 for the link", b.status === 404, b.status); }
  const altered = fresh.replace(/.$/, (ch) => (ch === "A" ? "B" : "A"));
  b = await fetchBytes(altered, OFFICER);
  ok("CS-D5 DW2 fail: the link with one character altered → 404", b.status === 404, b.status);
  b = await fetchBytes(fresh, OFFICER);
  ok("CS-D5 DW2 pass: inside its life the link answers 200 for its own person (after the refused tries)", b.status === 200, b.status);
  const signer = new PreviewLinks("csd5-check-key"), t0 = Date.parse("2026-11-23T10:00:00Z");
  const tok = signer.sign("firm-a", "user-O", pdfDoc, t0).token;
  ok("CS-D5 DW2 pass: a token checks inside its 300 s", PREVIEW_SECONDS === 300 && "document" in signer.check(tok, "firm-a", "user-O", t0 + 299_000), PREVIEW_SECONDS);
  ok("CS-D5 DW2 fail: the same token is refused at 300 s (expired)", (signer.check(tok, "firm-a", "user-O", t0 + 300_000) as { refused?: string }).refused === "expired");

  // ---- DW4 the case's reach, the download's words
  const lines0 = previewed(pdfDoc);
  const other = await link(pdfDoc, OTHER_FIRM), none = await link(UNKNOWN, OTHER_FIRM);
  ok("CS-D5 DW4 fail: someone who cannot see the case gets 404 in the same words as an unknown id", other.status === 404 && none.status === 404 && JSON.stringify(other.body?.detail) === JSON.stringify(none.body?.detail), [other.status, none.status]);
  const dl = await fetchBytes(`/api/runtime/documents/${pdfDoc}/file`, CLIENT);
  const byClient = await link(pdfDoc, CLIENT);
  ok("CS-D5 DW4 fail: a client gets the download's status for a preview (measured, not changed)", byClient.status === dl.status && byClient.status === 403, [byClient.status, dl.status]);
  ok("CS-D5 DW3 fail: refused links (404, 403) wrote no line", previewed(pdfDoc) === lines0, [lines0, previewed(pdfDoc)]);

  // ---- DW5 nothing that names anyone in the URL
  const u = ((await link(pdfDoc, OFFICER)).body as Link).url, readable = Buffer.from(u.split("/").pop()!.split(".")[0] ?? "", "base64url").toString("utf8");
  const names = [f.firm?.name, "Sample Client A", "passport-scan", name, c.id].filter(Boolean) as string[];
  ok("CS-D5 DW5 pass: the link is under /api/runtime/document-previews/ and names no firm, person, file or case", u.startsWith("/api/runtime/document-previews/") && names.every((n) => !u.includes(n) && !readable.includes(n)), [u.slice(0, 60), readable.slice(0, 80)]);
});
