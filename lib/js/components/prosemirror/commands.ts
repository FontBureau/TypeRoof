import type { Attrs, MarkType, Node } from "prosemirror-model";
import { SelectionRange } from "prosemirror-state";
import type {
    Command,
    EditorState,
    TextSelection,
    Transaction,
} from "prosemirror-state";

/**
 * Internal helpers – adapted from prosemirror-commands/src/commands.ts
 * (these are not exported by the package)
 */

function markApplies(
    doc: Node,
    ranges: readonly SelectionRange[],
    type: MarkType,
    enterAtoms: boolean,
): boolean {
    for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i]!;
        const { $from, $to } = range;
        let can: boolean =
            $from.depth === 0
                ? doc.inlineContent && doc.type.allowsMarkType(type)
                : false;
        doc.nodesBetween($from.pos, $to.pos, (node: Node, pos: number) => {
            if (
                can ||
                (!enterAtoms &&
                    node.isAtom &&
                    node.isInline &&
                    pos >= $from.pos &&
                    pos + node.nodeSize <= $to.pos)
            )
                return false;
            can = node.inlineContent && node.type.allowsMarkType(type);
        });
        if (can) return true;
    }
    return false;
}

function removeInlineAtoms(
    ranges: readonly SelectionRange[],
): readonly SelectionRange[] {
    const result: SelectionRange[] = [];
    for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i]!;
        let { $from } = range;
        const { $to } = range;
        $from.doc.nodesBetween(
            $from.pos,
            $to.pos,
            (node: Node, pos: number) => {
                if (
                    node.isAtom &&
                    node.content.size &&
                    node.isInline &&
                    pos >= $from.pos &&
                    pos + node.nodeSize <= $to.pos
                ) {
                    if (pos + 1 > $from.pos)
                        result.push(
                            new SelectionRange(
                                $from,
                                $from.doc.resolve(pos + 1),
                            ),
                        );
                    $from = $from.doc.resolve(pos + 1 + node.content.size);
                    return false;
                }
            },
        );
        if ($from.pos < $to.pos) result.push(new SelectionRange($from, $to));
    }
    return result;
}

function attrsEqual(a: Attrs | null, b: Attrs | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => a[k] === b[k]);
}

/**
 * hasMarkWithAttrs – rangeHasMark variant that also checks attribute equality
 */

function hasMarkWithAttrs(
    doc: Node,
    from: number,
    to: number,
    markType: MarkType,
    attrs: Attrs | null,
): boolean {
    if (!doc.rangeHasMark(from, to, markType)) return false;
    let allMatch = true;
    doc.nodesBetween(from, to, (node: Node) => {
        if (!allMatch) return false;
        const mark = markType.isInSet(node.marks);
        if (mark && !attrsEqual(mark.attrs, attrs)) {
            allMatch = false;
            return false;
        }
    });
    return allMatch;
}

/**
 * toggleMark – drop-in replacement for prosemirror-commands toggleMark
 *
 * The only behavioural difference: when markType is already present in the
 * selection but with *different* attributes, the original command only removes
 * the old mark (requiring a second invocation to add the new one). This version
 * removes the old mark AND adds the new one in a single transaction, making
 * attribute-switching a one-click operation.
 */

export function toggleMark(
    markType: MarkType,
    attrs: Attrs | null = null,
    options?: {
        removeWhenPresent?: boolean;
        enterInlineAtoms?: boolean;
        includeWhitespace?: boolean;
    },
): Command {
    const removeWhenPresent = (options && options.removeWhenPresent) !== false;
    const enterAtoms = (options && options.enterInlineAtoms) !== false;
    const dropSpace = !(options && options.includeWhitespace);

    return function (
        state: EditorState,
        dispatch: ((tr: Transaction) => void) | undefined,
    ): boolean {
        const { empty, $cursor, ranges } = state.selection as TextSelection;
        if (
            (empty && !$cursor) ||
            !markApplies(state.doc, ranges, markType, enterAtoms)
        )
            return false;

        if (dispatch) {
            if ($cursor) {
                // Cursor (no selection) → stored marks
                const existing = markType.isInSet(
                    state.storedMarks || $cursor.marks(),
                );
                if (existing) {
                    const tr = state.tr.removeStoredMark(markType);
                    if (!attrsEqual(existing.attrs, attrs))
                        tr.addStoredMark(markType.create(attrs));
                    dispatch(tr);
                } else {
                    dispatch(state.tr.addStoredMark(markType.create(attrs)));
                }
            } else {
                // Non-empty selection
                let add: boolean;
                const tr = state.tr;
                const ranges_ = enterAtoms ? ranges : removeInlineAtoms(ranges);

                if (removeWhenPresent) {
                    // Only consider the mark "present" when attrs also match.
                    // If the mark type is there but with different attrs we
                    // still remove + add (switch) instead of just removing.
                    add = true;
                    for (const r of ranges_) {
                        if (
                            hasMarkWithAttrs(
                                state.doc,
                                r.$from.pos,
                                r.$to.pos,
                                markType,
                                attrs,
                            )
                        ) {
                            add = false;
                            break;
                        }
                    }
                } else {
                    add = true;
                    for (const r of ranges_) {
                        let missing = false;
                        tr.doc.nodesBetween(
                            r.$from.pos,
                            r.$to.pos,
                            (node: Node, pos: number, parent: Node | null) => {
                                if (missing) return false;
                                missing =
                                    !markType.isInSet(node.marks) &&
                                    !!parent &&
                                    parent.type.allowsMarkType(markType) &&
                                    !(
                                        node.isText &&
                                        /^\s*$/.test(
                                            node.textBetween(
                                                Math.max(0, r.$from.pos - pos),
                                                Math.min(
                                                    node.nodeSize,
                                                    r.$to.pos - pos,
                                                ),
                                            ),
                                        )
                                    );
                            },
                        );
                        if (missing) {
                            add = false;
                            break;
                        }
                    }
                }

                for (const r of ranges_) {
                    if (!add) {
                        tr.removeMark(r.$from.pos, r.$to.pos, markType);
                    } else {
                        let from = r.$from.pos;
                        let to = r.$to.pos;
                        const start = r.$from.nodeAfter;
                        const end = r.$to.nodeBefore;
                        const spaceStart =
                            dropSpace && start && start.isText
                                ? /^\s*/.exec(start.text!)![0].length
                                : 0;
                        const spaceEnd =
                            dropSpace && end && end.isText
                                ? /\s*$/.exec(end.text!)![0].length
                                : 0;
                        if (from + spaceStart < to) {
                            from += spaceStart;
                            to -= spaceEnd;
                        }
                        tr.addMark(from, to, markType.create(attrs));
                    }
                }
                dispatch(tr.scrollIntoView());
            }
        }
        return true;
    };
}
