// FO-3st1 part 2 (concept fo-3-booking r2 §4 "Booking detail" sections Consult record and Next step, §5 copy; BR-15,
// BR-16; AG-4-49 rules 1-9, §12; AG-4-50; J-S5, J-S6, J-S8): the consult record of an attended booking, on our own
// controls, saved through FO-3a part 2a's `GET/PUT /front-office/bookings/:id/consult-record`.
//   * Shown to whoever may answer the booking's attendance (its host, or the edit key: the feed's canAnswerAttendance,
//     the same people the record route lets in), once the answer is Attended; No-show and no record → nothing (J-S5).
//   * A first record starts with time spent = the booked length (worked out as the route does), and Recommended with the
//     lead's "Interested in" service (BR-15) as its first item; the person removes or adds items.
//   * The quoted fee is optional; its currency is CAD or USD only, pre-filled CAD (Sample: the firm's own currency has no
//     setting yet); an amount with no currency is refused in the concept's words (J-S6). Save names the version read, so
//     someone else's save is never overwritten (409 STALE_VERSION → the words and Reload).
//   * Attendance changed to No-show later (§12): the record stays, read-only, under "Attendance changed to No-show." (J-S8).
//   * Next step (BR-16): the buttons the server lists for this viewer (`nextSteps`); each opens the owning area's own
//     screen and nothing is sent from here. "Engage and prepare retainer" opens FO-4's Engage panel on the lead's page;
//     "Prepare retainer" opens the prospect (FO-5's retainer draft screen, FO-5s, is not on main). "Close lead" has no
//     panel on main (FO-4's lead page has no Close yet), so it is not rendered: question for the tech lead in the PR.
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui/controls";
import { staffApi, StaffApiError } from "@/modules/platform/session";
import { Loading } from "@/modules/front-office/sales/loading";
import { Lead } from "@/modules/front-office/sales/contract";
import type { FeedItem } from "./contract";

export const ConsultRecord = z.object({
  id: z.string(), bookingId: z.string(), version: z.number(), timeSpentMinutes: z.number(), bookedMinutes: z.number(), notes: z.string().nullable(),
  recommended: z.array(z.string()), quotedFee: z.object({ amountMinor: z.number(), currency: z.string() }).nullable(),
  attendanceChanged: z.literal("NO_SHOW").nullable(), nextSteps: z.array(z.enum(["ENGAGE_AND_PREPARE_RETAINER", "CLOSE_LEAD", "PREPARE_RETAINER"])),
  createdAt: z.string(), updatedAt: z.string(),
  // FO-3c part 2 (AG-4-15 rule 4): the consultation agreement is not signed: a warning, never a refusal (the server's words).
  agreementWarning: z.object({ code: z.string(), words: z.string() }).nullable().optional(),
});
export type ConsultRecord = z.infer<typeof ConsultRecord>;
/** The route's answer: the record, or none yet with the booked length (404 NO_RECORD). */
type Read = { record: ConsultRecord | null; bookedMinutes: number };

const WORDS = {
  currency: "Choose a currency for the quoted fee.",
  minutes: "Enter the minutes spent, from 1 to 1440.",
  fee: "Enter the fee as an amount up to 9,999,999.99, for example 1500 or 1,500.50.",
  item: "Each item is 1 to 120 characters.",
  items: "At most 20 recommended items.",
  duplicate: "This item is already in the list.",
  notAttended: "The attendance changed. Reload to see it.",
  stale: "Someone else saved this record. Reload to see their changes.",
  refused: "You do not have permission to do this. Ask an Owner or Admin.",
} as const;
const money = (minor: number) => (minor / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "1500", "1500.5" or "1,500.50" → minor units. A comma is read only as a thousands mark in its place: "1 500,50",
 *  "15,00" or "1,5" are refused, never read as a ten or a hundred times larger fee (break M1). */
const minorOf = (s: string) => {
  const t = s.trim();
  if (!/^(\d{1,7}|\d{1,3}(,\d{3}){1,2})(\.\d{1,2})?$/.test(t)) return null;
  const n = Math.round(Number(t.replace(/,/g, "")) * 100);
  return n <= 999_999_999 ? n : null;
};
const chars = (s: string) => [...s].length;
/** An item as the route stores it (service.ts Item): NFC, invisible marks dropped, spaces folded; "" when nothing is left. */
const INVISIBLE = /[\u200b\u200e\u200f\u2060-\u2064\ufeff\u00ad]/g;
const itemOf = (s: string) => { const t = s.normalize("NFC").replace(INVISIBLE, "").trim().replace(/\s+/g, " "); return /[^\u200c\u200d]/.test(t) ? t : ""; };
const sameItem = (a: string, b: string) => a.toLocaleLowerCase("en-CA") === b.toLocaleLowerCase("en-CA");
/** The route's field issues ("recommended.2: 1 to 120 characters") by the form's field. */
type Errors = Partial<Record<"minutes" | "notes" | "fee" | "currency" | "item", string>>;
const FIELD: Record<string, keyof Errors> = { timeSpentMinutes: "minutes", notes: "notes", recommended: "item", quotedFeeMinor: "fee", quotedFeeCurrency: "currency" };
function errorsOf(issues: string[] | undefined): Errors {
  const out: Errors = {};
  for (const i of issues ?? []) { const [path, ...rest] = i.split(": "); const f = FIELD[path.split(".")[0]]; if (f && !out[f]) out[f] = f === "item" && /\.\d+$/.test(path) ? `Item ${Number(path.split(".")[1]) + 1}: ${rest.join(": ")}` : rest.join(": "); }
  return out;
}

export function ConsultRecordSection({ booking }: { booking: FeedItem }) {
  const q = useQuery({
    queryKey: ["fo", "bookings", "consult", booking.id], retry: false,
    queryFn: async (): Promise<Read> => {
      try { const record = ConsultRecord.parse(await staffApi(`/front-office/bookings/${booking.id}/consult-record`)); return { record, bookedMinutes: record.bookedMinutes }; }
      catch (e) {
        const booked = e instanceof StaffApiError && e.status === 404 && e.problem.code === "NO_RECORD" ? bookedOf(booking) : null;
        if (booked !== null) return { record: null, bookedMinutes: booked };
        throw e;
      }
    },
  });
  // BR-15: a first record's Recommended starts from the lead's "Interested in" (read only while there is no record).
  const leadId = booking.hangsOn?.kind === "lead" ? booking.hangsOn.id : null;
  const lead = useQuery({ queryKey: ["fo", "leads", "one", leadId], enabled: !!leadId && q.isSuccess && !q.data.record, retry: false,
    queryFn: async () => Lead.parse(await staffApi(`/front-office/leads/${encodeURIComponent(leadId ?? "")}`)) });
  // The form mounts once per Reload, never on its own save's refresh: a remount would drop "Saved" and the focus.
  const qc = useQueryClient();
  const [loads, setLoads] = React.useState(0), [justSaved, setJustSaved] = React.useState(false);
  if (q.isPending || (lead.fetchStatus === "fetching" && lead.isPending)) return <Loading label="Loading the consult record" rows={2} />;
  if (q.isError) return <Notice tone="danger" title="Could not load the consult record.">{q.error instanceof StaffApiError && q.error.status === 403 ? WORDS.refused : q.error.message}</Notice>;
  const { record, bookedMinutes } = q.data;
  if (record?.attendanceChanged === "NO_SHOW") return <><Notice tone="warn" title="Attendance changed to No-show." /><RecordReadOnly r={record} /></>;
  if (booking.attendance !== "COMPLETED") return null;
  // A lead the viewer may not read leaves the list empty, as typed by hand.
  const interested = !record && lead.data?.interestedIn ? itemOf(lead.data.interestedIn) : "";
  const suggested = interested && chars(interested) <= 120 ? [interested] : [];
  return (
    <>
      {record?.agreementWarning ? <div className="mb-2" data-consult-agreement-warning><Notice tone="warn" title="Consultation agreement not signed">{record.agreementWarning.words}</Notice></div> : null}
      <RecordForm key={loads} booking={booking} record={record} bookedMinutes={bookedMinutes} suggested={suggested} onSaved={() => setJustSaved(true)}
        onReload={() => void qc.invalidateQueries({ queryKey: ["fo", "bookings"] }).then(() => setLoads((n) => n + 1))} />
      {record ? <NextStep booking={booking} record={record} reveal={justSaved} /> : null}
    </>
  );
}

/** The booked length, as the route works it out (rule 3): end minus start in whole minutes, 1 to 1440. */
function bookedOf(b: FeedItem) { return Math.max(1, Math.min(1440, Math.round((Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60_000))); }

function RecordReadOnly({ r }: { r: ConsultRecord }) {
  return (
    <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1" data-consult-readonly>
      <dt className="text-text-muted">Time spent</dt><dd>{r.timeSpentMinutes} minutes</dd>
      <dt className="text-text-muted">Notes</dt><dd className="whitespace-pre-wrap">{r.notes ?? "None"}</dd>
      <dt className="text-text-muted">Recommended</dt><dd>{r.recommended.length ? r.recommended.map((i, n) => <React.Fragment key={i}>{n ? ", " : null}<bdi>{i}</bdi></React.Fragment>) : "None"}</dd>
      <dt className="text-text-muted">Quoted fee</dt><dd>{r.quotedFee ? `${money(r.quotedFee.amountMinor)} ${r.quotedFee.currency}` : "None"}</dd>
    </dl>
  );
}

function RecordForm({ booking, record, bookedMinutes, suggested, onSaved, onReload }: { booking: FeedItem; record: ConsultRecord | null; bookedMinutes: number; suggested: string[]; onSaved: () => void; onReload: () => void }) {
  const qc = useQueryClient();
  const [minutes, setMinutes] = React.useState(String(record?.timeSpentMinutes ?? bookedMinutes));
  const [notes, setNotes] = React.useState(record?.notes ?? "");
  const [items, setItems] = React.useState<string[]>(record?.recommended ?? suggested);
  const [adding, setAdding] = React.useState("");
  const [fee, setFee] = React.useState(record?.quotedFee ? money(record.quotedFee.amountMinor) : "");
  const [currency, setCurrency] = React.useState(record?.quotedFee?.currency ?? "CAD");
  const [errors, setErrors] = React.useState<Errors>({});
  const [busy, setBusy] = React.useState(false), [saved, setSaved] = React.useState(false), [failed, setFailed] = React.useState<{ text: string; reload?: boolean } | null>(null);
  const addRef = React.useRef<HTMLInputElement>(null), saveRef = React.useRef<HTMLButtonElement>(null);
  // The busy Save let go of the focus (break m7): it goes back after the render that enables Save again (an effect on a
  // counter). A requestAnimationFrame asked before that render could run first, on a still-disabled Save, and the dialog
  // kept the focus (c2 J-S6 red on a busy machine: the focus on the dialog, not Save).
  const [focusSave, setFocusSave] = React.useState(0);
  React.useEffect(() => { if (focusSave) saveRef.current?.focus(); }, [focusSave]);
  /** The version this form last read or saved (STANDARDS §4): a first save names none. */
  const version = React.useRef<number | null>(record?.version ?? null);
  const changed = () => { setSaved(false); };

  /** The list with the typed item added, or the words why not (null: nothing typed). */
  const withTyped = (): { list: string[] } | { error: string } | null => {
    if (!adding.trim()) return null;
    const t = itemOf(adding);
    if (!t || chars(t) > 120) return { error: WORDS.item };
    if (items.some((i) => sameItem(i, t))) return { error: WORDS.duplicate };
    if (items.length >= 20) return { error: WORDS.items };
    return { list: [...items, t] };
  };
  const add = () => {
    const got = withTyped();
    if (!got) return;
    if ("error" in got) { setErrors((e) => ({ ...e, item: got.error })); return; }
    setItems(got.list); setAdding(""); setErrors((e) => ({ ...e, item: undefined })); changed(); addRef.current?.focus();
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const m = Number(minutes), amount = fee.trim() ? minorOf(fee) : null;
    const next: Errors = {};
    if (!/^\d+$/.test(minutes.trim()) || m < 1 || m > 1440) next.minutes = WORDS.minutes;
    if (fee.trim() && amount === null) next.fee = WORDS.fee;
    if (amount !== null && !currency) next.currency = WORDS.currency;
    // An item typed but not added is saved with the rest, never dropped while "Saved" shows (break m1).
    const typed = withTyped();
    if (typed && "error" in typed) next.item = typed.error;
    setErrors(next); setFailed(null); setSaved(false);
    if (Object.keys(next).length) return;
    const list = typed && "list" in typed ? typed.list : items;
    if (typed) { setItems(list); setAdding(""); }
    setBusy(true);
    try {
      const out = ConsultRecord.parse(await staffApi(`/front-office/bookings/${booking.id}/consult-record`, { method: "PUT", json: {
        timeSpentMinutes: m, notes: notes.trim() ? notes : null, recommended: list, quotedFeeMinor: amount, quotedFeeCurrency: amount === null ? null : currency,
        ...(version.current !== null ? { version: version.current } : {}),
      } }));
      version.current = out.version; onSaved();
      await qc.invalidateQueries({ queryKey: ["fo", "bookings"] });
      setSaved(true);
    } catch (err) {
      const code = err instanceof StaffApiError ? err.problem.code : undefined;
      const fields = err instanceof StaffApiError ? errorsOf(err.problem.issues) : {};
      setErrors(fields);   // the route's own words, at their fields (review M3)
      setFailed({
        text: code === "STALE_VERSION" ? WORDS.stale : code === "NOT_ATTENDED" || code === "CANCELLED" ? WORDS.notAttended : err instanceof StaffApiError && err.status === 403 ? WORDS.refused : err instanceof Error ? err.message : "Not saved. Please try again.",
        reload: code === "STALE_VERSION" || code === "NOT_ATTENDED" || code === "CANCELLED",
      });
    } finally { setBusy(false); setFocusSave((n) => n + 1); }   // the busy button let go of the focus (break m7)
  };

  return (
    <form onSubmit={(e) => void save(e)} noValidate className="flex flex-col gap-3" data-consult-record={booking.id}>
      <Field label="Time spent (minutes)" error={errors.minutes}>
        <Input inputMode="numeric" value={minutes} onChange={(e) => { setMinutes(e.target.value); changed(); }} className="w-32" />
      </Field>
      <Field label="Notes (optional)" error={errors.notes}>
        <Textarea value={notes} onChange={(e) => { setNotes(e.target.value); changed(); }} />
      </Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs font-medium">Recommended (optional)</legend>
        {items.length ? (
          <ul className="flex flex-wrap gap-2" data-recommended>
            {items.map((i) => (
              <li key={i} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5"><bdi>{i}</bdi>
                <button type="button" className="rounded px-1 text-text-muted hover:text-text focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none" aria-label={`Remove ${i}`} title={`Remove ${i}`} onClick={() => { setItems(items.filter((x) => x !== i)); changed(); addRef.current?.focus(); }}>×</button></li>
            ))}
          </ul>
        ) : null}
        <div className="flex items-start gap-2">
          <Field label="Recommended item" className="flex-1 [&>label]:sr-only" error={errors.item}>
            <Input ref={addRef} value={adding} maxLength={200} placeholder="For example: Express Entry assessment" onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          </Field>
          <Button type="button" variant="outline" onClick={add}>+ Add</Button>
        </div>
      </fieldset>
      <div className="flex flex-wrap items-start gap-3">
        <Field label="Quoted fee (optional)" error={errors.fee} className="w-40">
          <Input inputMode="decimal" value={fee} onChange={(e) => { setFee(e.target.value); changed(); }} />
        </Field>
        <Field label="Currency" error={errors.currency} className="w-32">
          <Select value={currency} onChange={(e) => { setCurrency(e.target.value); changed(); }}>
            <option value="">Choose</option><option value="CAD">CAD</option><option value="USD">USD</option>
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button ref={saveRef} type="submit" busy={busy}>Save record</Button>
        <span role="status" className="text-sm text-text-ok" data-consult-saved={saved || undefined}>{saved ? "Saved" : ""}</span>
      </div>
      {failed ? <Notice tone="danger" title="Not saved" action={failed.reload ? <Button size="sm" variant="outline" type="button" onClick={onReload}>Reload</Button> : undefined}>{failed.text}</Notice> : null}
    </form>
  );
}

const STEP_WORDS = { ENGAGE_AND_PREPARE_RETAINER: "Engage and prepare retainer", PREPARE_RETAINER: "Prepare retainer", CLOSE_LEAD: "Close lead" } as const;

/** BR-16: one button per next step the server lists for this viewer that has a screen to open on main. */
/** reveal: just saved here, so the section is scrolled into the panel's view (it is often below the fold); focus stays. */
function NextStep({ booking, record, reveal }: { booking: FeedItem; record: ConsultRecord; reveal: boolean }) {
  const go = useNavigate(), box = React.useRef<HTMLElement>(null);
  React.useEffect(() => { if (reveal) box.current?.scrollIntoView({ block: "nearest" }); }, [reveal]);
  const on = booking.hangsOn;
  const target = (s: ConsultRecord["nextSteps"][number]) =>
    s === "ENGAGE_AND_PREPARE_RETAINER" && on?.kind === "lead" ? `/front-office/leads/${on.id}?engage=1`
      : s === "PREPARE_RETAINER" && on?.kind === "prospect" ? `/front-office/prospects/${on.id}` : null;
  const steps = record.nextSteps.map((s) => ({ s, to: target(s) })).filter((x): x is { s: typeof x.s; to: string } => x.to !== null);
  if (!steps.length) return null;
  return (
    <section ref={box} aria-labelledby="fo-next" className="mt-4 border-t border-border pt-3" data-next-step>
      <h3 id="fo-next" className="font-semibold">Next step</h3>
      <p className="mb-2 text-text-muted">Opens the next screen. Nothing is sent to {booking.person?.name || "the person"} from here.</p>
      <div className="flex flex-wrap gap-2">{steps.map(({ s, to }) => <Button key={s} variant="outline" onClick={() => go(to)}>{STEP_WORDS[s]}</Button>)}</div>
    </section>
  );
}
