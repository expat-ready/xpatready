// AUD-3 part 1 (R1.87; SA-11-12, SA-11 BR-14, rev 9.1): what each of our own staff's routes does with firms' data, declared
// beside the route, so the line it owes on a firm's audit trail is known before it runs. Every route under /api/system
// that a signed-in staff member calls (@SystemKeys or @AnySystemStaff) declares exactly one of:
//   @ReadsFirm("id")              it reads one firm's data, the firm named by that path parameter: after a successful call,
//                                 one `platform.system.firm_read` line on that firm's trail (OUR_STAFF), before the answer is sent;
//   @ChangesFirm("why")           it changes one firm's data and writes its own line on that firm's trail in the change's
//                                 transaction (PF-21b's holds, PF-25w's web address): a successful call that wrote none is
//                                 an error (AUDIT_LINE_MISSING), so no route can forget;
//   @ReadsAcrossFirms("scope")    it reads more than one firm's data: one `cross_tenant.access` line on the platform's own
//                                 trail (no firm) naming the staff member and the scope, before the answer is sent;
//                                 `{ firmFilter: true }` only on a route whose own query takes `?firm=<id>` and narrows
//                                 to that firm: the line then names it (`detail.firm`), and that firm's access report
//                                 shows it (AUD-3 part 2, breaker M1: a route that ignores `?firm=` must never record it);
//   @NoFirmData("why")            it touches no firm's data (our own staff's sign-in, identity and access).
// A route with none stops the start-up with its name (access/lines.ts, SystemAccessLines).
import { SetMetadata } from "@nestjs/common";

export const FIRM_DATA = "platform:system-firm-data";
export type FirmData =
  | { kind: "reads-firm"; param: string }
  | { kind: "changes-firm"; why: string }
  | { kind: "reads-across"; scope: string; firmFilter?: true }
  | { kind: "none"; why: string };

const words = (v: string, what: string) => {
  if (typeof v !== "string" || !/^[A-Za-z][A-Za-z0-9 ,.'()/-]{1,119}$/.test(v)) throw new Error(`${what}: name it in plain words (letters first, at most 120 characters)`);
  return v;
};
export const ReadsFirm = (param: string) => {
  if (!/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(param)) throw new Error("ReadsFirm: name the path parameter that holds the firm's id");
  return SetMetadata(FIRM_DATA, { kind: "reads-firm", param } satisfies FirmData);
};
export const ChangesFirm = (why: string) => SetMetadata(FIRM_DATA, { kind: "changes-firm", why: words(why, "ChangesFirm") } satisfies FirmData);
export const ReadsAcrossFirms = (scope: string, opts: { firmFilter?: true } = {}) =>
  SetMetadata(FIRM_DATA, { kind: "reads-across", scope: words(scope, "ReadsAcrossFirms"), ...(opts.firmFilter === true ? { firmFilter: true as const } : {}) } satisfies FirmData);
export const NoFirmData = (why: string) => SetMetadata(FIRM_DATA, { kind: "none", why: words(why, "NoFirmData") } satisfies FirmData);
