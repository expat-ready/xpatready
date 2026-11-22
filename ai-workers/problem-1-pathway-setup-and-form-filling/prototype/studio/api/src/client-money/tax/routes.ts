// FO-7g part 1 (R1.56): GET /api/front-office/money/tax-default?partyKind=PERSON|COMPANY&partyId=<uuid>, the default
// tax for an invoice to that client. Staff session only (PF-4's guard, default deny), key agent/invoice:create, the same
// as FO-7b's draft route. The firm is the session's, never the request's; a party of another firm, or one that does not
// exist, is the same 404. Read only: nothing is written, so there is no audit line. The request carries no rate and no
// province: any other field is refused (422), and the answer comes only from the firm's stored province
// (platform_firm.business_address.province_state), its tax_registered and the cited table (defaults.ts).
import { Controller, Get, Inject, Query, Req } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { firmScope, ownFirm } from "../../platform/firm-scope.ts";
import { parseInput, strict } from "../../platform/http/input.ts";
import { PermissionKeys, problem, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { taxDefault, type TaxDefault } from "./defaults.ts";

const Ask = strict({ partyKind: z.enum(["PERSON", "COMPANY"]), partyId: z.guid() });   // any uuid shape, as the invoice routes take
export type TaxDefaultAnswer = TaxDefault & { partyKind: "PERSON" | "COMPANY"; partyId: string };

export class TaxDefaults {
  constructor(private readonly db: PrismaClient) {}

  async forParty(ctx: StaffContext, query: unknown): Promise<TaxDefaultAnswer> {
    // Destructured, so no ".party…" text reads as a case-side party model to CS-W3's census (a front-office client is not one).
    const { partyKind: kind, partyId: rawId } = parseInput(Ask, query), id = rawId.toLowerCase();
    // One snapshot: the party, the settings and the address are read as of the same moment.
    return this.db.$transaction(async (tx) => {
      const found = kind === "PERSON"
        ? await tx.foPerson.findFirst({ where: firmScope(ctx.firmId, { id }), select: { id: true } })
        : await tx.foCompany.findFirst({ where: firmScope(ctx.firmId, { id }), select: { id: true } });
      if (!found) return problem(404, "Not found", `No such ${kind === "PERSON" ? "person" : "company"} in your firm.`, { code: "NOT_FOUND" });
      const settings = await tx.moneyPaymentSettings.findFirst({ where: firmScope(ctx.firmId), select: { taxRegistered: true } });
      const firm = await tx.platformFirm.findFirst({ where: ownFirm(ctx.firmId), select: { businessAddress: true } });
      const address = firm?.businessAddress, province = address !== null && typeof address === "object" && !Array.isArray(address) && Object.hasOwn(address, "province_state") ? (address as Record<string, unknown>).province_state : null;
      return { partyKind: kind, partyId: found.id, ...taxDefault({ firmProvince: typeof province === "string" ? province : null, registered: settings?.taxRegistered === true }) };
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
