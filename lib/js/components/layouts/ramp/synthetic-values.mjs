import { _AbstractSimpleOrEmptyModel } from "../../../metamodel.mjs";

/**
 * Note: this kind of replaces DependentValue of Animanion as
 * it can also be used to define aliases, e.g:
 *  yield [`axesLocations/opsz`,  new SyntheticValue(identity, [`${GENERIC}fontSize`]];
 *  and from the look of it that's what DependentValue in Animanion
 * basically did. It can also do more,  e.g. represent a calculation
 * of pre-existing values. And we do the full dependency graph resolution
 * in here, it seems, after all simple to comprehend.
 */
export class SyntheticValue {
    constructor(fn, dependencies) {
        // NOTE: actually e.g. if the fn arguments is variable length, with
        // a ...rest parameter, zero-length arguments can make sense.
        // if(!dependencies.length)
        //     throw new Error(`VALUE ERROR dependencies can't be empty.`);
        Object.defineProperties(this, {
            fn: { value: fn },
            dependencies: { value: Object.freeze(Array.from(dependencies)) },
        });
    }
    toString() {
        return `[SyntheticValue ${this.dependencies.join(", ")}]`;
    }
    call(...args) {
        return this.fn(...args);
    }
}

export const PATH_SPEC_AUTO_LINEAR_LEADING = [
    [
        ["a", "b"],
        ["leading", "lineWidth"],
    ],
    [["minLeading", "maxLeading"]],
];

/**
 * This only yields (flattens) the full path described in a pathSpec
 *
 * PathSpec is e.g.: PATH_SPEC_AUTO_LINEAR_LEADING
 */
export function* pathSpecPathsGen(pathSpec, prefix) {
    function getLeave(path /*, cursor*/) {
        return path;
    }
    for (const spec of pathSpec)
        yield* _pathSpecGen(getLeave, null, [prefix], spec);
}

/**
 *  This reads from a metamodel instance according to pathSpec.
 *
 * PathSpec is e.g.: PATH_SPEC_AUTO_LINEAR_LEADING
 */
export function* pathSpecValuesGen(pathSpec, prefix, data) {
    function nextNode(cursor, key) {
        return cursor.get(key);
    }
    function getLeave(path, cursor) {
        return [path.join("/"), cursor.value];
    }
    for (const spec of pathSpec)
        yield* _pathSpecGen(getLeave, nextNode, [prefix], spec, data);
}

/**
 * recursive helper function for fillTreeFromPaths
 */
function _fillTreeGetNodeFromRegistry(registry, path) {
    const fullNodeKey = path.join("/");
    let node = registry.get(fullNodeKey);
    if (!node) {
        node = {};
        registry.set(fullNodeKey, node);
        const key = path.at(-1),
            parent = _fillTreeGetNodeFromRegistry(registry, path.slice(0, -1));
        parent[key] = node;
    }
    return node;
}

/**
 * Put a flat list of paths into a nested object, setting the leaves
 * to values from valuesMap.
 */
export function fillTreeFromPaths(prefix, paths, valuesMap) {
    const registry = new Map([[prefix, {}]]);
    for (const path of paths) {
        const fullKey = path.join("/"),
            lastKey = path.at(-1);
        const parent = _fillTreeGetNodeFromRegistry(
            registry,
            path.slice(0, -1),
        );
        if (!valuesMap.has(fullKey))
            throw new Error(
                `KEY ERROR fillTreeFromPaths "${fullKey}" is not in valuesMap.`,
            );
        parent[lastKey] = valuesMap.get(fullKey);
    }
    return registry.get(prefix);
}

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
function* _pathSpecGen(
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
