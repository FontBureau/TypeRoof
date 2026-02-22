import {
    _BaseModel,
    _BaseSimpleModel,
    _BaseContainerModel,
    FreezableSet,
    FreezableMap,
    SERIALIZE_OPTIONS,
    ResourceRequirement,
    SERIALIZE_FORMAT_OBJECT,
    driveResolveGenAsync,
    isDeliberateResourceResolveError,
    keyConstraintError,
    isDraftKeyError,
} from './base-model.ts';

// These are the exports from ./base-model.ts that are used beyond this
// file. I would prefer it, if users would import them directly.
// NOTE: don't "pollute" this export statement with exports that are
// not originating in base-model.ts
export {
    FreezableSet,
    FreezableMap,
    ResourceRequirement,
    keyConstraintError,
    SERIALIZE_OPTIONS,
    driveResolveGenAsync,
    isDeliberateResourceResolveError,
    isDraftKeyError,
    _BaseContainerModel,
    _BaseSimpleModel,
    SERIALIZE_FORMAT_OBJECT
}

import {
    CoherenceFunction
} from './coherence-function.ts';

export {
    CoherenceFunction
}

import {
    _NOTDEF,
    objectEntriesAreEqual,
    collectDependencies,
    unwrapPotentialWriteProxy,
    PATH_SEPARATOR,
} from './util.ts';

export { objectEntriesAreEqual, collectDependencies};

import {
    ForeignKey
} from './foreign-key.ts';

export {
    ForeignKey
}

import {
    deserializeGen,
    serialize,
    deserializeSync,
} from './serialization.ts';

export {
    deserializeGen,
    serialize,
    deserializeSync
}

import {
    _BaseLink,
    ValueLink,
    FallBackValue,
    InternalizedDependency,
    StaticDependency,
} from './links.ts';

export {
    _BaseLink,
    ValueLink,
    FallBackValue,
    InternalizedDependency,
    StaticDependency,
}

import {
    topologicalSortKahn,
} from './topological-sort.ts';

export {
    topologicalSortKahn,
};

import {
    _PotentialWriteProxy,
} from './potential-write-proxy.ts';
export {
    _PotentialWriteProxy,
    unwrapPotentialWriteProxy,
};


import { _AbstractStructModel } from './struct-model.ts';
export { _AbstractStructModel };

import { _AbstractGenericModel } from './generic-model.ts';
export { _AbstractGenericModel };

import { _AbstractEnumModel } from './enum-model.ts';
export { _AbstractEnumModel };

import { _AbstractSimpleOrEmptyModel } from './simple-or-empty-model.ts';
export { _AbstractSimpleOrEmptyModel };

import { _AbstractNumberModel } from './number-model.ts';
export { _AbstractNumberModel };

import {
    AnyModel, IntegerModel, NumberModel, BooleanModel,
    BooleanDefaultTrueModel, StringModel,
} from './simple-models.ts';
export {
    AnyModel, IntegerModel, NumberModel, BooleanModel,
    BooleanDefaultTrueModel, StringModel,
};

import { _AbstractListModel } from './list-model.ts';
export { _AbstractListModel };

import { _AbstractOrderedMapModel, toShuffle } from './ordered-map-model.ts';
export { _AbstractOrderedMapModel, toShuffle };

import { _AbstractDynamicStructModel } from './dynamic-struct-model.ts';
export { _AbstractDynamicStructModel };

export const PathModel = _AbstractGenericModel.createClass("PathModel", {
        sanitizeFN: function (rawValue) {
            if (typeof rawValue === "string")
                return [Path.fromString(rawValue), null];
            // let validateFN catch this
            return [rawValue, null];
        },
        validateFN: function (value) {
            // must be a Path
            if (value instanceof Path) return [true, null];
            return [
                false,
                `Value must be an instance of Path but is not: ` +
                    `"${value?.toString() || value}" (typeof: ${typeof value}; ` +
                    `constructor name: ${value?.constructor.name}).`,
            ];
        },
        serializeFN: function (value /*, options=SERIALIZE_OPTIONS*/) {
            return value.toString();
        },
        deserializeFN: function (
            serializedString /*, options=SERIALIZE_OPTIONS*/,
        ) {
            return Path.fromString(serializedString);
        },
    });
export const PathModelOrEmpty = _AbstractSimpleOrEmptyModel.createClass(PathModel);

// FIXME: also AvailableTypesModel/TypeModel should be centrally defined
//        so that we got one place where the pattern is implemented
// this is uses for color, axesMath, stylePatch and similarly forked in actors
export function createAvailableTypes(AvailableTypesModel, types) {
    const availableTypesDraft = AvailableTypesModel.createPrimalDraft({}),
        TYPE_TO_KEY = new Map(),
        TypeModel = AvailableTypesModel.Model;
    for (const [key, label, Model] of types) {
        const availableType = TypeModel.createPrimalDraft({});
        availableType.get("typeClass").value = Model;
        availableType.get("label").value = label;
        availableTypesDraft.push([key, availableType]);
        TYPE_TO_KEY.set(Model, key);
    }
    const availableTypes = availableTypesDraft.metamorphose();
    return [availableTypes, TYPE_TO_KEY];
}

/**
 * Look at ColorModel of color.mjs or ActorModel of actors/actors-base.mjs
 * how the "DynamicModel" is set up.
 */
export function createDynamicType(
    DynamicModel,
    typeKeyName,
    typeKeyValue,
    dependencies,
) {
    const availableTypesKey =
            DynamicModel.foreignKeys.get(typeKeyName).targetName, // e.g. 'availableActorTypes'
        availableTypes = DynamicModel.staticDependencies.has(availableTypesKey)
            ? DynamicModel.staticDependencies.get(availableTypesKey).state
            : dependencies[availableTypesKey],
        getTypeFor = (key) =>
            availableTypes.get(key).value.get("typeClass").value,
        getDraftFor = (name, deps) => getTypeFor(name).createPrimalDraft(deps),
        draft = getDraftFor(typeKeyValue, dependencies),
        resultDraft = DynamicModel.createPrimalDraft(dependencies);
    resultDraft.get(typeKeyName).value = typeKeyValue;
    resultDraft.get("instance").wrapped = draft;
    return resultDraft;
}

export function getMinMaxRangeFromType(Type) {
    const UnwrappedType =
        Type.prototype instanceof _AbstractSimpleOrEmptyModel
            ? Type.Model
            : Type;
    return [UnwrappedType.minVal, UnwrappedType.maxVal];
}

export function* getFieldsByType(FromType, SearchType) {
    for (const [fieldName, Type] of FromType.fields) {
        if (Type === SearchType) yield fieldName;
    }
}

export class Path {
    // jshint ignore: start
    static SEPARATOR = PATH_SEPARATOR;
    static RELATIVE = ".";
    static ROOT = "/";
    static PARENT = "..";
    // jshint ignore: end

    /* Without actually knowing the model structure, the save
     * way to do this is to remove single dot path parts and
     * reduce consecutive slashes into single slashes.
     * Double dots could be handled as well, e.g.:
     *     '/hello/beautiful/../world' => '/hello/world'
     * But, when we decide to follow links, which are implemented
     * in the model, the links would have to be resolved first,
     * in place, before removing path parts.
     *
     * In the terminal a path is relative, until it begins with
     * '/' but in a way I'd prefer it to be absulute until it begins
     * with '.' or '..'
     * Maybe we can use a switch for this, but thinking about this:
     * if(pathParts[0] !== '')
     *     pathParts.unshift(this.RELATIVE);
     * In the end, this is the wrong place to decide! We know
     * if the first element is this.RELATIVE that the path is explicitly
     * relative, and if it is '' the part is explicitly absolute
     * otherwise we don't know in here.
     */
    static sanitize(...rawPathParts) {
        const pathParts = rawPathParts
                .map((part) =>
                    typeof part !== "number"
                        ? // will remove contained separators
                          part.split(this.SEPARATOR)
                        : part.toString(10),
                )
                .flat(), // Array.prototype.flat is golden here.
            cleanParts = [];
        for (const [i, part] of pathParts.entries()) {
            if (part === this.RELATIVE) {
                // Only keep as first part, at the other positions it
                // is meaningless!
                // also void in a strings like:
                //         /./path/to => path/to NOT: ./path/to
                //         .././path/to => ../path/to
                //         path/.././to => to NOT ./to
                if (i === 0 && cleanParts.length === 0)
                    // => ['.']
                    cleanParts.push(part);
                continue;
            }
            if (part === "") {
                // filter the remains of consecutive separators/slashes
                if (i === 0 && cleanParts.length === 0)
                    // explicitly absolute
                    cleanParts.push(this.ROOT);
                continue;
            }
            if (part !== this.PARENT) {
                // regular path part
                cleanParts.push(part);
                continue;
            }

            // else: part === this.PARENT
            if (cleanParts.length === 0) {
                // this path is relative beyond its origin
                // => cleanParts = ['..']
                cleanParts.push(part);
                continue;
            }
            // cleanParts.length > 0
            const last = cleanParts.at(-1);
            if (last == this.RELATIVE) {
                // Only happens when cleanParts.length === 1, see above
                // this.RELATIVE is kept only as first item.
                // cleanParts = ['.']
                // => cleanParts = ['..']
                cleanParts.splice(-1, 1, part);
                continue;
            }
            if (last === this.PARENT) {
                // this path is relative beyond its origin and more
                //  => ['..', '..']
                cleanParts.push(part);
                continue;
            }
            // last is a regular pathPart
            // consumes that one
            //  e.g. cleanParts = ['hello', 'world'];
            //       => cleanParts = ['world']
            cleanParts.pop();
        }
        return cleanParts;
    }
    static stringSanitize(str) {
        return this.fromString(str).toString();
    }
    constructor(...pathParts) {
        const [firstPart, ...parts] = this.constructor.sanitize(...pathParts),
            // this.constructor.PARENT is not interesting in here as it
            // won't change serialisation
            explicitAnchoring =
                firstPart === this.constructor.ROOT ||
                firstPart === this.constructor.RELATIVE
                    ? firstPart
                    : null;
        if (pathParts.length && explicitAnchoring === null)
            // that's a regular part
            parts.unshift(firstPart);
        Object.defineProperty(this, "explicitAnchoring", {
            value: explicitAnchoring,
            enumerable: true,
        });
        Object.defineProperty(this, "isExplicitlyRelative", {
            value: explicitAnchoring === this.constructor.RELATIVE,
            enumerable: true,
        });
        Object.defineProperty(this, "isExplicitlyAbsolute", {
            value: explicitAnchoring === this.constructor.ROOT,
            enumerable: true,
        });

        Object.defineProperty(this, "parts", {
            value: Object.freeze(parts),
            enumerable: true,
        });
    }
    static fromParts(...pathParts) {
        return new this(...pathParts);
    }
    static fromString(pathString) {
        const splitted =
            pathString === "" ? [] : pathString.split(this.SEPARATOR);
        return this.fromParts(...splitted);
    }
    fromString(pathString) {
        return this.constructor.fromString(pathString);
    }
    fromParts(...pathParts) {
        return this.constructor.fromParts(...pathParts);
    }
    toString(defaultAnchoring = null /*ROOT || RELATIVE || null */) {
        if (
            defaultAnchoring !== null &&
            defaultAnchoring !== this.constructor.RELATIVE &&
            defaultAnchoring !== this.constructor.ROOT
        )
            throw new Error(
                `TYPE ERROR defaultAnchoring must be either null, ` +
                    `${this.constructor.name}.RELATIVE or ` +
                    `${this.constructor.name}.ROOT but it is: "${defaultAnchoring}".`,
            );
        const anchoring =
            this.explicitAnchoring === null
                ? defaultAnchoring
                : this.explicitAnchoring;
        if (anchoring === null)
            return this.parts.join(this.constructor.SEPARATOR);
        if (this.parts.length === null) return anchoring;
        return [
            anchoring === this.constructor.SEPARATOR ? "" : anchoring,
            ...this.parts,
        ].join(this.constructor.SEPARATOR);
    }
    *[Symbol.iterator]() {
        if (this.explicitAnchoring !== null) yield this.explicitAnchoring;
        yield* this.parts;
    }
    appendString(pathString) {
        return this.append(...this.fromString(pathString).parts);
    }
    append(...pathParts) {
        return this.fromParts(...this, ...pathParts);
    }
    get isBase() {
        return this.parts.length === 0;
    }
    slice(from, to) {
        return this.fromParts(
            this.explicitAnchoring || "",
            ...this.parts.slice(from, to),
        );
    }
    get parent() {
        if (this.isBase)
            throw new Error("Can't get parent path is a base path.");
        return this.slice(0, -1);
    }
    startsWith(rootPath) {
        const parts = [...this];
        for (const part of rootPath) {
            if (parts.shift() !== part) return false;
        }
        // Each part of rootPath is at the beginning of this;
        return true;
    }
    isRootOf(pathOrString) {
        const path =
            typeof pathOrString === "string"
                ? Path.fromString(pathOrString)
                : pathOrString;
        return path.startsWith(this);
    }
    equals(pathOrString) {
        if (pathOrString === this) return true;
        const path =
            typeof pathOrString === "string"
                ? Path.fromString(pathOrString)
                : pathOrString;
        return path.startsWith(this) && this.startsWith(path);
    }
    toRelative(rootPath) {
        if (!this.startsWith(rootPath))
            throw new Error(
                `VALUE ERROR ${this.constructor.name}.toRelative ` +
                    `this ${this} does not start with rootPath ${rootPath}`,
            );
        const parts = [...this],
            rootPathParts = [...rootPath],
            relativeParts = parts.slice(rootPathParts.length);
        return Path.fromParts(".", ...relativeParts);
    }
}

export const IS_CONTAINER = Symbol("IS_CONTAINER");
export function* getAllPathsAndValues(state) {
    // This check should rather be "is a container type"
    // and that would mean it has entries and it has a
    // get function that returns values for keys...
    if (state instanceof _BaseContainerModel) {
        // yield [IS_CONTAINER];
        if (!state.allEntries)
            console.warn(`!state.allEntries ${state}`, state);
        for (const [key, entry] of state.allEntries())
            for (const [value, ...path] of getAllPathsAndValues(entry))
                yield [value, key, ...path];
    } else yield [state];
}

export function _getEntry(fnName, state, path, defaultVal = _NOTDEF) {
    const pathInstance =
        typeof path === "string" ? Path.fromString(path) : path;
    try {
        const result = [...pathInstance.parts].reduce((accum, part) => {
            if (!(accum instanceof _BaseContainerModel))
                throw new Error(
                    `CONTAINER ENTRY ERROR no container at ${part} in ${accum} path: ${pathInstance.toString()}.`,
                );
            return accum[fnName](part);
        }, state);
        return result;
    } catch (error) {
        // Could check if error is not a KEY ERROR type, but e don't!
        if (defaultVal !== _NOTDEF) return defaultVal;
        error.message += ` (path: ${path});`;
        throw error;
    }
}

export function getDraftEntry(state, path, defaultVal = _NOTDEF) {
    return _getEntry("getDraftFor", state, path, defaultVal);
}

export function getEntry(state, path, defaultVal = _NOTDEF) {
    return _getEntry("get", state, path, defaultVal);
}

export function getValue(state, path, defaultVal = _NOTDEF) {
    const result = getEntry(state, path, defaultVal);
    return result === defaultVal ? result : result.value;
}

// How does changing the font trickle down to an updated axisLocations state!
// it seems that some knowledge about the font (READ ONLY) must be in some
// lower model.
// AND:

export function* _getAllEntries(state, path) {
    const pathInstance =
        typeof path === "string" ? Path.fromString(path) : path;
    let current = state;
    yield current; // for the empty path
    for (const pathPart of pathInstance) {
        current = getEntry(current, pathPart);
        yield current;
    }
}

// FIXME: would be cool to be able to get the Model of
// Links.
export function getModel(RootModel, path) {
    const pathInstance =
        typeof path === "string" ? Path.fromString(path) : path;
    return pathInstance.parts.reduce((accum, key) => {
        console.log("getModel:", key, "from:", accum);
        if ("Model" in accum)
            // We don't use key here, because this is a Map/List
            // and the key is just a placeholder, the Model is equal
            // for each element.
            return accum.Model;
        if ("fields" in accum) return accum.fields.get(key);
        throw new Error(
            `KEY ERROR don't know how to get model from ${accum.name}`,
        );
    }, RootModel);
}

export function applyTo(state, path, methodNameOrFn, ...args) {
    const pathInstance =
            typeof path === "string" ? Path.fromString(path) : path,
        entry = getEntry(state, pathInstance);
    // should probably store ForeignKeys still as BaseModel!
    console.log(
        `... at path ${path} applyEntry ${entry} method ${methodNameOrFn}:`,
        ...args,
    );
    // how to change a non-container entry? => There's a set(value) method.
    // it basically has no methods to change!
    if (typeof methodNameOrFn === "function")
        return methodNameOrFn(entry, ...args);
    else return entry[methodNameOrFn](...args);
}

export function pushEntry(state, path, ...entries) {
    return applyTo(state, path, "push", ...entries);
}

export function popEntry(state, path) {
    return applyTo(state, path, "pop");
}

export function spliceEntry(state, path, start, deleteCount, ...items) {
    return applyTo(state, path, "splice", start, deleteCount, items);
}

export function deleteEntry(state, path, key) {
    return applyTo(state, path, "delete", key);
}

// States need comparison, state.eq(otherState).
// Also, it would be very nice if state were immutable, thus:
//          state.setSomeValue() => aNewState;
// we would be recreating state a lot though as this would have to change application state.
// but we would move parallell/sibling states that did not change to the new object.
// and checkiing is always done on initialization.
//
//    No: this.value = ...
//    But: that = this.set(value);
// that === this === true === no change???
// It's interesting. but is it overkill?
// is it a big effort to teach the Model how to update itself?
// can a visitor do so?

//Allright: TODO:
//
// change multiple values
//      transaction like behavior is actually super easy when we do the
//      immutable/copy on write thing:
//          * get the state
//          * transform as much as you like
//          * set the state to the application.
//
// Inherent coherenceFunctions!!!
//
// produce changed paths in a comparison(oldState, newState)
//          NOTE: in arrays/maps add/delete operation could be tracked
//                not sure we need this though, maybe just acknowledge that
//                the thing has changed???
//                especially for deletions, as for additons we can just
//                output the new path.
//                BTW: size/length could be treated as a change indicator
//                      so the ui knows wherther to rebuild a list rather
//                      than to update it?
//
// hmm for simple types and structs everything is always changed
// maps can also have added/deleted
// arrays can have added/deleted but also moves, when the element is still
// in the array but has another index.

class CompareStatus {
    constructor(name) {
        this.name = name;
        Object.freeze(this);
    }
    toString() {
        return `[compare ${this.name}]`;
    }
}
export const COMPARE_STATUSES = Object.freeze(
    Object.fromEntries(
        ["EQUALS", "CHANGED", "NEW", "DELETED", "MOVED", "LIST_NEW_ORDER"].map(
            (name) => [name, new CompareStatus(name)],
        ),
    ),
);

export function* rawCompare(oldState, newState) {
    if (!(oldState instanceof _BaseModel) || !(newState instanceof _BaseModel))
        throw new Error(
            `TYPE ERROR oldState ${oldState} and ` +
                `newState ${newState} must be instances of _BaseModel.`,
        );

    if (oldState.isDraft || newState.isDraft)
        throw new Error(
            `TYPE ERROR oldState ${oldState} and ` +
                `newState ${newState} must not be drafts.`,
        );

    const { EQUALS, CHANGED, NEW, DELETED, MOVED, LIST_NEW_ORDER } =
        COMPARE_STATUSES;
    if (oldState === newState) {
        // return also equal paths for completeness at the beginning,
        // can be filtered later.
        // HOWEVER this return will prevent the alogrithm from descending
        // in the structure and thus we won't get all available paths anyways!
        yield [EQUALS, null];
        return;
    }

    // Not the same constructor, but instanceof is not relevant here
    // because a sub-class can change everything about the model.
    if (oldState.constructor !== newState.constructor) {
        yield [CHANGED, null];
        return;
    }

    if (
        oldState instanceof _AbstractDynamicStructModel &&
        oldState.WrappedType !== newState.WrappedType
    ) {
        // This could maybe be a stronger indicator about the change of Type
        // as it requires a changed interface. Using NEW.
        // It is also marked as CHANGED when the the type is the same
        // but the value changed.
        yield [NEW, null];
        return;
    }

    // self yield? yes e.g. an array may not be equal (===) but contain
    // just equal items at the same position, still for strict equality
    // that doesn't matter because it's a diferent array?
    yield [CHANGED, null];

    if (oldState instanceof _BaseSimpleModel)
        // here not the same instance counts as change.
        return;

    // Now instanceof counts, because it tells us how to use/read the instances.
    if (
        oldState instanceof _AbstractStructModel ||
        oldState instanceof _AbstractDynamicStructModel
    ) {
        // both states are expected to have the same key

        for (const [key, oldEntry] of oldState.allEntries()) {
            const newEntry = newState.get(key);

            // FIXME: require more generic handling of possibly null entries
            //        however, currently it only applies to ForeignKey related
            //        entries (ValueLink) anyways

            // see _getLink
            const oldIsNull = oldEntry === ForeignKey.NULL,
                newIsNull = newEntry === ForeignKey.NULL;
            if (oldIsNull && !newIsNull) {
                yield [NEW, null, key];
                continue;
            }
            if (!oldIsNull && newIsNull) {
                yield [DELETED, null, key];
                continue;
            }
            if (oldIsNull && newIsNull) {
                yield [EQUALS, null, key];
                continue;
            }

            for (const [result, data, ...pathParts] of rawCompare(
                oldEntry,
                newEntry,
            ))
                yield [result, data, key, ...pathParts];
        }
        return;
    }

    if (oldState instanceof _AbstractListModel) {
        // I think this is a very interesting problem. On the Array layer
        // we can deal with change, addition, deletion and also movement
        // change (replace) is like deletion plus addition, we can't decide
        // how it happened exactly, it indicates that the new value and the
        // old value are not identical, nor somewhere in the array as that
        // would jst be moved.
        // Should we find moves first (from index, to index) so we can
        // keep them of other comparisions.
        //
        // so, when the new array is shorter than the old one we got
        // netto more deletion
        // when it's longer, we got netto addition.
        //
        // When everything new in newState got changed or replaced, we don't
        // care? One question would be how to map this to deeper down
        // change operations, we don't want to rebuild all of the UIs within
        // the array, just because one value deep down changed. Need to be
        // more precise.
        //
        // but also, when just one value in a multi-axis slider changed,
        // the mapping/updating would likely be swift.
        //
        // another example would be a simple reordering operation, e.g.
        // move the keyframe at index 4 to index 1 ...
        //
        // One question is probably how to decide whether the UI should be
        // replaced or updated! There may be a sweet spot at which replacing
        // is better than updating!
        // Consequently, we need to find out why we don't rebuild all of
        // the UI all the time, e.g. one entry in the root struct changed,
        // that should not require to rebuild the wholde app.
        // Similarly the array case, but it's much harder to decide here
        // what to do!
        //
        // hmm, to keep identities, a map could be used. Order could be
        // stored as part of the value, or next to the map, And the key
        // would be an increasing number (easy to handle!) for new inserts.
        // (Or we use an OrEmpty Type in an array to delete stuff, but at
        // this point, the map which allows for deletions natively is nice.
        // The array could be used to keep an ordered list of the keys.
        // It could be serialized without revealing the complex structure.
        // That way, new order of the array, or any additions deletions
        // etc. could be handled nicely by the UI.

        // Ok, such an id-array, if implemented as it's own type, what
        // can it do?
        // IDs are internal, not global.
        // Since set requires the element to exist already, it would not
        // change the id. But we can have a "replace" method.
        // set access is still via indexes,
        // it's interesting, we should rather make the implementation a
        // pattern. Because that way we can access the list independently
        // from the values, and get info if the list changed or not, in
        // contrast to the map...
        // Maybe a struct{
        //      order => list of ids
        //    . entries => map id: entry
        // }
        // IT should be impossible to come up with external ids though!
        //
        // So what is the aim of this?

        // A) to distinguish between change and replace:
        //     change: same key-id different entry => deep compare
        //             => how does the ui know?
        //                 if deeply anything changed, it will create a path
        //                 otherwise, there will be no deep path.
        //                 Consequently, even if the id of the entry changed
        //                 it may still be equivalent and no action is required!
        //                 but, we rather don't want to do equivalence comparison!
        //                 Hence, we, should not apply the changed if it's equivalent!
        //     replace: old key-id deleted new key-id inserted, order changed as well
        //             as before, we should probably not apply a replace if it's equivalent
        //             but this will otherwise create a new id, so it must recreate the UI(?)
        //             and it won't go into deep comparison?
        //
        // At the moment, I feel like I should create a simple solution that
        // could be enhanced later, either by adding new types to the model,
        // coherenceFunctions or by updating the compare method.

        // Deletions won't be mentioned, the new order length is the new lenght.
        // Entries are either old indexes, the new indexes are the
        // indexes of the order array.
        // new Order[3, 2, NEW, NEW, 4]: note how the last item did not change!
        // new Order[3, 2, NEW, NEW, EQUALS]
        // What if there are duplicates, i.e. entries that are equal?
        // Let's say they are consumend one by one! If oldState had two
        // entries of a kind and newState has three: []

        const newOrder = [],
            //  , seen = new Map()
            oldFoundIndexes = new Set();
        // for(const [oldIndex, oldEntry] of oldState) {
        //     const startIndex = seen.get(newEntry)
        //       , newIndex = newState.value.indexOf(oldEntry, startIndex)
        //       ;
        //     if(newIndex !== -1) {
        //         // found
        //         newOrder[newIndex] = oldIndex === newIndex ? [EQUALS] : [MOVED, oldIndex];
        //         seen.set(newEntry, oldIndex + 1);
        //     }
        //     else
        //         // Give indexOf a chance to search less, the result is
        //         // the same as not changing seen[newEntry], not sure if
        //         // this improves performance.
        //         seen.set(newEntry, Infinity);
        // }
        // for(const [newIndex, newEntry] of newState) {
        //     if(newOrder[newIndex])
        //         continue;
        //     newOrder[newIndex] = newIndex < oldState.value.length ? [CHANGED] : [NEW];
        // }

        // NOTE: MOVED doesn't help UI and it also can make change detection
        // bad, e.g.:
        // * bad change detection: if two identical (===) siblings in old
        //   and the first sibling get changed, the first is marked as NEW
        //   and the second as MOVED, where the first marked as CHANGED and
        //   the second as EQUALS makes a lot more sense.
        // * doesn't help UI: In actual UI MOVED is treated as NEW where it
        //   could matter, because reqiring rootPath/dependecies in a hierarchy
        //   of sub-widgets is not (yet) implemented.
        //
        //
        // for(const [newKey, newEntry] of newState) {
        //     const startIndex = seen.get(newEntry)
        //       , [newIndex, /*message*/] = newState.keyToIndex(newKey)
        //       , oldIndex = oldState.value.indexOf(newEntry, startIndex)
        //       ;
        //     if(oldIndex === -1) {
        //         // Give indexOf a chance to search less, the result is
        //         // the same as not changing seen[newEntry], not sure if
        //         // this improves performance.
        //         seen.set(newEntry, Infinity);
        //         continue;
        //     }
        //     // found
        //     newOrder[newIndex] = oldIndex === newIndex
        //                         ? [EQUALS]
        //                         : [MOVED, oldIndex]
        //                         ;
        //     seen.set(newEntry, oldIndex + 1);
        //     // there's a entry of newState in oldState at oldIndex
        //     oldFoundIndexes.add(oldIndex);
        // }
        for (const [newKey, newEntry] of newState) {
            const [newIndex /*message*/] = newState.keyToIndex(newKey);
            if (newOrder[newIndex] !== undefined) continue;
            if (oldState.has(newIndex) && oldState.get(newIndex) === newEntry)
                newOrder[newIndex] = [EQUALS];
            else
                // Not found in oldState, filling empty slots in newOrder
                // I'm not sure we even need to distinguish betwenn NEW and CHANGED
                // as both mean the content is different.
                newOrder[newIndex] =
                    newIndex >= oldState.length ||
                    // marked as MOVED, otherwise it would be in newOrder already
                    // i.e. newState.splice(2, 0, newEntry)
                    // now the index at 2 is NEW
                    // and the index at 3 is [MOVED, 2]
                    oldFoundIndexes.has(newIndex)
                        ? [NEW]
                        : // i.e. newState.splice(2, 1, newEntry)
                          // now the index at 2 is NEW
                          // and the oldEntry is gone
                          // => CHANGED is like DELETED + NEW
                          [CHANGED];
        }
        // FIXME: Could fill the differnce in length of newOrder with DELETED
        // not sure this is required, as newOrder.length is good and
        // similar information, but it gets destroyed by this:
        // newOrder.push(...new Array(Math.max(0, oldState.length - newOrder.length)).fill(DELETED));
        // could do: newOrder.newStateLength = newState.length
        Object.freeze(newOrder);
        yield [LIST_NEW_ORDER, newOrder];
        for (const [index, [status /*oldIndex*/]] of newOrder.entries()) {
            const key = index.toString(10);
            if (status === EQUALS || status === MOVED || status === NEW) {
                // EQUALS: nothing to do.
                // MOVED: not compared, listener must reorder according to newOrder.
                // could also be treated like NEW by the UI
                // NEW: Item at index requires a new UI or such, there's nothing to compare.
                yield [status, null, key];
                continue;
            }
            if (status === CHANGED) {
                // There's already an item at that index, so we compare:
                const oldEntry = oldState.get(index),
                    newEntry = newState.get(index);
                for (const [result, data, ...pathParts] of rawCompare(
                    oldEntry,
                    newEntry,
                ))
                    yield [result, data, key, ...pathParts];
                continue;
            }
            throw new Error(`Don't know how to handle status ${status}`);
        }
        return;
    }
    // NOTE: _AbstractOrderedMapModel could also be compared similar
    //       to _AbstractListModel above, however, it's not clear if
    //       we should rather compare by key/value pairs as value or
    //       as the payload value as value. Maybe a use cse will come up
    //       we will see then. In general it would be possible to produce
    //       both comparison styles, as a list and as a map.
    if (
        oldState instanceof _AbstractOrderedMapModel
        /* || oldState instanceof _AbstractMapModel*/
    ) {
        for (const [key /*oldEntry*/] of oldState) {
            if (!newState.has(key)) yield [DELETED, null, key];
        }
        for (const [key, newEntry] of newState) {
            if (!oldState.has(key)) {
                yield [NEW, null, key];
                continue;
            }
            const oldEntry = oldState.get(key);
            if (oldEntry === newEntry) {
                yield [EQUALS, null, key];
                continue;
            }
            // CHANGED: deep compare, both keys exist
            for (const [result, data, ...pathParts] of rawCompare(
                oldEntry,
                newEntry,
            ))
                yield [result, data, key, ...pathParts];
            continue;
        }
        return;
    }
    // * states should know how to compare
    // each level would produce changed keys, and we can recursively descend?
    // a verbose mode would provide all changed paths, where a compact mode
    // only keeps the longest unique paths, where the leaves changed, this
    // will be interesting!
    throw new Error(`VALUE ERROR Don't know how to compare ${oldState}`);
}

export function* compare(oldState, newState) {
    for (const [status, data, ...pathParts] of rawCompare(oldState, newState))
        yield [status, data, Path.fromParts("/", ...pathParts)];
}

export class StateComparison {
    static COMPARE_STATUSES = COMPARE_STATUSES; // jshint ignore:line
    constructor(oldState, newState) {
        Object.defineProperties(this, {
            oldState: {
                value: oldState,
                enumerable: true,
            },
            newState: {
                value: newState,
                enumerable: true,
            },
        });

        if (oldState !== null)
            Object.defineProperty(this, "compareResult", {
                value: Object.freeze([...compare(oldState, newState)]),
                enumerable: true,
            });

        this._compareDetailsMap = null;
        this._rootChangedMap = null;
    }
    static createInitial(
        newState,
        dependencies = null,
        anchoring = Path.ROOT /* null || Path.ROOT || Path.RELATIVE */,
    ) {
        return new InitialStateComparison(newState, dependencies, anchoring);
    }

    map(fn) {
        return this.compareResult.map(fn);
    }
    *[Symbol.iterator]() {
        yield* this.compareResult;
    }
    toLog() {
        console.log(`>>> ${this.constructor.name}.toLog ...`);
        for (const [status, data, path] of this) {
            if (status === COMPARE_STATUSES.LIST_NEW_ORDER) {
                console.log(`    ${status}: ${path} ;;`);
                for (const [i, [st, ...val]] of data.entries())
                    console.log(`        #${i} ${st} data:`, ...val, ";;");
            } else
                console.log(
                    `    ${status}: ${path}${data !== null ? " (data: " + data + ")" : ""} ;;`,
                );
        }
        console.log(`<<< ${this.constructor.name}.toLog DONE!`);
    }
    getDetaislMap() {
        // could be cached!
        if (this._compareDetailsMap !== null) return this._compareDetailsMap;

        const compareDetailsMap = new FreezableMap();
        for (const [status, data, pathInstance] of this) {
            const path = pathInstance.toString();
            if (!compareDetailsMap.has(path))
                compareDetailsMap.set(path, new Map());
            compareDetailsMap.get(path).set(status, data);
        }
        Object.defineProperty(this, "_compareDetailsMap", {
            value: Object.freeze(compareDetailsMap),
        });
        return this._compareDetailsMap;
    }
    _getRootChangedMap() {
        // TODO: Document!
        // COMPARE_STATUSES:
        // EQUALS CHANGED NEW DELETED MOVED LIST_NEW_ORDER
        const { CHANGED, NEW, EQUALS, DELETED, MOVED, LIST_NEW_ORDER } =
                COMPARE_STATUSES,
            expected = new Set([CHANGED, NEW, MOVED, EQUALS, DELETED]),
            skipNotImplemented = new Set([LIST_NEW_ORDER]),
            changedMap = new FreezableMap();
        // FIXME: I think I'm not fully satisfied with this dumbing down
        // of the compareResult, as it loses so much information, which
        // we may want to use selectively in the UI in one way or the other.
        for (const [status /* data */, , pathInstance] of this) {
            const path = pathInstance.toString();
            if (skipNotImplemented.has(status)) {
                // console.warn(`NOT IMPLEMENTED skipping update status ${status} @${path}`);
                // It's not implemented in here.
                continue;
                // TODO: for LIST_NEW_ORDER:
                // console.log(`    ${status}: ${path} ;;`);
                // for(let [i, [st, ...val]] of data.entries())
                //     console.log(`        #${i} ${st} data:`, ...val, ';;');
            } else if (!expected.has(status))
                throw new Error(
                    `NOT IMPLEMENTED don't know how to handle ${status} #${path}`,
                );
            else if (status === EQUALS || status === DELETED) continue;
            // console.log('status: ' + status, path);
            if (changedMap.has(path))
                // seen
                continue;
            const entry = getEntry(this.newState, path);
            changedMap.set(path, entry);
        }
        return changedMap;
    }
    getChangedMap(dependenciesMap = null, toLocal = true) {
        if (this._rootChangedMap === null)
            Object.defineProperty(this, "_rootChangedMap", {
                value: Object.freeze(this._getRootChangedMap()),
            });
        if (dependenciesMap === null) return this._rootChangedMap;
        const filteredChangedMap = new FreezableMap();
        for (const [rootPath, localPath] of dependenciesMap.entries()) {
            if (!this._rootChangedMap.has(rootPath)) continue;
            filteredChangedMap.set(
                toLocal ? localPath : rootPath,
                this._rootChangedMap.get(rootPath),
            );
        }
        return Object.freeze(filteredChangedMap);
    }

    get isInitial() {
        return false;
    }
}

// Not exported, accessed via StateComparison.createInitial(...)
class InitialStateComparison extends StateComparison {
    constructor(
        newState,
        dependencies = null,
        anchoring = Path.ROOT /* null || Path.ROOT || Path.RELATIVE */,
    ) {
        super(null, newState);
        const compareResultEntries = [],
            paths =
                dependencies === null
                    ? this._getPathsFromState(newState, anchoring)
                    : // This way it's not guaranteed that the paths do exist
                      // in newState, but it is very quick and only creates
                      // entries for the required dependencies.
                      Array.from(dependencies.keys()).map(
                          Path.fromString,
                          Path,
                      );
        for (const pathInstance of paths)
            compareResultEntries.push([
                COMPARE_STATUSES.NEW,
                undefined,
                pathInstance,
            ]);

        Object.defineProperty(this, "compareResult", {
            value: Object.freeze(compareResultEntries),
            enumerable: true,
        });
    }

    _getPathsFromState(state, anchoring = null) {
        const paths = [];
        for (const [, /*value*/ ...parts] of getAllPathsAndValues(state)) {
            const path =
                anchoring === null
                    ? Path.fromParts(...parts)
                    : Path.fromParts(anchoring, ...parts);
            paths.push(path);
        }
        return paths;
    }

    get isInitial() {
        return true;
    }
}

// Coherence guards:
//
// The UI of the type tools grid will serve here as a target, as it has
// a lot of inherent data logic, that should be separated. It also
// is layered several levlels deep, which makes it more interesting.
// At the outher most level e.g. an axis used in the dimension controls
// should not be used (be disabled) in manual axis locations.
// Then, between the (two) dimensions, the axis also must be mutual exclusive.
// On the level of the dimension itself, there's logic involved "massaging"
// stepping values with differnt constraints, min/max, being non-zero etc.
// also, about stepping, the model should be able to produce the "other value"
// either by exosing method or by exporting a static function or both.
//
//
// SQL Constraints come into mind, especially at this point e.g. UNIQUE:
//    NOT NULL - Ensures that a column cannot have a NULL value
//    UNIQUE - Ensures that all values in a column are different
//    PRIMARY KEY - A combination of a NOT NULL and UNIQUE. Uniquely identifies each row in a table
//    FOREIGN KEY - Prevents actions that would destroy links between tables
//    CHECK - Ensures that the values in a column satisfies a specific condition
//    DEFAULT - Sets a default value for a column if no value is specified
//    CREATE INDEX - Used to create and retrieve data from the database very quickly
//
// Maybe we can have layers of checks here, things like UNIQUE could easily
// be built in, while more complex stuff needs to be custom.
//
// Good thing we are immutable: We can build up the new model completeley
// and then validate it (also, ask/decide to skip validation while in progress)
// It's just important that eventually there's a coherent model.
// If the new model is invalid, we just don't apply it, and that's it.
//
// I'll have tp look into some nosql/object stores a bit!
// there's e.g. a common model to reference another value by unique ID
// which is very handy when normalizing stuff!. E.g. the activeTarget
// state is an index into the list of targets. And the dimension axis
// is an index into the list of available axes.
// Within a datastructure, uniqueness can also be achieved i.e. using a
// dictionary, where the keys are unique by default. Bue, e.g. references
// to those entries from further away.
