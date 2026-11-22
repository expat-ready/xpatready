// PF-16 (trial banner part; R1.90 "trial banner counts days"): the trial banner on every signed-in page in PF-6's frame,
// from GET /api/platform/billing/banner. Only for people who hold `agent/subscription:pay` (Owner and Admin, PF-3); anyone
// else never asks (the read answers them 403). Neutral (the info bar) while more than 3 days are left, amber (the warn
// bar) in the last 3 days and once the end has passed; nothing when the firm is not in a trial or the read fails. Its words
// are Plan and billing's own trial line (`trialLine`, PF-5s part 2: an end passed, a trial set to cancel, a card saved,
// Stripe unreachable), so the two never disagree (review M1, M2). Wording Sample.
import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Notice } from "@/components/ui/controls";
import type { Me } from "@/modules/front-office/sales/contract";
import { trialLine, type Billing } from "./saas/billing-contract";
import { staffApi, useStaffToken } from "./session";

export const BannerAnswer = z.discriminatedUnion("show", [
  z.object({ show: z.literal(false) }),
  z.object({ show: z.literal(true), daysLeft: z.number().int().min(0), trialEndsAt: z.string(), cardOnFile: z.boolean().nullable(), cancelAtPeriodEnd: z.boolean().nullable(), tone: z.enum(["neutral", "amber"]) }),
]);
type Shown = Extract<z.infer<typeof BannerAnswer>, { show: true }>;
export const BANNER_KEY = "agent/subscription:pay", CARD_KEY = "agent/subscription:update-card";

/** The banner's words: Plan and billing's trial line for the same facts (no React, so a check can read them). */
export function bannerWords(b: Shown, now: number, canCard: boolean): { text: string; next: string | null } {
  const facts = { status: "TRIAL", trialEndsAt: b.trialEndsAt, cardOnFile: b.cardOnFile, cancelAtPeriodEnd: b.cancelAtPeriodEnd, billingAvailable: b.cardOnFile !== null } as Billing;
  const t = trialLine(facts, now, canCard);
  return { text: t?.text ?? "", next: t?.next ?? null };
}

export function TrialBanner({ me }: { me: Me }) {
  const token = useStaffToken(), here = useLocation().pathname, allowed = me.keys.includes(BANNER_KEY);
  const q = useQuery({ queryKey: ["pf", "billing-banner", token], enabled: !!token && allowed, retry: false, staleTime: 60_000, queryFn: async () => BannerAnswer.parse(await staffApi("/platform/billing/banner")) });
  const b = q.data;
  if (!allowed || !b?.show) return null;
  const w = bannerWords(b, Date.now(), me.keys.includes(CARD_KEY));
  return (
    <div className="mb-4" data-trial-banner={b.tone}><Notice tone={b.tone === "amber" ? "warn" : "info"}
      action={w.next && here !== "/settings/billing" ? <Link to="/settings/billing" className="shrink-0 text-sm font-medium text-text-link underline underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" data-trial-banner-card>Add a card</Link> : null}>
      <span className="font-medium text-text" data-trial-banner-days={b.daysLeft}>{w.text}</span>{w.next ? <> {w.next}</> : null}
    </Notice></div>
  );
}
