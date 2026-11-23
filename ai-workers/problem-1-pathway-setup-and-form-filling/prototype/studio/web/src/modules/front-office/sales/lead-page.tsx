// FO-4 part 1 (concept r2 §4 screen 4, pattern Workspace; BR-1, BR-2, BR-5, BR-10; AG-2-84, AG-2-86, AG-2-94): one lead.
// The header says Lead (a lead has no stage, type or value, BR-1); the possible-match line names only a person the viewer
// may see (BR-2, worded by FO-2); the right rail holds Take it. The timeline, Log a call, Add a note, Engage, Close and
// Reopen come with FO-2 part 2. A lead the viewer may not see reads as not found, like another firm's (AG-2-94 rule 16).
// FO-4 part 2a (BR-7, AG-2-75): Engage (Individual), a right panel saying what it does; every Engage makes a prospect,
// and a second one says so. Corporate Engage is FO-4c's.
// FO-3st1 part 2 (BR-16, AG-4-50): arriving with ?engage=1 (the consult record's "Engage and prepare retainer") opens the
// Engage panel once, for a person who may engage (else a message says why not); the parameter is then dropped, so a
// reload does not open it again.
// FO-9a phone part (R1.33): the Phone row's Edit (key agent/prospect:edit) saves through PATCH people/:personId; "Fix
// number" opens it. A number the server cannot read shows its sentence under the field and nothing is saved.
import * as React from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Notice, Panel, Pill } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { MessagesPanel } from "@/modules/platform/messages/messages-panel";
import { can, KEY, Lead, Prospect, READ_ONLY_REASON, words } from "./contract";
import { Loading } from "./loading";
import { AssignPanel, OwnerHistory } from "./lead-owner";
import { useLock, useOwners, useReturnFocus } from "./prospect-actions";
import { SalesFrame, useStaff } from "./sales-frame";
import { staffApi, StaffApiError } from "./session";
import { useTakeIt } from "./take-it";
import { IdentityCheckPanel } from "../compliance/identity/identity-panel";
import { arrivedLabel, sinceLabel } from "./time";
import { useTabDirty } from "@/components/workspace";
import { ConflictNotice } from "@/lib/sync/conflict";
import { DraftLine, useSharedDraft } from "@/lib/sync/drafts";
const ATTRIBUTION: Record<string, string> = { utmSource: "Campaign source", utmMedium: "Medium", utmCampaign: "Campaign", utmTerm: "Term", utmContent: "Content", clickId: "Click id", clickIdKind: "Click id kind", landingPage: "Landing page", referrerUrl: "Referring page" };
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[8rem_1fr] gap-2 py-1.5 text-sm"><dt className="text-text-muted">{label}</dt><dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd></div>;
}
function PhoneRow({ person, mayEdit, leadId }: { person: Lead["person"]; mayEdit: boolean; leadId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  // PF-31 (EXPERIENCE §2.12): the number being typed is the person's one shared draft: it shows in every view of this lead
  // (another window mirrors it), survives a reload, opens the field wherever a draft exists, and is saved once with If-Match.
  const draft = useSharedDraft<string>(mayEdit ? `fo-person:${person.id}:phone` : null, person.phone ?? "", person.version ?? null, ["fo", "leads"]);
  const [open, setOpen] = React.useState(false);
  const editing = open || draft.dirty, value = draft.values ?? "";
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<{ phone: string; version: string; message: string } | null>(null);
  useTabDirty(draft.dirty, draft.discard);
  const field = React.useRef<HTMLInputElement>(null);
  // Focus goes back to the control that opened the field (Edit or Fix number) when it closes (breaker F6).
  const opener = React.useRef<HTMLButtonElement | null>(null);
  const wasEditing = React.useRef(false);
  const sending = React.useRef(false);   // one save at a time, also for two clicks in one frame (breaker F4)
  const openIt = (e: React.MouseEvent<HTMLButtonElement>) => { opener.current = e.currentTarget; setError(null); setOpen(true); };
  const close = () => { draft.discard(); setOpen(false); setConflict(null); };
  React.useEffect(() => {
    if (editing && !wasEditing.current && open) field.current?.focus();
    else if (!editing && wasEditing.current) (opener.current?.isConnected ? opener.current : document.querySelector<HTMLButtonElement>("[data-phone-edit-open]"))?.focus();
    wasEditing.current = editing;
  }, [editing, open]);
  const save = useMutation({
    mutationFn: async (phone: string) => staffApi(`/front-office/people/${encodeURIComponent(person.id)}`, { method: "PATCH", json: { phone }, headers: draft.version ? { "if-match": `"${draft.version}"` } : undefined }),
    onSuccess: async () => { setOpen(false); setConflict(null); draft.saved(); toast.push({ tone: "ok", text: "Phone number saved." }); await qc.invalidateQueries({ queryKey: ["fo", "leads"] }); },
    onError: async (e) => {
      if (e instanceof StaffApiError && e.status === 409 && e.problem.code === "STALE") {
        const l = await staffApi(`/front-office/leads/${encodeURIComponent(leadId)}`).then((r) => Lead.parse(r)).catch(() => null);
        if (l) { setConflict({ phone: l.person.phone ?? "", version: l.person.version ?? "", message: e.message }); void qc.invalidateQueries({ queryKey: ["fo", "leads"] }); return; }
      }
      setError(e instanceof StaffApiError ? e.field("phone") ?? e.message : "Could not save the number. Please try again.");
    },
  });
  const fix = person.fixNumber && person.phone;
  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        {conflict ? <ConflictNotice message={conflict.message} rows={[{ label: "Phone", saved: conflict.phone, mine: value }]}
          onSaved={() => { setConflict(null); close(); }} onMine={() => { draft.rebase(conflict.phone, conflict.version); setConflict(null); }} /> : null}
        <form data-phone-edit className="flex flex-col gap-1.5" noValidate onKeyDown={(e) => { if (e.key === "Escape" && !save.isPending) close(); }}
          onSubmit={(e) => { e.preventDefault(); if (sending.current) return; sending.current = true; save.mutate(value, { onSettled: () => { sending.current = false; } }); }}>
          <label htmlFor="fo-phone-edit" className="sr-only">Phone</label>
          <div className="flex flex-wrap items-center gap-2">
            <Input id="fo-phone-edit" ref={field} type="tel" inputMode="tel" autoComplete="off" maxLength={40} className="max-w-xs" value={value} aria-invalid={!!error} aria-describedby={error ? "fo-phone-edit-error" : "fo-phone-edit-hint"}
              onChange={(e) => { draft.set(e.target.value); setError(null); }} data-phone-input />
            <Button type="submit" size="sm" busy={save.isPending} data-phone-save>Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={close}>Cancel</Button>
          </div>
          {error ? <p id="fo-phone-edit-error" role="alert" className="text-xs text-danger">{error}</p>
            : <p id="fo-phone-edit-hint" className="text-xs text-text-muted">With the country code if it is outside Canada, for example +44 20 7946 0000.</p>}
          <DraftLine draft={draft} what="the phone number" />
        </form>
      </div>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {person.phone ?? <span className="text-text-muted">Not given</span>}
      {fix && mayEdit ? <button type="button" data-fix-number onClick={openIt} title="This number could not be read as a phone number with its country. Fix it." className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"><Pill tone="warn">Fix number</Pill></button>
        : fix ? <Pill tone="warn" title="This number could not be read as a phone number with its country.">Fix number</Pill> : null}
      {mayEdit ? <Button type="button" size="sm" variant="ghost" aria-label="Edit phone" data-phone-edit-open onClick={openIt}>Edit</Button> : null}
    </span>
  );
}
function LeadBody({ id }: { id: string }) {
  const me = useStaff();
  const take = useTakeIt();
  const go = useNavigate(), toast = useToast(), qc = useQueryClient();
  const [engaging, setEngaging] = React.useState(false), lock = useLock(), focus = useReturnFocus();
  // R1.32 (AG-2-13c, X-4): Assign or Reassign for people who may assign; a one-user firm sees no owner, Take it or Assign.
  const owners = useOwners(), [assigning, setAssigning] = React.useState(false);
  const assignPanel = (o: boolean) => setAssigning(o);   // focus returns to Assign/Reassign as the panel closes (Panel returnFocus)
  const panel = (o: boolean) => { if (o) { focus.mark(); engage.reset(); } else focus.back(); setEngaging(o); };
  const engage = useMutation({
    mutationFn: async () => Prospect.parse(await staffApi(`/front-office/leads/${id}/engage`, { method: "POST" })),
    onSuccess: (p) => { toast.push({ tone: "ok", text: p.message ?? `Prospect ${p.number} started in ${p.stage.label}.` }); void qc.invalidateQueries({ queryKey: ["fo"] }); go(`/front-office/prospects/${p.id}`); },
    onSettled: () => lock.free(),
  });
  const lead = useQuery({ queryKey: ["fo", "leads", "one", id], retry: false, queryFn: async () => Lead.parse(await staffApi(`/front-office/leads/${encodeURIComponent(id)}`)) });
  const [params, setParams] = useSearchParams(), here = useLocation(), askEngage = params.get("engage") === "1";
  React.useEffect(() => {
    if (!askEngage || !lead.data || !owners.settled) return;
    setParams((p) => { p.delete("engage"); return p; }, { replace: true, state: here.state });
    if (can(me, KEY.edit) && lead.data.state !== "CLOSED") panel(true);
    // Never a silent dead end (break M2): say why the Engage panel did not open.
    else toast.push({ tone: "info", text: lead.data.state === "CLOSED" ? "This lead is closed, so it cannot be engaged." : "Engaging a lead needs a role that works prospects. Ask your firm's Owner or Admin." });
  }, [askEngage, lead.data, owners.settled]);   // eslint-disable-line react-hooks/exhaustive-deps -- once, when the lead has loaded
  // The rail waits for who may own what (review m2), so its buttons never rearrange under the person.
  if (lead.isPending || !owners.settled) return <Loading label="Loading the lead" rows={2} />;
  if (lead.isError) {
    const gone = lead.error instanceof StaffApiError && lead.error.status === 404;
    return (
      <section className="mx-auto max-w-xl rounded-xl border border-border bg-surface-raised p-6">
        <h1 className="text-lg font-semibold">{gone ? "Lead not found" : "Could not load the lead"}</h1>
        <p className="mt-1 text-sm text-text-muted">{gone ? "There is no such lead in your firm, or it is not one you may see." : lead.error instanceof StaffApiError ? lead.error.message : "Please try again."}</p>
        <Link to="/front-office/leads" className="mt-3 inline-block text-sm text-text-link hover:underline">Back to Leads</Link>
      </section>
    );
  }
  const l = lead.data;
  const name = [l.person.givenNames, l.person.familyName].filter(Boolean).join(" ") || "(no name)";
  const ownerActive = l.ownerStaffId !== null && !(l.owner ?? "").startsWith("(Inactive) ");
  const mayTake = can(me, KEY.edit) && l.state === "OPEN" && !ownerActive && !owners.oneUser;
  const mayAssign = can(me, KEY.assign) && l.state === "OPEN" && !owners.oneUser;
  const mayEngage = can(me, KEY.edit) && l.state !== "CLOSED";
  const attribution = Object.entries(l.attribution ?? {}).filter(([k, v]) => k in ATTRIBUTION && typeof v === "string");
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold text-text [overflow-wrap:anywhere]">{name}</h1>
        <Pill tone="info">{l.label}</Pill>
        <Pill>{words(l.state)}</Pill>
        <span className="text-sm text-text-muted">{l.number}</span>
      </header>
      {l.possibleMatch ? (
        <Notice tone="info" title={l.possibleMatch.line}>
          Someone with the same email or phone is already on file. Nothing is linked: this enquiry stays its own lead.
        </Notice>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="flex flex-col gap-4">
          <section aria-labelledby="fo-person" className="rounded-xl border border-border bg-surface-raised p-4">
            <h2 id="fo-person" className="text-sm font-semibold">Person</h2>
            <dl className="mt-2">
              <Row label="Email">{l.person.email ?? <span className="text-text-muted">Not given</span>}</Row>
              <Row label="Phone"><PhoneRow person={l.person} mayEdit={can(me, KEY.edit)} leadId={l.id} /></Row>
            </dl>
          </section>
          <IdentityCheckPanel personId={l.person.id} name={[l.person.givenNames, l.person.familyName].filter((x) => x && x.trim()).join(" ")} />
          <section aria-labelledby="fo-enquiry" className="rounded-xl border border-border bg-surface-raised p-4">
            <h2 id="fo-enquiry" className="text-sm font-semibold">Enquiry</h2>
            <dl className="mt-2">
              <Row label="Interested in">{l.interestedIn ?? <span className="text-text-muted">Not given</span>}</Row>
              <Row label="Source">{words(l.source)}{l.sourceDetail ? <span className="text-text-muted"> · {l.sourceDetail}</span> : null}</Row>
              <Row label="Arrived"><span title={`${sinceLabel(l.arrivedAt)} ago`}>{arrivedLabel(l.arrivedAt)}</span></Row>
              {attribution.map(([k, v]) => <Row key={k} label={ATTRIBUTION[k]}>{String(v)}</Row>)}
            </dl>
          </section>
          {owners.oneUser ? null : <OwnerHistory lead={l} />}
          <MessagesPanel subject={{ kind: "LEAD", id: l.id }} />
        </div>
        <aside aria-label="Owner and actions" className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4">
          {owners.oneUser ? null : <div>
            <p className="text-xs font-medium text-text-muted">Owner</p>
            <p data-owner className="mt-0.5 text-sm">{l.owner ?? "Nobody yet"}</p>
          </div>}
          {mayTake ? <Button busy={take.isPending} onClick={() => take.mutate(l)}>Take it</Button>
            : !can(me, KEY.edit) && l.state === "OPEN" && !ownerActive && !owners.oneUser ? <p data-why-no-take className="text-xs text-text-muted">{READ_ONLY_REASON}</p> : null}
          {mayAssign ? <Button variant="outline" data-assign-open onClick={() => assignPanel(true)}>{ownerActive ? "Reassign" : "Assign"}</Button> : null}
          {mayEngage ? <Button variant={mayTake ? "outline" : "default"} onClick={() => panel(true)}>Engage</Button> : null}
        </aside>
      </div>
      {/* Kept mounted while open, so a refusal (someone closed the lead meanwhile) is read in the panel (break 6). */}
      {can(me, KEY.assign) && !owners.oneUser ? <AssignPanel lead={l} open={assigning} onOpenChange={assignPanel} /> : null}
      <Panel open={engaging} onOpenChange={panel} title="Engage" description={`${name}, ${l.number}`}
        footer={<><Button variant="ghost" onClick={() => panel(false)}>Cancel</Button><Button busy={engage.isPending} onClick={() => { if (lock.take()) engage.mutate(); }}>Engage as Individual</Button></>}>
        {engage.isError ? <Notice tone="danger" className="mb-3" title={engage.error instanceof StaffApiError ? engage.error.message : "Could not engage the lead. Please try again."} /> : null}
        <p className="text-sm">Starts a prospect on the Individual pipeline in Engaged. {ownerActive ? `${l.owner} stays its owner` : "You become its owner"}. Nothing is sent to {name}.</p>
        {l.state === "ENGAGED" ? <p className="mt-2 text-sm text-text-muted" data-engaged-already>This lead is already engaged: this starts another prospect for it.</p> : null}
      </Panel>
    </div>
  );
}
export function LeadPage() {
  const { id = "" } = useParams();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const back = { to: from && from !== "unassigned" ? `/front-office/leads?view=${from}` : "/front-office/leads", label: "Leads" };
  return <SalesFrame crumbs={[{ label: "Leads", to: back.to }, { label: "Lead" }]} back={back}><LeadBody id={id} /></SalesFrame>;
}
