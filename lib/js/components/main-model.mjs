/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */

import {
       unwrapPotentialWriteProxy
      , _AbstractStructModel
      // , _AbstractListModel
      //, _AbstractMapModel
      , _AbstractOrderedMapModel
      , _AbstractDynamicStructModel
      , _AbstractGenericModel
      , ForeignKey
      , ValueLink
      // , BooleanModel
      // , NumberModel
      , StringModel
      , InternalizedDependency
      , CoherenceFunction
      , keyConstraintError
      , ResourceRequirement
     } from '../metamodel.mjs';

// This could just be _AbstractStructModel so far, however testing the
// inheritance experience with this. It seems to work nicely so we can use
// this as a marker class, and maybe at some point add specific behavior.
export class _BaseLayoutModel extends _AbstractStructModel{}

export const InstalledFontModel = _AbstractGenericModel.createClass('InstalledFontModel')
  , DeferredFontModel = _AbstractGenericModel.createClass('DeferredFontModel')
  , LayoutTypeModel = _AbstractGenericModel.createClass('LayoutTypeModel')// => value will be a concrete _BaseLayoutModel
    // FIXME Make this an Enum! From LAYOUT_GROUPS.keys() (The Symbols) could be strings as well if more feasible.
  , LayoutGroupKeyModel = _AbstractGenericModel.createClass('LayoutGroupKeyModel')
  , AvailableLayoutModel = _AbstractStructModel.createClass(
        'AvailableLayoutModel'
      , ['label', StringModel]
      , ['typeClass', LayoutTypeModel]
      , ['groupKey', LayoutGroupKeyModel]
    )
  , AvailableLayoutsModel = _AbstractOrderedMapModel.createClass('AvailableLayoutsModel', AvailableLayoutModel)
  , AvailableFontsModel = _AbstractOrderedMapModel.createClass('AvailableFontsModel', DeferredFontModel)
  , InstalledFontsModel = _AbstractOrderedMapModel.createClass('InstalledFontsModel', InstalledFontModel)
  , ApplicationModel = _AbstractStructModel.createClass(
        'ApplicationModel'
      , CoherenceFunction.create(['activeState', 'layoutTypeModel'],  function checkTypes({activeState, layoutTypeModel}) {
            // console.info('CoherenceFunction checkTypes activeState', activeState);
            // console.info('CoherenceFunction checkTypes layout', layout);
            const LayoutType = layoutTypeModel.get('typeClass').value
              , WrappedType = unwrapPotentialWriteProxy(activeState).WrappedType
              ;

            // This check could be executed after activeState was
            // metamorphosed with it's current type dependency, but it is not.
            if(WrappedType !== LayoutType)
                // throw new ... ?
                // Actually, this is taken care of when metamorphosing
                // the state. However, if done here, we could also change
                // it in here while still a draft. Would require a public
                // API to do so, however as setting to _value directly is
                // not ideal:
                // Object.defineProperty(activeState, '_value',{
                //      value: LayoutType.createPrimalState(childDependencies)
                //      ...
                // We have a setter: activeState.wrapped = this.WrappedType.createPrimalState(childDependencies)
                // HOWEVER, that also checks for WrappedType which wouldn't
                // work, because that is changed only in metamorphose as well!
                // We should only check for consistency with activeState.constructor.BaseType
                console.warn(`TYPE WARNING activeState wrapped type "${WrappedType.name}" `
                        + `must equal layout type "${layoutTypeModel.get('label').value}" (${LayoutType.name})`);
        })
      , ['availableLayouts', new InternalizedDependency('availableLayouts', AvailableLayoutsModel)]
      , ['activeLayoutKey', new ForeignKey('availableLayouts', ForeignKey.NOT_NULL, ForeignKey.SET_DEFAULT_LAST)]
      , ['layoutTypeModel', new ValueLink('activeLayoutKey')]
      , ['activeState', _AbstractDynamicStructModel.createClass('DynamicLayoutModel'
                            , _BaseLayoutModel, 'layoutTypeModel'
                            // This is a bit of a pain point, however, we
                            // can't collect these dependencies dynamically yet.
                            , ['font', 'installedFonts'])]
      , ['availableFonts', new InternalizedDependency('availableFonts', AvailableFontsModel)]
      , ['installedFonts', new InternalizedDependency('installedFonts', InstalledFontsModel)]
        // The custom constraint is called when targetContainer.has(currentKeyValue) === false
        // currentKeyValue can be undefined as well, initially, ideally
        // we choose a defaultConstraint and resolve it by looking at availableFonts
        //
        // Keeping this to conserve the original thinking leading
        // to the metamorphoseGen approach.
        // The way I see this, a generator/coroutine style is
        // a nice way to resolve this, as it's not really making the
        // metamorphose process async.
        // In some cases, we can keep the orginial metamorphose entry
        // point, but fail (raise) when a resource is missing.
        // The `metamorphose` call would drive the `metamorphoseGen`
        // We could maybe raise at the original yield, to keep the
        // stack trace as close to the problem as possible.
        // Although, there are still unanswered problems! How, for example,
        // do we update targetContainer from within, it should be already
        // immutbale at this point!
        // Ideally, we know before we fixate the target what is required
        // from it, in a way this turns the dependency-tree on it's
        // head. :-/ Making the dependants of the targetContainer the
        // dependencies of its state.
        // The good news so far is, that ForeignKey is the only mechanism
        // that creates the issue.
        // So, pureley speaking:
        //    To finish the targetContainer we need to consider all
        //    of its ForeignKeys.
        //    When the ForeignKeys are resolved, all ValueLinks can be
        //    finalized.
        // Currently, ForeignKey defines targetName as its only member
        // of its dependencies.
        // We should collect all ForeignKeys for a target, make sure
        // their state is satisfying, then move on.
        //
        // One fundamental problem is that metamorphose is called
        // in the constructor, to create a primalState, but we want
        // it to be async, to be able to load the resources when they
        // are missing.
        // It would be very satisfying to ensure the requirements are
        // ready before the metamorphose call, and in the case of
        // createPrimalState (with or without a deserialization value)
        // also.
        //
        // One, rather absurd approach would be to raise a special
        // error in here, catch it in the outermost caller, resolve
        // the dependency, then rebuild the state.
        // The issue with that, is that is thows away the work that
        // has been done until this point, but, it a) ensures the
        // state can be created eventually b) doesn't require a
        // refactoring of the original model.
        // More elegantly, having a generator approach, we suffer the
        // issue that we must return an unfinished object from the
        // constructor, basically a draft but without a good
        // OLD_STATE => that's could be one entry point:
        // primal state can't be constructed from deserialize in all
        // cases ... ?
        // When we "leak" an unfinished primal object, there need to
        // be safeguards to make sure it's not used out of context!
        // IT may be worth a trial...
        //
        //      gen = Model.createPrimalStateGen(...) or draft.metamorphoseGen(...)
        //      // can't send a value on first iteration
        //      let result
        //        , sendInto=undefined
        //        ;
        //      do {
        //         result = gen.next(sendInto);
        //         sendInto = undefined;// don't send again
        //         if(result.value instanceOf ResourceRequirement)
        //             sendInto = await resolve(result.value);
        //      } while(!result.done);
      , ['activeFontKey', new ForeignKey('installedFonts', ForeignKey.NOT_NULL, ForeignKey.CUSTOM,
        function* (targetContainer, currentKeyValue) {
            const key = yield new ResourceRequirement(this, targetContainer, currentKeyValue, ForeignKey.SET_DEFAULT_FIRST);
            if(!targetContainer.has(key)) {
                if(this.allowNull)
                    return ForeignKey.NULL;
                // NOTE: this implies targetContainer can change between
                // yield and its return.
                throw keyConstraintError(new Error(`CONSTRAINT ERROR ${this} Can't set key from requested `
                    + `ResourceRequirement ${key.toString()} is not in targetContainer "${this.targetName}" or NULL.`));
            }
            return key;
        })]
      , ['font', new ValueLink('activeFontKey')] // => provides one FontModel of AvailableFontsModel
    )
  ;

