// PF-6 part 2b (concept pf-6-staff r2 BR-8, §5; AG-1-30, -31): one licence record's form, used by My account (own) and
// Licences (anyone's, agent/firm-credential:manage). Type and body from samples/representative-bodies-ca.json (IMM 5476's
// designated bodies; law societies Sample until read); the number with a soft hint only. The server checks and stores
// it; its refusal words show as they come. The number is never put in a toast (BR-8: never in a log, email or notice).
import * as React from "react";
import { z } from "zod";
import { Button, Field, Input, Notice, Select } from "@/components/ui/controls";
import BODIES from "../../../../../samples/representative-bodies-ca.json";
import { StaffApiError } from "../session";

export const Licence = z.object({ representativeType: z.string(), licensingBody: z.string(), licenceNumber: z.string().nullable() });
export type Licence = z.infer<typeof Licence>;
export const HINT = "Checked against the usual format only. We never verify licences.";
const TYPES = BODIES.types, ALL = BODIES.bodies;
/** The bodies that fit a type (a College member: the College; a lawyer or paralegal: a law society; a notary: the Chambre). */
export const bodiesFor = (type: string) => { const t = TYPES.find((x) => x.label === type); return t ? ALL.filter((b) => t.bodies.includes(b.kind)) : ALL; };
const bodyLabel = (b: (typeof ALL)[number]) => (b.status === "Sample" ? `${b.name} (Sample)` : b.name);

/** An earlier record whose words are not in the list (e.g. the Sample seed's "rcic") stays choosable as recorded. */
function options(list: readonly string[], current: string, labelOf: (v: string) => string = (v) => v) {
  const vals = current && !list.includes(current) ? [current, ...list] : list;
  return vals.map((v) => <option key={v} value={v}>{list.includes(v) ? labelOf(v) : `${v} (as recorded)`}</option>);
}

export function LicenceForm({ start, save, onCancel, saveLabel = "Save licence" }: { start: Licence | null; save: (l: { representativeType: string; licensingBody: string; licenceNumber: string }) => Promise<void>; onCancel?: () => void; saveLabel?: string }) {
  const [type, setType] = React.useState(start?.representativeType ?? "");
  const [body, setBody] = React.useState(start?.licensingBody ?? "");
  const [number, setNumber] = React.useState(start?.licenceNumber ?? "");
  const [error, setError] = React.useState<string | null>(null), [busy, setBusy] = React.useState(false);
  const fits = bodiesFor(type).map((b) => b.name);
  const pickType = (t: string) => { setType(t); const f = bodiesFor(t); if (f.length === 1) setBody(f[0].name); else if (!f.some((b) => b.name === body)) setBody(""); };
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await save({ representativeType: type, licensingBody: body, licenceNumber: number }); }
    catch (x) { setError(x instanceof StaffApiError ? x.message : "Could not save. Please try again."); } finally { setBusy(false); }
  };
  const label = (n: string) => bodyLabel(ALL.find((b) => b.name === n)!);
  return (
    <form className="flex max-w-xl flex-col gap-3" onSubmit={send} data-licence-form>
      <Field label="Representative type"><Select value={type} onChange={(e) => pickType(e.target.value)} required data-licence-type>
        <option value="" disabled>Choose a type</option>{options(TYPES.map((t) => t.label), type)}</Select></Field>
      <Field label="Licensing body"><Select value={body} onChange={(e) => setBody(e.target.value)} required data-licence-body>
        <option value="" disabled>Choose a body</option>{options(fits, body, label)}</Select></Field>
      <Field label="Licence number" hint={HINT}><Input value={number} maxLength={100} autoComplete="off" spellCheck={false} onChange={(e) => setNumber(e.target.value)} required data-licence-number /></Field>
      <p className="text-xs text-text-muted">The types and the College and the Chambre are from IRCC's IMM 5476 page; a law society marked Sample is not yet read from its own site.</p>
      {error ? <Notice tone="danger" title="Not saved"><span data-licence-error>{error}</span></Notice> : null}
      <div className="flex gap-2"><Button type="submit" busy={busy} data-licence-save>{saveLabel}</Button>{onCancel ? <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button> : null}</div>
    </form>
  );
}
