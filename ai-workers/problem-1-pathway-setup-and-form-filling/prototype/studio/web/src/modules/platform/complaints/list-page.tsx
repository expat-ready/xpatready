// PF-21s part 3 (concept screens/pf-21-complaints §4 "List", Library list pattern; BR-1, BR-8; G1, G2, m1): the firm's
// complaints. View chips Open · Overdue · Closed · All with counts counted here from one `GET /?view=all` page ("+" once
// that page has more); the view lives in the address (?view=), so a reload or Back keeps it; 100 a page with Show more.
// "Record a complaint" only with the record key. The server decides who sees what (BR-1); this page only shows it.
import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Button, Table } from "@/components/ui/controls";
import { Loading } from "@/modules/front-office/sales/loading";
import { cn } from "@/lib/utils";
import { PlatformFrame, usePlatformStaff } from "../frame";
import { staffApi, StaffApiError } from "../session";
import { CATEGORY, CHANNEL, day, daysLeftWords, fromOf, has, HOW, KEY, KIND, nameOf, OVERDUE_TIP, Page, statusOf, word, zoneName, type Complaint } from "./contract";
import { hasKept, RecordDrawer, type Linked } from "./record-drawer";

const VIEWS = [{ view: "open", label: "Open" }, { view: "overdue", label: "Overdue" }, { view: "closed", label: "Closed" }, { view: "all", label: "All" }] as const;
type View = (typeof VIEWS)[number]["view"];
const Sample = () => <span className="ml-1 text-[11px] font-normal text-text-muted">Sample</span>;

const listOf = (view: View, cursor?: string) => staffApi(`/platform/complaints?view=${view}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`).then((r) => Page.parse(r));
function useCounts() {
  return useQuery({ queryKey: ["pf", "complaints", "counts"], queryFn: async () => {
    const p = await listOf("all");
    // Past one page (G1) only All is known to be "100+"; a count of the others from part of the firm would mislead
    // ("Overdue 0+" while some are overdue, break M2), so they show none until a server count exists.
    if (p.next) return { open: "", overdue: "", closed: "", all: "100+" } as Record<View, string>;
    const n = { open: p.items.filter((c) => c.status === "OPEN").length, overdue: p.items.filter((c) => c.overdue).length, closed: p.items.filter((c) => c.status === "CLOSED").length, all: p.items.length };
    return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, String(v)])) as Record<View, string>;
  } });
}

function Row({ c, people, zone }: { c: Complaint; people: Record<string, string>; zone: string }) {
  const left = daysLeftWords(c), s = statusOf(c), from = fromOf(c);
  return (
    <tr data-complaint-row={c.id} data-overdue={c.overdue || undefined}>
      <td className="whitespace-nowrap"><Link to={`/platform/complaints/${c.id}`} aria-label={`${from}, received ${day(c.receivedAt, zone)}`} className="font-medium text-text-link hover:underline">{day(c.receivedAt, zone)}</Link></td>
      <td className="max-w-56"><span className="block truncate" title={from}>{from}</span>{c.complainantName ? <span className="text-xs text-text-muted">{word(KIND, c.subjectKind)}</span> : null}</td>
      <td>{word(CATEGORY, c.category)}</td>
      <td>{word(CHANNEL, c.channel)}</td>
      <td className="max-w-48"><span className="block truncate" title={nameOf(people, c.handlerStaffId)}>{nameOf(people, c.handlerStaffId)}</span></td>
      <td className="whitespace-nowrap" data-ack>
        {c.acknowledgedAt ? <span className="text-text-muted">Acknowledged {day(c.acknowledgedAt, zone)}</span>
          : c.status === "CLOSED" ? <span className="text-text-muted">Not acknowledged</span>
            : <>{day(c.acknowledgeBy, zone)}{left ? <span className={cn("block text-xs", left.late ? "font-medium text-text-warn" : "text-text-muted")} data-days-left>{left.text}</span> : null}</>}
      </td>
      <td className="whitespace-nowrap" data-status={s.text}>
        <span className={cn("inline-flex items-center gap-1 text-sm", c.overdue ? "font-semibold text-text-warn" : c.status === "CLOSED" ? "text-text-muted" : "text-text")} title={c.overdue ? OVERDUE_TIP : undefined}>
          <span aria-hidden="true">{s.mark}</span>{s.text}
        </span>
      </td>
    </tr>
  );
}

function ListBody() {
  const me = usePlatformStaff();
  const [params, setParams] = useSearchParams();
  const asked = params.get("view");
  const view: View = VIEWS.some((v) => v.view === asked) ? (asked as View) : "open";
  const readsAll = has(me, KEY.read), records = has(me, KEY.record);
  // A linked id in the address opens the drawer with that kind (concept §4 "Drawers"); otherwise "Someone else" alone.
  const linked: Linked | null = params.get("frontOfficePerson") ? { kind: "FRONT_OFFICE_PERSON", id: params.get("frontOfficePerson")!, name: params.get("name") ?? "" }
    : params.get("caseParty") ? { kind: "CASE_PARTY", id: params.get("caseParty")!, name: params.get("name") ?? "" } : null;
  const [drawer, setDrawer] = React.useState(records && (!!linked || hasKept(me.staffId)));
  // Closing the drawer drops a linked id from the address, so a reload does not open it again (break m7).
  const openDrawer = (o: boolean) => { setDrawer(o); if (!o && linked) setParams(view === "open" ? {} : { view }, { replace: true }); };
  const opener = React.useRef<HTMLButtonElement>(null);
  const counts = useCounts();
  const rows = useInfiniteQuery({ queryKey: ["pf", "complaints", "list", view], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listOf(view, pageParam), getNextPageParam: (p) => p.next ?? undefined });
  const pages = rows.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items), people = Object.assign({}, ...pages.map((p) => p.people)) as Record<string, string>;
  const zone = pages[0]?.firmTimeZone ?? "UTC";
  const go = (v: View) => setParams(v === "open" ? {} : { view: v }, { replace: true });
  const empty = view === "closed" ? "No closed complaints yet." : view === "overdue" ? "No overdue complaints." : view === "all" ? (readsAll ? "No complaints yet." : "No complaints that you handle.")
    : readsAll ? "No open complaints. When someone complains to the firm, record it here: the handler is reminded to acknowledge it." : "No open complaints that you handle.";
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text">Complaints</h1>
          <p className="mt-1 text-sm text-text-muted">{readsAll ? "Every complaint made to the firm, how it was handled and how it ended." : "Complaints you handle."}</p>
        </div>
        {records ? <Button ref={opener} onClick={() => setDrawer(true)} data-record-open>Record a complaint</Button> : null}
      </header>
      <div role="group" aria-label="Which complaints" className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button key={v.view} type="button" aria-pressed={v.view === view} data-chip={v.view} onClick={() => go(v.view)} title={v.view === "overdue" ? OVERDUE_TIP : undefined}
            className={cn("min-h-8 rounded-full border px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", v.view === view ? "border-primary bg-primary/10 font-medium text-text-link" : "border-border bg-surface-raised text-text hover:bg-text/5", v.view === "overdue" && counts.data?.overdue && counts.data.overdue !== "0" ? "text-text-warn" : "")}>
            {v.label} <span data-count className={cn("ml-1 font-semibold", v.view === "overdue" && counts.data?.overdue && counts.data.overdue !== "0" ? "text-text-warn" : "")}>{counts.data?.[v.view] ?? "…"}</span>
          </button>
        ))}
      </div>
      {rows.isPending ? <Loading label="Loading complaints" />
        : rows.isError ? <p role="alert" className="text-sm text-text-danger">{rows.error instanceof StaffApiError ? rows.error.message : "Could not load the complaints."} <Button variant="link" size="sm" onClick={() => rows.refetch()}>Try again</Button></p>
          : !items.length ? <div data-empty data-shown-view={view} className="rounded-xl border border-dashed border-border bg-surface-raised px-4 py-8 text-center text-sm text-text-muted">{empty}</div>
            : (
              // data-shown-view: the view these rows belong to (a test waits for it, not for the address alone).
              <div data-shown-view={view} className="flex flex-col gap-4">
                <Table label={`Complaints: ${VIEWS.find((v) => v.view === view)!.label}`} head={["Received", "From", <>About<Sample /></>, <>How it came<Sample /></>, "Handler", <>Acknowledge by<Sample /></>, "Status"]}>
                  {items.map((c) => <Row key={c.id} c={c} people={people} zone={zone} />)}
                </Table>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
                  <span>Showing {items.length}{rows.hasNextPage ? "+" : ""}. Dates are in the firm's time ({zoneName(zone)}).</span>
                  {rows.hasNextPage ? <Button variant="outline" size="sm" busy={rows.isFetchingNextPage} onClick={() => void rows.fetchNextPage()}>Show more</Button> : null}
                </div>
              </div>
            )}
      <details className="rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm" data-how>
        <summary className="cursor-pointer font-medium">How it works</summary>
        <p className="mt-2 text-text-muted">{HOW}</p>
      </details>
      {records ? <RecordDrawer open={drawer} onOpenChange={openDrawer} linked={linked} zone={pages[0]?.firmTimeZone} returnFocus={() => opener.current} /> : null}
    </div>
  );
}

export function ComplaintsListPage() {
  return <PlatformFrame crumbs={[{ label: "Complaints" }]}><ListBody /></PlatformFrame>;
}
