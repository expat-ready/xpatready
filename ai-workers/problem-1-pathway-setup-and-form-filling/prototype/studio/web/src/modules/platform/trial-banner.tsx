// PF-16 (trial banner part; R1.90 "trial banner counts days"): the trial banner on every signed-in page in PF-6's frame,
// from GET /api/platform/billing/banner. Only for people who hold `agent/subscription:pay` (Owner and Admin, PF-3); anyone
// else never asks (the read answers them 403). Neutral (the info bar) while more than 3 days are left, amber (the warn
// bar) in the last 3 days; nothing when the firm is not in a trial or the read fails. Wording Sample.
import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Notice } from "@/components/ui/controls";
import type { Me } from "@/modules/front-office/sales/contract";
import { day } from "./saas/billing-contract";
import { staffApi, useStaffToken } from "./session";

const Banner = z.discriminatedUnion("show", [
  z.object({ show: z.literal(false) }),
  z.object({ show: z.literal(true), daysLeft: z.number().int().min(0), trialEndsAt: z.string(), cardOnFile: z.boolean().nullable(), tone: z.enum(["neutral", "amber"]) }),
]);
export const BANNER_KEY = "agent/subscription:pay", CARD_KEY = "agent/subscription:update-card";

/** The banner's words from the read (no React, so a check can read them). */
export function bannerWords(b: { daysLeft: number; trialEndsAt: string; cardOnFile: boolean | null }) {
  const end = day(b.trialEndsAt);
  const left = b.daysLeft === 0 ? `Free trial: ends today (${end}).` : `Free trial: ${b.daysLeft} ${b.daysLeft === 1 ? "day" : "days"} left (ends ${end}).`;
  return { left, card: b.cardOnFile === true ? "Card saved: your first payment is taken when the trial ends." : b.cardOnFile === false ? "Add a card before then to keep access." : null };
}

export function TrialBanner({ me }: { me: Me }) {
  const token = useStaffToken(), allowed = me.keys.includes(BANNER_KEY);
  const q = useQuery({ queryKey: ["pf", "billing-banner", token], enabled: !!token && allowed, retry: false, staleTime: 60_000, queryFn: async () => Banner.parse(await staffApi("/platform/billing/banner")) });
  const b = q.data;
  if (!allowed || !b?.show) return null;
  const w = bannerWords(b), canCard = b.cardOnFile === false && me.keys.includes(CARD_KEY), words = b.cardOnFile === false && !canCard ? null : w.card;
  return (
    <div className="mb-4" data-trial-banner={b.tone}><Notice tone={b.tone === "amber" ? "warn" : "info"}
      action={canCard ? <Link to="/settings/billing" className="shrink-0 text-sm font-medium text-text-link underline underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" data-trial-banner-card>Add a card</Link> : null}>
      <span className="font-medium text-text" data-trial-banner-days={b.daysLeft}>{w.left}</span>{words ? <> {words}</> : null}
    </Notice></div>
  );
}
