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

export class _AbstractGenericModel extends _BaseSimpleModel {
    static createClass(className: string, setup = {}) {
        setup = {
            sanitizeFN: _NOTDEF,
            validateFN: _NOTDEF,
            defaultValue: _NOTDEF,
            serializeFN: _NOTDEF,
            deserializeFN: _NOTDEF,
            ...setup,
        };
        for (const fnName of ["sanitizeFN", "validateFN", "serializeFN"]) {
            if (
                setup[fnName] !== _NOTDEF &&
                typeof setup[fnName] !== "function"
            )
                throw new Error(
                    `TYPE ERROR ${fnName}, if specified, must be a function but is ${typeof setup[fnName]} (${setup[fnName]}).`,
                );
        }
        if (setup.validateFN !== _NOTDEF && setup.defaultValue !== _NOTDEF) {
            const [valid, message] = setup.validateFN(setup.defaultValue);
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
                    setup.sanitizeFN === _NOTDEF ? null : setup.sanitizeFN;
                static validateFN =
                    setup.validateFN === _NOTDEF ? null : setup.validateFN;
                static defaultValue =
                    setup.defaultValue === _NOTDEF
                        ? undefined
                        : setup.defaultValue;
                static serializeFN =
                    setup.serializeFN === _NOTDEF ? null : setup.serializeFN;
                static deserializeFN =
                    setup.deserializeFN === _NOTDEF
                        ? null
                        : setup.deserializeFN;
                // jshint ignore: end
            },
        };
        Object.freeze(result[className]);
        return result[className];
    }

    constructor(
        oldState: _AbstractGenericModel | null = null,
        serializedValue = null,
        serializeOptions = SERIALIZE_OPTIONS,
    ) {
        super(oldState);

        // A primal state will have a value of defaultValue or undefined.
        Object.defineProperty(this, "_value", {
            value:
                this[OLD_STATE] === null
                    ? this.constructor.defaultValue
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

    static sanitize(rawValue) {
        if (this.sanitizeFN === null) return [rawValue, null];
        return this.sanitizeFN(rawValue);
    }

    static validate(value) {
        if (this.validateFN === null) return [true, null]; // valid
        return this.validateFN(value);
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
            (sanitize === _NOTDEF && this.constructor.sanitizeFN !== null)
        ) {
            const [cleanValue, sanitizeMessage] =
                this.constructor.sanitize(rawValue);
            if (cleanValue === null)
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
    [SERIALIZE](options = SERIALIZE_OPTIONS) {
        if (this.constructor.serializeFN !== null)
            return [[], this.constructor.serializeFN(this.value, options)];
        return super[SERIALIZE](options);
    }
    [DESERIALIZE](serializedValue, options = SERIALIZE_OPTIONS) {
        if (this.constructor.deserializeFN !== null) {
            this.value = this.constructor.deserializeFN(
                serializedValue,
                options,
            );
            return [];
        }
        super[DESERIALIZE](serializedValue, options);
    }
}
