// PF-4t proof (removed in the next commit): a deliberate type error in a file no feature imports, so only the
// api/tsconfig include of src/platform/** reaches it. CI's "types" job must fail on it.
export const pf4tTypeProof: number = "not a number";
