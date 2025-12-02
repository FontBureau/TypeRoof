import {
    _AbstractStructModel
  , _AbstractListModel
  , _AbstractOrderedMapModel
  , _AbstractDynamicStructModel
  , _AbstractGenericModel
  , _AbstractNumberModel
  , _AbstractSimpleOrEmptyModel
  , _AbstractEnumModel
  , ForeignKey
  , ValueLink
  , StaticDependency
  , StringModel
  , InternalizedDependency
  , createAvailableTypes
  , createDynamicType
  , Path
  , ResourceRequirement
  , CoherenceFunction
  , keyConstraintError
  , deserializeSync
  , SERIALIZE_FORMAT_OBJECT
  , SERIALIZE_OPTIONS
} from '../metamodel.ts';

import {
    createDynamicModel
} from './dynamic-types-pattern.mjs';

import {
    FontSizeModel
  , BooleanDefaultTrueOrEmptyModel
  , openTypeFeaturesModelMixin
  , languageTagModelMixin
  , CSSDirectionOrEmptyModel
  , TextAlignmentOrEmptyModel
} from './actors/models.mjs';

import {
    ColorModel
  , PercentNumberOrEmptyModel
} from './color.mjs';

import {
    manualAxesLocationsModelMixin
} from './ui-manual-axis-locations.mjs';

import {
    InstalledFontsModel
} from './main-model.mjs';

import {
    AxesMathAxisLocationsModel
} from './axes-math.mjs';

import {
    GENERIC
  , ProcessedPropertiesSystemMap
} from './registered-properties-definitions.mjs';

export function validateStyleName(name) {
    // I even allow white-space here, as I don't have so far hard restrictions.
    // However, the empty string is not allowed.
    if(typeof name !== 'string')
        return [false, `StyleName must be string but is typeof ${typeof name}.`];

    if(name.length < 1)
        return [false, `StyleName must be at least 1 char long but styleName.length is ${name.length}. StyleName: "${name}".`];
    return [true, null];
}

export class _BaseStylePatchModel extends _AbstractStructModel {
    static createClass(className, ...definitions) {
        return super.createClass(
            className
          , ...definitions
        );
    }
}

export const LeadingNumberModel = _AbstractNumberModel.createClass('LeadingNumberModel', {defaultValue: 1.3/*, toFixedDigits: 5*/})
  , LeadingNumberOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(LeadingNumberModel)
  , ManualLeadingModel = _AbstractStructModel.createClass(
        'ManualLeadingModel'
      , ['leading', LeadingNumberModel]
    )
  , LineWidthNumberModel = _AbstractNumberModel.createClass('LineWidthNumberModel', {defaultValue: 0})
  , LineWidthLeadingModel = _AbstractStructModel.createClass(
        'LineWidthLeadingModel'
      , ['lineWidth', LineWidthNumberModel]
      , ['leading', LeadingNumberModel]
    )
  , AutoLinearLeadingModel = _AbstractStructModel.createClass(
        'AutoLinearLeadingModel'
      , ['a', LineWidthLeadingModel]
      , ['b', LineWidthLeadingModel]
      , ['minLeading', LeadingNumberOrEmptyModel]
      , ['maxLeading', LeadingNumberOrEmptyModel]
    )
  , {
        LeadingAlgorithmModel
      //, availableLeadingAlgorithmTypes
      //, LEADING_ALGORITHM_TYPE_TO_LEADING_ALGORITHM_TYPE_KEY
      , createLeadingAlgorithm
      , deserializeLeadingAlgorithmModel
    } = createDynamicModel(
        'LeadingAlgorithm'
      , [
            ['ManualLeading', 'Manual', ManualLeadingModel]
          , ['AutoLinearLeading', 'Auto-Linear', AutoLinearLeadingModel]
        ]
    )
   , MarginUnitModel = _AbstractEnumModel.createClass('MarginUnitModel', ['lineHeight', 'em', 'baseEm', 'pt'/*, 'rem' ??? */], 'lineHeight')
   , MarginUnitOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(MarginUnitModel)
   , MarginValueModel = _AbstractStructModel.createClass(
        'MarginValueModel'
        // Hmm if we make this OrEmpty we can inherit the unit, however,
        // a value without unit does not seem to be  a good strategy.
        // much rather, we should
      , ['unit', MarginUnitOrEmptyModel]
        // using PercentNumberOrEmptyModel as all of 'lineHeight', 'em', 'baseEm'
        // are expressible in percentages, BUT, we should also offer
        // pt, in, cm, mm etc. eventually.
      , ['value', PercentNumberOrEmptyModel]

      // WHAT To DO???
      // It's unusual that we put
    // Coherence...
    //     if(unit === isEmpty)
    //         value = empty
    //     else if value.isEmpty // unit is not empty
    //         value = default/0
    )
  , ManualMarginsModel = _AbstractStructModel.createClass(
        'ManualMarginsModel'
      , ['start', MarginValueModel]
      , ['end', MarginValueModel]
    )
    ;
// as defined im actors/models.mjs as typographyKeyMomentPureModelMixin
// which I don't want to include here, as this is no actor, but it may
// come from a shared base eventually, I keep the name for reference
const typographyKeyMomentPureModelMixin = [
        ['baseFontSize', FontSizeModel] // in PT
        // in em i.e. relative to baseFontSize, no unit, will be multiplied with baseFontSize
        // type could be different to FontSizeModel but so far it would
        // be defined the same way.
      , ['relativeFontSize' , FontSizeModel]
      , ['textColor', ColorModel] // inherited from upper layers
      , ['backgroundColor', ColorModel] // not inherited
    ]
  , typographyFontMixin = [
        ['installedFonts', new InternalizedDependency('installedFonts', InstalledFontsModel)]
        // FIXME: the custom constraint is very similar to the
        // font(resource)-loading constraint of main-model "activeFontKey"
        //    => should not be required this way, a central copy would be better!
        // The difference is here the last parameter of new ResourceRequirement
        // is ForeignKey.SET_NULL and for "activeFontKey" it is ForeignKey.SET_DEFAULT_FIRST
        // However, this ForeignKey is set to ALLOW_NULL and "activeFontKey"
        // is set to NOT_NULL.
      , ['activeFontKey', new ForeignKey('installedFonts', ForeignKey.ALLOW_NULL, ForeignKey.CUSTOM,
        function* (targetContainer, currentKeyValue) {
            // With this shortcut we can prevent the yield and this
            // don't fail when running with driveResolverGenSyncFailing.
            if(this.allowNull && (!currentKeyValue || currentKeyValue === ForeignKey.NULL))
                return ForeignKey.NULL;
            const key = yield new ResourceRequirement(this, targetContainer, currentKeyValue,
                // ForeignKey.SET_DEFAULT_FIRST would be very opinionated,
                // it should rather be configured in the key than hard coded
                // in here.
                this.allowNull ? ForeignKey.SET_NULL : ForeignKey.NO_ACTION
            );
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
        // NOTE the fallback is in typographyActorMixin organized
        // via parentFont, but here, the fundamental plan is to use
        // the processedPropertiesSystem/typeSpecnion
      , ['font', new ValueLink('activeFontKey')]
    ]
    // inline styles can set these but e.g. not the text-alignment
    // or line-height. local font em, but not paragraph/section font size
  , typographyInlineMixin = [
        // fontOrEmpty => comes from model.typographyActorMixin
        // should definitely be reused from there! But that has
        // a parentFont and this must not!
        // that's different for the paragraph, that always has a
        // parentFont. so we need diversification!.
        //
        // maybe that can move though.
        //
        // font-size should be in EM, but we don't do units yet
        ...typographyKeyMomentPureModelMixin
      , ...openTypeFeaturesModelMixin
      , ...languageTagModelMixin
    ]
    // in EN
  , ColumnWidthModel = _AbstractNumberModel.createClass('ColumnWidthModel', {min:0, /*max:160,*/ defaultValue: 40, toFixedDigits: 1})
  , ColumnWidthOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(ColumnWidthModel)
  , typographyParagraphMixin = [
    /*
        alignment

      => indent
      => alignment->settings?
      => top-bottom margins
    */

        // will become more complex as we add multiple columns, but, as a
        // start, this is a single column document,
        // We have an algorithm decision on amount of columns/gap/size etc.
        // that needs to be configured. So eventually I think at this level
        // we'll decide about the overall approach, not the detailed values
        // if the overall approach is fully manual, columnWidth will be
        // configured as part of that structure. Similar also line-heigth.
        // will be within a sub-struct.
        ['columnWidth', ColumnWidthOrEmptyModel] // default 39 EN  {min: 10, max: 160, step: 1, value: 40}
      , ['leading', LeadingAlgorithmModel]
      , ['blockMargins', ManualMarginsModel] // direction block i.e. start === top end === bottom
      , ['direction', CSSDirectionOrEmptyModel]
      , ['textAlign', TextAlignmentOrEmptyModel]
      // CSS hyphens=auto without a lang tag won't work as expected!
      // , ['hyphens', HyphensOrEmptyModel] auto, manual, none
    ]
  ;

// Styles, Colors and Actors start of here very similar, this was initially based
// on the Actor model system.
// FIME: change to use createDynamicModel
export const StylePatchTypeModel = _AbstractGenericModel.createClass('StylePatchTypeModel')// => .value will be a concrete _BaseStyleModel
    // make this selectable...
  , AvailableStylePatchTypeModel = _AbstractStructModel.createClass(
        'AvailableStylePatcheTypeModel'
      , ['label', StringModel]
      , ['typeClass', StylePatchTypeModel]
    )
  , AvailableStylePatchTypesModel = _AbstractOrderedMapModel.createClass('AvailableStylePatchTypesModel', AvailableStylePatchTypeModel)
  , SimpleStylePatchModel = _BaseStylePatchModel.createClass(
        'SimpleStylePatchModel'
        // There's no reason to put these under another key
        // TypeSpec and this should use the same mixin, as the shared
        // definitions are the ones that can be overridden by a patch.
      , ...typographyInlineMixin
        // I'm including autoOPSZ similar as in ManualAxesLocationsModel
        // It is OrEmpty, as the StylePatch must be completely transparent
        // i.e. it must be possible to set nothing and then have no effect
        // here.
        // The Coherence function is meant to remove unnecessary data from
        // the state.
      , ['axesLocations', AxesMathAxisLocationsModel] // the items are AxesMathAxisLocationValueModel
      , ['autoOPSZ', BooleanDefaultTrueOrEmptyModel]
      , CoherenceFunction.create(['autoOPSZ', 'axesLocations'],
        function sanitizeAxes({autoOPSZ, axesLocations}) {
            if(!autoOPSZ.isEmpty && autoOPSZ.value)
                axesLocations.delete('opsz');
        })// => [name, instance]
      , ...typographyFontMixin
    )
  , StylePatchKeyModel = StringModel // or KeyValueModel or somethign custom?
  , StylePatchKeysModel = _AbstractListModel.createClass('StylePatchKeysModel', StylePatchKeyModel)
    // This links the StylePatches from the StylePatchesMapModel into the TypeSpecs:
    //      * Keys are names in the TypeSpec.
    //      * Values are the keys in StylePatchesMapModel.
    //      # It would be nice to have the values formally declared as keys
    //        into the StylePatchesMapModel, but the constraint would be
    //        FOREIGN_KEY_NO_ACTION as I want to keep the information
    //        around, in case an entry is added again which akes the link
    //        valid again. E.g. the missing target could be because the
    //        StylePatches are being restructured by the user and I don't
    //        want to remove information that will be useful again.
    //       *
  , StylePatchLinksMapModel = _AbstractOrderedMapModel.createClass('StylePatchLinksMapModel'
            , StylePatchKeyModel
            , { validateKeyFn: validateStyleName }
    )
  , CompositeStylePatchModel = _BaseStylePatchModel.createClass(
        'CompositeStylePatchModel'
        // keys that don't exist become null entries, so maybe these
        // don't have to be actual linked keys? It would be nice though
        // to produce the actual list of styles directly in here.
        //
        // Going to start with a list of strings unless there's a
        // reasonable way to get the final, composites resolved, list
        // of keys.
        // So far, we don't have a way to embed such a custom getter
        // into a

        // FIXME: could we define a list of keys into
           // the dependency "stylePatches" of the parent TypeSpecRampModel // a StylePatchesMapModel
           // and SET_NULL + ALLOW_NULL seems not possible to me now, but I can look it up
           // we could read the styles directly, but I don't see how dependencies are
           // resolved smartly on metamorphose.
      , ['styles', StylePatchKeysModel]
        // selfNull may be better to handle in editing situations
        // but it also allows for inconsistencies to exist, we could offer
        // a cleanup-button, maybe when conflicts are detected.
    //  , ['circularDependencyStrategy', Enum(allNull, selfNull)]
    )
  , availableStylePatchesDefinitions = [
        ['SimpleStylePatch', 'Simple', SimpleStylePatchModel]
      , ['CompositeStylePatch', 'Composite', CompositeStylePatchModel]
    ]
  , [availableStylePatchTypes, STYLE_PATCH_TYPE_TO_STYLE_PATCH_TYPE_KEY] =
        createAvailableTypes(AvailableStylePatchTypesModel, availableStylePatchesDefinitions)
  , StylePatchModel = _AbstractStructModel.createClass(
        'StylePatchModel'
      , ... StaticDependency.createWithInternalizedDependency(
                        'availableStylePatchTypes'
                      , AvailableStylePatchTypesModel
                      , availableStylePatchTypes
                      )
      , ['stylePatchTypeKey', new ForeignKey('availableStylePatchTypes', ForeignKey.ALLOW_NULL, ForeignKey.SET_NULL)]
      , ['stylePatchTypeModel', new ValueLink('stylePatchTypeKey')]
      , ['instance', _AbstractDynamicStructModel.createClass('DynamicStylePatchModel'
                            , _BaseStylePatchModel
                            ,'stylePatchTypeModel' // this becomes a special dependency name
                            // This is a bit of a pain point, however, we
                            // can't collect these dependencies dynamically yet:
                            , ['availableStylePatchTypes', 'font', 'installedFonts'])]
    )
    // This contains the actual StylePatchModel data
  , StylePatchesMapModel = _AbstractOrderedMapModel.createClass('StylePatchesMapModel'
            , StylePatchModel
            // Order itself has no inherent semantik meaning, hence this
            // could be ordered alphabetically in the data to make it
            // predictable easier for UIs. At some point, natural ordering
            // and a model to store visual ordering preferences could be
            // even better.
            // Users might have a bigger value by ordering these by their
            // own system/requirements, skipping data-level automatic ordering
            // for now.
            //, {ordering: _AbstractOrderedMapModel.ORDER.KEYS_ALPHA}
            , { validateKeyFn: validateStyleName }
            )
    // A recursive definition!
    // , TypeSpecMap = _AbstractOrderedMapModel.createClass('TypeSpecMap', TypeSpec)
  , TypeSpecModel = _AbstractStructModel.createClass(
        'TypeSpec'
      , ...typographyParagraphMixin // there's no reason to put these under another key
      , ...typographyInlineMixin
      , ...manualAxesLocationsModelMixin
      , ...typographyFontMixin
        // Is this just for easy access?? "named styles" maybe?
        // , ['styles', dict mapping the style name to the style key, though, we could also just allow all "patches" in any style] // subordnate styles
        // Just a thought, if we'd use a 'parents' list we could create
        // a mixin-like situation, with multiple inheritance.
        // => TypeSpecModelMap: Ordered dict of TypeSpecs (we want to use the keys as paths)
      , ['children', _AbstractStructModel.WITH_SELF_REFERENCE, TypeSpecModel=>_AbstractOrderedMapModel.createClass('TypeSpecModelMap', TypeSpecModel)]
      , ['label', StringModel]
      , ['stylePatchesSource', new InternalizedDependency('stylePatchesSource', StylePatchesMapModel)]
        // To be able to reference the available patches, we should include
        // a dependency to the StylePatchesMapModel keys within that are
        // where the keys can be identifiers like "italic", "quote", "strong", "code"
        // and the values are keys in TypeSpecRampModel/stylePatches
        // if the key does not exist it's a null style, no need
        // to set null, the style just doesn't do anything. That way editing
        // is simple as well. Like FOREIGN_KEY_NO_ACTION
        // It could be desirable to add describing labels instead of using
        // the keys as description, however, this way it should be simpler
        // to implement initially.
      , ['stylePatches', StylePatchLinksMapModel]
    )
  ;

export function getStylePatchFullLabel(typeKey) {
    return availableStylePatchTypes.get(typeKey).get('label').value;
}

export function createStylePatch(typeKey, dependencies) {
    return createDynamicType(StylePatchModel, 'stylePatchTypeKey', typeKey, dependencies);
}

/**
 * LeadingAlgorithmModel is represented by UILeadingAlgorithm
 * an UITypeDrivenContainer and that initalizes for 'instance',
 * which is an _AbstractDynamicStructModel, an UIDynamicStruct
 *
 * LeadingAlgorithmModel requires a select to choose the algorithm.
 * That is initialized in here.
 * NOTE: _changeTypeHandler is highly specific but the rest could
 * posssibly be a generic solution, linking option and value etc.
 * would have to be configured for the GenericSelect.
 *
 *
 * It seems to me that it would be good to use _provisionWidgets in here
 * to select the ui for  "ManualLeading" or "AutoLinearLeading"
 * i.e. AutoLinearLeadingModel or LeadingNumberModel
 * the latter can be handled just like any number model.
 * So, this would not! initialize UIDynamicStruct for 'instance',
 * instead look at the type of instance and initialize that directly.
 * The big difference being that UIDynamicStruct is maybe too generic
 * to know the details about it's possible types...
 * Which is funny, because all the UITypeDrivenContainer initializes in
 * here is the UIDynamicStruct! (and the label, fuck the label)
 */

export function getLineWidthLeadingPPSMap(parentPPSRecord/*, FieldType*/) {
    const entries = [];
    for(const [modelFieldName/*, modelFieldType */] of LineWidthLeadingModel.fields.entries()) {
        let prefix = GENERIC
          , fullKey = null
          , registryKey = null
          ;
        //if(modelFieldName === 'maxLeading' || modelFieldName === 'minLeading') {
        fullKey = `${parentPPSRecord.propertyRoot}${modelFieldName}`;
        //}
        const entry = [
            modelFieldName
          , ProcessedPropertiesSystemMap.createSimpleRecord(prefix, modelFieldName, fullKey, registryKey)
        ];
        entries.push(entry);
    }
    return Object.freeze(new ProcessedPropertiesSystemMap(entries));
}

// FIXME: looks like a very useful pattern, maybe put into metamodel?
// It's a bit too specific maybe??
function _deserializeModel(Model, dependencies, data) {
     const serializeOptions = Object.assign({}, SERIALIZE_OPTIONS, {format: SERIALIZE_FORMAT_OBJECT});
    return deserializeSync(Model, dependencies, data, serializeOptions);
}
export const deserializeManualMarginsModel = _deserializeModel.bind(null, ManualMarginsModel);
