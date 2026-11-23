// PF-18ns (concept screens/PF-18ns r2 §4 board B; R1.50; Lead 10 on #3279 Q2): My account → Notifications → All, beside
// PF-18s's settings ("Settings | All" tabs, one line on each page). Every notification of mine, newest first, 25 a page, with
// an All / Unread filter, Previous and Next from the server's `nextPage`, the same row as the bell's panel, and "Mark all
// read" up to the newest row shown (BR-6). The Individual/Corporate view is never sent (BR-2, AG-10-36).
import * as React from "react";
import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Notice } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { PlatformFrame } from "../frame";
import { staffApi } from "../session";
import { NOTIFICATIONS_KEY, NotificationRow, useMarkAll } from "./bell";
import { COPY, NotificationList, PAGE_SIZE, zoneLine } from "./contract";

/** "Settings | All" over My account → Notifications (one line on PF-18s's page and on this one). */
export function NotificationTabs() {
  const tab = ({ isActive }: { isActive: boolean }) => cn("rounded-md px-3 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", isActive ? "bg-primary/10 font-medium text-text-link" : "text-text hover:bg-text/5");
  return (
    <nav aria-label="Notifications pages" className="mb-4 flex gap-1" data-notifications-tabs>
      <NavLink to="/account/notifications" end className={tab}>Settings</NavLink>
      <NavLink to="/account/notifications/all" end className={tab}>All</NavLink>
    </nav>
  );
}

function AllBody() {
  const [unread, setUnread] = React.useState(false), [page, setPage] = React.useState(1);
  const q = useQuery({ queryKey: [...NOTIFICATIONS_KEY, "all", unread, page], placeholderData: (prev) => prev,
    queryFn: async () => NotificationList.parse(await staffApi(`/platform/me/notifications/items?size=${PAGE_SIZE}&page=${page}${unread ? "&unread=1" : ""}`)) });
  const all = useMarkAll(page === 1 ? q.data?.items[0]?.createdAt : undefined);
  const show = (u: boolean) => { setUnread(u); setPage(1); };
  const filter = (u: boolean, label: string) => <Button variant={unread === u ? "secondary" : "ghost"} size="sm" aria-pressed={unread === u} onClick={() => show(u)} data-notifications-filter={u ? "unread" : "all"}>{label}</Button>;
  return (
    <div className="max-w-3xl">
      <NotificationTabs />
      <h1 className="text-2xl font-semibold">All notifications</h1>
      <p className="mt-1 text-sm text-text-muted">{q.data ? zoneLine(q.data.zone) : "Everything handed to you, newest first."}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Show" className="flex gap-1">{filter(false, "All")}{filter(true, "Unread")}</div>
        <Button variant="outline" size="sm" busy={all.busy} disabled={page !== 1 || !q.data?.items.some((i) => i.readAt === null)} onClick={() => void all.run()} data-notifications-mark-all>{COPY.markAll}</Button>
      </div>
      {all.failed ? <Notice className="mt-3" tone="danger" title={COPY.markFailed} /> : null}
      <section aria-label="Notifications" className="mt-3 rounded-xl border border-border bg-surface-raised px-4">
        {q.isPending ? <p role="status" className="py-4 text-sm text-text-muted">{COPY.loading}</p>
          : q.isError ? <div className="py-4"><Notice tone="danger" title={COPY.loadFailed} action={<Button variant="outline" size="sm" onClick={() => void q.refetch()}>{COPY.retry}</Button>} /></div>
            : !q.data.items.length ? <p className="py-4 text-sm text-text-muted" data-notifications-empty>{unread ? COPY.emptyUnread : COPY.empty}</p>
              : <ul aria-label="Notifications">{q.data.items.map((i) => <NotificationRow key={i.id} item={i} zone={q.data.zone} />)}</ul>}
      </section>
      {q.data && (page > 1 || q.data.nextPage) ? (
        <nav aria-label="Pages" className="mt-3 flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)} data-notifications-prev>Previous</Button>
          <span className="text-sm text-text-muted">Page {page}</span>
          <Button variant="outline" size="sm" disabled={!q.data.nextPage} onClick={() => setPage(q.data!.nextPage ?? page)} data-notifications-next>Next</Button>
        </nav>
      ) : null}
    </div>
  );
}

export function AllNotificationsPage() {
  return <PlatformFrame crumbs={[{ label: "Notifications", to: "/account/notifications" }, { label: "All" }]}><AllBody /></PlatformFrame>;
}
