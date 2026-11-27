// PF-21rs B1 (review M1, STANDARDS §3.2 "Pick, don't type"; concept §4 "firms picked from the list", challenge m7): one firm
// picked by name from our firm list (GET /api/system/firms?q=, after 300 ms and 2+ letters; each search writes one
// cross-firm read line, as Record a breach's picker). Used by Log a request and by Hold a firm's data.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input } from "@/components/ui/controls";
import { FirmsPage } from "../contract";
import { systemApi, SystemApiError, useSystemToken } from "../session";
import { COPY, firmWords } from "./contract";

export type Firm = { id: string; name: string | null };

export function OneFirm({ chosen, onChange, error, legend = "Firm", optional }: { chosen: Firm | null; onChange: (f: Firm | null) => void; error?: string; legend?: string; optional?: boolean }) {
  const token = useSystemToken(), [q, setQ] = React.useState(""), [term, setTerm] = React.useState("");
  const box = React.useRef<HTMLInputElement>(null), change = React.useRef<HTMLButtonElement>(null), was = React.useRef(chosen);
  React.useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  // The pressed button goes away either way: the focus moves to what replaces it (WCAG 2.4.3).
  React.useEffect(() => { if (chosen && !was.current) change.current?.focus(); else if (!chosen && was.current) box.current?.focus(); was.current = chosen; }, [chosen]);
  const found = useQuery({ queryKey: ["sys", "firm-pick", term, token], enabled: !!token && term.length >= 2 && !chosen, retry: false,
    queryFn: async () => FirmsPage.parse(await systemApi(`/firms?q=${encodeURIComponent(term)}`)).firms.map((f) => ({ id: f.id, name: f.name })) });
  const say = q.trim().length > 0 && q.trim().length < 2 ? COPY.firmsSearchShort : found.isError ? (found.error instanceof SystemApiError ? found.error.message : COPY.firmsFailed)
    : term.length >= 2 && found.data && !found.data.length ? COPY.firmsNone : "";
  return (
    <fieldset className="flex flex-col gap-2" data-firm-picker>
      <legend className="text-xs font-medium text-text">{legend}{optional ? <span className="font-normal text-text-muted"> (optional)</span> : null}</legend>
      {chosen ? <p className="flex flex-wrap items-center gap-2 text-sm" data-chosen-firm={chosen.id}><span className="[overflow-wrap:anywhere]">{firmWords(chosen)}</span>
        <Button ref={change} type="button" variant="ghost" size="sm" aria-label={`Change the firm (${firmWords(chosen)})`} onClick={() => onChange(null)}>Change</Button></p>
        : <><label className="flex flex-col gap-1"><span className="sr-only">Find a firm by name</span>
          <Input ref={box} type="search" placeholder="Find a firm by name" value={q} onChange={(e) => setQ(e.target.value)} aria-invalid={error ? true : undefined} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} data-firm-search /></label>
          {found.data?.length ? <ul aria-label="Matching firms" className="flex flex-col gap-1">{found.data.slice(0, 8).map((f) => <li key={f.id}>
            <Button type="button" variant="outline" size="sm" className="h-auto min-h-8 whitespace-normal text-left" onClick={() => onChange(f)} data-add-firm={f.id}>Choose {firmWords(f)}</Button></li>)}</ul> : null}
          <p role="status" className="text-xs text-text-muted">{say}{found.data && found.data.length > 8 ? COPY.firmsMore : ""}</p></>}
      {error ? <p role="alert" className="text-xs text-text-danger">{error}</p> : null}
    </fieldset>
  );
}
