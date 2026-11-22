// PF-5s part 2 (concept pf-5s-saas r2 S6 Plan and billing; BR-8, BR-9, BR-10, BR-14; §7b B1, M5, M6, m9): the firm's
// plan from our record (PF-5 part 2's GET /api/platform/billing), never from a return link: plan, status in the
// requirement's words, the trial line counting days, the dates, the seats, the business address, our invoices, and the
// role's one primary button to Stripe's own pages (Owner: Manage plan and billing, the Customer Portal; Admin: the card
// Checkout). A button that opens Stripe first asks for the business address when it is missing (B1). Coming back with
// ?card=saved shows "Checking for changes from Stripe…" until the record says a card is on file (BR-9). The address
// PF-5 part 2 sends Stripe's returns to is /settings/billing. Wording Sample; tax readings Unconfirmed: no counsel.
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Notice, Pill, Table } from "@/components/ui/controls";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PlatformFrame, usePlatformStaff } from "../frame";
import { staffApi, StaffApiError, useStaffToken } from "../session";
import { AddressPanel } from "./address-panel";
import { addressLines, addressOf, Billing, cardLabel, confirmed, datesLine, day, HandOff, invoiceUrl, Invoices, KEY, money, seatsLine, STATUS, stripeUrl, taxWords, trialLine, WORDS } from "./billing-contract";

const SLOW_MS = 60_000;   // Sample (concept BR-6/BR-9)
const refusal = (e: unknown, fallback: string) => e instanceof StaffApiError ? e.message : fallback;

function InvoiceList() {
  const token = useStaffToken();
  const q = useQuery({ queryKey: ["pf", "billing", "invoices", token], enabled: !!token, retry: false, queryFn: async () => Invoices.parse(await staffApi("/platform/billing/invoices")) });
  return (
    <section aria-labelledby="pf5s-invoices" className="mt-6">
      <h2 id="pf5s-invoices" className="mb-2 text-base font-semibold">Invoices</h2>
      {q.isError ? <Notice tone="warn" title="Invoices not available"><span data-invoices-error>{refusal(q.error, "Could not load your invoices. Please try again.")}</span></Notice>
        : !q.data ? <p role="status" className="text-sm text-text-muted">Loading invoices…</p>
        : q.data.invoices.length === 0 ? <p className="text-sm text-text-muted" data-invoices-empty>No invoices yet.</p>
        : (
          <Table head={["Invoice", "Date", "Amount", "Tax", "Status", ""]} label="Invoices">
            {q.data.invoices.map((i) => { const href = invoiceUrl(i.hostedUrl); return (
              <tr key={i.id} data-invoice={i.id}>
                <td className="[overflow-wrap:anywhere]">{i.number ?? (i.status === "draft" ? "Draft" : "No number")}</td><td><time dateTime={i.createdAt}>{day(i.createdAt)}</time></td><td>{money(i.amountDueCents, i.currency)}</td>
                <td data-invoice-tax className="min-w-[9rem] [overflow-wrap:break-word]">{taxWords(i)}</td>
                <td className="capitalize">{i.status ?? ""}</td>
                <td>{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-text-link underline">View<span className="sr-only"> invoice {i.number ?? ""} {stripeUrl(href) ? "on Stripe" : "(stand-in)"} (opens in a new tab)</span></a> : null}
                  {href && !stripeUrl(href) ? <> · <a href={`${href}&download=1`} download className="text-text-link underline">Download<span className="sr-only"> invoice {i.number ?? ""}</span></a></> : null}</td>
              </tr>); })}
          </Table>
        )}
    </section>
  );
}

function Summary() {
  const me = usePlatformStaff(), token = useStaffToken(), qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  // Kept for the page's life: the marker leaves the address once the record moves, the confirmation stays on screen.
  const [returning] = React.useState(() => params.get("card") === "saved");
  const [since] = React.useState(() => Date.now());
  const [slow, setSlow] = React.useState(false);
  // BR-9 (review M1): the first record read after the return is the baseline; Stripe's change is confirmed only by the
  // record (a card that pays, or a move away from it), never by the return link.
  const first = React.useRef<Billing | null>(null);
  const q = useQuery({ queryKey: ["pf", "billing", token], enabled: !!token, retry: false,
    queryFn: async () => { const r = Billing.parse(await staffApi("/platform/billing")); if (returning && !first.current) first.current = r; return r; },
    refetchInterval: (query) => returning && !(query.state.data && first.current && confirmed(first.current, query.state.data)) && Date.now() - since < SLOW_MS ? 3_000 : false });
  const b = q.data, done = returning && !!b && !!first.current && confirmed(first.current, b);
  React.useEffect(() => { if (!returning) return; const t = window.setTimeout(() => setSlow(true), SLOW_MS); return () => window.clearTimeout(t); }, [returning]);
  // The record moved: the return marker leaves the address, so a reload never shows "Checking…" again.
  React.useEffect(() => { if (done && params.has("card")) setParams((p) => { p.delete("card"); return p; }, { replace: true }); }, [done, params, setParams]);

  const canCard = me.keys.includes(KEY.card), canPortal = me.keys.includes(KEY.portal);
  const [panel, setPanel] = React.useState<null | { then: "card" | "portal" | null }>(null);
  const [leaving, setLeaving] = React.useState<"card" | "portal" | null>(null);
  const [stripeError, setStripeError] = React.useState<string | null>(null);
  const [savedNote, setSavedNote] = React.useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  /** R2-m3: "due" after a save Stripe did not get (the next button to Stripe asks again); "done" once asked again. */
  const [retry, setRetry] = React.useState<null | "due" | "done">(null);
  const opener = React.useRef<HTMLElement | null>(null), editButton = React.useRef<HTMLButtonElement>(null), errorBox = React.useRef<HTMLDivElement>(null);
  // Break M4: a refused hand-off moves focus to its words (the button was disabled under the focus while it waited).
  React.useEffect(() => { if (stripeError) errorBox.current?.focus(); }, [stripeError]);

  if (q.isError && !b) return <Notice tone="danger" title="Not available"><span data-billing-refused>{refusal(q.error, "Could not load your plan. Please try again.")}</span></Notice>;
  if (!b) return <p role="status" className="text-sm text-text-muted" data-loading>Loading your plan…</p>;
  const now = Date.now(), address = addressOf(b), status = STATUS[b.status], trial = trialLine(b, now, canCard), dates = datesLine(b, now);   // one clock for both lines

  const toStripe = async (which: "card" | "portal") => {
    if (leaving) return;   // one hand-off per click
    setStripeError(null);
    setLeaving(which);
    try {
      const r = HandOff.parse(await staffApi(which === "card" ? "/platform/billing/checkout" : "/platform/billing/portal", { method: "POST" }));
      const url = stripeUrl(r.url);
      if (!url) throw new Error("not a Stripe page");
      window.location.assign(url);   // same tab, with a way back (BR-14)
    } catch (x) {
      setStripeError(x instanceof StaffApiError && x.status !== 503 ? x.message : WORDS.stripeDown);   // break m9: one "try again"
      setLeaving(null);
    }
  };
  const start = (which: "card" | "portal") => (e: React.MouseEvent<HTMLButtonElement>) => {
    opener.current = e.currentTarget;
    // B1: the address before any card or payment; R2-m3: also again when the last save could not reach Stripe, so the
    // Stripe customer has it before Checkout (the panel opens filled in).
    // Follow-up review m2: once only. If the retry warns too, the next press goes on to Stripe (PF-5's webhook still holds
    // a first invoice that has no address), so nobody is kept from Checkout or the Portal (where an Owner cancels).
    if (!address || retry === "due") { setPanel({ then: which }); return; }
    void toStripe(which);
  };
  const saved = (next: string | null) => {
    const then = panel?.then ?? null;
    setRetry(retry === "due" ? "done" : next && retry === null ? "due" : retry);
    setPanel(null);
    void qc.invalidateQueries({ queryKey: ["pf", "billing", token] });
    setSavedNote(next ? { tone: "warn", text: next } : { tone: "ok", text: "Business address saved." });
    // Review M2: a warning (Stripe not updated, a held invoice not released) stays on screen; the person goes on by
    // pressing the button again once they have read it, never past it.
    if (then && !next) void toStripe(then);
  };
  // One primary per role (BR-8, BIC-11): the Owner's is the portal; an Admin's is the card.
  const portalButton = canPortal ? <Button onClick={start("portal")} busy={leaving === "portal"} disabled={!!leaving} data-stripe="portal">Manage plan and billing</Button> : null;
  const cardButton = canCard ? <Button variant={canPortal ? "outline" : "default"} onClick={start("card")} busy={leaving === "card"} disabled={!!leaving} data-stripe="card">{cardLabel(b)}</Button> : null;

  return (
    <TooltipProvider delayDuration={250}>
      {returning ? (done ? <Notice tone="ok" title="Card saved" className="mb-4">Stripe confirmed your card.</Notice>
        : <Notice tone={slow ? "warn" : "info"} className="mb-4"><span data-billing-checking>{slow ? WORDS.slow : WORDS.checking}</span></Notice>) : null}
      {!b.billingAvailable ? <Notice tone="warn" title="Stripe didn't answer" className="mb-4">Card and cancel details may be out of date. Try again in a few minutes.</Notice> : null}
      <section aria-labelledby="pf5s-plan" className="rounded-xl border border-border bg-surface-raised p-5 shadow-sm" data-billing-summary>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="pf5s-plan" className="text-lg font-semibold">{b.plan.name} plan</h2>
          <Tooltip><TooltipTrigger asChild><span tabIndex={0} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"><Pill tone={status.tone}><span data-billing-status={b.status}>{status.label}</span></Pill></span></TooltipTrigger><TooltipContent data-status-tip>{status.tip}</TooltipContent></Tooltip>
        </div>
        {trial ? <p className="mt-2 text-sm" data-trial-line>{trial.text}{trial.next ? <> <strong className="font-medium">{trial.next}</strong></> : null}</p> : null}
        {b.hold ? <p className="mt-2 text-sm text-text-danger" data-billing-hold>On hold since {day(b.hold.since)} ({b.hold.reason === "payment needed" ? "payment needed" : "business address needed"}). Your firm's data is kept until {day(b.hold.deletionDate)}.</p> : null}
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          {dates ? <><dt className="text-text-muted">Dates</dt><dd data-billing-dates>{dates}</dd></> : null}
          <dt className="text-text-muted">Seats</dt><dd><Tooltip><TooltipTrigger asChild><span tabIndex={0} className="rounded-md underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring" data-billing-seats>{seatsLine(b)}</span></TooltipTrigger><TooltipContent>Active and suspended staff plus open invitations</TooltipContent></Tooltip></dd>
        </dl>
        {portalButton || cardButton ? (
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">{portalButton}{cardButton}</div>
            <p className="text-xs text-text-muted">{WORDS.hint}</p>
            {canCard && !canPortal ? <p className="text-xs text-text-muted" data-admin-only>{WORDS.adminOnly}</p> : null}
          </div>
        ) : null}
        {stripeError ? <div ref={errorBox} tabIndex={-1} className="mt-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"><Notice tone="danger"><span data-stripe-error>{stripeError}</span></Notice></div> : null}
      </section>

      <section aria-labelledby="pf5s-address-h" className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="pf5s-address-h" className="text-base font-semibold">Business address</h2>
          <Button ref={editButton} variant="outline" size="sm" onClick={(e) => { opener.current = e.currentTarget; setPanel({ then: null }); }} data-address-edit>{address ? "Edit" : "Add address"}</Button>
        </div>
        {address ? <p className="mt-1 text-sm [overflow-wrap:anywhere]" data-address-shown>{addressLines(address).map((l, i) => <React.Fragment key={i}>{i ? <br /> : null}{l}</React.Fragment>)}<br />Canada</p>
          : <p className="mt-1 text-sm text-text-muted" data-address-missing>Not added yet. {WORDS.addressNeeded}</p>}
        {savedNote ? <Notice tone={savedNote.tone} className="mt-2"><span data-address-saved>{savedNote.text}</span></Notice> : null}
      </section>
      <AddressPanel open={!!panel} onOpenChange={(o) => { if (!o) setPanel(null); }} current={address} beforeStripe={!!panel?.then} retry={!!panel?.then && retry === "due"} onSaved={saved} returnFocus={() => opener.current ?? editButton.current} />
    </TooltipProvider>
  );
}

function Body() {
  const me = usePlatformStaff();
  return (
    <>
      {me.keys.includes(KEY.view) ? <Summary /> : <p className="text-sm text-text-muted" data-billing-no-view>{WORDS.noView}</p>}
      {me.keys.includes(KEY.invoices) ? <InvoiceList /> : null}
    </>
  );
}

export function BillingPage() {
  return (
    <PlatformFrame crumbs={[{ label: "Plan and billing" }]}>
      <h1 className="mb-1 text-xl font-semibold">Plan and billing</h1>
      <p className="mb-4 text-sm text-text-muted">Your firm's plan, trial and invoices. Prices are in CAD, plus applicable taxes (Sample).</p>
      <Body />
    </PlatformFrame>
  );
}
