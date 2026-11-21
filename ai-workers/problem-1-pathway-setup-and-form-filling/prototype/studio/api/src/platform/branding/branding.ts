// PF-13 part 1a (map row 23; AG-1-6, AG-1-9, AG-16-2; P-574 (1), P-629; Lead B briefs PF-13.md, P-627-amendments.md,
// P-630-amendments.md): how clients see the firm. The values are registered settings (PF-3's settings home: one audit
// line per changed key, in the request's transaction); Owner and Admin change them (`agent/settings:edit`, AG-16-2),
// every role that reads settings reads them (`agent/settings:list`). Until a value is set, ExpatReady's neutral branding
// applies (AG-16-2): null means "not set". Part 1b adds the images (logo, favicon, banner) and the public reads.
// A brand colour must reach WCAG 2.1 AA's 4.5:1 for normal text on white (w3.org/TR/WCAG21/#contrast-minimum, SC 1.4.3:
// "The visual presentation of text and images of text has a contrast ratio of at least 4.5:1", read 21 Nov 2026), since
// it is drawn behind or as text; a lower one is refused with its ratio.
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { FIELD_ERROR_STATUS, parseInput } from "../http/input.ts";
import { actorWord, platformAuditWorkspaceId } from "../identity/audit.ts";
import { problem, type StaffContext } from "../identity/keys.ts";
import { firmScope } from "../firm-scope.ts";
import { imageLink, readImage } from "./image-setting.ts";
import { registerSetting, writeSetting } from "../settings.ts";

type Tx = Prisma.TransactionClient;
type DbOrTx = PrismaClient | Tx;

/** ExpatReady's neutral look (AG-16-2 "until set"): the colour the one layout used before branding. */
export const NEUTRAL_COLOUR = "#1f4e79";
export const MIN_CONTRAST = 4.5;
export const LIMITS = { senderName: 80, footer: 1000, emailSignature: 2000, tagline: 80 } as const;

/** WCAG 2.1 relative luminance of an sRGB colour #rrggbb, and its contrast ratio against white (1.0). */
export function contrastOnWhite(hex: string): number {
  const ch = (i: number) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const l = 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
  return 1.05 / (l + 0.05);
}
/** The ratio as people read it, cut (never rounded up) to two decimals: 4.477 is "4.47", never "4.5"; 3.1 is "3.1", 1 is "1". */
export const ratioWords = (r: number) => `${+(Math.floor(r * 100) / 100).toFixed(2)}:1`;

const HEX = /^#[0-9a-f]{6}$/;
// No control characters, no invisible or direction-changing characters (zero-width U+200B-U+200F, bidi U+202A-U+202E and
// U+2066-U+2069, BOM U+FEFF), and well-formed text (no lone surrogate): a footer or signature keeps its line breaks (\n)
// only (review m2, m3).
const BAD_ANY = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const okText = (s: string, lines: boolean) => !LONE.test(s) && !BAD_ANY.test(s) && (lines || !s.includes("\n"));
/** Characters as people count them (code points), the same in the service and the schema (review m1). */
const chars = (s: string) => [...s].length;
const colour = z.string().regex(HEX, "a colour as #rrggbb").refine((c) => contrastOnWhite(c) >= MIN_CONTRAST, "at least 4.5:1 contrast on white").nullable();
const text = (max: number, lines: boolean) => z.string().refine((s) => chars(s) >= 1 && chars(s) <= max, `1 to ${max} characters`)
  .refine((s) => okText(s, lines), lines ? "no control or invisible characters" : "one line, no control or invisible characters")
  .refine((s) => s.trim() === s, "no spaces at either end").nullable();

const def = <T>(key: string, description: string, schema: z.ZodType<T>, personal = false) =>
  registerSetting<T>({ key, ownerModule: "platform", changePermission: "agent/settings:edit", description, schema, default: null as T, ...(personal ? { personal: true } : {}) });
export const BRAND_COLOUR = def("platform.branding.colour", "The firm's brand colour (#rrggbb, at least 4.5:1 on white; AG-1-6, AG-16-2). Unset: ExpatReady's neutral colour.", colour);
export const ACCENT_COLOUR = def("platform.branding.accent_colour", "The firm's optional accent colour (#rrggbb, at least 4.5:1 on white; AG-1-6). Unset: none.", colour);
export const SENDER_NAME = def("platform.branding.sender_name", "The name clients see as the sender of the firm's emails (AG-16-2), one line, at most 80 characters. Unset: the firm's operating name.", text(LIMITS.senderName, false), true);
export const FOOTER = def("platform.branding.footer", "The footer of the firm's emails: address, phone and licence text (AG-16-2), plain text, at most 1,000 characters. Unset: none.", text(LIMITS.footer, true), true);
export const EMAIL_SIGNATURE = def("platform.branding.email_signature", "The firm's default email signature (AG-16-2), plain text, at most 2,000 characters; stored here, applied by the templates (PF-19c). Unset: none.", text(LIMITS.emailSignature, true), true);
export const TAGLINE = def("platform.branding.tagline", "The firm's tagline under its name on the client portal and the booking page (P-629), one line, at most 80 characters, shown as text. Never in emails or PDFs. Unset: none.", text(LIMITS.tagline, false), true);

const FIELDS = { colour: BRAND_COLOUR, accentColour: ACCENT_COLOUR, senderName: SENDER_NAME, footer: FOOTER, emailSignature: EMAIL_SIGNATURE, tagline: TAGLINE } as const;
type Field = keyof typeof FIELDS;
export type Branding = { [K in Field]: string | null };

/** The firm's branding values (null where not set), in one query. A stored value that no longer fits its schema reads
 *  as not set (ExpatReady's neutral look), with one log line naming the key only: a cosmetic value never stops a firm's
 *  email or rolls back the caller's work (review m6). */
export async function readBranding(db: DbOrTx, firmId: string, only: readonly Field[] = Object.keys(FIELDS) as Field[]): Promise<Branding> {
  const keys = only.map((f) => FIELDS[f].key);
  const rows = await db.platformFirmSetting.findMany({ where: firmScope(firmId, { key: { in: keys } }), select: { key: true, value: true } });
  const out = Object.fromEntries((Object.keys(FIELDS) as Field[]).map((f) => [f, null])) as Branding;
  for (const f of only) {
    const row = rows.find((r) => r.key === FIELDS[f].key);
    if (!row) continue;
    const p = (FIELDS[f].schema as z.ZodType<string | null>).safeParse(row.value);
    if (p.success) out[f] = p.data; else console.warn(`branding: the stored ${FIELDS[f].key} no longer fits its rule; the neutral value is used`);
  }
  return out;
}

/** What the one email layout draws for a firm: its sender name, colour, footer (and from part 1b its logo link). Never
 *  the tagline, banner or favicon (P-629). */
export type EmailBrand = { name: string; colour: string; footer: string | null; logoUrl: string | null; logoWidth?: number; logoHeight?: number };
/** Part 1b: the logo's stable public link (never FilesPort's 5-minute one) and its size at the layout's 48 px height. */
export async function emailBrandOf(db: DbOrTx, firmId: string, operatingName: string, logo?: { base: string; firmKey: string }): Promise<EmailBrand> {
  const b = await readBranding(db, firmId, ["senderName", "colour", "footer"]);
  const img = logo ? await readImage(db, firmId, "logo") : null;
  // 48 px high; a very wide logo is capped at 300 px wide and keeps its shape (review m4 on #2633).
  const w48 = img ? Math.round((48 * img.width) / img.height) : 0;
  const size = img ? (w48 > 300 ? { logoWidth: 300, logoHeight: Math.max(1, Math.round((300 * img.height) / img.width)) } : { logoWidth: Math.max(1, w48), logoHeight: 48 }) : {};
  return { name: b.senderName ?? operatingName, colour: b.colour ?? NEUTRAL_COLOUR, footer: b.footer, logoUrl: img && logo ? imageLink(logo.base, logo.firmKey, "logo", img) : null, ...size };
}

export const BrandingBody = z.strictObject(Object.fromEntries(Object.keys(FIELDS).map((f) => [f, z.unknown().optional()])) as Record<Field, z.ZodOptional<z.ZodUnknown>>);
const NAMES: Record<Field, string> = { colour: "Brand colour", accentColour: "Accent colour", senderName: "Sender name", footer: "Footer", emailSignature: "Email signature", tagline: "Tagline" };
/** The value as stored: colours lower case, text trimmed with Windows line endings made plain (review m1). */
const clean = (f: Field, v: string) => f === "colour" || f === "accentColour" ? v.toLowerCase() : v.replace(/\r\n?/g, "\n").trim();
/** The written words of a refused field, the field and its limit named; null when it may be saved. */
function refusal(f: Field, v: unknown): string | null {
  if (v === null) return null;
  if (typeof v !== "string") return `${NAMES[f]}: text, or null to clear it.`;
  if (f === "colour" || f === "accentColour") {
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) return `${NAMES[f]}: a colour as #rrggbb, for example #1f4e79.`;
    const r = contrastOnWhite(v.toLowerCase()), words = `Contrast ${ratioWords(r)} on white; at least ${MIN_CONTRAST}:1 is needed.`;
    return r >= MIN_CONTRAST ? null : f === "colour" ? words : `${NAMES[f]}: ${words}`;
  }
  const t = clean(f, v), max = LIMITS[f as keyof typeof LIMITS], lines = f === "footer" || f === "emailSignature";
  if (!t) return `${NAMES[f]}: write something, or null to clear it.`;
  if (chars(t) > max) return `${NAMES[f]}: at most ${max.toLocaleString("en-CA")} characters.`;
  if (!lines && t.includes("\n")) return `${NAMES[f]}: one line, no line breaks.`;
  if (!okText(t, lines)) return `${NAMES[f]}: plain text only, without control or invisible characters.`;
  return null;
}

export class BrandingService {
  constructor(private readonly db: PrismaClient) {}

  async read(s: StaffContext) { return { ...(await readBranding(this.db, s.firmId)), neutral: { colour: NEUTRAL_COLOUR }, limits: LIMITS }; }

  /** PUT: the fields given (null clears one back to the neutral branding); all in one transaction, one audit line per
   *  changed key (field names and values, never anything else). A refused field saves nothing. */
  async save(s: StaffContext, body: unknown) {
    // PF-28 part 2b (R1.10): the one input rule (an unknown field or a wrong type: 422, named); an empty body is 422 too.
    const b = { data: parseInput(BrandingBody, body) };
    if (!Object.keys(b.data).length) problem(FIELD_ERROR_STATUS, "Not saved", `Send one or more of: ${Object.keys(FIELDS).join(", ")}.`, { code: "INVALID_BODY", fields: { body: `Send one or more of: ${Object.keys(FIELDS).join(", ")}.` } });
    const given = Object.entries(b.data).filter(([, v]) => v !== undefined) as [Field, unknown][];
    const issues = given.map(([f, v]) => refusal(f, v)).filter((x): x is string => !!x);
    // PF-28 part 2b: a refused value is a field error (422), each field named; the words and the issues list are SettingRefused's.
    if (issues.length) problem(FIELD_ERROR_STATUS, "Setting not saved", issues[0], { code: "INVALID", issues, fields: Object.fromEntries(given.map(([f, v]) => [f, refusal(f, v)]).filter(([, w]) => !!w)) });
    const now = await readBranding(this.db, s.firmId);
    const changes = given.map(([f, v]) => [f, v === null ? null : clean(f, v as string)] as const).filter(([f, v]) => now[f] !== v);
    // Only a changed key is written and audited (review m5): a panel that sends every field adds no "unchanged" lines.
    if (changes.length) await this.db.$transaction(async (tx) => {
      const workspaceId = await platformAuditWorkspaceId(tx);
      for (const [f, v] of changes) await writeSetting(tx, { firmId: s.firmId, key: FIELDS[f].key, value: v, by: actorWord(s.staffId), workspaceId });
    });
    return { ...(await this.read(s)), saved: true };
  }
}
