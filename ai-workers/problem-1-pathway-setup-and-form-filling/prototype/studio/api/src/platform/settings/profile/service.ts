// PF-5fp (R1.92; AG-01 §3.1, AG01-29(7), AG-16 §3.1 "Who edits which firm detail", AG-16-1): the firm's profile, read and changed in one
// place. The profile is a view over what is already stored, plus three new firm settings; no new table (P-600):
//   * read-only here: legal name and trading name (ExpatReady support's, Super Admin, AG01-29(7)), the firm's country (FD-68) and its key;
//   * Owner and Admin (agent/settings:edit): public phone, public email, website (new settings, read by AG-12-109), language, time zone
//     (an IANA name), default currency (CAD or USD) — each through the settings store (settings.ts), one audit line per changed key;
//   * Owner only (agent/firm-profile:manage): the billing email (platform_firm.billing_email), one audit line with before and after.
//     The business address is shown here and changed on Billing (PUT /api/platform/billing/address, PF-5 part 2), which also sets it at
//     Stripe for tax; this row does not write it twice.
// A change names the `version` it was made from; a stale one is 409 with the latest profile (STANDARDS §4, as offices). The whole save is
// one transaction: a refused field writes nothing. Firm-scoped by the guard's firm: another firm's profile is never read or written.
import { createHash } from "node:crypto";
import { HttpException, HttpStatus } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../../ports/audit.ts";
import { AuditActionNames } from "../../audit/firm-read/action-names.ts";
import { firmScope } from "../../firm-scope.ts";
import { FIELD_ERROR_STATUS, fieldsOf } from "../../http/input.ts";
import { platformAuditWorkspaceId } from "../../identity/audit.ts";
import { forbidden } from "../../identity/keys.ts";
import { CURRENCY, LANGUAGE, readSetting, registerSetting, TIME_ZONE, writeSetting } from "../../settings.ts";

type Tx = Prisma.TransactionClient;
export type ProfileActor = { firmId: string; staffId: string; keys: string[] };

const OWNER_KEY = "agent/firm-profile:manage";
const INVISIBLE = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u00ad\\u061c\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]");
/** A phone number as people write it: digits with spaces, dots, dashes, brackets and one leading +; 7 to 15 digits (ITU E.164's most). */
// Break m5: it starts with + or a digit (or one opening bracket before a digit), at most one pair of brackets, no two marks in a row.
const Phone = z.string({ error: "a phone number like +1 416 555-0100" }).trim().max(30).refine((s) => !INVISIBLE.test(s), "no control or invisible characters")
  .refine((s) => /^\+?[0-9 ().-]+$/.test(s), "digits, spaces and + ( ) . - only")
  .refine((s) => /^(\+|\(?\d)/.test(s) && (s.match(/\(/g) ?? []).length <= 1 && (s.match(/\)/g) ?? []).length <= 1 && !/[().-]{2}/.test(s.replace(/\) /g, ")")), "a phone number like +1 416 555-0100")
  .refine((s) => { const n = s.replace(/\D/g, "").length; return n >= 7 && n <= 15; }, "a phone number of 7 to 15 digits");
const Email = z.string({ error: "an email address like office@firm.ca" }).trim().max(254).pipe(z.email("an email address like office@firm.ca"));
/** Private, loopback and link-local hosts are not a website clients can open (break m4). */
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[.*\])$/i;
/** A web address the firm's clients can open: https:// or http://, a public host with a dot, no user name or password; nothing after
 *  500 characters. Break M3: control, direction and invisible characters and any space are refused before URL parsing (which would
 *  strip them), so what is stored is what was checked. */
const Website = z.string({ error: "a web address starting https://" }).trim().max(500)
  .refine((s) => !INVISIBLE.test(s) && !/\s/.test(s), "no spaces, control or invisible characters")
  .refine((s) => { try { const u = new URL(s); return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".") && !PRIVATE_HOST.test(u.hostname) && !u.username && !u.password; } catch { return false; } }, "a web address starting https:// or http://");

export const PUBLIC_PHONE = registerSetting({
  key: "platform.public_phone", ownerModule: "platform", changePermission: "agent/settings:edit", personal: true,
  description: "The firm's public phone number, shown to clients (AG01-29(7), AG-12-109). None by default.",
  schema: Phone.nullable(), default: null as string | null,
});
export const PUBLIC_EMAIL = registerSetting({
  key: "platform.public_email", ownerModule: "platform", changePermission: "agent/settings:edit", personal: true,
  description: "The firm's public email address, shown to clients (AG01-29(7), AG-12-109). None by default.",
  schema: Email.nullable(), default: null as string | null,
});
export const WEBSITE = registerSetting({
  // personal: a web address may hold an email-shaped part (medium.com/@a.b, ?to=a@b.ca), which AuditDetail refuses (break M1);
  // as a personal value it goes in the line's before and after, which may hold it.
  key: "platform.website", ownerModule: "platform", changePermission: "agent/settings:edit", personal: true,
  description: "The firm's website, shown to clients (AG01-29(7), AG-12-109). None by default.",
  schema: Website.nullable(), default: null as string | null,
});

AuditActionNames.register("platform", { "platform.firm.billing_email_changed": "Changed the firm's billing email" });

/** The details the Owner and Admin change (body name → its setting). */
const DETAILS = { publicPhone: PUBLIC_PHONE, publicEmail: PUBLIC_EMAIL, website: WEBSITE, language: LANGUAGE, timeZone: TIME_ZONE, currency: CURRENCY } as const;
type DetailName = keyof typeof DETAILS;
/** Fields only ExpatReady support changes, or nobody (AG01-29(7), FD-68): named in words when a body carries them. */
const READ_ONLY: Record<string, string> = {
  legalName: "The legal name is changed by ExpatReady support. Contact support to change it.",
  operatingName: "The trading name is changed by ExpatReady support. Contact support to change it.",
  countryCode: "The firm's country is set when the firm is created and cannot be changed.",
  key: "The firm's web address is changed by ExpatReady support. Contact support to change it.",
  businessAddress: "Change the business address on Billing, where it is also used for tax.",
};

export const SaveProfile = z.strictObject({
  version: z.string().min(1, "the version you started from").max(100),
  publicPhone: z.unknown().optional(), publicEmail: z.unknown().optional(), website: z.unknown().optional(),
  language: z.unknown().optional(), timeZone: z.unknown().optional(), currency: z.unknown().optional(),
  billingEmail: z.unknown().optional(),
});

/** Plain words for the fields whose library messages are not (break m3). */
const WORDS: Partial<Record<string, string>> = { timeZone: "Choose a time zone from the list", language: "English (en) or French (fr)", currency: "CAD or USD" };
const plain = (m: string | undefined, fallback = "This value is not allowed.") => (!m || /^Invalid /.test(m) ? fallback : m);

const refused = (detail: string, fields: Record<string, string>): never => {
  throw new HttpException({ type: "https://expatready.local/problems/profile-refused", title: "Firm profile not saved", status: FIELD_ERROR_STATUS, detail, code: "INVALID", issues: Object.entries(fields).map(([k, v]) => `${k}: ${v}`), fields }, FIELD_ERROR_STATUS);
};

export type ProfileView = {
  firm: { key: string; legalName: string | null; operatingName: string; countryCode: string };
  details: { publicPhone: string | null; publicEmail: string | null; website: string | null; language: "en" | "fr"; timeZone: string; currency: "CAD" | "USD" };
  ownerOnly: { billingEmail: string | null; businessAddress: Record<string, unknown> | null };
  /** What this person may change (the screen greys the rest). */
  canChange: { details: boolean; ownerOnly: boolean };
  readOnly: string[];
  /** AG01-22: "Setup complete" is licence + firm profile; how many people hold a licence record, and how many offices. */
  licensedStaff: number;
  offices: number;
  version: string;
};

export class FirmProfile {
  constructor(private readonly deps: { db: PrismaClient; audit: AuditPort<Tx> }) {}

  private async read(db: PrismaClient | Tx, a: ProfileActor): Promise<ProfileView> {
    const firm = await db.platformFirm.findFirstOrThrow({ where: { id: firmScope(a.firmId).firmId } });
    const details = Object.fromEntries(await Promise.all((Object.keys(DETAILS) as DetailName[]).map(async (k) => [k, await readSetting(db, a.firmId, DETAILS[k].key)]))) as ProfileView["details"];
    const [licensedStaff, offices] = await Promise.all([
      db.platformStaffCredential.count({ where: firmScope(a.firmId, { staff: { status: "ACTIVE" as const } }) }),
      db.platformOffice.count({ where: firmScope(a.firmId) }),
    ]);
    // PF-5fp-2 (review r2-m1, break r2-1): the version is built from when things changed, never from what they hold: the firm row's
    // updated_at (a billing email change sets it) and each profile setting's changed_at. A reader without the billing email can no
    // longer confirm a guessed address by hashing it with the details. Any change to the firm row (also the address on Billing)
    // gives a new version, so a save from before it is a 409 and reloads: safe, at worst one extra reload.
    const changed = await db.platformFirmSetting.findMany({ where: firmScope(a.firmId, { key: { in: (Object.keys(DETAILS) as DetailName[]).map((k) => DETAILS[k].key) } }), select: { key: true, changedAt: true }, orderBy: { key: "asc" } });
    const version = createHash("sha256").update(JSON.stringify([firm.updatedAt.toISOString(), changed.map((s) => [s.key, s.changedAt.toISOString()])])).digest("hex").slice(0, 32);
    // Break m1: the billing email and business address are the firm's legal and billing record; only those who administer the firm
    // (agent/settings:edit, Owner and Admin) read them, as the billing page shows the address to Owner and Admin only.
    const admin = a.keys.includes("agent/settings:edit");
    const ownerOnly = admin ? { billingEmail: firm.billingEmail, businessAddress: (firm.businessAddress ?? null) as Record<string, unknown> | null } : { billingEmail: null, businessAddress: null };
    return {
      firm: { key: firm.key, legalName: firm.legalName, operatingName: firm.operatingName, countryCode: firm.countryCode },
      details, ownerOnly,
      canChange: { details: a.keys.includes("agent/settings:edit"), ownerOnly: a.keys.includes(OWNER_KEY) },
      readOnly: ["legalName", "operatingName", "countryCode", "key"],
      licensedStaff, offices: Math.max(offices, 1), version,
    };
  }

  get(a: ProfileActor): Promise<ProfileView> { return this.read(this.deps.db, a); }

  /** Saves the named fields, all or nothing. Returns the profile as saved and which fields changed. */
  async save(a: ProfileActor, body: unknown): Promise<{ profile: ProfileView; changed: string[] }> {
    const raw = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
    // Every bad field named at once (review m4): read-only fields, unknown fields, the version and each value's own rule, then one
    // refusal; nothing written.
    const locked = Object.keys(raw).filter((k) => Object.hasOwn(READ_ONLY, k));   // break m2: never an inherited key (constructor)
    const bad: Record<string, string> = Object.fromEntries(locked.map((k) => [k, READ_ONLY[k]])), values: Partial<Record<DetailName, unknown>> = {};
    const p = SaveProfile.safeParse(Object.fromEntries(Object.entries(raw).filter(([k]) => !locked.includes(k))));
    if (!p.success) Object.assign(bad, fieldsOf(p.error));
    const input = (p.success ? p.data : Object.fromEntries(Object.entries(raw).filter(([k]) => Object.hasOwn(SaveProfile.shape, k)))) as z.output<typeof SaveProfile>;
    for (const k of Object.keys(DETAILS) as DetailName[]) {
      if (!(k in input)) continue;
      const v = input[k] === "" ? null : input[k];
      const r = DETAILS[k].schema.safeParse(v);
      if (r.success) values[k] = r.data; else bad[k] = WORDS[k] ?? plain(r.error.issues[0]?.message);
    }
    let billingEmail: string | undefined;
    if ("billingEmail" in input) {
      // Break M2: one spelling, lower case, as the database keeps it (platform_firm_billing_email_lower).
      const r = Email.safeParse(input.billingEmail);
      if (r.success) billingEmail = r.data.toLowerCase(); else bad.billingEmail = plain(r.error.issues[0]?.message, "an email address like office@firm.ca");
    }
    if (Object.keys(bad).length) refused(locked.length && Object.keys(bad).length === locked.length ? "Some of these details are not changed here." : "Please check the highlighted details.", bad);
    if (Object.keys(values).length && !a.keys.includes("agent/settings:edit")) forbidden("You can read the firm profile but not change it.", "NOT_ALLOWED");

    return this.deps.db.$transaction(async (tx) => {
      // Serialise saves of one firm's profile: the version check and the writes see one state (two saves at once: one 409).
      await tx.$queryRawUnsafe(`select id from platform_firm where id = $1::uuid for update`, a.firmId);
      const now = await this.read(tx, a);
      if (now.version !== input.version) throw new HttpException({ type: "https://expatready.local/problems/profile-conflict", title: "Firm profile not saved", status: 409, detail: "Someone else changed the firm profile while you were editing. The latest details are loaded: check them and save again.", latest: now }, HttpStatus.CONFLICT);
      // Owner only, and only a real change (break m6: an Admin's save that carries the unchanged billing email goes through). Checked
      // before any write, so a refused save writes nothing.
      const current = (await tx.platformFirm.findFirstOrThrow({ where: { id: firmScope(a.firmId).firmId }, select: { billingEmail: true } })).billingEmail;
      if (billingEmail !== undefined && billingEmail !== current && !a.keys.includes(OWNER_KEY)) forbidden("Only the firm's Owner can change the billing email.", "OWNER_ONLY");
      const changed: string[] = [];
      for (const k of Object.keys(values) as DetailName[]) {
        if (JSON.stringify(now.details[k]) === JSON.stringify(values[k])) continue;
        await writeSetting(tx, { firmId: a.firmId, key: DETAILS[k].key, value: values[k], by: `staff:${a.staffId}`, workspaceId: await platformAuditWorkspaceId(tx) });
        changed.push(k);
      }
      if (billingEmail !== undefined && billingEmail !== current) {
        await tx.platformFirm.updateMany({ where: { id: firmScope(a.firmId).firmId }, data: { billingEmail, updatedAt: new Date() } });   // the version's clock (PF-5fp-2)
        await this.deps.audit.record(tx, { firmId: a.firmId, actor: `staff:${a.staffId}`, action: "platform.firm.billing_email_changed", entity: "platform_firm", entityKey: a.firmId,
          summary: "The firm's billing email was changed", detail: { field: "billingEmail" }, before: { billingEmail: current }, after: { billingEmail } });
        changed.push("billingEmail");
      }
      return { profile: await this.read(tx, a), changed };
    });
  }
}
