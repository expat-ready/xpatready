// PF-19s (R1.46): the shapes the Templates screens read from /api/platform/templates (api/src/platform/messages/
// templates/), parsed at the edge so a changed answer fails loudly, and the editor's pure helpers (no React, so a test
// reads them in Node).
import { z } from "zod";

export const TEMPLATES_KEY = "agent/template:list";
export const TemplateRow = z.object({ key: z.string(), name: z.string(), sentTo: z.string(), list: z.enum(["Automatic", "Library"]), purpose: z.string(), version: z.number() });
export const TemplateList = z.object({ templates: z.array(TemplateRow) });
export const Template = z.object({
  key: z.string(), name: z.string(), sentTo: z.string(), list: z.enum(["Automatic", "Library"]), purpose: z.string(), channel: z.string(), language: z.string(),
  subject: z.string(), body: z.string(), version: z.number(), publishedAt: z.string().nullable(),
  fields: z.array(z.object({ key: z.string(), label: z.string() })), limits: z.object({ subject: z.number(), body: z.number() }),
  canEdit: z.boolean(), canPreview: z.boolean(),
});
export type Template = z.infer<typeof Template>;
const Part = z.union([z.object({ text: z.string() }), z.object({ field: z.string(), label: z.string(), value: z.string().nullable() })]);
export type Part = z.infer<typeof Part>;
export const Preview = z.object({
  record: z.object({ label: z.string(), sample: z.boolean(), language: z.string() }),
  subject: z.array(Part), body: z.array(Part), missing: z.array(z.string()), unknown: z.array(z.string()),
});
export type Preview = z.infer<typeof Preview>;
export const Records = z.object({ records: z.array(z.object({ id: z.string(), label: z.string() })) });
export const Published = z.object({ key: z.string(), version: z.number(), published: z.literal(true) });

/** "ExpatReady's wording" until the firm publishes; then "Your wording, version n" (AG-12-39's whose-wording column). */
export const whose = (version: number) => (version > 0 ? `Your wording, version ${version}` : "ExpatReady's wording");

/** The text with `{{ field }}` put in place of the selection [start, end), and where the cursor goes after it. */
export function insertField(text: string, start: number, end: number, field: string): { text: string; cursor: number } {
  const token = `{{ ${field} }}`;
  const a = Math.max(0, Math.min(start, text.length)), b = Math.max(a, Math.min(end, text.length));
  return { text: text.slice(0, a) + token + text.slice(b), cursor: a + token.length };
}
