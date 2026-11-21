// FO-3st3b (concept screens/fo-3-booking r2 BR-20, §4 "Settings → … Timings", §5 "Timings", §6 J-T5; board
// design/settings.html §5; AG-4-4, AG-4-5, AG-4-66 rules 1-3, 8, §8; R1.42): Settings → Timings in the Bookings area.
// The firm's defaults; a booking type may override five of them under Advanced (type-timings.tsx). Reminders show
// read-only, "24 hours and 1 hour before (fixed for now)" (Lead B's ruling). A field is editable when the person holds
// the key §8 names for it (gaps, notice, window …:configure-availability; self-service …:edit); with :list only the page
// shows values as text and no button; without :list, the refusal. Every rule is FO-3a1e's on the server (PUT
// booking-timings); its refusals show on the field, and a refusal saves nothing.
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Notice } from "@/components/ui/controls";
import { Loading } from "@/modules/front-office/sales/loading";
import { PlatformFrame, usePlatformStaff } from "@/modules/platform/frame";
import { staffApi, StaffApiError } from "@/modules/platform/session";
import { BOOKINGS_AREA } from "../area";
import { FIELDS, FirmTimings, fromInput, inUnit, NOT_A_NUMBER, reminderWords, TIMINGS_HOME, toInput, TYPE_FIELDS, TypeOverrides, TYPES_LIST, words, type TypeField } from "./timings-contract";

const REFUSED = "You do not have permission to do this. Ask an Owner or Admin.";
type Draft = Record<TypeField, string>;
const draftOf = (t: FirmTimings["timings"]): Draft => Object.fromEntries(TYPE_FIELDS.map((f) => [f, toInput(f, t[f])])) as Draft;
const labelOf = (f: TypeField) => `${FIELDS[f].label} (${FIELDS[f].unit})`;

export function TimingsPage() {
  return <PlatformFrame area={BOOKINGS_AREA} crumbs={[{ label: "Timings", to: TIMINGS_HOME }]}><Timings /></PlatformFrame>;
}

function Timings() {
  const me = usePlatformStaff(), qc = useQueryClient();
  const views = me.keys.includes(TYPES_LIST);
  const mayChange = (f: TypeField) => me.keys.includes(FIELDS[f].key);
  const editable = TYPE_FIELDS.filter(mayChange);
  const q = useQuery({ queryKey: ["fo", "booking-timings"], enabled: views, queryFn: async () => FirmTimings.parse(await staffApi("/front-office/booking-timings")) });
  const types = useQuery({ queryKey: ["fo", "booking-types", "overrides"], enabled: views, select: (d: unknown) => TypeOverrides.parse(d), queryFn: async () => staffApi("/front-office/booking-types") });
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [errors, setErrors] = React.useState<Partial<Record<TypeField | "form", string>>>({});
  const [said, setSaid] = React.useState<string | null>(null), [busy, setBusy] = React.useState(false);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const t = q.data?.timings;
  React.useEffect(() => { if (t) setDraft(draftOf(t)); }, [t ? JSON.stringify(t) : null]);   // eslint-disable-line react-hooks/exhaustive-deps -- a new answer resets the form
  if (!views) return (<><h1 className="text-2xl font-semibold">Timings</h1><Notice tone="warn" className="mt-3" title={REFUSED} /></>);

  const overridden = (types.data?.types ?? []).filter((x) => x.active && x.timings && TYPE_FIELDS.some((f) => x.timings?.[f] != null)).map((x) => x.name);
  const dirty = !!t && !!draft && TYPE_FIELDS.some((f) => draft[f] !== toInput(f, t[f]));

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!t || !draft) return;
    setSaid(null); setErrors({});
    const body: Record<string, number> = {}, bad: Partial<Record<TypeField, string>> = {};
    for (const f of editable) {
      if (draft[f] === toInput(f, t[f])) continue;   // only what changed is sent, so §8 checks only those fields
      const v = fromInput(f, draft[f]);
      if (v === null) bad[f] = NOT_A_NUMBER(f); else body[f] = v;
    }
    if (Object.keys(bad).length) { setErrors(bad); focusFirst(bad); return; }
    if (!Object.keys(body).length) { setSaid("Nothing to save: no value changed."); return; }
    setBusy(true);
    try {
      const next = FirmTimings.parse(await staffApi("/front-office/booking-timings", { method: "PUT", json: body }));
      qc.setQueryData(["fo", "booking-timings"], next);
      setDraft(draftOf(next.timings));
      setSaid("Timings saved. They apply to new bookings; existing bookings keep their times.");
      heading.current?.focus();
    } catch (x) {
      if (x instanceof StaffApiError && x.problem.fields) {
        const fe: Partial<Record<TypeField | "form", string>> = {};
        for (const [k, m] of Object.entries(x.problem.fields)) { if ((TYPE_FIELDS as readonly string[]).includes(k)) fe[k as TypeField] = inUnit(k as TypeField, m); else fe.form = m; }
        setErrors(fe); focusFirst(fe);
      } else setErrors({ form: x instanceof StaffApiError ? x.message : "Something went wrong. Please try again." });
    } finally { setBusy(false); }
  };
  const focusFirst = (e: Partial<Record<string, string>>) => { const f = TYPE_FIELDS.find((k) => e[k]); if (f) setTimeout(() => document.querySelector<HTMLElement>(`[data-timing-field="${f}"]`)?.focus(), 0); };

  return (
    <div data-timings>
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">Timings</h1>
      <p className="mt-0.5 text-sm text-text-muted">Firm defaults. A type may override them under Advanced.</p>
      {!editable.length ? <p className="mt-2 text-sm text-text-muted" data-read-only>You can view timings but not change them.</p> : null}
      <div className="mt-3" aria-live="polite">
        {said ? <p role="status" className="mb-2 text-sm text-text-ok" data-said>{said}</p> : null}
        {errors.form ? <Notice tone="danger" className="mb-2" title={errors.form} /> : null}
      </div>
      {q.isPending || (q.isSuccess && !draft) ? <Loading label="Loading timings" rows={2} />
        : q.isError ? <Notice tone="danger" title="Could not load the timings." action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Try again</Button>}>{q.error.message}</Notice>
          : t && draft ? (
            <>
              {q.data.warnings.map((w) => <Notice key={w} tone="warn" className="mb-3" title={w} />)}
              {!editable.length ? (
                <dl className="grid max-w-3xl gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]" data-timings-text>
                  <dt className="font-medium">Reminders</dt><dd data-reminders>{reminderWords(t.reminderOffsetsMinutes)}</dd>
                  {TYPE_FIELDS.map((f) => <React.Fragment key={f}><dt className="font-medium">{FIELDS[f].label}</dt><dd data-timing-text={f}>{words(f, t[f])}</dd></React.Fragment>)}
                </dl>
              ) : (
                <form onSubmit={save} noValidate className="flex max-w-3xl flex-col gap-4" data-timings-form>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="flex flex-col gap-1.5"><p className="text-xs font-medium">Reminders</p><p className="text-sm" data-reminders>{reminderWords(t.reminderOffsetsMinutes)}</p></div>
                    {TYPE_FIELDS.map((f) => mayChange(f) ? (
                      <Field key={f} label={labelOf(f)} error={errors[f]} hint={`Default: ${words(f, q.data.defaults[f])}.`}>
                        <Input inputMode="decimal" value={draft[f]} data-timing-field={f} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} className="w-32" />
                      </Field>
                    ) : (
                      <div key={f} className="flex flex-col gap-1.5"><p className="text-xs font-medium">{FIELDS[f].label}</p><p className="text-sm" data-timing-text={f}>{words(f, t[f])}</p></div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" busy={busy} data-save-timings>Save timings</Button>
                    {dirty ? <Button type="button" variant="ghost" onClick={() => { setDraft(draftOf(t)); setErrors({}); }}>Undo changes</Button> : null}
                    <p className="text-xs text-text-muted">A change applies to new bookings. Reminders already set keep their time.</p>
                  </div>
                </form>
              )}
              <p className="mt-3 text-xs text-text-muted" data-overridden>
                {types.isSuccess ? (overridden.length ? `Overridden on ${overridden.length} ${overridden.length === 1 ? "type" : "types"}: ${overridden.join(", ")}.` : "No booking type overrides these.") : null}
              </p>
            </>
          ) : null}
    </div>
  );
}
