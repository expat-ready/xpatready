// AS-1m (P-588, contract v0.1 §2.6): evalCondition, moved unchanged from engine/render.ts (which re-exports it), so
// engine/eligibility/ never reaches engine/runtime/ (render.ts imports runtime/relatives.ts and compared.ts). One
// condition for one person: contracts/rules.ts evaluate over the person's facts (R6b, the resolver's factsOf).
import { CALCULATIONS, evaluate, type PredicateNode, type Truth } from "../../../contracts/rules.ts";
import type { Snapshot } from "../snapshot.ts";
import { factsOf, type Known } from "../resolver.ts";

export type Cond = { applies: Truth; missing: string[] };
export function evalCondition(s: Snapshot, known: Known, tree: any, about: string): Cond {
  if (!tree) return { applies: true, missing: [] };
  const { subjectKind: _k, ...node } = tree;
  const text = JSON.stringify(node);
  const derived = (s.derived_fields ?? []).filter((d: any) => d.executable && CALCULATIONS[d.calculation] && text.includes(`"${d.id}"`));
  try { const e = evaluate(node as PredicateNode, factsOf(known, about), derived); return { applies: e.result, missing: e.missing }; }
  catch (e) { return { applies: "cannot_tell", missing: [`(not executable: ${(e as Error).message.slice(0, 80)})`] }; }
}
