// FO-3st3b (concept screens/fo-3-booking r2 BR-20, §6 J-T5; board design/settings.html §4 "Advanced"; AG-4-4, AG-4-66
// rules 2-3, 7-8, §8; R1.42): a booking type's own timings, under Advanced in the type's panel. Each of the five shows
// "Uses firm default (<value>)" with "Change for this type", or its own value with "Reset to firm default". Each change
// is its own save (PATCH booking-types/:id/timings with the version read; null = the firm's), so it never mixes with
// the panel's unsaved Definition. A field is changeable with the key §8 names for it; otherwise its value shows as text.
// The resolve order (type, else firm, else default) and every range are the server's; its refusals show on the field.
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Notice } from "@/components/ui/controls";
import { usePlatformStaff } from "@/modules/platform/frame";
import { staffApi, StaffApiError } from "@/modules/platform/session";
import { FIELDS, FirmTimings, fromInput, inUnit, NOT_A_NUMBER, toInput, TYPE_FIELDS, TypeTimings, words, type TypeField } from "./timings-contract";

const STALE = "STALE_VERSION";

/** `onSaved(version, sent)`: the type's new version and the version this save sent. The panel takes the new version for
 *  its own Save type only when it held `sent`; otherwise its form is stale and it reloads (review M1: no lost update). */
export function TypeTimingsSection({ typeId, onSaved }: { typeId: string; onSaved?: (version: number, sent: number) => void }) {
  const me = usePlatformStaff(), qc = useQueryClient();
  const key = ["fo", "booking-types", "timings", typeId];
  const q = useQuery({ queryKey: key, retry: false, queryFn: async () => TypeTimings.parse(await staffApi(`/front-office/booking-types/${typeId}`)) });
  const firm = useQuery({ queryKey: ["fo", "booking-timings"], retry: false, queryFn: async () => FirmTimings.parse(await staffApi("/front-office/booking-timings")) });
  const [editing, setEditing] = React.useState<TypeField | null>(null), [text, setText] = React.useState("");
  const [error, setError] = React.useState<{ field: TypeField | null; text: string; stale?: boolean } | null>(null);
  const [said, setSaid] = React.useState<string | null>(null), [busy, setBusy] = React.useState<TypeField | null>(null);
  const t = q.data;

  // Escape in a row's field leaves that row only. The panel (Radix) listens for Escape on the document in the capture
  // phase, so this listens on the window, which the capture phase reaches first.
  React.useEffect(() => {
    if (!editing) return;
    const f = editing;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !(e.target instanceof HTMLElement) || !e.target.closest(`[data-type-timing="${f}"]`)) return;
      e.stopPropagation(); e.preventDefault(); setEditing(null); setError(null); focus(`[data-type-timing="${f}"] button`);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editing]);
  const focus = (sel: string) => setTimeout(() => document.querySelector<HTMLElement>(sel)?.focus(), 0);
  const send = async (f: TypeField, value: number | null) => {
    if (!t) return;
    setBusy(f); setError(null); setSaid(null);
    try {
      const next = TypeTimings.parse(await staffApi(`/front-office/booking-types/${typeId}/timings`, { method: "PATCH", json: { [f]: value, version: t.version } }));
      qc.setQueryData(key, next);
      onSaved?.(next.version, t.version);
      setEditing(null);
      setSaid(value === null ? `${FIELDS[f].label} uses the firm default again (${words(f, next.effectiveTimings[f])}).` : `${FIELDS[f].label} for this type is ${words(f, value)}.`);
      focus(`[data-type-timing="${f}"] button`);
    } catch (x) {
      if (x instanceof StaffApiError && x.problem.code === STALE) setError({ field: null, text: x.message, stale: true });
      else if (x instanceof StaffApiError) setError({ field: x.field(f) ? f : null, text: x.field(f) ? inUnit(f, x.field(f)!) : x.message });
      else setError({ field: null, text: "Something went wrong. Please try again." });
      if (x instanceof StaffApiError && x.field(f)) focus(`[data-type-timing-input="${f}"]`);
    } finally { setBusy(null); }
  };
  const start = (f: TypeField) => { if (!t) return; setEditing(f); setError(null); setSaid(null); setText(toInput(f, t.effectiveTimings[f])); focus(`[data-type-timing-input="${f}"]`); };
  /** Not a <form>: this sits inside the type panel's form, and forms do not nest (Enter saves this row only). */
  const submit = (f: TypeField) => {
    if (t && text.trim() === toInput(f, t.effectiveTimings[f]) && t.timings[f] !== null) { setEditing(null); focus(`[data-type-timing="${f}"] button`); return; }   // unchanged: nothing to send
    const v = fromInput(f, text);
    if (v === null) { setError({ field: f, text: NOT_A_NUMBER(f) }); focus(`[data-type-timing-input="${f}"]`); return; }
    void send(f, v);
  };

  return (
    <div className="flex flex-col gap-2" data-type-timings>
      <h4 className="text-xs font-medium text-text-muted">Timings for this type</h4>
      <div aria-live="polite">{said ? <p role="status" className="text-sm text-text-ok" data-timing-said>{said}</p> : null}</div>
      {error && !error.field ? <Notice tone="danger" title={error.text} action={error.stale ? <Button size="sm" variant="outline" onClick={() => { setError(null); setEditing(null); void qc.invalidateQueries({ queryKey: ["fo", "booking-types"] }); }}>Reload</Button> : undefined} /> : null}
      {q.isPending ? <p className="text-sm text-text-muted" role="status">Loading timings…</p>
        : q.isError ? <Notice tone="danger" title="Could not load this type's timings." action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Try again</Button>} />
          : t ? (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {TYPE_FIELDS.map((f) => {
                const own = t.timings[f], may = me.keys.includes(FIELDS[f].key), firmValue = firm.data?.timings[f];
                const inputId = `type-timing-${typeId}-${f}`, noteId = `${inputId}-note`;
                return (
                  <li key={f} className="flex flex-wrap items-center justify-between gap-2 py-2" data-type-timing={f}>
                    <span id={`${inputId}-name`} className="font-medium">{FIELDS[f].label}</span>
                    {editing === f ? (
                      <div className="flex flex-wrap items-start gap-2" role="group" aria-labelledby={`${inputId}-name`}>
                        <div className="flex flex-col gap-1">
                          <label htmlFor={inputId} className="sr-only">{`${FIELDS[f].label} (${FIELDS[f].unit}) for this type`}</label>
                          <div className="flex items-center gap-2">
                            <Input id={inputId} inputMode="decimal" className="w-24" value={text} onChange={(e) => setText(e.target.value)} data-type-timing-input={f}
                              aria-invalid={error?.field === f ? true : undefined} aria-describedby={error?.field === f ? noteId : undefined}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(f); } }} />
                            <span className="text-text-muted">{FIELDS[f].unit}</span>
                          </div>
                          {error?.field === f ? <p id={noteId} role="alert" className="max-w-xs text-xs text-text-danger">{error.text}</p> : null}
                        </div>
                        <Button type="button" size="sm" variant="outline" busy={busy === f} onClick={() => submit(f)}>Save</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(null); setError(null); focus(`[data-type-timing="${f}"] button`); }}>Cancel</Button>
                      </div>
                    ) : (
                      <span className="flex flex-wrap items-center gap-2">
                        <span data-type-timing-value>{own === null ? `Uses firm default (${words(f, firmValue ?? t.effectiveTimings[f])})` : `${words(f, own)} (this type)`}</span>
                        {may ? (own === null
                          ? <Button type="button" size="sm" variant="link" onClick={() => start(f)} aria-describedby={`${inputId}-name`}>Change for this type</Button>
                          : <>
                            <Button type="button" size="sm" variant="link" onClick={() => start(f)} aria-describedby={`${inputId}-name`}>Change</Button>
                            <Button type="button" size="sm" variant="link" busy={busy === f} onClick={() => void send(f, null)} aria-describedby={`${inputId}-name`}>Reset to firm default</Button>
                          </>) : null}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
      {t?.warnings.map((w) => <Notice key={w} tone="warn" title={w} />)}
      <p className="text-xs text-text-muted">A change applies to new bookings; existing bookings keep their times.</p>
    </div>
  );
}
