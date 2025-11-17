import {
    _AbstractStructModel
  , _AbstractEnumModel
  , _AbstractSimpleOrEmptyModel
} from '../metamodel.mjs';

import {
    LANGUAGE
} from './registered-properties-definitions.mjs';

import {
    _BaseContainerComponent
} from "./basics.mjs";

import {
    UISelectOrEmptyInput
} from "./generic.mjs";

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

import rawDataLanguage from '../../assets/language-subtag-registry/language-subtag-registry_language.json' with { type: 'json' }
import rawDataRegion from '../../assets/language-subtag-registry/language-subtag-registry_region.json' with { type: 'json' }
import rawDataScript from '../../assets/language-subtag-registry/language-subtag-registry_script.json' with { type: 'json' }

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
    constructor(rawData) {
        this._rawData = rawData;
        this._indexes = new Map();
        for(const [index, [tag]] of rawData.data.entries()) {
            this._indexes.set(tag, index);
        }
        this._keys = null
    }
    get size() {
        return this._indexes.size;
    }
    keys() {
        if(this._keys === null)
            this._keys = Object.freeze(Array.from(this._indexes.keys()));
        return this._keys;
    }
    has(tag) {
        return this._indexes.has(tag);
    }
    get(tag) {
        const tagIndex = this._indexes.get(tag)
          , [/* $key, */,...values] = this._rawData.data[tagIndex]
          , [/* first key is $key, the "tag" */, ...keys]= this._rawData.keys
          , block = {}
          ;
        for(const [index, key] of keys.entries()) {
            if(values[index] === undefined || values[index] === null)
                continue;
            block[key] = values[index];
        }
        return block;
    }
}

export const
    language = new LanguageSubtagRegistryMap(rawDataLanguage)
  , script = new LanguageSubtagRegistryMap(rawDataScript)
  , region = new LanguageSubtagRegistryMap(rawDataRegion)
  // , extlang = _inflate(rawDataExtlang)
  , LanguageSubtagModel = _AbstractEnumModel.createClass(
        'LanguageSubtagModel'
      , language.keys()
      , language.keys()[0] // first key
      , {fullData: {value: language, enumerable: true}} // attachStaticProperties
    )
  , LanguageSubtagOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(LanguageSubtagModel)
  , ScriptSubtagModel = _AbstractEnumModel.createClass(
        'ScriptSubtagModel'
      , script.keys()
      , script.keys()[0] // first key
      , {fullData: {value: script, enumerable: true}} // attachStaticProperties
    )
  , ScriptSubtagOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(ScriptSubtagModel)
  , RegionSubtagModel = _AbstractEnumModel.createClass(
        'RegionSubtagModel'
      , region.keys()
      , region.keys()[0] // first key
      , {fullData: {value: region, enumerable: true}} // attachStaticProperties
    )
  , RegionSubtagOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(RegionSubtagModel)
  , LanguageTagModel = _AbstractStructModel.createClass(
      'LanguageTagModel'
        // If this is not set we will emit an empty language tag
        // that's so far the default i.e. setting no lang attribue at all.
        // but in general without this, there can be no valid language tag.
        // Empty is an important feature, this makes it possible to inherit
        // e.g. the language from a parent and set another subtag, like script
        // or region in the child.
      , ['language', LanguageSubtagOrEmptyModel]
        // It looks like we can get away without extlang so far
        // https://www.w3.org/International/questions/qa-choosing-language-tags#extlangsubtag
        // , ['extlang', ExtlangSubtagModel]
        // When the actual tag-string is created and this is set,
        // we will consider the "Suppress-Script" entry of that language
        // tag and omit this if it matches.
      , ['script', ScriptSubtagOrEmptyModel]
      , ['region', RegionSubtagOrEmptyModel]
        // CAUTION when implementing variant, that must be modelled as
        // a list, as multiple variants are possible.
        // The qa-choosing-language-tags documents mentions "1994"
        // which requires a prefix of "sl-rozaj-biske" whereas both "rozaj"
        // and "biske" are themselvels "Type: variant".
        // , ['variant', VariantSubtagListModel]
  )
  ;

export class UILanguageTag extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        const element = widgetBus.domTool.createElement('div', {class:'ui-language_tag'},
                widgetBus.domTool.createElement('h3', {class:'ui-language_tag-label'}, 'Language')
            )
          , zones = new Map([..._zones, ['main', element]])
          ;
        widgetBus.insertElement(element);
        super(widgetBus, zones,
            [...Array.from(LanguageTagModel.fields).map(([subTag, {Model: SubTagModel}])=>{
                return [
                    {zone: 'main'}
                  , [
                        [subTag, 'value'] //  require('settings:internalPropertyName', 'value')
                    ]
                  , UISelectOrEmptyInput
                  , ()=>LanguageTagModel.get(subTag).Model.defaultValue//require('getDefault')
                  , ()=>false//require('requireUpdateDefaults')
                  , subTag //  require('label')
                  , SubTagModel.enumItems// require('items')
                ]
            })]
        );
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
    for(const key of ['language', 'script', 'region']) {
        const fullKey = `${LANGUAGE}${key}`;
        args.push(propertyValuesMap.has(fullKey)
            ? propertyValuesMap.get(fullKey)
            : null
        );
    }
    const languageTag = createLanguageTag(...args);
    if(languageTag !== null)
        element.setAttribute('lang', languageTag);
    else
        element.removeAttribute('lang');
}

export function setLanguageTag(element, propertyValuesMap) {
    const fullKey = `${LANGUAGE}lang`;
    if(propertyValuesMap.has(fullKey))
        element.setAttribute('lang', propertyValuesMap.get(fullKey));
    else
        element.removeAttribute('lang');
}


