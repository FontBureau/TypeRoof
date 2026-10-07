/**
 * composition-plugin.ts — the ProseMirror editor applicator for
 * text-composition (Phase 3 of plan
 * thoughts/plans/2026-10-07-1223-prosemirror-composition-decorations.md).
 *
 * Consumes composition@<textblockPath> payloads from the composition
 * controller (via its component-agnostic observe/subscribe API,
 * composition-controller.ts:446-538) and renders them as decorations:
 *
 *   - one Decoration.inline per (line × leaf) fragment — classes and
 *     style props from the SHARED line-attrs module (identical values
 *     to the viewer applicator), honoring the fragment rules PM's
 *     decoration splitting makes load-bearing: `line-first` only on a
 *     line's first fragment, `line-hyphen` only on its last;
 *   - one Decoration.node per composed textblock carrying
 *     `.typeroof-composed` (white-space: nowrap + overflow-x,
 *     line-spans.css) — the browser must not soft-wrap, the forced
 *     breaks are the only breaks.
 *
 * Key design points (from the plan's Key Discoveries):
 *   - Stale-during-typing: the StateField MAPS the DecorationSet
 *     through document changes (drift is fine), the controller
 *     republishes asynchronously and the publication replaces the
 *     textblock's decorations via set.find(range)/remove/add — no
 *     decoration objects are retained across transactions.
 *   - Trap-1: ProseMirror.update() re-creates EditorState via
 *     EditorState.create (NOT reconfigure), which re-initializes this
 *     field to DecorationSet.empty. The plugin view (survives: the
 *     plugins array is unchanged) detects the reset and republishes
 *     from its payload cache.
 *   - Publications are applied in a microtask (coalesced, one
 *     dispatch per flush) to avoid dispatch-during-dispatch when the
 *     controller publishes from inside a cascade.
 *   - Staleness: a payload is applied only while its captured
 *     sources.textblockNode IS (===) the current metamodel textblock
 *     (the controller's race-free protocol; metamodel immutables are
 *     replaced wholesale on change).
 *   - OFF MODE: a null payload removes the textblock's decorations
 *     (absence of composition costs nothing to render).
 */
import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";

import {
    resolvePathToPos,
    buildPathToPosMap,
    payloadFragmentRanges,
    type CompositionPayload,
    type PathResolver,
} from "./composition-positions.ts";
import {
    lineSpanClasses,
    lineSpanStyles,
    potentialsLineColorCode,
    kpLineColorCode,
} from "../layouts/type-stage/text-composition/line-attrs.ts";

export const editorCompositionPluginKey = new PluginKey<DecorationSet>(
    "editorComposition",
);

/** Minimal consumption surface of the composition controller
 *  (composition-controller.ts observe/subscribe API). */
export interface CompositionControllerInterface {
    observe(
        path: string,
        callback: (payload: CompositionPayload | null) => void,
    ): () => void;
    subscribe(path: string, token: unknown): () => void;
}

export interface CompositionPluginContext {
    /** Widget lookup for the "compositionController" service (null
     *  fallback: plugin is inert outside type-stage). */
    getWidgetById: (
        id: string,
        defaultValue?: unknown,
    ) => CompositionControllerInterface | null;
    /** Metamodel entry resolution for the staleness check (absolute
     *  document-node paths); identity-compared only. */
    getEntry: (path: string) => unknown;
    /** Absolute model path of the document entry, e.g. "/document". */
    documentPath: string;
}

interface TextblockEntry {
    path: string;
    pos: number;
    node: PMNode;
}

/** All textblocks of the doc with their document-node paths (composition
 *  payloads are per textblock; inline content can't nest textblocks). */
function _textblockEntries(
    doc: PMNode,
    documentPath: string,
): TextblockEntry[] {
    const entries: TextblockEntry[] = [],
        walk = (node: PMNode, contentStart: number, path: string): void => {
            node.forEach((child, childOffset, index) => {
                const childPos = contentStart + childOffset,
                    childPath = `${path}/content/${index}`;
                if (child.isTextblock) {
                    entries.push({
                        path: childPath,
                        pos: childPos,
                        node: child,
                    });
                    return; // inline content: no deeper textblocks
                }
                if (!child.isLeaf) walk(child, childPos + 1, childPath);
            });
        };
    walk(doc, 0, documentPath);
    return entries;
}

/** The decorations for ONE payload (node decoration + all fragments),
 *  or [] when the textblock can't be resolved (structure changed
 *  mid-cycle; the next publication fixes it). */
// Spec tag on every decoration we create: the incremental replacement
// in _flush removes ONLY ours (DecorationSet.find's predicate), never
// foreign decorations (widgets etc.) inside the textblock.
const DECORATION_SPEC = { editorComposition: true };

function _payloadDecorations(
    payload: CompositionPayload,
    resolve: PathResolver,
): Decoration[] {
    const textblock = resolve(payload.textblockPath);
    if (textblock == null) return [];
    const decorations = [
            Decoration.node(
                textblock.pos,
                textblock.pos + textblock.node.nodeSize,
                {
                    class: "typeroof-composed",
                },
                DECORATION_SPEC,
            ),
        ],
        treatmentConfig = {
            treatments: new Set(payload.treatmentConfig.treatments),
            direction: payload.treatmentConfig.direction,
        };
    for (const frag of payloadFragmentRanges(payload, resolve)) {
        const classes = lineSpanClasses({
                isLineStart: frag.isLineStart,
                isParagraphFirstLine: frag.lineIndex === 0,
                isHyphenBreak:
                    frag.isLineEnd && frag.line.breakAt?.kind === "hyphen",
            }),
            diagnostics = frag.result.diagnostics,
            colorCode =
                payload.colorCoding === "potentials"
                    ? potentialsLineColorCode(
                          frag.line.adjustmentStep,
                          diagnostics.overfullLines.includes(frag.lineIndex),
                      )
                    : payload.colorCoding === "kp"
                      ? kpLineColorCode(frag.lineIndex, diagnostics)
                      : "",
            { styles, dataTrackingGaps } = lineSpanStyles({
                treatment: frag.leaf.treatment,
                treatmentConfig,
                adjustmentStep: frag.line.adjustmentStep,
                trackingGaps: Number(
                    frag.line.trackingGapsBySourceIndex?.[frag.leafIndex] ?? 0,
                ),
                colorCode,
            }),
            attrs: Record<string, string> = { class: classes.join(" ") },
            // Empty values are dropped (the CSS custom-property
            // fallback handles absence); the viewer sets them empty.
            style = styles
                .filter(([, value]) => value !== "")
                .map(([prop, value]) => `${prop}: ${value}`)
                .join("; ");
        if (style) attrs.style = style;
        if (dataTrackingGaps !== null)
            attrs["data-tracking-gaps"] = String(dataTrackingGaps);
        decorations.push(
            Decoration.inline(frag.from, frag.to, attrs, DECORATION_SPEC),
        );
    }
    return decorations;
}

export function createEditorCompositionPlugin(
    ctx: CompositionPluginContext,
): Plugin {
    const { documentPath } = ctx;

    class CompositionPluginView {
        private _controller: CompositionControllerInterface | null = null;
        // textblockPath → payload | null (null = OFF MODE)
        private _payloads = new Map<string, CompositionPayload | null>();
        private _unsubscribes = new Map<string, () => void>();
        private _dirtyTextblocks = new Set<string>();
        private _repaintAll = false;
        private _flushScheduled = false;

        constructor(private _view: EditorView) {
            this._controller = ctx.getWidgetById("compositionController", null);
            if (this._controller === null) return; // inert outside type-stage
            this._syncSubscriptions(_view.state.doc);
        }

        private _onPayload(path: string, payload: CompositionPayload | null) {
            // Staleness: apply only while the captured source IS the
            // current metamodel textblock. The path may be gone
            // mid-cycle (structure changed) — getEntry raises then;
            // the publication is stale by definition in that case.
            if (payload !== null) {
                let current;
                try {
                    current = ctx.getEntry(path);
                } catch {
                    return;
                }
                if (payload.sources.textblockNode !== current) return;
            }
            this._payloads.set(path, payload);
            this._dirtyTextblocks.add(path);
            this._scheduleFlush();
        }

        private _syncSubscriptions(doc: PMNode) {
            const controller = this._controller;
            if (controller === null) return;
            const current = new Set(
                _textblockEntries(doc, documentPath).map((e) => e.path),
            );
            for (const [path, unsubscribe] of this._unsubscribes)
                if (!current.has(path)) {
                    unsubscribe();
                    this._unsubscribes.delete(path);
                    this._payloads.delete(path);
                    // Mapped-out decorations of deleted content are
                    // dropped by DecorationSet.map; nothing to remove.
                }
            for (const path of current)
                if (!this._unsubscribes.has(path)) {
                    const unobserve = controller.observe(
                            path,
                            (payload: CompositionPayload | null) =>
                                this._onPayload(path, payload),
                        ),
                        undemand = controller.subscribe(path, this);
                    this._unsubscribes.set(path, () => {
                        unobserve();
                        undemand();
                    });
                }
        }

        private _scheduleFlush() {
            if (this._flushScheduled) return;
            this._flushScheduled = true;
            queueMicrotask(() => {
                this._flushScheduled = false;
                if (!this._view.isDestroyed) this._flush();
            });
        }

        private _flush() {
            const doc = this._view.state.doc;
            let set =
                editorCompositionPluginKey.getState(this._view.state) ??
                DecorationSet.empty;
            if (this._repaintAll) {
                // Whole-document repaint (reset after EditorState
                // re-creation): bulk map-backed resolution.
                this._repaintAll = false;
                const map = buildPathToPosMap(doc, documentPath),
                    resolve: PathResolver = (path) => map.get(path),
                    decorations: Decoration[] = [];
                for (const payload of this._payloads.values())
                    if (payload !== null)
                        decorations.push(
                            ..._payloadDecorations(payload, resolve),
                        );
                set = DecorationSet.create(doc, decorations);
            } else if (this._dirtyTextblocks.size) {
                // Incremental per-textblock replacement: O(one
                // textblock) per publication. find() matches INCLUSIVE
                // boundaries (span.from <= end && span.to >= start), so
                // the raw textblock range would also catch the previous
                // textblock's decorations, which END exactly at pos —
                // shrink the query inward (own decorations: the node
                // deco spans the whole textblock, fragments live
                // strictly inside) and filter by our spec tag.
                for (const path of this._dirtyTextblocks) {
                    const textblock = resolvePathToPos(doc, documentPath, path);
                    if (textblock !== null)
                        set = set.remove(
                            set.find(
                                textblock.pos + 1,
                                textblock.pos + textblock.node.nodeSize - 1,
                                (spec) =>
                                    (spec as { editorComposition?: boolean })
                                        ?.editorComposition === true,
                            ),
                        );
                    const payload = this._payloads.get(path);
                    if (payload != null && textblock !== null) {
                        const resolve: PathResolver = (p) =>
                            resolvePathToPos(doc, documentPath, p);
                        set = set.add(
                            doc,
                            _payloadDecorations(payload, resolve),
                        );
                    }
                }
            } else return;
            this._dirtyTextblocks.clear();
            this._view.dispatch(
                this._view.state.tr.setMeta(editorCompositionPluginKey, set),
            );
        }

        update(view: EditorView, prevState: EditorState) {
            if (this._controller === null) return;
            if (view.state.doc !== prevState.doc)
                this._syncSubscriptions(view.state.doc);
            // Trap-1: EditorState.create (external doc/schema change)
            // re-initialized the field; the plugin view survived.
            const field =
                editorCompositionPluginKey.getState(view.state) ??
                DecorationSet.empty;
            if (
                field === DecorationSet.empty &&
                Array.from(this._payloads.values()).some((p) => p !== null)
            ) {
                this._repaintAll = true;
                this._scheduleFlush();
            }
        }

        destroy() {
            for (const unsubscribe of this._unsubscribes.values())
                unsubscribe();
            this._unsubscribes.clear();
            this._payloads.clear();
            this._dirtyTextblocks.clear();
        }
    }

    return new Plugin({
        key: editorCompositionPluginKey,
        state: {
            init: () => DecorationSet.empty,
            apply: (tr, set) => {
                const replacement = tr.getMeta(editorCompositionPluginKey);
                if (replacement !== undefined) return replacement;
                return tr.docChanged ? set.map(tr.mapping, tr.doc) : set;
            },
        },
        props: {
            decorations(state) {
                return editorCompositionPluginKey.getState(state);
            },
        },
        view: (view) => new CompositionPluginView(view),
    });
}
