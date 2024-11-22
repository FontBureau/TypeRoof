import globals from "globals";

export default [{
  "languageOptions": {
      "ecmaVersion": "latest",
      "sourceType": "module",
      "globals": {
        ...globals.browser
      }
  },
  "rules": {
      // sparse arrays can be a subtle error, but often
      // I want to use them.
      "no-sparse-arrays": "off",
      "no-undef": ["error", { "typeof": true }],
      "no-unused-vars": "warn"
  },
}];

