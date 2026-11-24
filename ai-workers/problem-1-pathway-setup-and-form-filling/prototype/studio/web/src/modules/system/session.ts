// PF-17 part 4 PR B (R1.93; concept r2 §4a, BR-2): our console's own session, apart from the firm staff's
// (modules/platform/session.ts). The token from PF-4s's sign-in is kept for this tab only, sessionStorage
// "xr-system-session" {token, expiresAt} (the firm side's shape under its own key, j_93's), with an in-memory copy when
// storage is refused. It ends at its expiry or on any 401, and the sign-in card says why. Two planes, two helpers:
// `systemApi` sends only this token and only to /api/system; the firm side's `staffApi` never reads this key, so neither
// token reaches the other's routes (PF-4s's wall refuses them on the server too). Every console answer is a ["sys", …]
// query, dropped whenever the session changes.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/api";
import { problemOf, type Problem } from "@/modules/front-office/sales/contract";
import { SESSION_KEY, SystemMe } from "./contract";

type Stored = { token: string; expiresAt: number };
let memory: Stored | null = null, memoryOnly = false;
/** Why the last session ended: the 401's code (TOKEN_EXPIRED, SESSION_REVOKED, …), or null (signed out, or never in). */
let ended: string | null = null;
const listeners = new Set<() => void>();
const changed = () => { for (const l of listeners) l(); };

function read(): Stored | null {
  let s: Stored | null = memory;
  if (!memoryOnly) try { const kept = sessionStorage.getItem(SESSION_KEY); if (kept !== null) s = JSON.parse(kept) as Stored | null; } catch { /* storage refused: memory only */ }
  return s && typeof s.token === "string" && typeof s.expiresAt === "number" && s.expiresAt > Date.now() ? s : null;
}

export function setSystemToken(token: string | null, expiresInSeconds = 3600) {
  memory = token ? { token, expiresAt: Date.now() + expiresInSeconds * 1000 } : null;
  if (token) ended = null;
  try { if (memory) sessionStorage.setItem(SESSION_KEY, JSON.stringify(memory)); else sessionStorage.removeItem(SESSION_KEY); }
  catch { memoryOnly = true; }
  queryClient.removeQueries({ queryKey: ["sys"] });   // a new person (or none) never sees the last one's rows
  changed();
}
/** Ends the session here and says why (null: signed out on purpose). */
export function endSystemSession(because: string | null) { ended = because; setSystemToken(null); }
export const systemToken = () => read()?.token ?? null;

function useChanges() {
  const [, force] = React.useState(0);
  React.useEffect(() => { const l = () => force((n) => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
}
/** The token, or null; the session ends at its expiry even when nothing is clicked. */
export function useSystemToken() {
  useChanges();
  const s = read();
  React.useEffect(() => {
    if (!s) { if (memory || (() => { try { return sessionStorage.getItem(SESSION_KEY) !== null; } catch { return false; } })()) endSystemSession("TOKEN_EXPIRED"); return; }
    const t = setTimeout(() => endSystemSession("TOKEN_EXPIRED"), Math.min(s.expiresAt - Date.now(), 2_147_000_000));
    return () => clearTimeout(t);
  }, [s?.token, s?.expiresAt]);   // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the stored session
  return s?.token ?? null;
}
export function useSystemSessionEnd() { useChanges(); return ended; }

export class SystemApiError extends Error {
  constructor(readonly status: number, readonly problem: Problem) { super(problem.detail ?? problem.title ?? `${status}`); }
}
/** One call to /api/system with our token only. A 401 ends the session here (the card shows again). */
export async function systemApi<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const token = systemToken();
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.json !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`/api/system${path}`, { method: init.method ?? "GET", headers, body: init.json === undefined ? undefined : JSON.stringify(init.json) });
  const text = await res.text();
  const data: unknown = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const problem = problemOf(data, res.status);
    // A late answer for a session already replaced leaves the new one alone.
    if (res.status === 401 && systemToken() === token && token) endSystemSession(problem.code ?? "NOT_SIGNED_IN");
    throw new SystemApiError(res.status, problem);
  }
  return data as T;
}

/** Who is signed in to the console (`GET /api/system/me`): name, roles and system/* keys. */
export function useSystemMe() {
  const token = useSystemToken();
  return useQuery({ queryKey: ["sys", "me", token], enabled: !!token, retry: false, queryFn: async () => SystemMe.parse(await systemApi("/me")) });
}
/** PF-4s's local stand-in sign-in (the server refuses it unless PLATFORM_SYSTEM_IDENTITY=local, local only). */
export async function systemSignIn(email: string) {
  const r = await systemApi<{ token: string; expiresIn: number }>("/session/local", { method: "POST", json: { email, secondStep: true } });
  setSystemToken(r.token, r.expiresIn);
}
