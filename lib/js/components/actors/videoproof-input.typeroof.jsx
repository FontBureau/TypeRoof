/**
 * Videoproof Input: the successor of the legacy "type-your-own" videoproof
 * layout (legacy/layouts/videoproof-type-your-own.mjs).
 *
 * A single line of user editable text, scaled to fit the available space.
 * The text is edited in place, directly on the stage, using a minimal
 * ProseMirror editor, there's no text input in the sidebar.
 *
 * The text is stored in `textRun` of the first keyMoment, the
 * property-setting keyMoment with the user settings in the videoproof
 * layout, the subsequent keyMoments are generated from axesMath.
 */
import {
    _AbstractStructModel,
    _AbstractEnumModel,
    CoherenceFunction,
} from "../../metamodel.mjs";

import {
    _BaseComponent,
    _BaseContainerComponent,
} from "../basics/component.mjs";

import { _BaseActorModel, genericActorMixin } from "./actors-base.mjs";

import {
    typographyKeyMomentModelMixin,
    typographyActorMixin,
} from "./models.mjs";

import { ColorModel } from "../color.mjs";

import { _createKeyMomentsListModel } from "./videoproof-array.mjs";

import {
    actorApplyCSSColors,
    actorApplyCssProperties,
    setTypographicPropertiesToSample,
    getVerboseFontVariationSettings,
} from "./properties-util.mjs";

import { setLanguageTagDirect } from "../language-tags.typeroof.jsx";

import { getRegisteredPropertySetup } from "../registered-properties.mjs";

import { CUSTOM_PRESET_KEY, applyPresets } from "../presets.mjs";

import { NodeModel } from "../prosemirror/models.typeroof.jsx";

import { ProseMirror } from "../prosemirror/integration.typeroof.jsx";

import { schemaSpec as proseMirrorDefaultSchema } from "../prosemirror/very-simple-schema";

export const DEFAULT_TEXT = "Type your own";

const VIDEOPROOF_INPUT_CONTENT_OPTIONS = new Map(
        [
            ["your own", "Type Your Own."],
            ["A-Z", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
            ["a-z", "abcdefghijklmnopqrstuvwxyz"],
            ["0-9", "0123456789"],
            [CUSTOM_PRESET_KEY, null],
            // I'd like to load a custom value for this from the registered-properties
            // type: 'custom' with a customText: 'H'
        ].map(([key, textContent]) => {
            const documentData = {
                typeKey: "doc",
                content: [
                    {
                        typeKey: "paragraph",
                        content: [
                            {
                                typeKey: "text",
                                text: textContent,
                            },
                        ],
                    },
                ],
            };
            return [key, { document: documentData }];
        }),
    ),
    _videoproof_input_content_options_keys = Array.from(
        VIDEOPROOF_INPUT_CONTENT_OPTIONS.keys(),
    ),
    VideoproofInputContentTypeModel = _AbstractEnumModel.createClass(
        "VideoproofInputContentTypeModel",
        _videoproof_input_content_options_keys,
        _videoproof_input_content_options_keys.at(0),
    );

export const VideoproofInputKeyMomentModel = _AbstractStructModel.createClass(
        "VideoproofInputKeyMomentModel",
        ...typographyKeyMomentModelMixin,
        ["stageBackgroundColor", ColorModel],
    ),
    VideoproofInputKeyMomentsModel = _createKeyMomentsListModel(
        "VideoproofInputKeyMomentsModel",
        VideoproofInputKeyMomentModel,
    ),
    VideoproofInputActorModel = _BaseActorModel.createClass(
        "VideoproofInputActorModel",
        ...genericActorMixin,
        ["keyMoments", VideoproofInputKeyMomentsModel],
        ...typographyActorMixin,
        ["presets", VideoproofInputContentTypeModel],
        ["document", NodeModel],
        CoherenceFunction.create(
            ["presets", "document"],
            applyPresets.bind(
                null,
                "presets",
                VIDEOPROOF_INPUT_CONTENT_OPTIONS,
                CUSTOM_PRESET_KEY,
            ),
        ),
    );

const LINE_HEIGHT_EM = 1.2;
// The fixed font-size at which the text width is measured.
const MEASURE_FONT_SIZE_PX = 16;

class VideoproofInputActorStyler extends _BaseComponent {
    constructor(widgetBus, elements) {
        super(widgetBus);
        this.element = elements.element;
        this._content = elements.content;
    }

    // The measurement comes from the 'environment@' protocol,see
    // VideoproofContextualActorRenderer._getAvailableDimensions.
    _getAvailableDimensions(changedMap) {
        const layoutBox = changedMap.has("environment@layout")
                ? changedMap.get("environment@layout")
                : this.getEntry("environment@layout"),
            // The em of this element, not of the fitted content.
            emPx = parseFloat(
                this.element.ownerDocument.defaultView.getComputedStyle(
                    this.element,
                ).fontSize,
            ),
            // Account for the paddings.
            // left has 2em, to nicely fit add 2 for the right
            // TODO: should not have to be hard coded.
            widthPx = Math.max(0, layoutBox.width) - 4 * emPx;
        return [widthPx, layoutBox.height];
    }

    _relayout(changedMap) {
        const [availableWidthPx, availableHeightPx] =
            this._getAvailableDimensions(changedMap);
        // As in the legacy fitToSpace, the text is measured in the DOM, at
        // a fixed font-size, with the current font-variation-settings and
        // font-feature-settings applied. A Range measures the extent of
        // the text itself, not of the (block) editor element.
        this._content.style.setProperty(
            "font-size",
            `${MEASURE_FONT_SIZE_PX}px`,
        );
        this._content.style.setProperty("line-height", `${LINE_HEIGHT_EM}`);
        this._content.style.setProperty("display", "inline-block");

        const range = this._content.ownerDocument.createRange();

        range.selectNodeContents(this._content);
        const { width, height } = range.getBoundingClientRect(),
            heightCorrected = height / LINE_HEIGHT_EM,
            ratioWidth = availableWidthPx / width,
            ratioHeight = availableHeightPx / height, //Corrected,
            fontSizePx =
                Math.min(ratioHeight, ratioWidth) * MEASURE_FONT_SIZE_PX;
        this._content.style.setProperty("font-size", `${fontSizePx}px`);
    }

    update(changedMap) {
        const propertiesData = [
            // [fullKey, cssProperty, unit, cleanFn]
            ["numericProperties/z-index", "z-index", "", Math.round],
        ];

        const font = (
            changedMap.has("font")
                ? changedMap.get("font")
                : this.getEntry("font")
        ).value;
        if (changedMap.has("font"))
            this._content.style.setProperty(
                "font-family",
                `"${font.fullName}"`,
            );

        if (
            changedMap.has("animationProperties@") ||
            changedMap.has("globalT") ||
            changedMap.has("verboseFontVariationSettings")
        ) {
            const animationProperties = changedMap.has("animationProperties@")
                    ? changedMap.get("animationProperties@")
                    : this.getEntry("animationProperties@"),
                globalT = (
                    changedMap.has("globalT")
                        ? changedMap.get("globalT")
                        : this.getEntry("globalT")
                ).value,
                propertyValuesMap =
                    animationProperties.animanion.getPropertiesFromGlobalT(
                        globalT,
                    ),
                getDefault = (property) => {
                    return [true, getRegisteredPropertySetup(property).default];
                },
                colorPropertiesMap = [
                    ["colors/stageBackgroundColor", "--background-color"],
                    ["colors/backgroundColor", "--cell-background-color"],
                    ["colors/textColor", "color"],
                ];
            actorApplyCSSColors(
                this.element,
                propertyValuesMap,
                getDefault,
                colorPropertiesMap,
            );
            actorApplyCssProperties(
                this.element,
                propertyValuesMap,
                getDefault,
                propertiesData,
            );
            // skipFontSize=true: the font-size is fitted to the space.
            setTypographicPropertiesToSample(
                this._content,
                propertyValuesMap,
                true,
                {
                    verboseFontVariationSettings:
                        getVerboseFontVariationSettings(this),
                    font,
                },
            );
            setLanguageTagDirect(this._content, propertyValuesMap);
            // After all properties that affect the text width are applied.
            this._relayout(changedMap);
        } else if (
            changedMap.has("environment@layout") ||
            changedMap.has("font")
        )
            this._relayout(changedMap);
    }
}

export class VideoproofInputActorRenderer extends _BaseContainerComponent {
    static getTemplate(h) {
        return (
            <div class="actor_renderer-videoproof_input">
                <div
                    class="actor_renderer-videoproof_input-content"
                    spellcheck="false"
                ></div>
            </div>
        );
    }

    constructor(widgetBus) {
        const zones = new Map();
        super(widgetBus, zones);
        [this.element, this._content] = this._initTemplate();
        zones.set("content", this._content);

        this._initWidgets([
            [
                { zone: "content" },
                ["document"],
                ProseMirror,
                proseMirrorDefaultSchema,
                {} /* idMap */,
                null /* originTypeSpecPath */,
                ["editor-simple"],
                this._content,
            ],
            [
                {},
                [
                    "font",
                    "animationProperties@",
                    [widgetBus.getExternalName("globalT"), "globalT"],
                    [
                        widgetBus.getExternalName(
                            "verboseFontVariationSettings",
                        ),
                        "verboseFontVariationSettings",
                    ],
                    "environment@layout",
                ],
                VideoproofInputActorStyler,
                { element: this.element, content: this._content },
            ],
        ]);
    }

    _initTemplate() {
        const element = this.constructor.getTemplate(this._domTool.h),
            content = element.querySelector(
                ".actor_renderer-videoproof_input-content",
            );
        this._insertElement(element);
        return [element, content];
    }
}
