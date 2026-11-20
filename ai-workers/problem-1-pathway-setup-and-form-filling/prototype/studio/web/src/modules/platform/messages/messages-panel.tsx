// PF-19b part 3 (R1.48; J-48): one record's messages for staff: each with its purpose, the masked address, its state as
// a word (a quiet colour beside it, never colour alone), its events with times and the from-name. Reads
// GET /api/platform/messages; the body is never shown (the server never returns it). Mounted on the front-office lead
// page; the case page mounts it in its own row.
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { Button, Pill } from "@/components/ui/controls";
import { staffApi, StaffApiError } from "../session";
import { CHANNEL, CLASS, EVENT, MessagePage, purposeWords, reasonWords, STATE, whenWords, type Message } from "./contract";

export type Subject = { kind: "LEAD" | "FO_PERSON" | "CASE_PARTY"; id: string };

function Row({ m, focusRef }: { m: Message; focusRef?: React.Ref<HTMLLIElement> }) {
  const s = STATE[m.state] ?? { word: "Unknown", tone: "neutral" }, why = reasonWords(m.stateReason);
  return (
    <li ref={focusRef} tabIndex={focusRef ? -1 : undefined} data-message={m.id} data-state={m.state} className="border-t border-border py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium [overflow-wrap:anywhere]">{purposeWords(m.purpose)}</span>
        <Pill tone={s.tone}><span data-state-word>{s.word}</span></Pill>
        {why ? <span data-reason className="text-xs text-text-muted">{why}</span> : null}
      </div>
      <p className="mt-0.5 text-xs text-text-muted [overflow-wrap:anywhere]">
        {CHANNEL[m.channel] ?? m.channel} to {m.address} · {CLASS[m.class] ?? m.class}{m.fromName ? <> · from {m.fromName}</> : null}
      </p>
      {m.events.length ? (
        <ol aria-label="What happened" className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-muted">
          {m.events.map((e, i) => <li key={i}><span className="text-text">{EVENT[e.kind] ?? e.kind}</span> <time dateTime={e.at}>{whenWords(e.at)}</time></li>)}
        </ol>
      ) : <p className="mt-1 text-xs text-text-muted">Created <time dateTime={m.createdAt}>{whenWords(m.createdAt)}</time></p>}
    </li>
  );
}

export function MessagesPanel({ subject }: { subject: Subject }) {
  const q = useInfiniteQuery({
    queryKey: ["pf", "messages", subject.kind, subject.id] /* under "pf": sign-out and sign-in clear it (break m2) */, retry: false, initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => MessagePage.parse(await staffApi(`/platform/messages?subjectKind=${subject.kind}&subjectId=${encodeURIComponent(subject.id)}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`)),
    getNextPageParam: (last) => last.nextCursor,
  });
  const messages = q.data?.pages.flatMap((p) => p.messages) ?? [];
  // After "Show older messages", focus goes to the first newly loaded message (the button may be gone: break m1).
  const firstNew = useRef<HTMLLIElement>(null), loadedBefore = useRef<number | null>(null);
  const older = async () => { loadedBefore.current = messages.length; await q.fetchNextPage(); requestAnimationFrame(() => firstNew.current?.focus()); };
  return (
    <section aria-labelledby="pf-messages" data-messages-panel className="rounded-xl border border-border bg-surface-raised p-4">
      <h2 id="pf-messages" className="text-sm font-semibold">Messages</h2>
      {subject.kind === "CASE_PARTY" ? null : <p className="text-xs text-text-muted">Every email to this person, from any of their leads.</p>}
      {q.isPending ? <p role="status" className="mt-2 text-sm text-text-muted">Loading the messages…</p>
        : q.isError ? (
          <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-danger">
            {q.error instanceof StaffApiError && q.error.status === 404 ? "These messages are not ones you may see." : <>Could not load the messages. <Button variant="outline" size="sm" onClick={() => void q.refetch()}>Try again</Button></>}
          </div>)
        : messages.length === 0 ? <p className="mt-2 text-sm text-text-muted">No messages yet.</p>
        : <ul className="mt-1">{messages.map((m, i) => <Row key={m.id} m={m} focusRef={i === loadedBefore.current ? firstNew : undefined} />)}</ul>}
      {q.hasNextPage ? <Button variant="secondary" className="mt-2" busy={q.isFetchingNextPage} onClick={() => void older()}>Show older messages</Button> : null}
    </section>
  );
}
