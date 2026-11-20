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
import { actorWord, platformAuditWorkspaceId } from "../identity/audit.ts";
import { problem, type StaffContext } from "../identity/keys.ts";
import { readSetting, registerSetting, SettingRefused, writeSetting } from "../settings.ts";

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
/** The ratio as people read it, cut (never rounded up) to two decimals: 4.477 is "4.47", never "4.5". */
export const ratioWords = (r: number) => `${(Math.floor(r * 100) / 100).toFixed(2).replace(/0$/, "")}:1`;

const HEX = /^#[0-9a-f]{6}$/;
// No control characters at all in one-line fields; a footer or signature keeps its line breaks only.
const ONE_LINE = /^[^\u0000-\u001f\u007f-\u009f\u2028\u2029]*$/;
const LINES = /^[^\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]*$/;
const colour = z.string().regex(HEX, "a colour as #rrggbb").refine((c) => contrastOnWhite(c) >= MIN_CONTRAST, "at least 4.5:1 contrast on white").nullable();
const text = (max: number, re: RegExp) => z.string().min(1).max(max).regex(re, "no control characters").refine((s) => s.trim() === s && s.trim().length > 0, "no spaces at either end").nullable();

const def = <T>(key: string, description: string, schema: z.ZodType<T>) =>
  registerSetting<T>({ key, ownerModule: "platform", changePermission: "agent/settings:edit", description, schema, default: null as T });
export const BRAND_COLOUR = def("platform.branding.colour", "The firm's brand colour (#rrggbb, at least 4.5:1 on white; AG-1-6, AG-16-2). Unset: ExpatReady's neutral colour.", colour);
export const ACCENT_COLOUR = def("platform.branding.accent_colour", "The firm's optional accent colour (#rrggbb, at least 4.5:1 on white; AG-1-6). Unset: none.", colour);
export const SENDER_NAME = def("platform.branding.sender_name", "The name clients see as the sender of the firm's emails (AG-16-2), one line, at most 80 characters. Unset: the firm's operating name.", text(LIMITS.senderName, ONE_LINE));
export const FOOTER = def("platform.branding.footer", "The footer of the firm's emails: address, phone and licence text (AG-16-2), plain text, at most 1,000 characters. Unset: none.", text(LIMITS.footer, LINES));
export const EMAIL_SIGNATURE = def("platform.branding.email_signature", "The firm's default email signature (AG-16-2), plain text, at most 2,000 characters; stored here, applied by the templates (PF-19c). Unset: none.", text(LIMITS.emailSignature, LINES));
export const TAGLINE = def("platform.branding.tagline", "The firm's tagline under its name on the client portal and the booking page (P-629), one line, at most 80 characters, shown as text. Never in emails or PDFs. Unset: none.", text(LIMITS.tagline, ONE_LINE));

const FIELDS = { colour: BRAND_COLOUR, accentColour: ACCENT_COLOUR, senderName: SENDER_NAME, footer: FOOTER, emailSignature: EMAIL_SIGNATURE, tagline: TAGLINE } as const;
type Field = keyof typeof FIELDS;
export type Branding = { [K in Field]: string | null };

/** The firm's branding values (null where not set). */
export async function readBranding(db: DbOrTx, firmId: string): Promise<Branding> {
  const out = {} as Branding;
  for (const [f, d] of Object.entries(FIELDS) as [Field, (typeof FIELDS)[Field]][]) out[f] = await readSetting<string | null>(db, firmId, d.key);
  return out;
}

/** What the one email layout draws for a firm: its sender name, colour, footer (and from part 1b its logo link). Never
 *  the tagline, banner or favicon (P-629). */
export type EmailBrand = { name: string; colour: string; footer: string | null; logoUrl: string | null };
export async function emailBrandOf(db: DbOrTx, firmId: string, operatingName: string): Promise<EmailBrand> {
  const b = await readBranding(db, firmId);
  return { name: b.senderName ?? operatingName, colour: b.colour ?? NEUTRAL_COLOUR, footer: b.footer, logoUrl: null };
}

const Body = z.strictObject(Object.fromEntries(Object.keys(FIELDS).map((f) => [f, z.unknown().optional()])) as Record<Field, z.ZodOptional<z.ZodUnknown>>);
/** The written words of a refused field, with the limit named. */
function refusal(f: Field, v: unknown): string | null {
  if (v === null) return null;
  if (typeof v !== "string") return `${f}: text, or null to clear it.`;
  if (f === "colour" || f === "accentColour") {
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) return `${f}: a colour as #rrggbb, for example #1f4e79.`;
    const r = contrastOnWhite(v.toLowerCase());
    return r < MIN_CONTRAST ? `Contrast ${ratioWords(r)} on white; at least ${MIN_CONTRAST}:1 is needed.` : null;
  }
  const max = LIMITS[f as keyof typeof LIMITS];
  if ([...v.trim()].length > max) return `${f}: at most ${max.toLocaleString("en-CA")} characters.`;
  if ((f === "senderName" || f === "tagline") && /[\r\n\u2028\u2029]/.test(v)) return `${f}: one line, no line breaks.`;
  return null;
}

export class BrandingService {
  constructor(private readonly db: PrismaClient) {}

  async read(s: StaffContext) { return { ...(await readBranding(this.db, s.firmId)), neutral: { colour: NEUTRAL_COLOUR }, limits: LIMITS }; }

  /** PUT: the fields given (null clears one back to the neutral branding); all in one transaction, one audit line per
   *  changed key (field names and values, never anything else). A refused field saves nothing. */
  async save(s: StaffContext, body: unknown) {
    const b = Body.safeParse(body ?? {});
    if (!b.success || !Object.keys(b.data).length) problem(400, "Not saved", `Send one or more of: ${Object.keys(FIELDS).join(", ")}.`, { code: "INVALID_BODY" });
    const given = Object.entries(b.data).filter(([, v]) => v !== undefined) as [Field, unknown][];
    const issues = given.map(([f, v]) => refusal(f, v)).filter((x): x is string => !!x);
    if (issues.length) throw new SettingRefused(issues[0], issues);
    const clean = (f: Field, v: unknown) => v === null ? null : f === "colour" || f === "accentColour" ? (v as string).toLowerCase() : (v as string).trim() || null;
    await this.db.$transaction(async (tx) => {
      const workspaceId = await platformAuditWorkspaceId(tx);
      for (const [f, v] of given) await writeSetting(tx, { firmId: s.firmId, key: FIELDS[f].key, value: clean(f, v), by: actorWord(s.staffId), workspaceId });
    });
    return { ...(await this.read(s)), saved: true };
  }
}
