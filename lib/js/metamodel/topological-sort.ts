import type { FreezableMap, FreezableSet } from "./base-model.ts";
import type { CoherenceFunction } from "./coherence-function.ts";
import type { ForeignKey } from "./foreign-key.ts";
import type {
    _BaseLink,
    InternalizedDependency,
    FallBackValue,
} from "./links.ts";
import type { _BaseModel } from "./base-model.ts";

// Set has no well defined order, we can just remove any item.
// Would be different with an explicitly "OrderedSet".
function setPop<T>(s: Set<T>): T {
    let item: T | undefined;
    // we now know one item, can stop the iterator immediately!
    for (item of s) break;
    s.delete(item!);
    return item!;
}

function _mapGetOrInit<K, V>(map: Map<K, V>, name: K, init: () => V): V {
    let result = map.get(name);
    if (result === undefined) {
        result = init();
        map.set(name, result);
    }
    return result;
}

// CAUTION noDepsSet and dependantsMap will be changed!
export function topologicalSortKahn(
    noDepsSet: Set<string>,
    requirementsMap: Map<string, string[]>,
    dependantsMap: Map<string, Set<string>>,
): string[] {
    const topoList: string[] = []; // L ← Empty list that will contain the sorted elements (a topologically sorted order)
    // noDepsSet: S ← Set of all nodes with no incoming edge

    // console.log('topologicalSortKahn noDepsSet', noDepsSet);
    // console.log('topologicalSortKahn requirementsMap', requirementsMap);
    // console.log('topologicalSortKahn dependantsMap', dependantsMap);

    // Kahn's algorithm, took it from https://en.wikipedia.org/wiki/Topological_sorting
    while (noDepsSet.size) {
        // while S is not empty do
        const name = setPop(noDepsSet); // remove a node n from S
        topoList.push(name); // add n to L
        // console.log(`topologicalSortKahn get name "${name}"`, 'requirementsMap.get(name)', requirementsMap.get(name));
        if (!requirementsMap.has(name)) continue;
        for (const nodeM of requirementsMap.get(name)!) {
            // for each node m with an edge e from n to m do
            const dependencies = dependantsMap.get(nodeM)!;
            dependencies.delete(name); // remove edge e from the graph
            if (dependencies.size === 0) {
                //if m has no other incoming edges then
                noDepsSet.add(nodeM); // insert m into S
                dependantsMap.delete(nodeM);
            }
        }
    }

    if (dependantsMap.size) {
        //if graph has edges then
        //return error (graph has at least one cycle)
        const messages = Array.from(dependantsMap).map(
            ([dependant, dependencies]) =>
                `"${dependant}"(${Array.from(dependencies).join(", ")})`,
        );
        throw new Error(
            `CYCLIC DEPENDENCIES ERROR unresolvable:\n    ${messages.join("\n    ")}` +
                `\nTopological order so far: ${topoList.join(", ")}`,
        );
    }
    //  return L   (a topologically sorted order)
    return topoList;
}

export interface HasDependencies {
    dependencies: Iterable<string> & { size: number };
}

export function* allEntries(
    ...withEntries: Map<string, HasDependencies>[]
): Generator<[string, HasDependencies]> {
    for (const item of withEntries) yield* item.entries();
}

function* allKeys(
    ...withKeys: { keys(): Iterable<string> }[]
): Generator<string> {
    for (const item of withKeys) yield* item.keys();
}

export function getTopologicallySortedInitOrder(
    coherenceFunctions: FreezableMap<string, CoherenceFunction>,
    fields: FreezableMap<string, typeof _BaseModel>,
    foreignKeys: FreezableMap<string, ForeignKey>,
    links: FreezableMap<string, _BaseLink>,
    internalizedDependencies: FreezableMap<string, InternalizedDependency>,
    fallBackValues: FreezableMap<string, FallBackValue>,
    externalDependencies: FreezableSet<string>,
): string[] {
    // links depend on their link.keyName
    // keys depend on their key.targetName
    // fields depend on their field.dependencies
    // coherenceFunctions depend on their coherenceFunction.dependencies
    // internalizedDependencies depend on their internalizedDependency/dependencyName
    // fallBackValues depend on their primaryName and fallBackName
    const noDepsSet = new Set(
            allKeys(
                externalDependencies,
                coherenceFunctions,
                fields,
                foreignKeys,
                links,
                internalizedDependencies,
                fallBackValues,
            ),
        ), //S ← Set of all nodes with no incoming edge
        requirementsMap = new Map(), // [dependency] => {...dependants}
        dependantsMap = new Map();
    // FIXME: putting coherenceFunctions first as they must execute as early as
    //        possible. The issue is, they can change the values of fields
    //        and therefore, before the fields are used in as dependencies
    //        anywhere else (e.g. in other fields) the coherence functions
    //        using them should already be done. however, it's not that
    //        straight forward and a second thought must be made.
    //        In a way, it is as if a field with a dependecy to another
    //        field is also dependant on the coherence function of that
    //        other field (dependent on the fact that the function has
    //        been executed)
    //        WILL have to explore deeper!
    for (const [name, entry] of allEntries(
        coherenceFunctions,
        fields,
        foreignKeys,
        links,
        internalizedDependencies,
        fallBackValues,
    )) {
        if (entry.dependencies.size === 0) continue;
        if (internalizedDependencies.has(name))
            // These are not required for initOrder and in fact
            // if name === internalizedDependencies.dependencyName
            // these create circular dependencies
            // However, we need the name as possible dependenciy for
            // the other items.
            continue;
        noDepsSet.delete(name);
        dependantsMap.set(name, new Set(entry.dependencies));
        for (const dependeny of entry.dependencies)
            _mapGetOrInit(requirementsMap, dependeny, () => []).push(name);
    }
    return topologicalSortKahn(noDepsSet, requirementsMap, dependantsMap);
}
