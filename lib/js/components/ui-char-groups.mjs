/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    _UIAbstractPlainInputWrapper
  , _UIAbstractPlainOrEmptyInputWrapper
} from './basics.mjs';

import {
    _AbstractOrEmptyPlainInputWrapper
} from './generic.mjs';


function getExendedChars(charGroups, chars) {
    return Array.from(new Set(chars))
                .reduce((col, c)=>[...col, ...(charGroups._extended[c] || [])], []);
}

function getCharsFromCharGroups(charGroups, keyPath) {
    let target = keyPath.split('.')
                        .reduce((obj, key)=>obj[key], charGroups)
      , chars, extendedChars
      , getGlobalExtended = chars=>getExendedChars(charGroups, chars)
      ;

    if(typeof target === 'object' && '_default' in target
                                  && '_extended' in target) {
        chars = [...target._default];
        extendedChars = [...target._extended,
                // The original implementation did this as well, despite
                // that there was no effect due to the provided data.
                // I have to assume that it was intentional, but it
                // doesn't feel like the correct thing to do.
                ...getGlobalExtended(chars)];
    }
    else if(typeof target === 'string') {
        chars = [...target];
        extendedChars = [...getGlobalExtended(target)];
    }
    else
        throw new Error(`Don't know how to handle item at ${keyPath}: ${target}`);
    return [chars, extendedChars];
}

function getKnownChars(charGroups) {
        // Removes duplicates, the original implementation did not do this,
        // but it makes sense, because the charGroups data is hand edited.
    let charsSet = new Set()
      , addChars = function(entry) {
            switch (typeof entry) {
                case "string":
                    for(let k of entry)
                        charsSet.add(k);
                    break;
                case "object":
                    for(let k in entry)
                        addChars(entry[k]);
                    break;
            }
        }
    ;
    addChars(charGroups);
    return charsSet;
}

// find characters in the font that aren't in any of the defined glyph groups
function getMiscChars(knownCharsSet, font) {
    var chars = new Set();

    for(let k of Object.keys(font.fontObject.tables.cmap.glyphIndexMap)) {
        let c = String.fromCodePoint(parseInt(k, 10));
        if(!knownCharsSet.has(c))
            chars.add(c);
    }
    return chars;
}

function _filterCmap (cmap, charsSet) {
    return new Set(Array.from(charsSet)
                        .filter(c=>c.codePointAt(0) in cmap));
}

function _getCmapAndFilterCmapFromFont(font) {
    let cmap = font.fontObject.tables.cmap.glyphIndexMap;
    return [
        cmap
      , /*filterCmap*/ charsSet=>_filterCmap(cmap, charsSet)
    ];
}

function _getCharsForKey(filterCmap, charGroups, key) {
    return getCharsFromCharGroups(charGroups, key)
                        .map(chars=>[...filterCmap(new Set(chars))]);
}

// used in videoproof-contextual layout
export function getCharsForKey(charGroups, font, key) {
    const [, filterCmap]  = _getCmapAndFilterCmapFromFont(font);
    return _getCharsForKey(filterCmap, charGroups, key);
}

export function getCharsForSelectUI(charGroups, font, value) {
    let knownCharsSet, chars
      , extendedChars = []
      , [cmap, filterCmap] = _getCmapAndFilterCmapFromFont(font)
      ;
    switch(value) {
        case 'all-gid':
            chars= Object.keys(cmap)
                        .sort((a, b)=>cmap[a] - cmap[b])
                        .map(u=>String.fromCodePoint(parseInt(u, 10)))
                        ;
            break;
        case 'all-groups':
            knownCharsSet = filterCmap(getKnownChars(charGroups));
            chars = [...knownCharsSet, ...getMiscChars(knownCharsSet, font)];
            break;
        case 'misc':
            knownCharsSet = getKnownChars(charGroups);
            chars = [...getMiscChars(knownCharsSet, font)];
            break;
        // currently unused
        case 'unicodes':
            chars = Object.keys(cmap)
                        .map(c=>parseInt(c, 10))
                        .sort((a, b)=>a-b)
                        .map(u=>String.fromCodePoint(parseInt(u, 10)))
                        ;
            break;
        default:
            [chars, extendedChars] = _getCharsForKey(filterCmap, charGroups, value);
            break;
    }
    return [chars, extendedChars];
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
}

// Used to create an Enum of all valid keys.
export function getCharGroupsKeys(charGroups) {
    const keys = [];
    for(const [/*groupKey*/, /*label*/, key] of _getCharGroupsStructure(charGroups))
        keys.push(key);
    return keys;
}


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
