import { Path, StateComparison, getEntry } from "../../metamodel.mjs";

import {
    _CommonContainerComponent,
    _BaseComponent,
    _BaseContainerComponent,
} from "../basics.mjs";

import {
    converter as culoriConverter,
    formatCss as culoriFormatCss,
    blend,
} from "../../vendor/culori/bundled/culori.mjs";

import { getColorFromPropertyValuesMap, enhanceContrast } from "../color.mjs";

import { getRegisteredPropertySetup } from "../registered-properties.mjs";

import {
    COLOR,
    GENERIC,
    SPECIFIC,
    LEADING,
    ProcessedPropertiesSystemMap,
} from "../registered-properties-definitions.mjs";

import {
    getPropertyValue,
    actorApplyCSSColors,
    actorApplyCssProperties,
    setTypographicPropertiesToSample,
} from "../actors/properties-util.mjs";

import { setLanguageTag } from "../language-tags.typeroof.jsx";

import { createIcon } from "../icons.mjs";

import { renderAxesParameterDisplay } from "../axes-parameters.mjs";

import { setBlockType } from "prosemirror-commands";
import { toggleMark } from "./commands.ts";

import {
    getPathOfTypes,
    getPathsOfTypes,
    getTypeSpecPropertiesIdMethod,
    getTypeSpecsMethod,
} from "./integration.typeroof.jsx";

export function typeSpecGetFontMethod(changedMap, propertyValuesMap) {
    const fontPPSRecord = ProcessedPropertiesSystemMap.createSimpleRecord(
        SPECIFIC,
        "font",
    );
    const font = propertyValuesMap.has(fontPPSRecord.fullKey)
        ? propertyValuesMap.get(fontPPSRecord.fullKey)
        : // rootFont can't be ForeignKey.NULL
          this.getEntry("rootFont").value;
    return font;
}

class UIParametersDisplay extends _BaseComponent {
    constructor(widgetBus, extraClasses = [], customArgs = []) {
        // FIXME: depending on the type of the outer node, this might
        // better create <span> than <div> elements!
        const classes = ["ui-parameters-display", ...extraClasses],
            fontElement = widgetBus.domTool.createElement("div", {
                class: "ui-parameters-font",
            }),
            parametersElement = widgetBus.domTool.createElement(
                "div",
                { class: "ui-parameters-display_values" },
                "(insert parametrs here)",
            ),
            localElement = widgetBus.domTool.createElement(
                "div",
                {
                    class: classes.join(" "),
                    // This is super important to not interfere with
                    // cursor positioning of the browser and ProseMirror
                    contenteditable: "false",
                    // Since this lives within the structre of the document
                    // it would inherit the lang of the document, but, that's
                    // not necessarily correct. Until we internationalize
                    // the UI, it's save to assume that this has English
                    // content.
                    lang: "en",
                },
                [fontElement, parametersElement],
            );
        parametersElement;
        widgetBus.insertElement(localElement);
        super(widgetBus);
        this._element = localElement;
        this._parametersElement = parametersElement;
        this._fontElement = fontElement;
        this._customArgs = customArgs;
    }

    update(changedMap) {
        const typeSpecnion = (
                changedMap.has("properties@")
                    ? changedMap.get("properties@")
                    : this.getEntry("properties@")
            ).typeSpecnion,
            propertyValuesMap = typeSpecnion.getProperties();

        if (changedMap.has("properties@")) {
            renderAxesParameterDisplay(
                this._parametersElement,
                propertyValuesMap,
            );
            // To get the backgroundColor, let's do the full blending of
            // all background colors that could be relevant here. This means,
            // we also resolve the alpha channels and, as a first, we need to
            // get the background colors of all parents typeSpecs.
            //
            // NOTE: I'm not sure this is correct but currently it is,
            // following the typeSpecs does not necessarily resolve the
            // actual layers the node is in. So this may require a second
            // look, once we have the means and an example of a more complex
            // documents.
            // This is also interesting as the background colors are not
            // inheritend ("eigen-properties").
            const backgroundColorPropertyName = `${COLOR}backgroundColor`,
                getDefault = (property) => {
                    return [true, getRegisteredPropertySetup(property).default];
                },
                defaultBackgroundColor = getDefault(
                    backgroundColorPropertyName,
                )[1];

            // first color is on top
            const colors = [];
            {
                let currentTypeSpecnion = { parentTypeSpecnion: typeSpecnion };
                do {
                    currentTypeSpecnion =
                        currentTypeSpecnion.parentTypeSpecnion;
                    const propertyValuesMap =
                            currentTypeSpecnion.getProperties(),
                        [backgroundColor] = getColorFromPropertyValuesMap(
                            backgroundColorPropertyName,
                            propertyValuesMap,
                            [defaultBackgroundColor],
                        );
                    if (backgroundColor !== null) colors.push(backgroundColor);
                } while (currentTypeSpecnion.parentTypeSpecnion !== null);
                // add white as bottom color.
                colors.push({ mode: "rgb", r: 1, g: 1, b: 1 });
            }
            colors.reverse();
            const backgroundColor = blend(colors, "normal"),
                // Try to get this from CSS, it is defined like:
                //      `:root {--parameters-label-color: #09f;}`
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
                        ? enhanceContrast(labelTextColor, backgroundColor)
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
        }
        if (changedMap.has("rootFont") || changedMap.has("properties@")) {
            // This also triggers when font changes in a parent trickle
            // down, so these properties should always be set correctly.
            const font = typeSpecGetFontMethod.call(
                this,
                changedMap,
                propertyValuesMap,
            );
            this._fontElement.textContent = font.nameVersion;
        }
    }
}

/**
 * innerElement and outerElement may be the same, but e.g. for
 * the display of parameters information in ProseMirror, we have
 * an inner element, which content is controlled by ProseMirror and an
 * outer element, which contains the inner elemenent, but also other
 * elements such as the parameters containing element. Some properties
 * conceptually belong to the inner element, such as font-paramters,
 * and some belong to the outer element, such as background-color and
 * margins.
 */
export class UIDocumentTypeSpecStyler extends _BaseComponent {
    constructor(widgetBus, innerElement, outerElement, pmNode) {
        super(widgetBus);
        this.innerElement = innerElement;
        this.outerElement = outerElement;
        this.pmNode = pmNode;
    }
    update(changedMap) {
        const innerPropertiesData = [
                ["generic/textAlign", "text-align", ""],
                ["generic/direction", "direction", ""],
                // it's more complex, should get basefontSize and multiply with that
                // to determine the PT
                //, ['generic/columnWidth', 'width', 'em', val=>val*0.5/*it's supposed to be EN*/]
                [
                    "generic/columnWidth",
                    (
                        element,
                        value,
                        propertiesValueMap,
                        getDefault /*, useUnit*/,
                    ) => {
                        const [, baseFontSize] = getPropertyValue(
                                propertiesValueMap,
                                getDefault,
                                "generic/baseFontSize",
                            ),
                            columnWidthPT = value * baseFontSize * 0.5;
                        element.style.setProperty(
                            "width",
                            `${columnWidthPT}pt`,
                        );
                    },
                ],
            ],
            outerPropertiesData = [
                // using this to define a margin-top
                [`${LEADING}leading/line-height-em`, "--line-height", "em"],
                [`${GENERIC}blockMargins/start`, "--margin-block-start", ""],
                [`${GENERIC}blockMargins/end`, "--margin-block-end", ""],
            ],
            propertyValuesMap = (
                changedMap.has("properties@")
                    ? changedMap.get("properties@")
                    : this.getEntry("properties@")
            ).typeSpecnion.getProperties(),
            // Next sibling's resolved properties. Only present when a next
            // sibling exists — last child has no nextProperties@ wired.
            nextProperties =
                this.widgetBus.wrapper.dependencyReverseMapping.has(
                    "nextProperties@",
                )
                    ? (changedMap.has("nextProperties@")
                          ? changedMap.get("nextProperties@")
                          : this.getEntry("nextProperties@")
                      ).typeSpecnion.getProperties()
                    : null;
        // console.log(`${this}.update propertyValuesMap:`, ...propertyValuesMap.keys());
        if (changedMap.has("rootFont") || changedMap.has("properties@")) {
            // This also triggers when font changes in a parent trickle
            // down, so these properties should always be set correctly.
            const font = typeSpecGetFontMethod.call(
                this,
                changedMap,
                propertyValuesMap,
            );
            this.innerElement.style.setProperty(
                "font-family",
                `"${font.fullName}"`,
            );

            this.innerElement.style.setProperty(
                "--units-per-em",
                `${font.fontObject.unitsPerEm}`,
            );
            this.innerElement.style.setProperty(
                "--ascender",
                `${font.fontObject.ascender}`,
            );
            this.innerElement.style.setProperty(
                "--descender",
                `${font.fontObject.descender}`,
            );
        }

        if (changedMap.has("properties@")) {
            // , getDefault = property => [true, _getRegisteredPropertySetup(property).default]
            const innerColorPropertiesMap = [[`${COLOR}textColor`, "color"]],
                outerColorPropertiesMap = [
                    [`${COLOR}backgroundColor`, "background-color"],
                ],
                getDefault = (property) => {
                    if (property.startsWith(`${GENERIC}blockMargins/`)) {
                        // FIXME: this is a hack!
                        return [true, 0];
                    }
                    return [true, getRegisteredPropertySetup(property).default];
                };
            // console.log(`${this}.update propertyValuesMap ...`, ...propertyValuesMap.keys(), '!', propertyValuesMap);
            actorApplyCSSColors(
                this.innerElement,
                propertyValuesMap,
                getDefault,
                innerColorPropertiesMap,
            );

            actorApplyCSSColors(
                this.outerElement,
                propertyValuesMap,
                getDefault,
                outerColorPropertiesMap,
            );

            //  set properties to sample...
            // console.log(`${this.constructor.name}.update propertyValuesMap:`, ...propertyValuesMap);
            // Everything below can basically go only into this blog, as there
            // won't be the bottom kind of properties, at least not for
            // the example
            // console.log(`${this}.update(${[...changedMap.keys()].join(', ')}), propertyValuesMap:`, ...propertyValuesMap);
            // FIXME: also properties that are not explicitly set in here
            // should have a value!
            actorApplyCssProperties(
                this.innerElement,
                propertyValuesMap,
                getDefault,
                innerPropertiesData,
            );
            actorApplyCssProperties(
                this.outerElement,
                propertyValuesMap,
                getDefault,
                outerPropertiesData,
            );
            setTypographicPropertiesToSample(
                this.innerElement,
                propertyValuesMap,
                true, // skipFontSize: we need it in outerElement!
            );
            setLanguageTag(this.outerElement, propertyValuesMap);

            // If margin-end unit is 'lineHeightAfter' or 'emAfter', the
            // value must be computed from the next sibling's typeSpecnion.
            // actorApplyCssProperties will have set --margin-block-end to
            // the default (0) since createMargin returns null for *After
            // units. Fall back to current propertyValuesMap when the next
            // sibling resolves to the same TypeSpec (deduplicated). CSS
            // handles the last-child case via :not(:last-child).
            const marginEndUnit = propertyValuesMap.get(
                `${GENERIC}blockMargins/end/unit`,
            );
            if (
                marginEndUnit === "lineHeightAfter" ||
                marginEndUnit === "emAfter"
            ) {
                const nsProps = nextProperties ?? propertyValuesMap,
                    marginEndValue = propertyValuesMap.get(
                        `${GENERIC}blockMargins/end/value`,
                    ),
                    nsFontSize = nsProps.get(`${GENERIC}fontSize`),
                    nsLineHeightEm = nsProps.get(
                        `${LEADING}leading/line-height-em`,
                    );
                if (
                    marginEndValue !== null &&
                    marginEndValue !== undefined &&
                    nsFontSize !== null &&
                    nsFontSize !== undefined
                ) {
                    const computed =
                        marginEndUnit === "lineHeightAfter"
                            ? `${
                                  marginEndValue * nsLineHeightEm * nsFontSize
                              }pt`
                            : `${marginEndValue * nsFontSize}pt`;
                    this.outerElement.style.setProperty(
                        "--margin-block-end",
                        computed,
                    );
                }
            }

            // putting font-size on the outer element, that way, we can use
            // EM also on the outer element.
            const fontSizeName = `${GENERIC}fontSize`;
            if (propertyValuesMap.has(fontSizeName))
                this.outerElement.style.setProperty(
                    "font-size",
                    `${propertyValuesMap.get(fontSizeName)}pt`,
                );
            else this.outerElement.style.removeProperty("font-size");
        }
    }
}

class NodeTypeSpecLabel extends _BaseComponent {
    constructor(widgetBus, typeSpecPath) {
        super(widgetBus);
        this._typeSpecPath = typeSpecPath;
        const h = widgetBus.domTool.h;
        this.element = <div class="ui_type_spec_label">[…]</div>;
        this._insertElement(this.element);
    }

    update(changedMap) {
        if (changedMap.has("label")) {
            const label = changedMap.get("label").value;
            this.element.setAttribute("title", label);
            this.element.textContent = label;
        }
        if (changedMap.has("editingTypeSpec")) {
            const editingTypeSpec = changedMap.get("editingTypeSpec");
            let isActive = false;
            if (!editingTypeSpec.isEmpty) {
                // make it explicitly relative, so equals works...
                // FIXME: should rather fix the equals method!
                isActive = this._typeSpecPath.equals(
                    Path.fromParts(".", ...editingTypeSpec.value.parts),
                );
            }
            this.element.classList[isActive ? "add" : "remove"](
                "ui_type_spec-editing",
            );
        }
    }
}

class UIDocumentNodeOutfitter extends _BaseContainerComponent {
    constructor(
        widgetBus,
        _zones,
        structuralElements,
        typeSpecPath,
        pmNode,
        originTypeSpecPath,
        getPos,
        nodeOutfitterOptions = { typeSpecLabels: false },
    ) {
        // If structuralElements.outer === structuralElements.inner
        // the contents of outer must be purely managed by prosemirror
        // and hence it would be plainly wrong to create a zone for
        // another widget to use.
        const zones =
            structuralElements.outer !== structuralElements.inner
                ? new Map([..._zones, ["outer", structuralElements.outer]])
                : _zones;

        super(widgetBus, zones);
        this._structuralElements = structuralElements;
        // could kind of extract this from properties@
        this._typeSpecPath = typeSpecPath;
        this._pmNode = pmNode;
        this._originTypeSpecPath = originTypeSpecPath; // required for getTypeSpecPropertiesIdMethod
        this._getPos = getPos;
        this._nodeOutfitterOptions = nodeOutfitterOptions;

        this._nextProperties = null;
        {
            const initialWidgets = this._staticWidgets;
            this._initialWidgetsAmount = initialWidgets.length;
            this._initWidgets(initialWidgets); // put widgetWrappers into this._widgets
        }
    }

    get pmNode() {
        return this._pmNode;
    }

    get _staticWidgets() {
        return [
            [
                {
                    zone: "outer",
                    activationTest: () => this.getEntry("showParameters").value,
                },
                [
                    [
                        this.widgetBus.getExternalName("properties@"),
                        "properties@",
                    ],
                    [this.widgetBus.getExternalName("rootFont"), "rootFont"],
                ],
                UIParametersDisplay,
                ["ui_type_spec_ramp"],
            ],
            [
                {
                    zone: "outer",
                    // If the `typeSpecLabels` option is a function it is
                    // treated itself as the activationTest function,
                    // leaving it to the caller how to implement it. Otherwise,
                    // the  activationTest will only return true if the value
                    // of the option is strictly `true`;
                    activationTest: () => {
                        if (
                            typeof this._nodeOutfitterOptions
                                ?.typeSpecLabels === "function"
                        )
                            return this._nodeOutfitterOptions.typeSpecLabels();
                        return (
                            this._nodeOutfitterOptions.typeSpecLabels === true
                        );
                    },
                },
                [
                    [this._typeSpecPath.append("label").toString(), "label"],
                    ["editingTypeSpec"],
                ],
                NodeTypeSpecLabel,
                this._typeSpecPath.toRelative(
                    this.widgetBus.rootPath.append("typeSpec", "children"),
                ),
            ],
        ];
    }

    _createWidgetDefinition() {
        // update/replace this dynamically depending on the value of
        // nextProperties which we, at this point, hopefully always, can
        // determine using pmNode, parenContent and pmNode-Index => I hope
        // we can't/won't create clashes with nodes that exist as duplicates,
        // but I believe, PM wouldn't accept that anyways, metamodel would,
        // so we should not do that ...!

        const ownProperties = this.widgetBus.getExternalName("properties@"),
            stylerDependencies = [
                [ownProperties, "properties@"],
                [this.widgetBus.getExternalName("rootFont"), "rootFont"],
                // I'm not so sure this is required at all!
                [
                    this.widgetBus.getExternalName("parentContent"),
                    "parentContent",
                ],
            ];

        // Conditionally include next sibling's typeSpecnion for
        // resolving lineHeightAfter/emAfter margin units.
        if (
            this._nextProperties !== null &&
            this._nextProperties !== ownProperties
        )
            stylerDependencies.push([this._nextProperties, "nextProperties@"]);

        return [
            {},
            stylerDependencies,
            UIDocumentTypeSpecStyler,
            this._structuralElements.inner,
            this._structuralElements.outer,
        ];
    }

    // requires this.getEntry(nodeSpecToTypeSpecName),
    _getTypeSpecPropertiesId = getTypeSpecPropertiesIdMethod;

    _checkNextProperties(/*compareResult*/) {
        // NOTE: if this._nextProperties is null it must be set in here!

        // `parentContent` we actually do set in the parent! and if it changes (ever) we would
        // expect parent to re-initialize this!
        // [this.widgetBus.getExternalName("parentContent"), "parentContent"],
        // const changedMap = this._getChangedMapFromCompareResult(compareResult);
        // => TODO: we could use the none-presence of `parentContent` as an
        // indicator that we don't need to check further.

        const view = this.widgetBus.getWidgetById("proseMirror").view;
        const nodePos = this._getPos();
        // Resolve the position

        const nextPos = nodePos + this._pmNode.nodeSize;
        let nextPathOfTypes = null;
        let nextNode = null;
        let nextResolved = null;
        // 3. Ensure we haven't walked off the end of the document
        if (nextPos < view.state.doc.content.size) {
            // 4. Resolve the calculated position
            nextResolved = view.state.doc.resolve(nextPos);

            // 5. Look at the node sitting exactly at this new position
            nextNode = nextResolved.nodeAfter;

            if (nextNode) {
                nextPathOfTypes = getPathOfTypes(
                    nextResolved.path,
                    nextNode.type.name,
                );
            }
        }

        const nextTypeSpecProperties =
            nextPathOfTypes !== null
                ? this._getTypeSpecPropertiesId(nextPathOfTypes)
                : null;
        const hasChanged = this._nextProperties !== nextTypeSpecProperties;
        if (hasChanged)
            // update the cached value as well
            this._nextProperties = nextTypeSpecProperties;
        return hasChanged;
    }

    // NOTE: I adopted the pattern of intial widgets and dynamic widgets
    // from the pattern in UILeadingAlgorithm in components/type-spec-fundamentals.mjs
    _provisionWidgets(compareResult) {
        const removedDynamicWidgets = this._widgets.splice(
            this._initialWidgetsAmount,
            Infinity,
        );
        const requiresFullInitialUpdate = super._provisionWidgets.call(this);

        // figure out the nextProperties@ of this._pmNode and if
        // they have changed, rebuild the UIDocumentTypeSpecStyler.

        const requireUpdateDynamicWidget =
            this._checkNextProperties(compareResult) ||
            removedDynamicWidgets.length === 0; // is initial
        // do we need to replace/renew the dynamic widget
        if (!requireUpdateDynamicWidget) {
            // don't change
            this._widgets.push(...removedDynamicWidgets);
            removedDynamicWidgets.splice(0, Infinity);
        } else {
            const widgetDefinitions = [this._createWidgetDefinition()];
            this._initWidgets(widgetDefinitions); // pushes into this._widgets
        }

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
}

export class UIDocumentUnkownStyleStyler extends _BaseComponent {
    _CLASS = "unknown-style";
    constructor(widgetBus, element) {
        super(widgetBus);
        this.element = element;
        this.element.classList.add(this._CLASS);
    }
    destroy() {
        this.element.classList.remove(this._CLASS);
    }
}

export class UIDocumentStyleStyler extends _BaseComponent {
    constructor(widgetBus, element) {
        super(widgetBus);
        this.element = element;
    }
    destroy() {
        this.element.style = "";
    }
    update(changedMap) {
        const propertiesData = [],
            propertyValuesMap = (
                changedMap.has("properties@")
                    ? changedMap.get("properties@")
                    : this.getEntry("properties@")
            ).typeSpecnion.getProperties();
        // console.log(`${this}.update propertyValuesMap:`, ...propertyValuesMap.keys());
        if (changedMap.has("rootFont") || changedMap.has("properties@")) {
            // This also triggers when font changes in a parent trickle
            // down, so these properties should always be set correctly.
            const fontPPSRecord =
                ProcessedPropertiesSystemMap.createSimpleRecord(
                    SPECIFIC,
                    "font",
                );
            const font = propertyValuesMap.has(fontPPSRecord.fullKey)
                ? propertyValuesMap.get(fontPPSRecord.fullKey)
                : // rootFont can't be ForeignKey.NULL
                  this.getEntry("rootFont").value;
            this.element.style.setProperty("font-family", `"${font.fullName}"`);
            this.element.style.setProperty(
                "--units-per-em",
                `${font.fontObject.unitsPerEm}`,
            );
            this.element.style.setProperty(
                "--ascender",
                `${font.fontObject.ascender}`,
            );
            this.element.style.setProperty(
                "--descender",
                `${font.fontObject.descender}`,
            );
        }

        if (changedMap.has("properties@")) {
            // , getDefault = property => [true, _getRegisteredPropertySetup(property).default]
            const colorPropertiesMap = [
                    ["colors/backgroundColor", "background-color"],
                    ["colors/textColor", "color"],
                ],
                getDefault = (property) => {
                    return [true, getRegisteredPropertySetup(property).default];
                };
            // console.log(`${this}.update propertyValuesMap ...`, ...propertyValuesMap.keys(), '!', propertyValuesMap);
            actorApplyCSSColors(
                this.element,
                propertyValuesMap,
                getDefault,
                colorPropertiesMap,
            );
            //  set properties to sample...
            // console.log(`${this.constructor.name}.update propertyValuesMap:`, ...propertyValuesMap);
            // Everything below can basically go only into this blog, as there
            // won't be the bottom kind of properties, at least not for
            // the example
            // console.log(`${this}.update(${[...changedMap.keys()].join(', ')}), propertyValuesMap:`, ...propertyValuesMap);
            // FIXME: also properties that are not explicitly set in here
            // should have a value!
            actorApplyCssProperties(
                this.element,
                propertyValuesMap,
                getDefault,
                propertiesData,
            );
            setTypographicPropertiesToSample(this.element, propertyValuesMap);
            setLanguageTag(this.element, propertyValuesMap);
        }
    }
}

/**
 * Being registered with the id "typeSpecSubscriptionsRegistry"
 * this provides the interfaces:
 *    Used by ProsemirrorNodeView:
 *      - subscribe(domElement, pathOfTypes, structuralElements)
 *      - unsubscribe(domElement)
 *    Used by ProsemirrorMarkView:
 *      - subscribeMark(domElement, mark)
 *      - unsubscribeMark(domElement)
 */
export class TypeSpecSubscriptions extends _CommonContainerComponent {
    constructor(
        widgetBus,
        zones,
        originTypeSpecPath,
        nodeOutfitterOptions = {},
    ) {
        super(widgetBus, zones);
        this._originTypeSpecPath = originTypeSpecPath;
        this._subscribers = new Map();

        this._newlySubscribedMarks = new Map();
        this._marksDomObserver = new MutationObserver(
            this._checkNewlySubscribedMarks.bind(this),
        );
        this._styleSubscribers = new Map();
        this._nodeOutfitterOptions = Object.assign(
            {
                typeSpecLabels: false,
            },
            nodeOutfitterOptions,
        );
    }

    get dependencies() {
        const dependencies = super.dependencies;
        dependencies.add(this.widgetBus.getExternalName("nodeSpecToTypeSpec"));
        return dependencies;
    }
    get modelDependencies() {
        const dependencies = super.modelDependencies;
        dependencies.add(this.widgetBus.getExternalName("nodeSpecToTypeSpec"));
        return dependencies;
    }

    _getStyleLinkPropertiesId(typeSpecProperties, styleLink) {
        const typeSpecPath = typeSpecProperties.slice(
                "typeSpecProperties@".length,
            ),
            styleLinkPropertiesId = `styleLinkProperties@${Path.fromParts(typeSpecPath, "stylePatches", styleLink)}`,
            protocolHandlerImplementation =
                this.widgetBus.getProtocolHandlerImplementation(
                    "styleLinkProperties@",
                    null,
                );
        if (protocolHandlerImplementation === null)
            throw new Error(
                `KEY ERROR ProtocolHandler for identifier "styleLinkProperties@" not found.`,
            );
        // check if styleLinkPropertiesId exists, otherwise return null
        if (protocolHandlerImplementation.hasRegistered(styleLinkPropertiesId))
            return styleLinkPropertiesId;
        return null;
        // throw new Error(`KEY ERROR styleLinkPropertiesId "${styleLinkPropertiesId}" not found in styleLinkProperties@.`);
    }

    _createStyleStylerWrapper(styleLinkProperties, domElemment) {
        const settings = {},
            dependencyMappings =
                styleLinkProperties === null
                    ? []
                    : [
                          [styleLinkProperties, "properties@"],
                          ["/font", "rootFont"],
                      ],
            Constructor =
                styleLinkProperties === null
                    ? UIDocumentUnkownStyleStyler
                    : UIDocumentStyleStyler,
            args = [domElemment];
        return this._initWrapper(
            this._childrenWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }

    _createStyleSubscription(
        domElement,
        parentSubscription,
        mark,
        styleLinkPropertiesId = null,
    ) {
        // if styleLinkPropertiesId === null
        const widgetWrapper = this._createStyleStylerWrapper(
            styleLinkPropertiesId,
            domElement,
        );
        return {
            widgetWrapper,
            mark,
            styleLinkPropertiesId,
            parentSubscription, // only used in _unregisterStyleSubscription
        };
    }

    _registerStyleSubscription(
        domElement,
        parentSubscription,
        styleSubscription,
    ) {
        this._styleSubscribers.set(domElement, styleSubscription);
        parentSubscription.styles.add(domElement);
    }

    _unregisterStyleSubscription(domElement) {
        if (!this._styleSubscribers.has(domElement)) return;
        const { parentSubscription } = this._styleSubscribers.get(domElement);
        this._styleSubscribers.delete(domElement);
        parentSubscription.styles.delete(domElement);
    }

    _finalizeMarkSubscription(domElement, mark) {
        const parentSubscription = this._subscribers.get(
                domElement.parentElement,
            ),
            styleLinkPropertiesId = this._getStyleLinkPropertiesId(
                parentSubscription.typeSpecProperties,
                mark.attrs["data-style-name"],
            ),
            styleSubscription = this._createStyleSubscription(
                domElement,
                parentSubscription,
                mark,
                styleLinkPropertiesId,
            );
        this._registerStyleSubscription(
            domElement,
            parentSubscription,
            styleSubscription,
        );
        this._updateDOM(() =>
            this._activateWidget(styleSubscription.widgetWrapper),
        );
    }

    _checkNewlySubscribedMarks(mutations_) {
        const mutations = Array.from(mutations_);
        while (mutations.length) {
            if (this._newlySubscribedMarks.size === 0) {
                // NOTE: seems pointless to do:
                //      mutations.push(...this._marksDomObserver.takeRecords());
                // as there are no _newlySubscribedMarks regardless.
                this._marksDomObserver.disconnect();
                break;
            }
            const mutationRecord = mutations.pop();
            // FIXME: the node can also be added as a childNode, or even
            // deeper and we would see here only the upmost added node.
            // It looks like we would still have it here in _newlySubscribedMarks
            // but we would not see it directly as node as it could be any
            // of the children!
            // It could even be quicker to iterate over all nodes in
            // this._newlySubscribedMarks and see if we can identify their
            // parent nodes...!
            for (const node of mutationRecord.addedNodes) {
                if (this._newlySubscribedMarks.has(node)) {
                    const mark = this._newlySubscribedMarks.get(node);
                    this._newlySubscribedMarks.delete(node);
                    this._finalizeMarkSubscription(node, mark);
                }
            }
        }
        for (const [node, mark] of this._newlySubscribedMarks) {
            if (
                node.parentElement &&
                this._subscribers.has(node.parentElement)
            ) {
                this._newlySubscribedMarks.delete(node);
                this._finalizeMarkSubscription(node, mark);
            }
        }
        if (this._newlySubscribedMarks.size === 0)
            this._marksDomObserver.disconnect();
    }

    _createTypeSpecStylerWrapper(
        typeSpecProperties,
        typeSpecPath,
        domElement,
        structuralElements,
        parentContentsPath,
        node,
        getPos,
    ) {
        const settings = {},
            dependencyMappings = [
                [typeSpecProperties, "properties@"],
                ["/font", "rootFont"],
                ["showParameters"],
                // unused so far!
                [parentContentsPath.toString(), "parentContent"],
            ];
        const Constructor = UIDocumentNodeOutfitter,
            args = [
                this._zones,
                structuralElements,
                typeSpecPath,
                node,
                this._originTypeSpecPath,
                getPos,
                this._nodeOutfitterOptions,
            ];
        return this._initWrapper(
            this._childrenWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }

    _getTypeSpecPropertiesId = getTypeSpecPropertiesIdMethod;

    _subscriptionGetDerrived(domElement) {
        const subscription = this._subscribers.get(domElement);

        // https://prosemirror.net/docs/ref/#model.ResolvedPos
        // https://prosemirror.net/docs/ref/#model.Node.resolve
        // we don't actually need to know the node position, but we
        // care about the TypeSpec of it and possibly of it's parents types
        const view = this.widgetBus.getWidgetById("proseMirror").view,
            { getPos, node } = subscription,
            resolved = view.state.doc.resolve(getPos()),
            pathOfTypes = getPathOfTypes(resolved.path, node.type.name),
            typeSpecProperties = this._getTypeSpecPropertiesId(pathOfTypes),
            typeSpecPath = this._getTypeSpecPropertiesId(
                pathOfTypes,
                true /*asPath*/,
            ),
            indexPath = [];
        for (let d = 0; d <= resolved.depth; d++)
            indexPath.push(resolved.index(d));

        const parentContentsPath = Path.fromParts(
            this.widgetBus.getExternalName("document"),
            ...indexPath.map((i) => ["content", i]).flat(),
        ).parent;

        return {
            pathOfTypes,
            typeSpecProperties,
            typeSpecPath,
            parentContentsPath,
        };
    }

    subscribe(
        domElement,
        structuralElements,
        node,
        getPos,
        decorations,
        innerDecorations,
    ) {
        const subscription = {
            structuralElements,
            node,
            getPos,
            decorations,
            innerDecorations,
            styles: new Set(),
        };
        this._subscribers.set(domElement, subscription);
        const derrived = this._subscriptionGetDerrived(domElement),
            { typeSpecProperties, typeSpecPath, parentContentsPath } = derrived;
        const widgetWrapper = this._createTypeSpecStylerWrapper(
            typeSpecProperties,
            typeSpecPath,
            domElement,
            structuralElements,
            parentContentsPath,
            node,
            getPos,
        );
        Object.assign(subscription, derrived, { widgetWrapper });
        this._updateDOM(() => this._activateWidget(widgetWrapper));
    }

    // especially when node has changed, e.g. when a node was split by
    // pressing Enter within it's content.
    updateSubscription(domElement, node, decorations, innerDecorations) {
        const subscription = this._subscribers.get(domElement);
        Object.assign(subscription, { node, decorations, innerDecorations });
        const updates = this._updateWidget(domElement, subscription);
        if (updates === null) return;
        const { widgetWrapper } = updates;
        this._destroyWidget(subscription.widgetWrapper);
        this._widgets.splice(
            this._widgets.indexOf(subscription.widgetWrapper),
            1,
        );
        Object.assign(subscription, updates);
        this._updateDOM(() => this._activateWidget(widgetWrapper));
    }

    _activateWidget(widgetWrapper) {
        this._widgets.push(widgetWrapper);
        this._createWidget(widgetWrapper);
        const _compareResult = StateComparison.createInitial(
            this.getEntry("/"),
            widgetWrapper.dependencyMapping,
        );
        this.constructor.updateWidget(
            widgetWrapper,
            _compareResult,
            true,
            true,
        );
    }

    _deactivateWidget(widgetWrapper) {
        this._destroyWidget(widgetWrapper);
        this._widgets.splice(this._widgets.indexOf(widgetWrapper), 1);
    }

    unsubscribe(domElement) {
        const subscription = this._subscribers.get(domElement);
        this._subscribers.delete(domElement);
        this._updateDOM(() =>
            this._deactivateWidget(subscription.widgetWrapper),
        );

        // Edge-Case:
        // When a node-type is changed e.g. from "paragraph-1" to "heading-3",
        // it's interesting that the `subscribe` of heading-3 is called before
        // the unsubscribe of the domElement of the "paragraph-1" node.
        // When paragraph-1 is finally unsubscribed, it's marks are still
        // contained in the element, although, they will get re-used.
        for (const styleDOMElement of subscription.styles) {
            const { mark } = this._styleSubscribers.get(styleDOMElement);
            // clean up
            this.unsubscribeMark(styleDOMElement);
            // re-subscribe
            // This puts the mark into this._newlySubscribedMarks, where
            // it waits for _checkNewlySubscribedMarks via the MutationObserver.
            // However, we don't know yet, if the styleDOMElement is going
            // to be moved to a new node! `unsubscribeMark` is aware of
            // this._newlySubscribedMarks and if this mark actually gets
            // unsubscribed via ProseMirror mirror eventually,
            // this._newlySubscribedMarks will get cleaned up.
            this.subscribeMark(styleDOMElement, mark);
        }
    }

    subscribeMark(domElement, mark) {
        // request a rendering once the view is done...
        // the element, at this point is not in the dom, one way to
        // trigger an initial update would be to create a DOMObserver
        // We need the position in the DOM to find out what the parent
        // type and thus TypeSpec is.
        if (this._newlySubscribedMarks.size === 0) {
            const observerOptions = {
                    childList: true,
                    subtree: true,
                },
                proseMirrorComponent = this.widgetBus.getWidgetById(
                    "proseMirror",
                    null,
                );
            if (proseMirrorComponent === null)
                // This case happens during destroy, when "proseMirror"
                // does already not exist anymore.
                return;
            this._marksDomObserver.observe(
                proseMirrorComponent.element,
                observerOptions,
            );
        }
        this._newlySubscribedMarks.set(domElement, mark);
    }

    unsubscribeMark(domElement) {
        if (this._newlySubscribedMarks.has(domElement)) {
            this._newlySubscribedMarks.delete(domElement);
            if (this._newlySubscribedMarks.size === 0) {
                // const mutations = this._marksDomObserver.takeRecords();
                this._marksDomObserver.disconnect();
                // if (mutations.length > 0)
                //    this._checkNewlySubscribedMarks(mutations);
            }
        }
        if (!this._styleSubscribers.has(domElement)) return;
        const subscription = this._styleSubscribers.get(domElement);
        this._unregisterStyleSubscription(domElement);
        this._updateDOM(() =>
            this._deactivateWidget(subscription.widgetWrapper),
        );
    }

    initialUpdate() {
        /*nothing to do*/
        /* All widgets are added later in the lifecycle of this compoment.*/
    }

    _updateWidget(domElement, subscription) {
        const derrived = this._subscriptionGetDerrived(domElement);
        let requireUpdate = false;

        // OK so here;s an inline comparison of those items in derrived
        // not sure if we require this eventually
        EVALUATION: for (const [key, value] of Object.entries(derrived)) {
            const cached = subscription[key];
            if (key === "pathOfTypes") {
                // compare arrays
                if (value.length !== cached.length) {
                    requireUpdate = true;
                    break EVALUATION;
                }
                for (let i = 0, l = value.length; i < l; i++) {
                    if (value[i] !== cached[i]) {
                        requireUpdate = true;
                        break EVALUATION;
                    }
                }
            }
            // typeSpecProperties
            else if (typeof value === "string") {
                if (value !== cached) {
                    requireUpdate = true;
                    break EVALUATION;
                }
            }
            // typeSpecPath, parentContentsPath
            else if (value instanceof Path) {
                if (!value.equals(cached)) {
                    requireUpdate = true;
                    break EVALUATION;
                }
            } else
                throw new Error(
                    `TYPE ERROR don't know how to compare ${key} of subscription`,
                );
        }

        if (
            !requireUpdate &&
            subscription.widgetWrapper?.widget.pmNode === subscription.node
        )
            // if parentContentsPath changed, so far, it would be a great
            // reason to rebuild this
            // did not change
            return null;

        const { typeSpecProperties, typeSpecPath, parentContentsPath } =
            derrived;

        // BUILD NEW REPLACEMEMT
        const widgetWrapper = this._createTypeSpecStylerWrapper(
            typeSpecProperties,
            typeSpecPath,
            domElement,
            subscription.structuralElements,
            parentContentsPath, // has potential to change, would be better if not
            subscription.node, // <= will change!
            subscription.getPos, // <= will never change!
        );
        return Object.assign({ widgetWrapper }, derrived);
    }

    _provisionWidgets(compareResult) {
        const requiresFullInitialUpdate = new Set(),
            changedMap = this._getChangedMapFromCompareResult(compareResult);
        if (
            !changedMap.has("nodeSpecToTypeSpec") &&
            !changedMap.has("typeSpec")
        )
            return requiresFullInitialUpdate;

        // Here are some edge-cases we need to cover here:
        // - When a used typeSpec e.g. get's move. here doc/paragraph-2
        //   to docs/paragraph-1/paragraph-2
        // - When a used stylePatches link e.g. "italic" is renamed e.g. to "italicx"
        const requiresUpdate = new Map();
        for (const [domElement, subscription] of this._subscribers) {
            const updates = this._updateWidget(domElement, subscription);
            if (updates === null) continue;
            const { widgetWrapper } = updates;
            this._destroyWidget(subscription.widgetWrapper);
            this._widgets.splice(
                this._widgets.indexOf(subscription.widgetWrapper),
                1,
                widgetWrapper,
            );
            Object.assign(subscription, updates);
            this._createWidget(widgetWrapper);
            requiresFullInitialUpdate.add(widgetWrapper);
            // UPDATE MARKS
            for (const styleDOMElement of Array.from(subscription.styles)) {
                const oldStyleSubscription =
                        this._styleSubscribers.get(styleDOMElement),
                    styleLinkPropertiesId = this._getStyleLinkPropertiesId(
                        subscription.typeSpecProperties,
                        oldStyleSubscription.mark.attrs["data-style-name"],
                    );
                requiresUpdate.set(styleDOMElement, [
                    subscription,
                    oldStyleSubscription,
                    styleLinkPropertiesId,
                ]);
            }
        }
        // look for required updates in the rest of the this._styleSubscribers
        for (const [styleDOMElement, styleSubscription] of this
            ._styleSubscribers) {
            if (requiresUpdate.has(styleDOMElement)) continue;
            const { parentSubscription, mark } = styleSubscription,
                styleLinkPropertiesId = this._getStyleLinkPropertiesId(
                    parentSubscription.typeSpecProperties,
                    mark.attrs["data-style-name"],
                );
            if (
                styleLinkPropertiesId ===
                styleSubscription.styleLinkPropertiesId
            )
                continue;
            requiresUpdate.set(styleDOMElement, [
                parentSubscription,
                styleSubscription,
                styleLinkPropertiesId,
            ]);
        }

        for (const [
            styleDOMElement,
            [parentSubscription, oldStyleSubscription, styleLinkPropertiesId],
        ] of requiresUpdate) {
            const styleSubscription = this._createStyleSubscription(
                    styleDOMElement,
                    parentSubscription,
                    oldStyleSubscription.mark,
                    styleLinkPropertiesId,
                ),
                { widgetWrapper } = styleSubscription;
            this._destroyWidget(oldStyleSubscription.widgetWrapper);
            this._widgets.splice(
                this._widgets.indexOf(oldStyleSubscription.widgetWrapper),
                1,
                widgetWrapper,
            );
            this._createWidget(widgetWrapper);
            requiresFullInitialUpdate.add(widgetWrapper);
            // unregister not required, as _registerStyleSubscription will reset all used fields
            // this._unregisterStyleSubscription(styleDOMElement, parentSubscription)
            //              this._styleSubscribers.set(domElement, styleSubscription);
            //              parentSubscription.styles.add(domElement);
            this._registerStyleSubscription(
                styleDOMElement,
                parentSubscription,
                styleSubscription,
            );
        }
        return requiresFullInitialUpdate;
    }

    /**
     * This method is called updateDOM, but it's mainly intended to be
     * called when the styles get updated due to changes in the TypeSpec.
     * It's a performance optimization, otherwise, ProseMirror would
     * re-initiate all NodeViews when we change the style attributes,
     * which is a lot of overhead and absolutely not needed. by stopping
     * the domObserver, prosemirror is not aware of these changes.
     */
    _viewDomObserver = null;
    _updateDOMContext = false;
    _updateDOM(fn) {
        if (this._viewDomObserver === null)
            this._viewDomObserver =
                this.widgetBus.getWidgetById("proseMirror").view.domObserver;
        if (this._viewDomObserverIsStoppped) return fn();
        this._viewDomObserver.stop();
        this._updateDOMContext = true;
        try {
            return fn();
        } finally {
            this._viewDomObserver.start();
            this._updateDOMContext = false;
        }
    }

    update(...args) {
        this._updateDOM(() => super.update(...args));
    }
}

function _addMark(map, mark) {
    if (!map.has(mark.type)) map.set(mark.type, new Set());
    if ("data-style-name" in mark.attrs)
        map.get(mark.type).add(mark.attrs["data-style-name"]);
}
function getActiveNodesAndMarks(editorState) {
    const { from, $from, to, empty } = editorState.selection,
        activeMarks = new Map(),
        activeNodes = new Set(),
        result = [activeNodes, activeMarks],
        addMark = (mark) => _addMark(activeMarks, mark);
    if (empty) {
        (editorState.storedMarks || $from.marks()).forEach(addMark);
        if ($from.parent)
            // Could also use `$to.parent` but it seems to be the same in this case.
            activeNodes.add($from.parent.type);
        return result;
    }
    if (to > from)
        editorState.doc.nodesBetween(from, to, (node) => {
            node.marks.forEach(addMark);
            activeNodes.add(node.type);
        });
    return result;
}

export class UIProseMirrorMenuBlocks extends _BaseComponent {
    constructor(widgetBus, label = null) {
        super(widgetBus);
        this._buttonToBlock = new Map();
        [this.element, this._blocksContainer] = this._initTemplate(label);
    }

    _getTemplate(h, label = null) {
        return (
            <div class="ui_prose_mirror_menu-container ui_prose_mirror_menu-container-blocks">
                {label !== null ? (
                    <span class="typeroof-ui-label">{label}</span>
                ) : (
                    ""
                )}
                <div class="ui_prose_mirror_menu-blocks"></div>
            </div>
        );
    }

    _initTemplate(label = null) {
        const container = this._getTemplate(this._domTool.h, label),
            blocksContainer = container.querySelector(
                ".ui_prose_mirror_menu-blocks",
            );
        this._insertElement(container);
        blocksContainer.addEventListener(
            "pointerdown",
            this._blocksClickHandler.bind(this),
        );
        // send a command
        // command = toggleMark(schema.marks.strong)
        // command(this._editorView.state, this._editorView.dispatch, this._editorView)
        return [container, blocksContainer];
    }

    _getTypeSpecLabel(typeSpec, blockName, typeSpecLink) {
        const linkParts = Path.fromString(typeSpecLink).parts,
            path =
                linkParts.length === 0 || linkParts[0] === "children"
                    ? Path.fromParts(...linkParts)
                    : Path.fromParts("children", ...linkParts);
        return getEntry(typeSpec, path).get("label").value;
    }

    _blocksClickHandler(event) {
        if (!this._buttonToBlock.has(event.target) || !this._editorView) return;
        event.preventDefault();
        this._editorView.focus(); // important to keep the selection alive
        if (event.target.disabled) return;
        const nodeTypeName = this._buttonToBlock.get(event.target),
            { dispatch, state } = this._editorView,
            nodeType = state.schema.nodes[nodeTypeName];
        setBlockType(nodeType /*, attrs*/)(state, dispatch);
    }

    updateView(view /*, prevState = null*/) {
        // NOTE: when "prevState !== null", I don't think the view changes,
        // however, the menu can check which commands should be active.
        this._editorView = view;
        const state = this._editorView.state;

        const [activeNodes] = getActiveNodesAndMarks(state);
        for (const [button, nodeTypeName] of this._buttonToBlock) {
            const nodeType = state.schema.nodes[nodeTypeName];
            button.classList[activeNodes.has(nodeType) ? "add" : "remove"](
                "active",
            );
        }
    }

    destroyView() {
        // I'm not sure if we need to do anyhing in here, maybe make all
        // all menu-items inactive.
        this._editorView = null;
    }
    update(changedMap) {
        // console.log(`>>>>>>>>>>>>>>>>>>>${this}.update:`, ...changedMap.keys());

        if (
            changedMap.has("nodeSpecToTypeSpec") ||
            changedMap.has("typeSpec")
        ) {
            const nodeSpecToTypeSpec = changedMap.has("nodeSpecToTypeSpec")
                    ? changedMap.get("nodeSpecToTypeSpec")
                    : this.getEntry("nodeSpecToTypeSpec"),
                typeSpec = changedMap.has("typeSpec")
                    ? changedMap.get("typeSpec")
                    : this.getEntry("typeSpec"),
                h = this._domTool.h,
                oldButtons = Array.from(this._buttonToBlock.keys());
            // console.log("nodeSpecToTypeSpec", ...nodeSpecToTypeSpec.keys());
            this._buttonToBlock.clear();
            for (const [blockName, typeSpecLink] of nodeSpecToTypeSpec) {
                // reusing stuff
                const button = oldButtons.length ? (
                    oldButtons.shift()
                ) : (
                    <button type="button">{"initial"}</button>
                );
                const label = this._getTypeSpecLabel(
                    typeSpec,
                    blockName,
                    typeSpecLink,
                );
                button.textContent =
                    label !== "" ? `${label} [${blockName}]` : `[${blockName}]`;
                // Would have to be decided in updateView
                // button.disabled = !commonSubSet.has(style);
                this._buttonToBlock.set(button, blockName);
            }
            this._blocksContainer.replaceChildren(
                ...this._buttonToBlock.keys(),
            );
            if (this._editorView)
                // mark butttons as active.
                this.updateView(this._editorView);
        }
    }
}
export class UIProseMirrorMenuStyles extends _BaseComponent {
    constructor(widgetBus, originTypeSpecPath, label = null) {
        super(widgetBus);
        this._originTypeSpecPath = originTypeSpecPath;
        this._buttonToStyle = new Map();
        [this.element, this._stylesContainer] = this._initTemplate(label);
    }

    _getTemplate(h, label = null) {
        return (
            <div class="ui_prose_mirror_menu-container ui_prose_mirror_menu-container-styles">
                {label !== null ? (
                    <span class="typeroof-ui-label">{label}</span>
                ) : (
                    ""
                )}
                <div class="ui_prose_mirror_menu-styles"></div>
            </div>
        );
    }

    _initTemplate(label = null) {
        const container = this._getTemplate(this._domTool.h, label),
            stylesContainer = container.querySelector(
                ".ui_prose_mirror_menu-styles",
            );
        this._insertElement(container);
        stylesContainer.addEventListener(
            "pointerdown",
            this._stylesClickHandler.bind(this),
        );
        // send a command
        // command = toggleMark(schema.marks.strong)
        // command(this._editorView.state, this._editorView.dispatch, this._editorView)
        return [container, stylesContainer];
    }

    _stylesClickHandler(event) {
        const targetButton = event.target.closest("button");
        // if(!targetButton) we did not actually click a button but mahybe stylesContainer directly
        if (
            !targetButton ||
            !this._buttonToStyle.has(targetButton) ||
            !this._editorView
        )
            return;

        event.preventDefault();
        this._editorView.focus(); // important to keep the selection alive
        if (targetButton.disabled) return;
        const styleName = this._buttonToStyle.get(targetButton),
            { dispatch, state } = this._editorView,
            markType = state.schema.marks["generic-style"];
        toggleMark(
            markType,
            { "data-style-name": styleName },
            {
                /// Controls whether, when part of the selected range has the mark
                /// already and part doesn't, the mark is removed (`true`, the
                /// default) or added (`false`).
                // removeWhenPresent?: boolean
                /// When set to false, this will prevent the command from acting on
                /// the content of inline nodes marked as
                /// [atoms](#model.NodeSpec.atom) that are completely covered by a
                /// selection range.
                // enterInlineAtoms?: boolean
                /// By default, this command doesn't apply to leading and trailing
                /// whitespace in the selection. Set this to `true` to change that.
                // includeWhitespace?: boolean
            },
        )(state, dispatch);
    }

    _getTypeSpecPropertiesId = getTypeSpecPropertiesIdMethod;
    _getTypeSpecs = getTypeSpecsMethod;

    // This is very specific, but it's easy to e.g. override in a subclass.
    _setButtonContent(button, styleName) {
        if (!this.__styleIconsMap) {
            // just a little local cache
            this.__styleIconsMap = new Map(
                ["bold", "italic", "bold italic"].map((style) => [
                    style,
                    style
                        .split(" ")
                        .map((name) => createIcon(`format_${name}`)),
                ]),
            );
        }
        if (this.__styleIconsMap.has(styleName)) {
            const contents = this.__styleIconsMap.get(styleName);
            this._domTool.clear(button);
            this._domTool.appendChildren(button, contents);
        } else button.textContent = styleName;
    }

    updateView(view /*, prevState = null*/) {
        // NOTE: when "prevState !== null", I don't think the view changes,
        // however, the menu can check which commands should be active.
        this._editorView = view;
        const state = this._editorView.state,
            // when prevState is null this call comes from the constructor
            // otherwise it comes from the update method.

            // => set { typeSpecs }
            typeSpecs = this._getTypeSpecs(state),
            setsOfStyles = new Map(),
            // display these
            allStylesSuperSet = new Set(),
            // allow these
            commonSubSet = new Set();

        for (const [typeSpec, path] of typeSpecs) {
            const stylePatches = typeSpec.get("stylePatches");
            // console.log(
            //   `${path} :: ${typeSpec.get("label").value} STYLES:`,
            //   ...stylePatches.keys(),
            // );
            // OK so these keys are the options that we are going to present

            setsOfStyles.set(typeSpec, new Set(stylePatches.keys()));
            for (const style of stylePatches.keys())
                allStylesSuperSet.add(style);
        }
        for (const style of allStylesSuperSet) {
            if (
                setsOfStyles.values().every((stylesSet) => stylesSet.has(style))
            )
                commonSubSet.add(style);
        }

        // Hmm, things a menu item to activate/deactivate a mark could
        // show:
        //      bold: the mark is active at the current position/selection
        //              -> click again should turn it off
        //
        //      active: can the mark be applied at the current position
        //              -> it's interesting we could either apply it only
        //                 where it is available OR everywhere and mark when a definition is missing
        //                 -> second could be a ctr+click
        //                 -> consequently ctrl would make those inactive marks active
        //                 -> bold marks would be always active, as turning the
        //                    mark off should be possible AND only happen where it
        //                    active. Then, maybe it would become not-bold and inactive
        //      visible: it seems like marks that are defined somewhere, but are not
        //               in the current context, should not be displayed at all

        // FIXME: we should define an order and keep it stable...
        // i.e. stylePatches has an inherent order but before, the typeSpecs
        // could have, i.e. in order of appearance, maybe depth-first, but
        // it's not readily accessible for us.

        const [, activeMarks] = getActiveNodesAndMarks(state),
            genericStyleMark = state.schema.marks["generic-style"],
            activeStyles = activeMarks.get(genericStyleMark) || new Set(),
            h = this._domTool.h,
            oldButtons = Array.from(this._buttonToStyle.keys());
        this._buttonToStyle.clear();
        for (const styleName of Array.from(allStylesSuperSet)) {
            // reusing stuff
            const button = oldButtons.length ? (
                oldButtons.pop()
            ) : (
                <button type="button">{"initial"}</button>
            );
            this._setButtonContent(button, styleName);
            button.disabled = !commonSubSet.has(styleName);
            button.classList[activeStyles.has(styleName) ? "add" : "remove"](
                "active",
            );
            this._buttonToStyle.set(button, styleName);
        }
        this._stylesContainer.replaceChildren(...this._buttonToStyle.keys());
    }

    destroyView() {
        // I'm not sure if we need to do anyhing in here, maybe make all
        // all menu-items inactive.
        this._editorView = null;
        // console.log(`${this}.destroyView view`);
    }

    update(changedMap) {
        if (changedMap.has("typeSpec") && this._editorView) {
            // Especially the order of styles could be different, this reorders:
            // it's however interesting, that the typeSpec are not read from
            // here, maybe we should use another update mechanism via
            // this._editorView.state!
            this.updateView(this._editorView);
        }
    }
}

/**
 * As we use IDs to identify "the menu" (ID_MAP.menu) and there can
 * be only a single widget per ID, this acts as a publisher to multiple
 * menu widgets. A pattern that may be worth to repeat.
 */
export function _IDPublisherMixin(Base) {
    return class extends Base {
        static ID_MAP = Object.freeze({});

        _forward(apiMethod, ...args) {
            if (this._cachedForwards !== null) {
                // This attempts to fix a life cycle issue, the initial call to updateView
                // is missed because we don't have created these widgets created yet!
                this._cachedForwards.push([apiMethod, ...args]);
                return;
            }
            for (const id of Object.values(this.constructor.ID_MAP)) {
                const widget = this.getWidgetById(id, null);
                if (widget !== null) widget[apiMethod](...args);
            }
        }

        _update(...args) {
            const result = super._update(...args);
            if (this._cachedForwards !== null) {
                const cachedForwards = this._cachedForwards;
                this._cachedForwards = null;
                for (const args of cachedForwards) this._forward(...args);
            }
            return result;
        }
    };
}

export class UIProseMirrorMenu extends _IDPublisherMixin(
    _BaseContainerComponent,
) {
    static ID_MAP = Object.freeze({
        menuStyles: "proseMirrorMenuStyles",
        menuBlocks: "proseMirrorMenuBlocks",
        menuOG: "proseMirrorMenuOG",
    });
    constructor(widgetBus, zones, originTypeSpecPath, menuSettings) {
        const widgets = [
            [
                { ...menuSettings, id: new.target.ID_MAP.menuStyles },
                ["typeSpec", "nodeSpecToTypeSpec"],
                UIProseMirrorMenuBlocks,
                "Nodes:",
            ],
            [
                { ...menuSettings, id: new.target.ID_MAP.menuBlocks },
                ["typeSpec", "nodeSpecToTypeSpec"],
                UIProseMirrorMenuStyles,
                originTypeSpecPath,
                "Styles:",
            ],
        ];
        super(widgetBus, zones, widgets);
        this._cachedForwards = [];
    }
    // The actually forwarded API calls
    updateView(...args) {
        this._forward("updateView", ...args);
    }
    destroyView(...args) {
        this._forward("destroyView", ...args);
    }
}

export class UIBoldItalicMenu extends _BaseComponent {
    constructor(widgetBus, originTypeSpecPath) {
        super(widgetBus);
        this._originTypeSpecPath = originTypeSpecPath;
        this._styleToButton = new Map();
        [this.element] = this._initTemplate();
    }

    _getTemplate(h) {
        return (
            <div class="ui_prose_mirror_menu-simple">
                <button type="button" data-style="bold">
                    <span class="material-symbols-outlined">format_bold</span>
                </button>
                <button type="button" data-style="italic">
                    <span class="material-symbols-outlined">format_italic</span>
                </button>
            </div>
        );
    }

    _initTemplate() {
        const container = this._getTemplate(this._domTool.h),
            boldButton = container.querySelector("[data-style=bold]"),
            italicButton = container.querySelector("[data-style=italic]");
        this._insertElement(container);
        this._styleToButton.set("bold", boldButton);
        this._styleToButton.set("italic", italicButton);
        container.addEventListener(
            "pointerdown",
            this._stylesClickHandler.bind(this),
        );
        return [container];
    }

    _stylesClickHandler(event) {
        event.preventDefault();
        const button = event.target.closest("button");
        if (!button) return;
        const styleName = button.getAttribute("data-style");
        if (!this._styleToButton.has(styleName) || !this._editorView) return;
        if (button.disabled) return;

        const { dispatch, state } = this._editorView,
            markType = state.schema.marks["generic-style"],
            [, activeMarks] = getActiveNodesAndMarks(state),
            genericStyleMark = state.schema.marks["generic-style"],
            activeStyles = activeMarks.get(genericStyleMark) || [],
            activeStylesSeparated = Array.from(activeStyles).flatMap((s) =>
                s.split(" "),
            );
        let newStyleName = activeStylesSeparated.includes(styleName)
            ? activeStylesSeparated.filter((s) => s !== styleName).join(" ")
            : activeStylesSeparated.concat(styleName).toSorted().join(" ");

        // newStyleName must not be "" (the empty string). The result of
        // no mark is achieved by removing the active mark, and that is the
        // job of `toggleMark`. In the case of an "" newStyleName should
        // just be styleName and toggleMark will remove it.
        if (newStyleName === "") newStyleName = styleName;

        toggleMark(
            markType,
            { "data-style-name": newStyleName },
            {},
        )(state, dispatch);
    }

    _getTypeSpecPropertiesId = getTypeSpecPropertiesIdMethod;
    _getTypeSpecs = getTypeSpecsMethod;

    updateView(view) {
        if (!view) return;

        this._editorView = view;
        const state = this._editorView.state,
            setsOfStyles = new Map(),
            allStylesSuperSet = new Set(["bold", "italic", "bold italic"]),
            commonSubSet = new Set();

        for (const style of allStylesSuperSet) {
            if (
                setsOfStyles.values().every((stylesSet) => stylesSet.has(style))
            ) {
                commonSubSet.add(style);
            }
        }

        const [, activeMarks] = getActiveNodesAndMarks(state),
            genericStyleMark = state.schema.marks["generic-style"],
            activeStyles = activeMarks.get(genericStyleMark) || [],
            activeStylesSeparated = new Set(
                Array.from(activeStyles).flatMap((s) => s.split(" ")),
            );
        for (const styleName of allStylesSuperSet) {
            const button = this._styleToButton.get(styleName);
            if (!button) continue;

            button.disabled = !commonSubSet.has(styleName);
            button.classList[
                activeStylesSeparated.has(styleName) ? "add" : "remove"
            ]("active");
        }
    }

    destroyView() {
        this._editorView = null;
    }

    update(changedMap) {
        if (changedMap.has("nodeSpecToTypeSpec")) {
            this.updateView(this._editorView);
        }
    }
}
