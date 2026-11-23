// PF-31 part (c) (EXPERIENCE §2.12 "save once, with the version"; RFC 9110 §8.8.3 ETag, §13.1.1 If-Match, §15.5.10 409): one
// shared optimistic-concurrency door for staff edits.
//  * A save (POST, PUT, PATCH, DELETE) whose answer carries a top-level `version` string also sends it as a strong ETag
//    ("<version>"). Reads do not (review M3): a read's answer can change while its record's version does not (the firm
//    profile counts offices), so an ETag there would let a revalidating GET get 304 with stale data. Reads carry the
//    version in the body.
//  * A change route marked @Versioned() (its body takes `version`, STANDARDS §4) also takes the version as an If-Match
//    header: the header fills the body's `version`, so the service's own check under its row lock decides, and a stale one
//    is 409 with the latest record (the house rule since offices and the firm profile; RFC 9110 §13.1.1 allows 412, and
//    STANDARDS §4 chose 409 so the screen gets the latest record to show the conflict state: see the design note).
//  * A header and a body version that differ, a list of tags or "*" is 422 in words; If-Match on a change route that takes
//    no version is 422 too, so a screen never believes it is protected when it is not.
import { HttpException, Inject, Injectable, SetMetadata, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { map } from "rxjs";
import { FIELD_ERROR_STATUS } from "./input.ts";

const VERSIONED = "pf31:versioned";
/** The route's body takes the record's `version` as read; an If-Match header may carry it instead. */
export const Versioned = () => SetMetadata(VERSIONED, true);

const refuse = (detail: string): never => {
  throw new HttpException({ type: "https://expatready.local/problems/invalid", title: "Check the details", status: FIELD_ERROR_STATUS, detail, code: "INVALID", fields: { version: detail } }, FIELD_ERROR_STATUS);
};
/** One strong entity tag, as an ETag gave it: `"abc"` → abc. A weak tag (W/), a list or "*" is null. */
export function tagOf(header: string): string | null {
  const m = /^\s*"([\x21\x23-\x7e]{1,100})"\s*$/.exec(header);
  return m ? m[1] : null;
}

const CHANGES = new Set(["POST", "PUT", "PATCH", "DELETE"]);
@Injectable()
export class IfMatchVersion implements NestInterceptor {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  intercept(ctx: ExecutionContext, next: CallHandler) {
    if (ctx.getType() !== "http") return next.handle();
    const req = ctx.switchToHttp().getRequest<{ method: string; headers: Record<string, string | string[] | undefined>; body?: unknown }>();
    const res = ctx.switchToHttp().getResponse<{ headersSent?: boolean; setHeader: (k: string, v: string) => void }>();
    const header = req.headers["if-match"];
    if (header !== undefined && CHANGES.has(req.method)) {
      if (!this.reflector.getAllAndOverride<boolean>(VERSIONED, [ctx.getHandler(), ctx.getClass()])) refuse("This change does not take a version: send it without If-Match.");
      const tag = typeof header === "string" ? tagOf(header) : null;
      if (tag === null) refuse('If-Match: the one version the record was read at, in quotes, as its ETag gave it.');
      const body = req.body;
      if (body !== null && typeof body === "object" && !Array.isArray(body)) {
        const b = body as Record<string, unknown>;
        if (b.version !== undefined && b.version !== null && String(b.version) !== tag) refuse("The version in the body and in If-Match differ: send one.");
        b.version = tag;
      } else if (body === undefined || (typeof body === "object" && body !== null && Object.keys(body).length === 0)) req.body = { version: tag };
    }
    if (!CHANGES.has(req.method)) return next.handle();
    return next.handle().pipe(map((out: unknown) => {
      const v = out !== null && typeof out === "object" && !Array.isArray(out) ? (out as { version?: unknown }).version : undefined;
      if (typeof v === "string" && tagOf(`"${v}"`) !== null && !res.headersSent) res.setHeader("ETag", `"${v}"`);
      return out;
    }));
  }
}
