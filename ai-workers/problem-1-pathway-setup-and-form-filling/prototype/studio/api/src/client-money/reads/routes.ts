// FO-7q routes: the money reads, staff session only (PF-4's guard, default deny), under /api/front-office/money/*. The
// list needs agent/invoice:list, a detail agent/invoice:show (AG-6-1 §8); payments agent/invoice:show (a question for
// the tech lead in the PR: the requirement's §8 names :record for recording, not for reading). The firm is the
// session's, never the request's. GET …/invoices/:id stays FO-7b's (its InvoiceView is shared and strict); the full
// read with allowedActions is …/invoices/:id/detail. Part 3: GET …/money/parties (agent/invoice:list), won parties only.
import { Controller, Get, Inject, Param, Query, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { InvoiceReads } from "./invoices.ts";
import { PartyReads } from "./parties.ts";
import { PaymentReads } from "./payments.ts";

type R = { platform?: StaffContext };

@Controller("api/front-office/money/invoices")
export class InvoiceReadsController {
  constructor(@Inject(InvoiceReads) private readonly reads: InvoiceReads) {}

  @Get() @PermissionKeys("agent/invoice:list")
  list(@Req() r: R, @Query() q: unknown) { return this.reads.list(staffOf(r), q); }

  @Get(":id/detail") @PermissionKeys("agent/invoice:show")
  detail(@Req() r: R, @Param("id") id: string) { return this.reads.detail(staffOf(r), id); }
}

@Controller("api/front-office/money/payments")
export class PaymentReadsController {
  constructor(@Inject(PaymentReads) private readonly reads: PaymentReads) {}

  @Get() @PermissionKeys("agent/invoice:show")
  list(@Req() r: R, @Query() q: unknown) { return this.reads.list(staffOf(r), q); }

  @Get(":id") @PermissionKeys("agent/invoice:show")
  one(@Req() r: R, @Param("id") id: string) { return this.reads.one(staffOf(r), id); }
}

// FO-7q part 3 (G2): the won-party search the invoice builder's Bill to uses; the same key as the invoice list.
@Controller("api/front-office/money/parties")
export class PartyReadsController {
  constructor(@Inject(PartyReads) private readonly reads: PartyReads) {}

  @Get() @PermissionKeys("agent/invoice:list")
  search(@Req() r: R, @Query() q: unknown) { return this.reads.search(staffOf(r), q); }
}
