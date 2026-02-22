import {
    _BaseSimpleModel,
    OLD_STATE,
    _IS_DRAFT_MARKER,
    SERIALIZE_OPTIONS,
    immutableWriteError,
    SERIALIZE,
    DESERIALIZE,
} from './base-model.ts';

import {
    _NOTDEF,
} from './util.ts';

import {
    _PRIMARY_SERIALIZED_VALUE,
} from './serialization.ts';

export class _AbstractNumberModel extends _BaseSimpleModel {
    static createClass(className: string, setup = {}) {
        // numeric or _NOTDEF
        setup = {
            min: _NOTDEF,
            max: _NOTDEF,
            toFixedDigits: _NOTDEF,
            defaultValue: _NOTDEF,
            validateFN: _NOTDEF,
            sanitizeFN: _NOTDEF,
            sanitzeByDefault: true,
            ...setup,
        };
        for (const name of ["min", "max", "toFixedDigits", "defaultValue"]) {
            const setupValue = setup[name];
            if (setupValue === _NOTDEF) continue;
            const [isNumeric, message] = this.isNumeric(setupValue);
            if (!isNumeric)
                throw new Error(
                    `${this}.createClass ${className} setup value "${name}" is not numeric: ${message}`,
                );
        }
        // numeric or _NOTDEF
        if (setup.toFixedDigits !== _NOTDEF) {
            if (
                !Number.isSafeInteger(setup.toFixedDigits) ||
                setup.toFixedDigits < 0 ||
                setup.toFixedDigits > 100
            )
                throw new Error(
                    `${this}.createClass ${className} setup value ` +
                        `"toFixedDigits" is not an integer between 0 and 100 (inclusive): ${setup.toFixedDigits}`,
                );

            for (const name of ["min", "max", "defaultValue"]) {
                const setupValue = setup[name];
                if (setupValue === _NOTDEF) continue;
                const fixedVal = parseFloat(
                    setupValue.toFixed(setup.toFixedDigits),
                );
                if (fixedVal !== setupValue)
                    throw new Error(
                        `${this}.createClass ${className} setup value "${name}" ` +
                            `(setupValue) is not stable in toFixed(${setup.toFixedDigits}) conversion: ` +
                            `"${setupValue.toFixed(setup.toFixedDigits)}" ${fixedVal}`,
                    );
            }
        }
        if (setup.defaultValue !== _NOTDEF) {
            // TODO: could be an inclusive min and an exclusive min, default is now inclusive
            const fixedDefault =
                setup.toFixedDigits !== _NOTDEF
                    ? parseFloat(
                          setup.defaultValue.toFixed(setup.toFixedDigits),
                      )
                    : setup.defaultValue;
            if (setup.min !== _NOTDEF && fixedDefault < setup.min)
                throw new Error(
                    `${this}.createClass ${className} setup ` +
                        `value "defaultValue" (${setup.defaultValue} as fixed ${fixedDefault}) ` +
                        `is smaller than setup value "min" (${setup.min}).`,
                );
            if (setup.max !== _NOTDEF && fixedDefault > setup.max)
                throw new Error(
                    `${this}.createClass ${className} setup ` +
                        `value "defaultValue" (${setup.defaultValue} as fixed ${fixedDefault}) ` +
                        `is bigger than setup value "max" (${setup.max}).`,
                );
            setup.defaultValue = fixedDefault;
        }
        setup.sanitzeByDefault = setup.sanitzeByDefault ? true : false;
        // this way name will naturally become class.name.
        const result = {
            [className]: class extends this {
                // jshint ignore: start
                static minVal = setup.min === _NOTDEF ? null : setup.min;
                static maxVal = setup.max === _NOTDEF ? null : setup.max;
                static toFixedDigits =
                    setup.toFixedDigits === _NOTDEF
                        ? null
                        : setup.toFixedDigits;
                static defaultValue =
                    setup.defaultValue === _NOTDEF ? null : setup.defaultValue;
                static sanitizeFN =
                    setup.sanitizeFN === _NOTDEF ? null : setup.sanitizeFN;
                static validateFN =
                    setup.validateFN === _NOTDEF ? null : setup.validateFN;
                static sanitzeByDefault = setup.sanitzeByDefault;
                // jshint ignore: end
            },
        };
        Object.freeze(result[className]);
        return result[className];
    }

    // Must be typeof number and not NaN
    // can be +/-Infinity
    static isNumeric(rawValue) {
        if (typeof rawValue !== "number")
            return [
                false,
                `is not typeof number "${typeof rawValue}" raw value: "${rawValue.toString()}"`,
            ];
        if (Number.isNaN(rawValue))
            return [false, `raw value is NaN (not a number)`];
        return [true, null];
    }

    static sanitize(rawValue) {
        const [isNumeric, isNumericMessage] = this.isNumeric(rawValue);
        if (!isNumeric) return [null, isNumericMessage];

        let cleanValue;
        if (this.sanitizeFN) {
            // This runs before the other sanitations, so that these
            // are still effective even if this method doesn't respect
            // the other constraints.
            let message;
            [cleanValue, message] = this.sanitizeFN(rawValue);
            if (message) return [cleanValue, message];
        } else cleanValue = rawValue;

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

    static validate(value) {
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

    static get ppsDefaultSettings() {
        const entries = [];
        for (const [here, there] of [
            ["maxVal", "max"],
            ["minVal", "min"],
            ["defaultValue", "default"],
            // , ['???', 'step']
        ]) {
            if (this[here] !== null) entries.push([there, this[here]]);
        }
        return Object.fromEntries(entries);
    }

    constructor(
        oldState = null,
        serializedValue = null,
        serializeOptions = SERIALIZE_OPTIONS,
    ) {
        super(oldState);

        // A primal state will have a value of defaultValue or undefined.
        Object.defineProperty(this, "_value", {
            value:
                this[OLD_STATE] === null
                    ? this.constructor.defaultValue !== null
                        ? this.constructor.defaultValue
                        : undefined
                    : this[OLD_STATE].value,
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
            return this.metamorphose();
        }
    }

    *metamorphoseGen() {
        if (!this.isDraft)
            throw new Error(
                `LIFECYCLE ERROR ${this} must be in draft mode to metamorphose.`,
            );
        // compare
        if (this[OLD_STATE] && this[OLD_STATE].value === this._value)
            // Has NOT changed!
            return this[OLD_STATE];

        // Has changed!
        delete this[OLD_STATE];
        if (this[_PRIMARY_SERIALIZED_VALUE])
            this[DESERIALIZE](...this[_PRIMARY_SERIALIZED_VALUE]);
        // Don't keep this
        delete this[_PRIMARY_SERIALIZED_VALUE];
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

    get value() {
        // if(!this.isDraft)
        //    throw new Error(`LIFECYCLE ERROR ${this} will only return this.value when immutable/not a draft..`);
        // This will acturally return this._value despite of not beeing
        // immutable. this._value is never made immutable so it can always
        // be manipulated anyways.
        return this._value;
    }

    set value(value) {
        this.set(value);
    }

    set(rawValue, sanitize = _NOTDEF) {
        if (!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(
                new Error(
                    `IMMUTABLE WRITE ATTEMPT ` +
                        `${this} is immutable, not a draft, can't set value.`,
                ),
            );
        let value = rawValue;
        if (
            (sanitize !== _NOTDEF && sanitize) ||
            (sanitize === _NOTDEF && this.constructor.sanitzeByDefault)
        ) {
            const [cleanValue, sanitizeMessage] =
                this.constructor.sanitize(rawValue);
            if (cleanValue === null || sanitizeMessage)
                throw new Error(
                    `SANITIZATION ERROR ${this}: ${sanitizeMessage}.`,
                );
            value = cleanValue;
        }
        const [valid, validateMessage] = this.constructor.validate(value);
        if (!valid)
            throw new Error(
                `VALIDATION ERROR ${this}: ${validateMessage}. (Maybe try setting sanitize to true.)`,
            );
        this._value = value;
    }

    get() {
        return this.value;
    }
    [SERIALIZE](/*options=SERIALIZE_OPTIONS*/) {
        return [
            [],
            this.constructor.toFixedDigits !== null
                ? this.value.toFixed(this.constructor.toFixedDigits)
                : this.value.toString(),
        ];
    }
    [DESERIALIZE](serializedValue /*, options=SERIALIZE_OPTIONS*/) {
        this.value = parseFloat(serializedValue);
        return [];
    }
}
