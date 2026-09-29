import { ForeignKey } from "../../metamodel.mjs";

import {
    UISelectOrEmptyInput,
    UINumberAndRangeInput,
    GenericSelect,
    StaticNode,
} from "../generic.mjs";

import {
    ManualHorizontalLayoutModel,
    HorizontalLayoutRunionModel,
    createHorizontalLayoutAlgorithm,
    deserializeHorizontalLayoutAlgorithmModel,
    ConstantColumnGutterModel,
    LinearColumnGutterModel,
} from "./horizontal-layout-models.mjs";

import {
    GENERIC,
    ProcessedPropertiesSystemMap,
} from "./../registered-properties-definitions.mjs";

import { _BaseTypeDrivenContainerComponentMixin } from "./../type-driven-ui-basics.mjs";

import {
    _BaseContainerComponent,
    _BaseDynamicCollectionContainerComponent,
} from "./../basics/component.mjs";

import "./ui-horizontal-layout.css";

function getGenericPPSMap(parentPPSRecord, FieldType) {
    return Object.freeze(
        ProcessedPropertiesSystemMap.fromPrefix(
            GENERIC,
            FieldType.fields.keys(),
        ),
    );
}

// NOTE: this mixes in _BaseTypeDrivenContainerComponent
export class UIDynamicStructContainer extends _BaseTypeDrivenContainerComponentMixin(
    _BaseDynamicCollectionContainerComponent,
) {
    static CSS_CLASS_NAME = "_UNDEFINED_CSS_CLASS_NAME_";
    static LABEL = null;
    constructor(widgetBus, _zones, injectable, ppsRecord) {
        // run super first, so we can use `this` in the widgets definition.
        const h = widgetBus.domTool.h,
            hostZoneElement = <div class="ui_dynamic_struct_container"></div>,
            localZoneElement = (
                <div class="ui_dynamic_struct_container-children"></div>
            ),
            zones = new Map([
                ..._zones,
                ["host", hostZoneElement],
                ["local", localZoneElement],
            ]);
        // When using StaticNode via widgets, it's not inserted right away.
        // and the position is lost relative to the sibling widgets to the
        // end of the container.
        // zones.get('main').append(localZoneElement);
        widgetBus.insertElement(hostZoneElement);
        super(widgetBus, zones);
        hostZoneElement.classList.add(this._cssClassName);
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

    get _cssClassName() {
        return this.constructor.CSS_CLASS_NAME;
    }

    get _label() {
        return this.constructor.LABEL;
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
                    zone: "host",
                    //, activationTest: ()=>this._displaySettings
                },
                [
                    [
                        this.widgetBus.getExternalName("availableTypes"),
                        "options",
                    ], // maybe we can determine this by the AvailableTypesModel in the internalized dependency
                    [this.widgetBus.getExternalName("typeKey"), "value"],
                ],
                GenericSelect,
                `${this._cssClassName}-select`, // baseClass
                this._label, // labelContent
                (key, availableType) => {
                    return availableType.get("label").value;
                }, // optionGetLabel
                [true, "(inherited)", ForeignKey.NULL], // [allowNull, allowNullLabel, nullModelValue]
                // This could try to convert the previous algorithm type
                // to this, but that seems at the moment complex for
                // some combinations.
                // Called within _changeState.
                this._changeTypeHandler.bind(
                    this,
                    this._injectable.getDefaults,
                    this._ppsRecord,
                ), // onChangeFn(newValue)
            ],
            [{ zone: "host" }, [], StaticNode, this._zones.get("local")],
        ];
        return widgets;
    }

    _getPPSMapForModel(ppsRecord, FieldType) {
        throw new Error(
            `KEY ERROR unknown FieldType "${FieldType.name}" ` +
                `ppsRecord: ${ppsRecord}.`,
        );
        // return fn(ppsRecord, FieldType);
    }

    _provisionWidgets() {
        const removedDynamicWidgets = this._widgets.splice(
            this._initialWidgetsAmount,
            Infinity,
        );
        // Run _BaseContainerComponent._provisionWidgets this for the
        // initial/reguluar widgets. NOTE: _BaseDynamicCollectionContainerComponent
        // does not inherit from _BaseContainerComponent, thus we can't call
        // super. But the implementation is OK.
        const requiresFullInitialUpdate =
            _BaseContainerComponent.prototype._provisionWidgets.call(this);
        const host = this.getEntry("."),
            dynInstance = host.get("instance"),
            FieldType = dynInstance.hasWrapped ? dynInstance.WrappedType : null;
        if (FieldType === null) {
            // pass
            // Will remove all dynamic widgets.
        } else if (this._ActiveInstanceType === FieldType) {
            // don't change
            this._widgets.push(...removedDynamicWidgets);
            removedDynamicWidgets.splice(0, Infinity);
        } else {
            // this._ActiveInstanceType !== FieldType
            const ppsMap = this._getPPSMapForModel(this._ppsRecord, FieldType),
                widgetDefinitions = this._defineGenericWidgets(
                    FieldType,
                    (fieldName) => FieldType.fields.has(fieldName), // basically all allowed
                    {
                        zone: "local",
                        rootPath: this.widgetBus.rootPath.append("instance"),
                    },
                    ppsMap,
                    this._injectable,
                );
            this._initWidgets(widgetDefinitions); // pushes into this._widgets
        }
        this._ActiveInstanceType = FieldType;
        for (const widgetWrapper of removedDynamicWidgets)
            this._destroyWidget(widgetWrapper);
        for (const widgetWrapper of this._widgets.slice(
            this._initialWidgetsAmount,
        )) {
            const isActive = widgetWrapper.widget !== null;
            if (!isActive) {
                // if new, initialize ..
                this._createWidget(widgetWrapper);
                requiresFullInitialUpdate.add(widgetWrapper);
            }
        }
        return requiresFullInitialUpdate;
    }

    _changeTypeHandler(getDefaults, ppsRecord, newValue) {
        (void getDefaults, ppsRecord, newValue);
        // TODO?
        //
        //   const getStateInstances = () => {
        //       const hostDraft = this.getEntry(this.widgetBus.rootPath.parent),
        //           fieldName = this.widgetBus.rootPath.parts.at(-1),
        //           wrapper = hostDraft.get(fieldName).get("instance");
        //       return { hostDraft, fieldName, wrapper };
        //   };
        //   if (newValue === ForeignKey.NULL) return;
        //
        // newValue is either 'ManualLeading' or 'AutoLinearLeading'
        //    if (newValue === "ManualLeading") {
        //        // Pre-fill the manual value from the user's configured
        //        // auto range: half-way between minLeading and maxLeading.
        //        // (The style channel no longer computes an auto
        //        // line-height — it lives in the node channel, per document
        //        // node, from the actual column width. The declared geometry
        //        // at the typeSpec scope is only a guess, so the configured
        //        // range midpoint is the meaningful conversion value.)
        //        const minRecord = ProcessedPropertiesSystemMap.createSimpleRecord(
        //                ppsRecord.propertyRoot,
        //                "minLeading",
        //            ),
        //            maxRecord = ProcessedPropertiesSystemMap.createSimpleRecord(
        //                ppsRecord.propertyRoot,
        //                "maxLeading",
        //            ),
        //            minLeading = getDefaults(
        //                minRecord,
        //                null /*fieldName not required here*/,
        //                null,
        //            ),
        //            maxLeading = getDefaults(
        //                maxRecord,
        //                null /*fieldName not required here*/,
        //                null,
        //            );
        //        if (minLeading !== null && maxLeading !== null) {
        //            const { hostDraft, fieldName, wrapper } = getStateInstances(),
        //                newInstance = createLeadingAlgorithm(
        //                    newValue,
        //                    wrapper.dependencies,
        //                );
        //            newInstance.get("instance").get("leading").value =
        //                (minLeading + maxLeading) / 2;
        //            hostDraft.set(fieldName, newInstance);
        //            return;
        //        }
        //        // else: try to get a default via the below
        //    }

        //    // Using a default because leading algorithms can't be easily
        //    // converted into each other (auto to manual would work but manual
        //    // to auto would be really hard and useless). It's different to color,
        //    // where there's always a conversion from one to another.
        //    const defaultPPSRecord =
        //            ProcessedPropertiesSystemMap.createSimpleRecord(
        //                ppsRecord.prefix,
        //                `@${newValue}`,
        //            ),
        //        defaultValue = getDefaults(
        //            defaultPPSRecord,
        //            null /*fieldName not required here*/,
        //            null,
        //        );
        //    if (defaultValue === null) return;
        //    const { hostDraft, fieldName, wrapper } = getStateInstances(),
        //        newInstance = deserializeLeadingAlgorithmModel(
        //            wrapper.dependencies,
        //            defaultValue,
        //        );
        //    if (newValue !== newInstance.get("leadingAlgorithmTypeKey").value)
        //        // This is a sanity check, it's not necessarily required to
        //        // ensure the app is working, but at this point the assertion
        //        // is that the defaultValue produces a type that aligns
        //        // with newValue.
        //        throw new Error(
        //            `ASSERTION FAILED new instance should be a "${newInstance}" ` +
        //                `but it's a  "${newInstance.get("leadingAlgorithmTypeKey").value}"`,
        //        );
        //    hostDraft.set(fieldName, newInstance);
    }
}

export class UIHorizontalLayoutAlgorithm extends UIDynamicStructContainer {
    static CSS_CLASS_NAME = "ui_horizontal-layout-algorithm_container";
    static LABEL = "Horizontal Layout Algorithm";

    // TODO
    _getPPSMapForModel(ppsRecord, FieldType) {
        let fn;
        if (
            FieldType === ManualHorizontalLayoutModel ||
            FieldType === HorizontalLayoutRunionModel
        )
            fn = getGenericPPSMap;
        else
            // may just throw the KEY ERROR
            return super._getPPSMapForModel(ppsRecord, FieldType);
        return fn(ppsRecord, FieldType);
    }
}

export class UIColumnGutterAlgorithm extends UIDynamicStructContainer {
    static CSS_CLASS_NAME = "column-gutter-algorithm_container";
    static LABEL = "Column Gutter Algorithm";
    // ConstantColumnGutterModel,
    // LinearColumnGutterModel

    _getPPSMapForModel(ppsRecord, FieldType) {
        let fn;
        if (
            FieldType === ConstantColumnGutterModel ||
            FieldType === LinearColumnGutterModel
        )
            fn = getGenericPPSMap;
        else
            // may just throw the KEY ERROR
            return super._getPPSMapForModel(ppsRecord, FieldType);
        return fn(ppsRecord, FieldType);
    }
}

export class UIGrowColumns extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        const h = widgetBus.domTool.h,
            localZoneElement = <div class="ui_grow_columns"></div>,
            zones = new Map([..._zones, ["local", localZoneElement]]);
        widgetBus.insertElement(localZoneElement);
        super(widgetBus, zones);

        const EnumModeModel = this.getEntry("./mode").constructor.Model,
            NumericValueModel =
                this.getEntry("./numericValue").constructor.Model;
        this._initWidgets([
            [
                { zone: "local" },
                [],
                StaticNode,
                <label>
                    <span>Grow Columns</span>
                </label>,
            ],
            [
                {
                    zone: "local",
                    activationTest: (getEntry) => !getEntry("value").isEmpty,
                },
                [["numericValue", "value"]],
                UINumberAndRangeInput,
                null, // label
                null, // unit
                NumericValueModel.ppsDefaultSettings, // minMaxValueStep, e.g. {min:0 , step:0.01, 'default': 36}
            ],
            [
                { zone: "local" },
                [["mode", "value"]],
                UISelectOrEmptyInput,
                // TODO: do we need this to respond to inherited values
                // I think, so far, the GrowColumnsModel is propagated
                // as an atomic value, not differentiated into two distinct
                // values.
                () => EnumModeModel.defaultValue, // require('getDefault'),
                // as we don't change the default value depending on
                // external circumstances, it's safe to not look at
                // external circumstances for updating.
                () => false, // require('requireUpdateDefaults')
                null, //label
                EnumModeModel.enumItems, // items ]]
            ],
        ]);
    }
}
