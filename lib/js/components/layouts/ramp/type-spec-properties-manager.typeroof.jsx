import {
    _CommonContainerComponent,
    _BaseDynamicCollectionContainerComponent,
} from "../../basics.mjs";
import { Path, getEntry } from "../../../metamodel.mjs";
import { StaticTag, UILineOfTextInput } from "../../generic.mjs";
import { UIFontLabel } from "./ui-font-label.typeroof.jsx";
import { FontSelect } from "../../font-loading.mjs";
import { typeSpecGetDefaults } from "./type-spec-get-defaults.mjs";
import {
    ProcessedPropertiesSystemMap,
    SPECIFIC,
} from "../../registered-properties-definitions.mjs";
import {
    UITypeDrivenContainer,
    genericTypeToUIElement,
} from "../../type-driven-ui.mjs";
import { TYPESPEC_PPS_MAP } from "./typespec-pps-map.mjs";
import { UIshowProcessedProperties } from "../../processed-properties.mjs";
import { TypeSpecModel } from "../../type-spec-models.mjs";

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

        // Not sure how this is exactly needed/used
        // It seems like this is to capture and react to changes
        // in a parent, but so far, the parent can't be changed
        // because only one ui is visible at any time. Anyways
        // A change in a parent is only transported via typeSpecProperties@
        // but it's possible that we should reference the parent
        // typeSpecProperties@ here rather than the own.
        // require a parent animationProperties@ reference?
        // In stage-and-actors we find>
        //      this._animationPropertiesKey = `animationProperties@${this.widgetBus.rootPath.append('..', '..')}`;
        // In TypeSpecChildrenMeta we find:
        //       [`typeSpecProperties@${rootPath.append('..', '..')}`, '@parentProperties']
        //
        // So far it looks right to reference the current typeSpecProperties
        // not the parent. this is used in getLiveProperties via typeSpecGetDefaults
        // and it seems accurate to read the value on this level and not
        // on the parent level.
        const typeSpecPropertiesKey = `typeSpecProperties@${typeSpecPath}`, //.append('..', '..')}`
            //, updateDefaultsDependencies = [
            //      // [this._animationPropertiesKey, 'animationProperties@']
            //      // ['typeSpecProperties@', 'typeSpecProperties@']
            //      [typeSpecPropertiesKey, 'typeSpecProperties@']
            //  ]
            //, _updateDefaultsNames = new Set(Array.from(zip(...updateDefaultsDependencies))[1])
            updateDefaultsDependencies = [
                [typeSpecPropertiesKey, "properties@"],
            ],
            requireUpdateDefaults = (/*changedMap*/) => {
                // FIXME: in this context, this method seems broken!
                // for once, it contains e.g. `value` as key in changedMap
                // but without calling context, it's not possible to turn
                // that into a more meaningful key.
                // Also, in UIManualAxesLocations opsz/autopsz is not properly
                // initialized when this returns false.
                // Since we are not in an animation context, we may
                // get away with always returning true, without a big
                // performance hit.

                // const result = Array.from(changedMap.keys())
                //                         .some(name=>_updateDefaultsNames.has(name));
                // console.warn(`>>>${this} requireUpdateDefaults ${result} changedMap:`, changedMap);
                // return result;
                return true;
            },
            getLiveProperties = () => {
                // NOTE: I don't think this case happens anymore, as
                // typeSpecPropertiesKey no longer tries to reference
                // the parent.
                return typeSpecPropertiesKey === "typeSpecProperties@"
                    ? null
                    : this.getEntry(typeSpecPropertiesKey);
            },
            getDefaults = typeSpecGetDefaults.bind(null, getLiveProperties);
        // console.log(`${this}updateDefaultsDependencies = `, updateDefaultsDependencies)
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
                    "font", // requires local font only to indicate inheritance
                    // especially, so far, for this, it would be
                    // maybe better to get the rootFont via a primal
                    // typeSpecnion, rather than via a last reserver
                    // query into the model. Especially because there
                    // will always be the /font. For the other
                    // properties, however, it could be handled similarly,
                    // not having to query getDefaults ...
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
            // This should be set up using some kind of "template"
            // system, i.e.
            // - that fg/bf colors appear next to each other
            // - there's no double/multi defintion UI-widgets for the same item (label is defined above)
            // - some items don't require a widget, here maybe  `children` as
            //   those are already handled in the "Type-Spec Manager"
            // - autoOPSZ will be covered by UIManualAxesLocation and does
            //   not need extra handling
            // so far we have e.g. fontSize here and it's a NumberOrEmptyModel
            // but it says: Can't find generic UI-Element
            //
            // FIXME: Half way there.
            // The template would need to describe
            //      which types to use/not use
            //      where to put them
            //      how to group or separate them
            //      NOTE however, the color-picker may be a nice example
            //      for existing grouping behavior.
            [
                { rootPath: typeSpecPath, zone: "main" },
                [],
                UITypeDrivenContainer,
                // widgetBus, _zones
                this._zones,
                {
                    // injectable
                    getDefaults: getDefaults,
                    // Using updateDefaultsDependencies (with typeSpecProperties@) in here causes an error:
                    //          via VideoproofController constructor initial resources: Error:
                    //          KEY ERROR not found identifier "typeSpecProperties@/activeState/typeSpec/textColor"
                    //          in [ProtocolHandler typeSpecProperties@]: typeSpecProperties@/activeState/typeSpec.
                    // Maybe this key is flawed in this context?
                    updateDefaultsDependencies,
                    genericTypeToUIElement,
                    requireUpdateDefaults,
                    // 'properties@': ['typeSpecProperties@', 'properties@']
                },
                // FIXME: the type of the root element should be fixed
                // to TypeSpecModel as well!
                TYPESPEC_PPS_MAP,
                // , 'Hello UITypeDrivenContainer'// label
            ],
            [
                {
                    rootPath: typeSpecPath,
                    zone: "main",
                },
                [
                    [".", "referenceItem"],
                    ["typeSpecProperties@", "properties@"],
                    // This is probably not required for the CommonActorProperties at all.
                ],
                UIshowProcessedProperties,
                "TypeSpec",
            ],
        ];
        // this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
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
            // If pathOrEmpty is empty or if the currently selected
            // (via typeSpecPath) TypeSpec got deleted and it doesn't exist
            // anymore, fallback to rootTypeSpec.
            [path, pathExists] = ((pathOrEmpty) => {
                if (pathOrEmpty.isEmpty)
                    // Assert rootPath always exists.
                    return [rootPath, true];
                const path = rootPath.append("children", ...pathOrEmpty.value),
                    rootState = this.getEntry("/"),
                    pathExists = getEntry(rootState, path, false) !== false;
                return [pathExists ? path : rootPath, pathExists];
            })(pathOrEmpty),
            rebuild = changedMap.has("typeSpecPath") || !pathExists;
        if (rebuild) {
            // deprovision widgets
            for (const widgetWrapper of this._widgets) widgetWrapper.destroy();
            this._widgets.splice(0, Infinity); // equivalent to clear() in a map
        }
        const requiresFullInitialUpdate = new Set();

        // Keeping for debugging for now:
        // console.log(`${this.constructor.name}._provisionWidgets(compareResult):`, ...changedMap.keys()
        //     , `\n actor !== null`, actor !== null
        //     , `\n changedMap.has('actorPath')`, changedMap.has('actorPath')
        //     , `\n typeChanged`, typeChanged, `actorTypeKey`, actorTypeKey
        //     , `\n rebuild`, rebuild
        // )

        const widgetWrappers = [];

        if (rebuild) {
            // If widget types change this has to react as well
            // and actorPath could be present, but the actor could not be
            // in actors anymore, as we can't use ForeingKey constraints
            // with this link currently!
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
