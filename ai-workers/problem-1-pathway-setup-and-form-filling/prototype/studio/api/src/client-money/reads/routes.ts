// FO-7q routes: the money reads, staff session only (PF-4's guard, default deny), under /api/front-office/money/*. The
// list needs agent/invoice:list, a detail agent/invoice:show (AG-6-1 §8); payments agent/invoice:show (a question for
// the tech lead in the PR: the requirement's §8 names :record for recording, not for reading). The firm is the
// session's, never the request's. GET …/invoices/:id stays FO-7b's (its InvoiceView is shared and strict); the full
// read with allowedActions is …/invoices/:id/detail.
import { Controller, Get, Inject, Param, Query, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { InvoiceReads } from "./invoices.ts";
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
