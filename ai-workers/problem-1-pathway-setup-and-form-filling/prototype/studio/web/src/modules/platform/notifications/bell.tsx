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
import { staffApi, StaffApiError } from "../session";
import { announcementFor, badgeOf, bellName, COPY, NotificationList, pageless, PANEL_SIZE, POLL_MS, timeWords, UnreadCount, whatOf, zoneLine, type NotificationItem } from "./contract";

export const NOTIFICATIONS_KEY = ["pf", "notifications"] as const;
const markRead = (i: NotificationItem) => staffApi<{ readAt: string | null }>(`/platform/me/notifications/${encodeURIComponent(i.id)}/read?seen=${encodeURIComponent(i.createdAt)}`, { method: "POST" });

/** After any mark: the bell, the lists and Home's Needs you read again (challenge m3). */
export function useRefreshAfterMark() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }), qc.invalidateQueries({ queryKey: ["pf", "home", "needs-you"] })]);
}

/** One notification: what, the record, when; unread marked by a dot and the word; opens its page, or offers Mark read. */
export function NotificationRow({ item, zone, onOpened }: { item: NotificationItem; zone: string; /** After a row is opened (the panel closes). */ onOpened?: () => void }) {
  const navigate = useNavigate(), refresh = useRefreshAfterMark();
  const [busy, setBusy] = React.useState(false), [failed, setFailed] = React.useState(false);
  const unread = item.readAt === null;
  const mark = async () => { setBusy(true); setFailed(false); try { await markRead(item); await refresh(); } catch { setFailed(true); } finally { setBusy(false); } };
  const open = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) { void markRead(item).then(refresh, () => undefined); return; }   // a new tab: marked too, the browser opens it
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try { if (unread) await markRead(item); } catch { /* a failed mark still opens (Home's flow); the row stays unread */ }
    void refresh(); setBusy(false); onOpened?.(); navigate(item.link!);
  };
  const record = item.label ? <span className="[overflow-wrap:anywhere]">{item.label}</span> : null;
  return (
    <li data-notification={item.id} data-unread={unread || undefined} className="flex gap-3 border-t border-border py-3 first:border-t-0">
      <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${unread ? "bg-primary" : "bg-transparent"}`} />
      <div className="min-w-0 flex-1">
        {item.link
          ? <a href={item.link} onClick={(e) => void open(e)} onAuxClick={(e) => { if (e.button === 1) void markRead(item).then(refresh, () => undefined); }} aria-disabled={busy || undefined}
              className="font-medium text-text-link underline-offset-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50" data-notification-open>
              {item.label ? <>{whatWords(item)} · {record}</> : whatWords(item)}</a>
          : <span className="font-medium text-text" data-notification-unlinked>{whatWords(item)}{record ? <> · {record}</> : null}</span>}
        <p className="text-sm text-text-muted">{timeWords(item.createdAt, zone)}{unread ? <> · <span data-notification-unread>{COPY.unread}</span></> : null}
          {!item.link && !pageless(item) ? <> · {COPY.gone}</> : null}</p>
        {failed ? <p role="alert" className="text-sm text-text-danger">{COPY.markFailed}</p> : null}
      </div>
      {!item.link && unread ? <Button variant="outline" size="sm" className="self-start" busy={busy} onClick={() => void mark()} aria-label={`${COPY.markRead}: ${whatWords(item)}`} data-notification-mark>{COPY.markRead}</Button> : null}
    </li>
  );
}
const whatWords = (i: NotificationItem) => whatOf(i.kind);

/** "Mark all read" up to the newest row this list showed (BR-6: a notice that came after stays unread). */
export function useMarkAll(newest: string | undefined) {
  const refresh = useRefreshAfterMark();
  const [busy, setBusy] = React.useState(false), [failed, setFailed] = React.useState(false);
  const run = async () => {
    setBusy(true); setFailed(false);
    try { await staffApi(`/platform/me/notifications/read-all${newest ? `?seen=${encodeURIComponent(newest)}` : ""}`, { method: "POST" }); await refresh(); } catch { setFailed(true); } finally { setBusy(false); }
  };
  return { run, busy, failed };
}

function BellPanel({ open, onOpenChange, returnFocus, unread }: { open: boolean; onOpenChange: (o: boolean) => void; returnFocus: () => HTMLElement | null; unread: number }) {
  const q = useQuery({ queryKey: [...NOTIFICATIONS_KEY, "panel"], enabled: open, queryFn: async () => NotificationList.parse(await staffApi(`/platform/me/notifications/items?size=${PANEL_SIZE}`)) });
  const all = useMarkAll(q.data?.items[0]?.createdAt);
  return (
    <Panel open={open} onOpenChange={onOpenChange} returnFocus={returnFocus} title={COPY.title} description={q.data ? zoneLine(q.data.zone) : undefined} bodyLabel="Your notifications"
      footer={<><Link to="/account/notifications/all" className="text-sm font-medium text-text-link underline-offset-2 hover:underline" onClick={() => onOpenChange(false)} data-notifications-see-all>{COPY.seeAll}</Link>
        <Link to="/account/notifications" className="text-sm text-text-link underline-offset-2 hover:underline" onClick={() => onOpenChange(false)} data-notifications-choose>{COPY.choose}</Link></>}>
      <div data-notifications-panel>
        <div className="mb-2 flex justify-end">
          <Button variant="ghost" size="sm" busy={all.busy} disabled={unread === 0 || !q.data} onClick={() => void all.run()} data-notifications-mark-all>{COPY.markAll}</Button>
        </div>
        {all.failed ? <Notice tone="danger" title={COPY.markFailed} /> : null}
        {q.isPending ? <p role="status" className="text-sm text-text-muted">{COPY.loading}</p>
          : q.isError ? <Notice tone="danger" title={COPY.loadFailed} action={<Button variant="outline" size="sm" onClick={() => void q.refetch()}>{COPY.retry}</Button>} />
            : !q.data.items.length ? <p className="text-sm text-text-muted" data-notifications-empty>{COPY.empty}</p>
              : <ul aria-label={COPY.title}>{q.data.items.map((i) => <NotificationRow key={i.id} item={i} zone={q.data.zone} onOpened={() => onOpenChange(false)} />)}</ul>}
      </div>
    </Panel>
  );
}

/** The bell in a staff frame's header. */
export function NotificationBell() {
  const loc = useLocation();
  const q = useQuery({ queryKey: [...NOTIFICATIONS_KEY, "unread"], retry: false, refetchInterval: POLL_MS, refetchIntervalInBackground: false, queryFn: async () => UnreadCount.parse(await staffApi("/platform/me/notifications/unread-count")) });
  // BR-3: on every navigation inside the app, the count is read again.
  const first = React.useRef(true);
  React.useEffect(() => { if (first.current) { first.current = false; return; } void q.refetch(); }, [loc.key]);   // eslint-disable-line react-hooks/exhaustive-deps -- on each navigation only
  const [open, setOpen] = React.useState(false), btn = React.useRef<HTMLButtonElement>(null);
  const [said, setSaid] = React.useState("");
  const n = q.data?.unread;
  React.useEffect(() => { if (n === undefined) return; const words = announcementFor(n); if (words) setSaid(words); }, [n]);
  if (q.error instanceof StaffApiError && (q.error.status === 401 || q.error.status === 428 || q.error.status === 402)) return null;
  const count = n ?? 0, badge = badgeOf(count);
  return (
    <>
      <Button ref={btn} variant="ghost" size="sm" className="relative" aria-label={bellName(count)} title={bellName(count)} onClick={() => setOpen(true)} data-notifications-bell data-unread-count={count}>
        <Bell aria-hidden className="size-4" />
        {badge ? <span aria-hidden className="absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-primary px-1 text-center text-[11px] font-semibold leading-5 text-primary-foreground" data-notifications-badge>{badge}</span> : null}
      </Button>
      <span role="status" aria-live="polite" className="sr-only" data-notifications-live>{said}</span>
      <BellPanel open={open} onOpenChange={setOpen} returnFocus={() => btn.current} unread={count} />
    </>
  );
}
