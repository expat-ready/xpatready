// PF-31 (EXPERIENCE §2.13, the founder's choice of 23 Nov: tabs drawn inside the app, the console pattern of Salesforce's
// Service Console, Dynamics 365's multisession workspace and Zendesk's agent workspace): the workspace tab strip.
//  * Each open item is an app tab with its own router: its own address, scroll and form state. Only the active tab is shown;
//    the others stay mounted, so nothing typed is lost, but out of the document (each tab renders through a portal into its
//    own box, and only the active box is attached): the page has one main, one heading and one set of page tabs (Lead 13 on
//    #3193: hidden copies broke every page check that reads `main`, `h1` or a tab list). The address bar shows the active tab's address, so links,
//    refresh and Back still work.
//  * A left-menu link or a record link (`data-workspace-open`) opens its item in a tab, or focuses the tab that already shows
//    it: the same record never opens twice. Ctrl/Cmd-click or middle-click on any link opens a tab in the background. Any
//    other link moves the current tab, unless another tab already shows that item, which is then focused.
//  * Open tabs come back after a reload (sessionStorage, per browser tab); at most 12, with a message at the limit. A tab
//    closes with its ×, a middle-click, Delete on the focused tab or Alt+Shift+W; a tab with unsaved changes shows a dot and
//    asks before it closes. Alt+PageDown / Alt+PageUp move between tabs (browsers keep Ctrl+W, Ctrl+Tab and Ctrl+PageDown).
//  * The strip is navigation between addresses, so it is `nav "Open items"` with `aria-current="page"` on the shown item, not
//    ARIA tabs (APG: tabs switch panels inside one page; a second tablist also collided with every page's own tabs). Arrow
//    keys, Home and End move along it; below 768 px it folds into an "Open items" menu.
import * as React from "react";
import { createPortal } from "react-dom";
import { createPath, NavigationType, parsePath, Router, type To } from "react-router-dom";
import { X } from "lucide-react";
import { FoldArrow } from "@/components/fold-out";
import { anyDraft, discardDraft, draftsAt, useDraftTick } from "@/lib/sync/drafts";
import { onStaffChange, sessionEndReason, staffScope } from "@/modules/platform/session";
import { cn } from "@/lib/utils";

export const TAB_CAP = 12;
const STORE = "xr.workspace.v1";
/** Whose tabs these are (break B1): the staff member (staffScope()), or "local" where no staff session applies (Product
 *  Studio and the case area run on simulated people). Each owner keeps its own list (`xr.workspace.v1:<owner>`), so signing
 *  out never overwrites the person's tabs, and the same person signing in again gets them back. */
const ownerNow = () => staffScope() ?? "local";
const storeOf = (owner: string) => `${STORE}:${owner}`;
type Tab = { id: string; path: string; title: string; nav: number; type: NavigationType; scroll: number; state?: unknown };
/** The item a tab shows: its address without query or hash ("/platform/offices/abc"). Two tabs never share one. */
export const itemOf = (path: string) => { const p = parsePath(path).pathname || "/"; return p.length > 1 ? p.replace(/\/+$/, "") : p; };
/** Who a page runs as (BR-1): the Studio (the simulated configuration person), the case area with its client pages (the
 *  simulated case person), or the firm staff pages (the staff session). A link into another of them changes the person, so
 *  the workspace never opens it as an in-app tab (a background tab would change who you are); Ctrl-click opens a browser
 *  tab, as before PF-31. Sign-in, the link page and the demo inbox are each their own. */
const personAreaOf = (path: string) => { const p = itemOf(path); return /^\/(cases|clients)(\/|$)/.test(p) ? "cases" : /^\/(platform|front-office)(\/|$)/.test(p) ? "staff" : /^\/(sign-in|link|inbox)(\/|$)/.test(p) ? p : "studio"; };
const here = () => window.location.pathname + window.location.search + window.location.hash;
const newId = () => Math.random().toString(36).slice(2, 10);
/** Until a page names itself: the address's last part in words. */
const guess = (path: string) => { const last = itemOf(path).split("/").filter(Boolean).pop(); return last ? decodeURIComponent(last).replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Home"; };

type Ws = { tabs: Tab[]; active: string; notice: string | null; activate: (id: string) => void; close: (id: string) => void; dirty: Set<string>; mounted: Set<string> };
const WsCtx = React.createContext<Ws | null>(null);
type TabApi = { id: string; active: boolean; leave: (path: string) => void; setTitle: (t: string | null, page: boolean) => void; setDirty: (owner: string, d: boolean, discard?: () => void) => void };
const TabCtx = React.createContext<TabApi | null>(null);
/** Inside a workspace tab: whether it is the one shown (dialogs and panels of a hidden tab stay closed). True outside one. */
export const useTabActive = () => React.useContext(TabCtx)?.active ?? true;
/** A record's tab is done (its panel closed or saved): go to `path`. When another tab already shows it (the list the record
 *  was opened from), this tab closes and that one comes forward; otherwise this tab moves there (review M2). */
export function useLeaveTab(): ((path: string) => void) | null { return React.useContext(TabCtx)?.leave ?? null; }
/** Focus the tab of `id` in the shown strip (after a close or a keyboard move, review S4). */
const focusTab = (id: string) => requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-ws-panel="${id}"] [data-ws-tab="${id}"]`)?.focus());
/** A page names its tab ("Office: Calgary"); without one the frame's place line names it (`fromFrame`). */
export function useTabTitle(title: string | null, fromFrame = false) {
  const t = React.useContext(TabCtx);
  React.useEffect(() => { if (!t) return; t.setTitle(title, !fromFrame); return () => { if (!fromFrame) t.setTitle(null, true); }; }, [t, title, fromFrame]);
}
/** A form marks its tab as holding unsaved changes; `discard` runs when the person closes the tab anyway. */
export function useTabDirty(dirty: boolean, discard: () => void) {
  const t = React.useContext(TabCtx), owner = React.useId(), d = React.useRef(discard);
  d.current = discard;
  React.useEffect(() => { t?.setDirty(owner, dirty, () => d.current()); return () => t?.setDirty(owner, false); }, [t, owner, dirty]);
}

/** A kept tab is used only when well formed (break m1: a bad title blanked the app) and an app address (not "//host"). */
const keptTab = (t: unknown): t is { id: string; path: string; title: string } => {
  const x = t as { id?: unknown; path?: unknown; title?: unknown } | null;
  return !!x && typeof x.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(x.id) && typeof x.path === "string" && x.path.startsWith("/") && !x.path.startsWith("//") && x.path.length <= 2000 && typeof x.title === "string";
};
/** The tabs kept in this browser tab, only when they are this session's (break B1: never the last person's). */
function load(): { tabs: Tab[]; active: string; dropped: boolean } {
  let tabs: Tab[] = [];
  try {
    const s = JSON.parse(sessionStorage.getItem(storeOf(ownerNow())) ?? "null") as { tabs?: unknown } | null;
    if (s && Array.isArray(s.tabs))
      tabs = s.tabs.filter(keptTab).slice(0, TAB_CAP).map((t) => ({ id: t.id, path: t.path, title: t.title.slice(0, 200), nav: 0, type: NavigationType.Pop, scroll: 0 }));
  } catch { /* none kept */ }
  const cur = here(), same = tabs.find((t) => itemOf(t.path) === itemOf(cur));
  if (same) { same.path = cur; return { tabs, active: same.id, dropped: false }; }
  const t: Tab = { id: newId(), path: cur, title: guess(cur), nav: 0, type: NavigationType.Pop, scroll: 0 };
  let dropped = false;
  if (tabs.length >= TAB_CAP) {   // break M2: at the cap, a tab without unsaved changes makes room, and the person is told
    const free = tabs.map((x, i) => [x, i] as const).reverse().find(([x]) => !draftsAt(itemOf(x.path)).length);
    tabs.splice(free ? free[1] : tabs.length - 1, 1); dropped = true;
  }
  return { tabs: [...tabs, t], active: t.id, dropped };
}

/** Replaces BrowserRouter: one router per open tab; `children` (the app's routes) render once in each. */
export function WorkspaceRouter({ children }: { children: React.ReactNode }) {
  const [{ tabs, active, dropped }, setWs] = React.useState<{ tabs: Tab[]; active: string; dropped?: boolean }>(load);
  const [notice, setNotice] = React.useState<string | null>(dropped ? `${TAB_CAP} items were open, the most at once, so one was closed to show this page.` : null);
  const [mounted, setMounted] = React.useState(() => new Set([active]));
  const dirtyOwners = React.useRef(new Map<string, Map<string, () => void>>());
  const slot = React.useRef<HTMLDivElement>(null);   // where the shown tab's box is attached
  const shownOwner = React.useRef(ownerNow());        // whose tabs these are (kept under their key)
  const [dirty, setDirtySet] = React.useState(new Set<string>());
  const now = React.useRef({ tabs, active });
  now.current = { tabs, active };

  React.useEffect(() => {
    try { sessionStorage.setItem(storeOf(shownOwner.current), JSON.stringify({ tabs: tabs.map(({ id, path, title }) => ({ id, path, title })), active })); } catch { /* not kept */ }
  }, [tabs, active]);
  React.useEffect(() => { setMounted((m) => (m.has(active) ? m : new Set(m).add(active))); }, [active]);
  React.useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 6000); return () => clearTimeout(t); }, [notice]);

  const show = React.useCallback((id: string, path?: string, how: "push" | "replace" = "push") => {
    const { tabs: ts, active: a } = now.current;
    const to = ts.find((t) => t.id === id); if (!to) return;
    const next = path ?? to.path, scroll = window.scrollY;
    setWs((s) => ({ active: id, tabs: s.tabs.map((t) => (t.id === a && t.id !== id ? { ...t, scroll } : t.id === id ? { ...t, path: next, nav: t.nav + (path ? 1 : 0), type: path ? NavigationType.Push : t.type } : t)) }));
    if (next !== here()) window.history[how === "push" ? "pushState" : "replaceState"]({ ws: id }, "", next);
    if (id !== a) requestAnimationFrame(() => window.scrollTo(0, to.scroll));
  }, []);
  const open = React.useCallback((path: string, focus: boolean) => {
    const ts = now.current.tabs, has = ts.find((t) => itemOf(t.path) === itemOf(path));
    if (has) { if (focus) show(has.id, path); return; }
    if (ts.length >= TAB_CAP) { setNotice(`${TAB_CAP} items are open, the most at once. Close one to open another.`); return; }
    const t: Tab = { id: newId(), path, title: guess(path), nav: 0, type: NavigationType.Push, scroll: 0 };
    setWs((s) => ({ ...s, tabs: [...s.tabs, t] }));
    setMounted((m) => new Set(m).add(t.id));
    if (focus) { now.current = { ...now.current, tabs: [...ts, t] }; show(t.id); }
  }, [show]);
  const close = React.useCallback((id: string) => {
    const { tabs: ts, active: a } = now.current;
    if (ts.length < 2) return;
    const owners = dirtyOwners.current.get(id), tab = ts.find((t) => t.id === id), kept = tab ? draftsAt(itemOf(tab.path)) : [];
    if (owners?.size || kept.length) {   // break M2: a tab not mounted since a reload still has its stored draft
      if (!window.confirm("This tab has unsaved changes. Close it and discard them?")) return;
      for (const discard of owners?.values() ?? []) discard();
      for (const k of kept) discardDraft(k);
    }
    const i = ts.findIndex((t) => t.id === id), rest = ts.filter((t) => t.id !== id);
    if (id === a) { const n = rest[Math.min(i, rest.length - 1)]; now.current = { tabs: rest, active: n.id }; setWs({ tabs: rest, active: n.id }); window.history.pushState({ ws: n.id }, "", n.path); requestAnimationFrame(() => window.scrollTo(0, n.scroll)); focusTab(n.id); }
    else { setWs((s) => ({ ...s, tabs: s.tabs.filter((t) => t.id !== id) })); focusTab(a); }   // round 2 Should 2: focus stays on the strip
    setMounted((m) => { const c = new Set(m); c.delete(id); return c; });
  }, []);
  /** A move inside a tab: another tab that shows the item is focused instead (the same record never opens twice). */
  const move = React.useCallback((id: string, to: To, how: "push" | "replace", state?: unknown) => {
    const path = typeof to === "string" ? to : createPath(to), { tabs: ts } = now.current;
    const other = ts.find((t) => t.id !== id && itemOf(t.path) === itemOf(path));
    if (other) { show(other.id, path); return; }
    setWs((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id === id ? { ...t, path, state, nav: t.nav + 1, type: how === "push" ? NavigationType.Push : NavigationType.Replace } : t)) }));
    if (id === now.current.active) window.history[how === "push" ? "pushState" : "replaceState"]({ ws: id }, "", path);
  }, [show]);
  const leave = React.useCallback((id: string, path: string) => {
    const other = now.current.tabs.find((t) => t.id !== id && itemOf(t.path) === itemOf(path));
    if (!other) { move(id, path, "replace"); return; }
    // This tab goes and the other comes forward in one step (no neighbour flashes in between).
    const scroll = other.scroll, rest = now.current.tabs.filter((t) => t.id !== id);
    now.current = { tabs: rest, active: other.id };
    setWs((s) => ({ active: other.id, tabs: s.tabs.filter((t) => t.id !== id).map((t) => (t.id === other.id ? { ...t, path, nav: t.nav + 1, type: NavigationType.Push } : t)) }));
    setMounted((m) => { const c = new Set(m); c.delete(id); return c; });
    window.history.pushState({ ws: other.id }, "", path);
    requestAnimationFrame(() => window.scrollTo(0, scroll));
    focusTab(other.id);   // round 2 Should 1: the closed panel's focus goes to the tab that comes forward, not to <body>
  }, [move]);

  // Back and Forward: the tab that shows the address comes forward, else the active tab follows it.
  React.useEffect(() => {
    const pop = () => {
      const cur = here(), { tabs: ts, active: a } = now.current, t = ts.find((x) => itemOf(x.path) === itemOf(cur)) ?? ts.find((x) => x.id === a)!;
      setWs((s) => ({ active: t.id, tabs: s.tabs.map((x) => (x.id === t.id ? { ...x, path: cur, nav: x.nav + 1, type: NavigationType.Pop } : x)) }));
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  // Links: inside a workspace frame, Ctrl/Cmd/middle-click opens a background tab; a menu or record link opens or focuses one.
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !a.closest("[data-workspace]") || (a.target && a.target !== "_self") || a.hasAttribute("download") || a.origin !== window.location.origin || /^\/api\//.test(a.pathname)) return;   // a file or API link is not an app page
      const path = a.pathname + a.search + a.hash;
      if (personAreaOf(path) !== personAreaOf(here())) return;   // another area runs as another person: the browser's own way (Lead 13)
      const background = e.type === "auxclick" ? e.button === 1 : e.button === 0 && (e.ctrlKey || e.metaKey) && !e.shiftKey;
      const opens = e.type === "click" && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && !!a.closest("[data-workspace-open]");
      if (!background && !opens) return;
      e.preventDefault(); e.stopPropagation();
      open(path, opens);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || !document.querySelector("[data-workspace]")) return;
      const { tabs: ts, active: a } = now.current, i = ts.findIndex((t) => t.id === a);
      if (e.key === "PageDown" || e.key === "PageUp") { e.preventDefault(); const n = ts[(i + (e.key === "PageDown" ? 1 : ts.length - 1)) % ts.length].id; show(n); focusTab(n); }
      else if (e.shiftKey && e.code === "KeyW") { e.preventDefault(); close(a); }
    };
    const leave = (e: BeforeUnloadEvent) => { if (anyDraft()) { e.preventDefault(); e.returnValue = ""; } };
    document.addEventListener("click", onClick, true); document.addEventListener("auxclick", onClick, true);
    document.addEventListener("keydown", onKey); window.addEventListener("beforeunload", leave);
    return () => { document.removeEventListener("click", onClick, true); document.removeEventListener("auxclick", onClick, true); document.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", leave); };
  }, [open, close, show]);

  const setDirty = React.useCallback((id: string, owner: string, d: boolean, discard?: () => void) => {
    const m = dirtyOwners.current.get(id) ?? new Map<string, () => void>();
    if (d && discard) m.set(owner, discard); else m.delete(owner);
    dirtyOwners.current.set(id, m);
    setDirtySet((s) => { if (s.has(id) === m.size > 0) return s; const c = new Set(s); if (m.size) c.add(id); else c.delete(id); return c; });
  }, []);
  // Break B1: a change of person shows that owner's own tabs (none: this page alone); signing in as someone else also drops
  // every other staff member's kept tabs in this browser tab. Round 3: the same person after an expiry gets theirs back.
  // Lead 13: a session that ends by itself changes nothing on the screen (each page says the session was lost, in place);
  // the tabs stay that person's, and the next sign-in decides: the same person carries on, anyone else starts afresh.
  React.useEffect(() => onStaffChange(() => {
      const owner = ownerNow(), was = shownOwner.current;
      if (owner === was) return;
      if (owner === "local" && sessionEndReason()) return;   // ended by itself: the screen stays as it is
      if (owner === "local" && was !== "local") try { sessionStorage.removeItem(storeOf(was)); } catch { /* none kept */ }   // signed out on purpose: their tabs go
      shownOwner.current = owner;
      if (owner !== "local") try { for (const k of Object.keys(sessionStorage)) if (k.startsWith(`${STORE}:`) && k !== storeOf(owner) && k !== storeOf("local")) sessionStorage.removeItem(k); } catch { /* none kept */ }
      const next = load();
      now.current = { tabs: next.tabs, active: next.active };
      dirtyOwners.current.clear(); setDirtySet(new Set()); setMounted(new Set([next.active])); setWs({ tabs: next.tabs, active: next.active });
    }), []);
  // Break M2: a tab with a stored draft shows its dot even when it is not mounted.
  const tick = useDraftTick();
  const dirtyAll = React.useMemo(() => new Set([...dirty, ...tabs.filter((t) => draftsAt(itemOf(t.path)).length).map((t) => t.id)]), [dirty, tabs, tick]);   // eslint-disable-line react-hooks/exhaustive-deps -- tick: any draft change
  const ws: Ws = { tabs, active, notice, activate: show, close: (id) => close(id), dirty: dirtyAll, mounted };
  return (
    <WsCtx.Provider value={ws}>
      <div ref={slot} className="contents" data-ws-slot />
      {tabs.filter((t) => mounted.has(t.id)).map((t) => <TabHost key={t.id} tab={t} active={t.id === active} slot={slot} move={move} leave={leave} setDirty={setDirty}
        setTitle={(title) => setWs((s) => (s.tabs.find((x) => x.id === t.id)?.title === title ? s : { ...s, tabs: s.tabs.map((x) => (x.id === t.id ? { ...x, title } : x)) }))}>{children}</TabHost>)}
    </WsCtx.Provider>
  );
}

function TabHost({ tab, active, slot, move, leave, setDirty, setTitle, children }: { tab: Tab; active: boolean; slot: React.RefObject<HTMLDivElement | null>; move: (id: string, to: To, how: "push" | "replace", state?: unknown) => void; leave: (id: string, path: string) => void;
  setDirty: (id: string, owner: string, d: boolean, discard?: () => void) => void; setTitle: (t: string) => void; children: React.ReactNode }) {
  const p = parsePath(tab.path);
  const location = React.useMemo(() => ({ pathname: p.pathname || "/", search: p.search ?? "", hash: p.hash ?? "", state: tab.state ?? null, key: `${tab.id}-${tab.nav}` }), [tab.path, tab.nav, tab.state]);   // eslint-disable-line react-hooks/exhaustive-deps -- the parsed path is tab.path
  const set = React.useRef(setTitle); set.current = setTitle;
  const names = React.useRef<{ page: string | null; frame: string | null }>({ page: null, frame: null });
  const navigator = React.useMemo(() => ({
    createHref: (to: To) => (typeof to === "string" ? to : createPath(to)),
    push: (to: To, state?: unknown) => move(tab.id, to, "push", state),
    replace: (to: To, state?: unknown) => move(tab.id, to, "replace", state),
    go: (n: number) => window.history.go(n),
  }), [tab.id, move]);
  const api = React.useMemo<TabApi>(() => ({ id: tab.id, active, leave: (path) => leave(tab.id, path), setTitle: (t, page) => { names.current[page ? "page" : "frame"] = t; const n = names.current.page ?? names.current.frame; if (n) set.current(n); }, setDirty: (o, d, discard) => setDirty(tab.id, o, d, discard) }), [tab.id, active, setDirty, leave]);
  // The tab's own box: React keeps everything in it while the tab is hidden, but only the shown tab's box is in the document.
  const [box] = React.useState(() => { const d = document.createElement("div"); d.dataset.wsPanel = tab.id; return d; });
  React.useLayoutEffect(() => {
    const host = slot.current;
    if (!active || !host) return;
    host.appendChild(box);
    return () => { box.remove(); };
  }, [active, box, slot]);
  return createPortal(<TabCtx.Provider value={api}><Router location={location} navigationType={tab.type} navigator={navigator}>{children}</Router></TabCtx.Provider>, box);
}

/** The strip under the header (drawn by Frame for staff areas). Below 768 px: an "Open items" menu. */
export function WorkspaceStrip() {
  const ws = React.useContext(WsCtx), me = React.useContext(TabCtx);
  const [menu, setMenu] = React.useState(false);
  const refs = React.useRef(new Map<string, HTMLButtonElement>());
  const box = React.useRef<HTMLDivElement>(null), shownHere = !!me?.active;
  // Side panels start below the strip (controls.tsx Panel reads --ws-top), so a record's panel never hides the open items.
  React.useLayoutEffect(() => {
    const el = box.current, root = document.documentElement;
    if (!el || !shownHere) return;
    const put = () => root.style.setProperty("--ws-top", `${56 + el.offsetHeight}px`);
    put(); const ro = new ResizeObserver(put); ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty("--ws-top"); };
  }, [shownHere]);
  if (!ws || !me) return null;
  const { tabs, active } = ws;
  const go = (i: number) => { const t = tabs[(i + tabs.length) % tabs.length]; ws.activate(t.id); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-ws-panel="${t.id}"] [data-ws-tab="${t.id}"]`)?.focus()); };
  const onKey = (e: React.KeyboardEvent, i: number, id: string) => {
    if (e.key === "ArrowRight") go(i + 1); else if (e.key === "ArrowLeft") go(i - 1); else if (e.key === "Home") go(0); else if (e.key === "End") go(tabs.length - 1);
    else if (e.key === "Delete" && tabs.length > 1) ws.close(id); else return;   // close() focuses the next tab
    e.preventDefault();
  };
  const name = (t: Tab) => `${t.title}${ws.dirty.has(t.id) ? " (unsaved changes)" : ""}`;
  return (
    <div ref={box} className="pointer-events-auto sticky top-14 z-20 border-b border-border bg-surface" data-workspace-strip>
      {/* Break M3: each tab is `relative`, so its absolutely placed sr-only text stays inside the strip's own scroll and never widens the page. */}
      <nav aria-label="Open items" className="hidden min-w-0 items-end gap-1 overflow-x-auto px-3 pt-1.5 md:flex" data-ws-strip>
        {tabs.map((t, i) => {
          const on = t.id === active;
          return (
            <button key={t.id} ref={(el) => { if (el) refs.current.set(t.id, el); }} type="button" aria-current={on ? "page" : undefined} tabIndex={on ? 0 : -1} title={t.path}
              aria-keyshortcuts={tabs.length > 1 ? "Delete" : undefined} data-ws-tab={t.id} data-ws-path={t.path}
              onClick={() => ws.activate(t.id)} onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); ws.close(t.id); } }} onKeyDown={(e) => onKey(e, i, t.id)}
              className={cn("group relative flex h-9 max-w-56 min-w-24 shrink-0 items-center gap-1.5 rounded-t-lg border border-b-0 px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                on ? "border-border bg-surface-raised font-medium text-text" : "border-transparent text-text-muted hover:bg-text/5")}>
              {ws.dirty.has(t.id) ? <span aria-hidden data-ws-dirty className="size-2 shrink-0 rounded-full bg-primary" /> : null}
              <span className="truncate">{t.title}</span>
              <span className="sr-only">{ws.dirty.has(t.id) ? ", unsaved changes" : ""}</span>
              {tabs.length > 1 ? <span aria-hidden data-ws-close title="Close (Delete)" onClick={(e) => { e.stopPropagation(); ws.close(t.id); }}
                className="ml-auto grid size-6 shrink-0 place-items-center rounded hover:bg-text/10"><X className="size-3.5" /></span> : null}
            </button>
          );
        })}
      </nav>
      <div className="flex items-center gap-2 px-4 py-1.5 md:hidden">
        <button type="button" aria-expanded={menu} onClick={() => setMenu((m) => !m)} data-ws-menu className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium"><FoldArrow open={menu} />Open items ({tabs.length})</button>
        <span className="min-w-0 truncate text-sm text-text-muted">{tabs.find((t) => t.id === active)?.title}</span>
      </div>
      {menu ? <ul className="flex flex-col gap-1 border-t border-border px-4 py-2 md:hidden" aria-label="Open items">
        {tabs.map((t) => <li key={t.id} className="flex items-center gap-2">
          <button type="button" aria-current={t.id === active ? "page" : undefined} onClick={() => { setMenu(false); ws.activate(t.id); }} className="min-h-11 min-w-0 flex-1 truncate rounded-lg px-2 text-left text-sm hover:bg-text/5">{name(t)}</button>
          {tabs.length > 1 ? <button type="button" aria-label={`Close ${t.title}`} onClick={() => ws.close(t.id)} className="grid size-11 place-items-center rounded-lg hover:bg-text/5"><X className="size-4" aria-hidden /></button> : null}
        </li>)}
      </ul> : null}
      {ws.notice ? <p role="status" data-ws-notice className="px-4 py-1 text-sm text-warning-foreground">{ws.notice}</p> : null}
    </div>
  );
}
