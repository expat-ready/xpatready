// FO-9a phone part (R1.33; brief lead-b-briefs/FO-9a.md, amendment 19 Nov 11:23 IST, Lead B; rev 17.21 ruling): a staff
// edit of a person's phone. `PATCH /api/front-office/people/:personId` takes `{ phone }` only (key agent/prospect:edit).
// The number is read by FO-9a's one normaliser (duplicates/phone.ts, libphonenumber-js, default region CA): a number
// that cannot be a phone number is refused (422, the field's sentence, nothing saved); a readable one is kept in E.164,
// so it keeps its country, and "Fix number" clears (phone_readable true; the database then fills phone_e164 itself, the
// FO-9a trigger, never written here). Unlike a public door (AG-2-84 rule 5: an inquiry is never dropped), staff typing
// a number can be asked to correct it.
// Who may: own versus all as FO-2v (sales/common.ts visibilityOf, sees): all, else one of the person's leads is visible
// to the editor (their own, or an Unassigned one they may see) or a prospect they own names the person; any other
// person, another firm's or a malformed id is the same 404. The check runs under the person's row lock, in the change.
// Audited with ids only, never the number (PF-23): one audit line, entity fo_person. No event: nothing reads one yet.
import { Body, Controller, Inject, Injectable, Param, Patch, Req } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { Db } from "../../core.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { phoneE164 } from "../duplicates/phone.ts";
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
    const typed = text((b as { phone?: unknown }).phone, { field: "phone", what: "Phone", max: 40 });
    if (typed === null) return unprocessable(`Phone: ${PHONE_REQUIRED}`, { phone: PHONE_REQUIRED });
    return phoneE164(typed) ?? unprocessable(`Phone: ${UNREADABLE_PHONE}`, { phone: UNREADABLE_PHONE });
  }

  async editPhone(ctx: StaffContext, personId: string, b: unknown) {
    if (typeof personId !== "string" || !UUID.test(personId)) return notFound("person");
    const phone = this.phoneOf(b), id = personId.toLowerCase();
    return this.db.$transaction(async (tx) => {
      const [p] = await tx.$queryRaw<{ id: string }[]>`select id::text from fo_person where firm_id = ${firmScope(ctx.firmId).firmId}::uuid and id = ${id}::uuid for update`;
      if (!p || !(await this.seen(tx, ctx, id))) return notFound("person");
      const after = await tx.foPerson.update({ where: { id }, data: { phone, phoneReadable: true }, select: { id: true, phone: true, phoneReadable: true } });
      await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: actorOf(ctx), action: PHONE_EDIT_ACTION, entity: "fo_person", entityKey: id,
        summary: `Staff ${ctx.staffId} changed the phone number of person ${id}.`, detail: { foPersonId: id, staffId: ctx.staffId } });
      return { personId: after.id, phone: after.phone, fixNumber: !after.phoneReadable };
    });
  }
}

@Controller("api/front-office")
export class PeopleEditController {
  constructor(@Inject(PeopleEdit) private readonly people: PeopleEdit) {}

  @Patch("people/:personId") @PermissionKeys("agent/prospect:edit")
  edit(@Req() r: { platform?: StaffContext }, @Param("personId") personId: string, @Body() b: unknown) { return this.people.editPhone(staffOf(r), personId, b); }
}
