import eslint from "@eslint/js";
import react from "eslint-plugin-react";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
    // Global ignores
    {
        ignores: ["**/vendor/**", "_site/**", "dist/**"],
    },
    eslint.configs.recommended,
    react.configs.flat.recommended,
    react.configs.flat["jsx-runtime"],

    ...tseslint.configs.recommended.map((conf) => ({
        ...conf,
        // apply only to TypeScript files
        files: ["**/*.{ts,tsx}"],
    })),
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
                    varsIgnorePattern: "React|h",
                },
            ],
            // generators without a yield are perfectly fine and  the behavior is well defined
            "require-yield": "off",
        },
    },
    {
        // this seems sufficient yo just override rules for the .typeroof.jsx flavor
        files: ["**/*.typeroof.jsx"],
        rules: {
            "react/no-unknown-property": "off",
            "no-unused-vars": [
                "warn",
                {
                    varsIgnorePattern: "h",
                    argsIgnorePattern: "h",
                },
            ],
            "react/jsx-key": "off",
        },
    },
];
