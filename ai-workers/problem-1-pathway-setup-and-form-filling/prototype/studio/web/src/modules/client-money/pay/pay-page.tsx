// FO-7s2 part 2 (concept screens/fo-7s-money/concept-pay-page.md; AG-6-14 r2-3, AG-6-17, AG-6-49 r1; P-567 (3)): the
// client's public pay page, no login, phone first. `/money/pay/:token` shows the firm, the invoice, the amount due and one
// "Pay … by card" button (no amount field, no saved card), or, when the card is not offered, "Online payment is temporarily
// unavailable" with the firm's offline details or contact line and never a card form. `/money/pay/:token/done` is Stripe's
// return page: "Payment received — your receipt is on its way", the invoice "being confirmed" until Stripe's event marks it
// paid (the redirect pays nothing, AG-6-17); it never asks for a new payment page. The link's token stays out of every
// referrer (no-referrer, as FO-7c's door). Own plain frame: no staff menu and no staff session.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Button, Notice } from "@/components/ui/controls";
import { CardNotOffered, CONFIRMING, day, money, NOT_VALID, PAY_TOKEN, PayAnswer, payWords, problemWords, RECEIVED, safeCheckoutUrl, Session } from "./contract";

type Problem = { status: number; detail?: string; body?: unknown };
async function call<T>(path: string, parse: (d: unknown) => T, init?: RequestInit): Promise<T> {
  let res: Response;
  try { res = await fetch(`/api/public/pay/${path}`, { ...init, credentials: "omit", referrerPolicy: "no-referrer", headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) } }); }
  catch { throw { status: 0 } satisfies Problem; }
  const text = await res.text(); let data: unknown = null; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) throw { status: res.status, detail: (data as { detail?: string } | null)?.detail, body: data } satisfies Problem;
  return parse(data);
}

/** The link's token never leaves in a Referer header (Stripe's pages and any link out). */
function useNoReferrer(title: string) {
  React.useEffect(() => {
    document.title = title;
    const m = document.createElement("meta"); m.name = "referrer"; m.content = "no-referrer"; document.head.appendChild(m);
    return () => { m.remove(); };
  }, [title]);
}

function Frame({ firm, title, children }: { firm?: string; title: string; children: React.ReactNode }) {
  useNoReferrer(title);
  return (
    <div className="min-h-full bg-surface">
      <header className="border-b border-border bg-surface-raised py-3"><div className="mx-auto w-full max-w-xl px-4"><p dir="auto" className="min-h-6 text-base font-semibold [overflow-wrap:anywhere]" data-firm-name>{firm ?? ""}</p></div></header>
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">{children}</main>
    </div>
  );
}

function Offline({ o }: { o: NonNullable<PayAnswer["offline"]> }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <section aria-labelledby="pay-offline" className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised p-4" data-pay-offline>
      <h2 id="pay-offline" className="text-base font-semibold" data-pay-offline-message>{o.message}</h2>
      {o.details ? <><p className="text-sm">Pay by the details below:</p><pre className="whitespace-pre-wrap font-sans text-sm [overflow-wrap:anywhere]" data-pay-details>{o.details}</pre>
        {o.reference ? <p className="flex flex-wrap items-center gap-2 text-sm">Message with your payment: <strong data-pay-reference>{o.reference}</strong>
          <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(o.reference).then(() => setCopied(true)).catch(() => undefined); }}>{copied ? "Copied" : "Copy"}</Button></p> : null}</>
        : <p className="text-sm [overflow-wrap:anywhere]" data-pay-contact>{o.contact}</p>}
    </section>
  );
}

function Summary({ a, done }: { a: PayAnswer; done?: boolean }) {
  const v = a.invoice, due = day(v.dueDate);
  return (
    <section aria-labelledby="pay-invoice" className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4">
      <h2 id="pay-invoice" className="text-base font-semibold">Invoice <span data-pay-number>{v.number}</span>{due ? <span className="font-normal text-text-muted"> · Due {due}</span> : null}</h2>
      <ul className="flex flex-col gap-1 text-sm" aria-label="What the invoice is for">
        {v.lines.map((l, i) => <li key={i} className="flex justify-between gap-3"><span dir="auto" className="min-w-0 [overflow-wrap:anywhere]">{l.description}</span><span className="shrink-0 tabular-nums">{money(l.amountMinor + l.taxMinor, v.currency)}</span></li>)}
      </ul>
      {v.paidMinor > 0 ? <p className="text-sm text-text-muted">Already paid: <span className="tabular-nums">{money(v.paidMinor, v.currency)}</span></p> : null}
      <p className="text-lg">{done ? "Amount paid by card" : "Amount due"}: <strong className="tabular-nums" data-pay-due>{money(v.dueMinor, v.currency)}</strong></p>
    </section>
  );
}

function useAnswer(token: string) {
  return useQuery({ queryKey: ["public", "pay", token], enabled: PAY_TOKEN.test(token), retry: false, staleTime: Infinity, refetchOnWindowFocus: false, queryFn: () => call(encodeURIComponent(token), (d) => PayAnswer.parse(d)) });
}

export function PayPage({ go = (u: string) => window.location.assign(u) }: { /** test seam */ go?: (url: string) => void }) {
  const { token = "" } = useParams(), q = useAnswer(token), err = q.error as unknown as Problem | null;
  const [busy, setBusy] = React.useState(false), [refused, setRefused] = React.useState<string | null>(null), [down, setDown] = React.useState<PayAnswer["offline"]>(null);
  if (!PAY_TOKEN.test(token) || err?.status === 404) return <Frame title={NOT_VALID}><h1 className="text-xl font-semibold" data-pay-state="not-found">{NOT_VALID}</h1></Frame>;
  if (err) return <Frame title="Pay an invoice"><h1 className="text-xl font-semibold" data-pay-state="error">{problemWords(err.status, err.detail)}</h1></Frame>;
  if (!q.data) return <Frame title="Pay an invoice"><p role="status" className="text-sm text-text-muted" data-pay-state="loading">Loading the invoice…</p></Frame>;
  const a = q.data, offline = down ?? a.offline, card = a.card.offered && !down;
  const pay = async () => {
    setBusy(true); setRefused(null);
    try {
      const s = await call(`${encodeURIComponent(token)}/session`, (d) => Session.parse(d), { method: "POST", body: "{}" });
      if (!safeCheckoutUrl(s.url)) { setRefused("The card payment page could not be opened. Nothing was charged. Please try again."); return; }
      go(s.url);
    } catch (e) {
      const p = e as Problem, gone = CardNotOffered.safeParse(p.body);
      if (gone.success) setDown(gone.data.offline);
      else setRefused(p.status === 404 ? NOT_VALID : problemWords(p.status, p.detail));
    } finally { setBusy(false); }
  };
  return (
    <Frame firm={a.firm.name} title={`Pay invoice ${a.invoice.number}`}>
      <h1 className="text-2xl font-semibold" data-pay-state={card ? "card" : "offline"}>Pay invoice {a.invoice.number}</h1>
      <Summary a={a} />
      {card ? <Button className="h-12 w-full text-base" busy={busy} onClick={() => void pay()} data-pay-card>{payWords(a.invoice)}</Button> : null}
      {card ? <p className="text-xs text-text-muted">You pay on Stripe's secure page. {a.firm.name} receives the payment; your card is not saved.</p> : null}
      {!card && offline ? <Offline o={offline} /> : null}
      {refused ? <Notice tone="danger" title="Not paid"><span data-pay-refused>{refused}</span></Notice> : null}
    </Frame>
  );
}

export function PayDonePage() {
  const { token = "" } = useParams(), q = useAnswer(token);
  if (!PAY_TOKEN.test(token)) return <Frame title={NOT_VALID}><h1 className="text-xl font-semibold" data-pay-state="not-found">{NOT_VALID}</h1></Frame>;
  // Settled by Stripe's event already: the link answers the one not-found, and the client is simply told it was received.
  const a = q.data;
  return (
    <Frame firm={a?.firm.name} title={RECEIVED}>
      <h1 className="text-2xl font-semibold" data-pay-state="done">{RECEIVED}</h1>
      {q.isPending && PAY_TOKEN.test(token) && !q.error ? <p role="status" className="text-sm text-text-muted">Checking the invoice…</p> : null}
      {a ? <><p className="text-sm" data-pay-confirming>{CONFIRMING} Invoice {a.invoice.number}: <strong>being confirmed</strong>.</p><Summary a={a} done /></> : null}
      {(q.error as unknown as Problem | null)?.status === 404 ? <p className="text-sm" data-pay-confirmed>This link no longer shows the invoice: it closes once the invoice is settled. Your receipt comes by email; you can close this page.</p> : null}
    </Frame>
  );
}
