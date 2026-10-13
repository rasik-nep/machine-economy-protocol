import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    files: ["scripts/**/*.mjs", "eslint.config.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
        AbortSignal: "readonly",
        setTimeout: "readonly"
      }
    }
  },
  {
    files: ["apps/web/src/dashboard.ts"],
    rules: {
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowNullish: true }
      ]
    }
  },
  {
    ignores: [
      ".anchor/",
      ".pnpm-store/",
      "build/",
      "coverage/",
      "dist/",
      "apps/web/public/app.js",
      "apps/web/public/site.js",
      "apps/web/public/replay-mode.js",
      "test-results/",
      "playwright-report/",
      "ledger/",
      "node_modules/",
      "target/",
      "test-ledger/"
    ]
  }
);
