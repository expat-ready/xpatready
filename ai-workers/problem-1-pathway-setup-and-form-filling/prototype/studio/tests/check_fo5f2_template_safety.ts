// FO-5f2 (rows rev 16.15; P-502 ruling; PR #1791's screens/FO-5f/fo5f2-handover.md): a firm's Word template can never
// take down the API, and no unknown placeholder prints blank. DW1-DW7, each with a passing and a failing case; DW8 is
// the breaker's run over HTTP. Every way in from the hand-over is built here as a .docx in memory. A small HTTP server in
// this process stands in for "a concurrent page read": it must keep answering while the worker is busy or dies. No
// database, no browser, no model call (US$0).
//   tsx studio/tests/check_fo5f2_template_safety.ts
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { PACKAGE_PART_MAX, UnreadableDocx, WORKER_TIMEOUT_MS, buildDocx, placeholdersOf, renderDocx, workerTimeout } from "../api/src/front-office/retainers/docx.ts";
import { checkPlaceholders } from "../api/src/front-office/retainers/placeholders.ts";

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean, detail?: unknown) => {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
};

const REL = "application/vnd.openxmlformats-package.relationships+xml", WML = "application/vnd.openxmlformats-officedocument.wordprocessingml.";
const HEADER = `${WML}header+xml`;
const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`;
const P = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const HDR = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?><w:hdr ${NS}>${inner}</w:hdr>`;
const COVER = (t: string) => `<?xml version="1.0"?><CoverPageProperties xmlns="http://schemas.microsoft.com/office/2006/coverPageProps"><PublishDate/><Abstract>${t}</Abstract></CoverPageProperties>`;
const FLOOD = "{".repeat(1_500_000);
const ov = (part: string, type: string, q = '"') => `<Override PartName=${q}/${part}${q} ContentType=${q}${type}${q}/>`;
const CT = (more: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="${REL}"/><Default Extension="xml" ContentType="application/xml"/>${ov("word/document.xml", `${WML}document.main+xml`)}${more}</Types>`;

/** A .docx: the body says {client.name}; `parts` are added, `types` go into [Content_Types].xml (or `ct` replaces it). */
function pkg(parts: Record<string, string>, types = "", ct?: string): Uint8Array {
  const z = new PizZip(buildDocx(["{client.name}"]));
  z.file("[Content_Types].xml", ct ?? CT(types));
  for (const [k, v] of Object.entries(parts)) z.file(k, v);
  return new Uint8Array(z.generate({ type: "uint8array", compression: "DEFLATE" }));
}
/** The refusal code (or "accepted") and the time it took. */
async function attempt(run: () => Promise<unknown>): Promise<{ code: string; ms: number; value?: unknown }> {
  const t = Date.now();
  try { const value = await run(); return { code: "accepted", ms: Date.now() - t, value }; }
  catch (e) { return { code: e instanceof UnreadableDocx ? e.code ?? "UNREADABLE_FILE" : `THREW ${String(e).slice(0, 120)}`, ms: Date.now() - t }; }
}
const unknownOf = async (b: Uint8Array) => checkPlaceholders(await placeholdersOf(b)).unknown;

// The concurrent page read: every 50 ms a request to this process's own server; the slowest answer is recorded.
const server = createServer((_q, r) => r.end("ok"));
await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
const port = (server.address() as { port: number }).port;
async function whileReading<T>(run: () => Promise<T>): Promise<{ result: T; slowest: number; reads: number }> {
  let slowest = 0, reads = 0, stop = false;
  const reader = (async () => {
    while (!stop) {
      const t = Date.now();
      const body = await fetch(`http://127.0.0.1:${port}/`).then((r) => r.text());
      if (body === "ok") reads++;
      slowest = Math.max(slowest, Date.now() - t);
      await new Promise((r) => setTimeout(r, 50));
    }
  })();
  const result = await run();
  stop = true; await reader;
  return { result, slowest, reads };
}

try {
  // ------------------------------------------------------------------ DW1: every way in from the hand-over → 422
  const header = (t: string) => HDR(P(t));
  const WAYS: [string, Record<string, (t: string) => string>, string, string?][] = [
    ["a header named word/h.rels", { "word/h.rels": header }, ov("word/h.rels", HEADER)],
    ["a header named word/_rels/x.rels", { "word/_rels/x.rels": header }, ov("word/_rels/x.rels", HEADER)],
    ["a header named word/[Content_Types].xml", { "word/[Content_Types].xml": header }, ov("word/[Content_Types].xml", HEADER)],
    ["customXml typed core-properties", { "customXml/item2.xml": (t) => `<cp:coreProperties xmlns:cp="c" xmlns:dc="d"><dc:title>${t}</dc:title></cp:coreProperties>` }, ov("customXml/item2.xml", "application/vnd.openxmlformats-package.core-properties+xml")],
    ["customXml typed diagramData", { "customXml/item2.xml": (t) => `<dgm:dataModel xmlns:dgm="d" xmlns:a="a"><a:t>${t}</a:t></dgm:dataModel>` }, ov("customXml/item2.xml", "application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml")],
    ["core-properties outside docProps/ (props/core.xml)", { "props/core.xml": (t) => `<cp:coreProperties xmlns:cp="c" xmlns:dc="d"><dc:title>${t}</dc:title></cp:coreProperties>` }, ov("props/core.xml", "application/vnd.openxmlformats-package.core-properties+xml")],
    ["round 3 way 1: Default Extension \"in\" on word/h.bin", { "word/h.bin": header }, `<Default Extension="in" ContentType="${HEADER}"/>`],
    ["round 3 way 2: Default Extension \"\"", { "word/h.bin": header }, `<Default Extension="" ContentType="${HEADER}"/>`],
    ["round 3 way 3: word/hdr with no dot", { "word/hdr": header }, ov("word/hdr", HEADER)],
    ["round 3 way 4: a single-quoted Override on word/x.bin", { "word/x.bin": header }, ov("word/x.bin", HEADER, "'")],
    ["round 3 way 5: a header under word/charts/", { "word/charts/header1.xml": header }, ov("word/charts/header1.xml", HEADER)],
    ["round 3 way 6: a header under customXml/", { "customXml/header1.xml": header }, ov("customXml/header1.xml", HEADER)],
    ["an entity-escaped PartName", { "word/header1.xml": header }, `<Override PartName="/word/header&#49;.xml" ContentType="${HEADER}"/>`],
    ["a comment inside [Content_Types].xml", { "word/h.bin": header }, `<!-- x -->${ov("word/h.bin", HEADER)}`],
  ];
  for (const [where, parts, types] of WAYS) {
    for (const [kind, text] of [["1.5 M lone {", FLOOD], ["{client.passport}", "Passport {client.passport}"]] as const) {
      const files = Object.fromEntries(Object.entries(parts).map(([k, f]) => [k, f(text)]));
      const { result, slowest } = await whileReading(() => attempt(() => placeholdersOf(pkg(files, types))));
      // A .rels or [Content_Types].xml name over 256 KB is refused by the size cap first (N-1), before the allowlist.
      const want = kind !== "{client.passport}" && Object.keys(parts).some((k) => /\.rels$|Content_Types/.test(k)) ? /^TOO_COMPLEX$/ : /^PARTS_NOT_ALLOWED$/;
      ok(`FO-5f2 DW1 fail: ${where} with ${kind} → 422 ${want.source.slice(1, -1)}, the page read answering (slowest ${slowest} ms)`, want.test(result.code) && slowest < 1000, result);
    }
  }
  const std = await attempt(() => placeholdersOf(pkg({ "word/header1.xml": header("Retainer for {client.name}") }, ov("word/header1.xml", HEADER))));
  ok("FO-5f2 DW1 pass: the same header in its standard place (word/header1.xml) is accepted and read", std.code === "accepted" && (std.value as string[]).includes("client.name"), std);
  ok("FO-5f2 DW1 fail: a .rels-named header is refused on render too (every way in)", (await attempt(() => renderDocx(pkg({ "word/h.rels": header("x") }, ov("word/h.rels", HEADER)), {}))).code === "PARTS_NOT_ALLOWED");

  // ------------------------------------------------------------------ DW2: oversized package parts → refused before any parse
  const twoM = CT("").replace("</Types>", `${"<a/>".repeat(2_000_000)}</Types>`);
  const big = { ct: twoM, packed: pkg({}, "", twoM).length };
  const c2 = await attempt(() => placeholdersOf(pkg({}, "", big.ct)));
  ok(`FO-5f2 DW2 fail: a ${Math.round(big.packed / 1024)} KB file whose [Content_Types].xml is 2 M <a/> (8 MB) → TOO_COMPLEX in under 1 s`, big.packed < 20_000 && c2.code === "TOO_COMPLEX" && c2.ms < 1000, { ...c2, packed: big.packed });
  const huge = CT("").replace("</Types>", `<!--${"x".repeat(25 * 1024 * 1024)}--></Types>`);
  const c25 = await attempt(() => placeholdersOf(pkg({}, "", huge)));
  ok("FO-5f2 DW2 fail: a 25 MB [Content_Types].xml → TOO_COMPLEX in under 1 s", c25.code === "TOO_COMPLEX" && c25.ms < 1000, c25);
  const rels = await attempt(() => placeholdersOf(pkg({ "_rels/.rels": `<?xml version="1.0"?><Relationships xmlns="r">${"<a/>".repeat(PACKAGE_PART_MAX / 4)}</Relationships>` })));
  ok("FO-5f2 DW2 fail: an _rels/.rels over 256 KB → TOO_COMPLEX", rels.code === "TOO_COMPLEX", rels);
  const near = await attempt(() => placeholdersOf(pkg({}, "", CT("").replace("</Types>", `${" ".repeat(PACKAGE_PART_MAX - 2000)}</Types>`))));
  ok("FO-5f2 DW2 pass: a [Content_Types].xml just under 256 KB is accepted", near.code === "accepted", near);

  // ------------------------------------------------------------------ DW3: a template that exhausts the worker
  // 29 MB of one-letter runs in the body (inside the 30 MB cap, under the brace cap): docxtemplater's lexer makes an
  // object per tag, more than the worker's 256 MB.
  const runsBody = `<?xml version="1.0"?><w:document ${NS}><w:body><w:p>${"<w:r><w:t>a</w:t></w:r>".repeat(1_300_000)}</w:p></w:body></w:document>`;
  const heavy = pkg({ "word/document.xml": runsBody });
  const d3 = await whileReading(() => attempt(() => placeholdersOf(heavy)));
  ok(`FO-5f2 DW3 fail: a body of 1.3 M runs ends the worker only → TOO_COMPLEX (${d3.result.ms} ms), the page read answering (slowest ${d3.slowest} ms, ${d3.reads} reads)`,
    d3.result.code === "TOO_COMPLEX" && d3.slowest < 1000 && d3.reads > 0, d3.result);
  const after = await attempt(() => placeholdersOf(pkg({})));
  ok("FO-5f2 DW3 pass: the next template is read by a new worker", after.code === "accepted" && (after.value as string[]).includes("client.name"), after);
  const r3 = await attempt(() => renderDocx(heavy, {}));
  ok("FO-5f2 DW3 fail: the same file on render → TOO_COMPLEX, and a render after it works", r3.code === "TOO_COMPLEX" && (await attempt(() => renderDocx(pkg({}), { "client.name": "x" }))).code === "accepted", r3);

  // Review m-2: the time limit. Shortened to 20 ms, a job on a large body is over it: TOO_COMPLEX, and with the limit back
  // the next job works on a new worker.
  workerTimeout.ms = 20;
  const slow = await attempt(() => placeholdersOf(pkg({ "word/document.xml": `<w:document ${NS}><w:body><w:p>${"<w:r><w:t>a</w:t></w:r>".repeat(200_000)}</w:p></w:body></w:document>` })));
  workerTimeout.ms = WORKER_TIMEOUT_MS;
  ok("FO-5f2 DW3 fail: a job over the time limit → TOO_COMPLEX, and the next job works", slow.code === "TOO_COMPLEX" && (await attempt(() => placeholdersOf(pkg({})))).code === "accepted", slow);

  // ------------------------------------------------------------------ DW4: every tag docxtemplater fills is checked
  const SETTINGS = ov("word/settings.xml", `${WML}settings+xml`), HDR1 = ov("word/header1.xml", HEADER);
  const D4: [string, Uint8Array][] = [
    ["dc:title inside a header", pkg({ "word/header1.xml": HDR(`<dc:title xmlns:dc="d">Passport {client.passport}</dc:title>`) }, HDR1)],
    ["Company inside settings", pkg({ "word/settings.xml": `<w:settings ${NS}><Company>Passport {client.passport}</Company></w:settings>` }, SETTINGS)],
    ["CDATA in a header's w:t", pkg({ "word/header1.xml": HDR(`<w:p><w:r><w:t><![CDATA[Passport {client.passport}]]></w:t></w:r></w:p>`) }, HDR1)],
    ["a coverPageProps customXml part", pkg({ "customXml/item1.xml": COVER("Passport {client.passport}") })],
    ["docProps/core.xml's dc:title", pkg({ "docProps/core.xml": `<cp:coreProperties xmlns:cp="c" xmlns:dc="d"><dc:title>Passport {client.passport}</dc:title></cp:coreProperties>` }, ov("docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"))],
  ];
  for (const [where, b] of D4) ok(`FO-5f2 DW4 fail: {client.passport} in ${where} → 422 naming it`, (await unknownOf(b)).includes("client.passport"));
  const d4ok = await placeholdersOf(pkg({ "word/header1.xml": HDR(`<dc:title xmlns:dc="d">{client.name}</dc:title>`) }, HDR1));
  ok("FO-5f2 DW4 pass: {client.name} in a header's dc:title is known and listed", d4ok.includes("client.name") && checkPlaceholders(d4ok).unknown.length === 0, d4ok);

  // ------------------------------------------------------------------ DW5: no delimiter change (each case alone, own timer)
  const D5: [string, Uint8Array][] = [
    ["{=<< >>=} then <<client.passport>>", pkg({ "word/document.xml": `<w:document ${NS}><w:body>${P("{=&lt;&lt; &gt;&gt;=}")}${P("Passport &lt;&lt;client.passport&gt;&gt;")}</w:body></w:document>` })],
    ["{=[[ ]]=} then [[client.passport]]", pkg({ "word/document.xml": `<w:document ${NS}><w:body>${P("{=[[ ]]=}Passport [[client.passport]]")}</w:body></w:document>` })],
    ["{=<< >>=} then 300,000 <<", pkg({ "word/document.xml": `<w:document ${NS}><w:body>${P("{=&lt;&lt; &gt;&gt;=}")}${P("&lt;&lt;".repeat(300_000))}</w:body></w:document>` })],
  ];
  for (const [what, b] of D5) {
    const r = await attempt(() => unknownOf(b));
    const unknown = (r.value as string[] | undefined) ?? [];
    ok(`FO-5f2 DW5 fail: ${what} → 422 naming the tag (${r.ms} ms, alone)`, r.code === "accepted" && unknown.some((n) => n.startsWith("=")) && r.ms < 6000, r);
  }
  const d5ok = await unknownOf(pkg({ "word/document.xml": `<w:document ${NS}><w:body>${P("A = sign {client.name} and a lone = are fine")}</w:body></w:document>` }));
  ok("FO-5f2 DW5 pass: an = beside a placeholder is ordinary text", d5ok.length === 0, d5ok);

  // ------------------------------------------------------------------ DW6: real files from Word and LibreOffice
  const real = JSON.parse(readFileSync(join(import.meta.dirname, "..", "samples", "fo5f2-real-templates.json"), "utf8")) as Record<string, [string, "text" | "base64", string][]>;
  const DATA = { "client.name": "Client A", "firm.name": "Sample Firm", fees: [{ label: "Fee (Sample)", amount: "100.00" }] };   // dotted keys, as service.ts passes them
  for (const app of ["word", "libreoffice"] as const) {
    const z = new PizZip();
    for (const [name, kind, body] of real[app]) z.file(name, kind === "text" ? body : Buffer.from(body, "base64"));
    const bytes = new Uint8Array(z.generate({ type: "uint8array", compression: "DEFLATE" }));
    const names = await placeholdersOf(bytes);
    ok(`FO-5f2 DW6 pass: the ${app} file (header, footer, image) is accepted with its placeholders`, ["client.name", "fees", "fees.label", "firm.name"].every((n) => names.includes(n)) && checkPlaceholders(names).unknown.length === 0, names);
    // Today's render: docxtemplater in this test process with FO-5f's options, against the worker's.
    const today = new Docxtemplater(new PizZip(bytes), { paragraphLoop: true, linebreaks: true, errorLogging: false, nullGetter: () => "" });
    today.render(DATA);
    // Part by part: a zip's entry times differ between any two renders, the parts' bytes must not.
    const was = today.getZip(), now = new PizZip(await renderDocx(bytes, DATA));
    const names2 = Object.keys(was.files).filter((n) => !was.files[n].dir), differ = names2.filter((n) => !Buffer.from(was.file(n)!.asUint8Array()).equals(Buffer.from(now.file(n)?.asUint8Array() ?? [])));
    ok(`FO-5f2 DW6 pass: the ${app} file renders byte-identically to today, part by part (${names2.length} parts)`, differ.length === 0 && names2.length === Object.keys(now.files).filter((n) => !now.files[n].dir).length && now.file(/^word\/header\d+\.xml$/).some((f) => /Retainer for Client A/.test(f.asText())), differ);
  }
  const fonts = (real.word as [string, string, string][]).map(([n, k, b]) => [n, k, n === "[Content_Types].xml" ? b.replace("</Types>", `<Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/></Types>`) : b] as const);
  const zf = new PizZip(); for (const [n, k, b] of fonts) zf.file(n, k === "text" ? b : Buffer.from(b, "base64"));
  ok("FO-5f2 DW6 fail: the Word file with an embedded-font type (not on the allowlist) → PARTS_NOT_ALLOWED", (await attempt(() => placeholdersOf(new Uint8Array(zf.generate({ type: "uint8array" }))))).code === "PARTS_NOT_ALLOWED");

  // ------------------------------------------------------------------ DW7: 1.5 M lone { refused in under 2 s in every way in
  const D7: [string, Record<string, string>, string][] = [
    ["the body", { "word/document.xml": `<w:document ${NS}><w:body>${P(FLOOD)}</w:body></w:document>` }, ""],
    ["a header", { "word/header1.xml": HDR(P(FLOOD)) }, HDR1],
    ["a footer", { "word/footer1.xml": `<w:ftr ${NS}>${P(FLOOD)}</w:ftr>` }, ov("word/footer1.xml", `${WML}footer+xml`)],
    ["footnotes", { "word/footnotes.xml": `<w:footnotes ${NS}>${P(FLOOD)}</w:footnotes>` }, ov("word/footnotes.xml", `${WML}footnotes+xml`)],
    ["settings' Company", { "word/settings.xml": `<w:settings ${NS}><Company>${FLOOD}</Company></w:settings>` }, SETTINGS],
    ["docProps/core.xml", { "docProps/core.xml": `<cp:coreProperties xmlns:cp="c" xmlns:dc="d"><dc:title>${FLOOD}</dc:title></cp:coreProperties>` }, ov("docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml")],
    ["a coverPageProps customXml part", { "customXml/item1.xml": COVER(FLOOD) }, ""],
    ["a header named word/h.rels", { "word/h.rels": HDR(P(FLOOD)) }, ov("word/h.rels", HEADER)],
    ["the glossary's settings (review M-1)", { "word/glossary/settings.xml": `<w:settings ${NS}><Company>${FLOOD}</Company></w:settings>` }, ov("word/glossary/settings.xml", `${WML}settings+xml`)],
  ];
  for (const [where, parts, types] of D7) {
    const b = pkg(parts, types);
    const up = await attempt(() => placeholdersOf(b)), rd = await attempt(() => renderDocx(b, {}));
    ok(`FO-5f2 DW7 fail: 1.5 M lone { in ${where} → refused on upload (${up.ms} ms) and on render (${rd.ms} ms), each under 2 s`,
      /TOO_MANY_PLACEHOLDERS|PARTS_NOT_ALLOWED|TOO_COMPLEX/.test(up.code) && up.code === rd.code && up.ms < 2000 && rd.ms < 2000, { up, rd });
  }
  const capG = await attempt(() => placeholdersOf(pkg({ "word/glossary/settings.xml": `<w:settings ${NS}><Company>${"{client.name}".repeat(3000)}</Company></w:settings>` }, ov("word/glossary/settings.xml", `${WML}settings+xml`))));
  ok("FO-5f2 DW7 fail (review M-1, B-19): 3000 placeholders in the glossary's settings → TOO_MANY_PLACEHOLDERS", capG.code === "TOO_MANY_PLACEHOLDERS", capG);
  for (const ext of ["__proto__", "constructor", "toString"]) {
    const r = await attempt(() => placeholdersOf(pkg({}, `<Default Extension="${ext}" ContentType="image/png"/>`)));
    ok(`FO-5f2 DW1 fail (review m-1): a Default with Extension "${ext}" → PARTS_NOT_ALLOWED, never a 500`, r.code === "PARTS_NOT_ALLOWED", r);
  }
  const d7ok = await attempt(() => placeholdersOf(pkg({ "word/document.xml": `<w:document ${NS}><w:body>${P("{client.name}".repeat(1999))}</w:body></w:document>` })));
  ok("FO-5f2 DW7 pass: 1999 placeholders (3998 braces) are accepted", d7ok.code === "accepted", d7ok.code);

  // Item 2: the API process never compiles: docx.ts does not import docxtemplater, only the worker does.
  const src = readFileSync(join(import.meta.dirname, "..", "api", "src", "front-office", "retainers", "docx.ts"), "utf8");
  ok("FO-5f2 item 2: docx.ts never imports docxtemplater (the worker does)", !/from "docxtemplater"/.test(src) && /from "docxtemplater"/.test(readFileSync(join(import.meta.dirname, "..", "api", "src", "front-office", "retainers", "docx-worker.ts"), "utf8")));
} catch (e) {
  fail++;
  console.log(`FAIL  FO-5f2: the check stopped — ${String((e as Error).stack ?? e).slice(0, 600)}`);
} finally {
  server.close();
}
console.log(`\nFO-5f2 template safety: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
