import { _BaseContainerComponent } from "./basics.mjs";

import {
    UINumberAndRangeOrEmptyInput,
    UISelectOrEmptyInput,
} from "./generic.mjs";

import { MarginUnitModel } from "./type-spec-models.mjs";

class UIMarginInput extends _BaseContainerComponent {
    constructor(
        widgetBus,
        zones /* a language subtagRegistryMap*/,
        label,
        //classes,
    ) {
        //, ['unit', MarginUnitOrEmptyModel] => _AbstractEnumModel
        //, ['value', PercentNumberOrEmptyModel]
        super(widgetBus, zones, [
            //value
            [
                {
                    zone: "main",
                },
                [
                    ["value", "value"], // require('settings:internalPropertyName', 'value')
                ],
                UINumberAndRangeOrEmptyInput,
                () => 0, //require('getDefault')
                () => false, // require('requireUpdateDefaults')
                label, //require('label')
                "", //require('unit')
                // require('getRegisteredPropertySetup', fn)
                // PercentNumberModel = _AbstractNumberModel.createClass('PercentNumberModel', {min:0, max:100, defaultValue: 0, toFixedDigits: 5})
                // , PercentNumberOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(PercentNumberModel)
                (/*registeredSetup*/) => {
                    const result = {};
                    // FIXME: default seems not to be used by
                    // UINumberAndRangeOrEmptyInput but I've seen
                    // it used with fontSize ;-(

                    //THIS:
                    // for(const key in ['min', 'max', 'default', 'step']) {
                    //     if(key in registeredSetup && registeredSetup[key] !== null)
                    //         result[key] = registeredSetup[key];
                    // }
                    return result;
                },
            ],
            //unit
            [
                {
                    zone: "main",
                },
                [
                    ["unit", "value"], // require('settings:internalPropertyName', 'value')
                ],
                UISelectOrEmptyInput,
                () => MarginUnitModel.defaultValue, //require('getDefault')
                () => false, // require('requireUpdateDefaults')
                "", // require('label'),
                MarginUnitModel.enumItems, // require('items')
            ],
        ]);
    }
}

export class UIMargins extends _BaseContainerComponent {
    constructor(widgetBus, _zones, label) {
        const { h } = widgetBus.domTool,
            element = (
                <div class="ui-margins">
                    <h3 class="ui-margins-label">{label}</h3>
                </div>
            ),
            zones = new Map([..._zones, ["main", element]]);
        widgetBus.insertElement(element);
        super(widgetBus, zones, [
            ...["start", "end"].map((pos) => {
                // start, end
                return [
                    { zone: "main", rootPath: widgetBus.rootPath.append(pos) },
                    [],
                    UIMarginInput,
                    zones,
                    `${pos[0].toUpperCase()}${pos.slice(1)}:`, //  require('label')
                    [`ui_margins-input-${pos}`], // require('classes')
                ];
            }),
        ]);
    }
}
