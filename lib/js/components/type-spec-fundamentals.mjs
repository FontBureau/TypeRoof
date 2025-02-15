
import {
    identity
} from '../util.mjs';

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
  , NumberModel
  , InternalizedDependency
  , createAvailableTypes
  , createDynamicType
  , Path
  , ResourceRequirement
  , keyConstraintError
} from '../metamodel.mjs';

import {
    FontSizeModel
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
} from './basics.mjs';

import {
    DynamicTag
  , GenericSelect
  , WasteBasketDropTarget
} from './generic.mjs';

import {
    InstalledFontsModel
} from './main-model.mjs';

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

            // => .value will any a concrete _BaseModel
            // it would be good to check these.
export const GenericTypeModel = _AbstractGenericModel.createClass('GenericTypeModel')
  , AvailableTypeModel = _AbstractStructModel.createClass(
        'AvailableTypeModel'
      , ['label', StringModel]
      , ['typeClass', GenericTypeModel]
    )
  , AvailableTypesModel = _AbstractOrderedMapModel.createClass('AvailableTypesModel', AvailableTypeModel)
  , LeadingNumberModel = _AbstractNumberModel.createClass('LeadingNumberModel', {defaultValue: 1.3/*, toFixedDigits: 5*/})
  , LeadingNumberOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(LeadingNumberModel)
  , LineWidthLeadingModel = _AbstractStructModel.createClass(
        'AutoLinearLeadingModel'
      , ['lineWidth', NumberModel]
      , ['leading', LeadingNumberModel]
    )
  , AutoLinearLeadingModel = _AbstractStructModel.createClass(
        'AutoLinearLeadingModel'
      , ['a', LineWidthLeadingModel]
      , ['b', LineWidthLeadingModel]
      , ['minLeading', LeadingNumberOrEmptyModel]
      , ['maxLeading', LeadingNumberOrEmptyModel]
    )
  , [availableLeadingAlgorithmTypes, LEADING_ALGORITHM_TYPE_TO_LEADING_ALGORITHM_TYPE_KEY] =
        createAvailableTypes(AvailableTypesModel, [
            ['ManualLeading', 'Manual', NumberModel]
          , ['AutoLinearLeading', 'Auto-Linear', AutoLinearLeadingModel]
        ])
  , LeadingAlgorithmModel = _AbstractStructModel.createClass(
        'LeadingAlgorithmModel'
      , ... StaticDependency.createWithInternalizedDependency(
                        'availableLeadingAlgorithmTypes'
                      , AvailableTypesModel
                      , availableLeadingAlgorithmTypes
                      )
      , ['leadingAlgorithmTypeKey', new ForeignKey('availableLeadingAlgorithmTypes', ForeignKey.ALLOW_NULL, ForeignKey.SET_NULL)]
      , ['leadingAlgorithmModel', new ValueLink('leadingAlgorithmTypeKey')]
      , ['instance', _AbstractDynamicStructModel.createClass('DynamicLeadingAlgorithmModel'
                            , 'availableLeadingAlgorithmTypes'
                            , 'leadingAlgorithmModel' // this becomes a special dependency name
                            // This is a bit of a pain point, however, we
                            // can't collect these dependencies dynamically yet:
                            , ['availableLeadingAlgorithmTypes'])]
    )
// as defined im actors/models.mjs as typographyKeyMomentPureModelMixin
// which I don't want to include here, as this is no actor, but it may
// come from a shared base eventually, I keep the name for reference
 ,  typographyKeyMomentPureModelMixin = [
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
      , ...manualAxesLocationsModelMixin
    ]
    // in EN
  , ColumnWidthModel = _AbstractNumberModel.createClass('ColumnWidthModel', {min:0, max:160, defaultValue: 40, toFixedDigits: 1})
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
      , ...typographyInlineMixin//  is the KeyMoment version useful here
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
  , [availableStylePatchTypes, STYLE_PATCH_TYPE_TO_STYLE_PATCH_TYPE_KEY] =
        createAvailableTypes(AvailableStylePatchTypesModel, [
            ['SimpleStylePatch', 'Simple', SimpleStylePatchModel]
          , ['CompositeStylePatch', 'Composite', CompositeStylePatchModel]
        ])
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
        // when a key do if the key does not exist it's a null style, no need
        // to set null, the style just doesn't do anything. That way editing
        // is simple as well. Like FOREIGN_KEY_NO_ACTION
        // It could be desirable to add describing labels instead of using
        // the keys as description, however, this way it should be simpler
        // to implement initially.
      , ['stylePatches', StylePatchLinksMapModel]
    )
  ;

/**
 * a and b are coordinates (heigth: line heigth 1===fontSize, width: line width in EN)
 */
function runion_01_lineHeight (a, b, lineWidthEn) {
    const lineHeightWidthRatio = (b.height - a.height) / (b.width - a.width) // m == slope ==0.2 / 32
      , lhIntercept = a.height - (lineHeightWidthRatio * a.width) // b == yIntercept == 0.89375
      , rawLineHeight = lineHeightWidthRatio * lineWidthEn + lhIntercept // m * x + b
        // could be different:
      , totalMinLineHeigth = a.height
      , totalMaxLineHeight = b.height
      ;
    return Math.min(totalMaxLineHeight, Math.max(totalMinLineHeigth, rawLineHeight));
}

export function createLeadingAlgorithm(typeKey, dependencies) {
    return createDynamicType(LeadingAlgorithmModel, 'leadingAlgorithmTypeKey', typeKey, dependencies);
}

export function createStylePatch(typeKey, dependencies) {
    return createDynamicType(StylePatchModel, 'stylePatchTypeKey', typeKey, dependencies);
}


class StylePatchesKeyCreateSelect extends GenericSelect {
    static NULL_SELECT_VALUE = '';

    constructor(widgetBus, baseClass, labelContent, allowNull=[], onChangeFn=null) {
        const optionGetLabel = null;// default is like: (key/*, value*/)=>key;
        super(widgetBus, baseClass, labelContent, optionGetLabel, allowNull, onChangeFn)
    }
    _changeSelectedValueHandler(/*event*/) {
        // const value = this.getEntry('value'); <= this version doesn't use a 'value' dependency
        // value.set(this._select.value);
        const value = this._allowNull && this._select.value === this.constructor.NULL_SELECT_VALUE
            ? this._nullModelValue
            : this._select.value
        ;
        if(this._onChangeFn)
            this._onChangeFn(value);
    }

    _updateOptions(availableOptions) {
        super._updateOptions(availableOptions);
        // If selected value is no longer in options.
        if(this._select.selectedIndex == -1) {
            // select first option
            this._select.options[0].selected = true;
            // trigger change
            // CAN'T DO THIS as this is within a change cycle
            //but in this special case we can call directly...
            this._changeSelectedValueHandler();
        }
    }
}


class StylePatchesKeyChangeSelect extends StylePatchesKeyCreateSelect {
    // use space initially as this can't be a style patch key, these are
    // always trimmed.
    static CUSTOM_SELECT_VALUE = ' (custom)';
    constructor(widgetBus, baseClass, labelContent, allowNull, onChangeFn) {
        super(widgetBus, baseClass, labelContent, allowNull, onChangeFn);
        this._originalOptionGetLabel = this._optionGetLabel;
        this._optionGetLabel = identity;
    }

    _updateOptions(availableOptions) {
        const initialValue = this._select.value
          , options = []
          ;

        options.push([this.constructor.CUSTOM_SELECT_VALUE, '(custom)'])
        for (const [key, value] of availableOptions) {
            const label =  this._originalOptionGetLabel(key, value);
            options.push([key, label]);
        }

        this._populateSelect(options);
        const optgroupSpecial = this._domTool.createElement('optgroup')
          , optgroupExisting = this._domTool.createElement('optgroup')
          , allOptions = [...this._select.options]
          ;
        optgroupSpecial.label = 'Special Options';
        optgroupExisting.label = 'Existing Style-Patches'
        this._select.append(optgroupSpecial, optgroupExisting);
        // null and custom
        optgroupSpecial.append(...allOptions.slice(0, 2));
        optgroupExisting.append(...allOptions.slice(2));
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
         else if(availableOptions.has(modelValue))
            this._select.value = modelValue;
        else
            this._select.value = this.constructor.CUSTOM_SELECT_VALUE;

        this._onChangeFn(this._select.value);
    }

    async _changeSelectedValueHandler(/*event*/) {
        if(this._select.value !== this.constructor.CUSTOM_SELECT_VALUE) {
            const value = this._allowNull && this._select.value === this.constructor.NULL_SELECT_VALUE
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


const EMPTY_LINK_LABEL = '(NULL-STYLE)';
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
                    ? availableStylePatchTypes.get(typeKey).get('label').value
                    : '[NULL]'
              ;
            this.element.textContent = `${sourceKey || EMPTY_LINK_LABEL} — ${typeLabel}`;
        }
    }
}

class UIStylePatchLinksValueInput extends UIBaseMapKey {
    set display(value) {
        this.element.style.display = value ? '' : 'none';
    }

    update(changedMap){
        if(this.isFocused())
            return;
        if(changedMap.has('value'))
            this.value = changedMap.get('value').value;
    }
}

// Requires a select to change to existing styles.
// Allow to enter custom names that don't exist, e.g. as placeholders
// for future/potential styles. The latter feature is complicated, as
// when we enter an existing name, we dont want to switch to the select
// immediately.
class UIStylePatchLinksValue extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        // run super first, so we can use `this` in the widgets definition.
        const localZoneElement = widgetBus.domTool.createElement('div', {
                'class': 'ui_style_patches_links_map-item_value'
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
              , {'class': 'ui_style_patches_links_map-item_value-value_label'}
            ]
          , [
                {   zone: 'local'
                  , id: 'key-change-link-select'
                }
              , [
                    [sourceMapPath, 'options']
                  , [sourceKeyPath, 'value']
                ]
              , StylePatchesKeyChangeSelect
              , 'ui_style_patches_links_map-item_value-change_select'// baseClass
              , ''// labelContent
              , [true, EMPTY_LINK_LABEL, '']// allowNull
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
                    if(selectValue === StylePatchesKeyChangeSelect.CUSTOM_SELECT_VALUE) {
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
            ]
          , [
                {   zone: 'local'
                  , id: 'key-change-link-input'
                }
              , [
                    [sourceKeyPath, 'value']
                ]
              , UIStylePatchLinksValueInput
              , [ // event handlers
                    ['input', this._valueInputChangeHandler.bind(this)]
                  , ['blur', this._valueInputBlurHandler.bind(this)]
                ]
              , {rootClass: 'ui_style_patches_links_map-item_value-change_input'}
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

class UIStylePatchesLinksMapCreate extends _UIBaseMap.UIKeyCreate /* is UIBaseMapKeyCreate */ {
    constructor(widgetBus, eventHandlers, options={}, ...args) {
        const labelContent = widgetBus.domTool.createElement('span', {'class': 'typeroof-ui-label'}, ' as style name ')
          , rootClass = 'ui_style_patches_links_map-create_input'
          , _options = {labelContent, rootClass, ...options};
        super(widgetBus, eventHandlers, _options, ...args);
    }
}

export class UIStylePatchesLinksMap extends _UIBaseMap {
//class UIStylePatchesMap extends _UIBaseMap {
    // jshint ignore: start
    static ROOT_CLASS = `ui_style_patches_links_map`
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS]
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
              , StylePatchesKeyCreateSelect
              , 'ui_style_patches_links_map-create_select'// baseClass
              , 'Link Style-Patch'// labelContent
              , [true, EMPTY_LINK_LABEL]// allowNull
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
    // jshint ignore: end
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
                this._zones
            ]
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }

    _createKeyValue(childrenOrderedMap) {
        const stylePatchSelect = this.getWidgetById('key-create-link-select')
        const keyItem = StylePatchKeyModel.createPrimalDraft(childrenOrderedMap.dependencies);
        keyItem.value = stylePatchSelect._select.value;
        return keyItem;
    }
}
