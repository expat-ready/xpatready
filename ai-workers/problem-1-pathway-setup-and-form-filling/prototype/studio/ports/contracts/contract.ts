// PF-0c (P-606 (8); Fowler's ContractTest): one shared behaviour test per port, run by the port's fake AND by every real
// adapter, so a fake can never promise what the real adapter does not do (QA-452, QA-453). A contract is a function
// `(makeAdapter) => cases`: the cases are the behaviours the port's callers rely on, taken from the port file's own
// comments and its callers' tests (no new rule). Each adapter's own test file runs it with one call:
//   await runContract(jobPortContract, "PgBossJobs", () => harness, ok);
// tools/check-port-contracts.mjs fails CI when a port with a real adapter has no contract here, or when one of its
// adapters (fakes included) has no such call. This folder imports only its own files (ports/ rule, case-side contract
// v0.1 §1 rule 3).

/** One behaviour. `run` throws (or rejects) when the adapter does not keep it. */
export type ContractCase = { name: string; run: () => Promise<void> };

/** A contract: the port's name and the function that turns an adapter factory into cases. */
export type Contract<M> = ((make: M) => ContractCase[]) & { readonly port: string };

export function defineContract<M>(port: string, cases: (make: M) => ContractCase[]): Contract<M> {
  return Object.assign(cases, { port });
}

/** The test file's own reporter (`ok(name, condition, detail)`). */
export type Report = (name: string, pass: unknown, detail?: unknown) => void;
export type ContractResult = { port: string; adapter: string; passed: string[]; failed: string[]; notTested: string | null };

/** A behaviour the adapter broke: `expect` throws it. */
export class ContractBroken extends Error {
  constructor(message: string, readonly detail?: unknown) { super(message); this.name = "ContractBroken"; }
}

export function expect(condition: unknown, what: string, detail?: unknown): asserts condition {
  if (!condition) throw new ContractBroken(what, detail);
}

/** Resolves when `f` throws (or rejects) and `test` accepts the error; throws ContractBroken otherwise. */
export async function expectRefused(f: () => unknown, what: string, test: (e: unknown) => boolean = () => true): Promise<void> {
  let thrown: unknown, threw = false;
  try { await f(); } catch (e) { thrown = e; threw = true; }
  if (!threw) throw new ContractBroken(`${what}: nothing was refused`);
  if (!test(thrown)) throw new ContractBroken(`${what}: refused with another error`, thrown instanceof Error ? `${thrown.name}: ${thrown.message}` : String(thrown));
}

/** How long one case may take before it counts as failed (a real adapter that hangs never hangs the suite). */
export const CASE_LIMIT_MS = 90_000;

/**
 * Runs `contract` against the adapter `make` builds and reports one line per case, `PF-0c DW2 <Port> <adapter>: <case>`,
 * then one line for the whole adapter, `PF-0c DW2 <Port> <adapter>`. With `report` null nothing is printed (a test that
 * proves a broken adapter fails, DW3, reads the result). `opts.notTested` (a reason) runs no case and prints one
 * NOT TESTED line, counted neither green nor red (P-405): CognitoIdentity without AWS credentials.
 */
export async function runContract<M>(contract: Contract<M>, adapter: string, make: M, report: Report | null, opts: { notTested?: string | null } = {}): Promise<ContractResult> {
  const result: ContractResult = { port: contract.port, adapter, passed: [], failed: [], notTested: opts.notTested ?? null };
  const label = `PF-0c DW2 ${contract.port} ${adapter}`;
  if (result.notTested) {
    if (report) console.log(`NOT TESTED  ${label}: ${result.notTested} (never counted green, P-405)`);
    return result;
  }
  for (const c of contract(make)) {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([c.run(), new Promise((_, reject) => { timer = setTimeout(() => reject(new ContractBroken(`took over ${CASE_LIMIT_MS / 1000} s`)), CASE_LIMIT_MS); })]);
      result.passed.push(c.name);
      report?.(`${label}: ${c.name}`, true);
    } catch (e) {
      result.failed.push(c.name);
      report?.(`${label}: ${c.name}`, false, e instanceof ContractBroken ? { broken: e.message, detail: e.detail } : e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    } finally { clearTimeout(timer); }
  }
  report?.(`${label}: passes its contract (${result.passed.length} of ${result.passed.length + result.failed.length} cases)`, result.failed.length === 0 && result.passed.length > 0, result.failed);
  return result;
}
