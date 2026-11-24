// How long the API server keeps an idle connection, against the load balancer in front of it. AWS, "Troubleshoot your
// Application Load Balancers", HTTP 502 (docs.aws.amazon.com/elasticloadbalancing/latest/application/
// load-balancer-troubleshooting.html, read 24 Nov 2026): "Check whether the keep-alive duration of the target is shorter
// than the idle timeout value of the load balancer." Node's default is 5 s (closed at about 6 s), the balancer's 60 s: a
// request sent on a connection the server is closing is answered 502. So the server outlasts the balancer.
import type { Server } from "node:http";

/** The balancer's idle time, stated in deploy/cdk/lib/service.ts (its tests hold the two numbers together). */
export const BALANCER_IDLE_SECONDS = 60;
export const KEEP_ALIVE_MS = (BALANCER_IDLE_SECONDS + 5) * 1000;
/** Longer than the keep-alive, so a reused connection is never ended by the headers limit first. */
export const HEADERS_MS = KEEP_ALIVE_MS + 5_000;

/** Called once, before the server listens. A stop (server.close) still ends promptly: Node closes the connections idle
 *  at that moment, and one that was answering then is closed here right after its answer, not KEEP_ALIVE_MS later. */
export function outlastBalancer(server: Server): void {
  server.keepAliveTimeout = KEEP_ALIVE_MS;
  server.headersTimeout = HEADERS_MS;
  server.prependListener("request", (_req, res) => {
    res.once("finish", () => { if (!server.listening) setImmediate(() => server.closeIdleConnections()); });
  });
}
