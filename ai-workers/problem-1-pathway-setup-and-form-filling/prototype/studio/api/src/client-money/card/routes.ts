// FO-7c part 1 routes (R1.57). Staff: /api/front-office/money/payment-account (PF-4's guard, default deny), both
// `agent/payment-rail:connect`: Owner-only, never on a custom role (AG-16-14); the firm is the session's, never the
// request's, so another firm's account is never reachable. Public: POST /api/hooks/stripe-connect, the processor's
// connected-account events, signed (card/account.ts checks the signature before anything else).
import { Controller, Get, Headers, HttpCode, Inject, Post, Req } from "@nestjs/common";
import express from "express";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { PaymentAccounts } from "./account.ts";

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
