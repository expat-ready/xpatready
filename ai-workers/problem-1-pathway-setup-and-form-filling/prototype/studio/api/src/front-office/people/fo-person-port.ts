// FO-1p: the real FoPersonPort (ports/fo-person.ts) over fo_person and fo_company, inside the caller's transaction (it
// never opens its own; CS-K1 part 2's case opening). It reuses the front office's own rules: FO-9a's exact phone normaliser
// (duplicates/phone.ts phoneE164Exact, libphonenumber-js; FO-9b), FO-2b's company name key (sales/corporate/match.ts), and FO-1a's one seed
// helper (firm-seed.ts seedFirmFrontOffice) for a firm whose sales setup row is not there yet, so a case opening never
// fails over it. A prospect's own party is read under a share lock, so a Change type waits for the caller's commit. No
// match, link or merge here (BR-2: FO-9a's warning and FO-9b's merge own that). One audit line per party made, ids only.
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { AuditPort } from "../../../../ports/audit.ts";
import { FO_PERSON_ACTION, FoPersonKindMismatch, FoPersonNotFound, keepPhone, NO_FRONT_OFFICE, nameParts, parseCompanyInput, parsePersonInput, prospectIdOrMiss, type EnsureCompanyForClientInput, type EnsureForClientInput, type FoPersonPort } from "../../../../ports/fo-person.ts";
import { auditEvent } from "../../platform/audit/audit-event.ts";
import { firmScope, ownFirm } from "../../platform/firm-scope.ts";
import { phoneE164Exact } from "../duplicates/phone.ts";
import { seedFirmFrontOffice } from "../firm-seed.ts";
import { normaliseCompanyName } from "../sales/corporate/match.ts";

type Tx = Prisma.TransactionClient;
type Kind = "INDIVIDUAL" | "CORPORATE";

export class PrismaFoPerson implements FoPersonPort<Tx> {
  constructor(private readonly audit: AuditPort<Tx> = auditEvent) {}

  async ensureForClient(tx: Tx, raw: EnsureForClientInput): Promise<{ foPersonId: string }> {
    const a = parsePersonInput(raw), firmId = firmScope(a.firmId).firmId;
    if (a.prospectId !== null) return { foPersonId: await this.party(tx, firmId, a.prospectId, "INDIVIDUAL") };
    await this.setup(tx, firmId);
    const phone = a.phone === null ? null : keepPhone(a.phone, phoneE164Exact), id = randomUUID();
    await tx.foPerson.create({ data: { id, firmId, ...nameParts(a), email: a.email, phone: phone?.phone ?? null, phoneReadable: phone?.readable ?? true, createdBy: a.actor } });
    await this.audit.record(tx, { firmId, actor: a.actor, action: FO_PERSON_ACTION.PERSON, entity: "fo_person", entityKey: id, summary: "A front-office person was made for a new case client.", detail: { foPersonId: id },
      before: null, after: { ...nameParts(a), email: a.email, phone: phone?.phone ?? null, phoneReadable: phone?.readable ?? true } });
    return { foPersonId: id };
  }

  async ensureCompanyForClient(tx: Tx, raw: EnsureCompanyForClientInput): Promise<{ foCompanyId: string }> {
    const a = parseCompanyInput(raw), firmId = firmScope(a.firmId).firmId;
    if (a.prospectId !== null) return { foCompanyId: await this.party(tx, firmId, a.prospectId, "CORPORATE") };
    await this.setup(tx, firmId);
    const id = randomUUID();
    await tx.foCompany.create({ data: { id, firmId, operatingName: a.name, normalisedName: normaliseCompanyName(a.name), createdBy: a.actor } });
    await this.audit.record(tx, { firmId, actor: a.actor, action: FO_PERSON_ACTION.COMPANY, entity: "fo_company", entityKey: id, summary: "A front-office company was made for a new case client.", detail: { foCompanyId: id },
      before: null, after: { operatingName: a.name } });
    return { foCompanyId: id };
  }

  /** The prospect's subject (its person or its company), or the port's refusals. Firm-scoped, so another firm's id is
   *  the same miss as none (and the firm walls hide it too). */
  private async party(tx: Tx, firmId: string, prospectId: string, want: Kind): Promise<string> {
    const id = prospectIdOrMiss(prospectId);
    const [p] = await tx.$queryRaw<{ type: Kind; person: string | null; company: string | null }[]>`
      select type::text as type, subject_person_id::text as person, subject_company_id::text as company
        from fo_prospect where firm_id = ${firmScope(firmId).firmId}::uuid and id = ${id}::uuid for share`;
    if (!p) throw new FoPersonNotFound();
    if (p.type !== want) throw new FoPersonKindMismatch(want === "INDIVIDUAL" ? "This prospect is a company: ask for its company." : "This prospect is a person: ask for its person.");
    return (want === "INDIVIDUAL" ? p.person : p.company)!;   // fo_prospect_subject_check: the type's subject is set
  }

  /** FO-1a's seed, once, when the firm has no sales setup row yet (it makes the row and the firm's front office). A firm
   *  this transaction cannot see (unknown, or walled to another firm), or one FO-1a seeds none for (DELETED, ABANDONED),
   *  is FoPersonNotFound, never a database error. */
  private async setup(tx: Tx, firmId: string): Promise<void> {
    const has = async () => !!(await tx.foSalesSetup.findFirst({ where: firmScope(firmId), select: { firmId: true } }));
    if (await has()) return;
    if (!(await tx.platformFirm.findFirst({ where: ownFirm(firmId), select: { id: true } }))) throw new FoPersonNotFound(NO_FRONT_OFFICE);
    await seedFirmFrontOffice(tx, firmId);
    if (!(await has())) throw new FoPersonNotFound(NO_FRONT_OFFICE);
  }
}

/** The one instance the API binds (FO_PERSON_PORT, api/src/features/front-office-sales.ts). */
export const foPersonPort: FoPersonPort<Tx> = new PrismaFoPerson();
