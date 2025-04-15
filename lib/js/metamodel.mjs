/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */

/**
 * Building blocks and helper functions to define a Model.
 */

const _NOTDEF = Symbol('_NOTDEF');

export class CoherenceFunction {
    constructor(dependencies, fn/*(valueMap)*/) {
        Object.defineProperties(this, {
            dependencies: {value: Object.freeze(new FreezableSet(dependencies))}
          , fn: {value: fn}
          , name: {value: fn.name || '(anonymous)'}
        });
        Object.freeze(this);
    }

    static create(...args) {
        const instance = new this(...args);
        return [instance.name, instance];
    }

    // This way it goes nicely into the struct definition without
    // having to repeat the name!
    get nameItem() {
        return  [this.name, this];
    }

    toString(){
        return `[CoherenceFunction ${this.name}]`;
    }
}

// Will prevent accidental alteration, however, this is not vandalism proof.
// I tried using Javascript Proxy for this, however, it is not vandalism
// proof either (e.g. via prototype pollution), if that is a concern, an
// object with an internal map as storage and the same interface as Map
// is better.
export class FreezableMap extends Map {
    set(...args) {
        if (Object.isFrozen(this)) return this;
        return super.set(...args);
    }
    delete(...args){
        if (Object.isFrozen(this)) return false;
        return super.delete(...args);
    }
    clear() {
        if (Object.isFrozen(this)) return;
        return super.clear();
    }
}

export class FreezableSet extends Set {
    add(...args) {
        if (Object.isFrozen(this)) return this;
        return super.add(...args);
    }
    delete(...args){
        if (Object.isFrozen(this)) return false;
        return super.delete(...args);
    }
    clear() {
        if (Object.isFrozen(this)) return;
        return super.clear();
    }
}

export function sort_alpha(a, b) {
    return a.localeCompare(b, undefined, {sensitivity: 'base'});
}

// Similar to Array.prototype.map
// The map() method creates a new array populated with the results of
// calling a provided function on every element in the iterable.
function iterMap(iterable, callbackFn, thisArg=null) {
    const result = [];
    for(const element of iterable) {
        // The reason not to pass index/i (as in Array.prototype.map)
        // is that access by index is likeley not supported by
        // the iterable.
        result.push(callbackFn.call(thisArg, element, iterable));
    }
    return result;
}
function iterFilter(iterable, callbackFn, thisArg=null) {
    const result = [];
    for(const element of iterable) {
        if(callbackFn.call(thisArg, element, iterable))
            result.push(element);
    }
    return result;
}

function populateSet(s, iterable) {
    for(const item of iterable)
        s.add(item);
}

function populateArray(a, iterable) {
    for(const item of iterable)
        a.push(item);
}

// Can be used/shared by default instead of creating new empty sets
// as dependencies.
export const EMPTY_SET = Object.freeze(new FreezableSet());

      // The serialize implementation is expected to live here
export const SERIALIZE = Symbol('SERIALIZE')
  , DESERIALIZE = Symbol('DESERIALIZE')
  , SERIALIZE_FORMAT_JSON = Symbol('SERIALIZE_FORMAT_JSON')
  , SERIALIZE_FORMAT_OBJECT = Symbol('SERIALIZE_FORMAT_OBJECT')
  , SERIALIZE_FORMAT_URL = Symbol('SERIALIZE_FORMAT_URL')
  , SERIALIZE_OPTIONS=Object.freeze({
        // NOTE: there are three styles:
        //   - A list with possibly empty slots: structStoreKeys=false
        //   - A list with [key, value] pairs: structStoreKeys=true, structAsDict=false
        //   - A dictionary: structStoreKeys=true, structAsDict=true
        // The list version can be made the most compact, especially if
        // empty slots are cumulated or when (zip) compression is used
        // When used as JSON, dictionary is by far the most readable and
        // probably the nicest for human editing, however, ordered map types
        // can't use dictionaries as order may be screwed up depending on
        // the keys.
        structStoreKeys: true
      , structAsDict: true // only if structStoreKeys is true
      , format: SERIALIZE_FORMAT_JSON
      , earlyExitOnError: false
      , checkResults: false
      // TODO: if JSON is the target, numeric values could be stored as
      // numbers instead of strings, making human editing nicer.
    })
  ;


function _serializeErrorsPrependKey(key, errors) {
    const newErrors = [];
    for(const [path, message, ...more] of errors) {
        const newPath = [key];
        for(const pathPart of path)
            newPath.push(pathPart);
        newErrors.push([newPath, message, ...more]);
    }
    return newErrors;
}

// FOR a URL serialization we pack using encodeURIComponent and unpack
// using decodeURIComponent.

function _safeSerialize(modelInstance, options) {
    try {
        return modelInstance[SERIALIZE](options);
    }
    catch(error) {
        const errors = [];
        errors.push([[/*path*/], error]);
        return [errors, null];
    }
}

function serializeItem(/*_BaseModel:*/modelInstance, options=SERIALIZE_OPTIONS) {
    const isContainer = modelInstance instanceof _BaseContainerModel
      , [errors, value] = _safeSerialize(modelInstance, options)
      , resultErrors = [...errors]
      ;
    if(errors.length && options.earlyExitOnError)
        return [resultErrors, value];
    if(options.checkResults) {
        if(isContainer) {
            if(!Array.isArray(value))
                resultErrors.push([[], new Error(`VALUE ERROR NOT ARRAY ${modelInstance} `
                    + `is a container but does not produce an array`)
                    , typeof value, value]);
        }
        else if(value !== null && typeof value !== 'string') {
            resultErrors.push([[], new Error(`VALUE ERROR NOT SIMPLE ${modelInstance} `
                + `is simple but does not produce null or a string`)
                , typeof value, value]);
        }
    }
    return [resultErrors, value];
}


export function deserializeGen(Model, dependencies, serializedData, options=SERIALIZE_OPTIONS) {
    let serializedValue;
    if(options.format === SERIALIZE_FORMAT_JSON) {
        serializedValue = JSON.parse(serializedData);
    }
    else if(options.format === SERIALIZE_FORMAT_OBJECT) {
        serializedValue = serializedData;
    }
    else
        throw new Error(`UNKNOWN FORMAT OPTION deserialize ${options.format.toString()}`);
    // => gen
    return Model.createPrimalStateGen(dependencies, serializedValue, options);
}
export async function deserialize(asyncResolve, Model, dependencies, serializedString, options=SERIALIZE_OPTIONS) {
    const gen = deserializeGen(Model, dependencies, serializedString, options);
    return await driveResolveGenAsync(asyncResolve, gen);
}

export function deserializeSync(Model, dependencies, serializedString, options=SERIALIZE_OPTIONS) {
    const gen = deserializeGen(Model, dependencies, serializedString, options);
    return driveResolverGenSyncFailing(gen)
}

// I'm undecided with the interface!
// [SERIALIZE] could be a common entry point and the
// sub-classes could implement their own serialization which is called
// by this.
// OR the other way around:
// serialize would be the common entry point an subclasses would
// implement [SERIALIZE]
// FIXME: We should handle errors graceful, therefore report
// a failure and collect all failures, if not a fail early response
// is expected.
// It would be cool, if, despite of the size strategy, the return
// value of serialize would be a String or an Array. For Map/Dict
// types an Array of [key, value] entries.
// A simple Object could also be OK, but [key, value] pairs
// in an array are more explicit in preserving order (however,
// objects do so as well usually, it's just not as strictly required).
// For numbers, a string is preferred, as i.e. toFixed returns
// a string and that is used. We ¡know! the type of the values
// and can determine how to interpret them.
// EMPTY values should be empty slots in their arrays.
// We need a way to detect empty string vs EMPTY
export function serialize(/*_BaseModel:*/modelInstance, options=SERIALIZE_OPTIONS) {
    const [resultErrors, intermediateValue] = serializeItem(modelInstance, options);
    if(options.format === SERIALIZE_FORMAT_JSON)
        return [
            resultErrors
            // NOTE: even with indentation (pretty printing), this doesn't
            // look particular pretty.
          , JSON.stringify(intermediateValue, null, 2)
        ];
    else if(options.format === SERIALIZE_FORMAT_OBJECT)
        return [
            resultErrors
          , intermediateValue
        ];
    throw new Error(`UNKNOWN FORMAT OPTION serialize ${options.format.toString()}`);
}

export class _BaseModel {
    /**
     * Lifecycle Protocol API:
     *
     * constructor(oldState=null, ...) => new Model(currentInstance)=> a draft
     * dependencies => a set of names or an empty set
     * static createPrimalState(/*dependencies* /) => an immutable with "primal value" implementation specific
     * isDraft => bool
     * getDraf => a draft
     * metamorphose(...) => an immutable
     *
     */
    constructor(oldState=null) {
        if(oldState && oldState.constructor !== this.constructor)
            throw new Error(`TYPE ERROR: oldState must have the same constructor as this ${this}.`);
        this[OLD_STATE] = oldState || null;
        Object.defineProperty(this, _IS_DRAFT_MARKER, {value: true, configurable: true});
    }

    static dependencies = EMPTY_SET; // jshint ignore:line

    get dependencies() {
        return EMPTY_SET;
    }

    static createPrimalState(/*dependencies, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS*/) {
        throw new Error(`NOT IMPLEMENTED createPrimalState in ${this}.`);
    }

    /* eslint-disable require-yield */
    static* createPrimalStateGen() {
        throw new Error(`NOT IMPLEMENTED createPrimalStateGen in ${this}.`);
    }
    /* eslint-enable require-yield */


    getDraft() {
        if(this.isDraft)
            throw new Error(`LIFECYCLE ERROR ${this} must be in immutable mode to get a draft for it.`);
        return new this.constructor(this);
    }

    get oldState() {
        if(!this.isDraft)
            throw new Error(`LIFECYCLE ERROR ${this} must be a draft to have an oldState.`)
        return this[OLD_STATE];
    }

    static createPrimalDraft(dependencies, ...args) {
        return this.createPrimalState(dependencies, ...args).getDraft();
    }

    get isDraft() {
        return this[_IS_DRAFT_MARKER];
    }

    /* eslint-disable require-yield */
    * metamorphoseGen() {
        throw new Error(`NOT IMPLEMENTED metamorphose in ${this}.`);
    }
    /* eslint-enable require-yield */

    /**
     * old style interface
     *
     * This will fail if the resolver is required at all, that's
     * how things used to be, but to deserialize a state and be able to
     * load missing resources (e.g. fonts), a more sophisticated approach
     * is required.
     */
    metamorphose(...dependencies) {
        const gen = this.metamorphoseGen(...dependencies);
        return driveResolverGenSyncFailing(gen);
    }

    // qualifiedKey => can distinguish between alias/shortcut and
    // absolut entry. e.g. "@firstChild" vs ".0"
    get(qualifiedKey) {
        throw new Error(`NOT IMPLEMENTED get (of "${qualifiedKey}") in ${this}.`);
    }

    // Each model will have to define this.
    get value() {
        throw new Error(`NOT IMPLEMENTED get value in ${this}.`);
    }

    // use only for console.log/Error/debugging purposes
    toString() {
        return `[model ${this.constructor.name}:${this.isDraft ? 'draft' : 'immutable'}]`;
    }

    toObject() { // => JSON compatible ... make this toJSON?
         throw new Error(`NOT IMPLEMENTED toObject in ${this}.`);
    }

    fromRawValue(raw) {
        // static on the class!
        if(!('fromRawValue' in this.constructor))
            throw new Error(`NOT IMPLEMENTED static fromRawValue in ${this.constructor}.`);
        return this.constructor.fromRawValue(raw);
    }

    [SERIALIZE](/*SerializeOptions: options*/) {
        throw new Error(`NOT IMPLEMENTED [SERIALIZE] in ${this}.`);
    }

    [DESERIALIZE](/*serializedValue, SerializeOptions: options*/){
        throw new Error(`NOT IMPLEMENTED [DESERIALIZE] in ${this}.`);
    }
}

// This is to mark simple values in contrast to Container values
// as _BaseContainerModel is also a _BaseModel, _BaseModel
// is not ideal to make that distiction.
export class _BaseSimpleModel extends _BaseModel {
    // PASS
    // TODO: "SimpleModel" general API requirements should move here

    /**
     * old style interface
     */
    static createPrimalState(_/*dependencies=null*/, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS) {
        return new this(null, serializedValue, serializeOptions);
    }

    /**
     * So far, there are no dependencies in the _BaseSimpleModel types
     * hence this behaves just like createPrimalState, however, it
     * returns a generator.
     *
     * So, with this, within a metamorphoseGen, we can call:
     * instance = yield *Model.createPrimalStateGen(dependencies, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS)
     */
     /* eslint-disable require-yield */
    static* createPrimalStateGen(_/*dependencies=null*/, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS) {
        //
        return this.createPrimalState(null, serializedValue, serializeOptions);
    }
    /* eslint-enable require-yield */
}

function _serializeContainer(containerItem, keepKeys, options=SERIALIZE_OPTIONS) {
    const resultErrors = []
      , resultValues = []
      ;
    for(const [key, childItem] of containerItem) {
        const [errors, serializedValue] = serializeItem(childItem, options);
        resultErrors.push(..._serializeErrorsPrependKey(key, errors));
        if(errors.length && options.earlyExitOnError)
            break;

        // keep out empty values from the result, caution, empty lists
        // will require some extra action in deserialize;
        if(serializedValue === null
                || Array.isArray(serializedValue) && serializedValue.length === 0
        ) {
            if(!keepKeys) {
                // Register <empty item> at position.
                // Actually: put a null value there, as:
                //       JSON.stringifiy([,,]) => '[null, null]'
                // so, at least with JSON serialization, it wont be
                // distinguishable.
                resultValues.push(null);
            }
            // else skip: no key === empty
        }
        else
            resultValues.push(keepKeys ? [key, serializedValue] : serializedValue);
    }
    return [resultErrors, resultValues.length ? resultValues : null];
}

export class _BaseContainerModel extends _BaseModel {
    /**
     * old style interface
     */
    static createPrimalState(dependencies, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS) {
        return new this(null, dependencies, serializedValue, serializeOptions);
    }

    /**
     * So, with this, within a metamorphoseGen, we can call:
     * instance = yield *Model.createPrimalStateGen(dependencies, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS)
     *
     *
     * gen = Model.createPrimalStateGen(dependencies, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS)
     * await driveResolveGenAsync(asyncResolve, gen)
     */
    static* createPrimalStateGen(dependencies, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS) {
        const instance = new this(null, _DEFERRED_DEPENDENCIES, serializedValue, serializeOptions)
          , gen = instance.metamorphoseGen(dependencies)
          ;
        return yield *gen; // => instance OR oldState
    }

    *[Symbol.iterator]() {
        yield *this.value.entries();
    }
    get(/*key*/) {
        // jshint unused: vars
        throw new Error(`NOT IMPLEMENTED get(key) in ${this}.`);
    }
    set(/*key, entry*/) {
        // jshint unused: vars
        throw new Error(`NOT IMPLEMENTED get(key) in ${this}.`);
    }

    hasOwn(key) {
        throw new Error(`NOT IMPLEMENTED hasOwn(key) in ${this} for "${key}".`);
    }
    ownKeys(){
        throw new Error(`NOT IMPLEMENTED ownKeys() in ${this}.`);
    }
    // override if ownership and available keys differ
    has(key) {
        return this.hasOwn(key);
    }
    // override if ownership and available keys differ
    keys() {
        return this.ownKeys();
    }
    *entries() {
        yield* this;
    }
    // override if ownership and available keys differ
    *allEntries() {
        yield* this.entries();
    }
}

const FOREIGN_KEY_NO_ACTION = Symbol('NO_ACTION')
  , FOREIGN_KEY_SET_NULL = Symbol('SET_NULL')
  , FOREIGN_KEY_SET_DEFAULT_FIRST = Symbol('SET_DEFAULT_FIRST')
  , FOREIGN_KEY_SET_DEFAULT_LAST = Symbol('SET_DEFAULT_LAST')
  , FOREIGN_KEY_SET_DEFAULT_FIRST_OR_NULL = Symbol('SET_DEFAULT_FIRST_OR_NULL')
  , FOREIGN_KEY_SET_DEFAULT_LAST_OR_NULL = Symbol('SET_DEFAULT_LAST_OR_NULL')
  , FOREIGN_KEY_SET_DEFAULT_VALUE = Symbol('SET_DEFAULT_VALUE')
  , FOREIGN_KEY_SET_DEFAULT_VALUE_OR_NULL = Symbol('SET_DEFAULT_VALUE_OR_NULL')
  , FOREIGN_KEY_CUSTOM = Symbol('CUSTOM')
  ;

export class ForeignKey {
    // jshint ignore: start
    // "nullConstraints"
    static NULL = Symbol('NULL');
    static NOT_NULL = Symbol('NOT_NULL');
    static ALLOW_NULL = Symbol('ALLOW_NULL');
    static INVALID = Symbol('INVALID');
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
    // jshint ignore: end

    constructor(targetName, nullConstraint,  defaultConstraint, ...config) {

        Object.defineProperty(this, 'NULL', {
            value: this.constructor.NULL
        });

        Object.defineProperty(this, 'INVALID', {
            value: this.constructor.INVALID
        });


        Object.defineProperty(this, 'targetName', {
            value: targetName
        });

        Object.defineProperty(this, 'dependencies', {
            value: Object.freeze(new FreezableSet([targetName]))
        });

        {
            const notNull = nullConstraint === this.constructor.NOT_NULL
              , allowNull = nullConstraint === this.constructor.ALLOW_NULL
              ;
            // No default, to human-read the model it is much better to
            // explicitly define one of these!
            if(!notNull && !allowNull)
                throw new Error(`TYPE ERROR ForeignKey for ${targetName} nullConstraint `
                                +`is neither NOT_NULL nor ALLOW_NULL which is ambigous.`);

            // This is exciting, if notNull is true, target can't be
            // empty as there must be a non-null key!
            Object.defineProperty(this, 'notNull', {
                value: notNull
            });
            Object.defineProperty(this, 'allowNull', {
                value: allowNull
            });
        }

        if(!new Set([ this.constructor.NO_ACTION, this.constructor.SET_NULL
                    , this.constructor.SET_DEFAULT_FIRST, this.constructor.SET_DEFAULT_LAST
                    , this.constructor.SET_DEFAULT_FIRST_OR_NULL , this.constructor.SET_DEFAULT_LAST_OR_NULL
                    , this.constructor.SET_DEFAULT_VALUE, this.constructor.SET_DEFAULT_VALUE_OR_NULL
                    , this.constructor.CUSTOM
                ]).has(defaultConstraint))
            throw new Error(`TYPE ERROR ${this} defaultConstraint `
                        +`is unkown: "${defaultConstraint}".`);

        Object.defineProperty(this, 'defaultConstraint', {
            value: defaultConstraint
        });

        if(defaultConstraint === this.constructor.SET_DEFAULT_VALUE
                || defaultConstraint === this.constructor.SET_DEFAULT_VALUE_OR_NULL) {
            const defaultValue = config[0];
            // must be a valid key-value, usually string, number or in
            // some cases, if allowed, ForeignKey.NULL.
            // However, the future may require more complex keys, e.g. tuples
            // and I don't want to stand in the way of that with enforcing
            // types now. Invalid keys will not pass validation in any way!
            //
            // TODO: With knowledge of the target class, we could check
            // if this is a valid type for a key!
            Object.defineProperty(this, 'defaultValue', {
                value: defaultValue
            });
        }
        else if(defaultConstraint === this.constructor.CUSTOM) {
            const customConstraintFn = config[0];
            if(typeof customConstraintFn !== 'function')
                throw new Error(`TYPE ERROR ${this} constraint is CUSTOM, `
                    + `but the custom argument is not a function: `
                    + `(${typeof customConstraintFn}) "${customConstraintFn}"`);
            Object.defineProperty(this, FOREIGN_KEY_CUSTOM, {
                value: customConstraintFn
            });
        }
    }

    // use only for console.log/Error/debugging purposes
    toString() {
        return `[${this.constructor.name}:${this.targetName} `
              +`${this.notNull ? 'NOT NULL' : 'or NULL'}]`;
    }

    [FOREIGN_KEY_NO_ACTION](targetContainer, currentKeyValue) {
        return currentKeyValue;
    }

    [FOREIGN_KEY_SET_NULL](/*targetContainer, currentKeyValue*/) {
        // jshint unused: vars
        return this.NULL;
    }

    [FOREIGN_KEY_SET_DEFAULT_FIRST](targetContainer/*, currentKeyValue*/) {
        // jshint unused: vars
        const firstKey = getFirst(targetContainer.keys(), this.NULL);
        if(firstKey === this.NULL)
            throw keyConstraintError(new Error(`CONSTRAINT ERROR ${this} Can't set first key, there is no first entry.`));
        return firstKey;
    }

    [FOREIGN_KEY_SET_DEFAULT_FIRST_OR_NULL](targetContainer/*, currentKeyValue*/) {
        // jshint unused: vars
        return getFirst(targetContainer.keys(), this.NULL);
    }

    [FOREIGN_KEY_SET_DEFAULT_LAST](targetContainer/*, currentKeyValue*/) {
        // jshint unused: vars
        const lastKey =  getLast(targetContainer.keys(), this.NULL);
        if(lastKey === this.NULL)
            throw new keyConstraintError(Error(`CONSTRAINT ERROR ${this} Can't set last key, there is no last entry.`));
        return lastKey;
    }

    [FOREIGN_KEY_SET_DEFAULT_LAST_OR_NULL](targetContainer/*, currentKeyValue*/) {
        // jshint unused: vars
        return getLast(targetContainer.keys(), this.NULL);
    }

    [FOREIGN_KEY_SET_DEFAULT_VALUE](targetContainer/*, currentKeyValue*/) {
        // jshint unused: vars
        if(!targetContainer.has(this.defaultValue))
            throw keyConstraintError(new Error(`CONSTRAINT ERROR ${this} Can't set defaultValue `
                    +   `"${this.defaultValue}" as key, there is no entry.`));
        return this.defaultValue;
    }

    [FOREIGN_KEY_SET_DEFAULT_VALUE_OR_NULL](targetContainer/*, currentKeyValue*/) {
        // jshint unused: vars
        if(!targetContainer.has(this.defaultValue))
            return this.NULL;
        return this.defaultValue;
    }

    constraint(targetContainer, currentKeyValue) {
        if(!currentKeyValue || !targetContainer.has(currentKeyValue))
            // The default constraint is only required if the currentKeyValue
            // is not a key of targetContainer.
            return this[this.defaultConstraint](targetContainer, currentKeyValue);
        return currentKeyValue;
    }
}

export class _BaseLink {
    constructor(keyName) {
        Object.defineProperty(this, 'keyName', {
            value: keyName
        });
        Object.defineProperty(this, 'dependencies', {
            value: Object.freeze(new FreezableSet([keyName]))
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
 * which would also include the respective *OrEmpty-Types depnding on the
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
    constructor(primaryName, fallBackName, Model) {
        Object.defineProperty(this, 'Model', {
            value: Model
        });
         Object.defineProperty(this, 'primaryName', {
            value: primaryName
        });
        Object.defineProperty(this, 'fallBackName', {
            value: fallBackName
        });
        Object.defineProperty(this, 'dependencies', {
            value: Object.freeze(new FreezableSet([primaryName, fallBackName]))
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
    constructor(dependencyName, Model) {
        Object.defineProperty(this, 'Model', {
            value: Model
        });

        Object.defineProperty(this, 'dependencyName', {
            value: dependencyName
        });

        Object.defineProperty(this, 'dependencies', {
            value: Object.freeze(new FreezableSet([dependencyName]))
        });
        Object.freeze(this);
    }
    toString() {
        return `[${this.constructor.name} for ${Array.from(this.dependencies)}]`;
    }
}

// ['availableActorTypes', new StaticDependency('availableActorTypes', availableActorTypes)]
export class StaticDependency {
    constructor(dependencyName, state, Model=_NOTDEF) {
        Object.defineProperty(this, 'dependencyName', {
            value: dependencyName
        });
        if(!(state instanceof _BaseModel))
            throw new Error(`TYPE ERROR state (${state.toString()}) must be a _BaseModel in ${this}.`);
        if(state.isDraft)
            throw new Error(`VALUE ERROR state (${state.toString()}) must be immutable, but it is a draft in ${this}.`);
        Object.defineProperty(this, 'state', {
            value: state
        });

        // NOTE: Model can be undefined so far, as there's yet no typing
        // of dependencies in _AbstractStructModel. However, if it is present
        // state must be an instance of it.
        // Also, for the static function createWithInternalizedDependency
        // Model is required.
        if(Model !== _NOTDEF) {
            if(!(state instanceof Model))
                throw new Error(`TYPE ERROR state (${state.toString()}) must be a ${Model.name} in ${this}.`);
            Object.defineProperty(this, 'Model', {
                value: Model
            });
        }
        Object.freeze(this);
    }
    toString() {
        if(this.dependencyName)
            return `[${this.constructor.name} ${(this.dependencyName)}]`;
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
    static createWithInternalizedDependency(dependencyName, ...args/* localName?, Model, state */) {
        const [localName, Model, state] = typeof args[0] === 'string'
              // called with four arguments
            ? args
              // called with three arguments
            : [dependencyName, ...args] // localName === dependencyName
            ;
        return [
            new this(dependencyName, state, Model)
          , [localName, new InternalizedDependency(dependencyName, Model)]
        ];
    }
}

export function getFirst(iter, defaultVal=_NOTDEF) {
    for(const item of iter)
        return item;

    if(defaultVal !== _NOTDEF)
        return defaultVal;

    throw new Error('KEY ERROR not found first item of iterator.');
}

export function getLast(iter, defaultVal=_NOTDEF) {
    const items = Array.from(iter);
    if(items.length)
        return items.at(-1);

    if(defaultVal !== _NOTDEF)
        return defaultVal;

    throw new Error('KEY ERROR not found last item of iterator.');
}

// Set has no well defined order, we can just remove any item.
// Would be different with an explicitly "OrderedSet".
function setPop(s) {
    let item;
    // we now know one item, can stop the iterator immediately!
    for(item of s) break;
    s.delete(item);
    return item;
}

function _mapGetOrInit(map, name, init) {
    let result = map.get(name);
    if(result === undefined) {
        result = init();
        map.set(name, result);
    }
    return result;
}

// CAUTION noDepsSet and dependantsMap will be changed!
export function topologicalSortKahn(noDepsSet, requirementsMap, dependantsMap) {
    const topoList = []; // L ← Empty list that will contain the sorted elements (a topologically sorted order)
    // noDepsSet: S ← Set of all nodes with no incoming edge

    // console.log('topologicalSortKahn noDepsSet', noDepsSet);
    // console.log('topologicalSortKahn requirementsMap', requirementsMap);
    // console.log('topologicalSortKahn dependantsMap', dependantsMap);

    // Kahn's algorithm, took it from https://en.wikipedia.org/wiki/Topological_sorting
    while(noDepsSet.size) { // while S is not empty do
        const name  = setPop(noDepsSet);// remove a node n from S
        topoList.push(name);// add n to L
        // console.log(`topologicalSortKahn get name "${name}"`, 'requirementsMap.get(name)', requirementsMap.get(name));
        if(!requirementsMap.has(name)) continue;
        for(const nodeM of requirementsMap.get(name)) { // for each node m with an edge e from n to m do
            const dependencies = dependantsMap.get(nodeM);
            dependencies.delete(name); // remove edge e from the graph
            if(dependencies.size === 0) { //if m has no other incoming edges then
                noDepsSet.add(nodeM); // insert m into S
                dependantsMap.delete(nodeM);
            }
        }
    }

    if(dependantsMap.size) { //if graph has edges then
        //return error (graph has at least one cycle)
        const messages = Array.from(dependantsMap).map(
            ([dependant, dependencies])=> `"${dependant}"(${Array.from(dependencies).join(', ')})`
        );
        throw new Error(`CYCLIC DEPENDENCIES ERROR unresolvable:\n    ${messages.join('\n    ')}`
                      + `\nTopological order so far: ${topoList.join(', ')}`);
    }
    //  return L   (a topologically sorted order)
    return topoList;
}

function* allEntries(...withEntries) {
    for(const item of withEntries)
        yield* item.entries();
}

function* allKeys(...withKeys) {
    for(const item of withKeys)
        yield* item.keys();
}

function getTopologicallySortedInitOrder(coherenceFunctions, fields, foreignKeys
            , links, internalizedDependencies, fallBackValues, externalDependencies) {

    // links depend on their link.keyName
    // keys depend on their key.targetName
    // fields depend on their field.dependencies
    // coherenceFunctions depend on their coherenceFunction.dependencies
    // internalizedDependencies depend on their internalizedDependency/dependencyName
    // fallBackValues depend on their primaryName and fallBackName
    const noDepsSet = new Set(allKeys(externalDependencies, coherenceFunctions
                , fields, foreignKeys, links, internalizedDependencies, fallBackValues)
          ) //S ← Set of all nodes with no incoming edge
        , requirementsMap = new Map()// [dependency] => {...dependants}
        , dependantsMap = new Map()
        ;

    // FIXME: putting coherenceFunctions first as they must execute as early as
    //        possible. The issue is, they can change the values of fields
    //        and therefore, before the fields are used in as dependencies
    //        anywhere else (e.g. in other fields) the coherence functions
    //        using them should already be done. however, it's not that
    //        straight forward and a second thought must be made.
    //        In a way, it is as if a field with a dependecy to another
    //        field is also dependant on the coherence function of that
    //        other field (dependent on the fact that the function has
    //        been executed)
    //        WILL have to explore deeper!
    for(const [name, entry] of allEntries(coherenceFunctions, fields
                        , foreignKeys, links, internalizedDependencies, fallBackValues)) {
        if(entry.dependencies.size === 0)
            continue;
        if(internalizedDependencies.has(name))
            // These are not required for initOrder and in fact
            // if name === internalizedDependencies.dependencyName
            // these create circular dependencies
            // However, we need the name as possible dependenciy for
            // the other items.
            continue;
        noDepsSet.delete(name);
        dependantsMap.set(name, new Set(entry.dependencies));
        for(const dependeny of entry.dependencies)
            _mapGetOrInit(requirementsMap, dependeny, ()=>[]).push(name);
    }
    return topologicalSortKahn(noDepsSet, requirementsMap, dependantsMap);
}





const IMMUTABLE_WRITE_ERROR = Symbol('IMMUTABLE_WRITE_ERROR')
  // FIXME: rename to  _HAS_DRAFT_FOR_POTENTIAL_WRITE_PROXY, ...?
  , _LOCAL_PROXIES = Symbol('_LOCAL_PROXIES')
  , _OLD_TO_NEW_SLOT = Symbol('_OLD_TO_NEW_SLOT')
  , KEY_CONSTRAINT_ERROR = Symbol('KEY_CONSTRAINT_ERROR')
  , _HAS_DRAFT_FOR_PROXY = Symbol('_HAS_DRAFT_FOR_PROXY')
  , _HAS_DRAFT_FOR_OLD_STATE_KEY = Symbol('_HAS_DRAFT_FOR_OLD_STATE_KEY')
  , _GET_DRAFT_FOR_PROXY = Symbol('_GET_DRAFT_FOR_PROXY')
  , _GET_DRAFT_FOR_OLD_STATE_KEY = Symbol('_GET_DRAFT_FOR_OLD_STATE_KEY')
  , DRAFT_KEY_ERROR = Symbol('DRAFT_KEY_ERROR')
  , DELIBERATE_RESOURCE_RESOLVE_ERROR = Symbol('DELIBERATE_RESOURCE_RESOLVE_ERROR')
  ;

/**
 * Decide if proxification is required for item:
 * If it is a _BaseModel (_BaseContainerModel?) in immutable state,
 * it's required. If it is a draft or not a _BaseMode/_BaseContainerModel
 * it's likely not required;
 * Esecially if item is already a draft, we should not wrap it.
 */
function _requiresPotentialWriteProxy(item) {
    if(!(item instanceof _BaseModel))
        return false;
    // _BaseSimpleModel or _BaseContainerModel
    if(item.isDraft)
        return false;
    // immutable (not a draft)
    return true;
}

/**
 * usage: throw immutableWriteError(new Error(`My Message`));
 *
 * Reasoning: it's complicated to inherit from Error in JavaScript, as
 * a lot of tooling (browser developer console etc.) doesn't handle these
 * cases well. Hence it's better to use just the original Error class.
 *
 * To decide which kind of error is handled, `instanceof` is hence not
 * an option anymore. Looking after a string in the message can be an option
 * though, but this is a multi-use of the message an thus has the potential
 * of false positives.
 * Setting markers to the error instance is a good way, as it is very
 * explicit and does not re- or double-use existing mechanisms.
 *
 * Using a function to create the Error is not ideal, because it adds a
 * line to the traceback that is missleading and annoying.
 *
 * Adding the marker directly after creation of the error is good, but
 * potentially a lot of code duplication. It also requires to go from one
 *     line to trow an error to three lines:
 *     const error = new Error('My Message');
 *     error.marker = MyMarker
 *     throw error;
 *
 * Hence, these functions seem to be the best compromise:
 */

function _markError(symbol, error, data=null) {
    error[symbol] = data || true;
    return error;
}
function _isMarkedError(symbol, error) {
    return  Object.hasOwn(error, symbol);
}

// exported so "CUSTOM" constraints can use these
export const immutableWriteError = _markError.bind(null, IMMUTABLE_WRITE_ERROR)
  , keyConstraintError = _markError.bind(null, KEY_CONSTRAINT_ERROR)
  , draftKeyError = _markError.bind(null, DRAFT_KEY_ERROR)
  , deliberateResourceResolveError = _markError.bind(null, DELIBERATE_RESOURCE_RESOLVE_ERROR)
  ;

export const isImmutableWriteError = _isMarkedError.bind(null, IMMUTABLE_WRITE_ERROR)
  , isKeyConstraintError = _isMarkedError.bind(null, KEY_CONSTRAINT_ERROR)
  , isDraftKeyError = _isMarkedError.bind(null, DRAFT_KEY_ERROR)
  , isDeliberateResourceResolveError = _isMarkedError.bind(null, DELIBERATE_RESOURCE_RESOLVE_ERROR)
  ;

/**
 * `parent` is either a draft or a proxified immutable (_IS_POTENTIAL_WRITE_PROXY)
 *
 * one strong thought, a bit disturbing, is that if a value
 * at a key is replaced by a new value, that is not based on
 * the OLD_STATE value, the proxy we gave out is invalid, we
 * can't in good faith redirect to the new value, the relation
 * is basically broken.
 * one way would be to revoke the proxy!
 * If we gave out the draft elemnt directly, however, it would not
 * be revokeable! The reference would persist, even if its slot in its
 * parent would be replaced, so that's the behavior I'm looking for.
 * This means, we always return the draft, on an attempt to write, but,
 * if it's slot is already taken, by an elemnt that is not related
 * i.e. it's old state is not the immutable we know.
 * SO: parent.getDraftFor(key) could return a draft that is not
 * related to the `that` value of this proxy, we should detect that
 * case, using draft[OLD_STATE] === that may even be too weak(!!!)
 * in some circumstances. commapre proxy identity? (possible?) maybe
 * with custom symmbols...?
 *
 * But if that is identical, it is hard to decide if the draft is
 * logically correct. We could mark if parent created the draft
 * itself AND for key i.e. in getDraftFor(key), instead of getting
 * draft via a set-like command.
 * Since we're dealing with immmutable objects, there could be multiple
 * items in parent at different keys with the same, immutable, identity.
 * However, when writing, each parent[key] must become a separate identity
 * so that we don't produce weird side effects.
 *
 * If parent is not a draft at this point we, definitely want to write,
 * so parent must become a draft, and it's parents, all the way up the chain!
 *
 * `parent.getDraftFor(key)` triggers the immutable write error and that
 * way escalates to the top:
 *
 * [root] parent 0 -> a draft
 * [A] -> itemA_Proxy parent - 1 -> a potential write immutable
 *     [B] -> itemB_Proxy parent - 2 -> a potential write immutable
 *         [C] -> itemC_Proxy parent - 3 -> a potential write immutable
 *             [D] -> itemD_Proxy a potential write immutable
 *
 * root.get('A').get('B').get('C').get('D').set('E', someBasicValue)
 *
 * itemD.set('E', someBasicValue)
 * triggers itemD_Proxy trap for set
 *     trap-> parent.getDraftFor('D') // where parent is itemC_Proxy
 *     triggers itemC_Proxy trap for getDraftFor('D')
 *         trap->parent.getDraftFor('C') // where parent is itemB_Proxy
 *         triggers itemB_Proxy trap for getDraftFor('C')
 *             trap->parent.getDraftFor('B') // where parent is itemA_Proxy
 *             triggers itemA_Proxy trap for getDraftFor('B')
 *                 trap->parent.getDraftFor('A') // where parent is root
 *                 root is a draft already, it just returns the draft for item 'A'
 *                 => itemA_Draft
 *             => itemB_Draft
 *         => itemC_Draft
 *     => itemD_Draft
 *     itemD_Draft.set('E', someBasicValue);
 */

// exported for debugging!
export class _PotentialWriteProxy {
    // jshint ignore: start
    static IS_PROXY = Symbol('_POTENTIAL_WRITE_PROXY_IS_PROXY');
    static GET_IMMUTABLE = Symbol('_POTENTIAL_WRITE_PROXY_GET_IMMUTABLE');
    static GET_DRAFT = Symbol('_POTENTIAL_WRITE_PROXY_GET_DRAFT');
    static GET = Symbol('_POTENTIAL_WRITE_PROXY_GET');
    // jshint ignore: end

    static isProxy(maybeProxy) {
        return maybeProxy && maybeProxy[this.IS_PROXY] || false;
    }
    static create(parent, immutable, key=null) {
        // FIXME ?? could return immutable[_POTENTIAL_WRITE_PROXY_GET_IMMUTABLE]
        // WHY WOULD THIS HAPPEN?
        if(_PotentialWriteProxy.isProxy(immutable))
            return immutable;

        // If proxyfication is not required, return the (immutable?) value.
        if(!_requiresPotentialWriteProxy(immutable))
            return immutable;

        // Do not proxy and trap the wrapped type, parent takes over
        // that role. The wrapped child is not proxified as the wrapper
        // takes care of all the duties.
        if(parent instanceof _AbstractDynamicStructModel && immutable instanceof parent.WrappedType
                    && unwrapPotentialWriteProxy(parent).wrapped === immutable)
            return immutable;

        if(_PotentialWriteProxy.isProxy(parent)) {
            if(immutable !== parent[_PotentialWriteProxy.GET_IMMUTABLE].get(key)){
                // This is a bit wild, however, see the comment at the
                // bottom of _handlerGet for when this would be triggered.
                throw new Error(`ASSERTION ERROR: immutable must be at ${key} of parent immutable!`);
            }

            if(!parent.hasOwn(key))
                // parent won't create a draft for this
                return immutable;

            // We must not return a proxy if the respective draft already exists
            if(parent[_HAS_DRAFT_FOR_OLD_STATE_KEY](key))
                // This is the reason why this check cant be in the _PotentialWriteProxy constructor
                return parent[_GET_DRAFT_FOR_OLD_STATE_KEY](key);

            // Parent is not a draft, hence it's a proxy of an immutable
            // and thus we got to go via key!
            return new _PotentialWriteProxy(parent, immutable, key);
        }
        // can call without the parent.hasDraftFor check
        // as it must get called from within parent in this case!
        if(parent.isDraft)
            return new _PotentialWriteProxy(parent, immutable);

        throw new Error(`TYPE ERROR parent must be a draft or a potential write proxy of an immutable.`);
    }

    createMethodProxy (fnName, fn) {
        if(_PotentialWriteProxy.isProxy(fn)) {
            // I don't actually think this case happens, but if it does, it
            // will be interesting to observe the case!
            // A possible solution would ne to return the fn un-augmented:
            //    return fn;
            // But for now raise:
            throw new Error(`TOO MUCH PROXYIFICATIAN on a function that is already a proxy: "${fnName}".`);
        }

        const getterAPIs = new Set(['get' /* possibly 'slice', but requires attention below? */]);
        const handler = {
            get: function(targetFn, prop, receiver) {
                // assert targetFn === fn
                // so, unlikely/seldom that we use a getter on it, maybe for
                // fn.name ... but event that unlikely required!
                if (prop === _PotentialWriteProxy._IS_PROXY)
                    return true;
                if (prop === _PotentialWriteProxy.GET)
                    return targetFn;
                return Reflect.get(targetFn, prop, receiver);
            }
          , apply: function(targetFn, thisArgument, argumentsList) {
                // assert targetFn === fn
                // Could be a setter or getter method!
                // There won't be a confused setter that also acts as a getter
                // i.e. raises isImmutableWriteError and returns another immutable
                // Could be as well, for variable length types:
                //      delete(key)
                //      pop(), shift()
                //      push(...entires), unshift(...entires)
                //      AND splice(start, deleteCount, ...entries)
                //      splice is not a "confused setter" in so far that it
                //      doesn't return anything that must be proxified on the way
                //      out, much more, proxy connections are broken up by splice.
                // NOTE: "slice" would be like get
                const draftOrThis = this.hasDraft() ? this.getDraft() : thisArgument;
                let result;
                try {
                    result = Reflect.apply(targetFn, draftOrThis, argumentsList);
                }
                catch(error) {
                    if(isImmutableWriteError(error)) {
                        // This is mutating, called on an immmutable!
                        const draft = this.getDraft();
                        return Reflect.apply(targetFn, draft, argumentsList);
                    }
                    else
                        throw error;
                }

                if(!getterAPIs.has(fnName) || !_requiresPotentialWriteProxy(result))
                    return result;

                // It's a getter AND _requiresPotentialWriteProxy
                // i.e. proxify the next level of children.
                //
                // getter implies _requiresPotentialWriteProxy === true
                //      unless result is already a proxy!
                //
                // in which case is result a proxy and in which case not?
                //
                // is thisArgument a draft or an immutable at this point?

                // CAUTION need key, but fishing for it is wonky.
                // Maybe this could be done better!
                // CAUTION in case of 'slice' result would be an array!
                if(!getterAPIs.has(fnName))
                    throw new Error(`UNKOWN GETTER API don't know how to get arguments for method "${fnName}" `
                        +  `from parent ${thisArgument} arguments: ${argumentsList.join(', ')}.`);
                const key = argumentsList[0];
                // assert:
                // if(result !== thisArgument[fnName](key)) {
                //     throw new Error(`KEY FINDING ERROR don't know how to get key for ${result} `
                //         +  `from parent ${thisArgument} method ${fnName} arguments: ${argumentsList.join(', ')}.`);
                // }

                // `fn` could be e.g. the `get` function or similar and hence
                // return a _BaseModel child that requires the potentialWriteProxy.
                // It is very interesting how the write on setting to
                // draft will happen/be adressed. I.e. in the example using
                // the `set` method, however, that is arbitrary, and we need
                // a way to identify and call correctly the corresponding setter
                // function. This is injected and the original potentialWriteProxy
                // has to take care of this!

                // => ??? when exactly do this?
                // this is calling: potentialWriteProxy(parentItemProxy, immutableResult)
                // it is important to create the full proxy chain!


                // from the orign on ...
                // we started in a draft of a container
                //      we returned a proxified immutable via the drafts get method
                //          we used the proxified immutables get method and arrived here!
                //              result is another immutable
                //
                // we write to resultProxy.push(entry)
                //  => isImmutableWriteError
                //      => draft = getDraft();
                //         !!!parent[_GET_DRAFT_FOR_PROXY](closureState.proxy)!!!!
                // BUT:
                //
                // if(!this.isDraft)
                //     throw immutableWriteError(new Error(`IMMUTABLE WRITE ATTEMPT `
                //         +`${this}.getDraftFor(${key}) is immutable, not a draft.`));

                // if(!this[_LOCAL_PROXIES].byProxy.has(proxy))
                //     return false;

                return this.getPotentialWriteProxy(key, result);
            }
        };
        return new Proxy(fn, {
            get: handler.get.bind(this)
          , apply: handler.apply.bind(this)
        });
    }

    constructor(parent, immutable, key=null) {
        this.immutable = immutable;
        this.parent = parent;
        if(key !== null && (!_PotentialWriteProxy.isProxy(parent)
                   // get would also raise Key Error
                || parent[_PotentialWriteProxy.GET_IMMUTABLE].get(key) !== immutable))
            throw new Error(`PROXY ERROR can't specify key "${key}" when parent is not a proxy or `
                           + `when immutable is not at parent.get(key).`);
        this.key = key;
        this.draft = null;

        // Could possibly rename '_handlerGet' to 'get' and
        // '_handlerSet' to 'set' and just do: new Proxy(immutable, this);
        // However, that way, accidentially, we could implement other
        // traps, and this way the traps are very explicit.
        this.proxy = new Proxy(immutable, {
              get: this._handlerGet.bind(this)
            , set: this._handlerSet.bind(this)
        });
        // This way the actual instance (this) PotentialWriteProxy remains hidden!
        return this.proxy;
    }
    hasDraft() {
        if(this.draft !== null)
            return true;
        if(this.key !== null)
            return this.parent[_HAS_DRAFT_FOR_OLD_STATE_KEY](this.key);
        else // assert(this.parent.isDraft)
            return this.parent[_HAS_DRAFT_FOR_PROXY](this.proxy);
    }
    // Called when a mutating function (set, delete) triggers ImmutableWriteError!
    getDraft() {
        if(this.draft !== null)
            return this.draft;
        // This depends a lot on the parents nature.
        // was the proxy created from within the draft parent?
        // i.e. parent is a draft
        let draft = false;
        if(this.key !== null)
            // was the proxy created from a proxy of an immutable
            // i.e. parent is a proxy
            // and parent[_POTENTIAL_WRITE_PROXY_GET_IMMUTABLE] exists
            // actually => immutable.getDraftFor(this.key); will trigger itself ImmutableWriteError
            // but we can use parent[_POTENTIAL_WRITE_PROXY_GET]getDraftFor(this.key);
            // which will trigger or not!
            draft = this.parent[_GET_DRAFT_FOR_OLD_STATE_KEY](this.key);
        else if(this.parent.isDraft) // => may have changed if parent[_IS_POTENTIAL_WRITE_PROXY]
            draft = this.parent[_GET_DRAFT_FOR_PROXY](this.proxy);


        // if(! parent ) => disconnected = true! always
        // let disconnected = false;

        // false returned by parent.getDraftFor, if draft is not genuine
        if(draft === false) {
            // disconnected = true;
            // This draft is 'disconnected' from parent, but on its own
            // a valid draft.
            // FIXME: I wonder if this case should rather raise an Error, as
            // the write now goes into the void, if it is not recovered
            // by parent[_POTENTIAL_WRITE_PROXY_GET_DRAFT]
            // an option would be to raise directly before the return,
            // so the error could be caught and the draft could get extracted
            draft = this.immutable.getDraft();
        }

        if(draft[OLD_STATE] !== this.immutable)
            // Something went wrong! Passing this test doesn't mean
            // nothing went wrong, but this is a strong indication for
            // thinking error.
            throw new Error('ASSERTION FAILED draft[OLD_STATE] must be equal to this.immutable but is not.');

        // Return now always this draft from this proxy
        // the proxy could get disconnected from it's parent, but
        // the draft stays connected.
        this.draft = draft;
        //if(disconnected)
        //    throw disconectedError(new Error(`DISCONECTED DRAFT ERROR proxy draft is disconneced from parent`), draft);
        return this.draft;
    }

    getPotentialWriteProxy (key, item) {
        // Must use this.proxy as parent here, in order to trigger
        // the isImmutableWriteError trap.
        // NOTE: assert item === this.immutable.get('key')

        // _PotentialWriteProxy.create:
        return this.constructor.create(this.proxy, item, key);
    }
    _handlerGet (target, prop, receiver) {
        // assert target === immutable
        if (prop === _PotentialWriteProxy.IS_PROXY)
            return true;
        if (prop === _PotentialWriteProxy.GET_IMMUTABLE)
            return this.immutable;
        if (prop === _PotentialWriteProxy.GET_DRAFT)
            return this.hasDraft()
                ? this.getDraft()
                : undefined
                ;
        if (prop === _PotentialWriteProxy.GET)
            return this.hasDraft()
                ? this.getDraft()
                : this.immutable
                ;

        // Use the draft directly as the receiver,if there'a draft for receive
        // this way getting i.e. the prop 'length' from this will not
        // query the old immutable after e.g. a _AbstractList.push(...)
        // Possibly, there are other subtle bugs like this.
        const receiver_ = receiver[_PotentialWriteProxy.IS_PROXY] && receiver[_PotentialWriteProxy.GET_DRAFT] || receiver
          , result = Reflect.get(target, prop, receiver_)
          ;

        if(typeof result === 'function') {
            // TODO: return proxy to trap function call
            //       and possibly catch the isImmutableWriteError
            return this.createMethodProxy(prop, result);
        }

        // FIXME: not sure about this!
        // as the returned proxy is not really stored in the parent
        // seems, like we can't resolve it to a draft in the parent well
        // but there's still a crooked approach, see below.
        // basically, this means, we got to use getter functions (not
        // getters though!) to return proxified members of the model, and
        // I believe there's no other actual use case so far.
        return result;
        // used to be: but it seems this just caused trouble and didnt't
        // help a lot. It turns properties into proxies that should
        // not be, such as internal `this._value` in _AbstractSimpleOrEmptyModel.
        //
        // We could also add a Symbol property like [DO_NOT_PROXIFY] = new Set('_value');
        // In the end, this caused the Assertion in  create fail, where:
        // parent[_PotentialWriteProxy.GET_IMMUTABLE].get(key) === immutable
        // i.e. parent._value === parent.get(_value) which is a wild
        // approach anyways.
        // return this.getPotentialWriteProxy(prop, result);
    }
    // set case is just for completeness, I don't think it's yet actually
    // used, but it could.
    _handlerSet (target, propertyKey, value, receiver) {
        // assert target === immutable
        const draftOrTarget = this.hasDraft() ? this.getDraft() : target;
        try {
            return Reflect.set(draftOrTarget, propertyKey, value, receiver);
        }
        catch(error) {
            if(isImmutableWriteError(error)) { // === trying to write to immutable
                // this detects the write, everything else may as well
                // be any read, even of un-important values or of unrelated
                // calculations etc.
                const draft = this.getDraft();
                // Leaving out receiver, don't think it's relevant here,
                // but I could be wrong!
                return Reflect.set(draft, propertyKey, value/*, receiver*/);
            }
            // re-raise, not our business!
            throw error;
        }
    }
}

export function unwrapPotentialWriteProxy(maybeProxy, type=null) {
    if(!_PotentialWriteProxy.isProxy(maybeProxy))
        return maybeProxy;
    if(type === 'immutable')
        // Returns immutable
        return maybeProxy[_PotentialWriteProxy.GET_IMMUTABLE];
    if(type === 'draft')
        // Returns the draft that is associated with the proxy,
        // if it already exists otherwise undefined.
        return maybeProxy[_PotentialWriteProxy.GET_DRAFT];
    // Returns the draft, if it already exists otherwise the immutable.
    return maybeProxy[_PotentialWriteProxy.GET];
}

// generic helper in metamorphose
// obj A and obj B must have the same own-entries with a strictly equal type.
export function objectEntriesAreEqual(depObjA, depObjB) {
    // FIXME: maybe fail if prototypes are not equal.
    const keysA = Object.keys(depObjA)
      , keysB = Object.keys(depObjB)
      ;
    if(keysA.length !== keysB.length)
        return false;
    for(const key of keysA) {
        if(!keysB.includes(key))
            return false;
        if(depObjA[key] !== depObjB[key])
            return false;
    }
    return true;
}

// generic helper in metamorphose
export function collectDependencies(dependencyNamesSet, updatedDependencies, oldStateDependencies=null, staticDependencies=null) {
    const dependenciesData = Object.fromEntries([
        // preload OLD STATE
        ...Object.entries(oldStateDependencies || {})
            // add dependencies argument
            , ...Object.entries(updatedDependencies || {})
        // There are not more dependencies in the object than we know.
        // It's not an error as the caller could reuse dependencies object
        // this way, but we don't want to persist dependencies we don't
        // know or need.
        ].filter(([key])=>dependencyNamesSet.has(key))
    );

    {
        // Check if all dependencies are provided.
        // It would possible to rewrite external dependency names
        // to internal ones (aliases) here in an attempt to make
        // a child fit into a parent it wasn't exactly designed for.
        // Putting this comment here, to not forget, if dependencyNamesSet
        // were a Map (insideName => outSideName) (not a set) the rewriting
        // could also be done from outside by the initializing parent.
        // Putting this thought here to keep it around.
        const missing = new Set();
        for(const key of dependencyNamesSet.keys()) {
            if(!Object.hasOwn(dependenciesData, key))
                missing.add(key);
        }
        if(missing.size !== 0)
            throw new Error(`VALUE ERROR missing dependencies: ${[...missing].join(', ')}`);
        // Could add type checks for dependencies as well
        // e.g. if dependencyNamesSet were a Map (name=>Type)
    }

    if(staticDependencies !== null) {
        for(const [key, staticDependency] of staticDependencies)
            dependenciesData[key] = staticDependency.state;
    }

    // In async metamorphose it happens that we get PotentialWriteProxies
    // but we don't want to use them as dependencies, hence the unwrapping.
    for(const key of Object.keys(dependenciesData)) {
        const value = dependenciesData[key];
        if(_PotentialWriteProxy.isProxy(value))
            dependenciesData[key] = unwrapPotentialWriteProxy(value);
    }
    // More possible checks on dependencies:
    //  * Ensure all dependencies are immutable (and of a corresponding type).
    Object.freeze(dependenciesData);
    return dependenciesData;
}

export class ResourceRequirement {
    constructor(...description) {
        this.description = description;
    }
    toString(){
        return `[${this.constructor.name} with description: ${this.description.map(item=>item && item.toString()).join(', ')}]`
    }
}

export function failingResourceResolve(resourceRequirement) {
    // detect with isDeliberateResourceResolveError
    throw new deliberateResourceResolveError(Error(`FAILING DELIBERATELY `
                + `failingResourceResolve with resource requirement: `
                + `${resourceRequirement}`));
}

export function driveResolverGenSync(syncResolve, gen) {
    let result
    , sendInto=undefined
    ;
    do {
        result = gen.next(sendInto);
        sendInto = undefined;// don't send same value again
        if(result.value instanceof ResourceRequirement)
            sendInto = syncResolve(result.value);
        else if(!result.done)
            throw new Error(`VALUE ERROR Don't know how to handle genereator result with value ${result.value}`);
    } while(!result.done);
    return result.value;
}

export function driveResolverGenSyncFailing(gen) {
    return driveResolverGenSync(failingResourceResolve, gen);
}

export async function driveResolveGenAsync(asyncResolve, gen) {
    // OK so this is the driving protocol of the metamorphoseGen.
    // It can't be directly in createPrimalStateAsync, as that req

    // gen = Model.createPrimalStateGen(...) or draft.metamorphoseGen(...)
    // can't send a value on first iteration
    let result
    , sendInto=undefined // initial sendInto is ignored anyways
    ;
    do {
        result = gen.next(sendInto);
        sendInto = undefined;// don't send same value again
        if(result.value instanceof ResourceRequirement)
            sendInto = await asyncResolve(result.value);
        else if(!result.done)
            throw new Error(`VALUE ERROR Don't know how to handle genereator result with value {result.value}`);
    } while(!result.done);
    return result.value;
}

const OLD_STATE = Symbol('OLD_STATE')
 , _IS_DRAFT_MARKER = Symbol('_IS_DRAFT_MARKER')
 , _PRIMARY_SERIALIZED_VALUE = Symbol('_PRIMARY_SERIALIZED_VALUE')
 , _DEFERRED_DEPENDENCIES = Symbol('_DEFERRED_DEPENDENCIES')
 , WITH_SELF_REFERENCE = Symbol('WITH_SELF_REFERENCE')
 , DEBUG = false
 ;

export class _AbstractStructModel extends _BaseContainerModel {
    static WITH_SELF_REFERENCE = WITH_SELF_REFERENCE;
    static has(key) { // in all of the local name space
        // Own names, which override parent scope for children dependencies.
        for(const map of [this.fields, this.foreignKeys, this.links, this.internalizedDependencies, this.fallBackValues]) {
            if(map.has(key))
                return true;
        }
        return false;
    }
    // In all of the local name space returns a:
    //      an instance of _BaseModel from this.fields
    //      an instance of ForeignKey from this.keys
    //      an instance of _BaseLink from this.links
    //      an instance of InternalizedDependency from this.internalizedDependencies
    //      an instance of FallBackValue from this.fallBackValues
    // in that order or throws a KEY ERROR
    static get(key) {
        // Own names, which override parent scope for children dependencies.
        for(const map of [this.fields, this.foreignKeys, this.links, this.internalizedDependencies, this.fallBackValues]){
            if(map.has(key))
                return map.get(key);
        }
        throw new Error(`KEY ERROR "${key}" not found in local namespace of ${this.constructor.name}.`);
    }

    static *entries() { // => [name, instance of _BaseModel, Key or _BaseLink]
        yield* allEntries(this.fields, this.foreignKeys, this.links, this.internalizedDependencies, this.fallBackValues);
    }

    static createClass(className, ...definitions) {
        if(DEBUG) {
            console.log('\n' + new Array(30).fill('*+').join(''));
            console.log('START createClass', className, 'raw fields:',    );
            console.log(new Array(30).fill('*+').join('') + '\n');
        }
        if(typeof className !== 'string')
            throw new Error(`className must be string but is ${typeof className}`);

        const fields = new FreezableMap()
          , foreignKeys = new FreezableMap()
          , links = new FreezableMap()
          , coherenceFunctions = new FreezableMap()
          , internalizedDependencies = new FreezableMap()
          , fallBackValues = new FreezableMap()
          // Used to rename/map external dependency names to internal
          // names and still be able to use both. I.e. get "font" from
          // the parent and call it "externalFont" and define "font" in
          // here locally e.g. as a Link or as a Field.
          // Used for internalizedDependencies.
          , _ownAllDependencies = new FreezableSet()
          , _childrenAllDependencies = new FreezableSet()
          , staticDependencies = new FreezableMap()
          , ownExternalDependencies = new FreezableSet()
          , childrenExternalDependencies = new FreezableSet()
          , dependencies = new FreezableSet()
          , initOrder = []
          , seen = new Set()
            // this way name will naturally become class.name.
          , result = {[className]: class extends this {
                // All of the static dependencies will get frozen (Object.freeze)
                // jshint ignore: start
                static fields = fields;
                static foreignKeys = foreignKeys;
                static links = links;
                static coherenceFunctions= coherenceFunctions;
                static internalizedDependencies = internalizedDependencies;
                static fallBackValues = fallBackValues;

                static staticDependencies = staticDependencies;
                static ownDependencies = ownExternalDependencies;
                static childrenExternalDependencies = childrenExternalDependencies;
                // These are the names of the dependencies of the class.
                static dependencies = dependencies;
                static initOrder = initOrder;
                 // jshint ignore: end
            }}
          , NewClass = result[className]
          ;

        for(const definition of definitions) {
            if(definition instanceof StaticDependency) {
                if(staticDependencies.has(definition.dependencyName))
                    throw new Error(`VALUE ERROR ${className} multiple definitions for static dependency name "${definition.dependencyName}".`);
                staticDependencies.set(definition.dependencyName, definition);
                continue;
            }
            let [name, value] = definition;
            if(seen.has(name))
                throw new Error(`VALUE ERROR ${className} multiple definitions for name "${name}".`);
            seen.add(name);
            // from here on names must be string
            if(typeof name !== 'string')
                throw new Error(`VALUE ERROR ${className} definition name must be string but is ${typeof name}.`);

            if(value === this.WITH_SELF_REFERENCE) {
                const [,,fn] = definition;
                value = fn(NewClass);
            }

            if(value instanceof CoherenceFunction) {
                coherenceFunctions.set(name, value);
                 for(const dependency of value.dependencies)
                    _childrenAllDependencies.add(dependency);
            }
            else if(value instanceof InternalizedDependency) {
                internalizedDependencies.set(name, value);
                for(const dependency of value.dependencies)
                    _ownAllDependencies.add(dependency);
            }
            else if(value instanceof ForeignKey) {
                foreignKeys.set(name, value);
            }
            else if(value instanceof _BaseLink) {
                links.set(name, value);
            }
            else if(value instanceof FallBackValue) {
                fallBackValues.set(name, value);
            }
            else if(value.prototype instanceof _BaseModel) {
                // value can't be equal to _BaseModel, but that's not
                // intended for direct use anyways.
                // FIXME: We should even check if value is abstract
                // or meant to be used directly, by somehow marking
                // Abstract classes (with a static symbol?);
                fields.set(name, value);
                // All models must communicate this.
                for(const dependency of value.dependencies)
                    _childrenAllDependencies.add(dependency);
            }
            else
                throw new Error(`VALUE ERROR: don't know how to handle defintion for ${className} ${name}:${value}`);
        }

        for(const [keyName, key] of foreignKeys) {
            if(!fields.has(key.targetName) && !internalizedDependencies.has(key.targetName))
                throw new Error(`KEY ERROR: ${className} foreignKey "${keyName}" doesn't reference an existing field: ${key}.`);
        }
        for(const [linkName, link] of links) {
            for(const keyName of link.dependencies)
                if(!foreignKeys.has(keyName))
                    throw new Error(`LINK ERROR: ${className} link "${linkName}" ${link} foreign key "${keyName}" does not exist.`);
        }
        for( const [fallBackValueName, fallBackValue] of fallBackValues) {
            for(const name of fallBackValue.dependencies)
                if(!links.has(name) && !internalizedDependencies.has(name))
                    throw new Error(`KEY ERROR: ${className} fallBackValue "${fallBackValueName}" ${fallBackValue} name "${name}" does not exist.`);
        }
        // bind an object as the thisval to the static has function.
        // This way, the definite dependencies property can be pre-calculated
        // with the same method that would be used in an on demand calculation.
        // but we can bind the soon-to-be namespace into it.
        // Could also be done like:
        //      this.has.call({fields, foreignKeys, links, internalizedDependencies}, dependency)
        //  like:
        //       iterFilter(childrenDependencies, dependency=>!this.has.call({fields, keys, links}, dependency))
        //  also:
        //      filterFn = dependency=>!this.has.call({fields, keys, links}, dependency)
        //      iterFilter(childrenDependencies, filterFn)
        const staticHas = this.has.bind({fields, foreignKeys, links, internalizedDependencies, fallBackValues});
        // remove locally defined names
        populateSet(ownExternalDependencies, iterFilter(_ownAllDependencies, dependency=>!staticDependencies.has(dependency)));
        populateSet(childrenExternalDependencies, iterFilter(_childrenAllDependencies, dependency=>!staticHas(dependency)));
        populateSet(dependencies,[ //jshint ignore: line
                      // Via internalizedDependencies, these are allways
                      // external even if this class itself defines one
                      // of these names. This is so that this element
                      // can e.g. redefine what "font" is for children.
                      ... ownExternalDependencies
                      // This is communicated upwards local overrides
                      // of all children dependencies are not contained.
                    , ... childrenExternalDependencies
        ]);
        // The topological order, to determine child initialization order
        // can be determined in here already:
        populateArray(initOrder
            , getTopologicallySortedInitOrder(coherenceFunctions, fields
                            , foreignKeys, links, internalizedDependencies, fallBackValues
                            , childrenExternalDependencies));

        for(const staticClassProperty of Object.values(NewClass))
            Object.freeze(staticClassProperty);

        // Can't override class.fields anymore, would be possible w/o the freeze.
        Object.freeze(NewClass);

        if(DEBUG) {
            console.log('\n' + new Array(30).fill('*+').join(''));
            console.log('DONE building', className);
            for(let prop of ['fields', 'foreignKeys', 'links', 'internalizedDependencies'
                            , 'coherenceFunctions', 'dependencies', 'childrenExternalDependencies'
                            , 'initOrder'])
                console.log(`    ${className}.${prop}:`, NewClass[prop]);

            console.log(new Array(30).fill('*-').join(''));
            console.log(new Array(30).fill('*-').join('') + '\n');
        }
        return NewClass;
    }


    // FIXME: you don't call this directly for now use:
    // static createPrimalState or instance.getDraft
    // However, without oldState this should return the same as
    // createPrimalState!
    // OR could it still be valid? We need to have this._value propagated
    // with itemsdState) => a draft
    // new Ctor(null, dependencies) => an immutable primal state
    // new Ctor() =, metamorphose can do so, but does not yet without OLD
    // state.
    //
    // new CTor(ol> TypeError
    // new CTor(oldState, dependencies) => TypeError
    //      Do this instead:
    //      immutable = new CTor(oldState).metamorphose(dependencies);
    // if not oldState this will be a primal state (immutable).
    constructor(oldState=null, dependencies=null, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS) {
        // Must call first to be able to use with this.constructor.name
        // it's super counter intuitive, given the nature of the checks
        // below, but it shouldn't create bad side effects either.
        super(oldState);
        if(oldState === null && dependencies === null)
            throw new Error(`TYPE ERROR either oldState or dependencies are required in ${this.constructor.name}.`);
        if(oldState !== null && dependencies !== null)
            // could also be dependencies === _DEFERRED_DEPENDENCIES
            // but at this point dependencies !== null has the same semantics.
            //
            // The problem is that metamorphose may return OLD_STATE but
            // as a constructor that is invoked with the `new` keyword,
            // a new object must be returned.
            throw new Error(`TYPE ERROR can't constuct with both oldState and dependencies`);

        if(oldState && oldState.isDraft)
            throw new Error(`LIFECYCLE ERROR [${this.constructor.name}] `
                    +`oldState ${oldState} is draft but must be immutable.`);
        // Used to call  super(oldState); here.

        // this._value will only contain changed entries
        // if this._value.get(name) === this.[OLD_STATE].value.get(name)
        // it should not be set, to detect change, but that can only finally
        // be done in metamorphose, there a draft value can go back to its
        // OLD_STATE if it has not changed.
        Object.defineProperty(this, '_value', {value: new FreezableMap(), configurable: true});
        Object.defineProperty(this, 'dependencies', {
            get: ()=>{
                if(this[OLD_STATE] === null)
                    throw new Error('Primal State has no dependencies yet!');
                // In draft-mode, this[OLD_STATE] has the dependencies.
                return this[OLD_STATE].dependencies;
            }
          , configurable: true
        });

        // byProxy.get(proxy)=>key byKey.get(key)=>proxy
        this[_LOCAL_PROXIES] = {byProxy: new Map(), byKey: new Map(), changedBySetter: new Set()};
        // Create an immutable primal state if OLD_STATE is null:
        if(dependencies !== null) {
            if(serializedValue !== null) {
                // I don't want to have this as an direct argument
                // of metamorphose so far, as this way it's made sure
                // that only the Primal State can load the serialized
                // state. If it's not a primary state, change is handled
                // differently.
                this[_PRIMARY_SERIALIZED_VALUE] = [
                    this._deserializeToMap(serializedValue, serializeOptions)
                  , serializeOptions
                ];
            }
            // So, here's a problem,: this won't return a new object
            // if there was an OLD_STATE and there was no change
            // but since this is a constructor it MUST return a new
            // object (when called with `new`).
            if(dependencies !== _DEFERRED_DEPENDENCIES)
                return this.metamorphose(dependencies);
        }
    }

    _getChangedDependencies() {
        if(this[OLD_STATE] === null)
            // If this.[OLD_STATE] === null we need to create a new primal
            // value, changedDependencyNames will be fully populated to do so.
            return new Set(this.constructor.dependencies);
        const changedDependencyNames = new Set();
        for(const key of this.constructor.dependencies.keys()) {
            if(this[OLD_STATE].dependencies[key] !== this.dependencies[key])
                changedDependencyNames.add(key);
        }
        return changedDependencyNames;
    }

    /**
     * localScope a Map
     * childDescriptor = this.constructor.get(childName)
     */
    collectChildDependencies(localScope, childDescriptor) {
        return Object.fromEntries(iterMap(childDescriptor.dependencies, (key)=>{
            const value = localScope.get(key);
            if(value === undefined)
                throw new Error(`VALUE ERROR in ${this} dependency "${key}" for child "${childDescriptor}" is undefined.`);
            return [key, value];
        }));
    }

    * _lockItem(localScope, locked, changedDependencyNames, name) {
        if(locked.has(name))
            // Been here done that.
            return;
        locked.add(name);
        if(!this.hasOwn(name))
            // Locking not requrired from this, this is not the owner.
            return;

        // if this is primal state construction and there's no
        // OLD_STATE the init order loop should have populated
        // this._value.get(name) by now!
        const item = this._value.has(name)
            ? this._value.get(name)
            : this[OLD_STATE].get(name)
            ;

        // `item` is a draft.
        // `descriptor` is a Model or an instance of ForeignKey.
        // ValueLink, Constraint and InternalizedDependency are
        // skipped with `this.hasOwn(name)` and require no
        // locking themselves.
        const descriptor = this.constructor.get(name);
        // Recursion! Thanks to initOrder this will resolve without
        // any infinite loops or missing dependencies.

        // For ForeignKey locking is already done in initOrder
        yield * this._lockDependencies(localScope, locked, changedDependencyNames, descriptor.dependencies);
        let immutable;
        if(descriptor instanceof ForeignKey) {
            // We must execute the key constraint here,
            // coherence functions may have invalidated
            // the constraint and in that case we will fail.
            const key = descriptor
              , target = localScope.get(key.targetName)
                // May fail with an error!
              , targetKeyMaybeGen = key.constraint(target, item.value)
              , targetKey = targetKeyMaybeGen?.next instanceof Function
                    ? yield* targetKeyMaybeGen
                    : targetKeyMaybeGen
              ;
            let draft = null;
            if(targetKey !== item.value) {
                // May have to turn into a draft
                draft = item.isDraft
                            ? item
                            : item.getDraft()
                            ;
                draft.value = targetKey;
            }
            immutable = draft !== null
                ? draft.metamorphose()
                : (item.isDraft
                        ? item.metamorphose()
                        : item)
                ;
        }
        else { // is field/value
            const childDependencies = this.collectChildDependencies(localScope, descriptor);
            immutable = item.isDraft
                ? yield * item.metamorphoseGen(childDependencies)
                // It's immutable. If we would have locked item already
                // we wouldn't be here. Drafts are always from this._value
                // but immutables can potentially come from both sources.
                // An immutable can be set via the set method but is also
                // set when creating a primal state, in the initOrder loop.
                // We got to make sure the dependencies are the same
                // or metamorphose the item to the next version.
                : (!objectEntriesAreEqual(childDependencies, item.dependencies)
                            ? yield *item.getDraft().metamorphoseGen(childDependencies)
                            : item
                   )
                ;
        }
        if(!this[OLD_STATE] || this[OLD_STATE].get(name) !== immutable)
            changedDependencyNames.add(name);
        localScope.set(name, immutable);
    }

    * _lockDependencies(localScope, locked, changedDependencyNames, dependencies) {
        for(const name of dependencies){
            yield * this._lockItem(localScope, locked, changedDependencyNames, name);
        }
    }

    /**
     * This needs to stay compatible with _serializeContainer.
     */
    _deserializeToMap(serializedValues, options) {
        const keepKeys = options?.structStoreKeys
          , structAsDict = options?.structAsDict
          , valuesMap = new Map()
          ;
        // Populate valuesMap and make sure it only contains keys that are
        // owned (hasOwn) by Model.
        if(keepKeys) {
            const serializedValues_ = structAsDict
                ? Object.entries(serializedValues)
                : serializedValues
                ;

            for(const [key, serializedValue] of serializedValues_) {
                if(!this.hasOwn(key)) {
                    // NOTE: this could be a hint of something going wrong,
                    // e.g. a version miss-match. Could be logged or otherwise
                    // reported. In a strict sense, this should be an error.
                    if(options.strict)
                        throw new Error(`VALUE ERROR serializedValue has key "${key}" `
                            + `but that is not owned by this struct. Own keys: ${this.ownKeys().join(', ')}.`);
                    continue;
                }
                if(serializedValue !== null && serializedValue !== undefined)
                    valuesMap.set(key, serializedValue);
            }
        }
        else {
            // Derive the keys from the positions of the values.
            for(const [i, key] of this.ownKeys().entries()) {
                const serializedValue = serializedValues[i];
                if(serializedValue !== null && serializedValue !== undefined)
                    valuesMap.set(key, serializedValue);
            }
        }
        // NOTE: assumption at this point valuesMap has only keys that are
        // owned (hasOwn) by Model.
        return valuesMap;
    }

    * #_metamorphoseGen(dependencies={}) {
        const [serializedValuesMap, serializeOptions]  = this[_PRIMARY_SERIALIZED_VALUE] || [new Map()]
          , getSerialized = (name)=> {
                if(!serializedValuesMap || !serializedValuesMap.has(name))
                    return [];
                const value = serializedValuesMap.get(name);
                serializedValuesMap.delete(name);
                return [value, serializeOptions];
            }
          ;
        // Don't keep this.
        delete this[_PRIMARY_SERIALIZED_VALUE];

        //CAUTION: `this` is the object not the class.
        //
        // All the following runs, to change deep down a single axis location value.
        //        It is very important to make this as lightweight as possible.
        //        At the same time, it is important that the change bubbles
        //        through the whole structure.

        // Allow case without or with incomplete dependencies argument,
        // will re-use this[OLD_STATE].dependencies.
        // Fails in the if dependencies are missing.
        const dependenciesData = collectDependencies(
                                          this.constructor.dependencies
                                        , dependencies
                                        , this[OLD_STATE]?.dependencies
                                        , this.constructor.staticDependencies
                                        );

        for(const [k, v ] of Object.entries(dependenciesData)) {
            if(_PotentialWriteProxy.isProxy(v) && this[OLD_STATE] !== null)
                throw new Error(`VALUE ERROR ${this} dependency "${k}" is a _PotentialWriteProxy `
                    + `but this is not a primal draft this[OLD_STATE]:${this[OLD_STATE]}.`);
            if(v === undefined)
                throw new Error(`VALUE ERROR dependency "${k}" cannot be undefined.`);
        }

        // Required for comparison between OLD_STATE and this.
        // These are the names and values of the dependencies of the class.
        // We need to compare these to see if a change of the object is required.
        Object.defineProperty(this, 'dependencies', {
            value: Object.freeze(dependenciesData)
          , writable: true
          , configurable: true
        });

        const changedDependencyNames = this._getChangedDependencies();

        // Here's a shortcut:
        if(this[OLD_STATE] !== null
                && changedDependencyNames.size === 0
                   // no new drafts since going into draft mode, i.e.
                   // no potential changes that need to be checked.
                && this._value.size === 0)
            return this[OLD_STATE];

        const localScope = new Map()
            // localScope should already own *children*-external dependencies!!!
          , locked = new Set()
          ;

        // This is the mantra:
        // NOTE: using this.get in this loop as it also returns
        // potentialWriteProxies as an optimization, the items
        // are made immutable eventually in the _lockItem method.
        for(const name of this.constructor.initOrder) {
            // By the time each element in initOrder is at the turn,
            // its dependencies are already available in localScope
            // and they can be used.
            if(this.constructor.childrenExternalDependencies.has(name)) {
                if(!(name in this.dependencies)
                    || this.dependencies[name] === undefined)
                    // should be covered above when checking dependenciesData
                    throw new Error(`DEPENDENCY ERROR ${this.constructor.name} requires "${name}" in dependenciesData.`);
                localScope.set(name, this.dependencies[name]);
            }
            else if(this.constructor.internalizedDependencies.has(name)) {
                const internalizedDependency = this.constructor.internalizedDependencies.get(name);
                if(!(internalizedDependency.dependencyName in this.dependencies)
                    ||  this.dependencies[internalizedDependency.dependencyName] === undefined)
                    // should be covered above when checking dependenciesData
                    throw new Error(`DEPENDENCY ERROR ${this.constructor.name} requires `
                        + `"${internalizedDependency.dependencyName}" in dependenciesData.`
                        + ` for "${name}": ${internalizedDependency}.`);
                localScope.set(name, this.dependencies[internalizedDependency.dependencyName]);
            }
            else if(this.constructor.fields.has(name)) {
                // get return value can be a draft or a proxified immutable.
                if(this[OLD_STATE] === null && !this._value.has(name)) {
                    // this is a primal state
                    const Model = this.constructor.fields.get(name);
                    // We want dependencies to be locked later in the
                    // process, so the coherence functions can do their
                    // thing and don't fail when writing because they get
                    // unexpected immutable dependencies.
                    //
                    // These dependencies may not be "locked" yet!
                    // But locked dependencies are (by convention) required
                    // for a new instance.
                    const childDependencies = this.collectChildDependencies(localScope, Model);
                    for(const [k,v] of Object.entries(childDependencies)) {
                        if(!this.hasOwn(k)) continue;
                        const item = childDependencies[k] = unwrapPotentialWriteProxy(v);
                        if(item.isDraft) {
                            childDependencies[k] = item.metamorphose({});
                            // put the immutable into this._value
                            this.set(k, item);
                            // put the proxy of the latest item into localScope
                            // so a later coherence function can work on the
                            // to be created draft.
                            localScope.set(k, this.get(k));
                        }
                    }
                    const immutable = yield *Model.createPrimalStateGen(childDependencies, ...getSerialized(name));
                    // This way the get method can still give out a potential
                    // write proxy to the coherenceFunction, but we have an
                    // inherent coherent value to start with.
                    this._value.set(name, immutable);
                }
                localScope.set(name, this.get(name));
            }
            else if(this.constructor.coherenceFunctions.has(name)) {
                const coherenceFunction = this.constructor.coherenceFunctions.get(name)
                   // This can change the values of fields, if fields are used
                   // as dependencies, this must execute before.
                   // We also accept frozen childDependencies, but when attempting
                   // to write they raise an error/
                   // This way, it is ensured that we didn't give away
                   // dependencies that become outdated.
                  , childDependencies = this.collectChildDependencies(localScope, coherenceFunction)
                  ;
                // Return value is optional I would say, but it could
                // be useful, to propagate calculations. The idea of
                // the coherenceFunction is however that it can change
                // the values of dependencies directly...
                // FIXME: external dependencies must not be changeable!
                //     that's important, though, not sure how to ensure that!
                //     It's important because that would inverse data flow
                //     direction (from child to parent) and we don't
                //     want this, to keep it simple and in hierarchical order!
                //     If it is possible and desireable we may overthink this
                //     but too many side-effects seem to occur.
                //     Maybe, besides freezing, we could also "lock"
                //     elements (temporarily).
                // Similar to this, instanciation of a field could be
                // augmented by a method attached directly, but, essentially
                // this can do the same job.
                //
                // FIXME not a fan of using result like this! It makes stuff
                // complicated! (does iit though?)
                // However, the coherenceFunction is part of the init order, and
                // as such can technically set a name, there's no clash.
                // This is also not yet implemented in the factory method,
                // so there may be no way to get these dependencies accepted!
                // localScope.set(name, coherenceFunction.fn(childDependencies));
                const maybeGen = coherenceFunction.fn(childDependencies);
                if(maybeGen?.next instanceof Function)
                    yield * maybeGen;
            }
            else if(this.constructor.foreignKeys.has(name)) {
                // Must lock the target!
                // Key must not change anymore after being used as an dependency!
                // This means, it would still be possible to change this
                // in a coherence function, but when it is a direct dependency
                // e.g. in a field OR in a link (below), this must be locked
                // and loaded.
                const key = this.constructor.foreignKeys.get(name);
                yield * this._lockDependencies(localScope, locked, changedDependencyNames, key.dependencies); // is { key.targetName }
                if(this[OLD_STATE] === null && !this._value.has(name)) {
                    // this is a primal state
                    // FIXME: without running the constraint, there
                    // won't be a value for this initial key! (immutable.value === undefined)
                    // A coherence function specialized for the primal
                    // state case may have to bootstrap this.
                    const immutable = yield *KeyValueModel.createPrimalStateGen(null, ...getSerialized(name));
                    // This way the get method can give out potential write
                    // proxies and the coherence functions can change
                    // this, even in primal state creation.
                    this._value.set(name, immutable);
                }

                const keyValue = this.get(name); // draft or proxified immutable
                localScope.set(name, keyValue);
            }
            else if(this.constructor.links.has(name)) {

                // similar as foreignKey, but since this doesn't go to
                // Think about making sure to have this frozen (i.e. target
                // be frozen) before sending it as a dependency.

                const link = this.constructor.links.get(name);
                try {
                    yield * this._lockDependencies(localScope, locked, changedDependencyNames, link.dependencies); // is { link.keyName }
                } catch(error) {
                    error.message = `${error.message} (in ${this})`;
                    throw error;
                }
                // resolving the link:
                //
                const key = this.constructor.foreignKeys.get(link.keyName)
                  , targetKey = localScope.get(link.keyName).value
                  , target = localScope.get(key.targetName)
                  ;
                let value;

                if(targetKey === key.NULL) {
                    if(key.allowNull)
                        // just reuse ForeignKey.NULL
                        value = key.NULL;
                    else
                        // We already executed the key constraints, which
                        // should have caught this, but maybe a coherence
                        // function changed it.
                        // TODO: the key constraint function should execute right
                        //       before the key is locked again, to ensure this
                        //       doesn't happen.
                        throw new Error(`INTERNAL LOGIC ERROR ${this.constructor.name} `
                            + `can't resolve link "${name}" ${link}: `
                            + `key-value for key ${link.keyName} is null `
                            + `but null is not allowed.`);
                }
                else if(target.has(targetKey))
                    value = target.get(targetKey);
                else if(this[OLD_STATE] === null) {
                    // This is a primary state, we need to accept that there
                    // can be a not well defined key, i.e. when NOT_NULL
                    // and target is empty and the constraint is NO_ACTION.
                    // The caller will have to set a valid key as next step.
                    value = key.INVALID;
                }
                else
                    // This should never happen, as we ran key.constraint before.
                    throw new Error(`KEY ERROR ${this.constructor.name} not found key "${link.keyName}"`
                            + ` (is ${targetKey.toString()}) in ${key.targetName}.`);
                localScope.set(name, value);
            }
            else if(this.constructor.fallBackValues.has(name)) {
                const fallBackValue = this.constructor.fallBackValues.get(name)
                  , primaryValue = localScope.get(fallBackValue.primaryName)
                  , value = primaryValue !== ForeignKey.NULL
                        ? primaryValue
                        : localScope.get(fallBackValue.fallBackName)
                        ;
                if(value === ForeignKey.NULL)
                    throw new Error(`VALUE ERROR fall back value "${fallBackValue.fallBackName}" is NULL`);
                if(unwrapPotentialWriteProxy(value).constructor !== fallBackValue.Model)
                    throw new Error(`TYPE ERROR fall back value is not a ${fallBackValue.Model.name} but a ${value.constructor.name}.`);
                localScope.set(name, value);
            }
            else
                // A programming error, was new stuff added recently ?
                throw new Error(`UNKOWN NAME ${this.constructor.name} Don't know how to treat "${name}".`);
        }

        if(serializedValuesMap.size)
            // This is just a sanity check. If here keys are left, it
            // probably means a condition above must be updated. These
            // keys generally correlate with ownKeys, so if that is changed
            // it's possible that the conditions above are not updated/forgotten
            // and this is a reminder.
            throw new Error(`VALUE ERROR a serialized value was given, but not all `
                + `keys were used, unused keys: ${Array.from(serializedValuesMap.keys()).join(',')}`)


        // Are there any not locked fields/keys now?
        for(const name of this.ownKeys())
            yield *this._lockItem(localScope, locked, changedDependencyNames, name);

        // compare
        if(this[OLD_STATE] && changedDependencyNames.size === 0)
            // Has NOT changed!
            return this[OLD_STATE];

        // make sure all items are in this._value
        for(const name of this.ownKeys())
            this._value.set(name, localScope.get(name));


        // Has changed!
        {
            // validate types in this._value
            const types = [];
            for(const [name, Type] of this.constructor.fields.entries()) {
                // no inheritance allowed so far.
                const value = this._value.get(name);
                if(value.constructor !== Type)
                    types.push(`"${name}" ${value} is not a ${Type.name} (but a ${value.constructor.name}).`);
            }
            if(types.length)
                throw new Error(`TYPE ERROR can't metamorphose ${this}`
                              + `wrong types: ${types.join(', ')}.`);
        }
        {
            // validate keys
            for(const name of this.constructor.foreignKeys.keys()) {
                const value = this._value.get(name);
                if(value.constructor !== KeyValueModel)
                    throw new Error(`TYPE ERROR can't metamorphose ${this} key `
                        + `"${name}" ${value} is not a KeyValueModel (but a ${value.constructor.name}).`);
                // The actual target key is validated by the key constraints in locking.
            }
        }
        return this;
    }

    #_lockAndFreeze() {
        Object.defineProperty(this, 'dependencies', {
            value: Object.freeze(this.dependencies)
          , writable: false
          , configurable: false
        });
        //
        // Would be nice to have this[OLD_STATE] like a history, but it also
        // prevents this[OLD_STATE] from being garbage collected!
        // Keeping it only in the top most element could be an option,
        // but collecting states in an external list may be even better.
        delete this[OLD_STATE];
        Object.defineProperty(this, '_value', {
            value: Object.freeze(this._value)
          , writable: false
          , configurable: false
        });
        Object.defineProperty(this, _IS_DRAFT_MARKER, {value: false, configurable: false});
        delete this[_LOCAL_PROXIES];
        Object.freeze(this);
    }
    #_metamorphoseCleanUp() {
        delete this.dependencies;
    }
    // This can be called without depenedencies or only with changed
    // dependencies, initially, a lack of dependencies is detected.
    // The case without dependencies is given when commiting a change within
    // a workflow, to trigger the side effects.
    * metamorphoseGen(dependencies={}) {
        if(!this.isDraft)
            throw new Error(`LIFECYCLE ERROR ${this} must be in draft mode to metamorphose.`);
        let result;
        try {
            result = yield * this.#_metamorphoseGen(dependencies);
        }
        finally {
            if(result === this) {
                // This metamorphosed into a new state!
                this.#_lockAndFreeze();
            }
            else {
                // on error or if(result === this[OLD_STATE]) {
                // reset metamorphose residues so that this draft could
                // be metamorphosed again (it happens, see the commit).
                this.#_metamorphoseCleanUp();
            }
        }
        return result;
    }

    get value() {
        if(this.isDraft)
            throw new Error(`LIFECYCLE ERROR ${this} will only return this.value when immutable/not a draft..`);
        return this._value;
    }

    *[Symbol.iterator]() {
        // maybe use flags to decide what not to yield
        // users (data readers) may require
        // yield keys, links?
        for(const key of this.ownKeys())
            yield [key, this.get(key)];
    }

    *allEntries() {
        for(const key of this.keys())
            yield [key, this.get(key)];
    }

    // TODO: something like this will probably be required.
    //toObject() {
    //    const result = {};
    //    for(let k of allKeys(this.fields, this.foreignKeys))
    //        result[k] = this._value.get(k).toObject();
    //    return result;
    //}

    get size() {
        //  FIXME: Keys and original values are contained. What about Links?
        // I have a hunch that even links, should be contained, if we want
        // to be able to further reference them.

        return this.constructor.fields.size + this.constructor.foreignKeys.size;
    }

    /**
     * True for values that are owned by this struct, that are:
     * fields and foreignKeys. These are stored originally in this._value.
     * Links (linked values) and Internalized Dependencies (also kind of
     * linked values) are not owned by this struct, they are just referenced,
     * links from "below" in the hierarchy, Internalized Dependencies from
     * above. These are still included in the this.has and this.keys interfaces.
     */
    hasOwn(key) {
        return this.constructor.fields.has(key) || this.constructor.foreignKeys.has(key);
    }

    /**
     * Returns an array of keys for values that are owned by this struct,
     * that are: fields and foreignKeys. These are stored originally in this._value.
     * See hasOwn for more details.
     */
    has(key) {
        return this.hasOwn(key) || this.constructor.links.has(key)
                || this.constructor.internalizedDependencies.has(key)
                || this.constructor.fallBackValues.has(key);
    }

    static ownKeys() {
        //  These and `hasOwn` follow the same rules!
        return [... this.fields.keys(), ...this.foreignKeys.keys(), ];
    }

    ownKeys() {
        return this.constructor.ownKeys();
    }

    keys() {
        return [...this.ownKeys(), ...this.constructor.links.keys()
                    , ...this.constructor.internalizedDependencies.keys()
                    , ...this.constructor.fallBackValues.keys()];
    }

    /**
     * hasDraftFor and getDraftFor are likely only a required interfaces
     * for _BaseContainerModel.
     */
    [_HAS_DRAFT_FOR_PROXY](proxy) {
        if(!this.isDraft)
            return false;

        if(!this[_LOCAL_PROXIES].byProxy.has(proxy))
            // the proxy is disconnected
            return false;

        const key = this[_LOCAL_PROXIES].byProxy.get(proxy)
            // MAY NOT BE A DRAFT AT THIS MOMENT!
          , item = this._value.get(key)
          ;
        if(!item || !item.isDraft)
            return false;

        // Identified via this[_LOCAL_PROXIES].
        return true;
    }

    [_HAS_DRAFT_FOR_OLD_STATE_KEY](key) {
        if(!this.isDraft)
            return false;
        // this implies that if this is a draft all items in
        // this._value must be drafts as well! But do we know?
        // It's not important: if the value was created externally
        // or set as an immutable from external, this won't return the
        // value anyways!

        if(!this._value.has(key))
            return false;

        if(this[_LOCAL_PROXIES].changedBySetter.has(key))
            // disconnected from original OLD_STATE key releation
            return false;

        // MAY NOT BE A DRAFT AT THIS MOMENT!
        const item = this._value.get(key);
        if(!item || !item.isDraft)
            return false;
        return true;
    }

    // called from the perspective of a proxy that was created when this
    // was still an immutable.
    [_GET_DRAFT_FOR_OLD_STATE_KEY](key) {
        if(!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(new Error(`IMMUTABLE WRITE ATTEMPT `
                +`${this}[_GET_DRAFT_FOR_OLD_STATE_KEY](${key}) is immutable, not a draft.`));

        if(!this.hasOwn(key))
            throw new Error(`KEY ERROR "${key}" not found in ${this}.`);

        if(this[OLD_STATE] === null)
            // I suppose this should never happen, this[OLD_STATE] must
            // not be null in this method.
            // When creating a primary state, we should not create proxies
            // for delayed drafts at all, so that can circumvent this.
            throw new Error(`ASSERTION FAILED this[OLD_STATE] should exist in this method.`);

        if(this[_LOCAL_PROXIES].changedBySetter.has(key))
            // disconnected _GET_DRAFT_FOR_OLD_STATE_KEY relates only to drafts
            // created directly for [OLD_STATE] entries.
            return false;

        const item = this._value.has(key)
            ? this._value.get(key) // => assert item.isDraft
              // expect OLD_STATE to exist!
            : this[OLD_STATE].get(key) // item is not a draft
            ;

        if(item.isDraft)
            // Since it was not changedBySetter this must be the original
            // draft for the item at OLD_STATE
            return item;

        const draft = item.getDraft();
        this._value.set(key, draft);
        return draft;
    }
    /**
     * Raises KeyError if key is not available.
     * Raises ImmutableWriteError if this is not a draft.
     *      => but the proxy is only available if this is a draft
     *         so if(!this.isDraft) should fail differently!
     * Returns False, if draft is not natively created by this function
     * i.e. set from the outside.
     * Returns a draft for key otherwise.
     * this is likely only for _BaseContainerModel
     */
    [_GET_DRAFT_FOR_PROXY](proxy) {
        // TODO: check if key exists! Else KEY ERROR ${key}
        if(!this.isDraft)
            throw immutableWriteError(new Error(`IMMUTABLE WRITE ATTEMPT `
                +`${this} is immutable, not a draft in [_GET_DRAFT_FOR_PROXY].`));

        if(!this[_LOCAL_PROXIES].byProxy.has(proxy))
            // proxy is disconnected
            return false;

        const key = this[_LOCAL_PROXIES].byProxy.get(proxy)
          , item = this._value.has(key)
                        ? this._value.get(key)
                        : this[OLD_STATE].get(key)
          ;

        // MAY NOT BE A DRAFT AT THIS MOMENT! => via set(key, immutable)...
        // in that case were going to replace the item in this._value with
        // its draft.
        if(item.isDraft)
            // We own the proxy, so the draft is from here.
            return item;
        const draft = item.getDraft();
        this._value.set(key, draft);
        return draft;
    }

    getDraftFor(key, defaultReturn=_NOTDEF) {
        let proxyOrDraft;
        try {
            proxyOrDraft = this._getOwn(key, defaultReturn);
        }
        catch(error) {
            if(error.message.startsWith('KEY ERROR'))
                // mark it
                throw draftKeyError(error);
            throw error;
        }

        if(_PotentialWriteProxy.isProxy(proxyOrDraft))
            return this[_GET_DRAFT_FOR_PROXY](proxyOrDraft);
        return proxyOrDraft;
    }

    _getOwn(key) {
        if(!this.hasOwn(key))
            throw new Error(`KEY ERROR "${key}" not found in ${this}.`);

        let item = this._value.has(key) && this._value.get(key);
        if(!item && this[OLD_STATE] !== null) {
            // item could be not in value but proxy could exist
            item = this[OLD_STATE].get(key);
        }
        if(!item)
            // This would just be weird!
            // In primal state, this._value is fully populated with primal
            // state elements and after this[OLD_STATE] is present.
            //
            // FIXME: However, it is still possible to run the constructor
            // directly, without an OLD_STATE and without metamorphose
            // after. That should be rooted out.
            throw new Error(`INTERNAL LOGIC ERROR "${key}" should exist, but it doesn't`);

        if(!this.isDraft)
            return item;

        // Don't create proxy twice and thereby detach the old one.
        if(!item.isDraft && this[_LOCAL_PROXIES].byKey.has(key))
            return this[_LOCAL_PROXIES].byKey.get(key); // => proxy;

        // The function understands if item is already a draft
        // and does not proxify item in that case.
        const proxyOrDraft = _PotentialWriteProxy.create(this, item);
        if(_PotentialWriteProxy.isProxy(proxyOrDraft)) {
            this[_LOCAL_PROXIES].byKey.set(key, proxyOrDraft);
            this[_LOCAL_PROXIES].byProxy.set(proxyOrDraft, key);
        }
        return proxyOrDraft;
    }

    _getLink(key) {
        if(!this.constructor.links.has(key))
            throw new Error(`KEY ERROR "${key}" is not a link found in ${this}.`);
        // resolve the link
        const link = this.constructor.links.get(key)
          , foreignKey = this.constructor.foreignKeys.get(link.keyName)
          , targetKey = this.get(link.keyName)
          , target = this.get(foreignKey.targetName)
          ;
        // FIXME: IMPROVE handling of this case everywhere!
        if(targetKey.value === ForeignKey.NULL)
            return ForeignKey.NULL;
        return target.get(targetKey.value);
    }

    _getFallBackValue(key) {
        if(!this.constructor.fallBackValues.has(key))
            throw new Error(`KEY ERROR "${key}" is not a fallBackValues found in ${this}.`);
        const fallBackValue = this.constructor.fallBackValues.get(key)
          , primaryValue = this.get(fallBackValue.primaryName)
          ;
        return primaryValue !== ForeignKey.NULL
            ? primaryValue
            : this.get(fallBackValue.fallBackName)
            ;
    }

    get(key, defaultReturn=_NOTDEF) {
        if(this.hasOwn(key))
            return this._getOwn(key);
        if(this.constructor.internalizedDependencies.has(key))
            return this.dependencies[this.constructor.internalizedDependencies.get(key).dependencyName];
        if(this.constructor.links.has(key))
            return this._getLink(key);
        if(this.constructor.fallBackValues.has(key))
            return this._getFallBackValue(key);
        if(defaultReturn !== _NOTDEF)
            return defaultReturn;
        throw new Error(`KEY ERROR "${key}" not found in ${this}.`);
    }

    // TODO: how does this work? Can't initialize at least complex stuff,
    // that has dependencies from outside!
    set(key, entry) {
        if(!this.isDraft)
            // Writing in all model classes:
            // raise an error when not in draft mode!
            // so the caller can change this into a draft
            // this can be achieved using js proxies!
            throw immutableWriteError(new Error(`NOT DRAFT ERROR: ${this} can't call set when not in draft phase.`));

        // Entry can be draft or an immutable, get and the potentialWriteProxy
        // will handle both cases.

        // The constructor will check types etc. but this still raises a
        // KEY ERROR if key can't be set, to alert early when this is attempted.
        if(!this.hasOwn(key))
            throw new Error(`KEY ERROR trying to set not owned (or unkown) "${key}" in ${this}.`);

        this._value.set(key, unwrapPotentialWriteProxy(entry));

        // This disconnects by-key potential write proxies
        this[_LOCAL_PROXIES].changedBySetter.add(key);
        if(this[_LOCAL_PROXIES].byKey.has(key)) {
            // break the connection
            const proxy = this[_LOCAL_PROXIES].byKey.get(key);
            this[_LOCAL_PROXIES].byKey.delete(key);
            this[_LOCAL_PROXIES].byProxy.delete(proxy);
        }
    }

    [SERIALIZE](options=SERIALIZE_OPTIONS) {
        const [resultErrors, entries]  = _serializeContainer(this,
                /*keepKeys*/SERIALIZE_OPTIONS.structStoreKeys, options);
        return [
            resultErrors
          , entries !== null && options?.structAsDict && SERIALIZE_OPTIONS.structStoreKeys
                ? Object.fromEntries(entries)
                : entries
        ];
    }
}

// list/array type
// items are accessed by index
// has a size/length
// I'd prefer to have a single type for all items, that way,
// we can't have undefined entries, however, a type could be
// of the form TypeOrEmpty...
// MultipleTargets ...!
export class _AbstractListModel extends _BaseContainerModel {
    static get Model() {
        // NOT IMPLEMENTED Model is not defined in _AbstractListModel
        throw new Error(`NOT IMPLEMENTED Model is not defined in ${this.name}`);
    }

    static get dependencies() {
        return this.Model.dependencies;
    }

    static createClass(className, Model /* a _BaseModel */) {
        // jshint unused: vars
        // this way name will naturally become class.name.
        const result = {
            // jshint ignore: start
            [className]: class extends this {
                static Model = Model;
            }
            // jshint ignore: end
        };
        // Can't override class.Model anymore, would be possible w/o the freeze.
        Object.freeze(result[className]);
        return result[className];
    }

    constructor(oldState=null, dependencies=null, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS) {
        if(oldState === null && dependencies === null)
            throw new Error(`TYPE ERROR either oldState or dependencies are required.`);
        if(oldState !== null && dependencies !== null)
            // The problem is that metamorphose may return OLD_STATE but
            // as a constructor that is invoked with the `new` keyword,
            // a new object must be returned.
            throw new Error(`TYPE ERROR can't constuct with both oldState and dependencies`);

        if(oldState && oldState.isDraft)
            throw new Error(`LIFECYCLE ERROR `
                    +`oldState ${oldState} is draft but must be immutable.`);
        super(oldState);

        // Start with an empty this._value for quick not-changed comparison.
        Object.defineProperty(this, '_value', {
            value: new Array(this[OLD_STATE] !== null ? this[OLD_STATE].length : 0)
          , writable: false // can't replace the array itself
          , configurable: true
        });
        Object.defineProperty(this, 'dependencies', {
            get: ()=>{
                if(this[OLD_STATE] === null)
                    throw new Error('Primal State has no dependencies yet!');
                // In draft-mode, this[OLD_STATE] has the dependencies.
                return this[OLD_STATE].dependencies;
            }
          , configurable: true
        });
        // Keep track of proxies and OLD_STATE original indexes in a
        // shadow of this._value that is kept in sync with value!
        // Entries may get replaced by set or moved/removed by splice.
        this[_OLD_TO_NEW_SLOT] = [...this._value.keys()]
                                     .map(index=>[index, null/*proxy*/]);

        // Create an immutable primal state if OLD_STATE is null:
        if(dependencies !== null) {
            if(serializedValue !== null) {
                // I don't want to have this as an direct argument
                // of metamorphose so far, as this way it's made sure
                // that only the Primal State can load the serialized
                // state. If it's not a primary state, change is handled
                // differently.
                this[_PRIMARY_SERIALIZED_VALUE] = [serializedValue, serializeOptions];
            }
            // Must return a new object (when called with `new`).
            // only works when there was no OLD_STATE
            if(dependencies !== _DEFERRED_DEPENDENCIES)
                return this.metamorphose(dependencies);
        }
    }

    * #_metamorphoseGen(dependencies={}) {
        //CAUTION: `this` is the object not the class.
        //
        // All the following runs, to change deep down a single axis location value.
        //        It is very important to make this as lightweight as possible.
        //        At the same time, it is important that the change bubbles
        //        through the whole structure.

        // Allow case without or with incomplete dependencies argument,
        // will re-use this[OLD_STATE].dependencies.
        // Fails in the if dependencies are missing.
        const dependenciesData = collectDependencies(
                                          this.constructor.dependencies
                                        , dependencies
                                        , this[OLD_STATE]?.dependencies);

        // Required for comparison between OLD_STATE and this.
        // These are the names and values of the dependencies of the class.
        // We need to compare these to see if a change of the object is required.
        //
        // It's interesting, I'm not sure we need to do this comparision
        // in here! We may not even have to keep reccord of these, as the
        // children will do. If there are no children, this will not actually
        // have dependencies, if there are children, the children will report...
        //
        // There's a case: when in draft, to create a child for insertion
        // it's good to have the dependencies for the constructor. They can
        // be taken from [OLD_STATE] basically and be used directly.
        //
        // myOldList // maybe like myDraftList[OLD_STATE] or from the app state
        // newEntry = myOldList.Model.createPrimalState(myOldList.dependencies)
        // or
        // newEntry = new myOldList.Model(null, myOldList.dependencies);

        Object.defineProperty(this, 'dependencies', {
            value: Object.freeze(dependenciesData)
          , writable: true
          , configurable: true
        });

        if(this[_PRIMARY_SERIALIZED_VALUE]) {
            const [serializedValues, serializeOptions] = this[_PRIMARY_SERIALIZED_VALUE]
              , childItems = []
              ;
            for(const serializedValue of serializedValues) {
                const childItem = yield *this.constructor.Model.createPrimalStateGen(
                    this.dependencies, serializedValue, serializeOptions);
                childItems.push(childItem);
            }
            this.push(...childItems);
        }
        // Don't keep this
        delete this[_PRIMARY_SERIALIZED_VALUE];

        const dependenciesAreEqual = this[OLD_STATE] !== null
                && objectEntriesAreEqual(this[OLD_STATE].dependencies, this.dependencies);

        // shortcut
        if(dependenciesAreEqual
                && this.size === this[OLD_STATE].size
                   // is only empty slots i.e. no changes
                && Object.values(this._value).length === 0
        )
            return this[OLD_STATE];

        for(const index of this._value.keys()) {
            let item = Object.hasOwn(this._value, index) && this._value[index];
            if(!item &&  this[OLD_STATE] !== null) {
                const [oldIndex, /*proxy*/] = this[_OLD_TO_NEW_SLOT][index];
                item = this[OLD_STATE].get(oldIndex);
            }

            if(!(item instanceof this.constructor.Model))
                throw new Error(`TYPE ERROR ${this.constructor.name} `
                    + `expects ${this.constructor.Model.name} `
                    + `wrong type in ${index} ("${item}" typeof ${typeof item}).`
                );
            const immutable = item.isDraft
                    ? yield * item.metamorphoseGen(this.dependencies)
                      // Not sure if we should check with objectEntriesAreEqual
                      // or just let entry check itself if it has to move forward.
                    : (!objectEntriesAreEqual(this.dependencies, item.dependencies)
                          ? yield *item.getDraft().metamorphoseGen(this.dependencies)
                          : item
                      )
              ;
            this._value[index] = immutable;
        }
        // last stop to detect a no-change
        if(this[OLD_STATE] !== null
                && dependenciesAreEqual
                && this.size === this[OLD_STATE].size
                && this._value.every((entry, index)=>entry === this[OLD_STATE].get(index)))
            return this[OLD_STATE];
        return this;
    }

    #_lockAndFreeze() {
        Object.defineProperty(this, 'dependencies', {
            value: Object.freeze(this.dependencies)
          , writable: true
          , configurable: true
        });
        delete this[OLD_STATE];
        Object.defineProperty(this, '_value', {
            value: Object.freeze(this._value)
          , writable: false
          , configurable: false
        });
        Object.defineProperty(this, _IS_DRAFT_MARKER, {value: false, configurable: false});
        delete this[_OLD_TO_NEW_SLOT];
        Object.freeze(this);
    }

    #_metamorphoseCleanUp() {
        delete this.dependencies;
    }

    * metamorphoseGen(dependencies={}) {
        if(!this.isDraft)
            throw new Error(`LIFECYCLE ERROR ${this} must be in draft mode to metamorphose.`);
        let result;
        try {
            result = yield * this.#_metamorphoseGen(dependencies);
        }
        finally {
            if(result === this) {
                // This metamorphosed into a new state!
                this.#_lockAndFreeze();
            }
            else {
                // on error or if(result === this[OLD_STATE]) {
                // reset metamorphose residues so that this draft could
                // be metamorphosed again (it happens, see the commit).
                this.#_metamorphoseCleanUp();
            }
        }
        return result;
    }

    get value() {
        if(this.isDraft)
            throw new Error(`LIFECYCLE ERROR ${this} will only return this.value when immutable/not a draft..`);
        return this._value;
    }

    get length() {
        return this._value.length;
    }

    get size() {
        return this._value.length;
    }

    hasOwn(key) {
        const [index, /*message*/] = this.keyToIndex(key);
        return index !== null;
    }

    ownKeys() {
        return [...this._value.keys()].map(i=>i.toString(10));
    }

    *[Symbol.iterator]() {
        for(const key of this.ownKeys())
            yield [key, this.get(key)];
    }

    /**
     * hasDraftFor and getDraftFor are likely only a required interfaces
     * for _BaseContainerModel.
     */
    [_HAS_DRAFT_FOR_PROXY](proxy) {
        if(!this.isDraft)
            return false;
        // this implies that if this is a draft all items in
        // this._value must be drafts as well! But do we know?
        // It's not important: if the value was created externally
        // or set as an immutable from external, this won't return the
        // value anyways!

        const index = this[_OLD_TO_NEW_SLOT].findIndex(([,ownProxy])=>ownProxy===proxy);
        if(index === -1)
            // proxy is disconnected
            return false;

        // May not be a draft at this moment!
        // In that case it may also not yet be in this._value.
        const item = Object.hasOwn(this._value, index) && this._value[index];
        if(!item || !item.isDraft)
            return false;

        // Item is a draft created here for proxy. We know because
        // the proxy was used to find the index.
        return true;
    }
    [_HAS_DRAFT_FOR_OLD_STATE_KEY](oldKey) {
        if(!this.isDraft)
            return false;
        // this implies that if this is a draft all items in
        // this._value must be drafts as well! But do we know?
        // It's not important: if the value was created externally
        // or set as an immutable from external, this won't return the
        // value anyways!

        const [oldIndex, message] = this[OLD_STATE].keyToIndex(oldKey);
        if(oldIndex === null)
            // was not in OLD_STATE
            throw new Error(message);

        const index = this[_OLD_TO_NEW_SLOT].findIndex(([ownOldIndex,])=>ownOldIndex===oldIndex);
        if(index === -1)
            // proxy is disconnected
            return false;

        // May not be a draft at this moment!
        // In that case it may also not yet be in this._value.
        const item = Object.hasOwn(this._value, index) && this._value[index];
        if(!item || !item.isDraft)
            return false;

        // Item is a draft created here for key. We know because
        // the key was used to find the index.
        return true;
    }

    [_GET_DRAFT_FOR_OLD_STATE_KEY](oldKey) {
        // key must be in this[OLD_STATE]!
        // draft will be for this[OLD_STATE].get(key).getDraft()
        if(!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(new Error(`IMMUTABLE WRITE ATTEMPT `
                +`${this}[_GET_DRAFT_FOR_OLD_STATE_KEY](${oldKey}) is immutable, not a draft.`));

        const [oldIndex, message] = this[OLD_STATE].keyToIndex(oldKey);

        if(oldIndex === null)
            // was not in OLD_STATE
            throw new Error(message);

        const index = this[_OLD_TO_NEW_SLOT].findIndex(([ownOldIndex,])=>ownOldIndex===oldIndex);
        if(index === -1)
            // The item associated with oldIndex is no longer part of this
            // object, the proxy is disconnected.
            return false;

        let item = Object.hasOwn(this._value, index) && this._value[index];
        if(!item)
            item = this[OLD_STATE].get(oldIndex);

        if(item.isDraft)
            // We already created the connection between
            // index and oldIndex, we found index via oldKey,
            // item belongs to oldIndex.
            return item;
        const draft = item.getDraft();
        this._value[index] = draft;
        return draft;
    }

    /**
     * Raises KeyError if key is not available.
     * Raises ImmutableWriteError if this is not a draft.
     * Returns False, if draft is not natively created by this function
     * i.e. set from the outside.
     * Returns a draft for key otherwise.
     * this is likely only for _BaseContainerModel
     */
    [_GET_DRAFT_FOR_PROXY](proxy) {
        if(!this.isDraft)
            throw immutableWriteError(new Error(`IMMUTABLE WRITE ATTEMPT `
                +`${this} is immutable, not a draft in [_GET_DRAFT_FOR_PROXY].`));

        const index = this[_OLD_TO_NEW_SLOT].findIndex(([,ownProxy])=>ownProxy===proxy);
        if(index === -1)
            // proxy is disconnected
            return false;

        let item = Object.hasOwn(this._value, index) && this._value[index];
        if(!item) {
            const [oldIndex, ] = this[_OLD_TO_NEW_SLOT][index];
            // assert oldIndex is there, otherwise this will raise a Key Error
            // also, if oldIndex got removed from _OLD_TO_NEW_SLOT there
            // must be an item in this._value or the proxy is disconnected.
            item = this[OLD_STATE].get(oldIndex);
        }
        if(item.isDraft)
            // since we found it via proxy, item belongs to it.
            // assert this._value[index] === item
            return item;
        const draft = item.getDraft();
        this._value[index] = draft;
        return draft;
    }

    getDraftFor(key, defaultReturn=_NOTDEF) {
        const proxyOrDraft = this.get(key, defaultReturn);
        if(_PotentialWriteProxy.isProxy(proxyOrDraft))
            return this[_GET_DRAFT_FOR_PROXY](proxyOrDraft);
        return proxyOrDraft;
    }

    /**
     * Zero-based index of the array element to be returned, converted
     * to an integer. Negative index counts back from the end of the
     * array — if index < 0, index + array.length is accessed.
     */
    keyToIndex(key) {
        if(key === ForeignKey.NULL)
            return [null, `KEY ERROR ForeignKey.NULL is not a key.`];
        if(key === undefined)
            return [null, `KEY ERROR key is undefined.`];
        const stringKey = key.toString();
        let index = parseInt(stringKey, 10);
        if(isNaN(index))
            return [null, `KEY ERROR can't parse "${stringKey}" as integer.`];
        if(index < 0)
            // like Array.prototype.at
            // HOWEVER, the key is not the canonical path in this case;
            index = index + this._value.length;
        if(index < 0 || index >= this._value.length)
           return [null, `KEY ERROR NOT FOUND key "${stringKey}" is not an index (parseInt: ${index})`
                       + ` (index < 0 || index >= lenght ${this._value.length}). in ${this}`];
        return [index, null];
    }

    indexOf(item, fromIndex) {
        return this._value.indexOf(item, fromIndex);
    }

    get(key, defaultReturn=_NOTDEF) {
        const [index, message] = this.keyToIndex(key);
        if(index === null) {
            if(defaultReturn !== _NOTDEF)
                return defaultReturn;
            throw new Error(message);
        }

        if(!this.isDraft)
            return this._value[index];

        // Can be a draft or immutable e.g. via set(index, element)
        let item = Object.hasOwn(this._value, index) && this._value[index];
        if(!item) {
            // If there's no item in value[index] yet, oldIndex will exist.
            const [oldIndex, proxy] = this[_OLD_TO_NEW_SLOT][index];
            if(proxy)
                // Important, otherwise we could create the proxy multiple
                // times and override the older versions.
                return proxy;
            // KeyError if the assumption is wrong, this would require
            // fixing in here!
            // Is always immutable.
            item = this[OLD_STATE].get(oldIndex);
        }

        // The function understands if item is already a draft
        // and does not proxify item in that case.
        const proxyOrDraft = _PotentialWriteProxy.create(this, item);
        if(_PotentialWriteProxy.isProxy(proxyOrDraft))
            // it's a proxy
            this[_OLD_TO_NEW_SLOT][index][1] = proxyOrDraft;
        // else: It is a draft already and the draft is at this._value[index];
        return proxyOrDraft;
    }

    // FIXME: thinking, if this has a child-type with dependencies,
    //        it should be possible to create a new 'blank'/default entry
    //        at that index as a draft and manipulate it, there's not really
    //        a use for a set function then.
    // Also, if a dependency changes, it will be interesting how to handle
    // that change in a list etc. will we try to keep state or basically reset
    // everything? I guess this will be an afterthought, after establishing a
    // general working model for dependency management. And maybe configurable
    // per case.
    // TODO: remove `set`
    //       add interface to createAt(key) => primal->draft
    //       only in draft mode
    set(key, entry) {
        const [index, message] = this.keyToIndex(key);
        if(index === null)
            throw new Error(message);
        this.splice(index, 1, entry);
    }

    push(...entries) {
        this.splice(Infinity, 0, ...entries);
        return this.length;
    }
    unshift(...entries) {
        this.splice(0, 0, ...entries);
        return this.length;
    }
    pop() {
        return this.splice(-1, 1)[0];
    }
    shift() {
        return this.splice(0, 1)[0];
    }
    delete(key) {
        const [index,/* message*/] = this.keyToIndex(key);
        if(index === null)
            return;
        return this.splice(index, 1)[0];
    }
    // The Swiss Army Knive of array methods.
    splice(start, deleteCount, ...entries) {
        if(!this.isDraft)
            // FIXME: for the potential write proxy, it becomes very
            // interesting trying to write many entries.
            // Also interesting for that when trying to write no entries and just removing stuff.
            throw immutableWriteError(new Error(`NOT DRAFT ERROR: ${this} can't call splice when not in draft phase.`));

        const removed = this._value.splice(start, deleteCount, ...entries.map(entry=>unwrapPotentialWriteProxy(entry)))
           // Replaces [index, proxy] by empty arrays, disconnecting proxies
         , oldToNewRemoved = this[_OLD_TO_NEW_SLOT].splice(start, deleteCount, ...new Array(entries.length).fill(null).map(()=>[]))
         ;
        for(let index=0;index<removed.length;index++) {
            if(!Object.hasOwn(removed, index)) {
                // If there's no item in value[index] yet, oldIndex will exist.
                const [oldIndex/*, proxy*/] = oldToNewRemoved[index];
                // Could be necessary to handle proxy as well, but it is
                // not written to by now, so we may just return the immutable.
                removed[index] = this[OLD_STATE].get(oldIndex);
            }
        }
        return removed;
    }
    [SERIALIZE](options=SERIALIZE_OPTIONS) {
        return _serializeContainer(this, /*keepKeys*/false, options);
    }
}

/**
 * I'm not moving this to the new lifecycle protocol for now.
 * _AbstractOrderedMapModel does everything this would do (and more),
 * however, this would be much simpler and probably a bit faster.
 * Willing to deliver later.
 *
// Very similar to _AbstractListModel _AbstractOrderedMapModel
export class _AbstractMapModel extends _BaseContainerModel {
    static get Model() {
        // NOT IMPLEMENTED Model is not defined in _AbstractMapModel
        throw new Error(`NOT IMPLEMENTED Model is not defined in ${this.name}`);
    }

    static get dependencies() {
        return this.Model.dependencies;
    }

    static createClass(className, Model /* a _BaseModel * /) {
        // jshint unused: vars
        // this way name will naturally become class.name.
        const result = {
            // jshint ignore: start
            [className]: class extends this {
                static Model = Model;
            }
            // jshint ignore: end
        };
        // Can't override class.Model anymore, would be possible w/o the freeze.
        // Maybe only fix "Model" property?
        // Object.freeze(result[className]);
        return result[className];
    }

    constructor(entries) {
        super();
        {
            const typeFails = [];
            for(const [key, entry] of entries) {
                if(!(entry instanceof this.constructor.Model))
                    typeFails.push(`${key} ("${entry}" typeof ${typeof entry})`);
            }
            if(typeFails.length)
                throw new Error(`TYPE ERROR ${this.constructor.name} `
                    + `expects ${this.constructor.Model.name} `
                    + `wrong types in ${typeFails.join(', ')}`
                );
        }
        Object.defineProperty(this, 'value', {
            value: Object.freeze(new FreezableMap(entries))
          , writable: false
          , enumerable: true
        });
    }

    get size() {
        return this._value.size;
    }

    keys() {
        return this._value.keys();
    }

    has(key) {
        return this._value.has(key);
    }

    get(key, defaultReturn=_NOTDEF) {
        if(!this._value.has(key)) {
            if(defaultReturn !== _NOTDEF)
                return defaultReturn;
            throw new Error(`KEY ERROR "${key}" not found in ${this}.`);
        }
        return this._value.get(key);
    }

    set(key, entry) {
        // could return this
        if(this._value.has(key) && this._value.get(key) === entry)
            return this;
        const newValue = new Map(this._value);
        newValue.set(key, entry);
        return new this.constructor(Array.from(newValue));
    }

    delete(key) {
        if(!this._value.has(key))
            return this;
        const newValue = new Map(this._value);
        newValue.delete(key);
        return new this.constructor(Array.from(newValue));
    }
}
*/

/**
 * The only use of this function so far is to demo custom ordering in
 * _AbstractOrderedMapModel. It's not included as a fixed option,
 * like e.g. KEYS_ALPHA, as it doesn't really have an actual use-case IMO.
 *
 * setup = {
 *      ordering: _AbstractOrderedMapModel.ORDER.CUSTOM
 *    , customOrderingFn: toShuffle
 * }
 * const MyModelMap = _AbstractOrderedMapModel.createClass('MyModelMap', MyModel, setup);
 */
export function toShuffle(from) {
    let array = Array.from(from)
    let currentIndex = array.length;
    // While there remain elements to shuffle...
    while (currentIndex != 0) {
        // Pick a remaining element...
        let randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [
                        array[randomIndex], array[currentIndex]];
    }
    return array;
}

// combines the order and inserting logic of the _AbstractListModel
// with the uniqueness by the keys of the _AbstractMapModel
// FIXME it should be possible to have a way to validate keys
//       that is attached to the concrete class via createClass.
const MAP_ORDER = Object.freeze({
    KEYS_ALPHA: Symbol('ORDER_KEYS_ALPHA')
  , KEYS_ALPHA_REVERSE: Symbol('ORDER_KEYS_ALPHA_REVERSE')
  , CUSTOM: Symbol('ORDER_CUSTOM')
  , CUSTOM_REVERSE: Symbol('ORDER_CUSTOM_REVERSE')
});

export class _AbstractOrderedMapModel extends _BaseContainerModel {
    static get Model() {
        // NOT IMPLEMENTED Model is not defined in _AbstractMapModel
        throw new Error(`NOT IMPLEMENTED Model is not defined in ${this.name}`);
    }

    static get dependencies() {
        return this.Model.dependencies;
    }

    static ORDER = MAP_ORDER;

    static [MAP_ORDER.KEYS_ALPHA](values) {
        const entries = new Map()
          , keys = []
          ;
        for(const [key, data] of values) {
            entries.set(key, [key, data]);
            keys.push(key);
        }
        return keys.sort(sort_alpha)
                   .map(key=>entries.get(key));
    }

    static [MAP_ORDER.KEYS_ALPHA_REVERSE](values) {
        return this[this.ORDER.KEYS_ALPHA](values).reverse();
    }

    static [MAP_ORDER.CUSTOM](values) {
        return this._customOrderingFn(values);
    }

    static [MAP_ORDER.CUSTOM_REVERSE](values) {
        return this._customOrderingFn(values).reverse();
    }

    static createClass(className, Model /* a _BaseModel */, setup={}) {
        // jshint unused: vars
        setup = {ordering:_NOTDEF, customOrderingFn:_NOTDEF, validateKeyFn:_NOTDEF, ...setup};
        if(setup.ordering !== _NOTDEF) {
            const availableOrderingSymbols = new Set(Object.values(this.ORDER));
            if(!availableOrderingSymbols.has(setup.ordering))
                throw new Error(`KEY ERROR setup.ordering unknown "${setup.ordering.toString()}" `
                    + `allowed values are ${this.name}.ORDER.(${Object.keys(this.ORDER).join('|')}).`);
            if(setup.ordering === this.ORDER.CUSTOM || setup.ordering === this.ORDER.CUSTOM_REVERSE) {
                if(setup.customOrderingFn === _NOTDEF)
                    throw new Error(`VALUE ERROR setup.ordering is "${setup.ordering.toString()}" but setup.customOrderingFn is not specified`);
                if(typeof setup.customOrderingFn !== 'function')
                    throw new Error(`VALUE ERROR setup.customOrderingFn must be a function but is "${typeof setup.customOrderingFn}".`);
                // NOTE: Not checking here if that function behaves correctly!
            }
        }
        if(setup.validateKeyFn !== _NOTDEF) {
            if(typeof setup.validateKeyFn !== 'function')
                throw new Error(`VALUE ERROR setup.validateKeyFn must be a function but is "${typeof setup.validateKeyFn}".`);
        }

        // this way name will naturally become class.name.
        const result = {
            // jshint ignore: start
            [className]: class extends this {
                static Model = Model;
                static ORDERING = setup.ordering === _NOTDEF ? null : setup.ordering;
                static _customOrderingFn = setup.customOrderingFn === _NOTDEF
                    ? function(/*values*/){throw new Error(`NOT IMPLEMENTED _customOrderingFn is not defined in ${this.name}`);}
                    : setup.customOrderingFn
                static validateKeyFn = setup.validateKeyFn === _NOTDEF ? null : setup.validateKeyFn;
            }
            // jshint ignore: end
        };
        // Can't override class.Model anymore, would be possible w/o the freeze.
        // Maybe only fix "Model" property?
        // Object.freeze(result[className]);
        return result[className];
    }

    constructor(oldState=null, dependencies=null, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS) {
        if(oldState === null && dependencies === null)
            throw new Error(`TYPE ERROR either oldState or dependencies are required.`);
        if(oldState !== null && dependencies !== null)
            // The problem is that metamorphose may return OLD_STATE but
            // as a constructor that is invoked with the `new` keyword,
            // a new object must be returned.
            throw new Error(`TYPE ERROR can't constuct with both oldState and dependencies`);

        if(oldState && oldState.isDraft)
            throw new Error(`LIFECYCLE ERROR `
                    +`oldState ${oldState} is draft but must be immutable.`);
        super(oldState);

        // Start with an empty this._value for quick not-changed comparison.
        Object.defineProperty(this, '_value', {
            value: new Array(this[OLD_STATE] !== null ? this[OLD_STATE].length : 0)
          , writable: false // can't replace the array itself
          , configurable: true
        });
        Object.defineProperty(this, '_keys', {
            value: new FreezableMap()
          , writable: false // can't replace the FreezableMap itself
          , configurable: true
        });
        Object.defineProperty(this, 'dependencies', {
            get: ()=>{
                if(this[OLD_STATE] === null)
                    throw new Error('Primal State has no dependencies yet!');
                // In draft-mode, this[OLD_STATE] has the dependencies.
                return this[OLD_STATE].dependencies;
            }
          , configurable: true
        });
        // Keep track of proxies and OLD_STATE original indexes in a
        // shadow of this._value that is kept in sync with value!
        // Entries may get replaced by set or moved/removed by splice.

        this[_OLD_TO_NEW_SLOT] = this[OLD_STATE] !== null
                ? [...this[OLD_STATE]].map(
                        ([key, /*value*/], index)=>[index, key, null/*proxy*/])
                : []
                ;
        this._updateKeys();

        // Create an immutable primal state if OLD_STATE is null:
        if(dependencies !== null) {
            if(serializedValue !== null) {
                // I don't want to have this as an direct argument
                // of metamorphose so far, as this way it's made sure
                // that only the Primal State can load the serialized
                // state. If it's not a primary state, change is handled
                // differently.
                this[_PRIMARY_SERIALIZED_VALUE] = [serializedValue, serializeOptions];
            }
            // Must return a new object (when called with `new`).
            // only works when there was no OLD_STATE
            if(dependencies !== _DEFERRED_DEPENDENCIES)
                return this.metamorphose(dependencies);
        }
    }

    * #_metamorphoseGen(dependencies={}) {
        //CAUTION: `this` is the object not the class.
        //
        // All the following runs, to change deep down a single axis location value.
        //        It is very important to make this as lightweight as possible.
        //        At the same time, it is important that the change bubbles
        //        through the whole structure.

        // Allow case without or with incomplete dependencies argument,
        // will re-use this[OLD_STATE].dependencies.
        // Fails in the if dependencies are missing.
        const dependenciesData = collectDependencies(
                                          this.constructor.dependencies
                                        , dependencies
                                        , this[OLD_STATE]?.dependencies);

        Object.defineProperty(this, 'dependencies', {
            value: Object.freeze(dependenciesData)
          , writable: true
          , configurable: true
        });

        if(this[_PRIMARY_SERIALIZED_VALUE]) {
            const [serializedValues, serializeOptions] = this[_PRIMARY_SERIALIZED_VALUE]
              , childItems = []
              ;
            for(const [key, serializedValue] of serializedValues) {
                const childItem = yield *this.constructor.Model.createPrimalStateGen(
                    this.dependencies, serializedValue, serializeOptions);
                childItems.push([key, childItem]);
            }
            this.push(...childItems);
        }
        // Don't keep this
        delete this[_PRIMARY_SERIALIZED_VALUE];

        const dependenciesAreEqual = this[OLD_STATE] !== null
                && objectEntriesAreEqual(this[OLD_STATE].dependencies, this.dependencies);

        // shortcut
        if(dependenciesAreEqual
                && this.size === this[OLD_STATE].size
                   // is only empty slots i.e. no changes
                && Object.values(this._value).length === 0
        )
            return this[OLD_STATE];

        for(const index of this._value.keys()) {
            let kvItem = Object.hasOwn(this._value, index)
                ? this._value[index]
                : this[OLD_STATE].value[this[_OLD_TO_NEW_SLOT][index][0]]
                ;
            const [key, item] = kvItem || [];

            if(!(item instanceof this.constructor.Model))
                throw new Error(`TYPE ERROR ${this.constructor.name} `
                    + `expects ${this.constructor.Model.name} `
                    + `wrong type at ${key} in ${index} ("${item}" typeof ${typeof item}).`
                );
            const immutable = item.isDraft
                    ? yield *item.metamorphoseGen(this.dependencies)
                      // Not sure if we should check with objectEntriesAreEqual
                      // or just let entry check itself if it has to move forward.
                    : (!objectEntriesAreEqual(this.dependencies, item.dependencies)
                          ? yield *item.getDraft().metamorphoseGen(this.dependencies)
                          : item
                      )
              ;
            this._value[index] = Object.freeze([key, immutable]);
        }

        // NOTE: this only ensures that the immutable map is ordered
        // the mutable map can be in undefined order.
        if(this.constructor.ORDERING !== null) {
            // this._keys will get updated in #_lockAndFreeze via _updateKeys();
            const newlyOrderedEntries = this.constructor[this.constructor.ORDERING](this._value);
            this._value.splice(0, Infinity);
            for(const entry of newlyOrderedEntries)
                this._value.push(entry);
        }

        // last stop to detect a no-change
        if(this[OLD_STATE] !== null
                && dependenciesAreEqual
                && this.size === this[OLD_STATE].size
                && this._value.every((entry, index)=>{
                        const [key, value] = entry
                          , [oldKey, oldValue] = this[OLD_STATE].value[index]
                          ;
                        return key === oldKey && value === oldValue;
                    }))
            return this[OLD_STATE];
        return this;
    }

    #_lockAndFreeze() {
        Object.defineProperty(this, 'dependencies', {
            value: Object.freeze(this.dependencies)
          , writable: true
          , configurable: true
        });
        delete this[OLD_STATE];
        Object.defineProperty(this, '_value', {
            value: Object.freeze(this._value)
          , writable: false
          , configurable: false
        });
        this._updateKeys();
        Object.defineProperty(this, '_keys', {
            value: Object.freeze(this._keys)
          , writable: false
          , configurable: false
        });

        Object.defineProperty(this, _IS_DRAFT_MARKER, {value: false, configurable: false});
        delete this[_OLD_TO_NEW_SLOT];
        Object.freeze(this);
    }

    #_metamorphoseCleanUp() {
        delete this.dependencies;
    }

    * metamorphoseGen(dependencies={}) {
        if(!this.isDraft)
            throw new Error(`LIFECYCLE ERROR ${this} must be in draft mode to metamorphose.`);
        let result;
        try {
            result = yield * this.#_metamorphoseGen(dependencies);
        }
        finally {
            if(result === this) {
                // This metamorphosed into a new state!
                this.#_lockAndFreeze();
            }
            else {
                // on error or if(result === this[OLD_STATE]) {
                // reset metamorphose residues so that this draft could
                // be metamorphosed again (it happens, see the commit).
                this.#_metamorphoseCleanUp();
            }
        }
        return result;
    }

    _updateKeys() {
        this._keys.clear();
        for(const index of this._value.keys()) {
            const key = Object.hasOwn(this._value, index)
                ? this._value[index][0]
                : this[_OLD_TO_NEW_SLOT][index][1]
                ;
             this._keys.set(key, index);
        }
    }

    get value() {
        if(this.isDraft)
            throw new Error(`LIFECYCLE ERROR ${this} will only return this.value when immutable/not a draft..`);
        return this._value;
    }

    *[Symbol.iterator]() {
        for(const key of this.ownKeys())
            yield [key, this.get(key)];
    }

    *indexedEntries() {
        for(const [key, value] of this) {
            const [index, /* error message*/] = this.keyToIndex(key);
            yield [index, [key, value]];
        }
    }

    get length() {
        return this._value.length;
    }

    get size() {
        return this._value.length;
    }

    hasOwn(key) {
        return this._keys.has(key);
    }
    /**
     * hasDraftFor and getDraftFor are likely only a required interfaces
     * for _BaseContainerModel.
     */
    [_HAS_DRAFT_FOR_PROXY](proxy) {
        if(!this.isDraft)
            return false;

        const index = this[_OLD_TO_NEW_SLOT].findIndex(([,,ownProxy])=>ownProxy===proxy);
        if(index === -1)
            // proxy is disconnected
            return false;

        // May not be a draft at this moment!
        // In that case it may also not yet be in this._value.
        const [/*key*/, item] = Object.hasOwn(this._value, index) && this._value[index] || [null, null];
        if(!item || !item.isDraft)
            return false;

        // Item is a draft created here for proxy. We know because
        // the proxy was used to find the index.
        return true;
    }
    [_HAS_DRAFT_FOR_OLD_STATE_KEY](oldKey) {
        if(!this.isDraft)
            return false;
        const [oldIndex, message] = this[OLD_STATE].keyToIndex(oldKey);
        if(oldIndex === null)
            // was not in OLD_STATE
            throw new Error(message);

        const index = this[_OLD_TO_NEW_SLOT].findIndex(([,ownOldKey])=>ownOldKey===oldKey);
        if(index === -1)
            // proxy is disconnected
            return false;

        // May not be a draft at this moment!
        // In that case it may also not yet be in this._value.
        const [/*key*/, item] = Object.hasOwn(this._value, index) && this._value[index] || [null, null];
        if(!item || !item.isDraft)
            return false;

        // Item is a draft created here for key. We know because
        // the key was used to find the index.
        return true;
    }

    [_GET_DRAFT_FOR_OLD_STATE_KEY](oldKey) {
        // key must be in this[OLD_STATE]!
        // draft will be for this[OLD_STATE].get(key).getDraft()
        if(!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(new Error(`IMMUTABLE WRITE ATTEMPT `
                +`${this}[_GET_DRAFT_FOR_OLD_STATE_KEY](${oldKey}) is immutable, not a draft.`));

        const [oldIndex, message] = this[OLD_STATE].keyToIndex(oldKey);
        if(oldIndex === null)
            // was not in OLD_STATE
            throw new Error(message);

        const index = this[_OLD_TO_NEW_SLOT].findIndex(([,ownOldKey])=>ownOldKey===oldKey);
        if(index === -1)
            // The item associated with oldIndex is no longer part of this
            // object, the proxy is disconnected.
            return false;

        let kvItem = Object.hasOwn(this._value, index) && this._value[index];
        if(!kvItem) {
            const item = this[OLD_STATE].get(oldKey);
            kvItem = [oldKey, item];
        }
        const [key, item] = kvItem;
        if(item.isDraft)
            // We already created the connection between
            // index and oldIndex, we found index via oldKey,
            // item belongs to oldIndex.
            return item;
        const draft = item.getDraft();
        this._value[index] = Object.freeze([key, draft]);
        return draft;
    }

    /**
     * Raises KeyError if key is not available.
     * Raises ImmutableWriteError if this is not a draft.
     * Returns False, if draft is not natively created by this function
     * i.e. set from the outside.
     * Returns a draft for key otherwise.
     * this is likely only for _BaseContainerModel
     */
    [_GET_DRAFT_FOR_PROXY](proxy) {
        if(!this.isDraft)
            throw immutableWriteError(new Error(`IMMUTABLE WRITE ATTEMPT `
                +`${this} is immutable, not a draft in [_GET_DRAFT_FOR_PROXY].`));

        const index = this[_OLD_TO_NEW_SLOT].findIndex(([,,ownProxy])=>ownProxy===proxy);
        if(index === -1)
            // proxy is disconnected
            return false;

        let kvItem = Object.hasOwn(this._value, index) && this._value[index];
        if(!kvItem) {
            const [/*oldIndex*/, key] = this[_OLD_TO_NEW_SLOT][index]
                // assert key is there, otherwise this will raise a Key Error
                // also, if oldIndex got removed from _OLD_TO_NEW_SLOT there
                // must be an item in this._value or the proxy is disconnected.
              , item = this[OLD_STATE].get(key)
              ;
            kvItem = [key, item];
        }
        const [key, item] = kvItem;
        if(item.isDraft)
            // since we found it via proxy, item belongs to it.
            // assert this._value[index] === item
            return item;
        const draft = item.getDraft();
        this._value[index] = Object.freeze([key, draft]);
        return draft;
    }

    getDraftFor(key, defaultReturn=_NOTDEF) {
        const proxyOrDraft = this.get(key, defaultReturn);
        if(_PotentialWriteProxy.isProxy(proxyOrDraft))
            return this[_GET_DRAFT_FOR_PROXY](proxyOrDraft);
        return proxyOrDraft;
    }

    get(key, defaultReturn=_NOTDEF) {
        const [index, message] = this.keyToIndex(key);
        if(index === null) {
            if(defaultReturn !== _NOTDEF)
                return defaultReturn;
            throw new Error(message);
        }

        if(!this.isDraft)
            return this._value[index][1];

        // Can be a draft or immutable e.g. via set(index, element)
        let item = Object.hasOwn(this._value, index) && this._value[index][1];
        if(!item) {
            // If there's no item in value[index] yet, oldIndex will exist.
            // FIXME: I guess I could rather just use: this[OLD_STATE].get(key)
            //        instead of taking this discourse. Of course:
            //              assert oldKey === key
            //              assert oldKey === this[OLD_STATE].keyToIndex(key)[0]
            //        In that case this[_OLD_TO_NEW_SLOT] could be simplified
            //        as there would be no need to carry oldIndex around!
            const [oldIndex, /*oldKey*/, proxy] = this[_OLD_TO_NEW_SLOT][index];
            if(proxy)
                // Important, otherwise we could create the proxy multiple
                // times and override the older versions.
                return proxy;
            // KeyError if the assumption is wrong, this would require
            // fixing in here!
            // Is always immutable.
            item = this[OLD_STATE].getIndex(oldIndex);
        }

        // The function understands if item is already a draft
        // and does not proxify item in that case.
        const proxyOrDraft = _PotentialWriteProxy.create(this, item);
        if(_PotentialWriteProxy.isProxy(proxyOrDraft))
            // it's a proxy
            this[_OLD_TO_NEW_SLOT][index][2] = proxyOrDraft;
        // else: It is a draft already and the draft is at this._value[index];
        return proxyOrDraft;
    }

    keyToIndex(key) {
        if(!this._keys.has(key))
            return [null, `KEY ERROR "${key}" not found.`];
        return [this._keys.get(key), null];
    }

    // This method can be handy for the arraySplice method.
    indexOfKey(key) {
        return this._keys.has(key) ? this._keys.get(key) : -1;
    }

    indexToKey(searchIndex) {
        let index = parseInt(searchIndex, 10);
        if(isNaN(index))
            return [null, `KEY ERROR can't parse "${searchIndex}" as integer.`];
        if(index < 0)
            // like Array.prototype.at
            index = index + this._value.length;
        if(index < 0 || index >= this._value.length)
           return [null, `KEY ERROR NOT FOUND index "${searchIndex}" is not an index (= ${index})`
                       + ` (index > 0 && index < ${this._value.length}.`];

        const key = Object.hasOwn(this._value, index)
            ? this._value[index][0]
            : this[_OLD_TO_NEW_SLOT][index][1]
            ;
        return [key, null];
    }

    keyOfIndex(index, defaultReturn=_NOTDEF) {
        const [key, message] = this.indexToKey(index);
        if(key === null) {
            if(defaultReturn !== _NOTDEF)
                return defaultReturn;
            throw new Error(message);
        }
        return key
    }

    getIndex(index, defaultReturn=_NOTDEF) {
        const key = this.keyOfIndex(index, defaultReturn);
        // via get as the single point of reading
        // also important so far to have a single point for the proxy
        // _GET_DRAFT_FOR_OLD_STATE_KEY mechanics, i.e. the result of `get`
        // will be wrapped into the proxy using the `key` argument.
        return this.get(key, defaultReturn);
    }

    ownKeys() {
        return this._keys.keys();
    }

    indexOf(item, fromIndex) {
        // If fromIndex >= array.length, the array is not searched and -1 is returned.
        if(fromIndex >= this._value.length)
            return -1;

        // Negative index counts back from the end of the array —
        // if fromIndex < 0, fromIndex + array.length is used.
        // Note, the array is still searched from front to back in this case.
        if(fromIndex < 0)
            fromIndex = fromIndex + this._value.length;

        // If fromIndex < -array.length or fromIndex is omitted, 0
        // is used, causing the entire array to be searched.
        if(fromIndex === undefined || fromIndex < 0)
            fromIndex = 0;

        const searchArray = fromIndex === 0
            ? this._value
            : this._value.slice(fromIndex)
            ;
        let result = searchArray.findIndex(([, myItem])=>myItem === item);
        if(result !== -1 && fromIndex)
            result = result + fromIndex;
        return result;
    }

    _validateKey(key) {
        // FIXME: In theory a lot more types of keys should be allowed
        // but there's yet no such use case and other types wouldn't
        // survive serialization
        const keyType = typeof key
          , allowedTypes = new Set([typeof '', typeof 0, typeof true])
          ;
        // Technically true, false, null can be acceptable!
        // e.g. all of the JSON/JS basic types that serialize
        // in a unique way. NOTE: null is also a result of
        // JSON.stringify(NaN) (Infinity) but we only allow null
        if((allowedTypes.has(keyType) || key === null) && (keyType !== 'number' || isFinite(key))){
            if(this.constructor.validateKeyFn !== null)
                return this.constructor.validateKeyFn(key);
            return [true, null];
        }
        return [false, `the type of a key must be `
            + `string, a finite number, boolean or null but key "${key}" is ${keyType}`];
    }
    /**
     * As a one stop solution, this cleans this._value and rebuilds
     * all of this._keys. Duplicate keys will be removed.
     * As entries can override existing keys but also existing keys
     * can override entries that are inserted before the existing entries
     * with the same keys, this can be a bit complex.
     * In general, this will keep the keys that end up later in the
     * array after insertion and remove the others.
     * Similar like Object.fromEntries([['a',1], ['a', 2], ['a', 3]])
     * will create: {'a': 3}.
     */
    arraySplice(index, deleteCount, ...entries) {
        if(!this.isDraft)
            // FIXME: for the potential write proxy, it becomes very
            // interesting trying to write many entries.
            // Also interesting for that when trying to write no entries and just removing stuff.
            throw immutableWriteError(new Error(`NOT DRAFT ERROR: ${this} can't call arraySplice when not in draft phase.`));

        const _entries = entries.map((kv, i)=> {
                // Also creates a defensive copy of the k,v pair
                if(!Array.isArray(kv))
                    throw new Error(`VALUE ERROR key-value pair must be an array, entry ${i}: ${kv}`);
                const _kv = Array.from(kv);
                if(!_kv.length >= 2)
                    throw new Error(`TYPE ERROR Key-Value pair must a length `
                        + `of at least 2 [key, value] but entry ${i} ${_kv} length is ${_kv.length}`);
                const [valid, message] = this._validateKey(_kv[0]);
                if(!valid)
                    throw new Error(`TYPE ERROR in entry ${i}: ${message}`);
                return Object.freeze(_kv);
            })
          , deleted = this._value.splice(index, deleteCount, ..._entries.map(
                kvItem=>{
                    const unwrapped = unwrapPotentialWriteProxy(kvItem[1]);
                    if(kvItem[1] !== unwrapped)
                        return [kvItem[0], unwrapped];
                    return kvItem;
                }
            ));
        // Replaces [index, key, proxy] by empty arrays, disconnecting proxies
        this[_OLD_TO_NEW_SLOT].splice(index, deleteCount, ...new Array(entries.length).fill(null).map(()=>[]));
        // We can have duplicate keys in entries and we can have
        // duplicate keys in this._value already.
        const seen = new Set()
          , deletedOnInsert = []
          ;

        for(let i=this._value.length-1; i>=0;i--) {
            let kv = Object.hasOwn(this._value, i)
                ? this._value[i]
                  // Can use this[OLD_STATE].value because this[OLD_STATE]
                  // is immutable.
                : this[OLD_STATE].value[this[_OLD_TO_NEW_SLOT][i][0]]
                ;
            let [key, /*value*/] = kv;
            if(seen.has(key)) {
                // remove duplicate
                deletedOnInsert.push(...this._value.splice(i, 1));
                // also disconnect these proxies
                this[_OLD_TO_NEW_SLOT].splice(i,1);
                continue;
            }
            seen.add(key);
            if(!Object.isFrozen(kv))
                // defensive copy
                this._value[i] = Object.freeze(kv.slice());
        }
        // We iterated backwards, this is a better order.
        deletedOnInsert.reverse();
        deleted.push(...deletedOnInsert);
        this._updateKeys();
        return deleted;
    }

    splice(startKey, deleteCount, ...entries) {
        const [index, message] = this.keyToIndex(startKey);
        if(index === null)
            throw new Error(message);
        return this.arraySplice(index, deleteCount, ...entries);
    }

    // This method will push undefined keys to the end.
    set(key, newEntry) {
        const [index, /*message*/] = this.keyToIndex(key);
        // replace or append
        this.arraySplice(index === null ? Infinity : index, 1, [key, newEntry]);
    }

    delete(key) {
        const [index, /*message*/] = this.keyToIndex(key);
        if(index === null)
            return;
        return this.arraySplice(index, 1)[0];
    }

    // append, add to end
    push(...entries) {
        this.arraySplice(Infinity, 0, ...entries);
        return this.size;
    }
    // add to front
    unshift(...entries) {
        this.arraySplice(0, 0, ...entries);
        return this.size;
    }
    // remove from end
    pop() {
        return this.arraySplice(-1, 1)[0];
    }
    // remove from front
    shift() {
        return this.arraySplice(0, 1)[0];
    }

    /**
     * It's like an "upsert"
     * mapLike.constructor.Model must be a "simple model"
     *       with a set(rawValue) method and without dependenies
     *       required for Model.createPrimalDraft
     * usage:
     *   axisLocations.setSimpleValue(, axisTag, value)
     */
    setSimpleValue(key, value) {
        if(!this.has(key))
            this.set(key, this.constructor.Model.createPrimalDraft());
        this.get(key).set(value);
    }

    [SERIALIZE](options=SERIALIZE_OPTIONS) {
        return _serializeContainer(this, /*keepKeys*/true, options);
    }
}

//
// has all of the dependencies OR one model that can change completely
// dynamically, maybe we can fix dependecies before, in the model, for
// the time being it will be easier, required for layouts anyways.
// but, it will have to dispatch and upate etc. whatever the type requires.
// Because of the fixed initOrder, in _AbstractStruct, it would be hard
// to change dependencies dynamically, but it's also not that bad either
// it's just a passed list of dependencies. We can have the Dynamic wrapper
// (of structs) proxy the API of the value struct...
//
// As a type this is based on _BaseContainerModel as the idea is to
// to wrap _AbstractStructModel, and the _BaseContainerModel type
// is currently used to detect if the element can be traversed.
//
// Maybe better: _AbstractDynamicStructWrappingModel
export class _AbstractDynamicStructModel extends _BaseContainerModel {
    static get BaseType() {
        // NOT IMPLEMENTED Model is not defined in _AbstractDynamicStructModel
        throw new Error(`NOT IMPLEMENTED BaseType is not defined in ${this.name}`);
    }

    static get availableTypesDependencyName() {
        // NOT IMPLEMENTED Model is not defined in _AbstractDynamicStructModel
        throw new Error(`NOT IMPLEMENTED availableTypesDependencyName is not defined in ${this.name}`);
    }

    // FIXME: making this dynamic won't be that easy at all!
    //        as the concrete model will only be added later
    //        but maybe this is just the starting point to implement the
    //        required functionality...
    static get dependencies() {
        return this.dependenciesNames;
    }

    static createClass(className, BaseTypeOrAvailableTypesMapDependencyName /* a Base Model/Type */
                      // To get the actual ModelClass/Constructor from the dependencies.
                    , modelDependencyName
                    ,dependenciesNames) {
        // jshint unused: vars
        // this way name will naturally become class.name.

        let BaseType = null
          , availableTypesDependencyName = null
          , availableTypesDependencyNameInject = []
          ;
        if(typeof BaseTypeOrAvailableTypesMapDependencyName === 'string') {
            availableTypesDependencyNameInject.push(BaseTypeOrAvailableTypesMapDependencyName);
            availableTypesDependencyName = BaseTypeOrAvailableTypesMapDependencyName
        }
        else
            BaseType = BaseTypeOrAvailableTypesMapDependencyName

        const result = {[className]: class extends this {
            // jshint ignore: start
            static BaseType = BaseType;
            static availableTypesDependencyName = availableTypesDependencyName;
            static modelDependencyName = modelDependencyName;
            static dependenciesNames = Object.freeze(new FreezableSet([
                        modelDependencyName
                      , ...availableTypesDependencyNameInject
                      , ...dependenciesNames]));
            // jshint ignore: end
            }};
        // Can't override class.Model anymore, would be possible w/o the freeze.
        Object.freeze(result[className]);
        return result[className];
    }

    constructor(oldState=null, dependencies=null, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS) {
        // Must call first to be able to use with this.constructor.name.
        super(oldState);
        if(oldState === null && dependencies === null)
            throw new Error(`TYPE ERROR either oldState or dependencies are required in ${this.constructor.name}.`);
        if(oldState !== null && dependencies !== null)
            // The problem is that metamorphose may return OLD_STATE but
            // as a constructor that is invoked with the `new` keyword,
            // a new object must be returned.
            throw new Error(`TYPE ERROR can't constuct with both oldState and dependencies`);

        if(oldState && oldState.isDraft)
            throw new Error(`LIFECYCLE ERROR [${this.constructor.name}] `
                    +`oldState ${oldState} is draft but must be immutable.`);
        // Used to call  super(oldState); here.

        Object.defineProperty(this, '_value', {
                // _value is only null in primal state pre-metamorphose
                value: this[OLD_STATE] !== null && this[OLD_STATE].hasWrapped
                        // As a draft for two reasons:
                        // 1) It's quicker and simple, otherwise, this
                        //    would have to implement all of the protential
                        //    write proxy protocol.
                        // 2) It makes sense, this is implemented to be
                        //    be very transparent as a wrapper to its
                        //    contained state. When this is turned into
                        //    a draft, the contained state will be written.
                        //    The one case, where the contained state will
                        //    not be written is when it is replaced
                        //    and in that case, the draft created here
                        //    doesn't go through metamorphosis/checking
                        //    and hence it is not really costly.
                        ? this[OLD_STATE].wrapped.getDraft()
                        : null
             , configurable: true});
        Object.defineProperty(this, 'dependencies', {
            get: ()=>{
                if(this[OLD_STATE] === null)
                    throw new Error('Primal State has no dependencies yet!');
                // In draft-mode, this[OLD_STATE] has the dependencies.
                return this[OLD_STATE].dependencies;
            }
          , configurable: true
        });

        // byProxy.get(proxy)=>key byKey.get(key)=>proxy
        this[_LOCAL_PROXIES] = {byProxy: new Map(), byKey: new Map(), changedBySetter: new Set()};
        // Create an immutable primal state if OLD_STATE is null:
        if(dependencies !== null) {
            if(serializedValue !== null) {
                // I don't want to have this as an direct argument
                // of metamorphose so far, as this way it's made sure
                // that only the Primal State can load the serialized
                // state. If it's not a primary state, change is handled
                // differently.
                this[_PRIMARY_SERIALIZED_VALUE] = [serializedValue, serializeOptions];
            }
            // So, here's a problem,: this won't return a new object
            // if there was an OLD_STATE and there was no change
            // but since this is a constructor it MUST return a new
            // object (when called with `new`).
            if(dependencies !== _DEFERRED_DEPENDENCIES)
                return this.metamorphose(dependencies);
        }
    }

    * #_metamorphoseGen(dependencies={}) {
        const dependenciesData = collectDependencies(
                                          this.constructor.dependencies
                                        , dependencies
                                        , this[OLD_STATE]?.dependencies);
        Object.defineProperty(this, 'dependencies', {
            value: Object.freeze(dependenciesData)
          , writable: true
          , configurable: true
        });

        const dependenciesAreEqual = this[OLD_STATE] !== null
                && objectEntriesAreEqual(this[OLD_STATE].dependencies, this.dependencies);

        // shortcut
        if(dependenciesAreEqual // includes that there's an old state
                && this[OLD_STATE].wrapped === this._value)
            // Has NOT changed!
            return this[OLD_STATE];
        const childDependencies = this.WrappedType
            ? Object.fromEntries(
                iterMap(this.WrappedType.dependencies, (key)=>{
                    if(this.dependencies[key] === undefined)
                        throw new Error(`VALUE ERROR in ${this} WrappedType "${this.WrappedType.name}" dependency "${key}" is undefined.`);
                    return [key, this.dependencies[key]];
                }))
            : {}
            ;
        if(this._value === null // only in primal state creation
                // IMPORTANT: this will throw away all changes made to
                // the child in this ending draft phase, however, the
                // child is invalid and this is the right thing to do.
                //
                // We could raise an error if there are changes on
                // this._value as that would indicate we're throwing away
                // valuable changes.
                //
                // If it is desired to keep information from the child
                // around, it must be done somewhere up in the model
                // hierarchy or somewhere else in the application logic.
                // If we don't replace this here we got to check here and
                // fail and also allow in `set wrapped` to set a yet
                // unapproved type.
                //
                // NOT FULLY TRUE: the changing function can as well first
                // change/metamorphose this into using the new type and
                // then apply changes to the draft of that ...
                // That's why the parent should check if this has the
                // correct wrapped type!
                || this._value.constructor !== this.WrappedType) {
            if(this._value)
                console.warn(`${this} overriding wrapped value from ${this._value} `
                          + `to WrappedType ${this.WrappedType && this.WrappedType.name || this.WrappedType}. `
                          + `Is a draft: ${this._value.isDraft} `);
            Object.defineProperty(this, '_value', {
                value: this.WrappedType
                            ? yield *this.WrappedType.createPrimalStateGen(childDependencies, ...(this[_PRIMARY_SERIALIZED_VALUE] || []))
                            : null
              , configureable: true
            });
        }
        else {
            Object.defineProperty(this, '_value', {
                value: this._value.isDraft
                    ? yield *this._value.metamorphoseGen(childDependencies)
                    : (!objectEntriesAreEqual(childDependencies, this._value.dependencies)
                                ? yield *this._value.getDraft().metamorphoseGen(childDependencies)
                                : this._value
                      )
              , configureable: true
            });
        }
        // Don't keep this
        delete this[_PRIMARY_SERIALIZED_VALUE];
        if(dependenciesAreEqual && this[OLD_STATE].wrapped === this._value)
            return this[OLD_STATE];
        return this;
    }

    #_lockAndFreeze() {
        Object.defineProperty(this, 'dependencies', {
            value: Object.freeze(this.dependencies)
          , writable: false
          , configurable: false
        });
        delete this[OLD_STATE];
        Object.defineProperty(this, '_value', {
            value: this._value
          , writable: false
          , configurable: false
        });
        Object.defineProperty(this, _IS_DRAFT_MARKER, {value: false, configurable: false});
        delete this[_LOCAL_PROXIES];
        Object.freeze(this);
    }
    #_metamorphoseCleanUp() {
        // Let's see if this is sufficient! this._value may be metamorphosed
        // after all and also this.WrappedType could change this._value.
        // I'm not sure if this will work out all the time.
        delete this.dependencies;
    }
    // FIXME: feels like this must funnel dependencies into
    // the this._value draft
    // and in a way, this will become a lot like a struct
    // but with **DYNAMIC** dependencies
    // we can make sure maybe, that there's a fixed set of external
    // dependencies, and we always consume these in here, so they will
    // be available ... Especially on primalState creation
    // I mean, so far that is availableFonts and availableLayouts, the
    // latter one is not so interesting for the use case...
    // OR, we have the app inject the actual layout state as a dependency
    // kind of moving the problem out of scope (not too happy with that
    // would be cool one level deeper in the ApplicationModel struct.)
    * metamorphoseGen(dependencies={}) {
        if(!this.isDraft)
            throw new Error(`LIFECYCLE ERROR ${this} must be in draft mode to metamorphose.`);
        let result;
        try {
            result = yield * this.#_metamorphoseGen(dependencies);
        }
        finally {
            if(result === this) {
                // This metamorphosed into a new state!
                this.#_lockAndFreeze();
            }
            else {
                // on error or if(result === this[OLD_STATE]) {
                // reset metamorphose residues so that this draft could
                // be metamorphosed again (it happens, see the commit).
                this.#_metamorphoseCleanUp();
            }
        }
        return result;
    }

    // Only when this is a primal state
    get hasWrapped() {
        return this._value !== null;
    }

    get wrapped() {
        if(this._value === null)
            throw new Error(`LIFECYCLE ERROR ${this} has no value element, it's probably primal state.`);
        return this._value;
    }

    get WrappedType() {
        if(this.dependencies[this.constructor.modelDependencyName] === ForeignKey.NULL)
            return null;
        // FIXME: 'typeClass' is an implementation detail of the linked
        // struct. There should be either a way to configure this or a
        // way to ensure the linked model implements that interface,
        // like e.g. a trait/mixin that can be checked.
        return this.dependencies[this.constructor.modelDependencyName].get('typeClass').value;
    }


    get availableTypes() {
        return this.dependencies[this.constructor.availableTypesDependencyName];
    }

    set wrapped(state) {
        if(!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(new Error(`IMMUTABLE WRITE ATTEMPT `
                + `${this} is immutable, not a draft, can't set value.`));

        // This is a paradigm shift! The type must be however be in the
        // availableTypes
        if(this.constructor.availableTypesDependencyName !== null) {
            let found = false
              , typeNames = []
              ;
            for(const [/*key*/, item] of this.availableTypes) {
                const typeClass = item.get('typeClass').value;
                typeNames.push(typeClass.name);
                if(typeClass === state.constructor) {
                    found = true;
                    break;
                }
            }
            if(!found)
                throw new Error(`TYPE ERROR ${this} expects an instance of `
                    + `"${typeNames.join(', ')}" but state item is "${state}".`);
        }
        if(this.constructor.BaseType !== null && !(state instanceof this.constructor.BaseType))
            throw new Error(`TYPE ERROR ${this} expects an instance of `
                + `"${this.constructor.BaseType.name}" but state item is "${state}".`);

        // Actually, we know the concrete type that is injected with
        // the dependencies so it is required to always use that type!
        if(state.constructor !== this.WrappedType && this.WrappedType !== null)
            throw new Error(`TYPE ERROR ${this} expects a direct instance of `
                + `"${this.WrappedType && this.WrappedType.name || this.WrappedType}" but state item is "${state}".`);

        // Could set immutable state as well, but it may also collide
        // with user expectations. There are two alternatives:
        // - implement potential write proxy protocol, also see
        //   the constructor comment.
        // - have the user put state into draft mode explicitly before,
        //   calling this, otherwise fail on write.
        const draft = state.isDraft ? state : state.toDraft();
        Object.defineProperty(this, '_value', {
              value: draft
            , configureable: true
        });
    }

    // This proxies the complete public _AbstractStructModel API
    // As such, when this becomes a draft, wrapped should become a draft
    // as well ... !
    // However, the wrapped item, ideally never becomes proxified, as
    // this acts in place of it!

    /**
     * hasDraftFor and getDraftFor are likely only a required interfaces
     * for _BaseContainerModel.
     */
    [_HAS_DRAFT_FOR_PROXY](proxy) {
        if(!this.isDraft)
            return false;

        if(!this[_LOCAL_PROXIES].byProxy.has(proxy))
            // the proxy is disconnected
            return false;

        const key = this[_LOCAL_PROXIES].byProxy.get(proxy)
            // MAY NOT BE A DRAFT AT THIS MOMENT!
          , item = this.get(key)
          ;
        if(!item || !item.isDraft)
            return false;

        // Identified via this[_LOCAL_PROXIES].
        return true;
    }

    [_HAS_DRAFT_FOR_OLD_STATE_KEY](key) {
        if(!this.isDraft)
            return false;
        // this implies that if this is a draft all items in
        // this._value must be drafts as well! But do we know?
        // It's not important: if the value was created externally
        // or set as an immutable from external, this won't return the
        // value anyways!

        if(!this.has(key))
            return false;

        if(this[_LOCAL_PROXIES].changedBySetter.has(key))
            // disconnected from original OLD_STATE key releation
            return false;

        // MAY NOT BE A DRAFT AT THIS MOMENT!
        const item = this.get(key);
        if(!item || !item.isDraft)
            return false;
        return true;
    }

    // called from the perspective of a proxy that was created when this
    // was still an immutable.
    [_GET_DRAFT_FOR_OLD_STATE_KEY](key) {
        if(!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(new Error(`IMMUTABLE WRITE ATTEMPT `
                +`${this}[_GET_DRAFT_FOR_OLD_STATE_KEY](${key}) is immutable, not a draft.`));

        if(!this.hasOwn(key))
            throw new Error(`KEY ERROR "${key}" not found in ${this}.`);

        if(this[OLD_STATE] === null)
            // I suppose this should never happen, this[OLD_STATE] must
            // not be null in this method.
            // When creating a primary state, we should not create proxies
            // for delayed drafts at all, so that can circumvent this.
            throw new Error(`ASSERTION FAILED this[OLD_STATE] should exist in this method.`);

        if(this[_LOCAL_PROXIES].changedBySetter.has(key))
            // disconnected _GET_DRAFT_FOR_OLD_STATE_KEY relates only to drafts
            // created directly for [OLD_STATE] entries.
            return false;

        const item = this.has(key)
            ? this.get(key) // => assert item.isDraft
              // expect OLD_STATE to exist!
            : this[OLD_STATE].get(key) // item is not a draft
            ;

        if(item.isDraft)
            // Since it was not changedBySetter this must be the original
            // draft for the item at OLD_STATE
            return item;
        const draft = unwrapPotentialWriteProxy(item).getDraft();
        this.set(key, draft);
        return draft;
    }
    /**
     * Raises KeyError if key is not available.
     * Raises ImmutableWriteError if this is not a draft.
     *      => but the proxy is only available if this is a draft
     *         so if(!this.isDraft) should fail differently!
     * Returns False, if draft is not natively created by this function
     * i.e. set from the outside.
     * Returns a draft for key otherwise.
     * this is likely only for _BaseContainerModel
     */
    [_GET_DRAFT_FOR_PROXY](proxy) {
        // TODO: check if key exists! Else KEY ERROR ${key}
        if(!this.isDraft)
            throw immutableWriteError(new Error(`IMMUTABLE WRITE ATTEMPT `
                +`${this} is immutable, not a draft in [_GET_DRAFT_FOR_PROXY].`));

        if(!this[_LOCAL_PROXIES].byProxy.has(proxy))
            // proxy is disconnected
            return false;

        const key = this[_LOCAL_PROXIES].byProxy.get(proxy)
          , item = this.has(key)
                        ? this.get(key)
                        : this[OLD_STATE].get(key)
          ;

        // MAY NOT BE A DRAFT AT THIS MOMENT! => via set(key, immutable)...
        // in that case were going to replace the item in this._value with
        // its draft.
        if(item.isDraft)
            // We own the proxy, so the draft is from here.
            return item;
        const draft = unwrapPotentialWriteProxy(item).getDraft();
        this.set(key, draft);
        return draft;
    }

    *[Symbol.iterator]() {
        if(!this.hasWrapped)
            return;
        yield *this.wrapped.entries();
    }
    getDraftFor(key, defaultReturn=_NOTDEF) {
        return this.wrapped.getDraftFor(key, defaultReturn);
    }
    get(key, defaultReturn=_NOTDEF) {
        return this.wrapped.get(key, defaultReturn);
    }
    set(key, entry) {
        return this.wrapped.set(key, entry);
    }

    hasOwn(key) {
        return this.wrapped.hasOwn(key);
    }
    ownKeys() {
        return this.wrapped.ownKeys();
    }
    // override if ownership and available keys differ
    has(key) {
        return this.wrapped.has(key);
    }
    // override if ownership and available keys differ
    keys() {
        return this.wrapped.keys();
    }

    *entries() {
        if(!this.hasWrapped)
            return;
        yield* this.wrapped.entries();
    }

    *allEntries() {
        if(!this.hasWrapped)
            return;
        yield* this.wrapped.allEntries();
    }

    get size() {
        return this.wrapped.size;
    }

    [SERIALIZE](options=SERIALIZE_OPTIONS) {
       if(this.hasWrapped)
            return serializeItem(this.wrapped, options);
        else
            // FIXME: how to differentiate between no type an an empty/all default type?
            // I guess the parent has to know!
            return [[], null];
    }
}

/**
 * Rather a placeholder, to have quick type classes.
 * This is also a leaf in the model tree, the end of the path,
 * not another container type. Like a file, unlike a folder.
 *
 * Caution: this is used as a base for KeyValueModel and there are expectations
 * that must not be broken, regarding the lifecycleAPI.
 *
 * This or a very similar version of this with extension hooks for coherence
 * and validation could nicely be used to define types more narrowly. However
 * in the case of KeyValueModel most of that is done externally and for many
 * types the external validation will be most important.
 */
export  class _AbstractGenericModel extends _BaseSimpleModel {
    static createClass(className, setup={}) {
        setup = {sanitizeFN:_NOTDEF, validateFN:_NOTDEF, defaultValue:_NOTDEF
                , serializeFN:_NOTDEF, deserializeFN: _NOTDEF, ...setup};
        for(const fnName of ['sanitizeFN', 'validateFN', 'serializeFN']) {
            if(setup[fnName] !== _NOTDEF && typeof setup[fnName] !== 'function')
                throw new Error(`TYPE ERROR ${fnName}, if specified, must be a function but is ${typeof setup[fnName]} (${setup[fnName]}).`);
        }
        if(setup.validateFN !== _NOTDEF && setup.defaultValue !== _NOTDEF) {
            const [valid, message] = setup.validateFN(setup.defaultValue);
            if(!valid || message)
                throw new Error(`TYPE ERROR defaultValue does not validate: ${message}`);
        }
        // this way name will naturally become class.name.
        const result = {[className]: class extends this {
            // jshint ignore: start
            static sanitizeFN = setup.sanitizeFN === _NOTDEF ? null : setup.sanitizeFN;
            static validateFN = setup.validateFN === _NOTDEF ? null : setup.validateFN;
            static defaultValue = setup.defaultValue === _NOTDEF ? undefined : setup.defaultValue;
            static serializeFN = setup.serializeFN === _NOTDEF ? null : setup.serializeFN;
            static deserializeFN = setup.deserializeFN === _NOTDEF ? null : setup.deserializeFN;
            // jshint ignore: end
        }};
        Object.freeze(result[className]);
        return result[className];
    }

    constructor(oldState=null, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS) {
        super(oldState);

        // A primal state will have a value of defaultValue or undefined.
        Object.defineProperty(this, '_value', {
            value: this[OLD_STATE] === null
                ? this.constructor.defaultValue
                : this[OLD_STATE].value
          , configurable: true
          , writable: true
        });

        if(this[OLD_STATE] === null) { // a primal state
            if(serializedValue !== null)
                this[_PRIMARY_SERIALIZED_VALUE] = [serializedValue, serializeOptions];
            return this.metamorphose();
        }
    }

    static sanitize(rawValue) {
        if(this.sanitizeFN === null)
            return [rawValue, null];
        return this.sanitizeFN(rawValue);
    }

    static validate(value) {
        if(this.validateFN === null)
            return [true, null]; // valid
        return this.validateFN(value);
    }

    /* eslint-disable require-yield */
    * metamorphoseGen() {
        if(!this.isDraft)
            throw new Error(`LIFECYCLE ERROR ${this} must be in draft mode to metamorphose.`);
        // compare
        if(this[OLD_STATE] && this[OLD_STATE].value === this._value)
            // Has NOT changed!
            return this[OLD_STATE];

        // Has changed!
        delete this[OLD_STATE];

        if(this[_PRIMARY_SERIALIZED_VALUE])
            this[DESERIALIZE](...this[_PRIMARY_SERIALIZED_VALUE]);
        // Don't keep this
        delete this[_PRIMARY_SERIALIZED_VALUE];

        Object.defineProperty(this, '_value', {
            // Not freezing/changing this._value as it is considered "outside"
            // of the metamodel realm i.e. it's not a _BaseModel or part of
            // it, it can be any javascript value. Freezing it would have
            // undesirable side effects, e.g. breaking other libraries, and
            // almost no meaning for object immutability, unless some sort
            // of deepFreeze is performed.
            value: this._value
          , writable: false
          , configurable: false
        });
        Object.defineProperty(this, _IS_DRAFT_MARKER, {value: false, configurable: false});
        // Is this applied by the parent? I expect yes.
        Object.freeze(this);
        return this;
    }
    /* eslint-enable require-yield */

    get value() {
        return this._value;
    }

    set value(value) {
        this.set(value);
    }

    set(rawValue, sanitize=_NOTDEF) {
        if(!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(new Error(`IMMUTABLE WRITE ATTEMPT `
                +`${this} is immutable, not a draft, can't set value.`));
        let value = rawValue;

        if(sanitize !== _NOTDEF && sanitize || sanitize === _NOTDEF && this.constructor.sanitizeFN !== null) {
            const [cleanValue, sanitizeMessage] = this.constructor.sanitize(rawValue);
            if(cleanValue === null)
                throw new Error(`SANITIZATION ERROR ${this}: ${sanitizeMessage}.`);
            value = cleanValue;
        }
        const [valid, validateMessage] = this.constructor.validate(value);
        if(!valid)
            throw new Error(`VALIDATION ERROR ${this}: ${validateMessage}. (Maybe try setting sanitize to true.)`);
        this._value = value;
    }

    get() {
        return this.value;
    }
    [SERIALIZE](options=SERIALIZE_OPTIONS) {
        if(this.constructor.serializeFN !== null)
            return [[], this.constructor.serializeFN(this.value, options)];
        return super[SERIALIZE](options);
    }
    [DESERIALIZE](serializedValue, options=SERIALIZE_OPTIONS) {
        if(this.constructor.deserializeFN !== null) {
            this.value = this.constructor.deserializeFN(serializedValue, options);
            return [];
        }
        return super[DESERIALIZE](serializedValue, options);
    }
}


export class _AbstractEnumModel extends _BaseSimpleModel {
    static createClass(className, enumItems, defaultValue, attachStaticProperties) {
        const enumItemsSet = new Set(enumItems);
        if(!enumItemsSet.size)
            throw new Error(`VALUE ERROR ${this.name} enumItems is empty.`);
        if(enumItemsSet.size !== enumItems.length)
            throw new Error(`VALUE ERROR ${this.name} enumItems must not have duplicates ${enumItems.join(', ')}.`);
        if(!enumItemsSet.has(defaultValue))
             throw new Error(`VALUE ERROR ${this.name} defaultValue "${defaultValue}" must be in enumItems (${enumItems.join(', ')} but is not.`);
        // this way name will naturally become class.name.
        const result = {[className]: class extends this {
            // jshint ignore: start
            static enumItems = Object.freeze(Array.from(enumItems));
            static _enumItemsReverseMap = Object.freeze(new FreezableMap(enumItems.map((value, i)=>[value, i])))
            static defaultValue = defaultValue;
            // jshint ignore: end
        }};
        // TODO: This is a nice way to extend the class statics while
        // still being able to Object.freeze the class. It cold be a
        // general API for all _BaseModels but I'm not implementing it
        // everywhere right now as I still consider it experimental.

        if(attachStaticProperties) {
            for(const [name, definition] of Object.entries(attachStaticProperties)) {
                if(Object.hasOwn(result[className], name))
                    // Tested this case with:
                    //      attachStaticProperties = {defaultValue: {value: 'testing'}}
                    // and it triggered the Error.
                    throw new Error(`VALUE ERROR can't attachs static property "${name}," it's already defined.`);
                Object.defineProperty(result[className], name, definition);
            }
        }
        Object.freeze(result[className]);
        return result[className];
    }

    constructor(oldState=null, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS) {
        super(oldState);

        // A primal state will have a value of or defaultValue or undefined.
        Object.defineProperty(this, '_value', {
            value: this[OLD_STATE] === null
                ? this.constructor.defaultValue
                : this[OLD_STATE].value
          , configurable: true
          , writable: true
        });

        if(this[OLD_STATE] === null) { // a primal state
            if(serializedValue !== null)
                this[_PRIMARY_SERIALIZED_VALUE] = [serializedValue, serializeOptions];
            return this.metamorphose();
        }
    }

    /* eslint-disable require-yield */
    * metamorphoseGen() {
        if(!this.isDraft)
            throw new Error(`LIFECYCLE ERROR ${this} must be in draft mode to metamorphose.`);
        // compare
        if(this[OLD_STATE] && this[OLD_STATE].value === this._value)
            // Has NOT changed!
            return this[OLD_STATE];

        // Has changed!
        delete this[OLD_STATE];
        if(this[_PRIMARY_SERIALIZED_VALUE])
            this[DESERIALIZE](...this[_PRIMARY_SERIALIZED_VALUE]);
        // Don't keep this
        delete this[_PRIMARY_SERIALIZED_VALUE];
        Object.defineProperty(this, '_value', {
            // Not freezing/changing this._value as it is considered "outside"
            // of the metamodel realm i.e. it's not a _BaseModel or part of
            // it, it can be any javascript value. Freezing it would have
            // undesirable side effects, e.g. breaking other libraries, and
            // almost no meaning for object immutability, unless some sort
            // of deepFreeze is performed.
            value: this._value
          , writable: false
          , configurable: false
        });
        Object.defineProperty(this, _IS_DRAFT_MARKER, {value: false, configurable: false});
        // Is this applied by the parent? I expect yes.
        Object.freeze(this);
        return this;
    }
    /* eslint-enable require-yield */

    get value() {
        return this._value;
    }

    set value(value) {
        this.set(value);
    }

    set(value) {
        if(!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(new Error(`IMMUTABLE WRITE ATTEMPT `
                +`${this} is immutable, not a draft, can't set value.`));

        if(!this.constructor._enumItemsReverseMap.has(value))
            throw new Error(`VALIDATION ERROR ${this}: "${value}" is not a valid member value.`);
        this._value = value;
    }

    get() {
        return this.value;
    }

    [SERIALIZE](/*options=SERIALIZE_OPTIONS*/) {
        return [[], `${this.value}`];
    }
    [DESERIALIZE](serializedValue/*, options=SERIALIZE_OPTIONS*/) {
        this.value = serializedValue;
        return [];
    }
}

export class _AbstractSimpleOrEmptyModel extends _BaseSimpleModel {
    // jshint ignore: start
    static _EMPTY = Symbol('_EMPTY');
    // jshint ignore: end
    static get Model() {
        // NOT IMPLEMENTED Model is not defined in _AbstractSimpleOrEmptyModel
        throw new Error(`NOT IMPLEMENTED Model is not defined in ${this.name}`);
    }

    static createClass(Model, className=null) {
        // If we are using a naming convention, I expect 'Model' at the
        // end so createClass(NumberModel) => NumbeOrEmptyModel

        if(!(Model.prototype instanceof _BaseSimpleModel))
            throw new Error(`TYPE ERROR Model (${Model.name}) is not a subclass of _BaseSimpleModel`);

        if(className === null)
            className = `${Model.name.slice(0, Model.name.indexOf('Model'))}OrEmptyModel`;
        // jshint unused: vars
        // this way name will naturally become class.name.
        const result = {[className]: class extends this {
            // jshint ignore: start
            static Model = Model;
            // jshint ignore: end
        }};
        // Can't override class.Model anymore, would be possible w/o the freeze.
        Object.freeze(result[className]);
        return result[className];
    }

    constructor(oldState=null, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS) {
        super(oldState);
        // A primal state will have a value of _EMPTY.
        Object.defineProperty(this, '_value', {
            value: this[OLD_STATE] === null
                ? this.constructor._EMPTY
                : this[OLD_STATE].rawValue
          , configurable: true
          , writable: true
        });

        if(this[OLD_STATE] === null) { // a primal state
            if(serializedValue !== null)
                this[_PRIMARY_SERIALIZED_VALUE] = [serializedValue, serializeOptions];
            return this.metamorphose();
        }
    }

    /* eslint-disable require-yield */
    * metamorphoseGen() {
        if(!this.isDraft)
            throw new Error(`LIFECYCLE ERROR ${this} must be in draft mode to metamorphose.`);
        // compare
        if(this[OLD_STATE]) {
            if(this[OLD_STATE].isEmpty && this.isEmpty)
                // Has NOT changed!
                return this[OLD_STATE];
            // FIXME: I'm not sure if unwrapPotentialWriteProxy is actually
            // required here, but it seems, if this was called via a proxy
            // in here, this._value could return a proxy as well, as _value)
            // references a _BaseModel
            else if(!this[OLD_STATE].isEmpty && this[OLD_STATE].value === unwrapPotentialWriteProxy(this._value))
                // Has NOT changed!
                return this[OLD_STATE];
        }

        if(this[_PRIMARY_SERIALIZED_VALUE])
            this[DESERIALIZE](...this[_PRIMARY_SERIALIZED_VALUE]);
        // Don't keep this
        delete this[_PRIMARY_SERIALIZED_VALUE];

        // Has changed?
        if(this._value === this.constructor._EMPTY) {
            // PASS
        }
        else if(this._value instanceof this.constructor.Model) {
            const immutable = this._value.isDraft
                    ? this._value.metamorphose()
                    : this._value
              ;
            this._value = unwrapPotentialWriteProxy(immutable);
        }
        else
            throw new Error(`TYPE ERROR ${this.constructor.name} `
                + `expects ${this.constructor.Model.name} as value`
                + `wrong type: ("${this._value}" typeof ${typeof this._value}).`
            );
        // After maybe metamorphosing this._value, just check again.
        if(this[OLD_STATE] && !this[OLD_STATE].isEmpty && this[OLD_STATE].value === this._value)
            // Has NOT changed after all!
            return this[OLD_STATE];

        // has changed
        delete this[OLD_STATE];
        Object.defineProperty(this, '_value', {
            value: this._value
          , writable: false
          , configurable: false
        });
        Object.defineProperty(this, _IS_DRAFT_MARKER, {value: false, configurable: false});
        // Is this applied by the parent? I expect yes.
        Object.freeze(this);
        return this;
    }
    /* eslint-ensable require-yield */

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
        if(!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(new Error(`IMMUTABLE WRITE ATTEMPT `
                +`${this} is immutable, not a draft, can't set value.`));
        if(value === this.constructor._EMPTY) {
            this._value = this.constructor._EMPTY;
            return;
        }
        if(this.isEmpty)
            this._value = this.constructor.Model.createPrimalState();
        if(!this._value.isDraft)
            this._value = this._value.getDraft();
        this._value.value = value;
    }

    get(defaultVal=_NOTDEF) {
        // if(!this.isDraft)
        //    throw new Error(`LIFECYCLE ERROR ${this} will only return this.value when immutable/not a draft..`);
        // This will acturally return this._value.value despite of not beeing
        // immutable. this._value.value is never made immutable so it can always
        // be manipulated anyways.
        if(this._value === this.constructor._EMPTY) {
            if(defaultVal !== _NOTDEF)
                return defaultVal;
            throw new Error(`VALUE ERROR ${this.constructor.name} is EMPTY, use `
                + `that.isEmpty to check instead of trying to read that.value or use `
                + `that.get(defaultVal) to receive the default when value is empty`);
        }
        // unwrap
        return this._value.value;
    }
    [SERIALIZE](options=SERIALIZE_OPTIONS) {
        if(this.isEmpty)
            return [[], null];
        return serializeItem(this._value, options);
    }
    [DESERIALIZE](serializedValue, options=SERIALIZE_OPTIONS) {
        if(serializedValue === null)
            // serializedValue should not be null, as the parent wouldn't
            // call this directly. I'm not sure for all cases though.
            return;
        this._value = this.constructor.Model.createPrimalDraft(this.dependencies, serializedValue, options);
    }
}


export  class _AbstractNumberModel extends _BaseSimpleModel {
    static createClass(className, setup={}) {
        // numeric or _NOTDEF
        setup = {min:_NOTDEF, max:_NOTDEF, toFixedDigits:_NOTDEF, defaultValue:_NOTDEF, sanitzeByDefault:true, ...setup};
        for(const name of ['min', 'max', 'toFixedDigits', 'defaultValue']) {
            const setupValue = setup[name];
            if(setupValue === _NOTDEF)
                continue;
            const [isNumeric, message] = this.isNumeric(setupValue);
            if(!isNumeric)
                throw new Error(`${this}.createClass ${className} setup value "${name}" is not numeric: ${message}`);
        }
        // numeric or _NOTDEF
        if(setup.toFixedDigits !== _NOTDEF) {
            if(!Number.isSafeInteger(setup.toFixedDigits)
                    || setup.toFixedDigits < 0
                    || setup.toFixedDigits > 100)
                throw new Error(`${this}.createClass ${className} setup value `
                    + `"toFixedDigits" is not an integer between 0 and 100 (inclusive): ${setup.toFixedDigits}`);

            for(const name of ['min', 'max', 'defaultValue']) {
                const setupValue = setup[name];
                if(setupValue === _NOTDEF)
                    continue;
                const fixedVal = parseFloat(setupValue.toFixed(setup.toFixedDigits));
                if(fixedVal !== setupValue)
                    throw new Error(`${this}.createClass ${className} setup value "${name}" `
                        + `(setupValue) is not stable in toFixed(${setup.toFixedDigits}) conversion: `
                        + `"${setupValue.toFixed(setup.toFixedDigits)}" ${fixedVal}`);
            }
        }
        if(setup.defaultValue !== _NOTDEF) {
            // TODO: could be an inclusive min and an exclusive min, default is now inclusive
            const fixedDefault = setup.toFixedDigits !== _NOTDEF
                    ? parseFloat(setup.defaultValue.toFixed(setup.toFixedDigits))
                    : setup.defaultValue
                    ;
            if(setup.min !== _NOTDEF && fixedDefault < setup.min)
                throw new Error(`${this}.createClass ${className} setup `
                    +`value "defaultValue" (${setup.defaultValue} as fixed ${fixedDefault}) `
                    + `is smaller than setup value "min" (${setup.min}).`);
            if(setup.max !== _NOTDEF && fixedDefault > setup.max)
                throw new Error(`${this}.createClass ${className} setup `
                    +`value "defaultValue" (${setup.defaultValue} as fixed ${fixedDefault}) `
                    + `is bigger than setup value "max" (${setup.max}).`);
            setup.defaultValue = fixedDefault;
        }
        setup.sanitzeByDefault = setup.sanitzeByDefault ? true : false;
        // this way name will naturally become class.name.
        const result = {[className]: class extends this {
            // jshint ignore: start
            static minVal = setup.min === _NOTDEF ? null : setup.min;
            static maxVal = setup.max === _NOTDEF ? null : setup.max;
            static toFixedDigits = setup.toFixedDigits === _NOTDEF ? null : setup.toFixedDigits;
            static defaultValue = setup.defaultValue === _NOTDEF ? null : setup.defaultValue;
            static sanitzeByDefault = setup.sanitzeByDefault;
            // jshint ignore: end
        }};
        Object.freeze(result[className]);
        return result[className];
    }

    // Must be typeof number and not NaN
    // can be +/-Infinity
    static isNumeric(rawValue) {
        if(typeof rawValue !== 'number')
            return [false, `is not typeof number "${typeof rawValue}" raw value: "${rawValue.toString()}"`];
        if(Number.isNaN(rawValue))
            return [false, `raw value is NaN (not a number)`];
        return [true, null];
    }

    static sanitize(rawValue) {
        const [isNumeric, isNumericMessage] = this.isNumeric(rawValue);
        if(!isNumeric)
            return [null, isNumericMessage];

        let cleanValue = rawValue;
        if(this.minVal !== null && cleanValue < this.minVal)
            cleanValue = this.minVal;

        if(this.maxVal !== null && cleanValue > this.maxVal)
            cleanValue = this.maxVal;

        if(this.toFixedDigits !== null)
           // If min/max are at the wrong values, toFixed may move
           // cleanValue out of the min or max range, because it
           // is rounding. We'll catch that in validation though.
           cleanValue = parseFloat(cleanValue.toFixed(this.toFixedDigits));

        return [cleanValue, null];
    }

    static validate(value) {
        const [isNumeric, isNumericMessage] = this.isNumeric(value);
        if(!isNumeric)
            return [false, isNumericMessage];

        if(this.minVal !== null && value < this.minVal)
            return [false, `value (${value}) is smaller than min value (${this.minVal})`];

        if(this.maxVal !== null && value > this.maxVal)
            return [null, `value (${value}) is bigger than max value (${this.maxVal})`];

        if(this.toFixedDigits !== null && parseFloat(value.toFixed(this.toFixedDigits)) !== value){
            // Expecting toFixed operating in a range that has no issues with floating point precision.
            // However, toFixed has it's edge cases and so it may fail our expectations.
            return [null, `value (${value}) is not equal to fixed-point notation `
                + `"${value.toFixed(this.toFixedDigits)} `
                + `(toFixedDigits: ${this.toFixedDigits})"`];
        }
        return [true, null]; // valid
    }

    static get ppsDefaultSettings() {
        const entries = [];
        for(const [here, there] of [
                                ['maxVal', 'max']
                              , ['minVal', 'min']
                              , ['defaultValue', 'default']
                              // , ['???', 'step']
                            ]
        ) {
            if(this[here] !== null)
                entries.push([there, this[here]]);
        }
        return Object.fromEntries(entries);
    }

    constructor(oldState=null, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS) {
        super(oldState);

        // A primal state will have a value of defaultValue or undefined.
        Object.defineProperty(this, '_value', {
            value: this[OLD_STATE] === null
                ? this.constructor.defaultValue !== null ? this.constructor.defaultValue : undefined
                : this[OLD_STATE].value
          , configurable: true
          , writable: true
        });

        if(this[OLD_STATE] === null) { // a primal state
            if(serializedValue !== null)
                this[_PRIMARY_SERIALIZED_VALUE] = [serializedValue, serializeOptions];
            return this.metamorphose();
        }
    }

    /* eslint-disable require-yield */
    * metamorphoseGen() {
        if(!this.isDraft)
            throw new Error(`LIFECYCLE ERROR ${this} must be in draft mode to metamorphose.`);
        // compare
        if(this[OLD_STATE] && this[OLD_STATE].value === this._value)
            // Has NOT changed!
            return this[OLD_STATE];

        // Has changed!
        delete this[OLD_STATE];
        if(this[_PRIMARY_SERIALIZED_VALUE])
            this[DESERIALIZE](...this[_PRIMARY_SERIALIZED_VALUE]);
        // Don't keep this
        delete this[_PRIMARY_SERIALIZED_VALUE];
        Object.defineProperty(this, '_value', {
            // Not freezing/changing this._value as it is considered "outside"
            // of the metamodel realm i.e. it's not a _BaseModel or part of
            // it, it can be any javascript value. Freezing it would have
            // undesirable side effects, e.g. breaking other libraries, and
            // almost no meaning for object immutability, unless some sort
            // of deepFreeze is performed.
            value: this._value
          , writable: false
          , configurable: false
        });
        Object.defineProperty(this, _IS_DRAFT_MARKER, {value: false, configurable: false});
        // Is this applied by the parent? I expect yes.
        Object.freeze(this);
        return this;
    }
    /* eslint-enable require-yield */

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

    set(rawValue, sanitize=_NOTDEF) {
        if(!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(new Error(`IMMUTABLE WRITE ATTEMPT `
                +`${this} is immutable, not a draft, can't set value.`));
        let value = rawValue;
        if(sanitize !== _NOTDEF && sanitize || sanitize === _NOTDEF && this.constructor.sanitzeByDefault) {
            const [cleanValue, sanitizeMessage] = this.constructor.sanitize(rawValue);
            if(cleanValue === null)
                throw new Error(`SANITIZATION ERROR ${this}: ${sanitizeMessage}.`);
            value = cleanValue;
        }
        const [valid, validateMessage] = this.constructor.validate(value);
        if(!valid)
            throw new Error(`VALIDATION ERROR ${this}: ${validateMessage}. (Maybe try setting sanitize to true.)`);
        this._value = value;
    }

    get() {
        return this.value;
    }
    [SERIALIZE](/*options=SERIALIZE_OPTIONS*/) {
        return [
            []
          , this.constructor.toFixedDigits !== null
                ? this.value.toFixed(this.constructor.toFixedDigits)
                : this.value.toString()
        ];
    }
    [DESERIALIZE](serializedValue /*, options=SERIALIZE_OPTIONS*/) {
        this.value = parseFloat(serializedValue);
        return [];
    }
}


// some basics
export const AnyModel = _AbstractGenericModel.createClass('AnyModel')
  , IntegerModel = _AbstractNumberModel.createClass('IntegerModel', {defaultValue: 0, min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER, toFixedDigits: 0})
    // Beautiful
    // FIXME: defaultValue can't be undefined right now, as many
    // CoherenceFunction expect an inital value of undefined right now.
    // I consider this a bad pattern but until it's fixed in the CoherenceFunctions
    // it can't be changed here. E.g. search for: duration.value === undefined
  , NumberModel =  _AbstractNumberModel.createClass('NumberModel', {/*defaultValue: 0*/})
    // Default is false.
  , BooleanModel = _AbstractGenericModel.createClass('BooleanModel', {
        sanitizeFN: function(rawValue) {
            return [!!rawValue, null];
        }
      , validateFN: function(value) {
            if(typeof value !== 'boolean')
                return [false, `value is not typeof boolean: ${typeof value} (${value})`];
            return [true, null];
        }
      , defaultValue: false
      , serializeFN: function(value /*, options=SERIALIZE_OPTIONS*/) {
            return value ? '1' : '0';
        }
      , deserializeFN: function(serializedString/*, options=SERIALIZE_OPTIONS*/) {
            const falseSet = new Set(['', '0', 'false', 'False', 'FALSE'])
            return !falseSet.has(serializedString);
        }
    })
  ;
/**
 * This seems a good way to extend a model in order to change its
 * defaultValue and nothing else. This way:
 *
 * const a = BooleanModelDefaultTrue.createPrimalState();
 * >> a.value === true
 *     true
 * >> a instanceof BooleanModel
 *     true
 * >> const a2d = a.getDraft();
 * >> a2d.set('abc', false)
 *    raises: VALIDATION ERROR [model BooleanDefaultTrueModel]: value
 *    is not typeof boolean: string (abc). (Maybe try setting sanitize to true.)
 *
 * The static BooleanModel.sanitizeFN and BooleanModel.validateFN will be
 * accessible in the instance of BooleanDefaultTrueModel
 * via  this.constructor.sanitizeFN and this.constructor.validateFN
 * so this just works, because:
 *
 * >> a.constructor
 *     class BooleanDefaultTrueModel {}
 * >> Object.getOwnPropertyNames(a.constructor)
 *     Array(4) [ "prototype", "defaultValue", "length", "name" ]
 * >> Object.getPrototypeOf(a.constructor)
 *     class BooleanModel {}
 * >> Object.getOwnPropertyNames(Object.getPrototypeOf(a.constructor))
 *     Array(6) [ "prototype", "sanitizeFN", "validateFN", "defaultValue", "length", "name" ]
 * >> Object.getPrototypeOf(b.constructor).sanitizeFN === b.constructor.sanitizeFN
 *     true
 * In the last example you can see how the "sanitizeFN", "validateFN" are
 * available despite being defined in the superclass.
 */
export class BooleanDefaultTrueModel extends BooleanModel{}
Object.defineProperties(BooleanDefaultTrueModel, {
    defaultValue: {value: true}
});
Object.freeze(BooleanDefaultTrueModel);

export const StringModel = _AbstractGenericModel.createClass('StringModel', {
        sanitizeFN: function(rawValue) {
            if(typeof rawValue === 'string')
                return [rawValue, null];
            try {
                return [`${rawValue.toString()}`, null];
            }
            catch(error) {
                return [null, `Can't stringify rawValue with message: ${error.message}`];
            }
        }
      , validateFN: function(value) {
            if(typeof value !== 'string')
                return [false, `value is not typeof string: ${typeof value} (${value})`];
            return [true, null];
        }
      , defaultValue: ''
      , serializeFN: function(value/*, options=SERIALIZE_OPTIONS*/) {
            return value;
        }
      , deserializeFN: function(serializedString/*, options=SERIALIZE_OPTIONS*/) {
            return serializedString;
        }
    })
    // value will be a valid key or ForeignKey.NULL depending on the
    // key constraints as well.
  , KeyValueModel = _AbstractGenericModel.createClass('KeyValueModel',  {
        validateFN: function(value) {
          // Could also be a number in some cases, but we handle all *keys* as strings so far.
          if(typeof value !== 'string' && value !== ForeignKey.NULL)
                return [false, `NOT A VALID KEY must be string or ForeignKey.NULL: ${value.toString()}`];
            return [true, null];
        }
      , serializeFN: function(value/*, serializeOptions=SERIALIZE_OPTIONS*/) {
            if(typeof value === 'string')
                return value;
            if(value === ForeignKey.NULL)
                return null; // could be empty string, doesn't start with "S:"!
            // return `UNKOWN VALUE TYPE ${value.toString()}`;
            throw new Error(`UNKOWN VALUE TYPE (in ${this.name})`);
        }
      , deserializeFN: function(serializedString/*, options=SERIALIZE_OPTIONS*/) {
            // NOTE: serializeFN can return NULL but this wont take receive
            // that It will be null in that case.
            return serializedString;
        }
    })
  , PathModel = _AbstractGenericModel.createClass('PathModel', {
        sanitizeFN: function(rawValue) {
            if(typeof rawValue === 'string')
                return [Path.fromString(rawValue), null];
            // let validateFN catch this
             return [rawValue, null];
        }
      , validateFN: function(value) {
            // must be a Path
            if(value instanceof Path)
                return [true, null];
            return [false, `Value must be an instance of Path but is not: `
                    + `"${value?.toString() || value}" (typeof: ${typeof value}; `
                    + `constructor name: ${value?.constructor.name}).`];
        }
      , serializeFN: function(value /*, options=SERIALIZE_OPTIONS*/) {
            return value.toString();
        }
      , deserializeFN: function(serializedString/*, options=SERIALIZE_OPTIONS*/) {
            return Path.fromString(serializedString);
        }
    })
  , PathModelOrEmpty = _AbstractSimpleOrEmptyModel.createClass(PathModel)
  ;

// FIXME: also AvailableTypesModel/TypeModel should be centrally defined
//        so that we got one place where the pattern is implemented
// this is uses for color, axesMath, stylePatch and similarly forked in actors
export function createAvailableTypes(AvailableTypesModel, types) {
    const availableTypesDraft = AvailableTypesModel.createPrimalDraft({})
        , TYPE_TO_KEY = new Map()
        , TypeModel = AvailableTypesModel.Model
        ;
    for(const [key, label, Model] of types) {
        const availableType = TypeModel.createPrimalDraft({});
        availableType.get('typeClass').value = Model;
        availableType.get('label').value = label;
        availableTypesDraft.push([key, availableType]);
        TYPE_TO_KEY.set(Model, key);
    }
    const availableTypes = availableTypesDraft.metamorphose();
    return [availableTypes, TYPE_TO_KEY];
}

/**
 * Look at ColorModel of color.mjs or ActorModel of actors/actors-base.mjs
 * how the "DynamicModel" is set up.
 */
export function createDynamicType(DynamicModel, typeKeyName, typeKeyValue, dependencies) {
    const availableTypesKey = DynamicModel.foreignKeys.get(typeKeyName).targetName // e.g. 'availableActorTypes'
      , availableTypes = DynamicModel.staticDependencies.has(availableTypesKey)
                ? DynamicModel.staticDependencies.get(availableTypesKey).state
                : dependencies[availableTypesKey]
      , getTypeFor=key=>availableTypes.get(key).value.get('typeClass').value
      , getDraftFor=(name, deps)=>getTypeFor(name).createPrimalDraft(deps)
      , draft = getDraftFor(typeKeyValue, dependencies)
      , resultDraft = DynamicModel.createPrimalDraft(dependencies)
      ;
    resultDraft.get(typeKeyName).value = typeKeyValue;
    resultDraft.get('instance').wrapped = draft;
    return resultDraft;
}

export function getMinMaxRangeFromType(Type) {
    const UnwrappedType = Type.prototype instanceof _AbstractSimpleOrEmptyModel
        ? Type.Model
        : Type
        ;
    return [UnwrappedType.minVal, UnwrappedType.maxVal];
}

export function* getFieldsByType(FromType, SearchType) {
    for(const [fieldName, Type] of FromType.fields) {
            if(Type === SearchType)
                yield fieldName;
    }
}

export class Path {
    // jshint ignore: start
    static SEPARATOR = '/';
    static RELATIVE = '.';
    static ROOT = '/';
    static PARENT = '..';
    // jshint ignore: end


    /* Without actually knowing the model structure, the save
     * way to do this is to remove single dot path parts and
     * reduce consecutive slashes into single slashes.
     * Double dots could be handled as well, e.g.:
     *     '/hello/beautiful/../world' => '/hello/world'
     * But, when we decide to follow links, which are implemented
     * in the model, the links would have to be resolved first,
     * in place, before removing path parts.
     *
     * In the terminal a path is relative, until it begins with
     * '/' but in a way I'd prefer it to be absulute until it begins
     * with '.' or '..'
     * Maybe we can use a switch for this, but thinking about this:
     * if(pathParts[0] !== '')
     *     pathParts.unshift(this.RELATIVE);
     * In the end, this is the wrong place to decide! We know
     * if the first element is this.RELATIVE that the path is explicitly
     * relative, and if it is '' the part is explicitly absolute
     * otherwise we don't know in here.
     */
    static sanitize(...rawPathParts) {
        const pathParts = rawPathParts.map(
                            part=>typeof part !== 'number'
                                  // will remove contained separators
                                ? part.split(this.SEPARATOR)
                                : part.toString(10)
                        )
                        .flat() // Array.prototype.flat is golden here.
          , cleanParts = []
          ;
        for(const [i, part] of pathParts.entries()) {
            if(part === this.RELATIVE) {
                // Only keep as first part, at the other positions it
                // is meaningless!
                // also void in a strings like:
                //         /./path/to => path/to NOT: ./path/to
                //         .././path/to => ../path/to
                //         path/.././to => to NOT ./to
                if(i === 0 && cleanParts.length === 0)
                    // => ['.']
                    cleanParts.push(part);
                continue;
            }
            if(part === '') {
                // filter the remains of consecutive separators/slashes
                if(i === 0 && cleanParts.length === 0)
                    // explicitly absolute
                    cleanParts.push(this.ROOT);
                continue;
            }
            if(part !== this.PARENT) {
                // regular path part
                cleanParts.push(part);
                continue;
            }

            // else: part === this.PARENT
            if(cleanParts.length === 0) {
                // this path is relative beyond its origin
                // => cleanParts = ['..']
                cleanParts.push(part);
                continue;
            }
            // cleanParts.length > 0
            const last = cleanParts.at(-1);
            if(last == this.RELATIVE) {
                // Only happens when cleanParts.length === 1, see above
                // this.RELATIVE is kept only as first item.
                // cleanParts = ['.']
                // => cleanParts = ['..']
                cleanParts.splice(-1, 1, part);
                continue;
            }
            if(last === this.PARENT) {
                // this path is relative beyond its origin and more
                //  => ['..', '..']
                cleanParts.push(part);
                continue;
            }
            // last is a regular pathPart
            // consumes that one
            //  e.g. cleanParts = ['hello', 'world'];
            //       => cleanParts = ['world']
            cleanParts.pop();
        }
        return cleanParts;
    }
    static stringSanitize(str) {
        return this.fromString(str).toString();
    }
    constructor(...pathParts) {
        const [firstPart, ...parts] = this.constructor.sanitize(...pathParts)
            // this.constructor.PARENT is not interesting in here as it
            // won't change serialisation
          , explicitAnchoring = firstPart === this.constructor.ROOT
                             || firstPart === this.constructor.RELATIVE
                ? firstPart
                : null
          ;
        if(pathParts.length && explicitAnchoring === null)
            // that's a regular part
            parts.unshift(firstPart);
        Object.defineProperty(this, 'explicitAnchoring', {
            value: explicitAnchoring
          , enumerable: true
        });
        Object.defineProperty(this, 'isExplicitlyRelative', {
            value: explicitAnchoring === this.constructor.RELATIVE
          , enumerable: true
        });
        Object.defineProperty(this, 'isExplicitlyAbsolute', {
            value: explicitAnchoring === this.constructor.ROOT
          , enumerable: true
        });

        Object.defineProperty(this, 'parts', {
            value: Object.freeze(parts)
          , enumerable: true
        });
    }
    static fromParts(...pathParts) {
        return new this(...pathParts);
    }
    static fromString(pathString) {
        const splitted = pathString === ''
            ? []
            : pathString.split(this.SEPARATOR)
            ;
        return this.fromParts(...splitted);
    }
    fromString(pathString) {
        return this.constructor.fromString(pathString);
    }
    fromParts(...pathParts) {
        return this.constructor.fromParts(...pathParts);
    }
    toString(defaultAnchoring=null /*ROOT || RELATIVE || null */) {
        if(defaultAnchoring !== null
                && defaultAnchoring !== this.constructor.RELATIVE
                && defaultAnchoring !== this.constructor.ROOT)
            throw new Error(`TYPE ERROR defaultAnchoring must be either null, `
                    + `${this.constructor.name}.RELATIVE or `
                    + `${this.constructor.name}.ROOT but it is: "${defaultAnchoring}".`);
        const anchoring = this.explicitAnchoring === null
                ? defaultAnchoring
                : this.explicitAnchoring
                ;
        if(anchoring === null)
            return this.parts.join(this.constructor.SEPARATOR);
        if(this.parts.length === null)
            return anchoring;
        return [anchoring === this.constructor.SEPARATOR ? '' : anchoring, ...this.parts].join(this.constructor.SEPARATOR);
    }
    *[Symbol.iterator]() {
        if(this.explicitAnchoring !== null)
            yield this.explicitAnchoring;
        yield *this.parts;
    }
    appendString(pathString) {
        return this.append(...this.fromString(pathString).parts);
    }
    append(...pathParts) {
        return this.fromParts(...this, ...pathParts);
    }
    get isBase() {
        return this.parts.length === 0;
    }
    slice(from, to) {
        return this.fromParts(this.explicitAnchoring || '', ...this.parts.slice(from, to));
    }
    get parent() {
        if(this.isBase)
            throw new Error('Can\'t get parent path is a base path.');
        return this.slice(0, -1);
    }
    startsWith(rootPath) {
        const parts = [...this];
        for(const part of rootPath) {
            if(parts.shift() !== part)
                return false;
        }
        // Each part of rootPath is at the beginning of this;
        return true;
    }
    isRootOf(pathOrString) {
        const path = typeof pathOrString === 'string'
                ? Path.fromString(pathOrString)
                : pathOrString
                ;
        return path.startsWith(this);
    }
    equals(pathOrString) {
        if(pathOrString === this)
            return true;
        const path = typeof pathOrString === 'string'
                ? Path.fromString(pathOrString)
                : pathOrString
                ;
        return path.startsWith(this) && this.startsWith(path);
    }
    toRelative(rootPath) {
        if(!this.startsWith(rootPath))
            throw new Error(`VALUE ERROR ${this.constructor.name}.toRelative `
                    + `this ${this} does not start with rootPath ${rootPath}`);
        const parts = [...this]
           , rootPathParts = [...rootPath]
           , relativeParts = parts.slice(rootPathParts.length)
           ;
        return Path.fromParts('.', ...relativeParts);
    }
}

export const IS_CONTAINER = Symbol('IS_CONTAINER');
export function *getAllPathsAndValues(state) {
    // This check should rather be "is a container type"
    // and that would mean it has entries and it has a
    // get function that returns values for keys...
    if(state instanceof _BaseContainerModel) {
        // yield [IS_CONTAINER];
        if(!state.allEntries) console.warn(`!state.allEntries ${state}`, state);
        for(const [key, entry] of state.allEntries())
            for(const [value, ...path] of getAllPathsAndValues(entry))
                yield [value, key, ...path];
    }
    else
        yield [state];
}

export function _getEntry(fnName, state, path, defaultVal=_NOTDEF) {
    const pathInstance = (typeof path === 'string' ? Path.fromString(path) : path);
    try {
        const result = [...pathInstance.parts].reduce((accum, part)=>{
            if(!(accum instanceof _BaseContainerModel))
                throw new Error(`CONTAINER ENTRY ERROR no container at ${part} in ${accum} path: ${pathInstance.toString()}.`);
            return accum[fnName](part);
        }, state);
        return result;
    }
    catch(error) {
        // Could check if error is not a KEY ERROR type, but e don't!
        if(defaultVal !== _NOTDEF)
            return defaultVal;
        error.message += ` (path: ${path});`;
        throw error;
    }
}

export function getDraftEntry(state, path, defaultVal=_NOTDEF){
    return _getEntry('getDraftFor', state, path, defaultVal);
}

export function getEntry(state, path, defaultVal=_NOTDEF) {
    return _getEntry('get', state, path, defaultVal);
}

export function getValue(state, path, defaultVal=_NOTDEF) {
    const result = getEntry(state, path, defaultVal);
    return result === defaultVal ? result : result.value;
}

// How does changing the font trickle down to an updated axisLocations state!
// it seems that some knowledge about the font (READ ONLY) must be in some
// lower model.
// AND:

export function* _getAllEntries(state, path) {
    const pathInstance = (typeof path === 'string' ? Path.fromString(path) : path);
    let current = state;
    yield current; // for the empty path
    for(let pathPart of pathInstance) {
        current = getEntry(current, pathPart);
        yield current;
    }
}

// FIXME: would be cool to be able to get the Model of
// Links.
export function getModel(RootModel, path) {
    const pathInstance = (typeof path === 'string' ? Path.fromString(path) : path);
    return pathInstance.parts.reduce((accum, key)=>{
        console.log('getModel:', key, 'from:', accum);
        if('Model' in accum)
            // We don't use key here, because this is a Map/List
            // and the key is just a placeholder, the Model is equal
            // for each element.
            return accum.Model;
        if('fields' in accum)
            return accum.fields.get(key);
        throw new Error(`KEY ERROR don't know how to get model from ${accum.name}`);
    }, RootModel);
}


export function applyTo(state, path, methodNameOrFn, ...args) {
    const pathInstance = (typeof path === 'string' ? Path.fromString(path) : path)
      , entry = getEntry(state, pathInstance)
      ;
    // should probably store ForeignKeys still as BaseModel!
    console.log(`... at path ${path} applyEntry ${entry} method ${methodNameOrFn}:`, ...args);
    // how to change a non-container entry? => There's a set(value) method.
    // it basically has no methods to change!
    if(typeof methodNameOrFn === 'function')
        return methodNameOrFn(entry, ...args);
    else
        return entry[methodNameOrFn](...args);
}

export function pushEntry(state, path, ...entries) {
    return applyTo(state, path, 'push', ...entries);
}

export function popEntry(state, path) {
    return applyTo(state, path, 'pop');
}

export function spliceEntry(state, path, start, deleteCount, ...items) {
    return applyTo(state, path, 'splice', start, deleteCount, items);
}

export function deleteEntry(state, path, key) {
    return applyTo(state, path, 'delete', key);
}

// States need comparison, state.eq(otherState).
// Also, it would be very nice if state were immutable, thus:
//          state.setSomeValue() => aNewState;
// we would be recreating state a lot though as this would have to change application state.
// but we would move parallell/sibling states that did not change to the new object.
// and checkiing is always done on initialization.
//
//    No: this.value = ...
//    But: that = this.set(value);
// that === this === true === no change???
// It's interesting. but is it overkill?
// is it a big effort to teach the Model how to update itself?
// can a visitor do so?

//Allright: TODO:
//
// change multiple values
//      transaction like behavior is actually super easy when we do the
//      immutable/copy on write thing:
//          * get the state
//          * transform as much as you like
//          * set the state to the application.
//
// Inherent coherenceFunctions!!!
//
// produce changed paths in a comparison(oldState, newState)
//          NOTE: in arrays/maps add/delete operation could be tracked
//                not sure we need this though, maybe just acknowledge that
//                the thing has changed???
//                especially for deletions, as for additons we can just
//                output the new path.
//                BTW: size/length could be treated as a change indicator
//                      so the ui knows wherther to rebuild a list rather
//                      than to update it?
//
// hmm for simple types and structs everything is always changed
// maps can also have added/deleted
// arrays can have added/deleted but also moves, when the element is still
// in the array but has another index.

class CompareStatus {
    constructor(name) {
        this.name = name;
        Object.freeze(this);
    }
    toString() {
        return `[compare ${this.name}]`;
    }
}
export const COMPARE_STATUSES = Object.freeze(Object.fromEntries([
        'EQUALS', 'CHANGED', 'NEW', 'DELETED', 'MOVED', 'LIST_NEW_ORDER'
    ].map(name=>[name, new CompareStatus(name)])
));

export function* rawCompare(oldState, newState) {
    if(!(oldState instanceof _BaseModel) || !(newState instanceof _BaseModel))
        throw new Error(`TYPE ERROR oldState ${oldState} and `
                + `newState ${newState} must be instances of _BaseModel.`);

    if(oldState.isDraft || newState.isDraft)
        throw new Error(`TYPE ERROR oldState ${oldState} and `
                + `newState ${newState} must not be drafts.`);


    const {EQUALS, CHANGED, NEW, DELETED, MOVED, LIST_NEW_ORDER} = COMPARE_STATUSES;
    if(oldState === newState) {
        // return also equal paths for completeness at the beginning,
        // can be filtered later.
        // HOWEVER this return will prevent the alogrithm from descending
        // in the structure and thus we won't get all available paths anyways!
        yield [EQUALS, null];
        return;
    }

    // Not the same constructor, but instanceof is not relevant here
    // because a sub-class can change everything about the model.
    if(oldState.constructor !== newState.constructor) {
        yield [CHANGED, null];
        return;
    }

    if(oldState instanceof _AbstractDynamicStructModel && oldState.WrappedType !== newState.WrappedType) {
        // This could maybe be a stronger indicator about the change of Type
        // as it requires a changed interface. Using NEW.
        // It is also marked as CHANGED when the the type is the same
        // but the value changed.
        yield [NEW, null];
        return;
    }

    // self yield? yes e.g. an array may not be equal (===) but contain
    // just equal items at the same position, still for strict equality
    // that doesn't matter because it's a diferent array?
    yield [CHANGED, null];

    if(oldState instanceof _BaseSimpleModel)
        // here not the same instance counts as change.
        return;

    // Now instanceof counts, because it tells us how to use/read the instances.
    if(oldState instanceof _AbstractStructModel || oldState instanceof _AbstractDynamicStructModel ) {
        // both states are expected to have the same key

        for(const [key, oldEntry] of oldState.allEntries()) {
            const newEntry = newState.get(key);

            // FIXME: require more generic handling of possibly null entries
            //        however, currently it only applies to ForeignKey related
            //        entries (ValueLink) anyways

            // see _getLink
            const oldIsNull = oldEntry === ForeignKey.NULL
              , newIsNull = newEntry === ForeignKey.NULL
              ;
            if(oldIsNull && !newIsNull) {
                yield [NEW, null, key];
                continue;
            }
            if(!oldIsNull && newIsNull) {
                yield [DELETED, null, key];
                continue;
            }
            if(oldIsNull && newIsNull){
                yield [EQUALS, null, key];
                continue;
            }

            for(const [result, data, ...pathParts] of rawCompare(oldEntry, newEntry))
                yield [result, data, key, ...pathParts];

        }
        return;
    }

    if(oldState instanceof _AbstractListModel) {
        // I think this is a very interesting problem. On the Array layer
        // we can deal with change, addition, deletion and also movement
        // change (replace) is like deletion plus addition, we can't decide
        // how it happened exactly, it indicates that the new value and the
        // old value are not identical, nor somewhere in the array as that
        // would jst be moved.
        // Should we find moves first (from index, to index) so we can
        // keep them of other comparisions.
        //
        // so, when the new array is shorter than the old one we got
        // netto more deletion
        // when it's longer, we got netto addition.
        //
        // When everything new in newState got changed or replaced, we don't
        // care? One question would be how to map this to deeper down
        // change operations, we don't want to rebuild all of the UIs within
        // the array, just because one value deep down changed. Need to be
        // more precise.
        //
        // but also, when just one value in a multi-axis slider changed,
        // the mapping/updating would likely be swift.
        //
        // another example would be a simple reordering operation, e.g.
        // move the keyframe at index 4 to index 1 ...
        //
        // One question is probably how to decide whether the UI should be
        // replaced or updated! There may be a sweet spot at which replacing
        // is better than updating!
        // Consequently, we need to find out why we don't rebuild all of
        // the UI all the time, e.g. one entry in the root struct changed,
        // that should not require to rebuild the wholde app.
        // Similarly the array case, but it's much harder to decide here
        // what to do!
        //
        // hmm, to keep identities, a map could be used. Order could be
        // stored as part of the value, or next to the map, And the key
        // would be an increasing number (easy to handle!) for new inserts.
        // (Or we use an OrEmpty Type in an array to delete stuff, but at
        // this point, the map which allows for deletions natively is nice.
        // The array could be used to keep an ordered list of the keys.
        // It could be serialized without revealing the complex structure.
        // That way, new order of the array, or any additions deletions
        // etc. could be handled nicely by the UI.

        // Ok, such an id-array, if implemented as it's own type, what
        // can it do?
        // IDs are internal, not global.
        // Since set requires the element to exist already, it would not
        // change the id. But we can have a "replace" method.
        // set access is still via indexes,
        // it's interesting, we should rather make the implementation a
        // pattern. Because that way we can access the list independently
        // from the values, and get info if the list changed or not, in
        // contrast to the map...
        // Maybe a struct{
        //      order => list of ids
        //    . entries => map id: entry
        // }
        // IT should be impossible to come up with external ids though!
        //
        // So what is the aim of this?

        // A) to distinguish between change and replace:
        //     change: same key-id different entry => deep compare
        //             => how does the ui know?
        //                 if deeply anything changed, it will create a path
        //                 otherwise, there will be no deep path.
        //                 Consequently, even if the id of the entry changed
        //                 it may still be equivalent and no action is required!
        //                 but, we rather don't want to do equivalence comparison!
        //                 Hence, we, should not apply the changed if it's equivalent!
        //     replace: old key-id deleted new key-id inserted, order changed as well
        //             as before, we should probably not apply a replace if it's equivalent
        //             but this will otherwise create a new id, so it must recreate the UI(?)
        //             and it won't go into deep comparison?
        //
        // At the moment, I feel like I should create a simple solution that
        // could be enhanced later, either by adding new types to the model,
        // coherenceFunctions or by updating the compare method.


        // Deletions won't be mentioned, the new order length is the new lenght.
        // Entries are either old indexes, the new indexes are the
        // indexes of the order array.
        // new Order[3, 2, NEW, NEW, 4]: note how the last item did not change!
        // new Order[3, 2, NEW, NEW, EQUALS]
        // What if there are duplicates, i.e. entries that are equal?
        // Let's say they are consumend one by one! If oldState had two
        // entries of a kind and newState has three: []

        const newOrder = []
        //  , seen = new Map()
          , oldFoundIndexes = new Set()
          ;
        // for(const [oldIndex, oldEntry] of oldState) {
        //     const startIndex = seen.get(newEntry)
        //       , newIndex = newState.value.indexOf(oldEntry, startIndex)
        //       ;
        //     if(newIndex !== -1) {
        //         // found
        //         newOrder[newIndex] = oldIndex === newIndex ? [EQUALS] : [MOVED, oldIndex];
        //         seen.set(newEntry, oldIndex + 1);
        //     }
        //     else
        //         // Give indexOf a chance to search less, the result is
        //         // the same as not changing seen[newEntry], not sure if
        //         // this improves performance.
        //         seen.set(newEntry, Infinity);
        // }
        // for(const [newIndex, newEntry] of newState) {
        //     if(newOrder[newIndex])
        //         continue;
        //     newOrder[newIndex] = newIndex < oldState.value.length ? [CHANGED] : [NEW];
        // }


        // NOTE: MOVED doesn't help UI and it also can make change detection
        // bad, e.g.:
        // * bad change detection: if two identical (===) siblings in old
        //   and the first sibling get changed, the first is marked as NEW
        //   and the second as MOVED, where the first marked as CHANGED and
        //   the second as EQUALS makes a lot more sense.
        // * doesn't help UI: In actual UI MOVED is treated as NEW where it
        //   could matter, because reqiring rootPath/dependecies in a hierarchy
        //   of sub-widgets is not (yet) implemented.
        //
        //
        // for(const [newKey, newEntry] of newState) {
        //     const startIndex = seen.get(newEntry)
        //       , [newIndex, /*message*/] = newState.keyToIndex(newKey)
        //       , oldIndex = oldState.value.indexOf(newEntry, startIndex)
        //       ;
        //     if(oldIndex === -1) {
        //         // Give indexOf a chance to search less, the result is
        //         // the same as not changing seen[newEntry], not sure if
        //         // this improves performance.
        //         seen.set(newEntry, Infinity);
        //         continue;
        //     }
        //     // found
        //     newOrder[newIndex] = oldIndex === newIndex
        //                         ? [EQUALS]
        //                         : [MOVED, oldIndex]
        //                         ;
        //     seen.set(newEntry, oldIndex + 1);
        //     // there's a entry of newState in oldState at oldIndex
        //     oldFoundIndexes.add(oldIndex);
        // }
        for(const [newKey , newEntry] of newState) {
            const [newIndex, /*message*/] = newState.keyToIndex(newKey);
            if(newOrder[newIndex] !== undefined)
                continue;
            if(oldState.has(newIndex) && oldState.get(newIndex) === newEntry)
                newOrder[newIndex] = [EQUALS];
            else
                // Not found in oldState, filling empty slots in newOrder
                // I'm not sure we even need to distinguish betwenn NEW and CHANGED
                // as both mean the content is different.
                newOrder[newIndex] = (newIndex >= oldState.length
                                    // marked as MOVED, otherwise it would be in newOrder already
                                    // i.e. newState.splice(2, 0, newEntry)
                                    // now the index at 2 is NEW
                                    // and the index at 3 is [MOVED, 2]
                                    || oldFoundIndexes.has(newIndex))
                                ? [NEW]
                                    // i.e. newState.splice(2, 1, newEntry)
                                    // now the index at 2 is NEW
                                    // and the oldEntry is gone
                                    // => CHANGED is like DELETED + NEW
                                : [CHANGED]
                                ;
        }
        // FIXME: Could fill the differnce in length of newOrder with DELETED
        // not sure this is required, as newOrder.length is good and
        // similar information, but it gets destroyed by this:
        // newOrder.push(...new Array(Math.max(0, oldState.length - newOrder.length)).fill(DELETED));
        // could do: newOrder.newStateLength = newState.length
        Object.freeze(newOrder);
        yield [LIST_NEW_ORDER, newOrder];
        for(const [index, [status, /*oldIndex*/]] of newOrder.entries()) {
            const key = index.toString(10);
            if(status === EQUALS || status === MOVED || status === NEW) {
                // EQUALS: nothing to do.
                // MOVED: not compared, listener must reorder according to newOrder.
                // could also be treated like NEW by the UI
                // NEW: Item at index requires a new UI or such, there's nothing to compare.
                yield [status, null, key];
                continue;
            }
            if(status === CHANGED) {
                // There's already an item at that index, so we compare:
                const oldEntry = oldState.get(index)
                 , newEntry = newState.get(index)
                 ;
                for(const [result, data, ...pathParts] of rawCompare(oldEntry, newEntry))
                    yield [result, data, key, ...pathParts];
                continue;
            }
            throw new Error(`Don't know how to handle status ${status}`);
        }
        return;
    }
    // NOTE: _AbstractOrderedMapModel could also be compared similar
    //       to _AbstractListModel above, however, it's not clear if
    //       we should rather compare by key/value pairs as value or
    //       as the payload value as value. Maybe a use cse will come up
    //       we will see then. In general it would be possible to produce
    //       both comparison styles, as a list and as a map.
    if(oldState instanceof _AbstractOrderedMapModel
            /* || oldState instanceof _AbstractMapModel*/) {
        for(const [key, /*oldEntry*/] of oldState) {
            if(!newState.has(key))
                yield [DELETED, null, key];
        }
        for(const [key, newEntry] of newState) {
            if(!oldState.has(key)) {
                yield [NEW, null, key];
                continue;
            }
            const oldEntry = oldState.get(key);
            if(oldEntry === newEntry) {
                yield [EQUALS, null, key];
                continue;
            }
            // CHANGED: deep compare, both keys exist
            for(const [result, data, ...pathParts] of rawCompare(oldEntry, newEntry))
                yield [result, data, key, ...pathParts];
            continue;
        }
        return;
    }
    // * states should know how to compare
    // each level would produce changed keys, and we can recursively descend?
    // a verbose mode would provide all changed paths, where a compact mode
    // only keeps the longest unique paths, where the leaves changed, this
    // will be interesting!
    throw new Error(`VALUE ERROR Don't know how to compare ${oldState}`);
}


export function* compare(oldState, newState) {
    for(const [status, data, ...pathParts] of rawCompare(oldState, newState))
        yield [status, data, Path.fromParts('/',...pathParts)];
}

export class StateComparison {
    static COMPARE_STATUSES = COMPARE_STATUSES; // jshint ignore:line
    constructor(oldState, newState) {
        Object.defineProperties(this,{
           oldState: {
                value: oldState
              , enumerable: true
            }
          , newState: {
                value: newState
              , enumerable: true
            }
        });

        if(oldState !== null)
            Object.defineProperty(this, 'compareResult', {
                 value: Object.freeze([...compare(oldState, newState)])
               , enumerable: true
        });

        this._compareDetailsMap = null;
        this._rootChangedMap = null;

    }
    static createInitial(newState, dependencies=null
                      , anchoring=Path.ROOT /* null || Path.ROOT || Path.RELATIVE */) {
        return new InitialStateComparison(newState, dependencies, anchoring);
    }

    map(fn) {
        return this.compareResult.map(fn);
    }
    *[Symbol.iterator]() {
        yield *this.compareResult;
    }
    toLog() {
        console.log(`>>> ${this.constructor.name}.toLog ...`);
        for(const [status, data, path] of this) {
            if(status === COMPARE_STATUSES.LIST_NEW_ORDER) {
                console.log(`    ${status}: ${path} ;;`);
                for(let [i, [st, ...val]] of data.entries())
                    console.log(`        #${i} ${st} data:`, ...val, ';;');
            }
            else
                console.log(`    ${status}: ${path}${data !== null ? " (data: " + data + ")" : ''} ;;`);
        }
        console.log(`<<< ${this.constructor.name}.toLog DONE!`);
    }
    getDetaislMap() {
        // could be cached!
        if(this._compareDetailsMap !== null)
            return this._compareDetailsMap;

        const compareDetailsMap = new FreezableMap();
        for(const [status, data, pathInstance] of this) {
            const path = pathInstance.toString();
            if(!compareDetailsMap.has(path))
                compareDetailsMap.set(path, new Map());
            compareDetailsMap.get(path)
                             .set(status, data)
                             ;
        }
        Object.defineProperty(this, '_compareDetailsMap', {
            value: Object.freeze(compareDetailsMap)
        });
        return this._compareDetailsMap;
    }
    _getRootChangedMap() {
        // TODO: Document!
        // COMPARE_STATUSES:
        // EQUALS CHANGED NEW DELETED MOVED LIST_NEW_ORDER
        const {CHANGED, NEW, EQUALS, DELETED, MOVED, LIST_NEW_ORDER} = COMPARE_STATUSES
          , expected = new Set([CHANGED, NEW, MOVED, EQUALS, DELETED])
          , skipNotImplemented = new Set([LIST_NEW_ORDER])
          , changedMap = new FreezableMap()
          ;
        // FIXME: I think I'm not fully satisfied with this dumbing down
        // of the compareResult, as it loses so much information, which
        // we may want to use selectively in the UI in one way or the other.
        for(const [status, /* data */, pathInstance] of this) {
            const path = pathInstance.toString();
            if(skipNotImplemented.has(status)) {
                // console.warn(`NOT IMPLEMENTED skipping update status ${status} @${path}`);
                // It's not implemented in here.
                continue;
                // TODO: for LIST_NEW_ORDER:
                // console.log(`    ${status}: ${path} ;;`);
                // for(let [i, [st, ...val]] of data.entries())
                //     console.log(`        #${i} ${st} data:`, ...val, ';;');
            }
            else if(!expected.has(status))
                throw new Error(`NOT IMPLEMENTED don't know how to handle ${status} #${path}`);
            else if(status === EQUALS || status === DELETED)
                continue;
            // console.log('status: ' + status, path);
            if(changedMap.has(path))
                // seen
                continue;
            const entry = getEntry(this.newState, path);
            changedMap.set(path, entry);
        }
        return changedMap;
    }
    getChangedMap(dependenciesMap=null, toLocal=true) {
        if(this._rootChangedMap === null)
             Object.defineProperty(this, '_rootChangedMap', {
                value: Object.freeze(this._getRootChangedMap())
            });
        if(dependenciesMap === null)
            return this._rootChangedMap;
        const filteredChangedMap = new FreezableMap();
        for(const [rootPath, localPath] of dependenciesMap.entries()) {
            if(!this._rootChangedMap.has(rootPath))
                continue;
            filteredChangedMap.set(
                toLocal ? localPath : rootPath
              , this._rootChangedMap.get(rootPath)
            );
        }
        return Object.freeze(filteredChangedMap);
    }

    get isInitial() {
        return false;
    }
}

// Not exported, accessed via StateComparison.createInitial(...)
class InitialStateComparison extends StateComparison {
    constructor(newState, dependencies=null, anchoring=Path.ROOT /* null || Path.ROOT || Path.RELATIVE */){
        super(null, newState);
        const compareResultEntries = []
          , paths = dependencies === null
                ? this._getPathsFromState(newState, anchoring)
                  // This way it's not guaranteed that the paths do exist
                  // in newState, but it is very quick and only creates
                  // entries for the required dependencies.
                : Array.from(dependencies.keys()).map(Path.fromString, Path)
                ;

        for(let pathInstance of paths)
            compareResultEntries.push([COMPARE_STATUSES.NEW, undefined, pathInstance]);

        Object.defineProperty(this, 'compareResult', {
                 value: Object.freeze(compareResultEntries)
               , enumerable: true
        });
    }

    _getPathsFromState(state, anchoring=null) {
        const paths = [];
        for(const [/*value*/, ...parts] of getAllPathsAndValues(state)){
            const path = anchoring === null
                    ? Path.fromParts(...parts)
                    : Path.fromParts(anchoring, ...parts)
                    ;
            paths.push(path);
        }
        return paths;
    }

    get isInitial() {
        return true;
    }
}

// Coherence guards:
//
// The UI of the type tools grid will serve here as a target, as it has
// a lot of inherent data logic, that should be separated. It also
// is layered several levlels deep, which makes it more interesting.
// At the outher most level e.g. an axis used in the dimension controls
// should not be used (be disabled) in manual axis locations.
// Then, between the (two) dimensions, the axis also must be mutual exclusive.
// On the level of the dimension itself, there's logic involved "massaging"
// stepping values with differnt constraints, min/max, being non-zero etc.
// also, about stepping, the model should be able to produce the "other value"
// either by exosing method or by exporting a static function or both.
//
//
// SQL Constraints come into mind, especially at this point e.g. UNIQUE:
//    NOT NULL - Ensures that a column cannot have a NULL value
//    UNIQUE - Ensures that all values in a column are different
//    PRIMARY KEY - A combination of a NOT NULL and UNIQUE. Uniquely identifies each row in a table
//    FOREIGN KEY - Prevents actions that would destroy links between tables
//    CHECK - Ensures that the values in a column satisfies a specific condition
//    DEFAULT - Sets a default value for a column if no value is specified
//    CREATE INDEX - Used to create and retrieve data from the database very quickly
//
// Maybe we can have layers of checks here, things like UNIQUE could easily
// be built in, while more complex stuff needs to be custom.
//
// Good thing we are immutable: We can build up the new model completeley
// and then validate it (also, ask/decide to skip validation while in progress)
// It's just important that eventually there's a coherent model.
// If the new model is invalid, we just don't apply it, and that's it.
//
// I'll have tp look into some nosql/object stores a bit!
// there's e.g. a common model to reference another value by unique ID
// which is very handy when normalizing stuff!. E.g. the activeTarget
// state is an index into the list of targets. And the dimension axis
// is an index into the list of available axes.
// Within a datastructure, uniqueness can also be achieved i.e. using a
// dictionary, where the keys are unique by default. Bue, e.g. references
// to those entries from further away.

