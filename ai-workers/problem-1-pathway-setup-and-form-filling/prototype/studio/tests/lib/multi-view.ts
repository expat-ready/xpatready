// PF-31 (EXPERIENCE §2.13): the reusable "work in many tabs" walk for any screen with a form (skills screen-review and
// journey-test name it). Two views of one record in one browser (a second window shares nothing but the BroadcastChannel and
// the server): a change typed in one shows in the other, Save writes once with If-Match and the last value, the other view
// reads the record again, and a save from a version someone else changed is refused (409) with the conflict state.
// Workspace helpers read the in-app tab strip (components/workspace.tsx).
import type { Locator, Page } from "playwright";

export type Ok = (name: string, cond: unknown, detail?: unknown) => void;

/** The workspace strip's tabs as the person sees them: title, address, selected, unsaved dot. */
export async function tabs(p: Page) {
  return p.locator('[data-workspace]:visible [data-ws-strip] [data-ws-tab]').evaluateAll((els) => els.map((e) => ({
    path: e.getAttribute("data-ws-path") ?? "", title: (e.textContent ?? "").replace(/, unsaved changes$/, "").trim(), selected: e.getAttribute("aria-current") === "page", dirty: !!e.querySelector("[data-ws-dirty]"),
  })));
}
/** The visible tab's content (hidden tabs stay mounted). */
export const shown = (p: Page) => p.locator("[data-ws-panel]:not([hidden])");
export const until = async (f: () => Promise<boolean>, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await f().catch(() => false)) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };

export type SharedRecordWalk = {
  label: string;
  /** Two views of the same record, each opened and its form ready to type in. */
  a: Page; b: Page;
  field: (p: Page) => Locator;
  /** The save request this record's Save makes (method and path). */
  saves: (method: string, url: string) => boolean;
  save: (p: Page) => Promise<void>;
  /** The value stored on the server now. */
  stored: () => Promise<string>;
  /** Someone else saves the record (through the API), so `a`'s next save is stale. */
  otherSaves: (value: string) => Promise<void>;
  values: { mirrored: string; last: string; stale: string; other: string };
};

/** The walk: mirrored edit, one save with If-Match and the last value, the other view refreshed, a stale save → 409 and the
 *  conflict state (both values shown), then Keep mine saves. Every step reports through `ok`. */
export async function walkSharedRecord(w: SharedRecordWalk, ok: Ok) {
  const { a, b, label: L, values: v } = w;
  const sent: { status: number; ifMatch: string | null; body: string }[] = [];
  const track = (p: Page) => p.on("response", async (r) => { const q = r.request(); if (w.saves(q.method(), q.url())) sent.push({ status: r.status(), ifMatch: (await q.allHeaders())["if-match"] ?? null, body: q.postData() ?? "" }); });
  track(a); track(b);
  await w.field(a).fill(v.mirrored);
  const t0 = Date.now();
  const mirrored = await until(async () => (await w.field(b).inputValue()) === v.mirrored, 2000);
  ok(`${L}: a change typed in one view shows in the other (${Date.now() - t0} ms; the bar is ~100 ms plus the poll)`, mirrored, await w.field(b).inputValue());
  await w.field(b).fill(v.last);
  ok(`${L}: and back: the other view's change shows in the first`, await until(async () => (await w.field(a).inputValue()) === v.last), await w.field(a).inputValue());
  ok(`${L}: nothing was sent while typing (the server is written only on Save)`, sent.length === 0, sent);
  await w.save(a);
  await until(async () => sent.length > 0);
  await until(async () => (await w.stored()) === v.last);
  ok(`${L}: one save, 200, with If-Match, carrying the last value`, sent.length === 1 && sent[0].status === 200 && !!sent[0].ifMatch && sent[0].body.includes(v.last), sent);
  ok(`${L}: the server holds the last value`, (await w.stored()) === v.last, await w.stored());
  ok(`${L}: the other view reads the record again and its draft is gone`, await until(async () => (await w.field(b).count()) === 0 || ((await w.field(b).inputValue()) === v.last && (await b.locator("[data-draft-line]:visible").filter({ hasText: "Unsaved" }).count()) === 0), 4000));
  return sent;
}

/** A stale save: `a` holds a draft from version N; someone else saves N+1; `a`'s Save is refused 409, nothing written, and
 *  the conflict state shows both values; "Keep mine" then saves. */
export async function walkStaleSave(w: Omit<SharedRecordWalk, "b"> & { open: () => Promise<void> }, ok: Ok) {
  const { a, label: L, values: v } = w;
  const sent: number[] = [];
  a.on("response", (r) => { if (w.saves(r.request().method(), r.request().url())) sent.push(r.status()); });
  await w.open();
  await w.field(a).fill(v.stale);
  await w.otherSaves(v.other);
  await w.save(a);
  const shownConflict = await until(async () => (await a.locator("[data-conflict]:visible").count()) > 0, 5000);
  ok(`${L}: a save from a version someone else changed is refused 409 and nothing of mine is written`, sent.includes(409) && (await w.stored()) === v.other, { sent, stored: await w.stored() });
  const box = a.locator("[data-conflict]:visible");
  ok(`${L}: the conflict state shows the saved value and mine side by side`, shownConflict && (await box.locator("[data-conflict-saved]").first().textContent())?.includes(v.other) && (await box.locator("[data-conflict-mine]").first().textContent())?.includes(v.stale),
    shownConflict ? await box.innerText() : "no conflict box");
  await box.locator("[data-conflict-keep-mine]").click();
  await w.save(a);
  // The write is visible in the database a moment before the browser has its 200: wait for both (T8 read `sent` too early).
  ok(`${L}: Keep mine, then Save: written once on the newer version`, await until(async () => (await w.stored()) === v.stale && sent.includes(200), 5000) && sent.filter((s) => s === 200).length === 1, { sent, stored: await w.stored() });
}
