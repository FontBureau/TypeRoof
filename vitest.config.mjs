import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        include: ['lib/js/**/*.test.mjs'],
        exclude: ['lib/js/vendor/**', '**/node_modules/**'],
    },
});
