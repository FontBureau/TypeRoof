import { _BaseContainerComponent } from "./basics.mjs";

import { require } from "./dependency-injection.mjs";

import {
    UINumberAndRangeOrEmptyInput,
    UISelectOrEmptyInput,
    CollapsibleContainer,
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
    constructor(widgetBus, _zones, label = null) {
        const { h } = widgetBus.domTool,
            element = <div class="ui-margins"></div>,
            zones = new Map([..._zones, ["main", element]]);
        if (label !== null)
            element.append(<h3 class="ui-margins-label">{label}</h3>);
        widgetBus.insertElement(element);
        super(widgetBus, zones, [
            ...["start", "end"].map((pos) => {
                // start, end
                return [
                    { zone: "main", rootPath: widgetBus.rootPath.append(pos) },
                    [],
                    UIMarginInput,
                    zones,
                    `${pos[0].toUpperCase()}${pos.slice(1)}`, //  require('label')
                    [`ui_margins-input-${pos}`], // require('classes')
                ];
            }),
        ]);
    }
}

export class UIMarginsCollapsible extends CollapsibleContainer {
    constructor(
        widgetBus,
        _zones,
        togglerLabel,
        isOpened = false,
        scroll = false,
    ) {
        const classNameParticle = "margins",
            flavor = "minimal";
        const widgets = [
            [
                {
                    zone: "main",
                    // rootPath: same as parent
                },
                [],
                UIMargins,
                require("raw:zones"),
                // label=null
            ],
        ];
        super(
            widgetBus,
            _zones,
            togglerLabel,
            flavor,
            classNameParticle,
            widgets,
            isOpened,
            scroll,
        );
    }
}
