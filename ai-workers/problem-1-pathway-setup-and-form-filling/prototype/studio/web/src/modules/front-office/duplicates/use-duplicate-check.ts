// FO-9s part 1, BR-2 (concept r3): when the duplicate check runs. A key leaves focus (email, phone, or the name: First
// and Last name are one key, sent only with a first name, Minor 2) → 400 ms later one request; one at a time, and the
// newest details win (an answer for older details is dropped). An edit to a key clears the answer (`clear`). A refused
// or failed check shows nothing: Save still works, and the server's own check on Save still applies (BR-1).
import * as React from "react";
import { staffApi } from "../sales/session";
import { DuplicateCheckOut } from "./contract";

export type Keys = { givenNames: string; familyName: string; email: string; phone: string };
export type CheckBody = Partial<Record<keyof Keys, string>>;
export type CheckState = { status: "idle" } | { status: "checking" } | { status: "failed" } | { status: "done"; out: DuplicateCheckOut };

/** The body for the details as typed, or null when there is nothing to check (pure; the browser check pins it). */
export function checkBody(k: Keys): CheckBody | null {
  const g = k.givenNames.trim(), f = k.familyName.trim(), e = k.email.trim(), p = k.phone.trim();
  const b: CheckBody = {};
  if (g) { b.givenNames = g; if (f) b.familyName = f; }
  if (e) b.email = e;
  if (p) b.phone = p;
  return Object.keys(b).length ? b : null;
}

export const CHECK_DELAY_MS = 400;

export function useDuplicateCheck() {
  const [state, setState] = React.useState<CheckState>({ status: "idle" });
  const seq = React.useRef(0), busy = React.useRef(false), queued = React.useRef<CheckBody | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined), last = React.useRef("");
  const send = React.useCallback(async (body: CheckBody) => {
    busy.current = true;
    const mine = ++seq.current;
    setState({ status: "checking" });
    try {
      const out = DuplicateCheckOut.parse(await staffApi("/front-office/duplicates/check", { method: "POST", json: body }));
      if (mine === seq.current) setState({ status: "done", out });
    } catch {
      // Review m4: a failed check may be asked again for the same details (leaving the field retries).
      if (mine === seq.current) { setState({ status: "failed" }); last.current = ""; }
    } finally {
      busy.current = false;
      const next = queued.current; queued.current = null;
      if (next) void send(next);
    }
  }, []);
  /** A key left focus: check these details, unless they are the ones already checked. */
  const request = React.useCallback((body: CheckBody | null) => {
    if (!body) return;
    const key = JSON.stringify(body);
    if (key === last.current) return;
    last.current = key;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (busy.current) queued.current = body; else void send(body); }, CHECK_DELAY_MS);
  }, [send]);
  /** A key changed: the answer was for details no longer there. */
  const clear = React.useCallback(() => {
    seq.current++; clearTimeout(timer.current); queued.current = null; last.current = "";
    setState((s) => (s.status === "idle" ? s : { status: "idle" }));
  }, []);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  return { state, request, clear };
}
