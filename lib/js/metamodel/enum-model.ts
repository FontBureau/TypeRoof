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

import { _PRIMARY_SERIALIZED_VALUE } from "./serialization.ts";

export class _AbstractEnumModel extends _BaseSimpleModel {
    // Instance properties set via Object.defineProperty
    declare _value: string;
    declare [_PRIMARY_SERIALIZED_VALUE]?: [
        TSerializedInput,
        SerializationOptions,
    ];

    // Static properties set by createClass on subclasses
    static enumItems: readonly string[];
    static defaultValue: string;

    static createClass(
        className: string,
        enumItems: Iterable<string>,
        defaultValue: string,
        attachStaticProperties?: Record<string, PropertyDescriptor>,
    ) {
        // This way the local enumItems_ can reference the same element,
        // if it is an array. The freeze, however, is necessary to
        // ensure the data is not changed.
        const enumItems_ = Object.freeze(
                Array.isArray(enumItems) ? enumItems : Array.from(enumItems),
            ),
            enumItemsSet = new Set(enumItems_);
        if (!enumItemsSet.size)
            throw new Error(`VALUE ERROR ${this.name} enumItems is empty.`);
        if (enumItemsSet.size !== enumItems_.length)
            throw new Error(
                `VALUE ERROR ${this.name} enumItems must not have duplicates ${enumItems_.join(", ")}.`,
            );
        if (!enumItemsSet.has(defaultValue))
            throw new Error(
                `VALUE ERROR ${this.name} defaultValue "${defaultValue}" must be in enumItems (${enumItems_.join(", ")} but is not.`,
            );
        // this way name will naturally become class.name.
        const result = {
            [className]: class extends this {
                // jshint ignore: start
                static enumItems = enumItems_;
                static defaultValue = defaultValue;
                // jshint ignore: end
            },
        };
        const Model = result[className]!;
        // TODO: This is a nice way to extend the class statics while
        // still being able to Object.freeze the class. It cold be a
        // general API for all _BaseModels but I'm not implementing it
        // everywhere right now as I still consider it experimental.

        if (attachStaticProperties) {
            for (const [name, definition] of Object.entries(
                attachStaticProperties,
            )) {
                if (Object.hasOwn(Model, name))
                    // Tested this case with:
                    //      attachStaticProperties = {defaultValue: {value: 'testing'}}
                    // and it triggered the Error.
                    throw new Error(
                        `VALUE ERROR can't attach static property "${name}," it's already defined.`,
                    );
                Object.defineProperty(Model, name, definition);
            }
        }
        Object.freeze(Model);
        return Model;
    }

    constructor(
        oldState: _AbstractEnumModel | null = null,
        serializedValue: TSerializedInput | null = null,
        serializeOptions: SerializationOptions = SERIALIZE_OPTIONS,
    ) {
        super(oldState as _BaseSimpleModel | null);
        const ctor = this.constructor as typeof _AbstractEnumModel;

        // A primal state will have a value of or defaultValue or undefined.
        Object.defineProperty(this, "_value", {
            value:
                this[OLD_STATE] === null
                    ? ctor.defaultValue
                    : (this[OLD_STATE] as unknown as _AbstractEnumModel).value,
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
            (this[OLD_STATE] as unknown as _AbstractEnumModel).value ===
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

    get value(): string {
        return this._value;
    }

    set value(value: string) {
        this.set(value);
    }

    set(value: string): void {
        if (!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(
                new Error(
                    `IMMUTABLE WRITE ATTEMPT ` +
                        `${this} is immutable, not a draft, can't set value.`,
                ),
            );
        const ctor = this.constructor as typeof _AbstractEnumModel;
        if (!ctor.enumItems.includes(value))
            throw new Error(
                `VALIDATION ERROR ${this}: "${value}" is not a valid member value.`,
            );
        this._value = value;
    }

    get() {
        return this.value;
    }

    [SERIALIZE](
        _options: SerializationOptions = SERIALIZE_OPTIONS,
    ): SerializationResult {
        return [[], `${this.value}`];
    }
    [DESERIALIZE](
        serializedValue: TSerializedInput,
        _options: SerializationOptions = SERIALIZE_OPTIONS,
    ): void {
        this.value = serializedValue as string;
    }
}
