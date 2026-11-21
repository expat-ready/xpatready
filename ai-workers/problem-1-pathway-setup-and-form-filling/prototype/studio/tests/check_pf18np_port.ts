// PF-18np: the notification port's fake runs its contract (DW1, DW2), the kind-to-group typing (DW3) and the port guards
// (DW4), each with a pass and a fail. No database, no server, no model call (US$0).   tsx studio/tests/check_pf18np_port.ts
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runContract } from "../ports/contracts/contract.ts";
import { notificationPortContract } from "../ports/contracts/notification-port.contract.ts";
import { fakeNotifications, NOTIFICATION_GROUP, NOTIFICATION_KIND, NotificationGroup, type NotificationItem, type NotificationKind, type NotificationRecipient, type NotificationRecord } from "../ports/notifications.ts";

const STUDIO = join(import.meta.dirname, ".."), WORK = join(STUDIO, "var", `pf18np-check-${process.pid}`);
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const harness = () => { let ms = Date.parse("2026-11-16T00:00:00Z"); const f = fakeNotifications({ now: () => new Date(ms += 1000) }); return { notifications: f, tx: <T,>(fn: (t: unknown) => Promise<T>) => fn(null), sent: (s: string) => f.sent().filter((r) => r.staffId === s), markRead: f.markRead }; };
mkdirSync(WORK, { recursive: true });
try {
  // DW1, DW2 pass: the fake keeps the contract; fail: an adapter that adds a record on every call, or records an unchecked call, breaks it.
  const good = await runContract(notificationPortContract, "fakeNotifications", harness, ok);
  const everyCall = () => { const all: NotificationRecord[] = [];
    return { ...harness(), notifications: { async notify(_t: unknown, r: NotificationRecipient, kind: NotificationKind, item: NotificationItem) { all.push({ staffId: r.staffId, kind, item, at: new Date(), read: false }); } }, sent: (s: string) => all.filter((x) => x.staffId === s) }; };
  const noMerge = await runContract(notificationPortContract, "everyCall", everyCall, null);
  ok("PF-18np DW1 fail: an adapter that adds a record per call (no merge) fails DW1; with no checks it fails DW2", good.failed.length === 0 && noMerge.failed.length === 2, noMerge);

  // DW3: every kind has a group; a kind without one fails the type check.
  ok("PF-18np DW3 pass: every kind has one of the eight groups", Object.values(NOTIFICATION_KIND).every((k) => NotificationGroup.safeParse(NOTIFICATION_GROUP[k]).success) && NotificationGroup.options.length === 8);
  // @ts-expect-error PF-18np DW3: a kind with no group (here "no-group-kind") fails the type check
  const _missing: Record<NotificationKind | "no-group-kind", NotificationGroup> = NOTIFICATION_GROUP;
  const fixture = (expectError: boolean) => `import { NOTIFICATION_GROUP, type NotificationGroup, type NotificationItem, type NotificationKind, type NotificationRecipient, type NotificationRecord } from "../../ports/notifications.ts";\n${expectError ? "// @ts-expect-error\n" : ""}export const g: Record<NotificationKind | "no-group-kind", NotificationGroup> = NOTIFICATION_GROUP;\nexport const h: Record<NotificationKind, NotificationGroup> = NOTIFICATION_GROUP;\n`;
  const tsc = (file: string) => spawnSync(join(STUDIO, "node_modules/.bin/tsc"), ["--ignoreConfig", "--noEmit", "--strict", "--skipLibCheck", "--target", "es2022", "--module", "nodenext", "--allowImportingTsExtensions", file], { encoding: "utf8", cwd: WORK });
  writeFileSync(join(WORK, "with.ts"), fixture(true)); writeFileSync(join(WORK, "without.ts"), fixture(false));
  const w = tsc(join(WORK, "with.ts")), wo = tsc(join(WORK, "without.ts"));
  ok("PF-18np DW3 pass: the type check accepts the full map and the @ts-expect-error on a kind with no group", w.status === 0, w.stdout);
  ok("PF-18np DW3 fail: without the directive, a kind with no group fails the type check (TS2741)", wo.status !== 0 && /TS2741/.test(wo.stdout), wo.stdout);

  // DW4: the contract guard passes on this tree and fails when the fake runs no contract; ports/ imports only zod and its own files.
  const guard = (root: string) => spawnSync(process.execPath, [join(root, "tools/check-port-contracts.mjs")], { encoding: "utf8" });
  const here = guard(STUDIO);
  ok("PF-18np DW4 pass: tools/check-port-contracts.mjs exits 0 and lists NotificationPort with its two adapters (the fake and, since PF-18n, PrismaNotificationPort)", here.status === 0 && /NotificationPort ×2/.test(here.stdout), here.stdout);
  const copy = join(WORK, "tree");
  for (const d of ["ports", "tools"]) cpSync(join(STUDIO, d), join(copy, d), { recursive: true });
  const there = guard(copy);
  ok("PF-18np DW4 fail: with no test running the contract, the guard exits 1 naming fakeNotifications", there.status === 1 && /NotificationPort: fake adapter fakeNotifications/.test(there.stdout), there.stdout);
  const foreign = (t: string) => [...t.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1] ?? m[2]).filter((s) => s !== "zod" && !/^\.\.?\/[a-z0-9-]+(\.contract)?\.ts$/.test(s));
  const files = ["ports/notifications.ts", "ports/contracts/notification-port.contract.ts"].flatMap((f) => foreign(readFileSync(join(STUDIO, f), "utf8")));
  ok("PF-18np DW4 pass: the port and its contract import only zod and ports/ files", files.length === 0, files);
  ok("PF-18np DW4 fail: the import check catches a Prisma, a node and an engine import", foreign(`import { z } from "zod";\nimport type { Prisma } from "@prisma/client";\nimport { x } from "node:fs";\nconst e = await import("../engine/runtime/team.ts");`).length === 3);
} finally { rmSync(WORK, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
