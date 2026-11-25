// J-31 (R1.31 stage kinds; Won only by a signature or Convert, never by a person's move; totals per currency, never
// mixed): R1.31 is built and walked together with R1.30 (FO-4 part 2a, one board), so its journey is J-30's walk, run
// here on its own copy under R1.31's number: automatic proof looks for tests/journeys/j_<n>.ts per item (P-728 (3)).
// The R1.31 lines in it: A1 fail (a person's move into Won → 422), W3 (totals per currency side by side; no sum across
// currencies), W3 DW9 (Won is not offered by "Move to…"), W6 DW11 (Won by Convert, cause CONVERT; Undo; a signed
// retainer). The browser is the journey's own chromium. Sample rows only; US$0. Run from prototype/:
//   zsh studio/tools/isolated.sh j31 4447 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j31 4447 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_31.ts j31 4447
import "./j_30.ts";
