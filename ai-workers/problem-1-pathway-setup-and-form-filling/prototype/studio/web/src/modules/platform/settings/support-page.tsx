// PF-18s part 2 (concept screens/PF-18s §4 board E, challenge M3, M4, M5, m4; AG-16-63; R1.92): My account → Help & support for every
// staff member (agent/support-ticket:list). The list: each ticket's subject (its first line, PF-18b's read), its status in words (Waiting
// on firm in orange: the one that needs you), who raised it (Owner and Admin, who see the whole firm's) and the last change. One ticket:
// the subject, "Raised from <page>" quietly, the messages oldest first (You, the colleague's name, or ExpatReady support), files by a
// short-lived link, and a reply box unless the ticket is Closed. The reply's Send has the same double-send guard as Raise (#2064).
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Field, Notice, Table, Textarea } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { PlatformFrame, usePlatformStaff } from "../frame";
import { problemOf } from "@/modules/front-office/sales/contract";
import { endSession, setStaffToken, staffApi, StaffApiError, staffToken, useStaffToken } from "../session";
import { RaisePanel } from "./help-button";
import { authorLine, BODY_MAX, fieldOf, Link as FileLink, STATUS, SUPPORT_LIST_KEY, Ticket, TicketList, type Status } from "./support-contract";

/** Review M-1: the file route needs the bearer, so the file is fetched with it and saved from a blob (identity-panel.tsx's way);
 *  a plain navigation would land on a 401 page. */
async function download(url: string, n: number) {
  const token = staffToken();
  const res = await fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const t = await res.text(); let d: unknown = t; try { d = JSON.parse(t); } catch { /* text */ }
    const problem = problemOf(d, res.status);
    if (res.status === 401 && staffToken() === token) { if (token) endSession(problem.code ?? "NOT_SIGNED_IN"); else setStaffToken(null); }
    throw new StaffApiError(res.status, problem);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `support-${n}`;
  const href = URL.createObjectURL(await res.blob()), a = document.createElement("a");
  a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
const when = (iso: string) => new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
const Empty = ({ children }: { children: React.ReactNode }) => <p data-empty className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">{children}</p>;
export function StatusWord({ status }: { status: Status }) {
  const s = STATUS[status], needsYou = status === "WAITING_ON_FIRM";
  return <span title={s.tip} data-ticket-status={status} className={cn("inline-flex items-center gap-1.5 text-sm", needsYou ? "font-medium text-text-warn" : "text-text")}>
    <span aria-hidden className={cn("size-2 shrink-0 rounded-full", needsYou ? "bg-warn" : status === "CLOSED" ? "bg-text-muted" : "bg-primary")} />{s.label}<span className="sr-only">: {s.tip}</span></span>;
}
const refused = (allowed: boolean) => allowed ? null : <Notice tone="info" title="Not available"><span data-support-refused>Help & support needs the permission to read support tickets.</span></Notice>;

function ListBody() {
  const me = usePlatformStaff(), token = useStaffToken(), allowed = me.keys.includes(SUPPORT_LIST_KEY);
  const list = useQuery({ queryKey: ["pf", "support", "list", token], enabled: !!token && allowed, retry: false, queryFn: async () => TicketList.parse(await staffApi("/platform/support/tickets")) });
  const [raising, setRaising] = React.useState(false), opener = React.useRef<HTMLButtonElement>(null);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Help & support</h1>
          <p className="mt-1 text-sm text-text-muted">In Settings: Help & support. Ask us anything; we reply here.</p></div>
        {allowed ? <Button ref={opener} onClick={() => setRaising(true)} data-support-raise>Raise a ticket</Button> : null}
      </header>
      {refused(allowed) ?? (list.isError ? <Notice tone="danger" title="Could not load your tickets"><span data-support-error>{list.error instanceof StaffApiError ? list.error.message : "Please reload the page."}</span></Notice>
        : !list.data ? <p role="status" className="text-sm text-text-muted" data-loading>Loading your tickets…</p>
          : !list.data.items.length ? <Empty>{list.data.allFirm ? "No one in the firm has raised a ticket yet." : "No tickets yet. Press ? on any page, or Raise a ticket here."}</Empty>
            : <Table label="Support tickets" head={["Ticket", "Status", ...(list.data.allFirm ? ["Raised by"] : []), "Last change"]} headClass={[undefined, undefined, ...(list.data.allFirm ? ["hidden sm:table-cell"] : []), "hidden md:table-cell"]}>
              {list.data.items.map((t) => <tr key={t.id} data-ticket-row={t.id}>
                <td className="min-w-40 [overflow-wrap:anywhere]"><Link to={`/platform/support/${t.id}`} className="font-medium text-text-link underline-offset-4 hover:underline" data-ticket-link><bdi>{t.subject || "Support ticket"}</bdi></Link>
                  <span className="block text-xs text-text-muted">Raised {when(t.createdAt)}</span></td>
                <td><StatusWord status={t.status} /></td>
                {list.data!.allFirm ? <td className="hidden sm:table-cell [overflow-wrap:anywhere]" data-ticket-raised-by>{t.raisedBy === me.staffId.toLowerCase() ? "You" : t.raisedByName ?? "A colleague"}</td> : null}
                <td className="hidden text-sm md:table-cell">{when(t.updatedAt)}</td>
              </tr>)}
            </Table>)}
      <RaisePanel open={raising} onOpenChange={setRaising} returnFocus={() => opener.current} />
    </div>
  );
}

function Reply({ ticket }: { ticket: Ticket }) {
  const qc = useQueryClient();
  const [body, setBody] = React.useState(""), [busy, setBusy] = React.useState(false), [problem, setProblem] = React.useState<string | null>(null), [error, setError] = React.useState<string>();
  const sending = React.useRef(false), box = React.useRef<HTMLTextAreaElement>(null);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending.current) return;   // the double-send guard (#2064, challenge M3): one reply in flight
    sending.current = true; setBusy(true); setProblem(null); setError(undefined);
    const text = body;
    try {
      await staffApi(`/platform/support/tickets/${ticket.id}/messages`, { method: "POST", json: { body: text } });
      setBody((b) => (b.startsWith(text) ? b.slice(text.length).trimStart() : b));   // break m4: text added while sending stays
      await qc.invalidateQueries({ queryKey: ["pf", "support"] });
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-message]:last-of-type")?.focus());   // m4: on success, the new message
    } catch (x) {
      setError(x instanceof StaffApiError ? fieldOf(x.problem.fields, "body") : undefined);
      setProblem(x instanceof StaffApiError && x.status < 500 ? x.message : "Not sent. Your message is still here; try again.");
      if (x instanceof StaffApiError && x.status === 409) await qc.invalidateQueries({ queryKey: ["pf", "support"] });   // review m-1: the box stays (read-only) with the text
      requestAnimationFrame(() => box.current?.focus());
    } finally { sending.current = false; setBusy(false); }
  };
  const closed = ticket.status === "CLOSED";
  if (closed && !body.trim()) return <Notice tone="info" title="Closed"><span data-ticket-closed>This ticket is closed. Raise a new one if you still need help.</span></Notice>;
  return (
    <form className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4" onSubmit={(e) => void send(e)} noValidate data-reply-form>
      {problem ? <Notice tone="danger" title="Not sent"><span data-reply-problem>{problem}</span></Notice> : null}
      <Field label="Your reply" error={error} hint={closed ? "This ticket was closed: copy your text into a new ticket." : "Enter starts a new line."}>
        <Textarea ref={box} rows={4} value={body} maxLength={BODY_MAX} readOnly={closed} onChange={(e) => setBody(e.target.value)} aria-invalid={!!error || undefined} data-reply-body />
      </Field>
      {closed ? null : <Button type="submit" busy={busy} disabled={!body.trim()} className="self-start" data-reply-send>Send</Button>}
    </form>
  );
}

function TicketBody({ id }: { id: string }) {
  const me = usePlatformStaff(), token = useStaffToken(), allowed = me.keys.includes(SUPPORT_LIST_KEY);
  const t = useQuery({ queryKey: ["pf", "support", "ticket", id, token], enabled: !!token && allowed, retry: false, queryFn: async () => Ticket.parse(await staffApi(`/platform/support/tickets/${encodeURIComponent(id)}`)) });
  const [fileProblem, setFileProblem] = React.useState<string | null>(null);
  const open = async (n: number) => {
    setFileProblem(null);
    try { const l = FileLink.parse(await staffApi(`/platform/support/tickets/${id}/files/${n}/link`, { method: "POST" })); await download(l.url, n); }
    catch (x) { setFileProblem(x instanceof StaffApiError ? x.message : "Could not open the file. Please try again."); }
  };
  if (!allowed) return <div className="mx-auto max-w-3xl">{refused(false)}</div>;
  if (t.isError) return <div className="mx-auto max-w-3xl"><Notice tone="danger" title={t.error instanceof StaffApiError && t.error.status === 404 ? "Ticket not found" : "Could not load the ticket"}>
    <span data-ticket-error>{t.error instanceof StaffApiError && t.error.status === 404 ? "There is no such ticket, or it is not yours to see." : "Please reload the page."}</span> <Link className="text-text-link underline" to="/platform/support">Back to Help & support</Link></Notice></div>;
  if (!t.data) return <p role="status" className="mx-auto max-w-3xl text-sm text-text-muted" data-loading>Loading the ticket…</p>;
  const d = t.data;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold [overflow-wrap:anywhere]" data-ticket-subject><bdi>{d.subject || "Support ticket"}</bdi></h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1"><StatusWord status={d.status} /><span aria-hidden className="text-sm text-text-muted" data-ticket-status-tip>{STATUS[d.status].tip}</span>
          <span className="text-sm text-text-muted [overflow-wrap:anywhere]" data-ticket-page>Raised from {d.page}{d.raisedBy !== me.staffId.toLowerCase() && d.raisedByName ? ` by ${d.raisedByName}` : ""}</span></div>
      </header>
      {fileProblem ? <Notice tone="danger" title="File not opened">{fileProblem}</Notice> : null}
      <ol className="flex flex-col gap-3" aria-label="Messages">
        {(d.messages ?? []).map((m) => <li key={m.id} tabIndex={-1} data-message={m.authorKind} className={cn("rounded-xl border border-border p-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", m.authorKind === "SUPPORT" ? "bg-primary/5" : "bg-surface-raised")}>
          <p className="text-sm font-medium" data-message-author>{authorLine(m, me.staffId)} <span className="font-normal text-text-muted">· {when(m.createdAt)}</span></p>
          <p className="mt-1 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{m.body}</p>
          {m.files.length ? <div className="mt-2 flex flex-wrap gap-2">{m.files.map((n) => <Button key={n} variant="outline" size="sm" onClick={() => void open(n)} data-message-file>Attachment {n}</Button>)}</div> : null}
        </li>)}
      </ol>
      <Reply ticket={d} />
    </div>
  );
}

export function SupportPage() {
  return <PlatformFrame crumbs={[{ label: "Help & support" }]}><ListBody /></PlatformFrame>;
}
export function SupportTicketPage() {
  const { id = "" } = useParams();
  return <PlatformFrame crumbs={[{ label: "Help & support", to: "/platform/support" }, { label: "Ticket" }]} back={{ to: "/platform/support", label: "Back to Help & support" }}><TicketBody id={id} /></PlatformFrame>;
}
