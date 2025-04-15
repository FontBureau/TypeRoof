
import {
    _BaseComponent
} from './basics.mjs';

import {
    COLOR
} from './registered-properties-definitions.mjs';

import {
    getColorFromPropertyValuesMap
} from './color.mjs';

import {
    formatCss as culoriFormatCss
} from '../vendor/culori/bundled/culori.mjs';


export class UIshowProcessedProperties extends _BaseComponent {
    // jshint ignore:start
     static TEMPLATE = `<div class="ui-show_processed_properties">
    <h4>Inherited Properties</h4>
    <ol class="ui-show_processed_properties-list ui-show_processed_properties-list-inherited"></ol>
    <h4>Own Properties</h4>
    <ol class="ui-show_processed_properties-list ui-show_processed_properties-list-own"></ol>
</div>`;
    // jshint ignore:end
    constructor(widgetBus, typeKey) {
        super(widgetBus);
        this._typeKey = typeKey;
        this._baseClass = 'ui-show_processed_properties';
        this._isTypographic = null;
        [this.element, this.inheritedPropertiesContainer, this.ownPropertiesContainer] = this.initTemplate();
        this.ownProperties = new Set();
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , inheritedPropertiesContainer = element.querySelector(`.${this._baseClass}-list-inherited`)
          , ownPropertiesContainer = element.querySelector(`.${this._baseClass}-list-own`)
          ;
        this._insertElement(element);
        return [element, inheritedPropertiesContainer, ownPropertiesContainer];
    }

    _createTextValueElement(key, value) {
        const valueText = typeof value === 'boolean'
                            ? (value && 'True' || 'False')
                              // undefined.toString raises ...
                            : value !== undefined ? value.toString() : 'undefined'
          , valueContainer = this._domTool.createElement(
                              'span'
                            , {'class': `${this._baseClass}-value-text`}
                            , valueText)
          ;
        return valueContainer;
    }

    _createColorValueElement(key, value) {
        const valueContainer = this._domTool.createElement('span')
          , colorCss = culoriFormatCss(value)
          , colorPatch = this._domTool.createElement(
                        'span'
                      , {'class': [
                                `${this._baseClass}-value-color_patch`
                                // Has an indicator for transparency
                                // and implements :hover to enlarge the
                                // sample.
                              , 'ui_color_patch'
                              , 'ui_color_patch-has_color'
                              ].join(' ')
                        })
          , textContainer = this._createTextValueElement(key, colorCss)
          ;
        colorPatch.style.setProperty(`--color`, colorCss);
        valueContainer.append(colorPatch, textContainer);
        return valueContainer;
    }

    // NOTE: copied from AnimationInfo
    _createBasicDisplayElement(key, value, label=null) {
        const [type, valueContainer] = key.startsWith(COLOR) && typeof value === 'object'
                    ? ['color', this._createColorValueElement(key, value)]
                    : ['text', this._createTextValueElement(key, value)]
          , labelContainer = this._domTool.createElement(
                    'span'
                    , {'class': `${this._baseClass}-label`}
                    , label !== null ? label : key
            )
          , container = this._domTool.createElement(
                    'li'
                    , {'class': [
                                `${this._baseClass}-item`
                              , `${this._baseClass}-item-type_${type}`
                              ].join(' ')}
                    , [labelContainer, ' ' , valueContainer]
            )
          ;
        valueContainer.classList.add(`${this._baseClass}-value`);
        return [container, valueContainer];
    }

    update(changedMap) {
        if(changedMap.has('referenceItem')) {
            // update own properties
            const properties = changedMap.has('properties@')
                        ? changedMap.get('properties@')
                        : this.getEntry('properties@')
              , localPropertyNames = properties.typeSpecnion.localPropertyNames
              ;
            this.ownProperties.clear();
            for(const localPropertyName of localPropertyNames)
                this.ownProperties.add(localPropertyName);
        }

        // TODO: AnimationInfo has a more holistic handling than this.
        if(changedMap.has('properties@')) {
            const properties = changedMap.has('properties@')
                        ? changedMap.get('properties@')
                        : this.getEntry('properties@')
              // , propertyValuesMap = animationProperties.propertyValuesMap
              , propertyValuesMap = properties.typeSpecnion.getProperties()
              , ownPropertiesChildren = []
              , inheritedPropertiesChildren = []
              ;
            for(const [property, value] of propertyValuesMap) {
                const target = this.ownProperties.has(property)
                                        ? ownPropertiesChildren
                                        : inheritedPropertiesChildren
                                        ;

                const [color, consumed] = getColorFromPropertyValuesMap(property, propertyValuesMap);
                if(color !== null) {
                    const [elem] = this._createBasicDisplayElement(property, color);
                    target.push(elem);
                }
                if(consumed)
                    continue;

                const [elem] = this._createBasicDisplayElement(property, value);
                target.push(elem);
            }
            // FIXME: updating would be better, as of now, during animation
            // css :hover doesn't work here, because the elements get changed
            // to quickly. We should rather consider updating the existing
            // children as good as possible and have them remain at their
            // position as good as possible. (Only Chromium, Firefox can handle this)
            this.ownPropertiesContainer.replaceChildren(...ownPropertiesChildren);
            this.inheritedPropertiesContainer.replaceChildren(...inheritedPropertiesChildren);
        }
    }
}
