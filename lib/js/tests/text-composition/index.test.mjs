// NOTE: NODE environment on purpose — NO jsdom environment docblock
// (vitest scans comments for the pragma; do not write it here, not
// even to explain its absence): harfbuzzjs initializes its WASM at
// import time and its emscripten environment detection treats any
// global `document` as "browser" (resolving the WASM via location,
// which breaks under vitest). So: static imports for harfbuzz et al
// (plain node init — proven by measurer.test.mjs), and the harness
// chain (needs DOM globals) imported dynamically in beforeAll, AFTER
// the JSDOM globals are set. Composition itself is
// DOM-measurement-free, jsdom-safe.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// STATIC imports that must land BEFORE any DOM global exists
// (harfbuzz: emscripten treats a global document as "browser" and
// resolves its WASM via location — broken under vitest; statically
// imported here, it initializes under plain node and works).
// Proven: measurer.test.mjs. The harness chain (needs DOM globals)
// is imported dynamically in beforeAll, AFTER globals are set.
import * as harfbuzz from "../../vendor/harfbuzzjs/harfbuzz.mjs";
import { decompressFontBuffer, createFontObject } from "../../font-info.mjs";
import { StateComparison, getEntry, Path } from "../../metamodel.mjs";
import { JSDOM } from "jsdom";

let buildWorld;

// Text-composition structure tests (Sprint B): assert composed line
// structure FROM DOCUMENT INPUTS — payload level (composition@
// registry) and DOM level (line spans in the viewer article).
// Behavior-level: no viewer/controller internals referenced.

const __dirname = dirname(fileURLToPath(import.meta.url)),
    ROBOTO_FLEX_WOFF2 = join(
        __dirname,
        "../../../assets/fonts",
        "RobotoFlex[GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght].woff2",
    );

function loadRealFontValue() {
    const buffer = readFileSync(ROBOTO_FLEX_WOFF2),
        sfnt = decompressFontBuffer(
            buffer.buffer.slice(
                buffer.byteOffset,
                buffer.byteOffset + buffer.byteLength,
            ),
        ),
        fontObject = createFontObject(harfbuzz, sfnt),
        axisRanges = {};
    for (const axis of fontObject.tables.fvar.axes)
        axisRanges[axis.tag] = Object.freeze({
            name: axis.tag,
            min: axis.minValue,
            max: axis.maxValue,
            default: axis.defaultValue,
        });
    return {
        fullName: "Roboto Flex (composition test)",
        hbFace: new harfbuzz.Face(new harfbuzz.Blob(sfnt), 0),
        axisRanges,
        fontObject: {
            unitsPerEm: fontObject.unitsPerEm,
            ascender: fontObject.ascender,
            descender: fontObject.descender,
        },
    };
}

const queryArticle = (world) =>
        world.zones.get("layout").querySelector("article.typeroof-document"),
    // the text of a textblock element = concatenation of all its text
    // (line spans split mid-run; hard breaks are dropped)
    textblockText = (el) => {
        const walker = el.ownerDocument.createTreeWalker(
                el,
                el.ownerDocument.defaultView.NodeFilter.SHOW_TEXT,
            ),
            parts = [];
        let node;
        while ((node = walker.nextNode())) parts.push(node.data);
        return parts.join("");
    };

describe("text-composition in the viewer", () => {
    let world, compositionHandler;
    beforeAll(async () => {
        // DOM globals BEFORE the harness import (it reads document
        // at call time); harfbuzz is already initialized (static
        // import above — see the head note)
        const dom = new JSDOM("<!doctype html><html><body></body></html>", {
            url: "http://localhost/",
            pretendToBeVisual: true, // requestAnimationFrame
        });
        for (const key of [
            "window",
            "document",
            "DOMParser",
            "Node",
            "NodeFilter",
            "Element",
            "HTMLElement",
            "DocumentFragment",
            "CustomEvent",
            "MutationObserver",
            "requestAnimationFrame",
            "cancelAnimationFrame",
        ])
            globalThis[key] =
                key === "window"
                    ? dom.window
                    : key === "document"
                      ? dom.window.document
                      : dom.window[key];
        // setup.ts stubs ResizeObserver on globalThis; the layout
        // reads it via domTool.window — copy the stub over
        dom.window.ResizeObserver = globalThis.ResizeObserver;
        ({ buildWorld } = await import("../type-stage-toggles/harness.mjs"));
        world = await buildWorld({
            harfbuzz,
            fontValue: loadRealFontValue(),
        });
        // switch to compare mode (editor + viewer side by side)
        const oldState = world.getState(),
            draft = oldState.getDraft();
        draft.get("activeState").get("documentRendererMode").value = "compare";
        const newState = draft.metamorphose();
        world.setState(newState);
        world.root.update(new StateComparison(oldState, newState));
        compositionHandler = world.root
            .getWidgetById("typeStageController")
            .widgetBus.wrapper.getProtocolHandlerImplementation("composition@");
    }, 300_000);

    it("publishes composition@ payloads per textblock (payload level)", () => {
        // derive the composition@ ids from the DOM: each composed
        // block's --node-anchor-name carries its document-node path
        // (DOM -> id -> payload, fully behavior-level)
        const article = queryArticle(world),
            blocks = article.querySelectorAll(".typeroof-composed"),
            ids = [...blocks].map((block) => {
                const anchor =
                    block.style.getPropertyValue("--node-anchor-name");
                return `composition@${anchor.split("@").at(-1).replaceAll("\\", "")}`;
            });
        expect(ids.length).toBeGreaterThan(0);
        for (const id of ids) {
            const payload = compositionHandler.getRegistered(id);
            expect(payload.paragraphs.length).toBeGreaterThan(0);
            for (const { segments, result } of payload.paragraphs) {
                expect(result.lines.length).toBeGreaterThan(0);
                // lines cover the segments contiguously and completely
                let cursor = 0;
                for (const line of result.lines) {
                    expect(line.fromSegment).toBe(cursor);
                    cursor = line.toSegment;
                }
                expect(cursor).toBe(segments.length);
            }
        }
    });

    it("renders line spans in the viewer (DOM level)", () => {
        const article = queryArticle(world);
        expect(article).not.toBe(null);
        const composed = article.querySelectorAll(".typeroof-composed");
        expect(composed.length).toBeGreaterThan(0);
        for (const block of composed) {
            const lineSpans = block.querySelectorAll(
                ".typeroof-composition-line",
            );
            expect(lineSpans.length).toBeGreaterThan(0);
            // the line spans reconstruct the source text exactly
            const spanText = [...lineSpans]
                .map((span) => span.textContent)
                .join("");
            expect(spanText).toBe(textblockText(block));
            // the first line of the paragraph carries both classes
            const firstLine = block.querySelector(
                ".typeroof-composition-line-first",
            );
            expect(firstLine).not.toBe(null);
        }
    });

    it("mark-less runs get the carrier span", () => {
        const carriers = queryArticle(world).querySelectorAll(
            "span.typeroof-composition-run",
        );
        expect(carriers.length).toBeGreaterThan(0);
    });

    it("OFF MODE restores browser rendering (no spans, no class)", () => {
        const oldState = world.getState(),
            draft = oldState.getDraft();
        draft.get("activeState").get("typeSpec").get("textComposition").value =
            false;
        const newState = draft.metamorphose();
        world.setState(newState);
        world.root.update(new StateComparison(oldState, newState));

        const article = queryArticle(world);
        expect(article.querySelectorAll(".typeroof-composed")).toHaveLength(0);
        expect(
            article.querySelectorAll(".typeroof-composition-line"),
        ).toHaveLength(0);
        // text survives unwrapped
        expect(article.textContent).toContain("Typography");

        // back on for the following tests
        const oldState2 = world.getState(),
            draft2 = oldState2.getDraft();
        draft2.get("activeState").get("typeSpec").get("textComposition").value =
            true;
        const newState2 = draft2.metamorphose();
        world.setState(newState2);
        world.root.update(new StateComparison(oldState2, newState2));
        expect(
            queryArticle(world).querySelectorAll(".typeroof-composed").length,
        ).toBeGreaterThan(0);
    });

    it("editing text recomposes the paragraph", () => {
        const article = queryArticle(world),
            before = article.querySelector(".typeroof-composed"),
            beforeText = textblockText(before),
            // find the first text node's PATH in the immutable
            // document, then get its draft via the path (draft
            // containers don't yield child drafts on .value)
            oldState = world.getState(),
            docRoot = oldState.get("activeState").get("document"),
            findFirstTextPath = (node, path) => {
                for (const [index, child] of node
                    .get("content")
                    .value.entries()) {
                    const childPath = path.append("content", index);
                    if (child.get("typeKey").value === "text") return childPath;
                    const found = findFirstTextPath(child, childPath);
                    if (found !== null) return found;
                }
                return null;
            },
            textPath = findFirstTextPath(
                docRoot,
                // the document model root (the harness wraps the
                // layout at /activeState)
                Path.fromString("/activeState/document"),
            ),
            draft = oldState.getDraft(),
            textNode = getEntry(draft, textPath);
        expect(textNode).not.toBe(null);
        textNode.get("text").value = "EDITED-COMPOSITION-PROBE";
        const newState = draft.metamorphose();
        world.setState(newState);
        world.root.update(new StateComparison(oldState, newState));

        const after = queryArticle(world);
        expect(after.textContent).toContain("EDITED-COMPOSITION-PROBE");
        // still composed (spans), and the probe text is inside spans
        const spans = after.querySelectorAll(".typeroof-composition-line");
        expect(
            [...spans].some((span) =>
                span.textContent.includes("EDITED-COMPOSITION-PROBE"),
            ),
        ).toBe(true);
        void beforeText;
    });
});
