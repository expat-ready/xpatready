// DEMO-LINK: every address the staff Home's "Release 1 screens" list links to (web/src/modules/platform/home/
// release-one-menu.tsx) is a route the app has (a module's routes.tsx or App.tsx's APP_ROUTES), so the list never sends
// the founder to "page not found"; the Studio's menu links to /home; the Home page shows the list. Pure: reads the
// source files, no server, no database; US$0.
//   tsx studio/tests/check_demo_link.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { recorder } from "./runtime/api.ts";

const { ok, summary } = recorder();
const WEB = join(import.meta.dirname, "..", "web", "src"), MODS = join(WEB, "modules");
const read = (p: string) => readFileSync(p, "utf8");

/** Every routes file under a module folder (fixtures, "_…", left out), including spread-in ones (complaints/routes.tsx). */
const routeFiles = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (n.startsWith("_")) return [];
  return statSync(p).isDirectory() ? routeFiles(p) : n === "routes.tsx" ? [p] : [];
});
const modulePaths = routeFiles(MODS).flatMap((f) => [...read(f).matchAll(/\bpath:\s*"([^"]+)"/g)].map((m) => m[1]));
const appBlock = read(join(WEB, "modules.tsx")).match(/APP_ROUTES = \[([\s\S]*?)\] as const/)?.[1] ?? "";
const appPaths = [...appBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const routes = [...modulePaths, ...appPaths];

/** An address answered by a route: same segments, ":param" any one segment, "/*" the path and below. */
const answers = (route: string, address: string) => {
  const star = route.endsWith("/*"), r = (star ? route.slice(0, -2) : route).split("/").filter(Boolean), a = address.split("/").filter(Boolean);
  if (star ? a.length < r.length : a.length !== r.length) return false;
  return r.every((s, i) => s.startsWith(":") || s.toLowerCase() === a[i].toLowerCase());
};

const menu = read(join(MODS, "platform", "home", "release-one-menu.tsx"));
const links = [...menu.matchAll(/\bto:\s*"([^"]+)"/g)].map((m) => m[1]);
const missing = links.filter((l) => !routes.some((r) => answers(r, l)));
ok("DEMO-LINK: the Release 1 list links to at least Leads, Pipeline, Bookings, the public booking page, Clients, Cases, Product Studio and Sign in",
  ["/front-office/leads", "/front-office/pipeline", "/front-office/bookings", "/book/sample-firm", "/clients", "/cases", "/", "/sign-in"].every((p) => links.includes(p)), { links });
ok("DEMO-LINK: every address in the Release 1 list is a route the app has (none invented)", links.length > 0 && missing.length === 0, { missing, routes: routes.length });
ok("DEMO-LINK: the route check itself refuses an address no route answers", !routes.some((r) => answers(r, "/front-office/no-such-page")));
ok("DEMO-LINK: the staff Home shows the list (PlatformFrame's intro, so it shows before sign-in too)", /intro=\{<ReleaseOneMenu \/>\}/.test(read(join(MODS, "platform", "home", "home-page.tsx"))));
ok("DEMO-LINK: the Studio's menu links to /home as \"Release 1 screens\" (from http://localhost:4400/ by clicks only)", /<NavItem to="\/home" label="Release 1 screens"/.test(read(join(WEB, "App.tsx"))));
process.exit(summary() ? 1 : 0);
