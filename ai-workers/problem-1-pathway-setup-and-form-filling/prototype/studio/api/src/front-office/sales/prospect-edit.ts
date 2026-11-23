// FO-2pv (brief lead-b-briefs/FO-2pv.md; QA-530; AG-2-18 rules 3 and 5; R1.31): staff set a prospect's value and its
// currency, so the board's totals per currency have something to add. `PATCH prospects/:id { value, currency }`: the
// amount is a decimal of 0 or more with at most 2 places, kept as cents, or null to clear it; the currency is one of the
// fixed list (contracts/currencies.ts). Seen as the prospect's own read sees it (another firm's, or one the person may
// not see, is 404). One audit line with ids and the currency, never the amount (PF-23); no outbox event (nothing reads
// one yet); no conversion between currencies, ever. In a file of its own, with its own small controller, so neither
// prospects.ts nor routes.ts changes while FO-2w edits them.
import { Body, Controller, Get, Inject, Injectable, Param, Patch, Req } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { centsOf, CURRENCIES, CURRENCY_REFUSED, isCurrency } from "../../../../contracts/currencies.ts";
import { Db } from "../../core.ts";
import { z } from "zod";
import { idParam, parseInput, strict } from "../../platform/http/input.ts";
import { PermissionKeys, problem, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { CURRENCY, readSetting } from "../../platform/settings.ts";
import { actorOf, notFound, UUID, visibilityOf } from "./common.ts";
import { Prospects } from "./prospects.ts";
import { SALES_PORTS, type SalesPorts } from "./public.ts";

/** The audit action of a value edit (an audit line only; not an outbox event name). */
export const VALUE_SET = "prospect.value_set";
/** PF-28 part 3b (R1.10): the body through a strict schema (an unknown field 422, named); the value and currency rules stay below. */
const VALUE = strict({ value: z.union([z.number(), z.string().max(40), z.null()], { error: "The value is an amount, like 1500 or 1500.50, or empty." }).optional(), currency: z.string().max(40).nullish() });
const refused = (field: string, detail: string) => problem(422, "Check the details", detail, { code: "INVALID", fields: { [field]: detail } });

@Injectable()
export class ProspectEdit {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(SALES_PORTS) private readonly ports: SalesPorts, @Inject(Prospects) private readonly prospects: Prospects) {}

  /** What the Value panel offers: the firm's default currency (the setting `platform.currency`, CAD unless the firm
   *  chose otherwise), shown first for a prospect that has no value yet, and the fixed list. */
  async currencies(ctx: StaffContext) {
    return { default: (await readSetting<string>(this.db, ctx.firmId, CURRENCY.key)) ?? CURRENCY.default, currencies: CURRENCIES };
  }

  /** Set, change or clear the value. Both fields are sent: the screen edits them together, and a value never changes
   *  currency by itself. Nothing is written when either is refused. */
  async value(ctx: StaffContext, id: string, b: Record<string, unknown>) {
    if (typeof id !== "string" || !UUID.test(id)) return notFound("prospect");
    const amount = centsOf(b.value === undefined ? "" : b.value);
    if ("refused" in amount) return refused("value", amount.refused);
    if (!isCurrency(b.currency)) return refused("currency", CURRENCY_REFUSED);
    const currency = b.currency, pid = id.toLowerCase();
    const vis = await visibilityOf(this.db, ctx);
    await this.db.$transaction(async (tx) => {
      // The row is locked and seen again inside the change, as every prospect change is (FO-2 part 3).
      const [p] = await tx.$queryRaw<{ number: string; owner_staff_id: string | null; value_cents: number | null; currency: string }[]>`
        select number, owner_staff_id::text, value_cents, currency from fo_prospect where firm_id = ${ctx.firmId}::uuid and id = ${pid}::uuid for update`;
      if (!p || !(vis.seesAll || p.owner_staff_id === ctx.staffId)) return notFound("prospect");
      if (p.value_cents === amount.cents && p.currency === currency) return;   // nothing changed: no write, no audit line
      await tx.foProspect.update({ where: { id: pid }, data: { valueCents: amount.cents, currency } });
      await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: actorOf(ctx), action: VALUE_SET, entity: "fo_prospect", entityKey: pid,
        summary: `Staff ${ctx.staffId} ${amount.cents === null ? "cleared" : p.value_cents === null ? "set" : "changed"} the value of ${p.number}.`,
        detail: { currency, previousCurrency: p.currency, hasValue: amount.cents !== null, hadValue: p.value_cents !== null },
        before: { valueCents: p.value_cents, currency: p.currency }, after: { valueCents: amount.cents, currency } });
    });
    return this.prospects.read(ctx, pid);
  }
}

/** The staff route (key edit; PF-4's guard refuses the rest). No other route answers PATCH on a prospect. */
@Controller("api/front-office")
export class ProspectEditController {
  constructor(@Inject(ProspectEdit) private readonly edit: ProspectEdit) {}

  @Get("prospect-currencies") @PermissionKeys("agent/prospect:show")
  currencies(@Req() r: { platform?: StaffContext }) { return this.edit.currencies(staffOf(r)); }

  @Patch("prospects/:id") @PermissionKeys("agent/prospect:edit")
  value(@Req() r: { platform?: StaffContext }, @Param("id") id: string, @Body() b: Record<string, unknown>) { return this.edit.value(staffOf(r), idParam(id, "prospect"), parseInput(VALUE, b ?? {})); }
}
