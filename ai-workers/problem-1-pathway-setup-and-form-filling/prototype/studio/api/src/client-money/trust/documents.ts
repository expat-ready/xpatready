// FO-7t part 1 (AG-6-62, AG-6-71 rule 2, AG-6-63 rules 1, 3-5, 7): the trust request email and the TRUST receipt, as
// text and the receipt as a PDF behind DocumentRenderPort (FO-7b's plain text page, textPdf). The wording is the
// committed Sample text samples/fo7t-trust-wording.txt; every figure is a stored one, printed from its digits (MONEY).
// Legal reading: Unconfirmed: no counsel.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDF, RenderData, type DocumentRenderPort, type RenderedDocument } from "../../../../ports/render.ts";
import { textPdf } from "../invoices/documents.ts";

const WORDING = join(import.meta.dirname, "..", "..", "..", "..", "samples", "fo7t-trust-wording.txt");
export const TRUST_TEMPLATES = ["client_money.trust_request", "client_money.trust_receipt"] as const;
export type TrustTemplate = (typeof TRUST_TEMPLATES)[number];

let parts: Map<string, string> | null = null;
/** The wording file's parts, by name ("== name ==" lines; # lines are notes). */
const part = (name: string): string => {
  if (!parts) {
    const bits = readFileSync(WORDING, "utf8").split(/^== ([a-z_.]+) ==$/m);
    parts = new Map();
    for (let i = 1; i < bits.length; i += 2) parts.set(bits[i], bits[i + 1].split("\n").filter((l) => !l.startsWith("#")).join("\n"));
  }
  const t = parts.get(name);
  if (t === undefined) throw new Error(`fo7t-trust-wording.txt: no part ${name}`);
  return t;
};
const fill = (name: string, data: RenderData) => part(name).replace(/\{\{([A-Za-z]+)\}\}/g, (_, k: string) => { if (typeof data[k] !== "string") throw new Error(`${name}: no value for ${k}`); return data[k]; });

/** The message's text with its names filled; a name the data lacks stops it. */
export function trustText(key: TrustTemplate, data: RenderData): string {
  return fill(key.replace("client_money.", ""), RenderData.parse(data)).replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
export const trustSubject = (key: TrustTemplate, data: RenderData) => fill(`${key.replace("client_money.", "")}.subject`, RenderData.parse(data)).trim();

export class TrustDocuments implements DocumentRenderPort {
  async render(templateKey: string, data: RenderData): Promise<RenderedDocument> {
    if (!(TRUST_TEMPLATES as readonly string[]).includes(templateKey)) throw new Error(`unknown template ${templateKey}`);
    return { bytes: textPdf(trustText(templateKey as TrustTemplate, data)), contentType: PDF };
  }
}
