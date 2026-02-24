import { _BaseModel, OLD_STATE, isImmutableWriteError } from "./base-model.ts";
import {
    IS_PROXY,
    GET_IMMUTABLE,
    GET_DRAFT,
    GET,
    IS_WRAPPER_TYPE,
    isProxy,
    unwrapPotentialWriteProxy,
} from "./util.ts";

// FIXME: rename to  _HAS_DRAFT_FOR_POTENTIAL_WRITE_PROXY, ...?
export const _LOCAL_PROXIES = Symbol("_LOCAL_PROXIES"),
    _OLD_TO_NEW_SLOT = Symbol("_OLD_TO_NEW_SLOT"),
    _HAS_DRAFT_FOR_PROXY = Symbol("_HAS_DRAFT_FOR_PROXY"),
    _HAS_DRAFT_FOR_OLD_STATE_KEY = Symbol("_HAS_DRAFT_FOR_OLD_STATE_KEY"),
    _GET_DRAFT_FOR_PROXY = Symbol("_GET_DRAFT_FOR_PROXY"),
    _GET_DRAFT_FOR_OLD_STATE_KEY = Symbol("_GET_DRAFT_FOR_OLD_STATE_KEY");

/**
 * Decide if proxification is required for item:
 * If it is a _BaseModel (_BaseContainerModel?) in immutable state,
 * it's required. If it is a draft or not a _BaseMode/_BaseContainerModel
 * it's likely not required;
 * Esecially if item is already a draft, we should not wrap it.
 */
function _requiresPotentialWriteProxy(item: unknown): item is _BaseModel {
    if (!(item instanceof _BaseModel)) return false;
    // _BaseSimpleModel or _BaseContainerModel
    if (item.isDraft) return false;
    // immutable (not a draft)
    return true;
}

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
    // Re-attached from util.ts for backward compatibility.
    // jshint ignore: start
    static IS_PROXY = IS_PROXY;
    static GET_IMMUTABLE = GET_IMMUTABLE;
    static GET_DRAFT = GET_DRAFT;
    static GET = GET;
    // jshint ignore: end
    static isProxy = isProxy;

    // Instance properties set in constructor
    declare immutable: _BaseModel;
    declare parent: _BaseModel;
    declare key: string | null;
    declare draft: _BaseModel | null;
    declare proxy: _BaseModel;

    static create(
        parent: _BaseModel,
        immutable: _BaseModel,
        key: string | null = null,
    ): _BaseModel {
        // FIXME ?? could return immutable[_POTENTIAL_WRITE_PROXY_GET_IMMUTABLE]
        // WHY WOULD THIS HAPPEN?
        if (_PotentialWriteProxy.isProxy(immutable)) return immutable;

        // If proxyfication is not required, return the (immutable?) value.
        if (!_requiresPotentialWriteProxy(immutable)) return immutable;

        // Do not proxy and trap the wrapped type, parent takes over
        // that role. The wrapped child is not proxified as the wrapper
        // takes care of all the duties.
        const parentAny = parent as unknown as Record<string | symbol, unknown>;
        if (
            parentAny[IS_WRAPPER_TYPE] &&
            immutable instanceof
                (parentAny.WrappedType as new (
                    ...args: unknown[]
                ) => _BaseModel) &&
            (
                unwrapPotentialWriteProxy(parent) as unknown as Record<
                    string,
                    unknown
                >
            ).wrapped === immutable
        )
            return immutable;

        if (_PotentialWriteProxy.isProxy(parent)) {
            if (
                immutable !==
                (
                    parentAny[_PotentialWriteProxy.GET_IMMUTABLE] as _BaseModel
                ).get(key!)
            ) {
                // This is a bit wild, however, see the comment at the
                // bottom of _handlerGet for when this would be triggered.
                throw new Error(
                    `ASSERTION ERROR: immutable must be at ${key} of parent immutable!`,
                );
            }

            if (!(parentAny.hasOwn as (k: string) => boolean)(key!))
                // parent won't create a draft for this
                return immutable;

            // We must not return a proxy if the respective draft already exists
            if (
                (
                    parentAny[_HAS_DRAFT_FOR_OLD_STATE_KEY] as (
                        k: string | null,
                    ) => boolean
                )(key)
            )
                // This is the reason why this check cant be in the _PotentialWriteProxy constructor
                return (
                    parentAny[_GET_DRAFT_FOR_OLD_STATE_KEY] as (
                        k: string | null,
                    ) => _BaseModel
                )(key);

            // Parent is not a draft, hence it's a proxy of an immutable
            // and thus we got to go via key!
            return new _PotentialWriteProxy(parent, immutable, key).proxy;
        }
        // can call without the parent.hasDraftFor check
        // as it must get called from within parent in this case!
        if (parent.isDraft)
            return new _PotentialWriteProxy(parent, immutable).proxy;

        throw new Error(
            `TYPE ERROR parent must be a draft or a potential write proxy of an immutable.`,
        );
    }

    createMethodProxy(
        fnName: string,
        fn: (...args: unknown[]) => unknown,
    ): (...args: unknown[]) => unknown {
        if (_PotentialWriteProxy.isProxy(fn)) {
            // I don't actually think this case happens, but if it does, it
            // will be interesting to observe the case!
            // A possible solution would ne to return the fn un-augmented:
            //    return fn;
            // But for now raise:
            throw new Error(
                `TOO MUCH PROXYIFICATIAN on a function that is already a proxy: "${fnName}".`,
            );
        }

        const getterAPIs = new Set([
            "get" /* possibly 'slice', but requires attention below? */,
        ]);
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const handler = {
            get: function (
                targetFn: (...args: unknown[]) => unknown,
                prop: string | symbol,
                receiver: unknown,
            ): unknown {
                // assert targetFn === fn
                // so, unlikely/seldom that we use a getter on it, maybe for
                // fn.name ... but event that unlikely required!
                if (prop === _PotentialWriteProxy.IS_PROXY) return true;
                if (prop === _PotentialWriteProxy.GET) return targetFn;
                return Reflect.get(targetFn, prop, receiver);
            },
            apply: function (
                targetFn: (...args: unknown[]) => unknown,
                thisArgument: _BaseModel,
                argumentsList: unknown[],
            ): unknown {
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
                const draftOrThis = self.hasDraft()
                    ? self.getDraft()
                    : thisArgument;
                let result: unknown;
                try {
                    result = Reflect.apply(
                        targetFn,
                        draftOrThis,
                        argumentsList,
                    );
                } catch (error: unknown) {
                    if (isImmutableWriteError(error as Error)) {
                        // This is mutating, called on an immmutable!
                        const draft: _BaseModel = self.getDraft();
                        return Reflect.apply(targetFn, draft, argumentsList);
                    } else throw error;
                }

                if (
                    !getterAPIs.has(fnName) ||
                    !_requiresPotentialWriteProxy(result)
                )
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
                if (!getterAPIs.has(fnName))
                    throw new Error(
                        `UNKOWN GETTER API don't know how to get arguments for method "${fnName}" ` +
                            `from parent ${thisArgument} arguments: ${argumentsList.join(", ")}.`,
                    );
                const key = argumentsList[0] as string;
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

                return self.getPotentialWriteProxy(key, result as _BaseModel);
            },
        };
        return new Proxy(fn, {
            get: handler.get.bind(this),
            apply: handler.apply.bind(this),
        });
    }

    constructor(
        parent: _BaseModel,
        immutable: _BaseModel,
        key: string | null = null,
    ) {
        this.immutable = immutable;
        this.parent = parent;
        if (
            key !== null &&
            (!_PotentialWriteProxy.isProxy(parent) ||
                // get would also raise Key Error
                (parent as unknown as Record<symbol, _BaseModel>)[
                    _PotentialWriteProxy.GET_IMMUTABLE
                ]!.get(key!) !== immutable)
        )
            throw new Error(
                `PROXY ERROR can't specify key "${key}" when parent is not a proxy or ` +
                    `when immutable is not at parent.get(key).`,
            );
        this.key = key;
        this.draft = null;

        // Could possibly rename '_handlerGet' to 'get' and
        // '_handlerSet' to 'set' and just do: new Proxy(immutable, this);
        // However, that way, accidentially, we could implement other
        // traps, and this way the traps are very explicit.
        this.proxy = new Proxy(immutable, {
            get: this._handlerGet.bind(this),
            set: this._handlerSet.bind(this),
        });
        // NOTE: The proxy used to be returned from the constructor directly
        // (`return this.proxy;`). This was refactored so that the constructor
        // is honest (returns `this`). The static `create` factory now returns
        // `.proxy` — which is the only public entry point.
    }
    hasDraft(): boolean {
        if (this.draft !== null) return true;
        const p = this.parent as unknown as Record<string | symbol, unknown>;
        if (this.key !== null)
            return (p[_HAS_DRAFT_FOR_OLD_STATE_KEY] as (k: string) => boolean)(
                this.key,
            );
        // assert(this.parent.isDraft)
        else
            return (p[_HAS_DRAFT_FOR_PROXY] as (proxy: _BaseModel) => boolean)(
                this.proxy,
            );
    }
    // Called when a mutating function (set, delete) triggers ImmutableWriteError!
    getDraft(): _BaseModel {
        if (this.draft !== null) return this.draft;
        // This depends a lot on the parents nature.
        // was the proxy created from within the draft parent?
        // i.e. parent is a draft
        const p = this.parent as unknown as Record<string | symbol, unknown>;
        let draft: _BaseModel | false = false;
        if (this.key !== null)
            // was the proxy created from a proxy of an immutable
            // i.e. parent is a proxy
            // and parent[_POTENTIAL_WRITE_PROXY_GET_IMMUTABLE] exists
            // actually => immutable.getDraftFor(this.key); will trigger itself ImmutableWriteError
            // but we can use parent[_POTENTIAL_WRITE_PROXY_GET]getDraftFor(this.key);
            // which will trigger or not!
            draft = (
                p[_GET_DRAFT_FOR_OLD_STATE_KEY] as (
                    k: string,
                ) => _BaseModel | false
            )(this.key);
        else if (this.parent.isDraft)
            // => may have changed if parent[_IS_POTENTIAL_WRITE_PROXY]
            draft = (
                p[_GET_DRAFT_FOR_PROXY] as (
                    proxy: _BaseModel,
                ) => _BaseModel | false
            )(this.proxy);

        // if(! parent ) => disconnected = true! always
        // let disconnected = false;

        // false returned by parent.getDraftFor, if draft is not genuine
        if (draft === false) {
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

        if (draft[OLD_STATE] !== this.immutable)
            // Something went wrong! Passing this test doesn't mean
            // nothing went wrong, but this is a strong indication for
            // thinking error.
            throw new Error(
                "ASSERTION FAILED draft[OLD_STATE] must be equal to this.immutable but is not.",
            );

        // Return now always this draft from this proxy
        // the proxy could get disconnected from it's parent, but
        // the draft stays connected.
        this.draft = draft;
        //if(disconnected)
        //    throw disconectedError(new Error(`DISCONECTED DRAFT ERROR proxy draft is disconneced from parent`), draft);
        return this.draft;
    }

    getPotentialWriteProxy(key: string, item: _BaseModel): _BaseModel {
        // Must use this.proxy as parent here, in order to trigger
        // the isImmutableWriteError trap.
        // NOTE: assert item === this.immutable.get('key')

        // _PotentialWriteProxy.create:
        return (this.constructor as typeof _PotentialWriteProxy).create(
            this.proxy,
            item,
            key,
        );
    }
    _handlerGet(
        target: _BaseModel,
        prop: string | symbol,
        receiver: unknown,
    ): unknown {
        // assert target === immutable
        if (prop === _PotentialWriteProxy.IS_PROXY) return true;
        if (prop === _PotentialWriteProxy.GET_IMMUTABLE) return this.immutable;
        if (prop === _PotentialWriteProxy.GET_DRAFT)
            return this.hasDraft() ? this.getDraft() : undefined;
        if (prop === _PotentialWriteProxy.GET)
            return this.hasDraft() ? this.getDraft() : this.immutable;

        // Use the draft directly as the receiver,if there'a draft for receive
        // this way getting i.e. the prop 'length' from this will not
        // query the old immutable after e.g. a _AbstractList.push(...)
        // Possibly, there are other subtle bugs like this.
        const r = receiver as Record<symbol, unknown>;
        const receiver_ =
                (r[_PotentialWriteProxy.IS_PROXY] &&
                    r[_PotentialWriteProxy.GET_DRAFT]) ||
                receiver,
            result = Reflect.get(target, prop, receiver_);
        if (typeof result === "function") {
            // TODO: return proxy to trap function call
            //       and possibly catch the isImmutableWriteError
            return this.createMethodProxy(prop as string, result);
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
    _handlerSet(
        target: _BaseModel,
        propertyKey: string,
        value: unknown,
        receiver: unknown,
    ): boolean {
        // assert target === immutable
        const draftOrTarget = this.hasDraft() ? this.getDraft() : target;
        try {
            return Reflect.set(
                draftOrTarget as object,
                propertyKey,
                value,
                receiver,
            );
        } catch (error: unknown) {
            if (isImmutableWriteError(error as Error)) {
                // === trying to write to immutable
                // this detects the write, everything else may as well
                // be any read, even of un-important values or of unrelated
                // calculations etc.
                const draft = this.getDraft() as object;
                // Leaving out receiver, don't think it's relevant here,
                // but I could be wrong!
                return Reflect.set(draft, propertyKey, value);
            }
            // re-raise, not our business!
            throw error;
        }
    }
}

// Re-exported from util.ts for backward compatibility.
export { unwrapPotentialWriteProxy };
