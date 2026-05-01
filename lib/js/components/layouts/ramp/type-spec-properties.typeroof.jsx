import {
    _CommonContainerComponent,
    _BaseDynamicCollectionContainerComponent,
} from "../../basics.mjs";
import { Path, getEntry, ForeignKey } from "../../../metamodel.mjs";
import { StaticTag, UILineOfTextInput, DynamicTag } from "../../generic.mjs";
import { FontSelect } from "../../font-loading.mjs";
import { typeSpecGetDefaults } from "./defaults.mjs";
import {
    ProcessedPropertiesSystemMap,
    SPECIFIC,
} from "../../registered-properties-definitions.mjs";
import {
    UITypeDrivenContainer,
    genericTypeToUIElement,
} from "../../type-driven-ui.mjs";
import { TYPESPEC_PPS_MAP } from "./pps-maps.mjs";
import { UIshowProcessedProperties } from "../../processed-properties.mjs";
import { TypeSpecModel } from "../../type-spec-models.mjs";
import { identity } from "../../../util.mjs";

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
            getDefaults = typeSpecGetDefaults.bind(null, getLiveProperties);
        const widgets = [
            [
                {
                    zone: "main",
                },
                [],
                StaticTag,
                "h3",
                {},
                (typeSpecPath.equals(rootTypeSpecPath) ? "Origin " : "") +
                    `TypeSpec`,
            ],
            [
                {
                    rootPath: typeSpecPath,
                    zone: "main",
                },
                [["label", "value"]],
                UILineOfTextInput,
                "Label",
            ],
            [
                {
                    rootPath: typeSpecPath,
                    zone: "main",
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
                    return (
                        `${font.nameVersion}` +
                        (inherited ? " (inherited)" : "")
                    );
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
            [
                { rootPath: typeSpecPath, zone: "main" },
                [],
                UITypeDrivenContainer,
                this._zones,
                {
                    getDefaults: getDefaults,
                    updateDefaultsDependencies,
                    genericTypeToUIElement,
                    requireUpdateDefaults,
                },
                TYPESPEC_PPS_MAP,
            ],
            [
                {
                    rootPath: typeSpecPath,
                    zone: "main",
                },
                [
                    [".", "referenceItem"],
                    ["typeSpecProperties@", "properties@"],
                ],
                UIshowProcessedProperties,
                "TypeSpec",
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
                const path = rootPath.append("children", ...pathOrEmpty.value),
                    rootState = this.getEntry("/"),
                    pathExists = getEntry(rootState, path, false) !== false;
                return [pathExists ? path : rootPath, pathExists];
            })(pathOrEmpty),
            rebuild = changedMap.has("typeSpecPath") || !pathExists;
        if (rebuild) {
            for (const widgetWrapper of this._widgets) widgetWrapper.destroy();
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
