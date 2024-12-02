import {
    ForeignKey
  , _AbstractSimpleOrEmptyModel
} from '../metamodel.mjs';

import {
    enumerate
} from '../util.mjs';

import {
    _BaseContainerComponent
  , _BaseComponent
} from './basics.mjs';

import {
    StaticNode
  , PlainNumberAndRangeInput
  , PlainToggleButton
  , GenericSelect
} from './generic.mjs';

import {
    formatCss as culoriFormatCss
  , getMode as culoriGetMode
  , interpolate as culoriInterpolate
  , fixupHueShorter
  , fixupHueLonger
  , fixupHueDecreasing
  , fixupHueIncreasing
} from '../vendor/culori/bundled/culori.mjs';

import {
    COLOR_TYPE_TO_CULORI_MODE
  , PECENTAGE_UNIT_NUMBER_TYPES
  , TURN_UNIT_NUMBER_TYPES
  , availableColorTypes
  , culoriValuesToColorValuesRange
  , culoriToColor
  , colorToCulori
  , getCuloriModeFromColor
  // , colorToCss
  , convertCuloriColorMode
} from './color.mjs';


const _NOTDEF = Symbol('_NOTDEF');


class PlainNumberAndRangeColorInput extends PlainNumberAndRangeInput {
    //jshint ignore:start
    static TEMPLATE = `<div class="number_and_range_input number_and_range_color_input">
    <div class="number-and-range-input_value-box">
        <label><!-- insert: label --></label>
        <input type='number'  /><!-- insert: unit -->
    </div>
    <div class="number-and-range-input_color-bar">
        <input type='range' />
    </div>
</div>`;
    //jshint ignore:end
    constructor(...args) {
        super(...args);
        this._colorBarContainer = this.element.querySelector('.number-and-range-input_color-bar');
        this._canvas = this._domTool.createElement('canvas');
        this._colorBarContainer.append(this._canvas);
        this._ctx = this._canvas.getContext('2d', {colorSpace: 'display-p3'});
    }
}

export class PlainColorComponentOrEmptyInput {
    constructor(domTool, baseClass='ui_color_component') {
        this._domTool = domTool;
        this._baseClass = baseClass;
        this._componentKey = null;

        this._uiNumber = new PlainNumberAndRangeColorInput(this._domTool
                , (...args)=>this._changeHandler(...args)
                , '', '', {});

        this._uiToggle = new PlainToggleButton(this._domTool
          , (...args)=>this._toggleHandler(...args)
          , 'toggle', 'set explicitly' , 'unset'
          , 'Toggle explicit color component input or set empty.');

        // Better for styling and the way PlainNumberAndRangeColorInput
        // is created allows it.
        this.element = this._uiNumber.element;

        this.element.classList.add(this._baseClass);
        this.element.append(/*this._uiNumber.element,*/ this._uiToggle.element);
        this._changeHandler = null;
        this._toggleHandler = null;
    }
    getComponentClassFragment(componentKey) {
        return componentKey.toLowerCase();
    }

    _renderColorStrip (componentKey, culoriColor) {
        const ranges= culoriGetMode(culoriColor.mode).ranges;
        // ranges = {
        //     "l": [0, 1],
        //     "a": [-0.4, 0.4],
        //     "b": [-0.4, 0.4],
        //     "alpha": [0, 1]
        // }
        const container = this._uiNumber._colorBarContainer
          , width = container.scrollWidth
          , height = container.scrollHeight
          , ctx = this._uiNumber._ctx
          , canvas = this._uiNumber._canvas
          , componentRange = ranges[componentKey]
          , colors = componentRange.map(value=>({...culoriColor, [componentKey]:value}))
          , interpolateArgs = [colors, culoriColor.mode]
          , hueInterpolationMethod = componentKey === 'h' ? 'longer hue' : false
          ;
        const HUE_INTERPOLATION_METHODS = new Map([
                ['shorter hue', fixupHueShorter]
              , ['longer hue', fixupHueLonger]
              , ['increasing hue', fixupHueDecreasing]
              , ['decreasing hue', fixupHueIncreasing]
        ]);
        if(hueInterpolationMethod) {
            if(!HUE_INTERPOLATION_METHODS.has(hueInterpolationMethod))
                console.error(`KEY ERROR unkown hueInterpolationMethod "${hueInterpolationMethod}".`);
            interpolateArgs.push({h: {fixup: HUE_INTERPOLATION_METHODS.get(hueInterpolationMethod)}});
            // Bummer, this is annoying: seems like culori does a toValue % maxValue (=== 360)
            // which leaves for interpolation from === 0 and to === 0
            // hence, the direction is irrelevant.
            colors[1].h -= Number.EPSILON * 1000;
        }
        const interpolator = culoriInterpolate(...interpolateArgs);
        if(canvas.width !== width) {
            canvas.width = width;
            canvas.style.setProperty('--width', `${width}px`);
        }
        // CAUTUION: Since height === container.scrollHeight
        // the continer will grow on each update, adding the current
        // canvas height to the new canvas height. That means, the
        // canvas must be positioned absolutely, to not interact with
        // container.scrollHeight.
        if(canvas.height !== height) {
            canvas.height = height;
            canvas.style.setProperty('--height', `${height}px`);
        }

        if(ctx.reset)
            ctx.reset();
        else
            // Safari doesn't have ctx.reset, below would work universally though.
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        for(let x=0;x<width;x++) {
            const t = x/(width-1);
            ctx.fillStyle = culoriFormatCss( interpolator(t) );
            ctx.fillRect(x, 0, 1, height);
        }
    }

    update(componentKey, color, changeHandler, toggleHandler, culoriColor, defaultValue=0) {
        this._componentKey = componentKey;
        for(const className of [...this.element.classList]) {
            if(className.startsWith(`${this._baseClass}-`))
                this.element.classList.remove(className);
        }

        const component = color.get(componentKey);
        let unit = null;
        if(PECENTAGE_UNIT_NUMBER_TYPES.has(component.constructor))
            unit = '%';
        else if(TURN_UNIT_NUMBER_TYPES.has(component.constructor))
            unit = 'turn';

        const ValueModel = component instanceof _AbstractSimpleOrEmptyModel
                ? component.constructor.Model
                : component.constructor
                ;
        const min = ValueModel.minVal
          , max = ValueModel.maxVal
          , toFixedDigits = ValueModel.toFixedDigits
          , cleanDefaultValue = toFixedDigits !== null
                    ? parseFloat(defaultValue.toFixed(toFixedDigits))
                    : defaultValue
          ;
        this._uiNumber.updateTemplateVars(componentKey, unit, {min, max, 'default': ValueModel.defaultValue});

        if(component.isEmpty) {
            this._uiNumber.update(cleanDefaultValue);
            this._uiNumber.passive = true;
            this._uiToggle.update(true);
        }
        else {
            this._uiNumber.update(component.value);
            this._uiNumber.passive = false;
            this._uiToggle.update(false);
        }

        this.element.classList.add(`${this._baseClass}-${this.getComponentClassFragment(componentKey)}`);

        this._changeHandler = changeHandler;
        this._toggleHandler = toggleHandler;
        this._renderColorStrip(componentKey.toLowerCase(), culoriColor);
    }
    destroy(){}
}

function _getNumberInstanceDefault(numberInstance, defaultVal=_NOTDEF) {
    if(numberInstance.constructor.Model.defaultValue !== null)
        return numberInstance.constructor.Model.defaultValue;
    if(defaultVal !== _NOTDEF)
        return _NOTDEF;
    throw new Error(`KEY ERROR default value not found for ${numberInstance}.`);
}

function _getDefaultColor(getDefaults, color, defaultVal=_NOTDEF) {
    const defaultCuloriColor = getDefaults(...(defaultVal===_NOTDEF ? [] : [defaultVal]))
      , mode = getCuloriModeFromColor(color)
      , defaultConvertedCuloriColor = convertCuloriColorMode(defaultCuloriColor, mode)
        // has no 'mode' as the values are not compatible with culori anymore
      , defaultColor = culoriValuesToColorValuesRange(defaultConvertedCuloriColor)
      ;
    return [defaultColor, defaultConvertedCuloriColor];
}

class UIColorComponentRanges extends _BaseComponent {
    //jshint ignore:start
        static TEMPLATE = `<div class="ui_color_component_ranges">
</div>`;
    //jshint ignore:end
     constructor (widgetBus, getDefaults=null, requireUpdateDefaults=()=>false) {
        super(widgetBus);
        this._getDefaults = getDefaults;
        this._requireUpdateDefaults = requireUpdateDefaults;
        this._components = [];
        [this.element] = this.initTemplate();
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          ;
        this._insertElement(element);
        return [element];
    }

    _createComponent() {
        const component = new PlainColorComponentOrEmptyInput(this._domTool);
        this.element.append(component.element);
        return component;
    }

    _componentToggleHandler(componentKey) {
        this._changeState(()=>{
            const color = this.getEntry('color')
              , component = color.get(componentKey)
              ;
            if(!component.isEmpty){
                component.clear();
            }
            else {
                const [defaultColor, ] = this._getDefaultColor(color)
                  , defaultValue = Object.hasOwn(defaultColor, componentKey)
                      ? defaultColor[componentKey]
                      : _getNumberInstanceDefault(component, 0)
                  ;
                component.set(defaultValue);
            }
        });
    }

    _componentChangeHandler(componentKey, newValue/*, ...args*/) {
        this._changeState(()=>{
            const color = this.getEntry('color')
              , component = color.get(componentKey)
              ;
            component.set(newValue);
        });
    }

    _updateComponent(i, componentKey, color, culoriColor, defaultValue) {
        const component = this._components[i];
        component.update(
                componentKey
              , color
               // set change handlers
              , this._componentChangeHandler.bind(this, componentKey)
              , this._componentToggleHandler.bind(this, componentKey)
              , culoriColor
              , defaultValue
        );
    }

    _getDefaultColor(color) {
        return _getDefaultColor(this._getDefaults.bind(this), color);
    }

    update (changedMap) {
        const requireUpdateDefaults = this._requireUpdateDefaults(changedMap);
        if(changedMap.has('color') || requireUpdateDefaults) {
            const color = (changedMap.has('color')
                            ? changedMap.get('color')
                            : this.getEntry('color')
                        ).wrapped
              , [defaultColor, defaultCuloriColor] = this._getDefaultColor(color)
              , explicitCuloriColor = colorToCulori(color)
                // Used to be just defaultCuloriColor. This way,
                // if defaultCuloriColor is missning any components we can
                // use them from explicitCuloriColor, which improves the
                // rendereing of the color strips. E.g. in oklch, when
                // c is 0 or missing but h has a value, it still renders
                // the c strip as if h was 0 e.g. a pink transition instead
                // of e.g. green. This is, because currently the interpolation
                // color space is oklab, and when the source oklch c is 0
                // the translation to oklab and then back to oklch drops
                // the value for h: when a = 0 and b = 0, there's just 0
                // for h, and that is even ommitted. We merge in the original
                // color to get the h value it actually specifies, and to
                // get the other values that it may not specify explicitly
                // but inherit from default, e.g. l would surive the conversions
                // between oklab and oklch.
              , culoriColor = Object.assign({}, defaultCuloriColor, explicitCuloriColor)
              ;
            let size = 0;
            for(const [i, componentKey] of enumerate(color.keys())) {
                size += 1;
                if(!this._components[i])
                    this._components.push(this._createComponent());
                const defaultValue = Object.hasOwn(defaultColor, componentKey)
                        ? defaultColor[componentKey]
                        : _getNumberInstanceDefault(color.get(componentKey), 0)
                        ;
                this._updateComponent(i, componentKey, color, culoriColor, defaultValue);
            }
            while(this._components.length > size) {
                const component = this._components.pop();
                component.element.remove();
                component.element.destroy();
            }
        }
    }
}

class UIColorPatch extends _BaseComponent{
     constructor (widgetBus, getDefaults, requireUpdateDefaults, elementTag='div') {
        super(widgetBus);
        this._getDefaults = getDefaults;
        this._requireUpdateDefaults = requireUpdateDefaults;
        [this.element] = this.initTemplate(elementTag);
    }

    initTemplate(elementTag) {
        const element = this._domTool.createElement(
                            elementTag
                          , {'class': 'ui_color_patch'}
                          , this._domTool.createElement(
                                'span'
                              , {'class': 'ui_color_patch-no_color_label'}
                              , '(inherited)'
                            )
                        );
        this._insertElement(element);
        return [element];
    }

    _getDefaultColor(color) {
        return _getDefaultColor(this._getDefaults.bind(this), color);
    }

    update (changedMap) {
        const requireUpdateDefaults = this._requireUpdateDefaults(changedMap);
        if(changedMap.has('color') || requireUpdateDefaults) {
            const colorWrapper = changedMap.has('color')
                            ? changedMap.get('color')
                            : this.getEntry('color')
              ;
            let patchColor;
            if(colorWrapper.hasWrapped) {
                this.element.classList.add(`ui_color_patch-has_color`);
                this.element.classList.remove(`ui_color_patch-no_color`);

                const color = colorWrapper.wrapped
                  , [/*defaultColor*/, defaultCuloriColor] = this._getDefaultColor(color)
                  , explicitCuloriColor = colorToCulori(color)
                  , culoriColor = Object.assign({}, defaultCuloriColor, explicitCuloriColor)
                  ;
                patchColor =  culoriColor;
            }
            else {
                // this.element.classList.remove(`ui_color_patch-has_color`);
                this.element.classList.add(`ui_color_patch-has_color`);
                this.element.classList.add(`ui_color_patch-no_color`);
                // this.element.style.removeProperty('--color');
                patchColor = this._getDefaults();
            }
            this.element.style.setProperty('--color', culoriFormatCss(patchColor));
        }
    }
}

export class UIColorChooser extends _BaseContainerComponent {
    constructor(widgetBus, _zones, label, getDefaults, updateDefaultsDependencies, requireUpdateDefaults) {
        // This widget should be potentially collapsed and only show a
        // label and tile of the color/none-color
        const baseClass = 'ui_color_chooser'
          , localZoneElement = widgetBus.domTool.createElement(
                                    'div', {'class': baseClass})
          , labelZoneElement = widgetBus.domTool.createElement('label', {'class': `${baseClass}-label_toggle`})
          , zones = new Map([..._zones
                        , ['local', localZoneElement]
                        , ['label', labelZoneElement]
            ])
          ;

        super(widgetBus, zones);

        // FIXME: to position this where it is defined
        // it's better to _insertElement, but settings.zone must be defined
        if(widgetBus.wrapper.host)
            this._insertElement(localZoneElement);

        this._container = localZoneElement;
        this._visibleClass = 'settings_visible';
        this._hiddenClass = 'settings_hidden';
        this._displaySettings = false;
        this._toggleSettingsVisibilityClasses();

        this._getDefaults = getDefaults;
        const activationTest = ()=>{
                if(!this._displaySettings)
                    return false;
                const testResult = this.widgetBus.getEntry(this.widgetBus.rootPath)
                                    .get('colorTypeKey').value !== ForeignKey.NULL;
                // console.log(`${this} activationTest:`, testResult
                //      , 'for:', widgetBus.rootPath.toString(), '<<>>'
                //      , this.widgetBus.getEntry(this.widgetBus.rootPath)
                //                    .get('colorTypeKey').value);
                return testResult;
            }
          , widgets = [
            // label: TODO get a proper human readable label into here
            // <h2>Color ${this.widgetBus.rootPath.parts.pop()}</h2>
            ...(widgetBus.wrapper.host
                ? []
                : [[
                    {zone: 'main'}
                  , []
                  , StaticNode
                  , localZoneElement
                ]]
            )
          , [
                {
                    zone: 'local'
                  , onInit: widget=>widget.node.addEventListener('click', this._toggleOptionsHandler.bind(this))
                }
              , []
              , StaticNode
              , labelZoneElement
            ]
          , [
                {zone: 'label'}
              , []
              , StaticNode
              , this._domTool.createElement('span', null, label)
            ]
          , [
                {zone: 'label'}
              , [
                    ['instance', 'color']
                  , ...updateDefaultsDependencies
                ]
              , UIColorPatch
              , getDefaults, requireUpdateDefaults
              , 'span'
            ]
          , [
                {
                    zone: 'local'
                  , activationTest: ()=>this._displaySettings
                }
              , [
                    ['availableColorTypes', 'options']
                  , ['colorTypeKey', 'value']
                ]
              , GenericSelect
              , 'ui_color_model_select'// baseClass
              , 'Color Mode'// labelContent
              , (key, availableColorType)=>{ return availableColorType.get('label').value; } // optionGetLabel
              , [true, '(no color)', ForeignKey.NULL] // [allowNull, allowNullLabel, nullModelValue]
                // changing this should convert the previous color mode to the
                // new color mode, using colori!
              , this._changeColorModeHandler.bind(this) // onChangeFn(newValue)
           ]
          ,[
                {zone: 'local', activationTest}
              , [
                    ['instance', 'color']
                  , ...updateDefaultsDependencies
                ]
              , UIColorComponentRanges
              , getDefaults, requireUpdateDefaults
           ]
        ];
        this._initWidgets(widgets);
    }
    _toggleSettingsVisibilityClasses() {
        const [addClass, removeClass] = this._displaySettings
                    ? [this._visibleClass, this._hiddenClass]
                    : [this._hiddenClass, this._visibleClass]
                    ;
        this._container.classList.add(addClass);
        this._container.classList.remove(removeClass);
    }
    _toggleOptionsHandler(/*evt*/) {
        // ideally:
        this._displaySettings = !this._displaySettings;
        this._toggleSettingsVisibilityClasses();
        // rerun ActivationTest ...
        const rootState = this.getEntry('/');
        this.initialUpdate(rootState);
    }

    _getDefaultColor(color) {
        return _getDefaultColor(this._getDefaults.bind(this), color);
    }

    _changeColorModeHandler(newValue) {
        // new Value is either a string, e.g. "OKLCH" or Symbol('NULL') === ForeignKey.NULL
        if(newValue === ForeignKey.NULL)
            return;
        const keyMomentDraft = this.getEntry(this.widgetBus.rootPath.parent)
          , colorFieldName = this.widgetBus.rootPath.parts.at(-1)
          , colorWrapper = keyMomentDraft.get(colorFieldName).get('instance')
          ;
        let sourceCuloriColor;
        if(colorWrapper.hasWrapped) {
            const color = colorWrapper.wrapped
              , [, defaultCuloriColor] = this._getDefaultColor(color)
              , explicitCuloriColor = colorToCulori(color)
              ;
            // We might have some undefined components, using defaultCuloriColor
            // to populate these.
            sourceCuloriColor = Object.assign({}, defaultCuloriColor, explicitCuloriColor);
        }
        else {
            sourceCuloriColor = this._getDefaults(null);
            if(sourceCuloriColor === null) {
                // Maybe it's even better when we call this._getDefaults()
                // without the defaultVal argument and produce the KeyError
                // as it would show where a default should be defined.
                console.error(`_changeColorModeHandler: can't get a default value for colorFieldName ${colorFieldName}`);
                return;
            }
        }
        const ColorType = availableColorTypes.get(newValue).value.get('typeClass').value
          , culoriTargetMode = COLOR_TYPE_TO_CULORI_MODE.get(ColorType)
          , targetCuloriColor = convertCuloriColorMode(sourceCuloriColor, culoriTargetMode)
          , color = culoriToColor(targetCuloriColor, keyMomentDraft.dependencies)
          ;
        keyMomentDraft.set(colorFieldName, color);
    }
}
