import {
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
} from "./base-model.ts";

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
    SERIALIZE_FORMAT_OBJECT,
};

import { CoherenceFunction } from "./coherence-function.ts";

export { CoherenceFunction };

import {
    objectEntriesAreEqual,
    collectDependencies,
    unwrapPotentialWriteProxy,
} from "./util.ts";

export { objectEntriesAreEqual, collectDependencies };

import { ForeignKey } from "./foreign-key.ts";

export { ForeignKey };

import { deserializeGen, serialize, deserializeSync } from "./serialization.ts";

export { deserializeGen, serialize, deserializeSync };

import {
    _BaseLink,
    ValueLink,
    FallBackValue,
    InternalizedDependency,
    StaticDependency,
} from "./links.ts";

export {
    _BaseLink,
    ValueLink,
    FallBackValue,
    InternalizedDependency,
    StaticDependency,
};

import { topologicalSortKahn } from "./topological-sort.ts";

export { topologicalSortKahn };

import { _PotentialWriteProxy } from "./potential-write-proxy.ts";
export { _PotentialWriteProxy, unwrapPotentialWriteProxy };

import { _AbstractStructModel } from "./struct-model.ts";
export { _AbstractStructModel };

import { _AbstractGenericModel } from "./generic-model.ts";
export { _AbstractGenericModel };

import { _AbstractEnumModel } from "./enum-model.ts";
export { _AbstractEnumModel };

import { _AbstractSimpleOrEmptyModel } from "./simple-or-empty-model.ts";
export { _AbstractSimpleOrEmptyModel };

import { _AbstractNumberModel } from "./number-model.ts";
export { _AbstractNumberModel };

import {
    AnyModel,
    IntegerModel,
    NumberModel,
    BooleanModel,
    BooleanDefaultTrueModel,
    StringModel,
} from "./simple-models.ts";
export {
    AnyModel,
    IntegerModel,
    NumberModel,
    BooleanModel,
    BooleanDefaultTrueModel,
    StringModel,
};

import { _AbstractListModel } from "./list-model.ts";
export { _AbstractListModel };

import { _AbstractOrderedMapModel, toShuffle } from "./ordered-map-model.ts";
export { _AbstractOrderedMapModel, toShuffle };

import { _AbstractDynamicStructModel } from "./dynamic-struct-model.ts";
export { _AbstractDynamicStructModel };

import { PathModel, PathModelOrEmpty } from "./simple-models.ts";
export { PathModel, PathModelOrEmpty };

import {
    createAvailableTypes,
    createDynamicType,
    getMinMaxRangeFromType,
    getFieldsByType,
} from "./type-utils.ts";
export {
    createAvailableTypes,
    createDynamicType,
    getMinMaxRangeFromType,
    getFieldsByType,
};

import { Path } from "./path.ts";
export { Path };

import {
    IS_CONTAINER,
    getAllPathsAndValues,
    getDraftEntry,
    getEntry,
    getValue,
    _getAllEntries,
    getModel,
    applyTo,
    pushEntry,
    popEntry,
    spliceEntry,
    deleteEntry,
} from "./accessors.ts";
export {
    IS_CONTAINER,
    getAllPathsAndValues,
    getDraftEntry,
    getEntry,
    getValue,
    _getAllEntries,
    getModel,
    applyTo,
    pushEntry,
    popEntry,
    spliceEntry,
    deleteEntry,
};

import {
    COMPARE_STATUSES,
    rawCompare,
    compare,
    StateComparison,
} from "./compare.ts";
export { COMPARE_STATUSES, rawCompare, compare, StateComparison };

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
