/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    StaticNode
} from '../generic.mjs';

import {
    actorApplyCSSColors
} from './properties-util.mjs';

import {
    getRegisteredPropertySetup
} from '../registered-properties.mjs';

export class StageDOMNode extends StaticNode {
    constructor(widgetBus, node, layerNode, cssClasses) {
        super(widgetBus, node);
        for(const className of [ ...cssClasses])
            this.node.classList.add(className);
        this._layerNode = layerNode;
    }
    update(changedMap) {
        // Stage width and heigth are so far not animated in time,
        // as they are supposed to change with the environment/portal properties
        for(const property of ['width', 'height']) {
            if(changedMap.has(property))
                // FIXME: CAUTION: the px unit should likely be configurable
                this.node.style.setProperty(property, `${changedMap.get(property).value}px`);
        }

        if(changedMap.has('animationProperties@') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('animationProperties@')
                        ? changedMap.get('animationProperties@')
                        : this.getEntry('animationProperties@')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              , getDefault = property => [true, getRegisteredPropertySetup(property).default]
              , colorPropertiesMap = [
                      ['colors/stageBackgroundColor', 'background-color']
                    , ['colors/textColor', 'color']
                ]
              ;
            actorApplyCSSColors(this._layerNode, propertyValuesMap, getDefault, colorPropertiesMap);
        }
    }
}
