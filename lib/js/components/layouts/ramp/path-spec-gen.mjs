import { _AbstractSimpleOrEmptyModel } from "../../../metamodel.mjs";

/**
 * It looks so far to be *very* nice to calculate line-heigth-em/autoLinearLeading
 * in the properties directly instead of later where the value is used.
 * This way, we can use the value for other synthetic properties and the
 * calculation is at a central point instead of per user.
 *
 * This has implications on how we'll propagate parametric typography
 * in the future.
 *
 * PathSpec is e.g.: PATH_SPEC_AUTO_LINEAR_LEADING
 */
export function* _pathSpecGen(
    getLeave,
    nextNode,
    parentPath,
    pathSpec,
    cursor = null,
) {
    if (!pathSpec.length) {
        if (!(cursor instanceof _AbstractSimpleOrEmptyModel && cursor.isEmpty))
            yield getLeave(parentPath, cursor);
        return;
    }
    const [head, ...tail] = pathSpec,
        keys =
            typeof head === "function"
                ? head(cursor) // to generate the keys for the items of a list, see PATH_SPEC_EXPLICIT_DIMENSION
                : head;
    for (const key of keys) {
        const nextCursor = nextNode ? nextNode(cursor, key) : null,
            path = [...parentPath, key];
        yield* _pathSpecGen(getLeave, nextNode, path, tail, nextCursor);
    }
}
