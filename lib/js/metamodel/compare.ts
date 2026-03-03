import { _BaseModel, _BaseSimpleModel, FreezableMap } from "./base-model.ts";
import { _AbstractStructModel } from "./struct-model.ts";
import { _AbstractListModel } from "./list-model.ts";
import { _AbstractOrderedMapModel } from "./ordered-map-model.ts";
import { _AbstractDynamicStructModel } from "./dynamic-struct-model.ts";
import { ForeignKey } from "./foreign-key.ts";
import { Path } from "./path.ts";
import { getEntry, getAllPathsAndValues } from "./accessors.ts";

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
    declare readonly name: string;
    constructor(name: string) {
        this.name = name;
        Object.freeze(this);
    }
    toString(): string {
        return `[compare ${this.name}]`;
    }
}
export const COMPARE_STATUSES: Readonly<
    Record<
        "EQUALS" | "CHANGED" | "NEW" | "DELETED" | "MOVED" | "LIST_NEW_ORDER",
        CompareStatus
    >
> = Object.freeze(
    Object.fromEntries(
        ["EQUALS", "CHANGED", "NEW", "DELETED", "MOVED", "LIST_NEW_ORDER"].map(
            (name) => [name, new CompareStatus(name)],
        ),
    ),
) as Record<
    "EQUALS" | "CHANGED" | "NEW" | "DELETED" | "MOVED" | "LIST_NEW_ORDER",
    CompareStatus
>;

type NewOrderData = readonly (readonly [CompareStatus, ...number[]])[];
type CompareResultEntry = [CompareStatus, NewOrderData | null, ...string[]];
type ComparisonEntry = [CompareStatus, NewOrderData | null, Path];

export function* rawCompare(
    oldState: _BaseModel,
    newState: _BaseModel,
): Generator<CompareResultEntry> {
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
        oldState.WrappedType !==
            (newState as _AbstractDynamicStructModel).WrappedType
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

        const newContainer = newState as
            | _AbstractStructModel
            | _AbstractDynamicStructModel;
        for (const [key, oldEntry] of oldState.allEntries()) {
            const newEntry = newContainer.get(key);

            // FIXME: require more generic handling of possibly null entries
            //        however, currently it only applies to ForeignKey related
            //        entries (ValueLink) anyways

            // see _getLink
            const oldIsNull = (oldEntry as unknown) === ForeignKey.NULL,
                newIsNull = (newEntry as unknown) === ForeignKey.NULL;
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

        const newOrder: [CompareStatus, ...number[]][] = [],
            //  , seen = new Map()
            oldFoundIndexes = new Set<number>();
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
        // oldState is narrowed by instanceof above, newState shares constructor (checked earlier)
        const newList = newState as _AbstractListModel;
        for (const [newKey, newEntry] of newList) {
            const [newIndex /*message*/] = newList.keyToIndex(
                newKey,
            ) as unknown as [number, string];
            if (newOrder[newIndex] !== undefined) continue;
            if (
                oldState.has(String(newIndex)) &&
                oldState.get(String(newIndex)) === newEntry
            )
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
                const oldEntry = oldState.get(String(index)),
                    newEntry = newList.get(String(index));
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
        // oldState is narrowed by instanceof above, newState shares constructor (checked earlier)
        const newMap = newState as _AbstractOrderedMapModel;
        for (const [key /*oldEntry*/] of oldState) {
            if (!newMap.has(key)) yield [DELETED, null, key];
        }
        for (const [key, newEntry] of newMap) {
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

export function* compare(
    oldState: _BaseModel,
    newState: _BaseModel,
): Generator<ComparisonEntry> {
    for (const [status, data, ...pathParts] of rawCompare(oldState, newState))
        yield [status, data, Path.fromParts("/", ...pathParts)];
}

export class StateComparison {
    static COMPARE_STATUSES = COMPARE_STATUSES; // jshint ignore:line

    declare readonly oldState: _BaseModel | null;
    declare readonly newState: _BaseModel;
    declare readonly compareResult: readonly ComparisonEntry[];
    declare private _compareDetailsMap: FreezableMap<
        string,
        Map<CompareStatus, unknown>
    > | null;
    declare private _rootChangedMap: FreezableMap<string, _BaseModel> | null;

    constructor(oldState: _BaseModel | null, newState: _BaseModel) {
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
        newState: _BaseModel,
        dependencies: Map<string, string> | null = null,
        anchoring: string = Path.ROOT /* null || Path.ROOT || Path.RELATIVE */,
    ): InitialStateComparison {
        return new InitialStateComparison(newState, dependencies, anchoring);
    }

    map<T>(fn: (entry: ComparisonEntry) => T): T[] {
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
                for (const [i, [st, ...val]] of data!.entries())
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
            (compareDetailsMap.get(path) as Map<CompareStatus, unknown>).set(
                status,
                data,
            );
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
    getChangedMap(
        dependenciesMap: Map<string, string> | null = null,
        toLocal: boolean = true,
    ): FreezableMap<string, _BaseModel> {
        if (this._rootChangedMap === null)
            Object.defineProperty(this, "_rootChangedMap", {
                value: Object.freeze(this._getRootChangedMap()),
            });
        if (dependenciesMap === null) return this._rootChangedMap!;
        const filteredChangedMap = new FreezableMap<string, _BaseModel>();
        for (const [rootPath, localPath] of dependenciesMap.entries()) {
            if (!this._rootChangedMap!.has(rootPath)) continue;
            filteredChangedMap.set(
                toLocal ? localPath : rootPath,
                this._rootChangedMap!.get(rootPath) as _BaseModel,
            );
        }
        return Object.freeze(filteredChangedMap) as FreezableMap<
            string,
            _BaseModel
        >;
    }

    get isInitial() {
        return false;
    }
}

// Not exported, accessed via StateComparison.createInitial(...)
class InitialStateComparison extends StateComparison {
    constructor(
        newState: _BaseModel,
        dependencies: Map<string, string> | null = null,
        anchoring: string = Path.ROOT /* null || Path.ROOT || Path.RELATIVE */,
    ) {
        super(null, newState);
        const compareResultEntries = [],
            paths =
                dependencies === null
                    ? this._getPathsFromState(newState, anchoring)
                    : // This way it's not guaranteed that the paths do exist
                      // in newState, but it is very quick and only creates
                      // entries for the required dependencies.
                      (Array.from(dependencies!.keys()).map(
                          Path.fromString,
                          Path,
                      ) as Path[]);
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

    _getPathsFromState(
        state: _BaseModel,
        anchoring: string | null = null,
    ): Path[] {
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
