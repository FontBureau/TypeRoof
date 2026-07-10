import {
    _CommonContainerComponent,
    _BaseDynamicCollectionContainerComponent,
} from "../../basics.mjs";
import { Path, getEntry, ForeignKey } from "../../../metamodel.mjs";
import {
    UILineOfTextInput,
    DynamicTag,
    CollapsibleContainer,
} from "../../generic.mjs";
import { FontSelect } from "../../font-loading.mjs";
import { typeSpecGetDefaults } from "./defaults.mjs";
import {
    ProcessedPropertiesSystemMap,
    SPECIFIC,
} from "../../registered-properties-definitions.mjs";

import { require } from "../../dependency-injection.mjs";

import {
    UITypeDrivenContainer,
    createTypeToUIElementFunction,
} from "../../type-driven-ui-basics.mjs";
import { genericTypeToUIElement } from "../../type-driven-ui.mjs";
import { TYPESPEC_PPS_MAP } from "./pps-maps.mjs";
import { UIshowProcessedPropertiesCollapsible } from "../../processed-properties.mjs";
import { TypeSpecModel } from "../../type-spec-models.mjs";
import { identity } from "../../../util.mjs";

import {
    AxesLocationsModel,
    UIManualAxesLocations,
} from "../../ui-manual-axis-locations.mjs";

import { ManualMarginsModel } from "../../type-spec-models.mjs";

import { UIMargins } from "../../ui-margins.typeroof.jsx";

import {
    LanguageTagModel,
    UILanguageTag,
} from "../../language-tags.typeroof.jsx";

import { OpenTypeFeaturesModel } from "../../actors/models.mjs";

import { UIOTFeaturesChooser } from "../../ui-opentype-features.typeroof.jsx";

class UIFontLabel extends DynamicTag {
    constructor(
        widgetBus,
        ppsRecord,
        tag,
        attr,
        formatter = identity,
        initialContent = "(initializing)",
    ) {
        super(widgetBus, tag, attr, formatter, initialContent);
        this._ppsRecord = ppsRecord;
    }
    update(changedMap) {
        if (changedMap.has("rootFont") || changedMap.has("properties@")) {
            const propertyValuesMap = (
                    changedMap.has("properties@")
                        ? changedMap.get("properties@")
                        : this.getEntry("properties@")
                ).typeSpecnion.getProperties(),
                font = propertyValuesMap.has(this._ppsRecord.fullKey)
                    ? propertyValuesMap.get(this._ppsRecord.fullKey)
                    : // rootFont can't be ForeignKey.NULL
                      this.getEntry("rootFont").value;
            const inherited = this.getEntry("font") === ForeignKey.NULL;
            this.element.textContent = this._formatter(font, inherited);
        }
    }
}

const uiElementMap = new Map([
        [
            AxesLocationsModel,
            [
                UIManualAxesLocations,
                require("settings:internalPropertyName", "axesLocations"),
                require("settings:dependencyMapping", [
                    "baseFontSize",
                    "fontSize",
                ]),
                // NOTE setting dependencyMapping 'font' without
                // 'properties@' and 'rootFont' also works, but that is
                // used in manual configurations.
                // Where this configurarion is used in type-spec-ramp
                // the NEW WAY is required..
                // TODO: rootFont should not be required.
                require("settings:dependencyMapping", ["/font", "rootFont"]),
                require("settings:dependencyMapping", [
                    "typeSpecProperties@",
                    "properties@",
                ]),
                require("settings:dependencyMapping", "autoOPSZ"),
                require("raw:getDefaults"), // used to be: this._getDefaults.bind(this)
                require("ppsRecord"),
                // within dependencyMappings: ...updateDefaultsDependencies
                // but also injects raw:requireUpdateDefaults
                require("requireUpdateDefaults"),
                ({ h }) => (
                    <h4 class="manual_axes_locations-label">
                        Variable Font Axes
                    </h4>
                ),
            ],
        ],
        [
            OpenTypeFeaturesModel,
            [
                UIOTFeaturesChooser,
                //, require('settings:rootPath')
                require("settings:internalPropertyName", "openTypeFeatures"),
                require("settings:dependencyMapping", ["/font", "rootFont"]),
                // badly portable!
                // , require('settings:dependencyMapping', ['typeSpecProperties@', 'properties@'])
                // in injectable do: 'properties@': ['typeSpecProperties@', 'properties@']
                require("zones"),
                require("raw:getDefaults"),
                require("requireUpdateDefaults"),
                require("updateDefaultsDependencies"),
                ({ h }) => (
                    <h4 class="ui_opentype_features_chooser-label">
                        OpenType Features
                    </h4>
                ),
            ],
        ],
        [
            LanguageTagModel,
            [
                UILanguageTag,
                require("settings:rootPath"),
                require("zones"),
                // This doesn't work, instead updateDefaultsDependencies is used.
                //, require('settings:dependencyMapping', ['typeSpecProperties@', 'properties@'])
                require("settings:updateDefaultsDependencies"),
                null,
            ],
        ],
        [
            ManualMarginsModel,
            [
                UIMargins,
                require("settings:rootPath"),
                require("zones"),
                ({ h }) => <h4 class="ui-margins-label">Vertical Margins</h4>,
            ],
        ],
    ]),
    orEmptyUIElementMap = new Map(),
    typeSpecTypeToUIElement = createTypeToUIElementFunction(
        uiElementMap,
        orEmptyUIElementMap,
        genericTypeToUIElement,
    );
export class TypeSpecPropertiesManager extends _CommonContainerComponent {
    // jshint ignore:start
    /**
     * could be as well:
     * initialUpdate(...args){
     *     return _BaseDynamicCollectionContainerComponent.prototype.initialUpdate.call(this, ...args);
     * }
     */
    initialUpdate =
        _BaseDynamicCollectionContainerComponent.prototype.initialUpdate;
    // jshint ignore:end
    constructor(widgetBus, zones) {
        // provision widgets dynamically!
        super(widgetBus, zones);
        this._collapsibleStates = new Map();
    }
    get dependencies() {
        const dependencies = super.dependencies;
        dependencies.add(this.widgetBus.getExternalName("typeSpecPath"));
        return dependencies;
    }
    get modelDependencies() {
        const dependencies = super.modelDependencies;
        dependencies.add(this.widgetBus.getExternalName("typeSpecPath"));
        return dependencies;
    }

    _getCollapsibleState(id, defaultVal) {
        return this._collapsibleStates.has(id)
            ? this._collapsibleStates.get(id)
            : defaultVal;
    }

    _storeCollapsibleState(id, state) {
        this._collapsibleStates.set(id, state);
    }

    _createTypeSpecWrappers(typeSpecPath, rootTypeSpecPath) {
        const TypeClass = this.widgetBus.getEntry(typeSpecPath).constructor;
        if (TypeClass !== TypeSpecModel)
            // NOTE: The uses of TYPESPEC_PPS_MAP kind of binds this to
            // that Type. But this check is not strictly required, it's
            // a sanity check to confirm an assumption that was prevailing
            // when this code was written.
            throw new Error(
                `TYPE ERROR expected TypeSpecModel at path ${typeSpecPath} but instead got ${TypeClass.name}.`,
            );

        const typeSpecPropertiesKey = `typeSpecProperties@${typeSpecPath}`,
            updateDefaultsDependencies = [
                [typeSpecPropertiesKey, "properties@"],
            ],
            requireUpdateDefaults = (/*changedMap*/) => {
                return true;
            },
            getLiveProperties = () => {
                return typeSpecPropertiesKey === "typeSpecProperties@"
                    ? null
                    : this.getEntry(typeSpecPropertiesKey);
            },
            getDefaults = typeSpecGetDefaults.bind(null, getLiveProperties),
            filteredTypeDriven = (keys, createOwnLocalZone = false) => {
                const filteredPPSMap = new Map();
                for (const key of keys) {
                    if (!TYPESPEC_PPS_MAP.has(key))
                        throw new Error(
                            `KEY ERROR TYPESPEC_PPS_MAP does ` +
                                `not have key "${key}" known entries: ` +
                                `${Array.from(TYPESPEC_PPS_MAP.keys()).join(", ")}.`,
                        );
                    filteredPPSMap.set(key, TYPESPEC_PPS_MAP.get(key));
                }
                return [
                    { rootPath: typeSpecPath, zone: "main" },
                    [],
                    UITypeDrivenContainer,
                    this._zones,
                    {
                        getDefaults: getDefaults,
                        updateDefaultsDependencies,
                        genericTypeToUIElement: typeSpecTypeToUIElement,
                        requireUpdateDefaults,
                    },
                    filteredPPSMap,
                    false, // label
                    createOwnLocalZone, // createOwnLocalZone === false: uses wrapper.host instead i.e. "main"
                ];
            },
            sections = {
                language: ["languageTag", "direction"],
                typeface: [
                    "baseFontSize",
                    "relativeFontSize",
                    "openTypeFeatures",
                    "axesLocations",
                ],
                horizontal: ["columnWidth", "textAlign"],
                vertical: ["leading", "blockMargins"],
                color: ["textColor", "backgroundColor"],
            };
        {
            const used = new Set(Array.from(Object.values(sections)).flat());
            sections.rest = Array.from(TYPESPEC_PPS_MAP.keys()).filter(
                (k) => !used.has(k),
            );
        }
        const widgets = [
            [
                {
                    zone: "main",
                    rootPath: typeSpecPath,
                },
                [["label", "data"]],
                DynamicTag,
                "h3",
                {},
                (label) => {
                    return (
                        (typeSpecPath.equals(rootTypeSpecPath)
                            ? "Origin "
                            : "") +
                        `TypeSpec` +
                        (label !== "" ? ` ${label}` : "")
                    );
                },
            ],
            [
                {
                    zone: "main",
                    id: "typespec_language_and_script_collapsible",
                },
                [],
                CollapsibleContainer,
                this._zones,
                "Language and Script",
                "minimal",
                "typespec_language_and_script", //classNameParticle
                [filteredTypeDriven(sections.language)] /* widgets */,
                this._getCollapsibleState(
                    "typespec_language_and_script_collapsible",
                    false,
                ), // open
                false, // scroll
            ],
            [
                { zone: "main", id: "typespec_typeface_and_size_collapsible" },
                [],
                CollapsibleContainer,
                this._zones,
                "Typeface and Size",
                "minimal",
                "typespec_typeface_and_size", //classNameParticle
                [
                    [
                        {
                            rootPath: typeSpecPath,
                            zone: "label",
                        },
                        [
                            "font",
                            ["/font", "rootFont"],
                            ["typeSpecProperties@", "properties@"],
                        ],
                        UIFontLabel,
                        ProcessedPropertiesSystemMap.createSimpleRecord(
                            SPECIFIC,
                            "font",
                        ),
                        "span",
                        {},
                        (font, inherited = false) => {
                            return ` ${font.name}`;
                            //+ (inherited ? " (inherited)" : "")
                        },
                    ],
                    [
                        {
                            rootPath: typeSpecPath,
                            zone: "main",
                        },
                        [["/availableFonts", "options"], "activeFontKey"],
                        FontSelect,
                        true,
                    ],
                    filteredTypeDriven(sections.typeface),
                ],
                this._getCollapsibleState(
                    "typespec_typeface_and_size_collapsible",
                    false,
                ), // open
                false, // scroll
            ],
            [
                { zone: "main", id: "typespec_horizontal_layout_collapsible" },
                [],
                CollapsibleContainer,
                this._zones,
                "Horizontal Layout",
                "minimal",
                "typespec_horizontal_layout", //classNameParticle
                [filteredTypeDriven(sections.horizontal)] /* widgets */,
                this._getCollapsibleState(
                    "typespec_horizontal_layout_collapsible",
                    false,
                ), // open
                false, // scroll
            ],
            [
                { zone: "main", id: "typespec_vertical_layout_collapsible" },
                [],
                CollapsibleContainer,
                this._zones,
                "Vertical Layout",
                "minimal",
                "typespec_vertical_layout", //classNameParticle
                [filteredTypeDriven(sections.vertical)] /* widgets */,
                this._getCollapsibleState(
                    "typespec_vertical_layout_collapsible",
                    false,
                ), // open
                false, // scroll
            ],
            filteredTypeDriven([...sections.color, ...sections.rest], true),
            [
                {
                    rootPath: typeSpecPath,
                    zone: "main",
                },
                [
                    [".", "referenceItem"],
                    ["typeSpecProperties@", "properties@"],
                ],
                UIshowProcessedPropertiesCollapsible,
                this._zones,
            ],
            [
                { zone: "main", id: "typespec_inherent_settings_collapsible" },
                [],
                CollapsibleContainer,
                this._zones,
                "settings",
                "minimal",
                "typespec_inherent_settings", //classNameParticle
                [
                    // widgets
                    [
                        {
                            rootPath: typeSpecPath,
                            zone: "main",
                        },
                        [["label", "value"]],
                        UILineOfTextInput,
                        "TypeSpec Label",
                    ],
                ],
                this._getCollapsibleState(
                    "typespec_inherent_settings_collapsible",
                    false,
                ), // isOpened = false,
                false, // scroll = false,
            ],
        ];
        return widgets.map((widgetArgs) =>
            this._initWrapper(this._childrenWidgetBus, ...widgetArgs),
        );
    }

    _provisionWidgets(compareResult) {
        const changedMap = this._getChangedMapFromCompareResult(compareResult),
            pathOrEmpty = changedMap.has("typeSpecPath")
                ? changedMap.get("typeSpecPath")
                : this.getEntry("typeSpecPath"),
            rootPath = Path.fromString(
                this.widgetBus.getExternalName("rootTypeSpec"),
            ),
            [path, pathExists] = ((pathOrEmpty) => {
                if (pathOrEmpty.isEmpty) return [rootPath, true];
                const path = rootPath.append(...pathOrEmpty.value),
                    rootState = this.getEntry("/"),
                    pathExists = getEntry(rootState, path, false) !== false;
                return [pathExists ? path : rootPath, pathExists];
            })(pathOrEmpty),
            rebuild = changedMap.has("typeSpecPath") || !pathExists;
        if (rebuild) {
            for (const widgetWrapper of this._widgets) {
                if (widgetWrapper.WidgetClass === CollapsibleContainer)
                    this._storeCollapsibleState(
                        widgetWrapper.id,
                        widgetWrapper.widget.isOpen,
                    );
                this._destroyWidget(widgetWrapper);
            }
            this._widgets.splice(0, Infinity);
        }
        const requiresFullInitialUpdate = new Set(),
            widgetWrappers = [];

        if (rebuild) {
            widgetWrappers.push(
                ...this._createTypeSpecWrappers(path, rootPath),
            );
        }

        this._widgets.push(...widgetWrappers);
        for (const widgetWrapper of widgetWrappers) {
            this._createWidget(widgetWrapper);
            requiresFullInitialUpdate.add(widgetWrapper);
        }

        return requiresFullInitialUpdate;
    }
}
