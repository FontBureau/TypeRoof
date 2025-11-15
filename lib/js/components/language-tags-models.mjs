
import { deepFreeze } from '../util.mjs';
import {
        _AbstractStructModel
      , _AbstractEnumModel
      , _AbstractSimpleOrEmptyModel
      , FreezableMap
} from '../metamodel.mjs';

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
// All objects are frozen, as manipulating them would break expectations
// and e.g. throw off the UI.
function _inflate(rawData) {
    const result = new FreezableMap()
       , {keys:[/* first key us $key, the "tag" */, ...keys], data} = rawData
       ;
    for(const [tag, ...values] of data) {
        const block = {};
        for(const [index, key] of keys.entries()) {
            if(values[index] === undefined || values[index] === null)
                continue;
            block[key] = values[index];
        }
        deepFreeze(block);
        result.set(tag, block);
    }
    return Object.freeze(result);
}

export const language = _inflate(rawDataLanguage)
  , script = _inflate(rawDataScript)
  , region = _inflate(rawDataRegion)
  // , extlang = _inflate(rawDataExtlang)
  , LanguageSubtagModel = _AbstractEnumModel.createClass(
        'LanguageSubtagModel'
      , language.keys()
      , language.keys().next().value // first key
      , {fullData: {value: language, enumerable: true}} // attachStaticProperties
    )
  , LanguageSubtagOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(LanguageSubtagModel)
  , ScriptSubtagModel = _AbstractEnumModel.createClass(
        'ScriptSubtagModel'
      , script.keys()
      , script.keys().next().value // first key
      , {fullData: {value: script, enumerable: true}} // attachStaticProperties
    )
  , ScriptSubtagOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(ScriptSubtagModel)
  , RegionSubtagModel = _AbstractEnumModel.createClass(
        'RegionSubtagModel'
      , region.keys()
      , region.keys().next().value // first key
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
    constructor(widgetBus, zones) {
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


