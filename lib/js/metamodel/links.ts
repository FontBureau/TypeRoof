import { FreezableSet, _BaseModel } from "./base-model.ts";

import { _NOTDEF } from "./util.ts";

export class _BaseLink {
    public readonly keyName!: string;
    public readonly dependencies!: FreezableSet<string>;
    constructor(keyName: string) {
        Object.defineProperty(this, "keyName", {
            value: keyName,
        });
        Object.defineProperty(this, "dependencies", {
            value: Object.freeze(new FreezableSet([keyName])),
        });
    }
    toString() {
        return `[${this.constructor.name} for Key: ${this.keyName}]`;
    }
}

/*
 * It's simpler at the moment not to do this, and
 * have the child explicitly request the foreign key as dependency
 * though, I'm not sure this is even interesting, from a data-hierarchical
 * point of view.
 * The simplification comes from not having to invent a new type for this,
 * which would also include the respective *OrEmpty-Types depending on the
 * Key configuration.
export class KeyValueLink extends _BaseLink {
    // resolves KeyOf to the actual [key, value]
    // key must be defined in the parent model
}
*/
export class ValueLink extends _BaseLink {
    // resolves KeyOf to the actual value
    // key must be defined in the parent model
}

export class FallBackValue {
    declare public readonly Model: typeof _BaseModel;
    declare public readonly primaryName: string;
    declare public readonly fallBackName: string;
    declare public readonly dependencies: FreezableSet<string>;
    constructor(
        primaryName: string,
        fallBackName: string,
        Model: typeof _BaseModel,
    ) {
        Object.defineProperty(this, "Model", {
            value: Model,
        });
        Object.defineProperty(this, "primaryName", {
            value: primaryName,
        });
        Object.defineProperty(this, "fallBackName", {
            value: fallBackName,
        });
        Object.defineProperty(this, "dependencies", {
            value: Object.freeze(new FreezableSet([primaryName, fallBackName])),
        });
    }
    toString() {
        return `[${this.constructor.name} for ${Array.from(this.dependencies)}]`;
    }
}

/**
 * Using this, a ForeignKey can point into a dependency loaded from a parent.
 * .E.g.:
 * , ['availableLayouts', new InternalizedDependency('availableLayouts', AvailableLayoutsModel)]
 * , ['activeLayoutKey', new ForeignKey('availableLayouts', ForeignKey.NOT_NULL, ForeignKey.SET_DEFAULT_FIRST)]
 */
export class InternalizedDependency {
    declare public readonly Model: typeof _BaseModel;
    declare public readonly dependencyName: string;
    declare public readonly dependencies: FreezableSet<string>;
    constructor(dependencyName: string, Model: typeof _BaseModel) {
        Object.defineProperty(this, "Model", {
            value: Model,
        });

        Object.defineProperty(this, "dependencyName", {
            value: dependencyName,
        });

        Object.defineProperty(this, "dependencies", {
            value: Object.freeze(new FreezableSet([dependencyName])),
        });
        Object.freeze(this);
    }
    toString() {
        return `[${this.constructor.name} for ${Array.from(this.dependencies)}]`;
    }
}

// ['availableActorTypes', new StaticDependency('availableActorTypes', availableActorTypes)]
export class StaticDependency {
    declare public readonly dependencyName: string;
    declare public readonly state: _BaseModel;
    declare public readonly Model: typeof _BaseModel | undefined;
    constructor(
        dependencyName: string,
        state: unknown,
        Model: typeof _BaseModel | symbol = _NOTDEF,
    ) {
        Object.defineProperty(this, "dependencyName", {
            value: dependencyName,
        });
        if (!(state instanceof _BaseModel))
            throw new Error(
                `TYPE ERROR state (${state}) must be a _BaseModel in ${this}.`,
            );
        if (state.isDraft)
            throw new Error(
                `VALUE ERROR state (${state}) must be immutable, but it is a draft in ${this}.`,
            );
        Object.defineProperty(this, "state", {
            value: state,
        });

        // NOTE: Model can be undefined so far, as there's yet no typing
        // of dependencies in _AbstractStructModel. However, if it is present
        // state must be an instance of it.
        // Also, for the static function createWithInternalizedDependency
        // Model is required.
        if (typeof Model === "function") {
            if (!(state instanceof Model))
                throw new Error(
                    `TYPE ERROR state (${state}) must be a ${Model.name} in ${this}.`,
                );
            Object.defineProperty(this, "Model", {
                value: Model,
            });
        }
        Object.freeze(this);
    }
    toString() {
        if (this.dependencyName)
            return `[${this.constructor.name} ${this.dependencyName}]`;
        return `[${this.constructor.name}]`;
    }

    /**
     * returns [staticDependency, [localName, internalizedDependency]]
     * usage:
     * _BaseLayoutModel.createClass(
     *     'MyModel'
     *   , ... StaticDependency.createWithInternalizedDependency(
     *                      'aDependencyName'
     *                    , 'aLocalName'
     *                    , DependencyDataModel
     *                    , dependencyDataState)
     * );
     *
     * This is a shortcut equivalent to:
     * _BaseLayoutModel.createClass(
     *   , new StaticDependency('aDependencyName', dependencyDataState, DependencyDataModel)
     *   , ['aLocalName', new InternalizedDependency('aDependencyName', DependencyDataModel)]
     *
     * In a three argument form:
     * _BaseLayoutModel.createClass(
     *     'MyModel'
     *   , ... StaticDependency.createWithInternalizedDependency(
     *                      , 'aLocalAndDependencyName'
     *                      , DependencyDataModel
     *                      , dependencyDataState)
     * );
     *
     * "localName" and "dependencyName" set to be equal, resulting in an
     *  equivalent to:
     * _BaseLayoutModel.createClass(
     *   , new StaticDependency('aLocalAndDependencyName', dependencyDataState, DependencyDataModel)
     *   , ['aLocalAndDependencyName', new InternalizedDependency('aLocalAndDependencyName', DependencyDataModel)]
     * )
     */
    static createWithInternalizedDependency(
        dependencyName: string,
        localName: string,
        Model: typeof _BaseModel,
        state: _BaseModel,
    ): [StaticDependency, [string, InternalizedDependency]];
    static createWithInternalizedDependency(
        dependencyName: string,
        Model: typeof _BaseModel,
        state: _BaseModel,
    ): [StaticDependency, [string, InternalizedDependency]];
    static createWithInternalizedDependency(
        dependencyName: string,
        ...args: unknown[]
    ): [StaticDependency, [string, InternalizedDependency]] {
        const [localName, Model, state] =
            typeof args[0] === "string"
                ? // called with four arguments
                  (args as [string, typeof _BaseModel, _BaseModel])
                : // called with three arguments
                  ([dependencyName, ...args] as [
                      string,
                      typeof _BaseModel,
                      _BaseModel,
                  ]);
        return [
            new this(dependencyName, state, Model),
            [localName, new InternalizedDependency(dependencyName, Model)],
        ];
    }
}
