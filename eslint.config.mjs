import globals from "globals";

export default [
  // Global ignores
  {
    ignores: [
      "**/vendor/**",
      "_site/**",
      "lib/js/components/layouts/list-of-many-links.mjs", // TODO: parser error in this file
    ],
  },
  // Main configuration
  {
    languageOptions: {
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
      "no-unused-vars": "warn",
    },
  },
];
