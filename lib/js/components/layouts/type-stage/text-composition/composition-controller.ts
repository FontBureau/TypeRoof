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

// --- Milestone 1, phases 3-6: the composition SERVICE ----------------
//
// History: this was a COMPARE-strategy widget mining the compareResult
// for dirty textblocks and publishing composition@ from its own update
// (commits f0848155..dee5b9f9, kept in history). That timing was
// structurally fragile: the composition@ updated-log resets at cycle
// start, so marks only reach widgets updated later in the same
// cascade — the viewer attachments update WITH the meta. Now
// DocumentNodesMeta DRIVES composition inside its own cascade (the
// amended plan, thoughts/plans/2026-10-03-0933): scopes settle ->
// this service composes -> attachments render, one cycle, no lag.
//
// This class is a DOM-less SERVICE widget (UPDATE_STRATEGY_NO_UPDATE,
// no update-cycle role): it owns the Measurer, the segmenter/algorithm
// invocation and the composition@ publication. The meta looks it up
// by id ("compositionController") and calls composeTextblock().

import { _BaseComponent } from "../../../basics/component.mjs";
import {
    UPDATE_STRATEGY,
    UPDATE_STRATEGY_NO_UPDATE,
} from "../../../basics/component.mjs";
import { getEntry, Path } from "../../../../metamodel.mjs";
import {
    GENERIC,
    LAYOUT,
    SPECIFIC,
} from "../../../registered-properties-definitions.mjs";
import { assembleLogicalParagraphs } from "./segmenter.ts";
import type { InlineItem } from "./segmenter.ts";
import {
    Measurer,
    axesEntriesOf,
    axesKeyOf,
    axesKeyOfEntries,
    featuresEntriesOf,
    featuresKeyOf,
} from "./measurer.ts";
import {
    discoverPotentials,
    calculatePotentials,
    anchorPotentialsToLocation,
} from "./justification-potentials.ts";
import {
    createTreatmentStepper,
    TREATMENT_PLANNER_DEFAULTS,
} from "./treatment-planner.ts";
import type { TreatmentPlannerConfig } from "./treatment-planner.ts";
import { greedyFitComposition } from "./greedy-fit.ts";
import { createDummyComposition } from "./dummy-composition.ts";
import { greedyRaggedComposition } from "./greedy-ragged.ts";
import {
    getStyleLinkPropertiesId,
    getWrapMarks,
} from "../document-nodes-meta/derivations.mjs";
import { schemaSpec as defaultSchemaSpec } from "../../../prosemirror/default-schema.ts";
import Hypher from "hypher";
import {
    hyphenateSegments,
    HYPHENATION_DEFAULTS,
    languageToHyphenationPatternKey,
} from "./hyphenator.ts";
import type { HyphenationConfig } from "./hyphenator.ts";
// line-span styles (applied by the applicator); imported here so the
// styles land whenever the controller is active (vite CSS import
// pattern, cf. tree-editor.typeroof.jsx)
import "./line-spans.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A leaf inline item (text run or atom) in sourceIndex order —
 *  applicators find their segments by the document-node path;
 *  styleLinkPropertiesId is the run's EXCLUSIVE resolved style link
 *  (per-run style spans; null = unstyled, measured at the
 *  textblock's style). */
export interface CompositionLeaf {
    path: string | null;
    styleLinkPropertiesId: string | null;
}

/** What the meta element hands to composeTextblock for per-run
 *  style resolution: the effective typeSpecProperties@ path of the
 *  textblock (from its own context, the memoized
 *  getTypeSpecPropertiesIdMethod) and whether typeSpec styling
 *  applies at all. */
export interface StyleResolutionContext {
    hasTypeSpecStyling: boolean;
    typeSpecPropertiesPath: Path | null;
}

/** The per-run measurement tuple (the textblock's values are the
 *  fallback; see composeTextblock). */
interface LeafStyle {
    font: any;
    axesEntries: [string, number][];
    axesKey: string;
    featuresEntries: [string, boolean][];
    featuresKey: string;
    language: string | null;
    direction: string | null;
    fontSizePt: number;
}

export class CompositionController extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_NO_UPDATE;

    // The base classes are JS (component.mjs); TS can't infer their
    // instance fields, so declare what we use.
    declare widgetBus: any;
    declare _measurer: Measurer | null;
    declare _compositionHandlerImpl: any;
    declare _styleLinkPropertiesHandlerImpl: any;
    declare _registrations: Map<string, () => void>;
    declare _ingredients: Map<string, unknown[]>;
    declare _hyphers: Map<unknown, any>;
    declare _noHarfbuzzWarned: boolean;

    constructor(widgetBus: any) {
        super(widgetBus);
        // Capability fallback: without a harfbuzz module (e.g. test
        // harnesses — the shell sets it on the root widgetBus) the
        // service degrades to OFF (no composition@ entries), it must
        // not crash.
        this._measurer = widgetBus.harfbuzz
            ? new Measurer(widgetBus.harfbuzz)
            : null;
        this._compositionHandlerImpl = null;
        this._styleLinkPropertiesHandlerImpl = null;
        // textblockPath -> unregister closure (SimpleProtocolHandler)
        this._registrations = new Map();
        // textblockPath -> consumed ingredients of the last
        // composition (the input-equality filter, Sprint A phase 2)
        this._ingredients = new Map();
        // Hypher instances per installed pattern OBJECT (immutable
        // metamodel values — identity keyed; bounded by the session's
        // installed pattern count)
        this._hyphers = new Map();
        this._noHarfbuzzWarned = false;
    }

    _compositionHandler(): any {
        if (this._compositionHandlerImpl === null)
            this._compositionHandlerImpl =
                this.widgetBus.wrapper.getProtocolHandlerImplementation(
                    "composition@",
                );
        return this._compositionHandlerImpl;
    }

    _layoutRootPath(): Path {
        // the service's relativeRootPath is ./document
        return this.widgetBus.rootPath.parent;
    }

    // Classify a textblock's inline content (the segmenter's
    // InlineItem shape) and collect the leaves (sourceIndex order).
    // EXTENSION POINT (see segmenter.ts): the classification
    // rules are simple v0. markSpec/styleResolution drive the per-run
    // style-link resolution (per-run style spans); when markSpec is
    // null every leaf resolves unstyled.
    _buildInlineItems(
        mmNode: any,
        path: Path,
        leaves: CompositionLeaf[],
        styleResolution: StyleResolutionContext | null,
        markSpec: any,
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
                leaves.push({
                    path: childPath.toString(),
                    styleLinkPropertiesId:
                        markSpec === null
                            ? null
                            : this._resolveLeafStyleLink(
                                  child,
                                  childPath,
                                  styleResolution,
                                  markSpec,
                              ),
                });
            } else if (typeKey === "hard_break")
                items.push({ kind: "hardBreak" });
            else {
                const content = child.get("content");
                if (content !== undefined && content.value.length > 0)
                    items.push({
                        kind: "inlineContainer",
                        items: this._buildInlineItems(
                            child,
                            childPath,
                            leaves,
                            styleResolution,
                            markSpec,
                        ),
                    });
                else {
                    items.push({ kind: "inlineAtom" });
                    leaves.push({
                        path: childPath.toString(),
                        styleLinkPropertiesId: null,
                    });
                }
            }
        }
        return items;
    }

    /** Per-run style spans: resolve a text leaf's EXCLUSIVE style
     *  link to its registered styleLinkProperties@ id (null =
     *  unstyled: no effective edge or no registration — the unknown-
     *  style case renders the bare tag, i.e. the textblock style).
     *  Marks are style-exclusive by contract (styleLinkProperties@
     *  is the full story; the links attach to the id). The guard is
     *  deliberately simple: >1 resolved link is a contract violation
     *  (console.error — a big contract issue), the innermost wins.
     *  If this ever fires we may make it smarter or rework the
     *  contract (e.g. a style adding only color/text-decoration/href
     *  could become allowable) — not now. */
    _resolveLeafStyleLink(
        textNode: any,
        childPath: Path,
        styleResolution: StyleResolutionContext | null,
        markSpec: any,
    ): string | null {
        if (
            styleResolution === null ||
            !styleResolution.hasTypeSpecStyling ||
            styleResolution.typeSpecPropertiesPath === null
        )
            return null;
        // getWrapMarks builds inside out: the innermost wrapper first
        const ids: string[] = [];
        for (const descriptor of getWrapMarks(
            textNode,
            markSpec,
            defaultSchemaSpec,
            { hasTypeSpecStyling: true },
            this.widgetBus,
            styleResolution.typeSpecPropertiesPath,
        )) {
            // no style link (styleLinkName) or no effective edge
            // (styleName) — renders unstyled for our purposes
            if (
                descriptor.styleLinkName == null ||
                descriptor.styleName == null
            )
                continue;
            const id = getStyleLinkPropertiesId(
                this.widgetBus,
                styleResolution.typeSpecPropertiesPath,
                descriptor.styleLinkType,
                descriptor.styleLinkName,
            );
            if (id !== null) ids.push(id);
        }
        if (ids.length > 1)
            console.error(
                `CONTRACT VIOLATION ${this} the text run at ${childPath.toString()} ` +
                    `resolves to more than one style link, but style links are ` +
                    `EXCLUSIVE (styleLinkProperties@ is the full story): ` +
                    `${ids.join(", ")} — using the innermost.`,
            );
        return ids[0] ?? null;
    }

    _styleLinkPropertiesHandler(): any {
        if (this._styleLinkPropertiesHandlerImpl === null)
            this._styleLinkPropertiesHandlerImpl =
                this.widgetBus.wrapper.getProtocolHandlerImplementation(
                    "styleLinkProperties@",
                    null,
                );
        return this._styleLinkPropertiesHandlerImpl;
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

    /** Compose ONE textblock (all its logical paragraphs) and publish
     *  composition@<textblockPath> — replacing any previous entry.
     *  Called by the meta element after its scope settled.
     *  nodePropertiesPayload: the element's FRESH scope component
     *  (answers .getProperties()). newState: the cycle's state (for
     *  the gate and the font). styleResolution: the meta element's
     *  per-run style context (per-run style spans); null = every leaf
     *  resolves unstyled. */
    composeTextblock(
        textblockPath: Path,
        textblockNode: any,
        nodePropertiesPayload: any,
        newState: any,
        styleResolution: StyleResolutionContext | null = null,
    ) {
        const textblockPathString = textblockPath.toString(),
            nodePropertiesEarly = nodePropertiesPayload.getProperties(),
            // OFF MODE gate: engagement IS the algorithm selection —
            // the resolved "None (Browser)" type means explicitly off
            // (inheritable, per textblock; empty = inherit, the root
            // default algorithm applies via the registered property)
            enabled =
                nodePropertiesEarly.get(
                    "textCompositionAlgorithm/algorithm",
                ) !== "TextCompositionAlgorithmNoneModel";
        if (!enabled) {
            // OFF MODE: unpublish (notifies consumers — null IS off
            // mode; the attachment re-renders uncomposed)
            this.unpublishTextblock(textblockPathString);
            return;
        }
        if (this._measurer === null) {
            // warn once (not per textblock per cycle — this spams
            // test output, where the capability fallback is the norm)
            if (!this._noHarfbuzzWarned) {
                this._noHarfbuzzWarned = true;
                console.warn(
                    `${this} no harfbuzz module available — composition is OFF.`,
                );
            }
            return;
        }

        const markSpec =
            styleResolution !== null && styleResolution.hasTypeSpecStyling
                ? getEntry(
                      newState,
                      this._layoutRootPath().append(
                          "proseMirrorSchema",
                          "marks",
                      ),
                      null,
                  )
                : null;
        const leaves: CompositionLeaf[] = [],
            items = this._buildInlineItems(
                textblockNode,
                textblockPath,
                leaves,
                styleResolution,
                markSpec,
            ),
            leafTexts = this._leafTexts(items),
            logicalParagraphs = assembleLogicalParagraphs(items),
            // the app root font object (fallback when the typeSpec
            // cascade has no own font — the typeSpecGetFontMethod
            // pattern, type-spec.typeroof.jsx:75-84)
            rootFont = (getEntry(newState, Path.fromString("/font")) as any)
                .value,
            // Line width + font size from the FRESH nodeProperties
            // scope — never from DOM measurement
            nodeProperties = nodePropertiesEarly,
            // the font OBJECT from the properties stream
            // (specific/font, inherited via the typeSpecnion cascade)
            font = nodeProperties.get(`${SPECIFIC}font`) ?? rootFont,
            availableWidth = nodeProperties.get(`${LAYOUT}availableWidth`),
            fontSize = nodeProperties.get(`${GENERIC}fontSize`),
            lineWidthPt =
                typeof availableWidth === "number" ? availableWidth : 480,
            fontSizePt = typeof fontSize === "number" ? fontSize : 12,
            // measurement inputs at the TRUE location (Sprint A);
            // v1 keeps them uniform per textblock — per-RUN values
            // come with per-run style spans
            axesEntries = axesEntriesOf(font, nodeProperties),
            axesKey = axesKeyOf(font, nodeProperties),
            featuresEntries = featuresEntriesOf(nodeProperties),
            featuresKey = featuresKeyOf(nodeProperties),
            language = nodeProperties.get("language/lang") ?? null,
            directionRaw = nodeProperties.get(`${GENERIC}direction`),
            // algorithm selection + configuration, resolved per
            // textblock (the dynamic struct, yielded by
            // textCompositionGen; absent = the default algorithm)
            algorithmKey =
                nodeProperties.get("textCompositionAlgorithm/algorithm") ??
                "TextCompositionAlgorithmGreedyRaggedModel",
            algorithmConfig =
                algorithmKey === "TextCompositionAlgorithmDummyModel"
                    ? (nodeProperties.get(
                          "textCompositionAlgorithm/segmentsPerLine",
                      ) ?? 4)
                    : null,
            direction =
                directionRaw === "ltr" || directionRaw === "rtl"
                    ? directionRaw
                    : null;

        // Hyphenation (milestone 3, phase 4): a Host control PRIOR to
        // measurement/line breaking — it changes the input, not the
        // algorithm. The config is inheritable (empty = inherit;
        // unresolved fields fall back to the defaults). The pattern
        // object comes from the session-only state dependency (loaded
        // async on demand via the ResourceRequirement machinery);
        // BCP47 language -> pattern key with fallbacks (de-AT -> de,
        // en -> en-us). No language or an unmapped language = no
        // hyphenation.
        const hyphenationEnabled =
                nodeProperties.get("hyphenation/enabled") ?? true,
            hyphenationConfig: HyphenationConfig = {
                minWordLength:
                    nodeProperties.get("hyphenation/minWordLength") ??
                    HYPHENATION_DEFAULTS.minWordLength,
                minBefore:
                    nodeProperties.get("hyphenation/minBefore") ??
                    HYPHENATION_DEFAULTS.minBefore,
                minAfter:
                    nodeProperties.get("hyphenation/minAfter") ??
                    HYPHENATION_DEFAULTS.minAfter,
            },
            hyphenationPatternKey =
                hyphenationEnabled && typeof language === "string"
                    ? languageToHyphenationPatternKey(language)
                    : null,
            installedPatterns =
                hyphenationPatternKey !== null
                    ? (getEntry(
                          newState,
                          Path.fromString("/installedHyphenationPatterns"),
                          null,
                      ) as any)
                    : null,
            hyphenationPattern =
                installedPatterns !== null &&
                installedPatterns.has(hyphenationPatternKey)
                    ? installedPatterns.get(hyphenationPatternKey).value
                    : null;
        let hypher: any = null;
        if (hyphenationPattern !== null) {
            hypher = this._hyphers.get(hyphenationPattern);
            if (hypher === undefined) {
                hypher = new Hypher(hyphenationPattern);
                this._hyphers.set(hyphenationPattern, hypher);
            }
        }

        if (typeof availableWidth !== "number" || typeof fontSize !== "number")
            console.warn(
                `${this} missing node properties for ${textblockPathString} ` +
                    `(availableWidth=${availableWidth}, fontSize=${fontSize}) ` +
                    `— using fallbacks ${lineWidthPt}pt / ${fontSizePt}pt.`,
            );

        // Per-run style spans: the measurement tuple per leaf. The
        // textblock's values (above) are the fallback for unstyled
        // leaves; a styled leaf's resolved values come from its
        // exclusive styleLinkProperties@ entry — the registered
        // StyleLinkLiveProperties, read the same way
        // UIDocumentStyleStyler reads it (typeSpec cascade + patch
        // merged, font-dependent synthetics pre-resolved).
        const textblockStyle: LeafStyle = {
                font,
                axesEntries,
                axesKey,
                featuresEntries,
                featuresKey,
                language,
                direction,
                fontSizePt,
            },
            styleLinkHandler = this._styleLinkPropertiesHandler(),
            leafStyles: (LeafStyle | null)[] = leaves.map((leaf) => {
                if (
                    leaf.styleLinkPropertiesId === null ||
                    styleLinkHandler === null ||
                    !styleLinkHandler.hasRegistered(leaf.styleLinkPropertiesId)
                )
                    return null;
                const payload = styleLinkHandler.getRegistered(
                        leaf.styleLinkPropertiesId,
                    ),
                    properties = payload.typeSpecnion.getProperties(),
                    leafFont = properties.get(`${SPECIFIC}font`) ?? font,
                    leafFontSize = properties.get(`${GENERIC}fontSize`),
                    leafDirectionRaw = properties.get(`${GENERIC}direction`);
                return {
                    font: leafFont,
                    axesEntries: axesEntriesOf(leafFont, properties),
                    axesKey: axesKeyOf(leafFont, properties),
                    featuresEntries: featuresEntriesOf(properties),
                    featuresKey: featuresKeyOf(properties),
                    language: properties.get("language/lang") ?? language,
                    direction:
                        leafDirectionRaw === "ltr" || leafDirectionRaw === "rtl"
                            ? leafDirectionRaw
                            : direction,
                    fontSizePt:
                        typeof leafFontSize === "number"
                            ? leafFontSize
                            : fontSizePt,
                };
            }),
            styleOf = (sourceIndex: number): LeafStyle =>
                leafStyles[sourceIndex] ?? textblockStyle;

        // Justification potentials + the Treatment Planner (milestone
        // 4): Host policy, engaged whenever a font has potentials —
        // algorithms that only probe step 0 (dummy, greedy-ragged)
        // see no difference (step 0 = natural width). Per leaf style:
        // the discovered table, the resolved potentials leaf, the
        // stepper and the natural space advance (the wordspace factor
        // multiplies it; the applicator applies the same product).
        // The planner config (treatment toggles, direction) resolves
        // from the greedy-fit algorithm struct; colorCoding is the
        // switch for the color-coded lines (published for the
        // applicator).
        const greedyFitConfig:
                | (TreatmentPlannerConfig & { colorCoding: boolean })
                | null =
                algorithmKey === "TextCompositionAlgorithmGreedyFitModel"
                    ? {
                          treatments: new Set<string>(
                              (
                                  [
                                      ["treatmentXTRA", "XTRA"],
                                      ["treatmentTracking", "tracking"],
                                      ["treatmentWordspace", "wordspace"],
                                  ] as [string, string][]
                              )
                                  .filter(
                                      ([field]) =>
                                          (nodeProperties.get(
                                              `textCompositionAlgorithm/${field}`,
                                          ) ?? true) === true,
                                  )
                                  .map(([, treatment]) => treatment),
                          ),
                          direction: (
                              ["both", "narrowing", "widening"] as const
                          ).includes(
                              nodeProperties.get(
                                  "textCompositionAlgorithm/direction",
                              ),
                          )
                              ? (nodeProperties.get(
                                    "textCompositionAlgorithm/direction",
                                ) as "both" | "narrowing" | "widening")
                              : "both",
                          colorCoding:
                              (nodeProperties.get(
                                  "textCompositionAlgorithm/colorCoding",
                              ) ?? true) === true,
                      }
                    : null,
            plannerConfig =
                greedyFitConfig === null
                    ? TREATMENT_PLANNER_DEFAULTS
                    : greedyFitConfig,
            plannerCache = new Map<LeafStyle, any>(),
            plannerOf = (style: LeafStyle): any => {
                if (!plannerCache.has(style)) {
                    const table = discoverPotentials(style.font);
                    let entry = null;
                    if (table !== null) {
                        const location = new Map(style.axesEntries),
                            // re-anchored to the run's location (the
                            // tables are avar1-authored; avar2 fonts
                            // sit elsewhere — the potentials express
                            // deltas from the natural state)
                            potentials = anchorPotentialsToLocation(
                                calculatePotentials(table, location),
                                location,
                                style.font.axisRanges,
                            );
                        entry = {
                            table,
                            potentials,
                            stepper: createTreatmentStepper(
                                potentials,
                                plannerConfig,
                            ),
                            spaceAdvancePt:
                                this._measurer!.measureEm(
                                    style.font,
                                    style.axesEntries,
                                    style.axesKey,
                                    style.featuresEntries,
                                    style.featuresKey,
                                    style.language,
                                    style.direction,
                                    " ",
                                ) * style.fontSizePt,
                        };
                    }
                    plannerCache.set(style, entry);
                }
                return plannerCache.get(style);
            };

        // Input-equality filter (the property-aware reframe: what we
        // CONSUME is what invalidates — no hand-maintained relevance
        // list). Purity guarantees same input => same output, so an
        // unchanged ingredient set skips recompose+republish entirely
        // (no setUpdated: consumers keep their applied state). E.g. a
        // backgroundColor edit rebuilds the scope but changes nothing
        // below.
        const ingredients: unknown[] = [
                font,
                algorithmKey,
                algorithmConfig,
                axesKey,
                featuresKey,
                language,
                direction,
                fontSizePt,
                lineWidthPt,
                // hyphenation: the resolved config + the pattern
                // OBJECT (identity covers key + content; a pattern
                // arriving async invalidates by identity)
                hyphenationEnabled,
                hyphenationConfig.minWordLength,
                hyphenationConfig.minBefore,
                hyphenationConfig.minAfter,
                hyphenationPattern,
                // the Treatment Planner config (greedy-fit):
                // treatment toggles + direction gate the step values;
                // colorCoding flows into the payload
                ...(greedyFitConfig === null
                    ? []
                    : [
                          [...plannerConfig.treatments].sort().join(","),
                          plannerConfig.direction,
                          greedyFitConfig.colorCoding,
                      ]),
                // per-run styles: the resolved link id + the CONSUMED
                // values per leaf (flat — nulls for unstyled leaves;
                // a patch edit that changes any consumed value
                // invalidates, one that changes nothing doesn't)
                ...leaves.flatMap((leaf, index): unknown[] => {
                    const style = leafStyles[index];
                    return style === null || style === undefined
                        ? [leaf.styleLinkPropertiesId]
                        : [
                              leaf.styleLinkPropertiesId,
                              style.font,
                              style.axesKey,
                              style.featuresKey,
                              style.language,
                              style.direction,
                              style.fontSizePt,
                              // justification potentials: the
                              // discovered table (identity; null =
                              // no potentials for this font)
                              plannerOf(styleOf(index))?.table ?? null,
                          ];
                }),
                // content: the assembled leaf texts (typing always
                // invalidates; cheap string compare at this scale)
                leafTexts.join("\u0001"),
            ],
            previous = this._ingredients.get(textblockPathString);
        if (
            previous !== undefined &&
            previous.length === ingredients.length &&
            previous.every((value, index) => value === ingredients[index])
        )
            return;
        this._ingredients.set(textblockPathString, ingredients);

        const paragraphs = logicalParagraphs.map((logicalParagraph) => {
                let { segments, breaks } = logicalParagraph;
                if (hypher !== null)
                    // the Hyphenator: splits word segments at
                    // hyphenation points, adds 'hyphen' break
                    // opportunities (the Algorithm can't tell a word
                    // boundary from a hyphen point)
                    ({ segments, breaks } = hyphenateSegments(
                        segments,
                        breaks,
                        leafTexts,
                        hypher,
                        hyphenationConfig,
                    ));
                // the hyphen glyph's width per leaf style (the hyphen
                // renders in the run's font/style), baked into the
                // segments BEFORE hyphen breaks below (the hyphen is
                // not in the source text; CSS ::after renders it)
                const hyphenWidthOf = (() => {
                    const widths = new Map<LeafStyle, number>();
                    return (style: LeafStyle): number => {
                        let width = widths.get(style);
                        if (width === undefined) {
                            width =
                                this._measurer!.measureEm(
                                    style.font,
                                    style.axesEntries,
                                    style.axesKey,
                                    style.featuresEntries,
                                    style.featuresKey,
                                    style.language,
                                    style.direction,
                                    "-",
                                ) * style.fontSizePt;
                            widths.set(style, width);
                        }
                        return width;
                    };
                })();
                // measure: fill widthPt in place (segments are
                // fresh), each at ITS leaf's style (per-run style
                // spans; unstyled leaves use the textblock style)
                for (const segment of segments) {
                    const style = styleOf(segment.sourceIndex);
                    segment.widthPt =
                        this._measurer!.measureEm(
                            style.font,
                            style.axesEntries,
                            style.axesKey,
                            style.featuresEntries,
                            style.featuresKey,
                            style.language,
                            style.direction,
                            leafTexts[segment.sourceIndex]?.slice(
                                segment.start,
                                segment.end,
                            ) ?? "",
                        ) *
                            style.fontSizePt +
                        (segment.hyphenAfter === true && hypher !== null
                            ? hyphenWidthOf(style)
                            : 0);
                }
                const widthOf = (from: number, to: number) => {
                        let width = 0;
                        for (let i = from; i < to; i++)
                            width += segments[i]!.widthPt;
                        return width;
                    },
                    algorithm =
                        algorithmKey === "TextCompositionAlgorithmDummyModel"
                            ? createDummyComposition(algorithmConfig as number)
                            : algorithmKey ===
                                "TextCompositionAlgorithmGreedyFitModel"
                              ? greedyFitComposition
                              : greedyRaggedComposition,
                    result = algorithm({
                        segments,
                        breaks,
                        lineWidthPt: () => lineWidthPt,
                        // The Treatment Planner (milestone 4): step 0
                        // is the natural width; step != 0 re-measures
                        // axes treatments at the shifted coords and
                        // adds the tracking/wordspace deltas
                        // (arithmetically). Algorithms that only probe
                        // step 0 see no difference.
                        lineWidthAtStep: (from, to, step) => {
                            if (step === 0) return widthOf(from, to);
                            let width = 0;
                            for (let i = from; i < to; i++) {
                                const segment = segments[i]!,
                                    style = styleOf(segment.sourceIndex),
                                    entry = plannerOf(style),
                                    text =
                                        leafTexts[segment.sourceIndex]?.slice(
                                            segment.start,
                                            segment.end,
                                        ) ?? "";
                                if (entry === null || entry === undefined) {
                                    width += segment.widthPt;
                                    continue;
                                }
                                const axes = entry.stepper.axesAt(step),
                                    stepAxesEntries: [string, number][] =
                                        axes.size === 0
                                            ? style.axesEntries
                                            : style.axesEntries.map(
                                                  ([tag, value]) =>
                                                      axes.has(tag)
                                                          ? [
                                                                tag,
                                                                axes.get(tag)!,
                                                            ]
                                                          : [tag, value],
                                              ),
                                    stepAxesKey =
                                        axes.size === 0
                                            ? style.axesKey
                                            : axesKeyOfEntries(
                                                  style.font,
                                                  stepAxesEntries,
                                              ),
                                    measuredPt =
                                        this._measurer!.measureEm(
                                            style.font,
                                            stepAxesEntries,
                                            stepAxesKey,
                                            style.featuresEntries,
                                            style.featuresKey,
                                            style.language,
                                            style.direction,
                                            text,
                                        ) * style.fontSizePt;
                                let segmentWidth =
                                    measuredPt +
                                    entry.stepper.letterSpacingPtAt(step) *
                                        (segment.end - segment.start);
                                // the hyphen glyph at the shifted coords
                                if (
                                    segment.hyphenAfter === true &&
                                    hypher !== null
                                )
                                    segmentWidth +=
                                        this._measurer!.measureEm(
                                            style.font,
                                            stepAxesEntries,
                                            stepAxesKey,
                                            style.featuresEntries,
                                            style.featuresKey,
                                            style.language,
                                            style.direction,
                                            "-",
                                        ) * style.fontSizePt;
                                // wordspace: the factor multiplies the
                                // NATURAL space advance (space-only
                                // segments) — the applicator applies
                                // the same product as CSS word-spacing
                                const factor =
                                    entry.stepper.wordSpaceFactorAt(step);
                                if (
                                    factor !== 0 &&
                                    text.length > 0 &&
                                    text.trim() === ""
                                )
                                    segmentWidth +=
                                        entry.spaceAdvancePt * factor;
                                width += segmentWidth;
                            }
                            return width;
                        },
                    });
                return { segments, result };
            }),
            payload = {
                textblockPath: textblockPathString,
                // leaf inline items (text runs and atoms) in
                // sourceIndex order — applicators find their segments
                // by their own document-node path. Each leaf carries
                // its justification-potentials data (null = none):
                // the applicator derives per-line treatment values
                // deterministically from the line's adjustmentStep +
                // this data, so every fragment of a line applies
                // identical values for its own style.
                leaves: leaves.map((leaf, index) => {
                    const entry = plannerOf(styleOf(index));
                    return {
                        ...leaf,
                        treatment:
                            entry === null || entry === undefined
                                ? null
                                : {
                                      axesEntries: styleOf(index).axesEntries,
                                      potentials: entry.potentials,
                                      spaceAdvancePt: entry.spaceAdvancePt,
                                  },
                    };
                }),
                paragraphs,
                // the Treatment Planner configuration (the applicator
                // applies the same enabled-treatments/direction)
                treatmentConfig: {
                    treatments: [...plannerConfig.treatments],
                    direction: plannerConfig.direction,
                },
                // the switch for the color-coded lines (adjustment
                // intensity; the greedy-fit struct, default ON)
                colorCoding: greedyFitConfig?.colorCoding ?? false,
                // immutable sources for apply-time staleness checks
                sources: { textblockNode },
            },
            identifier = `composition@${textblockPathString}`,
            handler = this._compositionHandler();
        if (this._registrations.has(textblockPathString)) {
            this._registrations.get(textblockPathString)!();
            this._registrations.delete(textblockPathString);
        }
        this._registrations.set(
            textblockPathString,
            handler.register(identifier, payload),
        );
        handler.setUpdated(identifier);
        // live feedback until the applicator makes it visible
        console.log(
            `${this} published ${identifier}:`,
            paragraphs.map(
                ({ result }) =>
                    `${result.lines.length} lines ` +
                    `(overfull: ${result.diagnostics.overfullLines.length})`,
            ),
        );
    }

    /** Unpublish a textblock (node deleted/re-typed) and notify
     *  consumers: setUpdated after unregister delivers [true, null]
     *  — null IS off mode. */
    unpublishTextblock(textblockPathString: string) {
        if (!this._registrations.has(textblockPathString)) return;
        this._registrations.get(textblockPathString)!();
        this._registrations.delete(textblockPathString);
        this._ingredients.delete(textblockPathString);
        this._compositionHandler().setUpdated(
            `composition@${textblockPathString}`,
        );
    }

    destroy() {
        for (const unregister of this._registrations.values()) unregister();
        this._registrations.clear();
        // _BaseComponent destroy default is a no-op.
    }
}
