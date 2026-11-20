// FO-4 part 2a (concept r2 §4 screen 3; BR-8, BR-9, BR-10; AG-2-18, AG-2-26, AG-2-44; R1.30, R1.31): Pipeline, the
// Individual prospects as a board with a List toggle. The board is FO-2b's one board route (`pipelines/INDIVIDUAL/board`):
// its open and Won stages as columns, each with its count and its totals per currency, never one sum across currencies.
// A column shows 200 cards, then "Load more"; the board scrolls inside itself, never the page. The List is the
// accessible route and carries the filters: stage (with Lost, found only here), owner and the day it was engaged, all kept
// in the address. The Corporate switch is FO-4c's.
// FO-4 part 2a-ii (P-736; AG-2-18 rule 7): a card is also moved by dragging it, with the browser's own drag-and-drop
// (no package). A drop runs the same move as "Move to…", so the server's rules decide: a drop on Won is refused with
// AG-2-26 rule 3's words and the card stays; a drop on "Lost" opens the loss flow and moves nothing until a reason is
// saved. "Move to…" stays the keyboard, screen-reader and touch path (a browser's drag-and-drop needs a mouse).
// R1.30 (QA-533; AG-2-23 rule 1 "The board/list SHALL be filterable by rep, source, … stage, date range"): the List and
// the board carry Leads' Source control (same choices and words, `source-filter.tsx`), kept in the address (`?source=`
// once per source) and across the Board/List switch; the board's cards, counts and totals follow it. QA-572: an Engaged
// from after Engaged to is said at the field and never sent; the last list stays on screen.
import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Field, Notice, Pill, Select, Table } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { Board, can, KEY, money, ProspectRows, words, type Money } from "./contract";
import { Loading } from "./loading";
import { MoveMenu, useMove, useOwners } from "./prospect-actions";
import { SalesFrame, useStaff } from "./sales-frame";
import { DayInput, dayParam, rangeError, SourceFilter, useAddressSources } from "./source-filter";
import { staffApi, StaffApiError } from "./session";
import { arrivedLabel } from "./time";
const PAGE = 200;
const sourceQs = (sources: string[]) => sources.map((x) => `source=${encodeURIComponent(x)}`).join("&");
const useBoard = (sources: string[] = [], enabled = true) => useQuery({ enabled, queryKey: ["fo", "prospects", "board", ...(sources.length ? [sources] : [])],
  queryFn: async () => Board.parse(await staffApi(`/front-office/pipelines/INDIVIDUAL/board${sources.length ? `?${sourceQs(sources)}` : ""}`)) });
/** The address with these sources (`?source=` once per source), every other filter kept. */
const withSources = (params: URLSearchParams, sources: string[]) => { const p = new URLSearchParams(params); p.delete("source"); for (const x of sources) p.append("source", x); return p; };
/** Leads' Source control on the prospects (R1.30): choosing toggles one source, kept in the address. */
function ProspectSources({ src, params, setParams }: { src: ReturnType<typeof useAddressSources>; params: URLSearchParams; setParams: (p: URLSearchParams, o: { replace: boolean }) => void }) {
  const toggle = (c: string) => setParams(withSources(params, src.sources.includes(c) ? src.sources.filter((x) => x !== c) : src.choices.filter((x) => x === c || src.sources.includes(x))), { replace: true });
  return <SourceFilter choices={src.choices} chosen={src.sources} toggle={toggle} clear={() => setParams(withSources(params, []), { replace: true })} failed={src.known.isError} retry={() => src.known.refetch()} legend="Show prospects whose lead came from these sources" />;
}
/** The words when the sources could not be loaded and the address asks for some: nothing is fetched (as on Leads). */
const SourcesBlocked = ({ sources }: { sources: string[] }) => <p data-source-blocked className="rounded-xl border border-dashed border-border bg-surface-raised px-4 py-8 text-center text-sm text-text-muted">The prospects from {sources.map(words).join(" or ")} are not shown because the sources could not be loaded. Use Try again beside Source, or choose All sources.</p>;
/** Amounts side by side, one per currency (R1.31); nothing when no prospect there has a value. */
function Totals({ lines, none }: { lines: Money[]; none: string }) {
  return <span data-totals>{lines.length ? lines.map((t) => money(t.valueCents, t.currency)).join(" · ") : none}</span>;
}
function Failed({ error, retry, what }: { error: unknown; retry: () => void; what: string }) {
  return <p role="alert" className="text-sm text-text-danger">{error instanceof StaffApiError ? error.message : `Could not load ${what}.`} <Button variant="link" size="sm" onClick={retry}>Try again</Button></p>;
}
function BoardView() {
  const me = useStaff(), owners = useOwners(), move = useMove();
  const [params, setParams] = useSearchParams();
  const src = useAddressSources(params);
  const board = useBoard(src.sources, src.ready);
  const filters = <div className="flex flex-wrap items-center gap-3" data-board-filters><ProspectSources src={src} params={params} setParams={setParams} /></div>;
  // The value on a card comes from the list (the board route carries names and totals only).
  const vq = src.sources.length ? `&${sourceQs(src.sources)}` : "";   // the same sources as the board (never an unfiltered list)
  const rows = useQuery({ enabled: src.ready, queryKey: ["fo", "prospects", "list", vq], queryFn: async () => ProspectRows.parse(await staffApi(`/front-office/prospects?type=INDIVIDUAL${vq}`)) });
  const [more, setMore] = React.useState<Record<string, number>>({});
  const go = useNavigate();
  // The card being dragged, and the column the pointer is over (for the outline). Only a person who may move
  // prospects can start a drag, and only from an open stage, exactly as "Move to…" is offered.
  const [drag, setDrag] = React.useState<{ id: string; number: string; from: string } | null>(null), [over, setOver] = React.useState<string | null>(null);
  const target = (id: string, drop: () => void) => ({
    onDragOver: (e: React.DragEvent) => { if (drag && drag.from !== id) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== id) setOver(id); } },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === id ? null : o)); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(null); if (drag && drag.from !== id) drop(); setDrag(null); },
  });
  if (src.blocked) return <>{filters}<SourcesBlocked sources={src.sources} /></>;
  if (board.isPending) return <>{filters}<Loading label="Loading the board" /></>;
  if (board.isError) return <>{filters}<Failed error={board.error} retry={() => board.refetch()} what="the board" /></>;
  const stages = board.data.stages.filter((s) => s.kind !== "LOST");
  const value = new Map((rows.data ?? []).map((r) => [r.id, r]));
  const drawn = board.data.stages.reduce((n, s) => n + s.prospects.length, 0);
  const mayDrag = can(me, KEY.edit), lost = board.data.stages.find((s) => s.kind === "LOST");
  const ring = (id: string) => (over === id ? " ring-2 ring-primary" : "");
  if (!stages.some((s) => s.prospects.length)) return <>{filters}<p data-empty role={src.sources.length ? "status" : undefined} className="rounded-xl border border-dashed border-border bg-surface-raised px-4 py-8 text-center text-sm text-text-muted">{src.sources.length ? `No open prospects from ${src.sources.map(words).join(" or ")}. Choose All sources to see every prospect.` : "No prospects yet. Engage a lead to start one."}</p></>;
  return (
    <>
      {filters}
      {/* The board route answers at most 1,000 prospects, oldest first (break M1): past that the screen says so. */}
      {drawn >= 1000 ? <Notice tone="warn" title="The board shows your first 1,000 prospects.">Newer ones are not drawn here. Find them in the List, by stage, owner, source or date.</Notice> : null}
      <p className="text-sm text-text-muted" data-open-totals>Open prospects by value: <Totals lines={board.data.totals} none="no values yet" /></p>
      {mayDrag ? <p className="text-xs text-text-muted" data-drag-hint>Drag a card to another stage, or use its “Move to…” button (keyboard and touch).</p> : null}
      <div role="region" aria-label="Pipeline board" tabIndex={0} data-board className="flex gap-3 overflow-x-auto rounded-xl pb-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        {stages.map((s) => {
          const shown = s.prospects.slice(0, more[s.id] ?? PAGE), left = s.prospects.length - shown.length;
          return (
            <section key={s.id} aria-labelledby={`fo-stage-${s.key}`} data-stage={s.key} className={`flex w-72 shrink-0 flex-col gap-2 rounded-xl border border-border bg-surface p-3${ring(s.id)}`}
              {...(s.kind === "ACTIVE" || s.kind === "WON" ? target(s.id, () => move.mutate({ id: drag!.id, number: drag!.number, from: drag!.from, to: s })) : {})}>   {/* Won takes the drop so the server's refusal is said; Nurture (Park) takes none */}
              <header>
                <h2 id={`fo-stage-${s.key}`} className="flex items-center justify-between gap-2 text-sm font-semibold">{s.label}<span data-count className="text-xs font-normal text-text-muted">{s.prospects.length}</span></h2>
                <p className="mt-0.5 text-xs text-text-muted"><Totals lines={s.totals} none="No values" /></p>
              </header>
              <ul className="flex flex-col gap-2">
                {shown.map((p) => {
                  const v = value.get(p.id);
                  return (
                    <li key={p.id} data-card={p.number} className={`rounded-lg border border-border bg-surface-raised p-3${mayDrag && s.kind === "ACTIVE" ? " cursor-grab active:cursor-grabbing" : ""}${drag?.id === p.id ? " opacity-50" : ""}`}
                      draggable={mayDrag && s.kind === "ACTIVE"} onDragEnd={() => { setDrag(null); setOver(null); }}
                      // A browser drags a link by itself, so the name could start a drag on a card that is not draggable (review
                      // M1): such a drag is stopped here, for a reader and for a Won card alike.
                      onDragStart={(e) => { if (!(mayDrag && s.kind === "ACTIVE")) return e.preventDefault(); e.dataTransfer.setData("text/plain", p.number); e.dataTransfer.effectAllowed = "move"; setDrag({ id: p.id, number: p.number, from: s.id }); }}>
                      <Link to={`/front-office/prospects/${p.id}`} className="text-sm font-medium text-text-link hover:underline [overflow-wrap:anywhere]">{p.name}</Link>
                      <p className="mt-0.5 text-xs text-text-muted">{p.number}{owners.oneUser ? "" : ` · ${owners.name(p.ownerStaffId)}`}{v && v.valueCents !== null ? ` · ${money(v.valueCents, v.currency)}` : ""}</p>
                      {can(me, KEY.edit) && s.kind === "ACTIVE" ? <div className="mt-2 flex justify-end"><MoveMenu prospect={p} from={s.id} stages={stages} move={move} /></div> : null}
                    </li>
                  );
                })}
              </ul>
              {left > 0 ? <Button variant="outline" size="sm" data-load-more onClick={() => setMore((m) => ({ ...m, [s.id]: shown.length + PAGE }))}>Load more ({left} more)</Button> : null}
            </section>
          );
        })}
        {/* Lost has no column (lost prospects are in the List): this is only where a card is dropped to mark it lost. */}
        {mayDrag && can(me, KEY.lose) && lost ? (
          <section data-drop-lost className={`flex w-56 shrink-0 flex-col gap-1 rounded-xl border border-dashed border-border p-3 text-sm text-text-muted${ring(lost.id)}`}
            {...target(lost.id, () => go(`/front-office/prospects/${drag!.id}?lost=1`))}>
            <h2 className="text-sm font-semibold text-text">{lost.label}</h2>
            <p className="text-xs">Drop a card here to mark it lost. You are asked why first; nothing moves until you save.</p>
          </section>
        ) : null}
      </div>
    </>
  );
}
function ListView() {
  const me = useStaff(), owners = useOwners(), move = useMove();
  const [params, setParams] = useSearchParams();
  const board = useBoard();   // the stages, for the Stage filter and "Move to…"
  const src = useAddressSources(params);
  const f = { stage: params.get("stage") ?? "", owner: params.get("owner") ?? "", from: dayParam(params, "from"), to: dayParam(params, "to") };   // sent and compared; the fields show the address as typed (review round 3)
  const set = (k: keyof typeof f, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
  const qs = (Object.keys(f) as (keyof typeof f)[]).filter((k) => f[k]).map((k) => `&${k}=${encodeURIComponent(f[k])}`).join("") + (src.sources.length ? `&${sourceQs(src.sources)}` : "");
  // QA-572: a from day after the to day is said at the field and never sent; no list stands under it (break M1).
  const badRange = rangeError(f.from, f.to);
  const rows = useQuery({ enabled: src.ready && !badRange, queryKey: ["fo", "prospects", "list", qs], queryFn: async () => ProspectRows.parse(await staffApi(`/front-office/prospects?type=INDIVIDUAL${qs}`)) });
  const stages = board.data?.stages ?? [];
  const lost = f.stage === "LOST";
  return (
    <>
      <div className="flex flex-wrap items-end gap-3" data-filters>
        <Field label="Stage"><Select value={f.stage} onChange={(e) => set("stage", e.target.value)}><option value="">Every stage but Lost</option>{stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select></Field>
        {!owners.oneUser && owners.choices.length ? <Field label="Owner"><Select value={f.owner} onChange={(e) => set("owner", e.target.value)}><option value="">Everyone</option>{owners.choices.map((o) => <option key={o.staffId} value={o.staffId}>{o.displayName}</option>)}</Select></Field> : null}
        <Field label="Engaged from" error={badRange} calm><DayInput value={params.get("from") ?? ""} max={f.to || undefined} onDay={(v) => set("from", v)} /></Field>
        <Field label="Engaged to"><DayInput value={params.get("to") ?? ""} min={f.from || undefined} onDay={(v) => set("to", v)} /></Field>
        <div className="flex min-h-9 items-center"><ProspectSources src={src} params={params} setParams={setParams} /></div>
        {qs ? <Button variant="link" size="sm" data-clear onClick={() => setParams(new URLSearchParams({ view: "list" }), { replace: true })}>Clear filters</Button> : null}
      </div>
      {board.isError ? <Failed error={board.error} retry={() => board.refetch()} what="the stages (the Stage filter and Move to… need them)" /> : null}
      {src.blocked ? <SourcesBlocked sources={src.sources} />
        : badRange ? <p data-empty role="status" className="rounded-xl border border-dashed border-border bg-surface-raised px-4 py-8 text-center text-sm text-text-muted">Change the dates to see the prospects: the from date must be on or before the to date.</p>
        : rows.isPending ? <Loading label="Loading prospects" />
        : rows.isError ? <Failed error={rows.error} retry={() => rows.refetch()} what="the prospects" />
          : !rows.data.length ? <p data-empty role="status" className="rounded-xl border border-dashed border-border bg-surface-raised px-4 py-8 text-center text-sm text-text-muted">{qs ? (lost ? "No lost prospects match these filters." : "No prospects match these filters.") : "No prospects yet. Engage a lead to start one."}</p>
            : (
              <>
              {rows.data.length >= 500 ? <Notice tone="warn" title="Showing the newest 500 prospects.">Narrow the list by stage, owner, source or date to see the rest.</Notice> : null}
              <Table label={lost ? "Lost prospects" : "Prospects"} head={["Prospect", "Stage", ...(owners.oneUser ? [] : ["Owner"]), "Value", "Engaged", lost ? "Why lost" : ""]}>
                {rows.data.map((p) => (
                  <tr key={p.id} data-prospect-row={p.number}>
                    <td><Link to={`/front-office/prospects/${p.id}`} className="font-medium text-text-link hover:underline [overflow-wrap:anywhere]">{p.name}</Link><div className="mt-0.5 text-xs text-text-muted">{p.number}</div></td>
                    <td><Pill tone={p.stage.kind === "WON" ? "ok" : p.stage.kind === "LOST" ? "neutral" : "info"}>{p.stage.label}</Pill></td>
                    {owners.oneUser ? null : <td data-owner>{owners.name(p.ownerStaffId)}</td>}
                    <td>{p.valueCents === null ? <span className="text-text-muted">Not set</span> : money(p.valueCents, p.currency)}</td>
                    <td>{arrivedLabel(p.engagedAt)}</td>
                    <td className={lost ? undefined : "text-right"}>{lost ? p.lostReason?.label ?? "" : can(me, KEY.edit) && p.stage.kind === "ACTIVE" ? <MoveMenu prospect={p} from={stages.find((s) => s.key === p.stage.key)?.id ?? ""} stages={stages} move={move} /> : null}</td>
                  </tr>
                ))}
              </Table>
              </>
            )}
    </>
  );
}
export function PipelinePage() {
  return <SalesFrame crumbs={[{ label: "Pipeline" }]}><PipelineBody /></SalesFrame>;
}
function PipelineBody() {
  const [params, setParams] = useSearchParams();
  const list = params.get("view") === "list";
  const chip = (on: boolean) => cn("min-h-8 rounded-full border px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", on ? "border-primary bg-primary/10 font-medium text-text-link" : "border-border bg-surface-raised text-text hover:bg-text/5");
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text">Pipeline</h1>
          <p className="mt-1 text-sm text-text-muted">Prospects you are working, by stage. Lost prospects are in the List, under Stage: Lost.</p>
        </div>
        <div role="group" aria-label="Show prospects as" className="flex gap-2">
          <button type="button" data-view="board" aria-pressed={!list} className={chip(!list)} onClick={() => setParams(withSources(new URLSearchParams(), params.getAll("source")), { replace: true })}>Board</button>
          <button type="button" data-view="list" aria-pressed={list} className={chip(list)} onClick={() => setParams(withSources(new URLSearchParams({ view: "list" }), params.getAll("source")), { replace: true })}>List</button>
        </div>
      </header>
      {list ? <ListView /> : <BoardView />}
    </div>
  );
}
