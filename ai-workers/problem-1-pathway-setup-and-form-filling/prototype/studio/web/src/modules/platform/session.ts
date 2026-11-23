// PF-6 part 1 (brief lead-b-briefs/PF-6.md; was FO-4 part 1's sales/session.ts, moved here unchanged in behaviour): the
// firm staff member's session. The platform and front-office routes take a bearer token (PF-4's guard), not the Studio's
// simulated person, so firm-staff pages call them through `staffApi`, never `api`. The token is kept for this browser tab
// only (sessionStorage, with an in-memory fallback): AG1-D20 (6)'s "not readable by page script" is the client portal's
// rule (CP-1-91), not staff's. New here: why the session ended (`useSessionEnd`, AG-1-55's "Signed in elsewhere").
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/api";
import { Me, problemOf, type Problem } from "@/modules/front-office/sales/contract";
const KEY = "xr-staff-session";
type Stored = { token: string; expiresAt: number };
/** The session in memory too, so a browser that refuses storage keeps it until the page reloads (Devin #1822). */
let memory: Stored | null = null;
/** Set once a write to storage is refused (a full quota, a blocked origin): from then on the memory copy is the only one, so a
 *  stale stored session never shadows a newer sign-in or a sign-out (break M3). */
let memoryOnly = false;
/** Why the last session ended: the 401's code (SIGNED_IN_ELSEWHERE, SESSION_REVOKED, TOKEN_EXPIRED, NOT_SIGNED_IN, …), or null. */
let ended: string | null = null;
function read(): Stored | null {
  let s: Stored | null = memory;
  if (!memoryOnly) try { const kept = sessionStorage.getItem(KEY); if (kept !== null) s = JSON.parse(kept) as Stored | null; } catch { /* storage refused: memory only */ }
  return s && typeof s.token === "string" && typeof s.expiresAt === "number" && s.expiresAt > Date.now() ? s : null;
}
const listeners = new Set<() => void>();
function changed() { for (const l of listeners) l(); }
/** Every answer a staff page keeps: front office ["fo", …] and platform ["pf", …]. */
const STAFF_KEYS = [["fo"], ["pf"]] as const;
export function setStaffToken(token: string | null, expiresInSeconds = 3600) {
  memory = token ? { token, expiresAt: Date.now() + expiresInSeconds * 1000 } : null;
  if (token) ended = null;   // a new sign-in clears the last end reason
  try {
    if (memory) sessionStorage.setItem(KEY, JSON.stringify(memory));
    else sessionStorage.removeItem(KEY);
  } catch { memoryOnly = true; /* storage refused: the session lasts in memory until the page reloads */ }
  // A new person (or none) never sees the last person's rows (break S2): every staff answer is dropped.
  for (const queryKey of STAFF_KEYS) queryClient.removeQueries({ queryKey });
  changed();
}
/** Ends the session here and says why (null: no reason to show, e.g. the person signed out or chose to sign in again). */
export function endSession(because: string | null) { ended = because; setStaffToken(null); }
/** Forgets the end reason (the "Sign in again here" button opens the sign-in card). */
export function clearSessionEnd() { if (ended !== null) { ended = null; changed(); } }
/** The token, or null when signed out or expired. */
export const staffToken = () => read()?.token ?? null;
/** PF-31 break B1 (round 3: the person, not the session): who this tab's shared drafts and workspace tabs belong to: a
 *  one-way hash of the token's issuer and subject (the staff member), never the token itself, or null when signed out. The
 *  same person signing in again after an expiry or "signed in elsewhere" gets their drafts and tabs back; anyone else never. */
export function staffScope(): string | null {
  const t = staffToken();
  if (!t) return null;
  let who = t;   // not a JWT: the token itself (a new session is then a new owner)
  try { const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { iss?: unknown; sub?: unknown }; if (typeof p.sub === "string" && p.sub) who = `${String(p.iss ?? "")}|${p.sub}`; } catch { /* not a JWT */ }
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < who.length; i++) { const c = who.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 15); }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}
/** Runs on every change of the session (sign-in, sign-out, end); `staffScope()` says who it is now. */
export function onStaffChange(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }
function useChanges() {
  const [, force] = React.useState(0);
  React.useEffect(() => { const l = () => force((n) => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
}
export function useStaffToken() {
  useChanges();
  // The session ends at its expiry even when nothing is clicked (break S1): the sign-in card shows then.
  const s = read();
  React.useEffect(() => {
    if (!s) return;
    const t = setTimeout(() => endSession("TOKEN_EXPIRED"), Math.min(s.expiresAt - Date.now(), 2_147_000_000));
    return () => clearTimeout(t);
  }, [s?.token, s?.expiresAt]);   // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the stored session
  return s?.token ?? null;
}
/** Why the last session ended (the 401's code), until a new sign-in or `clearSessionEnd`. */
export function useSessionEnd() { useChanges(); return ended; }
/** A refused call: the server's plain reason (Problem Details `detail`), its code and field errors. */
export class StaffApiError extends Error {
  constructor(readonly status: number, readonly problem: Problem) { super(problem.detail ?? problem.title ?? `${status}`); }
  field(name: string) { return this.problem.fields?.[name] ?? null; }
}
/** One call to a staff route with the bearer token. A 401 ends the session here (the sign-in card shows again).
 *  `headers` (PF-21i): extra request headers, passed through as given (e.g. a create's Idempotency-Key). */
export async function staffApi<T>(path: string, init: { method?: string; json?: unknown; /** PF-18s part 2: a multipart body (the browser sets its type). */ form?: FormData; headers?: Record<string, string> } = {}): Promise<T> {
  const token = staffToken();
  const headers: Record<string, string> = { ...init.headers, accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.json !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`/api${path}`, { method: init.method ?? "GET", headers, body: init.form ?? (init.json === undefined ? undefined : JSON.stringify(init.json)) });
  const text = await res.text();
  const data: unknown = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const problem = problemOf(data, res.status);
    // Any 401 ends the session here, also one whose token expired before this call (break S1); a session that was
    // sent keeps the server's reason (AG-1-55: "You signed in on another device").
    // A late answer for a session already replaced (signed out, then someone signed in) leaves the new one alone (break m2).
    if (res.status === 401 && staffToken() === token) { if (token) endSession(problem.code ?? "NOT_SIGNED_IN"); else setStaffToken(null); }
    throw new StaffApiError(res.status, problem);
  }
  return data as T;
}
/** Who is signed in: roles, permission keys and duties (`GET /api/platform/me`). */
export function useMe() {
  const token = useStaffToken();
  return useQuery({ queryKey: ["fo", "me", token], enabled: !!token, retry: false, queryFn: async () => Me.parse(await staffApi("/platform/me")) });
}
/** PF-4's local stand-in sign-in (the server refuses it unless PLATFORM_IDENTITY=local). */
export function useLocalSignIn() {
  const qc = useQueryClient();
  return async (firmKey: string, email: string) => {
    const r = await staffApi<{ token: string; expiresIn: number }>("/platform/session/local", { method: "POST", json: { firmKey, email, secondStep: true } });
    setStaffToken(r.token, r.expiresIn);
    for (const queryKey of STAFF_KEYS) await qc.invalidateQueries({ queryKey });
  };
}
