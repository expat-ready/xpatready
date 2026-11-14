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
import { RenderData, TemplateKey, type DocumentRenderPort, type RenderedDocument } from "../../../../ports/render.ts";

export const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The file could not be read as a Word document, or its placeholders are malformed. */
export class UnreadableDocx extends Error {
  constructor(readonly why: string) { super(`We could not read this file. (${why})`); this.name = "UnreadableDocx"; }
}

function open(bytes: Uint8Array): Docxtemplater {
  let zip: PizZip;
  try { zip = new PizZip(bytes); } catch (e) { throw new UnreadableDocx(`not a zip: ${(e as Error).message}`.slice(0, 200)); }
  if (!zip.file("word/document.xml")) throw new UnreadableDocx("no word/document.xml");
  try {
    return new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, errorLogging: false, nullGetter: () => "" });
  } catch (e) {
    const errs = (e as { properties?: { errors?: { properties?: { explanation?: string } }[] } }).properties?.errors ?? [];
    throw new UnreadableDocx((errs.map((x) => x.properties?.explanation).filter(Boolean).join("; ") || (e as Error).message).slice(0, 300));
  }
}

/** The placeholders a .docx uses, flattened: `client.name`, and for a loop its name and `<loop>.<field>` (`fees`,
 *  `fees.label`). Sorted, each once. Read from the body, headers and footers after docxtemplater has parsed the template
 *  (so a malformed tag is already refused); docxtemplater's own inspect helper needs a library we have not approved. */
export function placeholdersOf(bytes: Uint8Array): string[] {
  const doc = open(bytes), zip = doc.getZip();
  const parts = Object.keys(zip.files).filter((f) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(f));
  const out = new Set<string>();
  for (const part of parts) {
    const text = doc.getFullText(part), stack: string[] = [];
    for (const m of text.matchAll(/\{([^{}]*)\}/g)) {
      const t = m[1].trim(), sigil = t[0];
      if (sigil === "#" || sigil === "^") { const n = t.slice(1).trim(); out.add([...stack, n].join(".")); stack.push(n); }
      else if (sigil === "/") stack.pop();
      else if (t) out.add([...stack, t].join("."));
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
