// FO-4w (R1.26; concept fo-4-sales r2 screen 2b; AG-2-5 rules 1, 2 and 13; AG-2-49 rule 4): the firm's web-form
// settings that the embed needs: which sites may show the form, and the snippet to copy (built on the screen from the
// form's public token with embed/snippet.ts, so there is one source of the snippet's text). Owner and Admin only
// (`agent/prospect:configure-form`, PF-3's seeded key, declared on the routes in routes.ts).
//   read:  the firm's forms with their state, allowed sites, public token, hosted page and version (updated_at).
//   sites: replaces one form's allowed sites. Each entry is a site as the browser sends it (http or https, a host, an
//          optional port; no path, query, fragment or sign-in part), stored in the one form siteOf gives (lower case, no
//          trailing slash), duplicates merged, at most MAX_SITES. A refused entry names its place on the field
//          (`sites.<n>`); nothing is saved. The save names the version it read: another person's newer save → 409 STALE.
//          The row and one audit line (entity fo_web_form) are written in one transaction.
//   enabled (R1.26, QA-605; the tech lead's ruling 20 Nov: switching the form on is part of R1.26): switches one form on
//          or off. The same version check (409 STALE), the same transaction; one audit line per change
//          (fo.web_form.enabled_changed) with the state before and after in full (the port's `before`, `after`:
//          { enabled }, stored as enabled_before / enabled_after). The same state again changes nothing: no new version, no audit line. A form that is off
//          refuses public sends as before (public.ts: "This form is not available"). QA-617: switching on a form with
//          no consent wording links the firm's current wording (saveEnabled); a firm with none gets 422 on `enabled`
//          in plain words, never a 500 (the table's fo_web_form_consent_check).
// Not here (the panel's later parts, concept screen 2b): choosing a different consent wording, thank-you text.
import type { PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { actorOf, conflict, notFound, unprocessable, UUID, type Tx } from "./common.ts";
import { siteOf } from "./public.ts";

export const MAX_SITES = 20;
/** One site's length, so it always fits an audit value (ports/audit.ts: at most 200 characters; break M1). */
export const MAX_SITE_LENGTH = 200;
/** A host as a browser names a site: a domain of letters, digits and hyphens in dot-separated labels (an international
 *  name arrives as punycode from URL), or an IPv4 or bracketed IPv6 address. Never a wildcard, quote or ";" (break m1). */
const HOST = /^(?:(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?|\[[0-9a-f:.]+\])$/;
/** A list of sites for one audit value: whole sites only, cut to fit 200 characters and marked "(+n more)". */
function listFor(sites: string[]): string | null {
  if (!sites.length) return null;
  let out = "";
  for (let i = 0; i < sites.length; i++) {
    const rest = sites.length - i - 1, mark = rest ? ` (+${rest} more)` : "";
    const next = out ? `${out} ${sites[i]}` : sites[i];
    if (`${next}${mark}`.length > MAX_SITE_LENGTH) return `${out || "…"} (+${sites.length - i} more)`;
    out = next;
  }
  return out;
}

export type WebFormSettings = {
  id: string; name: string; enabled: boolean; allowedSites: string[]; publicToken: string; hostedUrl: string; version: string;
};

const view = (f: { id: string; name: string; enabled: boolean; allowedSites: string[]; publicToken: string; updatedAt: Date }, origin: string): WebFormSettings => ({
  id: f.id, name: f.name, enabled: f.enabled, allowedSites: f.allowedSites, publicToken: f.publicToken,
  hostedUrl: `${origin}/front-office/web-form/${encodeURIComponent(f.publicToken)}`, version: f.updatedAt.toISOString(),
});
const SELECT = { id: true, name: true, enabled: true, allowedSites: true, publicToken: true, updatedAt: true } as const;

/** Our own origin, where the hosted page and the embed script live (the screen builds the snippet from it). */
export function readWebForms(db: PrismaClient, ctx: StaffContext, publicOrigin: string) {
  const origin = siteOf(publicOrigin) ?? publicOrigin;
  return db.foWebForm.findMany({ where: firmScope(ctx.firmId, {}), orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: SELECT })
    .then((forms) => ({ publicOrigin: origin, forms: forms.map((f) => view(f, origin)) }));
}

/** One entry as typed → the stored site, or the reason it is refused (plain words, shown on its field). */
export function siteEntry(raw: unknown): { site: string } | { refused: string } {
  if (typeof raw !== "string" || !raw.trim()) return { refused: "Enter a site, for example https://www.example.com." };
  const t = raw.trim();
  if (t.length > MAX_SITE_LENGTH) return { refused: `This site is too long: at most ${MAX_SITE_LENGTH} characters.` };
  let u: URL;
  try { u = new URL(t); } catch { return { refused: "Enter the site with https://, for example https://www.example.com." }; }
  if (!/^https?:$/.test(u.protocol)) return { refused: "Only http:// or https:// sites can show the form." };
  if (u.username || u.password) return { refused: "Leave out any user name or password." };
  if (!HOST.test(u.hostname)) return { refused: "Enter a real site address, for example https://www.example.com (no * or other symbols)." };
  if ((u.pathname !== "/" && u.pathname !== "") || u.search || u.hash) return { refused: "Enter only the site, without a page: for example https://www.example.com, not https://www.example.com/contact." };
  const site = siteOf(t);
  return site ? { site } : { refused: "Enter the site with https://, for example https://www.example.com." };
}

/** Replace one form's allowed sites (AG-2-5 rule 1, AG-2-49 rule 4). */
export async function saveAllowedSites(db: PrismaClient, audit: AuditPort<Tx>, ctx: StaffContext, formId: string, body: unknown, publicOrigin: string) {
  if (typeof formId !== "string" || !UUID.test(formId)) return notFound("web form");
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b !== "object" || Array.isArray(b) || Object.keys(b).some((k) => k !== "sites" && k !== "version")) return unprocessable("Send the sites and the version you read.", { body: "Send the sites and the version you read." });
  if (!Array.isArray(b.sites)) return unprocessable("Send the sites as a list.", { sites: "Send the sites as a list." });
  if (b.sites.length > MAX_SITES) return unprocessable(`A form can have at most ${MAX_SITES} sites.`, { sites: `At most ${MAX_SITES} sites.` });
  if (typeof b.version !== "string" || Number.isNaN(Date.parse(b.version))) return unprocessable("Reload the page and try again.", { version: "Reload the page and try again." });
  const fields: Record<string, string> = {};
  const sites: string[] = [];
  b.sites.forEach((raw, i) => {
    const r = siteEntry(raw);
    if ("refused" in r) fields[`sites.${i}`] = r.refused;
    else if (!sites.includes(r.site)) sites.push(r.site);
  });
  if (Object.keys(fields).length) return unprocessable(Object.keys(fields).length === 1 ? Object.values(fields)[0] : "Some sites need fixing.", fields);
  const origin = siteOf(publicOrigin) ?? publicOrigin;
  return db.$transaction(async (tx) => {
    // The row is locked, then its version compared as the read gave it (an ISO string, milliseconds: a row written by SQL
    // keeps microseconds, so an equality in the WHERE would never match).
    await tx.$executeRaw`select 1 from fo_web_form where firm_id = ${ctx.firmId}::uuid and id = ${formId}::uuid for update`;
    const before = await tx.foWebForm.findFirst({ where: firmScope(ctx.firmId, { id: formId }), select: SELECT });
    if (!before) return notFound("web form");
    if (before.updatedAt.toISOString() !== b.version) return conflict("Someone else changed this form since you opened it. Reload to see their change, then make yours again.", "STALE");
    // The same list again changes nothing: no new version, no audit line (review m3).
    if (sites.length === before.allowedSites.length && sites.every((s, i) => s === before.allowedSites[i])) return view(before, origin);
    await tx.foWebForm.updateMany({ where: firmScope(ctx.firmId, { id: formId }), data: { allowedSites: sites, updatedBy: actorOf(ctx) } });
    const after = await tx.foWebForm.findFirstOrThrow({ where: firmScope(ctx.firmId, { id: formId }), select: SELECT });
    const added = sites.filter((s) => !before.allowedSites.includes(s)), removed = before.allowedSites.filter((s) => !sites.includes(s));
    await audit.record(tx, {
      firmId: ctx.firmId, actor: actorOf(ctx), action: "fo.web_form.sites_changed", entity: "fo_web_form", entityKey: formId,
      summary: `Web form "${before.name}": allowed sites changed (${sites.length} now; ${added.length} added, ${removed.length} removed).`,
      detail: { count: sites.length, addedCount: added.length, removedCount: removed.length, added: listFor(added), removed: listFor(removed) },
      // R1.8 (QA-594): the form's allowed sites before and after, in full (at most 20, MAX_SITES).
      before: { allowedSites: before.allowedSites }, after: { allowedSites: after.allowedSites },
    });
    return view(after, origin);
  });
}

/** QA-617 (Lead 8's ruling, P-294, P-610): switching on a form with no consent wording links the firm's current wording,
 *  the same one the booking page shows (its newest published EMAIL marketing wording, PF-19a; arrival-port.ts
 *  bookingConsentWording's read), inside the switch's transaction, so no database edit is ever needed. A form that
 *  already names a wording keeps it. A firm with no wording at all: the switch stays off and says why. */
const WEB_FORM_WORDING = { channel: "EMAIL", purpose: "MARKETING" } as const;
/** Why the form stays off when the firm has no consent wording (no screen sets one yet: a question for the tech lead). */
export const NO_WORDING = "This form cannot be switched on yet: your firm has no consent wording for people sending an enquiry to agree to, and no screen sets one yet.";
/** Switch one form on or off (R1.26, QA-605). */
export async function saveEnabled(db: PrismaClient, audit: AuditPort<Tx>, ctx: StaffContext, formId: string, body: unknown, publicOrigin: string) {
  if (typeof formId !== "string" || !UUID.test(formId)) return notFound("web form");
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b !== "object" || Array.isArray(b) || Object.keys(b).some((k) => k !== "enabled" && k !== "version")) return unprocessable("Send on or off and the version you read.", { body: "Send on or off and the version you read." });
  if (typeof b.enabled !== "boolean") return unprocessable("Choose on or off.", { enabled: "Choose on or off." });
  if (typeof b.version !== "string" || Number.isNaN(Date.parse(b.version))) return unprocessable("Reload the page and try again.", { version: "Reload the page and try again." });
  const enabled = b.enabled;
  const origin = siteOf(publicOrigin) ?? publicOrigin;
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`select 1 from fo_web_form where firm_id = ${ctx.firmId}::uuid and id = ${formId}::uuid for update`;
    const before = await tx.foWebForm.findFirst({ where: firmScope(ctx.firmId, { id: formId }), select: SELECT });
    if (!before) return notFound("web form");
    if (before.updatedAt.toISOString() !== b.version) return conflict("Someone else changed this form since you opened it. Reload to see their change, then make yours again.", "STALE");
    if (before.enabled === enabled) return view(before, origin);
    const linked = (await tx.foWebForm.findFirst({ where: firmScope(ctx.firmId, { id: formId }), select: { consentWordingVersionId: true } }))?.consentWordingVersionId ?? null;
    let wording = linked;
    if (enabled && !wording) {
      const current = await tx.msgConsentWording.findFirst({ where: firmScope(ctx.firmId, WEB_FORM_WORDING), orderBy: [{ publishedAt: "desc" }, { version: "desc" }], select: { id: true } });
      if (!current) return unprocessable(NO_WORDING, { enabled: NO_WORDING }, { code: "NO_CONSENT_WORDING" });
      wording = current.id;
    }
    await tx.foWebForm.updateMany({ where: firmScope(ctx.firmId, { id: formId }), data: { enabled, consentWordingVersionId: wording, updatedBy: actorOf(ctx) } });
    const after = await tx.foWebForm.findFirstOrThrow({ where: firmScope(ctx.firmId, { id: formId }), select: SELECT });
    await audit.record(tx, {
      firmId: ctx.firmId, actor: actorOf(ctx), action: "fo.web_form.enabled_changed", entity: "fo_web_form", entityKey: formId,
      summary: `Web form "${before.name}": switched ${enabled ? "on" : "off"} (was ${before.enabled ? "on" : "off"}).`,
      // R1.8 (QA-594): the form's state and its consent wording before and after, in full (stored as enabled_before /
      // enabled_after, consentWordingVersionId_before / _after; QA-617: the link made on switching on shows here).
      before: { enabled: before.enabled, consentWordingVersionId: linked }, after: { enabled: after.enabled, consentWordingVersionId: wording },
    });
    return view(after, origin);
  });
}
