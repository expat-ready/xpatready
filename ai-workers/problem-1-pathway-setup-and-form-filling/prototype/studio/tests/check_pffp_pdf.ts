// PF-Fp part 1 (P-630; tech gate entry 17): Word to PDF. DocumentPdfPort's fake and GotenbergPdf keep one shared
// contract; a pass and a fail per condition of gate entry 17 (C1–C5) and the text check (C6). In CI GotenbergPdf runs
// against a stand-in of Gotenberg's one route on 127.0.0.1 (no container, condition 4). With GOTENBERG_URL set (the
// pinned container started as PF-8's stack line will start it) the live part runs too: the contract on the real
// converter, the Chromium routes answering 404, and a sample Word file's text read back from the PDF with pdftotext.
// No database, no browser, no model call (US$0).
//   tsx studio/tests/check_pffp_pdf.ts
//   GOTENBERG_URL=http://<container>:3000 tsx studio/tests/check_pffp_pdf.ts
import { spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDocx } from "../api/src/front-office/retainers/docx.ts";
import { GOTENBERG_FLAGS, GOTENBERG_IMAGE, GOTENBERG_ROUTE, GOTENBERG_VERSION, GotenbergPdf, gotenbergBase, isPinned, pdfFromEnv } from "../api/src/front-office/render/gotenberg.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { documentPdfPortContract, type PdfHarness } from "../ports/contracts/document-pdf-port.contract.ts";
import { DOCX } from "../api/src/front-office/retainers/docx.ts";
import { PDF, PDF_MAX_INPUT_BYTES, fakePdf, minimalPdf, withPdf, type DocumentPdfPort } from "../ports/render.ts";

const STUDIO = join(import.meta.dirname, "..");
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const LINES = ["# Retainer agreement (Sample)", "Client A engages Sample Firm for a work permit application.", "Fee: CAD 1,500 (Sample)."];
const DOC = buildDocx(LINES);
/** A zip header and bytes no converter can read. */
const CORRUPT = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode("UNREADABLE ".repeat(60))]);
const counting = (f: typeof fetch, seen: string[]): typeof fetch => (input, init) => { seen.push(String(input instanceof Request ? input.url : input)); return f(input, init); };

// ---------------------------------------------------------------------------------- the stand-in of Gotenberg's route
type Stand = { url: string; paths: string[]; bodies: string[]; delayMs: number; server: Server };
async function standIn(): Promise<Stand> {
  const s = { paths: [] as string[], bodies: [] as string[], delayMs: 0 } as Stand;
  s.server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      s.paths.push(`${req.method} ${req.url}`);
      const body = Buffer.concat(chunks).toString("latin1");
      s.bodies.push(body);
      const answer = () => {
        if (req.method !== "POST" || req.url !== GOTENBERG_ROUTE) { res.writeHead(404).end("Not Found"); return; }
        if (!/name="files"; filename="document\.docx"/.test(body)) { res.writeHead(400).end("no file"); return; }
        if (body.includes("UNREADABLE")) { res.writeHead(400).end("LibreOffice failed to process a document"); return; }
        res.writeHead(200, { "content-type": PDF }).end(Buffer.from(minimalPdf(["stand-in PDF"])));
      };
      if (s.delayMs) setTimeout(answer, s.delayMs).unref(); else answer();
    });
  });
  await new Promise<void>((r) => s.server.listen(0, "127.0.0.1", r));
  s.url = `http://127.0.0.1:${(s.server.address() as { port: number }).port}`;
  return s;
}
const stands: Stand[] = [];
async function gotenbergHarness(baseUrl?: string): Promise<PdfHarness> {
  let url = baseUrl, stand: Stand | undefined;
  if (!url) { stand = await standIn(); stands.push(stand); url = stand.url; }
  const seen: string[] = [];
  const pdf = new GotenbergPdf({ baseUrl: url, fetch: counting(fetch, seen) });
  let slow: DocumentPdfPort, slowLimitMs: number;
  if (stand) { const slowStand = await standIn(); stands.push(slowStand); slowStand.delayMs = 3000; slowLimitMs = 300; slow = new GotenbergPdf({ baseUrl: slowStand.url, timeoutMs: slowLimitMs, fetch: counting(fetch, []) }); }
  else { slowLimitMs = 5; slow = new GotenbergPdf({ baseUrl: url, timeoutMs: slowLimitMs }); }   // no conversion answers in 5 ms
  return { pdf, slow, slowLimitMs, docx: DOC, corrupt: CORRUPT, sent: () => seen.length };
}
const fakeHarness = (): PdfHarness => { const pdf = fakePdf(); return { pdf, slow: fakePdf({ timeoutMs: 50, delayMs: 5000 }), slowLimitMs: 50, docx: DOC, corrupt: CORRUPT, sent: () => pdf.calls }; };

// ------------------------------------------------------------------------------------------------- the shared contract
const CASES = documentPdfPortContract(fakeHarness).map((c) => c.name);
const fakeRun = await runContract(documentPdfPortContract, "fakePdf", fakeHarness, ok);
const realRun = await runContract(documentPdfPortContract, "GotenbergPdf", () => gotenbergHarness(), ok);
ok("PF-Fp contract: the fake and GotenbergPdf (stand-in) keep every case", fakeRun.failed.length === 0 && realRun.failed.length === 0 && realRun.passed.length === CASES.length, { fakeRun, realRun });
// Fails: adapters that break a rule fail their case.
const wrap = (f: (h: PdfHarness) => Partial<PdfHarness>) => () => { const h = fakeHarness(); return { ...h, ...f(h) }; };
const thrower = await runContract(documentPdfPortContract, "throws on a failure", wrap((h) => ({ pdf: { toPdf: async (d) => { const r = await h.pdf.toPdf(d); if (!r.pdf) throw new Error(r.failure); return r; } } })), null);
ok("PF-Fp contract fail: an adapter that throws on a failure fails the TOO_LARGE, NOT_DOCX and FAILED cases", [1, 2, 3].every((i) => thrower.failed.includes(CASES[i])), thrower);
const sender = (() => { let n = 0; return wrap(() => ({ pdf: { toPdf: async (d) => { n++; return fakePdf({ maxBytes: Infinity }).toPdf(d); } }, sent: () => n })); })();
const senderRun = await runContract(documentPdfPortContract, "sends before checking", sender, null);
ok("PF-Fp contract fail: an adapter that sends a file before the size and zip checks fails those cases", senderRun.failed.includes(CASES[1]) && senderRun.failed.includes(CASES[2]), senderRun);
const waiter = await runContract(documentPdfPortContract, "no time limit", wrap(() => ({ slow: fakePdf({ timeoutMs: 60_000, delayMs: 3000 }), slowLimitMs: 50 })), null);
ok("PF-Fp contract fail: an adapter without a time limit fails the TIMEOUT case", waiter.failed.includes(CASES[4]), waiter);

// ------------------------------------------------------------------------------- C1: only the LibreOffice route
const s1 = await standIn(); stands.push(s1);
await new GotenbergPdf({ baseUrl: s1.url }).toPdf(DOC);
await new GotenbergPdf({ baseUrl: `${s1.url}/` }).toPdf(DOC);
ok("PF-Fp C1 pass: the adapter calls only POST /forms/libreoffice/convert, with the file as document.docx", s1.paths.length === 2 && s1.paths.every((p) => p === `POST ${GOTENBERG_ROUTE}`) && s1.bodies.every((b) => b.includes('filename="document.docx"') && b.includes(DOCX)), s1.paths);
ok("PF-Fp C1 pass: the container's flags switch off the Chromium routes, webhooks and downloadFrom", ["--chromium-disable-routes=true", "--webhook-disable=true", "--api-disable-download-from=true"].every((f) => (GOTENBERG_FLAGS as readonly string[]).includes(f)));
const pathRefused = ["/forms/chromium/convert/url", "/forms/libreoffice", "/?route=chromium", "/#x"].every((p) => { try { gotenbergBase(`http://127.0.0.1:3000${p}`); return false; } catch { return true; } });
ok("PF-Fp C1 fail: a base URL carrying a path, query or fragment (another route) is refused", pathRefused);
const s1b = await standIn(); stands.push(s1b);
const redirect = createServer((_q, r) => { r.writeHead(307, { location: `${s1b.url}${GOTENBERG_ROUTE}` }).end(); });
await new Promise<void>((r) => redirect.listen(0, "127.0.0.1", r));
const rr = await new GotenbergPdf({ baseUrl: `http://127.0.0.1:${(redirect.address() as { port: number }).port}` }).toPdf(DOC);
redirect.close();
ok("PF-Fp C1 fail: a redirect is never followed (no PDF, nothing reaches another address)", rr.failure === "FAILED" && s1b.paths.length === 0, { rr: rr.failure, paths: s1b.paths });

// ------------------------------------------------------------------------------------------------- C2: no secrets
ok("PF-Fp C2 pass: a host and port is taken", gotenbergBase("http://gotenberg:3000").host === "gotenberg:3000");
const secretRefused = ["http://user:pw@gotenberg:3000", "http://token@gotenberg:3000", "file:///etc/passwd", "ftp://gotenberg"].every((u) => { try { gotenbergBase(u); return false; } catch { return true; } });
ok("PF-Fp C2 fail: a URL with a user name or password, or not http(s), is refused (no secrets; network rules are PF-8's stack line)", secretRefused);

// ------------------------------------------------------------------------------- C3: the cap, the time limit, .docx kept
const atCap = new Uint8Array(PDF_MAX_INPUT_BYTES); atCap.set(DOC);
const capFake = fakePdf({ unreadable: () => false });
ok("PF-Fp C3 pass: a Word file of exactly 10 MB is sent", (await capFake.toPdf(atCap)).failure === null && capFake.calls === 1);
const s3 = await standIn(); stands.push(s3);
const big = new Uint8Array(PDF_MAX_INPUT_BYTES + 1); big.set(DOC);
const r3 = await new GotenbergPdf({ baseUrl: s3.url }).toPdf(big);
ok("PF-Fp C3 fail: 10 MB + 1 byte is refused before sending (TOO_LARGE; the stand-in saw no request)", r3.failure === "TOO_LARGE" && s3.paths.length === 0, { r3: r3.failure, paths: s3.paths.length });
const s3t = await standIn(); stands.push(s3t); s3t.delayMs = 2000;
const t0 = Date.now(), r3t = await new GotenbergPdf({ baseUrl: s3t.url, timeoutMs: 200 }).toPdf(DOC), took = Date.now() - t0;
const kept = await withPdf({ bytes: DOC, contentType: DOCX }, new GotenbergPdf({ baseUrl: s3t.url, timeoutMs: 200 }));
ok("PF-Fp C3 fail: a timeout answers TIMEOUT within the limit, and withPdf still offers the .docx", r3t.failure === "TIMEOUT" && took < 1500 && kept.pdf === null && kept.failure === "TIMEOUT" && kept.docx.bytes === DOC, { r3t: r3t.failure, took, kept: kept.failure });
const ok3 = await withPdf({ bytes: DOC, contentType: DOCX }, fakePdf());
ok("PF-Fp C3 pass: withPdf offers both when the conversion works", ok3.pdf?.contentType === PDF && ok3.docx.bytes === DOC && ok3.failure === null);
const unreachable = await new GotenbergPdf({ baseUrl: "http://127.0.0.1:1" }).toPdf(DOC);
const boom = await withPdf({ bytes: DOC, contentType: DOCX }, { toPdf: async () => { throw new Error("adapter bug"); } });
ok("PF-Fp C3 fail: an unreachable converter, or an adapter that throws, still leaves the .docx (FAILED)", unreachable.failure === "FAILED" && boom.pdf === null && boom.failure === "FAILED" && boom.docx.bytes === DOC, { unreachable, boom: boom.failure });
const notPdf = createServer((_q, r) => { r.writeHead(200, { "content-type": PDF }).end("<html>not a pdf</html>"); });
await new Promise<void>((r) => notPdf.listen(0, "127.0.0.1", r));
const rnp = await new GotenbergPdf({ baseUrl: `http://127.0.0.1:${(notPdf.address() as { port: number }).port}` }).toPdf(DOC);
notPdf.close();
ok("PF-Fp C3 fail: an answer that is not a PDF is FAILED, never offered", rnp.failure === "FAILED" && rnp.pdf === null, rnp);

// ------------------------------------------------------------------------------------------- C4: CI and the demo fake
const def = pdfFromEnv({}), ci = pdfFromEnv({ CI: "true" });
ok("PF-Fp C4 pass: with no setting, and under CI, the port is the fake", !(def instanceof GotenbergPdf) && !(ci instanceof GotenbergPdf) && (await def.toPdf(DOC)).failure === null);
ok("PF-Fp C4 pass: DOCUMENT_PDF=gotenberg with GOTENBERG_URL outside CI is GotenbergPdf", pdfFromEnv({ DOCUMENT_PDF: "gotenberg", GOTENBERG_URL: "http://gotenberg:3000" }) instanceof GotenbergPdf);
const envRefused = [{ CI: "true", DOCUMENT_PDF: "gotenberg", GOTENBERG_URL: "http://gotenberg:3000" }, { DOCUMENT_PDF: "gotenberg" }, { DOCUMENT_PDF: "libreoffice" }].every((env) => { try { pdfFromEnv(env); return false; } catch { return true; } });
ok("PF-Fp C4 fail: Gotenberg under CI, without GOTENBERG_URL, or an unknown DOCUMENT_PDF is refused", envRefused);
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return n === "node_modules" ? [] : statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|sh|mjs|ya?ml)$/.test(n) ? [p] : []; });
const users = [...walk(join(STUDIO, "api/src")), ...walk(join(STUDIO, "web")), join(STUDIO, "start.sh")].filter((p) => { try { const t = readFileSync(p, "utf8"); return /render\/gotenberg|DOCUMENT_PDF|GOTENBERG_URL/.test(t) && !p.endsWith("render/gotenberg.ts"); } catch { return false; } });
ok("PF-Fp C4 pass: no app file and not start.sh wires Gotenberg (the demo runs no container; FO-5p part 2 wires pdfFromEnv)", users.length === 0, users);

// ------------------------------------------------------------------------------------------------------ C5: pinned
ok(`PF-Fp C5 pass: the image is ${GOTENBERG_VERSION}, pinned by digest`, isPinned(GOTENBERG_IMAGE) && GOTENBERG_IMAGE.startsWith(`gotenberg/gotenberg:${GOTENBERG_VERSION}@sha256:53073e798c8ef39ea2187e44cb67bab77894ea2509100b94c4fe3b461f7b2996`));
ok("PF-Fp C5 fail: a tag without a digest, latest, or a short digest is not pinned", !isPinned("gotenberg/gotenberg:8.40.0") && !isPinned("gotenberg/gotenberg:latest") && !isPinned("gotenberg/gotenberg@sha256:53073e798c8ef39ea2187e44cb67bab77894ea2509100b94c4fe3b461f7b2996") && !isPinned("gotenberg/gotenberg:8.40.0@sha256:5307"));

// ----------------------------------------------------------------------------------------------------- the ports rule
const foreign = (t: string) => [...t.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1] ?? m[2]).filter((s) => s !== "zod" && !/^\.\.?\/[a-z0-9-]+(\.contract)?\.ts$/.test(s));
const imports = ["ports/render.ts", "ports/contracts/document-pdf-port.contract.ts"].flatMap((f) => foreign(readFileSync(join(STUDIO, f), "utf8")));
ok("PF-Fp ports rule: the port and its contract import only zod and ports/ files", imports.length === 0, imports);
const guard = spawnSync(process.execPath, [join(STUDIO, "tools/check-port-contracts.mjs")], { encoding: "utf8" });
ok("PF-Fp guard: tools/check-port-contracts.mjs exits 0", guard.status === 0, guard.stdout + guard.stderr);
const fakeOut = (await fakePdf().toPdf(DOC)).pdf!.bytes, again = (await fakePdf().toPdf(DOC)).pdf!.bytes, other = (await fakePdf().toPdf(buildDocx(["Client B"]))).pdf!.bytes;
ok("PF-Fp fake: the same Word file gives the same PDF, another file another one", Buffer.from(fakeOut).equals(Buffer.from(again)) && !Buffer.from(fakeOut).equals(Buffer.from(other)));

// ------------------------------------------------------------------------------------- the live part (the container)
const LIVE = process.env.GOTENBERG_URL;
if (!LIVE) console.log("NOT RUN  PF-Fp live: GOTENBERG_URL is not set (the container is PF-8's stack line; CI runs no container, condition 4). Never counted green.");
else {
  const live = await runContract(documentPdfPortContract, "GotenbergPdf (live 8.40.0)", () => gotenbergHarness(LIVE), ok);
  ok("PF-Fp live: the pinned container keeps the contract", live.failed.length === 0, live);
  const routes = ["/forms/chromium/convert/url", "/forms/chromium/convert/html", "/forms/chromium/convert/markdown", "/forms/chromium/screenshot/url"];
  const codes = await Promise.all(routes.map(async (p) => { const f = new FormData(); f.append("url", "http://127.0.0.1/"); return (await fetch(new URL(p, LIVE), { method: "POST", body: f })).status; }));
  ok("PF-Fp C1 fail (live): every Chromium route answers 404 from the container", codes.every((c) => c === 404), Object.fromEntries(routes.map((p, i) => [p, codes[i]])));
  const dl = new FormData(); dl.append("downloadFrom", JSON.stringify([{ url: "http://127.0.0.1:9/x.docx" }]));
  const dlr = await fetch(new URL(GOTENBERG_ROUTE, LIVE), { method: "POST", body: dl });
  ok("PF-Fp C1 fail (live): downloadFrom is switched off (no PDF from a URL)", dlr.status !== 200, dlr.status);
  const r6 = await new GotenbergPdf({ baseUrl: LIVE }).toPdf(DOC);
  const dir = mkdtempSync(join(tmpdir(), "pffp-")), file = join(dir, "out.pdf");
  let text = "";
  if (r6.pdf) { writeFileSync(file, r6.pdf.bytes); text = spawnSync("pdftotext", [file, "-"], { encoding: "utf8" }).stdout ?? ""; }
  rmSync(dir, { recursive: true, force: true });
  const flat = text.replace(/\s+/g, " ");
  ok("PF-Fp C6 pass (live): a sample Word file converts with its text intact (pdftotext reads every line back)", r6.pdf && LINES.every((l) => flat.includes(l.replace(/^# /, ""))), { failure: r6.failure, text: flat.slice(0, 300) });
  ok("PF-Fp C6 fail (live): a line that is not in the Word file is not in the PDF", !!text && !flat.includes("Client B engages"));
}

for (const s of stands) s.server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
