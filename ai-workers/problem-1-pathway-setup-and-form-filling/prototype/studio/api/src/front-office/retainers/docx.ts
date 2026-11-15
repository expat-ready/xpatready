// FO-5 (contracts §0.3: docxtemplater, in-process, no service; rows rev 16): the real DocumentRenderPort
// (ports/render.ts) on docxtemplater + pizzip (PF-L's versions), and the two things the template screens need from a .docx:
// the placeholders it uses and whether it can be read at all. A template key names a .docx the adapter's resolver
// returns (the firm's uploaded file, or the starter built here); the data is plain JSON with dotted keys
// ({client.name}) and one loop, fees ({#fees}{label} {amount}{/fees}). A value the data does not hold prints empty: the
// screens list what is missing (BR-6), the document never says "undefined".
// The starter template is built at run time from a committed text file (samples/fo5-starter-retainer.txt): no binary is
// committed. A one-paragraph frame made here ({#lines}{text}{/lines}) is rendered by this port with the file's lines, so
// the starter's placeholders reach the firm as typed (a rendered value is never parsed again).
// FO-5f2 (rows rev 16.15, P-502): docxtemplater never runs in this process. A file is read under the size caps, its
// parts are checked against an allowlist (item 1), the brace pre-count runs (item 5), and only then is the compile,
// render or placeholder read sent to the one worker in docx-worker.ts (item 2), which answers with docxtemplater's own
// parsed tags (item 3) and fixed delimiters (item 4).
import PizZip from "pizzip";
import { Worker } from "node:worker_threads";
import { inflateRawSync } from "node:zlib";
import type { Job, Reply } from "./docx-worker.ts";
import { RenderData, TemplateKey, type DocumentRenderPort, type RenderedDocument } from "../../../../ports/render.ts";

export const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The file could not be read as a Word document, or its placeholders are malformed. `says` is the plain sentence the
 *  person reads when the refusal has its own reason (FO-5f: B-19, B-20, B-21); otherwise "We could not read this file." */
export class UnreadableDocx extends Error {
  constructor(readonly why: string, readonly says?: string, readonly code?: string) { super(`We could not read this file. (${why})`); this.name = "UnreadableDocx"; }
}
/** FO-5f item 6 (B-20): a part whose size is not what the zip declares. */
export const DAMAGED = "This file is damaged or is not a Word file.";
/** FO-5f item 4 (r3-m1, B-21): placeholders in equations (`m:t`) or drawings and SmartArt (`a:t`) are refused, never printed blank. */
export const NOT_FILLED = "Placeholders inside equations, drawings or SmartArt are not filled. Move it into normal text.";
const damaged = (why: string) => new UnreadableDocx(why, DAMAGED, "DAMAGED_FILE");
/** FO-5f2 item 1: a part outside the allowlist, or a templated type named outside its standard place. */
export const PARTS_NOT_ALLOWED = "This Word file has parts a template cannot have.";
/** FO-5f2 item 2 (and N-1): the worker ran out of memory or time, or a package part is too large to parse. */
export const TOO_COMPLEX = "This Word file is too complex to use as a template.";
const notAllowed = (why: string) => new UnreadableDocx(why, PARTS_NOT_ALLOWED, "PARTS_NOT_ALLOWED");
const tooComplex = (why: string) => new UnreadableDocx(why, TOO_COMPLEX, "TOO_COMPLEX");

/** Sample limits on what a .docx may expand to (break B-2: a 400 KB file expanding to 400 MB stalled the server). Each
 *  part is inflated here first with a hard output cap (break B-17, review r2-M1: the sizes a zip declares can lie, and
 *  pizzip inflates a part in full before it compares them), so no file costs more than the limit to read. */
export const DOCX_MAX_UNCOMPRESSED = 30 * 1024 * 1024;
export const DOCX_MAX_ENTRIES = 1000;
/** Sample: at most this many placeholders in a template (break B-19). */
export const DOCX_MAX_TAGS = 2000;
/** FO-5f2 (N-1): `[Content_Types].xml` and every `.rels` are refused over this size before they are parsed (Sample). */
export const PACKAGE_PART_MAX = 256 * 1024;
/** FO-5f2 item 2 (Sample): the worker's old-space limit and each job's time limit. */
export const WORKER_OLD_SPACE_MB = 256;
export const WORKER_TIMEOUT_MS = 5000;
/** The time limit in force; a test shortens it to reach the timeout path (review m-2). */
export const workerTimeout = { ms: WORKER_TIMEOUT_MS };
const PACKAGE_PART = /(^|\/)\[Content_Types\]\.xml$|\.rels$/i;

function load(bytes: Uint8Array): PizZip {
  let zip: PizZip;
  try { zip = new PizZip(bytes); } catch (e) { throw new UnreadableDocx(`not a zip: ${(e as Error).message}`.slice(0, 200)); }
  type Packed = { compressionMethod?: string; uncompressedSize?: number; getCompressedContent?: () => string | Uint8Array };
  const entries = Object.entries((zip as unknown as { files: Record<string, { dir?: boolean; _data?: Packed }> }).files);
  if (entries.length > DOCX_MAX_ENTRIES) throw new UnreadableDocx(`more than ${DOCX_MAX_ENTRIES} parts`);
  let used = 0;
  for (const [name, f] of entries) {
    if (f.dir || !f._data?.getCompressedContent) continue;
    // FO-5f2 (N-1, breaker round 3 Minor): a package part over the cap is refused on its declared size, and is never
    // inflated past the cap (a declared size can lie), so it is never parsed.
    const pkg = PACKAGE_PART.test(name), over = () => tooComplex(`${name.slice(0, 80)} is over ${PACKAGE_PART_MAX / 1024} KB`);
    if (pkg && (f._data.uncompressedSize ?? 0) > PACKAGE_PART_MAX) throw over();
    const raw = f._data.getCompressedContent(), packed = typeof raw === "string" ? Buffer.from(raw, "latin1") : Buffer.from(raw);
    let size: number;
    if (f._data.compressionMethod === "\x00\x00") size = packed.length;
    else if (f._data.compressionMethod === "\x08\x00") {
      const cap = pkg ? Math.min(PACKAGE_PART_MAX, DOCX_MAX_UNCOMPRESSED - used) : DOCX_MAX_UNCOMPRESSED - used;
      try { size = inflateRawSync(packed, { maxOutputLength: cap + 1 }).length; }
      catch (e) {
        if ((e as { code?: string }).code !== "ERR_BUFFER_TOO_LARGE") throw new UnreadableDocx("a damaged part");
        throw pkg && cap === PACKAGE_PART_MAX ? over() : new UnreadableDocx("it expands to more than 30 MB");
      }
    } else throw new UnreadableDocx("an unknown compression");
    if (pkg && size > PACKAGE_PART_MAX) throw over();
    // FO-5f item 6 (B-20): pizzip refuses a part whose size is not the declared one only when it is read (a 500 there).
    if (typeof f._data.uncompressedSize === "number" && size !== f._data.uncompressedSize) throw damaged("a part's size is not the size it declares");
    used += size;
    if (used > DOCX_MAX_UNCOMPRESSED) throw new UnreadableDocx("it expands to more than 30 MB");
  }
  return zip;
}

// ------------------------------------------------------------------------------------------ FO-5f2 item 1: the allowlist
// Not a copy of docxtemplater's typing (P-502): [Content_Types].xml must be in the plain form Word and LibreOffice write,
// matched whole by one grammar (no comments, CDATA, entities, prefixes or single quotes), so any XML parser reads the same
// elements we read. Each Default may only give an extension one of the untemplated types below; each Override may only
// give a part a type a Word template uses, in that type's one standard place. So no templated part (main, header,
// footer, footnotes, settings, properties) can be named `.rels`, `[Content_Types].xml`, under customXml/ or anywhere else.
const WML = "application/vnd.openxmlformats-officedocument.wordprocessingml.";
const REL = "application/vnd.openxmlformats-package.relationships+xml";
const IMAGE = /^image\/(png|jpeg|gif|bmp|tiff|x-emf|x-wmf|svg\+xml)$/;
const DEFAULTS: Record<string, RegExp> = {
  rels: new RegExp(`^${REL.replace(/[.+]/g, "\\$&")}$`), xml: /^application\/xml$/,
  png: IMAGE, jpeg: IMAGE, jpg: IMAGE, gif: IMAGE, bmp: IMAGE, tif: IMAGE, tiff: IMAGE, emf: IMAGE, wmf: IMAGE, svg: IMAGE,
};
const OVERRIDES: [string | RegExp, RegExp][] = [
  [`${WML}document.main+xml`, /^\/word\/document\.xml$/],
  [`${WML}header+xml`, /^\/word\/header\d*\.xml$/],
  [`${WML}footer+xml`, /^\/word\/footer\d*\.xml$/],
  [`${WML}footnotes+xml`, /^\/word\/footnotes\.xml$/],
  [`${WML}endnotes+xml`, /^\/word\/endnotes\.xml$/],
  // The glossary (building blocks, FO-5f item 8) is never templated; it and its own parts live under word/glossary/.
  [`${WML}document.glossary+xml`, /^\/word\/glossary\/document\.xml$/],
  [`${WML}styles+xml`, /^\/word\/(glossary\/)?styles\.xml$/],
  ["application/vnd.ms-word.stylesWithEffects+xml", /^\/word\/(glossary\/)?stylesWithEffects\.xml$/],
  [`${WML}settings+xml`, /^\/word\/(glossary\/)?settings\.xml$/],
  [`${WML}fontTable+xml`, /^\/word\/(glossary\/)?fontTable\.xml$/],
  [`${WML}numbering+xml`, /^\/word\/(glossary\/)?numbering\.xml$/],
  [`${WML}webSettings+xml`, /^\/word\/(glossary\/)?webSettings\.xml$/],
  ["application/vnd.openxmlformats-officedocument.theme+xml", /^\/word\/theme\/theme\d+\.xml$/],
  ["application/vnd.openxmlformats-package.core-properties+xml", /^\/docProps\/core\.xml$/],
  ["application/vnd.openxmlformats-officedocument.extended-properties+xml", /^\/docProps\/app\.xml$/],
  ["application/vnd.openxmlformats-officedocument.custom-properties+xml", /^\/docProps\/custom\.xml$/],
  [REL, /^\/(?:[\w.-]+\/)*_rels\/[\w.-]*\.rels$/],
  // Word and LibreOffice both write this (a bibliography's properties); docxtemplater never templates it.
  ["application/vnd.openxmlformats-officedocument.customXmlProperties+xml", /^\/customXml\/itemProps\d+\.xml$/],
  ["application/xml", /^\/customXml\/item\d+\.xml$/],   // LibreOffice types the item itself by an Override too
  [IMAGE, /^\/(word\/media\/[\w.-]+|docProps\/thumbnail\.[a-z]+)$/],   // LibreOffice types each image by an Override
];
const TYPES = /^﻿?(?:<\?xml [^<>?]*\?>)?\s*<Types xmlns="http:\/\/schemas\.openxmlformats\.org\/package\/2006\/content-types">([^]*)<\/Types>\s*$/;
const ELEMENT = /\s*<(Default|Override)((?:\s+[A-Za-z]+="[^"&<>]*")+)\s*\/>/y;

function checkParts(zip: PizZip): void {
  let text: string;
  try { text = zip.file("[Content_Types].xml")?.asText() ?? ""; } catch { throw damaged("[Content_Types].xml cannot be read"); }
  const body = TYPES.exec(text)?.[1];
  if (body === undefined) throw notAllowed("[Content_Types].xml is missing or not in the plain form");
  ELEMENT.lastIndex = 0;
  for (let at = 0; ; ) {
    if (/^\s*$/.test(body.slice(at))) break;
    ELEMENT.lastIndex = at;
    const m = ELEMENT.exec(body);
    if (!m) throw notAllowed(`[Content_Types].xml has something other than Default and Override near ${JSON.stringify(body.slice(at, at + 60))}`);
    at = ELEMENT.lastIndex;
    const attrs = new Map<string, string>();
    for (const a of m[2].matchAll(/([A-Za-z]+)="([^"]*)"/g)) { if (attrs.has(a[1])) throw notAllowed(`a repeated ${a[1]}`); attrs.set(a[1], a[2]); }
    const type = attrs.get("ContentType") ?? "";
    if (m[1] === "Default") {
      const ext = attrs.get("Extension");
      if (attrs.size !== 2 || ext === undefined || !(Object.hasOwn(DEFAULTS, ext.toLowerCase()) && DEFAULTS[ext.toLowerCase()].test(type))) throw notAllowed(`Default ${JSON.stringify(ext ?? "")} as ${type.slice(0, 120)}`);
    } else {
      const part = attrs.get("PartName");
      if (attrs.size !== 2 || part === undefined || !OVERRIDES.some(([t, where]) => (typeof t === "string" ? t === type : t.test(type)) && where.test(part))) throw notAllowed(`${part?.slice(0, 80) ?? "a part"} as ${type.slice(0, 120)}`);
    }
  }
}

// ----------------------------------------------------------------------------- FO-5f2 item 2: the worker, one job at a time
// A breach (memory, a crash, over WORKER_TIMEOUT_MS) ends that worker only: the job answers TOO_COMPLEX, and the next job
// starts a new worker. While idle the worker is unref'd, so it never keeps a process alive.
let worker: Promise<Worker> | null = null, live: Worker | null = null, nextId = 0, running = false;
/** Breaker F1, F2: renders (drafts, edits, sends of accepted templates) go before waiting uploads, and at most this many
 *  uploads wait (Sample), so a burst of hostile uploads never holds another firm's render for more than one job, nor
 *  holds unbounded memory. */
export const MAX_WAITING_UPLOADS = 8;
export const BUSY = "Templates are being checked for other uploads. Try again in a minute.";
type Pending = { job: Job; resolve: (r: Reply) => void; reject: (e: unknown) => void };
const waiting: Record<Job["op"], Pending[]> = { render: [], tags: [] };

function startWorker(): Promise<Worker> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./docx-worker.ts", import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: WORKER_OLD_SPACE_MB } });
    const fail = (e: unknown) => { w.off("message", ready); reject(e instanceof Error ? e : new Error(`the template worker stopped (${String(e)})`)); };
    const ready = (m: { ready?: boolean }) => {
      if (!m?.ready) return;
      w.off("error", fail); w.off("exit", fail); w.off("message", ready); w.unref();
      // While idle (review note): an error never goes unheard (it would end the API), and an exit lets the next job start a new worker.
      live = w; w.on("error", () => undefined); w.on("exit", () => { if (live === w) { live = null; worker = null; } });
      resolve(w);
    };
    w.on("message", ready); w.once("error", fail); w.once("exit", fail);
  });
}

async function runJob(job: Job): Promise<Reply> {
  const mine = (worker ??= startWorker().catch((e) => { worker = null; throw e; }));
  const w = await mine;
  return new Promise<Reply>((resolve, reject) => {
    const settle = (then: () => void) => { clearTimeout(timer); w.off("message", onMessage); w.off("error", onBreach); w.off("exit", onBreach); w.unref(); then(); };
    const onMessage = (r: Reply) => { if (r.id === job.id) settle(() => resolve(r)); };
    const onBreach = (e?: unknown) => {
      if (worker === mine) worker = null;
      void w.terminate();
      settle(() => reject(tooComplex(`template worker: ${e instanceof Error ? e.message : typeof e === "number" ? `exit ${e}` : `over ${workerTimeout.ms} ms`}`.slice(0, 200))));
    };
    const timer = setTimeout(onBreach, workerTimeout.ms);
    w.on("message", onMessage); w.on("error", onBreach); w.on("exit", onBreach); w.ref();
    w.postMessage(job);
  });
}

function pump(): void {
  if (running) return;
  const next = waiting.render.shift() ?? waiting.tags.shift();
  if (!next) return;
  running = true;
  runJob(next.job).then(next.resolve, next.reject).finally(() => { running = false; pump(); });
}

/** Queues a job for the worker (renders first); a worker refusal becomes UnreadableDocx. */
async function inWorker(op: Job["op"], bytes: Uint8Array, data?: Record<string, unknown>): Promise<Reply> {
  if (op === "tags" && waiting.tags.length >= MAX_WAITING_UPLOADS) throw new UnreadableDocx("the upload queue is full", BUSY, "TEMPLATES_BUSY");
  const r = await new Promise<Reply>((resolve, reject) => { waiting[op].push({ job: { id: ++nextId, op, bytes, data }, resolve, reject }); pump(); });
  if (!r.error) return r;
  const { code, why, says } = r.error;
  throw code === "UNREADABLE_FILE" ? new UnreadableDocx(why) : new UnreadableDocx(why, says ?? (code === "DAMAGED_FILE" ? DAMAGED : undefined), code);
}

/** How many "{" and "}" a text holds (a loop: a flood never allocates a match per brace). */
function braceCount(t: string): number { let n = 0; for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); if (c === 123 || c === 125) n++; } return n; }

/** The placeholders a .docx uses, flattened: `client.name`, and for a loop its name and `<loop>.<field>` (`fees`,
 *  `fees.label`); inside a loop `{fees.label}` names the same field as `{label}` (review m4). Sorted, each once. Read from
 *  the text docxtemplater renders (break B-18: Word's own field codes, citation data and tracked deletions are not text
 *  and are not read): the `<w:t>` runs of every Word part, declared under any name (break B-3), and the text of the
 *  document properties. The glossary (building blocks) is never rendered, so it is not read (FO-5f item 8, B-23). A
 *  placeholder in an equation (`<m:t>`) or a drawing or SmartArt (`<a:t>`) is refused (FO-5f item 4). The placeholder cap
 *  is counted from the text runs before docxtemplater compiles (FO-5f item 5, B-19: a flood of tags never costs a compile),
 *  then docxtemplater parses the template in the worker, so a malformed tag is refused. FO-5f2: the parts are checked
 *  against the allowlist before any of this, and the list is this text scan's tags together with every tag docxtemplater
 *  itself parsed (item 3: property-text tags, CDATA, cover-page customXml, a `{=` delimiter change), so a tag it would
 *  fill is never missed. */
export async function placeholdersOf(bytes: Uint8Array): Promise<string[]> {
  gate(bytes);
  return (await inWorker("tags", bytes)).tags ?? [];
}

/** The checks in this process before any job reaches the worker, on upload and on render alike (FO-5f2 DW7: every way
 *  in): the size caps, the allowlist and the brace pre-count. */
function gate(bytes: Uint8Array): void {
  const zip = load(bytes);
  if (!zip.file("word/document.xml")) throw new UnreadableDocx("no word/document.xml");
  checkParts(zip);
  scanParts(zip, false);
}

export const TAG = /\{([^{}]*)\}/g;

/** Reads the parts docxtemplater may compile. Every brace is counted (the cap, below); with `deep` (in the worker only:
 *  the regexes cost time on a large part, FO-5f2 DW3) the text of each part is also scanned and returned. */
export function scanParts(zip: PizZip, deep: boolean): string[] {
  const read = (name: string): string | undefined => { try { return zip.file(name)?.asText(); } catch { throw damaged(`part ${name.slice(0, 80)} cannot be read`); } };
  const types = read("[Content_Types].xml") ?? "";
  const overrides = [...types.matchAll(/<Override\b[^>]*>/g)].map((m) => ({ part: /PartName="\/([^"]+)"/.exec(m[0])?.[1], type: /ContentType="([^"]+)"/.exec(m[0])?.[1] ?? "" }));
  // Each part's type as docxtemplater resolves it (review round 2, M-1 rest): its Override, else the Default for its
  // extension. A part typed as XML is read whatever its name (a header named h.bin is still compiled).
  const defaults = new Map([...types.matchAll(/<Default\b[^>]*>/g)].map((m) => [(/Extension="([^"]+)"/.exec(m[0])?.[1] ?? "").toLowerCase(), /ContentType="([^"]+)"/.exec(m[0])?.[1] ?? ""]));
  const byPart = new Map(overrides.filter((o) => o.part).map((o) => [o.part!.toLowerCase(), o.type]));
  const typeOf = (f: string) => byPart.get(f.toLowerCase()) ?? defaults.get(/\.([^./]+)$/.exec(f)?.[1]?.toLowerCase() ?? "") ?? "";
  const files = Object.keys(zip.files).filter((f) => !(zip.files as Record<string, { dir?: boolean }>)[f].dir);
  // Never rendered by docxtemplater, so never read: the glossary document (B-23) and charts (review m-4: a brace in a
  // chart title is not a placeholder). By type only (FO-5f2 review M-1): word/glossary/settings.xml is compiled as settings.
  const skipped = (f: string) => /\.glossary\+xml$|drawingml\.chart\+xml$/i.test(typeOf(f));
  const COVER = 'xmlns="http://schemas.microsoft.com/office/2006/coverPageProps"';   // the customXml docxtemplater compiles
  const parts = new Set(files.filter((f) => /\.xml$/i.test(f) || /[/+]xml$/i.test(typeOf(f))));
  const unescape = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const runs = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, "g"))].map((m) => unescape(m[1])).join("");
  const texts: string[] = [];
  let tags = 0, braces = 0;
  const tooMany = () => new UnreadableDocx(`more than ${DOCX_MAX_TAGS} placeholders`, `This template has more than ${DOCX_MAX_TAGS} placeholders (or more than ${2 * DOCX_MAX_TAGS} { and } signs), the most one template may have.`, "TOO_MANY_PLACEHOLDERS");
  for (const name of parts) {
    if (/(^|\/)\[Content_Types\]\.xml$|\.rels$/i.test(name) || skipped(name)) continue;
    const xml = read(name);
    if (!xml) continue;
    const cover = /^customXml\//i.test(name);
    if (cover && !xml.includes(COVER)) continue;   // other customXml (citations, GUIDs) is not compiled (B-18)
    // The cap (B-19; review rounds 1 and 2, M-1): every brace in the part's XML is counted, paired or not and in any
    // text tag, before the compile, so a flood of lone "{" never reaches it. A placeholder has two braces: at most
    // twice the cap.
    braces += braceCount(xml);
    if (braces > 2 * DOCX_MAX_TAGS) throw tooMany();
    if (!deep) continue;
    const plain = cover || /^docProps\//i.test(name);   // property parts: their whole text is lexed
    const drawn = plain ? "" : runs(xml, "m:t") + "\u0000" + runs(xml, "a:t");
    if (/\{[^{}]*\}/.test(drawn)) throw new UnreadableDocx("a placeholder in an equation, drawing or SmartArt", NOT_FILLED, "PLACEHOLDER_NOT_FILLED");
    const text = plain ? unescape(xml.replace(/<[^>]*>/g, "")) : runs(xml, "w:t") + "\u0000" + runs(xml, "vt:lpwstr") + "\u0000" + runs(xml, "vt:lpstr");
    for (const _ of text.matchAll(TAG)) if (++tags > DOCX_MAX_TAGS) throw tooMany();
    texts.push(text);
  }
  return texts;
}

/** Renders a .docx's bytes with the data. Throws UnreadableDocx. */
export async function renderDocx(bytes: Uint8Array, data: Record<string, unknown>): Promise<Uint8Array> {
  gate(bytes);
  return (await inWorker("render", bytes, data)).bytes!;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A minimal .docx whose body is one paragraph per line (a line starting "# " is a heading, in bold). Used for the
 *  starter's frame; a firm edits the downloaded file in Word. */
export function buildDocx(lines: string[]): Uint8Array {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  const paras = lines.map((l) => {
    const head = l.startsWith("# "), text = head ? l.slice(2) : l;
    return `<w:p><w:r>${head ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  }).join("");
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}<w:sectPr/></w:body></w:document>`);
  return new Uint8Array(zip.generate({ type: "uint8array", compression: "DEFLATE" }));
}

/** The port's adapter: a template key is resolved to a .docx's bytes, then rendered. */
export class DocxRender implements DocumentRenderPort {
  constructor(private readonly resolveTemplate: (templateKey: string) => Promise<Uint8Array | null>) {}
  async render(templateKey: string, data: RenderData): Promise<RenderedDocument> {
    const k = TemplateKey.parse(templateKey), d = RenderData.parse(data);
    const bytes = await this.resolveTemplate(k);
    if (!bytes) throw new Error(`unknown template ${k}`);
    return { bytes: await renderDocx(bytes, d), contentType: DOCX };
  }
}

/** The starter template (BR-1, M5): the committed text's lines rendered into the frame by the port ("# " marks a heading
 *  line in the text; the frame prints it as a plain line). Sample wording, Unconfirmed: no counsel. */
export async function buildStarter(render: DocumentRenderPort, text: string): Promise<RenderedDocument> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => ({ text: l.replace(/^# /, "") }));
  return render.render(STARTER_KEY, { lines });
}
export const STARTER_KEY = "retainer.starter";
/** The frame the starter is rendered into. */
export const starterFrame = () => buildDocx(["{#lines}{text}{/lines}"]);
