import {
    _BaseSimpleModel,
    OLD_STATE,
    _IS_DRAFT_MARKER,
    SERIALIZE_OPTIONS,
    immutableWriteError,
    SERIALIZE,
    DESERIALIZE,
    type SerializationOptions,
    type SerializationResult,
    type TSerializedInput,
    type ResourceRequirement,
} from "./base-model.ts";

import { _NOTDEF } from "./util.ts";

import { _PRIMARY_SERIALIZED_VALUE } from "./serialization.ts";

type GenericValidateFN = (value: unknown) => [boolean, string | null];
type GenericSanitizeFN = (value: unknown) => [unknown, string | null];
type GenericSerializeFN = (
    value: unknown,
    options: SerializationOptions,
) => TSerializedInput;
type GenericDeserializeFN = (
    serializedValue: TSerializedInput,
    options: SerializationOptions,
) => unknown;

export interface GenericModelSetup {
    sanitizeFN?: GenericSanitizeFN;
    validateFN?: GenericValidateFN;
    defaultValue?: unknown;
    serializeFN?: GenericSerializeFN;
    deserializeFN?: GenericDeserializeFN;
}

export class _AbstractGenericModel extends _BaseSimpleModel {
    // Instance properties set via Object.defineProperty
    declare _value: unknown;
    declare [_PRIMARY_SERIALIZED_VALUE]?: [
        TSerializedInput,
        SerializationOptions,
    ];

    // Static properties set by createClass on subclasses
    static sanitizeFN: GenericSanitizeFN | null;
    static validateFN: GenericValidateFN | null;
    static defaultValue: unknown;
    static serializeFN: GenericSerializeFN | null;
    static deserializeFN: GenericDeserializeFN | null;

    static createClass(className: string, setup: GenericModelSetup = {}) {
        const config = {
            sanitizeFN: _NOTDEF as typeof _NOTDEF | GenericSanitizeFN,
            validateFN: _NOTDEF as typeof _NOTDEF | GenericValidateFN,
            defaultValue: _NOTDEF as typeof _NOTDEF | unknown,
            serializeFN: _NOTDEF as typeof _NOTDEF | GenericSerializeFN,
            deserializeFN: _NOTDEF as typeof _NOTDEF | GenericDeserializeFN,
            ...setup,
        };
        for (const fnName of [
            "sanitizeFN",
            "validateFN",
            "serializeFN",
        ] as const) {
            if (
                config[fnName] !== _NOTDEF &&
                typeof config[fnName] !== "function"
            )
                throw new Error(
                    `TYPE ERROR ${fnName}, if specified, must be a function but is ${typeof config[fnName]} (${config[fnName]}).`,
                );
        }
        if (config.validateFN !== _NOTDEF && config.defaultValue !== _NOTDEF) {
            const [valid, message] = (config.validateFN as GenericValidateFN)(
                config.defaultValue,
            );
            if (!valid || message)
                throw new Error(
                    `TYPE ERROR defaultValue does not validate: ${message}`,
                );
        }
        // this way name will naturally become class.name.
        const result = {
            [className]: class extends this {
                // jshint ignore: start
                static sanitizeFN =
                    config.sanitizeFN === _NOTDEF ? null : config.sanitizeFN;
                static validateFN =
                    config.validateFN === _NOTDEF ? null : config.validateFN;
                static defaultValue =
                    config.defaultValue === _NOTDEF
                        ? undefined
                        : config.defaultValue;
                static serializeFN =
                    config.serializeFN === _NOTDEF ? null : config.serializeFN;
                static deserializeFN =
                    config.deserializeFN === _NOTDEF
                        ? null
                        : config.deserializeFN;
                // jshint ignore: end
            },
        };
        const Model = result[className]!;
        Object.freeze(Model);
        return Model;
    }

    constructor(
        oldState: _AbstractGenericModel | null = null,
        serializedValue: TSerializedInput | null = null,
        serializeOptions: SerializationOptions = SERIALIZE_OPTIONS,
    ) {
        super(oldState as _BaseSimpleModel | null);
        const ctor = this.constructor as typeof _AbstractGenericModel;

        // A primal state will have a value of defaultValue or undefined.
        Object.defineProperty(this, "_value", {
            value:
                this[OLD_STATE] === null
                    ? ctor.defaultValue
                    : (this[OLD_STATE] as unknown as _AbstractGenericModel)
                          .value,
            configurable: true,
            writable: true,
        });

        if (this[OLD_STATE] === null) {
            // a primal state
            if (serializedValue !== null)
                this[_PRIMARY_SERIALIZED_VALUE] = [
                    serializedValue,
                    serializeOptions,
                ];
            return this.metamorphose() as this;
        }
    }

    static sanitize(rawValue: unknown): [unknown, string | null] {
        if (this.sanitizeFN === null) return [rawValue, null];
        return this.sanitizeFN(rawValue);
    }

    static validate(value: unknown): [boolean, string | null] {
        if (this.validateFN === null) return [true, null]; // valid
        return this.validateFN(value);
    }

    *metamorphoseGen(): Generator<ResourceRequirement, this, unknown> {
        if (!this.isDraft)
            throw new Error(
                `LIFECYCLE ERROR ${this} must be in draft mode to metamorphose.`,
            );
        // compare
        if (
            this[OLD_STATE] &&
            (this[OLD_STATE] as unknown as _AbstractGenericModel).value ===
                this._value
        )
            // Has NOT changed!
            return this[OLD_STATE] as unknown as this;

        // Has changed!
        delete (this as { [OLD_STATE]?: unknown })[OLD_STATE];

        if (this[_PRIMARY_SERIALIZED_VALUE])
            this[DESERIALIZE](
                ...(this[_PRIMARY_SERIALIZED_VALUE] as [
                    TSerializedInput,
                    SerializationOptions,
                ]),
            );
        // Don't keep this
        delete (this as { [_PRIMARY_SERIALIZED_VALUE]?: unknown })[
            _PRIMARY_SERIALIZED_VALUE
        ];

        Object.defineProperty(this, "_value", {
            // Not freezing/changing this._value as it is considered "outside"
            // of the metamodel realm i.e. it's not a _BaseModel or part of
            // it, it can be any javascript value. Freezing it would have
            // undesirable side effects, e.g. breaking other libraries, and
            // almost no meaning for object immutability, unless some sort
            // of deepFreeze is performed.
            value: this._value,
            writable: false,
            configurable: false,
        });
        Object.defineProperty(this, _IS_DRAFT_MARKER, {
            value: false,
            configurable: false,
        });
        // Is this applied by the parent? I expect yes.
        Object.freeze(this);
        return this;
    }

    get value(): unknown {
        return this._value;
    }

    set value(value: unknown) {
        this.set(value);
    }

    set(rawValue: unknown, sanitize: boolean | typeof _NOTDEF = _NOTDEF): void {
        if (!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(
                new Error(
                    `IMMUTABLE WRITE ATTEMPT ` +
                        `${this} is immutable, not a draft, can't set value.`,
                ),
            );
        const ctor = this.constructor as typeof _AbstractGenericModel;
        let value = rawValue;

        if (
            (sanitize !== _NOTDEF && sanitize) ||
            (sanitize === _NOTDEF && ctor.sanitizeFN !== null)
        ) {
            const [cleanValue, sanitizeMessage] = ctor.sanitize(rawValue);
            if (cleanValue === null)
                throw new Error(
                    `SANITIZATION ERROR ${this}: ${sanitizeMessage}.`,
                );
            value = cleanValue;
        }
        const [valid, validateMessage] = ctor.validate(value);
        if (!valid)
            throw new Error(
                `VALIDATION ERROR ${this}: ${validateMessage}. (Maybe try setting sanitize to true.)`,
            );
        this._value = value;
    }

    get(): unknown {
        return this.value;
    }
    [SERIALIZE](
        options: SerializationOptions = SERIALIZE_OPTIONS,
    ): SerializationResult {
        const ctor = this.constructor as typeof _AbstractGenericModel;
        if (ctor.serializeFN !== null)
            return [[], ctor.serializeFN(this.value, options)];
        return super[SERIALIZE](options);
    }
    [DESERIALIZE](
        serializedValue: TSerializedInput,
        options: SerializationOptions = SERIALIZE_OPTIONS,
    ): void {
        const ctor = this.constructor as typeof _AbstractGenericModel;
        if (ctor.deserializeFN !== null) {
            this.value = ctor.deserializeFN(serializedValue, options);
            return;
        }
        super[DESERIALIZE](serializedValue, options);
    }
}
