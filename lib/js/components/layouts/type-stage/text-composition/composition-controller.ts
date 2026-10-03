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

    constructor(
        widgetBus: any,
        proseMirrorDefaultSchemaSpec: { nodes: Record<string, any> },
    ) {
        super(widgetBus);
        this._defaultSchemaNodes = proseMirrorDefaultSchemaSpec.nodes;
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
        console.log(
            `${this} initial scan: ${this._textblockIndex.size} textblocks`,
            [...this._textblockIndex.entries()],
        );
    }

    // _BaseComponent has no initialUpdate; the COMPARE strategy
    // dispatch (component.mjs updateWidget) calls it on full-initial.
    initialUpdate(rootState: any) {
        this._initialCompose(rootState);
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
        const dirtyPaths = new Set();
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
        if (dirty.length > 0)
            console.log(
                `${this} would compose ${dirty.length} dirty logical paragraphs:`,
                dirty,
            );
    }
}
