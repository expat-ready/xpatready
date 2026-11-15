// FO-5 (contracts §0.3: docxtemplater, in-process, no service; rows rev 16): the real DocumentRenderPort
// (ports/render.ts) on docxtemplater + pizzip (PF-L's versions), and the two things the template screens need from a .docx:
// the placeholders it uses and whether it can be read at all. A template key names a .docx the adapter's resolver
// returns (the firm's uploaded file, or the starter built here); the data is plain JSON with dotted keys
// ({client.name}) and one loop, fees ({#fees}{label} {amount}{/fees}). A value the data does not hold prints empty: the
// screens list what is missing (BR-6), the document never says "undefined".
// The starter template is built at run time from a committed text file (samples/fo5-starter-retainer.txt): no binary is
// committed. A one-paragraph frame made here ({#lines}{text}{/lines}) is rendered by this port with the file's lines, so
// the starter's placeholders reach the firm as typed (a rendered value is never parsed again).
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { inflateRawSync } from "node:zlib";
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

/** Sample limits on what a .docx may expand to (break B-2: a 400 KB file expanding to 400 MB stalled the server). Each
 *  part is inflated here first with a hard output cap (break B-17, review r2-M1: the sizes a zip declares can lie, and
 *  pizzip inflates a part in full before it compares them), so no file costs more than the limit to read. */
export const DOCX_MAX_UNCOMPRESSED = 30 * 1024 * 1024;
export const DOCX_MAX_ENTRIES = 1000;
/** Sample: at most this many placeholders in a template (break B-19). */
export const DOCX_MAX_TAGS = 2000;

function load(bytes: Uint8Array): PizZip {
  let zip: PizZip;
  try { zip = new PizZip(bytes); } catch (e) { throw new UnreadableDocx(`not a zip: ${(e as Error).message}`.slice(0, 200)); }
  type Packed = { compressionMethod?: string; uncompressedSize?: number; getCompressedContent?: () => string | Uint8Array };
  const entries = Object.values((zip as unknown as { files: Record<string, { dir?: boolean; _data?: Packed }> }).files);
  if (entries.length > DOCX_MAX_ENTRIES) throw new UnreadableDocx(`more than ${DOCX_MAX_ENTRIES} parts`);
  let used = 0;
  for (const f of entries) {
    if (f.dir || !f._data?.getCompressedContent) continue;
    const raw = f._data.getCompressedContent(), packed = typeof raw === "string" ? Buffer.from(raw, "latin1") : Buffer.from(raw);
    let size: number;
    if (f._data.compressionMethod === "\x00\x00") size = packed.length;
    else if (f._data.compressionMethod === "\x08\x00") {
      try { size = inflateRawSync(packed, { maxOutputLength: DOCX_MAX_UNCOMPRESSED - used + 1 }).length; }
      catch (e) { throw new UnreadableDocx((e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE" ? "it expands to more than 30 MB" : "a damaged part"); }
    } else throw new UnreadableDocx("an unknown compression");
    // FO-5f item 6 (B-20): pizzip refuses a part whose size is not the declared one only when it is read (a 500 there).
    if (typeof f._data.uncompressedSize === "number" && size !== f._data.uncompressedSize) throw damaged("a part's size is not the size it declares");
    used += size;
    if (used > DOCX_MAX_UNCOMPRESSED) throw new UnreadableDocx("it expands to more than 30 MB");
  }
  return zip;
}

function open(bytes: Uint8Array): Docxtemplater {
  const zip = load(bytes);
  if (!zip.file("word/document.xml")) throw new UnreadableDocx("no word/document.xml");
  return compile(zip);
}

function compile(zip: PizZip): Docxtemplater {
  try {
    return new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, errorLogging: false, nullGetter: () => "" });
  } catch (e) {
    if (/size mismatch|corrupted|end of data/i.test((e as Error).message ?? "")) throw damaged((e as Error).message.slice(0, 200));   // B-20
    const errs = (e as { properties?: { errors?: { properties?: { explanation?: string } }[] } }).properties?.errors ?? [];
    throw new UnreadableDocx((errs.map((x) => x.properties?.explanation).filter(Boolean).join("; ") || (e as Error).message).slice(0, 300));
  }
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
 *  then docxtemplater parses the template, so a malformed tag is refused. docxtemplater's own inspect helper needs a
 *  library we have not approved. */
export function placeholdersOf(bytes: Uint8Array): string[] {
  const zip = load(bytes);
  if (!zip.file("word/document.xml")) throw new UnreadableDocx("no word/document.xml");
  const read = (name: string): string | undefined => { try { return zip.file(name)?.asText(); } catch { throw damaged(`part ${name.slice(0, 80)} cannot be read`); } };
  const types = read("[Content_Types].xml") ?? "";
  const overrides = [...types.matchAll(/<Override\b[^>]*>/g)].map((m) => ({ part: /PartName="\/([^"]+)"/.exec(m[0])?.[1], type: /ContentType="([^"]+)"/.exec(m[0])?.[1] ?? "" }));
  // Each part's type as docxtemplater resolves it (review round 2, M-1 rest): its Override, else the Default for its
  // extension. A part typed as XML is read whatever its name (a header named h.bin is still compiled).
  const defaults = new Map([...types.matchAll(/<Default\b[^>]*>/g)].map((m) => [(/Extension="([^"]+)"/.exec(m[0])?.[1] ?? "").toLowerCase(), /ContentType="([^"]+)"/.exec(m[0])?.[1] ?? ""]));
  const byPart = new Map(overrides.filter((o) => o.part).map((o) => [o.part!.toLowerCase(), o.type]));
  const typeOf = (f: string) => byPart.get(f.toLowerCase()) ?? defaults.get(/\.([^./]+)$/.exec(f)?.[1]?.toLowerCase() ?? "") ?? "";
  const files = Object.keys(zip.files).filter((f) => !(zip.files as Record<string, { dir?: boolean }>)[f].dir);
  // Never rendered by docxtemplater, so never read: the glossary (B-23) and charts (review m-4: a brace in a chart title
  // is not a placeholder).
  const skipped = (f: string) => /\.glossary\+xml$|drawingml\.chart\+xml$/i.test(typeOf(f)) || /^word\/(glossary|charts)\//i.test(f);
  const COVER = 'xmlns="http://schemas.microsoft.com/office/2006/coverPageProps"';   // the customXml docxtemplater compiles
  const parts = new Set(files.filter((f) => /\.xml$/i.test(f) || /[/+]xml$/i.test(typeOf(f))));
  const unescape = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const runs = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, "g"))].map((m) => unescape(m[1])).join("");
  const TAG = /\{([^{}]*)\}/g;
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
    const plain = cover || /^docProps\//i.test(name);   // property parts: their whole text is lexed
    const drawn = plain ? "" : runs(xml, "m:t") + "\u0000" + runs(xml, "a:t");
    if (/\{[^{}]*\}/.test(drawn)) throw new UnreadableDocx("a placeholder in an equation, drawing or SmartArt", NOT_FILLED, "PLACEHOLDER_NOT_FILLED");
    const text = plain ? unescape(xml.replace(/<[^>]*>/g, "")) : runs(xml, "w:t") + "\u0000" + runs(xml, "vt:lpwstr") + "\u0000" + runs(xml, "vt:lpstr");
    for (const _ of text.matchAll(TAG)) if (++tags > DOCX_MAX_TAGS) throw tooMany();
    texts.push(text);
  }
  compile(zip);   // a malformed tag is refused here, after the cheap checks above
  const out = new Set<string>();
  for (const text of texts) {
    const stack: string[] = [];
    for (const m of text.matchAll(TAG)) {
      const t = m[1].trim(), sigil = t[0];
      const field = (n: string) => (stack.length && n.startsWith(`${stack.join(".")}.`) ? n : [...stack, n].join("."));
      if (sigil === "#" || sigil === "^") { const n = t.slice(1).trim(); out.add(field(n)); stack.push(n); }
      else if (sigil === "/") stack.pop();
      else if (t && !stack.length && /^fees\.(label|amount|when|due_on)$/.test(t)) out.add(`${t}-outside-the-fee-loop`);   // prints nothing there (m4)
      else if (t) out.add(field(t));
    }
  }
  return [...out].sort();
}

/** Renders a .docx's bytes with the data. Throws UnreadableDocx. */
export function renderDocx(bytes: Uint8Array, data: Record<string, unknown>): Uint8Array {
  const doc = open(bytes);
  try { doc.render(data); } catch (e) { throw new UnreadableDocx(`render: ${(e as Error).message}`.slice(0, 300)); }
  return new Uint8Array(doc.getZip().generate({ type: "uint8array", compression: "DEFLATE" }));
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
    return { bytes: renderDocx(bytes, d), contentType: DOCX };
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
