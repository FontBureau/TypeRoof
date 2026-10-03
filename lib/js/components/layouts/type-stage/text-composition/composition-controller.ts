/**
 * The task of text composition is divided into two sides of a contract
 * (composition-types.ts; algorithms import only from that module):
 *
 *   - the Host: everything environment-facing (text, fonts, locale,
 *     DOM, time). Host roles are pure where possible; only the
 *     Applicator and the Controller are truly impure.
 *   - the Algorithm: pure composition (CompositionInput -> CompositionResult)
 *
 * Roles within the Host (coordinated by this controller):
 *
 *   - Segmenter (pure pass): paragraph {text, styleSpans} -> segments
 *     + break opportunities; splits at style boundaries and UAX#14
 *     (https://www.unicode.org/reports/tr14/)  break points. Hard
 *     breaks (e.g. <br>, newline) separate the paragraph into LOGICAL
 *     paragraphs as far as line-breaking is concerned; the Controller
 *     invokes the Algorithm once per logical paragraph — the
 *     Algorithm never sees hard breaks.
 *   - Hyphenator (pure pass, pluggable per language): adds segments
 *     and break points inside words; a hyphenated segment includes the
 *     hyphen glyph in its measured width, so algorithms stay ignorant
 *     of hyphenation. Enabled/disabled as a Host control PRIOR to line
 *     breaking/fitting — it changes the input, not the algorithm.
 *   - Measurer (stateful but deterministic): HarfBuzz shaping and
 *     advance caching in font units (em — size independent, so caches
 *     keyed by (text, font, axes location) stay valid across sizes;
 *     pt conversion at the contract boundary is a pure scaling by
 *     fontSizePt / unitsPerEm); backs all width numbers including the
 *     injected lineWidthAtStep.
 *   - Treatment Planner (pure logic over configuration): derives the
 *     per-candidate normalized step scale (0 = natural width, -1 =
 *     maximum narrowing, +1 = maximum widening; the two directions
 *     are not symmetric in physical width) and the step->width
 *     mapping from the per-font-location treatment tables, relative
 *     to the font's current axis location. The Measurer turns its
 *     output into the injected width function. What a step applies
 *     physically is policy defined HERE, not in the contract: the
 *     first iteration applies all potentials in parallel, axes
 *     first, then spacing; later iterations may change the order,
 *     proportion or mechanism mix without touching any algorithm.
 *   - Applicator (impure): applies CompositionResult to the DOM —
 *     span-based CSS (the varla-varfo --line-adjust-step pattern):
 *     lines are wrapped in spans and adjustment is set via CSS custom
 *     properties. This leaves the semantics of the document intact
 *     and makes undo a matter of removing the spans. Also resets the
 *     output rendering.
 *   - Controller (this file): lifecycle (start, stop, pause, resume),
 *     dirty-range tracking (on edit, recompose from the first changed
 *     paragraph until breaks re-synchronize, not the whole document),
 *     orchestration of the passes above, algorithm selection.
 *     Logical paragraphs are independent composition units (pure
 *     algorithm, no shared state), so the Controller may parallelize
 *     them across workers, compose lazily (viewport) and recompose
 *     per dirty paragraph.
 *
 * Roles within an Algorithm (compositional, both pure):
 *
 *   - Breaker: chooses break points (strategy varies per algorithm).
 *   - Fitter: given a line candidate, chooses adjustmentStep within
 *     [-1, 1] using lineWidthAtStep. Shared between algorithms.
 *
 * Algorithm milestones (dynamic choice of algorithm is a goal):
 *
 *   1. dummy — proves the infrastructure calling the algorithm works.
 *   2. simple greedy alignment — ragged, greedy line breaking.
 *   3. greedy ragged + hyphenation — same algorithm as 2, richer
 *      input (hyphenation is a Host control, not an algorithm).
 *   4. greedy-fit — the varla-varfo strategy, predictively: greedy
 *      break at natural width; narrow until one more segment fits
 *      (minimal narrowing step); if narrowing pulls nothing up, widen
 *      to fill or leave at max potential. Must remain possible — it
 *      exercises every injected function — but it is a validation
 *      milestone, not the goal.
 *   5. Knuth-Plass++ — the actual target: paragraph-wide optimization
 *      with penalties (already in BreakOpportunity) and badness over
 *      the normalized adjustmentStep as the glue model (one
 *      continuous dimension, its physical meaning being Host policy).
 *
 * INTEGRATION (type-stage):
 *
 *   - Hook point: the DocumentNodesMeta tree (the always-active,
 *     DOM-free meta layer mirroring our metamodel NodeModel — the
 *     source of truth). The Composition Controller is a service
 *     OBSERVING the meta tree, not a renderer: it produces no DOM.
 *     It collects logical paragraphs from textblock nodes (text runs
 *     + style spans via the nodeProperties@ scopes), successive to
 *     the UIDocumentTypeSpecStyler — composition needs the final
 *     computed font/size/axes per run.
 *   - Line width comes from the node-properties (the layout model's
 *     page/column geometry), NEVER from measuring the DOM: we
 *     compose by prediction and then force our lines onto the DOM,
 *     which we control completely.
 *   - Results are published via a composition@<documentNodePath>
 *     protocol (same pattern as nodeProperties@/environment@), so
 *     any renderer can consume them: compose once, apply to multiple
 *     targets (side-by-side view).
 *   - The Applicator role lives in each renderer:
 *       + Viewer (the CENTER PIECE, confirmed feasible by the
 *         varla-varfo demo): the UIDocumentTextRun/UIDocumentElement
 *         attachments wrap lines in spans + CSS custom properties.
 *       + Editor (EXPERIMENTAL, later): a ProseMirror plugin
 *         translating the same CompositionResult into decorations.
 *         PM owns its DOM and does its own line wrapping, so it may
 *         fight us; if it does, the viewer alone is good enough.
 *         Invest only after the viewer is sealed.
 *
 * EXECUTION ORDER / SCHEDULING:
 *
 *   Current cascade (fact): the meta tree updates synchronously,
 *   top-down; a node's nodeProperties scope settles before its
 *   children cascade; the viewer's UIDocumentElement provisions its
 *   TypeSpecStyler before its other widgets; text-run attachments
 *   fill their DOM during their first update. So styles settle
 *   before content DOM is applied, all within one synchronous
 *   cycle. Changes to typeSpecProperties@/nodeProperties@ of an
 *   already-rendered node fire its update — that is the trigger
 *   set for recomposition; no separate dirty-tracking initially.
 *
 *   Hybrid scheduling:
 *     - Initial load: compose before reveal. The viewer renders
 *       the whole article in one controlled moment; keep it hidden
 *       until the first composition@ result per paragraph is
 *       published — no flash of unjustified content.
 *     - Steady state: async, per dirty paragraph. Recomposition
 *       does not block the cascade; the Controller schedules it
 *       after the cycle settles (microtask/idle callback; workers
 *       later, when algorithms get expensive — the Algorithm's
 *       purity makes that move mechanical). A brief moment of
 *       stale justification on edited paragraphs is acceptable
 *       (InDesign does the same).
 *
 *   Wrapping timing: line spans are throwaway — undo is unwrapping,
 *   so the Applicator can wrap/rewrap at any time. Requirement: the
 *   text-run attachment's DOM must exist; an attachment update that
 *   re-applies text invalidates the applied composition (the same
 *   update marks the paragraph dirty, triggering recomposition).
 *
 *   OFF MODE (no compositor): it must always be possible to opt
 *   out of composition entirely and keep today's behavior — the
 *   browser does its own line breaking. Valuable for comparison
 *   (speed, quality) and as a fallback when we fail, e.g. in
 *   environments missing capabilities (no HarfBuzz, no required
 *   APIs). Off mode is the absence of composition@ entries:
 *   renderers consume nothing and apply nothing, so the fallback
 *   costs zero in the applicators.
 *
 *   Staleness via immutable identity (no generation counters):
 *   the Host captures the immutable source objects a
 *   CompositionInput was built from (the narrowest that determine
 *   the input: paragraph node value/payload, settled nodeProperties
 *   — NOT the root state, which would invalidate everything on any
 *   keystroke). The published composition@ entry carries that
 *   source reference; consumers apply a result only if the current
 *   payload is === the captured one. Metamodel immutables are
 *   replaced wholesale on change, so === is a sound and complete
 *   staleness test — race-free async application without locks.
 */

// --- Milestone 1, Phase 3: Controller skeleton ----------------------
//
// DOM-less widget observing the document model: maintains the
// textblock index and detects dirty paragraphs from the compareResult
// (StateComparison) paths — no re-walk/identity-diff duplication of
// change detection. v0 logs what it would compose; measurement and
// composition@ publication land in phase 4.

import {
    _BaseComponent,
    UPDATE_STRATEGY,
    UPDATE_STRATEGY_COMPARE,
} from "../../../basics/component.mjs";
import { getEntry, StateComparison } from "../../../../metamodel.mjs";
import type { Path } from "../../../../metamodel.mjs";
import {
    GENERIC,
    LAYOUT,
} from "../../../registered-properties-definitions.mjs";
import { assembleLogicalParagraphs } from "./segmenter.ts";
import type { InlineItem } from "./segmenter.ts";
import { Measurer } from "./measurer.ts";
import { dummyComposition } from "./dummy-composition.ts";
// line-span styles (applied by the applicator, phase 6); imported
// here so the styles land whenever the controller is active
// (vite CSS import pattern, cf. tree-editor.typeroof.jsx)
import "./line-spans.css";

// The metamodel model instances (NodeModel, NodeSpecMapModel, states)
// are JS-inferred via allowJs; deep-typing them is not worthwhile for
// the skeleton — deliberately any (precedent: wikipedia/ingest.ts).
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    getMMChildIsBlock,
    specChildrenInInlineContext,
} from "../document-nodes-meta/derivations.mjs";

// A leaf service, not a container: COMPARE update strategy (receive
// the full compareResult) on a plain _BaseComponent — the
// per-cycle compareResult is the existing change detection we mine
// for dirty paragraphs.
export class CompositionController extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_COMPARE;
    // The base classes are JS (component.mjs); TS can't infer their
    // instance fields, so declare what we use.
    declare widgetBus: any;
    declare _defaultSchemaNodes: Record<string, any>;
    declare _textblockIndex: Map<string, string[]>;
    declare _measurer: Measurer | null;
    declare _compositionHandlerImpl: any;
    declare _registrations: Map<string, () => void>;

    constructor(
        widgetBus: any,
        proseMirrorDefaultSchemaSpec: { nodes: Record<string, any> },
    ) {
        super(widgetBus);
        this._defaultSchemaNodes = proseMirrorDefaultSchemaSpec.nodes;
        // Capability fallback: without a harfbuzz module (e.g. test
        // harnesses — the shell sets it on the root widgetBus) the
        // controller degrades to OFF (no composition@ entries), it
        // must not crash.
        this._measurer = widgetBus.harfbuzz
            ? new Measurer(widgetBus.harfbuzz)
            : null;
        this._compositionHandlerImpl = null;
        // textblockPath -> unregister closure (SimpleProtocolHandler)
        this._registrations = new Map();
        // textblock path string -> array of text-run content paths
        // (strings, content-index paths below the textblock)
        this._textblockIndex = new Map();
    }

    // --- Textblock identification (research Q1) ---
    // PM-parallel rule via the shared pure derivations: a block node
    // whose children are in inline context. The composition boundary
    // is the OUTERMOST such block (we don't descend into a textblock
    // looking for nested ones).

    _getSpecData(mmNodeSpecMap: any, typeKey: string) {
        if (mmNodeSpecMap.has(typeKey)) {
            const spec = mmNodeSpecMap.get(typeKey),
                content = spec.get("content");
            return {
                inline: spec.get("inline").value,
                content: content.isEmpty ? undefined : content.value,
            };
        }
        return this._defaultSchemaNodes[typeKey] ?? null;
    }

    _isTextblock(mmNodeSpecMap: any, mmNode: any): boolean {
        const typeKey = mmNode.get("typeKey").value;
        if (typeKey === "text") return false;
        if (!getMMChildIsBlock(this._defaultSchemaNodes, mmNodeSpecMap, mmNode))
            return false;
        const spec = this._getSpecData(mmNodeSpecMap, typeKey);
        if (spec === null) return false;
        return specChildrenInInlineContext(!!spec.inline, spec.content);
    }

    // Walk the document tree, collect textblocks and their direct
    // text-run children paths. Boundary: don't descend into a
    // textblock (nested inline islands belong to it).
    *_iterTextblocks(
        mmNodeSpecMap: any,
        mmNode: any,
        path: Path,
    ): Generator<[string, any]> {
        if (this._isTextblock(mmNodeSpecMap, mmNode)) {
            yield [path.toString(), mmNode];
            return;
        }
        const content = mmNode.get("content");
        for (const [index, child] of content.value.entries())
            yield* this._iterTextblocks(
                mmNodeSpecMap,
                child,
                path.append("content", index),
            );
    }

    _scanTextblocks(newState: any): Map<string, string[]> {
        const documentNode = getEntry(newState, this.widgetBus.rootPath),
            layoutRootPath = this.widgetBus.rootPath.parent,
            mmNodeSpecMap = getEntry(
                newState,
                layoutRootPath.append("proseMirrorSchema", "nodes"),
            ),
            index = new Map();
        for (const [pathString, mmNode] of this._iterTextblocks(
            mmNodeSpecMap,
            documentNode,
            this.widgetBus.rootPath,
        )) {
            const textRunPaths = [];
            for (const [index_, child] of mmNode.get("content").value.entries())
                if (child.get("typeKey").value === "text")
                    textRunPaths.push(`${pathString}/content/${index_}`);
            index.set(pathString, textRunPaths);
        }
        return index;
    }

    // --- Dirty detection from the compareResult paths ---
    // (the existing change detection; no re-walk). Content changes
    // mark the enclosing textblock; style-input changes mark ALL
    // textblocks (v1, ROADMAP-documented optimization deferred).

    _enclosingTextblock(pathString: string): string | null {
        // longest indexed textblock path that prefixes pathString
        let result = null;
        for (const textblockPath of this._textblockIndex.keys())
            if (
                pathString.startsWith(textblockPath + "/") ||
                pathString === textblockPath
            )
                if (result === null || textblockPath.length > result.length)
                    result = textblockPath;
        return result;
    }

    _initialCompose(rootState: any) {
        this._textblockIndex = this._scanTextblocks(rootState);
        for (const textblockPath of this._textblockIndex.keys())
            this._composeAndPublish(textblockPath, rootState);
    }

    // _BaseComponent has no initialUpdate; the COMPARE strategy
    // dispatch (component.mjs updateWidget) calls it on full-initial.
    initialUpdate(rootState: any) {
        this._initialCompose(rootState);
    }

    // --- Phase 4: input assembly, composition, publication ---

    // Classify a textblock's inline content (the segmenter's
    // InlineItem shape). EXTENSION POINT (see segmenter.ts): the
    // classification rules are simple v0 — text / hard_break by
    // typeKey, inline nodes with content as containers, else atoms.
    _buildInlineItems(
        mmNode: any,
        path: Path,
        leaves: { path: string | null }[],
    ): InlineItem[] {
        const items: InlineItem[] = [];
        for (const [index, child] of mmNode.get("content").value.entries()) {
            const typeKey = child.get("typeKey").value,
                childPath = path.append("content", index);
            if (typeKey === "text") {
                const text = child.get("text");
                items.push({
                    kind: "text",
                    text: text.isEmpty ? "" : text.value,
                });
                leaves.push({ path: childPath.toString() });
            } else if (typeKey === "hard_break")
                items.push({ kind: "hardBreak" });
            else {
                const content = child.get("content");
                if (content !== undefined && content.value.length > 0)
                    items.push({
                        kind: "inlineContainer",
                        items: this._buildInlineItems(child, childPath, leaves),
                    });
                else {
                    items.push({ kind: "inlineAtom" });
                    leaves.push({ path: childPath.toString() });
                }
            }
        }
        return items;
    }

    // Leaf texts in depth-first order (the segmenter's sourceIndex
    // counting): text runs contribute their text, atoms nothing.
    _leafTexts(items: readonly InlineItem[]): string[] {
        const texts: string[] = [];
        for (const item of items) {
            if (item.kind === "text") texts.push(item.text);
            else if (item.kind === "inlineAtom") texts.push("");
            else if (item.kind === "inlineContainer")
                texts.push(...this._leafTexts(item.items));
        }
        return texts;
    }

    _compositionHandler(): any {
        if (this._compositionHandlerImpl === null)
            this._compositionHandlerImpl =
                this.widgetBus.wrapper.getProtocolHandlerImplementation(
                    "composition@",
                );
        return this._compositionHandlerImpl;
    }

    _unpublishAll() {
        for (const unregister of this._registrations.values()) unregister();
        this._registrations.clear();
    }

    // Compose ONE textblock (all its logical paragraphs) and publish
    // composition@<textblockPath> — replacing any previous entry.
    _composeAndPublish(textblockPath: string, newState: any) {
        const textblockNode = getEntry(
                newState,
                this.widgetBus.rootPath.fromString(textblockPath),
            ),
            // OFF MODE gate: the root typeSpec's textComposition
            // property (v0: global; per-paragraph resolution later).
            enabled = (getEntry(newState, this._typeSpecPath()) as any).get(
                "textComposition",
            ).value;
        if (!enabled) return;
        if (this._measurer === null) {
            console.warn(
                `${this} no harfbuzz module available — composition is OFF.`,
            );
            return;
        }

        const leaves: { path: string | null }[] = [],
            items = this._buildInlineItems(
                textblockNode,
                this.widgetBus.rootPath.fromString(textblockPath),
                leaves,
            ),
            leafTexts = this._leafTexts(items),
            logicalParagraphs = assembleLogicalParagraphs(items),
            font = getEntry(newState, this._fontPath()).value,
            // Line width + font size from the textblock's
            // nodeProperties@ scope (settled — we update after the
            // meta); NEVER from DOM measurement.
            // the registered value is the meta dispatcher widget;
            // its nodeProperties getter answers the scope-like
            // payload (document-nodes-meta/index.mjs:338-345)
            nodeProperties = this.getEntry(
                `nodeProperties@${textblockPath}`,
            )?.nodeProperties?.getProperties(),
            availableWidth = nodeProperties?.get(`${LAYOUT}availableWidth`),
            fontSize = nodeProperties?.get(`${GENERIC}fontSize`),
            lineWidthPt =
                typeof availableWidth === "number" ? availableWidth : 480,
            fontSizePt = typeof fontSize === "number" ? fontSize : 12;
        if (typeof availableWidth !== "number" || typeof fontSize !== "number")
            console.warn(
                `${this} missing node properties for ${textblockPath} ` +
                    `(availableWidth=${availableWidth}, fontSize=${fontSize}) ` +
                    `— using fallbacks ${lineWidthPt}pt / ${fontSizePt}pt.`,
            );

        const paragraphs = logicalParagraphs.map(({ segments, breaks }) => {
                // measure: fill widthPt in place (segments are fresh)
                for (const segment of segments)
                    segment.widthPt =
                        this._measurer!.measureEm(
                            font,
                            leafTexts[segment.sourceIndex]?.slice(
                                segment.start,
                                segment.end,
                            ) ?? "",
                        ) * fontSizePt;
                const widthOf = (from: number, to: number) => {
                        let width = 0;
                        for (let i = from; i < to; i++)
                            width += segments[i]!.widthPt;
                        return width;
                    },
                    result = dummyComposition({
                        segments,
                        breaks,
                        lineWidthPt: () => lineWidthPt,
                        // v0: adjustment potentials are not wired (no
                        // Treatment Planner yet) — step does nothing;
                        // the dummy only ever probes step 0.
                        lineWidthAtStep: (from, to /*, step */) =>
                            widthOf(from, to),
                    });
                return { segments, result };
            }),
            payload = {
                textblockPath,
                // leaf inline items (text runs and atoms) in
                // sourceIndex order — applicators find their segments
                // by their own document-node path
                leaves,
                paragraphs,
                // immutable sources for apply-time staleness checks
                sources: { textblockNode },
            },
            identifier = `composition@${textblockPath}`,
            handler = this._compositionHandler();
        if (this._registrations.has(textblockPath)) {
            this._registrations.get(textblockPath)!();
            this._registrations.delete(textblockPath);
        }
        this._registrations.set(
            textblockPath,
            handler.register(identifier, payload),
        );
        handler.setUpdated(identifier);
        // live feedback until the applicator (phase 6) makes it visible
        console.log(
            `${this} published ${identifier}:`,
            paragraphs.map(
                ({ result }) =>
                    `${result.lines.length} lines ` +
                    `(overfull: ${result.diagnostics.overfullLines.length})`,
            ),
        );
    }

    _typeSpecPath(): Path {
        return this.widgetBus.rootPath.parent.append("typeSpec");
    }

    _fontPath(): Path {
        return this.widgetBus.rootPath.constructor.fromString("/font");
    }

    destroy() {
        this._unpublishAll();
        // _BaseComponent destroy default is a no-op.
    }

    update(compareResult: StateComparison) {
        const { newState } = compareResult,
            documentPathString = this.widgetBus.rootPath.toString(),
            // The style inputs live next to the document in the layout
            // state; changes there can affect every paragraph (v1,
            // ROADMAP-documented optimization deferred). Enumerate them
            // EXPLICITLY: structs are "always changed" up the ancestor
            // chain (compare.ts), so cursor movement (editingTypeSpec
            // etc., also under the layout root) must NOT count.
            layoutRootString = this.widgetBus.rootPath.parent.toString(),
            styleInputPrefixes = [
                "typeSpec",
                "stylePatchesSource",
                "nodeSpecToTypeSpec",
                "proseMirrorSchema",
            ].map((part) => `${layoutRootString}/${part}`);
        let contentChanged = false,
            stylesChanged = false;
        const { EQUALS, DELETED } = StateComparison.COMPARE_STATUSES;
        const dirtyPaths = new Set<string>();
        for (const [status, , pathInstance] of compareResult) {
            // compareResult lists EQUALS entries too (they carry no
            // change): only actual changes count.
            if (status === EQUALS) continue;
            const pathString = pathInstance.toString();
            if (
                pathString === documentPathString ||
                pathString.startsWith(documentPathString + "/")
            ) {
                contentChanged = true;
                if (status !== DELETED) {
                    const textblockPath = this._enclosingTextblock(pathString);
                    if (textblockPath !== null) dirtyPaths.add(textblockPath);
                }
            } else if (
                styleInputPrefixes.some(
                    (prefix) =>
                        pathString === prefix ||
                        pathString.startsWith(prefix + "/"),
                )
            )
                stylesChanged = true;
        }
        if (contentChanged)
            // structural changes (moves, new, deleted) invalidate the
            // index; a full rescan is cheap at this scale
            this._textblockIndex = this._scanTextblocks(newState);
        const dirty = stylesChanged
            ? [...this._textblockIndex.keys()]
            : [...dirtyPaths];
        // unregister publications of vanished textblocks (notify:
        // setUpdated after unregister delivers [true, null])
        for (const registered of [...this._registrations.keys()])
            if (!this._textblockIndex.has(registered)) {
                this._registrations.get(registered)!();
                this._registrations.delete(registered);
                this._compositionHandler().setUpdated(
                    `composition@${registered}`,
                );
            }
        // OFF MODE: the gate is checked per compose; when it turns
        // off (a style-input change), unpublish everything.
        if (
            !(getEntry(newState, this._typeSpecPath()) as any).get(
                "textComposition",
            ).value
        ) {
            // notify consumers of the off transition: setUpdated after
            // unregister delivers [true, null] — null IS off mode
            const unregistered = [...this._registrations.keys()];
            this._unpublishAll();
            for (const textblockPath of unregistered)
                this._compositionHandler().setUpdated(
                    `composition@${textblockPath}`,
                );
        } else
            for (const textblockPath of dirty)
                if (this._textblockIndex.has(textblockPath))
                    this._composeAndPublish(textblockPath, newState);
    }
}
