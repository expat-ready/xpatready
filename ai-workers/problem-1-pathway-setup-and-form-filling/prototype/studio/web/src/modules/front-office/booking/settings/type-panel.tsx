// FO-3st3 part 1 (concept fo-3-booking r2 §4 "Settings → Booking types", BR-19; AG-4-8, -9 rules 1-7 and §10, -10 §10):
// one booking type in the drawer: Definition · Hosts · Advanced · Share · Preview, and Save, Duplicate, Retire (or
// Switch on) and Delete. A save sends the version it read; another tab's save answers 409 and the input stays. A
// refused field shows the server's words at that field. Read-only (`:list` only): the same sections as text, no button.
// Read-only shows the link and embed code as text (no Copy buttons, no Preview: concept §4 "no buttons").
// Timing overrides under Advanced come with part 2 (FO-3a 1b-ii's timings routes are not on main yet).
import * as React from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Field, Input, Notice, Panel, Select, Textarea } from "@/components/ui/controls";
import { staffApi, StaffApiError } from "@/modules/platform/session";
import { embedCode, HostSets, isCaseType, KEYS, MODE_WORDS, MODES, Preview, PURPOSE_WORDS, PURPOSES, shareLink, TypeDetail, W, type BookingType } from "./contract";

type Me = { keys: string[]; firmKey: string };
type Staff = { id: string; displayName: string; status: string };
type Draft = { name: string; description: string; purpose: BookingType["purpose"]; minutes: string; slug: string; modes: BookingType["modes"]; hostStaffIds: string[]; active: boolean; showOnBookingPage: boolean; allowReschedule: boolean; allowCancel: boolean };
const draftOf = (t: BookingType | null): Draft => ({ name: t?.name ?? "", description: t?.description ?? "", purpose: t?.purpose ?? "FREE_CONSULT", minutes: String(t?.minutes ?? 30), slug: t?.slug ?? "", modes: t?.modes ?? ["VIDEO"], hostStaffIds: t?.hostStaffIds ?? [],
  active: t?.active ?? true, showOnBookingPage: t?.showOnBookingPage ?? true, allowReschedule: t?.allowReschedule ?? true, allowCancel: t?.allowCancel ?? true });
const toggle = <T,>(list: T[], v: T, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v));
const sec = "border-t border-border pt-4 mt-4 flex flex-col gap-3";

export function TypePanel({ me, typeId, staff, onClose, onOpen, returnFocus }: { me: Me; typeId: string | "new"; staff: Staff[] | null; onClose: () => void; onOpen: (id: string) => void; returnFocus: () => HTMLElement | null }) {
  const qc = useQueryClient(), edit = me.keys.includes(KEYS.edit), isNew = typeId === "new";
  const detail = useQuery({ queryKey: ["fo", "booking-type", typeId], enabled: !isNew, retry: false, queryFn: async () => TypeDetail.parse(await staffApi(`/front-office/booking-types/${typeId}`)) });
  const t = isNew ? null : detail.data ?? null;
  const [d, setD] = React.useState<Draft>(draftOf(null));
  // A new read replaces the draft only where the person has not typed (break m4: Retire kept a typed name).
  // The version a save sends is the one the typed draft was based on: another tab's newer read never slips under the
  // person's typing (the stale save stays a 409); after the person's own action (Retire, a host's set) it moves on.
  const base = React.useRef<Draft>(draftOf(null)), version = React.useRef<number | null>(null), mine = React.useRef(false);
  React.useEffect(() => {
    const next = draftOf(t), clean = JSON.stringify(d) === JSON.stringify(base.current);
    if (clean || mine.current || version.current === null) { version.current = t?.version ?? null; if (clean) setD(next); }
    base.current = next; mine.current = false;
  }, [t?.id, t?.version]);   // eslint-disable-line react-hooks/exhaustive-deps -- on a new read only
  const dirty = () => JSON.stringify(d) !== JSON.stringify(base.current);
  const alive = React.useRef(true); React.useEffect(() => () => { alive.current = false; }, []);
  const inFlight = React.useRef(false), opener = React.useRef<HTMLElement | null>(null);
  /** Where focus goes after a confirm or a switch (break m6): the button that opened it, else the action now in its place. */
  const refocus = () => requestAnimationFrame(() => { const el = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>("[data-switch-on], [data-retire]"); el?.focus(); });
  const [err, setErr] = React.useState<StaffApiError | null>(null), [busy, setBusy] = React.useState<string | null>(null), [ask, setAsk] = React.useState<"retire" | "delete" | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const fieldErr = (f: string) => err?.field(f) ?? null;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["fo", "booking-types"] }), qc.invalidateQueries({ queryKey: ["fo", "booking-type"] })]);
  const run = async (what: string, f: () => Promise<unknown>) => { if (inFlight.current) return false; inFlight.current = true; setBusy(what); setErr(null); try { await f(); mine.current = true; await refresh(); return true; } catch (e) { setErr(e instanceof StaffApiError ? e : new StaffApiError(0, { detail: "Could not save. Please try again." } as never)); return false; } finally { inFlight.current = false; setBusy(null); } };
  const body = () => {
    const b: Record<string, unknown> = { name: d.name, description: d.description.trim() ? d.description : null, purpose: d.purpose, minutes: Number(d.minutes), modes: d.modes, hostStaffIds: d.hostStaffIds,
      active: d.active, showOnBookingPage: d.showOnBookingPage, allowReschedule: d.allowReschedule, allowCancel: d.allowCancel };
    if (!isNew && d.slug !== t!.slug) b.slug = d.slug;
    return b;
  };
  const save = () => run("save", async () => {
    if (isNew) { const made = await staffApi<{ id: string }>("/front-office/booking-types", { method: "POST", json: body() }); if (alive.current) onOpen(made.id); }
    else await staffApi(`/front-office/booking-types/${t!.id}`, { method: "PATCH", json: { ...body(), version: version.current ?? t!.version } });
  });
  const post = (path: string, what: string, then?: (r: { id: string }) => void) => run(what, async () => { const r = await staffApi<{ id: string }>(`/front-office/booking-types/${t!.id}${path}`, { method: path ? "POST" : "DELETE" }); then?.(r); });

  if (!isNew && detail.isError) return <Panel open onOpenChange={(o) => !o && onClose()} title="Booking type" returnFocus={returnFocus}><Notice tone="danger" title="Not available">{detail.error instanceof StaffApiError ? detail.error.message : "Could not load this type."}</Notice></Panel>;
  // A long unbroken name would run under the close button (the shared Panel does not wrap): a break chance every 12
  // characters lets it wrap at any width (break m7: wide letters overflowed a 40-character cut).
  const title = (isNew ? W.add : t?.name ?? "Booking type").replace(/(\S{12})(?=\S)/gu, "$1\u200b");
  const footer = !edit ? null : <>
    <Button variant="ghost" onClick={() => { if (!dirty() || window.confirm("Discard your unsaved changes?")) onClose(); }}>Close</Button>
    <div className="flex flex-wrap gap-2">
      {t ? <Button variant="outline" busy={busy === "dup"} disabled={!!busy} data-duplicate onClick={() => void post("/duplicate", "dup", (r) => onOpen(r.id))}>Duplicate</Button> : null}
      {t ? (t.active ? <Button variant="outline" disabled={!!busy} data-retire onClick={(e) => { opener.current = e.currentTarget; setAsk("retire"); }}>Retire</Button> : <Button variant="outline" busy={busy === "on"} disabled={!!busy} data-switch-on onClick={() => { opener.current = null; void post("/switch-on", "on").then(refocus); }}>Switch on</Button>) : null}
      {t ? <Button variant="outline" disabled={!!busy} data-delete onClick={(e) => { opener.current = e.currentTarget; void detail.refetch().then(() => setAsk("delete")); }}>Delete</Button> : null}
      <Button busy={busy === "save"} disabled={!isNew && !t} data-save onClick={() => void save()}>Save type</Button>
    </div></>;
  return (
    <Panel open onOpenChange={(o) => !o && onClose()} confirmClose={() => !edit || !dirty() || window.confirm("Discard your unsaved changes?")} title={title} returnFocus={returnFocus} footer={footer} bodyLabel={edit ? undefined : `${title}, read-only`}
      badge={t && !t.active ? <span className="rounded-md bg-text/10 px-1.5 py-0.5 text-[11px] text-text-muted">Retired</span> : null}>
      {!isNew && !t ? <p role="status" className="text-sm text-text-muted" data-loading>Loading the booking type…</p> : <div data-type-panel={t?.id ?? "new"}>
        {err && (!Object.keys(err.problem.fields ?? {}).length || err.problem.code === "STALE_VERSION") ? <Notice tone="danger" title={err.problem.code === "STALE_VERSION" ? "Not saved" : "Could not do that"}><span data-panel-error>{err.message}</span></Notice> : null}
        {t && isCaseType(t) ? <p className="text-sm text-text-muted" data-case-line>{W.caseLine}</p> : null}
        {!edit ? <ReadOnly t={t!} staff={staff} /> : <>
          <h3 className="text-sm font-semibold">Definition</h3>
          <div className="flex flex-col gap-3">
            <Field label="Name" error={fieldErr("name")}><Input value={d.name} onChange={(e) => set("name", e.target.value)} data-name /></Field>
            <Field label="Description (optional)" error={fieldErr("description")}><Textarea value={d.description} onChange={(e) => set("description", e.target.value)} rows={2} /></Field>
            <Field label="Purpose" error={fieldErr("purpose")}><Select value={d.purpose} onChange={(e) => set("purpose", e.target.value as Draft["purpose"])} data-purpose>{PURPOSES.map((p) => <option key={p} value={p}>{PURPOSE_WORDS[p]}</option>)}</Select></Field>
            <Field label="Length (minutes)" error={fieldErr("minutes")}><Input inputMode="numeric" value={d.minutes} onChange={(e) => set("minutes", e.target.value)} data-minutes /></Field>
            {t ? <Field label="Web address" error={fieldErr("slug")} hint={shareLink(window.location.origin, me.firmKey, d.slug || t.slug)}><Input value={d.slug} onChange={(e) => set("slug", e.target.value)} data-slug /></Field> : null}
            <fieldset className="flex flex-wrap gap-4 text-sm"><legend className="mb-1 text-xs font-medium">Ways to meet</legend>{MODES.map((m) => <label key={m} className="flex items-center gap-2"><input type="checkbox" checked={d.modes.includes(m)} onChange={(e) => set("modes", toggle(d.modes, m, e.target.checked))} />{MODE_WORDS[m]}</label>)}</fieldset>
            {fieldErr("modes") ? <p role="alert" className="text-xs text-text-danger">{fieldErr("modes")}</p> : null}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.active} onChange={(e) => set("active", e.target.checked)} />Active</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.showOnBookingPage} onChange={(e) => set("showOnBookingPage", e.target.checked)} />Show on booking page</label>
          </div>
          <div className={sec}><h3 className="text-sm font-semibold">Hosts</h3>
            {staff === null ? <p className="text-sm text-text-muted">Hosts: {d.hostStaffIds.length}</p>
              : staff.filter((s) => s.status === "ACTIVE" || d.hostStaffIds.includes(s.id)).map((s) => <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.hostStaffIds.includes(s.id)} onChange={(e) => set("hostStaffIds", toggle(d.hostStaffIds, s.id, e.target.checked))} data-host={s.id} />{s.displayName}</label>)}
            {fieldErr("hostStaffIds") ? <p role="alert" className="text-xs text-text-danger">{fieldErr("hostStaffIds")}</p> : null}
            {t && me.keys.includes(KEYS.hours) ? <HostSetPickers t={t} staff={staff} /> : null}
          </div>
          <div className={sec}><h3 className="text-sm font-semibold">Advanced</h3>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.allowReschedule} onChange={(e) => set("allowReschedule", e.target.checked)} />Allow reschedule</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.allowCancel} onChange={(e) => set("allowCancel", e.target.checked)} />Allow cancellation</label>
          </div></>}
        {t ? <Share t={t} firmKey={me.firmKey} copy={edit} /> : null}
        {t && edit ? <PreviewSection t={t} /> : null}
      </div>}
      <Dialog open={ask !== null} onOpenChange={(o) => { if (!o) { setAsk(null); refocus(); } }} title={ask === "retire" ? "Retire" : "Delete"}
        footer={<><Button variant="ghost" onClick={() => { setAsk(null); refocus(); }}>Keep</Button>
          <Button variant="destructive" data-confirm onClick={() => { const a = ask; setAsk(null); opener.current = null; void (a === "retire" ? post("/switch-off", "off").then(refocus) : post("", "del", () => onClose())); }}>{ask === "retire" ? "Retire" : "Delete"}</Button></>}>
        <p className="text-sm" data-confirm-text>{t ? (ask === "retire" ? W.retire(t.name) : W.remove(t.name, (t as TypeDetail).futureBookings)) : null}</p>
      </Dialog>
    </Panel>
  );
}

function ReadOnly({ t, staff }: { t: BookingType; staff: Staff[] | null }) {
  const names = t.hostStaffIds.map((id) => staff?.find((s) => s.id === id)?.displayName).filter(Boolean);
  const rows: [string, string][] = [["Name", t.name], ["Description", t.description ?? "None"], ["Purpose", PURPOSE_WORDS[t.purpose]], ["Length", `${t.minutes} minutes`], ["Web address", t.slug],
    ["Ways to meet", t.modes.map((m) => MODE_WORDS[m]).join(", ")], ["Active", t.active ? "Yes" : "No"], ["Show on booking page", t.showOnBookingPage ? "Yes" : "No"],
    ["Hosts", names.length ? names.join(", ") : String(t.hostStaffIds.length)], ["Allow reschedule", t.allowReschedule ? "Yes" : "No"], ["Allow cancellation", t.allowCancel ? "Yes" : "No"]];
  return <><p className="mb-3 text-sm text-text-muted" data-read-only>{W.readOnly}</p>
    <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-2 text-sm">{rows.map(([k, v]) => <React.Fragment key={k}><dt className="text-text-muted">{k}</dt><dd className="break-words">{v}</dd></React.Fragment>)}</dl></>;
}

/** Rule 1b: which of a host's sets this type uses (Owner and Admin: the hosts' sets need :configure-availability). */
function HostSetPickers({ t, staff }: { t: TypeDetail; staff: Staff[] | null }) {
  const qc = useQueryClient();
  const sets = useQueries({ queries: t.hostStaffIds.map((id) => ({ queryKey: ["fo", "host-sets", id], retry: false, queryFn: async () => HostSets.parse(await staffApi(`/front-office/staff/${id}/availability-sets`)).sets })) });
  const [err, setErr] = React.useState<string | null>(null);
  const choose = async (staffId: string, setId: string) => {
    setErr(null);
    try { await staffApi(`/front-office/booking-types/${t.id}/hosts/${staffId}/set`, { method: "PUT", json: { setId: setId || null } }); await qc.invalidateQueries({ queryKey: ["fo", "booking-type", t.id] }); }
    catch (e) { setErr(e instanceof StaffApiError ? e.message : "Could not change the set."); }
  };
  if (!t.hostStaffIds.length) return <p className="text-sm text-text-muted">{W.noHosts}</p>;
  return <>{t.hostStaffIds.map((id, i) => {
    const chosen = t.hostSets.find((h) => h.staffId === id)?.setId ?? "", name = staff?.find((s) => s.id === id)?.displayName ?? "Host";
    return <Field key={id} label={`${name} · Uses set`}><Select value={chosen} onChange={(e) => void choose(id, e.target.value)} data-host-set={id} disabled={!sets[i].data}>
      <option value="">Default set</option>{(sets[i].data ?? []).filter((s) => !s.isDefault).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>;
  })}{err ? <p role="alert" className="text-xs text-text-danger">{err}</p> : null}</>;
}

function Share({ t, firmKey, copy: canCopy }: { t: BookingType; firmKey: string; copy: boolean }) {
  const link = shareLink(window.location.origin, firmKey, t.slug), code = embedCode(link, firmKey);
  const [copied, setCopied] = React.useState<string | null>(null);
  const copy = async (what: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(what); } catch { setCopied("Copy is blocked here: select the text."); } };
  return <div className={sec}><h3 className="text-sm font-semibold">Share</h3>
    <p className="break-all text-sm" data-share-link>{link}</p>
    {canCopy ? <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => void copy("Link copied.", link)}>Copy link</Button><Button variant="outline" size="sm" onClick={() => void copy("Embed code copied.", code)}>Copy embed code</Button></div> : null}
    <pre className="overflow-x-auto rounded-lg bg-surface p-2 text-xs" tabIndex={0} aria-label="Embed code">{code}</pre>
    {copied ? <p role="status" className="text-xs text-text-muted">{copied}</p> : null}</div>;
}

/** AG-4-8: the public page's own times for one date in a zone, and why a day is empty. Reads only. */
function PreviewSection({ t }: { t: BookingType }) {
  const [date, setDate] = React.useState(() => new Date().toLocaleDateString("en-CA")), [zone, setZone] = React.useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [asked, setAsked] = React.useState<{ date: string; zone: string } | null>(null);
  const q = useQuery({ queryKey: ["fo", "booking-type-preview", t.id, asked], enabled: !!asked, retry: false, queryFn: async () => {
    // A window either side of the date covers any zone's day; the server groups the days in `tz`.
    const at = Date.parse(`${asked!.date}T00:00:00Z`), from = new Date(at - 15 * 3_600_000).toISOString(), to = new Date(at + 39 * 3_600_000).toISOString();
    return Preview.parse(await staffApi(`/front-office/booking-types/${t.id}/preview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&tz=${encodeURIComponent(asked!.zone)}`));
  } });
  const day = q.data?.days.find((x) => x.date === asked?.date);
  const why = q.data ? q.data.reason ?? (!day || !day.slots.length ? day?.reason ?? "No times on this date." : null) : null;
  const hm = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: q.data!.timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return <div className={sec}><h3 className="text-sm font-semibold">Preview as a booker</h3>
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-preview-date /></Field>
      <Field label="Time zone"><Input value={zone} onChange={(e) => setZone(e.target.value)} data-preview-zone /></Field>
      <Button variant="outline" disabled={!date} data-preview onClick={() => setAsked({ date, zone })}>Show times</Button>
    </div>
    <div aria-live="polite" data-preview-result>
      {q.isFetching ? <p role="status" className="text-sm text-text-muted">Loading times…</p>
        : q.isError ? <p role="alert" className="text-sm text-text-danger">{q.error instanceof StaffApiError && q.error.status === 400 ? "Choose a date within 62 days and a time zone such as America/Toronto." : q.error instanceof StaffApiError ? q.error.message : "Could not load the times."}</p>
          : why ? <p className="text-sm" data-preview-reason>{why}</p>
            : q.data && day ? <ul className="flex flex-wrap gap-2 text-sm" data-preview-slots>{day.slots.map((s) => <li key={s.startsAt} className="rounded-md border border-border px-2 py-1">{hm(s.startsAt)}</li>)}</ul>
              : null}
    </div></div>;
}
