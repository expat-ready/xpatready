// FO-3st1 part 1 (concept fo-3-booking r2 §4 "Booking detail", §5; BR-14; AG-4-39; J-S1, J-S4): one booking in the
// team's right-hand panel, read from FO-3a part 2b's `feed/:id` (its host, or the list key and the record rule; else
// the one not-found). When (the office zone and the booker's), Who, Attendance; Reschedule and Cancel booking under
// "More". Buttons show only where the feed says the viewer may (`canAnswerAttendance`, `canEdit`). Part 2 adds the
// consult record and the next step.
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Notice, Panel, Pill } from "@/components/ui/controls";
import { staffApi, StaffApiError } from "@/modules/platform/session";
import { FeedItem, hhmm, longWhen, MODE_WORDS, personOf, STATUS } from "./contract";
import { bookingWrite, TimeChooser, useBookAnyway } from "./new-booking";

/** "Attended" / "No-show": one click, by a person; it can be changed later (AG-4-39 rules 3-5). */
export function AttendanceButtons({ booking }: { booking: FeedItem }) {
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState<string | null>(null), [error, setError] = React.useState<string | null>(null);
  const answer = async (outcome: "COMPLETED" | "NO_SHOW") => {
    setBusy(outcome); setError(null);
    try { await staffApi(`/front-office/bookings/${booking.id}/attendance`, { method: "POST", json: { outcome } }); await qc.invalidateQueries({ queryKey: ["fo", "bookings"] }); }
    catch (e) { setError(e instanceof StaffApiError && e.status === 403 ? "You do not have permission to do this. Ask an Owner or Admin." : e instanceof Error ? e.message : "Not saved. Please try again."); }
    finally { setBusy(null); }
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2" data-attendance={booking.id}>
      <Button size="sm" variant={booking.attendance === "COMPLETED" ? "default" : "outline"} aria-pressed={booking.attendance === "COMPLETED"} busy={busy === "COMPLETED"} onClick={() => void answer("COMPLETED")}>Attended</Button>
      <Button size="sm" variant={booking.attendance === "NO_SHOW" ? "default" : "outline"} aria-pressed={booking.attendance === "NO_SHOW"} busy={busy === "NO_SHOW"} onClick={() => void answer("NO_SHOW")}>No-show</Button>
      {error ? <span role="alert" className="text-sm text-text-danger">{error}</span> : null}
    </span>
  );
}

export function BookingPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["fo", "bookings", "one", id], retry: false, queryFn: async () => FeedItem.parse(await staffApi(`/front-office/bookings/feed/${id}`)) });
  const [dialog, setDialog] = React.useState<"move" | "cancel" | null>(null);
  const [menu, setMenu] = React.useState(false);
  const b = q.data;
  const s = b ? STATUS[b.status] : null;
  const who = b ? personOf(b) : "";
  return (
    <Panel open onOpenChange={(o) => { if (!o) onClose(); }} title={b ? `${who} · ${b.type.name}` : "Booking"} bodyLabel="Booking details"
      badge={b && s ? <Pill tone={s.tone} title={s.tip(who)}>{s.label}</Pill> : null}
      footer={<><Button variant="outline" onClick={onClose}>Close</Button>
        {b?.canEdit ? (
          <span className="relative">
            <Button variant="outline" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)} data-more-menu>More</Button>
            {menu ? (
              <span role="menu" className="absolute bottom-full right-0 mb-1 flex w-48 flex-col rounded-lg border border-border bg-surface-raised p-1 shadow-lg" onKeyDown={(e) => { if (e.key === "Escape") setMenu(false); }}>
                <button role="menuitem" autoFocus className="rounded px-3 py-2 text-left text-sm hover:bg-text/5 focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none" onClick={() => { setMenu(false); setDialog("move"); }}>Reschedule</button>
                <button role="menuitem" className="rounded px-3 py-2 text-left text-sm hover:bg-text/5 focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none" onClick={() => { setMenu(false); setDialog("cancel"); }}>Cancel booking</button>
              </span>
            ) : null}
          </span>
        ) : null}</>}>
      {q.isPending ? <p role="status" className="text-sm text-text-muted">Loading the booking…</p>
        : q.isError ? <Notice tone="danger" title={q.error instanceof StaffApiError && q.error.status === 404 ? "This booking is not available." : "Could not load the booking."}>{q.error instanceof StaffApiError && q.error.status === 404 ? "It may have been moved to someone else, or you may not see it." : q.error.message}</Notice>
          : b ? (
            <div className="flex flex-col gap-4 text-sm" data-booking-detail={b.id}>
              {!b.canEdit && !b.canAnswerAttendance && (b.status === "SCHEDULED" || b.status === "RESCHEDULED") ? <Notice tone="info">You can view bookings but not change them.</Notice> : null}
              <section aria-labelledby="fo-when"><h3 id="fo-when" className="font-semibold">When</h3>
                <p data-when>{longWhen(b.startsAt, b.officeTimeZone)}–{hhmm(b.endsAt, b.officeTimeZone)} {b.officeTimeZone} · {hhmm(b.startsAt, b.bookerTimeZone)} for {who} ({b.bookerTimeZone})</p></section>
              <section aria-labelledby="fo-who" className="border-t border-border pt-3"><h3 id="fo-who" className="font-semibold">Who</h3>
                <p>{who}{b.person?.email ? ` · ${b.person.email}` : ""} · Host: {b.host.name} · {MODE_WORDS[b.mode] ?? b.mode}</p>
                {b.hangsOn ? <p className="text-text-muted">On {b.hangsOn.kind} {b.hangsOn.name}</p> : null}
                {b.outsideHours ? <p className="text-text-warn" data-outside-hours>Outside {b.host.name}'s hours</p> : null}</section>
              {b.canAnswerAttendance ? (
                <section aria-labelledby="fo-att" className="border-t border-border pt-3"><h3 id="fo-att" className="font-semibold">Attendance</h3>
                  <p className="mb-2"><b>Did {who} attend?</b></p><AttendanceButtons booking={b} /></section>
              ) : null}
            </div>
          ) : null}
      {b && dialog === "move" ? <MoveDialog b={b} onClose={() => setDialog(null)} /> : null}
      {b && dialog === "cancel" ? <CancelDialog b={b} onClose={() => setDialog(null)} /> : null}
    </Panel>
  );
}

function MoveDialog({ b, onClose }: { b: FeedItem; onClose: () => void }) {
  const [at, setAt] = React.useState<string | null>(null);
  const write = useBookAnyway((extra) => bookingWrite(`/front-office/bookings/${b.id}/reschedule`, { startsAt: at, ...extra }), onClose);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title="Move this booking" description={`Free times for ${b.host.name}`}
      footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button disabled={!at || write.asking} busy={write.busy && !write.asking} onClick={() => void write.go(false)} data-move>Move</Button></>}>
      <TimeChooser typeId={b.type.id} zone={b.officeTimeZone} value={at} onChange={setAt} />
      {write.ask}
      {write.error ? <Notice tone="danger" title="Not moved" className="mt-3">{write.error}</Notice> : null}
    </Dialog>
  );
}

function CancelDialog({ b, onClose }: { b: FeedItem; onClose: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState<string | null>(null);
  const who = personOf(b);
  const go = async () => {
    setBusy(true); setError(null);
    try { await staffApi(`/front-office/bookings/${b.id}/cancel`, { method: "POST" }); await qc.invalidateQueries({ queryKey: ["fo", "bookings"] }); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Not cancelled. Please try again."); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={`Cancel ${who}'s booking?`} description={`${who} gets a cancellation email.`}
      footer={<><Button variant="outline" onClick={onClose}>Keep booking</Button><Button variant="destructive" busy={busy} onClick={() => void go()} data-cancel-booking>Cancel booking</Button></>}>
      <p className="text-sm">{longWhen(b.startsAt, b.officeTimeZone)} {b.officeTimeZone}</p>
      {error ? <Notice tone="danger" title="Not cancelled" className="mt-3">{error}</Notice> : null}
    </Dialog>
  );
}
