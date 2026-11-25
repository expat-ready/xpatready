// FO-3st2 (brief lead-b-briefs/FO-3st2.md; concept screens/fo-3-booking r2 BR-17, §4 "My account → Availability", §5,
// §6 J-A1..J-A5; AG-4-62 rules 1-8): My account → Availability inside PF-6's PlatformFrame. The set list on the left,
// the week editor (Monday first) on the right with its zone line, and Time off below. An Owner or Admin (holding
// agent/booking-event-type:configure-availability) picks a colleague under "Viewing" (?staff=<id>); nobody else sees it.
// Every rule is FO-3a part 1b's on the server; its refusals show on the field. Nothing here moves a booking (rule 7).
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Field, Input, Notice, Select } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PlatformFrame, usePlatformStaff } from "@/modules/platform/frame";
import { staffApi, StaffApiError, useStaffToken } from "@/modules/platform/session";
import { StaffList } from "@/modules/platform/staff/contract";
import { allZones } from "../../booking-public/time";
import { base, CONFIGURE, HourSet, HourSets, nextDay, offWords, TimeOffList, wallIso, WEEK, type HourSet as Set } from "./contract";

const NO_HOURS = "You offer no times on the booking page. Staff can still book you, with a warning.";
const NOT_MOVED = "Existing bookings are not moved.";
const why = (e: unknown) => (e instanceof StaffApiError ? e.message : "Something went wrong. Please try again.");
type Row = { key: number; start: string; end: string };
type Draft = Record<number, Row[]>;
let keys = 0;
/** Break M1: the week editor's unsaved edits. Leaving them (another set, Make default, another colleague, a reload)
 *  asks first, in the house Dialog guard's words. */
const unsaved = { current: false };
const DISCARD = "Discard your unsaved changes?";
const mayLeave = () => !unsaved.current || window.confirm(DISCARD);
/** Break M3: the place the keyboard goes once the next answer is drawn ("heading": the set's title). */
const focusNext = { current: null as null | "heading" };
/** "Add hours": 09:00-17:00 on an empty day, else the hour after the day's last window (an editable starting value). */
function nextWindow(rows: Row[]): { start: string; end: string } {
  const last = rows.at(-1)?.end;
  if (!last || last >= "23:00") return { start: "09:00", end: "17:00" };
  return { start: last, end: `${String(Number(last.slice(0, 2)) + 1).padStart(2, "0")}:${last.slice(3)}` };
}
const draftOf = (s: Set): Draft => Object.fromEntries(WEEK.map(({ day }) => [day, s.windows.filter((w) => w.weekday === day).map((w) => ({ key: ++keys, start: w.start, end: w.end }))]));

function Loading({ what }: { what: string }) {
  return (
    <div role="status" aria-label={what} data-loading className="grid gap-3">
      <span className="sr-only">{what}</span>
      <Skeleton className="h-8 w-48" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" />
    </div>
  );
}

/** "Viewing": only for an Owner or Admin; active colleagues from the Team list (PF-6 part 2a's GET /platform/staff). */
function Viewing({ staffId, onChange }: { staffId: string | null; onChange: (id: string | null) => void }) {
  const me = usePlatformStaff(), token = useStaffToken();
  const list = useQuery({ queryKey: ["pf", "staff", "list", token], enabled: !!token, retry: false, queryFn: async () => StaffList.parse(await staffApi("/platform/staff")) });
  const people = (list.data?.staff ?? []).filter((s) => s.status === "ACTIVE" && s.id !== me.staffId).sort((a, b) => a.displayName.localeCompare(b.displayName));
  return (
    <div className="w-full sm:w-72" data-viewing>
      <Field label="Viewing" hint={list.isError ? why(list.error) : "Choose a colleague to set their hours and time off."}>
        <Select value={staffId ?? ""} onChange={(e) => { if (mayLeave()) { unsaved.current = false; onChange(e.target.value || null); } else e.target.value = staffId ?? ""; }} title="Choose a colleague">
          <option value="">{me.displayName} (you)</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
          {staffId && !people.some((p) => p.id === staffId) ? <option value={staffId}>Another colleague</option> : null}
        </Select>
      </Field>
    </div>
  );
}

function SetList({ sets, chosen, onChoose, onAdd }: { sets: Set[]; chosen: string; onChoose: (id: string) => void; onAdd: () => void }) {
  return (
    <nav aria-label="Sets of hours" className="flex flex-col gap-1 md:w-56 md:shrink-0" data-set-list>
      <ul className="flex flex-col gap-1">
        {sets.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => { if (s.id !== chosen && mayLeave()) { unsaved.current = false; onChoose(s.id); } }} aria-current={s.id === chosen ? "true" : undefined} data-set={s.name}
              className={cn("flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", s.id === chosen ? "bg-primary/10 font-medium text-text-link" : "hover:bg-text/5")}>
              <span className="min-w-0 [overflow-wrap:anywhere]">{s.name}</span>
              {s.isDefault ? <span className="rounded-full border border-border px-2 text-xs text-text" data-default>Default</span> : null}
            </button>
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" className="mt-2 self-start" onClick={onAdd}>Add a set</Button>
    </nav>
  );
}

function AddSet({ open, onOpenChange, path, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; path: string; onAdded: (s: Set) => void }) {
  const [name, setName] = React.useState(""), [busy, setBusy] = React.useState(false), [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => { if (open) { setName(""); setErr(null); } }, [open]);
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { onAdded(HourSet.parse(await staffApi(`${path}/availability-sets`, { method: "POST", json: { name } }))); onOpenChange(false); }
    catch (x) { setErr(x instanceof StaffApiError ? x.field("name") ?? x.message : why(x)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add a set" description="A new set starts with no hours, in your office's zone.">
      <form id="fo3st2-add-set" onSubmit={add} className="flex flex-col gap-3">
        <Field label="Set name" error={err}><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} /></Field>
        <div className="flex gap-2"><Button type="submit" busy={busy}>Add a set</Button><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button></div>
      </form>
    </Dialog>
  );
}

function WeekEditor({ set, path, onSaved, onDeleted, reload }: { set: Set; path: string; onSaved: (s: Set) => void; onDeleted: () => void; reload: () => void }) {
  const [draft, setDraft] = React.useState<Draft>(() => draftOf(set));
  const [zone, setZone] = React.useState(set.timeZone), [zoning, setZoning] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({}), [problem, setProblem] = React.useState<{ text: string; stale: boolean } | null>(null);
  const [saved, setSaved] = React.useState(false), [busy, setBusy] = React.useState<"save" | "default" | "delete" | null>(null), [confirm, setConfirm] = React.useState(false);
  const sent = React.useRef<{ day: number; key: number }[]>([]);
  // A busy button is disabled, which drops the keyboard's place: focus comes back here after each answer.
  const saveButton = React.useRef<HTMLButtonElement>(null), heading = React.useRef<HTMLHeadingElement>(null);
  const was = React.useRef(busy);
  React.useEffect(() => {   // once the button is enabled again (after the commit), never while it is still disabled
    if (busy === null && was.current === "save") saveButton.current?.focus();
    if (busy === null && was.current === "default") heading.current?.focus();
    was.current = busy;
  }, [busy]);
  React.useEffect(() => {
    setDraft(draftOf(set)); setZone(set.timeZone); setErrors({}); setProblem(null); setZoning(false);
    if (focusNext.current === "heading") { focusNext.current = null; heading.current?.focus(); }
  }, [set.id, set.version]);   // eslint-disable-line react-hooks/exhaustive-deps -- a new answer resets the editor
  const flat = (d: Draft) => JSON.stringify(WEEK.map(({ day }) => (d[day] ?? []).map((r) => [r.start, r.end])));
  const dirty = flat(draft) !== flat(draftOf(set)) || zone.trim() !== set.timeZone;
  React.useEffect(() => { unsaved.current = dirty; }, [dirty]);
  React.useEffect(() => () => { unsaved.current = false; }, []);
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  // The browser lists some zones by their old names (Asia/Calcutta): the current spellings are offered too (break m6).
  const zones = React.useMemo(() => [...new globalThis.Set([...allZones(), "Asia/Kolkata", "Asia/Kathmandu", "Asia/Ho_Chi_Minh", "Europe/Kyiv", "America/Nuuk"])].sort(), []);
  const edit = (day: number, f: (rows: Row[]) => Row[]) => { setDraft((d) => ({ ...d, [day]: f(d[day] ?? []) })); setSaved(false); };
  const refused = (x: unknown) => {
    if (x instanceof StaffApiError) { setErrors(x.problem.fields ?? {}); setProblem({ text: x.message, stale: (x.status === 409 && x.problem.code === "STALE_VERSION") || x.status === 404 }); }
    else setProblem({ text: why(x), stale: false });
  };
  const save = async () => {
    setBusy("save"); setErrors({}); setProblem(null); setSaved(false);
    const list = WEEK.flatMap(({ day }) => (draft[day] ?? []).map((r) => ({ day, key: r.key, w: { weekday: day, start: r.start, end: r.end } })));
    sent.current = list.map(({ day, key }) => ({ day, key }));
    const z = zone.trim();   // as typed: the browser's Intl would turn Asia/Kolkata into Asia/Calcutta; the server checks the name
    try { onSaved(HourSet.parse(await staffApi(`${path}/availability-sets/${set.id}`, { method: "PATCH", json: { windows: list.map((x) => x.w), timeZone: z, version: set.version } }))); setSaved(true); }
    catch (x) { refused(x); } finally { setBusy(null); }
  };
  const makeDefault = async () => {
    if (!mayLeave()) return;
    setBusy("default"); setProblem(null);
    try { onSaved(HourSet.parse(await staffApi(`${path}/availability-sets/${set.id}`, { method: "PATCH", json: { isDefault: true, version: set.version } }))); }
    catch (x) { refused(x); } finally { setBusy(null); }
  };
  const remove = async () => {
    setBusy("delete");
    try { await staffApi(`${path}/availability-sets/${set.id}`, { method: "DELETE" }); unsaved.current = false; focusNext.current = "heading"; setConfirm(false); onDeleted(); }
    catch (x) { setConfirm(false); refused(x); } finally { setBusy(null); }
  };
  /** The server's field error for a row: `windows.<i>.end` ("End must be after start.") or `windows.<i>` ("These hours overlap."). */
  const errorOf = (key: number) => { const i = sent.current.findIndex((s) => s.key === key); return i < 0 ? null : errors[`windows.${i}.end`] ?? errors[`windows.${i}`] ?? errors[`windows.${i}.start`] ?? null; };
  const zoneError = errors.timeZone ?? null;
  return (
    <section aria-labelledby="fo3st2-set" className="min-w-0 flex-1" data-week-editor>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="fo3st2-set" ref={heading} tabIndex={-1} className="text-base font-semibold outline-none [overflow-wrap:anywhere]">{set.name}</h2>
        <div className="flex flex-wrap gap-2">
          {set.isDefault ? null : <Button variant="outline" size="sm" busy={busy === "default"} onClick={() => void makeDefault()}>Make default</Button>}
          {set.isDefault ? null : <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>Delete set</Button>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span data-zone-line title="Every time in this set is read in this zone.">Times in {set.timeZone}</span>
        {zoning ? null : <Button variant="link" size="sm" onClick={() => setZoning(true)}>Change zone</Button>}
      </div>
      {zoning ? (
        <div className="mt-2 max-w-xs">
          <Field label="Time zone" hint="For example America/Toronto or Asia/Kolkata. It saves with the hours." error={zoneError}>
            <Input value={zone} list="fo3st2-zones" onChange={(e) => { setZone(e.target.value); setSaved(false); }} autoComplete="off" />
          </Field>
          <datalist id="fo3st2-zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
          <Button variant="link" size="sm" className="mt-1 px-0" onClick={() => { setZone(set.timeZone); setZoning(false); setErrors(({ timeZone: _, ...rest }) => rest); }}>Keep {set.timeZone}</Button>
        </div>
      ) : zoneError ? <p role="alert" className="mt-1 text-xs text-text-danger">{zoneError}</p> : null}
      <ul className="mt-3 divide-y divide-border rounded-lg border border-border" aria-label={`Weekly hours of ${set.name}`}>
        {WEEK.map(({ day, name }) => {
          const rows = draft[day] ?? [];
          return (
            <li key={day} className="grid gap-2 px-3 py-3 sm:grid-cols-[8rem_1fr]" data-day={name}>
              <span className="pt-1.5 text-sm font-medium">{name}</span>
              <div className="flex flex-col gap-2">
                {rows.length === 0 ? <span className="pt-1.5 text-sm text-text-muted">Unavailable</span> : null}
                {rows.map((r, i) => {
                  const err = errorOf(r.key);
                  return (
                    <div key={r.key} data-window>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input type="time" aria-label={`${name} hours ${i + 1}: start`} className="w-32" value={r.start} aria-invalid={err ? true : undefined}
                          onChange={(e) => edit(day, (rs) => rs.map((x) => (x.key === r.key ? { ...x, start: e.target.value } : x)))} />
                        <span aria-hidden>–</span>
                        <Input type="time" aria-label={`${name} hours ${i + 1}: end`} className="w-32" value={r.end} aria-invalid={err ? true : undefined} aria-describedby={err ? `fo3st2-err-${r.key}` : undefined}
                          onChange={(e) => edit(day, (rs) => rs.map((x) => (x.key === r.key ? { ...x, end: e.target.value } : x)))} />
                        <Button variant="ghost" size="sm" aria-label={`Remove hours: ${name} ${i + 1}`} onClick={(e) => { const li = e.currentTarget.closest("li"); edit(day, (rs) => rs.filter((x) => x.key !== r.key)); requestAnimationFrame(() => li?.querySelector<HTMLElement>("[data-add-hours]")?.focus()); }}>Remove hours</Button>
                      </div>
                      {err ? <p id={`fo3st2-err-${r.key}`} role="alert" className="mt-1 text-xs text-text-danger" data-field-error>{err}</p> : null}
                    </div>
                  );
                })}
                <Button variant="outline" size="sm" className="self-start" data-add-hours aria-label={`Add hours: ${name}`}
                  onClick={() => edit(day, (rs) => [...rs, { key: ++keys, ...nextWindow(rs) }])}>Add hours</Button>
              </div>
            </li>
          );
        })}
      </ul>
      {problem && !Object.keys(errors).some((k) => /^windows\.\d+/.test(k) || k === "timeZone") ? (
        <Notice tone="danger" className="mt-3" title="Not saved" action={problem.stale ? <Button size="sm" variant="outline" onClick={() => { unsaved.current = false; reload(); }}>Reload (your edits here are dropped)</Button> : undefined}>{errors.windows ?? problem.text}</Notice>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button ref={saveButton} busy={busy === "save"} onClick={() => void save()}>Save hours</Button>
        <p role="status" className="text-sm text-text-muted" data-saved>{saved ? <>Saved. {NOT_MOVED}</> : NOT_MOVED}</p>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm} title="Delete set" description={`Delete ${set.name}? Types that use it switch to your default set.`}
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Keep</Button><Button variant="destructive" busy={busy === "delete"} onClick={() => void remove()}>Delete</Button></>}>
        <p className="text-sm">{NOT_MOVED}</p>
      </Dialog>
    </section>
  );
}

function Hours({ path, staffId }: { path: string; staffId: string | null }) {
  const token = useStaffToken(), qc = useQueryClient();
  const key = ["fo", "availability", "sets", staffId ?? "me", token];
  const q = useQuery({ queryKey: key, enabled: !!token, retry: false, queryFn: async () => HourSets.parse(await staffApi(`${path}/availability-sets`)) });
  const [chosen, setChosen] = React.useState<string | null>(null), [adding, setAdding] = React.useState(false);
  React.useEffect(() => { setChosen(null); }, [staffId]);
  if (q.isError) return <Notice tone="danger" title="Could not load the hours">{why(q.error)}</Notice>;
  if (!q.data) return <Loading what="Loading hours…" />;
  const sets = q.data.sets, def = sets.find((s) => s.isDefault) ?? sets[0];
  const set = sets.find((s) => s.id === chosen) ?? def;
  const refresh = () => qc.invalidateQueries({ queryKey: ["fo", "availability"] });
  return (
    <>
      {def && def.windows.length === 0 ? <Notice tone="warn" className="mb-3" title="No hours">{NO_HOURS}</Notice> : null}
      <div className="flex flex-col gap-4 md:flex-row">
        <SetList sets={sets} chosen={set?.id ?? ""} onChoose={setChosen} onAdd={() => { if (mayLeave()) setAdding(true); }} />
        {set ? <WeekEditor set={set} path={path} reload={() => void refresh()} onSaved={(s) => { unsaved.current = false; setChosen(s.id); void refresh(); }} onDeleted={() => { setChosen(null); void refresh(); }} /> : null}
      </div>
      <AddSet open={adding} onOpenChange={setAdding} path={path} onAdded={(s) => { unsaved.current = false; focusNext.current = "heading"; setChosen(s.id); void refresh(); }} />
      <TimeOffSection path={path} staffId={staffId} zone={def?.timeZone ?? "UTC"} />
    </>
  );
}

function TimeOffSection({ path, staffId, zone }: { path: string; staffId: string | null; zone: string }) {
  const token = useStaffToken(), qc = useQueryClient();
  const q = useQuery({ queryKey: ["fo", "availability", "time-off", staffId ?? "me", token], enabled: !!token, retry: false, queryFn: async () => TimeOffList.parse(await staffApi(`${path}/time-off`)) });
  const [open, setOpen] = React.useState(false), [whole, setWhole] = React.useState(true);
  const [from, setFrom] = React.useState(""), [to, setTo] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({}), [problem, setProblem] = React.useState<string | null>(null), [busy, setBusy] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const addButton = React.useRef<HTMLButtonElement>(null);
  const reset = () => { setFrom(""); setTo(""); setWhole(true); setErrors({}); setProblem(null); };
  const [rowProblem, setRowProblem] = React.useState<string | null>(null);
  // Break M3: when the form closes (saved or cancelled) or a row goes, the keyboard goes back to "Add time off".
  const [backTo, setBackTo] = React.useState(0);
  const back = () => setBackTo((n) => n + 1);
  React.useEffect(() => { if (backTo) addButton.current?.focus(); }, [backTo]);   // after the commit that shows the button again
  const refresh = () => qc.invalidateQueries({ queryKey: ["fo", "availability", "time-off"] });
  const instant = (v: string, end: boolean) => {
    if (!v) return v;
    if (whole) return wallIso(end ? nextDay(v) : v, 0, zone);   // a whole day: midnight to midnight in the zone; "To" is the last day off
    const [d, t] = v.split("T"); const [h, m] = (t ?? "00:00").split(":").map(Number); return wallIso(d, h * 60 + m, zone);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy("save"); setErrors({}); setProblem(null); setDone(null);
    try {
      await staffApi(`${path}/time-off`, { method: "POST", json: { startsAt: instant(from, false), endsAt: instant(to || (whole ? from : ""), true) } });
      setOpen(false); reset(); setDone(`Time off saved. ${NOT_MOVED}`); void refresh(); back();
    } catch (x) { if (x instanceof StaffApiError && x.problem.fields) setErrors(x.problem.fields); setProblem(why(x)); } finally { setBusy(null); }
  };
  const remove = async (id: string) => {
    setBusy(id); setDone(null); setRowProblem(null);
    try { await staffApi(`${path}/time-off/${id}`, { method: "DELETE" }); setDone("Time off removed."); back(); }
    catch (x) { setRowProblem(why(x)); } finally { setBusy(null); void refresh(); }
  };
  const list = q.data?.timeOff;
  return (
    <section aria-labelledby="fo3st2-off" className="mt-8 border-t border-border pt-6" data-time-off>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="fo3st2-off" className="text-base font-semibold">Time off</h2>
        {open ? null : <Button ref={addButton} variant="outline" size="sm" onClick={() => { reset(); setOpen(true); }}>Add time off</Button>}
      </div>
      <p className="mt-1 text-sm text-text-muted">Times in {zone}. A booking inside time off stays; staff move it themselves.</p>
      {open ? (
        <form onSubmit={save} className="mt-3 flex max-w-md flex-col gap-3 rounded-lg border border-border p-4" aria-label="Add time off" data-time-off-form>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={whole} onChange={(e) => { setWhole(e.target.checked); setFrom(""); setTo(""); }} className="size-4" /> Whole day</label>
          <Field label="From" error={errors.startsAt ?? null}><Input type={whole ? "date" : "datetime-local"} value={from} onChange={(e) => setFrom(e.target.value)} required autoFocus /></Field>
          <Field label="To" hint={whole ? "The last day off. Leave it empty for one day." : undefined} error={errors.endsAt ?? null}><Input type={whole ? "date" : "datetime-local"} value={to} onChange={(e) => setTo(e.target.value)} required={!whole} /></Field>
          {problem && !errors.startsAt && !errors.endsAt ? <Notice tone="danger" title="Not saved">{problem}</Notice> : null}
          <div className="flex gap-2"><Button type="submit" busy={busy === "save"}>Save time off</Button><Button type="button" variant="ghost" onClick={() => { setOpen(false); reset(); back(); }}>Cancel</Button></div>
        </form>
      ) : null}
      <p role="status" className="mt-2 text-sm text-text-muted" data-time-off-status>{done ?? ""}</p>
      {rowProblem ? <Notice tone="danger" className="mt-2" title="Not removed">{rowProblem} The list shows what is saved now.</Notice> : null}
      {q.isError ? <Notice tone="danger" title="Could not load the time off">{why(q.error)}</Notice>
        : !list ? <Loading what="Loading time off…" />
          : list.length === 0 ? <p className="mt-2 text-sm text-text-muted" data-empty-time-off>No time off planned.</p>
            : (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {list.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-time-off-row>
                    <span>{offWords(o, zone)}</span>
                    <Button variant="ghost" size="sm" busy={busy === o.id} aria-label={`Remove time off: ${offWords(o, zone)}`} onClick={() => void remove(o.id)}>Remove</Button>
                  </li>
                ))}
              </ul>
            )}
    </section>
  );
}

function AvailabilityBody() {
  const me = usePlatformStaff();
  const [params, setParams] = useSearchParams();
  const may = me.keys.includes(CONFIGURE);
  const asked = params.get("staff");
  const staffId = may && asked && asked !== me.staffId ? asked : null;
  const choose = (id: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set("staff", id); else n.delete("staff"); return n; }, { replace: true });
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Availability</h1>
          <p className="mt-1 text-sm text-text-muted">The hours you take bookings. Each booking type uses one of your sets.</p>
        </div>
        {may ? <Viewing staffId={staffId} onChange={choose} /> : null}
      </div>
      <Hours key={staffId ?? "me"} path={base(staffId)} staffId={staffId} />
    </>
  );
}

export function AvailabilityPage() {
  return (
    <PlatformFrame crumbs={[{ label: "Availability" }]}>
      <AvailabilityBody />
    </PlatformFrame>
  );
}
