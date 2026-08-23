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
} from '../language-tags.typeroof.jsx';


export class StageDOMNode extends StaticNode {
    constructor(widgetBus, node, layerNode, cssClasses, automaticZoomDefault=false) {
        super(widgetBus, node);
        this._automaticZoomDefault = automaticZoomDefault;
        this._automaticZoomActive = false;
        this._lastContainerDimensions = null;
        for(const className of [ ...cssClasses])
            this.node.classList.add(className);
        this._layerNode = layerNode;
        this._resizeObserver = null;
        // Central owner of classes/styles on the layout container
        // (.typeroof-layout); user-owned reset contract: this class
        // resets its contribution in _stopResizeFitToHost/destroy.
        this._classesAndStylesManager = this.widgetBus.getWidgetById
                ? this.widgetBus.getWidgetById('classes-and-styles-manager', null)
                : null;
    }

    _updateZoomLevel(zoomLevel) {
        const rawType = zoomLevel.get('type').value
          , type = rawType === 'app-default' && this._automaticZoomDefault
                ? 'automatic'
                : rawType
          ;
        if(type === 'automatic') {
            this._automaticZoomActive = true;
            // Fit immediately with the current host box; further host
            // resizes arrive via the 'environment@layout' dependency
            // in update().
            this._resizeFitToHost(
                this.getEntry('environment@layout'),
                this._getInnerDimensions(),
            );
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

    _getInnerDimensions() {
        return {
                width: this.getEntry('width').value
              , height: this.getEntry('height').value
            };
    }

    _stopResizeFitToHost() {
        this._automaticZoomActive = false;
        if(this._automaticZoomDefault)
            // Player mode: the clip is static
            // (.wrapper.player .typeroof-layout--motion-stage), no
            // dynamic write was done.
            ;
        else if(this._classesAndStylesManager !== null)
            // removeStyleProperty resets the manager bookkeeping; the
            // inline value clearing below is the pristine restore.
            this._classesAndStylesManager.reset();
        else
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
        if(this._automaticZoomDefault)
            // Player mode: the clip is static
            // (.wrapper.player .typeroof-layout--motion-stage).
            ;
        else if(this._classesAndStylesManager !== null)
            this._classesAndStylesManager.setStyleProperty('overflow', 'hidden');
        else
            this.widgetBus.wrapper.host.style.setProperty('overflow', 'hidden');
        this.node.style.setProperty('transform-origin', 'top left');
        this.node.style.setProperty('transform', `translate(${centerX}px, ${centerY}px) scale(${scaler})`);
        this._lastContainerDimensions = containerDimensions;
    }

    _updateResize() {
        if(this._lastContainerDimensions === null)
            return;
        this._resizeFitToHost(this._lastContainerDimensions, this._getInnerDimensions());
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

        // The host box changed (window resize etc.): refit when in
        // automatic-zoom mode. (Replaces the private ResizeObserver on
        // wrapper.host; environment@layout is the .typeroof-layout
        // content box, css-px.)
        if(changedMap.has('environment@layout') && this._automaticZoomActive)
            this._resizeFitToHost(changedMap.get('environment@layout'), this._getInnerDimensions());

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
