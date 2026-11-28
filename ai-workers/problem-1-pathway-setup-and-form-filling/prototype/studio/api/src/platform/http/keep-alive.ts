// LR-110 (nightly 46108614143, part 15, job 140866925974): how long the server keeps an idle keep-alive connection open.
// Node closes one after 5 s by default (keepAliveTimeout, plus a 1 s keepAliveTimeoutBuffer on Node 24). Playwright's
// request client (page.request, request.newContext; playwright-core 1.63-1.64 `new http.Agent({ keepAlive: true })`) keeps
// idle sockets with no limit of its own, and Node's agent drops the server's "Keep-Alive: timeout=5" hint when the
// agent has no timeout (keepSocketAlive applies the hint only when it is shorter than options.timeout, which is 0).
// So a suite reuses a socket the server is about to close. When the server's event loop is busy across that moment
// (here: the page reloading after an Undo), the timer runs before the waiting request is read, the socket is closed with
// the request unread, and the kernel answers RST: "apiRequestContext.fetch: read ECONNRESET" (check_c42_marking_browser,
// 28 Nov). The server's window is now 65 s, longer than any idle gap between a suite's calls and above the 60 s idle
// default of common load balancers, which then close first in production. This bounds the race, not removes it: a
// client idle on one socket for about 65 s and reusing it while the server is busy could still meet it. headersTimeout
// (measured per request on Node 24) is kept above it: 66 s for slow headers, against 60 s before.
// Reproduced, then checked fixed: tests/check_lr110_keep_alive.ts.
import type { Server } from "node:http";

/** Idle time before the server closes a keep-alive connection (ms). Longer than any client's idle reuse in a suite. */
export const KEEP_ALIVE_MS = 65_000;
/** Time allowed for a request's headers (ms); kept above KEEP_ALIVE_MS. */
export const HEADERS_TIMEOUT_MS = 66_000;

export function keepAlive(server: Pick<Server, "keepAliveTimeout" | "headersTimeout">): void {
  server.keepAliveTimeout = KEEP_ALIVE_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
}
