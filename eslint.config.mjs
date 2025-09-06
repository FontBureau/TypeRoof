import react from "eslint-plugin-react";
import globals from "globals";

export default [
  // Global ignores
  {
    ignores: ["**/vendor/**", "_site/**", "dist/**"],
  },
  react.configs.flat.all,
  react.configs.flat["jsx-runtime"],
  {
    // Main configuration
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    plugins: {
      react,
    },
    settings: {
      react: {
        version: "detect",
      },
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
      "no-unused-vars": [
        "warn",
        {
          varsIgnorePattern: "React",
        },
      ],
      "react/jsx-no-literals": "off",
      "react/no-multi-comp": "off",
      "react/jsx-indent-props": "off", // prettier disagrees
      "react/jsx-indent": "off", // prettier disagrees
      "react/jsx-one-expression-per-line": "off", // prettier disagrees
      "react/jsx-max-props-per-line": "off", // prettier disagrees
      // https://github.com/FontBureau/TypeRoof/pull/43#issuecomment-3260094773
      "react/jsx-no-bind": "off", // alternatives are worse, e.g. useCallback
    },
  },
];
