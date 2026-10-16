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
import { toMetaModelJSON } from "../../components/prosemirror/models.typeroof.jsx";
import { JSDOM } from "jsdom";

let buildWorld, WIKIPEDIA_DEFAULT_STATE;

// Text-composition structure tests (Sprint B): assert composed line
// structure FROM DOCUMENT INPUTS — payload level (composition@
// registry) and DOM level (line spans in the viewer article).
// Behavior-level: no viewer/controller internals referenced.

const __dirname = dirname(fileURLToPath(import.meta.url)),
    CONTROLLED_MEASURE_FIXTURE = JSON.parse(
        readFileSync(
            join(__dirname, "../fixtures/composition-measure.json"),
            "utf8",
        ),
    ),
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
        // the potentials discovery matches on font.name (the family
        // prefix, like VideoProofFont.name)
        name: "Roboto Flex",
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

// walk the document model for a text leaf whose whole text is
// `probe`; returns its Path (or null)
const findLeafPathInDocument = (rootState, probe) => {
        const find = (node, path) => {
            for (const [index, child] of node.get("content").value.entries()) {
                const childPath = path.append("content", index);
                if (child.get("typeKey").value === "text") {
                    const text = child.get("text");
                    if (!text.isEmpty && text.value === probe) return childPath;
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
            rootState.get("activeState").get("document"),
            Path.fromString("/activeState/document"),
        );
    },
    // the composition payload carrying a leaf + the leaf's total
    // measured width (sum over its segments; hyphen splits included)
    leafMeasureOf = (world, compositionHandler, leafPath) => {
        const blocks =
            queryArticle(world).querySelectorAll(".typeroof-composed");
        for (const block of blocks) {
            const anchor = block.style.getPropertyValue("--node-anchor-name"),
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
                payload,
                width,
                styleLinkPropertiesId:
                    payload.leaves[leafIndex].styleLinkPropertiesId,
            };
        }
        throw new Error("no composition payload for the probe leaf");
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
            "getComputedStyle",
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
        ({ buildWorld, WIKIPEDIA_DEFAULT_STATE } = await import(
            "../type-stage-toggles/harness.mjs"
        ));
        const controlledState = structuredClone(WIKIPEDIA_DEFAULT_STATE),
            paragraphs = controlledState.typeSpec.children.find(
                ([name]) => name === "paragraphs",
            )[1];
        // This suite covers VIEWER composition; pin the editor
        // applicator off so the app-level default (on since 67f3ce9f)
        // can't change what these tests exercise.
        controlledState.composeInEditor = "0";
        paragraphs.horizontalLayout =
            CONTROLLED_MEASURE_FIXTURE.paragraphHorizontalLayout;
        world = await buildWorld({
            defaultState: controlledState,
            harfbuzz,
            fontValue: loadRealFontValue(),
            // Existing Host integration assertions are synchronous;
            // task-runner boundary behavior has a dedicated pure suite.
            compositionTaskScheduler: (resume) => resume(),
            // 1600 CSS px = 1200pt at the CSS 96dpi/pt conversion.
            environment: CONTROLLED_MEASURE_FIXTURE.layoutPx,
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

    it("editor-only drops every composition result and viewer demand restores it", () => {
        const toMode = (mode) => {
                const oldState = world.getState(),
                    draft = oldState.getDraft();
                draft.get("activeState").get("documentRendererMode").value =
                    mode;
                const newState = draft.metamorphose();
                world.setState(newState);
                world.root.update(new StateComparison(oldState, newState));
            },
            registeredCount = () => [...compositionHandler].length;

        expect(registeredCount()).toBeGreaterThan(0);
        toMode("editor");
        expect(registeredCount()).toBe(0);

        const oldState = world.getState(),
            draft = oldState.getDraft(),
            firstText = draft
                .get("activeState")
                .get("document")
                .get("content")
                .get(0)
                .get("content")
                .get(0)
                .get("text");
        firstText.value = "editor-only demand gate probe";
        const newState = draft.metamorphose();
        world.setState(newState);
        world.root.update(new StateComparison(oldState, newState));
        expect(registeredCount()).toBe(0);

        toMode("viewer");
        expect(registeredCount()).toBeGreaterThan(0);
        toMode("compare");
    }, 30_000);

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
            expect(payload.sources.leafTexts).toHaveLength(
                payload.leaves.length,
            );
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

    it("uses the local column width as the composition measure", () => {
        const block = queryArticle(world).querySelector(
                '[data-node-type="paragraph"].typeroof-composed',
            ),
            anchor = block.style
                .getPropertyValue("--node-anchor-name")
                .split("@")
                .at(-1)
                .replaceAll("\\", ""),
            payload = compositionHandler.getRegistered(`composition@${anchor}`),
            controller = world.root.getWidgetById("typeStageController"),
            nodePropertiesHandler =
                controller.widgetBus.wrapper.getProtocolHandlerImplementation(
                    "nodeProperties@",
                ),
            properties = nodePropertiesHandler
                .getRegistered(`nodeProperties@${anchor}`)
                .nodeProperties.getProperties();
        expect(payload.lineWidthPt).toBe(
            Number(
                CONTROLLED_MEASURE_FIXTURE.paragraphHorizontalLayout.instance
                    .lineLength.value,
            ),
        );
        expect(properties.get("layout/columnWidth")).toBe(payload.lineWidthPt);
        expect(properties.get("layout/availableWidth")).toBe(
            CONTROLLED_MEASURE_FIXTURE.parentWidthPt,
        );
        expect(block.style.width).toBe(`${payload.lineWidthPt}pt`);
        for (const block of queryArticle(world).querySelectorAll(
            ".typeroof-composed",
        )) {
            const cssColumnWidth = Number.parseFloat(
                block.style.getPropertyValue("column-width"),
            );
            if (!Number.isFinite(cssColumnWidth)) continue;
            const blockAnchor = block.style
                    .getPropertyValue("--node-anchor-name")
                    .split("@")
                    .at(-1)
                    .replaceAll("\\", ""),
                blockPayload = compositionHandler.getRegistered(
                    `composition@${blockAnchor}`,
                );
            expect(blockPayload.lineWidthPt).toBeCloseTo(cssColumnWidth);
        }

        console.log(
            "BREAKS-GF",
            JSON.stringify(
                payload.paragraphs[0].result.lines.map((line) => [
                    line.fromSegment,
                    line.toSegment,
                ]),
            ),
        );
        expect(
            payload.paragraphs[0].result.lines.map((line) => [
                line.fromSegment,
                line.toSegment,
            ]),
        // whitespace runs are CSS-collapsed (segmenter + measurement
        // parity, operator QA 2026-10-16): the fixture's pretty-
        // printed HTML ingests ~13-space runs that previously
        // measured 13 space glyphs while CSS renders one — the old
        // tables encoded the inflated measurements.
        ).toEqual([
            [0, 15],
            [15, 29],
            [29, 43],
            [43, 56],
            [56, 67],
            [67, 80],
            [80, 89],
        ]);

        const oldState = world.getState(),
            draft = oldState.getDraft(),
            valuePath = Path.fromString(
                "/activeState/typeSpec/children/paragraphs/horizontalLayout/instance/lineLength/value",
            );
        getEntry(draft, valuePath).value =
            CONTROLLED_MEASURE_FIXTURE.narrowLineLengthPt;
        const newState = draft.metamorphose();
        world.setState(newState);
        world.root.update(new StateComparison(oldState, newState));

        const narrowerPayload = compositionHandler.getRegistered(
            `composition@${anchor}`,
        );
        expect(narrowerPayload.lineWidthPt).toBe(220);
        expect(
            narrowerPayload.paragraphs[0].result.lines.map((line) => [
                line.fromSegment,
                line.toSegment,
            ]),
        // whitespace-run collapsing (see the first table in this test)
        ).toEqual([
            [0, 14],
            [14, 25],
            [25, 35],
            [35, 46],
            [46, 54],
            [54, 64],
            [64, 74],
            [74, 82],
            [82, 89],
        ]);
    });

    it("counts an fi ligature as one tracking glyph in the Host payload", () => {
        const oldState = world.getState(),
            originalText = oldState
                .get("activeState")
                .get("document")
                .get("content")
                .get(1)
                .get("content")
                .get(0)
                .get("text").value,
            draft = oldState.getDraft(),
            firstText = draft
                .get("activeState")
                .get("document")
                .get("content")
                .get(1)
                .get("content")
                .get(0);
        firstText.get("text").value = "fi";
        const newState = draft.metamorphose();
        world.setState(newState);
        world.root.update(new StateComparison(oldState, newState));

        const block = queryArticle(world).querySelector(
                '[data-node-type="paragraph"].typeroof-composed',
            ),
            anchor = block.style
                .getPropertyValue("--node-anchor-name")
                .split("@")
                .at(-1)
                .replaceAll("\\", ""),
            payload = compositionHandler.getRegistered(`composition@${anchor}`),
            segment = payload.paragraphs[0].segments.find(
                ({ sourceIndex }) => sourceIndex === 0,
            );
        expect(segment.glyphCount).toBe(1);

        const restoreDraft = newState.getDraft();
        restoreDraft
            .get("activeState")
            .get("document")
            .get("content")
            .get(1)
            .get("content")
            .get(0)
            .get("text").value = originalText;
        const restoredState = restoreDraft.metamorphose();
        world.setState(restoredState);
        world.root.update(new StateComparison(newState, restoredState));
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
    // style. The fixture marks "legible" as <b> -> the intent "bold"
    // (the funnel carries the b tag) -> the "bold" patch (wght 700)
    // via the root typeSpec's intentStyleLinks; unlinking the edge
    // must measurably change the run's widths (wght 700 vs the
    // textblock's default).
    it("per-run styles: a styled run is measured at its resolved style", () => {
        const leafPath = findLeafPathInDocument(world.getState(), "legible");
        expect(leafPath).not.toBe(null);

        const linked = leafMeasureOf(world, compositionHandler, leafPath);
        // per-run resolution engaged: the exclusive style link id
        expect(linked.styleLinkPropertiesId).toContain(
            "/intentStyleLinks/bold",
        );

        // unlink the edge (tombstone): the run falls back to the
        // textblock style and must measure NARROWER (wght 700 -> 400)
        const oldState = world.getState(),
            draft = oldState.getDraft();
        draft
            .get("activeState")
            .get("typeSpec")
            .get("intentStyleLinks")
            .get("bold")
            .get("mode").value = "unlinked";
        const newState = draft.metamorphose();
        world.setState(newState);
        world.root.update(new StateComparison(oldState, newState));

        const unlinked = leafMeasureOf(world, compositionHandler, leafPath);
        expect(unlinked.styleLinkPropertiesId).toBe(null);
        expect(unlinked.width).toBeLessThan(linked.width);

        // restore the edge
        const oldState2 = world.getState(),
            draft2 = oldState2.getDraft(),
            edge = draft2
                .get("activeState")
                .get("typeSpec")
                .get("intentStyleLinks")
                .get("bold");
        edge.get("mode").value = "link";
        edge.get("stylePatch").value = "bold";
        const newState2 = draft2.metamorphose();
        world.setState(newState2);
        world.root.update(new StateComparison(oldState2, newState2));
        const relinked = leafMeasureOf(world, compositionHandler, leafPath);
        expect(relinked.styleLinkPropertiesId).toContain(
            "/intentStyleLinks/bold",
        );
        expect(relinked.width).toBeCloseTo(linked.width, 5);
    });

    // The merge-channel em basis (approach (a) phase 2): a patch's
    // relativeFontSize unit 'em' composes against the CONTAINING
    // context's effective size — the origin typeSpec's outbound
    // generic/fontSize — NOT the root base. The merged style-link
    // scope is what measurement reads (composition-controller.ts:
    // the leaf's styleLinkProperties@ payload). The fixture: the
    // "legible" bold run lives in t1 (relativeFontSize 1.285714286
    // on root base 14 → containing effective 18pt): baseEm 2 → 28pt,
    // em 2 → 36pt.
    it("per-run styles: patch unit 'em' composes against the containing context (merge channel)", () => {
        const leafPath = findLeafPathInDocument(world.getState(), "legible");
        expect(leafPath).not.toBe(null);
        const setPatchRelativeFontSize = (value, unit) => {
                const oldState = world.getState(),
                    draft = oldState.getDraft(),
                    pairBasePath = `/activeState/stylePatchesSource/bold/instance/relativeFontSize`;
                getEntry(
                    draft,
                    Path.fromString(`${pairBasePath}/value`),
                ).value = value;
                getEntry(draft, Path.fromString(`${pairBasePath}/unit`)).value =
                    unit;
                const newState = draft.metamorphose();
                world.setState(newState);
                world.root.update(new StateComparison(oldState, newState));
            },
            // the merged style-link scope's resolved font size — the
            // same payload the composition controller measures at
            // (the styleLinkProperties@ protocol, not composition@)
            mergedFontSizeOf = () => {
                const measure = leafMeasureOf(
                    world,
                    compositionHandler,
                    leafPath,
                );
                expect(measure.styleLinkPropertiesId).toContain(
                    "/intentStyleLinks/bold",
                );
                const styleLinkHandler = world.root
                    .getWidgetById("typeStageController")
                    .widgetBus.wrapper.getProtocolHandlerImplementation(
                        "styleLinkProperties@",
                    );
                const payload = styleLinkHandler.getRegistered(
                    measure.styleLinkPropertiesId,
                );
                return payload.typeSpecnion
                    .getProperties()
                    .get("generic/fontSize");
            };

        // the containing context: the bold patch carries no
        // relativeFontSize, so the merged scope resolves the ORIGIN
        // (t1) chain — its own effective size
        const containingFontSize = mergedFontSizeOf();
        // the test's precondition: t1 re-composes its context size
        // (root base 14 × 1.285714286), so em ≠ baseEm is observable
        expect(containingFontSize).toBeCloseTo(18, 5);

        // baseEm (the migration default): factor on the ROOT base
        setPatchRelativeFontSize(2, "baseEm");
        expect(mergedFontSizeOf()).toBeCloseTo(28, 5);

        // em: factor on the containing context's effective size
        setPatchRelativeFontSize(2, "em");
        expect(mergedFontSizeOf()).toBeCloseTo(containingFontSize * 2, 5);
        expect(mergedFontSizeOf()).toBeCloseTo(36, 5);

        // restore: clear the pair (both fields — the coherent unset)
        {
            const oldState = world.getState(),
                draft = oldState.getDraft(),
                pairBasePath = `/activeState/stylePatchesSource/bold/instance/relativeFontSize`;
            for (const part of ["value", "unit"])
                getEntry(
                    draft,
                    Path.fromString(`${pairBasePath}/${part}`),
                ).clear();
            const newState = draft.metamorphose();
            world.setState(newState);
            world.root.update(new StateComparison(oldState, newState));
        }
        expect(mergedFontSizeOf()).toBeCloseTo(containingFontSize, 5);
    });

    // The exclusivity guard: marks are style-exclusive by contract
    // (styleLinkProperties@ is the full story). A run resolving to
    // MORE THAN ONE style link fires console.error and the innermost
    // link wins — the guard is deliberately simple.
    it("per-run styles: >1 style link on a run fires the exclusivity guard (innermost wins)", () => {
        const leafPath = findLeafPathInDocument(world.getState(), "legible"),
            // give the "legible" run a SECOND style-linked intent
            // ("italic" after "bold" = innermost — the document model
            // holds raw mark lists, so what PM's addToSet would
            // normalize stays visible here; the guard watches the
            // contract)
            oldState = world.getState(),
            draft = oldState.getDraft(),
            textNode = getEntry(draft, leafPath),
            marks = textNode.get("marks"),
            italicMark = marks.constructor.Model.createPrimalDraft(
                marks.dependencies,
            );
        italicMark.get("typeKey").value = "generic-style";
        italicMark
            .get("attrs")
            .set("data-style-name", toMetaModelJSON("italic", {}));
        marks.push(italicMark);

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
        expect(ids[0]).toContain("/intentStyleLinks/italic");

        // restore: remove the second intent, guard silent again
        const oldState2 = world.getState(),
            draft2 = oldState2.getDraft(),
            textNode2 = getEntry(draft2, leafPath);
        textNode2.get("marks").splice(1, 1);
        const newState2 = draft2.metamorphose();
        world.setState(newState2);
        world.root.update(new StateComparison(oldState2, newState2));

        // Structure marks with EMPTY-patch markStyleLinks edges (the
        // state declares tag-* with "" — management-surface entries)
        // contribute NO style: adding a tag-em mark to the run must
        // neither fire the guard nor displace the intent's resolution.
        // A non-empty patch on such an edge WOULD fire the guard —
        // two style-resolving marks — the contract holds.
        {
            const oldState3 = world.getState(),
                draft3 = oldState3.getDraft(),
                textNode3 = getEntry(draft3, leafPath),
                marks3 = textNode3.get("marks"),
                emMark = marks3.constructor.Model.createPrimalDraft(
                    marks3.dependencies,
                );
            emMark.get("typeKey").value = "tag-em";
            marks3.push(emMark);
            const errorSpy3 = [];
            const originalError3 = console.error;
            console.error = (...args) => {
                errorSpy3.push(args.join(" "));
            };
            let newState3;
            try {
                newState3 = draft3.metamorphose();
                world.setState(newState3);
                world.root.update(new StateComparison(oldState3, newState3));
            } finally {
                console.error = originalError3;
            }
            expect(
                errorSpy3.some((msg) => msg.includes("CONTRACT VIOLATION")),
            ).toBe(false);
            const blocks3 =
                    queryArticle(world).querySelectorAll(".typeroof-composed"),
                ids3 = [];
            for (const block of blocks3) {
                const payload = compositionHandler.getRegistered(
                    `composition@${block.style.getPropertyValue("--node-anchor-name").split("@").at(-1).replaceAll("\\", "")}`,
                );
                for (const leaf of payload.leaves)
                    if (leaf.path === leafPath.toString())
                        ids3.push(leaf.styleLinkPropertiesId);
            }
            expect(ids3).toHaveLength(1);
            expect(ids3[0]).toContain("/intentStyleLinks/bold");
            // restore
            const oldState4 = world.getState(),
                draft4 = oldState4.getDraft(),
                textNode4 = getEntry(draft4, leafPath);
            textNode4.get("marks").splice(1, 1);
            const newState4 = draft4.metamorphose();
            world.setState(newState4);
            world.root.update(new StateComparison(oldState4, newState4));
        }
    });

    // Invalidation on patch-CONTENT edits: the meta cascade drives
    // composition on EVERY state change (hook (a), the element's
    // update is not pruned), and the per-leaf style values in the
    // input-equality ingredients detect the change — a patch edit
    // recomposes its consumers. A patch with NO resolved consumer
    // (the "link" patch — no markStyleLinks edge) must recompose
    // nothing. (This guards the REQUIREMENT; the phase-2 plan's
    // subscription mechanism turned out redundant — the drive was
    // already unconditional, the ingredients do the filtering.)
    it("per-run styles: patch-content edits recompose (unused patches don't)", () => {
        const setPatchRelativeFontSize = (patchKey, value) => {
                const oldState = world.getState(),
                    draft = oldState.getDraft(),
                    // via the path (draft containers don't yield
                    // child drafts on .get chains); the dynamic
                    // struct's instance proxies the wrapped struct's
                    // fields, so it is path-addressable. Pair form
                    // (type-spec/models.mjs
                    // RelativeFontSizeValueModel): value AND unit —
                    // the pair coherence clears a unit-less value;
                    // 'baseEm' is the migration default unit (a
                    // factor on the base, today's scalar semantics).
                    pairBasePath = `/activeState/stylePatchesSource/${patchKey}/instance/relativeFontSize`;
                getEntry(
                    draft,
                    Path.fromString(`${pairBasePath}/value`),
                ).value = value;
                getEntry(draft, Path.fromString(`${pairBasePath}/unit`)).value =
                    "baseEm";
                const newState = draft.metamorphose();
                world.setState(newState);
                world.root.update(new StateComparison(oldState, newState));
            },
            strongLeaf = findLeafPathInDocument(world.getState(), "legible"),
            // <i> ingests as the generic-style intent "italic"
            italicLeaf = findLeafPathInDocument(
                world.getState(),
                "art and technique",
            ),
            beforeStrong = leafMeasureOf(world, compositionHandler, strongLeaf),
            beforeItalic = leafMeasureOf(world, compositionHandler, italicLeaf);

        // the USED patch ("bold" via "strong"): relativeFontSize 2
        // -> republish + the new style landed in the measurement
        // (the exact factor is NOT 2: autoOPSZ tracks the doubled
        // font size, and opsz changes per-em advances — correct
        // behavior, hence a conservative factor here)
        setPatchRelativeFontSize("bold", 2);
        const afterStrong = leafMeasureOf(
            world,
            compositionHandler,
            strongLeaf,
        );
        expect(afterStrong.payload).not.toBe(beforeStrong.payload);
        expect(afterStrong.width).toBeGreaterThan(beforeStrong.width * 1.3);

        // the intent-linked patch ("italic" via <i> runs) recomposes
        // its consumers too
        setPatchRelativeFontSize("italic", 2);
        const afterItalic = leafMeasureOf(
            world,
            compositionHandler,
            italicLeaf,
        );
        expect(afterItalic.payload).not.toBe(beforeItalic.payload);
        expect(afterItalic.width).toBeGreaterThan(beforeItalic.width * 1.3);

        // a patch with NO resolved consumer recomposes nothing:
        // tombstone the "link" intent edge first (its runs fall back
        // to the textblock style, the "link" patch loses every
        // consumer — CompositeStylePatches can't take a font-size
        // edit, so the un-link is the consumer-killer), then the
        // content edit must leave the payload identity stable
        const setLinkEdgeMode = (mode) => {
            const oldStateU = world.getState(),
                draftU = oldStateU.getDraft();
            draftU
                .get("activeState")
                .get("typeSpec")
                .get("intentStyleLinks")
                .get("link")
                .get("mode").value = mode;
            const newStateU = draftU.metamorphose();
            world.setState(newStateU);
            world.root.update(new StateComparison(oldStateU, newStateU));
        };
        setLinkEdgeMode("unlinked");
        const beforeUnused = leafMeasureOf(
            world,
            compositionHandler,
            strongLeaf,
        );
        setPatchRelativeFontSize("link", 2);
        expect(
            leafMeasureOf(world, compositionHandler, strongLeaf).payload,
        ).toBe(beforeUnused.payload);

        // restore (clear = unset; NOTE: an EXPLICIT relativeFontSize
        // 1 is not the same as unset — an explicit pair re-resolves
        // generic/fontSize locally: baseEm factors onto the ORIGIN's
        // base (root 14 -> 14pt), while unset inherits the origin's
        // resolved font size (18pt in the t1 chain). Patches have NO
        // baseFontSize field (leafs — operator 2026-10-12); composition
        // follows rendering, both read the same resolved map.)
        const clearPatchRelativeFontSize = (patchKey) => {
            const oldState = world.getState(),
                draft = oldState.getDraft(),
                // pair form: clear BOTH fields (both-empty is the
                // coherent unset pair)
                pairBasePath = `/activeState/stylePatchesSource/${patchKey}/instance/relativeFontSize`;
            getEntry(draft, Path.fromString(`${pairBasePath}/value`)).clear();
            getEntry(draft, Path.fromString(`${pairBasePath}/unit`)).clear();
            const newState = draft.metamorphose();
            world.setState(newState);
            world.root.update(new StateComparison(oldState, newState));
        };
        clearPatchRelativeFontSize("link");
        setLinkEdgeMode("link");
        clearPatchRelativeFontSize("italic");
        clearPatchRelativeFontSize("bold");
        expect(
            leafMeasureOf(world, compositionHandler, strongLeaf).width,
        ).toBeCloseTo(beforeStrong.width, 5);
    });

    // E2E (phase 3), the operator's case: wdth=max on the "bold"
    // style must move the run's MEASURED width and agree with the
    // CSS the viewer applies — measured = rendered. (The harness's
    // fixed, tiny measure packs ~one word per line regardless of
    // font size, so break MOVEMENT isn't assertable here — that was
    // verified visually in the viewer.)
    it("per-run styles e2e: wdth max re-measures and matches the rendered CSS", () => {
        const strongLeaf = findLeafPathInDocument(world.getState(), "legible"),
            widthBefore = leafMeasureOf(
                world,
                compositionHandler,
                strongLeaf,
            ).width;

        // wdth -> max on the "bold" patch (symbolic, resolved against
        // the font: 151 for Roboto Flex)
        const oldState = world.getState(),
            draft = oldState.getDraft(),
            axesLocations = getEntry(
                draft,
                Path.fromString(
                    "/activeState/stylePatchesSource/bold/instance/axesLocations",
                ),
            ),
            wdth = axesLocations.constructor.Model.createPrimalDraft(
                axesLocations.dependencies,
            );
        wdth.get("logicalValue").value = "max";
        axesLocations.set("wdth", wdth);
        const newState = draft.metamorphose();
        world.setState(newState);
        world.root.update(new StateComparison(oldState, newState));

        // measured wider (wdth 100 -> 151, same font size; the wdth
        // axis is NOT linear on advance widths — ~+12% for these
        // glyphs — the CSS agreement below is the strong assertion)
        // ...
        expect(
            leafMeasureOf(world, compositionHandler, strongLeaf).width,
        ).toBeGreaterThan(widthBefore * 1.05);
        // (No overfull assertion: the harness's fixed, tiny measure
        // makes most lines overfull by construction — overfull
        // correctness was verified visually in the viewer, where the
        // measure is real.)
        // the render side applies the same style: the mark wrapper's
        // CSS carries wdth 151 (measured == rendered)
        const wrapper = queryArticle(world).querySelector(
            '[data-style-name="bold"]',
        );
        expect(wrapper).not.toBe(null);
        expect(
            wrapper.style.getPropertyValue("font-variation-settings"),
        ).toContain('"wdth" 151');

        // restore
        const oldState2 = world.getState(),
            draft2 = oldState2.getDraft();
        getEntry(
            draft2,
            Path.fromString(
                "/activeState/stylePatchesSource/bold/instance/axesLocations",
            ),
        ).delete("wdth");
        const newState2 = draft2.metamorphose();
        world.setState(newState2);
        world.root.update(new StateComparison(oldState2, newState2));
        expect(
            leafMeasureOf(world, compositionHandler, strongLeaf).width,
        ).toBeCloseTo(widthBefore, 5);
    });

    // Greedy-fit (milestone 4): lines carry adjustment steps, the
    // treatments render (measured == rendered), and the colorCoding
    // switch gates the color-coded lines.
    it("greedy-fit: lines adjust, treatments render, the colorCoding switch works", () => {
        const allLines = () => {
                const blocks =
                        queryArticle(world).querySelectorAll(
                            ".typeroof-composed",
                        ),
                    lines = [];
                for (const block of blocks) {
                    const payload = compositionHandler.getRegistered(
                        `composition@${block.style.getPropertyValue("--node-anchor-name").split("@").at(-1).replaceAll("\\", "")}`,
                    );
                    for (const { result } of payload.paragraphs)
                        lines.push(...result.lines);
                }
                return lines;
            },
            treatedSpans = () =>
                [
                    ...queryArticle(world).querySelectorAll(
                        ".typeroof-composition-line",
                    ),
                ].filter(
                    (span) =>
                        span.style.getPropertyValue("--line-letter-spacing") !==
                            "" ||
                        span.style.getPropertyValue("--line-word-spacing") !==
                            "" ||
                        span.style.getPropertyValue(
                            "font-variation-settings",
                        ) !== "",
                ),
            coloredSpans = () =>
                [
                    ...queryArticle(world).querySelectorAll(
                        ".typeroof-composition-line",
                    ),
                ].filter(
                    (span) =>
                        span.style.getPropertyValue("--line-color-code") !== "",
                );

        // select greedy-fit on the root typeSpec
        const oldState = world.getState(),
            draft = oldState.getDraft();
        // Restore the controlled fixture's 280pt measure after the
        // preceding break-movement assertion narrowed it to 220pt.
        getEntry(
            draft,
            Path.fromString(
                "/activeState/typeSpec/children/paragraphs/horizontalLayout/instance/lineLength/value",
            ),
        ).value = 280;
        draft
            .get("activeState")
            .get("typeSpec")
            .get("textCompositionAlgorithm")
            .get("textCompositionAlgorithmTypeKey").value =
            "TextCompositionAlgorithmGreedyFitModel";
        const newState = draft.metamorphose();
        world.setState(newState);
        world.root.update(new StateComparison(oldState, newState));

        // lines carry adjustment steps (the harness's narrow measure
        // underfills lines -> widening), the treatments render, and
        // colorCoding defaults ON
        const adjustedLines = allLines().filter(
            (line) => line.adjustmentStep !== 0,
        );
        expect(adjustedLines.length).toBeGreaterThan(0);
        for (const line of adjustedLines) {
            const gapCount = Object.values(
                line.trackingGapsBySourceIndex,
            ).reduce((sum, count) => sum + count, 0);
            expect(gapCount).toBeGreaterThanOrEqual(0);
            expect(line.trackingWidthPt).toBeTypeOf("number");
        }
        expect(treatedSpans().length).toBeGreaterThan(0);
        expect(coloredSpans().length).toBeGreaterThan(0);

        // the switch: colorCoding off -> no color-coded lines (the
        // treatments keep applying)
        const oldState2 = world.getState(),
            draft2 = oldState2.getDraft();
        getEntry(
            draft2,
            Path.fromString(
                "/activeState/typeSpec/textCompositionAlgorithm/instance/colorCoding",
            ),
        ).value = false;
        const newState2 = draft2.metamorphose();
        world.setState(newState2);
        world.root.update(new StateComparison(oldState2, newState2));
        expect(coloredSpans()).toHaveLength(0);
        expect(treatedSpans().length).toBeGreaterThan(0);

        // restore (empty = inherit the default algorithm)
        const oldState3 = world.getState(),
            draft3 = oldState3.getDraft();
        draft3
            .get("activeState")
            .get("typeSpec")
            .get("textCompositionAlgorithm")
            .get("textCompositionAlgorithmTypeKey").value = ForeignKey.NULL;
        const newState3 = draft3.metamorphose();
        world.setState(newState3);
        world.root.update(new StateComparison(oldState3, newState3));
        expect(allLines().every((line) => line.adjustmentStep === 0)).toBe(
            true,
        );
    });

    // NOTE the extended timeout: the Phase 4 mode/dev-flag
    // switching adds several full recomposition rounds.
    it("knuth-plass: composes all blocks; re-measure, hyphenation and config switches change results", () => {
        const composedParagraphs = () => {
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
            spansOf = (paragraphs) =>
                paragraphs.flatMap(({ result }) =>
                    result.lines.map((line) => [
                        line.fromSegment,
                        line.toSegment,
                    ]),
                ),
            stepsOf = (paragraphs) =>
                paragraphs.flatMap(({ result }) =>
                    result.lines.map((line) => line.adjustmentStep),
                ),
            mutateTypeSpec = (mutate) => {
                const oldState = world.getState(),
                    draft = oldState.getDraft();
                mutate(draft);
                const newState = draft.metamorphose();
                world.setState(newState);
                world.root.update(new StateComparison(oldState, newState));
            },
            measurePath =
                "/activeState/typeSpec/children/paragraphs/horizontalLayout/instance/lineLength/value",
            kpInstancePath =
                "/activeState/typeSpec/textCompositionAlgorithm/instance";

        // select Knuth-Plass on the root typeSpec (the preceding
        // greedy-fit test restored the 280pt measure)
        mutateTypeSpec((draft) => {
            draft
                .get("activeState")
                .get("typeSpec")
                .get("textCompositionAlgorithm")
                .get("textCompositionAlgorithmTypeKey").value =
                "TextCompositionAlgorithmKnuthPlassModel";
        });

        // all blocks compose; the KP diagnostics payloads are present
        const paragraphs = composedParagraphs();
        expect(paragraphs.length).toBeGreaterThan(0);
        for (const { result } of paragraphs) {
            expect(result.lines.length).toBeGreaterThan(0);
            expect(result.diagnostics.overfullLines).toEqual([]);
            expect(result.diagnostics.exhaustedLines ?? []).toEqual([]);
            expect(result.diagnostics.totalDemerits).toBeLessThan(1e18);
            expect(result.diagnostics.fitnessClasses).toHaveLength(
                result.lines.length,
            );
            for (const fitnessClass of result.diagnostics.fitnessClasses)
                expect(["tight", "decent", "loose", "veryLoose"]).toContain(
                    fitnessClass,
                );
        }
        // the underfilled 280pt measure: KP widens lines to fill
        // (TeX fill semantics) — some line carries a widening step
        expect(stepsOf(paragraphs).some((step) => step > 0)).toBe(true);
        // Phase 4: the payload publishes the resolved color-coding
        // MODE; the KP default "kp" renders the KP palette (hue per
        // fitness class) — NOT the potentials cyan/red codes
        const firstPayload = () => {
                const block =
                        queryArticle(world).querySelector(".typeroof-composed"),
                    anchor = block.style.getPropertyValue("--node-anchor-name");
                return compositionHandler.getRegistered(
                    `composition@${anchor.split("@").at(-1).replaceAll("\\", "")}`,
                );
            },
            lineColorCodes = () =>
                [
                    ...queryArticle(world).querySelectorAll(
                        ".typeroof-composition-line",
                    ),
                ].map((span) =>
                    span.style.getPropertyValue("--line-color-code"),
                );
        expect(firstPayload().colorCoding).toBe("kp");
        expect(lineColorCodes().some((code) => code !== "")).toBe(true);
        const kpCodes = lineColorCodes();

        // exact breaks of the first real paragraph at the known
        // measure (pinned to the deterministic fixture) — the first
        // composed block is a heading, so select the first
        // [data-node-type="paragraph"] block like the measure test
        const firstParagraphBlock = queryArticle(world).querySelector(
                '[data-node-type="paragraph"].typeroof-composed',
            ),
            firstParagraphAnchor = firstParagraphBlock.style
                .getPropertyValue("--node-anchor-name")
                .split("@")
                .at(-1)
                .replaceAll("\\", ""),
            firstParagraph = compositionHandler.getRegistered(
                `composition@${firstParagraphAnchor}`,
            ).paragraphs[0];
        // KP fills the underfilled 280pt measure by widening: 8
        // fuller lines where greedy-ragged sets 9 (the
        // column-width test's [[0,26],[26,39],...] fixture)
        console.log(
            "BREAKS-KP",
            JSON.stringify(
                firstParagraph.result.lines.map((line) => [
                    line.fromSegment,
                    line.toSegment,
                ]),
            ),
        );
        expect(
            firstParagraph.result.lines.map((line) => [
                line.fromSegment,
                line.toSegment,
            ]),
        // whitespace-run collapsing (see the greedy-ragged table above)
        ).toEqual([
            [0, 15],
            [15, 29],
            [29, 43],
            [43, 56],
            [56, 67],
            [67, 80],
            [80, 89],
        ]);

        // exhaustedGapDemerits (Phases 4.5/4.6): badness saturates
        // at 100 at the widening limit, so without gap-proportional
        // demerits the DP parked a 176pt gap in one line at step +1
        // (natural 103.7pt of the 280pt measure) — the knob (gap
        // priced in EN of the computed font size, cubic growth)
        // makes such grossly underfull lines lose; assert none
        // remains
        for (const { result } of paragraphs)
            for (const line of result.lines)
                expect(
                    line.adjustmentStep >= 0.999 &&
                        line.naturalWidthPt < 0.5 * 280,
                ).toBe(false);

        // mode switching (Phase 4): "potentials" renders the legacy
        // cyan/red codes for the SAME lines (a different visual
        // vocabulary), "off" renders none; clearing restores the
        // default "kp"
        mutateTypeSpec((draft) => {
            getEntry(
                draft,
                Path.fromString(`${kpInstancePath}/colorCoding`),
            ).value = "potentials";
        });
        expect(firstPayload().colorCoding).toBe("potentials");
        const potentialsCodes = lineColorCodes();
        expect(potentialsCodes.some((code) => code !== "")).toBe(true);
        expect(potentialsCodes).not.toEqual(kpCodes);
        mutateTypeSpec((draft) => {
            getEntry(
                draft,
                Path.fromString(`${kpInstancePath}/colorCoding`),
            ).value = "off";
        });
        expect(firstPayload().colorCoding).toBe("off");
        expect(lineColorCodes().every((code) => code === "")).toBe(true);
        mutateTypeSpec((draft) => {
            getEntry(
                draft,
                Path.fromString(`${kpInstancePath}/colorCoding`),
            ).clear();
        });
        expect(firstPayload().colorCoding).toBe("kp");
        expect(lineColorCodes()).toEqual(kpCodes);

        // re-measure 280 -> 220: recomposes with moved breaks
        const wideSpans = spansOf(paragraphs);
        mutateTypeSpec((draft) => {
            getEntry(draft, Path.fromString(measurePath)).value = 220;
        });
        expect(spansOf(composedParagraphs())).not.toEqual(wideSpans);
        mutateTypeSpec((draft) => {
            getEntry(draft, Path.fromString(measurePath)).value = 280;
        });
        expect(spansOf(composedParagraphs())).toEqual(wideSpans);

        // dev diagnostics (a non-UI global, never serialized):
        // default off — the payloads above carried no records; with
        // the switch ON a recompose (triggered by a KP ingredient:
        // the polish toggle) retains rejected-candidate records +
        // scan stats in the published diagnostics
        expect(
            firstParagraph.result.diagnostics.rejectedCandidates,
        ).toBeUndefined();
        globalThis.__typeroofKPDevDiagnostics = true;
        try {
            mutateTypeSpec((draft) => {
                getEntry(
                    draft,
                    Path.fromString(`${kpInstancePath}/polish`),
                ).value = false;
            });
            const devParagraphs = composedParagraphs();
            for (const { result } of devParagraphs) {
                expect(result.diagnostics.rejectedCandidates).toBeDefined();
                expect(
                    result.diagnostics.scanStats.evaluatedEdges,
                ).toBeGreaterThan(0);
                for (const candidate of result.diagnostics.rejectedCandidates) {
                    expect(candidate.lineIndex).toBeLessThan(
                        result.lines.length,
                    );
                    expect(candidate.to).not.toBe(
                        result.lines[candidate.lineIndex].toSegment,
                    );
                }
            }
            // real alternatives exist on this fixture
            expect(
                devParagraphs.some(
                    ({ result }) =>
                        result.diagnostics.rejectedCandidates.length > 0,
                ),
            ).toBe(true);
        } finally {
            delete globalThis.__typeroofKPDevDiagnostics;
            mutateTypeSpec((draft) => {
                getEntry(
                    draft,
                    Path.fromString(`${kpInstancePath}/polish`),
                ).clear();
            });
        }
        // off again: no dev keys published
        expect(
            composedParagraphs()[0].result.diagnostics.rejectedCandidates,
        ).toBeUndefined();

        // hyphenation: at fontSize 40 on the fixed measure the DP
        // takes hyphen breaks; they carry the resolved KP
        // hyphenPenalty (default 50); the Host control turns them off
        mutateTypeSpec((draft) => {
            draft.get("activeState").get("typeSpec").get("baseFontSize").value =
                40;
        });
        const hyphenParagraphs = composedParagraphs();
        expect(
            hyphenParagraphs.some(({ segments }) =>
                segments.some((s) => s.hyphenAfter === true),
            ),
        ).toBe(true);
        const hyphenLines = hyphenParagraphs.flatMap(({ result }) =>
            result.lines.filter((line) => line.breakAt?.kind === "hyphen"),
        );
        expect(hyphenLines.length).toBeGreaterThan(0);
        for (const line of hyphenLines) expect(line.breakAt.penalty).toBe(50);
        mutateTypeSpec((draft) => {
            draft
                .get("activeState")
                .get("typeSpec")
                .get("hyphenation")
                .get("enabled").value = false;
        });
        expect(
            composedParagraphs().some(({ result }) =>
                result.lines.some((line) => line.breakAt?.kind === "hyphen"),
            ),
        ).toBe(false);
        mutateTypeSpec((draft) => {
            draft
                .get("activeState")
                .get("typeSpec")
                .get("hyphenation")
                .get("enabled")
                .clear();
            draft.get("activeState").get("typeSpec").get("baseFontSize").value =
                14;
        });

        // config switch: polish off -> the SAME breaks at lattice
        // steps (polish refines only the step within the lattice
        // cell, never the breaks)
        const polished = composedParagraphs();
        mutateTypeSpec((draft) => {
            getEntry(draft, Path.fromString(`${kpInstancePath}/polish`)).value =
                false;
        });
        const unpolished = composedParagraphs();
        expect(spansOf(unpolished)).toEqual(spansOf(polished));
        expect(stepsOf(unpolished)).not.toEqual(stepsOf(polished));
        mutateTypeSpec((draft) => {
            getEntry(
                draft,
                Path.fromString(`${kpInstancePath}/polish`),
            ).clear();
        });

        // config switch: exhaustedGapEnPercent — the EN gap unit as
        // % of EN (default 100). A giant unit (10000% = 100 EN)
        // prices all gaps at ~0, reproducing the knob-off behavior:
        // the DP parks the looseness again and the pre-4.5 stub
        // returns — pins both the resolution and the direction of
        // the percent knob.
        mutateTypeSpec((draft) => {
            getEntry(
                draft,
                Path.fromString(`${kpInstancePath}/exhaustedGapEnPercent`),
            ).value = 10000;
        });
        const wideUnit = composedParagraphs();
        expect(
            wideUnit.some(({ result }) =>
                result.lines.some(
                    (line) =>
                        line.adjustmentStep >= 0.999 &&
                        line.naturalWidthPt < 0.5 * 280,
                ),
            ),
        ).toBe(true);
        mutateTypeSpec((draft) => {
            getEntry(
                draft,
                Path.fromString(`${kpInstancePath}/exhaustedGapEnPercent`),
            ).clear();
        });
        expect(spansOf(composedParagraphs())).toEqual(spansOf(polished));

        // restore (empty = inherit the default algorithm)
        mutateTypeSpec((draft) => {
            draft
                .get("activeState")
                .get("typeSpec")
                .get("textCompositionAlgorithm")
                .get("textCompositionAlgorithmTypeKey").value = ForeignKey.NULL;
        });
        const restored = composedParagraphs();
        expect(
            restored.every(({ result }) =>
                result.lines.every((line) => line.adjustmentStep === 0),
            ),
        ).toBe(true);
    }, 60_000);
});

// Phase 5 e2e: the PRODUCTION scheduler (defaultTaskScheduler,
// setTimeout macrotasks — no injected sync drain) with KP on the
// Wikipedia state: lazy viewer reveal (demand-gated start in editor
// mode), then rapid consecutive edits must never leave a stale
// publication applied — after settle, the DOM shows the FINAL edit.
describe("text-composition async scheduling e2e (production scheduler)", () => {
    let world, compositionHandler;
    const waitFor = async (predicate, what, timeoutMs = 90_000) => {
            const t0 = Date.now();
            while (!predicate()) {
                if (Date.now() - t0 > timeoutMs)
                    throw new Error(`timeout waiting for ${what}`);
                await new Promise((resolve) => setTimeout(resolve, 25));
            }
        },
        registeredCount = () => [...compositionHandler].length,
        waitForStableCount = async () => {
            let last = -1,
                stable = 0;
            while (stable < 3) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                const count = registeredCount();
                if (count === last) stable++;
                else {
                    stable = 0;
                    last = count;
                }
            }
            return last;
        },
        mutate = (fn) => {
            const oldState = world.getState(),
                draft = oldState.getDraft();
            fn(draft);
            const newState = draft.metamorphose();
            world.setState(newState);
            world.root.update(new StateComparison(oldState, newState));
        };

    beforeAll(async () => {
        // self-sufficient setup (a `-t` filter can skip the first
        // describe's beforeAll): DOM globals + dynamic harness import
        if (buildWorld === undefined) {
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
                "getComputedStyle",
                "requestAnimationFrame",
                "cancelAnimationFrame",
            ])
                globalThis[key] =
                    key === "window"
                        ? dom.window
                        : key === "document"
                          ? dom.window.document
                          : dom.window[key];
            dom.window.ResizeObserver = globalThis.ResizeObserver;
            ({ buildWorld, WIKIPEDIA_DEFAULT_STATE } = await import(
                "../type-stage-toggles/harness.mjs"
            ));
        }
        // See the first describe: pin the editor applicator off (this
        // block must be self-sufficient for `-t` filtered runs).
        const controlledState = structuredClone(WIKIPEDIA_DEFAULT_STATE);
        controlledState.composeInEditor = "0";
        world = await buildWorld({
            defaultState: controlledState,
            harfbuzz,
            fontValue: loadRealFontValue(),
            // NO compositionTaskScheduler: the production default
            // (macrotask resume) — the async path
            environment: { width: 1600, height: 900 },
        });
        compositionHandler = world.root
            .getWidgetById("typeStageController")
            .widgetBus.wrapper.getProtocolHandlerImplementation("composition@");
    }, 300_000);

    it("lazy viewer reveal + rapid typing settle, no stale publications", async () => {
        // editor mode: zero composition demand
        mutate((draft) => {
            draft.get("activeState").get("documentRendererMode").value =
                "editor";
        });
        expect(registeredCount()).toBe(0);

        // select KP (empty instance = defaults; EN-cubic gap pricing)
        mutate((draft) => {
            getEntry(
                draft,
                Path.fromString(
                    "/activeState/typeSpec/textCompositionAlgorithm/textCompositionAlgorithmTypeKey",
                ),
            ).value = "TextCompositionAlgorithmKnuthPlassModel";
        });
        expect(registeredCount()).toBe(0);

        // viewer reveal: publications appear lazily, then settle
        mutate((draft) => {
            draft.get("activeState").get("documentRendererMode").value =
                "viewer";
        });
        await waitFor(() => registeredCount() > 0, "first publications");
        // the harness ingests the SMALL fixture
        // (fixtures/typography-small.html → a handful of blocks; the
        // 209-block Wikipedia state runs in the browser perf
        // harness) — stability, not the count, is the signal here
        const settledCount = await waitForStableCount();
        expect(settledCount).toBeGreaterThan(0);

        // two rapid consecutive edits of the first text leaf — the
        // intermediate value must never remain applied
        const leafPath = findLeafPathInDocument(
            world.getState(),
            (() => {
                // probe = current text of the first text leaf: walk
                // for the first text node and read it
                const findFirst = (node) => {
                    for (const child of node.get("content").value) {
                        if (child.get("typeKey").value === "text")
                            return child.get("text").value;
                        const content = child.get("content");
                        if (content !== undefined && content.value.length > 0) {
                            const found = findFirst(child);
                            if (found !== null) return found;
                        }
                    }
                    return null;
                };
                return findFirst(
                    world.getState().get("activeState").get("document"),
                );
            })(),
        );
        expect(leafPath).not.toBeNull();
        const setLeaf = (draft, value) =>
                (getEntry(
                    draft,
                    Path.fromString(`${leafPath.toString()}/text`),
                ).value = value),
            INTERMEDIATE = "ZZINTERMEDIATEZZ async reveal probe",
            FINAL = "ZZFINALZZ async reveal probe";
        mutate((draft) => setLeaf(draft, INTERMEDIATE));
        // no settle between the edits: stresses cancellation/staleness
        mutate((draft) => setLeaf(draft, FINAL));

        const blockTexts = () =>
            [...queryArticle(world).querySelectorAll(".typeroof-composed")].map(
                textblockText,
            );
        await waitFor(
            () => blockTexts().some((text) => text.includes("ZZFINALZZ")),
            "the final edit to be composed and applied",
        );
        // let any in-flight trailing task land, then re-check: no
        // stale intermediate publication may win late
        await waitForStableCount();
        const settled = blockTexts();
        expect(settled.some((text) => text.includes("ZZFINALZZ"))).toBe(true);
        expect(settled.some((text) => text.includes("ZZINTERMEDIATEZZ"))).toBe(
            false,
        );
    }, 120_000);
});

// approach (a) phase 6: the MEASURED side for content nested inside
// inline nodes. The controller threads the innermost applicable
// inlineNodesStyleLinks edge payload (CompositionSource.
// resolveInlineStyleLink — the same resolution the rendered inline
// stylers perform) down its inline recursion as the leaf style-link
// fallback BENEATH the mark resolution (explicit-everything: a
// payload-styled element writes its full set, so the innermost
// payload predicts the rendered style).
//
// The nested-chain fixture (htmlOverride — the default fixture has
// no nested inline nodes): a t1 paragraph with a direct "probe" run,
// and a references-list-like li-inline containing a generic-inline
// with an unmarked "probe" run and a marked one (<b> -> intent
// bold, the <b> -> intent fixture precedent).
describe("text-composition nested inline-node basis (approach (a) phase 6)", () => {
    const NESTED_FIXTURE_HTML = `<!doctype html>
<html>
    <head>
        <title>nested inline basis fixture</title>
    </head>
    <body>
        <p>probe</p>
        <ul>
            <li>
                lead <cite>probe</cite> <cite>mark <b>probe</b></cite> tail
            </li>
        </ul>
    </body>
</html>`;
    let world, compositionHandler;
    beforeAll(async () => {
        const controlledState = structuredClone(WIKIPEDIA_DEFAULT_STATE);
        controlledState.composeInEditor = "0";
        world = await buildWorld({
            defaultState: controlledState,
            harfbuzz,
            fontValue: loadRealFontValue(),
            compositionTaskScheduler: (resume) => resume(),
            environment: CONTROLLED_MEASURE_FIXTURE.layoutPx,
            htmlOverride: NESTED_FIXTURE_HTML,
        });
        compositionHandler = world.root
            .getWidgetById("typeStageController")
            .widgetBus.wrapper.getProtocolHandlerImplementation("composition@");
    }, 300_000);

    // walk the document model for EVERY text leaf whose whole text is
    // `probe` (walk order = document order: the p run first, then the
    // generic-inline run, then the run inside the <b>)
    const findProbeLeafPaths = (rootState) => {
        const found = [];
        const find = (node, path) => {
            for (const [index, child] of node.get("content").value.entries()) {
                const childPath = path.append("content", index);
                if (child.get("typeKey").value === "text") {
                    const text = child.get("text");
                    if (!text.isEmpty && text.value === "probe")
                        found.push(childPath);
                }
                const content = child.get("content");
                if (content !== undefined && content.value.length > 0)
                    find(child, childPath);
            }
            return null;
        };
        find(
            rootState.get("activeState").get("document"),
            Path.fromString("/activeState/document"),
        );
        return found;
    };

    const setGenericInlineEdge = (linked, size) => {
        const oldState = world.getState(),
            draft = oldState.getDraft(),
            pairBase =
                "/activeState/stylePatchesSource/italic/instance/relativeFontSize";
        if (size !== null) {
            getEntry(draft, Path.fromString(`${pairBase}/value`)).value =
                size.value;
            getEntry(draft, Path.fromString(`${pairBase}/unit`)).value =
                size.unit;
        }
        const links = draft
                .get("activeState")
                .get("typeSpec")
                .get("inlineNodesStyleLinks"),
            edge = links.constructor.Model.createPrimalDraft(
                links.dependencies,
            );
        edge.get("mode").value = linked ? "link" : "unlinked";
        if (linked) edge.get("stylePatch").value = "italic";
        links.set("generic-inline", edge);
        const newState = draft.metamorphose();
        world.setState(newState);
        world.root.update(new StateComparison(oldState, newState));
    };

    it("the inline-edge payload is the measured fallback basis beneath the mark link", () => {
        let paths = findProbeLeafPaths(world.getState());
        expect(paths.length).toBe(3);

        // baseline: the unmarked runs resolve unstyled (textblock
        // style = the t1 context, 18pt); the marked run resolves
        // its intent link (<b> -> bold, the "legible" fixture
        // precedent)
        const direct0 = leafMeasureOf(world, compositionHandler, paths[0]),
            nested0 = leafMeasureOf(world, compositionHandler, paths[1]),
            marked0 = leafMeasureOf(world, compositionHandler, paths[2]);
        expect(direct0.styleLinkPropertiesId).toBe(null);
        expect(nested0.styleLinkPropertiesId).toBe(null);
        expect(marked0.styleLinkPropertiesId).toContain(
            "/intentStyleLinks/bold",
        );
        // same text, same t1 context: the direct and nested unmarked
        // runs measure alike (both 18pt — the containing-context
        // anchoring, incl. the li-inline resolution through the
        // entry-less `list` level)
        expect(nested0.width).toBeCloseTo(direct0.width, 5);

        // LIVE edge add (root typeSpec; inherited to t1): generic-inline
        // -> the "italic" patch (unused by any fixture mark) at an absolute 30pt
        setGenericInlineEdge(true, { value: 30, unit: "pt" });

        paths = findProbeLeafPaths(world.getState());
        const direct1 = leafMeasureOf(world, compositionHandler, paths[0]),
            nested1 = leafMeasureOf(world, compositionHandler, paths[1]),
            marked1 = leafMeasureOf(world, compositionHandler, paths[2]);

        // the nested unmarked run now measures at the EDGE payload
        // (30pt — the fallback layer engaged)
        expect(nested1.styleLinkPropertiesId).toContain(
            "/inlineNodesStyleLinks/generic-inline",
        );
        // measurement scales with the payload size: 18pt -> 30pt
        expect(nested1.width).toBeGreaterThan(nested0.width * 1.5);
        expect(nested1.width).toBeLessThan(nested0.width * 1.8);

        // explicit-everything: the MARK link wins over the edge
        // fallback (the <b> element writes its own set) — unchanged
        // id and unchanged measured width (the bold patch carries no
        // relativeFontSize: the size stays the anchor context)
        expect(marked1.styleLinkPropertiesId).toContain(
            "/intentStyleLinks/bold",
        );
        expect(marked1.styleLinkPropertiesId).not.toContain(
            "/inlineNodesStyleLinks/",
        );
        expect(marked1.width).toBeCloseTo(marked0.width, 3);

        // the direct run (no enclosing inline node) is unaffected
        expect(direct1.styleLinkPropertiesId).toBe(null);
        expect(direct1.width).toBeCloseTo(direct0.width, 5);

        // cleanup: the tombstone clears the fallback again
        setGenericInlineEdge(false, null);
        paths = findProbeLeafPaths(world.getState());
        const nested2 = leafMeasureOf(world, compositionHandler, paths[1]);
        expect(nested2.styleLinkPropertiesId).toBe(null);
        expect(nested2.width).toBeCloseTo(nested0.width, 5);
        // restore the bold patch pair
        const oldState = world.getState(),
            draft = oldState.getDraft(),
            pairBase =
                "/activeState/stylePatchesSource/italic/instance/relativeFontSize";
        for (const part of ["value", "unit"])
            getEntry(draft, Path.fromString(`${pairBase}/${part}`)).clear();
        const newState = draft.metamorphose();
        world.setState(newState);
        world.root.update(new StateComparison(oldState, newState));
    });
});
