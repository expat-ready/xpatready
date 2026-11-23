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
/** What a save may answer (PF-4c part 2, AG-1-34): the server's soft warning when the number does not look like its body's
 *  format. The record is saved either way; the warning is never a refusal. */
export type LicenceSaved = { warning?: string } | void;
const TYPES = BODIES.types, ALL = BODIES.bodies;
/** The bodies that fit a type (a College member: the College; a lawyer or paralegal: a law society; a notary: the Chambre). */
export const bodiesFor = (type: string) => { const t = TYPES.find((x) => x.label === type); return t ? ALL.filter((b) => t.bodies.includes(b.kind)) : ALL; };
const bodyLabel = (b: (typeof ALL)[number]) => (b.status === "Sample" ? `${b.name} (Sample)` : b.name);
type Fields = { representativeType: string; licensingBody: string; licenceNumber: string };
const fieldsOf = (l: Licence | null): Fields => ({ representativeType: l?.representativeType ?? "", licensingBody: l?.licensingBody ?? "", licenceNumber: l?.licenceNumber ?? "" });
/** Two reads of one record say the same (no record on both counts as the same). */
export const sameLicence = (a: Licence | null, b: Licence | null) => JSON.stringify(fieldsOf(a)) === JSON.stringify(fieldsOf(b)) && !a === !b;
export const CONFLICT_WORDS = "Someone else changed this licence since you opened it. Nothing was saved; the form now shows the record as it is.";
/** Thrown by a save whose fresh read differs from what the form opened with (concept §4 "conflict (reload)"; review MJ-1). */
export class LicenceConflict extends Error { constructor(readonly now: Licence | null) { super(CONFLICT_WORDS); } }

/** An earlier record whose words are not in the list (e.g. the Sample seed's "rcic") stays choosable as recorded. */
function options(list: readonly string[], current: string, labelOf: (v: string) => string = (v) => v) {
  const vals = current && !list.includes(current) ? [current, ...list] : list;
  return vals.map((v) => <option key={v} value={v}>{list.includes(v) ? labelOf(v) : `${v} (as recorded)`}</option>);
}

export function LicenceForm({ start, save, onCancel, onDirty, saveLabel = "Save licence" }: { start: Licence | null; save: (l: Fields) => Promise<LicenceSaved>; onCancel?: () => void; /** Whether the fields differ from the record (to ask before discarding them). */ onDirty?: (dirty: boolean) => void; saveLabel?: string }) {
  // The record the form was opened with: a save compares the fresh read against it; a conflict replaces it.
  const [base, setBase] = React.useState<Licence | null>(start);
  const [type, setType] = React.useState(start?.representativeType ?? "");
  const [body, setBody] = React.useState(start?.licensingBody ?? "");
  const [number, setNumber] = React.useState(start?.licenceNumber ?? "");
  const [error, setError] = React.useState<string | null>(null), [note, setNote] = React.useState<string | null>(null), [busy, setBusy] = React.useState(false);
  // PF-4c part 2: the server's warning for the number as saved; it goes when the number or the body changes.
  const [warning, setWarning] = React.useState<string | null>(null);
  const saveButton = React.useRef<HTMLButtonElement>(null);
  // The busy button is disabled while saving, which drops focus to the page; it goes back to Save (review MJ-2) in the
  // commit that enables the button again, before the page is painted (a layout effect), so the keyboard is never seen
  // on the page. (The timed callback this replaces could run before that commit, focus a button still disabled and
  // leave the keyboard on the page for good: FO-3st2 part 1, merge batch #2265.)
  const backToSave = React.useRef(false);
  React.useLayoutEffect(() => {
    if (busy || !backToSave.current) return;
    backToSave.current = false;
    if (document.activeElement === document.body) saveButton.current?.focus();
  }, [busy]);
  const now: Fields = { representativeType: type, licensingBody: body, licenceNumber: number };
  const dirty = JSON.stringify(now) !== JSON.stringify(fieldsOf(base));
  React.useEffect(() => { onDirty?.(dirty); }, [dirty]);   // eslint-disable-line react-hooks/exhaustive-deps -- reports changes only
  const fits = bodiesFor(type).map((b) => b.name);
  const pickType = (t: string) => { setWarning(null); setType(t); const f = bodiesFor(t); if (f.length === 1) setBody(f[0].name); else if (!f.some((b) => b.name === body)) setBody(""); };
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setNote(null); setWarning(null);
    // No change: nothing is sent (no "changed" audit line for an unchanged record; break m4).
    if (base && !dirty) { setNote("Nothing to save: the licence is as it was."); return; }
    setBusy(true);
    try { const r = await save(now); setBase({ ...now }); setWarning(r && r.warning ? r.warning : null); }
    catch (x) {
      if (x instanceof LicenceConflict) { const f = fieldsOf(x.now); setBase(x.now); setType(f.representativeType); setBody(f.licensingBody); setNumber(f.licenceNumber); }
      setError(x instanceof StaffApiError || x instanceof LicenceConflict ? x.message : "Could not save. Please try again.");
    } finally {
      backToSave.current = true; setBusy(false);
    }
  };
  const label = (n: string) => bodyLabel(ALL.find((b) => b.name === n)!);
  return (
    <form className="flex max-w-xl flex-col gap-3" onSubmit={send} data-licence-form>
      <Field label="Representative type"><Select value={type} onChange={(e) => pickType(e.target.value)} required data-licence-type>
        <option value="" disabled>Choose a type</option>{options(TYPES.map((t) => t.label), type)}</Select></Field>
      <Field label="Licensing body"><Select value={body} onChange={(e) => { setWarning(null); setBody(e.target.value); }} required data-licence-body>
        <option value="" disabled>Choose a body</option>{options(fits, body, label)}</Select></Field>
      {/* The warning sits in the field's own note (linked to the number by aria-describedby), above the usual hint: saved, not
          refused, so the field is not marked invalid. Announced when it arrives (role="status"). */}
      <Field label="Licence number" hint={warning ? <><span role="status" className="block text-sm font-medium text-text-warn" data-licence-warning>{warning} It was saved.</span>{HINT}</> : HINT}>
        <Input value={number} maxLength={100} autoComplete="off" spellCheck={false} onChange={(e) => { setWarning(null); setNumber(e.target.value); }} required data-licence-number /></Field>
      <p className="text-xs text-text-muted">The types and the College and the Chambre are from IRCC's IMM 5476 page; a law society marked Sample is not yet read from its own site.</p>
      {error ? <Notice tone="danger" title="Not saved"><span data-licence-error>{error}</span></Notice> : null}
      {note ? <p role="status" className="text-sm text-text-muted" data-licence-note>{note}</p> : null}
      <div className="flex gap-2"><Button ref={saveButton} type="submit" busy={busy} data-licence-save>{saveLabel}</Button>{onCancel ? <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button> : null}</div>
    </form>
  );
}
