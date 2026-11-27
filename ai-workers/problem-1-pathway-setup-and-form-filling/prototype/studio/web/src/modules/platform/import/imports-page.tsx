// PF-10s (R1.35; concept §4 "Imports page", Library list pattern; BR-5; AG-18-5, -56): My account → Import, the firm's
// imports newest first, 50 a page. "New import" and the template only with agent/import:run (challenge m2); the list
// with agent/import:view-report. Each row opens where its state is (challenge m3). The server decides; this page shows.
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Pill, Table } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/empty-state";
import { Loading } from "@/modules/front-office/sales/loading";
import { PlatformFrame, usePlatformStaff } from "../frame";
import { staffApi, StaffApiError } from "../session";
import { COPY, KEY, List, stateWords, Targets, templateCsv } from "./contract";

const day = (iso: string) => new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export function useTargets(enabled: boolean) {
  return useQuery({ queryKey: ["pf", "imports", "targets"], enabled, queryFn: async () => Targets.parse(await staffApi("/platform/imports/targets")) });
}
/** The People template as a file the browser saves (AG-18-5). */
export function TemplateButton({ variant = "outline" }: { variant?: "outline" | "default" }) {
  const targets = useTargets(true);
  const people = targets.data?.targets.find((t) => t.key === "person");
  if (!people) return null;
  const save = () => {
    const url = URL.createObjectURL(new Blob([templateCsv(people.fields)], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "people-import-template.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <Button variant={variant} onClick={save} data-template-download>{COPY.template}</Button>;
}

function Body() {
  const me = usePlatformStaff(), navigate = useNavigate();
  const views = me.keys.includes(KEY.view), runs = me.keys.includes(KEY.run);
  const [page, setPage] = React.useState(1);
  const list = useQuery({ queryKey: ["pf", "imports", "list", page], enabled: views, queryFn: async () => List.parse(await staffApi(`/platform/imports?page=${page}`)) });
  if (!views) return <EmptyState data-no-access title={COPY.noAccess} description={COPY.noAccessAsk} titleLevel={1} />;
  const items = list.data?.imports ?? [], pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text">{COPY.title}</h1>
          <p className="mt-1 text-sm text-text-muted">{COPY.subtitle}</p>
        </div>
        {runs ? <div className="flex flex-wrap gap-2">{items.length ? <TemplateButton /> : null}<Button onClick={() => navigate("/platform/import/new")} data-new-import>{COPY.newImport}</Button></div> : null}
      </header>
      {list.isPending ? <Loading label="Loading imports" />
        : list.isError ? <p role="alert" className="text-sm text-text-danger">{list.error instanceof StaffApiError ? list.error.message : "Could not load the imports."} <Button variant="link" size="sm" onClick={() => list.refetch()}>Try again</Button></p>
          : !items.length ? <EmptyState data-empty title={COPY.empty} description={runs ? COPY.emptyHelp : "Imports your firm makes are listed here."} titleLevel={2} action={runs ? <TemplateButton variant="default" /> : undefined} />
            : (
              <div className="flex flex-col gap-3">
                <Table label="Imports" head={["Started", "What", "Source", "State", "Created", "Merged", "Skipped", "Errors"]}>
                  {items.map((b) => {
                    const s = stateWords(b.state, b.counts);
                    return (
                      <tr key={b.id} data-import-row={b.id} data-state={b.state}>
                        <td className="whitespace-nowrap"><Link to={`/platform/import/${b.id}`} className="font-medium text-text-link hover:underline">{day(b.createdAt)}</Link></td>
                        <td>{b.targetLabel}</td>
                        <td className="max-w-56"><span className="block truncate" title={b.sourceName}>{b.sourceName}</span></td>
                        <td><Pill tone={s.tone}>{s.text}</Pill></td>
                        <td className="tabular-nums">{b.counts.created}</td><td className="tabular-nums">{b.counts.merged}</td><td className="tabular-nums">{b.counts.skipped}</td><td className="tabular-nums">{b.counts.errors}</td>
                      </tr>
                    );
                  })}
                </Table>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
                  <span>{list.data!.total} import{list.data!.total === 1 ? "" : "s"}. Times in UTC.</span>
                  {pages > 1 ? <span className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></span> : null}
                </div>
              </div>
            )}
    </div>
  );
}

export function ImportsPage() {
  return <PlatformFrame crumbs={[{ label: COPY.title }]}><Body /></PlatformFrame>;
}
