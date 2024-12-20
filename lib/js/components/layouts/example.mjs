/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import {
    _BaseComponent
  , _BaseContainerComponent
} from '../basics.mjs';

import {
    UINumberAndRangeInput
} from '../generic.mjs';

import {
    UIManualAxesLocations
} from '../ui-manual-axis-locations.mjs';

import {
    CoherenceFunction
  , NumberModel
} from '../../metamodel.mjs';

import {
    _BaseLayoutModel
} from '../main-model.mjs';

import {
    Model as ManualAxesLocationsModel
} from '../ui-manual-axis-locations.mjs';

const ExampleLayoutModel = _BaseLayoutModel.createClass(
        'ExampleLayoutModel'
      , CoherenceFunction.create(['fontSize'],  function setDefaults({fontSize}) {
            // Value is undefined in primal state creation.
            // Also, NumberModel, an _AbstractGenericModel, has no defaults or validation.
            if(fontSize.value === undefined) {
                // This is sketchy, font-size is very specific
                // to the actual layout usually.
                fontSize.value = 36;
            }
        })
     // , ['font', new InternalizedDependency('font', AvailableLayoutsModel)]
      , ['fontSize', NumberModel]
      , ['manualAxesLocations', ManualAxesLocationsModel]
);

class SimpleProof extends _BaseComponent {
    //jshint ignore:start
    static TEMPLATE = `<div class="simple-proof">Sample Text</div>`;
    //jshint ignore:end
    constructor(widgetBus) {
        super(widgetBus);
        this.element = this.initTemplate();
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          ;
        this._insertElement(element);
        return element;
    }
    update (changedMap) {
        // console.log(`${this.constructor.name}.update(changedMap):`, changedMap);

        // This would be a good method, ideally maybe:
        // const {axesLocations, autoOPSZ, ...} this.getEntries(changedMap, 'axesLocations', 'autoOPSZ')
        // would be interesting to also extract value if possible!
        const axesLocations = changedMap.has('axesLocations')
                        ? changedMap.get('axesLocations')
                        : this.getEntry('axesLocations')
          , autoOPSZ = (changedMap.has('autoOPSZ')
                        ? changedMap.get('autoOPSZ')
                        : this.getEntry('autoOPSZ')).value
          , fontSize = (changedMap.has('fontSize')
                        ? changedMap.get('fontSize')
                        : this.getEntry('fontSize')).value
          , font = (changedMap.has('font')
                        ? changedMap.get('font')
                        : this.getEntry('font')).value
          , hasOPSZ = 'opsz' in font.axisRanges
          ;

       if(changedMap.has('font'))
           this.element.style.setProperty('font-family', `"${font.fullName}"`);

        if((changedMap.has('fontSize')))
            this.element.style.setProperty('font-size', `${changedMap.get('fontSize').value}pt`);


        // Not sure about this optimization, it's complicated, especially
        // in the hasOPSZ case
        let requireVariationsUpdate = changedMap.has('axesLocations') // When axesLocations changed we always update.
            || (hasOPSZ
                // When axesLocations changed we always update.
                // => has opsz, axesLocations did not change
                && (changedMap.has('autoOPSZ') // always
                    // => autoOPSZ did not change, what's the value ...
                    || (autoOPSZ
                            // => we'll use fontSize and it changed
                            ? changedMap.has('fontSize')
                            // => we'll use the default value and the font changed
                            : changedMap.has('font')
                    )
                )
            );
        if(!requireVariationsUpdate)
            return;
        // requireVariationsUpdate!
        const variations = [];
        for(const [axisTag, value] of axesLocations)
            variations.push(`"${axisTag}" ${value.value}`);
        if(hasOPSZ && !axesLocations.has('opsz')) {
            // The browser defaults are flawed! At some point we may
            // still require showing the browser default, to show
            // how it is not the same as it should be OR to show
            // how it got fixed.
            const opsz = autoOPSZ
                ? fontSize
                : font.axisRanges.opsz.default
                ;
            variations.push(`"opsz" ${opsz}`);
        }
        this.element.style.setProperty('font-variation-settings', variations.join(','));
    }
}

class ExampleLayoutController extends _BaseContainerComponent {
    constructor(widgetBus, zones) {
        const widgets = [
            [
                {zone: 'layout'}
              , [
                    ['../font', 'font']
                  , 'fontSize'
                  , ['manualAxesLocations/axesLocations', 'axesLocations']
                  , ['manualAxesLocations/autoOPSZ', 'autoOPSZ']
                ]
              , SimpleProof
            ]
          , [
                {zone: 'main'}
              , [
                    ['fontSize', 'value']
                ]
              , UINumberAndRangeInput
              , 'Font Size' // label
              , 'pt'// unit
              , {min:6, max:280, value:6, step:1} // minMaxValueStep => set attribute
            ]
          , [
                {zone: 'main'}
              , [
                    ['fontSize', 'fontSize']
                  , ['../font', 'font']
                  , ['manualAxesLocations/axesLocations', 'axesLocations']
                  , ['manualAxesLocations/autoOPSZ', 'autoOPSZ']
                ]
              , UIManualAxesLocations
              ,  null //getDefaults
              , null // ppsRecord
              , ()=>true // required, otherwise opsz is not properly initialized
            ]
        ];
        super(widgetBus, zones, widgets);
    }
}

export {
    ExampleLayoutModel as Model
  , ExampleLayoutController as Controller
};
