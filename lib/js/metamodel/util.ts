export const _NOTDEF = Symbol("_NOTDEF");
export type NotDef = typeof _NOTDEF;
export type DefaultProvided<D> = Exclude<D, NotDef>;

export const PATH_SEPARATOR = "/";

/**
 * Building blocks and helper functions to define a Model.
 */

export function sort_alpha(a: string, b: string): number {
    return a.localeCompare(b, undefined, { sensitivity: "base" });
}

// Similar to Array.prototype.map
// The map() method creates a new array populated with the results of
// calling a provided function on every element in the iterable.
export function iterMap<T, U, I extends Iterable<T>>(
    iterable: I,
    callbackFn: (this: unknown, element: T, iterable: I) => U,
    thisArg: unknown = null,
): U[] {
    const result: U[] = [];
    // The type 'T' is inferred here from the generic constraints
    for (const element of iterable) {
        // The callback function is called using .call() to bind the 'thisArg'
        // 'this: unknown' is used in the callbackFn type to represent the bound 'thisArg'.
        result.push(callbackFn.call(thisArg, element, iterable));
    }
    return result;
}

export function iterFilter<T, I extends Iterable<T>>(
    iterable: I,
    callbackFn: (this: unknown, element: T, iterable: I) => boolean,
    thisArg: unknown = null,
): T[] {
    const result: T[] = [];
    // The type 'T' is inferred here from the generic constraints
    for (const element of iterable) {
        // The callback function is called using .call() to bind the 'thisArg'
        if (callbackFn.call(thisArg, element, iterable)) {
            // Since the element is pushed only if the filter passes,
            // the result array maintains the type 'T'.
            result.push(element);
        }
    }
    return result;
}

/**
 * Defines a type for any object that has an 'add' method suitable for a Set-like structure.
 *
 * @template T The type of the element to be added.
 */
export type AddableSet<T> = {
    add(value: T): unknown; // The return value can be anything (e.g., 'this' or void)
};

/**
 * Adds all elements from an iterable into an existing object that has an 'add' method.
 *
 * @template T The type of elements in the structure and the iterable.
 * @template S The type of the target structure, which must have an 'add' method.
 *
 * @param s The target Set-like object to populate (must have an 'add' method).
 * @param iterable The source iterable object (e.g., Array, Set, Generator).
 */
export function populateSet<T, S extends AddableSet<T>>(
    s: S,
    iterable: Iterable<T>,
): void {
    // The type 'T' is inferred from the generic constraints
    for (const item of iterable) {
        s.add(item);
    }
}

/**
 * Defines a type for any object that has a 'push' method suitable for an Array-like structure.
 *
 * @template T The type of the element to be pushed.
 */
export type PushableArray<T> = {
    // The push method accepts elements of type T and returns a number (the new length)
    push(...items: T[]): number;
};

/**
 * Adds all elements from an iterable into an existing object that has a 'push' method.
 *
 * @template T The type of elements in the structure and the iterable.
 * @template A The type of the target structure, which must have a 'push' method.
 *
 * @param a The target Array-like object to populate (must have a 'push' method).
 * @param iterable The source iterable object (e.g., Set, Generator, another Array).
 */
export function populateArray<T, A extends PushableArray<T>>(
    a: A,
    iterable: Iterable<T>,
): void {
    // The type 'T' is inferred from the generic constraints
    for (const item of iterable) {
        // Now 'a' is guaranteed to have the 'push' method for items of type T
        a.push(item);
    }
}

// Proxy protocol symbols and functions
// These are the fundamental building blocks for the PotentialWriteProxy
// protocol. They are defined here so that any module can check/unwrap
// proxies without depending on potential-write-proxy.ts.
export const IS_PROXY = Symbol("_POTENTIAL_WRITE_PROXY_IS_PROXY");
export const GET_IMMUTABLE = Symbol("_POTENTIAL_WRITE_PROXY_GET_IMMUTABLE");
export const GET_DRAFT = Symbol("_POTENTIAL_WRITE_PROXY_GET_DRAFT");
export const GET = Symbol("_POTENTIAL_WRITE_PROXY_GET");
export const IS_WRAPPER_TYPE = Symbol("IS_WRAPPER_TYPE");

export function isProxy(maybeProxy: unknown): boolean {
    return (
        (!!maybeProxy && !!(maybeProxy as Record<symbol, unknown>)[IS_PROXY]) ||
        false
    );
}

export function unwrapPotentialWriteProxy<T>(
    maybeProxy: Record<symbol, T> | T,
    type: "immutable" | "draft" | null = null,
): T {
    if (!isProxy(maybeProxy)) return maybeProxy as T;
    const proxy = maybeProxy as Record<symbol, T>;
    if (type === "immutable") return proxy[GET_IMMUTABLE] as T;
    if (type === "draft") return proxy[GET_DRAFT] as T;
    return proxy[GET] as T;
}

// generic helper in metamorphose
// obj A and obj B must have the same own-entries with a strictly equal type.
export function objectEntriesAreEqual(
    depObjA: Record<string, unknown>,
    depObjB: Record<string, unknown>,
): boolean {
    // FIXME: maybe fail if prototypes are not equal.
    const keysA = Object.keys(depObjA),
        keysB = Object.keys(depObjB);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
        if (!keysB.includes(key)) return false;
        if (depObjA[key] !== depObjB[key]) return false;
    }
    return true;
}

interface StaticDependencyLike {
    state: unknown;
}

export function collectDependencies(
    dependencyNamesSet: Set<string>,
    updatedDependencies: Record<string, unknown> | null | undefined,
    oldStateDependencies: Record<string, unknown> | null = null,
    staticDependencies: Map<string, StaticDependencyLike> | null = null,
): Readonly<Record<string, unknown>> {
    const dependenciesData = Object.fromEntries(
        [
            // preload OLD STATE
            ...Object.entries(oldStateDependencies || {}),
            // add dependencies argument
            ...Object.entries(updatedDependencies || {}),
            // There are not more dependencies in the object than we know.
            // It's not an error as the caller could reuse dependencies object
            // this way, but we don't want to persist dependencies we don't
            // know or need.
        ].filter(([key]) => dependencyNamesSet.has(key)),
    );

    {
        // Check if all dependencies are provided.
        // It would possible to rewrite external dependency names
        // to internal ones (aliases) here in an attempt to make
        // a child fit into a parent it wasn't exactly designed for.
        // Putting this comment here, to not forget, if dependencyNamesSet
        // were a Map (insideName => outSideName) (not a set) the rewriting
        // could also be done from outside by the initializing parent.
        // Putting this thought here to keep it around.
        const missing = new Set<string>();
        for (const key of dependencyNamesSet.keys()) {
            if (!Object.hasOwn(dependenciesData, key)) missing.add(key);
        }
        if (missing.size !== 0)
            throw new Error(
                `VALUE ERROR missing dependencies: ${[...missing].join(", ")}`,
            );
        // Could add type checks for dependencies as well
        // e.g. if dependencyNamesSet were a Map (name=>Type)
    }

    if (staticDependencies !== null) {
        for (const [key, staticDependency] of staticDependencies)
            dependenciesData[key] = staticDependency.state;
    }

    // In async metamorphose it happens that we get PotentialWriteProxies
    // but we don't want to use them as dependencies, hence the unwrapping.
    for (const key of Object.keys(dependenciesData)) {
        const value = dependenciesData[key];
        if (isProxy(value))
            dependenciesData[key] = unwrapPotentialWriteProxy(value);
    }
    // More possible checks on dependencies:
    //  * Ensure all dependencies are immutable (and of a corresponding type).
    Object.freeze(dependenciesData);
    return dependenciesData;
}
