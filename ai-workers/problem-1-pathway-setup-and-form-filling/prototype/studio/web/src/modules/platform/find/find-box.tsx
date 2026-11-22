// PF-30s (BACKLOG row PF-30s; concept screens/PF-30s/concept.md r2; map row 102, P-586; AG17-D6; AG-02): the one find box
// in the top bar of every staff page. "/" opens it (Cmd+K stays the command launcher); after 2 characters and a 250 ms
// pause it asks PF-30a's `GET /api/platform/find` and lists the hits in the API's rank order under their group words,
// each with what matched; the first row is marked as Enter's target, arrows move the mark, Enter opens it, Escape closes
// then clears, Tab leaves. An ARIA 1.2 combobox with a list popup (automatic selection); a polite live region says the
// count, empty, partial and error lines. Below 640 px it is a Find button that opens the box across the header. Nothing
// typed is stored: no browser autocomplete, no history, no cache, no address; it is cleared when a record opens.
import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { staffApi, StaffApiError } from "../session";
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
  const [wide, setWide] = React.useState(false);   // below 640 px: the box is open across the header
  const [state, setState] = React.useState<State>({ at: "idle" });
  const [active, setActive] = React.useState(0);

  const focusBox = React.useCallback(() => { setWide(true); setOpen(true); requestAnimationFrame(() => { input.current?.focus(); input.current?.select(); }); }, []);
  // "/" from anywhere on the page, unless the person is typing in a field or a dialog is open (BR-1).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (slashOpens(e, document)) { e.preventDefault(); focusBox(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusBox]);

  const reset = React.useCallback(() => { seq.current++; setText(""); setOpen(false); setWide(false); setState({ at: "idle" }); setActive(0); }, []);
  // A new page closes and clears the box.
  React.useEffect(() => { reset(); }, [loc.pathname, reset]);

  // Ask after the pause; an older request is cancelled, and a late answer for an older text never replaces a newer one (BR-2, BR-7).
  React.useEffect(() => {
    const n = ++seq.current;
    const q = sendable(text);
    setActive(0);
    if (!q) { setState([...text.trim()].length > 100 ? { at: "tooLong" } : { at: "idle" }); return; }
    setState((s) => ({ at: "searching", last: s.at === "done" ? s.answer : s.at === "searching" ? s.last : null }));
    const t = setTimeout(() => {
      staffApi<FindAnswer>(`/platform/find?q=${encodeURIComponent(q)}`)
        .then((answer) => { if (seq.current === n) setState({ at: "done", answer }); })
        // A 401 has ended the session (the frame shows the sign-in card), so no error line on top of it (challenge m10).
        .catch((e) => { if (seq.current === n) setState(e instanceof StaffApiError && e.status === 401 ? { at: "idle" } : { at: "error" }); });
    }, FIND_PAUSE_MS);
    return () => clearTimeout(t);
  }, [text]);

  const answer = state.at === "done" ? state.answer : state.at === "searching" ? state.last : null;
  const groups = answer ? grouped(answer) : [];
  const flat: FindHit[] = groups.flatMap((g) => g.hits);
  const count = flat.length;
  const optionId = (h: FindHit) => `${id}-opt-${h.kind}-${h.id}`;
  const go = (h: FindHit) => { reset(); input.current?.blur(); nav(h.url); };
  const showList = open && state.at !== "idle";
  const mark = showList && count ? Math.min(active, count - 1) : -1;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;   // an input-method composition: Enter ends it, never opens a row
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!count) return;
      e.preventDefault(); setOpen(true);
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % count : (a - 1 + count) % count));
    } else if (e.key === "Enter") {
      if (state.at === "done" && mark >= 0) { e.preventDefault(); go(flat[mark]); }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (showList) setOpen(false); else if (text) setText(""); else { setWide(false); input.current?.blur(); }
    } else if (e.key === "Tab") setOpen(false);
  };

  const line = state.at === "searching" && !answer ? WORDS.searching
    : state.at === "tooLong" ? WORDS.tooLong
      : state.at === "error" ? WORDS.error
        : state.at === "done" ? (count ? WORDS.count(count) : answer?.partial ? WORDS.emptyPartial : WORDS.empty) : "";
  // "Searching…" is shown, never announced on every key (challenge m11).
  const said = open && state.at !== "searching" ? [answer?.message, line].filter(Boolean).join(". ") : "";
  return (
    <div className="min-w-0 sm:relative" data-find>
      <button type="button" onClick={focusBox} aria-label={WORDS.label} title={`${WORDS.label} (press /)`} data-find-open
        className={cn("inline-flex size-11 items-center justify-center rounded-lg text-text-muted outline-none hover:bg-text/5 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:hidden", wide && "hidden")}>
        <Search className="size-5" aria-hidden />
      </button>
      <div className={cn("items-center gap-2 sm:relative sm:flex", wide ? "fixed inset-x-0 top-0 z-40 flex h-14 border-b border-border bg-surface-raised px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:p-0" : "hidden")}>
        <label htmlFor={`${id}-input`} className="sr-only">{WORDS.label}</label>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            ref={input} id={`${id}-input`} type="text" role="combobox" autoComplete="off" autoCorrect="off" spellCheck={false}
            aria-expanded={showList} aria-controls={`${id}-list`} aria-autocomplete="list"
            aria-activedescendant={mark >= 0 ? optionId(flat[mark]) : undefined}
            value={text} placeholder={WORDS.placeholder} data-find-input
            onChange={(e) => { setText(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={(e) => { if (!e.currentTarget.closest("[data-find]")?.contains(e.relatedTarget as Node | null)) setOpen(false); }}
            onKeyDown={onKeyDown}
            className="h-9 w-full rounded-lg border border-border-strong bg-surface-raised pl-8 pr-8 text-sm text-text placeholder:text-text-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-56 lg:w-64"
          />
          <kbd aria-hidden className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1 text-[11px] text-text-muted lg:block">/</kbd>
        </div>
        <button type="button" onClick={reset} aria-label="Close search" data-find-close className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-text/5 sm:hidden"><X className="size-5" aria-hidden /></button>
        <p role="status" aria-live="polite" className="sr-only" data-find-live>{said}</p>
        {showList ? (
          <div className="fixed inset-x-4 top-14 z-40 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:w-[28rem]" data-find-popup>
            {answer?.message ? <p className="px-3 py-2 text-xs font-medium text-text-warn" data-find-partial>{answer.message}</p> : null}
            {line && !(state.at === "done" && count) ? <p className={cn("px-3 py-2 text-sm", state.at === "error" ? "text-danger" : "text-text-muted")} data-find-line={state.at}>{line}</p> : null}
            <div id={`${id}-list`} role="listbox" aria-label={WORDS.label} hidden={!count}>
              {groups.map((g, gi) => (
                <div key={g.label} role="group" aria-labelledby={`${id}-g${gi}`} data-find-group={g.label}>
                  <p id={`${id}-g${gi}`} role="presentation" className="px-3 pb-1 pt-2 text-xs font-medium text-text-muted">{g.label}</p>
                  {g.hits.map((h) => {
                    const n = flat.indexOf(h), m = h.matched_on.includes("NAME") || h.matched_on.includes("NUMBER") ? marked(h.title, text) : null;
                    return (
                      <div key={`${h.kind}${h.id}`} id={optionId(h)} role="option" aria-selected={n === mark} data-find-hit={h.kind}
                        onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(n)} onClick={() => go(h)}
                        className={cn("flex cursor-pointer flex-col rounded-md px-3 py-1.5 text-sm", n === mark ? "bg-primary/10" : "hover:bg-text/5")}>
                        <span className="[overflow-wrap:anywhere] font-medium">{m ? <>{m.before}<mark className="rounded-sm bg-primary/15 text-inherit">{m.match}</mark>{m.after}</> : h.title}</span>
                        <span className="text-xs text-text-muted">{[h.subtitle, `Matched: ${h.matched_on.map((x) => MATCHED_WORDS[x]).join(", ")}`].filter(Boolean).join(" · ")}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {state.at === "done" && count ? <p className="px-3 pb-1 pt-2 text-xs text-text-muted" aria-hidden data-find-count>{line}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
