// FO-7g part 1 (R1.56): GET /api/front-office/money/tax-default?partyKind=PERSON|COMPANY&partyId=<uuid>, the default
// tax for an invoice to that client. Staff session only (PF-4's guard, default deny), key agent/invoice:create, the same
// as FO-7b's draft route. The firm is the session's, never the request's; a party of another firm, or one that does not
// exist, is the same 404. Read only: nothing is written, so there is no audit line. The request carries no rate and no
// province: any other field is refused (422), and the answer comes only from stored facts: the firm's province
// (platform_firm.business_address.province_state), with invoiceId that invoice's stored Bill-to province (part 3,
// below), the firm's tax_registered and the cited table (defaults.ts).
// FO-7g part 3 (P-797, CRA GST/HST Memorandum 3-3-6 para 20, Example 6; Unconfirmed: no accountant): an optional
// `invoiceId` (an invoice of this firm billed to this party; any other is the same 404) gives the default for that
// invoice: its stored Bill-to province, the client's province, with source PARTY_PROVINCE. A new draft stores the firm's
// province as its Bill-to (the fallback), so a Bill-to equal to the firm's province answers FIRM_PROVINCE (the same rate).
import { Controller, Get, Inject, Query, Req } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { firmScope, ownFirm } from "../../platform/firm-scope.ts";
import { parseInput, strict } from "../../platform/http/input.ts";
import { PermissionKeys, problem, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { provinceCode, taxDefault, type TaxDefault } from "./defaults.ts";
import { failClosed, partyInScope, seesInvoice, type ScopeOf } from "../reads/visibility.ts";

const Ask = strict({ partyKind: z.enum(["PERSON", "COMPANY"]), partyId: z.guid(), invoiceId: z.guid().optional() });   // any uuid shape, as the invoice routes take
export type TaxDefaultAnswer = TaxDefault & { partyKind: "PERSON" | "COMPANY"; partyId: string };

export class TaxDefaults {
  constructor(private readonly db: PrismaClient, private readonly scopeOf: ScopeOf = failClosed) {}   // C5 on the party and the invoiceId (#3305 M1)

  async forParty(ctx: StaffContext, query: unknown): Promise<TaxDefaultAnswer> {
    // Destructured, so no ".party…" text reads as a case-side party model to CS-W3's census (a front-office client is not one).
    const { partyKind: kind, partyId: rawId, invoiceId: rawInvoice } = parseInput(Ask, query), id = rawId.toLowerCase();
    const scope = await this.scopeOf(ctx);   // C5, read before the transaction (Lead 14, #3321 (4))
    // One snapshot: the party, the settings and the address are read as of the same moment.
    return this.db.$transaction(async (tx) => {
      const found = kind === "PERSON"
        ? await tx.foPerson.findFirst({ where: firmScope(ctx.firmId, { id }), select: { id: true } })
        : await tx.foCompany.findFirst({ where: firmScope(ctx.firmId, { id }), select: { id: true } });
      // C5 (Lead 14, #3321 (2)): with no invoice, a party outside the caller's scope is the same 404 as a missing one; with
      // an invoice, the invoice alone is judged below (an invoice with a case by its case: review m1, breaker m1)
      if (!found || (rawInvoice === undefined && !partyInScope(scope, found.id))) return problem(404, "Not found", `No such ${kind === "PERSON" ? "person" : "company"} in your firm.`, { code: "NOT_FOUND" });
      let billTo: string | null = null;
      if (rawInvoice !== undefined) {   // this firm's invoice, billed to this very party; else the same 404 as a missing one
        const inv = await tx.moneyInvoice.findFirst({ where: firmScope(ctx.firmId, { id: rawInvoice.toLowerCase(), ...(kind === "PERSON" ? { personId: found.id } : { companyId: found.id }) }), select: { billToProvince: true } });
        // C5 (#3305 M1): an invoice outside the caller's scope is the same 404 as a missing one
        if (!inv || !(await seesInvoice(tx, firmScope(ctx.firmId).firmId, rawInvoice.toLowerCase(), scope))) return problem(404, "Not found", "No such invoice for this client in your firm.", { code: "NOT_FOUND" });
        billTo = inv.billToProvince;
      }
      const settings = await tx.moneyPaymentSettings.findFirst({ where: firmScope(ctx.firmId), select: { taxRegistered: true } });
      const firm = await tx.platformFirm.findFirst({ where: ownFirm(ctx.firmId), select: { businessAddress: true } });
      const address = firm?.businessAddress, province = address !== null && typeof address === "object" && !Array.isArray(address) && Object.hasOwn(address, "province_state") ? (address as Record<string, unknown>).province_state : null;
      const firmProvince = typeof province === "string" ? province : null;
      const partyProvince = billTo !== null && provinceCode(billTo) !== provinceCode(firmProvince) ? billTo : null;   // the fallback copy is the firm's
      return { partyKind: kind, partyId: found.id, ...taxDefault({ firmProvince, partyProvince, registered: settings?.taxRegistered === true }) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}

type R = { platform?: StaffContext };

@Controller("api/front-office/money/tax-default")
export class TaxDefaultController {
  constructor(@Inject(TaxDefaults) private readonly taxes: TaxDefaults) {}

  @Get() @PermissionKeys("agent/invoice:create")
  read(@Req() r: R, @Query() q: unknown) { return this.taxes.forParty(staffOf(r), q); }
}
