// FO-4 Add a lead (R1.27's manual door, QA-606; concept r2 §4 screens 2 and 5; AG-2-4 rules 1, 4-6, 8, 10; BR-2): a right
// panel on Leads for a phone call, a walk-in or an email. A name, an email or a phone, and a source are required (rule 1);
// the source is a person's own words (FO-2 stores it as typed, at most 60 characters), with the sources the adder
// already sees offered first. Save calls FO-2's `POST leads` once per panel (one `requestId`, so a second click finds the
// same lead). A known person answers 409 KNOWN_PERSON: the panel shows the match the adder may open with "Use existing
// person", or the nameless line for one they may not (rule 6), and always "Add as new" (rule 5). Nothing is saved until
// the adder chooses. The adder owns the lead (rule 8, FO-2). Not here: phone region (BR-18), ⌘K "Add lead", the optional
// fields "Interested in", referrer and marketing tick (rule 1's "shown on request"): later FO-4 parts.
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Notice, Panel, Textarea } from "@/components/ui/controls";
import { z } from "zod";
import { useToast } from "@/lib/api";
import { KnownMatches, Lead } from "./contract";
import { useSources } from "./source-filter";
import { staffApi, StaffApiError } from "./session";
/** Sample (no source list in AG-02 for a typed-in lead): offered after the sources the adder already sees. */
const SAMPLE_SOURCES = ["Phone call", "Walk-in", "Email", "Referral"];
const EMPTY = { givenNames: "", familyName: "", email: "", phone: "", source: "", note: "" };
type Form = typeof EMPTY;
type Choice = { personId?: string; confirmedNew?: true };
/** The panel's own checks, worded as AG-2-4's tests ("Pick a source"), before anything is sent. */
function check(f: Form): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.givenNames.trim()) e.givenNames = "Enter a first name.";
  if (!f.email.trim() && !f.phone.trim()) e.email = "Add an email or a phone number.";
  if (!f.source.trim()) e.source = "Pick a source.";
  return e;
}
export function AddLeadPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const go = useNavigate(), toast = useToast(), qc = useQueryClient();
  const [f, setF] = React.useState<Form>(EMPTY);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [matches, setMatches] = React.useState<z.infer<typeof KnownMatches> | null>(null);
  const [requestId, setRequestId] = React.useState("");
  const sending = React.useRef(false);   // one Save at a time, also for two clicks in one frame
  const seen = useSources().data ?? [];
  const offered = [...new Set([...seen, ...SAMPLE_SOURCES])];
  // A fresh panel each time it opens: empty fields and a new request id (a reopened panel is a new Add).
  React.useEffect(() => { if (open) { setF(EMPTY); setErrors({}); setMatches(null); setRequestId(crypto.randomUUID()); } }, [open]);
  const save = useMutation({
    mutationFn: async (c: Choice) => Lead.parse(await staffApi("/front-office/leads", { method: "POST", json: {
      requestId, givenNames: f.givenNames.trim() || undefined, familyName: f.familyName.trim() || undefined, email: f.email.trim() || undefined,
      phone: f.phone.trim() || undefined, source: f.source.trim(), note: f.note.trim() || undefined, ...c,
    } })),
    onSuccess: (l) => {
      toast.push({ tone: "ok", text: `Lead ${l.number} added. You own it.` });
      void qc.invalidateQueries({ queryKey: ["fo", "leads"] }); void qc.invalidateQueries({ queryKey: ["fo", "lead-sources"] });
      onOpenChange(false); go(`/front-office/leads/${l.id}`, { state: { from: "mine" } });
    },
    onError: (e) => {
      if (e instanceof StaffApiError && e.problem.code === "KNOWN_PERSON") { const m = KnownMatches.safeParse(e.problem.matches); setMatches(m.success ? m.data : [{ personId: null, name: "A person you cannot see" }]); return; }
      if (e instanceof StaffApiError && e.problem.fields && Object.keys(e.problem.fields).length) { setErrors(e.problem.fields); return; }
      setErrors({ form: e instanceof StaffApiError ? e.message : "Could not add the lead. Please try again." });
    },
    onSettled: () => { sending.current = false; },
  });
  const send = (c: Choice = {}) => {
    if (sending.current) return;
    const e = c.personId ? {} : check(f);
    setErrors(e);
    if (Object.keys(e).length) { setTimeout(() => document.querySelector<HTMLElement>("[data-add-lead] [aria-invalid=true]")?.focus(), 0); return; }
    sending.current = true; save.mutate(c);
  };
  // Changing a detail after a match was shown asks again: the match was for the details as they were.
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setF({ ...f, [k]: e.target.value }); setMatches(null); if (errors[k] || errors.form) setErrors({ ...errors, [k]: "", form: "" }); };
  const err = (k: string) => errors[k] || null;
  return (
    <Panel open={open} onOpenChange={(o) => { if (!save.isPending) onOpenChange(o); }} title="Add a lead" description="For a phone call, a walk-in or an email. You will own the lead."
      footer={<>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
        {matches ? <Button type="button" busy={save.isPending && !!save.variables?.confirmedNew} onClick={() => send({ confirmedNew: true })}>Add as new</Button>
          : <Button type="button" busy={save.isPending} onClick={() => send()}>Save lead</Button>}
      </>}>
      <form data-add-lead noValidate className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {errors.form ? <Notice tone="danger" title={errors.form} /> : null}
        <Field label="First name" error={err("givenNames")}><Input autoComplete="off" maxLength={100} value={f.givenNames} onChange={set("givenNames")} /></Field>
        <Field label="Last name (optional)" error={err("familyName")}><Input autoComplete="off" maxLength={100} value={f.familyName} onChange={set("familyName")} /></Field>
        <Field label="Email" hint={err("email") ? undefined : "An email or a phone number is needed."} error={err("email")}><Input type="email" autoComplete="off" maxLength={254} value={f.email} onChange={set("email")} /></Field>
        <Field label="Phone" error={err("phone")}><Input type="tel" inputMode="tel" autoComplete="off" maxLength={40} value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Source" hint={err("source") ? undefined : "Where the enquiry came from, in your words. Pick one or type your own."} error={err("source")}>
          <Input list="fo-add-lead-sources" autoComplete="off" maxLength={60} value={f.source} onChange={set("source")} />
        </Field>
        <datalist id="fo-add-lead-sources">{offered.map((s) => <option key={s} value={s} />)}</datalist>
        <Field label="First note (optional)" error={err("note")}><Textarea rows={3} maxLength={5000} value={f.note} onChange={set("note")} /></Field>
        {matches ? (
          <div data-known-person role="status" className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">This person may already be on file. Nothing is saved until you choose.</p>
            {matches.map((m, i) => m.personId ? (
              <div key={m.personId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span data-match-line>Possible match: {m.name}{m.lead ? ` (${m.lead})` : ""}</span>
                <Button type="button" size="sm" variant="outline" busy={save.isPending && save.variables?.personId === m.personId} onClick={() => send({ personId: m.personId! })}>Use existing person</Button>
              </div>
            ) : <p key={i} data-match-line className="text-sm text-text-muted">Possible match with a record you cannot open — ask a manager.</p>)}
          </div>
        ) : null}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Panel>
  );
}
