import {
    _BaseContainerModel,
    FreezableSet,
    keyConstraintError,
} from "./base-model.ts";

import { _NOTDEF } from "./util.ts";

import type { DefaultProvided, NotDef } from "./util.ts";

// this is called "Function Overloading"
function getFirst<T>(iter: Iterable<T>): T; // throws if empty
function getFirst<T, D>(
    iter: Iterable<T>,
    defaultVal: DefaultProvided<D>,
): T | D; // never throws
function getFirst<T, D>(
    iter: Iterable<T>,
    defaultVal: D | NotDef = _NOTDEF,
): T | D {
    for (const item of iter) return item as T;
    if (defaultVal !== _NOTDEF) return defaultVal as D;
    throw new Error("KEY ERROR not found first item of iterator.");
}

function getLast<T>(iter: Iterable<T>): T; // throws if empty
function getLast<T, D>(
    iter: Iterable<T>,
    defaultVal: DefaultProvided<D>,
): T | D; // never throws
function getLast<T, D>(
    iter: Iterable<T>,
    defaultVal: D | NotDef = _NOTDEF,
): T | D {
    const items = Array.from(iter) as T[];
    if (items.length) return items.at(-1) as T;

    if (defaultVal !== _NOTDEF) return defaultVal as D;

    throw new Error("KEY ERROR not found last item of iterator.");
}

const FOREIGN_KEY_NO_ACTION = Symbol("NO_ACTION"),
    FOREIGN_KEY_SET_NULL = Symbol("SET_NULL"),
    FOREIGN_KEY_SET_DEFAULT_FIRST = Symbol("SET_DEFAULT_FIRST"),
    FOREIGN_KEY_SET_DEFAULT_LAST = Symbol("SET_DEFAULT_LAST"),
    FOREIGN_KEY_SET_DEFAULT_FIRST_OR_NULL = Symbol("SET_DEFAULT_FIRST_OR_NULL"),
    FOREIGN_KEY_SET_DEFAULT_LAST_OR_NULL = Symbol("SET_DEFAULT_LAST_OR_NULL"),
    FOREIGN_KEY_SET_DEFAULT_VALUE = Symbol("SET_DEFAULT_VALUE"),
    FOREIGN_KEY_SET_DEFAULT_VALUE_OR_NULL = Symbol("SET_DEFAULT_VALUE_OR_NULL"),
    FOREIGN_KEY_CUSTOM = Symbol("CUSTOM"),
    // constraints and values
    FOREIGN_KEY_NULL = Symbol("NULL"),
    FOREIGN_KEY_NOT_NULL = Symbol("NOT_NULL"),
    FOREIGN_KEY_ALLOW_NULL = Symbol("ALLOW_NULL"),
    FOREIGN_KEY_INVALID = Symbol("INVALID");
type DefaultConstraintSymbol =
    | typeof FOREIGN_KEY_NO_ACTION
    | typeof FOREIGN_KEY_SET_NULL
    | typeof FOREIGN_KEY_SET_DEFAULT_FIRST
    | typeof FOREIGN_KEY_SET_DEFAULT_LAST
    | typeof FOREIGN_KEY_SET_DEFAULT_FIRST_OR_NULL
    | typeof FOREIGN_KEY_SET_DEFAULT_LAST_OR_NULL
    | typeof FOREIGN_KEY_SET_DEFAULT_VALUE
    | typeof FOREIGN_KEY_SET_DEFAULT_VALUE_OR_NULL
    | typeof FOREIGN_KEY_CUSTOM;

type NullConstraintSymbol =
    | typeof FOREIGN_KEY_NOT_NULL
    | typeof FOREIGN_KEY_ALLOW_NULL;

export type KeyValue = string | typeof ForeignKey.NULL;

type ForeignKeyConstraintFn = (
    targetContainer: _BaseContainerModel,
    currentKeyValue?: KeyValue,
) => KeyValue;

type ConfigElement = KeyValue | ForeignKeyConstraintFn;

export class ForeignKey {
    // "nullConstraints"
    static NULL = FOREIGN_KEY_NULL;
    static NOT_NULL = FOREIGN_KEY_NOT_NULL;
    static ALLOW_NULL = FOREIGN_KEY_ALLOW_NULL;
    // Very specific use case, not sure it will stick.
    static INVALID = FOREIGN_KEY_INVALID;
    // This is a Key of target
    // it can be null, if target is empty or if not set
    // but if it is not null, it must exist in target.
    //
    // These "defaultConstraints" are implemented as pre-defined functions, similar
    // to coherence guards. They are applied of the key does not exist
    // in target, before validaton.
    // They can change the Key value (i.e. set a a new entry) but they
    // cannot change the referenced target itself or prevent it from being
    // changed. (like SQL CASCADE/RESTRICT).
    // For our case NO_ACTION and RESTRICT have a similar meaning,
    // because we can't restrict deletion of a referenced item, we
    // can only do nothing, and wait for the validation later to break,
    // which it will if the key does not exist.
    // NO_ACTION is not the default, because it is likely not the best
    // choice. However, in combination with an external coherence guard,
    // which can implement more complex constraints, it may be the best choice.
    static NO_ACTION = FOREIGN_KEY_NO_ACTION;
    // If the reference does not exist, this key will point to null,
    // this will only validate if the is allowed to be null.
    static SET_NULL = FOREIGN_KEY_SET_NULL;
    // In my opinion the best default behavior for most cases!
    static SET_DEFAULT_FIRST = FOREIGN_KEY_SET_DEFAULT_FIRST;
    static SET_DEFAULT_LAST = FOREIGN_KEY_SET_DEFAULT_LAST;
    static SET_DEFAULT_FIRST_OR_NULL = FOREIGN_KEY_SET_DEFAULT_FIRST_OR_NULL;
    static SET_DEFAULT_LAST_OR_NULL = FOREIGN_KEY_SET_DEFAULT_LAST_OR_NULL;
    // SET_DEFAULT_VALUE options must be followed by the actual value
    static SET_DEFAULT_VALUE = FOREIGN_KEY_SET_DEFAULT_VALUE;
    static SET_DEFAULT_VALUE_OR_NULL = FOREIGN_KEY_SET_DEFAULT_VALUE_OR_NULL;
    // More complex behavior can be implemented with a custom guard.
    // THE CUSTOM option must be followed by a function with the signature:
    // (targetContainer, currentKeyValue) => newKeyValue
    static CUSTOM = FOREIGN_KEY_CUSTOM;

    public readonly NULL!: typeof FOREIGN_KEY_NULL;
    public readonly INVALID!: typeof FOREIGN_KEY_INVALID;
    public readonly targetName!: string;
    public readonly dependencies!: FreezableSet<string>;
    public readonly notNull!: boolean;
    public readonly allowNull!: boolean;

    public readonly defaultConstraint!: DefaultConstraintSymbol;
    public readonly defaultValue?: KeyValue;
    public readonly [FOREIGN_KEY_CUSTOM]?: ForeignKeyConstraintFn;

    constructor(
        targetName: string,
        nullConstraint: NullConstraintSymbol,
        defaultConstraint: DefaultConstraintSymbol,
        config?: ConfigElement,
    ) {
        const Constructor = this.constructor as typeof ForeignKey;

        Object.defineProperty(this, "NULL", {
            value: FOREIGN_KEY_NULL,
        });

        Object.defineProperty(this, "INVALID", {
            value: FOREIGN_KEY_INVALID,
        });

        Object.defineProperty(this, "targetName", {
            value: targetName,
        });

        Object.defineProperty(this, "dependencies", {
            value: Object.freeze(new FreezableSet([targetName])),
        });

        {
            const notNull = nullConstraint === Constructor.NOT_NULL,
                allowNull = nullConstraint === Constructor.ALLOW_NULL;
            // No default, to human-read the model it is much better to
            // explicitly define one of these!
            if (!notNull && !allowNull)
                throw new Error(
                    `TYPE ERROR ForeignKey for ${targetName} nullConstraint ` +
                        `is neither NOT_NULL nor ALLOW_NULL which is ambigous.`,
                );

            // This is exciting, if notNull is true, target can't be
            // empty as there must be a non-null key!
            Object.defineProperty(this, "notNull", {
                value: notNull,
            });
            Object.defineProperty(this, "allowNull", {
                value: allowNull,
            });
        }

        if (
            !new Set([
                Constructor.NO_ACTION,
                Constructor.SET_NULL,
                Constructor.SET_DEFAULT_FIRST,
                Constructor.SET_DEFAULT_LAST,
                Constructor.SET_DEFAULT_FIRST_OR_NULL,
                Constructor.SET_DEFAULT_LAST_OR_NULL,
                Constructor.SET_DEFAULT_VALUE,
                Constructor.SET_DEFAULT_VALUE_OR_NULL,
                Constructor.CUSTOM,
            ]).has(defaultConstraint)
        )
            throw new Error(
                `TYPE ERROR ${this} defaultConstraint ` +
                    `is unknown: "${defaultConstraint.toString()}".`,
            );

        Object.defineProperty(this, "defaultConstraint", {
            value: defaultConstraint,
        });

        if (
            defaultConstraint === Constructor.SET_DEFAULT_VALUE ||
            defaultConstraint === Constructor.SET_DEFAULT_VALUE_OR_NULL
        ) {
            const defaultValue = config;
            // must be a valid key-value, usually string or in
            // some cases, if allowed, ForeignKey.NULL.
            // However, the future may require more complex keys, e.g. tuples
            // and I don't want to stand in the way of that with enforcing
            // types now. Invalid keys will not pass validation in any way!
            //
            // TODO: With knowledge of the target class, we could check
            // if this is a valid type for a key!
            // Object.defineProperty(this, "defaultValue", {
            //     value: defaultValue,
            // });
            if (
                typeof defaultValue !== "string" &&
                defaultValue !== ForeignKey.NULL
            )
                throw new Error(
                    "TYPE ERROR defaultValue must be KeyValue (string | ForeignKey.NULL)",
                );

            this.defaultValue = defaultValue;
        } else if (defaultConstraint === Constructor.CUSTOM) {
            const customConstraintFn = config;
            if (typeof customConstraintFn !== "function")
                throw new Error(
                    `TYPE ERROR ${this} constraint is CUSTOM, ` +
                        `but the custom argument is not a function: ` +
                        `(${typeof customConstraintFn}) "${customConstraintFn === undefined ? "customConstraintFn" : customConstraintFn.toString()}"`,
                );
            //Object.defineProperty(this, FOREIGN_KEY_CUSTOM, {
            //    value: customConstraintFn,
            //});
            this[FOREIGN_KEY_CUSTOM] = customConstraintFn;
        }
    }

    // use only for console.log/Error/debugging purposes
    toString() {
        return (
            `[${this.constructor.name}:${this.targetName} ` +
            `${this.notNull ? "NOT NULL" : "or NULL"}]`
        );
    }

    [FOREIGN_KEY_NO_ACTION](
        targetContainer: _BaseContainerModel,
        currentKeyValue: KeyValue,
    ): KeyValue {
        return currentKeyValue;
    }

    [FOREIGN_KEY_SET_NULL](/*targetContainer, currentKeyValue*/): KeyValue {
        // jshint unused: vars
        return this.NULL;
    }

    [FOREIGN_KEY_SET_DEFAULT_FIRST](
        targetContainer: _BaseContainerModel /*, currentKeyValue*/,
    ): string {
        // jshint unused: vars
        const firstKey = getFirst<string, typeof FOREIGN_KEY_NULL>(
            targetContainer.keys(),
            FOREIGN_KEY_NULL,
        );
        if (firstKey === FOREIGN_KEY_NULL)
            throw keyConstraintError(
                new Error(
                    `CONSTRAINT ERROR ${this} Can't set first key, there is no first entry.`,
                ),
            );
        return firstKey;
    }

    [FOREIGN_KEY_SET_DEFAULT_FIRST_OR_NULL](
        targetContainer: _BaseContainerModel /*, currentKeyValue*/,
    ): KeyValue {
        // jshint unused: vars
        return getFirst(targetContainer.keys(), this.NULL);
    }

    [FOREIGN_KEY_SET_DEFAULT_LAST](
        targetContainer: _BaseContainerModel /*, currentKeyValue*/,
    ): string {
        // jshint unused: vars
        const lastKey = getLast(targetContainer.keys(), this.NULL);
        if (lastKey === this.NULL)
            throw keyConstraintError(
                new Error(
                    `CONSTRAINT ERROR ${this} Can't set last key, there is no last entry.`,
                ),
            );
        return lastKey;
    }

    [FOREIGN_KEY_SET_DEFAULT_LAST_OR_NULL](
        targetContainer: _BaseContainerModel /*, currentKeyValue*/,
    ): KeyValue {
        // jshint unused: vars
        return getLast(targetContainer.keys(), this.NULL);
    }

    [FOREIGN_KEY_SET_DEFAULT_VALUE](
        targetContainer: _BaseContainerModel /*, currentKeyValue*/,
    ): KeyValue {
        // jshint unused: vars
        if (
            typeof this.defaultValue !== "string" ||
            !targetContainer.has(this.defaultValue)
        )
            throw keyConstraintError(
                new Error(
                    `CONSTRAINT ERROR ${this} Can't set defaultValue ` +
                        `"${this.defaultValue && this.defaultValue.toString()}" as key, there is no entry.`,
                ),
            );
        return this.defaultValue;
    }

    [FOREIGN_KEY_SET_DEFAULT_VALUE_OR_NULL](
        targetContainer: _BaseContainerModel /*, currentKeyValue*/,
    ): KeyValue {
        // jshint unused: vars
        if (
            typeof this.defaultValue !== "string" ||
            !targetContainer.has(this.defaultValue)
        )
            return this.NULL;
        return this.defaultValue;
    }

    constraint(
        targetContainer: _BaseContainerModel,
        currentKeyValue: KeyValue,
    ): KeyValue {
        if (
            currentKeyValue === FOREIGN_KEY_NULL ||
            !targetContainer.has(currentKeyValue)
        )
            // The default constraint is only required if the currentKeyValue
            // is not a key of targetContainer.
            return (this[this.defaultConstraint] as ForeignKeyConstraintFn)(
                targetContainer,
                currentKeyValue,
            );
        return currentKeyValue;
    }
}
