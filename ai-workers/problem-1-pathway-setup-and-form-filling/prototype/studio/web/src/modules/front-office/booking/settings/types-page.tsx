// FO-3st3 part 3a (concept screens/fo-3-booking r2 BR-19, §4 "Settings → Booking types", §5, §6 J-T1..J-T4; board
// design/settings.html §4; AG-4-8, AG-4-9 rules 1-7, AG-4-10): Settings → Booking types in the Bookings area. A Library
// list and a side panel (Definition · Hosts · Share · Preview). Edit with agent/booking-event-type:edit (Owner, Admin);
// the view key :list (Case Manager, Case Officer, Read-only) shows the same pages with values as text and no buttons;
// no :list, no menu entry and the refusal. Every rule is FO-3a part 1a's on the server; its refusals show on the field.
// FO-3st3b: the type's own timings under Advanced (type-timings.tsx); the firm's on Settings → Timings (timings-page.tsx).
import * as React from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Field, Input, Notice, Panel, Pill, Select, Table, Textarea } from "@/components/ui/controls";
import { Loading } from "@/modules/front-office/sales/loading";
import { PlatformFrame, usePlatformStaff } from "@/modules/platform/frame";
import { staffApi, StaffApiError, useStaffToken } from "@/modules/platform/session";
import { StaffList } from "@/modules/platform/staff/contract";
import { allZones, hhmm } from "../../booking-public/time";
import { nextDay, wallIso } from "../availability/contract";
import { BOOKINGS_AREA, TYPES_HOME } from "../area";
import { TypeTimingsSection } from "./type-timings";
import { caseType, CONFIGURE, dayWords, embedCode, HostSets, MODES, Preview, publicUrl, PURPOSES, STAFF_MANAGE, todayIn, TypeDetail, TypeList, TYPES_EDIT, TYPES_LIST, type BookingType } from "./contract";

const why = (e: unknown) => (e instanceof StaffApiError ? e.message : "Something went wrong. Please try again.");
const REFUSED = "You do not have permission to do this. Ask an Owner or Admin.";
type Draft = { name: string; description: string; slug: string; minutes: string; purpose: string; modes: string[]; hostStaffIds: string[]; active: boolean; showOnBookingPage: boolean; allowReschedule: boolean; allowCancel: boolean; requireAgreement: boolean | null };
const EMPTY: Draft = { name: "", description: "", slug: "", minutes: "30", purpose: "FREE_CONSULT", modes: ["VIDEO"], hostStaffIds: [], active: true, showOnBookingPage: true, allowReschedule: true, allowCancel: true, requireAgreement: null };
const draftOf = (t: BookingType): Draft => ({ name: t.name, description: t.description ?? "", slug: t.slug, minutes: String(t.minutes), purpose: t.purpose, modes: t.modes, hostStaffIds: t.hostStaffIds, active: t.active, showOnBookingPage: t.showOnBookingPage, allowReschedule: t.allowReschedule, allowCancel: t.allowCancel, requireAgreement: t.requireAgreementSet ? (t.requireAgreement ?? null) : null });
/** FO-3c part 2 (Lead 10, W4b): the choice, else the purpose's default (on for all but a follow-up; the server's gate.ts). */
const needsAgreement = (d: Draft) => d.requireAgreement ?? d.purpose !== "FOLLOW_UP";
const pageCell = (t: BookingType) => (caseType(t.purpose) ? "Never (case type)" : t.onBookingPage ? "Yes" : "No");

export function BookingTypesPage() {
  return <PlatformFrame area={BOOKINGS_AREA} crumbs={[{ label: "Booking types", to: TYPES_HOME }]}><Types /></PlatformFrame>;
}

function useStaffNames() {
  const me = usePlatformStaff(), token = useStaffToken(), may = me.keys.includes(STAFF_MANAGE);
  const q = useQuery({ queryKey: ["pf", "staff", "list", token], enabled: !!token && may, retry: false, queryFn: async () => StaffList.parse(await staffApi("/platform/staff")) });
  const staff = (q.data?.staff ?? []).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const names = new Map((q.data?.staff ?? []).map((s) => [s.id, s.displayName]));
  return { staff, names, known: q.isSuccess };
}
const hostWords = (ids: string[], names: Map<string, string>, known: boolean) =>
  !ids.length ? "No host" : known ? ids.map((i) => names.get(i) ?? "A former colleague").join(", ") : `${ids.length} ${ids.length === 1 ? "host" : "hosts"}`;

function Types() {
  const me = usePlatformStaff(), qc = useQueryClient();
  const views = me.keys.includes(TYPES_LIST), edits = me.keys.includes(TYPES_EDIT);
  const q = useQuery({ queryKey: ["fo", "booking-types"], enabled: views, queryFn: async () => TypeList.parse(await staffApi("/front-office/booking-types")) });
  const firm = useQuery({ queryKey: ["fo-firm-name", me.firmKey], staleTime: Infinity, enabled: views, retry: false, queryFn: async () => { const r = await fetch(`/api/public/firms/${encodeURIComponent(me.firmKey)}/book`); return r.ok ? ((await r.json()) as { firm: { name: string } }).firm.name : me.firmKey; } });
  const people = useStaffNames();
  const [open, setOpen] = React.useState<string | "new" | null>(null);
  const [ask, setAsk] = React.useState<{ t: BookingType; what: "retire" | "delete" } | null>(null);
  const [said, setSaid] = React.useState<string | null>(null), [err, setErr] = React.useState<string | null>(null), [busy, setBusy] = React.useState<string | null>(null);
  const reload = () => qc.invalidateQueries({ queryKey: ["fo", "booking-types"] });
  const heading = React.useRef<HTMLHeadingElement>(null);
  const focusRow = (name: string, label?: string) => setTimeout(() => (document.querySelector<HTMLElement>(`[data-type-row="${CSS.escape(name)}"] ${label ? `[aria-label="${CSS.escape(label)}"]` : "button"}`) ?? heading.current)?.focus(), 50);
  const act = async (key: string, f: () => Promise<string>, back?: () => void) => {
    setBusy(key); setErr(null); setSaid(null);
    try { setSaid(await f()); } catch (x) { setErr(why(x)); } finally { setBusy(null); await reload(); (back ?? (() => heading.current?.focus()))(); }   // the keyboard's place after an action (break m5, review m1)
  };
  if (!views) return (<><h1 className="text-2xl font-semibold">Booking types</h1><Notice tone="warn" className="mt-3" title={REFUSED} /></>);
  const types = q.data?.types ?? [];
  return (
    <div data-booking-types>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">Booking types</h1><p className="mt-0.5 text-sm text-text-muted">What visitors and staff can book.</p></div>
        {edits && !(q.isSuccess && !types.length) ? <Button onClick={() => setOpen("new")} data-new-type>New booking type</Button> : null}
      </div>
      {!edits ? <p className="mt-2 text-sm text-text-muted" data-read-only>You can view booking types but not change them.</p> : null}
      <div className="mt-3" aria-live="polite">
        {said ? <p role="status" className="mb-2 text-sm text-text-ok" data-said>{said}</p> : null}
        {err ? <Notice tone="danger" className="mb-2" title={err} /> : null}
      </div>
      {q.isPending ? <Loading label="Loading booking types" rows={3} />
        : q.isError ? <Notice tone="danger" title="Could not load the booking types." action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Try again</Button>}>{q.error.message}</Notice>
          : !types.length ? <Notice tone="info" title="No booking types yet. Add one so visitors can book." action={edits ? <Button size="sm" onClick={() => setOpen("new")} data-new-type>New booking type</Button> : undefined} />
            : (
              <Table head={["Name", "Length", "Hosts", "On booking page", edits ? "Actions" : ""]} label="Booking types" headClass={[undefined, "hidden sm:table-cell", "hidden md:table-cell"]}>
                {types.map((t) => (
                  <tr key={t.id} data-type-row={t.name}>
                    <td><button type="button" className="text-left font-medium text-text-link underline-offset-2 hover:underline [overflow-wrap:anywhere]" onClick={() => setOpen(t.id)}>{t.name}</button>{!t.active ? <Pill className="ml-2" title="Switched off: not on the booking page or in staff lists. Its bookings stay.">Retired</Pill> : null}</td>
                    <td className="hidden sm:table-cell">{t.minutes} min</td>
                    <td className="hidden [overflow-wrap:anywhere] md:table-cell">{hostWords(t.hostStaffIds, people.names, people.known)}</td>
                    <td data-on-page>{pageCell(t)}</td>
                    <td>{edits ? (
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" busy={busy === `dup-${t.id}`} aria-label={`Duplicate ${t.name}`} onClick={() => act(`dup-${t.id}`, async () => `Added ${TypeList.shape.types.element.parse(await staffApi(`/front-office/booking-types/${t.id}/duplicate`, { method: "POST" })).name}.`, () => focusRow(t.name, `Duplicate ${t.name}`))}>Duplicate</Button>
                        {t.active ? <Button size="sm" variant="outline" aria-label={`Retire ${t.name}`} onClick={() => setAsk({ t, what: "retire" })}>Retire</Button> : null}
                        <Button size="sm" variant="outline" aria-label={`Delete ${t.name}`} onClick={() => setAsk({ t, what: "delete" })}>Delete</Button>
                      </div>) : null}</td>
                  </tr>
                ))}
              </Table>
            )}
      {ask ? (
        <Dialog open onOpenChange={(o) => { if (!o) { focusRow(ask.t.name); setAsk(null); } }} title={ask.what === "retire" ? `Retire ${ask.t.name}?` : `Delete ${ask.t.name}?`}
          description={ask.what === "retire" ? "It leaves the booking page and staff lists. Its bookings stay." : "It is hidden everywhere; its bookings stay and can still be changed."}
          footer={<><Button variant="ghost" onClick={() => { focusRow(ask.t.name); setAsk(null); }}>Keep</Button><Button variant={ask.what === "delete" ? "destructive" : "default"} busy={busy === "ask"} data-confirm
            onClick={() => { const { t, what } = ask; setAsk(null); void act("ask", async () => { await staffApi(what === "retire" ? `/front-office/booking-types/${t.id}/switch-off` : `/front-office/booking-types/${t.id}`, { method: what === "retire" ? "POST" : "DELETE" }); return what === "retire" ? `${t.name} is retired. Its bookings stay.` : `${t.name} is deleted. Its bookings stay.`; }, () => focusRow(t.name)); }}>{ask.what === "retire" ? "Retire" : "Delete"}</Button></>}>
          <span className="sr-only">{ask.t.name}</span>
        </Dialog>) : null}
      {open ? <TypePanel id={open === "new" ? null : open} edits={edits} firmName={firm.data ?? me.firmKey} people={people} onClose={(words, warning) => { setOpen(null); setErr(warning ?? null); if (words) { setSaid(words); void reload(); } }} /> : null}
    </div>
  );
}

function TypePanel({ id, edits, firmName, people, onClose }: { id: string | null; edits: boolean; firmName: string; people: ReturnType<typeof useStaffNames>; onClose: (said?: string, warning?: string) => void }) {
  const me = usePlatformStaff(), qc = useQueryClient();
  const q = useQuery({ queryKey: ["fo", "booking-types", "one", id], enabled: !!id, retry: false, queryFn: async () => TypeDetail.parse(await staffApi(`/front-office/booking-types/${id}`)) });
  const [draft, setDraft] = React.useState<Draft>(EMPTY), [sets, setSets] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({}), [problem, setProblem] = React.useState<{ text: string; stale: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false), [preview, setPreview] = React.useState(false), [copied, setCopied] = React.useState<string | null>(null);
  const t = q.data;
  const previewButton = React.useRef<HTMLButtonElement>(null);
  const timingVersion = React.useRef<number | null>(null);   // FO-3st3b: a timing save's new version keeps the typed Definition
  React.useEffect(() => { if (t && t.version === timingVersion.current) return; if (t) { setDraft(draftOf(t)); setSets(Object.fromEntries(t.hostSets.map((h) => [h.staffId, h.setId ?? ""]))); setErrors({}); setProblem(null); } }, [t?.id, t?.version]);   // eslint-disable-line react-hooks/exhaustive-deps -- a new answer resets the panel
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const toggle = (k: "modes" | "hostStaffIds", v: string) => set(k, draft[k].includes(v) ? draft[k].filter((x) => x !== v) : [...draft[k], v]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErrors({}); setProblem(null);
    const minutes = /^\d+$/.test(draft.minutes.trim()) ? Number(draft.minutes) : NaN;
    const body = { name: draft.name, description: draft.description.trim() ? draft.description : null, minutes: Number.isNaN(minutes) ? draft.minutes : minutes, purpose: draft.purpose, modes: draft.modes,
      hostStaffIds: draft.hostStaffIds, active: draft.active, showOnBookingPage: draft.showOnBookingPage, allowReschedule: draft.allowReschedule, allowCancel: draft.allowCancel, ...(draft.requireAgreement !== null ? { requireAgreement: draft.requireAgreement } : {}), ...(draft.slug.trim() ? { slug: draft.slug.trim() } : {}) };
    try {
      const saved = t ? TypeDetail.omit({ futureBookings: true, hostSets: true }).parse(await staffApi(`/front-office/booking-types/${t.id}`, { method: "PATCH", json: { ...body, version: t.version } }))
        : TypeList.shape.types.element.parse(await staffApi("/front-office/booking-types", { method: "POST", json: body }));
      const done = t ? `${saved.name} is saved.` : `Added ${saved.name}.`;
      for (const h of saved.hostStaffIds) {   // a host's set of hours for this type (AG-4-62 rule 1b): only a changed choice is sent
        const was = t?.hostSets.find((x) => x.staffId === h)?.setId ?? "";
        if ((sets[h] ?? "") === was) continue;
        try { await staffApi(`/front-office/booking-types/${saved.id}/hosts/${h}/set`, { method: "PUT", json: { setId: sets[h] || null } }); }
        catch (x) { onClose(done, `The set of hours for ${people.names.get(h) ?? "a host"} was not saved: ${why(x)} Open the type to choose again.`); return; }   // break M1, M2
      }
      onClose(done);
    } catch (x) {
      const f = x instanceof StaffApiError ? (x.problem.fields ?? {}) : {};
      setErrors(f as Record<string, string>);
      if (!Object.keys(f).length || x instanceof StaffApiError && x.status === 409 && x.problem.code === "STALE_VERSION") setProblem({ text: why(x), stale: x instanceof StaffApiError && x.problem.code === "STALE_VERSION" });
    } finally { setBusy(false); }
  };
  const url = t ? publicUrl(me.firmKey, t.slug) : "";
  const copy = async (what: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(what); } catch { setCopied("Could not copy. Select the text and copy it yourself."); } };
  const title = id ? t?.name ?? "Booking type" : "New booking type";
  const ro = !edits;
  const dirty = !ro && (JSON.stringify(draft) !== JSON.stringify(t ? draftOf(t) : EMPTY) || Object.entries(sets).some(([h, v]) => v !== (t?.hostSets.find((x) => x.staffId === h)?.setId ?? "")));
  const mayClose = () => !dirty || window.confirm("Discard your unsaved changes?");
  const leave = () => { if (mayClose()) onClose(); };
  return (
    <Panel open onOpenChange={(o) => { if (!o) onClose(); }} confirmClose={mayClose} title={title} badge={t && !t.active ? <Pill>Retired</Pill> : undefined}
      returnFocus={() => document.querySelector<HTMLElement>(id ? `[data-type-row="${CSS.escape(t?.name ?? "")}"] button` : "[data-new-type]")}
      footer={ro ? <Button variant="ghost" onClick={() => onClose()}>Close</Button> : <><Button variant="ghost" onClick={leave}>Cancel</Button><Button type="submit" form="fo3st3-type" busy={busy} disabled={!!id && !t}>Save type</Button></>}>
      {id && q.isPending ? <Loading label="Loading the booking type" rows={4} />
        : id && q.isError ? <Notice tone="danger" title="Could not load this booking type.">{q.error.message}</Notice>
          : (
            <form id="fo3st3-type" onSubmit={save} className="flex flex-col gap-4" data-type-panel noValidate>
              {problem ? <Notice tone="danger" title={problem.text} action={problem.stale ? <Button size="sm" variant="outline" onClick={() => void qc.invalidateQueries({ queryKey: ["fo", "booking-types"] })}>Reload</Button> : undefined} /> : null}
              <section aria-labelledby="fo3st3-def" className="flex flex-col gap-3">
                <h3 id="fo3st3-def" className="text-sm font-semibold">Definition</h3>
                {ro ? (
                  <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1 text-sm" data-values>
                    <dt className="text-text-muted">Name</dt><dd className="[overflow-wrap:anywhere]">{draft.name}</dd>
                    <dt className="text-text-muted">Description</dt><dd className="[overflow-wrap:anywhere]">{draft.description || "None"}</dd>
                    <dt className="text-text-muted">Web address</dt><dd>{draft.slug}</dd>
                    <dt className="text-text-muted">Length</dt><dd>{draft.minutes} minutes</dd>
                    <dt className="text-text-muted">Purpose</dt><dd>{PURPOSES.find(([k]) => k === draft.purpose)?.[1] ?? draft.purpose}</dd>
                    <dt className="text-text-muted">Ways to meet</dt><dd>{MODES.filter(([k]) => draft.modes.includes(k)).map(([, w]) => w).join(", ")}</dd>
                    <dt className="text-text-muted">Active</dt><dd>{draft.active ? "Yes" : "No"}</dd>
                    <dt className="text-text-muted">Show on booking page</dt><dd>{draft.showOnBookingPage ? "Yes" : "No"}</dd>
                    <dt className="text-text-muted">Allow reschedule</dt><dd>{draft.allowReschedule ? "Yes" : "No"}</dd>
                    <dt className="text-text-muted">Allow cancellation</dt><dd>{draft.allowCancel ? "Yes" : "No"}</dd>
                    <dt className="text-text-muted">Agreement signed before it starts</dt><dd>{needsAgreement(draft) ? "Yes" : "No"}</dd>
                  </dl>
                ) : (<>
                  <Field label="Name" error={errors.name}><Input value={draft.name} onChange={(e) => set("name", e.target.value)} /></Field>
                  <Field label="Description (optional)" error={errors.description}><Textarea value={draft.description} onChange={(e) => set("description", e.target.value)} rows={3} /></Field>
                  <Field label="Web address" error={errors.slug} hint={`${window.location.host}/book/${me.firmKey}/${draft.slug || t?.slug || "<made from the name>"}`}><Input value={draft.slug} onChange={(e) => set("slug", e.target.value)} placeholder={t?.slug ?? "Made from the name"} /></Field>
                  <Field label="Length (minutes)" error={errors.minutes}><Input inputMode="numeric" value={draft.minutes} onChange={(e) => set("minutes", e.target.value)} className="w-32" /></Field>
                  <Field label="Purpose" error={errors.purpose}><Select value={draft.purpose} onChange={(e) => set("purpose", e.target.value)}>{PURPOSES.map(([k, w]) => <option key={k} value={k}>{w}</option>)}</Select></Field>
                  <fieldset className="flex flex-col gap-1 text-sm"><legend className="mb-1 text-xs font-medium">Ways to meet</legend>
                    {MODES.map(([k, w]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={draft.modes.includes(k)} onChange={() => toggle("modes", k)} /> {w}</label>)}
                    {errors.modes ? <p role="alert" className="text-xs text-text-danger">{errors.modes}</p> : null}
                  </fieldset>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} /> Active</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.showOnBookingPage} onChange={(e) => set("showOnBookingPage", e.target.checked)} /> Show on booking page</label>
                  {caseType(draft.purpose) ? <p className="text-xs text-text-muted">A follow-up or case review is never on the booking page.</p> : null}
                </>)}
              </section>
              <section aria-labelledby="fo3st3-hosts" className="flex flex-col gap-2 border-t border-border pt-3" data-hosts>
                <h3 id="fo3st3-hosts" className="text-sm font-semibold">Hosts</h3>
                {ro || !people.known ? <p className="text-sm [overflow-wrap:anywhere]">{hostWords(draft.hostStaffIds, people.names, people.known)}</p> : people.staff.filter((s) => s.status === "ACTIVE" || draft.hostStaffIds.includes(s.id) || t?.hostStaffIds.includes(s.id)).map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex min-w-48 items-center gap-2"><input type="checkbox" checked={draft.hostStaffIds.includes(s.id)} onChange={() => toggle("hostStaffIds", s.id)} /> {s.displayName}{s.status !== "ACTIVE" ? ` (${s.status.toLowerCase()}: offers no times)` : ""}</label>
                    {draft.hostStaffIds.includes(s.id) && s.status === "ACTIVE" && me.keys.includes(CONFIGURE) ? <UsesSet staffId={s.id} self={s.id === me.staffId} name={s.displayName} value={sets[s.id] ?? ""} onChange={(v) => setSets((x) => ({ ...x, [s.id]: v }))} /> : null}
                  </div>))}
                {errors.hostStaffIds ? <p role="alert" className="text-xs text-text-danger">{errors.hostStaffIds}</p> : null}
              </section>
              {!ro || t ? (
                <section aria-labelledby="fo3st3-adv" className="flex flex-col gap-2 border-t border-border pt-3" data-advanced>
                  <h3 id="fo3st3-adv" className="text-sm font-semibold">Advanced</h3>
                  {!ro ? <>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.allowReschedule} onChange={(e) => set("allowReschedule", e.target.checked)} /> Allow reschedule</label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.allowCancel} onChange={(e) => set("allowCancel", e.target.checked)} /> Allow cancellation</label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={needsAgreement(draft)} onChange={(e) => set("requireAgreement", e.target.checked)} data-require-agreement /> Consultation agreement signed before the consultation starts</label>
                    <p className="text-xs text-text-muted">What a booker may do from the link in their email.</p>
                  </> : null}
                  {t ? <TypeTimingsSection typeId={t.id} onSaved={(version, sent) => { if (sent !== t.version) { void qc.invalidateQueries({ queryKey: ["fo", "booking-types", "one", t.id] }); return; } timingVersion.current = version; qc.setQueryData<TypeDetail>(["fo", "booking-types", "one", t.id], (o) => (o ? { ...o, version } : o)); }} />
                    : <p className="text-xs text-text-muted">This type uses the firm's timings. Save it first to change them for this type.</p>}
                </section>) : null}
              {t ? (
                <section aria-labelledby="fo3st3-share" className="flex flex-col gap-2 border-t border-border pt-3" data-share>
                  <h3 id="fo3st3-share" className="text-sm font-semibold">Share</h3>
                  <p className="text-sm [overflow-wrap:anywhere]" data-link>{url}</p>
                  <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => copy("Link copied.", url)}>Copy link</Button><Button type="button" size="sm" variant="outline" onClick={() => copy("Embed code copied.", embedCode(url, firmName))}>Copy embed code</Button></div>
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-surface p-2 text-xs [overflow-wrap:anywhere]">{embedCode(url, firmName)}</pre>
                  {copied ? <p role="status" className="text-xs text-text-muted">{copied}</p> : null}
                  <div><Button ref={previewButton} type="button" variant="outline" onClick={() => setPreview(true)} data-preview-open>Preview as a booker</Button></div>
                  {!t.onBookingPage ? <p className="text-xs text-text-muted">Visitors do not see this type now; the preview shows the times it would offer.</p> : null}
                </section>) : null}
            </form>
          )}
      {preview && t ? <PreviewDialog id={t.id} name={t.name} onClose={() => { setPreview(false); setTimeout(() => previewButton.current?.focus(), 0); }} /> : null}
    </Panel>
  );
}

function UsesSet({ staffId, self, name, value, onChange }: { staffId: string; self: boolean; name: string; value: string; onChange: (v: string) => void }) {
  const q = useQuery({ queryKey: ["fo", "booking-types", "sets", staffId], retry: false, refetchOnMount: "always", queryFn: async () => HostSets.parse(await staffApi(self ? "/front-office/me/availability-sets" : `/front-office/staff/${staffId}/availability-sets`)) });
  return (
    <label className="flex items-center gap-2 text-sm">Uses set
      <Select aria-label={`Uses set for ${name}`} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-48" disabled={!q.isSuccess}>
        <option value="">{q.data?.sets.find((s) => s.isDefault)?.name ?? "The default set"} (default)</option>
        {(q.data?.sets ?? []).filter((s) => !s.isDefault).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
    </label>
  );
}

/** A whole date between 1970 and 2999 (break M4: 9999-12-31 made the next day "+010000-01" and blanked the app). */
const usable = (d: string) => /^(19[7-9]\d|2\d{3})-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
/** AG-4-8: the public page's times for seven days from a date, in a zone; an empty day says why; nothing is written. */
function PreviewDialog({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const [zone, setZone] = React.useState(""), [date, setDate] = React.useState("");
  const range = zone && date ? `from=${encodeURIComponent(wallIso(date, 0, zone))}&to=${encodeURIComponent(wallIso([1, 2, 3, 4, 5, 6, 7].reduce((d) => nextDay(d), date), 0, zone))}&tz=${encodeURIComponent(zone)}` : "";
  const q = useQuery({ queryKey: ["fo", "booking-types", "preview", id, range], retry: false, placeholderData: keepPreviousData, queryFn: async () => Preview.parse(await staffApi(`/front-office/booking-types/${id}/preview${range ? `?${range}` : ""}`)) });
  React.useEffect(() => { if (q.data && !zone) { setZone(q.data.timeZone); setDate(todayIn(q.data.timeZone)); } }, [q.data, zone]);
  const zones = React.useMemo(() => { const all = allZones(); return zone && !all.includes(zone) ? [zone, ...all] : all; }, [zone]);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} wide title={`Preview as a booker: ${name}`} description="The times the booking page offers. Nothing is booked.">
      <div className="flex flex-wrap gap-3" data-preview>
        <Field label="Date" className="w-44"><Input type="date" value={date} min="1970-01-01" max="2999-12-31" onChange={(e) => { if (usable(e.target.value)) setDate(e.target.value); }} /></Field>
        <Field label="Time zone" className="w-64"><Select value={zone} onChange={(e) => setZone(e.target.value)}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</Select></Field>
      </div>
      <div className="mt-3" aria-live="polite">
        {q.isPending ? <Loading label="Loading times" rows={3} />
          : q.isError ? <Notice tone="danger" title={why(q.error)} />
            : q.data.reason ? <p className="text-sm" data-preview-reason>{q.data.reason}</p>
              : (
                <ul className="flex flex-col gap-2">
                  {q.data.days.map((d) => (
                    <li key={d.date} data-preview-day={d.date} className="rounded-lg border border-border p-2">
                      <h4 className="text-sm font-semibold">{dayWords(d.date)}</h4>
                      {d.slots.length ? <p className="mt-1 flex flex-wrap gap-1">{d.slots.map((s) => <span key={s.startsAt} title={s.label} className="rounded-md border border-border px-2 py-0.5 text-xs">{hhmm(Date.parse(s.startsAt), q.data.timeZone)}</span>)}</p>
                        : <p className="mt-1 text-sm text-text-muted" data-preview-reason>{d.reason}</p>}
                    </li>))}
                </ul>)}
      </div>
    </Dialog>
  );
}
