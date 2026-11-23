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
import { Body, Controller, HttpException, Inject, Injectable, Param, Patch, Req } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { Db } from "../../core.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { z } from "zod";
import { idParam, parseInput, strict } from "../../platform/http/input.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { phoneE164Exact } from "../duplicates/phone.ts";
import { actorOf, notFound, sees, text, unprocessable, UUID, visibilityOf, type Tx } from "../sales/common.ts";
import { SALES_PORTS, type SalesPorts } from "../sales/public.ts";

/** The field's sentence for a number we cannot read (rev 17.21 ruling, worded by the brief). */
export const UNREADABLE_PHONE = "This is not a phone number we can read. Add the country code, for example +1 416 555 0100.";
export const PHONE_REQUIRED = "Enter a phone number.";
export const PHONE_EDIT_ACTION = "front_office.person.phone_changed";

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
    const other = Object.keys(b).filter((k) => k !== "phone");
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
    return this.db.$transaction(async (tx) => {
      const [p] = await tx.$queryRaw<{ id: string; phone: string | null; readable: boolean }[]>`select id::text, phone, phone_readable as readable from fo_person where firm_id = ${firmScope(ctx.firmId).firmId}::uuid and id = ${id}::uuid for update`;
      if (!p || !(await this.seen(tx, ctx, id))) return notFound("person");
      // The same number again changes nothing: no write, no audit line (breaker F4).
      if (p.phone === phone && p.readable) return { personId: p.id, phone, fixNumber: false };
      const after = await tx.foPerson.update({ where: { id }, data: { phone, phoneReadable: true }, select: { id: true, phone: true, phoneReadable: true } });
      await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: actorOf(ctx), action: PHONE_EDIT_ACTION, entity: "fo_person", entityKey: id,
        summary: `Staff ${ctx.staffId} changed the phone number of person ${id}.`, detail: { foPersonId: id, staffId: ctx.staffId },
        before: { phone: p.phone, phoneReadable: p.readable }, after: { phone: after.phone, phoneReadable: after.phoneReadable } });
      return { personId: after.id, phone: after.phone, fixNumber: !after.phoneReadable };
    });
  }
}

/** PF-28 part 3b (R1.10): `{ phone }` only, through a strict schema (an unknown field 422, named). The phone itself is
 *  left to phoneOf, so any value that is not a readable number gets the field's one sentence (breaker F7). */
const PHONE = strict({ phone: z.unknown().optional() });

@Controller("api/front-office")
export class PeopleEditController {
  constructor(@Inject(PeopleEdit) private readonly people: PeopleEdit) {}

  @Patch("people/:personId") @PermissionKeys("agent/prospect:edit")
  edit(@Req() r: { platform?: StaffContext }, @Param("personId") personId: string, @Body() b: unknown) { return this.people.editPhone(staffOf(r), idParam(personId, "person"), parseInput(PHONE, b ?? {})); }   // the id first (404), then the body
}
