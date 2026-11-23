// PF-31 (EXPERIENCE §2.13, "work in many tabs"): one shared draft per record. Inside the app every workspace tab and every
// view reads the same in-memory store, so a change typed in one view shows in every other at once. A second browser window
// of the same app is reached through a BroadcastChannel (same origin, no server); each window keeps its drafts in its own
// sessionStorage, so a reload keeps them. Nothing reaches the server until Save, which writes once, with the last value and
// the version the draft started from (If-Match); after a save every window drops the draft and reads the record again.
import * as React from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

type Entry = { values: unknown; base: unknown; version: string | null };
type Msg =
  | { t: "draft"; key: string; entry: Entry | null; from: string }
  | { t: "open" | "close"; key: string; from: string; reply?: boolean }
  | { t: "saved"; key: string; queryKey: QueryKey | null; from: string };

const VIEW = Math.random().toString(36).slice(2);
const STORE = "xr.draft.";
const entries = new Map<string, Entry | null>();
const others = new Map<string, Set<string>>();   // key → the other windows that show it
const mine = new Map<string, number>();          // key → how many views here show it
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
let channel: BroadcastChannel | null = null;
try { channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("xr-sync"); } catch { channel = null; }
const post = (m: Msg) => { try { channel?.postMessage(m); } catch { /* the bridge is best effort; this window still works */ } };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function read(key: string): Entry | null {
  if (entries.has(key)) return entries.get(key) ?? null;
  let e: Entry | null = null;
  try { const s = sessionStorage.getItem(STORE + key); if (s) e = JSON.parse(s) as Entry; } catch { /* storage refused: memory only */ }
  entries.set(key, e);
  return e;
}
function write(key: string, e: Entry | null, from: string) {
  if (e && same(e.values, e.base)) e = null;   // a draft equal to the saved record is no draft
  entries.set(key, e);
  try { if (e) sessionStorage.setItem(STORE + key, JSON.stringify(e)); else sessionStorage.removeItem(STORE + key); } catch { /* memory only */ }
  if (from === VIEW) post({ t: "draft", key, entry: e, from: VIEW });
  emit();
}
let invalidate: ((k: QueryKey) => void) | null = null;
channel?.addEventListener("message", (ev: MessageEvent<Msg>) => {
  const m = ev.data;
  if (!m || m.from === VIEW) return;
  if (m.t === "draft") { write(m.key, m.entry, m.from); return; }
  if (m.t === "saved") { write(m.key, null, m.from); if (m.queryKey && invalidate) invalidate(m.queryKey); return; }
  const set = others.get(m.key) ?? new Set<string>();
  if (m.t === "open") {
    set.add(m.from);
    // A window that just opened the record learns that this one shows it too, and gets its draft.
    if (!m.reply && mine.get(m.key)) { post({ t: "open", key: m.key, from: VIEW, reply: true }); const e = read(m.key); if (e) post({ t: "draft", key: m.key, entry: e, from: VIEW }); }
  } else set.delete(m.from);
  others.set(m.key, set);
  emit();
});
if (typeof window !== "undefined") window.addEventListener("pagehide", () => { for (const [key, n] of mine) if (n) post({ t: "close", key, from: VIEW }); });

const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x);
/** The fields `values` changed from `base` ([""] for a plain value that changed). */
export function changedKeys(values: unknown, base: unknown): string[] {
  if (!isObj(values) || !isObj(base)) return same(values, base) ? [] : [""];
  return Object.keys(values).filter((k) => !same(values[k], base[k]));
}
/** My changes (values vs my base) carried onto a newer record. */
export function mineOnto<T>(values: unknown, base: unknown, newer: T): T {
  if (!isObj(values) || !isObj(base) || !isObj(newer)) return values as T;
  const out: Record<string, unknown> = { ...newer };
  for (const k of changedKeys(values, base)) out[k] = values[k];
  return out as T;
}
/** Any unsaved draft in this window (the leave-page guard). */
export const anyDraft = () => [...entries.values()].some(Boolean);
/** Test and tab-close hook: drop one record's draft here and in every window. */
export function discardDraft(key: string) { write(key, null, VIEW); }

export type SharedDraft<T> = {
  /** What the form shows: the draft when there is one, else the saved record. */
  values: T | undefined;
  /** The saved record the draft started from (diff against this when building the save). */
  base: T | undefined;
  set: (next: T | ((v: T) => T)) => void;
  /** The draft differs from the saved record. */
  dirty: boolean;
  /** The version the draft started from: the save sends it as If-Match. */
  version: string | null;
  /** Other browser windows showing this record now. */
  otherWindows: number;
  discard: () => void;
  /** After a 200: the draft goes, and every window reads the record again. */
  saved: () => void;
  /** After a 409: keep what was typed, on top of the newer record (EXPERIENCE §4 conflict: "keep mine"): only the fields I
   *  changed; the rest take the newer record. */
  rebase: (base: T, version: string) => void;
  /** The fields this draft changed (a plain value: [""] when changed). The conflict state shows only these as "Yours". */
  mine: () => string[];
};

/** One record's shared draft. `key` names the record ("platform-office:<id>"); `base` and `version` are the saved record
 *  as last read (undefined while loading); `queryKey` is what every window reads again after a save. */
export function useSharedDraft<T>(key: string | null, base: T | undefined, version: string | null | undefined, queryKey?: QueryKey): SharedDraft<T> {
  const qc = useQueryClient();
  invalidate ??= (k) => void qc.invalidateQueries({ queryKey: k });
  const entry = React.useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => (key ? read(key) : null));
  const otherWindows = React.useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => (key ? others.get(key)?.size ?? 0 : 0));
  React.useEffect(() => {
    if (!key) return;
    mine.set(key, (mine.get(key) ?? 0) + 1);
    post({ t: "open", key, from: VIEW });
    const kept = read(key);   // a draft kept over a reload (or a tab mounted late) reaches the windows already open
    if (kept) post({ t: "draft", key, entry: kept, from: VIEW });
    return () => { const n = (mine.get(key) ?? 1) - 1; mine.set(key, n); if (!n) post({ t: "close", key, from: VIEW }); };
  }, [key]);
  const set = React.useCallback((next: T | ((v: T) => T)) => {
    if (!key || base === undefined) return;
    const cur = read(key);
    const from = (cur ? cur.values : base) as T;
    const values = typeof next === "function" ? (next as (v: T) => T)(from) : next;
    write(key, { values, base: cur ? cur.base : base, version: cur ? cur.version : version ?? null }, VIEW);
  }, [key, base, version]);
  return {
    values: entry ? (entry.values as T) : base,
    base: entry ? (entry.base as T) : base,
    set,
    dirty: !!entry,
    version: entry ? entry.version : version ?? null,
    otherWindows,
    discard: () => { if (key) write(key, null, VIEW); },
    saved: () => { if (!key) return; write(key, null, VIEW); post({ t: "saved", key, queryKey: queryKey ?? null, from: VIEW }); },
    // Review M1: only what I changed rides on the newer record; a field someone else changed and I did not keeps theirs.
    rebase: (b, v) => { if (key) write(key, { values: entry ? mineOnto(entry.values, entry.base, b) : b, base: b, version: v }, VIEW); },
    mine: () => (entry ? changedKeys(entry.values, entry.base) : []),
  };
}

/** The line under a form with unsaved changes (EXPERIENCE §2.13): what is unsaved, and where else the record is open. */
export function DraftLine({ draft, what }: { draft: Pick<SharedDraft<unknown>, "dirty" | "otherWindows">; what: string }) {
  if (!draft.dirty && !draft.otherWindows) return null;
  const elsewhere = draft.otherWindows ? `also open in ${draft.otherWindows} other window${draft.otherWindows === 1 ? "" : "s"}` : "";
  return <p role="status" data-draft-line className="text-xs text-text-muted">{draft.dirty ? `Unsaved changes to ${what}${elsewhere ? `, ${elsewhere}` : ""}. Nothing is saved until you press Save.` : `This ${what} is ${elsewhere}.`}</p>;
}
