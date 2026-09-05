/**
 * Read-only Map-like facade over labeled layers in precedence order
 * (first hit wins). Layers are immutable Maps (or nested CascadingMaps);
 * on change, construct a new CascadingMap.
 *
 * NOTE: layers may be CascadingMaps themselves; lookups then recurse.
 * If deep chains ever show up in profiles, flattening nested cascades
 * at construction (splicing inner layers in place) preserves precedence
 * and restores O(1) — an internal change, the read interface stays
 * identical.
 */
export class CascadingMap {
    /**
     * layers: iterable of [label, map] pairs; insertion order = precedence
     * (earlier layers win). Duplicate labels throw — a duplicated
     * precedence slot is a wiring bug.
     */
    constructor(layers) {
        const layerMap = new Map();
        for (const [label, map] of layers) {
            if (layerMap.has(label))
                throw new Error(
                    `VALUE ERROR duplicate layer "${label}" in CascadingMap.`,
                );
            layerMap.set(label, map);
        }
        Object.defineProperties(this, {
            _layers: { value: layerMap }, // insertion order = precedence
            _indexCache: { value: null, writable: true },
        });
    }

    /**
     * Lazily built key -> winning-layer index; serves size/has/keys/get.
     * Layers are immutable, so the index never invalidates: on change,
     * construct a new CascadingMap.
     */
    _index() {
        if (this._indexCache === null) {
            const index = new Map(); // key -> winning layer map
            for (const map of this._layers.values())
                for (const key of map.keys())
                    if (!index.has(key)) index.set(key, map); // first hit wins
            this._indexCache = index;
        }
        return this._indexCache;
    }

    get size() {
        return this._index().size;
    }

    has(key) {
        return this._index().has(key);
    }

    get(key) {
        const layer = this._index().get(key);
        return layer === undefined ? undefined : layer.get(key);
    }

    *keys() {
        yield* this._index().keys();
    }

    *entries() {
        for (const [key, layer] of this._index()) yield [key, layer.get(key)];
    }

    *values() {
        for (const [, value] of this.entries()) yield value;
    }

    [Symbol.iterator]() {
        return this.entries();
    }

    forEach(callbackFn, thisArg = undefined) {
        for (const [key, value] of this.entries())
            callbackFn.call(thisArg, value, key, this);
    }

    /**
     * Layer access: ancestry reads ("parent", "parent.parent" via
     * getLayer("parent").getLayer("parent") on nested cascades) and
     * precedence-bypass for consumers that want a specific layer.
     * Returns the layer (a Map or CascadingMap) or undefined.
     */
    getLayer(label) {
        return this._layers.get(label);
    }

    /** Debug/boundary helper: materialize the effective view. */
    toMap() {
        return new Map(this.entries());
    }
}
