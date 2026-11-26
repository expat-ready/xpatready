// FO-7s2 part 2 (concept screens/fo-7s-money/concept-invoices.md (b) and concept-pay-page.md; AG-6-14 r2-3 §8; FO-7c part 2a's
// `POST …/money/invoices/:id/pay-link`, key agent/payment:online): "Copy pay link" on an issued invoice with something due.
// The link is for the full amount due; making a new one stops the earlier link (FO-7c), so the button says so after a copy.
// The server refuses a draft, a settled invoice and anything that is not an invoice; its words are shown as they are.
import * as React from "react";
import { z } from "zod";
import { Button, Notice } from "@/components/ui/controls";
import { staffApi, StaffApiError } from "@/modules/platform/session";
import { money } from "./contract";

export const PAY_LINK_KEY = "agent/payment:online";
const Made = z.object({ invoiceId: z.string(), number: z.string().nullable(), currency: z.string(), amountDueMinor: z.number().int(), url: z.string().url() });
/** Offered on an issued invoice that still has something due (the server decides the rest). */
export const payLinkOffered = (keys: readonly string[], inv: { number: string | null; dueMinor: number; statusWord: string }) =>
  keys.includes(PAY_LINK_KEY) && !!inv.number && inv.dueMinor > 0 && !["Draft", "Credited", "Written off", "Refunded", "Paid"].includes(inv.statusWord);

export function CopyPayLink({ invoiceId }: { invoiceId: string }) {
  const [busy, setBusy] = React.useState(false), [said, setSaid] = React.useState<{ tone: "ok" | "danger"; text: string; url?: string } | null>(null);
  const copy = async () => {
    setBusy(true); setSaid(null);
    try {
      const m = Made.parse(await staffApi(`/front-office/money/invoices/${encodeURIComponent(invoiceId)}/pay-link`, { method: "POST" }));
      let copied = false; try { await navigator.clipboard.writeText(m.url); copied = true; } catch { /* no clipboard: the link shows to copy by hand */ }
      setSaid({ tone: "ok", url: m.url, text: `${copied ? "Pay link copied" : "Pay link made: copy it below"} for ${money(m.amountDueMinor, m.currency)}, the full amount due. Any earlier link for this invoice no longer works.` });
    } catch (e) { setSaid({ tone: "danger", text: e instanceof StaffApiError ? e.message : "Could not make the pay link. Nothing was changed. Please try again." }); }
    finally { setBusy(false); }
  };
  return (
    <>
      <Button variant="outline" className="max-sm:h-11" busy={busy} onClick={() => void copy()} data-action="COPY_PAY_LINK">Copy pay link</Button>
      {said ? <div className="basis-full" role="status"><Notice tone={said.tone} title={said.tone === "ok" ? "Pay link" : "No pay link"}><span data-pay-link-said>{said.text}</span>
        {said.url ? <input readOnly aria-label="Pay link" value={said.url} onFocus={(e) => e.currentTarget.select()} className="mt-2 block w-full rounded border border-border bg-surface px-2 py-1 font-mono text-xs" data-pay-link-url /> : null}</Notice></div> : null}
    </>
  );
}
