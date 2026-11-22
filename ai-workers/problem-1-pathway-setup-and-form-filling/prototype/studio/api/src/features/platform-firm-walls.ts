// PF-12: the firm walls' request side. Every HTTP handler runs in its request's scope (firm-scope.ts inRequest): its route,
// and the firm PF-4's guard read from the session. At start-up the API refuses to run when its database role could pass
// the walls (a table owner, a superuser, BYPASSRLS), and from then on a query outside every scope reads nothing.
import { Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor, type OnApplicationBootstrap, type OnModuleInit } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { Observable } from "rxjs";
import { Db } from "../core.ts";
import type { Feature } from "../features.ts";
import { join } from "node:path";
import { appRoleProblems, closeBypassUses, inRequest, loadBypassUseFiles, wallUnscopedQueries } from "../platform/firm-scope.ts";

// Loaded by registerFeatures before the app is built: from here on, in the API server, a query outside every scope reads
// nothing (breaker m8: no start-up query runs on the bypass by default).
wallUnscopedQueries();
// P-785 (2): every <name>.bypass.ts file under api/src is loaded here, while the features load and before any start-up
// hook runs (review: a job runner starting beside the hooks finds every declared job use), so a use whose module is
// imported only at request time is declared too. The list closes in onApplicationBootstrap, before the API listens.
await loadBypassUseFiles(join(import.meta.dirname, ".."));

@Injectable()
export class FirmWallsInterceptor implements NestInterceptor, OnModuleInit, OnApplicationBootstrap {
  constructor(@Inject(Db) private readonly db: Db) {}

  async onModuleInit() {
    wallUnscopedQueries();   // the API server: a query outside every scope reads nothing
    const problems = await appRoleProblems(async (sql) => ({ rows: await this.db.$queryRawUnsafe<Record<string, unknown>[]>(sql) }));
    if (problems.length) throw new Error(`PF-12: the API refuses to start: its database role could pass the firm walls (${problems.join("; ")}). Connect as xr_app (APP_DATABASE_URL); migrations run as the owner.`);
  }

  /** P-785 (2): every declared use was loaded with this file (above); the list closes before the API listens. */
  onApplicationBootstrap() { closeBypassUses(); }

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== "http") return next.handle();
    const req = ctx.switchToHttp().getRequest<object>();
    return new Observable((sub) => inRequest(req, () => next.handle().subscribe(sub)));
  }
}

export default { providers: [{ provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }] } satisfies Feature;
