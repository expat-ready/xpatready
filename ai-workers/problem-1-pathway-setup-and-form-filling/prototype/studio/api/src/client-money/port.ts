// FO-7b part 1b (Lead B amendment 5): ClientMoneyPort's adapter over the money_* tables (the interface and its fake are
// in ports/client-money.ts). Other modules ask this; nothing outside api/src/client-money/ reads or writes money_*.
import type { PrismaClient } from "@prisma/client";
import { MoneyParty, type ClientMoneyPort } from "../../../ports/client-money.ts";
import { firmScope } from "../platform/firm-scope.ts";

export class ClientMoney implements ClientMoneyPort {
  constructor(private readonly db: PrismaClient) {}
  /** Any invoice (draft or issued), trust request, trust entry or credit entry of the party in the firm. Every payment
   *  hangs from one of them (an invoice, a request, or its trust deposit), so none is missed. FO-9b part 2: also a tax
   *  treatment set for the party (money_party_tax_treatment) and a trust entry that names the party as its payee (a
   *  refund paid to them), so a party with either is never merged by itself (P-574 (2)). */
  async hasMoney(firmId: string, party: MoneyParty): Promise<boolean> {
    const p = MoneyParty.parse(party), where = firmScope(firmId, p.personId ? { personId: p.personId.toLowerCase() } : { companyId: p.companyId!.toLowerCase() });
    const payee = firmScope(firmId, p.personId ? { payeePersonId: p.personId.toLowerCase() } : { payeeCompanyId: p.companyId!.toLowerCase() });
    const found = await Promise.all([this.db.moneyInvoice.findFirst({ where, select: { id: true } }), this.db.moneyTrustRequest.findFirst({ where, select: { id: true } }),
      this.db.moneyTrustEntry.findFirst({ where, select: { id: true } }), this.db.moneyCreditEntry.findFirst({ where, select: { id: true } }),
      this.db.moneyPartyTaxTreatment.findFirst({ where, select: { id: true } }), this.db.moneyTrustEntry.findFirst({ where: payee, select: { id: true } })]);
    return found.some(Boolean);
  }
}
