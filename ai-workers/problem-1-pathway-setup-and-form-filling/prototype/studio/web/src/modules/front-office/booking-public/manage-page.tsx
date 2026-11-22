// FO-3w part 2, J-P6..J-P8 (concept BR-8..BR-10, §5 "Manage"; AG-4-36, -37, -38): /book/:firmKey/manage#<token>, the booker's own page from the link in every
// booking email (AG-4-36 rule 1). The token is read from the address's fragment only: it is sent in the API's path (FO-3's routes), never in a query string,
// and never written to the console or a log. After a move the answer's new token replaces the old one in the fragment, so a reload keeps working and the old
// links stop (rule 3). The reason for a cancel is sent and never shown back. Nothing here carries an id.
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { z } from "zod";
import { Button, Field } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Firm, MODE_WORDS, MODES, publicCall, Slot, TRY_LATER, type Problem } from "./contract";
import { Gate, PublicFrame } from "./frame";
import { dayKey, dayWords, hhmm, whenWords } from "./time";

/** FO-3's manage answer (service.ts manageView / selfReschedule / selfCancel: publicAnswer and the switches). */
const Answer = z.object({
  status: z.string(), mode: z.enum(MODES), startsAt: z.string(), endsAt: z.string(), timeZone: z.string(), typeName: z.string(), firm: Firm,
  allowReschedule: z.boolean(), allowCancel: z.boolean(), selfServiceLimitHours: z.number(),
});
const View = Answer.extend({ canChange: z.boolean(), canReschedule: z.boolean(), canCancel: z.boolean(), message: z.string().nullable() });
type View = z.infer<typeof View>;
const Moved = Answer.extend({ manageToken: z.string() });
const MoveSlots = z.object({ timeZone: z.string(), slots: z.array(Slot) });

export const BAD_LINK = "This link is no longer valid. Please use the link in your latest email, or reply to it.";
const NOT_ONLINE = "This booking cannot be changed online. Please reply to your confirmation email.";
const UPDATED = "Booking updated. We have sent a new email; links in older emails no longer work.";
const CANCELLED = "Your booking is cancelled. We have sent you an email.";
const SOON = "Your meeting starts soon, so it can no longer be changed here. Please reply to your confirmation email or call the firm.";
/** BR-9 (AG-4-37 rule 5): the limit's sentence with the hours and the firm's phone; the server's own with no phone. */
const limitText = (b: Answer) => b.firm.phone
  ? `It is less than ${hours(b.selfServiceLimitHours)} before your meeting. Please reply to this email or call us on ${b.firm.phone}.` : SOON;
const hours = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? "hour" : "hours"}`;
type Answer = z.infer<typeof Answer>;
const big = "min-h-11 min-w-11";
/** The token from the fragment; one far longer than any token FO-3 makes is a bad link, never sent (break m5). */
const tokenOf = () => { try { const t = decodeURIComponent(window.location.hash.slice(1)).trim(); return t.length > 400 ? "" : t; } catch { return ""; } };
/** The reason as CancelBody (service.ts) takes it: a tab → a space; control, bidi, invisible and broken UTF-16 dropped (break M1). */
const cleanReason = (v: string) => v.replace(/\t/g, " ")
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\u200b\u200e\u200f\u061c\ufeff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "").trim();
/** No answer (status 0): read again; a dead link means the change was made, so "check the email", never "try again" (break M2). */
async function afterLoss(p: Problem, token: string): Promise<Problem> {
  if (p.status !== 0) return p;
  try { await publicCall(path(token), View); return p; } catch (x) { return asProblem(x).status === 404 ? { ...p, slug: "lost" } : p; }
}
const LOST = "We could not confirm your change. Please check your latest email from the firm.";
const asProblem = (x: unknown): Problem => x && typeof x === "object" && !(x instanceof Error) && "issues" in x ? x as Problem : { status: 0, issues: [], slots: [] };
const path = (token: string, rest = "") => `bookings/${encodeURIComponent(token)}${rest}`;

/** What a refused change says (BR-8..BR-10, BR-6): a bad link, inside the limit, not allowed here, too many, taken. */
type Notice = { kind: "bad" | "closed" | "off" | "taken" | "error" | "lost"; text: string };
function noticeOf(p: Problem, b: Answer): Notice {
  if (p.slug === "lost") return { kind: "lost", text: LOST };
  if (p.status === 404) return { kind: "bad", text: BAD_LINK };
  if (p.slug === "too-close-to-meeting") return { kind: "closed", text: limitText(b) };
  if (p.slug === "not-allowed-by-link") return { kind: "off", text: NOT_ONLINE };
  if (p.slug === "slot-taken") return { kind: "taken", text: "This time was just booked." };
  if (p.status === 429) return { kind: "error", text: TRY_LATER };
  return { kind: "error", text: p.detail ?? "We could not make this change. Please try again." };
}

export function BookingManagePage() {
  // A link opened into this tab (only the # changes, so no page load) reads the booking again, even its first token.
  const [{ token, n }, setOpened] = React.useState(() => ({ token: tokenOf(), n: 0 }));
  React.useEffect(() => { const on = () => setOpened((o) => ({ token: tokenOf(), n: o.n + 1 })); window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  const q = useQuery({ queryKey: ["public-manage", token, n], enabled: !!token, retry: false, staleTime: Infinity, refetchOnWindowFocus: false, gcTime: 0,
    queryFn: () => publicCall(path(token), View) });
  if (!token) return <BadLink />;
  if (!q.isPending && (q.error as Problem | null)?.status === 404) return <BadLink />;
  // Keyed on the opened token: a move's new token lives in Manage and the address (replaceState fires no hashchange).
  return <Gate pending={q.isPending} error={q.error}>{() => <Manage key={`${n}:${token}`} first={q.data!} opened={token} />}</Gate>;
}

function BadLink() {
  return <PublicFrame title="Your booking"><h1 className="text-xl font-semibold" data-public-state="bad-link">{BAD_LINK}</h1></PublicFrame>;
}

function Manage({ first, opened }: { first: View; opened: string }) {
  const [token, setToken] = React.useState(opened);
  /** The new token takes the old one's place in the address (no new history entry: Back never reopens a dead link). */
  const onToken = (t: string) => { window.history.replaceState(window.history.state, "", `${window.location.pathname}#${t}`); setToken(t); };
  const [b, setB] = React.useState<Answer>(first);
  const [done, setDone] = React.useState<"moved" | "cancelled" | null>(null);
  const [notice, setNotice] = React.useState<Notice | null>(first.canChange ? null : { kind: "closed", text: first.firm.phone ? limitText(first) : first.message ?? SOON });
  const [step, setStep] = React.useState<"view" | "move">("view");
  const h = React.useRef<HTMLHeadingElement>(null);
  // After the first draw, every change of step, state or notice puts focus on the heading, never on the page body (break m1).
  const drawn = React.useRef(false);
  React.useEffect(() => { if (drawn.current) h.current?.focus(); drawn.current = true; }, [done, step, notice]);
  const shut = notice?.kind === "bad" || notice?.kind === "closed" || notice?.kind === "lost" || done === "cancelled";
  const canMove = !shut && b.allowReschedule && (done === "moved" || first.canReschedule);
  const canCancel = !shut && b.allowCancel && (done === "moved" || first.canCancel);
  const offline = !shut && first.canChange && (!b.allowReschedule || !b.allowCancel);
  const minutes = Math.round((Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60_000);
  if (notice?.kind === "bad") return <BadLink />;
  return (
    <PublicFrame firm={b.firm.name} title={`Your booking · ${b.firm.name}`}>
      <section aria-labelledby="fo3w-manage" className="max-w-lg" data-public-state={done ?? "manage"}>
        <h1 id="fo3w-manage" ref={h} tabIndex={-1} className={cn("text-2xl font-semibold outline-none", done === "cancelled" && "text-text-ok")}>
          {done === "cancelled" ? CANCELLED : step === "move" ? "Choose a new time" : "Your booking"}
        </h1>
        {done === "moved" ? <p role="status" className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-sm text-text-ok" data-updated>{UPDATED}</p> : null}
        {done === "cancelled" ? null : <>
          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border bg-surface-raised p-5 text-sm" data-booking-card>
            <p className="font-semibold [overflow-wrap:anywhere]" data-when>Your booking: {whenWords(new Date(b.startsAt), b.timeZone)}, with <bdi>{b.firm.name}</bdi>.</p>
            <p className="[overflow-wrap:anywhere]"><bdi>{b.typeName}</bdi>, {minutes} minutes, {MODE_WORDS[b.mode]}</p>
            {notice && notice.kind !== "taken" ? <p role="alert" data-notice={notice.kind} className="mt-1">{notice.text}</p> : null}
            {offline ? <p data-notice="off" className="mt-1 text-text-muted">{NOT_ONLINE}</p> : null}
            {step === "view" && (canMove || canCancel) ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {canMove ? <Button size="lg" className="h-11" onClick={() => { setNotice(null); setStep("move"); }}>Reschedule</Button> : null}
                {canCancel ? <CancelDialog token={token} b={b} onDone={(a) => { setB(a); setDone("cancelled"); }} onRefused={(p) => setNotice(noticeOf(p, b))} /> : null}
              </div>
            ) : null}
          </div>
          {step === "move" && canMove ? <Move token={token} b={b} notice={notice?.kind === "taken" ? notice : null}
            onBack={() => { setNotice(null); setStep("view"); }}
            onMoved={(a) => {
              const { manageToken, ...rest } = a;
              // A move into the self-service window leaves no change by link (break m8): the limit sentence, no buttons.
              const late = Date.now() >= Date.parse(rest.startsAt) - rest.selfServiceLimitHours * 3_600_000;
              setB(rest); setNotice(late ? { kind: "closed", text: limitText(rest) } : null); setDone("moved"); setStep("view"); onToken(manageToken);
            }}
            onRefused={(p) => { const n = noticeOf(p, b); setNotice(n); if (n.kind !== "taken" && n.kind !== "error") setStep("view"); }} /> : null}
        </>}
      </section>
    </PublicFrame>
  );
}

function Move({ token, b, notice, onBack, onMoved, onRefused }: { token: string; b: Answer; notice: Notice | null; onBack: () => void; onMoved: (a: z.infer<typeof Moved>) => void; onRefused: (p: Problem) => void }) {
  const zone = b.timeZone;
  const q = useQuery({ queryKey: ["public-manage-slots", token], retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false,
    queryFn: () => publicCall(path(token, `/slots?tz=${encodeURIComponent(zone)}`), MoveSlots) });
  const [pick, setPick] = React.useState<Slot | null>(null);
  const [busy, setBusy] = React.useState(false);
  const sending = React.useRef(false);
  React.useEffect(() => { if (q.error) onRefused(asProblem(q.error)); }, [q.error]);   // eslint-disable-line react-hooks/exhaustive-deps
  const byDay = React.useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of q.data?.slots ?? []) { if (s.startsAt === b.startsAt) continue; const k = dayKey(new Date(s.startsAt), zone); m.set(k, [...(m.get(k) ?? []), s]); }
    return [...m.entries()];
  }, [q.data, zone, b.startsAt]);
  const move = async () => {
    if (!pick || sending.current) return;   // a double click moves once
    sending.current = true; setBusy(true);
    try { onMoved(await publicCall(path(token, "/reschedule"), Moved, { method: "POST", body: JSON.stringify({ startsAt: pick.startsAt, timeZone: zone }) })); }
    catch (x) { const p = await afterLoss(asProblem(x), token); setPick(null); if (p.slug === "slot-taken") await q.refetch(); onRefused(p); }
    finally { sending.current = false; setBusy(false); }
  };
  return (
    <div className="mt-5" data-move>
      <p className="text-sm text-text-muted">Times shown in <span className="font-medium text-text">{zone}</span></p>
      {notice ? <div role="alert" data-notice="taken" className="mt-3 rounded-lg border border-border border-l-4 border-l-danger bg-surface-raised px-4 py-3 text-sm"><p className="font-semibold">{notice.text}</p><p className="mt-0.5">Please choose another time.</p></div> : null}
      {q.isPending ? <div className="mt-3 flex flex-col gap-2" data-loading><Skeleton className="h-6 w-40" /><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div>
        : q.error ? null
          : byDay.length ? (
            <div className="mt-3 flex flex-col gap-4" role="radiogroup" aria-label="Choose a new time">
              {byDay.map(([k, list]) => (
                <div key={k}>
                  <h2 className="text-base font-semibold">{dayWords(new Date(list[0].startsAt), zone)}</h2>
                  <ul className="mt-2 flex flex-wrap gap-2">{list.map((s) => (
                    <li key={s.startsAt}><button type="button" role="radio" aria-checked={pick?.startsAt === s.startsAt} aria-label={whenWords(new Date(s.startsAt), zone)} onClick={() => setPick(s)}
                      className={cn(big, "scroll-mb-28 rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", pick?.startsAt === s.startsAt ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border")}>{hhmm(new Date(s.startsAt), zone)}</button></li>
                  ))}</ul>
                </div>
              ))}
            </div>
          ) : <p data-public-state="no-times" className="mt-3 text-sm">No free times in the next two weeks. Please reply to your confirmation email.</p>}
      <div data-move-bar className="sticky bottom-0 mt-5 flex flex-wrap gap-2 border-t border-border bg-surface py-3">
        <Button size="lg" className="h-11" disabled={!pick} busy={busy} onClick={move}>Move to this time</Button>
        <Button size="lg" variant="outline" className="h-11" onClick={onBack}>Back</Button>
      </div>
    </div>
  );
}

function CancelDialog({ token, b, onDone, onRefused }: { token: string; b: Answer; onDone: (a: Answer) => void; onRefused: (p: Problem) => void }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [bad, setBad] = React.useState<string | null>(null);
  const sending = React.useRef(false);
  const cancel = async () => {
    if (sending.current) return;
    sending.current = true; setBusy(true);
    try {
      const r = cleanReason(reason);
      const a = await publicCall(path(token, "/cancel"), Answer, { method: "POST", body: JSON.stringify(r ? { reason: r } : {}) });
      setOpen(false); onDone(a);
    } catch (x) {
      const p = await afterLoss(asProblem(x), token);
      // A refused reason stays in the dialog, on its field (break M1); anything else closes it and shows on the page.
      if (p.status === 422) setBad(p.detail ?? "Please check the reason.");   // a field error (PF-28 part 4: 422, no longer 400)
      else { setOpen(false); onRefused(p); }
    }
    finally { sending.current = false; setBusy(false); }
  };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
      <DialogPrimitive.Trigger asChild><Button size="lg" variant="outline" className="h-11">Cancel</Button></DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface-raised p-5 shadow-xl outline-none">
          <DialogPrimitive.Title className="text-base font-semibold">Cancel this booking?</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 text-sm text-text-muted [overflow-wrap:anywhere]">{whenWords(new Date(b.startsAt), b.timeZone)}, with <bdi>{b.firm.name}</bdi>.</DialogPrimitive.Description>
          <form className="mt-4 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void cancel(); }}>
            <Field label="Reason (optional)" error={bad}>
              <textarea value={reason} onChange={(e) => { setReason(e.target.value); setBad(null); }} maxLength={500} rows={3}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <DialogPrimitive.Close asChild><Button type="button" size="lg" variant="outline" className="h-11" disabled={busy}>Keep booking</Button></DialogPrimitive.Close>
              <Button type="submit" size="lg" variant="destructive" className="h-11" busy={busy}>Cancel booking</Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
