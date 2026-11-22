// R1.21 (P-796, founder 22 Nov: "Yes, re-word"): the billing stand-in issues a firm's invoice with its province's sales
// tax, worked out from the firm's saved business address, on a copy with no Stripe key (a local server runs the fake
// BillingPort; runtime-ports.ts hands it over as `standIn`). No Stripe call, US$0 (P-175).
//   * POST /api/platform/billing/stand-in/invoice (the firm's Owner or Admin, `agent/subscription:pay`): the stand-in
//     plays Stripe issuing the period's invoice. 404 on any server that is not the stand-in (a Stripe key, or not local).
//     One invoice per firm (a second call answers the same invoice). The firm's address must be saved first (409).
//   * The invoice lands on the fake under the firm's stand-in customer (`cus_standin<firm id>`), so the invoices read
//     (account.ts) reads it through BillingPort like any provider invoice; nothing is written to the database.
//   * GET /api/demo/billing/invoices/:id?t=<token> (no session, like Stripe's hosted invoice link): the invoice as a
//     page; `&download=1` saves it as a file. The token is random (24 bytes) and only reached from the guarded list.
// The amount before tax is the plan's stored price for the subscription's period (Sample: platform_plan's prices are
// Sample, R1.89). The tax is GST or HST only, from the one cited CRA table (client-money/tax/canada-gst-hst.ts, read
// 22 Nov 2026, each row with its page, quote and date), rounded by the one tax rule (taxForLine, half to even). No
// provincial tax (PST, RST, QST) is computed, as that table holds none (P-701, P-568 (1)). Whether a provincial tax
// applies to a software subscription to a firm: Unconfirmed: no counsel, no accountant. Kept in this process's memory:
// a restart forgets the stand-in's invoices (the list says "No invoices yet." again), never another firm's.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Controller, Get, HttpCode, HttpException, Inject, Injectable, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { Response } from "express";
import { standInCustomer, type FakeBilling, type InvoiceTax } from "../../../../ports/billing.ts";
import { PROVINCE_CODES, PROVINCE_TAX_RATES, type ProvinceCode } from "../../client-money/tax/canada-gst-hst.ts";
import { taxForLine } from "../../client-money/invoices/tax-round.ts";
import { Db, OpenRead } from "../../core.ts";
import { firmScope } from "../firm-scope.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../identity/keys.ts";
import { BILLING_PORTS, HoldOpen } from "./routes.ts";
import type { BillingPorts } from "./webhook.ts";

export const STAND_IN_PAGE = "/api/demo/billing/invoices";
export const STAND_IN_WORDS = "Stand-in invoice: issued by our billing stand-in for testing, not by Stripe. Prices are Sample. Tax: GST/HST from the Canada Revenue Agency's rate table; no provincial sales tax is charged. Unconfirmed: no counsel, no accountant.";

/** R1.21 follow-up (Lead 4, 22 Nov): our GST/HST registration number on the invoice, from PLATFORM_GST_HST_NUMBER; unset,
 *  a Sample that cannot be mistaken for a real number. Never guessed (AGENTS rule 4). */
export const SAMPLE_GST_HST_NUMBER = "000000000 RT 0000";
export const gstHstLine = (n: string | null | undefined) => (n ? `GST/HST registration number: ${n}` : `GST/HST registration number: ${SAMPLE_GST_HST_NUMBER} (Sample: not our real number)`);

/** R1.21 follow-up (review m8): an old, unknown or wrong invoice link opens this page in words (404), never raw JSON. It
 *  is the same for every such link, so it never says whether an invoice exists. */
export const OLD_LINK_WORDS = "This invoice link has expired or is not valid.";
export const OLD_LINK_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Invoice link not valid</title>
<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a}</style></head>
<body><main data-invoice-link-not-valid><h1>${OLD_LINK_WORDS}</h1>
<p>Open <a href="/settings/billing">Plan and billing</a> to see your invoices. Sign in first if you are asked to.</p>
</main></body></html>`;

const problem = (status: number, code: string, title: string, detail: string) => new HttpException({ type: `https://expatready.local/problems/${code.toLowerCase().replace(/_/g, "-")}`, title, status, detail, code }, status);
const notHere = () => problem(404, "NOT_FOUND", "Not found", "There is no billing stand-in on this server.");

type Kept = { firmId: string; token: string; firmName: string; addressLines: string[]; planName: string; period: "MONTHLY" | "YEARLY"; source: { url: string; quote: string; readOn: string } };

/** The tax of an amount for a province, from the cited table: one line, GST or HST. */
export function standInTax(subtotalCents: number, province: ProvinceCode): InvoiceTax {
  const r = PROVINCE_TAX_RATES[province];
  return { name: r.taxName, jurisdiction: province, ratePpm: r.ratePpm, amountCents: taxForLine(subtotalCents, r.ratePpm) };
}

export class BillingStandIn {
  private readonly kept = new Map<string, Kept>();
  constructor(private readonly db: PrismaClient, private readonly ports: Pick<BillingPorts, "standIn" | "clock" | "appUrl" | "gstHstNumber">) {}
  private fake(): FakeBilling { if (!this.ports.standIn) throw notHere(); return this.ports.standIn; }

  private readonly issuing = new Map<string, Promise<unknown>>();
  /** One issue per firm at a time: a second call made while the first runs gets the same answer (never two invoices). */
  async issue(s: StaffContext) {
    this.fake();
    const running = this.issuing.get(s.firmId);
    if (running) return running;
    const p = this.issueOnce(s).finally(() => this.issuing.delete(s.firmId));
    this.issuing.set(s.firmId, p);
    return p;
  }

  private async issueOnce(s: StaffContext) {
    const fake = this.fake(), customer = standInCustomer(s.firmId);
    const had = (fake.invoiceList.get(customer) ?? [])[0];
    if (had) return { created: false, invoice: had, standIn: STAND_IN_WORDS };
    const firm = await this.db.platformFirm.findUniqueOrThrow({ where: { id: s.firmId } });
    const a = (firm.businessAddress ?? {}) as Record<string, unknown>, province = a.province_state;
    if (typeof province !== "string" || !(PROVINCE_CODES as readonly string[]).includes(province)) throw problem(409, "ADDRESS_NEEDED", "Business address needed", "Save your business address first: the tax on your invoice is worked out from it.");
    const sub = await this.db.platformSubscription.findFirst({ where: firmScope(s.firmId, { status: { not: "ENDED" as const } }), orderBy: { createdAt: "desc" }, include: { plan: true } });
    if (!sub) throw problem(404, "NOT_FOUND", "Not found", "This firm has no subscription.");
    const subtotalCents = sub.billingPeriod === "YEARLY" ? sub.plan.yearlyPriceCents : sub.plan.monthlyPriceCents;
    if (subtotalCents === null || subtotalCents === undefined) throw problem(409, "NO_PRICE", "No price for this plan", `The ${sub.plan.name} plan has no ${sub.billingPeriod === "YEARLY" ? "yearly" : "monthly"} price, so no invoice can be issued.`);
    const tax = standInTax(subtotalCents, province as ProvinceCode);
    if (sub.plan.currency.toUpperCase() !== "CAD") throw problem(409, "NOT_CAD", "Not in Canadian dollars", `The ${sub.plan.name} plan is priced in ${sub.plan.currency}; the stand-in taxes Canadian-dollar invoices only.`);   // break m4
    // Break m3: a random id and a number of the firm's own (never a counter shared across firms or reset by a restart).
    const id = `in_standin${randomBytes(12).toString("hex")}`, token = randomBytes(24).toString("base64url");
    const invoice = {
      id, number: `SAMPLE-${s.firmId.replace(/-/g, "").slice(0, 8).toUpperCase()}-0001`, status: "open" as const, amountDueCents: subtotalCents + tax.amountCents, currency: "cad" as const, createdAt: this.ports.clock.now(),
      hostedUrl: `${this.ports.appUrl}${STAND_IN_PAGE}/${id}?t=${token}`, subtotalCents, taxCents: tax.amountCents, taxLines: [tax],
    };
    const str = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
    this.kept.set(id, { firmId: s.firmId, token, firmName: firm.operatingName, planName: sub.plan.name, period: sub.billingPeriod, source: PROVINCE_TAX_RATES[province as ProvinceCode].source,
      addressLines: [[str("unit") && `Unit ${str("unit")}`, `${str("street_number")} ${str("street_name")}`].filter(Boolean).join(", "), `${str("city")}, ${province} ${str("postal_code")}`, "Canada"] });
    fake.invoiceList.set(customer, [invoice]);
    return { created: true, invoice, standIn: STAND_IN_WORDS };
  }

  /** The invoice's page (no session: the token is the key, as Stripe's hosted link). Unknown id or wrong token: 404. */
  page(id: string, token: string | undefined): { html: string; number: string } {
    const fake = this.fake(), k = this.kept.get(id);
    const same = (x: string, y: string) => x.length === y.length && timingSafeEqual(Buffer.from(x), Buffer.from(y));
    if (!k || typeof token !== "string" || !same(token, k.token)) throw problem(404, "NOT_FOUND", "Not found", "No such invoice.");
    const inv = (fake.invoiceList.get(standInCustomer(k.firmId)) ?? []).find((i) => i.id === id);
    if (!inv) throw problem(404, "NOT_FOUND", "Not found", "No such invoice.");
    const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const cad = (c: number) => `${(c / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD", currencyDisplay: "narrowSymbol" })} CAD`;
    const pct = (ppm: number | null) => (ppm === null ? "" : ` ${(ppm / 10_000).toLocaleString("en-CA", { maximumFractionDigits: 4 })} %`);
    const taxRows = (inv.taxLines ?? []).map((t) => `<tr><th scope="row">${esc(t.name)}${pct(t.ratePpm)}${t.jurisdiction ? ` (${esc(t.jurisdiction)})` : ""}</th><td>${cad(t.amountCents)}</td></tr>`).join("");
    const number = inv.number ?? id, day = new Date(inv.createdAt).toISOString().slice(0, 10);
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Invoice ${esc(number)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.4rem;border-bottom:1px solid #ccc}td{text-align:right}.note{font-size:.85rem;color:#444}</style></head>
<body><main data-stand-in-invoice="${esc(id)}"><h1>Invoice ${esc(number)}</h1>
<p>ExpatReady (Sample) to <strong>${esc(k.firmName)}</strong><br>${k.addressLines.map(esc).join("<br>")}</p>
<p data-gst-hst-number>${esc(gstHstLine(this.ports.gstHstNumber))}</p>
<p>Date: <time datetime="${day}">${day}</time> · Status: ${esc(inv.status)}</p>
<table><caption class="note">Amounts in CAD</caption><tbody>
<tr><th scope="row">${esc(k.planName)} plan, ${k.period === "YEARLY" ? "one year" : "one month"} (Sample price)</th><td>${cad(inv.subtotalCents ?? 0)}</td></tr>
${taxRows}<tr><th scope="row">Total tax</th><td data-tax-total>${cad(inv.taxCents ?? 0)}</td></tr>
<tr><th scope="row"><strong>Amount due</strong></th><td><strong>${cad(inv.amountDueCents)}</strong></td></tr></tbody></table>
<p class="note">${esc(STAND_IN_WORDS)} Rate source: <a href="${esc(k.source.url)}">${esc(k.source.url)}</a>, "${esc(k.source.quote)}", read ${esc(k.source.readOn)}.</p>
</main></body></html>`;
    return { html, number };
  }
}

@Injectable()
export class PlatformBillingStandIn extends BillingStandIn {
  constructor(@Inject(Db) db: Db, @Inject(BILLING_PORTS) ports: BillingPorts) { super(db, ports); }
}

@Controller("api/platform/billing/stand-in")
export class BillingStandInController {
  constructor(@Inject(PlatformBillingStandIn) private readonly x: PlatformBillingStandIn) {}
  @Post("invoice") @HttpCode(200) @HoldOpen() @PermissionKeys("agent/subscription:pay")   // break m2: a held firm is told to pay the open invoice
  issue(@Req() r: { platform?: StaffContext }) { return this.x.issue(staffOf(r)); }
}

@OpenRead("the billing stand-in's invoice page by its random token, as Stripe's hosted invoice link (R1.21, P-796); 404 without the stand-in")
@Controller("api/demo/billing")
export class BillingStandInPageController {
  constructor(@Inject(PlatformBillingStandIn) private readonly x: PlatformBillingStandIn) {}
  @Get("invoices/:id")
  open(@Param("id") id: string, @Query("t") t: string | undefined, @Query("download") download: string | undefined, @Res() res: Response) {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
    res.setHeader("x-content-type-options", "nosniff");
    res.removeHeader("x-powered-by");   // review m5
    let p: { html: string; number: string };
    try { p = this.x.page(id, t); } catch (e) {
      // Review m8: an old, unknown or wrong link (or no stand-in here) is one page in words, 404, never JSON.
      if (e instanceof HttpException && e.getStatus() === 404) { res.status(404).send(OLD_LINK_PAGE); return; }
      throw e;
    }
    if (download === "1") res.setHeader("content-disposition", `attachment; filename="invoice-${p.number.replace(/[^A-Za-z0-9-]/g, "")}.html"`);
    res.send(p.html);
  }
}
