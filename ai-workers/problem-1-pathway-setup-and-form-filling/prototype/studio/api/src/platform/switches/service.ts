// PF-21d part 1 (SA-11-16 (d)): platform switches, the minimal home the tech lead accepted on #3189 until SA-12's feature
// flags exist. One row per switch, on by default; turning one off or on needs a reason and writes one insert-only event
// and one line in our staff's trail (plat_system_audit, ALLOWED inside the change's transaction, REFUSED otherwise).
// Only staff holding system/compliance:dsr-manage (the Platform Owner; Sample: SA-12 names no key) read or change them.
// The one switch today: "Data erasure" (platform.data-erasure), the erasure job's own stop, separate from the worker start.
import { HttpException, Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { Db } from "../../core.ts";
import { FIELD_ERROR_STATUS, fieldsOf } from "../http/input.ts";
import { forbidden, problem } from "../identity/keys.ts";
import { DSR_KEY, type CallLine, type RequestCaller } from "../register/requests/service.ts";
import { SystemIdentity } from "../system-identity/service.ts";

export const DATA_ERASURE_SWITCH = "platform.data-erasure";
export const SWITCH_WORDS: Record<string, string> = { [DATA_ERASURE_SWITCH]: "Data erasure" };
export type SwitchView = { key: string; name: string; on: boolean; changedBy: string | null; changedAt: string | null };
const SetBody = z.strictObject({
  on: z.boolean({ error: "On or off." }),
  reason: z.string().trim().min(1, "Give the reason.").max(500, "At most 500 characters.")
    .refine((r) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/.test(r), "Write it as ordinary text."),
});
const codeOf = (e: unknown) => e instanceof HttpException ? String((e.getResponse() as { code?: unknown })?.code ?? `HTTP_${e.getStatus()}`) : "ERROR";
type Row = { key: string; is_on: boolean; changed_by: string | null; changed_at: Date | null };

@Injectable()
export class PlatSwitches {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(SystemIdentity) private readonly identity: Pick<SystemIdentity, "audit">) {}
  private allowed(c: RequestCaller) {
    if (!c || !c.keys.includes(DSR_KEY)) forbidden("Only ExpatReady staff who manage privacy requests can read or change the platform switches.", "MISSING_PERMISSION");
  }
  /** GET /api/system/switches. */
  async list(c: RequestCaller): Promise<{ switches: SwitchView[] }> {
    this.allowed(c);
    return { switches: (await this.rows()).map((r) => ({ key: r.key, name: SWITCH_WORDS[r.key] ?? r.key, on: r.is_on, changedBy: r.changed_by, changedAt: r.changed_at?.toISOString() ?? null })) };
  }
  /** POST /api/system/switches/:key { on, reason }: 200 with the switch; 404 an unknown switch; 409 already so. */
  async set(c: RequestCaller, line: CallLine | null, key: string, body: unknown): Promise<SwitchView> {
    this.allowed(c);
    try {
      await this.db.$transaction(async (tx) => {
        const p = SetBody.safeParse(body ?? {});
        if (!p.success) problem(FIELD_ERROR_STATUS, "Check the highlighted fields", "Some fields need a change.", { code: "SWITCH_FIELDS", fields: fieldsOf(p.error) });
        const [{ out }] = await tx.$queryRaw<{ out: string }[]>`SELECT plat_switch_set(${key}, ${p.data.on}, ${p.data.reason}, ${`staff:${c.staffId}`}) AS out`;
        if (out === "NOT_FOUND") problem(404, "Not found", "No such switch.", { code: "NOT_FOUND" });
        if (out === "SAME") problem(409, "Already so", `The switch is already ${p.data.on ? "on" : "off"}; nothing was changed.`, { code: "SAME_STATE" });
        if (line) await this.identity.audit({ ...line, target: { ...line.target, switch: key, on: p.data.on }, outcome: "ALLOWED", code: null }, tx);
      });
    } catch (e) {
      if (line) await this.identity.audit({ ...line, outcome: "REFUSED", code: codeOf(e) });
      throw e;
    }
    return (await this.list(c)).switches.find((s) => s.key === key)!;
  }
  /** Is the switch on? An unknown switch is an error, never a silent on or off. */
  async isOn(key: string): Promise<boolean> {
    const hit = (await this.rows()).find((r) => r.key === key);
    if (!hit) throw new Error(`plat_switch: no switch ${key}`);
    return hit.is_on;
  }
  private rows() { return this.db.$queryRaw<Row[]>`SELECT key, is_on, changed_by, changed_at FROM plat_switch_list()`; }
}
