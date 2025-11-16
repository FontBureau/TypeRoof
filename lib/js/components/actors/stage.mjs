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

import {
    setLanguageTagDirect
} from '../language-tags-models.mjs';


export class StageDOMNode extends StaticNode {
    constructor(widgetBus, node, layerNode, cssClasses, automaticZoomDefault=false) {
        super(widgetBus, node);
        this._automaticZoomDefault = automaticZoomDefault;
        this._lastContainerDimensions = null;
        for(const className of [ ...cssClasses])
            this.node.classList.add(className);
        this._layerNode = layerNode;
        this._resizeObserver = null;
    }

    _updateZoomLevel(zoomLevel) {
        const rawType = zoomLevel.get('type').value
          , type = rawType === 'app-default' && this._automaticZoomDefault
                ? 'automatic'
                : rawType
          ;
        if(type === 'automatic') {
            this._startResizeFitToHost();
        }
        else {
            this._stopResizeFitToHost();
            const scalingItem = zoomLevel.get('scaling')
              , scalingPercentage = scalingItem.isEmpty
                    ? scalingItem.Model.defaultValue
                    : scalingItem.value
              , scaler = scalingPercentage * 0.01
              ;
            this.node.style.setProperty('transform-origin', 'top left');
            this.node.style.setProperty('transform', `scale(${scaler})`);
        }
    }

    _startResizeFitToHost() {
        if(this._resizeObserver !== null)
            return;
        this._resizeObserver = new ResizeObserver(this._resizeHandler.bind(this));
        // This fires initially, so we don't need to prime the handler.
        this._resizeObserver.observe(this.widgetBus.wrapper.host, {box: 'content-box'});
    }

    _stopResizeFitToHost() {
        if(this._resizeObserver !== null) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        this.widgetBus.wrapper.host.style.setProperty('overflow', null);
        this.node.style.setProperty('transform-origin', null);
        this.node.style.setProperty('transform', null);
        this._lastContainerDimensions = null;
    }

    _resizeFitToHost(containerDimensions, innerDimensions) {
        const containerAR = containerDimensions.width/containerDimensions.height
          , innerAR = innerDimensions.width/innerDimensions.height
          , scaler = (containerAR > innerAR)
                // fit heights:
                ? containerDimensions.height/innerDimensions.height
                // fit widths
                : containerDimensions.width/innerDimensions.width
          , centerX = (containerDimensions.width - innerDimensions.width * scaler) * 0.5
          , centerY = (containerDimensions.height - innerDimensions.height * scaler) * 0.5
          ;
        // this.node will still claim it's original size
        this.widgetBus.wrapper.host.style.setProperty('overflow', 'hidden');
        this.node.style.setProperty('transform-origin', 'top left');
        this.node.style.setProperty('transform', `translate(${centerX}px, ${centerY}px) scale(${scaler})`);
        this._lastContainerDimensions = containerDimensions;
    }

    _updateResize() {
        if(this._lastContainerDimensions === null)
            return;
        const innerDimensions = {
                width: this.getEntry('width').value
              , height: this.getEntry('height').value
            };
        this._resizeFitToHost(this._lastContainerDimensions, innerDimensions);
    }

    _resizeHandler(entries/*, observer*/) {
        const innerDimensions = {
                width: this.getEntry('width').value
              , height: this.getEntry('height').value
            }
          , containerDimensions = {
                width: 0
              , height: 0
            }
        ;
        for (const entry of entries) {
            if (entry.contentBoxSize) {
                // MDN: The standard makes contentBoxSize an array...
                if (entry.contentBoxSize[0]) {
                     containerDimensions.width = entry.contentBoxSize[0].inlineSize;
                     containerDimensions.height = entry.contentBoxSize[0].blockSize;
                }
                else {
                    // MDN: … but old versions of Firefox treat it as a single item
                    containerDimensions.width = entry.contentBoxSize.inlineSize;
                    containerDimensions.height = entry.contentBoxSize.blockSize;
                }
            }
            else {
                containerDimensions.width = entry.contentRect.width;
                containerDimensions.height = entry.contentRect.height;
            }
            this._resizeFitToHost(containerDimensions, innerDimensions);
        }
    }

    destroy() {
        this._stopResizeFitToHost();
        return super.destroy();
    }

    update(changedMap) {
        // Stage width and heigth are so far not animated in time,
        // as they are supposed to change with the environment/portal properties
        if(changedMap.has('zoomLevel'))
            this._updateZoomLevel(changedMap.get('zoomLevel'));

        for(const property of ['width', 'height']) {
            let hasSizeChange = false;
            if(changedMap.has(property)) {
                hasSizeChange = true;
                // FIXME: CAUTION: the px unit should likely be configurable
                this.node.style.setProperty(property, `${changedMap.get(property).value}px`);
            }
            if(hasSizeChange)
                this._updateResize();
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
            setLanguageTagDirect(this._layerNode, propertyValuesMap);
        }
    }
}
