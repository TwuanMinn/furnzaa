// eslint-config-next ships native flat configs since v15 — importing them
// directly; routing them through FlatCompat crashes ESLint 9 (circular
// structure during eslintrc schema validation).
import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "src/lib/supabase/database.types.ts",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Advisory performance rule; the codebase deliberately uses the
      // reset-dialog-state-on-open idiom it flags. Real purity violations
      // (react-hooks/purity) stay errors.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
