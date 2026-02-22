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
    _PRIMARY_SERIALIZED_VALUE,
} from './serialization.ts';

export class _AbstractEnumModel extends _BaseSimpleModel {
    static createClass(
        className,
        enumItems,
        defaultValue,
        attachStaticProperties,
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
        // TODO: This is a nice way to extend the class statics while
        // still being able to Object.freeze the class. It cold be a
        // general API for all _BaseModels but I'm not implementing it
        // everywhere right now as I still consider it experimental.

        if (attachStaticProperties) {
            for (const [name, definition] of Object.entries(
                attachStaticProperties,
            )) {
                if (Object.hasOwn(result[className], name))
                    // Tested this case with:
                    //      attachStaticProperties = {defaultValue: {value: 'testing'}}
                    // and it triggered the Error.
                    throw new Error(
                        `VALUE ERROR can't attachs static property "${name}," it's already defined.`,
                    );
                Object.defineProperty(result[className], name, definition);
            }
        }
        Object.freeze(result[className]);
        return result[className];
    }

    constructor(
        oldState = null,
        serializedValue = null,
        serializeOptions = SERIALIZE_OPTIONS,
    ) {
        super(oldState);

        // A primal state will have a value of or defaultValue or undefined.
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

    set(value) {
        if (!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(
                new Error(
                    `IMMUTABLE WRITE ATTEMPT ` +
                        `${this} is immutable, not a draft, can't set value.`,
                ),
            );

        if (!this.constructor.enumItems.includes(value))
            throw new Error(
                `VALIDATION ERROR ${this}: "${value}" is not a valid member value.`,
            );
        this._value = value;
    }

    get() {
        return this.value;
    }

    [SERIALIZE](/*options=SERIALIZE_OPTIONS*/) {
        return [[], `${this.value}`];
    }
    [DESERIALIZE](serializedValue /*, options=SERIALIZE_OPTIONS*/) {
        this.value = serializedValue;
        return [];
    }
}
