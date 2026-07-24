import {
    _AbstractSimpleOrEmptyModel
} from '../metamodel.mjs';

import {
    _BaseComponent
} from './basics/component.mjs';

import {
    _UIAbstractPlainInputWrapper
  , _UIAbstractPlainOrEmptyInputWrapper
} from './basics/input-wrappers.mjs';

import {
    _BaseTypeDrivenContainerComponent
  , require
} from './type-driven-ui-basics.mjs';

import {
    ProcessedPropertiesSystemMap
} from './registered-properties-definitions.mjs';

import {
    _AbstractOrEmptyPlainInputWrapper
  , Collapsible
} from './generic.mjs';

import {
    CharGroupModel
} from './actors/videoproof-array.mjs';

// returns extendedMap a map of {keyChar=>[...exChars]}
// I wonder, why we don't do this once for all of the _extended
// chars in charGroups, or maybe caching results, it seems like we are
// doing the same work multiple times. so we have an all chars extended
// map, and we use this to filter.
// Also, this doesn't capture sub-groups niceley, e.g. the data is
// Monetary:
//        _default: $¢£¥
//      _extended: ₡₣₤₦₧₩₫€ƒ₭₱₲₵₹₺₼₽¤
// So, I'd argue any of _default should return all of _extended
// but that case is currently not considered at all. E.g. in the
// array when my custom content is: "$a" and I select show extended,
// I get "$aàáâãäåāăąǻȁȃạảấầẩẫậắằẳẵặæǽª". of course, the extended data of
// "a" => "àáâãäåāăąǻȁȃạảấầẩẫậắằẳẵặæǽª".
// It's important to notice that "custom" was not an option in the legacy
// videoproof, so this is also unprecedented behavior and I may make the
// wrong conclusions.
// NOTE: getCharsFromCharGroups calls this function and adds, under a null
// key the _extended chars...
const _extendedCharsCache = new WeakMap();
export function getExtendedChars(charGroups, chars) {
    if(!_extendedCharsCache.has(charGroups))
        _extendedCharsCache.set(charGroups, new Map());

    const fullExtendedMap = _extendedCharsCache.get(charGroups),
        // always return a new Map!
        extendedMap = new Map();

    for(const c of chars) {
        const chachedExChars = fullExtendedMap.get(c);
        if(Array.isArray(chachedExChars)) {
            extendedMap.set(c, chachedExChars);
            continue;
        }
        const extended = charGroups._extended[c];
        if(!extended || !extended.length) continue;
        // if charGroups._extended[c] is a string this will make it into
        // a list of unicode chars.
        const exChars = Array.from(extended);
        fullExtendedMap.set(c, exChars);
        extendedMap.set(c, exChars);
    }
    return extendedMap;
}

// This is an important method! it explains as well, how the
// `null` comes into the `extendedChars` as a key
// That's, however, not a very usable pattern, as it makes the function
// types hard to follow.
const _charsFromCharGroupsCache = new WeakMap();
export function getCharsFromCharGroups(charGroups, keyPath) {
    if(!_charsFromCharGroupsCache.has(charGroups))
        _charsFromCharGroupsCache.set(charGroups, new Map());
    const cachedPathsMap = _charsFromCharGroupsCache.get(charGroups);
    if(cachedPathsMap.has(keyPath))
        return cachedPathsMap.get(keyPath);

    let target = keyPath.split('.')
                        .reduce((obj, key)=>obj?.[key], charGroups)
      , chars, extendedChars
      ;

    if(typeof target === 'object' && '_default' in target
                                  && '_extended' in target) {
        chars = [...target._default];
        // The original implementation did this as well, despite
        // that there was no effect due to the provided data.
        // I have to assume that it was intentional, but it
        // doesn't feel like the correct thing to do.
        extendedChars = getExtendedChars(charGroups, chars);
        if(target._extended.length)
            // getExtendedChars returns a new Map, so that we can do this
            // however, I wonfer if we should cache this as well?
            extendedChars.set(null, [...target._extended]);
    }
    else if(typeof target === 'string') {
        chars = [...target];
        extendedChars = getExtendedChars(charGroups, chars);
    }
    else
        throw new Error(`Don't know how to handle item at ${keyPath}: ${target}`);
    const result = [chars, extendedChars];
    cachedPathsMap.set(keyPath, result);
    return result;
}

function getKnownChars(charGroups) {
        // Removes duplicates, the original implementation did not do this,
        // but it makes sense, because the charGroups data is hand edited.
    const seen = new Set()
      , chars = []
      , addChars = function(entry) {
            switch (typeof entry) {
                case "string":
                    for(const char of entry) {
                        if(seen.has(char)) continue;
                        seen.add(char);
                        chars.push(char);
                    }
                    break;
                case "object":
                    for(const k in entry)
                        addChars(entry[k]);
                    break;
            }
        }
    ;
    addChars(charGroups);
    return chars;
}

// find characters in the font that aren't in any of the defined glyph groups
function getUnknownChars(knownChars, fontChars) {
    var chars = []
      , seen = new Set(knownChars)
      ;
    for(const c of fontChars) {
        if(seen.has(c))
            continue;
        seen.add(c);
        chars.push(c);
    }
    return chars;
}

function _keepMembers(membersSet, data) {
    const result = [];
    for(const item of data)
        if(membersSet.has(item))
            result.push(item);
    return result;
}

function _getFilterFromChars(fontsChars/* [fontChars, fontChars, fontChars, ...]*/) {
    // A "chars" list is a list of strings. Each string represents one char
    // However, it could be a longer string as well. This is intended
    // as we may want to handle longer inputs as well at some point,
    // just like the "custom" type does. E.g. for complex scripts where
    // we must use open type shaping to create certain glyphs.
    const cset = new Set(fontsChars.flat());
    return _keepMembers.bind(null, cset);
}

function _getFontCharsFromCmap(cmap) {
    const codePointKeys = Object.keys(cmap)
      , fontChars = []
      , codePoints = []
      , gids = []
      ;
    for(const codePointKey of codePointKeys) {
        const codePoint = parseInt(codePointKey, 10)
          , char = String.fromCodePoint(codePoint)
          ;
        codePoints.push(codePoint);
        fontChars.push(char);
        gids.push(cmap[codePointKey]);
    }
    return [fontChars, codePoints, codePointKeys, gids];
}

function _getCmapFromFont(font) {
    return font.fontObject.tables.cmap.glyphIndexMap;
}

function _getCharsForKey(filterCmap, charGroups, key) {
    const [chars, extendedMap] = getCharsFromCharGroups(charGroups, key)
      , filteredExtMap = new Map()
      ;

    for(const [k, extChars] of extendedMap) {
        const filteredExtChars = filterCmap(extChars);
        if(!filteredExtChars.length) continue;
        filteredExtMap.set(k, filteredExtChars);
    }
    return [
        filterCmap(chars)
      , filteredExtMap
    ]
}

// used in videoproof-contextual layout
// note the returned extended chars is now new style/ a map.
export function getCharsForKey(charGroups, fonts, key) {
    const fontsCharsData = fonts.map(font=>_getFontCharsFromCmap(_getCmapFromFont(font)))
      , fontsChars = fontsCharsData.map(([fontChars])=>fontChars)
      , uniqueFontsChars = _mergeChars(fontsChars)
      , filterCmap = _getFilterFromChars(uniqueFontsChars)
      ;
    return _getCharsForKey(filterCmap, charGroups, key);
}

/**
 * all cmap sorted by gid
 * if gid is equal when using different fonts, the
 * second factor should be the order of the fonts
 * Then, the same gids even for different chars would be
 * consecutive. It's however probably not really meaningful.
 * There can also likely be collisions, where the gids map
 * to different charcodes.
 */
function _getAllCharsOrderedByGid(fonts) {
    const fontsCharsData = fonts.map(font=>_getFontCharsFromCmap(_getCmapFromFont(font)))
      , allGids = []
      , chars = []
      , seen = new Set()
      ;
    for(let fi=0;fi<fontsCharsData.length;fi++) {
        const gids = fontsCharsData[fi][3];
        for(const [i, gid] of gids.entries())
            allGids.push([fi, gid, i]);
    }
    allGids.sort(([aFi, aGid], [bFi, bGid])=>{
        if(aGid === bGid)
            return aFi - bFi;
        return aGid - bGid;
    });
    for(const [fi, /*, gid*/, i] of allGids) {
        const char = fontsCharsData[fi][0][i];
        if(seen.has(char))
            continue;
        seen.add(char);
        chars.push(char);
    }
    return chars;
}

function _getAllCharsOrderedByUnicodes(fonts) {
    const fontsCharsData = fonts.map(font=>_getFontCharsFromCmap(_getCmapFromFont(font)))
       , fontsCodePoints = fontsCharsData.map(([, codePoints])=>codePoints)
       , seen = new Set()
       , codePoints = []
       ;
    for(const cp of fontsCodePoints) {
        if(seen.has(cp)) continue;
        codePoints.push(cp);
    }
    return codePoints.sort((ua, ub)=>ua-ub).map(u=>String.fromCodePoint(u));
}

// Order is maintained
function _mergeChars(fontsChars/* [fontChars, fontChars, ...]*/) {
    const chars = []
      , seen = new Set()
      ;
    for(const fontChars of fontsChars) {
        for(const char of fontChars) {
            if(seen.has(char)) continue;
            seen.add(char);
            chars.push(char);
        }
    }
    return chars;
}

function _getAllCharsByGroups(charGroups, fonts) {
    const knownChars = getKnownChars(charGroups)
      , fontsCharsData = fonts.map(font=>_getFontCharsFromCmap(_getCmapFromFont(font)))
      , fontsChars = fontsCharsData.map(([fontChars])=>fontChars)
      , uniqueFontsChars = _mergeChars(fontsChars)
      , filterCmap = _getFilterFromChars(uniqueFontsChars)
      ;
    // It feels like this should not include "misc" chars
    // but in a way, the misc chars are only added as an
    // afterthought, and thus are treated like the "misc" group.
    return [...filterCmap(knownChars), ...getUnknownChars(knownChars, uniqueFontsChars)];
}

function _getUnknownChars(charGroups, fonts) {
    const knownChars = getKnownChars(charGroups)
      , fontsCharsData = fonts.map(font=>_getFontCharsFromCmap(_getCmapFromFont(font)))
      , fontsChars = fontsCharsData.map(([fontChars])=>fontChars)
      , uniqueFontsChars = _mergeChars(fontsChars)
      ;
    return getUnknownChars(knownChars, uniqueFontsChars);
}

/**
 * Simply check if the charGroups, key combination returns potentially
 * extended chars. This doesn't filter using the available chars of the
 * used fonts on purpose, for simplicity and consistency.
 */
export function hasExtendedChars(charGroups, key) {
    const keyParts = key.split('.');
    if(!(keyParts[0] in charGroups))
        // NOTE: 'all-gid', 'all-groups', 'misc', 'unicodes'
        // never return extended chars and are also not in charGroups.
        // if these start to reurn extended chars or if new options are
        // added that do, this function needs to be updated.
        return false;
    const [, extendedMap] = getCharsFromCharGroups(charGroups, key);
    return extendedMap.size > 0;
}

export function getCharsForSelectUI(charGroups, fonts, key) {
    let chars, extendedChars = [];
    switch(key) {
        case 'all-gid':
            chars = _getAllCharsOrderedByGid(fonts);
            break;
        case 'all-groups':
            chars =_getAllCharsByGroups(charGroups, fonts);
            break;
        case 'misc':
            chars =_getUnknownChars(charGroups, fonts);
            break;
        // currently unused
        case 'unicodes':
            chars = _getAllCharsOrderedByUnicodes(fonts);
            break;
        default:
            {
                [chars, extendedChars] = getCharsForKey(charGroups, fonts, key);
            }
            break;
    }
    return {chars, extendedChars, hasExtended: extendedChars.size > 0};
}

/**
 * Resolve chars from a charsData object, respecting the extended flag.
 *
 * Base chars are always included; if showExtended is true, extended chars
 * are interleaved after their base char. Extended chars keyed by null
 * (not associated with any base char) are appended at the end.
 *
 * @param {{ chars: Array<string>, extendedChars: Map, hasExtended: boolean }} charsData
 *     — as returned by getCharsForSelectUI or getCharsForKey
 * @param {boolean} showExtended
 * @returns {Array<string>}
 */
export function getSelectedChars(charsData, showExtended) {
    if(showExtended && charsData.hasExtended) {
        const selectedChars = []
          , extendedSeen = new Set()
          ;
        for(const c of charsData.chars) {
            selectedChars.push(c);
            if(!extendedSeen.has(c) && charsData.extendedChars.has(c)) {
                for(const ec of charsData.extendedChars.get(c))
                    selectedChars.push(ec);
            }
            extendedSeen.add(c);
        }
        // Extended chars not associated with any base char
        if(charsData.extendedChars.has(null)) {
            for(const ec of charsData.extendedChars.get(null))
                selectedChars.push(ec);
        }
        return selectedChars;
    }
    return Array.from(charsData.chars);
}

/**
 * Resolve chars from charGroupsData + fonts for a given charGroup config.
 *
 * @param {Object} charGroupsData
 * @param {Array} fonts
 * @param {string} charGroupOption — e.g. 'Latin.Lowercase', 'custom', 'all-gid', etc.
 * @param {boolean} showExtended
 * @param {string} [customText='']
 * @param {string} [customSeparator='']
 * @returns {Array<string>}
 */
// TODO: should be used in videoproof-array as well, as it has originated there
export function resolveChars(charGroupsData, fonts, charGroupOption, showExtended
                            , customText='', customSeparator='') {
    let charsData;
    if(charGroupOption === 'custom') {
        const chars = customSeparator !== ''
                    ? customText.split(customSeparator)
                    : [...customText]
          , extendedChars = getExtendedChars(charGroupsData, chars)
          ;
        charsData = { chars, extendedChars, hasExtended: extendedChars.size > 0 };
    }
    else {
        charsData = getCharsForSelectUI(charGroupsData, fonts, charGroupOption);
    }
    return getSelectedChars(charsData, showExtended);
}

/**
 * yield [groupKey, label, key];
 * Where if groupKey is null it's a top level options
 * optionGroups go only one level deep.
 *
 * TODO: It would be very nice to be able to separate the ui labels and
 * the keys, but the data is defined like this so far.
 */
function* _getCharGroupsStructure(charGroups) {
    const rootGroup = null
      , allOptgroup =  'All'
      ;
    function* makeOptionsFromCharGroups (currentPath, groupKey, data) {
        if (currentPath.at(-1)[0] === '_')
            // ignore top-level "_extended" item
            return;
        if(data === null || typeof data !== 'object'
                // Special kind of option, that can bring its own _extended chars.
                || '_default' in data ) {
            // this is an option
            const label = currentPath.at(-1)
              , key = currentPath.join('.')
              ;
            yield [groupKey, label, key];
            return;
        }

        // Go deeper.
        const subGroupKey = currentPath.join(' ');
        for(const [name, dataItem] of Object.entries(data)) {
            const subPath = [...currentPath, name];
            yield* makeOptionsFromCharGroups(subPath, subGroupKey, dataItem);
        }
    }
    yield [allOptgroup, 'All by GlyphID', 'all-gid'];
    // FIXME: maybe also return 'all-gid' as selected key ???
    // allOptgroup.firstChild.selected = true;
    yield [allOptgroup, 'All by group', 'all-groups'];

    for(let [name, data] of Object.entries(charGroups)) {
        const currentPath = [name];
        yield* makeOptionsFromCharGroups(currentPath, rootGroup, data);
    }
    yield [rootGroup, 'None of the above', 'misc'];
    yield [rootGroup, 'Use custom content', 'custom'];
}

// Used to create an Enum of all valid keys.
export function getCharGroupsKeys(charGroups) {
    const keys = [];
    for(const [/*groupKey*/, /*label*/, key] of _getCharGroupsStructure(charGroups))
        keys.push(key);
    return keys;
}

/**
 * TODO: this is basically a PlainSelect with support for <optgroup>
 * It could either get merged into PlainSelect or be it's own generic thing.
 */
export class PlainSelectCharGroupInput {
    static TEMPLATE = `<label class="ui_select_char_groups"
    ><span class="ui_select_char_groups-label"><!-- insert: label --></span>
    <select class="ui_select_char_groups-select"></select>
</label>`;
    constructor (domTool, changeHandler
              , charGroups
            // label is not "Chars" for historic reasons and because
            // users may feel more familiar with the original "Glyphs"
            , label='Char-Group') {
        this._domTool = domTool;
        this._passive = false;
        // this._charGroups = charGroups;
        [this.element, this._input] = this._initTemplate(charGroups, label);

        this._changeHandler = null;
        if(changeHandler) {
            this._changeHandler = (event)=>{
                event.preventDefault();
                changeHandler(this._input.value);
            };
            this._input.addEventListener('change', this._changeHandler);
        }
    }

    _initTemplate(charGroups, label, defaultVal) {
        const container = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , select = container.querySelector('.ui_select_char_groups-select')
          ;
        select.append(this._uiBuildGlyphsSelectOptions(this._domTool, charGroups, defaultVal));
        this._domTool.insertAtMarkerComment(container, 'insert: label', label);
        return [container, select];
    }

    _uiBuildGlyphsSelectOptions(domTool, charGroups) {
        const root = domTool.createFragment()
          , groups = new Map([[null, root]])
          ;
        for(const [groupKey, label, key] of _getCharGroupsStructure(charGroups)) {
            if(!groups.has(groupKey)) {
                const optgroup = domTool.createElement('optgroup');
                optgroup.label = groupKey;
                const legend = domTool.createElement('legend');
                legend.textContent = groupKey;
                optgroup.append(legend);
                root.append(optgroup);
                groups.set(groupKey, optgroup);
            }
            const optgroup = groups.get(groupKey)
              ,  option = domTool.createElement('option')
              ;
            option.textContent = label;
            option.value = key;
            optgroup.append(option);
        }
        return root;
    }

    update(value) {
        this._input.value = value;
    }

    set passive(val) {
        this._passive = !!val;
        this._input.disabled = this._passive;
    }

    get passive() {
        return this._passive;
    }

    setDisplay(show) {
        if(show)
            this.element.style.removeProperty('display');
        else
            this.element.style.display = 'none';
    }
}

export const
    UISelectCharGroupInput = _UIAbstractPlainInputWrapper.createClass(
        'UISelectCharGroupInput'
      , PlainSelectCharGroupInput
    )
  , PlainSelectCharGroupOrEmptyInput = _AbstractOrEmptyPlainInputWrapper.createClass(
        'PlainSelectCharGroupOrEmptyInput'
      , PlainSelectCharGroupInput
    )
  , UISelectCharGroupOrEmptyInput = _UIAbstractPlainOrEmptyInputWrapper.createClass(
        'UISelectCharGroupOrEmptyInput'
      , PlainSelectCharGroupOrEmptyInput
    )
  ;

function _truncateSummaryText(value, maxLength = 24) {
    const text = `${value ?? ''}`;
    if(text.length <= maxLength)
        return text;
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function _getCharGroupSummary(option, showExtended=false, customText='', customSeparator='') {
    const summary = option === 'custom'
        ? (`custom: "${_truncateSummaryText(customText, 24)}"${customSeparator ? ` sep="${customSeparator}"` : ''}`)
        : option
        ;
    return `${summary}${showExtended ? ' +ext' : ''}`;
}

// NOTE: in an environment where inheritance applies, this method may
// not be usebale, as `isEmpty` woudld be a free slot for inheritance.
// However, when looking atomically at an immutable instance of a
// charGroupModel, the returned summary is more useful.
export function getCharGroupSummaryFromModel(charGroupModel) {
    const optionsModel = charGroupModel.get('options')
      , options = optionsModel.isEmpty ? '(empty)' : optionsModel.value
      , extendedModel = charGroupModel.get('extended')
      , showExtended = !extendedModel.isEmpty && !!extendedModel.value
      , customTextModel = charGroupModel.get('customText')
      , customSeparatorModel = charGroupModel.get('customSeparator')
      , customText = customTextModel.isEmpty ? '' : customTextModel.value
      , customSeparator = customSeparatorModel.isEmpty ? '' : customSeparatorModel.value
      ;
    return _getCharGroupSummary(options, showExtended, customText, customSeparator);
}

/* A helper element without DOM presence. */
export class UIUpdateListener extends _BaseComponent {
    constructor(widgetBus, onUpdate) {
        super(widgetBus);
        this._onUpdate = onUpdate;
    }
    update(changedMap) {
        this._onUpdate(changedMap);
    }
}

export class UICharGroupContainer extends _BaseTypeDrivenContainerComponent {
    constructor(widgetBus, _zones, injectable, propertyRoot, label) {
        const localZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_char_group_container'})
          , contentsZoneElement = widgetBus.domTool.createElement('div')
          , zones = new Map([..._zones, ['local', localZoneElement], ['contents', contentsZoneElement]])
          ;
        super(widgetBus, zones);
        this._insertElement(localZoneElement);
        const TypeClass = this.widgetBus.getEntry(this.widgetBus.rootPath).constructor;
        this._propertyRoot = propertyRoot; // temporary???
        this._processedPropertiesSystemMap = ProcessedPropertiesSystemMap.fromPrefix(propertyRoot, TypeClass.fields.keys())
        {
            const CharGroupOptionsModel = TypeClass.fields.get('options').Model;
            this._CharGroupOptionsBaseModel =
                CharGroupOptionsModel.prototype instanceof _AbstractSimpleOrEmptyModel
                    ?  CharGroupOptionsModel.Model
                    : CharGroupOptionsModel
                    ;

        }

        this._injectable = injectable;
        const widgets = this._defineWidgets(TypeClass, contentsZoneElement
                                        , injectable, propertyRoot, label);
        this._initWidgets(widgets);
    }

    _getDefaults(modelFieldName, ...restArgs) {
        const ppsRecords = this._processedPropertiesSystemMap.get(modelFieldName);
        return this._injectable.getDefaults(ppsRecords, modelFieldName, ...restArgs);
    }

    _defineWidgets(TypeClass, contentsZoneElement
                                , injectable, propertyRoot, label) {
        // It's an orEmptyModel, otherwise there's no need to check for
        // the animationProperties status...
        // isOrEmpty = ModelType.prototype instanceof _AbstractSimpleOrEmptyModel
        const generalSettings = {zone: 'contents'};
        return [
            [
                {zone: 'local'}
              , []
              , Collapsible
              , label
              , contentsZoneElement
            ]
          , this._getWidgetConfig(injectable, generalSettings
                // 'generic/', 'irrelevant',
                // FIXME: this looks completely useless!
              , ProcessedPropertiesSystemMap.createSimpleRecord(this._propertyRoot, 'irrelevant'), 'irrelevant'
              , [ UIUpdateListener
                , CharGroupModel// OptionsModelType
                , [ // update when any of the actor settings change
                    // don't use require('requireUpdateDefaults')
                    // as the change we are looking for is not occuring
                    // when t changes, as in an animation
                    require('settings:dependencyMapping', ['../../..', 'value'])
                  , this._onChange.bind(this)
                  ]
                ]
            )
            // label
          , ...this._defineGenericWidgets(
                    TypeClass
                  , fieldName=>TypeClass.fields.has(fieldName) // basically all allowed
                  , generalSettings
                  , this._processedPropertiesSystemMap
                  , injectable
            )
        ];
    }
    _defineGenericWidget(injectable, generalSettings, propertyRoot, fieldName, FieldType) {
        super._defineGenericWidget(injectable, generalSettings, propertyRoot, fieldName, FieldType);
        const elementTypeConfig = injectable.genericTypeToUIElement(FieldType);
        if(fieldName === 'extended') {
            const [,,parameters] = elementTypeConfig;
            parameters.push(require('settings:id'));
        }
        if(fieldName === 'customText'||  fieldName === 'customSeparator') {
            generalSettings = {...generalSettings, activationTest: this._activateCustom.bind(this)};
        }
        return this._getWidgetConfig(injectable, generalSettings, propertyRoot, fieldName, elementTypeConfig);
    }
    _activateCustom() {
        // customText and customSeparator are only visible if the options
        // value is "custom".
        return this._getDefaults('options', null) === 'custom';
    }
    _onChange() {
        // Figure out whether the extendedChars are available.
        const {defaultValue, charGroupsData} = this._CharGroupOptionsBaseModel
          , charGroup = this._getDefaults('options', defaultValue)
          ;
        let hasExtended = false;
        if(charGroup === 'custom') {
            const customText = this._getDefaults('customText', '')
              , customSeparator = this._getDefaults('customSeparator', '')
              , chars = customText.split(customSeparator)
              , extendedChars = getExtendedChars(charGroupsData, chars)
            ;
            hasExtended = extendedChars.size;
        }
        else {
            hasExtended = hasExtendedChars(charGroupsData, charGroup);
        }
        const extendedWidget = this.getWidgetById('extended');
        extendedWidget._ui.element.classList[(hasExtended ? 'remove' : 'add')]('not-available');
    }
}
