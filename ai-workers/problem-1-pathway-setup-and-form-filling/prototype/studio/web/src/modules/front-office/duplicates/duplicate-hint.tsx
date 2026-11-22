// FO-9s part 1 (R1.29; concept screens/FO-9s/concept.md r3, board design/fo9s-boards.html S1): the warning in Add a lead.
// BR-1 warn, don't block: it never disables Save. BR-3 the people the adder may open, strongest first, with what matched
// in words. BR-4 another match they may not open is the nameless line only. BR-5 one place to choose: "Use this person"
// per match, and its last line is the Add as new button; a choice is shown in its place with Change. BR-5b after "Use this
// person", the typed email and phone the pick did not match are offered, pre-ticked, to keep in the lead's first note.
// Persons only here; the company match (Engage as Corporate, add contact) mounts with FO-4c's screens.
import * as React from "react";
import { Button } from "@/components/ui/controls";
import { reasonWords, type PersonMatch } from "./contract";
import type { CheckState } from "./use-duplicate-check";

export type DupChoice = { kind: "person"; personId: string; name: string; reasons: PersonMatch["reasons"] } | { kind: "new" };

/** BR-5b: the typed details the picked person did not match (no EMAIL or PHONE reason for them). Pure. */
export function unmatchedDetails(choice: DupChoice | null, typed: { email: string; phone: string }): string[] {
  if (!choice || choice.kind !== "person") return [];
  const has = (k: "EMAIL" | "PHONE") => choice.reasons.some((r) => r.key === k);
  return [...(typed.email.trim() && !has("EMAIL") ? [typed.email.trim()] : []), ...(typed.phone.trim() && !has("PHONE") ? [typed.phone.trim()] : [])];
}
/** The line Save adds to the first note when the offered details are kept. */
export const keptLine = (details: string[]) => `Also gave: ${details.join(" · ")}`;

/** The hint's title, or the choice's line, or "" (review m1: one always-mounted live region reads it, so a screen
 *  reader hears each change once, without the buttons). Pure. */
export function hintAnnouncement(state: CheckState, choice: DupChoice | null): string {
  if (choice) return choice.kind === "person" ? `Adding to ${choice.name}'s record.` : "A new person will be made.";
  if (state.status !== "done") return "";
  const n = state.out.matches.filter((m) => m.kind === "PERSON").length;
  if (n) return `${n === 1 ? "1 person" : `${n} people`} on file ${n === 1 ? "looks" : "look"} like this person.`;
  return state.out.hidden ? "Someone on file may be this person." : "";
}

export function DuplicateHint({ state, choice, onChoose, keep, onKeep, typed, disabled }: {
  state: CheckState; choice: DupChoice | null; onChoose: (c: DupChoice | null) => void;
  keep: boolean; onKeep: (k: boolean) => void; typed: { email: string; phone: string }; disabled?: boolean;
}) {
  const box = "flex flex-col gap-2 rounded-lg border p-3 text-sm";
  // Review M2: the pressed button goes away, so focus moves on purpose: to Change after a pick, to the first match after
  // Change. A choice cleared by editing a key moves nothing (the adder is typing).
  const next = React.useRef<"change" | "first" | null>(null), changeBtn = React.useRef<HTMLButtonElement>(null), hintBox = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (next.current === "change") changeBtn.current?.focus();
    else if (next.current === "first") hintBox.current?.querySelector<HTMLButtonElement>("button")?.focus();
    next.current = null;
  });
  const pick = (c: DupChoice | null) => { next.current = c ? "change" : "first"; onChoose(c); };
  if (choice) {
    const extra = unmatchedDetails(choice, typed);
    return (
      <div data-dup-choice className={`${box} border-border bg-surface-raised`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{choice.kind === "person" ? `Adding to ${choice.name}'s record.` : "A new person will be made."}</span>
          <Button ref={changeBtn} type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => pick(null)}>Change</Button>
        </div>
        {extra.length ? (
          <label className="flex items-start gap-2">
            <input type="checkbox" data-dup-keep className="mt-1" checked={keep} disabled={disabled} onChange={(e) => onKeep(e.target.checked)} />
            <span className="min-w-0 [overflow-wrap:anywhere]">{keep ? <>Also keep in the lead&apos;s first note: {extra.join(" · ")}</> : <span className="text-text-warn">Not saved: {extra.join(" · ")}</span>}</span>
          </label>
        ) : null}
      </div>
    );
  }
  if (state.status === "checking") return <p data-dup-checking className="text-xs text-text-muted">Checking for people on file…</p>;
  if (state.status !== "done") return null;
  const people = state.out.matches.filter((m): m is PersonMatch => m.kind === "PERSON");
  if (!people.length && !state.out.hidden) return null;
  const count = people.length;
  return (
    <div data-dup-hint ref={hintBox} className={`${box} border-border border-l-4 border-l-warn bg-surface-raised`}>
      <p className="font-medium">{count ? `${count === 1 ? "1 person" : `${count} people`} on file ${count === 1 ? "looks" : "look"} like this person.` : "Someone on file may be this person."}</p>
      {people.map((m) => (
        <div key={m.personId} data-dup-match className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2">
          <div className="min-w-0"><div className="font-medium [overflow-wrap:anywhere]">{m.name}{m.lead ? <span className="font-normal text-text-muted"> · {m.lead}</span> : null}</div><div className="text-xs text-text-muted">{reasonWords(m.reasons)}</div></div>
          <Button type="button" size="sm" variant="outline" disabled={disabled} aria-label={`Use this person: ${m.name}${m.lead ? `, ${m.lead}` : ""}`} onClick={() => pick({ kind: "person", personId: m.personId, name: m.name, reasons: m.reasons })}>Use this person</Button>
        </div>
      ))}
      {state.out.hidden ? <p data-dup-hidden className="text-xs text-text-muted">{state.out.hiddenLine ?? "Possible match with a record you cannot open — ask a manager"}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-text-muted">None of these? A new person is made.</span>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => pick({ kind: "new" })}>Add as new</Button>
      </div>
    </div>
  );
}
