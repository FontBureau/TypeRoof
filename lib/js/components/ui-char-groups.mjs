/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    _AbstractSimpleOrEmptyModel
} from '../metamodel.mjs';

import {
    _UIAbstractPlainInputWrapper
  , _UIAbstractPlainOrEmptyInputWrapper
  , _BaseComponent
} from './basics.mjs';

import {
    _BaseTypeDrivenContainerComponent
  , require
} from './type-driven-ui-basics.mjs';

import {
    ProcessedPropertiesSystemMap
} from './registered-properties-definitions.mjs';

import {
    _AbstractOrEmptyPlainInputWrapper
  , collapsibleMixin
  , StaticTag
} from './generic.mjs';

import {
    CharGroupModel
} from './actors/videoproof-array.mjs';

export function getExtendedChars(charGroups, chars) {
    const extendedMap = new Map();
    for(const c of chars) {
        if(extendedMap.has(c)) continue;
        const extended = charGroups._extended[c];
        if(!extended || !extended.length) continue;
        // if charGroups._extended[c] is a string this will make it into
        // a list of unicode chars
        const exChars = [];
        for(const ec of extended)
            exChars.push(ec);
        extendedMap.set(c, exChars);
    }
    return extendedMap;
}

function getCharsFromCharGroups(charGroups, keyPath) {
    let target = keyPath.split('.')
                        .reduce((obj, key)=>obj[key], charGroups)
      , chars, extendedChars
      , getGlobalExtended = getExtendedChars.bind(null, charGroups)
      ;

    if(typeof target === 'object' && '_default' in target
                                  && '_extended' in target) {
        chars = [...target._default];
        extendedChars = new Map()
        if(target._extended)
            extendedChars.set(null, [...target._extended]);
        // The original implementation did this as well, despite
        // that there was no effect due to the provided data.
        // I have to assume that it was intentional, but it
        // doesn't feel like the correct thing to do.
        for(const [key, value] of getGlobalExtended(chars))
            extendedChars.set(key, value);
    }
    else if(typeof target === 'string') {
        chars = [...target];
        extendedChars = getGlobalExtended(target);
    }
    else
        throw new Error(`Don't know how to handle item at ${keyPath}: ${target}`);
    return [chars, extendedChars];
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
    for(const [k, extChars] of extendedMap)
        filteredExtMap.set(k, filterCmap(extChars));
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
                const fontsCharsData = fonts.map(font=>_getFontCharsFromCmap(_getCmapFromFont(font)))
                  , filterCmap = _getFilterFromChars(fontsCharsData.map(([fontChars])=>fontChars))
                  ;
                [chars, extendedChars] = _getCharsForKey(filterCmap, charGroups, key);
            }
            break;
    }
    return {chars, extendedChars, hasExtended: extendedChars.size > 0};
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
     //jshint ignore:start
    static TEMPLATE = `<label class="ui_select_char_groups"
    ><span class="ui_select_char_groups-label"><!-- insert: label --></span>
    <select class="ui_select_char_groups-select"></select>
</label>`;
    //jshint ignore:end
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
                const container = domTool.createElement('optgroup');
                container.label = groupKey;
                root.append(container);
                groups.set(groupKey, container);
            }
            const container = groups.get(groupKey)
              ,  option = domTool.createElement('option')
              ;
            option.textContent = label;
            option.value = key;
            container.append(option);
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
        // run super first, so we can use `this` in the widgets definition.
        const localZoneElement = widgetBus.domTool.createElement('fieldset', {'class': 'ui_char_group_container'})
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        super(widgetBus, zones);
        this._insertElement(localZoneElement);
        collapsibleMixin(localZoneElement, 'legend');
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
        const widgets = this._defineWidgets(TypeClass, localZoneElement
                                        , injectable, propertyRoot, label);
        this._initWidgets(widgets);
    }

    _getDefaults(modelFieldName, ...restArgs) {
        const ppsRecors = this._processedPropertiesSystemMap.get(modelFieldName)
        return this._injectable.getDefaults(ppsRecors, modelFieldName, ...restArgs);
    }

    _defineWidgets(TypeClass, localZoneElement
                                , injectable, propertyRoot, label) {
        // It's an orEmptyModel, otherwise there's no need to check for
        // the animationProperties status...
        // isOrEmpty = ModelType.prototype instanceof _AbstractSimpleOrEmptyModel
        const generalSettings = {zone: 'local'};
        return [
            [
                {zone: 'local'}
              , []
              , StaticTag
              , 'legend'
              , {}
              , [label]
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

    _update(compareResult, requiresFullInitialUpdateSet, isInitialUpdate) {
        try {
            return super._update(compareResult, requiresFullInitialUpdateSet, isInitialUpdate);
        }
        finally {
            this._activationTestCache = null;
        }
    }
}
