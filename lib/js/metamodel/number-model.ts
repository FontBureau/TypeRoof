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

type NumberValidateFN = (value: number) => [boolean, string | null];
type NumberSanitizeFN = (value: number) => [number | null, string | null];

export interface NumberModelSetup {
    min?: number;
    max?: number;
    toFixedDigits?: number;
    defaultValue?: number;
    validateFN?: NumberValidateFN;
    sanitizeFN?: NumberSanitizeFN;
    sanitzeByDefault?: boolean;
}

export class _AbstractNumberModel extends _BaseSimpleModel {
    // Instance properties set via Object.defineProperty
    declare _value: number;
    declare [_PRIMARY_SERIALIZED_VALUE]?: [
        TSerializedInput,
        SerializationOptions,
    ];

    // Static properties set by createClass on subclasses
    static minVal: number | null;
    static maxVal: number | null;
    static toFixedDigits: number | null;
    static defaultValue: number | null;
    static sanitizeFN: NumberSanitizeFN | null;
    static validateFN: NumberValidateFN | null;
    static sanitzeByDefault: boolean;

    static createClass(className: string, setup: NumberModelSetup = {}) {
        const config = {
            min: _NOTDEF as typeof _NOTDEF | number,
            max: _NOTDEF as typeof _NOTDEF | number,
            toFixedDigits: _NOTDEF as typeof _NOTDEF | number,
            defaultValue: _NOTDEF as typeof _NOTDEF | number,
            validateFN: _NOTDEF as typeof _NOTDEF | NumberValidateFN,
            sanitizeFN: _NOTDEF as typeof _NOTDEF | NumberSanitizeFN,
            sanitzeByDefault: true as boolean,
            ...setup,
        };
        for (const name of [
            "min",
            "max",
            "toFixedDigits",
            "defaultValue",
        ] as const) {
            const setupValue = config[name];
            if (setupValue === _NOTDEF) continue;
            const [isNumeric, message] = this.isNumeric(setupValue);
            if (!isNumeric)
                throw new Error(
                    `${this}.createClass ${className} setup value "${name}" is not numeric: ${message}`,
                );
        }
        // numeric or _NOTDEF
        if (config.toFixedDigits !== _NOTDEF) {
            if (
                !Number.isSafeInteger(config.toFixedDigits) ||
                config.toFixedDigits < 0 ||
                config.toFixedDigits > 100
            )
                throw new Error(
                    `${this}.createClass ${className} setup value ` +
                        `"toFixedDigits" is not an integer between 0 and 100 (inclusive): ${config.toFixedDigits}`,
                );

            for (const name of ["min", "max", "defaultValue"] as const) {
                const setupValue = config[name];
                if (setupValue === _NOTDEF) continue;
                const fixedVal = parseFloat(
                    (setupValue as number).toFixed(config.toFixedDigits),
                );
                if (fixedVal !== setupValue)
                    throw new Error(
                        `${this}.createClass ${className} setup value "${name}" ` +
                            `(setupValue) is not stable in toFixed(${config.toFixedDigits}) conversion: ` +
                            `"${(setupValue as number).toFixed(config.toFixedDigits)}" ${fixedVal}`,
                    );
            }
        }
        if (config.defaultValue !== _NOTDEF) {
            // TODO: could be an inclusive min and an exclusive min, default is now inclusive
            const fixedDefault =
                config.toFixedDigits !== _NOTDEF
                    ? parseFloat(
                          (config.defaultValue as number).toFixed(
                              config.toFixedDigits,
                          ),
                      )
                    : config.defaultValue;
            if (config.min !== _NOTDEF && (fixedDefault as number) < config.min)
                throw new Error(
                    `${this}.createClass ${className} setup ` +
                        `value "defaultValue" (${config.defaultValue} as fixed ${fixedDefault}) ` +
                        `is smaller than setup value "min" (${config.min}).`,
                );
            if (config.max !== _NOTDEF && (fixedDefault as number) > config.max)
                throw new Error(
                    `${this}.createClass ${className} setup ` +
                        `value "defaultValue" (${config.defaultValue} as fixed ${fixedDefault}) ` +
                        `is bigger than setup value "max" (${config.max}).`,
                );
            config.defaultValue = fixedDefault as number;
        }
        config.sanitzeByDefault = config.sanitzeByDefault ? true : false;
        // this way name will naturally become class.name.
        const result = {
            [className]: class extends this {
                // jshint ignore: start
                static minVal = config.min === _NOTDEF ? null : config.min;
                static maxVal = config.max === _NOTDEF ? null : config.max;
                static toFixedDigits =
                    config.toFixedDigits === _NOTDEF
                        ? null
                        : config.toFixedDigits;
                static defaultValue =
                    config.defaultValue === _NOTDEF
                        ? null
                        : config.defaultValue;
                static sanitizeFN =
                    config.sanitizeFN === _NOTDEF ? null : config.sanitizeFN;
                static validateFN =
                    config.validateFN === _NOTDEF ? null : config.validateFN;
                static sanitzeByDefault = config.sanitzeByDefault;
                // jshint ignore: end
            },
        };
        const Model = result[className]!;
        Object.freeze(Model);
        return Model;
    }

    // Must be typeof number and not NaN
    // can be +/-Infinity
    static isNumeric(rawValue: unknown): [boolean, string | null] {
        if (typeof rawValue !== "number")
            return [
                false,
                `is not typeof number "${typeof rawValue}" raw value: "${String(rawValue)}"`,
            ];
        if (Number.isNaN(rawValue))
            return [false, `raw value is NaN (not a number)`];
        return [true, null];
    }

    static sanitize(rawValue: unknown): [number | null, string | null] {
        const [isNumeric, isNumericMessage] = this.isNumeric(rawValue);
        if (!isNumeric) return [null, isNumericMessage];

        let cleanValue: number;
        if (this.sanitizeFN) {
            // This runs before the other sanitations, so that these
            // are still effective even if this method doesn't respect
            // the other constraints.
            let message: string | null;
            [cleanValue, message] = this.sanitizeFN(rawValue as number) as [
                number,
                string | null,
            ];
            if (message) return [cleanValue, message];
        } else cleanValue = rawValue as number;

        if (this.minVal !== null && cleanValue < this.minVal)
            cleanValue = this.minVal;

        if (this.maxVal !== null && cleanValue > this.maxVal)
            cleanValue = this.maxVal;

        if (this.toFixedDigits !== null)
            // If min/max are at the wrong values, toFixed may move
            // cleanValue out of the min or max range, because it
            // is rounding. We'll catch that in validation though.
            cleanValue = parseFloat(cleanValue.toFixed(this.toFixedDigits));

        return [cleanValue, null];
    }

    static validate(value: number): [boolean | null, string | null] {
        const [isNumeric, isNumericMessage] = this.isNumeric(value);
        if (!isNumeric) return [false, isNumericMessage];

        if (this.minVal !== null && value < this.minVal)
            return [
                false,
                `value (${value}) is smaller than min value (${this.minVal})`,
            ];

        if (this.maxVal !== null && value > this.maxVal)
            return [
                null,
                `value (${value}) is bigger than max value (${this.maxVal})`,
            ];

        if (
            this.toFixedDigits !== null &&
            parseFloat(value.toFixed(this.toFixedDigits)) !== value
        ) {
            // Expecting toFixed operating in a range that has no issues with floating point precision.
            // However, toFixed has it's edge cases and so it may fail our expectations.
            return [
                null,
                `value (${value}) is not equal to fixed-point notation ` +
                    `"${value.toFixed(this.toFixedDigits)} ` +
                    `(toFixedDigits: ${this.toFixedDigits})"`,
            ];
        }

        if (this.validateFN === null) return [true, null]; // valid
        // All other validations have already be performed so the custom
        // validateFN can be simpler.
        return this.validateFN(value);
    }

    static get ppsDefaultSettings(): Record<string, number> {
        const entries: [string, number][] = [];
        for (const [here, there] of [
            ["maxVal", "max"],
            ["minVal", "min"],
            ["defaultValue", "default"],
            // , ['???', 'step']
        ] as const) {
            const val = (this as unknown as Record<string, number | null>)[
                here
            ];
            if (val != null) entries.push([there, val]);
        }
        return Object.fromEntries(entries);
    }

    constructor(
        oldState: _AbstractNumberModel | null = null,
        serializedValue: TSerializedInput | null = null,
        serializeOptions: SerializationOptions = SERIALIZE_OPTIONS,
    ) {
        super(oldState as _BaseSimpleModel | null);
        const ctor = this.constructor as typeof _AbstractNumberModel;

        // A primal state will have a value of defaultValue or undefined.
        Object.defineProperty(this, "_value", {
            value:
                this[OLD_STATE] === null
                    ? ctor.defaultValue !== null
                        ? ctor.defaultValue
                        : undefined
                    : (this[OLD_STATE] as unknown as _AbstractNumberModel)
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

    *metamorphoseGen(): Generator<ResourceRequirement, this, unknown> {
        if (!this.isDraft)
            throw new Error(
                `LIFECYCLE ERROR ${this} must be in draft mode to metamorphose.`,
            );
        // compare
        if (
            this[OLD_STATE] &&
            (this[OLD_STATE] as unknown as _AbstractNumberModel).value ===
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

    get value(): number {
        // if(!this.isDraft)
        //    throw new Error(`LIFECYCLE ERROR ${this} will only return this.value when immutable/not a draft..`);
        // This will acturally return this._value despite of not beeing
        // immutable. this._value is never made immutable so it can always
        // be manipulated anyways.
        return this._value;
    }

    set value(value: number) {
        this.set(value);
    }

    set(rawValue: number, sanitize: boolean | typeof _NOTDEF = _NOTDEF): void {
        if (!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(
                new Error(
                    `IMMUTABLE WRITE ATTEMPT ` +
                        `${this} is immutable, not a draft, can't set value.`,
                ),
            );
        const ctor = this.constructor as typeof _AbstractNumberModel;
        let value: number = rawValue;
        if (
            (sanitize !== _NOTDEF && sanitize) ||
            (sanitize === _NOTDEF && ctor.sanitzeByDefault)
        ) {
            const [cleanValue, sanitizeMessage] = ctor.sanitize(rawValue);
            if (cleanValue === null || sanitizeMessage)
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

    get(): number {
        return this.value;
    }
    [SERIALIZE](): SerializationResult {
        const ctor = this.constructor as typeof _AbstractNumberModel;
        return [
            [],
            ctor.toFixedDigits !== null
                ? this.value.toFixed(ctor.toFixedDigits)
                : this.value.toString(),
        ];
    }
    [DESERIALIZE](
        serializedValue: TSerializedInput,
        _options?: SerializationOptions,
    ): void {
        this.value = parseFloat(serializedValue as string);
    }
}
