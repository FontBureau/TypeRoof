import {
    _AbstractGenericModel,
    type GenericModelSetup,
} from "./generic-model.ts";
import { _AbstractNumberModel, type NumberModelSetup } from "./number-model.ts";
import { _AbstractSimpleOrEmptyModel } from "./simple-or-empty-model.ts";
import { Path } from "./path.ts";
import {
    SERIALIZE,
    DESERIALIZE,
    OLD_STATE,
    _IS_DRAFT_MARKER,
} from "./base-model.ts";
import { _PRIMARY_SERIALIZED_VALUE } from "./serialization.ts";

// Re-export so TypeScript can name these in declaration output
export {
    SERIALIZE,
    DESERIALIZE,
    OLD_STATE,
    _IS_DRAFT_MARKER,
    _PRIMARY_SERIALIZED_VALUE,
};
export type { GenericModelSetup, NumberModelSetup };

export const AnyModel = _AbstractGenericModel.createClass("AnyModel"),
    IntegerModel = _AbstractNumberModel.createClass("IntegerModel", {
        defaultValue: 0,
        min: Number.MIN_SAFE_INTEGER,
        max: Number.MAX_SAFE_INTEGER,
        toFixedDigits: 0,
    }),
    // Beautiful
    // FIXME: defaultValue can't be undefined right now, as many
    // CoherenceFunction expect an inital value of undefined right now.
    // I consider this a bad pattern but until it's fixed in the CoherenceFunctions
    // it can't be changed here. E.g. search for: duration.value === undefined
    NumberModel = _AbstractNumberModel.createClass("NumberModel", {
        /*defaultValue: 0*/
    }),
    // Default is false.
    BooleanModel = _AbstractGenericModel.createClass("BooleanModel", {
        sanitizeFN: function (rawValue) {
            return [!!rawValue, null];
        },
        validateFN: function (value) {
            if (typeof value !== "boolean")
                return [
                    false,
                    `value is not typeof boolean: ${typeof value} (${value})`,
                ];
            return [true, null];
        },
        defaultValue: false,
        serializeFN: function (value /*, options=SERIALIZE_OPTIONS*/) {
            if (value === this.defaultValue) return null;
            return value ? "1" : "0";
        },
        deserializeFN: function (
            serializedString /*, options=SERIALIZE_OPTIONS*/,
        ) {
            const falseSet = new Set(["", "0", "false", "False", "FALSE"]);
            return !falseSet.has(serializedString as string);
        },
    });
/**
 * This seems a good way to extend a model in order to change its
 * defaultValue and nothing else. This way:
 *
 * const a = BooleanModelDefaultTrue.createPrimalState();
 * >> a.value === true
 *     true
 * >> a instanceof BooleanModel
 *     true
 * >> const a2d = a.getDraft();
 * >> a2d.set('abc', false)
 *    raises: VALIDATION ERROR [model BooleanDefaultTrueModel]: value
 *    is not typeof boolean: string (abc). (Maybe try setting sanitize to true.)
 *
 * The static BooleanModel.sanitizeFN and BooleanModel.validateFN will be
 * accessible in the instance of BooleanDefaultTrueModel
 * via  this.constructor.sanitizeFN and this.constructor.validateFN
 * so this just works, because:
 *
 * >> a.constructor
 *     class BooleanDefaultTrueModel {}
 * >> Object.getOwnPropertyNames(a.constructor)
 *     Array(4) [ "prototype", "defaultValue", "length", "name" ]
 * >> Object.getPrototypeOf(a.constructor)
 *     class BooleanModel {}
 * >> Object.getOwnPropertyNames(Object.getPrototypeOf(a.constructor))
 *     Array(6) [ "prototype", "sanitizeFN", "validateFN", "defaultValue", "length", "name" ]
 * >> Object.getPrototypeOf(b.constructor).sanitizeFN === b.constructor.sanitizeFN
 *     true
 * In the last example you can see how the "sanitizeFN", "validateFN" are
 * available despite being defined in the superclass.
 */
export class BooleanDefaultTrueModel extends BooleanModel {}
Object.defineProperties(BooleanDefaultTrueModel, {
    defaultValue: { value: true },
});
Object.freeze(BooleanDefaultTrueModel);
export const StringModel = _AbstractGenericModel.createClass("StringModel", {
    sanitizeFN: function (rawValue: unknown) {
        if (typeof rawValue === "string") return [rawValue, null];
        try {
            return [`${(rawValue as { toString(): string }).toString()}`, null];
        } catch (error: unknown) {
            return [
                null,
                `Can't stringify rawValue with message: ${(error as Error).message}`,
            ];
        }
    },
    validateFN: function (value) {
        if (typeof value !== "string")
            return [
                false,
                `value is not typeof string: ${typeof value} (${value})`,
            ];
        return [true, null];
    },
    defaultValue: "",
    serializeFN: function (value /*, options=SERIALIZE_OPTIONS*/) {
        return value;
    },
    deserializeFN: function (serializedString /*, options=SERIALIZE_OPTIONS*/) {
        return serializedString;
    },
});

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
    serializeFN: function (value: unknown /*, options=SERIALIZE_OPTIONS*/) {
        return (value as Path).toString();
    },
    deserializeFN: function (serializedString /*, options=SERIALIZE_OPTIONS*/) {
        return Path.fromString(serializedString as string);
    },
});
export const PathModelOrEmpty =
    _AbstractSimpleOrEmptyModel.createClass(PathModel);
