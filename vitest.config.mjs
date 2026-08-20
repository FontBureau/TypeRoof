import { defineConfig, transformWithOxc } from 'vite';

export default defineConfig({
    plugins: [
        {
            // custom typeroof jsx flavor, same transform as in vite.config.js
            // (.typeroof.jsx sources must compile with pragma h under
            // vitest as well)
            name: 'vite:typeroof-jsx-plugin',
            enforce: 'pre',
            async transform(code, id) {
                if (!id.endsWith('.typeroof.jsx')) return null;
                // => {code: ..., map: ...}
                return await transformWithOxc(code, id, {
                    jsx: {
                        runtime: 'classic',
                        // 'jsxFactory' maps to 'pragma'
                        pragma: 'h',
                        // 'jsxFragment' maps to 'pragmaFrag'
                        pragmaFrag: 'Fragment',
                    },
                    sourceMap: true,
                });
            },
        },
    ],
    test: {
        include: ['lib/js/**/*.test.mjs'],
        exclude: ['lib/js/vendor/**', '**/node_modules/**'],
    },
});
