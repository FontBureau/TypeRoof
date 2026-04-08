import { _BaseContainerComponent } from "../../basics.mjs";
import { FontSelect } from "../../font-loading.mjs";
import {
    UITypeDrivenContainer,
    genericTypeToUIElement,
} from "../../type-driven-ui.mjs";
import { typeSpecGetDefaults } from "./type-spec-get-defaults.mjs";
import {
    SPECIFIC,
    ProcessedPropertiesSystemMap,
} from "../../registered-properties-definitions.mjs";
import { ForeignKey } from "../../../metamodel.mjs";
import { TYPESPEC_PPS_MAP } from "./typespec-pps-map.mjs";
import { UICompositeStylePatch } from "./ui-composite-style-patch.typeroof.jsx";

function getRequireUpdateDefaultsFn(updateDefaultsNames) {
    return (changedMap) =>
        Array.from(changedMap.keys()).some((name) =>
            updateDefaultsNames.has(name),
        );
}

/*
 * TODO: this is a very simple nice concept:
 * taking an dynamic type and building specific interfaces
 * for the specific type. This could also be done
 * in a parent, but like this it feels like it makes a clear
 * concept.
 * UIDocumentNode does the same, so the basics of these
 * two implemations should become class in basics.
 * _provisionWidgets/constructor and probably a
 * NOT IMPLEMENTED raising version of _createWrapperForType
 * Though, mapping of concrete type to it's interface(s) may also
 * become a configuration thing eventually.
 * Can this case be handled with type-driven-ui? It should probably.
 *
 * NOTE: UIAxesMathLocationsSumItem also implements this concept,
 * hence, maybe it could be a mixin-approach as UIAxesMathLocationsSumItem
 * already extends _UIBaseListContainerItem.
 */
export class UIStylePatch extends _BaseContainerComponent {
    constructor(widgetBus, zones /*, originTypeSpecPath*/) {
        super(widgetBus, zones);
        // this._originTypeSpecPath = originTypeSpecPath;
        this._currentTypeKey = null;
    }

    _createWrappersForType(typeKey) {
        const widgets = [],
            settings = {
                // document/nodes/{key}
                rootPath: this.widgetBus.rootPath.append("instance"),
                zone: "local",
            };
        let Constructor, dependencyMappings, args;
        if (typeKey === "SimpleStylePatch") {
            // need a handling for the font selection!
            widgets.push([
                { ...settings },
                [["/availableFonts", "options"], "activeFontKey"],
                FontSelect,
                true,
            ]);

            dependencyMappings = [];
            Constructor = UITypeDrivenContainer;

            const getLiveProperties = () => {
                    return null;
                    // NOTE: I don't think this case happens anymore, as
                    // typeSpecPropertiesKey no longer tries to reference
                    // the parent.
                    //    return typeSpecPropertiesKey === 'typeSpecProperties@'
                    //        ? null
                    //        : this.getEntry(typeSpecPropertiesKey)
                    //        ;
                },
                getDefaults = (ppsRecord, fieldName, modelDefaultValue) => {
                    if (ppsRecord.fullKey === `${SPECIFIC}font`) {
                        const activeFontKey = this.getEntry(
                            settings.rootPath.append("activeFontKey"),
                        ); //.append('activeFontKey'));
                        if (activeFontKey.value !== ForeignKey.NULL) {
                            const installedFonts =
                                this.getEntry("/installedFonts");
                            return installedFonts.get(activeFontKey.value)
                                .value;
                        }
                    }
                    return typeSpecGetDefaults(
                        getLiveProperties,
                        ppsRecord,
                        fieldName,
                        modelDefaultValue,
                    );
                },
                // AxesLocationsModel seems to require 'typeSpecProperties@'
                // which causes:
                //      Uncaught (in promise) Error: KEY ERROR not found identifier
                //      "typeSpecProperties@/activeState/stylePatchesSource/bold/instance"
                //      in [ProtocolHandler typeSpecProperties@]:
                //      typeSpecProperties@/activeState/typeSpec.
                //
                // We could filter the TYPESPEC_PPS_MAP and try to avoid
                // the error by not using AxesLocationsModel.
                //console.log(`${this} TYPESPEC_PPS_MAP`, TYPESPEC_PPS_MAP);

                // console.log(`${this} ... ${this.widgetBus.rootPath.append('instance')}`,
                //         this.widgetBus.getEntry(this.widgetBus.rootPath.append('instance')));
                // keys are:
                //    "baseFontSize", "relativeFontSize", "textColor",
                //    "backgroundColor", "autoOPSZ", "axesLocations",
                //    "activeFontKey", "font", "installedFonts"

                removeItems = new Set([
                    // 'baseFontSize' // Maybe only use in paragraph context
                ]),
                PPS_MAP = new ProcessedPropertiesSystemMap(
                    Array.from(TYPESPEC_PPS_MAP.entries()).filter(
                        ([key]) => !removeItems.has(key),
                    ),
                ),
                // keys is this are:
                //    "columnWidth", "leading", "baseFontSize", "relativeFontSize",
                //     "textColor", "backgroundColor", "stylePatches"
                // minus: "axesLocations" of course
                //
                // The main diff to the model are:
                //      "columnWidth", "leading"
                // The following are expected to be missing as well:
                //      "activeFontKey", "font", "installedFonts"

                // console.log(`${this} PPS_MAP`, PPS_MAP);
                updateDefaultsDependencies = [
                    // FIXME: here a fundamental flaw of the concept becomes apparent:
                    // font is only required for the OpenType-Features UI, but via this
                    // mechanism, the dependency is also injected into the ColorChooser
                    // UI. if we use "./font" as external name, the ColorChooser fails
                    // with a key error, as it doesn't have a font property. Using the
                    // absolute path fixes the symptom, howver, ColorChooser is now
                    // still loaded with the font dependency, which it doesn't have!
                    [
                        `${this.widgetBus.rootPath.append("instance/activeFontKey")}`,
                        "activeFontKey",
                    ],
                ];
            args = [
                this._zones,
                {
                    // injectable
                    getDefaults,
                    // Using updateDefaultsDependencies (with typeSpecProperties@) in here causes an error:
                    //          via VideoproofController constructor initial resources: Error:
                    //          KEY ERROR not found identifier "typeSpecProperties@/activeState/typeSpec/textColor"
                    //          in [ProtocolHandler typeSpecProperties@]: typeSpecProperties@/activeState/typeSpec.
                    // Maybe this key is flawed in this context?
                    updateDefaultsDependencies,
                    genericTypeToUIElement,
                    requireUpdateDefaults: getRequireUpdateDefaultsFn(
                        new Set(
                            updateDefaultsDependencies.map((item) =>
                                typeof item === "string" ? item : item.at(-1),
                            ),
                        ),
                    ),
                },
                // FIXME: the type of the root element should be fixed
                // to TypeSpec as well! (what does this mean?)
                PPS_MAP,
                //, 'Hello UITypeDrivenContainer'// label
            ];
        } else if (typeKey === "CompositeStylePatch") {
            dependencyMappings = [
                ["./styles", "collection"],
                [this.widgetBus.getExternalName("sourceMap"), "sourceMap"],
            ];
            Constructor = UICompositeStylePatch;
            args = [this._zones];
        } else throw new Error(`KEY ERROR unknown typeKey ${typeKey}.`);

        widgets.push([settings, dependencyMappings, Constructor, ...args]);
        return widgets.map((widget) =>
            this._initWrapper(this._childrenWidgetBus, ...widget),
        );
    }

    _provisionWidgets(/* compareResult */) {
        const node = this.getEntry("."),
            typeKey = node.get("stylePatchTypeKey").value;
        if (this._currentTypeKey === typeKey) return new Set();
        this._currentTypeKey = typeKey;
        const newWrappers = this._createWrappersForType(typeKey),
            deleted = this._widgets.splice(0, Infinity, ...newWrappers);
        for (const wrapper of deleted) this._destroyWidget(wrapper);
        return super._provisionWidgets();
    }
}
