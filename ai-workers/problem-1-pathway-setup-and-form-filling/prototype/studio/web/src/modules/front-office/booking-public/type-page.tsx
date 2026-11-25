// FO-3w J-P2..J-P5, J-P9 (concept BR-3..BR-7, BR-11; AG-4-18..-20, -36 §12): /book/:firmKey/:slug, three steps on one
// page: a time (month grid and the day's times in the visitor's zone), the details (five inputs and one tick), and the
// confirmation. The same page inside an iframe (BR-11). Hosts are never named; nothing here carries an id.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button, buttonVariants, Field, Input } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Booked, MODE_WORDS, publicCall, Slots, TRY_LATER, type Mode, type Problem, type Slot } from "./contract";
import { Gate, PublicFrame } from "./frame";
import { useBookingSite } from "./site-context";
import { allZones, browserZone, clocksChange, dayKey, dayWords, hhmm, monthGrid, monthName, monthOf, monthStart, monthWords, nextMonth, realZone, whenWords, type Month } from "./time";

const ZONE_TIP = "Times change to the zone you pick. Your booked time stays the same.";
/** The server takes a form 3 s after its stamp at the earliest (AG-4-20 rule 3): a quick person is held, never refused. */
const MIN_FILL_MS = 3_100;
const big = "min-h-11 min-w-11";
type Values = { givenNames: string; familyName: string; email: string; phone: string; mode: Mode; consent: boolean };
const FIELD_WORDS: Record<string, string> = {
  givenNames: "Enter your given names.", familyName: "Enter your family name.", email: "Enter an email like name@example.com.",
  phone: "Enter a phone number with its country code, e.g. +1 416 555 0100.",
};
/** FO-9b (P-747): any typed number is taken; the firm reads it, and one it cannot read is kept and flagged for staff. */
const phoneOk = (p: string) => p.trim().length > 0;

export function BookingTypePage() {
  const { firmKey, slug, base } = useBookingSite();   // QA-756: from the path, or from a firm's own address
  const qc = useQueryClient();
  const [zone, setZone] = React.useState<string | null>(browserZone);
  const [month, setMonth] = React.useState<Month>(() => monthOf(Date.now(), browserZone() ?? "UTC"));
  const [chosen, setChosen] = React.useState<Slot | null>(null);
  const [booked, setBooked] = React.useState<{ answer: Booked; email: string; phone: string } | null>(null);
  const key = ["public-slots", firmKey, slug, zone, month.y, month.m] as const;   // M1: a zone change reads the month in that zone
  const q = useQuery({
    queryKey: key, retry: false, staleTime: Infinity, refetchOnWindowFocus: false, placeholderData: (prev) => prev,
    queryFn: () => {
      // No browser zone: the answer comes in the firm's zone, not yet known here, so the month is asked a day wider each
      // side in UTC and the grid keeps the month's own days (Devin #1921: a firm's evening on the 30th is 00:30 UTC on the 1st).
      const pad = zone ? 0 : 86_400_000, z = zone ?? "UTC";
      const from = new Date(monthStart(month, z).getTime() - pad).toISOString(), to = new Date(monthStart(nextMonth(month), z).getTime() + pad).toISOString();
      return publicCall(`firms/${encodeURIComponent(firmKey)}/book/${encodeURIComponent(slug)}/slots?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${zone ? `&tz=${encodeURIComponent(zone)}` : ""}`, Slots);
    },
  });
  // BR-3: no browser zone → the zone the answer returns (the firm's), labelled the same way.
  // m8: once the page has drawn, a later refusal (a month, a zone) shows above the grid, never in place of the page.
  const last = React.useRef<Slots | undefined>(undefined);
  if (q.data) last.current = q.data;
  const shown = zone ?? last.current?.timeZone ?? "UTC";
  return (
    <Gate pending={!last.current && q.isPending} error={last.current ? null : q.error}>{() => {
      const d = q.data ?? last.current!;
      return (
        <PublicFrame firm={d.firm.name} title={`${d.type.name} · ${d.firm.name}`}>
          {booked ? <Confirmation base={base} {...booked} />
            : chosen ? <Details d={d} zone={shown} slot={chosen} stampedAt={q.dataUpdatedAt} firmKey={firmKey} slug={slug}
                onBack={() => setChosen(null)} onPick={setChosen} onBooked={(answer, email, phone) => setBooked({ answer, email, phone })}
                onStale={() => qc.invalidateQueries({ queryKey: ["public-slots", firmKey, slug] })} />
              : <Times d={d} loading={q.isFetching && (q.isPlaceholderData || !q.data)} error={q.data ? null : q.error as Problem | null} zone={shown} month={month} onMonth={setMonth} onZone={setZone} onPick={setChosen} />}
        </PublicFrame>
      );
    }}</Gate>
  );
}

/** m7: a step that replaces another takes focus on its heading (not on the first page load). */
let drawn = false;
function useHeadingFocus() {
  const h = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => { if (drawn) h.current?.focus(); drawn = true; return () => { drawn = true; }; }, []);
  return h;
}

function ZoneLine({ zone, onZone }: { zone: string; onZone?: (z: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(zone);
  const [bad, setBad] = React.useState<string | null>(null);
  const zones = React.useMemo(() => allZones(), []);
  const use = () => { const z = realZone(text); if (!z) { setBad("Choose a time zone from the list."); return; } onZone?.(z); setOpen(false); };
  return (
    <p className="mt-2 flex flex-wrap items-center gap-1 text-sm text-text-muted" title={ZONE_TIP} data-zone-line>
      Times shown in <span className="font-medium text-text">{zone}</span>
      {/* The picker's own dialog on Radix (as controls.tsx's): 44 px targets on a public page (BR-6, review R1), and its
          Trigger takes focus back to "(change)" when it closes (review m1). */}
      {onZone ? <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (o) { setText(zone); setBad(null); } setOpen(o); }}>
        <DialogPrimitive.Trigger className={cn(big, "px-1 text-text-link underline")}>(change)<span className="sr-only"> time zone</span></DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface-raised p-5 shadow-xl outline-none">
            <div className="flex items-start justify-between gap-3">
              <DialogPrimitive.Title className="text-base font-semibold">Your time zone</DialogPrimitive.Title>
              <DialogPrimitive.Close className={cn(big, "-mr-2 -mt-2 grid place-items-center rounded-md text-text-muted hover:bg-text/5")} aria-label="Close"><X className="size-4" /></DialogPrimitive.Close>
            </div>
            <DialogPrimitive.Description className="mt-1 text-xs text-text-muted">{ZONE_TIP}</DialogPrimitive.Description>
            <form className="mt-4 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); use(); }}>
              <Field label="Search for a city or zone" error={bad}><Input list="fo3w-zones" value={text} onChange={(e) => { setText(e.target.value); setBad(null); }} className="h-11" autoComplete="off" /></Field>
              <datalist id="fo3w-zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
              <Button type="submit" size="lg" className="h-11 self-end">Use this zone</Button>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root> : null}
    </p>
  );
}

function Times({ d, loading, error, zone, month, onMonth, onZone, onPick }: { d: Slots; loading: boolean; error: Problem | null; zone: string; month: Month; onMonth: (m: Month) => void; onZone: (z: string) => void; onPick: (s: Slot) => void }) {
  const byDay = React.useMemo(() => {
    const m = new Map<string, Slot[]>(), seen = new Set<string>();
    for (const s of d.slots) { if (seen.has(s.startsAt)) continue; seen.add(s.startsAt); const k = dayKey(new Date(s.startsAt), zone); m.set(k, [...(m.get(k) ?? []), s]); }
    return m;
  }, [d.slots, zone]);
  const days = monthGrid(month), inMonth = [...byDay.keys()].filter((k) => k.startsWith(`${month.y}-${String(month.m).padStart(2, "0")}`)).sort();
  const [day, setDay] = React.useState<string | null>(null);
  const shownDay = day && byDay.has(day) ? day : inMonth[0] ?? null;
  const now = monthOf(Date.now(), zone), atStart = month.y * 12 + month.m <= now.y * 12 + now.m;
  const daySlots = shownDay ? byDay.get(shownDay)! : [];
  return (
    <section aria-labelledby="fo3w-times">
      <h1 id="fo3w-times" ref={useHeadingFocus()} tabIndex={-1} className="text-2xl font-semibold outline-none">Choose a time</h1>
      <p className="mt-1 text-sm text-text-muted [overflow-wrap:anywhere]"><bdi>{d.type.name}</bdi> · {d.type.minutes} minutes</p>
      <ZoneLine zone={zone} onZone={onZone} />
      {error ? <p role="alert" className="mt-3 text-sm">{error.status === 429 ? TRY_LATER : error.detail ?? "We could not load the times. Please try again."}</p> : null}
      <div className="mt-4 grid gap-6 sm:grid-cols-[1fr_16rem]">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Button variant="outline" className={big} aria-label="Previous month" disabled={atStart} onClick={() => { setDay(null); onMonth(nextMonth(month, -1)); }}>‹</Button>
            <h2 className="text-base font-semibold" aria-live="polite">{monthWords(month)}</h2>
            <Button variant="outline" className={big} aria-label="Next month" onClick={() => { setDay(null); onMonth(nextMonth(month)); }}>›</Button>
          </div>
          {loading ? <Skeleton className="h-64 w-full" data-loading /> : (
            <div className="grid grid-cols-7 gap-0.5 text-center" role="group" aria-label={monthWords(month)}>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => <span key={w} aria-hidden className="text-xs text-text-muted">{w}</span>)}
              {days.map((k, i) => k === null ? <span key={`b${i}`} /> : (
                <button key={k} type="button" disabled={!byDay.has(k)} aria-pressed={k === shownDay} aria-label={dayWords(new Date(`${k}T12:00:00Z`), "UTC")} onClick={() => setDay(k)}
                  className={cn(big, "rounded-lg text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", !byDay.has(k) ? "text-text-muted" : k === shownDay ? "bg-primary font-semibold text-primary-foreground" : "border border-primary font-semibold text-text-link")}>
                  {Number(k.slice(8))}
                </button>
              ))}
            </div>
          )}
        </div>
        <div data-day-times>
          {loading ? <div className="flex flex-col gap-2"><Skeleton className="h-6 w-40" /><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div>
            : shownDay ? <>
              <h3 className="text-base font-semibold">{dayWords(new Date(daySlots[0].startsAt), zone)}</h3>
              {clocksChange(shownDay, zone) ? <p data-dst className="mt-2 rounded-lg bg-surface-sunken px-3 py-2 text-xs">Clocks change on this day. Times shown are real times in {zone}.</p> : null}
              <ul className="mt-2 flex flex-col gap-2">{daySlots.map((s) => <li key={s.startsAt}><Button variant="outline" size="lg" className="h-11 w-full" aria-label={whenWords(new Date(s.startsAt), zone)} onClick={() => onPick(s)}>{hhmm(new Date(s.startsAt), zone)}</Button></li>)}</ul>
            </> : error ? null : <p data-public-state="no-times" className="text-sm">No free times in {monthName(month)}. Try the next month.</p>}
        </div>
      </div>
    </section>
  );
}

function Details({ d, zone, slot, stampedAt, firmKey, slug, onBack, onPick, onBooked, onStale }: { d: Slots; zone: string; slot: Slot; stampedAt: number; firmKey: string; slug: string; onBack: () => void; onPick: (s: Slot) => void; onBooked: (b: Booked, email: string, phone: string) => void; onStale: () => void }) {
  const [v, setV] = React.useState<Values>({ givenNames: "", familyName: "", email: "", phone: "", mode: d.type.modes[0], consent: false });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [refused, setRefused] = React.useState<{ text: string; next?: Slot[] } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const sending = React.useRef(false), summary = React.useRef<HTMLDivElement>(null), trap = React.useRef<HTMLInputElement>(null);
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((x) => ({ ...x, [k]: val }));
  const focusSummary = () => requestAnimationFrame(() => summary.current?.focus());
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending.current) return;   // BR-7: a double click books once
    const own: Record<string, string> = {};
    if (!v.givenNames.trim()) own.givenNames = FIELD_WORDS.givenNames;
    if (!v.familyName.trim()) own.familyName = FIELD_WORDS.familyName;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(v.email.trim())) own.email = FIELD_WORDS.email;
    if (v.mode === "PHONE" && !phoneOk(v.phone)) own.phone = FIELD_WORDS.phone;
    setErrors(own); setRefused(null);
    if (Object.keys(own).length) { focusSummary(); return; }
    sending.current = true; setBusy(true);
    try {
      const wait = stampedAt + MIN_FILL_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const body = {
        givenNames: v.givenNames, familyName: v.familyName, email: v.email.trim(), ...(v.mode === "PHONE" ? { phone: v.phone } : {}), mode: v.mode,
        startsAt: slot.startsAt, timeZone: zone, formStamp: d.formStamp,
        ...(d.consent && v.consent ? { consent: true, consentWordingId: d.consent.wordingId } : {}),
        ...(trap.current?.value ? { website: trap.current.value } : {}),
      };
      const r = await publicCall(`firms/${encodeURIComponent(firmKey)}/book/${encodeURIComponent(slug)}/bookings`, Booked, { method: "POST", body: JSON.stringify(body) });
      onBooked(r, v.email.trim(), v.phone);
    } catch (x) {
      // M3: a lost answer or one we cannot read is a refusal like any other, never a crash with nothing shown.
      // A ZodError (an answer that no longer fits the contract) is an Error with object issues: not a refusal (review n2).
      const p: Problem = x && typeof x === "object" && !(x instanceof Error) && "issues" in x ? x as Problem : { status: 0, issues: [], slots: [] };
      const fields = Object.fromEntries(p.issues.map((i) => i.split(":")[0]).filter((f) => FIELD_WORDS[f]).map((f) => [f, FIELD_WORDS[f]]));
      if (p.status === 429) setRefused({ text: TRY_LATER });
      else if (p.slug === "slot-taken") { setRefused({ text: "This time was just booked.", next: p.slots.slice(0, 4) }); onStale(); }
      else if (p.slug === "consent-wording-changed") { set("consent", false); setRefused({ text: p.detail ?? "The firm's agreement text has changed. Please reload the page and tick the box again." }); onStale(); }
      else if (p.status === 422 && Object.keys(fields).length) setErrors(fields);   // field errors are 422 (PF-28 part 4)
      else setRefused({ text: p.detail ?? "We could not take this booking. Please try again." });
      focusSummary();
    } finally { sending.current = false; setBusy(false); }
  };
  const list = Object.values(errors);
  return (
    <section aria-labelledby="fo3w-details" className="max-w-lg">
      <h1 id="fo3w-details" ref={useHeadingFocus()} tabIndex={-1} className="text-2xl font-semibold outline-none">Your details</h1>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm"><span data-chosen>{whenWords(new Date(slot.startsAt), zone)}</span><button type="button" className={cn(big, "px-1 text-text-link underline")} onClick={onBack}>Back to times</button></p>
      <form noValidate onSubmit={send} className="relative mt-4 flex flex-col gap-4">
        {list.length || refused ? (
          <div ref={summary} tabIndex={-1} role="alert" data-summary className="rounded-lg border border-border border-l-4 border-l-danger bg-surface-raised px-4 py-3 text-sm outline-none">
            {refused ? <>
              <p className="font-semibold">{refused.text}</p>
              {refused.next ? <>
                <p className="mt-0.5">Please choose another time.</p>
                {refused.next.length ? <><h2 className="mt-2 text-sm font-semibold">Next free times</h2>
                  <ul className="mt-1 flex flex-wrap gap-2">{refused.next.map((s) => <li key={s.startsAt}><Button type="button" variant="outline" size="lg" className="h-11" onClick={() => { setRefused(null); onPick(s); }}>{whenWords(new Date(s.startsAt), zone)}</Button></li>)}</ul></> : null}
              </> : null}
            </> : <><p className="font-semibold">There is a problem</p><ul className="mt-1 list-disc pl-5">{list.map((m) => <li key={m}>{m}</li>)}</ul></>}
          </div>
        ) : null}
        <Field label="Given names" error={errors.givenNames}><Input className="h-11" value={v.givenNames} onChange={(e) => set("givenNames", e.target.value)} autoComplete="given-name" maxLength={100} required /></Field>
        <Field label="Family name" error={errors.familyName}><Input className="h-11" value={v.familyName} onChange={(e) => set("familyName", e.target.value)} autoComplete="family-name" maxLength={100} required /></Field>
        <Field label="Email" error={errors.email}><Input className="h-11" type="email" inputMode="email" value={v.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" maxLength={254} required /></Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-medium">How would you like to meet?</legend>
          <div className="flex flex-wrap gap-2">{d.type.modes.map((m) => (
            <label key={m} className={cn(big, "flex items-center gap-2 rounded-lg border border-border px-3 text-sm")}>
              <input type="radio" name="fo3w-mode" checked={v.mode === m} onChange={() => set("mode", m)} className="size-4 accent-[var(--color-primary)]" />{MODE_WORDS[m]}
            </label>))}</div>
        </fieldset>
        {v.mode === "PHONE" ? <Field label="Phone" hint="Include your country code, e.g. +1 416 555 0100" error={errors.phone}><Input className="h-11" type="tel" inputMode="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" maxLength={40} required /></Field> : null}
        {d.consent ? (
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" checked={v.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]" />
            <span>{d.consent.text}</span>
          </label>
        ) : null}
        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden"><input ref={trap} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" /></div>
        <Button type="submit" size="lg" busy={busy} className="h-11 w-full sm:w-auto sm:self-start">Book this time</Button>
      </form>
    </section>
  );
}

function addressOf(a: Record<string, string> | null): string | null {
  if (!a) return null;
  const street = [a.streetNumber, a.streetName].filter(Boolean).join(" ");
  return [a.unit ? `Unit ${a.unit}` : "", street, a.city, a.provinceState, a.postalCode].filter(Boolean).join(", ") || null;
}

function Confirmation({ base, answer: b, email, phone }: { base: string; answer: Booked; email: string; phone: string }) {
  const h = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => { h.current?.focus(); }, []);
  const manage = `${base}/manage#${b.manageToken}`, minutes = Math.round((Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60_000);
  const join = b.mode === "VIDEO" ? (b.joinLink ? <>Your join link: <a className="text-text-link underline [overflow-wrap:anywhere]" href={b.joinLink} rel="noopener noreferrer" target="_blank">{b.joinLink}</a></> : "Your join link will follow.")
    : b.mode === "PHONE" ? `The firm will call you on ${phone}.` : `At ${addressOf(b.firm.address) ?? "the firm's office"}.`;
  return (
    <section aria-labelledby="fo3w-done" data-public-state="booked" className="max-w-lg">
      <h1 id="fo3w-done" ref={h} tabIndex={-1} className="text-2xl font-semibold text-text-ok outline-none">You are booked</h1>
      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border bg-surface-raised p-5 text-sm">
        <p className="font-semibold [overflow-wrap:anywhere]">{whenWords(new Date(b.startsAt), b.timeZone)}, with <bdi>{b.firm.name}</bdi></p>
        <p className="[overflow-wrap:anywhere]"><bdi>{b.typeName}</bdi>, {minutes} minutes, {MODE_WORDS[b.mode]}</p>
        <p data-join>{join}</p>
        <p className="text-text-muted">We have sent the details to {email}.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a className={cn(buttonVariants({ size: "lg" }), "h-11")} href={`/api/public/bookings/${encodeURIComponent(b.manageToken)}/ics`} download="invite.ics">Add to calendar</a>
          <a className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")} href={manage}>Reschedule</a>
          <a className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")} href={manage}>Cancel booking</a>
        </div>
      </div>
    </section>
  );
}
