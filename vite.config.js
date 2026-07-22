import { defineConfig, transformWithOxc } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import browserslist from "browserslist";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url)),
    // Set base path to match Eleventy's pathPrefix
    basePath = "/TypeRoof/";

// esbuild-style engine names understood by Vite's cssTarget converter,
// mapped from browserslist names.
const esbuildEngineNames = {
    chrome: "chrome",
    edge: "edge",
    firefox: "firefox",
    safari: "safari",
    ios_saf: "ios",
    opera: "opera",
};

// Minimum version per engine from .browserslistrc ("defaults") as
// esbuild-style targets (e.g. "firefox140") for `build.cssTarget`.
// Without cssTarget, Lightning CSS minification assumes the latest of
// every browser and strips vendor fallbacks (e.g. the `width: stretch`
// fallbacks, unsupported in Firefox).
function browserslistToEsbuildTargets() {
    const minimumVersion = {};
    for (const entry of browserslist()) {
        const [browser, version] = entry.split(" ");
        const engine = esbuildEngineNames[browser],
            // "18.5-18.7" -> 18, "all" -> NaN
            major = parseInt(version, 10);
        if (!engine || Number.isNaN(major)) continue;
        if (!(engine in minimumVersion) || major < minimumVersion[engine])
            minimumVersion[engine] = major;
    }
    return Object.entries(minimumVersion).map(
        ([engine, major]) => `${engine}${major}`,
    );
}

export default defineConfig({
    plugins: [
        {
            // custom typeroof jsx flavor
            name: "vite:typeroof-jsx-plugin",
            enforce: "pre", // Runs this plugin before other transformations
            async transform(code, id) {
                if (!id.endsWith(".typeroof.jsx")) return null;

                // => {code: ..., map: ...}
                return await transformWithOxc(code, id, {
                    jsx: {
                        runtime: "classic",
                        // 'jsxFactory' maps to 'pragma'
                        pragma: "h",
                        // 'jsxFragment' maps to 'pragmaFrag'
                        pragmaFrag: "Fragment",
                    },
                    sourceMap: true,
                });
            },
        },
        {
            // Dev-server only: serve the app entry points (and their assets)
            // also without the basePath prefix, e.g. /app/player/index.html
            name: "typeroof:dev-direct-entry-urls",
            configureServer(server) {
                server.middlewares.use((req, _res, next) => {
                    // accept both unprefixed and basePath-prefixed URLs
                    const url = (req.url ?? "").startsWith(basePath)
                        ? `/${(req.url ?? "").slice(basePath.length)}`
                        : (req.url ?? "");
                    if (!/^\/(app|lib)(\/|$)/.test(url)) return next();
                    const [pathname, search] = url.split("?");
                    const normalized =
                        pathname.endsWith("/") || extname(pathname)
                            ? pathname
                            : `${pathname}/`;
                    req.url =
                        basePath +
                        normalized.slice(1) +
                        (search ? `?${search}` : "");
                    next();
                });
            },
        },
        viteStaticCopy({
            targets: [
                // Only copy non-JS assets as static files
                {
                    src: "lib/assets",
                    dest: "lib",
                },
                {
                    src: "lib/css",
                    dest: "lib",
                },
            ],
            structured: true,
            silent: false,
        }),
    ],

    base: basePath,

    // Development server configuration
    server: {
        port: 3000,
        open: `${basePath}shell.html`,
        proxy: {
            // Eleventy dev-server live-reload: client script + websocket
            "/.11ty": {
                target: "http://localhost:8080",
                ws: true,
            },
            // Everything else under basePath that isn't owned by Vite is
            // documentation content served by Eleventy
            [`^${basePath}(?!@|node_modules/|app/|lib/|shell\\.html|legacy\\.html)`]:
                {
                    target: "http://localhost:8080",
                    changeOrigin: true,
                    configure: (proxy /*, options*/) => {
                        proxy.on("error", (err, req, res) => {
                            // Handle gracefully when Eleventy isn't running
                            console.log(
                                "Proxy error (Eleventy may not be running):",
                                err.message,
                            );
                            res.writeHead(502, {
                                "Content-Type": "text/html",
                            });
                            res.end(`<!DOCTYPE html>
              <html lang="en">
                <head>
                  <meta charset="utf-8" />
                  <title>TypeRoof Documentation</title>
                </head>
                <body style="font-family: Arial, sans-serif; padding: 40px;">
                  <h1>Documentation Not Available</h1>
                  <p>The documentation server (Eleventy) is not running.</p>
                  <p>To access documentation, run: <code>npm run dev</code></p>
                  <p>Or start Eleventy separately: <code>npm run dev:doc</code></p>
                  <hr>
                  <p><a href="${basePath}shell.html">← Back to TypeRoof Shell</a></p>
                </body>
              </html>
            `);
                        });
                    },
                },
        },
    },

    // Build configuration
    build: {
        outDir: "dist",
        assetsDir: "assets",
        target: "esnext",
        // Lightning CSS minification targets, derived from .browserslistrc
        // ("defaults"); without them vendor fallbacks get stripped.
        cssTarget: browserslistToEsbuildTargets(),
        rolldownOptions: {
            input: {
                shell: resolve(__dirname, "shell.html"),
                legacy: resolve(__dirname, "legacy.html"),
                player: resolve(__dirname, "app/player/index.html"),
                wikipedia: resolve(__dirname, "app/wikipedia/index.html"),
            },
            output: {
                keepNames: true,
            },
        },
    },
    // Path resolution
    resolve: {
        alias: {
            "@js": "/lib/js",
            "@css": "/lib/css",
            "@assets": "/lib/assets",
        },
    },

    // Disable default public directory copying (handled by vite-plugin-static-copy)
    publicDir: false,

    // CSS configuration
    css: {
        devSourcemap: true,
    },
});
