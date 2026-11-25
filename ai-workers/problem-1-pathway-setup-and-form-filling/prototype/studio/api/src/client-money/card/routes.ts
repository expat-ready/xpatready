// FO-7c part 1 routes (R1.57). Staff: /api/front-office/money/payment-account (PF-4's guard, default deny), both
// `agent/payment-rail:connect`: Owner-only, never on a custom role (AG-16-14); the firm is the session's, never the
// request's, so another firm's account is never reachable. Public: POST /api/hooks/stripe-connect, the processor's
// connected-account events, signed (card/account.ts checks the signature before anything else).
// FO-7c part 2a: POST /api/front-office/money/invoices/:id/pay-link (`agent/payment:online`, AG-6-14 §8; no body: the
// client pays the full amount due, so any field is refused) and the client's door /api/public/pay/:token (no sign-in: the
// link's token is the key; card/pay.ts). The door's answers carry `Cache-Control: no-store` and `Referrer-Policy:
// no-referrer`, and it is rate limited as the signing door is: per (address, token) Sample 30 a minute, and an address
// that misses (malformed or unknown links) 300 times a minute gets 429 for further misses only.
import { Body, Controller, Get, Headers, HttpCode, HttpException, Inject, Param, Post, Req, Res } from "@nestjs/common";
import express from "express";
import { OpenRead } from "../../core.ts";
import { parseInput, strict } from "../../platform/http/input.ts";
import { PermissionKeys, problem, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { PaymentAccounts } from "./account.ts";
import { CardPay, LINK_NOT_WORKING, PAY_TOKEN } from "./pay.ts";

type R = { platform?: StaffContext; body?: unknown };
export const CONNECT_HOOK_PATH = "/api/hooks/stripe-connect";
/** The processor signs the exact bytes it sent: its door gets the raw body (1 MB), before the app's JSON parser. */
export function connectRawBody(app: { use: (...a: unknown[]) => unknown }) { app.use(CONNECT_HOOK_PATH, express.raw({ type: "*/*", limit: "1mb" })); }

@Controller("api/front-office/money/payment-account")
export class PaymentAccountController {
  constructor(@Inject(PaymentAccounts) private readonly accounts: PaymentAccounts) {}

  @Post("onboarding") @HttpCode(200) @PermissionKeys("agent/payment-rail:connect")
  onboard(@Req() r: R) { return this.accounts.onboard(staffOf(r)); }

  @Get() @PermissionKeys("agent/payment-rail:connect")
  view(@Req() r: R) { return this.accounts.view(staffOf(r)); }
}

@Controller("api/hooks")
export class StripeConnectHookController {
  constructor(@Inject(PaymentAccounts) private readonly accounts: PaymentAccounts) {}
  @Post("stripe-connect") @HttpCode(200)
  event(@Req() r: R, @Headers("stripe-signature") signature?: string) { return this.accounts.receive(r.body, signature); }
}

/** No body, or JSON: a body of another type is refused (415), never read as "no fields" (break m3, review minor). */
function notJson(h: Record<string, string | string[] | undefined> | undefined) {
  const type = h?.["content-type"], length = Number(h?.["content-length"] ?? 0), chunked = h?.["transfer-encoding"] !== undefined;   // break n1: a chunked body has no length
  if ((length > 0 || chunked) && !(typeof type === "string" && /^application\/json\s*(;|$)/i.test(type))) problem(415, "Send JSON", "This route takes no body, or a JSON one.", { code: "UNSUPPORTED_MEDIA_TYPE" });
}

@Controller("api/front-office/money/invoices")
export class PayLinkController {
  constructor(@Inject(CardPay) private readonly pay: CardPay) {}
  @Post(":id/pay-link") @HttpCode(200) @PermissionKeys("agent/payment:online")
  make(@Param("id") id: string, @Body() body: unknown, @Req() r: R & { headers?: Record<string, string | string[] | undefined> }) {
    // Break m3 (#3633): no body, or JSON; a body of another type is refused (415), never read as "no fields".
    notJson(r.headers); parseInput(strict({}), body ?? {}); return this.pay.makeLink(staffOf(r), id);
  }
}

const WINDOW_MS = 60_000, PER_TOKEN = 30, MISSES_PER_ADDRESS = 300, MAX_KEYS = 50_000;   // Sample, as the signing door
const hits = new Map<string, number[]>();
let swept = 0;
function over(key: string, max: number, now: number): boolean {
  if (hits.size > MAX_KEYS && now - swept > WINDOW_MS) { swept = now; for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k); }
  // Break m2 (#3633): a hard cap inside the minute too: the oldest keys go first (a Map keeps insertion order).
  for (const k of hits.keys()) { if (hits.size <= MAX_KEYS) break; hits.delete(k); }
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS), full = list.length >= max;
  if (!full) list.push(now);
  hits.set(key, list);
  return full;
}
const tooMany = (): never => problem(429, "Too many tries", "Too many tries from here. Wait a minute and open the link again.", { code: "TOO_MANY_REQUESTS" });
const missed = (ip: string): never => { if (over(`m|${ip}`, MISSES_PER_ADDRESS, Date.now())) tooMany(); return problem(404, "Not found", LINK_NOT_WORKING, { code: "LINK_NOT_WORKING" }); };
type Rq = { ip?: string; socket?: { remoteAddress?: string } };
type Rs = { setHeader(name: string, value: string): unknown };
const ipOf = (r: Rq) => String(r.ip ?? r.socket?.remoteAddress ?? "unknown");

@Controller("api/public/pay")
export class PublicPayController {
  constructor(@Inject(CardPay) private readonly pay: CardPay) {}

  private async door<T>(token: string, r: Rq, res: Rs, run: () => Promise<T>): Promise<T> {
    res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "no-referrer");
    const ip = ipOf(r);
    if (over(`t|${ip}|${typeof token === "string" ? token.slice(0, 120) : ""}`, PER_TOKEN, Date.now())) tooMany();
    if (typeof token !== "string" || !PAY_TOKEN.test(token)) missed(ip);
    try { return await run(); } catch (e) {
      if (e instanceof HttpException && e.getStatus() === 404 && (e.getResponse() as { code?: unknown })?.code === "LINK_NOT_WORKING") missed(ip);
      throw e;
    }
  }

  @OpenRead("the client's pay link: the invoice summary, the amount due and whether the card is offered; creates nothing, FO-7c part 2a") @Get(":token")   // QA-53 REVIEWED
  read(@Param("token") token: string, @Req() r: Rq, @Res({ passthrough: true }) res: Rs) { return this.door(token, r, res, () => this.pay.read(token)); }

  @Post(":token/session") @HttpCode(200)
  session(@Param("token") token: string, @Req() r: Rq & { headers?: Record<string, string | string[] | undefined> }, @Res({ passthrough: true }) res: Rs) {
    return this.door(token, r, res, () => { notJson(r.headers); return this.pay.session(token); });
  }
}
