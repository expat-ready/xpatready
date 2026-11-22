// FO-4 Add a lead (R1.27's manual door, QA-606; concept r2 §4 screens 2 and 5; AG-2-4 rules 1, 4-6, 8, 10; BR-2): a right
// panel on Leads for a phone call, a walk-in or an email. A name, an email or a phone, and a source are required (rule 1);
// the source is a person's own words (FO-2 stores it as typed, at most 60 characters), with the sources the adder
// already sees offered first. Save calls FO-2's `POST leads` once per panel (one `requestId`, so a second click finds the
// same lead). A known person answers 409 KNOWN_PERSON: the panel shows the match the adder may open with "Use existing
// person", or the nameless line for one they may not (rule 6), and always "Add as new" (rule 5). Nothing is saved until
// the adder chooses. The adder owns the lead (rule 8, FO-2). Not here: phone region (BR-18), ⌘K "Add lead", the optional
// fields "Interested in", referrer and marketing tick (rule 1's "shown on request"): later FO-4 parts.
// FO-9s part 1 (R1.29; concept screens/FO-9s/concept.md r3): the duplicate warning as details are typed (FO-9a's check,
// duplicates/). A key leaving focus checks; the hint is the one place to choose ("Use this person" or Add as new) and Save
// then sends that choice without asking again; with no choice, the 409 box replaces the hint (one box, never two).
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Notice, Panel, Textarea } from "@/components/ui/controls";
import { z } from "zod";
import { useToast } from "@/lib/api";
import { KnownMatches, Lead, words } from "./contract";
import { useSources } from "./source-filter";
import { staffApi, StaffApiError } from "./session";
import { DuplicateHint, hintAnnouncement, keptLine, unmatchedDetails, type DupChoice } from "../duplicates/duplicate-hint";
import { checkBody, useDuplicateCheck } from "../duplicates/use-duplicate-check";
/** Sample (no source list in AG-02 for a typed-in lead): offered after the sources the adder already sees. */
const SAMPLE_SOURCES = ["Phone call", "Walk-in", "Email", "Referral"];
const EMPTY = { givenNames: "", familyName: "", email: "", phone: "", source: "", note: "" };
type Form = typeof EMPTY;
type Choice = { personId?: string; confirmedNew?: true };
const KEYS = new Set<keyof Form>(["givenNames", "familyName", "email", "phone"]);
const NOTE_MAX = 5000;
/** Break F6: a long name is shortened on the Save button (the full name in its tooltip), so it stays one or two lines at 200 %. */
const short = (name: string) => (name.length > 40 ? `${[...name].slice(0, 39).join("")}…` : name);
/** A server refusal on a field in the panel's own words (break m3): "this is required." alone says nothing. */
const SAID: Record<string, string> = { givenNames: "Enter a first name.", source: "Pick a source.", email: "Add an email or a phone number." };
const fieldWords = (fields: Record<string, string>) => Object.fromEntries(Object.entries(fields).map(([k, m]) => [k, /required/i.test(m) && SAID[k] ? SAID[k] : `${m.charAt(0).toUpperCase()}${m.slice(1)}`]));
/** The same source told apart only by case or spaces is offered once (break m4); a stored code (WEBSITE, the form's
 *  own source) is never offered for a typed-in lead (break M2): picking it would count a phone call as a form lead. */
const key = (x: string) => x.trim().replace(/\s+/g, " ").toLowerCase();
const suggestions = (xs: string[]) => xs.filter((x) => words(x) === x && x.trim()).filter((x, i, all) => all.findIndex((y) => key(y) === key(x)) === i);
/** The panel's own checks, worded as AG-2-4's tests ("Pick a source"), before anything is sent. */
function check(f: Form, onPerson = false): Record<string, string> {
  const e: Record<string, string> = {};
  if (!onPerson && !f.givenNames.trim()) e.givenNames = "Enter a first name.";
  if (!onPerson && !f.email.trim() && !f.phone.trim()) e.email = "Add an email or a phone number.";
  if (!f.source.trim()) e.source = "Pick a source.";
  return e;
}
export function AddLeadPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const go = useNavigate(), toast = useToast(), qc = useQueryClient();
  const [f, setF] = React.useState<Form>(EMPTY);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [matches, setMatches] = React.useState<z.infer<typeof KnownMatches> | null>(null);
  // A fresh panel each time it opens (the opener gives it a new key): empty fields and a new request id, set as it is
  // made, never cleared afterwards (a late clear could wipe what was already typed; review re-check, flaky fresh copies).
  const [requestId] = React.useState(() => crypto.randomUUID());
  const sending = React.useRef(false);   // one Save at a time, also for two clicks in one frame
  const matchBox = React.useRef<HTMLDivElement>(null);
  const dup = useDuplicateCheck();
  const [choice, setChoice] = React.useState<DupChoice | null>(null);
  const [keep, setKeep] = React.useState(true);
  const choose = (c: DupChoice | null) => { setChoice(c); setKeep(true); };
  const extra = unmatchedDetails(choice, f);
  // Break F1: the 409 box's "Use existing person" offers the same additions (BR-5b), with the reasons the hint had for
  // that person; when the hint never ran, both typed details are offered (one of them matched exactly).
  const reasonsOf = (personId: string) => (dup.state.status === "done" ? dup.state.out.matches.find((m) => m.kind === "PERSON" && m.personId === personId)?.reasons : undefined) ?? [];
  const extraFor = (personId?: string) => (!personId ? [] : choice?.kind === "person" ? extra : unmatchedDetails({ kind: "person", personId, name: "", reasons: reasonsOf(personId) }, f));
  const known = matches?.find((m) => m.personId)?.personId ?? undefined;
  const extra409 = extraFor(known);
  const checkNow = () => { if (!matches && !choice) dup.request(checkBody(f)); };
  // The keyboard lands on the choice (break m5), after the browser has moved focus off the Save lead button it just
  // switched off (that move goes to the dialog, so focusing at once would be undone).
  React.useEffect(() => { if (!matches) return; const t = setTimeout(() => matchBox.current?.focus(), 50); return () => clearTimeout(t); }, [matches]);
  const seen = useSources().data ?? [];
  const offered = suggestions([...seen, ...SAMPLE_SOURCES]);
  const save = useMutation({
    mutationFn: async (c: Choice) => Lead.parse(await staffApi("/front-office/leads", { method: "POST", json: {
      requestId, givenNames: f.givenNames.trim() || undefined, familyName: f.familyName.trim() || undefined, email: f.email.trim() || undefined,
      phone: f.phone.trim() || undefined, source: f.source.trim(), note: noteOf(c) || undefined, ...c,
    } })),
    onSuccess: (l) => {
      toast.push({ tone: "ok", text: `Lead ${l.number} added. You own it.` });
      void qc.invalidateQueries({ queryKey: ["fo", "leads"] }); void qc.invalidateQueries({ queryKey: ["fo", "lead-sources"] });
      onOpenChange(false); go(`/front-office/leads/${l.id}`, { state: { from: "mine" } });
    },
    onError: (e) => {
      if (e instanceof StaffApiError && e.problem.code === "KNOWN_PERSON") { setKeep(true); const m = KnownMatches.safeParse(e.problem.matches); setMatches(m.success ? m.data : [{ personId: null, name: "A person you cannot see" }]); return; }
      // Break F3: the picked person can no longer be opened (taken away meanwhile): drop the pick, say so, check again.
      if (e instanceof StaffApiError && e.status === 404 && choice?.kind === "person") { choose(null); dup.clear(); setErrors({ form: `${choice.name} can no longer be opened. Choose again, or add as new.` }); dup.request(checkBody(f)); return; }
      if (e instanceof StaffApiError && e.problem.fields && Object.keys(e.problem.fields).length) { setErrors(fieldWords(e.problem.fields)); return; }
      setErrors({ form: e instanceof StaffApiError ? e.message : "Could not add the lead. Please try again." });
    },
    onSettled: () => { sending.current = false; },
  });
  // BR-5b: the offered details, kept, go in the first note after anything typed there (one line).
  const noteOf = (c: Choice) => { const typed = f.note.trim(), add = extraFor(c.personId); return c.personId && keep && add.length ? [typed, keptLine(add)].filter(Boolean).join("\n\n") : typed; };
  const send = (given?: Choice) => {
    if (sending.current) return;
    // The hint's choice travels with Save (BR-5): no second question. A 409 box's own buttons pass theirs.
    const c: Choice = given ?? (choice?.kind === "person" ? { personId: choice.personId } : choice?.kind === "new" ? { confirmedNew: true } : {});
    const e: Record<string, string> = c.personId && !choice ? {} : check(f, !!c.personId);
    if (c.personId && noteOf(c).length > NOTE_MAX) e.note = "The first note is too long to also keep the details below. Shorten it, or untick them.";
    setErrors(e);
    if (Object.keys(e).length) { setTimeout(() => document.querySelector<HTMLElement>("[data-add-lead] [aria-invalid=true]")?.focus(), 0); return; }
    sending.current = true; save.mutate(c);
  };
  // Changing a detail after a match was shown asks again: the match was for the details as they were.
  // A key edited after a check or a choice clears both and checks again on leaving the field (BR-2, BR-5).
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setF({ ...f, [k]: e.target.value });
    if (KEYS.has(k)) { setMatches(null); dup.clear(); if (choice) choose(null); }
    if (errors[k] || errors.form) setErrors({ ...errors, [k]: "", form: "" });
  };
  const err = (k: string) => errors[k] || null;
  return (
    <Panel open={open} onOpenChange={(o) => { if (!save.isPending) onOpenChange(o); }}
      // Escape, the overlay or the X never throw away a half-typed enquiry without asking (review S4).
      confirmClose={() => !save.isPending && (Object.values(f).every((v) => !v.trim()) || window.confirm("Discard this lead? What you typed is not saved."))} title="Add a lead" description="For a phone call, a walk-in or an email. You will own the lead."
      footer={<>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
        <Button type="button" busy={save.isPending && !matches} disabled={!!matches}  className="h-auto min-h-9 min-w-0 max-w-full shrink whitespace-normal py-1.5 text-left [overflow-wrap:anywhere]" title={matches ? "Choose above: use the person on file, or add as new." : choice?.kind === "person" && choice.name.length > 40 ? `Add lead to ${choice.name}` : undefined} onClick={() => send()}>{choice?.kind === "person" ? `Add lead to ${short(choice.name)}` : "Save lead"}</Button>
      </>}>
      <form data-add-lead noValidate className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (!matches) send(); }}>
        {/* While a save is out, the details cannot change under it (break m1: a match shown for details no longer there). */}
        <fieldset disabled={save.isPending} className="flex flex-col gap-3">
        {errors.form ? <Notice tone="danger" title={errors.form} /> : null}
        <Field label="First name" error={err("givenNames")}><Input autoComplete="off" maxLength={100} value={f.givenNames} onChange={set("givenNames")} onBlur={checkNow} /></Field>
        <Field label="Last name (optional)" error={err("familyName")}><Input autoComplete="off" maxLength={100} value={f.familyName} onChange={set("familyName")} onBlur={checkNow} /></Field>
        <Field label="Email" hint={err("email") ? undefined : "An email or a phone number is needed."} error={err("email")}><Input type="email" autoComplete="off" maxLength={254} value={f.email} onChange={set("email")} onBlur={checkNow} /></Field>
        <Field label="Phone" error={err("phone")}><Input type="tel" inputMode="tel" autoComplete="off" maxLength={40} value={f.phone} onChange={set("phone")} onBlur={checkNow} /></Field>
        {matches ? null : <DuplicateHint state={dup.state} choice={choice} onChoose={choose} keep={keep} onKeep={(k) => { setKeep(k); if (errors.note) setErrors({ ...errors, note: "" }); }} typed={f} disabled={save.isPending} />}
        {/* Review m1: one live region, always mounted, says each change of the hint once (the boxes hold buttons). */}
        <p data-dup-live className="sr-only" aria-live="polite">{matches ? "" : hintAnnouncement(dup.state, choice)}</p>
        <Field label="Source" hint={err("source") ? undefined : "Where the enquiry came from, in your words. Pick one or type your own."} error={err("source")}>
          <Input list="fo-add-lead-sources" autoComplete="off" maxLength={60} value={f.source} onChange={set("source")} />
        </Field>
        <datalist id="fo-add-lead-sources">{offered.map((s) => <option key={s} value={s} />)}</datalist>
        <Field label="First note (optional)" error={err("note")}><Textarea rows={3} maxLength={5000} value={f.note} onChange={set("note")} /></Field>
        </fieldset>
        {matches ? (
          <div data-known-person role="status" tabIndex={-1} ref={matchBox} className="flex flex-col gap-2 rounded-lg border border-border p-3 outline-none focus:ring-[3px] focus:ring-ring/50">
            <p className="text-sm font-medium">This person may already be on file. Nothing is saved until you choose.</p>
            {matches.map((m, i) => m.personId ? (
              <div key={m.personId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span data-match-line>Possible match: {m.name}{m.lead ? ` (${m.lead})` : ""}</span>
                <Button type="button" size="sm" variant="outline" busy={save.isPending && save.variables?.personId === m.personId} onClick={() => send({ personId: m.personId! })}>Use existing person</Button>
              </div>
            ) : <p key={i} data-match-line className="text-sm text-text-muted">Possible match with a record you cannot open — ask a manager.</p>)}
            {extra409.length ? (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" data-dup-keep className="mt-1" checked={keep} disabled={save.isPending} onChange={(e) => { setKeep(e.target.checked); if (errors.note) setErrors({ ...errors, note: "" }); }} />
                <span className="min-w-0 [overflow-wrap:anywhere]">{keep ? <>With Use existing person, also keep in the lead&apos;s first note: {extra409.join(" · ")}</> : <span className="text-text-warn">Not saved: {extra409.join(" · ")}</span>}</span>
              </label>
            ) : null}
            <div className="flex justify-end"><Button type="button" size="sm" busy={save.isPending && !!save.variables?.confirmedNew} onClick={() => send({ confirmedNew: true })}>Add as new</Button></div>
          </div>
        ) : null}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Panel>
  );
}
