// LR-083 (lab register; FP #76, #101, #213, #214; OS-62): eslint, report-only. Technology gate (STANDARDS §1):
// product/design/lr083-gate-eslint.md. CI runs `npx eslint .` here in .github/workflows/studio-lint.yml with continue-on-error;
// the findings on main the day it landed are held in eslint-suppressions.json (bulk suppressions), so only new findings
// show. Not type-aware (no parserOptions.project): seconds, not minutes, and no tsconfig coupling.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "evidence/**", "**/dist/**", "**/*.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    // Bulk suppressions hold errors only: a warning or a stale disable comment would show on every PR as "new".
    linterOptions: { reportUnusedDisableDirectives: "off" },
  },
  {
    // CommonJS scripts (the older browser checks under tests/): require() is how they import.
    files: ["**/*.cjs", "**/*.cts"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["web/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules, "react-hooks/exhaustive-deps": "error" },
  },
);
