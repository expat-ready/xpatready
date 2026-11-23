// PF-5s part 2 (concept pf-5s-saas r2 §7b B1, M5; BR-7's address): the Business address panel. It saves through PF-5
// part 2's PUT /api/platform/billing/address (Owner or Admin; it works on hold), and opens by itself before any button
// that sends the firm to Stripe while the address is missing. The server's field words show on their fields (422).
import * as React from "react";
import { Button, Field, Input, Notice, Panel, Select } from "@/components/ui/controls";
import { staffApi, StaffApiError } from "../session";
import { PROVINCES, SetAddressAnswer, WORDS, type AddressValue } from "./billing-contract";

type Form = { unit: string; street_number: string; street_name: string; city: string; province_state: string; postal_code: string };
const NAMES: [keyof Form, string, string][] = [["unit", "Unit (optional)", "address-line2"], ["street_number", "Street number", "address-line1"], ["street_name", "Street name", "address-line1"], ["city", "City", "address-level2"]];
const LABEL: Record<string, string> = { unit: "Unit", street_number: "Street number", street_name: "Street name", city: "City", province_state: "Province or territory", postal_code: "Postal code" };
const ORDER = ["unit", "street_number", "street_name", "city", "province_state", "postal_code"];
const formOf = (a: AddressValue | null): Form => ({ unit: a?.unit ?? "", street_number: a?.street_number ?? "", street_name: a?.street_name ?? "", city: a?.city ?? "", province_state: a?.province_state ?? "", postal_code: a?.postal_code ?? "" });

export function AddressPanel({ open, onOpenChange, current, beforeStripe, retry = false, onSaved, returnFocus }: {
  open: boolean; onOpenChange: (o: boolean) => void; current: AddressValue | null;
  /** Opened by a button that goes on to Stripe: the panel says why, and its save button says what follows. */
  beforeStripe: boolean;
  /** Opened again because the last save did not reach Stripe: the panel says so. */
  retry?: boolean;
  onSaved: (next: string | null) => void; returnFocus: () => HTMLElement | null }) {
  const [f, setF] = React.useState<Form>(() => formOf(current));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<StaffApiError | null>(null);
  const [failed, setFailed] = React.useState<string | null>(null);
  const form = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => { if (open) { setF(formOf(current)); setError(null); setFailed(null); } }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps -- reset on each opening only
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null); setFailed(null);
    try {
      const body = { ...f, unit: f.unit.trim() ? f.unit : null };
      const r = SetAddressAnswer.parse(await staffApi("/platform/billing/address", { method: "PUT", json: body }));
      onSaved(r.next ?? null);
    } catch (x) {
      if (x instanceof StaffApiError) {
        setError(x);
        const bad = Object.keys(x.problem.fields ?? {}).filter((k) => k in LABEL);
        setFailed(bad.length ? `Please check: ${bad.map((k) => LABEL[k]).join(", ")}.` : x.message);
        // Review m6: focus moves to the first refused field, so a keyboard or screen-reader user lands on its words.
        if (bad.length) window.setTimeout(() => form.current?.querySelector<HTMLElement>(`[data-address-field="${ORDER.find((k) => bad.includes(k))}"]`)?.focus(), 0);
      } else setFailed("Could not save the address. Please try again.");
    } finally { setBusy(false); }
  };
  // Break m5, R2-m2: one question before a typed address is thrown away, whichever way the panel is closed (Escape, the
  // X, the overlay or the footer's Close).
  const mayClose = () => JSON.stringify(f) === JSON.stringify(formOf(current)) || window.confirm("Discard the address you typed?");
  const fieldError = (k: string) => error?.field(k) ?? null;
  return (
    <Panel open={open} onOpenChange={onOpenChange} returnFocus={returnFocus} confirmClose={mayClose} title="Business address"
      description={retry ? WORDS.retryStripe : beforeStripe ? WORDS.beforeCard : WORDS.addressNeeded}
      footer={<><Button type="button" variant="outline" onClick={() => { if (mayClose()) onOpenChange(false); }}>Close</Button><Button type="submit" form="pf5s-address" busy={busy} data-address-save>{beforeStripe ? "Save and continue to Stripe" : "Save address"}</Button></>}>
      <form ref={form} id="pf5s-address" className="flex flex-col gap-3" onSubmit={save} noValidate data-address-form>
        {NAMES.map(([k, label, auto]) => <Field key={k} label={label} error={fieldError(k)}><Input value={f[k]} onChange={set(k)} autoComplete={auto} required={k !== "unit"} data-address-field={k} /></Field>)}
        <Field label="Province or territory" error={fieldError("province_state")}>
          <Select value={f.province_state} onChange={set("province_state")} required data-address-field="province_state">
            <option value="">Choose…</option>
            {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Postal code" hint="Like A1A 1A1" error={fieldError("postal_code")}><Input value={f.postal_code} onChange={set("postal_code")} autoComplete="postal-code" required data-address-field="postal_code" /></Field>
        <p className="text-xs text-text-muted">Country: Canada</p>
        {failed ? <Notice tone="danger" title="Not saved"><span data-address-error>{failed}</span></Notice> : null}
      </form>
    </Panel>
  );
}
