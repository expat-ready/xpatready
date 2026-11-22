// FO-9b part 1: the PersonMergePort adapter (ports/person-merge.ts, part 0; case-side contract v0.1 §3.3, §7). It runs
// mergeRecords / unmergeRecords (service.ts) inside the caller's transaction and never opens its own: the case side's
// ClientMergePort (CS-K2) calls it in its merge transaction, and part 2's routes in theirs. Passes the shared contract
// ports/contracts/person-merge-port.contract.ts (tests/check_fo9b_merge.ts DW9).
import type { PersonMergePort } from "../../../../../ports/person-merge.ts";
import { auditEvent } from "../../../platform/audit/audit-event.ts";
import { ConsentStore } from "../../../platform/messages/consent/consent-store.ts";
import type { Tx } from "../../sales/common.ts";
import { mergeRecords, unmergeRecords, type MergePorts } from "./service.ts";

export class PersonMergeAdapter implements PersonMergePort<Tx> {
  private readonly ports: MergePorts;
  constructor(ports?: Partial<MergePorts>) {
    const audit = ports?.audit ?? auditEvent;
    this.ports = { audit, consent: ports?.consent ?? new ConsentStore(audit), ...(ports?.emit ? { emit: ports.emit } : {}) };
  }
  mergePersons(tx: Tx, ctx: Parameters<PersonMergePort<Tx>["mergePersons"]>[1], input: Parameters<PersonMergePort<Tx>["mergePersons"]>[2]) { return mergeRecords(tx, ctx, input, this.ports); }
  unmergePersons(tx: Tx, ctx: Parameters<PersonMergePort<Tx>["unmergePersons"]>[1], mergeRef: string) { return unmergeRecords(tx, ctx, mergeRef, this.ports); }
}
