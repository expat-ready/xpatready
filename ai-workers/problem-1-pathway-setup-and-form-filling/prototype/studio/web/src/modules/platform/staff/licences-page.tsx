// PF-6 part 2b (concept pf-6-staff r2 §4 "Licences"; BR-8; AG-1-30, -31): everyone's licence records, for
// agent/firm-credential:manage (GET /api/platform/licences, the number shown in full there only). Change one, or add one
// for a person without, in a right panel (PUT /api/platform/staff/:id/credential). People without a record come from the
// Team list when the person may read it. The toast never holds the number; refusals show the server's words.
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button, Notice, Panel, Table } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { PlatformFrame } from "../frame";
import { staffApi, StaffApiError, useStaffToken } from "../session";
import { Licence, LicenceConflict, LicenceForm, sameLicence } from "../account/licence-form";
import { StaffList, STATUS_WORDS } from "./contract";

const Row = Licence.extend({ staffId: z.string(), displayName: z.string(), status: z.string() });
type Row = z.infer<typeof Row>;
const List = z.object({ licences: z.array(Row) });
type Editing = { staffId: string; name: string; start: Row | null };

function Body() {
  const token = useStaffToken(), qc = useQueryClient(), toast = useToast();
  const q = useQuery({ queryKey: ["pf", "licences", token], enabled: !!token, retry: false, queryFn: async () => List.parse(await staffApi("/platform/licences")).licences });
  // The Team list names the people with no record yet; without agent/staff:manage it is refused and only records show.
  const staff = useQuery({ queryKey: ["pf", "staff", "list", token], enabled: q.isSuccess, retry: false, queryFn: async () => StaffList.parse(await staffApi("/platform/staff")) });
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const opener = React.useRef<HTMLElement | null>(null), heading = React.useRef<HTMLHeadingElement>(null);
  const dirty = React.useRef(false), saved = React.useRef<string | null>(null);
  /** Typed changes are not dropped without asking (break m6, review m3). */
  const close = () => { if (!dirty.current || window.confirm("Discard the licence you typed?")) { dirty.current = false; setEditing(null); } };
  /** Focus after the panel: the saved person's Change button (an added row's Add button is gone), else the opener, else the heading (review MJ-2). */
  const back = () => (saved.current ? document.querySelector<HTMLElement>(`[data-licence-row="${saved.current}"] [data-licence-change]`) : null) ?? (opener.current?.isConnected ? opener.current : heading.current);
  if (q.isError) return <Notice tone="danger" title="Not available"><span data-licences-refused>{q.error instanceof StaffApiError ? q.error.message : "Could not load the licences. Please try again."}</span></Notice>;
  if (!q.data) return <p role="status" className="text-sm text-text-muted" data-loading>Loading the licences…</p>;
  const have = new Set(q.data.map((r) => r.staffId));
  const without = (staff.data?.staff ?? []).filter((s) => s.status !== "DEACTIVATED" && !have.has(s.id));
  const open = (e: Editing) => (ev: React.MouseEvent<HTMLElement>) => { opener.current = ev.currentTarget; saved.current = null; dirty.current = false; setEditing(e); };
  const save = async (l: unknown) => {
    if (!editing) return;
    // Review MJ-1 / break M1: read again just before the PUT; changed since the panel opened → save nothing, show it as it is.
    const fresh = List.parse(await staffApi("/platform/licences")).licences.find((r) => r.staffId === editing.staffId) ?? null;
    if (!sameLicence(fresh, editing.start)) { void qc.invalidateQueries({ queryKey: ["pf", "licences"] }); setEditing({ ...editing, start: fresh }); throw new LicenceConflict(fresh); }
    const answer = z.object({ warning: z.string().optional() }).passthrough().parse(await staffApi(`/platform/staff/${editing.staffId}/credential`, { method: "PUT", json: l }));
    await qc.invalidateQueries({ queryKey: ["pf", "licences"] });
    toast.push({ tone: "ok", text: `The licence record for ${editing.name} was saved.` });
    saved.current = editing.staffId; dirty.current = false;
    // PF-4c part 2 (AG-1-34): saved with a soft warning → the panel stays open so the warning shows on the number field.
    if (answer.warning) { setEditing({ ...editing, start: { ...(editing.start ?? { staffId: editing.staffId, displayName: editing.name, status: "ACTIVE" }), ...(l as Licence) } }); return { warning: answer.warning }; }
    setEditing(null);
  };
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div><h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">Licences</h1>
        <p className="mt-1 text-sm text-text-muted">One licence record per person. Checked against the usual format only. We never verify licences.</p></div>
      {!q.data.length ? <p data-empty className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">No licence recorded yet.</p> : (
        <Table label="Licences" head={["Name", "Status", "Representative type", "Licensing body", "Licence number", ""]}>
          {q.data.map((r) => <tr key={r.staffId} data-licence-row={r.staffId}>
            <td className="font-medium [overflow-wrap:anywhere]">{r.displayName}</td><td>{STATUS_WORDS[r.status] ?? r.status}</td>
            <td>{r.representativeType}</td><td className="[overflow-wrap:anywhere]">{r.licensingBody}</td><td className="[overflow-wrap:anywhere]" data-licence-number-cell>{r.licenceNumber}</td>
            <td><Button variant="outline" size="sm" aria-label={`Change the licence of ${r.displayName}`} onClick={open({ staffId: r.staffId, name: r.displayName, start: r })} data-licence-change>Change</Button></td>
          </tr>)}
        </Table>
      )}
      {without.length ? <section aria-labelledby="no-licence"><h2 id="no-licence" className="mb-2 text-base font-semibold">No licence recorded</h2>
        <ul className="flex flex-col gap-2">{without.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2" data-no-licence={s.id}>
          <span className="text-sm [overflow-wrap:anywhere]">{s.displayName}</span>
          <Button variant="outline" size="sm" aria-label={`Add licence for ${s.displayName}`} onClick={open({ staffId: s.id, name: s.displayName, start: null })} data-licence-add>Add licence</Button></li>)}</ul></section> : null}
      <Panel open={!!editing} onOpenChange={(o) => { if (!o) { dirty.current = false; setEditing(null); } }} title={editing ? `Licence: ${editing.name}` : "Licence"} returnFocus={back}
        confirmClose={() => !dirty.current || window.confirm("Discard the licence you typed?")}>
        {editing ? <LicenceForm key={editing.staffId} start={editing.start} save={save} onCancel={close} onDirty={(d) => { dirty.current = d; }} /> : null}
      </Panel>
    </div>
  );
}

export function LicencesPage() {
  return <PlatformFrame crumbs={[{ label: "Licences" }]}><Body /></PlatformFrame>;
}
