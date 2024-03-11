/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    zip
} from '../../util.mjs';

import {
    _AbstractStructModel
  , _AbstractListModel
  , _AbstractEnumModel
  , _AbstractSimpleOrEmptyModel
  , StaticDependency
  // , CoherenceFunction
  , StateComparison
  , Path
} from '../../metamodel.mjs';

import {
    _BaseActorModel
  , genericActorMixin
  , initAvailableActorTypes
  , AvailableActorTypesModel
  , ActorsModel
  // , createActor
} from './actors-base.mjs';

import {
    typographyKeyMomentModelMixin
  , typographyActorMixin
  , StringOrEmptyModel
  , BooleanOrEmptyModel
} from './models.mjs';

import {
    _BaseComponent
  , _BaseContainerComponent
  , SimpleProtocolHandler
} from '../basics.mjs';

import {
    fixGridLineBreaks
} from '../../affixed-line-breaks.mjs';

import {
//    getPropertyValue
    actorApplyCSSColors
  , actorApplyCssProperties
//  , DYNAMIC_MARKER
//  , cssPositioningHorizontalPropertyExpander
  , setTypographicPropertiesToSample
} from './properties-util.mjs';

import {
    getRegisteredPropertySetup
} from './stage-registered-properties.mjs';


import charGroupsData from '../../char-groups-data.mjs';

import {
    getCharGroupsKeys
  , getCharsForSelectUI
  , getExendedChars
} from '../ui-char-groups.mjs';

export { charGroupsData };

const _charGroupsKeys = getCharGroupsKeys(charGroupsData);
export const CharGroupOptionsModel = _AbstractEnumModel.createClass(
        'CharGroupOptionsModel'
      , _charGroupsKeys
      , _charGroupsKeys[0]
        // Fix this as static to the model, so we have no confusion about
        // which charGroupsData is expected.
        // CharGroupModel.charGroupsData === charGroupsData
      , {charGroupsData: {value: charGroupsData, enumerable: true}}
    )
    , CharGroupOptionsOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(CharGroupOptionsModel)
    , CharGroupModel = _AbstractStructModel.createClass(
        'CharGroupModel'
      , ['options', CharGroupOptionsOrEmptyModel]
      , ['extended', BooleanOrEmptyModel] // could be BooleanDefaultTrueOrEmptyModel
      , ['customText', StringOrEmptyModel]//StringOrEmptyModel]
      , ['customSeparator', StringOrEmptyModel]//StringOrEmptyModel]
    )
    , VideoproofArrayKeyMomentModel = _AbstractStructModel.createClass(
        'VideoproofArrayKeyMomentModel'
      , ...typographyKeyMomentModelMixin
      , ['charGroup', CharGroupModel]
    )
  , VideoproofArrayKeyMomentsModel = _AbstractListModel.createClass('VideoproofArrayKeyMomentModel', VideoproofArrayKeyMomentModel)
  , VideoproofArrayActorModel = _BaseActorModel.createClass(
        'VideoproofArrayActorModel'
        , ...genericActorMixin
        , ['keyMoments', VideoproofArrayKeyMomentsModel]
        , ...typographyActorMixin
    )
  ;

function _getCellContents(charGroupsData, font, propertyValuesMap) {
    // FIXME: it should maybe have a default value if there's
    // no KeyMoment, as for usability it seems odd that the
    // actor is there but it doesn't show anything. Though,
    // that is also the same case for e.g. the line-of-text actor.
    // However, that could inherit from its parent textContent.
    const cellContents = {chars: [], stateKey: null};
    if((propertyValuesMap.has('generic/charGroup/options'))) {
        // look at the colors, there's a good method that extracts
        // those components from a distributed complex value.
        const charGroup = propertyValuesMap.get('generic/charGroup/options')
           , showExtended = propertyValuesMap.get('generic/charGroup/extended')
           , data = {chars: [], extendedChars: []}
           , cellsStateKeyTokens = []
           ;
        if(charGroup === 'custom') {
            const customText = propertyValuesMap.get('generic/charGroup/customText') || ''
              , customSeparator = propertyValuesMap.get('generic/charGroup/customSeparator') || ''
              ;
            // Escaping is not really necessary, as the customSeparator
            // can be changed if there are clashes with the customText
            data.chars = customText.split(customSeparator);
            data.extendedChars = getExendedChars(charGroupsData, data.chars);
            // Because this is user input and it is not escaped
            // against the cellsStateKey joining character, there
            // can be ambigous keys. I'm adding customSeparator.length
            // and customText.length as further tokens, this way
            // it is possible to restore the original data correctly
            // , as we know the structure, hence the cellsStateKey must
            // be unique.
            cellsStateKeyTokens.push(
                      customSeparator.length, customSeparator
                    , customText.length, customText);
        }
        else
            [data.chars, data.extendedChars] = getCharsForSelectUI(charGroupsData, font, charGroup);
        const hasExtended = data.extendedChars.length;
        cellContents.stateKey = [font.fullName, charGroup
                , showExtended && hasExtended ? '1' : '0'
                , ...cellsStateKeyTokens].join(';');

        cellContents.chars.push(...data.chars);
        if(showExtended && hasExtended)
            cellContents.chars.push(...data.extendedChars);
    }
    return cellContents;
}

export class VideoproofArrayActorRenderer extends _BaseComponent {
    // jshint ignore:start
     static TEMPLATE = `<div class="actor_renderer-videoproof_array fixed-line-breaks">(content not initialized)</div>`;
    // jshint ignore:end
    constructor(widgetBus, charGroupsData) {
        super(widgetBus);
        // This is attached to the ModelType, so we don't have to hard
        // code it in here. This way a different VideoproofArrayActorModel
        // can be used with this same UIElement.
        // See also: UISelectCharGroupInput.
        this._charGroupsData = charGroupsData;
        this._cellsStateKey = null;
        [this.element] = this.initTemplate();
    }
    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          ;
        // ? element.style.setProperty('position', 'absolute');
        this._insertElement(element);
        return [element];
    }

    _updateCells(font, chars) {
        const cells = [];
        for(const char of chars) {
            const cell = this._domTool.createElement('span');
            cell.textContent = char;
            cells.push(cell);
        }
        this.element.replaceChildren(...cells);
        // FIXME: seen this fail when the actor was in a layer with
        // zero width (set explicitly):
        //      TypeError: child is undefined
        //      _fixGridLineBreaks ./lib/js/affixed-line-breaks.mjs:253
        // Maybe a try-catch to safeguard? No width is a case where we
        // don't really require any behavior, but maybe fixGridLineBreaks
        // could still handle the case more gracefully. This is also a
        // good example, how generic actors may need better general
        // error handling.
        fixGridLineBreaks(font, this.element);
    }

    update(changedMap) {
        // console.log(`${this}.update changedMap:`, ...changedMap);
        const propertiesData = [
        //        [DYNAMIC_MARKER, 'numericProperties/x', 'generic/positioningHorizontal', 'px']
        //    , [DYNAMIC_MARKER, 'numericProperties/y', 'generic/positioningVertical', cssPositioningHorizontalPropertyExpander, 'px']
        //    , ['numericProperties/width', 'width', 'px']
        //    , ['numericProperties/height', (element, value, propertiesValueMap, getDefault, useUnit)=>{
        //            let value_;
        //            if(value == '') {
        //                const [, heightTreatment] =_getPropertyValue(
        //                                    propertiesValueMap, getDefault
        //                                    , 'generic/heightTreatment');
        //                // FIXME: in this case, if positioningVertical is not
        //                // set explicitly, it should default to bottom.
        //                value_ =  heightTreatment === 'baselineToBottomFix'
        //                    ? 'calc(1em * var(--ascender) / var(--units-per-em))'
        //                    : ''
        //                    ;
        //            }
        //            else
        //                value_ = value;
        //            element.style.setProperty('height', `${value_}${useUnit ? 'px' : ''}`);
        //        }]
        //    , ['numericProperties/height', 'height', 'px']
                // Doubling height as line-heigth, only makes (partially)
                // sense because this is indeed just a single line of text.
            // , ['numericProperties/height', 'line-height', 'px']
            ['numericProperties/z-index', 'z-index', '',  Math.round]
        //    , ['generic/textAlign', 'text-align', '']
        //    , ['generic/direction', 'direction', '']
        ];

        // if(changedMap.has('font')) {
        //     // This also triggers when font changes in a parent trickle
        //     // down, so these properties should always be set correctly.
        //     const font = changedMap.get('font').value;
        //     this.element.style.setProperty('font-family', `"${font.fullName}"`);
        //     this.element.style.setProperty('--units-per-em', `${font.fontObject.unitsPerEm}`);
        //     this.element.style.setProperty('--ascender', `${font.fontObject.ascender}`);
        //     this.element.style.setProperty('--descender', `${font.fontObject.descender}`);
        // }

        const font = (changedMap.has('font')
                        ? changedMap.get('font')
                        : this.getEntry('font')).value
          ;

        if(changedMap.has('font')) {
            // This also triggers when font changes in a parent trickle
            // down, so these properties should always be set correctly.
            const font = changedMap.get('font').value;
            this.element.style.setProperty('font-family', `"${font.fullName}"`);
        }

        if(changedMap.has('animationProperties@') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('animationProperties@')
                        ? changedMap.get('animationProperties@')
                        : this.getEntry('animationProperties@')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
        //      // , getDefault = property => [true, _getRegisteredPropertySetup(property).default]
              , getDefault = property => {
                    if('numericProperties/width' ===  property
                        || 'numericProperties/height' ===  property
                    )
                        return [false, ''];
                    return [true, getRegisteredPropertySetup(property).default];
                }
              , colorPropertiesMap = [
                      ['colors/backgroundColor', 'background-color']
                    , ['colors/textColor', 'color']
                ]
              ;

            const cellContents = _getCellContents(this._charGroupsData, font, propertyValuesMap)
              , changed =  this._cellsStateKey !== cellContents.stateKey
              ;
            if(changed) {
                this._cellsStateKey = cellContents.stateKey;
                if(cellContents.chars.length)
                    this._updateCells(font, cellContents.chars);
                else
                    this._domTool.clear(this.element);
            }

            actorApplyCSSColors(this.element, propertyValuesMap, getDefault, colorPropertiesMap);
            //  set properties to sample...
            // console.log(`${this.constructor.name}.update propertyValuesMap:`, ...propertyValuesMap);
            // Everything below can basically go only into this blog, as there
            // won't be the bottom kind of properties, at least not for
            // the example
            // console.log(`${this}.update(${[...changedMap.keys()].join(', ')}), propertyValuesMap:`, ...propertyValuesMap);
            // FIXME: also properties that are not explicitly set in here
            // should have a value!
            actorApplyCssProperties(this.element, propertyValuesMap, getDefault, propertiesData);
            setTypographicPropertiesToSample(this.element, propertyValuesMap, true);
        }
    }
}

      // At first this seems to be similar to TypeSettingKeyMomentsModel,
      // however, especially "textRun" is not used here, as we aquire the
      // content from parent and via a different mechanism. E.g. all cells
      // at #2 will get cellcontent #2. similarly, leaving out positioning
      // info for now, as a central control via parent may be better.
      // Thus, for the moment this is identical to TypographyKeyMomentModel.
export const VideoproofArrayV2CellKeyMomentModel = _AbstractStructModel.createClass(
        'VideoproofArrayV2CellKeyMomentModel'
      , ...typographyKeyMomentModelMixin
      // , ['textRun', StringOrEmptyModel]
      // , ['textAlign', TextAlignmentOrEmptyModel]
      // , ['positioningHorizontal', CSSPositioningHorizontalOrEmptyModel]
      // , ['positioningVertical', CSSPositioningVerticalOrEmptyModel]
      // , ['direction', CSSDirectionOrEmptyModel]
      // , ['heightTreatment', HeightTreatmentOrEmptyModel]
    )
  , VideoproofArrayV2CellKeyMomentsModel = _AbstractListModel.createClass('VideoproofArrayV2CellKeyMomentModel', VideoproofArrayV2CellKeyMomentModel)
  , VideoproofArrayV2CellActorModel = _BaseActorModel.createClass(
      'VideoproofArrayV2CellActorModel'
      , ...genericActorMixin
      , ['keyMoments', VideoproofArrayV2CellKeyMomentsModel]
    )
  , [/*referencableActorTypes*/, videoproofArrayActorTypes] = initAvailableActorTypes([
    ['VideoproofArrayV2CellActorModel', 'Videoproof Array Cell', VideoproofArrayV2CellActorModel]
]);

export const VideoproofArrayV2ActorModel = _BaseActorModel.createClass(
    'VideoproofArrayV2ActorModel'
  , ...genericActorMixin
      // TODO: only stuff allowed in VideoproofArrayV2ActorRenderer
      //       which is probably just one very specialized cell-type so far
      //       in that case, we could simplify the actors structure,
      //       but the hope is, that we can build on the existing logic
      //       by using the established structure. Also, makes it better
      //       extendable, i.e. add another cell-level actor type...
    , ... StaticDependency.createWithInternalizedDependency(
        'availableActorTypes'
      , AvailableActorTypesModel
      , videoproofArrayActorTypes
    )
  , ['keyMoments', VideoproofArrayKeyMomentsModel] // LayerActorModel: ['keyMoments', TypeSettingKeyMomentsModel]
  , ...typographyActorMixin
    // ActorModel has an InternalizedDependency to availableActorTypes
    // I believe we can use the original ActorModel if we put the StaticDependency
    // availableActorTypes === videoproofArrayActorTypes into this model.
  , ['activeActors', ActorsModel]
);

export class VideoproofArrayV2CellActorRenderer extends _BaseComponent {
    // jshint ignore:start
     static TEMPLATE = `<div class="actor_renderer-videoproof_array_v2-cell fixed-line-breaks">[?]</div>`;
    // jshint ignore:end
    constructor(widgetBus) {
        super(widgetBus);
        [this.element] = this.initTemplate();
    }
    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          ;
        this._insertElement(element);
        return [element];
    }

    update(changedMap) {
        if(changedMap.has('cellContent@')){
            this.element.textContent = changedMap.get('cellContent@').data;
        }

        const propertiesData = [
        //       [DYNAMIC_MARKER, 'numericProperties/x', 'generic/positioningHorizontal', 'px']
        //    , [DYNAMIC_MARKER, 'numericProperties/y', 'generic/positioningVertical', cssPositioningHorizontalPropertyExpander, 'px']
        //    , ['numericProperties/width', 'width', 'px']
        //    , ['numericProperties/height', (element, value, propertiesValueMap, getDefault, useUnit)=>{
        //            let value_;
        //            if(value == '') {
        //                const [, heightTreatment] =_getPropertyValue(
        //                                    propertiesValueMap, getDefault
        //                                    , 'generic/heightTreatment');
        //                // FIXME: in this case, if positioningVertical is not
        //                // set explicitly, it should default to bottom.
        //                value_ =  heightTreatment === 'baselineToBottomFix'
        //                    ? 'calc(1em * var(--ascender) / var(--units-per-em))'
        //                    : ''
        //                    ;
        //            }
        //            else
        //                value_ = value;
        //            element.style.setProperty('height', `${value_}${useUnit ? 'px' : ''}`);
        //        }]
        //    , ['numericProperties/height', 'height', 'px']
                // Doubling height as line-heigth, only makes (partially)
                // sense because this is indeed just a single line of text.
            // , ['numericProperties/height', 'line-height', 'px']
            ['numericProperties/z-index', 'z-index', '',  Math.round]
        //    , ['generic/textAlign', 'text-align', '']
        //    , ['generic/direction', 'direction', '']
        ];

        // if(changedMap.has('font')) {
        //     // This also triggers when font changes in a parent trickle
        //     // down, so these properties should always be set correctly.
        //     const font = changedMap.get('font').value;
        //     this.element.style.setProperty('font-family', `"${font.fullName}"`);
        //     this.element.style.setProperty('--units-per-em', `${font.fontObject.unitsPerEm}`);
        //     this.element.style.setProperty('--ascender', `${font.fontObject.ascender}`);
        //     this.element.style.setProperty('--descender', `${font.fontObject.descender}`);
        // }

        if(changedMap.has('font')) {
            // This also triggers when font changes in a parent trickle
            // down, so these properties should always be set correctly.
            const font = changedMap.get('font').value;
            this.element.style.setProperty('font-family', `"${font.fullName}"`);
        }


        // FIXME: it doesn't look like globalT is ever coming through here,
        // why did I use it in the first place? Is it bad that it doesn't
        // appear here or is it unneeded to use it here? animationProperties@
        // seems to be responding to changes of globalT.
        if(changedMap.has('animationProperties@') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('animationProperties@')
                        ? changedMap.get('animationProperties@')
                        : this.getEntry('animationProperties@')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              , getDefault = property => {
                    if('numericProperties/width' ===  property
                        || 'numericProperties/height' ===  property
                    )
                        return [false, ''];
                    return [true, getRegisteredPropertySetup(property).default];
                }
              , colorPropertiesMap = [
                      ['colors/backgroundColor', 'background-color']
                    , ['colors/textColor', 'color']
                ]
              ;

            actorApplyCSSColors(this.element, propertyValuesMap, getDefault, colorPropertiesMap);
            //  set properties to sample...
            // console.log(`${this.constructor.name}.update propertyValuesMap:`, ...propertyValuesMap);
            // Everything below can basically go only into this blog, as there
            // won't be the bottom kind of properties, at least not for
            // the example
            // console.log(`${this}.update(${[...changedMap.keys()].join(', ')}), propertyValuesMap:`, ...propertyValuesMap);
            // FIXME: also properties that are not explicitly set in here
            // should have a value!
            actorApplyCssProperties(this.element, propertyValuesMap, getDefault, propertiesData);
            setTypographicPropertiesToSample(this.element, propertyValuesMap, true);
        }
    }
}

/**
 * Actually, this behaves partially like a container and partially
 * like a component.
 *      The children are cells.
 *      Per cell content a cell with cell items is created.
 *      Cell items are layered "activeActors"
 *      actually, these active actors should render themselves into
 *      N cells maybe, on update.
 *      So, in here, I create a list of empty cells, and pass these
 *      along with the cell content (string) for each cell to each child
 *      actor.
 *      The actor renders/updates itself into each cell...
 *
 *      ...
 *      after the actors are rendered, we need to figure out the
 *      widest cell.
 *
 * FIXME: So far this defines initialUpdate and _provisionWidgets and thus
 * it could extend _CommonContainerComponent directly, as _BaseContainerComponent
 * also only defines those methods.
 */
export class VideoproofArrayV2ActorRenderer extends _BaseContainerComponent {
// jshint ignore:start
     static TEMPLATE = `<div class="actor_renderer-videoproof_array_v2 fixed-line-breaks"></div>`;
    // jshint ignore:end
    constructor(widgetBus, _zones, charGroupsData) {
        widgetBus.wrapper.setProtocolHandlerImplementation(
            ...SimpleProtocolHandler.create('cellContent@', {treatAdressAsRootPath: false}));
        const zones = new Map([..._zones]); // becomes this._zones
        super(widgetBus, zones);
        this._cellsStateKey = null;

        // This is attached to the ModelType, so we don't have to hard
        // code it in here. This way a different VideoproofArrayActorModel
        // can be used with this same UIElement.
        // See also: UISelectCharGroupInput.
        this._charGroupsData = charGroupsData;
        this._cellsStateKey = null; // to detect changed contents
        this.cells = [];
        [this.element] = this.initTemplate();
    }
    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          ;
        // ? element.style.setProperty('position', 'absolute');
        this._insertElement(element);
        return [element];
    }

    _createWrapper(settings, dependencyMappings) {
        // look at ActorRendererContainer ...!!!
        // especially for creating/linking animationProperties@
        const childWidgetBus = this._childrenWidgetBus
          , Constructor = VideoproofArrayV2CellActorRenderer
          , args = []
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }

    _updateCells(contents) {
        const cellContentProtocolHandler = this.widgetBus.wrapper.getProtocolHandlerImplementation('cellContent@')
          , newCells = new Set()
          ;
        for(const [index, cellContent] of contents.entries()) {
            const contentId = cellContentProtocolHandler.getId(index);
            if(this.cells[index] === undefined) {
                const container = this._domTool.createElement('div', {
                    'class': `actor_renderer-videoproof_array_v2-zone `
                           + `actor_renderer-videoproof_array_v2-zone_${index}`})
                  , unregister = cellContentProtocolHandler.register(contentId, {data: undefined})
                  ;
                this.cells[index] = { contentId, unregister, cellActors: [] };
                this.element.append(container);
                newCells.add(contentId);
                this._zones.set(contentId, container);
            }
            const component = cellContentProtocolHandler.getRegistered(contentId);
            if(component.data !== cellContent) {
                component.data = cellContent;
                cellContentProtocolHandler.setUpdated(contentId);
            }
        }
        return newCells;
    }

    /*
     * TODO: This runs very often and for each cell on each update, but
     * if it is not required to change the cell structure, we should avoid
     * it. New cells will have to run this regardless, but existing cells
     * should only run it if change is required. The test, whether change
     * is required can be made for one not new cell and be applied to all.
     */
    _updateCellWidgets(activeActors, cell) {
        const {contentId, cellActors} = cell
          , currentCellActors = []
          , newCellWidgets = []
          , deletedCellWidgets = []
          ;
        // OK, doing this with just activeActors won't tell us about
        // the DELETE case.
        for(let length=activeActors.size, index=0; index<length; index++) {
            const actor = activeActors.get(index)
              , cellActor = index < cellActors.length
                    ? cellActors[index]
                    // this means the actor is new
                    : [null, null]
              , [cellActorTypeKey, cellActorWidgetWrapper] = cellActor
              , actorIsNew = cellActorTypeKey === null
              , actorTypeKey = actor.get('actorTypeKey').value
                // Actor-type changed implies another widget-type, but that's
                // just an assumption, there could as well be a widget-type
                // that applies for different actor types and just updates
                // itself accordingly. It's also a stub, as currently in this
                // case there are no different actor types.
                // It could add a bit of flexibility to use the actual
                // widget-type for comparison rather than the actorTypeKey.
              , requireNewWidget = !actorIsNew && cellActorTypeKey !== actorTypeKey
              ;
            if(requireNewWidget)
                // typeChanged => delete, then add
                deletedCellWidgets.push(cellActorWidgetWrapper);
            if(actorIsNew || requireNewWidget) {
                const widgetWrapper = this._createWrapper({
                        rootPath: Path.fromParts('.', 'activeActors',`${index}`, 'instance')
                      , zone: contentId/* ! */
                    }
                  , [
                        [contentId, 'cellContent@']
                      , 'animationProperties@'
                    ]
                );
                this._createWidget(widgetWrapper);
                currentCellActors.push([actorTypeKey, widgetWrapper]);
                newCellWidgets.push(widgetWrapper);
            }
            else { // EQUALS || CHANGED
                currentCellActors.push(cellActor);
                // maintain order
                // FIXME: we should really try to avoid this
                cellActorWidgetWrapper.reinsert();
            }
        }
        return [currentCellActors, newCellWidgets, deletedCellWidgets];
    }

    _provisionWidgets(compareResult) {
        // calculate own changedMap rather thn for a child.
        const changedMap = this.widgetBus.wrapper
                .getChangedMapFromCompareResult(false /*requiresFullInitialUpdate*/, compareResult);
        const font = (changedMap.has('font')
                        ? changedMap.get('font')
                        : this.getEntry('font')).value
          ;
        // FIXME: should rather work without this.widgetBus.rootPath
        // but I can't register "activeActors" directly as dependency in
        // getActorWidgetSetup and I don't currently understand why.
        const activeActors = this.getEntry(this.widgetBus.rootPath.append('activeActors'));

        // somewhere (in update) we need to set cellContent(index, value)
        // and that shout propagate down to the widgets as change
        const animationProperties = changedMap.has('animationProperties@')
                        ? changedMap.get('animationProperties@')
                        : this.getEntry('animationProperties@')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              ;
        const cellContents = _getCellContents(this._charGroupsData, font, propertyValuesMap)
          , changed =  this._cellsStateKey !== cellContents.stateKey
          ;
        if(changed)
            this._cellsStateKey = cellContents.stateKey;

        const contents = cellContents.chars
          , newCells = this._updateCells(contents)
          , _getSecondComponents = array=>array.length ? Array.from(zip(...array))[1] : []
            // cleanup cell level
          , removedCells = this.cells.splice(contents.length)
          , deletedWidgets = []
          ;
        for(const {contentId, unregister, cellActors} of removedCells) {
            const container = this._zones.get(contentId);
            container.remove();
            this._zones.delete(contentId);
            unregister(); // cellContentProtocolHandler._unregister(contentId)
            deletedWidgets.push(..._getSecondComponents(cellActors));
        }


        // compile this from changed actors information
        const requiresFullInitialUpdate = []
            // Depending on the actors diff we can make a fixed function to
            // update existing cells/actors
            // New cells require all new actors anyways.
            // Deleted cells should delete actors as well. -> that is happening already
          , currentWidgets = []
          ;
        // If there's no update in one "legacy" cell, there's no update
        // in any "legacy" cell. Since cells can be hundreds, if not
        // thousands, this is a worthwhile optimization.
        let updateLegacyCells = null;
        for(const cell of this.cells) {
            const isNewCell = newCells.has(cell.contentId);
            if(updateLegacyCells !== false || isNewCell) {
                const [currentCellActors, newCellWidgets, deletedCellWidgets] = this._updateCellWidgets(activeActors, cell);
                deletedWidgets.push(...deletedCellWidgets);
                cell.cellActors.splice(0, Infinity,...currentCellActors);
                requiresFullInitialUpdate.push(...newCellWidgets);
                if(updateLegacyCells === null && !isNewCell) {
                    // This is the first "legacy" cell, if it didn't
                    // have any updates/deletes, we can skip updating
                    // for the other "legacy" cells.
                    updateLegacyCells = newCellWidgets.length !== 0 || deletedCellWidgets.length !== 0;
                }
            }
            currentWidgets.push(..._getSecondComponents(cell.cellActors));

            // Clean up the "rest" when there are now less activeActors
            // active than before.
            // assert activeActors.size === currentCellActors.length
            if(cell.cellActors.length > activeActors.size )
                deletedWidgets.push(..._getSecondComponents(
                            cell.cellActors.splice(activeActors.size )));
        }

        for(const widgetWrapper of deletedWidgets)
            this._destroyWidget(widgetWrapper);
        this._widgets.splice(0, Infinity, ...currentWidgets);
        return new Set(requiresFullInitialUpdate);
    }

    update(...args) {
        this.widgetBus.wrapper.getProtocolHandlerImplementation('cellContent@').resetUpdatedLog();
        super.update(...args);
    }

    // COPY from _BaseDynamicCollectionContainerComponent
    //      BUT the cellContent@ resetUpdatedLog line is added. If this
    //      could be inherited the simpler initialUpdate with the call to
    //      super.initialUpdate(...args); would do the trick.
    // initialUpdate(...args) {
    //     this.widgetBus.wrapper.getProtocolHandlerImplementation('cellContent@').resetUpdatedLog();
    //     super.initialUpdate(...args);
    // }
    // CAUTION _BaseDynamicCollectionContainerComponent has maybe more
    // useful things not yet tested: get modelDependencies() and get dependencies()
    // seem required, but this class so far always has two children by default.
    initialUpdate(rootState) {
        this.widgetBus.wrapper.getProtocolHandlerImplementation('cellContent@').resetUpdatedLog();
        // FIXME: There's a problem as this.dependencies depends on
        // this.activeWidgets(), which is provided partly by running _provisionWidgets
        // and compareResult depends on this.dependencies
        // but maybe we just check all active/non-active widgets? or something else
        // StateComparison.createInitial with appropriate dependencies is
        // quicker but can be run without any dependencies as well.
        let compareResult = StateComparison.createInitial(rootState, this.modelDependencies);
        const requiresFullInitialUpdate = this._provisionWidgets(compareResult);
        if(requiresFullInitialUpdate.size)
            // otherwise compareResult is not updated at this point
            compareResult = StateComparison.createInitial(rootState, this.modelDependencies);
        this._update(compareResult, requiresFullInitialUpdate, true);
    }
}
