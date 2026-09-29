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
import { _AbstractStructModel } from "../../metamodel.mjs";

import { _BaseComponent } from "../basics/component.mjs";

import { _BaseActorModel, genericActorMixin } from "./actors-base.mjs";

import {
    typographyKeyMomentModelMixin,
    typographyActorMixin,
    StringOrEmptyModel,
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

import { Schema, Fragment } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { undo, redo, history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";
import "prosemirror-view/style/prosemirror.css";

export const DEFAULT_TEXT = "Type your own";

export const VideoproofInputKeyMomentModel = _AbstractStructModel.createClass(
        "VideoproofInputKeyMomentModel",
        ...typographyKeyMomentModelMixin,
        ["textRun", StringOrEmptyModel],
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
    );

// A single line of plain text: the doc itself is the textblock.
const schema = new Schema({
    nodes: {
        doc: { content: "text*" },
        text: {},
    },
    marks: {},
});

// Marks transactions that sync the editor to the model, these must not
// be written back into the model and not be undoable.
const FROM_MODEL = "videoproofInputFromModel";

const LINE_HEIGHT_EM = 1.2;
// The fixed font-size at which the text width is measured.
const MEASURE_FONT_SIZE_PX = 16;

// As in the legacy fitToSpace, the font-size is the largest where the
// line fits into the width and into the height of the available space.
// The width is measured at the current axes locations, hence, while
// animating, the font-size shrinks when the text gets wider and grows
// when it gets narrower.
function fitFontSizePt(
    widthEm,
    lineHeightEm,
    availableWidthPt,
    availableHeightPt,
) {
    const fontSizeHeightPt = availableHeightPt / lineHeightEm,
        fontSizeWidthPt =
            widthEm > 0 ? availableWidthPt / widthEm : fontSizeHeightPt;
    return Math.max(0, Math.min(fontSizeHeightPt, fontSizeWidthPt));
}

export class VideoproofInputActorRenderer extends _BaseComponent {
    static getTemplate(h) {
        return (
            <div class="actor_renderer-videoproof_input">
                <div class="actor_renderer-videoproof_input-content"></div>
            </div>
        );
    }

    constructor(widgetBus) {
        super(widgetBus);
        [this.element, this._content] = this._initTemplate();
        // The text is written into the first keyMoment, if there's none,
        // e.g. in a motion-stage without keyMoments, it can't be edited.
        this._editable = false;
        this._view = new EditorView(this._content, {
            state: this._createEditorState(""),
            dispatchTransaction: this._dispatchTransaction.bind(this),
            editable: () => this._editable,
            attributes: {
                class: "actor_renderer-videoproof_input-editor",
                spellcheck: "false",
            },
        });
    }

    _initTemplate() {
        const element = this.constructor.getTemplate(this._domTool.h),
            content = element.querySelector(
                ".actor_renderer-videoproof_input-content",
            );
        this._insertElement(element);
        return [element, content];
    }

    _createEditorState(text) {
        const preventDefault = () => true;
        return EditorState.create({
            doc: schema.node("doc", null, text ? schema.text(text) : null),
            plugins: [
                history(),
                keymap({
                    "Mod-z": undo,
                    "Shift-Mod-z": redo,
                    "Mod-y": redo,
                    // Single line of text.
                    Enter: preventDefault,
                    "Shift-Enter": preventDefault,
                    "Mod-Enter": preventDefault,
                }),
                keymap(baseKeymap),
            ],
        });
    }

    _dispatchTransaction(transaction) {
        const view = this._view;
        view.updateState(view.state.apply(transaction));
        if (!transaction.docChanged || transaction.getMeta(FROM_MODEL)) return;
        const text = view.state.doc.textContent;
        this._changeState(() => {
            const keyMoments = this.getEntry("keyMoments");
            if (keyMoments.size === 0) return;
            keyMoments.get(0).get("textRun").value = text;
        });
    }

    _setEditorText(text) {
        const { state } = this._view;
        // Don't interfere while the user is typing, e.g. with an IME.
        if (state.doc.textContent === text || this._view.composing) return;
        const tr = state.tr.replaceWith(
            0,
            state.doc.content.size,
            text ? schema.text(text) : Fragment.empty,
        );
        tr.setMeta(FROM_MODEL, true);
        tr.setMeta("addToHistory", false);
        this._view.dispatch(tr);
    }

    // The measurement comes from the 'environment@' protocol, see
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
            widthPx = Math.max(0, layoutBox.width - 4 * emPx);
        return {
            widthPt: widthPx * 0.75, // px to pt
            heightPt: layoutBox.height * 0.75, // px to pt
        };
    }

    _relayout(changedMap) {
        const { widthPt, heightPt } = this._getAvailableDimensions(changedMap),
            fontSizePx = MEASURE_FONT_SIZE_PX;
        // As in the legacy fitToSpace, the text is measured in the DOM, at
        // a fixed font-size, with the current font-variation-settings and
        // font-feature-settings applied. A Range measures the extent of
        // the text itself, not of the (block) editor element.
        this._content.style.setProperty("font-size", `${fontSizePx}px`);
        const range = this._content.ownerDocument.createRange();
        range.selectNodeContents(this._view.dom);
        const widthEm = range.getBoundingClientRect().width / fontSizePx,
            fontSizePt = fitFontSizePt(
                widthEm,
                LINE_HEIGHT_EM,
                widthPt,
                heightPt,
            );
        this._content.style.setProperty("font-size", `${fontSizePt}pt`);
        this._content.style.setProperty("line-height", `${LINE_HEIGHT_EM}`);
    }

    destroy() {
        this._view.destroy();
        super.destroy();
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

        if (changedMap.has("keyMoments")) {
            const editable = changedMap.get("keyMoments").size > 0;
            if (editable !== this._editable) {
                this._editable = editable;
                // Re-evaluates the editable prop.
                this._view.setProps({});
            }
        }

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
                ],
                text = propertyValuesMap.has("generic/textRun")
                    ? propertyValuesMap.get("generic/textRun")
                    : "";

            this._setEditorText(text);

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
