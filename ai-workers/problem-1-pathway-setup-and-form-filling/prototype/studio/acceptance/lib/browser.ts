// Browser helpers for the acceptance packs that walk screens (C3.10, C11.1, C11.17; written 3 Nov, F6). One Chromium,
// one context per person (the simulated person is chosen as the app does: localStorage "xr-actor"), page errors
// collected. A page is read only once it has settled: the network is idle and no "Loading" text is left; a page that
// does not settle in time throws (a wait a test relies on fails loudly, WAY-OF-WORKING). US$0: no model call.
// OS-73 (25 Nov, founder ruling 13:04 IST; STANDARDS §9 by the Lead): each settled page prints one VITALS line, the
// browser's own counters against Google's "good" line: LCP (largest contentful paint of the document load) within 2.5 s
// and CLS (the worst layout-shift session window so far: shifts under 1 s apart, at most 5 s, none after an input) at
// most 0.1. Warning only (P-717 (b)): a miss prints WARN (and a GitHub warning in CI), never fails a pack. A client-side
// route change keeps the load's LCP: read the first settle after a goto. Test: tests/check_os73_vitals_browser.ts.
import { existsSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";

export const LCP_BUDGET_MS = 2500, CLS_BUDGET = 0.1;
export type Vital = { what: string; path: string; lcpMs: number | null; cls: number; over: string[] };
export type Walker = { browser: Browser; errors: string[]; vitals: Vital[]; open: (actor: string, width?: number) => Promise<Page>; settle: (p: Page, what: string) => Promise<void>; text: (p: Page) => Promise<string>; close: () => Promise<void> };

export async function walker(base: string): Promise<Walker> {
  // The channel "chrome" as the suites use it (cloud-setup.sh links the image's Chromium there on Linux); else Chromium.
  const browser = await chromium.launch(existsSync("/opt/google/chrome/chrome") || process.platform === "darwin" ? { channel: "chrome", headless: !process.env.QA_HEADED } : { headless: !process.env.QA_HEADED });
  const errors: string[] = [];
  const vitals: Vital[] = [];
  const open = async (actor: string, width = 1440) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, baseURL: base });
    await ctx.addInitScript((a) => { try { localStorage.setItem("xr-actor", a); } catch { /* private window */ } }, actor);
    await ctx.addInitScript(() => {
      const v = { lcp: 0, cls: 0 };
      (window as unknown as { __xrVitals: typeof v }).__xrVitals = v;
      try {
        new PerformanceObserver((l) => { for (const e of l.getEntries()) v.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
        let win = 0, first = 0, last = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
            if (e.hadRecentInput) continue;
            if (win && e.startTime - last < 1000 && e.startTime - first < 5000) win += e.value; else { win = e.value; first = e.startTime; }
            last = e.startTime; if (win > v.cls) v.cls = win;
          }
        }).observe({ type: "layout-shift", buffered: true });
      } catch { /* a browser without these counters: the line says "none" */ }
    });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${p.url()}: ${String(e).slice(0, 200)}`));
    return p;
  };
  /** Waits until the page has settled; throws with the page's address when it has not within 30 s. */
  const settle = async (p: Page, what: string) => {
    await p.waitForLoadState("networkidle", { timeout: 30_000 }).catch((e) => { throw new Error(`${what}: the page did not settle in 30 s (${p.url()}): ${String(e).slice(0, 120)}`); });
    const start = Date.now();
    while (/\bLoading\b/.test(await p.locator("body").innerText())) {
      if (Date.now() - start > 30_000) throw new Error(`${what}: still "Loading" after 30 s (${p.url()})`);
      await p.waitForTimeout(250);
    }
    await vital(p, what);
  };
  /** OS-73: reads the page's counters (after two frames, so the last paint's entries are in) and prints one VITALS line. */
  const vital = async (p: Page, what: string) => {
    const v = await p.evaluate(() => new Promise<{ lcp: number; cls: number } | null>((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() =>
      done((window as unknown as { __xrVitals?: { lcp: number; cls: number } }).__xrVitals ?? null), 0))))).catch(() => null);
    if (!v) return;
    const path = new URL(p.url()).pathname, lcpMs = v.lcp > 0 ? Math.round(v.lcp) : null, over: string[] = [];
    if (lcpMs !== null && lcpMs > LCP_BUDGET_MS) over.push(`LCP over ${LCP_BUDGET_MS / 1000} s`);
    if (v.cls > CLS_BUDGET) over.push(`CLS over ${CLS_BUDGET}`);
    vitals.push({ what, path, lcpMs, cls: v.cls, over });
    const line = `VITALS ${path} LCP ${lcpMs === null ? "none" : `${lcpMs} ms`} CLS ${v.cls.toFixed(3)} ${over.length ? `WARN ${over.join(", ")}` : "ok"} (${what})`;
    console.log(line);
    if (over.length && process.env.GITHUB_ACTIONS) console.log(`::warning title=OS-73 vitals::${line}`);
  };
  /** Everything a person reads on the page: the visible text plus button names, tooltips and placeholders. */
  const text = (p: Page) => p.evaluate(() => {
    const attrs = [...document.querySelectorAll("[title],[aria-label],[placeholder]")].flatMap((e) => ["title", "aria-label", "placeholder"].map((a) => e.getAttribute(a) ?? "")).filter(Boolean);
    return `${document.body.innerText}\n${attrs.join("\n")}`.replace(/[ \t]+/g, " ");
  });
  return { browser, errors, vitals, open, settle, text, close: () => browser.close() };
}
