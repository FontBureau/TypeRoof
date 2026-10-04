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
import {
    StateComparison,
    getEntry,
    Path,
    ForeignKey,
} from "../../metamodel.mjs";
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
        draft
            .get("activeState")
            .get("typeSpec")
            .get("textCompositionAlgorithm")
            .get("textCompositionAlgorithmTypeKey").value =
            "TextCompositionAlgorithmNoneModel";
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

        // back on for the following tests (empty = inherit)
        const oldState2 = world.getState(),
            draft2 = oldState2.getDraft();
        draft2
            .get("activeState")
            .get("typeSpec")
            .get("textCompositionAlgorithm")
            .get("textCompositionAlgorithmTypeKey").value = ForeignKey.NULL;
        const newState2 = draft2.metamorphose();
        world.setState(newState2);
        world.root.update(new StateComparison(oldState2, newState2));
        expect(
            queryArticle(world).querySelectorAll(".typeroof-composed").length,
        ).toBeGreaterThan(0);
    });

    it("per-typeSpec engagement: off on paragraphs inherits to t1/t2 only", () => {
        // the review scenario: "None (Browser)" on the
        // `paragraphs` typeSpec must turn composition off for
        // paragraphs/t1 and paragraphs/t2 (inheritable engagement)
        // while headings stay composed
        const oldState = world.getState(),
            draft = oldState.getDraft();
        draft
            .get("activeState")
            .get("typeSpec")
            .get("children")
            .get("paragraphs")
            .get("textCompositionAlgorithm")
            .get("textCompositionAlgorithmTypeKey").value =
            "TextCompositionAlgorithmNoneModel";
        const newState = draft.metamorphose();
        world.setState(newState);
        world.root.update(new StateComparison(oldState, newState));

        const article = queryArticle(world),
            composed = [...article.querySelectorAll(".typeroof-composed")].map(
                (el) => el.getAttribute("data-node-type"),
            );
        // headings remain composed, paragraphs decomposed
        expect(composed.length).toBeGreaterThan(0);
        expect(composed.every((type) => type.startsWith("heading"))).toBe(true);
        // paragraph text still present (browser rendering)
        expect(article.textContent).toContain("Typography is the");

        // restore
        const oldState2 = world.getState(),
            draft2 = oldState2.getDraft();
        draft2
            .get("activeState")
            .get("typeSpec")
            .get("children")
            .get("paragraphs")
            .get("textCompositionAlgorithm")
            .get("textCompositionAlgorithmTypeKey").value = ForeignKey.NULL;
        const newState2 = draft2.metamorphose();
        world.setState(newState2);
        world.root.update(new StateComparison(oldState2, newState2));
        expect(
            [
                ...queryArticle(world).querySelectorAll(".typeroof-composed"),
            ].some((el) => el.getAttribute("data-node-type") === "paragraph"),
        ).toBe(true);
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
        textNode.get("text").value = "EDITEDCOMPOSITIONPROBE";
        const newState = draft.metamorphose();
        world.setState(newState);
        world.root.update(new StateComparison(oldState, newState));

        const after = queryArticle(world);
        expect(after.textContent).toContain("EDITEDCOMPOSITIONPROBE");
        // still composed (spans), and the probe text is inside spans.
        // Since hyphenation (milestone 3) a single word can be split
        // into per-segment spans, so assert on the reconstructed
        // text of the first composed block (the edited heading).
        const block = after.querySelector(".typeroof-composed"),
            spanText = [...block.querySelectorAll(".typeroof-composition-line")]
                .map((span) => span.textContent)
                .join("");
        expect(spanText).toContain("EDITEDCOMPOSITIONPROBE");
        void beforeText;
    });

    // Hyphenation (milestone 3, phase 4): the Host control changes
    // the composition INPUT — hyphen segments/breaks in the payload,
    // the hyphen line class in the DOM, source text untouched (the
    // hyphen is CSS ::after — selection/copy stay clean).
    it("hyphenation: hyphen breaks composed and rendered; the Host control turns them off", () => {
        // the ids of the composed blocks (DOM -> id -> payload, like
        // the payload-level test above)
        const composedPayloads = () => {
                const blocks =
                    queryArticle(world).querySelectorAll(".typeroof-composed");
                return [...blocks].flatMap((block) => {
                    const anchor =
                        block.style.getPropertyValue("--node-anchor-name");
                    return compositionHandler.getRegistered(
                        `composition@${anchor.split("@").at(-1).replaceAll("\\", "")}`,
                    ).paragraphs;
                });
            },
            hasHyphenInput = (paragraphs) =>
                paragraphs.some(({ segments }) =>
                    segments.some((s) => s.hyphenAfter === true),
                ),
            hasHyphenLine = (paragraphs) =>
                paragraphs.some(({ result }) =>
                    result.lines.some(
                        (line) => line.breakAt?.kind === "hyphen",
                    ),
                );

        // enlarge the font (the measure is fixed layout geometry,
        // so fewer words fit per line) — the greedy breaker must
        // take hyphen points
        const oldState = world.getState(),
            draft = oldState.getDraft();
        draft.get("activeState").get("typeSpec").get("baseFontSize").value = 40;
        const newState = draft.metamorphose();
        world.setState(newState);
        world.root.update(new StateComparison(oldState, newState));

        // payload level: hyphenation enabled by default -> hyphen
        // segments in the input AND lines broken at hyphen points
        const paragraphs = composedPayloads();
        expect(hasHyphenInput(paragraphs)).toBe(true);
        expect(hasHyphenLine(paragraphs)).toBe(true);
        // regression (greedy-ragged collapses fix): a hyphen break
        // is never CHOSEN when it doesn't fit — the fit test counts
        // the visible first part, hyphen glyph included. Overfull
        // hyphen-broken lines are only the forced minimal line: a
        // single fragment wider than the measure (one segment).
        for (const { result } of paragraphs)
            for (const lineIndex of result.diagnostics.overfullLines) {
                const line = result.lines[lineIndex];
                if (line.breakAt?.kind === "hyphen")
                    expect(line.toSegment - line.fromSegment).toBe(1);
            }

        // DOM level: the hyphen line class renders; the line spans
        // still reconstruct the source text exactly (no hyphen
        // character in the text — selection/copy stay clean)
        const article = queryArticle(world);
        expect(
            article.querySelectorAll(".typeroof-composition-line-hyphen")
                .length,
        ).toBeGreaterThan(0);
        for (const block of article.querySelectorAll(".typeroof-composed")) {
            const spanText = [
                ...block.querySelectorAll(".typeroof-composition-line"),
            ]
                .map((span) => span.textContent)
                .join("");
            expect(spanText).toBe(textblockText(block));
        }

        // the Host control: hyphenation disabled -> no hyphen input,
        // no hyphen lines
        const oldState2 = world.getState(),
            draft2 = oldState2.getDraft();
        draft2
            .get("activeState")
            .get("typeSpec")
            .get("hyphenation")
            .get("enabled").value = false;
        const newState2 = draft2.metamorphose();
        world.setState(newState2);
        world.root.update(new StateComparison(oldState2, newState2));

        const offParagraphs = composedPayloads();
        expect(hasHyphenInput(offParagraphs)).toBe(false);
        expect(hasHyphenLine(offParagraphs)).toBe(false);
        expect(
            queryArticle(world).querySelectorAll(
                ".typeroof-composition-line-hyphen",
            ),
        ).toHaveLength(0);

        // restore (empty = inherit for the hyphenation control; the
        // fixture's baseFontSize is 14)
        const oldState3 = world.getState(),
            draft3 = oldState3.getDraft();
        draft3
            .get("activeState")
            .get("typeSpec")
            .get("hyphenation")
            .get("enabled")
            .clear();
        draft3.get("activeState").get("typeSpec").get("baseFontSize").value =
            14;
        const newState3 = draft3.metamorphose();
        world.setState(newState3);
        world.root.update(new StateComparison(oldState3, newState3));
        expect(hasHyphenInput(composedPayloads())).toBe(true);
    });

    // Per-run style spans: a styled run is measured at its resolved
    // style. The fixture marks "legible" as <b> -> the "strong" mark
    // -> the "bold" patch (wght 700) via the root typeSpec's
    // markStyleLinks; unlinking the edge must measurably change the
    // run's widths (wght 700 vs the textblock's default).
    it("per-run styles: a styled run is measured at its resolved style", () => {
        // locate the "legible" text leaf (the <b> run) in the
        // document model
        const findLeafPath = (node, path, probe) => {
                for (const [index, child] of node
                    .get("content")
                    .value.entries()) {
                    const childPath = path.append("content", index);
                    if (child.get("typeKey").value === "text") {
                        const text = child.get("text");
                        if (!text.isEmpty && text.value === probe)
                            return childPath;
                    }
                    const content = child.get("content");
                    if (content !== undefined && content.value.length > 0) {
                        const found = findLeafPath(child, childPath, probe);
                        if (found !== null) return found;
                    }
                }
                return null;
            },
            leafPath = findLeafPath(
                world.getState().get("activeState").get("document"),
                Path.fromString("/activeState/document"),
                "legible",
            );
        expect(leafPath).not.toBe(null);
        // the payload carrying that leaf + the leaf's total measured
        // width (sum over its segments; hyphen splits included)
        const leafMeasure = () => {
            const blocks =
                queryArticle(world).querySelectorAll(".typeroof-composed");
            for (const block of blocks) {
                const anchor =
                        block.style.getPropertyValue("--node-anchor-name"),
                    payload = compositionHandler.getRegistered(
                        `composition@${anchor.split("@").at(-1).replaceAll("\\", "")}`,
                    ),
                    leafIndex = payload.leaves.findIndex(
                        (leaf) => leaf.path === leafPath.toString(),
                    );
                if (leafIndex === -1) continue;
                let width = 0;
                for (const { segments } of payload.paragraphs)
                    for (const segment of segments)
                        if (segment.sourceIndex === leafIndex)
                            width += segment.widthPt;
                return {
                    width,
                    styleLinkPropertiesId:
                        payload.leaves[leafIndex].styleLinkPropertiesId,
                };
            }
            throw new Error("no composition payload for the probe leaf");
        };

        const linked = leafMeasure();
        // per-run resolution engaged: the exclusive style link id
        expect(linked.styleLinkPropertiesId).toContain(
            "/markStyleLinks/strong",
        );

        // unlink the edge (tombstone): the run falls back to the
        // textblock style and must measure NARROWER (wght 700 -> 400)
        const oldState = world.getState(),
            draft = oldState.getDraft();
        draft
            .get("activeState")
            .get("typeSpec")
            .get("markStyleLinks")
            .get("strong")
            .get("mode").value = "unlinked";
        const newState = draft.metamorphose();
        world.setState(newState);
        world.root.update(new StateComparison(oldState, newState));

        const unlinked = leafMeasure();
        expect(unlinked.styleLinkPropertiesId).toBe(null);
        expect(unlinked.width).toBeLessThan(linked.width);

        // restore the edge
        const oldState2 = world.getState(),
            draft2 = oldState2.getDraft(),
            edge = draft2
                .get("activeState")
                .get("typeSpec")
                .get("markStyleLinks")
                .get("strong");
        edge.get("mode").value = "link";
        edge.get("stylePatch").value = "bold";
        const newState2 = draft2.metamorphose();
        world.setState(newState2);
        world.root.update(new StateComparison(oldState2, newState2));
        const relinked = leafMeasure();
        expect(relinked.styleLinkPropertiesId).toContain(
            "/markStyleLinks/strong",
        );
        expect(relinked.width).toBeCloseTo(linked.width, 5);
    });

    // The exclusivity guard: marks are style-exclusive by contract
    // (styleLinkProperties@ is the full story). A run resolving to
    // MORE THAN ONE style link fires console.error and the innermost
    // link wins — the guard is deliberately simple.
    it("per-run styles: >1 style link on a run fires the exclusivity guard (innermost wins)", () => {
        const leafPath = (() => {
                const find = (node, path) => {
                    for (const [index, child] of node
                        .get("content")
                        .value.entries()) {
                        const childPath = path.append("content", index);
                        if (child.get("typeKey").value === "text") {
                            const text = child.get("text");
                            if (!text.isEmpty && text.value === "legible")
                                return childPath;
                        }
                        const content = child.get("content");
                        if (content !== undefined && content.value.length > 0) {
                            const found = find(child, childPath);
                            if (found !== null) return found;
                        }
                    }
                    return null;
                };
                return find(
                    world.getState().get("activeState").get("document"),
                    Path.fromString("/activeState/document"),
                );
            })(),
            // give the "legible" run a SECOND style-linked mark
            // ("link" after "strong" = innermost — the wikipedia
            // schema has exactly these two mark types) and link the
            // "link" mark to a patch
            oldState = world.getState(),
            draft = oldState.getDraft(),
            textNode = getEntry(draft, leafPath),
            marks = textNode.get("marks"),
            linkMark = marks.constructor.Model.createPrimalDraft(
                marks.dependencies,
            );
        linkMark.get("typeKey").value = "link";
        marks.push(linkMark);
        const links = draft
                .get("activeState")
                .get("typeSpec")
                .get("markStyleLinks"),
            linkEdge = links.constructor.Model.createPrimalDraft(
                links.dependencies,
            );
        linkEdge.get("mode").value = "link";
        linkEdge.get("stylePatch").value = "link";
        links.set("link", linkEdge);

        const errorSpy = [];
        const originalError = console.error;
        console.error = (...args) => {
            errorSpy.push(args.join(" "));
        };
        let newState;
        try {
            newState = draft.metamorphose();
            world.setState(newState);
            world.root.update(new StateComparison(oldState, newState));
        } finally {
            console.error = originalError;
        }

        // the guard fired (the big contract issue is loud) ...
        expect(errorSpy.some((msg) => msg.includes("CONTRACT VIOLATION"))).toBe(
            true,
        );
        // ... and the innermost link ("link" was pushed last) won
        const blocks =
                queryArticle(world).querySelectorAll(".typeroof-composed"),
            ids = [];
        for (const block of blocks) {
            const payload = compositionHandler.getRegistered(
                `composition@${block.style.getPropertyValue("--node-anchor-name").split("@").at(-1).replaceAll("\\", "")}`,
            );
            for (const leaf of payload.leaves)
                if (leaf.path === leafPath.toString())
                    ids.push(leaf.styleLinkPropertiesId);
        }
        expect(ids).toHaveLength(1);
        expect(ids[0]).toContain("/markStyleLinks/link");

        // restore: remove the "link" mark + edge, guard silent again
        const oldState2 = world.getState(),
            draft2 = oldState2.getDraft(),
            textNode2 = getEntry(draft2, leafPath);
        textNode2.get("marks").splice(1, 1);
        draft2
            .get("activeState")
            .get("typeSpec")
            .get("markStyleLinks")
            .delete("link");
        const newState2 = draft2.metamorphose();
        world.setState(newState2);
        world.root.update(new StateComparison(oldState2, newState2));
    });
});
