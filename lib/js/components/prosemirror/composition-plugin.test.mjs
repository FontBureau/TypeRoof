// @vitest-environment jsdom
// Behavior tests for the editor composition applicator plugin
// (composition-plugin.ts): payload → decoration rendering, fragment
// positional rules, staleness, OFF MODE, map-through on doc change,
// incremental replacement, reset resilience (EditorState re-creation),
// subscription lifecycle, and inertness without a controller.
import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "./prosemirror-testing-schema.ts";
import {
    createEditorCompositionPlugin,
    editorCompositionPluginKey,
} from "./composition-plugin.ts";

const p = (...content) => schema.node("paragraph", null, content),
    text = (str) => schema.text(str),
    tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(pmDoc) {
    const observers = new Map(),
        registrations = new Map(),
        fakeController = {
            observe(path, cb) {
                const set = observers.get(path) ?? new Set();
                set.add(cb);
                observers.set(path, set);
                if (registrations.has(path)) cb(registrations.get(path));
                return () => {
                    observers.get(path)?.delete(cb);
                };
            },
            subscribe() {
                return () => {};
            },
            publish(path, payload) {
                registrations.set(path, payload);
                for (const cb of observers.get(path) ?? []) cb(payload);
            },
            observerCount(path) {
                return observers.get(path)?.size ?? 0;
            },
        },
        // The "current metamodel nodes" for the staleness check.
        currentNodes = new Map(),
        ctx = {
            getWidgetById: (id, defaultValue) =>
                id === "compositionController" ? fakeController : defaultValue,
            getEntry: (path) => {
                if (!currentNodes.has(path))
                    throw new Error(`KEY ERROR not found: ${path}`);
                return currentNodes.get(path);
            },
            documentPath: "/document",
        },
        state = EditorState.create({
            schema,
            doc: pmDoc,
            plugins: [createEditorCompositionPlugin(ctx)],
        }),
        view = new EditorView(document.createElement("div"), { state });
    return { view, fakeController, currentNodes };
}

const TEXTBLOCK = "/document/content/0",
    RUN = "/document/content/0/content/0";

function makePayload({
    marker,
    segments,
    lines,
    leaves,
    colorCoding = "off",
    treatments = [],
    textblockPath = TEXTBLOCK,
}) {
    return {
        textblockPath,
        leaves,
        paragraphs: [
            {
                segments,
                result: {
                    lines,
                    diagnostics: { overfullLines: [], badness: [] },
                },
            },
        ],
        treatmentConfig: { treatments, direction: "both" },
        colorCoding,
        sources: { textblockNode: marker, leafTexts: [] },
        lineWidthPt: 480,
    };
}

const makeLine = (
        fromSegment,
        toSegment,
        adjustmentStep = 0,
        breakAt = null,
    ) => ({
        fromSegment,
        toSegment,
        breakAt,
        naturalWidthPt: 0,
        adjustmentStep,
    }),
    plainLeaves = () => [{ path: RUN, treatment: null }];

describe("createEditorCompositionPlugin", () => {
    it("renders fragment spans and the composed class on the textblock", async () => {
        const pmDoc = schema.node("doc", null, [p(text("hello world"))]),
            { view, fakeController, currentNodes } = setup(pmDoc),
            marker = {};
        currentNodes.set(TEXTBLOCK, marker);
        fakeController.publish(
            TEXTBLOCK,
            makePayload({
                marker,
                leaves: plainLeaves(),
                segments: [
                    { start: 0, end: 6, sourceIndex: 0 },
                    { start: 6, end: 11, sourceIndex: 0 },
                ],
                lines: [makeLine(0, 1), makeLine(1, 2)],
            }),
        );
        await tick();
        const spans = view.dom.querySelectorAll(
            "span.typeroof-composition-line",
        );
        expect(spans).toHaveLength(2);
        expect(
            spans[0].classList.contains("typeroof-composition-line-first"),
        ).toBe(true);
        expect(
            spans[0].classList.contains(
                "typeroof-composition-paragraph-first-line",
            ),
        ).toBe(true);
        expect(
            spans[1].classList.contains("typeroof-composition-line-first"),
        ).toBe(true);
        expect(
            spans[1].classList.contains(
                "typeroof-composition-paragraph-first-line",
            ),
        ).toBe(false);
        expect(spans[0].textContent).toBe("hello ");
        expect(spans[1].textContent).toBe("world");
        expect(
            view.dom.querySelector("p").classList.contains("typeroof-composed"),
        ).toBe(true);
        view.destroy();
    });

    it("renders treatment style properties and data-tracking-gaps", async () => {
        const pmDoc = schema.node("doc", null, [p(text("hello world"))]),
            { view, fakeController, currentNodes } = setup(pmDoc),
            marker = {};
        currentNodes.set(TEXTBLOCK, marker);
        fakeController.publish(
            TEXTBLOCK,
            makePayload({
                marker,
                leaves: [
                    {
                        path: RUN,
                        treatment: {
                            potentials: { tracking: [-0.5, 0, 0.5] },
                            spaceAdvancePt: 3,
                            axesEntries: [],
                        },
                    },
                ],
                segments: [{ start: 0, end: 11, sourceIndex: 0 }],
                lines: [
                    Object.assign(makeLine(0, 1, 0.5), {
                        trackingGapsBySourceIndex: { 0: 2 },
                    }),
                ],
                treatments: ["tracking"],
            }),
        );
        await tick();
        const span = view.dom.querySelector("span.typeroof-composition-line");
        expect(span.getAttribute("style")).toContain(
            "--line-letter-spacing: 0.25pt",
        );
        expect(span.getAttribute("data-tracking-gaps")).toBe("2");
        view.destroy();
    });

    it("rejects stale payloads (sources no longer current)", async () => {
        const pmDoc = schema.node("doc", null, [p(text("hello world"))]),
            { view, fakeController, currentNodes } = setup(pmDoc);
        currentNodes.set(TEXTBLOCK, { current: true });
        fakeController.publish(
            TEXTBLOCK,
            makePayload({
                marker: { stale: true }, // !== the current entry
                leaves: plainLeaves(),
                segments: [{ start: 0, end: 11, sourceIndex: 0 }],
                lines: [makeLine(0, 1)],
            }),
        );
        await tick();
        expect(
            view.dom.querySelectorAll("span.typeroof-composition-line"),
        ).toHaveLength(0);
        view.destroy();
    });

    it("removes decorations on OFF MODE (null payload)", async () => {
        const pmDoc = schema.node("doc", null, [p(text("hello world"))]),
            { view, fakeController, currentNodes } = setup(pmDoc),
            marker = {};
        currentNodes.set(TEXTBLOCK, marker);
        fakeController.publish(
            TEXTBLOCK,
            makePayload({
                marker,
                leaves: plainLeaves(),
                segments: [{ start: 0, end: 11, sourceIndex: 0 }],
                lines: [makeLine(0, 1)],
            }),
        );
        await tick();
        expect(
            view.dom.querySelectorAll("span.typeroof-composition-line"),
        ).toHaveLength(1);
        fakeController.publish(TEXTBLOCK, null);
        await tick();
        expect(
            view.dom.querySelectorAll("span.typeroof-composition-line"),
        ).toHaveLength(0);
        expect(
            view.dom.querySelector("p").classList.contains("typeroof-composed"),
        ).toBe(false);
        view.destroy();
    });

    it("maps decorations through document changes", async () => {
        const pmDoc = schema.node("doc", null, [p(text("hello world"))]),
            { view, fakeController, currentNodes } = setup(pmDoc),
            marker = {};
        currentNodes.set(TEXTBLOCK, marker);
        fakeController.publish(
            TEXTBLOCK,
            makePayload({
                marker,
                leaves: plainLeaves(),
                segments: [
                    { start: 0, end: 6, sourceIndex: 0 },
                    { start: 6, end: 11, sourceIndex: 0 },
                ],
                lines: [makeLine(0, 1), makeLine(1, 2)],
            }),
        );
        await tick();
        // Insert before the textblock's text (first char is AT pos 1);
        // the decoration maps forward and keeps covering "hello ".
        view.dispatch(view.state.tr.insertText("hey ", 1));
        const spans = view.dom.querySelectorAll(
            "span.typeroof-composition-line",
        );
        expect(spans).toHaveLength(2);
        expect(spans[0].textContent).toBe("hello ");
        view.destroy();
    });

    it("replaces a textblock's decorations on re-publication (no duplication)", async () => {
        const pmDoc = schema.node("doc", null, [p(text("hello world"))]),
            { view, fakeController, currentNodes } = setup(pmDoc),
            marker = {};
        currentNodes.set(TEXTBLOCK, marker);
        const payload = makePayload({
            marker,
            leaves: plainLeaves(),
            segments: [{ start: 0, end: 11, sourceIndex: 0 }],
            lines: [makeLine(0, 1)],
        });
        fakeController.publish(TEXTBLOCK, payload);
        await tick();
        fakeController.publish(TEXTBLOCK, {
            ...payload,
            paragraphs: [
                {
                    segments: [
                        { start: 0, end: 5, sourceIndex: 0 },
                        { start: 5, end: 11, sourceIndex: 0 },
                    ],
                    result: {
                        lines: [makeLine(0, 1), makeLine(1, 2)],
                        diagnostics: { overfullLines: [], badness: [] },
                    },
                },
            ],
        });
        await tick();
        expect(
            view.dom.querySelectorAll("span.typeroof-composition-line"),
        ).toHaveLength(2);
        expect(view.dom.querySelectorAll("p.typeroof-composed")).toHaveLength(
            1,
        );
        view.destroy();
    });

    it("republishes after EditorState re-creation (StateField reset)", async () => {
        const pmDoc = schema.node("doc", null, [p(text("hello world"))]),
            { view, fakeController, currentNodes } = setup(pmDoc),
            marker = {};
        currentNodes.set(TEXTBLOCK, marker);
        fakeController.publish(
            TEXTBLOCK,
            makePayload({
                marker,
                leaves: plainLeaves(),
                segments: [{ start: 0, end: 11, sourceIndex: 0 }],
                lines: [makeLine(0, 1)],
            }),
        );
        await tick();
        expect(
            view.dom.querySelectorAll("span.typeroof-composition-line"),
        ).toHaveLength(1);
        // Simulate ProseMirror.update()'s state re-creation: same
        // plugins array (plugin views survive), fields re-initialized.
        expect(
            editorCompositionPluginKey.getState(view.state).find().length,
        ).toBeGreaterThan(0);
        view.updateState(
            EditorState.create({
                schema,
                doc: view.state.doc,
                plugins: view.state.plugins,
            }),
        );
        expect(
            editorCompositionPluginKey.getState(view.state).find().length,
        ).toBe(0);
        await tick();
        expect(
            view.dom.querySelectorAll("span.typeroof-composition-line"),
        ).toHaveLength(1);
        expect(
            view.dom.querySelector("p").classList.contains("typeroof-composed"),
        ).toBe(true);
        view.destroy();
    });

    it("unsubscribes on destroy", async () => {
        const pmDoc = schema.node("doc", null, [p(text("hello world"))]),
            { view, fakeController } = setup(pmDoc);
        expect(fakeController.observerCount(TEXTBLOCK)).toBe(1);
        view.destroy();
        expect(fakeController.observerCount(TEXTBLOCK)).toBe(0);
    });

    it("keeps decorations of ADJACENT textblocks (inclusive find boundaries)", async () => {
        // Regression: DecorationSet.find matches with inclusive
        // boundaries, so replacing textblock B's decorations must not
        // remove textblock A's node decoration, which ENDS exactly at
        // B's start. Also, B's last fragment must survive a later
        // publication of a following textblock.
        const pmDoc = schema.node("doc", null, [
                p(text("hello world")),
                p(text("second block")),
            ]),
            { view, fakeController, currentNodes } = setup(pmDoc),
            markerA = {},
            markerB = {},
            TB_A = "/document/content/0",
            TB_B = "/document/content/1",
            RUN_A = "/document/content/0/content/0",
            RUN_B = "/document/content/1/content/0";
        currentNodes.set(TB_A, markerA);
        currentNodes.set(TB_B, markerB);
        fakeController.publish(
            TB_A,
            makePayload({
                marker: markerA,
                leaves: [{ path: RUN_A, treatment: null }],
                segments: [{ start: 0, end: 11, sourceIndex: 0 }],
                lines: [makeLine(0, 1)],
            }),
        );
        await tick();
        fakeController.publish(
            TB_B,
            makePayload({
                textblockPath: TB_B,
                marker: markerB,
                leaves: [{ path: RUN_B, treatment: null }],
                segments: [
                    { start: 0, end: 6, sourceIndex: 0 },
                    { start: 6, end: 12, sourceIndex: 0 },
                ],
                lines: [makeLine(0, 1), makeLine(1, 2)],
            }),
        );
        await tick();
        // Both textblocks keep their composed class …
        const paras = view.dom.querySelectorAll("p");
        expect(paras[0].classList.contains("typeroof-composed")).toBe(true);
        expect(paras[1].classList.contains("typeroof-composed")).toBe(true);
        // … and all fragments survive: A has 1, B has 2.
        expect(
            view.dom.querySelectorAll("span.typeroof-composition-line"),
        ).toHaveLength(3);
        view.destroy();
    });

    it("repaints decorations dropped by a content-replacing transaction (readDOMChange resilience)", async () => {
        // Regression (downloads/issue.txt): a transaction that REPLACES
        // a range with (textually identical) re-parsed content — PM's
        // readDOMChange does this when the editor DOM is mutated
        // externally — drops the decorations covering the range during
        // mapping. Only the typed textblock republishes, so without
        // self-healing the NEIGHBOR keeps its holes. The plugin must
        // repaint the affected textblocks from its payload cache.
        const pmDoc = schema.node("doc", null, [
                p(text("hello world")),
                p(text("second block")),
            ]),
            { view, fakeController, currentNodes } = setup(pmDoc),
            markerA = {},
            markerB = {},
            TB_A = "/document/content/0",
            TB_B = "/document/content/1";
        currentNodes.set(TB_A, markerA);
        currentNodes.set(TB_B, markerB);
        for (const [path, marker, str] of [
            [TB_A, markerA, "hello world"],
            [TB_B, markerB, "second block"],
        ])
            fakeController.publish(
                path,
                makePayload({
                    textblockPath: path,
                    marker,
                    leaves: [{ path: `${path}/content/0`, treatment: null }],
                    segments: [{ start: 0, end: str.length, sourceIndex: 0 }],
                    lines: [makeLine(0, 1)],
                }),
            );
        await tick();
        expect(
            view.dom.querySelectorAll("span.typeroof-composition-line"),
        ).toHaveLength(2);

        // Simulate readDOMChange: replace a range spanning A's tail
        // and B's head with the SAME content (textually identical).
        // t1 = [0,13), t2 = [13,26); content starts at 1 resp. 14.
        const from = 5,
            to = 20,
            tr = view.state.tr.replace(
                from,
                to,
                view.state.doc.slice(from, to),
            );
        view.dispatch(tr);
        // Mapping dropped the decorations intersecting [5, 20): A's
        // fragment [1,12] and B's node decoration + fragment head.
        await tick();
        // Self-heal: both textblocks are fully decorated again, with
        // no republication having happened.
        const paras = view.dom.querySelectorAll("p");
        expect(paras[0].classList.contains("typeroof-composed")).toBe(true);
        expect(paras[1].classList.contains("typeroof-composed")).toBe(true);
        expect(
            view.dom.querySelectorAll("span.typeroof-composition-line"),
        ).toHaveLength(2);
        expect(paras[0].textContent).toBe("hello world");
        expect(paras[1].textContent).toBe("second block");
        view.destroy();
    });

    it("is inert without a composition controller", async () => {
        const pmDoc = schema.node("doc", null, [p(text("hello world"))]),
            state = EditorState.create({
                schema,
                doc: pmDoc,
                plugins: [
                    createEditorCompositionPlugin({
                        getWidgetById: (id, defaultValue) =>
                            defaultValue ?? null,
                        getEntry: () => {
                            throw new Error("must not be called");
                        },
                        documentPath: "/document",
                    }),
                ],
            }),
            view = new EditorView(document.createElement("div"), { state });
        view.dispatch(view.state.tr.insertText("x", 2));
        await tick();
        expect(
            view.dom.querySelectorAll("span.typeroof-composition-line"),
        ).toHaveLength(0);
        view.destroy();
    });
});
