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

/** The file could not be read as a Word document, or its placeholders are malformed. */
export class UnreadableDocx extends Error {
  constructor(readonly why: string) { super(`We could not read this file. (${why})`); this.name = "UnreadableDocx"; }
}

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
  type Packed = { compressionMethod?: string; getCompressedContent?: () => string | Uint8Array };
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
    used += size;
    if (used > DOCX_MAX_UNCOMPRESSED) throw new UnreadableDocx("it expands to more than 30 MB");
  }
  return zip;
}

function open(bytes: Uint8Array): Docxtemplater {
  const zip = load(bytes);
  if (!zip.file("word/document.xml")) throw new UnreadableDocx("no word/document.xml");
  try {
    return new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, errorLogging: false, nullGetter: () => "" });
  } catch (e) {
    const errs = (e as { properties?: { errors?: { properties?: { explanation?: string } }[] } }).properties?.errors ?? [];
    throw new UnreadableDocx((errs.map((x) => x.properties?.explanation).filter(Boolean).join("; ") || (e as Error).message).slice(0, 300));
  }
}

/** The placeholders a .docx uses, flattened: `client.name`, and for a loop its name and `<loop>.<field>` (`fees`,
 *  `fees.label`); inside a loop `{fees.label}` names the same field as `{label}` (review m4). Sorted, each once. Read from
 *  the text docxtemplater renders (break B-18: Word's own field codes, citation data and tracked deletions are not text
 *  and are not read): the `<w:t>` runs of every Word part, declared under any name (break B-3), and the text of the
 *  document properties. Read after docxtemplater has parsed the template, so a malformed tag is already refused.
 *  docxtemplater's own inspect helper needs a library we have not approved. */
export function placeholdersOf(bytes: Uint8Array): string[] {
  const zip = open(bytes).getZip();
  const declared = [...(zip.file("[Content_Types].xml")?.asText() ?? "").matchAll(/PartName="\/([^"]+)"/g)].map((m) => m[1]);
  const parts = new Set([...Object.keys(zip.files).filter((f) => /\.xml$/i.test(f)), ...declared]);
  const unescape = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const out = new Set<string>();
  let tags = 0;
  for (const name of parts) {
    if (/(^|\/)\[Content_Types\]\.xml$|\.rels$|^customXml\//i.test(name)) continue;
    const xml = zip.file(name)?.asText();
    if (!xml) continue;
    const text = /^docProps\//i.test(name)
      ? unescape(xml.replace(/<[^>]*>/g, ""))
      : [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => unescape(m[1])).join("");
    const stack: string[] = [];
    for (const m of text.matchAll(/\{([^{}]*)\}/g)) {
      if (++tags > DOCX_MAX_TAGS) throw new UnreadableDocx(`more than ${DOCX_MAX_TAGS} placeholders`);
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
