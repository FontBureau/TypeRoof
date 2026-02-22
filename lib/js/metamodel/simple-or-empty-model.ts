import {
    _BaseSimpleModel,
    OLD_STATE,
    _IS_DRAFT_MARKER,
    SERIALIZE_OPTIONS,
    immutableWriteError,
    SERIALIZE,
    DESERIALIZE,
    serializeItem,
} from './base-model.ts';

import {
    _NOTDEF,
    unwrapPotentialWriteProxy,
} from './util.ts';

import {
    _PRIMARY_SERIALIZED_VALUE,
} from './serialization.ts';

export class _AbstractSimpleOrEmptyModel extends _BaseSimpleModel {
    static _EMPTY = Symbol("_EMPTY");
    static Model: _BaseSimpleModel;
    static createClass(
        Model: _BaseSimpleModel,
        className: string | null = null,
    ) {
        // If we are using a naming convention, I expect 'Model' at the
        // end so createClass(NumberModel) => NumbeOrEmptyModel

        if (!(Model.prototype instanceof _BaseSimpleModel))
            throw new Error(
                `TYPE ERROR Model (${Model.name}) is not a subclass of _BaseSimpleModel`,
            );

        if (className === null)
            className = `${Model.name.slice(0, Model.name.indexOf("Model"))}OrEmptyModel`;

        const result = {
            [className]: class extends this {
                static Model: _BaseSimpleModel = Model;
            },
        };

        // Can't override class.Model anymore, would be possible w/o the freeze.
        Object.freeze(result[className]);
        return result[className];
    }

    constructor(
        oldState = null,
        serializedValue = null,
        serializeOptions = SERIALIZE_OPTIONS,
    ) {
        super(oldState);
        // A primal state will have a value of _EMPTY.
        Object.defineProperty(this, "_value", {
            value:
                this[OLD_STATE] === null
                    ? this.constructor._EMPTY
                    : this[OLD_STATE].rawValue,
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
        if (this[OLD_STATE]) {
            if (this[OLD_STATE].isEmpty && this.isEmpty)
                // Has NOT changed!
                return this[OLD_STATE];
            // FIXME: I'm not sure if unwrapPotentialWriteProxy is actually
            // required here, but it seems, if this was called via a proxy
            // in here, this._value could return a proxy as well, as _value)
            // references a _BaseModel
            else if (
                !this[OLD_STATE].isEmpty &&
                this[OLD_STATE].value === unwrapPotentialWriteProxy(this._value)
            )
                // Has NOT changed!
                return this[OLD_STATE];
        }

        if (this[_PRIMARY_SERIALIZED_VALUE])
            this[DESERIALIZE](...this[_PRIMARY_SERIALIZED_VALUE]);
        // Don't keep this
        delete this[_PRIMARY_SERIALIZED_VALUE];

        // Has changed?
        if (this._value === this.constructor._EMPTY) {
            // PASS
        } else if (this._value instanceof this.constructor.Model) {
            const immutable = this._value.isDraft
                ? this._value.metamorphose()
                : this._value;
            this._value = unwrapPotentialWriteProxy(immutable);
        } else
            throw new Error(
                `TYPE ERROR ${this.constructor.name} ` +
                    `expects ${this.constructor.Model.name} as value` +
                    `wrong type: ("${this._value}" typeof ${typeof this._value}).`,
            );
        // After maybe metamorphosing this._value, just check again.
        if (
            this[OLD_STATE] &&
            !this[OLD_STATE].isEmpty &&
            this[OLD_STATE].value === this._value
        )
            // Has NOT changed after all!
            return this[OLD_STATE];

        // has changed
        delete this[OLD_STATE];
        Object.defineProperty(this, "_value", {
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

    get isEmpty() {
        return this._value === this.constructor._EMPTY;
    }

    clear() {
        this.set(this.constructor._EMPTY);
    }

    // basically only for metamorphose
    get rawValue() {
        return this._value;
    }

    get value() {
        return this.get();
    }

    set value(value) {
        this.set(value);
    }

    set(value) {
        if (!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(
                new Error(
                    `IMMUTABLE WRITE ATTEMPT ` +
                        `${this} is immutable, not a draft, can't set value.`,
                ),
            );
        if (value === this.constructor._EMPTY) {
            this._value = this.constructor._EMPTY;
            return;
        }
        if (this.isEmpty)
            this._value = this.constructor.Model.createPrimalState();
        if (!this._value.isDraft) this._value = this._value.getDraft();
        this._value.value = value;
    }

    get(defaultVal = _NOTDEF) {
        // if(!this.isDraft)
        //    throw new Error(`LIFECYCLE ERROR ${this} will only return this.value when immutable/not a draft..`);
        // This will acturally return this._value.value despite of not beeing
        // immutable. this._value.value is never made immutable so it can always
        // be manipulated anyways.
        if (this._value === this.constructor._EMPTY) {
            if (defaultVal !== _NOTDEF) return defaultVal;
            throw new Error(
                `VALUE ERROR ${this.constructor.name} is EMPTY, use ` +
                    `that.isEmpty to check instead of trying to read that.value or use ` +
                    `that.get(defaultVal) to receive the default when value is empty`,
            );
        }
        // unwrap
        return this._value.value;
    }
    [SERIALIZE](options = SERIALIZE_OPTIONS) {
        if (this.isEmpty) return [[], null];
        return serializeItem(this._value, options);
    }
    [DESERIALIZE](serializedValue, options = SERIALIZE_OPTIONS) {
        if (serializedValue === null)
            // serializedValue should not be null, as the parent wouldn't
            // call this directly. I'm not sure for all cases though.
            return;
        this._value = this.constructor.Model.createPrimalDraft(
            this.dependencies,
            serializedValue,
            options,
        );
    }
}
