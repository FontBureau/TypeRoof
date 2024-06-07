module.exports = {
  "env": {
      "browser": true,
      "es2021": true
  },
  "extends": "eslint:recommended",
  "parserOptions": {
      "ecmaVersion": "latest",
      "sourceType": "module"
  },
  "rules": {
      // sparse arrays can be a subtle error, but often
      // I want to use them.
      "no-sparse-arrays": "off"
  },
}

