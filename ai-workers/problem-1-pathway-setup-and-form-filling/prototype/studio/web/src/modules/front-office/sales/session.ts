// FO-4 part 1: the firm staff member's session for the sales screens. The platform and front-office routes take a bearer
// token (PF-4's guard), not the Studio's simulated person, so these pages call them through `staffApi`, never `api`.
// The token is kept for this browser tab only (sessionStorage). Sign-in is PF-4's local stand-in
// (`POST /api/platform/session/local`) until the firm's own sign-in screens land (PF-6 on PF-4b's web session).
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Me, problemOf, type Problem } from "./contract";

const KEY = "xr-staff-session";
type Stored = { token: string; expiresAt: number };

function read(): Stored | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Stored | null;
    return s && typeof s.token === "string" && typeof s.expiresAt === "number" && s.expiresAt > Date.now() ? s : null;
  } catch { return null; }
}
const listeners = new Set<() => void>();
function changed() { for (const l of listeners) l(); }
export function setStaffToken(token: string | null, expiresInSeconds = 3600) {
  try {
    if (token) sessionStorage.setItem(KEY, JSON.stringify({ token, expiresAt: Date.now() + expiresInSeconds * 1000 } satisfies Stored));
    else sessionStorage.removeItem(KEY);
  } catch { /* storage refused: the session lasts until the page reloads */ }
  changed();
}
/** The token, or null when signed out or expired. */
export const staffToken = () => read()?.token ?? null;
export function useStaffToken() {
  const [, force] = React.useState(0);
  React.useEffect(() => { const l = () => force((n) => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  return staffToken();
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
    if (res.status === 401 && token) setStaffToken(null);
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
