/**
 * composition-positions.ts — bridge composition payload addressing to
 * ProseMirror document positions (Phase 2 of plan
 * thoughts/plans/2026-10-07-1223-prosemirror-composition-decorations.md).
 *
 * The composition controller publishes results addressed by
 * document-node path (metamodel list-index paths, "…/content/<i>") and
 * per-leaf UTF-16 code-unit offsets. The editor applicator
 * (composition-plugin.ts) renders them as PM decorations, which need
 * integer PM positions. This module is the pure, DOM-free bridge:
 *
 *   buildPathToPosMap:    PM doc walk → path → {pos, node}
 *                         (O(document); whole-document repaints)
 *   resolvePathToPos:     ONE path → {pos, node}, O(depth × siblings)
 *                         (incremental, per-textblock updates)
 *   payloadFragmentRanges: payload → per (line × leaf) fragment ranges
 *                          in PM positions, one fragment per consecutive
 *                          run of a leaf within the line (the viewer's
 *                         `mySegments` semantics, viewer.typeroof.jsx:797);
 *                          takes a PathResolver so callers choose bulk
 *                          (map-backed) or incremental resolution.
 *
 * POSITION CONVENTIONS (prosemirror-model): `pos` of a node is the
 * position BEFORE it; a LEAF node's content (text chars) starts AT
 * its pos (leaves have no open token); every non-leaf node's content
 * starts at pos+1. The doc node's content starts at 0. Path segments are the child INDEXES in
 * their parent's content — the same keys the metamodel list model and
 * `getPathOfContentIndexes` (integration.typeroof.jsx:103) use.
 */
import type { Node as PMNode } from "prosemirror-model";
import type {
    ComposedLine,
    CompositionResult,
} from "../layouts/type-stage/text-composition/composition-types.ts";
import type { CompositionLeafTreatment } from "../layouts/type-stage/text-composition/line-attrs.ts";

/* Minimal structural view of the published composition@ payload (built
 * at composition-controller.ts:1561-1608; no exported type upstream). */
export interface CompositionPayloadSegment {
    start: number;
    end: number;
    sourceIndex: number;
}
export interface CompositionPayloadLine extends ComposedLine {
    trackingGapsBySourceIndex?: Record<number, number>;
}
export interface CompositionPayloadParagraph {
    segments: CompositionPayloadSegment[];
    result: CompositionResult;
}
export interface CompositionPayloadLeaf {
    path: string | null;
    treatment: CompositionLeafTreatment | null;
}
export interface CompositionPayload {
    textblockPath: string;
    leaves: CompositionPayloadLeaf[];
    paragraphs: CompositionPayloadParagraph[];
    treatmentConfig: {
        treatments: string[];
        direction: "both" | "narrowing" | "widening";
    };
    colorCoding: "potentials" | "kp" | "off";
    sources: { textblockNode: unknown; leafTexts: string[] };
    lineWidthPt: number;
}

export interface PathPosEntry {
    pos: number;
    node: PMNode;
}

/**
 * Resolve ONE document-node path to its PM position — O(depth ×
 * siblings), following the path indexes from the root (`forEach`
 * childOffset carries the cumulative position per level). Cheaper
 * than buildPathToPosMap when only a few paths are needed (e.g. one
 * textblock's leaves after a publication); the full map wins for
 * whole-document repaints. Returns null when the path is malformed,
 * outside `documentPath`, or has no node at any index.
 */
export function resolvePathToPos(
    doc: PMNode,
    documentPath: string,
    path: string,
): PathPosEntry | null {
    if (path === documentPath) return { pos: 0, node: doc };
    if (!path.startsWith(`${documentPath}/`)) return null;
    const parts = path.slice(documentPath.length + 1).split("/");
    if (parts.length === 0 || parts.length % 2 !== 0) return null;
    let node = doc,
        contentStart = 0,
        result: PathPosEntry | null = null;
    for (let i = 0; i < parts.length; i += 2) {
        if (parts[i] !== "content") return null;
        const index = Number(parts[i + 1]);
        if (!Number.isInteger(index) || index < 0) return null;
        // Plain loop (no closure): sums sibling sizes up to the index.
        let offset = 0,
            found: PathPosEntry | null = null;
        for (
            let childIndex = 0, l = node.childCount;
            childIndex < l;
            childIndex++
        ) {
            const child = node.child(childIndex);
            if (childIndex === index) {
                found = { pos: contentStart + offset, node: child };
                break;
            }
            offset += child.nodeSize;
        }
        if (found === null) return null;
        result = found;
        node = found.node;
        contentStart = found.pos + 1;
    }
    // parts.length is even and >= 2 here, so result is always assigned.
    return result;
}

/**
 * Walk a PM doc, mapping every node's document-node path to its
 * position. The map includes the doc node itself at `documentPath`.
 */
export function buildPathToPosMap(
    doc: PMNode,
    documentPath: string,
): Map<string, PathPosEntry> {
    const map = new Map<string, PathPosEntry>([
        [documentPath, { pos: 0, node: doc }],
    ]);
    const walk = (node: PMNode, contentStart: number, path: string): void => {
        node.forEach((child, childOffset, index) => {
            const childPos = contentStart + childOffset,
                childPath = `${path}/content/${index}`;
            map.set(childPath, { pos: childPos, node: child });
            if (!child.isLeaf) walk(child, childPos + 1, childPath);
        });
    };
    walk(doc, 0, documentPath);
    return map;
}

export interface FragmentRange {
    leaf: CompositionPayloadLeaf;
    leafIndex: number;
    line: CompositionPayloadLine;
    lineIndex: number;
    result: CompositionResult;
    /** True when this fragment starts the line (segments[fromSegment]
     *  belongs to this leaf) — the `line-first` rule. */
    isLineStart: boolean;
    /** True when this fragment ends the line (segments[toSegment-1]
     *  belongs to this leaf) — the `line-hyphen` rule. */
    isLineEnd: boolean;
    from: number;
    to: number;
}

/** path → PM position lookup; either `map.get` (bulk repaint via
 *  buildPathToPosMap) or a bound resolvePathToPos (incremental,
 *  per-textblock). */
export type PathResolver = (path: string) => PathPosEntry | null | undefined;

/**
 * Yield one FragmentRange per (line × leaf) fragment, in PM positions.
 * Skips: leaves with null/unknown paths (not part of this doc) and
 * empty fragments (inline atoms contribute start===end, no text).
 * Contiguous same-leaf segments within a line merge into ONE fragment
 * (segments within a line are in reading order, so one leaf appears
 * as one consecutive run).
 */
export function* payloadFragmentRanges(
    payload: CompositionPayload,
    resolve: PathResolver,
): Generator<FragmentRange> {
    for (const { segments, result } of payload.paragraphs) {
        const lines = result.lines as readonly CompositionPayloadLine[];
        for (const [lineIndex, line] of lines.entries()) {
            // Bounds: fromSegment/toSegment index into segments
            // (composition contract).
            const firstSourceIndex = segments[line.fromSegment]!.sourceIndex,
                lastSourceIndex = segments[line.toSegment - 1]!.sourceIndex;
            for (let i = line.fromSegment; i < line.toSegment; ) {
                // Bounds: fromSegment/toSegment index into segments
                // (composition contract), so the indexed reads below
                // are always present.
                const firstOfRun = segments[i]!,
                    sourceIndex = firstOfRun.sourceIndex;
                let j = i + 1;
                while (
                    j < line.toSegment &&
                    segments[j]!.sourceIndex === sourceIndex
                )
                    j++;
                const lastOfRun = segments[j - 1]!,
                    leaf = payload.leaves[sourceIndex],
                    entry =
                        leaf !== undefined && leaf.path !== null
                            ? resolve(leaf.path)
                            : undefined;
                if (leaf !== undefined && entry != null) {
                    // Leaf nodes (text runs): character i sits between
                    // pos+i and pos+i+1 — the first char is AT pos (the
                    // +1 open-token rule is for non-leaf nodes only).
                    const textStart = entry.node.isLeaf
                            ? entry.pos
                            : entry.pos + 1,
                        from = textStart + firstOfRun.start,
                        to = textStart + lastOfRun.end;
                    if (to > from)
                        yield {
                            leaf,
                            leafIndex: sourceIndex,
                            line,
                            lineIndex,
                            result,
                            isLineStart: sourceIndex === firstSourceIndex,
                            isLineEnd: sourceIndex === lastSourceIndex,
                            from,
                            to,
                        };
                }
                i = j;
            }
        }
    }
}
