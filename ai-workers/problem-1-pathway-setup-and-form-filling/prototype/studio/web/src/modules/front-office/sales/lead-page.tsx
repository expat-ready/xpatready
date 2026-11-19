// FO-4 part 1 (concept r2 §4 screen 4, pattern Workspace; BR-1, BR-2, BR-5, BR-10; AG-2-84, AG-2-86, AG-2-94): one lead.
// The header says Lead (a lead has no stage, type or value, BR-1); the possible-match line names only a person the viewer
// may see (BR-2, worded by FO-2); the right rail holds Take it. The timeline, Log a call, Add a note, Engage, Close and
// Reopen come with FO-2 part 2. A lead the viewer may not see reads as not found, like another firm's (AG-2-94 rule 16).
// FO-4 part 2a (BR-7, AG-2-75): Engage (Individual), a right panel saying what it does; every Engage makes a prospect,
// and a second one says so. Corporate Engage is FO-4c's.
import * as React from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Notice, Panel, Pill } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { can, KEY, Lead, Prospect, READ_ONLY_REASON, words } from "./contract";
import { Loading } from "./loading";
import { SalesFrame, useStaff } from "./sales-frame";
import { staffApi, StaffApiError } from "./session";
import { useTakeIt } from "./take-it";
import { arrivedLabel, sinceLabel } from "./time";
const ATTRIBUTION: Record<string, string> = { utmSource: "Campaign source", utmMedium: "Medium", utmCampaign: "Campaign", utmTerm: "Term", utmContent: "Content", clickId: "Click id", clickIdKind: "Click id kind", landingPage: "Landing page", referrerUrl: "Referring page" };
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[8rem_1fr] gap-2 py-1.5 text-sm"><dt className="text-text-muted">{label}</dt><dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd></div>;
}
function LeadBody({ id }: { id: string }) {
  const me = useStaff();
  const take = useTakeIt();
  const go = useNavigate(), toast = useToast(), qc = useQueryClient();
  const [engaging, setEngaging] = React.useState(false);
  const engage = useMutation({
    mutationFn: async () => Prospect.parse(await staffApi(`/front-office/leads/${id}/engage`, { method: "POST" })),
    onSuccess: (p) => { toast.push({ tone: "ok", text: p.message ?? `Prospect ${p.number} started in ${p.stage.label}.` }); void qc.invalidateQueries({ queryKey: ["fo"] }); go(`/front-office/prospects/${p.id}`); },
  });
  const lead = useQuery({ queryKey: ["fo", "leads", "one", id], retry: false, queryFn: async () => Lead.parse(await staffApi(`/front-office/leads/${encodeURIComponent(id)}`)) });
  if (lead.isPending) return <Loading label="Loading the lead" rows={2} />;
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
  const mayTake = can(me, KEY.edit) && l.state === "OPEN" && !ownerActive;
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
              <Row label="Phone">{l.person.phone ?? <span className="text-text-muted">Not given</span>}{l.person.fixNumber && l.person.phone ? <> <Pill tone="warn" title="This number could not be read as a phone number with its country.">Fix number</Pill></> : null}</Row>
            </dl>
          </section>
          <section aria-labelledby="fo-enquiry" className="rounded-xl border border-border bg-surface-raised p-4">
            <h2 id="fo-enquiry" className="text-sm font-semibold">Enquiry</h2>
            <dl className="mt-2">
              <Row label="Interested in">{l.interestedIn ?? <span className="text-text-muted">Not given</span>}</Row>
              <Row label="Source">{words(l.source)}{l.sourceDetail ? <span className="text-text-muted"> · {l.sourceDetail}</span> : null}</Row>
              <Row label="Arrived"><span title={`${sinceLabel(l.arrivedAt)} ago`}>{arrivedLabel(l.arrivedAt)}</span></Row>
              {attribution.map(([k, v]) => <Row key={k} label={ATTRIBUTION[k]}>{String(v)}</Row>)}
            </dl>
          </section>
        </div>
        <aside aria-label="Owner and actions" className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4">
          <div>
            <p className="text-xs font-medium text-text-muted">Owner</p>
            <p data-owner className="mt-0.5 text-sm">{l.owner ?? "Nobody yet"}</p>
          </div>
          {mayTake ? <Button busy={take.isPending} onClick={() => take.mutate(l)}>Take it</Button>
            : !can(me, KEY.edit) && l.state === "OPEN" && !ownerActive ? <p data-why-no-take className="text-xs text-text-muted">{READ_ONLY_REASON}</p> : null}
          {mayEngage ? <Button variant={mayTake ? "outline" : "default"} onClick={() => { engage.reset(); setEngaging(true); }}>Engage</Button> : null}
        </aside>
      </div>
      <Panel open={engaging} onOpenChange={setEngaging} title="Engage" description={`${name}, ${l.number}`}
        footer={<><Button variant="ghost" onClick={() => setEngaging(false)}>Cancel</Button><Button busy={engage.isPending} onClick={() => engage.mutate()}>Engage as Individual</Button></>}>
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
