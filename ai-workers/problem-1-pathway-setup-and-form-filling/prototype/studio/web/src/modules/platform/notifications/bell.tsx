// PF-18ns (concept screens/PF-18ns r2 §3-§5; R1.50): the bell in the staff frames (PF-6's PlatformFrame and FO-4's SalesFrame,
// Lead 10 on #3279 Q1) and the panel it opens. The bell is a button named with the unread count (BR-4: never colour alone);
// the count is refreshed on every navigation and every 60 s while the tab is visible (BR-3), and announced to screen readers
// once per change (BR-8: contract.ts keeps the last announced count per tab, so a page change or a poll says nothing new).
// The panel is the app's right Panel (its focus trap and focus return, challenge m5), with the newest 20, "Mark all read"
// (only up to the newest shown, BR-6), "See all" and "Choose what you get" (BR-9). Opening a row marks it read with the time
// it showed (BR-5, Home's flow: a failed mark still opens; a new-tab open is marked too). A 401 or 428 (terms pending: the
// sales frame has no terms gate) shows no bell (challenge m1).
import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button, Notice, Panel } from "@/components/ui/controls";
import { useTabActive } from "@/components/workspace";
import { Skeleton } from "@/components/ui/skeleton";
import { staffApi, StaffApiError } from "../session";
import { announcementFor, badgeOf, bellName, COPY, NotificationList, pageless, PANEL_SIZE, POLL_MS, timeWords, UnreadCount, whatOf, zoneLine, type NotificationItem } from "./contract";

export const NOTIFICATIONS_KEY = ["pf", "notifications"] as const;
const markRead = (i: NotificationItem) => staffApi<{ readAt: string | null }>(`/platform/me/notifications/${encodeURIComponent(i.id)}/read?seen=${encodeURIComponent(i.createdAt)}`, { method: "POST" });

/** After any mark: the bell, the lists and Home's Needs you read again (challenge m3). */
export function useRefreshAfterMark() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }), qc.invalidateQueries({ queryKey: ["pf", "home", "needs-you"] })]);
}

/** Where focus goes after a mark (round 3, WCAG 2.4.3): the marked row if it is still listed; else the row now in its place
 *  (the next), else the previous; else the list's empty line. Waits for the list's fresh answer, so a row about to leave
 *  is never the target. `row(id, index)` after a row's mark; `all()` after Mark all read (the first row, or the empty line). */
export function useListFocus(items: NotificationItem[] | undefined, settled: boolean) {
  const list = React.useRef<HTMLUListElement>(null), empty = React.useRef<HTMLParagraphElement>(null);
  const want = React.useRef<{ id?: string; index: number } | null>(null);
  const [, setTick] = React.useState(0);   // a render that tries the focus again
  React.useEffect(() => {
    const w = want.current;
    if (!w || !settled || !items) return;
    let target: HTMLElement | null;
    if (!items.length) target = empty.current;
    else { const at = w.id ? items.findIndex((i) => i.id === w.id) : -1; const i = at >= 0 ? at : Math.min(w.index, items.length - 1); target = list.current?.querySelector<HTMLElement>(`[data-notification="${items[i]!.id}"]`) ?? list.current; }
    if (!target) return;   // not drawn yet: the next render tries again
    want.current = null;
    target.focus();
  });
  return {
    list, empty,
    row: (id: string, index: number) => { want.current = { id, index }; setTick((t) => t + 1); },
    all: () => { want.current = { index: 0 }; setTick((t) => t + 1); },
  };
}

/** One notification: what, the record, when; unread marked by a dot and the word; opens its page, or offers Mark read. */
export function NotificationRow({ item, zone, onOpened, onMarked }: { item: NotificationItem; zone: string; /** After a row is opened (the panel closes). */ onOpened?: () => void;
  /** After Mark read succeeds: the list moves focus (useListFocus), as the row may leave it (break M1). */ onMarked?: () => void }) {
  const navigate = useNavigate(), refresh = useRefreshAfterMark();
  const [busy, setBusy] = React.useState(false), [failed, setFailed] = React.useState(false);
  const unread = item.readAt === null, li = React.useRef<HTMLLIElement>(null), markBtn = React.useRef<HTMLButtonElement>(null);
  const backToMark = React.useRef(false);
  // A failed mark: the row stays, says so, and focus goes back to its Mark read (round 3, review m3) once it is enabled again.
  React.useEffect(() => { if (!busy && backToMark.current) { backToMark.current = false; markBtn.current?.focus(); } }, [busy]);
  const mark = async () => {
    setBusy(true); setFailed(false);
    try { await markRead(item); await refresh(); if (onMarked) onMarked(); else requestAnimationFrame(() => li.current?.focus()); }
    catch { setFailed(true); backToMark.current = true; } finally { setBusy(false); }
  };
  const open = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) { void markRead(item).then(refresh, () => undefined); return; }   // a new tab: marked too, the browser opens it
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try { if (unread) await markRead(item); } catch { /* a failed mark still opens (Home's flow); the row stays unread */ }
    void refresh(); setBusy(false); onOpened?.(); navigate(item.link!);
  };
  // The record's number stays on one line at 375 px: "(L‑00007)" with a non-breaking hyphen (the walk at 375).
  // A long name wraps (never cut: the number at its end must stay readable); its full text is in `title` (review m5, break m6).
  const record = item.label ? <span className="[overflow-wrap:anywhere]" title={item.label}>{item.label.replace(/\(([A-Z]{1,4})-(\d+)\)$/, "($1\u2011$2)")}</span> : null;
  const when = timeWords(item.createdAt, zone);
  return (
    <li ref={li} tabIndex={-1} data-notification={item.id} data-unread={unread || undefined} className="flex gap-3 border-t border-border py-3 outline-none first:border-t-0 focus-visible:ring-[3px] focus-visible:ring-ring/50">
      <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${unread ? "bg-primary" : "bg-transparent"}`} />
      <div className="min-w-0 flex-1">
        {item.link
          ? <a href={item.link} onClick={(e) => void open(e)} onAuxClick={(e) => { if (e.button === 1) void markRead(item).then(refresh, () => undefined); }} aria-disabled={busy || undefined}
              className="font-medium text-text-link underline-offset-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50" data-notification-open>
              {item.label ? <>{whatWords(item)} · {record}</> : whatWords(item)}{unread ? <span className="sr-only"> (unread)</span> : null}</a>
          : <span className="font-medium text-text" data-notification-unlinked>{whatWords(item)}{record ? <> · {record}</> : null}</span>}
        <p className="text-sm text-text-muted">{when}{unread ? <> · <span data-notification-unread>{COPY.unread}</span></> : null}
          {!item.link && !pageless(item) ? <> · {COPY.gone}</> : null}</p>
        {failed ? <p role="alert" className="text-sm text-text-danger">{COPY.markFailed}</p> : null}
      </div>
      {!item.link && unread ? <Button ref={markBtn} variant="outline" size="sm" className="self-start" busy={busy} onClick={() => void mark()} aria-label={`${COPY.markRead}: ${whatWords(item)}${item.label ? `, ${item.label}` : ""}, ${when}`} data-notification-mark>{COPY.markRead}</Button> : null}
    </li>
  );
}
const whatWords = (i: NotificationItem) => whatOf(i.kind);

/** "Mark all read" up to the newest row this list showed (BR-6: a notice that came after stays unread). */
export function useMarkAll(newest: string | undefined, /** Moves focus after (the button turns disabled: break M1): useListFocus's `all`. */ focusAfter?: () => void) {
  const refresh = useRefreshAfterMark();
  const [busy, setBusy] = React.useState(false), [failed, setFailed] = React.useState(false);
  const run = async () => {
    setBusy(true); setFailed(false);
    try { await staffApi(`/platform/me/notifications/read-all${newest ? `?seen=${encodeURIComponent(newest)}` : ""}`, { method: "POST" }); await refresh(); focusAfter?.(); } catch { setFailed(true); } finally { setBusy(false); }
  };
  return { run, busy, failed };
}

function BellPanel({ open, onOpenChange, returnFocus, onOpen }: { open: boolean; onOpenChange: (o: boolean) => void; returnFocus: () => HTMLElement | null; /** The bell reads its count again (break m2). */ onOpen: () => void }) {
  const q = useQuery({ queryKey: [...NOTIFICATIONS_KEY, "panel"], enabled: open, staleTime: 0, queryFn: async () => NotificationList.parse(await staffApi(`/platform/me/notifications/items?size=${PANEL_SIZE}`)) });
  React.useEffect(() => { if (open) onOpen(); }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps -- on opening only
  const focus = useListFocus(q.data?.items, !q.isFetching);
  const all = useMarkAll(q.data?.items[0]?.createdAt, focus.all);
  const anyUnread = !!q.data?.items.some((i) => i.readAt === null);   // Mark all read follows the rows shown, not the bell (review m1, break m2)
  return (
    <Panel open={open} onOpenChange={onOpenChange} returnFocus={returnFocus} title={COPY.title} description={q.data ? zoneLine(q.data.zone) : undefined} bodyLabel="Your notifications"
      footer={<><Link to="/account/notifications/all" className="text-sm font-medium text-text-link underline-offset-2 hover:underline" onClick={() => onOpenChange(false)} data-notifications-see-all>{COPY.seeAll}</Link>
        <Link to="/account/notifications" className="text-sm text-text-link underline-offset-2 hover:underline" onClick={() => onOpenChange(false)} data-notifications-choose>{COPY.choose}</Link></>}>
      <div data-notifications-panel>
        <div className="mb-2 flex justify-end">
          <Button variant="ghost" size="sm" busy={all.busy} disabled={!anyUnread} onClick={() => void all.run()} data-notifications-mark-all>{COPY.markAll}</Button>
        </div>
        {all.failed ? <Notice tone="danger" title={COPY.markFailed} /> : null}
        {q.isPending ? <Loading />
          : q.isError ? <Notice tone="danger" title={COPY.loadFailed} action={<Button variant="outline" size="sm" onClick={() => void q.refetch()}>{COPY.retry}</Button>} />
            : !q.data.items.length ? <p ref={focus.empty} tabIndex={-1} className="text-sm text-text-muted outline-none" data-notifications-empty>{COPY.empty}</p>
              : <ul ref={focus.list} tabIndex={-1} aria-label={COPY.title} className="outline-none">{q.data.items.map((i, n) => <NotificationRow key={i.id} item={i} zone={q.data.zone} onOpened={() => onOpenChange(false)} onMarked={() => focus.row(i.id, n)} />)}</ul>}
      </div>
    </Panel>
  );
}

/** Three skeleton rows while a list loads, and the words for screen readers (review m2). */
export function Loading() {
  return <div role="status" className="flex flex-col gap-3 py-3"><span className="sr-only">{COPY.loading}</span>{[0, 1, 2].map((k) => <div key={k} className="flex gap-3"><Skeleton className="mt-1.5 size-2 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/3" /></div></div>)}</div>;
}

/** The bell in a staff frame's header. */
export function NotificationBell() {
  const loc = useLocation();
  // staleTime 0: each page mounts its own bell, so a page change reads the count again however recent the last read (review m1).
  const q = useQuery({ queryKey: [...NOTIFICATIONS_KEY, "unread"], retry: false, staleTime: 0, refetchOnMount: "always", refetchInterval: POLL_MS, refetchIntervalInBackground: false, queryFn: async () => UnreadCount.parse(await staffApi("/platform/me/notifications/unread-count")) });
  // BR-3: on every navigation inside the app, the count is read again.
  const first = React.useRef(true);
  React.useEffect(() => { if (first.current) { first.current = false; return; } void q.refetch(); }, [loc.key]);   // eslint-disable-line react-hooks/exhaustive-deps -- on each navigation only
  const [open, setOpen] = React.useState(false), btn = React.useRef<HTMLButtonElement>(null);
  const [said, setSaid] = React.useState("");
  const n = q.data?.unread;
  // PF-31 (review on 91cb4a742): with several workspace tabs open each has its own bell; only the shown tab's bell speaks,
  // and a hidden one keeps its live region empty, so a change is said once, where the person is.
  const shown = useTabActive();
  React.useEffect(() => { if (!shown) { setSaid(""); return; } if (n === undefined) return; const words = announcementFor(n); if (words) setSaid(words); }, [n, shown]);
  if (q.error instanceof StaffApiError && (q.error.status === 401 || q.error.status === 428 || q.error.status === 402)) return null;
  const count = n ?? 0, badge = badgeOf(count), name = bellName(q.isError ? null : count);   // a failed count is said as such (review m4)
  return (
    <>
      <Button ref={btn} variant="ghost" size="sm" className="relative" aria-label={name} title={name} onClick={() => setOpen(true)} data-notifications-bell data-unread-count={count}>
        <Bell aria-hidden className="size-4" />
        {badge ? <span aria-hidden className="absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-primary px-1 text-center text-[11px] font-semibold leading-5 text-primary-foreground" data-notifications-badge>{badge}</span> : null}
      </Button>
      <span role="status" aria-live="polite" className="sr-only" data-notifications-live>{said}</span>
      <BellPanel open={open} onOpenChange={setOpen} returnFocus={() => btn.current} onOpen={() => void q.refetch()} />
    </>
  );
}
