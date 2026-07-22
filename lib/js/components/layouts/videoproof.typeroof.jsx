import {
    Path,
    getEntry,
    getDraftEntry,
    ForeignKey,
    unwrapPotentialWriteProxy,
    CoherenceFunction,
    StaticDependency,
    BooleanDefaultTrueModel,
} from "../../metamodel.mjs";

import { zip } from "../../util.mjs";

import {
    _BaseContainerComponent,
    _BaseDynamicCollectionContainerComponent,
    _BaseComponent,
    SimpleProtocolHandler,
    UIButton,
} from "../basics.mjs";

import {
    DynamicTag,
    UICheckboxOrEmptyInput,
    Collapsible,
    UICheckboxInput,
    GenericSelect,
    StaticNode,
} from "../generic.mjs";

import { createIcon } from "../icons.mjs";

import { _BaseLayoutModel } from "../main-model.mjs";

import { FontSelect } from "../font-loading.mjs";

import {
    timeControlModelMixin,
    AnimationTGenerator,
} from "../animation-fundamentals.mjs";

import {
    culoriToColor,
    getColorFromPropertyValuesMap,
    colorToCulori,
    enhanceContrast,
} from "../color.mjs";

import {
    converter as culoriConverter,
    formatCss as culoriFormatCss,
    blend,
} from "../../vendor/culori/bundled/culori.mjs";

import {
    createActor,
    AvailableActorTypesModel,
    ActorsModel,
} from "../actors/actors-base.mjs";

import {
    activatableActorTypes,
    getActorWidgetSetup,
} from "../actors/available-actors.mjs";

import { actorApplyCSSColors } from "../actors/properties-util.mjs";

import {
    getRegisteredPropertySetup,
    isInheritingPropertyFn,
} from "../registered-properties.mjs";

import {
    COLOR,
    SPECIFIC,
    GENERIC,
    ProcessedPropertiesSystemMap,
} from "../registered-properties-definitions.mjs";

import {
    _BaseTypeDrivenContainerComponentMixin,
    simpleArgument,
} from "../type-driven-ui-basics.mjs";

import { genericTypeToUIElement } from "../type-driven-ui.mjs";

import { UICharGroupContainer } from "../ui-char-groups.mjs";

import { UIColorChooser } from "../ui-color-chooser.mjs";

import { DATA_TRANSFER_TYPES } from "../data-transfer-types.mjs";

import { initAnimanion, UITimeControl } from "./motion-stage.mjs";

import { ContainerMeta } from "../actors/actors-meta.mjs";

import {
    setAxisLocationValue,
    AvailableAxesMathItemTypesModel,
    availableAxesMathItemTypes,
    AxesMathLocationsSumModel,
    createAxesMathItem,
    applyAxesMathLocations,
    UIAxesMath,
} from "../axes-math.mjs";

import { UIOTFeaturesChooserCollapsible as UIOTFeaturesChooser } from "../ui-opentype-features.typeroof.jsx";

import { UILanguageTagCollapsible as UILanguageTag } from "../language-tags.typeroof.jsx";

import { renderAxesParameterDisplay } from "../axes-parameters.mjs";

const activatableVideoproofActorTypes = (() => {
    const videoproofActors = [
            "VideoproofArrayV2ActorModel",
            "VideoproofContextualActorModel",
        ],
        availableVideoproofActorTypesDraft =
            AvailableActorTypesModel.createPrimalDraft({});
    for (const key of videoproofActors)
        availableVideoproofActorTypesDraft.push([
            key,
            activatableActorTypes.get(key),
        ]);
    return availableVideoproofActorTypesDraft.metamorphose();
})();

const _NOTDEF = Symbol("_NOTDEF");

class UIVideoproofArrayLayer extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        const localMainElement = widgetBus.domTool.createElement("div", {
                class: "ui-videoproof_array-layer",
            }),
            zones = new Map([..._zones, ["main", localMainElement]]);
        super(widgetBus, zones);
        this.element = localMainElement;
        this._insertElement(this.element);
        // updateDefaultsDependencies is relative to the UIColorChooser
        // children in this case. The actual address is the same as
        // this.widgetBus.rootPath
        //      (e.g. "/activeState/videoproofArrayV2/activeActors/0/instance")
        // The three levels up are e.g. the "./keyMoments/0/textColor"

        const updateDefaultsDependencies = [
                [
                    `animationProperties@${widgetBus.rootPath}`,
                    "animationProperties@",
                ],
            ],
            _updateDefaultsNames = new Set(
                Array.from(zip(...updateDefaultsDependencies))[1],
            ),
            requireUpdateDefaults = (changedMap) =>
                Array.from(changedMap.keys()).some((name) =>
                    _updateDefaultsNames.has(name),
                );
        const widgets = [
            [
                { zone: "main" },
                [["font", "data"]],
                DynamicTag,
                "span",
                {},
                (font) => font.nameVersion,
            ],
            [
                {
                    // rootPath: widgetRootPath
                    //,
                    zone: "main",
                },
                [
                    // dependencyMappings
                    // path => as internal name
                    ["/availableFonts", "options"],
                    ["localActiveFontKey", "activeFontKey"],
                ],
                FontSelect,
                true,
            ],
            // these are in the keyMoments!...
            // Should either be set in keyMoments[0] or in the
            // VideoproofArrayV2CellActorModel which would then
            // have to inherit it to the keyMoments as defaults.
            // using keyMoments[0] seems like a lesser effort at the moments.
            // But we need to create keyMoments[0] when the actor is created.
            // textColor
            // backgroundColor
            [
                {
                    zone: "main",
                    rootPath: Path.fromParts(
                        ".",
                        "keyMoments",
                        "0",
                        "textColor",
                    ),
                },
                [],
                UIColorChooser,
                zones,
                "Text Color",
                // argument = injectable.getDefaults.bind(null, propertyRoot, fieldName, BaseModelType.defaultValue);
                this._getDefaults.bind(
                    this,
                    ProcessedPropertiesSystemMap.createSimpleRecord(
                        COLOR,
                        "textColor",
                    ),
                    "textColor",
                ),
                updateDefaultsDependencies,
                requireUpdateDefaults,
            ],
            [
                {
                    zone: "main",
                    rootPath: Path.fromParts(
                        ".",
                        "keyMoments",
                        "0",
                        "backgroundColor",
                    ),
                },
                [],
                UIColorChooser,
                zones,
                "Background Color",
                // argument = injectable.getDefaults.bind(null, propertyRoot, fieldName, BaseModelType.defaultValue);
                this._getDefaults.bind(
                    this,
                    ProcessedPropertiesSystemMap.createSimpleRecord(
                        COLOR,
                        "backgroundColor",
                    ),
                    "backgroundColor",
                ),
                updateDefaultsDependencies,
                requireUpdateDefaults,
            ],
            [
                {
                    zone: "main",
                    rootPath: Path.fromParts(
                        ".",
                        "keyMoments",
                        "0",
                        "languageTag",
                    ),
                },
                [[`animationProperties@${widgetBus.rootPath}`, "properties@"]],
                UILanguageTag,
                this._zones,
            ],
            [
                {
                    zone: "main",
                    rootPath: Path.fromParts(".", "keyMoments", "0"),
                },
                [
                    ["openTypeFeatures", "openTypeFeatures"],
                    // used as a fallback, but probably in this setting
                    // not required.
                    ["/font", "rootFont"],
                    //, ...updateDefaultsDependencies
                ],
                UIOTFeaturesChooser,
                this._zones,
                (ppsRecord, modelFieldName /*, defaultVal=_NOTDEF*/) => {
                    if (ppsRecord.fullKey === `${SPECIFIC}font`) {
                        const path = this.widgetBus.rootPath.append("./font");
                        return this.getEntry(path).value;
                    }
                    throw new Error(
                        `getDefault for UIOTFeaturesChooser don't know how to get ppsRecord: "${ppsRecord}" modelFieldName: "${modelFieldName}".`,
                    );
                }, //getDefaults
                (changedMap) => changedMap.has("font"), //requireUpdateDefaults
                // injected
                [["../../font", "font"]], //updateDefaultsDependencies
            ],
        ];
        this._initWidgets(widgets);
    }

    // in [ProtocolHandler animationProperties@].
    _getDefaults(ppsRecord, modelFieldName, defaultVal = _NOTDEF) {
        // const axisPrefix = 'axesLocations/';
        // activeKey: we can probably retrieve via this.getEntry('../activeKey').value

        // rootPath: /activeState/keyMoments/0
        // actor: activeState
        const { fullKey } = ppsRecord,
            liveProperties = this.getEntry("animationProperties@"),
            // NOTE: the version reading from globalT is geting the right
            // inherited colors, while liveProperties.getPropertyValuesMapForKeyMoment("0")
            // did not. Since we are not animating color in here, using
            // t=0 is as good as any other value for t.
            propertyValues =
                liveProperties.animanion.getPropertiesFromGlobalT(0);
        if (ppsRecord.prefix === COLOR) {
            const [color] = getColorFromPropertyValuesMap(
                fullKey,
                propertyValues,
                [null],
            );
            if (color !== null) return color;
            // If defaultVal === _NOTDEF and fullKey is not found
            // this will raise.
            const fallback = getRegisteredPropertySetup(
                fullKey,
                defaultVal === _NOTDEF
                    ? getRegisteredPropertySetup.NOTDEF
                    : defaultVal,
            );
            return fallback === defaultVal ? defaultVal : fallback.default;
        } else if (propertyValues.has(fullKey))
            return propertyValues.get(fullKey);
        if (defaultVal !== _NOTDEF) return defaultVal;
        throw new Error(
            `KEY ERROR ${this}._getDefaults: not found "${fullKey}" for t=0 in ${liveProperties}`,
        );
    }
}

/**
 * Wrapper for UIVideoproofArrayLayer with augmented controls to
 * move(reorder)/delete
 */
class UIVideoproofArrayLayerItem extends _BaseContainerComponent {
    constructor(widgetBus, _zones, eventHandlers) {
        const localMainElement = widgetBus.domTool.createElement("div", {
                class: "ui_videoproof_array_layers-item",
            }),
            zones = new Map([..._zones, ["main", localMainElement]]);
        super(widgetBus, zones);
        this.element = localMainElement;
        this._insertElement(this.element);
        const key = widgetBus.rootPath.parts.at(-1);
        for (const [eventType, handler, ...restArgs] of eventHandlers)
            this.element.addEventListener(
                eventType,
                (event) => handler(`key@@${key}`, event),
                ...restArgs,
            );

        const widgets = [
            [
                { zone: "main" },
                [],
                UIButton,
                createIcon("delete"),
                [
                    [
                        "click",
                        this._changeStateHandler((event) => {
                            event.preventDefault();
                            const key = widgetBus.rootPath.parts.at(-1),
                                activeActors = this.widgetBus.getEntry(
                                    widgetBus.rootPath.parent,
                                );
                            activeActors.delete(key);
                            if (activeActors.size === 1) {
                                // unset the text color so it is the default
                                // black color. This behavior may be annoying
                                // for some users in some cases: wanting to
                                // keep the textColor. However, it kind of
                                // is in sync with the behavior of setting these
                                // colors. Maybe we need a trigger or not-trigger
                                // for it, e.g. to press a modifier key when
                                // deleting.
                                getDraftEntry(
                                    activeActors,
                                    "./0/instance/keyMoments/0/textColor/colorTypeKey",
                                ).value = ForeignKey.NULL;
                            }
                        }),
                        true,
                    ],
                ],
                { title: "Remove", classPart: "remove" },
            ],
            [
                { zone: "main" },
                [],
                UIButton,
                createIcon("swap_vert"),
                [
                    ["dragstart", this._dragstartHandler.bind(this)],
                    ["dragend", this._dragendHandler.bind(this)],
                ],
                {
                    title: "Move",
                    classPart: "move",
                    elementAttributes: [["draggable", "true"]],
                },
            ],
            [
                { zone: "main", rootPath: Path.fromParts(".", "instance") },
                ["animationProperties@"],
                UIVideoproofArrayLayer,
                zones,
            ],
        ];
        this._initWidgets(widgets);
    }
    _dragstartHandler(event) {
        const key = this.widgetBus.rootPath.parts.at(-1),
            path = Path.fromParts(".", key);
        // From https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types
        //      "It is important to set the data in the right order, from most-specific to least-specific."
        event.dataTransfer.setData(DATA_TRANSFER_TYPES.ACTOR_PATH, `${path}`);
        event.dataTransfer.setData(
            "text/plain",
            `[TypeRoof ${DATA_TRANSFER_TYPES.ACTOR_PATH}: ${path}]`,
        );
        event.currentTarget.parentElement.classList.add("dragging");
        // MDN: During the drag operation, drag effects may be modified to
        // indicate that certain effects are allowed at certain locations.
        // 'copy', 'move', 'link'
        // changing the dropEffect is interesting depending on the drag target
        // and maybe also when a modifier get's pressed/released!
        //
        // Allow to copy, link or to move the element.
        // The UI could be changed to clearly indicate the kind of action
        // it creates, but often it also depends on the target.
        event.dataTransfer.effectAllowed = "all";
        event.dataTransfer.setDragImage(
            event.currentTarget.parentElement,
            0,
            0,
        );
    }
    _dragendHandler(event) {
        event.currentTarget.parentElement.classList.remove("dragging");
    }
}

class UIVideoproofArrayLayersController extends _BaseDynamicCollectionContainerComponent {
    constructor(widgetBus, zones, ...customArgs) {
        super(widgetBus, zones);
        this._customArgs = customArgs;
    }
    _createWrapper(rootPath) {
        const settings = {
                rootPath: rootPath,
                zone: "main",
            },
            dependencyMappings = [
                //[]
            ],
            Constructor = UIVideoproofArrayLayerItem,
            args = [this._zones, ...this._customArgs],
            childWidgetBus = this._childrenWidgetBus;
        return this._initWrapper(
            childWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }
}

class UIVideoproofArrayLayers extends _BaseContainerComponent {
    constructor(widgetBus, _zones, label) {
        const localZoneElement = widgetBus.domTool.createElement("div", {
                class: "ui_videoproof_array_layers",
            }),
            contentsZoneElement = widgetBus.domTool.createElement("div"),
            childrensMainZoneElement = widgetBus.domTool.createElement("div", {
                class: "ui_videoproof_array_layers-items",
            }),
            zones = new Map([
                ..._zones,
                ["local", localZoneElement],
                ["contents", contentsZoneElement],
                ["main", childrensMainZoneElement],
            ]);
        super(widgetBus, zones);
        contentsZoneElement.append(childrensMainZoneElement);
        this._insertElement(localZoneElement);
        this._dropTargetElement = childrensMainZoneElement;

        this._dropTargetElement.addEventListener(
            "dragenter",
            this._dragenterHandler.bind(this),
        );
        this._dropTargetElement.addEventListener(
            "dragover",
            this._dragoverHandler.bind(this),
        );
        this._dropTargetElement.addEventListener(
            "drop",
            this._dropHandler.bind(this),
        );
        this._dropTargetElement.addEventListener(
            "dragleave",
            this._dragleaveHandler.bind(this),
        );

        this._removeDragIndicatorTimeoutId = null;
        const widgets = [
            [{ zone: "local" }, [], Collapsible, label, contentsZoneElement],
            [
                // If there's just one layer.
                {
                    zone: "main",
                    // FIXME: These activationTest functions run a lot during
                    // animation, maybe that can be changed or this widget
                    // can check on update only when activeActors changes instead.
                    activationTest: () => {
                        const activeActors = widgetBus.getEntry(
                            widgetBus.rootPath,
                        );
                        return activeActors.size === 1;
                    },
                    rootPath: Path.fromParts(".", "0", "instance"),
                    id: "Layer",
                },
                ["animationProperties@"],
                UIVideoproofArrayLayer,
                zones,
            ],
            [
                // If there are more than one layers
                {
                    zone: "main",
                    activationTest: () => {
                        const activeActors = widgetBus.getEntry(
                            widgetBus.rootPath,
                        );
                        return activeActors.size > 1;
                    },
                    id: "LayersController",
                },
                [[".", "collection"]],
                UIVideoproofArrayLayersController,
                zones,
                [
                    //    ['dragenter', (key, event, ...args)=>console.log(`->injected into UIVideoproofArrayLayersController ${key}; event.type ${event.type};`, event.currentTarget ,'args:', ...args)]
                    //  , ['dragover', (key, event, ...args)=>console.log(`->injected into UIVideoproofArrayLayersController ${key}; event.type ${event.type};`, event.currentTarget ,'args:', ...args)]
                    //  , ['drop', (key, event, ...args)=>console.log(`->injected into UIVideoproofArrayLayersController ${key}; event.type ${event.type};`, event.currentTarget ,'args:', ...args)]
                ],
            ],
            [
                { zone: "contents" },
                [],
                UIButton,
                createIcon("add"),
                [
                    [
                        "click",
                        this._changeStateHandler((event) => {
                            // FIXME: should get the font to use from a <select>
                            event.preventDefault();
                            const activeActors = this.widgetBus.getEntry(
                                widgetBus.rootPath,
                            ); // activeActors
                            insertNewCellActorModel(activeActors);
                        }),
                        true,
                    ],
                ],
                { title: "Add", classPart: "add" },
            ],
        ];
        this._initWidgets(widgets);
    }

    // FIXME: Straight copy from StageManager: should be a shared thing.
    // The allowed DATA_TRANSFER_TYPES array could be an argument to bind.
    _takeDragEventOrLeaveIt(event) {
        // order is relevant here
        const applicableTypes = [
            DATA_TRANSFER_TYPES.ACTOR_PATH,
            DATA_TRANSFER_TYPES.ACTOR_CREATE,
        ];
        for (const type of applicableTypes) {
            if (event.dataTransfer.types.includes(type)) {
                // Don't trigger other pointer events or such.
                event.preventDefault();
                // This event is consumed, don't trigger another handler for this event
                event.stopPropagation();
                return [true, type];
            }
        }
        return [false, null];
    }

    /**
     * FIXME: Mapping from DOM to Model path/key is kind of dark magic.
     * It would probably be cleaner to inject the dragHandlers into
     * the children and call them with the necessary information ammended.
     * ALso, this has very intimate knowledge about the structure of it's
     * children.
     */
    _getChildKeyFromElement(childElement) {
        const layerController = this.getWidgetById("LayersController", null);
        if (layerController !== null) {
            for (const [, childWrapper] of layerController.widgets()) {
                if (childWrapper.widget.element === childElement)
                    return childWrapper.widgetBus.rootPath.parts.at(-1);
            }
            // e.g. the parent container that listens to the event.
            return null;
        }
        const layer = this.getWidgetById("Layer", null);
        if (layer !== null) return "0";
        return null;
    }

    _getClosestChild(element) {
        if (element === this._dropTargetElement) return this._dropTargetElement;
        for (const childElement of this._dropTargetElement.children) {
            if (childElement === element || childElement.contains(element))
                return childElement;
        }
        throw new Error(`UNKOWN can't get closest child in ${this}.`);
    }

    _getDropTargetInsertPosition(event) {
        const result = {
            targetElement: null,
            childKey: null,
            insertPosition: null,
        };
        // NOTE: node.contains(node) === true
        if (this._dropTargetElement.contains(event.target)) {
            const targetElement = this._getClosestChild(event.target);
            result.targetElement = targetElement;
            result.childKey = this._getChildKeyFromElement(targetElement);
        } else
            throw new Error(
                `VALUE ERROR event.target can't be mapped to ${this}.`,
            );

        const { height, top } = result.targetElement.getBoundingClientRect(),
            { clientY } = event,
            elementY = clientY - top,
            relativeY = elementY / height,
            testPosition = 0.5;
        // = item.isEmptyLayerItem
        //       // Move this line below the empty layer container <ol> active
        //       // zone, such that we don't get undecided flickering between
        //       // the empty container zone and the item above: the <li> that
        //       // contains the empty children <ol>.
        //       ? 0.8
        //       : 0.5
        result.insertPosition = relativeY < testPosition ? "before" : "after";
        return result;
    }

    _setDropTargetIndicator({
        insertPosition = null,
        targetElement = null,
    } = {}) {
        if (this._removeDragIndicatorTimeoutId !== null) {
            const { clearTimeout } = this._domTool.window;
            clearTimeout(this._removeDragIndicatorTimeoutId);
            this._removeDragIndicatorTimeoutId = null;
        }
        const classPrefix = "drop_target_indicator-",
            markedClass = `${classPrefix}marked`;
        for (const elem of [
            this._dropTargetElement,
            ...this._dropTargetElement.querySelectorAll(`.${markedClass}`),
        ]) {
            // element.classList is live and the iterator gets confused due
            // to the remove(name), hence this acts on an array copy.
            for (const name of [...elem.classList]) {
                if (name.startsWith(classPrefix)) {
                    elem.classList.remove(name);
                }
            }
        }
        if (insertPosition === null) return;

        if (!["before", "after", "insert"].includes(insertPosition))
            throw new Error(
                `NOT IMPLEMENTED ${this} insert position "${insertPosition}".`,
            );
        // return;

        const [elem, posClassSuffix] =
            this._dropTargetElement !== targetElement &&
            insertPosition === "before" &&
            targetElement.previousElementSibling
                ? [targetElement.previousElementSibling, "after"]
                : [targetElement, insertPosition];
        elem.classList.add(`${classPrefix}${posClassSuffix}`);
        elem.classList.add(markedClass);
    }

    _dropIndicatorForDragHandler(event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if (!take) return;
        event.dataTransfer.dropEffect =
            type === DATA_TRANSFER_TYPES.ACTOR_PATH
                ? "move"
                : // TODO: not yet used in this context
                  "copy"; // DATA_TRANSFER_TYPES.ACTOR_CREATE
        const insertPosition = this._getDropTargetInsertPosition(event);
        this._setDropTargetIndicator(insertPosition);
    }

    _dragoverHandler(event) {
        return this._dropIndicatorForDragHandler(event);
    }

    _dragenterHandler(event) {
        return this._dropIndicatorForDragHandler(event);
    }

    /**
     * Only when leaving the this._actorsElement: remove the target indicator.
     * This uses setTimeout because otherwise the display can start to show
     * flickering indicators, as dragleave and dragenter are not executed
     * directly consecutivly in all (Chrome showed this issue).
     */
    _dragleaveHandler(event) {
        if (!this._takeDragEventOrLeaveIt(event)[0]) return;
        // Remove indicator if not cancelled (by _setDropTargetIndicator before)
        const { setTimeout } = this._domTool.window;
        this._removeDragIndicatorTimeoutId = setTimeout(
            this._setDropTargetIndicator.bind(this),
            100,
        );
    }

    _dropHandler(event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if (!take) return;

        this._setDropTargetIndicator(); // remove indicator
        const { childKey: targetKey, insertPosition } =
            this._getDropTargetInsertPosition(event);

        if (type === DATA_TRANSFER_TYPES.ACTOR_PATH) {
            const sourcePath = Path.fromString(
                    event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH),
                ),
                sourceKey = sourcePath.parts.at(-1);
            return this._move(sourceKey, targetKey, insertPosition);
        } else if (type === DATA_TRANSFER_TYPES.ACTOR_CREATE) {
            const typeKey = event.dataTransfer.getData(
                DATA_TRANSFER_TYPES.ACTOR_CREATE,
            );
            return this._create(typeKey, targetKey, insertPosition);
        }
    }

    _create(typeKey, targetKey, insertPosition) {
        throw new Error(
            `NOT IMPLEMENTED ${this}._create for type ${typeKey} at ${insertPosition}#{targetKey}.`,
        );
    }

    _move(sourceKey, targetKey, insertPosition) {
        if (sourceKey === targetKey) return; // nothing to do

        return this._changeState(() => {
            const activeActors = this.widgetBus.getEntry(
                    this.widgetBus.rootPath,
                ),
                source = activeActors.get(sourceKey),
                targetIndex =
                    targetKey === null
                        ? insertPosition === "after"
                            ? activeActors.size
                            : 0
                        : parseInt(targetKey, 10),
                sourceIndex = parseInt(sourceKey, 10);
            if (sourceIndex === targetIndex) return; // nothing to do

            let insertIndex;
            if (insertPosition === "after") insertIndex = targetIndex + 1;
            else if (insertPosition === "before") insertIndex = targetIndex;
            else
                throw new Error(
                    `NOT IMPLEMENTED ${this} insert position "${insertPosition}".`,
                );

            if (sourceIndex < targetIndex)
                // by the time we insert, sourceIndex is already removed from before
                insertIndex = insertIndex - 1;
            activeActors.delete(sourceKey);
            activeActors.splice(insertIndex, 0, source);
        });
    }
}

// TODO: mark stuff as GENERATED_DATA
// Add preset, using the presets module, especially the RapEditor would profit
// Mark generated raps as GENERATED_DATA!
// Add "wait there's more" raps to an upper Layer
// Make the Actors dynamic "Videoproof Actor", replaces
//      , ['videoproofArrayV2', VideoproofArrayV2ActorModel]
//  dynamic types VideoproofArrayV2ActorModel
//                VideoproofContextualActorModel
//                likeley very soonish: an Adapter for the simple prosemirror
//                nice, and at that point probably trivial: adapter for the grid

// Map is nice as it a) keeps order, b) is unique like a set, c) we can store more context,
// Maybe something else will be better to use bur for now we choose the Map!
const LAYER_TYPE_KEY = "LayerActorModel";

// NOTE: in the CoherenceFunctions operating with the proxies is slow.
// Reading, is slow and consequently also writing. On top, the CoherenceFunctions
// in this model are on a hot path, as `t` is set in animation speed this
// Model is metamorphosed each frame and subsequently all CoherenceFunctions
// are executed. The probably more elegant way would be to put all of the
// fields that are checked by the CoherenceFunctions into a sub-model, which
// is separated from the `t` property. However, in here, we chose to optimize
// the reads and writes within the CoherenceFunctions, as such it can also
// serve as a documentation. Especially the use of unwrapPotentialWriteProxy
// is notable, with additionally "ensureDraft" if writing is intended and
// subsequently `getDraftEntry` or the `model.getDraftFor` accessors.
// This is a good case to study and explain metamodel inner workings and
// optimization strategies.
const VideoproofModel = _BaseLayoutModel.createClass(
    "VideoproofModel",
    ...timeControlModelMixin,
    ...StaticDependency.createWithInternalizedDependency(
        "availableAxesMathItemTypes",
        AvailableAxesMathItemTypesModel,
        availableAxesMathItemTypes,
    ),
    // As an entry point, the AxesMathLocationsSumModel can handle
    // all the other items and it doesnt't alter them, it also
    // enables an UI that doesn't has to be special compared
    // to a deeper nested version.
    // However, we'll want to refine the axis math framing conditions
    // such as a way of setting defaults in a post-calculation way
    // so eventually there'll be another struct containing this.
    // ALSO: a CoherenceFunction should take care that if this is
    // empty, a default value should be set, that creates a list of
    // key moments. Having an indeed empty list could be achieved by
    // putting an empty list into this.
    ["axesMath", AxesMathLocationsSumModel],
    CoherenceFunction.create(["axesMath"], function initAxesMath({ axesMath }) {
        // TODO: this will have to be done via a collection of presets...
        // TODO: for this specific implementation we should do a triage
        //       e.g. if there's no OPSZ: don't use it
        // Not sure about this, mabe there can be a default
        let items = unwrapPotentialWriteProxy(axesMath).get("items");
        if (items.size === 0) {
            items = items.isDraft
                ? items
                : unwrapPotentialWriteProxy(
                      axesMath,
                      "ensureDraft",
                  ).getDraftFor("items");
            console.log(
                "VideoproofArrayV2ActorModel axesMath is empty. adding some content",
            );
            const locationsProductItem = createAxesMathItem(
                    "LocationsProduct",
                    items.dependencies,
                ),
                locationSets = getEntry(
                    locationsProductItem,
                    "./instance/axesLocationValuesMap",
                );
            for (const [axisTag, locationsVals] of [
                ["opsz", ["min", "default", "max"]],
                ["wdth", ["default", "min", "max"]],
                ["wght", ["default", "min", "max"]],
            ]) {
                if (!locationSets.has(axisTag)) {
                    locationSets.set(
                        axisTag,
                        locationSets.constructor.Model.createPrimalDraft(
                            locationSets.dependencies,
                        ),
                    );
                }
                const locationValues = locationSets.get(axisTag);

                for (const locationRawValue of locationsVals) {
                    const axisLocationValue =
                        locationValues.constructor.Model.createPrimalDraft(
                            locationValues.dependencies,
                        );
                    setAxisLocationValue(axisLocationValue, locationRawValue);
                    // single locations items:
                    //      {'opsz': 'default'}
                    //      {'opsz': 'min'}
                    //      {'opsz': 'max'}
                    //      {'wdth': 'default'}
                    //      {'wdth': 'min'}
                    //      {'wdth': 'max'}
                    //      {'wght': 'default'}
                    //      {'wght': 'min'}
                    //      {'wght': 'max'}
                    //
                    // otherwise we could also have
                    //      {'opsz': 'default', 'wdth': 'default', 'wght': 'default'}
                    //      {'opsz': 'min', 'wdth': 'min', 'wght': 'min'}
                    //      {'opsz': 'max', 'wdth': 'max', 'wght': 'max'}
                    // but currently it's not possible to do and not planned:
                    //      {'opsz': 'default', 'opsz': 'min', 'opsz': 'max'}
                    //      {'wdth': 'default', 'wdth': 'min', 'wdth': 'max'}
                    //      {'wght': 'default', 'wght': 'min', 'wght': 'max'}
                    //
                    // I'm thinking another way to encode this may be
                    // a list of [tag, value] pairs. It's not "locations"
                    // then anymore though. [tag, value] enables all
                    // of the above. Locations with a single key, value
                    // in a list, i.e. like the first example, are just
                    // like [tag, value]
                    //
                    // However, the timeslist will ideally show a summary
                    // similar to the last entry, derrived from either
                    // the first or the seccond form:
                    //       opsz default, min, max
                    //     × wdth default, min, max
                    //     × wght default, min, max X
                    locationValues.push(axisLocationValue);
                }
            }
            items.push(locationsProductItem);
        }
    }),
    // This is great, but, it would be nice to have another "Layer"
    // for the wait there's more animations, and one more layer for
    // static values of the wrap. So we'd have static->more->actual rap
    // it's totally possible to put them into structs next to each other
    // and wire them manually in here, i.e.
    //      rapStatic -> just like on manual axes locations, maybe other
    //                  properties (keyMoments can do much more!)
    //      rapMore -> requires keyMoments, when we play thus, we pause the
    //                 actual actor wherever it is. Need likely to keep the
    //                 played "more"-axes-tag around and probably also the
    //                 t at which the
    //                 it could be a "layer" actor, and e.g. in here
    //                 we could take care of the activeActors containing
    //                 always only one videoproofActor, as a generic actor
    //                 we could just make it a policy here in a coherence
    //                 function, no need to restrict the layer itself.
    //
    //      And the default videoproofActor rap
    // , ['rapStatic', RapStaticModel]
    // , ['rapMore', RapMoreModel] // has keyMoments, isLoop
    // , ['videoproofActor', VideoproofActorModel]
    //
    // The above is elegant and straight to the point, however, given
    // that a default motion-stage configuration can do what I need
    // I tend to think, I set this up more similar to a stage, and use
    // a CoherenceFunction to cover the cases that are not ideal. So,
    // actors-meta can work it's magic out of the box.
    // It's not straight forward, but it's more modular.

    // In here we enforce: first level **one** `layer` ./activeActors/0
    //      That is the "wait there's more" layer, it's not supposed to
    //      do anything in default operation (no KeyMoments)
    // second level **one** of the videoproof actors ./activeActors/0/instance/activeActors/0
    // And that's it
    ["activeActors", ActorsModel],
    //
    // so the chosen option can be observed at ./activeActors/0/instance/activeActors/0
    // OR more precise even at ./activeActors/0/instance/activeActors/0/actorTypeKey
    // but, I'm not sure how well that will play with the select.
    // we could definitely link a path like that to "value"
    // but the select also has to set the value, how's that done in main

    // I guess we need to use this, so the Layer actor that we need is
    // available/known as well.
    //  but then for the options we use an AvailableActorTypesModel
    // with a subset and use that also for the coherence guard...
    ...StaticDependency.createWithInternalizedDependency(
        "availableActorTypes",
        AvailableActorTypesModel,
        activatableActorTypes,
    ),
    ...StaticDependency.createWithInternalizedDependency(
        "availableVideoproofActorTypes",
        AvailableActorTypesModel,
        activatableVideoproofActorTypes,
    ),
    CoherenceFunction.create(
        ["activeActors", "availableVideoproofActorTypes"],
        function actorsStructure({
            activeActors: activeActorsProxy,
            availableVideoproofActorTypes,
        }) {
            // not more than 1 child
            let activeActors = unwrapPotentialWriteProxy(activeActorsProxy);
            const getActiveActorsDraft = () => {
                if (!activeActors.isDraft)
                    // got to read from the draft now, it's canonical!
                    activeActors = unwrapPotentialWriteProxy(
                        activeActorsProxy,
                        "ensureDraft",
                    );
                return activeActors;
            };
            if (activeActors.size > 1)
                getActiveActorsDraft().splice(1, Infinity);

            // The entry must be a layer
            if (
                activeActors.size &&
                getEntry(activeActors, "0/actorTypeKey").value !==
                    LAYER_TYPE_KEY
            )
                getActiveActorsDraft().splice(0, Infinity);

            if (activeActors.size === 0) {
                const layerDraft = createActor(
                    LAYER_TYPE_KEY,
                    activeActors.dependencies,
                );
                getActiveActorsDraft().push(layerDraft);
            }

            const layerActorsPath = "./0/instance/activeActors";
            let layerActors = getEntry(activeActors, layerActorsPath);
            const getLayerActorsDraft = () => {
                // overide as draft becomes new cononical
                if (!layerActors.isDraft)
                    layerActors = getDraftEntry(
                        getActiveActorsDraft(),
                        layerActorsPath,
                    );
                return layerActors;
            };
            if (layerActors.size > 1) getLayerActorsDraft().splice(1, Infinity);
            // We don't have another place that records the actual actor
            // instead, we need to make sure, the actual actor is from
            // the valid set! We use the generic activatableActorTypes
            // in the model, technically it is possible.
            if (layerActors.size) {
                if (
                    !availableVideoproofActorTypes.has(
                        getEntry(layerActors, "0/actorTypeKey").value,
                    )
                ) {
                    getLayerActorsDraft().splice(0, Infinity);
                }
            }

            if (layerActors.size === 0) {
                // Pick the first by default.
                const typeKey = availableVideoproofActorTypes.keyOfIndex(0),
                    videoproofActorDraft = createActor(
                        typeKey,
                        layerActors.dependencies,
                    );
                getLayerActorsDraft().push(videoproofActorDraft);
            }
        },
    ),
    CoherenceFunction.create(
        ["activeActors", "actorsStructure"],
        function* settleDynamicInstance({ activeActors }) {
            const layerActorsPath = "0/instance/activeActors";
            const videoproofActor = getEntry(
                unwrapPotentialWriteProxy(activeActors),
                `${layerActorsPath}/0`,
            );
            if (!videoproofActor.isDraft) return;
            // When the dropdown has changed the actor, it might not yet
            // be instantiated, as the DynamicStruct metamorphose runs
            // after this. So, we call metamorphoseGen here, to make sure
            // it has settled before trying to init it in the next step.
            const typeClass = getEntry(
                videoproofActor,
                "actorTypeModel/typeClass",
            ).value;
            const CTOR = getEntry(videoproofActor, "instance").wrapped
                .constructor;
            if (typeClass !== CTOR) {
                const immutable = yield* videoproofActor.metamorphoseGen();
                getEntry(
                    unwrapPotentialWriteProxy(activeActors, "ensureDraft"),
                    `${layerActorsPath}`,
                ).splice(0, 1, immutable);
            }
        },
    ),
    ["showParameters", BooleanDefaultTrueModel],
    CoherenceFunction.create(
        [
            "settleDynamicInstance",
            "activeActors",
            "font" /*'duration', 'availableActorTypes', 'activeActors', 'font', 'installedFonts'*/,
        ],
        function initVideoproofActor({ activeActors, font }) {
            let videoproofActor = getEntry(
                unwrapPotentialWriteProxy(activeActors),
                "0/instance/activeActors/0/instance",
            );
            const getVideoproofActorDraft = (key = null) => {
                if (!videoproofActor.isDraft)
                    videoproofActor = getDraftEntry(
                        unwrapPotentialWriteProxy(activeActors, "ensureDraft"),
                        "0/instance/activeActors/0/instance",
                    );
                return key === null
                    ? videoproofActor
                    : videoproofActor.getDraftFor(key);
            };

            if (videoproofActor.get("isLoop").value !== true)
                // always a loop
                getVideoproofActorDraft("isLoop").value = true;

            if (
                videoproofActor.get("localActiveFontKey").value !==
                font.value.fullName
            ) {
                // Set font explicitly, to make the videoproofActor Model
                // self contained when copied e.g. to motion-stage.
                // This creates a duplication of the information in
                // the global font key.
                getVideoproofActorDraft("localActiveFontKey").set(
                    font.value.fullName,
                );
            }
            const keyMoments = videoproofActor.get("keyMoments"),
                needInitialKeymoment = keyMoments.size === 0;
            if (needInitialKeymoment) {
                // This is initial. We'll always require a keyMoment  at 0
                const KeyMomentModel = keyMoments.constructor.Model,
                    newKeyMoment = KeyMomentModel.createPrimalDraft(
                        keyMoments.dependencies,
                    );
                if (KeyMomentModel.fields.has("charGroup")) {
                    const defaultCharGroup = KeyMomentModel.fields
                        .get("charGroup")
                        .fields.get("options").Model.defaultValue;
                    newKeyMoment
                        .get("charGroup")
                        .get("options")
                        .set(defaultCharGroup);
                }
                getVideoproofActorDraft("keyMoments").push(newKeyMoment);
            }
        },
    ),
    CoherenceFunction.create(
        ["initVideoproofActor", "activeActors"],
        function initEmptyActiveActors({ activeActors }) {
            const videoproofActorActiveActorsPath =
                    "0/instance/activeActors/0/instance/activeActors",
                videoproofActorActiveActors = getEntry(
                    unwrapPotentialWriteProxy(activeActors),
                    videoproofActorActiveActorsPath,
                    null,
                );
            if (videoproofActorActiveActors === null)
                // Nothing to do
                return;
            if (videoproofActorActiveActors.size === 0) {
                const videoproofActorActiveActorsDraft =
                    videoproofActorActiveActors.isDraft
                        ? videoproofActorActiveActors
                        : getDraftEntry(
                              unwrapPotentialWriteProxy(
                                  activeActors,
                                  "ensureDraft",
                              ),
                              videoproofActorActiveActorsPath,
                          );
                insertNewCellActorModel(videoproofActorActiveActorsDraft);
            }
        },
    ),
    CoherenceFunction.create(
        [
            "initEmptyActiveActors", // so we know we are writing the keyMoments of the correct instance
            "activeActors",
            "axesMath",
            "installedFonts",
            "font",
            "duration",
        ],
        function* updateRap({
            activeActors,
            axesMath,
            installedFonts,
            font,
            duration,
        }) {
            const videoproofActorPath = "0/instance/activeActors/0/instance",
                videoproofActor = getEntry(
                    unwrapPotentialWriteProxy(activeActors),
                    videoproofActorPath,
                ),
                fontHasChanged = videoproofActor.dependencies.font !== font;
            // Before we used only videoproofActor.isDraft but that heuristic
            // triggers a lot, e.g. also when only /cellAlignment is changed.
            // A good way would be to check for new child actors (within activeActors)
            // and if their font has changed, but that is also a big chunk
            // for. We now look if activeActors is a draft, this is not
            // happening too much and should be a good-enough approximation.
            // This is still triggering when the color of a child actor
            // is changed, so here's room for refinement.
            const childrenPotentiallyRequireKeyMoments =
                    videoproofActor.isDraft &&
                    videoproofActor.has("activeActors") &&
                    videoproofActor.get("activeActors").isDraft,
                looksLikeNew = videoproofActor.get("keyMoments").size <= 1;
            if (
                looksLikeNew ||
                childrenPotentiallyRequireKeyMoments ||
                axesMath.isDraft ||
                fontHasChanged
            ) {
                const videoproofActorDraft = videoproofActor.isDraft
                    ? videoproofActor
                    : getDraftEntry(
                          unwrapPotentialWriteProxy(
                              activeActors,
                              "ensureDraft",
                          ),
                          videoproofActorPath,
                      );
                yield* applyAxesMathLocations(
                    videoproofActorDraft,
                    axesMath /* AxesMathLocationsSumModel */,
                    installedFonts,
                    font,
                    duration,
                );
            }
        },
    ),
    CoherenceFunction.create(
        ["initVideoproofActor", "activeActors"],
        function actorSpecificOverrides({ activeActors }) {
            const videoproofActorPath = "0/instance/activeActors/0";
            let videoproofActor = getEntry(
                unwrapPotentialWriteProxy(activeActors),
                videoproofActorPath,
            );
            const getVideoproofActorDraft = () => {
                if (!videoproofActor.isDraft)
                    videoproofActor = getDraftEntry(
                        unwrapPotentialWriteProxy(activeActors, "ensureDraft"),
                        videoproofActorPath,
                    );
                return videoproofActor;
            };

            if (
                videoproofActor.get("actorTypeKey").value ===
                "VideoproofContextualActorModel"
            ) {
                const cellAlignmentPath = "instance/keyMoments/0/cellAlignment",
                    cellAlignment = getEntry(
                        videoproofActor,
                        cellAlignmentPath,
                    );
                if (cellAlignment.isEmpty) {
                    // The default value of this "generic/cellAlignment"
                    // is "center" aligned. However for VideoproofContextual
                    // it should be left.
                    // This is a shortcoming of the default properties
                    // system that a future version needs to tackle. In
                    // this specific layout, however, we can make this
                    // workaround.
                    const cellAlignmentDraft = getDraftEntry(
                        getVideoproofActorDraft(),
                        cellAlignmentPath,
                    );
                    cellAlignmentDraft.value = "left";
                }

                // ensureAtLeastOneCharGroup
                const presetsPath = "instance/keyMoments/0/presets",
                    presets = getEntry(videoproofActor, presetsPath);
                if (presets.isEmpty) {
                    const presetsDraft = getDraftEntry(
                        getVideoproofActorDraft(),
                        presetsPath,
                    );
                    presetsDraft.set(
                        presetsDraft.constructor.Model.defaultValue,
                    );
                }

                // ensureAtLeastOneCharGroup
                const charGroupsPath = "instance/keyMoments/0/charGroups",
                    charGroups = getEntry(videoproofActor, charGroupsPath);
                if (charGroups.size < 1) {
                    const CharGroup = charGroups.constructor.Model,
                        draft = CharGroup.createPrimalDraft(
                            charGroups.dependencies,
                        ),
                        defaultOption =
                            CharGroup.fields.get("options").Model.defaultValue;
                    draft.get("options").set(defaultOption);
                    const charGroupsDraft = getDraftEntry(
                        getVideoproofActorDraft(),
                        charGroupsPath,
                    );
                    charGroupsDraft.push(draft);
                }
            }
        },
    ),
);
export class UIAlignment extends _BaseComponent {
    static TEMPLATE = `<div class="ui_alignment">
    <label class="radio-main-label">Cell Alignment</label>
</div>`;
    static TEMPLATE_OPTION = `<label class="ui_alignment-radio_label">
        <input name="alignment" type="radio">
        <span class="ui_alignment-radio_icon"></span></label>`;

    constructor(widgetBus, getDefault) {
        super(widgetBus);
        this._getDefault = getDefault;
        [this.element, this._inputs] = this._initTemplate();
    }

    _initTemplate() {
        const container = this._domTool.createFragmentFromHTML(
                this.constructor.TEMPLATE,
            ).firstElementChild,
            inputs = new Map();
        for (const [align, labelText] of [
            ["left", "Left"],
            ["center", "Center"],
            ["right", "Right"],
        ]) {
            const elem = this._domTool.createFragmentFromHTML(
                    this.constructor.TEMPLATE_OPTION,
                ).firstElementChild,
                input = elem.querySelector("input"),
                icon = elem.querySelector("span");
            elem.append(labelText);
            icon.textContent = `format_align_${align}`;
            input.classList.add(`ui_alignment-${align}`);
            input.addEventListener(
                "change",
                this._changeStateHandler.bind(this, align),
            );
            inputs.set(align, input);
            container.append(elem);
        }
        this._insertElement(container);
        return [container, inputs];
    }

    _changeStateHandler(align /*, event*/) {
        this._changeState(() => (this.getEntry("value").value = align));
    }

    update(changedMap) {
        if (changedMap.has("value")) {
            const alignModel = changedMap.get("value"),
                align = alignModel.isEmpty
                    ? this._getDefault()
                    : alignModel.value;
            for (const [key, input] of this._inputs)
                input.checked = key === align;
        }
    }
}

class UIParameterFontDisplay extends _BaseComponent {
    constructor(widgetBus, classes = []) {
        super(widgetBus);
        this.element = this._domTool.createElement("div", {
            class: classes.join(", "),
        });
        this._insertElement(this.element);
    }
    update(changedMap) {
        if (changedMap.has("font")) {
            const font = changedMap.get("font").value;
            this.element.textContent = font.nameVersion;
        }

        if (changedMap.has("animationProperties@")) {
            const animationProperties = changedMap.get("animationProperties@"),
                // the globalT name is defined for the Parent UIParametersDisplay
                // however, we read it here. It's interesting, as we don't
                // require it as a local dependency, animationProperties@
                // will trigger the update when required. So, this is an
                // example, where we require a name/alias, but don't need
                // to subscribe directly to the value!!! I.e. globalT
                // in this case won't appear ever in changedMap.
                globalT = this.getEntry("globalT").value,
                propertyValuesMap =
                    animationProperties.animanion.getPropertiesFromGlobalT(
                        globalT,
                    ),
                colorPropertiesMap = [
                    [`${COLOR}backgroundColor`, "--cell-background-color"],
                    [`${COLOR}textColor`, "--cell-text-color"],
                ],
                getDefault = (property) => {
                    return [true, getRegisteredPropertySetup(property).default];
                };
            actorApplyCSSColors(
                this.element,
                propertyValuesMap,
                getDefault,
                colorPropertiesMap,
            );
        }
    }
}

class UIParameterAxesDisplay extends _BaseComponent {
    constructor(widgetBus) {
        super(widgetBus);
        [this.element] = this._initTemplate();
    }
    _initTemplate() {
        const element = this.widgetBus.domTool.createElement("div", {
            class: "ui-parameters-display_values",
        });
        this._insertElement(element);
        return [element];
    }
    update(changedMap) {
        if (changedMap.has("animationProperties@")) {
            const animationProperties = changedMap.get("animationProperties@"),
                // the globalT name is defined for the Parent UIParametersDisplay
                // however, we read it here. It's interesting, as we don't
                // require it as a local dependency, animationProperties@
                // will trigger the update when required. So, this is an
                // example, where we require a name/alias, but don't need
                // to subscribe directly to the value!!! I.e. globalT
                // in this case won't appear ever in changedMap.
                globalT = this.getEntry("globalT").value,
                propertyValuesMap =
                    animationProperties.animanion.getPropertiesFromGlobalT(
                        globalT,
                    );
            renderAxesParameterDisplay(this.element, propertyValuesMap);
        }
    }
}

class UIParametersFontDisplayCollection extends _BaseDynamicCollectionContainerComponent {
    constructor(widgetBus, zones, customArgs = []) {
        super(widgetBus, zones);
        this._customArgs = customArgs;
    }
    /**
     * If this is a _BaseDynamicCollectionContainerComponent
     * we can use this to get the properties of each layer,
     * however, so far, we set the same properties for each layer from
     * the root animationProperties@ and thus these displays show all
     * the same information. We can show, however, the font of each
     * cell and its colors.
     */
    _createWrapper(rootPath) {
        const settings = {
                rootPath: rootPath,
                zone: "main",
            },
            dependencyMappings = [
                [`${rootPath.append("instance", "font")}`, "font"],
                [
                    `animationProperties@${rootPath.append("instance")}`,
                    "animationProperties@",
                ],
            ],
            Constructor = UIParameterFontDisplay,
            args = [...this._customArgs],
            childWidgetBus = this._childrenWidgetBus;
        return this._initWrapper(
            childWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }
}

class UIParametersDisplayStyler extends _BaseComponent {
    constructor(widgetBus, element) {
        super(widgetBus);
        this._element = element;
    }
    update(changedMap) {
        if (changedMap.has("animationProperties@")) {
            const animationProperties = changedMap.get("animationProperties@"),
                // the globalT name is defined for the Parent UIParametersDisplay
                // however, we read it here. It's interesting, as we don't
                // require it as a local dependency, animationProperties@
                // will trigger the update when required. So, this is an
                // example, where we require a name/alias, but don't need
                // to subscribe directly to the value!!! I.e. globalT
                // in this case won't appear ever in changedMap.
                globalT = this.getEntry("globalT").value,
                propertyValuesMap =
                    animationProperties.animanion.getPropertiesFromGlobalT(
                        globalT,
                    ),
                backgroundColorPropertyName = `${COLOR}stageBackgroundColor`,
                getDefault = (property) => {
                    return [true, getRegisteredPropertySetup(property).default];
                },
                [backgroundColor] = getColorFromPropertyValuesMap(
                    backgroundColorPropertyName,
                    propertyValuesMap,
                    [getDefault(backgroundColorPropertyName)[1]],
                ),
                // Try to get this from CSS, it is defined like:
                //      `:root {--parameters-label-color: #09f;}`
                // if the color has an alpha channel this will blend it with white
                blendedBackgroundColor = blend(
                    [{ mode: "rgb", r: 1, g: 1, b: 1 }, backgroundColor].filter(
                        (c) => c !== null,
                    ),
                    "normal",
                ),
                computedStyle = this._domTool.constructor.getComputedStyle(
                    this._element,
                ),
                cssParametersLabelColor = computedStyle.getPropertyValue(
                    "--parameters-label-color",
                ),
                fallbackTextColor = {
                    mode: "oklch",
                    l: 0.669,
                    c: 0.18368,
                    h: 248.8066,
                }, // oklch(0.669 0.18368 248.8066) // #09f
                labelTextColor =
                    (cssParametersLabelColor !== "" &&
                        culoriConverter("oklch")(cssParametersLabelColor)) ||
                    fallbackTextColor,
                // TODO: check if background has changed before calculating etc.
                // but that requires caching the last value...
                enhancedContrastColor =
                    backgroundColor !== null
                        ? enhanceContrast(
                              labelTextColor,
                              blendedBackgroundColor,
                          )
                        : null;
            if (enhancedContrastColor)
                this._element.style.setProperty(
                    "--parameters-label-high-contrast-text-color",
                    culoriFormatCss(enhancedContrastColor),
                );
            else
                // unset, will fall-back to whatever CSS defines
                this._element.style.removeProperty(
                    "--parameters-label-high-contrast-text-color",
                );

            const colorPropertiesMap = [
                [backgroundColorPropertyName, "background-color"],
                // , [`${COLOR}textColor`, 'color']
            ];
            actorApplyCSSColors(
                this._element,
                propertyValuesMap,
                getDefault,
                colorPropertiesMap,
            );
        }
    }
}

/**
 * This variant works when the videoproofActor has children (activeActors),
 * like VideoproofArrayV2, or not, like currently VideoproofContextual.
 *  or not.
 */
class UIParametersDisplay extends _BaseContainerComponent {
    constructor(widgetBus, _zones, extraClasses = [], customArgs = []) {
        const classes = ["ui-parameters-display", ...extraClasses],
            localElement = widgetBus.domTool.createElement("div", {
                class: classes.join(" "),
            }),
            zones = new Map([..._zones, ["main", localElement]]),
            widgets = [
                [
                    {},
                    [
                        [
                            `animationProperties@${widgetBus.rootPath}`,
                            "animationProperties@",
                        ],
                    ],
                    UIParametersDisplayStyler,
                    localElement,
                ],
                [
                    { zone: "main" },
                    [
                        [
                            `animationProperties@${widgetBus.rootPath}`,
                            "animationProperties@",
                        ],
                    ],
                    UIParameterAxesDisplay,
                ],
                [
                    {
                        zone: "main",
                        activationTest: () =>
                            !this.widgetBus
                                .getEntry(this.widgetBus.rootPath)
                                .has("activeActors"),
                    },
                    [
                        [`${widgetBus.rootPath.append("font")}`, "font"],
                        [
                            `animationProperties@${widgetBus.rootPath}`,
                            "animationProperties@",
                        ],
                    ],
                    UIParameterFontDisplay,
                    [["ui-parameters-display_layer"]],
                ],
                [
                    {
                        zone: "main",
                        activationTest: () =>
                            this.widgetBus
                                .getEntry(this.widgetBus.rootPath)
                                .has("activeActors"),
                    },
                    [["activeActors", "collection"]],
                    UIParametersFontDisplayCollection,
                    zones,
                    [["ui-parameters-display_layer"], ...customArgs],
                ],
            ];
        widgetBus.insertElement(localElement);
        super(widgetBus, zones, widgets);
        this._element = localElement;
    }
}

function _extractFirstKeyMomentTextColorHueValues(activeActors) {
    const firstKeyMomentTextColorPath = Path.fromParts(
            ".",
            "instance",
            "keyMoments",
            "0",
            "textColor",
            "instance",
        ),
        hueValues = [];
    for (const [, /*key*/ actor] of activeActors) {
        const readOnlyActor = unwrapPotentialWriteProxy(actor),
            firstKeyMomentTextColor = getEntry(
                readOnlyActor,
                firstKeyMomentTextColorPath,
            );
        if (!firstKeyMomentTextColor.hasWrapped)
            // ignore: has no value
            continue;
        const culoriColor = colorToCulori(firstKeyMomentTextColor),
            // just in case it's a different mode
            culoriColorOKLCH = culoriConverter("oklch")(culoriColor);
        // CAUTION:  Achromatic colors (shades of gray) will have an undefined hue.
        if (culoriColorOKLCH.h !== undefined)
            hueValues.push(culoriColorOKLCH.h);
    }
    return hueValues;
}

/**
 * This is an algorith to find hue values for comparison layer colors.
 * It is set up to produce a bluish value then a pinkish value then more
 * colors with a similar distance (HUE_STRIDE), unless the available
 * gaps between the hues get to small for the stride size, then the center
 * of the first biggest gap is used.
 *
 * The color progression if layer colors are changed or if existing layers
 * are deleted is dynamic, but the hue distance between colors should always
 * be good. More than three layers for the intended font comparison use case
 * seems extreme though.
 *
 * only looks at each actors KeyMoments[0] textColor
 */
function _getNextHueValueTurns(...hueValues) {
    // 0.55: blue <= INITIAL_HUE, HUE_STRIDE 2/5, HUE_STRIDE_MIN_GAP_SIZE 0.55
    // 0.95: pink
    // 0.35: green
    // Then centering strategy between gaps:
    // 0.1499: orange
    // 0.3999: darker blue/violet
    // 0.05: strong pink
    // 0.45: turquoise
    // 0.25: yellow
    const INITIAL_HUE = 0.55, // .55
        // geting started with something smaller than 0.5
        HUE_STRIDE = 2 / 5,
        // the next value will be + HUE_STRIDE if there's a
        // gap with at least HUE_STRIDE_MIN_GAP_SIZE, this is to
        // ensure the distnce to the next value is "big enough" when
        // HUE_STRIDE is applied. Otherwise, gaps will be filled using the
        // center position,
        HUE_STRIDE_MIN_GAP_SIZE = HUE_STRIDE + HUE_STRIDE * 0.5 - 0.05;
    // console.log('RAW hueValues:', ... hueValues);
    if (hueValues.length === 0) return INITIAL_HUE;

    // rotate to start at firstValue
    const firstValue = hueValues[0]; // before sort
    // We're only trying to find the first biggest gap, duplicates
    // could be filtered, but if the gap is 0 there's somewhere a
    // bigger gap anyways.
    hueValues.sort(); // ==> ascending
    // console.log('hueValues sorted', ...hueValues);
    const start = hueValues.indexOf(firstValue);
    // Rotate so that we start looking at the first gap in order,
    // the other gaps are not ordered anymore.
    hueValues.splice(
        0,
        Infinity,
        ...hueValues.slice(start),
        ...hueValues.slice(0, start),
    );

    // console.log('hueValues rotated', ...hueValues);
    const biggestGap = [];
    for (const [i, val] of hueValues.entries()) {
        const nextI = hueValues.length > i + 1 ? i + 1 : 0,
            nextValRaw = hueValues.at(nextI),
            // , nextVal = nextValRaw < val
            //       ? nextValRaw + 1
            //       : nextValRaw
            gapRaw = nextValRaw - val,
            gap = gapRaw < 0 ? gapRaw + 1 : gapRaw;
        // console.log(`hueValues i: ${i}, val: ${val}, nextI: ${nextI}, nextValRaw: ${nextValRaw}, gap: ${gap}`);
        if (biggestGap.length === 0 || biggestGap[1] < gap)
            biggestGap.splice(0, Infinity, i, gap === 0 ? 1 : gap);
    }
    // console.log('biggestGap', ...biggestGap);

    const [i, gap] = biggestGap,
        nextHueDistance =
            gap >= HUE_STRIDE_MIN_GAP_SIZE ? HUE_STRIDE : gap * 0.5, // center strategy
        newHue = (hueValues[i] + nextHueDistance) % 1;
    // console.log('newHue', newHue, 'strategy:', (gap >= HUE_STRIDE_MIN_GAP_SIZE) ? 'HUE_STRIDE' : 'CENTER');
    return newHue;
}

function getNextHueValueTurns(activeActors) {
    const hueValues = _extractFirstKeyMomentTextColorHueValues(activeActors);
    return _getNextHueValueTurns(...hueValues.map((deg) => deg / 360));
}

// Algorithm for hue spacing.
function getNextHueValueDeg(activeActors) {
    const nextHueInTurns = getNextHueValueTurns(activeActors);
    return nextHueInTurns * 360;
}

function createCellActorModel(activeActors, setColor = true) {
    const cellActorModel = createActor(
            "VideoproofArrayV2CellActorModel",
            activeActors.dependencies,
        ),
        // create keyframe [0] as it is used as the base for per layer
        // custom properties.
        //, cellActorModelInstance = cellActorModel.get('instance')
        //, keyMoments = cellActorModelInstance.get('keyMoments')
        keyMoments = getDraftEntry(cellActorModel, "instance/keyMoments"),
        KeyMomentModel = keyMoments.constructor.Model,
        newKeyMoment = KeyMomentModel.createPrimalDraft(
            keyMoments.dependencies,
        );
    if (setColor) {
        // set textColor to newKeyMoment ...
        // Get all colors from the first keyMoments in activeActors
        // and set the color evenly spaced, by an algortihm.
        const culorijsColor = {
                mode: "oklch",
                l: 0.7, // 1=== full
                c: 0.4, // 0.4 === full
                h: getNextHueValueDeg(activeActors), // 360 === full
                alpha: 0.6,
            },
            color = culoriToColor(culorijsColor, newKeyMoment.dependencies);
        newKeyMoment.set("textColor", color);
    }
    keyMoments.push(newKeyMoment);
    return cellActorModel;
}

/**
 * There's a UX twist:
 * The first cellActorModel will not have a color set, so it's the default
 * color, which is black.
 * The second cellActorModel will cause the color of the first cellActorModel
 * be set, if it is not set explicitly yet. This will cause some confusion
 * but hopefully will overall create satisfactory results.
 * The behavior is:
 *      one layer: black
 *      two layers: blue, pink
 * It may be nice, to remove the blue(?) again, once there's only one layer
 * left, however, the heuristic is hard to generalize. It may not be blue.
 * It also is explicitly set, so it may be meant to stay explicitly.
 */
function insertNewCellActorModel /*AndManageTextColor*/(activeActors) {
    if (activeActors.size === 1) {
        const firstKeyMoment = getDraftEntry(
                activeActors,
                "./0/instance/keyMoments/0",
            ),
            firstKeyMomentTexColor = getEntry(
                firstKeyMoment,
                "./textColor/instance",
            );
        // if the textColor of the first actor, first keyMoment, is not set
        if (!firstKeyMomentTexColor.hasWrapped) {
            const cellActorModel = createCellActorModel(activeActors, true),
                textColor = getEntry(
                    cellActorModel,
                    "./instance/keyMoments/0/textColor",
                );
            firstKeyMoment.set("textColor", textColor);
        }
    }
    const setColor = activeActors.size > 0, // set no color for initial actor
        cellActorModel = createCellActorModel(activeActors, setColor);
    activeActors.push(cellActorModel);
}

class VideoproofContainerStyler extends StaticNode {
    update(changedMap) {
        if (changedMap.has("animationProperties@")) {
            const animationProperties = changedMap.get("animationProperties@"),
                // the globalT name is defined for the Parent UIParametersDisplay
                // however, we read it here. It's interesting, as we don't
                // require it as a local dependency, animationProperties@
                // will trigger the update when required. So, this is an
                // example, where we require a name/alias, but don't need
                // to subscribe directly to the value!!! I.e. globalT
                // in this case won't appear ever in changedMap.
                globalT = this.getEntry("globalT").value,
                propertyValuesMap =
                    animationProperties.animanion.getPropertiesFromGlobalT(
                        globalT,
                    ),
                backgroundColorPropertyName = `${COLOR}stageBackgroundColor`,
                getDefault = (property) => {
                    return [true, getRegisteredPropertySetup(property).default];
                },
                colorPropertiesMap = [
                    [backgroundColorPropertyName, "background-color"],
                    // , [`${COLOR}textColor`, 'color']
                ];
            // For colors with transparency, this prevents that the color
            // is added on top of itself.
            this.node.style.setProperty(
                "--layout-specific-override-actor-renderer-videoproof-array-v2-background-color",
                "none",
            );
            actorApplyCSSColors(
                this.node,
                propertyValuesMap,
                getDefault,
                colorPropertiesMap,
            );
        }
    }
}

class VideoproofController extends _BaseTypeDrivenContainerComponentMixin(
    _BaseContainerComponent,
) {
    constructor(widgetBus, _zones) {
        const generalControlsContainer = widgetBus.domTool.createElement(
                "div",
                { class: "sidebar-group" },
            ),
            contextualGlyphsContainer = widgetBus.domTool.createElement("div", {
                class: "sidebar-group",
            }),
            keyMomentsContainer = widgetBus.domTool.createElement("div", {
                class: "sidebar-group",
            }),
            // FIXME: the main reason for this container is so far to have
            // a height restriction for the contextual model. But it
            // feels like a hack at the moment, requires institutionalization.
            videoproofContainer = widgetBus.domTool.createElement("div", {
                class: "videoproof_layout",
                style: "height: 100%",
            }),
            zones = new Map([
                ..._zones,
                ["general", generalControlsContainer],
                ["glyphs", contextualGlyphsContainer],
                ["keyMoments", keyMomentsContainer],
                ["videoproof", videoproofContainer],
            ]);
        super(widgetBus, zones);

        widgetBus.wrapper.setProtocolHandlerImplementation(
            ...SimpleProtocolHandler.create("animationProperties@"),
        );
        // original: this._animationPropertiesKey = `animationProperties@${this.widgetBus.rootPath.append('..', '..')}`;
        // old: const animationPropertiesKey = widgetBus.rootPath.append('videoproofArrayV2').toString()
        // NOTE: activeActors/0/instance in this setup is the "in-between" layer-actor and it
        // is the first/top-most actor that actually has keyMoments. This
        // model doesn't have keyMoments itself. So, for animation purposes
        // that is the root.
        const animationPropertiesRelativePath = Path.fromParts(
                "activeActors",
                "0",
                "instance",
            ),
            animationPropertiesPath = this.widgetBus.rootPath.append(
                ...animationPropertiesRelativePath,
            ),
            // This is not used via dependencyMapping, hence the path must be relative...
            // FIXME: This is a very good example having to track the paths
            // however, it can only be problematic in the motion-stage
            // case, as the layout, this example!!!, doesn't move the videoproofArrayV2
            // model around.
            formatAnimationPropertiesKey = (animationPropertiesPath) =>
                `animationProperties@${animationPropertiesPath}`,
            animationPropertiesKey = formatAnimationPropertiesKey(
                animationPropertiesPath,
            ),
            updateDefaultsDependencies = [
                [animationPropertiesKey, "animationProperties@"],
            ],
            videoProofActorRelativePath =
                animationPropertiesRelativePath.append(
                    "activeActors",
                    "0",
                    "instance",
                ),
            videoProofActorPath = this.widgetBus.rootPath.append(
                ...videoProofActorRelativePath,
            ),
            videoProofAnimationPropertiesKey =
                formatAnimationPropertiesKey(videoProofActorPath),
            videoProofActorUpdateDefaultsDependencies = [
                [videoProofAnimationPropertiesKey, "animationProperties@"],
            ],
            _updateDefaultsNames = new Set(
                Array.from(zip(...updateDefaultsDependencies))[1],
            ),
            requireUpdateDefaults = (changedMap) =>
                Array.from(changedMap.keys()).some((name) =>
                    _updateDefaultsNames.has(name),
                ),
            propertyRoot = "generic/charGroup/";
        // animationProperties@/activeState/videoproofArrayV2
        const widgets = [
            [
                {},
                ["t", "duration", "playing", "perpetual"],
                AnimationTGenerator,
            ],
            [
                { rootPath: animationPropertiesPath },
                [
                    [this.widgetBus.rootPath.append("t").toString(), "globalT"],
                    "keyMoments",
                    "isLoop",
                ],
                ContainerMeta,
                zones,
                initAnimanion,
                isInheritingPropertyFn,
            ],
            [
                { zone: "general" },
                [
                    ["./availableVideoproofActorTypes", "options"],
                    [
                        "./activeActors/0/instance/activeActors/0/actorTypeKey",
                        "value",
                    ],
                ],
                GenericSelect,
                "ui_videoproof_actor_select", // baseClass
                "Current", // labelContent
                (key, availableActor) => {
                    return availableActor.get("label").value;
                }, // optionGetLabel
                [], //allowNull
                null, //onChangeFn
                null, // optionGetGroup
            ],
            [
                { zone: "main" },
                [],
                Collapsible,
                "Actor",
                generalControlsContainer,
            ],
            [
                { zone: "layout" },
                [
                    [videoProofAnimationPropertiesKey, "animationProperties@"],
                    [widgetBus.rootPath.append("t").toString(), "globalT"],
                ],
                VideoproofContainerStyler,
                videoproofContainer,
            ],
            // let's init a Layer here, we ensured there is one at ./activeActors/0/instance
            (() => {
                const layerActorType =
                    activatableActorTypes.get(LAYER_TYPE_KEY);
                return getActorWidgetSetup({
                    typeKey: LAYER_TYPE_KEY, // ?
                    typeLabel: layerActorType.get("label").value,
                    typeClass: layerActorType.get("typeClass").value,
                    widgetRootPath: widgetBus.rootPath.append(
                        "activeActors",
                        "0",
                        "instance",
                    ),
                    zones: new Map([
                        ...zones,
                        ["layer", zones.get("videoproof")],
                    ]),
                    layerBaseClass: "videoproof_layout-layer",
                    getActorWidgetSetup,
                });
            })(),
            [
                {
                    zone: "main",
                    rootPath: videoProofActorPath.append("activeActors"),
                    activationTest: () =>
                        widgetBus.getEntry(
                            videoProofActorPath.parent.append("actorTypeKey"),
                        ).value === "VideoproofArrayV2ActorModel",
                },
                [],
                UIVideoproofArrayLayers,
                zones,
                "Layers",
            ],
            [
                // Doing it this way, we can eventually copy just the
                // videoproofArrayV2 model and by that inherit the whole
                // actor settings. Alternatively, a parent element could
                // set the basic properties, and we'd have to copy these
                // properties and insert them correctly into the target.
                // This way, videoproofArrayV2 is self contained.
                {
                    zone: "main",
                    rootPath: videoProofActorPath.append(
                        "keyMoments",
                        "0",
                        "charGroup",
                    ),
                    activationTest: () =>
                        widgetBus
                            .getEntry(
                                videoProofActorPath.append("keyMoments", "0"),
                            )
                            .has("charGroup"),
                },
                [],
                UICharGroupContainer,
                zones,
                // FIXME: "injectable" => this must update paths as well!
                {
                    // injectable
                    // not implemented: _getArgumentConfig http://localhost:8080/lib/js/components/layouts/motion-stage.mjs:2771
                    updateDefaultsDependencies,
                    // not implemented: _getArgumentConfig http://localhost:8080/lib/js/components/layouts/motion-stage.mjs:2775
                    requireUpdateDefaults,
                    genericTypeToUIElement,
                    // get: not implemented: UICharGroupContainer http://localhost:8080/lib/js/components/layouts/motion-stage.mjs:2955
                    // use: not implemented:  _activateCustom http://localhost:8080/lib/js/components/layouts/motion-stage.mjs:3020
                    // Uncaught (in promise) Error: not implemented: get getDefaults(prefix:string:generic/charGroup, key:string:options, defaultVal:object:null)
                    getDefaults: this._getDefaults.bind(
                        this,
                        videoProofAnimationPropertiesKey,
                    ),
                },
                propertyRoot,
                "Glyphs",
            ],
            // INJECT TYPE DRIVEN CONTEXTUAL WIDGETS
            ...(() => {
                const typeKey = "VideoproofContextualActorModel",
                    VideoproofContextualKeyMomentModel =
                        activatableVideoproofActorTypes
                            .get(typeKey)
                            .value.get("typeClass")
                            .value.get("keyMoments").Model,
                    contextualTypeDrivenFields = new Map([
                        ["presets", { localSettings: { zone: "general" } }],
                        [
                            "charGroups",
                            {
                                localSettings: { zone: "glyphs" },
                                resolvers: new Map([
                                    ...this.constructor._resolvers,
                                    ["label", simpleArgument(() => null)],
                                ]),
                            },
                        ],
                        ["template", {}],
                    ]),
                    generalSettings = {
                        zone: "main",
                        rootPath: videoProofActorPath.append("keyMoments", "0"),
                        activationTest: () =>
                            widgetBus.getEntry(
                                videoProofActorPath.parent.append(
                                    "actorTypeKey",
                                ),
                            ).value === typeKey,
                    },
                    // MAYBE this can be shared with the UICharGroupContainer definition above...
                    injectable = {
                        // injectable
                        updateDefaultsDependencies,
                        requireUpdateDefaults,
                        genericTypeToUIElement,
                        getDefaults: this._getDefaults.bind(
                            this,
                            videoProofAnimationPropertiesKey,
                        ),
                    },
                    ppsMap = ProcessedPropertiesSystemMap.fromPrefix(
                        GENERIC,
                        VideoproofContextualKeyMomentModel.fields.keys(),
                    ),
                    widgets = [];
                for (const [
                    fieldName,
                    { localSettings = {}, resolvers = null },
                ] of contextualTypeDrivenFields) {
                    const FieldType =
                        VideoproofContextualKeyMomentModel.fields.get(
                            fieldName,
                        );
                    widgets.push(
                        this._defineGenericWidget(
                            injectable,
                            { ...generalSettings, ...localSettings },
                            ppsMap.get(fieldName),
                            fieldName,
                            FieldType,
                            resolvers,
                        ),
                    );
                }

                // in here, so we can reuse activationTest
                widgets.unshift([
                    generalSettings,
                    [],
                    Collapsible,
                    "Glyphs",
                    contextualGlyphsContainer,
                ]);
                return widgets;
            })(),
            // RESUME NORMAL WIDGETS
            [
                {
                    zone: "general",
                    rootPath: videoProofActorPath.append("keyMoments", "0"),
                },
                [["cellAlignment", "value"]],
                UIAlignment,
                () =>
                    getRegisteredPropertySetup("generic/cellAlignment").default,
            ],
            [
                {
                    zone: "general",
                    rootPath: videoProofActorPath.append(
                        "keyMoments",
                        "0",
                        "textColor",
                    ),
                },
                [],
                UIColorChooser,
                zones,
                "Text Color",
                // argument = injectable.getDefaults.bind(null, propertyRoot, fieldName, BaseModelType.defaultValue);
                this._getDefaults.bind(
                    this,
                    videoProofAnimationPropertiesKey,
                    ProcessedPropertiesSystemMap.createSimpleRecord(
                        COLOR,
                        "textColor",
                    ),
                    "textColor",
                ),
                updateDefaultsDependencies,
                requireUpdateDefaults,
            ],
            [
                {
                    zone: "general",
                    rootPath: videoProofActorPath.append(
                        "keyMoments",
                        "0",
                        "stageBackgroundColor",
                    ),
                },
                [],
                UIColorChooser,
                zones,
                "Stage Color",
                // argument = injectable.getDefaults.bind(null, propertyRoot, fieldName, BaseModelType.defaultValue);
                this._getDefaults.bind(
                    this,
                    videoProofAnimationPropertiesKey,
                    ProcessedPropertiesSystemMap.createSimpleRecord(
                        COLOR,
                        "stageBackgroundColor",
                    ),
                    "stageBackgroundColor",
                ),
                updateDefaultsDependencies,
                requireUpdateDefaults,
            ],
            [
                {
                    zone: "general",
                    rootPath: videoProofActorPath.append(
                        "keyMoments",
                        "0",
                        "languageTag",
                    ),
                },
                [[videoProofAnimationPropertiesKey, "properties@"]],
                UILanguageTag,
                this._zones,
            ],
            [
                {
                    zone: "general",
                    rootPath: videoProofActorPath.append("keyMoments", "0"),
                },
                [
                    ["openTypeFeatures", "openTypeFeatures"],
                    // used as a fallback, but probably in this setting
                    // not required.
                    ["/font", "rootFont"],
                    //, ...updateDefaultsDependencies
                ],
                UIOTFeaturesChooser,
                this._zones,
                this._getDefaults.bind(this, videoProofAnimationPropertiesKey),
                (changedMap) => changedMap.has("font"), //requireUpdateDefaults
                // injected
                [["../../font", "font"]], //updateDefaultsDependencies
            ],
            [
                {
                    zone: "general",
                    rootPath: videoProofActorPath.append("keyMoments", "0"),
                },
                [["showCellBoxes", "value"]],
                UICheckboxOrEmptyInput,
                () =>
                    getRegisteredPropertySetup("generic/showCellBoxes").default,
                requireUpdateDefaults,
                "show_cell_boxes",
                "Show Cell Boxes",
            ],
            [
                {
                    zone: "general",
                },
                [["showParameters", "value"]],
                UICheckboxInput,
                "show-parameters", // classToken
                getRegisteredPropertySetup("generic/showParameters").label, //label
            ],
            [
                {
                    zone: "before-layout",
                    rootPath: videoProofActorPath,
                    activationTest: () => {
                        const showParameters =
                            widgetBus.getEntry("./showParameters");
                        return showParameters.value;
                    },
                },
                [
                    // we'll use this to determine a high contrast text color.
                    [
                        "./keyMoments/0/stageBackgroundColor",
                        "stageBackgroundColor",
                    ],
                    [widgetBus.rootPath.append("t").toString(), "globalT"],
                ],
                UIParametersDisplay,
                zones,
                ["ui_videoproof"],
            ],
            [{ zone: "main" }, [], UITimeControl, zones],
            [
                { zone: "main" },
                [],
                Collapsible,
                "Key Moments",
                keyMomentsContainer,
            ],
            [
                {
                    zone: "main",
                    // rootPath maybe don't alter rootPath now, as
                    //  ['axesMath', AxesMathLocationsSumModel] is top level
                    // in VideoproofArrayV2Model at the moment.
                    // will perhaps move into a dedicated struct though
                },
                [
                    // TODO:
                    [
                        videoProofActorRelativePath
                            .append("keyMoments")
                            .toString(),
                        "keyMoments",
                    ],
                    // actually, font may not be that interesting, but
                    // all the current videoproofArrayV2 layer fonts are
                    // VideoproofArrayV2CellActorModel in  videoproofArrayV2/activeActors
                    // ['videoproofArrayV2/activeActors', 'layers']
                    //     => which properties do we need to look at despite
                    //        of fonts? I don't think there's much.
                    //        The fonts will lead to the keyMoments being
                    //        updated.
                    // , ['../font', 'font']
                ],
                UIAxesMath,
                zones,
                "Rap Editor",
                // updateDefaultsDependencies
                videoProofActorUpdateDefaultsDependencies,
                { zone: "keyMoments", label: null }, //keyMomentsOptions
            ],
        ];
        this._initWidgets(widgets);
    }
    _getDefaults(
        animationPropertiesKey,
        ppsRecord,
        modelFieldName,
        defaultVal = _NOTDEF,
    ) {
        // This is similar to KeyMomentController._getDefaults
        // it should not be required to always have to rewrite these.
        const { fullKey } = ppsRecord,
            liveProperties = this.getEntry(animationPropertiesKey),
            activeKey = "0", // hard coded, here always the first key moment  //this.widgetBus.rootPath.parts.at(-1)
            propertyValues =
                liveProperties.getPropertyValuesMapForKeyMoment(activeKey);
        if (ppsRecord.prefix === COLOR) {
            const [color] = getColorFromPropertyValuesMap(
                fullKey,
                propertyValues,
                [null],
            );
            if (color !== null) return color;
            // If defaultVal === _NOTDEF and fullKey is not found
            // this will raise.
            const fallback = getRegisteredPropertySetup(
                fullKey,
                defaultVal === _NOTDEF
                    ? getRegisteredPropertySetup.NOTDEF
                    : defaultVal,
            );
            return fallback === defaultVal ? defaultVal : fallback.default;
        } else if (propertyValues.has(fullKey))
            return propertyValues.get(fullKey);

        if (defaultVal !== _NOTDEF) {
            return defaultVal;
        }
        throw new Error(
            `KEY ERROR ${this}._getDefaults: not found "${fullKey}" for ${activeKey} in ${liveProperties}`,
        );
    }
    update(...args) {
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("animationProperties@")
            .resetUpdatedLog();
        super.update(...args);
    }
    initialUpdate(...args) {
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("animationProperties@")
            .resetUpdatedLog();
        super.initialUpdate(...args);
    }
}

export { VideoproofModel as Model, VideoproofController as Controller };
