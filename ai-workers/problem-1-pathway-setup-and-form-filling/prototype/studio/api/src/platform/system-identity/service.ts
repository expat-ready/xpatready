// PF-4s part 1 (SA-7-1, SA-7-2, SA-7-3, SA-7-11, SA-7-14, SA-7-20): sign-in for ExpatReady's own staff behind IdentityPort,
// on a pool of their own. The system guard (guard.ts) asks this service who a bearer token is; a person's permissions are
// the sum of their roles' system/* keys and nothing else (SA-7-11). Two-step sign-in is required, always (SA-7-2).
// Configuration, read by PF-24's one loader (config/settings.ts):
//   PLATFORM_SYSTEM_IDENTITY              "local" | "cognito"; unset: no sign-in for our staff here (every /api/system route 401s)
//   PLATFORM_SYSTEM_COGNITO_USER_POOL_ID, PLATFORM_SYSTEM_COGNITO_CLIENT_ID   our staff's own pool (ca-central-1) and client
//   PLATFORM_SYSTEM_LOCAL_SECRET          the stand-in's own signing key; unset: a random one per start
// The Cognito adapter is PF-4's class on the other pool; that pool must require two-step sign-in for everyone (P-567).
// Not proven against AWS here: the pool itself waits on the founder's AWS (as PF-4b's proof).
// Audit: one line per /api/system call by a signed-in staff member in plat_system_audit (audit(), written by the guard
// before the handler runs; fail-closed: no line, no call). Not audit_event: that trail's lines belong to a firm and its
// adapter has no word for our staff yet (audit/audit-event.ts "until PF-4s"; asked of the tech lead on the PR).
import { Inject, Injectable, Optional, type OnModuleInit } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Db } from "../../core.ts";
import { platformConfig } from "../config/settings.ts";
import { parseInput, strict } from "../http/input.ts";
import { CognitoIdentity } from "../identity/cognito.ts";
import { forbidden, problem, unauthorized } from "../identity/keys.ts";
import { IdentityRefused, PlatformClock, type IdentityPort } from "../identity/port.ts";
import { IDENTITY_PORT } from "../identity/service.ts";
import { logPort, requestScope } from "../observability/log.ts";
import { SYSTEM_KEY, SYSTEM_ROLES, type SystemStaffContext } from "./keys.ts";
import { SYSTEM_LOCAL_TTL_SECONDS, SystemLocalIdentity } from "./local.ts";

export const SYSTEM_IDENTITY_PORT = Symbol("SystemIdentityPort");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SystemLocalSignInBody = strict({ email: z.string().max(320), secondStep: z.boolean().optional() });
const TWO_STEP = "Two-step sign-in is required for every ExpatReady staff member: finish the second step, then try again.";
const UNKNOWN = "This sign-in is not an ExpatReady staff member.";

/** The port this server's configuration names (PLATFORM_SYSTEM_IDENTITY). Unset: an adapter that refuses every token. */
export function systemIdentityPortFromConfig(clock: PlatformClock): IdentityPort {
  const c = platformConfig().systemIdentity;
  if (c.via === "local") return new SystemLocalIdentity(c.localSecret ? c.localSecret.reveal() : null, () => clock.now());
  if (c.via === "cognito") return new CognitoIdentity({ userPoolId: c.userPoolId, clientId: c.clientId, mfaRequired: true });
  return { via: "cognito", async verify() { throw new IdentityRefused("Sign-in for ExpatReady staff is not set up on this server (PLATFORM_SYSTEM_IDENTITY is not set).", "SIGN_IN_NOT_SET_UP"); } };
}

export type SystemAuditLine = { staff: Pick<SystemStaffContext, "staffId" | "name">; method: string; route: string; target: Record<string, unknown>; outcome: "ALLOWED" | "REFUSED"; code: string | null; reason: string | null; device: string | null };

@Injectable()
export class SystemIdentity implements OnModuleInit {
  constructor(@Inject(Db) private readonly db: Db, @Inject(SYSTEM_IDENTITY_PORT) readonly port: IdentityPort, @Inject(PlatformClock) private readonly clock: PlatformClock,
    /** The firm staff's port, when this app serves it: only to tell a firm's session (403) from no session at all (401). */
    @Optional() @Inject(IDENTITY_PORT) private readonly firmPort?: IdentityPort) {
    if (this.firmPort && this.firmPort === this.port) throw new Error("PF-4s: our own staff's sign-in and the firm staff's must be two ports (SA-7-1)");
  }

  async onModuleInit() {
    if (this.port instanceof CognitoIdentity && this.port.ready) await this.port.warm().catch((e) => logPort.error("system_cognito_keys_not_warmed", e));   // fetched on the first sign-in instead
  }

  /** Whether this bearer token is a session of our own staff (the wall on every other path asks, guard.ts). */
  async isSystemSession(token: string): Promise<{ staffId: string } | null> {
    try { const id = await this.port.verify(token); return { staffId: "staffId" in id.lookup ? id.lookup.staffId.slice(0, 64) : "cognito" }; }
    catch (e) { if (e instanceof IdentityRefused) return null; throw e; }
  }

  /** The guard's work: a bearer token → the staff member, or a refusal at once. A firm staff member's session is a 403
   *  (SA-7-1: firm tokens are refused by the staff console); anything else that is not our staff's session is a 401.
   *  A refusal of a session that names one of our staff (no second step, deactivated, ended) first calls `refused` with
   *  the person and the code, so the guard writes its REFUSED line (SA-7-20; review M2). */
  async authenticate(token: string | undefined, refused?: (staff: Pick<SystemStaffContext, "staffId" | "name">, code: string) => Promise<void>): Promise<SystemStaffContext> {
    if (!token) return unauthorized("Sign in first: this needs an ExpatReady staff member's session (a bearer token).");
    let id;
    try { id = await this.port.verify(token); }
    catch (e) {
      if (!(e instanceof IdentityRefused)) throw e;
      if (this.firmPort && (await this.firmPort.verify(token).then(() => true, (f) => { if (f instanceof IdentityRefused) return false; throw f; })))
        return forbidden("A firm's staff session cannot be used here: this is for ExpatReady's own staff only.", "FIRM_SESSION_REFUSED");
      return unauthorized(e.detail, e.code);
    }
    const where = "staffId" in id.lookup ? (UUID.test(id.lookup.staffId) ? { id: id.lookup.staffId.toLowerCase() } : null) : { identitySubject: id.lookup.identitySubject };
    const staff = where && await this.db.platSystemStaff.findUnique({ where, include: { grants: { where: { endedAt: null }, select: { roleCode: true } } } });
    if (!staff) return unauthorized(id.secondStep ? UNKNOWN : TWO_STEP, id.secondStep ? "UNKNOWN_STAFF" : "TWO_STEP_REQUIRED");
    const refuse = async (code: string, detail: string): Promise<never> => { await refused?.({ staffId: staff.id, name: staff.displayName }, code); return unauthorized(detail, code); };
    if (!id.secondStep) return refuse("TWO_STEP_REQUIRED", TWO_STEP);
    if (staff.status !== "ACTIVE") return refuse("STAFF_NOT_ACTIVE", "This ExpatReady staff account has been deactivated. Ask a Platform Owner.");
    // A session that started at or before the person's sessions were ended is refused (part 2 ends them on deactivation).
    if (staff.sessionsEndedAt && id.authTime * 1000 <= staff.sessionsEndedAt.getTime()) return refuse("SESSION_REVOKED", "This session was ended. Sign in again.");
    const roles = staff.grants.map((g) => g.roleCode).filter((r) => Object.hasOwn(SYSTEM_ROLES, r)).sort();
    const keys = roles.length ? (await this.db.platSystemRolePermission.findMany({ where: { roleCode: { in: roles } }, select: { permissionKey: true } })).map((k) => k.permissionKey).filter((k) => SYSTEM_KEY.test(k)) : [];
    return { staffId: staff.id, name: staff.displayName, email: staff.email, roles, keys: [...new Set(keys)].sort(), authTime: id.authTime, via: id.via };
  }

  /** The local stand-in's sign-in door (never in the test environment or production: the loader refuses the stand-in there). */
  async localSignIn(input: unknown, call: { device: string | null }) {
    // PF-28: the body through the one input rule first (a bad body is 422 wherever it is sent), then the stand-in's gate.
    const body = parseInput(SystemLocalSignInBody, input), email = body.email.trim().toLowerCase();
    if (!(this.port instanceof SystemLocalIdentity)) return problem(404, "Not available", "The local sign-in stand-in for ExpatReady staff is not switched on here (PLATFORM_SYSTEM_IDENTITY=local, local environment only).", { code: "STAND_IN_OFF" });
    const staff = email ? await this.db.platSystemStaff.findUnique({ where: { email }, select: { id: true, displayName: true, status: true, sessionsEndedAt: true } }) : null;
    if (!staff) return unauthorized("No ExpatReady staff member signs in with that work email.", "UNKNOWN_STAFF");
    // A refused sign-in by a known person is one REFUSED line (SA-7-20; review M2); an unknown email names nobody.
    const refuse = async (code: string, detail: string): Promise<never> => {
      await this.audit({ staff: { staffId: staff.id, name: staff.displayName }, method: "POST", route: "/api/system/session/local", target: {}, outcome: "REFUSED", code, reason: null, device: call.device });
      return unauthorized(detail, code);
    };
    if (staff.status !== "ACTIVE") return refuse("STAFF_NOT_ACTIVE", "This ExpatReady staff account has been deactivated. Ask a Platform Owner.");
    if (body.secondStep !== true) return refuse("TWO_STEP_REQUIRED", `${TWO_STEP} (secondStep: true)`);
    // The new session starts after the moment the person's sessions were last ended.
    const authTimeMs = Math.max(this.clock.now(), (staff.sessionsEndedAt?.getTime() ?? 0) + 1);
    await this.audit({ staff: { staffId: staff.id, name: staff.displayName }, method: "POST", route: "/api/system/session/local", target: {}, outcome: "ALLOWED", code: null, reason: null, device: call.device });
    return { token: this.port.issue(staff.id, { authTimeMs, secondStep: true }), tokenType: "Bearer", expiresIn: SYSTEM_LOCAL_TTL_SECONDS, staffId: staff.id };
  }

  /** Who am I: the person, their roles (code and display name) and the system/* keys they sum to. Never a firm. */
  me(s: SystemStaffContext) {
    return { staffId: s.staffId, name: s.name, email: s.email, staffOf: "ExpatReady", roles: s.roles.map((code) => ({ code, name: SYSTEM_ROLES[code as keyof typeof SYSTEM_ROLES] })), keys: s.keys };
  }

  /** One audit line (SA-7-3, SA-7-20): ExpatReady staff, the person's id and name, the route, what it affected and the
   *  request id (PF-23's, the X-Request-Id the answer carries; a new one outside a request scope). Throws when it cannot
   *  be written, so the call it stands for does not happen. */
  async audit(l: SystemAuditLine, tx?: Pick<Db, "platSystemAudit">): Promise<void> {
    const requestId = requestScope.getStore()?.correlationId ?? randomUUID();
    await (tx ?? this.db).platSystemAudit.create({ data: { staffId: l.staff.staffId, staffName: l.staff.name, method: l.method, route: l.route, target: l.target as Prisma.InputJsonObject, outcome: l.outcome, code: l.code, reason: l.reason, requestId, device: l.device } });
  }
}
