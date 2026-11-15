// FO-4 part 1: the firm staff member's session for the sales screens. The platform and front-office routes take a bearer
// token (PF-4's guard), not the Studio's simulated person, so these pages call them through `staffApi`, never `api`.
// The token is kept for this browser tab only (sessionStorage). Sign-in is PF-4's local stand-in
// (`POST /api/platform/session/local`) until the firm's own sign-in screens land (PF-6 on PF-4b's web session).
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/api";
import { Me, problemOf, type Problem } from "./contract";
const KEY = "xr-staff-session";
type Stored = { token: string; expiresAt: number };
/** The session in memory too, so a browser that refuses storage keeps it until the page reloads (Devin #1822). */
let memory: Stored | null = null;
function read(): Stored | null {
  let s: Stored | null = memory;
  try { const kept = sessionStorage.getItem(KEY); if (kept !== null) s = JSON.parse(kept) as Stored | null; } catch { /* storage refused: memory only */ }
  return s && typeof s.token === "string" && typeof s.expiresAt === "number" && s.expiresAt > Date.now() ? s : null;
}
const listeners = new Set<() => void>();
function changed() { for (const l of listeners) l(); }
export function setStaffToken(token: string | null, expiresInSeconds = 3600) {
  memory = token ? { token, expiresAt: Date.now() + expiresInSeconds * 1000 } : null;
  try {
    if (memory) sessionStorage.setItem(KEY, JSON.stringify(memory));
    else sessionStorage.removeItem(KEY);
  } catch { /* storage refused: the session lasts in memory until the page reloads */ }
  // A new person (or none) never sees the last person's rows (break S2): every sales answer is dropped.
  queryClient.removeQueries({ queryKey: ["fo"] });
  changed();
}
/** The token, or null when signed out or expired. */
export const staffToken = () => read()?.token ?? null;
export function useStaffToken() {
  const [, force] = React.useState(0);
  React.useEffect(() => { const l = () => force((n) => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  // The session ends at its expiry even when nothing is clicked (break S1): the sign-in card shows then.
  const s = read();
  React.useEffect(() => {
    if (!s) return;
    const t = setTimeout(() => setStaffToken(null), Math.min(s.expiresAt - Date.now(), 2_147_000_000));
    return () => clearTimeout(t);
  }, [s?.token, s?.expiresAt]);   // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the stored session
  return s?.token ?? null;
}
/** A refused call: the server's plain reason (Problem Details `detail`), its code and field errors. */
export class StaffApiError extends Error {
  constructor(readonly status: number, readonly problem: Problem) { super(problem.detail ?? problem.title ?? `${status}`); }
  field(name: string) { return this.problem.fields?.[name] ?? null; }
}
/** One call to a staff route with the bearer token. A 401 ends the session here (the sign-in card shows again). */
export async function staffApi<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const token = staffToken();
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.json !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`/api${path}`, { method: init.method ?? "GET", headers, body: init.json === undefined ? undefined : JSON.stringify(init.json) });
  const text = await res.text();
  const data: unknown = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    // Any 401 ends the session here, also one whose token expired before this call (break S1).
    if (res.status === 401) setStaffToken(null);
    throw new StaffApiError(res.status, problemOf(data, res.status));
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
    await qc.invalidateQueries({ queryKey: ["fo"] });
  };
}
