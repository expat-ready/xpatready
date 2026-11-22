// PF-30s (BACKLOG row PF-30s; concept screens/PF-30s/concept.md; map row 102, P-586; AG17-D6; AG-02): the one find box in
// the top bar of every staff page. "/" opens it (Cmd+K stays the command launcher); after 2 characters and a 250 ms pause
// it asks PF-30a's `GET /api/platform/find` and lists the hits grouped Leads and prospects, Companies, Clients, Cases,
// People on cases, each with what matched; Enter opens the active row or the first, arrows move, Escape closes then
// clears. An ARIA 1.2 combobox with a list popup; a polite live region says the count, empty, partial and error lines.
// Nothing typed is stored (no history, no address, no log): BR-8 of the row's batch 5.
import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { staffApi } from "../session";
import { grouped, MATCHED_WORDS, marked, sendable, slashOpens, WORDS, type FindAnswer, type FindHit } from "./find-words";

/** The pause after the last key before the box asks (BACKLOG PF-30s). */
export const FIND_PAUSE_MS = 250;

type State =
  | { at: "idle" }
  | { at: "tooLong" }
  | { at: "searching"; last: FindAnswer | null }
  | { at: "done"; answer: FindAnswer }
  | { at: "error" };

export function FindBox() {
  const nav = useNavigate();
  const loc = useLocation();
  const id = React.useId();
  const input = React.useRef<HTMLInputElement>(null);
  const seq = React.useRef(0);
  const [text, setText] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState<State>({ at: "idle" });
  const [active, setActive] = React.useState(-1);

  // "/" from anywhere on the page, unless the person is typing in a field (BR-1).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (slashOpens(e)) { e.preventDefault(); input.current?.focus(); input.current?.select(); setOpen(true); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // A new page closes and clears the box.
  React.useEffect(() => { setText(""); setOpen(false); setState({ at: "idle" }); setActive(-1); seq.current++; }, [loc.pathname]);

  // Ask after the pause; a late answer for an older text never replaces a newer one (BR-2, BR-7).
  React.useEffect(() => {
    const n = ++seq.current;
    const q = sendable(text);
    setActive(-1);
    if (!q) { setState([...text.trim()].length > 100 ? { at: "tooLong" } : { at: "idle" }); return; }
    setState((s) => ({ at: "searching", last: s.at === "done" ? s.answer : s.at === "searching" ? s.last : null }));
    const t = setTimeout(() => {
      staffApi<FindAnswer>(`/platform/find?q=${encodeURIComponent(q)}`)
        .then((answer) => { if (seq.current === n) setState({ at: "done", answer }); })
        .catch(() => { if (seq.current === n) setState({ at: "error" }); });
    }, FIND_PAUSE_MS);
    return () => clearTimeout(t);
  }, [text]);

  const answer = state.at === "done" ? state.answer : state.at === "searching" ? state.last : null;
  const groups = answer ? grouped(answer) : [];
  const flat: FindHit[] = groups.flatMap((g) => g.hits);
  const count = flat.length;
  const optionId = (i: number) => `${id}-hit-${i}`;
  const go = (h: FindHit) => { setOpen(false); setText(""); input.current?.blur(); nav(h.url); };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!count) return;
      e.preventDefault(); setOpen(true);
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % count : a <= 0 ? count - 1 : a - 1));
    } else if (e.key === "Enter") {
      const h = flat[active >= 0 ? active : 0];
      if (h && state.at === "done") { e.preventDefault(); go(h); }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (open && text) { setOpen(false); setActive(-1); } else { setText(""); setOpen(false); }
    }
  };

  const line = state.at === "searching" && !answer ? WORDS.searching
    : state.at === "tooLong" ? WORDS.tooLong
      : state.at === "error" ? WORDS.error
        : state.at === "done" ? (count ? WORDS.count(count) : WORDS.empty) : "";
  const showList = open && state.at !== "idle";
  let i = -1;
  return (
    <div className="relative min-w-0 flex-1 sm:flex-none" data-find>
      <label htmlFor={`${id}-input`} className="sr-only">{WORDS.label}</label>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
      <input
        ref={input} id={`${id}-input`} type="search" role="combobox" autoComplete="off" spellCheck={false}
        aria-expanded={showList} aria-controls={`${id}-list`} aria-autocomplete="list" aria-describedby={`${id}-key`}
        aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
        value={text} placeholder={WORDS.placeholder} data-find-input
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={(e) => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node | null)) setOpen(false); }}
        onKeyDown={onKeyDown}
        className="h-9 w-full min-w-[8rem] rounded-lg border border-border-strong bg-surface-raised pl-8 pr-7 text-sm text-text placeholder:text-text-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-64 [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd id={`${id}-key`} aria-label="Press slash to search" className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1 text-[11px] text-text-muted sm:block">/</kbd>
      <p role="status" aria-live="polite" className="sr-only" data-find-live>{open ? [answer?.message, line].filter(Boolean).join(". ") : ""}</p>
      {showList ? (
        <div className="absolute right-0 top-full z-40 mt-1 max-h-[70vh] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 shadow-lg" data-find-popup>
          {answer?.message ? <p className="px-3 py-2 text-xs font-medium text-text-warn" data-find-partial>{answer.message}</p> : null}
          {line && !(state.at === "done" && count) ? <p className={cn("px-3 py-2 text-sm", state.at === "error" ? "text-danger" : "text-text-muted")} data-find-line={state.at}>{line}</p> : null}
          <div id={`${id}-list`} role="listbox" aria-label={WORDS.label} hidden={!count}>
            {groups.map((g, gi) => (
              <div key={g.label} role="group" aria-labelledby={`${id}-g${gi}`} data-find-group={g.label}>
                <p id={`${id}-g${gi}`} role="presentation" className="px-3 pb-1 pt-2 text-xs font-medium text-text-muted">{g.label}</p>
                {g.hits.map((h) => {
                  const n = ++i, m = marked(h.title, text);
                  return (
                    <div key={`${h.kind}${h.id}`} id={optionId(n)} role="option" aria-selected={n === active} data-find-hit={h.kind}
                      onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(n)} onClick={() => go(h)}
                      className={cn("flex cursor-pointer flex-col rounded-md px-3 py-1.5 text-sm", n === active ? "bg-primary/10" : "hover:bg-text/5")}>
                      <span className="[overflow-wrap:anywhere] font-medium">{m ? <>{m.before}<mark className="rounded-sm bg-primary/15 text-inherit">{m.match}</mark>{m.after}</> : h.title}</span>
                      <span className="text-xs text-text-muted">{[h.subtitle, `Matched: ${h.matched_on.map((x) => MATCHED_WORDS[x]).join(", ")}`].filter(Boolean).join(" · ")}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
