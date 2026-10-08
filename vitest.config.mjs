import { defineConfig, transformWithOxc } from 'vite';

export default defineConfig({
    // Stable cache location (2026-10-08): vitest 5.0.1 leaked a ~21MB
    // per-run transform temp dir into $TMPDIR on EVERY run (729 dirs
    // / 15GB accumulated); 5.0.3 cleans up, and a pinned cacheDir
    // keeps the cache reusable across runs instead.
    cacheDir: 'node_modules/.cache/vitest',
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
        setupFiles: ['lib/js/tests/setup.ts'],
        include: ['lib/js/**/*.test.mjs'],
        exclude: ['lib/js/vendor/**', '**/node_modules/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            exclude: [
                'lib/js/vendor/**',
                '**/node_modules/**',
                '**/*.test.mjs',
                '**/tests/**',
            ],
        },
    },
});
