#!/usr/bin/env node
/* global process */
// Generic puppeteer debug-probe runner for TypeRoof.
//
// Usage:
//   ./scripts/debug-with-puppeteer.mjs <probe-module> [probe args...]
// e.g.:
//   ./scripts/debug-with-puppeteer.mjs ./scripts/puppeteer-probes/debug-composition-issue.mjs
//
// The runner owns the environment: an in-process vite dev server
// (dedicated port, default 3100, override with PUPETEER_PORT), a
// headless chromium page with console/pageerror capture, app boot
// (default state; a probe may export `url` to override), and cleanup.
//
// Probe module contract (ESM):
//   export const url = "http://…"      // optional, overrides the app URL
//   export async function run(context) // required, the scenario
//
// context:
//   page          — puppeteer Page (shell is up, app booted)
//   browser       — puppeteer Browser
//   appUrl        — the URL the app was loaded from
//   consoleLines  — string[], every page console message (live)
//   setTimeout    — node:timers/promises setTimeout
//   log(...args)  — prefixed stdout logging
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";
import { setTimeout } from "node:timers/promises";
import { createServer } from "vite";

const directory = path.dirname(fileURLToPath(import.meta.url)),
    projectRoot = path.join(directory, ".."),
    PORT = Number(process.env.PUPETEER_PORT ?? 3100),
    BROWSER = process.env.PUPPETEER_BROWSER ?? "chrome",
    DEFAULT_APP_URL = `http://localhost:${PORT}/TypeRoof/shell.html`,
    VIEWPORT = { width: 1920, height: 1080 };

function log(...args) {
    console.log("[puppeteer]", ...args);
}

async function serverResponds(url) {
    return new Promise((resolve) => {
        http.get(url, (res) => {
                res.resume();
                resolve(res.statusCode !== undefined && res.statusCode < 500);
            })
            .on("error", () => resolve(false));
    });
}

async function startDevServer(appUrl) {
    if (await serverResponds(appUrl)) {
        log(`dev server already responding on :${PORT} — reusing`);
        return null;
    }
    log(`starting in-process vite dev server on :${PORT}…`);
    const server = await createServer({
        root: projectRoot,
        logLevel: "warn",
        server: { port: PORT, strictPort: true, open: false },
    });
    await server.listen();
    for (let i = 0; i < 120; i++) {
        if (await serverResponds(appUrl)) {
            log("dev server is up");
            return server;
        }
        await setTimeout(500);
    }
    throw new Error("TIMEOUT waiting for vite dev server");
}

async function waitForShell(page) {
    for (let i = 0; i < 360; i++) {
        try {
            if (await page.evaluate(() => "shell" in window)) return;
        } catch (error) {
            // transient: vite can trigger a full reload mid-poll
            // (dependency re-optimization), destroying the execution
            // context while the new navigation settles; keep polling
            if (!String(error).includes("Execution context was destroyed"))
                throw error;
        }
        await setTimeout(250);
    }
    throw new Error("TIMEOUT waiting for shell");
}

async function main() {
    const probeArg = process.argv[2];
    if (probeArg === undefined)
        throw new Error(
            "USAGE: debug-with-puppeteer.mjs <probe-module> [probe args...]",
        );
    const probePath = path.resolve(projectRoot, probeArg),
        probe = await import(pathToFileURL(probePath).href);
    if (typeof probe.run !== "function")
        throw new Error(`PROBE ERROR ${probeArg} has no run() export`);
    const appUrl = probe.url ?? DEFAULT_APP_URL;

    const server = await startDevServer(appUrl),
        browser = await puppeteer.launch({
            headless: true,
            timeout: 100000,
            protocolTimeout: 300000,
            ...(BROWSER === "firefox"
                ? { browser: "firefox" }
                : { executablePath: "/usr/bin/chromium-browser" }),
        });
    log(`browser: ${BROWSER}`);
    let exitCode = 0;
    try {
        const page = await browser.newPage(),
            consoleLines = [];
        await page.setViewport(VIEWPORT);
        page.on("console", (msg) => {
            const text = msg.text();
            consoleLines.push(text);
            if (process.env.PUPPETEER_CONSOLE === "1")
                console.log("[console]", text.slice(0, 300));
        });
        page.on("pageerror", (error) =>
            consoleLines.push(`[PAGEERROR] ${String(error)}`),
        );
        log(`loading ${appUrl} …`);
        await page.goto(appUrl, {
            waitUntil: ["load", "domcontentloaded"],
            timeout: 180000,
        });
        await waitForShell(page);
        log("shell is up — running probe", path.relative(projectRoot, probePath));
        await probe.run({
            page,
            browser,
            appUrl,
            consoleLines,
            setTimeout,
            log,
            probeArgs: process.argv.slice(3),
        });
    } catch (error) {
        exitCode = 1;
        console.error("[puppeteer] PROBE FAILED:", error);
    } finally {
        await browser.close().catch(() => {});
        if (server !== null) await server.close();
    }
    process.exit(exitCode);
}

await main();
