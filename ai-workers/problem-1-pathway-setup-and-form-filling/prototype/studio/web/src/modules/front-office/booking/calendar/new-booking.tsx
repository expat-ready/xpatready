// FO-3st1 part 1 (concept fo-3-booking r2 §4 "New booking", §5; BR-13; AG-4-63; J-S3): the New booking dialog and the
// time chooser it shares with Reschedule. Free times come from FO-3a's preview of the type; "Pick another time" takes a
// date and time in the office zone. FO-3sa's answer decides: a time the booking page would not offer comes back as
// "Book anyway?" with every reason; "Book anyway" sends those reasons back, "Cancel" saves nothing.
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Field, Input, Notice, Select } from "@/components/ui/controls";
import { useLeads } from "@/modules/front-office/sales/leads-page";
import { Lead } from "@/modules/front-office/sales/contract";
import { usePlatformStaff } from "@/modules/platform/frame";
import { problemOf } from "@/modules/front-office/sales/contract";
import { endSession, staffApi, StaffApiError, staffToken } from "@/modules/platform/session";
import { Assignees, BookingTypes, hhmm, longWhen, MODE_WORDS, Preview, TYPES_KEY, wallToIso, Warnings } from "./contract";

type Warn = { code: string; label: string };
class NeedsAnyway extends Error { constructor(readonly warnings: Warn[]) { super("Book anyway?"); } }
/** A booking write that keeps FO-3sa's 409 answer whole (`staffApi`'s Problem keeps only the common fields): its
 *  warnings become "Book anyway?"; any other refusal is a StaffApiError, and a 401 ends the session as staffApi does. */
export async function bookingWrite(path: string, json: unknown): Promise<unknown> {
  const token = staffToken();
  const res = await fetch(`/api${path}`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(json) });
  const data: unknown = await res.json().catch(() => null);
  if (res.ok) return data;
  const w = Warnings.safeParse(data);
  if (res.status === 409 && w.success) throw new NeedsAnyway(w.data.warnings);
  if (res.status === 401 && staffToken() === token) endSession(problemOf(data, 401).code ?? "NOT_SIGNED_IN");
  throw new StaffApiError(res.status, problemOf(data, res.status));
}
/** One write with FO-3sa's "Book anyway?" step: the first answer's warnings are shown; Book anyway resends with them. */
export function useBookAnyway(send: (extra: { bookAnyway?: boolean; acceptedWarnings?: string[] }) => Promise<unknown>, done: () => void) {
  const qc = useQueryClient();
  const [warnings, setWarnings] = React.useState<Warn[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const go = async (anyway: boolean) => {
    setBusy(true); setError(null);
    try {
      await send(anyway && warnings ? { bookAnyway: true, acceptedWarnings: [...new Set(warnings.map((w) => w.code))] } : {});
      setWarnings(null);
      await qc.invalidateQueries({ queryKey: ["fo", "bookings"] });
      done();
    } catch (e) {
      if (e instanceof NeedsAnyway) setWarnings(e.warnings);
      else setError(e instanceof StaffApiError && e.status === 403 ? "You do not have permission to do this. Ask an Owner or Admin." : e instanceof Error ? e.message : "Not saved. Please try again.");
    } finally { setBusy(false); }
  };
  const ask = warnings ? (
    <div role="alertdialog" aria-labelledby="fo-anyway" className="mt-3 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm" data-book-anyway>
      <h3 id="fo-anyway" className="font-semibold">Book anyway?</h3>
      <ul className="my-2 list-disc pl-5">{warnings.map((w, i) => <li key={i}>{w.label}</li>)}</ul>
      <div className="flex gap-2"><Button size="sm" busy={busy} onClick={() => void go(true)}>Book anyway</Button><Button size="sm" variant="outline" onClick={() => setWarnings(null)}>Cancel</Button></div>
    </div>
  ) : null;
  return { go, ask, error, busy, asking: !!warnings };
}

/** Free times for a type (FO-3a's preview, next 14 days) or, by "Pick another time", a date and time in the zone. */
export function TimeChooser({ typeId, zone, value, onChange }: { typeId: string; zone: string; value: string | null; onChange: (iso: string | null) => void }) {
  const me = usePlatformStaff();
  const can = me.keys.includes(TYPES_KEY) && !!typeId;
  const [from] = React.useState(() => new Date().toISOString());
  const to = new Date(Date.parse(from) + 14 * 86_400_000).toISOString();
  const pv = useQuery({ enabled: can, queryKey: ["fo", "bookings", "preview", typeId, zone, from], queryFn: async () => Preview.parse(await staffApi(`/front-office/booking-types/${typeId}/preview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&tz=${encodeURIComponent(zone)}`)) });
  const [other, setOther] = React.useState(!can);
  const [d, setD] = React.useState(""), [t, setT] = React.useState("");
  React.useEffect(() => { if (other) onChange(d && t ? wallToIso(d, t, zone) : null); }, [other, d, t, zone]);   // eslint-disable-line react-hooks/exhaustive-deps -- on the inputs only
  const slots = (pv.data?.days ?? []).flatMap((x) => x.slots).slice(0, 12);
  return (
    <fieldset className="flex flex-col gap-2" data-time-chooser>
      <legend className="text-xs font-medium">Free times</legend>
      {!other ? (
        pv.isPending ? <p role="status" className="text-sm text-text-muted">Loading free times…</p>
          : !slots.length ? <p className="text-sm text-text-muted">No free times in the next 14 days.</p>
            : <div className="flex flex-wrap gap-1">{slots.map((s) => <Button key={s.startsAt} type="button" size="sm" variant={value === s.startsAt ? "default" : "outline"} aria-pressed={value === s.startsAt} onClick={() => onChange(s.startsAt)} data-slot={s.startsAt}>{longWhen(s.startsAt, zone)}</Button>)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Date"><Input type="date" value={d} onChange={(e) => setD(e.target.value)} data-other-date /></Field>
          <Field label="Time"><Input type="time" value={t} onChange={(e) => setT(e.target.value)} data-other-time /></Field>
        </div>
      )}
      {can ? <Button type="button" variant="link" size="sm" className="self-start" onClick={() => { setOther(!other); onChange(null); }} data-pick-other>{other ? "Show free times" : "Pick another time"}</Button> : null}
    </fieldset>
  );
}

export function NewBookingDialog({ zone, onClose }: { zone: string; onClose: () => void }) {
  const leads = useLeads("all");
  const types = useQuery({ queryKey: ["fo", "bookings", "types"], queryFn: async () => BookingTypes.parse(await staffApi("/front-office/booking-types")).types.filter((t) => t.active) });
  // Host names, for people who may assign (FO-3sa's host choice); anyone else books by the pick rule.
  const staff = useQuery({ queryKey: ["fo", "bookings", "assignees"], retry: false, queryFn: async () => Assignees.parse(await staffApi("/front-office/leads/assignees")).assignees });
  const [leadId, setLeadId] = React.useState(""), [find, setFind] = React.useState("");
  const lead = useQuery({ enabled: !!leadId, queryKey: ["fo", "leads", leadId], queryFn: async () => Lead.parse(await staffApi(`/front-office/leads/${leadId}`)) });
  const [typeId, setTypeId] = React.useState(""), [mode, setMode] = React.useState(""), [hostId, setHostId] = React.useState(""), [at, setAt] = React.useState<string | null>(null);
  const type = types.data?.find((x) => x.id === typeId) ?? types.data?.[0];
  React.useEffect(() => { if (type && !typeId) setTypeId(type.id); if (type && !type.modes.includes(mode)) setMode(type.modes[0] ?? ""); }, [type, typeId, mode]);
  const hosts = (staff.data ?? []).filter((s) => type?.hostStaffIds.includes(s.staffId));
  const needle = find.trim().toLowerCase();
  const found = (leads.data ?? []).filter((l) => !needle || l.name.toLowerCase().includes(needle) || l.number.toLowerCase().includes(needle)).slice(0, 20);
  const person = lead.data?.person;
  const name = person ? [person.givenNames, person.familyName].filter(Boolean).join(" ") : "";
  const write = useBookAnyway((extra) => bookingWrite("/front-office/bookings", { typeId: type!.id, personId: person!.id, mode, startsAt: at, timeZone: zone, ...(hostId ? { hostStaffId: hostId } : {}), ...extra }), onClose);
  const ready = !!person && !!type && !!mode && !!at && !!zone;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title="New booking" guard
      footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button disabled={!ready || write.asking} busy={write.busy && !write.asking} onClick={() => void write.go(false)} data-book>Book</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="Person" hint="Search by name, email or phone">
          <Input type="search" value={find} onChange={(e) => setFind(e.target.value)} data-person-find />
        </Field>
        {leads.isPending ? <p role="status" className="text-sm text-text-muted">Loading people…</p>
          : !found.length ? <p className="text-sm text-text-muted">No person found. Add them as a lead first.</p>
            : <Select aria-label="Choose the person" value={leadId} onChange={(e) => setLeadId(e.target.value)} data-person><option value="">Choose…</option>{found.map((l) => <option key={l.id} value={l.id}>{l.name} (lead {l.number})</option>)}</Select>}
        <Field label="Booking type"><Select value={type?.id ?? ""} onChange={(e) => { setTypeId(e.target.value); setAt(null); }} data-type>{(types.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        {hosts.length ? <Field label="Host"><Select value={hostId} onChange={(e) => setHostId(e.target.value)} data-host><option value="">The first free host</option>{hosts.map((h) => <option key={h.staffId} value={h.staffId}>{h.displayName}</option>)}</Select></Field> : null}
        <Field label="Way to meet"><Select value={mode} onChange={(e) => setMode(e.target.value)} data-mode>{(type?.modes ?? []).map((m) => <option key={m} value={m}>{MODE_WORDS[m] ?? m}</option>)}</Select></Field>
        <p className="text-sm text-text-muted" data-times-zone>Times for {name || "the person"} in {zone}</p>
        {type ? <TimeChooser key={type.id} typeId={type.id} zone={zone} value={at} onChange={setAt} /> : null}
        {at ? <p className="text-sm">Chosen: <b>{longWhen(at, zone)}–{hhmm(new Date(Date.parse(at) + (type?.minutes ?? 0) * 60_000).toISOString(), zone)}</b></p> : null}
        {person && !person.email ? <p className="text-sm text-text-muted">No email: {name} will get no confirmation.</p> : null}
        {write.ask}
        {write.error ? <Notice tone="danger" title="Not booked">{write.error}</Notice> : null}
      </div>
    </Dialog>
  );
}
