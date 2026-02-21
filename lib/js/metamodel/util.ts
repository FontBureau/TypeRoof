export const _NOTDEF = Symbol("_NOTDEF");
export type NotDef = typeof _NOTDEF;
export type DefaultProvided<D> = Exclude<D, NotDef>;


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
