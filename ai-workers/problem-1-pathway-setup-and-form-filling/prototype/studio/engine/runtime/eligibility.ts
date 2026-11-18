// AS-1m (P-588, contract v0.1 §2.6): the eligibility rules moved to engine/eligibility/assess.ts. This file stays one
// release as a re-export for the callers not switched yet, then it is deleted.
export * from "../eligibility/assess.ts";
