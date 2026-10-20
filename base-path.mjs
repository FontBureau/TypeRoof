/* global process */

// Single source of truth for the deployment base path of the site:
// vite.config.js (Vite `base`), eleventy.config.mjs (Eleventy
// `pathPrefix`) and the puppeteer QA probes all derive it from here.
//
// Configure with the BASE_PATH environment variable to build/serve the
// site under a sub-directory, e.g. `BASE_PATH=TypeRoof` for a GitHub
// Pages project site at https://fontbureau.github.io/TypeRoof/.
// The default "/" deploys to the domain root, e.g. a custom subdomain
// like tools.typeroof.org.

/**
 * Canonical form of a raw base path: "/", "TypeRoof", "/TypeRoof" and
 * "TypeRoof/" become "/", "/TypeRoof/", "/TypeRoof/" and "/TypeRoof/".
 */
export function normalizeBasePath(rawBasePath) {
    const trimmed = rawBasePath.replace(/^\/+|\/+$/g, "");
    return trimmed ? `/${trimmed}/` : "/";
}

/**
 * The deployment base path, from the BASE_PATH environment variable.
 */
export function getBasePath() {
    return normalizeBasePath(process.env.BASE_PATH ?? "/");
}
