// PF-21s part 3 (concept screens/pf-21-complaints §4 "Drawers", §5; BR-9; G4): Record a complaint, a side panel. It
// always asks for the complainant's name; a front-office or case-party kind is offered only when its id came in the
// address, else "Someone else" alone. Handler from GET /handlers, you by default. Field errors (422 `fields`) show on
// each field with a summary, and what was typed is kept. Times are typed in the firm's zone.
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Notice, Panel, Select, Textarea } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { usePlatformStaff } from "../frame";
import { staffApi, StaffApiError, staffToken } from "../session";
import { CATEGORY, CHANNEL, Handlers, has, KEY, KIND, nowLocal, Recorded, zonedToIso, zoneName } from "./contract";

export type Linked = { kind: "FRONT_OFFICE_PERSON" | "CASE_PARTY"; id: string; name: string };
type Form = { subjectKind: string; complainantName: string; complainantContact: string; receivedAt: string; channel: string; category: string; summary: string; handlerStaffId: string };
/** What the person typed, kept in this tab's memory while the drawer is open (never stored): a session that ends
 *  mid-drawer unmounts the page, and signing in again as the same person brings the drawer back with it (break M3). */
let kept: { staffId: string; form: Form } | null = null;
export const hasKept = (staffId: string) => kept?.staffId === staffId;
/** A fresh Idempotency-Key (visible ASCII, as the route asks), also where crypto.randomUUID is not offered. */
const newRequestKey = () => globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const LABEL: Record<string, string> = { subjectKind: "Who made it", subjectId: "Who made it", complainantName: "Their name", complainantContact: "How to reach them", receivedAt: "Received", channel: "How it came", category: "About", summary: "What it is about", handlerStaffId: "Handler" };

export function RecordDrawer({ open, onOpenChange, linked, zone, returnFocus }: { open: boolean; onOpenChange: (o: boolean) => void; linked: Linked | null; zone: string | undefined; returnFocus: () => HTMLElement | null }) {
  const me = usePlatformStaff();
  const qc = useQueryClient(), toast = useToast(), navigate = useNavigate();
  const handlers = useQuery({ queryKey: ["pf", "complaints", "handlers"], enabled: open, queryFn: async () => Handlers.parse(await staffApi("/platform/complaints/handlers")).items });
  const blank = React.useCallback((): Form => ({ subjectKind: linked?.kind ?? "OTHER_PERSON", complainantName: linked?.name ?? "", complainantContact: "", receivedAt: zone ? nowLocal(zone) : "", channel: "", category: "", summary: "", handlerStaffId: me.staffId }), [linked, zone, me.staffId]);
  const [f, setF] = React.useState<Form>(blank);
  const [restored, setRestored] = React.useState(false);
  // Leaving the page while still signed in drops the draft; only an ended session keeps it for the next sign-in.
  React.useEffect(() => () => { if (staffToken()) kept = null; }, []);
  const touched = React.useRef(false), sending = React.useRef(false), summary = React.useRef<HTMLDivElement>(null);
  // PF-21i: one Idempotency-Key per opening of the drawer, sent on each Record: a retry after a lost answer records once.
  // Made once (not per render); randomUUID needs a secure context, so plain http from another host falls back (review n2).
  const requestKey = React.useRef("");
  if (!requestKey.current) requestKey.current = newRequestKey();
  React.useEffect(() => {
    if (!open) return;
    const back = kept?.staffId === me.staffId ? kept.form : null;
    if (kept && !back) kept = null;   // another person's draft is never shown
    setF(back ?? blank()); setRestored(!!back); touched.current = !!back; save.reset(); requestKey.current = newRequestKey();
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps -- a fresh form each time it opens
  React.useEffect(() => { if (zone && !f.receivedAt) setF((x) => ({ ...x, receivedAt: nowLocal(zone) })); }, [zone]);   // eslint-disable-line react-hooks/exhaustive-deps -- the zone arrives once
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { touched.current = true; const v = e.target.value; setF((x) => { const next = { ...x, [k]: v }; kept = { staffId: me.staffId, form: next }; return next; }); };
  const discard = () => { if (touched.current && !window.confirm("Discard the complaint you started?")) return false; kept = null; return true; };
  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { subjectKind: f.subjectKind, receivedAt: f.receivedAt && zone ? zonedToIso(f.receivedAt, zone) : "", channel: f.channel || undefined, category: f.category || undefined, summary: f.summary, handlerStaffId: f.handlerStaffId };
      if (f.complainantName.trim()) body.complainantName = f.complainantName.trim();
      if (f.complainantContact.trim()) body.complainantContact = f.complainantContact.trim();
      if (linked && f.subjectKind === linked.kind) body.subjectId = linked.id;
      return Recorded.parse(await staffApi("/platform/complaints", { method: "POST", json: body, headers: { "Idempotency-Key": requestKey.current } }));
    },
    onSettled: () => { sending.current = false; },
    onError: () => setTimeout(() => summary.current?.focus(), 0),
    onSuccess: (c) => {
      kept = null;
      void qc.invalidateQueries({ queryKey: ["pf", "complaints"] });
      onOpenChange(false);
      const handler = handlers.data?.find((h) => h.id === c.handlerStaffId)?.displayName ?? "The handler";
      // Someone who neither handles it nor reads all would get Not found on the record, so they stay on the list (§5).
      if (c.handlerStaffId === me.staffId || has(me, KEY.read)) { toast.push({ tone: "ok", text: "Complaint recorded." }); navigate(`/platform/complaints/${c.id}`); }
      else toast.push({ tone: "ok", text: `Complaint recorded. ${handler} handles it.` });
      if (c.reminderScheduled === false) toast.push({ tone: "danger", text: "Recorded. The reminder could not be set; it still shows as overdue when its date passes." });
    },
  });
  const err = save.error instanceof StaffApiError ? save.error : null;
  const fields = err?.problem.fields ?? {};
  const fe = (k: string) => fields[k] ?? null;
  const kinds = linked ? [linked.kind, "OTHER_PERSON"] : ["OTHER_PERSON"];
  const Sample = <span className="ml-1 font-normal text-text-muted">Sample list</span>;
  return (
    <Panel open={open} onOpenChange={onOpenChange} title="Record a complaint" description="It goes on the firm's complaints record and is never deleted." returnFocus={returnFocus}
      confirmClose={discard}
      footer={<><Button variant="ghost" onClick={() => { if (discard()) onOpenChange(false); }}>Cancel</Button><Button type="submit" form="pf-complaint-record" busy={save.isPending} disabled={!zone}>Record the complaint</Button></>}>
      <form id="pf-complaint-record" noValidate className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (sending.current) return; sending.current = true; save.mutate(); }} data-record-drawer>
        {restored ? <Notice tone="info" title="Your session ended">We kept what you typed. It was not recorded yet: check it and record it.</Notice> : null}
        <div ref={summary} tabIndex={-1} className="outline-none">{err ? <Notice tone="danger" title="There is a problem">{Object.keys(fields).length ? <ul className="list-disc pl-4">{Object.entries(fields).map(([k, v]) => <li key={k}>{LABEL[k] ?? k}: {v}</li>)}</ul> : err.message}</Notice>
          : save.error ? <Notice tone="danger" title="There is a problem">Could not record the complaint. Please try again.</Notice> : null}</div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-xs font-medium text-text">Who made it</legend>
          {kinds.map((k) => <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="pf-kind" value={k} checked={f.subjectKind === k} onChange={set("subjectKind")} />{KIND[k]}</label>)}
          {!linked ? <p className="text-xs text-text-muted">Complaints from a front-office contact or a person on a case are recorded from that person's page.</p> : null}
          {fe("subjectId") ? <p role="alert" className="text-xs text-text-danger">{fe("subjectId")}</p> : null}
        </fieldset>
        <Field label="Their name" error={fe("complainantName")}><Input value={f.complainantName} onChange={set("complainantName")} maxLength={200} required autoComplete="off" /></Field>
        <Field label="How to reach them (optional)" error={fe("complainantContact")}><Input value={f.complainantContact} onChange={set("complainantContact")} maxLength={320} autoComplete="off" /></Field>
        <Field label={`Received (${zone ? zoneName(zone) : "firm's time"})`} error={fe("receivedAt")}><Input type="datetime-local" value={f.receivedAt} onChange={set("receivedAt")} required /></Field>
        <Field label="How it came" error={fe("channel")} hint={Sample}><Select value={f.channel} onChange={set("channel")} required><option value="">Choose</option>{Object.entries(CHANNEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="About" error={fe("category")} hint={Sample}><Select value={f.category} onChange={set("category")} required><option value="">Choose</option>{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="What it is about" error={fe("summary")}><Textarea value={f.summary} onChange={set("summary")} rows={5} maxLength={4000} required /></Field>
        <Field label="Handler" error={fe("handlerStaffId") ?? (handlers.isError ? "Could not load the staff list." : null)} hint="An active staff member of your firm who may record complaints. They are reminded if it is not acknowledged within 2 business days (Sample).">
          <Select value={f.handlerStaffId} onChange={set("handlerStaffId")}>
            {(handlers.data ?? [{ id: me.staffId, displayName: me.displayName }]).map((h) => <option key={h.id} value={h.id}>{h.displayName}{h.id === me.staffId ? " (you)" : ""}</option>)}
          </Select>
        </Field>
      </form>
    </Panel>
  );
}
