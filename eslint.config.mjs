import react from "eslint-plugin-react";
import globals from "globals";

export default [
  // Global ignores
  {
    ignores: ["**/vendor/**", "_site/**", "dist/**"],
  },
  react.configs.flat.all,
  react.configs.flat['jsx-runtime'],
  {
  // Main configuration
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    plugins: {
      react,
    },
    settings: {
      react: {
        version: "detect"
      }
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        introJs: "readonly", // TODO: remove this when we have it in the build process
        $: "readonly", // TODO: remove this when we have it in the build process
      },
    },
    rules: {
      // sparse arrays can be a subtle error, but often
      // I want to use them.
      "no-sparse-arrays": "off",
      "no-undef": ["error", { typeof: true }],
      "no-unused-vars": ["warn",{
          "varsIgnorePattern": "React"
      }],
      "react/jsx-no-literals": "off",
      "react/no-multi-comp": "off"
    },
  },
];
