import {
    ForeignKey
  , Path
  , getEntry
} from '../metamodel.mjs';

import {
    getStylePatchFullLabel
  , validateStyleName
  , LineWidthLeadingModel
  , ManualLeadingModel
  , AutoLinearLeadingModel
  , createLeadingAlgorithm
  , deserializeLeadingAlgorithmModel
} from './type-spec-models.mjs';

import {
    GENERIC
  , ProcessedPropertiesSystemMap
} from './registered-properties-definitions.mjs';

import {
    _BaseTypeDrivenContainerComponent
} from './type-driven-ui-basics.mjs';

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

class LinksMapKeyCreateSelect extends GenericSelect {
    constructor(widgetBus, baseClass, labelContent, optionGetLabel=null, allowNull=[], onChangeFn=null, optionGetGroup=null, optionsGen=null) {
        // widgetBus, baseClass, labelContent, optionGetLabel=null, allowNull=[], onChangeFn=null, optionGetGroup=null, optionsGen=null
        super(widgetBus, baseClass, labelContent, optionGetLabel, allowNull, onChangeFn, optionGetGroup, optionsGen)
    }

    _changeSelectedValueHandler(/*event*/) {
        // this version doesn't use a 'value' dependency
        if(this._onChangeFn)
            this._onChangeFn(this.value);
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
            // FIXME: it looks to me, that modelValue should be mapped to
            // select value (key) in here. select can't have modelValue...
            // FIXME: modelValue seems to be complicated in general in
            // the GenericSelect line and requires a review.
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
                    const keyNameInput = this.getWidgetById('key-create-input', null)
                    if(keyNameInput === null)
                        // too early in the life-cycle
                        return;
                    const currentKeyNameInputValue = keyNameInput.value;
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
              , 'Drop here to delete style'
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


class LinksMapTargetKeyCreateSelect extends GenericSelect {
    static CUSTOM_SELECT_VALUE = ' (custom)'; // we don't allow un-trimmed values
    static CUSTOM_SELECT_MODEL_VALUE = ' (custom model)'; // we don't really have a model here???

    constructor(widgetBus, baseClass, labelContent, optionGetLabel=null, allowNull=[], onChangeFn=null, optionGetGroup=null, optionsGen=null) {
        // widgetBus, baseClass, labelContent, optionGetLabel=null, allowNull=[], onChangeFn=null, optionGetGroup=null, optionsGen=null
        super(widgetBus, baseClass, labelContent, optionGetLabel, allowNull, onChangeFn, optionGetGroup, optionsGen);
    }

    get RESET_OPTION_INDEX() {
        // keep current if it is not disabled
        // if current is custom, it's not that easy! But in that case
        // We fall back to the default behavior of choosing custom last.
        if(this._select.selectedIndex !== -1) {
            const option = this._select.options[this._select.selectedIndex];
            if(option.disabled !== true && option.value !== this.constructor.CUSTOM_SELECT_VALUE)
                return this._select.selectedIndex;

        }
        // By default return -1, like a not-found, if the custom option is
        // not an opportunity.
        let customOptionIndex = -1;
        for (let index=0,l=this._select.options.length; index<l; index++) {
            const option = this._select.item(index);

            // return the first not disabled index
            if(option.disabled)
                continue;

            // if it's the custom index, that's the last reset option
            if(option.value === this.constructor.CUSTOM_SELECT_VALUE) {
                customOptionIndex = index;
                continue;
            }

            return index;
        }
        return customOptionIndex;
    }

    _changeSelectedValueHandler(/*event*/) {
        // Here's no change of a persisted model value, as it is creation
        // phase.
        // This performs validation
        this._onChangeFn(this.value);
    }

    isEnabledOption(value) {
        for (let index=0,l=this._select.options.length; index<l; index++) {
            const option = this._select.item(index);
            if(option.value !== value)
                continue;
            // we found the option
            return !option.disabled;
        }
        // is not an option at all
        return false;
    }

    _updateRestrictions(restrictionsMap) {
        for(const option of this._select.options)
            option.disabled = restrictionsMap.has(option.value);
    }

    _updateOptions(availableOptions, restrictionsMap) {
        const initialValue = this._select.value
          , options = []
          ;
        if(availableOptions !== null /*which can be the case on initialization*/) {
            for(const [key, value] of this._optionsGen(availableOptions)) {
                const label = this._optionGetLabel(key, value);
                options.push([key, value, label]);
            }
        }
        this._populateSelect(options);
        this._select.value = initialValue;
        this._updateRestrictions(restrictionsMap);
    }

    update(changedMap) {
        const oldValue = this._select.value
          , optionsMap = changedMap.has('options')
                ? changedMap.get('options')
                : this.getEntry('options')
          , restrictionsMap = changedMap.has('restrictions')
                ? changedMap.get('restrictions')
                : this.getEntry('restrictions')
          ;
        this._updateOptions(optionsMap, restrictionsMap);
        // will call _onChangeFn
        super.reset();
        if(oldValue !== this._select.value)
            this._onChangeFn(this._select.value);
    }

    get isCustom() {
        return this._select.value === this.constructor.CUSTOM_SELECT_VALUE;
    }

    reset() {
        const oldValue = this._select.value;
        super.reset();
        if(oldValue !== this._select.value)
            this._onChangeFn(this._select.value);
    }
}

// created from a copy of UINodeToTypeSpecLinksValue (which was from the
// origin of UIStylePatchLinksValue)
// I hope shared behavior becomes obvious.
// This offers a <select> of available options.
// Some options, if used already, are going to be disabled.
// There is a "custom" option which opens an <input type="text"> where
// a custom target value can be entered. Thus, it will be possible to
// create items that don't exist!
// Also the text-input won't be allowed to override existing options.
class LinksMapTargetKeyCreate extends _BaseContainerComponent {
    static UIKeySelect = LinksMapTargetKeyCreateSelect;
    constructor(widgetBus, _zones, baseClass, parentCheck=null, submitHandler=null) {
        // run super first, so we can use `this` in the widgets definition.
        const localZoneElement = widgetBus.domTool.createElement('div', {
                'class': baseClass
                // required so css selector :focus-within can be used
              , 'tabindex': '0'
            })
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        super(widgetBus, zones);
        this._lastSelectedNoneCustomSelectionValue = '';
        this._insertElement(localZoneElement);
        this._parentCheckCallback = parentCheck;
        this._submitHandler=submitHandler;

        const optionsMapPath = this.widgetBus.getExternalName('options')
           , restrictionsMapPath = this.widgetBus.getExternalName('restrictions')
           ;

        const widgets = [
             [
                {   zone: 'local'
                  , id: 'key-create-link-select'
                }
              , [
                    [optionsMapPath, 'options']
                  , [restrictionsMapPath, 'restrictions']
                ]
              , this.constructor.UIKeySelect
              , 'ui_links_map-key_create-select' // baseClass
              , 'Link a NodeSpec' // labelContent
              , null // optionGetLabel=null
              , [] // allowNull: [allowNull=false, allowNullLabel, nullModelValue]
              , (selectValue)=> { // onChangeFn => this validates
                    const keyInput = this.getWidgetById('key-create-link-input', null)
                      , keySelect = this.getWidgetById('key-create-link-select', null)
                      ;
                    if(selectValue !== this.constructor.UIKeySelect.CUSTOM_SELECT_VALUE)
                        this._lastSelectedNoneCustomSelectionValue = selectValue;

                    if(keyInput === null)
                        // Not ready yet.
                        return;
                    if(selectValue === this.constructor.UIKeySelect.CUSTOM_SELECT_VALUE) {
                        // => Show the custom input.
                        keyInput.display = true;

                        // ideally the value is the last selected value
                        // before we changed to custom, but that might be
                        // outdated as well, when the last value is not
                        // an option anymore (because it's taken or it has
                        // vanished)
                        const value = keySelect.isEnabledOption(this._lastSelectedNoneCustomSelectionValue)
                                ? this._lastSelectedNoneCustomSelectionValue
                                : ''
                                ;
                        keyInput.value = value;
                        // only if select is focused!
                        if(keySelect.isFocused())
                            keyInput.focus();
                    }
                    else {
                        keyInput.display = false;
                    }
                    // _customInputChangeHandler calls parentCheck,
                    // this causes a rather disturbing validation message
                    // while processing a new value
                    // this._parentCheck();
                }
              , (value/* the model value!!*/) => { // optionGetGroup=null
                        // return [groupKey, label, index];
                    if(value === this.constructor.UIKeySelect.CUSTOM_SELECT_MODEL_VALUE)
                        return ['special', 'Special Options', 0];
                    else
                        return ['regular', 'Existing Node-Types', 1];
                }
              , this.constructor.optionsGen.bind(this.constructor) // optionsGen
            ]
          , [
                {   zone: 'local'
                  , id: 'key-create-link-input'
                }
                , []
                , UIBaseMapKey
                , [ // event handlers
                      ['input', this._customInputChangeHandler.bind(this)]
                    , ['blur', this._customInputBlurHandler.bind(this)]
                    , (this._submitHandler!==null
                            ? ['keyup', event=>{if (event.key === 'Enter') {this._submitHandler(event);};}]
                            : null
                       )
                  ].filter(eh=>eh!==null)
                , {rootClass: 'ui_links_map-key_create-custom_input'}
            ]
        ];
        this._initWidgets(widgets);
    }

    static *optionsGen(availableOptionsMap) { //optionsGen=null
        yield [this.UIKeySelect.CUSTOM_SELECT_VALUE /*key*/, this.UIKeySelect.CUSTOM_SELECT_MODEL_VALUE /*value*/];

        // then: => const label = this._optionGetLabel(key, value);
        for(const key of availableOptionsMap.keys()) {
            yield [key, key]; // => [key, value]
        }
    }

    async _customInputChangeHandler(/* event */) {
        this._parentCheck();
    }

    _parentCheck() {
        if(this._parentCheckCallback)
            this._parentCheckCallback();
    }

    _customInputBlurHandler(/* event */) {
        // if select is not custom
        const keySelect = this.getWidgetById('key-create-link-select')
          , keyInput = this.getWidgetById('key-create-link-input')
          ;

        // NOTE: the value may be available in the select, we took
        // over control. but now we must give it back.
        // this is especially if we didn't change anything.

        // TODO: should this call check the value state?  this._parentCheck(); ???
        if(!keySelect.isCustom)
            keyInput.display = false;
    }

    // Only checks if keySelect is already available
    get hasValue() {
        const keySelect = this.getWidgetById('key-create-link-select', null);
        return keySelect !== null;
    }

    get value() {
        const keyInput = this.getWidgetById('key-create-link-input')
          , keySelect = this.getWidgetById('key-create-link-select')
          ;

        return keySelect.isCustom
            ? keyInput.value
            : keySelect.value
    }

    // from GenericSelect
    //
    // NOTE how this is used to reset the custom validity
    //
    // Don't call reset if the current selected value is important or
    // implement get RESET_OPTION_INDEX => this._select.selectedIndex
    // reset() {
    //     this._select.value = this._select.item(this.RESET_OPTION_INDEX)?.value || null;
    //     this._select.setCustomValidity('');
    // }

    reset() {
        const keySelect = this.getWidgetById('key-create-link-select')
          , keyInput = this.getWidgetById('key-create-link-input')
          ;
        keySelect.reset();
        keyInput.reset();
    }

    setCustomValidity(message="") {
        // If it's custom we should set the validity to the input element
        // otherwise to the select.
        const keySelect = this.getWidgetById('key-create-link-select')
          , keyInput = this.getWidgetById('key-create-link-input')
          , [activeUI, passiveUI] = keySelect.isCustom
                ? [keyInput, keySelect]
                : [keySelect, keyInput]
          ;
        activeUI.setCustomValidity(message);
        passiveUI.setCustomValidity('');
    }
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
 * NodeSpecs use the same TypeSpec. (It's also conceivable that there
 * are multiple of these mappings, in that way a nodespec could have
 * different typespecs, but not within the same mapping.)
 *
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
 *
 * TODO: evaluate if a common base/shared code is feasible
 * i.e. UILinksMap OR _UIBaseLinksMap.
 *
 *  TODO: implement UINodeSpecToTypeSpecLinksMap.prototype._createWrapperKey
 * to use a new LinksMapTargetKeyChange (maybe it extends LinksMapTargetKeyCreate)
 * It will replace the default UIBaseMapKeyChange (=== _UIBaseMap.UIKeyChange),
 * which is a text input field, in UINodeSpecToTypeSpecLinksMap. Should behave
 * like UINodeToTypeSpecLinksValue (change) to a LinksMapKeyCreateSelect (create)
 * but these apply to the values of the map. Same relation is like UIBaseMapKeyChange
 * (change) to UIBaseMapKey (create).
 * Thus, what it should do is to offer a select of existing options with a
 * switch to "custom" plus an input field.
 */
export class UINodeSpecToTypeSpecLinksMap extends _UIBaseMap {
    static ROOT_CLASS = `ui_node_spec_to_type_spec_links_map`
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS, 'ui_links_map']
    static TYPE_CLASS_PART = null;
    static VISUAL_ORDER_STRATEGY = _UIBaseMap.VISUAL_ORDER_STRATEGY_NATURAL;
    static UIKeyCreate = null; // Implemented directly below.
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
        const selectTypeSpec = [
                {   zone: 'tools'
                  , id: 'key-create-link-select'
                }
              , [
                    [this.widgetBus.getExternalName('sourceMap') , 'options']
                  // , ['activeLayoutKey', 'value'] => it doesn't track a value
                ]
              , LinksMapKeyCreateSelect
              , 'ui_links_map-create_select'// baseClass
              , ' with a Type-Spec'// labelContent
              , typeSpecGetOptionLabel// optionGetLabel=null || optionGetLabel(key, value)=>label
              , []// [true, EMPTY_TYPESPEC_LINK_LABEL]// allowNull: [allowNull, allowNullLabel, nullModelValue]
                // As a suggestion, it makes sense to re-use the
                // targetKey name, e.g. "italic" => "italic".
                // The following code tries to differentiate between a
                // user entered/manipulated name vs. one that was set
                // via this automatism.
              , null // onChangeFn=null
              , null // optionGetGroup=null || optionGetGroup(value)=>[groupKey, label, index]
                // optionsGen=null || optionsGen(availableOptions) => ...[key, value]
              , typeSpecOptionsGen
            ]
          , selectNodeSpec = [
                {   zone: 'tools'
                  , id: 'key-create-input'
                }
              , [
                    [this.widgetBus.getExternalName('targetMap'), 'options']// => the keys are the options
                    // we can only create an option if it's not in
                    // childrenOrderedMap, so if it is in there, the options
                    // should be disabled.
                  , [this.widgetBus.getExternalName('childrenOrderedMap'), 'restrictions']// => the keys are the restrictions
                ]
              , LinksMapTargetKeyCreate
              , this._zones
              , 'ui_links_map-key-create' // baseClass
              // , 'Link a NodeSpec' // labelContent
              , this._keyCreateInputHandler.bind(this) // parentCheck=null
              , this._keyCreateSubmitHandler.bind(this) //submitHandler=null
            ]
          , createButton = [
                {   zone: 'tools'
                  , id: 'key-add-button'
                }
              , []
              , this.constructor.UIKeyAddButton
              , this.constructor.KEY_ADD_BUTTON_LABEL
              , [
                    ['click', this._keyCreateSubmitHandler.bind(this)]
                ]
            ]
          , wasteBasket = [
                {zone: 'local'}
              , [
                    ['.', 'rootCollection']
                ]
              , WasteBasketDropTarget
              , 'Delete Link'
              , ''
              , [
                    this.constructor.KEY_DATA_TRANSFER_TYPE
                ]
            ]
          ;

        // super creates a textField for key creation  using "this.constructor.UIKeyCreate"
        // but we need a select field with the keys of NodeSpecMap
        // const widgets = super._initialWidgets;
        return [
            selectNodeSpec
          , selectTypeSpec
          , createButton
          , wasteBasket
        ];
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
