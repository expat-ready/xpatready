// FO-3st1 part 1 (concept fo-3-booking r2 §4 "Staff calendar", §5, §6 J-S1, J-S2, J-S4, J-S9; BR-14; AG-4-67): the
// Bookings area's Calendar inside PF-6's PlatformFrame. Day · Week (Monday first, seven days) · List, on our own grid (no
// calendar library); Mine / Team only with agent/booking:list; a host filter; times in the office zone, named. Same-time
// blocks sit one under another in their cell (side by side read "C…" at 1024 px: break M8), up to three, then "+<n> more" opens List for that hour, so no block ever covers another. "Did
// <person> attend?" is pinned above only where the feed says `attendanceDue` (the viewer's own, end + 30 min). The view,
// whose, day, host and hour are kept in the address, so Back returns to them. A person without the list key has no
// Bookings menu and opens their own booking by its link (Q4). Every rule shown is the feed's answer (STANDARDS §7).
// QA-743 (R1.39): the feed's time-off periods are drawn too, in office time: a "Time off" row above the hours and
// shaded hours in Week and Day, a row in List. Words from the feed ("Time off", a colleague's "Not available"); plain
// text, never a button, so nothing opens as a booking.
import * as React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Notice, Pill, Table } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { Loading } from "@/modules/front-office/sales/loading";
import { PlatformFrame, usePlatformStaff } from "@/modules/platform/frame";
import { BOOKINGS_AREA } from "../area";
import { staffApi } from "@/modules/platform/session";
import { addDays, CREATE_KEY, dayOf, Feed, hhmm, hourOf, LIST_KEY, longWhen, MODE_WORDS, mondayOf, offInHour, offOn, personOf, shortDay, STATUS, type FeedItem, type TimeOff } from "./contract";
import { AttendanceButtons, BookingPanel } from "./detail-panel";
import { NewBookingDialog } from "./new-booking";

type View = "day" | "week" | "list";
const HOME = "/front-office/bookings";
/** A real calendar date ("2027-02-30" and "2027-13-45" are not; break M1), else null. */
const realDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s) ? s : null);
/** Below 768 px the week becomes a day (concept §4). */
function useNarrow() {
  const q = "(max-width: 767px)";
  const [narrow, set] = React.useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  React.useEffect(() => { const m = window.matchMedia(q); const on = () => set(m.matches); m.addEventListener("change", on); return () => m.removeEventListener("change", on); }, []);
  return narrow;
}

export function useFeed(whose: "mine" | "team", from: string, to: string, enabled = true) {
  return useQuery({ enabled, queryKey: ["fo", "bookings", "feed", whose, from, to], queryFn: async () => Feed.parse(await staffApi(`/front-office/bookings/feed?view=${whose}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)) });
}

export function BookingsPage() {
  const { id } = useParams();
  return <PlatformFrame area={BOOKINGS_AREA} crumbs={[{ label: "Calendar", to: HOME }]}><Calendar openId={id ?? null} /></PlatformFrame>;
}

function Calendar({ openId }: { openId: string | null }) {
  const me = usePlatformStaff();
  const lists = me.keys.includes(LIST_KEY);
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const narrow = useNarrow();
  const asked = (sp.get("view") as View) || "week";
  const view: View = asked === "week" && narrow ? "day" : (["day", "week", "list"] as View[]).includes(asked) ? asked : "week";
  const whose = sp.get("whose") === "mine" || !lists ? "mine" : "team";
  // The office's zone, from any answer of the feed (the pinned list below always loads); the browser's until then.
  const [zoneSeen, setZone] = React.useState("");
  // Today is the office's date, never the UTC one (review M4, break M9).
  const today = zoneSeen ? dayOf(Date.now(), zoneSeen) : dayOf(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  const date = realDate(sp.get("date")) ?? today;
  const host = sp.get("host") ?? "";
  const hourAsked = sp.get("hour");
  const hour = view === "list" && hourAsked && /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(hourAsked) && realDate(hourAsked.slice(0, 10)) ? hourAsked : null;   // break m1
  const set = (k: Record<string, string | null>) => { const n = new URLSearchParams(sp); for (const [a, b] of Object.entries(k)) b === null ? n.delete(a) : n.set(a, b); setSp(n); };
  const first = view === "day" ? date : mondayOf(date), days = view === "day" ? 1 : 7;
  const dates = Array.from({ length: days }, (_, i) => addDays(first, i));
  // A day either side, so every booking of those office-zone days is in the answer whatever the zone; filtered below.
  const feed = useFeed(whose, `${addDays(first, -1)}T00:00:00Z`, `${addDays(first, days + 1)}T00:00:00Z`, lists);
  // BR-14: the pinned questions are the viewer's own, whatever days are on screen (review M1, break M2): the last 60 days.
  const [[since, until]] = React.useState(() => [new Date(Date.now() - 60 * 86_400_000).toISOString(), new Date(Date.now() + 86_400_000).toISOString()]);   // fixed once: a key that moves never settles
  const pins = useFeed("mine", since, until, lists);
  const zone = feed.data?.officeTimeZone ?? pins.data?.officeTimeZone ?? "";
  React.useEffect(() => { if (zone && zone !== zoneSeen) setZone(zone); }, [zone, zoneSeen]);
  // Host names seen in any week, so a chosen host stays named when they have no bookings this week (break M7).
  const names = React.useRef(new Map<string, string>());
  for (const b of [...(feed.data?.items ?? []), ...(pins.data?.items ?? [])]) names.current.set(b.host.id, b.host.name);
  for (const o of feed.data?.timeOff ?? []) names.current.set(o.staff.id, o.staff.name);
  // QA-743: the time off touching the days (and the hour) on screen, for the chosen host.
  const offs = (feed.data?.timeOff ?? []).filter((o) => (!host || o.staff.id === host) && dates.some((d) => offOn(o, d, zone)) && (!hour || offInHour(o, hour.slice(0, 10), Number(hour.slice(11, 13)), zone)));   // break m5: never outside the days shown
  const shown = (feed.data?.items ?? []).filter((b) => b.status !== "CANCELLED" && b.status !== "EXPIRED" && dates.includes(dayOf(b.startsAt, zone)) && (!host || b.host.id === host)
    && (!hour || (view === "list" && dayOf(b.startsAt, zone) === hour.slice(0, 10) && hourOf(b.startsAt, zone) === Number(hour.slice(11, 13)))));
  const hosts = [...names.current.entries()].concat(host && !names.current.has(host) ? [[host, "The chosen host"]] : []).sort((a, b) => a[1].localeCompare(b[1]));
  const due = (pins.data?.items ?? []).filter((b) => b.attendanceDue);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const open = (b: FeedItem) => navigate({ pathname: `${HOME}/${b.id}`, search: sp.toString() });
  const close = () => navigate({ pathname: HOME, search: sp.toString() });
  // Focus goes back to the block or row that opened the panel (review m3).
  const back = () => document.querySelector<HTMLElement>(`[data-block="${openId}"], [data-row="${openId}"] button`);
  const step = (n: number) => set({ date: addDays(date, n * days), hour: null });
  const label = view === "day" ? shortDay(date) : `${shortDay(first)} – ${shortDay(addDays(first, 6))}`;
  if (!lists) {
    // Q4: no Bookings menu; their own booking opens by its link, with its attendance question.
    return (<>
      <h1 className="text-2xl font-semibold">Bookings</h1>
      {openId ? <p className="mt-1 text-sm text-text-muted">Your booking.</p> : <Notice tone="warn" className="mt-3" title="You do not have permission to do this. Ask an Owner or Admin.">Your own bookings open from their links.</Notice>}
      {openId ? <BookingPanel id={openId} onClose={close} onSaved={setSaved} /> : null}
      {saved ? <p role="status" className="mt-3 text-sm text-text-ok">{saved}</p> : null}
    </>);
  }
  return (
    <div data-bookings-calendar>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Bookings</h1><p className="mt-0.5 text-sm text-text-muted" data-zone-line>Your meetings and the team's. Times in {zone || "…"} (office).</p></div>
        {me.keys.includes(CREATE_KEY) ? <Button onClick={() => setCreating(true)} data-new-booking>New booking</Button> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Calendar">
        <Seg label="View" value={view} options={[["day", "Day"], ["week", "Week"], ["list", "List"]]} onChange={(v) => set({ view: v, hour: null })} />
        <Seg label="Whose" value={whose} options={[["mine", "Mine"], ["team", "Team"]]} onChange={(v) => set({ whose: v })} title="Mine: meetings you host. Team: every booking you may see." />
        <label className="text-sm"><span className="sr-only">Host</span>
          <select className="h-9 max-w-[16rem] truncate rounded-md border border-border bg-surface-raised px-2 text-sm" value={host} onChange={(e) => set({ host: e.target.value || null })} data-host-filter>
            <option value="">Host: anyone</option>{hosts.map(([hid, name]) => <option key={hid} value={hid}>{name}</option>)}
          </select></label>
        <Button variant="outline" size="sm" onClick={() => set({ date: null, hour: null })}>Today</Button>
        <Button variant="outline" size="sm" aria-label={view === "day" ? "Previous day" : "Previous week"} onClick={() => step(-1)}>‹</Button>
        <b className="text-sm" aria-live="polite" data-range>{label}</b>
        <Button variant="outline" size="sm" aria-label={view === "day" ? "Next day" : "Next week"} onClick={() => step(1)}>›</Button>
      </div>
      {due.map((b) => (
        <div key={b.id} role="status" title="Your own meetings only. Others' questions are on each booking." className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm" data-due={b.id}>
          <span><b>Did {personOf(b)} attend?</b> {b.type.name}, ended {hhmm(b.endsAt, b.officeTimeZone)}</span>
          <AttendanceButtons booking={b} />
        </div>
      ))}
      <div className="mt-3">
        {saved ? <p role="status" className="mb-2 text-sm text-text-ok" data-saved>{saved}</p> : null}
        {feed.isPending ? <Loading label="Loading bookings" rows={5} />
          : feed.isError ? <Notice tone="danger" title="Could not load the bookings." action={<Button size="sm" variant="outline" onClick={() => void feed.refetch()}>Try again</Button>}>{feed.error.message}</Notice>
            : view === "list" ? <List items={shown} offs={offs} dates={dates} zone={zone} open={open} hour={hour} clearHour={() => set({ hour: null })} />
              : <Grid dates={dates} items={shown} offs={offs} zone={zone} open={open} more={(d, h) => set({ view: "list", hour: `${d}T${String(h).padStart(2, "0")}` })} />}
      </div>
      {openId ? <BookingPanel id={openId} onClose={close} onSaved={setSaved} returnFocus={back} /> : null}
      {creating ? <NewBookingDialog zone={zone} hostNames={names.current} onClose={(done) => { setCreating(false); if (done) setSaved(done); }} /> : null}
    </div>
  );
}

function Seg<T extends string>({ label, value, options, onChange, title }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; title?: string }) {
  return (
    <div role="group" aria-label={label} title={title} className="inline-flex overflow-hidden rounded-md border border-border">
      {options.map(([v, l]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className={cn("min-h-9 px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", value === v ? "bg-primary/10 font-semibold text-text-link" : "bg-surface-raised text-text")}>{l}</button>)}
    </div>
  );
}

function Block({ b, zone, open }: { b: FeedItem; zone: string; open: (b: FeedItem) => void }) {
  const s = STATUS[b.status];
  return (
    <button type="button" onClick={() => open(b)} data-block={b.id} title={`${personOf(b)} · ${b.type.name} · Host: ${b.host.name} · ${hhmm(b.startsAt, zone)} ${zone} · ${hhmm(b.startsAt, b.bookerTimeZone)} for ${personOf(b)} (${b.bookerTimeZone})`}
      className={cn("block w-full min-w-0 truncate rounded border-l-[3px] px-1.5 py-0.5 text-left text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        b.status === "COMPLETED" ? "border-ok bg-ok/12" : b.status === "NO_SHOW" ? "border-text-muted bg-surface" : "border-primary bg-primary/10")}>
      {/* The row names the hour: the person first, the minutes only when not on the hour (three blocks share a cell). */}
      <span className="font-medium">{hhmm(b.startsAt, zone).endsWith(":00") ? "" : `${hhmm(b.startsAt, zone)} `}{personOf(b)}</span> · {b.type.name}{s.label !== "Scheduled" ? ` · ${s.label}` : ""}
    </button>
  );
}

/** Week or day: one row per office-zone hour that has a booking (at least 08:00-18:00), one column per day. */
const OFF_STYLE = "rounded border border-dashed border-border bg-surface px-1.5 py-0.5 text-xs";
/** "Time off" for the viewer's own, "<name>: not available" for a colleague's (the feed's words). */
const offWords = (o: TimeOff) => (o.mine ? o.label : `${o.staff.name}: ${o.label.toLowerCase()}`);

function Grid({ dates, items, offs, zone, open, more }: { dates: string[]; items: FeedItem[]; offs: TimeOff[]; zone: string; open: (b: FeedItem) => void; more: (date: string, hour: number) => void }) {
  if (!items.length && !offs.length) return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-muted" data-empty>No bookings this week. Share your booking page or click New booking.</p>;
  const hs = items.map((b) => hourOf(b.startsAt, zone));
  const rows = Array.from({ length: Math.max(18, ...hs) - Math.min(8, ...hs) + 1 }, (_, i) => Math.min(8, ...hs) + i);
  return (
    <div className="overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label="Bookings by day and hour" data-grid>
      <table className="w-full table-fixed border-collapse text-sm">
        <thead className="bg-surface text-xs"><tr><th className="w-14 border-b border-border p-1"><span className="sr-only">Time</span></th>{dates.map((d) => <th key={d} className="border-b border-l border-border p-1 text-left font-semibold">{shortDay(d)}</th>)}</tr></thead>
        <tbody>{offs.length ? (
          <tr data-off-row><th scope="row" className="border-t border-border p-1 text-left align-top text-xs font-normal text-text-muted">Time off</th>
            {dates.map((d) => (
              <td key={d} className="border-l border-t border-border p-0.5 align-top" data-off-day={d}>
                <div className="flex min-w-0 flex-col gap-0.5">{offs.map((o) => { const part = offOn(o, d, zone); return part ? <span key={o.id} className={cn(OFF_STYLE, "block whitespace-normal break-words")} data-off={o.id}><span className="font-medium">{offWords(o)}</span> · {part}</span> : null; })}</div>
              </td>
            ))}
          </tr>
        ) : null}{rows.map((h) => (
          <tr key={h}><th scope="row" className="border-t border-border p-1 text-left align-top text-xs font-normal text-text-muted">{String(h).padStart(2, "0")}:00</th>
            {dates.map((d) => {
              const here = items.filter((b) => dayOf(b.startsAt, zone) === d && hourOf(b.startsAt, zone) === h);
              return (
                <td key={d} className={cn("h-9 border-l border-t border-border p-0.5 align-top", offs.some((o) => offInHour(o, d, h, zone)) && "bg-text-muted/10")} data-off-hour={offs.some((o) => offInHour(o, d, h, zone)) || undefined} data-cell={`${d}T${String(h).padStart(2, "0")}`}>
                  {here.length ? <div className="flex min-w-0 flex-col gap-0.5">{here.slice(0, 3).map((b) => <Block key={b.id} b={b} zone={zone} open={open} />)}</div> : null}
                  {here.length > 3 ? <button type="button" onClick={() => more(d, h)} title={`${here.length - 3} more bookings at this time. Opens the list.`} className="text-xs text-text-link underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" data-more>+{here.length - 3} more</button> : null}
                </td>
              );
            })}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function List({ items, offs, dates, zone, open, hour, clearHour }: { items: FeedItem[]; offs: TimeOff[]; dates: string[]; zone: string; open: (b: FeedItem) => void; hour: string | null; clearHour: () => void }) {
  // QA-743: bookings and time off in one list, by start. A time off row is text only (nothing to open).
  const rows = [...items.map((b) => ({ at: b.startsAt, b, o: null as TimeOff | null })), ...offs.map((o) => ({ at: o.startsAt, b: null as FeedItem | null, o }))].sort((x, y) => x.at.localeCompare(y.at));
  const offWhen = (o: TimeOff) => dates.map((d) => [d, offOn(o, d, zone)] as const).filter(([, part]) => part).map(([d, part]) => `${shortDay(d)}, ${part}`).join("; ");
  return (<>
    {hour ? <p className="mb-2 text-sm">Bookings at {hour.slice(11, 13)}:00 on {shortDay(hour.slice(0, 10))}. <Button variant="link" size="sm" onClick={clearHour}>Show the whole week</Button></p> : null}
    {!rows.length ? <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-muted" data-empty>No bookings this week. Share your booking page or click New booking.</p> : (
      <Table head={[`When (${zone})`, "Person", "Booking type", "Host", "Way to meet", "Status"]} label="Bookings">
        {rows.map(({ b, o }) => o ? (
          <tr key={o.id} data-off-row={o.id}>
            <td>{offWhen(o)}</td><td>–</td><td>–</td><td>{o.staff.name}</td><td>–</td>
            <td><span className={OFF_STYLE}>{o.label}</span></td>
          </tr>
        ) : b ? (
          <tr key={b.id} data-row={b.id}>
            <td><button type="button" className="text-left text-text-link underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" onClick={() => open(b)}>{longWhen(b.startsAt, zone)}–{hhmm(b.endsAt, zone)}</button></td>
            <td>{personOf(b)}</td><td>{b.type.name}</td><td>{b.host.name}</td><td>{MODE_WORDS[b.mode] ?? b.mode}</td>
            <td><Pill tone={STATUS[b.status].tone} title={STATUS[b.status].tip(personOf(b), b.cancelledBy)}>{STATUS[b.status].label}</Pill></td>
          </tr>
        ) : null)}
      </Table>
    )}
  </>);
}
