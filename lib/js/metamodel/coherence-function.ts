import { FreezableSet } from "./base-model.ts";

// FIXME/TODO: type can be anything that _AbstractStruct.get would return
// Also as Proxies!
export type ValueMap = Record<string, unknown>;
export type CoherenceFn = (valueMap: ValueMap) => void;

export class CoherenceFunction {
    // Use the definite assignment assertion '!'
    // This tells TypeScript the property WILL be initialized in the constructor.
    public readonly name!: string;
    public readonly fn!: CoherenceFn;
    public readonly dependencies!: FreezableSet<string>;
    constructor(dependencies: string[], fn: CoherenceFn /*(valueMap)*/) {
        Object.defineProperties(this, {
            dependencies: {
                value: Object.freeze(new FreezableSet(dependencies)),
            },
            fn: { value: fn },
            name: { value: fn.name || "(anonymous)" },
        });
        Object.freeze(this);
    }

    static create(
        dependencies: string[],
        fn: CoherenceFn,
    ): [string, CoherenceFunction] {
        const instance = new this(dependencies, fn);
        return [instance.name, instance];
    }

    // This way it goes nicely into the struct definition without
    // having to repeat the name!
    get nameItem(): [string, CoherenceFunction] {
        return [this.name, this];
    }

    toString() {
        return `[CoherenceFunction ${this.name}]`;
    }
}
