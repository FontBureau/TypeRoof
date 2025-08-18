import {
    _AbstractStructModel
  , _AbstractListModel
  , _AbstractOrderedMapModel
  , _AbstractDynamicStructModel
  , _AbstractGenericModel
  , _AbstractNumberModel
  , _AbstractSimpleOrEmptyModel
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
  , getEntry
} from '../metamodel.mjs';

import {
    createDynamicModel
} from './dynamic-types-pattern.mjs';

import {
    GENERIC
  , ProcessedPropertiesSystemMap
} from './registered-properties-definitions.mjs';

import {
    _BaseTypeDrivenContainerComponent
} from './type-driven-ui-basics.mjs';

import {
    FontSizeModel
  , BooleanDefaultTrueOrEmptyModel
} from './actors/models.mjs';

import {
    ColorModel
} from './color.mjs';

import {
    manualAxesLocationsModelMixin
} from './ui-manual-axis-locations.mjs';

import {
    DATA_TRANSFER_TYPES
} from './data-transfer-types.mjs';

import {
   _BaseContainerComponent
 , _UIBaseMap
 , UIBaseMapKey
 , _BaseDynamicCollectionContainerComponent
} from './basics.mjs';

import {
    DynamicTag
  , GenericSelect
  , WasteBasketDropTarget
} from './generic.mjs';

import {
    InstalledFontsModel
} from './main-model.mjs';

import {
    AxesMathAxisLocationsModel
} from './axes-math.mjs';

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
    );
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
      // , optentypeFeatures
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
      //, // line-height auto, or value, auto may have configuration as well
      //  ['leading', ] // auto or number
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
    // In order to formalize structures like AvailableStylePatchTypeModel
    // I don't want to add a "shortLabel" to it, so here I go with a new
    // map.
  , availableStylePatchesShortLabel = new Map()
  , availableStylePatchesDefinitions = [
        ['SimpleStylePatch', 'Simple', '⨀', SimpleStylePatchModel]
      , ['CompositeStylePatch', 'Composite', '⨁', CompositeStylePatchModel]
    ].map(([key, label, shortLabel,Type])=>{
        // side effect, but it keeps the definitions compact.
        availableStylePatchesShortLabel.set(key, shortLabel)
        return [key, label, Type];
    })
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
    const longLabel = availableStylePatchTypes.get(typeKey).get('label').value
      , shortLabel = availableStylePatchesShortLabel.get(typeKey)
      ;
    return shortLabel ? `${shortLabel} ${longLabel}` : longLabel;
}

/**
 * a and b are coordinates (heigth: line heigth 1===fontSize, width: line width in EN)
 */
export function runion_01_lineHeight (a, b, lineWidthEn, totalMinLineHeigth=null, totalMaxLineHeight=null) {
    const lineHeightWidthRatio = (b.leading - a.leading) / (b.lineWidth - a.lineWidth) // m == slope ==0.2 / 32
      , lhIntercept = a.leading - (lineHeightWidthRatio * a.lineWidth) // b == yIntercept == 0.89375
      , rawLineHeight = lineHeightWidthRatio * lineWidthEn + lhIntercept // m * x + b
      , min = totalMinLineHeigth === null ? Math.min(b.lineWidth, a.lineWidth) : totalMinLineHeigth
      , max = totalMaxLineHeight === null ? Math.max(b.lineWidth, a.lineWidth) : totalMaxLineHeight
      ;

    if(isNaN(rawLineHeight))
        // It could return something like 1 or 1.3, but this way, at least
        // it's much more obvious that something went wrong.
        // I wonder if we could fix it with e.g. setting meaningful value
        // ranges in the lineWidth type definitions.
        return 0;
    return Math.min(max, Math.max(min, rawLineHeight));
}


export function createStylePatch(typeKey, dependencies) {
    return createDynamicType(StylePatchModel, 'stylePatchTypeKey', typeKey, dependencies);
}

class LinksMapKeyCreateSelect extends GenericSelect {
    constructor(widgetBus, baseClass, labelContent, optionGetLabel=null, allowNull=[], onChangeFn=null, optionGetGroup=null, optionsGen=null) {
        // widgetBus, baseClass, labelContent, optionGetLabel=null, allowNull=[], onChangeFn=null, optionGetGroup=null, optionsGen=null
        super(widgetBus, baseClass, labelContent, optionGetLabel, allowNull, onChangeFn, optionGetGroup, optionsGen)
    }

    _changeSelectedValueHandler(/*event*/) {
        // const value = this.getEntry('value'); <= this version doesn't use a 'value' dependency
        // value.set(this._select.value);
        const value = this.isNullValue
            ? this._nullModelValue
            : this._select.value
        ;
        if(this._onChangeFn)
            this._onChangeFn(value);
    }

    _updateOptions(availableOptions) {
        super._updateOptions(availableOptions);
        // If selected value is no longer in options.
        if(availableOptions !== null && this._select.selectedIndex === -1) {
            // select first option
            this._select.options[0].selected = true;
            // trigger change
            // CAN'T DO THIS as this is within a change cycle
            //but in this special case we can call directly...
            this._changeSelectedValueHandler();
        }
    }
}

class LinksMapKeyChangeSelect extends LinksMapKeyCreateSelect {
    // use space initially as this can't be a style patch key, these are
    // always trimmed.
    static CUSTOM_SELECT_VALUE = ' (custom)';
    // TODO: In this the StylePatches case, this can easily be a string,
    // as the actual value is a metamodel type. not sure about the
    // NodeSpecToTypeSpec case. In general, probably, the will always
    // be metamodel type, e.g. StringModel
    // but I, right now, don't understand how this, or the CUSTOM_SELECT_VALUE
    // avoid colisions! Prefixing should be more effective.
    // For the case of links to typeSpec, so far these are either '' the
    // rootpath, or they contain slashes as path separators, we can't have
    // custom names so far. So, yet, it is not possible to create colisions
    // but custom path parts names for typeSpecs will make this more likely.
    //
    // A default prefix for regular values could help.
    //
    // Postponing this until I have the NodeSpec to TypeSpec case, and
    // then, I'll see the urgency.
    static CUSTOM_SELECT_MODEL_VALUE = ' (custom model)';
    constructor(widgetBus, baseClass, labelContent, optionGetLabel=null, allowNull=[], onChangeFn=null, optionGetGroup=null, optionsGen=null, optionsHas=null) {
        super(widgetBus, baseClass, labelContent, optionGetLabel, allowNull, onChangeFn, optionGetGroup, optionsGen);
        if(optionsHas)
            this._optionsHas = optionsHas;
    }

    _optionsHas(availableOptions, value) {
        return availableOptions.has(value);
    }

    _updateOptions(availableOptions) {
        const initialValue = this._select.value
          , options = []
          ;

        options.push([this.constructor.CUSTOM_SELECT_VALUE /*key*/, this.constructor.CUSTOM_SELECT_MODEL_VALUE /*value*/, '(custom)' /*label*/])
        if(availableOptions !== null /*which can be the case on initialization*/) {
            for(const [key, value] of this._optionsGen(availableOptions)) {
                const label =  this._optionGetLabel(key, value);
                options.push([key, value, label]);
            }
        }

        this._populateSelect(options);
        this._select.value = initialValue;

        // If selected value may no longer be in options.
        const modelValue = this.getEntry('value').value;
        this._updateSelectValue(modelValue, availableOptions);
    }

    _updateValue(activeValue) {
        const availableOptions = this.getEntry('options');
        const modelValue = activeValue.value;
        this._updateSelectValue(modelValue, availableOptions);
    }

    checkValue() {
        const availableOptions = this.getEntry('options');
        const modelValue = this.getEntry('value').value;
        this._updateSelectValue(modelValue, availableOptions);
    }

    _updateSelectValue(modelValue, availableOptions) {
        if(modelValue === this._nullModelValue)
            this._select.value = this.constructor.NULL_SELECT_VALUE;
         else if(availableOptions !== null && this._optionsHas(availableOptions, modelValue))
            this._select.value = modelValue;
        else
            this._select.value = this.constructor.CUSTOM_SELECT_VALUE;

        this._onChangeFn(this._select.value);
    }

    async _changeSelectedValueHandler(/*event*/) {
        if(!this.isCustom) {
            const value = this.isNullValue
                ? this._nullModelValue
                : this._select.value
                ;
                // this should eventually trigger _updateValue
                await this._changeState(()=>this.getEntry('value').set(value));
        }
        this._onChangeFn(this._select.value);
    }

    get isCustom() {
        return this._select.value === this.constructor.CUSTOM_SELECT_VALUE;
    }
}


const EMPTY_STYLE_LINK_LABEL = '(NULL-STYLE)'
  , EMPTY_TYPESPEC_LINK_LABEL = '(NULL-TYPESPEC)'
  ;
class UIStylePatchLinksValueLabel extends DynamicTag {
    update(changedMap) {
        if(changedMap.has('data') || changedMap.has('sourceMap')) {
            const sourceKey = (changedMap.has('data')
                    ? changedMap.get('data')
                    : this.getEntry('data')).value
              , sourceMap = (changedMap.has('sourceMap')
                    ? changedMap.get('sourceMap')
                    : this.getEntry('sourceMap'))
              , stylePatch = sourceMap.has(sourceKey)
                            ? sourceMap.get(sourceKey)
                            : null
              , typeKey = stylePatch && stylePatch.get('stylePatchTypeKey').value
              , typeLabel = typeKey
                    ? getStylePatchFullLabel(typeKey)
                    : '[NULL]'
              ;
            this.element.textContent = `${sourceKey || EMPTY_STYLE_LINK_LABEL} – ${typeLabel}`;
        }
    }
}

class UILinksMapValueInput extends UIBaseMapKey {
    set display(value) {
        this.element.style.display = value ? '' : 'none';
    }

    update(changedMap) {
        if(this.isFocused())
            return;
        if(changedMap.has('value'))
            this.value = changedMap.get('value').value;
    }
}


function stylePathchLinksOptionGetGroup(value/* the model value*/) {
    // return [groupKey, label, index];
    if(this._allowNull && value === this._nullModelValue
                        || value === this.constructor.CUSTOM_SELECT_MODEL_VALUE)
        return ['special', 'Special Options', 0];
    else
        return ['regular', 'Existing Style-Patches', 1];
}

// Requires a select to change to existing styles.
// Allow to enter custom names that don't exist, e.g. as placeholders
// for future/potential styles. The latter feature is complicated, as
// when we enter an existing name, we dont want to switch to the select
// immediately.
class UIStylePatchLinksValue extends _BaseContainerComponent {
    constructor(widgetBus, _zones, optionGetLabel=null, optionsGen=null) {
        // run super first, so we can use `this` in the widgets definition.
        const localZoneElement = widgetBus.domTool.createElement('div', {
                'class': 'ui_links_map-item_value'
                // required so css selector :focus-within can be used
              , 'tabindex': '0'
            })
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        super(widgetBus, zones);
        this._insertElement(localZoneElement);

        const sourceKeyPath = this.widgetBus.getExternalName('sourceKey')
           , sourceMapPath = this.widgetBus.getExternalName('sourceMap')
           ;

        const widgets = [
            [
                {zone: 'local'}
              , [
                    [sourceKeyPath, 'data']
                  , [sourceMapPath, 'sourceMap']
                ]
              , UIStylePatchLinksValueLabel
              , 'span'
              , {'class': 'ui_links_map-item_value-value_label'}
            ]
          , [
                {   zone: 'local'
                  , id: 'key-change-link-select'
                }
              , [
                    [sourceMapPath, 'options']
                  , [sourceKeyPath, 'value']
                ]
              , LinksMapKeyChangeSelect
              , 'ui_links_map-item_value-change_select'// baseClass
              , '' // labelContent
              , optionGetLabel // optionGetLabel=null || optionGetLabel(key, value)=>label
              , [true, EMPTY_STYLE_LINK_LABEL, '']// allowNull: [allowNull, allowNullLabel, nullModelValue]
                // onChangeFn=null
                // As a suggestion, it makes sense to re-use the
                // targetKey name, e.g. "italic" => "italic".
                // The following code tries to differentiate between a
                // user entered/manipulated name vs. one that was set
                // via this automatism.
              , (selectValue)=>{
                    const keyInput = this.getWidgetById('key-change-link-input', null)
                      , keySelect = this.getWidgetById('key-change-link-select', null)
                      ;
                    if(keyInput === null)
                        // Not ready yet.
                        return;
                    if(selectValue === LinksMapKeyChangeSelect.CUSTOM_SELECT_VALUE) {
                        // => Show the custom input.
                        keyInput.display = true;
                        keyInput.value = this.getEntry('sourceKey').value
                        // maybe only if select is focused!
                        if(keySelect.isFocused())
                            keyInput.focus();
                    }
                    else {
                        if(!keyInput.isFocused())
                            keyInput.display = false;
                    }
                }
              , stylePathchLinksOptionGetGroup // optionGetGroup=null
              , optionsGen // optionsGen=null
              , null // , optionsHas=null
            ]
          , [
                {   zone: 'local'
                  , id: 'key-change-link-input'
                }
              , [
                    [sourceKeyPath, 'value']
                ]
              , UILinksMapValueInput
              , [ // event handlers
                    ['input', this._valueInputChangeHandler.bind(this)]
                  , ['blur', this._valueInputBlurHandler.bind(this)]
                ]
              , {rootClass: 'ui_links_map-item_value-change_input'}
            ]
        ];
        this._initWidgets(widgets);
    }

    async _valueInputChangeHandler(/* event */) {
        const keyInput = this.getWidgetById('key-change-link-input');
        return await this._changeState(()=>this.getEntry('sourceKey').set(keyInput.value));
    }

    _valueInputBlurHandler(/* event */) {
        // if select is not custom
        const select = this.getWidgetById('key-change-link-select')
          , keyInput = this.getWidgetById('key-change-link-input')
          ;

        // NOTE: the value may be available in the select, we took
        // over control. but now we must give it back.
        // this is especially if we didn't change anything.
        select.checkValue();
        if(!select.isCustom)
            keyInput.display = false;
    }
}


function typeSpecHas(typeSpec, path) {
    return !!getEntry(typeSpec, path, false);
}

// As this is not about StylePatchLinks anymore, sourceMap should be
// renamed to something else (rootTypeSpec)
class UIStyleNodeToTypeSpecValueLabel extends DynamicTag {
    update(changedMap) {
        if(changedMap.has('data') || changedMap.has('sourceMap')) {
            const path = (changedMap.has('data')
                    ? changedMap.get('data')
                    : this.getEntry('data')).value
              , rootTypeSpec = (changedMap.has('sourceMap')
                    ? changedMap.get('sourceMap')
                    : this.getEntry('sourceMap'))
              // TODO/FIXME: so here we have to differentiate between
              // absolute paths, where the root will be rootTypeSpec
              // and relative paths, where the root will have to be resolved
              // relative to the root typeSpec of the parent Node, i.e.
              // later in the process.
              // At the moment all path are relative.
              , typeSpec = getEntry(rootTypeSpec, path, null)
              , label = typeSpec === null
                        ? EMPTY_TYPESPEC_LINK_LABEL
                        : typeSpecGetRawLabel(path, typeSpec)
              ;

            // FIXME: can't decide whether it's an explicit NULL or root
            // as root is the empty path and NULL as well!
            // NOT FOUND is good, except the empty path matches root.
            // I wonder if it makes sense to have an explicit null path,
            // e.g. one that can't be a path within a typeSpec. Maybe in
            // this case, null/not found may happen, but an explicit
            // NULL-option is not making sense.
            this.element.textContent = _typeSpecFullLabel(path, label);
        }
    }
}

// created from a copy of UIStylePatchLinksValue which is similar, but
// the NodeToTypeSpec case requires some changed behavior!
// keeping the css class names so far.
// I hope shared behavior becomes obvious.
class UINodeToTypeSpecLinksValue extends _BaseContainerComponent {
    constructor(widgetBus, _zones, optionGetLabel=null, optionsGen=null) {
        // run super first, so we can use `this` in the widgets definition.
        const localZoneElement = widgetBus.domTool.createElement('div', {
                'class': 'ui_links_map-item_value'
                // required so css selector :focus-within can be used
              , 'tabindex': '0'
            })
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        super(widgetBus, zones);
        this._insertElement(localZoneElement);

        const sourceKeyPath = this.widgetBus.getExternalName('sourceKey')
           , sourceMapPath = this.widgetBus.getExternalName('sourceMap')
           ;

        const widgets = [
            [
                {zone: 'local'}
              , [
                    [sourceKeyPath, 'data']
                  , [sourceMapPath, 'sourceMap']
                ]
              , UIStyleNodeToTypeSpecValueLabel
              , 'span'
              , {'class': 'ui_links_map-item_value-value_label'}
            ]
          , [
                {   zone: 'local'
                  , id: 'key-change-link-select'
                }
              , [
                    [sourceMapPath, 'options']
                  , [sourceKeyPath, 'value']
                ]
              , LinksMapKeyChangeSelect
              , 'ui_links_map-item_value-change_select'// baseClass
              , '' // labelContent
              , optionGetLabel // optionGetLabel=null || optionGetLabel(key, value)=>label
              , []//[true, EMPTY_TYPESPEC_LINK_LABEL, '']// allowNull: [allowNull, allowNullLabel, nullModelValue]
                // onChangeFn=null
                // As a suggestion, it makes sense to re-use the
                // targetKey name, e.g. "italic" => "italic".
                // The following code tries to differentiate between a
                // user entered/manipulated name vs. one that was set
                // via this automatism.
              , (selectValue)=>{
                    const keyInput = this.getWidgetById('key-change-link-input', null)
                      , keySelect = this.getWidgetById('key-change-link-select', null)
                      ;
                    if(keyInput === null)
                        // Not ready yet.
                        return;
                    if(selectValue === LinksMapKeyChangeSelect.CUSTOM_SELECT_VALUE) {
                        // => Show the custom input.
                        keyInput.display = true;
                        keyInput.value = this.getEntry('sourceKey').value
                        // maybe only if select is focused!
                        if(keySelect.isFocused())
                            keyInput.focus();
                    }
                    else {
                        if(!keyInput.isFocused())
                            keyInput.display = false;
                    }
                }
              , null // optionGetGroup=null
              , optionsGen // optionsGen=null
              , typeSpecHas // , optionsHas=null
            ]
          , [
                {   zone: 'local'
                  , id: 'key-change-link-input'
                }
              , [
                    [sourceKeyPath, 'value']
                ]
              , UILinksMapValueInput
              , [ // event handlers
                    ['input', this._valueInputChangeHandler.bind(this)]
                  , ['blur', this._valueInputBlurHandler.bind(this)]
                ]
              , {rootClass: 'ui_links_map-item_value-change_input'}
            ]
        ];
        this._initWidgets(widgets);
    }

    async _valueInputChangeHandler(/* event */) {
        const keyInput = this.getWidgetById('key-change-link-input');
        return await this._changeState(()=>this.getEntry('sourceKey').set(keyInput.value));
    }

    _valueInputBlurHandler(/* event */) {
        // if select is not custom
        const select = this.getWidgetById('key-change-link-select')
          , keyInput = this.getWidgetById('key-change-link-input')
          ;

        // NOTE: the value may be available in the select, we took
        // over control. but now we must give it back.
        // this is especially if we didn't change anything.
        select.checkValue();
        if(!select.isCustom)
            keyInput.display = false;
    }
}


class _UILinksMapCreate extends _UIBaseMap.UIKeyCreate /* is UIBaseMapKeyCreate */ {
    static labelText = '(uninitialized)';
    constructor(widgetBus, eventHandlers, options={}, ...args) {
        const labelContent = widgetBus.domTool.createElement('span', {'class': 'typeroof-ui-label'}, new.target.labelText)
          , rootClass = 'ui_links_map-create_input'
          , _options = {labelContent, rootClass, ...options};
        super(widgetBus, eventHandlers, _options, ...args);
    }
}

class UIStylePatchesLinksMapCreate extends _UILinksMapCreate {
    static labelText = ' as style name ';
}

class UINodeToTypeSpecLinksMapCreate extends _UILinksMapCreate {
    static labelText = ' to a NodeSpec ';
}

export class UIStylePatchesLinksMap extends _UIBaseMap {
    static ROOT_CLASS = `ui_links_map`
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS, 'ui_links_map']
    static TYPE_CLASS_PART = null;
    static VISUAL_ORDER_STRATEGY = _UIBaseMap.VISUAL_ORDER_STRATEGY_NATURAL;
    static UIKeyCreate = UIStylePatchesLinksMapCreate;
    static KEY_ADD_BUTTON_LABEL = 'create';
    static KEY_DATA_TRANSFER_TYPE = DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_LINK_PATH;


    constructor(...args) {
        super(...args);
        // required so css selector :focus-within can be used
        this._zones.get('tools').setAttribute('tabindex', '0');
    }

    _validateKeyString(key) {
        const [valid, message] = super._validateKeyString(key);
        if(!valid)
            return [valid, message];
        return validateStyleName(key);
    }

    get _initialWidgets() {
        const selectState = {lastSelectedValue: null}
          , select = [
                {   zone: 'tools'
                  , id: 'key-create-link-select'
                }
              , [
                    [this.widgetBus.getExternalName('sourceMap') , 'options']
                  // , ['activeLayoutKey', 'value'] => it doesn't track a value
                ]
              , LinksMapKeyCreateSelect
              , 'ui_links_map-create_select'// baseClass
              , 'Link a Style'// labelContent
              , null// optionGetLabel=null || optionGetLabel(key, value)=>label
              , [true, EMPTY_STYLE_LINK_LABEL, '']// allowNull: [allowNull, allowNullLabel, nullModelValue]
                // As a suggestion, it makes sense to re-use the
                // targetKey name, e.g. "italic" => "italic".
                // The following code tries to differentiate between a
                // user entered/manipulated name vs. one that was set
                // via this automatism.
              , (targetKey) => { // onChangeFn
                    // either a string or null
                    const keyNameInput = this.getWidgetById('key-create-input')
                      , currentKeyNameInputValue = keyNameInput.value
                      ;
                    let allowAutoValue = false;
                    // inputWidget.reset(); is called when an entry
                    // is submitted, then the input field value is ''
                    if(currentKeyNameInputValue === '') {
                        // empty input is always OK to override
                        selectState.lastSelectedValue = null;
                        allowAutoValue = true;
                    }
                    else if(currentKeyNameInputValue === selectState.lastSelectedValue) {
                        // When the current value matches the previous
                        // selected value we set the current value to
                        // the newly selected value.
                        allowAutoValue = true;
                    }

                    if(targetKey !== null) {
                        if(allowAutoValue) {
                            // if targetKey === null we skip this, as
                            // there's nothing to set the field to, in fact
                            // maybe the current value is desired.
                            keyNameInput.value = targetKey;
                            keyNameInput.focus();
                            const addButton = this.getWidgetById('key-add-button');
                            // these are to reset the restriction coming
                            // from a former validation.
                            keyNameInput.setCustomValidity('');
                            addButton.passive = false;
                        }

                        // Turns the automatic back on if we lost track due
                        // to a manual change. The user has to select the
                        // value that is keyNameInput.value.
                        selectState.lastSelectedValue = targetKey;
                    }
                }
              , stylePathchLinksOptionGetGroup // optionGetGroup=null
            ]
          , wasteBasket = [
                {zone: 'local'}
              , [
                    ['.', 'rootCollection']
                ]
              , WasteBasketDropTarget
              , 'Delete Style'
              , ''
              , [
                    this.constructor.KEY_DATA_TRANSFER_TYPE
                ]
            ]
          ;

        const widgets = super._initialWidgets;
        widgets.splice(0, 0, select);
        widgets.push(wasteBasket);
        return widgets;
    }

    _createWrapperValue(keyId, key) {
        const childWidgetBus = this._childrenWidgetBus
          , settings = {
                rootPath: Path.fromParts(this.widgetBus.getExternalName('childrenOrderedMap'))
              , relativeRootPath: Path.fromParts('.', key)//Path.fromParts('.', key)
              , zone: keyId
            }
          , sourceMapPath = this.widgetBus.getExternalName('sourceMap')
          , dependencyMappings = [
                    ['.', 'sourceKey']
                  , [sourceMapPath, 'sourceMap']
                ]
             // Should be a really simple item maybe displaying the label
             // Maybe we could edit the label.
             // But rather it is just to select, on click and to display
             // as selected, e.g. bold label
          , Constructor = UIStylePatchLinksValue
          , args = [
                this._zones, null, null
            ]
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }

    _createKeyValue(childrenOrderedMap) {
        const linkSelect = this.getWidgetById('key-create-link-select')
          ,  keyItem = childrenOrderedMap.constructor.Model.createPrimalDraft(childrenOrderedMap.dependencies)
          ;
        keyItem.value = linkSelect.value;
        return keyItem;
    }
}


function typeSpecGetRawLabel(pathStr, typeSpec) {
    return typeSpec.get('label').value || '[no label]'
}

function _typeSpecFullLabel(pathStr, label) {
    const isRoot = pathStr === '';
    return `${isRoot ? '[root]' : pathStr} :: ${label}`;
}

function typeSpecGetOptionLabel(pathStr, typeSpec) {
    const label = typeSpecGetRawLabel(pathStr, typeSpec);
    return _typeSpecFullLabel(pathStr, label);
}

function* typeSpecOptionsGen(typeSpec, path=Path.fromParts(Path.ROOT)) {
    // I believe depth first is the best way to traverse this
    // as it creates a natural representation of the tree data.
    // yield this
    const key = `${path}`;
    yield [key, typeSpec];
    // yield children
    const children = typeSpec.get('children');
    for(const [key, value] of children)
        yield * typeSpecOptionsGen(value, path.append('children', key));
}

/**
 * This is very similar to UIStylePatchesLinksMap with some differences
 * as well. Importantly, the `sourceMap` (a TypeSpec) is not a map!
 * Hence, we can't extract keys that way and also can't query them using get.
 *
 * In this configuration we map "NodeSpec to TypeSpec"
 * The directionality is not necessarily obvious, but
 * NodeSpec is the key as a nodeSpec can only have one
 * TypeSpec, TypeSpec is the value as we can have multiple
 * NodeSpecs use the same TypeSpec.
 * However, the "TypeSpec" is called the "source", so
 * source and target may not be the right words.
 * sourceMap is inherited from UIStylePatchesLinksMap
 * maybe we need to change that in here.
 *
 * ['./nodeSpecToTypeSpec', 'childrenOrderedMap']
 * ['./typeSpec', 'sourceMap'] // these are the values of the map
 * ['./nodeSpec', 'targetMap'] // these are the keys of the map
 *
 * Initially based on a copy of UIStylePatchesLinksMap but to be able to
 * model the desired behavior more freely this may now duplicate some
 * code.
 * TODO: evaluate if a common base/shared code is feasible
 * i.e. UILinksMap OR _UIBaseLinksMap.
 */
export class UINodeSpecToTypeSpecLinksMap extends _UIBaseMap {
    static ROOT_CLASS = `ui_links_map`
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS, 'ui_links_map']
    static TYPE_CLASS_PART = null;
    static VISUAL_ORDER_STRATEGY = _UIBaseMap.VISUAL_ORDER_STRATEGY_NATURAL;
    static UIKeyCreate = UINodeToTypeSpecLinksMapCreate;
    static KEY_ADD_BUTTON_LABEL = 'create';
    static KEY_DATA_TRANSFER_TYPE = DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_LINK_PATH;


    constructor(...args) {
        super(...args);
        // required so css selector :focus-within can be used
        this._zones.get('tools').setAttribute('tabindex', '0');
    }

    _validateKeyString(key) {
        const [valid, message] = super._validateKeyString(key);
        if(!valid)
            return [valid, message];
        return validateStyleName(key);
    }

    get _initialWidgets() {
        const selectState = {lastSelectedValue: null}
          , select = [
                {   zone: 'tools'
                  , id: 'key-create-link-select'
                }
              , [
                    [this.widgetBus.getExternalName('sourceMap') , 'options']
                  // , ['activeLayoutKey', 'value'] => it doesn't track a value
                ]
              , LinksMapKeyCreateSelect
              , 'ui_links_map-create_select'// baseClass
              , 'Link a Type-Spec'// labelContent
              , typeSpecGetOptionLabel// optionGetLabel=null || optionGetLabel(key, value)=>label
              , []// [true, EMPTY_TYPESPEC_LINK_LABEL]// allowNull: [allowNull, allowNullLabel, nullModelValue]
                // As a suggestion, it makes sense to re-use the
                // targetKey name, e.g. "italic" => "italic".
                // The following code tries to differentiate between a
                // user entered/manipulated name vs. one that was set
                // via this automatism.
              , (targetKey) => { // onChangeFn
                    // either a string or null
                    const keyNameInput = this.getWidgetById('key-create-input')
                      , currentKeyNameInputValue = keyNameInput.value
                      ;
                    let allowAutoValue = false;
                    // inputWidget.reset(); is called when an entry
                    // is submitted, then the input field value is ''
                    if(currentKeyNameInputValue === '') {
                        // empty input is always OK to override
                        selectState.lastSelectedValue = null;
                        allowAutoValue = true;
                    }
                    else if(currentKeyNameInputValue === selectState.lastSelectedValue) {
                        // When the current value matches the previous
                        // selected value we set the current value to
                        // the newly selected value.
                        allowAutoValue = true;
                    }

                    if(targetKey !== null) {
                        if(allowAutoValue) {
                            // if targetKey === null we skip this, as
                            // there's nothing to set the field to, in fact
                            // maybe the current value is desired.
                            keyNameInput.value = targetKey;
                            keyNameInput.focus();
                            const addButton = this.getWidgetById('key-add-button');
                            // these are to reset the restriction coming
                            // from a former validation.
                            keyNameInput.setCustomValidity('');
                            addButton.passive = false;
                        }

                        // Turns the automatic back on if we lost track due
                        // to a manual change. The user has to select the
                        // value that is keyNameInput.value.
                        selectState.lastSelectedValue = targetKey;
                    }
                }
              , null // optionGetGroup=null || optionGetGroup(value)=>[groupKey, label, index]
                // optionsGen=null || optionsGen(availableOptions) => ...[key, value]
              , typeSpecOptionsGen

            ]
          , wasteBasket = [
                {zone: 'local'}
              , [
                    ['.', 'rootCollection']
                ]
              , WasteBasketDropTarget
              , 'Delete Style'
              , ''
              , [
                    this.constructor.KEY_DATA_TRANSFER_TYPE
                ]
            ]
          ;

        const widgets = super._initialWidgets;
        widgets.splice(0, 0, select);
        widgets.push(wasteBasket);
        return widgets;
    }

    _createWrapperValue(keyId, key) {
        const childWidgetBus = this._childrenWidgetBus
          , settings = {
                rootPath: Path.fromParts(this.widgetBus.getExternalName('childrenOrderedMap'))
              , relativeRootPath: Path.fromParts('.', key)//Path.fromParts('.', key)
              , zone: keyId
            }
          , sourceMapPath = this.widgetBus.getExternalName('sourceMap')
          , dependencyMappings = [
                    ['.', 'sourceKey']
                  , [sourceMapPath, 'sourceMap']
                ]
             // Should be a really simple item maybe displaying the label
             // Maybe we could edit the label.
             // But rather it is just to select, on click and to display
             // as selected, e.g. bold label
          , Constructor = UINodeToTypeSpecLinksValue
          , args = [
                this._zones
              , typeSpecGetOptionLabel
              , typeSpecOptionsGen // optionsGen
            ]
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }

    _createKeyValue(childrenOrderedMap) {
        const linkSelect = this.getWidgetById('key-create-link-select')
          ,  keyItem = childrenOrderedMap.constructor.Model.createPrimalDraft(childrenOrderedMap.dependencies)
          ;
        keyItem.value = linkSelect.value;

        return keyItem;
    }
}


// It's painful, but it seems there could be a circular dependency when trying to
// use this within genericTypeToUIElement
//
// At least, it seems like this could not be imported from type-spec-fundamentals
// while also using UITypeDrivenContainer, but maybe the imports are smart???
// at least, UILeadingAlgorithm must be available within genericTypeToUIElement
// not before.
//
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

function getManualLeadingPPSMap(parentPPSRecord/*, FieldType*/) {
    const entries = [];
    for(const [modelFieldName/*, modelFieldType */] of ManualLeadingModel.fields.entries()) {
        let prefix = GENERIC
          , fullKey = null
          , registryKey = null
          ;
        if(modelFieldName === 'leading')
            fullKey = `${parentPPSRecord.propertyRoot}line-height-em`;
        else
            fullKey = `${parentPPSRecord.propertyRoot}${modelFieldName}`;
        const entry = [
            modelFieldName
          , ProcessedPropertiesSystemMap.createSimpleRecord(prefix, modelFieldName, fullKey, registryKey)
        ];
        entries.push(entry);
    }
    return Object.freeze(new ProcessedPropertiesSystemMap(entries));
}

function getAutoLinearLeadingPPSMap(parentPPSRecord/*, FieldType*/) {
    const entries = [];
    for(const [modelFieldName/*, modelFieldType */] of AutoLinearLeadingModel.fields.entries()) {
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

function _getPPSMapForModel(FieldType, ppsRecord) {
    let fn;
    if(FieldType === ManualLeadingModel)
        fn = getManualLeadingPPSMap
    else if(FieldType === AutoLinearLeadingModel)
        fn = getAutoLinearLeadingPPSMap
    else
        throw new Error(`KEY ERROR unknown FieldType "${FieldType.name}".`);
    return fn(ppsRecord, FieldType);
}

 // NOTE: this mixes in _BaseTypeDrivenContainerComponent
export class UILeadingAlgorithm extends _BaseDynamicCollectionContainerComponent {
    constructor(widgetBus, _zones, injectable, ppsRecord) {
        // run super first, so we can use `this` in the widgets definition.
        const localZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_leading-algorithm_container'})
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;

        // When using StaticNode via widgets, it's not inserted right away.
        // and the position is lost relative to the sibling widgets to the
        // end of the container.
        // zones.get('main').append(localZoneElement);
        widgetBus.insertElement(localZoneElement);
        super(widgetBus, zones);

        this._injectable = injectable;
        this._ppsRecord = ppsRecord;
        this._ActiveInstanceType = null;
        // const TypeClass =  this.widgetBus.getEntry(this.widgetBus.rootPath).constructor;
        // const widgets = this._defineWidgets(TypeClass, injectable, propertyRootOrPPSMap, label);
        // this._initWidgets(widgets);
        {
            const widgets = this._initialWidgets;
            this._initialWidgetsAmount = widgets.length;
            this._initWidgets(widgets); // put widgetWrappers into this._widgets
        }
    }

    get _initialWidgets() {
        const widgets = [
                // Maybe this label should be optional, at least,
                // it feels like it should rather not be part
                // of a "generic" container.
                // [
                //     {zone: 'local'}
                //   , []
                //   , StaticTag
                //   , 'h4'
                //   , {}
                //   , [`Olá ${this}`]
                // ]
                [
                    {
                        zone: 'local'
                      //, activationTest: ()=>this._displaySettings
                    }
                  , [
                        ['availableLeadingAlgorithmTypes', 'options'] // maybe we can determine this by the AvailableTypesModel in the internalized dependency
                      , ['leadingAlgorithmTypeKey', 'value']
                    ]
                  , GenericSelect
                  , 'ui_leading_algorithm_select'// baseClass
                  , 'Leading Algorithm'// labelContent
                  , (key, availableType)=>{ return availableType.get('label').value; } // optionGetLabel
                  , [true, '(inherited)', ForeignKey.NULL] // [allowNull, allowNullLabel, nullModelValue]
                    // This could try to convert the previous algorithm type
                    // to this, but that seems at the moment complex for
                    // some combinations.
                    // Called within _changeState.
                  , this._changeTypeHandler.bind(this, this._injectable.getDefaults, this._ppsRecord) // onChangeFn(newValue)
                ]
            ]
          ;
        return widgets;
    }

    _provisionWidgets() {
        const removedDynamicWidgets = this._widgets.splice(this._initialWidgetsAmount, Infinity);
        // Run _BaseContainerComponent._provisionWidgets this for the
        // initial/reguluar widgets. NOTE: _BaseDynamicCollectionContainerComponent
        // does not inherit from _BaseContainerComponent, thus we can't call
        // super. But the implementation is OK.
        const requiresFullInitialUpdate = _BaseContainerComponent.prototype._provisionWidgets.call(this);
        const host = this.getEntry('.')
          , dynInstance = host.get('instance')
          , FieldType = dynInstance.hasWrapped
                            ? dynInstance.WrappedType
                            : null
           ;

        if(FieldType === null) {
            // pass
            // Will remove all dynamic widgets.
        }
        else if(this._ActiveInstanceType === FieldType) {
            // don't change
            this._widgets.push(...removedDynamicWidgets);
            removedDynamicWidgets.splice(0, Infinity);
        }
        else { // this._ActiveInstanceType !== FieldType
            const ppsMap = _getPPSMapForModel(FieldType, this._ppsRecord)
              , widgetDefinitions = this._defineGenericWidgets(
                    FieldType
                  , fieldName=>FieldType.fields.has(fieldName) // basically all allowed
                  , {zone: 'local', rootPath: this.widgetBus.rootPath.append('instance')}
                  , ppsMap
                  , this._injectable
                )
              ;
            this._initWidgets(widgetDefinitions); // pushes into this._widgets
        }
        this._ActiveInstanceType = FieldType;
        for(const widgetWrapper of removedDynamicWidgets)
            this._destroyWidget(widgetWrapper);
        for(const widgetWrapper of this._widgets.slice(this._initialWidgetsAmount)) {
            const isActive = widgetWrapper.widget !== null;
            if(!isActive) {
                // if new, initialize ..
                this._createWidget(widgetWrapper);
                requiresFullInitialUpdate.add(widgetWrapper);
            }
        }
        return requiresFullInitialUpdate;
    }

    _changeTypeHandler(getDefaults, ppsRecord, newValue) {
        const getStateInstances=()=>{
            const hostDraft = this.getEntry(this.widgetBus.rootPath.parent)
              , fieldName = this.widgetBus.rootPath.parts.at(-1)
              , wrapper = hostDraft.get(fieldName).get('instance')
              ;
            return {hostDraft, fieldName, wrapper};
        }
        if(newValue === ForeignKey.NULL)
            return;
        // newValue is either 'ManualLeading' or 'AutoLinearLeading'
        if(newValue === 'ManualLeading') {
            //  Get the current value of leading/leading/line-height-em and use it.
            const lineHeightPPSRecord = ProcessedPropertiesSystemMap.createSimpleRecord(ppsRecord.propertyRoot, 'line-height-em')
              , lineHeight = getDefaults(lineHeightPPSRecord, null/*fieldName not required here*/, null)
              ;
            if(lineHeight !== null) {
                const {hostDraft, fieldName, wrapper} = getStateInstances()
                  , newInstance = createLeadingAlgorithm(newValue, wrapper.dependencies)
                  ;
                newInstance.get('instance').get('leading').value = lineHeight;
                hostDraft.set(fieldName, newInstance);
                return;
            }
            // else: try to get a default via the below
        }
        // Using a default because leading algorithms can't be easily
        // converted into each other (auto to manual would work but manual
        // to auto would be really hard and useless). It's different to color,
        // where there's always a conversion from one to another.
        const defaultPPSRecord = ProcessedPropertiesSystemMap.createSimpleRecord(ppsRecord.prefix, `@${newValue}`)
          , defaultValue = getDefaults(defaultPPSRecord, null/*fieldName not required here*/, null)
          ;
        if(defaultValue === null)
            return;
        const {hostDraft, fieldName, wrapper} = getStateInstances()
          , newInstance = deserializeLeadingAlgorithmModel(wrapper.dependencies, defaultValue)
          ;
        if(newValue !== newInstance.get('leadingAlgorithmTypeKey').value)
            // This is a sanity check, it's not necessarily required to
            // ensure the app is working, but at this point the assertion
            // is that the defaultValue produces a type that aligns
            // with newValue.
            throw new Error(`ASSERTION FAILED new instance should be a "${newInstance}" `
                    + `but it's a  "${newInstance.get('leadingAlgorithmTypeKey').value}"`);
        hostDraft.set(fieldName, newInstance);
    }
}
// Like a Mixin
for(const [name, desc] of Object.entries(Object.getOwnPropertyDescriptors(
                            _BaseTypeDrivenContainerComponent.prototype))) {
    if(!Object.hasOwn(UILeadingAlgorithm.prototype, name))
        Object.defineProperty(UILeadingAlgorithm.prototype, name, desc);
}
