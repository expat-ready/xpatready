// ESLint for the Studio, report-only (LR-083; technology gate: product/design/lr-083-gate-eslint.md).
// Every finding on main when this was added is held in eslint-suppressions.json (ESLint's bulk suppressions), so only a
// new finding shows: `npx eslint . --pass-on-unpruned-suppressions` exits 0 when nothing new appears. CI runs it report-only
// (.github/workflows/lint-report.yml). After fixing held findings, `npx eslint . --prune-suppressions` shrinks the file.
// Never add to it by hand or with --suppress-all (that would hide a new finding).
// Not type-aware on purpose (no parserOptions.project): about 2,400 files in ~75 s, one file in about a second.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/generated/**", "evidence/**/out/**", "coverage/**"] },
  {
    files: ["**/*.{ts,tsx,mts,cts,js,mjs,cjs}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.node }, ecmaVersion: "latest", sourceType: "module" },
    linterOptions: { reportUnusedDisableDirectives: "warn" },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["web/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat["recommended-latest"] ?? reactHooks.configs.flat.recommended],
    languageOptions: { globals: { ...globals.browser } },
  },
);
