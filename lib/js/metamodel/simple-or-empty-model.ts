import {
    _BaseSimpleModel,
    OLD_STATE,
    _IS_DRAFT_MARKER,
    SERIALIZE_OPTIONS,
    immutableWriteError,
    SERIALIZE,
    DESERIALIZE,
    serializeItem,
    ResourceRequirement,
    type SerializationOptions,
    type SerializationResult,
    type TSerializedInput,
} from "./base-model.ts";

import { _NOTDEF, unwrapPotentialWriteProxy } from "./util.ts";

import { _PRIMARY_SERIALIZED_VALUE } from "./serialization.ts";

export class _AbstractSimpleOrEmptyModel extends _BaseSimpleModel {
    static readonly _EMPTY = Symbol("_EMPTY");
    static Model: typeof _BaseSimpleModel;

    // Instance properties set via Object.defineProperty
    declare _value:
        | _BaseSimpleModel
        | typeof _AbstractSimpleOrEmptyModel._EMPTY;
    declare [_PRIMARY_SERIALIZED_VALUE]?: [
        TSerializedInput,
        SerializationOptions,
    ];

    static createClass(
        Model: typeof _BaseSimpleModel,
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
                static Model: typeof _BaseSimpleModel = Model;
            },
        };

        // Can't override class.Model anymore, would be possible w/o the freeze.
        Object.freeze(result[className]);
        return result[className];
    }

    constructor(
        oldState: _AbstractSimpleOrEmptyModel | null = null,
        serializedValue: TSerializedInput | null = null,
        serializeOptions: SerializationOptions = SERIALIZE_OPTIONS,
    ) {
        super(oldState as _BaseSimpleModel | null);
        const ctor = this.constructor as typeof _AbstractSimpleOrEmptyModel;
        const oldSOE = this[OLD_STATE] as
            | _AbstractSimpleOrEmptyModel
            | null
            | undefined;
        // A primal state will have a value of _EMPTY.
        Object.defineProperty(this, "_value", {
            value: oldSOE == null ? ctor._EMPTY : oldSOE.rawValue,
            configurable: true,
            writable: true,
        });

        if (oldSOE == null) {
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
        const ctor = this.constructor as typeof _AbstractSimpleOrEmptyModel;
        const oldSOE = this[OLD_STATE] as
            | _AbstractSimpleOrEmptyModel
            | null
            | undefined;
        // compare
        if (oldSOE) {
            if (oldSOE.isEmpty && this.isEmpty)
                // Has NOT changed!
                return oldSOE as this;
            // FIXME: I'm not sure if unwrapPotentialWriteProxy is actually
            // required here, but it seems, if this was called via a proxy
            // in here, this._value could return a proxy as well, as _value)
            // references a _BaseModel
            else if (
                !oldSOE.isEmpty &&
                oldSOE.value === unwrapPotentialWriteProxy(this._value)
            )
                // Has NOT changed!
                return oldSOE as this;
        }

        if (this[_PRIMARY_SERIALIZED_VALUE])
            this[DESERIALIZE](...this[_PRIMARY_SERIALIZED_VALUE]);
        // Don't keep this
        delete this[_PRIMARY_SERIALIZED_VALUE];

        // Has changed?
        if (this._value === ctor._EMPTY) {
            // PASS
        } else if (this._value instanceof ctor.Model) {
            const val = this._value as _BaseSimpleModel;
            const immutable = val.isDraft ? val.metamorphose() : val;
            this._value = unwrapPotentialWriteProxy(
                immutable,
            ) as _BaseSimpleModel;
        } else
            throw new Error(
                `TYPE ERROR ${ctor.name} ` +
                    `expects ${ctor.Model.name} as value` +
                    `wrong type: ("${String(this._value)}" typeof ${typeof this._value}).`,
            );
        // After maybe metamorphosing this._value, just check again.
        if (oldSOE && !oldSOE.isEmpty && oldSOE.value === this._value)
            // Has NOT changed after all!
            return oldSOE as this;

        // has changed
        delete (this as { [OLD_STATE]?: unknown })[OLD_STATE];
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

    get isEmpty(): boolean {
        return (
            this._value ===
            (this.constructor as typeof _AbstractSimpleOrEmptyModel)._EMPTY
        );
    }

    clear(): void {
        this.set(
            (this.constructor as typeof _AbstractSimpleOrEmptyModel)._EMPTY,
        );
    }

    // basically only for metamorphose
    get rawValue():
        | _BaseSimpleModel
        | typeof _AbstractSimpleOrEmptyModel._EMPTY {
        return this._value;
    }

    get value(): unknown {
        return this.get();
    }

    set value(value: unknown) {
        this.set(value);
    }

    set(value: unknown): void {
        const ctor = this.constructor as typeof _AbstractSimpleOrEmptyModel;
        if (!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(
                new Error(
                    `IMMUTABLE WRITE ATTEMPT ` +
                        `${this} is immutable, not a draft, can't set value.`,
                ),
            );
        if (value === ctor._EMPTY) {
            this._value = ctor._EMPTY;
            return;
        }
        if (this.isEmpty) this._value = ctor.Model.createPrimalState(null);
        const val = this._value as _BaseSimpleModel;
        if (!val.isDraft) this._value = val.getDraft();
        // The concrete model (e.g. NumberModel, GenericModel) has a value setter.
        // _BaseSimpleModel doesn't declare it, so we cast through.
        (this._value as { value: unknown }).value = value;
    }

    get(defaultVal: unknown = _NOTDEF): unknown {
        // if(!this.isDraft)
        //    throw new Error(`LIFECYCLE ERROR ${this} will only return this.value when immutable/not a draft..`);
        // This will acturally return this._value.value despite of not beeing
        // immutable. this._value.value is never made immutable so it can always
        // be manipulated anyways.
        const ctor = this.constructor as typeof _AbstractSimpleOrEmptyModel;
        if (this._value === ctor._EMPTY) {
            if (defaultVal !== _NOTDEF) return defaultVal;
            throw new Error(
                `VALUE ERROR ${ctor.name} is EMPTY, use ` +
                    `that.isEmpty to check instead of trying to read that.value or use ` +
                    `that.get(defaultVal) to receive the default when value is empty`,
            );
        }
        // unwrap
        return (this._value as _BaseSimpleModel).value;
    }
    [SERIALIZE](
        options: SerializationOptions = SERIALIZE_OPTIONS,
    ): SerializationResult {
        if (this.isEmpty) return [[], null];
        return serializeItem(this._value as _BaseSimpleModel, options);
    }
    [DESERIALIZE](
        serializedValue: TSerializedInput,
        options: SerializationOptions = SERIALIZE_OPTIONS,
    ): void {
        const ctor = this.constructor as typeof _AbstractSimpleOrEmptyModel;
        if (serializedValue === null)
            // serializedValue should not be null, as the parent wouldn't
            // call this directly. I'm not sure for all cases though.
            return;
        this._value = ctor.Model.createPrimalDraft(
            this.dependencies,
            serializedValue,
            options,
        );
    }
}
