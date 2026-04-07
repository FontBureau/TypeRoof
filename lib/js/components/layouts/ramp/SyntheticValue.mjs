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
