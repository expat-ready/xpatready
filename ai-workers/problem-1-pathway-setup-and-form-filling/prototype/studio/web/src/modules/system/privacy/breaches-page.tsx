// PF-21rs A1 (R1.86; concept r2 §3-§5, board §1; SA-11-24, BR-1, BR-4, BR-8; j_86 W1, W9; j_85 W7): our console's Breaches
// page, /system/privacy/breaches. One table read from PF-21c's `GET /api/system/register/breaches` as answered (newest
// discovered first, the API's order), firms and people named by PF-21rs R0, each breach's status calculated in
// `contract.ts` (word and shape). The Platform Owner records a breach here ("Record a breach"); the Auditor reads only;
// anyone without the key sees the API's own 403 words, never an empty table. Kept 7 years: nothing here deletes.
// A breach's own page (decide, notices, history) is part A2.
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Notice, Table } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { SystemFrame, takeArrival, useSystemStaff } from "../frame";
import { systemApi, SystemApiError, useSystemToken } from "../session";
import { BREACH_MANAGE_KEY, BreachList, COPY, DECISION_WORDS, firmsText, noticesText, STATUS_WORDS, statusOf, whenWords, type Breach } from "./contract";
import { RecordBreach } from "./record-breach";

function Row({ b }: { b: Breach }) {
  const s = STATUS_WORDS[statusOf(b)];
  return (
    <tr data-breach-row={b.id} data-status={statusOf(b)}>
      <td className="whitespace-nowrap"><time dateTime={b.discoveredAt}>{whenWords(b.discoveredAt)}</time></td>
      <td className="min-w-64 max-w-xl [overflow-wrap:anywhere]"><Link to={`/system/privacy/breaches/${b.id}`} className="line-clamp-2 text-text-link hover:underline" title={b.description}>{b.description}</Link></td>
      <td className="min-w-40 [overflow-wrap:anywhere]">{b.firms.length ? firmsText(b.firms) : <span className="text-text-muted">{COPY.underInvestigation}</span>}</td>
      <td className="min-w-32">{DECISION_WORDS[b.decision]}{b.decision === "NO_NOTICE" && b.decisionReason ? <span className="block text-xs text-text-muted [overflow-wrap:anywhere]">why: {b.decisionReason}</span> : null}</td>
      <td className="whitespace-nowrap">{noticesText(b)}</td>
      <td className="whitespace-nowrap"><span className={cn("font-medium", s.tone)} title={s.hint}><span aria-hidden>{s.mark} </span>{s.word}</span></td>
    </tr>
  );
}

function BreachesBody() {
  const token = useSystemToken(), me = useSystemStaff(), qc = useQueryClient(), go = useNavigate();
  const list = useQuery({ queryKey: ["sys", "breaches", token], enabled: !!token, retry: false, queryFn: async () => BreachList.parse(await systemApi("/register/breaches")) });
  const [open, setOpen] = React.useState(false);
  const heading = React.useRef<HTMLHeadingElement>(null), recordButton = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => { if (list.data && takeArrival()) heading.current?.focus(); }, [!!list.data]);   // eslint-disable-line react-hooks/exhaustive-deps -- the first answer after a sign-in
  const d = list.data;
  if (!d && !list.isError) return <p role="status" className="text-sm text-text-muted" data-loading>Loading the breaches…</p>;
  const refused = list.error instanceof SystemApiError ? list.error : null;
  const manage = me.keys.includes(BREACH_MANAGE_KEY) && refused?.status !== 403;
  const refresh = () => void qc.invalidateQueries({ queryKey: ["sys", "breaches"] });
  // A2: the new breach's own page opens, saying its next step (board §2).
  const recorded = (id: string) => { setOpen(false); refresh(); go(`/system/privacy/breaches/${id}?recorded=1`); };
  // Every close refreshes the list, so a breach whose answer was lost shows before anyone records it again (break m1).
  const toggle = (o: boolean) => { setOpen(o); if (!o) refresh(); };
  const title = (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">{COPY.breachesTitle}</h1>
        <p className="mt-1 text-sm text-text-muted">{COPY.breachesLead}</p>
        {!manage && !refused ? <p className="mt-1 text-sm text-text-muted" data-read-only>{COPY.readOnly}</p> : null}
      </div>
      {manage ? <Button ref={recordButton} onClick={() => setOpen(true)} className="max-sm:min-h-11">Record a breach</Button> : null}
    </header>
  );
  // Without the key (403) the API's own words, and nothing to press (BR-8).
  if (refused?.status === 403) return <div className="mx-auto flex max-w-7xl flex-col gap-4">{title}<Notice tone="danger" title="Not available"><span data-breaches-error>{refused.message}</span></Notice></div>;
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      {title}
      {list.isError ? <Notice tone="danger" title="Not available" action={<Button variant="outline" size="sm" onClick={() => void list.refetch()}>Retry</Button>}>
        <span data-breaches-error>{refused ? refused.message : COPY.loadFailed}</span></Notice>
        : !d ? null
          : !d.breaches.length ? <p data-breaches-empty className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">{COPY.breachesEmpty}</p>
            : <>
              <Table label="Breaches" head={["Discovered", "What happened", "Firms", "Decision", "Notices", "Status"]}>
                {d.breaches.map((b) => <Row key={b.id} b={b} />)}
              </Table>
              <p className="text-xs text-text-muted">{d.truncated ? COPY.truncated : `${d.breaches.length} ${d.breaches.length === 1 ? "breach" : "breaches"}`}</p>
            </>}
      {manage ? <RecordBreach open={open} onOpenChange={toggle} onRecorded={recorded} onMaybeRecorded={refresh} returnFocus={() => recordButton.current} /> : null}
    </div>
  );
}

export function BreachesPage() {
  return <SystemFrame crumbs={[{ label: "Breaches" }]}><BreachesBody /></SystemFrame>;
}
