// PF-17 part 4 PR C (R1.93; concept r2 §4d, §4e, BR-1, BR-5 to BR-7; SA-10 §3.2, §3.4; Lead 15 on #3225; j_93 W4): our
// console's Support page. One queue of every firm's "?" tickets read from PF-17 part 2's `GET /api/system/support/tickets`
// in the server's order (waiting on us first, the longest waiting first; the page never re-sorts), each row with its
// firm's name and live plan (part 4's `firm.plan`, the Firms page's own source). Status chips (`?status=`), a firm filter
// from a row's firm name (`?firm=`). A row opens the ticket's side panel (`?ticket=`, so it reopens from the address):
// the thread in order and our reply (PF-18b's replyAsSupport through part 2's route), read-only on a closed ticket or
// without the manage key. Internal notes, assignment and priority are not built (part 2).
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Notice, Panel, Table, Textarea } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { ageWords, momentWords, QueuePage, queueQuery, QueueTicket, refusalWords, STATUS_CHIPS, STATUS_WORDS, SUPPORT_COPY, SUPPORT_MANAGE_KEY, type QueueItem } from "./contract";
import { SystemFrame, useSystemStaff } from "./frame";
import { systemApi, SystemApiError, useSystemToken } from "./session";

const fieldWords = (e: SystemApiError) => refusalWords(e.message, e.problem.fields);

function TicketPanel({ id, onClose, returnFocus }: { id: string | null; onClose: () => void; returnFocus: () => HTMLElement | null }) {
  const token = useSystemToken(), me = useSystemStaff(), qc = useQueryClient();
  const path = id ? `/support/tickets/${encodeURIComponent(id)}` : "";   // the id from the address, escaped (breaker m7)
  const t = useQuery({ queryKey: ["sys", "ticket", id, token], enabled: !!token && !!id, retry: false, queryFn: async () => QueueTicket.parse(await systemApi(path)) });
  const [body, setBody] = React.useState(""), [busy, setBusy] = React.useState(false), [error, setError] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState<"sent" | "closed" | null>(null);
  React.useEffect(() => { setBody(""); setError(null); setSaid(null); }, [id]);
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null); setSaid(null);
    try {
      const after = QueueTicket.parse(await systemApi(`${path}/replies`, { method: "POST", json: { body } }));
      qc.setQueryData(["sys", "ticket", id, token], after); setBody(""); setSaid("sent");
      await qc.invalidateQueries({ queryKey: ["sys", "queue"] });   // the row follows (its status and last activity)
    } catch (x) {
      // Closed while we wrote (409, BR-7): say so in our words and show the ticket as it is now (round 2, M1).
      if (x instanceof SystemApiError && x.status === 409) { setSaid("closed"); await Promise.all([qc.invalidateQueries({ queryKey: ["sys", "ticket", id] }), qc.invalidateQueries({ queryKey: ["sys", "queue"] })]); }
      else setError(x instanceof SystemApiError ? fieldWords(x) : "Could not send the reply. Please try again.");
    }
    finally { setBusy(false); }
  };
  const d = t.data, now = Date.now();
  const canReply = me.keys.includes(SUPPORT_MANAGE_KEY);
  return (
    <Panel open={!!id} onOpenChange={(o) => { if (!o) onClose(); }} returnFocus={returnFocus} title={d?.subject ?? "Support ticket"}
      description={d ? <span data-ticket-head>{d.firm.name} · {d.firm.plan?.name ?? SUPPORT_COPY.noPlan} · {STATUS_WORDS[d.status]} · {ageWords(d.createdAt, now)} old · raised on {d.page}</span> : undefined}>
      {t.isError ? <Notice tone="danger" title="Not available"><span>{t.error instanceof SystemApiError ? t.error.message : SUPPORT_COPY.loadFailed}</span></Notice>
        : !d ? <p role="status" className="text-sm text-text-muted">Loading the ticket…</p>
          : <div className="flex flex-col gap-4">
            <ol className="flex flex-col gap-3" aria-label="Messages">
              {d.messages.map((m) => <li key={m.id} className={cn("rounded-lg border border-border p-3 text-sm", m.authorKind === "SUPPORT" && "bg-primary/5")}>
                <p className="text-xs text-text-muted">{m.authorName ?? (m.authorKind === "SUPPORT" ? "ExpatReady support" : "A firm user")} · {momentWords(m.createdAt)}</p>
                <p dir="auto" className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
                {m.files.length ? <p className="mt-1 text-xs text-text-muted">{m.files.length} {m.files.length === 1 ? "file" : "files"} attached</p> : null}</li>)}
            </ol>
            {said === "closed" ? <Notice tone="warn"><span data-reply-closed-now>{SUPPORT_COPY.closedWhileWriting}</span></Notice> : null}
            <p role="status" className={said === "sent" ? "text-sm text-text-ok" : "sr-only"} data-reply-sent={said === "sent" || undefined}>{said === "sent" ? SUPPORT_COPY.sent : ""}</p>
            {d.status === "CLOSED" ? <Notice tone="info"><span data-reply-closed>{SUPPORT_COPY.closed}</span></Notice>
              : !canReply ? <Notice tone="info"><span data-reply-no-manage>{SUPPORT_COPY.noManage}</span></Notice>
                : <form className="flex flex-col gap-2" onSubmit={send} noValidate>
                  <label htmlFor="sys-reply" className="text-sm font-medium">{SUPPORT_COPY.replyLabel}</label>
                  <Textarea id="sys-reply" rows={4} dir="auto" value={body} readOnly={busy} onChange={(e) => setBody(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? "sys-reply-error" : undefined} />
                  {error ? <p id="sys-reply-error" role="alert" className="text-sm text-text-danger" data-reply-error>{error}</p> : null}
                  <Button type="submit" busy={busy} className="self-end max-sm:min-h-11">Send reply</Button>
                </form>}
          </div>}
    </Panel>
  );
}

function SupportBody() {
  const token = useSystemToken();
  const [params, setParams] = useSearchParams();
  const query = queueQuery(params);
  const list = useQuery({ queryKey: ["sys", "queue", query, token], enabled: !!token, retry: false, placeholderData: keepPreviousData, queryFn: async () => QueuePage.parse(await systemApi(`/support/tickets${query}`)) });
  const put = React.useCallback((k: string, v: string | null) => setParams((old) => { const p = new URLSearchParams(old); if (v) p.set(k, v); else p.delete(k); if (k !== "page" && k !== "ticket") p.delete("page"); return p; }), [setParams]);
  const opener = React.useRef<HTMLElement | null>(null), headingRef = React.useRef<HTMLHeadingElement>(null);
  // Where the focus goes when the panel closes (round 2, breaker M2): the row's button if it is still listed, else the
  // first row now listed, else the page's heading; never the page body.
  const backTo = () => (opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>("[data-ticket-row] button") ?? headingRef.current);
  // Round 3 (review R2-1): the row the focus went back to can leave the list once the queue re-reads after a reply (it
  // no longer matches the filter). After a closed panel, each new answer checks the focus again until the list settles;
  // a page opened fresh is never touched.
  const refocus = React.useRef(false);
  const closePanel = () => { refocus.current = true; put("ticket", null); };
  const status = params.get("status"), firm = params.get("firm"), ticket = params.get("ticket");
  const d = list.data, now = Date.now();
  React.useEffect(() => {
    if (!refocus.current || ticket) return;
    const at = document.activeElement;
    if (!at || at === document.body || !at.isConnected) backTo()?.focus();
    if (!list.isFetching) refocus.current = false;
  }, [d, ticket, list.isFetching]);   // eslint-disable-line react-hooks/exhaustive-deps -- after a close, on each answer
  if (!d && !list.isError) return <p role="status" className="text-sm text-text-muted" data-loading>Loading the support queue…</p>;
  const refused = list.error instanceof SystemApiError ? list.error : null;
  const title = <header><h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-none">Support</h1>
    <p className="mt-1 text-sm text-text-muted">Every firm's tickets, the longest waiting on us first. Times in UTC.</p></header>;
  if (refused?.status === 403) return <div className="mx-auto flex max-w-7xl flex-col gap-4">{title}<Notice tone="danger" title="Not available"><span data-support-error>{refused.message}</span></Notice></div>;
  const firmName = firm ? d?.tickets.find((t) => t.firm.id === firm)?.firm.name ?? "this firm" : null;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  const open = (t: QueueItem) => (e: React.MouseEvent<HTMLElement>) => { opener.current = e.currentTarget; put("ticket", t.id); };
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      {title}
      <div role="group" aria-label="Status" className="flex flex-wrap gap-2">
        {STATUS_CHIPS.map((c) => { const on = (c.value ?? null) === (status ?? null);
          return <button key={c.label} type="button" aria-pressed={on} data-chip={c.value ?? "ALL"} onClick={() => put("status", c.value)}
            className={cn("min-h-8 rounded-full border px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", on ? "border-primary bg-primary/10 font-medium text-text-link" : "border-border bg-surface-raised text-text")}>{c.label}</button>; })}
        {firm ? <button type="button" onClick={() => put("firm", null)} className="min-h-8 rounded-full border border-primary bg-primary/10 px-3 text-sm text-text-link outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">Clear firm: {firmName} ×</button> : null}
      </div>
      {list.isFetching && d ? <p role="status" className="sr-only">Updating the support queue…</p> : null}
      {list.isError ? (refused && refused.status < 500
        ? <Notice tone="danger" title={refused.problem.title ?? "Not available"} action={<Button variant="outline" size="sm" onClick={() => setParams(new URLSearchParams())}>Clear filters</Button>}><span data-support-error>{fieldWords(refused)}</span></Notice>
        : <Notice tone="danger" title="Not available" action={<Button variant="outline" size="sm" onClick={() => void list.refetch()}>Retry</Button>}><span data-support-error>{refused ? refused.message : SUPPORT_COPY.loadFailed}</span></Notice>)
        : !d ? null
          : !d.tickets.length && d.total > 0 && d.page > 1
            ? <p data-support-past-end className="flex flex-wrap items-center justify-center gap-3 rounded-xl border border-dashed border-border px-4 py-8 text-sm text-text-muted">{SUPPORT_COPY.pastEnd}
              <Button variant="outline" size="sm" onClick={() => put("page", null)}>Go to page 1</Button></p>
          : !d.tickets.length ? <p data-support-empty className="flex flex-wrap items-center justify-center gap-3 rounded-xl border border-dashed border-border px-4 py-8 text-sm text-text-muted">{SUPPORT_COPY.empty}
            {status || firm ? <Button variant="outline" size="sm" onClick={() => setParams(new URLSearchParams())}>{SUPPORT_COPY.showAll}</Button> : null}</p>
            : <Table label="Support tickets" head={["Subject", "Firm", "Status", "Raised by", "Page", "Age", "Last activity", "Messages"]}>
              {d.tickets.map((t) => <tr key={t.id} data-ticket-row={t.id} className="cursor-pointer hover:bg-surface-sunken"
                // The whole row opens the ticket (concept §4d); its subject is the keyboard's way in, its firm name a filter;
                // a click that ends a text selection keeps the selection (breaker round 2).
                onClick={(e) => { if ((e.target as Element).closest("a,button") || window.getSelection()?.toString()) return; opener.current = (e.currentTarget as HTMLElement).querySelector("button"); put("ticket", t.id); }}>
                <td className="min-w-48"><button type="button" className="text-left font-medium text-text-link hover:underline [overflow-wrap:anywhere]" onClick={open(t)}>{t.subject}</button></td>
                <td className="min-w-40"><a href={`/system/support?firm=${t.firm.id}`} onClick={(e) => { e.preventDefault(); put("firm", t.firm.id); }} className="text-text-link hover:underline [overflow-wrap:anywhere]">{t.firm.name}</a>
                  <span className="block text-xs text-text-muted">{t.firm.plan?.name ?? SUPPORT_COPY.noPlan}</span></td>
                <td className={cn("whitespace-nowrap", t.status === "WAITING_ON_FIRM" && "font-medium")}>{STATUS_WORDS[t.status]}</td>
                <td className="[overflow-wrap:anywhere]">{t.raisedByName ?? "—"}</td>
                <td className="[overflow-wrap:anywhere] text-xs">{t.page}</td>
                <td className="whitespace-nowrap">{ageWords(t.createdAt, now)}</td>
                <td className="whitespace-nowrap">{ageWords(t.updatedAt, now)} ago</td>
                <td>{t.messages}</td>
              </tr>)}
            </Table>}
      {d && pages > 1 && d.tickets.length ? <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
        <Button variant="outline" size="sm" disabled={d.page <= 1} onClick={() => put("page", String(d.page - 1))}>Previous</Button>
        <span>Page {d.page} of {pages} · {d.total} tickets</span>
        <Button variant="outline" size="sm" disabled={d.page >= pages} onClick={() => put("page", String(d.page + 1))}>Next</Button></nav> : null}
      <TicketPanel id={ticket} onClose={closePanel} returnFocus={backTo} />
    </div>
  );
}

export function SupportPage() {
  return <SystemFrame crumbs={[{ label: "Support" }]}><SupportBody /></SystemFrame>;
}
