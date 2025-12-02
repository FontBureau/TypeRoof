import {
    _AbstractStructModel,
    _AbstractEnumModel,
    _AbstractSimpleOrEmptyModel,
} from "../metamodel.ts";

import { LANGUAGE } from "./registered-properties-definitions.mjs";

import {
    _BaseContainerComponent,
    _BaseComponent,
    connectLabelWithInput,
} from "./basics.mjs";

import { StaticNode } from "./generic.mjs";

// SEE:
// https://www.w3.org/International/questions/qa-choosing-language-tags
// The data is based on:
// "https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry

// available:
// these match the "Type" entry in language-subtag-registry
// language-subtag-registry_grandfathered.json
// language-subtag-registry_region.json
// language-subtag-registry_language.json
// language-subtag-registry_script.json
// language-subtag-registry_extlang.json
// language-subtag-registry_redundant.json
// language-subtag-registry_variant.json

import rawDataLanguage from "../../assets/language-subtag-registry/language-subtag-registry_language.json" with { type: "json" };
import rawDataRegion from "../../assets/language-subtag-registry/language-subtag-registry_region.json" with { type: "json" };
import rawDataScript from "../../assets/language-subtag-registry/language-subtag-registry_script.json" with { type: "json" };

// import rawDataExtlang from '../../assets/language-subtag-registry/language-subtag-registry_extlang.json' with { type: 'json' }

// Generally the format is a map of Objects, the map keys are the
// "Subtag" or "Tag" of the respective data-blocks in language-subtag-registry
// depending on the Type.
// The Key/Value pairs in each entry object match the data in the registry,
// However, "Type" and "Tag" or respectively "Subtag" are coded via the
// file-name and map-key. All values are strings, except the values of
// the keys 'Description', 'Prefix', and 'Comments' whichh are arrays of
// strings.
// An Object containing the block data is created when calling the get method,
// that way, not all of the data has to be processed on load time.
class LanguageSubtagRegistryMap {
    static _incrementCharArray(chars) {
        // A=65 Z=90
        // a=97 z=122
        const overflowReset = {
            91: 65 /* upper overflow 91 === "[": reset 65 === "A"*/,
            123: 97 /* lower overflow 123 === "{": reset 97 === "a" */,
        };
        let overflows = true; // always increment the last register
        for (let i = chars.length - 1; i >= 0; i--) {
            if (!overflows) break;
            chars[i] += 1; // increment
            overflows = chars[i] in overflowReset;
            if (overflows)
                // reset
                chars[i] = overflowReset[chars[i]];
        }
    }

    static *_generateTags(startTag, endTag) {
        let currentChars = Array.from(startTag).map((str) => str.charCodeAt(0));
        while (true) {
            const current = String.fromCharCode(...currentChars);
            yield current;
            if (current === endTag) break;
            this._incrementCharArray(currentChars);
        }
    }

    constructor(rawData) {
        this._rawData = rawData;
        this._indexes = new Map();
        this.uiHints = { minlength: Infinity, maxlength: -Infinity };

        const _setTag = (tag, index) => {
            this._indexes.set(tag, index);
            if (this.uiHints.minlength > tag.length)
                this.uiHints.minlength = tag.length;
            if (this.uiHints.maxlength < tag.length)
                this.uiHints.maxlength = tag.length;
        };

        for (const [index, [tag]] of rawData.data.entries()) {
            if (tag.indexOf("..") !== -1) {
                // Make it possible to reach these subtags where
                // Description: Private use
                // Type: language Subtag: qaa..qtz
                // Type: script Subtag: Qaaa..Qabx
                // Type: region Subtag: QM..QZ
                // Type: region Subtag: XA..XZ
                const [startTag, endTag] = tag.split("..");
                // we can re-use the index
                for (const generatedTag of this.constructor._generateTags(
                    startTag,
                    endTag,
                ))
                    _setTag(generatedTag, index);
            } else _setTag(tag, index);
        }
        this._keys = null;
    }
    get size() {
        return this._indexes.size;
    }
    keys() {
        if (this._keys === null)
            this._keys = Object.freeze(Array.from(this._indexes.keys()));
        return this._keys;
    }
    has(tag) {
        return this._indexes.has(tag);
    }
    get(tag, ...requiredKeys) {
        const tagIndex = this._indexes.get(tag),
            [, /* $key, */ ...values] = this._rawData.data[tagIndex],
            [, /* first key is $key, the "tag" */ ...keys] = this._rawData.keys,
            block = {},
            keyEntries = requiredKeys.length
                ? requiredKeys
                      .map((k) => [keys.indexOf(k), k])
                      .filter(([i]) => i >= 0)
                : keys.entries();
        for (const [index, key] of keyEntries) {
            if (values[index] === undefined || values[index] === null) continue;
            block[key] = values[index];
        }
        return block;
    }
}

export const language = new LanguageSubtagRegistryMap(rawDataLanguage),
    script = new LanguageSubtagRegistryMap(rawDataScript),
    region = new LanguageSubtagRegistryMap(rawDataRegion),
    // , extlang = _inflate(rawDataExtlang)
    LanguageSubtagModel = _AbstractEnumModel.createClass(
        "LanguageSubtagModel",
        language.keys(),
        language.keys()[0], // first key
        { fullData: { value: language, enumerable: true } }, // attachStaticProperties
    ),
    LanguageSubtagOrEmptyModel =
        _AbstractSimpleOrEmptyModel.createClass(LanguageSubtagModel),
    ScriptSubtagModel = _AbstractEnumModel.createClass(
        "ScriptSubtagModel",
        script.keys(),
        script.keys()[0], // first key
        { fullData: { value: script, enumerable: true } }, // attachStaticProperties
    ),
    ScriptSubtagOrEmptyModel =
        _AbstractSimpleOrEmptyModel.createClass(ScriptSubtagModel),
    RegionSubtagModel = _AbstractEnumModel.createClass(
        "RegionSubtagModel",
        region.keys(),
        region.keys()[0], // first key
        { fullData: { value: region, enumerable: true } }, // attachStaticProperties
    ),
    RegionSubtagOrEmptyModel =
        _AbstractSimpleOrEmptyModel.createClass(RegionSubtagModel),
    LanguageTagModel = _AbstractStructModel.createClass(
        "LanguageTagModel",
        // If this is not set we will emit an empty language tag
        // that's so far the default i.e. setting no lang attribue at all.
        // but in general without this, there can be no valid language tag.
        // Empty is an important feature, this makes it possible to inherit
        // e.g. the language from a parent and set another subtag, like script
        // or region in the child.
        ["language", LanguageSubtagOrEmptyModel],
        // It looks like we can get away without extlang so far
        // https://www.w3.org/International/questions/qa-choosing-language-tags#extlangsubtag
        // , ['extlang', ExtlangSubtagModel]
        // When the actual tag-string is created and this is set,
        // we will consider the "Suppress-Script" entry of that language
        // tag and omit this if it matches.
        ["script", ScriptSubtagOrEmptyModel],
        ["region", RegionSubtagOrEmptyModel],
        // CAUTION when implementing variant, that must be modelled as
        // a list, as multiple variants are possible.
        // The qa-choosing-language-tags documents mentions "1994"
        // which requires a prefix of "sl-rozaj-biske" whereas both "rozaj"
        // and "biske" are themselvels "Type: variant".
        // , ['variant', VariantSubtagListModel]
    );

// <input
//  type="text"/
//  required <- maybe for language?
//  minlength="4" <- TODO
//  maxlength="8" <- TODO
//  size="10" <- TODO

function _createDataList({ h }, subtagRegistryMap) {
    const dataList = <datalist />;
    for (const tag of subtagRegistryMap.keys()) {
        const { Description = [] } = subtagRegistryMap.get(tag, "Description"),
            label = `${tag}: ${Description.join(" - ")}`,
            option = <option value={tag} label={label} />;
        dataList.append(option);
    }
    return dataList;
}

export class UILanguageInput extends _BaseComponent {
    constructor(
        widgetBus,
        data /* a language subtagRegistryMap*/,
        label,
        classes,
    ) {
        super(widgetBus);
        this._data = data;
        [this.element, this._input] = this._initTemplate(label, classes);
    }

    _getDataListId() {
        return this.widgetBus
            .getWidgetById("dom-global-id-registry")
            .getSharedID(this._data, () =>
                _createDataList(this._domTool, this._data),
            );
    }

    static getTemplate(h, labelText, classes = []) {
        return (
            <div class={"ui_language_subtag_input " + classes.join(" ")}>
                <label>
                    <span>{labelText}</span> <input type="text" />
                </label>
            </div>
        );
    }

    _initTemplate(label, classes = []) {
        const container = this.constructor.getTemplate(
                this._domTool.h,
                label,
                classes,
            ),
            input = container.querySelector("input");
        input.setAttribute("list", this._getDataListId());
        // don't use the maxlength/minlength attributes as they
        // limit how the datalist can be searched.
        // +2 for some wiggle room.
        input.setAttribute(
            "size",
            Math.max(
                this._data.uiHints.minlength,
                Math.min(10, this._data.uiHints.maxlength),
            ) + 2,
        );
        input.addEventListener("input", (/*event*/) => {
            if (!this._data.has(input.value) && input.value !== "") return;
            const newValue = input.value;
            this._changeState(() => {
                const entry = this.getEntry("value");
                if (newValue !== "") entry.set(newValue);
                else entry.clear();
            });
        });
        input.addEventListener("blur", () => {
            const value = this.getEntry("value");
            input.value = value.isEmpty ? "" : value.value;
        });
        connectLabelWithInput(
            this.widgetBus,
            container.querySelector("label"),
            input,
        );

        this._insertElement(container);
        return [container, input];
    }

    update(changedMap) {
        if (changedMap.has("value")) {
            const value = changedMap.get("value");
            if (this._domTool.document.activeElement !== this._input)
                // else: has focus i.e. we control the value
                this._input.value = value.isEmpty ? "" : value.value;
        }
    }
}

class UILanguageTagInfo extends _BaseComponent {
    constructor(
        widgetBus,
        data /* a language subtagRegistryMap*/,
        label,
        classes,
    ) {
        super(widgetBus);
        this._data = data;
        [this.element, this._info] = this._initTemplate(label, classes);
    }

    static getTemplate(h, labelText, classes = []) {
        return (
            <div class={"ui_language_subtag_info " + classes.join(" ")}>
                <strong>{labelText}:</strong>
                <dl class="ui_language_subtag_info-list"></dl>
            </div>
        );
    }
    _initTemplate(label, classes = []) {
        const container = this.constructor.getTemplate(
                this._domTool.h,
                label,
                classes,
            ),
            info = container.querySelector(".ui_language_subtag_info-list");
        this._insertElement(container);
        return [container, info];
    }

    _makeInfo(tag) {
        const elements = [],
            { h } = this._domTool;
        for (const [key, value] of [
            ["Tag", tag],
            ...Object.entries(this._data.get(tag)),
        ]) {
            elements.push(
                <dt>{key}</dt>,
                ...(Array.isArray(value) ? value : [value]).map((v) => (
                    <dd>{v}</dd>
                )),
            );
        }
        return elements;
    }
    update(changedMap) {
        if (changedMap.has("value")) {
            this._domTool.clear(this._info);
            const value = changedMap.get("value");
            if (!value.isEmpty)
                this._info.append(...this._makeInfo(value.value));
        }
    }
}

export class UILanguageTag extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        const { h } = widgetBus.domTool,
            infoTarget = <div></div>,
            info = (
                <div class="ui-language_tag-info">
                    <h4>Language Tag Info</h4>
                    {infoTarget}
                    <hr />• Help:{" "}
                    <a
                        class="external-link"
                        href="https://www.w3.org/International/questions/qa-choosing-language-tags"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Choosing a Language Tag
                    </a>
                    <br />• Data is based on the{" "}
                    <a
                        class="external-link"
                        href="https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry"
                        target="_blank"
                        rel="noreferrer"
                    >
                        IANA Language Subtag Registry
                    </a>
                    <br />
                </div>
            ),
            element = (
                <div class="ui-language_tag">
                    <h3 class="ui-language_tag-label">Language</h3>
                </div>
            ),
            zones = new Map([
                ..._zones,
                ["main", element],
                ["info", infoTarget],
            ]);
        widgetBus.insertElement(element);
        super(widgetBus, zones, [
            ...Array.from(LanguageTagModel.fields).map(
                ([subTag, { Model: SubTagModel }]) => {
                    return [
                        { zone: "main" },
                        [
                            [subTag, "value"], //  require('settings:internalPropertyName', 'value')
                        ],
                        UILanguageInput,
                        SubTagModel.fullData,
                        `${subTag[0].toUpperCase()}${subTag.slice(1)}:`, //  require('label')
                        [`UI_language_subtag_input-${subTag}`], // require('classes')
                    ];
                },
            ),
            [{ zone: "main" }, [], StaticNode, info],
            ...Array.from(LanguageTagModel.fields).map(
                ([subTag, { Model: SubTagModel }]) => {
                    return [
                        {
                            zone: "info",
                            activationTest: () =>
                                !widgetBus.getEntry(
                                    widgetBus.rootPath.append(subTag),
                                ).isEmpty,
                        },
                        [
                            [subTag, "value"], //  require('settings:internalPropertyName', 'value')
                        ],
                        UILanguageTagInfo,
                        SubTagModel.fullData,
                        `${subTag[0].toUpperCase()}${subTag.slice(1)}`, //  require('label')
                        [`UI_language_subtag_info-${subTag}`], // require('classes')
                    ];
                },
            ),
        ]);
    }
}

export function createLanguageTag(language, script, region) {
    const parts = [];
    if (!language) return null;
    parts.push(language);
    if (script) {
        const LanguageSubtagModel = LanguageTagModel.get("language").Model;
        const languageInfo = LanguageSubtagModel.fullData.get(language);
        if (
            !("Suppress-Script" in languageInfo) ||
            languageInfo["Suppress-Script"] !== script
        )
            parts.push(script);
    }
    if (region) parts.push(region);
    return parts.join("-");
}

export function setLanguageTagDirect(element, propertyValuesMap) {
    const args = [];
    for (const key of ["language", "script", "region"]) {
        const fullKey = `${LANGUAGE}${key}`;
        args.push(
            propertyValuesMap.has(fullKey)
                ? propertyValuesMap.get(fullKey)
                : null,
        );
    }
    const languageTag = createLanguageTag(...args);
    if (languageTag !== null) element.setAttribute("lang", languageTag);
    else element.removeAttribute("lang");
}

export function setLanguageTag(element, propertyValuesMap) {
    const fullKey = `${LANGUAGE}lang`;
    if (propertyValuesMap.has(fullKey))
        element.setAttribute("lang", propertyValuesMap.get(fullKey));
    else element.removeAttribute("lang");
}
