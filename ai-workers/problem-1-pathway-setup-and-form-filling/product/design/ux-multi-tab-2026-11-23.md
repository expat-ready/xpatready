# Work in many tabs: research and the standard (PF-31, 23 Nov 2026)

**Ask (founder, 23 Nov ~10:3x IST):** staff work in parallel in several tabs across the whole product; every left-menu item opens in its own tab; the same record open twice must not conflict; a change typed in one place shows everywhere it is shown; the server is written only on Save, with the last value. Industry best practice, on every screen, written into the UX standard and its quality gate.

**Decision path.** The tech lead (Lead 10) first chose real browser tabs. The founder then chose, as a final product decision, **tabs drawn inside the app** (the console pattern), keeping shared drafts and the versioned save. This note records the evidence for both and the standard that follows (`EXPERIENCE.md` §2.13).

Sources are official pages. Fetches from this cloud session to tanstack.com, learn.microsoft.com and rfc-editor.org were blocked by the network policy, so some quotes come from the search engine's extract of the cited page; those are marked *(extract)* and should be re-read on the live page before they are quoted elsewhere. Read 23 Nov 2026.

## 1. How best-in-class products do it

| Product | Pattern | What we take | Source |
|---|---|---|---|
| Salesforce Lightning console | Workspace tabs (and subtabs) under the header; opening a record that is already open focuses its tab; keyboard: Shift+x closes the workspace tab, arrows move between tabs when a tab has focus; no hard tab cap, an admin "Loaded Console Tab Limit" unloads the least-recently used tabs. | Open-or-focus, keyboard close that is not Ctrl+W, a cap with a message (we unload nothing: 12 is small). | "Opens a new workspace tab. If the tab is already open, the tab is focused." developer.salesforce.com/docs/service/api-console/guide/sforce-api-console-lightning-opentab.html · shortcuts: help.salesforce.com …id=service.console_lex_keyboard_shortcuts.htm · limit: help.salesforce.com …id=release-notes.rn_console_tab_limit.htm (release 242) |
| Microsoft Dynamics 365 Customer Service workspace (multisession) | Sessions and app tabs; 10 sessions and 10 app tabs per session; at the limit a "Maximum sessions reached" message asks to close one; "Session restore" after a browser refresh is an admin preview setting. | A fixed cap with a plain message; restore after refresh as a normal behaviour, not an option. | learn.microsoft.com/dynamics365/customer-service/develop/reference/methods/cancreatesession and …/cancreatetab *(extract)*; …/administer/enable-session-restore *(extract)* |
| Zendesk Agent Workspace | Ticket tabs across the top; when they do not fit, new tabs go to an overflow menu; "Close all" warns about tickets with unsaved changes. | Ask before closing a tab with unsaved changes; on a narrow screen, a menu of open items. | "When you have a large number of tickets open that don't fit across the top ticket bar, you'll see new ticket tabs open in an overflow options menu." support.zendesk.com/hc/en-us/articles/4408844108826 · support.zendesk.com/hc/en-us/articles/11212804013850 |
| Linear, GitHub, Stripe Dashboard | Real links everywhere (Ctrl/Cmd-click opens a browser tab); a second tab of the same record is a separate view; GitHub warns "the content has changed" and Stripe and Linear reconcile through the server. | Every screen keeps its own address, so links, refresh and Back work and a link can be shared; a second browser window still works. | Product behaviour, observed; not a citation-grade source (Sample). |
| Google Docs | Real-time merge through a server (operational transforms). | Not needed: our records are forms with one writer at a time; a version check is enough (§3). | — |

**Why the founder's choice fits our users.** An RCIC or case officer works several clients at once (a lead, a prospect, a case, a client message). The console pattern keeps those items one click apart inside one window, never opens the same record twice (which removes most conflicts at the source), and keeps each item's typing while the person moves between them. Real browser tabs do not stop a second copy of the same record and cannot show which items are open with unsaved work.

**Challenge recorded (not stalling):** two points of the brief are adjusted with evidence:
1. *"Ctrl+W in app"*: browsers keep Ctrl+W, Ctrl+T and Ctrl+N from pages ("The most problematic cases are ctrl-n, ctrl-w and ctrl-t", chromium.org/developers/design-documents/extensions/proposed-changes/apis-under-development/browser-keys/; developer.chrome.com/docs/capabilities/web-apis/keyboard-lock: such keys "are captured by the browser or the underlying operating system"). We use **Alt+Shift+W** to close, **Alt+PageDown / Alt+PageUp** to move, and on a focused tab the ARIA keys (arrows, Home, End, Delete), as Salesforce uses Shift+x.
2. *"Every left-menu item opens in an app tab"*: a plain click on a menu or record link opens **or focuses** the item's tab; other links (Back, breadcrumbs, buttons that move on) move the current tab, unless another tab already shows that item, which then comes forward. Opening a new tab for every link would hit the cap in minutes.

## 2. Keeping views in step

| Option | Fit | Source |
|---|---|---|
| One in-memory store inside the app | All app tabs share it: a change shows everywhere at once, no messaging. **Chosen** for inside one window. | — |
| BroadcastChannel | Same-origin messages between windows and tabs of one browser, no server; Baseline widely available since March 2022. **Chosen** for a second window of the app. | "allows basic communication between browsing contexts (that is, windows, tabs, frames, or iframes) … on the same origin." developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API |
| `storage` event | Fires only in *other* documents, and for sessionStorage only frames of the same tab: cannot carry per-tab drafts between windows. Rejected. | "fired when a storage area (localStorage or sessionStorage) has been modified in the context of another document." developer.mozilla.org/en-US/docs/Web/API/Window/storage_event |
| TanStack Query `broadcastQueryClient` | Mirrors the whole query cache over BroadcastChannel; "This plugin is in an experimental stage … breaking changes will happen in minor AND patch releases" *(extract)*; a new package (STANDARDS §1 gate). Rejected: we need drafts, not cache copies, and a saved record is simply read again after the save. | tanstack.com/query/v5/docs/framework/react/plugins/broadcastQueryClient |

Drafts are kept per browser tab in sessionStorage, so a reload keeps them; they never reach the server before Save.

## 3. Save once, safely across people (HTTP)

* Each editable record has a `version` (its `updated_at`, or a hash of when its parts changed). Reads carry it in the body; the save sends it back as **If-Match** (§13.1.1) or in the body (STANDARDS §4), and a save's answer carries the new one as a strong **ETag** (§8.8.3). Reads send no version ETag: a read can change while its record's version does not (the firm profile counts offices), so a cache could get 304 with stale data (PF-31 review M3).
* RFC 9110 §13.1.1 lets a server answer a failed If-Match with **412**; §15.5.10 defines **409** for "a conflict with the current state of the target resource", the user being able to resolve it, with the response describing the conflict. STANDARDS §4 and the existing offices and firm-profile routes already answer **409 with the latest record**; we keep 409 so the screen can show both values without a second read (rfc-editor.org/rfc/rfc9110 §8.8.3, §13.1.1, §15.5.10, §15.5.13 *(extract)*).
* RFC 6585 §3's **428 Precondition Required** (a server that requires If-Match) is not used yet. Offices and the firm profile refuse a save without a version (422 in words); a person's phone takes one optionally, so older callers keep working, and the screens always send it.
* One shared Nest interceptor (`api/src/platform/http/if-match.ts`) sets the ETag and maps If-Match onto the version for routes marked `@Versioned()`; a stale version is the service's own 409 under its row lock.

## 4. The standard (copied into EXPERIENCE.md §2.13)

Workspace tabs (one strip under the header; open-or-focus; own address, scroll and form state; restore after reload; cap 12 with a message; close by ×, middle-click, Delete, Alt+Shift+W, with a question and a dot when unsaved; ARIA tabs; "Open items" menu below 768 px); one shared draft per record (all views at once, a second window through BroadcastChannel, a line "Unsaved changes … also open in N other windows"); save once with the version (If-Match), the other views read it again; a stale save is EXPERIENCE §4's conflict state (both values, take the saved one or keep mine). "Keep mine" carries only the fields I changed onto the newer record; the rest keep the saved values. Applied first to Offices (a platform settings form; the firm profile has no screen yet, it is PF-5s's) and a lead's phone; every other screen follows when it is next touched. Test helper: `prototype/studio/tests/lib/multi-view.ts`; proof: `tests/check_pf31_multitab_browser.ts`.

## 5. WAI-ARIA tabs

Arrow keys move between tabs and wrap; Home and End go to the ends; Delete may close a closable tab and moves focus to the next one. Automatic activation (the panel shows on focus) suits panels that show at once: our hidden tabs are already rendered, so we activate on focus. w3.org/WAI/ARIA/apg/patterns/tabs/
