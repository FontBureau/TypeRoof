/**
 * recursive helper function for _fillTree
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
