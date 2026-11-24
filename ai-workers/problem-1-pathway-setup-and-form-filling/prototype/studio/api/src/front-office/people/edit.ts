// FO-9a phone part (R1.33; brief lead-b-briefs/FO-9a.md, amendment 19 Nov 11:23 IST, Lead B; rev 17.21 ruling): a staff
// edit of a person's phone. `PATCH /api/front-office/people/:personId` takes `{ phone }` only (key agent/prospect:edit).
// The number is read by FO-9a's normaliser (duplicates/phone.ts phoneE164Exact, libphonenumber-js, default region CA): a
// number that cannot be a phone number, or one that would lose a typed digit or an extension, is refused (422, the field's sentence, nothing saved); a readable one is kept in E.164,
// so it keeps its country, and "Fix number" clears (phone_readable true; the database then fills phone_e164 itself, the
// FO-9a trigger, never written here). Unlike a public door (AG-2-84 rule 5: an inquiry is never dropped), staff typing
// a number can be asked to correct it.
// Who may: own versus all as FO-2v (sales/common.ts visibilityOf, sees): all, else one of the person's leads is visible
// to the editor (their own, or an Unassigned one they may see) or a prospect they own names the person; any other
// person, another firm's or a malformed id is the same 404. The check runs under the person's row lock, in the change.
// Audited with ids only, never the number (PF-23): one audit line, entity fo_person. No event: nothing reads one yet.
// QA-779 part (a) (R1.53; the tech lead's ruling on #3532): the same route also takes `{ email }`, alone or with `{ phone }`
// (and the version read, PF-31), so a client with no email can get one by screens: the same key, the same "seen" rule,
// row lock and stale 409. FO-2's email rule (sales/common.ts `email`: trimmed, lower-cased, name@domain.tld); one that is
// not an email, or an empty one, is 422 on the field with its one sentence, nothing saved (removing an email is not asked
// for). The same address again writes nothing. One audit line per field changed, its words and ids never the address
// (before and after hold the values, R1.8, P-687, as the phone's do). Another person in the firm with that address is a
// warning in words on the answer, never a block (P-574 (2)): named only when FO-9a's match may name them, else nameless.
import { Body, Controller, HttpException, Inject, Injectable, Param, Patch, Req } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { Db } from "../../core.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { z } from "zod";
import { idParam, parseInput, strict } from "../../platform/http/input.ts";
import { PermissionKeys, problem, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { Versioned } from "../../platform/http/if-match.ts";
import { phoneE164Exact } from "../duplicates/phone.ts";
import { Duplicates } from "../duplicates/service.ts";
import { actorOf, email as emailRule, notFound, sees, text, unprocessable, UUID, visibilityOf, type Tx } from "../sales/common.ts";
import { SALES_PORTS, type SalesPorts } from "../sales/public.ts";

/** The field's sentence for a number we cannot read (rev 17.21 ruling, worded by the brief). */
export const UNREADABLE_PHONE = "This is not a phone number we can read. Add the country code, for example +1 416 555 0100.";
export const PHONE_REQUIRED = "Enter a phone number.";
export const PHONE_EDIT_ACTION = "front_office.person.phone_changed";
/** QA-779: the email field's sentences, its audit action, and the warning for a match the editor may not open. */
export const EMAIL_REQUIRED = "Enter an email address.";
export const NOT_AN_EMAIL = "This is not an email address. Check it, for example name@example.com.";
export const EMAIL_EDIT_ACTION = "front_office.person.email_changed";
export const EMAIL_HIDDEN_MATCH = "Someone you cannot open already has this email address. Ask a manager to check whether this is the same person.";
const VERSION_SENTENCE = "The person's version as read.";

@Injectable()
export class PeopleEdit {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(SALES_PORTS) private readonly ports: SalesPorts) {}

  /** The editor sees the person (FO-2v): all, a visible lead of theirs, or a prospect the editor owns that names them. */
  private async seen(tx: Tx, ctx: StaffContext, personId: string): Promise<boolean> {
    const vis = await visibilityOf(tx, ctx);
    if (vis.seesAll) return true;
    const active = new Set((await tx.platformStaff.findMany({ where: firmScope(ctx.firmId, { status: "ACTIVE" as const }), select: { id: true } })).map((s) => s.id));
    const leads = await tx.foLead.findMany({ where: firmScope(ctx.firmId, { personId }), select: { ownerStaffId: true } });
    if (leads.some((l) => sees(vis, ctx, l.ownerStaffId && active.has(l.ownerStaffId) ? l.ownerStaffId : null))) return true;
    return (await tx.foProspect.count({ where: firmScope(ctx.firmId, { ownerStaffId: ctx.staffId, OR: [{ subjectPersonId: personId }, { primaryContactPersonId: personId }] }) })) > 0;
  }

  /** `{ phone }` only: refused before any read, so a refusal never says whether the person exists. */
  private phoneOf(b: unknown): string {
    if (!b || typeof b !== "object" || Array.isArray(b)) return unprocessable("Send the phone number.", { phone: PHONE_REQUIRED });
    const other = Object.keys(b).filter((k) => k !== "phone" && k !== "version");   // PF-31: the version read, optional
    if (other.length) return unprocessable("Only the phone number can be changed here.", Object.fromEntries(other.slice(0, 10).map((k) => [k.slice(0, 40), "Only the phone number can be changed here."])));
    const v = (b as { phone?: unknown }).phone;
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) return unprocessable(`Phone: ${PHONE_REQUIRED}`, { phone: PHONE_REQUIRED });
    // FO-2's text rule (one line, no control or invisible mark, at most 40 characters); any refusal is the field's one
    // sentence, never the shared helper's fragment (breaker F7).
    let typed: string | null;
    try { typed = text(v, { field: "phone", what: "Phone", max: 40 }); } catch (e) { if (e instanceof HttpException && e.getStatus() === 422) typed = null; else throw e; }
    return (typed !== null ? phoneE164Exact(typed) : null) ?? unprocessable(`Phone: ${UNREADABLE_PHONE}`, { phone: UNREADABLE_PHONE });
  }

  async editPhone(ctx: StaffContext, personId: string, b: unknown) {
    if (typeof personId !== "string" || !UUID.test(personId)) return notFound("person");
    const phone = this.phoneOf(b), id = personId.toLowerCase();
    // PF-31: a screen names the version it read (body or If-Match); a stale one is 409 with the latest number, nothing written.
    const version = (b as { version?: unknown }).version;
    if (version !== undefined && (typeof version !== "string" || version.length > 100)) return unprocessable("version: the person's version as read.", { version: "The person's version as read." });
    return this.db.$transaction(async (tx) => {
      const [p] = await tx.$queryRaw<{ id: string; phone: string | null; readable: boolean; updated_at: Date }[]>`select id::text, phone, phone_readable as readable, updated_at from fo_person where firm_id = ${firmScope(ctx.firmId).firmId}::uuid and id = ${id}::uuid for update`;
      if (!p || !(await this.seen(tx, ctx, id))) return notFound("person");
      if (version !== undefined && version !== p.updated_at.toISOString()) return problem(409, "Changed since you opened it", "Someone changed this person's details since you opened them.", { code: "STALE", current: { phone: p.phone, fixNumber: !p.readable, version: p.updated_at.toISOString() } });
      // The same number again changes nothing: no write, no audit line (breaker F4).
      if (p.phone === phone && p.readable) return { personId: p.id, phone, fixNumber: false, version: p.updated_at.toISOString() };
      const after = await tx.foPerson.update({ where: { id }, data: { phone, phoneReadable: true }, select: { id: true, phone: true, phoneReadable: true, updatedAt: true } });
      await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: actorOf(ctx), action: PHONE_EDIT_ACTION, entity: "fo_person", entityKey: id,
        summary: `Staff ${ctx.staffId} changed the phone number of person ${id}.`, detail: { foPersonId: id, staffId: ctx.staffId },
        before: { phone: p.phone, phoneReadable: p.readable }, after: { phone: after.phone, phoneReadable: after.phoneReadable } });
      return { personId: after.id, phone: after.phone, fixNumber: !after.phoneReadable, version: after.updatedAt.toISOString() };
    });
  }

  /** QA-779: `{ email }`, with `{ phone }` optional: refused before any read, as the phone. */
  private contactOf(b: unknown): { email: string; phone: string | null } {
    if (!b || typeof b !== "object" || Array.isArray(b)) return unprocessable("Send the email address.", { email: EMAIL_REQUIRED });
    const other = Object.keys(b).filter((k) => !["email", "phone", "version"].includes(k));
    if (other.length) return unprocessable("Only the email address and the phone number can be changed here.", Object.fromEntries(other.slice(0, 10).map((k) => [k.slice(0, 40), "Only the email address and the phone number can be changed here."])));
    const v = (b as { email?: unknown }).email, ph = (b as { phone?: unknown }).phone;
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) return unprocessable(`Email: ${EMAIL_REQUIRED}`, { email: EMAIL_REQUIRED });
    // FO-2's rule (the one every arrival door stores by); any refusal is the field's one sentence (as the phone, breaker F7).
    let address: string | null;
    try { address = emailRule(v); } catch (e) { if (e instanceof HttpException && e.getStatus() === 422) address = null; else throw e; }
    if (!address) return unprocessable(`Email: ${NOT_AN_EMAIL}`, { email: NOT_AN_EMAIL });
    return { email: address, phone: ph === undefined ? null : this.phoneOf({ phone: ph }) };
  }

  /** QA-779: the email (and the phone when sent) in one change under the person's row lock. */
  async editEmail(ctx: StaffContext, personId: string, b: unknown) {
    if (typeof personId !== "string" || !UUID.test(personId)) return notFound("person");
    const { email, phone } = this.contactOf(b), id = personId.toLowerCase();
    const version = (b as { version?: unknown }).version;
    if (version !== undefined && (typeof version !== "string" || version.length > 100)) return unprocessable(`version: ${VERSION_SENTENCE}`, { version: VERSION_SENTENCE });
    // P-574 (2): who else has this address, read before the change, so the person never matches themself (their own
    // address is another one until it commits; the same one again is no change and gets no warning).
    const others = await new Duplicates(this.db).check(ctx, { email });
    const out = await this.db.$transaction(async (tx) => {
      const [p] = await tx.$queryRaw<{ id: string; email: string | null; phone: string | null; readable: boolean; updated_at: Date }[]>`select id::text, email, phone, phone_readable as readable, updated_at from fo_person where firm_id = ${firmScope(ctx.firmId).firmId}::uuid and id = ${id}::uuid for update`;
      if (!p || !(await this.seen(tx, ctx, id))) return notFound("person");
      const now = { personId: p.id, email: p.email, phone: p.phone, fixNumber: !p.readable, version: p.updated_at.toISOString() };
      if (version !== undefined && version !== now.version) return problem(409, "Changed since you opened it", "Someone changed this person's details since you opened them.", { code: "STALE", current: { email: now.email, phone: now.phone, fixNumber: now.fixNumber, version: now.version } });
      const newEmail = p.email !== email, newPhone = phone !== null && !(p.phone === phone && p.readable);
      if (!newEmail && !newPhone) return { ...now, changed: false };   // the same again changes nothing: no write, no audit line
      const after = await tx.foPerson.update({ where: { id }, data: { ...(newEmail ? { email } : {}), ...(newPhone ? { phone, phoneReadable: true } : {}) }, select: { id: true, email: true, phone: true, phoneReadable: true, updatedAt: true } });
      const line = { firmId: ctx.firmId, actor: actorOf(ctx), entity: "fo_person", entityKey: id, detail: { foPersonId: id, staffId: ctx.staffId } };
      if (newEmail) await this.ports.audit.record(tx, { ...line, action: EMAIL_EDIT_ACTION, summary: `Staff ${ctx.staffId} changed the email address of person ${id}.`, before: { email: p.email }, after: { email: after.email } });
      if (newPhone) await this.ports.audit.record(tx, { ...line, action: PHONE_EDIT_ACTION, summary: `Staff ${ctx.staffId} changed the phone number of person ${id}.`,
        before: { phone: p.phone, phoneReadable: p.readable }, after: { phone: after.phone, phoneReadable: after.phoneReadable } });
      return { personId: after.id, email: after.email, phone: after.phone, fixNumber: !after.phoneReadable, version: after.updatedAt.toISOString(), changed: newEmail };
    });
    const { changed, ...answer } = out;
    if (!changed) return answer;
    const named = others.matches.flatMap((m) => (m.kind === "PERSON" && m.personId !== id ? [m.lead ? `${m.name} (${m.lead})` : m.name] : []));
    const warning = [named.length ? `${named.join(", ")} already ${named.length === 1 ? "has" : "have"} this email address. Check whether this is the same person.` : "", others.hidden ? EMAIL_HIDDEN_MATCH : ""].filter(Boolean).join(" ");
    return warning ? { ...answer, warning } : answer;
  }
}

/** PF-28 part 3b (R1.10): `{ phone }`, and QA-779's `{ email }`, through a strict schema (an unknown field 422, named). The
 *  values are left to phoneOf and contactOf, so any value that is not a readable number or an email gets the field's one
 *  sentence (breaker F7). A body without `email` is the phone's, exactly as before. */
const PHONE = strict({ phone: z.unknown().optional(), email: z.unknown().optional(), version: z.string().max(100).optional() });

@Controller("api/front-office")
export class PeopleEditController {
  constructor(@Inject(PeopleEdit) private readonly people: PeopleEdit) {}

  @Patch("people/:personId") @PermissionKeys("agent/prospect:edit") @Versioned()   // PF-31: the version as If-Match too
  edit(@Req() r: { platform?: StaffContext }, @Param("personId") personId: string, @Body() b: unknown) {
    const id = idParam(personId, "person"), body = parseInput(PHONE, b ?? {});   // the id first (404), then the body
    return body.email !== undefined ? this.people.editEmail(staffOf(r), id, body) : this.people.editPhone(staffOf(r), id, body);
  }
}
