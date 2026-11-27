// QA-779 part (a) (R1.53; the tech lead's ruling on #3532): the prospect page's Contact block for an Individual prospect,
// the place the retainer's "The signer needs an email. Add it on <client>'s record" links to. The person's email ("Not
// given" when none) with Add email or Edit email for people with agent/prospect:edit, read only otherwise. Saved through
// PATCH people/:personId `{ email }` with the person's version as If-Match (PF-31), the lead page's phone editor's pattern:
// one shared draft (EXPERIENCE §2.13), Escape cancels, focus back on the opener, a stale save shows both values. After a
// save: "Email saved.", the server's warning when another person has the address (P-574 (2)), and, when the gate now says
// the conflict check searched the old details (compliance/conflict/gate.ts, CONFLICT_CHECK_STALE), that it is run again
// before the retainer is sent.
import * as React from "react";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Notice } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { useTabDirty } from "@/components/workspace";
import { ConflictNotice } from "@/lib/sync/conflict";
import { DraftLine, useSharedDraft } from "@/lib/sync/drafts";
import { useConflictList } from "../compliance/conflict/conflict-panel";
import { conflictKey } from "../compliance/conflict/contract";
import { Prospect } from "./contract";
import { staffApi, StaffApiError } from "./session";

const Saved = z.object({ email: z.string().nullable(), version: z.string(), warning: z.string().optional() });
export const CHECK_AGAIN = "The conflict check was run with the old email. Run it again before you send the retainer.";

export function PersonEmail({ prospectId, person, mayEdit }: { prospectId: string; person: NonNullable<Prospect["person"]>; mayEdit: boolean }) {
  const qc = useQueryClient(), toast = useToast(), key = ["fo", "prospects", "one", prospectId];
  const draft = useSharedDraft<string>(mayEdit ? `fo-person:${person.id}:email` : null, person.email ?? "", person.version ?? null, ["fo", "prospects"]);
  const [open, setOpen] = React.useState(false);
  const editing = open || draft.dirty, value = draft.values ?? "";
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<{ email: string; version: string; message: string } | null>(null);
  const [warning, setWarning] = React.useState<string | null>(null), [saved, setSaved] = React.useState(false);
  const stale = useConflictList(prospectId).data?.clearance;
  useTabDirty(draft.dirty, draft.discard);
  const field = React.useRef<HTMLInputElement>(null), opener = React.useRef<HTMLButtonElement | null>(null);
  const wasEditing = React.useRef(false), sending = React.useRef(false);   // one save at a time, also for two clicks in one frame
  const openIt = (e: React.MouseEvent<HTMLButtonElement>) => { opener.current = e.currentTarget; setError(null); setWarning(null); setSaved(false); setOpen(true); };
  const close = () => { draft.discard(); setOpen(false); setConflict(null); setError(null); };
  React.useEffect(() => {
    if (editing && !wasEditing.current && open) field.current?.focus();
    else if (!editing && wasEditing.current) (opener.current?.isConnected ? opener.current : document.querySelector<HTMLButtonElement>("[data-email-edit-open]"))?.focus();
    wasEditing.current = editing;
  }, [editing, open]);
  const save = useMutation({
    mutationFn: async (email: string) => Saved.parse(await staffApi(`/front-office/people/${encodeURIComponent(person.id)}`, { method: "PATCH", json: { email }, headers: draft.version ? { "if-match": `"${draft.version}"` } : undefined })),
    onSuccess: async (x) => {
      // The page shows the saved address at once (no flash of the old one while the prospect is read again).
      qc.setQueryData<Prospect>(key, (p) => (p?.person ? { ...p, person: { ...p.person, email: x.email, version: x.version } } : p));
      setOpen(false); setConflict(null); draft.saved(); setWarning(x.warning ?? null); setSaved(true);
      toast.push({ tone: "ok", text: "Email saved." });
      await Promise.all([["fo", "prospects"], ["fo", "leads"], conflictKey(prospectId)].map((k) => qc.invalidateQueries({ queryKey: k })));
    },
    onError: async (e) => {
      if (e instanceof StaffApiError && e.status === 409 && e.problem.code === "STALE") {
        const p = await staffApi(`/front-office/prospects/${encodeURIComponent(prospectId)}`).then((r) => Prospect.parse(r)).catch(() => null);
        if (p?.person) { sending.current = false; setConflict({ email: p.person.email ?? "", version: p.person.version ?? "", message: e.message }); qc.setQueryData(key, p); return; }
      }
      setError(e instanceof StaffApiError ? e.field("email") ?? e.message : "Could not save the email. Please try again.");
    },
  });
  let shown: React.ReactNode;
  if (editing) {
    shown = (
      <div className="flex flex-col gap-2">
        {conflict ? <ConflictNotice message={conflict.message} rows={[{ label: "Email", saved: conflict.email, mine: value }]}
          onSaved={() => { setConflict(null); close(); }} onMine={() => { draft.rebase(conflict.email, conflict.version); setConflict(null); }} /> : null}
        <form data-email-edit className="flex flex-col gap-1.5" noValidate onKeyDown={(e) => { if (e.key === "Escape" && !save.isPending) close(); }}
          onSubmit={(e) => { e.preventDefault(); if (sending.current) return; sending.current = true; save.mutate(value, { onSettled: () => { sending.current = false; } }); }}>
          <label htmlFor="fo-email-edit" className="sr-only">Email</label>
          <div className="flex flex-wrap items-center gap-2">
            <Input id="fo-email-edit" ref={field} type="email" inputMode="email" autoComplete="off" maxLength={254} className="max-w-xs" value={value} aria-invalid={!!error} aria-describedby={error ? "fo-email-edit-error" : "fo-email-edit-hint"}
              onChange={(e) => { draft.set(e.target.value); setError(null); }} data-email-input />
            <Button type="submit" size="sm" busy={save.isPending} data-email-save>Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={close}>Cancel</Button>
          </div>
          {error ? <p id="fo-email-edit-error" role="alert" className="text-xs text-danger">{error}</p>
            : <p id="fo-email-edit-hint" className="text-xs text-text-muted">For example name@example.com.</p>}
          <DraftLine draft={draft} what="the email" />
        </form>
      </div>
    );
  } else {
    shown = (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span data-person-email>{person.email ?? <span className="text-text-muted">Not given</span>}</span>
        {mayEdit ? <Button type="button" size="sm" variant="ghost" data-email-edit-open onClick={openIt}>{person.email ? "Edit email" : "Add email"}</Button> : null}
      </span>
    );
  }
  return (
    <div data-contact className="mt-3 border-t border-border pt-3">
      <h3 className="text-sm font-semibold">Contact</h3>
      <dl className="mt-1"><div className="grid grid-cols-[8rem_1fr] gap-2 py-1.5 text-sm"><dt className="text-text-muted">Email</dt><dd className="min-w-0 [overflow-wrap:anywhere]">{shown}</dd></div></dl>
      {saved && !editing && warning ? <Notice tone="warn" title={warning} className="mt-2" /> : null}
      {saved && !editing && stale && !stale.ok && stale.code === "CONFLICT_CHECK_STALE" ? <div data-check-again><Notice tone="warn" title={CHECK_AGAIN} className="mt-2"
        action={<Button variant="link" size="sm" onClick={() => document.getElementById("fo-conflict")?.focus()}>Go to the conflict check</Button>} /></div> : null}
    </div>
  );
}
