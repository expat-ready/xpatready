// FO-5s part 1 (concept screens/fo-5s-retainer-signing r2 §4 S2; BR-2, BR-3, BR-10 M2): the retainer card on the prospect
// page. Its status in words and one next step: none (or the last one withdrawn or expired) → Prepare retainer; Draft →
// Continue the draft; Sent or Viewed → waiting for the client; any other → Open the retainer. Prepare opens a right panel:
// the firm's active retainer template and the representative (only eligible people, the preparer pre-selected when
// eligible); the draft is made with the client's details and opens on its own page.
// FO-5cr (AG-4-50 rule 4): arriving with ?consultRecord=<id> (the consult record's "Prepare retainer") opens the panel
// once and sends the record's id: the server fills the first fee row from the record's recommended items and quoted fee
// (nothing is typed twice, nothing is sent), and its warnings show as notices on the retainer page. The mark then leaves the address.
import * as React from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Field, Notice, Panel, Pill, Select } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { can } from "../sales/contract";
import { useStaff } from "../sales/sales-frame";
import { staffApi, StaffApiError } from "../sales/session";
import { CLOSED, R_KEY, Representatives, Retainer, RetainerRows, STATUS, Templates } from "./contract";

export function RetainerCard({ prospectId, name, working }: { prospectId: string; name: string; working: boolean }) {
  const me = useStaff(), nav = useNavigate(), toast = useToast();
  const rows = useQuery({ enabled: can(me, R_KEY.list), queryKey: ["fo", "retainers", "of", prospectId], retry: false, queryFn: async () => RetainerRows.parse(await staffApi(`/front-office/prospects/${prospectId}/retainers`)) });
  const [open, setOpen] = React.useState(false), [templateId, setTemplateId] = React.useState(""), [repId, setRepId] = React.useState("");
  const [error, setError] = React.useState<{ field: string | null; text: string } | null>(null);
  const [params, setParams] = useSearchParams(), here = useLocation(), asked = params.get("consultRecord");
  const [recordId, setRecordId] = React.useState<string | null>(null);
  const templates = useQuery({ enabled: open, queryKey: ["fo", "retainer-templates"], queryFn: async () => Templates.parse(await staffApi("/front-office/retainer-templates")).filter((t) => t.active && t.kind === "RETAINER") });
  const reps = useQuery({ enabled: open, queryKey: ["fo", "retainer-representatives"], queryFn: async () => Representatives.parse(await staffApi("/front-office/retainer-representatives")) });
  React.useEffect(() => { const only = templates.data?.length === 1 ? templates.data[0].id : ""; if (only) setTemplateId((t) => t || only); }, [templates.data]);
  React.useEffect(() => { if (reps.data?.some((r) => r.staffId === me.staffId)) setRepId((r) => r || me.staffId); }, [reps.data, me.staffId]);
  const prepare = useMutation({
    mutationFn: async () => Retainer.parse(await staffApi(`/front-office/prospects/${prospectId}/retainers`, { method: "POST", json: { templateId, representativeStaffId: repId, ...(recordId ? { consultRecordId: recordId } : {}) } })),
    onSuccess: (r) => nav(`/front-office/retainers/${r.id}`, { state: { warnings: r.warnings ?? [] } }),   // FO-5cr review m2: the draft's notices stay on its page
    onError: (e) => {
      const field = e instanceof StaffApiError ? (["templateId", "representativeStaffId"].find((f) => e.field(f)) ?? null) : null;
      setError({ field, text: e instanceof StaffApiError ? (field ? e.field(field)! : e.message) : "Could not prepare the retainer. Please try again." });
    },
  });
  const latest = rows.data?.find((r) => r.kind === "RETAINER") ?? null;
  const live = latest && !CLOSED.includes(latest.status) ? latest : null;
  const s = live ? STATUS[live.status] : null;
  const mayPrepare = !live && working && can(me, R_KEY.draft) && can(me, R_KEY.list);
  React.useEffect(() => {
    if (!asked || (can(me, R_KEY.list) && rows.isPending)) return;
    setParams((x) => { x.delete("consultRecord"); return x; }, { replace: true, state: here.state });
    if (mayPrepare) { setRecordId(asked); setOpen(true); setError(null); }
    // Never a silent dead end: say why the panel did not open.
    else toast.push({ tone: "info", text: live ? "This prospect already has a retainer: open it to add the consultation's fee." : "Preparing a retainer needs an open prospect and a role that drafts retainers." });
  }, [asked, rows.isPending]);   // eslint-disable-line react-hooks/exhaustive-deps -- once, when the retainers have loaded
  if (!can(me, R_KEY.list)) return null;
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!templateId) return setError({ field: "templateId", text: "Choose the template." });
    if (!repId) return setError({ field: "representativeStaffId", text: "Choose the representative." });
    setError(null); prepare.mutate();
  };
  const noReps = reps.data?.length === 0, noTemplates = templates.data?.length === 0;
  return (
    <section aria-labelledby="fo-retainer" data-retainer-card className="rounded-xl border border-border bg-surface-raised p-4">
      <h2 id="fo-retainer" className="text-sm font-semibold">Retainer</h2>
      {rows.isPending ? <p className="mt-2 text-sm text-text-muted" data-loading>Loading the retainer…</p>
        : rows.isError ? <p className="mt-2 text-sm text-text-muted">{rows.error instanceof StaffApiError && rows.error.status === 404 ? "You cannot see this prospect's retainers." : "Could not load the retainer."}</p>
          : live && s ? (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <Pill tone={s.tone} title={s.tip}><span data-retainer-status>{s.label}</span></Pill>
              <span className="text-text-muted">Version {live.currentVersion}</span>
              {live.status === "SENT" || live.status === "VIEWED" ? <span data-waiting>Waiting for {name} to sign.</span> : null}
              {live.status === "DRAFT" && live.currentVersion > 1 && live.sentBefore ? <span data-not-sent className="text-text-warn">Version {live.currentVersion} is not sent yet: {name} cannot sign until it is.</span> : null}
              <Link to={`/front-office/retainers/${live.id}`} className="font-medium text-text-link hover:underline">{live.status === "DRAFT" && can(me, R_KEY.draft) ? "Continue the draft" : "Open the retainer"}</Link>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-text-muted" data-no-retainer>{latest ? `The last retainer was ${STATUS[latest.status].label.toLowerCase()}.` : "No retainer yet."}</span>
              {latest ? <Link to={`/front-office/retainers/${latest.id}`} className="text-text-link hover:underline">Open it</Link> : null}
              {mayPrepare ? <Button size="sm" onClick={() => { setRecordId(null); setOpen(true); setError(null); }}>Prepare retainer</Button> : null}
            </div>
          )}
      <Panel open={open} onOpenChange={setOpen} title="Prepare retainer" description={`For ${name}. The client's details and the firm's are filled in from the records; you check them before sending.`}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button busy={prepare.isPending} disabled={noReps || noTemplates} onClick={submit}>Prepare retainer</Button></>}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && !error.field ? <Notice tone="danger" title={error.text} /> : null}
          {noReps ? <Notice tone="warn" title="No active licensed consultant — add one." >A retainer names a licensed representative. Ask your firm's Owner or Admin to add one in Team.</Notice> : null}
          {noTemplates ? <Notice tone="warn" title="No active retainer template yet.">{can(me, "agent/retainer:configure-template") ? <Link to="/front-office/settings/retainer-templates" className="text-text-link hover:underline">Upload one in Settings › Retainer templates</Link> : "Ask your firm's Owner or Admin to upload the firm's retainer template."}</Notice> : null}
          <Field label="Template" error={error?.field === "templateId" ? error.text : null}>
            <Select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setError(null); }}>
              <option value="">{templates.isPending ? "Loading…" : "Choose a template"}</option>
              {(templates.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} (version {t.version})</option>)}
            </Select>
          </Field>
          <Field label="Representative" hint="Only active people with a licence and the case-manager permissions." error={error?.field === "representativeStaffId" ? error.text : null}>
            <Select value={repId} onChange={(e) => { setRepId(e.target.value); setError(null); }}>
              <option value="">{reps.isPending ? "Loading…" : "Choose the representative"}</option>
              {(reps.data ?? []).map((r) => <option key={r.staffId} value={r.staffId}>{r.name}</option>)}
            </Select>
          </Field>
          {recordId ? <p className="text-xs text-text-muted" data-from-consult>The first fee row is filled in from the consultation record (its recommended items and the quoted fee) when the record is this prospect's. You check it on the next page.</p>
            : <p className="text-xs text-text-muted">The first fee row is "Deposit on signing", with no amount yet: you add the amount on the next page.</p>}
        </form>
      </Panel>
    </section>
  );
}
