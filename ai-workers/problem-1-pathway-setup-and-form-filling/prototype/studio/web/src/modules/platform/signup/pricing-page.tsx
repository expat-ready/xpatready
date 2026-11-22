// PF-5s part 1, S1 Pricing (concept pf-5s-saas r2 §4 S1, BR-1, §5, §7b m1/m2): our page reading Stripe's prices through
// GET /api/public/plans (G1). Active plans only; a Monthly / Yearly switch; "No card needed"; one filled button (the
// middle plan), the others outlined; each opens Sign up with that plan and period carried. Prices unavailable → the plans
// show without a price, never an invented one. Plan names and prices Sample.
import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Frame, useWhere } from "@/components/frame";
import { buttonVariants, Notice } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { call, money, Plans, type Period, type Problem } from "./api";

function Place() { useWhere([{ label: "Pricing" }], null); return null; }

export function PricingPage() {
  const [period, setPeriod] = React.useState<Period>("MONTHLY");
  const q = useQuery({ queryKey: ["public", "plans"], retry: false, gcTime: 0, refetchOnWindowFocus: false, queryFn: async () => Plans.parse(await call("plans")) });
  React.useEffect(() => { document.title = "Pricing · Expat Ready"; }, []);
  const plans = q.data?.plans ?? [];
  const middle = Math.floor((plans.length - 1) / 2);
  return (
    <Frame area="outside" title="Pricing">
      <Place />
      <section aria-labelledby="pricing-h" className="mx-auto mt-6 max-w-5xl" data-pricing>
        <h1 id="pricing-h" className="text-xl font-semibold">Plans for immigration firms</h1>
        <p className="mt-1 text-sm text-text-muted">No card needed.{plans.length && plans.every((p) => p.trialDays > 0) ? " Every plan starts with a free trial." : ""} Plan names and prices are Sample.</p>
        <fieldset className="mt-4 inline-flex rounded-lg border border-border p-1" data-period>
          <legend className="sr-only">Billing period</legend>
          {(["MONTHLY", "YEARLY"] as const).map((p) => (
            <label key={p} className={cn("flex min-h-9 cursor-pointer items-center rounded-md px-4 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50", period === p ? "bg-primary text-primary-foreground" : "text-text")}>
              <input type="radio" name="period" value={p} checked={period === p} onChange={() => setPeriod(p)} className="sr-only" />{p === "MONTHLY" ? "Monthly" : "Yearly"}
            </label>
          ))}
        </fieldset>
        {q.isPending ? <p role="status" className="mt-6 text-sm text-text-muted">Loading the plans…</p>
          : q.isError ? <Notice tone="danger" title="Plans could not be loaded" className="mt-6">{(q.error as unknown as Problem).detail ?? "Please try again later."}</Notice>
            : <>
              {!q.data.pricesAvailable || plans.every((p) => !p.monthly && !p.yearly) ? <Notice tone="warn" title="Prices unavailable" className="mt-6"><span data-prices-unavailable>We could not read the prices just now. You can still start a free trial; the price shows on your plan before any payment.</span></Notice> : null}
              <ul className="mt-6 grid gap-4 md:grid-cols-3">
                {plans.map((p, i) => {
                  const price = money(period === "YEARLY" ? p.yearly : p.monthly);
                  return (
                    <li key={p.code} className="flex flex-col rounded-xl border border-border bg-surface-raised p-5 shadow-sm" data-plan={p.code}>
                      <h2 className="text-base font-semibold">{p.name}</h2>
                      {price ? <p className="mt-2"><span className="text-2xl font-semibold" data-price>{price}</span> <span className="text-sm text-text-muted">per {period === "YEARLY" ? "year" : "month"}, CAD</span></p>
                        : <p className="mt-2 text-sm text-text-muted" data-price-missing>Price not shown</p>}
                      {price ? <p className="text-xs text-text-muted">{q.data.taxNote}</p> : null}
                      <p className="mt-3 text-sm">{p.seatsLimit === null ? "Unlimited seats" : `Up to ${p.seatsLimit} ${p.seatsLimit === 1 ? "seat" : "seats"}`}</p>
                      {/* QA-742: 0 days = no trial (SA-3-46): no trial line and no "free trial" on the button */}
                      {p.trialDays > 0 ? <p className="text-sm text-text-muted" data-trial>{p.trialDays}-day free trial · no card needed</p> : null}
                      <Link to={`/sign-up?plan=${encodeURIComponent(p.code)}&period=${period}`} className={cn(buttonVariants({ variant: i === middle ? "default" : "outline", size: "lg" }), "mt-5")} data-start={p.code}>{p.trialDays > 0 ? "Start free trial" : "Sign up"}</Link>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-6 grid gap-4 text-sm md:grid-cols-2">
                <div><h2 className="font-semibold">What happens when the trial ends?</h2><p className="mt-1 text-text-muted">Add a card before the trial ends to keep access. Without one, your firm's account goes on hold; you can still pay.</p></div>
                <div><h2 className="font-semibold">Can I change plan later?</h2><p className="mt-1 text-text-muted">Yes. The firm's Owner changes the plan or cancels from Plan and billing.</p></div>
              </div>
            </>}
        <p className="mt-6 text-sm">Already have an account? <Link className="text-text-link underline" to="/account">Sign in</Link></p>
      </section>
    </Frame>
  );
}
